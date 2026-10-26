import {
  INSTANCED_WORLD_GLSL,
  INSTANCED_WORLD_WGSL,
  INSTANCED_WORLD_WGSL_MAIN,
  LOOK_FRAGMENT_GLSL,
  LOOK_FRAGMENT_WGSL,
} from './look-common';

/**
 * Painted building facades (rendering/facade-atlas.ts + rendering/map/facades.ts).
 *
 * Walls, gables and roof planes of the owner-painted buildings sample one
 * facade atlas with planar per-face UVs. The panels are already shaded and
 * inked, so lighting is a softened version of the toon model: faces turned
 * from the sun and cast shadows fall into the tinted shade band, lit faces
 * keep the painted colours. Alpha-tested (gable silhouettes, chimneys,
 * pavilion gaps); the material reports its atlas as the alpha-test texture
 * so the g-buffer ink pass and the shadow map cut the same silhouette.
 * GLSL and WGSL blocks must stay equivalent.
 */
export const FACADE_UNIFORMS = ['world', 'viewProjection', 'cameraPosition', 'lightDirection', 'uFacadeParams'] as const;
export const FACADE_SAMPLERS = ['facadeAtlas'] as const;
export const FACADE_ATTRIBUTES = ['position', 'normal', 'uv'] as const;

export const facadeVertexGLSL = /* glsl */ `
precision highp float;

attribute vec3 position;
attribute vec3 normal;
attribute vec2 uv;

uniform mat4 viewProjection;
${INSTANCED_WORLD_GLSL}

varying vec2 vUV;
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;

void main(void) {
  mat4 finalWorld = ffFinalWorld();
  vec4 worldPosition = finalWorld * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  vWorldNormal = normalize((finalWorld * vec4(normal, 0.0)).xyz);
  vUV = uv;
  gl_Position = viewProjection * worldPosition;
}
`;

export const facadeFragmentGLSL = /* glsl */ `
precision highp float;

varying vec2 vUV;
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;

uniform sampler2D facadeAtlas;
uniform vec3 lightDirection;
uniform vec3 cameraPosition;
uniform vec4 uFacadeParams;
${LOOK_FRAGMENT_GLSL}

void main(void) {
  vec4 texel = texture2D(facadeAtlas, vUV);
  if (texel.a < uFacadeParams.x) discard;
  vec3 normal = normalize(vWorldNormal);
  vec3 light = normalize(lightDirection);
  float ndl = dot(normal, light);
  float shadow = ffShadow(vWorldPosition, normal, ndl);
  float facing = smoothstep(-0.06, 0.14, ndl + uFFToonParams.z);
  float lightLevel = mix(uFacadeParams.z, 1.0, facing) * mix(uFacadeParams.w, 1.0, shadow);
  vec3 albedo = texel.rgb;
  vec3 fill = mix(uFFGroundFill, uFFSkyFill, clamp(normal.y * 0.5 + 0.5, 0.0, 1.0));
  vec3 shade = albedo * ffShadeTint(albedo) * fill * uFacadeParams.y;
  vec3 lit = albedo * uFFSunColor * 1.03;
  vec3 color = mix(shade, lit, lightLevel);
  gl_FragColor = vec4(ffHaze(color, vWorldPosition), 1.0);
}
`;

export const facadeVertexWGSL = /* wgsl */ `
attribute position : vec3f;
attribute normal : vec3f;
attribute uv : vec2f;

uniform viewProjection : mat4x4f;
${INSTANCED_WORLD_WGSL}

varying vUV : vec2f;
varying vWorldPosition : vec3f;
varying vWorldNormal : vec3f;

@vertex
fn main(input : VertexInputs) -> FragmentInputs {
${INSTANCED_WORLD_WGSL_MAIN}
  let worldPosition = finalWorld * vec4f(input.position, 1.0);
  vertexOutputs.position = uniforms.viewProjection * worldPosition;
  vertexOutputs.vWorldPosition = worldPosition.xyz;
  vertexOutputs.vWorldNormal = normalize((finalWorld * vec4f(input.normal, 0.0)).xyz);
  vertexOutputs.vUV = input.uv;
}
`;

export const facadeFragmentWGSL = /* wgsl */ `
var facadeAtlasSampler : sampler;
var facadeAtlas : texture_2d<f32>;
uniform lightDirection : vec3f;
uniform cameraPosition : vec3f;
uniform uFacadeParams : vec4f;
${LOOK_FRAGMENT_WGSL}

varying vUV : vec2f;
varying vWorldPosition : vec3f;
varying vWorldNormal : vec3f;

@fragment
fn main(input : FragmentInputs) -> FragmentOutputs {
  let texel = textureSample(facadeAtlas, facadeAtlasSampler, input.vUV);
  if (texel.a < uniforms.uFacadeParams.x) { discard; }
  let normal = normalize(input.vWorldNormal);
  let light = normalize(uniforms.lightDirection);
  let ndl = dot(normal, light);
  let shadow = ffShadow(input.vWorldPosition, normal, ndl);
  let facing = smoothstep(-0.06, 0.14, ndl + uniforms.uFFToonParams.z);
  let lightLevel = mix(uniforms.uFacadeParams.z, 1.0, facing) * mix(uniforms.uFacadeParams.w, 1.0, shadow);
  let albedo = texel.rgb;
  let fill = mix(uniforms.uFFGroundFill, uniforms.uFFSkyFill, clamp(normal.y * 0.5 + 0.5, 0.0, 1.0));
  let shade = albedo * ffShadeTint(albedo) * fill * uniforms.uFacadeParams.y;
  let lit = albedo * uniforms.uFFSunColor * 1.03;
  let color = mix(shade, lit, lightLevel);
  fragmentOutputs.color = vec4f(ffHaze(color, input.vWorldPosition), 1.0);
}
`;
