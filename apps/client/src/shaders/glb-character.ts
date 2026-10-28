import { LOOK_FRAGMENT_GLSL, LOOK_FRAGMENT_WGSL } from './look-common';

/**
 * Cel shader for the owner's painted Meshy characters (skinned GLB models)
 * and for the procedural props they carry (weapons, swapped cosmetics).
 *
 * Variants, selected with defines:
 *   FF_TEXTURED      albedo from the painted base-colour texture (uv), with an
 *                    optional tangent-space normal map whose TBN is rebuilt
 *                    from screen-space derivatives (Meshy exports no tangents).
 *   FF_NATIVE_WARDROBE painted original surfaces and selected skinned parts.
 *   FF_WARDROBE_HEAD   shared closed artist head for custom hair/face choices.
 *   (no define)      albedo from vertex colours (props); alpha is unused.
 *
 * GPU skinning comes from Babylon's `bonesDeclaration` / `bonesVertex`
 * includes, which read either the bone texture or the `mBones` array. The
 * skinned world matrix replaces `world`, so the vertex shader always projects
 * with `viewProjection` (never a precomputed worldViewProjection).
 *
 * Lighting is the shared comic model from look-common.ts (cel bands, tinted
 * shade, cast shadows, rim, haze; FF_TEXTURED selects its painted-albedo
 * variant); the global ink outline comes from the scene-look g-buffer edge
 * pass. The effect uniforms match the procedural character shader: soot
 * (battle damage), charred and frozen.
 *
 * Fidelity details for the dense Meshy UV atlases (1800-2500 islands):
 * the painted textures are sampled at an explicit, slightly sharpened mip
 * level (min(natural, max(1.5, natural - 0.25))) so trilinear filtering never
 * bleeds neighbouring islands into eyes and brows, and the output alpha is 0
 * to mark character pixels for the post stack (less paint smear, no normal
 * ink or sharpen on characters; see shaders/post.ts).
 *
 * FF_PHOTOREAL (with FF_TEXTURED) is the one photoreal exception (the Hot
 * Beach Girl): physically based sun and sky lighting without cel bands,
 * on the character look mask (post.ts has no out-of-band exemption yet). uDither
 * discards an ordered-noise share of the fragments (the drifter's
 * pass-through shimmer); 0 keeps the surface solid.
 *
 * GLSL (WebGL2) and WGSL (WebGPU) blocks must stay line-for-line equivalent.
 */
export const glbCharacterVertexGLSL = /* glsl */ `
precision highp float;

attribute vec3 position;
attribute vec3 normal;
#if defined(FF_TEXTURED) || defined(FF_SOFT_CHARACTER)
attribute vec2 uv;
#endif
#ifndef FF_TEXTURED
attribute vec4 color;
#endif
#ifdef FF_NATIVE_WARDROBE
attribute vec2 uv2;
varying vec2 vWardrobe;
varying vec3 vWardrobeRest;
#endif
#include<bonesDeclaration>

uniform mat4 world;
uniform mat4 viewProjection;

varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
varying vec2 vUV;
varying vec4 vColor;

void main(void) {
#ifdef FF_NATIVE_WARDROBE
  vWardrobe = uv2;
  vWardrobeRest = position;
#endif
  mat4 finalWorld = world;
#include<bonesVertex>
  vec4 worldPosition = finalWorld * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  vWorldNormal = normalize(mat3(finalWorld) * normal);
#ifdef FF_TEXTURED
  vUV = uv;
  vColor = vec4(1.0);
#else
  vUV = vec2(0.0);
#ifdef FF_SOFT_CHARACTER
  vUV = uv;
#endif
  vColor = color;
#endif
  gl_Position = viewProjection * worldPosition;
}
`;

