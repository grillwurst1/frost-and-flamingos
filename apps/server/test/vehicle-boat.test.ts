import { describe, expect, test } from 'bun:test';
import {
  BOAT_DRAFT,
  PHYSICS_TICK_RATE,
  VEHICLES,
  VEHICLE_BEACHED_SECONDS,
  WATER_LEVEL,
  WEAPON_TABLE,
  sampleMapHeight,
  vehicleLocalToWorld,
  vehicleTicks,
} from '@frost-and-flamingos/shared';
import { InputButton, createRoom, joinPlayer, parkVehicle, placePlayer, playerOf, run, sendInput, slotByKind, slotBySpawn, tap } from './vehicle-helpers';

const W = InputButton.Forward;

/** Nearest shore direction from a water point: yaw and distance to ground above the surface. */
function nearestShore(x: number, z: number): { yaw: number; distance: number } {
  let best = { yaw: 0, distance: Number.POSITIVE_INFINITY };
  for (let step = 0; step < 32; step += 1) {
    const yaw = (step / 32) * Math.PI * 2;
    for (let d = 4; d < 160; d += 2) {
      if (sampleMapHeight(x + Math.sin(yaw) * d, z + Math.cos(yaw) * d) > 0.4) {
        // A real beach: the ground keeps rising behind the waterline (no sand bar).
        const inland = [10, 20, 30].every((extra) => sampleMapHeight(x + Math.sin(yaw) * (d + extra), z + Math.cos(yaw) * (d + extra)) > 0.6);
        if (inland && d < best.distance) best = { yaw, distance: d };
        break;
      }
    }
  }
  return best;
}

