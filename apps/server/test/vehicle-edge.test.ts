/**
 * Edge cases of the vehicle lifecycle: exits at speed, on slopes and when
 * boxed in, boarding wrecks, seat races, drivers vanishing mid-drive,
 * stranded boats and the full serpentine tank road. Every test prints its
 * measurements with an `[edge]` prefix.
 */
import RAPIER from '@dimforge/rapier3d-compat';
import { describe, expect, test } from 'bun:test';
import {
  FJORD_MAP,
  FjordLayout,
  VEHICLES,
  VEHICLE_ABANDON_SECONDS,
  VEHICLE_BEACHED_SECONDS,
  WATER_LEVEL,
  BOAT_DRAFT,
  distanceToHull,
  sampleMapHeight,
  vehicleLocalToWorld,
  vehicleTicks,
  type Vec3,
} from '@frost-and-flamingos/shared';
import type { MatchRoom } from '../src/rooms/match-room';
import { InputButton, createRoom, internals, joinPlayer, parkVehicle, placePlayer, playerOf, run, sendInput, slotBySpawn, tap, type TestPlayer } from './vehicle-helpers';

const { GLACIER_RUNWAY, TANK_ROAD_POINTS } = FjordLayout;
const W = InputButton.Forward;
/** The boarding key (F). */
const E = InputButton.Interact;
const F = InputButton.Interact;
const RUNWAY_YAW = Math.atan2(GLACIER_RUNWAY.end.x - GLACIER_RUNWAY.start.x, GLACIER_RUNWAY.end.z - GLACIER_RUNWAY.start.z);

interface Physics {
  world: RAPIER.World;
  isPlayerCollider(handle: number): boolean;
  raycast(origin: Vec3, direction: Vec3, max: number): { point: Vec3 } | null;
}

interface CharacterView {
  position: Vec3;
  standHeight: number;
  swimming: boolean;
  stats: { radius: number };
}

function physicsOf(room: MatchRoom): Physics {
  return (room as unknown as { physics: Physics }).physics;
}

function characterOf(room: MatchRoom, id: number): CharacterView {
  return playerOf(room, id).character as unknown as CharacterView;
}

/** True when the player's standing capsule overlaps any solid world, prop or hull collider. */
function insideGeometry(room: MatchRoom, id: number): boolean {
  const physics = physicsOf(room);
  const character = characterOf(room, id);
  const radius = character.stats.radius - 0.03;
  const height = character.standHeight;
  const shape = new RAPIER.Capsule(Math.max(0.05, height / 2 - radius), radius);
  const feet = character.position;
  const hit = physics.world.intersectionWithShape(
    { x: feet.x, y: feet.y + height / 2 + 0.03, z: feet.z },
    { x: 0, y: 0, z: 0, w: 1 },
    shape,
    RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
    undefined,
    undefined,
    undefined,
    (collider) => !physics.isPlayerCollider(collider.handle),
  );
  return hit !== null;
}

/** Feet height above whatever solid surface is below them. */
function feetClearance(room: MatchRoom, id: number): number {
  const feet = characterOf(room, id).position;
  const hit = physicsOf(room).raycast({ x: feet.x, y: feet.y + 0.5, z: feet.z }, { x: 0, y: -1, z: 0 }, 30);
  return hit ? feet.y - hit.point.y : Number.POSITIVE_INFINITY;
}

function round(value: number, digits = 2): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function report(label: string, values: Record<string, unknown>): void {
  console.log(`[edge] ${label} ${JSON.stringify(values)}`);
}

/** Ticks until an empty hull rests (speed < 0.05 m/s), and the distance it rolled. */
function coastToRest(room: MatchRoom, vehicleId: number, maxTicks: number, each?: () => void): { ticks: number; distance: number } {
  const body = room.vehicles.vehicleBody(vehicleId);
  if (!body) throw new Error('no vehicle');
  const start = body.position;
  let ticks = 0;
  for (; ticks < maxTicks; ticks += 1) {
    each?.();
    internals(room).tick();
    if (body.speed < 0.05) break;
  }
  const end = body.position;
  return { ticks, distance: Math.hypot(end.x - start.x, end.z - start.z) };
}

/** Forward coordinate of a point in a hull's frame. */
function vehicleWorldToLocalZ(body: { position: Vec3; yaw: number }, point: Vec3): number {
  return (point.x - body.position.x) * Math.sin(body.yaw) + (point.z - body.position.z) * Math.cos(body.yaw);
}

