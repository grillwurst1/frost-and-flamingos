/**
 * Painted cumulus billboard (art/clouds/cloud-XX.png). Camera-facing quads on a
 * far ring inside the sky dome; tinted by the weather look and hazed towards
 * the horizon colour near the ground line. Alpha blended, no depth write.
 */
export const cloudVertexGLSL = /* glsl */ `
precision highp float;

attribute vec3 position;
attribute vec2 uv;

uniform mat4 world;
uniform mat4 worldViewProjection;

varying vec2 vUV;
varying vec3 vWorldPosition;

void main(void) {
  vUV = uv;
  vWorldPosition = (world * vec4(position, 1.0)).xyz;
  gl_Position = worldViewProjection * vec4(position, 1.0);
}
`;

export const cloudFragmentGLSL = /* glsl */ `
precision highp float;

varying vec2 vUV;
varying vec3 vWorldPosition;

uniform sampler2D cloudTexture;
uniform vec3 cameraPosition;
uniform vec3 uCloudTint;
uniform vec3 uCloudHaze;
uniform float uOpacity;

void main(void) {
  vec4 texel = texture2D(cloudTexture, vUV);
  vec3 dir = normalize(vWorldPosition - cameraPosition);
  float low = 1.0 - smoothstep(0.0, 0.12, dir.y);
  vec3 color = mix(texel.rgb * uCloudTint, uCloudHaze, low * 0.45);
  gl_FragColor = vec4(color, texel.a * uOpacity);
}
`;

export const cloudVertexWGSL = /* wgsl */ `
attribute position : vec3f;
attribute uv : vec2f;

uniform world : mat4x4f;
uniform worldViewProjection : mat4x4f;

varying vUV : vec2f;
varying vWorldPosition : vec3f;

@vertex
fn main(input : VertexInputs) -> FragmentInputs {
  vertexOutputs.vUV = input.uv;
  vertexOutputs.vWorldPosition = (uniforms.world * vec4f(input.position, 1.0)).xyz;
  vertexOutputs.position = uniforms.worldViewProjection * vec4f(input.position, 1.0);
}
`;

export const cloudFragmentWGSL = /* wgsl */ `
var cloudTextureSampler : sampler;
var cloudTexture : texture_2d<f32>;
uniform cameraPosition : vec3f;
uniform uCloudTint : vec3f;
uniform uCloudHaze : vec3f;
uniform uOpacity : f32;

varying vUV : vec2f;
varying vWorldPosition : vec3f;

@fragment
fn main(input : FragmentInputs) -> FragmentOutputs {
  let texel = textureSample(cloudTexture, cloudTextureSampler, input.vUV);
  let dir = normalize(input.vWorldPosition - uniforms.cameraPosition);
  let low = 1.0 - smoothstep(0.0, 0.12, dir.y);
  let color = mix(texel.rgb * uniforms.uCloudTint, uniforms.uCloudHaze, low * 0.45);
  fragmentOutputs.color = vec4f(color, texel.a * uniforms.uOpacity);
}
`;
