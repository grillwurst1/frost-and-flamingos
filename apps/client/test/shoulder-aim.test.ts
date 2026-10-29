import { expect, test } from 'bun:test';
import { convergedShotDirection, validatedShotDirection } from '@frost-and-flamingos/shared';

test('centred and offset cameras converge on the centre-ray target instead of firing parallel past it', () => {
  const eye={x:0,y:1.6,z:0};
  for (const shoulder of [-1.9,0,1.9]) {
    const camera={x:shoulder,y:1.36,z:-3.25},forward={x:0,y:0,z:1};
    for(const distance of [8,20,100]) {
      const direction=convergedShotDirection(eye,camera,forward,distance);
      const time=(camera.z+distance-eye.z)/direction.z;
      expect(eye.x+direction.x*time).toBeCloseTo(shoulder,6);
      expect(eye.y+direction.y*time).toBeCloseTo(camera.y,6);
      expect(Math.hypot(direction.x,direction.y,direction.z)).toBeCloseTo(1,6);
      expect(validatedShotDirection(direction)).not.toBeNull();
    }
  }
});

test('a camera obstruction behind the body never turns the gun backwards; eye view has no parallax', () => {
  const eye={x:0,y:1.6,z:0};
  const close=convergedShotDirection(eye,{x:1.9,y:1.36,z:-3.25},{x:0,y:0,z:1},0.2);
  expect(close.z).toBeGreaterThan(0);
  expect(validatedShotDirection(close)).not.toBeNull();
  expect(convergedShotDirection(eye,eye,{x:0,y:0,z:1},10)).toEqual({x:0,y:0,z:1});
});

test('invalid, zero and oversized shot vectors are rejected; fast camera turns retain full aiming', () => {
  for(const direction of [{x:NaN,y:0,z:1},{x:0,y:Infinity,z:1},{x:0,y:0,z:0},{x:0,y:0,z:9}]) {
    expect(validatedShotDirection(direction)).toBeNull();
  }
  expect(validatedShotDirection({x:0,y:0,z:-1})).toEqual({x:0,y:0,z:-1});
});

test('centred follow camera keeps the full hero visible and retracts in front of a wall', async () => {
  const {NullEngine}=await import('@babylonjs/core/Engines/nullEngine');
  const {Scene}=await import('@babylonjs/core/scene');
  const {Vector3,Matrix}=await import('@babylonjs/core/Maths/math');
  const {CameraRig}=await import('../src/engine/camera-rig');
  const engine=new NullEngine({renderWidth:1280,renderHeight:714,textureSize:512,deterministicLockstep:false,lockstepMaxSteps:4});
  const scene=new Scene(engine),rig=new CameraRig(scene);scene.activeCamera=rig.camera;
  try{
    rig.resetAngles(0,-.08);
    const empty={raycast:()=>null};
    for(let frame=0;frame<120;frame++)rig.updatePlayer(1/60,Vector3.Zero(),empty as never);
    scene.updateTransformMatrix(true);
    const viewport=rig.camera.viewport.toGlobal(1280,714);
    const feet=Vector3.Project(Vector3.Zero(),Matrix.Identity(),scene.getTransformMatrix(),viewport);
    const head=Vector3.Project(new Vector3(0,2,0),Matrix.Identity(),scene.getTransformMatrix(),viewport);
    expect(feet.x/1280).toBeCloseTo(.5, 6);
    // Reference framing leaves boots above the bottom action/weapon cards.
    expect(feet.y/714).toBeGreaterThan(.80);expect(feet.y/714).toBeLessThan(.89);
    expect(head.y/714).toBeGreaterThan(.25);expect(head.y/714).toBeLessThan(.55);
    const wall={raycast:(_origin:unknown,direction:{z:number})=>direction.z<-.9?{distance:2.2}:null};
    rig.resetAngles(0,-.08);
    for(let frame=0;frame<120;frame++)rig.updatePlayer(1/60,Vector3.Zero(),wall as never);
    expect(Math.abs(rig.camera.position.x)).toBeLessThan(.001);
    expect(Math.abs(rig.camera.position.z)).toBeLessThan(2.1);
    expect(Math.abs(rig.camera.position.z)).toBeGreaterThan(1.5);
    expect(rig.camera.position.asArray().every(Number.isFinite)).toBe(true);
  }finally{scene.dispose();engine.dispose()}
});
