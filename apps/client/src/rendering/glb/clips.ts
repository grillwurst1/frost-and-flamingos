import type { Animation } from '@babylonjs/core/Animations/animation';
import type { AnimationGroup } from '@babylonjs/core/Animations/animationGroup';
import type { Skeleton } from '@babylonjs/core/Bones/skeleton';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';

/**
 * Animation clip maths shared by the runtime loader (glb/library.ts) and the
 * offline clip bake of `bun run models` (glb/offline-bake.ts): dense 30 Hz
 * clip tables, root-motion stripping and the Mixamo-to-Mixamo retarget. The
 * offline bake runs exactly this code under a Babylon NullEngine, so a clip a
 * model borrows is bit-for-bit what the runtime retarget used to produce.
 */
export interface BindPose {
  position: Vector3;
  rotation: Quaternion;
  scaling: Vector3;
}

/** Normalised Mixamo joint name ("mixamorig:LeftArm" -> "LeftArm"). */
export function jointName(name: string): string {
  const colon = name.lastIndexOf(':');
  return colon >= 0 ? name.slice(colon + 1) : name;
}

export const BAKE_FPS = 30;

/** One animation clip baked to a dense table, bound to joints by name. */
export interface BakedClip {
  name: string;
  /** Seconds. */
  duration: number;
  frames: number;
  /** Normalised joint names, one rotation track each. */
  bones: readonly string[];
  /** frames × bones × (x, y, z, w) local rotations. */
  rotations: Float32Array;
  /** frames × (x, y, z) hips translation, or null. */
  hips: Float32Array | null;
  /** Model the clip was retargeted from, or null when native. */
  retargetedFrom: string | null;
  /** Time (s) with the highest hips: the apex of a jump. */
  apexTime: number;
  /**
   * Normalised phase (0..1) of the left foot's lowest point (its contact),
   * so locomotion cycles can share one phase in step. 0 when unknown.
   */
  contactPhase?: number;
}

/**
 * Phase of the left foot's lowest point over a looping clip, by forward
 * kinematics of Hips → LeftUpLeg → LeftLeg → LeftFoot in armature space.
 */
export function leftFootContactPhase(clip: BakedClip, rig: RigInfo): number {
  const chain = ['Hips', 'LeftUpLeg', 'LeftLeg', 'LeftFoot'];
  const index = new Map<string, number>();
  clip.bones.forEach((bone, i) => index.set(bone, i));
  const local = new Quaternion();
  let lowest = Infinity;
  let lowestFrame = 0;
  for (let frame = 0; frame < clip.frames; frame += 1) {
    let rotation = Quaternion.Identity();
    let position = Vector3.Zero();
    for (const joint of chain) {
      const bind = rig.bindPose.get(joint);
      if (!bind) return 0;
      let offset = bind.position;
      if (joint === 'Hips' && clip.hips) {
        offset = new Vector3(clip.hips[frame * 3] ?? 0, clip.hips[frame * 3 + 1] ?? 0, clip.hips[frame * 3 + 2] ?? 0);
      }
      position = position.add(offset.rotateByQuaternionToRef(rotation, new Vector3()));
      const bone = index.get(joint);
      if (bone === undefined) {
        local.copyFrom(bind.rotation);
      } else {
        const o = (frame * clip.bones.length + bone) * 4;
        local.set(clip.rotations[o] ?? 0, clip.rotations[o + 1] ?? 0, clip.rotations[o + 2] ?? 0, clip.rotations[o + 3] ?? 1);
      }
      rotation = rotation.multiply(local);
    }
    if (position.y < lowest) {
      lowest = position.y;
      lowestFrame = frame;
    }
  }
  return clip.frames > 1 ? lowestFrame / (clip.frames - 1) : 0;
}

/** Bind pose and hierarchy of a Mixamo skeleton, by normalised joint name. */
export interface RigInfo {
  /** Local bind pose per joint (from the inverse bind matrices). */
  bindPose: ReadonlyMap<string, BindPose>;
  /** Bind-pose position (armature space) per joint. */
  bindPositions: ReadonlyMap<string, Vector3>;
  /** Parent joint; null for the skeleton root. */
  jointParents: ReadonlyMap<string, string | null>;
}

