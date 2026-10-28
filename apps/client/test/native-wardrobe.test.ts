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

function build(changes: Partial<Cosmetics> = {}): { view: GlbCharacterView; mesh: Mesh } {
  const profile = createDefaultProfile('Native wardrobe'); Object.assign(profile.cosmetics, changes);
  const view = new GlbCharacterView(scene, new StandardMaterial('native-shadow', scene), profile, asset, textures);
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
      expect(uniforms.colors3.uWardrobeSkin).toEqual(channels(hex));
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
