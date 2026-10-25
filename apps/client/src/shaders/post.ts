/**
 * Painterly post stack (see rendering/scene-look.ts for the pass order):
 *
 *   1. ffPaint  (high/medium) generalized Kuwahara with 8 overlapping
 *      sectors sampled on polar rings. Flattens surfaces into brush-like
 *      patches while keeping hard colour edges, so the frame reads as paint.
 *   2. ffComic  (all tiers) screen-space ink outlines from the geometry
 *      buffer (depth + view normals), hand-drawn wobble and width variation,
 *      paper grain, colour grading towards the reference palette, vignette.
 *
 * Both passes exist in GLSL and WGSL; keep them equivalent. Post-process UVs
 * follow the Babylon convention (vUV.y = 0 at the bottom) on both APIs.
 */

export const PAINT_UNIFORMS = ['uTexel', 'uPaintParams'] as const;

export const paintFragmentGLSL = /* glsl */ `
precision highp float;

varying vec2 vUV;
uniform sampler2D textureSampler;
uniform vec2 uTexel;
uniform vec4 uPaintParams;

const float TAU = 6.2831853;

void main(void) {
  vec3 center = texture2D(textureSampler, vUV).rgb;
  vec3 mean[8];
  vec3 square[8];
  float weight[8];
  for (int k = 0; k < 8; k++) {
    mean[k] = center;
    square[k] = center * center;
    weight[k] = 1.0;
  }
  float radius = uPaintParams.x;
  int rings = int(uPaintParams.y);
  for (int ring = 1; ring <= 3; ring++) {
    if (ring > rings) break;
    float ringRadius = radius * float(ring) / float(rings);
    for (int stepIndex = 0; stepIndex < 16; stepIndex++) {
      float angle = (float(stepIndex) + (ring == 2 ? 0.5 : 0.0)) * (TAU / 16.0);
      vec2 offset = vec2(cos(angle), sin(angle)) * ringRadius;
      vec3 c = texture2D(textureSampler, vUV + offset * uTexel).rgb;
      vec3 c2 = c * c;
      int sector = int(floor(angle / (TAU / 8.0)));
      int left = sector == 0 ? 7 : sector - 1;
      int right = sector == 7 ? 0 : sector + 1;
      mean[sector] += c;
      square[sector] += c2;
      weight[sector] += 1.0;
      mean[left] += c * 0.4;
      square[left] += c2 * 0.4;
      weight[left] += 0.4;
      mean[right] += c * 0.4;
      square[right] += c2 * 0.4;
      weight[right] += 0.4;
    }
  }
  vec3 total = vec3(0.0);
  float totalWeight = 0.0;
  for (int k = 0; k < 8; k++) {
    vec3 m = mean[k] / weight[k];
    vec3 v = abs(square[k] / weight[k] - m * m);
    float sigma = (v.r + v.g + v.b) * uPaintParams.z;
    float w = 1.0 / (1.0 + sigma * sigma * sigma * sigma);
    total += m * w;
    totalWeight += w;
  }
  vec3 painted = total / max(totalWeight, 0.0001);
  gl_FragColor = vec4(mix(center, painted, uPaintParams.w), 1.0);
}
`;

