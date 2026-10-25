/**
 * Deterministic analytic terrain of Fjord Fiesta.
 *
 * The height function is composed from immutable layout data (coastline,
 * islands, plateau, alps, gorge, pads and road centrelines). It is sampled
 * once into the 257 × 257 heightfield that both the Rapier collider and the
 * client terrain mesh use, so physics and visuals are vertex-identical.
 */
import { MAP_HALF_SIZE, MAP_SEGMENTS, MAP_SIZE, WATER_LEVEL } from '../../constants.js';
import type { Vec2, Vec3 } from '../../types/index.js';
import type { SurfaceTag } from '../../types/map.js';
import {
  COASTAL_RAMP_POINTS,
  COASTAL_RAMP_WIDTH,
  GORGE,
  GORGE_TRAIL_POINTS,
  GORGE_TRAIL_WIDTH,
  ICE_PATCH_LAYOUT,
  ISLANDS,
  LAGOON_FLOOR,
  MAINLAND_COAST,
  SNOWLINE_HEIGHT,
  SQUARE_HALF,
  STONE_ARCH,
  TANK_ROAD_POINTS,
  TANK_ROAD_WIDTH,
  TERRAIN_PADS,
  VILLAGE_HEIGHT,
  VILLAGE_LANE_POINTS,
  VILLAGE_LANE_WIDTH,
  WATERFALL,
} from './layout.js';
import {
  type Bounds2,
  capsuleSignedDistance,
  clamp01,
  fbm,
  insideBounds,
  lerp,
  polylineBounds,
  projectOnPolyline,
  rectSignedDistance,
  ridged,
  smoothMax,
  smoothstep,
  valueNoise,
} from './math.js';

interface CoastEdge {
  ax: number;
  az: number;
  bx: number;
  bz: number;
}

/** Real shoreline edges only: the polygon's closing edges outside the map are skipped. */
const COAST_EDGES: CoastEdge[] = MAINLAND_COAST.map((point, index) => {
  const next = MAINLAND_COAST[(index + 1) % MAINLAND_COAST.length] ?? point;
  return { ax: point.x, az: point.z, bx: next.x, bz: next.z };
}).filter((edge) => {
  const outside = (x: number, z: number): boolean => Math.abs(x) >= 455 || Math.abs(z) >= 455;
  return !(outside(edge.ax, edge.az) && outside(edge.bx, edge.bz));
});

