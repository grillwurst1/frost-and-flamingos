/** Rest-space pigment modulation: drawn creases follow the GPU-skinned garment.
 * The atlas supplies luminance, while the selected wardrobe supplies its colour.
 * Explicit gradients keep both backends legal inside the material/skin branches.
 */
export const COMIC_PAINT_GLSL = /* glsl */ `
#if defined(FF_SOFT_CHARACTER) || defined(FF_COMIC_PROP)
varying vec3 vPaintRest;
varying vec3 vPaintNormal;
varying vec2 vComicPaint;
uniform sampler2D comicPaintSampler;
vec3 ffComicCloth(vec3 base, float kind, vec3 p, vec3 n, vec3 gx, vec3 gy) {
  vec3 a = abs(n);
  vec2 uv = p.xy, dx = gx.xy, dy = gy.xy;
  if (a.x > a.z && a.x > a.y) { uv = p.zy; dx = gx.zy; dy = gy.zy; }
  else if (a.y > a.z && a.y > a.x) { uv = p.xz; dx = gx.xz; dy = gy.xz; }
  float cell = clamp(kind - 1.0, 0.0, 7.0);
  vec2 size = vec2(textureSize(comicPaintSampler, 0));
  vec2 scale = vec2(.25, .5);
  vec2 coord = (vec2(mod(cell, 4.0), floor(cell / 4.0)) + .025 + fract(uv * 1.7) * .95) * scale;
  vec2 ddx = dx * 1.7 * .95 * scale * size, ddy = dy * 1.7 * .95 * scale * size;
  float lod = clamp(.5 * log2(max(max(dot(ddx,ddx),dot(ddy,ddy)), 1e-8)), 0.0, 4.0);
  vec3 paint = texture2DLodEXT(comicPaintSampler, coord, lod).rgb;
  float mean = cell < .5 ? .46 : cell < 1.5 ? .40 : cell < 2.5 ? .78 : cell < 3.5 ? .21 : cell < 4.5 ? .25 : cell < 5.5 ? .25 : cell < 6.5 ? .40 : .78;
  float value = clamp(dot(paint, vec3(.299,.587,.114)) / mean, .38, 1.4);
  float fade = 1.0 - smoothstep(3.0, 5.0, lod);
  float strength = cell < .5 ? .55 : cell < 1.5 ? .35 : cell < 2.5 ? .17 : cell < 3.5 ? .24 : cell < 4.5 ? .40 : cell < 5.5 ? .28 : cell > 6.5 ? .14 : .35;
  return base * mix(1.0, value, strength * fade);
}
#endif
`;

export const COMIC_PAINT_WGSL = /* wgsl */ `
#if defined(FF_SOFT_CHARACTER) || defined(FF_COMIC_PROP)
varying vPaintRest : vec3f;
varying vPaintNormal : vec3f;
varying vComicPaint : vec2f;
var comicPaintSamplerSampler : sampler;
var comicPaintSampler : texture_2d<f32>;
fn ffComicCloth(base : vec3f, kind : f32, p : vec3f, n : vec3f, gx : vec3f, gy : vec3f) -> vec3f {
  let a = abs(n);
  var uv = p.xy; var dx = gx.xy; var dy = gy.xy;
  if (a.x > a.z && a.x > a.y) { uv = p.zy; dx = gx.zy; dy = gy.zy; }
  else if (a.y > a.z && a.y > a.x) { uv = p.xz; dx = gx.xz; dy = gy.xz; }
  let cell = clamp(kind - 1.0, 0.0, 7.0);
  let size = vec2f(textureDimensions(comicPaintSampler, 0));
  let scale = vec2f(.25, .5);
  let coord = (vec2f(cell % 4.0, floor(cell / 4.0)) + .025 + fract(uv * 1.7) * .95) * scale;
  let ddx = dx * 1.7 * .95 * scale * size; let ddy = dy * 1.7 * .95 * scale * size;
  let lod = clamp(.5 * log2(max(max(dot(ddx,ddx),dot(ddy,ddy)), 1e-8)), 0.0, 4.0);
  let paint = textureSampleLevel(comicPaintSampler, comicPaintSamplerSampler, coord, lod).rgb;
  var mean = .78;
  if (cell < .5) { mean = .46; } else if (cell < 1.5) { mean = .40; } else if (cell < 2.5) { mean = .78; }
  else if (cell < 3.5) { mean = .21; } else if (cell < 4.5) { mean = .25; } else if (cell < 5.5) { mean = .25; } else if (cell < 6.5) { mean = .40; }
  let value = clamp(dot(paint, vec3f(.299,.587,.114)) / mean, .38, 1.4);
  let fade = 1.0 - smoothstep(3.0, 5.0, lod);
  var strength = .35;
  if(cell < .5) {strength=.55;} else if(cell > 1.5 && cell < 2.5) {strength=.17;} else if(cell > 6.5) {strength=.14;} else if(cell < 3.5 && cell > 2.5) {strength=.24;} else if(cell < 4.5 && cell > 3.5) {strength=.40;} else if(cell < 5.5 && cell > 4.5) {strength=.28;}
  return base * mix(1.0, value, strength * fade);
}
#endif
`;
