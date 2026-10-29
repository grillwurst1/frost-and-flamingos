/** Derive wardrobe regions/masks from the owner's unchanged, optimised meshes. */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { NullEngine } from '../apps/client/node_modules/@babylonjs/core/Engines/nullEngine';
import { Scene } from '../apps/client/node_modules/@babylonjs/core/scene';
import { paintedModelLibrary, jointName, bindWorldTransform } from '../apps/client/src/rendering/glb/library';

const root = resolve(import.meta.dir, '..'), output = join(root, 'apps/client/public/models');
const originalFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL) => {
  const name = String(input).split('/').pop()!;
  const file = Bun.file(join(output, name));
  return new Response(await file.arrayBuffer(), { headers: { 'content-type': name.endsWith('.json') ? 'application/json' : 'model/gltf-binary' } });
}) as typeof fetch;
const engine = new NullEngine(), scene = new Scene(engine), temporary = mkdtempSync(join(tmpdir(), 'ff-wardrobe-'));
try {
  const manifestPath = join(output, 'manifest.json');
  const manifest = await Bun.file(manifestPath).json() as { models: Record<string, { textures: Record<string, string>; wardrobe?: string; wardrobeRevision?: string }> };
  for (const faction of ['alpine', 'lagoon']) for (const role of ['allrounder', 'heavy', 'infiltrator']) {
    const key = `${faction}-${role}`, asset = await paintedModelLibrary(scene).load(key);
    if (!asset) throw new Error(`Cannot derive wardrobe for ${key}`);
    const mesh = asset.container.meshes.find(m => m.skeleton)!;
    const data = { key, head: asset.spec.head, hatSplit: asset.hatSplit, height: asset.height,
      bind: Object.fromEntries([...asset.bindPositions].map(([k, v]) => [k, v.asArray()])),
      rig: Object.fromEntries([...asset.bindPositions.keys()].flatMap(name => { const transform = bindWorldTransform(asset, name); return transform ? [[name, { position: transform.position.asArray(), rotation: transform.rotation.asArray() }]] : []; })),
      bones: mesh.skeleton!.bones.map(b => ({ name: jointName(b.name), index: b.getIndex(), parent: asset.jointParents.get(jointName(b.name)) ?? null })),
      positions: Array.from(mesh.getVerticesData('position')!), normals: Array.from(mesh.getVerticesData('normal')!), uv: Array.from(mesh.getVerticesData('uv')!),
      joints: Array.from(mesh.getVerticesData('matricesIndices')!), weights: Array.from(mesh.getVerticesData('matricesWeights')!), indices: Array.from(mesh.getIndices()!) };
    const input = join(temporary, `${key}.json`); await Bun.write(input, JSON.stringify(data));
    const bake = Bun.spawn(['python3', join(root, 'scripts/bake-soldier-wardrobe.py'), input, output], { stdout: 'inherit', stderr: 'inherit' });
    if (await bake.exited !== 0) throw new Error(`Wardrobe mask bake failed: ${key}`);
    if (key === 'alpine-allrounder') {
      const hands = Bun.spawn(['blender', '--background', '--factory-startup', '--threads', '2', '--python', join(root, 'scripts/bake-soldier-hands.py'), '--', input, output, join(temporary, 'soldier-hands.json')], { stdout: 'inherit', stderr: 'inherit' });
      if (await hands.exited !== 0) throw new Error('Anatomical hand bake failed');
    }
    if (key === 'alpine-infiltrator') {
      const head = Bun.spawn(['python3', join(root, 'scripts/bake-soldier-head.py'), input, output], { stdout: 'inherit', stderr: 'inherit' });
      if (await head.exited !== 0) throw new Error('Soldier head bake failed');
    }
    if (key === 'lagoon-allrounder') {
      const hair = Bun.spawn(['python3', join(root, 'scripts/bake-soldier-afro.py'), input, output], { stdout: 'inherit', stderr: 'inherit' });
      if (await hair.exited !== 0) throw new Error('Authored afro bake failed');
    }
    if (key === 'lagoon-heavy') {
      const body = Bun.spawn(['python3', join(root, 'scripts/bake-soldier-body.py'), input, output, join(temporary, 'soldier-hands.json')], { stdout: 'inherit', stderr: 'inherit' });
      if (await body.exited !== 0) throw new Error('Anatomical surface bake failed');
    }
    const entry = manifest.models[key]; if (!entry) throw new Error(`Missing manifest model: ${key}`);
    entry.wardrobe = `${key}-wardrobe.json`;
    entry.textures.wardrobeMask = `${key}-wardrobe-mask.webp`;
  }
  const headHash = new Bun.CryptoHasher('sha256').update(await Bun.file(join(output, 'soldier-head.json')).arrayBuffer()).digest('hex');
  const bodyHash = new Bun.CryptoHasher('sha256').update(await Bun.file(join(output, 'soldier-body.json')).arrayBuffer()).digest('hex');
  for (const faction of ['alpine', 'lagoon']) for (const role of ['allrounder', 'heavy', 'infiltrator']) {
    const key = `${faction}-${role}`, path = join(output, `${key}-wardrobe.json`);
    const metadata = await Bun.file(path).json(); metadata.headHash = headHash; metadata.bodyHash = bodyHash;
    await Bun.write(path, JSON.stringify(metadata));
    manifest.models[key]!.textures.headPaint = 'soldier-head-basecolor.webp';
    manifest.models[key]!.textures.headMask = 'soldier-head-mask.webp';
  }
  // Stable cache keys for the complete skin/outfit set. Geometry JSON is
  // revalidated; texture URLs change only when actual generated content changes.
  const versioned = new Set(['soldier-body.json', 'soldier-head.json', 'soldier-head-basecolor.webp', 'soldier-head-mask.webp']);
  const keys = ['alpine', 'lagoon'].flatMap(faction => ['allrounder', 'heavy', 'infiltrator'].map(role => `${faction}-${role}`));
  for (const key of keys) {
    const entry = manifest.models[key]!; versioned.add(entry.wardrobe!);
    versioned.add(entry.textures.basecolor!); versioned.add(entry.textures.wardrobeMask!);
  }
  const revision = new Bun.CryptoHasher('sha256');
  for (const file of [...versioned].sort()) {
    const bytes = await Bun.file(join(output, file)).arrayBuffer();
    revision.update(`${file}:${bytes.byteLength}:`); revision.update(bytes);
  }
  const digest = revision.digest('hex');
  for (const key of keys) manifest.models[key]!.wardrobeRevision = digest;
  await Bun.write(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
} finally { globalThis.fetch = originalFetch; scene.dispose(); engine.dispose(); rmSync(temporary, { recursive: true, force: true }); }
