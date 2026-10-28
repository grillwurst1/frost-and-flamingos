import { expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { parseWardrobeHead } from '../../apps/client/src/rendering/glb/wardrobe-head';
import { parseNativeWardrobe } from '../../apps/client/src/rendering/glb/native-wardrobe';

test('every derived soldier wardrobe matches its original GLB and has a bounded 1024 paint mask', async () => {
  const directory = resolve(import.meta.dir, '../../apps/client/public/models');
  const manifest = await Bun.file(resolve(directory, 'manifest.json')).json() as { models: Record<string, { file: string; wardrobe?: string; wardrobeRevision?: string; textures: Record<string, string> }> };
  for (const faction of ['alpine', 'lagoon']) for (const role of ['allrounder', 'heavy', 'infiltrator']) {
    const key = `${faction}-${role}`, entry = manifest.models[key]!;
    expect(entry.wardrobe).toBeDefined(); expect(entry.wardrobeRevision).toMatch(/^[a-f0-9]{64}$/); expect(entry.textures.wardrobeMask).toBeDefined();
    const metadata = await Bun.file(resolve(directory, entry.wardrobe!)).json() as { vertexCount: number; indexCount: number; sourceHash: string };
    const valid = parseNativeWardrobe(metadata, metadata.vertexCount, metadata.indexCount); expect(valid).not.toBeNull();
    const hash = new Bun.CryptoHasher('sha256').update(await Bun.file(resolve(directory, entry.file)).arrayBuffer()).digest('hex');
    expect(metadata.sourceHash).toBe(hash);
    const bytes = new Uint8Array(await Bun.file(resolve(directory, entry.textures.wardrobeMask!)).arrayBuffer());
    expect(new TextDecoder().decode(bytes.subarray(12, 16))).toBe('VP8L');
    const dimensions = new DataView(bytes.buffer).getUint32(21, true);
    expect((dimensions & 0x3fff) + 1).toBe(1024); expect(((dimensions >>> 14) & 0x3fff) + 1).toBe(1024);
    expect(bytes.byteLength).toBeLessThan(500000);
  }
});


test('the shared closed head and curls match their original sources and every class references the same bounded pair', async () => {
  const directory = resolve(import.meta.dir, '../../apps/client/public/models');
  const file = Bun.file(resolve(directory, 'soldier-head.json')), bytes = await file.arrayBuffer();
  const h = parseWardrobeHead(JSON.parse(new TextDecoder().decode(bytes))); expect(h).not.toBeNull();
  const hash = new Bun.CryptoHasher('sha256').update(bytes).digest('hex');
  const sourceHash = async (key: string) => new Bun.CryptoHasher('sha256').update(await Bun.file(resolve(directory, key + '.glb')).arrayBuffer()).digest('hex');
  expect(h!.sourceHash).toBe(await sourceHash('alpine-infiltrator'));
  expect(h!.afro?.sourceHash).toBe(await sourceHash('lagoon-allrounder'));
  expect(h!.afro!.indices.length).toBeGreaterThan(9000);
  expect(bytes.byteLength).toBeLessThan(2000000);
  for (let v = 0; v < h!.normals.length; v += 3) expect(Math.hypot(...h!.normals.slice(v, v + 3))).toBeGreaterThan(.8);
  const manifest = await Bun.file(resolve(directory, 'manifest.json')).json();
  const revisions = new Set<string>();
  for (const faction of ['alpine', 'lagoon']) for (const role of ['allrounder', 'heavy', 'infiltrator']) {
    const entry = manifest.models[`${faction}-${role}`]; revisions.add(entry.wardrobeRevision);
    expect(entry.wardrobeRevision).toMatch(/^[a-f0-9]{64}$/);
    const metadata = await Bun.file(resolve(directory, entry.wardrobe)).json();
    expect(metadata.headHash).toBe(hash);
    expect(entry.textures.headPaint).toBe('soldier-head-basecolor.webp'); expect(entry.textures.headMask).toBe('soldier-head-mask.webp');
  }
  expect(revisions.size).toBe(1);
  const mask = new Uint8Array(await Bun.file(resolve(directory, 'soldier-head-mask.webp')).arrayBuffer());
  expect(new TextDecoder().decode(mask.subarray(12, 16))).toBe('VP8L');
  const dimensions = new DataView(mask.buffer).getUint32(21, true);
  expect((dimensions & 0x3fff) + 1).toBe(512); expect(((dimensions >>> 14) & 0x3fff) + 1).toBe(1024);
});
