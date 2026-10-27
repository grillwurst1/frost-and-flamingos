import { expect, test } from 'bun:test';
import '@babylonjs/core/Culling/ray';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { Vector3 } from '@babylonjs/core/Maths/math';
import { createDefaultProfile, HANDS_IDS, SKIN_TONES } from '@frost-and-flamingos/shared';
import { CameraRig } from '../src/engine/camera-rig';
import { VehicleHands } from '../src/rendering/vehicle-hands';

test('passenger eyes follow the seat exactly and retain full mouse look when the hull turns', () => {
  const engine = new NullEngine(), scene = new Scene(engine), rig = new CameraRig(scene);
  try {
    rig.resetAngles(0.5, 0.2);
    rig.updatePassengerEyes(1 / 60, { x: 10, y: 20, z: 30 });
    expect(rig.camera.position.asArray()).toEqual([10, 20, 30]);
    const direction = rig.camera.getForwardRay().direction;
    expect(direction.y).toBeCloseTo(Math.sin(0.2), 4);
    expect(Math.atan2(direction.x, direction.z)).toBeCloseTo(0.5, 4);
    rig.handleMouse(1600, 0);
    for (let i = 0; i < 60; i++) rig.updatePassengerEyes(1 / 60, { x: 18, y: 20, z: 35 });
    expect(rig.camera.position.asArray()).toEqual([18, 20, 35]);
    expect(rig.lookYaw).toBeGreaterThan(Math.PI);
    const before = rig.camera.position.clone();
    rig.updatePlayer(1 / 60, new Vector3(18, 19, 35), { raycast: () => null } as never);
    expect(Vector3.Distance(before, rig.camera.position)).toBeLessThan(9);
    expect(rig.camera.position.asArray().every(Number.isFinite)).toBe(true);
  } finally { scene.dispose(); engine.dispose(); }
});

test('passenger hands show skin/glove choices and weapon/wrench switches release old geometry', () => {
  const engine = new NullEngine(), scene = new Scene(engine), rig = new CameraRig(scene);
  scene.activeCamera = rig.camera;
  const hands = new VehicleHands(scene, rig.camera), profile = createDefaultProfile('Passenger');
  try {
    const fingerprints = new Set<string>();
    for (const hand of HANDS_IDS) {
      profile.cosmetics.hands = hand;
      hands.update(1 / 60, profile, 'smg', false, false);
      const arms = hands.root.getChildMeshes().find(m => m.name === 'passenger-forearms-and-fingers')!;
      const hash = new Bun.CryptoHasher('sha256');
      hash.update(Float32Array.from(arms.getVerticesData('position')!));
      hash.update(Float32Array.from(arms.getVerticesData('color')!));
      fingerprints.add(hash.digest('hex'));
      expect(arms.getTotalIndices() / 3).toBeLessThan(6000);
    }
    expect(fingerprints.size).toBe(HANDS_IDS.length);
    profile.cosmetics.hands = 'hands_bare';
    const skins = new Set<string>();
    for (const index of [0, SKIN_TONES.length - 1]) {
      profile.cosmetics.skinToneIndex = index;
      hands.update(1 / 60, profile, 'smg', false, false);
      const arms = hands.root.getChildMeshes().find(m => m.name === 'passenger-forearms-and-fingers')!;
      skins.add(new Bun.CryptoHasher('sha256').update(Float32Array.from(arms.getVerticesData('color')!)).digest('hex'));
    }
    expect(skins.size).toBe(2);
    for (let i = 0; i < 30; i++) {
      hands.update(1 / 60, profile, i % 2 ? 'smg' : 'snow_cannon', i % 3 === 0, false);
      expect(scene.meshes.length).toBeLessThan(8);
      expect(scene.materials.length).toBeLessThan(4);
    }
    hands.update(1 / 60, profile, 'smg', true, false);
    expect(hands.root.getChildMeshes().some(m => m.name === 'repair-wrench')).toBe(true);
    hands.hide(); expect(hands.root.isEnabled()).toBe(false);
    hands.dispose(); expect(scene.meshes).toHaveLength(0);
  } finally { scene.dispose(); engine.dispose(); }
});
