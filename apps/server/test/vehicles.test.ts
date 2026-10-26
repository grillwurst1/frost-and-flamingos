import { describe, expect, test } from 'bun:test';
import {
  FIXED_DT,
  PHYSICS_TICK_RATE,
  VEHICLES,
  WEAPON_TABLE,
  distanceToHull,
  sampleMapHeight,
  surfaceTagAt,
  vehicleLocalToWorld,
  vehicleTicks,
} from '@frost-and-flamingos/shared';
import {
  InputButton,
  createRoom,
  drivePath,
  internals,
  joinPlayer,
  parkVehicle,
  placePlayer,
  playerOf,
  run,
  sendInput,
  slotByKind,
  tap,
} from './vehicle-helpers';
import { FjordLayout, VEHICLE_SLOTS } from '@frost-and-flamingos/shared';

const { GLACIER_RUNWAY, TANK_ROAD_POINTS } = FjordLayout;

const W = InputButton.Forward;
/** Open, flat snow on the glacier runway, facing along it. */
const RUNWAY_YAW = Math.atan2(GLACIER_RUNWAY.end.x - GLACIER_RUNWAY.start.x, GLACIER_RUNWAY.end.z - GLACIER_RUNWAY.start.z);
const RUNWAY = { x: 288, z: 140 };

