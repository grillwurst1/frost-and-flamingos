import { Color3, Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import '@babylonjs/core/Meshes/thinInstanceMesh';
import type { Scene } from '@babylonjs/core/scene';
import type { Vec3 } from '@frost-and-flamingos/shared';
import { excludeFromShadows } from './materials';
import type { GroundProbe } from './mascot-fx';

/**
 * Feather bursts for bagged critters: chunky cartoon feathers (one
 * thin-instanced mesh, one draw call for all of them) that blast out, then
 * flutter and rock down like leaves and settle on the ground before they
 * shrink away. Opaque and depth-writing, so the global ink outline draws
 * around every feather.
 */

const MAX_FEATHERS = 72;
const FEATHERS_PER_BURST = 22;
/** Fluttering fall: weak gravity and a low terminal speed. */
const FEATHER_GRAVITY = 7;
const FEATHER_FALL_SPEED = 0.62;
const FEATHER_DRAG = 2.6;

interface Feather {
  position: Vector3;
  velocity: Vector3;
  /** Flutter phase and frequency (sideways sway + rocking). */
  phase: number;
  frequency: number;
  sway: number;
  yaw: number;
  spin: number;
  tilt: number;
  size: number;
  age: number;
  life: number;
  ground: number;
  landed: boolean;
}

/** One curved feather (vane + quill) along +Z, about 1 unit long, vertex coloured. */
function buildFeatherGeometry(): VertexData {
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const segments = 7;
  const vane = [0.92, 0.98, 1]; // white vane
  const base = [0.93, 0.88, 0.78]; // creamy down at the root
  const quill = [0.78, 0.74, 0.66];
  // Rows from the root (t = 0) to the tip (t = 1): left edge, quill, right edge.
  for (let row = 0; row <= segments; row += 1) {
    const t = row / segments;
    const width = Math.sin(Math.PI * Math.min(1, t * 1.08)) * 0.2 * (1 - t * 0.35) + 0.015;
    const z = t - 0.5;
    // Gentle curl: the tip lifts, the vane cups slightly.
    const lift = t * t * 0.12;
    const cup = 0.035;
    const blend = Math.min(1, t * 2.6);
    const edge = base.map((value, index) => value + ((vane[index] ?? 1) - value) * blend);
    positions.push(-width, lift + cup, z, 0, lift, z, width, lift + cup, z);
    colors.push(...edge, 1, ...quill, 1, ...edge, 1);
  }
  for (let row = 0; row < segments; row += 1) {
    const a = row * 3;
    const b = (row + 1) * 3;
    indices.push(a, b, a + 1, a + 1, b, b + 1, a + 1, b + 1, a + 2, a + 2, b + 1, b + 2);
  }
  // Quill stub poking out of the root.
  const stub = positions.length / 3;
  positions.push(-0.012, 0, -0.62, 0.012, 0, -0.62, 0, 0.012, -0.5);
  colors.push(...quill, 1, ...quill, 1, ...quill, 1);
  indices.push(stub, stub + 1, stub + 2);
  const data = new VertexData();
  data.positions = positions;
  data.indices = indices;
  data.colors = colors;
  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);
  data.normals = normals;
  return data;
}

export class CritterFx {
  private readonly mesh: Mesh;
  private readonly material: StandardMaterial;
  private readonly groundProbe: GroundProbe;
  private readonly feathers: Feather[] = [];
  private readonly matrices = new Float32Array(MAX_FEATHERS * 16);
  private readonly scratch = Matrix.Identity();
  private readonly scale = new Vector3();
  private readonly rotation = Quaternion.Identity();
  private disposed = false;

  constructor(scene: Scene, groundProbe: GroundProbe) {
    this.groundProbe = groundProbe;
    this.mesh = new Mesh('critter-feathers', scene);
    buildFeatherGeometry().applyToMesh(this.mesh);
    this.material = new StandardMaterial('critter-feather-material', scene);
    this.material.diffuseColor = new Color3(0.86, 0.86, 0.86);
    // Mostly self-lit so the feathers stay bright white from any side, like the puffs.
    this.material.emissiveColor = new Color3(0.5, 0.5, 0.5);
    this.material.specularColor = Color3.Black();
    this.material.backFaceCulling = false;
    this.mesh.material = this.material;
    this.mesh.isPickable = false;
    this.mesh.thinInstanceSetBuffer('matrix', this.matrices, 16, false);
    this.mesh.thinInstanceCount = 0;
    this.mesh.alwaysSelectAsActiveMesh = true;
    this.mesh.setEnabled(false);
    excludeFromShadows(this.mesh);
  }

