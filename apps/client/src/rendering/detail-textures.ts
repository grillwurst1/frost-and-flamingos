import { Constants } from '@babylonjs/core/Engines/constants';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture';
import type { Scene } from '@babylonjs/core/scene';
import { loadArtImage } from './art-assets';

/**
 * Procedural painted detail tiles, drawn once at startup with Canvas 2D and
 * packed four grayscale patterns per RGBA texture (see shaders/detail.ts):
 *
 *   detailA  R planks   G log wall   B shingles   A cobblestone   (4 m tile)
 *   detailB  R snow     G sand       B grass      A rock          (8 m tile)
 *   detailC  R brush    G foliage    B hatching   A sparkle       (4 m tile)
 *
 * 128 is neutral; dark values are ink (gaps, mortar, cracks). Every stroke is
 * drawn wrapped around the tile edges so the textures repeat seamlessly.
 * Optional painted tiles from art/tex/*.jpg replace a channel when present
 * (luminance, re-centred on 0.5); missing files keep the procedural version.
 */
export const DETAIL_SIZE = 512;

type Painter = (ctx: CanvasRenderingContext2D, random: () => number) => void;

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function grey(value: number, alpha = 1): string {
  const v = Math.max(0, Math.min(255, Math.round(value)));
  return `rgba(${v},${v},${v},${alpha})`;
}

/** Calls `draw` once per tile offset that the shape (bounding radius r at x, y) touches. */
function wrapped(x: number, y: number, r: number, draw: (ox: number, oy: number) => void): void {
  const size = DETAIL_SIZE;
  const xs = [0];
  const ys = [0];
  if (x - r < 0) xs.push(size);
  if (x + r > size) xs.push(-size);
  if (y - r < 0) ys.push(size);
  if (y + r > size) ys.push(-size);
  for (const ox of xs) for (const oy of ys) draw(ox, oy);
}

function stroke(
  ctx: CanvasRenderingContext2D,
  points: Array<[number, number]>,
  width: number,
  style: string,
): void {
  if (points.length < 2) return;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [px, py] of points) {
    minX = Math.min(minX, px);
    maxX = Math.max(maxX, px);
    minY = Math.min(minY, py);
    maxY = Math.max(maxY, py);
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const r = Math.max(maxX - minX, maxY - minY) / 2 + width;
  ctx.strokeStyle = style;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  wrapped(cx, cy, r, (ox, oy) => {
    ctx.beginPath();
    const first = points[0];
    if (!first) return;
    ctx.moveTo(first[0] + ox, first[1] + oy);
    for (let i = 1; i < points.length; i += 1) {
      const point = points[i];
      if (point) ctx.lineTo(point[0] + ox, point[1] + oy);
    }
    ctx.stroke();
  });
}

function blob(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rotation: number, style: string): void {
  ctx.fillStyle = style;
  wrapped(x, y, Math.max(rx, ry), (ox, oy) => {
    ctx.beginPath();
    ctx.ellipse(x + ox, y + oy, rx, ry, rotation, 0, Math.PI * 2);
    ctx.fill();
  });
}

function wavyLine(y: number, amplitude: number, frequency: number, phase: number, steps = 32): Array<[number, number]> {
  const points: Array<[number, number]> = [];
  for (let i = 0; i <= steps; i += 1) {
    const x = (i / steps) * DETAIL_SIZE;
    points.push([x, y + Math.sin((x / DETAIL_SIZE) * Math.PI * 2 * frequency + phase) * amplitude]);
  }
  return points;
}

