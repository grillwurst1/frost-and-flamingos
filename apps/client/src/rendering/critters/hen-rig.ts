import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { CritterBehaviour } from '@frost-and-flamingos/shared';

/**
 * Pose solver for the owner's Meshy hen (a "Quadruped Dog" rig: Hips; chest
 * → head; backleg chains = the two legs; frontleg chains sit inside the body
 * sides and drive the wings; tail chain = tail feathers).
 *
 * Base layer: the baked walk clip, played at a rate matched to the ground
 * speed and blended toward a neutral standing frame when the hen stops.
 * Procedural layers on top, all in armature space and derived from the
 * skeleton itself (no hard-coded bone axes): body pitch, peck (chest + head
 * dip with quick strikes), scratch (alternating backward leg kicks), look
 * (jerky head turns and tilts, like a real hen's head stabilisation), flee
 * (nose-down sprint posture, flapping wings, tail up) and air (spread wings,
 * tucked legs). Everything is plain quaternion maths on the cloned joint
 * nodes, no allocations per frame.
 */

/** Structural subset of package 3C's baked clip (glb/library.ts BakedClip). */
export interface HenClip {
  duration: number;
  frames: number;
  bones: readonly string[];
  /** frames × bones × (x, y, z, w) local rotations. */
  rotations: Float32Array;
  /** frames × (x, y, z) hips translation, or null. */
  hips: Float32Array | null;
}

export interface HenRigPose {
  speed: number;
  behaviour: CritterBehaviour;
  airborne: boolean;
  verticalSpeed: number;
}

interface Joint {
  name: string;
  node: TransformNode;
  parent: Joint | null;
  /** Local bind/neutral data. */
  bindRotation: Quaternion;
  bindPosition: Vector3;
  /** Track index in the walk clip, or -1. */
  track: number;
  /** Held at the standing frame instead of following the clip (the dog-rig front legs). */
  hold: boolean;
  /** Armature-space transform after the last solve. */
  world: Quaternion;
  position: Vector3;
}

/** Pose layer amplitudes (radians). */
export const HEN_POSE = {
  // Tuned headlessly against the skinned mesh: the beak reaches ~4-6 cm above
  // the ground and stays below the comb (the head is never flipped over).
  peckBody: 0.6,
  peckNeck: 0.75,
  peckHead: 0.3,
  peckStrike: 0.3,
  fleeBody: 0.3,
  fleeNeck: 0.22,
  fleeHead: -0.15,
  wingRest: 0.22,
  wingBeat: 0.5,
  wingAir: 0.3,
  scratchKick: 0.75,
  tailUp: 0.45,
};

/**
 * Ground speed (m/s at the game scale) at which the walk clip plays at 1×:
 * measured headlessly, a foot stays planted for 0.63 s of the 1 s cycle while
 * the body passes 0.18 m over it.
 */
export const HEN_NATURAL_WALK_SPEED = 0.29;
/** A fleeing hen scurries; above this rate the feet may slide a little. */
const MAX_GAIT_RATE = 5;

const tmpQ = new Quaternion();
const tmpQ2 = new Quaternion();
const tmpV = new Vector3();
const tmpV2 = new Vector3();
const tmpOut = new Vector3();
const tmpBack = new Vector3();

