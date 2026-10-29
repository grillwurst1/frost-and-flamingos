import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { Scene } from '@babylonjs/core/scene';
import { excludeFromInk, excludeFromShadows } from './materials';

/** Feather an existing contact-shadow draw with vertex alpha, without a texture. */
export function createContactShadow(scene: Scene, name: string, radius: number, sectors = 20): Mesh {
  const positions = [0, 0, 0], normals = [0, 0, -1], colors = [1, 1, 1, 1], indices: number[] = [];
  const rings = [[.25, .80], [.65, .20], [1, 0]] as const;
  for (let row = 0; row < rings.length; row++) {
    const [distance, alpha] = rings[row]!;
    for (let col = 0; col < sectors; col++) {
      const a = col / sectors * Math.PI * 2;
      positions.push(Math.cos(a) * distance * radius, Math.sin(a) * distance * radius, 0);
      normals.push(0, 0, -1); colors.push(1, 1, 1, alpha);
      const next = (col + 1) % sectors, start = 1 + row * sectors;
      if (row === 0) indices.push(0, start + next, start + col);
      else {
        const previous = start - sectors;
        indices.push(previous + col, start + next, start + col, previous + col, previous + next, start + next);
      }
    }
  }
  const mesh = new Mesh(name, scene), data = new VertexData();
  data.positions = positions; data.normals = normals; data.colors = colors; data.indices = indices;
  data.applyToMesh(mesh); mesh.hasVertexAlpha = true; mesh.useVertexColors = true; mesh.isPickable = false;
  excludeFromInk(mesh); excludeFromShadows(mesh);
  return mesh;
}
