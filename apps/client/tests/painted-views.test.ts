/**
 * Package 3C animator and stand-in checks, headless (Babylon NullEngine)
 * against the committed painted models:
 *
 *   bun test scripts/tests
 */
import { beforeAll, describe, expect, test } from 'bun:test';
import { join, resolve } from 'node:path';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Vector3 } from '@babylonjs/core/Maths/math';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Scene } from '@babylonjs/core/scene';
import { CLASS_STATS, ParachuteState, createDefaultProfile, type ClassId, type Faction } from '@frost-and-flamingos/shared';
import type { AvatarPose, AvatarView } from '../src/rendering/avatar';
import { GlbCharacterView, createPaintedAvatarView } from '../src/rendering/glb-character';
import { PAINTED_MODELS } from '../src/rendering/glb/catalog';
import { paintedModelLibrary, type PaintedModelAsset } from '../src/rendering/glb/library';
import type { PaintedTextures } from '../src/rendering/glb/material';

const MODELS = resolve(import.meta.dir, '..', 'public', 'models');

// The library fetches `<base>models/<file>`: serve the committed files.
globalThis.fetch = (async (input: RequestInfo | URL) => {
  const name = String(input).split('/').pop() ?? '';
  const file = Bun.file(join(MODELS, name));
  if (!(await file.exists())) return new Response('missing', { status: 404 });
  return new Response(await file.arrayBuffer(), {
    headers: { 'content-type': name.endsWith('.json') ? 'application/json' : 'model/gltf-binary' },
  });
}) as typeof fetch;

function makeScene(): Scene {
  const scene = new Scene(new NullEngine());
  new ArcRotateCamera('camera', 0, 1.2, 6, Vector3.Zero(), scene);
  return scene;
}

/** Textures cannot load in Bun; hand every model a dummy albedo instead. */
function fakeTextures(scene: Scene): PaintedTextures {
  const library = paintedModelLibrary(scene) as unknown as {
    textures: (key: string) => Promise<PaintedTextures | null>;
    loadedTexturesOf: (key: string) => PaintedTextures | null;
  };
  const textures: PaintedTextures = { albedo: new Texture(null, scene), normal: null };
  library.textures = async () => textures;
  library.loadedTexturesOf = () => textures;
  return textures;
}

function pose(overrides: Partial<AvatarPose> = {}): AvatarPose {
  return {
    position: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    yaw: 0,
    heading: 0,
    grounded: true,
    alive: true,
    crouched: false,
    crouchBlend: 0,
    swimming: false,
    sprinting: false,
    rolling: false,
    weaponId: 'smg',
    pitch: 0,
    reloading: false,
    ...overrides,
  } as AvatarPose;
}

function profileOf(key: string) {
  const [faction, classId] = key.split('-') as [Faction, ClassId];
  return { ...createDefaultProfile('Test', classId), faction };
}

describe('locomotion clips (gait phase and natural speed)', () => {
  const assets = new Map<string, PaintedModelAsset>();
  beforeAll(async () => {
    const scene = makeScene();
    const library = paintedModelLibrary(scene);
    for (const key of Object.keys(PAINTED_MODELS)) {
      const asset = await library.load(key);
      if (asset) assets.set(key, asset);
    }
  });

  test('every cycle has a heel-strike phase and a stance speed', () => {
    expect(assets.size).toBe(Object.keys(PAINTED_MODELS).length);
    for (const asset of assets.values()) {
      for (const role of ['walk', 'combatWalk', 'run', 'sprint', 'backpedal'] as const) {
        const clip = asset.clips.get(role);
        expect(clip?.contactPhase).toBeGreaterThanOrEqual(0);
        expect(clip?.naturalSpeed).toBeGreaterThan(0.2);
      }
    }
  });

  test('the same animation gets the same heel strike on every rig', () => {
    for (const role of ['walk', 'combatWalk', 'run', 'backpedal'] as const) {
      const phases = [...assets.values()].map((asset) => asset.clips.get(role)?.contactPhase ?? -1);
      expect(Math.max(...phases) - Math.min(...phases)).toBeLessThan(0.04);
    }
  });

  test('loops cover the motor speeds without sliding (rate within the cap)', () => {
    const MAX_LOOP_RATE = 8;
    for (const [key, asset] of assets) {
      const stats = CLASS_STATS[profileOf(key).cosmetics.classId];
      const scale = stats.height / asset.height;
      const motor: Record<string, number> = {
        run: stats.moveSpeed,
        sprint: stats.moveSpeed * 1.35,
        combatWalk: stats.moveSpeed * 0.55,
        backpedal: stats.moveSpeed * 0.7,
      };
      for (const [role, speed] of Object.entries(motor)) {
        const natural = asset.clips.get(role as 'run')?.naturalSpeed ?? 1;
        const rate = speed / scale / natural;
        expect(rate).toBeLessThanOrEqual(MAX_LOOP_RATE);
      }
    }
  });
});

