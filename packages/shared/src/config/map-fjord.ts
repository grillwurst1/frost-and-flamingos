/**
 * Fjord Fiesta — the immutable map blueprint.
 *
 * Assembled from the split map modules in `./map/`: analytic terrain sampled
 * into the 257 × 257 heightfield, authored structures with colliders, the
 * deterministic nature scatter, sampled routes, gameplay data (towers, bases,
 * spawns, vehicle spawns, zones, bot waypoints) and the destructible
 * registry. Client visuals and server colliders both derive from this.
 */
import { MAP_ID, MAP_SEGMENTS, MAP_SIZE, SNOWLINE_Y, WATER_LEVEL } from '../constants.js';
import type { Faction, Vec3 } from '../types/index.js';
import type {
  BridgeSegment,
  DestructibleBuilding,
  ExplosiveSilo,
  FactionBase,
  FallableTree,
  IcePatch,
  MapDestructibles,
  MapProp,
  MapRoutes,
  MapZone,
  NavGraph,
  PropCollider,
  SpawnPoint,
  SurfaceRegion,
  SurfaceTag,
  TourismBillboard,
  TowerDefinition,
  TowerId,
  VehicleSpawnPoint,
} from '../types/map.js';
import {
  FJORD_BASES,
  FJORD_NAV,
  FJORD_SPAWNS,
  FJORD_TOWERS,
  FJORD_VEHICLE_SPAWNS,
  FJORD_ZONES,
  ROUND_START_TOWERS,
  zoneAt,
} from './map/gameplay.js';
import { BRIDGE_WIDTH, TOWER_A_POSITION, TOWER_B_POSITION, TOWER_C_POSITION } from './map/layout.js';
import { localToWorld, rotateY, vec3 } from './map/math.js';
import { FJORD_ROUTES } from './map/routes.js';
import { buildOccupancy, generateScatter, makeClutterTest } from './map/scatter.js';
import { authoredStructureSeeds, type PropSeed } from './map/structures.js';
import {
  BASE_HEIGHTS,
  ICE_PATCHES,
  sampleMapHeight,
  terrainSurfaceTagAt,
} from './map/terrain.js';

export {
  analyticTerrainHeight,
  BASE_HEIGHTS,
  CELL_SIZE,
  COAST_GRID,
  coastDistanceAt,
  GRID_POINTS,
  gridCoordinate,
  groundPosition,
  isOnIcePatch,
  sampleMapHeight,
  terrainBiomeAt,
  terrainNormalAt,
  terrainSlopeAt,
  terrainSnowWeight,
  terrainSurfaceTagAt,
  type TerrainBiome,
} from './map/terrain.js';
export * as FjordLayout from './map/layout.js';
export { sampleRoute, projectOnPolyline } from './map/math.js';
export { wallSpans, wallFrames, roofBase, slabRects, type WallSpan, type WallFrame } from './map/buildings.js';
export {
  bridgeDeckHeightAt,
  BRIDGE_PYLON_Z,
  BRIDGE_SEGMENTS,
  CHALET_PLACEMENTS,
  CHALET_TERRACES,
  LIGHTHOUSE,
  MID_SUPPORT_STAIRS,
  PAVILION,
  PIER_LAYOUTS,
  SUMMIT_CLOCK_HOUSE,
  SUMMIT_YAW,
} from './map/structures.js';
export { TBAR_MAST_OFFSET } from './map/routes.js';
export { FJORD_NAV, FJORD_TOWERS, FJORD_BASES, FJORD_VEHICLE_SPAWNS, FJORD_ZONES, ROUND_START_TOWERS, zoneAt };

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

const structureSeeds = authoredStructureSeeds();
const occupancy = buildOccupancy(
  structureSeeds,
  FJORD_SPAWNS.map((spawn) => spawn.position),
  FJORD_NAV,
);
const scatterSeeds = generateScatter(occupancy);

/** True where client-only ground clutter may be placed. */
export const isClutterFree = makeClutterTest(occupancy);

const FALLABLE_FIRS = 35;
const FALLABLE_PALMS = 25;

