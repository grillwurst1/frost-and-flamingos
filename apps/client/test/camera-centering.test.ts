import { expect, test } from 'bun:test';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math';
import { PhysicsWorld, WEAPON_STATS } from '@frost-and-flamingos/shared';
import RAPIER from '@dimforge/rapier3d-compat';
import { CameraRig, CABLE_CAR_CAMERA, HUMAN_CAMERA, REFERENCE_HUMAN_CAMERA, REFERENCE_SNOW_CAMERA, cameraProfileFor } from '../src/engine/camera-rig';

test('the whole snow-cannon reticle stays inside ordinary laptop and compact windows on either shoulder',async()=>{
  const physics=await PhysicsWorld.create();
  const margin=Math.ceil(5+WEAPON_STATS.snow_cannon.spread*640)+14;
  try {
    for(const [width,height] of [[800,500],[1280,800],[1280,720]] as const) {
      const engine=new NullEngine({renderWidth:width,renderHeight:height,textureSize:256,deterministicLockstep:false,lockstepMaxSteps:4}),scene=new Scene(engine);
      try {
        const camera=new CameraRig(scene),feet=new Vector3(0,150,0),eyes=feet.add(new Vector3(0,1.9,0));
        camera.setProfile(REFERENCE_SNOW_CAMERA);
        for(const shoulder of [0,1]) {
          if(shoulder)camera.swapShoulder();
          for(const range of [3,12]) {
            camera.resetAngles(.90,-.16);camera.snapToPlayer(feet);
            for(let frame=0;frame<120;frame++)camera.updatePlayer(1/60,feet,physics);
            camera.setPhysicalAimTarget(eyes,camera.getAimDirectionToRef(new Vector3()),range);
            const x=camera.aimScreen.x/100*width,y=camera.aimScreen.y/100*height;
            expect(x).toBeGreaterThan(margin);expect(x).toBeLessThan(width-margin);
            expect(y).toBeGreaterThan(margin);expect(y).toBeLessThan(height-margin);
          }
        }
      }finally{scene.dispose();engine.dispose()}
    }
  }finally{physics.dispose()}
});

test('the reference snow side view projects the actual eye ray through turns, shoulders, zoom and a rear wall',async()=>{
  const engine=new NullEngine({renderWidth:1280,renderHeight:720,textureSize:256,deterministicLockstep:false,lockstepMaxSteps:4}),scene=new Scene(engine),physics=await PhysicsWorld.create();
  try {
    const rig=new CameraRig(scene),feet=new Vector3(0,150,0),eyes=feet.add(new Vector3(0,1.9,0));
    expect(cameraProfileFor(null,true,'snow_cannon')).toBe(REFERENCE_SNOW_CAMERA);
    expect(cameraProfileFor(null,false,'snow_cannon')).toBe(HUMAN_CAMERA);
    rig.setProfile(REFERENCE_SNOW_CAMERA);rig.resetAngles(.82,-.16);rig.snapToPlayer(feet);
    const advance=(range:number)=>{
      rig.updatePlayer(1/60,feet,physics);rig.setPhysicalAimTarget(eyes,rig.getAimDirectionToRef(new Vector3()),range);
      scene.updateTransformMatrix(true);
    };
    for(let f=0;f<90;f++)advance(12);
    const aim=rig.getAimDirectionToRef(new Vector3()),side=rig.camera.position.subtract(eyes);side.y=0;side.normalize();
    expect(Vector3.Dot(side,aim)).toBeGreaterThan(-.65); // A visible side, rather than another back-only frame.
    const head=Vector3.Project(eyes,Matrix.Identity(),scene.getTransformMatrix(),rig.camera.viewport.toGlobal(1280,720));
    expect(head.x).toBeGreaterThan(350);expect(head.x).toBeLessThan(620);
    for(const yaw of [.82,-1.2,Math.PI])for(const range of [1.5,12])for(const pitch of [-1,-.65,-.16,.65,1.05]) {
      rig.resetAngles(yaw,pitch);rig.swapShoulder();rig.zoom(-10000);rig.snapToPlayer(feet);
      for(let f=0;f<90;f++)advance(range);
      const point=eyes.add(rig.getAimDirectionToRef(new Vector3()).scale(range));
      expect(Vector3.Distance(point,rig.aimTarget)).toBeLessThan(.00001);
      const p=Vector3.Project(point,Matrix.Identity(),scene.getTransformMatrix(),rig.camera.viewport.toGlobal(1280,720));
      expect(p.x/1280*100).toBeCloseTo(rig.aimScreen.x,3);expect(p.y/720*100).toBeCloseTo(rig.aimScreen.y,3);
      expect(p.x).toBeGreaterThan(0);expect(p.x).toBeLessThan(1280);expect(p.y).toBeGreaterThan(0);expect(p.y).toBeLessThan(720);
    }
    rig.resetAngles(0,-.16);rig.snapToPlayer(feet);
    physics.world.createCollider(RAPIER.ColliderDesc.cuboid(5,4,.1).setTranslation(0,151.65,-1.0));physics.world.step();
    for(let f=0;f<120;f++)advance(12);
    expect(rig.camera.position.z).toBeGreaterThan(-.9);expect(rig.aimScreen.x).toBeGreaterThan(0);expect(rig.aimScreen.x).toBeLessThan(100);
  }finally{scene.dispose();engine.dispose();physics.dispose()}
});