function pointInPolygon(x: number, z: number, polygon: readonly Vec2[]): boolean {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const a = polygon[index];
    const b = polygon[previous];
    if (!a || !b) continue;
    if (a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

/** Signed distance to the mainland coastline: positive on land, negative at sea. */
function mainlandDistance(x: number, z: number): number {
  let best = Number.POSITIVE_INFINITY;
  for (const edge of COAST_EDGES) {
    const dx = edge.bx - edge.ax;
    const dz = edge.bz - edge.az;
    const lengthSquared = dx * dx + dz * dz;
    const t = lengthSquared < 1e-9 ? 0 : clamp01(((x - edge.ax) * dx + (z - edge.az) * dz) / lengthSquared);
    const distance = Math.hypot(x - (edge.ax + dx * t), z - (edge.az + dz * t));
    if (distance < best) best = distance;
  }
  return pointInPolygon(x, z, MAINLAND_COAST) ? best : -best;
}

interface IslandSample {
  distance: number;
  height: number;
  radius: number;
  rocky: boolean;
}

function islandSample(x: number, z: number): IslandSample {
  let best: IslandSample = { distance: Number.NEGATIVE_INFINITY, height: 0, radius: 1, rocky: false };
  for (const island of ISLANDS) {
    const distance =
      island.kind === 'circle'
        ? island.radius - Math.hypot(x - island.a.x, z - island.a.z)
        : -capsuleSignedDistance(x, z, island.a.x, island.a.z, island.b.x, island.b.z, island.radius);
    if (distance > best.distance) best = { distance, height: island.height, radius: island.radius, rocky: island.rocky };
  }
  return best;
}

/** Coast distance with a gently wobbling shoreline. */
export function coastDistanceAt(x: number, z: number): number {
  const wobbleX = (valueNoise(x * 0.018, z * 0.018, 301) - 0.5) * 9;
  const wobbleZ = (valueNoise(x * 0.018 + 40, z * 0.018 - 13, 302) - 0.5) * 9;
  const qx = x + wobbleX;
  const qz = z + wobbleZ;
  const island = islandSample(qx, qz);
  return Math.max(mainlandDistance(qx, qz), island.distance);
}

/** 0 = gentle beach, 1 = rocky sea cliff. */
function cliffinessAt(x: number, z: number): number {
  let value = 0;
  // North shore of the fjord inlet and the waterfall head.
  value = Math.max(value, smoothstep(82, 100, z) * (1 - smoothstep(-96, -80, x)) * smoothstep(-420, -360, x - 60));
  // West channel rocks.
  value = Math.max(value, smoothstep(-330, -352, x) * smoothstep(-120, -60, z) * 0.85);
  // Eastern massif sea cliffs.
  value = Math.max(value, smoothstep(176, 210, x) * (1 - smoothstep(-150, -110, z)));
  // Cliffs ringing the inlet head below the plateau and the waterfall.
  value = Math.max(value, 1 - smoothstep(34, 70, Math.hypot(x + 104, z - 80)));
  // Inlet south shore below the plateau: short cliffs.
  value = Math.max(value, smoothstep(52, 62, z) * (1 - smoothstep(66, 72, z)) * smoothstep(-260, -200, x) * 0.7);
  const noise = fbm(x * 0.02, z * 0.02, 2, 77);
  return clamp01(value * (0.75 + noise * 0.5));
}

/**
 * Macro relief: Gaussian-weighted blend of authored control heights. Each
 * control is (x, z, height, radius); the blend is smooth, flat at controls and
 * fully deterministic. Detail noise, cliffs, peaks and carving come after.
 */
const MACRO_CONTROLS: readonly (readonly [number, number, number, number])[] = [
  // Village plateau and its aprons
  [0, 0, 18, 70],
  [-45, -40, 18, 40],
  [45, -40, 17.5, 40],
  [55, 25, 18.5, 40],
  [-55, 25, 18, 40],
  [-75, -10, 16, 34],
  // North rim across the gorge and the alpine foothills
  [0, 108, 19.5, 40],
  [-55, 112, 21, 40],
  [50, 112, 20.5, 40],
  [-110, 118, 26, 34],
  [100, 122, 26, 40],
  [125, 150, 37, 40],
  [165, 175, 48, 40],
  [110, 172, 44, 34],
  [60, 160, 32, 45],
  [0, 165, 30, 55],
  [-60, 165, 33, 50],
  [-150, 160, 34, 55],
  [-240, 150, 30, 55],
  [-320, 150, 30, 50],
  [-30, 230, 46, 70],
  [80, 235, 48, 60],
  [-150, 240, 50, 70],
  [-290, 230, 52, 70],
  [0, 310, 60, 70],
  [-120, 320, 66, 70],
  [-280, 330, 70, 70],
  [120, 310, 62, 60],
  [200, 300, 64, 60],
  // Summit, glacier and alpine base region
  [210, 220, 55, 55],
  [270, 230, 58, 50],
  [300, 160, 57, 55],
  [310, 300, 58, 50],
  [360, 330, 72, 50],
  [365, 200, 74, 45],
  [370, 90, 66, 50],
  [255, 120, 50, 45],
  [200, 130, 36, 40],
  // East meadows between the plateau and the eastern massif
  [100, 60, 20, 40],
  [130, 20, 17, 45],
  [160, 60, 24, 40],
  [110, -30, 12, 45],
  [175, -20, 20, 40],
  [340, 0, 56, 50],
  [330, -100, 40, 50],
  [300, -150, 22, 45],
  // Coconut Bay and the south beach
  [90, -120, 4.5, 45],
  [30, -125, 4, 40],
  [150, -120, 6, 40],
  [-40, -130, 4, 40],
  [-100, -150, 3.6, 40],
  // Palm Point lowland west of the village
  [-140, -60, 6, 45],
  [-200, -20, 7.5, 50],
  [-270, -60, 6, 50],
  [-300, 20, 7, 45],
  [-200, 40, 8, 40],
  [-130, 25, 10, 40],
  [-110, -95, 8, 18],
  // Island base and spit
  [-312, -312, 3, 60],
];

function macroHeight(x: number, z: number): number {
  let weighted = 0;
  let total = 0;
  for (const control of MACRO_CONTROLS) {
    const dx = x - control[0];
    const dz = z - control[1];
    const r = control[3];
    const d2 = dx * dx + dz * dz;
    if (d2 > r * r * 12) {
      total += 1e-7;
      weighted += control[2] * 1e-7;
      continue;
    }
    const weight = Math.exp(-d2 / (r * r)) + 1e-7;
    weighted += control[2] * weight;
    total += weight;
  }
  return weighted / total;
}

interface Peak {
  x: number;
  z: number;
  height: number;
  radius: number;
}

/** Hand-placed alpine summits; ridged noise carves crests and couloirs into them. */
const PEAKS: readonly Peak[] = [
  { x: -320, z: 300, height: 86, radius: 110 },
  { x: -190, z: 345, height: 78, radius: 95 },
  { x: -370, z: 185, height: 62, radius: 70 },
  { x: -70, z: 370, height: 84, radius: 90 },
  { x: 55, z: 385, height: 88, radius: 95 },
  { x: 160, z: 350, height: 80, radius: 80 },
  { x: 255, z: 392, height: 92, radius: 85 },
  { x: 390, z: 395, height: 96, radius: 80 },
  { x: 392, z: 260, height: 88, radius: 65 },
  { x: 395, z: 130, height: 80, radius: 60 },
  { x: 392, z: 20, height: 66, radius: 55 },
  { x: 380, z: -80, height: 52, radius: 55 },
  { x: -140, z: 205, height: 54, radius: 55 },
  { x: 30, z: 245, height: 56, radius: 60 },
  { x: 150, z: 285, height: 66, radius: 45 },
];

function peakField(x: number, z: number): number {
  let height = 0;
  for (const peak of PEAKS) {
    const distance = Math.hypot(x - peak.x, z - peak.z);
    if (distance > peak.radius) continue;
    const t = 1 - distance / peak.radius;
    // Concave flanks with a sharp summit read as alpine, not as domes.
    height = Math.max(height, peak.height * Math.pow(t, 1.6));
  }
  return height;
}

/** Eastern rock massif spine: the coaster runs down its west flank. */
const MASSIF_SPINE: readonly Vec3[] = [
  { x: 300, y: 64, z: 120 },
  { x: 296, y: 60, z: 60 },
  { x: 282, y: 52, z: 0 },
  { x: 266, y: 40, z: -70 },
  { x: 250, y: 28, z: -130 },
  { x: 238, y: 14, z: -178 },
];
const MASSIF_BOUNDS = polylineBounds(MASSIF_SPINE, 110);

function massifField(x: number, z: number): number {
  if (!insideBounds(x, z, MASSIF_BOUNDS)) return 0;
  const spine = projectOnPolyline(x, z, MASSIF_SPINE);
  const width = 40 + (fbm(x * 0.03, z * 0.03, 2, 61) - 0.5) * 18;
  const fall = Math.max(0, spine.distance) / width;
  const rough = (ridged(x * 0.035, z * 0.035, 3, 63) - 0.4) * 9;
  return spine.y * Math.max(0, 1 - Math.pow(fall, 1.4) * 0.55) + rough * (1 - Math.min(1, fall));
}

/** Village plateau mesa: sharp cliffs where it meets the lowlands. */
function plateauField(x: number, z: number): number {
  const distance = rectSignedDistance(x, z, -4, -2, 60, 58, 0) - 14;
  const rim = (fbm(x * 0.05, z * 0.05, 3, 13) - 0.5) * 7;
  const cliff = Math.max(0, distance + rim);
  return VILLAGE_HEIGHT + 0.2 - cliff * 1.25;
}

/** The waterfall cliff above the inlet head and the valley-station bluff. */
function bluffField(x: number, z: number): number {
  let height = 0;
  const station = Math.hypot(x + 110, z + 95);
  height = Math.max(height, 8.6 - Math.max(0, station - 15) * 0.5);
  const fall = Math.hypot(x - WATERFALL.top.x, z - (WATERFALL.top.z + 12));
  height = Math.max(height, WATERFALL.top.y + 2.5 - Math.max(0, fall - 16) * 0.3);
  return height;
}

function baseLandHeight(x: number, z: number): number {
  const macro = macroHeight(x, z);
  const altitude = smoothstep(14, 40, macro);
  const detail =
    (fbm(x * 0.022, z * 0.022, 4, 9) - 0.5) * (2.5 + altitude * 12) +
    (fbm(x * 0.07, z * 0.07, 2, 23) - 0.5) * (0.8 + altitude * 2.5);
  let height = macro + detail;
  const crest = ridged(x * 0.009, z * 0.009, 4, 41);
  height += (crest - 0.45) * 14 * smoothstep(30, 60, macro);
  height = smoothMax(height, peakField(x, z) + (crest - 0.5) * 12, 8);
  height = smoothMax(height, massifField(x, z), 5);
  // The plateau is a mesa: inside it, the mesa wins; outside, its cliff drops into the macro relief.
  const mesa = plateauField(x, z);
  if (mesa > height) height = smoothMax(height, mesa, 2);
  height = smoothMax(height, bluffField(x, z), 2);
  return height;
}

/** Applies the beach / cliff profile near the coast and shapes the sea floor. */
function applyCoast(x: number, z: number, land: number, coast: number): number {
  if (coast < 0) {
    const depth = -coast;
    const floor = -0.35 - depth * 0.1 - (fbm(x * 0.03, z * 0.03, 2, 91) - 0.5) * 0.9;
    return Math.max(LAGOON_FLOOR, Math.min(floor, land));
  }
  const island = islandSample(x, z);
  const cliff = cliffinessAt(x, z);
  const slope = lerp(0.085, 1.4, cliff * cliff);
  // The beach profile only shapes the first ~70 m inland; beyond it the land rises freely.
  let limit = 0.35 + Math.min(coast, 70) * slope + Math.max(0, coast - 70) * 3;
  if (island.distance > -2 && island.distance >= mainlandDistance(x, z)) {
    // Island interior: dome to its peak height.
    const dome = island.height * smoothstep(0, island.rocky ? 6 : Math.min(22, island.radius * 0.7), island.distance);
    const rough = island.rocky ? (ridged(x * 0.08, z * 0.08, 2, 97) - 0.3) * 3 : 0;
    return Math.min(limit, 0.3 + dome + rough);
  }
  limit += (fbm(x * 0.06, z * 0.06, 2, 93) - 0.5) * 0.6;
  return Math.min(land, limit);
}

function padMask(x: number, z: number, pad: (typeof TERRAIN_PADS)[number]): number {
  const distance =
    rectSignedDistance(x, z, pad.center.x, pad.center.z, pad.halfSize.x - pad.round, pad.halfSize.z - pad.round, pad.rotationY) -
    pad.round;
  if (distance <= 0) return 1;
  return 1 - smoothstep(0, pad.falloff, distance);
}

function applyPads(x: number, z: number, height: number): number {
  let result = height;
  for (const pad of TERRAIN_PADS) {
    const mask = padMask(x, z, pad);
    if (mask <= 0) continue;
    result = lerp(result, pad.height, mask);
  }
  return result;
}

/** Height of the gorge carve at a point (∞ when outside the gorge). */
export function gorgeCarveHeight(x: number, z: number): number {
  if (x < GORGE.westEnd - 40 || x > GORGE.eastEnd + 8) return Number.POSITIVE_INFINITY;
  const center = GORGE.centerAt(x);
  const dz = Math.abs(z - center);
  if (dz > 60) return Number.POSITIVE_INFINITY;
  const floor = GORGE.floorAt(x);
  const half = GORGE.halfFloorAt(x);
  const outside = Math.max(0, dz - half);
  const ledges = (valueNoise(x * 0.09, z * 0.21, 131) - 0.5) * 2.4;
  const wall = floor + outside / GORGE.wallRun + (outside > 0.5 ? ledges : 0);
  const floorBumps = (fbm(x * 0.08, z * 0.08, 2, 133) - 0.5) * 0.5;
  return Math.max(floor + floorBumps, wall);
}

interface CarvedRoad {
  points: readonly Vec3[];
  halfWidth: number;
  shoulder: number;
  bounds: Bounds2;
  /** Segment buckets (24 m cells) so a query only projects onto nearby segments. */
  cells?: Map<number, number[]>;
  /** Arc-length span that is a bridge (cut only, never filled). */
  bridgeSpan?: { from: number; to: number };
  depth: number;
}

function routeDistances(points: readonly Vec3[]): number[] {
  const result: number[] = [];
  let total = 0;
  for (let index = 0; index < points.length; index += 1) {
    const previous = points[index - 1];
    const point = points[index];
    if (previous && point) total += Math.hypot(point.x - previous.x, point.y - previous.y, point.z - previous.z);
    result.push(total);
  }
  return result;
}

const TANK_ROAD_DISTANCES = routeDistances(TANK_ROAD_POINTS);

function archSpan(): { from: number; to: number } {
  const south = projectOnPolyline(STONE_ARCH.south.x, STONE_ARCH.south.z, TANK_ROAD_POINTS, TANK_ROAD_DISTANCES);
  const north = projectOnPolyline(STONE_ARCH.north.x, STONE_ARCH.north.z, TANK_ROAD_POINTS, TANK_ROAD_DISTANCES);
  return { from: Math.min(south.along, north.along), to: Math.max(south.along, north.along) };
}

const CARVED_ROADS: CarvedRoad[] = [
  {
    points: TANK_ROAD_POINTS,
    halfWidth: TANK_ROAD_WIDTH / 2 + 0.8,
    shoulder: 7,
    bounds: polylineBounds(TANK_ROAD_POINTS, TANK_ROAD_WIDTH + 10),
    bridgeSpan: archSpan(),
    depth: 0.06,
  },
  {
    points: COASTAL_RAMP_POINTS,
    halfWidth: COASTAL_RAMP_WIDTH / 2,
    shoulder: 8,
    bounds: polylineBounds(COASTAL_RAMP_POINTS, COASTAL_RAMP_WIDTH + 12),
    depth: 0.05,
  },
  ...VILLAGE_LANE_POINTS.map((points) => ({
    points,
    halfWidth: VILLAGE_LANE_WIDTH / 2,
    shoulder: 5,
    bounds: polylineBounds(points, VILLAGE_LANE_WIDTH + 8),
    depth: 0.05,
  })),
  // Gorge boardwalks: the wall is only notched (never filled) below the decks.
  ...GORGE_TRAIL_POINTS.map((points) => ({
    points,
    halfWidth: GORGE_TRAIL_WIDTH / 2 + 0.9,
    shoulder: 2.2,
    bounds: polylineBounds(points, GORGE_TRAIL_WIDTH + 6),
    bridgeSpan: { from: -1e9, to: 1e9 },
    depth: 0.45,
  })),
];

const CARVED_ROAD_DISTANCES = CARVED_ROADS.map((road) => routeDistances(road.points));

const ROAD_CELL = 24;
const roadCellKey = (cx: number, cz: number): number => (cx + 64) * 256 + (cz + 64);

for (const road of CARVED_ROADS) {
  const cells = new Map<number, number[]>();
  const reach = road.halfWidth + road.shoulder + 2;
  for (let index = 0; index + 1 < road.points.length; index += 1) {
    const a = road.points[index];
    const b = road.points[index + 1];
    if (!a || !b) continue;
    const minX = Math.floor((Math.min(a.x, b.x) - reach) / ROAD_CELL);
    const maxX = Math.floor((Math.max(a.x, b.x) + reach) / ROAD_CELL);
    const minZ = Math.floor((Math.min(a.z, b.z) - reach) / ROAD_CELL);
    const maxZ = Math.floor((Math.max(a.z, b.z) + reach) / ROAD_CELL);
    for (let cx = minX; cx <= maxX; cx += 1) {
      for (let cz = minZ; cz <= maxZ; cz += 1) {
        const key = roadCellKey(cx, cz);
        const list = cells.get(key) ?? [];
        list.push(index);
        cells.set(key, list);
      }
    }
  }
  road.cells = cells;
}

interface RoadProjection {
  distance: number;
  y: number;
  along: number;
}

const FAR_PROJECTION: RoadProjection = { distance: Number.POSITIVE_INFINITY, y: 0, along: 0 };

/** Closest point on a carved road using its segment buckets. */
function projectOnRoad(road: CarvedRoad, distances: readonly number[] | undefined, x: number, z: number): RoadProjection {
  const segments = road.cells?.get(roadCellKey(Math.floor(x / ROAD_CELL), Math.floor(z / ROAD_CELL)));
  if (!segments) return FAR_PROJECTION;
  let best = FAR_PROJECTION;
  for (const index of segments) {
    const a = road.points[index];
    const b = road.points[index + 1];
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const lengthSquared = dx * dx + dz * dz;
    const t = lengthSquared < 1e-9 ? 0 : Math.min(1, Math.max(0, ((x - a.x) * dx + (z - a.z) * dz) / lengthSquared));
    const distance = Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t));
    if (distance < best.distance) {
      const segmentLength = Math.hypot(dx, b.y - a.y, dz);
      best = { distance, y: a.y + (b.y - a.y) * t, along: (distances?.[index] ?? 0) + segmentLength * t };
    }
  }
  return best;
}

