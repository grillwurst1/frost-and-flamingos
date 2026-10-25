import { Bone } from '@babylonjs/core/Bones/bone';
import { Skeleton } from '@babylonjs/core/Bones/skeleton';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { BoundingInfo } from '@babylonjs/core/Culling/boundingInfo';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math';
import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Material } from '@babylonjs/core/Materials/material';
import type { Scene } from '@babylonjs/core/scene';

/**
 * Rig plumbing shared by the procedural mascots and the owner's Meshy models.
 *
 * - {@link buildRigidSkin}: turns a TransformNode rig whose parts are small
 *   meshes into ONE rigidly skinned mesh (one bone per node, linked to the
 *   node), so a whole mascot is a single draw call while the animation code
 *   keeps writing plain node rotations.
 * - {@link JointDriver}: writes rotation deltas expressed in the mascot's
 *   MODEL axes (x = right, y = up, z = forward) into any joint, whatever its
 *   bind orientation, handedness or scale. That is the seam that lets the same
 *   gait code drive the procedural cow and an external skeleton mapped by bone
 *   name.
 * - {@link LegSolver}: planar two-bone IK in the sagittal plane, for 3-joint
 *   (hip, knee, hoof) and 4-joint (hip, knee, hock, fetlock) legs, keeping the
 *   hoof flat on the ground.
 */

const tmpMatrix = new Matrix();
const tmpMatrixB = new Matrix();
const tmpQuat = new Quaternion();
const tmpQuatB = new Quaternion();
const tmpQuatC = new Quaternion();
const tmpVector = new Vector3();
const tmpScale = new Vector3();
const tmpTranslation = new Vector3();

/** World matrix of `node` relative to `root` (row-vector convention). */
export function relativeMatrix(node: TransformNode, root: TransformNode, out: Matrix): Matrix {
  root.computeWorldMatrix(true);
  node.computeWorldMatrix(true);
  root.getWorldMatrix().invertToRef(tmpMatrix);
  node.getWorldMatrix().multiplyToRef(tmpMatrix, out);
  return out;
}

/** Rest position of `node`'s origin in `root` space. */
export function relativePosition(node: TransformNode, root: TransformNode, out: Vector3): Vector3 {
  relativeMatrix(node, root, tmpMatrixB);
  tmpMatrixB.getTranslationToRef(out);
  return out;
}

/**
 * Drives one joint with model-axis Euler deltas on top of its rest pose:
 * local = rest * conj(R_rest) * D * R_rest, where R_rest is the joint's rest
 * orientation in model space (mirrors included). For the procedural rigs the
 * rest orientation is identity and this is a plain YXZ Euler rotation.
 */
export class JointDriver {
  readonly rest = new Quaternion();
  readonly restPosition = new Vector3();
  readonly restScaling = new Vector3(1, 1, 1);
  /** Local axes that correspond to the model X / Y / Z axes at rest. */
  private readonly axisX = new Vector3(1, 0, 0);
  private readonly axisY = new Vector3(0, 1, 0);
  private readonly axisZ = new Vector3(0, 0, 1);
  /** -1 when the rest frame is mirrored (glTF handedness flip). */
  private readonly sign: number;

