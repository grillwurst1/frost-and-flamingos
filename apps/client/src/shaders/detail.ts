/**
 * Illustrated surface detail for the shared toon material.
 *
 * Three packed RGBA detail textures are sampled TRIPLANAR in object space
 * (no UVs needed, stable on moving and thin-instanced meshes):
 *
 *   detailA  R planks   G log wall   B shingles   A cobblestone   (tile 4 m)
 *   detailB  R snow     G sand       B grass      A rock          (tile 8 m)
 *   detailC  R brush    G foliage    B hatching   A sparkle       (tile 4 m)
 *
 * Every channel is a luminance modulation around 0.5 (0.5 = neutral). Values
 * near 0 are ink lines (board gaps, mortar, cracks); values near 1 are
 * painted highlights. Which channels apply is decided by the surface id in
 * vertex-colour alpha (see `SURFACE_*` in rendering/materials.ts):
 *
 *   alpha >= 0.75      AUTO: classified from albedo + slope (terrain, untagged props)
 *   alpha < 0.75       explicit id = floor(alpha * 32)
 *
 * GLSL and WGSL blocks must stay equivalent. Both sample with explicit
 * gradients (`textureGrad` / `textureSampleGrad`) from `dFdx/dFdy` (`dpdx/dpdy`)
 * of localPos taken at the top of the host `main`: WGSL needs uniform control
 * flow for implicit derivatives, and the per-pixel dominant-plane switch on
 * medium would otherwise break mip selection along plane seams.
 * Natural surfaces (detailB) get a second rotated, 0.37x copy blended in by
 * low-frequency noise to hide tiling.
 */

export const DETAIL_UNIFORMS = ['uFFDetailParams', 'uFFDetailScale', 'uFFInkColor', 'uFFColorParams'] as const;
export const DETAIL_SAMPLERS = ['detailA', 'detailB', 'detailC', 'detailColor'] as const;

/*
 * detailColor: 2x2 atlas of the owner's painted COLOUR tiles (art/tex/*_color.jpg)
 * normalised to their mean colour (mean = 0.5 grey): planks | log wall / shingles |
 * cobblestone. Wood, log, shingle and stone surfaces multiply their vertex
 * colour by 2x this tile, so the painted grain, knots and hue shifts show in
 * colour while each part keeps its own albedo (red shutters stay red).
 * uFFColorParams: x strength, y repeats per metre.
 */

