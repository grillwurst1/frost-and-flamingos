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
 * detailColor: 4x2 atlas of the owner's painted COLOUR tiles (art/tex/*_color.jpg)
 * normalised to their mean colour (mean = 0.5 grey): planks | log wall | shingles |
 * cobblestone on top, snow | sand | grass | rock below; every 512 px cell holds the
 * tile at 480 px inside a 16 px wrapped gutter. Wood, log, shingle, stone and the
 * natural surfaces multiply their vertex colour by 2x this tile, so the painted
 * grain, strokes and hue shifts show in colour while each part keeps its own
 * albedo (red shutters stay red). uFFColorParams: x strength, y repeats per metre.
 *
 * Terrain (FF_TERRAIN): explicit layer weights from the mesh replace the albedo
 * classification (terrainMixA = snow, sand, grass, rock; terrainMixB = cobble,
 * mud, ice, wet shore). The two strongest layers are sampled from the colour
 * atlas at their own scale and blended with a height-aware mask; snow and sand
 * also get visual-only drift and ripple normals so the cel bands paint blue
 * shade pockets and lilac ripple streaks (the physics heightfield is untouched).
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

// Surface-gradient bump: reuse the already filtered albedo as a shallow
// height signal. Derivatives run unconditionally in main (WGSL parity).
vec3 ffGroundRelief(vec3 normal, vec3 position, float height) {
  vec3 dx = dFdx(position);
  vec3 dy = dFdy(position);
  vec3 r1 = cross(dy, normal);
  vec3 r2 = cross(normal, dx);
  float determinant = dot(dx, r1);
  vec3 gradient = (dFdx(height) * r1 + dFdy(height) * r2) * sign(determinant) / max(abs(determinant), 0.000001);
  return normalize(normal - clamp(gradient, vec3(-0.55), vec3(0.55)));
}

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

// Painted colour tile cell (0 planks, 1 log wall, 2 shingles, 3 cobble, 4 snow,
// 5 sand, 6 grass, 7 rock), 0.5 = neutral. Cells keep a 16/512 wrapped gutter.
const vec2 FF_CELL = vec2(0.25, 0.5);
const float FF_GUTTER = 16.0 / 512.0;
const float FF_INNER = 480.0 / 512.0;
vec3 ffColorTile(vec2 uv, vec2 gx, vec2 gy, float cell) {
  vec2 offset = vec2(mod(cell, 4.0), floor(cell / 4.0)) * FF_CELL;
  vec2 inner = (vec2(FF_GUTTER) + fract(uv) * FF_INNER) * FF_CELL;
  return textureGrad(detailColor, inner + offset, gx * FF_CELL * FF_INNER, gy * FF_CELL * FF_INNER).rgb;
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
    // Natural surfaces take the strongest painted colour tile (snow/sand/grass/rock).
    float strongest = max(max(wB.x, wB.y), max(wB.z, wB.w));
    // World-space map meshes only (like the glitter): mascots and small local-space props keep their own paint.
    colourWeight = smoothstep(0.35, 0.7, strongest) * smoothstep(18.0, 30.0, length(localPos.xz));
    colourCell = wB.x >= strongest ? 4.0 : (wB.y >= strongest ? 5.0 : (wB.z >= strongest ? 6.0 : 7.0));
  } else {
    float id = floor(vertexColor.a * 32.0);
    wA = vec4(ffIsId(id, 1.0), ffIsId(id, 2.0), ffIsId(id, 3.0), ffIsId(id, 4.0));
    wB = vec4(ffIsId(id, 5.0), ffIsId(id, 6.0), ffIsId(id, 7.0), ffIsId(id, 8.0));
    float plaster = ffIsId(id, 9.0) + ffIsId(id, 12.0);
    wC = vec4(plaster + ffIsId(id, 10.0) * 0.4 + ffIsId(id, 11.0) * 0.25, ffIsId(id, 13.0), 0.0, 0.0);
    gloss = ffIsId(id, 10.0) * 0.85 + ffIsId(id, 11.0) * 0.7 + ffIsId(id, 14.0) * 0.9 + ffIsId(id, 15.0) * 1.0;
    sparkleWeight = ffIsId(id, 5.0) + ffIsId(id, 14.0) * 0.6;
    colourWeight = dot(wA, vec4(1.0)) + dot(wB, vec4(1.0));
    colourCell = clamp(id - 1.0, 0.0, 7.0);
  }
  // The colour tiles already carry the painted strokes of natural surfaces.
  wB *= uFFColorParams.x > 0.0 ? 0.35 : 1.0;

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
  albedo += vec3(1.0) * c.a * sparkleWeight * 0.06 * fade;
  hatch = mix(1.0, c.b, fade);
  return albedo;
}
#ifdef FF_TERRAIN
// Layer order: 0 snow, 1 sand, 2 grass, 3 rock, 4 cobble, 5 mud.
vec4 ffTop2(vec4 s, float w, float layer) {
  if (w > s.x) return vec4(w, layer, s.x, s.y);
  if (w > s.z) return vec4(s.x, s.y, w, layer);
  return s;
}

