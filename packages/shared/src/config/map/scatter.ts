/**
 * Deterministic nature scatter: fir forests, palm groves and rocks with
 * colliders, plus an occupancy grid that keeps roads, routes, structures,
 * spawns and bot corridors clear. The client reuses `isClutterFree` for its
 * purely visual ground clutter so nothing grows through a pier or a chalet.
 */
import { MAP_HALF_SIZE, MAP_SIZE, WATER_LEVEL } from '../../constants.js';
import type { Vec3 } from '../../types/index.js';
import type { NavGraph } from '../../types/map.js';
import { cylinderCollider, boxCollider } from './buildings.js';
import {
  COASTAL_RAMP_POINTS,
  COASTAL_RAMP_WIDTH,
  GLACIER_RUNWAY,
  GORGE,
  GORGE_TRAIL_POINTS,
  SQUARE_HALF,
  TANK_ROAD_POINTS,
  TANK_ROAD_WIDTH,
  VILLAGE_LANE_POINTS,
  VILLAGE_LANE_WIDTH,
  WATER_RUNWAY,
} from './layout.js';
import { fbm, mulberry32, projectOnSegment, rotateY, smoothstep } from './math.js';
import { FJORD_ROUTES } from './routes.js';
import type { PropSeed } from './structures.js';
import { coastDistanceAt, isOnIcePatch, sampleMapHeight, terrainSlopeAt } from './terrain.js';

const CELL = 2;
const SIZE = Math.ceil(MAP_SIZE / CELL);

export class OccupancyGrid {
  readonly cells = new Uint8Array(SIZE * SIZE);

  private index(x: number, z: number): number {
    const column = Math.floor((x + MAP_HALF_SIZE) / CELL);
    const row = Math.floor((z + MAP_HALF_SIZE) / CELL);
    if (column < 0 || row < 0 || column >= SIZE || row >= SIZE) return -1;
    return column * SIZE + row;
  }

  blocked(x: number, z: number): boolean {
    const index = this.index(x, z);
    return index < 0 || (this.cells[index] ?? 0) > 0;
  }

  markCircle(x: number, z: number, radius: number): void {
    for (let dx = -radius; dx <= radius; dx += CELL * 0.5) {
      for (let dz = -radius; dz <= radius; dz += CELL * 0.5) {
        if (dx * dx + dz * dz > radius * radius) continue;
        const index = this.index(x + dx, z + dz);
        if (index >= 0) this.cells[index] = 1;
      }
    }
  }

  markSegment(ax: number, az: number, bx: number, bz: number, radius: number): void {
    const minX = Math.min(ax, bx) - radius;
    const maxX = Math.max(ax, bx) + radius;
    const minZ = Math.min(az, bz) - radius;
    const maxZ = Math.max(az, bz) + radius;
    for (let x = minX; x <= maxX; x += CELL * 0.5) {
      for (let z = minZ; z <= maxZ; z += CELL * 0.5) {
        if (projectOnSegment(x, z, ax, az, bx, bz).distance > radius) continue;
        const index = this.index(x, z);
        if (index >= 0) this.cells[index] = 1;
      }
    }
  }

  markPolyline(points: readonly Vec3[], radius: number): void {
    for (let index = 0; index + 1 < points.length; index += 1) {
      const a = points[index];
      const b = points[index + 1];
      if (a && b) this.markSegment(a.x, a.z, b.x, b.z, radius);
    }
  }

  markRect(x: number, z: number, halfX: number, halfZ: number, rotationY: number): void {
    const radius = Math.hypot(halfX, halfZ);
    for (let dx = -radius; dx <= radius; dx += CELL * 0.5) {
      for (let dz = -radius; dz <= radius; dz += CELL * 0.5) {
        const local = rotateY(dx, dz, -rotationY);
        if (Math.abs(local.x) > halfX || Math.abs(local.z) > halfZ) continue;
        const index = this.index(x + dx, z + dz);
        if (index >= 0) this.cells[index] = 1;
      }
    }
  }
}

