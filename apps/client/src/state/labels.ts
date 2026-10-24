import {
  HAIR_STYLE_IDS,
  type BackId,
  type ClassId,
  type FaceId,
  type Faction,
  type FeetId,
  type GimmickWeaponId,
  type HandsId,
  type HeadgearId,
  type LegsId,
  type MainWeaponId,
  type TorsoId,
  type TranslationKey,
} from '@frost-and-flamingos/shared';

export type CosmeticSlot = 'headgear' | 'face' | 'torso' | 'back' | 'hands' | 'legs' | 'feet';
export type CosmeticId =
  | HeadgearId
  | FaceId
  | TorsoId
  | BackId
  | HandsId
  | LegsId
  | FeetId;
export type WeaponGroup = 'primary' | 'secondary' | 'gimmick';

export function factionNameKey(faction: Faction): TranslationKey {
  return `factions.${faction}.name` as TranslationKey;
}

export function factionShortKey(faction: Faction): TranslationKey {
  return `factions.${faction}.short` as TranslationKey;
}

export function factionMottoKey(faction: Faction): TranslationKey {
  return `factions.${faction}.motto` as TranslationKey;
}

export function classNameKey(classId: ClassId): TranslationKey {
  return `classes.${classId}.name` as TranslationKey;
}

export function factionClassNameKey(faction: Faction, classId: ClassId): TranslationKey {
  return `classNames.${faction}.${classId}` as TranslationKey;
}

export function classRoleKey(classId: ClassId): TranslationKey {
  return `classes.${classId}.role` as TranslationKey;
}

export function cosmeticNameKey(slot: CosmeticSlot, id: CosmeticId): TranslationKey {
  return `cosmetics.${slot}.${id}` as TranslationKey;
}

export function hairStyleNameKey(index: number): TranslationKey {
  const id = HAIR_STYLE_IDS[index] ?? HAIR_STYLE_IDS[0];
  return `cosmetics.hairStyles.${id}` as TranslationKey;
}

export function weaponNameKey(
  group: WeaponGroup,
  id: MainWeaponId | GimmickWeaponId,
): TranslationKey {
  return `weapons.${group}.${id}.name` as TranslationKey;
}

export function weaponRoleKey(
  group: WeaponGroup,
  id: MainWeaponId | GimmickWeaponId,
): TranslationKey {
  return `weapons.${group}.${id}.role` as TranslationKey;
}
