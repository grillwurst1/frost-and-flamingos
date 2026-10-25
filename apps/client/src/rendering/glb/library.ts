import '@babylonjs/loaders/glTF/2.0/glTFLoader';
import '@babylonjs/loaders/glTF/2.0/Extensions/KHR_mesh_quantization';
import '@babylonjs/loaders/glTF/2.0/Extensions/KHR_texture_transform';
import '@babylonjs/loaders/glTF/2.0/Extensions/EXT_texture_webp';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { GLTFLoaderAnimationStartMode } from '@babylonjs/loaders/glTF/glTFFileLoader';
import type { Animation } from '@babylonjs/core/Animations/animation';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import type { AssetContainer } from '@babylonjs/core/assetContainer';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { SubMesh } from '@babylonjs/core/Meshes/subMesh';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';
import {
  DEFAULT_CLIPS,
  RETARGET_ROLES,
  paintedModelSpecByKey,
  resolveClip,
  type ClipRole,
  type PaintedModelSpec,
} from './catalog';
import type { PaintedTextures } from './material';

/**
 * Loads the owner's painted GLB characters once per scene into
 * AssetContainers; every player view instantiates its own clone (shared
 * geometry and textures, cloned skeleton and joint nodes).
 *
 * Generic over any GLB the manifest lists and the catalogue registers
 * (skinned or static): the GLB itself (mesh, skeleton, clips) loads without
 * materials, and the painted textures are separate sidecar files that are
 * only fetched for models actually shown ({@link PaintedModelLibrary.textures}).
 *
 * Animation clips are baked once per model into dense 30 Hz rotation tables
 * (plus hips translation) so the per-view animator can blend, scrub and mask
 * them with plain array maths and zero allocations. Clips a model lacks are
 * retargeted from other models (see {@link retargetClip}).
 *
 * Only files listed in `models/manifest.json` (written by `bun run models`)
 * are requested, so classes whose model has not arrived never cause a 404.
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
}

export interface PaintedModelAsset {
  spec: PaintedModelSpec;
  container: AssetContainer;
  /** false for static GLBs (no skeleton, no clips). */
  skinned: boolean;
  clipNames: ReadonlySet<string>;
  /** Bind-pose height of the model (top of head/hat above the feet). */
  height: number;
  /** Index ranges of the body and the removable painted headgear. */
  hatSplit: { bodyCount: number; hatCount: number } | null;
  /** Local bind pose per normalised joint name (from the inverse bind matrices). */
  bindPose: ReadonlyMap<string, BindPose>;
  /** Bind-pose position (armature space) per normalised joint name. */
  bindPositions: ReadonlyMap<string, Vector3>;
  /** Parent joint (normalised names); null for the skeleton root. */
  jointParents: ReadonlyMap<string, string | null>;
  /** Resolved clip per animation role (native or retargeted). */
  clips: Map<ClipRole, BakedClip>;
}

export type PaintedModelStatus = 'pending' | 'missing' | 'loading' | 'ready' | 'failed';

interface ManifestEntry {
  file: string;
  /** Sidecar texture files by slot ("basecolor", "normal"). */
  textures: Readonly<Record<string, string>>;
}

const FILE_PATTERN = /^[a-z0-9-]+\.(glb|webp|jpg|png)$/;

const MODELS_BASE = `${import.meta.env.BASE_URL}models/`;

