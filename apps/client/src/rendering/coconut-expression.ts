import { Constants } from '@babylonjs/core/Engines/constants';
import { Vector4 } from '@babylonjs/core/Maths/math';
import type { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';
import { CoconutFacePainter, createFaceDecal, type CoconutExpression } from './coconut-face';
import { excludeFromInk, excludeFromShadows } from './materials';
import { createMascotMaterial } from './mascot-material';
import { Blinker, Spring } from './mascot-motion';

/**
 * The coconut's face = the owner's 12 painted expressions
 * (art-src/gemini/gemini-coconut-faces.webp, cut into
 * public/art/mascot/coconut-faces.png: 4x3 cells of 256x336 on a 1024²
 * atlas, rows top-aligned at y = 0 / 336 / 672, same frame in every cell so
 * swaps never shift). One shared texture; each coconut picks its cell with a
 * uniform, so a swap is instant (no reload, no flicker) and gets a tiny
 * squash "pop" of the face layer instead.
 *
 * {@link CoconutFaceController} turns gameplay state into an expression.
 * If the atlas cannot load, the procedural canvas painter (coconut-face.ts)
 * draws the closest expression instead.
 */

/** Atlas cell per expression (sheet order). */
export const FACE = {
  angry: 0,
  blink: 1,
  battleCry: 2,
  ramming: 3,
  happy: 4,
  smug: 5,
  surprised: 6,
  scared: 7,
  dizzy: 8,
  pain: 9,
  ko: 10,
  sleepy: 11,
} as const;

export type FaceCell = (typeof FACE)[keyof typeof FACE];
export const FACE_COUNT = 12;

const ATLAS_URL = `${import.meta.env.BASE_URL}art/mascot/coconut-faces.png`;
const ATLAS_SIZE = 1024;
const CELL_W = 256;
const CELL_H = 336;
/** Inset so bilinear filtering never bleeds a neighbouring cell in. */
const CELL_INSET = 1.5;
/** Cell pixels per radian of shell arc: sets the painted face's size on the nut. */
const PIXELS_PER_RADIAN = 215;
/** Latitude of the cell's top edge (eyes at cell y ≈ 130 land at ~0.33 rad). */
const LAT_TOP = 0.93;

/** Painter expression used when the atlas is unavailable. */
const PAINTER_FALLBACK: readonly CoconutExpression[] = [
  'angry',
  'squashed',
  'shout',
  'squashed',
  'happy',
  'happy',
  'shout',
  'shout',
  'dizzy',
  'squashed',
  'ko',
  'angry',
];

type AtlasStatus = 'loading' | 'ready' | 'failed';

interface AtlasEntry {
  texture: Texture;
  status: AtlasStatus;
  listeners: Set<() => void>;
}

const atlases = new WeakMap<Scene, AtlasEntry>();

/** Shared atlas texture of a scene (starts loading on first use). */
export function faceAtlas(scene: Scene): AtlasEntry {
  let entry = atlases.get(scene);
  if (entry) return entry;
  const listeners = new Set<() => void>();
  const created: AtlasEntry = {
    texture: null as unknown as Texture,
    status: 'loading',
    listeners,
  };
  const texture = new Texture(
    ATLAS_URL,
    scene,
    {
      noMipmap: false,
      invertY: false,
      samplingMode: Constants.TEXTURE_TRILINEAR_SAMPLINGMODE,
      onLoad: () => {
        created.status = 'ready';
        for (const listener of listeners) listener();
      },
      onError: () => {
        created.status = 'failed';
        for (const listener of listeners) listener();
      },
    },
  );
  texture.hasAlpha = true;
  texture.wrapU = Texture.CLAMP_ADDRESSMODE;
  texture.wrapV = Texture.CLAMP_ADDRESSMODE;
  texture.anisotropicFilteringLevel = 4;
  created.texture = texture;
  atlases.set(scene, created);
  entry = created;
  return entry;
}

/** Atlas UV rect (offset xy, size zw) of a cell. */
export function cellRect(cell: number, out: Vector4): Vector4 {
  const column = cell % 4;
  const row = Math.floor(cell / 4);
  return out.set(
    (column * CELL_W + CELL_INSET) / ATLAS_SIZE,
    (row * CELL_H + CELL_INSET) / ATLAS_SIZE,
    (CELL_W - CELL_INSET * 2) / ATLAS_SIZE,
    (CELL_H - CELL_INSET * 2) / ATLAS_SIZE,
  );
}

/**
 * Spherical patch for one atlas cell: constant pixels per radian, so the
 * painted face keeps its proportions on the nut. UV (0,0) = cell top-left as
 * seen by someone facing the coconut (the coconut's own +X side).
 */
export function createAtlasDecal(scene: Scene, radii: { x: number; y: number; z: number }, lift: number): Mesh {
  const columns = 20;
  const rows = 24;
  const yawHalf = CELL_W / PIXELS_PER_RADIAN / 2;
  const latSpan = CELL_H / PIXELS_PER_RADIAN;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let row = 0; row <= rows; row += 1) {
    const v = row / rows;
    const latitude = LAT_TOP - latSpan * v;
    for (let column = 0; column <= columns; column += 1) {
      const u = column / columns;
      const yaw = yawHalf - 2 * yawHalf * u;
      const dx = Math.sin(yaw) * Math.cos(latitude);
      const dy = Math.sin(latitude);
      const dz = Math.cos(yaw) * Math.cos(latitude);
      const radius = 1 / Math.sqrt((dx / radii.x) ** 2 + (dy / radii.y) ** 2 + (dz / radii.z) ** 2);
      positions.push(dx * (radius + lift), dy * (radius + lift), dz * (radius + lift));
      uvs.push(u, v);
    }
  }
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const a = row * (columns + 1) + column;
      const b = a + 1;
      const c = a + columns + 1;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const data = new VertexData();
  data.positions = positions;
  data.indices = indices;
  data.uvs = uvs;
  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);
  data.normals = normals;
  const mesh = new Mesh('coconut-face-atlas-decal', scene);
  data.applyToMesh(mesh);
  mesh.isPickable = false;
  return mesh;
}

