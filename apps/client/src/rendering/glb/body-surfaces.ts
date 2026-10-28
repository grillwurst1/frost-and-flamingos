import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math';
import type { PlayerProfile } from '@frost-and-flamingos/shared';
import type { PaintedModelAsset } from './library';
import { bindWorldTransform } from './clips';
import { nativeWardrobeRecipe } from './native-wardrobe';

export interface BodySurfaceBone {
  name: string; parent: string | null; index: number;
  position: [number, number, number]; rotation: [number, number, number, number];
}
export interface BodySurfaceGeometry {
  version: 1; sourceHash: string;
  positions: number[]; normals: number[]; uvs: number[];
  joints: number[]; weights: number[]; indices: number[]; regions: number[];
  bones: BodySurfaceBone[];
}

export function parseBodySurfaces(value: unknown): BodySurfaceGeometry | null {
  if (!value || typeof value !== 'object') return null;
  const d = value as Partial<BodySurfaceGeometry>;
  if (d.version !== 1 || typeof d.sourceHash !== 'string' || !/^[a-f0-9]{64}$/.test(d.sourceHash)
    || !Array.isArray(d.positions) || d.positions.length % 3 || d.positions.length < 300 || d.positions.length > 90000) return null;
  const count = d.positions.length / 3;
  for (const [a, length] of [[d.positions, count * 3], [d.normals, count * 3], [d.uvs, count * 2], [d.joints, count * 4], [d.weights, count * 4]] as const)
    if (!Array.isArray(a) || a.length !== length || !a.every(Number.isFinite)) return null;
  if (!Array.isArray(d.indices) || !d.indices.length || d.indices.length % 3 || d.indices.length > 120000
    || !d.indices.every(v => Number.isInteger(v) && v >= 0 && v < count)
    || !Array.isArray(d.regions) || d.regions.length !== d.indices.length / 3 || !d.regions.every(v => v === 4)
    || !Array.isArray(d.bones) || !d.bones.length || d.bones.length > 512) return null;
  for (const b of d.bones) if (!b || typeof b.name !== 'string' || !b.name.length || b.name.length > 80
    || (b.parent !== null && typeof b.parent !== 'string') || !Number.isInteger(b.index) || b.index < 0
    || !Array.isArray(b.position) || b.position.length !== 3 || !b.position.every(Number.isFinite)
    || !Array.isArray(b.rotation) || b.rotation.length !== 4 || !b.rotation.every(Number.isFinite)) return null;
  const indices = new Set(d.bones.map(b => b.index));
  for (let v = 0; v < count; v++) {
    let total = 0;
    for (let k = 0; k < 4; k++) {
      const at = v * 4 + k, weight = d.weights![at]!, joint = d.joints![at]!;
      if (weight < 0 || weight > 1 || !Number.isInteger(joint) || (weight > 0 && !indices.has(joint))) return null;
      total += weight;
    }
    if (total < .99 || total > 1.01) return null;
  }
  return d as BodySurfaceGeometry;
}

export function bodySurfaceRecipe(profile: PlayerProfile, asset: PaintedModelAsset): { arms: boolean } {
  if (!asset.wardrobeBody) return { arms: false };
  const native = nativeWardrobeRecipe(profile, asset), c = profile.cosmetics;
  return {
    arms: !native.arms && ['torso_field_vest', 'torso_bare_suspenders', 'torso_barrel_armor', 'torso_flamingo_ring'].includes(c.torso),
  };
}

const children: Readonly<Record<string, string>> = Object.fromEntries((['Left', 'Right'] as const).flatMap(side => [
  [`${side}Shoulder`, `${side}Arm`], [`${side}Arm`, `${side}ForeArm`], [`${side}ForeArm`, `${side}Hand`],
  [`${side}UpLeg`, `${side}Leg`], [`${side}Leg`, `${side}Foot`], [`${side}Foot`, `${side}ToeBase`],
]).concat([['Hips', 'Spine'], ['Spine', 'Spine1'], ['Spine1', 'Spine2'], ['Spine2', 'Neck']]));

function rotationBetween(from: Vector3, to: Vector3): Quaternion {
  const dot = Math.max(-1, Math.min(1, Vector3.Dot(from, to)));
  if (dot > .999999) return Quaternion.Identity();
  if (dot < -.999999) {
    let axis = Vector3.Cross(from, new Vector3(0, 0, 1));
    if (axis.lengthSquared() < .001) axis = Vector3.Cross(from, new Vector3(0, 1, 0));
    return Quaternion.RotationAxis(axis.normalize(), Math.PI);
  }
  const cross = Vector3.Cross(from, to);
  return new Quaternion(cross.x, cross.y, cross.z, 1 + dot).normalize();
}

interface BoneMap {
  index: number; from: Vector3; to: Vector3; direction: Vector3;
  rotation: Quaternion; length: number; width: number;
}

