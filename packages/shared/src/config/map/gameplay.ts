/**
 * Gameplay data of Fjord Fiesta: weather towers with capture zones and spawn
 * pads, faction bases, vehicle and toy spawn points, zones and the bot
 * waypoint graph. Pure data: behaviour lives in the server and later packages.
 */
import type { Faction, Vec3 } from '../../types/index.js';
import type {
  FactionBase,
  TowerAttachPoint,
  MapZone,
  NavGraph,
  NavNode,
  SpawnPoint,
  TowerDefinition,
  TowerId,
  VehicleSpawnPoint,
  ZoneId,
} from '../../types/map.js';
import {
  ALPINE_BASE_POSITION,
  BRIDGE_NORTH,
  BRIDGE_SOUTH,
  CABLE_CAR_STATIONS,
  COASTAL_RAMP_POINTS,
  GORGE,
  GORGE_TRAILS,
  GORGE_WALKWAY_HEIGHT,
  HARBOR_DECK_HEIGHT,
  LAGOON_BASE_POSITION,
  TANK_ROAD_POINTS,
  TOWER_A_POSITION,
  TOWER_B_POSITION,
  TOWER_C_POSITION,
  VILLAGE_HEIGHT,
  VILLAGE_LANE_CONTROL,
} from './layout.js';
import { localToWorld, vec3, yawTowards } from './math.js';
import {
  bridgeDeckHeightAt,
  CHALET_PLACEMENTS,
  HARBOR_STEPS,
  HARBOR_STEPS_RUN,
  LIGHTHOUSE,
  PAVILION,
  PIER_LAYOUTS,
  SUMMIT_CLOCK_HOUSE,
  SUMMIT_YAW,
} from './structures.js';
import { dairyFortressLayout } from './buildings.js';
import { sampleMapHeight } from './terrain.js';

const ground = (x: number, z: number, offset = 0): Vec3 => vec3(x, sampleMapHeight(x, z) + offset, z);

function pad(id: string, position: Vec3, faction: Faction, zone: ZoneId, source: TowerId | 'base', facing: Vec3): SpawnPoint {
  return { id, position: { ...position }, rotationY: yawTowards(position, facing), zone, faction, source };
}

const CAPTURE_RADIUS = 16;

function towerPads(tower: TowerId, faction: Faction, zone: ZoneId, positions: readonly Vec3[], facing: Vec3): SpawnPoint[] {
  return positions.map((position, index) => pad(`${tower}_pad_${index}`, position, faction, zone, tower, facing));
}

/** Pads exist for both factions at every tower; only the holder's set is eligible. */
function bothFactions(tower: TowerId, zone: ZoneId, positions: readonly Vec3[], facing: Vec3): SpawnPoint[] {
  return [
    ...towerPads(tower, 'alpine', zone, positions, facing).map((spawn) => ({ ...spawn, id: `${spawn.id}_alpine` })),
    ...towerPads(tower, 'lagoon', zone, positions, facing).map((spawn) => ({ ...spawn, id: `${spawn.id}_lagoon` })),
  ];
}

const A = TOWER_A_POSITION;
const harborPads: Vec3[] = Array.from({ length: 6 }, (_, index) => {
  const angle = (index / 6) * Math.PI * 2 + 0.3;
  return vec3(A.x + Math.sin(angle) * 11.5, HARBOR_DECK_HEIGHT + 0.05, A.z + Math.cos(angle) * 11.5);
});
const villagePads: Vec3[] = [
  vec3(-20, VILLAGE_HEIGHT + 0.05, 36),
  vec3(22, VILLAGE_HEIGHT + 0.05, 38),
  vec3(38, VILLAGE_HEIGHT + 0.05, -16),
  vec3(-40, VILLAGE_HEIGHT + 0.05, 4),
  vec3(14, VILLAGE_HEIGHT + 0.05, -38),
  vec3(-30, VILLAGE_HEIGHT + 0.05, -38),
];
// Pads keep open sky and camera room: clear of the mountain cable-car station
// (west of the porch) and of the porch eaves (audited by test/spawn.test.ts).
const summitPads: Vec3[] = [
  [-6, 21],
  [-9, 17],
  [11, 15],
  [-19, 2],
  [19, 2],
  [0, -16],
].map(([lx, lz]) => {
  const world = localToWorld(TOWER_C_POSITION, SUMMIT_YAW, vec3(lx ?? 0, 0, lz ?? 0));
  return ground(world.x, world.z, 0.05);
});

