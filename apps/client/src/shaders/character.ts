import { LOOK_FRAGMENT_GLSL, LOOK_FRAGMENT_WGSL } from './look-common';

/**
 * Character cel shader. Vertex-colour alpha is repurposed as a skin mask:
 * alpha 1 = skin (tinted by uSkinColor), alpha 0 = cloth/cosmetic paint.
 * The output is always opaque, so the mask never makes a part transparent.
 *
 * uBattleDamage adds procedural soot, uCharredState burns the whole model and
 * uFrozenState coats it in a pale ice glaze for the elemental knockouts.
 */
export const characterVertexGLSL = /* glsl */ `
precision highp float;

attribute vec3 position;
attribute vec3 normal;
attribute vec4 color;

uniform mat4 world;
uniform mat4 worldViewProjection;

varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
varying vec4 vColor;

void main(void) {
  vec4 worldPosition = world * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  vWorldNormal = normalize((world * vec4(normal, 0.0)).xyz);
  vColor = color;
  gl_Position = worldViewProjection * vec4(position, 1.0);
}
`;

export const characterFragmentGLSL = /* glsl */ `
precision highp float;

varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
varying vec4 vColor;

uniform vec3 lightDirection;
uniform vec3 cameraPosition;
uniform vec4 fogColor;
uniform float fogNear;
uniform float fogFar;
uniform float rimStrength;
uniform vec3 uSkinColor;
uniform float uBattleDamage;
uniform float uCharredState;
uniform float uFrozenState;
uniform float uTime;
${LOOK_FRAGMENT_GLSL}

float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

void main(void) {
  vec3 normal = normalize(vWorldNormal);

  float skinMask = clamp(vColor.a, 0.0, 1.0);
  vec3 base = mix(vColor.rgb, uSkinColor, skinMask);

  float grain = hash13(floor(vWorldPosition * 24.0));
  float sootMask = smoothstep(0.58, 0.86, grain) * clamp(uBattleDamage, 0.0, 1.0);
  base = mix(base, vec3(0.075, 0.065, 0.055), sootMask * 0.82);
  base = mix(base, vec3(0.045, 0.04, 0.038), clamp(uCharredState, 0.0, 1.0) * 0.94);
  base = mix(base, vec3(0.66, 0.9, 1.0), clamp(uFrozenState, 0.0, 1.0) * 0.62);

  // Shared comic lighting (look-common.ts): cel bands, tinted shade, cast
  // shadows, rim and a soft vinyl glint so the rig reads like a painted toy.
  float vinyl = (1.0 - skinMask) * 0.32 * (1.0 - clamp(uCharredState, 0.0, 1.0)) + clamp(uFrozenState, 0.0, 1.0) * 0.6;
  vec3 lit = ffToon(base, normal, vWorldPosition, vinyl, rimStrength * 1.6, 1.0);

  float iceShimmer = sin(uTime * 4.0 + vWorldPosition.y * 18.0) * 0.5 + 0.5;
  lit += vec3(0.55, 0.85, 1.0) * uFrozenState * (0.22 + iceShimmer * 0.18);
  lit += vec3(1.0, 0.42, 0.12) * uCharredState * (0.04 + sootMask * 0.05);

  lit = ffHaze(lit, vWorldPosition);

  gl_FragColor = vec4(lit, 1.0);
}
`;

export const characterVertexWGSL = /* wgsl */ `
attribute position : vec3f;
attribute normal : vec3f;
attribute color : vec4f;

uniform world : mat4x4f;
uniform worldViewProjection : mat4x4f;

varying vWorldPosition : vec3f;
varying vWorldNormal : vec3f;
varying vColor : vec4f;

@vertex
fn main(input : VertexInputs) -> FragmentInputs {
  let worldPosition = uniforms.world * vec4f(input.position, 1.0);
  vertexOutputs.position = uniforms.worldViewProjection * vec4f(input.position, 1.0);
  vertexOutputs.vWorldPosition = worldPosition.xyz;
  vertexOutputs.vWorldNormal = normalize((uniforms.world * vec4f(input.normal, 0.0)).xyz);
  vertexOutputs.vColor = input.color;
}
`;

export const characterFragmentWGSL = /* wgsl */ `
uniform lightDirection : vec3f;
uniform cameraPosition : vec3f;
uniform fogColor : vec4f;
uniform fogNear : f32;
uniform fogFar : f32;
uniform rimStrength : f32;
uniform uSkinColor : vec3f;
uniform uBattleDamage : f32;
uniform uCharredState : f32;
uniform uFrozenState : f32;
uniform uTime : f32;
${LOOK_FRAGMENT_WGSL}

varying vWorldPosition : vec3f;
varying vWorldNormal : vec3f;
varying vColor : vec4f;

fn hash13(pIn : vec3f) -> f32 {
  var p = fract(pIn * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

@fragment
fn main(input : FragmentInputs) -> FragmentOutputs {
  let normal = normalize(input.vWorldNormal);

  let skinMask = clamp(input.vColor.a, 0.0, 1.0);
  var base = mix(input.vColor.rgb, uniforms.uSkinColor, skinMask);

  let grain = hash13(floor(input.vWorldPosition * 24.0));
  let sootMask = smoothstep(0.58, 0.86, grain) * clamp(uniforms.uBattleDamage, 0.0, 1.0);
  base = mix(base, vec3f(0.075, 0.065, 0.055), sootMask * 0.82);
  base = mix(base, vec3f(0.045, 0.04, 0.038), clamp(uniforms.uCharredState, 0.0, 1.0) * 0.94);
  base = mix(base, vec3f(0.66, 0.9, 1.0), clamp(uniforms.uFrozenState, 0.0, 1.0) * 0.62);

  // Shared comic lighting (look-common.ts): cel bands, tinted shade, cast
  // shadows, rim and a soft vinyl glint so the rig reads like a painted toy.
  let vinyl = (1.0 - skinMask) * 0.32 * (1.0 - clamp(uniforms.uCharredState, 0.0, 1.0)) + clamp(uniforms.uFrozenState, 0.0, 1.0) * 0.6;
  var lit = ffToon(base, normal, input.vWorldPosition, vinyl, uniforms.rimStrength * 1.6, 1.0);

  let iceShimmer = sin(uniforms.uTime * 4.0 + input.vWorldPosition.y * 18.0) * 0.5 + 0.5;
  lit += vec3f(0.55, 0.85, 1.0) * uniforms.uFrozenState * (0.22 + iceShimmer * 0.18);
  lit += vec3f(1.0, 0.42, 0.12) * uniforms.uCharredState * (0.04 + sootMask * 0.05);

  lit = ffHaze(lit, input.vWorldPosition);

  fragmentOutputs.color = vec4f(lit, 1.0);
}
`;
