import { expect, test } from 'bun:test';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { createDefaultProfile } from '@frost-and-flamingos/shared';
import { CharacterView } from '../src/rendering/character';

test('the backpack dial faces outward and remains in front of its wooden shell', () => {
  const engine=new NullEngine(),scene=new Scene(engine),profile=createDefaultProfile('Dial');
  profile.cosmetics.back='back_cuckoo_clock';
  const view=new CharacterView(scene,new StandardMaterial('shadow',scene),profile);
  try {
    const body=view.root.getChildMeshes().find(m=>m.name==='character-body-mesh')!;
    const p=body.getVerticesData('position')!,n=body.getVerticesData('normal')!,c=body.getVerticesData('color')!;
    let dial=0;
    for(let v=0;v<p.length/3;v++) {
      if(p[v*3+2]!<-.33&&p[v*3+1]!>.21&&p[v*3+1]!<.41&&c[v*4]!>.85&&c[v*4+1]!>.85&&c[v*4+2]!>.85) {
        dial++;expect(n[v*3+2]!).toBeLessThan(-.9);
      }
    }
    expect(dial).toBeGreaterThanOrEqual(24);
  }finally{view.dispose();scene.dispose();engine.dispose()}
});

test('ski boots reach the lower shin and their visible clasps project beyond the toe shell', () => {
  const engine=new NullEngine(),scene=new Scene(engine),profile=createDefaultProfile('Boots');
  profile.cosmetics.feet='feet_ski_boots';
  const view=new CharacterView(scene,new StandardMaterial('shadow',scene),profile);
  try {
    for(const name of ['left-leg-mesh','right-leg-mesh']) {
      const leg=view.root.getChildMeshes().find(m=>m.name===name)!;
      const p=leg.getVerticesData('position')!,c=leg.getVerticesData('color')!;
      let shaftTop=-Infinity,claspFront=-Infinity;
      for(let v=0;v<p.length/3;v++) {
        if(c[v*4]!>.7&&c[v*4+1]!<.3&&p[v*3+1]!<-.4)shaftTop=Math.max(shaftTop,p[v*3+1]!);
        if(c[v*4]!>.85&&c[v*4+1]!>.85&&p[v*3+1]!<-.73)claspFront=Math.max(claspFront,p[v*3+2]!);
      }
      expect(shaftTop).toBeGreaterThan(-.51);
      expect(claspFront).toBeGreaterThan(.215);
    }
  }finally{view.dispose();scene.dispose();engine.dispose()}
});

test('the waistcoat wraps around the chest with curved side normals', () => {
  const engine=new NullEngine(),scene=new Scene(engine),profile=createDefaultProfile('Waistcoat');
  profile.cosmetics.torso='torso_tracht_shirt';
  const view=new CharacterView(scene,new StandardMaterial('shadow',scene),profile);
  try {
    const body=view.root.getChildMeshes().find(m=>m.name==='character-body-mesh')!;
    const p=body.getVerticesData('position')!,n=body.getVerticesData('normal')!,c=body.getVerticesData('color')!;
    let left=false,right=false;
    for(let v=0;v<p.length/3;v++) {
      if(Math.abs(c[v*4]!-70/255)<.001&&Math.abs(c[v*4+1]!-93/255)<.001&&Math.abs(c[v*4+2]!-50/255)<.001&&
        p[v*3+1]!>.2&&p[v*3+1]!<.4&&Math.abs(p[v*3]!)<.25&&p[v*3+2]!<-.06&&n[v*3+2]!>-.95&&n[v*3+2]!<-.25) {
        if(p[v*3]!<0)left=true;else right=true;
      }
    }
    expect(left).toBe(true);expect(right).toBe(true);
  }finally{view.dispose();scene.dispose();engine.dispose()}
});
