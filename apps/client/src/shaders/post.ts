/**
 * Painterly post stack (see rendering/scene-look.ts for the pass order):
 *
 *   1. ffPaint  (high/medium) generalized Kuwahara with 8 overlapping
 *      sectors sampled on polar rings (the centre plus 16 taps per ring; 3
 *      rings on high, 2 on medium). Flattens surfaces into brush-like patches while keeping
 *      hard colour edges, so the frame reads as paint.
 *   2. ffComic  (all tiers) screen-space ink outlines from the geometry
 *      buffer (depth + view normals), hand-drawn wobble and width variation,
 *      paper grain, colour grading towards the reference palette, vignette.
 *
 * Both passes exist in GLSL and WGSL; keep them equivalent. Post-process UVs
 * follow the Babylon convention (vUV.y = 0 at the bottom) on both APIs.
 *
 * Scene-alpha look mask (opaque materials write it into the scene target):
 *   alpha 1    world: the full painterly look.
 *   alpha 0    stylised character (painted GLB soldiers; procedural rigs and
 *              mascots can opt in): the paint filter keeps 85 % of the
 *              original detail, no sharpen, no interior normal-edge ink,
 *              paper grain reduced. The figure gets a bold silhouette: ink
 *              where the mask changes between character and anything else
 *              (depth-gated, so translucent effects over a character draw
 *              none), 1.25× the world's outline width, on every tier.
 *   There is deliberately no "fully exempt" level: blended surfaces over a
 *   character (water, smoke) leave alpha = their own alpha there, so any
 *   in-band value can be produced by accident. A photoreal exemption needs
 *   an out-of-band signal (stencil or a geometry-buffer channel).
 * ffPaint passes the alpha through; ffComic writes alpha 1 so the canvas
 * stays opaque.
 */

export const PAINT_UNIFORMS = ['uTexel', 'uPaintParams'] as const;

