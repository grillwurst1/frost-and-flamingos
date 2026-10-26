/**
 * Regressions for the second 4V review round: decks under the bow, rams
 * against a victim backed by a wall, players touching (not inside) hulls,
 * pinning against rock, rim riders, stern-first beaching and ram credit.
 */
import { describe, expect, test } from 'bun:test';
import { FjordLayout, VEHICLES, sampleMapHeight, vehicleLocalToWorld, type Vec3 } from '@frost-and-flamingos/shared';
import type { MatchRoom } from '../src/rooms/match-room';
import { InputButton, createRoom, internals, joinPlayer, parkVehicle, placePlayer, playerOf, run, sendInput, slotBySpawn, tap } from './vehicle-helpers';

const { GLACIER_RUNWAY } = FjordLayout;
const RUNWAY_YAW = Math.atan2(GLACIER_RUNWAY.end.x - GLACIER_RUNWAY.start.x, GLACIER_RUNWAY.end.z - GLACIER_RUNWAY.start.z);
const W = InputButton.Forward;

function report(label: string, values: Record<string, unknown>): void {
  console.log(`[review2] ${label} ${JSON.stringify(values)}`);
}

function feetOf(room: MatchRoom, id: number): Vec3 {
  return (playerOf(room, id).character as unknown as { position: Vec3 }).position;
}