const paintPlanks: Painter = (ctx, random) => {
  const rows = 16;
  const h = DETAIL_SIZE / rows;
  for (let row = 0; row < rows; row += 1) {
    const y = row * h;
    ctx.fillStyle = grey(118 + random() * 30);
    ctx.fillRect(0, y, DETAIL_SIZE, h);
    for (let g = 0; g < 9; g += 1) {
      const gy = y + 3 + random() * (h - 6);
      stroke(ctx, wavyLine(gy, 1 + random() * 1.5, 1 + Math.floor(random() * 3), random() * 6), 1 + random() * 1.2, grey(random() > 0.5 ? 92 : 160, 0.45));
    }
    const joints = 1 + Math.floor(random() * 2);
    for (let j = 0; j < joints; j += 1) {
      const x = random() * DETAIL_SIZE;
      stroke(ctx, [[x, y + 1], [x + (random() - 0.5) * 2, y + h - 1]], 2.6, grey(22));
      stroke(ctx, [[x + 2.5, y + 2], [x + 2.5, y + h - 2]], 1.2, grey(170, 0.6));
    }
    if (random() > 0.45) {
      const kx = random() * DETAIL_SIZE;
      const ky = y + h * (0.35 + random() * 0.3);
      blob(ctx, kx, ky, 4 + random() * 3, 2.5 + random() * 1.5, 0, grey(60, 0.9));
      blob(ctx, kx, ky, 1.8, 1.2, 0, grey(30));
    }
    stroke(ctx, [[0, y + 0.5], [DETAIL_SIZE, y + 0.5]], 3.2, grey(14));
    stroke(ctx, [[0, y + 3], [DETAIL_SIZE, y + 3]], 1.4, grey(165, 0.5));
  }
};

const paintLogs: Painter = (ctx, random) => {
  const rows = 12;
  const h = DETAIL_SIZE / rows;
  for (let row = 0; row < rows; row += 1) {
    const y = row * h;
    const tone = 120 + random() * 22;
    const gradient = ctx.createLinearGradient(0, y, 0, y + h);
    gradient.addColorStop(0, grey(tone - 52));
    gradient.addColorStop(0.28, grey(tone + 38));
    gradient.addColorStop(0.55, grey(tone + 12));
    gradient.addColorStop(1, grey(tone - 58));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, y, DETAIL_SIZE, h);
    for (let g = 0; g < 10; g += 1) {
      const gy = y + 5 + random() * (h - 10);
      stroke(ctx, wavyLine(gy, 0.8 + random() * 1.4, 1 + Math.floor(random() * 4), random() * 6), 1 + random(), grey(random() > 0.4 ? 78 : 175, 0.4));
    }
    const cracks = Math.floor(random() * 3);
    for (let c = 0; c < cracks; c += 1) {
      const x = random() * DETAIL_SIZE;
      const cy = y + h * (0.3 + random() * 0.4);
      const length = 20 + random() * 50;
      stroke(ctx, [[x, cy], [x + length * 0.5, cy + (random() - 0.5) * 3], [x + length, cy + (random() - 0.5) * 2]], 1.6, grey(26));
    }
    stroke(ctx, [[0, y + 1], [DETAIL_SIZE, y + 1]], 4.2, grey(12));
  }
};

const paintShingles: Painter = (ctx, random) => {
  const rows = 12;
  const cols = 8;
  const h = DETAIL_SIZE / rows;
  const w = DETAIL_SIZE / cols;
  ctx.fillStyle = grey(60);
  ctx.fillRect(0, 0, DETAIL_SIZE, DETAIL_SIZE);
  // Bottom rows first so the rows above overlap their tops like real shingles.
  for (let row = rows - 1; row >= 0; row -= 1) {
    const y = row * h;
    const offset = row % 2 === 0 ? 0 : w / 2;
    for (let col = -1; col <= cols; col += 1) {
      const x = col * w + offset;
      const tone = 112 + random() * 40;
      const drawShingle = (ox: number, oy: number): void => {
        const left = x + 1.5 + ox;
        const right = x + w - 1.5 + ox;
        const top = y - 2 + oy;
        const bottom = y + h + 6 + oy;
        const gradient = ctx.createLinearGradient(0, top, 0, bottom);
        gradient.addColorStop(0, grey(tone - 45));
        gradient.addColorStop(0.45, grey(tone));
        gradient.addColorStop(1, grey(tone + 26));
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.moveTo(left, top);
        ctx.lineTo(right, top);
        ctx.lineTo(right, bottom - w * 0.3);
        ctx.quadraticCurveTo((left + right) / 2, bottom + w * 0.12, left, bottom - w * 0.3);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = grey(16);
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.moveTo(right, bottom - w * 0.3);
        ctx.quadraticCurveTo((left + right) / 2, bottom + w * 0.12, left, bottom - w * 0.3);
        ctx.stroke();
        ctx.strokeStyle = grey(40, 0.8);
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(left, top);
        ctx.lineTo(left, bottom - w * 0.3);
        ctx.stroke();
      };
      wrapped(x + w / 2, y + h / 2, Math.max(w, h), drawShingle);
    }
  }
};