export const paintFragmentGLSL = /* glsl */ `
precision highp float;

varying vec2 vUV;
uniform sampler2D textureSampler;
uniform vec2 uTexel;
uniform vec4 uPaintParams;

// Rings of 16 taps at j * TAU / 16; ring 2 is staggered by half a step
// (TAU / 32). Sector k (45 degrees) owns taps j = 2k and 2k + 1 of every ring,
// so it is summed directly and the +-1 neighbour spread (0.4) is applied once
// after sampling: no runtime-indexed arrays, no per-tap trigonometry.
const vec2 FF_HALF_STEP = vec2(0.98078528, 0.19509032);

// x = stylised-character weight, y = reserved (no exempt level: blends over a
// character can produce any alpha, so an in-band value could false-trigger).
vec2 ffLookMask(vec2 uv, float a0) {
  return vec2(1.0 - a0, 0.0);
}

vec2 ffStagger(vec2 d) {
  return vec2(d.x * FF_HALF_STEP.x - d.y * FF_HALF_STEP.y, d.x * FF_HALF_STEP.y + d.y * FF_HALF_STEP.x);
}

// Colour sum (s) and squared-colour sum (q) of one sector over all rings.
void ffSector(vec2 a, vec2 b, vec2 ringStep, float rings, out vec3 s, out vec3 q) {
  vec3 c0 = texture2D(textureSampler, vUV + a * ringStep).rgb;
  vec3 c1 = texture2D(textureSampler, vUV + b * ringStep).rgb;
  s = c0 + c1;
  q = c0 * c0 + c1 * c1;
  if (rings > 1.5) {
    vec3 c2 = texture2D(textureSampler, vUV + ffStagger(a) * ringStep * 2.0).rgb;
    vec3 c3 = texture2D(textureSampler, vUV + ffStagger(b) * ringStep * 2.0).rgb;
    s += c2 + c3;
    q += c2 * c2 + c3 * c3;
  }
  if (rings > 2.5) {
    vec3 c4 = texture2D(textureSampler, vUV + a * ringStep * 3.0).rgb;
    vec3 c5 = texture2D(textureSampler, vUV + b * ringStep * 3.0).rgb;
    s += c4 + c5;
    q += c4 * c4 + c5 * c5;
  }
}

// Weighted sector mean (rgb) and its Kuwahara weight (a).
vec4 ffBlend(vec3 center, vec3 center2, vec3 s, vec3 q, vec3 sl, vec3 ql, vec3 sr, vec3 qr, float invWeight) {
  vec3 m = (center + s + 0.4 * (sl + sr)) * invWeight;
  vec3 v = abs((center2 + q + 0.4 * (ql + qr)) * invWeight - m * m);
  float sigma = (v.r + v.g + v.b) * uPaintParams.z;
  float w = 1.0 / (1.0 + sigma * sigma * sigma * sigma);
  return vec4(m * w, w);
}

void main(void) {
  vec4 c0 = texture2D(textureSampler, vUV);
  vec3 center = c0.rgb;
  vec2 lookMask = ffLookMask(vUV, c0.a);
  float charMask = lookMask.x;
  float rings = clamp(floor(uPaintParams.y), 1.0, 3.0);
  vec2 ringStep = uTexel * (uPaintParams.x / rings);
  vec3 s0; vec3 q0; vec3 s1; vec3 q1; vec3 s2; vec3 q2; vec3 s3; vec3 q3;
  vec3 s4; vec3 q4; vec3 s5; vec3 q5; vec3 s6; vec3 q6; vec3 s7; vec3 q7;
  ffSector(vec2(1.0, 0.0), vec2(0.92387953, 0.38268343), ringStep, rings, s0, q0);
  ffSector(vec2(0.70710678, 0.70710678), vec2(0.38268343, 0.92387953), ringStep, rings, s1, q1);
  ffSector(vec2(0.0, 1.0), vec2(-0.38268343, 0.92387953), ringStep, rings, s2, q2);
  ffSector(vec2(-0.70710678, 0.70710678), vec2(-0.92387953, 0.38268343), ringStep, rings, s3, q3);
  ffSector(vec2(-1.0, 0.0), vec2(-0.92387953, -0.38268343), ringStep, rings, s4, q4);
  ffSector(vec2(-0.70710678, -0.70710678), vec2(-0.38268343, -0.92387953), ringStep, rings, s5, q5);
  ffSector(vec2(0.0, -1.0), vec2(0.38268343, -0.92387953), ringStep, rings, s6, q6);
  ffSector(vec2(0.70710678, -0.70710678), vec2(0.92387953, -0.38268343), ringStep, rings, s7, q7);
  // Every sector weighs the centre once plus 2 + 0.4 * 4 taps per ring.
  float invWeight = 1.0 / (1.0 + 3.6 * rings);
  vec3 c2 = center * center;
  vec4 acc = ffBlend(center, c2, s0, q0, s7, q7, s1, q1, invWeight);
  acc += ffBlend(center, c2, s1, q1, s0, q0, s2, q2, invWeight);
  acc += ffBlend(center, c2, s2, q2, s1, q1, s3, q3, invWeight);
  acc += ffBlend(center, c2, s3, q3, s2, q2, s4, q4, invWeight);
  acc += ffBlend(center, c2, s4, q4, s3, q3, s5, q5, invWeight);
  acc += ffBlend(center, c2, s5, q5, s4, q4, s6, q6, invWeight);
  acc += ffBlend(center, c2, s6, q6, s5, q5, s7, q7, invWeight);
  acc += ffBlend(center, c2, s7, q7, s6, q6, s0, q0, invWeight);
  vec3 painted = acc.rgb / max(acc.a, 0.0001);
  gl_FragColor = vec4(mix(center, painted, uPaintParams.w * (1.0 - 0.85 * charMask) * (1.0 - lookMask.y)), c0.a);
}
`;

