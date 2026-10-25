import {
  INSTANCED_WORLD_GLSL,
  INSTANCED_WORLD_WGSL,
  INSTANCED_WORLD_WGSL_MAIN,
  LOOK_FRAGMENT_GLSL,
  LOOK_FRAGMENT_WGSL,
} from './look-common';

/**
 * Painted sprite layer (rendering/sprite-atlas.ts + rendering/map/vegetation.ts).
 *
 * BILLBOARD (default): thin-instanced unit quads (x -0.5..0.5, y 0..1) turned
 * to the camera around the world Y axis (cylindrical). Per instance:
 *   matrix      translation = ground pivot, column 0 length = width (m),
 *               column 1 length = height (m)
 *   spriteRect  atlas u0, v0 (top), u1, v1 (bottom)
 *   spriteRect  (u0 > u1 = mirrored sprite)
 *   spriteData  x pivot v (from the bottom), y wind sway, z pivot u (ground
 *               contact across the image, already mirrored), w cull distance
 *               (0 = never); sprites shrink away towards it.
 * Alpha-tested with a mip-aware alpha boost so thin fronds survive at range,
 * dithered out right in front of the camera. The painted art carries its own
 * ink outline, so these meshes stay out of the g-buffer and write the scene-
 * alpha look mask 0.75 ("painted sprite", see shaders/post.ts): the comic pass
 * skips its screen-space ink on those pixels (no outlines of objects behind
 * bleeding through the trees). Never alpha 0: that marks a stylised character.
 *
 * GROUND (#define GROUND): flat decals and soft shadow blobs, quads in local
 * XZ transformed by the full instance matrix (yaw, terrain tilt, size).
 * spriteData.x = opacity. Alpha blended, no depth write.
 *
 * Lighting is deliberately light-handed: the paintings are pre-shaded, so
 * the sprites only take the scene sun colour, cast shadows (tinted shade
 * band) and the aerial haze. GLSL and WGSL blocks must stay equivalent.
 */

export const SPRITE_UNIFORMS = [
  'world',
  'viewProjection',
  'cameraPosition',
  'lightDirection',
  'uTime',
  'uAtlasSize',
  'uSpriteParams',
] as const;
export const SPRITE_SAMPLERS = ['spriteAtlas'] as const;
export const SPRITE_ATTRIBUTES = ['position', 'spriteRect', 'spriteData'] as const;

export const spriteVertexGLSL = /* glsl */ `
precision highp float;

attribute vec3 position;
attribute vec4 spriteRect;
attribute vec4 spriteData;

uniform mat4 viewProjection;
uniform vec3 cameraPosition;
uniform float uTime;
uniform vec4 uSpriteParams;
${INSTANCED_WORLD_GLSL}

varying vec2 vUV;
varying vec3 vWorldPosition;
varying vec3 vSprite;

void main(void) {
  mat4 W = ffFinalWorld();
#ifdef GROUND
  vec4 world = W * vec4(position.x, 0.0, position.z, 1.0);
  vec3 worldPos = world.xyz;
  float qx = position.x + 0.5;
  float qy = position.z + 0.5;
  vUV = vec2(mix(spriteRect.x, spriteRect.z, qx), mix(spriteRect.w, spriteRect.y, qy));
  vSprite = vec3(spriteData.x, 1.0, 0.0);
#else
  vec3 pivot = W[3].xyz;
  float width = length(W[0].xyz);
  float height = length(W[1].xyz);
  vec3 toCamera = cameraPosition - pivot;
  float distanceToCamera = length(toCamera);
  vec2 flatDir = toCamera.xz;
  float flatLength = length(flatDir);
  vec2 f = flatLength > 0.0001 ? flatDir / flatLength : vec2(0.0, 1.0);
  // Screen-right of a camera looking along -f (left-handed world).
  vec3 right = vec3(-f.y, 0.0, f.x);
  float cull = spriteData.w;
  float grow = cull > 0.0 ? 1.0 - smoothstep(cull * 0.8, cull, distanceToCamera) : 1.0;
  float y01 = position.y;
  float localY = (y01 - spriteData.x) * height * grow;
  float phase = dot(pivot.xz, vec2(0.131, 0.173));
  float gust = sin(uTime * 1.35 + phase) * 0.7 + sin(uTime * 2.9 + phase * 1.9) * 0.3;
  float sway = spriteData.y * uSpriteParams.y * y01 * y01 * gust * 0.06 * height;
  float qx = position.x + 0.5;
  vec3 worldPos = pivot + right * ((qx - spriteData.z) * width * grow + sway) + vec3(0.0, localY, 0.0);
  vUV = vec2(mix(spriteRect.x, spriteRect.z, qx), mix(spriteRect.w, spriteRect.y, y01));
  vSprite = vec3(y01, smoothstep(0.9, 2.8, distanceToCamera), height);
#endif
  vWorldPosition = worldPos;
  gl_Position = viewProjection * vec4(worldPos, 1.0);
}
`;

