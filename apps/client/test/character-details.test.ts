import { expect, test } from 'bun:test';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { createDefaultProfile } from '@frost-and-flamingos/shared';
import { CharacterView } from '../src/rendering/character';
import { sculptedBeard, tailoredStrip } from '../src/rendering/character-surfaces';
import { Color4, Vector3 } from '@babylonjs/core/Maths/math';
import { sculptedEyes } from '../src/rendering/glb/eye-surfaces';

test('sculpted eyes have finite outward 3D surfaces and texture-independent feature colours', () => {
  const eyes = sculptedEyes(), used = new Set(eyes.indices);
  expect(eyes.indices.length / 3).toBeLessThanOrEqual(800);
  expect(used.size).toBe(eyes.positions.length / 3);
  expect(eyes.positions.every(Number.isFinite)).toBe(true);
  expect(eyes.colors.every(c => c >= 0 && c <= 1)).toBe(true);
  for (let v = 0; v < eyes.positions.length / 3; v++) {
    expect(Vector3.FromArray(eyes.normals, v * 3).length()).toBeCloseTo(1, 5);
    expect(eyes.colors[v * 4 + 3]).toBe(0);
  }
  for (let f = 0; f < eyes.indices.length; f += 3) {
    const [a, b, c] = eyes.indices.slice(f, f + 3) as [number, number, number];
    const at = (v: number) => Vector3.FromArray(eyes.positions, v * 3);
    const normal = Vector3.FromArray(eyes.normals, a * 3).add(Vector3.FromArray(eyes.normals, b * 3)).add(Vector3.FromArray(eyes.normals, c * 3));
    expect(Vector3.Dot(Vector3.Cross(at(b).subtract(at(a)), at(c).subtract(at(a))), normal)).toBeGreaterThan(0);
  }
  const depths = eyes.positions.filter((_, i) => i % 3 === 2);
  expect(Math.max(...depths) - Math.min(...depths)).toBeGreaterThan(.014);
});

test('the beard and fitted shoulder ribbon have outward front surfaces with back-face culling', () => {
  const engine = new NullEngine(), scene = new Scene(engine);
  const beard = sculptedBeard(scene, .78, new Color4(.3, .2, .1, 0));
  const strap = tailoredStrip(scene, 'strap', [new Vector3(0, .1, .2), new Vector3(0, .3, .2), new Vector3(0, .5, .2)], .04, .01, new Color4(.3, .2, .1, 0));
  try {
    for (const mesh of [beard, strap]) {
      const p = mesh.getVerticesData('position')!, n = mesh.getVerticesData('normal')!;
      let front = 0;
      // Sample the front surface, not strap bevels/caps. The beard's lip
      // opening changes its upper edge, so do not assume an old mouth height.
      for (let v = 0; v < p.length / 3; v++) if (p[v * 3 + 2]! > (mesh === strap ? .204 : .202) && Math.abs(p[v * 3]!) < .025) {
        expect(n[v * 3 + 2]!).toBeGreaterThan(.4); front++;
      }
      expect(front).toBeGreaterThan(2);
    }
  } finally { scene.dispose(); engine.dispose(); }
});

test('a bare arm is a connected surface from shoulder to wrist rather than separate joint primitives', () => {
  const engine = new NullEngine(), scene = new Scene(engine);
  const view = new CharacterView(scene, new StandardMaterial('shadow', scene), createDefaultProfile('Arms', 'heavy'));
  try {
    const mesh = view.root.getChildMeshes().find(m => m.name === 'left-arm-mesh')!;
    const p = mesh.getVerticesData('position')!, faces = mesh.getIndices()!;
    const parent = Array.from({ length: p.length / 3 }, (_, i) => i);
    const root = (v: number): number => { while (parent[v] !== v) { parent[v] = parent[parent[v]!]!; v = parent[v]!; } return v; };
    for (let i = 0; i < faces.length; i += 3) {
      const a = root(faces[i]!), b = root(faces[i + 1]!), c = root(faces[i + 2]!);
      parent[b] = a; parent[c] = a;
    }
    const spans = new Map<number, { min: number; max: number }>();
    for (let v = 0; v < p.length / 3; v++) {
      const id = root(v), y = p[v * 3 + 1]!, span = spans.get(id) ?? { min: Infinity, max: -Infinity };
      span.min = Math.min(span.min, y); span.max = Math.max(span.max, y); spans.set(id, span);
    }
    expect([...spans.values()].some(s => s.min < -.55 && s.max > -.1)).toBe(true);
  } finally { view.dispose(); scene.dispose(); engine.dispose(); }
});

