import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { Color4, Quaternion, Vector3 } from '@babylonjs/core/Maths/math';
import { CreateCapsule } from '@babylonjs/core/Meshes/Builders/capsuleBuilder';
import { CreateLathe } from '@babylonjs/core/Meshes/Builders/latheBuilder';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder';
import { CreateTube } from '@babylonjs/core/Meshes/Builders/tubeBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import type { Scene } from '@babylonjs/core/scene';
import { hexToColor4 } from './materials';

/**
 * Organic procedural modelling helpers for the mascots: smooth deformed
 * blobs, oriented capsules, tubes and lathes, painted with per-vertex colour
 * functions and merged per animated bone. Every part is baked into its bone's
 * local space before painting, so colour functions see bone-space positions.
 *
 * Colours are written with alpha 0, which the character shader reads as
 * "not skin" (paint is used as is).
 */

export type Paint = Color4 | ((position: Vector3, normal: Vector3) => Color4);

export interface Placement {
  at?: Vector3;
  /** Euler rotation in radians (x, y, z). */
  rotation?: Vector3;
  scale?: Vector3;
}

/** Hex colour as a paint value (alpha 0 = no skin tint). */
export function ink(hex: string): Color4 {
  const color = hexToColor4(hex);
  return new Color4(color.r, color.g, color.b, 0);
}

export function mixColor(a: Color4, b: Color4, t: number): Color4 {
  const k = Math.min(1, Math.max(0, t));
  return new Color4(a.r + (b.r - a.r) * k, a.g + (b.g - a.g) * k, a.b + (b.b - a.b) * k, 0);
}

export function shade(color: Color4, factor: number): Color4 {
  return new Color4(
    Math.min(1, color.r * factor),
    Math.min(1, color.g * factor),
    Math.min(1, color.b * factor),
    0,
  );
}

// --- deterministic value noise ------------------------------------------------

function hash3(x: number, y: number, z: number): number {
  let h = x * 374761393 + y * 668265263 + z * 2147483647;
  h = (h ^ (h >>> 13)) * 1274126177;
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Smooth 3D value noise in 0…1. */
export function noise3(x: number, y: number, z: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = smooth(x - ix);
  const fy = smooth(y - iy);
  const fz = smooth(z - iz);
  let result = 0;
  for (let dz = 0; dz <= 1; dz += 1) {
    for (let dy = 0; dy <= 1; dy += 1) {
      for (let dx = 0; dx <= 1; dx += 1) {
        const weight = (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy) * (dz ? fz : 1 - fz);
        result += hash3(ix + dx, iy + dy, iz + dz) * weight;
      }
    }
  }
  return result;
}

/** Two-octave fractal noise in 0…1. */
export function fbm3(x: number, y: number, z: number): number {
  return noise3(x, y, z) * 0.66 + noise3(x * 2.3 + 17, y * 2.3 + 5, z * 2.3 + 11) * 0.34;
}

/** Small seeded random generator for scattering details. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- mesh helpers ---------------------------------------------------------------

/**
 * Recomputes normals and welds them across duplicated seam vertices so
 * deformed shapes shade without visible seams.
 */
export function smoothNormals(mesh: Mesh): void {
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
  const indices = mesh.getIndices();
  if (!positions || !indices) return;
  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);
  const groups = new Map<string, number[]>();
  for (let index = 0; index < positions.length / 3; index += 1) {
    const key = `${Math.round((positions[index * 3] ?? 0) * 2000)}|${Math.round(
      (positions[index * 3 + 1] ?? 0) * 2000,
    )}|${Math.round((positions[index * 3 + 2] ?? 0) * 2000)}`;
    const group = groups.get(key);
    if (group) group.push(index);
    else groups.set(key, [index]);
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    let nx = 0;
    let ny = 0;
    let nz = 0;
    for (const index of group) {
      nx += normals[index * 3] ?? 0;
      ny += normals[index * 3 + 1] ?? 0;
      nz += normals[index * 3 + 2] ?? 0;
    }
    const length = Math.hypot(nx, ny, nz) || 1;
    for (const index of group) {
      normals[index * 3] = nx / length;
      normals[index * 3 + 1] = ny / length;
      normals[index * 3 + 2] = nz / length;
    }
  }
  mesh.setVerticesData(VertexBuffer.NormalKind, normals, false);
}