  constructor(
    readonly node: TransformNode,
    modelRoot: TransformNode,
  ) {
    if (!node.rotationQuaternion) {
      node.rotationQuaternion = Quaternion.FromEulerAngles(node.rotation.x, node.rotation.y, node.rotation.z);
    }
    this.rest.copyFrom(node.rotationQuaternion);
    this.restPosition.copyFrom(node.position);
    this.restScaling.copyFrom(node.scaling);
    relativeMatrix(node, modelRoot, tmpMatrixB);
    // Rotation part only: strip scale per axis (rows), keep a mirror.
    const m = tmpMatrixB.m;
    const rows = [
      [m[0] ?? 1, m[1] ?? 0, m[2] ?? 0],
      [m[4] ?? 0, m[5] ?? 1, m[6] ?? 0],
      [m[8] ?? 0, m[9] ?? 0, m[10] ?? 1],
    ];
    for (const row of rows) {
      const length = Math.hypot(row[0] ?? 0, row[1] ?? 0, row[2] ?? 0) || 1;
      row[0] = (row[0] ?? 0) / length;
      row[1] = (row[1] ?? 0) / length;
      row[2] = (row[2] ?? 0) / length;
    }
    const [r0, r1, r2] = rows as [number[], number[], number[]];
    const det =
      (r0[0] ?? 0) * ((r1[1] ?? 0) * (r2[2] ?? 0) - (r1[2] ?? 0) * (r2[1] ?? 0)) -
      (r0[1] ?? 0) * ((r1[0] ?? 0) * (r2[2] ?? 0) - (r1[2] ?? 0) * (r2[0] ?? 0)) +
      (r0[2] ?? 0) * ((r1[0] ?? 0) * (r2[1] ?? 0) - (r1[1] ?? 0) * (r2[0] ?? 0));
    this.sign = det < 0 ? -1 : 1;
    // Row-vector convention: world = local * R, so a model axis e maps to
    // local e * R^T (R orthonormal), i.e. the dot products with the rows.
    const toLocal = (e: [number, number, number], out: Vector3): void => {
      out.set(
        (r0[0] ?? 0) * e[0] + (r0[1] ?? 0) * e[1] + (r0[2] ?? 0) * e[2],
        (r1[0] ?? 0) * e[0] + (r1[1] ?? 0) * e[1] + (r1[2] ?? 0) * e[2],
        (r2[0] ?? 0) * e[0] + (r2[1] ?? 0) * e[1] + (r2[2] ?? 0) * e[2],
      );
      out.normalize();
    };
    toLocal([1, 0, 0], this.axisX);
    toLocal([0, 1, 0], this.axisY);
    toLocal([0, 0, 1], this.axisZ);
  }

  /** pitch about model X (+ = nose down / leg swings back), yaw about Y, roll about Z. */
  set(pitch: number, yaw = 0, roll = 0): void {
    const target = this.node.rotationQuaternion ?? (this.node.rotationQuaternion = new Quaternion());
    Quaternion.RotationAxisToRef(this.axisY, yaw * this.sign, tmpQuat);
    Quaternion.RotationAxisToRef(this.axisX, pitch * this.sign, tmpQuatB);
    tmpQuat.multiplyToRef(tmpQuatB, tmpQuatC);
    Quaternion.RotationAxisToRef(this.axisZ, roll * this.sign, tmpQuatB);
    tmpQuatC.multiplyToRef(tmpQuatB, tmpQuat);
    this.rest.multiplyToRef(tmpQuat, target);
  }

  /** Blends the current local rotation towards a given local quaternion (clip layers). */
  blendTowards(local: Quaternion, weight: number): void {
    const target = this.node.rotationQuaternion;
    if (!target || weight <= 0) return;
    Quaternion.SlerpToRef(target, local, Math.min(1, weight), target);
  }

  /** Uniform-ish scale relative to rest (procedural parts only: eyes, lids). */
  setScale(x: number, y: number, z: number): void {
    this.node.scaling.set(this.restScaling.x * x, this.restScaling.y * y, this.restScaling.z * z);
  }

  /** Offset from the rest position in the joint's parent space. */
  setOffset(x: number, y: number, z: number): void {
    this.node.position.set(this.restPosition.x + x, this.restPosition.y + y, this.restPosition.z + z);
  }

  reset(): void {
    this.node.rotationQuaternion?.copyFrom(this.rest);
    this.node.position.copyFrom(this.restPosition);
    this.node.scaling.copyFrom(this.restScaling);
  }
}

/** Angle of a sagittal (y, z) vector: 0 = straight down, + = swung backwards. */
function sagittalAngle(y: number, z: number): number {
  return Math.atan2(-z, -y);
}

/**
 * Two-bone IK for one leg in the mascot's sagittal plane. Rest pivots are
 * given in the body (visual) space at rest; targets are in that same space
 * with the body pitch passed in, so the solver also works while the body
 * bobs, pitches and rears up.
 */
