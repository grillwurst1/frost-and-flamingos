/**
 * Headless checks of the painted hen (NullEngine, CPU skinning): the shipped
 * public/models/hen.glb fits its budget, the posed hen keeps its feet on the
 * ground in every behaviour, and the death pop hides the view.
 *
 * The asset is built the way the painted-model library builds it (the GLB's
 * own walk clip baked at load) without fetching over HTTP.
 */
import '@babylonjs/loaders/glTF/2.0/glTFLoader';
import '@babylonjs/loaders/glTF/2.0/Extensions/EXT_texture_webp';
import { describe, expect, test } from 'bun:test';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { CritterBehaviour } from '@frost-and-flamingos/shared';
import { bakeAnimationGroup, readRig } from '../src/rendering/glb/clips';
import type { PaintedModelAsset } from '../src/rendering/glb/library';
import { HenView } from '../src/rendering/critters/hen-view';
import type { CritterPose } from '../src/engine/critter-client';

const MODEL = new URL('../public/models/hen.glb', import.meta.url);
const FEET_Y = 18;

async function setup() {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  scene.activeCamera = new FreeCamera('camera', new Vector3(6, 19, -5), scene);
  const bytes = new Uint8Array(await Bun.file(MODEL).arrayBuffer());
  const container = await LoadAssetContainerAsync(bytes, scene, {
    pluginExtension: '.glb',
    pluginOptions: { gltf: { skipMaterials: true } } as never,
  });
  const mesh = container.meshes.find((entry): entry is Mesh => entry instanceof Mesh && entry.skeleton !== null);
  const group = container.animationGroups[0];
  if (!mesh?.skeleton || !group) throw new Error('hen.glb: no skinned mesh or clip');
  const rig = readRig(mesh.skeleton);
  const walk = bakeAnimationGroup(group, rig.bindPose);
  for (const animation of [...container.animationGroups]) animation.dispose();
  container.animationGroups.length = 0;
  const asset = {
    ...rig,
    spec: { key: 'hen' },
    container,
    skinned: true,
    clipNames: new Set<string>(),
    height: 1,
    hatSplit: null,
    clips: new Map([['walk', walk]]),
  } as unknown as PaintedModelAsset;
  const material = new ShaderMaterial('hen-test', scene, { vertex: 'default', fragment: 'default' }, { attributes: ['position'], uniforms: ['world'] });
  const shadow = new StandardMaterial('hen-test-shadow', scene);
  return { engine, scene, mesh, asset, material, shadow };
}

/** Lowest skinned vertex of the view's mesh above the feet (metres). */
function lowestVertex(scene: Scene, view: HenView): number {
  const mesh = (view as unknown as { mesh: Mesh }).mesh;
  for (const node of scene.transformNodes) node.computeWorldMatrix(true);
  mesh.computeWorldMatrix(true);
  mesh.skeleton?.prepare(true);
  const positions = mesh.getPositionData(true, false) ?? [];
  const world = mesh.getWorldMatrix();
  const point = new Vector3();
  let lowest = Number.POSITIVE_INFINITY;
  for (let index = 0; index < positions.length / 3; index += 1) {
    Vector3.TransformCoordinatesFromFloatsToRef(positions[index * 3] ?? 0, positions[index * 3 + 1] ?? 0, positions[index * 3 + 2] ?? 0, world, point);
    lowest = Math.min(lowest, point.y);
  }
  return lowest - FEET_Y;
}

function pose(behaviour: CritterBehaviour, speed: number): CritterPose {
  return { position: { x: 5, y: FEET_Y, z: -3 }, yaw: 0.4, speed, behaviour, airborne: false, verticalSpeed: 0 };
}

describe('painted hen', () => {
  test('the shipped hen fits the critter budget (at most 8k triangles)', async () => {
    const { mesh, engine } = await setup();
    const triangles = (mesh.getTotalIndices() || mesh.getTotalVertices()) / 3;
    expect(triangles).toBeLessThanOrEqual(8000);
    // Lighter than any soldier (14k-22k skinned vertices).
    expect(mesh.getTotalVertices()).toBeLessThan(14000);
    engine.dispose();
  });

  test('feet stay on the ground in every grounded behaviour', async () => {
    const { scene, asset, material, shadow, engine } = await setup();
    const view = new HenView(scene, asset, material, shadow, 1);
    const cases: Array<[string, CritterBehaviour, number]> = [
      ['idle', 'idle', 0],
      ['walk 0.29', 'walk', 0.29],
      ['walk 0.6', 'walk', 0.6],
      ['scratch', 'scratch', 0],
      ['peck', 'peck', 0],
      ['look', 'look', 0],
      ['flee 1.5', 'flee', 1.5],
      ['flee 3.0', 'flee', 3],
      ['flee 4.4', 'flee', 4.4],
    ];
    const report: string[] = [];
    const results: Array<{ behaviour: CritterBehaviour; low: number; high: number; mean: number }> = [];
    for (const [label, behaviour, speed] of cases) {
      // Settle into the behaviour, then sample 3 s.
      for (let frame = 0; frame < 45; frame += 1) view.update(1 / 30, pose(behaviour, speed));
      let low = Number.POSITIVE_INFINITY;
      let high = Number.NEGATIVE_INFINITY;
      let sum = 0;
      let samples = 0;
      for (let frame = 0; frame < 90; frame += 1) {
        view.update(1 / 30, pose(behaviour, speed));
        if (frame % 3 !== 0) continue;
        const lowest = lowestVertex(scene, view);
        low = Math.min(low, lowest);
        high = Math.max(high, lowest);
        sum += lowest;
        samples += 1;
      }
      const mean = sum / samples;
      report.push(`${label}: ${low.toFixed(3)}..${high.toFixed(3)} (mean ${mean.toFixed(3)})`);
      results.push({ behaviour, low, high, mean });
    }
    console.log(`hen ground contact: ${report.join(' | ')}`);
    for (const { behaviour, low, high, mean } of results) {
      // Never sunk into the ground, never hovering (the hen is 0.46 m tall).
      expect(low).toBeGreaterThan(-0.03);
      expect(high).toBeLessThan(behaviour === 'scratch' ? 0.03 : 0.02);
      expect(Math.abs(mean)).toBeLessThan(0.012);
    }
    view.dispose();
    engine.dispose();
  }, 60_000);

  test('the death pop hides the view; a respawn shows it again', async () => {
    const { scene, asset, material, shadow, engine } = await setup();
    const view = new HenView(scene, asset, material, shadow, 2);
    const root = (view as unknown as { root: TransformNode }).root;
    for (let frame = 0; frame < 5; frame += 1) view.update(1 / 30, pose('walk', 0.6));
    expect(root.isEnabled()).toBe(true);
    view.pop();
    for (let frame = 0; frame < 6; frame += 1) view.update(1 / 30, pose('walk', 0));
    expect(root.isEnabled()).toBe(false);
    view.setVisible(true);
    view.update(1 / 30, pose('idle', 0));
    expect(root.isEnabled()).toBe(true);
    view.dispose();
    engine.dispose();
  });
});
