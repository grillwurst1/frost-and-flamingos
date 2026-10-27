import type {
  BackId,
  ClassId,
  Cosmetics,
  FaceId,
  FeetId,
  HandsId,
  HeadgearId,
  LegsId,
  TorsoId,
} from '../types/index.js';
import { CLASS_TABLE } from './classes.js';
import { createIdTable, isRecord, isTableId } from './ids.js';

export interface CosmeticPalette {
  primary: string;
  secondary: string;
  accent: string;
}

/**
 * Cosmetic ids double as wardrobe labels. The order is the network contract:
 * append new items at the end, never reorder an existing table.
 */
export const HEADGEAR_IDS = [
  'head_none',
  'head_tirol',
  'head_fondue_pot',
  'head_marmot_fur',
  'head_captain_cap',
  'head_watermelon',
  'head_flamingo_hat',
  'head_diving_bell',
] as const satisfies readonly HeadgearId[];

export const FACE_IDS = [
  'face_none',
  'face_full_beard',
  'face_mustache',
  'face_icicle_beard',
  'face_bubble_pipe',
  'face_snorkel_mask',
  'face_eyepatch_beard',
  'face_flamingo_shades',
  'face_sunscreen',
] as const satisfies readonly FaceId[];

export const TORSO_IDS = [
  'torso_tracht_shirt',
  'torso_dirndl_vest',
  'torso_loden_coat',
  'torso_hawaii_shirt',
  'torso_flamingo_ring',
  'torso_bathrobe',
  'torso_bare_suspenders',
  'torso_barrel_armor',
  'torso_field_vest',
] as const satisfies readonly TorsoId[];

export const BACK_IDS = [
  'back_none',
  'back_cuckoo_clock',
  'back_leather_pack',
  'back_lifebuoy',
  'back_surfboard',
  'back_mini_bbq',
] as const satisfies readonly BackId[];

export const HANDS_IDS = [
  'hands_bare',
  'hands_mittens',
  'hands_boxing',
  'hands_pirate_hook',
  'hands_gold_watch',
] as const satisfies readonly HandsId[];

export const LEGS_IDS = [
  'legs_lederhosen',
  'legs_striped_trousers',
  'legs_olive_pants',
  'legs_boardshorts',
  'legs_long_johns',
] as const satisfies readonly LegsId[];

export const FEET_IDS = [
  'feet_mountain_boots',
  'feet_ski_boots',
  'feet_dive_flippers',
  'feet_sandals_socks',
  'feet_peg_leg',
] as const satisfies readonly FeetId[];

export const HAIR_STYLE_IDS = [
  'buzzcut',
  'afro',
  'long_waves',
  'braids',
  'ponytail',
  'pompadour',
  'bald',
] as const;

export const HEADGEAR_TABLE = createIdTable<HeadgearId>(HEADGEAR_IDS);
export const FACE_TABLE = createIdTable<FaceId>(FACE_IDS);
export const TORSO_TABLE = createIdTable<TorsoId>(TORSO_IDS);
export const BACK_TABLE = createIdTable<BackId>(BACK_IDS);
export const HANDS_TABLE = createIdTable<HandsId>(HANDS_IDS);
export const LEGS_TABLE = createIdTable<LegsId>(LEGS_IDS);
export const FEET_TABLE = createIdTable<FeetId>(FEET_IDS);

/** Twelve curated tones, from rosy alpine to deep warm brown. */
export const SKIN_TONES = [
  '#fad7c0',
  '#f3c2a2',
  '#e8ad88',
  '#d99568',
  '#c67d4e',
  '#b06a3b',
  '#8e5129',
  '#733e1d',
  '#5c2e14',
  '#48220e',
  '#361809',
  '#261005',
] as const;

/** Signature ginger first, then the rest of the wardrobe palette. */
export const HAIR_COLORS = [
  '#ff5511',
  '#b83214',
  '#f2c94c',
  '#f5efe0',
  '#6b3a20',
  '#3b2010',
  '#1a1a1d',
  '#dcdfe4',
] as const;

export const HEADGEAR_PALETTES: Record<HeadgearId, CosmeticPalette> = {
  head_none: { primary: '#9bb9c9', secondary: '#6b747c', accent: '#f4c95d' },
  head_tirol: { primary: '#3f5d3a', secondary: '#c62f45', accent: '#f3f6f8' },
  head_fondue_pot: { primary: '#b9c2c9', secondary: '#6b747c', accent: '#f4c95d' },
  head_marmot_fur: { primary: '#a9744f', secondary: '#d9a066', accent: '#2b1d16' },
  head_captain_cap: { primary: '#f3f6f8', secondary: '#12324b', accent: '#f4c95d' },
  head_watermelon: { primary: '#3f9b4f', secondary: '#ff6b5e', accent: '#1d1a17' },
  head_flamingo_hat: { primary: '#ff8fb1', secondary: '#ff6b5e', accent: '#1d1a17' },
  head_diving_bell: { primary: '#c9a227', secondary: '#7a5c12', accent: '#7dcbe9' },
};

