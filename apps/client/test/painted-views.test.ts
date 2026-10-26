/**
 * Package 3C animator and stand-in checks, headless (Babylon NullEngine)
 * against the committed painted models:
 *
 *   bun run test   (bun test test, in apps/client)
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
import { interpolateRemote } from '../src/engine/remote-interp';
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

});

/** Gait ceilings in steps/s (glb-character.ts CADENCE_CAP). */
const CADENCE_CAP: Record<string, number> = { walk: 3.0, combatWalk: 3.0, backpedal: 3.0, crouchRun: 3.3, runBack: 3.3, run: 3.6, sprint: 4.5 };

interface BindingProbe {
  role: string;
  weight: number;
  rate: number;
  stride: number;
  clip: { duration: number; naturalSpeed?: number };
}

describe('locomotion cadence', () => {
  test('every gait at motor speed stays under its cadence ceiling', async () => {
    const scene = makeScene();
    const library = paintedModelLibrary(scene);
    for (const key of Object.keys(PAINTED_MODELS)) {
      const asset = await library.load(key);
      if (!asset) throw new Error(`${key} did not load`);
      const stats = CLASS_STATS[profileOf(key).cosmetics.classId];
      const gaits: Array<[number, number, Partial<AvatarPose>]> = [
        [1.6, 1, {}],
        [stats.moveSpeed, 1, {}],
        [stats.moveSpeed * 1.35, 1, { sprinting: true }],
        [1.0, 1, { crouched: true, crouchBlend: 1 }],
        [stats.moveSpeed * 0.55, 1, { crouched: true, crouchBlend: 1 }],
        [stats.moveSpeed * 0.7, -1, {}],
      ];
      for (const [speed, direction, extra] of gaits) {
        const view = new GlbCharacterView(scene, new StandardMaterial('shadow', scene), profileOf(key), asset, {
          albedo: new Texture(null, scene),
          normal: null,
        });
        for (let frame = 0; frame < 90; frame += 1) {
          view.update(1 / 60, pose({ velocity: { x: 0, y: 0, z: speed * direction }, ...extra }));
        }
        const bindings = (view as unknown as { bindings: Map<string, BindingProbe> }).bindings;
        let dominant: BindingProbe | null = null;
        for (const binding of bindings.values()) {
          if (!(binding.role in CADENCE_CAP)) continue;
          if (!dominant || binding.weight > dominant.weight) dominant = binding;
        }
        expect(dominant).not.toBeNull();
        if (!dominant) continue;
        const cadence = (2 * dominant.rate) / dominant.clip.duration;
        expect(cadence).toBeLessThanOrEqual((CADENCE_CAP[dominant.role] ?? 4.5) + 1e-6);
        // What the ceiling leaves shows as slide, bounded by the stride lengthening.
        const modelSpeed = speed / (stats.height / asset.height);
        const slide = 1 - (dominant.rate * (dominant.clip.naturalSpeed ?? 1) * dominant.stride) / modelSpeed;
        expect(slide).toBeLessThan(0.4);
        view.dispose();
      }
    }
  });
});