export const DETAIL_FRAGMENT_GLSL = /* glsl */ `
uniform sampler2D detailA;
uniform sampler2D detailB;
uniform sampler2D detailC;
uniform vec4 uFFDetailParams;
uniform vec4 uFFDetailScale;
uniform vec4 uFFInkColor;
uniform sampler2D detailColor;
uniform vec4 uFFColorParams;

float ffIsId(float id, float k) {
  return 1.0 - step(0.5, abs(id - k));
}

vec2 ffPlaneUv(vec3 p, int axis) {
  if (axis == 0) return vec2(p.z, -p.y);
  if (axis == 1) return vec2(p.x, p.z);
  return vec2(p.x, -p.y);
}

// Explicit-gradient sampling (same as the WGSL path): the derivatives are taken
// once in main, so the per-pixel dominant-plane switch never breaks mip selection.
vec4 ffSampleGrad(sampler2D tex, vec3 p, vec3 dpx, vec3 dpy, int axis, float scale) {
  return textureGrad(tex, ffPlaneUv(p, axis) * scale, ffPlaneUv(dpx, axis) * scale, ffPlaneUv(dpy, axis) * scale);
}

vec4 ffTriplanar(sampler2D tex, vec3 p, vec3 dpx, vec3 dpy, vec3 w, float scale) {
  return ffSampleGrad(tex, p, dpx, dpy, 0, scale) * w.x
    + ffSampleGrad(tex, p, dpx, dpy, 1, scale) * w.y
    + ffSampleGrad(tex, p, dpx, dpy, 2, scale) * w.z;
}

int ffDominantAxis(vec3 w) {
  if (w.x > w.y && w.x > w.z) return 0;
  if (w.y > w.z) return 1;
  return 2;
}

// Anti-tiling: a second, larger and rotated copy of the tile blended in by
// low-frequency noise, so big snowfields and beaches do not repeat visibly.
const mat2 FF_ROT = mat2(0.7986, 0.6018, -0.6018, 0.7986);

// Polynomial hash (no transcendentals: reproducible on every backend).
float ffDetailHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float ffDetailNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = ffDetailHash(i);
  float b = ffDetailHash(i + vec2(1.0, 0.0));
  float c = ffDetailHash(i + vec2(0.0, 1.0));
  float d = ffDetailHash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

vec4 ffAntiTile(sampler2D tex, vec3 p, vec3 dpx, vec3 dpy, int axis, float scale, float blend) {
  vec2 uv = ffPlaneUv(p, axis) * scale;
  vec2 gx = ffPlaneUv(dpx, axis) * scale;
  vec2 gy = ffPlaneUv(dpy, axis) * scale;
  vec4 near = textureGrad(tex, uv, gx, gy);
  vec4 far = textureGrad(tex, FF_ROT * (uv * 0.37) + vec2(0.31, 0.57), FF_ROT * (gx * 0.37), FF_ROT * (gy * 0.37));
  vec4 mixed = mix(near, far, blend);
  float spread = 1.0 + 0.35 * (1.0 - abs(blend * 2.0 - 1.0));
  return (mixed - 0.5) * spread + 0.5;
}

vec4 ffTriplanarAT(sampler2D tex, vec3 p, vec3 dpx, vec3 dpy, vec3 w, float scale, float blend) {
  return ffAntiTile(tex, p, dpx, dpy, 0, scale, blend) * w.x
    + ffAntiTile(tex, p, dpx, dpy, 1, scale, blend) * w.y
    + ffAntiTile(tex, p, dpx, dpy, 2, scale, blend) * w.z;
}

// Painted colour tile cell (0 planks, 1 log wall, 2 shingles, 3 cobble), 0.5 = neutral.
vec3 ffColorTile(vec2 uv, vec2 gx, vec2 gy, float cell) {
  vec2 offset = vec2(mod(cell, 2.0), floor(cell / 2.0)) * 0.5;
  return textureGrad(detailColor, fract(uv) * 0.5 + offset, gx * 0.5, gy * 0.5).rgb;
}

// Returns albedo in rgb and a packed extra in the out params.
vec3 ffSurface(vec4 vertexColor, vec3 localPos, vec3 localNormal, vec3 worldPos, vec3 dpx, vec3 dpy, out float gloss, out float hatch) {
  vec3 base = vertexColor.rgb;
  gloss = 0.0;
  hatch = 1.0;
  float mode = uFFDetailParams.w;
  if (mode < 0.5) return base;

  vec3 an = abs(normalize(localNormal));
  vec3 w = pow(an, vec3(4.0));
  w /= max(w.x + w.y + w.z, 0.0001);

  float tileBlend = smoothstep(0.32, 0.68, ffDetailNoise(worldPos.xz * 0.045 + worldPos.y * 0.02));
  vec4 a;
  vec4 b;
  vec4 c;
  if (mode > 1.5) {
    a = ffTriplanar(detailA, localPos, dpx, dpy, w, uFFDetailScale.x);
    b = ffTriplanarAT(detailB, localPos, dpx, dpy, w, uFFDetailScale.y, tileBlend);
    c = ffTriplanar(detailC, localPos, dpx, dpy, w, uFFDetailScale.z);
  } else {
    int axis = ffDominantAxis(w);
    a = ffSampleGrad(detailA, localPos, dpx, dpy, axis, uFFDetailScale.x);
    b = ffAntiTile(detailB, localPos, dpx, dpy, axis, uFFDetailScale.y, tileBlend);
    c = ffSampleGrad(detailC, localPos, dpx, dpy, axis, uFFDetailScale.z);
  }

  float maxC = max(base.r, max(base.g, base.b));
  float minC = min(base.r, min(base.g, base.b));
  float saturation = (maxC - minC) / max(maxC, 0.001);
  float luma = dot(base, vec3(0.299, 0.587, 0.114));
  float up = clamp(normalize(localNormal).y, 0.0, 1.0);

  vec4 wA = vec4(0.0);
  vec4 wB = vec4(0.0);
  vec4 wC = vec4(0.0);
  float sparkleWeight = 0.0;
  float colourWeight = 0.0;
  float colourCell = 0.0;
  if (vertexColor.a >= 0.75) {
    float snow = smoothstep(0.74, 0.86, luma) * (1.0 - smoothstep(0.1, 0.24, saturation));
    float warm = step(base.b, base.g) * step(base.g, base.r);
    float sand = warm * smoothstep(0.55, 0.68, luma) * smoothstep(0.14, 0.24, saturation) * (1.0 - smoothstep(0.55, 0.7, saturation));
    float wood = warm * (1.0 - smoothstep(0.46, 0.58, luma)) * smoothstep(0.3, 0.42, saturation);
    float green = step(base.r, base.g) * step(base.b, base.g) * smoothstep(0.12, 0.25, saturation);
    float foliage = green * (1.0 - smoothstep(0.3, 0.42, luma));
    float grass = green * (1.0 - foliage);
    float grey = (1.0 - smoothstep(0.1, 0.2, saturation)) * (1.0 - snow);
    float rock = grey * smoothstep(0.2, 0.3, luma) * mix(0.55, 1.0, 1.0 - up);
    float total = snow + sand + wood + foliage + grass + rock;
    float brush = clamp(1.0 - total, 0.0, 1.0);
    total += brush;
    wA = vec4(0.0, wood, 0.0, 0.0) / total;
    wB = vec4(snow, sand, grass, rock) / total;
    wC = vec4(brush, foliage, 0.0, 0.0) / total;
    // Glitter only on big world-space meshes (terrain, merged map props), not on
    // small local-space objects such as mascots, vehicles or instanced props.
    sparkleWeight = snow * smoothstep(0.55, 0.85, up) * smoothstep(18.0, 30.0, length(localPos.xz));
  } else {
    float id = floor(vertexColor.a * 32.0);
    wA = vec4(ffIsId(id, 1.0), ffIsId(id, 2.0), ffIsId(id, 3.0), ffIsId(id, 4.0));
    wB = vec4(ffIsId(id, 5.0), ffIsId(id, 6.0), ffIsId(id, 7.0), ffIsId(id, 8.0));
    float plaster = ffIsId(id, 9.0) + ffIsId(id, 12.0);
    wC = vec4(plaster + ffIsId(id, 10.0) * 0.4 + ffIsId(id, 11.0) * 0.25, ffIsId(id, 13.0), 0.0, 0.0);
    gloss = ffIsId(id, 10.0) * 0.85 + ffIsId(id, 11.0) * 0.7 + ffIsId(id, 14.0) * 0.9 + ffIsId(id, 15.0) * 1.0;
    sparkleWeight = ffIsId(id, 5.0) + ffIsId(id, 14.0) * 0.6;
    colourWeight = ffIsId(id, 1.0) + ffIsId(id, 2.0) + ffIsId(id, 3.0) + ffIsId(id, 4.0);
    colourCell = clamp(id - 1.0, 0.0, 3.0);
  }

  float value = dot(a, wA) + dot(b, wB) + dot(c, wC);
  float weight = dot(wA, vec4(1.0)) + dot(wB, vec4(1.0)) + dot(wC, vec4(1.0));
  value += 0.5 * (1.0 - clamp(weight, 0.0, 1.0));

  float distanceToCamera = length(cameraPosition - worldPos);
  float fade = 1.0 - smoothstep(uFFDetailParams.y, uFFDetailParams.z, distanceToCamera);
  float strength = uFFDetailParams.x * fade;
  float delta = (value - 0.5) * 2.0 * strength;
  vec3 darkTint = ffShadeTint(base) * 0.8;
  vec3 albedo = delta < 0.0 ? mix(base, base * darkTint, min(-delta * 1.25, 1.0)) : base * (1.0 + delta * 0.6);
  if (colourWeight > 0.0 && uFFColorParams.x > 0.0) {
    int axis = ffDominantAxis(w);
    float scale = uFFColorParams.y;
    vec3 tile = ffColorTile(ffPlaneUv(localPos, axis) * scale, ffPlaneUv(dpx, axis) * scale, ffPlaneUv(dpy, axis) * scale, colourCell);
    albedo *= mix(vec3(1.0), clamp(tile * 2.0, 0.0, 1.8), colourWeight * uFFColorParams.x * fade);
  }
  float ink = (1.0 - smoothstep(0.07, 0.2, value)) * strength * uFFDetailScale.w;
  albedo = mix(albedo, uFFInkColor.rgb, ink * 0.7);
  albedo += vec3(1.0) * c.a * sparkleWeight * 0.85 * fade;
  hatch = mix(1.0, c.b, fade);
  return albedo;
}
`;

