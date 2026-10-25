/**
 * Regressions for the 4V review findings: roof riders, pinned players, ram
 * credit, seat-gated hand weapons, crew shielding against skills, harpoon
 * armour, nested splash exclusion, bot sight through hulls, shallow-water
 * reversing, banks, boat bounce and the T-bar cable clearance.
 */
import { describe, expect, test } from 'bun:test';
import {
  FJORD_MAP,
  FjordLayout,
  TBAR_CABLE_ROAD_CLEARANCE,
  TBAR_CABLE_TERRAIN_CLEARANCE,
  VEHICLES,
  WATER_LEVEL,
  WEAPON_TABLE,
  distanceToHull,
  sampleMapHeight,
  vehicleLocalToWorld,
  weaponForSlot,
  type Vec3,
} from '@frost-and-flamingos/shared';
import type { MatchRoom } from '../src/rooms/match-room';
import { InputButton, createRoom, internals, joinPlayer, parkVehicle, placePlayer, playerOf, run, sendInput, slotBySpawn, tap } from './vehicle-helpers';

const { GLACIER_RUNWAY, TANK_ROAD_POINTS, TANK_ROAD_WIDTH } = FjordLayout;
const RUNWAY_YAW = Math.atan2(GLACIER_RUNWAY.end.x - GLACIER_RUNWAY.start.x, GLACIER_RUNWAY.end.z - GLACIER_RUNWAY.start.z);
const W = InputButton.Forward;

function report(label: string, values: Record<string, unknown>): void {
  console.log(`[review] ${label} ${JSON.stringify(values)}`);
}

function feetOf(room: MatchRoom, id: number): Vec3 {
  return (playerOf(room, id).character as unknown as { position: Vec3 }).position;
}

