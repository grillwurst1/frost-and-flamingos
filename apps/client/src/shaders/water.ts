/**
 * Comic lagoon water.
 *
 * Depth comes from the scene geometry buffer (linear view depth of every
 * opaque surface, water excluded): the distance along the view ray between
 * the water surface and the floor behind it gives the true water depth per
 * pixel, so shoreline foam hugs the terrain and wraps around piers, rocks and
 * swimmers automatically. Without the depth buffer the shader falls back to
 * the per-vertex depth baked by the map (vertex colour G, foam in R).
 *
 * Look: turquoise depth gradient (shallow -> mid -> deep), a hard white contact
 * line, foam bands rolling towards the shore, inked white wave squiggles on
 * open water, sun glint and twinkling star sparkles along the sun path.
 */
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
uniform vec4 midColor;
uniform vec4 uWaterParams;
uniform vec4 uFFScreen;
uniform vec3 uCamForward;
uniform vec4 uFFHazeColor;
uniform vec4 uFFHazeParams;
uniform vec3 uFFSunColor;
uniform sampler2D sceneDepth;
uniform sampler2D foamTex;

float ffHash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float ffNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(ffHash12(i), ffHash12(i + vec2(1.0, 0.0)), u.x), mix(ffHash12(i + vec2(0.0, 1.0)), ffHash12(i + vec2(1.0, 1.0)), u.x), u.y);
}

