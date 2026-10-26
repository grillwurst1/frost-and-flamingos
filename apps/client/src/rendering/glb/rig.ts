import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';

/**
 * Armature-space pose solver for one painted character instance.
 *
 * Works on the cloned glTF joint TransformNodes after Babylon has evaluated
 * the animation clips for the frame. All maths happens in the glTF armature
 * space (the parent of `Hips`: right-handed, +Y up, character facing +Z,
 * character's right = -X), which keeps the handedness flip of the glTF root
 * out of every rotation. Joints are looked up by Mixamo name, never by index.
 */
export const RIG_JOINTS = [
  'Hips',
  'Spine',
  'Spine1',
  'Spine2',
  'Neck',
  'Head',
  'LeftShoulder',
  'LeftArm',
  'LeftForeArm',
  'LeftHand',
  'LeftHandMiddle1',
  'LeftHandThumb1',
  'RightShoulder',
  'RightArm',
  'RightForeArm',
  'RightHand',
  'RightHandMiddle1',
  'RightHandThumb1',
  'LeftUpLeg',
  'LeftLeg',
  'LeftFoot',
  'RightUpLeg',
  'RightLeg',
  'RightFoot',
] as const;

export type RigJoint = (typeof RIG_JOINTS)[number];

interface JointState {
  node: TransformNode;
  parent: JointState | null;
  rotation: Quaternion;
  position: Vector3;
}

const tmpA = new Vector3();
const tmpB = new Vector3();
const tmpC = new Vector3();
const tmpQ = new Quaternion();
const tmpQ2 = new Quaternion();

/** Most of the wrist twist a forearm takes over (radians). */
const MAX_FOREARM_TWIST = 1.4;

/** Rotation taking unit vector `from` to unit vector `to`. */
function fromTo(from: Vector3, to: Vector3, result: Quaternion): Quaternion {
  return Quaternion.FromUnitVectorsToRef(from, to, result);
}

export class GlbRig {
  private readonly joints = new Map<RigJoint, JointState>();
  private readonly order: JointState[] = [];
  /** Last signed wrist twist per forearm, unwrapped across ±π (see shareWristTwist). */
  private readonly twists = new Map<RigJoint, number>();

  constructor(nodes: ReadonlyMap<string, TransformNode>, parents: ReadonlyMap<string, string | null>) {
    for (const name of RIG_JOINTS) {
      const node = nodes.get(name);
      if (!node) continue;
      let parentName = parents.get(name) ?? null;
      // Walk up to the nearest joint that is part of the solver set.
      while (parentName && !this.joints.has(parentName as RigJoint)) parentName = parents.get(parentName) ?? null;
      const parent = parentName ? this.joints.get(parentName as RigJoint) ?? null : null;
      if (!node.rotationQuaternion) node.rotationQuaternion = Quaternion.FromEulerVector(node.rotation);
      const state: JointState = { node, parent, rotation: new Quaternion(), position: new Vector3() };
      this.joints.set(name, state);
      this.order.push(state);
    }
  }

  has(name: RigJoint): boolean {
    return this.joints.has(name);
  }

  /** Forgets the remembered forearm twists (a new hold starts from the principal angle). */
  resetTwist(): void {
    this.twists.clear();
  }

  /** Recomputes armature-space transforms of every solver joint. */
  refresh(): void {
    for (const joint of this.order) {
      const local = joint.node.rotationQuaternion ?? Quaternion.Identity();
      if (joint.parent) {
        joint.parent.rotation.multiplyToRef(local, joint.rotation);
        joint.node.position.rotateByQuaternionToRef(joint.parent.rotation, tmpA);
        joint.parent.position.addToRef(tmpA, joint.position);
      } else {
        joint.rotation.copyFrom(local);
        joint.position.copyFrom(joint.node.position);
      }
    }
  }

  position(name: RigJoint): Vector3 | null {
    return this.joints.get(name)?.position ?? null;
  }

  rotation(name: RigJoint): Quaternion | null {
    return this.joints.get(name)?.rotation ?? null;
  }

  node(name: RigJoint): TransformNode | null {
    return this.joints.get(name)?.node ?? null;
  }

  /** Applies an armature-space rotation to a joint (children follow after refresh). */
  rotateWorld(name: RigJoint, delta: Quaternion): void {
    const joint = this.joints.get(name);
    if (!joint) return;
    delta.multiplyToRef(joint.rotation, tmpQ);
    this.setWorldRotation(name, tmpQ);
  }

