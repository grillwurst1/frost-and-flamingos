/**
 * Fjord Fiesta master layout: every anchor coordinate the terrain, structures,
 * routes and gameplay data are derived from. Orientation follows the design
 * record: lagoon and beach in the southwest, the village plateau in the
 * centre with the gorge directly north of it, the alps rising to the
 * northeast. X = east, Z = north.
 */
import { SNOWLINE_Y } from '../../constants.js';
import type { Vec2, Vec3 } from '../../types/index.js';
import { catmullRom, resampleLinear, vec3, yawTowards } from './math.js';

export const TOWER_A_POSITION: Vec3 = vec3(-190, 2, -185);
export const TOWER_B_POSITION: Vec3 = vec3(0, 18, 0);
export const TOWER_C_POSITION: Vec3 = vec3(210, 55, 220);
export const ALPINE_BASE_POSITION: Vec3 = vec3(310, 58, 310);
export const LAGOON_BASE_POSITION: Vec3 = vec3(-310, 2.5, -310);

export const VILLAGE_HEIGHT = 18;
/** Half size of the 90 m × 90 m cobblestone square. */
export const SQUARE_HALF = 45;
export const SUMMIT_HEIGHT = 55;
export const ALPINE_BASE_HEIGHT = 58;
export const HARBOR_DECK_HEIGHT = 2;
export const HARBOR_PLATFORM_RADIUS = 18;
export const LAGOON_BASE_HEIGHT = 2.5;
export const LAGOON_FLOOR = -4.5;

/**
 * Mainland coastline (closed polygon, XZ). Everything outside it, inside the
 * map, is sea: the south sea, the lagoon, the west channel and the fjord
 * inlet that ends at the gorge mouth.
 */
export const MAINLAND_COAST: readonly Vec2[] = [
  { x: -460, z: 460 },
  { x: 460, z: 460 },
  { x: 460, z: -210 },
  { x: 380, z: -205 },
  { x: 330, z: -196 },
  { x: 282, z: -186 },
  { x: 232, z: -174 },
  { x: 182, z: -181 },
  { x: 140, z: -177 },
  { x: 100, z: -172 },
  { x: 60, z: -177 },
  { x: 20, z: -174 },
  { x: -20, z: -184 },
  { x: -62, z: -192 },
  { x: -100, z: -198 },
  { x: -128, z: -206 },
  { x: -150, z: -203 },
  { x: -157, z: -182 },
  { x: -163, z: -160 },
  { x: -180, z: -146 },
  { x: -214, z: -139 },
  { x: -250, z: -128 },
  { x: -286, z: -114 },
  { x: -320, z: -106 },
  { x: -346, z: -90 },
  { x: -356, z: -42 },
  { x: -352, z: 18 },
  { x: -344, z: 54 },
  { x: -300, z: 60 },
  { x: -246, z: 57 },
  { x: -190, z: 60 },
  { x: -152, z: 63 },
  { x: -112, z: 64 },
  { x: -98, z: 70 },
  { x: -98, z: 94 },
  { x: -112, z: 100 },
  { x: -150, z: 103 },
  { x: -206, z: 108 },
  { x: -270, z: 106 },
  { x: -330, z: 101 },
  { x: -358, z: 106 },
  { x: -460, z: 112 },
];

/** Land blobs inside the sea: the island base, its sand spit and lagoon islets. */
export interface IslandShape {
  readonly kind: 'circle' | 'capsule';
  readonly a: Vec2;
  readonly b: Vec2;
  readonly radius: number;
  /** Peak land height of the island interior. */
  readonly height: number;
  readonly rocky: boolean;
}

export const ISLANDS: readonly IslandShape[] = [
  { kind: 'circle', a: { x: -312, z: -312 }, b: { x: -312, z: -312 }, radius: 58, height: 3.2, rocky: false },
  { kind: 'capsule', a: { x: -350, z: -282 }, b: { x: -276, z: -350 }, radius: 30, height: 3, rocky: false },
  { kind: 'capsule', a: { x: -276, z: -280 }, b: { x: -198, z: -226 }, radius: 10, height: 1.4, rocky: false },
  { kind: 'circle', a: { x: -258, z: -200 }, b: { x: -258, z: -200 }, radius: 9, height: 5, rocky: true },
  { kind: 'circle', a: { x: -110, z: -258 }, b: { x: -110, z: -258 }, radius: 12, height: 6, rocky: true },
  { kind: 'circle', a: { x: 40, z: -238 }, b: { x: 40, z: -238 }, radius: 8, height: 4, rocky: true },
  { kind: 'circle', a: { x: -385, z: -12 }, b: { x: -385, z: -12 }, radius: 10, height: 7, rocky: true },
];

