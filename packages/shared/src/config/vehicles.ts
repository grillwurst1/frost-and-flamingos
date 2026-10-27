/**
 * Drivable vehicles (M5 core): Fondue Crawler, Coconut Beach Tank, Tactical
 * Badi-Flamingo and the Sidecar Motorcycle. Pure data shared by the server
 * simulation, the client prediction and the HUD.
 *
 * Local vehicle space: +Z forward, +X right, +Y up, metres, origin on the
 * ground under the hull centre (the boat: its waterline under the ring well).
 * Pivots, seat anchors and hit volumes match the owner's Meshy models after
 * scripts/vehicle-parts.ts split them (see its `--report`).
 *
 * Numbers from game-decisions.md §13 where it gives them (HP, top speeds,
 * cannon cooldown/speed/damage, ram damage, plug turbo, boat respawn). The
 * rest is chosen here and documented in the package report.
 */
import { MAP_HALF_SIZE, PHYSICS_TICK_RATE } from '../constants.js';
import type { ClassId, Faction, Vec3, VehicleWeaponId } from '../types/index.js';
import type { TowerId, VehicleKind, VehicleSpawnPoint } from '../types/map.js';
import { classCapabilities } from './classes.js';
import { createIdTable } from './ids.js';
import { FJORD_VEHICLE_SPAWNS } from './map/gameplay.js';
import { rotateY } from './map/math.js';

/** Wire order of every vehicle kind (append only). */
export const VEHICLE_KINDS = [
  'badi_flamingo',
  'fondue_crawler',
  'coconut_tank',
  'rowboat',
  'sidecar',
  'biplane',
] as const satisfies readonly VehicleKind[];

export const VEHICLE_KIND_TABLE = createIdTable<VehicleKind>(VEHICLE_KINDS);

export type DrivableVehicleKind = 'fondue_crawler' | 'coconut_tank' | 'badi_flamingo' | 'sidecar' | 'rowboat' | 'biplane';

/** Active vehicle kinds. The separate wire table retains its original ordering. */
export const DRIVABLE_VEHICLE_KINDS: readonly DrivableVehicleKind[] = [
  'fondue_crawler',
  'coconut_tank',
  'badi_flamingo',
  'sidecar',
  'rowboat',
  'biplane',
];

export function isDrivableKind(kind: VehicleKind): kind is DrivableVehicleKind {
  return (DRIVABLE_VEHICLE_KINDS as readonly string[]).includes(kind);
}

/** Body pose and firing eye use the same hip drop for the existing standing-foot anchors. */
export function vehicleRidingPose(kind: DrivableVehicleKind, seat: number): 'seat' | 'steer' | 'wing' | 'row' | undefined {
  if (kind === 'biplane' && seat > 0) return 'wing';
  if (kind === 'rowboat') return 'row';
  if (kind === 'sidecar') return seat === 0 ? 'steer' : 'seat';
  if (kind === 'badi_flamingo' || kind === 'biplane') return 'seat';
  return undefined;
}

export function vehicleEyeDrop(kind: DrivableVehicleKind, seat: number, height: number): number {
  const pose = vehicleRidingPose(kind, seat);
  return height * (pose === 'wing' ? 0.07 : pose ? 0.18 : 0);
}

export type VehicleChassis = 'tracked' | 'wheeled' | 'boat' | 'aircraft';

/**
 * driver: steers (and fires the vehicle weapon when `gunner` is also set);
 * gunner: aims and fires the vehicle weapon; passenger: own hand weapons.
 */
export interface VehicleSeat {
  readonly driver: boolean;
  readonly gunner: boolean;
  /** Fires their own loadout from the seat. */
  readonly handWeapons: boolean;
  /**
   * Feet anchor of the seated character (local space). The occupant keeps
   * the standing capsule, sunk into the vehicle, so its eye and visible upper
   * body sit where a rider would.
   */
  readonly anchor: Vec3;
  /** false: inside the armour (not drawn, cannot be shot or splashed). */
  readonly exposed: boolean;
}

