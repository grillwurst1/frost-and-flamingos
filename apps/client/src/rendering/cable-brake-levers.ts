import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { CABLE_CAR_RULES, FJORD_MAP, type Vec3 } from '@frost-and-flamingos/shared';

/** Three existing handles, animated only while the authoritative brake runs. */
export class CableBrakeLevers {
  private readonly active = new Map<string, { start: number; shown: boolean }>();
  constructor(private readonly meshes: ReadonlyMap<string, Mesh>) {}

  pullNearest(operator: Vec3, now: number): void {
    let nearest = FJORD_MAP.routes.cableCar.stations[0]!;
    const distance = (p: Vec3) => Math.hypot(p.x - operator.x, p.y - operator.y, p.z - operator.z);
    for (const station of FJORD_MAP.routes.cableCar.stations) {
      if (distance(station.brakeLever) < distance(nearest.brakeLever)) nearest = station;
    }
    const mesh = this.meshes.get(nearest.id);
    if (!mesh) return;
    mesh.unfreezeWorldMatrix();
    this.active.set(nearest.id, { start: now, shown: false });
  }

  update(now: number): void {
    for (const [id, state] of this.active) {
      const mesh = this.meshes.get(id);
      if (!mesh || mesh.isDisposed()) { this.active.delete(id); continue; }
      const elapsed = Math.max(0, (now - state.start) / 1000);
      const duration = CABLE_CAR_RULES.brakeSeconds;
      // A long GPU frame must not swallow the whole pull. Show it once if
      // the next render arrives after the authoritative stop has finished.
      const delayedFirstFrame = !state.shown && elapsed >= duration;
      const amount = delayedFirstFrame ? 1 : Math.max(0, Math.min(1, elapsed / .12, (duration - elapsed) / .25));
      state.shown ||= amount > .01;
      mesh.rotation.x = 1.35 * amount * amount * (3 - 2 * amount);
      if (elapsed >= duration && !delayedFirstFrame) {
        mesh.rotation.x = 0;
        mesh.freezeWorldMatrix();
        this.active.delete(id);
      }
    }
  }
}
