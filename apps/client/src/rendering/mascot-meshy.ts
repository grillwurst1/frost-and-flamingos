import { AnimationGroup } from '@babylonjs/core/Animations/animationGroup';
import { BoundingInfo } from '@babylonjs/core/Culling/boundingInfo';
import { Quaternion, Vector3, Vector4 } from '@babylonjs/core/Maths/math';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import type { Scene } from '@babylonjs/core/scene';
import type { CowJointName, CowSkeleton } from './cow-animator';
import type { BakedClip, MascotModelAsset } from './mascot-models';
import { JointDriver, LegSolver, relativePosition } from './mascot-rig';
import { createMascotMaterial } from './mascot-material';

/**
 * Adapters that turn the owner's Meshy models into mascot rigs.
 *
 * Cow: the "Quadruped Dog" skeleton is mapped by joint NAME onto the
 * animator's roles (legs by name pattern and side, tail chain, chest, head,
 * the bell/ear joints added by the optimiser), so cow-animator.ts drives it
 * exactly like the procedural rig. Meshy's one walk clip is kept as an
 * optional layer (see CowClipLayer).
 *
 * Coconut: the static husk replaces the procedural shell mesh under the
 * rolling shell node; face, lei and roll logic stay procedural.
 */

export const MESHY_COW_HEIGHT = 1.62;
const PIVOT_RATIO = 0.56;

/** Bind-pose extents of a model instance (container root space), cached per asset. */
const boundsCache = new WeakMap<MascotModelAsset, { min: Vector3; max: Vector3; local: BoundingInfo | null }>();

function normalised(name: string): string {
  const colon = name.lastIndexOf(':');
  const bar = name.lastIndexOf('|');
  return name.slice(Math.max(colon, bar) + 1).toLowerCase();
}

function forceWorld(root: TransformNode): void {
  root.computeWorldMatrix(true);
  for (const child of root.getDescendants(false)) {
    if (child instanceof TransformNode) child.computeWorldMatrix(true);
  }
}

function ancestors(node: TransformNode, stop: TransformNode): TransformNode[] {
  const chain: TransformNode[] = [];
  let current: TransformNode | null = node;
  while (current) {
    chain.unshift(current);
    if (current === stop) break;
    current = current.parent instanceof TransformNode ? current.parent : null;
  }
  return chain;
}

interface Instance {
  root: TransformNode;
  mesh: Mesh;
  nodes: Map<string, TransformNode>;
  dispose(): void;
}

function instantiate(asset: MascotModelAsset, parent: TransformNode): Instance | null {
  const entries = asset.container.instantiateModelsToScene((name) => name, false, {
    doNotInstantiate: true,
    predicate: (entity: unknown) => !(entity instanceof AnimationGroup),
  });
  const root = entries.rootNodes[0] as TransformNode | undefined;
  if (!root) {
    entries.dispose();
    return null;
  }
  root.parent = parent;
  const mesh = root.getChildMeshes(false).find((candidate): candidate is Mesh => candidate instanceof Mesh && candidate.getTotalVertices() > 0);
  if (!mesh) {
    entries.dispose();
    return null;
  }
  const nodes = new Map<string, TransformNode>();
  for (const node of root.getChildTransformNodes(false)) {
    const name = normalised(node.name);
    if (!nodes.has(name)) nodes.set(name, node);
  }
  for (const child of root.getChildMeshes(false)) child.isPickable = false;
  return { root, mesh, nodes, dispose: () => entries.dispose() };
}

/** Rest bounds of the model in its parent's space (skinning applied). */
function measure(asset: MascotModelAsset, instance: Instance, holder: TransformNode): { min: Vector3; max: Vector3; local: BoundingInfo | null } {
  const cached = boundsCache.get(asset);
  if (cached) return cached;
  forceWorld(holder);
  instance.mesh.skeleton?.prepare(true);
  instance.mesh.refreshBoundingInfo({ applySkeleton: Boolean(instance.mesh.skeleton) });
  instance.mesh.computeWorldMatrix(true);
  const info = instance.mesh.getBoundingInfo();
  const box = info.boundingBox;
  box._update(instance.mesh.getWorldMatrix());
  holder.computeWorldMatrix(true);
  const inverse = holder.getWorldMatrix().clone().invert();
  const min = new Vector3(Infinity, Infinity, Infinity);
  const max = new Vector3(-Infinity, -Infinity, -Infinity);
  for (const corner of box.vectorsWorld) {
    const local = Vector3.TransformCoordinates(corner, inverse);
    min.minimizeInPlace(local);
    max.maximizeInPlace(local);
  }
  const result = {
    min,
    max,
    local: new BoundingInfo(box.minimum.clone(), box.maximum.clone()),
  };
  boundsCache.set(asset, result);
  return result;
}

