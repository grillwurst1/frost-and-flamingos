import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Material } from '@babylonjs/core/Materials/material';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';
import type { WeaponId } from '@frost-and-flamingos/shared';
import { weaponDesign, type MuzzleKind, type WeaponDesign, type WeaponHoldData } from './designs';
import { WeaponKit, type V3 } from './kit';

/**
 * Runtime hero weapon: one merged vertex-coloured mesh (one draw call), a
 * muzzle socket, a comic muzzle flash / beam plume that lives on the socket,
 * and for the umbrella a canopy that pops open and furls.
 *
 * Frame options:
 *   origin 'wrist'  weapon origin = the right wrist target (painted soldiers'
 *                   two-bone IK pulls the wrist joint there); the gun is
 *                   offset so the grip handle sits in the palm.
 *   origin 'grip'   weapon origin = the grip handle (fist-centred rigs).
 *   mirrorX         Babylon-space rigs whose +X is the holder's right.
 */
export interface HeroWeaponOptions {
  origin?: 'wrist' | 'grip';
  mirrorX?: boolean;
}

export interface HeroWeaponState {
  /** Falling / gliding: the umbrella opens overhead. */
  airborne: boolean;
  /** Wardrobe / menu turntable: show the weapon at its best. */
  preview: boolean;
}

/** Pose the animator applies this frame (mutable; the umbrella changes it). */
export interface HeroHoldPose {
  /** Right wrist target from the shoulder midpoint, aim frame (x right, y up, z forward). */
  shoulder: [number, number, number];
  tilt: number;
  yaw: number;
  /** Support wrist target in weapon space, or null (one-handed). */
  support: Vector3 | null;
}

export interface HeroWeapon {
  readonly id: WeaponId;
  readonly mesh: Mesh;
  readonly hold: WeaponHoldData;
  readonly pose: HeroHoldPose;
  /** Socket at the muzzle; its +Z points out of the barrel. */
  readonly muzzle: TransformNode | null;
  /** Weapon-space z of the stock butt, or null when nothing sits behind the grip. */
  readonly rear: number | null;
  readonly vertexCount: number;
  /** Shot feedback on the prop: muzzle flash / plume / sound rings, umbrella pop. */
  fire(): void;
  animate(deltaSeconds: number, state: HeroWeaponState): void;
  dispose(): void;
}

/**
 * Where the grip handle sits relative to the right wrist joint of the painted
 * (Mixamo) hands under the animator's hand orientation: in the palm, a little
 * towards the fingers and the holder's left, below the wrist.
 */
const GRIP_FROM_WRIST: V3 = [0.045, -0.05, 0.072];
/** Same for the support hand: its wrist sits up-left-behind the grip point. */
const SUPPORT_WRIST_FROM_GRIP: V3 = [0.045, 0.04, -0.07];

/** Umbrella overhead while gliding, and held out front as a shield after a pop. */
const UMBRELLA_GLIDE = { shoulder: [0.1, 0.38, 0.06] as V3, tilt: 0.05, yaw: 0 };
const UMBRELLA_SHIELD = { shoulder: [0.14, -0.02, 0.3] as V3, tilt: -1.05, yaw: 0.15 };

const flashMaterials = new WeakMap<Scene, StandardMaterial>();

/** Shared unlit vertex-colour material for flashes (never disposed by a prop). */
function flashMaterial(scene: Scene): StandardMaterial {
  let material = flashMaterials.get(scene);
  if (!material) {
    material = new StandardMaterial('hero-weapon-flash', scene);
    material.disableLighting = true;
    material.emissiveColor = Color3.White();
    material.diffuseColor = Color3.Black();
    material.specularColor = Color3.Black();
    material.backFaceCulling = false;
    material.fogEnabled = false;
    flashMaterials.set(scene, material);
    const created = material;
    scene.onDisposeObservable.addOnce(() => {
      created.dispose();
      flashMaterials.delete(scene);
    });
  }
  return material;
}

interface FlashSpec {
  life: number;
  build: (kit: WeaponKit) => void;
}

const FLASH_CORE = '#fff8c8';
const FLASH_MID = '#ffd23f';
const FLASH_EDGE = '#ff8a1c';

