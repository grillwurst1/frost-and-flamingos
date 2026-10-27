import type { Vec3 } from './types/index.js';

/** Validate aim input; the spring camera may still face away from the movement yaw after a fast turn. */
export function validatedShotDirection(direction: Vec3): Vec3 | null {
  const length = Math.hypot(direction.x, direction.y, direction.z);
  if (!Number.isFinite(length) || length < 0.5 || length > 1.5) return null;
  return { x: direction.x / length, y: direction.y / length, z: direction.z / length };
}

/** Aim from the authoritative eye towards the point on the offset camera's centre ray. */
export function convergedShotDirection(eye: Vec3, camera: Vec3, forward: Vec3, hitDistance: number): Vec3 {
  // A surface behind the body must not make an over-shoulder gun fire backwards.
  const minimum = Math.hypot(camera.x - eye.x, camera.y - eye.y, camera.z - eye.z) + 1;
  const distance = Math.max(minimum, hitDistance);
  const x = camera.x + forward.x * distance - eye.x;
  const y = camera.y + forward.y * distance - eye.y;
  const z = camera.z + forward.z * distance - eye.z;
  const length = Math.hypot(x, y, z) || 1;
  return { x: x / length, y: y / length, z: z / length };
}
