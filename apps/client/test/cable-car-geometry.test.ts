import { expect, test } from 'bun:test';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Scene } from '@babylonjs/core/scene';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { buildCableCar } from '../src/rendering/cable-car';

test('rounded cabin, windows, star, rivets and hanger use one bounded mesh', () => {
  const engine=new NullEngine(),scene=new Scene(engine),material=new StandardMaterial('cabin',scene);
  try {
    const mesh=buildCableCar(scene,material);
    expect(scene.meshes).toHaveLength(1);
    expect(mesh.getTotalIndices()/3).toBeLessThan(6000);
    expect(mesh.getVerticesData('normal')!.every(Number.isFinite)).toBe(true);
    expect(mesh.getBoundingInfo().boundingBox.maximum.y).toBeGreaterThan(4.2);
    const root=new TransformNode('moving-cabin',scene);mesh.parent=root;
    root.position.set(52,30,-40);root.rotation.y=0.7;
    mesh.computeWorldMatrix(true);
    expect(mesh.getAbsolutePosition().x).toBeCloseTo(52);
    expect(mesh.getBoundingInfo().boundingBox.minimumWorld.y).toBeGreaterThan(29);
    root.position.x+=15;mesh.computeWorldMatrix(true);
    expect(mesh.getAbsolutePosition().x).toBeCloseTo(67);
    root.dispose();expect(scene.meshes).toHaveLength(0);
  } finally {scene.dispose();engine.dispose()}
});
