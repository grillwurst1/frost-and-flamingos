/** Stylized lagoon water: vertex waves, fresnel sky, hard sun glint and shore foam. */
export const waterVertexGLSL = /* glsl */ `
precision highp float;

attribute vec3 position;
attribute vec4 color;

uniform mat4 world;
uniform mat4 worldViewProjection;
uniform float time;

varying vec3 vWorldPosition;
varying vec4 vColor;
varying float vWave;

void main(void) {
  vec3 displaced = position;
  float wave =
    sin(position.x * 0.11 + time * 0.9) * 0.09 +
    cos(position.z * 0.14 - time * 0.7) * 0.07 +
    sin((position.x + position.z) * 0.045 + time * 0.35) * 0.16;
  displaced.y += wave;

  vec4 worldPosition = world * vec4(displaced, 1.0);
  vWorldPosition = worldPosition.xyz;
  vColor = color;
  vWave = wave;
  gl_Position = worldViewProjection * vec4(displaced, 1.0);
}
`;

export const waterFragmentGLSL = /* glsl */ `
precision highp float;

varying vec3 vWorldPosition;
varying vec4 vColor;
varying float vWave;

uniform float time;
uniform vec3 cameraPosition;
uniform vec3 sunDirection;
uniform vec4 deepColor;
uniform vec4 shallowColor;
uniform vec4 foamColor;
uniform vec4 skyColor;

void main(void) {
  vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
  float dx =
    cos(vWorldPosition.x * 0.11 + time * 0.9) * 0.11 * 0.09 +
    cos((vWorldPosition.x + vWorldPosition.z) * 0.045 + time * 0.35) * 0.045 * 0.16;
  float dz =
    -sin(vWorldPosition.z * 0.14 - time * 0.7) * 0.14 * 0.07 +
    cos((vWorldPosition.x + vWorldPosition.z) * 0.045 + time * 0.35) * 0.045 * 0.16;
  vec3 normal = normalize(vec3(-dx, 1.0, -dz));

  float fresnel = pow(1.0 - clamp(dot(normal, viewDirection), 0.0, 1.0), 2.2);
  float depth = clamp(vColor.g, 0.0, 1.0);
  vec3 base = mix(shallowColor.rgb, deepColor.rgb, smoothstep(0.05, 0.72, depth));
  base = mix(base, skyColor.rgb, fresnel * 0.38);

  float foamBand = smoothstep(0.42, 0.92, vColor.r);
  float foamNoise = 0.55 + 0.45 * sin(vWorldPosition.x * 0.45 + vWorldPosition.z * 0.28 + time * 1.6);
  float foam = foamBand * foamNoise;
  base = mix(base, foamColor.rgb, clamp(foam, 0.0, 0.92));

  vec3 halfVector = normalize(sunDirection + viewDirection);
  float glint = pow(max(dot(normal, halfVector), 0.0), 180.0);
  base += vec3(1.0, 0.93, 0.72) * glint * 0.7;

  float alpha = vColor.a * (0.78 + fresnel * 0.2);
  gl_FragColor = vec4(base, alpha);
}
`;

export const waterVertexWGSL = /* wgsl */ `
attribute position : vec3f;
attribute color : vec4f;

uniform world : mat4x4f;
uniform worldViewProjection : mat4x4f;
uniform time : f32;

varying vWorldPosition : vec3f;
varying vColor : vec4f;
varying vWave : f32;

@vertex
fn main(input : VertexInputs) -> FragmentInputs {
  var displaced = input.position;
  let wave =
    sin(input.position.x * 0.11 + uniforms.time * 0.9) * 0.09 +
    cos(input.position.z * 0.14 - uniforms.time * 0.7) * 0.07 +
    sin((input.position.x + input.position.z) * 0.045 + uniforms.time * 0.35) * 0.16;
  displaced.y += wave;

  let worldPosition = uniforms.world * vec4f(displaced, 1.0);
  vertexOutputs.position = uniforms.worldViewProjection * vec4f(displaced, 1.0);
  vertexOutputs.vWorldPosition = worldPosition.xyz;
  vertexOutputs.vColor = input.color;
  vertexOutputs.vWave = wave;
}
`;

export const waterFragmentWGSL = /* wgsl */ `
uniform time : f32;
uniform cameraPosition : vec3f;
uniform sunDirection : vec3f;
uniform deepColor : vec4f;
uniform shallowColor : vec4f;
uniform foamColor : vec4f;
uniform skyColor : vec4f;

varying vWorldPosition : vec3f;
varying vColor : vec4f;
varying vWave : f32;

@fragment
fn main(input : FragmentInputs) -> FragmentOutputs {
  let viewDirection = normalize(uniforms.cameraPosition - input.vWorldPosition);
  let dx =
    cos(input.vWorldPosition.x * 0.11 + uniforms.time * 0.9) * 0.11 * 0.09 +
    cos((input.vWorldPosition.x + input.vWorldPosition.z) * 0.045 + uniforms.time * 0.35) * 0.045 * 0.16;
  let dz =
    -sin(input.vWorldPosition.z * 0.14 - uniforms.time * 0.7) * 0.14 * 0.07 +
    cos((input.vWorldPosition.x + input.vWorldPosition.z) * 0.045 + uniforms.time * 0.35) * 0.045 * 0.16;
  let normal = normalize(vec3f(-dx, 1.0, -dz));

  let fresnel = pow(1.0 - clamp(dot(normal, viewDirection), 0.0, 1.0), 2.2);
  let depth = clamp(input.vColor.g, 0.0, 1.0);
  var base = mix(uniforms.shallowColor.rgb, uniforms.deepColor.rgb, smoothstep(0.05, 0.72, depth));
  base = mix(base, uniforms.skyColor.rgb, fresnel * 0.38);

  let foamBand = smoothstep(0.42, 0.92, input.vColor.r);
  let foamNoise = 0.55 + 0.45 * sin(input.vWorldPosition.x * 0.45 + input.vWorldPosition.z * 0.28 + uniforms.time * 1.6);
  let foam = foamBand * foamNoise;
  base = mix(base, uniforms.foamColor.rgb, clamp(foam, 0.0, 0.92));

  let halfVector = normalize(uniforms.sunDirection + viewDirection);
  let glint = pow(max(dot(normal, halfVector), 0.0), 180.0);
  base += vec3f(1.0, 0.93, 0.72) * glint * 0.7;

  let alpha = input.vColor.a * (0.78 + fresnel * 0.2);
  fragmentOutputs.color = vec4f(base, alpha);
}
`;