async function fetchManifest(): Promise<ReadonlyMap<string, ManifestEntry>> {
  const result = new Map<string, ManifestEntry>();
  // `?painted=0` keeps every class on the procedural rig (QA / comparisons).
  if (typeof location !== 'undefined' && new URLSearchParams(location.search).get('painted') === '0') return result;
  try {
    const response = await fetch(`${MODELS_BASE}manifest.json`, { cache: 'no-cache' });
    if (!response.ok) return result;
    const type = response.headers.get('content-type') ?? '';
    if (!type.includes('json')) return result;
    const data: unknown = await response.json();
    if (!data || typeof data !== 'object') return result;
    const models = (data as { models?: unknown }).models;
    if (!models || typeof models !== 'object') return result;
    for (const [key, value] of Object.entries(models as Record<string, unknown>)) {
      if (!value || typeof value !== 'object') continue;
      const entry = value as { file?: unknown; textures?: unknown };
      if (typeof entry.file !== 'string' || !FILE_PATTERN.test(entry.file)) continue;
      const textures: Record<string, string> = {};
      if (entry.textures && typeof entry.textures === 'object') {
        for (const [slot, file] of Object.entries(entry.textures as Record<string, unknown>)) {
          if (typeof file === 'string' && FILE_PATTERN.test(file)) textures[slot] = file;
        }
      }
      result.set(key, { file: entry.file, textures });
    }
  } catch {
    // Offline or malformed manifest: every class keeps the procedural rig.
  }
  return result;
}

function headBoneIndices(mesh: Mesh): Set<number> {
  const indices = new Set<number>();
  const skeleton = mesh.skeleton;
  if (!skeleton) return indices;
  const head = skeleton.bones.find((bone) => jointName(bone.name) === 'Head');
  if (!head) return indices;
  const stack = [head];
  while (stack.length > 0) {
    const bone = stack.pop();
    if (!bone) break;
    indices.add(bone.getIndex());
    stack.push(...bone.getChildren());
  }
  return indices;
}

/**
 * Reorders the triangle list so the painted headgear (head-skinned triangles
 * above `cutY` in the bind pose) comes last, then splits the mesh into a body
 * and a headgear sub-mesh. Views that swap the headgear drop the second one.
 */
function splitHat(mesh: Mesh, cutY: number): { bodyCount: number; hatCount: number } | null {
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
  const joints = mesh.getVerticesData(VertexBuffer.MatricesIndicesKind);
  const weights = mesh.getVerticesData(VertexBuffer.MatricesWeightsKind);
  const indices = mesh.getIndices();
  if (!positions || !joints || !weights || !indices) return null;
  const headBones = headBoneIndices(mesh);
  if (headBones.size === 0) return null;
  const vertexCount = positions.length / 3;
  const isHat = new Uint8Array(vertexCount);
  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    let headWeight = 0;
    for (let slot = 0; slot < 4; slot += 1) {
      const joint = joints[vertex * 4 + slot] ?? 0;
      if (headBones.has(joint)) headWeight += weights[vertex * 4 + slot] ?? 0;
    }
    const y = positions[vertex * 3 + 1] ?? 0;
    isHat[vertex] = headWeight > 0.5 && y > cutY ? 1 : 0;
  }
  const body: number[] = [];
  const hat: number[] = [];
  for (let index = 0; index + 2 < indices.length; index += 3) {
    const a = indices[index] ?? 0;
    const b = indices[index + 1] ?? 0;
    const c = indices[index + 2] ?? 0;
    // Two or more hat vertices: the triangle belongs to the hat, so no
    // saw-tooth fringe is left on the body when the hat comes off.
    const target = (isHat[a] ?? 0) + (isHat[b] ?? 0) + (isHat[c] ?? 0) >= 2 ? hat : body;
    target.push(a, b, c);
  }
  if (hat.length === 0) return null;
  mesh.setIndices([...body, ...hat], vertexCount);
  mesh.subMeshes = [];
  new SubMesh(0, 0, vertexCount, 0, body.length, mesh);
  new SubMesh(0, 0, vertexCount, body.length, hat.length, mesh);
  return { bodyCount: body.length, hatCount: hat.length };
}