test('human follow camera keeps the controlled player horizontally centred across yaw, zoom and shoulder key', async () => {
  const engine = new NullEngine({ renderWidth: 1280, renderHeight: 720, textureSize: 256, deterministicLockstep: false, lockstepMaxSteps: 4 });
  const scene = new Scene(engine), physics = await PhysicsWorld.create();
  try {
    const rig = new CameraRig(scene), feet = new Vector3(0, 150, 0);
    rig.setProfile(REFERENCE_HUMAN_CAMERA);rig.resetAngles(0,-.30);rig.snapToPlayer(feet);
    for(let f=0;f<90;f++)rig.updatePlayer(1/60,feet,physics);
    scene.updateTransformMatrix(true);
    const screen=rig.camera.viewport.toGlobal(1280,720);
    const head=Vector3.Project(feet.add(new Vector3(0,1.70,0)),Matrix.Identity(),scene.getTransformMatrix(),screen);
    const soles=Vector3.Project(feet,Matrix.Identity(),scene.getTransformMatrix(),screen);
    expect(head.x).toBeGreaterThan(500);
    expect(head.x).toBeLessThan(620); // Video side view keeps the body near centre and clears the aim lane.
    const aim=rig.getAimDirectionToRef(new Vector3());
    expect(aim.x).toBeCloseTo(0,4);
    const aimPixel=Vector3.Project(rig.camera.position.add(aim.scale(30)),Matrix.Identity(),scene.getTransformMatrix(),screen);
    expect(aimPixel.x-head.x).toBeGreaterThan(180);
    expect(aimPixel.x/1280*100).toBeCloseTo(rig.aimScreen.x,2);
    expect(aimPixel.y/720*100).toBeCloseTo(rig.aimScreen.y,2);
    expect(head.y).toBeGreaterThan(250); // Close video framing: large head/body, fully in view.
    expect(head.y).toBeLessThan(360);
    expect(soles.y-head.y).toBeGreaterThan(300);
    expect(soles.y).toBeLessThan(685); // Leave room for the bottom HUD.
    rig.zoom(-10000);
    for(let f=0;f<90;f++)rig.updatePlayer(1/60,feet,physics);
    expect(rig.aimScreen.x).toBeGreaterThan(0);expect(rig.aimScreen.x).toBeLessThan(100);
    rig.resetAngles(0,-.30);rig.snapToPlayer(feet);
    const wall=physics.world.createCollider(RAPIER.ColliderDesc.cuboid(4,4,.1).setTranslation(0,151.65,-1.5));
    physics.world.step();
    for(let f=0;f<120;f++)rig.updatePlayer(1/60,feet,physics);
    expect(rig.camera.position.z).toBeGreaterThan(-1.4);
    expect(rig.aimScreen.x).toBeGreaterThan(0);expect(rig.aimScreen.x).toBeLessThan(100);
    physics.world.removeCollider(wall,true);physics.world.step();
    rig.setProfile(HUMAN_CAMERA);
    for (const yaw of [0, .8, -2, Math.PI]) {
      rig.resetAngles(yaw); rig.zoom(450); rig.swapShoulder();
      rig.snapToPlayer(feet);
      for (let f = 0; f < 90; f++) rig.updatePlayer(1 / 60, feet, physics);
      scene.updateTransformMatrix(true);
      const p = Vector3.Project(feet.add(new Vector3(0, 1, 0)), Matrix.Identity(), scene.getTransformMatrix(),
        rig.camera.viewport.toGlobal(1280, 720));
      expect(Math.abs(p.x - 640)).toBeLessThan(.5);
    }
    // Keep the moving cabin in frame even when each received pose is metres
    // ahead of the previous render. The camera must not lag at the old village.
    rig.setProfile(CABLE_CAR_CAMERA); rig.resetAngles(0); rig.snapToPlayer(feet);
    for (let f = 0; f < 12; f++) {
      feet.addInPlace(new Vector3(4, 2, 3)); rig.handleMouse(120, 0);
      rig.updatePlayer(.1, feet, physics); scene.updateTransformMatrix(true);
      const pivot = feet.add(new Vector3(0, CABLE_CAR_CAMERA.pivotHeight, 0));
      const p = Vector3.Project(pivot, Matrix.Identity(), scene.getTransformMatrix(), rig.camera.viewport.toGlobal(1280, 720));
      expect(Math.abs(p.x - 640)).toBeLessThan(.5); expect(Math.abs(p.y - 360)).toBeLessThan(.5);
      expect(Vector3.Distance(rig.camera.position, pivot)).toBeLessThan(10);
    }
  } finally { scene.dispose(); engine.dispose(); physics.dispose(); }
});
