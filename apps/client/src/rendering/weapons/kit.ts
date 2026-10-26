import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { Material } from '@babylonjs/core/Materials/material';
import type { Scene } from '@babylonjs/core/scene';

/**
 * Low-poly hard-surface kit for the hero weapons: bevelled boxes, lathed
 * barrels and tanks, swept tubes, bevelled extrusions and blobs, all baked
 * into ONE vertex-coloured buffer (position, normal, colour) so a weapon is a
 * single mesh and a single draw call with any vertex-colour material (the
 * painted soldiers' cel prop material today, the procedural rig's material
 * later).
 *
 * Shapes are deliberately chunky and smooth-normalled: soft bevels catch the
 * cel bands and the ink pass draws the silhouette, so no tiny noisy parts are
 * needed. A gentle top-light/bottom-dark tint is painted into the vertex
 * colours (the icons' painted look); the material adds the real lighting.
 *
 * Triangles are written in Babylon's front-face convention no matter how a
 * primitive was emitted (each triangle is checked against its vertex normals),
 * so parents with mirrored transforms (the glTF armature) cull correctly.
 */
export type V3 = readonly [number, number, number];

export interface Place {
  /** Translation in the current frame. */
  at?: V3;
  /** Euler rotation (x, y, z) in radians, Babylon yaw-pitch-roll order. */
  rot?: V3;
}

export interface Ring {
  /** Position along the lathe axis (local +Z). */
  z: number;
  /** Radius (or the X radius when `ry` is given). */
  r: number;
  /** Y radius for oval sections. */
  ry?: number;
  /** Section centre offset in Y (bends a lathe, e.g. a drooping stock). */
  y?: number;
  /** Colour for this ring and the following ones until the next colour. */
  hex?: string;
  /** Duplicate the ring: crisp crease (and crisp colour change). */
  hard?: boolean;
}

interface Rgb {
  r: number;
  g: number;
  b: number;
}

const rgbCache = new Map<string, Rgb>();

export function hexRgb(hex: string): Rgb {
  const cached = rgbCache.get(hex);
  if (cached) return cached;
  const clean = hex.replace('#', '');
  const value = Number.parseInt(clean.padEnd(6, '0').slice(0, 6), 16);
  const rgb = { r: ((value >> 16) & 0xff) / 255, g: ((value >> 8) & 0xff) / 255, b: (value & 0xff) / 255 };
  rgbCache.set(hex, rgb);
  return rgb;
}