const summitLocal = (x: number, y: number, z: number): Vec3 => localToWorld(TOWER_C_POSITION, SUMMIT_YAW, vec3(x, y, z));
const fortress = dairyFortressLayout();

const TOWER_A_ATTACH: TowerAttachPoint[] = [
  { id: 'dome_top', position: vec3(A.x, HARBOR_DECK_HEIGHT + LIGHTHOUSE.galleryHeight + LIGHTHOUSE.lanternHeight + LIGHTHOUSE.domeHeight, A.z), rotationY: 0 },
  { id: 'gallery_ring', position: vec3(A.x, HARBOR_DECK_HEIGHT + LIGHTHOUSE.galleryHeight, A.z), rotationY: 0, radius: LIGHTHOUSE.galleryRadius },
  { id: 'platform_ring', position: vec3(A.x, HARBOR_DECK_HEIGHT, A.z), rotationY: 0, radius: 16 },
];
const TOWER_B_ATTACH: TowerAttachPoint[] = [
  {
    id: 'roof_peak',
    position: vec3(TOWER_B_POSITION.x, VILLAGE_HEIGHT + PAVILION.houseBottom + PAVILION.houseHeight + PAVILION.roofHeight, TOWER_B_POSITION.z),
    rotationY: 0,
  },
  {
    id: 'clock_face',
    position: vec3(TOWER_B_POSITION.x, VILLAGE_HEIGHT + PAVILION.houseBottom + PAVILION.houseHeight / 2, TOWER_B_POSITION.z),
    rotationY: 0,
    radius: PAVILION.houseSize / 2,
  },
  { id: 'fountain_basin', position: vec3(TOWER_B_POSITION.x, VILLAGE_HEIGHT + PAVILION.basinHeight, TOWER_B_POSITION.z), rotationY: 0, radius: PAVILION.basinRadius },
];
const TOWER_C_ATTACH: TowerAttachPoint[] = [
  {
    id: 'roof_ridge',
    position: summitLocal(
      SUMMIT_CLOCK_HOUSE.center.x,
      SUMMIT_CLOCK_HOUSE.base + SUMMIT_CLOCK_HOUSE.height + SUMMIT_CLOCK_HOUSE.roofHeight,
      SUMMIT_CLOCK_HOUSE.center.z,
    ),
    rotationY: SUMMIT_YAW,
  },
  {
    id: 'clock_face',
    position: summitLocal(
      SUMMIT_CLOCK_HOUSE.center.x,
      SUMMIT_CLOCK_HOUSE.base + SUMMIT_CLOCK_HOUSE.height * 0.62,
      SUMMIT_CLOCK_HOUSE.center.z + SUMMIT_CLOCK_HOUSE.depth / 2 + 0.2,
    ),
    rotationY: SUMMIT_YAW,
    radius: 2.6,
  },
  { id: 'terrace', position: summitLocal(0, 10, fortress.depth / 2 - 2.6), rotationY: SUMMIT_YAW },
  { id: 'balcony_ring', position: summitLocal(0, 5, 0), rotationY: SUMMIT_YAW, radius: fortress.width / 2 + 1.3 },
];

export const FJORD_TOWERS: readonly TowerDefinition[] = [
  {
    id: 'tower_a',
    labelKey: 'world.towers.a',
    position: { ...TOWER_A_POSITION },
    captureRadius: CAPTURE_RADIUS,
    homeFaction: 'lagoon',
    spawnPads: bothFactions('tower_a', 'harbor', harborPads, TOWER_A_POSITION),
    zone: 'harbor',
    attachPoints: TOWER_A_ATTACH,
  },
  {
    id: 'tower_b',
    labelKey: 'world.towers.b',
    position: { ...TOWER_B_POSITION },
    captureRadius: CAPTURE_RADIUS,
    homeFaction: null,
    spawnPads: bothFactions('tower_b', 'village', villagePads, TOWER_B_POSITION),
    zone: 'village',
    attachPoints: TOWER_B_ATTACH,
  },
  {
    id: 'tower_c',
    labelKey: 'world.towers.c',
    position: { ...TOWER_C_POSITION },
    captureRadius: CAPTURE_RADIUS,
    homeFaction: 'alpine',
    spawnPads: bothFactions('tower_c', 'summit', summitPads, TOWER_C_POSITION),
    zone: 'summit',
    attachPoints: TOWER_C_ATTACH,
  },
];

