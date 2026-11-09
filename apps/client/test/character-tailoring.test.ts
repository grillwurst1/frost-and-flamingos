import { expect, test } from 'bun:test';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { createDefaultProfile } from '@frost-and-flamingos/shared';
import { CharacterView } from '../src/rendering/character';
import { shirtPoint, shirtRadius } from '../src/rendering/character-tailoring';

test('the closed shirt has a shoulder slope into the neck without a wide flat upper rim',()=>{
  expect(shirtRadius(.5)).toBeCloseTo(.2,6);
  expect(shirtRadius(.2)).toBeCloseTo(.5,6);
  for(let i=0;i<=1000;i++) {
    const r=shirtRadius(i/1000-.5);
    expect(r).toBeGreaterThanOrEqual(.19999);expect(r).toBeLessThanOrEqual(.50001);
  }
});

test('fitted shirt trim clears the actual triangulated cloth across all body widths',()=>{
  const engine=new NullEngine(),scene=new Scene(engine),shadow=new StandardMaterial('tailoring-shadow',scene);
  try {for(const bodyType of [0,.5,1]) {
    const profile=createDefaultProfile('Tailoring','heavy');
    Object.assign(profile.cosmetics,{bodyType,torso:'torso_alpine_shirt',back:'back_none'});
    const view=new CharacterView(scene,shadow,profile);
    try {
      const mesh=view.root.getChildMeshes().find(m=>m.name==='character-body-mesh')!;
      const p=mesh.getVerticesData('position')!,col=mesh.getVerticesData('color')!,tags=mesh.getVerticesData('uv2')!,idx=mesh.getIndices()!;
      const width=(.72-.20*bodyType)*.94,depth=.38-.08*bodyType+.02;
      let samples=0;
      for(const y of [.12,.24,.38,.49])for(const angle of [-.75,-.35,.35,.75]) {
        const x=Math.sin(angle)*width*shirtRadius((y-.27)/.65);
        const pin=shirtPoint(x,y,width,.65,depth,.27,.008);
        let front=-Infinity;
        for(let f=0;f<idx.length;f+=3) {
          const a=idx[f]!,b=idx[f+1]!,c=idx[f+2]!;
          if([a,b,c].some(v=>tags[v*2]!==0||col[v*4+3]!>.5||col[v*4]!<.8||col[v*4+1]!<.8))continue;
          const ax=p[a*3]!,ay=p[a*3+1]!,bx=p[b*3]!,by=p[b*3+1]!,cx=p[c*3]!,cy=p[c*3+1]!;
          const det=(by-cy)*(ax-cx)+(cx-bx)*(ay-cy);
          if(Math.abs(det)<1e-10)continue;
          const u=((by-cy)*(pin.x-cx)+(cx-bx)*(pin.y-cy))/det;
          const v=((cy-ay)*(pin.x-cx)+(ax-cx)*(pin.y-cy))/det,w=1-u-v;
          if(Math.min(u,v,w)<-1e-6)continue;
          front=Math.max(front,u*p[a*3+2]!+v*p[b*3+2]!+w*p[c*3+2]!);
        }
        expect(Number.isFinite(front)).toBe(true);
        expect(pin.z-front).toBeGreaterThan(.004);
        expect(pin.z-front).toBeLessThan(.014);samples++;
      }
      expect(samples).toBe(16);
    }finally{view.dispose()}
  }}finally{scene.dispose();engine.dispose()}
});