describe('tactical badi-flamingo', () => {
  test('floats at the waterline and the pilot reaches 12 m/s, plug turbo 2.5x with its cooldown', async () => {
    const room = await createRoom();
    const slot = slotByKind('badi_flamingo');
    const pilot = joinPlayer(room, 'lagoon');
    room.vehicles.devEnter(playerOf(room, pilot.id) as never, slot.id, 0);
    const body = room.vehicles.vehicleBody(slot.id);
    if (!body) throw new Error('no flamingo');
    // Open sea south of the island base: 400 m of deep water heading east
    // (the turbo slides a flamingo far up any beach it reaches).
    parkVehicle(room, slot.id, -230, -360, Math.PI / 2);
    expect(body.afloat).toBe(true);
    expect(body.position.y).toBeCloseTo(WATER_LEVEL - BOAT_DRAFT, 5);
    run(room, 180, () => sendInput(room, pilot, W, body.yaw));
    expect(body.forwardSpeed).toBeGreaterThan(11.5);
    expect(body.forwardSpeed).toBeLessThanOrEqual(12.01);
    expect(body.position.y).toBeCloseTo(WATER_LEVEL - BOAT_DRAFT, 5);
    // Plug turbo.
    sendInput(room, pilot, W | InputButton.Sprint, body.yaw);
    run(room, 1);
    expect(pilot.socket.eventsOf('FLAMINGO_BOOST').length).toBe(1);
    run(room, 70, () => sendInput(room, pilot, W | InputButton.Sprint, body.yaw));
    expect(body.forwardSpeed).toBeGreaterThan(26);
    expect(body.boosting).toBe(true);
    run(room, 100, () => sendInput(room, pilot, W, body.yaw));
    expect(body.boosting).toBe(false);
    // Still cooling down: a second press does nothing.
    tap(room, pilot, W | InputButton.Sprint, body.yaw);
    expect(pilot.socket.eventsOf('FLAMINGO_BOOST').length).toBe(1);
    run(room, vehicleTicks(VEHICLES.badi_flamingo.boost?.cooldownSeconds ?? 7), () => sendInput(room, pilot, 0, body.yaw));
    expect(body.afloat).toBe(true);
    tap(room, pilot, W | InputButton.Sprint, body.yaw);
    expect(pilot.socket.eventsOf('FLAMINGO_BOOST').length).toBe(2);
    room.stop();
  });

  test('stays on the water: running onto the beach strands it (no thrust) close to the shore', async () => {
    const room = await createRoom();
    const slot = slotBySpawn('flamingo_east_beach');
    const pilot = joinPlayer(room, 'lagoon');
    room.vehicles.devEnter(playerOf(room, pilot.id) as never, slot.id, 0);
    const body = room.vehicles.vehicleBody(slot.id);
    if (!body) throw new Error('no flamingo');
    const start = { x: 60, z: -210 };
    const shore = nearestShore(start.x, start.z);
    expect(shore.distance).toBeLessThan(150);
    parkVehicle(room, slot.id, start.x, start.z, shore.yaw);
    let maxY = body.position.y;
    let beachedAt: { x: number; z: number } | null = null;
    run(room, 60 * 25, (tick) => {
      // Full turbo whenever it is ready.
      sendInput(room, pilot, W | (tick % 2 === 0 ? InputButton.Sprint : 0), shore.yaw);
      maxY = Math.max(maxY, body.position.y);
      if (body.beached && !beachedAt) beachedAt = { x: body.position.x, z: body.position.z };
    });
    expect(beachedAt).not.toBeNull();
    expect(body.beached).toBe(true);
    // Stuck: throttle no longer moves it.
    const stuck = body.position;
    run(room, 120, () => sendInput(room, pilot, W, shore.yaw));
    expect(Math.hypot(body.position.x - stuck.x, body.position.z - stuck.z)).toBeLessThan(0.3);
    // It never climbs far up the beach.
    const ground = sampleMapHeight(body.position.x, body.position.z);
    expect(ground).toBeLessThan(2.5);
    expect(maxY).toBeLessThan(2.5);
    room.stop();
  });

  test('the gunner works the harpoon gun; an empty beached flamingo deflates and respawns', async () => {
    const room = await createRoom();
    const slot = slotByKind('badi_flamingo');
    const pilot = joinPlayer(room, 'lagoon');
    const gunner = joinPlayer(room, 'lagoon', 'infiltrator');
    room.vehicles.devEnter(playerOf(room, pilot.id) as never, slot.id, 0);
    room.vehicles.devEnter(playerOf(room, gunner.id) as never, slot.id, 1);
    const body = room.vehicles.vehicleBody(slot.id);
    if (!body) throw new Error('no flamingo');
    parkVehicle(room, slot.id, -330, -200, 0);
    // The pilot's trigger does nothing; the gunner's fires harpoons.
    run(room, 20, () => sendInput(room, pilot, InputButton.FirePrimary, 0));
    expect(pilot.socket.eventsOf('TANK_CANNON_FIRE').length).toBe(0);
    // A swimming alpine target ahead of the neck.
    const target = joinPlayer(room, 'alpine');
    const ahead = vehicleLocalToWorld(body.position, body.yaw, { x: 0.3, y: 0, z: 14 });
    placePlayer(room, target.id, { x: ahead.x, y: WATER_LEVEL - 1.1, z: ahead.z });
    run(room, 30, () => {
      sendInput(room, pilot, 0, 0);
      sendInput(room, target, 0);
      sendInput(room, gunner, 0, 0, -0.04);
    });
    const hp = playerOf(room, target.id).hp;
    run(room, 60, () => {
      sendInput(room, pilot, 0, 0);
      sendInput(room, target, 0);
      sendInput(room, gunner, InputButton.FirePrimary, 0, -0.04);
    });
    const shots = gunner.socket.eventsOf('TANK_CANNON_FIRE');
    expect(shots.length).toBeGreaterThanOrEqual(3);
    expect(WEAPON_TABLE.byCode[shots[0]?.paramValue ?? -1]).toBe('harpoon_gun');
    expect(playerOf(room, target.id).hp).toBeLessThan(hp);

    // Leave the flamingo on a beach (the east bay, away from the other boats):
    // it deflates after 10 s and returns 20 s later.
    tap(room, pilot, InputButton.Interact);
    tap(room, gunner, InputButton.Interact);
    expect(room.vehicles.seatFor(pilot.id)).toBeNull();
    const beach = { x: 40, z: -195 };
    const shore = nearestShore(beach.x, beach.z);
    const sand = { x: beach.x + Math.sin(shore.yaw) * (shore.distance + 2), z: beach.z + Math.cos(shore.yaw) * (shore.distance + 2) };
    body.teleport({ x: sand.x, y: sampleMapHeight(sand.x, sand.z), z: sand.z }, shore.yaw);
    run(room, 2);
    expect(body.beached).toBe(true);
    run(room, vehicleTicks(VEHICLE_BEACHED_SECONDS) + PHYSICS_TICK_RATE);
    expect(room.vehicles.lifecycleOf(slot.id)).toBe('wreck');
    expect(pilot.socket.eventsOf('VEHICLE_DESTROYED').at(-1)?.actorId).toBe(0);
    run(room, vehicleTicks(VEHICLES.badi_flamingo.respawnSeconds) + PHYSICS_TICK_RATE);
    expect(room.vehicles.lifecycleOf(slot.id)).toBe('active');
    const respawned = room.vehicles.vehicleBody(slot.id);
    expect(respawned?.afloat).toBe(true);
    room.stop();
  });

  test('a fast flamingo BOINGs an enemy swimmer', async () => {
    const room = await createRoom();
    const slot = slotByKind('badi_flamingo');
    const pilot = joinPlayer(room, 'lagoon');
    room.vehicles.devEnter(playerOf(room, pilot.id) as never, slot.id, 0);
    const body = room.vehicles.vehicleBody(slot.id);
    if (!body) throw new Error('no flamingo');
    parkVehicle(room, slot.id, -330, -200, 0);
    run(room, 150, () => sendInput(room, pilot, W, 0));
    const victim = joinPlayer(room, 'alpine');
    const ahead = vehicleLocalToWorld(body.position, body.yaw, { x: 0, y: 0, z: 1.5 + 6 });
    placePlayer(room, victim.id, { x: ahead.x, y: WATER_LEVEL - 1.1, z: ahead.z });
    const hp = playerOf(room, victim.id).hp;
    run(room, 60, () => {
      sendInput(room, pilot, W, 0);
      sendInput(room, victim, 0);
    });
    const boing = pilot.socket.eventsOf('PINBALL_BOING_HIT').filter((event) => event.targetId === victim.id && event.paramValue > 0);
    expect(boing.length).toBe(1);
    const damage = hp - playerOf(room, victim.id).hp;
    expect(damage).toBeGreaterThanOrEqual(65);
    expect(damage).toBeLessThanOrEqual(110);
    room.stop();
  });
});
