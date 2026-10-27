import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Camera } from '@babylonjs/core/Cameras/camera';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import { HANDS_PALETTES, SKIN_TONES, TORSO_PALETTES, profileAppearanceKey, type PlayerProfile, type WeaponId } from '@frost-and-flamingos/shared';
import { createGlbMaterial, updateGlbMaterial } from './glb/material';
import { buildWeaponProp, buildWrenchProp, PartList, type WeaponProp } from './glb/props';
import { registerHeroWeaponProps } from './weapons/glb-adapter';

/** One local viewmodel, sharing the existing material program and hero weapon geometry. */
export class VehicleHands {
  readonly root: TransformNode;
  private readonly material;
  private weapon: WeaponProp | null = null;
  private appearance = '';
  private time = 0;
  private repair = false;

  constructor(private readonly scene: Scene, camera: Camera) {
    registerHeroWeaponProps();
    this.root = new TransformNode('sidecar-first-person-hands', scene);
    this.root.parent = camera;
    this.root.setEnabled(false);
    this.material = createGlbMaterial(scene, 'passenger-hands-material', null, { soft: true });
  }

  update(dt: number, profile: PlayerProfile, weaponId: WeaponId, repairing: boolean, firing: boolean): void {
    const key = `${profileAppearanceKey(profile)}:${repairing ? 'wrench' : weaponId}`;
    if (key !== this.appearance) {
      for (const child of this.root.getChildren()) child.dispose();
      this.appearance = key;
      this.repair = repairing;
      this.weapon = repairing ? buildWrenchProp(this.scene, this.material) : buildWeaponProp(this.scene, weaponId, this.material);
      this.buildArms(profile);
    }
    this.root.setEnabled(true);
    this.time += Math.min(dt, 0.05);
    const bob = Math.sin(this.time * 2.1) * 0.004;
    this.root.position.set(0, bob, firing && !repairing ? -0.018 * Math.max(0, Math.sin(this.time * 45)) : 0);
    this.root.rotation.z = repairing ? Math.sin(this.time * 10) * 0.07 : 0;
    if (this.weapon) {
      this.weapon.animate?.(Math.min(dt, 0.05), { falling: false, preview: false });
      // The wrench works down towards the visible sidecar rim.
      this.weapon.mesh.rotation.x = repairing ? 0.6 + Math.sin(this.time * 10) * 0.22 : -this.weapon.hold.tilt * 0.25;
    }
    const camera = this.scene.activeCamera;
    if (camera) updateGlbMaterial(this.material, camera.position, this.time, { battleDamage: 0, frozen: 0, charred: 0 });
  }

  private buildArms(profile: PlayerProfile): void {
    const cosmetics = profile.cosmetics;
    const skin = SKIN_TONES[cosmetics.skinToneIndex] ?? SKIN_TONES[0]!;
    const sleeve = TORSO_PALETTES[cosmetics.torso].primary;
    const glove = HANDS_PALETTES[cosmetics.hands];
    const covered = cosmetics.hands === 'hands_boxing' || cosmetics.hands === 'hands_mittens';
    const parts = new PartList(this.scene);
    const grip = new Vector3(0.13, this.repair ? -0.1 : -0.14, 0.5);
    if (this.weapon) {
      this.weapon.mesh.parent = this.root;
      this.weapon.mesh.position.copyFrom(grip);
    }
    const support = this.weapon?.hold.support;
    const left = support ? grip.add(support) : new Vector3(-0.26, -0.36, 0.6);
    const limb = (from: Vector3, to: Vector3, color: string, width: number): Mesh => {
      const middle = Vector3.Center(from, to);
      const mesh = parts.cylinder(color, Vector3.Distance(from, to), width * 0.85, width,
        middle.x, middle.y, middle.z, { segments: 12 });
      mesh.rotationQuaternion = Quaternion.Identity();
      Quaternion.FromUnitVectorsToRef(Vector3.Up(), to.subtract(from).normalize(), mesh.rotationQuaternion);
      return mesh;
    };
    for (const [side, hand] of [[-1, left], [1, grip]] as const) {
      const elbow = new Vector3(side * 0.39, -0.52, 0.22);
      const wrist = hand.add(new Vector3(0, -0.025, -0.08));
      limb(elbow, wrist, sleeve, 0.14);
      parts.cylinder('#e9dfc6', 0.05, 0.135, 0.14, wrist.x, wrist.y, wrist.z, { rx: Math.PI / 2, segments: 12 });
      const color = covered ? glove.primary : skin;
      const hook = cosmetics.hands === 'hands_pirate_hook' && side === 1;
      if (hook) {
        parts.torus(glove.primary, 0.12, 0.027, hand.x, hand.y, hand.z + 0.03, { rx: Math.PI / 2 });
      } else {
        const size = cosmetics.hands === 'hands_boxing' ? 0.22 : covered ? 0.17 : 0.115;
        parts.sphere(color, size, hand.x, hand.y, hand.z, { sx: 0.9, sy: 0.7, sz: 1.15, segments: 8 });
        if (covered) parts.cylinder(glove.secondary, 0.055, size * 0.7, size * 0.75,
          wrist.x, wrist.y, wrist.z, { rx: Math.PI / 2, segments: 12 });
        if (!covered) {
          for (let finger = 0; finger < 4; finger++) {
            parts.sphere(skin, 0.035, hand.x - 0.045 + finger * 0.029, hand.y - 0.036, hand.z + 0.045,
              { sy: 0.75, sz: 1.5, segments: 6 });
          }
          parts.sphere(skin, 0.045, hand.x + side * -0.06, hand.y + 0.012, hand.z + 0.023, { sz: 1.4, segments: 6 });
        }
      }
      if (cosmetics.hands === 'hands_gold_watch') {
        parts.torus(glove.primary, 0.13, 0.02, wrist.x, wrist.y, wrist.z, { rx: Math.PI / 2, segments: 12 });
        parts.sphere(glove.secondary, 0.06, wrist.x, wrist.y + 0.06, wrist.z, { sy: 0.3, segments: 8 });
      }
    }
    const arms = parts.merge('passenger-forearms-and-fingers', this.material);
    if (arms) arms.parent = this.root;
    this.root.metadata = { appearance: this.appearance, repairing: this.repair };
  }

  hide(): void { this.root.setEnabled(false); }

  kick(): void { if (this.root.isEnabled() && !this.repair) this.weapon?.fire?.(); }

  muzzlePosition(): Vector3 | null {
    const muzzle = this.weapon?.muzzle;
    if (!this.root.isEnabled() || !muzzle || this.repair) return null;
    muzzle.computeWorldMatrix(true);
    return muzzle.getAbsolutePosition().clone();
  }

  dispose(): void {
    this.root.dispose(false, false);
    this.material.dispose();
  }
}