function basePads(faction: Faction, center: Vec3, zone: ZoneId, facing: Vec3): SpawnPoint[] {
  return Array.from({ length: 6 }, (_, index) => {
    const angle = (index / 6) * Math.PI * 2 + 0.5;
    const position = ground(center.x + Math.sin(angle) * 9, center.z + Math.cos(angle) * 9, 0.05);
    return pad(`${faction}_base_pad_${index}`, position, faction, zone, 'base', facing);
  });
}

export const FJORD_BASES: readonly FactionBase[] = [
  {
    faction: 'alpine',
    labelKey: 'world.zones.alpine_base',
    position: { ...ALPINE_BASE_POSITION },
    protectedRadius: 42,
    spawnPads: basePads('alpine', vec3(300, ALPINE_BASE_POSITION.y, 300), 'alpine_base', TOWER_C_POSITION),
  },
  {
    faction: 'lagoon',
    labelKey: 'world.zones.lagoon_base',
    position: { ...LAGOON_BASE_POSITION },
    protectedRadius: 42,
    spawnPads: basePads('lagoon', vec3(-306, LAGOON_BASE_POSITION.y, -306), 'lagoon_base', TOWER_A_POSITION),
  },
];

/** Every eligible spawn of the blueprint (tower pads for both factions + base pads). */
export const FJORD_SPAWNS: readonly SpawnPoint[] = [
  ...FJORD_TOWERS.flatMap((tower) => tower.spawnPads),
  ...FJORD_BASES.flatMap((base) => base.spawnPads),
];

/**
 * Round-start ownership: each faction starts holding its home tower (Lagoon
 * League → Tower A, Peak Guard → Tower C); Tower B starts neutral.
 */
export const ROUND_START_TOWERS: Readonly<Record<Faction, readonly TowerId[]>> = {
  alpine: ['tower_c'],
  lagoon: ['tower_a'],
};

const pier = (id: string) => PIER_LAYOUTS.find((layout) => layout.id === id);
function beside(pierId: string, along: number, side: number): Vec3 {
  const layout = pier(pierId);
  if (!layout) return vec3(A.x, 0, A.z);
  const point = localToWorld(layout.start, layout.yaw, vec3(side * 4.4, 0, along));
  return vec3(point.x, 0, point.z);
}

export const FJORD_VEHICLE_SPAWNS: readonly VehicleSpawnPoint[] = [
  { id: 'flamingo_base', vehicle: 'badi_flamingo', position: vec3(-312.5, 0, -239), rotationY: -0.12, faction: 'lagoon', trigger: 'base' },
  { id: 'flamingo_harbor', vehicle: 'badi_flamingo', position: vec3(-165, 0, -175), rotationY: Math.PI / 4, faction: null, trigger: 'map' },
  { id: 'flamingo_east_beach', vehicle: 'badi_flamingo', position: vec3(60, 0, -210), rotationY: Math.PI, faction: null, trigger: 'map' },
  // Inside the alpine hangar (26 × 20 m, door 19 m) facing out of the door toward the runway.
  { id: 'crawler_base', vehicle: 'fondue_crawler', position: ground(334, 318), rotationY: Math.atan2(301.4 - 334, 248 - 318), faction: 'alpine', trigger: 'base' },
  { id: 'crawler_summit', vehicle: 'fondue_crawler', position: ground(175, 195), rotationY: -1.7, faction: 'alpine', trigger: { capture: 'tower_c' } },
  // Inside the bamboo garage (18 × 13 m, door 13.5 m) facing out toward the spit.
  { id: 'coconut_tank_base', vehicle: 'coconut_tank', position: ground(-326, -334), rotationY: Math.PI / 4, faction: 'lagoon', trigger: 'base' },
  { id: 'coconut_tank_harbor', vehicle: 'coconut_tank', position: ground(-130, -140), rotationY: 0.75, faction: 'lagoon', trigger: { capture: 'tower_a' } },
  { id: 'rowboat_pier_w', vehicle: 'rowboat', position: beside('pier_w', 14, 1), rotationY: -Math.PI / 2, faction: null, trigger: 'map' },
  { id: 'rowboat_pier_s', vehicle: 'rowboat', position: beside('pier_s', 14, -1), rotationY: Math.PI, faction: null, trigger: 'map' },
  { id: 'rowboat_pier_e', vehicle: 'rowboat', position: beside('pier_e', 10, -1), rotationY: Math.PI / 2, faction: null, trigger: 'map' },
  { id: 'rowboat_waterfall', vehicle: 'rowboat', position: vec3(-140, 0, 75), rotationY: -Math.PI / 2, faction: null, trigger: 'map' },
  { id: 'sidecar_alpine_base', vehicle: 'sidecar', position: ground(316, 292), rotationY: -2.4, faction: 'alpine', trigger: 'base' },
  { id: 'sidecar_lagoon_base', vehicle: 'sidecar', position: ground(-296, -296), rotationY: 0.75, faction: 'lagoon', trigger: 'base' },
  { id: 'sidecar_village_east', vehicle: 'sidecar', position: vec3(41, VILLAGE_HEIGHT, 8), rotationY: -Math.PI / 2, faction: null, trigger: 'map' },
  { id: 'sidecar_village_west', vehicle: 'sidecar', position: vec3(-41, VILLAGE_HEIGHT, 22), rotationY: Math.PI / 2, faction: null, trigger: 'map' },
  { id: 'biplane_water', vehicle: 'biplane', position: vec3(-330, 0.5, -180), rotationY: 0.06, faction: 'lagoon', trigger: 'base' },
  { id: 'biplane_glacier', vehicle: 'biplane', position: ground(280, 150), rotationY: Math.PI + 0.13, faction: 'alpine', trigger: 'base' },
];