function wrap(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

/** Holds W while steering the hull toward `yaw`. */
function driveHeading(room: MatchRoom, driver: TestPlayer, vehicleId: number, yaw: number, ticks: number): void {
  const body = room.vehicles.vehicleBody(vehicleId);
  if (!body) throw new Error('no vehicle');
  run(room, ticks, () => {
    const error = wrap(yaw - body.yaw);
    const steer = error > 0.04 ? InputButton.Right : error < -0.04 ? InputButton.Left : 0;
    sendInput(room, driver, W | steer, body.yaw);
  });
}

describe('vehicle edge cases', () => {
  test('exiting at full speed lands beside the hull, outside geometry, and the empty hull coasts to a stop', async () => {
    for (const spawn of ['crawler_base', 'sidecar_alpine_base'] as const) {
      const room = await createRoom();
      const slot = slotBySpawn(spawn);
      const driver = joinPlayer(room, 'alpine');
      room.vehicles.devEnter(playerOf(room, driver.id) as never, slot.id, 0);
      const body = room.vehicles.vehicleBody(slot.id);
      if (!body) throw new Error('no vehicle');
      parkVehicle(room, slot.id, 290, 100, RUNWAY_YAW);
      run(room, 150, () => sendInput(room, driver, W, body.yaw));
      const speed = body.forwardSpeed;
      const hp = playerOf(room, driver.id).hp;
      sendInput(room, driver, W | F, body.yaw);
      internals(room).tick();
      expect(room.vehicles.seatFor(driver.id)).toBeNull();
      const feet = characterOf(room, driver.id).position;
      const gap = distanceToHull(body.definition, body.position, body.yaw, feet);
      const insideAtExit = insideGeometry(room, driver.id);
      let insideTicks = 0;
      let minGap = gap;
      const coast = coastToRest(room, slot.id, 60 * 15, () => {
        sendInput(room, driver, 0);
        if (insideGeometry(room, driver.id)) insideTicks += 1;
        minGap = Math.min(minGap, distanceToHull(body.definition, body.position, body.yaw, characterOf(room, driver.id).position));
      });
      const rams = driver.socket.eventsOf('PINBALL_BOING_HIT').filter((event) => event.targetId === driver.id).length;
      report(`exit at speed ${slot.kind}`, {
        speed: round(speed),
        exitGapToHull: round(gap),
        minGapWhileCoasting: round(minGap),
        insideAtExit,
        insideTicks,
        hpLost: hp - playerOf(room, driver.id).hp,
        rams,
        feetClearance: round(feetClearance(room, driver.id)),
        coastSeconds: round(coast.ticks / 60),
        coastMetres: round(coast.distance, 1),
      });
      expect(speed).toBeGreaterThan(8);
      expect(insideAtExit).toBe(false);
      expect(insideTicks).toBe(0);
      expect(gap).toBeGreaterThan(0.3);
      expect(playerOf(room, driver.id).hp).toBe(hp);
      expect(rams).toBe(0);
      expect(body.speed).toBeLessThan(0.05);
      room.stop();
    }
    // The flamingo pilot drops into the water beside the hull, at swimming depth.
    const room = await createRoom();
    const slot = slotBySpawn('flamingo_base');
    const pilot = joinPlayer(room, 'lagoon');
    room.vehicles.devEnter(playerOf(room, pilot.id) as never, slot.id, 0);
    const body = room.vehicles.vehicleBody(slot.id);
    if (!body) throw new Error('no flamingo');
    parkVehicle(room, slot.id, -330, -200, 0);
    run(room, 180, () => sendInput(room, pilot, W, body.yaw));
    const speed = body.forwardSpeed;
    sendInput(room, pilot, W | F, body.yaw);
    internals(room).tick();
    const feetY = characterOf(room, pilot.id).position.y;
    const seabed = sampleMapHeight(characterOf(room, pilot.id).position.x, characterOf(room, pilot.id).position.z);
    const insideAtExit = insideGeometry(room, pilot.id);
    run(room, 60, () => sendInput(room, pilot, 0));
    report('exit at speed badi_flamingo', {
      speed: round(speed),
      seabed: round(seabed),
      feetAtExit: round(feetY),
      feetAfter1s: round(characterOf(room, pilot.id).position.y),
      swimming: characterOf(room, pilot.id).swimming,
      insideAtExit,
      gapToHull: round(distanceToHull(body.definition, body.position, body.yaw, characterOf(room, pilot.id).position)),
    });
    expect(insideAtExit).toBe(false);
    expect(feetY).toBeGreaterThan(WATER_LEVEL - 1.6);
    expect(characterOf(room, pilot.id).swimming).toBe(true);
    room.stop();
  });

  test('a tank climbs a 31° snow slope, holds there, and its driver exits onto the slope', async () => {
    const room = await createRoom();
    const slot = slotBySpawn('crawler_base');
    const driver = joinPlayer(room, 'alpine');
    room.vehicles.devEnter(playerOf(room, driver.id) as never, slot.id, 0);
    const body = room.vehicles.vehicleBody(slot.id);
    if (!body) throw new Error('no crawler');
    // A steady ~31° snow slope east of the lower hairpin; uphill = yaw 1.3.
    const uphill = 1.3;
    const foot = { x: 204 - Math.sin(uphill) * 12, z: 80 - Math.cos(uphill) * 12 };
    parkVehicle(room, slot.id, foot.x, foot.z, uphill);
    run(room, 10, () => sendInput(room, driver, 0, uphill));
    const start = body.position;
    let top = 0;
    let minSpeed = Number.POSITIVE_INFINITY;
    run(room, 60 * 5, (tick) => {
      const error = wrap(uphill - body.yaw);
      sendInput(room, driver, W | (error > 0.04 ? InputButton.Right : error < -0.04 ? InputButton.Left : 0), body.yaw);
      top = Math.max(top, body.forwardSpeed);
      if (tick > 120) minSpeed = Math.min(minSpeed, body.forwardSpeed);
    });
    const end = body.position;
    const climbed = end.y - start.y;
    const run2d = Math.hypot(end.x - start.x, end.z - start.z);
    const grade = (Math.atan2(climbed, run2d) * 180) / Math.PI;
    // Throttle released: it coasts to a halt, then holds on the slope.
    const coasting = body.position;
    run(room, 60, () => sendInput(room, driver, 0, body.yaw));
    const coasted = Math.hypot(body.position.x - coasting.x, body.position.z - coasting.z);
    const parked = body.position;
    run(room, 180, () => sendInput(room, driver, 0, body.yaw));
    const slid = Math.hypot(body.position.x - parked.x, body.position.y - parked.y, body.position.z - parked.z);
    tap(room, driver, F, body.yaw);
    const exited = room.vehicles.seatFor(driver.id) === null;
    const insideAtExit = insideGeometry(room, driver.id);
    run(room, 60, () => sendInput(room, driver, 0));
    const clearance = feetClearance(room, driver.id);
    const insideAfter = insideGeometry(room, driver.id);
    report('31° slope crawler', {
      climbedMetres: round(climbed, 1),
      alongMetres: round(run2d, 1),
      climbGradeDeg: round(grade, 1),
      topSpeed: round(top),
      minSpeedOnSlope: round(minSpeed),
      coastedAfterRelease: round(coasted, 2),
      slidWhileParked3s: round(slid, 3),
      exited,
      insideAtExit,
      insideAfter1s: insideAfter,
      feetClearanceAfter1s: round(clearance),
      gapToHull: round(distanceToHull(body.definition, body.position, body.yaw, characterOf(room, driver.id).position)),
    });
    expect(grade).toBeGreaterThan(24);
    expect(climbed).toBeGreaterThan(6);
    expect(slid).toBeLessThan(0.1);
    expect(exited).toBe(true);
    expect(insideAtExit).toBe(false);
    expect(insideAfter).toBe(false);
    expect(clearance).toBeLessThan(0.6);

    // A 44° rock face beyond the 36° slope limit: the tracks stall at its foot.
    room.vehicles.devEnter(playerOf(room, driver.id) as never, slot.id, 0);
    const steep = 1.07;
    const cliffFoot = { x: 228 - Math.sin(steep) * 10, z: 40 - Math.cos(steep) * 10 };
    parkVehicle(room, slot.id, cliffFoot.x, cliffFoot.z, steep);
    run(room, 10, () => sendInput(room, driver, 0, steep));
    const below = body.position;
    let highest = below.y;
    run(room, 60 * 6, () => {
      const error = wrap(steep - body.yaw);
      sendInput(room, driver, W | (error > 0.04 ? InputButton.Right : error < -0.04 ? InputButton.Left : 0), body.yaw);
      highest = Math.max(highest, body.position.y);
    });
    const ground = (x: number, z: number): number => sampleMapHeight(x, z);
    const footGrade = (Math.atan2(ground(228, 40) - ground(cliffFoot.x, cliffFoot.z), 10) * 180) / Math.PI;
    report('44° rock face crawler', {
      faceGradeDeg: round(footGrade, 1),
      climbedMetres: round(highest - below.y, 2),
      endSpeed: round(body.forwardSpeed),
      along: round(Math.hypot(body.position.x - below.x, body.position.z - below.z), 1),
    });
    expect(highest - below.y).toBeLessThan(3);
    room.stop();
  });

  test('exit picks a free side when boxed in, and the roof when every side is blocked', async () => {
    const room = await createRoom();
    const crawler = slotBySpawn('crawler_base');
    const driver = joinPlayer(room, 'alpine');
    room.vehicles.devEnter(playerOf(room, driver.id) as never, crawler.id, 0);
    const body = room.vehicles.vehicleBody(crawler.id);
    if (!body) throw new Error('no crawler');
    const centre = { x: 290, z: 100 };
    parkVehicle(room, crawler.id, centre.x, centre.z, RUNWAY_YAW);
    const place = (spawn: string, local: Vec3, yawOffset: number): void => {
      const world = vehicleLocalToWorld({ x: centre.x, y: 0, z: centre.z }, RUNWAY_YAW, local);
      parkVehicle(room, slotBySpawn(spawn).id, world.x, world.z, RUNWAY_YAW + yawOffset);
    };
    const sideOf = (): number => {
      const local = vehicleLocalToWorld({ x: 0, y: 0, z: 0 }, -body.yaw, {
        x: characterOf(room, driver.id).position.x - body.position.x,
        y: 0,
        z: characterOf(room, driver.id).position.z - body.position.z,
      });
      return local.x;
    };
    // The driver's door (left) is blocked by the coconut tank.
    place('coconut_tank_base', { x: -3.05, y: 0, z: 0 }, 0);
    run(room, 3, () => sendInput(room, driver, 0, body.yaw));
    tap(room, driver, F, body.yaw);
    const leftBlocked = { seated: room.vehicles.seatFor(driver.id) !== null, localX: round(sideOf()), inside: insideGeometry(room, driver.id) };
    expect(leftBlocked.seated).toBe(false);
    expect(leftBlocked.localX).toBeGreaterThan(1.4);
    expect(leftBlocked.inside).toBe(false);

    // Every side blocked (tank left, sidecars right, front and back).
    room.vehicles.devEnter(playerOf(room, driver.id) as never, crawler.id, 0);
    place('sidecar_alpine_base', { x: 2.55, y: 0, z: 0 }, 0);
    place('sidecar_village_east', { x: 0, y: 0, z: 3.6 }, Math.PI / 2);
    place('sidecar_village_west', { x: 0, y: 0, z: -3.6 }, Math.PI / 2);
    run(room, 3, () => sendInput(room, driver, 0, body.yaw));
    tap(room, driver, F, body.yaw);
    const feet = characterOf(room, driver.id).position;
    const boxed = {
      seated: room.vehicles.seatFor(driver.id) !== null,
      feetAboveHullBase: round(feet.y - body.position.y),
      inside: insideGeometry(room, driver.id),
    };
    run(room, 30, () => sendInput(room, driver, 0));
    report('boxed-in exits crawler', { leftBlocked, boxed, roofStandAfter0_5s: round(characterOf(room, driver.id).position.y - body.position.y) });
    expect(boxed.seated).toBe(false);
    expect(boxed.inside).toBe(false);
    expect(boxed.feetAboveHullBase).toBeGreaterThan(VEHICLES.fondue_crawler.halfExtents.y * 2 - 0.05);
    room.stop();
  });

  test('a wreck cannot be boarded; the respawned vehicle can', async () => {
    const room = await createRoom();
    const slot = slotBySpawn('crawler_base');
    const body = room.vehicles.vehicleBody(slot.id);
    if (!body) throw new Error('no crawler');
    const definition = VEHICLES.fondue_crawler;
    const door = vehicleLocalToWorld(body.position, body.yaw, { x: -2.4, y: 0, z: 0.8 });
    const player = joinPlayer(room, 'alpine');
    placePlayer(room, player.id, { x: door.x, y: body.position.y + 0.05, z: door.z });
    run(room, 3, () => sendInput(room, player, 0));
    room.vehicles.devDamage(slot.id, null, definition.maxHp + 10);
    const destroyedAt = internals(room).physicsTick;
    // Same tick and every second of the wreck: E does nothing.
    let boardedWreck = 0;
    for (let second = 0; second < definition.wreckSeconds; second += 1) {
      tap(room, player, E);
      if (room.vehicles.seatFor(player.id)) boardedWreck += 1;
      run(room, 58, () => sendInput(room, player, 0));
    }
    expect(room.vehicles.lifecycleOf(slot.id)).toBe('waiting');
    tap(room, player, E);
    const boardedEmptyPad = room.vehicles.seatFor(player.id) !== null;
    // Wait for the respawn, then board the fresh hull from its door.
    while (room.vehicles.lifecycleOf(slot.id) !== 'active') run(room, 1, () => sendInput(room, player, 0));
    const respawnSeconds = (internals(room).physicsTick - destroyedAt) / 60;
    const fresh = room.vehicles.vehicleBody(slot.id);
    if (!fresh) throw new Error('no respawn');
    const freshDoor = vehicleLocalToWorld(fresh.position, fresh.yaw, { x: -2.4, y: 0, z: 0.8 });
    placePlayer(room, player.id, { x: freshDoor.x, y: fresh.position.y + 0.05, z: freshDoor.z });
    run(room, 3, () => sendInput(room, player, 0));
    tap(room, player, E);
    const seat = room.vehicles.seatFor(player.id);
    report('board a wreck crawler', {
      boardedWreck,
      boardedEmptyPad,
      respawnSeconds: round(respawnSeconds, 2),
      hpAfterRespawn: room.vehicles.vehicleHp(slot.id),
      seatAfterRespawn: seat,
      seatEvents: player.socket.eventsOf('VEHICLE_SEAT').filter((event) => event.actorId === player.id).length,
    });
    expect(boardedWreck).toBe(0);
    expect(boardedEmptyPad).toBe(false);
    expect(respawnSeconds).toBeCloseTo(definition.respawnSeconds, 1);
    expect(seat).toEqual({ vehicleId: slot.id, seat: 0 });
    room.stop();
  });

  test('two players pressing E in the same tick get different seats; an enemy loses the race', async () => {
    const room = await createRoom();
    const slot = slotBySpawn('crawler_base');
    const body = room.vehicles.vehicleBody(slot.id);
    if (!body) throw new Error('no crawler');
    const racers = [joinPlayer(room, 'alpine'), joinPlayer(room, 'alpine'), joinPlayer(room, 'alpine')];
    racers.forEach((racer, index) => {
      const spot = vehicleLocalToWorld(body.position, body.yaw, { x: -2.3, y: 0, z: 0.9 - index * 0.75 });
      placePlayer(room, racer.id, { x: spot.x, y: body.position.y + 0.05, z: spot.z });
    });
    run(room, 3, () => racers.forEach((racer) => sendInput(room, racer, 0)));
    for (const racer of racers) sendInput(room, racer, E);
    internals(room).tick();
    const seats = racers.map((racer) => room.vehicles.seatFor(racer.id)?.seat ?? null);
    report('seat race crawler (3 alpine, 2 seats)', { seats, seatEvents: racers[0]?.socket.eventsOf('VEHICLE_SEAT').length ?? 0 });
    expect(seats[0]).toBe(0);
    expect(seats[1]).toBe(1);
    expect(seats[2]).toBeNull();

    // A neutral village sidecar: an alpine and a lagoon player press E together.
    const village = slotBySpawn('sidecar_village_east');
    const bike = room.vehicles.vehicleBody(village.id);
    if (!bike) throw new Error('no sidecar');
    const alpine = joinPlayer(room, 'alpine');
    const lagoon = joinPlayer(room, 'lagoon');
    const left = vehicleLocalToWorld(bike.position, bike.yaw, { x: 1.8, y: 0, z: -0.3 });
    const right = vehicleLocalToWorld(bike.position, bike.yaw, { x: -1.9, y: 0, z: -0.2 });
    placePlayer(room, alpine.id, { x: left.x, y: sampleMapHeight(left.x, left.z) + 0.05, z: left.z });
    placePlayer(room, lagoon.id, { x: right.x, y: sampleMapHeight(right.x, right.z) + 0.05, z: right.z });
    run(room, 3, () => {
      sendInput(room, alpine, 0);
      sendInput(room, lagoon, 0);
    });
    sendInput(room, lagoon, E);
    sendInput(room, alpine, E);
    internals(room).tick();
    const winner = { alpine: room.vehicles.seatFor(alpine.id), lagoon: room.vehicles.seatFor(lagoon.id) };
    report('seat race neutral sidecar (alpine vs lagoon)', winner);
    // Exactly one faction rides; the first input processed wins (join order).
    expect([winner.alpine, winner.lagoon].filter((seat) => seat !== null).length).toBe(1);
    expect(winner.alpine).toEqual({ vehicleId: village.id, seat: 0 });
    room.stop();
  });

  test('a driver disconnecting mid-drive frees the seat; the hull coasts to a stop, the passenger takes over, and an abandoned tank is towed home', async () => {
    const room = await createRoom();
    const slot = slotBySpawn('sidecar_alpine_base');
    const driver = joinPlayer(room, 'alpine');
    const passenger = joinPlayer(room, 'alpine', 'heavy');
    room.vehicles.devEnter(playerOf(room, driver.id) as never, slot.id, 0);
    room.vehicles.devEnter(playerOf(room, passenger.id) as never, slot.id, 1);
    const body = room.vehicles.vehicleBody(slot.id);
    if (!body) throw new Error('no sidecar');
    parkVehicle(room, slot.id, 290, 100, RUNWAY_YAW);
    run(room, 150, () => {
      sendInput(room, driver, W, body.yaw);
      sendInput(room, passenger, 0, body.yaw);
    });
    const speed = body.forwardSpeed;
    room.leaveBySocket(driver.socket);
    internals(room).tick();
    const freedNextTick = room.vehicles.seatFor(driver.id) === null;
    const coast = coastToRest(room, slot.id, 60 * 20, () => sendInput(room, passenger, 0, body.yaw));
    tap(room, passenger, InputButton.Crouch, body.yaw);
    const passengerSeat = room.vehicles.seatFor(passenger.id);
    run(room, 90, () => sendInput(room, passenger, W, body.yaw));
    run(room, 2);
    const snapshotSeats = passenger.socket.latest?.vehicles.find((entry) => entry.id === slot.id)?.seats ?? null;
    report('driver disconnects sidecar', {
      speedAtDisconnect: round(speed),
      seatFreedNextTick: freedNextTick,
      coastSeconds: round(coast.ticks / 60, 2),
      coastMetres: round(coast.distance, 1),
      passengerSeatAfterC: passengerSeat,
      speedAfterTakeover: round(body.forwardSpeed),
      snapshotSeats,
    });
    expect(freedNextTick).toBe(true);
    expect(coast.ticks).toBeLessThan(60 * 20);
    expect(passengerSeat).toEqual({ vehicleId: slot.id, seat: 0 });
    expect(body.forwardSpeed).toBeGreaterThan(3);
    expect(snapshotSeats).toEqual([passenger.id, 0]);

    // A lone tank driver drops out on the runway, far from the base pad.
    const crawler = slotBySpawn('crawler_base');
    const tankDriver = joinPlayer(room, 'alpine');
    room.vehicles.devEnter(playerOf(room, tankDriver.id) as never, crawler.id, 0);
    const tank = room.vehicles.vehicleBody(crawler.id);
    if (!tank) throw new Error('no crawler');
    parkVehicle(room, crawler.id, 290, 140, RUNWAY_YAW);
    run(room, 120, () => sendInput(room, tankDriver, W, tank.yaw));
    room.leaveBySocket(tankDriver.socket);
    const tankCoast = coastToRest(room, crawler.id, 60 * 10);
    const leftAt = internals(room).physicsTick - tankCoast.ticks;
    let towedAfter = -1;
    for (let tick = 0; tick < vehicleTicks(VEHICLE_ABANDON_SECONDS + 5); tick += 1) {
      internals(room).tick();
      const home = room.vehicles.vehicleBody(crawler.id);
      if (home && home !== tank) {
        towedAfter = (internals(room).physicsTick - leftAt) / 60;
        break;
      }
    }
    const home = room.vehicles.vehicleBody(crawler.id);
    const spawn = crawler.spawn.position;
    report('driver disconnects crawler', {
      coastSeconds: round(tankCoast.ticks / 60, 2),
      coastMetres: round(tankCoast.distance, 1),
      towedHomeAfterSeconds: round(towedAfter, 1),
      distanceToPadAfterTow: home ? round(Math.hypot(home.position.x - spawn.x, home.position.z - spawn.z)) : null,
    });
    expect(towedAfter).toBeGreaterThan(VEHICLE_ABANDON_SECONDS);
    expect(towedAfter).toBeLessThan(VEHICLE_ABANDON_SECONDS + 1);
    room.stop();
  // Simulates both handover and the full 75-second tow timeout; allow slower CI CPUs.
  }, 15000);

  test('a flamingo turbo-slid onto the beach is stranded; shoved back into the water it floats and drives again', async () => {
    const room = await createRoom();
    const slot = slotBySpawn('flamingo_east_beach');
    const pilot = joinPlayer(room, 'lagoon');
    room.vehicles.devEnter(playerOf(room, pilot.id) as never, slot.id, 0);
    const body = room.vehicles.vehicleBody(slot.id);
    if (!body) throw new Error('no flamingo');
    // Straight at the east beach (north of the spawn), plug turbo pulled on the way.
    const start = { x: 60, z: -210 };
    let shoreYaw = 0;
    let shoreDistance = Number.POSITIVE_INFINITY;
    for (let step = 0; step < 64; step += 1) {
      const yaw = (step / 64) * Math.PI * 2;
      for (let d = 4; d < 120; d += 1) {
        if (sampleMapHeight(start.x + Math.sin(yaw) * d, start.z + Math.cos(yaw) * d) > WATER_LEVEL - 0.45) {
          const inland = [8, 16, 24].every((extra) => sampleMapHeight(start.x + Math.sin(yaw) * (d + extra), start.z + Math.cos(yaw) * (d + extra)) > 0.6);
          if (inland && d < shoreDistance) {
            shoreDistance = d;
            shoreYaw = yaw;
          }
          break;
        }
      }
    }
    parkVehicle(room, slot.id, start.x, start.z, shoreYaw);
    let beachedAt: Vec3 | null = null;
    let peakSpeed = 0;
    run(room, 60 * 12, (tick) => {
      sendInput(room, pilot, W | (tick > 60 && tick % 2 === 0 ? InputButton.Sprint : 0), shoreYaw);
      peakSpeed = Math.max(peakSpeed, body.forwardSpeed);
      if (body.beached && !beachedAt) beachedAt = body.position;
    });
    const stranded = body.position;
    const landedAt = beachedAt as Vec3 | null;
    const slide = landedAt ? Math.hypot(stranded.x - landedAt.x, stranded.z - landedAt.z) : 0;
    // Throttle, reverse and turbo do nothing on the sand.
    run(room, 120, (tick) => sendInput(room, pilot, (tick < 60 ? InputButton.Backward : W) | (tick % 2 ? InputButton.Sprint : 0), body.yaw));
    const throttleMoved = Math.hypot(body.position.x - stranded.x, body.position.z - stranded.z);
    // Mortar-sized blasts on the beach side: each nudges it, and dents it.
    const hp0 = room.vehicles.vehicleHp(slot.id);
    const beforeBlast = body.position;
    const blastAt = vehicleLocalToWorld(body.position, body.yaw, { x: 0, y: 0.5, z: VEHICLES.badi_flamingo.halfExtents.z + 0.6 });
    room.vehicles.explode(null, blastAt, 50, 5);
    run(room, 60, () => sendInput(room, pilot, 0, body.yaw));
    const perBlast = Math.hypot(body.position.x - beforeBlast.x, body.position.z - beforeBlast.z);
    const blastDamage = hp0 - room.vehicles.vehicleHp(slot.id);
    // Shoved back seawards (6 m/s nudges, each dying out on the sand) until it floats again.
    let shoves = 0;
    while (!body.afloat && shoves < 60) {
      body.push({ x: -Math.sin(shoreYaw) * 6, y: 0, z: -Math.cos(shoreYaw) * 6 });
      shoves += 1;
      run(room, 45, () => sendInput(room, pilot, 0, body.yaw));
    }
    run(room, 60 * 4, () => sendInput(room, pilot, 0, body.yaw));
    const afloatY = body.position.y;
    // Back off the shallows, turn away from the beach and drive off: thrust works again.
    run(room, 90, () => sendInput(room, pilot, InputButton.Backward, body.yaw));
    const reverseSpeed = -body.forwardSpeed;
    const out = shoreYaw + Math.PI;
    run(room, 60 * 6, () => {
      const error = wrap(out - body.yaw);
      sendInput(room, pilot, W | (error > 0.05 ? InputButton.Right : error < -0.05 ? InputButton.Left : 0), body.yaw);
    });
    report('beach and back badi_flamingo', {
      shoreDistance,
      peakSpeed: round(peakSpeed, 1),
      slideOntoSandMetres: round(slide, 1),
      strandedGroundY: round(sampleMapHeight(stranded.x, stranded.z)),
      throttleMovedOnSand: round(throttleMoved, 3),
      oneMortarBlastMoves: round(perBlast, 2),
      oneMortarBlastDamage: round(blastDamage, 1),
      shovesToRefloat: shoves,
      afloatAgain: body.afloat,
      waterlineError: round(Math.abs(afloatY - (WATER_LEVEL - BOAT_DRAFT)), 4),
      reverseSpeed: round(reverseSpeed, 1),
      speedAfterTurnAndRun6s: round(body.forwardSpeed, 1),
      afloatAtEnd: body.afloat,
      lifecycle: room.vehicles.lifecycleOf(slot.id),
    });
    expect(landedAt).not.toBeNull();
    expect(throttleMoved).toBeLessThan(0.3);
    expect(body.afloat).toBe(true);
    expect(Math.abs(afloatY - (WATER_LEVEL - BOAT_DRAFT))).toBeLessThan(1e-4);
    expect(body.forwardSpeed).toBeGreaterThan(9);
    expect(room.vehicles.lifecycleOf(slot.id)).toBe('active');
    // A crewed boat on the sand never deflates on its own; an empty one does after 10 s.
    expect(VEHICLE_BEACHED_SECONDS).toBe(10);
    room.stop();
  // This integration case advances thousands of fixed physics ticks. Cloud CPU
  // pauses can exceed Bun's 5 s default even when all physical assertions pass.
  }, 15000);

  test('hulls never block, ram or shove a character outside their collision filter (the drifter)', async () => {
    const room = await createRoom();
    const slot = slotBySpawn('crawler_base');
    const driver = joinPlayer(room, 'alpine');
    room.vehicles.devEnter(playerOf(room, driver.id) as never, slot.id, 0);
    const body = room.vehicles.vehicleBody(slot.id);
    if (!body) throw new Error('no crawler');
    parkVehicle(room, slot.id, 290, 100, RUNWAY_YAW);
    run(room, 3, () => sendInput(room, driver, 0, body.yaw));
    // The drifter class (package 3G) uses membership 0x0004 with a world-only filter.
    const ghost = joinPlayer(room, 'lagoon');
    (playerOf(room, ghost.id).character as unknown as { collider: RAPIER.Collider }).collider.setCollisionGroups(0x00040001);
    const walker = joinPlayer(room, 'lagoon');
    const ground = (point: Vec3): Vec3 => ({ x: point.x, y: sampleMapHeight(point.x, point.z) + 0.05, z: point.z });
    placePlayer(room, ghost.id, ground(vehicleLocalToWorld(body.position, body.yaw, { x: -3.4, y: 0, z: 1.1 })));
    placePlayer(room, walker.id, ground(vehicleLocalToWorld(body.position, body.yaw, { x: -3.4, y: 0, z: -1.1 })));
    // Both walk across the hull from its left side (local +x).
    const across = body.yaw + Math.PI / 2;
    const gap = (id: number): number => distanceToHull(body.definition, body.position, body.yaw, characterOf(room, id).position);
    let ghostInside = 0;
    let walkerClosest = Number.POSITIVE_INFINITY;
    run(room, 150, () => {
      sendInput(room, ghost, W, across);
      sendInput(room, walker, W, across);
      sendInput(room, driver, 0, body.yaw);
      if (gap(ghost.id) === 0) ghostInside += 1;
      walkerClosest = Math.min(walkerClosest, gap(walker.id));
    });
    const localX = (id: number): number => {
      const feet = characterOf(room, id).position;
      return vehicleLocalToWorld({ x: 0, y: 0, z: 0 }, -body.yaw, { x: feet.x - body.position.x, y: 0, z: feet.z - body.position.z }).x;
    };
    // The drifter walks through the hull; a normal player slides along its side.
    const crossing = { ghostTicksInsideHull: ghostInside, ghostEndLocalX: round(localX(ghost.id)), walkerClosestToHull: round(walkerClosest) };
    expect(ghostInside).toBeGreaterThan(10);
    expect(crossing.ghostEndLocalX).toBeGreaterThan(VEHICLES.fondue_crawler.halfExtents.x);
    expect(walkerClosest).toBeGreaterThan(0.3);
    // Run over at full speed: no ram, no damage, no shove.
    parkVehicle(room, slot.id, 290, 100, RUNWAY_YAW);
    run(room, 120, () => sendInput(room, driver, W, body.yaw));
    const ahead = ground(vehicleLocalToWorld(body.position, body.yaw, { x: 0.3, y: 0, z: VEHICLES.fondue_crawler.halfExtents.z + 6 }));
    placePlayer(room, ghost.id, ahead);
    placePlayer(room, walker.id, ground(vehicleLocalToWorld(body.position, body.yaw, { x: 8, y: 0, z: 0 })));
    const hp = playerOf(room, ghost.id).hp;
    run(room, 90, () => {
      sendInput(room, driver, W, body.yaw);
      sendInput(room, ghost, 0, 0);
      sendInput(room, walker, 0, 0);
    });
    const feet = characterOf(room, ghost.id).position;
    const runOver = {
      speed: round(body.forwardSpeed),
      hullPassedHer: vehicleWorldToLocalZ(body, feet) < -VEHICLES.fondue_crawler.halfExtents.z,
      rams: driver.socket.eventsOf('PINBALL_BOING_HIT').filter((event) => event.targetId === ghost.id).length,
      hpLost: hp - playerOf(room, ghost.id).hp,
      shovedMetres: round(Math.hypot(feet.x - ahead.x, feet.z - ahead.z), 3),
    };
    report('drifter vs crawler', { ...crossing, ...runOver });
    expect(runOver.hullPassedHer).toBe(true);
    expect(runOver.rams).toBe(0);
    expect(runOver.hpLost).toBe(0);
    expect(runOver.shovedMetres).toBeLessThan(0.05);
    room.stop();
  });

  test('the 10 m tank road is free of props; the ones moved off it keep 1.5 m from its edge', () => {
    const halfWidth = FjordLayout.TANK_ROAD_WIDTH / 2;
    // Dense centre-line samples with their road height.
    const samples: Vec3[] = [];
    for (let index = 0; index + 1 < TANK_ROAD_POINTS.length; index += 1) {
      const a = TANK_ROAD_POINTS[index];
      const b = TANK_ROAD_POINTS[index + 1];
      if (!a || !b) continue;
      for (let k = 0; k < 8; k += 1) samples.push({ x: a.x + ((b.x - a.x) * k) / 8, y: a.y + ((b.y - a.y) * k) / 8, z: a.z + ((b.z - a.z) * k) / 8 });
    }
    const moved = new Set(['summit_crates_1', 'summit_crates_2', 'summit_snowman_0', 'summit_woodpile_0', 'alpine_crates_0', 'alpine_flag_0', 'silo_arch_north']);
    // The road starts inside the alpine hangar and crosses the gorge on the
    // stone arch. Known choke point: the coaster start deck (a solid box from
    // road level up, placed by the coaster route) stands up to 2.5 m inside
    // the east edge at the summit, opposite the Tower C dairy; about 7.5 m of
    // road stay open there.
    const exempt = new Set(['alpine_hangar', 'stone_arch']);
    const choke = new Map([['coaster_platform', -2.5]]);
    let chokeMin = Number.POSITIVE_INFINITY;
    const intrusions: string[] = [];
    let movedMin = Number.POSITIVE_INFINITY;
    let pylonMin = Number.POSITIVE_INFINITY;
    for (const prop of FJORD_MAP.props) {
      if (exempt.has(prop.id)) continue;
      for (const collider of prop.colliders) {
        const yaw = prop.rotationY + (collider.type === 'box' ? (collider.rotation?.y ?? 0) : 0);
        const centre = vehicleLocalToWorld(prop.position, prop.rotationY, collider.offset);
        const halfY = collider.type === 'box' ? collider.halfExtents.y : collider.type === 'sphere' ? collider.radius : collider.halfHeight;
        let clearance = Number.POSITIVE_INFINITY;
        for (const sample of samples) {
          // Only colliders at road level (not bridges overhead or posts in the gorge below).
          if (centre.y + halfY < sample.y - 0.5 || centre.y - halfY > sample.y + 4) continue;
          const local = vehicleLocalToWorld({ x: 0, y: 0, z: 0 }, -yaw, { x: sample.x - centre.x, y: 0, z: sample.z - centre.z });
          const distance =
            collider.type === 'box'
              ? Math.hypot(Math.max(0, Math.abs(local.x) - collider.halfExtents.x), Math.max(0, Math.abs(local.z) - collider.halfExtents.z))
              : Math.hypot(local.x, local.z) - collider.radius;
          clearance = Math.min(clearance, distance - halfWidth);
        }
        if (moved.has(prop.id)) movedMin = Math.min(movedMin, clearance);
        if (prop.kind === 'tbar_pylon') pylonMin = Math.min(pylonMin, clearance);
        if (choke.has(prop.id)) chokeMin = Math.min(chokeMin, clearance);
        const required = choke.get(prop.id) ?? (moved.has(prop.id) || prop.kind === 'tbar_pylon' ? 1.5 : 0);
        if (clearance < required) intrusions.push(`${prop.id} ${round(clearance)}`);
      }
    }
    report('tank road clearance', { intrusions, movedPropsMinClearance: round(movedMin), tbarMastsMinClearance: round(pylonMin), coasterDeckIntrusion: round(-chokeMin) });
    expect(intrusions).toEqual([]);
  });

  test('the Fondue Crawler drives the whole serpentine tank road down and up again', async () => {
    const room = await createRoom();
    const slot = slotBySpawn('crawler_base');
    const driver = joinPlayer(room, 'alpine');
    room.vehicles.devEnter(playerOf(room, driver.id) as never, slot.id, 0);
    const body = room.vehicles.vehicleBody(slot.id);
    if (!body) throw new Error('no crawler');
    // The autopilot follows the centre line itself: nothing stands on the road.
    const road = TANK_ROAD_POINTS;
    const results: Record<string, unknown> = {};
    for (const direction of ['down', 'up'] as const) {
      const path = direction === 'down' ? road : [...road].reverse();
      const first = path[0];
      const second = path[1];
      if (!first || !second) throw new Error('no road');
      parkVehicle(room, slot.id, first.x, first.z, Math.atan2(second.x - first.x, second.z - first.z));
      const startY = body.position.y;
      let target = 1;
      let ticks = 0;
      let steepest = 0;
      let longestStall = 0;
      let stall = 0;
      const trail: Vec3[] = [];
      for (; ticks < 60 * 150 && target < path.length; ticks += 1) {
        const point = path[target];
        if (!point) break;
        const dx = point.x - body.position.x;
        const dz = point.z - body.position.z;
        if (Math.hypot(dx, dz) < 5) {
          target += 1;
          continue;
        }
        const error = wrap(Math.atan2(dx, dz) - body.yaw);
        const buttons = (error > 0.08 ? InputButton.Right : error < -0.08 ? InputButton.Left : 0) | (Math.abs(error) < 1.2 ? W : 0);
        sendInput(room, driver, buttons, body.yaw);
        internals(room).tick();
        trail.push(body.position);
        if (trail.length > 60) trail.shift();
        const old = trail[0];
        if (old && trail.length === 60) {
          const along = Math.hypot(body.position.x - old.x, body.position.z - old.z);
          if (along > 3) steepest = Math.max(steepest, (Math.atan2(Math.abs(body.position.y - old.y), along) * 180) / Math.PI);
        }
        stall = (buttons & W) !== 0 && Math.abs(body.forwardSpeed) < 0.5 ? stall + 1 : 0;
        longestStall = Math.max(longestStall, stall);
        if (stall > 60 * 6) break;
      }
      results[direction] = {
        waypoints: `${target}/${path.length}`,
        seconds: round(ticks / 60, 1),
        heightChange: round(body.position.y - startY, 1),
        steepestGradeDeg: round(steepest, 1),
        longestStallSeconds: round(longestStall / 60, 2),
      };
      expect(target).toBe(path.length);
    }
    report('serpentine crawler', results);
    room.stop();
  }, 60_000);
});