/** Picks the trees nearest to bot corridors (where felling matters), spaced apart. */
function selectFallableTrees(seeds: PropSeed[], nav: NavGraph): Set<string> {
  const edgeDistance = (x: number, z: number): number => {
    let best = Number.POSITIVE_INFINITY;
    for (const [a, b] of nav.edges) {
      const na = nav.nodes[a];
      const nb = nav.nodes[b];
      if (!na || !nb) continue;
      const dx = nb.position.x - na.position.x;
      const dz = nb.position.z - na.position.z;
      const lengthSquared = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - na.position.x) * dx + (z - na.position.z) * dz) / lengthSquared));
      best = Math.min(best, Math.hypot(x - (na.position.x + dx * t), z - (na.position.z + dz * t)));
    }
    return best;
  };
  const chosen = new Set<string>();
  for (const [species, count] of [
    ['fir', FALLABLE_FIRS],
    ['palm', FALLABLE_PALMS],
  ] as const) {
    const candidates = seeds
      .filter((seed) => seed.kind === species)
      .map((seed) => ({ seed, distance: edgeDistance(seed.x, seed.z) }))
      .filter((candidate) => candidate.distance > 3 && candidate.distance < 26)
      .sort((a, b) => a.distance - b.distance || a.seed.id.localeCompare(b.seed.id));
    const picked: PropSeed[] = [];
    for (const candidate of candidates) {
      if (picked.length >= count) break;
      if (picked.some((other) => Math.hypot(other.x - candidate.seed.x, other.z - candidate.seed.z) < 14)) continue;
      picked.push(candidate.seed);
      chosen.add(candidate.seed.id);
    }
  }
  return chosen;
}

const fallable = selectFallableTrees(scatterSeeds, FJORD_NAV);

function toProp(seed: PropSeed): MapProp {
  const destructibleId = seed.destructibleId ?? (fallable.has(seed.id) ? `tree_${seed.id}` : undefined);
  return {
    id: seed.id,
    kind: seed.kind,
    position: { x: seed.x, y: seed.y ?? sampleMapHeight(seed.x, seed.z), z: seed.z },
    rotationY: seed.rotationY ?? 0,
    scale: seed.scale ?? 1,
    variant: seed.variant ?? 0,
    ...(seed.dimensions ? { dimensions: seed.dimensions } : {}),
    ...(seed.building ? { building: seed.building } : {}),
    ...(seed.path ? { path: seed.path } : {}),
    colliders: (seed.colliders ?? []).map((collider) =>
      destructibleId && !collider.pieceId ? { ...collider, pieceId: destructibleId } : collider,
    ),
    ...(destructibleId ? { destructibleId } : {}),
    ...(seed.surface ? { surface: seed.surface } : {}),
  };
}

const PROPS: MapProp[] = [...structureSeeds, ...scatterSeeds].map(toProp);

// ---------------------------------------------------------------------------
// Destructible registry (data only; stages and HP live in later packages)
// ---------------------------------------------------------------------------

function nearestTower(position: Vec3): TowerId {
  const towers: [TowerId, Vec3][] = [
    ['tower_a', TOWER_A_POSITION],
    ['tower_b', TOWER_B_POSITION],
    ['tower_c', TOWER_C_POSITION],
  ];
  let best: TowerId = 'tower_b';
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const [id, tower] of towers) {
    const distance = Math.hypot(position.x - tower.x, position.z - tower.z);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = id;
    }
  }
  return best;
}

function buildDestructibles(props: readonly MapProp[]): MapDestructibles {
  const buildings: DestructibleBuilding[] = [];
  const bridgeSegments: BridgeSegment[] = [];
  const trees: FallableTree[] = [];
  const silos: ExplosiveSilo[] = [];
  const billboards: TourismBillboard[] = [];
  const posters: TourismBillboard['posterId'][] = ['cheese', 'lagoon', 'biplane', 'fondue', 'cuckoo', 'cablecar'];
  for (const prop of props) {
    const id = prop.destructibleId;
    if (!id) continue;
    if (prop.building && (prop.kind === 'chalet' || prop.kind === 'beach_bar' || prop.kind === 'side_hut')) {
      buildings.push({
        id,
        netId: buildings.length,
        kind: prop.kind,
        propId: prop.id,
        tower: nearestTower(prop.position),
        nameKey: prop.building.nameKey ?? 'world.buildings.chalet',
        position: { ...prop.position },
        rotationY: prop.rotationY,
        footprint: { x: prop.building.width, z: prop.building.depth },
        maxHp: 500,
        ruinHeight: 1.2,
      });
      continue;
    }
    if (prop.kind === 'bridge_deck' || prop.kind === 'pier') {
      const length = prop.dimensions?.z ?? 6;
      const end = localToWorld(prop.position, prop.rotationY, vec3(0, prop.dimensions?.y ?? 0, length));
      const width = prop.kind === 'bridge_deck' ? BRIDGE_WIDTH : (prop.dimensions?.x ?? 4.5);
      const side = rotateY(width / 2 + 0.3, 0, prop.rotationY);
      const structure: BridgeSegment['structure'] =
        prop.kind === 'bridge_deck'
          ? 'suspension_bridge'
          : (prop.id.slice(0, prop.id.indexOf('_seg')) as BridgeSegment['structure']);
      bridgeSegments.push({
        id,
        netId: bridgeSegments.length,
        structure,
        propId: prop.id,
        pieceId: id,
        start: { ...prop.position },
        end,
        width,
        maxHp: 150,
        patchedHp: 100,
        repairPosts: [
          vec3(prop.position.x + side.x, prop.position.y, prop.position.z + side.z),
          vec3(prop.position.x - side.x, prop.position.y, prop.position.z - side.z),
          vec3(end.x + side.x, end.y, end.z + side.z),
          vec3(end.x - side.x, end.y, end.z - side.z),
        ],
      });
      continue;
    }
    if (prop.kind === 'fir' || prop.kind === 'palm') {
      trees.push({
        id,
        netId: trees.length,
        species: prop.kind,
        propId: prop.id,
        position: { ...prop.position },
        height: (prop.kind === 'fir' ? 9.5 : 7.8) * prop.scale,
        trunkRadius: 0.45,
        fallenLength: 7,
        maxHp: 80,
      });
      continue;
    }
    if (prop.kind === 'cheese_silo' || prop.kind === 'coconut_silo') {
      silos.push({
        id,
        netId: silos.length,
        kind: prop.kind === 'cheese_silo' ? 'cheese_wheel' : 'coconut_silo',
        propId: prop.id,
        position: { ...prop.position },
        maxHp: 100,
        blastRadius: 6,
        blastDamage: 130,
      });
      continue;
    }
    if (prop.kind === 'billboard') {
      const posterId = posters[prop.variant % posters.length] ?? 'cheese';
      billboards.push({
        id,
        netId: billboards.length,
        propId: prop.id,
        position: { ...prop.position },
        rotationY: prop.rotationY,
        width: prop.dimensions?.x ?? 6,
        height: prop.dimensions?.y ?? 3.5,
        adKey: `world.billboards.${posterId}`,
        posterId,
      });
    }
  }
  return { buildings, bridgeSegments, trees, silos, billboards };
}

