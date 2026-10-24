import { get, writable } from 'svelte/store';
import {
  BACK_IDS,
  CLASS_DEFAULT_LOADOUTS,
  CLASS_IDS,
  FACE_IDS,
  FEET_IDS,
  GIMMICK_WEAPON_IDS,
  HAIR_COLORS,
  HAIR_STYLE_IDS,
  HANDS_IDS,
  HEADGEAR_IDS,
  LEGS_IDS,
  PRIMARY_WEAPON_IDS,
  SECONDARY_WEAPON_IDS,
  SKIN_TONES,
  TORSO_IDS,
  createDefaultCosmetics,
  createDefaultProfile,
  normalizeProfile,
  sanitizeDisplayName,
  type BackId,
  type ClassId,
  type Cosmetics,
  type FaceId,
  type FeetId,
  type Faction,
  type GimmickWeaponId,
  type HandsId,
  type HeadgearId,
  type LegsId,
  type Loadout,
  type MainWeaponId,
  type PlayerProfile,
  type TorsoId,
} from '@frost-and-flamingos/shared';

const STORAGE_KEY = 'frost-and-flamingos.profile';

const CALLSIGNS = [
  'Alpine Otter',
  'Fondue Fox',
  'Glacier Gull',
  'Coconut Ibex',
  'Snow Flamingo',
  'Marmot Major',
  'Lagoon Lynx',
  'Edelweiss Eel',
  'Summit Seal',
  'Beach Badger',
  'Raclette Raven',
  'Pineapple Puma',
] as const;

function randomCallsign(): string {
  const index = Math.floor(Math.random() * CALLSIGNS.length);
  return CALLSIGNS[index] ?? CALLSIGNS[0];
}

function loadProfile(): PlayerProfile {
  const fallback = createDefaultProfile(randomCallsign());
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    return normalizeProfile(JSON.parse(raw) as unknown, fallback);
  } catch {
    return fallback;
  }
}

export const profile = writable<PlayerProfile>(loadProfile());

profile.subscribe((value) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Hardened browser profiles may block storage; the session still works.
  }
});

export function getProfile(): PlayerProfile {
  return get(profile);
}

export function setProfile(next: PlayerProfile): void {
  profile.set(normalizeProfile(next, get(profile)));
}

/**
 * Applies the server's sanitised appearance and loadout without discarding the
 * player's faction preference. The server may assign the other faction for team
 * balance; that assignment lives in the authoritative in-match profile and must
 * not rewrite what the player picked in the wardrobe.
 */
export function applyServerProfile(next: PlayerProfile): void {
  profile.update((current) =>
    normalizeProfile({ ...next, faction: current.faction }, current),
  );
}

export function setDisplayName(name: string): void {
  profile.update((current) => ({
    ...current,
    displayName: sanitizeDisplayName(name, current.displayName),
  }));
}

export function setFaction(faction: Faction): void {
  profile.update((current) => ({ ...current, faction }));
}

export function setClass(classId: ClassId): void {
  profile.update((current) => {
    if (current.cosmetics.classId === classId) return current;
    return {
      ...current,
      cosmetics: createDefaultCosmetics(classId),
      loadout: { ...CLASS_DEFAULT_LOADOUTS[classId] },
    };
  });
}

export function updateCosmetics(partial: Partial<Cosmetics>): void {
  profile.update((current) => ({
    ...current,
    cosmetics: { ...current.cosmetics, ...partial },
  }));
}

export function setBodyType(value: number): void {
  updateCosmetics({ bodyType: Math.min(1, Math.max(0, value)) });
}

export function setSkinTone(index: number): void {
  updateCosmetics({ skinToneIndex: Math.min(SKIN_TONES.length - 1, Math.max(0, index)) });
}

export function setHairColor(index: number): void {
  updateCosmetics({ hairColorIndex: Math.min(HAIR_COLORS.length - 1, Math.max(0, index)) });
}

export function setHairStyle(index: number): void {
  updateCosmetics({
    hairStyleIndex: Math.min(HAIR_STYLE_IDS.length - 1, Math.max(0, index)),
  });
}

export function setVoicePitch(value: number): void {
  updateCosmetics({ voicePitch: Math.min(1.25, Math.max(0.8, value)) });
}

export function setHeadgear(id: HeadgearId): void {
  updateCosmetics({ headgear: id });
}

export function setFace(id: FaceId): void {
  updateCosmetics({ face: id });
}

export function setTorso(id: TorsoId): void {
  updateCosmetics({ torso: id });
}

export function setBack(id: BackId): void {
  updateCosmetics({ back: id });
}

export function setHands(id: HandsId): void {
  updateCosmetics({ hands: id });
}

export function setLegs(id: LegsId): void {
  updateCosmetics({ legs: id });
}

export function setFeet(id: FeetId): void {
  updateCosmetics({ feet: id });
}

export function setLoadoutSlot<K extends keyof Loadout>(slot: K, value: Loadout[K]): void {
  profile.update((current) => ({
    ...current,
    loadout: { ...current.loadout, [slot]: value },
  }));
}

export function setPrimary(id: MainWeaponId): void {
  setLoadoutSlot('primary', id);
}

export function setSecondary(id: MainWeaponId): void {
  setLoadoutSlot('secondary', id);
}

export function setGimmick(id: GimmickWeaponId): void {
  setLoadoutSlot('gimmick', id);
}

function pick<T>(values: readonly T[]): T {
  return values[Math.floor(Math.random() * values.length)] ?? values[0]!;
}

export function randomizeProfile(): void {
  profile.update((current) => {
    const classId = pick(CLASS_IDS);
    const defaults = createDefaultCosmetics(classId);
    return {
      ...current,
      cosmetics: {
        ...defaults,
        classId,
        bodyType: Math.round(Math.random() * 100) / 100,
        skinToneIndex: Math.floor(Math.random() * SKIN_TONES.length),
        hairColorIndex: Math.floor(Math.random() * HAIR_COLORS.length),
        hairStyleIndex: Math.floor(Math.random() * HAIR_STYLE_IDS.length),
        headgear: pick(HEADGEAR_IDS),
        face: pick(FACE_IDS),
        torso: pick(TORSO_IDS),
        back: pick(BACK_IDS),
        hands: pick(HANDS_IDS),
        legs: pick(LEGS_IDS),
        feet: pick(FEET_IDS),
        voicePitch: Math.round((0.8 + Math.random() * 0.45) * 100) / 100,
      },
      loadout: {
        primary: pick(PRIMARY_WEAPON_IDS),
        secondary: pick(SECONDARY_WEAPON_IDS),
        gimmick: pick(GIMMICK_WEAPON_IDS),
      },
    };
  });
}

export function resetProfile(): void {
  profile.update((current) =>
    createDefaultProfile(current.displayName || randomCallsign(), current.cosmetics.classId),
  );
}

/** Stable fingerprint used to decide whether a profile packet must be sent. */
export function profileFingerprint(value: PlayerProfile): string {
  return JSON.stringify([
    value.displayName,
    value.faction,
    value.cosmetics.classId,
    Math.round(value.cosmetics.bodyType * 255),
    value.cosmetics.skinToneIndex,
    value.cosmetics.hairColorIndex,
    value.cosmetics.hairStyleIndex,
    value.cosmetics.headgear,
    value.cosmetics.face,
    value.cosmetics.torso,
    value.cosmetics.back,
    value.cosmetics.hands,
    value.cosmetics.legs,
    value.cosmetics.feet,
    Math.round(value.cosmetics.voicePitch * 100),
    value.loadout.primary,
    value.loadout.secondary,
    value.loadout.gimmick,
  ]);
}
