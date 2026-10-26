/**
 * 3G drifter x 4V vehicles (merge integration): one shared motor lets the
 * real drifter class walk through hulls while soldiers stay blocked, hulls
 * never ram, shell or splash her (and earn no kill on her), and neither
 * drifters nor mascots may board, drive or gun a vehicle. The server seat
 * gate and the client's enter prompt use the same predicate
 * (classMayUseVehicles).
 *
 *   bun test apps/server/test/vehicle-drifter.test.ts
 */
import { describe, expect, test } from 'bun:test';
import {
  CLASS_IDS,
  DRIFTER_COLLISION_GROUP,
  FjordLayout,
  PLAYER_COLLISION_GROUP,
  VEHICLES,
  classCapabilities,
  classMayUseVehicles,
  collidesWithVehicles,
  distanceToHull,
  sampleMapHeight,
  vehicleLocalToWorld,
  type ClassId,
  type Vec3,
  type WeaponId,
} from '@frost-and-flamingos/shared';
import type { MatchRoom } from '../src/rooms/match-room';
import { InputButton, createRoom, internals, joinPlayer, parkVehicle, placePlayer, playerOf, run, sendInput, slotBySpawn, tap } from './vehicle-helpers';

const { GLACIER_RUNWAY } = FjordLayout;
const W = InputButton.Forward;
const RUNWAY_YAW = Math.atan2(GLACIER_RUNWAY.end.x - GLACIER_RUNWAY.start.x, GLACIER_RUNWAY.end.z - GLACIER_RUNWAY.start.z);

interface Room {
  damagePlayer(target: unknown, attacker: unknown, damage: number, weaponId: WeaponId | null, headshot: boolean): void;
  explode(owner: unknown, position: Vec3, damage: number, radius: number, weaponId: WeaponId | null): void;
}

interface Character {
  position: Vec3;
  collider: Parameters<typeof collidesWithVehicles>[0];
}

function characterOf(room: MatchRoom, id: number): Character {
  return playerOf(room, id).character as unknown as Character;
}

const ground = (point: Vec3): Vec3 => ({ x: point.x, y: sampleMapHeight(point.x, point.z) + 0.05, z: point.z });

/** Local +x coordinate of a player in the hull frame. */
function localX(body: { position: Vec3; yaw: number }, feet: Vec3): number {
  return vehicleLocalToWorld({ x: 0, y: 0, z: 0 }, -body.yaw, { x: feet.x - body.position.x, y: 0, z: feet.z - body.position.z }).x;
}

