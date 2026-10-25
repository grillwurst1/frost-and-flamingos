import { describe, expect, test } from 'bun:test';
import {
  FjordLayout,
  InputButton,
  PhysicsWorld,
  VEHICLE_FLAG,
  decodeSnapshot,
  encodeSnapshot,
  vehicleLocalToWorld,
  type PlayerInput,
  type VehicleMotorState,
  type VehicleSnapshot,
  type WorldSnapshot,
} from '@frost-and-flamingos/shared';
import { createRoom, internals, joinPlayer, parkVehicle, placePlayer, playerOf, run, sendInput, slotByKind, slotBySpawn } from './vehicle-helpers';

const { GLACIER_RUNWAY } = FjordLayout;
const RUNWAY_YAW = Math.atan2(GLACIER_RUNWAY.end.x - GLACIER_RUNWAY.start.x, GLACIER_RUNWAY.end.z - GLACIER_RUNWAY.start.z);

function stateFrom(vehicle: VehicleSnapshot): VehicleMotorState {
  return {
    position: { ...vehicle.position },
    yaw: vehicle.yaw,
    velocity: { ...vehicle.velocity },
    yawRate: vehicle.yawRate,
    steer: vehicle.steer,
    turretYaw: vehicle.turretYaw,
    turretPitch: vehicle.turretPitch,
    grounded: (vehicle.flags & VEHICLE_FLAG.Grounded) !== 0,
    beached: (vehicle.flags & VEHICLE_FLAG.Beached) !== 0,
    afloat: (vehicle.flags & VEHICLE_FLAG.Afloat) !== 0,
    handbrake: (vehicle.flags & VEHICLE_FLAG.Handbrake) !== 0,
    boostTicks: vehicle.boostTicks,
    boostCooldownTicks: vehicle.boostCooldownTicks,
    weaponCooldownTicks: vehicle.weaponCooldownTicks,
  };
}

function sequenceAfter(a: number, b: number): boolean {
  const difference = (a - b + 0x10000) & 0xffff;
  return difference !== 0 && difference < 0x8000;
}