/** Plays Meshy's walk clip on the mapped joints, phase-locked to the gait. */
export class CowClipLayer {
  private readonly targets: Array<{ index: number; node: TransformNode }> = [];
  private readonly root: TransformNode | null;
  private readonly rootRest = new Vector3();
  private readonly sample = new Quaternion();
  private readonly next = new Quaternion();
  /** Clip time (0..1) of the front-left lift-off, to align with the gait phase. */
  readonly liftOff: number;

  constructor(
    private readonly clip: BakedClip,
    nodes: Map<string, TransformNode>,
  ) {
    clip.joints.forEach((joint, index) => {
      const node = nodes.get(normalised(joint));
      if (node) this.targets.push({ index, node });
    });
    this.root = clip.rootJoint ? nodes.get(normalised(clip.rootJoint)) ?? null : null;
    if (this.root) this.rootRest.copyFrom(this.root.position);
    this.liftOff = 0.93;
  }

  apply(phase: number, weight: number): void {
    if (weight <= 0.001) return;
    const clip = this.clip;
    const position = (((phase % 1) + 1) % 1) * clip.frames;
    const frame = Math.floor(position) % clip.frames;
    const following = (frame + 1) % clip.frames;
    const t = position - Math.floor(position);
    const count = clip.joints.length;
    for (const { index, node } of this.targets) {
      const a = (frame * count + index) * 4;
      const b = (following * count + index) * 4;
      this.sample.set(clip.rotations[a] ?? 0, clip.rotations[a + 1] ?? 0, clip.rotations[a + 2] ?? 0, clip.rotations[a + 3] ?? 1);
      this.next.set(clip.rotations[b] ?? 0, clip.rotations[b + 1] ?? 0, clip.rotations[b + 2] ?? 0, clip.rotations[b + 3] ?? 1);
      Quaternion.SlerpToRef(this.sample, this.next, t, this.sample);
      const target = node.rotationQuaternion;
      if (target) Quaternion.SlerpToRef(target, this.sample, weight, target);
    }
  }
}

export interface MeshyCow {
  skeleton: CowSkeleton;
  mesh: Mesh;
  material: ShaderMaterial;
  strideLimit: number;
  headHeight: number;
  clip: CowClipLayer | null;
  dispose(): void;
}

