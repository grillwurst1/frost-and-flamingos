import { expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { parseNativeWardrobe } from '../../apps/client/src/rendering/glb/native-wardrobe';

test('every derived soldier wardrobe matches its original GLB and has a bounded 1024 paint mask', async () => {
  const directory = resolve(import.meta.dir, '../../apps/client/public/models');
  const manifest = await Bun.file(resolve(directory, 'manifest.json')).json() as { models: Record<string, { file: string; wardrobe?: string; textures: Record<string, string> }> };
  for (const faction of ['alpine', 'lagoon']) for (const role of ['allrounder', 'heavy', 'infiltrator']) {
    const key = `${faction}-${role}`, entry = manifest.models[key]!;
    expect(entry.wardrobe).toBeDefined(); expect(entry.textures.wardrobeMask).toBeDefined();
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
