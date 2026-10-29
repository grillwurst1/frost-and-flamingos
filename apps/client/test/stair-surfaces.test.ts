import { expect, test } from 'bun:test';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { Ray } from '@babylonjs/core/Culling/ray';
import { Vector3 } from '@babylonjs/core/Maths/math';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { GeometryBatch } from '../src/rendering/map/geometry';
import { drawClosedStairs } from '../src/rendering/map/stairs';

test('stair risers close the space below every tread without moving the walking surface away from its ramp', () => {
  const engine = new NullEngine(), scene = new Scene(engine);
  try {
    const batch = new GeometryBatch();
    drawClosedStairs(batch, { x: 0, y: 0, z: 0 }, { x: 0, y: 3, z: 6 }, 1.8);
    const mesh = batch.toMesh(scene, 'closed-stairs', new StandardMaterial('stairs', scene))!;
    mesh.computeWorldMatrix(true);
    for (let i = 0; i < 25; i++) {
      const z = .15 + i * 5.7 / 24, ramp = z / 2;
      // Thin floating treads leave this horizontal sightline empty.
      expect(mesh.intersects(new Ray(new Vector3(-2, ramp - .20, z), new Vector3(1, 0, 0), 4), false).hit).toBe(true);
      const tread = mesh.intersects(new Ray(new Vector3(0, ramp + .3, z), new Vector3(0, -1, 0), .6), false);
      expect(tread.hit).toBe(true); expect(Math.abs(tread.pickedPoint!.y - ramp)).toBeLessThan(.12);
    }
  } finally { scene.dispose(); engine.dispose(); }
});
