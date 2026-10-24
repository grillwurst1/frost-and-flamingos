import {
  MAP_HALF_SIZE,
  MAP_ID,
  MAP_SEGMENTS,
  MAP_SIZE,
  WATER_LEVEL,
} from '../constants.js';
import type { Faction, Vec2, Vec3 } from '../types/index.js';

export type MapPropKind =
  | 'chalet'
  | 'beach_bar'
  | 'summit_lodge'
  | 'dock'
  | 'lighthouse'
  | 'pine'
  | 'palm'
  | 'rock'
  | 'umbrella'
  | 'fountain'
  | 'maypole'
  | 'signal_flag'
  | 'lookout_tower';

export type PropCollider =
  | {
      type: 'box';
      halfExtents: Vec3;
      offset: Vec3;
    }
  | {
      type: 'cylinder';
      halfHeight: number;
      radius: number;
      offset: Vec3;
    }
  | {
      type: 'sphere';
      radius: number;
      offset: Vec3;
    };

export interface MapProp {
  id: string;
  kind: MapPropKind;
  position: Vec3;
  rotationY: number;
  scale: number;
  variant: number;
  dimensions?: Vec3;
  colliders: PropCollider[];
}

export interface MapZone {
  id: 'summit' | 'village' | 'harbor' | 'highlands' | 'shoreline';
  center: Vec2;
  radius: number;
  labelKey: string;
}

export interface SpawnPoint {
  position: Vec3;
  zone: MapZone['id'];
  faction: Faction;
}

export interface Landmark {
  id: 'tower_a' | 'tower_b' | 'tower_c';
  position: Vec3;
  labelKey: string;
}

export interface FjordMapDefinition {
  id: string;
  nameKey: string;
  size: number;
  segments: number;
  waterLevel: number;
  heightAt: (x: number, z: number) => number;
  heights: Float32Array;
  spawns: SpawnPoint[];
  zones: MapZone[];
  landmarks: Landmark[];
  props: MapProp[];
}

const VILLAGE_CENTER = { x: 0, z: -10 };
const HARBOR_CENTER = { x: 255, z: 235 };
const SUMMIT_CENTER = { x: -250, z: -250 };

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function hash2(ix: number, iz: number, seed: number): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function valueNoise(x: number, z: number, seed: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz, seed);
  const b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed);
  const d = hash2(ix + 1, iz + 1, seed);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uz);
}

function fbm(x: number, z: number, octaves: number, seed: number): number {
  let total = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let normalization = 0;
  for (let octave = 0; octave < octaves; octave += 1) {
    total += valueNoise(x * frequency, z * frequency, seed + octave * 17) * amplitude;
    normalization += amplitude;
    amplitude *= 0.5;
    frequency *= 2.03;
  }
  return total / normalization;
}