export interface VehicleWeaponDefinition {
  readonly id: VehicleWeaponId;
  /** Turret yaw axis (local space). */
  readonly turretPivot: Vec3;
  /** Barrel pitch axis relative to the turret pivot (turret space). */
  readonly barrelPivot: Vec3;
  /** Muzzle relative to the barrel pivot (barrel space, +Z along the barrel). */
  readonly muzzle: Vec3;
  readonly projectileSpeed: number;
  /** Fraction of world gravity acting on the projectile. */
  readonly gravityScale: number;
  readonly directDamage: number;
  readonly splashDamage: number;
  readonly splashRadius: number;
  readonly cooldownSeconds: number;
  readonly lifetimeSeconds: number;
  /** Turret slew rate (rad/s) and pitch limits (rad, + = up). */
  readonly yawRate: number;
  readonly pitchRate: number;
  readonly minPitch: number;
  readonly maxPitch: number;
  /** Projectile collision radius against bodies (m). */
  readonly radius: number;
  /** Holding fire repeats (harpoon MG); otherwise one shot per press. */
  readonly automatic: boolean;
}

export interface VehicleRamDefinition {
  readonly weaponId: VehicleWeaponId;
  /** Below this closing speed contact only shoves (m/s). */
  readonly minSpeed: number;
  /** At this speed the ram deals maxDamage. */
  readonly fullSpeed: number;
  readonly minDamage: number;
  readonly maxDamage: number;
  readonly launchHorizontal: number;
  readonly launchVertical: number;
}

/** Extra analytic hit sphere (turret dome, flamingo neck) above the hull box. */
export interface VehicleHitSphere {
  readonly center: Vec3;
  readonly radius: number;
}

export interface VehicleDefinition {
  readonly kind: DrivableVehicleKind;
  readonly chassis: VehicleChassis;
  /** Manifest key of the painted model (models/<key>.glb). */
  readonly modelKey: string;
  readonly maxHp: number;
  /** Seconds from destruction (or an abandoned despawn) to the respawn. */
  readonly respawnSeconds: number;
  /** Seconds the charred wreck stays before it disappears. */
  readonly wreckSeconds: number;
  /** Hull collider half extents; the box rests on the local origin. */
  readonly halfExtents: Vec3;
  readonly hitSphere: VehicleHitSphere | null;
  readonly maxForwardSpeed: number;
  readonly maxReverseSpeed: number;
  readonly acceleration: number;
  readonly braking: number;
  /** Deceleration without throttle (m/s²). */
  readonly coastDrag: number;
  /** Hull yaw rate at full steer (rad/s); wheeled: max steering angle (rad). */
  readonly turnRate: number;
  /** Yaw-rate response (1/s). */
  readonly turnResponse: number;
  /** Sideways velocity damping (m/s²); low = drift. */
  readonly lateralGrip: number;
  readonly maxSlope: number;
  readonly stepHeight: number;
  /** Deepest water a land vehicle may ford (base below the surface, m). */
  readonly fordDepth: number;
  readonly ram: VehicleRamDefinition;
  readonly seats: readonly VehicleSeat[];
  readonly weapon: VehicleWeaponDefinition | null;
  /** Damage multipliers: bullets/beams/melee vs. explosives and vehicle shells. */
  readonly armor: { readonly bullet: number; readonly explosive: number };
  /** Plug turbo (boat) / none. */
  readonly boost: { readonly speedScale: number; readonly seconds: number; readonly cooldownSeconds: number } | null;
}

const DEG = Math.PI / 180;

/** Ticks for a duration in seconds (at least one). */
export function vehicleTicks(seconds: number): number {
  return Math.max(1, Math.round(seconds * PHYSICS_TICK_RATE));
}

const TANK_DRIVE = {
  maxForwardSpeed: 9.5,
  maxReverseSpeed: 4.5,
  acceleration: 4.2,
  braking: 9,
  coastDrag: 3.2,
  turnRate: 1.05,
  turnResponse: 5,
  lateralGrip: 26,
  maxSlope: 36 * DEG,
  stepHeight: 0.55,
  fordDepth: 1.0,
} as const;

/** Fondue and Coconut tanks share hitbox and driving values for fair balance (§13.4). */
const TANK_HALF_EXTENTS: Vec3 = { x: 1.4, y: 0.85, z: 2.3 };