/** The gorge north of the square, crossed by the great suspension bridge at x = 0. */
export const GORGE = {
  /** Gorge centreline z for a given x (straight at the bridge). */
  centerAt(x: number): number {
    return 71.5 + Math.sin((x - 0) * 0.011) * 3.5 + Math.sin(x * 0.027 + 1.2) * 1.2 - Math.sin(1.2) * 1.2;
  },
  /** Half width of the flat floor. 16.5 m wide at the bridge. */
  halfFloorAt(x: number): number {
    if (x < -40) return 8.25 + Math.min(1, (-40 - x) / 60) * 7;
    if (x > 30) return Math.max(2.5, 8.25 - ((x - 30) / 55) * 5.05);
    return 8.25;
  },
  /** Floor height: +1.5 at the bridge, sloping down to the inlet and up to the closed east end. */
  floorAt(x: number): number {
    if (x <= -100) return -1.6;
    if (x <= -78) return -1.6 + ((x + 100) / 22) * 2.2;
    if (x <= 0) return 0.6 + ((x + 78) / 78) * 0.9;
    if (x <= 55) return 1.5 + (x / 55) * 2.5;
    return 4 + ((x - 55) / 70) * 18;
  },
  westEnd: -125,
  eastEnd: 128,
  /** Horizontal run per metre of rise on the walls (≈ 63° walls). */
  wallRun: 0.5,
} as const;

export const BRIDGE_DECK_HEIGHT = 18.3;
export const BRIDGE_PYLON_TOP = BRIDGE_DECK_HEIGHT + 2.6;
export const BRIDGE_ANCHOR_HEIGHT = 2.1;
export const BRIDGE_SOUTH: Vec3 = vec3(0, BRIDGE_DECK_HEIGHT, 46.5);
export const BRIDGE_NORTH: Vec3 = vec3(0, BRIDGE_DECK_HEIGHT, 96.5);
export const BRIDGE_WIDTH = 6;
export const GORGE_WALKWAY_HEIGHT = 2.5;

/** Waterfall at the gorge's west end, falling from the north rim into the inlet head. */
export const WATERFALL = {
  top: vec3(-104, 27.5, 103),
  bottom: vec3(-106, -0.2, 88),
  width: 9,
} as const;

/** A flattened pad: the terrain is blended to `height` inside `radius`. */
export interface TerrainPad {
  readonly id: string;
  readonly center: Vec2;
  readonly halfSize: Vec2;
  readonly rotationY: number;
  readonly height: number;
  /** Blend distance outside the pad. */
  readonly falloff: number;
  /** Corner rounding of the rectangle. */
  readonly round: number;
}

export const TERRAIN_PADS: readonly TerrainPad[] = [
  // Village square: exact 90 × 90 m cobblestone plateau plus a grass apron.
  { id: 'village_square', center: { x: 0, z: 0 }, halfSize: { x: 50, z: 41 }, rotationY: 0, height: VILLAGE_HEIGHT, falloff: 26, round: 8 },
  { id: 'village_north', center: { x: 0, z: 42 }, halfSize: { x: 34, z: 3 }, rotationY: 0, height: VILLAGE_HEIGHT, falloff: 8, round: 2 },
  { id: 'bridge_north', center: { x: 0, z: 104 }, halfSize: { x: 22, z: 8 }, rotationY: 0, height: VILLAGE_HEIGHT + 0.4, falloff: 22, round: 6 },
  { id: 'summit_plateau', center: { x: 212, z: 222 }, halfSize: { x: 44, z: 40 }, rotationY: 0.62, height: SUMMIT_HEIGHT, falloff: 26, round: 18 },
  { id: 'alpine_base', center: { x: 312, z: 308 }, halfSize: { x: 50, z: 44 }, rotationY: 0.78, height: ALPINE_BASE_HEIGHT, falloff: 30, round: 14 },
  { id: 'glacier_runway', center: { x: 292, z: 176 }, halfSize: { x: 22, z: 84 }, rotationY: 0.11, height: 57, falloff: 26, round: 10 },
  { id: 'valley_station', center: { x: -110, z: -95 }, halfSize: { x: 14, z: 11 }, rotationY: 0.78, height: 8, falloff: 16, round: 4 },
  { id: 'tbar_bottom', center: { x: 82, z: 112 }, halfSize: { x: 9, z: 9 }, rotationY: 0.9, height: 19, falloff: 14, round: 4 },
  { id: 'mid_support', center: { x: 46, z: 49 }, halfSize: { x: 7, z: 7 }, rotationY: 0.78, height: 18, falloff: 10, round: 3 },
  { id: 'lagoon_base', center: { x: -312, z: -312 }, halfSize: { x: 40, z: 40 }, rotationY: 0.78, height: LAGOON_BASE_HEIGHT, falloff: 16, round: 22 },
  { id: 'beach_bar_north', center: { x: -173, z: -137 }, halfSize: { x: 8, z: 7 }, rotationY: 0.3, height: 2.7, falloff: 8, round: 2 },
  { id: 'beach_bar_east', center: { x: -138, z: -191 }, halfSize: { x: 8, z: 7 }, rotationY: 1.3, height: 2.2, falloff: 8, round: 2 },
  { id: 'hammock_beach', center: { x: 65, z: -95 }, halfSize: { x: 12, z: 8 }, rotationY: 0, height: 3.2, falloff: 14, round: 3 },
  { id: 'village_pond', center: { x: -66, z: -16 }, halfSize: { x: 12, z: 10 }, rotationY: 0.3, height: VILLAGE_HEIGHT - 0.35, falloff: 6, round: 9 },
];

