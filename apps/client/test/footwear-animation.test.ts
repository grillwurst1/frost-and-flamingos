import { afterAll, beforeAll, expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { createDefaultProfile, FEET_IDS, type ClassId, type Faction, type FeetId } from '@frost-and-flamingos/shared';
import { GlbCharacterView } from '../src/rendering/glb-character';
import { jointName, paintedModelLibrary } from '../src/rendering/glb/library';
import type { GlbRig } from '../src/rendering/glb/rig';
import type { AvatarPose } from '../src/rendering/avatar';

const keys = ['alpine-allrounder', 'alpine-heavy', 'alpine-infiltrator',
  'lagoon-allrounder', 'lagoon-heavy', 'lagoon-infiltrator'] as const;
const directory = resolve(import.meta.dir, '../public/models');
const originalFetch = globalThis.fetch;
let scene: Scene, texture: RawTexture;
beforeAll(() => {
  globalThis.fetch = (async input => {
    const file = Bun.file(resolve(directory, String(input).split('/').pop()!));
    if (!await file.exists()) return new Response('', { status: 404 });
    return new Response(await file.arrayBuffer(), { headers: { 'content-type': file.name?.endsWith('.json') ? 'application/json' : 'model/gltf-binary' } });
  }) as typeof fetch;
  scene = new Scene(new NullEngine());
  new ArcRotateCamera('footwear-qa', 0, 1.2, 5, Vector3.Zero(), scene);
  texture = RawTexture.CreateRGBATexture(new Uint8Array([255, 255, 255, 255]), 1, 1, scene, false, false);
});
afterAll(() => { scene.dispose(); scene.getEngine().dispose(); globalThis.fetch = originalFetch; });

const standing: AvatarPose = { position: { x: 0, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 },
  yaw: 0, grounded: true, alive: true, crouched: false, swimming: false, weaponId: 'smg' };

async function soldier(key: string, feet?: FeetId) {
  const asset = (await paintedModelLibrary(scene).load(key))!;
  const [faction, classId] = key.split('-') as [Faction, ClassId];
  const profile = createDefaultProfile('Independent feet', classId); profile.faction = faction;
  if (feet) profile.cosmetics.feet = feet;
  const view = new GlbCharacterView(scene, new StandardMaterial('footwear-shadow', scene), profile, asset,
    { albedo: texture, normal: null, wardrobeMask: texture, head: { albedo: texture, mask: texture } });
  const mesh = view.root.getChildMeshes().find(m => m.name === 'soldier-modular-detail') as Mesh;
  const rig = (view as unknown as { rig: GlbRig }).rig;
  const p = mesh.getVerticesData('position')!, j = mesh.getVerticesData('matricesIndices')!, w = mesh.getVerticesData('matricesWeights')!;
  const names = new Map(mesh.skeleton!.bones.map((b, i) => [b.getIndex() ?? i, jointName(b.name)]));
  const feetVertices: Record<'Left' | 'Right', number[]> = { Left: [], Right: [] };
  for (let v = 0; v < p.length / 3; v++) {
    if (p[v * 3 + 1]! > asset.height * .15) continue;
    let left = 0, right = 0;
    for (let k = 0; k < 4; k++) {
      const name = names.get(j[v * 4 + k]!) ?? '';
      if (/^Left(?:UpLeg|Leg|Foot|Toe)/.test(name)) left += w[v * 4 + k]!;
      if (/^Right(?:UpLeg|Leg|Foot|Toe)/.test(name)) right += w[v * 4 + k]!;
    }
    expect(left > .001 && right > .001).toBe(false);
    if (left + right > .9) feetVertices[left > right ? 'Left' : 'Right'].push(v);
  }
  const skin = () => { mesh.skeleton!.prepare(true); return Array.from(mesh.getPositionData(true)!); };
  const gap = () => {
    const p = skin();
    return Math.min(...feetVertices.Left.map(v => p[v * 3]!)) - Math.max(...feetVertices.Right.map(v => p[v * 3]!));
  };
  return { asset, view, mesh, rig, feetVertices, gap, skin };
}

test.each(keys)('%s has separate soles and independently articulated feet through its gaits', async key => {
  const { asset, view, mesh, rig, feetVertices, gap, skin } = await soldier(key);
  try {
    for (let i = 0; i < 100; i++) view.update(1 / 45, standing);
    expect(gap()).toBeGreaterThan(.025 * asset.height / 1.88);
    expect(mesh.subMeshes).toHaveLength(1);
    const sides = new Map([...feetVertices.Left.map(v => [v, 'Left'] as const), ...feetVertices.Right.map(v => [v, 'Right'] as const)]);
    const indices = mesh.getIndices()!;
    for (let i = 0; i < indices.length; i += 3) {
      const vertices = [indices[i]!, indices[i + 1]!, indices[i + 2]!];
      if (vertices.every(v => sides.has(v))) expect(new Set(vertices.map(v => sides.get(v))).size).toBe(1);
    }
    // A real change to the left ankle must move its shoe, never the right one.
    const before = skin(), left = rig.node('LeftFoot')!, original = left.rotationQuaternion!.clone();
    left.rotationQuaternion!.multiplyInPlace(Quaternion.RotationAxis(Vector3.Right(), .35));
    const after = skin(); let movedLeft = 0, movedRight = 0;
    for (const [side, vertices] of Object.entries(feetVertices)) for (const v of vertices) {
      const distance = Math.hypot(...[0, 1, 2].map(k => after[v * 3 + k]! - before[v * 3 + k]!));
      if (side === 'Left') movedLeft = Math.max(movedLeft, distance); else movedRight = Math.max(movedRight, distance);
    }
    expect(movedLeft).toBeGreaterThan(.015); expect(movedRight).toBeLessThan(.00001);
    left.rotationQuaternion!.copyFrom(original);
    for (const sprinting of [false, true]) {
      let leadMin = Infinity, leadMax = -Infinity;
      for (let i = 0; i < 180; i++) {
        view.update(1 / 45, { ...standing, velocity: { x: 0, y: 0, z: sprinting ? 6 : 2 }, sprinting });
        if (i < 80) continue;
        rig.refresh();
        const lead = rig.position('LeftFoot')!.z - rig.position('RightFoot')!.z;
        leadMin = Math.min(leadMin, lead); leadMax = Math.max(leadMax, lead);
      }
      expect(leadMin).toBeLessThan(-.12); expect(leadMax).toBeGreaterThan(.12);
    }
  } finally { view.dispose(); }
});

test.each(FEET_IDS)('both Allrounder rigs retain clear idle soles with selected %s', async feet => {
  for (const key of ['alpine-allrounder', 'lagoon-allrounder']) {
    const { asset, view, gap } = await soldier(key, feet);
    try {
      for (let i = 0; i < 100; i++) view.update(1 / 45, standing);
      expect(gap()).toBeGreaterThan(.025 * asset.height / 1.88);
    } finally { view.dispose(); }
  }
});
