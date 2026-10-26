import { expect, test } from 'bun:test';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Scene } from '@babylonjs/core/scene';
import { colliderHeightAt } from '@frost-and-flamingos/shared';
import { isInkExcluded, isShadowExcluded } from '../src/rendering/materials';
import { buildPavingRelief, pavingContains, PAVING_LOD_DISTANCE, PAVING_MAX_TRIANGLES } from '../src/rendering/map/paving';
import { paintedPavingHeight, PAVING_SOURCE_SHA256, PAVING_TILE_METERS } from '../src/rendering/map/paving-height';

test('paving relief is baked from the unchanged paint and wraps seamlessly with it', async () => {
  const source = Bun.file(new URL('../public/art/tex/cobblestone_color.jpg', import.meta.url));
  expect(new Bun.CryptoHasher('sha256').update(await source.arrayBuffer()).digest('hex')).toBe(PAVING_SOURCE_SHA256);
  const values = new Set<number>();
  for (let row = 0; row < 20; row++) for (let column = 0; column < 20; column++) {
    const x = column * 0.11, z = row * 0.11;
    const height = paintedPavingHeight(x, z);
    values.add(Math.round(height * 100));
    expect(height).toBeGreaterThanOrEqual(0); expect(height).toBeLessThanOrEqual(1);
    expect(paintedPavingHeight(x + PAVING_TILE_METERS, z - PAVING_TILE_METERS)).toBeCloseTo(height, 5);
  }
  expect(values.size).toBeGreaterThan(40);
});

test('painted relief stays shallow, clears spawns, and uses one distance-culled mesh', () => {
  const engine = new NullEngine(); const scene = new Scene(engine);
  try {
    const meshes = buildPavingRelief(scene, new StandardMaterial('paving', scene));
    expect(meshes).toHaveLength(1);
    const mesh = meshes[0]!;
    expect(mesh.getTotalIndices() / 3).toBeLessThan(PAVING_MAX_TRIANGLES);
    expect(mesh.getTotalVertices()).toBeLessThan(125000);
    expect(mesh.getLODLevels()[0]!.distanceOrScreenCoverage).toBe(PAVING_LOD_DISTANCE);
    expect(isShadowExcluded(mesh)).toBe(true); expect(isInkExcluded(mesh)).toBe(true);
    const positions = mesh.getVerticesData('position')!, normals = mesh.getVerticesData('normal')!;
    let minimum = Infinity, maximum = -Infinity;
    // Sample the actual generated mesh (also its boundary), not only its height function.
    for (let index = 0; index < positions.length; index += 3 * 19) {
      const x = positions[index]!, y = positions[index + 1]!, z = positions[index + 2]!;
      expect(pavingContains(x, z)).toBe(true);
      const relief = y - colliderHeightAt(x, z);
      expect(relief).toBeGreaterThan(0); expect(relief).toBeLessThan(0.05);
      minimum = Math.min(minimum, relief); maximum = Math.max(maximum, relief);
    }
    expect(maximum - minimum).toBeGreaterThan(0.02);
    expect(Array.from(normals).every(Number.isFinite)).toBe(true);
    expect(Array.from(normals).filter((_, i) => i % 3 === 1).every(y => y > 0.7)).toBe(true);
  } finally { scene.dispose(); engine.dispose(); }
});