float ffLayerCell(float layer) {
  return layer < 0.5 ? 4.0 : (layer < 1.5 ? 5.0 : (layer < 2.5 ? 6.0 : (layer < 3.5 ? 7.0 : (layer < 4.5 ? 3.0 : 5.0))));
}

/** Repeats per metre: snow 6 m, sand 5 m, grass 4 m, rock 6.5 m, cobble 2.4 m, mud 3.3 m. */
float ffLayerScale(float layer) {
  return layer < 0.5 ? 0.16 : (layer < 1.5 ? 0.2 : (layer < 2.5 ? 0.25 : (layer < 3.5 ? 0.155 : (layer < 4.5 ? 0.42 : 0.3))));
}

vec3 ffLayerTile(float layer, vec2 uv, vec2 gx, vec2 gy, float macroMix, bool antiTile) {
  float cell = ffLayerCell(layer);
  float scale = ffLayerScale(layer);
  vec2 luv = uv * scale;
  vec2 lgx = gx * scale;
  vec2 lgy = gy * scale;
  if (layer > 4.5) {
    // Mud reuses the sand strokes, turned across them so tracks do not read as beach.
    luv = vec2(luv.y, -luv.x) + vec2(0.37, 0.11);
    lgx = vec2(lgx.y, -lgx.x);
    lgy = vec2(lgy.y, -lgy.x);
  }
  vec3 tile = ffColorTile(luv, lgx, lgy, cell);
  if (antiTile) {
    vec3 far = ffColorTile(FF_ROT * (luv * 0.37) + vec2(0.31, 0.57), FF_ROT * (lgx * 0.37), FF_ROT * (lgy * 0.37), cell);
    tile = mix(tile, far, macroMix);
  }
  return tile;
}

/** Visual-only snow drifts (~30 m crescents) and ripples (~6 m), sand ripples (~1.6 m). */
vec3 ffTerrainBump(vec3 n, vec3 p, float snow, float sand, float distanceToCamera) {
  vec2 q = p.xz;
  float level = smoothstep(0.55, 0.85, n.y);
  vec2 grad = vec2(0.0);
  float driftAmount = snow * level * (1.0 - smoothstep(110.0, 260.0, distanceToCamera));
  if (driftAmount > 0.001) {
    float warpArg = q.x * 0.061 + sin(q.y * 0.043) * 1.6;
    float warp = sin(warpArg) * 2.2;
    vec2 dWarp = cos(warpArg) * 2.2 * vec2(0.061, cos(q.y * 0.043) * 1.6 * 0.043);
    float phase = q.y * 0.19 + q.x * 0.083 + warp;
    vec2 dPhase = vec2(0.083, 0.19) + dWarp;
    float envelope = 0.35 + 0.9 * ffDetailNoise(q * 0.021 + 7.3);
    // Sharp-crested drift profile: steep lee side, long windward slope.
    float crest = cos(phase) + 0.45 * cos(phase * 2.0 + 0.6);
    grad += crest * dPhase * (1.6 * envelope * driftAmount);
    float rippleAmount = snow * level * (1.0 - smoothstep(16.0, 48.0, distanceToCamera));
    if (rippleAmount > 0.001) {
      float rippleArg = q.x * 0.84 - q.y * 0.55 + warp * 1.7 + ffDetailNoise(q * 0.12) * 3.0;
      grad += cos(rippleArg) * vec2(0.84, -0.55) * (0.24 * rippleAmount * envelope);
    }
  }
  float sandAmount = sand * level * (1.0 - smoothstep(10.0, 34.0, distanceToCamera));
  if (sandAmount > 0.001) {
    float rippleArg = q.x * 2.6 + q.y * 3.1 + sin(q.x * 0.37 + q.y * 0.21) * 3.0 + ffDetailNoise(q * 0.4) * 2.0;
    grad += cos(rippleArg) * vec2(2.6, 3.1) * (0.085 * sandAmount);
  }
  return normalize(vec3(n.x - grad.x * n.y, n.y, n.z - grad.y * n.y));
}