export const paintFragmentWGSL = /* wgsl */ `
varying vUV : vec2f;
var textureSamplerSampler : sampler;
var textureSampler : texture_2d<f32>;
uniform uTexel : vec2f;
uniform uPaintParams : vec4f;

const FF_HALF_STEP : vec2f = vec2f(0.98078528, 0.19509032);

struct FFSectorSum {
  s : vec3f,
  q : vec3f,
};

fn ffLookMask(uv : vec2f, a0 : f32) -> vec2f {
  return vec2f(1.0 - a0, 0.0);
}

fn ffStagger(d : vec2f) -> vec2f {
  return vec2f(d.x * FF_HALF_STEP.x - d.y * FF_HALF_STEP.y, d.x * FF_HALF_STEP.y + d.y * FF_HALF_STEP.x);
}

fn ffTap(uv : vec2f) -> vec3f {
  return textureSampleLevel(textureSampler, textureSamplerSampler, uv, 0.0).rgb;
}

fn ffSector(uv : vec2f, a : vec2f, b : vec2f, ringStep : vec2f, rings : f32) -> FFSectorSum {
  let c0 = ffTap(uv + a * ringStep);
  let c1 = ffTap(uv + b * ringStep);
  var sum : FFSectorSum;
  sum.s = c0 + c1;
  sum.q = c0 * c0 + c1 * c1;
  if (rings > 1.5) {
    let c2 = ffTap(uv + ffStagger(a) * ringStep * 2.0);
    let c3 = ffTap(uv + ffStagger(b) * ringStep * 2.0);
    sum.s += c2 + c3;
    sum.q += c2 * c2 + c3 * c3;
  }
  if (rings > 2.5) {
    let c4 = ffTap(uv + a * ringStep * 3.0);
    let c5 = ffTap(uv + b * ringStep * 3.0);
    sum.s += c4 + c5;
    sum.q += c4 * c4 + c5 * c5;
  }
  return sum;
}

fn ffBlend(center : vec3f, center2 : vec3f, k : FFSectorSum, l : FFSectorSum, r : FFSectorSum, invWeight : f32) -> vec4f {
  let m = (center + k.s + 0.4 * (l.s + r.s)) * invWeight;
  let v = abs((center2 + k.q + 0.4 * (l.q + r.q)) * invWeight - m * m);
  let sigma = (v.r + v.g + v.b) * uniforms.uPaintParams.z;
  let w = 1.0 / (1.0 + sigma * sigma * sigma * sigma);
  return vec4f(m * w, w);
}

@fragment
fn main(input : FragmentInputs) -> FragmentOutputs {
  let uv = input.vUV;
  let c0 = textureSampleLevel(textureSampler, textureSamplerSampler, uv, 0.0);
  let center = c0.rgb;
  let lookMask = ffLookMask(uv, c0.a);
  let charMask = lookMask.x;
  let rings = clamp(floor(uniforms.uPaintParams.y), 1.0, 3.0);
  let ringStep = uniforms.uTexel * (uniforms.uPaintParams.x / rings);
  let k0 = ffSector(uv, vec2f(1.0, 0.0), vec2f(0.92387953, 0.38268343), ringStep, rings);
  let k1 = ffSector(uv, vec2f(0.70710678, 0.70710678), vec2f(0.38268343, 0.92387953), ringStep, rings);
  let k2 = ffSector(uv, vec2f(0.0, 1.0), vec2f(-0.38268343, 0.92387953), ringStep, rings);
  let k3 = ffSector(uv, vec2f(-0.70710678, 0.70710678), vec2f(-0.92387953, 0.38268343), ringStep, rings);
  let k4 = ffSector(uv, vec2f(-1.0, 0.0), vec2f(-0.92387953, -0.38268343), ringStep, rings);
  let k5 = ffSector(uv, vec2f(-0.70710678, -0.70710678), vec2f(-0.38268343, -0.92387953), ringStep, rings);
  let k6 = ffSector(uv, vec2f(0.0, -1.0), vec2f(0.38268343, -0.92387953), ringStep, rings);
  let k7 = ffSector(uv, vec2f(0.70710678, -0.70710678), vec2f(0.92387953, -0.38268343), ringStep, rings);
  let invWeight = 1.0 / (1.0 + 3.6 * rings);
  let c2 = center * center;
  var acc = ffBlend(center, c2, k0, k7, k1, invWeight);
  acc += ffBlend(center, c2, k1, k0, k2, invWeight);
  acc += ffBlend(center, c2, k2, k1, k3, invWeight);
  acc += ffBlend(center, c2, k3, k2, k4, invWeight);
  acc += ffBlend(center, c2, k4, k3, k5, invWeight);
  acc += ffBlend(center, c2, k5, k4, k6, invWeight);
  acc += ffBlend(center, c2, k6, k5, k7, invWeight);
  acc += ffBlend(center, c2, k7, k6, k0, invWeight);
  let painted = acc.rgb / max(acc.a, 0.0001);
  fragmentOutputs.color = vec4f(mix(center, painted, uniforms.uPaintParams.w * (1.0 - 0.85 * charMask) * (1.0 - lookMask.y)), c0.a);
}
`;

