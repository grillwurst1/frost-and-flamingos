import type { DrifterForm, Faction } from '../types/index.js';

/**
 * Drifter class tuning: the untouchable support walkers. Peak Guard's form is
 * the Creepy Mountain Girl, the Lagoon League's is the Hot Beach Girl. Both
 * share every number here; only the look and the aura theme differ.
 *
 * A drifter cannot be hurt, launched, slowed or blocked, shots and bodies pass
 * through her, she carries no weapons or skills and only walks. Her single
 * ability is the supply aura (DRIFTER_AURA). Speeds are m/s, times s.
 */

/** Peak Guard brings the Creepy Mountain Girl, the Lagoon League the Hot Beach Girl. */
export function drifterFormForFaction(faction: Faction): DrifterForm {
  return faction === 'lagoon' ? 'beach_girl' : 'mountain_girl';
}

/**
 * A form is selectable only once its painted model ships (no stand-in
 * visuals). Flip `beach_girl` when `apps/client/public/models` carries the
 * rigged Hot Beach Girl; server placement and the wardrobe both read this.
 */
export const DRIFTER_FORM_AVAILABLE: Readonly<Record<DrifterForm, boolean>> = {
  mountain_girl: true,
  beach_girl: false,
};

export interface DrifterTuning {
  /**
   * W walking speed. The painted walk cycle plants its feet at ~1.47 m/s;
   * the view lengthens the stride and plays it a little faster, so this is
   * the fastest pace that still reads as a calm, unhurried walk.
   */
  readonly walkSpeed: number;
  /** A/D relative to walkSpeed (same contract as the soldiers). */
  readonly strafeScale: number;
  /** S relative to walkSpeed (the backwards walk clip is shorter). */
  readonly backwardScale: number;
  readonly groundAcceleration: number;
  /** No input: how fast she settles to a stop (she floats, so no surface grip changes it). */
  readonly groundDeceleration: number;
  /** Fraction of the ground acceleration available in the air. */
  readonly airControl: number;
  /** Long falls become a slow ghostly descent: downward speed never exceeds this. */
  readonly maxFallSpeed: number;
  /** Gravity scale while drifting down (reaches maxFallSpeed within a fraction of a second). */
  readonly gravityScale: number;
  /** Over water her feet ride this far above the still surface (no swimming, no drowning). */
  readonly waterHoverHeight: number;
  /** Rises back onto the water surface at most this fast after sinking below it. */
  readonly waterRiseSpeed: number;
}

export const DRIFTER_TUNING: DrifterTuning = {
  walkSpeed: 3,
  strafeScale: 0.85,
  backwardScale: 0.65,
  groundAcceleration: 18,
  groundDeceleration: 14,
  airControl: 0.5,
  maxFallSpeed: 3.2,
  gravityScale: 0.45,
  waterHoverHeight: 0.12,
  waterRiseSpeed: 4,
};

/**
 * Supply aura ("Versorgungs-Aura"), identical for both forms. Teammates
 * within `radius` are supplied; a second drifter nearby adds nothing (no
 * stacking). The drifter herself and enemies are never affected.
 */
export interface DrifterAuraTuning {
  /** Metres from the drifter's feet to a teammate's feet (3D). */
  readonly radius: number;
  /** Vitality regenerates only after this long without taking damage. */
  readonly outOfCombatSeconds: number;
  /** Vitality per second while out of combat, never above the class maximum. */
  readonly healPerSecond: number;
  /** Reserve ammo: one full magazine of the weapon per this many seconds, per weapon slot. */
  readonly magazineSeconds: number;
  /** Support points: one per this much vitality healed… */
  readonly vitalityPerPoint: number;
  /** …plus one per this many magazines of reserve ammo handed out. */
  readonly magazinesPerPoint: number;
}

export const DRIFTER_AURA: DrifterAuraTuning = {
  radius: 6,
  outOfCombatSeconds: 3,
  healPerSecond: 8,
  magazineSeconds: 4,
  vitalityPerPoint: 10,
  magazinesPerPoint: 1,
};
