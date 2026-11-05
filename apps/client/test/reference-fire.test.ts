import { expect, test } from 'bun:test';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { Vector3 } from '@babylonjs/core/Maths/math';
import { REFERENCE_CHALET_FIRE } from '@frost-and-flamingos/shared';
import { ReferenceChaletFireView } from '../src/rendering/reference-fire';

test('chalet fire reuses exactly five drawn fire effects and forty solid puffs and hides after extinguishing',()=>{
  const engine=new NullEngine(),scene=new Scene(engine),p=REFERENCE_CHALET_FIRE.points[0]!;
  new FreeCamera('fire-camera',new Vector3(p.x+10,p.y+4,p.z+10),scene);
  engine.getDeltaTime=()=>16;
  const fire=new ReferenceChaletFireView(scene);
  try {
    expect(scene.meshes).toHaveLength(2);expect(scene.materials).toHaveLength(2);expect(scene.textures).toHaveLength(1);
    expect(fire.meshes.map(m=>m.thinInstanceCount)).toEqual([5,40]);
    const before=scene.meshes.length;fire.setBurning(true);
    for(let f=0;f<600;f++)scene.onBeforeRenderObservable.notifyObservers(scene);
    expect(scene.meshes).toHaveLength(before);expect(scene.materials).toHaveLength(2);
    for(const mesh of fire.meshes){expect(mesh.isEnabled()).toBe(true);expect(mesh.thinInstanceGetWorldMatrices().every(m=>m.asArray().every(Number.isFinite))).toBe(true);}
    fire.setBurning(false);scene.onBeforeRenderObservable.notifyObservers(scene);
    expect(fire.meshes.every(m=>!m.isEnabled())).toBe(true);
  }finally {fire.dispose();scene.dispose();engine.dispose();}
});