function starBurst(kit: WeaponKit, length: number, radius: number, spikes: number): void {
  // Forward spike cone with a star section, plus a flat star rosette.
  kit.lathe(
    [
      { z: 0, r: radius * 0.45, hex: FLASH_CORE },
      { z: length * 0.25, r: radius, hex: FLASH_MID },
      { z: length, r: 0, hex: FLASH_EDGE },
    ],
    { segments: spikes * 2, bump: (theta, ring) => (ring === 1 ? (Math.cos(theta * spikes) > 0 ? 0.35 : -0.45) : 0) },
  );
  kit.lathe(
    [
      { z: -0.004, r: 0, hex: FLASH_CORE },
      { z: 0.0, r: radius * 1.5, hex: FLASH_EDGE },
      { z: 0.004, r: 0 },
    ],
    { segments: spikes * 2, phase: Math.PI / spikes / 2, bump: (theta, ring) => (ring === 1 ? (Math.cos(theta * spikes) > 0 ? 0.4 : -0.55) : 0) },
  );
}

const FLASHES: Record<MuzzleKind, FlashSpec> = {
  bullet: { life: 0.06, build: (kit) => starBurst(kit, 0.24, 0.09, 6) },
  heavy: { life: 0.08, build: (kit) => starBurst(kit, 0.38, 0.13, 7) },
  blast: {
    life: 0.14,
    build: (kit) => {
      starBurst(kit, 0.6, 0.22, 8);
      kit.blob('#f4f1e8', [0.2, 0.2, 0.16], { at: [0, 0, 0.1], segments: 8, rings: 5 });
    },
  },
  snow: {
    life: 0.16,
    build: (kit) => {
      kit.lathe(
        [
          { z: 0, r: 0.07, hex: '#ffffff' },
          { z: 0.3, r: 0.17, hex: '#e8f7ff' },
          { z: 0.75, r: 0.3, hex: '#bfe6fb' },
          { z: 1.0, r: 0.0, hex: '#ffffff' },
        ],
        { segments: 10, bump: (theta, ring) => (ring >= 1 ? 0.18 * Math.sin(theta * 3 + ring) : 0) },
      );
    },
  },
  flame: {
    life: 0.16,
    build: (kit) => {
      kit.lathe(
        [
          { z: 0, r: 0.04, hex: FLASH_CORE },
          { z: 0.25, r: 0.13, hex: FLASH_MID },
          { z: 0.65, r: 0.22, hex: FLASH_EDGE },
          { z: 1.05, r: 0.0, hex: '#e2401c' },
        ],
        { segments: 10, bump: (theta, ring) => (ring >= 1 ? 0.25 * Math.sin(theta * 4 + ring * 1.7) : 0) },
      );
    },
  },
  sonic: {
    life: 0.5,
    build: (kit) => {
      for (const [index, r] of [0.12, 0.2, 0.28].entries()) {
        const z = index * 0.18;
        kit.lathe(
          [
            { z: z - 0.015, r: r * 0.86, hex: '#fff3c4' },
            { z, r, hex: '#ffe08a' },
            { z: z + 0.015, r: r * 0.86, hex: '#fff3c4' },
            { z, r: r * 0.72 },
            { z: z - 0.015, r: r * 0.86 },
          ],
          { segments: 14 },
        );
      }
    },
  },
};

function vec(value: V3, mirror: boolean): Vector3 {
  return new Vector3(mirror ? -value[0] : value[0], value[1], value[2]);
}

function buildPart(
  scene: Scene,
  name: string,
  material: Material | null,
  draw: (kit: WeaponKit) => void,
  origin: V3,
  mirror: boolean,
  tilt = 0,
): { mesh: Mesh; vertices: number } {
  const kit = new WeaponKit();
  // World up in gun space while held (the hold pitches the gun by `tilt`).
  kit.paintUp = [0, Math.cos(tilt), Math.sin(tilt)];
  kit.frame({ at: origin }, () => draw(kit));
  if (mirror) kit.mirrorX();
  return { mesh: kit.build(scene, name, material), vertices: kit.vertexCount };
}

