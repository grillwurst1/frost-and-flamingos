/**
 * Deterministic maths shared by the Fjord Fiesta terrain, layout and the
 * client mesh generators. Nothing here may depend on frame time, Math.random
 * or platform floating-point quirks beyond IEEE-754 doubles.
 */
import type { Vec2, Vec3 } from '../../types/index.js';
import type { RoutePolyline } from '../../types/map.js';

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/** Polynomial smooth minimum: blends two heights with a soft crease of width k. */
export function smoothMin(a: number, b: number, k: number): number {
  const h = clamp01(0.5 + (0.5 * (b - a)) / k);
  return lerp(b, a, h) - k * h * (1 - h);
}

export function smoothMax(a: number, b: number, k: number): number {
  return -smoothMin(-a, -b, k);
}

export function hash2(ix: number, iz: number, seed: number): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

export function valueNoise(x: number, z: number, seed: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz, seed);
  const b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed);
  const d = hash2(ix + 1, iz + 1, seed);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uz);
}

/** Fractal value noise in 0…1. */
export function fbm(x: number, z: number, octaves: number, seed: number): number {
  let total = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let normalization = 0;
  for (let octave = 0; octave < octaves; octave += 1) {
    total += valueNoise(x * frequency, z * frequency, seed + octave * 17) * amplitude;
    normalization += amplitude;
    amplitude *= 0.5;
    frequency *= 2.03;
  }
  return total / normalization;
}

/** Ridged multifractal in 0…1: sharp crests for alpine skylines. */
export function ridged(x: number, z: number, octaves: number, seed: number): number {
  let total = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let normalization = 0;
  for (let octave = 0; octave < octaves; octave += 1) {
    const n = 1 - Math.abs(valueNoise(x * frequency, z * frequency, seed + octave * 31) * 2 - 1);
    total += n * n * amplitude;
    normalization += amplitude;
    amplitude *= 0.5;
    frequency *= 2.11;
  }
  return total / normalization;
}

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function vec3(x: number, y: number, z: number): Vec3 {
  return { x, y, z };
}

export function distance2(ax: number, az: number, bx: number, bz: number): number {
  return Math.hypot(ax - bx, az - bz);
}