/** Marks routes, structure footprints, spawn pads and bot corridors as occupied. */
export function buildOccupancy(structures: readonly PropSeed[], spawns: readonly Vec3[], nav: NavGraph): OccupancyGrid {
  const grid = new OccupancyGrid();
  grid.markPolyline(TANK_ROAD_POINTS, TANK_ROAD_WIDTH / 2 + 3);
  grid.markPolyline(COASTAL_RAMP_POINTS, COASTAL_RAMP_WIDTH / 2 + 3);
  for (const lane of VILLAGE_LANE_POINTS) grid.markPolyline(lane, VILLAGE_LANE_WIDTH / 2 + 2);
  for (const trail of GORGE_TRAIL_POINTS) grid.markPolyline(trail, 2.6);
  grid.markRect(0, 0, SQUARE_HALF + 3, SQUARE_HALF + 3, 0);
  grid.markPolyline(FJORD_ROUTES.tBar.ridePath.points, 4.5);
  for (const pillar of FJORD_ROUTES.coaster.pillars) grid.markCircle(pillar.top.x, pillar.top.z, 2.6);
  grid.markPolyline(FJORD_ROUTES.coaster.track.points, 2.2);
  for (const runway of [GLACIER_RUNWAY, WATER_RUNWAY]) {
    grid.markSegment(runway.start.x, runway.start.z, runway.end.x, runway.end.z, runway.width / 2 + 6);
  }
  for (const spawn of spawns) grid.markCircle(spawn.x, spawn.z, 4);
  for (const [a, b] of nav.edges) {
    const na = nav.nodes[a];
    const nb = nav.nodes[b];
    if (na && nb) grid.markSegment(na.position.x, na.position.z, nb.position.x, nb.position.z, 2.4);
  }
  for (const seed of structures) {
    if (seed.kind === 'coaster_platform' && seed.variant === 1) continue;
    if (seed.building) {
      grid.markRect(seed.x, seed.z, seed.building.width / 2 + 3, seed.building.depth / 2 + 3, seed.rotationY ?? 0);
      continue;
    }
    if (seed.path && seed.path.length > 1) {
      grid.markPolyline(seed.path, seed.kind === 'bunting' ? 0 : 1.5);
      continue;
    }
    const radius =
      seed.kind === 'harbor_platform'
        ? 20
        : seed.kind === 'lighthouse'
          ? 9
          : seed.kind === 'pier' || seed.kind === 'boat_dock'
            ? 0
            : seed.kind === 'clock_pavilion'
              ? 10
              : seed.kind === 'cable_station' || seed.kind === 'stone_arch'
                ? 10
                : seed.kind === 'hammock'
                  ? 6
                  : 2.5;
    if (seed.kind === 'pier' || seed.kind === 'boat_dock' || seed.kind === 'bridge_deck') {
      const length = seed.dimensions?.z ?? 6;
      const width = (seed.dimensions?.x ?? 4) / 2 + 1.5;
      const direction = rotateY(0, length / 2, seed.rotationY ?? 0);
      grid.markRect(seed.x + direction.x, seed.z + direction.z, width, length / 2 + 1, seed.rotationY ?? 0);
      continue;
    }
    if (seed.kind === 'stone_arch') {
      const length = seed.dimensions?.z ?? 16;
      const direction = rotateY(0, length / 2, seed.rotationY ?? 0);
      grid.markRect(seed.x + direction.x, seed.z + direction.z, 8, length / 2 + 2, seed.rotationY ?? 0);
      continue;
    }
    grid.markCircle(seed.x, seed.z, radius);
  }
  return grid;
}

export interface ScatterResult {
  seeds: PropSeed[];
}

function forestDensity(x: number, z: number): number {
  return fbm(x * 0.012 + 3.1, z * 0.012 - 7.4, 3, 401);
}

function groveDensity(x: number, z: number): number {
  return fbm(x * 0.02 - 11, z * 0.02 + 5, 3, 403);
}

