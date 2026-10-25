import { derived, get, writable } from 'svelte/store';
import {
  outfitFitsPaintedModel,
  paintedModelSpec,
  paintedOutfitReset,
} from '../rendering/glb/catalog';
import { profile, updateCosmetics } from './profile';

/**
 * Which owner-painted GLB characters loaded on this client (set by GameClient
 * once the model library has settled). Empty until then, so the wardrobe hint
 * only appears for models that really render.
 */
export const paintedModels = writable<ReadonlySet<string>>(new Set());

export function setPaintedModels(keys: ReadonlySet<string>): void {
  paintedModels.set(new Set(keys));
}

/**
 * Wardrobe state for the current profile:
 *   'painted' — the painted model is worn (torso/legs/feet are fixed),
 *   'custom'  — torso/legs/feet were changed, so the mix-and-match rig shows,
 *   null      — no painted model exists for this faction and class.
 */
export type PaintedOutfitState = 'painted' | 'custom' | null;

export const paintedOutfit = derived([profile, paintedModels], ([current, available]): PaintedOutfitState => {
  const spec = paintedModelSpec(current);
  if (!spec || !available.has(spec.key)) return null;
  return outfitFitsPaintedModel(current, spec) ? 'painted' : 'custom';
});

/** Wardrobe intent: put the painted torso, legs and feet back on. */
export function wearPaintedOutfit(): void {
  updateCosmetics(paintedOutfitReset(get(profile)));
}