function applyRoads(x: number, z: number, height: number): number {
  let result = height;
  for (let index = 0; index < CARVED_ROADS.length; index += 1) {
    const road = CARVED_ROADS[index];
    if (!road || !insideBounds(x, z, road.bounds)) continue;
    const projection = projectOnRoad(road, CARVED_ROAD_DISTANCES[index], x, z);
    const reach = road.halfWidth + road.shoulder;
    if (projection.distance > reach) continue;
    const target = projection.y - road.depth;
    const weight = 1 - smoothstep(road.halfWidth, reach, projection.distance);
    const onBridge =
      road.bridgeSpan !== undefined &&
      projection.along > road.bridgeSpan.from - 2 &&
      projection.along < road.bridgeSpan.to + 2;
    if (onBridge) {
      // Only cut a clean notch for the arch abutments; keep the ravine open.
      if (result > target) result = lerp(result, target, weight);
      continue;
    }
    result = lerp(result, target, weight);
  }
  return result;
}

/** The full analytic terrain height, before grid sampling. */
export function analyticTerrainHeight(x: number, z: number, coast = coastDistanceAt(x, z)): number {
  let height = baseLandHeight(x, z);
  height = applyCoast(x, z, height, coast);
  height = applyPads(x, z, height);
  const gorge = gorgeCarveHeight(x, z);
  if (gorge < height) height = gorge;
  height = applyRoads(x, z, height);

  // Keep the outer rim readable: never fold below the lagoon floor.
  const edge = Math.max(Math.abs(x), Math.abs(z));
  if (edge > MAP_HALF_SIZE - 6) height = Math.max(height, LAGOON_FLOOR);
  return Math.max(LAGOON_FLOOR - 0.5, height);
}

