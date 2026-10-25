import { Constants } from '@babylonjs/core/Engines/constants';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture';
import { CreateDisc } from '@babylonjs/core/Meshes/Builders/discBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { Scene } from '@babylonjs/core/scene';
import { drifterFormForFaction, type DrifterForm, type PlayerProfile, type Vec3 } from '@frost-and-flamingos/shared';
import type { AvatarPose, AvatarView } from './avatar';
import { GlbCharacterView } from './glb-character';
import { DRIFTER_MODEL_KEYS } from './glb/drifter-models';
import { paintedModelLibrary } from './glb/library';
import type { PaintedTextures } from './glb/material';
import { createShadowMaterial, type CharacterMaterialState } from './materials';

/**
 * View for the drifter class (Creepy Mountain Girl / Hot Beach Girl).
 *
 * She only ever appears as the owner's painted model, rendered by package
 * 3C's GlbCharacterView with her walk-only gait (see glb/drifter-models.ts);
 * she never falls back to the procedural soldier rig. Until her model and
 * textures are loaded this view shows just her contact shadow in place.
 *
 * On top of the painted view it times her idle behaviour: the mountain girl
 * beckons (Call_Gesture) after ~4 s standing still and now and then skips in
 * place (Skip_Forward); `gesture()` is the heal moment (Call_Gesture / Cheer).
 */

/** Seconds of standing still before the mountain girl beckons. */
const BECKON_AFTER = 4;
/** Chance that an idle one-shot is the skip instead of the beckon. */
const SKIP_CHANCE = 0.18;
const IDLE_SPEED = 0.35;

const flatNormals = new WeakMap<Scene, RawTexture>();

/**
 * Flat tangent-space normal map (0.5, 0.5, 1). The Creepy Mountain Girl ships
 * without a normal map; binding the albedo in its place (with zero strength)
 * still feeds the albedo's blue channel into the normal's z, which can flip
 * or zero it. One tiny texture per scene, disposed with the scene.
 */
function flatNormalTexture(scene: Scene): RawTexture {
  const cached = flatNormals.get(scene);
  if (cached) return cached;
  const texels = new Uint8Array(4 * 4 * 4);
  for (let index = 0; index < texels.length; index += 4) texels.set([128, 128, 255, 255], index);
  const texture = RawTexture.CreateRGBATexture(texels, 4, 4, scene, false, false, Constants.TEXTURE_NEAREST_SAMPLINGMODE);
  texture.name = 'ff-drifter-flat-normal';
  flatNormals.set(scene, texture);
  scene.onDisposeObservable.addOnce(() => flatNormals.delete(scene));
  return texture;
}

/** Her textures with a flat normal map in place of a missing one. */
function withNormalMap(scene: Scene, textures: PaintedTextures): PaintedTextures {
  return textures.normal ? textures : { ...textures, normal: flatNormalTexture(scene) };
}

export class DrifterView implements AvatarView {
  readonly root: TransformNode;
  private readonly form: DrifterForm;
  private readonly shadow: Mesh;
  private readonly shadowMaterial: StandardMaterial;
  private painted: GlbCharacterView | null = null;
  private yaw = 0;
  private idleTime = 0;
  private nextIdleGesture = BECKON_AFTER;
  private disposed = false;

  constructor(scene: Scene, shadowMaterial: StandardMaterial, profile: PlayerProfile) {
    this.form = drifterFormForFaction(profile.faction);
    this.shadowMaterial = shadowMaterial;
    this.root = new TransformNode(`drifter-root-${profile.displayName}`, scene);
    this.shadow = CreateDisc('drifter-shadow', { radius: 0.42, tessellation: 20 }, scene);
    this.shadow.rotation.x = Math.PI / 2;
    this.shadow.position.y = 0.02;
    this.shadow.material = shadowMaterial;
    this.shadow.isPickable = false;
    this.shadow.parent = this.root;

    const key = DRIFTER_MODEL_KEYS[this.form];
    const library = paintedModelLibrary(scene);
    // Her model and textures are requested at once (drifters are few, and
    // she is never replaced by a stand-in while they load).
    void library
      .loadWithTextures(key)
      .then((loaded) => {
        if (this.disposed || !loaded) return;
        const painted = new GlbCharacterView(
          scene,
          createShadowMaterial(scene, `${shadowMaterial.name}-painted`),
          profile,
          loaded.asset,
          withNormalMap(scene, loaded.textures),
        );
        painted.root.parent = this.root;
        painted.setPosition({ x: 0, y: 0, z: 0 });
        painted.setYaw(0, true);
        this.painted = painted;
        // The painted view brings its own contact shadow.
        this.shadow.setEnabled(false);
      })
      .catch((error: unknown) => {
        console.warn('[frost-and-flamingos] drifter model unavailable; only her shadow is shown', error);
      });
  }

  /** Heal moment: the mountain girl beckons, the beach girl cheers. */
  gesture(): void {
    this.painted?.taunt();
    this.nextIdleGesture = this.idleTime + BECKON_AFTER * 1.5;
  }

  update(deltaSeconds: number, pose: AvatarPose): void {
    if (this.disposed) return;
    const dt = Math.min(0.1, Math.max(0, deltaSeconds));
    this.setPosition(pose.position);
    this.setYaw(pose.yaw);
    const speed = Math.hypot(pose.velocity.x, pose.velocity.z);
    if (pose.alive && speed < IDLE_SPEED) this.idleTime += dt;
    else {
      this.idleTime = 0;
      this.nextIdleGesture = BECKON_AFTER;
    }
    const painted = this.painted;
    if (!painted) return;
    if (this.form === 'mountain_girl' && this.idleTime >= this.nextIdleGesture && !painted.performing) {
      if (Math.random() < SKIP_CHANCE) painted.emote();
      else painted.taunt();
      this.nextIdleGesture = this.idleTime + 7 + Math.random() * 5;
    }
    // The painted view is parented to this root: it runs in local space.
    painted.update(dt, {
      ...pose,
      position: { x: 0, y: 0, z: 0 },
      velocity: this.toLocal(pose.velocity),
      yaw: 0,
      stare: pose.stare ?? null,
      weaponId: null,
    });
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

  setYaw(yaw: number, immediate = false): void {
    let difference = (yaw - this.yaw) % (Math.PI * 2);
    if (difference > Math.PI) difference -= Math.PI * 2;
    if (difference < -Math.PI) difference += Math.PI * 2;
    this.yaw = immediate ? yaw : this.yaw + difference * 0.24;
    this.root.rotation.y = this.yaw;
  }

  /** World velocity in the root's (yawed) frame, as the painted view expects with yaw 0. */
  private toLocal(velocity: Vec3): Vec3 {
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    return {
      x: velocity.x * cos - velocity.z * sin,
      y: velocity.y,
      z: velocity.x * sin + velocity.z * cos,
    };
  }

  /** DEV probe for the screenshot scripts. */
  get isPainted(): boolean {
    return this.painted !== null;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.painted?.dispose();
    this.painted = null;
    this.root.dispose(false, false);
    this.shadowMaterial.dispose();
  }
}

export function createDrifterView(scene: Scene, shadowMaterial: StandardMaterial, profile: PlayerProfile): AvatarView {
  return new DrifterView(scene, shadowMaterial, profile);
}