function place(mesh: Mesh, placement: Placement): void {
  if (placement.scale) mesh.scaling.copyFrom(placement.scale);
  if (placement.rotation) {
    mesh.rotation.set(placement.rotation.x, placement.rotation.y, placement.rotation.z);
  }
  if (placement.at) mesh.position.copyFrom(placement.at);
  mesh.bakeCurrentTransformIntoVertices();
}

/** Writes per-vertex colours from a paint value (evaluated in baked space). */
export function paintVertices(mesh: Mesh, paint: Paint): Mesh {
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
  const normals = mesh.getVerticesData(VertexBuffer.NormalKind);
  if (!positions) return mesh;
  const count = positions.length / 3;
  const colors = new Float32Array(count * 4);
  const point = new Vector3();
  const normal = new Vector3();
  for (let index = 0; index < count; index += 1) {
    let color: Color4;
    if (paint instanceof Color4) {
      color = paint;
    } else {
      point.set(positions[index * 3] ?? 0, positions[index * 3 + 1] ?? 0, positions[index * 3 + 2] ?? 0);
      normal.set(normals?.[index * 3] ?? 0, normals?.[index * 3 + 1] ?? 1, normals?.[index * 3 + 2] ?? 0);
      color = paint(point, normal);
    }
    colors[index * 4] = color.r;
    colors[index * 4 + 1] = color.g;
    colors[index * 4 + 2] = color.b;
    colors[index * 4 + 3] = 0;
  }
  mesh.setVerticesData(VertexBuffer.ColorKind, colors, false, 4);
  mesh.isPickable = false;
  return mesh;
}

/**
 * Collects the parts of one bone and merges them into a single mesh. Each
 * bone is one draw call, so a whole mascot stays around 15–20 draw calls.
 */
export class PartBin {
  readonly parts: Mesh[] = [];

  constructor(
    private readonly scene: Scene,
    private readonly name: string,
  ) {}

  push(mesh: Mesh, paint: Paint): Mesh {
    paintVertices(mesh, paint);
    this.parts.push(mesh);
    return mesh;
  }

  /**
   * Ellipsoid blob. `deform` receives the unit-sphere direction (already
   * scaled by the radii) and may move it freely; normals are rebuilt.
   */
  blob(
    radii: Vector3,
    paint: Paint,
    placement: Placement = {},
    segments = 18,
    deform?: (point: Vector3, unit: Vector3) => void,
  ): Mesh {
    const mesh = CreateSphere(`${this.name}-blob`, { diameter: 2, segments }, this.scene);
    const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
    if (positions) {
      const unit = new Vector3();
      const point = new Vector3();
      for (let index = 0; index < positions.length / 3; index += 1) {
        unit.set(positions[index * 3] ?? 0, positions[index * 3 + 1] ?? 0, positions[index * 3 + 2] ?? 0);
        point.set(unit.x * radii.x, unit.y * radii.y, unit.z * radii.z);
        deform?.(point, unit);
        positions[index * 3] = point.x;
        positions[index * 3 + 1] = point.y;
        positions[index * 3 + 2] = point.z;
      }
      mesh.setVerticesData(VertexBuffer.PositionKind, positions, false);
    }
    smoothNormals(mesh);
    place(mesh, placement);
    return this.push(mesh, paint);
  }

