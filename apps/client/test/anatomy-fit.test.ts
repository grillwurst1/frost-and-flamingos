import { expect,test } from 'bun:test';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { Vector3 } from '@babylonjs/core/Maths/math';
import { fitHeavyNape } from '../src/rendering/glb/nape-fit';
import { MOUNTAIN_BOOT,sculptedBoot,sculptedBootSole,sculptedNeck } from '../src/rendering/character-surfaces';

test('the rounded Heavy nape preserves the face and carries perpendicular surface normals',()=>{
  const untouched=new Vector3(.04,1.44,.06),normal=new Vector3(0,0,1);
  fitHeavyNape(untouched,normal);expect(untouched.asArray()).toEqual([.04,1.44,.06]);
  for(const y of [1.30,1.32,1.34])for(const z of [-.12,-.07,-.05]) {
    const point=new Vector3(.035,y,z),n=new Vector3(.3,.2,-.93).normalize();
    const a=Vector3.Cross(n,Vector3.Up()).normalize(),b=Vector3.Cross(n,a).normalize();
    const at=point.clone(),mapped=n.clone();fitHeavyNape(at,mapped);
    expect(at.y).toBe(y);expect(at.z).toBeGreaterThan(z);expect(Math.abs(at.x)).toBeLessThan(point.x);
    for(const tangent of [a,b]) {
      const nearby=point.add(tangent.scale(.000001));fitHeavyNape(nearby,n.clone());
      expect(Math.abs(Vector3.Dot(nearby.subtract(at).normalize(),mapped))).toBeLessThan(.0002);
    }
  }
});

test('new boot and neck sculptures are closed and the shoe has a higher ankle than toe',()=>{
  const engine=new NullEngine(),scene=new Scene(engine);
  try {
    const boot=sculptedBoot(scene,'boot',MOUNTAIN_BOOT.width,MOUNTAIN_BOOT.height,MOUNTAIN_BOOT.depth),neck=sculptedNeck(scene,'neck');
    const sole=sculptedBootSole(scene,'sole',.168,.035,.29);
    for(const mesh of [boot,neck,sole]) {
      const p=mesh.getVerticesData('position')!,indices=mesh.getIndices()!,edges=new Map<string,number>();
      expect(Array.from(p).every(Number.isFinite)).toBe(true);
      for(let f=0;f<indices.length;f+=3)for(let k=0;k<3;k++) {
        const a=indices[f+k]!,b=indices[f+(k+1)%3]!,key=a<b?`${a}:${b}`:`${b}:${a}`;
        edges.set(key,(edges.get(key)??0)+1);
      }
      expect([...edges.values()].every(count=>count===2)).toBe(true);
      const normals=mesh.getVerticesData('normal')!;
      for(let v=0;v<p.length/3;v++)expect(Math.hypot(normals[v*3]!,normals[v*3+1]!,normals[v*3+2]!)).toBeCloseTo(1,4);
    }
    const p=boot.getVerticesData('position')!;let ankle=-Infinity,toe=-Infinity;
    for(let i=0;i<p.length;i+=3) {
      if(p[i+2]!<-.02&&p[i+2]!>-.10)ankle=Math.max(ankle,p[i+1]!);
      if(p[i+2]!>.08)toe=Math.max(toe,p[i+1]!);
    }
    expect(ankle-toe).toBeGreaterThan(.07);
    expect(boot.getVerticesData('normal')![(8*24)*3+1]!).toBeGreaterThan(.5);
    expect(neck.getVerticesData('normal')![(2*32)*3+2]!).toBeGreaterThan(.5);
    expect(sole.getVerticesData('normal')!.at(-2)!).toBeGreaterThan(.99);
  }finally{scene.dispose();engine.dispose()}
});
