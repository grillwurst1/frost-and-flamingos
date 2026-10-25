import { LOOK_FRAGMENT_GLSL, LOOK_FRAGMENT_WGSL } from './look-common';

/**
 * Cel shader for the owner's painted Meshy characters (skinned GLB models)
 * and for the procedural props they carry (weapons, swapped cosmetics).
 *
 * Two variants, selected with defines:
 *   FF_TEXTURED      albedo from the painted base-colour texture (uv), with an
 *                    optional tangent-space normal map whose TBN is rebuilt
 *                    from screen-space derivatives (Meshy exports no tangents).
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
 * level (min(natural, max(1.5, natural - 1))) so trilinear filtering never
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
#ifdef FF_TEXTURED
attribute vec2 uv;
#else
attribute vec4 color;
#endif
#include<bonesDeclaration>

uniform mat4 world;
uniform mat4 viewProjection;

varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
varying vec2 vUV;
varying vec4 vColor;

void main(void) {
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

void main(void) {
  vec3 normal = normalize(vWorldNormal);
  if (!gl_FrontFacing) normal = -normal;

#ifdef FF_TEXTURED
  // Explicit mip level: never blurrier than natural, at most one level
  // sharper, and never below 1.5 where box mips start mixing UV islands.
  vec2 texSize = vec2(textureSize(albedoSampler, 0));
  vec2 gx = dFdx(vUV) * texSize;
  vec2 gy = dFdy(vUV) * texSize;
  float lodNatural = 0.5 * log2(max(max(dot(gx, gx), dot(gy, gy)), 1e-8));
  float lod = clamp(min(lodNatural, max(1.5, lodNatural - 1.0)), 0.0, 12.0);
  vec3 base = texture2DLodEXT(albedoSampler, vUV, lod).rgb;
  // The normal map is smaller (1024 vs 2048, or the 1×1 flat fallback):
  // same footprint, so shift the level by the size ratio.
  float normalShift = log2(max(texSize.x / max(float(textureSize(normalSampler, 0).x), 1.0), 1.0));
  float lodNormal = clamp(min(lodNatural - normalShift, max(1.5, lodNatural - normalShift - 1.0)), 0.0, 12.0);
  vec3 mapNormal = texture2DLodEXT(normalSampler, vUV, lodNormal).xyz * 2.0 - 1.0;
  mapNormal.xy *= uPaintParams.x;
  normal = ffPerturbNormal(normal, vWorldPosition, vUV, normalize(mapNormal));
  float gloss = 0.0;
  float grain = ffValueNoise(vUV * 96.0);
#else
  vec3 base = vColor.rgb;
  float gloss = 0.3;
  float grain = hash13(floor(vWorldPosition * 24.0));
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
#ifdef FF_TEXTURED
attribute uv : vec2f;
#else
attribute color : vec4f;
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

@fragment
fn main(input : FragmentInputs) -> FragmentOutputs {
  var normal = normalize(input.vWorldNormal);
  if (!fragmentInputs.frontFacing) { normal = -normal; }

#ifdef FF_TEXTURED
  let texSize = vec2f(textureDimensions(albedoSampler, 0));
  let gx = dpdx(input.vUV) * texSize;
  let gy = dpdy(input.vUV) * texSize;
  let lodNatural = 0.5 * log2(max(max(dot(gx, gx), dot(gy, gy)), 1e-8));
  let lod = clamp(min(lodNatural, max(1.5, lodNatural - 1.0)), 0.0, 12.0);
  var base = textureSampleLevel(albedoSampler, albedoSamplerSampler, input.vUV, lod).rgb;
  let normalSize = vec2f(textureDimensions(normalSampler, 0));
  let normalShift = log2(max(texSize.x / max(normalSize.x, 1.0), 1.0));
  let lodNormal = clamp(min(lodNatural - normalShift, max(1.5, lodNatural - normalShift - 1.0)), 0.0, 12.0);
  var mapNormal = textureSampleLevel(normalSampler, normalSamplerSampler, input.vUV, lodNormal).xyz * 2.0 - 1.0;
  mapNormal = vec3f(mapNormal.xy * uniforms.uPaintParams.x, mapNormal.z);
  normal = ffPerturbNormal(normal, input.vWorldPosition, input.vUV, normalize(mapNormal));
  let gloss = 0.0;
  let grain = ffValueNoise(input.vUV * 96.0);
#else
  var base = input.vColor.rgb;
  let gloss = 0.3;
  let grain = hash13(floor(input.vWorldPosition * 24.0));
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

  lit = ffHaze(lit, input.vWorldPosition);
  // Pass-through shimmer (last, after every derivative).
  if (uniforms.uDither > 0.001) {
    let pattern = fract(52.9829189 * fract(dot(fragmentInputs.position.xy, vec2f(0.06711056, 0.00583715))));
    if (pattern < uniforms.uDither) { discard; }
  }
  fragmentOutputs.color = vec4f(lit, uniforms.uLookMask);
}
`;