  /** Capsule from `from` to `to`, optionally tapering. */
  capsule(from: Vector3, to: Vector3, radius: number, paint: Paint, radiusTop = radius, tessellation = 14): Mesh {
    const direction = to.subtract(from);
    const length = Math.max(0.001, direction.length());
    const mesh = CreateCapsule(
      `${this.name}-capsule`,
      {
        height: length + radius + radiusTop,
        radius,
        radiusBottom: radius,
        radiusTop,
        tessellation,
        subdivisions: 2,
        capSubdivisions: 6,
      },
      this.scene,
    );
    const rotation = new Quaternion();
    Quaternion.FromUnitVectorsToRef(Vector3.Up(), direction.scale(1 / length), rotation);
    mesh.rotationQuaternion = rotation;
    mesh.position.copyFrom(from.add(to).scale(0.5));
    mesh.bakeCurrentTransformIntoVertices();
    return this.push(mesh, paint);
  }

  tube(
    path: Vector3[],
    radius: (t: number) => number,
    paint: Paint,
    tessellation = 10,
    cap = Mesh.CAP_ALL,
  ): Mesh {
    const segments = Math.max(1, path.length - 1);
    const mesh = CreateTube(
      `${this.name}-tube`,
      { path, radiusFunction: (index) => radius(index / segments), tessellation, cap },
      this.scene,
    );
    smoothNormals(mesh);
    return this.push(mesh, paint);
  }

  /** Surface of revolution around +Y from a (radius, height) profile. */
  lathe(profile: Array<[number, number]>, paint: Paint, placement: Placement = {}, tessellation = 20): Mesh {
    const mesh = CreateLathe(
      `${this.name}-lathe`,
      {
        shape: profile.map(([r, y]) => new Vector3(r, y, 0)),
        tessellation,
        sideOrientation: Mesh.DOUBLESIDE,
      },
      this.scene,
    );
    place(mesh, placement);
    return this.push(mesh, paint);
  }

  torus(diameter: number, thickness: number, paint: Paint, placement: Placement = {}, tessellation = 28): Mesh {
    const mesh = CreateTorus(`${this.name}-torus`, { diameter, thickness, tessellation }, this.scene);
    place(mesh, placement);
    return this.push(mesh, paint);
  }

  /** Merges the bin into one mesh parented to `parent`. Returns null when empty. */
  merge(material: ShaderMaterial, parent: TransformNode): Mesh | null {
    if (this.parts.length === 0) return null;
    const merged =
      this.parts.length === 1
        ? (this.parts[0] ?? null)
        : Mesh.MergeMeshes(this.parts, true, true, undefined, false, false);
    if (!merged) return null;
    merged.name = this.name;
    merged.material = material;
    merged.isPickable = false;
    merged.parent = parent;
    merged.position.set(0, 0, 0);
    this.parts.length = 0;
    return merged;
  }
}

/** Flat 5-point star (for dizzy stars and HUD-like world decals). */
export function createStarMesh(scene: Scene, name: string, outer: number, inner: number, depth: number): Mesh {
  const positions: number[] = [];
  const indices: number[] = [];
  const points: Array<[number, number]> = [];
  for (let index = 0; index < 10; index += 1) {
    const angle = (index / 10) * Math.PI * 2 + Math.PI / 2;
    const radius = index % 2 === 0 ? outer : inner;
    points.push([Math.cos(angle) * radius, Math.sin(angle) * radius]);
  }
  // Front and back fans.
  for (const side of [1, -1]) {
    const centre = positions.length / 3;
    positions.push(0, 0, (side * depth) / 2);
    for (const [x, y] of points) positions.push(x, y, (side * depth * 0.2) / 2);
    for (let index = 0; index < 10; index += 1) {
      const a = centre + 1 + index;
      const b = centre + 1 + ((index + 1) % 10);
      if (side > 0) indices.push(centre, b, a);
      else indices.push(centre, a, b);
    }
  }
  const data = new VertexData();
  data.positions = positions;
  data.indices = indices;
  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);
  data.normals = normals;
  const mesh = new Mesh(name, scene);
  data.applyToMesh(mesh);
  mesh.isPickable = false;
  return mesh;
}