describe('drifter vs vehicles', () => {
  test('collision groups: the drifter is outside the hull filter, soldiers and mascots inside it', async () => {
    const room = await createRoom();
    const drifter = joinPlayer(room, 'alpine', 'drifter');
    const soldier = joinPlayer(room, 'alpine', 'allrounder');
    const mascot = joinPlayer(room, 'lagoon', 'mascot');
    expect(characterOf(room, drifter.id).collider.collisionGroups()).toBe(DRIFTER_COLLISION_GROUP);
    expect(characterOf(room, soldier.id).collider.collisionGroups()).toBe(PLAYER_COLLISION_GROUP);
    expect(collidesWithVehicles(characterOf(room, drifter.id).collider)).toBe(false);
    expect(collidesWithVehicles(characterOf(room, soldier.id).collider)).toBe(true);
    expect(collidesWithVehicles(characterOf(room, mascot.id).collider)).toBe(true);
    room.stop();
  });

  test('a real drifter walks through a parked hull; an allrounder is blocked by it', async () => {
    const room = await createRoom();
    const slot = slotBySpawn('crawler_base');
    const body = room.vehicles.vehicleBody(slot.id);
    if (!body) throw new Error('no crawler');
    parkVehicle(room, slot.id, 290, 100, RUNWAY_YAW);
    run(room, 3);
    const drifter = joinPlayer(room, 'lagoon', 'drifter');
    const soldier = joinPlayer(room, 'lagoon', 'allrounder');
    placePlayer(room, drifter.id, ground(vehicleLocalToWorld(body.position, body.yaw, { x: -3.4, y: 0, z: 1.1 })));
    placePlayer(room, soldier.id, ground(vehicleLocalToWorld(body.position, body.yaw, { x: -3.4, y: 0, z: -1.1 })));
    const across = body.yaw + Math.PI / 2;
    const gap = (id: number): number => distanceToHull(body.definition, body.position, body.yaw, characterOf(room, id).position);
    let drifterInside = 0;
    let soldierClosest = Number.POSITIVE_INFINITY;
    let soldierAgainstHull = 0;
    let drifterHighest = Number.NEGATIVE_INFINITY;
    run(room, 300, () => {
      sendInput(room, drifter, W, across);
      sendInput(room, soldier, W, across);
      if (gap(drifter.id) === 0) drifterInside += 1;
      soldierClosest = Math.min(soldierClosest, gap(soldier.id));
      if (gap(soldier.id) < 0.6) soldierAgainstHull += 1;
      const feet = characterOf(room, drifter.id).position;
      drifterHighest = Math.max(drifterHighest, feet.y - sampleMapHeight(feet.x, feet.z));
    });
    const half = VEHICLES.fondue_crawler.halfExtents.x;
    const drifterEnd = localX(body, characterOf(room, drifter.id).position);
    console.log(`[drifter-hull] ${JSON.stringify({ drifterInside, drifterEnd, soldierClosest, soldierAgainstHull, drifterHighest })}`);
    // She crossed the whole hull at ground level (never stood on its roof).
    expect(drifterInside).toBeGreaterThan(10);
    expect(drifterEnd).toBeGreaterThan(half);
    expect(drifterHighest).toBeLessThan(0.6);
    // The soldier was held at the hull's side (he slides along it) and never got inside.
    expect(soldierAgainstHull).toBeGreaterThan(10);
    expect(soldierClosest).toBeGreaterThan(0.3);
    // The parked hull did not move.
    expect(room.vehicles.vehicleBody(slot.id)?.speed ?? 0).toBeLessThan(0.05);
    room.stop();
  });

  test('dropped onto a hull roof she sinks through it to the ground; a soldier lands on the roof', async () => {
    const room = await createRoom();
    const slot = slotBySpawn('crawler_base');
    const body = room.vehicles.vehicleBody(slot.id);
    if (!body) throw new Error('no crawler');
    parkVehicle(room, slot.id, 290, 100, RUNWAY_YAW);
    run(room, 3);
    const roof = body.position.y + VEHICLES.fondue_crawler.halfExtents.y * 2;
    const drifter = joinPlayer(room, 'lagoon', 'drifter');
    const soldier = joinPlayer(room, 'lagoon', 'allrounder');
    const top = (localZ: number): Vec3 => {
      const point = vehicleLocalToWorld(body.position, body.yaw, { x: 0, y: 0, z: localZ });
      return { x: point.x, y: roof + 0.25, z: point.z };
    };
    placePlayer(room, drifter.id, top(0.8));
    placePlayer(room, soldier.id, top(-0.8));
    run(room, 240, () => {
      sendInput(room, drifter, 0, 0);
      sendInput(room, soldier, 0, 0);
    });
    const drifterFeet = characterOf(room, drifter.id).position;
    const soldierFeet = characterOf(room, soldier.id).position;
    console.log(`[drifter-roof] ${JSON.stringify({ roof, drifterY: drifterFeet.y, soldierY: soldierFeet.y, ground: sampleMapHeight(drifterFeet.x, drifterFeet.z) })}`);
    expect(drifterFeet.y).toBeLessThan(roof - 0.5);
    expect(drifterFeet.y - sampleMapHeight(drifterFeet.x, drifterFeet.z)).toBeLessThan(0.3);
    expect(soldierFeet.y).toBeGreaterThan(roof - 0.2);
    room.stop();
  });

  test('a driven hull neither rams nor shoves her; vehicle shells, splash and wreck blasts never hurt her or credit a kill', async () => {
    const room = await createRoom();
    const slot = slotBySpawn('crawler_base');
    const driver = joinPlayer(room, 'alpine');
    room.vehicles.devEnter(playerOf(room, driver.id) as never, slot.id, 0);
    const body = room.vehicles.vehicleBody(slot.id);
    if (!body) throw new Error('no crawler');
    parkVehicle(room, slot.id, 290, 100, RUNWAY_YAW);
    run(room, 120, () => sendInput(room, driver, W, body.yaw));
    const drifter = joinPlayer(room, 'lagoon', 'drifter');
    const ahead = ground(vehicleLocalToWorld(body.position, body.yaw, { x: 0.3, y: 0, z: VEHICLES.fondue_crawler.halfExtents.z + 6 }));
    placePlayer(room, drifter.id, ahead);
    const hp = playerOf(room, drifter.id).hp;
    run(room, 90, () => {
      sendInput(room, driver, W, body.yaw);
      sendInput(room, drifter, 0, 0);
    });
    const feet = characterOf(room, drifter.id).position;
    expect(Math.hypot(feet.x - ahead.x, feet.z - ahead.z)).toBeLessThan(0.05);
    expect(driver.socket.eventsOf('PINBALL_BOING_HIT').filter((event) => event.targetId === drifter.id).length).toBe(0);

    // Direct vehicle-weapon damage and splash through the room hooks the vehicle manager uses.
    const roomInternals = room as unknown as Room;
    const victim = playerOf(room, drifter.id);
    const attacker = playerOf(room, driver.id);
    for (const weapon of ['fondue_cannon', 'coconut_mortar', 'harpoon_gun', 'dozer_ram', 'vehicle_blast'] as const) {
      roomInternals.damagePlayer(victim, attacker, 9999, weapon, false);
      roomInternals.explode(attacker, characterOf(room, drifter.id).position, 9999, 8, weapon);
    }
    expect(victim.alive).toBe(true);
    expect(victim.hp).toBe(hp);
    expect((attacker as unknown as { kills: number }).kills).toBe(0);

    // An alpine drifter inside the hull when a lagoon soldier wrecks it: the
    // wreck blast and its splash pass her by (the crew still gets hurt).
    const mateDrifter = joinPlayer(room, 'alpine', 'drifter');
    const destroyer = joinPlayer(room, 'lagoon', 'allrounder');
    placePlayer(room, mateDrifter.id, ground(vehicleLocalToWorld(body.position, body.yaw, { x: 0, y: 0, z: 0 })));
    placePlayer(room, destroyer.id, ground(vehicleLocalToWorld(body.position, body.yaw, { x: 30, y: 0, z: 0 })));
    run(room, 2, () => sendInput(room, mateDrifter, 0, 0));
    const mateHp = playerOf(room, mateDrifter.id).hp;
    const driverHp = playerOf(room, driver.id).hp;
    expect(room.vehicles.devDamage(slot.id, playerOf(room, destroyer.id) as never, 99999)).toBe(true);
    run(room, 5, () => sendInput(room, mateDrifter, 0, 0));
    expect(room.vehicles.lifecycleOf(slot.id)).toBe('wreck');
    expect(playerOf(room, driver.id).hp).toBeLessThan(driverHp);
    expect(playerOf(room, mateDrifter.id).alive).toBe(true);
    expect(playerOf(room, mateDrifter.id).hp).toBe(mateHp);
    expect((playerOf(room, destroyer.id) as unknown as { kills: number }).kills).toBeLessThanOrEqual(1);
    const hitsOnDrifters = driver.socket
      .eventsOf('COMIC_HIT')
      .filter((event) => event.targetId === drifter.id || event.targetId === mateDrifter.id).length;
    expect(hitsOnDrifters).toBe(0);
    room.stop();
  });
});