export const VEHICLES: Readonly<Record<DrivableVehicleKind, VehicleDefinition>> = {
  biplane: {
    kind: 'biplane', chassis: 'aircraft', modelKey: 'vehicle-biplane',
    maxHp: 320, respawnSeconds: 25, wreckSeconds: 5,
    halfExtents: { x: 3.1, y: 1.35, z: 2.5 }, hitSphere: null,
    maxForwardSpeed: 28, maxReverseSpeed: 0, acceleration: 6, braking: 10,
    coastDrag: 3, turnRate: 0.95, turnResponse: 5, lateralGrip: 1,
    maxSlope: 0.52, stepHeight: 0.25, fordDepth: 20,
    ram: { weaponId: 'propeller', minSpeed: 100, fullSpeed: 100, minDamage: 0, maxDamage: 0, launchHorizontal: 30, launchVertical: 12 },
    seats: [
      { driver: true, gunner: true, handWeapons: false, exposed: true, anchor: { x: 0, y: 0.55, z: -0.45 } },
      { driver: false, gunner: false, handWeapons: true, exposed: true, anchor: { x: -1.8, y: 2.76, z: 1.1 } },
      { driver: false, gunner: false, handWeapons: true, exposed: true, anchor: { x: 1.8, y: 2.76, z: 1.1 } },
    ],
    weapon: {
      id: 'biplane_mg', turretPivot: { x: 0, y: 0, z: 0 }, barrelPivot: { x: 0, y: 1.65, z: 2 }, muzzle: { x: 0, y: 0, z: 0.5 },
      projectileSpeed: 140, gravityScale: 0.025, directDamage: 15, splashDamage: 0, splashRadius: 0,
      cooldownSeconds: 0.12, lifetimeSeconds: 1.5, yawRate: 0, pitchRate: 0, minPitch: 0, maxPitch: 0, radius: 0.08, automatic: true,
    },
    armor: { bullet: 0.8, explosive: 1 }, boost: null,
  },
  rowboat: {
    kind: 'rowboat', chassis: 'boat', modelKey: 'vehicle-rowboat',
    maxHp: 200, respawnSeconds: 20, wreckSeconds: 5,
    halfExtents: { x: 0.85, y: 0.42, z: 1.8 }, hitSphere: null,
    maxForwardSpeed: 8, maxReverseSpeed: 3, acceleration: 5, braking: 7,
    coastDrag: 1.2, turnRate: 1.3, turnResponse: 4, lateralGrip: 4,
    maxSlope: 28 * DEG, stepHeight: 0.15, fordDepth: 0,
    ram: { weaponId: 'vehicle_blast', minSpeed: 100, fullSpeed: 100, minDamage: 0, maxDamage: 0, launchHorizontal: 3, launchVertical: 2 },
    seats: [
      { driver: true, gunner: false, handWeapons: true, exposed: true, anchor: { x: 0, y: -0.48, z: 0.55 } },
      { driver: false, gunner: false, handWeapons: true, exposed: true, anchor: { x: 0, y: -0.48, z: -0.6 } },
    ],
    weapon: null, armor: { bullet: 1, explosive: 1 },
    // Sprint is synthesized by the server only after both rowers hit a beat.
    boost: { speedScale: 2, seconds: 0.65, cooldownSeconds: 0.78 },
  },
  fondue_crawler: {
    kind: 'fondue_crawler',
    chassis: 'tracked',
    modelKey: 'vehicle-fondue-crawler',
    maxHp: 650,
    respawnSeconds: 30,
    wreckSeconds: 8,
    halfExtents: TANK_HALF_EXTENTS,
    hitSphere: { center: { x: -0.014, y: 1.72, z: -0.29 }, radius: 0.86 },
    ...TANK_DRIVE,
    ram: {
      weaponId: 'dozer_ram',
      minSpeed: 3,
      fullSpeed: 9.5,
      minDamage: 95,
      maxDamage: 120,
      launchHorizontal: 11,
      launchVertical: 7.5,
    },
    seats: [
      // Driver-gunner in the armoured cab: steers and fires the cheese cannon.
      { driver: true, gunner: true, handWeapons: false, anchor: { x: -0.15, y: 0.55, z: 0.95 }, exposed: false },
      // Commander standing in the fondue pot beside the spoon, own weapons 360°.
      { driver: false, gunner: false, handWeapons: true, anchor: { x: 0.32, y: 1.05, z: -0.42 }, exposed: true },
    ],
    weapon: {
      id: 'fondue_cannon',
      turretPivot: { x: -0.014, y: 1.3, z: -0.288 },
      barrelPivot: { x: 0.082, y: 0.522, z: 0.728 },
      muzzle: { x: 0, y: 0, z: 1.66 },
      projectileSpeed: 42,
      gravityScale: 0.55,
      directDamage: 85,
      splashDamage: 50,
      splashRadius: 5,
      cooldownSeconds: 3,
      lifetimeSeconds: 4,
      yawRate: 1.25,
      pitchRate: 0.9,
      minPitch: -8 * DEG,
      maxPitch: 22 * DEG,
      radius: 0.32,
      automatic: true,
    },
    armor: { bullet: 0.25, explosive: 1 },
    boost: null,
  },
  coconut_tank: {
    kind: 'coconut_tank',
    chassis: 'tracked',
    modelKey: 'vehicle-coconut-tank',
    maxHp: 650,
    respawnSeconds: 30,
    wreckSeconds: 8,
    halfExtents: TANK_HALF_EXTENTS,
    hitSphere: { center: { x: -0.047, y: 2.15, z: -0.73 }, radius: 0.92 },
    ...TANK_DRIVE,
    ram: {
      weaponId: 'grille_ram',
      minSpeed: 3,
      fullSpeed: 9.5,
      minDamage: 95,
      maxDamage: 120,
      launchHorizontal: 11,
      launchVertical: 7.5,
    },
    seats: [
      { driver: true, gunner: true, handWeapons: false, anchor: { x: 0, y: 0.55, z: 1.0 }, exposed: false },
      // Coconut-hatch gunner standing in the opened dome.
      { driver: false, gunner: false, handWeapons: true, anchor: { x: -0.05, y: 1.85, z: -0.73 }, exposed: true },
    ],
    weapon: {
      id: 'coconut_mortar',
      turretPivot: { x: -0.047, y: 1.22, z: -0.728 },
      barrelPivot: { x: 0.047, y: 1.21, z: 0.528 },
      muzzle: { x: 0, y: 0, z: 2.18 },
      projectileSpeed: 42,
      gravityScale: 0.55,
      directDamage: 85,
      splashDamage: 50,
      splashRadius: 5,
      cooldownSeconds: 3,
      lifetimeSeconds: 4,
      yawRate: 1.25,
      pitchRate: 0.9,
      minPitch: -8 * DEG,
      maxPitch: 22 * DEG,
      radius: 0.34,
      automatic: true,
    },
    armor: { bullet: 0.25, explosive: 1 },
    boost: null,
  },
  badi_flamingo: {
    kind: 'badi_flamingo',
    chassis: 'boat',
    modelKey: 'vehicle-flamingo-boat',
    maxHp: 450,
    respawnSeconds: 20,
    wreckSeconds: 4,
    halfExtents: { x: 1.2, y: 0.45, z: 1.47 },
    hitSphere: { center: { x: 0.07, y: 1.55, z: 1.05 }, radius: 0.5 },
    maxForwardSpeed: 12,
    maxReverseSpeed: 4,
    acceleration: 6,
    braking: 8,
    coastDrag: 2.2,
    turnRate: 1.5,
    turnResponse: 3.2,
    lateralGrip: 3.5,
    maxSlope: 28 * DEG,
    stepHeight: 0.15,
    fordDepth: 0,
    ram: {
      weaponId: 'flamingo_boing',
      minSpeed: 3,
      fullSpeed: 14,
      minDamage: 65,
      maxDamage: 110,
      launchHorizontal: 14,
      launchVertical: 8,
    },
    seats: [
      { driver: true, gunner: false, handWeapons: false, anchor: { x: 0, y: -0.6, z: 0.38 }, exposed: true },
      // Gunner behind the pilot, working the harpoon gun clamped to the neck.
      { driver: false, gunner: true, handWeapons: false, anchor: { x: 0, y: -0.6, z: -0.48 }, exposed: true },
    ],
    weapon: {
      id: 'harpoon_gun',
      turretPivot: { x: 0.04, y: 0.5, z: 1.02 },
      barrelPivot: { x: 0.26, y: 0.75, z: -0.02 },
      muzzle: { x: -0.03, y: 0.21, z: 1.03 },
      projectileSpeed: 85,
      gravityScale: 0.12,
      directDamage: 28,
      splashDamage: 0,
      splashRadius: 0,
      cooldownSeconds: 0.24,
      lifetimeSeconds: 1.6,
      yawRate: 3.2,
      pitchRate: 2.2,
      minPitch: -14 * DEG,
      maxPitch: 32 * DEG,
      radius: 0.12,
      automatic: true,
    },
    armor: { bullet: 0.5, explosive: 1 },
    boost: { speedScale: 2.5, seconds: 2.5, cooldownSeconds: 7 },
  },
  sidecar: {
    kind: 'sidecar',
    chassis: 'wheeled',
    modelKey: 'vehicle-sidecar',
    maxHp: 280,
    respawnSeconds: 15,
    wreckSeconds: 6,
    halfExtents: { x: 0.95, y: 0.5, z: 1.3 },
    hitSphere: null,
    maxForwardSpeed: 19,
    maxReverseSpeed: 5,
    acceleration: 7.5,
    braking: 14,
    coastDrag: 1.6,
    turnRate: 0.5,
    turnResponse: 7,
    lateralGrip: 22,
    maxSlope: 33 * DEG,
    stepHeight: 0.32,
    fordDepth: 0.55,
    ram: {
      weaponId: 'sidecar_ram',
      minSpeed: 4,
      fullSpeed: 19,
      minDamage: 75,
      maxDamage: 120,
      launchHorizontal: 13,
      launchVertical: 8,
    },
    seats: [
      // Driver astride the copper bike (right), feet on the pegs.
      { driver: true, gunner: false, handWeapons: false, anchor: { x: 0.5, y: 0.02, z: -0.3 }, exposed: true },
      // Sidecar tub passenger (left), own weapons 360°.
      { driver: false, gunner: false, handWeapons: true, anchor: { x: -0.46, y: -0.22, z: -0.2 }, exposed: true },
    ],
    weapon: null,
    armor: { bullet: 0.6, explosive: 1 },
    boost: null,
  },
};

