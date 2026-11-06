/** Authored compact terrain and solid routes for the PHOTO arena.
 * Rendering, prediction and authority consume this same compact blueprint. */
import type { CableCarRoute, HeightfieldData, MapProp, NavGraph, StaticWorldDefinition, SurfaceTag } from '../types/map.js';
import type { Vec3 } from '../types/index.js';
import { boxCollider, buildingColliders, chaletLayout, rampCollider, roofBase, stairCollider } from './map/buildings.js';
import { sampleHeightfield } from './map/heightfield.js';
import { makeRoute } from './map/math.js';
import { CABLE_BRAKE_HANDLE } from './map/layout.js';
export const ARENA_SIZE = 128;
export const ARENA_SEGMENTS = 256;
export const ARENA_LEVELS = { foreground: 23, bank: 18.4, north: 28, beach: 1.8, seaFloor: -6 } as const;
export const ARENA_ANCHORS = { alpine: { x: 0, z: -20 }, lagoon: { x: 23, z: 9 }, preview: { x: 0, z: -24 }, chalet: { x: -20, z: 14 }, crawler: { x: 18, z: 7 }, sidecar: { x: 10, z: -22 } } as const;
const smooth = (a: number, b: number, value: number) => { const t = Math.max(0, Math.min(1, (value - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Positive inside a rounded shelf. Overlapping shelves keep route seams solid. */
function shelfDistance(x: number, z: number, x0: number, x1: number, z0: number, z1: number): number {
  const r = 1.8, qx = Math.abs(x - (x0 + x1) / 2) - ((x1 - x0) / 2 - r), qz = Math.abs(z - (z0 + z1) / 2) - ((z1 - z0) / 2 - r);
  return r - Math.hypot(Math.max(0, qx), Math.max(0, qz)) - Math.min(0, Math.max(qx, qz));
}
function peak(x: number, z: number, cx: number, cz: number, radius: number, height: number): number {
  const t = Math.max(0, 1 - ((x - cx) ** 2 + (z - cz) ** 2) / (radius * radius));
  return height * t * t * t;
}
function bankTop(x: number, z: number): number {
  // Straight grades match the two long stair ramps, including their landings.
  const grade = lerp(ARENA_LEVELS.foreground, ARENA_LEVELS.bank, Math.max(0, Math.min(1, (z + 20) / 14)));
  const low = z < -15 ? lerp(ARENA_LEVELS.foreground, grade, smooth(8, 12, Math.abs(x))) : grade;
  const plateau = lerp(low, ARENA_LEVELS.north, smooth(x < -21 ? 31 : 24, x < -21 ? 45 : 40, z));
  const clearRoute = Math.abs(x+18)<3 || Math.abs(x-20)<3 || (Math.abs(x+20)<9&&Math.abs(z-14)<8);
  const drifts=clearRoute?0:peak(x,z,7,-26,5,1.2)+peak(x,z,-10,-25,5,1.1)+peak(x,z,27,-20,5,1.4)
    +peak(x,z,-30,-9,4,1.2)+peak(x,z,31,-1,3.5,1.5)+peak(x,z,-6,32,3,1.4);
  return plateau + drifts + peak(x, z, -31, 42, 6, 12) + peak(x, z, -15, 42, 8, 9) + peak(x, z, 29, 35, 7, 10);
}
function analyticHeight(x: number, z: number): number {
  const wave = Math.sin(z * .31) * .55 * smooth(3, 8, Math.abs(z));
  const d = Math.max(shelfDistance(x, z, -35, 35, -30, -16), shelfDistance(x, z, -35, -10 + wave, -20, 38), shelfDistance(x, z, 10 + wave, 34, -20, 38), shelfDistance(x, z, -35, 35, 28, 47));
  const land = lerp(ARENA_LEVELS.seaFloor, bankTop(x, z), smooth(0, 1.25, d));
  const coast = lerp(ARENA_LEVELS.seaFloor, ARENA_LEVELS.beach, smooth(0, 1.5, shelfDistance(x, z, 32, 51, 3, 35)));
  return Math.max(land, coast);
}
const heights = new Float32Array((ARENA_SEGMENTS + 1) ** 2);
for (let col = 0; col <= ARENA_SEGMENTS; col++)
  for (let row = 0; row <= ARENA_SEGMENTS; row++)
    heights[col * (ARENA_SEGMENTS + 1) + row] = analyticHeight(-ARENA_SIZE / 2 + col * ARENA_SIZE / ARENA_SEGMENTS, -ARENA_SIZE / 2 + row * ARENA_SIZE / ARENA_SEGMENTS);
export const ARENA_GRID: HeightfieldData = { size: ARENA_SIZE, segments: ARENA_SEGMENTS, heights };
export function arenaHeightAt(x: number, z: number): number { return sampleHeightfield(ARENA_GRID, x, z); }
export const ARENA_BRIDGE_POINTS: readonly Vec3[] = [{ x: -12, y: 18.4, z: 0 }, { x: -6, y: 17.4, z: 0 }, { x: 0, y: 16.9, z: 0 }, { x: 6, y: 17.4, z: 0 }, { x: 12, y: 18.4, z: 0 }];
export const ARENA_BRIDGE_WIDTH = 4.6;
export const ARENA_BRIDGE: readonly MapProp[] = ARENA_BRIDGE_POINTS.slice(0, -1).map((a, i) => {
  const b = ARENA_BRIDGE_POINTS[i + 1]!, length = b.x - a.x, dy = b.y - a.y;
  return { id: `arena_bridge_${i}`, kind: 'bridge_deck', position: a, rotationY: Math.PI / 2, scale: 1, variant: i,
    dimensions: { x: ARENA_BRIDGE_WIDTH, y: dy, z: length },
    colliders: [rampCollider({ x: 0, y: 0, z: 0 }, { x: 0, y: dy, z: length }, ARENA_BRIDGE_WIDTH, .35, { surface: 'wood' })] };
});
export function arenaBridgeHeightAt(x: number, z: number): number | null {
  if (Math.abs(z) > ARENA_BRIDGE_WIDTH / 2 || x < -12 || x > 12)
    return null;
  for (let i = 0; i < ARENA_BRIDGE_POINTS.length - 1; i++) {
    const a = ARENA_BRIDGE_POINTS[i]!, b = ARENA_BRIDGE_POINTS[i + 1]!;
    if (x >= a.x && x <= b.x)
      return lerp(a.y, b.y, (x - a.x) / (b.x - a.x));
  }
  return null;
}
const baseLayout = chaletLayout({ style: 'log_chalet', width: 13, depth: 10, snow: true, doorOffset: -2.2, nameKey: 'world.buildings.bakery' });
const layout = { ...baseLayout, balcony: { ...baseLayout.balcony!, sides: ['front', 'right'] as const } };
export const ARENA_CHALET: MapProp = { id: 'arena_chalet', kind: 'chalet', position: { ...ARENA_ANCHORS.chalet, y: ARENA_LEVELS.bank }, rotationY: Math.PI, scale: 1, variant: 3,
  building: layout, destructibleId: 'building_chalet_north', colliders: buildingColliders(layout, 'building_chalet_north') };
/** Render these explicit solid steps from their dimensions, including side door. */
const chaletSteps: MapProp[] = [{ x: 2.2, z: -5.55, width: 2.4, depth: 1.1 }, { x: -7.05, z: -3, width: 1.1, depth: 2.4 }].map((p, i) => ({
  id: `arena_chalet_step_${i}`, kind: 'stairs', position: { x: ARENA_CHALET.position.x + p.x, y: ARENA_LEVELS.bank, z: ARENA_CHALET.position.z + p.z },
  rotationY: 0, scale: 1, variant: 0, dimensions: { x: p.width, y: layout.plinth / 2, z: p.depth },
  colliders: [boxCollider(p.width / 2, layout.plinth / 4, p.depth / 2, 0, layout.plinth / 4, 0, { surface: 'cobblestone' })],
}));
export const ARENA_ACCESS_FLIGHTS = [
  { id: 'west', from: { x: -18, y: 23.08, z: -20 }, to: { x: -18, y: 18.48, z: -6 }, width: 3 },
  { id: 'east', from: { x: 20, y: 23.08, z: -20 }, to: { x: 20, y: 18.48, z: -6 }, width: 3 },
  { id: 'coast_upper', from: { x: 32.5, y: 18.48, z: 14 }, to: { x: 45, y: 10.1, z: 14 }, width: 3 },
  { id: 'coast_lower', from: { x: 46.5, y: 10.1, z: 15.5 }, to: { x: 46.5, y: 1.88, z: 28 }, width: 3 },
] as const;
const access: MapProp[] = ARENA_ACCESS_FLIGHTS.map(f => ({ id: `arena_stairs_${f.id}`, kind: 'stairs', position: { x: 0, y: 0, z: 0 }, rotationY: 0, scale: 1, variant: 0,
  path: [f.from, f.to], colliders: [stairCollider(f.from.y < f.to.y ? f.from : f.to, f.from.y < f.to.y ? f.to : f.from, f.width, { surface: 'wood' })] }));
/** The same centre lines describe the visible stair rails and their solid shapes. */
export const ARENA_HANDRAILS: readonly MapProp[] = ARENA_ACCESS_FLIGHTS.flatMap(f => {
  const dx = f.to.x - f.from.x, dz = f.to.z - f.from.z, length = Math.hypot(dx, dz);
  return [-1, 1].map(side => {
    const path = Array.from({ length: 5 }, (_, i) => { const t = i / 4; return { x: f.from.x + dx * t + dz / length * 1.6 * side, y: lerp(f.from.y, f.to.y, t), z: f.from.z + dz * t - dx / length * 1.6 * side }; });
    return { id: `arena_rail_${f.id}_${side}`, kind: 'fence' as const, position: { x: 0, y: 0, z: 0 }, rotationY: 0, scale: 1, variant: 0, path,
      colliders: [rampCollider({ ...path[0]!, y: path[0]!.y + 1.05 }, { ...path[4]!, y: path[4]!.y + 1.05 }, .13, .13, { surface: 'wood' }),
        ...path.map(p => ({ type: 'cylinder' as const, radius: .085, halfHeight: .65, offset: { ...p, y: p.y + .45 }, surface: 'wood' as const }))] };
  });
});
export function arenaSurfaceAt(x: number, z: number, feetY = arenaHeightAt(x, z)): SurfaceTag {
  const bridge = arenaBridgeHeightAt(x, z);
  if (bridge !== null && Math.abs(feetY - bridge) < 1)
    return 'wood';
  const p = ARENA_CHALET.position;
  if (Math.abs(x - p.x) < layout.width / 2 + .1 && Math.abs(z - p.z) < layout.depth / 2 + .1 && feetY > p.y + .2)
    return feetY >= p.y + roofBase(layout) ? 'snow' : 'wood';
  for (const f of ARENA_ACCESS_FLIGHTS) {
    const dx = f.to.x - f.from.x, dz = f.to.z - f.from.z, length2 = dx * dx + dz * dz;
    const t = ((x - f.from.x) * dx + (z - f.from.z) * dz) / length2;
    if (t >= 0 && t <= 1 && Math.hypot(x - f.from.x - dx * t, z - f.from.z - dz * t) < f.width / 2 && Math.abs(feetY - lerp(f.from.y, f.to.y, t)) < .6)
      return 'wood';
  }
  if (Math.abs(x - 46.5) < 1.6 && Math.abs(z - 14) < 1.6 && Math.abs(feetY - 10.1) < .5)
    return 'wood';
  const h = arenaHeightAt(x, z);
  if (h < .5 && feetY < 2)
    return 'water';
  if (x > 33 && h < 4)
    return z > 22 ? 'grass_mud' : 'sand';
  return 'snow';
}
const stops: readonly Vec3[] = [{ x: -27, y: 18.4, z: 26 }, { x: 0, y: 28, z: 40 }, { x: 27, y: 18.4, z: 18 }];
const floorPoints: Vec3[] = [];
for (let leg = 0; leg < 2; leg++)
  for (let i = leg === 0 ? 0 : 1; i <= 32; i++) {
    const a = stops[leg]!, b = stops[leg + 1]!, t = i / 32;
    const x = lerp(a.x, b.x, t), z = lerp(a.z, b.z, t), yaw = Math.atan2(b.x - a.x, b.z - a.z);
    const envelope = Math.max(...[-3.5, 0, 3.5].flatMap(side => [-1.8, 0, 1.8].map(along => arenaHeightAt(x + Math.cos(yaw) * side + Math.sin(yaw) * along, z - Math.sin(yaw) * side + Math.cos(yaw) * along))));
    floorPoints.push({ x, y: Math.max(lerp(a.y, b.y, t) + Math.sin(t * Math.PI) * 1.6, envelope + Math.sin(t * Math.PI) * .6), z });
  }
const gondolaPath = makeRoute('arena_cabin_floor', floorPoints);
export const ARENA_CABLE: CableCarRoute = {
  gondolaPath, cable: makeRoute('arena_haul_rope', floorPoints.map(p => ({ ...p, y: p.y + 4 }))),
  stations: stops.map((platform, i) => {
    const a = stops[i === 2 ? 1 : i]!, b = stops[i === 2 ? 2 : i + 1]!, yaw = Math.atan2(b.x - a.x, b.z - a.z);
    const brakeBase = { x: platform.x + Math.cos(yaw) * 4.3, y: platform.y, z: platform.z - Math.sin(yaw) * 4.3 };
    return { id: (['valley', 'mid', 'mountain'] as const)[i]!, labelKey: (['world.stations.valley', 'world.stations.mid', 'world.stations.mountain'] as const)[i]!,
      platform, brakeBase, brakeLever: { x: brakeBase.x + Math.sin(yaw) * CABLE_BRAKE_HANDLE.length * Math.sin(CABLE_BRAKE_HANDLE.angle), y: brakeBase.y + CABLE_BRAKE_HANDLE.hinge + CABLE_BRAKE_HANDLE.length * Math.cos(CABLE_BRAKE_HANDLE.angle), z: brakeBase.z + Math.cos(yaw) * CABLE_BRAKE_HANDLE.length * Math.sin(CABLE_BRAKE_HANDLE.angle) }, pathDistance: gondolaPath.distances[i * 32]! };
  }), pylons: [], gondolas: 2, legSeconds: 12, hangerLength: 4,
};
export const ARENA_STATION_PROPS: readonly MapProp[] = ARENA_CABLE.stations.map((station, i) => {
  const a = stops[i === 2 ? 1 : i]!, b = stops[i === 2 ? 2 : i + 1]!;
  return { id: `arena_station_${station.id}`, kind: 'cable_station', position: station.platform, rotationY: Math.atan2(b.x - a.x, b.z - a.z), scale: 1, variant: i,
    dimensions: { x: 10, y: 0, z: 6 }, colliders: [boxCollider(5, .18, 3, 0, -.18, 0, { surface: 'wood' }), boxCollider(5, .12, 3.3, 0, 5.52, 0, { surface: 'wood' }),
      ...[-1, 1].flatMap(side => [-1, 1].map(end => boxCollider(.14, 2.6, .14, side * 4.6, 2.6, end * 2.5, { surface: 'wood' })))] };
});
const trees: MapProp[] = [];
for (const [kind, points] of [['fir', [[-31, -20], [-27, -9], [-32, 0], [-29, 7], [-32, 25], [-23, 30], [-25, 36], [-19, 38], [-10, 38], [-7, 43], [8, 40], [14, 38], [22, 31], [29, 30], [-30, -26], [-23, -27], [-11, -26]]],
  ['palm', [[38, 7], [40, 14], [49, 10], [37, 28], [42, 32], [49, 30], [47, 22], [40, 24], [37, 18]]]] as const) {
  points.forEach(([x, z], i) => trees.push({ id: `arena_${kind}_${i}`, kind, position: { x, y: arenaHeightAt(x, z), z }, rotationY: i * 2.13, scale: kind === 'fir' ? .72 + (i % 3) * .1 : .9 + (i % 3) * .12, variant: i % 3,
    surface: kind === 'fir' ? 'snow' : 'sand', colliders: [{ type: 'cylinder', radius: kind === 'fir' ? .28 : .22, halfHeight: kind === 'fir' ? 2.8 : 3.5, offset: { x: 0, y: kind === 'fir' ? 2.8 : 3.5, z: 0 }, surface: 'wood' }] }));
}
export const ARENA_NATURE: readonly MapProp[] = trees;
const fencePath = Array.from({ length: 11 }, (_, i) => { const x = -12 + i * 2.4, z = -17.7; return { x, y: arenaHeightAt(x, z), z }; });
export const ARENA_FENCE: MapProp = { id: 'arena_foreground_fence', kind: 'fence', position: { x: 0, y: 0, z: 0 }, rotationY: 0, scale: 1, variant: 0, path: fencePath, colliders: [...fencePath.map(p => ({ type: 'cylinder' as const, radius: .105, halfHeight: .67, offset: { ...p, y: p.y + .55 }, surface: 'wood' as const })), ...fencePath.slice(0, -1).flatMap((a, i) => { const b = fencePath[i + 1]!; return [.45, 1.08].map(height => rampCollider({ ...a, y: a.y + height }, { ...b, y: b.y + height }, .16, .16, { surface: 'wood' })); })] };
const landing: MapProp = { id: 'arena_coast_landing', kind: 'stairs', position: { x: 46.5, y: 9.85, z: 14 }, rotationY: 0, scale: 1, variant: 0, dimensions: { x: 3, y: .25, z: 3 }, colliders: [boxCollider(1.5, .125, 1.5, 0, .125, 0, { surface: 'wood' })] };
export const ARENA_SOLID_PROPS: readonly MapProp[] = [ARENA_CHALET, ARENA_FENCE, ...ARENA_HANDRAILS, landing, ...chaletSteps, ...ARENA_BRIDGE, ...access, ...ARENA_STATION_PROPS, ...trees];
export const ARENA_GEOMETRY: StaticWorldDefinition = { ...ARENA_GRID, props: ARENA_SOLID_PROPS, heightAt: arenaHeightAt, surfaceAt: arenaSurfaceAt, cableCar: ARENA_CABLE };
// Every edge follows ground, a bridge segment or one explicit stair flight.
const navCoordinates = [[-18, -20], [0, -20], [20, -20], [-18, -19], [20, -19], [-18, -6], [20, -6], [-12, 0], [-6, 0], [0, 0], [6, 0], [12, 0],
  [-18, 6], [-28, 7], [-27, 26], [-28, 24], [-18, 24], [-10, 24], [-10, 34], [0, 40], [10, 34], [20, 24], [28, 24], [27, 18], [20, 8], [32, 14],
  [46.5, 14], [46.5, 28], [40, 28], [40, 12]] as const;
export const ARENA_NAV: NavGraph = { nodes: navCoordinates.map(([x, z], id) => ({ id, position: { x, y: arenaBridgeHeightAt(x, z) ?? (id === 26 ? 10.1 : arenaHeightAt(x, z)), z }, zone: 'village' })),
  edges: [[0, 1], [1, 2], [0, 3], [2, 4], [3, 5], [4, 6], [5, 7], [7, 8], [8, 9], [9, 10], [10, 11], [11, 6], [5, 12], [12, 13], [13, 14], [14, 15], [15, 16], [16, 17], [17, 18], [18, 19], [19, 20], [20, 21], [21, 22], [22, 23], [23, 24], [24, 6], [24, 25], [25, 26], [26, 27], [27, 28], [28, 29]] };