describe('vehicle seat gate (classMayUseVehicles)', () => {
  test('only armed, damageable classes may ride', () => {
    for (const classId of CLASS_IDS as readonly ClassId[]) {
      const capabilities = classCapabilities(classId);
      expect(classMayUseVehicles(classId)).toBe(capabilities.armed && capabilities.damageable);
    }
    expect(classMayUseVehicles('allrounder')).toBe(true);
    expect(classMayUseVehicles('heavy')).toBe(true);
    expect(classMayUseVehicles('infiltrator')).toBe(true);
    expect(classMayUseVehicles('mascot')).toBe(false);
    expect(classMayUseVehicles('drifter')).toBe(false);
  });

  test('F next to a free seat boards a soldier but never a drifter or a mascot', async () => {
    const room = await createRoom();
    const slot = slotBySpawn('crawler_base');
    const body = room.vehicles.vehicleBody(slot.id);
    if (!body) throw new Error('no crawler');
    const side = vehicleLocalToWorld(body.position, body.yaw, { x: -2.4, y: 0, z: 0.8 });
    const board = (classId: ClassId): ReturnType<MatchRoom['vehicles']['seatFor']> => {
      const player = joinPlayer(room, 'alpine', classId);
      placePlayer(room, player.id, { x: side.x, y: body.position.y + 0.05, z: side.z });
      run(room, 3, () => sendInput(room, player, 0));
      tap(room, player, InputButton.Interact);
      const seat = room.vehicles.seatFor(player.id);
      const seatEvents = player.socket.eventsOf('VEHICLE_SEAT').filter((event) => event.actorId === player.id);
      if (!seat) expect(seatEvents.length).toBe(0);
      // Step aside for the next candidate.
      if (!seat) placePlayer(room, player.id, ground({ x: side.x + 30, y: 0, z: side.z + 30 }));
      return seat;
    };
    expect(board('drifter')).toBeNull();
    expect(board('mascot')).toBeNull();
    expect(board('allrounder')).toEqual({ vehicleId: slot.id, seat: 0 });
    room.stop();
  });

  test('a drifter or mascot seated by force is put out on the next tick and cannot drive', async () => {
    const room = await createRoom();
    const slot = slotBySpawn('crawler_base');
    const body = room.vehicles.vehicleBody(slot.id);
    if (!body) throw new Error('no crawler');
    for (const classId of ['drifter', 'mascot'] as const) {
      const player = joinPlayer(room, 'alpine', classId);
      expect(room.vehicles.devEnter(playerOf(room, player.id) as never, slot.id, 0)).toBe(true);
      const start = { ...body.position };
      run(room, 30, () => sendInput(room, player, W, body.yaw));
      expect(room.vehicles.seatFor(player.id)).toBeNull();
      expect(room.vehicles.isShielded(player.id)).toBe(false);
      expect(Math.hypot(body.position.x - start.x, body.position.z - start.z)).toBeLessThan(0.5);
      placePlayer(room, player.id, ground({ x: body.position.x + 30, y: 0, z: body.position.z + 30 }));
      run(room, 2, () => sendInput(room, player, 0));
    }
    expect(internals(room).physicsTick).toBeGreaterThan(0);
    room.stop();
  });
});