const paintCobbles: Painter = (ctx, random) => {
  ctx.fillStyle = grey(44);
  ctx.fillRect(0, 0, DETAIL_SIZE, DETAIL_SIZE);
  const cells = 10;
  const cell = DETAIL_SIZE / cells;
  for (let gy = 0; gy < cells; gy += 1) {
    for (let gx = 0; gx < cells; gx += 1) {
      const cx = (gx + 0.5 + (gy % 2 === 0 ? 0 : 0.5)) * cell + (random() - 0.5) * cell * 0.2;
      const cy = (gy + 0.5) * cell + (random() - 0.5) * cell * 0.2;
      const rx = cell * (0.4 + random() * 0.07);
      const ry = cell * (0.36 + random() * 0.07);
      const rotation = (random() - 0.5) * 0.6;
      const tone = 118 + random() * 46;
      blob(ctx, cx, cy, rx, ry, rotation, grey(tone));
      blob(ctx, cx - rx * 0.22, cy - ry * 0.25, rx * 0.55, ry * 0.42, rotation, grey(tone + 30, 0.7));
      blob(ctx, cx + rx * 0.25, cy + ry * 0.35, rx * 0.6, ry * 0.32, rotation, grey(tone - 38, 0.55));
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = grey(18);
      wrapped(cx, cy, Math.max(rx, ry) + 2, (ox, oy) => {
        ctx.beginPath();
        ctx.ellipse(cx + ox, cy + oy, rx, ry, rotation, 0, Math.PI * 2);
        ctx.stroke();
      });
    }
  }
};

const paintSnow: Painter = (ctx, random) => {
  ctx.fillStyle = grey(132);
  ctx.fillRect(0, 0, DETAIL_SIZE, DETAIL_SIZE);
  for (let i = 0; i < 220; i += 1) {
    const x = random() * DETAIL_SIZE;
    const y = random() * DETAIL_SIZE;
    const length = 50 + random() * 140;
    const angle = (random() - 0.5) * 0.7;
    const bend = (random() - 0.5) * 18;
    const points: Array<[number, number]> = [];
    for (let s = 0; s <= 8; s += 1) {
      const t = s / 8;
      points.push([
        x + Math.cos(angle) * length * t,
        y + Math.sin(angle) * length * t + Math.sin(t * Math.PI) * bend,
      ]);
    }
    const light = random() > 0.42;
    stroke(ctx, points, 6 + random() * 16, grey(light ? 172 + random() * 20 : 78 + random() * 18, 0.2 + random() * 0.2));
  }
  for (let i = 0; i < 60; i += 1) {
    const x = random() * DETAIL_SIZE;
    const y = random() * DETAIL_SIZE;
    const points: Array<[number, number]> = [[x, y], [x + 18 + random() * 30, y + (random() - 0.5) * 6]];
    stroke(ctx, points, 1.4, grey(84, 0.35));
  }
};

const paintSand: Painter = (ctx, random) => {
  ctx.fillStyle = grey(130);
  ctx.fillRect(0, 0, DETAIL_SIZE, DETAIL_SIZE);
  const ripples = 16;
  for (let r = 0; r < ripples; r += 1) {
    const y = (r / ripples) * DETAIL_SIZE + random() * 6;
    const phase = random() * 6;
    const frequency = 1 + Math.floor(random() * 3);
    stroke(ctx, wavyLine(y + 4, 5, frequency, phase, 48), 7, grey(158, 0.35));
    stroke(ctx, wavyLine(y, 5, frequency, phase, 48), 1.8, grey(70, 0.65));
  }
  for (let i = 0; i < 1400; i += 1) {
    const x = random() * DETAIL_SIZE;
    const y = random() * DETAIL_SIZE;
    blob(ctx, x, y, 0.8 + random() * 0.9, 0.8 + random() * 0.9, 0, grey(random() > 0.5 ? 80 : 182, 0.7));
  }
};

