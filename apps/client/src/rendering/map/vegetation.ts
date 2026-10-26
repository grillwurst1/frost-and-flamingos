/**
 * Painted billboard vegetation, clutter and ground dressing.
 *
 * Every tree, palm and rock of the blueprint keeps its collider; only its
 * visual becomes a painted sprite from the atlas (rendering/sprite-atlas.ts).
 * On top of that a purely visual layer dresses the ground the way the
 * paintings do: grass tufts, flowers, bushes, snow drifts, dune grass,
 * saplings and logs around forests, painted decals (snow and mud patches,
 * stone plates, palm fronds, stumps) and a soft painted shadow blob under
 * every tree, rock and bush. The mountain ring beyond the boundary carries
 * dense painted forests so the map edge reads as a continuing landscape.
 *
 * Draw calls stay flat: one billboard mesh for all trees and rocks, a few
 * 200 m clutter chunks (distance-LOD'd), one ground mesh for decals and
 * blobs, and one single-instance mesh per destructible tree (so later
 * destruction can hide it). All share the atlas texture.
 */
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import '@babylonjs/core/Meshes/thinInstanceMesh';
import type { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import type { Scene } from '@babylonjs/core/scene';
import {
  FJORD_MAP,
  FjordLayout,
  MAP_HALF_SIZE,
  SNOWLINE_Y,
  coastDistanceAt,
  isClutterFree,
  sampleMapHeight,
  terrainBiomeAt,
  terrainNormalAt,
  terrainSlopeAt,
  terrainSnowWeight,
  terrainSurfaceTagAt,
  type MapProp,
} from '@frost-and-flamingos/shared';
import type { SpriteAtlas, SpriteEntry } from '../sprite-atlas';
import { excludeFromInk, excludeFromShadows } from '../materials';
import { hash3 } from './geometry';
import { outerHeight, outerIsSea, outerSnowLine } from './terrain-mesh';

/** Kinds whose visuals the sprite layer replaces (colliders unchanged). */
export const SPRITE_PROP_KINDS: ReadonlySet<string> = new Set(['fir', 'palm', 'rock']);

const CLUTTER_CHUNK = 200;
const CLUTTER_LOD_DISTANCE = 270;
const CELL = 2.6;
/** Shadow fall direction on the ground (away from the south-west sun). */
const SHADOW_DIR = { x: Math.SQRT1_2, z: Math.SQRT1_2 };

const CULL = {
  cover: 58,
  bush: 100,
  prop: 130,
  rock: 220,
  tree: 0,
  decal: 120,
  blob: 160,
} as const;

export interface VegetationMaterials {
  billboard: ShaderMaterial;
  ground: ShaderMaterial;
}

/**
 * One destructible blueprint tree inside the shared tree mesh. Destruction
 * hides it by collapsing its instance (no extra draw call per tree).
 */
export interface SpriteInstanceHandle {
  readonly mesh: Mesh;
  readonly index: number;
  setVisible(visible: boolean): void;
}

export interface VegetationLayer {
  meshes: Mesh[];
  /** Destructible blueprint trees (destructibleId -> instance in the tree mesh). */
  destructible: Map<string, SpriteInstanceHandle>;
  instances: number;
  vertexCount: number;
}

function snowAt(x: number, z: number, lift = 1.5): number {
  const height = sampleMapHeight(x, z);
  const slope = terrainSlopeAt(x, z);
  const biome = terrainBiomeAt(x, z, height, slope);
  return terrainSnowWeight(height + lift, biome.snowBias, biome.rock, SNOWLINE_Y);
}

function choose<T>(list: readonly T[], roll: number): T | undefined {
  if (list.length === 0) return undefined;
  return list[Math.min(list.length - 1, Math.floor(roll * list.length))];
}

class SpriteBatch {
  readonly matrices: number[] = [];
  readonly rects: number[] = [];
  readonly data: number[] = [];
  readonly min = new Vector3(Infinity, Infinity, Infinity);
  readonly max = new Vector3(-Infinity, -Infinity, -Infinity);

  get count(): number {
    return this.matrices.length / 16;
  }

  adoptBounds(other: SpriteBatch): void {
    if (other.count === 0) return;
    this.min.minimizeInPlace(other.min);
    this.max.maximizeInPlace(other.max);
  }

  private bound(x: number, y: number, z: number, rx: number, ry0: number, ry1: number): void {
    this.min.minimizeInPlaceFromFloats(x - rx, y - ry0, z - rx);
    this.max.maximizeInPlaceFromFloats(x + rx, y + ry1, z + rx);
  }

  /** Camera-facing billboard standing on (x, y, z). */
  billboard(entry: SpriteEntry, x: number, y: number, z: number, height: number, flip: boolean, cull: number, swayScale = 1): void {
    const width = height * entry.aspect;
    this.matrices.push(width, 0, 0, 0, 0, height, 0, 0, 0, 0, width, 0, x, y, z, 1);
    const [u0, v0, u1, v1] = entry.rect;
    this.rects.push(flip ? u1 : u0, v0, flip ? u0 : u1, v1);
    const pivotU = flip ? 1 - entry.pivotU : entry.pivotU;
    this.data.push(entry.pivotV, entry.sway * swayScale, pivotU, cull);
    this.bound(x, y, z, width * 0.75, height * entry.pivotV, height);
  }

  /** Flat quad on the terrain (decals, shadow blobs), tilted to the ground normal. */
  ground(entry: SpriteEntry, x: number, z: number, yaw: number, sizeX: number, sizeZ: number, opacity: number, cull: number, y?: number): void {
    const n = terrainNormalAt(x, z);
    const ground = y ?? sampleMapHeight(x, z);
    // Tangent along the yaw, projected onto the ground plane.
    let tx = Math.cos(yaw);
    let tz = -Math.sin(yaw);
    let ty = -(n.x * tx + n.z * tz) / Math.max(0.2, n.y);
    const tl = Math.hypot(tx, ty, tz) || 1;
    tx /= tl;
    ty /= tl;
    tz /= tl;
    // Bitangent = tangent x normal keeps the quad's local +Z on the surface.
    const bx = ty * n.z - tz * n.y;
    const by = tz * n.x - tx * n.z;
    const bz = tx * n.y - ty * n.x;
    const lift = 0.05 + Math.max(sizeX, sizeZ) * 0.012;
    const px = x + n.x * lift;
    const py = ground + n.y * lift;
    const pz = z + n.z * lift;
    this.matrices.push(tx * sizeX, ty * sizeX, tz * sizeX, 0, n.x, n.y, n.z, 0, -bx * sizeZ, -by * sizeZ, -bz * sizeZ, 0, px, py, pz, 1);
    this.rects.push(...entry.rect);
    this.data.push(opacity, 0, 0, cull);
    const r = Math.max(sizeX, sizeZ) * 0.6;
    this.bound(px, py, pz, r, r, r);
  }

  toMesh(scene: Scene, name: string, material: ShaderMaterial, groundQuad: boolean, dynamicMatrices = false): Mesh | null {
    if (this.count === 0) return null;
    const mesh = new Mesh(name, scene);
    const data = new VertexData();
    // The billboard shader reads x (across) and y (up) only; z spans the
    // bounding box so camera-facing turns stay inside the culling volume.
    data.positions = groundQuad
      ? new Float32Array([-0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5])
      : new Float32Array([-0.5, 0, -0.5, 0.5, 0, 0.5, 0.5, 1, 0.5, -0.5, 1, -0.5]);
    data.indices = new Uint16Array([0, 1, 2, 0, 2, 3]);
    data.applyToMesh(mesh, false);
    mesh.material = material;
    mesh.isPickable = false;
    mesh.thinInstanceSetBuffer('matrix', new Float32Array(this.matrices), 16, !dynamicMatrices);
    mesh.thinInstanceSetBuffer('spriteRect', new Float32Array(this.rects), 4, true);
    mesh.thinInstanceSetBuffer('spriteData', new Float32Array(this.data), 4, true);
    mesh.getBoundingInfo().reConstruct(this.min, this.max);
    mesh.freezeWorldMatrix();
    mesh.doNotSyncBoundingInfo = true;
    excludeFromInk(mesh);
    excludeFromShadows(mesh);
    return mesh;
  }
}

class ClutterChunks {
  readonly chunks = new Map<string, SpriteBatch>();

  at(x: number, z: number): SpriteBatch {
    const key = `${Math.floor(x / CLUTTER_CHUNK)}_${Math.floor(z / CLUTTER_CHUNK)}`;
    let batch = this.chunks.get(key);
    if (!batch) {
      batch = new SpriteBatch();
      this.chunks.set(key, batch);
    }
    return batch;
  }
}

/** 8 m grid marking where players walk (nav edges, roads, lanes, trails). */
function buildBusyGrid(): (x: number, z: number) => number {
  const cell = 8;
  const size = Math.ceil((MAP_HALF_SIZE * 2) / cell);
  const grid = new Float32Array(size * size);
  const mark = (ax: number, az: number, bx: number, bz: number, radius: number): void => {
    const length = Math.hypot(bx - ax, bz - az);
    const steps = Math.max(1, Math.ceil(length / (cell * 0.5)));
    const r = Math.ceil(radius / cell);
    for (let step = 0; step <= steps; step += 1) {
      const t = step / steps;
      const cx = Math.floor((ax + (bx - ax) * t + MAP_HALF_SIZE) / cell);
      const cz = Math.floor((az + (bz - az) * t + MAP_HALF_SIZE) / cell);
      for (let dx = -r; dx <= r; dx += 1) {
        for (let dz = -r; dz <= r; dz += 1) {
          const gx = cx + dx;
          const gz = cz + dz;
          if (gx < 0 || gz < 0 || gx >= size || gz >= size) continue;
          const falloff = 1 - Math.min(1, Math.hypot(dx, dz) / (r + 0.5));
          const index = gx * size + gz;
          grid[index] = Math.max(grid[index] ?? 0, falloff);
        }
      }
    }
  };
  const nav = FJORD_MAP.nav;
  for (const [a, b] of nav.edges) {
    const na = nav.nodes[a];
    const nb = nav.nodes[b];
    if (na && nb) mark(na.position.x, na.position.z, nb.position.x, nb.position.z, 34);
  }
  const polylines = [
    FjordLayout.TANK_ROAD_POINTS,
    FjordLayout.COASTAL_RAMP_POINTS,
    ...FjordLayout.VILLAGE_LANE_POINTS,
    ...FjordLayout.GORGE_TRAIL_POINTS,
  ];
  for (const line of polylines) {
    for (let index = 0; index + 1 < line.length; index += 1) {
      const a = line[index];
      const b = line[index + 1];
      if (a && b) mark(a.x, a.z, b.x, b.z, 26);
    }
  }
  return (x: number, z: number) => {
    const gx = Math.floor((x + MAP_HALF_SIZE) / cell);
    const gz = Math.floor((z + MAP_HALF_SIZE) / cell);
    if (gx < 0 || gz < 0 || gx >= size || gz >= size) return 0;
    return grid[gx * size + gz] ?? 0;
  };
}

/** Coarse 6 m occupancy of blueprint trees, for forest-edge dressing. */
function buildTreeGrid(props: readonly MapProp[], kind: string): (x: number, z: number) => boolean {
  const cell = 6;
  const set = new Set<number>();
  for (const prop of props) {
    if (prop.kind !== kind) continue;
    const gx = Math.floor(prop.position.x / cell);
    const gz = Math.floor(prop.position.z / cell);
    for (let dx = -1; dx <= 1; dx += 1) for (let dz = -1; dz <= 1; dz += 1) set.add((gx + dx) * 100003 + (gz + dz));
  }
  return (x, z) => set.has(Math.floor(x / cell) * 100003 + Math.floor(z / cell));
}

interface Pools {
  firSnow: { tall: SpriteEntry[]; medium: SpriteEntry[]; small: SpriteEntry[]; bare: SpriteEntry[] };
  firGreen: SpriteEntry[];
  palmTall: SpriteEntry[];
  palmShort: SpriteEntry[];
  rockSnowBig: SpriteEntry[];
  rockSnowSmall: SpriteEntry[];
  rockBeachBig: SpriteEntry[];
  rockBeachSmall: SpriteEntry[];
  coverMeadow: SpriteEntry[];
  flowers: SpriteEntry[];
  bushMeadow: SpriteEntry[];
  bushForest: SpriteEntry[];
  bushBeach: SpriteEntry[];
  coverBeach: SpriteEntry[];
  coverSnow: SpriteEntry[];
  saplingSnow: SpriteEntry[];
  saplingGreen: SpriteEntry[];
  logForest: SpriteEntry[];
  logBeach: SpriteEntry[];
  decalSnow: SpriteEntry[];
  decalMud: SpriteEntry[];
  decalStone: SpriteEntry[];
  decalFrond: SpriteEntry[];
  decalStump: SpriteEntry[];
  propBeach: SpriteEntry[];
}

function makePools(atlas: SpriteAtlas): Pools {
  const fir = atlas.pick('tree-fir', 'snow');
  const noBare = (list: SpriteEntry[]): SpriteEntry[] => list.filter((entry) => !entry.tags.has('bare'));
  return {
    firSnow: {
      tall: noBare(fir.filter((entry) => entry.tags.has('tall'))),
      medium: noBare(fir.filter((entry) => entry.tags.has('medium'))),
      small: noBare(fir.filter((entry) => entry.tags.has('small'))),
      bare: fir.filter((entry) => entry.tags.has('bare')),
    },
    firGreen: atlas.pick('tree-fir', 'meadow'),
    palmTall: atlas.pick('tree-palm', 'tall'),
    palmShort: atlas.pick('tree-palm', 'short'),
    rockSnowBig: atlas.pick('rock', 'snow', 'big'),
    rockSnowSmall: atlas.pick('rock', 'snow', 'small'),
    rockBeachBig: atlas.pick('rock', 'beach', 'big'),
    rockBeachSmall: atlas.pick('rock', 'beach', 'small'),
    coverMeadow: atlas.pick('cover', 'meadow').filter((entry) => !entry.tags.has('flowers')),
    flowers: atlas.pick('cover', 'flowers'),
    bushMeadow: atlas.pick('bush', 'meadow'),
    bushForest: atlas.pick('bush', 'forest'),
    bushBeach: atlas.pick('bush', 'beach'),
    coverBeach: atlas.pick('cover', 'beach'),
    coverSnow: atlas.pick('cover', 'snow'),
    saplingSnow: atlas.pick('sapling', 'snow'),
    saplingGreen: atlas.pick('sapling', 'meadow'),
    logForest: atlas.pick('log', 'forest'),
    logBeach: atlas.pick('log', 'beach'),
    decalSnow: atlas.pick('decal', 'snow-patch'),
    decalMud: atlas.pick('decal', 'mud-patch'),
    decalStone: atlas.pick('decal', 'stone-plate'),
    decalFrond: atlas.pick('decal', 'frond'),
    decalStump: atlas.pick('decal', 'stump'),
    propBeach: [...atlas.pick('prop', 'beach'), ...atlas.pick('prop', 'harbor').filter((entry) => entry.id === 'lifering-post')],
  };
}

export function buildVegetation(
  scene: Scene,
  atlas: SpriteAtlas,
  materials: VegetationMaterials,
  props: readonly MapProp[],
): VegetationLayer {
  const pools = makePools(atlas);
  const trees = new SpriteBatch();
  const groundDecals = new SpriteBatch();
  const blobs = new SpriteBatch();
  const clutter = new ClutterChunks();
  const destructible = new Map<string, number>();
  const blob = atlas.blob;

  const addBlob = (x: number, z: number, width: number, height: number, strength: number, y?: number): void => {
    if (width <= 0.05) return;
    const across = Math.max(0.5, width * 0.95);
    const along = across * 1.3 + height * 0.1;
    const offset = Math.min(height * 0.16, 2.6);
    blobs.ground(blob, x + SHADOW_DIR.x * offset, z + SHADOW_DIR.z * offset, Math.PI / 4, across, along, strength, CULL.blob, y);
  };

  const shadowFor = (entry: SpriteEntry, x: number, z: number, height: number, strength: number): void => {
    if (entry.shadow <= 0) return;
    addBlob(x, z, height * entry.aspect * entry.shadow * 2, height, strength);
  };

  // --- Blueprint trees, palms and rocks (colliders stay in the blueprint) ---
  for (const prop of props) {
    if (!SPRITE_PROP_KINDS.has(prop.kind)) continue;
    const { x, z } = prop.position;
    const seed = hash3(x * 0.37, z * 0.29, 11);
    const flip = hash3(z, x, 12) > 0.5;
    const target = trees;
    if (prop.destructibleId) destructible.set(prop.destructibleId, trees.count);
    const y = sampleMapHeight(x, z);
    if (prop.kind === 'fir') {
      const snow = snowAt(x, z);
      const young = prop.variant === 3 && prop.scale < 1.05;
      let pool: SpriteEntry[];
      if (snow > 0.3) {
        if (young) pool = pools.firSnow.small;
        else if (prop.variant === 2) pool = seed < 0.1 && pools.firSnow.bare.length > 0 ? pools.firSnow.bare : pools.firSnow.medium;
        else pool = pools.firSnow.tall;
      } else {
        pool = pools.firGreen;
      }
      if (pool.length === 0) pool = pools.firSnow.tall.length > 0 ? pools.firSnow.tall : pools.firGreen;
      const entry = choose(pool, seed);
      if (!entry) continue;
      const height = entry.height * prop.scale * (young ? 0.85 : 0.9 + hash3(x, 3, z) * 0.18);
      target.billboard(entry, x, y, z, height, flip, CULL.tree);
      shadowFor(entry, x, z, height, 0.5);
    } else if (prop.kind === 'palm') {
      const pool = prop.variant === 3 && pools.palmShort.length > 0 ? pools.palmShort : pools.palmTall;
      const entry = choose(pool, seed);
      if (!entry) continue;
      const height = entry.height * prop.scale * (0.92 + hash3(x, 5, z) * 0.16);
      target.billboard(entry, x, y, z, height, flip, CULL.tree);
      shadowFor(entry, x, z, height, 0.46);
    } else {
      const snowy = snowAt(x, z) > 0.4;
      const big = prop.scale > 1.45;
      const pool = snowy
        ? big ? pools.rockSnowBig : pools.rockSnowSmall
        : big ? pools.rockBeachBig : pools.rockBeachSmall;
      const entry = choose(pool.length > 0 ? pool : pools.rockSnowBig, seed);
      if (!entry) continue;
      // Match the collider footprint (box half-width 1.05 x scale).
      const width = 2.35 * prop.scale;
      const height = width / entry.aspect;
      target.billboard(entry, x, y - 0.12 * prop.scale, z, height, flip, CULL.rock);
      shadowFor(entry, x, z, height, 0.42);
    }
  }

  // --- Forest floor and palm-grove dressing around the blueprint trees ---
  for (const prop of props) {
    if (prop.kind !== 'fir' && prop.kind !== 'palm') continue;
    const count = 1 + Math.floor(hash3(prop.position.x, 7, prop.position.z) * 2.4);
    for (let index = 0; index < count; index += 1) {
      const angle = hash3(prop.position.x, index, prop.position.z) * Math.PI * 2;
      const radius = 2.2 + hash3(prop.position.z, index, prop.position.x) * 4.5;
      const x = prop.position.x + Math.sin(angle) * radius;
      const z = prop.position.z + Math.cos(angle) * radius;
      if (Math.abs(x) > MAP_HALF_SIZE - 2 || Math.abs(z) > MAP_HALF_SIZE - 2) continue;
      if (!isClutterFree(x, z)) continue;
      const y = sampleMapHeight(x, z);
      if (y < 0.2) continue;
      const roll = hash3(x * 1.7, z * 1.3, 21);
      const flip = roll > 0.5;
      const batch = clutter.at(x, z);
      const scale = 0.8 + hash3(z, x, 22) * 0.45;
      if (prop.kind === 'fir') {
        const snowy = snowAt(x, z) > 0.4;
        if (roll < 0.3) {
          const entry = choose(snowy ? pools.saplingSnow : pools.saplingGreen, hash3(x, z, 23));
          if (entry) batch.billboard(entry, x, y, z, entry.height * scale, flip, CULL.prop);
        } else if (roll < 0.62) {
          const entry = choose(snowy ? [...pools.coverSnow, ...pools.bushForest.filter((e) => e.tags.has('snow'))] : pools.bushForest, hash3(x, z, 24));
          if (entry) {
            batch.billboard(entry, x, y, z, entry.height * scale, flip, entry.tags.has('cover') ? CULL.cover : CULL.bush);
            if (entry.tags.has('bush')) shadowFor(entry, x, z, entry.height * scale, 0.32);
          }
        } else if (roll < 0.7) {
          const entry = choose(pools.logForest, hash3(x, z, 25));
          if (entry) {
            batch.billboard(entry, x, y, z, entry.height * scale, flip, CULL.prop);
            shadowFor(entry, x, z, entry.height * scale, 0.32);
          }
        } else if (roll < 0.8) {
          const entry = choose(pools.decalStump, hash3(x, z, 26));
          if (entry) groundDecals.ground(entry, x, z, roll * 9, entry.size * scale, entry.size * scale, 0.95, CULL.decal);
        } else if (!snowy) {
          const entry = choose(pools.decalMud, hash3(x, z, 27));
          if (entry) groundDecals.ground(entry, x, z, roll * 13, entry.size * scale, entry.size * scale * 0.6, 0.85, CULL.decal);
        }
      } else {
        if (roll < 0.35) {
          const entry = choose(pools.decalFrond, hash3(x, z, 28));
          if (entry) groundDecals.ground(entry, x, z, roll * 17, entry.size * scale, entry.size * scale, 0.95, CULL.decal);
        } else if (roll < 0.72) {
          const entry = choose(pools.bushBeach, hash3(x, z, 29));
          if (entry) {
            batch.billboard(entry, x, y, z, entry.height * scale, flip, CULL.bush);
            shadowFor(entry, x, z, entry.height * scale, 0.3);
          }
        } else if (roll < 0.78) {
          const entry = choose(pools.logBeach, hash3(x, z, 30));
          if (entry) batch.billboard(entry, x, y, z, entry.height * scale, flip, CULL.prop);
        } else {
          const entry = choose(pools.coverBeach, hash3(x, z, 31));
          if (entry) batch.billboard(entry, x, y, z, entry.height * scale, flip, CULL.cover);
        }
      }
    }
  }

  // --- Ground cover everywhere the player walks, sparser in the backcountry ---
  const busyAt = buildBusyGrid();
  const nearFir = buildTreeGrid(props, 'fir');
  const nearPalm = buildTreeGrid(props, 'palm');
  for (let gx = -MAP_HALF_SIZE + 2; gx < MAP_HALF_SIZE - 2; gx += CELL) {
    for (let gz = -MAP_HALF_SIZE + 2; gz < MAP_HALF_SIZE - 2; gz += CELL) {
      const x = gx + (hash3(gx, gz, 1) - 0.5) * CELL;
      const z = gz + (hash3(gz, gx, 2) - 0.5) * CELL;
      const busy = busyAt(x, z);
      // Painting-dense where players walk and look, still lively in the backcountry.
      const keep = 0.24 + busy * 0.46;
      const roll = hash3(x * 0.37, z * 0.41, 3);
      if (roll > keep) continue;
      if (!isClutterFree(x, z)) continue;
      const y = sampleMapHeight(x, z);
      if (y < 0.18) continue;
      const tag = terrainSurfaceTagAt(x, z);
      const pick = hash3(x, z, 4);
      const flip = hash3(z, x, 5) > 0.5;
      const scale = 0.78 + hash3(x, 1, z) * 0.5;
      const batch = clutter.at(x, z);
      const put = (entry: SpriteEntry | undefined, cull: number, shadow = 0): void => {
        if (!entry) return;
        const height = entry.height * scale;
        batch.billboard(entry, x, y, z, height, flip, cull);
        if (shadow > 0) shadowFor(entry, x, z, height, shadow);
      };
      const decal = (entry: SpriteEntry | undefined, opacity: number, squash = 1): void => {
        if (!entry) return;
        groundDecals.ground(entry, x, z, pick * 31, entry.size * scale, entry.size * scale * squash, opacity, CULL.decal);
      };
      switch (tag) {
        case 'grass_mud': {
          // Melting snow patches only in the band just below the snowline.
          const nearSnow = snowAt(x, z, 2.5);
          if (nearSnow > 0.2 && pick < 0.3) decal(choose(pools.decalSnow, hash3(x, z, 6)), 0.95, 0.8);
          else if (pick < 0.46) put(choose(pools.coverMeadow, hash3(x, z, 7)), CULL.cover);
          else if (pick < 0.64) put(choose(pools.flowers, hash3(x, z, 8)), CULL.cover);
          else if (pick < 0.76) put(choose(nearFir(x, z) ? pools.bushForest : pools.bushMeadow, hash3(x, z, 9)), CULL.bush, 0.3);
          else if (pick < 0.84 && nearFir(x, z)) put(choose(pools.saplingGreen, hash3(x, z, 10)), CULL.prop, 0.25);
          else if (pick < 0.9) decal(choose(pools.decalMud, hash3(x, z, 11)), 0.85, 0.6);
          else if (pick < 0.94) decal(choose(pools.decalStone, hash3(x, z, 12)), 0.9, 0.8);
          else if (pick < 0.97) put(choose(pools.rockBeachSmall, hash3(x, z, 13)), CULL.rock, 0.3);
          break;
        }
        case 'snow':
          // Drifts and mounds in banded ridges across the slopes (paintings), larger ones in the bands.
          if (pick < 0.5) {
            const ridge = Math.sin(z * 0.19 + x * 0.083 + Math.sin(x * 0.061) * 2.2) * 0.5 + 0.5;
            const entry = choose(pools.coverSnow, hash3(x, z, 14));
            if (entry) {
              const height = entry.height * scale * (1 + ridge * 1.1);
              batch.billboard(entry, x, y - 0.05, z, height, flip, CULL.bush);
            }
          }
          else if (pick < 0.5) put(choose(pools.rockSnowSmall, hash3(x, z, 15)), CULL.rock, 0.3);
          else if (pick < 0.62 && nearFir(x, z)) put(choose(pools.saplingSnow, hash3(x, z, 16)), CULL.prop, 0.25);
          else if (pick < 0.68) put(choose(pools.bushForest.filter((entry) => entry.tags.has('snow')), hash3(x, z, 17)), CULL.bush, 0.3);
          else if (pick < 0.72) decal(choose(pools.decalStone, hash3(x, z, 18)), 0.75, 0.8);
          break;
        case 'sand': {
          const coast = coastDistanceAt(x, z);
          const inland = coast > 10 || y > 1.6;
          // Beach-resort clusters on the dry sand: parasols and life-ring posts.
          const resort = hash3(Math.floor(x / 26), 7, Math.floor(z / 26)) > 0.6 && coast > 5 && coast < 30;
          if (resort && pick < 0.12) put(choose(pools.propBeach, hash3(x, z, 26)), CULL.prop, 0.35);
          else if (pick < 0.36) put(choose(pools.coverBeach, hash3(x, z, 19)), CULL.cover);
          else if (pick < 0.46) put(choose(pools.rockBeachSmall, hash3(x, z, 20)), CULL.rock, 0.3);
          else if (pick < 0.6 && inland) put(choose(pools.bushBeach, hash3(x, z, 21)), CULL.bush, 0.3);
          else if (pick < 0.7 && nearPalm(x, z)) decal(choose(pools.decalFrond, hash3(x, z, 22)), 0.95);
          else if (pick < 0.73 && inland) put(choose(pools.logBeach, hash3(x, z, 23)), CULL.prop, 0.3);
          break;
        }
        case 'rock_cliff':
          if (pick < 0.22) put(choose(snowAt(x, z) > 0.4 ? pools.rockSnowSmall : pools.rockBeachSmall, hash3(x, z, 24)), CULL.rock, 0.3);
          break;
        case 'cobblestone': {
          // Muddy, slushy verges break the hard road edge (paintings); the square stays clean.
          const onSquare = Math.max(Math.abs(x), Math.abs(z)) < FjordLayout.SQUARE_HALF + 2;
          if (busy < 0.98 && pick < 0.08) put(choose(pools.coverMeadow, hash3(x, z, 25)), CULL.cover);
          else if (!onSquare && pick < 0.2 && snowAt(x, z, 5) > 0.15) decal(choose(pools.decalSnow, hash3(x, z, 27)), 0.9, 0.7);
          else if (!onSquare && pick < 0.17) decal(choose(pools.decalMud, hash3(x, z, 28)), 0.8, 0.55);
          break;
        }
        default:
          break;
      }
    }
  }

  // --- Painted forests on the mountain ring beyond the boundary ---
  for (let gx = -760; gx <= 760; gx += 7.5) {
    for (let gz = -760; gz <= 760; gz += 7.5) {
      if (Math.max(Math.abs(gx), Math.abs(gz)) < MAP_HALF_SIZE + 6) continue;
      const x = gx + (hash3(gx, gz, 41) - 0.5) * 6;
      const z = gz + (hash3(gz, gx, 42) - 0.5) * 6;
      if (Math.max(Math.abs(x), Math.abs(z)) < MAP_HALF_SIZE + 4) continue;
      if (outerIsSea(x, z)) continue;
      const y = outerHeight(x, z);
      if (y < 1.5) continue;
      const forest = Math.sin(x * 0.021 + Math.sin(z * 0.013) * 2.2) * Math.sin(z * 0.017 + Math.cos(x * 0.011) * 1.7);
      if (forest < -0.25 || hash3(x, z, 43) > 0.72) continue;
      const snowy = y > outerSnowLine(x, z) - 6;
      const pool = snowy ? (hash3(x, z, 44) > 0.4 ? pools.firSnow.tall : pools.firSnow.medium) : pools.firGreen;
      const entry = choose(pool.length > 0 ? pool : pools.firGreen, hash3(z, x, 45));
      if (!entry) continue;
      trees.billboard(entry, x, y - 0.4, z, entry.height * (0.85 + hash3(x, 46, z) * 0.5), hash3(x, z, 47) > 0.5, CULL.tree, 0.6);
    }
  }

  // --- Meshes ---
  const meshes: Mesh[] = [];
  let instances = 0;
  const register = (mesh: Mesh | null, count: number): Mesh | null => {
    if (!mesh) return null;
    meshes.push(mesh);
    instances += count;
    return mesh;
  };
  const treeMesh = register(trees.toMesh(scene, 'sprite-trees', materials.billboard, false, destructible.size > 0), trees.count);
  if (treeMesh) treeMesh.alwaysSelectAsActiveMesh = true;
  for (const [key, batch] of clutter.chunks) {
    const mesh = register(batch.toMesh(scene, `sprite-clutter-${key}`, materials.billboard, false), batch.count);
    if (mesh) mesh.addLODLevel(CLUTTER_LOD_DISTANCE, null);
  }
  // Decals first, shadow blobs on top (one mesh: instance order is draw order).
  const groundMesh = register(mergeGround(scene, groundDecals, blobs, materials.ground), groundDecals.count + blobs.count);
  if (groundMesh) groundMesh.alwaysSelectAsActiveMesh = true;
  const handles = new Map<string, SpriteInstanceHandle>();
  if (treeMesh) {
    for (const [id, index] of destructible) handles.set(id, instanceHandle(treeMesh, index, trees.matrices));
  }
  return { meshes, destructible: handles, instances, vertexCount: instances * 4 };
}

function instanceHandle(mesh: Mesh, index: number, source: readonly number[]): SpriteInstanceHandle {
  const original = Matrix.FromArray(source.slice(index * 16, index * 16 + 16));
  const hidden = Matrix.Scaling(0, 0, 0).setTranslation(original.getTranslation());
  return {
    mesh,
    index,
    setVisible(visible: boolean) {
      mesh.thinInstanceSetMatrixAt(index, visible ? original : hidden, true);
    },
  };
}

/** Concatenates decals and blobs into one ground mesh (decals drawn first). */
function mergeGround(scene: Scene, decals: SpriteBatch, blobs: SpriteBatch, material: ShaderMaterial): Mesh | null {
  const merged = new SpriteBatch();
  for (const source of [decals, blobs]) {
    for (const value of source.matrices) merged.matrices.push(value);
    for (const value of source.rects) merged.rects.push(value);
    for (const value of source.data) merged.data.push(value);
  }
  merged.adoptBounds(decals);
  merged.adoptBounds(blobs);
  const mesh = merged.toMesh(scene, 'sprite-ground', material, true);
  if (mesh) mesh.renderingGroupId = 0;
  return mesh;
}
