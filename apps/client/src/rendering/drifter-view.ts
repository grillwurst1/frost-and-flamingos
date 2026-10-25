import { CreateDisc } from '@babylonjs/core/Meshes/Builders/discBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { Scene } from '@babylonjs/core/scene';
import type { PlayerProfile, Vec3 } from '@frost-and-flamingos/shared';
import type { AvatarPose, AvatarView } from './avatar';
import type { CharacterMaterialState } from './materials';

/**
 * View for the drifter class (Creepy Mountain Girl / Hot Beach Girl).
 *
 * The drifter only ever appears as the owner's painted model; she never falls
 * back to the procedural soldier rig. Until her painted model is on screen
 * this view keeps just her hovering contact shadow at the right place, so the
 * scene never shows a stand-in body.
 */
export class DrifterView implements AvatarView {
  readonly root: TransformNode;
  private readonly shadow: Mesh;
  private readonly shadowMaterial: StandardMaterial;
  private yaw = 0;
  private bob = Math.random() * Math.PI * 2;
  private disposed = false;

  constructor(scene: Scene, shadowMaterial: StandardMaterial, profile: PlayerProfile) {
    this.shadowMaterial = shadowMaterial;
    this.root = new TransformNode(`drifter-root-${profile.displayName}`, scene);
    this.shadow = CreateDisc('drifter-shadow', { radius: 0.42, tessellation: 20 }, scene);
    this.shadow.rotation.x = Math.PI / 2;
    this.shadow.position.y = 0.02;
    this.shadow.material = shadowMaterial;
    this.shadow.isPickable = false;
    this.shadow.parent = this.root;
  }

  update(deltaSeconds: number, pose: AvatarPose): void {
    if (this.disposed) return;
    this.setPosition(pose.position);
    this.setYaw(pose.yaw);
    // Her body hovers a hand's breadth up with a slow bob: the shadow breathes with it.
    this.bob += Math.min(0.1, Math.max(0, deltaSeconds)) * 1.6;
    const breathe = 0.92 + Math.sin(this.bob) * 0.05;
    this.shadow.scaling.set(breathe, breathe, 1);
    this.shadow.setEnabled(pose.alive);
  }

  updatePreview(deltaSeconds: number, spin: number): void {
    this.update(deltaSeconds, {
      position: { x: this.root.position.x, y: this.root.position.y, z: this.root.position.z },
      velocity: { x: 0, y: 0, z: 0 },
      yaw: spin,
      grounded: true,
      alive: true,
    });
  }

  /** Nothing can freeze, singe or soot her: material effects never apply. */
  setEffects(_partial: Partial<CharacterMaterialState>): void {}

  setPosition(position: Vec3): void {
    this.root.position.set(position.x, position.y, position.z);
  }

  setYaw(yaw: number, _immediate = false): void {
    this.yaw = yaw;
    this.root.rotation.y = this.yaw;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.dispose(false, false);
    this.shadowMaterial.dispose();
  }
}

export function createDrifterView(scene: Scene, shadowMaterial: StandardMaterial, profile: PlayerProfile): AvatarView {
  return new DrifterView(scene, shadowMaterial, profile);
}
