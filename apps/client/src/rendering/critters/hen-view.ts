import '@babylonjs/core/Bones/skeleton';
import { AnimationGroup } from '@babylonjs/core/Animations/animationGroup';
import type { InstantiatedEntries } from '@babylonjs/core/assetContainer';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math';
import type { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import type { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { CreateDisc } from '@babylonjs/core/Meshes/Builders/discBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';
import { CRITTER_STATS } from '@frost-and-flamingos/shared';
import type { CritterPose, CritterView, CritterViewFactory } from '../../engine/critter-client';
import { registerPaintedModel, type PaintedModelSpec } from '../glb/catalog';
import { jointName, paintedModelLibrary, type PaintedModelAsset } from '../glb/library';
import { createGlbMaterial, updateGlbMaterial } from '../glb/material';
import { createShadowMaterial, excludeFromShadows, type CharacterMaterialState } from '../materials';
import { HenRig } from './hen-rig';

/**
 * The owner's painted Meshy hen in the game: loaded once through package
 * 3C's painted-model library (manifest key `hen`, sidecar base colour,
 * baked walk clip) and drawn with the shared cel/ink GLB material. Every hen
 * is one skinned mesh plus a contact-shadow disc (2 draw calls); hens do not
 * cast into the shadow map. The pose comes from {@link HenRig}.
 *
 *   root (feet, yaw)      server position, interpolated
 *   ├─ pivot              death "pop" squash
 *   │  └─ modelRoot       scale to a real hen, feet on the ground
 *   │     └─ glTF root    the armature
 *   └─ shadow disc
 */

export const HEN_MODEL_KEY = 'hen';

/** Catalogue entry: no outfit, no weapon, only the walk clip. */
const HEN_MODEL: PaintedModelSpec = {
  key: HEN_MODEL_KEY,
  file: 'hen.glb',
  native: {
    headgear: 'head_none',
    face: 'face_none',
    torso: 'none',
    back: 'back_none',
    hands: 'hands_bare',
    legs: 'none',
    feet: 'none',
  },
  clips: { walk: ['Armature|Unreal Take|baselayer'] },
  hatCutY: null,
  head: { y: 0, z: 0, radius: 0 },
  backZ: 0,
  bulk: 1,
  heightMeters: CRITTER_STATS.hen.height,
  armed: false,
};

let registered = false;

/** Registers the hen with the painted-model catalogue (before the library settles). */
export function registerHenModel(): void {
  if (registered) return;
  registered = true;
  registerPaintedModel(HEN_MODEL);
}

/** Hens farther than this from the camera are skipped (a few pixels tall). */
const DRAW_DISTANCE = 95;
const POP_SECONDS = 0.14;
const NO_EFFECTS: CharacterMaterialState = { battleDamage: 0, charred: 0, frozen: 0 };

/** Per-asset fit, measured once from the skinned neutral pose. */
interface HenFit {
  scale: number;
  /** Lift (model units) that puts the lowest toe on the ground. */
  lift: number;
  /** Yaw that turns the hen's own facing onto +Z. */
  yaw: number;
  /** Body centre (model units, x/z) that is moved onto the root, under the hitbox. */
  centreX: number;
  centreZ: number;
}

const fits = new WeakMap<PaintedModelAsset, HenFit>();
const materialFrames = new WeakMap<ShaderMaterial, number>();

function measureFit(mesh: Mesh, armature: TransformNode, rig: HenRig): HenFit {
  for (const node of armature.getChildTransformNodes(false)) node.computeWorldMatrix(true);
  mesh.computeWorldMatrix(true);
  mesh.skeleton?.prepare(true);
  const positions = mesh.getPositionData(true, false) ?? [];
  const world = mesh.getWorldMatrix();
  const point = new Vector3();
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let sumX = 0;
  let sumZ = 0;
  for (let index = 0; index < positions.length; index += 3) {
    Vector3.TransformCoordinatesFromFloatsToRef(positions[index] ?? 0, positions[index + 1] ?? 0, positions[index + 2] ?? 0, world, point);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
    sumX += point.x;
    sumZ += point.z;
  }
  const count = Math.max(1, positions.length / 3);
  const height = maxY - minY;
  const forward = Vector3.TransformNormal(rig.forwardAxis, armature.getWorldMatrix());
  return {
    scale: height > 1e-6 ? CRITTER_STATS.hen.height / height : 1,
    lift: Number.isFinite(minY) ? -minY : 0,
    yaw: -Math.atan2(forward.x, forward.z),
    centreX: sumX / count,
    centreZ: sumZ / count,
  };
}

export class HenView implements CritterView {
  private readonly scene: Scene;
  private readonly root: TransformNode;
  private readonly pivot: TransformNode;
  private readonly modelRoot: TransformNode;
  private readonly entries: InstantiatedEntries;
  private readonly mesh: Mesh;
  private readonly shadow: Mesh;
  private readonly material: ShaderMaterial;
  private readonly rig: HenRig;
  private visible = true;
  private popTime = -1;
  /** Floor under the feet (the last grounded height): the shadow stays there during hops. */
  private groundY = Number.NaN;
  private disposed = false;

  constructor(scene: Scene, asset: PaintedModelAsset, material: ShaderMaterial, shadowMaterial: StandardMaterial, id: number) {
    this.scene = scene;
    this.material = material;
    this.root = new TransformNode(`critter-hen-${id}`, scene);
    this.pivot = new TransformNode(`critter-hen-${id}-pivot`, scene);
    this.pivot.parent = this.root;
    this.modelRoot = new TransformNode(`critter-hen-${id}-model`, scene);
    this.modelRoot.parent = this.pivot;

    this.entries = asset.container.instantiateModelsToScene((name) => name, false, {
      doNotInstantiate: true,
      predicate: (entity: unknown) => !(entity instanceof AnimationGroup),
    });
    const gltfRoot = this.entries.rootNodes[0] as TransformNode | undefined;
    if (!gltfRoot) throw new Error('Hen model has no root node.');
    const mesh = gltfRoot.getChildMeshes(false).find((candidate): candidate is Mesh => candidate instanceof Mesh && candidate.skeleton !== null);
    if (!mesh) throw new Error('Hen model has no skinned mesh.');
    this.mesh = mesh;
    mesh.material = material;
    mesh.isPickable = false;
    excludeFromShadows(mesh);
    for (const child of gltfRoot.getChildMeshes(false)) child.isPickable = false;

    // Joint nodes in the bind pose, by name. The root joint keeps its own
    // glTF rest transform: its bind matrix is expressed above the armature.
    const nodes = new Map<string, TransformNode>();
    for (const node of gltfRoot.getChildTransformNodes(false)) {
      const name = jointName(node.name);
      if (!asset.jointParents.has(name) || nodes.has(name)) continue;
      const bind = asset.jointParents.get(name) ? asset.bindPose.get(name) : undefined;
      if (!node.rotationQuaternion) node.rotationQuaternion = Quaternion.FromEulerVector(node.rotation);
      if (bind) {
        node.position.copyFrom(bind.position);
        node.scaling.copyFrom(bind.scaling);
        node.rotationQuaternion = bind.rotation.clone();
      }
      nodes.set(name, node);
    }
    const hips = nodes.get('Hips');
    const armature = (hips?.parent as TransformNode | null) ?? gltfRoot;
    // World up in armature space, measured while the glTF root is unparented
    // (so the armature's world matrix is its model-space transform).
    gltfRoot.computeWorldMatrix(true);
    armature.computeWorldMatrix(true);
    const up = Vector3.TransformNormal(new Vector3(0, 1, 0), Matrix.Invert(armature.getWorldMatrix())).normalize();
    this.rig = new HenRig(nodes, asset.jointParents, asset.clips.get('walk') ?? null, up);
    this.rig.update(0, { speed: 0, behaviour: 'idle', airborne: false, verticalSpeed: 0 });

    let fit = fits.get(asset);
    if (!fit) {
      fit = measureFit(mesh, armature, this.rig);
      fits.set(asset, fit);
    }
    gltfRoot.parent = this.modelRoot;
    this.modelRoot.scaling.setAll(fit.scale);
    this.modelRoot.rotation.y = fit.yaw;
    // Body centre onto the root (the server's hit spheres are centred there).
    const cos = Math.cos(fit.yaw);
    const sin = Math.sin(fit.yaw);
    this.modelRoot.position.set(
      -(fit.centreX * cos + fit.centreZ * sin) * fit.scale,
      fit.lift * fit.scale,
      -(-fit.centreX * sin + fit.centreZ * cos) * fit.scale,
    );

    this.shadow = CreateDisc(`critter-hen-${id}-shadow`, { radius: 0.19, tessellation: 16 }, scene);
    this.shadow.rotation.x = Math.PI / 2;
    this.shadow.scaling.y = 1.4;
    this.shadow.position.y = 0.02;
    this.shadow.material = shadowMaterial;
    this.shadow.isPickable = false;
    this.shadow.parent = this.root;
    this.shadow.alphaIndex = 0;
    excludeFromShadows(this.shadow);
  }

  update(delta: number, pose: CritterPose): void {
    if (this.disposed) return;
    this.root.position.set(pose.position.x, pose.position.y, pose.position.z);
    this.root.rotation.y = pose.yaw;
    const camera = this.scene.activeCamera;
    const near = !camera || Vector3.DistanceSquared(camera.position, this.root.position) < DRAW_DISTANCE * DRAW_DISTANCE;
    if (this.popTime >= 0) {
      this.popTime += delta;
      const t = Math.min(1, this.popTime / POP_SECONDS);
      this.pivot.scaling.set(1 + t * 0.55, 1 - t * 0.7, 1 + t * 0.55);
      if (t >= 1) {
        this.popTime = -1;
        this.visible = false;
      }
    }
    this.root.setEnabled(this.visible && near);
    if (!this.visible || !near) return;
    // Hens airborne in a hop: the shadow stays on the ground below.
    if (!pose.airborne || !Number.isFinite(this.groundY)) this.groundY = pose.position.y;
    this.shadow.position.y = Math.min(0, this.groundY - pose.position.y) + 0.02;
    this.rig.update(delta, pose);
    // One shared material: refresh its camera uniforms once per frame.
    const frame = this.scene.getFrameId();
    if (camera && materialFrames.get(this.material) !== frame) {
      materialFrames.set(this.material, frame);
      updateGlbMaterial(this.material, camera.position, performance.now() / 1000, NO_EFFECTS);
    }
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.popTime = -1;
    this.pivot.scaling.setAll(1);
    this.root.setEnabled(visible);
  }

  pop(): void {
    if (!this.visible) return;
    this.popTime = 0;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.entries.dispose();
    this.shadow.dispose();
    this.modelRoot.dispose();
    this.pivot.dispose();
    this.root.dispose();
  }
}

/**
 * View factory for CritterClient. Returns null until the painted hen model
 * and its texture have loaded (or forever when the model is not shipped):
 * hens are then simply not drawn, never shown as a stand-in.
 */
export function createCritterViewFactory(scene: Scene): CritterViewFactory {
  registerHenModel();
  const library = paintedModelLibrary(scene);
  const shadowMaterial = createShadowMaterial(scene, 'critter-shadow');
  let material: ShaderMaterial | null = null;
  let requested = false;
  return (species, id) => {
    if (species !== 'hen') return null;
    // The library loads per model on request: the first hen seen fetches the
    // model and its texture; views appear once both are in.
    if (!requested) {
      requested = true;
      void library.loadWithTextures(HEN_MODEL_KEY);
    }
    const asset = library.get(HEN_MODEL_KEY);
    const textures = library.loadedTexturesOf(HEN_MODEL_KEY);
    if (!asset || !asset.skinned || !textures) return null;
    material ??= createGlbMaterial(scene, 'critter-hen', textures);
    try {
      return new HenView(scene, asset, material, shadowMaterial, id);
    } catch (error) {
      console.warn('[frost-and-flamingos] hen view failed', error);
      return null;
    }
  };
}