  /** Feathers fly from a bagged critter's body (feet position). */
  featherBurst(position: Vec3, count = FEATHERS_PER_BURST): void {
    if (this.disposed) return;
    const ground = this.groundProbe(position.x, position.z, position.y + 1);
    for (let index = 0; index < count; index += 1) {
      if (this.feathers.length >= MAX_FEATHERS) this.feathers.shift();
      const angle = (index / count) * Math.PI * 2 + Math.random() * 0.6;
      const outward = 1.1 + Math.random() * 2.4;
      this.feathers.push({
        position: new Vector3(
          position.x + Math.sin(angle) * 0.08,
          position.y + 0.2 + Math.random() * 0.15,
          position.z + Math.cos(angle) * 0.08,
        ),
        velocity: new Vector3(Math.sin(angle) * outward, 1.6 + Math.random() * 2.6, Math.cos(angle) * outward),
        phase: Math.random() * Math.PI * 2,
        frequency: 3.2 + Math.random() * 2.4,
        sway: 0.25 + Math.random() * 0.3,
        yaw: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 7,
        tilt: (Math.random() - 0.5) * 1.6,
        size: 0.075 + Math.random() * 0.06,
        age: 0,
        life: 2.6 + Math.random() * 1.4,
        ground: Math.min(position.y, ground) + 0.012,
        landed: false,
      });
    }
    this.mesh.setEnabled(true);
  }

  update(delta: number): void {
    if (this.disposed || this.feathers.length === 0) return;
    const dt = Math.min(0.05, delta);
    let count = 0;
    for (let index = this.feathers.length - 1; index >= 0; index -= 1) {
      const feather = this.feathers[index];
      if (!feather) continue;
      feather.age += dt;
      if (feather.age >= feather.life) {
        this.feathers.splice(index, 1);
        continue;
      }
      if (!feather.landed) {
        const drag = Math.exp(-FEATHER_DRAG * dt);
        feather.velocity.x *= drag;
        feather.velocity.z *= drag;
        feather.velocity.y = Math.max(-FEATHER_FALL_SPEED, feather.velocity.y * drag - FEATHER_GRAVITY * dt);
        // Leaf-like sway once the burst has spent itself.
        const falling = feather.velocity.y < 0 ? 1 : 0.3;
        const sway = Math.sin(feather.phase + feather.age * feather.frequency) * feather.sway * falling;
        feather.position.x += (feather.velocity.x + Math.cos(feather.yaw) * sway) * dt;
        feather.position.y += feather.velocity.y * dt;
        feather.position.z += (feather.velocity.z - Math.sin(feather.yaw) * sway) * dt;
        feather.yaw += feather.spin * dt * (0.4 + falling * 0.6);
        if (feather.position.y <= feather.ground) {
          feather.position.y = feather.ground;
          feather.landed = true;
        }
      }
    }
    for (const feather of this.feathers) {
      const fade = Math.min(1, (feather.life - feather.age) / 0.45);
      const pop = Math.min(1, feather.age / 0.08);
      const size = feather.size * fade * pop;
      this.scale.set(size, size, size);
      const rock = feather.landed ? 0 : Math.sin(feather.phase + feather.age * feather.frequency) * 0.7;
      Quaternion.RotationYawPitchRollToRef(feather.yaw, feather.landed ? 0 : feather.tilt, rock, this.rotation);
      Matrix.ComposeToRef(this.scale, this.rotation, feather.position, this.scratch);
      this.scratch.copyToArray(this.matrices, count * 16);
      count += 1;
    }
    this.mesh.thinInstanceCount = count;
    this.mesh.thinInstanceBufferUpdated('matrix');
    this.mesh.setEnabled(count > 0);
  }

  /** Feathers still in the air or on the ground (for probes). */
  get activeFeathers(): number {
    return this.feathers.length;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.feathers.length = 0;
    this.mesh.dispose();
    this.material.dispose();
  }
}