export class LegSolver {
  readonly joints: readonly JointDriver[];
  /** Rest pivots (y, z) in body space. */
  private readonly py: Float64Array;
  private readonly pz: Float64Array;
  /** Fetlock-to-sole offset at rest (body space, y and z). */
  private readonly soleY: number;
  private readonly soleZ: number;
  readonly restSoleZ: number;
  readonly restSoleY: number;
  readonly hipY: number;
  readonly hipZ: number;
  /** Lateral position of the leg (body space). */
  readonly restX: number;
  private readonly upper: number;
  private readonly restUpper: number;
  private readonly bendSign: number;
  /** Reach when fully stretched (hip to sole), used for stride limits. */
  readonly length: number;
  /** Last solve: absolute segment angles (for debug / tuck heuristics). */
  thighAngle = 0;

  /**
   * @param joints hip, knee, (hock,) hoof-joint, parent first
   * @param pivots rest pivots in body space, same order
   * @param sole rest sole point (bottom of the hoof) in body space
   */
  constructor(joints: readonly JointDriver[], pivots: readonly Vector3[], sole: Vector3, bendHint = 1) {
    this.joints = joints;
    const count = pivots.length;
    this.py = new Float64Array(count);
    this.pz = new Float64Array(count);
    pivots.forEach((pivot, index) => {
      this.py[index] = pivot.y;
      this.pz[index] = pivot.z;
    });
    const last = count - 1;
    this.soleY = sole.y - (this.py[last] ?? 0);
    this.soleZ = sole.z - (this.pz[last] ?? 0);
    this.restSoleY = sole.y;
    this.restSoleZ = sole.z;
    this.hipY = this.py[0] ?? 0;
    this.restX = pivots[0]?.x ?? 0;
    this.hipZ = this.pz[0] ?? 0;
    const ay = (this.py[1] ?? 0) - this.hipY;
    const az = (this.pz[1] ?? 0) - this.hipZ;
    this.upper = Math.hypot(ay, az);
    this.restUpper = sagittalAngle(ay, az);
    const by = (this.py[last] ?? 0) - (this.py[1] ?? 0);
    const bz = (this.pz[last] ?? 0) - (this.pz[1] ?? 0);
    const toEndY = (this.py[last] ?? 0) - this.hipY;
    const toEndZ = (this.pz[last] ?? 0) - this.hipZ;
    const restDirect = sagittalAngle(toEndY, toEndZ);
    const side = this.restUpper - restDirect;
    this.bendSign = Math.abs(side) > 0.02 ? Math.sign(side) : bendHint;
    this.restLower = Math.hypot(by, bz);
    this.length = this.upper + this.restLower + Math.hypot(this.soleY, this.soleZ);
  }

  private readonly restLower: number;

  /**
   * Longest stance sweep (front-to-back hoof travel) the leg reaches with the
   * body at rest height lowered by `dip`, keeping a little knee bend.
   */
  strideReach(visualRestY: number, dip: number): number {
    const depth = visualRestY + this.hipY - dip + this.soleY;
    const reach = (this.upper + this.restLower) * 0.985;
    return 2 * 0.92 * Math.sqrt(Math.max(0, reach * reach - depth * depth));
  }

  /** Lower virtual segment (knee to hoof joint) with the middle joint flexed by `tuck`. */
  private lower(tuck: number, out: { y: number; z: number }): void {
    const last = this.py.length - 1;
    if (last >= 3) {
      const my = (this.py[2] ?? 0) - (this.py[1] ?? 0);
      const mz = (this.pz[2] ?? 0) - (this.pz[1] ?? 0);
      const ly = (this.py[last] ?? 0) - (this.py[2] ?? 0);
      const lz = (this.pz[last] ?? 0) - (this.pz[2] ?? 0);
      // Rotation by +tuck in the sagittal plane (y' = y c - z s, z' = y s + z c).
      const c = Math.cos(tuck);
      const s = Math.sin(tuck);
      out.y = my + ly * c - lz * s;
      out.z = mz + ly * s + lz * c;
    } else {
      out.y = (this.py[last] ?? 0) - (this.py[1] ?? 0);
      out.z = (this.pz[last] ?? 0) - (this.pz[1] ?? 0);
    }
  }