vec3 ffTerrainSurface(vec4 vertexColor, vec4 mixA, vec4 mixB, vec3 worldPos, inout vec3 normal, out float gloss, out float hatch) {
  vec3 dpx = dFdx(worldPos);
  vec3 dpy = dFdy(worldPos);
  vec3 base = vertexColor.rgb;
  gloss = 0.0;
  hatch = 1.0;
  float distanceToCamera = length(cameraPosition - worldPos);
  if (uFFDetailParams.w < 0.5) return base;

  vec3 an = abs(normal);
  vec2 uv;
  vec2 gx;
  vec2 gy;
  if (an.y > 0.62 || (an.y > an.x && an.y > an.z)) {
    uv = worldPos.xz;
    gx = dpx.xz;
    gy = dpy.xz;
  } else if (an.x > an.z) {
    uv = vec2(worldPos.z, -worldPos.y);
    gx = vec2(dpx.z, -dpx.y);
    gy = vec2(dpy.z, -dpy.y);
  } else {
    uv = vec2(worldPos.x, -worldPos.y);
    gx = vec2(dpx.x, -dpx.y);
    gy = vec2(dpy.x, -dpy.y);
  }

  vec4 top = vec4(-1.0, 0.0, -1.0, 0.0);
  top = ffTop2(top, mixA.x, 0.0);
  top = ffTop2(top, mixA.y, 1.0);
  top = ffTop2(top, mixA.z, 2.0);
  top = ffTop2(top, mixA.w, 3.0);
  top = ffTop2(top, mixB.x, 4.0);
  top = ffTop2(top, mixB.y, 5.0);
  float macroMix = smoothstep(0.3, 0.7, ffDetailNoise(worldPos.xz * 0.037 + 3.1));
  vec3 albedo = base;
  if (uFFColorParams.x > 0.0 && top.x > 0.0) {
    vec3 first = ffLayerTile(top.y, uv, gx, gy, macroMix, true);
    vec3 second = first;
    float blend = 0.0;
    if (top.z > 0.02) {
      second = ffLayerTile(top.w, uv, gx, gy, macroMix, false);
      float lumFirst = dot(first, vec3(0.333));
      float lumSecond = dot(second, vec3(0.333));
      // Height-aware blend: the raised (bright) strokes of the incoming layer win first.
      blend = smoothstep(0.25, 0.75, top.z / max(top.x + top.z, 0.001) + (lumSecond - lumFirst) * 0.7);
    }
    vec3 tile = mix(first, second, blend);
    float coverage = clamp(top.x + top.z, 0.0, 1.0);
    float cliffTexture = mix(1.0, 0.35, mixA.w * (1.0 - smoothstep(0.45, 0.75, normal.y)));
    albedo *= mix(vec3(1.0), clamp(tile * 2.0, 0.0, 1.85), uFFColorParams.x * coverage * (1.0 - mixA.x * 0.75) * cliffTexture);
    // Painterly macroMix variation: broad warm/cool patches like brush washes.
    float wash = ffDetailNoise(worldPos.xz * 0.013 + 11.0) - 0.5;
    albedo *= 1.0 + wash * 0.16 * (1.0 - mixA.x * 0.6);
  }
  // Ice: cyan sheet with white crack lines and a rim glint (gloss).
  if (mixB.z > 0.01) {
    float crack = dot(ffColorTile(uv * 0.34, gx * 0.34, gy * 0.34, 7.0), vec3(0.333));
    float lines = 1.0 - smoothstep(0.18, 0.32, crack);
    albedo = mix(albedo, vec3(0.97, 1.0, 1.0), lines * 0.75 * mixB.z);
    gloss = max(gloss, 0.9 * mixB.z);
  }
  // Wet shore band: darker, glossy sand right at the waterline.
  albedo *= 1.0 - mixB.w * 0.16;
  gloss = max(gloss, mixB.w * 0.45);
  // Lit snow never clips to paper white (keep the painted blue-white).
  float peak = max(albedo.r, max(albedo.g, albedo.b));
  albedo *= mix(1.0, min(1.0, 0.92 / max(peak, 0.001)), clamp(mixA.x * 1.4, 0.0, 1.0));

  vec4 c = textureGrad(detailC, worldPos.xz * uFFDetailScale.z, dpx.xz * uFFDetailScale.z, dpy.xz * uFFDetailScale.z);
  float fade = 1.0 - smoothstep(uFFDetailParams.y, uFFDetailParams.z, distanceToCamera);
  hatch = mix(1.0, c.b, fade);
  albedo += vec3(1.0) * c.a * mixA.x * smoothstep(0.55, 0.85, normal.y) * 0.06 * fade;
  normal = ffTerrainBump(normal, worldPos, mixA.x, mixA.y * (1.0 - mixB.w), distanceToCamera);
  return albedo;
}
#endif

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

