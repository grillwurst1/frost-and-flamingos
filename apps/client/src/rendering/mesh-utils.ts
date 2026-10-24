import { Color4 } from '@babylonjs/core/Maths/math';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import '@babylonjs/core/Meshes/thinInstanceMesh';
import type { Scene } from '@babylonjs/core/scene';
import type { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';

/** Fills the color vertex buffer of a procedural mesh with one flat toon color. */
export function paintMesh(mesh: Mesh, color: Color4): Mesh {
  const vertexCount = mesh.getTotalVertices();
  if (vertexCount === 0) return mesh;
  const colors = new Float32Array(vertexCount * 4);
  for (let index = 0; index < vertexCount; index += 1) {
    colors[index * 4] = color.r;
    colors[index * 4 + 1] = color.g;
    colors[index * 4 + 2] = color.b;
    colors[index * 4 + 3] = color.a;
  }
  mesh.setVerticesData(VertexBuffer.ColorKind, colors, false, 4);
  return mesh;
}

export function paintVertexColors(mesh: Mesh, colors: Float32Array): Mesh {
  mesh.setVerticesData(VertexBuffer.ColorKind, colors, false, 4);
  return mesh;
}

export function mergeParts(
  scene: Scene,
  name: string,
  parts: Mesh[],
  material: ShaderMaterial,
  disposeSources = true,
): Mesh | null {
  if (parts.length === 0) return null;
  for (const part of parts) {
    part.material = material;
    part.isPickable = false;
  }
  if (parts.length === 1) {
    const single = parts[0] ?? null;
    if (single) {
      single.name = name;
      single.material = material;
    }
    return single;
  }
  const merged = Mesh.MergeMeshes(parts, disposeSources, true, undefined, false, false);
  if (!merged) return null;
  merged.name = name;
  merged.material = material;
  merged.isPickable = false;
  return merged;
}

export function enableThinInstances(mesh: Mesh, matrices: Float32Array): Mesh {
  mesh.thinInstanceSetBuffer('matrix', matrices, 16, true);
  mesh.isPickable = false;
  return mesh;
}
