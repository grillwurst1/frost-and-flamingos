/**
 * Procedural geometry batcher for the Fjord Fiesta map.
 *
 * All static map geometry is emitted into a few large vertex arrays (one per
 * spatial chunk or destructible element) instead of thousands of Babylon
 * meshes, then uploaded once. Every vertex carries position, normal, colour
 * and a `surfaceId` (see `surfaces.ts`) so the toon/detail shaders can pick a
 * painted detail texture per part after merging.
 */
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { Scene } from '@babylonjs/core/scene';
import type { Material } from '@babylonjs/core/Materials/material';
import { SURFACE_ATTRIBUTE, type SurfaceKind, surfaceId, surfaceToonAlpha } from './surfaces';

export type RGB = readonly [number, number, number];
export type V3 = readonly [number, number, number];

/** Row-major 3×4 affine matrix. */
export class Affine {
  constructor(readonly m: readonly number[] = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0]) {}

  static identity(): Affine {
    return new Affine();
  }

  static translation(x: number, y: number, z: number): Affine {
    return new Affine([1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z]);
  }

  /** Shared map yaw convention: local +Z → (sin a, cos a). */
  static rotationY(angle: number): Affine {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return new Affine([c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0]);
  }

  static rotationX(angle: number): Affine {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return new Affine([1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0]);
  }

  static rotationZ(angle: number): Affine {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return new Affine([c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0]);
  }

  static scaling(x: number, y: number, z: number): Affine {
    return new Affine([x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0]);
  }

  /** Frame whose local +Y runs from `a` to `b` (logs, posts, ropes). */
  static alongSegment(a: V3, b: V3): Affine {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const dz = b[2] - a[2];
    const length = Math.hypot(dx, dy, dz) || 1e-6;
    const ux = dx / length;
    const uy = dy / length;
    const uz = dz / length;
    // Pick a helper axis that is not parallel to the segment.
    let hx = 0;
    let hy = 0;
    let hz = 1;
    if (Math.abs(uz) > 0.9) {
      hx = 1;
      hz = 0;
    }
    // Right-handed frame: x = up × helper, z = x × up.
    let xx = uy * hz - uz * hy;
    let xy = uz * hx - ux * hz;
    let xz = ux * hy - uy * hx;
    const xl = Math.hypot(xx, xy, xz) || 1;
    xx /= xl;
    xy /= xl;
    xz /= xl;
    const zx = xy * uz - xz * uy;
    const zy = xz * ux - xx * uz;
    const zz = xx * uy - xy * ux;
    return new Affine([xx, ux, zx, a[0], xy, uy, zy, a[1], xz, uz, zz, a[2]]);
  }

  multiply(other: Affine): Affine {
    const a = this.m;
    const b = other.m;
    const r: number[] = new Array(12);
    for (let row = 0; row < 3; row += 1) {
      const a0 = a[row * 4] ?? 0;
      const a1 = a[row * 4 + 1] ?? 0;
      const a2 = a[row * 4 + 2] ?? 0;
      const a3 = a[row * 4 + 3] ?? 0;
      for (let column = 0; column < 4; column += 1) {
        r[row * 4 + column] =
          a0 * (b[column] ?? 0) + a1 * (b[4 + column] ?? 0) + a2 * (b[8 + column] ?? 0) + (column === 3 ? a3 : 0);
      }
    }
    return new Affine(r);
  }

  translate(x: number, y: number, z: number): Affine {
    return this.multiply(Affine.translation(x, y, z));
  }

  rotateY(angle: number): Affine {
    return this.multiply(Affine.rotationY(angle));
  }

  rotateX(angle: number): Affine {
    return this.multiply(Affine.rotationX(angle));
  }

  rotateZ(angle: number): Affine {
    return this.multiply(Affine.rotationZ(angle));
  }

  scale(x: number, y = x, z = x): Affine {
    return this.multiply(Affine.scaling(x, y, z));
  }
}

/** Deterministic 0…1 hash for per-vertex colour jitter and organic offsets. */
export function hash3(x: number, y: number, z: number): number {
  const value = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return value - Math.floor(value);
}

