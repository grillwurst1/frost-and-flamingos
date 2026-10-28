import type { Cosmetics, PlayerProfile } from '@frost-and-flamingos/shared';
import type { PaintedModelAsset } from './library';

export interface NativeWardrobeData {
  version: 1;
  sourceHash: string;
  /** Optional hash of the separately baked, scene-shared clean head. */
  headHash?: string;
  afroFaces?: number[];
  vertexCount: number;
  indexCount: number;
  /** Triangle labels after the loader's stable hat split. */
  regions: number[];
  /** 0 original paint, 1 skin, 2 hair (vertex samples; shader uses the full mask). */
  pigment: number[];
  skinReference: [number, number, number];
  hairReference: [number, number, number];
}

export interface NativeWardrobeRecipe {
  head: boolean; hat: boolean; torso: boolean; arms: boolean; hands: boolean; legs: boolean; feet: boolean;
}

const outfits: Record<string, { torso?: Cosmetics['torso']; legs?: Cosmetics['legs']; feet?: Cosmetics['feet']; hair: number }> = {
  'alpine-allrounder': { torso: 'torso_tracht_shirt', legs: 'legs_lederhosen', feet: 'feet_mountain_boots', hair: 0 },
  'alpine-heavy': { hair: 0 },
  'alpine-infiltrator': { torso: 'torso_loden_coat', legs: 'legs_olive_pants', feet: 'feet_mountain_boots', hair: 0 },
  'lagoon-allrounder': { torso: 'torso_hawaii_shirt', legs: 'legs_boardshorts', hair: 1 },
  'lagoon-heavy': { torso: 'torso_flamingo_ring', legs: 'legs_olive_pants', hair: 0 },
  'lagoon-infiltrator': { torso: 'torso_hawaii_shirt', legs: 'legs_boardshorts', hair: 0 },
};

export function nativeWardrobeRecipe(profile: PlayerProfile, asset: PaintedModelAsset): NativeWardrobeRecipe {
  const c = profile.cosmetics, outfit = outfits[asset.spec.key];
  if (!asset.wardrobe || !outfit) return { head: false, hat: false, torso: false, arms: false, hands: false, legs: false, feet: false };
  const torso = c.torso === outfit.torso;
  return {
    // A fused native hat does not contain a hidden scalp. Keep the complete
    // configurable head when its hat/hair is removed instead of exposing a hole.
    head: c.face === asset.spec.native.face && c.hairStyleIndex === outfit.hair
      && (asset.hatSplit === null || c.headgear === asset.spec.native.headgear),
    hat: asset.hatSplit !== null && c.headgear === asset.spec.native.headgear && c.hairStyleIndex === outfit.hair,
    torso, arms: torso,
    hands: c.hands === 'hands_bare' && asset.spec.native.hands === 'hands_bare',
    legs: c.legs === outfit.legs,
    feet: c.feet === outfit.feet,
  };
}

export function usesNativeRegion(recipe: NativeWardrobeRecipe, region: number): boolean {
  return [false, recipe.hat, recipe.head, recipe.torso, recipe.arms, recipe.hands, recipe.legs, recipe.feet][region] ?? false;
}

export function parseNativeWardrobe(value: unknown, vertices: number, indices: number): NativeWardrobeData | null {
  if (!value || typeof value !== 'object') return null;
  const d = value as Partial<NativeWardrobeData>;
  if (d.version !== 1 || d.vertexCount !== vertices || d.indexCount !== indices || typeof d.sourceHash !== 'string'
    || !/^[a-f0-9]{64}$/.test(d.sourceHash) || !Array.isArray(d.regions) || d.regions.length !== indices / 3
    || !d.regions.every(n => Number.isInteger(n) && n >= 1 && n <= 7)
    || !Array.isArray(d.pigment) || d.pigment.length !== vertices || !d.pigment.every(n => n === 0 || n === 1 || n === 2)) return null;
  if (d.afroFaces !== undefined && (!Array.isArray(d.afroFaces) || !d.afroFaces.every(n => Number.isInteger(n) && n >= 0 && n < indices / 3))) return null;
  if (d.headHash !== undefined && (typeof d.headHash !== 'string' || !/^[a-f0-9]{64}$/.test(d.headHash))) return null;
  for (const reference of [d.skinReference, d.hairReference]) if (!Array.isArray(reference) || reference.length !== 3 || !reference.every(n => Number.isFinite(n) && n > .01 && n <= 1)) return null;
  return d as NativeWardrobeData;
}
