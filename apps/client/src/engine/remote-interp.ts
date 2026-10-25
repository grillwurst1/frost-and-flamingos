import type { Vec3 } from '@frost-and-flamingos/shared';

/** The part of a snapshot player that remote interpolation reads. */
export interface RemoteSample {
  position: Vec3;
  velocity: Vec3;
  yaw: number;
  heading: number;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function shortestAngle(from: number, to: number): number {
  let difference = (to - from) % (Math.PI * 2);
  if (difference > Math.PI) difference -= Math.PI * 2;
  if (difference < -Math.PI) difference += Math.PI * 2;
  return difference;
}

/**
 * Remote pose at the render time, between the two snapshots that bracket it
 * (`t` = 0 at `older`, 1 at `newer`, `spanMs` apart). The velocity is the
 * displayed motion, (newer - older) / span, so the animator's foot speed
 * matches what is drawn; with no usable span it falls back to the newer
 * snapshot's own velocity.
 */
export function interpolateRemote(older: RemoteSample | undefined, newer: RemoteSample, t: number, spanMs: number): RemoteSample {
  if (!older) return { position: { ...newer.position }, velocity: { ...newer.velocity }, yaw: newer.yaw, heading: newer.heading };
  const seconds = spanMs / 1000;
  return {
    position: {
      x: lerp(older.position.x, newer.position.x, t),
      y: lerp(older.position.y, newer.position.y, t),
      z: lerp(older.position.z, newer.position.z, t),
    },
    velocity:
      seconds > 0.001
        ? {
            x: (newer.position.x - older.position.x) / seconds,
            y: (newer.position.y - older.position.y) / seconds,
            z: (newer.position.z - older.position.z) / seconds,
          }
        : { ...newer.velocity },
    yaw: older.yaw + shortestAngle(older.yaw, newer.yaw) * t,
    heading: older.heading + shortestAngle(older.heading, newer.heading) * t,
  };
}