export function generateScatter(grid: OccupancyGrid): PropSeed[] {
  const random = mulberry32(0xf10a1c0);
  const seeds: PropSeed[] = [];

  const fits = (x: number, z: number, spacing: number, placed: readonly { x: number; z: number }[]): boolean => {
    for (const other of placed) {
      if (Math.abs(other.x - x) < spacing && Math.abs(other.z - z) < spacing && Math.hypot(other.x - x, other.z - z) < spacing) {
        return false;
      }
    }
    return true;
  };

  // Fir forests: alpine side of the gorge and the high slopes everywhere.
  const firs: { x: number; z: number }[] = [];
  for (let attempt = 0; attempt < 26000 && firs.length < 720; attempt += 1) {
    const x = -MAP_HALF_SIZE + 6 + random() * (MAP_SIZE - 12);
    const z = -MAP_HALF_SIZE + 6 + random() * (MAP_SIZE - 12);
    const height = sampleMapHeight(x, z);
    if (height < 17.5 || height > 78) continue;
    const alpine = z > GORGE.centerAt(x) + 14 || height > 26;
    if (!alpine) continue;
    if (terrainSlopeAt(x, z) > 0.62 || isOnIcePatch(x, z)) continue;
    const density = forestDensity(x, z) - smoothstep(60, 78, height) * 0.4;
    if (density < 0.5 && random() > 0.08) continue;
    if (grid.blocked(x, z)) continue;
    if (!fits(x, z, density > 0.6 ? 4.2 : 6.5, firs)) continue;
    firs.push({ x, z });
    const scale = 0.75 + random() * 0.85;
    seeds.push({
      id: `fir_${firs.length - 1}`,
      kind: 'fir',
      x,
      z,
      rotationY: random() * Math.PI * 2,
      scale,
      variant: Math.floor(random() * 4),
      colliders: [cylinderCollider(0.34 * scale, 1.9 * scale, 0, 1.9 * scale, 0)],
    });
  }

  // Coconut palm groves: beaches, Palm Point, Coconut Bay and the island base.
  const palms: { x: number; z: number }[] = [];
  for (let attempt = 0; attempt < 22000 && palms.length < 300; attempt += 1) {
    const x = -MAP_HALF_SIZE + 6 + random() * (MAP_SIZE - 12);
    const z = -MAP_HALF_SIZE + 6 + random() * (MAP_SIZE - 12);
    const height = sampleMapHeight(x, z);
    if (height < WATER_LEVEL + 0.7 || height > 11) continue;
    if (z > GORGE.centerAt(x) - 10 && x > -120) continue;
    if (Math.max(Math.abs(x), Math.abs(z)) < 62) continue;
    if (terrainSlopeAt(x, z) > 0.42) continue;
    const coast = coastDistanceAt(x, z);
    const density = groveDensity(x, z) + (coast < 30 ? 0.12 : 0);
    if (density < 0.52 && random() > 0.06) continue;
    if (grid.blocked(x, z)) continue;
    if (!fits(x, z, 5.5, palms)) continue;
    palms.push({ x, z });
    const scale = 0.85 + random() * 0.45;
    seeds.push({
      id: `palm_${palms.length - 1}`,
      kind: 'palm',
      x,
      z,
      rotationY: random() * Math.PI * 2,
      scale,
      variant: Math.floor(random() * 3),
      colliders: [cylinderCollider(0.34 * scale, 1.6 * scale, 0, 1.6 * scale, 0)],
    });
  }

  // Rocks: cliff feet, gorge floor, coast and mountain boulders.
  const rocks: { x: number; z: number }[] = [];
  for (let attempt = 0; attempt < 26000 && rocks.length < 460; attempt += 1) {
    const x = -MAP_HALF_SIZE + 4 + random() * (MAP_SIZE - 8);
    const z = -MAP_HALF_SIZE + 4 + random() * (MAP_SIZE - 8);
    const height = sampleMapHeight(x, z);
    if (height < -1.5) continue;
    const slope = terrainSlopeAt(x, z);
    const coast = coastDistanceAt(x, z);
    const steepNearby = slope > 0.45 || terrainSlopeAt(x + 4, z) > 0.7 || terrainSlopeAt(x, z + 4) > 0.7 || terrainSlopeAt(x - 4, z) > 0.7;
    const coastal = coast < 10 && coast > -6;
    const alpine = height > 30;
    const chance = steepNearby ? 0.55 : coastal ? 0.22 : alpine ? 0.08 : 0.015;
    if (random() > chance) continue;
    if (slope > 0.95) continue;
    if (grid.blocked(x, z)) continue;
    if (!fits(x, z, 4, rocks)) continue;
    rocks.push({ x, z });
    const big = random() < 0.18;
    const scale = big ? 1.8 + random() * 1.8 : 0.55 + random() * 1.1;
    const rotationY = random() * Math.PI * 2;
    seeds.push({
      id: `rock_${rocks.length - 1}`,
      kind: 'rock',
      x,
      z,
      y: height - 0.25 * scale,
      rotationY,
      scale,
      variant: Math.floor(random() * 5),
      colliders: [boxCollider(1.05 * scale, 0.75 * scale, 0.9 * scale, 0, 0.7 * scale, 0)],
    });
  }
  return seeds;
}

/**
 * True where purely visual clutter (grass, flowers, pebbles, shells, snow
 * mounds) may grow: free of structures, routes and spawns, on dry land.
 */
export function makeClutterTest(grid: OccupancyGrid): (x: number, z: number) => boolean {
  return (x: number, z: number) => !grid.blocked(x, z);
}
