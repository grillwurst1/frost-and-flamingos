/**
 * Climate Conquest rules (game-decisions 14.1 "8v8 Climate Conquest", 10.3
 * weather towers, 10.6 spawns, 11.5 dynamic weather). The server simulates
 * them in integer units per fixed tick so a round replays bit-identically;
 * client and server share the capture-zone test.
 */
import { MATCH_TICKETS, PHYSICS_TICK_RATE } from '../constants.js';
import type { Faction, TowerDefinition, TowerId, Vec3 } from '../types/index.js';
import { FJORD_TOWERS } from './map-fjord.js';

/** Wire and HUD order of the weather towers (badges A, B, C). */
export const TOWER_ORDER = ['tower_a', 'tower_b', 'tower_c'] as const satisfies readonly TowerId[];

export const TOWER_LETTERS: Readonly<Record<TowerId, 'A' | 'B' | 'C'>> = {
  tower_a: 'A',
  tower_b: 'B',
  tower_c: 'C',
};

export function towerIndex(id: TowerId): 0 | 1 | 2 {
  return id === 'tower_a' ? 0 : id === 'tower_b' ? 1 : 2;
}

/** Tower definitions in wire order. */
export const CONQUEST_TOWERS: readonly TowerDefinition[] = TOWER_ORDER.map((id) => {
  const tower = FJORD_TOWERS.find((candidate) => candidate.id === id);
  if (!tower) throw new Error(`The Fjord Fiesta blueprint is missing ${id}.`);
  return tower;
});

/**
 * Tuning. Numbers from the design record: 50 tickets, 16 m zone (blueprint
 * `captureRadius`), 8 s capture alone / 4 s with three or more, ±0.015/s
 * weather per held tower. The record leaves the rest open; chosen here:
 * - capture speed follows the head-count advantage (2 = 6 s);
 * - neutralising an enemy tower is twice as fast as raising a flag;
 * - an empty zone drifts back to its owner (or to neutral) in 24 s;
 * - each death costs the victim's team 1 ticket;
 * - the team holding fewer towers bleeds 1 ticket per 6 s per tower of deficit;
 * - a round also ends after 20 minutes (more tickets wins, equal = draw);
 * - 15 s results intermission, then a deterministic reset.
 */
export const CONQUEST_RULES = {
  startTickets: MATCH_TICKETS,
  /** Neutral → owned, by advantage of capture-capable players: 1, 2, 3+. */
  captureSeconds: [8, 6, 4],
  /** Owned → neutral (or undoing a rival's partial capture), by advantage. */
  neutraliseSeconds: [4, 3, 2],
  /** Seconds an empty zone takes to drift a full sweep back. */
  recoverSeconds: 24,
  /** Capture cylinder: below / above the tower's reference height (m). */
  zoneBelow: 4.5,
  zoneAbove: 16,
  deathTicketCost: 1,
  bleedSecondsPerTicket: 6,
  weatherPerTowerPerSecond: 0.015,
  roundSeconds: 20 * 60,
  intermissionSeconds: 15,
} as const;

/** Damage immunity after every (re)spawn; the HUD and pads show it for this long. */
export const SPAWN_PROTECTION_SECONDS = 2;

/** PLAYER_RESPAWNED carries the spawn facing as a uint16 turn fraction (paramX = 1 marks it valid). */
export function spawnYawToWire(yaw: number): number {
  const turn = Math.PI * 2;
  const normalized = ((yaw % turn) + turn) % turn;
  return Math.round((normalized / turn) * 65535) & 0xffff;
}

export function wireToSpawnYaw(value: number): number {
  return (value / 65535) * Math.PI * 2;
}

/** Integer capture units of a full sweep; divisible by every per-tick rate below. */
export const CONTROL_FULL = 2880;
/** Integer weather units per |weatherBalance| = 1: one unit per tick per held tower. */
export const WEATHER_FULL = Math.round(1 / (CONQUEST_RULES.weatherPerTowerPerSecond / PHYSICS_TICK_RATE));

function ratePerTick(seconds: number): number {
  return Math.round(CONTROL_FULL / (seconds * PHYSICS_TICK_RATE));
}

function bySide(table: readonly number[], advantage: number): number {
  const index = Math.max(0, Math.min(table.length - 1, advantage - 1));
  return ratePerTick(table[index] ?? table[0] ?? 8);
}

/** Capture units per tick toward the pushing side (advantage ≥ 1). */
export function captureRatePerTick(advantage: number): number {
  return advantage <= 0 ? 0 : bySide(CONQUEST_RULES.captureSeconds, advantage);
}

/** Units per tick while the push pulls the control back toward neutral. */
export function neutraliseRatePerTick(advantage: number): number {
  return advantage <= 0 ? 0 : bySide(CONQUEST_RULES.neutraliseSeconds, advantage);
}

export const RECOVER_RATE_PER_TICK = ratePerTick(CONQUEST_RULES.recoverSeconds);
export const BLEED_TICKS_PER_TICKET = CONQUEST_RULES.bleedSecondsPerTicket * PHYSICS_TICK_RATE;
export const ROUND_TICKS = CONQUEST_RULES.roundSeconds * PHYSICS_TICK_RATE;
export const INTERMISSION_TICKS = CONQUEST_RULES.intermissionSeconds * PHYSICS_TICK_RATE;

/** Sign of a faction on the control axis: Peak Guard −1, Lagoon League +1. */
export function controlSign(faction: Faction): -1 | 1 {
  return faction === 'alpine' ? -1 : 1;
}

/** True when a body's feet are inside a tower's capture cylinder. */
export function insideCaptureZone(tower: TowerDefinition, position: Vec3): boolean {
  const dy = position.y - tower.position.y;
  if (dy < -CONQUEST_RULES.zoneBelow || dy > CONQUEST_RULES.zoneAbove) return false;
  const dx = position.x - tower.position.x;
  const dz = position.z - tower.position.z;
  return dx * dx + dz * dz <= tower.captureRadius * tower.captureRadius;
}

/** Wire index of the capture zone a position stands in, or -1. Zones never overlap. */
export function captureZoneIndexAt(position: Vec3): number {
  for (let index = 0; index < CONQUEST_TOWERS.length; index += 1) {
    const tower = CONQUEST_TOWERS[index];
    if (tower && insideCaptureZone(tower, position)) return index;
  }
  return -1;
}