/** Deterministic analytic terrain used to author the immutable map blueprint. */
export function analyticTerrainHeight(x: number, z: number): number {
  const diagonal = clamp01((x + z + MAP_SIZE) / (MAP_SIZE * 2));

  let height: number;
  if (diagonal < 0.46) {
    const alpine = (0.46 - diagonal) / 0.46;
    height = 19 + 58 * Math.pow(alpine, 1.55);
  } else if (diagonal < 0.63) {
    height = 19 - 17.5 * smoothstep(0.46, 0.63, diagonal);
  } else {
    height = 1.5 - 11.5 * smoothstep(0.63, 0.9, diagonal);
  }

  const mountainMask = smoothstep(0.56, 0.16, diagonal);
  const ridgeNoise = 1 - Math.abs(valueNoise(x * 0.006, z * 0.006, 41) * 2 - 1);
  height += ridgeNoise * ridgeNoise * 13 * mountainMask;
  height += (fbm(x * 0.011, z * 0.011, 4, 9) - 0.5) * 17 * mountainMask;
  height += (fbm(x * 0.042, z * 0.042, 2, 23) - 0.5) * 2.2 * (0.35 + mountainMask);

  const villageDistance = Math.hypot(x - VILLAGE_CENTER.x, z - VILLAGE_CENTER.z);
  const villageMask = 1 - smoothstep(54, 118, villageDistance);
  const villageHeight = 17.6 + (fbm(x * 0.035, z * 0.035, 2, 5) - 0.5) * 0.7;
  height = lerp(height, villageHeight, villageMask);

  const harborDistance = Math.hypot(x - HARBOR_CENTER.x, z - HARBOR_CENTER.z);
  const harborIsland = 2.7 - smoothstep(44, 98, harborDistance) * 7.8;
  const harborMask = 1 - smoothstep(58, 152, harborDistance);
  height = lerp(height, harborIsland, harborMask);

  const summitDistance = Math.hypot(x - SUMMIT_CENTER.x, z - SUMMIT_CENTER.z);
  const summitMask = 1 - smoothstep(26, 74, summitDistance);
  const summitHeight = 55.5 + (fbm(x * 0.05, z * 0.05, 2, 67) - 0.5) * 0.55;
  height = lerp(height, summitHeight, summitMask);

  // A soft frozen stream bed winds from the high pass into the lagoon.
  const streamCenter = 42 + Math.sin(z * 0.012) * 34 + Math.sin(z * 0.033) * 11;
  const streamDistance = Math.abs(x - streamCenter);
  const streamMask =
    (1 - smoothstep(2.2, 10.5, streamDistance)) *
    smoothstep(-340, -245, z) *
    (1 - smoothstep(210, 285, z));
  height -= streamMask * (1.1 + mountainMask * 0.7);

  // Keep the outer rim readable and prevent the heightfield from folding into water.
  const edge = Math.max(Math.abs(x), Math.abs(z));
  if (edge > MAP_HALF_SIZE - 22) {
    const rim = smoothstep(MAP_HALF_SIZE - 22, MAP_HALF_SIZE, edge);
    height = lerp(height, Math.max(height, 1.2), rim);
  }

  return height;
}

function buildHeights(): Float32Array {
  const points = MAP_SEGMENTS + 1;
  const heights = new Float32Array(points * points);
  for (let column = 0; column < points; column += 1) {
    const x = -MAP_HALF_SIZE + (column / MAP_SEGMENTS) * MAP_SIZE;
    for (let row = 0; row < points; row += 1) {
      const z = -MAP_HALF_SIZE + (row / MAP_SEGMENTS) * MAP_SIZE;
      heights[column * points + row] = analyticTerrainHeight(x, z);
    }
  }
  return heights;
}

const heights = buildHeights();
const gridPoints = MAP_SEGMENTS + 1;

/** Bilinear sample matching the Rapier heightfield triangulation closely. */
export function sampleMapHeight(x: number, z: number): number {
  const normalizedX = clamp01((x + MAP_HALF_SIZE) / MAP_SIZE) * MAP_SEGMENTS;
  const normalizedZ = clamp01((z + MAP_HALF_SIZE) / MAP_SIZE) * MAP_SEGMENTS;
  const column = Math.min(MAP_SEGMENTS - 1, Math.floor(normalizedX));
  const row = Math.min(MAP_SEGMENTS - 1, Math.floor(normalizedZ));
  const fx = normalizedX - column;
  const fz = normalizedZ - row;
  const h00 = heights[column * gridPoints + row] ?? 0;
  const h10 = heights[(column + 1) * gridPoints + row] ?? 0;
  const h01 = heights[column * gridPoints + row + 1] ?? 0;
  const h11 = heights[(column + 1) * gridPoints + row + 1] ?? 0;
  return lerp(lerp(h00, h10, fx), lerp(h01, h11, fx), fz);
}

export function terrainNormalAt(x: number, z: number): Vec3 {
  const sample = 1.2;
  const left = sampleMapHeight(x - sample, z);
  const right = sampleMapHeight(x + sample, z);
  const down = sampleMapHeight(x, z - sample);
  const up = sampleMapHeight(x, z + sample);
  const nx = left - right;
  const nz = down - up;
  const ny = sample * 2;
  const length = Math.hypot(nx, ny, nz) || 1;
  return { x: nx / length, y: ny / length, z: nz / length };
}

export function terrainSlopeAt(x: number, z: number): number {
  const normal = terrainNormalAt(x, z);
  return Math.acos(Math.min(1, Math.max(-1, normal.y)));
}

export function groundPosition(x: number, z: number, offset = 0): Vec3 {
  return { x, y: sampleMapHeight(x, z) + offset, z };
}

