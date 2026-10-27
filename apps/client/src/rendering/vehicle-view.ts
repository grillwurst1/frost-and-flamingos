import type { InstantiatedEntries } from '@babylonjs/core/assetContainer';
import { AnimationGroup } from '@babylonjs/core/Animations/animationGroup';
import { Vector3 } from '@babylonjs/core/Maths/math';
import type { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';
import {
  VEHICLES,
  vehicleLocalToWorld,
  type DrivableVehicleKind,
  type Vec3,
  type VehicleDefinition,
} from '@frost-and-flamingos/shared';
import { registerPaintedModel } from './glb/catalog';
import { paintedModelLibrary } from './glb/library';
import { createGlbMaterial, updateGlbMaterial, type PaintedTextures } from './glb/material';
import { PartList } from './glb/props';
import { buildRowboat, type RowboatModel } from './rowboat';

/**
 * Renders one drivable vehicle with the owner's painted Meshy model through
 * package 3C's GLB loader and cel material (static path). The pipeline split
 * the fused model into parts (scripts/vehicle-parts.ts): `ff-turret` yaws,
 * `ff-barrel` pitches, `ff-wheel<n>-r<cm>` spin with the ground speed,
 * `ff-steer` turns with the sidecar's front wheel. Until the model has loaded
 * (or if it is missing) a small vertex-coloured stand-in is shown.
 *
 * Node frame: root (base position, yaw) → tilt (terrain pitch/roll, boat bob)
 * → glTF __root__ (Babylon mirrors X there, so part yaws are negated).
 */

/** Register the vehicle models with the painted-model catalogue (static GLBs). */
for (const definition of Object.values(VEHICLES)) {
  registerPaintedModel({
    key: definition.modelKey,
    file: `${definition.modelKey}.glb`,
    native: { headgear: '', face: '', torso: '', back: '', hands: '', legs: '', feet: '' },
    clips: {},
    hatCutY: null,
    head: { y: 0, z: 0, radius: 0.1 },
    backZ: 0,
    bulk: 1,
    armed: false,
  });
}

export interface VehicleViewPose {
  seats?: readonly number[];
  position: Vec3;
  yaw: number;
  /** Signed ground speed along the hull (wheel spin). */
  forwardSpeed: number;
  turretYaw: number;
  turretPitch: number;
  steer: number;
  wreck: boolean;
  afloat: boolean;
  /** 0 = pristine, 1 = about to blow. */
  damage: number;
}

/** Terrain + props height under a point (client physics raycast). */
export type VehicleGroundProbe = (x: number, z: number, fromY: number) => number | null;

interface Wheel {
  node: TransformNode;
  radius: number;
}

const TILT_RESPONSE = 7;
/** The painted model loads once the vehicle comes this close to the camera… */
const LAZY_LOAD_RANGE = 120;
/** …or is on screen within this range (farther away the stand-in is a few pixels). */
const LAZY_ON_SCREEN_RANGE = 400;

export class VehicleView {
  readonly root: TransformNode;
  readonly kind: DrivableVehicleKind;
  readonly definition: VehicleDefinition;
  private readonly scene: Scene;
  private readonly tilt: TransformNode;
  private material: ShaderMaterial;
  private readonly fallbackMaterial: ShaderMaterial;
  private fallback: Mesh | null = null;
  private entries: InstantiatedEntries | null = null;
  private turret: TransformNode | null = null;
  private barrel: TransformNode | null = null;
  private steerNode: TransformNode | null = null;
  private readonly wheels: Wheel[] = [];
  private rowboat: RowboatModel | null = null;
  private readonly paintedOars: RowboatModel['oars'] = [];
  private pitch = 0;
  private roll = 0;
  private wheelAngle = 0;
  private time = 0;
  private balloon = 0;
  private disposed = false;
  private loadRequested = false;
  /** Ground tilt of the last probe; parked hulls reuse it instead of ray-casting every frame. */
  private readonly probe = { x: Number.NaN, z: Number.NaN, yaw: Number.NaN, pitch: 0, roll: 0 };
  private readonly lastPose: VehicleViewPose;

  constructor(scene: Scene, kind: DrivableVehicleKind) {
    this.scene = scene;
    this.kind = kind;
    this.definition = VEHICLES[kind];
    this.root = new TransformNode(`vehicle-${kind}`, scene);
    this.tilt = new TransformNode(`vehicle-${kind}-tilt`, scene);
    this.tilt.parent = this.root;
    this.material = createGlbMaterial(scene, `vehicle-${kind}-paint`, null);
    this.fallbackMaterial = createGlbMaterial(scene, `vehicle-${kind}-standin`, null, { soft: kind === 'rowboat' });
    this.lastPose = {
      position: { x: 0, y: 0, z: 0 },
      yaw: 0,
      forwardSpeed: 0,
      turretYaw: 0,
      turretPitch: 0,
      steer: 0,
      wreck: false,
      afloat: false,
      damage: 0,
    };
    // The vertex-coloured stand-in shows until the painted model is wanted
    // (see update: near the camera or on screen); far vehicles never load it.
    this.buildFallback();
  }

  /** Loads the painted model once the vehicle is near or on screen. */
  private requestModel(position: Vec3, cameraPosition: Vector3): void {
    if (this.loadRequested) return;
    const distance = Math.hypot(position.x - cameraPosition.x, position.y - cameraPosition.y, position.z - cameraPosition.z);
    const camera = this.scene.activeCamera;
    let onScreen = false;
    if (distance < LAZY_ON_SCREEN_RANGE && camera && this.fallback) {
      this.root.computeWorldMatrix(true);
      this.tilt.computeWorldMatrix(true);
      this.fallback.computeWorldMatrix(true);
      onScreen = camera.isInFrustum(this.fallback);
    }
    if (distance > LAZY_LOAD_RANGE && !onScreen) return;
    this.loadRequested = true;
    void this.load();
  }

  private async load(): Promise<void> {
    const library = paintedModelLibrary(this.scene);
    const loaded = await library.loadWithTextures(this.definition.modelKey);
    if (this.disposed || !loaded) return;
    this.attachModel(loaded.asset.container.instantiateModelsToScene((name) => name, false, {
      doNotInstantiate: true,
      predicate: (entity: unknown) => !(entity instanceof AnimationGroup),
    }), loaded.textures);
  }

  private attachModel(entries: InstantiatedEntries, textures: PaintedTextures): void {
    const gltfRoot = entries.rootNodes[0] as TransformNode | undefined;
    if (!gltfRoot) {
      entries.dispose();
      return;
    }
    this.entries = entries;
    for (const oar of this.rowboat?.oars ?? []) oar.pivot.dispose();
    this.rowboat = null;
    // Swap the vertex-colour stand-in for the painted texture set.
    const painted = createGlbMaterial(this.scene, `vehicle-${this.kind}-painted`, textures);
    this.material.dispose();
    this.material = painted;
    gltfRoot.parent = this.tilt;
    for (const mesh of gltfRoot.getChildMeshes(false)) {
      mesh.material = painted;
      mesh.isPickable = false;
      mesh.alwaysSelectAsActiveMesh = false;
    }
    for (const node of gltfRoot.getChildTransformNodes(false)) {
      const name = node.name;
      if (name === 'ff-turret') this.turret = node;
      else if (name === 'ff-barrel') this.barrel = node;
      else if (name === 'ff-steer') this.steerNode = node;
      else if (name === 'ff-oar-left' || name === 'ff-oar-right') {
        node.rotationQuaternion = null;
        this.paintedOars.push({ pivot: node, side: name.endsWith('left') ? -1 : 1, row: name.endsWith('left') ? 0 : 1 });
      }
      const wheel = /^ff-(?:wheel|front)\d+-r(\d+)$/.exec(name);
      if (wheel?.[1]) this.wheels.push({ node, radius: Math.max(0.05, Number(wheel[1]) / 100) });
    }
    for (const node of [this.turret, this.barrel, this.steerNode, ...this.wheels.map((wheel) => wheel.node)]) {
      if (node) node.rotationQuaternion = null;
    }
    this.fallback?.dispose();
    this.fallback = null;
  }

  /** Box hull + turret stand-in in the vehicle's palette (loading / missing model). */
  private buildFallback(): void {
    if (this.kind === 'rowboat') {
      this.rowboat = buildRowboat(this.scene, this.fallbackMaterial, this.tilt);
      this.fallback = this.rowboat.hull;
      return;
    }
    const parts = new PartList(this.scene);
    const half = this.definition.halfExtents;
    const palette: Record<DrivableVehicleKind, [string, string]> = {
      fondue_crawler: ['#d8282e', '#ffd23f'],
      coconut_tank: ['#5a6b2c', '#7a5230'],
      badi_flamingo: ['#ff6fb5', '#f4e8f0'],
      sidecar: ['#c8702a', '#b9c2c8'],
      rowboat: ['#885b32', '#c79255'],
    };
    const [main, accent] = palette[this.kind];
    if (this.definition.chassis === 'boat') {
      parts.torus(main, half.x * 1.7, half.y * 1.6, 0, half.y, 0, { segments: 20 });
    } else {
      parts.box(main, half.x * 2, half.y * 1.5, half.z * 2, 0, half.y * 0.75, 0);
    }
    const weapon = this.definition.weapon;
    if (weapon) {
      const pivot = weapon.turretPivot;
      parts.sphere(accent, 1.2, pivot.x, pivot.y + 0.4, pivot.z);
    }
    this.fallback = parts.merge(`vehicle-${this.kind}-standin`, this.fallbackMaterial);
    if (this.fallback) {
      this.fallback.parent = this.tilt;
      this.fallback.isPickable = false;
    }
  }

  get loaded(): boolean {
    return this.kind === 'rowboat' || this.entries !== null;
  }

  /**
   * Places the vehicle. `ground` samples the support under the hull corners
   * so tracks and wheels follow slopes; boats bob on the swell instead.
   */
  update(deltaSeconds: number, pose: VehicleViewPose, ground: VehicleGroundProbe | null, cameraPosition: Vector3): void {
    if (this.disposed) return;
    const dt = Math.min(0.1, Math.max(0, deltaSeconds));
    this.time += dt;
    Object.assign(this.lastPose, pose);
    this.root.position.set(pose.position.x, pose.position.y, pose.position.z);
    this.root.rotation.set(0, pose.yaw, 0);
    // After placing the root, so the on-screen test sees the hull where it is.
    this.requestModel(pose.position, cameraPosition);

    let targetPitch = 0;
    let targetRoll = 0;
    let lift = 0;
    const half = this.definition.halfExtents;
    if (this.definition.chassis === 'boat') {
      const speed = Math.abs(pose.forwardSpeed);
      targetPitch = -Math.min(0.12, speed * 0.006) + Math.sin(this.time * 1.7) * 0.025;
      targetRoll = Math.sin(this.time * 1.3 + 0.7) * 0.035;
      lift = pose.afloat ? Math.sin(this.time * 2.1) * 0.06 : 0;
    } else if (ground && !pose.wreck && Math.abs(pose.position.x - this.probe.x) < 0.01 && Math.abs(pose.position.z - this.probe.z) < 0.01 && Math.abs(pose.yaw - this.probe.yaw) < 0.001) {
      targetPitch = this.probe.pitch;
      targetRoll = this.probe.roll;
    } else if (ground && !pose.wreck) {
      const sample = (lx: number, lz: number): number | null => {
        const point = vehicleLocalToWorld(pose.position, pose.yaw, { x: lx, y: 0, z: lz });
        return ground(point.x, point.z, pose.position.y + 1.2);
      };
      const front = sample(0, half.z * 0.8);
      const back = sample(0, -half.z * 0.8);
      const left = sample(-half.x * 0.8, 0);
      const right = sample(half.x * 0.8, 0);
      if (front !== null && back !== null) targetPitch = -Math.atan2(front - back, half.z * 1.6);
      // Babylon roll (+Z) lifts the right side.
      if (left !== null && right !== null) targetRoll = Math.atan2(right - left, half.x * 1.6);
      targetPitch = Math.max(-0.6, Math.min(0.6, targetPitch));
      targetRoll = Math.max(-0.45, Math.min(0.45, targetRoll));
      Object.assign(this.probe, { x: pose.position.x, z: pose.position.z, yaw: pose.yaw, pitch: targetPitch, roll: targetRoll });
    }
    const alpha = 1 - Math.exp(-dt * TILT_RESPONSE);
    this.pitch += (targetPitch - this.pitch) * alpha;
    this.roll += (targetRoll - this.roll) * alpha;

    if (pose.wreck && this.kind === 'badi_flamingo') {
      // 0 HP balloon: the flamingo zooms off in a wild zigzag and shrinks away.
      this.balloon += dt;
      const t = this.balloon;
      this.tilt.position.set(Math.sin(t * 7.3) * 2.2 * t, t * t * 2.6 + t * 3, Math.cos(t * 5.1) * 1.6 * t);
      this.tilt.rotation.set(Math.sin(t * 9) * 0.6, t * 6.5, Math.cos(t * 8) * 0.5);
      this.tilt.scaling.setAll(Math.max(0.05, 1 - t * 0.22));
    } else {
      if (!pose.wreck || this.kind !== 'rowboat') this.balloon = 0;
      this.tilt.position.set(0, lift, 0);
      this.tilt.rotation.set(this.pitch, 0, this.roll);
      this.tilt.scaling.setAll(1);
      if (pose.wreck && this.kind === 'rowboat') {
        this.balloon += dt;
        this.tilt.position.y -= this.balloon * 0.25;
        this.tilt.rotation.z += Math.min(0.6, this.balloon * 0.18);
      }
    }
    for (const oar of this.paintedOars.length ? this.paintedOars : this.rowboat?.oars ?? []) {
      const rowing = !pose.wreck && Math.abs(pose.forwardSpeed) > 0.2 && (pose.seats?.[oar.row] ?? 1) !== 0;
      const stroke = this.time * Math.PI * 2 / 0.8;
      oar.pivot.rotation.y = rowing ? Math.sin(stroke) * oar.side * 0.45 : oar.side * 0.45;
      oar.pivot.rotation.z = rowing ? Math.cos(stroke) * oar.side * 0.14 : oar.side * 0.08;
    }

    // Parts (the glTF root mirrors X: yaws are negated, pitches keep their sign).
    if (this.turret) this.turret.rotation.set(0, -pose.turretYaw, 0);
    if (this.barrel) this.barrel.rotation.set(-pose.turretPitch, 0, 0);
    if (this.steerNode) this.steerNode.rotation.set(0, -pose.steer * 0.8, 0);
    if (!pose.wreck) this.wheelAngle += (pose.forwardSpeed * dt);
    for (const wheel of this.wheels) wheel.node.rotation.set(this.wheelAngle / wheel.radius, 0, 0);

    const charred = pose.wreck ? 1 : 0;
    if (this.entries) {
      updateGlbMaterial(this.material, cameraPosition, this.time, {
        battleDamage: Math.min(1, pose.damage * 1.1),
        charred,
        frozen: 0,
      });
    }
    if (this.fallback) updateGlbMaterial(this.fallbackMaterial, cameraPosition, this.time, { battleDamage: pose.damage, charred, frozen: 0 });
  }

  /** World position of a seat anchor including the visual tilt. */
  seatWorld(seatIndex: number): Vec3 | null {
    const seat = this.definition.seats[seatIndex];
    if (!seat) return null;
    return this.localToWorld(seat.anchor);
  }

  /** Any local point (vehicle space) in world space including the tilt. */
  localToWorld(local: Vec3): Vec3 {
    this.root.computeWorldMatrix(true);
    this.tilt.computeWorldMatrix(true);
    const world = Vector3.TransformCoordinates(new Vector3(local.x, local.y, local.z), this.tilt.getWorldMatrix());
    return { x: world.x, y: world.y, z: world.z };
  }

  /** Muzzle of the vehicle weapon (visual), for shot FX. */
  muzzleWorld(): Vec3 | null {
    const weapon = this.definition.weapon;
    if (!weapon) return null;
    const pose = this.lastPose;
    const aim = pose.turretYaw;
    const pivot = weapon.turretPivot;
    const cosYaw = Math.cos(aim);
    const sinYaw = Math.sin(aim);
    const rotate = (x: number, z: number): { x: number; z: number } => ({ x: x * cosYaw + z * sinYaw, z: -x * sinYaw + z * cosYaw });
    const barrel = rotate(weapon.barrelPivot.x, weapon.barrelPivot.z);
    const cosPitch = Math.cos(pose.turretPitch);
    const sinPitch = Math.sin(pose.turretPitch);
    const muzzleY = weapon.muzzle.z * sinPitch + weapon.muzzle.y * cosPitch;
    const muzzleZ = weapon.muzzle.z * cosPitch - weapon.muzzle.y * sinPitch;
    const tip = rotate(weapon.muzzle.x, muzzleZ);
    return this.localToWorld({
      x: pivot.x + barrel.x + tip.x,
      y: pivot.y + weapon.barrelPivot.y + muzzleY,
      z: pivot.z + barrel.z + tip.z,
    });
  }

  setEnabled(enabled: boolean): void {
    this.root.setEnabled(enabled);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.entries?.dispose();
    this.fallback?.dispose();
    this.material.dispose();
    this.fallbackMaterial.dispose();
    this.tilt.dispose();
    this.root.dispose();
  }
}
