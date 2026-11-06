import { expect, test } from 'bun:test';
import { ARENA_ACCESS_FLIGHTS, ARENA_CABLE, InputButton, PhysicsWorld, REFERENCE_WORLD, type PlayerInput } from '@frost-and-flamingos/shared';
import { MatchRoom } from '../src/rooms/match-room';
import { joinPlayer, placePlayer, playerOf, run, tap } from './vehicle-helpers';
const idle: PlayerInput = { sequence: 1, buttons: 0, yaw: 0, pitch: 0, weaponSlot: 1 };
for (const flight of ARENA_ACCESS_FLIGHTS)
  test(`the actual ${flight.id} staircase climbs and descends without a gap`, async () => {
    const world = await PhysicsWorld.create([], REFERENCE_WORLD);
    try {
      const human = world.createCharacter({ position: { ...flight.to, y: flight.to.y + .06 }, classId: 'allrounder', faction: 'alpine' });
      const walk = (goal: typeof flight.from | typeof flight.to) => {
        for (let tick = 0; tick < 1400; tick++) {
          const p = human.position, distance = Math.hypot(p.x - goal.x, p.z - goal.z);
          if (distance < .35)
            break;
          if (tick % 20 === 0) {
            const dx = flight.to.x - flight.from.x, dz = flight.to.z - flight.from.z;
            const t = ((p.x - flight.from.x) * dx + (p.z - flight.from.z) * dz) / (dx * dx + dz * dz);
            if (t > 0 && t < 1)
              expect(p.y).toBeGreaterThan(flight.from.y + (flight.to.y - flight.from.y) * t - .3);
          }
          human.simulate({ ...idle, buttons: InputButton.Forward | (distance < 2 ? InputButton.Crouch : 0), yaw: Math.atan2(goal.x - p.x, goal.z - p.z) });
          world.step();
        }
        for (let tick = 0; tick < 30; tick++) {
          human.simulate(idle);
          world.step();
        }
        expect(Math.hypot(human.position.x - goal.x, human.position.z - goal.z)).toBeLessThan(.6);
        expect(Math.abs(human.position.y - goal.y)).toBeLessThan(.3);
      };
      walk(flight.from);
      walk(flight.to);
    }
    finally {
      world.dispose();
    }
  });
for (const station of ARENA_CABLE.stations)
  test(`compact ${station.id} station boards and exits through ordinary F`, async () => {
    const room = await MatchRoom.create({ reference: true, bots: 0, critters: false });
    try {
      const human = joinPlayer(room, 'alpine');
      let found = false;
      for (let tick = 0; tick < 1300; tick++) {
        found = [100, 101].some(id => { const cabin = room.vehicles.vehicleBody(id)!; return Math.hypot(cabin.position.x - station.platform.x, cabin.position.z - station.platform.z) < 2.3 && Math.abs(cabin.position.y - station.platform.y) < .2 && cabin.speed < .05; });
        if (found)
          break;
        run(room, 1);
      }
      expect(found).toBe(true);
      placePlayer(room, human.id, { ...station.platform, y: station.platform.y + .05 });
      tap(room, human, InputButton.Interact);
      expect([100, 101]).toContain(room.vehicles.seatFor(human.id)?.vehicleId ?? -1);
      tap(room, human, InputButton.Interact);
      expect(room.vehicles.seatFor(human.id)).toBeNull();
      run(room, 30);
      expect(Math.abs(playerOf(room, human.id).character.position.y - station.platform.y)).toBeLessThan(.15);
      expect(playerOf(room, human.id).alive).toBe(true);
    }
    finally {
      room.stop();
    }
  });
test('compact emergency lever brakes both moving cabins and releases on the same authoritative clock', async () => {
  const room = await MatchRoom.create({ reference: true, bots: 0, critters: false });
  try {
    const human = joinPlayer(room, 'alpine');
    run(room, 650);
    const station = ARENA_CABLE.stations[0]!, p = station.brakeLever;
    placePlayer(room, human.id, { x: p.x, y: station.platform.y + .05, z: p.z + .6 });
    const before = [100, 101].map(id => ({ ...room.vehicles.vehicleBody(id)!.position }));
    tap(room, human, InputButton.Interact);
    expect(human.socket.eventsOf('GONDOLA_BRAKE')).toHaveLength(2);
    run(room, 60);
    expect([100, 101].map(id => room.vehicles.vehicleBody(id)!.position)).toEqual(before);
    run(room, 90);
    expect(room.vehicles.vehicleBody(100)!.position).not.toEqual(before[0]);
  }
  finally {
    room.stop();
  }
});
test('foreground guardrail physically stops a human before the ravine', async () => {
  const world = await PhysicsWorld.create([], REFERENCE_WORLD);
  try {
    const body = world.createCharacter({ position: { x: 0, y: 23.05, z: -20 }, classId: 'allrounder', faction: 'alpine' });
    for (let tick = 0; tick < 240; tick++) {
      body.simulate({ ...idle, buttons: InputButton.Forward });
      world.step();
    }
    expect(body.position.z).toBeLessThan(-18);
    expect(body.position.z).toBeGreaterThan(-19);
    expect(body.position.y).toBeGreaterThan(22.9);
  }
  finally {
    world.dispose();
  }
});