export const spriteFragmentGLSL = /* glsl */ `
precision highp float;

varying vec2 vUV;
varying vec3 vWorldPosition;
varying vec3 vSprite;

uniform sampler2D spriteAtlas;
uniform vec3 lightDirection;
uniform vec3 cameraPosition;
uniform vec2 uAtlasSize;
uniform vec4 uSpriteParams;
${LOOK_FRAGMENT_GLSL}

float ffBayer(vec2 p) {
  vec2 q = mod(floor(p), 4.0);
  float a = mod(q.x + q.y * 2.0, 4.0);
  return (a * 4.0 + mod(q.y * 3.0 + q.x, 4.0) + 0.5) / 16.0;
}

void main(void) {
  vec4 texel = texture2D(spriteAtlas, vUV);
  vec2 dx = dFdx(vUV * uAtlasSize);
  vec2 dy = dFdy(vUV * uAtlasSize);
  float lod = max(0.0, 0.5 * log2(max(dot(dx, dx), dot(dy, dy))));
  vec3 albedo = texel.rgb;
  float shadow = ffShadow(vWorldPosition, vec3(0.0, 1.0, 0.0), 0.6);
  vec3 fill = mix(uFFGroundFill, uFFSkyFill, 0.7);
  vec3 shade = albedo * ffShadeTint(albedo) * fill * 0.8;
  vec3 lit = albedo * uFFSunColor;
  vec3 color = mix(shade, lit, mix(uSpriteParams.w, 1.0, shadow));
#ifdef GROUND
  float alpha = texel.a * vSprite.x;
  if (alpha < 0.01) discard;
  gl_FragColor = vec4(ffHaze(color, vWorldPosition), alpha);
#else
  float alpha = texel.a * (1.0 + lod * 0.28);
  if (vSprite.y < 1.0 && ffBayer(gl_FragCoord.xy) > vSprite.y) discard;
  if (alpha < uSpriteParams.x) discard;
  // Grounding: the foot of tall sprites sits in a soft painted contact shade.
  float foot = 1.0 - smoothstep(0.0, min(0.5, 1.2 / max(vSprite.z, 0.5)), vSprite.x);
  color *= 1.0 - foot * 0.16;
  // Look mask 0.75 = painted sprite (shaders/post.ts): world look, no screen-space ink.
  gl_FragColor = vec4(ffHaze(color, vWorldPosition), 0.75);
#endif
}
`;

