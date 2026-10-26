import {
  createDefaultCosmetics,
  type ClassId,
  type Cosmetics,
  type Faction,
  type PlayerProfile,
} from '@frost-and-flamingos/shared';

/**
 * Catalogue of the owner's painted Meshy characters (pure data, no Babylon).
 *
 * Every entry is one rigged, painted GLB optimised by `bun run models` into
 * `apps/client/public/models/<faction>-<class>.glb`. The runtime only loads
 * files that the generated `public/models/manifest.json` lists, so classes
 * whose model has not arrived yet keep the procedural rig without a 404.
 *
 * Soldier GLBs supply the animation skeleton and clips. Their visible body
 * is a single modular skinned mesh representing every wardrobe selection.
 * Fixed-look extras (cosmetics=false) retain the original painted body.
 */
export type PaintedModelKey = `${Faction}-${Exclude<ClassId, 'mascot'>}`;

/** Animation roles the GLB animator drives. */
export type ClipRole =
  | 'idle'
  | 'walk'
  | 'combatWalk'
  | 'run'
  | 'sprint'
  | 'backpedal'
  | 'crouchBack'
  | 'air'
  | 'swim'
  | 'death'
  | 'taunt'
  | 'reload'
  /** A second one-shot, full-body idle clip (e.g. the drifter's rare skip). */
  | 'emote';

/**
 * Candidate clip names per role, first match wins. When a model lacks a role
 * the library first retargets the clip from another loaded model (all share
 * Mixamo bone names; the motion is transferred as world-space rotation deltas
 * from bind pose after aligning each bone's bind direction to the donor's, so
 * A-pose and T-pose rigs line up). Roles nobody has fall
 * back in the animator: idle → procedural breathing over the bind pose;
 * sprint → run; backpedal → walk played in reverse; air → a frozen mid-stride
 * run frame; swim → procedural prone crawl; death → procedural comic
 * topple. Melee swings, recoil, aiming and crouching are always procedural
 * layers on top of the clips (the hands are pulled onto the weapon by IK).
 */
export type ClipTable = Readonly<Partial<Record<ClipRole, readonly string[]>>>;

export const DEFAULT_CLIPS: Readonly<Record<ClipRole, readonly string[]>> = {
  idle: ['Idle', 'Breathing_Idle', 'Standing_Idle', 'Stand_and_Drink', 'Talk_Passionately', 'Stand_Talking_Angry'],
  walk: ['Walking', 'Walk', 'Casual_Walk'],
  combatWalk: ['Walk_Fight_Forward'],
  run: ['Running', 'Run', 'Jog_Forward'],
  sprint: ['Lean_Forward_Sprint_inplace', 'Standard_Forward_Charge_inplace', 'Lean_Forward_Sprint', 'Sprint'],
  backpedal: ['Walk_Backward_inplace', 'Walk_Backward', 'Walking_Backward'],
  crouchBack: ['Crawl_Backward'],
  air: ['Jump', 'Regular_Jump', 'Jump_Up', 'Hop_with_Arms_Raised'],
  swim: ['Swim_Forward', 'Swimming', 'Swim'],
  death: ['Fall_Dead_from_Abdominal_Injury', 'Dying', 'Death'],
  taunt: ['Show_Both_Arm_Muscles', 'Cheer_with_Both_Hands_Up', 'Cheer_with_Both_Hands_1', 'Skip_Forward', 'Victory'],
  reload: ['Forward_Reload_Subtle', 'Reloading', 'Reload'],
  emote: [],
};

/** Roles worth retargeting from another model when a model lacks them. */
export const RETARGET_ROLES: readonly ClipRole[] = [
  'idle',
  'combatWalk',
  'sprint',
  'backpedal',
  'air',
  'swim',
  'reload',
  'death',
  'taunt',
];

/** Cosmetic ids the painted model wears (strings: some ids arrive with 1E). */
export interface NativeOutfit {
  headgear: string;
  face: string;
  torso: string;
  back: string;
  hands: string;
  legs: string;
  feet: string;
}