/** Sidecar wheelbase for the arcade steering model (m). */
export const SIDECAR_WHEELBASE = 1.72;
/** The boat floats with its base this far below the water surface. */
export const BOAT_DRAFT = 0.25;
/** Terrain closer than this under the hull centre beaches the boat (m below the surface). */
export const BOAT_BEACH_DEPTH = 0.45;
/** Enter range from the hull outline (m) and vertical tolerance. */
export const VEHICLE_ENTER_RANGE = 2.4;
export const VEHICLE_ENTER_HEIGHT = 3.2;
/** An empty vehicle away from its spawn this long respawns there (s). */
export const VEHICLE_ABANDON_SECONDS = 75;
/** An empty, beached boat deflates after this long (s). */
export const VEHICLE_BEACHED_SECONDS = 10;
/** Destruction blast: damage to everyone near (credited), crew damage on ejection. */
export const VEHICLE_WRECK_BLAST = { damage: 55, radius: 6, crewDamage: 40, crewLaunch: 9 } as const;
/** Horn cooldown (s). */
export const VEHICLE_HORN_COOLDOWN = 0.9;
/** Rowers tap W together every 0.8 seconds, within 0.14 s of the beat. */
export const ROWBOAT_RHYTHM = { seconds: 0.8, toleranceSeconds: 0.14 } as const;
export const VEHICLE_REPAIR = { range: 3.5, hpPerSecond: 40 } as const;

