/**
 * Hand-authored cel shader. The same lighting model is expressed twice so the
 * game can run on WebGPU and WebGL2 without falling back to a stock material.
 */
export const toonVertexGLSL = /* glsl */ `
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

export const toonFragmentGLSL = /* glsl */ `
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

void main(void) {
  vec3 normal = normalize(vWorldNormal);
  vec3 light = normalize(lightDirection);
  vec3 viewDirection = normalize(cameraPosition - vWorldPosition);

  float ndl = dot(normal, light);
  float diffuse = 0.28;
  if (ndl > 0.0) diffuse = 0.48;
  if (ndl > 0.34) diffuse = 0.72;
  if (ndl > 0.68) diffuse = 0.93;
  if (ndl > 0.9) diffuse = 1.0;

  float skyBounce = clamp(normal.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 ambient = mix(vec3(0.16, 0.22, 0.3), vec3(0.42, 0.55, 0.66), skyBounce);
  vec3 base = vColor.rgb;
  vec3 lit = base * (ambient + vec3(diffuse) * 0.72);

  float rim = pow(1.0 - clamp(dot(normal, viewDirection), 0.0, 1.0), 3.0) * rimStrength;
  lit += vec3(0.42, 0.78, 0.95) * rim * 0.65;

  float distanceToCamera = length(cameraPosition - vWorldPosition);
  float fog = clamp((distanceToCamera - fogNear) / max(1.0, fogFar - fogNear), 0.0, 1.0);
  fog = fog * fog * 0.58;
  lit = mix(lit, fogColor.rgb, fog);

  gl_FragColor = vec4(lit, vColor.a);
}
`;

export const toonVertexWGSL = /* wgsl */ `
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

export const toonFragmentWGSL = /* wgsl */ `
uniform lightDirection : vec3f;
uniform cameraPosition : vec3f;
uniform fogColor : vec4f;
uniform fogNear : f32;
uniform fogFar : f32;
uniform rimStrength : f32;

varying vWorldPosition : vec3f;
varying vWorldNormal : vec3f;
varying vColor : vec4f;

@fragment
fn main(input : FragmentInputs) -> FragmentOutputs {
  let normal = normalize(input.vWorldNormal);
  let light = normalize(uniforms.lightDirection);
  let viewDirection = normalize(uniforms.cameraPosition - input.vWorldPosition);

  let ndl = dot(normal, light);
  var diffuse = 0.28;
  if (ndl > 0.0) { diffuse = 0.48; }
  if (ndl > 0.34) { diffuse = 0.72; }
  if (ndl > 0.68) { diffuse = 0.93; }
  if (ndl > 0.9) { diffuse = 1.0; }

  let skyBounce = clamp(normal.y * 0.5 + 0.5, 0.0, 1.0);
  let ambient = mix(vec3f(0.16, 0.22, 0.3), vec3f(0.42, 0.55, 0.66), skyBounce);
  let base = input.vColor.rgb;
  var lit = base * (ambient + vec3f(diffuse) * 0.72);

  let rim = pow(1.0 - clamp(dot(normal, viewDirection), 0.0, 1.0), 3.0) * uniforms.rimStrength;
  lit += vec3f(0.42, 0.78, 0.95) * rim * 0.65;

  let distanceToCamera = length(uniforms.cameraPosition - input.vWorldPosition);
  var fog = clamp((distanceToCamera - uniforms.fogNear) / max(1.0, uniforms.fogFar - uniforms.fogNear), 0.0, 1.0);
  fog = fog * fog * 0.58;
  lit = mix(lit, uniforms.fogColor.rgb, fog);

  fragmentOutputs.color = vec4f(lit, input.vColor.a);
}
`;
