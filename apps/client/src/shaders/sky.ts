/** Gradient sky dome with a hard cartoon sun, horizon haze and drifting cloud bands. */
export const skyVertexGLSL = /* glsl */ `
precision highp float;

attribute vec3 position;

uniform mat4 worldViewProjection;

varying vec3 vDirection;

void main(void) {
  vDirection = normalize(position);
  gl_Position = worldViewProjection * vec4(position, 1.0);
}
`;

export const skyFragmentGLSL = /* glsl */ `
precision highp float;

varying vec3 vDirection;

uniform vec3 sunDirection;
uniform vec3 zenithColor;
uniform vec3 horizonColor;
uniform vec3 sunColor;
uniform float time;

void main(void) {
  vec3 direction = normalize(vDirection);
  float height = clamp(direction.y, -0.25, 1.0);
  float gradient = pow(max(height, 0.0), 0.52);
  vec3 color = mix(horizonColor, zenithColor, gradient);

  float belowHorizon = smoothstep(-0.25, 0.02, height);
  color = mix(horizonColor * 0.55, color, belowHorizon);

  float sunDot = max(dot(direction, normalize(sunDirection)), 0.0);
  float sunDisc = smoothstep(0.9982, 0.9995, sunDot);
  float sunHalo = pow(sunDot, 18.0) * 0.28;
  color += sunColor * (sunDisc * 1.5 + sunHalo);

  float cloudBand = smoothstep(0.08, 0.32, height) * (1.0 - smoothstep(0.55, 0.78, height));
  float clouds =
    sin(direction.x * 11.0 + direction.z * 7.0 + time * 0.006) *
    sin(direction.z * 13.0 - direction.x * 5.0 - time * 0.004);
  clouds = smoothstep(0.35, 0.92, clouds) * cloudBand * 0.22;
  color = mix(color, vec3(1.0, 0.98, 0.92), clouds);

  gl_FragColor = vec4(color, 1.0);
}
`;

export const skyVertexWGSL = /* wgsl */ `
attribute position : vec3f;

uniform worldViewProjection : mat4x4f;

varying vDirection : vec3f;

@vertex
fn main(input : VertexInputs) -> FragmentInputs {
  vertexOutputs.vDirection = normalize(input.position);
  vertexOutputs.position = uniforms.worldViewProjection * vec4f(input.position, 1.0);
}
`;

export const skyFragmentWGSL = /* wgsl */ `
uniform sunDirection : vec3f;
uniform zenithColor : vec3f;
uniform horizonColor : vec3f;
uniform sunColor : vec3f;
uniform time : f32;

varying vDirection : vec3f;

@fragment
fn main(input : FragmentInputs) -> FragmentOutputs {
  let direction = normalize(input.vDirection);
  let height = clamp(direction.y, -0.25, 1.0);
  let gradient = pow(max(height, 0.0), 0.52);
  var color = mix(uniforms.horizonColor, uniforms.zenithColor, gradient);

  let belowHorizon = smoothstep(-0.25, 0.02, height);
  color = mix(uniforms.horizonColor * 0.55, color, belowHorizon);

  let sunDot = max(dot(direction, normalize(uniforms.sunDirection)), 0.0);
  let sunDisc = smoothstep(0.9982, 0.9995, sunDot);
  let sunHalo = pow(sunDot, 18.0) * 0.28;
  color += uniforms.sunColor * (sunDisc * 1.5 + sunHalo);

  let cloudBand = smoothstep(0.08, 0.32, height) * (1.0 - smoothstep(0.55, 0.78, height));
  var clouds =
    sin(direction.x * 11.0 + direction.z * 7.0 + uniforms.time * 0.006) *
    sin(direction.z * 13.0 - direction.x * 5.0 - uniforms.time * 0.004);
  clouds = smoothstep(0.35, 0.92, clouds) * cloudBand * 0.22;
  color = mix(color, vec3f(1.0, 0.98, 0.92), clouds);

  fragmentOutputs.color = vec4f(color, 1.0);
}
`;