// ---------------------------------------------------------------------------
// Walkable surface regions (decks and floors) for footsteps and traction
// ---------------------------------------------------------------------------

function colliderRegion(prop: MapProp, collider: PropCollider): SurfaceRegion | null {
  if (!collider.surface) return null;
  const offset = rotateY(collider.offset.x, collider.offset.z, prop.rotationY);
  const center = { x: prop.position.x + offset.x, z: prop.position.z + offset.z };
  if (collider.type === 'box') {
    const pitch = collider.rotation?.x ?? 0;
    const yaw = prop.rotationY + (collider.rotation?.y ?? 0);
    const top = prop.position.y + collider.offset.y + collider.halfExtents.y * Math.cos(pitch);
    return {
      shape: {
        type: 'rect',
        center,
        halfSize: { x: collider.halfExtents.x, z: collider.halfExtents.z * Math.abs(Math.cos(pitch)) },
        rotationY: yaw,
      },
      top,
      tag: collider.surface,
    };
  }
  if (collider.type === 'cylinder' || collider.type === 'prism') {
    return {
      shape: { type: 'circle', center, radius: collider.radius },
      top: prop.position.y + collider.offset.y + collider.halfHeight,
      tag: collider.surface,
    };
  }
  return null;
}

const SURFACE_REGIONS: SurfaceRegion[] = PROPS.flatMap((prop) =>
  prop.colliders.map((collider) => colliderRegion(prop, collider)).filter((region): region is SurfaceRegion => region !== null),
);

const REGION_CELL = 16;
const regionIndex = new Map<number, SurfaceRegion[]>();
const regionKey = (cx: number, cz: number): number => (cx + 512) * 4096 + (cz + 512);
for (const region of SURFACE_REGIONS) {
  const reach =
    region.shape.type === 'circle'
      ? region.shape.radius
      : Math.hypot(region.shape.halfSize.x, region.shape.halfSize.z);
  const minX = Math.floor((region.shape.center.x - reach) / REGION_CELL);
  const maxX = Math.floor((region.shape.center.x + reach) / REGION_CELL);
  const minZ = Math.floor((region.shape.center.z - reach) / REGION_CELL);
  const maxZ = Math.floor((region.shape.center.z + reach) / REGION_CELL);
  for (let cx = minX; cx <= maxX; cx += 1) {
    for (let cz = minZ; cz <= maxZ; cz += 1) {
      const key = regionKey(cx, cz);
      const list = regionIndex.get(key) ?? [];
      list.push(region);
      regionIndex.set(key, list);
    }
  }
}

function regionContains(region: SurfaceRegion, x: number, z: number): boolean {
  const shape = region.shape;
  if (shape.type === 'circle') return Math.hypot(x - shape.center.x, z - shape.center.z) <= shape.radius;
  const local = rotateY(x - shape.center.x, z - shape.center.z, -shape.rotationY);
  return Math.abs(local.x) <= shape.halfSize.x + 0.05 && Math.abs(local.z) <= shape.halfSize.z + 0.05;
}

