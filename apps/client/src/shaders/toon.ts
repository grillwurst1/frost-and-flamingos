import {
  INSTANCED_WORLD_GLSL,
  INSTANCED_WORLD_WGSL,
  INSTANCED_WORLD_WGSL_MAIN,
  LOOK_FRAGMENT_GLSL,
  LOOK_FRAGMENT_WGSL,
} from './look-common';
import { DETAIL_FRAGMENT_GLSL, DETAIL_FRAGMENT_WGSL } from './detail';

/**
 * Shared comic cel shader for the map and every prop. Lighting lives in
 * look-common.ts (also used by the character shader), illustrated surface
 * detail in detail.ts. Supports plain meshes, instances and thin instances.
 * The same shader is expressed twice so the game runs on WebGPU and WebGL2.
 */
export const toonVertexGLSL = /* glsl */ `
precision highp float;

attribute vec3 position;
attribute vec3 normal;
#ifdef VERTEXCOLOR
attribute vec4 color;
#endif

uniform mat4 viewProjection;
${INSTANCED_WORLD_GLSL}

varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
varying vec3 vLocalPosition;
varying vec3 vLocalNormal;
varying vec4 vColor;

void main(void) {
  mat4 finalWorld = ffFinalWorld();
  vec4 worldPosition = finalWorld * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  vWorldNormal = normalize((finalWorld * vec4(normal, 0.0)).xyz);
  vLocalPosition = position;
  vLocalNormal = normal;
#ifdef VERTEXCOLOR
  vColor = color;
#else
  vColor = vec4(0.82, 0.82, 0.8, 1.0);
#endif
  gl_Position = viewProjection * worldPosition;
}
`;

export const toonFragmentGLSL = /* glsl */ `
precision highp float;

varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
varying vec3 vLocalPosition;
varying vec3 vLocalNormal;
varying vec4 vColor;

uniform vec3 lightDirection;
uniform vec3 cameraPosition;
uniform float rimStrength;
${LOOK_FRAGMENT_GLSL}
${DETAIL_FRAGMENT_GLSL}

void main(void) {
  float gloss;
  float hatch;
  vec3 dpx = dFdx(vLocalPosition);
  vec3 dpy = dFdy(vLocalPosition);
  vec3 albedo = ffSurface(vColor, vLocalPosition, vLocalNormal, vWorldPosition, dpx, dpy, gloss, hatch);
  vec3 normal = normalize(vWorldNormal);
  vec3 lit = ffToon(albedo, normal, vWorldPosition, gloss, rimStrength, hatch);
  gl_FragColor = vec4(ffHaze(lit, vWorldPosition), 1.0);
}
`;

export const toonVertexWGSL = /* wgsl */ `
attribute position : vec3f;
attribute normal : vec3f;
#ifdef VERTEXCOLOR
attribute color : vec4f;
#endif

uniform viewProjection : mat4x4f;
${INSTANCED_WORLD_WGSL}

varying vWorldPosition : vec3f;
varying vWorldNormal : vec3f;
varying vLocalPosition : vec3f;
varying vLocalNormal : vec3f;
varying vColor : vec4f;

@vertex
fn main(input : VertexInputs) -> FragmentInputs {
${INSTANCED_WORLD_WGSL_MAIN}
  let worldPosition = finalWorld * vec4f(input.position, 1.0);
  vertexOutputs.position = uniforms.viewProjection * worldPosition;
  vertexOutputs.vWorldPosition = worldPosition.xyz;
  vertexOutputs.vWorldNormal = normalize((finalWorld * vec4f(input.normal, 0.0)).xyz);
  vertexOutputs.vLocalPosition = input.position;
  vertexOutputs.vLocalNormal = input.normal;
#ifdef VERTEXCOLOR
  vertexOutputs.vColor = input.color;
#else
  vertexOutputs.vColor = vec4f(0.82, 0.82, 0.8, 1.0);
#endif
}
`;

export const toonFragmentWGSL = /* wgsl */ `
uniform lightDirection : vec3f;
uniform cameraPosition : vec3f;
uniform rimStrength : f32;
${LOOK_FRAGMENT_WGSL}
${DETAIL_FRAGMENT_WGSL}

varying vWorldPosition : vec3f;
varying vWorldNormal : vec3f;
varying vLocalPosition : vec3f;
varying vLocalNormal : vec3f;
varying vColor : vec4f;

@fragment
fn main(input : FragmentInputs) -> FragmentOutputs {
  let dpx = dpdx(input.vLocalPosition);
  let dpy = dpdy(input.vLocalPosition);
  let surface = ffSurface(input.vColor, input.vLocalPosition, input.vLocalNormal, input.vWorldPosition, dpx, dpy);
  let normal = normalize(input.vWorldNormal);
  let lit = ffToon(surface.albedo, normal, input.vWorldPosition, surface.gloss, uniforms.rimStrength, surface.hatch);
  fragmentOutputs.color = vec4f(ffHaze(lit, input.vWorldPosition), 1.0);
}
`;