// ---------------------------------------------------------------------------
// Zones
// ---------------------------------------------------------------------------

function zone(id: ZoneId, x: number, z: number, radius: number, priority: number, climate: MapZone['climate']): MapZone {
  return { id, center: { x, z }, radius, priority, climate, labelKey: `world.zones.${id}` };
}

const chaletZones: MapZone[] = CHALET_PLACEMENTS.filter((placement) => placement.id !== 'chalet_north').map((placement) =>
  zone(
    placement.id === 'chalet_west' ? 'gasthof' : placement.id === 'chalet_east' ? 'bistro' : 'tiki_alm',
    placement.x,
    placement.z,
    7.5,
    5,
    'village',
  ),
);

export const FJORD_ZONES: readonly MapZone[] = [
  ...chaletZones,
  zone('bridge', 0, (BRIDGE_SOUTH.z + BRIDGE_NORTH.z) / 2, 15, 4, 'village'),
  zone('harbor', A.x, A.z, 62, 3, 'lagoon'),
  zone('summit', TOWER_C_POSITION.x, TOWER_C_POSITION.z, 62, 3, 'alpine'),
  zone('village', 0, 0, 72, 3, 'village'),
  zone('lagoon_base', LAGOON_BASE_POSITION.x, LAGOON_BASE_POSITION.z, 80, 3, 'lagoon'),
  zone('alpine_base', ALPINE_BASE_POSITION.x, ALPINE_BASE_POSITION.z, 60, 3, 'alpine'),
  zone('gorge', -10, 72, 70, 2, 'village'),
  zone('glacier', 292, 176, 64, 2, 'alpine'),
  zone('coconut_bay', 90, -128, 95, 1, 'lagoon'),
  zone('palm_point', -220, -30, 135, 1, 'lagoon'),
  zone('fjord', -250, 82, 110, 1, 'lagoon'),
  zone('crags', 250, -40, 100, 1, 'alpine'),
  zone('fir_woods', -110, 230, 190, 0, 'alpine'),
];

export function zoneAt(x: number, z: number): MapZone {
  let best: MapZone | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const candidate of FJORD_ZONES) {
    const distance = Math.hypot(x - candidate.center.x, z - candidate.center.z);
    if (distance > candidate.radius) continue;
    const score = candidate.priority * 1000 - distance;
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  if (best) return best;
  if (sampleMapHeight(x, z) < 4) return zone('shoreline', x, z, 0, -1, 'lagoon');
  return zone('highlands', x, z, 0, -1, 'alpine');
}

// ---------------------------------------------------------------------------
// Bot waypoint graph
// ---------------------------------------------------------------------------

type NodeSpec = [name: string, x: number, z: number, y?: number, water?: boolean];

/** Feet height of a swimmer; swim-exit nodes sit at it so bots arrive there while swimming. */
const SWIM_NODE_HEIGHT = -1.1;

