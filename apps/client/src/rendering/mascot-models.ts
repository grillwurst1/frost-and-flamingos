import '@babylonjs/loaders/glTF/2.0/glTFLoader';
import { GLTFLoaderAnimationStartMode } from '@babylonjs/loaders/glTF/glTFFileLoader';
import type { AssetContainer } from '@babylonjs/core/assetContainer';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import type { BaseTexture } from '@babylonjs/core/Materials/Textures/baseTexture';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';

/**
 * The owner's Meshy mascot models (public/models/mascots, written by
 * scripts/optimize-mascots.ts), loaded once per scene into AssetContainers;
 * every mascot view clones its own instance (shared geometry and textures,
 * own skeleton and joint nodes).
 *
 * Only files listed in models/mascots/manifest.json are requested, so a
 * missing model never causes a 404: the procedural mascot is the fallback.
 *
 * Seam with package 3C (rendering/glb/library.ts, soldier GLBs): both load a
 * manifest and keep AssetContainers per scene; once both are merged the two
 * loaders can share one implementation. Mascots keep their own manifest so
 * the two optimiser scripts never write the same file.
 */
export type MascotModelKey = 'cow' | 'coconut';
export type MascotModelStatus = 'pending' | 'loading' | 'ready' | 'missing' | 'failed';

/** One animation clip baked to a dense 30 Hz table, bound to joints by name. */
export interface BakedClip {
  name: string;
  duration: number;
  frames: number;
  joints: readonly string[];
  /** frames × joints × (x, y, z, w) local rotations. */
  rotations: Float32Array;
  /** Root joint name and its frames × (x, y, z) local translations, or null. */
  rootJoint: string | null;
  rootTranslations: Float32Array | null;
}

export interface CowModelInfo {
  /** Rest head yaw measured by the optimiser (glTF space, + = towards the cow's left). */
  headYaw: number;
}

export interface MascotModelAsset {
  key: MascotModelKey;
  container: AssetContainer;
  albedo: BaseTexture;
  normal: BaseTexture | null;
  walk: BakedClip | null;
  cow: CowModelInfo | null;
}

interface ManifestEntry {
  file: string;
  rig?: { headYaw?: number };
}

const BASE = `${import.meta.env.BASE_URL}models/mascots/`;
export const BAKE_FPS = 30;

interface Entry {
  status: MascotModelStatus;
  asset: MascotModelAsset | null;
  listeners: Set<() => void>;
}

class MascotModelLibrary {
  private readonly entries = new Map<MascotModelKey, Entry>();
  private manifest: Promise<Map<string, ManifestEntry>> | null = null;

  constructor(private readonly scene: Scene) {
    for (const key of ['cow', 'coconut'] as const) {
      this.entries.set(key, { status: 'pending', asset: null, listeners: new Set() });
    }
  }

  status(key: MascotModelKey): MascotModelStatus {
    return this.entries.get(key)?.status ?? 'missing';
  }

  asset(key: MascotModelKey): MascotModelAsset | null {
    return this.entries.get(key)?.asset ?? null;
  }

  /** Calls back once the model is ready, missing or failed (immediately if settled). */
  whenSettled(key: MascotModelKey, callback: () => void): () => void {
    const entry = this.entries.get(key);
    if (!entry) {
      callback();
      return () => undefined;
    }
    this.load(key);
    if (entry.status === 'ready' || entry.status === 'missing' || entry.status === 'failed') {
      callback();
      return () => undefined;
    }
    entry.listeners.add(callback);
    return () => entry.listeners.delete(callback);
  }

  load(key: MascotModelKey): void {
    const entry = this.entries.get(key);
    if (!entry || entry.status !== 'pending') return;
    entry.status = 'loading';
    void this.loadEntry(key, entry);
  }

  private settle(entry: Entry, status: MascotModelStatus, asset: MascotModelAsset | null): void {
    entry.status = status;
    entry.asset = asset;
    for (const listener of [...entry.listeners]) listener();
    entry.listeners.clear();
  }

  private fetchManifest(): Promise<Map<string, ManifestEntry>> {
    if (this.manifest) return this.manifest;
    this.manifest = (async () => {
      const result = new Map<string, ManifestEntry>();
      try {
        const response = await fetch(`${BASE}manifest.json`, { cache: 'no-cache' });
        if (!response.ok || !(response.headers.get('content-type') ?? '').includes('json')) return result;
        const data: unknown = await response.json();
        const models = data && typeof data === 'object' ? (data as { models?: unknown }).models : null;
        if (!models || typeof models !== 'object') return result;
        for (const [key, value] of Object.entries(models as Record<string, unknown>)) {
          if (!value || typeof value !== 'object') continue;
          const file = (value as { file?: unknown }).file;
          if (typeof file !== 'string' || !/^[a-z0-9-]+\.glb$/.test(file)) continue;
          const rig = (value as { rig?: unknown }).rig;
          const headYaw = rig && typeof rig === 'object' ? (rig as { headYaw?: unknown }).headYaw : undefined;
          result.set(key, { file, rig: { headYaw: typeof headYaw === 'number' ? headYaw : 0 } });
        }
      } catch {
        // Offline or malformed manifest: the procedural mascots stay.
      }
      return result;
    })();
    return this.manifest;
  }