/** Beat nearest a physics tick; shared by the authoritative rhythm and its HUD. */
export function rowingBeat(tick: number): { beat: number; aligned: boolean; phase: number } {
  const period = vehicleTicks(ROWBOAT_RHYTHM.seconds);
  const beat = Math.round(tick / period);
  return { beat, aligned: Math.abs(tick - beat * period) <= vehicleTicks(ROWBOAT_RHYTHM.toleranceSeconds), phase: (tick % period) / period };
}

export function vehicleDefinition(kind: DrivableVehicleKind): VehicleDefinition {
  return VEHICLES[kind];
}

/** A seat anchor (or any local point) in world space for a vehicle pose. */
export function vehicleLocalToWorld(position: Vec3, yaw: number, local: Vec3, pitch = 0, roll = 0): Vec3 {
  const cr = Math.cos(roll), sr = Math.sin(roll), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const x = local.x * cr - local.y * sr, y = local.x * sr + local.y * cr;
  const rotated = rotateY(x, local.z * cp - y * sp, yaw);
  return { x: position.x + rotated.x, y: position.y + y * cp + local.z * sp, z: position.z + rotated.z };
}

/** World point into vehicle local space, including optional nose-up pitch and bank. */
export function vehicleWorldToLocal(position: Vec3, yaw: number, world: Vec3, pitch = 0, roll = 0): Vec3 {
  const local = rotateY(world.x - position.x, world.z - position.z, -yaw);
  const cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll);
  const y = (world.y - position.y) * cp - local.z * sp;
  return { x: local.x * cr + y * sr, y: -local.x * sr + y * cr, z: (world.y - position.y) * sp + local.z * cp };
}