export const FACE_PALETTES: Record<FaceId, CosmeticPalette> = {
  face_none: { primary: '#9bb9c9', secondary: '#6b747c', accent: '#f4c95d' },
  face_full_beard: { primary: '#4a2e20', secondary: '#2b1d16', accent: '#f3f6f8' },
  face_mustache: { primary: '#4a2e20', secondary: '#2b1d16', accent: '#f3f6f8' },
  face_icicle_beard: { primary: '#dff4ff', secondary: '#7dcbe9', accent: '#f3f6f8' },
  face_bubble_pipe: { primary: '#5a3b2a', secondary: '#dff4ff', accent: '#7dcbe9' },
  face_snorkel_mask: { primary: '#12b8a6', secondary: '#12324b', accent: '#ffd166' },
  face_eyepatch_beard: { primary: '#1d1a17', secondary: '#5a3b2a', accent: '#f3f6f8' },
  face_flamingo_shades: { primary: '#ff8fb1', secondary: '#1d1a17', accent: '#f4c95d' },
  face_sunscreen: { primary: '#f3f6f8', secondary: '#ffd166', accent: '#ff6b5e' },
};

export const TORSO_PALETTES: Record<TorsoId, CosmeticPalette> = {
  torso_tracht_shirt: { primary: '#f3f6f8', secondary: '#5a3b2a', accent: '#f4c95d' },
  torso_dirndl_vest: { primary: '#c62f45', secondary: '#3f5d3a', accent: '#f3f6f8' },
  torso_loden_coat: { primary: '#3f5d3a', secondary: '#2a3d27', accent: '#c9a227' },
  torso_hawaii_shirt: { primary: '#12b8a6', secondary: '#ff6b5e', accent: '#ffd166' },
  torso_flamingo_ring: { primary: '#ff8fb1', secondary: '#ff6b5e', accent: '#ffd166' },
  torso_bathrobe: { primary: '#f7c6d9', secondary: '#f3f6f8', accent: '#ff8fb1' },
  torso_bare_suspenders: { primary: '#e8b98d', secondary: '#5a3b2a', accent: '#f4c95d' },
  torso_barrel_armor: { primary: '#8a5a33', secondary: '#5a3b2a', accent: '#b9c2c9' },
  torso_field_vest: { primary: '#586b42', secondary: '#34432d', accent: '#c4b99a' },
};

export const BACK_PALETTES: Record<BackId, CosmeticPalette> = {
  back_none: { primary: '#9bb9c9', secondary: '#6b747c', accent: '#f4c95d' },
  back_cuckoo_clock: { primary: '#6b4a2f', secondary: '#3f2d1d', accent: '#f4c95d' },
  back_leather_pack: { primary: '#8a5a33', secondary: '#5a3b2a', accent: '#f3f6f8' },
  back_lifebuoy: { primary: '#f3f6f8', secondary: '#c62f45', accent: '#ff6b5e' },
  back_surfboard: { primary: '#ffd166', secondary: '#12b8a6', accent: '#ff6b5e' },
  back_mini_bbq: { primary: '#2b2b2b', secondary: '#6b747c', accent: '#ff6b5e' },
};

export const HANDS_PALETTES: Record<HandsId, CosmeticPalette> = {
  hands_bare: { primary: '#e8b98d', secondary: '#c98f63', accent: '#f4c95d' },
  hands_mittens: { primary: '#c62f45', secondary: '#f3f6f8', accent: '#ffd166' },
  hands_boxing: { primary: '#c62f45', secondary: '#7a1626', accent: '#f3f6f8' },
  hands_pirate_hook: { primary: '#b9c2c9', secondary: '#5a3b2a', accent: '#2b2b2b' },
  hands_gold_watch: { primary: '#f4c95d', secondary: '#b8860b', accent: '#f3f6f8' },
};

