import type { ClassId } from '../types/index.js';
import type { TranslationKey } from '../i18n/schema.js';

export type SkillId =
  | 'heal_snack'
  | 'ram_sprint'
  | 'battle_shout'
  | 'armor_plate'
  | 'barrel_blast'
  | 'ground_slam'
  | 'cloak'
  | 'smoke_bomb'
  | 'grapple_dash';

export type SkillKind = 'heal' | 'speed' | 'shield' | 'aoe' | 'cloak' | 'dash' | 'slow';

export interface SkillDefinition {
  readonly id: SkillId;
  readonly slot: 1 | 2 | 3;
  readonly kind: SkillKind;
  readonly cooldownSeconds: number;
  readonly durationSeconds: number;
  /** Heal, shield or damage amount, depending on kind. */
  readonly amount: number;
  /** Effect radius in metres for area skills. */
  readonly radius: number;
  readonly nameKey: TranslationKey;
  readonly descriptionKey: TranslationKey;
}

export const SKILLS: Record<SkillId, SkillDefinition> = {
  heal_snack: {
    id: 'heal_snack',
    slot: 1,
    kind: 'heal',
    cooldownSeconds: 18,
    durationSeconds: 0,
    amount: 55,
    radius: 0,
    nameKey: 'skills.healSnack.name',
    descriptionKey: 'skills.healSnack.description',
  },
  ram_sprint: {
    id: 'ram_sprint',
    slot: 2,
    kind: 'speed',
    cooldownSeconds: 16,
    durationSeconds: 4,
    amount: 1.5,
    radius: 0,
    nameKey: 'skills.ramSprint.name',
    descriptionKey: 'skills.ramSprint.description',
  },
  battle_shout: {
    id: 'battle_shout',
    slot: 3,
    kind: 'aoe',
    cooldownSeconds: 24,
    durationSeconds: 0,
    amount: 30,
    radius: 7,
    nameKey: 'skills.battleShout.name',
    descriptionKey: 'skills.battleShout.description',
  },
  armor_plate: {
    id: 'armor_plate',
    slot: 1,
    kind: 'shield',
    cooldownSeconds: 22,
    durationSeconds: 8,
    amount: 80,
    radius: 0,
    nameKey: 'skills.armorPlate.name',
    descriptionKey: 'skills.armorPlate.description',
  },
  barrel_blast: {
    id: 'barrel_blast',
    slot: 2,
    kind: 'aoe',
    cooldownSeconds: 20,
    durationSeconds: 0,
    amount: 70,
    radius: 5,
    nameKey: 'skills.barrelBlast.name',
    descriptionKey: 'skills.barrelBlast.description',
  },
  ground_slam: {
    id: 'ground_slam',
    slot: 3,
    kind: 'aoe',
    cooldownSeconds: 26,
    durationSeconds: 0,
    amount: 50,
    radius: 6.5,
    nameKey: 'skills.groundSlam.name',
    descriptionKey: 'skills.groundSlam.description',
  },
  cloak: {
    id: 'cloak',
    slot: 1,
    kind: 'cloak',
    cooldownSeconds: 24,
    durationSeconds: 6,
    amount: 0,
    radius: 0,
    nameKey: 'skills.cloak.name',
    descriptionKey: 'skills.cloak.description',
  },
  smoke_bomb: {
    id: 'smoke_bomb',
    slot: 2,
    kind: 'slow',
    cooldownSeconds: 18,
    durationSeconds: 4,
    amount: 25,
    radius: 5.5,
    nameKey: 'skills.smokeBomb.name',
    descriptionKey: 'skills.smokeBomb.description',
  },
  grapple_dash: {
    id: 'grapple_dash',
    slot: 3,
    kind: 'dash',
    cooldownSeconds: 12,
    durationSeconds: 0,
    amount: 8,
    radius: 0,
    nameKey: 'skills.grappleDash.name',
    descriptionKey: 'skills.grappleDash.description',
  },
};

export const CLASS_SKILLS: Record<ClassId, readonly [SkillId, SkillId, SkillId]> = {
  allrounder: ['heal_snack', 'ram_sprint', 'battle_shout'],
  heavy: ['armor_plate', 'barrel_blast', 'ground_slam'],
  infiltrator: ['cloak', 'smoke_bomb', 'grapple_dash'],
};

export function skillsForClass(classId: ClassId): readonly [SkillDefinition, SkillDefinition, SkillDefinition] {
  const ids = CLASS_SKILLS[classId];
  return [SKILLS[ids[0]], SKILLS[ids[1]], SKILLS[ids[2]]];
}