  private readonly scratch = { y: 0, z: 0 };

  /**
   * Places the sole at (targetY, targetZ) in body space (hip pivot moved by
   * the body transform already folded in by the caller: pass the hip pivot
   * as it currently sits, `hipY`/`hipZ`, and the body pitch).
   * `tuck` flexes the middle joint, `hoofFlex` curls the hoof (0 = flat).
   */
  solve(
    hipY: number,
    hipZ: number,
    bodyPitch: number,
    targetY: number,
    targetZ: number,
    tuck: number,
    hoofFlex: number,
  ): void {
    // Hoof-joint target: the sole offset stays world-flat.
    const fy = targetY - this.soleY;
    const fz = targetZ - this.soleZ;
    const lower = this.scratch;
    this.lower(tuck, lower);
    const b = Math.hypot(lower.y, lower.z);
    const restLower = sagittalAngle(lower.y, lower.z);
    const a = this.upper;
    const dy = fy - hipY;
    const dz = fz - hipZ;
    let distance = Math.hypot(dy, dz);
    const minimum = Math.abs(a - b) + 1e-4;
    const maximum = a + b - 1e-4;
    distance = Math.min(maximum, Math.max(minimum, distance));
    const direct = sagittalAngle(dy, dz);
    const cosine = (a * a + distance * distance - b * b) / (2 * a * distance);
    const inner = Math.acos(Math.max(-1, Math.min(1, cosine)));
    const thigh = direct + this.bendSign * inner;
    const kneeY = hipY - Math.cos(thigh) * a;
    const kneeZ = hipZ - Math.sin(thigh) * a;
    const shin = sagittalAngle(fy - kneeY, fz - kneeZ);
    this.thighAngle = thigh;
    const hip = thigh - bodyPitch - this.restUpper;
    const knee = shin - bodyPitch - hip - restLower;
    const joints = this.joints;
    joints[0]?.set(hip);
    joints[1]?.set(knee);
    const last = joints.length - 1;
    let accumulated = hip + knee;
    if (last >= 3) {
      joints[2]?.set(tuck);
      accumulated += tuck;
    }
    joints[last]?.set(hoofFlex - bodyPitch - accumulated);
  }

  /** Explicit joint deltas (flailing, swimming, stiff death legs). */
  pose(hip: number, knee: number, middle: number, hoof: number, splay = 0): void {
    const joints = this.joints;
    joints[0]?.set(hip, 0, splay);
    joints[1]?.set(knee);
    const last = joints.length - 1;
    if (last >= 3) joints[2]?.set(middle);
    joints[last]?.set(hoof);
  }
}

export interface RigidSkin {
  mesh: Mesh;
  skeleton: Skeleton;
}

/**
 * Bakes every mesh below `root` (each parented to a rig TransformNode, in
 * that node's local space) into one mesh skinned rigidly to a skeleton whose
 * bones are linked to the rig nodes. Part meshes are disposed.
 */