// ---------------------------------------------------------------------------
// Heightfield grid
// ---------------------------------------------------------------------------

export const GRID_POINTS = MAP_SEGMENTS + 1;
export const CELL_SIZE = MAP_SIZE / MAP_SEGMENTS;

/** World X/Z of a grid column/row. */
export function gridCoordinate(index: number): number {
  return -MAP_HALF_SIZE + index * CELL_SIZE;
}

/** Coast distance at every heightfield vertex (reused by biome classification). */
export const COAST_GRID: Float32Array = new Float32Array(GRID_POINTS * GRID_POINTS);

function buildHeights(): Float32Array {
  const heights = new Float32Array(GRID_POINTS * GRID_POINTS);
  for (let column = 0; column < GRID_POINTS; column += 1) {
    const x = gridCoordinate(column);
    for (let row = 0; row < GRID_POINTS; row += 1) {
      const z = gridCoordinate(row);
      const coast = coastDistanceAt(x, z);
      COAST_GRID[column * GRID_POINTS + row] = coast;
      heights[column * GRID_POINTS + row] = analyticTerrainHeight(x, z, coast);
    }
  }
  return heights;
}

/**
 * Immutable base heightfield, column-major (`column * GRID_POINTS + row`),
 * column = X index, row = Z index. Craters later copy and edit this.
 */