export interface PaintedModelSpec {
  /** Manifest key: `<faction>-<class>` for players, any name for others. */
  key: string;
  file: string;
  native: NativeOutfit;
  /** Per-model clip overrides (merged in front of {@link DEFAULT_CLIPS}). */
  clips: ClipTable;
  /**
   * Bind-pose height (model units, metres above the feet) above which
   * triangles skinned to the head belong to the painted headgear. They are
   * hidden when a different headgear item is attached. null = not removable.
   */
  hatCutY: number | null;
  /** Bind-pose head centre (model space, metres) and radius for attachments. */
  head: { y: number; z: number; radius: number };
  /** Bind-pose chest depth (z of the back surface) for back items. */
  backZ: number;
  /** Shoulder width scale for back items (heavy = broad). */
  bulk: number;
  /**
   * Standing height in metres; defaults to the class height. Lets extra,
   * non-soldier characters (e.g. a playable NPC class) reuse the view.
   */
  heightMeters?: number;
  /** false for characters that never hold a weapon (walk/idle clips only). */
  armed?: boolean;
  /**
   * Extra characters with their own motion set (the drifter class): when
   * false the model neither lends clips to nor borrows clips from the others,
   * and only its own `clips` table is resolved (no {@link DEFAULT_CLIPS}).
   */
  shareClips?: boolean;
  /** false: never attach cosmetic items (fixed painted look). */
  cosmetics?: boolean;
  /**
   * Walk-only locomotion: only idle, walk and backpedal blend (no run, sprint,
   * air, swim, crouch or death poses). Values are the model-space ground speed
   * (m/s) at which the walk / backpedal loop plants its feet at 1×; the
   * playback rate follows the speed so the feet never skate. `idleRate` plays
   * the walk loop as a near-still idle when the model has no idle clip.
   */
  gait?: { walk: number; backpedal: number; idleRate?: number };
  /** Hovers this far (m) above the ground with a slow bob of `bob` m every `period` s. */
  hover?: { height: number; bob: number; period: number };
  /** Physically based shading instead of the cel bands (character look mask: silhouette ink only). */
  photoreal?: boolean;
}

const BUILT_IN_MODELS: Readonly<Record<string, PaintedModelSpec>> = {
  'alpine-allrounder': {
    key: 'alpine-allrounder',
    file: 'alpine-allrounder.glb',
    native: {
      headgear: 'head_tirol',
      face: 'face_full_beard',
      torso: 'torso_tracht_shirt',
      back: 'back_none',
      hands: 'hands_bare',
      legs: 'legs_lederhosen',
      feet: 'feet_mountain_boots',
    },
    clips: {
      walk: ['Walking'],
      run: ['Running'],
    },
    hatCutY: 1.47,
    head: { y: 1.4, z: 0.0, radius: 0.15 },
    backZ: -0.17,
    bulk: 1,
  },
  'alpine-heavy': {
    key: 'alpine-heavy',
    file: 'alpine-heavy.glb',
    native: {
      headgear: 'head_fondue_pot',
      face: 'face_full_beard',
      torso: 'torso_nordic_sweater',
      back: 'back_none',
      hands: 'hands_leather_gloves',
      legs: 'legs_olive_pants',
      feet: 'feet_fur_boots',
    },
    clips: {
      sprint: ['Lean_Forward_Sprint', 'Running'],
      air: ['Hop_with_Arms_Raised'],
      swim: ['Swim_Forward'],
      backpedal: ['Walk_Backward_inplace'],
    },
    hatCutY: 1.35,
    head: { y: 1.25, z: 0.05, radius: 0.19 },
    backZ: -0.26,
    bulk: 1.3,
  },
  'alpine-infiltrator': {
    key: 'alpine-infiltrator',
    file: 'alpine-infiltrator.glb',
    native: {
      headgear: 'head_bobble_hat',
      face: 'face_mustache',
      torso: 'torso_scout_jacket',
      back: 'back_none',
      hands: 'hands_bare',
      legs: 'legs_knickerbockers',
      feet: 'feet_mountain_boots',
    },
    clips: {
      swim: ['Swim_Forward'],
      backpedal: ['Walk_Backward'],
      crouchBack: ['Crawl_Backward'],
    },
    hatCutY: 1.5,
    head: { y: 1.42, z: -0.03, radius: 0.125 },
    backZ: -0.15,
    bulk: 0.95,
  },
  'lagoon-allrounder': {
    key: 'lagoon-allrounder',
    file: 'lagoon-allrounder.glb',
    native: {
      // The afro is painted hair, so it stays; extra headgear sits on top.
      headgear: 'head_none',
      face: 'face_snorkel_mask',
      torso: 'torso_hawaii_shirt',
      back: 'back_none',
      hands: 'hands_bare',
      legs: 'legs_boardshorts',
      feet: 'feet_flip_flops',
    },
    clips: {
      air: ['Hop_with_Arms_Raised'],
      swim: ['Swim_Forward'],
      backpedal: ['Walk_Backward'],
      crouchBack: ['Crawl_Backward'],
      death: ['Fall_Dead_from_Abdominal_Injury'],
      idle: ['Talk_Passionately'],
      taunt: ['Cheer_with_Both_Hands_1', 'Skip_Forward'],
    },
    hatCutY: null,
    head: { y: 1.42, z: 0.0, radius: 0.21 },
    backZ: -0.15,
    bulk: 1,
  },
  'lagoon-heavy': {
    key: 'lagoon-heavy',
    file: 'lagoon-heavy.glb',
    native: {
      // The bandana is painted tight on the scalp: other headgear sits on top.
      headgear: 'head_bandana',
      face: 'face_short_beard',
      torso: 'torso_flamingo_ring',
      back: 'back_none',
      hands: 'hands_bare',
      legs: 'legs_cargo_pants',
      feet: 'feet_combat_boots',
    },
    clips: {
      sprint: ['Lean_Forward_Sprint_inplace'],
      air: ['Regular_Jump'],
      idle: ['Stand_and_Drink', 'Stand_Talking_Angry'],
      taunt: ['Show_Both_Arm_Muscles'],
      swim: ['Swim_Forward'],
    },
    hatCutY: null,
    head: { y: 1.49, z: 0.0, radius: 0.15 },
    backZ: -0.24,
    bulk: 1.3,
  },
  'lagoon-infiltrator': {
    key: 'lagoon-infiltrator',
    file: 'lagoon-infiltrator.glb',
    native: {
      headgear: 'head_straw_hat',
      face: 'face_sunglasses',
      torso: 'torso_palm_shirt',
      back: 'back_none',
      hands: 'hands_bare',
      legs: 'legs_cargo_shorts',
      feet: 'feet_sandals',
    },
    clips: {
      idle: ['Talk_Passionately'],
      combatWalk: ['Walk_Fight_Forward'],
      sprint: ['Standard_Forward_Charge_inplace'],
      air: ['Regular_Jump'],
      reload: ['Forward_Reload_Subtle'],
      taunt: ['Cheer_with_Both_Hands_Up', 'Cheer_with_Both_Hands_1'],
      swim: ['Swim_Forward'],
    },
    hatCutY: 1.47,
    head: { y: 1.42, z: 0.0, radius: 0.12 },
    backZ: -0.15,
    bulk: 0.95,
  },
};