export const DETAIL_FRAGMENT_WGSL = /* wgsl */ `
var detailASampler : sampler;
var detailA : texture_2d<f32>;
var detailBSampler : sampler;
var detailB : texture_2d<f32>;
var detailCSampler : sampler;
var detailC : texture_2d<f32>;
uniform uFFDetailParams : vec4f;
uniform uFFDetailScale : vec4f;
uniform uFFInkColor : vec4f;
var detailColorSampler : sampler;
var detailColor : texture_2d<f32>;
uniform uFFColorParams : vec4f;

struct FFSurface {
  albedo : vec3f,
  gloss : f32,
  hatch : f32,
};

fn ffIsId(id : f32, k : f32) -> f32 {
  return 1.0 - step(0.5, abs(id - k));
}

fn ffPlaneUv(p : vec3f, axis : i32) -> vec2f {
  if (axis == 0) { return vec2f(p.z, -p.y); }
  if (axis == 1) { return vec2f(p.x, p.z); }
  return vec2f(p.x, -p.y);
}

// Explicit-gradient sampling: the derivatives are taken once at the top of
// main (uniform control flow), so these helpers may run inside branches.
fn ffSampleGrad(tex : texture_2d<f32>, samp : sampler, p : vec3f, dpx : vec3f, dpy : vec3f, axis : i32, scale : f32) -> vec4f {
  return textureSampleGrad(tex, samp, ffPlaneUv(p, axis) * scale, ffPlaneUv(dpx, axis) * scale, ffPlaneUv(dpy, axis) * scale);
}

fn ffTriplanar(tex : texture_2d<f32>, samp : sampler, p : vec3f, dpx : vec3f, dpy : vec3f, w : vec3f, scale : f32) -> vec4f {
  return ffSampleGrad(tex, samp, p, dpx, dpy, 0, scale) * w.x
    + ffSampleGrad(tex, samp, p, dpx, dpy, 1, scale) * w.y
    + ffSampleGrad(tex, samp, p, dpx, dpy, 2, scale) * w.z;
}

fn ffColorTile(uv : vec2f, gx : vec2f, gy : vec2f, cell : f32) -> vec3f {
  let offset = vec2f(cell - 2.0 * floor(cell / 2.0), floor(cell / 2.0)) * 0.5;
  return textureSampleGrad(detailColor, detailColorSampler, fract(uv) * 0.5 + offset, gx * 0.5, gy * 0.5).rgb;
}

fn ffDominantAxis(w : vec3f) -> i32 {
  if (w.x > w.y && w.x > w.z) { return 0; }
  if (w.y > w.z) { return 1; }
  return 2;
}

const FF_ROT : mat2x2f = mat2x2f(0.7986, 0.6018, -0.6018, 0.7986);

// Polynomial hash (no transcendentals: reproducible on every backend).
fn ffDetailHash(p : vec2f) -> f32 {
  var p3 = fract(vec3f(p.x, p.y, p.x) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

fn ffDetailNoise(p : vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  let a = ffDetailHash(i);
  let b = ffDetailHash(i + vec2f(1.0, 0.0));
  let c = ffDetailHash(i + vec2f(0.0, 1.0));
  let d = ffDetailHash(i + vec2f(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

fn ffAntiTile(tex : texture_2d<f32>, samp : sampler, p : vec3f, dpx : vec3f, dpy : vec3f, axis : i32, scale : f32, blend : f32) -> vec4f {
  let uv = ffPlaneUv(p, axis) * scale;
  let gx = ffPlaneUv(dpx, axis) * scale;
  let gy = ffPlaneUv(dpy, axis) * scale;
  let near = textureSampleGrad(tex, samp, uv, gx, gy);
  let far = textureSampleGrad(tex, samp, FF_ROT * (uv * 0.37) + vec2f(0.31, 0.57), FF_ROT * (gx * 0.37), FF_ROT * (gy * 0.37));
  let mixed = mix(near, far, blend);
  let spread = 1.0 + 0.35 * (1.0 - abs(blend * 2.0 - 1.0));
  return (mixed - 0.5) * spread + 0.5;
}

fn ffTriplanarAT(tex : texture_2d<f32>, samp : sampler, p : vec3f, dpx : vec3f, dpy : vec3f, w : vec3f, scale : f32, blend : f32) -> vec4f {
  return ffAntiTile(tex, samp, p, dpx, dpy, 0, scale, blend) * w.x
    + ffAntiTile(tex, samp, p, dpx, dpy, 1, scale, blend) * w.y
    + ffAntiTile(tex, samp, p, dpx, dpy, 2, scale, blend) * w.z;
}

fn ffSurface(vertexColor : vec4f, localPos : vec3f, localNormal : vec3f, worldPos : vec3f, dpx : vec3f, dpy : vec3f) -> FFSurface {
  var result : FFSurface;
  let base = vertexColor.rgb;
  result.albedo = base;
  result.gloss = 0.0;
  result.hatch = 1.0;
  let mode = uniforms.uFFDetailParams.w;
  if (mode < 0.5) { return result; }

  let an = abs(normalize(localNormal));
  var w = pow(an, vec3f(4.0));
  w /= max(w.x + w.y + w.z, 0.0001);

  let tileBlend = smoothstep(0.32, 0.68, ffDetailNoise(worldPos.xz * 0.045 + worldPos.y * 0.02));
  var a : vec4f;
  var b : vec4f;
  var c : vec4f;
  if (mode > 1.5) {
    a = ffTriplanar(detailA, detailASampler, localPos, dpx, dpy, w, uniforms.uFFDetailScale.x);
    b = ffTriplanarAT(detailB, detailBSampler, localPos, dpx, dpy, w, uniforms.uFFDetailScale.y, tileBlend);
    c = ffTriplanar(detailC, detailCSampler, localPos, dpx, dpy, w, uniforms.uFFDetailScale.z);
  } else {
    let axis = ffDominantAxis(w);
    a = ffSampleGrad(detailA, detailASampler, localPos, dpx, dpy, axis, uniforms.uFFDetailScale.x);
    b = ffAntiTile(detailB, detailBSampler, localPos, dpx, dpy, axis, uniforms.uFFDetailScale.y, tileBlend);
    c = ffSampleGrad(detailC, detailCSampler, localPos, dpx, dpy, axis, uniforms.uFFDetailScale.z);
  }

  let maxC = max(base.r, max(base.g, base.b));
  let minC = min(base.r, min(base.g, base.b));
  let saturation = (maxC - minC) / max(maxC, 0.001);
  let luma = dot(base, vec3f(0.299, 0.587, 0.114));
  let up = clamp(normalize(localNormal).y, 0.0, 1.0);

  var wA = vec4f(0.0);
  var wB = vec4f(0.0);
  var wC = vec4f(0.0);
  var sparkleWeight = 0.0;
  var colourWeight = 0.0;
  var colourCell = 0.0;
  if (vertexColor.a >= 0.75) {
    let snow = smoothstep(0.74, 0.86, luma) * (1.0 - smoothstep(0.1, 0.24, saturation));
    let warm = step(base.b, base.g) * step(base.g, base.r);
    let sand = warm * smoothstep(0.55, 0.68, luma) * smoothstep(0.14, 0.24, saturation) * (1.0 - smoothstep(0.55, 0.7, saturation));
    let wood = warm * (1.0 - smoothstep(0.46, 0.58, luma)) * smoothstep(0.3, 0.42, saturation);
    let green = step(base.r, base.g) * step(base.b, base.g) * smoothstep(0.12, 0.25, saturation);
    let foliage = green * (1.0 - smoothstep(0.3, 0.42, luma));
    let grass = green * (1.0 - foliage);
    let grey = (1.0 - smoothstep(0.1, 0.2, saturation)) * (1.0 - snow);
    let rock = grey * smoothstep(0.2, 0.3, luma) * mix(0.55, 1.0, 1.0 - up);
    var total = snow + sand + wood + foliage + grass + rock;
    let brush = clamp(1.0 - total, 0.0, 1.0);
    total += brush;
    wA = vec4f(0.0, wood, 0.0, 0.0) / total;
    wB = vec4f(snow, sand, grass, rock) / total;
    wC = vec4f(brush, foliage, 0.0, 0.0) / total;
    // Glitter only on big world-space meshes (terrain, merged map props), not on
    // small local-space objects such as mascots, vehicles or instanced props.
    sparkleWeight = snow * smoothstep(0.55, 0.85, up) * smoothstep(18.0, 30.0, length(localPos.xz));
  } else {
    let id = floor(vertexColor.a * 32.0);
    wA = vec4f(ffIsId(id, 1.0), ffIsId(id, 2.0), ffIsId(id, 3.0), ffIsId(id, 4.0));
    wB = vec4f(ffIsId(id, 5.0), ffIsId(id, 6.0), ffIsId(id, 7.0), ffIsId(id, 8.0));
    let plaster = ffIsId(id, 9.0) + ffIsId(id, 12.0);
    wC = vec4f(plaster + ffIsId(id, 10.0) * 0.4 + ffIsId(id, 11.0) * 0.25, ffIsId(id, 13.0), 0.0, 0.0);
    result.gloss = ffIsId(id, 10.0) * 0.85 + ffIsId(id, 11.0) * 0.7 + ffIsId(id, 14.0) * 0.9 + ffIsId(id, 15.0) * 1.0;
    sparkleWeight = ffIsId(id, 5.0) + ffIsId(id, 14.0) * 0.6;
    colourWeight = ffIsId(id, 1.0) + ffIsId(id, 2.0) + ffIsId(id, 3.0) + ffIsId(id, 4.0);
    colourCell = clamp(id - 1.0, 0.0, 3.0);
  }

  var value = dot(a, wA) + dot(b, wB) + dot(c, wC);
  let weight = dot(wA, vec4f(1.0)) + dot(wB, vec4f(1.0)) + dot(wC, vec4f(1.0));
  value += 0.5 * (1.0 - clamp(weight, 0.0, 1.0));

  let distanceToCamera = length(uniforms.cameraPosition - worldPos);
  let fade = 1.0 - smoothstep(uniforms.uFFDetailParams.y, uniforms.uFFDetailParams.z, distanceToCamera);
  let strength = uniforms.uFFDetailParams.x * fade;
  let delta = (value - 0.5) * 2.0 * strength;
  let darkTint = ffShadeTint(base) * 0.8;
  var albedo = select(base * (1.0 + delta * 0.6), mix(base, base * darkTint, min(-delta * 1.25, 1.0)), delta < 0.0);
  if (colourWeight > 0.0 && uniforms.uFFColorParams.x > 0.0) {
    let axis = ffDominantAxis(w);
    let scale = uniforms.uFFColorParams.y;
    let tile = ffColorTile(ffPlaneUv(localPos, axis) * scale, ffPlaneUv(dpx, axis) * scale, ffPlaneUv(dpy, axis) * scale, colourCell);
    albedo = albedo * mix(vec3f(1.0), clamp(tile * 2.0, vec3f(0.0), vec3f(1.8)), colourWeight * uniforms.uFFColorParams.x * fade);
  }
  let ink = (1.0 - smoothstep(0.07, 0.2, value)) * strength * uniforms.uFFDetailScale.w;
  albedo = mix(albedo, uniforms.uFFInkColor.rgb, ink * 0.7);
  albedo += vec3f(1.0) * c.a * sparkleWeight * 0.85 * fade;
  result.albedo = albedo;
  result.hatch = mix(1.0, c.b, fade);
  return result;
}
`;