export const COMIC_UNIFORMS = [
  'uTexel',
  'uInkColor',
  'uInkParams',
  'uInkFade',
  'uWaterLevel',
  'uCamPos',
  'uCamForward',
  'uCamRight',
  'uCamUp',
  'uGrade',
  'uGradeExtra',
  'uShadowTone',
  'uHighlightTone',
  'uSharpen',
] as const;
export const COMIC_SAMPLERS = ['depthSampler', 'normalSampler'] as const;

export const comicFragmentGLSL = /* glsl */ `
precision highp float;

varying vec2 vUV;
uniform sampler2D textureSampler;
uniform sampler2D depthSampler;
uniform sampler2D normalSampler;
uniform vec2 uTexel;
uniform vec4 uInkColor;
uniform vec4 uInkParams;
uniform vec4 uInkFade;
uniform vec4 uWaterLevel;
uniform vec3 uCamPos;
uniform vec3 uCamForward;
uniform vec3 uCamRight;
uniform vec3 uCamUp;
uniform vec4 uGrade;
uniform vec4 uGradeExtra;
uniform vec3 uShadowTone;
uniform vec3 uHighlightTone;
uniform vec4 uSharpen;

float ffHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// x = stylised-character weight, y = reserved (no exempt level: blends over a
// character can produce any alpha, so an in-band value could false-trigger).
vec2 ffLookMask(vec2 uv, float a0) {
  return vec2(1.0 - a0, 0.0);
}

float ffNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(ffHash(i), ffHash(i + vec2(1.0, 0.0)), u.x), mix(ffHash(i + vec2(0.0, 1.0)), ffHash(i + vec2(1.0, 1.0)), u.x), u.y);
}

vec2 ffSnap(vec2 uv) {
  return (floor(uv / uTexel) + 0.5) * uTexel;
}

float ffDepth(vec2 uv) {
  float d = texture2D(depthSampler, ffSnap(uv)).r;
  return d <= 0.0 ? 100000.0 : d;
}

vec3 ffNormal(vec2 uv) {
  return texture2D(normalSampler, ffSnap(uv)).xyz;
}

float ffNormalEdge(vec3 n0, vec3 n1) {
  if (dot(n0, n0) < 0.25 || dot(n1, n1) < 0.25) return 0.0;
  return 1.0 - dot(normalize(n0), normalize(n1));
}

// Stylised-character coverage of a scene-alpha value (photoreal 0.5 and the
// world both read 0).
float ffCharOf(float a) {
  return 1.0 - smoothstep(0.12, 0.3, a);
}

// Silhouette tap: the mask flips between this pixel and the one at o, and
// so does the depth (a translucent puff over a character changes the alpha
// but not the geometry-buffer depth, so it draws no line).
float ffSilhouetteTap(vec2 uv, float char0, float d0, vec2 o) {
  float charN = ffCharOf(texture2D(textureSampler, uv + o).a);
  float gate = smoothstep(0.0012, 0.005, abs(ffDepth(uv + o) / d0 - 1.0));
  return abs(charN - char0) * gate;
}

void main(void) {
  vec4 c0 = texture2D(textureSampler, vUV);
  vec3 color = c0.rgb;
  vec2 lookMask = ffLookMask(vUV, c0.a);
  float charMask = lookMask.x;
  float exempt = lookMask.y;
  // uSharpen: x sharpen amount, y detailed edges (1 = 8 taps + wobble-aware near depth).
  if (uSharpen.x > 0.0) {
    vec3 around = texture2D(textureSampler, vUV + vec2(uTexel.x, 0.0)).rgb + texture2D(textureSampler, vUV - vec2(uTexel.x, 0.0)).rgb
      + texture2D(textureSampler, vUV + vec2(0.0, uTexel.y)).rgb + texture2D(textureSampler, vUV - vec2(0.0, uTexel.y)).rgb;
    color = max(color + (color - around * 0.25) * uSharpen.x * (1.0 - charMask) * (1.0 - exempt), vec3(0.0));
  }
  vec2 pixel = vUV / uTexel;
  bool detailed = uSharpen.y > 0.5;

  // Hand-drawn wobble: a static low-frequency offset field and width noise.
  vec2 uv = vUV;
  float widthNoise = 1.0;
  if (uInkParams.w > 0.0) {
    vec2 wobble = vec2(ffNoise(pixel * 0.021), ffNoise(pixel * 0.021 + 17.3)) - 0.5;
    uv = vUV + wobble * uInkParams.w * uTexel;
    widthNoise = 0.72 + 0.56 * ffNoise(pixel * 0.013 + 41.0);
  }

  float d0 = ffDepth(uv);
  float near = d0;
  if (detailed) {
    near = min(d0, min(min(ffDepth(uv + vec2(uTexel.x, 0.0)), ffDepth(uv - vec2(uTexel.x, 0.0))), min(ffDepth(uv + vec2(0.0, uTexel.y)), ffDepth(uv - vec2(0.0, uTexel.y)))));
  }
  float farMix = smoothstep(uInkFade.x, uInkFade.y, near);
  float width = uInkParams.x * widthNoise * mix(1.0, uInkFade.z, farMix);
  vec2 ox = vec2(uTexel.x * width, 0.0);
  vec2 oy = vec2(0.0, uTexel.y * width);
  vec2 od1 = (ox + oy) * 0.7071;
  vec2 od2 = (ox - oy) * 0.7071;

  float lap = max(abs(d0 / ffDepth(uv - ox) + d0 / ffDepth(uv + ox) - 2.0), abs(d0 / ffDepth(uv - oy) + d0 / ffDepth(uv + oy) - 2.0));
  vec3 n0 = ffNormal(uv);
  float nEdge = max(max(ffNormalEdge(n0, ffNormal(uv - ox)), ffNormalEdge(n0, ffNormal(uv + ox))), max(ffNormalEdge(n0, ffNormal(uv - oy)), ffNormalEdge(n0, ffNormal(uv + oy))));
  if (detailed) {
    lap = max(lap, max(abs(d0 / ffDepth(uv - od1) + d0 / ffDepth(uv + od1) - 2.0), abs(d0 / ffDepth(uv - od2) + d0 / ffDepth(uv + od2) - 2.0)));
    nEdge = max(nEdge, max(ffNormalEdge(n0, ffNormal(uv + od1)), ffNormalEdge(n0, ffNormal(uv - od2))));
  }
  float depthEdge = smoothstep(uInkParams.y, uInkParams.y * 2.2, lap);
  float normalEdge = smoothstep(uInkParams.z, uInkParams.z + 0.18, nEdge) * (1.0 - smoothstep(uInkFade.x * 0.7, uInkFade.y * 0.55, near));
  normalEdge *= 1.0 - charMask;

  // Bold character silhouette (see the mask contract above).
  float char0 = ffCharOf(texture2D(textureSampler, uv).a);
  vec2 sx = ox * 1.25;
  vec2 sy = oy * 1.25;
  float silhouette = max(max(ffSilhouetteTap(uv, char0, d0, sx), ffSilhouetteTap(uv, char0, d0, -sx)),
    max(ffSilhouetteTap(uv, char0, d0, sy), ffSilhouetteTap(uv, char0, d0, -sy)));
  if (detailed) {
    silhouette = max(silhouette, max(max(ffSilhouetteTap(uv, char0, d0, od1 * 1.25), ffSilhouetteTap(uv, char0, d0, -od1 * 1.25)),
      max(ffSilhouetteTap(uv, char0, d0, od2 * 1.25), ffSilhouetteTap(uv, char0, d0, -od2 * 1.25))));
  }

  float ink = max(max(depthEdge, normalEdge), silhouette) * mix(1.0, uInkFade.w, farMix);
  if (near < 50000.0 && uCamPos.y > uWaterLevel.x) {
    vec3 ray = uCamForward + (vUV.x * 2.0 - 1.0) * uCamRight + (vUV.y * 2.0 - 1.0) * uCamUp;
    float worldY = uCamPos.y + ray.y * near;
    ink *= 1.0 - smoothstep(0.05, 0.9, uWaterLevel.x - worldY) * 0.85;
  }
  ink *= uInkColor.a * (1.0 - exempt);
  color = mix(color, uInkColor.rgb, clamp(ink, 0.0, 1.0));
  vec3 ungraded = color;

  // Paper grain and a faint canvas weave.
  if (uGradeExtra.y > 0.0) {
    float grain = ffNoise(pixel * 0.75) * 0.55 + ffNoise(pixel * 0.19 + 9.0) * 0.45;
    float weave = sin(pixel.x * 2.2) * sin(pixel.y * 2.2) * 0.5 + 0.5;
    color *= 1.0 + ((grain - 0.5) + (weave - 0.5) * 0.35) * uGradeExtra.y * (1.0 - 0.7 * charMask) * (1.0 - exempt);
  }

  // Grading towards the painted palette: exposure, saturation + vibrance
  // (muted colours gain most), a soft S-curve that never clips, split tone.
  color *= uGrade.x;
  float luma = dot(color, vec3(0.299, 0.587, 0.114));
  float sat = max(color.r, max(color.g, color.b)) - min(color.r, min(color.g, color.b));
  color = mix(vec3(luma), color, uGrade.z * (1.0 + uGrade.w * (1.0 - clamp(sat * 2.5, 0.0, 1.0))));
  color = clamp(color, 0.0, 1.0);
  // Hue-preserving tone curve on luminance: soft S-curve plus a highlight
  // shoulder so snow and sand keep their tint instead of clipping to white.
  float toneIn = max(dot(color, vec3(0.299, 0.587, 0.114)), 0.0001);
  float toneOut = mix(toneIn, toneIn * toneIn * (3.0 - 2.0 * toneIn), uGrade.y - 1.0);
  toneOut = toneOut > 0.8 ? 0.8 + (toneOut - 0.8) * 0.55 : toneOut;
  color = clamp(color * (toneOut / toneIn), 0.0, 1.0);
  luma = clamp(dot(color, vec3(0.299, 0.587, 0.114)), 0.0, 1.0);
  color += uShadowTone * (1.0 - luma) * (1.0 - luma) * uGradeExtra.z;
  color += uHighlightTone * luma * luma * uGradeExtra.w;
  color = mix(color, ungraded, exempt);

  vec2 centered = vUV - 0.5;
  float vignette = smoothstep(0.32, 0.82, length(centered * vec2(1.0, 0.82)));
  color *= 1.0 - vignette * uGradeExtra.x;

  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`;