describe('vehicle networking', () => {
  test('the vehicle block survives encode/decode within wire precision', () => {
    const vehicle: VehicleSnapshot = {
      id: 7,
      type: 2,
      position: { x: -130.37, y: 3.11, z: -139.9 },
      yaw: -2.5,
      health: 412,
      velocity: { x: 6.25, y: -0.5, z: -3.1 },
      yawRate: 0.731,
      steer: -0.21,
      turretYaw: 2.9,
      turretPitch: 0.12,
      flags: VEHICLE_FLAG.Grounded | VEHICLE_FLAG.Handbrake,
      boostTicks: 150,
      boostCooldownTicks: 420,
      weaponCooldownTicks: 180,
      seats: [12, 0],
    };
    const snapshot: WorldSnapshot = {
      serverTick: 99,
      weatherBalance: 0,
      windAngle: 0,
      windStrength: 0,
      ticketsAlpine: 50,
      ticketsLagoon: 50,
      turretStates: 0,
      players: [],
      vehicles: [vehicle],
    };
    const decoded = decodeSnapshot(encodeSnapshot(snapshot))?.vehicles[0];
    expect(decoded).toBeDefined();
    if (!decoded) return;
    expect(decoded.id).toBe(7);
    expect(decoded.type).toBe(2);
    expect(decoded.health).toBe(412);
    expect(decoded.seats).toEqual([12, 0]);
    expect(decoded.flags).toBe(vehicle.flags);
    expect(decoded.boostTicks).toBe(150);
    expect(decoded.boostCooldownTicks).toBe(420);
    expect(decoded.weaponCooldownTicks).toBe(180);
    expect(Math.abs(decoded.position.x - vehicle.position.x)).toBeLessThan(0.0126);
    expect(Math.abs(decoded.velocity.z - vehicle.velocity.z)).toBeLessThan(0.008);
    expect(Math.abs(decoded.yaw - vehicle.yaw)).toBeLessThan(0.0002);
    expect(Math.abs(decoded.turretYaw - vehicle.turretYaw)).toBeLessThan(0.0002);
    expect(Math.abs(decoded.yawRate - vehicle.yawRate)).toBeLessThan(0.0006);
    expect(Math.abs(decoded.steer - vehicle.steer)).toBeLessThan(0.0006);
  });

  test('driver prediction stays within the reconcile threshold of the server', async () => {
    for (const spawn of ['crawler_base', 'sidecar_alpine_base'] as const) {
      const room = await createRoom();
      const slot = slotBySpawn(spawn);
      const driver = joinPlayer(room, 'alpine');
      room.vehicles.devEnter(playerOf(room, driver.id) as never, slot.id, 0);
      parkVehicle(room, slot.id, 290, 112, RUNWAY_YAW);
      run(room, 4, () => sendInput(room, driver, 0, RUNWAY_YAW));
      const server = room.vehicles.vehicleBody(slot.id);
      if (!server) throw new Error('no vehicle');
      // Client prediction world: same blueprint, its own hull.
      const client = await PhysicsWorld.create();
      const latestVehicle = driver.socket.latest?.vehicles.find((entry) => entry.id === slot.id);
      if (!latestVehicle) throw new Error('no snapshot');
      const hull = client.createVehicle(slot.kind, latestVehicle.position, latestVehicle.yaw);
      hull.restore(stateFrom(latestVehicle));
      const pending: Array<{ input: PlayerInput; state: VehicleMotorState; previous: number }> = [];
      let worst = 0;
      let corrections = 0;
      let lastSnapshotTick = driver.socket.latest?.serverTick ?? 0;
      for (let tick = 0; tick < 60 * 8; tick += 1) {
        const steer = tick % 180 < 60 ? InputButton.Right : tick % 180 < 90 ? InputButton.Left : 0;
        const buttons = InputButton.Forward | steer | (spawn === 'sidecar_alpine_base' && tick % 120 > 100 ? InputButton.Jump : 0);
        const input = sendInput(room, driver, buttons, RUNWAY_YAW + 0.3, 0.05);
        const previous = hull.driverButtons;
        hull.simulate(input, slot.kind === 'fondue_crawler' ? input : null, true);
        client.step();
        pending.push({ input, state: hull.state, previous });
        internals(room).tick();
        const snapshot = driver.socket.latest;
        if (!snapshot || snapshot.serverTick === lastSnapshotTick) continue;
        lastSnapshotTick = snapshot.serverTick;
        const vehicle = snapshot.vehicles.find((entry) => entry.id === slot.id);
        const local = snapshot.players.find((player) => player.id === driver.id);
        if (!vehicle || !local) continue;
        let acked: (typeof pending)[number] | undefined;
        while (pending.length > 0 && !sequenceAfter(pending[0]?.input.sequence ?? 0, local.lastProcessedInput)) acked = pending.shift();
        if (!acked) continue;
        const error = Math.hypot(
          acked.state.position.x - vehicle.position.x,
          acked.state.position.y - vehicle.position.y,
          acked.state.position.z - vehicle.position.z,
        );
        worst = Math.max(worst, error);
        if (error > 0.15) {
          corrections += 1;
          hull.restore(stateFrom(vehicle), pending[0]?.previous ?? hull.driverButtons);
          for (const entry of pending) {
            hull.simulate(entry.input, slot.kind === 'fondue_crawler' ? entry.input : null, true);
            client.step();
            entry.state = hull.state;
          }
        }
      }
      // Same motor, same inputs: only wire quantisation separates the two.
      expect(worst).toBeLessThan(0.15);
      expect(corrections).toBe(0);
      expect(Math.hypot(hull.position.x - server.position.x, hull.position.z - server.position.z)).toBeLessThan(0.15);
      client.dispose();
      room.stop();
    }
  });
});

