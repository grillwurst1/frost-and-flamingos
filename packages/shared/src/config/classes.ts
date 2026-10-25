import type { ClassId, Faction, Loadout, MascotForm } from '../types/index.js';
import { createIdTable } from './ids.js';

/** Wire codes are array indices: append new classes at the end, never reorder. */
export const CLASS_IDS = ['allrounder', 'heavy', 'infiltrator', 'mascot'] as const satisfies readonly ClassId[];

export const CLASS_TABLE = createIdTable<ClassId>(CLASS_IDS);

export interface ClassStats {
  id: ClassId;
  maxHp: number;
  moveSpeed: number;
  sprintMultiplier: number;
  radius: number;
  height: number;
  jumpSpeed: number;
  groundAcceleration: number;
  airAcceleration: number;
  groundFriction: number;
}

/**
 * Physical bodies of the two mascot forms. The cow is a 2.2 m long, 1.5 m tall
 * quadruped on a vertical capsule (its combat hitbox is a horizontal capsule
 * along the heading); the coconut is a 1.4 m ball.
 */
export const MASCOT_FORM_STATS: Record<MascotForm, ClassStats> = {
  cow: {
    id: 'mascot',
    maxHp: 260,
    moveSpeed: 6.4,
    sprintMultiplier: 1.8,
    radius: 0.62,
    height: 1.5,
    jumpSpeed: 4.4,
    groundAcceleration: 8.5,
    airAcceleration: 0,
    groundFriction: 4.2,
  },
  coconut: {
    id: 'mascot',
    maxHp: 200,
    moveSpeed: 10.5,
    sprintMultiplier: 1,
    radius: 0.7,
    height: 1.4,
    jumpSpeed: 10.2,
    groundAcceleration: 13,
    airAcceleration: 5,
    groundFriction: 1.3,
  },
};

export const CLASS_STATS: Record<ClassId, ClassStats> = {
  allrounder: {
    id: 'allrounder',
    maxHp: 150,
    moveSpeed: 7,
    sprintMultiplier: 1.35,
    radius: 0.45,
    height: 1.8,
    jumpSpeed: 7.9,
    groundAcceleration: 56,
    airAcceleration: 22.4,
    groundFriction: 11,
  },
  heavy: {
    id: 'heavy',
    maxHp: 220,
    moveSpeed: 5.6,
    sprintMultiplier: 1.35,
    radius: 0.62,
    height: 1.95,
    jumpSpeed: 7.9,
    groundAcceleration: 42,
    airAcceleration: 16.8,
    groundFriction: 10,
  },
  infiltrator: {
    id: 'infiltrator',
    maxHp: 110,
    moveSpeed: 8.1,
    sprintMultiplier: 1.35,
    radius: 0.38,
    height: 1.75,
    jumpSpeed: 7.9,
    groundAcceleration: 66,
    airAcceleration: 26.4,
    groundFriction: 12,
  },
  // Nominal entry only (the cow): a mascot's real body depends on its form.
  // Always use classStatsFor(classId, faction) for gameplay numbers.
  mascot: MASCOT_FORM_STATS.cow,
};

/**
 * What a class may do in a round. Gameplay code asks these flags instead of
 * comparing class ids, so a later class can opt in or out explicitly.
 */
export interface ClassCapabilities {
  /** Carries and fires weapons (and reloads). */
  readonly armed: boolean;
  /** Has the Q/E/T class skills. */
  readonly skills: boolean;
  /** Can take damage, die and be credited as a kill. */
  readonly damageable: boolean;
  /** Is hit by shots, splash, rams, shockwaves and status effects; blocks nothing otherwise. */
  readonly targetable: boolean;
  /** Counts toward a weather tower's capture balance (read by the M5 conquest code). */
  readonly canCapture: boolean;
  /** Counts when the server balances the two teams. */
  readonly countsTowardBalance: boolean;
  /** Bots may play the class. */
  readonly botsMayPick: boolean;
}

const COMBAT_CLASS: ClassCapabilities = {
  armed: true,
  skills: true,
  damageable: true,
  targetable: true,
  canCapture: true,
  countsTowardBalance: true,
  botsMayPick: true,
};

export const CLASS_CAPABILITIES: Readonly<Record<ClassId, ClassCapabilities>> = {
  allrounder: COMBAT_CLASS,
  heavy: COMBAT_CLASS,
  infiltrator: COMBAT_CLASS,
  // Mascots fight with their bodies: no firearms, motor-driven moves.
  mascot: { ...COMBAT_CLASS, armed: false, skills: false },
};

export function classCapabilities(classId: ClassId): ClassCapabilities {
  return CLASS_CAPABILITIES[classId];
}

/** Peak Guard brings the cow, the Lagoon League rolls in the coconut. */
export function mascotFormForFaction(faction: Faction): MascotForm {
  return faction === 'lagoon' ? 'coconut' : 'cow';
}

export function mascotFormOf(classId: ClassId, faction: Faction): MascotForm | null {
  return classId === 'mascot' ? mascotFormForFaction(faction) : null;
}

/** Gameplay stats for a class, resolving the mascot form from the faction. */
export function classStatsFor(classId: ClassId, faction: Faction): ClassStats {
  if (classId === 'mascot') return MASCOT_FORM_STATS[mascotFormForFaction(faction)];
  return CLASS_STATS[classId];
}

export const FACTION_THEME: Record<
  Faction,
  {
    nameKey: string;
    shortNameKey: string;
    primaryHex: string;
    secondaryHex: string;
    accentHex: string;
    darkHex: string;
    uiGradient: [string, string];
  }
> = {
  alpine: {
    nameKey: 'factions.alpine.name',
    shortNameKey: 'factions.alpine.short',
    primaryHex: '#e8f4ff',
    secondaryHex: '#c62f45',
    accentHex: '#f4c95d',
    darkHex: '#12324b',
    uiGradient: ['#dff4ff', '#7db7d8'],
  },
  lagoon: {
    nameKey: 'factions.lagoon.name',
    shortNameKey: 'factions.lagoon.short',
    primaryHex: '#12b8a6',
    secondaryHex: '#ff6b5e',
    accentHex: '#ffd166',
    darkHex: '#073f4b',
    uiGradient: ['#ffd6a5', '#ff7f73'],
  },
};

export const DEFAULT_CLASS: ClassId = 'allrounder';

/**
 * Starting kits. They are deliberately slot-correct and only a suggestion:
 * every loadout slot can be changed independently in the wardrobe.
 */
export const CLASS_DEFAULT_LOADOUTS: Record<ClassId, Loadout> = {
  allrounder: {
    primary: 'smg',
    secondary: 'shotgun',
    gimmick: 'horn',
  },
  heavy: {
    primary: 'lmg',
    secondary: 'bazooka',
    gimmick: 'snow_cannon',
  },
  infiltrator: {
    primary: 'sniper',
    secondary: 'silenced_pistol',
    gimmick: 'crossbow',
  },
  // Mascots carry no firearms. The loadout stays valid so the profile can
  // round-trip, but the server never equips it for a mascot.
  mascot: {
    primary: 'smg',
    secondary: 'shotgun',
    gimmick: 'horn',
  },
};