/** Surface tags drive footsteps, traction and later terrain destruction. */
export type SurfaceTag =
  | 'water'
  | 'sand'
  | 'grass_mud'
  | 'cobblestone'
  | 'snow'
  | 'ice_patch'
  | 'rock_cliff'
  | 'wood';

/**
 * Authored ice rinks. They give the movement kit a reliable place to show off
 * the low-friction slide before the snow cannon starts painting new patches.
 */
export interface IcePatch {
  readonly x: number;
  readonly z: number;
  readonly radius: number;
}

export const ICE_PATCHES: readonly IcePatch[] = [
  { x: -40, z: 20, radius: 13 },
  { x: -210, z: -180, radius: 15 },
];

export function isOnIcePatch(x: number, z: number): boolean {
  for (const patch of ICE_PATCHES) {
    if (Math.hypot(x - patch.x, z - patch.z) <= patch.radius) return true;
  }
  return false;
}

export function surfaceTagAt(x: number, z: number): SurfaceTag {
  const height = sampleMapHeight(x, z);
  const slope = terrainSlopeAt(x, z);
  if (height < WATER_LEVEL - 0.15) return 'water';
  if (slope > 0.68) return 'rock_cliff';
  if (isOnIcePatch(x, z)) return 'ice_patch';
  if (Math.hypot(x - VILLAGE_CENTER.x, z - VILLAGE_CENTER.z) < 42) return 'cobblestone';
  if (height >= 22) return 'snow';
  if (height < 7.5) return 'sand';
  return 'grass_mud';
}

export const MAP_ZONES: MapZone[] = [
  {
    id: 'summit',
    center: { x: SUMMIT_CENTER.x, z: SUMMIT_CENTER.z },
    radius: 132,
    labelKey: 'world.zones.summit',
  },
  {
    id: 'village',
    center: { x: VILLAGE_CENTER.x, z: VILLAGE_CENTER.z },
    radius: 154,
    labelKey: 'world.zones.village',
  },
  {
    id: 'harbor',
    center: { x: HARBOR_CENTER.x, z: HARBOR_CENTER.z },
    radius: 168,
    labelKey: 'world.zones.harbor',
  },
];

export const LANDMARKS: Landmark[] = [
  {
    id: 'tower_a',
    position: { x: HARBOR_CENTER.x, y: 2, z: HARBOR_CENTER.z },
    labelKey: 'world.towers.a',
  },
  {
    id: 'tower_b',
    position: { x: VILLAGE_CENTER.x, y: 18, z: VILLAGE_CENTER.z },
    labelKey: 'world.towers.b',
  },
  {
    id: 'tower_c',
    position: { x: SUMMIT_CENTER.x, y: 55, z: SUMMIT_CENTER.z },
    labelKey: 'world.towers.c',
  },
];

const RAW_SPAWNS: Array<{ x: number; z: number; faction: Faction; zone: SpawnPoint['zone'] }> = [
  { x: -222, z: -226, faction: 'alpine', zone: 'summit' },
  { x: -68, z: -82, faction: 'alpine', zone: 'village' },
  { x: -28, z: 73, faction: 'alpine', zone: 'village' },
  { x: 243, z: 214, faction: 'lagoon', zone: 'harbor' },
  { x: 276, z: 256, faction: 'lagoon', zone: 'harbor' },
  { x: 82, z: 40, faction: 'lagoon', zone: 'village' },
  { x: 148, z: 111, faction: 'lagoon', zone: 'shoreline' },
  { x: 10, z: -172, faction: 'alpine', zone: 'highlands' },
];

export const SPAWN_POINTS: SpawnPoint[] = RAW_SPAWNS.map((spawn) => ({
  position: groundPosition(spawn.x, spawn.z, 0.4),
  zone: spawn.zone,
  faction: spawn.faction,
}));

interface PropSeed {
  kind: MapPropKind;
  x: number;
  z: number;
  rotationY?: number;
  scale?: number;
  variant?: number;
  dimensions?: Vec3;
  y?: number;
  colliders?: PropCollider[];
  id?: string;
}

function boxCollider(halfExtents: Vec3, offset: Vec3): PropCollider {
  return { type: 'box', halfExtents, offset };
}

function cylinderCollider(radius: number, halfHeight: number, offset: Vec3): PropCollider {
  return { type: 'cylinder', radius, halfHeight, offset };
}