export interface FaceInput {
  alive: boolean;
  dazed: boolean;
  /** Turbo Roll, Ground Pound, Milk Splash or a taunt. */
  battleCry: boolean;
  /** Rolling fast (or a turbo burst): ramming squint. */
  ramming: boolean;
  airborne: boolean;
  vitality: number;
  /** Seconds without moving. */
  idle: number;
  preview: boolean;
}

/**
 * Expression state machine. Priority: KO > dizzy > pain > kill (happy, then
 * smug) > battle cry > ramming > surprised (air) > scared (low vitality) >
 * sleepy (idle > 8 s) > angry default with natural blinks.
 */
export class CoconutFaceController {
  cell: FaceCell = FACE.angry;
  /** True when the last update changed the expression (not counting blinks). */
  changed = false;
  private readonly blinker = new Blinker();
  private hurt = 0;
  private kill = 0;
  private cry = 0;
  private airTime = 0;
  private forced: FaceCell | null = null;
  private previousMain: FaceCell = FACE.angry;

  react(kind: 'hurt' | 'kill' | 'cry' | 'score'): void {
    if (kind === 'hurt') this.hurt = 0.42;
    else if (kind === 'kill') this.kill = 2.6;
    else if (kind === 'cry') this.cry = Math.max(this.cry, 0.85);
    else this.cry = Math.max(this.cry, 0.55);
  }

  forceBlink(): void {
    this.blinker.trigger();
  }

  /** Dev/screenshot hook: hold one expression (null = gameplay). */
  force(cell: FaceCell | null): void {
    this.forced = cell;
  }

  update(dt: number, input: FaceInput): FaceCell {
    this.hurt = Math.max(0, this.hurt - dt);
    this.kill = Math.max(0, this.kill - dt);
    this.cry = Math.max(0, this.cry - dt);
    this.airTime = input.airborne ? this.airTime + dt : 0;
    let main: FaceCell = FACE.angry;
    if (this.forced !== null) main = this.forced;
    else if (!input.alive) main = FACE.ko;
    else if (input.dazed) main = FACE.dizzy;
    else if (this.hurt > 0) main = FACE.pain;
    else if (this.kill > 1.5) main = FACE.happy;
    else if (this.kill > 0) main = FACE.smug;
    else if (input.battleCry || this.cry > 0) main = FACE.battleCry;
    else if (input.ramming) main = FACE.ramming;
    else if (this.airTime > 0.12) main = FACE.surprised;
    else if (input.vitality < 0.3) main = FACE.scared;
    else if (!input.preview && input.idle > 8) main = FACE.sleepy;
    if (!input.alive) this.kill = 0;
    this.changed = main !== this.previousMain;
    this.previousMain = main;
    const lid = this.blinker.update(dt);
    // Only the default face blinks (the other paintings have their own eyes).
    this.cell = main === FACE.angry && this.forced === null && lid > 0.5 ? FACE.blink : main;
    return this.cell;
  }
}

