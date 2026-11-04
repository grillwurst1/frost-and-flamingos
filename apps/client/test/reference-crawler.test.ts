import { expect, test } from 'bun:test';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { Scene } from '@babylonjs/core/scene';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import { Vector3 } from '@babylonjs/core/Maths/math';
import { VEHICLES, vehicleMuzzle } from '@frost-and-flamingos/shared';
import { buildReferenceCrawler } from '../src/rendering/reference-crawler';
import { buildReferenceWorld } from '../src/rendering/reference-world';

test('reference crawler follows its moving hull and authoritative gun pivots in four bounded draws', () => {
  const engine=new NullEngine(),scene=new Scene(engine);
  try {
    const parent=new TransformNode('vehicle',scene),material=new ShaderMaterial('test',scene,{},{});
    const model=buildReferenceCrawler(scene,parent,material);
    expect(scene.meshes).toHaveLength(4);
    expect(scene.meshes.reduce((n,m)=>n+m.getTotalIndices()/3,0)).toBeLessThan(20000);
    const count=scene.meshes.length;
    for(let f=0;f<120;f++) {
      parent.position.set(f*.1,18.4,103);parent.rotation.y=f*.02;
      model.turret.rotation.y=.42;model.barrel.rotation.x=-.21;
      model.update(1/60,6);
      const actual=Vector3.TransformCoordinates(new Vector3(0,0,1.66),model.barrel.computeWorldMatrix(true));
      const expected=vehicleMuzzle(VEHICLES.fondue_crawler,parent.position,parent.rotation.y,.42,.21)!.origin;
      expect(Vector3.Distance(actual,new Vector3(expected.x,expected.y,expected.z))).toBeLessThan(.0001);
      const hull=Vector3.TransformCoordinates(Vector3.Zero(),model.hull.computeWorldMatrix(true));
      expect(Vector3.Distance(hull,parent.position)).toBeLessThan(.0001);
    }
    const tracks=scene.getMeshByName('reference-crawler-tracks')! as Mesh;
    expect(tracks.thinInstanceCount).toBe(80);
    expect(Array.from(tracks.getVerticesData('position')!).every(Number.isFinite)).toBe(true);
    expect(scene.meshes).toHaveLength(count);
  }finally {scene.dispose();engine.dispose();}
});

test('reference world uses three fixed meshes and does not allocate an unbounded smoke system', () => {
  const engine=new NullEngine(),scene=new Scene(engine);
  try {
    const meshes=buildReferenceWorld(scene,new ShaderMaterial('test',scene,{},{}));
    expect(meshes).toHaveLength(3);
    expect((scene.getMeshByName('reference-chimney-smoke')! as Mesh).thinInstanceCount).toBe(8);
    expect(meshes.reduce((n,m)=>n+m.getTotalIndices()/3,0)).toBeLessThan(12000);
    expect(meshes.every(m=>Array.from(m.getVerticesData('position')!).every(Number.isFinite))).toBe(true);
  }finally {scene.dispose();engine.dispose();}
});