  /** Sets a joint's armature-space rotation (local = parent^-1 * world). */
  setWorldRotation(name: RigJoint, world: Quaternion): void {
    const joint = this.joints.get(name);
    if (!joint) return;
    const local = joint.node.rotationQuaternion;
    if (!local) return;
    if (joint.parent) {
      Quaternion.InverseToRef(joint.parent.rotation, tmpQ2);
      tmpQ2.multiplyToRef(world, local);
    } else {
      local.copyFrom(world);
    }
    local.normalize();
    joint.rotation.copyFrom(world);
  }

  /**
   * Analytic two-bone IK (upper → mid → end) towards `target` with the mid
   * joint bending towards `pole`. `blend` slerps from the animated pose.
   * Call refresh() before; descendants are refreshed by the next refresh().
   */
  solveTwoBone(upper: RigJoint, mid: RigJoint, end: RigJoint, target: Vector3, pole: Vector3, blend: number): void {
    if (blend <= 0.001) return;
    const a = this.joints.get(upper);
    const b = this.joints.get(mid);
    const c = this.joints.get(end);
    if (!a || !b || !c) return;
    const upperLocalBefore = a.node.rotationQuaternion?.clone();
    const midLocalBefore = b.node.rotationQuaternion?.clone();
    if (!upperLocalBefore || !midLocalBefore) return;

    const lengthA = Vector3.Distance(a.position, b.position);
    const lengthB = Vector3.Distance(b.position, c.position);
    target.subtractToRef(a.position, tmpA);
    let distance = tmpA.length();
    if (distance < 1e-5) return;
    tmpA.scaleInPlace(1 / distance);
    distance = Math.min(Math.max(distance, Math.abs(lengthA - lengthB) + 1e-4), lengthA + lengthB - 1e-4);
    // Bend plane: direction to target and the pole projected off it.
    pole.subtractToRef(tmpA.scale(Vector3.Dot(pole, tmpA)), tmpB);
    if (tmpB.lengthSquared() < 1e-8) tmpB.set(0, -1, 0);
    tmpB.normalize();
    const along = (lengthA * lengthA - lengthB * lengthB + distance * distance) / (2 * distance);
    const height = Math.sqrt(Math.max(0, lengthA * lengthA - along * along));
    const elbow = a.position.add(tmpA.scale(along)).addInPlace(tmpB.scale(height));

    // Upper bone: point at the solved elbow.
    b.position.subtractToRef(a.position, tmpC).normalize();
    const wanted = elbow.subtract(a.position).normalize();
    fromTo(tmpC, wanted, tmpQ);
    const upperWorld = tmpQ.multiply(a.rotation);
    this.setWorldRotation(upper, upperWorld);
    // Mid joint world after the upper change.
    const midWorld = upperWorld.multiply(b.node.rotationQuaternion ?? Quaternion.Identity());
    const endLocalOffset = c.node.position.rotateByQuaternionToRef(midWorld, new Vector3());
    const endDir = endLocalOffset.normalize();
    const reach = target.subtract(elbow);
    if (reach.lengthSquared() > 1e-10) {
      reach.normalize();
      fromTo(endDir, reach, tmpQ);
      const midWanted = tmpQ.multiply(midWorld);
      Quaternion.InverseToRef(upperWorld, tmpQ2);
      const midLocal = b.node.rotationQuaternion;
      if (midLocal) tmpQ2.multiplyToRef(midWanted, midLocal);
      midLocal?.normalize();
    }
    if (blend < 0.999) {
      const upperLocal = a.node.rotationQuaternion;
      const midLocal = b.node.rotationQuaternion;
      if (upperLocal) Quaternion.SlerpToRef(upperLocalBefore, upperLocal, blend, upperLocal);
      if (midLocal) Quaternion.SlerpToRef(midLocalBefore, midLocal, blend, midLocal);
    }
  }

