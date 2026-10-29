import { expect, test } from 'bun:test';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math';
import { PhysicsWorld } from '@frost-and-flamingos/shared';
import { CameraRig, CABLE_CAR_CAMERA } from '../src/engine/camera-rig';

test('human follow camera keeps the controlled player horizontally centred across yaw, zoom and shoulder key', async () => {
  const engine = new NullEngine({ renderWidth: 1280, renderHeight: 720, textureSize: 256, deterministicLockstep: false, lockstepMaxSteps: 4 });
  const scene = new Scene(engine), physics = await PhysicsWorld.create();
  try {
    const rig = new CameraRig(scene), feet = new Vector3(0, 150, 0);
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
