/**
 * Climate Conquest (4T) x vehicles (4V) x hens (3H) x drifter (3G) after the
 * merge: the 15 s results ceasefire also holds for hulls, rams and hens.
 *
 *   bun test apps/server/test/conquest-vehicles.test.ts
 */
import { describe, expect, test } from 'bun:test';
import {
  FjordLayout,
  INTERMISSION_TICKS,
  sampleMapHeight,
  vehicleLocalToWorld,
  type CritterState,
  type Vec3,
} from '@frost-and-flamingos/shared';
import { MatchRoom } from '../src/rooms/match-room';
import { InputButton, joinPlayer, parkVehicle, placePlayer, playerOf, run, sendInput, slotByKind } from './vehicle-helpers';

const { GLACIER_RUNWAY } = FjordLayout;
const W = InputButton.Forward;
const RUNWAY_YAW = Math.atan2(GLACIER_RUNWAY.end.x - GLACIER_RUNWAY.start.x, GLACIER_RUNWAY.end.z - GLACIER_RUNWAY.start.z);
const RUNWAY = { x: 288, z: 140 };

interface RoomProbe {
  critters: { states(): CritterState[] };
  explode(owner: unknown, position: Vec3, damage: number, radius: number, weaponId: string | null): void;
}

function probe(room: MatchRoom): RoomProbe {
  return room as unknown as RoomProbe;
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