describe('bots and vehicles', () => {
  test('a bot sidesteps an enemy tank about to run it over', async () => {
    const room = await createRoom();
    const slot = slotByKind('fondue_crawler');
    const driver = joinPlayer(room, 'alpine');
    room.vehicles.devEnter(playerOf(room, driver.id) as never, slot.id, 0);
    const body = room.vehicles.vehicleBody(slot.id);
    if (!body) throw new Error('no crawler');
    parkVehicle(room, slot.id, 290, 112, RUNWAY_YAW);
    run(room, 120, () => sendInput(room, driver, InputButton.Forward, body.yaw));
    const victim = joinPlayer(room, 'lagoon');
    const ahead = vehicleLocalToWorld(body.position, body.yaw, { x: 0.4, y: 0, z: 2.3 + 9 });
    placePlayer(room, victim.id, { x: ahead.x, y: body.position.y, z: ahead.z });
    const pretendBot = { ...playerOf(room, victim.id), isBot: true } as never;
    const idle: PlayerInput = { sequence: 1, buttons: 0, yaw: 0, pitch: 0, weaponSlot: 1 };
    const adjusted = room.vehicles.botAdjust(pretendBot, idle);
    expect(adjusted.buttons & InputButton.Sprint).not.toBe(0);
    expect(adjusted.buttons & InputButton.Forward).not.toBe(0);
    // Runs roughly perpendicular to the tank's path.
    const across = Math.abs(Math.sin(adjusted.yaw - body.yaw));
    expect(across).toBeGreaterThan(0.85);
    // A friendly tank or a parked one is ignored.
    const parkedRoom = await createRoom();
    const friend = joinPlayer(parkedRoom, 'lagoon');
    const untouched = parkedRoom.vehicles.botAdjust({ ...playerOf(parkedRoom, friend.id), isBot: true } as never, idle);
    expect(untouched).toBe(idle);
    parkedRoom.stop();
    room.stop();
  });

  test('bots shoot at a crewed enemy tank (the hull takes the hits)', async () => {
    const room = await MatchRoomWithOneBot();
    const slot = slotByKind('coconut_tank');
    const driver = joinPlayer(room.room, 'lagoon');
    room.room.vehicles.devEnter(playerOf(room.room, driver.id) as never, slot.id, 0);
    // Park the tank on open snow 20 m in front of the alpine bot.
    const bot = room.bot;
    const feet = bot.character.position;
    parkVehicle(room.room, slot.id, feet.x + 20, feet.z, -Math.PI / 2);
    run(room.room, 60 * 12, () => sendInput(room.room, driver, 0, 0));
    const hits = driver.socket.eventsOf('VEHICLE_DAMAGED').filter((event) => event.actorId === bot.id && event.targetId === slot.id);
    expect(hits.length).toBeGreaterThan(0);
    // The driver inside the armour is never hit directly.
    expect(driver.socket.eventsOf('COMIC_HIT').filter((event) => event.targetId === driver.id && event.actorId === bot.id).length).toBe(0);
    room.room.stop();
  });
});

/** A room with exactly one alpine human-class bot standing on the open runway. */
async function MatchRoomWithOneBot(): Promise<{ room: Awaited<ReturnType<typeof createRoom>>; bot: ReturnType<typeof playerOf> & { id: number } }> {
  const { MatchRoom } = await import('../src/rooms/match-room');
  const room = await MatchRoom.create();
  const players = internals(room).players;
  let keep: number | null = null;
  for (const [id, player] of [...players]) {
    const bot = player as unknown as { isBot: boolean; profile: { faction: string; cosmetics: { classId: string } } };
    if (!bot.isBot) continue;
    if (keep === null && bot.profile.faction === 'alpine' && bot.profile.cosmetics.classId !== 'mascot') {
      keep = id;
      continue;
    }
    players.delete(id);
    (room as unknown as { physics: { removeCharacter(c: unknown): void } }).physics.removeCharacter(player.character);
  }
  if (keep === null) throw new Error('no alpine bot');
  const bot = playerOf(room, keep);
  placePlayer(room, keep, { x: 286, y: 57.05, z: 150 });
  bot.spawnProtectionUntil = 0;
  return { room, bot: bot as never };
}