fn ffGroundRelief(normal : vec3f, position : vec3f, height : f32) -> vec3f {
  let dx = dpdx(position);
  let dy = dpdy(position);
  let r1 = cross(dy, normal);
  let r2 = cross(normal, dx);
  let determinant = dot(dx, r1);
  let gradient = (dpdx(height) * r1 + dpdy(height) * r2) * sign(determinant) / max(abs(determinant), 0.000001);
  return normalize(normal - clamp(gradient, vec3f(-0.55), vec3f(0.55)));
}

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

const FF_CELL : vec2f = vec2f(0.25, 0.5);
const FF_GUTTER : f32 = 16.0 / 512.0;
const FF_INNER : f32 = 480.0 / 512.0;
fn ffColorTile(uv : vec2f, gx : vec2f, gy : vec2f, cell : f32) -> vec3f {
  let offset = vec2f(cell - 4.0 * floor(cell / 4.0), floor(cell / 4.0)) * FF_CELL;
  let inner = (vec2f(FF_GUTTER) + fract(uv) * FF_INNER) * FF_CELL;
  return textureSampleGrad(detailColor, detailColorSampler, inner + offset, gx * FF_CELL * FF_INNER, gy * FF_CELL * FF_INNER).rgb;
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
    let strongest = max(max(wB.x, wB.y), max(wB.z, wB.w));
    colourWeight = smoothstep(0.35, 0.7, strongest) * smoothstep(18.0, 30.0, length(localPos.xz));
    colourCell = select(select(select(7.0, 6.0, wB.z >= strongest), 5.0, wB.y >= strongest), 4.0, wB.x >= strongest);
  } else {
    let id = floor(vertexColor.a * 32.0);
    wA = vec4f(ffIsId(id, 1.0), ffIsId(id, 2.0), ffIsId(id, 3.0), ffIsId(id, 4.0));
    wB = vec4f(ffIsId(id, 5.0), ffIsId(id, 6.0), ffIsId(id, 7.0), ffIsId(id, 8.0));
    let plaster = ffIsId(id, 9.0) + ffIsId(id, 12.0);
    wC = vec4f(plaster + ffIsId(id, 10.0) * 0.4 + ffIsId(id, 11.0) * 0.25, ffIsId(id, 13.0), 0.0, 0.0);
    result.gloss = ffIsId(id, 10.0) * 0.85 + ffIsId(id, 11.0) * 0.7 + ffIsId(id, 14.0) * 0.9 + ffIsId(id, 15.0) * 1.0;
    sparkleWeight = ffIsId(id, 5.0) + ffIsId(id, 14.0) * 0.6;
    colourWeight = dot(wA, vec4f(1.0)) + dot(wB, vec4f(1.0));
    colourCell = clamp(id - 1.0, 0.0, 7.0);
  }
  wB *= select(1.0, 0.35, uniforms.uFFColorParams.x > 0.0);

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
  albedo += vec3f(1.0) * c.a * sparkleWeight * 0.06 * fade;
  result.albedo = albedo;
  result.hatch = mix(1.0, c.b, fade);
  return result;
}
#ifdef FF_TERRAIN
struct FFTerrain {
  albedo : vec3f,
  gloss : f32,
  hatch : f32,
  normal : vec3f,
};