export const spriteVertexWGSL = /* wgsl */ `
attribute position : vec3f;
attribute spriteRect : vec4f;
attribute spriteData : vec4f;

uniform viewProjection : mat4x4f;
uniform cameraPosition : vec3f;
uniform uTime : f32;
uniform uSpriteParams : vec4f;
${INSTANCED_WORLD_WGSL}

varying vUV : vec2f;
varying vWorldPosition : vec3f;
varying vSprite : vec3f;

@vertex
fn main(input : VertexInputs) -> FragmentInputs {
${INSTANCED_WORLD_WGSL_MAIN}
#ifdef GROUND
  let world = finalWorld * vec4f(input.position.x, 0.0, input.position.z, 1.0);
  let worldPos = world.xyz;
  let qx = input.position.x + 0.5;
  let qy = input.position.z + 0.5;
  vertexOutputs.vUV = vec2f(mix(input.spriteRect.x, input.spriteRect.z, qx), mix(input.spriteRect.w, input.spriteRect.y, qy));
  vertexOutputs.vSprite = vec3f(input.spriteData.x, 1.0, 0.0);
#else
  let pivot = finalWorld[3].xyz;
  let width = length(finalWorld[0].xyz);
  let height = length(finalWorld[1].xyz);
  let toCamera = uniforms.cameraPosition - pivot;
  let distanceToCamera = length(toCamera);
  let flatDir = toCamera.xz;
  let flatLength = length(flatDir);
  var f = vec2f(0.0, 1.0);
  if (flatLength > 0.0001) { f = flatDir / flatLength; }
  let right = vec3f(-f.y, 0.0, f.x);
  let cull = input.spriteData.w;
  var grow = 1.0;
  if (cull > 0.0) { grow = 1.0 - smoothstep(cull * 0.8, cull, distanceToCamera); }
  let y01 = input.position.y;
  let localY = (y01 - input.spriteData.x) * height * grow;
  let phase = dot(pivot.xz, vec2f(0.131, 0.173));
  let gust = sin(uniforms.uTime * 1.35 + phase) * 0.7 + sin(uniforms.uTime * 2.9 + phase * 1.9) * 0.3;
  let sway = input.spriteData.y * uniforms.uSpriteParams.y * y01 * y01 * gust * 0.06 * height;
  let qx = input.position.x + 0.5;
  let worldPos = pivot + right * ((qx - input.spriteData.z) * width * grow + sway) + vec3f(0.0, localY, 0.0);
  vertexOutputs.vUV = vec2f(mix(input.spriteRect.x, input.spriteRect.z, qx), mix(input.spriteRect.w, input.spriteRect.y, y01));
  vertexOutputs.vSprite = vec3f(y01, smoothstep(0.9, 2.8, distanceToCamera), height);
#endif
  vertexOutputs.vWorldPosition = worldPos;
  vertexOutputs.position = uniforms.viewProjection * vec4f(worldPos, 1.0);
}
`;

export const spriteFragmentWGSL = /* wgsl */ `
var spriteAtlasSampler : sampler;
var spriteAtlas : texture_2d<f32>;
uniform lightDirection : vec3f;
uniform cameraPosition : vec3f;
uniform uAtlasSize : vec2f;
uniform uSpriteParams : vec4f;
${LOOK_FRAGMENT_WGSL}

varying vUV : vec2f;
varying vWorldPosition : vec3f;
varying vSprite : vec3f;

fn ffBayer(p : vec2f) -> f32 {
  let q = floor(p) - 4.0 * floor(floor(p) / 4.0);
  let a = (q.x + q.y * 2.0) - 4.0 * floor((q.x + q.y * 2.0) / 4.0);
  let b = (q.y * 3.0 + q.x) - 4.0 * floor((q.y * 3.0 + q.x) / 4.0);
  return (a * 4.0 + b + 0.5) / 16.0;
}

@fragment
fn main(input : FragmentInputs) -> FragmentOutputs {
  let texel = textureSample(spriteAtlas, spriteAtlasSampler, input.vUV);
  let dx = dpdx(input.vUV * uniforms.uAtlasSize);
  let dy = dpdy(input.vUV * uniforms.uAtlasSize);
  let lod = max(0.0, 0.5 * log2(max(max(dot(dx, dx), dot(dy, dy)), 0.000001)));
  let dither = ffBayer(fragmentInputs.position.xy);
  let albedo = texel.rgb;
  let shadow = ffShadow(input.vWorldPosition, vec3f(0.0, 1.0, 0.0), 0.6);
  let fill = mix(uniforms.uFFGroundFill, uniforms.uFFSkyFill, 0.7);
  let shade = albedo * ffShadeTint(albedo) * fill * 0.8;
  let lit = albedo * uniforms.uFFSunColor;
  var color = mix(shade, lit, mix(uniforms.uSpriteParams.w, 1.0, shadow));
#ifdef GROUND
  let alpha = texel.a * input.vSprite.x;
  if (alpha < 0.01) { discard; }
  fragmentOutputs.color = vec4f(ffHaze(color, input.vWorldPosition), alpha);
#else
  let alpha = texel.a * (1.0 + lod * 0.28);
  if (input.vSprite.y < 1.0 && dither > input.vSprite.y) { discard; }
  if (alpha < uniforms.uSpriteParams.x) { discard; }
  let foot = 1.0 - smoothstep(0.0, min(0.5, 1.2 / max(input.vSprite.z, 0.5)), input.vSprite.x);
  color = color * (1.0 - foot * 0.16);
  fragmentOutputs.color = vec4f(ffHaze(color, input.vWorldPosition), 0.75);
#endif
}
`;