/** Instantiates the Meshy cow under `viewRoot` and maps its joints. Null if the rig does not fit. */
export function buildMeshyCow(scene: Scene, asset: MascotModelAsset, viewRoot: TransformNode, name: string): MeshyCow | null {
  const rig = new TransformNode('cow-meshy-rig', scene);
  rig.parent = viewRoot;
  const visual = new TransformNode('cow-visual', scene);
  visual.parent = rig;
  const model = new TransformNode('cow-model', scene);
  model.parent = visual;
  const instance = instantiate(asset, model);
  if (!instance) {
    rig.dispose();
    return null;
  }
  // Normalise scale and placement: feet on the ground, centred over the capsule.
  const bounds = measure(asset, instance, model);
  const height = Math.max(1e-6, bounds.max.y - bounds.min.y);
  const scale = MESHY_COW_HEIGHT / height;
  const pivotY = MESHY_COW_HEIGHT * PIVOT_RATIO;
  model.scaling.setAll(scale);
  forceWorld(rig);
  const feet = ['frontleg2', 'r_frontleg2', 'backleg2', 'r_backleg2']
    .map((joint) => instance.nodes.get(joint))
    .filter((node): node is TransformNode => Boolean(node));
  let midZ = (bounds.min.z + bounds.max.z) / 2;
  if (feet.length === 4) {
    const probe = new Vector3();
    let sum = 0;
    for (const foot of feet) sum += relativePosition(foot, model, probe).z;
    midZ = sum / 4;
  }
  model.position.set(-((bounds.min.x + bounds.max.x) / 2) * scale, -pivotY - bounds.min.y * scale, -midZ * scale);
  visual.position.set(0, pivotY, 0);
  forceWorld(rig);

  const material = createMascotMaterial(scene, `mascot-cow-meshy-${name}`, { albedo: asset.albedo });
  instance.mesh.material = material;
  if (bounds.local) {
    const box = bounds.local.boundingBox;
    const pad = (box.maximum.y - box.minimum.y) * 0.5;
    const padding = new Vector3(pad, pad, pad);
    instance.mesh.setBoundingInfo(new BoundingInfo(box.minimum.subtract(padding), box.maximum.add(padding)));
  }

  const joint = (key: string): JointDriver | undefined => {
    const node = instance.nodes.get(key);
    return node ? new JointDriver(node, rig) : undefined;
  };
  const joints: Partial<Record<CowJointName, JointDriver>> = {};
  const assign = (role: CowJointName, key: string): void => {
    const driver = joint(key);
    if (driver) joints[role] = driver;
  };
  assign('chest', 'chest');
  assign('head', 'head');
  assign('bell', 'bell');
  assign('earL', 'ear_l');
  assign('earR', 'ear_r');
  assign('tail0', 'tailstart');
  assign('tail1', 'tail1');
  assign('tail2', 'tail2');
  assign('tail3', 'tail3');

  // Legs: base joint + three children each; side and end from the rest pose.
  const probe = new Vector3();
  const chains: Array<{ nodes: TransformNode[]; x: number; z: number }> = [];
  for (const base of ['frontleg', 'r_frontleg', 'backleg', 'r_backleg']) {
    const nodes: TransformNode[] = [];
    let current = instance.nodes.get(base) ?? null;
    while (current && nodes.length < 4) {
      nodes.push(current);
      const next: TransformNode | undefined = current
        .getChildren()
        .find((child): child is TransformNode => child instanceof TransformNode && !(child instanceof Mesh));
      current = next ?? null;
    }
    if (nodes.length < 3) {
      instance.dispose();
      rig.dispose();
      material.dispose();
      return null;
    }
    const top = nodes[0] as TransformNode;
    relativePosition(top, visual, probe);
    chains.push({ nodes, x: probe.x, z: probe.z });
  }
  // Order FL, FR, HL, HR by the rest pose (left = -X in model space).
  const front = chains.filter((chain) => chain.z >= 0).sort((a, b) => a.x - b.x);
  const hind = chains.filter((chain) => chain.z < 0).sort((a, b) => a.x - b.x);
  const ordered = front.length === 2 && hind.length === 2 ? [...front, ...hind] : chains;
  const legs: LegSolver[] = [];
  const legChains: TransformNode[][] = [];
  for (const chain of ordered) {
    const pivots = chain.nodes.map((node) => relativePosition(node, visual, new Vector3()));
    const last = pivots[pivots.length - 1] as Vector3;
    const sole = new Vector3(last.x, -pivotY, last.z);
    legs.push(new LegSolver(chain.nodes.map((node) => new JointDriver(node, rig)), pivots, sole));
    legChains.push(ancestors(chain.nodes[0] as TransformNode, viewRoot));
  }
  let strideLimit = Infinity;
  for (const leg of legs) strideLimit = Math.min(strideLimit, leg.strideReach(pivotY, 0.05));
  const halfWidth = ((bounds.max.x - bounds.min.x) / 2) * scale;
  const chestNode = instance.nodes.get('chest');
  const frontFromChest = Boolean(
    chestNode && ordered[0] && ordered[0].nodes[0] && ordered[0].nodes[0].isDescendantOf(chestNode),
  );
  const skeleton: CowSkeleton = {
    root: rig,
    visual,
    visualRestY: pivotY,
    joints,
    legs,
    legChains,
    frontFromChest,
    lyingHeight: halfWidth * 0.92,
    // The optimiser measured the head turned towards the cow's left (glTF +X,
    // Babylon -X); a positive yaw turns it back to the right.
    neckYawBias: asset.cow?.headYaw ?? 0,
    neckPitchBias: 0,
    bellParent: 'head',
  };
  const clip = asset.walk ? new CowClipLayer(asset.walk, instance.nodes) : null;
  return {
    skeleton,
    mesh: instance.mesh,
    material,
    strideLimit: Number.isFinite(strideLimit) ? strideLimit : 0.45,
    headHeight: MESHY_COW_HEIGHT,
    clip,
    dispose: () => {
      instance.dispose();
      rig.dispose();
      material.dispose();
    },
  };
}

/** Paint parameters for the photo-like Meshy husk: more contrast, normal relief. */
const COCONUT_PAINT = new Vector4(0.9, 1.05, 1.12, 0.18);

export interface MeshyShell {
  meshes: AbstractMesh[];
  material: ShaderMaterial;
  dispose(): void;
}

/** Places the Meshy husk under the rolling shell node, pores on top, seam to the sides. */
export function buildMeshyShell(scene: Scene, asset: MascotModelAsset, shell: TransformNode, radius: number, name: string): MeshyShell | null {
  const holder = new TransformNode('coconut-meshy-shell', scene);
  holder.parent = shell;
  const instance = instantiate(asset, holder);
  if (!instance) {
    holder.dispose();
    return null;
  }
  forceWorld(holder);
  instance.mesh.refreshBoundingInfo();
  const box = instance.mesh.getBoundingInfo().boundingBox;
  const meshRadius = Math.max(1e-6, (box.maximum.x - box.minimum.x + box.maximum.y - box.minimum.y + box.maximum.z - box.minimum.z) / 6);
  holder.scaling.setAll(radius / meshRadius);
  // Meshy put the three pores on +Z: tip them to the crown (-90° about X),
  // then turn the mirror seam away from the face and the chase camera.
  holder.rotationQuaternion = Quaternion.RotationYawPitchRoll(Math.PI / 2, -Math.PI / 2, 0);
  const material = createMascotMaterial(scene, `mascot-coconut-meshy-${name}`, {
    albedo: asset.albedo,
    normal: asset.normal,
    paint: COCONUT_PAINT,
  });
  instance.mesh.material = material;
  return {
    meshes: [instance.mesh],
    material,
    dispose: () => {
      instance.dispose();
      holder.dispose();
      material.dispose();
    },
  };
}
