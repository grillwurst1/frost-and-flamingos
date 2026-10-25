import { Constants } from '@babylonjs/core/Engines/constants';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture';
import type { Scene } from '@babylonjs/core/scene';
import { artUrl, loadArtImage } from './art-assets';
import { packImages, type PackInput } from './atlas-pack';

/**
 * Owner-painted building facades (`art/facades/manifest.json`). Every panel
 * PNG of every set is packed into ONE atlas texture; buildings map to sets by
 * blueprint prop id (`buildings`), so a missing set or file simply keeps the
 * procedural look for that building.
 *
 * Panel metrics are pixel coordinates in the source PNG (y down):
 *   gable front/back  wall [x0, x1] = building width, ground row, apex [x, y]
 *                     (top of the ridge snow), eave [xl, xr, y] (roof tips)
 *   side              wall [x0, x1] = building depth, ground row, top row of
 *                     the wall band (just under the eave)
 *   roof              rect [x0, y0, x1, y1] of the roof top view, `front`
 *                     names the image edge that faces the building front
 *   pavilion          front/side crop [x0, y0, x1, y1] of the open pavilion
 *                     (posts to finial), roof rect + basin rim
 *   lighthouse        front/side crop of the striped tower, lantern dome
 *   fortress          crop bands for ground floor, upper floor and clock house
 */
export interface GablePanel {
  file: string;
  wall: [number, number];
  ground: number;
  apex: [number, number];
  eave: [number, number, number];
}

export interface SidePanel {
  file: string;
  wall: [number, number];
  ground: number;
  top: number;
}

export interface RoofPanel {
  file: string;
  rect: [number, number, number, number];
  front: 'bottom' | 'left';
}

export interface CropPanel {
  file: string;
  crop: [number, number, number, number];
}

export interface GableFacadeSet {
  kind: 'gable';
  front: GablePanel;
  back: GablePanel;
  side: SidePanel;
  roof: RoofPanel;
}

/** Hip roof top view of the clock pavilion (Tower B). */
export interface PavilionFacadeSet {
  kind: 'pavilion';
  roof: { file: string; rect: [number, number, number, number] };
}

/**
 * Round tower elevation: centre column `cx`, rows [stripe top, base top,
 * ground] and the painted half-widths of the body at those rows.
 */
export interface TowerPanel {
  file: string;
  cx: number;
  rows: [number, number, number];
  half: [number, number, number];
}

export interface LighthouseFacadeSet {
  kind: 'lighthouse';
  front: TowerPanel;
  side: TowerPanel;
}

export interface FortressBand {
  front: CropPanel;
  back: CropPanel;
  side: CropPanel;
}

/** Tower C: crop bands per storey, the clock house and hanging pine-cone weights. */
export interface FortressFacadeSet {
  kind: 'fortress';
  ground: FortressBand;
  upper: FortressBand;
  clock: FortressBand;
  /** Weight cards hanging from the front balcony: crop + local x range. */
  weights?: Array<CropPanel & { x: [number, number] }>;
}

export type FacadeSet = GableFacadeSet | PavilionFacadeSet | LighthouseFacadeSet | FortressFacadeSet;

export interface FacadePanelInfo {
  rect: [number, number, number, number];
  w: number;
  h: number;
}

export interface FacadeAtlas {
  texture: RawTexture;
  /** Blueprint prop id -> facade set. */
  forProp(propId: string): FacadeSet | null;
  /** Atlas UV of a source pixel of a panel file (null when the file did not load). */
  uv(file: string, px: number, py: number): [number, number] | null;
  panel(file: string): FacadePanelInfo | null;
  dispose(): void;
}

interface FacadeManifest {
  sets?: Record<string, FacadeSet>;
  buildings?: Record<string, string>;
}

const MANIFEST_PATH = 'facades/manifest.json';
const ATLAS_WIDTH = 2048;
const PADDING = 4;

/** Every panel file referenced anywhere in a set (nested bands and lists included). */
function filesOf(set: unknown): string[] {
  const files: string[] = [];
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (typeof value !== 'object' || value === null) return;
    const file = (value as { file?: unknown }).file;
    if (typeof file === 'string') files.push(file);
    for (const child of Object.values(value)) if (typeof child === 'object') visit(child);
  };
  visit(set);
  return files;
}

async function fetchManifest(): Promise<FacadeManifest | null> {
  if (typeof fetch === 'undefined') return null;
  try {
    const response = await fetch(artUrl(MANIFEST_PATH), { cache: 'no-cache' });
    if (!response.ok) return null;
    if (!(response.headers.get('content-type') ?? '').includes('json')) return null;
    return (await response.json()) as FacadeManifest;
  } catch {
    return null;
  }
}

export async function loadFacadeAtlas(scene: Scene): Promise<FacadeAtlas | null> {
  const manifest = await fetchManifest();
  const sets = manifest?.sets ?? {};
  const buildings = manifest?.buildings ?? {};
  const files = [...new Set(Object.values(sets).flatMap((set) => filesOf(set)))];
  if (files.length === 0) return null;
  const images = await Promise.all(files.map(async (file) => ({ file, image: await loadArtImage(`facades/${file}`) })));
  const inputs: PackInput<string>[] = [];
  const sizes = new Map<string, { w: number; h: number }>();
  for (const { file, image } of images) {
    if (!image || image.naturalWidth <= 0) continue;
    inputs.push({ key: file, image, w: image.naturalWidth, h: image.naturalHeight });
    sizes.set(file, { w: image.naturalWidth, h: image.naturalHeight });
  }
  const packed = packImages(inputs, ATLAS_WIDTH, PADDING);
  if (!packed) return null;
  const texture = RawTexture.CreateRGBATexture(
    packed.data,
    packed.width,
    packed.height,
    scene,
    true,
    false,
    Constants.TEXTURE_TRILINEAR_SAMPLINGMODE,
  );
  texture.name = 'ff-facade-atlas';
  texture.hasAlpha = true;
  texture.wrapU = Constants.TEXTURE_CLAMP_ADDRESSMODE;
  texture.wrapV = Constants.TEXTURE_CLAMP_ADDRESSMODE;
  texture.anisotropicFilteringLevel = 8;
  const complete = (set: FacadeSet): boolean => filesOf(set).every((file) => packed.rects.has(file));
  return {
    texture,
    forProp(propId) {
      const id = buildings[propId];
      const set = id ? sets[id] : undefined;
      return set && complete(set) ? set : null;
    },
    uv(file, px, py) {
      const rect = packed.rects.get(file);
      const size = sizes.get(file);
      if (!rect || !size) return null;
      const u = rect[0] + (px / size.w) * (rect[2] - rect[0]);
      const v = rect[1] + (py / size.h) * (rect[3] - rect[1]);
      return [u, v];
    },
    panel(file) {
      const rect = packed.rects.get(file);
      const size = sizes.get(file);
      return rect && size ? { rect, w: size.w, h: size.h } : null;
    },
    dispose() {
      texture.dispose();
    },
  };
}