const paintGrass: Painter = (ctx, random) => {
  ctx.fillStyle = grey(126);
  ctx.fillRect(0, 0, DETAIL_SIZE, DETAIL_SIZE);
  for (let i = 0; i < 70; i += 1) {
    blob(ctx, random() * DETAIL_SIZE, random() * DETAIL_SIZE, 20 + random() * 40, 12 + random() * 26, random() * 3, grey(random() > 0.5 ? 146 : 108, 0.25));
  }
  for (let i = 0; i < 2400; i += 1) {
    const x = random() * DETAIL_SIZE;
    const y = random() * DETAIL_SIZE;
    const length = 7 + random() * 15;
    const angle = -Math.PI / 2 + (random() - 0.5) * 0.9;
    const tone = random() > 0.55 ? 160 + random() * 30 : 74 + random() * 30;
    stroke(ctx, [[x, y], [x + Math.cos(angle) * length * 0.5 + (random() - 0.5) * 2, y + Math.sin(angle) * length * 0.5], [x + Math.cos(angle) * length, y + Math.sin(angle) * length]], 1.6 + random() * 1.8, grey(tone, 0.55));
  }
};

const paintRock: Painter = (ctx, random) => {
  ctx.fillStyle = grey(128);
  ctx.fillRect(0, 0, DETAIL_SIZE, DETAIL_SIZE);
  for (let band = 0; band < 14; band += 1) {
    const y = (band / 14) * DETAIL_SIZE + random() * 10;
    stroke(ctx, wavyLine(y, 6 + random() * 6, 1 + Math.floor(random() * 2), random() * 6, 40), 14 + random() * 18, grey(random() > 0.5 ? 150 : 104, 0.3));
  }
  for (let facet = 0; facet < 40; facet += 1) {
    const x = random() * DETAIL_SIZE;
    const y = random() * DETAIL_SIZE;
    blob(ctx, x, y, 14 + random() * 26, 8 + random() * 16, random() * 3, grey(random() > 0.5 ? 162 : 96, 0.28));
  }
  for (let crack = 0; crack < 26; crack += 1) {
    let x = random() * DETAIL_SIZE;
    let y = random() * DETAIL_SIZE;
    const points: Array<[number, number]> = [[x, y]];
    let angle = Math.PI * 0.5 + (random() - 0.5) * 1.6;
    const segments = 4 + Math.floor(random() * 6);
    for (let s = 0; s < segments; s += 1) {
      angle += (random() - 0.5) * 0.9;
      const length = 8 + random() * 16;
      x += Math.cos(angle) * length;
      y += Math.sin(angle) * length;
      points.push([x, y]);
    }
    stroke(ctx, points.map(([px, py]) => [px + 2, py + 1.5]), 1.5, grey(176, 0.55));
    stroke(ctx, points, 1.4 + random() * 1.6, grey(18));
  }
};

const paintBrush: Painter = (ctx, random) => {
  ctx.fillStyle = grey(128);
  ctx.fillRect(0, 0, DETAIL_SIZE, DETAIL_SIZE);
  for (let i = 0; i < 160; i += 1) {
    const x = random() * DETAIL_SIZE;
    const y = random() * DETAIL_SIZE;
    const length = 40 + random() * 110;
    const angle = random() * Math.PI;
    const points: Array<[number, number]> = [];
    for (let s = 0; s <= 6; s += 1) {
      const t = s / 6;
      points.push([x + Math.cos(angle) * length * t, y + Math.sin(angle) * length * t + Math.sin(t * 3) * 6]);
    }
    stroke(ctx, points, 14 + random() * 30, grey(random() > 0.5 ? 150 : 106, 0.12));
  }
};

const paintFoliage: Painter = (ctx, random) => {
  ctx.fillStyle = grey(122);
  ctx.fillRect(0, 0, DETAIL_SIZE, DETAIL_SIZE);
  for (let i = 0; i < 1500; i += 1) {
    const x = random() * DETAIL_SIZE;
    const y = random() * DETAIL_SIZE;
    const dark = random() > 0.5;
    blob(ctx, x, y, 5 + random() * 7, 2.2 + random() * 2.6, random() * Math.PI, grey(dark ? 70 + random() * 20 : 158 + random() * 26, 0.6));
  }
};

