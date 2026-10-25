/**
 * Ambient critters: server-authoritative animals that wander the map, flee
 * from people and gunfire and can be bagged for fun (no score, tickets or
 * rewards). The system is generic over species; only the hen exists today,
 * the M5 village cow map toy is meant to reuse it.
 */
import { WATER_LEVEL } from '../constants.js';
import type { CritterBehaviour, CritterSpecies, Faction, Vec3, WeaponId } from '../types/index.js';
import type { ZoneId } from '../types/map.js';
import { createIdTable } from './ids.js';
import { zoneAt } from './map/gameplay.js';
import { WEAPON_TABLE } from './weapons.js';

/** Wire codes are indices: append new species at the end. */
export const CRITTER_SPECIES_IDS = ['hen'] as const satisfies readonly CritterSpecies[];
export const CRITTER_SPECIES_TABLE = createIdTable<CritterSpecies>(CRITTER_SPECIES_IDS);

/** Wire codes are indices (4 bits): append new behaviours at the end. */
export const CRITTER_BEHAVIOUR_IDS = [
  'idle',
  'walk',
  'peck',
  'scratch',
  'look',
  'flee',
] as const satisfies readonly CritterBehaviour[];
export const CRITTER_BEHAVIOUR_TABLE = createIdTable<CritterBehaviour>(CRITTER_BEHAVIOUR_IDS);

/** First game-event code reserved for critters (32–35), clear of the player event range. */
export const CRITTER_EVENT_CODE_BASE = 32;

export interface CritterSpeciesStats {
  /** How many live on each half of the map. */
  readonly perHalf: number;
  /** Visual size: standing height (m) the client scales the model to. */
  readonly height: number;
  readonly walkSpeed: number;
  readonly fleeSpeed: number;
  /** Heading change rate (rad/s) while walking and while fleeing. */
  readonly walkTurnRate: number;
  readonly fleeTurnRate: number;
  /** Probe distance ahead of the feet for walls, ledges and water. */
  readonly feelerDistance: number;
  /** Highest step the critter walks up without a hop. */
  readonly stepUp: number;
  /** Deepest drop the critter walks (or flutters) down. */
  readonly maxDrop: number;
  /**
   * Vertical speed of a wing-flap hop, and the (fluttering) gravity. A hop
   * also lifts the feeler, so a fleeing critter can flap onto a higher step.
   */
  readonly hopSpeed: number;
  readonly gravity: number;
  /** Seconds between flee hops (min, max). */
  readonly hopInterval: readonly [number, number];
  /** Hitbox: body sphere and head sphere in body space (forward along the heading). */
  readonly body: { readonly up: number; readonly forward: number; readonly radius: number };
  readonly head: { readonly up: number; readonly forward: number; readonly radius: number };
  /** Horizontal radius used for wall probes and spawn clearance. */
  readonly clearance: number;
  /** Players closer than this make it scatter. */
  readonly fleeRadius: number;
  /** A shot fired within this distance, or passing this close, scares it. */
  readonly gunfireRadius: number;
  readonly shotLaneRadius: number;
  /** Explosions scare it within their blast radius plus this margin. */
  readonly blastMargin: number;
  /** Flee burst duration (min, max seconds); re-armed while the threat stays close. */
  readonly fleeSeconds: readonly [number, number];
  /** Calm behaviour durations (min, max seconds). */
  readonly idleSeconds: readonly [number, number];
  readonly peckSeconds: readonly [number, number];
  readonly scratchSeconds: readonly [number, number];
  readonly lookSeconds: readonly [number, number];
  /** Wander goal distance (min, max metres). */
  readonly wanderDistance: readonly [number, number];
  /** Soft leash: goals beyond this distance from home are pulled back toward it. */
  readonly homeRadius: number;
  readonly respawnSeconds: number;
  /** Spawn rules: keep clear of spawn pads and of living players. */
  readonly spawnPadClearance: number;
  readonly spawnPlayerClearance: number;
  /**
   * Relative spawn weight of the nav nodes per map zone (missing = 1): hens
   * live where people are (village lanes, beaches, the harbour), rarely on
   * remote mountain roads.
   */
  readonly spawnZoneWeights: Readonly<Partial<Record<ZoneId, number>>>;
  /** Calm behaviour choice weights after a walk or a pause. */
  readonly behaviourWeights: Readonly<Record<'walk' | 'peck' | 'scratch' | 'look' | 'idle', number>>;
}