export const glbCharacterFragmentGLSL = /* glsl */ `
precision highp float;

varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
varying vec2 vUV;
varying vec4 vColor;

uniform vec3 lightDirection;
uniform vec3 cameraPosition;
uniform float rimStrength;
uniform float uBattleDamage;
uniform float uCharredState;
uniform float uFrozenState;
uniform float uTime;
/** x normal-map strength, y saturation boost, z texture contrast, w shade lift. */
uniform vec4 uPaintParams;
/** Scene-alpha look mask written by this material (0 = stylised character, see post.ts). */
uniform float uLookMask;
/** Share of fragments discarded in an ordered pattern (pass-through shimmer). */
uniform float uDither;
#ifdef FF_SOFT_CHARACTER
uniform vec3 uSkinColor;
#endif
#ifdef FF_NATIVE_WARDROBE
varying vec2 vWardrobe;
varying vec3 vWardrobeRest;
uniform sampler2D albedoSampler;
uniform sampler2D wardrobeMaskSampler;
#ifdef FF_WARDROBE_HEAD
uniform sampler2D headPaintSampler;
uniform sampler2D headMaskSampler;
uniform vec3 uHeadSkinReference;
uniform vec3 uHeadHairReference;
#endif

uniform vec3 uWardrobeHair;
uniform vec3 uSkinReference;
uniform vec3 uHairReference;
uniform float uGreenVest;
uniform vec4 uWardrobeTorso;
#endif
#ifdef FF_TEXTURED
uniform sampler2D albedoSampler;
uniform sampler2D normalSampler;
#endif
${LOOK_FRAGMENT_GLSL}

#ifdef FF_PHOTOREAL
// Photoreal exception: wrapped Lambert sun (soft skin terminator) over the
// hemispheric sky/ground fill, GGX specular with Schlick Fresnel and a faint
// sky reflection. No cel bands; cast shadows as everywhere else.
vec3 ffPhotoreal(vec3 base, vec3 normal, vec3 worldPos, float roughness) {
  vec3 light = normalize(lightDirection);
  vec3 viewDirection = normalize(cameraPosition - worldPos);
  float ndl = dot(normal, light);
  float shadow = ffShadow(worldPos, normal, ndl);
  float wrap = clamp((ndl + 0.2) / 1.2, 0.0, 1.0) * shadow;
  float skyMix = clamp(normal.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 fill = mix(uFFGroundFill, uFFSkyFill, skyMix);
  vec3 color = base * mix(fill, uFFSunColor, wrap);
  vec3 halfVector = normalize(light + viewDirection);
  float ndh = max(dot(normal, halfVector), 0.0);
  float ndv = max(dot(normal, viewDirection), 0.001);
  float nl = max(ndl, 0.0);
  float a = roughness * roughness;
  float a2 = a * a;
  float denom = ndh * ndh * (a2 - 1.0) + 1.0;
  float distribution = a2 / (3.14159265 * denom * denom);
  float k = (roughness + 1.0) * (roughness + 1.0) / 8.0;
  float visibility = 1.0 / ((nl * (1.0 - k) + k) * (ndv * (1.0 - k) + k) * 4.0);
  float fresnel = 0.04 + 0.96 * pow(1.0 - max(dot(viewDirection, halfVector), 0.0), 5.0);
  color += uFFSunColor * distribution * visibility * fresnel * nl * shadow;
  float rimFresnel = 0.04 + 0.96 * pow(1.0 - ndv, 5.0);
  color += uFFSkyFill * rimFresnel * (1.0 - roughness) * 0.35;
  return color;
}
#endif

float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

float ffValueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash13(vec3(i, 0.0)), hash13(vec3(i + vec2(1.0, 0.0), 0.0)), f.x),
    mix(hash13(vec3(i + vec2(0.0, 1.0), 0.0)), hash13(vec3(i + vec2(1.0, 1.0), 0.0)), f.x), f.y);
}

// Cotangent frame from screen derivatives; tangent X is negated for the
// left-handed scene (same convention as Babylon's own glTF path).
vec3 ffPerturbNormal(vec3 n, vec3 p, vec2 uv, vec3 mapNormal) {
  vec3 dp1 = dFdx(p);
  vec3 dp2 = dFdy(p);
  vec2 duv1 = dFdx(uv);
  vec2 duv2 = dFdy(uv);
  vec3 dp2perp = cross(dp2, n);
  vec3 dp1perp = cross(n, dp1);
  vec3 t = -(dp2perp * duv1.x + dp1perp * duv2.x);
  vec3 b = dp2perp * duv1.y + dp1perp * duv2.y;
  float scale = inversesqrt(max(max(dot(t, t), dot(b, b)), 1e-12));
  return normalize(t * scale * mapNormal.x + b * scale * mapNormal.y + n * mapNormal.z);
}

#ifdef FF_NATIVE_WARDROBE
vec3 ffSkinBase(vec3 paint, vec3 reference) {
  float ratio = dot(paint, vec3(0.299, 0.587, 0.114)) / max(dot(reference, vec3(0.299, 0.587, 0.114)), 0.01);
  float crease = 1.0 - smoothstep(0.32, 0.74, ratio);
  return uSkinColor * (1.0 - crease * 0.10);
}
#endif

void main(void) {
  vec3 normal = normalize(vWorldNormal);
  if (!gl_FrontFacing) normal = -normal;

#ifdef FF_TEXTURED
  // Explicit mip level: never blurrier than natural, at most a quarter level
  // sharper, and never below 1.5 where box mips start mixing UV islands.
  vec2 texSize = vec2(textureSize(albedoSampler, 0));
  vec2 gx = dFdx(vUV) * texSize;
  vec2 gy = dFdy(vUV) * texSize;
  float lodNatural = 0.5 * log2(max(max(dot(gx, gx), dot(gy, gy)), 1e-8));
  float lod = clamp(min(lodNatural, max(1.5, lodNatural - 0.25)), 0.0, 12.0);
  vec3 base = texture2DLodEXT(albedoSampler, vUV, lod).rgb;
  // The normal map is smaller (1024 vs 2048, or the 1×1 flat fallback):
  // same UV footprint as the albedo, so the level and the 1.5 island floor
  // both shift by the size ratio.
  float normalShift = log2(max(texSize.x / max(float(textureSize(normalSampler, 0).x), 1.0), 1.0));
  float lodNormal = clamp(min(lodNatural - normalShift, max(1.5 - normalShift, lodNatural - normalShift - 0.25)), 0.0, 12.0);
  vec3 mapNormal = texture2DLodEXT(normalSampler, vUV, lodNormal).xyz * 2.0 - 1.0;
  mapNormal.xy *= uPaintParams.x * (1.0 - smoothstep(8.0, 30.0, length(cameraPosition - vWorldPosition)));
  normal = ffPerturbNormal(normal, vWorldPosition, vUV, normalize(mapNormal));
  float gloss = 0.0;
  float grain = 0.0;
  if (uBattleDamage > 0.001) grain = ffValueNoise(vUV * 96.0);
#else
  vec3 base = vColor.rgb;
#ifdef FF_SOFT_CHARACTER
  base = mix(base, uSkinColor, step(0.5, vColor.a));
  float gloss = mix(0.18, 0.035, clamp(vColor.a, 0.0, 1.0));
#else
  float gloss = 0.3;
#endif
  float grain = hash13(floor(vWorldPosition * 24.0));
#ifdef FF_NATIVE_WARDROBE
  // The original paint carries seams, knuckles and facial detail. A separately
  // baked semantic mask changes only selected pigments, never all warm colours.
  vec2 footprint = vec2(textureSize(albedoSampler, 0));
  vec2 dx = dFdx(vUV) * footprint, dy = dFdy(vUV) * footprint;
  float naturalLod = 0.5 * log2(max(max(dot(dx, dx), dot(dy, dy)), 1e-8));
  float nativeLod = clamp(min(naturalLod, max(1.5, naturalLod - 0.25)), 0.0, 12.0);
  if (vWardrobe.x > 0.5 && vWardrobe.x < 1.5) {
    vec3 original = texture2DLodEXT(albedoSampler, vUV, nativeLod).rgb;
    float maskShift = log2(max(footprint.x / float(textureSize(wardrobeMaskSampler, 0).x), 1.0));
    vec3 mask = texture2DLodEXT(wardrobeMaskSampler, vUV, max(0.0, nativeLod - maskShift)).rgb;
    float headRegion = 1.0 - smoothstep(0.25, 0.5, abs(vWardrobe.y - 2.0));
    float skinHeadRegion = max(headRegion, 1.0 - smoothstep(0.25, 0.5, abs(vWardrobe.y - 1.0)));
    mask.r *= max(skinHeadRegion, smoothstep(3.5, 3.75, vWardrobe.y) * (1.0 - smoothstep(6.25, 6.5, vWardrobe.y)));
    mask.g *= headRegion;
    vec3 skinPaint = ffSkinBase(original, uSkinReference);
    vec3 hairPaint = uWardrobeHair * clamp(original / max(uHairReference, vec3(0.01)), 0.35, 1.6);
    mask.r = smoothstep(0.06, 0.35, mask.r);
    base = mix(skinPaint, original, 1.0 - mask.r);
    base = mix(base, hairPaint, mask.g);
    vec3 waistcoat = vec3(0.275, 0.365, 0.196) * clamp(dot(original, vec3(0.299, 0.587, 0.114)) / 0.75, 0.4, 1.3);
    float shape = smoothstep(uWardrobeTorso.y + 0.025, uWardrobeTorso.y + 0.09, vWardrobeRest.y)
      * (1.0 - smoothstep(uWardrobeTorso.z - 0.085, uWardrobeTorso.z - 0.015, vWardrobeRest.y))
      * (1.0 - smoothstep(uWardrobeTorso.x * 0.95, uWardrobeTorso.x * 1.12, abs(vWardrobeRest.x)));
    float opening = max(0.018, (vWardrobeRest.y - (uWardrobeTorso.z - 0.12)) * 0.7);
    float placket = mix(1.0, smoothstep(opening, opening + 0.014, abs(vWardrobeRest.x)), step(uWardrobeTorso.w, vWardrobeRest.z));
    base = mix(base, waistcoat, mask.b * uGreenVest * shape * placket);
    gloss = mix(0.10, 0.035, mask.r);
  }
#ifdef FF_WARDROBE_HEAD
  vec2 headFootprint = vec2(textureSize(headPaintSampler, 0));
  vec2 headDx = dFdx(vUV) * headFootprint, headDy = dFdy(vUV) * headFootprint;
  float headNaturalLod = 0.5 * log2(max(max(dot(headDx, headDx), dot(headDy, headDy)), 1e-8));
  float headLod = clamp(min(headNaturalLod, max(1.0, headNaturalLod - 0.25)), 0.0, 12.0);
  if (vWardrobe.x > 1.5) {
    vec3 original = texture2DLodEXT(headPaintSampler, vUV, headLod).rgb;
    float maskShift = log2(max(headFootprint.x / float(textureSize(headMaskSampler, 0).x), 1.0));
    vec3 mask = texture2DLodEXT(headMaskSampler, vUV, max(0.0, headLod - maskShift)).rgb;
    vec3 skinPaint = ffSkinBase(original, uHeadSkinReference);
    vec3 hairPaint = uWardrobeHair * clamp(original / max(uHeadHairReference, vec3(0.01)), 0.35, 1.6);
    mask.r = smoothstep(0.06, 0.35, mask.r);
    base = mix(skinPaint, original, 1.0 - mask.r);
    base = mix(base, hairPaint, mask.g);
    gloss = mix(0.10, 0.035, mask.r);
  }

#endif
#endif
#endif
  float luma = dot(base, vec3(0.299, 0.587, 0.114));
  base = mix(vec3(luma), base, uPaintParams.y);
  base = clamp((base - 0.5) * uPaintParams.z + 0.5, 0.0, 1.0);

  float sootMask = smoothstep(0.58, 0.86, grain) * clamp(uBattleDamage, 0.0, 1.0);
  base = mix(base, vec3(0.075, 0.065, 0.055), sootMask * 0.82);
  base = mix(base, vec3(0.045, 0.04, 0.038), clamp(uCharredState, 0.0, 1.0) * 0.9);
  base = mix(base, vec3(0.66, 0.9, 1.0), clamp(uFrozenState, 0.0, 1.0) * 0.62);

  float vinyl = gloss * (1.0 - clamp(uCharredState, 0.0, 1.0)) + clamp(uFrozenState, 0.0, 1.0) * 0.6;
#ifdef FF_PHOTOREAL
  vec3 lit = ffPhotoreal(base, normal, vWorldPosition, 0.55);
#else
  vec3 lit = ffToon(base, normal, vWorldPosition, vinyl, rimStrength * 0.8, 1.0);
  // The painting already carries its own soft shading: lift the cel shade
  // band a little so the two do not stack into mud.
  lit = mix(lit, max(lit, base * uFFSunColor * 0.78), uPaintParams.w);
#endif

  float iceShimmer = sin(uTime * 4.0 + vWorldPosition.y * 18.0) * 0.5 + 0.5;
  lit += vec3(0.55, 0.85, 1.0) * uFrozenState * (0.22 + iceShimmer * 0.18);
  lit += vec3(1.0, 0.42, 0.12) * uCharredState * (0.04 + sootMask * 0.05);

  // Rest-pose cavity stays attached during animation. Never changes profile paint.
#ifdef FF_SOFT_CHARACTER
#ifdef FF_NATIVE_WARDROBE
  if (vWardrobe.x < 0.5)
#endif
  lit *= 1.0 - clamp(vUV.x, 0.0, 0.5);
#endif
  lit = ffHaze(lit, vWorldPosition);
  // Pass-through shimmer (last, after every derivative).
  if (uDither > 0.001) {
    float pattern = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    if (pattern < uDither) discard;
  }
  // The alpha marks character pixels for the post stack (opaque material).
  gl_FragColor = vec4(lit, uLookMask);
}
`;

