/** Small sculpted eyes in the shared donor head's coordinates. Built once per
 * cached outfit; crisp iris/pupil geometry needs no extra texture or draw. */
export function sculptedEyes() {
  const positions: number[] = [], normals: number[] = [], colors: number[] = [], indices: number[] = [];
  type RGB = readonly [number, number, number];
  const vertex = (x: number, y: number, z: number, nx: number, ny: number, nz: number, color: RGB) => {
    const index = positions.length / 3, length = Math.hypot(nx, ny, nz) || 1;
    positions.push(x, y, z); normals.push(nx / length, ny / length, nz / length); colors.push(...color, 0);
    return index;
  };
  const lens = (x: number, y: number, z: number, rx: number, ry: number, color: RGB, sectors = 16, striate = false) => {
    const center = vertex(x, y, z + .0005, 0, 0, 1, color), start = positions.length / 3;
    for (let ring = 1; ring <= 2; ring++) for (let col = 0; col < sectors; col++) {
      const a = col / sectors * Math.PI * 2, radius = ring / 2;
      const shade = striate ? (.78 + .22 * (col % 2)) * (ring === 1 ? 1.08 : .87) : 1;
      vertex(x + Math.cos(a) * rx * radius, y + Math.sin(a) * ry * radius,
        z + .0005 * (1 - radius * radius), 0, 0, 1, [color[0] * shade, color[1] * shade, color[2] * shade]);
    }
    for (let col = 0; col < sectors; col++) {
      const next = (col + 1) % sectors;
      indices.push(center, start + col, start + next);
      indices.push(start + col, start + sectors + col, start + sectors + next,
        start + col, start + sectors + next, start + next);
    }
  };
  for (const sign of [-1, 1]) {
    const first = positions.length / 3;
    const x = sign * .048, y = 1.438, z = .048, rx = .0185, ry = .0075, rz = .0065;
    const white: RGB = [.94, .94, .90], sectors = 16, rows = 8;
    const front = vertex(x, y, z + rz, 0, 0, 1, white), start = positions.length / 3;
    for (let row = 1; row < rows; row++) for (let col = 0; col < sectors; col++) {
      const p = row / rows * Math.PI, a = col / sectors * Math.PI * 2;
      const dx = Math.sin(p) * Math.cos(a), dy = Math.sin(p) * Math.sin(a), dz = Math.cos(p);
      vertex(x + dx * rx, y + dy * ry, z + dz * rz, dx / rx, dy / ry, dz / rz, white);
    }
    const back = vertex(x, y, z - rz, 0, 0, -1, white);
    for (let col = 0; col < sectors; col++) {
      const next = (col + 1) % sectors;
      indices.push(front, start + col, start + next);
      for (let row = 0; row < rows - 2; row++) {
        const a = start + row * sectors + col, b = start + row * sectors + next;
        indices.push(a, a + sectors, b + sectors, a, b + sectors, b);
      }
      const last = start + (rows - 2) * sectors;
      indices.push(back, last + next, last + col);
    }
    const gaze = x - sign * .0045;
    lens(gaze, y, .0548, .0061, .0064, [.22, .39, .31], 20, true);
    lens(gaze, y, .0555, .0030, .0038, [.035, .050, .044]);
    lens(gaze - .0016, y + .0022, .0562, .0012, .0014, [1, 1, .98], 12);
    // The sockets wrap around the face: flat forward-facing patches float
    // in front of the outer corners when the soldier turns in profile.
    const sin = Math.sin(sign * .48), cos = Math.cos(sign * .48);
    for (let v = first; v < positions.length / 3; v++) {
      const dx = positions[v * 3]! - x, dz = positions[v * 3 + 2]! - z;
      positions[v * 3] = x + dx * cos + dz * sin;
      positions[v * 3 + 2] = z - dx * sin + dz * cos;
      const nx = normals[v * 3]!, nz = normals[v * 3 + 2]!;
      normals[v * 3] = nx * cos + nz * sin; normals[v * 3 + 2] = -nx * sin + nz * cos;
    }
  }
  return { positions, normals, colors, indices };
}
