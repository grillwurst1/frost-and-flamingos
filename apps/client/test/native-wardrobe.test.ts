import { beforeAll, afterAll, expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { Vector3 } from '@babylonjs/core/Maths/math';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture';
import type { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { createDefaultProfile, LEGS_PALETTES, SKIN_TONES, HAIR_COLORS, HEADGEAR_IDS, FACE_IDS, TORSO_IDS, BACK_IDS, HANDS_IDS, LEGS_IDS, FEET_IDS, type Cosmetics } from '@frost-and-flamingos/shared';
import { GlbCharacterView } from '../src/rendering/glb-character';
import { jointName, paintedModelLibrary, type PaintedModelAsset } from '../src/rendering/glb/library';
import { modularHeadFrame, modularTorsoFrame } from '../src/rendering/glb/modular-body';
import { closestOnSegment } from '../src/rendering/glb/hold';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { bodySurfaceRetarget } from '../src/rendering/glb/body-surfaces';
import { parseWardrobeHead } from '../src/rendering/glb/wardrobe-head';
import { nativeWardrobeRecipe, parseNativeWardrobe } from '../src/rendering/glb/native-wardrobe';
import { wristHandSurface } from '../src/rendering/glb/hand-surface';
import type { GlbRig } from '../src/rendering/glb/rig';

const directory = resolve(import.meta.dir, '../public/models');
let scene: Scene, asset: PaintedModelAsset, textures: { albedo: RawTexture; normal: null; wardrobeMask: RawTexture };
beforeAll(async () => {
  globalThis.fetch = (async input => {
    const name = String(input).split('/').pop()!, file = Bun.file(resolve(directory, name));
    if (!await file.exists()) return new Response('', { status: 404 });
    return new Response(await file.arrayBuffer(), { headers: { 'content-type': name.endsWith('.json') ? 'application/json' : 'model/gltf-binary' } });
  }) as typeof fetch;
  scene = new Scene(new NullEngine()); new ArcRotateCamera('native-qa', 0, 1.2, 5, Vector3.Zero(), scene);
  const loaded = await paintedModelLibrary(scene).load('alpine-allrounder');
  if (!loaded?.wardrobe) throw new Error('Committed native wardrobe data failed topology/hash validation');
  asset = loaded;
  const pixel = () => RawTexture.CreateRGBATexture(new Uint8Array([255, 255, 255, 255]), 1, 1, scene, false, false);
  textures = { albedo: pixel(), normal: null, wardrobeMask: pixel() };
});
afterAll(() => { scene.dispose(); scene.getEngine().dispose(); });

function build(changes: Partial<Cosmetics> = {}, detailedHead = false): { view: GlbCharacterView; mesh: Mesh } {
  const profile = createDefaultProfile('Native wardrobe'); Object.assign(profile.cosmetics, changes);
  const view = new GlbCharacterView(scene, new StandardMaterial('native-shadow', scene), profile, asset, detailedHead ? { ...textures, head: { albedo: textures.albedo, mask: textures.wardrobeMask } } : textures);
  const mesh = view.root.getChildMeshes().find(m => m.name === 'soldier-modular-detail') as Mesh;
  return { view, mesh };
}

test('weapon clearance follows the worn torso and excludes backpack geometry', () => {
  const a = build({ torso: 'torso_field_vest', back: 'back_none' });
  const b = build({ torso: 'torso_field_vest', back: 'back_cuckoo_clock' });
  const c = build({ torso: 'torso_tracht_shirt', back: 'back_none' });
  try {
    const vest = modularTorsoFrame(a.mesh)!, packed = modularTorsoFrame(b.mesh)!, shirt = modularTorsoFrame(c.mesh)!;
    expect(vest).not.toBeNull(); expect(packed).toEqual(vest);
    expect(vest.front).toBeGreaterThan(vest.back);
    expect(Math.abs(shirt.front - vest.front)).toBeGreaterThan(.01);
  } finally { a.view.dispose(); b.view.dispose(); c.view.dispose(); }
});

test.each([
  ['alpine-heavy', 'smg'], ['alpine-heavy', 'shotgun'], ['alpine-heavy', 'snow_cannon'],
  ['lagoon-heavy', 'smg'], ['lagoon-heavy', 'shotgun'], ['lagoon-heavy', 'snow_cannon'],
] as const)('%s reaches the real %s foregrip through idle animation', async (key, weaponId) => {
  const heavy = (await paintedModelLibrary(scene).load(key))!;
  const profile = createDefaultProfile('Heavy foregrip', 'heavy'); profile.faction = key.startsWith('lagoon') ? 'lagoon' : 'alpine';
  Object.assign(profile.cosmetics, { headgear: 'head_none', face: 'face_none', hairStyleIndex: 6, torso: 'torso_field_vest', back: 'back_none', legs: 'legs_olive_pants' });
  const view = new GlbCharacterView(scene, new StandardMaterial('foregrip-shadow', scene), profile, heavy, textures);
  const internals = view as unknown as {
    rig: GlbRig; breath: number; supportReach: number; supportShoulder: number;
    bindings: Map<string, { time: number; clip: { duration: number } }>;
    weapon: { hold: { support: Vector3; supportBack?: Vector3 } }; weaponAnchor: TransformNode;
  };
  try {
    for (const phase of [0, .35, .7]) {
      internals.breath = 0;
      for (const b of internals.bindings.values()) b.time = phase * b.clip.duration;
      for (let i = 0; i < 90; i++) view.updatePreview(1 / 45, -.75, weaponId);
      internals.rig.refresh();
      const anchor = internals.weaponAnchor, hold = internals.weapon.hold;
      const support = hold.support.rotateByQuaternionToRef(anchor.rotationQuaternion!, new Vector3()).add(anchor.position);
      const back = (hold.supportBack ?? hold.support).rotateByQuaternionToRef(anchor.rotationQuaternion!, new Vector3()).add(anchor.position);
      const wrist = internals.rig.position('LeftHand')!;
      expect(Vector3.Distance(wrist, closestOnSegment(support, back, wrist))).toBeLessThan(.035);
      expect(internals.supportReach).toBeGreaterThan(.9);
      expect(internals.supportShoulder).toBeGreaterThanOrEqual(-.650001);
      expect(internals.supportShoulder).toBeLessThanOrEqual(.000001);
      expect(view.muzzlePosition()!.asArray().every(Number.isFinite)).toBe(true);
    }
  } finally { view.dispose(); }
});

test('Heavy wrist without finger bones has a closed grip and follows the requested hand frame', async () => {
  const heavy = (await paintedModelLibrary(scene).load('lagoon-heavy'))!;
  expect(heavy.bindPositions.has('LeftHandMiddle1')).toBe(false);
  const surface = wristHandSurface(heavy, 'Left')!;
  expect(surface.points.size).toBe(5);
  const profile = createDefaultProfile('Heavy grip', 'heavy');
  profile.cosmetics.hands = 'hands_gold_watch';
  const view = new GlbCharacterView(scene, new StandardMaterial('grip-shadow', scene), profile, heavy, textures);
  try {
    const rig = (view as unknown as { rig: GlbRig }).rig;
    const direction = new Vector3(.3, -.25, .9).normalize(), thumb = new Vector3(0, 1, .2).normalize();
    rig.refresh();
    rig.orientHand('LeftHand', 'LeftHandMiddle1', 'LeftHandThumb1', direction, thumb, 1, 'LeftForeArm', surface.localFrame);
    rig.refresh();
    const actual = surface.localFrame.fingers.rotateByQuaternionToRef(rig.rotation('LeftHand')!, new Vector3()).normalize();
    expect(Vector3.Dot(actual, direction)).toBeGreaterThan(.999);
    const wrist = heavy.bindPositions.get('LeftHand')!;
    for (const [digit, points] of surface.points) {
      expect(points).toHaveLength(4);
      for (const p of points) expect(Vector3.Distance(p, wrist)).toBeLessThan(.14);
      // The fingertip folds back towards the wrist rather than forming a prong.
      if (digit !== 'Thumb') expect(Vector3.Distance(points[3]!, wrist)).toBeLessThan(Vector3.Distance(points[1]!, wrist));
    }
    const mesh = view.root.getChildMeshes().find(m => m.name === 'soldier-modular-detail')!;
    expect(mesh.subMeshes).toHaveLength(1);
  } finally { view.dispose(); }
});

test.each(['alpine-allrounder','alpine-heavy','lagoon-heavy'] as const)('%s keeps the full-length alphorn at its mouth through a breath', async key => {
  const target = (await paintedModelLibrary(scene).load(key))!;
  const profile = createDefaultProfile('Alphorn mouth', key.includes('heavy') ? 'heavy' : 'allrounder');
  profile.faction = key.startsWith('lagoon') ? 'lagoon' : 'alpine';
  Object.assign(profile.cosmetics, { headgear: 'head_none', face: 'face_none', hairStyleIndex: 6 });
  const view = new GlbCharacterView(scene, new StandardMaterial('horn-mouth', scene), profile, target,
    { ...textures, head: { albedo: textures.albedo, mask: textures.wardrobeMask } });
  const internals = view as unknown as { weapon: { fire(): void; hold: { mouthpiece: Vector3 } }; weaponAnchor: TransformNode;
    head: { mouth: Vector3 }; headPoint(point: Vector3): Vector3; rig: GlbRig };
  try {
    for (let i = 0; i < 90; i++) view.updatePreview(1 / 45, -.75, 'horn');
    internals.weapon.fire();
    for (let i = 0; i < 45; i++) {
      view.updatePreview(1 / 45, -.75, 'horn');
      const mouth = internals.headPoint(internals.head.mouth);
      const actual = internals.weapon.hold.mouthpiece.rotateByQuaternionToRef(internals.weaponAnchor.rotationQuaternion!, new Vector3())
        .add(internals.weaponAnchor.position);
      expect(Vector3.Distance(mouth, actual)).toBeLessThan(.035);
      internals.rig.refresh();
      expect(Vector3.Distance(internals.rig.position('RightHand')!, internals.weaponAnchor.position)).toBeLessThan(.035);
      expect(view.muzzlePosition()!.y).toBeGreaterThan(.02);
    }
  } finally { view.dispose(); }
});

test('Lagoon Heavy clothes have complete calves and never retain the fused donor ring or vest hem', async () => {
  const heavy = (await paintedModelLibrary(scene).load('lagoon-heavy'))!;
  for (const [torso, legs] of [
    ['torso_flamingo_ring', 'legs_olive_pants'],
    ['torso_field_vest', 'legs_olive_pants'],
    ['torso_hawaii_shirt', 'legs_olive_pants'],
    ['torso_flamingo_ring', 'legs_lederhosen'],
  ] as const) {
    const profile = createDefaultProfile('Heavy clothes', 'heavy'); profile.faction = 'lagoon';
    Object.assign(profile.cosmetics, { torso, legs });
    const recipe = nativeWardrobeRecipe(profile, heavy);
    expect(recipe.torso).toBe(false); expect(recipe.legs).toBe(false);
    const view = new GlbCharacterView(scene, new StandardMaterial('clothes-shadow', scene), profile, heavy, textures);
    try {
      const mesh = view.root.getChildMeshes().find(m => m.name === 'soldier-modular-detail')!;
      const flags = mesh.getVerticesData('uv2')!;
      let torsoVertices = 0, legVertices = 0;
      for (let v = 0; v < mesh.getTotalVertices(); v++) if (flags[v * 2] === 1) {
        if (flags[v * 2 + 1] === 3) torsoVertices++;
        if (flags[v * 2 + 1] === 6) legVertices++;
      }
      expect(torsoVertices).toBe(0); expect(legVertices).toBe(0);
      if (legs === 'legs_olive_pants') {
        const p = mesh.getVerticesData('position')!, c = mesh.getVerticesData('color')!;
        const red = Number.parseInt(LEGS_PALETTES.legs_olive_pants.primary.slice(1, 3), 16) / 255;
        for (const side of ['Left', 'Right']) {
          const ankle = heavy.bindPositions.get(`${side}Foot`)!.y, knee = heavy.bindPositions.get(`${side}Leg`)!.y;
          const heights = [];
          for (let v = 0; v < mesh.getTotalVertices(); v++) if ((p[v * 3]! > 0) === (side === 'Left')
            && flags[v * 2] === 0 && Math.abs(c[v * 4]! - red) < .001
            && p[v * 3 + 1]! > ankle + .02 && p[v * 3 + 1]! < knee - .02) heights.push(p[v * 3 + 1]!);
          expect(heights.length).toBeGreaterThan(40);
          expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan((knee - ankle) * .5);
        }
      }
      expect(mesh.subMeshes).toHaveLength(1);
    } finally { view.dispose(); }
  }
});

test('the detailed reference body preserves native surfaces in one compact skinned draw', () => {
  const { view, mesh } = build();
  try {
    expect(view.debugInfo().renderer).toBe('native-wardrobe');
    expect(mesh.subMeshes).toHaveLength(1); expect(mesh.getTotalIndices() / 3).toBeLessThan(35000);
    const flags = mesh.getVerticesData('uv2')!;
    let native = 0; for (let v = 0; v < mesh.getTotalVertices(); v++) if (flags[v * 2]! > .5) native++;
    expect(native).toBeGreaterThan(12000);
    // Every stored vertex is actually drawn; there is no second hidden body in
    // the GPU buffers after removing replacement wardrobe surfaces.
    expect(new Set(Array.from(mesh.getIndices()!)).size).toBe(mesh.getTotalVertices());
  } finally { view.dispose(); }
});

test('imported faces use the mixed mesh front-face convention, preserving authored normals', () => {
  const { view, mesh } = build();
  try {
    const p = mesh.getVerticesData('position')!, n = mesh.getVerticesData('normal')!, uv = mesh.getVerticesData('uv2')!, indices = mesh.getIndices()!;
    let tested = 0, outward = 0;
    for (let f = 0; f < indices.length; f += 3) {
      const a = indices[f]!, b = indices[f + 1]!, c = indices[f + 2]!;
      if (uv[a * 2]! < .5 || uv[b * 2]! < .5 || uv[c * 2]! < .5) continue;
      const ab = new Vector3(p[b * 3]! - p[a * 3]!, p[b * 3 + 1]! - p[a * 3 + 1]!, p[b * 3 + 2]! - p[a * 3 + 2]!);
      const ac = new Vector3(p[c * 3]! - p[a * 3]!, p[c * 3 + 1]! - p[a * 3 + 1]!, p[c * 3 + 2]! - p[a * 3 + 2]!);
      const normal = new Vector3(n[a * 3]! + n[b * 3]! + n[c * 3]!, n[a * 3 + 1]! + n[b * 3 + 1]! + n[c * 3 + 1]!, n[a * 3 + 2]! + n[b * 3 + 2]! + n[c * 3 + 2]!);
      tested++; if (Vector3.Dot(Vector3.Cross(ab, ac), normal) < 0) outward++;
    }
    expect(tested).toBeGreaterThan(10000); expect(outward / tested).toBeGreaterThan(.98);
  } finally { view.dispose(); }
});

test('native skin/hair selection reaches paint uniforms and semantic vertices without recolouring clothing', () => {
  const channels = (hex: string) => [1, 3, 5].map(i => Number.parseInt(hex.slice(i, i + 2), 16) / 255);
  for (const [skinToneIndex, hex] of SKIN_TONES.entries()) {
    const { view, mesh } = build({ skinToneIndex });
    try {
      const uniforms = (mesh.material as ShaderMaterial).serialize() as { colors3: Record<string, number[]> };
      expect(uniforms.colors3.uSkinColor).toEqual(channels(hex));
      const paint = mesh.getVerticesData('color')!; let skin = 0;
      for (let v = 0; v < paint.length; v += 4) if (paint[v + 3]! > .9) {
        skin++; for (let c = 0; c < 3; c++) expect(paint[v + c]!).toBeCloseTo(channels(hex)[c]!, 5);
      }
      expect(skin).toBeGreaterThan(1000);
    } finally { view.dispose(); }
  }
  for (const [hairColorIndex, hex] of HAIR_COLORS.entries()) {
    const { view, mesh } = build({ hairColorIndex });
    try {
      const uniforms = (mesh.material as ShaderMaterial).serialize() as { colors3: Record<string, number[]> };
      expect(uniforms.colors3.uWardrobeHair).toEqual(channels(hex));
    } finally { view.dispose(); }
  }
}, 30000);

test('all wardrobe selections change actually drawn native/replacement geometry', () => {
  const slots = { headgear: HEADGEAR_IDS, face: FACE_IDS, torso: TORSO_IDS, back: BACK_IDS, hands: HANDS_IDS, legs: LEGS_IDS, feet: FEET_IDS };
  for (const [slot, ids] of Object.entries(slots)) {
    const hashes = new Set<string>();
    for (const id of ids) {
      const { view, mesh } = build({ [slot]: id });
      try {
        const hash = new Bun.CryptoHasher('sha256');
        hash.update(Float32Array.from(mesh.getVerticesData('position')!)); hash.update(Uint32Array.from(mesh.getIndices()!)); hash.update(Float32Array.from(mesh.getVerticesData('color')!));
        hashes.add(hash.digest('hex')); expect(mesh.getTotalIndices() / 3).toBeLessThan(60000); expect(mesh.subMeshes).toHaveLength(1);
      } finally { view.dispose(); }
    }
    expect(hashes.size).toBe(ids.length);
  }
}, 30000);

test('removing fused hair/hat or changing the beard uses a complete head rather than exposing a cut', () => {
  const profile = createDefaultProfile('Head choices');
  expect(nativeWardrobeRecipe(profile, asset).head).toBe(true);
  profile.cosmetics.headgear = 'head_none'; expect(nativeWardrobeRecipe(profile, asset).head).toBe(false);
  profile.cosmetics.headgear = 'head_tirol'; profile.cosmetics.hairStyleIndex = 6;
  expect(nativeWardrobeRecipe(profile, asset).head).toBe(false); expect(nativeWardrobeRecipe(profile, asset).hat).toBe(false);
  profile.cosmetics.hairStyleIndex = 0; profile.cosmetics.face = 'face_none'; expect(nativeWardrobeRecipe(profile, asset).head).toBe(false);
  expect(parseNativeWardrobe({ ...asset.wardrobe, indexCount: 3 }, asset.wardrobe!.vertexCount, asset.wardrobe!.indexCount)).toBeNull();
});


test('custom hair and clean face keep the same detailed anatomical surface in one draw', () => {
  expect(asset.wardrobeHead).toBeDefined();
  let faceFingerprint: string | null = null;
  const silhouettes = new Set<string>();
  for (let hairStyleIndex = 0; hairStyleIndex < 7; hairStyleIndex++) {
    const { view, mesh } = build({ headgear: 'head_none', face: 'face_none', hairStyleIndex }, true);
    try {
      expect(mesh.subMeshes).toHaveLength(1); expect(mesh.getTotalIndices() / 3).toBeLessThan(60000);
      const p = mesh.getVerticesData('position')!, uv = mesh.getVerticesData('uv')!, c = mesh.getVerticesData('color')!;
      const joints = mesh.getVerticesData('matricesIndices')!, weights = mesh.getVerticesData('matricesWeights')!;
      const head = mesh.skeleton!.bones.find(b => jointName(b.name) === 'Head')!.getIndex();
      const face = [];
      for (let v = 0; v < mesh.getTotalVertices(); v++) if (c[v * 4 + 3]! > .9
        && [0, 1, 2, 3].some(k => joints[v * 4 + k] === head && weights[v * 4 + k]! > .99))
        face.push(p[v * 3], p[v * 3 + 1], p[v * 3 + 2], uv[v * 2], uv[v * 2 + 1]);
      expect(face.length).toBeGreaterThan(15000);
      const fingerprint = new Bun.CryptoHasher('sha256').update(JSON.stringify(face)).digest('hex');
      if (faceFingerprint === null) faceFingerprint = fingerprint; else expect(fingerprint).toBe(faceFingerprint);
      silhouettes.add(new Bun.CryptoHasher('sha256').update(JSON.stringify(Array.from(p))).digest('hex'));
    } finally { view.dispose(); }
  }
  expect(silhouettes.size).toBe(7);
});

test('solid anatomy around sculpted eyes stays outside the pigment atlas', () => {
  const { view, mesh } = build({ headgear: 'head_none', face: 'face_none', hairStyleIndex: 6 }, true);
  try {
    const c = mesh.getVerticesData('color')!, flags = mesh.getVerticesData('uv2')!;
    const joints = mesh.getVerticesData('matricesIndices')!, weights = mesh.getVerticesData('matricesWeights')!;
    const head = mesh.skeleton!.bones.find(b => jointName(b.name) === 'Head')!.getIndex();
    let skin = 0, whites = 0;
    for (let v = 0; v < mesh.getTotalVertices(); v++) {
      if (c[v * 4 + 3]! > .9 && [0, 1, 2, 3].some(k => joints[v * 4 + k] === head && weights[v * 4 + k]! > .99)) {
        expect(flags[v * 2]).toBe(0); skin++;
      }
      if (flags[v * 2] === 0 && c[v * 4 + 3] === 0 && Math.abs(c[v * 4]! - .94) < .001
        && Math.abs(c[v * 4 + 1]! - .94) < .001 && Math.abs(c[v * 4 + 2]! - .90) < .001) whites++;
    }
    expect(skin).toBeGreaterThan(3000); expect(whites).toBeGreaterThan(100);
    expect(mesh.subMeshes).toHaveLength(1);
  } finally { view.dispose(); }
});

test('the default beard and hat use the same anatomical skin head as a clean wardrobe choice', () => {
  const a = build({}, true), b = build({ face: 'face_none', headgear: 'head_none', hairStyleIndex: 6 }, true);
  const anatomy = (mesh: Mesh) => {
    const p = mesh.getVerticesData('position')!, c = mesh.getVerticesData('color')!, flags = mesh.getVerticesData('uv2')!;
    const joints = mesh.getVerticesData('matricesIndices')!, weights = mesh.getVerticesData('matricesWeights')!;
    const head = mesh.skeleton!.bones.find(bone => jointName(bone.name) === 'Head')!.getIndex();
    const result: number[] = [];
    for (let v = 0; v < mesh.getTotalVertices(); v++) if (c[v * 4 + 3] === 1 && flags[v * 2] === 0
      && joints[v * 4] === head && weights[v * 4] === 1) result.push(p[v * 3]!, p[v * 3 + 1]!, p[v * 3 + 2]!);
    return result;
  };
  try {
    const skin = anatomy(a.mesh); expect(skin.length).toBeGreaterThan(9000);
    expect(skin).toEqual(anatomy(b.mesh));
    expect(a.mesh.subMeshes).toHaveLength(1); expect(a.mesh.getTotalIndices() / 3).toBeLessThan(60000);
  } finally { a.view.dispose(); b.view.dispose(); }
});

test('the tailored waistcoat is not pierced by sleeve-labelled shirt fragments at the chest centre', () => {
  const { view, mesh } = build({}, true);
  try {
    const p = mesh.getVerticesData('position')!, flags = mesh.getVerticesData('uv2')!;
    const chest = asset.bindPositions.get('Spine2')!;
    let sleeves = 0;
    for (let v = 0; v < mesh.getTotalVertices(); v++) {
      if (flags[v * 2] !== 1 || flags[v * 2 + 1] !== 4) continue;
      sleeves++;
      expect(!(Math.abs(p[v * 3]!) < .10 && Math.abs(p[v * 3 + 1]! - chest.y) < .2)).toBe(true);
    }
    expect(sleeves).toBeGreaterThan(1000);
  } finally { view.dispose(); }
});

test.each(['feet_sandals_socks', 'feet_dive_flippers'] as const)('native Infiltrator trousers keep a complete calf above %s', async feet => {
  const target = (await paintedModelLibrary(scene).load('alpine-infiltrator'))!;
  const profile = createDefaultProfile('Closed trouser calves', 'infiltrator');
  profile.cosmetics.feet = feet;
  const view = new GlbCharacterView(scene, new StandardMaterial('calf-shadow', scene), profile, target,
    { ...textures, head: { albedo: textures.albedo, mask: textures.wardrobeMask } });
  try {
    const mesh = view.root.getChildMeshes().find(m => m.name === 'soldier-modular-detail')!;
    const p = mesh.getVerticesData('position')!;
    for (const side of ['Left', 'Right']) for (const t of [.25, .5, .75]) {
      const knee = target.bindPositions.get(side + 'Leg')!, ankle = target.bindPositions.get(side + 'Foot')!;
      const at = Vector3.Lerp(knee, ankle, t); let vertices = 0;
      for (let v = 0; v < mesh.getTotalVertices(); v++) if (Math.abs(p[v * 3 + 1]! - at.y) < .045
        && Math.hypot(p[v * 3]! - at.x, p[v * 3 + 2]! - at.z) < .18) vertices++;
      expect(vertices).toBeGreaterThan(12);
    }
    expect(mesh.subMeshes).toHaveLength(1);
  } finally { view.dispose(); }
});

test('the sculpted lip crease follows selected skin rather than donor paint or selected hair', () => {
  const h = asset.wardrobeHead!, vertex = h.painted.findIndex(p => p === 3);
  expect(vertex).toBeGreaterThanOrEqual(0);
  for (const skinToneIndex of [0, 11]) {
    const profile = createDefaultProfile('Lip colour');
    Object.assign(profile.cosmetics, { headgear: 'head_none', face: 'face_none', hairStyleIndex: 6, skinToneIndex, hairColorIndex: 4 });
    const { view, mesh } = build(profile.cosmetics, true);
    try {
      const frame = modularHeadFrame(profile, asset, true, true), scale = frame.radius / h.frame.radius;
      const target = [h.positions[vertex * 3]! * scale, frame.y + (h.positions[vertex * 3 + 1]! - h.frame.y) * scale,
        frame.z + (h.positions[vertex * 3 + 2]! - h.frame.z) * scale];
      const p = mesh.getVerticesData('position')!, c = mesh.getVerticesData('color')!, flags = mesh.getVerticesData('uv2')!;
      let found = -1;
      for (let v = 0; v < mesh.getTotalVertices(); v++) if (Math.hypot(...target.map((n, k) => p[v * 3 + k]! - n)) < 1e-5) { found = v; break; }
      expect(found).toBeGreaterThanOrEqual(0); expect(c[found * 4 + 3]).toBe(0); expect(flags[found * 2]).toBe(0);
      for (let channel = 0; channel < 3; channel++) {
        const skin = Number.parseInt(SKIN_TONES[skinToneIndex]!.slice(1 + channel * 2, 3 + channel * 2), 16) / 255;
        expect(c[found * 4 + channel]!).toBeCloseTo(skin * h.tints[vertex * 3 + channel]!, 5);
      }
    } finally { view.dispose(); }
  }
});

test('the replacement skull is a closed surface with outward faces and finite atlas data', () => {
  const head = asset.wardrobeHead!; expect(parseWardrobeHead(head)).not.toBeNull();
  const edges = new Map<string, number>(); let cap = 0, outward = 0;
  const p = head.positions, n = head.normals;
  for (let f = 0; f < head.indices.length; f += 3) {
    const face = head.indices.slice(f, f + 3), [a, b, c] = face as [number, number, number];
    if (face.some(v => head.painted[v] !== 0)) continue;
    for (let i = 0; i < 3; i++) { const aa = face[i]!, bb = face[(i + 1) % 3]!;
      const edge = aa < bb ? `${aa}:${bb}` : `${bb}:${aa}`; edges.set(edge, (edges.get(edge) ?? 0) + 1); }
    const at = (v: number) => Vector3.FromArray(p, v * 3);
    const normal = Vector3.FromArray(n, a * 3).add(Vector3.FromArray(n, b * 3)).add(Vector3.FromArray(n, c * 3));
    const cross = Vector3.Cross(at(b).subtract(at(a)), at(c).subtract(at(a)));
    if (cross.lengthSquared() < 1e-18) continue;
    cap++; if (Vector3.Dot(cross, normal) > 0) outward++;
  }
  expect(edges.size).toBeGreaterThan(1000);
  for (const count of edges.values()) expect(count).toBe(2);
  expect(cap).toBeGreaterThan(1000); expect(outward / cap).toBeGreaterThan(.98);
  expect(parseWardrobeHead({ ...head, normals: [NaN] })).toBeNull();
});

test('the bald heavy uses the detailed face without importing the original winter coat hem', async () => {
  const heavy = await paintedModelLibrary(scene).load('alpine-heavy'); expect(heavy?.wardrobeHead).toBeDefined();
  expect(heavy!.wardrobeHead).toBe(asset.wardrobeHead);
  const profile = createDefaultProfile('Senn_Koloss', 'heavy');
  Object.assign(profile.cosmetics, { headgear: 'head_none', face: 'face_none', hairStyleIndex: 6, torso: 'torso_field_vest', legs: 'legs_olive_pants' });
  expect(nativeWardrobeRecipe(profile, heavy!).legs).toBe(false);
  const view = new GlbCharacterView(scene, new StandardMaterial('heavy-qa', scene), profile, heavy!, { ...textures, head: { albedo: textures.albedo, mask: textures.wardrobeMask } });
  try {
    const mesh = view.root.getChildMeshes().find(m => m.name === 'soldier-modular-detail') as Mesh;
    const flags = mesh.getVerticesData('uv2')!;
    const joints = mesh.getVerticesData('matricesIndices')!, weights = mesh.getVerticesData('matricesWeights')!;
    const headBone = mesh.skeleton!.bones.find(b => jointName(b.name) === 'Head')!.getIndex();
    let head = 0; for (let v = 0; v < mesh.getTotalVertices(); v++) {
      if ([0, 1, 2, 3].some(k => joints[v * 4 + k] === headBone && weights[v * 4 + k]! > .99)) head++;
      // The old fur-trimmed coat's hips were labelled as trousers; they must
      // not leak into the selected olive-pants / open field-vest outfit.
      expect(flags[v * 2]! === 1 && flags[v * 2 + 1] === 6).toBe(false);
    }
    expect(head).toBeGreaterThan(3000); expect(mesh.subMeshes).toHaveLength(1);
  } finally { view.dispose(); }
});


test('selected Afro colour reaches the native sculpt and the shared curls independently of complexion', async () => {
  const native = await paintedModelLibrary(scene).load('lagoon-allrounder');
  const sourceHairVertices = native!.wardrobe!.pigment.filter(n => n === 2).length;
  expect(sourceHairVertices).toBeGreaterThan(2500);
  const profile = createDefaultProfile('Painted curls'); profile.faction = 'lagoon';
  Object.assign(profile.cosmetics, { face: 'face_snorkel_mask', headgear: 'head_none', hairStyleIndex: 1, hairColorIndex: 2, skinToneIndex: 9 });
  expect(nativeWardrobeRecipe(profile, native!).head).toBe(true);
  const view = new GlbCharacterView(scene, new StandardMaterial('afro-native', scene), profile, native!, textures);
  try {
    const mesh = view.root.getChildMeshes().find(m => m.name === 'soldier-modular-detail') as Mesh;
    const c = mesh.getVerticesData('color')!, flags = mesh.getVerticesData('uv2')!;
    const hair = [1, 3, 5].map(i => Number.parseInt(HAIR_COLORS[2].slice(i, i + 2), 16) / 255);
    let painted = 0;
    for (let v = 0; v < mesh.getTotalVertices(); v++) if (flags[v * 2] === 1 && flags[v * 2 + 1] === 2
      && hair.every((x, i) => Math.abs(c[v * 4 + i]! - x) < .001)) painted++;
    expect(painted).toBe(sourceHairVertices);
  } finally { view.dispose(); }
  expect(asset.wardrobeHead!.afro!.indices.length).toBeGreaterThan(9000);
});

test('the anatomical skin base stays independent of shirt/vest selection and optional outfit paint', () => {
  for (const skinToneIndex of [0, 4, 9]) {
    const rgb = [1, 3, 5].map(i => Number.parseInt(SKIN_TONES[skinToneIndex]!.slice(i, i + 2), 16) / 255);
    const anatomy = new Set<string>();
    for (const torso of ['torso_tracht_shirt', 'torso_hawaii_shirt', 'torso_field_vest'] as const) {
      const { view, mesh } = build({ skinToneIndex, torso, face: 'face_none', headgear: 'head_none', hairStyleIndex: 6 }, true);
      try {
        const uniforms = (mesh.material as ShaderMaterial).serialize() as { colors3: Record<string, number[]> };
        expect(uniforms.colors3.uSkinColor).toEqual(rgb);
        const flags = mesh.getVerticesData('uv2')!, p = mesh.getVerticesData('position')!, paint = mesh.getVerticesData('color')!;
        const face: number[] = [];
        for (let v = 0; v < mesh.getTotalVertices(); v++) if (flags[v * 2] === 2 && flags[v * 2 + 1] === 2) {
          face.push(p[v * 3]!, p[v * 3 + 1]!, p[v * 3 + 2]!);
          for (let channel = 0; channel < 3; channel++) expect(paint[v * 4 + channel]).toBeCloseTo(rgb[channel]!, 5);
        }
        anatomy.add(new Bun.CryptoHasher('sha256').update(JSON.stringify(face)).digest('hex'));
      } finally { view.dispose(); }
    }
    expect(anatomy.size).toBe(1);
    const profile = createDefaultProfile('Unpainted anatomy'); profile.cosmetics.skinToneIndex = skinToneIndex;
    const fallback = new GlbCharacterView(scene, new StandardMaterial('skin-base-fallback', scene), profile, asset, null);
    try {
      const mesh = fallback.root.getChildMeshes().find(m => m.name === 'soldier-modular-detail') as Mesh;
      const uniforms = (mesh.material as ShaderMaterial).serialize() as { colors3: Record<string, number[]> };
      expect(uniforms.colors3.uSkinColor).toEqual(rgb);
    } finally { fallback.dispose(); }
  }
});


test('forehead skin crossing the original hat split remains an anatomical skin region', () => {
  const source = asset.container.meshes.find(m => m.skeleton) as Mesh;
  const positions = source.getVerticesData('position')!, indices = source.getIndices()!, data = asset.wardrobe!;
  const forehead = new Set<number>();
  for (let f = 0; f < data.regions.length; f++) if (data.regions[f] === 1) {
    for (let corner = 0; corner < 3; corner++) {
      const v = indices[f * 3 + corner]!;
      if (data.pigment[v] === 1 && positions[v * 3 + 1]! > asset.spec.head.y + .045
        && Math.abs(positions[v * 3]!) < asset.spec.head.radius * .85 && positions[v * 3 + 2]! > asset.spec.head.z + .025) forehead.add(v);
    }
  }
  expect(forehead.size).toBeGreaterThan(0);
});

test('native triangles keep one material region across skin/outfit boundaries', () => {
  const { view, mesh } = build();
  try {
    const flags = mesh.getVerticesData('uv2')!, indices = mesh.getIndices()!; let native = 0;
    for (let f = 0; f < indices.length; f += 3) {
      const a = indices[f]!, b = indices[f + 1]!, c = indices[f + 2]!;
      if (flags[a * 2] !== 1) continue;
      native++; const region = flags[a * 2 + 1];
      expect(flags[b * 2 + 1]).toBe(region); expect(flags[c * 2 + 1]).toBe(region);
    }
    expect(native).toBeGreaterThan(10000);
  } finally { view.dispose(); }
});


test('authored body surfaces preserve their donor bind pose and map limb anchors across different rigs', async () => {
  const donor = await paintedModelLibrary(scene).load('lagoon-heavy');
  const target = await paintedModelLibrary(scene).load('alpine-heavy');
  expect(donor?.wardrobeBody).toBeDefined(); expect(target?.wardrobeBody).toBe(donor!.wardrobeBody);
  const data = donor!.wardrobeBody!, profile = createDefaultProfile('Surface anchors', 'heavy');
  profile.cosmetics.bodyType = .15;
  const indices = (a: PaintedModelAsset) => new Map(data.bones.filter(b => a.bindPositions.has(b.name)).map(b => [b.name, b.index]));
  const identity = bodySurfaceRetarget(profile, donor!, data, indices(donor!));
  for (let v = 0; v < data.positions.length / 3; v += 17) {
    const mapped = identity.vertex(v), original = Vector3.FromArray(data.positions, v * 3);
    expect(Vector3.Distance(mapped.position, original)).toBeLessThan(.00001);
    expect(mapped.normal.length()).toBeCloseTo(1, 5);
  }
  const retarget = bodySurfaceRetarget(profile, target!, data, indices(target!));
  for (const side of ['Left', 'Right']) for (const [start, end] of [['Arm', 'ForeArm'], ['ForeArm', 'Hand'], ['UpLeg', 'Leg'], ['Leg', 'Foot']]) {
    const bone = data.bones.find(b => b.name === side + start)!;
    const child = data.bones.find(b => b.name === side + end)!;
    const at = retarget.point(bone.index, Vector3.FromArray(child.position), new Vector3(0, 0, 1));
    expect(Vector3.Distance(at.position, target!.bindPositions.get(child.name)!)).toBeLessThan(.00001);
  }
});

test('bald Heavy uses sculpted bare arms without adding another body draw', async () => {
  const heavy = await paintedModelLibrary(scene).load('alpine-heavy');
  const profile = createDefaultProfile('Sculpted Heavy', 'heavy');
  Object.assign(profile.cosmetics, { headgear: 'head_none', face: 'face_none', hairStyleIndex: 6, skinToneIndex: 9,
    torso: 'torso_field_vest', legs: 'legs_olive_pants' });
  const view = new GlbCharacterView(scene, new StandardMaterial('surfaces-shadow', scene), profile, heavy!,
    { ...textures, head: { albedo: textures.albedo, mask: textures.wardrobeMask } });
  try {
    const mesh = view.root.getChildMeshes().find(m => m.name === 'soldier-modular-detail') as Mesh;
    const flags = mesh.getVerticesData('uv2')!, colors = mesh.getVerticesData('color')!;
    const joints = mesh.getVerticesData('matricesIndices')!, weights = mesh.getVerticesData('matricesWeights')!;
    const armBones = new Set(mesh.skeleton!.bones.filter(b => /^(Left|Right)(Arm|ForeArm)$/.test(jointName(b.name))).map(b => b.getIndex()));
    let arms = 0;
    for (let v = 0; v < mesh.getTotalVertices(); v++) if ([0,1,2,3].some(k => armBones.has(joints[v * 4 + k]!) && weights[v * 4 + k]! > .1)) {
      arms++; expect(colors[v * 4 + 3]).toBe(1); expect(flags[v * 2]).toBe(0);
    }
    expect(arms).toBeGreaterThan(1000);
    expect(mesh.subMeshes).toHaveLength(1); expect(mesh.getTotalIndices() / 3).toBeLessThan(60000);
  } finally { view.dispose(); }
});

test('connected hands follow target finger lengths and anatomical palm axes', async () => {
  const target = (await paintedModelLibrary(scene).load('alpine-heavy'))!;
  const hands = target.wardrobeBody!.hands!, profile = createDefaultProfile('Connected hands', 'heavy');
  profile.cosmetics.bodyType = .15;
  const indices = new Map(hands.bones.filter(b => target.bindPositions.has(b.name)).map(b => [b.name, b.index]));
  const retarget = bodySurfaceRetarget(profile, target, hands, indices);
  for (const side of ['Left', 'Right']) {
    const palm = hands.bones.find(b => b.name === side + 'Hand')!;
    const at = (digit: string) => retarget.point(palm.index,
      Vector3.FromArray(hands.bones.find(b => b.name === `${side}Hand${digit}1`)!.position), new Vector3(0, 0, 1)).position;
    const direction = target.bindPositions.get(side + 'HandMiddle1')!.subtract(target.bindPositions.get(side + 'Hand')!).normalize();
    const across = at('Index').subtract(at('Pinky'));
    const expected = target.bindPositions.get(side + 'HandIndex1')!.subtract(target.bindPositions.get(side + 'HandPinky1')!);
    across.subtractInPlace(direction.scale(Vector3.Dot(across, direction))).normalize();
    expected.subtractInPlace(direction.scale(Vector3.Dot(expected, direction))).normalize();
    expect(Vector3.Dot(across, expected)).toBeGreaterThan(.999);
  }
  for (const side of ['Left', 'Right']) for (const digit of ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky']) {
    for (const part of [1, 2]) {
      const bone = hands.bones.find(b => b.name === `${side}Hand${digit}${part}`)!;
      const end = hands.bones.find(b => b.name === `${side}Hand${digit}${part + 1}`)!;
      const at = retarget.point(bone.index, Vector3.FromArray(end.position), new Vector3(0, 0, 1));
      expect(Vector3.Distance(at.position, target.bindPositions.get(end.name)!)).toBeLessThan(.00001);
    }
  }
});

test('the complete gold watch stays rigid on the forearm when anatomical arms and hands replace primitives', async () => {
  const target = (await paintedModelLibrary(scene).load('alpine-heavy'))!;
  const profile = createDefaultProfile('Complete watch', 'heavy');
  Object.assign(profile.cosmetics, { hands: 'hands_gold_watch', torso: 'torso_field_vest' });
  const view = new GlbCharacterView(scene, new StandardMaterial('watch-shadow', scene), profile, target,
    { ...textures, head: { albedo: textures.albedo, mask: textures.wardrobeMask } });
  try {
    const mesh = view.root.getChildMeshes().find(m => m.name === 'soldier-modular-detail') as Mesh;
    const colors = mesh.getVerticesData('color')!, joints = mesh.getVerticesData('matricesIndices')!;
    const weights = mesh.getVerticesData('matricesWeights')!, flags = mesh.getVerticesData('uv2')!;
    const forearms = new Set(mesh.skeleton!.bones.filter(b => /ForeArm$/.test(jointName(b.name))).map(b => b.getIndex()));
    let gold = 0;
    for (let v = 0; v < mesh.getTotalVertices(); v++) {
      if (flags[v * 2] !== 0 || colors[v * 4 + 3] !== 0
        || ![244, 201, 93].every((channel, k) => Math.abs(colors[v * 4 + k]! - channel / 255) < .000001)) continue;
      gold++;
      expect(forearms.has(joints[v * 4]!)).toBe(true);
      expect(weights[v * 4]).toBe(1);
    }
    expect(gold).toBeGreaterThan(500);
    expect(mesh.subMeshes).toHaveLength(1);
  } finally { view.dispose(); }
});


test('eyepatch beards follow selected hair colour and extend around the actual sculpted chin', () => {
  for (const hairColorIndex of [0, 2, 5]) {
    const { view, mesh } = build({ face: 'face_eyepatch_beard', hairStyleIndex: 6, headgear: 'head_none', hairColorIndex }, true);
    try {
      const c = mesh.getVerticesData('color')!, p = mesh.getVerticesData('position')!, flags = mesh.getVerticesData('uv2')!;
      const rgb = [1, 3, 5].map(i => Number.parseInt(HAIR_COLORS[hairColorIndex]!.slice(i, i + 2), 16) / 255);
      let beard = 0, bottom = Infinity;
      for (let v = 0; v < mesh.getTotalVertices(); v++) {
        if (flags[v * 2] !== 0 || c[v * 4 + 3] !== 0 || p[v * 3 + 1]! >= asset.spec.head.y) continue;
        if (rgb.every((channel, i) => Math.abs(c[v * 4 + i]! - channel) < .00001)) {
          beard++; bottom = Math.min(bottom, p[v * 3 + 1]!);
        }
      }
      expect(beard).toBeGreaterThan(500);
      const frame = asset.wardrobeHead!.frame, radius = .15;
      const actualChin = asset.spec.head.y + (1.285 - frame.y) * radius / frame.radius;
      expect(bottom).toBeLessThan(actualChin - .025);
      expect(mesh.subMeshes).toHaveLength(1); expect(mesh.getTotalIndices() / 3).toBeLessThan(60000);
    } finally { view.dispose(); }
  }
});


test('mixed olive trousers keep the waist closed and calf fabric visible with native mountain boots', () => {
  const { view, mesh } = build({ legs: 'legs_olive_pants', feet: 'feet_mountain_boots' }, true);
  try {
    const rgb = [1, 3, 5].map(i => Number.parseInt(LEGS_PALETTES.legs_olive_pants.primary.slice(i, i + 2), 16) / 255);
    const p = mesh.getVerticesData('position')!, c = mesh.getVerticesData('color')!, flags = mesh.getVerticesData('uv2')!;
    let fabric = 0, waist = 0;
    for (let v = 0; v < mesh.getTotalVertices(); v++) if (flags[v * 2] === 0 && c[v * 4 + 3] === 0
      && p[v * 3 + 1]! > .25 && p[v * 3 + 1]! < .40
      && rgb.every((channel, k) => Math.abs(c[v * 4 + k]! - channel) < .00001)) fabric++;
    for (let v = 0; v < mesh.getTotalVertices(); v++) if (flags[v * 2] === 0 && c[v * 4 + 3] === 0
      && p[v * 3 + 1]! > asset.bindPositions.get('Spine')!.y
      && p[v * 3 + 1]! < asset.bindPositions.get('Spine1')!.y
      && rgb.every((channel, k) => Math.abs(c[v * 4 + k]! - channel) < .00001)) waist++;
    expect(waist).toBeGreaterThan(10);
    expect(fabric).toBeGreaterThan(100);
    expect(mesh.subMeshes).toHaveLength(1); expect(mesh.getTotalIndices() / 3).toBeLessThan(60000);
  } finally { view.dispose(); }
});


test('the original Alpine calf is skin-bearing leg anatomy rather than fixed-colour footwear', () => {
  const source = asset.container.meshes.find(m => m.skeleton) as Mesh;
  const p = source.getVerticesData('position')!, indices = source.getIndices()!, data = asset.wardrobe!;
  let calfSkin = 0;
  for (let f = 0; f < data.regions.length; f++) {
    const vs = [indices[f * 3]!, indices[f * 3 + 1]!, indices[f * 3 + 2]!];
    const y = vs.reduce((sum, v) => sum + p[v * 3 + 1]!, 0) / 3;
    if (y > .42 && y < .49 && data.regions[f] === 6) for (const v of vs) if (data.pigment[v] === 1) calfSkin++;
    if (data.regions[f] === 7) {
      const x = vs.reduce((sum, v) => sum + p[v * 3]!, 0) / 3;
      const foot = asset.bindPositions.get(x > 0 ? 'LeftFoot' : 'RightFoot')!;
      expect(y).toBeLessThanOrEqual(foot.y + .120001);
    }
  }
  expect(calfSkin).toBeGreaterThan(30);
});
