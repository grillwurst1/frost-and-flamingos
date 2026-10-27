import type { Vec3 } from '../../types/index.js';
import type { PropCollider } from '../../types/map.js';
import { boxCollider, cylinderCollider } from './buildings.js';
import { sampleMapHeight } from './terrain.js';

/** Solid pieces are shared by the render mesh and both Rapier worlds. */
export interface CrateStackPart {
  kind: 'crate' | 'barrel' | 'cheese';
  position: Vec3;
  yaw: number;
  size: number;
}

export function crateStackParts(variant: number): readonly CrateStackPart[] {
  switch (variant % 3) {
    case 0: return [
      { kind: 'crate', position: { x: -0.62, y: 0, z: 0 }, yaw: 0.1, size: 1.2 },
      { kind: 'crate', position: { x: 0.64, y: 0, z: 0.05 }, yaw: -0.12, size: 1.2 },
      { kind: 'crate', position: { x: 0, y: 1.2, z: 0 }, yaw: 0.3, size: 1.15 },
    ];
    case 1: return [
      { kind: 'crate', position: { x: -0.6, y: 0, z: 0 }, yaw: 0.2, size: 1.15 },
      { kind: 'barrel', position: { x: 0.7, y: 0, z: 0.1 }, yaw: -0.2, size: 1.3 },
    ];
    default: return [
      { kind: 'crate', position: { x: 0, y: 0, z: 0 }, yaw: 0.15, size: 1.4 },
      { kind: 'crate', position: { x: 0.2, y: 1.4, z: 0.1 }, yaw: -0.4, size: 0.8 },
      { kind: 'cheese', position: { x: -1.2, y: 0, z: 0.4 }, yaw: 0, size: 0.45 },
    ];
  }
}

export function crateStackColliders(variant: number): PropCollider[] {
  return crateStackParts(variant).map(part => {
    const p = part.position;
    if (part.kind === 'barrel') return cylinderCollider(0.53, 0.65, p.x, p.y + 0.65, p.z, { surface: 'wood' });
    if (part.kind === 'cheese') return cylinderCollider(part.size, part.size * 0.28, p.x, p.y + part.size * 0.28, p.z);
    return boxCollider(part.size / 2, part.size / 2, part.size / 2, p.x, p.y + part.size / 2, p.z,
      { rotation: { x: 0, y: part.yaw, z: 0 }, surface: 'wood' });
  });
}

/** Rails follow exactly the same 2.4 m spans as the visible fence posts. */
export function fenceColliders(path: readonly Vec3[]): PropCollider[] {
  const origin = path[0];
  if (!origin) return [];
  const colliders: PropCollider[] = [];
  for (let index = 0; index + 1 < path.length; index++) {
    const a = path[index]!; const b = path[index + 1]!;
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    const spans = Math.max(1, Math.round(length / 2.4));
    for (let span = 0; span < spans; span++) {
      const t = (span + 0.5) / spans;
      const x0=a.x+(b.x-a.x)*span/spans,z0=a.z+(b.z-a.z)*span/spans;
      const x1=a.x+(b.x-a.x)*(span+1)/spans,z1=a.z+(b.z-a.z)*(span+1)/spans;
      // Rendering samples every visible post, not only the authored path endpoints.
      const y0=sampleMapHeight(x0,z0),y1=sampleMapHeight(x1,z1);
      const ground=(y0+y1)/2;
      colliders.push(boxCollider(0.1, 0.6 + Math.abs(y1-y0) / 2, length / spans / 2 + 0.035,
        a.x + (b.x - a.x) * t - origin.x, ground - origin.y + 0.55,
        a.z + (b.z - a.z) * t - origin.z,
        { rotation: { x: 0, y: Math.atan2(b.x - a.x, b.z - a.z), z: 0 }, surface: 'wood' }));
    }
  }
  return colliders;
}
