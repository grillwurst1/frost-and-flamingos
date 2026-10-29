import { expect, test } from 'bun:test';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { createContactShadow } from '../src/rendering/contact-shadow';
import { createShadowMaterial, isInkExcluded, isShadowExcluded } from '../src/rendering/materials';

test('contact shadows fade to zero at the edge in one bounded mesh without allocating a texture', () => {
  const engine = new NullEngine(), scene = new Scene(engine);
  try {
    const material = createShadowMaterial(scene, 'soft-contact');
    const mesh = createContactShadow(scene, 'feet-contact', .55); mesh.material = material;
    expect(mesh.hasVertexAlpha).toBe(true); expect(mesh.useVertexColors).toBe(true);
    expect(isInkExcluded(mesh)).toBe(true); expect(isShadowExcluded(mesh)).toBe(true);
    expect(mesh.isPickable).toBe(false); expect(mesh.getTotalVertices()).toBeLessThan(100);
    expect(mesh.subMeshes).toHaveLength(1); expect(scene.textures).toHaveLength(0);
    const p = mesh.getVerticesData('position')!, c = mesh.getVerticesData('color')!;
    const samples = Array.from({ length: mesh.getTotalVertices() }, (_, v) => ({
      radius: Math.hypot(p[v * 3]!, p[v * 3 + 1]!), alpha: c[v * 4 + 3]!,
    })).sort((a, b) => a.radius - b.radius);
    expect(samples[0]!.alpha).toBe(1); expect(samples.at(-1)!.alpha).toBe(0);
    expect(new Set(samples.map(p => p.alpha)).size).toBeGreaterThan(2);
    for (let i = 1; i < samples.length; i++) if (samples[i]!.radius - samples[i - 1]!.radius > .001)
      expect(samples[i]!.alpha).toBeLessThanOrEqual(samples[i - 1]!.alpha);
  } finally { scene.dispose(); engine.dispose(); }
});
