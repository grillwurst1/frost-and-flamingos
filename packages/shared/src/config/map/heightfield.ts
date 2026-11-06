import type { HeightfieldData } from '../../types/map.js';
/** Exact piecewise-planar height on Rapier's (x0,z1)–(x1,z0) diagonal.
 * No interpolation across the other diagonal, no per-query arrays/objects. */
export function sampleHeightfield(grid: HeightfieldData, x: number, z: number): number {
  const half = grid.size / 2, n = grid.segments, points = n + 1;
  const nx = Math.max(0, Math.min(1, (x + half) / grid.size)) * n;
  const nz = Math.max(0, Math.min(1, (z + half) / grid.size)) * n;
  const column = Math.min(n - 1, Math.floor(nx)), row = Math.min(n - 1, Math.floor(nz));
  const fx = nx - column, fz = nz - row, h = grid.heights;
  const h00 = h[column * points + row] ?? 0, h10 = h[(column + 1) * points + row] ?? 0;
  const h01 = h[column * points + row + 1] ?? 0, h11 = h[(column + 1) * points + row + 1] ?? 0;
  if (fx + fz <= 1)
    return h00 + fx * (h10 - h00) + fz * (h01 - h00);
  return h11 + (1 - fx) * (h01 - h11) + (1 - fz) * (h10 - h11);
}
