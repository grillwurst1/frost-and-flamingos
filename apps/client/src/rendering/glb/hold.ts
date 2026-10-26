import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { bindWorldTransform, type RigInfo } from './clips';

/**
 * Pure solvers for the painted characters' weapon holds (glb-character.ts).
 * Every function is continuous in its inputs, so a hold that follows the
 * animated body never jumps between frames: there are no thresholds that
 * switch a rule on or off and no iteration counts that change the answer.
 */

/** Hermite smoothstep; the edges may be given in either order. */
export function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Body-front keep-out: across the torso width a point is pushed forward to at
 * least `frontZ`; the push fades out smoothly past the shoulder line instead
 * of switching off at it.
 */
export function keepOutZ(x: number, z: number, centreX: number, halfWidth: number, frontZ: number): number {
  const weight = smoothstep(halfWidth + 0.06, halfWidth - 0.04, Math.abs(x - centreX));
  return z + weight * Math.max(0, frontZ - z);
}

/**
 * Parameter s in [0, 1] of the first point on the segment from → to that lies
 * within `radius` of `centre`; 0 when `from` already does. When the segment
 * never gets that close, its closest approach. Closed form and continuous.
 */
export function segmentReach(from: Vector3, to: Vector3, centre: Vector3, radius: number): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const cx = from.x - centre.x;
  const cy = from.y - centre.y;
  const cz = from.z - centre.z;
  const a = dx * dx + dy * dy + dz * dz;
  const f0 = cx * cx + cy * cy + cz * cz - radius * radius;
  if (f0 <= 0 || a < 1e-10) return 0;
  // |from + s d - centre|² - r² = a s² + 2 b s + f0
  const b = cx * dx + cy * dy + cz * dz;
  const closest = Math.min(1, Math.max(0, -b / a));
  const discriminant = b * b - a * f0;
  if (discriminant < 0) return closest;
  const first = (-b - Math.sqrt(discriminant)) / a;
  // f0 > 0: both roots lie on the same side of 0.
  return first < 0 ? 0 : Math.min(1, first);
}

/**
 * Pitch-up angle (radians about armature X, applied as RotationAxis(X, -angle))
 * that lifts `points` (armature offsets from the pivot, already rotated) to at
 * least `minY` above the pivot. Points behind the pivot do not count (pitching
 * up lowers them), with a smooth fade so the answer stays continuous.
 */
export function groundLift(points: readonly Vector3[], minY: number, cap: number): number {
  let lift = 0;
  for (const point of points) {
    if (point.y >= minY) continue;
    const length = Math.hypot(point.y, point.z);
    if (length < 1e-4) continue;
    const front = smoothstep(0, 0.3, point.z / length);
    if (front <= 0) continue;
    const angle = Math.atan2(point.y, point.z);
    const wanted = Math.asin(Math.min(1, Math.max(-1, minY / length)));
    lift = Math.max(lift, (wanted - angle) * front);
  }
  return Math.min(cap, lift);
}

/** Closest point to `point` on the segment from → to. */
export function closestOnSegment(from: Vector3, to: Vector3, point: Vector3): Vector3 {
  const direction = to.subtract(from);
  const lengthSquared = direction.lengthSquared();
  if (lengthSquared < 1e-10) return from.clone();
  const t = Math.min(1, Math.max(0, Vector3.Dot(point.subtract(from), direction) / lengthSquared));
  return from.add(direction.scaleInPlace(t));
}

/**
 * A few mesh vertices that bound it in 26 directions (weapon space): enough
 * to find the lowest point of the rotated prop for the ground rule.
 */
export function supportPoints(meshes: readonly Mesh[]): Vector3[] {
  const directions: Vector3[] = [];
  for (let x = -1; x <= 1; x += 1) {
    for (let y = -1; y <= 1; y += 1) {
      for (let z = -1; z <= 1; z += 1) if (x || y || z) directions.push(new Vector3(x, y, z).normalize());
    }
  }
  const best = directions.map(() => ({ score: -Infinity, point: Vector3.Zero() }));
  for (const mesh of meshes) {
    const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
    if (!positions) continue;
    // Child parts (umbrella canopy) sit at their own offset under the prop mesh.
    const offset = mesh.position;
    for (let index = 0; index + 2 < positions.length; index += 3) {
      const x = (positions[index] ?? 0) + offset.x;
      const y = (positions[index + 1] ?? 0) + offset.y;
      const z = (positions[index + 2] ?? 0) + offset.z;
      directions.forEach((direction, slot) => {
        const score = direction.x * x + direction.y * y + direction.z * z;
        const entry = best[slot];
        if (entry && score > entry.score) {
          entry.score = score;
          entry.point.set(x, y, z);
        }
      });
    }
  }
  const unique: Vector3[] = [];
  for (const { score, point } of best) {
    if (Number.isFinite(score) && !unique.some((other) => Vector3.DistanceSquared(other, point) < 1e-6)) unique.push(point);
  }
  return unique;
}

// ---- finger curl -------------------------------------------------------------

export type HandSide = 'Left' | 'Right';

/** One phalanx joint and its fist rotation (local, relative to the bind pose). */
export interface FingerTarget {
  joint: string;
  /** Local rotation of the closed fist. */
  fist: Quaternion;
  /** The trigger finger (right index) closes less on firearms. */
  trigger: boolean;
}