export const BASE_HEIGHTS: Float32Array = buildHeights();

export function gridHeight(column: number, row: number): number {
  const c = Math.min(GRID_POINTS - 1, Math.max(0, column));
  const r = Math.min(GRID_POINTS - 1, Math.max(0, row));
  return BASE_HEIGHTS[c * GRID_POINTS + r] ?? 0;
}

/**
 * Height of the triangulated heightfield. Each cell is split along the
 * (x0, z0)–(x1, z1) diagonal like the client mesh, so the walkable surface,
 * the rendered surface and this query agree.
 */
export function sampleMapHeight(x: number, z: number): number {
  const normalizedX = clamp01((x + MAP_HALF_SIZE) / MAP_SIZE) * MAP_SEGMENTS;
  const normalizedZ = clamp01((z + MAP_HALF_SIZE) / MAP_SIZE) * MAP_SEGMENTS;
  const column = Math.min(MAP_SEGMENTS - 1, Math.floor(normalizedX));
  const row = Math.min(MAP_SEGMENTS - 1, Math.floor(normalizedZ));
  const fx = normalizedX - column;
  const fz = normalizedZ - row;
  const h00 = BASE_HEIGHTS[column * GRID_POINTS + row] ?? 0;
  const h10 = BASE_HEIGHTS[(column + 1) * GRID_POINTS + row] ?? 0;
  const h01 = BASE_HEIGHTS[column * GRID_POINTS + row + 1] ?? 0;
  const h11 = BASE_HEIGHTS[(column + 1) * GRID_POINTS + row + 1] ?? 0;
  if (fx >= fz) return h00 + fx * (h10 - h00) + fz * (h11 - h10);
  return h00 + fz * (h01 - h00) + fx * (h11 - h01);
}

