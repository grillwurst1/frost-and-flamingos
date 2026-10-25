import '@babylonjs/loaders/glTF/2.0/glTFLoader';
import '@babylonjs/loaders/glTF/2.0/Extensions/KHR_mesh_quantization';
import '@babylonjs/loaders/glTF/2.0/Extensions/KHR_texture_transform';
import '@babylonjs/loaders/glTF/2.0/Extensions/EXT_texture_webp';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { Scene } from '@babylonjs/core/scene';
import { GLTFLoaderAnimationStartMode } from '@babylonjs/loaders/glTF/glTFFileLoader';
import { DEFAULT_CLIPS, RETARGET_ROLES, type ClipRole } from './catalog';
import { bakeAnimationGroup, readRig, retargetClip, type BakedClip, type RigInfo } from './clips';

/**
 * Offline clip bake for `bun run models` (runs in Bun under a Babylon
 * NullEngine; never imported by the game).
 *
 * Every model of the bake set gets its full role set baked into its own GLB:
 * its native clips (resolved through the catalogue's per-model clip table)
 * plus, for models that share, the roles it lacks retargeted from the other
 * models with the very same maths the runtime used to run at load time
 * (glb/clips.ts). The game then loads each model standalone, so no donor
 * model has to be downloaded or decoded at runtime.
 */
export interface BakeSource {
  key: string;
  /** Untouched source GLB. */
  bytes: Uint8Array;
  /** Role → candidate clip names, first match wins. */
  clips: Readonly<Record<string, readonly string[]>>;
  /** Lends its native clips to and borrows missing roles from other sharing models. */
  share: boolean;
}

interface Loaded {
  key: string;
  rig: RigInfo;
  share: boolean;
  /** Role → clip (native, original clip name kept for donor matching). */
  clips: Map<string, BakedClip>;
}

/** Role → baked clip, per model key (catalogue order of `sources`). */
export async function bakeClipLibrary(sources: readonly BakeSource[]): Promise<Map<string, Map<string, BakedClip>>> {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const loaded: Loaded[] = [];
  try {
    for (const source of sources) {
      const container = await LoadAssetContainerAsync(source.bytes, scene, {
        pluginExtension: '.glb',
        pluginOptions: {
          gltf: { animationStartMode: GLTFLoaderAnimationStartMode.NONE, compileMaterials: false, skipMaterials: true },
        },
      });
      const mesh = container.meshes.find((candidate): candidate is Mesh => candidate instanceof Mesh && candidate.skeleton !== null);
      if (!mesh?.skeleton) {
        container.dispose();
        throw new Error(`${source.key}: no skinned mesh to bake clips for`);
      }
      const rig = readRig(mesh.skeleton);
      const clips = new Map<string, BakedClip>();
      for (const [role, candidates] of Object.entries(source.clips)) {
        const group = candidates
          .map((name) => container.animationGroups.find((candidate) => candidate.name === name))
          .find((candidate) => candidate !== undefined);
        if (group) clips.set(role, bakeAnimationGroup(group, rig.bindPose));
      }
      container.dispose();
      loaded.push({ key: source.key, rig, share: source.share, clips });
    }
    const sharing = loaded.filter((model) => model.share);
    const borrowed = new Map<string, Map<string, BakedClip>>();
    for (const target of sharing) {
      const extra = new Map<string, BakedClip>();
      for (const role of RETARGET_ROLES) {
        if (target.clips.has(role)) continue;
        // Donor preference follows the candidate order in DEFAULT_CLIPS (a
        // real jump before a hop), then the catalogue order.
        const donor = donorFor(role, target, sharing);
        if (donor) extra.set(role, retargetClip(donor.model.rig, donor.model.key, donor.clip, target.rig));
      }
      borrowed.set(target.key, extra);
    }
    const result = new Map<string, Map<string, BakedClip>>();
    for (const model of loaded) {
      const clips = new Map(model.clips);
      for (const [role, clip] of borrowed.get(model.key) ?? []) clips.set(role, clip);
      result.set(model.key, clips);
    }
    return result;
  } finally {
    scene.dispose();
    engine.dispose();
  }
}

function donorFor(role: ClipRole, target: Loaded, models: readonly Loaded[]): { model: Loaded; clip: BakedClip } | null {
  for (const name of DEFAULT_CLIPS[role]) {
    for (const model of models) {
      const own = model.clips.get(role);
      if (model !== target && own && own.retargetedFrom === null && own.name === name) return { model, clip: own };
    }
  }
  return null;
}