function makeHouse(
  id: string,
  kind: MapPropKind,
  x: number,
  z: number,
  rotationY: number,
  scale: number,
  width: number,
  depth: number,
  wallHeight: number,
): PropSeed {
  return {
    id,
    kind,
    x,
    z,
    rotationY,
    scale,
    variant: Math.abs(Math.round(x + z)) % 3,
    colliders: [
      boxCollider(
        { x: (width * scale) / 2, y: (wallHeight * scale) / 2, z: (depth * scale) / 2 },
        { x: 0, y: (wallHeight * scale) / 2, z: 0 },
      ),
    ],
  };
}

function makeDock(
  id: string,
  startX: number,
  startZ: number,
  endX: number,
  endZ: number,
  width: number,
  deckY: number,
): PropSeed {
  const dx = endX - startX;
  const dz = endZ - startZ;
  const length = Math.hypot(dx, dz);
  const centerX = (startX + endX) / 2;
  const centerZ = (startZ + endZ) / 2;
  return {
    id,
    kind: 'dock',
    x: centerX,
    z: centerZ,
    rotationY: Math.atan2(dx, dz),
    scale: 1,
    variant: 0,
    y: deckY,
    dimensions: { x: width, y: 0.45, z: length },
    colliders: [boxCollider({ x: width / 2, y: 0.22, z: length / 2 }, { x: 0, y: -0.22, z: 0 })],
  };
}

const authoredProps: PropSeed[] = [
  makeHouse('house_inn', 'chalet', -49, -36, 0.24, 1.2, 14, 10, 6.8),
  makeHouse('house_bakery', 'chalet', 44, -44, -0.32, 1, 12, 9, 6.2),
  makeHouse('house_farm', 'chalet', -34, 46, 0.7, 0.9, 12, 8, 5.8),
  makeHouse('house_boats', 'chalet', 61, 24, 0.12, 1.05, 12, 9, 6.4),
  makeHouse('house_west', 'chalet', -91, 5, -0.55, 0.82, 11, 8, 5.5),
  makeHouse('harbor_bar', 'beach_bar', 251, 227, 2.2, 0.92, 12, 8, 5.2),
  makeHouse('summit_lodge', 'summit_lodge', -254, -260, 0.4, 1.18, 15, 10, 7.2),

  makeDock('dock_harbor_1', 258, 218, 288, 247, 5.4, 2.5),
  makeDock('dock_harbor_2', 288, 247, 318, 276, 5.4, 2.5),
  makeDock('dock_harbor_3', 318, 276, 339, 297, 5.4, 2.5),
  makeDock('dock_beach', 145, 120, 190, 160, 4.2, 1.2),

  {
    id: 'lighthouse',
    kind: 'lighthouse',
    x: 345,
    z: 302,
    rotationY: -0.25,
    scale: 1,
    variant: 0,
    y: 1.1,
    colliders: [
      cylinderCollider(6.5, 1.2, { x: 0, y: 0.2, z: 0 }),
      cylinderCollider(3.4, 9.2, { x: 0, y: 10.2, z: 0 }),
    ],
  },
  {
    id: 'fountain',
    kind: 'fountain',
    x: 2,
    z: 2,
    rotationY: 0,
    scale: 1,
    variant: 0,
    colliders: [cylinderCollider(4.4, 0.65, { x: 0, y: 0.65, z: 0 })],
  },
  {
    id: 'maypole',
    kind: 'maypole',
    x: -8,
    z: 15,
    rotationY: 0.3,
    scale: 1,
    variant: 0,
    colliders: [cylinderCollider(0.35, 5.5, { x: 0, y: 5.5, z: 0 })],
  },
  {
    id: 'summit_flag',
    kind: 'signal_flag',
    x: -236,
    z: -246,
    rotationY: 0.4,
    scale: 1.2,
    variant: 0,
    colliders: [cylinderCollider(0.22, 5.2, { x: 0, y: 5.2, z: 0 })],
  },
  {
    id: 'harbor_flag',
    kind: 'signal_flag',
    x: 267,
    z: 240,
    rotationY: 2.2,
    scale: 1,
    variant: 1,
    colliders: [cylinderCollider(0.22, 4.6, { x: 0, y: 4.6, z: 0 })],
  },
  {
    id: 'lookout',
    kind: 'lookout_tower',
    x: 35,
    z: -131,
    rotationY: 0.1,
    scale: 1,
    variant: 0,
    colliders: [
      cylinderCollider(2.7, 3.4, { x: 0, y: 3.4, z: 0 }),
      boxCollider({ x: 2.9, y: 1.4, z: 2.9 }, { x: 0, y: 8.1, z: 0 }),
    ],
  },
  {
    id: 'beach_umbrella_1',
    kind: 'umbrella',
    x: 238,
    z: 219,
    rotationY: 0.2,
    scale: 1.1,
    variant: 0,
    colliders: [],
  },
  {
    id: 'beach_umbrella_2',
    kind: 'umbrella',
    x: 272,
    z: 230,
    rotationY: -0.4,
    scale: 0.95,
    variant: 1,
    colliders: [],
  },
  {
    id: 'beach_umbrella_3',
    kind: 'umbrella',
    x: 250,
    z: 257,
    rotationY: 1.1,
    scale: 1.05,
    variant: 2,
    colliders: [],
  },
  {
    id: 'beach_umbrella_4',
    kind: 'umbrella',
    x: 130,
    z: 130,
    rotationY: 0.8,
    scale: 1,
    variant: 0,
    colliders: [],
  },
];

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function isNearAuthoredProp(x: number, z: number, padding: number): boolean {
  return authoredProps.some((prop) => {
    const radius =
      prop.kind === 'dock' ? 22 : prop.kind === 'lighthouse' ? 15 : prop.kind === 'fountain' ? 10 : 12;
    return Math.hypot(prop.x - x, prop.z - z) < radius + padding;
  });
}

