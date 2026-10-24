import type { Vec3 } from '@frost-and-flamingos/shared';

/**
 * Server-side combat geometry. The client never decides a hit; it only sends
 * an aim ray, and this module tests that ray against rewound player capsules.
 */

export interface CombatTarget {
  id: number;
  /** Feet position at the rewound server tick. */
  position: Vec3;
  crouched: boolean;
  radius: number;
  height: number;
  alive: boolean;
}

export interface PlayerHit {
  id: number;
  distance: number;
  headshot: boolean;
}

const EPSILON = 1e-5;

export function normalizeDirection(direction: Vec3): Vec3 {
  const length = Math.hypot(direction.x, direction.y, direction.z);
  if (!Number.isFinite(length) || length < EPSILON) return { x: 0, y: 0, z: 1 };
  return {
    x: direction.x / length,
    y: direction.y / length,
    z: direction.z / length,
  };
}

export function spreadDirection(direction: Vec3, spread: number, random = Math.random): Vec3 {
  const base = normalizeDirection(direction);
  if (spread <= 0) return base;
  // Build a stable orthonormal basis and offset the direction inside a cone.
  const reference = Math.abs(base.y) > 0.92 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
  const right = normalizeDirection({
    x: base.y * reference.z - base.z * reference.y,
    y: base.z * reference.x - base.x * reference.z,
    z: base.x * reference.y - base.y * reference.x,
  });
  const up = {
    x: base.y * right.z - base.z * right.y,
    y: base.z * right.x - base.x * right.z,
    z: base.x * right.y - base.y * right.x,
  };
  const angle = random() * Math.PI * 2;
  const radius = Math.sqrt(random()) * spread;
  return normalizeDirection({
    x: base.x + right.x * Math.cos(angle) * radius + up.x * Math.sin(angle) * radius,
    y: base.y + right.y * Math.cos(angle) * radius + up.y * Math.sin(angle) * radius,
    z: base.z + right.z * Math.cos(angle) * radius + up.z * Math.sin(angle) * radius,
  });
}

/** Returns the ray parameter of the nearest sphere intersection, or null. */
export function raySphere(
  origin: Vec3,
  direction: Vec3,
  center: Vec3,
  radius: number,
): number | null {
  const ox = origin.x - center.x;
  const oy = origin.y - center.y;
  const oz = origin.z - center.z;
  const b = ox * direction.x + oy * direction.y + oz * direction.z;
  const c = ox * ox + oy * oy + oz * oz - radius * radius;
  const discriminant = b * b - c;
  if (discriminant < 0) return null;
  const root = Math.sqrt(discriminant);
  const near = -b - root;
  if (near >= 0) return near;
  const far = -b + root;
  return far >= 0 ? far : null;
}

/**
 * Vertical capsule (feet to head) intersection. Capsules are the class
 * hitboxes; crouching shortens the segment, which makes the head easier to
 * miss and the body harder to hit.
 */
export function rayCapsule(
  origin: Vec3,
  direction: Vec3,
  feet: Vec3,
  radius: number,
  height: number,
): number | null {
  const top = Math.max(radius + EPSILON, height - radius);
  const lower = { x: feet.x, y: feet.y + radius, z: feet.z };
  const upper = { x: feet.x, y: feet.y + top, z: feet.z };

  // Cylinder side.
  const ox = origin.x - feet.x;
  const oz = origin.z - feet.z;
  const a = direction.x * direction.x + direction.z * direction.z;
  let best: number | null = null;
  if (a > EPSILON) {
    const b = 2 * (ox * direction.x + oz * direction.z);
    const c = ox * ox + oz * oz - radius * radius;
    const discriminant = b * b - 4 * a * c;
    if (discriminant >= 0) {
      const root = Math.sqrt(discriminant);
      const near = (-b - root) / (2 * a);
      const far = (-b + root) / (2 * a);
      for (const candidate of [near, far]) {
        if (candidate < 0) continue;
        const y = origin.y + direction.y * candidate;
        if (y >= lower.y && y <= upper.y) {
          best = candidate;
          break;
        }
      }
    }
  }

  // End caps.
  const lowerHit = raySphere(origin, direction, lower, radius);
  if (lowerHit !== null && (best === null || lowerHit < best)) best = lowerHit;
  const upperHit = raySphere(origin, direction, upper, radius);
  if (upperHit !== null && (best === null || upperHit < best)) best = upperHit;
  return best;
}

/** Head sphere sits slightly inside the top of the capsule. */
export function headSphere(target: CombatTarget): { center: Vec3; radius: number } {
  const height = target.crouched ? target.height * 0.65 : target.height;
  const radius = Math.max(0.16, target.radius * 0.92);
  return {
    center: {
      x: target.position.x,
      y: target.position.y + height - radius * 0.92,
      z: target.position.z,
    },
    radius,
  };
}

export function raycastTargets(
  origin: Vec3,
  direction: Vec3,
  maxDistance: number,
  targets: readonly CombatTarget[],
): PlayerHit | null {
  const ray = normalizeDirection(direction);
  let best: PlayerHit | null = null;
  for (const target of targets) {
    if (!target.alive) continue;
    const height = target.crouched ? target.height * 0.65 : target.height;
    const bodyDistance = rayCapsule(origin, ray, target.position, target.radius, height);
    if (bodyDistance === null || bodyDistance > maxDistance) continue;
    const head = headSphere(target);
    const headDistance = raySphere(origin, ray, head.center, head.radius);
    const headshot =
      headDistance !== null &&
      headDistance <= maxDistance &&
      headDistance <= bodyDistance + 0.05;
    const distance = headshot && headDistance !== null ? headDistance : bodyDistance;
    if (!best || distance < best.distance) {
      best = { id: target.id, distance, headshot };
    }
  }
  return best;
}

export function distanceSquared(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
}

export function distance(a: Vec3, b: Vec3): number {
  return Math.sqrt(distanceSquared(a, b));
}