export function buildRigidSkin(scene: Scene, name: string, root: TransformNode, material: Material): RigidSkin | null {
  const nodes: TransformNode[] = [];
  const visit = (node: TransformNode): void => {
    for (const child of node.getChildren()) {
      if (child instanceof TransformNode && !(child instanceof AbstractMesh)) {
        nodes.push(child);
        visit(child);
      }
    }
  };
  visit(root);
  const parts: Mesh[] = [];
  for (const node of [root, ...nodes]) {
    for (const child of node.getChildren()) {
      if (child instanceof Mesh && child.getTotalVertices() > 0 && child.metadata?.ffKeep !== true) parts.push(child);
    }
  }
  if (parts.length === 0) return null;

  const skeleton = new Skeleton(`${name}-skeleton`, `${name}-skeleton-${scene.getUniqueId()}`, scene);
  const boneIndex = new Map<TransformNode, number>();
  const bones: Bone[] = [];
  for (const node of nodes) {
    const parentNode = node.parent instanceof TransformNode ? node.parent : null;
    const parentBone = parentNode ? bones[boneIndex.get(parentNode) ?? -1] ?? null : null;
    const rotation = node.rotationQuaternion ?? Quaternion.FromEulerAngles(node.rotation.x, node.rotation.y, node.rotation.z);
    const local = Matrix.Compose(node.scaling, rotation, node.position);
    const bone = new Bone(node.name, skeleton, parentBone, local);
    bone.linkTransformNode(node);
    boneIndex.set(node, bones.length);
    bones.push(bone);
  }

  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const matricesIndices: number[] = [];
  const matricesWeights: number[] = [];
  let hasUv = false;
  for (const part of parts) if (part.getVerticesData(VertexBuffer.UVKind)) hasUv = true;
  const transformed = new Vector3();
  const source = new Vector3();
  for (const part of parts) {
    const parentNode = part.parent instanceof TransformNode ? part.parent : root;
    const bone = parentNode === root ? -1 : boneIndex.get(parentNode) ?? -1;
    part.computeWorldMatrix(true);
    relativeMatrix(part, root, tmpMatrixB);
    const partPositions = part.getVerticesData(VertexBuffer.PositionKind);
    const partNormals = part.getVerticesData(VertexBuffer.NormalKind);
    const partColors = part.getVerticesData(VertexBuffer.ColorKind);
    const partUvs = part.getVerticesData(VertexBuffer.UVKind);
    const partIndices = part.getIndices();
    if (!partPositions || !partIndices) continue;
    const base = positions.length / 3;
    const count = partPositions.length / 3;
    for (let index = 0; index < count; index += 1) {
      source.set(partPositions[index * 3] ?? 0, partPositions[index * 3 + 1] ?? 0, partPositions[index * 3 + 2] ?? 0);
      Vector3.TransformCoordinatesToRef(source, tmpMatrixB, transformed);
      positions.push(transformed.x, transformed.y, transformed.z);
      source.set(partNormals?.[index * 3] ?? 0, partNormals?.[index * 3 + 1] ?? 1, partNormals?.[index * 3 + 2] ?? 0);
      Vector3.TransformNormalToRef(source, tmpMatrixB, transformed);
      transformed.normalize();
      normals.push(transformed.x, transformed.y, transformed.z);
      colors.push(
        partColors?.[index * 4] ?? 1,
        partColors?.[index * 4 + 1] ?? 1,
        partColors?.[index * 4 + 2] ?? 1,
        partColors?.[index * 4 + 3] ?? 0,
      );
      if (hasUv) uvs.push(partUvs?.[index * 2] ?? 0, partUvs?.[index * 2 + 1] ?? 0);
      // Parts directly under the root ride the root (bone slot = identity).
      matricesIndices.push(bone >= 0 ? bone : bones.length, 0, 0, 0);
      matricesWeights.push(1, 0, 0, 0);
    }
    for (const value of partIndices) indices.push(base + value);
    part.dispose(false, false);
  }

  const data = new VertexData();
  data.positions = positions;
  data.normals = normals;
  data.colors = colors;
  data.indices = indices;
  if (hasUv) data.uvs = uvs;
  data.matricesIndices = matricesIndices;
  data.matricesWeights = matricesWeights;
  const mesh = new Mesh(name, scene);
  data.applyToMesh(mesh, false);
  mesh.parent = root;
  mesh.skeleton = skeleton;
  mesh.numBoneInfluencers = 1;
  mesh.material = material;
  mesh.isPickable = false;
  // Bind-pose bounds do not follow the bones: pad them so rearing, tumbling
  // and the toppled death pose never get frustum-culled.
  mesh.refreshBoundingInfo();
  const box = mesh.getBoundingInfo().boundingBox;
  const pad = Math.max(box.maximum.x - box.minimum.x, box.maximum.y - box.minimum.y, box.maximum.z - box.minimum.z) * 0.45;
  tmpTranslation.set(pad, pad, pad);
  tmpScale.copyFrom(box.minimum).subtractInPlace(tmpTranslation);
  tmpVector.copyFrom(box.maximum).addInPlace(tmpTranslation);
  mesh.setBoundingInfo(new BoundingInfo(tmpScale.clone(), tmpVector.clone()));
  return { mesh, skeleton };
}
