/**
 * Painterly sky dome: azure gradient, a bright sun disc with soft glow and
 * slow rays, big puffy comic cumulus (procedural fallback when no painted
 * cloud billboards are loaded) and an optional painted horizon panorama band
 * (art/sky/horizon-panorama.jpg) that fades into the shader sky at its top.
 *
 * Eight analytical groups each join six puffs and one elliptical shelf.
 * A broad illustrated underside keeps each cloud coherent; arithmetic angle wrap
 * avoids repeated trigonometry for every group. No texture or extra pass.
 *
 * Panorama mapping: u = azimuth / 360° with u = 0 at +Z (north), increasing
 * clockwise towards +X (east); v = horizonV - elevation / (PI / 2).
 */
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
uniform vec3 uGlowColor;
uniform vec3 uGroundHaze;
uniform vec3 uCloudLit;
uniform vec3 uCloudShade;
uniform vec4 uCloudParams;
uniform vec4 uPanoParams;
uniform vec4 uPanoFade;
uniform vec3 uPanoTint;
uniform sampler2D panorama;

const float TAU = 6.2831853;

// Polynomial hash (no transcendentals: reproducible on every backend).
float ffHash(float n) {
  float p = fract(n * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

float ffWrap(float a) {
  return (fract(a / TAU + 0.5) - 0.5) * TAU;
}

vec4 ffClouds(vec3 dir, float aa) {
  float az = atan(dir.x, dir.z);
  float el = asin(clamp(dir.y, -1.0, 1.0));
  vec4 result = vec4(0.0);
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    float h1 = ffHash(fi + 1.31);
    float h2 = ffHash(fi * 1.73 + 4.11);
    float h3 = ffHash(fi * 2.37 + 7.73);
    float cloudAz = fi / 8.0 * TAU + (h1 - 0.5) * 0.4 + time * uCloudParams.y * (0.7 + 0.6 * h2);
    float cloudEl = uCloudParams.z + h2 * 0.24;
    float size = (0.075 + 0.085 * h3) * uCloudParams.x * (1.0 - cloudEl * 0.9);
    float du = ffWrap(az - cloudAz);
    vec2 p = vec2(du * cos(el), el - cloudEl) / size;
    if (abs(p.x) > 2.6 || p.y < -0.3 || p.y > 2.2) continue;

    float field = (length(vec2(p.x / 1.3, (p.y - 0.25) / 0.3)) - 1.0) * 0.3;
    for (int j = 0; j < 6; j++) {
      float fj = float(j);
      float r1 = ffHash(fi * 7.13 + fj * 1.91);
      float r2 = ffHash(fi * 3.37 + fj * 5.29);
      float top = step(3.5, fj);
      float spread = mix(fj / 3.0 - 0.5, (fj - 4.0) - 0.5, top);
      float middle = 1.0 - abs(spread) * 2.0;
      float radius = mix(0.34 + 0.2 * middle, 0.52 + 0.08 * middle, top) * (0.8 + 0.4 * r2);
      float lift = mix(radius * (0.55 + 0.3 * r1), 0.5 + 0.35 * middle + radius * 0.4 + h1 * 0.25, top);
      vec2 center = vec2(spread * mix(2.0 + h3 * 0.7, 0.8 + h3 * 0.25, top) + (r1 - 0.5) * 0.25, lift);
      float d = length(p - center) - radius;
      float k = 0.12;
      float blend = clamp(0.5 + 0.5 * (field - d) / k, 0.0, 1.0);
      field = mix(field, d, blend) - k * blend * (1.0 - blend);
    }
    float sd = max(field, -p.y);
    float aaLocal = aa / size;
    float alpha = 1.0 - smoothstep(-aaLocal, aaLocal, sd);
    if (alpha <= 0.001) continue;

    // One coherent white mass with a cool underside. Blended puff normals
    // produced radial star-shaped seams through the middle of the cloud.
    float band = 0.46 + 0.54 * smoothstep(0.02, 0.85, p.y);
    vec3 col = mix(uCloudShade, uCloudLit, band);
    float rimBand = smoothstep(-aaLocal * 2.0, 0.0, sd);
    col = mix(col, uCloudShade, rimBand * 0.15);

    result.rgb += (1.0 - result.a) * col * alpha;
    result.a += (1.0 - result.a) * alpha;
  }
  return result;
}

void main(void) {
  vec3 dir = normalize(vDirection);
  float aa = fwidth(dir.y) + 0.00025;
  float up = clamp(dir.y, 0.0, 1.0);
  vec3 color = mix(horizonColor, zenithColor, smoothstep(0.0, 1.0, pow(up, 0.55)));
  color = mix(uGroundHaze, color, smoothstep(-0.14, 0.01, dir.y));

  vec3 sun = normalize(sunDirection);
  float sunDot = clamp(dot(dir, sun), -1.0, 1.0);
  float angle = acos(sunDot);

  float horizonGlow = pow(max(dot(normalize(vec3(dir.x, 0.0, dir.z) + 0.0001), normalize(vec3(sun.x, 0.0, sun.z))), 0.0), 3.0);
  color += uGlowColor * horizonGlow * (1.0 - smoothstep(0.0, 0.35, up)) * 0.16;

  float sunVisible = 1.0;
  if (uCloudParams.x > 0.0) {
    vec4 clouds = ffClouds(dir, aa);
    color = mix(color, clouds.rgb / max(clouds.a, 0.0001), clouds.a);
    sunVisible *= 1.0 - clouds.a;
  }

  if (uPanoParams.x > 0.5) {
    float u = fract(atan(dir.x, dir.z) / TAU + 1.0);
    float elevation = asin(clamp(dir.y, -1.0, 1.0));
    float v = uPanoParams.y - elevation / uPanoParams.z;
    if (v > 0.0 && v < 1.0) {
      vec3 pano = texture2DLodEXT(panorama, vec2(u, v), 0.0).rgb * uPanoTint;
      float fadeIn = smoothstep(uPanoFade.x, uPanoFade.y, v) * uPanoParams.w;
      color = mix(color, pano, fadeIn);
      float paleness = smoothstep(0.78, 0.93, dot(pano, vec3(0.299, 0.587, 0.114)));
      sunVisible *= 1.0 - paleness * fadeIn;
    }
  }

  vec3 sx = normalize(cross(vec3(0.0, 1.0, 0.0), sun));
  vec3 sy = cross(sun, sx);
  float rayAngle = atan(dot(dir, sy), dot(dir, sx));
  float rays = smoothstep(0.35, 1.0, 0.5 + 0.5 * sin(rayAngle * 9.0 + sin(rayAngle * 4.0) * 0.8 + time * 0.03));
  rays *= exp(-angle * 7.5) * step(0.0, sunDot) * smoothstep(0.045, 0.09, angle);
  float glow = exp(-angle * 16.0) * 0.55 + exp(-angle * 4.5) * 0.14;
  color += uGlowColor * (glow * uCloudParams.w + rays * 0.16 * uCloudParams.w) * mix(0.35, 1.0, sunVisible);

  float disc = 1.0 - smoothstep(0.045, 0.05, angle);
  float ring = smoothstep(0.044, 0.05, angle) * (1.0 - smoothstep(0.05, 0.062, angle));
  color = mix(color, sunColor, disc * sunVisible);
  color += uGlowColor * ring * 0.35 * sunVisible;

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
uniform uGlowColor : vec3f;
uniform uGroundHaze : vec3f;
uniform uCloudLit : vec3f;
uniform uCloudShade : vec3f;
uniform uCloudParams : vec4f;
uniform uPanoParams : vec4f;
uniform uPanoFade : vec4f;
uniform uPanoTint : vec3f;
var panoramaSampler : sampler;
var panorama : texture_2d<f32>;

varying vDirection : vec3f;

const TAU : f32 = 6.2831853;

// Polynomial hash (no transcendentals: reproducible on every backend).
fn ffHash(n : f32) -> f32 {
  var p = fract(n * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

fn ffWrap(a : f32) -> f32 {
  return (fract(a / TAU + 0.5) - 0.5) * TAU;
}

fn ffClouds(dir : vec3f, aa : f32) -> vec4f {
  let az = atan2(dir.x, dir.z);
  let el = asin(clamp(dir.y, -1.0, 1.0));
  var result = vec4f(0.0);
  for (var i = 0; i < 8; i++) {
    let fi = f32(i);
    let h1 = ffHash(fi + 1.31);
    let h2 = ffHash(fi * 1.73 + 4.11);
    let h3 = ffHash(fi * 2.37 + 7.73);
    let cloudAz = fi / 8.0 * TAU + (h1 - 0.5) * 0.4 + uniforms.time * uniforms.uCloudParams.y * (0.7 + 0.6 * h2);
    let cloudEl = uniforms.uCloudParams.z + h2 * 0.24;
    let size = (0.075 + 0.085 * h3) * uniforms.uCloudParams.x * (1.0 - cloudEl * 0.9);
    let du = ffWrap(az - cloudAz);
    let p = vec2f(du * cos(el), el - cloudEl) / size;
    if (abs(p.x) > 2.6 || p.y < -0.3 || p.y > 2.2) { continue; }

    var field = (length(vec2f(p.x / 1.3, (p.y - 0.25) / 0.3)) - 1.0) * 0.3;
    for (var j = 0; j < 6; j++) {
      let fj = f32(j);
      let r1 = ffHash(fi * 7.13 + fj * 1.91);
      let r2 = ffHash(fi * 3.37 + fj * 5.29);
      let top = step(3.5, fj);
      let spread = mix(fj / 3.0 - 0.5, (fj - 4.0) - 0.5, top);
      let middle = 1.0 - abs(spread) * 2.0;
      let radius = mix(0.34 + 0.2 * middle, 0.52 + 0.08 * middle, top) * (0.8 + 0.4 * r2);
      let lift = mix(radius * (0.55 + 0.3 * r1), 0.5 + 0.35 * middle + radius * 0.4 + h1 * 0.25, top);
      let center = vec2f(spread * mix(2.0 + h3 * 0.7, 0.8 + h3 * 0.25, top) + (r1 - 0.5) * 0.25, lift);
      let d = length(p - center) - radius;
      let k = 0.12;
      let blend = clamp(0.5 + 0.5 * (field - d) / k, 0.0, 1.0);
      field = mix(field, d, blend) - k * blend * (1.0 - blend);
    }
    let sd = max(field, -p.y);
    let aaLocal = aa / size;
    let alpha = 1.0 - smoothstep(-aaLocal, aaLocal, sd);
    if (alpha <= 0.001) { continue; }

    let band = 0.46 + 0.54 * smoothstep(0.02, 0.85, p.y);
    var col = mix(uniforms.uCloudShade, uniforms.uCloudLit, band);
    let rimBand = smoothstep(-aaLocal * 2.0, 0.0, sd);
    col = mix(col, uniforms.uCloudShade, rimBand * 0.15);

    result = vec4f(result.rgb + (1.0 - result.a) * col * alpha, result.a + (1.0 - result.a) * alpha);
  }
  return result;
}

@fragment
fn main(input : FragmentInputs) -> FragmentOutputs {
  let dir = normalize(input.vDirection);
  let aa = fwidth(dir.y) + 0.00025;
  let up = clamp(dir.y, 0.0, 1.0);
  var color = mix(uniforms.horizonColor, uniforms.zenithColor, smoothstep(0.0, 1.0, pow(up, 0.55)));
  color = mix(uniforms.uGroundHaze, color, smoothstep(-0.14, 0.01, dir.y));

  let sun = normalize(uniforms.sunDirection);
  let sunDot = clamp(dot(dir, sun), -1.0, 1.0);
  let angle = acos(sunDot);

  let horizonGlow = pow(max(dot(normalize(vec3f(dir.x, 0.0, dir.z) + 0.0001), normalize(vec3f(sun.x, 0.0, sun.z))), 0.0), 3.0);
  color += uniforms.uGlowColor * horizonGlow * (1.0 - smoothstep(0.0, 0.35, up)) * 0.16;

  var sunVisible = 1.0;
  if (uniforms.uCloudParams.x > 0.0) {
    let clouds = ffClouds(dir, aa);
    color = mix(color, clouds.rgb / max(clouds.a, 0.0001), clouds.a);
    sunVisible *= 1.0 - clouds.a;
  }

  let u = fract(atan2(dir.x, dir.z) / TAU + 1.0);
  let elevation = asin(clamp(dir.y, -1.0, 1.0));
  let v = uniforms.uPanoParams.y - elevation / uniforms.uPanoParams.z;
  let pano = textureSampleLevel(panorama, panoramaSampler, vec2f(u, clamp(v, 0.0, 1.0)), 0.0).rgb * uniforms.uPanoTint;
  if (uniforms.uPanoParams.x > 0.5 && v > 0.0 && v < 1.0) {
    let fadeIn = smoothstep(uniforms.uPanoFade.x, uniforms.uPanoFade.y, v) * uniforms.uPanoParams.w;
    color = mix(color, pano, fadeIn);
    let paleness = smoothstep(0.78, 0.93, dot(pano, vec3f(0.299, 0.587, 0.114)));
    sunVisible *= 1.0 - paleness * fadeIn;
  }

  let sx = normalize(cross(vec3f(0.0, 1.0, 0.0), sun));
  let sy = cross(sun, sx);
  let rayAngle = atan2(dot(dir, sy), dot(dir, sx));
  var rays = smoothstep(0.35, 1.0, 0.5 + 0.5 * sin(rayAngle * 9.0 + sin(rayAngle * 4.0) * 0.8 + uniforms.time * 0.03));
  rays *= exp(-angle * 7.5) * step(0.0, sunDot) * smoothstep(0.045, 0.09, angle);
  let glow = exp(-angle * 16.0) * 0.55 + exp(-angle * 4.5) * 0.14;
  color += uniforms.uGlowColor * (glow * uniforms.uCloudParams.w + rays * 0.16 * uniforms.uCloudParams.w) * mix(0.35, 1.0, sunVisible);

  let disc = 1.0 - smoothstep(0.045, 0.05, angle);
  let ring = smoothstep(0.044, 0.05, angle) * (1.0 - smoothstep(0.05, 0.062, angle));
  color = mix(color, uniforms.sunColor, disc * sunVisible);
  color += uniforms.uGlowColor * ring * 0.35 * sunVisible;

  fragmentOutputs.color = vec4f(color, 1.0);
}
`;
