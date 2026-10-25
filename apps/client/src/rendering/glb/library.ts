import '@babylonjs/loaders/glTF/2.0/glTFLoader';
import '@babylonjs/loaders/glTF/2.0/Extensions/KHR_mesh_quantization';
import '@babylonjs/loaders/glTF/2.0/Extensions/KHR_texture_transform';
import '@babylonjs/loaders/glTF/2.0/Extensions/EXT_texture_webp';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { GLTFLoaderAnimationStartMode } from '@babylonjs/loaders/glTF/glTFFileLoader';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import type { AssetContainer } from '@babylonjs/core/assetContainer';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { SubMesh } from '@babylonjs/core/Meshes/subMesh';
import type { Scene } from '@babylonjs/core/scene';
import {
  DEFAULT_CLIPS,
  paintedModelSpecByKey,
  resolveClip,
  type ClipRole,
  type PaintedModelSpec,
} from './catalog';
import { bakeAnimationGroup, gaitContactPhase, jointName, readRig, stanceSpeed, type BakedClip, type RigInfo } from './clips';
import { readBakedClips, readGlb, writeGlb } from './glb-binary';
import type { PaintedTextures } from './material';

export { BAKE_FPS, bindWorldTransform, jointName, type BakedClip, type BindPose } from './clips';

/**
 * Loads the owner's painted GLB characters per scene into AssetContainers;
 * every player view instantiates its own clone (shared geometry and
 * textures, cloned skeleton and joint nodes).
 *
 * Lazy and per model: a model is fetched only when a view needs it (a
 * character on screen, the wardrobe preview, or the local player's class
 * prefetched at boot). Every GLB is self-contained: `bun run models` bakes
 * each model's full clip set into it (`ff:<role>` animations, including the
 * roles retargeted offline from other models), so no donor model is ever
 * loaded at runtime. Baked clips are read straight from the GLB binary into
 * dense 30 Hz tables (see glb-binary.ts); Babylon never builds animation
 * groups for them. Unbaked GLBs (e.g. critters) still bake their glTF clips
 * through the per-model clip table at load time.
 *
 * Generic over any GLB the manifest lists and the catalogue registers
 * (skinned or static): the GLB itself loads without materials, and the
 * painted textures are separate sidecar files that are only fetched for
 * models actually shown ({@link PaintedModelLibrary.textures}).
 *
 * Only files listed in `models/manifest.json` (written by `bun run models`)
 * are requested, so classes whose model has not arrived never cause a 404.
 */
export interface PaintedModelAsset extends RigInfo {
  spec: PaintedModelSpec;
  container: AssetContainer;
  /** false for static GLBs (no skeleton, no clips). */
  skinned: boolean;
  clipNames: ReadonlySet<string>;
  /** Bind-pose height of the model (top of head/hat above the feet). */
  height: number;
  /** Index ranges of the body and the removable painted headgear. */
  hatSplit: { bodyCount: number; hatCount: number } | null;
  /**
   * Bind-pose torso depth around the chest joint (armature z, +Z forward):
   * where back items sit and how far held props stay in front. Null for
   * static or unrigged models.
   */
  torso: TorsoDepth | null;
  /** Resolved clip per animation role (baked offline, or baked at load). */
  clips: Map<ClipRole, BakedClip>;
}

export interface TorsoDepth {
  /** Bind z of the chest joint (Spine2). */
  chestZ: number;
  /** Frontmost chest/belly surface around chest height. */
  front: number;
  /** Back surface behind the spine at chest height. */
  back: number;
}

