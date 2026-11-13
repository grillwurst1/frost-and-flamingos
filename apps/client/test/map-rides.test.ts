import {expect,test} from 'bun:test';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {Vector3} from '@babylonjs/core/Maths/math';
import type {VehicleViewPose} from '../src/rendering/vehicle-view';
import {PAINTED_MODELS} from '../src/rendering/glb/catalog';
import {VEHICLE_SLOTS,tbarHangerLength} from '@frost-and-flamingos/shared';

test('solid map rides retain bounded meshes and hammock tension keeps both cloth ends attached',async()=>{
  const catalogue=Object.keys(PAINTED_MODELS);
  const {VehicleView}=await import('../src/rendering/vehicle-view');
  const engine=new NullEngine(),scene=new Scene(engine);
  try {
    for(const kind of ['tbar','coaster_bob','hammock'] as const) {
      const view=new VehicleView(scene,kind,2);
      try {
        const meshes=view.root.getChildMeshes();
        expect(view.loaded).toBe(true);expect(meshes.length).toBeLessThanOrEqual(2);
        expect(meshes.reduce((n,m)=>n+m.getTotalIndices()/3,0)).toBeLessThan(3000);
        const pose:VehicleViewPose={position:{x:0,y:1.1,z:0},yaw:0,pitch:0,roll:0,forwardSpeed:0,turretYaw:0,turretPitch:0,steer:0,wreck:false,afloat:false,damage:0};
        if(kind==='tbar')pose.position={...VEHICLE_SLOTS.find(s=>s.id===110)!.spawn.position};
        view.update(.1,pose,null,new Vector3());
        const cloth=meshes.find(m=>m.name==='ride-hammock-solid'),before=cloth?Array.from(cloth.getVerticesData('position')!):[];
        const counts={meshes:scene.meshes.length,materials:scene.materials.length,geometries:scene.geometries.length};
        for(let frame=0;frame<200;frame++)view.update(1/60,{...pose,position:kind==='tbar'?pose.position:{x:0,y:.65,z:0},pitch:kind==='tbar'?0:-.25},null,new Vector3());
        expect({meshes:scene.meshes.length,materials:scene.materials.length,geometries:scene.geometries.length}).toEqual(counts);
        for(const mesh of meshes) {
          expect(Array.from(mesh.getVerticesData('position')!).every(Number.isFinite)).toBe(true);
          const normals=mesh.getVerticesData('normal')!;
          for(let i=0;i<normals.length;i+=3)expect(Math.hypot(normals[i]!,normals[i+1]!,normals[i+2]!)).toBeCloseTo(1,3);
        }
        if(cloth) {
          const after=cloth.getVerticesData('position')!;let ends=0,centre=0,edge=0;
          for(let i=0;i<before.length;i+=3)edge=Math.max(edge,Math.abs(before[i]!));
          for(let i=0;i<before.length;i+=3) {
            if(Math.abs(before[i]!)>edge-.0001){expect(.65+after[i+1]!).toBeCloseTo(1.1+before[i+1]!,3);ends++;}
            if(Math.abs(before[i]!)<.02){expect(after[i+1]!-before[i+1]!).toBeLessThan(.001);centre++;}
          }
          expect(ends).toBeGreaterThan(10);expect(centre).toBeGreaterThan(0);
        }
        const stem=meshes.find(m=>m.name==='tbar-telescopic-hanger');
        if(stem) {
          stem.computeWorldMatrix(true);
          const top=Math.max(...stem.getBoundingInfo().boundingBox.vectorsWorld.map(v=>v.y));
          expect(Math.abs(top-pose.position.y-.95-tbarHangerLength(pose.position))).toBeLessThan(.03);
        }
      }finally{view.dispose()}
    }
    expect(Object.keys(PAINTED_MODELS)).toEqual(catalogue);
  }finally{scene.dispose();engine.dispose()}
});
