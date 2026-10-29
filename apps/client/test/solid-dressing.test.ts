import { expect, test } from 'bun:test';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { SolidDressing, DRESSING_VERTEX_BUDGET } from '../src/rendering/map/solid-dressing';
import type { SpriteEntry } from '../src/rendering/sprite-atlas';

const entry = (id: string, tags: string[]): SpriteEntry => ({ id, tags: new Set(tags), rect: [0, 0, 1, 1], height: 1,
  aspect: 1.4, pivotU: .5, pivotV: 0, sway: 0, shadow: .3, ground: false, size: 1 });

test('snowdrifts and stones have real depth and opaque world materials instead of camera-facing planes', () => {
  const engine = new NullEngine(), scene = new Scene(engine);
  try {
    const dressing = new SolidDressing(), material = new StandardMaterial('opaque-world', scene);
    expect(dressing.add(entry('snowdrift', ['cover', 'snow']), 0, 0, 0, 2)).toBe(true);
    expect(dressing.add(entry('boulder', ['rock', 'snow']), 20, 0, 0, 2)).toBe(true);
    expect(dressing.add(entry('grass-tuft', ['cover']), 0, 0, 0, .3)).toBe(false);
    const { meshes } = dressing.build(scene, material);
    expect(meshes).toHaveLength(1);
    const mesh = meshes[0]!, positions = mesh.getVerticesData('position')!;
    expect(mesh.material).toBe(material); expect(mesh.billboardMode).toBe(0);
    const z = Array.from(positions).filter((_, i) => i % 3 === 2);
    expect(Math.max(...z) - Math.min(...z)).toBeGreaterThan(.5);
    const y = Array.from(positions).filter((_, i) => i % 3 === 1);
    expect(Math.max(...y)).toBeLessThan(.6);
  } finally { scene.dispose(); engine.dispose(); }
});

test('dense solid dressing stays under its global geometry ceiling', () => {
  const engine = new NullEngine(), scene = new Scene(engine);
  try {
    const dressing = new SolidDressing(), stone = entry('rock', ['rock']);
    for (let i = 0; i < 5000; i++) dressing.add(stone, i * 101, 0, (i % 17) * 101, 1);
    const result = dressing.build(scene, new StandardMaterial('world', scene));
    expect(result.vertices).toBeGreaterThan(1000);
    expect(result.vertices).toBeLessThanOrEqual(DRESSING_VERTEX_BUDGET);
    expect(result.meshes.reduce((sum, m) => sum + m.getTotalVertices(), 0)).toBe(result.vertices);
  } finally { scene.dispose(); engine.dispose(); }
});
