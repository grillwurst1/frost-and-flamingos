import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math';
import { bindWorldTransform, type PaintedModelAsset } from './library';

/** A closed grip for source rigs with a wrist but no individual finger bones. */
export function wristHandSurface(asset: PaintedModelAsset, side: 'Left' | 'Right') {
  const wrist = asset.bindPositions.get(`${side}Hand`), forearm = asset.bindPositions.get(`${side}ForeArm`);
  const transform = bindWorldTransform(asset, `${side}Hand`);
  if (!wrist || !forearm || !transform) return null;
  const size = asset.height / 1.88, direction = wrist.subtract(forearm).normalize();
  const across = new Vector3(-1, 0, 0);
  across.subtractInPlace(direction.scale(Vector3.Dot(across, direction)));
  if (across.lengthSquared() < .01) across.copyFrom(Vector3.Cross(direction, new Vector3(0, 0, 1)));
  across.normalize();
  const front = Vector3.Cross(across, direction).normalize();
  const at = (x: number, y: number, z: number) => wrist.add(across.scale(x * size))
    .add(direction.scale(y * size)).add(front.scale(z * size));
  const points = new Map<string, Vector3[]>();
  for (const [i, digit] of ['Index', 'Middle', 'Ring', 'Pinky'].entries()) {
    const x = -.033 + i * .022, short = Math.abs(i - 1) * .005;
    points.set(digit, [at(x, .070 - short, 0), at(x, .096 - short, .023),
      at(x, .079 - short, .049), at(x, .053 - short, .039)]);
  }
  const thumb = side === 'Left' ? -1 : 1;
  points.set('Thumb', [at(thumb * .040, .025, .009), at(thumb * .044, .049, .032),
    at(thumb * .024, .061, .055), at(thumb * .005, .063, .053)]);
  const inverse = Quaternion.Inverse(transform.rotation);
  return { points, localFrame: {
    fingers: direction.rotateByQuaternionToRef(inverse, new Vector3()),
    thumb: across.scale(thumb).add(front).normalize().rotateByQuaternionToRef(inverse, new Vector3()),
  } };
}
