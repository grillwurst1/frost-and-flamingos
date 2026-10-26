/**
 * Climate Conquest (4T) x vehicles (4V) x hens (3H) x drifter (3G) after the
 * merge: the 15 s results ceasefire also holds for hulls, rams and hens; a
 * hull parked on a spawn pad makes the pad occupied; the round reset empties
 * every seat before anyone respawns and clears drifter support; a class
 * change that applies in a seat frees it (drifters, mascots) or re-seats the
 * new body.
 *
 *   bun test apps/server/test/conquest-vehicles.test.ts
 */
import { describe, expect, test } from 'bun:test';
import {
  FJORD_TOWERS,
  FjordLayout,
  INTERMISSION_TICKS,
  VEHICLES,
  createDefaultProfile,
  distanceToHull,
  sampleMapHeight,
  vehicleLocalToWorld,
  type ClassId,
  type CritterState,
  type Faction,
  type Vec3,
} from '@frost-and-flamingos/shared';
import { MatchRoom } from '../src/rooms/match-room';
import {
  InputButton,
  createRoom,
  joinPlayer,
  parkVehicle,
  placePlayer,
  playerOf,
  run,
  sendInput,
  slotByKind,
  slotBySpawn,
  tap,
  type TestPlayer,
} from './vehicle-helpers';

const { GLACIER_RUNWAY } = FjordLayout;
const W = InputButton.Forward;
const RUNWAY_YAW = Math.atan2(GLACIER_RUNWAY.end.x - GLACIER_RUNWAY.start.x, GLACIER_RUNWAY.end.z - GLACIER_RUNWAY.start.z);
const RUNWAY = { x: 288, z: 140 };

interface RoomProbe {
  critters: { states(): CritterState[] };
  explode(owner: unknown, position: Vec3, damage: number, radius: number, weaponId: string | null): void;
  isSpawnOccupied(position: Vec3, selfId: number): boolean;
  spawnFor(faction: 'alpine' | 'lagoon', selfId?: number): { position: Vec3; yaw: number };
}

function probe(room: MatchRoom): RoomProbe {
  return room as unknown as RoomProbe;
}

/** Room-side fields of a player these tests read beyond the shared helpers. */
interface PlayerProbe {
  profile: { faction: Faction; cosmetics: { classId: ClassId } };
  spawnPosition: Vec3;
  kills: number;
  support: number;
  supportVitality: number;
  supportMagazines: number;
  character: { position: Vec3; collider: { isEnabled(): boolean } };
}

function inner(room: MatchRoom, player: TestPlayer): PlayerProbe {
  return playerOf(room, player.id) as unknown as PlayerProbe;
}

/** A wardrobe change from the player's client. */
function wardrobe(room: MatchRoom, player: TestPlayer, classId: ClassId): void {
  const faction = inner(room, player).profile.faction;
  room.handleProfileUpdate(player.socket, { ...createDefaultProfile(`Swap ${player.id}`, classId), faction });
}

/** Ends the live round on tickets; the next tick starts the results intermission. */
function endRound(room: MatchRoom): void {
  room.devConquest({ faction: 'lagoon', tickets: 0 });
  run(room, 2);
  expect(room.isCeasefire()).toBe(true);
}

function livingHen(room: MatchRoom): CritterState {
  const hen = probe(room).critters.states().find((critter) => critter.alive);
  if (!hen) throw new Error('no living hen');
  return hen;
}

