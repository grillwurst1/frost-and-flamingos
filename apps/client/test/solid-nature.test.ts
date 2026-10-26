import { expect, test } from 'bun:test';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Scene } from '@babylonjs/core/scene';
import { FJORD_MAP } from '@frost-and-flamingos/shared';
import { buildSolidNature, NATURE_LOD_DISTANCE } from '../src/rendering/map/solid-nature';

test('solid trees and rocks have bounded geometry and simpler solid distance models', () => {
  const engine = new NullEngine(); const scene = new Scene(engine);
  try {
    const layer = buildSolidNature(scene, new StandardMaterial('nature', scene), FJORD_MAP.props);
    const near = layer.meshes.filter(m => m.name.startsWith('nature-solid-'));
    const far = layer.meshes.filter(m => m.name.startsWith('nature-far-'));
    const triangles = (meshes: typeof near) => meshes.reduce((n, m) => n + m.getTotalIndices() / 3, 0);
    console.log('solid nature budget', { meshes: near.length, near: triangles(near), far: triangles(far) });
    expect(near.length).toBeLessThan(125);
    expect(far.length).toBe(near.length);
    expect(triangles(near)).toBeLessThan(600000);
    expect(triangles(far)).toBeLessThan(triangles(near) * 0.55);
    for (const mesh of near) {
      expect(mesh.getLODLevels()[0]!.distanceOrScreenCoverage).toBe(NATURE_LOD_DISTANCE);
      const p = mesh.getVerticesData('position')!;
      const xs = Array.from(p).filter((_, i) => i % 3 === 0);
      const zs = Array.from(p).filter((_, i) => i % 3 === 2);
      expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0.1);
      expect(Math.max(...zs) - Math.min(...zs)).toBeGreaterThan(0.1);
    }
    for (const tree of FJORD_MAP.destructibles.trees) expect(layer.destructible.has(tree.id)).toBe(true);
  } finally { scene.dispose(); engine.dispose(); }
});
