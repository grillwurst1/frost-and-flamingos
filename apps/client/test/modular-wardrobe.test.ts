import { beforeAll, afterAll, expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { Vector3 } from '@babylonjs/core/Maths/math';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import {
  createDefaultProfile, HEADGEAR_IDS, FACE_IDS, TORSO_IDS, BACK_IDS, HANDS_IDS, LEGS_IDS, FEET_IDS,
  SKIN_TONES, HAIR_COLORS, HAIR_STYLE_IDS, type Cosmetics,
} from '@frost-and-flamingos/shared';
import { GlbCharacterView, createPaintedAvatarView } from '../src/rendering/glb-character';
import { paintedModelLibrary, type PaintedModelAsset } from '../src/rendering/glb/library';
import type { GlbRig } from '../src/rendering/glb/rig';
import type { AvatarPose } from '../src/rendering/avatar';

const modelDirectory = resolve(import.meta.dir, '../public/models');
globalThis.fetch = (async (input: RequestInfo | URL) => {
  const name = String(input).split('/').pop()!;
  const file = Bun.file(resolve(modelDirectory, name));
  return new Response(await file.arrayBuffer(), { headers: { 'content-type': name.endsWith('.json') ? 'application/json' : 'model/gltf-binary' } });
}) as typeof fetch;
let scene: Scene, asset: PaintedModelAsset;
beforeAll(async () => {
  scene = new Scene(new NullEngine()); new ArcRotateCamera('qa-camera', 0, 1.2, 5, Vector3.Zero(), scene);
  const loaded = await paintedModelLibrary(scene).load('alpine-allrounder');
  if (!loaded) throw new Error('Missing committed animation rig'); asset = loaded;
});
afterAll(() => { scene.dispose(); scene.getEngine().dispose(); });

test('vehicle pose bends the detailed legs, plants footrests, tilts the body and equips a repair tool', () => {
  const { view } = build();
  const rig = (view as unknown as { rig: GlbRig }).rig;
  const pose: AvatarPose = { position: { x: 0, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, grounded: true, alive: true, weaponId: 'smg' };
  const settle = (extra: Partial<AvatarPose>) => { for (let i = 0; i < 60; i++) view.update(1 / 60, { ...pose, ...extra }); rig.refresh(); };
  try {
    settle({});
    const standingHip = rig.position('Hips')!.y, foot = rig.position('LeftFoot')!.clone();
    settle({ riding: 'seat', vehiclePitch: 0.2, vehicleRoll: -0.3 });
    expect(rig.position('Hips')!.y).toBeLessThan(standingHip * 0.8);
    expect(rig.position('LeftFoot')!.y).toBeCloseTo(foot.y, 1);
    expect(rig.position('LeftLeg')!.z).toBeGreaterThan(foot.z + 0.15);
    const tilt = view.root.getChildren().find(n => n.name.includes('tilt')) as import('@babylonjs/core/Meshes/transformNode').TransformNode;
    expect(tilt.rotation.x).toBeCloseTo(-0.2);
    expect(tilt.rotation.z).toBeCloseTo(-0.3);
    settle({ riding: 'seat', repairing: true });
    expect(view.debugInfo().weapon).toBe('wrench');
    expect(view.root.getChildMeshes().some(m => m.name === 'repair-wrench' && m.isEnabled())).toBe(true);
    settle({});
    expect(view.debugInfo().weapon).toBe('smg');
    expect(rig.position('Hips')!.y).toBeCloseTo(standingHip, 1);
    expect(tilt.rotation.z).toBe(0);
  } finally { view.dispose(); }
});

function build(changes: Partial<Cosmetics> = {}): { view: GlbCharacterView; mesh: Mesh } {
  const profile = createDefaultProfile('Wardrobe'); profile.cosmetics = { ...profile.cosmetics, ...changes };
  const view = new GlbCharacterView(scene, new StandardMaterial('qa-shadow', scene), profile, asset, null);
  const mesh = view.root.getChildMeshes().find(m => m.name === 'soldier-modular-detail') as Mesh | undefined;
  if (!mesh) throw new Error('A wardrobe choice lost its detailed model');
  return { view, mesh };
}
function geometryFingerprint(mesh: Mesh): string {
  const hash = new Bun.CryptoHasher('sha256');
  for (const kind of ['position', 'color']) hash.update(Float32Array.from(mesh.getVerticesData(kind)!));
  return hash.digest('hex');
}

const slots = { headgear: HEADGEAR_IDS, face: FACE_IDS, torso: TORSO_IDS, back: BACK_IDS, hands: HANDS_IDS, legs: LEGS_IDS, feet: FEET_IDS };
for (const [slot, ids] of Object.entries(slots)) test(`every ${slot} choice changes actual detailed geometry or colour`, () => {
  const fingerprints = new Set<string>();
  for (const id of ids) {
    const { view, mesh } = build({ [slot]: id });
    try {
      expect(view.renderedCosmetics[slot as keyof typeof slots]).toBe(id);
      fingerprints.add(geometryFingerprint(mesh));
      expect(mesh.skeleton).not.toBeNull();
      expect(mesh.getTotalIndices() / 3).toBeLessThan(60000);
      expect(mesh.subMeshes).toHaveLength(1);
      const weights = mesh.getVerticesData('matricesWeights')!;
      for (let n = 0; n < weights.length; n += 4 * 31)
        expect(weights[n]! + weights[n + 1]! + weights[n + 2]! + weights[n + 3]!).toBeCloseTo(1, 5);
    } finally { view.dispose(); }
  }
  expect(fingerprints.size).toBe(ids.length);
}, 30000);

test('all twelve skin selections reach every actual skin vertex', () => {
  for (const [skinToneIndex, hex] of SKIN_TONES.entries()) {
    const { view, mesh } = build({ skinToneIndex, torso: 'torso_bare_suspenders', headgear: 'head_none', face: 'face_none' });
    try {
      const expected = [1, 3, 5].map(offset => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255);
      const paint = mesh.getVerticesData('color')!; let skin = 0;
      for (let n = 0; n < paint.length; n += 4) if (paint[n + 3]! > 0.9) {
        skin++;
        for (let channel = 0; channel < 3; channel++) expect(paint[n + channel]!).toBeCloseTo(expected[channel]!, 5);
      }
      expect(skin).toBeGreaterThan(1000);
    } finally { view.dispose(); }
  }
}, 30000);

test('hair colours and all seven hairstyles reach the geometry', () => {
  for (const [hairColorIndex, hex] of HAIR_COLORS.entries()) {
    const { view, mesh } = build({ hairColorIndex, headgear: 'head_none', face: 'face_full_beard' });
    try {
      const expected = [1, 3, 5].map(offset => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255);
      const paint = mesh.getVerticesData('color')!; let matches = 0;
      for (let n = 0; n < paint.length; n += 4)
        if (expected.every((value, channel) => Math.abs(paint[n + channel]! - value) < 1e-5)) matches++;
      expect(matches).toBeGreaterThan(100);
    } finally { view.dispose(); }
  }
  const shapes = new Set<string>();
  for (const hairStyleIndex of HAIR_STYLE_IDS.keys()) {
    const { view, mesh } = build({ hairStyleIndex, headgear: 'head_none' });
    shapes.add(geometryFingerprint(mesh)); view.dispose();
  }
  expect(shapes.size).toBe(HAIR_STYLE_IDS.length);
}, 30000);

test('body shape changes the mesh and outfit edits never select the old rigid fallback', () => {
  const broad = build({ bodyType: 0 }), lean = build({ bodyType: 1 });
  expect(geometryFingerprint(broad.mesh)).not.toBe(geometryFingerprint(lean.mesh));
  broad.view.dispose(); lean.view.dispose();
  scene.render();
  const profile = createDefaultProfile('Configured');
  profile.cosmetics = { ...profile.cosmetics, torso: 'torso_hawaii_shirt', legs: 'legs_olive_pants', feet: 'feet_dive_flippers', skinToneIndex: 11 };
  const view = createPaintedAvatarView(scene, new StandardMaterial('qa-factory', scene), profile);
  expect(view).toBeInstanceOf(GlbCharacterView);
  expect((view as GlbCharacterView).renderedCosmetics).toEqual(profile.cosmetics);
  expect(paintedModelLibrary(scene).loadedTexturesOf('alpine-allrounder')).toBeNull();
  view?.dispose();
});

test('a bald soldier wearing a hat does not grow an extra painted hair tuft', () => {
  const { view, mesh } = build({ hairStyleIndex: 6, hairColorIndex: 0, headgear: 'head_tirol', face: 'face_none', back: 'back_none' });
  try {
    const positions = mesh.getVerticesData('position')!, colors = mesh.getVerticesData('color')!;
    const hair = [1, 0x55 / 255, 0x11 / 255];
    let rearHair = 0;
    for (let v = 0; v < mesh.getTotalVertices(); v++) {
      if (positions[v * 3 + 1]! < asset.spec.head.y - 0.05 || positions[v * 3 + 2]! > -0.05) continue;
      if (hair.every((c, channel) => Math.abs(colors[v * 4 + channel]! - c) < 1e-5)) rearHair++;
    }
    expect(rearHair).toBe(0);
  } finally { view.dispose(); }
});

test('ankle hardware retains outward normals across the shin-to-foot transition', () => {
  const {view,mesh}=build({feet:'feet_ski_boots',legs:'legs_lederhosen'});
  try {
    const p=mesh.getVerticesData('position')!,n=mesh.getVerticesData('normal')!,c=mesh.getVerticesData('color')!;
    let toe=-Infinity;
    const white:number[]=[];
    for(let v=0;v<p.length/3;v++) if(p[v*3+1]!<asset.height*.2&&c[v*4]!>.85&&c[v*4+1]!>.85&&c[v*4+2]!>.85) {
      white.push(v);toe=Math.max(toe,p[v*3+2]!);
    }
    const front=white.filter(v=>p[v*3+2]!>toe-.006);
    expect(front.filter(v=>n[v*3+2]!>.9).length).toBeGreaterThanOrEqual(4);
    for(const v of front)expect(n[v*3+2]!).toBeGreaterThan(-.1);
  }finally{view.dispose()}
});
