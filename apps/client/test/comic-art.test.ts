import { expect, test } from 'bun:test';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { createDefaultProfile } from '@frost-and-flamingos/shared';
import { CharacterView } from '../src/rendering/character';
import { GeometryBatch } from '../src/rendering/map/geometry';
import { drawFir } from '../src/rendering/map/nature';

test('drawn outfit materials survive merging and never cover the configurable skin', () => {
  const scene = new Scene(new NullEngine()), profile = createDefaultProfile('Ranger');
  profile.cosmetics.torso = 'torso_tracht_shirt'; profile.cosmetics.legs = 'legs_lederhosen';
  profile.cosmetics.feet = 'feet_ski_boots'; profile.cosmetics.headgear = 'head_tirol';
  const view = new CharacterView(scene, new StandardMaterial('shadow', scene), profile);
  try {
    const kinds = new Set<number>(); let skinVertices = 0;
    for (const mesh of view.root.getChildMeshes()) {
      const paint = mesh.getVerticesData('uv3'), colors = mesh.getVerticesData('color');
      if (!paint || !colors) continue;
      expect(paint.length).toBe(mesh.getTotalVertices() * 2);
      for (let v = 0; v < mesh.getTotalVertices(); v++) {
        expect(Number.isFinite(paint[v * 2])).toBe(true); kinds.add(paint[v * 2]!);
        if (colors[v * 4 + 3]! > .5) { expect(paint[v * 2]).toBe(0); skinVertices++; }
      }
    }
    expect(skinVertices).toBeGreaterThan(100);
    for (const kind of [3, 4, 5, 6]) expect(kinds.has(kind)).toBe(true);
  } finally { view.dispose(); scene.dispose(); }
});

test('snowy fir boughs stay within a fixed geometric budget at both detail levels', () => {
  for (const far of [false, true]) {
    const batch = new GeometryBatch();
    drawFir(batch, 1, 0, 1, 37, far, true);
    expect(batch.indices.length / 3).toBeLessThanOrEqual(far ? 320 : 1700);
    expect(batch.positions.every(Number.isFinite)).toBe(true);
    expect(batch.normals.every(Number.isFinite)).toBe(true);
    expect(Math.max(...batch.positions.filter((_, i) => i % 3 === 1))).toBeGreaterThan(8);
    expect(Math.max(...batch.positions.filter((_, i) => i % 3 === 0))).toBeGreaterThan(2);
  }
});