export const paintFragmentWGSL = /* wgsl */ `
varying vUV : vec2f;
var textureSamplerSampler : sampler;
var textureSampler : texture_2d<f32>;
uniform uTexel : vec2f;
uniform uPaintParams : vec4f;

const TAU : f32 = 6.2831853;

@fragment
fn main(input : FragmentInputs) -> FragmentOutputs {
  let center = textureSampleLevel(textureSampler, textureSamplerSampler, input.vUV, 0.0).rgb;
  var mean : array<vec3f, 8>;
  var square : array<vec3f, 8>;
  var weight : array<f32, 8>;
  for (var k = 0; k < 8; k++) {
    mean[k] = center;
    square[k] = center * center;
    weight[k] = 1.0;
  }
  let radius = uniforms.uPaintParams.x;
  let rings = i32(uniforms.uPaintParams.y);
  for (var ring = 1; ring <= 3; ring++) {
    if (ring > rings) { break; }
    let ringRadius = radius * f32(ring) / f32(rings);
    for (var stepIndex = 0; stepIndex < 16; stepIndex++) {
      var shift = 0.0;
      if (ring == 2) { shift = 0.5; }
      let angle = (f32(stepIndex) + shift) * (TAU / 16.0);
      let offset = vec2f(cos(angle), sin(angle)) * ringRadius;
      let c = textureSampleLevel(textureSampler, textureSamplerSampler, input.vUV + offset * uniforms.uTexel, 0.0).rgb;
      let c2 = c * c;
      let sector = i32(floor(angle / (TAU / 8.0)));
      var left = sector - 1;
      if (sector == 0) { left = 7; }
      var right = sector + 1;
      if (sector == 7) { right = 0; }
      mean[sector] += c;
      square[sector] += c2;
      weight[sector] += 1.0;
      mean[left] += c * 0.4;
      square[left] += c2 * 0.4;
      weight[left] += 0.4;
      mean[right] += c * 0.4;
      square[right] += c2 * 0.4;
      weight[right] += 0.4;
    }
  }
  var total = vec3f(0.0);
  var totalWeight = 0.0;
  for (var k = 0; k < 8; k++) {
    let m = mean[k] / weight[k];
    let v = abs(square[k] / weight[k] - m * m);
    let sigma = (v.r + v.g + v.b) * uniforms.uPaintParams.z;
    let w = 1.0 / (1.0 + sigma * sigma * sigma * sigma);
    total += m * w;
    totalWeight += w;
  }
  let painted = total / max(totalWeight, 0.0001);
  fragmentOutputs.color = vec4f(mix(center, painted, uniforms.uPaintParams.w), 1.0);
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

void main(void) {
  vec3 color = texture2D(textureSampler, vUV).rgb;
  vec3 around = texture2D(textureSampler, vUV + vec2(uTexel.x, 0.0)).rgb + texture2D(textureSampler, vUV - vec2(uTexel.x, 0.0)).rgb
    + texture2D(textureSampler, vUV + vec2(0.0, uTexel.y)).rgb + texture2D(textureSampler, vUV - vec2(0.0, uTexel.y)).rgb;
  color = max(color + (color - around * 0.25) * uSharpen.x, vec3(0.0));
  vec2 pixel = vUV / uTexel;

  // Hand-drawn wobble: a static low-frequency offset field and width noise.
  vec2 wobble = vec2(ffNoise(pixel * 0.021), ffNoise(pixel * 0.021 + 17.3)) - 0.5;
  vec2 uv = vUV + wobble * uInkParams.w * uTexel;
  float widthNoise = 0.72 + 0.56 * ffNoise(pixel * 0.013 + 41.0);

  float d0 = ffDepth(uv);
  float near = min(d0, min(min(ffDepth(uv + vec2(uTexel.x, 0.0)), ffDepth(uv - vec2(uTexel.x, 0.0))), min(ffDepth(uv + vec2(0.0, uTexel.y)), ffDepth(uv - vec2(0.0, uTexel.y)))));
  float farMix = smoothstep(uInkFade.x, uInkFade.y, near);
  float width = uInkParams.x * widthNoise * mix(1.0, uInkFade.z, farMix);
  vec2 ox = vec2(uTexel.x * width, 0.0);
  vec2 oy = vec2(0.0, uTexel.y * width);
  vec2 od1 = (ox + oy) * 0.7071;
  vec2 od2 = (ox - oy) * 0.7071;

  float dl = ffDepth(uv - ox);
  float dr = ffDepth(uv + ox);
  float dd = ffDepth(uv - oy);
  float du = ffDepth(uv + oy);
  float da = ffDepth(uv - od1);
  float db = ffDepth(uv + od1);
  float dc = ffDepth(uv - od2);
  float de = ffDepth(uv + od2);
  float lap = max(
    max(abs(d0 / dl + d0 / dr - 2.0), abs(d0 / dd + d0 / du - 2.0)),
    max(abs(d0 / da + d0 / db - 2.0), abs(d0 / dc + d0 / de - 2.0))
  );
  float depthEdge = smoothstep(uInkParams.y, uInkParams.y * 2.2, lap);

  vec3 n0 = ffNormal(uv);
  float nEdge = max(
    max(max(ffNormalEdge(n0, ffNormal(uv - ox)), ffNormalEdge(n0, ffNormal(uv + ox))), max(ffNormalEdge(n0, ffNormal(uv - oy)), ffNormalEdge(n0, ffNormal(uv + oy)))),
    max(ffNormalEdge(n0, ffNormal(uv + od1)), ffNormalEdge(n0, ffNormal(uv - od2)))
  );
  float normalEdge = smoothstep(uInkParams.z, uInkParams.z + 0.18, nEdge) * (1.0 - smoothstep(uInkFade.x * 0.7, uInkFade.y * 0.55, near));

  float ink = max(depthEdge, normalEdge) * mix(1.0, uInkFade.w, farMix);
  if (near < 50000.0 && uCamPos.y > uWaterLevel.x) {
    vec3 ray = uCamForward + (vUV.x * 2.0 - 1.0) * uCamRight + (vUV.y * 2.0 - 1.0) * uCamUp;
    float worldY = uCamPos.y + ray.y * near;
    ink *= 1.0 - smoothstep(0.05, 0.9, uWaterLevel.x - worldY) * 0.85;
  }
  ink *= uInkColor.a;
  color = mix(color, uInkColor.rgb, clamp(ink, 0.0, 1.0));

  // Paper grain and a faint canvas weave.
  float grain = ffNoise(pixel * 0.75) * 0.55 + ffNoise(pixel * 0.19 + 9.0) * 0.45;
  float weave = sin(pixel.x * 2.2) * sin(pixel.y * 2.2) * 0.5 + 0.5;
  color *= 1.0 + ((grain - 0.5) + (weave - 0.5) * 0.35) * uGradeExtra.y;

  // Grading towards the painted palette: exposure, saturation + vibrance
  // (muted colours gain most), a soft S-curve that never clips, split tone.
  color *= uGrade.x;
  float luma = dot(color, vec3(0.299, 0.587, 0.114));
  float sat = max(color.r, max(color.g, color.b)) - min(color.r, min(color.g, color.b));
  color = mix(vec3(luma), color, uGrade.z * (1.0 + uGrade.w * (1.0 - clamp(sat * 2.5, 0.0, 1.0))));
  color = clamp(color, 0.0, 1.0);
  color = mix(color, color * color * (3.0 - 2.0 * color), uGrade.y - 1.0);
  luma = clamp(dot(color, vec3(0.299, 0.587, 0.114)), 0.0, 1.0);
  color += uShadowTone * (1.0 - luma) * (1.0 - luma) * uGradeExtra.z;
  color += uHighlightTone * luma * luma * uGradeExtra.w;

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

@fragment
fn main(input : FragmentInputs) -> FragmentOutputs {
  var color = textureSampleLevel(textureSampler, textureSamplerSampler, input.vUV, 0.0).rgb;
  let texel = uniforms.uTexel;
  let around = textureSampleLevel(textureSampler, textureSamplerSampler, input.vUV + vec2f(texel.x, 0.0), 0.0).rgb
    + textureSampleLevel(textureSampler, textureSamplerSampler, input.vUV - vec2f(texel.x, 0.0), 0.0).rgb
    + textureSampleLevel(textureSampler, textureSamplerSampler, input.vUV + vec2f(0.0, texel.y), 0.0).rgb
    + textureSampleLevel(textureSampler, textureSamplerSampler, input.vUV - vec2f(0.0, texel.y), 0.0).rgb;
  color = max(color + (color - around * 0.25) * uniforms.uSharpen.x, vec3f(0.0));
  let pixel = input.vUV / texel;

  let wobble = vec2f(ffNoise(pixel * 0.021), ffNoise(pixel * 0.021 + 17.3)) - 0.5;
  let uv = input.vUV + wobble * uniforms.uInkParams.w * texel;
  let widthNoise = 0.72 + 0.56 * ffNoise(pixel * 0.013 + 41.0);

  let d0 = ffDepth(uv);
  let near = min(d0, min(min(ffDepth(uv + vec2f(texel.x, 0.0)), ffDepth(uv - vec2f(texel.x, 0.0))), min(ffDepth(uv + vec2f(0.0, texel.y)), ffDepth(uv - vec2f(0.0, texel.y)))));
  let farMix = smoothstep(uniforms.uInkFade.x, uniforms.uInkFade.y, near);
  let width = uniforms.uInkParams.x * widthNoise * mix(1.0, uniforms.uInkFade.z, farMix);
  let ox = vec2f(texel.x * width, 0.0);
  let oy = vec2f(0.0, texel.y * width);
  let od1 = (ox + oy) * 0.7071;
  let od2 = (ox - oy) * 0.7071;

  let dl = ffDepth(uv - ox);
  let dr = ffDepth(uv + ox);
  let dd = ffDepth(uv - oy);
  let du = ffDepth(uv + oy);
  let da = ffDepth(uv - od1);
  let db = ffDepth(uv + od1);
  let dc = ffDepth(uv - od2);
  let de = ffDepth(uv + od2);
  let lap = max(
    max(abs(d0 / dl + d0 / dr - 2.0), abs(d0 / dd + d0 / du - 2.0)),
    max(abs(d0 / da + d0 / db - 2.0), abs(d0 / dc + d0 / de - 2.0))
  );
  let depthEdge = smoothstep(uniforms.uInkParams.y, uniforms.uInkParams.y * 2.2, lap);

  let n0 = ffNormal(uv);
  let nEdge = max(
    max(max(ffNormalEdge(n0, ffNormal(uv - ox)), ffNormalEdge(n0, ffNormal(uv + ox))), max(ffNormalEdge(n0, ffNormal(uv - oy)), ffNormalEdge(n0, ffNormal(uv + oy)))),
    max(ffNormalEdge(n0, ffNormal(uv + od1)), ffNormalEdge(n0, ffNormal(uv - od2)))
  );
  let normalEdge = smoothstep(uniforms.uInkParams.z, uniforms.uInkParams.z + 0.18, nEdge) * (1.0 - smoothstep(uniforms.uInkFade.x * 0.7, uniforms.uInkFade.y * 0.55, near));

  var ink = max(depthEdge, normalEdge) * mix(1.0, uniforms.uInkFade.w, farMix);
  if (near < 50000.0 && uniforms.uCamPos.y > uniforms.uWaterLevel.x) {
    let ray = uniforms.uCamForward + (input.vUV.x * 2.0 - 1.0) * uniforms.uCamRight + (input.vUV.y * 2.0 - 1.0) * uniforms.uCamUp;
    let worldY = uniforms.uCamPos.y + ray.y * near;
    ink *= 1.0 - smoothstep(0.05, 0.9, uniforms.uWaterLevel.x - worldY) * 0.85;
  }
  ink *= uniforms.uInkColor.a;
  color = mix(color, uniforms.uInkColor.rgb, clamp(ink, 0.0, 1.0));

  let grain = ffNoise(pixel * 0.75) * 0.55 + ffNoise(pixel * 0.19 + 9.0) * 0.45;
  let weave = sin(pixel.x * 2.2) * sin(pixel.y * 2.2) * 0.5 + 0.5;
  color *= 1.0 + ((grain - 0.5) + (weave - 0.5) * 0.35) * uniforms.uGradeExtra.y;

  color *= uniforms.uGrade.x;
  var luma = dot(color, vec3f(0.299, 0.587, 0.114));
  let sat = max(color.r, max(color.g, color.b)) - min(color.r, min(color.g, color.b));
  color = mix(vec3f(luma), color, uniforms.uGrade.z * (1.0 + uniforms.uGrade.w * (1.0 - clamp(sat * 2.5, 0.0, 1.0))));
  color = clamp(color, vec3f(0.0), vec3f(1.0));
  color = mix(color, color * color * (3.0 - 2.0 * color), uniforms.uGrade.y - 1.0);
  luma = clamp(dot(color, vec3f(0.299, 0.587, 0.114)), 0.0, 1.0);
  color += uniforms.uShadowTone * (1.0 - luma) * (1.0 - luma) * uniforms.uGradeExtra.z;
  color += uniforms.uHighlightTone * luma * luma * uniforms.uGradeExtra.w;

  let centered = input.vUV - 0.5;
  let vignette = smoothstep(0.32, 0.82, length(centered * vec2f(1.0, 0.82)));
  color *= 1.0 - vignette * uniforms.uGradeExtra.x;

  fragmentOutputs.color = vec4f(clamp(color, vec3f(0.0), vec3f(1.0)), 1.0);
}
`;
