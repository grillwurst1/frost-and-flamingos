import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { Scene } from '@babylonjs/core/scene';
import type { MascotWireState, PlayerProfile, Vec3, WeaponId } from '@frost-and-flamingos/shared';
import { CharacterView, type CharacterPose } from './character';
import { createDrifterView } from './drifter-view';
import { createPaintedAvatarView } from './glb-character';
import type { CharacterMaterialState } from './materials';
import type { MascotFx } from './mascot-fx';
import { MascotPreviewPair, MascotView } from './mascot-view';

/** Pose for any avatar. The mascot fields are ignored by the human rig. */
export interface AvatarPose extends CharacterPose {
  heading?: number;
  mascot?: MascotWireState | null;
  launchSeconds?: number;
  dazed?: boolean;
  /** Drifter: head of the nearest enemy within 15 m (her slow creepy stare), or null. */
  stare?: Vec3 | null;
  /** Drifter: 0–1 while another body passes through her (cosmetic shimmer). */
  shimmer?: number;
  /** Weapon in hand (painted GLB characters hold it; null = unarmed). */
  weaponId?: WeaponId | null;
  /** Aim pitch in radians (+ = up); only known for the local player. */
  pitch?: number;
  reloading?: boolean;
  /** hp / maxHp, 0…1 (mascot expressions: hurt flinch, scared at low vitality). */
  vitality?: number;
  /** Kill counter from the snapshot (mascots celebrate a new kill). */
  kills?: number;
}

/**
 * The small surface GameClient needs from a player view. CharacterView (the
 * human rig) and MascotView both satisfy it structurally.
 */
export interface AvatarView {
  readonly root: TransformNode;
  update(deltaSeconds: number, pose: AvatarPose): void;
  updatePreview(deltaSeconds: number, spin: number, weaponId?: WeaponId | null): void;
  setEffects(partial: Partial<CharacterMaterialState>): void;
  setPosition(position: Vec3): void;
  setYaw(yaw: number, immediate?: boolean): void;
  /** Fire feedback (recoil / melee swing); `pitch` is the shot's aim pitch. */
  kick?(pitch?: number): void;
  /** Taunt / victory clip. */
  taunt?(): void;
  dispose(): void;
}

export interface AvatarOptions {
  /** Shared mascot FX layer (dust, popups); omit for previews. */
  fx?: MascotFx | null;
  /** Wardrobe/menu preview: mascots show both forms side by side. */
  preview?: boolean;
}

/** Builds the right view for a profile: the human rig or a mascot. */
export function createAvatarView(
  scene: Scene,
  shadowMaterial: StandardMaterial,
  profile: PlayerProfile,
  options: AvatarOptions = {},
): AvatarView {
  // The drifter is only ever her painted model (never the procedural rig).
  if (profile.cosmetics.classId === 'drifter') return createDrifterView(scene, shadowMaterial, profile);
  if (profile.cosmetics.classId === 'mascot') {
    if (options.preview) return new MascotPreviewPair(scene, shadowMaterial, profile);
    return new MascotView(scene, shadowMaterial, profile, options.fx ?? null);
  }
  // The owner's painted Meshy models, when one exists for this faction and
  // class and the outfit matches the painting; otherwise the procedural rig.
  const painted = createPaintedAvatarView(scene, shadowMaterial, profile);
  if (painted) return painted;
  return new CharacterView(scene, shadowMaterial, profile);
}

export function isMascotView(view: AvatarView | null | undefined): view is MascotView {
  return view instanceof MascotView;
}
