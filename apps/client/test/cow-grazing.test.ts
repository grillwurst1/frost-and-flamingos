import { expect, test } from 'bun:test';
import { InputButton, PhysicsWorld, sampleMapHeight } from '@frost-and-flamingos/shared';

test('grazing is a networkable pose without shrinking the cow collider or blocking a stomp', async () => {
  const world = await PhysicsWorld.create();
  const cow = world.createCharacter({ position: { x: 222.725, y: sampleMapHeight(222.725,232.725) + .05, z: 232.725 }, classId: 'mascot', faction: 'alpine' });
  try {
    const step = (buttons: number, n: number) => { for (let i = 0; i < n; i++) { cow.simulate({ sequence: i + 1, buttons, yaw: 0, pitch: 0, weaponSlot: 1 }, true); world.step(); } };
    step(0, 120);
    const eye = cow.eyeHeight;
    step(InputButton.Crouch, 30);
    expect(cow.mascotState?.grazing).toBe(true);
    expect(cow.crouched).toBe(false); expect(cow.eyeHeight).toBe(eye);
    step(InputButton.Skill2, 1);
    expect(cow.mascotState?.grazing).not.toBe(true);
    expect(cow.mascotState!.actionSeconds).toBeGreaterThan(0);
    expect([cow.position.x,cow.position.y,cow.position.z].every(Number.isFinite)).toBe(true);
  } finally { world.dispose(); }
});
