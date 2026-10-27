/**
 * Shared comic lighting model for every lit surface (map, props, characters).
 *
 * Three hard bands (shade / mid / lit) with tinted shade colours instead of
 * grey: pale, unsaturated surfaces (snow, ice, plaster) fall into a cool
 * blue shade, everything else into a warm, slightly deeper shade. Cast
 * shadows come from the scene-look shadow map and always land in the tinted
 * shade band, never in black. A thin rim light, an optional "toy plastic"
 * specular glint and a light distance haze finish the look.
 *
 * The same functions exist twice, GLSL for WebGL2 and WGSL for WebGPU. Keep
 * both blocks line-for-line equivalent when changing either one.
 *
 * Host shaders must declare `lightDirection` (towards the sun) and
 * `cameraPosition` themselves; this chunk only adds the `uFF*` uniforms and
 * the `shadowMap` texture.
 *
 * uFFShadowDepth mirrors Babylon's shadow-depth metric: x = depth min, y =
 * min + max, z = 1 when the map is packed RGBA8, w = clip-z sign (-1 with a
 * reverse depth buffer), so depth = (w * clip.z + x) / y.
 *
 * `FF_TEXTURED` (defined only by the painted GLB character material) selects
 * the painted-albedo variant: derivative-widened bands, no pow deepening of
 * the shade colour, and a capped shadow normal offset.
 */

/** Uniform names added by {@link LOOK_FRAGMENT_GLSL} / {@link LOOK_FRAGMENT_WGSL}. */
export const LOOK_UNIFORMS = [
  'uFFSunColor',
  'uFFSkyFill',
  'uFFGroundFill',
  'uFFShadeCool',
  'uFFShadeWarm',
  'uFFHazeColor',
  'uFFHazeParams',
  'uFFLightMatrix',
  'uFFShadowParams',
  'uFFShadowDepth',
  'uFFToonParams',
] as const;

export const LOOK_SAMPLERS = ['shadowMap'] as const;