/** A node on the harbour deck above each water stair and one in the water at its foot. */
function harborStepNodes(): NodeSpec[] {
  return HARBOR_STEPS.flatMap((steps): NodeSpec[] => {
    const top = localToWorld(steps.origin, steps.yaw, vec3(0, 0, -2.5));
    const water = localToWorld(steps.origin, steps.yaw, vec3(0, 0, HARBOR_STEPS_RUN + 0.8));
    return [
      [`${steps.id}_top`, top.x, top.z, HARBOR_DECK_HEIGHT],
      [`${steps.id}_water`, water.x, water.z, SWIM_NODE_HEIGHT, true],
    ];
  });
}

const harborRing = (name: string, angle: number): NodeSpec => [name, A.x + Math.sin(angle) * 11, A.z + Math.cos(angle) * 11, HARBOR_DECK_HEIGHT];

function pierPoint(id: string, along: number): [number, number] {
  const layout = pier(id);
  if (!layout) return [A.x, A.z];
  const point = localToWorld(layout.start, layout.yaw, vec3(0, 0, along));
  return [point.x, point.z];
}

function pierEnd(id: string, extra: number): [number, number] {
  const layout = pier(id);
  return pierPoint(id, (layout?.length ?? 20) + extra);
}

const roadAt = (index: number): [number, number] => {
  const point = TANK_ROAD_POINTS[Math.min(TANK_ROAD_POINTS.length - 1, Math.max(0, index))];
  return [point?.x ?? 0, point?.z ?? 0];
};

function roadIndexNear(x: number, z: number): number {
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  TANK_ROAD_POINTS.forEach((point, index) => {
    const distance = Math.hypot(point.x - x, point.z - z);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  });
  return best;
}

const rampAt = (index: number): [number, number] => {
  const point = COASTAL_RAMP_POINTS[Math.min(COASTAL_RAMP_POINTS.length - 1, Math.max(0, index))];
  return [point?.x ?? 0, point?.z ?? 0];
};

const westLane = VILLAGE_LANE_CONTROL[1] ?? [];
const southLane = VILLAGE_LANE_CONTROL[0] ?? [];
const southTrail = GORGE_TRAILS[0] ?? [];
const northTrail = GORGE_TRAILS[1] ?? [];

function trailNode(name: string, trail: readonly Vec3[], index: number): NodeSpec {
  const point = trail[Math.min(trail.length - 1, Math.max(0, index))];
  return [name, point?.x ?? 0, point?.z ?? 0, (point?.y ?? 0) + 0.05];
}

function laneNode(lane: readonly Vec3[], index: number, name: string): NodeSpec {
  const point = lane[Math.min(lane.length - 1, index)];
  return [name, point?.x ?? 0, point?.z ?? 0];
}

/** Road nodes every ~8 samples along the serpentine (hairpins stay well sampled). */
function roadNodes(): NodeSpec[] {
  const start = roadIndexNear(46, 14);
  const nodes: NodeSpec[] = [];
  for (let index = start; index >= 0; index -= 6) {
    const [x, z] = roadAt(index);
    nodes.push([`road_${index}`, x, z, (TANK_ROAD_POINTS[index]?.y ?? 0) + 0.05]);
  }
  const [lastX, lastZ] = roadAt(0);
  if (nodes[nodes.length - 1]?.[0] !== 'road_0') nodes.push(['road_0', lastX, lastZ]);
  return nodes;
}

const ROAD_NODES = roadNodes();