export const LEGS_PALETTES: Record<LegsId, CosmeticPalette> = {
  legs_lederhosen: { primary: '#6b4a2f', secondary: '#3f2d1d', accent: '#f3f6f8' },
  legs_striped_trousers: { primary: '#d9c7a3', secondary: '#8a6d4a', accent: '#3f5d3a' },
  legs_olive_pants: { primary: '#4f5f3a', secondary: '#36432a', accent: '#c9a227' },
  legs_boardshorts: { primary: '#12b8a6', secondary: '#ff6b5e', accent: '#ffd166' },
  legs_long_johns: { primary: '#c62f45', secondary: '#f3f6f8', accent: '#7dcbe9' },
};

export const FEET_PALETTES: Record<FeetId, CosmeticPalette> = {
  feet_mountain_boots: { primary: '#5a3b2a', secondary: '#2b1d16', accent: '#9a7b5a' },
  feet_ski_boots: { primary: '#c62f45', secondary: '#7a1626', accent: '#f3f6f8' },
  feet_dive_flippers: { primary: '#12b8a6', secondary: '#ffd166', accent: '#0b7f72' },
  feet_sandals_socks: { primary: '#f3f6f8', secondary: '#2288b1', accent: '#ff6b5e' },
  feet_peg_leg: { primary: '#8a5a33', secondary: '#5a3b2a', accent: '#b9c2c9' },
};

export function createDefaultCosmetics(classId: ClassId): Cosmetics {
  if (classId === 'heavy') {
    return {
      classId,
      bodyType: 0.08,
      skinToneIndex: 1,
      hairColorIndex: 4,
      hairStyleIndex: 6,
      headgear: 'head_none',
      face: 'face_none',
      torso: 'torso_field_vest',
      back: 'back_none',
      hands: 'hands_bare',
      legs: 'legs_olive_pants',
      feet: 'feet_mountain_boots',
      voicePitch: 0.82,
    };
  }

  if (classId === 'infiltrator') {
    return {
      classId,
      bodyType: 0.78,
      skinToneIndex: 4,
      hairColorIndex: 6,
      hairStyleIndex: 2,
      headgear: 'head_marmot_fur',
      face: 'face_eyepatch_beard',
      torso: 'torso_loden_coat',
      back: 'back_none',
      hands: 'hands_pirate_hook',
      legs: 'legs_olive_pants',
      feet: 'feet_sandals_socks',
      voicePitch: 1.12,
    };
  }

  return {
    classId,
    bodyType: 0.15,
    skinToneIndex: 1,
    hairColorIndex: 4,
    hairStyleIndex: 0,
    headgear: 'head_tirol',
    face: 'face_full_beard',
    torso: 'torso_tracht_shirt',
    back: 'back_cuckoo_clock',
    hands: 'hands_bare',
    legs: 'legs_lederhosen',
    feet: 'feet_ski_boots',
    voicePitch: 1,
  };
}

export const DEFAULT_COSMETICS: Cosmetics = createDefaultCosmetics('allrounder');

function clampIndex(value: unknown, count: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(count - 1, Math.max(0, Math.round(value)));
}

function clampUnit(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(1, Math.max(0, value));
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

export function normalizeCosmetics(
  input: unknown,
  fallback: Cosmetics = DEFAULT_COSMETICS,
): Cosmetics {
  const record = isRecord(input) ? input : {};
  const classId = isTableId(CLASS_TABLE, record.classId) ? record.classId : fallback.classId;
  return {
    classId,
    bodyType: clampUnit(record.bodyType, fallback.bodyType),
    skinToneIndex: clampIndex(record.skinToneIndex, SKIN_TONES.length, fallback.skinToneIndex),
    hairColorIndex: clampIndex(record.hairColorIndex, HAIR_COLORS.length, fallback.hairColorIndex),
    hairStyleIndex: clampIndex(
      record.hairStyleIndex,
      HAIR_STYLE_IDS.length,
      fallback.hairStyleIndex,
    ),
    headgear: isTableId(HEADGEAR_TABLE, record.headgear) ? record.headgear : fallback.headgear,
    face: isTableId(FACE_TABLE, record.face) ? record.face : fallback.face,
    torso: isTableId(TORSO_TABLE, record.torso) ? record.torso : fallback.torso,
    back: isTableId(BACK_TABLE, record.back) ? record.back : fallback.back,
    hands: isTableId(HANDS_TABLE, record.hands) ? record.hands : fallback.hands,
    legs: isTableId(LEGS_TABLE, record.legs) ? record.legs : fallback.legs,
    feet: isTableId(FEET_TABLE, record.feet) ? record.feet : fallback.feet,
    voicePitch: clampNumber(record.voicePitch, 0.8, 1.25, fallback.voicePitch),
  };
}