export const LOOK_FRAGMENT_GLSL = /* glsl */ `
uniform vec3 uFFSunColor;
uniform vec3 uFFSkyFill;
uniform vec3 uFFGroundFill;
uniform vec3 uFFShadeCool;
uniform vec3 uFFShadeWarm;
uniform vec4 uFFHazeColor;
uniform vec4 uFFHazeParams;
uniform mat4 uFFLightMatrix;
uniform vec4 uFFShadowParams;
uniform vec4 uFFShadowDepth;
uniform vec4 uFFToonParams;
uniform sampler2D shadowMap;

float ffShadowTap(vec2 uv, float depth) {
  vec4 stored = texture2D(shadowMap, uv);
  float value = mix(stored.r, dot(stored, vec4(1.0 / 16581375.0, 1.0 / 65025.0, 1.0 / 255.0, 1.0)), uFFShadowDepth.z);
  return step(depth, value);
}

float ffShadow(vec3 worldPos, vec3 normal, float ndl) {
  if (uFFShadowParams.w < 0.5) return 1.0;
  float texel = uFFShadowParams.x;
  float slope = 1.0 - clamp(ndl, 0.0, 1.0);
  float offsetLen = uFFShadowParams.y * (0.8 + 2.6 * slope);
#if defined(FF_TEXTURED) || defined(FF_SOFT_CHARACTER)
  // Painted characters are thinner than the offset; cap it so self-shadows
  // from brims and arms stay attached instead of jumping in coarse cells.
  offsetLen = min(offsetLen, 0.12);
#endif
  vec3 offsetPos = worldPos + normal * offsetLen;
  vec4 lightClip = uFFLightMatrix * vec4(offsetPos, 1.0);
  vec3 clip = lightClip.xyz / lightClip.w;
  float edge = max(abs(clip.x), abs(clip.y));
  float depth = (uFFShadowDepth.w * clip.z + uFFShadowDepth.x) / uFFShadowDepth.y;
  if (edge > 0.995 || depth > 0.999) return 1.0;
  vec2 st = (clip.xy * 0.5 + 0.5) / texel - 0.5;
  vec2 cell = floor(st);
  vec2 f = fract(st);
  vec2 uv = (cell + 0.5) * texel;
  float s00 = ffShadowTap(uv, depth);
  float s10 = ffShadowTap(uv + vec2(texel, 0.0), depth);
  float s01 = ffShadowTap(uv + vec2(0.0, texel), depth);
  float s11 = ffShadowTap(uv + vec2(texel, texel), depth);
  float inner = mix(mix(s00, s10, f.x), mix(s01, s11, f.x), f.y);
  float fade = smoothstep(0.78, 0.97, edge);
  if (uFFShadowParams.w < 1.5) {
    return mix(mix(1.0, smoothstep(0.1, 0.9, inner), uFFShadowParams.z), 1.0, fade);
  }
  float sm0 = ffShadowTap(uv + vec2(-texel, 0.0), depth);
  float sm1 = ffShadowTap(uv + vec2(-texel, texel), depth);
  float s20 = ffShadowTap(uv + vec2(2.0 * texel, 0.0), depth);
  float s21 = ffShadowTap(uv + vec2(2.0 * texel, texel), depth);
  float s0m = ffShadowTap(uv + vec2(0.0, -texel), depth);
  float s1m = ffShadowTap(uv + vec2(texel, -texel), depth);
  float s02 = ffShadowTap(uv + vec2(0.0, 2.0 * texel), depth);
  float s12 = ffShadowTap(uv + vec2(texel, 2.0 * texel), depth);
  float outerX = mix(mix(sm0, s20, f.x), mix(sm1, s21, f.x), f.y);
  float outerY = mix(mix(s0m, s02, f.y), mix(s1m, s12, f.y), f.x);
  float lit = inner * 0.6 + outerX * 0.2 + outerY * 0.2;
  lit = smoothstep(0.18, 0.82, lit);
  return mix(mix(1.0, lit, uFFShadowParams.z), 1.0, fade);
}

float ffCoolMask(vec3 base) {
  float maxC = max(base.r, max(base.g, base.b));
  float minC = min(base.r, min(base.g, base.b));
  float saturation = (maxC - minC) / max(maxC, 0.001);
  float luma = dot(base, vec3(0.299, 0.587, 0.114));
  float pale = smoothstep(0.62, 0.86, luma) * (1.0 - smoothstep(0.1, 0.3, saturation));
  float bluish = smoothstep(0.02, 0.18, base.b - base.r) * smoothstep(0.35, 0.7, luma);
  return clamp(max(pale, bluish), 0.0, 1.0);
}

vec3 ffShadeTint(vec3 base) {
  float luma = dot(base, vec3(0.299, 0.587, 0.114));
  vec3 tint = mix(uFFShadeWarm, uFFShadeCool, ffCoolMask(base));
  return tint * mix(0.68, 0.88, luma);
}

vec3 ffToon(vec3 base, vec3 normal, vec3 worldPos, float gloss, float rimAmount, float hatch) {
  vec3 light = normalize(lightDirection);
  vec3 toCamera = cameraPosition - worldPos;
  float distanceToCamera = length(toCamera);
  vec3 viewDirection = toCamera / max(distanceToCamera, 0.0001);
  float ndl = dot(normal, light);
  float shadow = ffShadow(worldPos, normal, ndl);

#if defined(FF_TEXTURED) || defined(FF_SOFT_CHARACTER)
  // Painted skinned characters: widen the hard bands by the screen-space
  // derivative so dense meshes and normal maps do not alias into speckles.
  float bandAA = max(0.055, fwidth(ndl) * 1.5);
#else
  float bandAA = 0.12;
#endif
  float terminator = smoothstep(-0.02 - bandAA, 0.05 + bandAA, ndl + uFFToonParams.z);
  float full = smoothstep(0.32 - bandAA, 0.39 + bandAA, ndl + uFFToonParams.z);
#if defined(FF_TEXTURED) || defined(FF_SOFT_CHARACTER)
  // Two broad light bands keep the sculpted forms readable in the new cel reference.
  float lightLevel = (terminator * 0.7 + full * 0.3) * shadow;
#else
  float lightLevel = (terminator * 0.58 + full * 0.42) * shadow;
#endif

  float skyMix = clamp(normal.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 fill = mix(uFFGroundFill, uFFSkyFill, skyMix);
#if defined(FF_TEXTURED) || defined(FF_SOFT_CHARACTER)
  // Painted albedo already carries its own soft shading: no extra deepening.
  vec3 shade = base * ffShadeTint(base) * fill;
#else
  vec3 deep = pow(max(base, vec3(0.001)), vec3(1.35));
  vec3 shade = mix(base, deep, 0.3) * ffShadeTint(base) * fill;
#endif
  // Lit snow and ice stay blue-white like the paintings (sky bounce).
  vec3 lit = base * uFFSunColor * mix(vec3(1.0), vec3(0.86, 0.95, 1.07), ffCoolMask(base) * 0.85);
  vec3 color = mix(shade, lit, lightLevel);

  float shadeAmount = 1.0 - lightLevel;
  float hatchMain = 1.0 - smoothstep(0.12, 0.24, hatch);
  float hatchCross = (1.0 - smoothstep(0.42, 0.52, hatch)) * (1.0 - smoothstep(-0.35, 0.1, ndl));
  float shadeLuma = dot(shade, vec3(0.299, 0.587, 0.114));
  float hatchMask = max(hatchMain, hatchCross * 0.6) * smoothstep(0.7, 0.98, shadeAmount) * (1.0 - smoothstep(0.32, 0.62, shadeLuma));
  color *= 1.0 - hatchMask * uFFToonParams.w;

  vec3 halfVector = normalize(light + viewDirection);
  float ndh = max(dot(normal, halfVector), 0.0);
  float sheen = pow(ndh, mix(10.0, 28.0, gloss));
  float glint = pow(ndh, mix(48.0, 180.0, gloss));
  color += base * uFFSunColor * smoothstep(0.35, 0.6, sheen) * gloss * 0.18 * shadow;
  color += uFFSunColor * smoothstep(0.42, 0.52, glint) * gloss * uFFToonParams.y * shadow;

  float fresnel = 1.0 - clamp(dot(normal, viewDirection), 0.0, 1.0);
  float rim = smoothstep(0.64, 0.8, fresnel) * rimAmount * uFFToonParams.x;
  rim *= 1.0 - smoothstep(22.0, 60.0, distanceToCamera);
  rim *= 0.45 + 0.55 * smoothstep(-0.3, 0.4, ndl);
  color += mix(vec3(0.78, 0.9, 1.0), uFFSunColor, 0.4) * rim * 0.32;

  return color;
}

vec3 ffHaze(vec3 color, vec3 worldPos) {
  float distanceToCamera = length(cameraPosition - worldPos);
  float haze = smoothstep(uFFHazeParams.x, uFFHazeParams.y, distanceToCamera);
  float altitude = 1.0 - clamp((worldPos.y - uFFHazeParams.z) / max(uFFHazeParams.w, 1.0), 0.0, 1.0) * 0.45;
  return mix(color, uFFHazeColor.rgb, haze * uFFHazeColor.a * altitude);
}
`;