/** The decal on the face layer, its material and the swap pop. */
export class CoconutFaceDecal {
  readonly pivot: TransformNode;
  private readonly scene: Scene;
  private readonly radii: { x: number; y: number; z: number };
  private readonly lift: number;
  private atlasMesh: Mesh | null = null;
  private painterMesh: Mesh | null = null;
  private painter: CoconutFacePainter | null = null;
  readonly material: ShaderMaterial;
  private painterMaterial: ShaderMaterial | null = null;
  private readonly rect = new Vector4(0, 0, 0.25, CELL_H / ATLAS_SIZE);
  private readonly pop = new Spring(260, 13);
  private cell = -1;
  private disposed = false;
  private readonly onAtlas = (): void => this.refreshSource();

  constructor(scene: Scene, pivot: TransformNode, radii: { x: number; y: number; z: number }, lift: number) {
    this.scene = scene;
    this.pivot = pivot;
    this.radii = radii;
    this.lift = lift;
    const atlas = faceAtlas(scene);
    this.material = createMascotMaterial(scene, 'coconut-face-atlas', { albedo: atlas.texture, decal: true });
    atlas.listeners.add(this.onAtlas);
    this.refreshSource();
  }

  /** Materials whose effect uniforms follow the mascot (soot, frozen…). */
  get materials(): ShaderMaterial[] {
    return this.painterMaterial ? [this.material, this.painterMaterial] : [this.material];
  }

  private refreshSource(): void {
    if (this.disposed) return;
    const atlas = faceAtlas(this.scene);
    if (atlas.status !== 'failed') {
      if (!this.atlasMesh) {
        const mesh = createAtlasDecal(this.scene, this.radii, this.lift);
        mesh.material = this.material;
        mesh.parent = this.pivot;
        mesh.alphaIndex = 10;
        excludeFromShadows(mesh);
        excludeFromInk(mesh);
        this.atlasMesh = mesh;
      }
      this.atlasMesh.setEnabled(atlas.status === 'ready');
      return;
    }
    // Fallback: the procedural painter on its own decal.
    this.atlasMesh?.dispose();
    this.atlasMesh = null;
    if (!this.painter) {
      this.painter = new CoconutFacePainter(this.scene);
      this.painterMaterial = createMascotMaterial(this.scene, 'coconut-face-painted', {
        albedo: this.painter.texture,
        decal: true,
      });
      const mesh = createFaceDecal(this.scene, this.radii, this.lift);
      mesh.material = this.painterMaterial;
      mesh.parent = this.pivot;
      mesh.alphaIndex = 10;
      excludeFromShadows(mesh);
      excludeFromInk(mesh);
      this.painterMesh = mesh;
    }
    this.cell = -1;
  }

  /** Shows a cell; `popOnChange` adds the squash pop (expression swaps, not blinks). */
  show(cell: FaceCell, popOnChange: boolean, lookX: number, lookY: number, dt: number): void {
    if (cell !== this.cell) {
      if (popOnChange && this.cell >= 0) this.pop.kick(5.5);
      this.cell = cell;
      if (this.atlasMesh) {
        cellRect(cell, this.rect);
        this.material.setVector4('uAtlasRect', this.rect);
      }
    }
    if (this.painter) this.painter.draw(PAINTER_FALLBACK[cell] ?? 'angry', lookX, lookY);
    const pop = this.pop.step(0, dt);
    this.pivot.scaling.set(1 + pop * 0.05, 1 - pop * 0.04, 1 + pop * 0.02);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    faceAtlas(this.scene).listeners.delete(this.onAtlas);
    this.atlasMesh?.dispose();
    this.painterMesh?.dispose();
    this.painter?.dispose();
    this.material.dispose();
    this.painterMaterial?.dispose();
  }
}
