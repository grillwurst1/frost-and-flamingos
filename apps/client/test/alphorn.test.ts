import { expect, test } from 'bun:test';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { buildHeroWeapon } from '../src/rendering/weapons/hero-weapon';

test('the alphorn is a full-length smooth instrument with a mouthpiece and a bounded, reused breath effect', () => {
  const engine = new NullEngine(), scene = new Scene(engine);
  const weapon = buildHeroWeapon(scene, 'horn', new StandardMaterial('horn-test', scene), { origin: 'grip' })!;
  try {
    const b = weapon.mesh.getBoundingInfo().boundingBox;
    expect(b.maximum.y - b.minimum.y).toBeGreaterThan(3.3);
    expect(b.maximum.y - b.minimum.y).toBeLessThan(3.7);
    expect(weapon.mesh.getTotalIndices() / 3).toBeLessThan(2500);
    expect(weapon.mesh.subMeshes).toHaveLength(1);
    expect(weapon.pose.mouthpiece?.y).toBeCloseTo(-.12);
    const count = scene.meshes.length, baseTilt = weapon.pose.tilt;
    weapon.fire();
    let breath = 0;
    for (let f = 0; f < 120; f++) {
      weapon.animate(1 / 60, { falling: false, preview: false });
      breath = Math.max(breath, Math.abs(weapon.pose.tilt - baseTilt));
      expect(scene.meshes.length).toBe(count);
      expect(Number.isFinite(weapon.pose.tilt)).toBe(true);
    }
    expect(breath).toBeGreaterThan(.005); expect(breath).toBeLessThan(.01);
    expect(weapon.pose.tilt).toBeCloseTo(baseTilt);
  } finally { weapon.dispose(); scene.dispose(); engine.dispose(); }
});