function isNearSpawn(x: number, z: number, padding: number): boolean {
  return SPAWN_POINTS.some(
    (spawn) => Math.hypot(spawn.position.x - x, spawn.position.z - z) < padding,
  );
}

function generateScatterProps(): PropSeed[] {
  const random = mulberry32(0xf10a1c0);
  const result: PropSeed[] = [];
  let pineId = 0;
  let palmId = 0;
  let rockId = 0;

  for (let attempt = 0; attempt < 800 && pineId < 44; attempt += 1) {
    const x = -MAP_HALF_SIZE + 30 + random() * (MAP_SIZE - 60);
    const z = -MAP_HALF_SIZE + 30 + random() * (MAP_SIZE - 60);
    const height = sampleMapHeight(x, z);
    const slope = terrainSlopeAt(x, z);
    const inVillage = Math.hypot(x - VILLAGE_CENTER.x, z - VILLAGE_CENTER.z) < 42;
    if (height < 24 || slope > 0.72 || inVillage) continue;
    if (isNearAuthoredProp(x, z, 4) || isNearSpawn(x, z, 5)) continue;
    if (Math.hypot(x - SUMMIT_CENTER.x, z - SUMMIT_CENTER.z) < 28) continue;
    const scale = 0.8 + random() * 0.75;
    result.push({
      id: `pine_${pineId}`,
      kind: 'pine',
      x,
      z,
      rotationY: random() * Math.PI * 2,
      scale,
      variant: Math.floor(random() * 3),
      colliders: [cylinderCollider(0.38 * scale, 3.2 * scale, { x: 0, y: 3.2 * scale, z: 0 })],
    });
    pineId += 1;
  }

  for (let attempt = 0; attempt < 500 && palmId < 18; attempt += 1) {
    const x = -MAP_HALF_SIZE + 30 + random() * (MAP_SIZE - 60);
    const z = -MAP_HALF_SIZE + 30 + random() * (MAP_SIZE - 60);
    const height = sampleMapHeight(x, z);
    const slope = terrainSlopeAt(x, z);
    if (height < 0.7 || height > 12 || slope > 0.5) continue;
    if (isNearAuthoredProp(x, z, 3) || isNearSpawn(x, z, 4)) continue;
    const scale = 0.85 + random() * 0.5;
    result.push({
      id: `palm_${palmId}`,
      kind: 'palm',
      x,
      z,
      rotationY: random() * Math.PI * 2,
      scale,
      variant: Math.floor(random() * 2),
      colliders: [cylinderCollider(0.3 * scale, 3.8 * scale, { x: 0, y: 3.8 * scale, z: 0 })],
    });
    palmId += 1;
  }

  for (let attempt = 0; attempt < 600 && rockId < 30; attempt += 1) {
    const x = -MAP_HALF_SIZE + 24 + random() * (MAP_SIZE - 48);
    const z = -MAP_HALF_SIZE + 24 + random() * (MAP_SIZE - 48);
    const height = sampleMapHeight(x, z);
    const slope = terrainSlopeAt(x, z);
    if (height < -3.5) continue;
    if (isNearAuthoredProp(x, z, 5) || isNearSpawn(x, z, 6)) continue;
    if (Math.hypot(x - VILLAGE_CENTER.x, z - VILLAGE_CENTER.z) < 32) continue;
    const scale = 0.45 + random() * 1.55;
    result.push({
      id: `rock_${rockId}`,
      kind: 'rock',
      x,
      z,
      rotationY: random() * Math.PI * 2,
      scale,
      variant: Math.floor(random() * 3),
      colliders: [boxCollider({ x: 1.15 * scale, y: 0.8 * scale, z: 1 * scale }, { x: 0, y: 0.55 * scale, z: 0 })],
    });
    rockId += 1;
  }

  // Exposed ridge boulders frame the summit and make the skyline read better.
  for (let index = 0; index < 5; index += 1) {
    const angle = -0.9 + index * 0.45;
    const x = SUMMIT_CENTER.x + Math.cos(angle) * (35 + index * 4);
    const z = SUMMIT_CENTER.z + Math.sin(angle) * (35 + index * 3);
    const scale = 1.4 + index * 0.2;
    result.push({
      id: `summit_rock_${index}`,
      kind: 'rock',
      x,
      z,
      rotationY: angle,
      scale,
      variant: index % 3,
      colliders: [boxCollider({ x: 1.15 * scale, y: 0.8 * scale, z: 1 * scale }, { x: 0, y: 0.55 * scale, z: 0 })],
    });
  }

  return result;
}