const paintHatch: Painter = (ctx, random) => {
  ctx.fillStyle = grey(255);
  ctx.fillRect(0, 0, DETAIL_SIZE, DETAIL_SIZE);
  const period = 16;
  // Secondary direction (cross-hatch), value ~0.36.
  for (let k = -DETAIL_SIZE; k < DETAIL_SIZE * 2; k += period) {
    for (let seg = 0; seg < 4; seg += 1) {
      if (random() < 0.18) continue;
      const t0 = seg * 0.25 + random() * 0.04;
      const t1 = t0 + 0.2 + random() * 0.05;
      const ax = k + t0 * DETAIL_SIZE;
      const bx = k + t1 * DETAIL_SIZE;
      stroke(ctx, [[ax, t0 * DETAIL_SIZE], [bx, t1 * DETAIL_SIZE]], 1.8 + random() * 0.6, grey(92));
    }
  }
  // Primary direction, value 0.
  for (let k = -DETAIL_SIZE; k < DETAIL_SIZE * 2; k += period) {
    for (let seg = 0; seg < 4; seg += 1) {
      if (random() < 0.15) continue;
      const t0 = seg * 0.25 + random() * 0.04;
      const t1 = t0 + 0.2 + random() * 0.05;
      stroke(ctx, [[k - t0 * DETAIL_SIZE + DETAIL_SIZE, t0 * DETAIL_SIZE], [k - t1 * DETAIL_SIZE + DETAIL_SIZE, t1 * DETAIL_SIZE]], 2.2 + random() * 0.8, grey(0));
    }
  }
};

const paintSparkle: Painter = (ctx, random) => {
  ctx.fillStyle = grey(0);
  ctx.fillRect(0, 0, DETAIL_SIZE, DETAIL_SIZE);
  for (let i = 0; i < 110; i += 1) {
    const x = random() * DETAIL_SIZE;
    const y = random() * DETAIL_SIZE;
    const size = 2 + random() * 3.5;
    stroke(ctx, [[x - size, y], [x + size, y]], 1.1, grey(255));
    stroke(ctx, [[x, y - size], [x, y + size]], 1.1, grey(255));
    blob(ctx, x, y, 1.1, 1.1, 0, grey(255));
  }
};

interface ChannelSpec {
  painter: Painter;
  seed: number;
  /** Optional painted tile under public/art/tex/ and how often it repeats per detail tile. */
  art?: { file: string; repeat: number };
}

const DETAIL_LAYOUT: Record<'detailA' | 'detailB' | 'detailC', [ChannelSpec, ChannelSpec, ChannelSpec, ChannelSpec]> = {
  detailA: [
    { painter: paintPlanks, seed: 11, art: { file: 'wood_planks.jpg', repeat: 2 } },
    { painter: paintLogs, seed: 12, art: { file: 'log_wall.jpg', repeat: 2 } },
    { painter: paintShingles, seed: 13, art: { file: 'shingles.jpg', repeat: 2 } },
    { painter: paintCobbles, seed: 14, art: { file: 'cobblestone.jpg', repeat: 2 } },
  ],
  detailB: [
    { painter: paintSnow, seed: 21, art: { file: 'snow.jpg', repeat: 1 } },
    { painter: paintSand, seed: 22, art: { file: 'sand.jpg', repeat: 2 } },
    { painter: paintGrass, seed: 23, art: { file: 'grass.jpg', repeat: 2 } },
    { painter: paintRock, seed: 24, art: { file: 'rock.jpg', repeat: 1 } },
  ],
  detailC: [
    { painter: paintBrush, seed: 31 },
    { painter: paintFoliage, seed: 32 },
    { painter: paintHatch, seed: 33 },
    { painter: paintSparkle, seed: 34 },
  ],
};

export type DetailTextureName = keyof typeof DETAIL_LAYOUT;

function createContext(): CanvasRenderingContext2D | null {
  const canvas = document.createElement('canvas');
  canvas.width = DETAIL_SIZE;
  canvas.height = DETAIL_SIZE;
  return canvas.getContext('2d', { willReadFrequently: true });
}

function paintChannel(spec: ChannelSpec): Uint8ClampedArray | null {
  const ctx = createContext();
  if (!ctx) return null;
  spec.painter(ctx, mulberry32(spec.seed));
  return ctx.getImageData(0, 0, DETAIL_SIZE, DETAIL_SIZE).data;
}

