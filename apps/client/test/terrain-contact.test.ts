import { expect, test } from 'bun:test';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Ray } from '@babylonjs/core/Culling/ray';
import { Vector3 } from '@babylonjs/core/Maths/math';
import RAPIER from '@dimforge/rapier3d-compat';
import { PhysicsWorld, REFERENCE_WORLD, arenaHeightAt, sampleMapHeight } from '@frost-and-flamingos/shared';
import { buildReferenceTerrain } from '../src/rendering/reference-arena';
import { buildTerrainMesh } from '../src/rendering/map/terrain-mesh';

test('visible slopes meet the actual Rapier ground at sub-cell positions', async () => {
  const physics = await PhysicsWorld.create();
  const engine = new NullEngine();
  const scene = new Scene(engine);
  try {
    const terrain = buildTerrainMesh(scene, new StandardMaterial('terrain', scene));
    terrain.computeWorldMatrix(true);
    for (const [x, z] of [[102.3, 148.6], [163.1, 188.7], [245.6, 272.2], [285.8, 175.9], [-185.6, -160.7], [-80.4, 82.2]]) {
      const origin = new Vector3(x!, 180, z!);
      const hit = terrain.intersects(new Ray(origin, new Vector3(0, -1, 0), 250), false);
      const collider = physics.world.castRay(new RAPIER.Ray(origin, {x: 0, y: -1, z: 0}), 250, true,
        undefined, undefined, undefined, undefined, c => physics.isTerrainCollider(c.handle));
      expect(hit.hit).toBe(true);
      expect(collider).not.toBeNull();
      expect(hit.pickedPoint!.y).toBeCloseTo(180 - collider!.timeOfImpact, 3);
      expect(sampleMapHeight(x!, z!)).toBeCloseTo(180 - collider!.timeOfImpact, 3);
    }
  } finally {
    scene.dispose(); engine.dispose(); physics.dispose();
  }
});


test('compact arena cliff, snow slope and beach pixels use the actual room collision triangles',async()=>{
  const physics=await PhysicsWorld.create([],REFERENCE_WORLD),engine=new NullEngine(),scene=new Scene(engine);
  try{
    const terrain=buildReferenceTerrain(scene);terrain.computeWorldMatrix(true);
    for(const [x,z] of [[0,-18.3],[0,-16.8],[-10.4,4.3],[10.8,1.2],[.2,28.7],[46.2,30.4],[34.2,20.7],[-18.3,-12.6]]){
      const origin=new Vector3(x!,80,z!),ray=new RAPIER.Ray(origin,{x:0,y:-1,z:0});
      const hit=terrain.intersects(new Ray(origin,new Vector3(0,-1,0),100),false);
      const collider=physics.world.castRay(ray,100,true,undefined,undefined,undefined,undefined,c=>physics.isTerrainCollider(c.handle));
      expect(hit.hit).toBe(true);expect(collider).not.toBeNull();
      expect(hit.pickedPoint!.y).toBeCloseTo(80-collider!.timeOfImpact,3);
      expect(arenaHeightAt(x!,z!)).toBeCloseTo(hit.pickedPoint!.y,3);
    }
  }finally{scene.dispose();engine.dispose();physics.dispose();}
});