function approach(current: number, target: number, rate: number, delta: number): number {
  return current + (target - current) * (1 - Math.exp(-rate * delta));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export class HenRig {
  private readonly joints: Joint[] = [];
  private readonly byName = new Map<string, Joint>();
  private readonly clip: HenClip | null;
  /** Frame used for standing still (both feet planted, closest together). */
  neutralFrame = 0;
  /** Armature-space axes derived from the skeleton. */
  private readonly up = new Vector3(0, 1, 0);
  private readonly forward = new Vector3(0, 0, 1);
  /** Rotating by +angle about this axis lowers the head (nose down). */
  private readonly pitchAxis = new Vector3(1, 0, 0);
  private readonly hipsBind = new Vector3();
  /**
   * The Meshy clip also scales Hips (×0.61) and lowers it to match, and the
   * loader re-centres the hips path for Y-up rigs; only rotations and that
   * path are baked. So the hips keep their rest translation plus the clip's
   * small bob around its mean, which is right however the path was shifted.
   */
  private readonly hipsMean = new Vector3();
  // Animation state.
  private phase = Math.random();
  private time = Math.random() * 10;
  private gait = 0;
  private peck = 0;
  private scratch = 0;
  private look = 0;
  private flee = 0;
  private air = 0;
  private headYaw = 0;
  private headYawTarget = 0;
  private headTilt = 0;
  private headTiltTarget = 0;
  private nextGlanceAt = 0;
  private peckClock = Math.random();
  private scratchClock = 0;
  private flapClock = Math.random();

  /**
   * @param nodes   cloned joint nodes by normalised name
   * @param parents parent joint names (null for the root)
   * @param up      world up expressed in armature space (unit)
   */
  constructor(nodes: ReadonlyMap<string, TransformNode>, parents: ReadonlyMap<string, string | null>, clip: HenClip | null, up: Vector3) {
    this.clip = clip;
    const depth = (name: string): number => {
      let count = 0;
      for (let parent = parents.get(name) ?? null; parent; parent = parents.get(parent) ?? null) count += 1;
      return count;
    };
    const ordered = [...nodes.keys()].filter((name) => parents.has(name)).sort((a, b) => depth(a) - depth(b));
    for (const name of ordered) {
      const node = nodes.get(name);
      if (!node) continue;
      if (!node.rotationQuaternion) node.rotationQuaternion = Quaternion.FromEulerVector(node.rotation);
      const parentName = parents.get(name) ?? null;
      const joint: Joint = {
        name,
        node,
        parent: parentName ? this.byName.get(parentName) ?? null : null,
        bindRotation: node.rotationQuaternion.clone(),
        bindPosition: node.position.clone(),
        track: clip ? clip.bones.indexOf(name) : -1,
        // The hen has no front legs: these chains sit inside the breast and
        // sides, so they follow the wing layer only.
        hold: name.startsWith('frontleg') || name.startsWith('R_frontleg'),
        world: new Quaternion(),
        position: new Vector3(),
      };
      this.joints.push(joint);
      this.byName.set(name, joint);
    }
    this.hipsBind.copyFrom(this.byName.get('Hips')?.bindPosition ?? Vector3.Zero());
    this.up.copyFrom(up).normalize();
    if (clip?.hips && clip.frames > 0) {
      for (let frame = 0; frame < clip.frames; frame += 1) {
        this.hipsMean.x += clip.hips[frame * 3] ?? 0;
        this.hipsMean.y += clip.hips[frame * 3 + 1] ?? 0;
        this.hipsMean.z += clip.hips[frame * 3 + 2] ?? 0;
      }
      this.hipsMean.scaleInPlace(1 / clip.frames);
    }
    this.neutralFrame = this.findNeutralFrame();
    this.applyFrame(this.neutralFrame, this.neutralFrame, 0);
    this.solve();
    this.calibrateAxes();
  }

  /** The joint's armature-space position after the last solve. */
  jointPosition(name: string): Vector3 | null {
    return this.byName.get(name)?.position ?? null;
  }

  get upAxis(): Vector3 {
    return this.up;
  }

  get forwardAxis(): Vector3 {
    return this.forward;
  }

  /** Forward kinematics in armature space (parents first). */
  private solve(): void {
    for (const joint of this.joints) {
      const local = joint.node.rotationQuaternion ?? Quaternion.Identity();
      const parent = joint.parent;
      if (parent) {
        parent.world.multiplyToRef(local, joint.world);
        joint.node.position.rotateByQuaternionToRef(parent.world, tmpV);
        parent.position.addToRef(tmpV, joint.position);
      } else {
        joint.world.copyFrom(local);
        joint.position.copyFrom(joint.node.position);
      }
    }
  }

  /** Writes the clip pose (blended between two frames) into the joint nodes. */
  private applyFrame(frameA: number, frameB: number, mix: number): void {
    const clip = this.clip;
    for (const joint of this.joints) {
      const rotation = joint.node.rotationQuaternion;
      if (!rotation) continue;
      if (!clip || joint.track < 0) {
        rotation.copyFrom(joint.bindRotation);
        continue;
      }
      const count = clip.bones.length;
      const a = ((joint.hold ? this.neutralFrame : frameA) * count + joint.track) * 4;
      const b = ((joint.hold ? this.neutralFrame : frameB) * count + joint.track) * 4;
      tmpQ.set(clip.rotations[a] ?? 0, clip.rotations[a + 1] ?? 0, clip.rotations[a + 2] ?? 0, clip.rotations[a + 3] ?? 1);
      tmpQ2.set(clip.rotations[b] ?? 0, clip.rotations[b + 1] ?? 0, clip.rotations[b + 2] ?? 0, clip.rotations[b + 3] ?? 1);
      Quaternion.SlerpToRef(tmpQ, tmpQ2, mix, rotation);
    }
    const hips = this.byName.get('Hips');
    if (hips && clip?.hips) {
      const a = frameA * 3;
      const b = frameB * 3;
      this.hipsAt(
        (clip.hips[a] ?? 0) + ((clip.hips[b] ?? 0) - (clip.hips[a] ?? 0)) * mix,
        (clip.hips[a + 1] ?? 0) + ((clip.hips[b + 1] ?? 0) - (clip.hips[a + 1] ?? 0)) * mix,
        (clip.hips[a + 2] ?? 0) + ((clip.hips[b + 2] ?? 0) - (clip.hips[a + 2] ?? 0)) * mix,
        hips.node.position,
      );
    }
  }

  /** Rest hips plus the clip's bob around its mean. */
  private hipsAt(x: number, y: number, z: number, result: Vector3): void {
    result.set(
      this.hipsBind.x + x - this.hipsMean.x,
      this.hipsBind.y + y - this.hipsMean.y,
      this.hipsBind.z + z - this.hipsMean.z,
    );
  }

  /** The walk frame with both feet lowest and closest together (a standing pose). */
  private findNeutralFrame(): number {
    const clip = this.clip;
    if (!clip) return 0;
    const forward = this.forwardFromSkeleton();
    let best = 0;
    let bestScore = Number.POSITIVE_INFINITY;
    for (let frame = 0; frame < clip.frames - 1; frame += 1) {
      this.applyFrame(frame, frame, 0);
      this.solve();
      const left = this.byName.get('backleg2')?.position;
      const right = this.byName.get('R_backleg2')?.position;
      if (!left || !right) return 0;
      const spread = Math.abs(Vector3.Dot(left.subtract(right), forward));
      const lift = Math.max(Vector3.Dot(left, this.up), Vector3.Dot(right, this.up));
      const score = spread + lift * 0.5;
      if (score < bestScore) {
        bestScore = score;
        best = frame;
      }
    }
    return best;
  }

  /** Facing from the skeleton: hips toward the head, flattened onto the ground plane. */
  private forwardFromSkeleton(): Vector3 {
    this.solve();
    const head = this.byName.get('head')?.position ?? Vector3.Zero();
    const hips = this.byName.get('Hips')?.position ?? Vector3.Zero();
    const direction = head.subtract(hips);
    direction.subtractInPlace(this.up.scale(Vector3.Dot(direction, this.up)));
    if (direction.lengthSquared() < 1e-12) return new Vector3(0, 0, 1);
    return direction.normalize();
  }

  private calibrateAxes(): void {
    this.forward.copyFrom(this.forwardFromSkeleton());
    Vector3.CrossToRef(this.up, this.forward, this.pitchAxis);
    this.pitchAxis.normalize();
    // Pick the sign for which a positive pitch moves the head down.
    const hips = this.byName.get('Hips')?.position ?? Vector3.Zero();
    const head = this.byName.get('head')?.position ?? Vector3.Zero();
    head.subtractToRef(hips, tmpV);
    Quaternion.RotationAxisToRef(this.pitchAxis, 0.3, tmpQ);
    tmpV.rotateByQuaternionToRef(tmpQ, tmpV2);
    if (Vector3.Dot(tmpV2, this.up) > Vector3.Dot(tmpV, this.up)) this.pitchAxis.scaleInPlace(-1);
  }

  /** Rotates one joint by an armature-space delta (children follow on the next solve). */
  private rotateWorld(name: string, axis: Vector3, angle: number): void {
    const joint = this.byName.get(name);
    if (!joint || Math.abs(angle) < 1e-5) return;
    Quaternion.RotationAxisToRef(axis, angle, tmpQ);
    tmpQ.multiplyToRef(joint.world, tmpQ2);
    const parentWorld = joint.parent?.world;
    const local = joint.node.rotationQuaternion;
    if (!local) return;
    if (parentWorld) {
      Quaternion.InverseToRef(parentWorld, tmpQ);
      tmpQ.multiplyToRef(tmpQ2, local);
    } else {
      local.copyFrom(tmpQ2);
    }
    joint.world.copyFrom(tmpQ2);
  }

  /**
   * Swings a joint so the direction to one of its descendants tilts toward
   * `direction` by `angle` (rotation in the plane of the two vectors).
   */
  private swing(name: string, tip: string, direction: Vector3, angle: number): void {
    const joint = this.byName.get(name);
    const end = this.byName.get(tip);
    if (!joint || !end || Math.abs(angle) < 1e-5) return;
    end.position.subtractToRef(joint.position, tmpV);
    Vector3.CrossToRef(tmpV, direction, tmpV2);
    if (tmpV2.lengthSquared() < 1e-14) return;
    tmpV2.normalize();
    this.rotateWorld(name, tmpV2, angle);
  }

  update(delta: number, pose: HenRigPose): void {
    const dt = Math.min(0.1, Math.max(0, delta));
    this.time += dt;
    const behaviour = pose.behaviour;
    const fleeing = behaviour === 'flee';

    // Layer weights.
    this.gait = approach(this.gait, smoothstep(0.03, 0.22, pose.speed), 10, dt);
    this.peck = approach(this.peck, behaviour === 'peck' ? 1 : 0, 6, dt);
    this.scratch = approach(this.scratch, behaviour === 'scratch' ? 1 : 0, 7, dt);
    this.look = approach(this.look, behaviour === 'look' || behaviour === 'idle' ? 1 : 0.25, 5, dt);
    this.flee = approach(this.flee, fleeing ? 1 : 0, 9, dt);
    this.air = approach(this.air, pose.airborne ? 1 : 0, 14, dt);

    // Base: walk clip at the ground-speed rate, blended toward the standing frame.
    const clip = this.clip;
    if (clip && clip.frames > 1) {
      const rate = Math.min(MAX_GAIT_RATE, pose.speed / HEN_NATURAL_WALK_SPEED);
      this.phase = (this.phase + (dt * rate) / Math.max(0.05, clip.duration)) % 1;
      const position = this.phase * (clip.frames - 1);
      const frameA = Math.floor(position);
      const frameB = Math.min(clip.frames - 1, frameA + 1);
      this.applyFrame(frameA, frameB, position - frameA);
      if (this.gait < 0.999) this.blendTowardNeutral(1 - this.gait);
    } else {
      this.applyFrame(0, 0, 0);
    }
    this.solve();

    // Peck rhythm: down for most of a cycle with two or three quick strikes, then a look up.
    let peckDown = 0;
    let strike = 0;
    if (this.peck > 0.01) {
      this.peckClock += dt * 1.15;
      const cycle = this.peckClock % 1;
      peckDown = smoothstep(0.02, 0.16, cycle) * (1 - smoothstep(0.72, 0.86, cycle));
      strike = Math.max(0, Math.sin(cycle * Math.PI * 2 * 3.2)) ** 2;
    }

    // Body posture: sprinting nose-down, tipping forward to peck. The legs
    // counter-rotate so they stay under the body.
    const breathe = Math.sin(this.time * 2.4) * 0.025;
    const bodyPitch =
      this.flee * HEN_POSE.fleeBody + this.peck * (0.08 + peckDown * HEN_POSE.peckBody) + this.scratch * 0.1 - this.air * 0.16 + breathe;
    this.rotateWorld('Hips', this.pitchAxis, bodyPitch);
    this.solve();
    this.rotateWorld('backleg', this.pitchAxis, -bodyPitch * 0.85);
    this.rotateWorld('R_backleg', this.pitchAxis, -bodyPitch * 0.85);
    this.solve();

    // Scratch: alternating backward kicks with a little hop of the body.
    if (this.scratch > 0.01) {
      this.scratchClock += dt * 2.2;
      const half = this.scratchClock % 1;
      const kick = Math.sin(Math.min(1, (half % 0.5) / 0.32) * Math.PI) * HEN_POSE.scratchKick * this.scratch;
      const leg = half < 0.5 ? 'backleg' : 'R_backleg';
      const foot = half < 0.5 ? 'backleg2' : 'R_backleg2';
      this.forward.scaleToRef(-1, tmpBack);
      this.swing(leg, foot, tmpBack, kick);
      this.solve();
    }

    // Air: legs tucked forward under the body.
    if (this.air > 0.01) {
      for (const [leg, foot] of [
        ['backleg', 'backleg2'],
        ['R_backleg', 'R_backleg2'],
      ] as const) {
        this.swing(leg, foot, this.forward, 0.55 * this.air);
      }
      this.solve();
    }

    // Neck and head: peck strikes, sprint stretch, jerky glances.
    const neckDip = this.flee * HEN_POSE.fleeNeck + this.peck * peckDown * HEN_POSE.peckNeck;
    const headDip =
      this.flee * HEN_POSE.fleeHead + this.peck * (peckDown * (HEN_POSE.peckHead + strike * HEN_POSE.peckStrike) - (1 - peckDown) * 0.1);
    if (this.time >= this.nextGlanceAt) {
      // Hens hold the head still, then snap it to a new angle.
      const busy = this.peck > 0.5 || this.scratch > 0.5;
      this.nextGlanceAt = this.time + (busy ? 0.9 : 0.35) + Math.random() * (busy ? 1.2 : 0.8);
      const range = fleeing ? 0.25 : 0.25 + this.look * 0.75;
      this.headYawTarget = (Math.random() * 2 - 1) * range;
      this.headTiltTarget = (Math.random() * 2 - 1) * 0.35 * this.look;
    }
    this.headYaw = approach(this.headYaw, this.headYawTarget, 22, dt);
    this.headTilt = approach(this.headTilt, this.headTiltTarget, 18, dt);
    this.rotateWorld('chest', this.pitchAxis, neckDip);
    this.solve();
    this.rotateWorld('head', this.pitchAxis, headDip);
    this.rotateWorld('head', this.up, this.headYaw);
    this.solve();
    this.rotateWorld('head', this.forward, this.headTilt);
    this.solve();

    // Wings: the frontleg chains inside the body sides swing out and up.
    const flap = Math.max(this.flee, this.air);
    if (flap > 0.01) {
      this.flapClock += dt * (8.5 + this.air * 2);
      const beat = 0.5 + 0.5 * Math.sin(this.flapClock * Math.PI * 2);
      const angle = flap * (HEN_POSE.wingRest + beat * (HEN_POSE.wingBeat + this.air * HEN_POSE.wingAir));
      for (const [wing, tip] of [
        ['frontleg', 'frontleg1'],
        ['R_frontleg', 'R_frontleg1'],
      ] as const) {
        const root = this.byName.get(wing)?.position;
        const hips = this.byName.get('Hips')?.position;
        if (!root || !hips) continue;
        // Outward = away from the body centre line, plus up.
        root.subtractToRef(hips, tmpOut);
        const along = Vector3.Dot(tmpOut, this.forward);
        const rise = Vector3.Dot(tmpOut, this.up);
        tmpOut.x -= this.forward.x * along + this.up.x * rise;
        tmpOut.y -= this.forward.y * along + this.up.y * rise;
        tmpOut.z -= this.forward.z * along + this.up.z * rise;
        if (tmpOut.lengthSquared() < 1e-14) continue;
        tmpOut.normalize();
        tmpOut.x += this.up.x * 0.6;
        tmpOut.y += this.up.y * 0.6;
        tmpOut.z += this.up.z * 0.6;
        tmpOut.normalize();
        this.swing(wing, tip, tmpOut, angle);
      }
      this.solve();
    }

    // Tail feathers cock up when alarmed.
    const tailUp = this.flee * HEN_POSE.tailUp + this.air * 0.2;
    if (tailUp > 0.01) {
      this.swing('tailstart', 'tail3', this.up, tailUp);
      this.solve();
    }
  }

  /** Blends every joint toward the neutral standing frame by `weight`. */
  private blendTowardNeutral(weight: number): void {
    const clip = this.clip;
    if (!clip) return;
    const count = clip.bones.length;
    for (const joint of this.joints) {
      const rotation = joint.node.rotationQuaternion;
      if (!rotation || joint.track < 0) continue;
      const offset = (this.neutralFrame * count + joint.track) * 4;
      tmpQ.set(clip.rotations[offset] ?? 0, clip.rotations[offset + 1] ?? 0, clip.rotations[offset + 2] ?? 0, clip.rotations[offset + 3] ?? 1);
      Quaternion.SlerpToRef(rotation, tmpQ, weight, rotation);
    }
    const hips = this.byName.get('Hips');
    if (hips && clip.hips) {
      const offset = this.neutralFrame * 3;
      this.hipsAt(clip.hips[offset] ?? 0, clip.hips[offset + 1] ?? 0, clip.hips[offset + 2] ?? 0, tmpV);
      Vector3.LerpToRef(hips.node.position, tmpV, weight, hips.node.position);
    }
  }
}
