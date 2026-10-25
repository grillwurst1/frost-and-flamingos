import type { ClassId, Faction, MascotForm } from '../types/index.js';
import { mascotFormForFaction } from './classes.js';
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
  | 'grapple_dash'
  | 'horn_charge'
  | 'hoof_stomp'
  | 'cowbell_clang'
  | 'turbo_roll'
  | 'ground_pound'
  | 'milk_splash';

/**
 * 'mascot' moves are started by the shared motor (deterministic, predicted)
 * and resolved by the server from the motor's move events.
 */
export type SkillKind = 'heal' | 'speed' | 'shield' | 'aoe' | 'cloak' | 'dash' | 'slow' | 'mascot';

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
  // Cow moves. amount = ram multiplier / damage, duration = boost / wind-up / daze.
  horn_charge: {
    id: 'horn_charge',
    slot: 1,
    kind: 'mascot',
    cooldownSeconds: 9,
    durationSeconds: 2,
    amount: 1.3,
    radius: 0,
    nameKey: 'mascot.moves.hornCharge.name',
    descriptionKey: 'mascot.moves.hornCharge.description',
  },
  hoof_stomp: {
    id: 'hoof_stomp',
    slot: 2,
    kind: 'mascot',
    cooldownSeconds: 7,
    durationSeconds: 0.32,
    amount: 35,
    radius: 4,
    nameKey: 'mascot.moves.hoofStomp.name',
    descriptionKey: 'mascot.moves.hoofStomp.description',
  },
  cowbell_clang: {
    id: 'cowbell_clang',
    slot: 3,
    kind: 'mascot',
    cooldownSeconds: 14,
    durationSeconds: 1.5,
    amount: 0,
    radius: 8,
    nameKey: 'mascot.moves.cowbellClang.name',
    descriptionKey: 'mascot.moves.cowbellClang.description',
  },
  // Coconut moves. amount = turbo top speed / slam damage.
  turbo_roll: {
    id: 'turbo_roll',
    slot: 1,
    kind: 'mascot',
    cooldownSeconds: 8,
    durationSeconds: 2,
    amount: 17.5,
    radius: 0,
    nameKey: 'mascot.moves.turboRoll.name',
    descriptionKey: 'mascot.moves.turboRoll.description',
  },
  ground_pound: {
    id: 'ground_pound',
    slot: 2,
    kind: 'mascot',
    cooldownSeconds: 6,
    durationSeconds: 0,
    amount: 45,
    radius: 4.5,
    nameKey: 'mascot.moves.groundPound.name',
    descriptionKey: 'mascot.moves.groundPound.description',
  },
  milk_splash: {
    id: 'milk_splash',
    slot: 3,
    kind: 'mascot',
    cooldownSeconds: 16,
    durationSeconds: 6,
    amount: 0,
    radius: 4.5,
    nameKey: 'mascot.moves.milkSplash.name',
    descriptionKey: 'mascot.moves.milkSplash.description',
  },
};

export const CLASS_SKILLS: Record<ClassId, readonly [SkillId, SkillId, SkillId]> = {
  allrounder: ['heal_snack', 'ram_sprint', 'battle_shout'],
  heavy: ['armor_plate', 'barrel_blast', 'ground_slam'],
  infiltrator: ['cloak', 'smoke_bomb', 'grapple_dash'],
  // Nominal (cow) entry; the real set depends on the form — see MASCOT_SKILLS.
  mascot: ['horn_charge', 'hoof_stomp', 'cowbell_clang'],
};

/** Mascot slots 1–3 per form. */
export const MASCOT_SKILLS: Record<MascotForm, readonly [SkillId, SkillId, SkillId]> = {
  cow: ['horn_charge', 'hoof_stomp', 'cowbell_clang'],
  coconut: ['turbo_roll', 'ground_pound', 'milk_splash'],
};

/**
 * Skills of a class. Mascots resolve their form from the faction; without a
 * faction the nominal (cow) set is returned.
 */
export function skillsForClass(
  classId: ClassId,
  faction?: Faction,
): readonly [SkillDefinition, SkillDefinition, SkillDefinition] {
  const ids =
    classId === 'mascot' && faction
      ? MASCOT_SKILLS[mascotFormForFaction(faction)]
      : CLASS_SKILLS[classId];
  return [SKILLS[ids[0]], SKILLS[ids[1]], SKILLS[ids[2]]];
}
