import { expect, test } from 'bun:test';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { buildRowboat } from '../src/rendering/rowboat';

test('detailed rowboat uses a bounded hull mesh and four movable oars, all disposed together', () => {
  const engine = new NullEngine(), scene = new Scene(engine), material = new StandardMaterial('boat',scene);
  const root = new TransformNode('boat-root',scene);
  const boat = buildRowboat(scene,material,root);
  expect(boat.oars).toHaveLength(4);
  expect(root.getChildMeshes()).toHaveLength(5);
  let triangles = 0;
  for (const mesh of root.getChildMeshes()) {
    triangles += mesh.getTotalIndices()/3;
    expect(mesh.material).toBe(material);
    expect(mesh.getVerticesData('normal')?.every(Number.isFinite)).toBe(true);
  }
  expect(triangles).toBeLessThan(10000);
  root.dispose();expect(scene.meshes).toHaveLength(0);
  scene.dispose();engine.dispose();
});
