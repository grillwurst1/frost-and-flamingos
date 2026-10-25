/**
 * Shelf packer for painted art atlases (sprites, facades). Images are packed
 * tallest-first into a fixed-width canvas with a padded colour halo: the RGB
 * of each image's edge is extruded into the padding while alpha stays 0, so
 * mip-mapped, alpha-tested edges never sample a black fringe.
 *
 * Semi-transparent edge pixels are despilled (magenta backdrop of the
 * owner's keyed art). Rects are returned in texture UV with v = 0 at the top canvas row (the
 * upload convention of RawTexture with invertY = false on WebGL2 and WebGPU),
 * inset by half a texel.
 */
export interface PackInput<K> {
  key: K;
  image: CanvasImageSource;
  w: number;
  h: number;
}

export interface PackedAtlas<K> {
  data: Uint8Array;
  width: number;
  height: number;
  /** key -> [u0, v0, u1, v1] (top-left, bottom-right). */
  rects: Map<K, [number, number, number, number]>;
}

const OFFSETS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
] as const;

function nextPowerOfTwo(value: number): number {
  let size = 256;
  while (size < value) size *= 2;
  return size;
}

export function packImages<K>(inputs: readonly PackInput<K>[], width: number, padding: number, maxHeight = 4096): PackedAtlas<K> | null {
  if (inputs.length === 0) return null;
  const placed = inputs.map((input) => ({ ...input, x: 0, y: 0 }));
  const sorted = [...placed].sort((a, b) => b.h - a.h || b.w - a.w);
  let x = 0;
  let y = 0;
  let shelf = 0;
  for (const item of sorted) {
    const w = item.w + padding * 2;
    const h = item.h + padding * 2;
    if (w > width) return null;
    if (x + w > width) {
      x = 0;
      y += shelf;
      shelf = 0;
    }
    item.x = x + padding;
    item.y = y + padding;
    x += w;
    shelf = Math.max(shelf, h);
  }
  const height = nextPowerOfTwo(y + shelf);
  if (height > maxHeight) return null;

  const colour = document.createElement('canvas');
  colour.width = width;
  colour.height = height;
  const alpha = document.createElement('canvas');
  alpha.width = width;
  alpha.height = height;
  const colourCtx = colour.getContext('2d', { willReadFrequently: true });
  const alphaCtx = alpha.getContext('2d', { willReadFrequently: true });
  if (!colourCtx || !alphaCtx) return null;
  for (const item of placed) {
    for (let ring = padding; ring >= 1; ring -= 1) {
      for (const [dx, dy] of OFFSETS) colourCtx.drawImage(item.image, item.x + dx * ring, item.y + dy * ring, item.w, item.h);
    }
    colourCtx.drawImage(item.image, item.x, item.y, item.w, item.h);
    alphaCtx.drawImage(item.image, item.x, item.y, item.w, item.h);
  }
  const rgb = colourCtx.getImageData(0, 0, width, height).data;
  const mask = alphaCtx.getImageData(0, 0, width, height).data;
  const data = new Uint8Array(width * height * 4);
  const pixels = width * height;
  // Pixels within 3 px of a transparent one (separable box dilation of the clear mask).
  const RADIUS = 3;
  const clear = new Uint8Array(pixels);
  for (let index = 0; index < pixels; index += 1) clear[index] = (mask[index * 4 + 3] ?? 0) < 128 ? 1 : 0;
  const rows = new Uint8Array(pixels);
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    let count = 0;
    for (let x = 0; x < Math.min(width, RADIUS); x += 1) count += clear[row + x] ?? 0;
    for (let x = 0; x < width; x += 1) {
      if (x + RADIUS < width) count += clear[row + x + RADIUS] ?? 0;
      if (x - RADIUS - 1 >= 0) count -= clear[row + x - RADIUS - 1] ?? 0;
      rows[row + x] = count > 0 ? 1 : 0;
    }
  }
  const edge = new Uint8Array(pixels);
  for (let x = 0; x < width; x += 1) {
    let count = 0;
    for (let y = 0; y < Math.min(height, RADIUS); y += 1) count += rows[y * width + x] ?? 0;
    for (let y = 0; y < height; y += 1) {
      if (y + RADIUS < height) count += rows[(y + RADIUS) * width + x] ?? 0;
      if (y - RADIUS - 1 >= 0) count -= rows[(y - RADIUS - 1) * width + x] ?? 0;
      edge[y * width + x] = count > 0 ? 1 : 0;
    }
  }
  for (let index = 0; index < data.length; index += 4) {
    let r = rgb[index] ?? 0;
    const g = rgb[index + 1] ?? 0;
    let b = rgb[index + 2] ?? 0;
    const a = mask[index + 3] ?? 0;
    // Magenta despill on soft edges, the outline band and the halo: the art was
    // keyed off a magenta backdrop, so pixels near the silhouette still carry it.
    if (a < 250 || edge[index / 4]) {
      const spill = Math.min(r, b) - g;
      if (spill > 0) {
        r -= spill;
        b -= spill;
      }
    }
    data[index] = r;
    data[index + 1] = g;
    data[index + 2] = b;
    data[index + 3] = a;
  }
  const rects = new Map<K, [number, number, number, number]>();
  for (const item of placed) {
    rects.set(item.key, [
      (item.x + 0.5) / width,
      (item.y + 0.5) / height,
      (item.x + item.w - 0.5) / width,
      (item.y + item.h - 0.5) / height,
    ]);
  }
  return { data, width, height, rects };
}
