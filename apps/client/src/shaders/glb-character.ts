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
 * shade, cast shadows, rim, haze); the global ink outline comes from the
 * scene-look g-buffer edge pass. The effect uniforms match the procedural
 * character shader: soot (battle damage), charred and frozen.
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
#ifdef FF_TEXTURED
uniform sampler2D albedoSampler;
uniform sampler2D normalSampler;
#endif
${LOOK_FRAGMENT_GLSL}

float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

vec3 ffPerturbNormal(vec3 n, vec3 p, vec2 uv, vec3 mapNormal) {
  vec3 dp1 = dFdx(p);
  vec3 dp2 = dFdy(p);
  vec2 duv1 = dFdx(uv);
  vec2 duv2 = dFdy(uv);
  vec3 dp2perp = cross(dp2, n);
  vec3 dp1perp = cross(n, dp1);
  vec3 t = dp2perp * duv1.x + dp1perp * duv2.x;
  vec3 b = dp2perp * duv1.y + dp1perp * duv2.y;
  float scale = inversesqrt(max(max(dot(t, t), dot(b, b)), 1e-12));
  return normalize(t * scale * mapNormal.x + b * scale * mapNormal.y + n * mapNormal.z);
}

void main(void) {
  vec3 normal = normalize(vWorldNormal);
  if (!gl_FrontFacing) normal = -normal;

#ifdef FF_TEXTURED
  vec3 base = texture2D(albedoSampler, vUV).rgb;
  vec3 mapNormal = texture2D(normalSampler, vUV).xyz * 2.0 - 1.0;
  mapNormal.xy *= uPaintParams.x;
  normal = ffPerturbNormal(normal, vWorldPosition, vUV, normalize(mapNormal));
  float gloss = 0.06;
#else
  vec3 base = vColor.rgb;
  float gloss = 0.3;
#endif
  // Painted textures come out slightly flat after JPEG; push them back
  // towards the saturated comic palette of the owner's sheets.
  float luma = dot(base, vec3(0.299, 0.587, 0.114));
  base = mix(vec3(luma), base, uPaintParams.y);
  base = clamp((base - 0.5) * uPaintParams.z + 0.5, 0.0, 1.0);

  float grain = hash13(floor(vWorldPosition * 24.0));
  float sootMask = smoothstep(0.58, 0.86, grain) * clamp(uBattleDamage, 0.0, 1.0);
  base = mix(base, vec3(0.075, 0.065, 0.055), sootMask * 0.82);
  base = mix(base, vec3(0.045, 0.04, 0.038), clamp(uCharredState, 0.0, 1.0) * 0.9);
  base = mix(base, vec3(0.66, 0.9, 1.0), clamp(uFrozenState, 0.0, 1.0) * 0.62);

  float vinyl = gloss * (1.0 - clamp(uCharredState, 0.0, 1.0)) + clamp(uFrozenState, 0.0, 1.0) * 0.6;
  vec3 lit = ffToon(base, normal, vWorldPosition, vinyl, rimStrength * 1.6, 1.0);
  // The painting already carries its own soft shading: lift the cel shade
  // band a little so the two do not stack into mud.
  lit = mix(lit, max(lit, base * uFFSunColor * 0.78), uPaintParams.w);

  float iceShimmer = sin(uTime * 4.0 + vWorldPosition.y * 18.0) * 0.5 + 0.5;
  lit += vec3(0.55, 0.85, 1.0) * uFrozenState * (0.22 + iceShimmer * 0.18);
  lit += vec3(1.0, 0.42, 0.12) * uCharredState * (0.04 + sootMask * 0.05);

  lit = ffHaze(lit, vWorldPosition);
  gl_FragColor = vec4(lit, 1.0);
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

fn hash13(pIn : vec3f) -> f32 {
  var p = fract(pIn * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

fn ffPerturbNormal(n : vec3f, p : vec3f, uv : vec2f, mapNormal : vec3f) -> vec3f {
  let dp1 = dpdx(p);
  let dp2 = dpdy(p);
  let duv1 = dpdx(uv);
  let duv2 = dpdy(uv);
  let dp2perp = cross(dp2, n);
  let dp1perp = cross(n, dp1);
  let t = dp2perp * duv1.x + dp1perp * duv2.x;
  let b = dp2perp * duv1.y + dp1perp * duv2.y;
  let scale = inverseSqrt(max(max(dot(t, t), dot(b, b)), 1e-12));
  return normalize(t * scale * mapNormal.x + b * scale * mapNormal.y + n * mapNormal.z);
}

@fragment
fn main(input : FragmentInputs) -> FragmentOutputs {
  var normal = normalize(input.vWorldNormal);
  if (!fragmentInputs.frontFacing) { normal = -normal; }

#ifdef FF_TEXTURED
  var base = textureSample(albedoSampler, albedoSamplerSampler, input.vUV).rgb;
  var mapNormal = textureSample(normalSampler, normalSamplerSampler, input.vUV).xyz * 2.0 - 1.0;
  mapNormal = vec3f(mapNormal.xy * uniforms.uPaintParams.x, mapNormal.z);
  normal = ffPerturbNormal(normal, input.vWorldPosition, input.vUV, normalize(mapNormal));
  let gloss = 0.06;
#else
  var base = input.vColor.rgb;
  let gloss = 0.3;
#endif
  let luma = dot(base, vec3f(0.299, 0.587, 0.114));
  base = mix(vec3f(luma), base, uniforms.uPaintParams.y);
  base = clamp((base - 0.5) * uniforms.uPaintParams.z + 0.5, vec3f(0.0), vec3f(1.0));

  let grain = hash13(floor(input.vWorldPosition * 24.0));
  let sootMask = smoothstep(0.58, 0.86, grain) * clamp(uniforms.uBattleDamage, 0.0, 1.0);
  base = mix(base, vec3f(0.075, 0.065, 0.055), sootMask * 0.82);
  base = mix(base, vec3f(0.045, 0.04, 0.038), clamp(uniforms.uCharredState, 0.0, 1.0) * 0.9);
  base = mix(base, vec3f(0.66, 0.9, 1.0), clamp(uniforms.uFrozenState, 0.0, 1.0) * 0.62);

  let vinyl = gloss * (1.0 - clamp(uniforms.uCharredState, 0.0, 1.0)) + clamp(uniforms.uFrozenState, 0.0, 1.0) * 0.6;
  var lit = ffToon(base, normal, input.vWorldPosition, vinyl, uniforms.rimStrength * 1.6, 1.0);
  lit = mix(lit, max(lit, base * uniforms.uFFSunColor * 0.78), uniforms.uPaintParams.w);

  let iceShimmer = sin(uniforms.uTime * 4.0 + input.vWorldPosition.y * 18.0) * 0.5 + 0.5;
  lit += vec3f(0.55, 0.85, 1.0) * uniforms.uFrozenState * (0.22 + iceShimmer * 0.18);
  lit += vec3f(1.0, 0.42, 0.12) * uniforms.uCharredState * (0.04 + sootMask * 0.05);

  lit = ffHaze(lit, input.vWorldPosition);
  fragmentOutputs.color = vec4f(lit, 1.0);
}
`;
