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
    for(const mesh of cloud.meshes){expect(mesh.thinInstanceCount).toBe(SNOW_STREAM_CAPACITY);expect(mesh.isEnabled()).toBe(true);}
    cloud.update(2);for(const mesh of cloud.meshes)expect(mesh.isEnabled()).toBe(false);
    cloud.dispose();expect(scene.meshes).toHaveLength(0);cloud.dispose();
  }finally{scene.dispose();engine.dispose();}
});
