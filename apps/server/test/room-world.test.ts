import { expect, test } from 'bun:test';
import { DRIFTER_TUNING, FJORD_MAP, InputButton, PhysicsWorld, sampleCableCar, CABLE_CAR_RULES, type CableCarRoute, type PlayerInput, type StaticWorldDefinition } from '@frost-and-flamingos/shared';
import { makeRoute } from '../../../packages/shared/src/config/map/math';
import { sampleHeightfield } from '../../../packages/shared/src/config/map/heightfield';
const idle: PlayerInput = { sequence: 1, buttons: 0, yaw: 0, pitch: 0, weaponSlot: 1 };
function plane(height: number, surface: 'snow' | 'water'): StaticWorldDefinition {
  return { size: 64, segments: 32, heights: new Float32Array(33 * 33).fill(height), props: [], heightAt: () => height, surfaceAt: () => surface };
}
test('a non-planar room grid samples the same triangles as the actual Rapier collider', async () => {
  const grid = { size: 8, segments: 1, heights: new Float32Array([0, 2, 4, 9]) };
  const source: StaticWorldDefinition = { ...grid, props: [], heightAt: (x, z) => sampleHeightfield(grid, x, z), surfaceAt: () => 'rock_cliff' };
  const world = await PhysicsWorld.create([], source);
  try {
    for (const [x, z] of [[-2, -2], [2, 2], [-.8, 2.8], [2.8, -.8]]) {
      const ray = world.raycast({ x: x!, y: 15, z: z! }, { x: 0, y: -1, z: 0 }, 20);
      expect(ray).not.toBeNull();
      expect(ray!.point.y).toBeCloseTo(source.heightAt(x!, z!), 4);
    }
  }
  finally {
    world.dispose();
  }
});
test('a room uses its own terrain, solid props, surface query and bounds for the shared human motor', async () => {
  const source: StaticWorldDefinition = { ...plane(3, 'snow'), props: [{ id: 'local-cover', kind: 'crate_stack', position: { x: 8, y: 3, z: 6 }, rotationY: 0, scale: 1, variant: 0,
        colliders: [{ type: 'box', halfExtents: { x: 1, y: 1, z: 1 }, offset: { x: 0, y: 1, z: 0 }, surface: 'wood' }] }] };
  const world = await PhysicsWorld.create([], source);
  try {
    const ray = world.raycast({ x: 8, y: 9, z: 6 }, { x: 0, y: -1, z: 0 }, 10);
    expect(ray?.point.y).toBeCloseTo(5, 4);
    const player = world.createCharacter({ position: { x: 0, y: 5, z: 0 }, classId: 'allrounder', faction: 'alpine' });
    for (let f = 0; f < 120; f++) {
      player.simulate(idle);
      world.step();
    }
    expect(player.position.y).toBeCloseTo(3, 1);
    expect(player.surfaceTag).toBe('snow');
    for (let f = 0; f < 600; f++) {
      player.simulate({ ...idle, buttons: InputButton.Right });
      world.step();
    }
    // No inherited Fjord building blocks the local plane; the local 32 m edge does.
    expect(player.position.x).toBeGreaterThan(30);
    expect(player.position.x).toBeLessThan(32);
    expect(player.position.y).toBeGreaterThan(2.9);
  }
  finally {
    world.dispose();
  }
});
test('the drifter hovers over the room ocean instead of the unrelated Fjord ground', async () => {
  const world = await PhysicsWorld.create([], plane(-6, 'water'));
  try {
    const player = world.createCharacter({ position: { x: 0, y: 2, z: 0 }, classId: 'drifter', faction: 'alpine' });
    for (let f = 0; f < 180; f++) {
      player.simulate(idle);
      world.step();
    }
    expect(player.position.y).toBeGreaterThanOrEqual(DRIFTER_TUNING.waterHoverHeight - .1);
    expect(player.position.y).toBeLessThan(DRIFTER_TUNING.waterHoverHeight + .2);
  }
  finally {
    world.dispose();
  }
});
test('the same boat motor floats and drives on the room ocean without using the field coastline', async () => {
  const world = await PhysicsWorld.create([], plane(-6, 'water'));
  try {
    const boat = world.createVehicle('badi_flamingo', { x: 0, y: 0, z: 0 }, 0);
    for (let f = 0; f < 180; f++) {
      boat.simulate({ ...idle, buttons: InputButton.Forward }, null);
      world.step();
    }
    expect(boat.afloat).toBe(true);
    expect(boat.beached).toBe(false);
    expect(boat.position.z).toBeGreaterThan(3);
    expect(Math.abs(boat.position.y)).toBeLessThan(1);
  }
  finally {
    world.dispose();
  }
});
test('a room cable car follows and brakes on its own route while the field route remains unchanged', async () => {
  const path = makeRoute('local-gondola', [{ x: -15, y: 5, z: 10 }, { x: 0, y: 10, z: 12 }, { x: 15, y: 6, z: 10 }]);
  const route: CableCarRoute = { ...FJORD_MAP.routes.cableCar, gondolaPath: path, legSeconds: 1,
    stations: FJORD_MAP.routes.cableCar.stations.map((station, i) => ({ ...station, platform: path.points[i]!, brakeBase: path.points[i]!, brakeLever: path.points[i]!, pathDistance: path.distances[i]! })) };
  const fieldStart = sampleCableCar(0, 0), world = await PhysicsWorld.create([], { ...plane(-6, 'water'), cableCar: route });
  try {
    const cabin = world.createVehicle('cable_car', sampleCableCar(0, 0, route).position, 0);
    const ticks = CABLE_CAR_RULES.stopSeconds * 60 + 30;
    for (let f = 0; f < ticks; f++) {
      cabin.simulate(null, null);
      world.step();
    }
    const expected = sampleCableCar(ticks, 0, route).position;
    expect(cabin.position.x).toBeCloseTo(expected.x, 5);
    expect(cabin.position.y).toBeCloseTo(expected.y, 5);
    const stopped = { ...cabin.position };
    cabin.brakeCableCar();
    for (let f = 0; f < 60; f++) {
      cabin.simulate(null, null);
      world.step();
    }
    expect(cabin.position).toEqual(stopped);
    expect(sampleCableCar(0, 0)).toEqual(fieldStart);
  }
  finally {
    world.dispose();
  }
});