/** Yaw * nose-up pitch * bank, matching the renderer's root and tilt pivots. */
export function vehicleRotation(yaw: number, pitch = 0, roll = 0): { x: number; y: number; z: number; w: number } {
  const cy = Math.cos(yaw / 2), sy = Math.sin(yaw / 2), cx = Math.cos(-pitch / 2), sx = Math.sin(-pitch / 2), cz = Math.cos(roll / 2), sz = Math.sin(roll / 2);
  return { x: cy*sx*cz+sy*cx*sz, y: sy*cx*cz-cy*sx*sz, z: cy*cx*sz-sy*sx*cz, w: cy*cx*cz+sy*sx*sz };
}

/** Horizontal distance from a point to the hull outline (0 inside). */
export function distanceToHull(definition: VehicleDefinition, position: Vec3, yaw: number, point: Vec3): number {
  const local = vehicleWorldToLocal(position, yaw, point);
  const dx = Math.max(0, Math.abs(local.x) - definition.halfExtents.x);
  const dz = Math.max(0, Math.abs(local.z) - definition.halfExtents.z);
  return Math.hypot(dx, dz);
}

/**
 * Candidate exit spots around the hull in local space, best first: the
 * seat's own side, the other side, behind, in front, on top.
 */
export function exitCandidates(definition: VehicleDefinition, seatIndex: number): Vec3[] {
  const seat = definition.seats[seatIndex];
  const { x, z } = definition.halfExtents;
  const side = seat && seat.anchor.x > 0.05 ? 1 : -1;
  const along = seat ? Math.max(-z * 0.6, Math.min(z * 0.6, seat.anchor.z)) : 0;
  const margin = 0.85;
  return [
    { x: side * (x + margin), y: 0.2, z: along },
    { x: -side * (x + margin), y: 0.2, z: along },
    { x: side * (x + margin), y: 0.2, z: -z * 0.5 },
    { x: 0, y: 0.2, z: -(z + margin) },
    { x: 0, y: 0.2, z: z + margin },
    { x: -side * (x + margin), y: 0.2, z: z * 0.5 },
    { x: 0, y: definition.halfExtents.y * 2 + 0.25, z: 0 },
  ];
}

/** One vehicle slot of the map: a spawn point of a drivable kind. */
export interface VehicleSlot {
  /** Wire id (1-based, stable per map). */
  readonly id: number;
  readonly spawn: VehicleSpawnPoint;
  readonly kind: DrivableVehicleKind;
}

/** Every drivable vehicle slot of Fjord Fiesta in blueprint order. */
export const VEHICLE_SLOTS: readonly VehicleSlot[] = FJORD_VEHICLE_SPAWNS.flatMap((spawn, index) =>
  isDrivableKind(spawn.vehicle) ? [{ id: index + 1, spawn, kind: spawn.vehicle }] : [],
);

/**
 * Tower ownership as the conquest code (package 4T) sees it. Until that
 * code provides a real query, no tower counts as held, so `{ capture }`
 * spawns stay empty.
 */
export type TowerHeldQuery = (tower: TowerId, faction: Faction) => boolean;
export const NO_TOWERS_HELD: TowerHeldQuery = () => false;

/** Whether a slot's vehicle may be present right now. */
export function vehicleSlotActive(slot: VehicleSlot, isTowerHeldBy: TowerHeldQuery): boolean {
  const trigger = slot.spawn.trigger;
  if (trigger === 'base' || trigger === 'map') return true;
  return slot.spawn.faction !== null && isTowerHeldBy(trigger.capture, slot.spawn.faction);
}

/**
 * Whether a class may board, drive or gun a vehicle at all: only armed,
 * damageable classes (no mascots, no untouchable drifters). The server seat
 * gate and the client's enter prompt both ask this.
 */
export function classMayUseVehicles(classId: ClassId): boolean {
  const capabilities = classCapabilities(classId);
  return capabilities.armed && capabilities.damageable;
}

