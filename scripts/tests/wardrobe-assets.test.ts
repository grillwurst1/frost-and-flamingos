import { expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { parseBodySurfaces } from '../../apps/client/src/rendering/glb/body-surfaces';
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
  expect(h!.solidAnatomy).toBe(true);
  expect(h!.painted.filter(kind => kind === 0).length).toBeGreaterThan(3000);
  expect(h!.painted.includes(1)).toBe(false);
  expect(h!.painted.includes(3)).toBe(true);
  expect(h!.indices.length / 3).toBeLessThan(8000);
  expect(h!.afro!.uvs.every(n => n >= 0 && n <= 1)).toBe(true);
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
  expect((dimensions & 0x3fff) + 1).toBe(512); expect(((dimensions >>> 14) & 0x3fff) + 1).toBe(512);
});


test('shared authored arms retain valid skinning and one content hash across all six classes', async () => {
  const directory = resolve(import.meta.dir, '../../apps/client/public/models');
  const bytes = await Bun.file(resolve(directory, 'soldier-body.json')).arrayBuffer();
  const body = parseBodySurfaces(JSON.parse(new TextDecoder().decode(bytes))); expect(body).not.toBeNull();
  const hash = new Bun.CryptoHasher('sha256').update(bytes).digest('hex');
  const donor = await Bun.file(resolve(directory, 'lagoon-heavy.glb')).arrayBuffer();
  expect(body!.sourceHash).toBe(new Bun.CryptoHasher('sha256').update(donor).digest('hex'));
  expect(body!.regions.filter(r => r === 4).length).toBeGreaterThan(3000);
  expect(body!.regions.every(r => r === 4)).toBe(true);
  // The source's bone-majority arm region also contained part of the hand.
  // No copied donor finger may remain beyond the actual wrist plane.
  for (let v = 0; v < body!.positions.length / 3; v++) {
    const at = body!.positions.slice(v * 3, v * 3 + 3), side = at[0]! > 0 ? 'Left' : 'Right';
    const wrist = body!.bones.find(b => b.name === side + 'Hand')!.position;
    const forearm = body!.bones.find(b => b.name === side + 'ForeArm')!.position;
    const axis = wrist.map((n, k) => n - forearm[k]!), length = Math.hypot(...axis);
    const projection = at.reduce((sum, n, k) => sum + (n - wrist[k]!) * axis[k]! / length, 0);
    expect(projection).toBeLessThanOrEqual(.004001);
  }
  for (const side of ['Left', 'Right']) {
    const wrist = body!.bones.find(b => b.name === side + 'Hand')!.position;
    const forearm = body!.bones.find(b => b.name === side + 'ForeArm')!.position;
    const axis = wrist.map((n, k) => n - forearm[k]!), length = Math.hypot(...axis);
    let caps = 0;
    for (let f = 0; f < body!.indices.length; f += 3) {
      const points = body!.indices.slice(f, f + 3).map(v => body!.positions.slice(v * 3, v * 3 + 3));
      if (!points.every(at => (at[0]! > 0) === (side === 'Left') && Math.abs(
        at.reduce((sum, n, k) => sum + (n - wrist[k]!) * axis[k]! / length, 0) - .004) < 1e-6)) continue;
      const ab = points[1]!.map((n, k) => n - points[0]![k]!), ac = points[2]!.map((n, k) => n - points[0]![k]!);
      const normal = [ab[1]! * ac[2]! - ab[2]! * ac[1]!, ab[2]! * ac[0]! - ab[0]! * ac[2]!, ab[0]! * ac[1]! - ab[1]! * ac[0]!];
      if (Math.hypot(...normal) < 1e-10) continue;
      expect(normal.reduce((sum, n, k) => sum + n * axis[k]!, 0)).toBeGreaterThan(0);
      caps++;
    }
    expect(caps).toBeGreaterThan(6);
  }
  expect(bytes.byteLength).toBeLessThan(1500000);
  const manifest = await Bun.file(resolve(directory, 'manifest.json')).json();
  for (const faction of ['alpine', 'lagoon']) for (const role of ['allrounder', 'heavy', 'infiltrator']) {
    const entry = manifest.models[`${faction}-${role}`];
    expect((await Bun.file(resolve(directory, entry.wardrobe)).json()).bodyHash).toBe(hash);
  }
  expect(parseBodySurfaces({ ...body, weights: body!.weights.map(() => 0) })).toBeNull();
});