/**
 * Registry of painted models (manifest key → spec). The six soldiers are
 * built in; later packages add their own characters with
 * {@link registerPaintedModel} before the library settles.
 */
const registry = new Map<string, PaintedModelSpec>(Object.entries(BUILT_IN_MODELS));

/** Every registered spec (read-only view). */
export const PAINTED_MODELS: Readonly<Record<string, PaintedModelSpec>> = new Proxy({} as Record<string, PaintedModelSpec>, {
  get: (_target, key) => (typeof key === 'string' ? registry.get(key) : undefined),
  ownKeys: () => [...registry.keys()],
  getOwnPropertyDescriptor: (_target, key) =>
    typeof key === 'string' && registry.has(key) ? { enumerable: true, configurable: true, value: registry.get(key) } : undefined,
});

/** Adds or replaces a painted model spec (e.g. a non-soldier class). */
export function registerPaintedModel(spec: PaintedModelSpec): void {
  registry.set(spec.key, spec);
}

export function paintedModelSpecByKey(key: string): PaintedModelSpec | null {
  return registry.get(key) ?? null;
}

export function paintedModelKey(profile: PlayerProfile): string | null {
  const classId: string = profile.cosmetics.classId;
  if (classId === 'mascot') return null;
  return `${profile.faction}-${classId}`;
}

export function paintedModelSpec(profile: PlayerProfile): PaintedModelSpec | null {
  const key = paintedModelKey(profile);
  return key ? registry.get(key) ?? null : null;
}

/**
 * Class defaults for a faction. Package 1E makes `createDefaultCosmetics`
 * faction-aware (second argument); the base build ignores the extra argument,
 * so this call is correct before and after that merge.
 */
const defaultsFor = createDefaultCosmetics as (classId: ClassId, faction?: Faction) => Cosmetics;

export type OutfitSlot = 'headgear' | 'face' | 'torso' | 'back' | 'hands' | 'legs' | 'feet';

/** Clothing slots restored by the wardrobe standard-clothing action. */
export const FIXED_SLOTS: readonly OutfitSlot[] = ['torso', 'legs', 'feet'];
export const ATTACHABLE_SLOTS: readonly OutfitSlot[] = ['headgear', 'face', 'back', 'hands'];

/**
 * True when the profile wears the painted item in `slot`: either the model's
 * own id or the class default (the default outfit always means "as painted").
 */
export function wearsNative(profile: PlayerProfile, spec: PaintedModelSpec, slot: OutfitSlot): boolean {
  const value: string = profile.cosmetics[slot];
  if (value === spec.native[slot]) return true;
  const defaults = defaultsFor(profile.cosmetics.classId, profile.faction);
  return value === defaults[slot];
}

/** Modular soldiers support every outfit; fixed-look extras retain their own outfit. */
export function outfitFitsPaintedModel(profile: PlayerProfile, spec: PaintedModelSpec): boolean {
  return spec.cosmetics !== false || FIXED_SLOTS.every((slot) => wearsNative(profile, spec, slot));
}

/** Class-default torso/legs/feet for the wardrobe standard-clothing action. */
export function paintedOutfitReset(profile: PlayerProfile): Pick<Cosmetics, 'torso' | 'legs' | 'feet'> {
  const defaults = defaultsFor(profile.cosmetics.classId, profile.faction);
  return { torso: defaults.torso, legs: defaults.legs, feet: defaults.feet };
}

/** Resolves a role to the first clip name present in the model. */
export function resolveClip(spec: PaintedModelSpec, role: ClipRole, available: ReadonlySet<string>): string | null {
  const own = spec.clips[role] ?? [];
  const candidates = spec.shareClips === false ? own : [...own, ...DEFAULT_CLIPS[role]];
  for (const name of candidates) {
    if (available.has(name)) return name;
  }
  return null;
}