describe('remote interpolation', () => {
  test('velocity is the displayed motion between the bracketing snapshots', () => {
    // 7 m/s along +x, snapshots 33 ms apart, rendered halfway between them.
    const older = { position: { x: 0, y: 0, z: 0 }, velocity: { x: 21, y: 0, z: 0 }, yaw: 0, heading: 0 };
    const newer = { position: { x: 0.231, y: 0, z: 0 }, velocity: { x: 7, y: 0, z: 0 }, yaw: 0.2, heading: 0.2 };
    const sample = interpolateRemote(older, newer, 0.5, 33);
    expect(sample.velocity.x).toBeCloseTo(7, 3);
    expect(sample.position.x).toBeCloseTo(0.1155, 4);
    expect(sample.yaw).toBeCloseTo(0.1, 6);
    expect(interpolateRemote(older, newer, 0.5, 0).velocity.x).toBe(7);
    expect(interpolateRemote(undefined, newer, 0.5, 33).position.x).toBe(0.231);
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

describe('stand-in swaps after a revive', () => {
  test('a placeholder swapped on a stale dead snapshot does not play the corpse pose', async () => {
    const scene = makeScene();
    fakeTextures(scene);
    await paintedModelLibrary(scene).load('alpine-allrounder');
    scene.render();
    // The frame's build budget is taken, so this one starts as a placeholder.
    const first = createPaintedAvatarView(scene, new StandardMaterial('shadow-a', scene), profileOf('alpine-allrounder'));
    const late = createPaintedAvatarView(scene, new StandardMaterial('shadow-b', scene), profileOf('alpine-allrounder'));
    if (!first || !late) throw new Error('no view');
    scene.render();
    late.update(1 / 60, pose({ alive: false }));
    let worstDeath = 0;
    for (let frame = 0; frame < 12; frame += 1) {
      scene.render();
      late.update(1 / 60, pose());
      const current = (late as unknown as { current: { bindings?: Map<string, { weight: number }> } }).current;
      worstDeath = Math.max(worstDeath, current.bindings?.get('death')?.weight ?? 0);
    }
    expect((late as unknown as { isPainted: boolean }).isPainted).toBe(true);
    expect(worstDeath).toBeLessThan(0.15);
    first.dispose();
    late.dispose();
  });
});

describe('dodge roll', () => {
  const cases: Array<[string, string | null]> = [
    ...Object.keys(PAINTED_MODELS).map((key): [string, string | null] => [key, null]),
    ['alpine-heavy', 'head_none'],
    ['lagoon-allrounder', 'head_fondue_pot'],
  ];
  for (const fps of [60, 30]) {
    test(`head, hat, chest and hands stay above the ground (${fps} fps)`, async () => {
      const scene = makeScene();
      const library = paintedModelLibrary(scene);
      for (const [key, headgear] of cases) {
        const asset = await library.load(key);
        if (!asset) throw new Error(`${key} did not load`);
        const profile = profileOf(key);
        if (headgear) profile.cosmetics = { ...profile.cosmetics, headgear: headgear as typeof profile.cosmetics.headgear };
        const view = new GlbCharacterView(scene, new StandardMaterial('shadow', scene), profile, asset, {
          albedo: new Texture(null, scene),
          normal: null,
        });
        const internals = view as unknown as { bodyMesh: Mesh; root: TransformNode; attachments: Mesh[]; rollLift: number };
        const bind = internals.bodyMesh.getVerticesData('position') ?? new Float32Array();
        const indices = internals.bodyMesh.getIndices() ?? [];
        const drawn = new Set<number>();
        for (const sub of internals.bodyMesh.subMeshes) {
          for (let index = sub.indexStart; index < sub.indexStart + sub.indexCount; index += 1) drawn.add(indices[index] ?? 0);
        }
        for (let frame = 0; frame < 20; frame += 1) view.update(1 / fps, pose());
        let lowest = Infinity;
        let lift = internals.rollLift;
        for (let frame = 0; frame < Math.round(0.6 * fps); frame += 1) {
          view.update(1 / fps, pose({ rolling: true, velocity: { x: 0, y: 0, z: 9 } }));
          // The safety lift moves at most 2 m/s: no one-frame hop.
          expect(Math.abs(internals.rollLift - lift)).toBeLessThanOrEqual(2 / fps + 1e-6);
          lift = internals.rollLift;
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
          for (const vertex of drawn) {
            // Upper body (hands hang at about half height in the bind pose) and head.
            if ((bind[vertex * 3 + 1] ?? 0) < asset.height * 0.42) continue;
            const point = new Vector3(skinned[vertex * 3] ?? 0, skinned[vertex * 3 + 1] ?? 0, skinned[vertex * 3 + 2] ?? 0);
            lowest = Math.min(lowest, Vector3.TransformCoordinates(point, world).y);
          }
          for (const attachment of internals.attachments) {
            const positions = attachment.getVerticesData('position') ?? [];
            const matrix = attachment.getWorldMatrix();
            for (let vertex = 0; vertex < positions.length / 3; vertex += 1) {
              const point = new Vector3(positions[vertex * 3] ?? 0, positions[vertex * 3 + 1] ?? 0, positions[vertex * 3 + 2] ?? 0);
              lowest = Math.min(lowest, Vector3.TransformCoordinates(point, matrix).y);
            }
          }
        }
        expect(lowest).toBeGreaterThanOrEqual(0.01);
        view.dispose();
      }
    });
  }
});


test('local avatar requests its detailed model while hidden behind the menu', async () => {
  const scene = makeScene();
  try {
    fakeTextures(scene);
    const library = paintedModelLibrary(scene);
    const view = createPaintedAvatarView(scene, new StandardMaterial('local-priority-shadow', scene), profileOf('alpine-allrounder'), true);
    if (!view) throw new Error('missing local avatar');
    view.root.setEnabled(false);
    expect(library.requested('alpine-allrounder')).toBe(true);
    const asset = await library.load('alpine-allrounder');
    expect(asset?.skinned).toBe(true);
    view.dispose();
  } finally { scene.dispose(); scene.getEngine().dispose(); }
});