describe('results ceasefire x vehicles and hens', () => {
  test('hulls take no damage, rams only shove and hens survive until the next round', async () => {
    // Hens on (a fixed seed), no bots.
    const room = await MatchRoom.create({ bots: 0, critterSeed: 0x5eed });
    const slot = slotByKind('fondue_crawler');
    const driver = joinPlayer(room, 'alpine', 'allrounder', 'Driver');
    expect(room.vehicles.devEnter(playerOf(room, driver.id) as never, slot.id, 0)).toBe(true);
    const body = room.vehicles.vehicleBody(slot.id);
    if (!body) throw new Error('no crawler');
    parkVehicle(room, slot.id, RUNWAY.x, RUNWAY.z, RUNWAY_YAW);
    run(room, 150, () => sendInput(room, driver, W, body.yaw));
    endRound(room);

    // A ram at full speed during the results: a shove, no BOING damage.
    const ahead = vehicleLocalToWorld(body.position, body.yaw, { x: 0, y: 0, z: 2.3 + 3.2 });
    const victim = joinPlayer(room, 'lagoon', 'allrounder', 'Victim');
    placePlayer(room, victim.id, { x: ahead.x, y: sampleMapHeight(ahead.x, ahead.z) + 0.05, z: ahead.z });
    const hp = playerOf(room, victim.id).hp;
    run(room, 40, () => {
      sendInput(room, driver, W, body.yaw);
      sendInput(room, victim, 0);
    });
    expect(room.isCeasefire()).toBe(true);
    const rams = driver.socket.eventsOf('PINBALL_BOING_HIT').filter((event) => event.targetId === victim.id && event.paramValue > 0);
    expect(rams.length).toBe(0);
    expect(playerOf(room, victim.id).hp).toBe(hp);

    // Shells, splash and wreck blasts: the hull keeps its health.
    const hullHp = room.vehicles.vehicleHp(slot.id);
    expect(room.vehicles.devDamage(slot.id, playerOf(room, victim.id) as never, 400)).toBe(true);
    probe(room).explode(playerOf(room, victim.id), { ...body.position }, 120, 6, 'bazooka');
    expect(room.vehicles.vehicleHp(slot.id)).toBe(hullHp);
    expect(room.vehicles.lifecycleOf(slot.id)).toBe('active');
    expect(driver.socket.eventsOf('VEHICLE_DAMAGED').length).toBe(0);

    // A blast on a hen spares it.
    const hen = livingHen(room);
    probe(room).explode(playerOf(room, victim.id), { ...hen.position }, 120, 3, 'bazooka');
    expect(probe(room).critters.states().find((critter) => critter.id === hen.id)?.alive).toBe(true);
    expect(driver.socket.eventsOf('CRITTER_KILLED').length).toBe(0);

    // The next round is live again: the same blasts hurt the hull and bag the hen.
    run(room, INTERMISSION_TICKS + 2);
    expect(room.isCeasefire()).toBe(false);
    const fresh = room.vehicles.vehicleHp(slot.id);
    expect(room.vehicles.devDamage(slot.id, playerOf(room, victim.id) as never, 400)).toBe(true);
    expect(room.vehicles.vehicleHp(slot.id)).toBeLessThan(fresh);
    const target = livingHen(room);
    probe(room).explode(playerOf(room, victim.id), { ...target.position }, 120, 3, 'bazooka');
    expect(probe(room).critters.states().find((critter) => critter.id === target.id)?.alive).toBe(false);
    expect(driver.socket.eventsOf('CRITTER_KILLED').length).toBe(1);
    room.stop();
  });
});

describe('spawn pads x parked hulls', () => {
  test('a hull parked on a pad makes it occupied; spawns pick another pad', async () => {
    const room = await createRoom();
    // Peak Guard holds Tower C at the round start: its summit pads are live.
    const tower = FJORD_TOWERS.find((entry) => entry.id === 'tower_c');
    const pad = tower?.spawnPads.find((entry) => entry.faction === 'alpine');
    if (!pad) throw new Error('no Peak Guard Tower C pad');
    expect(probe(room).isSpawnOccupied(pad.position, 0)).toBe(false);

    // The summit crawler (live while Peak Guard holds C) parks right on the pad.
    const crawler = slotBySpawn('crawler_summit');
    expect(room.vehicles.lifecycleOf(crawler.id)).toBe('active');
    expect(room.vehicles.devPark(crawler.id, pad.position.x, pad.position.z, pad.rotationY)).toBe(true);
    run(room, 2);
    expect(room.vehicles.hullCovers(pad.position)).toBe(true);
    expect(probe(room).isSpawnOccupied(pad.position, 0)).toBe(true);
    for (let draw = 0; draw < 400; draw += 1) {
      const spawn = probe(room).spawnFor('alpine');
      expect(Math.hypot(spawn.position.x - pad.position.x, spawn.position.z - pad.position.z)).toBeGreaterThan(0.5);
    }

    // Driven away again, the pad is free.
    expect(room.vehicles.devPark(crawler.id, pad.position.x + 30, pad.position.z + 30, 0)).toBe(true);
    run(room, 2);
    expect(probe(room).isSpawnOccupied(pad.position, 0)).toBe(false);
    room.stop();
  });
});

