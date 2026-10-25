import { CLASS_STATS, type DrifterForm } from '@frost-and-flamingos/shared';
import { registerPaintedModel, type NativeOutfit } from './catalog';

/**
 * Painted models of the drifter class, registered with package 3C's painted
 * model catalogue (module side effect, before the library reads its
 * manifest). Both girls share the Mixamo skeleton and the same walk-only view
 * settings; they differ in clips, hover and shading:
 *
 *  - Creepy Mountain Girl (meshy-alpine-ghostgirl.glb): cel/ink like the
 *    soldiers, hovers ~6 cm with a slow bob, idles as an almost frozen walk
 *    cycle, beckons (Call_Gesture) and rarely skips in place (Skip_Forward).
 *  - Hot Beach Girl (meshy-lagoon-beachgirl.glb): the only photoreal
 *    character (physically based shading, no cel bands or world ink),
 *    own Idle loop, Cheer when she starts healing someone.
 *
 * Both neither lend nor borrow clips (the soldiers keep their own motion and
 * the girls never fall back to a soldier's run, jump or death).
 */

/** Manifest keys (scripts/optimize-models.ts names them after the source GLB). */
export const DRIFTER_MODEL_KEYS: Readonly<Record<DrifterForm, string>> = {
  mountain_girl: 'alpine-ghostgirl',
  beach_girl: 'lagoon-beachgirl',
};

/** Fixed painted look: nothing in the wardrobe maps onto these models. */
const FIXED_LOOK: NativeOutfit = {
  headgear: 'head_none',
  face: 'face_none',
  torso: 'torso_painted',
  back: 'back_none',
  hands: 'hands_bare',
  legs: 'legs_painted',
  feet: 'feet_painted',
};

const SHARED = {
  native: FIXED_LOOK,
  hatCutY: null,
  backZ: -0.12,
  bulk: 0.9,
  heightMeters: CLASS_STATS.drifter.height,
  armed: false,
  shareClips: false,
  cosmetics: false,
} as const;

registerPaintedModel({
  ...SHARED,
  key: DRIFTER_MODEL_KEYS.mountain_girl,
  file: `${DRIFTER_MODEL_KEYS.mountain_girl}.glb`,
  clips: {
    walk: ['Walking'],
    backpedal: ['Walk_Backward'],
    taunt: ['Call_Gesture'],
    emote: ['Skip_Forward'],
  },
  head: { y: 1.52, z: 0.0, radius: 0.11 },
  // Foot-plant speeds measured from the clips (model space, 1.71 m model).
  gait: { walk: 1.47, backpedal: 1.2, idleRate: 0.05 },
  hover: { height: 0.06, bob: 0.022, period: 3.4 },
});

registerPaintedModel({
  ...SHARED,
  key: DRIFTER_MODEL_KEYS.beach_girl,
  file: `${DRIFTER_MODEL_KEYS.beach_girl}.glb`,
  clips: {
    idle: ['Idle'],
    walk: ['Walking'],
    backpedal: ['Walk_Backward'],
    taunt: ['Cheer'],
  },
  head: { y: 1.55, z: 0.0, radius: 0.11 },
  // Sync speeds from the rig (zero foot slide), model space, 1.72 m model.
  gait: { walk: 1.552, backpedal: 1.306 },
  photoreal: true,
});
