import { Constants } from '@babylonjs/core/Engines/constants';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture';
import type { Scene } from '@babylonjs/core/scene';
import { artUrl, loadListedArtImage } from './art-assets';
import { packImages, type PackInput } from './atlas-pack';

/**
 * Painted sprite atlas: every PNG listed in `art/sprites/manifest.json`
 * (billboard trees, bushes, rocks, clutter and flat ground decals) is packed
 * at load into ONE RGBA texture so the whole painted vegetation layer is a
 * single material. A procedural soft shadow blob is packed alongside.
 *
 * Packing is a height-sorted shelf packer with a padded colour halo around
 * each sprite (the RGB of the outermost pixels is extruded into the padding
 * while alpha stays 0), so mip-mapped, alpha-tested edges never sample
 * black fringe. UV rects follow the upload convention: v = 0 is the top row
 * of the canvas on both WebGL2 and WebGPU.
 *
 * Manifest entry contract (see the file's own comment too):
 *   id, file (relative to art/sprites/), px [w, h]
 *   billboard: height (m at scale 1), pivot [u, v-from-bottom], sway, shadow
 *   ground decal: ground: true, size (m of the longest side)
 *   tags: role + biome tags used by the scatter (map/vegetation.ts)
 */
export interface SpriteManifestEntry {
  id: string;
  file: string;
  px?: [number, number];
  height?: number;
  pivot?: [number, number];
  tags?: string[];
  sway?: number;
  shadow?: number;
  ground?: boolean;
  size?: number;
}

export interface SpriteEntry {
  id: string;
  /** u0, v0 (top-left), u1, v1 (bottom-right) in atlas UV. */
  rect: [number, number, number, number];
  /** Image width / height. */
  aspect: number;
  height: number;
  /** Ground contact across the image (0 left, 1 right). */
  pivotU: number;
  pivotV: number;
  tags: ReadonlySet<string>;
  sway: number;
  shadow: number;
  ground: boolean;
  /** Ground decals: longest side in metres. */
  size: number;
}

export interface SpriteAtlas {
  texture: RawTexture;
  entries: ReadonlyMap<string, SpriteEntry>;
  /** Soft round shadow blob (procedural). */
  blob: SpriteEntry;
  width: number;
  height: number;
  /** All entries carrying every tag in `tags`, in manifest order. */
  pick(...tags: string[]): SpriteEntry[];
  dispose(): void;
}

const MANIFEST_PATH = 'sprites/manifest.json';
const ATLAS_WIDTH = 2048;
const PADDING = 6;
const BLOB_SIZE = 96;
const BLOB_KEY = '__blob';

async function fetchManifest(): Promise<SpriteManifestEntry[] | null> {
  if (typeof fetch === 'undefined') return null;
  try {
    const response = await fetch(artUrl(MANIFEST_PATH), { cache: 'no-cache' });
    if (!response.ok) return null;
    const type = response.headers.get('content-type') ?? '';
    if (!type.includes('json')) return null;
    const data = (await response.json()) as { sprites?: unknown };
    if (!Array.isArray(data.sprites)) return null;
    return data.sprites.filter(
      (item): item is SpriteManifestEntry =>
        typeof item === 'object' && item !== null && typeof (item as SpriteManifestEntry).id === 'string' && typeof (item as SpriteManifestEntry).file === 'string',
    );
  } catch {
    return null;
  }
}

function blobCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = BLOB_SIZE;
  canvas.height = BLOB_SIZE;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const r = BLOB_SIZE / 2;
    const gradient = ctx.createRadialGradient(r, r, 0, r, r, r - 1);
    gradient.addColorStop(0, 'rgba(40, 62, 120, 1)');
    gradient.addColorStop(0.55, 'rgba(40, 62, 120, 0.78)');
    gradient.addColorStop(1, 'rgba(40, 62, 120, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, BLOB_SIZE, BLOB_SIZE);
  }
  return canvas;
}

/**
 * Loads the manifest and every sprite, packs the atlas. Resolves null when
 * the manifest is missing or nothing loaded (callers keep procedural props).
 */
export async function loadSpriteAtlas(scene: Scene): Promise<SpriteAtlas | null> {
  const manifest = await fetchManifest();
  if (!manifest || manifest.length === 0) return null;
  const loaded = await Promise.all(
    manifest.map(async (entry) => ({ entry, image: await loadListedArtImage(`sprites/${entry.file}`) })),
  );
  const inputs: PackInput<string>[] = [];
  const specs = new Map<string, { entry: SpriteManifestEntry; w: number; h: number }>();
  for (const { entry, image } of loaded) {
    if (!image || image.naturalWidth <= 0 || specs.has(entry.id)) continue;
    inputs.push({ key: entry.id, image, w: image.naturalWidth, h: image.naturalHeight });
    specs.set(entry.id, { entry, w: image.naturalWidth, h: image.naturalHeight });
  }
  if (inputs.length === 0) return null;
  inputs.push({ key: BLOB_KEY, image: blobCanvas(), w: BLOB_SIZE, h: BLOB_SIZE });
  specs.set(BLOB_KEY, { entry: { id: BLOB_KEY, file: '', tags: ['blob'] }, w: BLOB_SIZE, h: BLOB_SIZE });
  const packed = packImages(inputs, ATLAS_WIDTH, PADDING);
  if (!packed) return null;
  const height = packed.height;
  const texture = RawTexture.CreateRGBATexture(
    packed.data,
    ATLAS_WIDTH,
    height,
    scene,
    true,
    false,
    Constants.TEXTURE_TRILINEAR_SAMPLINGMODE,
  );
  texture.name = 'ff-sprite-atlas';
  texture.hasAlpha = true;
  texture.wrapU = Constants.TEXTURE_CLAMP_ADDRESSMODE;
  texture.wrapV = Constants.TEXTURE_CLAMP_ADDRESSMODE;
  texture.anisotropicFilteringLevel = 4;

  const entries = new Map<string, SpriteEntry>();
  let blob: SpriteEntry | null = null;
  for (const [id, spec] of specs) {
    const rect = packed.rects.get(id);
    if (!rect) continue;
    const e = spec.entry;
    const entry: SpriteEntry = {
      id,
      rect,
      aspect: spec.w / Math.max(1, spec.h),
      height: Math.max(0.05, e.height ?? 1),
      pivotU: Math.max(0, Math.min(1, e.pivot?.[0] ?? 0.5)),
      pivotV: Math.max(0, Math.min(0.5, e.pivot?.[1] ?? 0.03)),
      tags: new Set(e.tags ?? []),
      sway: Math.max(0, Math.min(1, e.sway ?? 0)),
      shadow: Math.max(0, Math.min(1, e.shadow ?? 0)),
      ground: e.ground === true,
      size: Math.max(0.1, e.size ?? 1),
    };
    if (id === BLOB_KEY) blob = entry;
    else entries.set(id, entry);
  }
  if (!blob) return null;
  const order = manifest.map((entry) => entry.id);
  const list = order.map((id) => entries.get(id)).filter((entry): entry is SpriteEntry => Boolean(entry));
  const cache = new Map<string, SpriteEntry[]>();
  return {
    texture,
    entries,
    blob,
    width: ATLAS_WIDTH,
    height,
    pick(...tags: string[]) {
      const key = tags.join('|');
      const cached = cache.get(key);
      if (cached) return cached;
      const result = list.filter((entry) => tags.every((tag) => entry.tags.has(tag)));
      cache.set(key, result);
      return result;
    },
    dispose() {
      texture.dispose();
    },
  };
}