/**
 * Surface under a point. Without `y` this is the terrain tag; with the feet
 * height it also recognises decks, floors, piers, the bridge and the arch.
 */
export function surfaceTagAt(x: number, z: number, y?: number): SurfaceTag {
  if (y !== undefined) {
    const list = regionIndex.get(regionKey(Math.floor(x / REGION_CELL), Math.floor(z / REGION_CELL)));
    if (list) {
      let best: SurfaceRegion | null = null;
      let bestGap = 0.75;
      for (const region of list) {
        const gap = Math.abs(y - region.top);
        if (gap < bestGap && regionContains(region, x, z)) {
          best = region;
          bestGap = gap;
        }
      }
      if (best) return best.tag;
    }
  }
  return terrainSurfaceTagAt(x, z);
}

export { ICE_PATCHES };

// ---------------------------------------------------------------------------
// Blueprint
// ---------------------------------------------------------------------------

export interface FjordMapDefinition {
  readonly id: string;
  readonly nameKey: string;
  readonly size: number;
  readonly segments: number;
  readonly waterLevel: number;
  readonly snowline: number;
  readonly heightAt: (x: number, z: number) => number;
  /** Column-major base heightfield (see `BASE_HEIGHTS`). */
  readonly heights: Float32Array;
  readonly spawns: readonly SpawnPoint[];
  readonly zones: readonly MapZone[];
  readonly towers: readonly TowerDefinition[];
  readonly bases: readonly FactionBase[];
  readonly props: readonly MapProp[];
  readonly routes: MapRoutes;
  readonly destructibles: MapDestructibles;
  readonly vehicleSpawns: readonly VehicleSpawnPoint[];
  readonly nav: NavGraph;
  readonly icePatches: readonly IcePatch[];
  readonly surfaceRegions: readonly SurfaceRegion[];
}

export const FJORD_MAP: FjordMapDefinition = {
  id: MAP_ID,
  nameKey: 'world.mapName',
  size: MAP_SIZE,
  segments: MAP_SEGMENTS,
  waterLevel: WATER_LEVEL,
  snowline: SNOWLINE_Y,
  heightAt: sampleMapHeight,
  heights: BASE_HEIGHTS,
  spawns: FJORD_SPAWNS,
  zones: FJORD_ZONES,
  towers: FJORD_TOWERS,
  bases: FJORD_BASES,
  props: PROPS,
  routes: FJORD_ROUTES,
  destructibles: buildDestructibles(PROPS),
  vehicleSpawns: FJORD_VEHICLE_SPAWNS,
  nav: FJORD_NAV,
  icePatches: ICE_PATCHES,
  surfaceRegions: SURFACE_REGIONS,
};

/** Back-compat aliases used by earlier milestones. */
export const MAP_ZONES = FJORD_ZONES;
export const SPAWN_POINTS = FJORD_SPAWNS;

// ---------------------------------------------------------------------------
// Spawn selection
// ---------------------------------------------------------------------------

/**
 * Spawn rule of the design record: random pad around a tower the faction
 * holds; the faction main base when it holds none. `isBlocked` lets the
 * server reject occupied pads (free-raycast check); when every pad is
 * blocked the least crowded random pad is still returned.
 */
export function selectSpawn(
  faction: Faction,
  heldTowers: readonly TowerId[],
  random: () => number = Math.random,
  isBlocked: (position: Vec3) => boolean = () => false,
): SpawnPoint {
  const towerPads = FJORD_TOWERS.filter((tower) => heldTowers.includes(tower.id)).flatMap((tower) =>
    tower.spawnPads.filter((spawn) => spawn.faction === faction),
  );
  const base = FJORD_BASES.find((candidate) => candidate.faction === faction);
  const options = towerPads.length > 0 ? towerPads : (base?.spawnPads ?? []);
  const fallback = options[0] ?? FJORD_SPAWNS[0];
  if (!fallback) throw new Error('The Fjord Fiesta blueprint requires at least one spawn point.');
  const start = Math.min(options.length - 1, Math.floor(random() * options.length));
  for (let offset = 0; offset < options.length; offset += 1) {
    const candidate = options[(start + offset) % options.length];
    if (candidate && !isBlocked(candidate.position)) return candidate;
  }
  return options[start] ?? fallback;
}

/** Spawn at round-start ownership (each faction holds its home tower). */
export function randomSpawnForFaction(
  faction: Faction,
  random: () => number = Math.random,
  isBlocked?: (position: Vec3) => boolean,
): SpawnPoint {
  return selectSpawn(faction, ROUND_START_TOWERS[faction], random, isBlocked);
}

export function oppositeFaction(faction: Faction): Faction {
  return faction === 'alpine' ? 'lagoon' : 'alpine';
}
