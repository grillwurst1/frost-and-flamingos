/** Derive wardrobe regions/masks from the owner's unchanged, optimised meshes. */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { NullEngine } from '../apps/client/node_modules/@babylonjs/core/Engines/nullEngine';
import { Scene } from '../apps/client/node_modules/@babylonjs/core/scene';
import { paintedModelLibrary, jointName } from '../apps/client/src/rendering/glb/library';

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
  const manifest = await Bun.file(manifestPath).json() as { models: Record<string, { textures: Record<string, string>; wardrobe?: string }> };
  for (const faction of ['alpine', 'lagoon']) for (const role of ['allrounder', 'heavy', 'infiltrator']) {
    const key = `${faction}-${role}`, asset = await paintedModelLibrary(scene).load(key);
    if (!asset) throw new Error(`Cannot derive wardrobe for ${key}`);
    const mesh = asset.container.meshes.find(m => m.skeleton)!;
    const data = { key, head: asset.spec.head, hatSplit: asset.hatSplit, height: asset.height,
      bind: Object.fromEntries([...asset.bindPositions].map(([k, v]) => [k, v.asArray()])),
      bones: mesh.skeleton!.bones.map(b => ({ name: jointName(b.name), index: b.getIndex(), parent: asset.jointParents.get(jointName(b.name)) ?? null })),
      positions: Array.from(mesh.getVerticesData('position')!), uv: Array.from(mesh.getVerticesData('uv')!),
      joints: Array.from(mesh.getVerticesData('matricesIndices')!), weights: Array.from(mesh.getVerticesData('matricesWeights')!), indices: Array.from(mesh.getIndices()!) };
    const input = join(temporary, `${key}.json`); await Bun.write(input, JSON.stringify(data));
    const bake = Bun.spawn(['python3', join(root, 'scripts/bake-soldier-wardrobe.py'), input, output], { stdout: 'inherit', stderr: 'inherit' });
    if (await bake.exited !== 0) throw new Error(`Wardrobe mask bake failed: ${key}`);
    const entry = manifest.models[key]; if (!entry) throw new Error(`Missing manifest model: ${key}`);
    entry.wardrobe = `${key}-wardrobe.json`;
    entry.textures.wardrobeMask = `${key}-wardrobe-mask.webp`;
  }
  await Bun.write(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
} finally { globalThis.fetch = originalFetch; scene.dispose(); engine.dispose(); rmSync(temporary, { recursive: true, force: true }); }