const NODES: NodeSpec[] = [
  // Lagoon base and spit
  ['lb_center', -306, -306],
  ['lb_north', -300, -276],
  ['lb_garage', -318, -322],
  ['spit_0', -268, -274],
  ['spit_1', -238, -252],
  ['spit_2', -210, -233],
  // 2 m past the foot of the landing ramp, on the beach.
  ['pier_s_end', ...pierEnd('pier_s', 5.5)],
  ['pier_s_mid', ...pierPoint('pier_s', 8), HARBOR_DECK_HEIGHT],
  // Tower A platform ring and piers
  harborRing('harbor_s', Math.PI + 0.18),
  harborRing('harbor_e', Math.PI / 2),
  harborRing('harbor_ne', Math.PI / 4),
  harborRing('harbor_w', -Math.PI / 2),
  harborRing('harbor_n', 0),
  ['pier_ne_mid', ...pierPoint('pier_ne', 9), HARBOR_DECK_HEIGHT],
  ['pier_ne_end', ...pierEnd('pier_ne', 4.5)],
  ['pier_e_mid', ...pierPoint('pier_e', 9), HARBOR_DECK_HEIGHT],
  ['pier_e_end', ...pierEnd('pier_e', 4.5)],
  ['pier_w_mid', ...pierPoint('pier_w', 12), HARBOR_DECK_HEIGHT],
  ['pier_w_head', ...pierPoint('pier_w', 25), HARBOR_DECK_HEIGHT],
  // Swim exits: water stairs and beach shore points between the piers.
  ...harborStepNodes(),
  ['shore_n', -178, -148],
  ['shore_ne', -158, -171],
  ['shore_se', -152, -195],
  // Beach in front of Tower A and the coastal ramp
  ['beach_bars', -160, -146],
  ['beach_east', -140, -176],
  ['ramp_0', ...rampAt(2)],
  ['ramp_1', ...rampAt(12)],
  ['ramp_2', ...rampAt(22)],
  ['ramp_3', ...rampAt(32)],
  ['ramp_top', ...rampAt(COASTAL_RAMP_POINTS.length - 1)],
  // South beach towards Coconut Bay
  ['beach_s0', -100, -176],
  ['beach_s1', -50, -166],
  ['beach_s2', 0, -150],
  ['bay_west', 40, -136],
  ['bay_hammock', 62, -104],
  ['bay_east', 120, -146],
  ['bay_coaster', 140, -120],
  laneNode(southLane, 4, 'lane_s0'),
  laneNode(southLane, 2, 'lane_s1'),
  laneNode(southLane, 1, 'lane_s2'),
  laneNode(southLane, 0, 'square_s'),
  // Village square
  ['square_sw', -34, -34],
  ['square_se', 34, -34],
  ['square_ne', 34, 26],
  ['square_n', 0, 38],
  ['square_nw', -14, 40],
  ['square_w', -40, 12],
  ['ring_n', 0, 9],
  ['ring_s', 0, -9],
  ['ring_e', 9, 0],
  ['ring_w', -9, 0],
  ['square_e', 42, 14],
  // West lane, Palm Point and the valley station
  laneNode(westLane, 1, 'lane_w0'),
  laneNode(westLane, 2, 'lane_w1'),
  laneNode(westLane, 3, 'lane_w2'),
  laneNode(westLane, 4, 'lane_w3'),
  ['valley_station', -112, -88],
  ['palm_0', -160, -100],
  ['palm_1', -210, -60],
  ['palm_2', -250, -20],
  ['palm_3', -180, 20],
  ['palm_4', -130, -30],
  // Bridge and the north rim
  ['bridge_s', 0, BRIDGE_SOUTH.z + 2, bridgeDeckHeightAt(BRIDGE_SOUTH.z + 2)],
  ['bridge_mid', 0, 71.5, bridgeDeckHeightAt(71.5)],
  ['bridge_n', 0, BRIDGE_NORTH.z - 2, bridgeDeckHeightAt(BRIDGE_NORTH.z - 2)],
  ['rim_n', 0, 108],
  ['rim_nw', -50, 116],
  ['rim_ne', 42, 112],
  ['tbar_bottom', 80, 110],
  ['woods_0', -100, 140],
  ['woods_1', -40, 160],
  ['woods_2', 30, 150],
  // Gorge trails and walkways
  trailNode('trail_s_top', southTrail, southTrail.length - 1),
  trailNode('trail_s_mid', southTrail, 2),
  trailNode('trail_s_low', southTrail, 0),
  ['walk_s_mid', 0, GORGE.centerAt(0) - (GORGE.halfFloorAt(0) - 1.6), GORGE_WALKWAY_HEIGHT],
  ['walk_s_east', 14, GORGE.centerAt(14) - (GORGE.halfFloorAt(14) - 1.6), GORGE_WALKWAY_HEIGHT],
  ['walk_n_east', 14, GORGE.centerAt(14) + (GORGE.halfFloorAt(14) - 1.6), GORGE_WALKWAY_HEIGHT],
  trailNode('trail_n_low', northTrail, 0),
  trailNode('trail_n_mid', northTrail, 2),
  trailNode('trail_n_top', northTrail, northTrail.length - 1),
  // Tank road
  ...ROAD_NODES,
  // Summit ring and the alpine base
  ['summit_s', ...((): [number, number] => {
    // Offset west of the mountain station so the node is not under its deck.
    const p = localToWorld(TOWER_C_POSITION, SUMMIT_YAW, vec3(-7, 0, 17));
    return [p.x, p.z];
  })()],
  ['summit_w', ...((): [number, number] => {
    const p = localToWorld(TOWER_C_POSITION, SUMMIT_YAW, vec3(-18, 0, 0));
    return [p.x, p.z];
  })()],
  ['summit_e', ...((): [number, number] => {
    const p = localToWorld(TOWER_C_POSITION, SUMMIT_YAW, vec3(18, 0, 0));
    return [p.x, p.z];
  })()],
  ['summit_n', ...((): [number, number] => {
    const p = localToWorld(TOWER_C_POSITION, SUMMIT_YAW, vec3(0, 0, -16));
    return [p.x, p.z];
  })()],
  ['summit_porch', ...((): [number, number] => {
    const p = localToWorld(TOWER_C_POSITION, SUMMIT_YAW, vec3(0, 0, 13));
    return [p.x, p.z];
  })()],
  ['summit_door', ...((): [number, number] => {
    const p = localToWorld(TOWER_C_POSITION, SUMMIT_YAW, vec3(0, 0, 6));
    return [p.x, p.z];
  })()],
  ['tbar_top', 182, 192],
  ['ab_center', 300, 300],
  ['ab_hangar', 320, 312],
  ['glacier_n', 300, 240],
  ['glacier_s', 286, 130],
  ['mountain_station', CABLE_CAR_STATIONS.mountain.x - 6, CABLE_CAR_STATIONS.mountain.z - 6],
];

