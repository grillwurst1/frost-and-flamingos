import { Color4, Vector3 } from '@babylonjs/core/Maths/math';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { Scene } from '@babylonjs/core/scene';

/** Authored surfaces, built once per outfit. UV.x stores local cavity shading,
 * independently of the selected skin/hair colour; no texture or screen pass. */
function surface(scene: Scene, name: string, positions: number[], indices: number[], color: Color4,
  cavity: number[] = [], reverseWinding = true): Mesh {
  // Babylon's default front face uses the opposite winding to the RH surface
  // construction above (the same convention as GeometryBatch.triangle).
  for (let i = 0; reverseWinding && i < indices.length; i += 3) {
    const b = indices[i + 1]!; indices[i + 1] = indices[i + 2]!; indices[i + 2] = b;
  }
  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);
  const data = new VertexData();
  data.positions = positions; data.normals = normals; data.indices = indices;
  data.colors = Array.from({ length: positions.length / 3 }, () => [color.r, color.g, color.b, 0]).flat();
  data.uvs = Array.from({ length: positions.length / 3 }, (_, i) => [cavity[i] ?? 0, 0]).flat();
  const mesh = new Mesh(name, scene); data.applyToMesh(mesh, false); mesh.isPickable = false;
  return mesh;
}

/** A fitted leather/cloth ribbon with bevelled edges, following the garment
 * rather than floating as a straight board across a curved chest/back. */
export function tailoredStrip(scene: Scene, name: string, path: readonly Vector3[], width: number,
  thickness: number, color: Color4): Mesh {
  const positions: number[] = [], indices: number[] = [], cavity: number[] = [];
  const section = [[-.5, -.25], [-.43, -.5], [.43, -.5], [.5, -.25], [.5, .25], [.43, .5], [-.43, .5], [-.5, .25]] as const;
  for (let row = 0; row < path.length; row++) {
    const p = path[row]!;
    const tangent = path[Math.min(row + 1, path.length - 1)]!.subtract(path[Math.max(0, row - 1)]!).normalize();
    const normal = new Vector3(p.x * .3, 0, p.z < 0 ? -1 : 1);
    const across = Vector3.Cross(tangent, normal).normalize();
    const out = Vector3.Cross(across, tangent).normalize();
    for (const [x, z] of section) {
      const at = p.add(across.scale(x * width)).add(out.scale(z * thickness));
      positions.push(at.x, at.y, at.z); cavity.push(z < 0 ? .12 : .025);
    }
    if (row) for (let j = 0; j < 8; j++) {
      const a = (row - 1) * 8 + j, b = (row - 1) * 8 + (j + 1) % 8, c = row * 8 + (j + 1) % 8, d = row * 8 + j;
      indices.push(a, b, c, a, c, d);
    }
  }
  for (let j = 1; j < 7; j++) {
    indices.push(0, j + 1, j);
    const last = (path.length - 1) * 8; indices.push(last, last + j, last + j + 1);
  }
  return surface(scene, name, positions, indices, color, cavity, false);
}

/** One shaped beard wraps around the jaw, with broad carved locks. Its upper
 * edge follows cheeks/sideburns and its pointed chin replaces intersecting balls. */
export function sculptedBeard(scene: Scene, headY: number, color: Color4): Mesh {
  const positions: number[] = [], indices: number[] = [], cavity: number[] = [];
  const rows = 14, segments = 40;
  for (let row = 0; row <= rows; row++) {
    const t = row / rows;
    for (let col = 0; col <= segments; col++) {
      const angle = -1.85 + col / segments * 3.7;
      const side = Math.abs(Math.sin(angle));
      const upper = -.085 + side ** 2 * .095;
      const lower = -.272 + side ** 1.5 * .09;
      const y = lower + (upper - lower) * t;
      const radius = .055 + .143 * Math.sin(t * Math.PI / 2);
      const groove = (.5 + .5 * Math.cos(angle * 19 + t * .8)) * .006 * Math.sin(Math.PI * t);
      const front = Math.max(0, Math.cos(angle));
      positions.push(Math.sin(angle) * (radius + groove), headY + y,
        Math.cos(angle) * (radius * .94 + groove) + front * .036);
      cavity.push(.04 + .16 * (1 - t) + .07 * (1 - Math.cos(angle * 19)) * Math.sin(Math.PI * t));
      if (row && col) {
        const a = (row - 1) * (segments + 1) + col - 1, b = a + 1, c = row * (segments + 1) + col, d = c - 1;
        indices.push(a, b, c, a, c, d);
      }
    }
  }
  return surface(scene, 'sculpted-jaw-beard', positions, indices, color, cavity);
}