export function readRig(skeleton: Skeleton | null): RigInfo {
  const bindPose = new Map<string, BindPose>();
  const bindPositions = new Map<string, Vector3>();
  const jointParents = new Map<string, string | null>();
  for (const bone of skeleton?.bones ?? []) {
    const node = bone.getTransformNode();
    if (!node) continue;
    const name = jointName(node.name);
    const scaling = new Vector3();
    const rotation = new Quaternion();
    const position = new Vector3();
    bone.getBindMatrix().decompose(scaling, rotation, position);
    bindPose.set(name, { position, rotation, scaling });
    bindPositions.set(name, Matrix.Invert(bone.getAbsoluteInverseBindMatrix()).getTranslation());
    const parent = bone.getParent()?.getTransformNode();
    jointParents.set(name, parent ? jointName(parent.name) : null);
  }
  return { bindPose, bindPositions, jointParents };
}

export function apexOf(clip: Omit<BakedClip, 'apexTime'>): number {
  if (!clip.hips) return 0;
  let best = 0;
  let bestY = -Infinity;
  for (let frame = 0; frame < clip.frames; frame += 1) {
    const y = clip.hips[frame * 3 + 1] ?? 0;
    if (y > bestY) {
      bestY = y;
      best = frame;
    }
  }
  return best / BAKE_FPS;
}

/** Samples a Babylon animation group (glTF clip) into a dense 30 Hz table. */
export function bakeAnimationGroup(group: AnimationGroup, bindPose: ReadonlyMap<string, BindPose>): BakedClip {
  const tracks: Array<{ bone: string; property: string; animation: Animation }> = [];
  for (const targeted of group.targetedAnimations) {
    const target = targeted.target as TransformNode | null;
    if (!target) continue;
    tracks.push({ bone: jointName(target.name), property: targeted.animation.targetProperty, animation: targeted.animation });
  }
  const name = group.name;
  const fps = tracks[0]?.animation.framePerSecond ?? 60;
  const from = group.from;
  const to = group.to;
  const duration = Math.max(1 / BAKE_FPS, (to - from) / fps);
  const frames = Math.max(2, Math.round(duration * BAKE_FPS) + 1);
  const rotationTracks = tracks.filter((track) => track.property === 'rotationQuaternion');
  const bones = rotationTracks.map((track) => track.bone);
  const rotations = new Float32Array(frames * bones.length * 4);
  const hipsTrack = tracks.find((track) => track.bone === 'Hips' && track.property === 'position') ?? null;
  const hips = hipsTrack ? new Float32Array(frames * 3) : null;
  for (let frame = 0; frame < frames; frame += 1) {
    const sourceFrame = Math.min(to, from + (frame / BAKE_FPS) * fps);
    for (let bone = 0; bone < rotationTracks.length; bone += 1) {
      const track = rotationTracks[bone];
      const value = (track?.animation.evaluate(sourceFrame) as Quaternion | undefined) ??
        bindPose.get(track?.bone ?? '')?.rotation ?? Quaternion.Identity();
      const offset = (frame * bones.length + bone) * 4;
      rotations[offset] = value.x;
      rotations[offset + 1] = value.y;
      rotations[offset + 2] = value.z;
      rotations[offset + 3] = value.w;
    }
    if (hips && hipsTrack) {
      const value = hipsTrack.animation.evaluate(sourceFrame) as Vector3;
      hips[frame * 3] = value.x;
      hips[frame * 3 + 1] = value.y;
      hips[frame * 3 + 2] = value.z;
    }
  }
  const bindHips = bindPose.get('Hips')?.position;
  if (hips && bindHips) stripRootMotion(name, hips, frames, bindHips);
  const clip = { name, duration, frames, bones, rotations, hips, retargetedFrom: null };
  return { ...clip, apexTime: apexOf(clip) };
}

/**
 * Meshy clips carry travel in the hips (a sprint moves 2.3 m, a swim cycle
 * 3.5-4.3 m). The game moves the character itself, so the horizontal travel
 * is removed (linear drift from first to last frame, re-centred on the bind
 * pose) and swim clips are lifted so the back sits at the water line.
 */