export function shade(color: RGB, factor: number): RGB {
  return [Math.min(1, color[0] * factor), Math.min(1, color[1] * factor), Math.min(1, color[2] * factor)];
}

export function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export class GeometryBatch {
  readonly positions: number[] = [];
  readonly normals: number[] = [];
  readonly colors: number[] = [];
  readonly surfaces: number[] = [];
  readonly indices: number[] = [];
  transform: Affine = Affine.identity();
  /** Per-vertex colour jitter amplitude (0 = flat). */
  jitter = 0.05;

  get vertexCount(): number {
    return this.positions.length / 3;
  }

  /** Thin near detail (balusters, slats, posts) split off by {@link fineDetail}. */
  private fineBatch: GeometryBatch | null = null;
  /** Solid far stand-ins for the fine detail (painted panels instead of combs of slats). */
  private farBatch: GeometryBatch | null = null;

  /**
   * Draws thin geometry that turns into ink noise at range (railings, slats)
   * into a separate near-LOD batch, and an optional solid stand-in into a
   * far-LOD batch. The owner of this batch turns them into LOD meshes with
   * {@link takeDetail}; batches that never call it keep everything inline.
   */
  fineDetail(near: () => void, far?: () => void): void {
    this.moveInto(near, () => (this.fineBatch ??= this.child()));
    if (far) this.moveInto(far, () => (this.farBatch ??= this.child()));
  }

  /** Removes and returns the fine / far detail drawn so far (null when none). */
  takeDetail(): { fine: GeometryBatch | null; far: GeometryBatch | null } {
    const detail = { fine: this.fineBatch, far: this.farBatch };
    this.fineBatch = null;
    this.farBatch = null;
    return detail;
  }

  private child(): GeometryBatch {
    const batch = new GeometryBatch();
    batch.jitter = this.jitter;
    return batch;
  }

  private moveInto(draw: () => void, target: () => GeometryBatch): void {
    const firstVertex = this.vertexCount;
    const firstIndex = this.indices.length;
    draw();
    if (this.vertexCount === firstVertex) return;
    const dest = target();
    const base = dest.vertexCount;
    for (const value of this.positions.splice(firstVertex * 3)) dest.positions.push(value);
    for (const value of this.normals.splice(firstVertex * 3)) dest.normals.push(value);
    for (const value of this.colors.splice(firstVertex * 4)) dest.colors.push(value);
    for (const value of this.surfaces.splice(firstVertex)) dest.surfaces.push(value);
    for (const index of this.indices.splice(firstIndex)) dest.indices.push(index - firstVertex + base);
  }

  /** Runs `draw` with `local` appended to the current transform. */
  with(local: Affine, draw: () => void): void {
    const previous = this.transform;
    this.transform = previous.multiply(local);
    draw();
    this.transform = previous;
  }

  at(x: number, y: number, z: number, rotationY: number, draw: () => void): void {
    this.with(Affine.translation(x, y, z).rotateY(rotationY), draw);
  }

  /** Pushes one vertex (local coordinates) and returns its index. */
  vertex(px: number, py: number, pz: number, nx: number, ny: number, nz: number, color: RGB, surface: SurfaceKind): number {
    const m = this.transform.m;
    const x = (m[0] ?? 1) * px + (m[1] ?? 0) * py + (m[2] ?? 0) * pz + (m[3] ?? 0);
    const y = (m[4] ?? 0) * px + (m[5] ?? 1) * py + (m[6] ?? 0) * pz + (m[7] ?? 0);
    const z = (m[8] ?? 0) * px + (m[9] ?? 0) * py + (m[10] ?? 1) * pz + (m[11] ?? 0);
    // Normals use the cofactor matrix so non-uniform scales stay lit correctly.
    const a = m[0] ?? 1;
    const b = m[1] ?? 0;
    const c = m[2] ?? 0;
    const d = m[4] ?? 0;
    const e = m[5] ?? 1;
    const f = m[6] ?? 0;
    const g = m[8] ?? 0;
    const h = m[9] ?? 0;
    const i = m[10] ?? 1;
    let wx = (e * i - f * h) * nx + (f * g - d * i) * ny + (d * h - e * g) * nz;
    let wy = (c * h - b * i) * nx + (a * i - c * g) * ny + (b * g - a * h) * nz;
    let wz = (b * f - c * e) * nx + (c * d - a * f) * ny + (a * e - b * d) * nz;
    const length = Math.hypot(wx, wy, wz) || 1;
    wx /= length;
    wy /= length;
    wz /= length;
    const index = this.positions.length / 3;
    this.positions.push(x, y, z);
    this.normals.push(wx, wy, wz);
    const j = this.jitter > 0 ? 1 + (hash3(x * 0.71, y * 0.53, z * 0.67) - 0.5) * this.jitter : 1;
    this.colors.push(Math.min(1, color[0] * j), Math.min(1, color[1] * j), Math.min(1, color[2] * j), surfaceToonAlpha(surface));
    this.surfaces.push(surfaceId(surface));
    return index;
  }

  /**
   * Triangle whose (b − a) × (c − a) faces outward (right-handed maths).
   * Babylon's default front face is the opposite winding, so it is swapped.
   */
  triangle(a: number, b: number, c: number): void {
    this.indices.push(a, c, b);
  }

  /** Flat-shaded polygon (convex, ordered counter-clockwise seen from outside). */
  polygon(points: readonly V3[], color: RGB, surface: SurfaceKind, flip = false): void {
    if (points.length < 3) return;
    const p0 = points[0] as V3;
    const p1 = points[1] as V3;
    const p2 = points[2] as V3;
    let nx = (p1[1] - p0[1]) * (p2[2] - p0[2]) - (p1[2] - p0[2]) * (p2[1] - p0[1]);
    let ny = (p1[2] - p0[2]) * (p2[0] - p0[0]) - (p1[0] - p0[0]) * (p2[2] - p0[2]);
    let nz = (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p1[1] - p0[1]) * (p2[0] - p0[0]);
    if (flip) {
      nx = -nx;
      ny = -ny;
      nz = -nz;
    }
    const first = this.positions.length / 3;
    for (const point of points) this.vertex(point[0], point[1], point[2], nx, ny, nz, color, surface);
    for (let index = 1; index + 1 < points.length; index += 1) {
      if (flip) this.triangle(first, first + index + 1, first + index);
      else this.triangle(first, first + index, first + index + 1);
    }
  }

  /** Polygon auto-oriented so its normal points along `outward`. */
  orientedPolygon(points: readonly V3[], outward: V3, color: RGB, surface: SurfaceKind): void {
    const p0 = points[0] as V3;
    const p1 = points[1] as V3;
    const p2 = points[2] as V3;
    const nx = (p1[1] - p0[1]) * (p2[2] - p0[2]) - (p1[2] - p0[2]) * (p2[1] - p0[1]);
    const ny = (p1[2] - p0[2]) * (p2[0] - p0[0]) - (p1[0] - p0[0]) * (p2[2] - p0[2]);
    const nz = (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p1[1] - p0[1]) * (p2[0] - p0[0]);
    const flip = nx * outward[0] + ny * outward[1] + nz * outward[2] < 0;
    this.polygon(points, color, surface, flip);
  }

  /**
   * Bevelled (chamfered) box centred at (cx, cy, cz). A small bevel gives
   * every plank, crate and wall the rounded toy-like edge the art direction
   * asks for, and catches a highlight band in the toon shader.
   */
  box(
    cx: number,
    cy: number,
    cz: number,
    width: number,
    height: number,
    depth: number,
    color: RGB,
    surface: SurfaceKind,
    bevel = 0.06,
    topColor?: RGB,
  ): void {
    const hx = width / 2;
    const hy = height / 2;
    const hz = depth / 2;
    // Thin parts (planks, slats, trims) read fine without bevels and cost 4× fewer vertices.
    const thin = Math.min(width, height, depth) < 0.3;
    const b = thin ? 0 : Math.max(0, Math.min(bevel, hx * 0.45, hy * 0.45, hz * 0.45));
    const top = topColor ?? color;
    if (b < 0.005) {
      const corners = (sx: number, sy: number, sz: number): V3 => [cx + sx * hx, cy + sy * hy, cz + sz * hz];
      this.orientedPolygon([corners(1, -1, -1), corners(1, 1, -1), corners(1, 1, 1), corners(1, -1, 1)], [1, 0, 0], color, surface);
      this.orientedPolygon([corners(-1, -1, -1), corners(-1, -1, 1), corners(-1, 1, 1), corners(-1, 1, -1)], [-1, 0, 0], color, surface);
      this.orientedPolygon([corners(-1, 1, -1), corners(-1, 1, 1), corners(1, 1, 1), corners(1, 1, -1)], [0, 1, 0], top, surface);
      this.orientedPolygon([corners(-1, -1, -1), corners(1, -1, -1), corners(1, -1, 1), corners(-1, -1, 1)], [0, -1, 0], shade(color, 0.8), surface);
      this.orientedPolygon([corners(-1, -1, 1), corners(1, -1, 1), corners(1, 1, 1), corners(-1, 1, 1)], [0, 0, 1], color, surface);
      this.orientedPolygon([corners(-1, -1, -1), corners(-1, 1, -1), corners(1, 1, -1), corners(1, -1, -1)], [0, 0, -1], color, surface);
      return;
    }
    const p = (axis: 0 | 1 | 2, sx: number, sy: number, sz: number): V3 => {
      const x = axis === 0 ? sx * hx : sx * (hx - b);
      const y = axis === 1 ? sy * hy : sy * (hy - b);
      const z = axis === 2 ? sz * hz : sz * (hz - b);
      return [cx + x, cy + y, cz + z];
    };
    const signs = [-1, 1];
    // Faces
    for (const s of signs) {
      this.orientedPolygon([p(0, s, -1, -1), p(0, s, 1, -1), p(0, s, 1, 1), p(0, s, -1, 1)], [s, 0, 0], color, surface);
      this.orientedPolygon([p(1, -1, s, -1), p(1, 1, s, -1), p(1, 1, s, 1), p(1, -1, s, 1)], [0, s, 0], s > 0 ? top : shade(color, 0.82), surface);
      this.orientedPolygon([p(2, -1, -1, s), p(2, 1, -1, s), p(2, 1, 1, s), p(2, -1, 1, s)], [0, 0, s], color, surface);
    }
    // Edge bevels
    for (const sx of signs) {
      for (const sy of signs) {
        this.orientedPolygon([p(0, sx, sy, -1), p(0, sx, sy, 1), p(1, sx, sy, 1), p(1, sx, sy, -1)], [sx, sy, 0], sy > 0 ? top : color, surface);
      }
      for (const sz of signs) {
        this.orientedPolygon([p(0, sx, -1, sz), p(0, sx, 1, sz), p(2, sx, 1, sz), p(2, sx, -1, sz)], [sx, 0, sz], color, surface);
      }
    }
    for (const sy of signs) {
      for (const sz of signs) {
        this.orientedPolygon([p(1, -1, sy, sz), p(1, 1, sy, sz), p(2, 1, sy, sz), p(2, -1, sy, sz)], [0, sy, sz], sy > 0 ? top : color, surface);
      }
    }
    // Corner triangles
    for (const sx of signs) {
      for (const sy of signs) {
        for (const sz of signs) {
          this.orientedPolygon([p(0, sx, sy, sz), p(1, sx, sy, sz), p(2, sx, sy, sz)], [sx, sy, sz], sy > 0 ? top : color, surface);
        }
      }
    }
  }

  /** Box from two corners (axis-aligned in the current frame). */
  boxMinMax(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: RGB, surface: SurfaceKind, bevel = 0.06): void {
    this.box((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), color, surface, bevel);
  }

  /**
   * Surface of revolution around local Y. `profile` lists [radius, y] from
   * bottom to top; smooth normals give round toon highlights.
   */
  lathe(
    profile: readonly (readonly [number, number])[],
    segments: number,
    color: RGB | ((ring: number, segment: number) => RGB),
    surface: SurfaceKind,
    options: { capBottom?: boolean; capTop?: boolean; phase?: number; wobble?: number; seed?: number } = {},
  ): void {
    // Round metal shafts must not become visibly square at close range.
    // Smooth vertex normals alone cannot round a four/six-sided silhouette.
    if (surface === 'metal') segments = Math.max(12, segments);
    const phase = options.phase ?? 0;
    const wobble = options.wobble ?? 0;
    const seed = options.seed ?? 0;
    const rings: number[][] = [];
    const colorAt = (ring: number, segment: number): RGB => (typeof color === 'function' ? color(ring, segment) : color);
    for (let ring = 0; ring < profile.length; ring += 1) {
      const current = profile[ring] as readonly [number, number];
      const previous = profile[Math.max(0, ring - 1)] as readonly [number, number];
      const next = profile[Math.min(profile.length - 1, ring + 1)] as readonly [number, number];
      // Profile tangent → normal in the (r, y) plane.
      const dr = next[0] - previous[0];
      const dy = next[1] - previous[1];
      const length = Math.hypot(dr, dy) || 1;
      const normalR = dy / length;
      const normalY = -dr / length;
      const indices: number[] = [];
      for (let segment = 0; segment <= segments; segment += 1) {
        const angle = phase + (segment / segments) * Math.PI * 2;
        const wobbleScale = wobble > 0 ? 1 + (hash3(ring * 1.7 + seed, (segment % segments) * 2.3, seed * 0.37) - 0.5) * wobble : 1;
        const radius = current[0] * wobbleScale;
        const sin = Math.sin(angle);
        const cos = Math.cos(angle);
        indices.push(this.vertex(sin * radius, current[1], cos * radius, sin * normalR, normalY, cos * normalR, colorAt(ring, segment), surface));
      }
      rings.push(indices);
    }
    for (let ring = 0; ring + 1 < rings.length; ring += 1) {
      const lower = rings[ring] as number[];
      const upper = rings[ring + 1] as number[];
      for (let segment = 0; segment < segments; segment += 1) {
        const a = lower[segment] as number;
        const b = lower[segment + 1] as number;
        const c = upper[segment + 1] as number;
        const d = upper[segment] as number;
        // (b − a) runs along increasing angle, (d − a) upwards: their cross is outward.
        this.triangle(a, b, c);
        this.triangle(a, c, d);
      }
    }
    const cap = (ring: number, up: boolean): void => {
      const entry = profile[ring] as readonly [number, number];
      if (entry[0] < 0.001) return;
      const points: V3[] = [];
      for (let segment = 0; segment < segments; segment += 1) {
        const angle = phase + (segment / segments) * Math.PI * 2;
        points.push([Math.sin(angle) * entry[0], entry[1], Math.cos(angle) * entry[0]]);
      }
      this.orientedPolygon(points, [0, up ? 1 : -1, 0], shade(colorAt(ring, 0), up ? 1.06 : 0.8), surface);
    };
    if (options.capBottom) cap(0, false);
    if (options.capTop) cap(profile.length - 1, true);
  }

  cylinder(
    radiusBottom: number,
    radiusTop: number,
    height: number,
    segments: number,
    color: RGB,
    surface: SurfaceKind,
    options: { capTop?: boolean; capBottom?: boolean; y?: number; phase?: number } = {},
  ): void {
    const y = options.y ?? 0;
    this.lathe(
      [
        [radiusBottom, y],
        [radiusTop, y + height],
      ],
      segments,
      color,
      surface,
      { capTop: options.capTop ?? true, capBottom: options.capBottom ?? false, phase: options.phase ?? 0 },
    );
  }

  /** Low-poly ellipsoid / blob (snow caps, bushes, rocks with `wobble`). */
  blob(
    cx: number,
    cy: number,
    cz: number,
    rx: number,
    ry: number,
    rz: number,
    color: RGB | ((ny: number) => RGB),
    surface: SurfaceKind,
    options: { segments?: number; rings?: number; wobble?: number; seed?: number; flatBottom?: boolean; flat?: boolean } = {},
  ): void {
    const segments = options.segments ?? 8;
    const rings = options.rings ?? 5;
    const wobble = options.wobble ?? 0;
    const seed = options.seed ?? 0;
    const flat = options.flat ?? false;
    const colorAt = (ny: number): RGB => (typeof color === 'function' ? color(ny) : color);
    const grid: [number, number, number][][] = [];
    const minRing = options.flatBottom ? Math.floor(rings / 2) : 0;
    for (let ring = minRing; ring <= rings; ring += 1) {
      const v = ring / rings;
      const phi = -Math.PI / 2 + v * Math.PI;
      const row: [number, number, number][] = [];
      for (let segment = 0; segment <= segments; segment += 1) {
        const theta = (segment / segments) * Math.PI * 2;
        const pole = ring === 0 || ring === rings;
        const noise = wobble > 0 && !pole ? 1 + (hash3(ring + seed * 3.1, (segment % segments) * 1.7, seed) - 0.5) * wobble : 1;
        row.push([Math.cos(phi) * Math.sin(theta) * noise, Math.sin(phi), Math.cos(phi) * Math.cos(theta) * noise]);
      }
      grid.push(row);
    }
    if (flat) {
      for (let ring = 0; ring + 1 < grid.length; ring += 1) {
        for (let segment = 0; segment < segments; segment += 1) {
          const a = (grid[ring] as [number, number, number][])[segment] as [number, number, number];
          const b = (grid[ring] as [number, number, number][])[segment + 1] as [number, number, number];
          const c = (grid[ring + 1] as [number, number, number][])[segment + 1] as [number, number, number];
          const d = (grid[ring + 1] as [number, number, number][])[segment] as [number, number, number];
          const toWorld = (p: [number, number, number]): V3 => [cx + p[0] * rx, cy + p[1] * ry, cz + p[2] * rz];
          const ny = (a[1] + c[1]) / 2;
          const quad = [toWorld(a), toWorld(b), toWorld(c), toWorld(d)];
          const center: V3 = [(a[0] + c[0]) / 2, ny, (a[2] + c[2]) / 2];
          this.orientedPolygon([quad[0] as V3, quad[1] as V3, quad[2] as V3], center, colorAt(ny), surface);
          this.orientedPolygon([quad[0] as V3, quad[2] as V3, quad[3] as V3], center, colorAt(ny), surface);
        }
      }
    } else {
      const indexGrid: number[][] = grid.map((row) =>
        row.map((p) => this.vertex(cx + p[0] * rx, cy + p[1] * ry, cz + p[2] * rz, p[0] / rx, p[1] / ry, p[2] / rz, colorAt(p[1]), surface)),
      );
      for (let ring = 0; ring + 1 < indexGrid.length; ring += 1) {
        const lower = indexGrid[ring] as number[];
        const upper = indexGrid[ring + 1] as number[];
        for (let segment = 0; segment < segments; segment += 1) {
          const a = lower[segment] as number;
          const b = lower[segment + 1] as number;
          const c = upper[segment + 1] as number;
          const d = upper[segment] as number;
          this.triangle(a, b, c);
          this.triangle(a, c, d);
        }
      }
    }
    if (options.flatBottom) {
      const row = grid[0] as [number, number, number][];
      const points: V3[] = row.slice(0, segments).map((p) => [cx + p[0] * rx, cy + p[1] * ry, cz + p[2] * rz]);
      this.orientedPolygon(points, [0, -1, 0], shade(colorAt(-1), 0.8), surface);
    }
  }

  /** Round log / post between two points with optional cut-end colour (tree rings). */
  log(a: V3, b: V3, radius: number, color: RGB, surface: SurfaceKind, options: { segments?: number; endColor?: RGB; taper?: number; capEnds?: boolean } = {}): void {
    const length = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const segments = options.segments ?? 7;
    const taper = options.taper ?? 1;
    this.with(Affine.alongSegment(a, b), () => {
      this.lathe(
        [
          [radius, 0],
          [radius * taper, length],
        ],
        segments,
        color,
        surface,
        { phase: hash3(a[0], a[1], a[2]) * 3 },
      );
      if (options.capEnds ?? true) {
        const end = options.endColor ?? shade(color, 1.35);
        const ringPoints = (y: number, r: number): V3[] =>
          Array.from({ length: segments }, (_, index) => {
            const angle = (index / segments) * Math.PI * 2 + hash3(a[0], a[1], a[2]) * 3;
            return [Math.sin(angle) * r, y, Math.cos(angle) * r] as V3;
          });
        this.orientedPolygon(ringPoints(0, radius), [0, -1, 0], end, 'wood');
        this.orientedPolygon(ringPoints(length, radius * taper), [0, 1, 0], end, 'wood');
      }
    });
  }

  /** Tube along a polyline (ropes, cables, rails, troughs). */
  tube(points: readonly V3[], radius: number, segments: number, color: RGB, surface: SurfaceKind): void {
    if (points.length < 2) return;
    const rings: number[][] = [];
    for (let index = 0; index < points.length; index += 1) {
      const point = points[index] as V3;
      const previous = points[Math.max(0, index - 1)] as V3;
      const next = points[Math.min(points.length - 1, index + 1)] as V3;
      let tx = next[0] - previous[0];
      let ty = next[1] - previous[1];
      let tz = next[2] - previous[2];
      const tl = Math.hypot(tx, ty, tz) || 1;
      tx /= tl;
      ty /= tl;
      tz /= tl;
      // side = tangent × up, normalised; fall back to X when vertical.
      let sx = ty * 0 - tz * 1;
      let sy = tz * 0 - tx * 0;
      let sz = tx * 1 - ty * 0;
      let sl = Math.hypot(sx, sy, sz);
      if (sl < 0.2) {
        sx = 1;
        sy = 0;
        sz = 0;
        sl = 1;
      }
      sx /= sl;
      sy /= sl;
      sz /= sl;
      const ux = sy * tz - sz * ty;
      const uy = sz * tx - sx * tz;
      const uz = sx * ty - sy * tx;
      const ring: number[] = [];
      for (let segment = 0; segment <= segments; segment += 1) {
        const angle = (segment / segments) * Math.PI * 2;
        const c = Math.cos(angle);
        const s = Math.sin(angle);
        const nx = sx * c + ux * s;
        const ny = sy * c + uy * s;
        const nz = sz * c + uz * s;
        ring.push(this.vertex(point[0] + nx * radius, point[1] + ny * radius, point[2] + nz * radius, nx, ny, nz, color, surface));
      }
      rings.push(ring);
    }
    for (let index = 0; index + 1 < rings.length; index += 1) {
      const lower = rings[index] as number[];
      const upper = rings[index + 1] as number[];
      for (let segment = 0; segment < segments; segment += 1) {
        const a = lower[segment] as number;
        const b = lower[segment + 1] as number;
        const c = upper[segment + 1] as number;
        const d = upper[segment] as number;
        this.triangle(a, d, c);
        this.triangle(a, c, b);
      }
    }
  }

  /**
   * Double-sided sheet over a grid of points (rows × columns) with shared
   * vertices: fronds, leaves, cloth. Far cheaper than per-quad polygons.
   */
  sheet(rows: readonly (readonly V3[])[], color: (row: number) => RGB, surface: SurfaceKind): void {
    const rowCount = rows.length;
    const columns = rows[0]?.length ?? 0;
    if (rowCount < 2 || columns < 2) return;
    const normalAt = (r: number, c: number): V3 => {
      const row = rows[r] as readonly V3[];
      const up = (rows[Math.min(rowCount - 1, r + 1)] as readonly V3[])[c] as V3;
      const down = (rows[Math.max(0, r - 1)] as readonly V3[])[c] as V3;
      const right = row[Math.min(columns - 1, c + 1)] as V3;
      const left = row[Math.max(0, c - 1)] as V3;
      const ax = up[0] - down[0];
      const ay = up[1] - down[1];
      const az = up[2] - down[2];
      const bx = right[0] - left[0];
      const by = right[1] - left[1];
      const bz = right[2] - left[2];
      return [by * az - bz * ay, bz * ax - bx * az, bx * ay - by * ax];
    };
    for (const side of [1, -1]) {
      const first = this.positions.length / 3;
      for (let r = 0; r < rowCount; r += 1) {
        const tone = side > 0 ? color(r / (rowCount - 1)) : shade(color(r / (rowCount - 1)), 0.82);
        for (let c = 0; c < columns; c += 1) {
          const point = (rows[r] as readonly V3[])[c] as V3;
          const n = normalAt(r, c);
          this.vertex(point[0], point[1], point[2], n[0] * side, n[1] * side, n[2] * side, tone, surface);
        }
      }
      for (let r = 0; r + 1 < rowCount; r += 1) {
        for (let c = 0; c + 1 < columns; c += 1) {
          const a = first + r * columns + c;
          const b = a + 1;
          const d = a + columns;
          const e = d + 1;
          if (side > 0) {
            this.triangle(a, e, b);
            this.triangle(a, d, e);
          } else {
            this.triangle(a, b, e);
            this.triangle(a, e, d);
          }
        }
      }
    }
  }

  /** Double-sided flat quad strip (flags, leaves, fronds). */
  ribbon(left: readonly V3[], right: readonly V3[], color: RGB | ((t: number) => RGB), surface: SurfaceKind): void {
    const count = Math.min(left.length, right.length);
    const colorAt = (t: number): RGB => (typeof color === 'function' ? color(t) : color);
    for (let index = 0; index + 1 < count; index += 1) {
      const a = left[index] as V3;
      const b = right[index] as V3;
      const c = right[index + 1] as V3;
      const d = left[index + 1] as V3;
      const t = index / Math.max(1, count - 1);
      this.polygon([a, b, c, d], colorAt(t), surface);
      this.polygon([a, b, c, d], shade(colorAt(t), 0.85), surface, true);
    }
  }

  /** Extruded prism from a 2D outline in the local XY plane (signs, hearts, gables). */
  extrude(outline: readonly (readonly [number, number])[], depth: number, color: RGB, surface: SurfaceKind, sideColor?: RGB): void {
    const half = depth / 2;
    const front: V3[] = outline.map(([x, y]): V3 => [x, y, half]);
    const back: V3[] = outline.map(([x, y]): V3 => [x, y, -half]).reverse();
    this.orientedPolygon(front, [0, 0, 1], color, surface);
    this.orientedPolygon(back, [0, 0, -1], color, surface);
    const side = sideColor ?? shade(color, 0.85);
    for (let index = 0; index < outline.length; index += 1) {
      const a = outline[index] as readonly [number, number];
      const b = outline[(index + 1) % outline.length] as readonly [number, number];
      const ex = b[0] - a[0];
      const ey = b[1] - a[1];
      this.orientedPolygon(
        [
          [a[0], a[1], -half],
          [b[0], b[1], -half],
          [b[0], b[1], half],
          [a[0], a[1], half],
        ],
        [ey, -ex, 0],
        side,
        surface,
      );
    }
  }

  isEmpty(): boolean {
    return this.indices.length === 0;
  }

  /** Uploads the batch as one static mesh (fine detail nobody took stays inline). */
  toMesh(scene: Scene, name: string, material: Material): Mesh | null {
    const { fine } = this.takeDetail();
    if (fine) {
      const base = this.vertexCount;
      for (const value of fine.positions) this.positions.push(value);
      for (const value of fine.normals) this.normals.push(value);
      for (const value of fine.colors) this.colors.push(value);
      for (const value of fine.surfaces) this.surfaces.push(value);
      for (const index of fine.indices) this.indices.push(index + base);
    }
    if (this.isEmpty()) return null;
    const mesh = new Mesh(name, scene);
    const data = new VertexData();
    data.positions = new Float32Array(this.positions);
    data.normals = new Float32Array(this.normals);
    data.colors = new Float32Array(this.colors);
    data.indices = this.vertexCount > 65535 ? new Uint32Array(this.indices) : new Uint16Array(this.indices);
    data.applyToMesh(mesh, false);
    mesh.setVerticesData(SURFACE_ATTRIBUTE, new Float32Array(this.surfaces), false, 1);
    mesh.material = material;
    mesh.isPickable = false;
    mesh.freezeWorldMatrix();
    mesh.doNotSyncBoundingInfo = true;
    return mesh;
  }
}