fn ffTop2(s : vec4f, w : f32, layer : f32) -> vec4f {
  if (w > s.x) { return vec4f(w, layer, s.x, s.y); }
  if (w > s.z) { return vec4f(s.x, s.y, w, layer); }
  return s;
}

fn ffLayerCell(layer : f32) -> f32 {
  if (layer < 0.5) { return 4.0; }
  if (layer < 1.5) { return 5.0; }
  if (layer < 2.5) { return 6.0; }
  if (layer < 3.5) { return 7.0; }
  if (layer < 4.5) { return 3.0; }
  return 5.0;
}

fn ffLayerScale(layer : f32) -> f32 {
  if (layer < 0.5) { return 0.16; }
  if (layer < 1.5) { return 0.2; }
  if (layer < 2.5) { return 0.25; }
  if (layer < 3.5) { return 0.155; }
  if (layer < 4.5) { return 0.42; }
  return 0.3;
}

fn ffLayerTile(layer : f32, uv : vec2f, gx : vec2f, gy : vec2f, macroMix : f32, antiTile : bool) -> vec3f {
  let cell = ffLayerCell(layer);
  let scale = ffLayerScale(layer);
  var luv = uv * scale;
  var lgx = gx * scale;
  var lgy = gy * scale;
  if (layer > 4.5) {
    luv = vec2f(luv.y, -luv.x) + vec2f(0.37, 0.11);
    lgx = vec2f(lgx.y, -lgx.x);
    lgy = vec2f(lgy.y, -lgy.x);
  }
  var tile = ffColorTile(luv, lgx, lgy, cell);
  if (antiTile) {
    let far = ffColorTile(FF_ROT * (luv * 0.37) + vec2f(0.31, 0.57), FF_ROT * (lgx * 0.37), FF_ROT * (lgy * 0.37), cell);
    tile = mix(tile, far, macroMix);
  }
  return tile;
}

fn ffTerrainBump(n : vec3f, p : vec3f, snow : f32, sand : f32, distanceToCamera : f32) -> vec3f {
  let q = p.xz;
  let level = smoothstep(0.55, 0.85, n.y);
  var grad = vec2f(0.0);
  let driftAmount = snow * level * (1.0 - smoothstep(110.0, 260.0, distanceToCamera));
  if (driftAmount > 0.001) {
    let warpArg = q.x * 0.061 + sin(q.y * 0.043) * 1.6;
    let warp = sin(warpArg) * 2.2;
    let dWarp = cos(warpArg) * 2.2 * vec2f(0.061, cos(q.y * 0.043) * 1.6 * 0.043);
    let phase = q.y * 0.19 + q.x * 0.083 + warp;
    let dPhase = vec2f(0.083, 0.19) + dWarp;
    let envelope = 0.35 + 0.9 * ffDetailNoise(q * 0.021 + 7.3);
    let crest = cos(phase) + 0.45 * cos(phase * 2.0 + 0.6);
    grad += crest * dPhase * (1.6 * envelope * driftAmount);
    let rippleAmount = snow * level * (1.0 - smoothstep(16.0, 48.0, distanceToCamera));
    if (rippleAmount > 0.001) {
      let rippleArg = q.x * 0.84 - q.y * 0.55 + warp * 1.7 + ffDetailNoise(q * 0.12) * 3.0;
      grad += cos(rippleArg) * vec2f(0.84, -0.55) * (0.24 * rippleAmount * envelope);
    }
  }
  let sandAmount = sand * level * (1.0 - smoothstep(10.0, 34.0, distanceToCamera));
  if (sandAmount > 0.001) {
    let rippleArg = q.x * 2.6 + q.y * 3.1 + sin(q.x * 0.37 + q.y * 0.21) * 3.0 + ffDetailNoise(q * 0.4) * 2.0;
    grad += cos(rippleArg) * vec2f(2.6, 3.1) * (0.085 * sandAmount);
  }
  return normalize(vec3f(n.x - grad.x * n.y, n.y, n.z - grad.y * n.y));
}