function stripRootMotion(name: string, hips: Float32Array, frames: number, bindHips: Vector3): void {
  const last = Math.max(1, frames - 1);
  const x0 = hips[0] ?? 0;
  const z0 = hips[2] ?? 0;
  const dx = (hips[last * 3] ?? 0) - x0;
  const dz = (hips[last * 3 + 2] ?? 0) - z0;
  let meanY = 0;
  for (let frame = 0; frame < frames; frame += 1) {
    const k = frame / last;
    hips[frame * 3] = (hips[frame * 3] ?? 0) - x0 - k * dx + bindHips.x;
    hips[frame * 3 + 2] = (hips[frame * 3 + 2] ?? 0) - z0 - k * dz + bindHips.z;
    meanY += hips[frame * 3 + 1] ?? 0;
  }
  if (/swim/i.test(name)) {
    const lift = bindHips.y - 0.15 - meanY / frames;
    for (let frame = 0; frame < frames; frame += 1) hips[frame * 3 + 1] = (hips[frame * 3 + 1] ?? 0) + lift;
  }
}

/** Bind-pose rotation of every joint in armature space. */
export function bindWorldRotations(rig: RigInfo): Map<string, Quaternion> {
  const world = new Map<string, Quaternion>();
  const resolve = (name: string): Quaternion => {
    const cached = world.get(name);
    if (cached) return cached;
    const local = rig.bindPose.get(name)?.rotation ?? Quaternion.Identity();
    const parent = rig.jointParents.get(name) ?? null;
    const result = parent ? resolve(parent).multiply(local) : local.clone();
    world.set(name, result);
    return result;
  };
  for (const name of rig.jointParents.keys()) resolve(name);
  return world;
}

/** Bind-pose transform of one joint in armature space (for bone attachments). */
export function bindWorldTransform(rig: RigInfo, joint: string): { rotation: Quaternion; position: Vector3 } | null {
  const position = rig.bindPositions.get(joint);
  if (!position) return null;
  const rotation = bindWorldRotations(rig).get(joint) ?? Quaternion.Identity();
  return { rotation, position: position.clone() };
}

/** Chains to follow when aligning bone directions between rigs. */
const ALIGN_CHAINS: ReadonlyArray<readonly [string, string]> = [
  ['Spine', 'Spine1'],
  ['Spine1', 'Spine2'],
  ['Spine2', 'Neck'],
  ['Neck', 'Head'],
  ...(['Left', 'Right'] as const).flatMap((side) => [
    [`${side}Shoulder`, `${side}Arm`] as const,
    [`${side}Arm`, `${side}ForeArm`] as const,
    [`${side}ForeArm`, `${side}Hand`] as const,
    [`${side}Hand`, `${side}HandMiddle1`] as const,
    [`${side}UpLeg`, `${side}Leg`] as const,
    [`${side}Leg`, `${side}Foot`] as const,
    [`${side}Foot`, `${side}ToeBase`] as const,
  ]),
];

/**
 * Per-bone rotation that turns the target's bind bone direction onto the
 * donor's (A-pose arms vs a T-pose donor are 40-67° apart). Applied in
 * armature space before the donor's motion delta.
 */
function bindAlignment(source: RigInfo, target: RigInfo): Map<string, Quaternion> {
  const align = new Map<string, Quaternion>();
  for (const [bone, child] of ALIGN_CHAINS) {
    const s0 = source.bindPositions.get(bone);
    const s1 = source.bindPositions.get(child);
    const t0 = target.bindPositions.get(bone);
    const t1 = target.bindPositions.get(child);
    if (!s0 || !s1 || !t0 || !t1) continue;
    const from = t1.subtract(t0);
    const to = s1.subtract(s0);
    if (from.lengthSquared() < 1e-8 || to.lengthSquared() < 1e-8) continue;
    align.set(bone, Quaternion.FromUnitVectorsToRef(from.normalize(), to.normalize(), new Quaternion()));
  }
  return align;
}

function depthOf(rig: RigInfo, name: string): number {
  let depth = 0;
  for (let parent = rig.jointParents.get(name) ?? null; parent; parent = rig.jointParents.get(parent) ?? null) depth += 1;
  return depth;
}

