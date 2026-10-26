import { expect, test } from 'bun:test';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Scene } from '@babylonjs/core/scene';
import { FJORD_MAP, PAVILION, colliderHeightAt } from '@frost-and-flamingos/shared';
import { isInkExcluded, isShadowExcluded } from '../src/rendering/materials';
import { buildPavingRelief, plazaPavingStones, PAVING_LOD_DISTANCE, PAVING_MAX_INSTANCES } from '../src/rendering/map/paving';

test('raised paving stays shallow and leaves spawn pads and fountain clear', () => {
  const stones = plazaPavingStones();
  expect(stones.length).toBeGreaterThan(2000);
  expect(stones.length).toBeLessThanOrEqual(PAVING_MAX_INSTANCES);
  const pads = FJORD_MAP.spawns.filter(p => Math.hypot(p.position.x, p.position.z) < 30);
  for (const stone of stones) {
    expect(Math.hypot(stone.x, stone.z)).toBeGreaterThanOrEqual(PAVILION.basinRadius + 1.2);
    expect(pads.every(p => Math.hypot(p.position.x - stone.x, p.position.z - stone.z) >= 2.3)).toBe(true);
    const top = stone.y + stone.scale * 0.035;
    expect(top - colliderHeightAt(stone.x, stone.z)).toBeLessThan(0.05);
  }
});

test('thousands of bevelled stones share four tiny stone meshes and are distance culled', () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  try {
    const meshes = buildPavingRelief(scene, new StandardMaterial('paving', scene));
    expect(meshes).toHaveLength(5);
    const stones = meshes.filter(m => m.hasThinInstances);
    expect(stones).toHaveLength(4);
    expect(stones.reduce((n, m) => n + m.thinInstanceCount, 0)).toBe(plazaPavingStones().length);
    expect(stones.reduce((n, m) => n + m.getTotalVertices(), 0)).toBeLessThan(200);
    expect(meshes.reduce((n, m) => n + m.getTotalIndices() / 3 * Math.max(1, m.thinInstanceCount), 0)).toBeLessThan(80000);
    for (const mesh of meshes) {
      expect(mesh.getLODLevels()[0]!.distanceOrScreenCoverage).toBe(PAVING_LOD_DISTANCE);
      expect(isShadowExcluded(mesh)).toBe(true);
      expect(isInkExcluded(mesh)).toBe(true);
      const normals = mesh.getVerticesData('normal')!;
      expect(Array.from(normals).every(Number.isFinite)).toBe(true);
      if (mesh.hasThinInstances) expect(Array.from(normals).filter((_, i) => i % 3 === 1).some(y => y > 0.1 && y < 0.95)).toBe(true);
    }
  } finally { scene.dispose(); engine.dispose(); }
});