/** Measures the bind-pose torso around Spine2 from the skinned vertices. */
function measureTorso(mesh: Mesh, rig: RigInfo): TorsoDepth | null {
  const chest = rig.bindPositions.get('Spine2');
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
  if (!chest || !positions) return null;
  let front = -Infinity;
  let back = Infinity;
  for (let vertex = 0; vertex < positions.length / 3; vertex += 1) {
    const x = (positions[vertex * 3] ?? 0) - chest.x;
    const y = (positions[vertex * 3 + 1] ?? 0) - chest.y;
    const z = positions[vertex * 3 + 2] ?? 0;
    if (Math.abs(y) < 0.12 && Math.abs(x) < 0.25) front = Math.max(front, z);
    if (Math.abs(y) < 0.06 && Math.abs(x) < 0.08) back = Math.min(back, z);
  }
  if (!Number.isFinite(front) || !Number.isFinite(back)) return null;
  return { chestZ: chest.z, front, back };
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

/** Yields to the browser so baking never blocks a frame for long. */
function nextTask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

const KNOWN_ROLES = new Set<string>(Object.keys(DEFAULT_CLIPS));

function isClipRole(role: string): role is ClipRole {
  return KNOWN_ROLES.has(role);
}

async function loadModel(scene: Scene, spec: PaintedModelSpec, file: string): Promise<PaintedModelAsset | null> {
  const response = await fetch(`${MODELS_BASE}${file}`);
  if (!response.ok) throw new Error(`${file}: HTTP ${response.status}`);
  let bytes: Uint8Array = new Uint8Array(await response.arrayBuffer());
  // Clips baked by the pipeline are read straight from the binary; the
  // animations are then removed so Babylon builds no animation groups.
  const parts = readGlb(bytes);
  const baked = readBakedClips(parts);
  if (baked.size > 0) {
    delete parts.json.animations;
    bytes = writeGlb(parts);
  }
  const container = await LoadAssetContainerAsync(bytes, scene, {
    rootUrl: MODELS_BASE,
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
  const rig = readRig(skeleton);

  const asset: PaintedModelAsset = {
    ...rig,
    spec,
    container,
    skinned: skeleton !== null,
    clipNames: new Set(baked.size > 0 ? [...baked.values()].map((clip) => clip.name) : container.animationGroups.map((group) => group.name)),
    height,
    hatSplit,
    torso: skeleton ? measureTorso(mesh, rig) : null,
    clips: new Map(),
  };
  if (baked.size > 0) {
    for (const [role, clip] of baked) if (isClipRole(role)) asset.clips.set(role, clip);
  } else {
    for (const role of Object.keys(DEFAULT_CLIPS) as ClipRole[]) {
      const name = resolveClip(spec, role, asset.clipNames);
      const group = name ? container.animationGroups.find((candidate) => candidate.name === name) : undefined;
      if (!group) continue;
      asset.clips.set(role, bakeAnimationGroup(group, rig.bindPose));
      await nextTask();
    }
  }
  // Locomotion cycles share one phase in the animator: record each one's
  // left heel strike so they blend in step, and the ground speed at which
  // it plays without sliding.
  for (const role of ['walk', 'combatWalk', 'run', 'sprint', 'backpedal', 'crouchBack'] as const) {
    const clip = asset.clips.get(role);
    if (!clip) continue;
    const backward = role === 'backpedal' || role === 'crouchBack';
    asset.clips.set(role, {
      ...clip,
      contactPhase: gaitContactPhase(clip, rig, backward),
      naturalSpeed: stanceSpeed(clip, rig) ?? undefined,
    });
  }
  // The jump clip's hips rise (up to 0.4 m in the Meshy clips) would lift the
  // body off the physics capsule while it is held at the apex: cap the hips
  // at their bind height (apexTime keeps the original peak).
  const air = asset.clips.get('air');
  const bindHips = rig.bindPose.get('Hips')?.position;
  if (air?.hips && bindHips) {
    const hips = air.hips.slice();
    for (let frame = 0; frame < air.frames; frame += 1) hips[frame * 3 + 1] = Math.min(hips[frame * 3 + 1] ?? 0, bindHips.y);
    asset.clips.set('air', { ...air, hips });
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
  /** Load time per model (ms, request to ready), for the DEV probe. */
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

  /**
   * 'pending' until the manifest is read, 'missing' when the model is not
   * listed, 'loading' until it has loaded (whether requested yet or not),
   * then 'ready' or 'failed'.
   */
  status(key: string): PaintedModelStatus {
    if (!this.manifestEntries) return 'pending';
    if (!this.manifestEntries.has(key)) return 'missing';
    if (!this.assets.has(key)) return 'loading';
    return this.assets.get(key) ? 'ready' : 'failed';
  }

  /** True once the model was requested (DEV probe). */
  requested(key: string): boolean {
    return this.loads.has(key);
  }

  /** The loaded model, or null while it is not loaded (no fetch). */
  get(key: string): PaintedModelAsset | null {
    return this.assets.get(key) ?? null;
  }

  /** Loads one model on first request (shared by every view of it). */
  load(key: string): Promise<PaintedModelAsset | null> {
    const existing = this.loads.get(key);
    if (existing) return existing;
    const started = performance.now();
    const promise = this.manifest.then(async (entries) => {
      const entry = entries.get(key);
      const spec = paintedModelSpecByKey(key);
      if (!entry || !spec) {
        this.assets.set(key, null);
        return null;
      }
      try {
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

  /** Model and painted textures together (null when either is unavailable). */
  async loadWithTextures(key: string): Promise<{ asset: PaintedModelAsset; textures: PaintedTextures } | null> {
    const [asset, textures] = await Promise.all([this.load(key), this.textures(key)]);
    if (asset && textures) return { asset, textures };
    // Half a model is no model: release whichever half did load.
    if (textures) {
      textures.albedo.dispose();
      textures.normal?.dispose();
      this.loadedTextures.delete(key);
      this.textureLoads.set(key, Promise.resolve(null));
    }
    if (asset) {
      asset.container.dispose();
      this.assets.set(key, null);
      this.loads.set(key, Promise.resolve(null));
    }
    return null;
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
   * Loads every registered model in the manifest (tools and tests; the game
   * itself loads models lazily). Each model is independent, so this only
   * batches {@link load}.
   */
  settled(): Promise<void> {
    if (!this.settledPromise) {
      this.settledPromise = this.manifest.then(async (entries) => {
        const keys = [...entries.keys()].filter((key) => paintedModelSpecByKey(key) !== null);
        await Promise.all(keys.map((key) => this.load(key)));
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

  /** True once {@link settled} loaded every listed model. */
  get ready(): boolean {
    return this.isSettled;
  }

  /** True while no requested model is still loading (DEV probe). */
  get idle(): boolean {
    for (const key of this.loads.keys()) if (!this.assets.has(key)) return false;
    return true;
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
