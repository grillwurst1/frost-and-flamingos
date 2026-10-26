import RAPIER from '@dimforge/rapier3d-compat';
import { describe, expect, test } from 'bun:test';
import {
  FjordLayout,
  VEHICLES,
  WEAPON_TABLE,
  sampleMapHeight,
  surfaceTagAt,
  vehicleLocalToWorld,
  type PhysicsWorld,
} from '@frost-and-flamingos/shared';
import {
  InputButton,
  createRoom,
  drivePath,
  joinPlayer,
  parkVehicle,
  playerOf,
  run,
  sendInput,
  slotByKind,
  slotBySpawn,
} from './vehicle-helpers';

const { COASTAL_RAMP_POINTS, GLACIER_RUNWAY } = FjordLayout;
const W = InputButton.Forward;
const RUNWAY_YAW = Math.atan2(GLACIER_RUNWAY.end.x - GLACIER_RUNWAY.start.x, GLACIER_RUNWAY.end.z - GLACIER_RUNWAY.start.z);

function physicsOf(room: unknown): PhysicsWorld {
  return (room as { physics: PhysicsWorld }).physics;
}

/** A 20 m plank ramp rising at `angle` from the runway snow, ahead of (x, z) along yaw. */
function addRamp(physics: PhysicsWorld, x: number, z: number, yaw: number, angle: number): void {
  const length = 20;
  const ground = sampleMapHeight(x, z);
  const rise = Math.sin(angle) * length;
  const run = Math.cos(angle) * length;
  const centre = vehicleLocalToWorld({ x, y: ground, z }, yaw, { x: 0, y: rise / 2 - 0.35, z: run / 2 });
  // Yaw about Y, then tip the plank nose-up about its own X axis.
  const half = -angle / 2;
  const sy = Math.sin(yaw / 2);
  const cy = Math.cos(yaw / 2);
  const q = { w: cy * Math.cos(half), x: cy * Math.sin(half), y: Math.cos(half) * sy, z: -sy * Math.sin(half) };
  physics.world.createCollider(
    RAPIER.ColliderDesc.cuboid(5, 0.4, length / 2).setTranslation(centre.x, centre.y, centre.z).setRotation(q),
  );
  physics.step();
}

describe('coconut beach tank', () => {
  test('climbs the sandy coastal ramp from the harbour beach', async () => {
    const room = await createRoom();
    // The harbour tank waits at the foot of the ramp while the Lagoon League holds
    // its home tower A (a capture-gated slot, live from the round start since the
    // conquest merge); it is the tank that climbs this ramp in play.
    const slot = slotBySpawn('coconut_tank_harbor');
    expect(room.vehicles.lifecycleOf(slot.id)).toBe('active');
    const driver = joinPlayer(room, 'lagoon');
    expect(room.vehicles.devEnter(playerOf(room, driver.id) as never, slot.id, 0)).toBe(true);
    const body = room.vehicles.vehicleBody(slot.id);
    if (!body) throw new Error('no coconut tank');
    const path = COASTAL_RAMP_POINTS.filter((_, index) => index % 2 === 0).slice(0, 16);
    const first = path[0];
    const second = path[1];
    if (!first || !second) throw new Error('no ramp');
    parkVehicle(room, slot.id, first.x, first.z, Math.atan2(second.x - first.x, second.z - first.z));
    expect(surfaceTagAt(first.x, first.z, first.y)).toBe('sand');
    const y0 = body.position.y;
    let topSpeed = 0;
    const reached = drivePath(room, driver, slot.id, path, 60 * 30);
    topSpeed = Math.max(topSpeed, body.forwardSpeed);
    expect(reached).toBe(path.length);
    expect(body.position.y).toBeGreaterThan(y0 + 5);
    // Sand slows the tracks a little below the 9.5 m/s road speed.
    run(room, 30, () => sendInput(room, driver, W, body.yaw));
    expect(body.forwardSpeed).toBeLessThan(9.5);
    room.stop();
  });

  test('climbs a 25° ramp but not a 45° wall (36° slope limit)', async () => {
    for (const [angleDeg, climbs] of [[25, true], [45, false]] as const) {
      const room = await createRoom();
      const slot = slotByKind('coconut_tank');
      const driver = joinPlayer(room, 'lagoon');
      room.vehicles.devEnter(playerOf(room, driver.id) as never, slot.id, 0);
      const body = room.vehicles.vehicleBody(slot.id);
      if (!body) throw new Error('no coconut tank');
      const x = 288;
      const z = 120;
      parkVehicle(room, slot.id, x, z, RUNWAY_YAW);
      const ramp = vehicleLocalToWorld({ x, y: 0, z }, RUNWAY_YAW, { x: 0, y: 0, z: 6 });
      addRamp(physicsOf(room), ramp.x, ramp.z, RUNWAY_YAW, (angleDeg * Math.PI) / 180);
      const y0 = body.position.y;
      let gained = 0;
      run(room, 60 * 5, () => {
        sendInput(room, driver, W, body.yaw);
        gained = Math.max(gained, body.position.y - y0);
      });
      if (climbs) expect(gained).toBeGreaterThan(3);
      else expect(gained).toBeLessThan(1);
      room.stop();
    }
  });

  test('bamboo mortar fires coconuts; the dome hatch is exposed, the cab is armoured', async () => {
    const room = await createRoom();
    const slot = slotByKind('coconut_tank');
    const driver = joinPlayer(room, 'lagoon');
    const hatch = joinPlayer(room, 'lagoon', 'heavy');
    room.vehicles.devEnter(playerOf(room, driver.id) as never, slot.id, 0);
    room.vehicles.devEnter(playerOf(room, hatch.id) as never, slot.id, 1);
    parkVehicle(room, slot.id, 288, 140, RUNWAY_YAW);
    expect(room.vehicles.isShielded(driver.id)).toBe(true);
    expect(room.vehicles.isShielded(hatch.id)).toBe(false);
    run(room, 3, (tick) => sendInput(room, driver, tick === 0 ? InputButton.FirePrimary : 0, RUNWAY_YAW, 0.05));
    const fired = driver.socket.eventsOf('TANK_CANNON_FIRE');
    expect(fired.length).toBe(1);
    expect(WEAPON_TABLE.byCode[fired[0]?.paramValue ?? -1]).toBe('coconut_mortar');
    // Small arms barely scratch the armour (25 %), friendly fire does nothing.
    const enemy = joinPlayer(room, 'alpine');
    const friend = playerOf(room, hatch.id);
    const before = room.vehicles.vehicleHp(slot.id);
    room.vehicles.damageFromWeapon(slot.id, playerOf(room, enemy.id) as never, 20, 'smg');
    expect(before - room.vehicles.vehicleHp(slot.id)).toBeCloseTo(20 * VEHICLES.coconut_tank.armor.bullet, 5);
    room.vehicles.damageFromWeapon(slot.id, friend as never, 50, 'bazooka');
    expect(before - room.vehicles.vehicleHp(slot.id)).toBeCloseTo(5, 5);
    room.vehicles.damageFromWeapon(slot.id, playerOf(room, enemy.id) as never, 65, 'bazooka');
    expect(before - room.vehicles.vehicleHp(slot.id)).toBeCloseTo(70, 5);
    room.stop();
  });
});