export const LOOK_FRAGMENT_WGSL = /* wgsl */ `
uniform uFFSunColor : vec3f;
uniform uFFSkyFill : vec3f;
uniform uFFGroundFill : vec3f;
uniform uFFShadeCool : vec3f;
uniform uFFShadeWarm : vec3f;
uniform uFFHazeColor : vec4f;
uniform uFFHazeParams : vec4f;
uniform uFFLightMatrix : mat4x4f;
uniform uFFShadowParams : vec4f;
uniform uFFShadowDepth : vec4f;
uniform uFFToonParams : vec4f;
var shadowMapSampler : sampler;
var shadowMap : texture_2d<f32>;

fn ffShadowTap(uv : vec2f, depth : f32) -> f32 {
  let stored = textureSampleLevel(shadowMap, shadowMapSampler, uv, 0.0);
  let value = mix(stored.r, dot(stored, vec4f(1.0 / 16581375.0, 1.0 / 65025.0, 1.0 / 255.0, 1.0)), uniforms.uFFShadowDepth.z);
  return step(depth, value);
}

fn ffShadow(worldPos : vec3f, normal : vec3f, ndl : f32) -> f32 {
  if (uniforms.uFFShadowParams.w < 0.5) { return 1.0; }
  let texel = uniforms.uFFShadowParams.x;
  let slope = 1.0 - clamp(ndl, 0.0, 1.0);
  var offsetLen = uniforms.uFFShadowParams.y * (0.8 + 2.6 * slope);
#if defined(FF_TEXTURED) || defined(FF_SOFT_CHARACTER)
  offsetLen = min(offsetLen, 0.12);
#endif
  let offsetPos = worldPos + normal * offsetLen;
  let lightClip = uniforms.uFFLightMatrix * vec4f(offsetPos, 1.0);
  let clip = lightClip.xyz / lightClip.w;
  let edge = max(abs(clip.x), abs(clip.y));
  let depth = (uniforms.uFFShadowDepth.w * clip.z + uniforms.uFFShadowDepth.x) / uniforms.uFFShadowDepth.y;
  if (edge > 0.995 || depth > 0.999) { return 1.0; }
  let st = (clip.xy * 0.5 + 0.5) / texel - 0.5;
  let cell = floor(st);
  let f = fract(st);
  let uv = (cell + 0.5) * texel;
  let s00 = ffShadowTap(uv, depth);
  let s10 = ffShadowTap(uv + vec2f(texel, 0.0), depth);
  let s01 = ffShadowTap(uv + vec2f(0.0, texel), depth);
  let s11 = ffShadowTap(uv + vec2f(texel, texel), depth);
  let inner = mix(mix(s00, s10, f.x), mix(s01, s11, f.x), f.y);
  let fade = smoothstep(0.78, 0.97, edge);
  if (uniforms.uFFShadowParams.w < 1.5) {
    return mix(mix(1.0, smoothstep(0.1, 0.9, inner), uniforms.uFFShadowParams.z), 1.0, fade);
  }
  let sm0 = ffShadowTap(uv + vec2f(-texel, 0.0), depth);
  let sm1 = ffShadowTap(uv + vec2f(-texel, texel), depth);
  let s20 = ffShadowTap(uv + vec2f(2.0 * texel, 0.0), depth);
  let s21 = ffShadowTap(uv + vec2f(2.0 * texel, texel), depth);
  let s0m = ffShadowTap(uv + vec2f(0.0, -texel), depth);
  let s1m = ffShadowTap(uv + vec2f(texel, -texel), depth);
  let s02 = ffShadowTap(uv + vec2f(0.0, 2.0 * texel), depth);
  let s12 = ffShadowTap(uv + vec2f(texel, 2.0 * texel), depth);
  let outerX = mix(mix(sm0, s20, f.x), mix(sm1, s21, f.x), f.y);
  let outerY = mix(mix(s0m, s02, f.y), mix(s1m, s12, f.y), f.x);
  var lit = inner * 0.6 + outerX * 0.2 + outerY * 0.2;
  lit = smoothstep(0.18, 0.82, lit);
  return mix(mix(1.0, lit, uniforms.uFFShadowParams.z), 1.0, fade);
}

fn ffCoolMask(base : vec3f) -> f32 {
  let maxC = max(base.r, max(base.g, base.b));
  let minC = min(base.r, min(base.g, base.b));
  let saturation = (maxC - minC) / max(maxC, 0.001);
  let luma = dot(base, vec3f(0.299, 0.587, 0.114));
  let pale = smoothstep(0.62, 0.86, luma) * (1.0 - smoothstep(0.1, 0.3, saturation));
  let bluish = smoothstep(0.02, 0.18, base.b - base.r) * smoothstep(0.35, 0.7, luma);
  return clamp(max(pale, bluish), 0.0, 1.0);
}

fn ffShadeTint(base : vec3f) -> vec3f {
  let luma = dot(base, vec3f(0.299, 0.587, 0.114));
  let tint = mix(uniforms.uFFShadeWarm, uniforms.uFFShadeCool, ffCoolMask(base));
  return tint * mix(0.68, 0.88, luma);
}

fn ffToon(base : vec3f, normal : vec3f, worldPos : vec3f, gloss : f32, rimAmount : f32, hatch : f32) -> vec3f {
  let light = normalize(uniforms.lightDirection);
  let toCamera = uniforms.cameraPosition - worldPos;
  let distanceToCamera = length(toCamera);
  let viewDirection = toCamera / max(distanceToCamera, 0.0001);
  let ndl = dot(normal, light);
  let shadow = ffShadow(worldPos, normal, ndl);

  var bandAA = 0.12;
#if defined(FF_TEXTURED) || defined(FF_SOFT_CHARACTER)
  bandAA = max(0.055, fwidth(ndl) * 1.5);
#endif
  let terminator = smoothstep(-0.02 - bandAA, 0.05 + bandAA, ndl + uniforms.uFFToonParams.z);
  let full = smoothstep(0.32 - bandAA, 0.39 + bandAA, ndl + uniforms.uFFToonParams.z);
#if defined(FF_TEXTURED) || defined(FF_SOFT_CHARACTER)
  let lightLevel = (terminator * 0.7 + full * 0.3) * shadow;
#else
  let lightLevel = (terminator * 0.58 + full * 0.42) * shadow;
#endif

  let skyMix = clamp(normal.y * 0.5 + 0.5, 0.0, 1.0);
  let fill = mix(uniforms.uFFGroundFill, uniforms.uFFSkyFill, skyMix);
#if defined(FF_TEXTURED) || defined(FF_SOFT_CHARACTER)
  let shade = base * ffShadeTint(base) * fill;
#else
  let deep = pow(max(base, vec3f(0.001)), vec3f(1.35));
  let shade = mix(base, deep, 0.3) * ffShadeTint(base) * fill;
#endif
  let lit = base * uniforms.uFFSunColor * mix(vec3f(1.0), vec3f(0.86, 0.95, 1.07), ffCoolMask(base) * 0.85);
  var color = mix(shade, lit, lightLevel);

  let shadeAmount = 1.0 - lightLevel;
  let hatchMain = 1.0 - smoothstep(0.12, 0.24, hatch);
  let hatchCross = (1.0 - smoothstep(0.42, 0.52, hatch)) * (1.0 - smoothstep(-0.35, 0.1, ndl));
  let shadeLuma = dot(shade, vec3f(0.299, 0.587, 0.114));
  let hatchMask = max(hatchMain, hatchCross * 0.6) * smoothstep(0.7, 0.98, shadeAmount) * (1.0 - smoothstep(0.32, 0.62, shadeLuma));
  color *= 1.0 - hatchMask * uniforms.uFFToonParams.w;

  let halfVector = normalize(light + viewDirection);
  let ndh = max(dot(normal, halfVector), 0.0);
  let sheen = pow(ndh, mix(10.0, 28.0, gloss));
  let glint = pow(ndh, mix(48.0, 180.0, gloss));
  color += base * uniforms.uFFSunColor * smoothstep(0.35, 0.6, sheen) * gloss * 0.18 * shadow;
  color += uniforms.uFFSunColor * smoothstep(0.42, 0.52, glint) * gloss * uniforms.uFFToonParams.y * shadow;

  let fresnel = 1.0 - clamp(dot(normal, viewDirection), 0.0, 1.0);
  var rim = smoothstep(0.64, 0.8, fresnel) * rimAmount * uniforms.uFFToonParams.x;
  rim *= 1.0 - smoothstep(22.0, 60.0, distanceToCamera);
  rim *= 0.45 + 0.55 * smoothstep(-0.3, 0.4, ndl);
  color += mix(vec3f(0.78, 0.9, 1.0), uniforms.uFFSunColor, 0.4) * rim * 0.32;

  return color;
}

fn ffHaze(color : vec3f, worldPos : vec3f) -> vec3f {
  let distanceToCamera = length(uniforms.cameraPosition - worldPos);
  let haze = smoothstep(uniforms.uFFHazeParams.x, uniforms.uFFHazeParams.y, distanceToCamera);
  let altitude = 1.0 - clamp((worldPos.y - uniforms.uFFHazeParams.z) / max(uniforms.uFFHazeParams.w, 1.0), 0.0, 1.0) * 0.45;
  return mix(color, uniforms.uFFHazeColor.rgb, haze * uniforms.uFFHazeColor.a * altitude);
}
`;

