import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import type { Scene } from '@babylonjs/core/scene';
import { profileAppearanceKey, type PlayerProfile } from '@frost-and-flamingos/shared';
import { CharacterView } from '../character';
import { bindWorldTransform, jointName, type PaintedModelAsset } from './library';
import { RIG_JOINTS, type RigJoint } from './rig';

export interface ModularRollBox { joint: RigJoint; corners: readonly Vector3[] }
const rollBoxes = new WeakMap<Mesh, readonly ModularRollBox[]>();
interface CachedBody { data: VertexData; boxes: readonly ModularRollBox[] }
const bodyCache = new WeakMap<Scene, Map<string, CachedBody>>();
const MAX_CACHED_BODIES = 12;

export function modularRollBoxes(mesh: Mesh): readonly ModularRollBox[] { return rollBoxes.get(mesh) ?? []; }

/** A single skinned draw, with every wardrobe choice represented by geometry/colour. */
export function buildModularBody(scene: Scene, profile: PlayerProfile, asset: PaintedModelAsset,
  source: Mesh, material: ShaderMaterial): Mesh {
  const skeleton = source.skeleton;
  if (!skeleton) throw new Error('A modular soldier needs the shared animation skeleton.');
  let cache = bodyCache.get(scene);
  if (!cache) { cache = new Map(); bodyCache.set(scene, cache); }
  const key = `${asset.spec.key}:${profileAppearanceKey(profile)}`;
  const finish = (cached: CachedBody): Mesh => {
    const mesh = new Mesh('soldier-modular-detail', scene);
    cached.data.applyToMesh(mesh, false);
    mesh.parent = source.parent; mesh.skeleton = skeleton; mesh.numBoneInfluencers = 4;
    mesh.material = material; mesh.isPickable = false; mesh.receiveShadows = true;
    rollBoxes.set(mesh, cached.boxes);
    return mesh;
  };
  const cached = cache.get(key);
  if (cached) { cache.delete(key); cache.set(key, cached); return finish(cached); }
  const bones = new Map(skeleton.bones.map((bone, index) => [jointName(bone.name), bone.getIndex() ?? index]));
  const bind = (name: string): Vector3 => asset.bindPositions.get(name) ?? Vector3.Zero();
  const weight = (names: readonly string[], amount: number): { indices: number[]; weights: number[] } => {
    const a = bones.get(names[0]!) ?? 0, b = bones.get(names[1] ?? names[0]!) ?? a;
    return { indices: [a, b, 0, 0], weights: [1 - amount, amount, 0, 0] };
  };
  const size = asset.height / 1.88;
  const shoulder = Math.abs(bind('LeftArm').x - bind('RightArm').x) / 2;
  const bodyScaleX = shoulder / 0.30;
  const headScale = asset.spec.head.radius / 0.21;
  const anchors = [
    [0.75, bind('Hips').y - 0.12 * size], [0.88, bind('Hips').y],
    [1.03, bind('Spine').y], [1.15, bind('Spine1').y], [1.28, bind('Spine2').y],
    [1.48, bind('Neck').y], [1.66, asset.spec.head.y],
  ] as const;
  const bodyY = (y: number): number => {
    for (let i = 0; i + 1 < anchors.length; i++) {
      const a = anchors[i]!, b = anchors[i + 1]!;
      if (y <= b[0]) return a[1] + (b[1] - a[1]) * (y - a[0]) / (b[0] - a[0]);
    }
    return asset.spec.head.y + (y - 1.66) * headScale;
  };
  const body = (p: Vector3, tag: number) => {
    const y = p.y + 0.88;
    const head = tag === 1;
    const at = new Vector3(-p.x * (head ? headScale : bodyScaleX), head ? asset.spec.head.y + (y - 1.66) * headScale : bodyY(y),
      p.z * (head ? headScale : size) + (head ? asset.spec.head.z : bind('Spine2').z));
    if (head) return { at, ...weight(['Head'], 0) };
    if (tag === 2) {
      at.y = bind('Spine2').y + (y - 1.28) * size;
      return { at, ...weight(['Spine2'], 0) };
    }
    const chain = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck'];
    const levels = [0.88, 1.03, 1.15, 1.28, 1.48];
    for (let i = 0; i + 1 < levels.length; i++) if (y <= levels[i + 1]!) {
      const t = Math.max(0, Math.min(1, (y - levels[i]!) / (levels[i + 1]! - levels[i]!)));
      return { at, ...weight([chain[i]!, chain[i + 1]!], t) };
    }
    return { at, ...weight(['Neck'], 0) };
  };
  const limb = (p: Vector3, side: 'Left' | 'Right', arm: boolean) => {
    const names = arm ? [`${side}Arm`, `${side}ForeArm`, `${side}Hand`]
      : [`${side}UpLeg`, `${side}Leg`, `${side}Foot`];
    const levels = arm ? [0, 0.33, 0.60] : [0, 0.40, 0.75];
    const distance = -p.y;
    const segment = distance < levels[1]! ? 0 : 1;
    const t = (distance - levels[segment]!) / (levels[segment + 1]! - levels[segment]!);
    const a = bind(names[segment]!), b = bind(names[segment + 1]!);
    const direction = b.subtract(a).normalize();
    const right = new Vector3(-1, 0, 0);
    right.subtractInPlace(direction.scale(Vector3.Dot(right, direction)));
    if (right.lengthSquared() < 0.01) right.copyFrom(Vector3.Cross(direction, new Vector3(0, 0, 1)));
    right.normalize();
    const front = Vector3.Cross(right, direction).normalize();
    let at = Vector3.Lerp(a, b, t).add(right.scale(p.x * size)).add(front.scale(p.z * size));
    let skin;
    if (distance >= levels[2]!) {
      if (arm) {
        const middle = asset.bindPositions.get(`${side}HandMiddle1`);
        const handDirection = middle ? middle.subtract(b).normalize() : direction;
        at = b.add(handDirection.scale((distance - levels[2]!) * size))
          .add(right.scale(p.x * size)).add(front.scale(p.z * size));
      } else {
        // The same sole level across boots, sandals, ski boots and flippers.
        at.y = Math.max(0.001, b.y * (1 - (distance - 0.75) / 0.16));
      }
      skin = weight([names[2]!], 0);
    } else {
      const blend = Math.max(0, Math.min(1, (t - 0.78) / 0.22));
      skin = weight([names[segment]!, names[segment + 1]!], blend);
    }
    return { at, ...skin };
  };

  // Reuse the complete wardrobe's authored parts, then bind them to the
  // existing Mixamo joints. The temporary rigid preview is disposed at once.
  const template = new CharacterView(scene, new StandardMaterial('wardrobe-build-shadow', scene), profile);
  const positions: number[] = [], colors: number[] = [], indices: number[] = [];
  const joints: number[] = [], weights: number[] = [];
  try {
    for (const mesh of template.root.getChildMeshes(false)) {
      const name = mesh.name;
      if (!(name === 'character-body-mesh' || /^(left|right)-(arm|leg)-mesh$/.test(name))) continue;
      const points = mesh.getVerticesData('position')!, paint = mesh.getVerticesData('color')!;
      const tags = mesh.getVerticesData('uv2');
      const first = positions.length / 3;
      for (let i = 0; i < points.length; i += 3) {
        const p = new Vector3(points[i]!, points[i + 1]!, points[i + 2]!);
        const mapped = name === 'character-body-mesh' ? body(p, tags?.[i / 3 * 2] ?? 0)
          : limb(p, name.startsWith('left') ? 'Left' : 'Right', name.includes('arm'));
        positions.push(mapped.at.x, mapped.at.y, mapped.at.z);
        joints.push(...mapped.indices); weights.push(...mapped.weights);
        const c = i / 3 * 4;
        colors.push(paint[c]!, paint[c + 1]!, paint[c + 2]!, paint[c + 3]!);
      }
      const faces = mesh.getIndices()!;
      for (let i = 0; i < faces.length; i += 3) indices.push(first + faces[i]!, first + faces[i + 2]!, first + faces[i + 1]!);
    }
  } finally { template.dispose(); }
  const normals = new Float32Array(positions.length);
  VertexData.ComputeNormals(positions, indices, normals);
  const data = new VertexData();
  data.positions = new Float32Array(positions); data.normals = normals;
  data.colors = new Float32Array(colors); data.indices = new Uint32Array(indices);
  data.matricesIndices = new Float32Array(joints); data.matricesWeights = new Float32Array(weights);
  // Conservative per-joint envelopes protect the *selected* headgear, hands
  // and torso during rolls, without CPU-skinning thousands of vertices/frame.
  const bounds = new Map<string, { min: Vector3; max: Vector3 }>();
  const jointNames = new Map([...bones].map(([name, index]) => [index, name]));
  const inverseBinds = new Map<string, { position: Vector3; inverse: Quaternion }>();
  for (const [name] of bones) {
    const b = bindWorldTransform(asset, name);
    if (b) inverseBinds.set(name, { position: b.position, inverse: Quaternion.Inverse(b.rotation) });
  }
  for (let vertex = 0; vertex < positions.length / 3; vertex++) {
    if (positions[vertex * 3 + 1]! < asset.height * 0.42) continue;
    const p = new Vector3(positions[vertex * 3]!, positions[vertex * 3 + 1]!, positions[vertex * 3 + 2]!);
    for (let influence = 0; influence < 4; influence++) {
      if (weights[vertex * 4 + influence]! < 0.001) continue;
      const name = jointNames.get(joints[vertex * 4 + influence]!)!;
      const b = inverseBinds.get(name);
      if (!b) continue;
      const point = p.subtract(b.position).rotateByQuaternionToRef(b.inverse, new Vector3());
      let box = bounds.get(name);
      if (!box) { box = { min: point.clone(), max: point.clone() }; bounds.set(name, box); }
      box.min.minimizeInPlace(point); box.max.maximizeInPlace(point);
    }
  }
  const isJoint = (name: string): name is RigJoint => (RIG_JOINTS as readonly string[]).includes(name);
  const boxes: ModularRollBox[] = [...bounds].flatMap(([joint, b]) => isJoint(joint) ? [{ joint, corners:
    [b.min.x, b.max.x].flatMap(x => [b.min.y, b.max.y].flatMap(y => [b.min.z, b.max.z].map(z => new Vector3(x, y, z)))) }] : []);
  const built = { data, boxes };
  if (cache.size >= MAX_CACHED_BODIES) cache.delete(cache.keys().next().value!);
  cache.set(key, built);
  return finish(built);
}
