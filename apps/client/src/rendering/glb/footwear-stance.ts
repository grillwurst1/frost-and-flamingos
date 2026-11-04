import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math';
import type { PaintedModelAsset } from './library';

interface JointFrame { position: Vector3; rotation: Quaternion }

/** Fit the selected soles to the model's idle stance once per cached outfit.
 * This only samples small CPU buffers during construction, never in update().
 */
export function footwearSpread(asset: PaintedModelAsset, positions: ArrayLike<number>,
  joints: ArrayLike<number>, weights: ArrayLike<number>, names: ReadonlyMap<number, string>,
  inverseBinds: ReadonlyMap<string, { position: Vector3; inverse: Quaternion }>): number {
  const clip = asset.clips.get('idle');
  const tracks = new Map(clip?.bones.map((name, i) => [name, i] as const));
  const soles: Array<{ point: Vector3; index: number; side: 'Left' | 'Right' }> = [];
  for (let v = 0; v < positions.length / 3; v++) {
    if (positions[v * 3 + 1]! > asset.height * .15) continue;
    let left = 0, right = 0;
    for (let k = 0; k < 4; k++) {
      const name = names.get(joints[v * 4 + k]!) ?? '';
      if (/^Left(?:UpLeg|Leg|Foot|Toe)/.test(name)) left += weights[v * 4 + k]!;
      if (/^Right(?:UpLeg|Leg|Foot|Toe)/.test(name)) right += weights[v * 4 + k]!;
    }
    if (left + right < .9) continue;
    soles.push({ point: Vector3.FromArray(positions, v * 3), index: v, side: left > right ? 'Left' : 'Right' });
  }
  let minimumGap = Infinity;
  const samples = clip ? 8 : 1;
  const point = new Vector3(), posed = new Vector3();
  for (let sample = 0; sample < samples; sample++) {
    const frame = clip ? Math.min(clip.frames - 1, Math.floor(sample * clip.frames / samples)) : 0;
    const world = new Map<string, JointFrame>();
    const resolve = (name: string): JointFrame => {
      const cached = world.get(name); if (cached) return cached;
      const bind = asset.bindPose.get(name);
      const position = bind?.position.clone() ?? Vector3.Zero();
      const track = tracks.get(name);
      const rotation = clip && track !== undefined
        ? Quaternion.FromArray(clip.rotations, (frame * clip.bones.length + track) * 4)
        : bind?.rotation.clone() ?? Quaternion.Identity();
      if (name === 'Hips' && clip?.hips) position.addInPlace(Vector3.FromArray(clip.hips, frame * 3));
      const parent = asset.jointParents.get(name);
      const p = parent ? resolve(parent) : null;
      const result = p ? { position: position.rotateByQuaternionToRef(p.rotation, new Vector3()).addInPlace(p.position),
        rotation: p.rotation.multiply(rotation) } : { position, rotation };
      world.set(name, result); return result;
    };
    let leftMin = Infinity, rightMax = -Infinity;
    for (const sole of soles) {
      posed.setAll(0);
      for (let k = 0; k < 4; k++) {
        const index = joints[sole.index * 4 + k]!, weight = weights[sole.index * 4 + k]!;
        const name = names.get(index), bind = name ? inverseBinds.get(name) : undefined;
        if (weight < .0001 || !bind || !name) continue;
        const joint = resolve(name);
        sole.point.subtractToRef(bind.position, point);
        point.rotateByQuaternionToRef(bind.inverse, point);
        point.rotateByQuaternionToRef(joint.rotation, point).addInPlace(joint.position);
        posed.addInPlace(point.scaleInPlace(weight));
      }
      if (sole.side === 'Left') leftMin = Math.min(leftMin, posed.x);
      else rightMax = Math.max(rightMax, posed.x);
    }
    minimumGap = Math.min(minimumGap, leftMin - rightMax);
  }
  const size = asset.height / 1.88;
  return Number.isFinite(minimumGap) ? Math.min(.14 * size, Math.max(0, (.035 * size - minimumGap) / 2)) : 0;
}
