import { expect, test } from 'bun:test';
import { WEAPON_TABLE, sampleMapHeight, weaponForSlot, type PlayerProfile, type Vec3 } from '@frost-and-flamingos/shared';
import { InputButton, createRoom, joinPlayer, parkVehicle, placePlayer, playerOf, run, sendInput, slotBySpawn, tap } from './vehicle-helpers';

test('a sidecar passenger fires from the seated eye height, while X repairs and suppresses firing', async () => {
  const room = await createRoom();
  try {
    const slot = slotBySpawn('sidecar_lagoon_base'), passenger = joinPlayer(room, 'lagoon');
    parkVehicle(room, slot.id, 288, 140, 0);
    expect(room.vehicles.devEnter(playerOf(room, passenger.id) as never, slot.id, 1)).toBe(true);
    run(room, 2);
    const shooter = playerOf(room, passenger.id) as unknown as {
      profile: PlayerProfile; character: { position: Vec3; eyeHeight: number; stats: { height: number } };
    };
    const enemy = joinPlayer(room, 'alpine', 'heavy');
    const x = shooter.character.position.x, z = shooter.character.position.z + 12;
    placePlayer(room, enemy.id, { x, y: sampleMapHeight(x, z) + 0.04, z });
    run(room, 2);
    const eye = () => ({ ...shooter.character.position,
      y: shooter.character.position.y + shooter.character.eyeHeight - room.vehicles.eyeDrop(passenger.id, shooter.character.stats.height) });
    expect(room.vehicles.eyeDrop(passenger.id, shooter.character.stats.height)).toBeGreaterThan(0.25);
    const weaponId = weaponForSlot(shooter.profile.loadout, 1), hp = playerOf(room, enemy.id).hp;
    const fire = (repair: boolean) => {
      const origin = eye(), target = playerOf(room, enemy.id).character.position;
      const dx = target.x - origin.x, dy = target.y + 1 - origin.y, dz = target.z - origin.z;
      const length = Math.hypot(dx, dy, dz), yaw = Math.atan2(dx, dz), pitch = Math.asin(dy / length);
      sendInput(room, passenger, repair ? InputButton.Wrench : InputButton.FirePrimary, yaw, pitch);
      sendInput(room, enemy, 0);
      room.handleFire(passenger.socket, { clientTick: room.getServerTick(), origin,
        direction: { x: dx / length, y: dy / length, z: dz / length }, weaponId: WEAPON_TABLE.code[weaponId] });
    };
    run(room, 30, () => fire(false));
    expect(playerOf(room, enemy.id).hp).toBeLessThan(hp);
    const shots = passenger.socket.eventsOf('WEAPON_FIRED').length;
    room.vehicles.devDamage(slot.id, null, 100);
    const hull = room.vehicles.vehicleHp(slot.id);
    run(room, 30, () => fire(true));
    expect(passenger.socket.eventsOf('WEAPON_FIRED')).toHaveLength(shots);
    expect(room.vehicles.vehicleHp(slot.id)).toBeGreaterThan(hull);
    tap(room, passenger, InputButton.Interact);
    expect(room.vehicles.eyeDrop(passenger.id, shooter.character.stats.height)).toBe(0);
  } finally { room.stop(); }
});