void main(void) {
  vec3 toCamera = cameraPosition - vWorldPosition;
  float distanceToCamera = length(toCamera);
  vec3 viewDirection = toCamera / max(distanceToCamera, 0.0001);
  vec3 light = normalize(sunDirection);

  float dx =
    cos(vWorldPosition.x * 0.11 + time * 0.9) * 0.11 * 0.09 +
    cos((vWorldPosition.x + vWorldPosition.z) * 0.045 + time * 0.35) * 0.045 * 0.16;
  float dz =
    -sin(vWorldPosition.z * 0.14 - time * 0.7) * 0.14 * 0.07 +
    cos((vWorldPosition.x + vWorldPosition.z) * 0.045 + time * 0.35) * 0.045 * 0.16;
  vec2 ripple = vec2(
    ffNoise(vWorldPosition.xz * 0.5 + vec2(time * 0.22, time * 0.13)),
    ffNoise(vWorldPosition.zx * 0.5 - vec2(time * 0.17, time * 0.2))
  ) - 0.5;
  vec3 normal = normalize(vec3(-dx + ripple.x * 0.09, 1.0, -dz + ripple.y * 0.09));

  float depth = vColor.g * 16.0;
  if (uWaterParams.x > 0.5) {
    float sceneZ = texture2D(sceneDepth, gl_FragCoord.xy * uFFScreen.xy).r;
    vec3 ray = -toCamera / max(distanceToCamera, 0.0001);
    float waterZ = dot(-toCamera, uCamForward);
    if (sceneZ > 0.0 && sceneZ > waterZ - 0.05) {
      float along = (sceneZ - waterZ) / max(dot(ray, uCamForward), 0.05);
      depth = max(along, 0.0) * max(-ray.y, 0.015);
    } else if (sceneZ <= 0.0) {
      depth = max(depth, 18.0);
    }
  }

  float n1 = ffNoise(vWorldPosition.xz * 0.32 + vec2(time * 0.05, time * 0.03));
  float n2 = ffNoise(vWorldPosition.xz * 1.1 - vec2(time * 0.09, time * 0.04));
  float shore = depth + (n1 - 0.5) * 0.22;
  float edgeFoam = 1.0 - smoothstep(0.1, 0.24, shore);
  float phase = depth * 1.45 - time * 0.42 + n1 * 0.9;
  float rolling = smoothstep(0.0, 0.05, fract(phase)) * (1.0 - smoothstep(0.1, 0.2, fract(phase)));
  rolling *= (1.0 - smoothstep(0.35, 1.8, depth)) * smoothstep(0.3, 0.48, n2 + 0.15);
  float squiggleField = ffNoise(vWorldPosition.xz * 0.07 + vec2(time * 0.012, -time * 0.008));
  float squiggle = 1.0 - smoothstep(0.0, 0.022, abs(squiggleField - 0.5));
  squiggle *= smoothstep(0.52, 0.68, ffNoise(vWorldPosition.xz * 0.13 + 7.3));
  squiggle *= smoothstep(1.4, 3.5, depth) * (1.0 - smoothstep(45.0, 140.0, distanceToCamera));
  float foam = max(edgeFoam, rolling) * uWaterParams.y;
  if (uWaterParams.w > 0.5) {
    // Painted crest streaks (alpha = foam) replace the procedural squiggles.
    float painted = texture2D(foamTex, vWorldPosition.xz * 0.045 + vec2(time * 0.006, time * 0.002)).a;
    float openWater = smoothstep(1.0, 2.6, depth) * (1.0 - smoothstep(70.0, 220.0, distanceToCamera));
    foam = max(foam, smoothstep(0.25, 0.7, painted) * openWater * 0.9);
  } else {
    foam = max(foam, squiggle * 0.8);
  }
  foam = clamp(foam, 0.0, 1.0);

  float shallowToMid = smoothstep(0.0, 2.6, depth);
  float midToDeep = smoothstep(2.2, 10.0, depth);
  vec3 base = mix(shallowColor.rgb, midColor.rgb, shallowToMid);
  base = mix(base, deepColor.rgb, midToDeep);
  float ndl = dot(normal, light);
  base *= mix(0.94, 1.05, smoothstep(0.5, 0.56, ndl));

  float fresnel = pow(1.0 - clamp(dot(normal, viewDirection), 0.0, 1.0), 3.0);
  base = mix(base, skyColor.rgb, fresnel * 0.42);

  vec3 halfVector = normalize(light + viewDirection);
  float glint = pow(max(dot(normal, halfVector), 0.0), 220.0);
  float glintAA = max(0.03, fwidth(glint));
  base += uFFSunColor * smoothstep(0.3 - glintAA, 0.5 + glintAA, glint) * 0.55;

  vec2 cellCoord = vWorldPosition.xz * 0.8;
  vec2 cell = floor(cellCoord);
  float cellHash = ffHash12(cell);
  vec2 local = fract(cellCoord) - 0.5 - (vec2(ffHash12(cell + 7.1), ffHash12(cell + 3.3)) - 0.5) * 0.5;
  vec2 starAA = max(fwidth(cellCoord), vec2(0.001));
  vec2 thin = vec2(1.0) - smoothstep(max(vec2(0.0), vec2(0.035) - starAA), vec2(0.035) + starAA, abs(local));
  vec2 arm = vec2(1.0) - smoothstep(max(vec2(0.0), vec2(0.22) - starAA), vec2(0.22) + starAA, abs(local));
  float star = max(thin.x * arm.y, thin.y * arm.x);
  star *= 1.0 - smoothstep(0.12, 0.65, max(starAA.x, starAA.y));
  float twinkle = step(0.9, cellHash) * (0.5 + 0.5 * sin(time * 2.0 + cellHash * 40.0));
  float sunPath = pow(max(dot(reflect(-viewDirection, normal), light), 0.0), 5.0);
  float sparkle = star * twinkle * sunPath * uWaterParams.z * (1.0 - smoothstep(30.0, 120.0, distanceToCamera));

  vec3 color = mix(base, foamColor.rgb, foam);
  color += vec3(1.0) * sparkle;

  float haze = smoothstep(uFFHazeParams.x, uFFHazeParams.y, distanceToCamera) * uFFHazeColor.a;
  color = mix(color, uFFHazeColor.rgb, haze);

  float alpha = mix(0.62, 0.95, smoothstep(0.0, 2.8, depth));
  if (uWaterParams.x < 0.5) alpha = vColor.a * (0.78 + fresnel * 0.2);
  alpha = max(alpha, foam);
  gl_FragColor = vec4(color, alpha);
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
uniform midColor : vec4f;
uniform uWaterParams : vec4f;
uniform uFFScreen : vec4f;
uniform uCamForward : vec3f;
uniform uFFHazeColor : vec4f;
uniform uFFHazeParams : vec4f;
uniform uFFSunColor : vec3f;
var sceneDepthSampler : sampler;
var sceneDepth : texture_2d<f32>;
var foamTexSampler : sampler;
var foamTex : texture_2d<f32>;

varying vWorldPosition : vec3f;
varying vColor : vec4f;
varying vWave : f32;

fn ffHash12(p : vec2f) -> f32 {
  var p3 = fract(vec3f(p.x, p.y, p.x) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

fn ffNoise(p : vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  return mix(mix(ffHash12(i), ffHash12(i + vec2f(1.0, 0.0)), u.x), mix(ffHash12(i + vec2f(0.0, 1.0)), ffHash12(i + vec2f(1.0, 1.0)), u.x), u.y);
}

@fragment
fn main(input : FragmentInputs) -> FragmentOutputs {
  let worldPos = input.vWorldPosition;
  let toCamera = uniforms.cameraPosition - worldPos;
  let distanceToCamera = length(toCamera);
  let viewDirection = toCamera / max(distanceToCamera, 0.0001);
  let light = normalize(uniforms.sunDirection);
  let time = uniforms.time;

  let dx =
    cos(worldPos.x * 0.11 + time * 0.9) * 0.11 * 0.09 +
    cos((worldPos.x + worldPos.z) * 0.045 + time * 0.35) * 0.045 * 0.16;
  let dz =
    -sin(worldPos.z * 0.14 - time * 0.7) * 0.14 * 0.07 +
    cos((worldPos.x + worldPos.z) * 0.045 + time * 0.35) * 0.045 * 0.16;
  let ripple = vec2f(
    ffNoise(worldPos.xz * 0.5 + vec2f(time * 0.22, time * 0.13)),
    ffNoise(worldPos.zx * 0.5 - vec2f(time * 0.17, time * 0.2))
  ) - 0.5;
  let normal = normalize(vec3f(-dx + ripple.x * 0.09, 1.0, -dz + ripple.y * 0.09));

  let sceneZ = textureSampleLevel(sceneDepth, sceneDepthSampler, fragmentInputs.position.xy * uniforms.uFFScreen.xy, 0.0).r;
  // Implicit-LOD sample at the top of main (uniform control flow) so open-water
  // crest streaks use the mip chain like the GLSL texture2D path.
  let painted = textureSample(foamTex, foamTexSampler, worldPos.xz * 0.045 + vec2f(time * 0.006, time * 0.002)).a;
  var depth = input.vColor.g * 16.0;
  if (uniforms.uWaterParams.x > 0.5) {
    let ray = -toCamera / max(distanceToCamera, 0.0001);
    let waterZ = dot(-toCamera, uniforms.uCamForward);
    if (sceneZ > 0.0 && sceneZ > waterZ - 0.05) {
      let along = (sceneZ - waterZ) / max(dot(ray, uniforms.uCamForward), 0.05);
      depth = max(along, 0.0) * max(-ray.y, 0.015);
    } else if (sceneZ <= 0.0) {
      depth = max(depth, 18.0);
    }
  }

  let n1 = ffNoise(worldPos.xz * 0.32 + vec2f(time * 0.05, time * 0.03));
  let n2 = ffNoise(worldPos.xz * 1.1 - vec2f(time * 0.09, time * 0.04));
  let shore = depth + (n1 - 0.5) * 0.22;
  let edgeFoam = 1.0 - smoothstep(0.1, 0.24, shore);
  let phase = depth * 1.45 - time * 0.42 + n1 * 0.9;
  var rolling = smoothstep(0.0, 0.05, fract(phase)) * (1.0 - smoothstep(0.1, 0.2, fract(phase)));
  rolling *= (1.0 - smoothstep(0.35, 1.8, depth)) * smoothstep(0.3, 0.48, n2 + 0.15);
  let squiggleField = ffNoise(worldPos.xz * 0.07 + vec2f(time * 0.012, -time * 0.008));
  var squiggle = 1.0 - smoothstep(0.0, 0.022, abs(squiggleField - 0.5));
  squiggle *= smoothstep(0.52, 0.68, ffNoise(worldPos.xz * 0.13 + 7.3));
  squiggle *= smoothstep(1.4, 3.5, depth) * (1.0 - smoothstep(45.0, 140.0, distanceToCamera));
  var foam = max(edgeFoam, rolling) * uniforms.uWaterParams.y;
  if (uniforms.uWaterParams.w > 0.5) {
    let openWater = smoothstep(1.0, 2.6, depth) * (1.0 - smoothstep(70.0, 220.0, distanceToCamera));
    foam = max(foam, smoothstep(0.25, 0.7, painted) * openWater * 0.9);
  } else {
    foam = max(foam, squiggle * 0.8);
  }
  foam = clamp(foam, 0.0, 1.0);

  let shallowToMid = smoothstep(0.0, 2.6, depth);
  let midToDeep = smoothstep(2.2, 10.0, depth);
  var base = mix(uniforms.shallowColor.rgb, uniforms.midColor.rgb, shallowToMid);
  base = mix(base, uniforms.deepColor.rgb, midToDeep);
  let ndl = dot(normal, light);
  base *= mix(0.94, 1.05, smoothstep(0.5, 0.56, ndl));

  let fresnel = pow(1.0 - clamp(dot(normal, viewDirection), 0.0, 1.0), 3.0);
  base = mix(base, uniforms.skyColor.rgb, fresnel * 0.42);

  let halfVector = normalize(light + viewDirection);
  let glint = pow(max(dot(normal, halfVector), 0.0), 220.0);
  let glintAA = max(0.03, fwidth(glint));
  base += uniforms.uFFSunColor * smoothstep(0.3 - glintAA, 0.5 + glintAA, glint) * 0.55;

  let cellCoord = worldPos.xz * 0.8;
  let cell = floor(cellCoord);
  let cellHash = ffHash12(cell);
  let local = fract(cellCoord) - 0.5 - (vec2f(ffHash12(cell + 7.1), ffHash12(cell + 3.3)) - 0.5) * 0.5;
  let starAA = max(fwidth(cellCoord), vec2f(0.001));
  let thin = vec2f(1.0) - smoothstep(max(vec2f(0.0), vec2f(0.035) - starAA), vec2f(0.035) + starAA, abs(local));
  let arm = vec2f(1.0) - smoothstep(max(vec2f(0.0), vec2f(0.22) - starAA), vec2f(0.22) + starAA, abs(local));
  let star = max(thin.x * arm.y, thin.y * arm.x) * (1.0 - smoothstep(0.12, 0.65, max(starAA.x, starAA.y)));
  let twinkle = step(0.9, cellHash) * (0.5 + 0.5 * sin(uniforms.time * 2.0 + cellHash * 40.0));
  let sunPath = pow(max(dot(reflect(-viewDirection, normal), light), 0.0), 5.0);
  let sparkle = star * twinkle * sunPath * uniforms.uWaterParams.z * (1.0 - smoothstep(30.0, 120.0, distanceToCamera));

  var color = mix(base, uniforms.foamColor.rgb, foam);
  color += vec3f(1.0) * sparkle;

  let haze = smoothstep(uniforms.uFFHazeParams.x, uniforms.uFFHazeParams.y, distanceToCamera) * uniforms.uFFHazeColor.a;
  color = mix(color, uniforms.uFFHazeColor.rgb, haze);

  var alpha = mix(0.62, 0.95, smoothstep(0.0, 2.8, depth));
  if (uniforms.uWaterParams.x < 0.5) { alpha = input.vColor.a * (0.78 + fresnel * 0.2); }
  alpha = max(alpha, foam);
  fragmentOutputs.color = vec4f(color, alpha);
}
`;