function createProps(): MapProp[] {
  const allSeeds = [...authoredProps, ...generateScatterProps()];
  return allSeeds.map((seed, index) => {
    const ground = seed.y ?? sampleMapHeight(seed.x, seed.z);
    return {
      id: seed.id ?? `prop_${index}`,
      kind: seed.kind,
      position: { x: seed.x, y: ground, z: seed.z },
      rotationY: seed.rotationY ?? 0,
      scale: seed.scale ?? 1,
      variant: seed.variant ?? 0,
      ...(seed.dimensions ? { dimensions: seed.dimensions } : {}),
      colliders: seed.colliders ?? [],
    };
  });
}

export const FJORD_MAP: FjordMapDefinition = {
  id: MAP_ID,
  nameKey: 'world.mapName',
  size: MAP_SIZE,
  segments: MAP_SEGMENTS,
  waterLevel: WATER_LEVEL,
  heightAt: sampleMapHeight,
  heights,
  spawns: SPAWN_POINTS,
  zones: MAP_ZONES,
  landmarks: LANDMARKS,
  props: createProps(),
};

export function zoneAt(x: number, z: number): MapZone {
  let closest = MAP_ZONES[0];
  let closestDistance = Number.POSITIVE_INFINITY;
  for (const zone of MAP_ZONES) {
    const distance = Math.hypot(x - zone.center.x, z - zone.center.z);
    if (distance <= zone.radius && distance < closestDistance) {
      closest = zone;
      closestDistance = distance;
    }
  }
  if (closestDistance !== Number.POSITIVE_INFINITY) return closest;
  if (sampleMapHeight(x, z) < 4) {
    return {
      id: 'shoreline',
      center: { x, z },
      radius: 0,
      labelKey: 'world.zones.shoreline',
    };
  }
  return {
    id: 'highlands',
    center: { x, z },
    radius: 0,
    labelKey: 'world.zones.highlands',
  };
}

export function randomSpawnForFaction(faction: Faction, random: () => number = Math.random): SpawnPoint {
  const options = FJORD_MAP.spawns.filter((spawn) => spawn.faction === faction);
  const fallback = FJORD_MAP.spawns[0];
  if (!fallback) {
    throw new Error('The Fjord Fiesta blueprint requires at least one spawn point.');
  }
  if (options.length === 0) return fallback;
  const index = Math.min(options.length - 1, Math.floor(random() * options.length));
  return options[index] ?? fallback;
}

export function oppositeFaction(faction: Faction): Faction {
  return faction === 'alpine' ? 'lagoon' : 'alpine';
}