test('eye whites stay embedded near the face rather than protruding as spherical eyeballs', () => {
  const engine = new NullEngine(), scene = new Scene(engine);
  const view = new CharacterView(scene, new StandardMaterial('shadow', scene), createDefaultProfile('Face'));
  try {
    const body = view.root.getChildMeshes().find(m => m.name === 'character-body-mesh')!;
    const p = body.getVerticesData('position')!, c = body.getVerticesData('color')!;
    let whites = 0;
    for (let v = 0; v < p.length / 3; v++) {
      if (Math.abs(p[v * 3]!) < .04 || Math.abs(p[v * 3]!) > .115 || p[v * 3 + 1]! < .79 || p[v * 3 + 1]! > .855) continue;
      if (c[v * 4]! > .9 && c[v * 4 + 1]! > .9 && c[v * 4 + 2]! > .9) {
        whites++; expect(p[v * 3 + 2]!).toBeLessThan(.207);
      }
    }
    expect(whites).toBeGreaterThan(20);
  } finally { view.dispose(); scene.dispose(); engine.dispose(); }
});

test('closed waistcoats contain no second chest or skin surface under the garment', () => {
  const engine = new NullEngine(), scene = new Scene(engine);
  try {
    for (const torso of ['torso_field_vest', 'torso_tracht_shirt'] as const) {
      const profile = createDefaultProfile('Covered torso'); profile.cosmetics.torso = torso;
      const view = new CharacterView(scene, new StandardMaterial('shadow', scene), profile);
      try {
        const body = view.root.getChildMeshes().find(m => m.name === 'character-body-mesh')!;
        const p = body.getVerticesData('position')!, c = body.getVerticesData('color')!;
        for (let v = 0; v < p.length / 3; v++) if (p[v * 3 + 1]! > .06 && p[v * 3 + 1]! < .45) expect(c[v * 4 + 3]!).toBeLessThan(.1);
      } finally { view.dispose(); }
    }
  } finally { scene.dispose(); engine.dispose(); }
});

test('reference sleeves expose skin below the elbow and tall boots contain no hidden shin surface', () => {
  const engine = new NullEngine(), scene = new Scene(engine);
  const profile = createDefaultProfile('Clean garment surfaces');
  profile.cosmetics.torso = 'torso_tracht_shirt';
  profile.cosmetics.legs = 'legs_lederhosen';
  profile.cosmetics.feet = 'feet_ski_boots';
  const view = new CharacterView(scene, new StandardMaterial('shadow', scene), profile);
  try {
    for (const side of ['left', 'right']) {
      const arm = view.root.getChildMeshes().find(m => m.name === `${side}-arm-mesh`)!;
      const p = arm.getVerticesData('position')!, c = arm.getVerticesData('color')!;
      let forearmSkin = 0;
      for (let v = 0; v < p.length / 3; v++) if (p[v * 3 + 1]! < -.38 && p[v * 3 + 1]! > -.55 && c[v * 4 + 3]! > .9) forearmSkin++;
      expect(forearmSkin).toBeGreaterThan(0);
      const leg = view.root.getChildMeshes().find(m => m.name === `${side}-leg-mesh`)!;
      const lp = leg.getVerticesData('position')!, lc = leg.getVerticesData('color')!;
      for (let v = 0; v < lp.length / 3; v++) if (lp[v * 3 + 1]! < -.5) expect(lc[v * 4 + 3]!).toBeLessThan(.1);
    }
  } finally { view.dispose(); scene.dispose(); engine.dispose(); }
});

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
