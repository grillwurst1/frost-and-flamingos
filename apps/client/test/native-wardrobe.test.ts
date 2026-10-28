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
import { createDefaultProfile, SKIN_TONES, HAIR_COLORS, HEADGEAR_IDS, FACE_IDS, TORSO_IDS, BACK_IDS, HANDS_IDS, LEGS_IDS, FEET_IDS, type Cosmetics } from '@frost-and-flamingos/shared';
import { GlbCharacterView } from '../src/rendering/glb-character';
import { paintedModelLibrary, type PaintedModelAsset } from '../src/rendering/glb/library';
import { bodySurfaceRetarget } from '../src/rendering/glb/body-surfaces';
import { parseWardrobeHead } from '../src/rendering/glb/wardrobe-head';
import { nativeWardrobeRecipe, parseNativeWardrobe } from '../src/rendering/glb/native-wardrobe';

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


test('custom hair and clean face keep the same detailed painted anatomy in one draw', () => {
  expect(asset.wardrobeHead).toBeDefined();
  let faceFingerprint: string | null = null;
  const silhouettes = new Set<string>();
  for (let hairStyleIndex = 0; hairStyleIndex < 7; hairStyleIndex++) {
    const { view, mesh } = build({ headgear: 'head_none', face: 'face_none', hairStyleIndex }, true);
    try {
      expect(mesh.subMeshes).toHaveLength(1); expect(mesh.getTotalIndices() / 3).toBeLessThan(60000);
      const flags = mesh.getVerticesData('uv2')!, p = mesh.getVerticesData('position')!, uv = mesh.getVerticesData('uv')!;
      const face = [];
      for (let v = 0; v < mesh.getTotalVertices(); v++) if (flags[v * 2]! > 1.5 && flags[v * 2 + 1] === 2) face.push(p[v * 3], p[v * 3 + 1], p[v * 3 + 2], uv[v * 2], uv[v * 2 + 1]);
      expect(face.length).toBeGreaterThan(15000);
      const fingerprint = new Bun.CryptoHasher('sha256').update(JSON.stringify(face)).digest('hex');
      if (faceFingerprint === null) faceFingerprint = fingerprint; else expect(fingerprint).toBe(faceFingerprint);
      silhouettes.add(new Bun.CryptoHasher('sha256').update(JSON.stringify(Array.from(p))).digest('hex'));
    } finally { view.dispose(); }
  }
  expect(silhouettes.size).toBe(7);
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
    let head = 0; for (let v = 0; v < mesh.getTotalVertices(); v++) {
      if (flags[v * 2]! > 1.5) head++;
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
    let arms = 0;
    for (let v = 0; v < mesh.getTotalVertices(); v++) if (flags[v * 2] === 2) {
      if (flags[v * 2 + 1] === 4) { arms++; expect(colors[v * 4 + 3]).toBe(1); }
    }
    expect(arms).toBeGreaterThan(2000);
    expect(mesh.subMeshes).toHaveLength(1); expect(mesh.getTotalIndices() / 3).toBeLessThan(60000);
  } finally { view.dispose(); }
});