/** Multiplies a hex colour (shade < 1 darkens, > 1 lightens, clamped). */
export function shadeHex(hex: string, factor: number): string {
  const { r, g, b } = hexRgb(hex);
  const channel = (value: number): string =>
    Math.round(Math.min(1, Math.max(0, value * factor)) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

function placeMatrix(place: Place): Matrix {
  const [rx, ry, rz] = place.rot ?? [0, 0, 0];
  const [x, y, z] = place.at ?? [0, 0, 0];
  return Matrix.Compose(Vector3.One(), Quaternion.FromEulerAngles(rx, ry, rz), new Vector3(x, y, z));
}

const tmpPoint = new Vector3();
const tmpNormal = new Vector3();

export class WeaponKit {
  private readonly positions: number[] = [];
  private readonly normals: number[] = [];
  private readonly colors: number[] = [];
  private readonly indices: number[] = [];
  private readonly frames: Matrix[] = [Matrix.Identity()];
  /**
   * Painted tone baked per part: surfaces facing `paintUp` (the direction
   * that is up while the weapon is held) get a lighter top-edge tone, the
   * undersides a deeper shade, so the cel bands read as painted highlights.
   */
  paintUp: V3 = [0, 1, 0];
  highlight = 0.2;
  underShade = 0.15;

  get vertexCount(): number {
    return this.positions.length / 3;
  }

  get triangleCount(): number {
    return this.indices.length / 3;
  }

  /** Runs `body` with an extra transform (relative to the current frame). */
  frame(place: Place, body: () => void): void {
    const parent = this.frames[this.frames.length - 1] ?? Matrix.Identity();
    this.frames.push(placeMatrix(place).multiply(parent));
    try {
      body();
    } finally {
      this.frames.pop();
    }
  }

  /** Appends one vertex (local frame) and returns its index. */
  private vertex(local: Matrix, x: number, y: number, z: number, nx: number, ny: number, nz: number, color: Rgb): number {
    const frame = this.frames[this.frames.length - 1] ?? Matrix.Identity();
    const world = local.multiply(frame);
    Vector3.TransformCoordinatesFromFloatsToRef(x, y, z, world, tmpPoint);
    Vector3.TransformNormalFromFloatsToRef(nx, ny, nz, world, tmpNormal);
    tmpNormal.normalize();
    const index = this.positions.length / 3;
    this.positions.push(tmpPoint.x, tmpPoint.y, tmpPoint.z);
    this.normals.push(tmpNormal.x, tmpNormal.y, tmpNormal.z);
    const up = tmpNormal.x * this.paintUp[0] + tmpNormal.y * this.paintUp[1] + tmpNormal.z * this.paintUp[2];
    const lift = up > 0.45 ? this.highlight * Math.min(1, (up - 0.45) / 0.35) : 0;
    const tint = 1 + lift - (up < -0.3 ? this.underShade * Math.min(1, (-up - 0.3) / 0.5) : 0);
    const add = lift * 0.12;
    this.colors.push(Math.min(1, color.r * tint + add), Math.min(1, color.g * tint + add), Math.min(1, color.b * tint + add), 1);
    return index;
  }

  private triangle(a: number, b: number, c: number): void {
    this.indices.push(a, b, c);
  }

  private quad(a: number, b: number, c: number, d: number): void {
    this.indices.push(a, b, c, a, c, d);
  }

  /**
   * Box with chamfered edges (24 vertices). `bevel` is the chamfer size in
   * metres; `soft` blends the face normals towards the corners so the cel
   * bands roll over the edges. `top` scales the top face (x, z) for tapers.
   */
  box(hex: string, size: V3, place: Place & { bevel?: number; soft?: number; top?: readonly [number, number] } = {}): void {
    const local = placeMatrix(place);
    const color = hexRgb(hex);
    const hx = size[0] / 2;
    const hy = size[1] / 2;
    const hz = size[2] / 2;
    const bevel = Math.min(place.bevel ?? Math.min(hx, hy, hz) * 0.35, hx * 0.9, hy * 0.9, hz * 0.9);
    const soft = place.soft ?? 0.3;
    const [topX, topZ] = place.top ?? [1, 1];
    // corner index c = (sx>0) | (sy>0)<<1 | (sz>0)<<2; three vertices per corner (x, y, z face).
    const ids: number[][] = [];
    for (let c = 0; c < 8; c += 1) {
      const sx = c & 1 ? 1 : -1;
      const sy = c & 2 ? 1 : -1;
      const sz = c & 4 ? 1 : -1;
      const scaleX = sy > 0 ? topX : 1;
      const scaleZ = sy > 0 ? topZ : 1;
      const corner: number[] = [];
      for (let face = 0; face < 3; face += 1) {
        const px = (face === 0 ? hx : hx - bevel) * sx * scaleX;
        const py = (face === 1 ? hy : hy - bevel) * sy;
        const pz = (face === 2 ? hz : hz - bevel) * sz * scaleZ;
        const nx = (face === 0 ? 1 : soft) * sx;
        const ny = (face === 1 ? 1 : soft) * sy;
        const nz = (face === 2 ? 1 : soft) * sz;
        corner.push(this.vertex(local, px, py, pz, nx, ny, nz, color));
      }
      ids.push(corner);
    }
    const v = (c: number, face: number): number => ids[c]?.[face] ?? 0;
    // Faces: the four corners sharing a sign on the face axis.
    for (let axis = 0; axis < 3; axis += 1) {
      const bit = 1 << axis;
      const others = [0, 1, 2].filter((other) => other !== axis).map((other) => 1 << other);
      const [u = 1, w = 2] = others;
      for (const side of [0, bit]) {
        this.quad(v(side, axis), v(side | u, axis), v(side | u | w, axis), v(side | w, axis));
      }
    }
    // Edge strips between two faces.
    for (let a = 0; a < 3; a += 1) {
      for (let b = a + 1; b < 3; b += 1) {
        const axis = 3 - a - b;
        const along = 1 << axis;
        for (const sa of [0, 1 << a]) {
          for (const sb of [0, 1 << b]) {
            const c0 = sa | sb;
            const c1 = c0 | along;
            this.quad(v(c0, a), v(c0, b), v(c1, b), v(c1, a));
          }
        }
      }
    }
    // Corner triangles.
    for (let c = 0; c < 8; c += 1) this.triangle(v(c, 0), v(c, 1), v(c, 2));
  }

  /**
   * Surface of revolution around local +Z from a ring profile. Rings take
   * their colour from the last ring that named one; `hard` rings crease.
   * `bump` scales each ring radius by (1 + bump(theta, ringIndex)).
   */
  lathe(
    rings: readonly Ring[],
    place: Place & {
      segments?: number;
      capStart?: boolean;
      capEnd?: boolean;
      bump?: (theta: number, ring: number) => number;
      /** Per-segment colours (radial stripes, e.g. an umbrella); overrides ring colours. */
      stripes?: readonly string[];
      /** Segments per stripe (default 1). */
      stripeWidth?: number;
      phase?: number;
    } = {},
  ): void {
    const local = placeMatrix(place);
    const segments = Math.max(3, place.segments ?? 12);
    const phase = place.phase ?? 0;
    // Expand hard rings into two copies (incoming / outgoing normals).
    interface Expanded {
      ring: Ring;
      color: Rgb;
      index: number;
      dr: number;
      dz: number;
      dy: number;
    }
    const list: Expanded[] = [];
    let colorHex = rings[0]?.hex ?? '#808080';
    rings.forEach((ring, index) => {
      const previous = rings[index - 1];
      const next = rings[index + 1];
      const incoming = previous ? [ring.r - previous.r, ring.z - previous.z, (ring.y ?? 0) - (previous.y ?? 0)] : null;
      const outgoing = next ? [next.r - ring.r, next.z - ring.z, (next.y ?? 0) - (ring.y ?? 0)] : null;
      const average = (a: number[] | null, b: number[] | null): number[] => {
        if (!a) return b ?? [0, 1, 0];
        if (!b) return a;
        const la = Math.hypot(a[0] ?? 0, a[1] ?? 0) || 1;
        const lb = Math.hypot(b[0] ?? 0, b[1] ?? 0) || 1;
        return [(a[0] ?? 0) / la + (b[0] ?? 0) / lb, (a[1] ?? 0) / la + (b[1] ?? 0) / lb, (a[2] ?? 0) / la + (b[2] ?? 0) / lb];
      };
      if (ring.hard && previous) {
        const before = incoming ?? [0, 1, 0];
        list.push({ ring, color: hexRgb(colorHex), index, dr: before[0] ?? 0, dz: before[1] ?? 1, dy: before[2] ?? 0 });
        if (ring.hex) colorHex = ring.hex;
        const after = outgoing ?? before;
        list.push({ ring, color: hexRgb(colorHex), index, dr: after[0] ?? 0, dz: after[1] ?? 1, dy: after[2] ?? 0 });
      } else {
        if (ring.hex) colorHex = ring.hex;
        const tangent = average(incoming, outgoing);
        list.push({ ring, color: hexRgb(colorHex), index, dr: tangent[0] ?? 0, dz: tangent[1] ?? 1, dy: tangent[2] ?? 0 });
      }
    });
    const stripes = place.stripes?.map(hexRgb) ?? null;
    const stripeWidth = Math.max(1, place.stripeWidth ?? 1);
    const stripeAt = (strip: number): Rgb | undefined => stripes?.[Math.floor(strip / stripeWidth) % stripes.length];
    const columns = stripes ? segments * 2 : segments;
    const rowIds: number[][] = [];
    for (const entry of list) {
      const { ring } = entry;
      const ry = ring.ry ?? ring.r;
      const length = Math.hypot(entry.dr, entry.dz) || 1;
      const radial = entry.dz / length;
      const axial = -entry.dr / length;
      const row: number[] = [];
      for (let column = 0; column < columns; column += 1) {
        // With stripes every segment edge is doubled so each stripe is crisp.
        const segment = stripes ? Math.floor((column + 1) / 2) % segments : column;
        const theta = phase + (segment / segments) * Math.PI * 2;
        const bump = 1 + (place.bump ? place.bump(theta, entry.index) : 0);
        const cos = Math.cos(theta);
        const sin = Math.sin(theta);
        const x = cos * ring.r * bump;
        const y = sin * ry * bump + (ring.y ?? 0);
        // Oval sections: the section normal is (cos / rx, sin / ry).
        const ex = ring.r > 1e-4 && ry > 1e-4 ? cos / ring.r : cos;
        const ey = ring.r > 1e-4 && ry > 1e-4 ? sin / ry : sin;
        const el = Math.hypot(ex, ey) || 1;
        const nx = (ex / el) * radial;
        const ny = (ey / el) * radial;
        const color = stripes ? stripeAt(Math.floor(column / 2)) ?? entry.color : entry.color;
        row.push(this.vertex(local, x, y, ring.z, nx, ny, axial, color));
      }
      rowIds.push(row);
    }
    for (let row = 0; row + 1 < rowIds.length; row += 1) {
      const a = rowIds[row] ?? [];
      const b = rowIds[row + 1] ?? [];
      // Skip the zero-length strip between the two copies of a hard ring.
      if (list[row]?.index === list[row + 1]?.index) continue;
      for (let column = 0; column < columns; column += 1) {
        if (stripes && column % 2 === 1) continue;
        const next = (column + 1) % columns;
        this.quad(a[column] ?? 0, a[next] ?? 0, b[next] ?? 0, b[column] ?? 0);
      }
    }
    const cap = (entry: Expanded | undefined, direction: number): void => {
      if (!entry || entry.ring.r < 1e-4) return;
      const ry = entry.ring.ry ?? entry.ring.r;
      const center = this.vertex(local, 0, entry.ring.y ?? 0, entry.ring.z, 0, 0, direction, entry.color);
      const ids: number[] = [];
      for (let segment = 0; segment < segments; segment += 1) {
        const theta = phase + (segment / segments) * Math.PI * 2;
        const bump = 1 + (place.bump ? place.bump(theta, entry.index) : 0);
        const color = stripes ? stripeAt(segment) ?? entry.color : entry.color;
        ids.push(
          this.vertex(local, Math.cos(theta) * entry.ring.r * bump, Math.sin(theta) * ry * bump + (entry.ring.y ?? 0), entry.ring.z, 0, 0, direction, color),
        );
      }
      for (let segment = 0; segment < segments; segment += 1) {
        this.triangle(center, ids[segment] ?? 0, ids[(segment + 1) % segments] ?? 0);
      }
    };
    if (place.capStart) cap(list[0], -1);
    if (place.capEnd) cap(list[list.length - 1], 1);
  }

  /**
   * Tube swept along a smoothed path (Catmull-Rom, `samples` rings) with
   * parallel-transported frames. `radius` may vary along the path (t 0..1).
   */
  tube(
    hex: string | ((t: number) => string),
    path: readonly V3[],
    radius: number | ((t: number) => number),
    options: { segments?: number; samples?: number; capStart?: boolean; capEnd?: boolean; ry?: number } = {},
  ): void {
    if (path.length < 2) return;
    const local = Matrix.Identity();
    const segments = Math.max(3, options.segments ?? 8);
    const samples = Math.max(2, options.samples ?? path.length);
    const points: Vector3[] = [];
    const at = (index: number): Vector3 => {
      const clamped = Math.min(path.length - 1, Math.max(0, index));
      const p = path[clamped] ?? [0, 0, 0];
      return new Vector3(p[0], p[1], p[2]);
    };
    for (let sample = 0; sample < samples; sample += 1) {
      const s = (sample / (samples - 1)) * (path.length - 1);
      const i = Math.min(path.length - 2, Math.floor(s));
      const t = s - i;
      points.push(Vector3.CatmullRom(at(i - 1), at(i), at(i + 1), at(i + 2), t));
    }
    const tangents = points.map((point, index) => {
      const next = points[Math.min(points.length - 1, index + 1)] ?? point;
      const previous = points[Math.max(0, index - 1)] ?? point;
      return next.subtract(previous).normalize();
    });
    const first = tangents[0] ?? new Vector3(0, 0, 1);
    let normal = Math.abs(first.y) < 0.9 ? Vector3.Cross(first, new Vector3(0, 1, 0)).normalize() : Vector3.Cross(first, new Vector3(1, 0, 0)).normalize();
    const radiusAt = typeof radius === 'number' ? () => radius : radius;
    const colorAt = typeof hex === 'string' ? () => hex : hex;
    const rows: number[][] = [];
    const ringFrames: Array<{ p: Vector3; n: Vector3; b: Vector3; r: number; color: Rgb }> = [];
    points.forEach((point, index) => {
      const tangent = tangents[index] ?? first;
      // Parallel transport: remove the tangent component from the last normal.
      normal = normal.subtract(tangent.scale(Vector3.Dot(normal, tangent))).normalize();
      const binormal = Vector3.Cross(tangent, normal).normalize();
      const t = index / (points.length - 1);
      const r = radiusAt(t);
      const color = hexRgb(colorAt(t));
      ringFrames.push({ p: point, n: normal.clone(), b: binormal, r, color });
      const row: number[] = [];
      for (let segment = 0; segment < segments; segment += 1) {
        const theta = (segment / segments) * Math.PI * 2;
        const dx = normal.x * Math.cos(theta) + binormal.x * Math.sin(theta);
        const dy = normal.y * Math.cos(theta) + binormal.y * Math.sin(theta);
        const dz = normal.z * Math.cos(theta) + binormal.z * Math.sin(theta);
        const ry = options.ry ?? 1;
        row.push(
          this.vertex(local, point.x + dx * r, point.y + dy * r * ry, point.z + dz * r, dx, dy / Math.max(0.2, ry), dz, color),
        );
      }
      rows.push(row);
    });
    for (let row = 0; row + 1 < rows.length; row += 1) {
      const a = rows[row] ?? [];
      const b = rows[row + 1] ?? [];
      for (let segment = 0; segment < segments; segment += 1) {
        const next = (segment + 1) % segments;
        this.quad(a[segment] ?? 0, a[next] ?? 0, b[next] ?? 0, b[segment] ?? 0);
      }
    }
    const cap = (index: number, sign: number): void => {
      const ring = ringFrames[index];
      const tangent = tangents[index];
      if (!ring || !tangent) return;
      const n = tangent.scale(sign);
      const center = this.vertex(local, ring.p.x, ring.p.y, ring.p.z, n.x, n.y, n.z, ring.color);
      const ids: number[] = [];
      for (let segment = 0; segment < segments; segment += 1) {
        const theta = (segment / segments) * Math.PI * 2;
        const d = ring.n.scale(Math.cos(theta)).addInPlace(ring.b.scale(Math.sin(theta)));
        ids.push(this.vertex(local, ring.p.x + d.x * ring.r, ring.p.y + d.y * ring.r, ring.p.z + d.z * ring.r, n.x, n.y, n.z, ring.color));
      }
      for (let segment = 0; segment < segments; segment += 1) this.triangle(center, ids[segment] ?? 0, ids[(segment + 1) % segments] ?? 0);
    };
    if (options.capStart) cap(0, -1);
    if (options.capEnd) cap(rows.length - 1, 1);
  }

  /**
   * Bevelled slab from a side-view outline: points are (z, y) in the local
   * frame (z forward, y up), extruded `thickness` along X. Concave outlines
   * are fine (ear clipping); keep them simple (no holes, no self overlap).
   */
  extrude(hex: string, outline: ReadonlyArray<readonly [number, number]>, thickness: number, place: Place & { bevel?: number } = {}): void {
    const local = placeMatrix(place);
    const color = hexRgb(hex);
    const count = outline.length;
    if (count < 3) return;
    let area = 0;
    for (let index = 0; index < count; index += 1) {
      const a = outline[index] ?? [0, 0];
      const b = outline[(index + 1) % count] ?? [0, 0];
      area += a[0] * b[1] - b[0] * a[1];
    }
    const ccw = area > 0;
    // Outward 2D normals per vertex (mitred average of the two edges).
    const normals2: Array<[number, number]> = [];
    const edgeNormal = (a: readonly [number, number], b: readonly [number, number]): [number, number] => {
      const dz = b[0] - a[0];
      const dy = b[1] - a[1];
      const length = Math.hypot(dz, dy) || 1;
      return ccw ? [dy / length, -dz / length] : [-dy / length, dz / length];
    };
    for (let index = 0; index < count; index += 1) {
      const previous = outline[(index - 1 + count) % count] ?? [0, 0];
      const current = outline[index] ?? [0, 0];
      const next = outline[(index + 1) % count] ?? [0, 0];
      const n0 = edgeNormal(previous, current);
      const n1 = edgeNormal(current, next);
      let nz = n0[0] + n1[0];
      let ny = n0[1] + n1[1];
      const length = Math.hypot(nz, ny) || 1;
      nz /= length;
      ny /= length;
      const cosHalf = Math.max(0.5, nz * n1[0] + ny * n1[1]);
      normals2.push([nz / cosHalf, ny / cosHalf]);
    }
    const half = thickness / 2;
    const bevel = Math.min(place.bevel ?? thickness * 0.3, half * 0.9);
    const rings: number[][] = [];
    const layers: Array<{ x: number; inset: number; nx: number; side: number }> =
      bevel > 0
        ? [
            { x: half, inset: bevel, nx: 1, side: 0 },
            { x: half, inset: bevel, nx: 0.8, side: 0.6 },
            { x: half - bevel, inset: 0, nx: 0.15, side: 1 },
            { x: -half + bevel, inset: 0, nx: -0.15, side: 1 },
            { x: -half, inset: bevel, nx: -0.8, side: 0.6 },
            { x: -half, inset: bevel, nx: -1, side: 0 },
          ]
        : [
            { x: half, inset: 0, nx: 1, side: 0 },
            { x: half, inset: 0, nx: 0, side: 1 },
            { x: -half, inset: 0, nx: 0, side: 1 },
            { x: -half, inset: 0, nx: -1, side: 0 },
          ];
    for (const layer of layers) {
      const ring: number[] = [];
      for (let index = 0; index < count; index += 1) {
        const point = outline[index] ?? [0, 0];
        const n = normals2[index] ?? [0, 0];
        const z = point[0] - n[0] * layer.inset;
        const y = point[1] - n[1] * layer.inset;
        ring.push(this.vertex(local, layer.x, y, z, layer.nx, n[1] * layer.side, n[0] * layer.side, color));
      }
      rings.push(ring);
    }
    // Side strips (skip the cap-to-bevel duplicate pair of the bevelled form).
    for (let layer = 1; layer + 1 < rings.length - (bevel > 0 ? 1 : 0); layer += 1) {
      const a = rings[layer] ?? [];
      const b = rings[layer + 1] ?? [];
      for (let index = 0; index < count; index += 1) {
        const next = (index + 1) % count;
        this.quad(a[index] ?? 0, a[next] ?? 0, b[next] ?? 0, b[index] ?? 0);
      }
    }
    // Caps by ear clipping on the 2D outline.
    const triangles = earClip(outline, ccw);
    const front = rings[0] ?? [];
    const back = rings[rings.length - 1] ?? [];
    for (const [a, b, c] of triangles) {
      this.triangle(front[a] ?? 0, front[b] ?? 0, front[c] ?? 0);
      this.triangle(back[a] ?? 0, back[c] ?? 0, back[b] ?? 0);
    }
  }

  /** Ellipsoid / rounded blob (`exponent` < 1 squares it towards a box). */
  blob(hex: string, radii: V3, place: Place & { segments?: number; rings?: number; exponent?: number } = {}): void {
    const local = placeMatrix(place);
    const color = hexRgb(hex);
    const segments = Math.max(4, place.segments ?? 10);
    const ringCount = Math.max(3, place.rings ?? 6);
    const exponent = place.exponent ?? 1;
    const shape = (value: number): number => Math.sign(value) * Math.pow(Math.abs(value), exponent);
    const ids: number[][] = [];
    for (let ring = 0; ring <= ringCount; ring += 1) {
      const phi = (ring / ringCount) * Math.PI;
      const row: number[] = [];
      const columns = ring === 0 || ring === ringCount ? 1 : segments;
      for (let segment = 0; segment < columns; segment += 1) {
        const theta = (segment / segments) * Math.PI * 2;
        const sx = shape(Math.sin(phi)) * shape(Math.cos(theta));
        const sy = shape(Math.cos(phi));
        const sz = shape(Math.sin(phi)) * shape(Math.sin(theta));
        const x = sx * radii[0];
        const y = sy * radii[1];
        const z = sz * radii[2];
        row.push(this.vertex(local, x, y, z, x / (radii[0] * radii[0]), y / (radii[1] * radii[1]), z / (radii[2] * radii[2]), color));
      }
      ids.push(row);
    }
    for (let ring = 0; ring < ringCount; ring += 1) {
      const a = ids[ring] ?? [];
      const b = ids[ring + 1] ?? [];
      for (let segment = 0; segment < segments; segment += 1) {
        const next = (segment + 1) % segments;
        if (a.length === 1) this.triangle(a[0] ?? 0, b[next] ?? 0, b[segment] ?? 0);
        else if (b.length === 1) this.triangle(a[segment] ?? 0, a[next] ?? 0, b[0] ?? 0);
        else this.quad(a[segment] ?? 0, a[next] ?? 0, b[next] ?? 0, b[segment] ?? 0);
      }
    }
  }

  /** Mirrors everything emitted so far across X (handedness swap). */
  mirrorX(): void {
    for (let index = 0; index < this.positions.length; index += 3) {
      this.positions[index] = -(this.positions[index] ?? 0);
      this.normals[index] = -(this.normals[index] ?? 0);
    }
  }

  /**
   * Bakes everything into one mesh. Triangles whose winding disagrees with
   * their vertex normals are flipped into Babylon's front-face convention.
   */
  build(scene: Scene, name: string, material: Material | null): Mesh {
    const positions = this.positions;
    const normals = this.normals;
    const indices = this.indices.slice();
    for (let index = 0; index + 2 < indices.length; index += 3) {
      const a = indices[index] ?? 0;
      const b = indices[index + 1] ?? 0;
      const c = indices[index + 2] ?? 0;
      const ax = positions[a * 3] ?? 0;
      const ay = positions[a * 3 + 1] ?? 0;
      const az = positions[a * 3 + 2] ?? 0;
      const e1x = (positions[b * 3] ?? 0) - ax;
      const e1y = (positions[b * 3 + 1] ?? 0) - ay;
      const e1z = (positions[b * 3 + 2] ?? 0) - az;
      const e2x = (positions[c * 3] ?? 0) - ax;
      const e2y = (positions[c * 3 + 1] ?? 0) - ay;
      const e2z = (positions[c * 3 + 2] ?? 0) - az;
      const cx = e1y * e2z - e1z * e2y;
      const cy = e1z * e2x - e1x * e2z;
      const cz = e1x * e2y - e1y * e2x;
      const nx = (normals[a * 3] ?? 0) + (normals[b * 3] ?? 0) + (normals[c * 3] ?? 0);
      const ny = (normals[a * 3 + 1] ?? 0) + (normals[b * 3 + 1] ?? 0) + (normals[c * 3 + 1] ?? 0);
      const nz = (normals[a * 3 + 2] ?? 0) + (normals[b * 3 + 2] ?? 0) + (normals[c * 3 + 2] ?? 0);
      // Babylon front faces: cross(b - a, c - a) points away from the normal.
      if (cx * nx + cy * ny + cz * nz > 0) {
        indices[index + 1] = c;
        indices[index + 2] = b;
      }
    }
    const mesh = new Mesh(name, scene);
    const data = new VertexData();
    data.positions = new Float32Array(positions);
    data.normals = new Float32Array(normals);
    data.colors = new Float32Array(this.colors);
    data.indices = positions.length / 3 > 65535 ? new Uint32Array(indices) : new Uint16Array(indices);
    data.applyToMesh(mesh, false);
    mesh.material = material;
    mesh.isPickable = false;
    return mesh;
  }
}

/** Ear clipping of a simple polygon (indices into `outline`). */
function earClip(outline: ReadonlyArray<readonly [number, number]>, ccw: boolean): Array<[number, number, number]> {
  const remaining = outline.map((_, index) => index);
  const result: Array<[number, number, number]> = [];
  const point = (index: number): readonly [number, number] => outline[index] ?? [0, 0];
  const cross = (a: number, b: number, c: number): number => {
    const pa = point(a);
    const pb = point(b);
    const pc = point(c);
    const value = (pb[0] - pa[0]) * (pc[1] - pa[1]) - (pb[1] - pa[1]) * (pc[0] - pa[0]);
    return ccw ? value : -value;
  };
  const inside = (p: number, a: number, b: number, c: number): boolean =>
    cross(a, b, p) >= 0 && cross(b, c, p) >= 0 && cross(c, a, p) >= 0;
  let guard = 0;
  while (remaining.length > 3 && guard < 10000) {
    guard += 1;
    let clipped = false;
    for (let index = 0; index < remaining.length; index += 1) {
      const a = remaining[(index - 1 + remaining.length) % remaining.length] ?? 0;
      const b = remaining[index] ?? 0;
      const c = remaining[(index + 1) % remaining.length] ?? 0;
      if (cross(a, b, c) <= 1e-12) continue;
      let blocked = false;
      for (const other of remaining) {
        if (other === a || other === b || other === c) continue;
        if (inside(other, a, b, c)) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;
      result.push([a, b, c]);
      remaining.splice(index, 1);
      clipped = true;
      break;
    }
    if (!clipped) break;
  }
  if (remaining.length === 3) result.push([remaining[0] ?? 0, remaining[1] ?? 0, remaining[2] ?? 0]);
  return result;
}