/** Curl per phalanx (radians): knuckle, middle, tip. */
const FINGER_CURL: Readonly<Record<string, readonly [number, number, number]>> = {
  Index: [0.95, 1.05, 0.7],
  Middle: [1.0, 1.15, 0.75],
  Ring: [1.05, 1.15, 0.75],
  Pinky: [1.1, 1.1, 0.7],
  Thumb: [0.3, 0.45, 0.35],
};

const fistCache = new WeakMap<RigInfo, Map<HandSide, FingerTarget[]>>();

/**
 * Fist rotations for one hand, derived from the bind pose: every phalanx
 * turns about the knuckle line towards the palm (the thumb about its own
 * axis), so a hand closes around whatever it holds whatever the clip does.
 * Empty when the rig has no finger joints.
 */
export function fistTargets(rig: RigInfo, side: HandSide): FingerTarget[] {
  let perRig = fistCache.get(rig);
  if (!perRig) {
    perRig = new Map();
    fistCache.set(rig, perRig);
  }
  const cached = perRig.get(side);
  if (cached) return cached;
  const targets: FingerTarget[] = [];
  perRig.set(side, targets);
  const hand = rig.bindPositions.get(`${side}Hand`);
  const middle = rig.bindPositions.get(`${side}HandMiddle1`);
  const index = rig.bindPositions.get(`${side}HandIndex1`);
  const pinky = rig.bindPositions.get(`${side}HandPinky1`);
  if (!hand || !middle || !index || !pinky) return targets;
  const fingerDir = middle.subtract(hand).normalize();
  const across = pinky.subtract(index).normalize();
  // Armature space is right-handed (+X = the character's left): the palm
  // normal of a right hand is fingers × across, of a left hand across × fingers.
  const palm = (side === 'Right' ? Vector3.Cross(fingerDir, across) : Vector3.Cross(across, fingerDir)).normalize();
  for (const finger of Object.keys(FINGER_CURL)) {
    const angles = FINGER_CURL[finger] ?? [0, 0, 0];
    const first = rig.bindPositions.get(`${side}Hand${finger}1`);
    const second = rig.bindPositions.get(`${side}Hand${finger}2`);
    if (!first || !second) continue;
    const bone = second.subtract(first).normalize();
    const axis = Vector3.Cross(finger === 'Thumb' ? bone : fingerDir, palm);
    if (axis.lengthSquared() < 1e-8) continue;
    axis.normalize();
    for (let k = 1; k <= 3; k += 1) {
      const joint = `${side}Hand${finger}${k}`;
      const bind = rig.bindPose.get(joint);
      const parentName = rig.jointParents.get(joint);
      const parent = parentName ? bindWorldTransform(rig, parentName) : null;
      if (!bind || !parent) continue;
      // The same armature axis in the parent's frame, then pre-multiplied:
      // world' = R(axis) · parentWorld · local.
      const localAxis = axis.rotateByQuaternionToRef(Quaternion.Inverse(parent.rotation), new Vector3()).normalize();
      const fist = Quaternion.RotationAxis(localAxis, angles[k - 1] ?? 0).multiply(bind.rotation);
      targets.push({ joint, fist, trigger: side === 'Right' && finger === 'Index' });
    }
  }
  return targets;
}

// ---- head and mouth ------------------------------------------------------------

export interface HeadFrame {
  /** Head centre in the Head joint's frame. */
  centre: Vector3;
  /** Lips (or beard front) in the Head joint's frame: where a horn's mouthpiece sits. */
  mouth: Vector3;
  radius: number;
}

const headCache = new WeakMap<RigInfo, HeadFrame | null>();

/**
 * Head centre and mouth point for a painted model. The mouth is the front
 * surface of the face (lips, or the beard over them) measured from the bind
 * mesh below the head centre, so it fits big hair and small faces alike.
 */
export function headFrame(rig: RigInfo, mesh: Mesh | null, head: { y: number; z: number; radius: number }): HeadFrame | null {
  if (headCache.has(rig)) return headCache.get(rig) ?? null;
  const bind = bindWorldTransform(rig, 'Head');
  if (!bind) {
    headCache.set(rig, null);
    return null;
  }
  const centre = new Vector3(0, head.y, head.z);
  const mouthY = head.y - head.radius * 0.45;
  let front = head.z + head.radius * 0.75;
  const positions = mesh?.getVerticesData(VertexBuffer.PositionKind);
  if (positions) {
    let found = -Infinity;
    for (let index = 0; index + 2 < positions.length; index += 3) {
      const x = positions[index] ?? 0;
      const y = positions[index + 1] ?? 0;
      const z = positions[index + 2] ?? 0;
      if (Math.abs(x) < 0.03 && Math.abs(y - mouthY) < 0.035 && z > head.z && z < head.z + head.radius * 1.6) found = Math.max(found, z);
    }
    if (Number.isFinite(found)) front = found;
  }
  const inverse = Quaternion.Inverse(bind.rotation);
  const frame: HeadFrame = {
    centre: centre.subtract(bind.position).rotateByQuaternionToRef(inverse, new Vector3()),
    mouth: new Vector3(0, mouthY, front + 0.012).subtractInPlace(bind.position).rotateByQuaternionToRef(inverse, new Vector3()),
    radius: head.radius,
  };
  headCache.set(rig, frame);
  return frame;
}
