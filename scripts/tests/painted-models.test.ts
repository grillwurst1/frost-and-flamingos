/**
 * Package 3C checks for the painted-model pipeline and its binary format:
 *
 *   bun test scripts/tests
 *
 * Runs headless in Bun (Babylon NullEngine where needed) against the
 * committed outputs in apps/client/public/models.
 */
import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DEFAULT_CLIPS, PAINTED_MODELS, RETARGET_ROLES } from '../../apps/client/src/rendering/glb/catalog';
import { BAKE_FPS, type BakedClip } from '../../apps/client/src/rendering/glb/clips';
import {
  bakedClipName,
  parseBakedClipName,
  readBakedClips,
  readGlb,
  writeBakedAnimations,
  writeGlb,
} from '../../apps/client/src/rendering/glb/glb-binary';

const MODELS = resolve(import.meta.dir, '..', '..', 'apps', 'client', 'public', 'models');

async function glb(file: string): Promise<ReturnType<typeof readGlb>> {
  return readGlb(new Uint8Array(await Bun.file(join(MODELS, file)).arrayBuffer()));
}

describe('baked clip names', () => {
  test('round-trip role and donor', () => {
    expect(parseBakedClipName(bakedClipName('sprint', 'lagoon-heavy'))).toEqual({ role: 'sprint', donor: 'lagoon-heavy' });
    expect(parseBakedClipName(bakedClipName('idle', null))).toEqual({ role: 'idle', donor: null });
    expect(parseBakedClipName('Running')).toBeNull();
    expect(parseBakedClipName('ff:walk@Bad Name')).toBeNull();
  });
});

describe('baked animation write/read', () => {
  test('a written clip reads back within int16 precision', async () => {
    const parts = await glb('alpine-allrounder.glb');
    const original = readBakedClips(parts).get('walk');
    expect(original).toBeDefined();
    if (!original) return;
    // Re-written as a retargeted clip, so the donor suffix is exercised too.
    const clip: BakedClip = { ...original, rotations: original.rotations.slice(), retargetedFrom: 'lagoon-heavy' };
    writeBakedAnimations(parts, [{ role: 'walk', clip }]);
    const back = readBakedClips(readGlb(writeGlb(parts))).get('walk');
    expect(back).toBeDefined();
    if (!back) return;
    expect(back.frames).toBe(clip.frames);
    expect(back.retargetedFrom).toBe('lagoon-heavy');
    expect(back.bones).toEqual(clip.bones);
    let worst = 0;
    for (let i = 0; i < clip.rotations.length; i += 1) worst = Math.max(worst, Math.abs((clip.rotations[i] ?? 0) - (back.rotations[i] ?? 0)));
    expect(worst).toBeLessThan(2 / 32767);
    expect(back.duration).toBeCloseTo((clip.frames - 1) / BAKE_FPS, 5);
  });
});

describe('shipped painted models', () => {
  const manifest = JSON.parse(require('node:fs').readFileSync(join(MODELS, 'manifest.json'), 'utf8')) as {
    models: Record<string, { file: string; textures: Record<string, string> }>;
  };

  test('the manifest only lists files that exist (no 404s)', () => {
    for (const entry of Object.values(manifest.models)) {
      expect(existsSync(join(MODELS, entry.file))).toBe(true);
      for (const file of Object.values(entry.textures)) expect(existsSync(join(MODELS, file))).toBe(true);
    }
  });

  for (const spec of Object.values(PAINTED_MODELS)) {
    test(`${spec.key} is self-contained with its full role set`, async () => {
      expect(manifest.models[spec.key]?.file).toBe(spec.file);
      const clips = readBakedClips(await glb(spec.file));
      // Every native role plus every retargetable role is baked in.
      for (const role of RETARGET_ROLES) expect(clips.has(role)).toBe(true);
      for (const role of ['walk', 'run'] as const) expect(clips.get(role)?.retargetedFrom ?? null).toBeNull();
      for (const [role, clip] of clips) {
        expect(Object.keys(DEFAULT_CLIPS)).toContain(role);
        expect(clip.frames).toBeGreaterThan(1);
        expect(clip.bones.length).toBeGreaterThan(20);
        expect(Number.isFinite(clip.rotations[0] ?? NaN)).toBe(true);
        if (clip.retargetedFrom) expect(Object.keys(PAINTED_MODELS)).toContain(clip.retargetedFrom);
      }
      // Only baked animations remain (the unused Meshy clips are dropped).
      const parts = await glb(spec.file);
      for (const animation of parts.json.animations ?? []) expect(parseBakedClipName(animation.name ?? '')).not.toBeNull();
    });
  }

  test('drifter models keep only their own clips', async () => {
    for (const [key, roles] of [
      ['alpine-ghostgirl', ['walk', 'backpedal', 'taunt', 'emote']],
      ['lagoon-beachgirl', ['idle', 'walk', 'backpedal', 'taunt']],
    ] as const) {
      const clips = readBakedClips(await glb(`${key}.glb`));
      expect([...clips.keys()].sort()).toEqual([...roles].sort());
      for (const clip of clips.values()) expect(clip.retargetedFrom).toBeNull();
    }
  });
});
