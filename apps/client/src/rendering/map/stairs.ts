import type { Vec3 } from '@frost-and-flamingos/shared';
import { GeometryBatch } from './geometry';
import { P } from './palette';

/** Closed timber steps: overlapping risers replace floating thin treads.
 * The walking ramp stays within half a riser of the visible surface. */
export function drawClosedStairs(batch: GeometryBatch, from: Vec3, to: Vec3, width: number): void {
  const rise = to.y - from.y, run = Math.hypot(to.x - from.x, to.z - from.z);
  if (rise <= 0 || run <= 0) return;
  const steps = Math.max(2, Math.ceil(rise / .22)), height = rise / steps + .16;
  const yaw = Math.atan2(to.x - from.x, to.z - from.z);
  for (let step = 0; step < steps; step++) {
    const t = (step + .5) / steps;
    batch.at(from.x + (to.x - from.x) * t, from.y + rise * t - height / 2,
      from.z + (to.z - from.z) * t, yaw, () => {
        batch.box(0, 0, 0, width, height, run / steps + .025,
          step % 2 ? P.plank : P.plankLight, 'wood', .012);
      });
  }
}
