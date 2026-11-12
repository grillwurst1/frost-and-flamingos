import { expect, test } from 'bun:test';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math';
import { PhysicsWorld } from '@frost-and-flamingos/shared';
import RAPIER from '@dimforge/rapier3d-compat';
import { CameraRig, CABLE_CAR_CAMERA, HUMAN_CAMERA, REFERENCE_HUMAN_CAMERA } from '../src/engine/camera-rig';

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