fn ffTerrainSurface(vertexColor : vec4f, mixA : vec4f, mixB : vec4f, worldPos : vec3f, normalIn : vec3f, dpx : vec3f, dpy : vec3f) -> FFTerrain {
  var result : FFTerrain;
  let base = vertexColor.rgb;
  result.albedo = base;
  result.gloss = 0.0;
  result.hatch = 1.0;
  result.normal = normalIn;
  let distanceToCamera = length(uniforms.cameraPosition - worldPos);
  if (uniforms.uFFDetailParams.w < 0.5) { return result; }

  let an = abs(normalIn);
  var uv = worldPos.xz;
  var gx = dpx.xz;
  var gy = dpy.xz;
  if (!(an.y > 0.62 || (an.y > an.x && an.y > an.z))) {
    if (an.x > an.z) {
      uv = vec2f(worldPos.z, -worldPos.y);
      gx = vec2f(dpx.z, -dpx.y);
      gy = vec2f(dpy.z, -dpy.y);
    } else {
      uv = vec2f(worldPos.x, -worldPos.y);
      gx = vec2f(dpx.x, -dpx.y);
      gy = vec2f(dpy.x, -dpy.y);
    }
  }

  var top = vec4f(-1.0, 0.0, -1.0, 0.0);
  top = ffTop2(top, mixA.x, 0.0);
  top = ffTop2(top, mixA.y, 1.0);
  top = ffTop2(top, mixA.z, 2.0);
  top = ffTop2(top, mixA.w, 3.0);
  top = ffTop2(top, mixB.x, 4.0);
  top = ffTop2(top, mixB.y, 5.0);
  let macroMix = smoothstep(0.3, 0.7, ffDetailNoise(worldPos.xz * 0.037 + 3.1));
  var albedo = base;
  if (uniforms.uFFColorParams.x > 0.0 && top.x > 0.0) {
    let first = ffLayerTile(top.y, uv, gx, gy, macroMix, true);
    var second = first;
    var blend = 0.0;
    if (top.z > 0.02) {
      second = ffLayerTile(top.w, uv, gx, gy, macroMix, false);
      let lumFirst = dot(first, vec3f(0.333));
      let lumSecond = dot(second, vec3f(0.333));
      blend = smoothstep(0.25, 0.75, top.z / max(top.x + top.z, 0.001) + (lumSecond - lumFirst) * 0.7);
    }
    let tile = mix(first, second, blend);
    let coverage = clamp(top.x + top.z, 0.0, 1.0);
    let cliffTexture = mix(1.0, 0.35, mixA.w * (1.0 - smoothstep(0.45, 0.75, normalIn.y)));
    albedo = albedo * mix(vec3f(1.0), clamp(tile * 2.0, vec3f(0.0), vec3f(1.85)), uniforms.uFFColorParams.x * coverage * (1.0 - mixA.x * 0.75) * cliffTexture);
    let wash = ffDetailNoise(worldPos.xz * 0.013 + 11.0) - 0.5;
    albedo = albedo * (1.0 + wash * 0.16 * (1.0 - mixA.x * 0.6));
  }
  if (mixB.z > 0.01) {
    let crack = dot(ffColorTile(uv * 0.34, gx * 0.34, gy * 0.34, 7.0), vec3f(0.333));
    let lines = 1.0 - smoothstep(0.18, 0.32, crack);
    albedo = mix(albedo, vec3f(0.97, 1.0, 1.0), lines * 0.75 * mixB.z);
    result.gloss = max(result.gloss, 0.9 * mixB.z);
  }
  albedo = albedo * (1.0 - mixB.w * 0.16);
  result.gloss = max(result.gloss, mixB.w * 0.45);
  let peak = max(albedo.r, max(albedo.g, albedo.b));
  albedo = albedo * mix(1.0, min(1.0, 0.92 / max(peak, 0.001)), clamp(mixA.x * 1.4, 0.0, 1.0));

  let c = textureSampleGrad(detailC, detailCSampler, worldPos.xz * uniforms.uFFDetailScale.z, dpx.xz * uniforms.uFFDetailScale.z, dpy.xz * uniforms.uFFDetailScale.z);
  let fade = 1.0 - smoothstep(uniforms.uFFDetailParams.y, uniforms.uFFDetailParams.z, distanceToCamera);
  result.hatch = mix(1.0, c.b, fade);
  albedo += vec3f(1.0) * c.a * mixA.x * smoothstep(0.55, 0.85, normalIn.y) * 0.06 * fade;
  result.albedo = albedo;
  result.normal = ffTerrainBump(normalIn, worldPos, mixA.x, mixA.y * (1.0 - mixB.w), distanceToCamera);
  return result;
}
#endif
`;
