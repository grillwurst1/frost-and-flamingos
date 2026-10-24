import type { GimmickWeaponId, MainWeaponId, WeaponSlot } from '../types/index.js';
import { createIdTable } from './ids.js';

/** Slot 1: the primary workhorse. */
export const PRIMARY_WEAPON_IDS = ['smg', 'lmg', 'sniper'] as const satisfies readonly MainWeaponId[];
/** Slot 2: close support, launchers and sidearms. */
export const SECONDARY_WEAPON_IDS = [
  'shotgun',
  'bazooka',
  'silenced_pistol',
  'knife',
] as const satisfies readonly MainWeaponId[];
/** Slot 3: the class-defining gimmick. */
export const GIMMICK_WEAPON_IDS = [
  'snow_cannon',
  'sand_flamer',
  'crossbow',
  'halberd',
  'umbrella',
  'horn',
] as const satisfies readonly GimmickWeaponId[];

export const PRIMARY_WEAPON_TABLE = createIdTable<MainWeaponId>(PRIMARY_WEAPON_IDS);
export const SECONDARY_WEAPON_TABLE = createIdTable<MainWeaponId>(SECONDARY_WEAPON_IDS);
export const GIMMICK_WEAPON_TABLE = createIdTable<GimmickWeaponId>(GIMMICK_WEAPON_IDS);

export interface MainWeaponDefinition {
  id: MainWeaponId;
  slot: WeaponSlot;
  damage: number;
  rpm: number;
  magazine: number;
  reserve: number;
  projectileSpeed: number;
  spread: number;
  pellets: number;
  automatic: boolean;
  range: number;
}

export interface GimmickWeaponDefinition {
  id: GimmickWeaponId;
  slot: 3;
  damagePerSecond: number;
  range: number;
  cooldownSeconds: number;
}

export const MAIN_WEAPONS: Record<MainWeaponId, MainWeaponDefinition> = {
  smg: {
    id: 'smg',
    slot: 1,
    damage: 14,
    rpm: 450,
    magazine: 30,
    reserve: 150,
    projectileSpeed: 120,
    spread: 0.022,
    pellets: 1,
    automatic: true,
    range: 90,
  },
  shotgun: {
    id: 'shotgun',
    slot: 2,
    damage: 8,
    rpm: 72,
    magazine: 6,
    reserve: 36,
    projectileSpeed: 90,
    spread: 0.11,
    pellets: 8,
    automatic: false,
    range: 30,
  },
  lmg: {
    id: 'lmg',
    slot: 1,
    damage: 12,
    rpm: 600,
    magazine: 75,
    reserve: 225,
    projectileSpeed: 130,
    spread: 0.035,
    pellets: 1,
    automatic: true,
    range: 110,
  },
  bazooka: {
    id: 'bazooka',
    slot: 2,
    damage: 65,
    rpm: 40,
    magazine: 1,
    reserve: 6,
    projectileSpeed: 35,
    spread: 0.005,
    pellets: 1,
    automatic: false,
    range: 200,
  },
  sniper: {
    id: 'sniper',
    slot: 1,
    damage: 65,
    rpm: 55,
    magazine: 5,
    reserve: 25,
    projectileSpeed: 280,
    spread: 0.002,
    pellets: 1,
    automatic: false,
    range: 400,
  },
  silenced_pistol: {
    id: 'silenced_pistol',
    slot: 2,
    damage: 22,
    rpm: 300,
    magazine: 12,
    reserve: 72,
    projectileSpeed: 140,
    spread: 0.012,
    pellets: 1,
    automatic: false,
    range: 80,
  },
  knife: {
    id: 'knife',
    slot: 2,
    damage: 50,
    rpm: 75,
    magazine: 1,
    reserve: 1,
    projectileSpeed: 0,
    spread: 0,
    pellets: 1,
    automatic: false,
    range: 2.4,
  },
};

export const GIMMICK_WEAPONS: Record<GimmickWeaponId, GimmickWeaponDefinition> = {
  snow_cannon: {
    id: 'snow_cannon',
    slot: 3,
    damagePerSecond: 26,
    range: 12,
    cooldownSeconds: 0,
  },
  sand_flamer: {
    id: 'sand_flamer',
    slot: 3,
    damagePerSecond: 42,
    range: 11,
    cooldownSeconds: 0,
  },
  crossbow: {
    id: 'crossbow',
    slot: 3,
    damagePerSecond: 55,
    range: 120,
    cooldownSeconds: 1.1,
  },
  halberd: {
    id: 'halberd',
    slot: 3,
    damagePerSecond: 75,
    range: 3.2,
    cooldownSeconds: 0.9,
  },
  umbrella: {
    id: 'umbrella',
    slot: 3,
    damagePerSecond: 0,
    range: 0,
    cooldownSeconds: 0,
  },
  horn: {
    id: 'horn',
    slot: 3,
    damagePerSecond: 15,
    range: 10,
    cooldownSeconds: 4,
  },
};