/** Maps authored bind surfaces between the existing A/T-pose rigs once per outfit. */
export function bodySurfaceRetarget(profile: PlayerProfile, asset: PaintedModelAsset, source: BodySurfaceGeometry,
  targetIndices: ReadonlyMap<string, number>) {
  const byName = new Map(source.bones.map(b => [b.name, b])), byIndex = new Map(source.bones.map(b => [b.index, b]));
  const cache = new Map<number, BoneMap>();
  const sourceArm = byName.get('LeftArm'), sourceRightArm = byName.get('RightArm');
  const targetArm = asset.bindPositions.get('LeftArm'), targetRightArm = asset.bindPositions.get('RightArm');
  const shoulderRatio = sourceArm && sourceRightArm && targetArm && targetRightArm
    ? Math.abs(targetArm.x - targetRightArm.x) / Math.max(.1, Math.abs(sourceArm.position[0] - sourceRightArm.position[0])) : 1;
  const width = shoulderRatio * (1 + (.15 - profile.cosmetics.bodyType) * .18);
  const mapping = (sourceIndex: number): BoneMap => {
    const cached = cache.get(sourceIndex); if (cached) return cached;
    let bone = byIndex.get(sourceIndex);
    while (bone && !targetIndices.has(bone.name)) bone = bone.parent ? byName.get(bone.parent) : undefined;
    bone ??= byName.get('Hips');
    if (!bone) throw new Error('Anatomical surfaces have no compatible root joint.');
    const target = bindWorldTransform(asset, bone.name);
    if (!target) throw new Error(`Anatomical surface target joint missing: ${bone.name}`);
    const from = Vector3.FromArray(bone.position), rotation = target.rotation.multiply(Quaternion.Inverse(Quaternion.FromArray(bone.rotation)));
    let sourceEnd = children[bone.name] ? byName.get(children[bone.name]!) : undefined;
    let targetEnd = sourceEnd ? asset.bindPositions.get(sourceEnd.name) : undefined;
    let sourceDirection: Vector3, targetDirection: Vector3;
    if (sourceEnd && targetEnd) {
      sourceDirection = Vector3.FromArray(sourceEnd.position).subtract(from); targetDirection = targetEnd.subtract(target.position);
    } else {
      sourceEnd = bone.parent ? byName.get(bone.parent) : undefined;
      targetEnd = sourceEnd ? asset.bindPositions.get(sourceEnd.name) : undefined;
      sourceDirection = sourceEnd ? from.subtract(Vector3.FromArray(sourceEnd.position)) : new Vector3(0, 1, 0);
      targetDirection = targetEnd ? target.position.subtract(targetEnd) : sourceDirection.clone();
    }
    const length = Math.max(.05, targetDirection.length()) / Math.max(.05, sourceDirection.length());
    sourceDirection.normalize(); targetDirection.normalize();
    const mappedDirection = sourceDirection.rotateByQuaternionToRef(rotation, new Vector3()).normalize();
    const aligned = rotationBetween(mappedDirection, targetDirection).multiply(rotation).normalize();
    const result = { index: targetIndices.get(bone.name) ?? 0, from, to: target.position, direction: sourceDirection, rotation: aligned, length, width };
    cache.set(sourceIndex, result); return result;
  };
  const point = (sourceIndex: number, p: Vector3, normal: Vector3) => {
    const b = mapping(sourceIndex), delta = p.subtract(b.from), along = Vector3.Dot(delta, b.direction);
    const scaled = delta.scale(b.width).add(b.direction.scale(along * (b.length - b.width)));
    const at = b.to.add(scaled.rotateByQuaternionToRef(b.rotation, new Vector3()));
    const normalAlong = Vector3.Dot(normal, b.direction);
    const scaledNormal = normal.scale(1 / b.width).add(b.direction.scale(normalAlong * (1 / b.length - 1 / b.width)));
    return { position: at, normal: scaledNormal.rotateByQuaternionToRef(b.rotation, new Vector3()).normalize(), index: b.index };
  };
  return {
    point,
    vertex(vertex: number) {
      const p = Vector3.FromArray(source.positions, vertex * 3), n = Vector3.FromArray(source.normals, vertex * 3);
      const position = Vector3.Zero(), normal = Vector3.Zero(), indices: number[] = [], weights: number[] = [];
      for (let k = 0; k < 4; k++) {
        const weight = source.weights[vertex * 4 + k]!;
        if (weight <= 0) { indices.push(0); weights.push(0); continue; }
        const mapped = point(source.joints[vertex * 4 + k]!, p, n);
        position.addInPlace(mapped.position.scale(weight)); normal.addInPlace(mapped.normal.scale(weight));
        indices.push(mapped.index); weights.push(weight);
      }
      return { position, normal: normal.normalize(), indices, weights };
    },
  };
}