describe('stand-in swaps', () => {
  test('a parachuting remote (parachuteState only) keeps its stand-in until it lands', async () => {
    const scene = makeScene();
    fakeTextures(scene);
    const view = createPaintedAvatarView(scene, new StandardMaterial('shadow-1', scene), profileOf('alpine-allrounder'));
    expect(view).not.toBeNull();
    if (!view) return;
    const descending = pose({ grounded: false, parachuteState: ParachuteState.Intact });
    view.update(1 / 30, descending);
    await paintedModelLibrary(scene).load('alpine-allrounder');
    await new Promise((done) => setTimeout(done, 20));
    for (let frame = 0; frame < 5; frame += 1) {
      scene.render();
      view.update(1 / 30, descending);
    }
    expect((view as unknown as { isPainted: boolean }).isPainted).toBe(false);
    scene.render();
    view.update(1 / 30, pose());
    expect((view as unknown as { isPainted: boolean }).isPainted).toBe(true);
    view.dispose();
  });

  test('a swap while swimming keeps the swim blend', async () => {
    const scene = makeScene();
    fakeTextures(scene);
    const view = createPaintedAvatarView(scene, new StandardMaterial('shadow-2', scene), profileOf('lagoon-heavy'));
    if (!view) throw new Error('no view');
    const swimming = pose({ swimming: true, grounded: false });
    view.update(1 / 30, swimming);
    await paintedModelLibrary(scene).load('lagoon-heavy');
    await new Promise((done) => setTimeout(done, 20));
    scene.render();
    view.update(1 / 30, swimming);
    const current = (view as unknown as { current: { swim?: number } }).current;
    expect(current instanceof GlbCharacterView).toBe(true);
    expect(current.swim).toBeCloseTo(1, 3);
    view.dispose();
  });

  test('views of an already loaded model are built one per frame', async () => {
    const scene = makeScene();
    fakeTextures(scene);
    await paintedModelLibrary(scene).load('alpine-heavy');
    scene.render();
    const views: AvatarView[] = [];
    for (let index = 0; index < 4; index += 1) {
      const view = createPaintedAvatarView(scene, new StandardMaterial(`shadow-${index}`, scene), profileOf('alpine-heavy'));
      if (view) views.push(view);
    }
    const built = (): number =>
      views.filter((view) => view instanceof GlbCharacterView || (view as unknown as { isPainted?: boolean }).isPainted).length;
    expect(built()).toBe(1);
    for (let frame = 1; frame <= 3; frame += 1) {
      scene.render();
      for (const view of views) view.update(1 / 30, pose());
      expect(built()).toBe(1 + frame);
    }
    for (const view of views) view.dispose();
  });
});

describe('dodge roll', () => {
  test('head and painted hat stay above the ground', async () => {
    const scene = makeScene();
    const library = paintedModelLibrary(scene);
    for (const key of Object.keys(PAINTED_MODELS)) {
      const asset = await library.load(key);
      if (!asset) throw new Error(`${key} did not load`);
      const view = new GlbCharacterView(scene, new StandardMaterial('shadow', scene), profileOf(key), asset, {
        albedo: new Texture(null, scene),
        normal: null,
      });
      const internals = view as unknown as { bodyMesh: Mesh; root: TransformNode };
      const bind = internals.bodyMesh.getVerticesData('position') ?? new Float32Array();
      for (let frame = 0; frame < 20; frame += 1) view.update(1 / 60, pose());
      let lowest = Infinity;
      for (let frame = 0; frame < 36; frame += 1) {
        view.update(1 / 60, pose({ rolling: true, velocity: { x: 0, y: 0, z: 9 } }));
        const queue: TransformNode[] = [internals.root];
        while (queue.length > 0) {
          const node = queue.shift();
          if (!node) break;
          node.computeWorldMatrix(true);
          queue.push(...(node.getChildren() as TransformNode[]));
        }
        internals.bodyMesh.skeleton?.prepare(true);
        const skinned = internals.bodyMesh.getPositionData(true, false) ?? new Float32Array();
        const world = internals.bodyMesh.getWorldMatrix();
        for (let vertex = 0; vertex < skinned.length / 3; vertex += 1) {
          if ((bind[vertex * 3 + 1] ?? 0) < asset.height * 0.82) continue;
          const point = Vector3.TransformCoordinates(
            new Vector3(skinned[vertex * 3] ?? 0, skinned[vertex * 3 + 1] ?? 0, skinned[vertex * 3 + 2] ?? 0),
            world,
          );
          lowest = Math.min(lowest, point.y);
        }
      }
      expect(lowest).toBeGreaterThanOrEqual(0);
      view.dispose();
    }
  });
});