export function distance3(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/** Rotates a local XZ offset by the shared yaw convention. */
export function rotateY(x: number, z: number, rotationY: number): Vec2 {
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  return { x: x * cos + z * sin, z: -x * sin + z * cos };
}

/** Inverse of {@link rotateY}: world offset into a prop's local frame. */
export function unrotateY(x: number, z: number, rotationY: number): Vec2 {
  return rotateY(x, z, -rotationY);
}

export function localToWorld(origin: Vec3, rotationY: number, local: Vec3): Vec3 {
  const rotated = rotateY(local.x, local.z, rotationY);
  return { x: origin.x + rotated.x, y: origin.y + local.y, z: origin.z + rotated.z };
}

/** Yaw that points local +Z from `from` towards `to`. */
export function yawTowards(from: Vec2, to: Vec2): number {
  return Math.atan2(to.x - from.x, to.z - from.z);
}

export interface Quaternion {
  x: number;
  y: number;
  z: number;
  w: number;
}

/** Quaternion for yaw (Y) → pitch (X) → roll (Z), matching Babylon's YawPitchRoll. */
export function quaternionFromYawPitchRoll(yaw: number, pitch: number, roll: number): Quaternion {
  const halfRoll = roll * 0.5;
  const halfPitch = pitch * 0.5;
  const halfYaw = yaw * 0.5;
  const sinRoll = Math.sin(halfRoll);
  const cosRoll = Math.cos(halfRoll);
  const sinPitch = Math.sin(halfPitch);
  const cosPitch = Math.cos(halfPitch);
  const sinYaw = Math.sin(halfYaw);
  const cosYaw = Math.cos(halfYaw);
  return {
    x: cosYaw * sinPitch * cosRoll + sinYaw * cosPitch * sinRoll,
    y: sinYaw * cosPitch * cosRoll - cosYaw * sinPitch * sinRoll,
    z: cosYaw * cosPitch * sinRoll - sinYaw * sinPitch * cosRoll,
    w: cosYaw * cosPitch * cosRoll + sinYaw * sinPitch * sinRoll,
  };
}

/** Rotates a vector by a unit quaternion. */
export function rotateByQuaternion(v: Vec3, q: Quaternion): Vec3 {
  const ix = q.w * v.x + q.y * v.z - q.z * v.y;
  const iy = q.w * v.y + q.z * v.x - q.x * v.z;
  const iz = q.w * v.z + q.x * v.y - q.y * v.x;
  const iw = -q.x * v.x - q.y * v.y - q.z * v.z;
  return {
    x: ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y,
    y: iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z,
    z: iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x,
  };
}

export interface SegmentProjection {
  distance: number;
  /** 0…1 along the segment. */
  t: number;
  x: number;
  z: number;
}

export function projectOnSegment(
  x: number,
  z: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): SegmentProjection {
  const dx = bx - ax;
  const dz = bz - az;
  const lengthSquared = dx * dx + dz * dz;
  const t = lengthSquared < 1e-9 ? 0 : clamp01(((x - ax) * dx + (z - az) * dz) / lengthSquared);
  const px = ax + dx * t;
  const pz = az + dz * t;
  return { distance: Math.hypot(x - px, z - pz), t, x: px, z: pz };
}

export interface PolylineProjection {
  /** Horizontal distance from the query point to the polyline. */
  distance: number;
  /** Interpolated height of the polyline at the closest point. */
  y: number;
  /** Arc length (3D) of the closest point. */
  along: number;
  segment: number;
  t: number;
}

/** Closest point of a 3D polyline in the XZ plane. */
export function projectOnPolyline(
  x: number,
  z: number,
  points: readonly Vec3[],
  distances?: readonly number[],
): PolylineProjection {
  let best: PolylineProjection = { distance: Number.POSITIVE_INFINITY, y: 0, along: 0, segment: 0, t: 0 };
  for (let index = 0; index + 1 < points.length; index += 1) {
    const a = points[index];
    const b = points[index + 1];
    if (!a || !b) continue;
    const projection = projectOnSegment(x, z, a.x, a.z, b.x, b.z);
    if (projection.distance < best.distance) {
      const startDistance = distances?.[index] ?? 0;
      const segmentLength = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
      best = {
        distance: projection.distance,
        y: lerp(a.y, b.y, projection.t),
        along: startDistance + segmentLength * projection.t,
        segment: index,
        t: projection.t,
      };
    }
  }
  return best;
}

/** Axis-aligned XZ bounds of a polyline, padded. Used to skip far queries quickly. */
export interface Bounds2 {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export function polylineBounds(points: readonly Vec3[], padding: number): Bounds2 {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minZ = Math.min(minZ, point.z);
    maxZ = Math.max(maxZ, point.z);
  }
  return { minX: minX - padding, maxX: maxX + padding, minZ: minZ - padding, maxZ: maxZ + padding };
}

export function insideBounds(x: number, z: number, bounds: Bounds2): boolean {
  return x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ;
}

/** Centripetal-free uniform Catmull-Rom through control points, sampled every `step` metres. */
export function catmullRom(points: readonly Vec3[], step: number): Vec3[] {
  if (points.length < 2) return points.map((point) => ({ ...point }));
  const result: Vec3[] = [];
  for (let index = 0; index + 1 < points.length; index += 1) {
    const p0 = points[Math.max(0, index - 1)] ?? points[index];
    const p1 = points[index];
    const p2 = points[index + 1];
    const p3 = points[Math.min(points.length - 1, index + 2)] ?? p2;
    if (!p0 || !p1 || !p2 || !p3) continue;
    const length = Math.hypot(p2.x - p1.x, p2.y - p1.y, p2.z - p1.z);
    const samples = Math.max(1, Math.ceil(length / step));
    for (let sample = 0; sample < samples; sample += 1) {
      const t = sample / samples;
      const t2 = t * t;
      const t3 = t2 * t;
      const blend = (a: number, b: number, c: number, d: number): number =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      result.push({
        x: blend(p0.x, p1.x, p2.x, p3.x),
        y: blend(p0.y, p1.y, p2.y, p3.y),
        z: blend(p0.z, p1.z, p2.z, p3.z),
      });
    }
  }
  const last = points[points.length - 1];
  if (last) result.push({ ...last });
  return result;
}

/** Straight-segment resampling that keeps every original corner. */
export function resampleLinear(points: readonly Vec3[], step: number): Vec3[] {
  const result: Vec3[] = [];
  for (let index = 0; index + 1 < points.length; index += 1) {
    const a = points[index];
    const b = points[index + 1];
    if (!a || !b) continue;
    const length = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    const samples = Math.max(1, Math.ceil(length / step));
    for (let sample = 0; sample < samples; sample += 1) {
      const t = sample / samples;
      result.push({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t) });
    }
  }
  const last = points[points.length - 1];
  if (last) result.push({ ...last });
  return result;
}

export function makeRoute(id: string, points: readonly Vec3[]): RoutePolyline {
  const distances: number[] = [];
  let total = 0;
  for (let index = 0; index < points.length; index += 1) {
    const previous = points[index - 1];
    const point = points[index];
    if (previous && point) {
      total += Math.hypot(point.x - previous.x, point.y - previous.y, point.z - previous.z);
    }
    distances.push(total);
  }
  return { id, points: points.map((point) => ({ ...point })), distances, length: total };
}

/** Position and tangent at an arc length along a route. */
export function sampleRoute(route: RoutePolyline, distance: number): { position: Vec3; tangent: Vec3 } {
  const clamped = clamp(distance, 0, route.length);
  let low = 0;
  let high = route.distances.length - 1;
  while (high - low > 1) {
    const mid = (low + high) >> 1;
    if ((route.distances[mid] ?? 0) <= clamped) low = mid;
    else high = mid;
  }
  const a = route.points[low] ?? route.points[0] ?? { x: 0, y: 0, z: 0 };
  const b = route.points[high] ?? a;
  const da = route.distances[low] ?? 0;
  const db = route.distances[high] ?? da;
  const t = db - da > 1e-6 ? (clamped - da) / (db - da) : 0;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  return {
    position: { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t) },
    tangent: { x: dx / length, y: dy / length, z: dz / length },
  };
}

/** Signed distance from a point to an oriented rectangle (negative inside). */
export function rectSignedDistance(
  x: number,
  z: number,
  cx: number,
  cz: number,
  halfX: number,
  halfZ: number,
  rotationY: number,
): number {
  const local = unrotateY(x - cx, z - cz, rotationY);
  const dx = Math.abs(local.x) - halfX;
  const dz = Math.abs(local.z) - halfZ;
  const outside = Math.hypot(Math.max(dx, 0), Math.max(dz, 0));
  return outside + Math.min(Math.max(dx, dz), 0);
}

/** Distance from a point to a capsule (segment with radius), negative inside. */
export function capsuleSignedDistance(
  x: number,
  z: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
  radius: number,
): number {
  return projectOnSegment(x, z, ax, az, bx, bz).distance - radius;
}
