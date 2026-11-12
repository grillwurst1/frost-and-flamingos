import { expect,test } from 'bun:test';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { buildHeroWeapon } from '../src/rendering/weapons/hero-weapon';

test('the fitted snow-cannon muzzle stays at the actual barrel lip for both hand origins and mirrors',()=>{
  const engine=new NullEngine(),scene=new Scene(engine),material=new StandardMaterial('prop',scene);
  try {
    for(const origin of ['grip','wrist'] as const)for(const mirrorX of [false,true]) {
      const weapon=buildHeroWeapon(scene,'snow_cannon',material,{origin,mirrorX})!;
      try {
        const bounds=weapon.mesh.getBoundingInfo().boundingBox;
        expect(Math.abs(weapon.muzzle!.position.z-bounds.maximum.z)).toBeLessThan(.015);
        expect(bounds.maximum.x-bounds.minimum.x).toBeLessThan(.32);
        expect(weapon.pose.support!.z).toBeLessThan(weapon.muzzle!.position.z-.1);
        expect(weapon.mesh.getChildMeshes().some(m=>m.name==='hero-weapon-snow_cannon-flash')).toBe(false);
        const p=weapon.mesh.getVerticesData('position')!,n=weapon.mesh.getVerticesData('normal')!;
        expect(Array.from(p).every(Number.isFinite)).toBe(true);
        for(let i=0;i<n.length;i+=3)expect(Math.hypot(n[i]!,n[i+1]!,n[i+2]!)).toBeCloseTo(1,4);
      }finally{weapon.dispose()}
    }
  }finally{scene.dispose();engine.dispose()}
});