describe('vehicle review fixes, round 2', () => {
  test('R1: sidecar and coconut tank cross the harbour pier to Tower A (decks hold the bow up)', async () => {
    const results: Record<string, number> = {};
    for (const spawn of ['sidecar_lagoon_base', 'coconut_tank_base'] as const) {
      const room = await createRoom();
      const slot = slotBySpawn(spawn);
      const driver = joinPlayer(room, 'lagoon');
      room.vehicles.devEnter(playerOf(room, driver.id) as never, slot.id, 0);
      const body = room.vehicles.vehicleBody(slot.id);
      if (!body) throw new Error('no vehicle');
      // Beach end of pier_e, heading west along the deck.
      parkVehicle(room, slot.id, -158, -185, -Math.PI / 2);
      const start = body.position;
      run(room, 60 * 5, () => sendInput(room, driver, W, body.yaw));
      results[spawn] = Math.round(Math.hypot(body.position.x - start.x, body.position.z - start.z) * 10) / 10;
      expect(body.drowned).toBe(false);
      expect(results[spawn] ?? 0).toBeGreaterThan(20);
      room.stop();
    }
    report('pier crossing', results);
  });

  test('R2: a victim with the back to a wall is still rammed', async () => {
    const room = await createRoom();
    const slot = slotBySpawn('sidecar_village_east');
    const driver = joinPlayer(room, 'alpine');
    room.vehicles.devEnter(playerOf(room, driver.id) as never, slot.id, 0);
    const body = room.vehicles.vehicleBody(slot.id);
    if (!body) throw new Error('no sidecar');
    parkVehicle(room, slot.id, 28, -25, Math.PI / 2);
    const victim = joinPlayer(room, 'lagoon', 'heavy');
    placePlayer(room, victim.id, { x: 44.57, y: sampleMapHeight(44.57, -25.2) + 0.05, z: -25.2 });
    const hp = playerOf(room, victim.id).hp;
    let top = 0;
    run(room, 150, () => {
      sendInput(room, driver, W, body.yaw);
      sendInput(room, victim, 0);
      top = Math.max(top, body.forwardSpeed);
    });
    const rams = driver.socket.eventsOf('PINBALL_BOING_HIT').filter((event) => event.targetId === victim.id && event.paramValue > 0).length;
    report('wall-backed ram', { top: Math.round(top * 10) / 10, rams, damage: Math.round(hp - playerOf(room, victim.id).hp) });
    expect(rams).toBe(1);
    expect(hp - playerOf(room, victim.id).hp).toBeGreaterThanOrEqual(VEHICLES.sidecar.ram.minDamage);
    room.stop();
  });

  test('R3: a friend merely touching a crewed hull in a gap stays put', async () => {
    const room = await createRoom();
    const slot = slotBySpawn('sidecar_village_east');
    const driver = joinPlayer(room, 'alpine');
    room.vehicles.devEnter(playerOf(room, driver.id) as never, slot.id, 0);
    const body = room.vehicles.vehicleBody(slot.id);
    if (!body) throw new Error('no sidecar');
    // Its +x side 1 m from the village wall's inner face (x 45.05).
    parkVehicle(room, slot.id, 45.05 - 1 - VEHICLES.sidecar.halfExtents.x, -20, 0);
    const friend = joinPlayer(room, 'alpine');
    placePlayer(room, friend.id, { x: 44.55, y: sampleMapHeight(44.55, -20) + 0.05, z: -20 });
    run(room, 20, () => {
      sendInput(room, driver, 0, body.yaw);
      sendInput(room, friend, 0);
    });
    const settled = { ...feetOf(room, friend.id) };
    run(room, 60 * 3, () => {
      sendInput(room, driver, 0, body.yaw);
      sendInput(room, friend, 0);
    });
    const moved = Math.hypot(feetOf(room, friend.id).x - settled.x, feetOf(room, friend.id).z - settled.z);
    report('touching friend', { moved: Math.round(moved * 100) / 100 });
    expect(moved).toBeLessThan(0.5);
    room.stop();
  });

  test('1: a friend pinned against a steep rock face is never put under the terrain', async () => {
    const room = await createRoom();
    const slot = slotBySpawn('crawler_base');
    const driver = joinPlayer(room, 'alpine');
    room.vehicles.devEnter(playerOf(room, driver.id) as never, slot.id, 0);
    const body = room.vehicles.vehicleBody(slot.id);
    if (!body) throw new Error('no crawler');
    const uphill = 1.07;
    parkVehicle(room, slot.id, 228 - Math.sin(uphill) * 12, 40 - Math.cos(uphill) * 12, uphill);
    // Drive up to the face, then put the friend between the bow and the rock.
    run(room, 60 * 4, () => sendInput(room, driver, body.forwardSpeed < 1.3 ? W : 0, body.yaw));
    const friend = joinPlayer(room, 'alpine');
    const bow = vehicleLocalToWorld(body.position, body.yaw, { x: 0, y: 0, z: VEHICLES.fondue_crawler.halfExtents.z + 0.5 });
    placePlayer(room, friend.id, { x: bow.x, y: Math.max(body.position.y, sampleMapHeight(bow.x, bow.z)) + 0.05, z: bow.z });
    let under = 0;
    let jumps = 0;
    let last = { ...feetOf(room, friend.id) };
    run(room, 60 * 5, () => {
      sendInput(room, driver, body.forwardSpeed < 1.3 ? W : 0, body.yaw);
      sendInput(room, friend, 0);
      const feet = feetOf(room, friend.id);
      if (feet.y < sampleMapHeight(feet.x, feet.z) - 0.3) under += 1;
      if (Math.hypot(feet.x - last.x, feet.z - last.z) > 20) jumps += 1;
      last = { ...feet };
    });
    report('pinned at a rock face', { ticksUnderTerrain: under, respawnJumps: jumps });
    expect(under).toBe(0);
    expect(jumps).toBe(0);
    room.stop();
  });

  test('0+8: riders on the rim band past the roof edge are left alone by an idle crewed hull', async () => {
    const room = await createRoom();
    const slot = slotBySpawn('crawler_base');
    const driver = joinPlayer(room, 'alpine');
    room.vehicles.devEnter(playerOf(room, driver.id) as never, slot.id, 0);
    const body = room.vehicles.vehicleBody(slot.id);
    if (!body) throw new Error('no crawler');
    parkVehicle(room, slot.id, 288, 140, RUNWAY_YAW);
    const rider = joinPlayer(room, 'lagoon');
    const half = VEHICLES.fondue_crawler.halfExtents;
    const rim = vehicleLocalToWorld(body.position, body.yaw, { x: half.x + 0.2, y: 0, z: 0.5 });
    placePlayer(room, rider.id, { x: rim.x, y: body.position.y + half.y * 2 + 0.03, z: rim.z });
    const hp = playerOf(room, rider.id).hp;
    run(room, 120, () => {
      sendInput(room, driver, 0, body.yaw);
      sendInput(room, rider, 0);
    });
    const boings = driver.socket.eventsOf('PINBALL_BOING_HIT').filter((event) => event.targetId === rider.id).length;
    report('rim rider', { boings, hpLost: hp - playerOf(room, rider.id).hp });
    expect(boings).toBe(0);
    expect(playerOf(room, rider.id).hp).toBe(hp);
    room.stop();
  });

  test('2: a flamingo reversed stern-first onto the beach drives off forward', async () => {
    const room = await createRoom();
    const slot = slotBySpawn('flamingo_east_beach');
    const pilot = joinPlayer(room, 'lagoon');
    room.vehicles.devEnter(playerOf(room, pilot.id) as never, slot.id, 0);
    const body = room.vehicles.vehicleBody(slot.id);
    if (!body) throw new Error('no flamingo');
    // Facing south, backing north into the east beach.
    parkVehicle(room, slot.id, 60, -230, Math.PI);
    let ticks = 0;
    while (!body.beached && ticks < 60 * 30) {
      sendInput(room, pilot, InputButton.Backward, Math.PI);
      internals(room).tick();
      ticks += 1;
    }
    run(room, 60, () => sendInput(room, pilot, InputButton.Backward, Math.PI));
    const stranded = body.position;
    const wasBeached = body.beached;
    run(room, 60 * 3, () => sendInput(room, pilot, W, Math.PI));
    const moved = Math.hypot(body.position.x - stranded.x, body.position.z - stranded.z);
    report('stern-first beaching', { wasBeached, drivenOff: Math.round(moved * 10) / 10, afloat: body.afloat });
    expect(wasBeached).toBe(true);
    expect(body.afloat).toBe(true);
    room.stop();
  });

  test('4: switching seats keeps the ram credit; a disconnected driver gives none', async () => {
    const room = await createRoom();
    const slot = slotBySpawn('sidecar_alpine_base');
    const driver = joinPlayer(room, 'alpine');
    room.vehicles.devEnter(playerOf(room, driver.id) as never, slot.id, 0);
    const body = room.vehicles.vehicleBody(slot.id);
    if (!body) throw new Error('no sidecar');
    parkVehicle(room, slot.id, 288, 104, RUNWAY_YAW);
    run(room, 150, () => sendInput(room, driver, W, body.yaw));
    // The driver slides over to the tub with C: the coasting hull still rams for them.
    tap(room, driver, InputButton.Crouch, body.yaw);
    expect(room.vehicles.seatFor(driver.id)?.seat).toBe(1);
    const victim = joinPlayer(room, 'lagoon', 'heavy');
    const ahead = vehicleLocalToWorld(body.position, body.yaw, { x: 0.3, y: 0, z: 1.3 + 3 });
    placePlayer(room, victim.id, { x: ahead.x, y: sampleMapHeight(ahead.x, ahead.z) + 0.05, z: ahead.z });
    run(room, 30, () => sendInput(room, victim, 0));
    const credited = driver.socket.eventsOf('PINBALL_BOING_HIT').filter((event) => event.targetId === victim.id && event.paramValue > 0);

    const room2 = await createRoom();
    const driver2 = joinPlayer(room2, 'alpine');
    room2.vehicles.devEnter(playerOf(room2, driver2.id) as never, slot.id, 0);
    const body2 = room2.vehicles.vehicleBody(slot.id);
    if (!body2) throw new Error('no sidecar');
    parkVehicle(room2, slot.id, 288, 104, RUNWAY_YAW);
    run(room2, 150, () => sendInput(room2, driver2, W, body2.yaw));
    tap(room2, driver2, InputButton.Interact, body2.yaw);
    room2.leaveBySocket(driver2.socket);
    const victim2 = joinPlayer(room2, 'lagoon', 'heavy');
    const ahead2 = vehicleLocalToWorld(body2.position, body2.yaw, { x: 0.3, y: 0, z: 1.3 + 3 });
    placePlayer(room2, victim2.id, { x: ahead2.x, y: sampleMapHeight(ahead2.x, ahead2.z) + 0.05, z: ahead2.z });
    const hp2 = playerOf(room2, victim2.id).hp;
    run(room2, 30, () => sendInput(room2, victim2, 0));
    report('ram credit', { creditedAfterSeatSwitch: credited.length === 1 && credited[0]?.actorId === driver.id, damageAfterDisconnect: hp2 - playerOf(room2, victim2.id).hp });
    expect(credited.length).toBe(1);
    expect(credited[0]?.actorId).toBe(driver.id);
    expect(playerOf(room2, victim2.id).hp).toBe(hp2);
    room.stop();
    room2.stop();
  });
});