/** Luminance of a painted tile, re-centred so its average is neutral (128). */
function paintedChannel(image: HTMLImageElement | ImageBitmap, repeat: number): Uint8ClampedArray | null {
  const ctx = createContext();
  if (!ctx) return null;
  const step = DETAIL_SIZE / repeat;
  for (let y = 0; y < repeat; y += 1) {
    for (let x = 0; x < repeat; x += 1) {
      ctx.drawImage(image, x * step, y * step, step, step);
    }
  }
  const data = ctx.getImageData(0, 0, DETAIL_SIZE, DETAIL_SIZE).data;
  let sum = 0;
  const count = DETAIL_SIZE * DETAIL_SIZE;
  for (let i = 0; i < count; i += 1) {
    sum += (data[i * 4] ?? 0) * 0.299 + (data[i * 4 + 1] ?? 0) * 0.587 + (data[i * 4 + 2] ?? 0) * 0.114;
  }
  const mean = sum / count;
  for (let i = 0; i < count; i += 1) {
    const luma = (data[i * 4] ?? 0) * 0.299 + (data[i * 4 + 1] ?? 0) * 0.587 + (data[i * 4 + 2] ?? 0) * 0.114;
    data[i * 4] = Math.max(0, Math.min(255, luma - mean + 128));
  }
  return data;
}

function pack(channels: Array<Uint8ClampedArray | null>): Uint8Array {
  const packed = new Uint8Array(DETAIL_SIZE * DETAIL_SIZE * 4);
  for (let c = 0; c < 4; c += 1) {
    const source = channels[c];
    for (let i = 0; i < DETAIL_SIZE * DETAIL_SIZE; i += 1) {
      packed[i * 4 + c] = source ? (source[i * 4] ?? 128) : 128;
    }
  }
  return packed;
}

export interface DetailTextureSet {
  detailA: RawTexture;
  detailB: RawTexture;
  detailC: RawTexture;
  /** Resolves once optional painted tiles were probed and merged. */
  painted: Promise<number>;
  dispose(): void;
}

const yieldToFrame = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Creates the three packed detail textures. They start neutral (no detail)
 * so boot never waits on them; each channel is then filled asynchronously,
 * one channel per task: from the painted tile when it exists, otherwise from
 * the procedural painter. `painted` resolves with the number of painted tiles.
 */
export function createDetailTextures(scene: Scene): DetailTextureSet {
  const neutral = new Uint8Array(DETAIL_SIZE * DETAIL_SIZE * 4).fill(128);
  const textures = {} as Record<DetailTextureName, RawTexture>;
  let disposed = false;
  for (const name of Object.keys(DETAIL_LAYOUT) as DetailTextureName[]) {
    const texture = RawTexture.CreateRGBATexture(
      neutral,
      DETAIL_SIZE,
      DETAIL_SIZE,
      scene,
      true,
      false,
      Constants.TEXTURE_TRILINEAR_SAMPLINGMODE,
    );
    texture.name = `ff-${name}`;
    texture.wrapU = Constants.TEXTURE_WRAP_ADDRESSMODE;
    texture.wrapV = Constants.TEXTURE_WRAP_ADDRESSMODE;
    texture.anisotropicFilteringLevel = 4;
    textures[name] = texture;
  }

  const painted = (async () => {
    let fromArt = 0;
    for (const name of Object.keys(DETAIL_LAYOUT) as DetailTextureName[]) {
      const specs = DETAIL_LAYOUT[name];
      const data: Array<Uint8ClampedArray | null> = [];
      for (const spec of specs) {
        let channel: Uint8ClampedArray | null = null;
        if (spec.art) {
          const image = await loadArtImage(`tex/${spec.art.file}`);
          if (image) channel = paintedChannel(image, spec.art.repeat);
          if (channel) fromArt += 1;
        }
        if (!channel) {
          await yieldToFrame();
          channel = paintChannel(spec);
        }
        data.push(channel);
        if (disposed) return fromArt;
      }
      const texture = textures[name];
      if (texture.getInternalTexture()) texture.update(pack(data));
      await yieldToFrame();
    }
    return fromArt;
  })();

  return {
    detailA: textures.detailA,
    detailB: textures.detailB,
    detailC: textures.detailC,
    painted,
    dispose() {
      disposed = true;
      textures.detailA.dispose();
      textures.detailB.dispose();
      textures.detailC.dispose();
    },
  };
}