/** Control points of the 10 m serpentine tank road, alpine base → Tower C → hairpins → arch → square. */
export const TANK_ROAD_CONTROL: readonly Vec3[] = [
  vec3(318, 58, 318),
  vec3(296, 58, 292),
  vec3(268, 57, 262),
  vec3(238, 55.2, 236),
  vec3(222, 55, 196),
  vec3(196, 53.5, 186),
  vec3(170, 51, 182),
  vec3(140, 48.6, 178),
  vec3(118, 46.6, 172),
  // Hairpin 2
  vec3(106, 45.6, 162),
  vec3(112, 44.6, 150),
  vec3(134, 42.4, 144),
  vec3(170, 38.6, 136),
  vec3(198, 35.2, 128),
  // Hairpin 1
  vec3(212, 33.6, 118),
  vec3(206, 32.2, 106),
  vec3(184, 30.4, 100),
  vec3(152, 27.6, 98),
  vec3(124, 24.8, 98),
  // Stone arch across the gorge's narrow east ravine
  vec3(104, 22.8, 90),
  vec3(100, 21.6, 74),
  vec3(96, 20.6, 58),
  vec3(80, 19.4, 38),
  vec3(60, 18.4, 22),
  vec3(46, 18, 14),
];

export const TANK_ROAD_WIDTH = 10;

/** Coastal sand ramp from the beach in front of Tower A up to the square's southwest corner. */
export const COASTAL_RAMP_CONTROL: readonly Vec3[] = [
  vec3(-138, 2.6, -150),
  vec3(-122, 3.6, -132),
  vec3(-104, 6.4, -112),
  vec3(-86, 9.8, -92),
  vec3(-70, 13.4, -74),
  vec3(-58, 16.4, -60),
  vec3(-48, 18, -48),
];

export const COASTAL_RAMP_WIDTH = 14;

/** Village lanes: narrow cobbled paths off the square (south stairs, west path). */
export const VILLAGE_LANE_CONTROL: readonly (readonly Vec3[])[] = [
  // South lane down to Coconut Bay and the hammock beach.
  [vec3(20, 18, -46), vec3(28, 16.6, -60), vec3(40, 12.8, -74), vec3(54, 8.4, -84), vec3(64, 4.6, -90)],
  // West lane down to Palm Point and the valley station.
  [vec3(-46, 18, 10), vec3(-62, 17.4, 4), vec3(-80, 14.2, -14), vec3(-94, 10.8, -40), vec3(-104, 8.6, -72), vec3(-110, 8, -88)],
];

export const VILLAGE_LANE_WIDTH = 6;

/** Ledge trails cut into the gorge walls: lower walkways up to the rims. */
export const GORGE_TRAILS: readonly (readonly Vec3[])[] = [
  // South wall, west of the bridge: walkway level up to the square.
  [vec3(-10, 2.6, 62.4), vec3(-22, 6.2, 59.6), vec3(-36, 10.4, 56.2), vec3(-50, 14.4, 53), vec3(-62, 17.6, 49.6), vec3(-70, 18.4, 44)],
  // North wall, east of the bridge: walkway level up to the alpine rim.
  [vec3(10, 2.7, 80.6), vec3(22, 6.4, 83.2), vec3(34, 10.4, 86.2), vec3(46, 14.4, 89.6), vec3(56, 18.2, 93.8), vec3(62, 20.6, 100)],
];