/** Faction-owned vehicles are reserved for their faction; map vehicles are open to all. */
export function mayEnterVehicle(slotFaction: Faction | null, occupantFaction: Faction | null, player: Faction): boolean {
  if (occupantFaction !== null) return occupantFaction === player;
  return slotFaction === null || slotFaction === player;
}

function raySphereDistance(origin: Vec3, direction: Vec3, center: Vec3, radius: number): number | null {
  const ox = origin.x - center.x;
  const oy = origin.y - center.y;
  const oz = origin.z - center.z;
  const b = ox * direction.x + oy * direction.y + oz * direction.z;
  const c = ox * ox + oy * oy + oz * oz - radius * radius;
  const discriminant = b * b - c;
  if (discriminant < 0) return null;
  const root = Math.sqrt(discriminant);
  const near = -b - root;
  if (near >= 0) return near;
  const far = -b + root;
  return far >= 0 ? 0 : null;
}

/**
 * Ray against a vehicle's hit volumes (yaw-rotated hull box resting on the
 * base, plus the optional dome/neck sphere). `direction` must be unit
 * length. Returns the distance along the ray or null.
 */
export function rayVehicleHull(
  definition: VehicleDefinition,
  position: Vec3,
  yaw: number,
  origin: Vec3,
  direction: Vec3,
  maxDistance: number,
  pitch = 0,
  roll = 0,
): number | null {
  const localOrigin = vehicleWorldToLocal(position, yaw, origin, pitch, roll);
  const localDirection = vehicleWorldToLocal({ x: 0, y: 0, z: 0 }, yaw, direction, pitch, roll);
  const o = [localOrigin.x, localOrigin.y - definition.halfExtents.y, localOrigin.z];
  const d = [localDirection.x, localDirection.y, localDirection.z];
  const h = [definition.halfExtents.x, definition.halfExtents.y, definition.halfExtents.z];
  let near = 0;
  let far = maxDistance;
  let hitBox = true;
  for (let axis = 0; axis < 3; axis += 1) {
    const origin1 = o[axis] ?? 0;
    const direction1 = d[axis] ?? 0;
    const half = h[axis] ?? 0;
    if (Math.abs(direction1) < 1e-8) {
      if (origin1 < -half || origin1 > half) {
        hitBox = false;
        break;
      }
      continue;
    }
    let t1 = (-half - origin1) / direction1;
    let t2 = (half - origin1) / direction1;
    if (t1 > t2) [t1, t2] = [t2, t1];
    near = Math.max(near, t1);
    far = Math.min(far, t2);
    if (near > far) {
      hitBox = false;
      break;
    }
  }
  let best = hitBox ? near : null;
  const sphere = definition.hitSphere;
  if (sphere) {
    const center = vehicleLocalToWorld(position, yaw, sphere.center);
    const t = raySphereDistance(origin, direction, center, sphere.radius);
    if (t !== null && t <= maxDistance && (best === null || t < best)) best = t;
  }
  return best;
}

/** Distance from a point to a vehicle's hit volumes (0 inside), for splash. */
export function distanceToVehicle(definition: VehicleDefinition, position: Vec3, yaw: number, point: Vec3): number {
  const local = vehicleWorldToLocal(position, yaw, point);
  const dx = Math.max(0, Math.abs(local.x) - definition.halfExtents.x);
  const dy = Math.max(0, Math.abs(local.y - definition.halfExtents.y) - definition.halfExtents.y);
  const dz = Math.max(0, Math.abs(local.z) - definition.halfExtents.z);
  let best = Math.hypot(dx, dy, dz);
  const sphere = definition.hitSphere;
  if (sphere) {
    const center = vehicleLocalToWorld(position, yaw, sphere.center);
    best = Math.min(best, Math.max(0, Math.hypot(point.x - center.x, point.y - center.y, point.z - center.z) - sphere.radius));
  }
  return best;
}

/** Wire flag bits of a vehicle snapshot. */
export const VEHICLE_FLAG = {
  Wreck: 1 << 0,
  Grounded: 1 << 1,
  Beached: 1 << 2,
  Afloat: 1 << 3,
  Handbrake: 1 << 4,
  Drowned: 1 << 5,
  ExtendedPose: 1 << 6,
} as const;

/** Map clamp so vehicles never leave the playable square. */
export const VEHICLE_MAP_LIMIT = MAP_HALF_SIZE - 4;