export function terrainNormalAt(x: number, z: number): Vec3 {
  const sample = 1.6;
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

/** Slope angle in radians. */
export function terrainSlopeAt(x: number, z: number): number {
  const normal = terrainNormalAt(x, z);
  return Math.acos(Math.min(1, Math.max(-1, normal.y)));
}

export function groundPosition(x: number, z: number, offset = 0): Vec3 {
  return { x, y: sampleMapHeight(x, z) + offset, z };
}

// ---------------------------------------------------------------------------
// Biomes, surface tags and snow
// ---------------------------------------------------------------------------

/** Surface mix at a terrain point; the client paints with it, the server tags with it. */
export interface TerrainBiome {
  /** Beach / dune sand weight 0…1. */
  sand: number;
  /** Cobbles of the square, the tank road and the lanes. */
  cobble: number;
  /** Packed earth of trails and the gorge floor. */
  dirt: number;
  /** Per-vertex snow altitude bias in metres (noise + exposure). */
  snowBias: number;
  /** Rock exposure from slope 0…1. */
  rock: number;
}

const COBBLE_ROADS = CARVED_ROADS.slice(0, CARVED_ROADS.length - GORGE_TRAIL_POINTS.length);

function roadInfluence(x: number, z: number, roads: readonly CarvedRoad[], extra: number): number {
  let best = 0;
  for (const road of roads) {
    if (!insideBounds(x, z, road.bounds)) continue;
    const projection = projectOnRoad(road, undefined, x, z);
    const weight = 1 - smoothstep(road.halfWidth - 0.6, road.halfWidth + extra, projection.distance);
    if (weight > best) best = weight;
  }
  return best;
}

export function terrainBiomeAt(
  x: number,
  z: number,
  height: number,
  slope: number,
  coast = coastDistanceAt(x, z),
): TerrainBiome {
  const lowland = 1 - smoothstep(6.5, 9.5, height);
  const nearCoast = 1 - smoothstep(28 + (fbm(x * 0.03, z * 0.03, 2, 207) - 0.5) * 24, 46, coast);
  let sand = lowland * nearCoast;
  // The gorge floor is gravel, not beach.
  const inGorge = gorgeCarveHeight(x, z) <= height + 0.5 && x > GORGE.westEnd + 20;
  if (inGorge) sand = 0;
  // The coastal ramp is packed sand.
  const ramp = roadInfluence(x, z, [CARVED_ROADS[1] as CarvedRoad], 1.5);
  sand = Math.max(sand, ramp);
  // Lagoon base: sandy launch strip from the bamboo garage door to the boat dock.
  if (x < -250 && z < -240) {
    const strip = capsuleSignedDistance(x, z, -318, -326, -305, -272, 4.5);
    sand = Math.max(sand, 1 - smoothstep(-1, 1.5, strip));
  }

  const square = 1 - smoothstep(SQUARE_HALF - 0.5, SQUARE_HALF + 1.5, Math.max(Math.abs(x), Math.abs(z)));
  const lanes = roadInfluence(x, z, COBBLE_ROADS.filter((_, index) => index !== 1), 1);
  let cobble = Math.max(square, lanes * (1 - ramp));
  if (height > SNOWLINE_HEIGHT + 6) cobble *= 0.35;

  const trails = roadInfluence(x, z, CARVED_ROADS.slice(CARVED_ROADS.length - GORGE_TRAIL_POINTS.length), 0.8);
  const dirt = Math.max(trails, inGorge ? 0.85 : 0);

  const exposure = (fbm(x * 0.045, z * 0.045, 3, 211) - 0.5) * 7;
  const snowBias = exposure + (slope > 0.6 ? 2.5 : 0);
  const rock = smoothstep(0.62, 0.78, slope);
  return { sand: clamp01(sand), cobble: clamp01(cobble), dirt: clamp01(dirt), snowBias, rock };
}

/**
 * Snow cover weight for a snowline. CPU and any future weather shader share
 * this formula: smoothstep over a 3 m band, biased per vertex, reduced on
 * steep rock faces.
 */
export function terrainSnowWeight(height: number, snowBias: number, rock: number, snowline: number): number {
  const altitude = smoothstep(snowline - 1.5, snowline + 1.5, height + snowBias);
  return altitude * (1 - rock * 0.85);
}

export const ICE_PATCHES = ICE_PATCH_LAYOUT.map((patch) => ({ ...patch }));

export function isOnIcePatch(x: number, z: number): boolean {
  for (const patch of ICE_PATCHES) {
    if (Math.hypot(x - patch.x, z - patch.z) <= patch.radius) return true;
  }
  return false;
}

const TAG_CODES: readonly SurfaceTag[] = [
  'water',
  'sand',
  'grass_mud',
  'cobblestone',
  'snow',
  'ice_patch',
  'rock_cliff',
  'wood',
];

function classifyTerrain(x: number, z: number, coast: number): SurfaceTag {
  const height = sampleMapHeight(x, z);
  if (height < WATER_LEVEL - 0.15) return 'water';
  const slope = terrainSlopeAt(x, z);
  if (slope > 0.68) return 'rock_cliff';
  if (isOnIcePatch(x, z)) return 'ice_patch';
  const biome = terrainBiomeAt(x, z, height, slope, coast);
  if (biome.cobble > 0.5) return 'cobblestone';
  if (biome.sand > 0.5) return 'sand';
  if (terrainSnowWeight(height, biome.snowBias, biome.rock, SNOWLINE_HEIGHT) > 0.5) return 'snow';
  return 'grass_mud';
}

/** Precomputed base surface tags on the heightfield grid (cheap per-tick lookups). */
const SURFACE_GRID: Uint8Array = (() => {
  const grid = new Uint8Array(GRID_POINTS * GRID_POINTS);
  for (let column = 0; column < GRID_POINTS; column += 1) {
    const x = gridCoordinate(column);
    for (let row = 0; row < GRID_POINTS; row += 1) {
      const z = gridCoordinate(row);
      grid[column * GRID_POINTS + row] = TAG_CODES.indexOf(classifyTerrain(x, z, COAST_GRID[column * GRID_POINTS + row] ?? 0));
    }
  }
  return grid;
})();

/** Terrain-only surface tag from the precomputed grid. */
export function terrainSurfaceTagAt(x: number, z: number): SurfaceTag {
  const column = Math.round(clamp01((x + MAP_HALF_SIZE) / MAP_SIZE) * MAP_SEGMENTS);
  const row = Math.round(clamp01((z + MAP_HALF_SIZE) / MAP_SIZE) * MAP_SEGMENTS);
  const code = SURFACE_GRID[column * GRID_POINTS + row] ?? 2;
  if (isOnIcePatch(x, z)) return 'ice_patch';
  return TAG_CODES[code] ?? 'grass_mud';
}