const roadNames = ROAD_NODES.map((node) => node[0]);

const EDGES: [string, string][] = [
  ['lb_center', 'lb_north'],
  ['lb_center', 'lb_garage'],
  ['lb_north', 'spit_0'],
  ['spit_0', 'spit_1'],
  ['spit_1', 'spit_2'],
  ['spit_2', 'pier_s_end'],
  ['pier_s_end', 'pier_s_mid'],
  ['pier_s_mid', 'harbor_s'],
  ['harbor_s', 'harbor_e'],
  ['harbor_s', 'harbor_w'],
  ['harbor_e', 'harbor_ne'],
  ['harbor_ne', 'harbor_n'],
  ['harbor_n', 'harbor_w'],
  ['harbor_ne', 'pier_ne_mid'],
  ['pier_ne_mid', 'pier_ne_end'],
  ['harbor_e', 'pier_e_mid'],
  ['pier_e_mid', 'pier_e_end'],
  ['harbor_w', 'pier_w_mid'],
  ['pier_w_mid', 'pier_w_head'],
  ['harbor_steps_west_top', 'pier_w_head'],
  ['harbor_steps_west_top', 'harbor_steps_west_water'],
  ['harbor_steps_0_top', 'harbor_s'],
  ['harbor_steps_0_top', 'harbor_w'],
  ['harbor_steps_0_top', 'harbor_steps_0_water'],
  ['harbor_steps_1_top', 'harbor_s'],
  ['harbor_steps_1_top', 'harbor_e'],
  ['harbor_steps_1_top', 'harbor_steps_1_water'],
  ['shore_n', 'beach_bars'],
  ['shore_ne', 'beach_east'],
  ['shore_se', 'beach_east'],
  ['pier_ne_end', 'beach_bars'],
  ['pier_e_end', 'beach_east'],
  ['beach_bars', 'ramp_0'],
  ['beach_east', 'ramp_0'],
  ['beach_east', 'beach_s0'],
  ['ramp_0', 'ramp_1'],
  ['ramp_1', 'ramp_2'],
  ['ramp_2', 'ramp_3'],
  ['ramp_3', 'ramp_top'],
  ['ramp_top', 'square_sw'],
  ['beach_s0', 'beach_s1'],
  ['beach_s1', 'beach_s2'],
  ['beach_s2', 'bay_west'],
  ['bay_west', 'bay_hammock'],
  ['bay_west', 'bay_east'],
  ['bay_east', 'bay_coaster'],
  ['bay_hammock', 'lane_s0'],
  ['lane_s0', 'lane_s1'],
  ['lane_s1', 'lane_s2'],
  ['lane_s2', 'square_s'],
  ['square_s', 'square_se'],
  ['square_s', 'ring_s'],
  ['square_sw', 'ring_s'],
  ['square_sw', 'ring_w'],
  ['square_se', 'ring_e'],
  ['square_se', 'square_e'],
  ['square_e', 'ring_e'],
  ['square_e', 'square_ne'],
  ['square_ne', 'ring_n'],
  ['square_ne', 'square_n'],
  ['square_n', 'ring_n'],
  ['square_n', 'square_nw'],
  ['square_w', 'ring_w'],
  ['ring_n', 'ring_e'],
  ['ring_e', 'ring_s'],
  ['ring_s', 'ring_w'],
  ['ring_w', 'ring_n'],
  ['square_w', 'lane_w0'],
  ['lane_w0', 'lane_w1'],
  ['lane_w1', 'lane_w2'],
  ['lane_w2', 'lane_w3'],
  ['lane_w3', 'valley_station'],
  ['valley_station', 'palm_0'],
  ['palm_0', 'ramp_1'],
  ['palm_0', 'palm_1'],
  ['palm_1', 'palm_2'],
  ['palm_2', 'palm_3'],
  ['palm_3', 'palm_4'],
  ['palm_4', 'lane_w2'],
  ['palm_4', 'palm_1'],
  ['square_n', 'bridge_s'],
  ['bridge_s', 'bridge_mid'],
  ['bridge_mid', 'bridge_n'],
  ['bridge_n', 'rim_n'],
  ['rim_n', 'rim_nw'],
  ['rim_n', 'rim_ne'],
  ['rim_ne', 'tbar_bottom'],
  ['rim_nw', 'woods_0'],
  ['rim_nw', 'woods_1'],
  ['rim_n', 'woods_1'],
  ['woods_1', 'woods_2'],
  ['rim_ne', 'woods_2'],
  ['square_nw', 'trail_s_top'],
  ['trail_s_top', 'trail_s_mid'],
  ['trail_s_mid', 'trail_s_low'],
  ['trail_s_low', 'walk_s_mid'],
  ['walk_s_mid', 'walk_s_east'],
  ['walk_s_east', 'walk_n_east'],
  ['walk_n_east', 'trail_n_low'],
  ['trail_n_low', 'trail_n_mid'],
  ['trail_n_mid', 'trail_n_top'],
  ['trail_n_top', 'rim_ne'],
  ['square_e', roadNames[0] ?? 'square_e'],
  ...roadNames.slice(0, -1).map((name, index): [string, string] => [name, roadNames[index + 1] ?? name]),
  ['tbar_top', 'summit_s'],
  ['summit_s', 'summit_w'],
  ['summit_s', 'summit_e'],
  ['summit_w', 'summit_n'],
  ['summit_e', 'summit_n'],
  ['summit_s', 'summit_porch'],
  ['summit_porch', 'summit_door'],
  ['summit_w', 'mountain_station'],
  ['summit_e', 'glacier_n'],
  ['glacier_n', 'glacier_s'],
  ['glacier_n', 'ab_center'],
  ['ab_center', 'ab_hangar'],
];

