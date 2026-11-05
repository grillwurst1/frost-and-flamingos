import { INSTANCED_WORLD_GLSL, INSTANCED_WORLD_WGSL, INSTANCED_WORLD_WGSL_MAIN } from './look-common';

/** A fixed five-quad VFX pool. Only the effect faces the camera; chalet/actors
 * remain ordinary solid 3D geometry. Ink is authored in the eight-frame sheet.
 */
export const comicFireVertexGLSL = /* glsl */ `
precision highp float;
attribute vec3 position;
attribute vec2 uv;
uniform mat4 viewProjection;
uniform vec3 uFireRight;
${INSTANCED_WORLD_GLSL}
varying vec2 vFireUV;
varying float vFirePhase;
void main(void) {
  mat4 finalWorld = ffFinalWorld();
  vec3 center = finalWorld[3].xyz;
  vec3 at = center + uFireRight * position.x * length(finalWorld[0].xyz) + vec3(0.0, position.y * length(finalWorld[1].xyz), 0.0);
  vFireUV = vec2(uv.x, 1.0 - uv.y); vFirePhase = center.x * .37 + center.z * .21;
  gl_Position = viewProjection * vec4(at, 1.0);
}
`;
export const comicFireFragmentGLSL = /* glsl */ `
precision highp float;
varying vec2 vFireUV;
varying float vFirePhase;
uniform sampler2D fireSampler;
uniform float uFireTime;
void main(void) {
  float frame = mod(floor(uFireTime * 12.0 + vFirePhase), 8.0);
  vec2 cell = vec2(mod(frame, 4.0), floor(frame / 4.0));
  vec2 coord = (cell + .008 + vFireUV * .984) * vec2(.25, .5);
  vec4 paint = texture2D(fireSampler, coord);
  if (paint.a < .38) discard;
  gl_FragColor = vec4(paint.rgb, 1.0);
}
`;
export const comicFireVertexWGSL = /* wgsl */ `
attribute position : vec3f;
attribute uv : vec2f;
uniform viewProjection : mat4x4f;
uniform uFireRight : vec3f;
${INSTANCED_WORLD_WGSL}
varying vFireUV : vec2f;
varying vFirePhase : f32;
@vertex
fn main(input : VertexInputs) -> FragmentInputs {
${INSTANCED_WORLD_WGSL_MAIN}
  let center = finalWorld[3].xyz;
  let at = center + uniforms.uFireRight * input.position.x * length(finalWorld[0].xyz) + vec3f(0.0, input.position.y * length(finalWorld[1].xyz), 0.0);
  vertexOutputs.vFireUV = vec2f(input.uv.x, 1.0 - input.uv.y);
  vertexOutputs.vFirePhase = center.x * .37 + center.z * .21;
  vertexOutputs.position = uniforms.viewProjection * vec4f(at, 1.0);
}
`;
export const comicFireFragmentWGSL = /* wgsl */ `
varying vFireUV : vec2f;
varying vFirePhase : f32;
uniform uFireTime : f32;
var fireSamplerSampler : sampler;
var fireSampler : texture_2d<f32>;
@fragment
fn main(input : FragmentInputs) -> FragmentOutputs {
  let frame = floor(uniforms.uFireTime * 12.0 + input.vFirePhase) % 8.0;
  let cell = vec2f(frame % 4.0, floor(frame / 4.0));
  let coord = (cell + .008 + input.vFireUV * .984) * vec2f(.25, .5);
  let paint = textureSample(fireSampler, fireSamplerSampler, coord);
  if (paint.a < .38) { discard; }
  fragmentOutputs.color = vec4f(paint.rgb, 1.0);
}
`;