describe('round reset x vehicles and drifters', () => {
  test('every seat is empty before the respawn loop; hulls go home; drifter support restarts at 0', async () => {
    const room = await createRoom();
    const tank = slotByKind('coconut_tank');
    const driver = joinPlayer(room, 'lagoon', 'allrounder', 'Driver');
    expect(room.vehicles.devEnter(playerOf(room, driver.id) as never, tank.id, 0)).toBe(true);
    const home = tank.spawn.position;
    expect(room.vehicles.devPark(tank.id, home.x + 25, home.z + 18, 0.4)).toBe(true);
    const drifter = joinPlayer(room, 'alpine', 'drifter', 'Drifter');
    const support = inner(room, drifter);
    expect(support.profile.cosmetics.classId).toBe('drifter');
    support.support = 12;
    support.supportVitality = 1234;
    support.supportMagazines = 7.5;

    endRound(room);
    run(room, INTERMISSION_TICKS + 2);
    expect(room.isCeasefire()).toBe(false);

    expect(room.vehicles.seatFor(driver.id)).toBeNull();
    const body = room.vehicles.vehicleBody(tank.id);
    if (!body) throw new Error('tank missing after the reset');
    expect(Math.hypot(body.position.x - home.x, body.position.z - home.z)).toBeLessThan(1);
    // The respawn put the driver on a pad and nothing moved them afterwards
    // (an eject after the respawn would leave them beside the old hull).
    const feet = inner(room, driver).character.position;
    const pad = inner(room, driver).spawnPosition;
    expect(Math.hypot(feet.x - pad.x, feet.z - pad.z)).toBeLessThan(0.5);
    expect(distanceToHull(VEHICLES.coconut_tank, body.position, body.yaw, feet)).toBeGreaterThan(2);
    expect(inner(room, driver).character.collider.isEnabled()).toBe(true);

    expect(support.support).toBe(0);
    expect(support.supportVitality).toBe(0);
    expect(support.supportMagazines).toBe(0);
    expect(support.kills).toBe(0);
    room.stop();
  });
});

describe('class changes x seats', () => {
  test('a class change that applies in a seat frees it for a drifter or mascot and re-seats a soldier', async () => {
    const room = await createRoom();
    const crawler = slotByKind('fondue_crawler');
    const driver = joinPlayer(room, 'alpine', 'allrounder', 'Driver');
    const gunner = joinPlayer(room, 'alpine', 'heavy', 'Gunner');
    expect(room.vehicles.devEnter(playerOf(room, driver.id) as never, crawler.id, 0)).toBe(true);
    expect(room.vehicles.devEnter(playerOf(room, gunner.id) as never, crawler.id, 1)).toBe(true);
    run(room, 2);
    // During the results a wardrobe change applies at once (4T rule).
    endRound(room);
    wardrobe(room, driver, 'drifter');
    wardrobe(room, gunner, 'infiltrator');
    expect(inner(room, driver).profile.cosmetics.classId).toBe('drifter');
    expect(inner(room, gunner).profile.cosmetics.classId).toBe('infiltrator');
    run(room, 1);
    // The drifter may never ride: her seat is freed and she stands beside the hull.
    expect(room.vehicles.seatFor(driver.id)).toBeNull();
    expect(inner(room, driver).character.collider.isEnabled()).toBe(true);
    // The infiltrator keeps the gunner seat with the rebuilt (collider-free) body.
    expect(room.vehicles.seatFor(gunner.id)).toEqual({ vehicleId: crawler.id, seat: 1 });
    expect(inner(room, gunner).character.collider.isEnabled()).toBe(false);
    // F next to the hull never seats a drifter.
    tap(room, driver, InputButton.Interact);
    run(room, 2);
    expect(room.vehicles.seatFor(driver.id)).toBeNull();
    expect(room.vehicles.devEnter(playerOf(room, driver.id) as never, crawler.id, 0)).toBe(true);
    run(room, 1);
    expect(room.vehicles.seatFor(driver.id)).toBeNull();
    room.stop();
  });
});
