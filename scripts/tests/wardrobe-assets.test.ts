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
  expect(h!.uvs.some((n, i) => i % 2 === 0 && h!.painted[i / 2] === 0 && n > .01)).toBe(true);
  expect(h!.uvs.every((n, i) => h!.painted[Math.floor(i / 2)] !== 0 || n >= 0 && n <= .18)).toBe(true);
  expect(h!.indices.length / 3).toBeLessThan(8000);
  expect(h!.beard).toBeDefined();
  expect(h!.beard!.indices.length / 3).toBeLessThan(2500);
  const beardEdges = new Map<string, number>();
  for (let f = 0; f < h!.beard!.indices.length; f += 3) for (let k = 0; k < 3; k++) {
    const a = h!.beard!.indices[f + k]!, b = h!.beard!.indices[f + (k + 1) % 3]!;
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    beardEdges.set(key, (beardEdges.get(key) ?? 0) + 1);
  }
  expect([...beardEdges.values()].every(count => count === 2)).toBe(true);
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
  expect((dimensions & 0x3fff) + 1).toBe(256); expect(((dimensions >>> 14) & 0x3fff) + 1).toBe(512);
});


test('shared authored arms retain valid skinning and one content hash across all six classes', async () => {
  const directory = resolve(import.meta.dir, '../../apps/client/public/models');
  const bytes = await Bun.file(resolve(directory, 'soldier-body.json')).arrayBuffer();
  const body = parseBodySurfaces(JSON.parse(new TextDecoder().decode(bytes))); expect(body).not.toBeNull();
  const hash = new Bun.CryptoHasher('sha256').update(bytes).digest('hex');
  const donor = await Bun.file(resolve(directory, 'lagoon-heavy.glb')).arrayBuffer();
  expect(body!.sourceHash).toBe(new Bun.CryptoHasher('sha256').update(donor).digest('hex'));
  expect(body!.regions.filter(r => r === 4).length).toBeGreaterThan(2000);
  expect(body!.indices.length / 3).toBeLessThan(3400);
  expect(body!.solidAnatomy).toBe(true);
  expect(body!.regions.every(r => r === 4)).toBe(true);
  // Bare skin must be watertight and cannot inherit garment weights from the
  // hips, legs or head: those pull shoulder scraps apart in weapon poses.
  const edges = new Map<string, number>();
  for (let f = 0; f < body!.indices.length; f += 3) {
    const face = body!.indices.slice(f, f + 3);
    for (let k = 0; k < 3; k++) {
      const a = face[k]!, b = face[(k + 1) % 3]!, key = a < b ? `${a}:${b}` : `${b}:${a}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }
  expect([...edges.values()].every(count => count === 2)).toBe(true);
  const armJoints = new Set(body!.bones.filter(b => /^(Left|Right)(Arm|ForeArm|Hand)$/.test(b.name)).map(b => b.index));
  expect(body!.joints.every((joint, i) => body!.weights[i]! === 0 || armJoints.has(joint))).toBe(true);

  // The source's bone-majority arm region also contained part of the hand.
  // No copied donor finger may remain beyond the actual wrist plane.
  for (let v = 0; v < body!.positions.length / 3; v++) {
    const at = body!.positions.slice(v * 3, v * 3 + 3), side = at[0]! > 0 ? 'Left' : 'Right';
    const wrist = body!.bones.find(b => b.name === side + 'Hand')!.position;
    const forearm = body!.bones.find(b => b.name === side + 'ForeArm')!.position;
    const shoulder = body!.bones.find(b => b.name === side + 'Arm')!.position;
    expect(Math.abs(at[0]!)).toBeGreaterThanOrEqual(Math.abs(shoulder[0]!) - .04);
    expect(body!.uvs[v * 2]).toBeGreaterThanOrEqual(0);
    expect(body!.uvs[v * 2]).toBeLessThanOrEqual(.09);
    expect(body!.uvs[v * 2 + 1]).toBe(0);
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

test('shared bare hands have closed anatomical fingers and neutral skin creases', async () => {
  const directory = resolve(import.meta.dir, '../../apps/client/public/models');
  const body = parseBodySurfaces(await Bun.file(resolve(directory, 'soldier-body.json')).json())!;
  const hands = body.hands!;
  expect(hands).toBeDefined();
  const donor = await Bun.file(resolve(directory, 'alpine-allrounder.glb')).arrayBuffer();
  expect(hands.sourceHash).toBe(new Bun.CryptoHasher('sha256').update(donor).digest('hex'));
  expect(hands.indices.length / 3).toBeGreaterThan(2000);
  expect(hands.indices.length / 3).toBeLessThanOrEqual(4000);
  expect(hands.regions.every(r => r === 5)).toBe(true);
  const fingers = new Set<number>();
  for (let v = 0; v < hands.positions.length / 3; v++) {
    expect(hands.uvs[v * 2]).toBeGreaterThanOrEqual(0);
    expect(hands.uvs[v * 2]).toBeLessThanOrEqual(.12);
    expect(hands.uvs[v * 2 + 1]).toBe(0);
    const at = hands.positions.slice(v * 3, v * 3 + 3), side = at[0]! > 0 ? 'Left' : 'Right';
    const wrist = hands.bones.find(b => b.name === side + 'Hand')!.position;
    const forearm = hands.bones.find(b => b.name === side + 'ForeArm')!.position;
    const axis = wrist.map((n, k) => n - forearm[k]!), length = Math.hypot(...axis);
    expect(at.reduce((sum, n, k) => sum + (n - wrist[k]!) * axis[k]! / length, 0)).toBeGreaterThanOrEqual(-.04);
    for (let k = 0; k < 4; k++) if (hands.weights[v * 4 + k]! > .1) fingers.add(hands.joints[v * 4 + k]!);
  }
  expect(hands.bones.filter(b => /Hand(Thumb|Index|Middle|Ring|Pinky)[123]$/.test(b.name) && fingers.has(b.index)).length).toBeGreaterThan(15);
  const edges = new Map<string, number>();
  for (let f = 0; f < hands.indices.length; f += 3) for (let k = 0; k < 3; k++) {
    const a = hands.indices[f + k]!, b = hands.indices[f + (k + 1) % 3]!;
    const key = `${Math.min(a, b)}:${Math.max(a, b)}`;
    edges.set(key, (edges.get(key) ?? 0) + 1);
  }
  expect([...edges.values()].every(count => count === 2)).toBe(true);
  expect(parseBodySurfaces({ ...body, hands: { ...hands, hands } })).toBeNull();
  expect(parseBodySurfaces({ ...body, hands: { ...hands, weights: hands.weights.map(() => 0) } })).toBeNull();
  expect(parseBodySurfaces({ ...body, hands: { ...hands, regions: hands.regions.map(() => 4) } })).toBeNull();
});