function buildNavGraph(): NavGraph {
  const nodes: NavNode[] = NODES.map(([, x, z, y, water], index) => {
    const position = y !== undefined ? vec3(x, y, z) : ground(x, z);
    return { id: index, position, zone: zoneAt(x, z).id, ...(water ? { water: true } : {}) };
  });
  const indexOf = new Map(NODES.map(([name], index) => [name, index]));
  // Join the summit ring and the base road to the nearest road nodes.
  const extra: [string, string][] = [];
  const nearestRoad = (x: number, z: number): string => {
    let best = roadNames[0] ?? '';
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const node of ROAD_NODES) {
      const distance = Math.hypot(node[1] - x, node[2] - z);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = node[0];
      }
    }
    return best;
  };
  const summitS = NODES.find((node) => node[0] === 'summit_s');
  if (summitS) extra.push(['summit_s', nearestRoad(summitS[1], summitS[2])]);
  const tbarTop = NODES.find((node) => node[0] === 'tbar_top');
  if (tbarTop) extra.push(['tbar_top', nearestRoad(tbarTop[1], tbarTop[2])]);
  extra.push(['ab_center', nearestRoad(300, 300)]);
  const tbarBottom = NODES.find((node) => node[0] === 'tbar_bottom');
  if (tbarBottom) extra.push(['tbar_bottom', nearestRoad(tbarBottom[1], tbarBottom[2])]);
  const edges: (readonly [number, number])[] = [];
  for (const [a, b] of [...EDGES, ...extra]) {
    const ia = indexOf.get(a);
    const ib = indexOf.get(b);
    if (ia === undefined || ib === undefined || ia === ib) continue;
    edges.push([ia, ib]);
  }
  return { nodes, edges };
}

export const FJORD_NAV: NavGraph & { readonly names: readonly string[] } = {
  ...buildNavGraph(),
  names: NODES.map(([name]) => name),
};
