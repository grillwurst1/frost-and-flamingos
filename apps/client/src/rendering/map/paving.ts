import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { Material } from '@babylonjs/core/Materials/material';
import type { Scene } from '@babylonjs/core/scene';
import { FJORD_MAP, PAVILION, colliderHeightAt } from '@frost-and-flamingos/shared';
import { excludeFromInk, excludeFromShadows } from '../materials';
import { paintedPavingHeight, PAVING_SOURCE_MEAN_RGB } from './paving-height';

export const PAVING_LOD_DISTANCE = 42;
export const PAVING_GRID_STEP = 0.125;
export const PAVING_MAX_TRIANGLES = 240000;
const RADIUS = 23.5;
const INNER_RADIUS = PAVILION.basinRadius + 1.2;
const pads = FJORD_MAP.spawns.filter(p => Math.hypot(p.position.x, p.position.z) < 30);

export function pavingContains(x: number, z: number): boolean {
  const radius = Math.hypot(x, z);
  return radius >= INNER_RADIUS && radius <= RADIUS
    && pads.every(p => Math.hypot(p.position.x - x, p.position.z - z) >= 2.3);
}

/** The inked joints of the original paint stay low; each painted face rises. */
export function pavingReliefAt(x: number, z: number): number {
  const radius = Math.hypot(x, z);
  let edge = Math.min(radius - INNER_RADIUS, RADIUS - radius);
  for (const p of pads) edge = Math.min(edge, Math.hypot(p.position.x - x, p.position.z - z) - 2.3);
  const fade = Math.max(0, Math.min(1, edge / 0.4));
  const variation = 0.9 + Math.sin(x * 0.31 + Math.sin(z * 0.23)) * 0.1;
  return 0.038 * paintedPavingHeight(x, z) * variation * fade;
}

/**
 * One terrain-following relief mesh, textured with the unchanged painted tile.
 * Its height data comes from that same tile: no repeating stock stone blocks,
 * extra textures, physics bodies or per-frame stone updates.
 */
export function buildPavingRelief(scene: Scene, material: Material): Mesh[] {
  const positions: number[] = [], colors: number[] = [], indices: number[] = [];
  const vertices = new Map<number, number>();
  const extent = Math.ceil(RADIUS / PAVING_GRID_STEP);
  const width = extent * 2 + 1;
  const vertex = (column: number, row: number): number => {
    const key = (row + extent) * width + column + extent;
    const existing = vertices.get(key);
    if (existing !== undefined) return existing;
    const x = column * PAVING_GRID_STEP, z = row * PAVING_GRID_STEP;
    const index = positions.length / 3;
    positions.push(x, colliderHeightAt(x, z) + 0.005 + pavingReliefAt(x, z), z);
    // Restore the source paint's colour after the shared atlas's per-channel
    // normalisation, with a small daylight lift and broad, subtle weathering.
    const lift = 1.2 + Math.sin(x * 0.17 + Math.sin(z * 0.12)) * 0.025;
    colors.push(PAVING_SOURCE_MEAN_RGB[0] * lift, PAVING_SOURCE_MEAN_RGB[1] * lift, PAVING_SOURCE_MEAN_RGB[2] * lift, 1);
    vertices.set(key, index);
    return index;
  };
  for (let row = -extent; row < extent; row++) for (let column = -extent; column < extent; column++) {
    const x = column * PAVING_GRID_STEP, z = row * PAVING_GRID_STEP, step = PAVING_GRID_STEP;
    if (!pavingContains(x, z) || !pavingContains(x + step, z)
      || !pavingContains(x, z + step) || !pavingContains(x + step, z + step)) continue;
    const a = vertex(column, row), b = vertex(column + 1, row);
    const c = vertex(column + 1, row + 1), d = vertex(column, row + 1);
    indices.push(a, b, d, b, c, d);
  }
  const normals = new Float32Array(positions.length);
  VertexData.ComputeNormals(positions, indices, normals);
  const data = new VertexData();
  data.positions = new Float32Array(positions);
  data.normals = normals;
  data.colors = new Float32Array(colors);
  data.indices = new Uint32Array(indices);
  const mesh = new Mesh('plaza-painted-relief', scene);
  data.applyToMesh(mesh, false);
  mesh.material = material;
  mesh.isPickable = false;
  mesh.receiveShadows = true;
  mesh.freezeWorldMatrix();
  mesh.doNotSyncBoundingInfo = true;
  mesh.addLODLevel(PAVING_LOD_DISTANCE, null);
  excludeFromShadows(mesh); excludeFromInk(mesh);
  return [mesh];
}
