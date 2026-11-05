import type { Cosmetics, PlayerProfile } from '@frost-and-flamingos/shared';
import type { PaintedModelAsset } from './library';

export interface NativeGarment {
  version: 1; sourceHash: string;
  positions: number[]; normals: number[]; uvs: number[];
  joints: number[]; weights: number[]; indices: number[]; pigment: number[];
}

export interface NativeWardrobeData {
  version: 1;
  sourceHash: string;
  /** Optional hash of the separately baked, scene-shared clean head. */
  headHash?: string;
  bodyHash?: string;
  /** Closed authored leather surface, baked offline from this same rig. */
  breeches?: NativeGarment;
  shirt?: NativeGarment;
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
  // Clean, closed selected breeches replace the donor's ragged cloth silhouette.
  'alpine-allrounder': { torso: 'torso_tracht_shirt', feet: 'feet_mountain_boots', hair: 0 },
  'alpine-heavy': { hair: 0 },
  'alpine-infiltrator': { torso: 'torso_loden_coat', legs: 'legs_olive_pants', feet: 'feet_mountain_boots', hair: 0 },
  'lagoon-allrounder': { torso: 'torso_hawaii_shirt', legs: 'legs_boardshorts', hair: 1 },
  // This source fuses a vest, swim ring and short ragged trousers. It does
  // not contain the selectable bare-chest ring or full-length olive pants.
  // Reuse its sculpted anatomy, while generating complete selected clothes.
  'lagoon-heavy': { hair: 0 },
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
    legs: c.legs === outfit.legs || (c.legs === 'legs_lederhosen' && Boolean(asset.wardrobe.breeches)),
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
  if (d.bodyHash !== undefined && (typeof d.bodyHash !== 'string' || !/^[a-f0-9]{64}$/.test(d.bodyHash))) return null;
  if (d.headHash !== undefined && (typeof d.headHash !== 'string' || !/^[a-f0-9]{64}$/.test(d.headHash))) return null;
  for (const g of [d.breeches, d.shirt]) {
    if (g === undefined) continue;
    if (!g || typeof g !== 'object') return null;
    const count = g.positions?.length / 3;
    if (g.version !== 1 || g.sourceHash !== d.sourceHash || !Number.isInteger(count) || count < 100 || count > 15000) return null;
    for (const [a, length] of [[g.positions,count*3],[g.normals,count*3],[g.uvs,count*2],[g.joints,count*4],[g.weights,count*4],[g.pigment,count]] as const)
      if (!Array.isArray(a) || a.length !== length || !a.every(Number.isFinite)) return null;
    if (!Array.isArray(g.indices) || g.indices.length < 300 || g.indices.length > 27000 || g.indices.length % 3
      || !g.indices.every(i => Number.isInteger(i) && i >= 0 && i < count)
      || !g.pigment.every(i => i === 0 || i === 1)) return null;
    for (let v=0;v<count;v++) {
      let sum=0;
      for(let k=0;k<4;k++) {
        const j=g.joints[v*4+k]!,w=g.weights[v*4+k]!;
        if(!Number.isInteger(j)||j<0||j>=512||w<0||w>1)return null;
        sum+=w;
      }
      if(sum<.999||sum>1.001)return null;
    }
  }
  for (const reference of [d.skinReference, d.hairReference]) if (!Array.isArray(reference) || reference.length !== 3 || !reference.every(n => Number.isFinite(n) && n > .01 && n <= 1)) return null;
  return d as NativeWardrobeData;
}