/**
 * Vertex chunk that resolves the final world matrix for plain meshes, Babylon
 * instances and thin instances alike. Declares `world` and the instance
 * attributes; the host shader declares `viewProjection`.
 */
export const INSTANCED_WORLD_GLSL = /* glsl */ `
#ifdef INSTANCES
attribute vec4 world0;
attribute vec4 world1;
attribute vec4 world2;
attribute vec4 world3;
#endif
uniform mat4 world;

mat4 ffFinalWorld() {
#ifdef INSTANCES
  mat4 finalWorld = mat4(world0, world1, world2, world3);
#ifdef THIN_INSTANCES
  finalWorld = world * finalWorld;
#endif
  return finalWorld;
#else
  return world;
#endif
}
`;

export const INSTANCED_WORLD_WGSL = /* wgsl */ `
#ifdef INSTANCES
attribute world0 : vec4f;
attribute world1 : vec4f;
attribute world2 : vec4f;
attribute world3 : vec4f;
#endif
uniform world : mat4x4f;
`;

/** Body snippet for WGSL vertex mains: defines `finalWorld`. */
export const INSTANCED_WORLD_WGSL_MAIN = /* wgsl */ `
  var finalWorld : mat4x4f = uniforms.world;
#ifdef INSTANCES
  finalWorld = mat4x4f(vertexInputs.world0, vertexInputs.world1, vertexInputs.world2, vertexInputs.world3);
#ifdef THIN_INSTANCES
  finalWorld = uniforms.world * finalWorld;
#endif
#endif
`;
