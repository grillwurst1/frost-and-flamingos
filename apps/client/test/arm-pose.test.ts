import { expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math';
import { createDefaultProfile } from '@frost-and-flamingos/shared';
import { GlbCharacterView } from '../src/rendering/glb-character';
import { paintedModelLibrary, jointName } from '../src/rendering/glb/library';
import type { GlbRig } from '../src/rendering/glb/rig';
import { closestOnSegment } from '../src/rendering/glb/hold';

test('snow-cannon sleeves stay fitted to the upper arms and both hands carry below the shoulders',async()=>{
  const original=globalThis.fetch,engine=new NullEngine(),scene=new Scene(engine);
  globalThis.fetch=(async input=>{const name=String(input).split('/').pop()!,file=Bun.file(resolve(import.meta.dir,'../public/models',name));
    return new Response(await file.arrayBuffer(),{headers:{'content-type':name.endsWith('.json')?'application/json':'model/gltf-binary'}})}) as typeof fetch;
  try {
    const asset=(await paintedModelLibrary(scene).load('alpine-heavy'))!,texture=RawTexture.CreateRGBATexture(new Uint8Array([255,255,255,255]),1,1,scene,false,false);
    const profile=createDefaultProfile('Arm inspection','heavy');
    Object.assign(profile.cosmetics,{bodyType:.12,headgear:'head_none',face:'face_full_beard',hairStyleIndex:6,torso:'torso_alpine_shirt',back:'back_cuckoo_clock'});
    const view=new GlbCharacterView(scene,new StandardMaterial('shadow',scene),profile,asset,{albedo:texture,normal:null,wardrobeMask:texture,head:{albedo:texture,mask:texture}});
    try {
      const rig=(view as unknown as {rig:GlbRig}).rig,mesh=view.root.getChildMeshes().find(m=>m.name==='soldier-modular-detail')!;
      const source=mesh.getVerticesData('position')!,colours=mesh.getVerticesData('color')!;
      // Two vertically aligned corners of the real red clock case. Its single
      // Spine2 skin weight makes the posed edge a direct torso-lean check.
      const corners:number[]=[];
      for(let v=0;v<source.length/3;v++)if(Math.abs(colours[v*4]!-129/255)<.0001&&Math.abs(colours[v*4+1]!-60/255)<.0001&&Math.abs(colours[v*4+2]!-53/255)<.0001)corners.push(v);
      const caseHeight=Math.max(...corners.map(v=>source[v*3+1]!))-Math.min(...corners.map(v=>source[v*3+1]!));
      expect(caseHeight/asset.height).toBeGreaterThan(.12);
      expect(caseHeight/asset.height).toBeLessThan(.20);
      let edge:[number,number]|null=null;
      for(const a of corners)for(const b of corners)if(Math.abs(source[a*3]!-source[b*3]!)<.00001&&Math.abs(source[a*3+2]!-source[b*3+2]!)<.00001&&source[b*3+1]!-source[a*3+1]!>.2)edge=[a,b];
      expect(edge).not.toBeNull();
      for(const preview of [false,true]) for(const phase of [0,.25,.5,.75]) {
      const internals=view as unknown as {breath:number;bindings:Map<string,{time:number;clip:{duration:number}}>};
      internals.breath=0;
      for(const binding of internals.bindings.values())binding.time=phase*binding.clip.duration;
      for(let frame=0;frame<60;frame++) {
        if(preview)view.updatePreview(1/45,0,'snow_cannon');
        else view.update(1/45,{position:{x:0,y:0,z:0},velocity:{x:0,y:0,z:0},yaw:0,grounded:true,alive:true,crouched:false,swimming:false,weaponId:'snow_cannon'});
      }
      rig.refresh();mesh.skeleton!.prepare(true);
      const p=mesh.getPositionData(true)!,j=mesh.getVerticesData('matricesIndices')!,w=mesh.getVerticesData('matricesWeights')!,paint=mesh.getVerticesData('uv3')!,colour=mesh.getVerticesData('color')!;
      const clockUp=Vector3.FromArray(p,edge![1]*3).subtract(Vector3.FromArray(p,edge![0]*3)).normalize();
      expect(clockUp.y).toBeGreaterThan(.98);
      for(const side of ['Left','Right'] as const) {
        const a=rig.position(`${side}Arm`)!,b=rig.position(`${side}ForeArm`)!,c=rig.position(`${side}Hand`)!;
        const restLift=asset.bindPositions.get(`${side}Arm`)!.y-asset.bindPositions.get('Spine2')!.y;
        expect(a.y-rig.position('Spine2')!.y).toBeLessThan(restLift+.04);
        const bone=mesh.skeleton!.bones.find(b=>jointName(b.name)===side+'Arm')!.getIndex();
        let radius=0,top=-Infinity,count=0,skinTop=-Infinity;
        for(let v=0;v<p.length/3;v++)if(colour[v*4+3]===1&&j[v*4]===bone&&w[v*4]!>.99)skinTop=Math.max(skinTop,p[v*3+1]!);
        for(let v=0;v<p.length/3;v++)if(paint[v*2]===3&&j[v*4]===bone&&w[v*4]!>.99) {
          const point=Vector3.FromArray(p,v*3);radius=Math.max(radius,Vector3.Distance(point,closestOnSegment(a,b,point)));top=Math.max(top,point.y);count++;
        }
        expect(count).toBeGreaterThan(50);
        expect(radius).toBeLessThan(.085);
        expect(top-a.y).toBeLessThan(.05);
        expect(b.y).toBeLessThan(a.y-.05);
        expect(c.y).toBeLessThan(a.y-.10);
        expect(skinTop).toBeLessThan(a.y-.01);
      }
      }
      mesh.skeleton!.prepare(true);
      const posed=mesh.getPositionData(true)!,col=mesh.getVerticesData('color')!,joint=mesh.getVerticesData('matricesIndices')!,painted=mesh.getVerticesData('uv3')!;
      const headIndex=mesh.skeleton!.bones.find(b=>jointName(b.name)==='Head')!.getIndex();
      let headBase=Infinity,shirtTop=-Infinity;
      for(let v=0;v<posed.length/3;v++) {
        if(col[v*4+3]===1&&joint[v*4]===headIndex)headBase=Math.min(headBase,posed[v*3+1]!);
        if(painted[v*2]===3&&Math.abs(posed[v*3]!)<.09)shirtTop=Math.max(shirtTop,posed[v*3+1]!);
      }
      expect(headBase-shirtTop).toBeLessThan(.02);
      // Looking around must move the head without folding the shirt shoulders.
      mesh.skeleton!.prepare(true);const before=Array.from(mesh.getPositionData(true)!);
      const neck=rig.node('Neck')!;neck.rotationQuaternion!.multiplyInPlace(Quaternion.RotationAxis(Vector3.Forward(),.5));
      mesh.skeleton!.prepare(true);const after=mesh.getPositionData(true)!,paint=mesh.getVerticesData('uv3')!;
      let clothMovement=0,headMovement=0;
      const j=mesh.getVerticesData('matricesIndices')!,head=mesh.skeleton!.bones.find(b=>jointName(b.name)==='Head')!.getIndex();
      for(let v=0;v<before.length/3;v++) {
        const movement=Math.hypot(after[v*3]!-before[v*3]!,after[v*3+1]!-before[v*3+1]!,after[v*3+2]!-before[v*3+2]!);
        if(paint[v*2]===3)clothMovement=Math.max(clothMovement,movement);
        if(j[v*4]===head)headMovement=Math.max(headMovement,movement);
      }
      expect(clothMovement).toBeLessThan(.00001);expect(headMovement).toBeGreaterThan(.02);
    }finally{view.dispose()}
  }finally{globalThis.fetch=original;scene.dispose();engine.dispose()}
});
