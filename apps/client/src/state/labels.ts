import type { ClassId, Faction, TranslationKey } from '@frost-and-flamingos/shared';

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

export function classRoleKey(classId: ClassId): TranslationKey {
  return `classes.${classId}.role` as TranslationKey;
}
