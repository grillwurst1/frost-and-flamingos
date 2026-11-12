import {expect,test} from 'bun:test';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {SnowStream,SNOW_STREAM_CAPACITY} from '../src/rendering/snow-stream';
test('repeated snow clouds remain in two fixed solid draws and expire without retaining resources',()=>{
  const engine=new NullEngine(),scene=new Scene(engine),cloud=new SnowStream(scene,()=>null);
  try{
    const before={meshes:scene.meshes.length,materials:scene.materials.length,geometries:scene.geometries.length};
    for(let burst=0;burst<500;burst++){cloud.shot({x:0,y:2,z:0},.5,-.1);cloud.update(1/60);}
    expect(scene.meshes.length).toBe(before.meshes);expect(scene.materials.length).toBe(before.materials);expect(scene.geometries.length).toBe(before.geometries);
    for(const mesh of cloud.meshes){expect(mesh.thinInstanceCount).toBe(SNOW_STREAM_CAPACITY);expect(mesh.isEnabled()).toBe(true);
      expect(mesh.getTotalIndices()/3).toBeLessThanOrEqual(256);
      expect(mesh.thinInstanceGetWorldMatrices().every(m=>Array.from(m.m).every(Number.isFinite))).toBe(true);
      const positions=mesh.getVerticesData('position')!,normals=mesh.getVerticesData('normal')!;
      for(let i=0;i<positions.length;i+=3){
        expect(Math.hypot(normals[i]!,normals[i+1]!,normals[i+2]!)).toBeCloseTo(1,5);
        expect(positions[i]!*normals[i]!+positions[i+1]!*normals[i+1]!+positions[i+2]!*normals[i+2]!).toBeGreaterThan(.3);
      }
    }
    cloud.update(2);for(const mesh of cloud.meshes)expect(mesh.isEnabled()).toBe(false);
    cloud.dispose();expect(scene.meshes).toHaveLength(0);cloud.dispose();
  }finally{scene.dispose();engine.dispose();}
});

test('snow clouds stop before a nearby solid hit while keeping a bounded visible impact',()=>{
  const engine=new NullEngine(),scene=new Scene(engine),cloud=new SnowStream(scene,()=>1);
  try {
    cloud.shot({x:0,y:2,z:0},0,0);cloud.update(.001);cloud.update(.25);
    const matrices=cloud.meshes[0]!.thinInstanceGetWorldMatrices(),active=matrices.filter(m=>Math.hypot(m.m[0]!,m.m[1]!,m.m[2]!)>.0001);
    // Four narrow jet beads expire early; the twelve billows remain at impact.
    expect(active.length).toBe(12);
    for(const matrix of active){expect(matrix.m[14]!).toBeLessThanOrEqual(.85001);expect(matrix.m[14]!).toBeGreaterThan(0);}
  }finally{cloud.dispose();scene.dispose();engine.dispose()}
});
