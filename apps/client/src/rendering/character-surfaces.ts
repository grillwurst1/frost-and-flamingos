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

/** A continuous sculpted hair volume with a real forehead opening. A full
 * sphere reaches in front of the eyes; the hairline must follow the skull. */
export function sculptedHairCap(scene: Scene, headY: number, color: Color4, style: number): Mesh {
  const positions: number[] = [], indices: number[] = [], cavity: number[] = [];
  const sides = 64, rows = 18, afro = style === 1, quiff = style === 5;
  for (let row = 0; row < rows; row++) {
    const t = row / rows * Math.PI / 2;
    for (let col = 0; col < sides; col++) {
      const angle = col / sides * Math.PI * 2, front = Math.max(0, Math.cos(angle));
      const hairline = -.065 + .22 * front ** 3;
      const crown = afro ? .39 : quiff ? .40 : .30;
      const bulge = afro ? .055 * Math.sin(t * 2) : .012 * Math.sin(t * 2);
      const curl = afro ? .009 * Math.sin(angle * 18 + row * 1.7) * Math.sin(row * 1.8 + angle * 3) : .0035 * Math.sin(angle * 22 + t * 3);
      const rx = (afro ? .300 : .220) + bulge + curl;
      const rz = (.207 + .027 * (1 - front)) + bulge + curl;
      positions.push(Math.sin(angle) * rx * Math.cos(t),
        headY + hairline + (crown - hairline) * Math.sin(t) + (quiff ? .045 * front * Math.sin(2 * t) : 0),
        -.015 + Math.cos(angle) * rz * Math.cos(t));
      cavity.push(afro ? .025 + .08 * Math.max(0, -curl / .009) : .025);
      if (row) {
        const a = (row - 1) * sides + col, b = (row - 1) * sides + (col + 1) % sides;
        const c = row * sides + col, d = row * sides + (col + 1) % sides;
        indices.push(a, b, c, b, d, c);
      }
    }
  }
  const pole = positions.length / 3;
  positions.push(0, headY + (afro ? .39 : quiff ? .40 : .30), -.015); cavity.push(.025);
  for (let col = 0; col < sides; col++) indices.push((rows - 1) * sides + col, (rows - 1) * sides + (col + 1) % sides, pole);
  if (afro) for (let curl = 0; curl < 12; curl++) {
    // Rounded forehead curls fill the area hidden by the source's goggles.
    const angle = -1.1 + curl / 11 * 2.2;
    const center = new Vector3(Math.sin(angle) * .22, headY + .19 + .035 * Math.cos(angle), .18 * Math.cos(angle) - .015);
    const radius = .043, first = positions.length / 3, columns = 8, rings = 4;
    for (let row = 1; row < rings; row++) {
      const latitude = -Math.PI / 2 + row / rings * Math.PI;
      for (let col = 0; col < columns; col++) {
        const phi = col / columns * Math.PI * 2;
        positions.push(center.x + Math.sin(phi) * Math.cos(latitude) * radius,
          center.y + Math.sin(latitude) * radius, center.z + Math.cos(phi) * Math.cos(latitude) * radius);
        cavity.push(.025);
        if (row > 1) {
          const a = first + (row - 2) * columns + col, b = first + (row - 2) * columns + (col + 1) % columns;
          const c = first + (row - 1) * columns + col, d = first + (row - 1) * columns + (col + 1) % columns;
          indices.push(a, b, c, b, d, c);
        }
      }
    }
    const low = positions.length / 3; positions.push(center.x, center.y - radius, center.z); cavity.push(.04);
    const high = positions.length / 3; positions.push(center.x, center.y + radius, center.z); cavity.push(.025);
    for (let col = 0; col < columns; col++) {
      indices.push(low, first + (col + 1) % columns, first + col);
      const last = first + (rings - 2) * columns; indices.push(last + col, last + (col + 1) % columns, high);
    }
  }
  return surface(scene, 'sculpted-hair-cap', positions, indices, color, cavity);
}