class HeroWeaponProp implements HeroWeapon {
  readonly mesh: Mesh;
  readonly muzzle: TransformNode | null;
  readonly pose: HeroHoldPose;
  readonly vertexCount: number;
  readonly rear: number | null;
  private readonly flash: Mesh | null;
  private readonly flashLife: number;
  private flashAge = Infinity;
  private flashSpin = 0;
  private readonly closed: Mesh | null;
  private readonly open: Mesh | null;
  private openness = 0;
  private openVelocity = 0;
  private popTimer = 0;
  private disposed = false;

  constructor(
    scene: Scene,
    readonly id: WeaponId,
    private readonly design: WeaponDesign,
    material: Material,
    private readonly options: Required<HeroWeaponOptions>,
  ) {
    const mirror = options.mirrorX;
    const origin: V3 = options.origin === 'wrist' ? GRIP_FROM_WRIST : [0, 0, 0];
    const body = buildPart(scene, `hero-weapon-${id}`, material, design.build, origin, mirror, design.hold.tilt);
    this.mesh = body.mesh;
    let vertices = body.vertices;
    const hold = design.hold;
    const offset = vec(origin, mirror);
    if (hold.muzzle) {
      const muzzle = new TransformNode(`hero-weapon-${id}-muzzle`, scene);
      muzzle.parent = this.mesh;
      muzzle.position.copyFrom(vec(hold.muzzle, mirror).addInPlace(offset));
      const direction = vec(hold.muzzleDir ?? [0, 0, 1], mirror).normalize();
      muzzle.rotationQuaternion = Quaternion.FromUnitVectorsToRef(new Vector3(0, 0, 1), direction, new Quaternion());
      this.muzzle = muzzle;
    } else {
      this.muzzle = null;
    }
    const flashSpec = hold.muzzleKind ? FLASHES[hold.muzzleKind] : null;
    if (flashSpec && this.muzzle) {
      const flash = buildPart(scene, `hero-weapon-${id}-flash`, flashMaterial(scene), flashSpec.build, [0, 0, 0], false);
      flash.mesh.parent = this.muzzle;
      flash.mesh.setEnabled(false);
      this.flash = flash.mesh;
      this.flashLife = flashSpec.life;
    } else {
      this.flash = null;
      this.flashLife = 0;
    }
    if (design.extra) {
      const closed = buildPart(scene, `hero-weapon-${id}-closed`, material, design.extra.closed, origin, mirror, design.hold.tilt);
      const open = buildPart(scene, `hero-weapon-${id}-open`, material, design.extra.open, origin, mirror);
      closed.mesh.parent = this.mesh;
      open.mesh.parent = this.mesh;
      open.mesh.setEnabled(false);
      this.closed = closed.mesh;
      this.open = open.mesh;
      vertices += Math.max(closed.vertices, open.vertices);
    } else {
      this.closed = null;
      this.open = null;
    }
    this.vertexCount = vertices;
    this.rear = hold.butt !== undefined ? hold.butt + origin[2] : null;
    this.pose = {
      shoulder: [hold.shoulder[0], hold.shoulder[1], hold.shoulder[2]],
      tilt: hold.tilt,
      yaw: hold.yaw,
      support: hold.support ? this.supportWrist(hold.support) : null,
    };
  }

  get hold(): WeaponHoldData {
    return this.design.hold;
  }

  /** Support-hand wrist target in weapon space for a gun-space grip point. */
  private supportWrist(point: V3): Vector3 {
    const wrist = this.options.origin === 'wrist';
    const origin = wrist ? GRIP_FROM_WRIST : [0, 0, 0];
    const fromGrip = wrist ? SUPPORT_WRIST_FROM_GRIP : [0, 0, 0];
    return vec([point[0] + (origin[0] ?? 0) + (fromGrip[0] ?? 0), point[1] + (origin[1] ?? 0) + (fromGrip[1] ?? 0), point[2] + (origin[2] ?? 0) + (fromGrip[2] ?? 0)], this.options.mirrorX);
  }

