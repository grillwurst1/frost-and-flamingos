import '@babylonjs/core/Meshes/thinInstanceMesh';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math';
import type { Material } from '@babylonjs/core/Materials/material';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import { FJORD_MAP, PAVILION, colliderHeightAt } from '@frost-and-flamingos/shared';
import { excludeFromInk, excludeFromShadows } from '../materials';
import { GeometryBatch, hash3, mix, shade, type V3 } from './geometry';
import { P } from './palette';

export const PAVING_LOD_DISTANCE = 42;
export const PAVING_MAX_INSTANCES = 3600;
export interface PavingStone { x: number; y: number; z: number; yaw: number; scale: number; tone: number }

/** Fixed seed, clear spawn pads and fountain access; no colliders or per-frame updates. */
export function plazaPavingStones(): PavingStone[] {
  const stones: PavingStone[] = [];
  const pads = FJORD_MAP.spawns.filter(p => Math.hypot(p.position.x, p.position.z) < 30);
  for (let row = -35; row <= 35; row++) {
    for (let column = -30; column <= 30; column++) {
      const x = column * 0.82 + (row % 2) * 0.41 + (hash3(column, row, 31) - 0.5) * 0.045;
      const z = row * 0.68 + (hash3(column, row, 32) - 0.5) * 0.035;
      const radius = Math.hypot(x, z);
      if (radius < PAVILION.basinRadius + 1.2 || radius > 23.5) continue;
      if (pads.some(p => Math.hypot(p.position.x - x, p.position.z - z) < 2.3)) continue;
      if (stones.length >= PAVING_MAX_INSTANCES) return stones;
      stones.push({x, y: colliderHeightAt(x, z) + 0.006, z,
        yaw: (hash3(column, row, 33) - 0.5) * 0.14,
        scale: 0.98 + hash3(column, row, 34) * 0.06,
        tone: Math.floor(hash3(column, row, 35) * 4)});
    }
  }
  return stones;
}

/** Bottomless chamfered stone: 22 triangles, shared by every instance of a palette. */
function stoneTemplate(batch: GeometryBatch, tone: number): void {
  const color = shade(mix(P.cobble, P.cobbleWarm, tone / 3), 0.9 + tone * 0.035);
  const shape: readonly (readonly [number, number])[] = [
    [-0.28, -0.32], [0.29, -0.32], [0.39, -0.20], [0.39, 0.21],
    [0.27, 0.32], [-0.28, 0.32], [-0.39, 0.19], [-0.39, -0.20],
  ];
  const top = shape.map(([x, z]): V3 => [x * 0.90, 0.035, z * 0.90]);
  batch.orientedPolygon(top, [0, 1, 0], color, 'rock');
  for (let i = 0; i < shape.length; i++) {
    const a = shape[i]!; const b = shape[(i + 1) % shape.length]!;
    batch.orientedPolygon([[a[0], 0, a[1]], [b[0], 0, b[1]], top[(i + 1) % top.length]!, top[i]!],
      [(a[0] + b[0]) * 0.5, 0.2, (a[1] + b[1]) * 0.5], color, 'rock');
  }
}

/** Four instanced palettes and one mortar bed, tiny shared geometry, distance culled at the plaza. */
export function buildPavingRelief(scene: Scene, material: Material): Mesh[] {
  const stones = plazaPavingStones();
  const meshes: Mesh[] = [];
  for (let tone = 0; tone < 4; tone++) {
    const selected = stones.filter(stone => stone.tone === tone);
    if (!selected.length) continue;
    const batch = new GeometryBatch();
    batch.jitter = 0;
    stoneTemplate(batch, tone);
    const mesh = batch.toMesh(scene, `plaza-paving-relief-${tone}`, material);
    if (!mesh) continue;
    const matrices = new Float32Array(selected.length * 16);
    selected.forEach((stone, index) => Matrix.Compose(new Vector3(stone.scale, stone.scale, stone.scale),
      Quaternion.RotationYawPitchRoll(stone.yaw, 0, 0), new Vector3(stone.x, stone.y, stone.z)).copyToArray(matrices, index * 16));
    mesh.thinInstanceSetBuffer('matrix', matrices, 16, true);
    mesh.thinInstanceRefreshBoundingInfo(true);
    mesh.addLODLevel(PAVING_LOD_DISTANCE, null);
    // Facet normals and bevels provide the small-scale shading. Avoid
    // replaying thousands of tiny stones in the shadow and contour passes.
    excludeFromShadows(mesh);
    excludeFromInk(mesh);
    meshes.push(mesh);
  }
  // A low, terrain-following mortar bed hides the painted stone pattern
  // between the near stones. It disappears with them, revealing the far tile.
  const grout = new GeometryBatch();
  grout.jitter = 0;
  for (let row = -12; row <= 12; row++) for (let column = -12; column <= 12; column++) {
    const x = column * 2; const z = row * 2;
    if (Math.hypot(x, z) > 23.8 || Math.hypot(x, z) < PAVILION.basinRadius + 0.2) continue;
    const corners: V3[] = [[x - 1, 0, z - 1], [x - 1, 0, z + 1], [x + 1, 0, z + 1], [x + 1, 0, z - 1]];
    grout.orientedPolygon(corners.map(([px, , pz]): V3 => [px, colliderHeightAt(px, pz) + 0.009, pz]),
      [0, 1, 0], shade(P.cobbleDark, 0.76), 'plain');
  }
  const bed = grout.toMesh(scene, 'plaza-paving-grout', material);
  if (bed) {
    bed.addLODLevel(PAVING_LOD_DISTANCE, null);
    excludeFromShadows(bed); excludeFromInk(bed); meshes.push(bed);
  }
  return meshes;
}