export const glbCharacterVertexWGSL = /* wgsl */ `
attribute position : vec3f;
attribute normal : vec3f;
#if defined(FF_TEXTURED) || defined(FF_SOFT_CHARACTER)
attribute uv : vec2f;
#endif
#ifndef FF_TEXTURED
attribute color : vec4f;
#endif
#ifdef FF_NATIVE_WARDROBE
attribute uv2 : vec2f;
varying vWardrobe : vec2f;
varying vWardrobeRest : vec3f;
#endif
#include<bonesDeclaration>

uniform world : mat4x4f;
uniform viewProjection : mat4x4f;

varying vWorldPosition : vec3f;
varying vWorldNormal : vec3f;
varying vUV : vec2f;
varying vColor : vec4f;

@vertex
fn main(input : VertexInputs) -> FragmentInputs {
#ifdef FF_NATIVE_WARDROBE
  vertexOutputs.vWardrobe = input.uv2;
  vertexOutputs.vWardrobeRest = input.position;
#endif
  var finalWorld = uniforms.world;
#include<bonesVertex>
  let worldPosition = finalWorld * vec4f(input.position, 1.0);
  vertexOutputs.vWorldPosition = worldPosition.xyz;
  let normalMatrix = mat3x3f(finalWorld[0].xyz, finalWorld[1].xyz, finalWorld[2].xyz);
  vertexOutputs.vWorldNormal = normalize(normalMatrix * input.normal);
#ifdef FF_TEXTURED
  vertexOutputs.vUV = input.uv;
  vertexOutputs.vColor = vec4f(1.0);
#else
  vertexOutputs.vUV = vec2f(0.0);
#ifdef FF_SOFT_CHARACTER
  vertexOutputs.vUV = input.uv;
#endif
  vertexOutputs.vColor = input.color;
#endif
  vertexOutputs.position = uniforms.viewProjection * worldPosition;
}
`;