  fire(): void {
    if (this.flash) {
      this.flashAge = 0;
      this.flashSpin = Math.random() * Math.PI * 2;
    }
    if (this.open) this.popTimer = 1.6;
  }

  animate(deltaSeconds: number, state: HeroWeaponState): void {
    if (this.disposed) return;
    const dt = Math.min(0.1, Math.max(0, deltaSeconds));
    if (this.flash) {
      this.flashAge += dt;
      const visible = this.flashAge < this.flashLife;
      this.flash.setEnabled(visible);
      if (visible) {
        const t = this.flashAge / this.flashLife;
        const kind = this.design.hold.muzzleKind;
        if (kind === 'sonic') {
          this.flash.scaling.setAll(0.6 + t * 1.6);
          this.flash.position.z = t * 0.9;
        } else if (kind === 'snow' || kind === 'flame') {
          const flicker = 0.85 + 0.3 * Math.sin(this.flashSpin * 7 + this.flashAge * 60);
          this.flash.scaling.set(flicker, flicker, 0.8 + 0.4 * Math.min(1, t * 3));
          this.flash.rotation.z = this.flashSpin + this.flashAge * 4;
        } else {
          const grow = 0.75 + 0.5 * Math.sin(Math.min(1, t * 1.6) * Math.PI * 0.5);
          this.flash.scaling.set(grow, grow, grow * (1.15 - t * 0.4));
          this.flash.rotation.z = this.flashSpin;
        }
      }
    }
    if (this.open && this.closed) this.animateUmbrella(dt, state);
    this.updatePose(state);
  }

  /** Hold for this frame: base, turntable preview, or the umbrella's states. */
  private updatePose(state: HeroWeaponState): void {
    const pose = this.pose;
    const base = this.design.hold;
    let target: { shoulder: V3; tilt: number; yaw: number } = state.preview && this.design.preview ? this.design.preview : base;
    if (this.open) {
      if (state.airborne && this.openness > 0.3) target = UMBRELLA_GLIDE;
      else if (!state.preview && this.popTimer > 0) target = UMBRELLA_SHIELD;
    }
    pose.shoulder = [target.shoulder[0], target.shoulder[1], target.shoulder[2]];
    pose.tilt = target.tilt;
    pose.yaw = target.yaw;
  }

  /** Spring the canopy open (preview, gliding, after a pop) or furled. */
  private animateUmbrella(dt: number, state: HeroWeaponState): void {
    const open = this.open;
    const closed = this.closed;
    if (!open || !closed) return;
    this.popTimer = Math.max(0, this.popTimer - dt);
    const target = state.preview || state.airborne || this.popTimer > 0 ? 1 : 0;
    // Under-damped spring: a cartoon "pop" with overshoot when opening.
    const stiffness = target > this.openness ? 260 : 120;
    const damping = target > this.openness ? 14 : 18;
    this.openVelocity += ((target - this.openness) * stiffness - this.openVelocity * damping) * dt;
    this.openness = Math.max(0, this.openness + this.openVelocity * dt);
    const shown = this.openness > 0.12;
    open.setEnabled(shown);
    closed.setEnabled(!shown);
    if (shown) {
      // Radial spread from a furled bundle, canopy hinging on the tip.
      const spread = Math.min(1.12, this.openness);
      const tipY = 0.96 + (this.options.origin === 'wrist' ? GRIP_FROM_WRIST[1] : 0);
      open.scaling.set(spread, 0.7 + 0.3 * spread, spread);
      open.position.y = tipY * (1 - open.scaling.y);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    // Children (socket, flash, canopy parts) go with the mesh; the flash
    // material is shared per scene and stays.
    this.mesh.dispose(false, false);
  }
}

/**
 * Builds one hero weapon, or null for ids without a prop (mascot moves).
 * `material` must read vertex colours (position, normal, color attributes).
 */
export function buildHeroWeapon(scene: Scene, id: WeaponId, material: Material, options: HeroWeaponOptions = {}): HeroWeapon | null {
  const design = weaponDesign(id);
  if (!design) return null;
  return new HeroWeaponProp(scene, id, design, material, { origin: options.origin ?? 'wrist', mirrorX: options.mirrorX ?? false });
}