  private async loadEntry(key: MascotModelKey, entry: Entry): Promise<void> {
    const manifest = await this.fetchManifest();
    const spec = manifest.get(key);
    if (!spec) {
      this.settle(entry, 'missing', null);
      return;
    }
    try {
      const container = await LoadAssetContainerAsync(`${BASE}${spec.file}`, this.scene, {
        pluginExtension: '.glb',
        pluginOptions: {
          gltf: {
            animationStartMode: GLTFLoaderAnimationStartMode.NONE,
            compileMaterials: false,
            // Painted texels are used like vertex colours (sRGB values).
            useSRGBBuffers: false,
          },
        },
      });
      const mesh = container.meshes.find((candidate): candidate is Mesh => candidate instanceof Mesh && candidate.getTotalVertices() > 0);
      const source = mesh?.material as unknown as { albedoTexture?: BaseTexture | null; bumpTexture?: BaseTexture | null } | null;
      const albedo = source?.albedoTexture ?? null;
      if (!mesh || !albedo) {
        container.dispose();
        this.settle(entry, 'failed', null);
        return;
      }
      const normal = source?.bumpTexture ?? null;
      for (const material of container.materials) material.dispose(false, false);
      container.materials.length = 0;
      for (const candidate of container.meshes) candidate.material = null;
      const walk = container.animationGroups[0] ? bakeGroup(container) : null;
      for (const group of container.animationGroups) group.dispose();
      container.animationGroups.length = 0;
      const asset: MascotModelAsset = {
        key,
        container,
        albedo,
        normal,
        walk,
        cow: key === 'cow' ? { headYaw: spec.rig?.headYaw ?? 0 } : null,
      };
      this.settle(entry, 'ready', asset);
    } catch (error) {
      console.warn(`[mascot] ${key} model failed to load`, error);
      this.settle(entry, 'failed', null);
    }
  }
}

/** Samples the container's first animation group into a dense rotation table. */
function bakeGroup(container: AssetContainer): BakedClip | null {
  const group = container.animationGroups[0];
  if (!group) return null;
  const rotations: Array<{ joint: string; evaluate: (frame: number) => Quaternion | null }> = [];
  let root: { joint: string; evaluate: (frame: number) => Vector3 | null } | null = null;
  let fps = 30;
  for (const targeted of group.targetedAnimations) {
    const target = targeted.target as { name?: string; parent?: { name?: string } | null } | null;
    const name = target?.name;
    if (!name) continue;
    const animation = targeted.animation;
    fps = animation.framePerSecond || fps;
    if (animation.targetProperty === 'rotationQuaternion') {
      rotations.push({ joint: name, evaluate: (frame) => animation.evaluate(frame) as Quaternion | null });
    } else if (animation.targetProperty === 'position' && name === 'Hips') {
      root = { joint: name, evaluate: (frame) => animation.evaluate(frame) as Vector3 | null };
    }
  }
  if (rotations.length === 0) return null;
  const duration = Math.max(1 / BAKE_FPS, (group.to - group.from) / fps);
  const frames = Math.max(2, Math.round(duration * BAKE_FPS));
  const table = new Float32Array(frames * rotations.length * 4);
  const translations = root ? new Float32Array(frames * 3) : null;
  for (let frame = 0; frame < frames; frame += 1) {
    const sourceFrame = group.from + (frame / frames) * (group.to - group.from);
    rotations.forEach((track, index) => {
      const value = track.evaluate(sourceFrame) ?? Quaternion.Identity();
      const offset = (frame * rotations.length + index) * 4;
      table[offset] = value.x;
      table[offset + 1] = value.y;
      table[offset + 2] = value.z;
      table[offset + 3] = value.w;
    });
    if (root && translations) {
      const value = root.evaluate(sourceFrame);
      if (value) {
        translations[frame * 3] = value.x;
        translations[frame * 3 + 1] = value.y;
        translations[frame * 3 + 2] = value.z;
      }
    }
  }
  return {
    name: group.name,
    duration,
    frames,
    joints: rotations.map((track) => track.joint),
    rotations: table,
    rootJoint: root ? 'Hips' : null,
    rootTranslations: translations,
  };
}

const libraries = new WeakMap<Scene, MascotModelLibrary>();

export function mascotModels(scene: Scene): MascotModelLibrary {
  let library = libraries.get(scene);
  if (!library) {
    library = new MascotModelLibrary(scene);
    libraries.set(scene, library);
  }
  return library;
}

/**
 * Starts loading the mascot models (call during boot, after the scene
 * exists). The Meshy coconut shell is only fetched when that shell is in use.
 */
export function preloadMascotModels(scene: Scene, includeCoconut = false): void {
  const library = mascotModels(scene);
  library.load('cow');
  if (includeCoconut) library.load('coconut');
}

export type { MascotModelLibrary };
