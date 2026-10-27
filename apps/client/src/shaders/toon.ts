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
#ifdef FF_TERRAIN
attribute vec4 terrainMixA;
attribute vec4 terrainMixB;
varying vec4 vTerrainMixA;
varying vec4 vTerrainMixB;
#endif

uniform mat4 viewProjection;
${INSTANCED_WORLD_GLSL}

varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
varying vec3 vLocalPosition;
varying vec3 vLocalNormal;
varying vec4 vColor;

void main(void) {
#ifdef FF_TERRAIN
  vTerrainMixA = terrainMixA;
  vTerrainMixB = terrainMixB;
#endif
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
#ifdef FF_TERRAIN
varying vec4 vTerrainMixA;
varying vec4 vTerrainMixB;
#endif

uniform vec3 lightDirection;
uniform vec3 cameraPosition;
uniform float rimStrength;
${LOOK_FRAGMENT_GLSL}
${DETAIL_FRAGMENT_GLSL}

void main(void) {
  float gloss;
  float hatch;
  vec3 normal = normalize(vWorldNormal);
#ifdef FF_PAVING
  // Same two-metre tile and orientation as map/paving-height.ts.
  vec2 uv = vWorldPosition.xz * 0.5;
  vec3 paint = ffColorTile(uv, dFdx(uv), dFdy(uv), 3.0);
  vec3 albedo = vColor.rgb * mix(vec3(1.0), clamp(paint * 2.0, 0.0, 1.8), 0.85);
  float reliefWeight = 0.025;
  gloss = 0.0;
  hatch = 1.0;
#elif defined(FF_TERRAIN)
  float reliefWeight = dot(vTerrainMixA, vec4(0.05, 0.035, 0.02, 0.07)) + dot(vTerrainMixB, vec4(0.12, 0.025, 0.01, 0.02));
  vec3 albedo = ffTerrainSurface(vColor, vTerrainMixA, vTerrainMixB, vWorldPosition, normal, gloss, hatch);
  vec3 cliffNormal = normalize(cross(dFdx(vWorldPosition), dFdy(vWorldPosition)));
  cliffNormal *= dot(cliffNormal, normal) < 0.0 ? -1.0 : 1.0;
  normal = normalize(mix(normal, cliffNormal, 1.0-smoothstep(0.5,0.78,normal.y)));
#else
  float reliefWeight = ffIsId(floor(vColor.a * 32.0), 4.0) * 0.12;
  vec3 dpx = dFdx(vLocalPosition);
  vec3 dpy = dFdy(vLocalPosition);
  vec3 albedo = ffSurface(vColor, vLocalPosition, vLocalNormal, vWorldPosition, dpx, dpy, gloss, hatch);
#endif
  float reliefFade = (1.0 - smoothstep(8.0, 38.0, length(cameraPosition - vWorldPosition))) * smoothstep(0.45, 0.85, normal.y);
  normal = ffGroundRelief(normal, vWorldPosition, dot(albedo, vec3(0.333333)) * reliefWeight * reliefFade);
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
#ifdef FF_TERRAIN
attribute terrainMixA : vec4f;
attribute terrainMixB : vec4f;
varying vTerrainMixA : vec4f;
varying vTerrainMixB : vec4f;
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
#ifdef FF_TERRAIN
  vertexOutputs.vTerrainMixA = input.terrainMixA;
  vertexOutputs.vTerrainMixB = input.terrainMixB;
#endif
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
#ifdef FF_TERRAIN
varying vTerrainMixA : vec4f;
varying vTerrainMixB : vec4f;
#endif

@fragment
fn main(input : FragmentInputs) -> FragmentOutputs {
#ifdef FF_PAVING
  let uv = input.vWorldPosition.xz * 0.5;
  let paint = ffColorTile(uv, dpdx(uv), dpdy(uv), 3.0);
  let surface = FFSurface(input.vColor.rgb * mix(vec3f(1.0), clamp(paint * 2.0, vec3f(0.0), vec3f(1.8)), 0.85), 0.0, 1.0);
  let reliefWeight = 0.025;
  let normal = normalize(input.vWorldNormal);
#elif defined(FF_TERRAIN)
  let reliefWeight = dot(input.vTerrainMixA, vec4f(0.05, 0.035, 0.02, 0.07)) + dot(input.vTerrainMixB, vec4f(0.12, 0.025, 0.01, 0.02));
  let dpx = dpdx(input.vWorldPosition);
  let dpy = dpdy(input.vWorldPosition);
  let surface = ffTerrainSurface(input.vColor, input.vTerrainMixA, input.vTerrainMixB, input.vWorldPosition, normalize(input.vWorldNormal), dpx, dpy);
  var cliffNormal = normalize(cross(dpx, dpy));
  cliffNormal *= select(1.0, -1.0, dot(cliffNormal, surface.normal) < 0.0);
  let normal = normalize(mix(surface.normal, cliffNormal, 1.0-smoothstep(0.5,0.78,surface.normal.y)));
#else
  let reliefWeight = ffIsId(floor(input.vColor.a * 32.0), 4.0) * 0.12;
  let dpx = dpdx(input.vLocalPosition);
  let dpy = dpdy(input.vLocalPosition);
  let surface = ffSurface(input.vColor, input.vLocalPosition, input.vLocalNormal, input.vWorldPosition, dpx, dpy);
  let normal = normalize(input.vWorldNormal);
#endif
  let reliefFade = (1.0 - smoothstep(8.0, 38.0, length(uniforms.cameraPosition - input.vWorldPosition))) * smoothstep(0.45, 0.85, normal.y);
  let reliefNormal = ffGroundRelief(normal, input.vWorldPosition, dot(surface.albedo, vec3f(0.333333)) * reliefWeight * reliefFade);
  let lit = ffToon(surface.albedo, reliefNormal, input.vWorldPosition, surface.gloss, uniforms.rimStrength, surface.hatch);
  fragmentOutputs.color = vec4f(ffHaze(lit, input.vWorldPosition), 1.0);
}
`;
