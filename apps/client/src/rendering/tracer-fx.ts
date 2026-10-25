import { Color3, Quaternion, Vector3 } from '@babylonjs/core/Maths/math';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import { WEAPON_STATS, type Vec3, type WeaponId } from '@frost-and-flamingos/shared';

/**
 * Comic bullet tracers for hitscan weapons: a thin, bright streak from the
 * muzzle to the first piece of world geometry along the shot (or the weapon's
 * range), gone after a tenth of a second. Purely cosmetic: streaks ignore
 * bodies (the server decides every hit), so a burst fired through the
 * untouchable drifter visibly passes straight through her.
 */

const MAX_TRACERS = 24;
const LIFE = 0.11;
const THICKNESS = 0.035;
const MAX_LENGTH = 160;
/** Shotguns show a few of their pellets, not all eight. */
const PELLET_STREAKS = 3;
const UP = new Vector3(0, 1, 0);

interface Tracer {
  mesh: Mesh;
  age: number;
  active: boolean;
}

export type WorldRay = (origin: Vec3, direction: Vec3, maxDistance: number) => number | null;

export class TracerFx {
  private readonly material: StandardMaterial;
  private readonly tracers: Tracer[] = [];
  private disposed = false;

  constructor(
    scene: Scene,
    private readonly ray: WorldRay,
  ) {
    const material = new StandardMaterial('tracer-material', scene);
    const colour = Color3.FromHexString('#fff1b0');
    material.diffuseColor = colour;
    material.emissiveColor = colour;
    material.disableLighting = true;
    material.specularColor = Color3.Black();
    material.alpha = 0.92;
    this.material = material;
    for (let index = 0; index < MAX_TRACERS; index += 1) {
      const mesh = CreateCylinder(`tracer-${index}`, { height: 1, diameter: 1, tessellation: 6 }, scene);
      mesh.material = material;
      mesh.isPickable = false;
      mesh.rotationQuaternion = Quaternion.Identity();
      mesh.setEnabled(false);
      this.tracers.push({ mesh, age: 0, active: false });
    }
  }

  /** One shot from an eye position along yaw/pitch (hitscan and pellet weapons only). */
  shot(weaponId: WeaponId, eye: Vec3, yaw: number, pitch: number): void {
    if (this.disposed) return;
    const stats = WEAPON_STATS[weaponId];
    if (stats.fireMode !== 'hitscan') return;
    const cosPitch = Math.cos(pitch);
    const forward = new Vector3(Math.sin(yaw) * cosPitch, Math.sin(pitch), Math.cos(yaw) * cosPitch);
    const right = new Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const muzzle = new Vector3(eye.x, eye.y, eye.z)
      .addInPlace(forward.scale(0.7))
      .addInPlace(right.scale(0.22))
      .addInPlace(UP.scale(-0.14));
    const range = Math.min(MAX_LENGTH, stats.range);
    const streaks = stats.pellets > 1 ? Math.min(PELLET_STREAKS, stats.pellets) : 1;
    for (let streak = 0; streak < streaks; streak += 1) {
      const direction = forward.clone();
      if (stats.spread > 0) {
        const angle = Math.random() * Math.PI * 2;
        const amount = Math.sqrt(Math.random()) * stats.spread;
        const up = Vector3.Cross(forward, right).normalize();
        direction.addInPlace(right.scale(Math.cos(angle) * amount)).addInPlace(up.scale(Math.sin(angle) * amount));
        direction.normalize();
      }
      // From the eye, so the streak ends where the shot really meets the world.
      const hit = this.ray(eye, { x: direction.x, y: direction.y, z: direction.z }, range);
      const end = new Vector3(eye.x, eye.y, eye.z).addInPlace(direction.scale(hit ?? range));
      this.spawn(muzzle, end);
    }
  }

  private spawn(from: Vector3, to: Vector3): void {
    const length = Vector3.Distance(from, to);
    if (length < 0.5) return;
    let tracer = this.tracers.find((candidate) => !candidate.active);
    if (!tracer) tracer = this.tracers.reduce((oldest, candidate) => (candidate.age > oldest.age ? candidate : oldest));
    const direction = to.subtract(from).scaleInPlace(1 / length);
    const mesh = tracer.mesh;
    mesh.position.copyFrom(from.add(to).scaleInPlace(0.5));
    mesh.scaling.set(THICKNESS, length, THICKNESS);
    const axis = Vector3.Cross(UP, direction);
    const angle = Math.acos(Math.max(-1, Math.min(1, Vector3.Dot(UP, direction))));
    if (axis.lengthSquared() < 1e-8) mesh.rotationQuaternion?.copyFrom(Quaternion.Identity());
    else mesh.rotationQuaternion?.copyFrom(Quaternion.RotationAxis(axis.normalize(), angle));
    mesh.visibility = 1;
    mesh.setEnabled(true);
    tracer.age = 0;
    tracer.active = true;
  }

  update(delta: number): void {
    if (this.disposed) return;
    for (const tracer of this.tracers) {
      if (!tracer.active) continue;
      tracer.age += delta;
      if (tracer.age >= LIFE) {
        tracer.active = false;
        tracer.mesh.setEnabled(false);
        continue;
      }
      tracer.mesh.visibility = 1 - (tracer.age / LIFE) ** 2;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const tracer of this.tracers) tracer.mesh.dispose();
    this.material.dispose();
  }
}