  /**
   * Orients a hand so its finger direction (wrist → middle knuckle) points
   * along `fingers` and the thumb leans towards `thumb` (armature space).
   */
  orientHand(
    hand: RigJoint,
    middle: RigJoint,
    thumbJoint: RigJoint,
    fingers: Vector3,
    thumb: Vector3,
    blend: number,
    forearm?: RigJoint,
  ): void {
    if (blend <= 0.001) return;
    const h = this.joints.get(hand);
    const m = this.joints.get(middle);
    const t = this.joints.get(thumbJoint);
    if (!h || !m || !t) return;
    if (forearm) this.shareWristTwist(hand, middle, thumbJoint, forearm, fingers, thumb, blend);
    const before = h.node.rotationQuaternion?.clone();
    if (!before) return;
    // Current directions from the joints' local offsets (independent of refresh order).
    const fingerNow = m.node.position.rotateByQuaternionToRef(h.rotation, new Vector3()).normalize();
    fromTo(fingerNow, fingers, tmpQ);
    const aligned = tmpQ.multiply(h.rotation);
    const thumbNow = t.node.position.rotateByQuaternionToRef(aligned, new Vector3());
    // Twist about the finger axis so the thumb points as close to `thumb` as possible.
    const axis = fingers;
    const thumbFlat = thumbNow.subtract(axis.scale(Vector3.Dot(thumbNow, axis)));
    const wantFlat = thumb.subtract(axis.scale(Vector3.Dot(thumb, axis)));
    let world = aligned;
    if (thumbFlat.lengthSquared() > 1e-8 && wantFlat.lengthSquared() > 1e-8) {
      thumbFlat.normalize();
      wantFlat.normalize();
      fromTo(thumbFlat, wantFlat, tmpQ);
      world = tmpQ.multiply(aligned);
    }
    this.setWorldRotation(hand, world);
    if (blend < 0.999) {
      const local = h.node.rotationQuaternion;
      if (local) Quaternion.SlerpToRef(before, local, blend, local);
    }
  }

  /** Wanted hand world rotation (same maths as orientHand, without applying it). */
  private wantedHand(h: JointState, m: JointState, t: JointState, fingers: Vector3, thumb: Vector3): Quaternion {
    const fingerNow = m.node.position.rotateByQuaternionToRef(h.rotation, new Vector3()).normalize();
    const align = Quaternion.FromUnitVectorsToRef(fingerNow, fingers, new Quaternion());
    const aligned = align.multiply(h.rotation);
    const thumbNow = t.node.position.rotateByQuaternionToRef(aligned, new Vector3());
    const thumbFlat = thumbNow.subtract(fingers.scale(Vector3.Dot(thumbNow, fingers)));
    const wantFlat = thumb.subtract(fingers.scale(Vector3.Dot(thumb, fingers)));
    if (thumbFlat.lengthSquared() < 1e-8 || wantFlat.lengthSquared() < 1e-8) return aligned;
    return Quaternion.FromUnitVectorsToRef(thumbFlat.normalize(), wantFlat.normalize(), new Quaternion()).multiply(aligned);
  }

  /**
   * There are no twist bones: move half of the wrist's twist (about the
   * forearm axis) into the forearm so linear skinning does not pinch the
   * wrist into a candy wrapper. The twist is unwrapped against last frame's,
   * so a hold whose twist passes ±180° does not flip the forearm's half from
   * +90° to -90° in one frame; the forearm's share is capped at ±80°.
   */
  private shareWristTwist(
    hand: RigJoint,
    middle: RigJoint,
    thumbJoint: RigJoint,
    forearm: RigJoint,
    fingers: Vector3,
    thumb: Vector3,
    blend: number,
  ): void {
    const h = this.joints.get(hand);
    const m = this.joints.get(middle);
    const t = this.joints.get(thumbJoint);
    const f = this.joints.get(forearm);
    if (!h || !m || !t || !f) return;
    const axis = h.position.subtract(f.position);
    if (axis.lengthSquared() < 1e-8) return;
    axis.normalize();
    const wanted = this.wantedHand(h, m, t, fingers, thumb);
    const delta = wanted.multiply(Quaternion.Inverse(h.rotation));
    // Swing-twist: the twist part is the rotation's projection on the axis.
    const projection = axis.scale(delta.x * axis.x + delta.y * axis.y + delta.z * axis.z);
    const twist = new Quaternion(projection.x, projection.y, projection.z, delta.w);
    if (twist.lengthSquared() < 1e-10) return;
    twist.normalize();
    const angle = 2 * Math.atan2(Math.hypot(twist.x, twist.y, twist.z), twist.w);
    const sign = Math.sign(twist.x * axis.x + twist.y * axis.y + twist.z * axis.z) || 1;
    let signed = angle * sign;
    if (signed > Math.PI) signed -= Math.PI * 2;
    if (signed < -Math.PI) signed += Math.PI * 2;
    const previous = this.twists.get(forearm);
    if (previous !== undefined) {
      signed += Math.round((previous - signed) / (Math.PI * 2)) * Math.PI * 2;
      // More than a turn and a half wound up: fall back to the principal angle.
      if (Math.abs(signed) > Math.PI * 1.5) signed -= Math.sign(signed) * Math.PI * 2;
    }
    this.twists.set(forearm, signed);
    const share = Math.max(-MAX_FOREARM_TWIST, Math.min(MAX_FOREARM_TWIST, 0.5 * signed));
    this.rotateWorld(forearm, Quaternion.RotationAxis(axis, share * blend));
    this.refresh();
  }
}