export const GORGE_TRAIL_WIDTH = 2.8;

/** Catmull-Rom sampled road centrelines (shared by terrain carving and rendering). */
export const TANK_ROAD_POINTS: readonly Vec3[] = catmullRom(TANK_ROAD_CONTROL, 3);
export const COASTAL_RAMP_POINTS: readonly Vec3[] = catmullRom(COASTAL_RAMP_CONTROL, 3);
export const VILLAGE_LANE_POINTS: readonly (readonly Vec3[])[] = VILLAGE_LANE_CONTROL.map((lane) =>
  catmullRom(lane, 2.5),
);
export const GORGE_TRAIL_POINTS: readonly (readonly Vec3[])[] = GORGE_TRAILS.map((trail) =>
  resampleLinear(trail, 1.5),
);

/** Stone arch: where the tank road crosses the narrow east ravine of the gorge. */
export const STONE_ARCH = {
  south: vec3(98, 21.1, 66),
  north: vec3(102.6, 22.3, 82.4),
  width: 12,
} as const;

/** Cable car: valley station → mid support at the village edge → Tower C mountain station. */
export const CABLE_CAR_STATIONS = {
  valley: vec3(-110, 8, -95),
  mid: vec3(45, 28, 50),
  mountain: vec3(195, 58, 210),
} as const;

/** Station yaw (local +Z): valley and mountain face along the line, the mid support stands across it. */
export const CABLE_STATION_YAWS = {
  valley: yawTowards(CABLE_CAR_STATIONS.valley, CABLE_CAR_STATIONS.mid),
  mid: yawTowards(CABLE_CAR_STATIONS.valley, CABLE_CAR_STATIONS.mountain) + Math.PI / 2,
  mountain: yawTowards(CABLE_CAR_STATIONS.mid, CABLE_CAR_STATIONS.mountain),
} as const;

/** Emergency brake levers in station-local space (x, handle height above the platform, z). */
export const CABLE_BRAKE_LEVERS_LOCAL = {
  valley: vec3(-3.6, 1.1, -1.4),
  mid: vec3(-2.8, 1.1, -2.2),
  mountain: vec3(-3.0, 1.1, 1.4),
} as const;

/** T-bar ski lift from the northeast village edge up to just below Tower C. */
export const TBAR_BOTTOM: Vec3 = vec3(85, 19, 115);
export const TBAR_TOP: Vec3 = vec3(185, 54, 195);

/** Alpine coaster control points: Tower C east terrace → four banked curves → jump ramp. */
export const COASTER_CONTROL: readonly Vec3[] = [
  vec3(235, 56.5, 210),
  vec3(250, 56, 200),
  vec3(262, 54.5, 180),
  // Curve 1 (banked left)
  vec3(266, 52.5, 150),
  vec3(256, 49, 120),
  vec3(236, 45.5, 96),
  // Curve 2 (banked right)
  vec3(226, 42, 68),
  vec3(238, 38.5, 40),
  vec3(244, 35, 10),
  // Curve 3 (banked right)
  vec3(232, 31.5, -22),
  vec3(206, 28, -42),
  vec3(178, 24.5, -56),
  // Curve 4 (banked left)
  vec3(152, 21, -76),
  vec3(136, 18, -100),
  vec3(124, 15, -122),
  // 45° launch ramp over the beach toward the lagoon
  vec3(116, 12.2, -136),
  vec3(110, 12, -140),
];

export const HAMMOCK_POSITION: Vec3 = vec3(65, 3.5, -95);
export const HAMMOCK_TARGET: Vec3 = vec3(30, 18.5, -10);
export const COW_HOME: Vec3 = vec3(0, 18, 38);

/** Water runway in the lagoon and the glacier airfield at the alpine base. */
export const WATER_RUNWAY = { start: vec3(-334, 0.5, -246), end: vec3(-326, 0.5, -122), width: 26 } as const;
export const GLACIER_RUNWAY = { start: vec3(282.6, 57, 104), end: vec3(301.4, 57, 248), width: 30 } as const;

export const ICE_PATCH_LAYOUT = [
  { id: 'village_pond', x: -66, z: -16, radius: 9.5 },
  { id: 'summit_rink', x: 240, z: 252, radius: 12 },
  { id: 'glacier_tongue', x: 330, z: 196, radius: 14 },
] as const;

export const SNOWLINE_HEIGHT = SNOWLINE_Y;
