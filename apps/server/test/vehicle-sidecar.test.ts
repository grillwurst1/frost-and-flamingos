import { describe, expect, test } from 'bun:test';
import {
  FjordLayout,
  VEHICLES,
  WEAPON_TABLE,
  sampleMapHeight,
  surfaceTagAt,
  vehicleLocalToWorld,
  weaponForSlot,
} from '@frost-and-flamingos/shared';
import { HORN_BUTTON } from '../src/rooms/vehicle-manager';
import { InputButton, createRoom, joinPlayer, parkVehicle, placePlayer, playerOf, run, sendInput, slotBySpawn, tap } from './vehicle-helpers';

const { GLACIER_RUNWAY } = FjordLayout;
const W = InputButton.Forward;
const RUNWAY_YAW = Math.atan2(GLACIER_RUNWAY.end.x - GLACIER_RUNWAY.start.x, GLACIER_RUNWAY.end.z - GLACIER_RUNWAY.start.z);

function wrap(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

describe('sidecar motorcycle', () => {
  test('reaches 19 m/s on the village cobbles and is slower on snow', async () => {
    const room = await createRoom();
    const slot = slotBySpawn('sidecar_village_west');
    const driver = joinPlayer(room, 'alpine');
    room.vehicles.devEnter(playerOf(room, driver.id) as never, slot.id, 0);
    const body = room.vehicles.vehicleBody(slot.id);
    if (!body) throw new Error('no sidecar');
    // A clear 40 m cobbled straight along the west side of the square.
    parkVehicle(room, slot.id, -40, -36, 0);
    expect(surfaceTagAt(-40, -36, body.position.y)).toBe('cobblestone');
    let top = 0;
    run(room, 150, () => {
      sendInput(room, driver, W, body.yaw);
      top = Math.max(top, body.forwardSpeed);
    });
    expect(top).toBeGreaterThan(14);
    expect(top).toBeLessThanOrEqual(19.01);
    // Snow (glacier runway): top speed drops to 82 %.
    parkVehicle(room, slot.id, 288, 120, RUNWAY_YAW);
    top = 0;
    run(room, 60 * 6, () => {
      sendInput(room, driver, W, body.yaw);
      top = Math.max(top, body.forwardSpeed);
    });
    expect(surfaceTagAt(body.position.x, body.position.z, body.position.y)).toBe('snow');
    expect(top).toBeGreaterThan(14);
    expect(top).toBeLessThanOrEqual(19 * 0.82 + 0.01);
    room.stop();
  });

  test('Space + steer drifts: more yaw and side slip than a plain turn', async () => {
    const results: Array<{ yaw: number; slip: number }> = [];
    for (const handbrake of [false, true]) {
      const room = await createRoom();
      const slot = slotBySpawn('sidecar_alpine_base');
      const driver = joinPlayer(room, 'alpine');
      room.vehicles.devEnter(playerOf(room, driver.id) as never, slot.id, 0);
      const body = room.vehicles.vehicleBody(slot.id);
      if (!body) throw new Error('no sidecar');
      parkVehicle(room, slot.id, 290, 112, RUNWAY_YAW);
      run(room, 150, () => sendInput(room, driver, W, body.yaw));
      const yaw0 = body.yaw;
      let slip = 0;
      run(room, 40, () => {
        sendInput(room, driver, W | InputButton.Right | (handbrake ? InputButton.Jump : 0), body.yaw);
        const velocity = body.velocity;
        slip = Math.max(slip, Math.abs(velocity.x * Math.cos(body.yaw) - velocity.z * Math.sin(body.yaw)));
      });
      results.push({ yaw: Math.abs(wrap(body.yaw - yaw0)), slip });
      room.stop();
    }
    const [plain, drift] = results;
    expect(plain && drift && drift.yaw > plain.yaw * 1.15).toBe(true);
    expect(plain && drift && drift.slip > plain.slip + 1).toBe(true);
  });

  test('horn honks with a cooldown; the sidecar passenger fires their own weapon; C switches seats', async () => {
    const room = await createRoom();
    const slot = slotBySpawn('sidecar_village_east');
    const driver = joinPlayer(room, 'lagoon');
    const passenger = joinPlayer(room, 'lagoon', 'allrounder');
    room.vehicles.devEnter(playerOf(room, driver.id) as never, slot.id, 0);
    // The passenger climbs in with E from beside the tub.
    const body = room.vehicles.vehicleBody(slot.id);
    if (!body) throw new Error('no sidecar');
    const beside = vehicleLocalToWorld(body.position, body.yaw, { x: -2.1, y: 0, z: -0.2 });
    placePlayer(room, passenger.id, { x: beside.x, y: sampleMapHeight(beside.x, beside.z) + 0.05, z: beside.z });
    run(room, 2, () => sendInput(room, passenger, 0));
    tap(room, passenger, InputButton.Interact);
    expect(room.vehicles.seatFor(passenger.id)).toEqual({ vehicleId: slot.id, seat: 1 });
    expect(room.vehicles.isShielded(passenger.id)).toBe(false);

    tap(room, driver, HORN_BUTTON);
    tap(room, driver, HORN_BUTTON);
    expect(driver.socket.eventsOf('VEHICLE_HORN').length).toBe(1);
    run(room, 60, () => sendInput(room, driver, 0));
    tap(room, driver, HORN_BUTTON);
    expect(driver.socket.eventsOf('VEHICLE_HORN').length).toBe(2);

    // Hand weapon from the tub.
    const passengerPlayer = playerOf(room, passenger.id) as unknown as { profile: { loadout: Parameters<typeof weaponForSlot>[0] }; character: { position: { x: number; y: number; z: number }; eyeHeight: number } };
    const weaponId = weaponForSlot(passengerPlayer.profile.loadout, 1);
    const eye = passengerPlayer.character.position;
    room.handleFire(passenger.socket, {
      clientTick: room.getServerTick(),
      origin: { x: eye.x, y: eye.y + passengerPlayer.character.eyeHeight, z: eye.z },
      direction: { x: 0, y: 0, z: 1 },
      weaponId: WEAPON_TABLE.code[weaponId],
    });
    run(room, 2, () => sendInput(room, passenger, 0, body.yaw + 1.2, 0));
    expect(driver.socket.eventsOf('WEAPON_FIRED').filter((event) => event.actorId === passenger.id).length).toBe(1);

    // The driver leaves, the passenger slides over to the bike with C.
    tap(room, driver, InputButton.Interact);
    tap(room, passenger, InputButton.Crouch);
    expect(room.vehicles.seatFor(passenger.id)).toEqual({ vehicleId: slot.id, seat: 0 });
    room.stop();
  });

  test('roadkill at speed deals 75-120 and launches the victim', async () => {
    const room = await createRoom();
    const slot = slotBySpawn('sidecar_alpine_base');
    const driver = joinPlayer(room, 'alpine');
    room.vehicles.devEnter(playerOf(room, driver.id) as never, slot.id, 0);
    const body = room.vehicles.vehicleBody(slot.id);
    if (!body) throw new Error('no sidecar');
    parkVehicle(room, slot.id, 288, 112, RUNWAY_YAW);
    run(room, 160, () => sendInput(room, driver, W, body.yaw));
    const victim = joinPlayer(room, 'lagoon', 'heavy');
    const ahead = vehicleLocalToWorld(body.position, body.yaw, { x: 0.5, y: 0, z: 1.3 + 6 });
    placePlayer(room, victim.id, { x: ahead.x, y: sampleMapHeight(ahead.x, ahead.z) + 0.05, z: ahead.z });
    const hp = playerOf(room, victim.id).hp;
    run(room, 45, () => {
      sendInput(room, driver, W, body.yaw);
      sendInput(room, victim, 0);
    });
    const hits = driver.socket.eventsOf('PINBALL_BOING_HIT').filter((event) => event.targetId === victim.id && event.paramValue > 0);
    expect(hits.length).toBe(1);
    const damage = hp - playerOf(room, victim.id).hp;
    expect(damage).toBeGreaterThanOrEqual(VEHICLES.sidecar.ram.minDamage);
    expect(damage).toBeLessThanOrEqual(VEHICLES.sidecar.ram.maxDamage);
    room.stop();
  });
});