/** Loads one painted texture with trilinear mipmaps and anisotropy. */
function loadTexture(scene: Scene, file: string): Promise<Texture | null> {
  return new Promise((resolve) => {
    const texture: Texture = new Texture(`${MODELS_BASE}${file}`, scene, {
      noMipmap: false,
      invertY: false,
      samplingMode: Texture.TRILINEAR_SAMPLINGMODE,
      onLoad: () => resolve(texture),
      onError: () => {
        texture.dispose();
        resolve(null);
      },
    });
    texture.anisotropicFilteringLevel = 8;
    texture.wrapU = Texture.CLAMP_ADDRESSMODE;
    texture.wrapV = Texture.CLAMP_ADDRESSMODE;
  });
}

function apexOf(clip: Omit<BakedClip, 'apexTime'>): number {
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
function bakeGroup(
  name: string,
  from: number,
  to: number,
  tracks: ReadonlyArray<{ bone: string; property: string; animation: Animation }>,
  bindPose: ReadonlyMap<string, BindPose>,
): BakedClip {
  const fps = tracks[0]?.animation.framePerSecond ?? 60;
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
function bindWorldRotations(asset: PaintedModelAsset): Map<string, Quaternion> {
  const world = new Map<string, Quaternion>();
  const resolve = (name: string): Quaternion => {
    const cached = world.get(name);
    if (cached) return cached;
    const local = asset.bindPose.get(name)?.rotation ?? Quaternion.Identity();
    const parent = asset.jointParents.get(name) ?? null;
    const result = parent ? resolve(parent).multiply(local) : local.clone();
    world.set(name, result);
    return result;
  };
  for (const name of asset.jointParents.keys()) resolve(name);
  return world;
}

/** Bind-pose transform of one joint in armature space (for bone attachments). */
export function bindWorldTransform(asset: PaintedModelAsset, joint: string): { rotation: Quaternion; position: Vector3 } | null {
  const position = asset.bindPositions.get(joint);
  if (!position) return null;
  const rotation = bindWorldRotations(asset).get(joint) ?? Quaternion.Identity();
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
function bindAlignment(source: PaintedModelAsset, target: PaintedModelAsset): Map<string, Quaternion> {
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

function depthOf(asset: PaintedModelAsset, name: string): number {
  let depth = 0;
  for (let parent = asset.jointParents.get(name) ?? null; parent; parent = asset.jointParents.get(parent) ?? null) depth += 1;
  return depth;
}

/**
 * Transfers a clip between two Mixamo rigs as world-space rotation deltas from
 * each rig's bind pose: D = W_src(t) * W_src_bind^-1, and
 * W_dst = D * A * W_dst_bind, where A first turns the target's bind bone
 * direction onto the donor's. Joints are matched by Mixamo name (missing ones
 * keep their bind pose); hips translation is scaled by the hip-height ratio.
 */
function retargetClip(source: PaintedModelAsset, clip: BakedClip, target: PaintedModelAsset): BakedClip {
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
    retargetedFrom: source.spec.key,
  };
  return { ...baked, apexTime: apexOf(baked) };
}

/** Yields to the browser so baking never blocks a frame for long. */
function nextTask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Fills roles a model lacks with clips retargeted from other loaded models. */
async function shareClips(assets: readonly PaintedModelAsset[]): Promise<void> {
  for (const target of assets) {
    for (const role of RETARGET_ROLES) {
      if (target.clips.has(role)) continue;
      // Donor preference follows the candidate order in DEFAULT_CLIPS (e.g. a
      // real jump before a hop), then the catalogue order.
      let donor: PaintedModelAsset | null = null;
      let clip: BakedClip | null = null;
      for (const name of DEFAULT_CLIPS[role]) {
        for (const candidate of assets) {
          const own = candidate.clips.get(role);
          if (candidate !== target && own && own.retargetedFrom === null && own.name === name) {
            donor = candidate;
            clip = own;
            break;
          }
        }
        if (donor) break;
      }
      if (!donor || !clip) continue;
      target.clips.set(role, retargetClip(donor, clip, target));
      await nextTask();
    }
  }
}

async function loadModel(scene: Scene, spec: PaintedModelSpec, file: string): Promise<PaintedModelAsset | null> {
  const container = await LoadAssetContainerAsync(`${MODELS_BASE}${file}`, scene, {
    pluginExtension: '.glb',
    pluginOptions: {
      gltf: {
        animationStartMode: GLTFLoaderAnimationStartMode.NONE,
        compileMaterials: false,
        // Mesh, skeleton and clips only: the painted textures are sidecar
        // files loaded on demand (and never as PBR materials).
        skipMaterials: true,
      },
    },
  });
  // Skinned characters carry one skinned mesh; static props any mesh.
  const mesh =
    container.meshes.find((candidate): candidate is Mesh => candidate instanceof Mesh && candidate.skeleton !== null) ??
    container.meshes.find((candidate): candidate is Mesh => candidate instanceof Mesh && candidate.getTotalVertices() > 0);
  if (!mesh) {
    container.dispose();
    return null;
  }
  const skeleton = mesh.skeleton;
  const bounds = mesh.getBoundingInfo().boundingBox;
  const height = Math.max(0.05, bounds.maximum.y - Math.min(0, bounds.minimum.y));
  const hatSplit = spec.hatCutY === null || !skeleton ? null : splitHat(mesh, spec.hatCutY);

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

  const asset: PaintedModelAsset = {
    spec,
    container,
    skinned: skeleton !== null,
    clipNames: new Set(container.animationGroups.map((group) => group.name)),
    height,
    hatSplit,
    bindPose,
    bindPositions,
    jointParents,
    clips: new Map(),
  };
  for (const role of Object.keys(DEFAULT_CLIPS) as ClipRole[]) {
    const name = resolveClip(spec, role, asset.clipNames);
    const group = name ? container.animationGroups.find((candidate) => candidate.name === name) : undefined;
    if (!group) continue;
    const tracks: Array<{ bone: string; property: string; animation: Animation }> = [];
    for (const targeted of group.targetedAnimations) {
      const target = targeted.target as TransformNode | null;
      if (!target) continue;
      tracks.push({ bone: jointName(target.name), property: targeted.animation.targetProperty, animation: targeted.animation });
    }
    asset.clips.set(role, bakeGroup(group.name, group.from, group.to, tracks, bindPose));
    await nextTask();
  }
  // The baked tables replace the glTF animation groups.
  for (const group of [...container.animationGroups]) group.dispose();
  container.animationGroups.length = 0;
  return asset;
}

export class PaintedModelLibrary {
  private readonly scene: Scene;
  private readonly manifest: Promise<ReadonlyMap<string, ManifestEntry>>;
  private manifestEntries: ReadonlyMap<string, ManifestEntry> | null = null;
  private readonly loads = new Map<string, Promise<PaintedModelAsset | null>>();
  private readonly assets = new Map<string, PaintedModelAsset | null>();
  private settledPromise: Promise<void> | null = null;
  private isSettled = false;
  private readonly textureLoads = new Map<string, Promise<PaintedTextures | null>>();
  private readonly loadedTextures = new Map<string, PaintedTextures>();
  /** Load time per model (ms), for the DEV probe. */
  readonly timings = new Map<string, number>();

  private resolveSettled: () => void = () => {};
  private readonly settledSignal: Promise<void>;

  constructor(scene: Scene) {
    this.scene = scene;
    this.settledSignal = new Promise((resolve) => {
      this.resolveSettled = resolve;
    });
    this.manifest = fetchManifest().then((entries) => {
      this.manifestEntries = entries;
      return entries;
    });
  }

  /** The scene this library loads into (DEV probes). */
  get sceneRef(): Scene {
    return this.scene;
  }

  /** Model keys that exist on the server (resolves once the manifest is read). */
  async available(): Promise<ReadonlySet<string>> {
    const entries = await this.manifest;
    return new Set(entries.keys());
  }

  status(key: string): PaintedModelStatus {
    if (!this.manifestEntries) return 'pending';
    if (!this.manifestEntries.has(key)) return 'missing';
    if (!this.assets.has(key) || !this.isSettled) return 'loading';
    return this.assets.get(key) ? 'ready' : 'failed';
  }

  /** The loaded model, once every listed model has settled (clips shared). */
  get(key: string): PaintedModelAsset | null {
    return this.isSettled ? this.assets.get(key) ?? null : null;
  }

  private load(key: string): Promise<PaintedModelAsset | null> {
    const existing = this.loads.get(key);
    if (existing) return existing;
    const promise = this.manifest.then(async (entries) => {
      const entry = entries.get(key);
      const spec = paintedModelSpecByKey(key);
      if (!entry || !spec) {
        this.assets.set(key, null);
        return null;
      }
      try {
        const started = performance.now();
        const asset = await loadModel(this.scene, spec, entry.file);
        this.assets.set(key, asset);
        this.timings.set(key, Math.round(performance.now() - started));
        return asset;
      } catch (error) {
        console.warn(`[frost-and-flamingos] painted model ${key} failed to load; using the procedural rig`, error);
        this.assets.set(key, null);
        return null;
      }
    });
    this.loads.set(key, promise);
    return promise;
  }

  /**
   * Painted textures of one model (sidecar files from the manifest), loaded
   * once on first use and shared by every view of that model.
   */
  textures(key: string): Promise<PaintedTextures | null> {
    const existing = this.textureLoads.get(key);
    if (existing) return existing;
    const promise = this.manifest.then(async (entries) => {
      const files = entries.get(key)?.textures;
      const albedoFile = files?.basecolor;
      if (!albedoFile) return null;
      const [albedo, normal] = await Promise.all([
        loadTexture(this.scene, albedoFile),
        files.normal ? loadTexture(this.scene, files.normal) : Promise.resolve(null),
      ]);
      if (!albedo) {
        normal?.dispose();
        return null;
      }
      const textures: PaintedTextures = { albedo, normal };
      this.loadedTextures.set(key, textures);
      return textures;
    });
    this.textureLoads.set(key, promise);
    return promise;
  }

  /** Textures of a model if they finished loading, else null (no fetch). */
  loadedTexturesOf(key: string): PaintedTextures | null {
    return this.loadedTextures.get(key) ?? null;
  }

  /**
   * Loads every registered model in the manifest (boot-time warm-up), then
   * lets models borrow clips they lack from each other. Views wait for this.
   */
  settled(): Promise<void> {
    if (!this.settledPromise) {
      this.settledPromise = this.manifest.then(async (entries) => {
        const keys = [...entries.keys()].filter((key) => paintedModelSpecByKey(key) !== null);
        const assets = await Promise.all(keys.map((key) => this.load(key)));
        await shareClips(assets.filter((asset): asset is PaintedModelAsset => asset !== null && asset.skinned));
        this.isSettled = true;
        this.resolveSettled();
      });
    }
    return this.settledPromise;
  }

  /** Resolves once {@link settled} has finished, without starting the downloads. */
  whenSettled(): Promise<void> {
    return this.settledSignal;
  }

  /** True once every listed model has loaded (or failed) and shared its clips. */
  get ready(): boolean {
    return this.isSettled;
  }

  dispose(): void {
    for (const asset of this.assets.values()) asset?.container.dispose();
    for (const textures of this.loadedTextures.values()) {
      textures.albedo.dispose();
      textures.normal?.dispose();
    }
    this.assets.clear();
    this.loads.clear();
    this.textureLoads.clear();
    this.loadedTextures.clear();
  }
}

const libraries = new WeakMap<Scene, PaintedModelLibrary>();

export function paintedModelLibrary(scene: Scene): PaintedModelLibrary {
  let library = libraries.get(scene);
  if (!library) {
    library = new PaintedModelLibrary(scene);
    libraries.set(scene, library);
    const created = library;
    scene.onDisposeObservable.addOnce(() => {
      created.dispose();
      libraries.delete(scene);
    });
  }
  return library;
}