export const glbCharacterFragmentWGSL = /* wgsl */ `
uniform lightDirection : vec3f;
uniform cameraPosition : vec3f;
uniform rimStrength : f32;
uniform uBattleDamage : f32;
uniform uCharredState : f32;
uniform uFrozenState : f32;
uniform uTime : f32;
uniform uPaintParams : vec4f;
uniform uLookMask : f32;
uniform uDither : f32;
#ifdef FF_SOFT_CHARACTER
uniform uSkinColor : vec3f;
#endif
#ifdef FF_NATIVE_WARDROBE

uniform uWardrobeHair : vec3f;
uniform uSkinReference : vec3f;
uniform uHairReference : vec3f;
uniform uGreenVest : f32;
uniform uWardrobeTorso : vec4f;
var albedoSamplerSampler : sampler;
var albedoSampler : texture_2d<f32>;
var wardrobeMaskSamplerSampler : sampler;
var wardrobeMaskSampler : texture_2d<f32>;
#ifdef FF_WARDROBE_HEAD
uniform uHeadSkinReference : vec3f;
uniform uHeadHairReference : vec3f;
var headPaintSamplerSampler : sampler;
var headPaintSampler : texture_2d<f32>;
var headMaskSamplerSampler : sampler;
var headMaskSampler : texture_2d<f32>;
#endif
#endif
#ifdef FF_TEXTURED
var albedoSamplerSampler : sampler;
var albedoSampler : texture_2d<f32>;
var normalSamplerSampler : sampler;
var normalSampler : texture_2d<f32>;
#endif
${LOOK_FRAGMENT_WGSL}

varying vWorldPosition : vec3f;
varying vWorldNormal : vec3f;
varying vUV : vec2f;
varying vColor : vec4f;

#ifdef FF_PHOTOREAL
fn ffPhotoreal(base : vec3f, normal : vec3f, worldPos : vec3f, roughness : f32) -> vec3f {
  let light = normalize(uniforms.lightDirection);
  let viewDirection = normalize(uniforms.cameraPosition - worldPos);
  let ndl = dot(normal, light);
  let shadow = ffShadow(worldPos, normal, ndl);
  let wrap = clamp((ndl + 0.2) / 1.2, 0.0, 1.0) * shadow;
  let skyMix = clamp(normal.y * 0.5 + 0.5, 0.0, 1.0);
  let fill = mix(uniforms.uFFGroundFill, uniforms.uFFSkyFill, skyMix);
  var color = base * mix(fill, uniforms.uFFSunColor, wrap);
  let halfVector = normalize(light + viewDirection);
  let ndh = max(dot(normal, halfVector), 0.0);
  let ndv = max(dot(normal, viewDirection), 0.001);
  let nl = max(ndl, 0.0);
  let a = roughness * roughness;
  let a2 = a * a;
  let denom = ndh * ndh * (a2 - 1.0) + 1.0;
  let distribution = a2 / (3.14159265 * denom * denom);
  let k = (roughness + 1.0) * (roughness + 1.0) / 8.0;
  let visibility = 1.0 / ((nl * (1.0 - k) + k) * (ndv * (1.0 - k) + k) * 4.0);
  let fresnel = 0.04 + 0.96 * pow(1.0 - max(dot(viewDirection, halfVector), 0.0), 5.0);
  color += uniforms.uFFSunColor * distribution * visibility * fresnel * nl * shadow;
  let rimFresnel = 0.04 + 0.96 * pow(1.0 - ndv, 5.0);
  color += uniforms.uFFSkyFill * rimFresnel * (1.0 - roughness) * 0.35;
  return color;
}
#endif

fn hash13(pIn : vec3f) -> f32 {
  var p = fract(pIn * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

fn ffValueNoise(p : vec2f) -> f32 {
  let i = floor(p);
  var f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash13(vec3f(i, 0.0)), hash13(vec3f(i + vec2f(1.0, 0.0), 0.0)), f.x),
    mix(hash13(vec3f(i + vec2f(0.0, 1.0), 0.0)), hash13(vec3f(i + vec2f(1.0, 1.0), 0.0)), f.x), f.y);
}

fn ffPerturbNormal(n : vec3f, p : vec3f, uv : vec2f, mapNormal : vec3f) -> vec3f {
  let dp1 = dpdx(p);
  let dp2 = dpdy(p);
  let duv1 = dpdx(uv);
  let duv2 = dpdy(uv);
  let dp2perp = cross(dp2, n);
  let dp1perp = cross(n, dp1);
  let t = -(dp2perp * duv1.x + dp1perp * duv2.x);
  let b = dp2perp * duv1.y + dp1perp * duv2.y;
  let scale = inverseSqrt(max(max(dot(t, t), dot(b, b)), 1e-12));
  return normalize(t * scale * mapNormal.x + b * scale * mapNormal.y + n * mapNormal.z);
}

#ifdef FF_NATIVE_WARDROBE
fn ffSkinBase(paint : vec3f, reference : vec3f) -> vec3f {
  let ratio = dot(paint, vec3f(0.299, 0.587, 0.114)) / max(dot(reference, vec3f(0.299, 0.587, 0.114)), 0.01);
  let crease = 1.0 - smoothstep(0.32, 0.74, ratio);
  return uniforms.uSkinColor * (1.0 - crease * 0.10);
}
#endif

@fragment
fn main(input : FragmentInputs) -> FragmentOutputs {
  var normal = normalize(input.vWorldNormal);
  if (!fragmentInputs.frontFacing) { normal = -normal; }

#ifdef FF_TEXTURED
  let texSize = vec2f(textureDimensions(albedoSampler, 0));
  let gx = dpdx(input.vUV) * texSize;
  let gy = dpdy(input.vUV) * texSize;
  let lodNatural = 0.5 * log2(max(max(dot(gx, gx), dot(gy, gy)), 1e-8));
  let lod = clamp(min(lodNatural, max(1.5, lodNatural - 0.25)), 0.0, 12.0);
  var base = textureSampleLevel(albedoSampler, albedoSamplerSampler, input.vUV, lod).rgb;
  let normalSize = vec2f(textureDimensions(normalSampler, 0));
  let normalShift = log2(max(texSize.x / max(normalSize.x, 1.0), 1.0));
  let lodNormal = clamp(min(lodNatural - normalShift, max(1.5 - normalShift, lodNatural - normalShift - 0.25)), 0.0, 12.0);
  var mapNormal = textureSampleLevel(normalSampler, normalSamplerSampler, input.vUV, lodNormal).xyz * 2.0 - 1.0;
  mapNormal = vec3f(mapNormal.xy * uniforms.uPaintParams.x * (1.0 - smoothstep(8.0, 30.0, length(uniforms.cameraPosition - input.vWorldPosition))), mapNormal.z);
  normal = ffPerturbNormal(normal, input.vWorldPosition, input.vUV, normalize(mapNormal));
  let gloss = 0.0;
  var grain = 0.0;
  if (uniforms.uBattleDamage > 0.001) { grain = ffValueNoise(input.vUV * 96.0); }
#else
  var base = input.vColor.rgb;
#ifdef FF_SOFT_CHARACTER
  base = mix(base, uniforms.uSkinColor, step(0.5, input.vColor.a));
  var gloss = mix(0.18, 0.035, clamp(input.vColor.a, 0.0, 1.0));
#else
  let gloss = 0.3;
#endif
  let grain = hash13(floor(input.vWorldPosition * 24.0));
#ifdef FF_NATIVE_WARDROBE
  let footprint = vec2f(textureDimensions(albedoSampler, 0));
  let nativeDx = dpdx(input.vUV) * footprint; let nativeDy = dpdy(input.vUV) * footprint;
  let naturalLod = 0.5 * log2(max(max(dot(nativeDx, nativeDx), dot(nativeDy, nativeDy)), 1e-8));
  let nativeLod = clamp(min(naturalLod, max(1.5, naturalLod - 0.25)), 0.0, 12.0);
  if (input.vWardrobe.x > 0.5 && input.vWardrobe.x < 1.5) {
    let original = textureSampleLevel(albedoSampler, albedoSamplerSampler, input.vUV, nativeLod).rgb;
    let maskShift = log2(max(footprint.x / f32(textureDimensions(wardrobeMaskSampler, 0).x), 1.0));
    var mask = textureSampleLevel(wardrobeMaskSampler, wardrobeMaskSamplerSampler, input.vUV, max(0.0, nativeLod - maskShift)).rgb;
    let headRegion = 1.0 - smoothstep(0.25, 0.5, abs(input.vWardrobe.y - 2.0));
    let skinHeadRegion = max(headRegion, 1.0 - smoothstep(0.25, 0.5, abs(input.vWardrobe.y - 1.0)));
    mask.r *= max(skinHeadRegion, smoothstep(3.5, 3.75, input.vWardrobe.y) * (1.0 - smoothstep(6.25, 6.5, input.vWardrobe.y)));
    mask.g *= headRegion;
    let skinPaint = ffSkinBase(original, uniforms.uSkinReference);
    let hairPaint = uniforms.uWardrobeHair * clamp(original / max(uniforms.uHairReference, vec3f(0.01)), vec3f(0.35), vec3f(1.6));
    mask.r = smoothstep(0.06, 0.35, mask.r);
    base = mix(skinPaint, original, 1.0 - mask.r);
    base = mix(base, hairPaint, mask.g);
    let waistcoat = vec3f(0.275, 0.365, 0.196) * clamp(dot(original, vec3f(0.299, 0.587, 0.114)) / 0.75, 0.4, 1.3);
    let shape = smoothstep(uniforms.uWardrobeTorso.y + 0.025, uniforms.uWardrobeTorso.y + 0.09, input.vWardrobeRest.y)
      * (1.0 - smoothstep(uniforms.uWardrobeTorso.z - 0.085, uniforms.uWardrobeTorso.z - 0.015, input.vWardrobeRest.y))
      * (1.0 - smoothstep(uniforms.uWardrobeTorso.x * 0.95, uniforms.uWardrobeTorso.x * 1.12, abs(input.vWardrobeRest.x)));
    let opening = max(0.018, (input.vWardrobeRest.y - (uniforms.uWardrobeTorso.z - 0.12)) * 0.7);
    let placket = mix(1.0, smoothstep(opening, opening + 0.014, abs(input.vWardrobeRest.x)), step(uniforms.uWardrobeTorso.w, input.vWardrobeRest.z));
    base = mix(base, waistcoat, mask.b * uniforms.uGreenVest * shape * placket);
    gloss = mix(0.10, 0.035, mask.r);
  }
#ifdef FF_WARDROBE_HEAD
  let headFootprint = vec2f(textureDimensions(headPaintSampler, 0));
  let headDx = dpdx(input.vUV) * headFootprint; let headDy = dpdy(input.vUV) * headFootprint;
  let headNaturalLod = 0.5 * log2(max(max(dot(headDx, headDx), dot(headDy, headDy)), 1e-8));
  let headLod = clamp(min(headNaturalLod, max(1.0, headNaturalLod - 0.25)), 0.0, 12.0);
  if (input.vWardrobe.x > 1.5) {
    let original = textureSampleLevel(headPaintSampler, headPaintSamplerSampler, input.vUV, headLod).rgb;
    let maskShift = log2(max(headFootprint.x / f32(textureDimensions(headMaskSampler, 0).x), 1.0));
    var mask = textureSampleLevel(headMaskSampler, headMaskSamplerSampler, input.vUV, max(0.0, headLod - maskShift)).rgb;
    let skinPaint = ffSkinBase(original, uniforms.uHeadSkinReference);
    let hairPaint = uniforms.uWardrobeHair * clamp(original / max(uniforms.uHeadHairReference, vec3f(0.01)), vec3f(0.35), vec3f(1.6));
    mask.r = smoothstep(0.06, 0.35, mask.r);
    base = mix(skinPaint, original, 1.0 - mask.r);
    base = mix(base, hairPaint, mask.g);
    gloss = mix(0.10, 0.035, mask.r);
  }
#endif
#endif
#endif
  let luma = dot(base, vec3f(0.299, 0.587, 0.114));
  base = mix(vec3f(luma), base, uniforms.uPaintParams.y);
  base = clamp((base - 0.5) * uniforms.uPaintParams.z + 0.5, vec3f(0.0), vec3f(1.0));

  let sootMask = smoothstep(0.58, 0.86, grain) * clamp(uniforms.uBattleDamage, 0.0, 1.0);
  base = mix(base, vec3f(0.075, 0.065, 0.055), sootMask * 0.82);
  base = mix(base, vec3f(0.045, 0.04, 0.038), clamp(uniforms.uCharredState, 0.0, 1.0) * 0.9);
  base = mix(base, vec3f(0.66, 0.9, 1.0), clamp(uniforms.uFrozenState, 0.0, 1.0) * 0.62);

  let vinyl = gloss * (1.0 - clamp(uniforms.uCharredState, 0.0, 1.0)) + clamp(uniforms.uFrozenState, 0.0, 1.0) * 0.6;
#ifdef FF_PHOTOREAL
  var lit = ffPhotoreal(base, normal, input.vWorldPosition, 0.55);
#else
  var lit = ffToon(base, normal, input.vWorldPosition, vinyl, uniforms.rimStrength * 0.8, 1.0);
  lit = mix(lit, max(lit, base * uniforms.uFFSunColor * 0.78), uniforms.uPaintParams.w);
#endif

  let iceShimmer = sin(uniforms.uTime * 4.0 + input.vWorldPosition.y * 18.0) * 0.5 + 0.5;
  lit += vec3f(0.55, 0.85, 1.0) * uniforms.uFrozenState * (0.22 + iceShimmer * 0.18);
  lit += vec3f(1.0, 0.42, 0.12) * uniforms.uCharredState * (0.04 + sootMask * 0.05);

  // Match GLSL: local cavity, independent of selected skin/cloth colour.
#ifdef FF_SOFT_CHARACTER
#ifdef FF_NATIVE_WARDROBE
  if (input.vWardrobe.x < 0.5) {
#endif
  lit *= 1.0 - clamp(input.vUV.x, 0.0, 0.5);
#ifdef FF_NATIVE_WARDROBE
  }
#endif
#endif
  lit = ffHaze(lit, input.vWorldPosition);
  // Pass-through shimmer (last, after every derivative).
  if (uniforms.uDither > 0.001) {
    let pattern = fract(52.9829189 * fract(dot(fragmentInputs.position.xy, vec2f(0.06711056, 0.00583715))));
    if (pattern < uniforms.uDither) { discard; }
  }
  fragmentOutputs.color = vec4f(lit, uniforms.uLookMask);
}
`;