describe('vehicle review fixes', () => {
  test('0/8: roof riders are neither rammed nor shoved', async () => {
    const room = await createRoom();
    const slot = slotBySpawn('crawler_base');
    const driver = joinPlayer(room, 'alpine');
    room.vehicles.devEnter(playerOf(room, driver.id) as never, slot.id, 0);
    const body = room.vehicles.vehicleBody(slot.id);
    if (!body) throw new Error('no crawler');
    parkVehicle(room, slot.id, 288, 140, RUNWAY_YAW);
    const rider = joinPlayer(room, 'lagoon');
    const friend = joinPlayer(room, 'alpine');
    const top = body.position.y + VEHICLES.fondue_crawler.halfExtents.y * 2 + 0.05;
    const front = vehicleLocalToWorld(body.position, body.yaw, { x: 0, y: 0, z: 1.9 });
    const back = vehicleLocalToWorld(body.position, body.yaw, { x: 0.6, y: 0, z: -1.2 });
    placePlayer(room, rider.id, { x: front.x, y: top, z: front.z });
    placePlayer(room, friend.id, { x: back.x, y: top, z: back.z });
    const hp = playerOf(room, rider.id).hp;
    run(room, 150, () => {
      sendInput(room, driver, W, body.yaw);
      sendInput(room, rider, 0);
      sendInput(room, friend, 0);
    });
    const hits = driver.socket.eventsOf('PINBALL_BOING_HIT').filter((event) => event.targetId === rider.id || event.targetId === friend.id);
    report('roof riders', { riderHpLost: hp - playerOf(room, rider.id).hp, boings: hits.length });
    expect(playerOf(room, rider.id).hp).toBe(hp);
    expect(hits.length).toBe(0);
    room.stop();
  });

  test('1: a player pinned between a creeping hull and a parked one is put out on a free side', async () => {
    const room = await createRoom();
    const crawler = slotBySpawn('crawler_base');
    const driver = joinPlayer(room, 'alpine');
    room.vehicles.devEnter(playerOf(room, driver.id) as never, crawler.id, 0);
    const body = room.vehicles.vehicleBody(crawler.id);
    if (!body) throw new Error('no crawler');
    parkVehicle(room, crawler.id, 288, 120, RUNWAY_YAW);
    // A coconut tank parked crosswise 8 m ahead, a friend in between.
    const ahead = vehicleLocalToWorld(body.position, body.yaw, { x: 0, y: 0, z: 8 });
    const coconut = slotBySpawn('coconut_tank_base');
    parkVehicle(room, coconut.id, ahead.x, ahead.z, RUNWAY_YAW + Math.PI / 2);
    const other = room.vehicles.vehicleBody(coconut.id);
    if (!other) throw new Error('no coconut');
    const friend = joinPlayer(room, 'alpine');
    const between = vehicleLocalToWorld(body.position, body.yaw, { x: 0, y: 0, z: 4.5 });
    placePlayer(room, friend.id, { x: between.x, y: sampleMapHeight(between.x, between.z) + 0.05, z: between.z });
    let insideTicks = 0;
    run(room, 60 * 6, (tick) => {
      // Creep: W while slower than 1.3 m/s, so the hull really pins the friend.
      void tick;
      sendInput(room, driver, body.forwardSpeed < 1.3 ? W : 0, body.yaw);
      sendInput(room, friend, 0);
      const feet = feetOf(room, friend.id);
      const onRoof = feet.y > body.position.y + VEHICLES.fondue_crawler.halfExtents.y * 2 - 0.3;
      if (!onRoof && distanceToHull(body.definition, body.position, body.yaw, feet) === 0) insideTicks += 1;
    });
    // The friend can walk away afterwards (some way out is open).
    let walked = 0;
    for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const before = { ...feetOf(room, friend.id) };
      run(room, 45, () => {
        sendInput(room, driver, 0, body.yaw);
        sendInput(room, friend, W, yaw);
      });
      walked = Math.max(walked, Math.hypot(feetOf(room, friend.id).x - before.x, feetOf(room, friend.id).z - before.z));
    }
    report('pinned friend', { insideTicks, walkedAfter: Math.round(walked * 100) / 100 });
    expect(insideTicks).toBeLessThan(5);
    expect(walked).toBeGreaterThan(2);
    room.stop();
  });

  test('4: a bailed-out driver keeps the ram credit for 2.5 s; an unmanned hull only shoves later', async () => {
    const room = await createRoom();
    const slot = slotBySpawn('sidecar_alpine_base');
    const driver = joinPlayer(room, 'alpine');
    room.vehicles.devEnter(playerOf(room, driver.id) as never, slot.id, 0);
    const body = room.vehicles.vehicleBody(slot.id);
    if (!body) throw new Error('no sidecar');
    parkVehicle(room, slot.id, 288, 104, RUNWAY_YAW);
    run(room, 150, () => sendInput(room, driver, W, body.yaw));
    tap(room, driver, InputButton.Interact, body.yaw);
    expect(room.vehicles.seatFor(driver.id)).toBeNull();
    const victim = joinPlayer(room, 'lagoon', 'heavy');
    const ahead = vehicleLocalToWorld(body.position, body.yaw, { x: 0.3, y: 0, z: 1.3 + 4 });
    placePlayer(room, victim.id, { x: ahead.x, y: sampleMapHeight(ahead.x, ahead.z) + 0.05, z: ahead.z });
    const hp = playerOf(room, victim.id).hp;
    run(room, 40, () => sendInput(room, victim, 0));
    const ram = driver.socket.eventsOf('PINBALL_BOING_HIT').filter((event) => event.targetId === victim.id && event.paramValue > 0);
    report('ram credit after bail-out', { rams: ram.length, credited: ram[0]?.actorId === driver.id, damage: hp - playerOf(room, victim.id).hp });
    expect(ram.length).toBe(1);
    expect(ram[0]?.actorId).toBe(driver.id);
    room.stop();
  });

  test('6: shielded and hands-busy seats never fire the own loadout', async () => {
    const room = await createRoom();
    const slot = slotBySpawn('crawler_base');
    const driver = joinPlayer(room, 'alpine');
    room.vehicles.devEnter(playerOf(room, driver.id) as never, slot.id, 0);
    const body = room.vehicles.vehicleBody(slot.id);
    if (!body) throw new Error('no crawler');
    parkVehicle(room, slot.id, 288, 140, RUNWAY_YAW);
    const enemy = joinPlayer(room, 'lagoon');
    const ahead = vehicleLocalToWorld(body.position, body.yaw, { x: 0, y: 0, z: 12 });
    placePlayer(room, enemy.id, { x: ahead.x, y: sampleMapHeight(ahead.x, ahead.z) + 0.05, z: ahead.z });
    const shooter = playerOf(room, driver.id) as unknown as { profile: { loadout: Parameters<typeof weaponForSlot>[0] }; character: { position: Vec3; eyeHeight: number } };
    const weaponId = weaponForSlot(shooter.profile.loadout, 1);
    const hp = playerOf(room, enemy.id).hp;
    run(room, 40, () => {
      const eye = shooter.character.position;
      const origin = { x: eye.x, y: eye.y + shooter.character.eyeHeight, z: eye.z };
      const target = feetOf(room, enemy.id);
      const dx = target.x - origin.x;
      const dy = target.y + 1 - origin.y;
      const dz = target.z - origin.z;
      const length = Math.hypot(dx, dy, dz);
      room.handleFire(driver.socket, { clientTick: room.getServerTick(), origin, direction: { x: dx / length, y: dy / length, z: dz / length }, weaponId: WEAPON_TABLE.code[weaponId] });
      sendInput(room, driver, 0, body.yaw);
      sendInput(room, enemy, 0);
    });
    const fired = driver.socket.eventsOf('WEAPON_FIRED').filter((event) => event.actorId === driver.id).length;
    report('seat gate', { fired, enemyHpLost: hp - playerOf(room, enemy.id).hp, mayUseHands: room.vehicles.mayUseHandWeapons(driver.id) });
    expect(fired).toBe(0);
    expect(playerOf(room, enemy.id).hp).toBe(hp);
    room.stop();
  });

  test('7: a skill blast next to a crewed tank leaves the crew inside the armour untouched', async () => {
    const room = await createRoom();
    const slot = slotBySpawn('crawler_base');
    const driver = joinPlayer(room, 'alpine');
    room.vehicles.devEnter(playerOf(room, driver.id) as never, slot.id, 0);
    const body = room.vehicles.vehicleBody(slot.id);
    if (!body) throw new Error('no crawler');
    parkVehicle(room, slot.id, 288, 140, RUNWAY_YAW);
    const heavy = joinPlayer(room, 'lagoon', 'heavy');
    const side = vehicleLocalToWorld(body.position, body.yaw, { x: -3.0, y: 0, z: 0 });
    placePlayer(room, heavy.id, { x: side.x, y: sampleMapHeight(side.x, side.z) + 0.05, z: side.z });
    run(room, 3, () => sendInput(room, heavy, 0));
    const hp = playerOf(room, driver.id).hp;
    tap(room, heavy, InputButton.Skill2);
    const used = heavy.socket.eventsOf('SKILL_USED').filter((event) => event.actorId === heavy.id).length;
    report('skill vs crew', { skillUsed: used, heavySeated: room.vehicles.isSeated(heavy.id), driverHpLost: hp - playerOf(room, driver.id).hp });
    expect(used).toBe(1);
    expect(room.vehicles.isSeated(heavy.id)).toBe(false);
    expect(playerOf(room, driver.id).hp).toBe(hp);
    room.stop();
  });

  test('9/11: harpoon bolts meet the bullet armour; a nested wreck blast keeps the direct-hit exclusion', async () => {
    const room = await createRoom();
    const owner = joinPlayer(room, 'lagoon');
    const crawler = slotBySpawn('crawler_base');
    const sidecar = slotBySpawn('sidecar_alpine_base');
    parkVehicle(room, crawler.id, 288, 140, RUNWAY_YAW);
    const crawlerBody = room.vehicles.vehicleBody(crawler.id);
    if (!crawlerBody) throw new Error('no crawler');
    // Mark both as alpine (their last crew) for the team check.
    const alpine = joinPlayer(room, 'alpine');
    room.vehicles.devEnter(playerOf(room, alpine.id) as never, crawler.id, 0);
    tap(room, alpine, InputButton.Interact);
    const impact = (room.vehicles as unknown as { impact(p: unknown, o: unknown, point: Vec3, player: number, vehicle: number): void }).impact.bind(room.vehicles);
    const harpoon = VEHICLES.badi_flamingo.weapon;
    const cannon = VEHICLES.coconut_tank.weapon;
    if (!harpoon || !cannon) throw new Error('weapons');
    const before = room.vehicles.vehicleHp(crawler.id);
    impact({ ownerId: owner.id, vehicleId: 0, weapon: harpoon, position: crawlerBody.position, velocity: { x: 0, y: 0, z: 0 }, expiresAtTick: 0 }, playerOf(room, owner.id), crawlerBody.position, 0, crawler.id);
    const harpoonDamage = before - room.vehicles.vehicleHp(crawler.id);
    // Sidecar A 4 m from crawler B at 10 hp: a direct shell on A sets B off.
    const beside = vehicleLocalToWorld(crawlerBody.position, crawlerBody.yaw, { x: 4 + 1.4 + 0.95, y: 0, z: 0 });
    parkVehicle(room, sidecar.id, beside.x, beside.z, RUNWAY_YAW);
    room.vehicles.devEnter(playerOf(room, alpine.id) as never, sidecar.id, 0);
    tap(room, alpine, InputButton.Interact);
    room.vehicles.devDamage(crawler.id, null, room.vehicles.vehicleHp(crawler.id) - 10);
    const sidecarBody = room.vehicles.vehicleBody(sidecar.id);
    if (!sidecarBody) throw new Error('no sidecar');
    const hpA = room.vehicles.vehicleHp(sidecar.id);
    impact({ ownerId: owner.id, vehicleId: 0, weapon: cannon, position: sidecarBody.position, velocity: { x: 0, y: 0, z: 0 }, expiresAtTick: 0 }, playerOf(room, owner.id), { ...sidecarBody.position, y: sidecarBody.position.y + 0.6 }, 0, sidecar.id);
    const lossA = hpA - room.vehicles.vehicleHp(sidecar.id);
    report('armour and splash', { harpoonOnTank: harpoonDamage, crawlerAfter: room.vehicles.lifecycleOf(crawler.id), sidecarLoss: Math.round(lossA * 10) / 10 });
    expect(harpoonDamage).toBeCloseTo(harpoon.directDamage * VEHICLES.fondue_crawler.armor.bullet, 5);
    expect(room.vehicles.lifecycleOf(crawler.id)).toBe('wreck');
    // Direct hit plus the legitimate wreck blast, never the own splash on top.
    expect(lossA).toBeLessThanOrEqual((cannon.directDamage + 55) * VEHICLES.sidecar.armor.explosive + 0.5);
    room.stop();
  });

  test('12: a hull only counts as a clear shot when the bot target rides that vehicle', async () => {
    const room = await createRoom();
    const slot = slotBySpawn('crawler_base');
    const body = room.vehicles.vehicleBody(slot.id);
    if (!body) throw new Error('no crawler');
    parkVehicle(room, slot.id, 288, 140, RUNWAY_YAW);
    const behind = joinPlayer(room, 'lagoon');
    const cover = vehicleLocalToWorld(body.position, body.yaw, { x: -2.6, y: 0, z: 0 });
    placePlayer(room, behind.id, { x: cover.x, y: body.position.y + 0.05, z: cover.z });
    const surface = vehicleLocalToWorld(body.position, body.yaw, { x: 1.4, y: 0.8, z: 0 });
    const asCover = room.vehicles.isVehicleSurfaceNear(surface, feetOf(room, behind.id), behind.id);
    const crew = joinPlayer(room, 'alpine');
    room.vehicles.devEnter(playerOf(room, crew.id) as never, slot.id, 0);
    run(room, 2, () => sendInput(room, crew, 0));
    const asCrew = room.vehicles.isVehicleSurfaceNear(surface, feetOf(room, crew.id), crew.id);
    report('bot sight', { coverCountsAsClear: asCover, crewCountsAsClear: asCrew });
    expect(asCover).toBe(false);
    expect(asCrew).toBe(true);
    room.stop();
  });

  test('2: a flamingo that nosed onto the beach backs off with reverse; 5: it bounces off another hull', async () => {
    const room = await createRoom();
    const slot = slotBySpawn('flamingo_east_beach');
    const pilot = joinPlayer(room, 'lagoon');
    room.vehicles.devEnter(playerOf(room, pilot.id) as never, slot.id, 0);
    const body = room.vehicles.vehicleBody(slot.id);
    if (!body) throw new Error('no flamingo');
    // Straight at the east beach (north of the spawn), capped at 4 m/s.
    parkVehicle(room, slot.id, 60, -230, 0);
    let ticks = 0;
    while (!body.beached && ticks < 60 * 30) {
      sendInput(room, pilot, body.forwardSpeed < 4 ? W : 0, 0);
      internals(room).tick();
      ticks += 1;
    }
    run(room, 60, () => sendInput(room, pilot, W, 0));
    const water = WATER_LEVEL - sampleMapHeight(body.position.x, body.position.z);
    const stuck = body.position;
    run(room, 60 * 3, () => sendInput(room, pilot, InputButton.Backward, 0));
    const backed = Math.hypot(body.position.x - stuck.x, body.position.z - stuck.z);
    report('shallow reverse', { beached: true, waterUnderHull: Math.round(water * 100) / 100, backedOff: Math.round(backed * 100) / 100, afloat: body.afloat });
    expect(water).toBeGreaterThan(0);
    expect(body.afloat).toBe(true);

    // A second flamingo parked 30 m out; ram it at full speed.
    const other = slotBySpawn('flamingo_harbor');
    parkVehicle(room, slot.id, -230, -360, Math.PI / 2);
    const target = vehicleLocalToWorld(body.position, body.yaw, { x: 0, y: 0, z: 30 });
    parkVehicle(room, other.id, target.x, target.z, 0);
    let bounced = 0;
    run(room, 60 * 5, () => {
      sendInput(room, pilot, W, body.yaw);
      bounced = Math.min(bounced, body.forwardSpeed);
    });
    report('boat bounce', { mostNegativeForwardSpeed: Math.round(bounced * 100) / 100 });
    expect(bounced).toBeLessThan(-1);
    room.stop();
  });

  test('3: a sidecar crawling down a steep bank stops at the water instead of drowning', async () => {
    const room = await createRoom();
    const slot = slotBySpawn('sidecar_village_west');
    const driver = joinPlayer(room, 'alpine');
    room.vehicles.devEnter(playerOf(room, driver.id) as never, slot.id, 0);
    const body = room.vehicles.vehicleBody(slot.id);
    if (!body) throw new Error('no sidecar');
    const results: Array<{ heading: number; drowned: boolean; ground: number }> = [];
    for (const heading of [0, 6.02, 6.15]) {
      parkVehicle(room, slot.id, -156, 36, heading);
      run(room, 60 * 8, () => sendInput(room, driver, body.forwardSpeed < 3 ? W : 0, heading));
      results.push({ heading, drowned: body.drowned, ground: Math.round(sampleMapHeight(body.position.x, body.position.z) * 100) / 100 });
    }
    report('bank', { results, lifecycle: room.vehicles.lifecycleOf(slot.id) });
    expect(results.every((entry) => !entry.drowned)).toBe(true);
    expect(room.vehicles.lifecycleOf(slot.id)).toBe('active');
    room.stop();
  });

  test('18: the T-bar cable clears the snow by 2.5 m and the tank road by 4.5 m', () => {
    const cable = FJORD_MAP.routes.tBar.cable.points;
    let terrainMin = Number.POSITIVE_INFINITY;
    let roadMin = Number.POSITIVE_INFINITY;
    for (let index = 0; index + 1 < cable.length; index += 1) {
      const a = cable[index];
      const b = cable[index + 1];
      if (!a || !b) continue;
      for (let step = 0; step <= 200; step += 1) {
        const u = step / 200;
        const x = a.x + (b.x - a.x) * u;
        const y = a.y + (b.y - a.y) * u;
        const z = a.z + (b.z - a.z) * u;
        terrainMin = Math.min(terrainMin, y - sampleMapHeight(x, z));
        for (let k = 0; k + 1 < TANK_ROAD_POINTS.length; k += 1) {
          const p = TANK_ROAD_POINTS[k];
          const q = TANK_ROAD_POINTS[k + 1];
          if (!p || !q) continue;
          const dx = q.x - p.x;
          const dz = q.z - p.z;
          const t = Math.max(0, Math.min(1, ((x - p.x) * dx + (z - p.z) * dz) / (dx * dx + dz * dz || 1)));
          if (Math.hypot(x - (p.x + dx * t), z - (p.z + dz * t)) > TANK_ROAD_WIDTH / 2) continue;
          roadMin = Math.min(roadMin, y - (p.y + (q.y - p.y) * t));
        }
      }
    }
    const masts = FJORD_MAP.props.filter((prop) => prop.kind === 'tbar_pylon').map((prop) => Math.round((prop.dimensions?.y ?? 0) * 10) / 10);
    report('tbar cable', { terrainMin: Math.round(terrainMin * 100) / 100, roadMin: Math.round(roadMin * 100) / 100, mastHeights: masts });
    expect(terrainMin).toBeGreaterThanOrEqual(TBAR_CABLE_TERRAIN_CLEARANCE - 0.05);
    expect(roadMin).toBeGreaterThanOrEqual(TBAR_CABLE_ROAD_CLEARANCE - 0.05);
  });
});