export const comicFragmentWGSL = /* wgsl */ `
varying vUV : vec2f;
var textureSamplerSampler : sampler;
var textureSampler : texture_2d<f32>;
var depthSamplerSampler : sampler;
var depthSampler : texture_2d<f32>;
var normalSamplerSampler : sampler;
var normalSampler : texture_2d<f32>;
uniform uTexel : vec2f;
uniform uInkColor : vec4f;
uniform uInkParams : vec4f;
uniform uInkFade : vec4f;
uniform uWaterLevel : vec4f;
uniform uCamPos : vec3f;
uniform uCamForward : vec3f;
uniform uCamRight : vec3f;
uniform uCamUp : vec3f;
uniform uGrade : vec4f;
uniform uGradeExtra : vec4f;
uniform uShadowTone : vec3f;
uniform uHighlightTone : vec3f;
uniform uSharpen : vec4f;

fn ffHash(p : vec2f) -> f32 {
  var p3 = fract(vec3f(p.x, p.y, p.x) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

fn ffLookMask(uv : vec2f, a0 : f32) -> vec2f {
  return vec2f(1.0 - a0, 0.0);
}

fn ffNoise(p : vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  return mix(mix(ffHash(i), ffHash(i + vec2f(1.0, 0.0)), u.x), mix(ffHash(i + vec2f(0.0, 1.0)), ffHash(i + vec2f(1.0, 1.0)), u.x), u.y);
}

fn ffSnap(uv : vec2f) -> vec2f {
  return (floor(uv / uniforms.uTexel) + 0.5) * uniforms.uTexel;
}

fn ffDepth(uv : vec2f) -> f32 {
  let d = textureSampleLevel(depthSampler, depthSamplerSampler, ffSnap(uv), 0.0).r;
  if (d <= 0.0) { return 100000.0; }
  return d;
}

fn ffNormal(uv : vec2f) -> vec3f {
  return textureSampleLevel(normalSampler, normalSamplerSampler, ffSnap(uv), 0.0).xyz;
}

fn ffNormalEdge(n0 : vec3f, n1 : vec3f) -> f32 {
  if (dot(n0, n0) < 0.25 || dot(n1, n1) < 0.25) { return 0.0; }
  return 1.0 - dot(normalize(n0), normalize(n1));
}

fn ffCharOf(a : f32) -> f32 {
  return 1.0 - smoothstep(0.12, 0.3, a);
}

fn ffSilhouetteTap(uv : vec2f, char0 : f32, d0 : f32, o : vec2f) -> f32 {
  let charN = ffCharOf(textureSampleLevel(textureSampler, textureSamplerSampler, uv + o, 0.0).a);
  let gate = smoothstep(0.0012, 0.005, abs(ffDepth(uv + o) / d0 - 1.0));
  return abs(charN - char0) * gate;
}

@fragment
fn main(input : FragmentInputs) -> FragmentOutputs {
  let c0 = textureSampleLevel(textureSampler, textureSamplerSampler, input.vUV, 0.0);
  var color = c0.rgb;
  let lookMask = ffLookMask(input.vUV, c0.a);
  let charMask = lookMask.x;
  let exempt = lookMask.y;
  let texel = uniforms.uTexel;
  if (uniforms.uSharpen.x > 0.0) {
    let around = textureSampleLevel(textureSampler, textureSamplerSampler, input.vUV + vec2f(texel.x, 0.0), 0.0).rgb
      + textureSampleLevel(textureSampler, textureSamplerSampler, input.vUV - vec2f(texel.x, 0.0), 0.0).rgb
      + textureSampleLevel(textureSampler, textureSamplerSampler, input.vUV + vec2f(0.0, texel.y), 0.0).rgb
      + textureSampleLevel(textureSampler, textureSamplerSampler, input.vUV - vec2f(0.0, texel.y), 0.0).rgb;
    color = max(color + (color - around * 0.25) * uniforms.uSharpen.x * (1.0 - charMask) * (1.0 - exempt), vec3f(0.0));
  }
  let pixel = input.vUV / texel;
  let detailed = uniforms.uSharpen.y > 0.5;

  var uv = input.vUV;
  var widthNoise = 1.0;
  if (uniforms.uInkParams.w > 0.0) {
    let wobble = vec2f(ffNoise(pixel * 0.021), ffNoise(pixel * 0.021 + 17.3)) - 0.5;
    uv = input.vUV + wobble * uniforms.uInkParams.w * texel;
    widthNoise = 0.72 + 0.56 * ffNoise(pixel * 0.013 + 41.0);
  }

  let d0 = ffDepth(uv);
  var near = d0;
  if (detailed) {
    near = min(d0, min(min(ffDepth(uv + vec2f(texel.x, 0.0)), ffDepth(uv - vec2f(texel.x, 0.0))), min(ffDepth(uv + vec2f(0.0, texel.y)), ffDepth(uv - vec2f(0.0, texel.y)))));
  }
  let farMix = smoothstep(uniforms.uInkFade.x, uniforms.uInkFade.y, near);
  let width = uniforms.uInkParams.x * widthNoise * mix(1.0, uniforms.uInkFade.z, farMix);
  let ox = vec2f(texel.x * width, 0.0);
  let oy = vec2f(0.0, texel.y * width);
  let od1 = (ox + oy) * 0.7071;
  let od2 = (ox - oy) * 0.7071;

  var lap = max(abs(d0 / ffDepth(uv - ox) + d0 / ffDepth(uv + ox) - 2.0), abs(d0 / ffDepth(uv - oy) + d0 / ffDepth(uv + oy) - 2.0));
  let n0 = ffNormal(uv);
  var nEdge = max(max(ffNormalEdge(n0, ffNormal(uv - ox)), ffNormalEdge(n0, ffNormal(uv + ox))), max(ffNormalEdge(n0, ffNormal(uv - oy)), ffNormalEdge(n0, ffNormal(uv + oy))));
  if (detailed) {
    lap = max(lap, max(abs(d0 / ffDepth(uv - od1) + d0 / ffDepth(uv + od1) - 2.0), abs(d0 / ffDepth(uv - od2) + d0 / ffDepth(uv + od2) - 2.0)));
    nEdge = max(nEdge, max(ffNormalEdge(n0, ffNormal(uv + od1)), ffNormalEdge(n0, ffNormal(uv - od2))));
  }
  let depthEdge = smoothstep(uniforms.uInkParams.y, uniforms.uInkParams.y * 2.2, lap);
  let normalEdge = smoothstep(uniforms.uInkParams.z, uniforms.uInkParams.z + 0.18, nEdge) * (1.0 - smoothstep(uniforms.uInkFade.x * 0.7, uniforms.uInkFade.y * 0.55, near)) * (1.0 - charMask);

  let char0 = ffCharOf(textureSampleLevel(textureSampler, textureSamplerSampler, uv, 0.0).a);
  let sx = ox * 1.25;
  let sy = oy * 1.25;
  var silhouette = max(max(ffSilhouetteTap(uv, char0, d0, sx), ffSilhouetteTap(uv, char0, d0, -sx)),
    max(ffSilhouetteTap(uv, char0, d0, sy), ffSilhouetteTap(uv, char0, d0, -sy)));
  if (detailed) {
    silhouette = max(silhouette, max(max(ffSilhouetteTap(uv, char0, d0, od1 * 1.25), ffSilhouetteTap(uv, char0, d0, -od1 * 1.25)),
      max(ffSilhouetteTap(uv, char0, d0, od2 * 1.25), ffSilhouetteTap(uv, char0, d0, -od2 * 1.25))));
  }

  var ink = max(max(depthEdge, normalEdge), silhouette) * mix(1.0, uniforms.uInkFade.w, farMix);
  if (near < 50000.0 && uniforms.uCamPos.y > uniforms.uWaterLevel.x) {
    let ray = uniforms.uCamForward + (input.vUV.x * 2.0 - 1.0) * uniforms.uCamRight + (input.vUV.y * 2.0 - 1.0) * uniforms.uCamUp;
    let worldY = uniforms.uCamPos.y + ray.y * near;
    ink *= 1.0 - smoothstep(0.05, 0.9, uniforms.uWaterLevel.x - worldY) * 0.85;
  }
  ink *= uniforms.uInkColor.a * (1.0 - exempt);
  color = mix(color, uniforms.uInkColor.rgb, clamp(ink, 0.0, 1.0));
  let ungraded = color;

  if (uniforms.uGradeExtra.y > 0.0) {
    let grain = ffNoise(pixel * 0.75) * 0.55 + ffNoise(pixel * 0.19 + 9.0) * 0.45;
    let weave = sin(pixel.x * 2.2) * sin(pixel.y * 2.2) * 0.5 + 0.5;
    color *= 1.0 + ((grain - 0.5) + (weave - 0.5) * 0.35) * uniforms.uGradeExtra.y * (1.0 - 0.7 * charMask) * (1.0 - exempt);
  }

  color *= uniforms.uGrade.x;
  var luma = dot(color, vec3f(0.299, 0.587, 0.114));
  let sat = max(color.r, max(color.g, color.b)) - min(color.r, min(color.g, color.b));
  color = mix(vec3f(luma), color, uniforms.uGrade.z * (1.0 + uniforms.uGrade.w * (1.0 - clamp(sat * 2.5, 0.0, 1.0))));
  color = clamp(color, vec3f(0.0), vec3f(1.0));
  let toneIn = max(dot(color, vec3f(0.299, 0.587, 0.114)), 0.0001);
  var toneOut = mix(toneIn, toneIn * toneIn * (3.0 - 2.0 * toneIn), uniforms.uGrade.y - 1.0);
  toneOut = select(toneOut, 0.8 + (toneOut - 0.8) * 0.55, toneOut > 0.8);
  color = clamp(color * (toneOut / toneIn), vec3f(0.0), vec3f(1.0));
  luma = clamp(dot(color, vec3f(0.299, 0.587, 0.114)), 0.0, 1.0);
  color += uniforms.uShadowTone * (1.0 - luma) * (1.0 - luma) * uniforms.uGradeExtra.z;
  color += uniforms.uHighlightTone * luma * luma * uniforms.uGradeExtra.w;
  color = mix(color, ungraded, exempt);

  let centered = input.vUV - 0.5;
  let vignette = smoothstep(0.32, 0.82, length(centered * vec2f(1.0, 0.82)));
  color *= 1.0 - vignette * uniforms.uGradeExtra.x;

  fragmentOutputs.color = vec4f(clamp(color, vec3f(0.0), vec3f(1.0)), 1.0);
}
`;