export const CRITTER_STATS: Readonly<Record<CritterSpecies, CritterSpeciesStats>> = {
  hen: {
    perHalf: 3,
    height: 0.46,
    walkSpeed: 0.7,
    fleeSpeed: 4.4,
    walkTurnRate: 4.2,
    fleeTurnRate: 11,
    feelerDistance: 0.4,
    stepUp: 0.32,
    maxDrop: 1.15,
    hopSpeed: 3.4,
    gravity: -16,
    hopInterval: [0.45, 0.95],
    // Matched to the painted model (body centred on the feet position, head front-top).
    body: { up: 0.23, forward: -0.02, radius: 0.17 },
    head: { up: 0.41, forward: 0.19, radius: 0.08 },
    clearance: 0.22,
    fleeRadius: 4,
    gunfireRadius: 13,
    shotLaneRadius: 2.6,
    blastMargin: 9,
    fleeSeconds: [1.5, 2.6],
    idleSeconds: [0.8, 2.2],
    peckSeconds: [1.8, 4.2],
    scratchSeconds: [1.1, 2.2],
    lookSeconds: [1.2, 2.6],
    wanderDistance: [2.5, 8],
    homeRadius: 30,
    respawnSeconds: 45,
    spawnPadClearance: 7,
    spawnPlayerClearance: 9,
    spawnZoneWeights: {
      village: 5,
      gasthof: 5,
      bistro: 5,
      tiki_alm: 5,
      harbor: 3,
      coconut_bay: 4,
      palm_point: 4,
      shoreline: 4,
      lagoon_base: 2,
      fjord: 1.5,
      summit: 1.5,
      alpine_base: 1,
      fir_woods: 1,
      glacier: 0.5,
      crags: 0.5,
      highlands: 0.4,
      gorge: 0.3,
      bridge: 0,
    },
    behaviourWeights: { walk: 0.42, peck: 0.3, scratch: 0.11, look: 0.12, idle: 0.05 },
  },
};

/** The species that populate the map, in id order. */
export const CRITTER_ROSTER: readonly CritterSpecies[] = ['hen'];

/**
 * Which half of the map a point belongs to for critters: the lagoon climate
 * (beaches, harbour, palm point, coconut bay) is the lagoon half; the alpine
 * village, gorge and mountains are the alpine half.
 */
export function critterHalfAt(x: number, z: number): Faction {
  return zoneAt(x, z).climate === 'lagoon' ? 'lagoon' : 'alpine';
}

/** Critters never stand on ground at or below the waterline. */
export function isCritterDryGround(height: number): boolean {
  return height >= WATER_LEVEL + 0.05;
}

/** World-space centre of a body-space hit sphere. */
export function critterSphereCenter(
  position: Vec3,
  yaw: number,
  sphere: { readonly up: number; readonly forward: number },
): Vec3 {
  return {
    x: position.x + Math.sin(yaw) * sphere.forward,
    y: position.y + sphere.up,
    z: position.z + Math.cos(yaw) * sphere.forward,
  };
}

/** CRITTER_KILLED `paramValue`: species code (low byte) | weapon code + 1 (high byte). */
export function critterKillValue(species: CritterSpecies, weaponId: WeaponId | null): number {
  const weapon = weaponId ? WEAPON_TABLE.code[weaponId] + 1 : 0;
  return (CRITTER_SPECIES_TABLE.code[species] & 0xff) | ((weapon & 0xff) << 8);
}

export function readCritterKillValue(value: number): { species: CritterSpecies | null; weaponId: WeaponId | null } {
  const weapon = (value >> 8) & 0xff;
  return {
    species: CRITTER_SPECIES_TABLE.byCode[value & 0xff] ?? null,
    weaponId: weapon > 0 ? (WEAPON_TABLE.byCode[weapon - 1] ?? null) : null,
  };
}