describe('vehicle framework (fondue crawler)', () => {
  test('spawns at the alpine base and takes a driver with E, exits with F', async () => {
    const room = await createRoom();
    const slot = slotByKind('fondue_crawler');
    const body = room.vehicles.vehicleBody(slot.id);
    expect(body).not.toBeNull();
    if (!body) return;
    expect(room.vehicles.lifecycleOf(slot.id)).toBe('active');
    // The capture-trigger crawler follows Tower C (the room wires the conquest towers):
    // Peak Guard holds C from the round start, so it is there from the first tick.
    const summit = VEHICLE_SLOTS.find((entry) => entry.kind === 'fondue_crawler' && typeof entry.spawn.trigger === 'object');
    expect(summit && room.vehicles.lifecycleOf(summit.id)).toBe('active');
    // Without the tower an untouched crawler leaves its pad; it returns with the tower.
    room.devConquest({ tower: 'tower_c', owner: 'lagoon' });
    run(room, 31);
    expect(summit && room.vehicles.lifecycleOf(summit.id)).toBe('waiting');
    room.vehicles.setTowerQuery((tower, faction) => tower === 'tower_c' && faction === 'alpine');
    run(room, 31);
    expect(summit && room.vehicles.lifecycleOf(summit.id)).toBe('active');

    const driver = joinPlayer(room, 'alpine');
    const side = vehicleLocalToWorld(body.position, body.yaw, { x: -2.4, y: 0, z: 0.8 });
    placePlayer(room, driver.id, { x: side.x, y: body.position.y + 0.05, z: side.z });
    run(room, 3);
    // E is the class skill, never a boarding key.
    tap(room, driver, InputButton.Skill2);
    expect(room.vehicles.seatFor(driver.id)).toBeNull();
    run(room, 60 * 2);
    placePlayer(room, driver.id, { x: side.x, y: body.position.y + 0.05, z: side.z });
    run(room, 3);
    tap(room, driver, InputButton.Interact);
    expect(room.vehicles.seatFor(driver.id)).toEqual({ vehicleId: slot.id, seat: 0 });
    expect(room.vehicles.isShielded(driver.id)).toBe(true);
    expect(driver.socket.eventsOf('VEHICLE_SEAT').at(-1)?.paramValue).toBe(1);
    // Only the E press used skill 2; the F press boarded.
    expect(driver.socket.eventsOf('SKILL_USED').filter((event) => event.actorId === driver.id).length).toBe(1);

    tap(room, driver, InputButton.Interact);
    expect(room.vehicles.seatFor(driver.id)).toBeNull();
    const feet = playerOf(room, driver.id).character.position;
    expect(distanceToHull(VEHICLES.fondue_crawler, body.position, body.yaw, feet)).toBeGreaterThan(0.3);
    room.stop();
  });

  test('cannot be entered by the other faction while it is reserved', async () => {
    const room = await createRoom();
    const slot = slotByKind('fondue_crawler');
    const body = room.vehicles.vehicleBody(slot.id);
    if (!body) throw new Error('no crawler');
    const enemy = joinPlayer(room, 'lagoon');
    const side = vehicleLocalToWorld(body.position, body.yaw, { x: 2.4, y: 0, z: 0 });
    placePlayer(room, enemy.id, { x: side.x, y: body.position.y + 0.05, z: side.z });
    run(room, 2);
    tap(room, enemy, InputButton.Interact);
    expect(room.vehicles.seatFor(enemy.id)).toBeNull();
    room.stop();
  });

  test('drives on snow: top speed on the runway, the tank road uphill, crew on its seats', async () => {
    const room = await createRoom();
    const slot = slotByKind('fondue_crawler');
    const driver = joinPlayer(room, 'alpine');
    const commander = joinPlayer(room, 'alpine', 'heavy');
    expect(room.vehicles.devEnter(playerOf(room, driver.id) as never, slot.id, 0)).toBe(true);
    expect(room.vehicles.devEnter(playerOf(room, commander.id) as never, slot.id, 1)).toBe(true);
    const body = room.vehicles.vehicleBody(slot.id);
    if (!body) throw new Error('no crawler');
    parkVehicle(room, slot.id, RUNWAY.x, RUNWAY.z, RUNWAY_YAW);
    const start = body.position;
    run(room, 240, () => sendInput(room, driver, W, body.yaw));
    const end = body.position;
    expect(Math.hypot(end.x - start.x, end.z - start.z)).toBeGreaterThan(25);
    expect(body.forwardSpeed).toBeGreaterThan(8.5);
    expect(body.forwardSpeed).toBeLessThanOrEqual(9.5);
    expect(surfaceTagAt(end.x, end.z, end.y)).toBe('snow');
    // Occupants ride along at their seat anchors.
    const anchor = vehicleLocalToWorld(end, body.yaw, VEHICLES.fondue_crawler.seats[1]?.anchor ?? { x: 0, y: 0, z: 0 });
    const feet = playerOf(room, commander.id).character.position;
    expect(Math.hypot(feet.x - anchor.x, feet.z - anchor.z)).toBeLessThan(0.05);
    // Turn on the spot: half a turn in about three seconds.
    const yaw0 = body.yaw;
    run(room, 180, () => sendInput(room, driver, InputButton.Right, body.yaw));
    const turned = Math.abs(Math.atan2(Math.sin(body.yaw - yaw0), Math.cos(body.yaw - yaw0)));
    expect(turned).toBeGreaterThan(2);
    // Up the serpentine tank road (it climbs from the gorge to the summit).
    const uphill = [...TANK_ROAD_POINTS].reverse();
    const from = uphill.findIndex((point) => point.x > 112 && point.z > 166 && point.z < 182);
    const path = uphill.slice(Math.max(0, from), Math.max(0, from) + 13);
    const first = path[0];
    if (!first) throw new Error('no road');
    const next = path[1] ?? first;
    parkVehicle(room, slot.id, first.x, first.z, Math.atan2(next.x - first.x, next.z - first.z));
    const y0 = body.position.y;
    const reached = drivePath(room, driver, slot.id, path, 60 * 20);
    expect(reached).toBe(path.length);
    expect(body.position.y).toBeGreaterThan(y0 + 1.2);
    room.stop();
  });

  test('cheese cannon hits an enemy in front for direct + splash damage', async () => {
    const room = await createRoom();
    const slot = slotByKind('fondue_crawler');
    const driver = joinPlayer(room, 'alpine');
    room.vehicles.devEnter(playerOf(room, driver.id) as never, slot.id, 0);
    const body = room.vehicles.vehicleBody(slot.id);
    if (!body) throw new Error('no crawler');
    parkVehicle(room, slot.id, RUNWAY.x, RUNWAY.z, RUNWAY_YAW);
    // Point the turret at open ground and put a lagoon player 14 m down range.
    const aimYaw = body.yaw + 0.9;
    run(room, 90, () => sendInput(room, driver, 0, aimYaw, 0));
    const muzzle = body.muzzle();
    if (!muzzle) throw new Error('no muzzle');
    const target = joinPlayer(room, 'lagoon');
    const at = { x: muzzle.origin.x + muzzle.direction.x * 14, z: muzzle.origin.z + muzzle.direction.z * 14 };
    placePlayer(room, target.id, { x: at.x, y: sampleMapHeight(at.x, at.z) + 0.05, z: at.z });
    run(room, 2, () => sendInput(room, target, 0));
    const before = playerOf(room, target.id).hp;
    run(room, 3, (tick) => sendInput(room, driver, tick === 0 ? InputButton.FirePrimary : 0, aimYaw, 0.02));
    const fired = driver.socket.eventsOf('TANK_CANNON_FIRE');
    expect(fired.length).toBe(1);
    expect(WEAPON_TABLE.byCode[fired[0]?.paramValue ?? -1]).toBe('fondue_cannon');
    run(room, 60, () => {
      sendInput(room, driver, 0, aimYaw, 0.02);
      sendInput(room, target, 0);
    });
    const after = playerOf(room, target.id).hp;
    expect(before - after).toBeGreaterThanOrEqual(85);
    // Cooldown: holding fire for 2 s gives no second shot, 3 s does.
    run(room, 115, () => sendInput(room, driver, InputButton.FirePrimary, aimYaw, 0.02));
    expect(driver.socket.eventsOf('TANK_CANNON_FIRE').length).toBe(1);
    room.stop();
  });

  test('damage destroys it, ejects and hurts the crew, and it respawns after 30 s', async () => {
    const room = await createRoom();
    const slot = slotByKind('fondue_crawler');
    const driver = joinPlayer(room, 'alpine');
    room.vehicles.devEnter(playerOf(room, driver.id) as never, slot.id, 0);
    const spawnBody = room.vehicles.vehicleBody(slot.id);
    if (!spawnBody) throw new Error('no crawler');
    const spawnPosition = spawnBody.position;
    run(room, 2, () => sendInput(room, driver, 0));
    const hpBefore = playerOf(room, driver.id).hp;
    expect(room.vehicles.devDamage(slot.id, null, 640)).toBe(true);
    expect(room.vehicles.lifecycleOf(slot.id)).toBe('active');
    expect(room.vehicles.vehicleHp(slot.id)).toBe(10);
    room.vehicles.devDamage(slot.id, null, 20);
    expect(room.vehicles.lifecycleOf(slot.id)).toBe('wreck');
    expect(driver.socket.eventsOf('VEHICLE_DESTROYED').length).toBe(1);
    expect(room.vehicles.seatFor(driver.id)).toBeNull();
    expect(playerOf(room, driver.id).hp).toBeLessThan(hpBefore);
    run(room, vehicleTicks(VEHICLES.fondue_crawler.wreckSeconds) + 2);
    expect(room.vehicles.lifecycleOf(slot.id)).toBe('waiting');
    // Keep the spawn clear of the ejected driver.
    placePlayer(room, driver.id, { x: spawnPosition.x + 30, y: 70, z: spawnPosition.z });
    run(room, vehicleTicks(VEHICLES.fondue_crawler.respawnSeconds - VEHICLES.fondue_crawler.wreckSeconds) + PHYSICS_TICK_RATE);
    expect(room.vehicles.lifecycleOf(slot.id)).toBe('active');
    expect(room.vehicles.vehicleHp(slot.id)).toBe(650);
    const respawned = room.vehicles.vehicleBody(slot.id);
    expect(respawned && Math.hypot(respawned.position.x - spawnPosition.x, respawned.position.z - spawnPosition.z)).toBeLessThan(0.5);
    room.stop();
  });

  test('runs over an enemy at speed (BOING) and only shoves a friend', async () => {
    const room = await createRoom();
    const slot = slotByKind('fondue_crawler');
    const driver = joinPlayer(room, 'alpine');
    room.vehicles.devEnter(playerOf(room, driver.id) as never, slot.id, 0);
    const body = room.vehicles.vehicleBody(slot.id);
    if (!body) throw new Error('no crawler');
    parkVehicle(room, slot.id, RUNWAY.x, RUNWAY.z, RUNWAY_YAW);
    run(room, 150, () => sendInput(room, driver, W, body.yaw));
    const ahead = vehicleLocalToWorld(body.position, body.yaw, { x: 0, y: 0, z: 2.3 + 3.2 });
    const victim = joinPlayer(room, 'lagoon');
    placePlayer(room, victim.id, { x: ahead.x, y: sampleMapHeight(ahead.x, ahead.z) + 0.05, z: ahead.z });
    const hp = playerOf(room, victim.id).hp;
    run(room, 40, () => {
      sendInput(room, driver, W, body.yaw);
      sendInput(room, victim, 0);
    });
    const rams = driver.socket.eventsOf('PINBALL_BOING_HIT').filter((event) => event.targetId === victim.id && event.paramValue > 0);
    expect(rams.length).toBe(1);
    expect(hp - playerOf(room, victim.id).hp).toBeGreaterThanOrEqual(95);
    room.stop();
  });
});

describe('fixed-step determinism', () => {
  test('two worlds replay the same inputs identically', async () => {
    const { PhysicsWorld } = await import('@frost-and-flamingos/shared');
    const slot = slotByKind('fondue_crawler');
    const a = await PhysicsWorld.create();
    const b = await PhysicsWorld.create();
    const start = { ...slot.spawn.position, y: slot.spawn.position.y + 0.24 };
    const va = a.createVehicle('fondue_crawler', start, slot.spawn.rotationY);
    const vb = b.createVehicle('fondue_crawler', start, slot.spawn.rotationY);
    for (let tick = 0; tick < 240; tick += 1) {
      const buttons = tick < 60 ? InputButton.Right : tick < 200 ? W | (tick % 50 < 20 ? InputButton.Left : 0) : 0;
      const input = { buttons, yaw: 0.3, pitch: 0.1 };
      va.simulate(input, input);
      vb.simulate(input, input);
      a.step();
      b.step();
    }
    expect(va.position).toEqual(vb.position);
    expect(va.yaw).toBe(vb.yaw);
    expect(va.turretYaw).toBe(vb.turretYaw);
    expect(FIXED_DT).toBeCloseTo(1 / 60);
    a.dispose();
    b.dispose();
  });
});
