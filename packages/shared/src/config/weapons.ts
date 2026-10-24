import type { GimmickWeaponId, Loadout, MainWeaponId, WeaponId, WeaponSlot } from '../types/index.js';
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

/** Every weapon id in the stable network order. Append new ids at the end. */
export const ALL_WEAPON_IDS = [
  'smg',
  'shotgun',
  'lmg',
  'bazooka',
  'sniper',
  'silenced_pistol',
  'knife',
  'snow_cannon',
  'sand_flamer',
  'crossbow',
  'halberd',
  'umbrella',
  'horn',
] as const satisfies readonly WeaponId[];

export const WEAPON_TABLE = createIdTable<WeaponId>(ALL_WEAPON_IDS);

export function isMainWeapon(id: WeaponId): id is MainWeaponId {
  return id in MAIN_WEAPONS;
}

export function weaponForSlot(loadout: Loadout, slot: WeaponSlot): WeaponId {
  if (slot === 1) return loadout.primary;
  if (slot === 2) return loadout.secondary;
  return loadout.gimmick;
}

export function weaponSlotForId(id: WeaponId): WeaponSlot {
  if (isMainWeapon(id)) return MAIN_WEAPONS[id].slot;
  return 3;
}

/** Unified combat numbers used by the server and the client HUD. */
export interface WeaponStats {
  readonly id: WeaponId;
  readonly slot: WeaponSlot;
  readonly damage: number;
  readonly rpm: number;
  readonly magazine: number;
  readonly reserve: number;
  readonly pellets: number;
  readonly spread: number;
  readonly range: number;
  readonly automatic: boolean;
  readonly projectileSpeed: number;
  readonly splashRadius: number;
  readonly headshotMultiplier: number;
  readonly reloadSeconds: number;
  readonly fireMode: 'hitscan' | 'projectile' | 'beam' | 'melee';
}

const MAIN_WEAPON_STATS: Record<MainWeaponId, WeaponStats> = Object.fromEntries(
  (Object.values(MAIN_WEAPONS) as MainWeaponDefinition[]).map((weapon) => {
    const fireMode: WeaponStats['fireMode'] =
      weapon.id === 'bazooka'
        ? 'projectile'
        : weapon.id === 'knife'
          ? 'melee'
          : 'hitscan';
    return [
      weapon.id,
      {
        id: weapon.id,
        slot: weapon.slot,
        damage: weapon.damage,
        rpm: weapon.rpm,
        magazine: weapon.magazine,
        reserve: weapon.reserve,
        pellets: weapon.pellets,
        spread: weapon.spread,
        range: weapon.range,
        automatic: weapon.automatic,
        projectileSpeed: weapon.projectileSpeed,
        splashRadius: weapon.id === 'bazooka' ? 5.5 : 0,
        headshotMultiplier: weapon.id === 'sniper' ? 2.4 : 1.8,
        reloadSeconds: weapon.id === 'bazooka' ? 2.4 : weapon.id === 'shotgun' ? 2.1 : 1.8,
        fireMode,
      } satisfies WeaponStats,
    ];
  }),
) as Record<MainWeaponId, WeaponStats>;

const GIMMICK_WEAPON_STATS: Record<GimmickWeaponId, WeaponStats> = {
  snow_cannon: {
    id: 'snow_cannon',
    slot: 3,
    damage: 5,
    rpm: 480,
    magazine: 0,
    reserve: 0,
    pellets: 1,
    spread: 0.055,
    range: 12,
    automatic: true,
    projectileSpeed: 0,
    splashRadius: 0,
    headshotMultiplier: 1,
    reloadSeconds: 0,
    fireMode: 'beam',
  },
  sand_flamer: {
    id: 'sand_flamer',
    slot: 3,
    damage: 7,
    rpm: 420,
    magazine: 0,
    reserve: 0,
    pellets: 1,
    spread: 0.075,
    range: 11,
    automatic: true,
    projectileSpeed: 0,
    splashRadius: 0,
    headshotMultiplier: 1,
    reloadSeconds: 0,
    fireMode: 'beam',
  },
  crossbow: {
    id: 'crossbow',
    slot: 3,
    damage: 55,
    rpm: 55,
    magazine: 1,
    reserve: 12,
    pellets: 1,
    spread: 0.004,
    range: 120,
    automatic: false,
    projectileSpeed: 180,
    splashRadius: 0,
    headshotMultiplier: 2,
    reloadSeconds: 1.1,
    fireMode: 'hitscan',
  },
  halberd: {
    id: 'halberd',
    slot: 3,
    damage: 75,
    rpm: 67,
    magazine: 0,
    reserve: 0,
    pellets: 1,
    spread: 0,
    range: 3.2,
    automatic: false,
    projectileSpeed: 0,
    splashRadius: 0,
    headshotMultiplier: 1.5,
    reloadSeconds: 0,
    fireMode: 'melee',
  },
  umbrella: {
    id: 'umbrella',
    slot: 3,
    damage: 0,
    rpm: 60,
    magazine: 0,
    reserve: 0,
    pellets: 1,
    spread: 0,
    range: 0,
    automatic: false,
    projectileSpeed: 0,
    splashRadius: 0,
    headshotMultiplier: 1,
    reloadSeconds: 0,
    fireMode: 'melee',
  },
  horn: {
    id: 'horn',
    slot: 3,
    damage: 15,
    rpm: 15,
    magazine: 0,
    reserve: 0,
    pellets: 1,
    spread: 0.02,
    range: 10,
    automatic: false,
    projectileSpeed: 0,
    splashRadius: 2.2,
    headshotMultiplier: 1,
    reloadSeconds: 0,
    fireMode: 'beam',
  },
};

export const WEAPON_STATS: Record<WeaponId, WeaponStats> = {
  ...MAIN_WEAPON_STATS,
  ...GIMMICK_WEAPON_STATS,
};

export function weaponStats(id: WeaponId): WeaponStats {
  return WEAPON_STATS[id];
}