/**
 * Transfers a clip between two Mixamo rigs as world-space rotation deltas from
 * each rig's bind pose: D = W_src(t) * W_src_bind^-1, and
 * W_dst = D * A * W_dst_bind, where A first turns the target's bind bone
 * direction onto the donor's. Joints are matched by Mixamo name (missing ones
 * keep their bind pose); hips translation is scaled by the hip-height ratio.
 */
export function retargetClip(source: RigInfo, sourceKey: string, clip: BakedClip, target: RigInfo): BakedClip {
  const sourceBind = bindWorldRotations(source);
  const targetBind = bindWorldRotations(target);
  const align = bindAlignment(source, target);
  const sourceIndex = new Map<string, number>();
  clip.bones.forEach((bone, index) => sourceIndex.set(bone, index));
  const bones = [...target.jointParents.keys()]
    .filter((name) => sourceIndex.has(name))
    .sort((a, b) => depthOf(target, a) - depthOf(target, b));
  const sourceOrder = [...clip.bones].sort((a, b) => depthOf(source, a) - depthOf(source, b));
  const rotations = new Float32Array(clip.frames * bones.length * 4);
  const sourceWorld = new Map<string, Quaternion>();
  const targetWorld = new Map<string, Quaternion>();
  const local = new Quaternion();
  for (let frame = 0; frame < clip.frames; frame += 1) {
    sourceWorld.clear();
    targetWorld.clear();
    for (const bone of sourceOrder) {
      const index = sourceIndex.get(bone) ?? 0;
      const offset = (frame * clip.bones.length + index) * 4;
      local.set(clip.rotations[offset] ?? 0, clip.rotations[offset + 1] ?? 0, clip.rotations[offset + 2] ?? 0, clip.rotations[offset + 3] ?? 1);
      const parent = source.jointParents.get(bone) ?? null;
      const parentWorld = parent ? sourceWorld.get(parent) ?? sourceBind.get(parent) ?? Quaternion.Identity() : Quaternion.Identity();
      sourceWorld.set(bone, parentWorld.multiply(local));
    }
    bones.forEach((bone, index) => {
      const sourceRotation = sourceWorld.get(bone) ?? sourceBind.get(bone) ?? Quaternion.Identity();
      const delta = sourceRotation.multiply(Quaternion.Inverse(sourceBind.get(bone) ?? Quaternion.Identity()));
      const aligned = (align.get(bone) ?? Quaternion.Identity()).multiply(targetBind.get(bone) ?? Quaternion.Identity());
      const targetRotation = delta.multiply(aligned);
      targetWorld.set(bone, targetRotation);
      const parent = target.jointParents.get(bone) ?? null;
      const parentWorld = parent ? targetWorld.get(parent) ?? targetBind.get(parent) ?? Quaternion.Identity() : Quaternion.Identity();
      const result = Quaternion.Inverse(parentWorld).multiply(targetRotation).normalize();
      const offset = (frame * bones.length + index) * 4;
      rotations[offset] = result.x;
      rotations[offset + 1] = result.y;
      rotations[offset + 2] = result.z;
      rotations[offset + 3] = result.w;
    });
  }
  let hips: Float32Array | null = null;
  if (clip.hips) {
    const sourceHips = source.bindPose.get('Hips')?.position ?? Vector3.Zero();
    const targetHips = target.bindPose.get('Hips')?.position ?? Vector3.Zero();
    const scale = sourceHips.y > 0.01 ? targetHips.y / sourceHips.y : 1;
    hips = new Float32Array(clip.hips.length);
    for (let frame = 0; frame < clip.frames; frame += 1) {
      hips[frame * 3] = targetHips.x + ((clip.hips[frame * 3] ?? 0) - sourceHips.x) * scale;
      hips[frame * 3 + 1] = targetHips.y + ((clip.hips[frame * 3 + 1] ?? 0) - sourceHips.y) * scale;
      hips[frame * 3 + 2] = targetHips.z + ((clip.hips[frame * 3 + 2] ?? 0) - sourceHips.z) * scale;
    }
  }
  const baked = {
    name: clip.name,
    duration: clip.duration,
    frames: clip.frames,
    bones,
    rotations,
    hips,
    retargetedFrom: sourceKey,
  };
  return { ...baked, apexTime: apexOf(baked) };
}
