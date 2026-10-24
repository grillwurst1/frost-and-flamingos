import type { ClassId, Loadout, PlayerProfile } from '../types/index.js';
import { CLASS_DEFAULT_LOADOUTS, DEFAULT_CLASS } from './classes.js';
import {
  createDefaultCosmetics,
  DEFAULT_COSMETICS,
  normalizeCosmetics,
} from './cosmetics.js';
import { isRecord, isTableId } from './ids.js';
import {
  GIMMICK_WEAPON_TABLE,
  PRIMARY_WEAPON_TABLE,
  SECONDARY_WEAPON_TABLE,
} from './weapons.js';

export const MAX_DISPLAY_NAME_LENGTH = 24;

/** Removes control characters, trims and enforces the display-name limit. */
export function sanitizeDisplayName(name: string, fallback: string): string {
  const cleaned = name
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, MAX_DISPLAY_NAME_LENGTH);
  return cleaned.length > 0 ? cleaned : fallback;
}

export function normalizeLoadout(input: unknown, fallback: Loadout): Loadout {
  const record = isRecord(input) ? input : {};
  return {
    primary: isTableId(PRIMARY_WEAPON_TABLE, record.primary)
      ? record.primary
      : fallback.primary,
    secondary: isTableId(SECONDARY_WEAPON_TABLE, record.secondary)
      ? record.secondary
      : fallback.secondary,
    gimmick: isTableId(GIMMICK_WEAPON_TABLE, record.gimmick)
      ? record.gimmick
      : fallback.gimmick,
  };
}

export function createDefaultProfile(
  displayName: string,
  classId: ClassId = DEFAULT_CLASS,
): PlayerProfile {
  return {
    displayName: sanitizeDisplayName(displayName, 'Vacationer'),
    faction: 'alpine',
    cosmetics: createDefaultCosmetics(classId),
    loadout: { ...CLASS_DEFAULT_LOADOUTS[classId] },
  };
}

export const DEFAULT_PROFILE: PlayerProfile = createDefaultProfile('Vacationer');

/**
 * Validates any untrusted profile-shaped value. Invalid enum values fall back
 * to the supplied profile; numeric cosmetic indices are clamped.
 */
export function normalizeProfile(
  input: unknown,
  fallback: PlayerProfile = DEFAULT_PROFILE,
): PlayerProfile {
  const record = isRecord(input) ? input : {};
  const displayName =
    typeof record.displayName === 'string'
      ? sanitizeDisplayName(record.displayName, fallback.displayName)
      : fallback.displayName;
  const faction =
    record.faction === 'alpine' || record.faction === 'lagoon'
      ? record.faction
      : fallback.faction;
  const cosmetics = normalizeCosmetics(record.cosmetics, fallback.cosmetics);
  const loadout = normalizeLoadout(record.loadout, fallback.loadout);
  return { displayName, faction, cosmetics, loadout };
}

/**
 * Stable key for everything that affects the rendered character. Display name,
 * loadout and voice pitch deliberately do not force a mesh rebuild.
 */
export function profileAppearanceKey(profile: PlayerProfile): string {
  const c = profile.cosmetics;
  return [
    profile.faction,
    c.classId,
    c.bodyType,
    c.skinToneIndex,
    c.hairColorIndex,
    c.hairStyleIndex,
    c.headgear,
    c.face,
    c.torso,
    c.back,
    c.hands,
    c.legs,
    c.feet,
  ].join('|');
}

/** Used by the client to show a useful default even for an empty profile. */
export function profileFromCosmetics(
  cosmetics: PlayerProfile['cosmetics'],
  displayName = 'Vacationer',
  faction: PlayerProfile['faction'] = 'alpine',
  loadout: Loadout = CLASS_DEFAULT_LOADOUTS[DEFAULT_CLASS],
): PlayerProfile {
  return {
    displayName: sanitizeDisplayName(displayName, 'Vacationer'),
    faction,
    cosmetics: normalizeCosmetics(cosmetics, DEFAULT_COSMETICS),
    loadout: normalizeLoadout(loadout, CLASS_DEFAULT_LOADOUTS[DEFAULT_CLASS]),
  };
}
