/**
 * 3G x 3H: the untouchable drifter and the wandering hens. Hens never flee
 * from a drifter (she is filtered out of the critter threat query) and she
 * cannot bag one (unarmed, skill-less), while a soldier at the same spot
 * still scares them.
 *
 *   bun test apps/server/test/drifter-critters.test.ts
 */
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import {
  CRITTER_STATS,
  InputButton,
  PHYSICS_TICK_RATE,
  WEAPON_TABLE,
  critterSphereCenter,
  isCritterDryGround,
  weaponForSlot,
  type CritterState,
  type GameEvent,
  type Vec3,
} from '@frost-and-flamingos/shared';
import { MatchRoom } from '../src/rooms/match-room';
import type { CritterSystem, CritterThreat } from '../src/rooms/critters';
import { join, type Harness, type Joined, type RoomInternals, type TestPlayer } from './harness';

setDefaultTimeout(120_000);

interface CritterRoomInternals extends RoomInternals {
  critters: CritterSystem;
  critterThreats(): CritterThreat[];
}

let harness: Harness;
let internal: CritterRoomInternals;

beforeAll(async () => {
  // Test rooms are hen-free by default; a seed brings the six hens back.
  const room = await MatchRoom.create({ bots: 0, critterSeed: 0x3a61 });
  internal = room as unknown as CritterRoomInternals;
  const events: Array<GameEvent & { tick: number }> = [];
  const original = internal.broadcastEvent.bind(room);
  internal.broadcastEvent = (event: GameEvent) => {
    events.push({ ...event, tick: internal.physicsTick });
    original(event);
  };
  harness = { room, internal, events };
});

afterAll(() => {
  harness.room.stop();
});

function ticks(count: number): void {
  for (let index = 0; index < count; index += 1) internal.tick();
}

function henById(id: number): CritterState {
  const hen = internal.critters.states().find((critter) => critter.id === id);
  if (!hen) throw new Error(`hen ${id} missing`);
  return hen;
}

function horizontal(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** A dry stand point `distance` m from the hen, on the hen's level. */
function standNear(hen: CritterState, distance: number): Vec3 {
  for (let index = 0; index < 48; index += 1) {
    const angle = (index / 48) * Math.PI * 2;
    const x = hen.position.x + Math.sin(angle) * distance;
    const z = hen.position.z + Math.cos(angle) * distance;
    const ground = internal.physics.raycast({ x, y: hen.position.y + 3, z }, { x: 0, y: -1, z: 0 }, 6);
    if (!ground || ground.distance < 0.05 || !isCritterDryGround(ground.point.y)) continue;
    if (Math.abs(ground.point.y - hen.position.y) > 0.5) continue;
    return { x, y: ground.point.y, z };
  }
  throw new Error(`no dry stand point ${distance} m from hen ${hen.id}`);
}

/** Calms the hen where it stands and puts the player `distance` m from it. */
function settle(hen: CritterState, player: TestPlayer, distance: number): { hen: CritterState; spot: Vec3 } {
  const spot = standNear(hen, distance);
  internal.critters.placeForTest(hen.id, hen.position, hen.yaw);
  harness.room.devTeleport(player.id, spot.x, spot.z, spot.y + 0.02);
  return { hen: henById(hen.id), spot };
}

function dismiss(joined: Joined[]): void {
  for (const entry of joined) harness.room.leaveBySocket(entry.socket);
  harness.events.length = 0;
}

describe('hens ignore drifters', () => {
  test('a drifter is no critter threat: hens next to her never flee, a soldier at the same spot scares them', () => {
    expect(internal.critters.count).toBe(6);
    const ghost = join(harness, 'Hen Ghost', 'drifter', 'alpine');
    expect(ghost.player.profile.cosmetics.classId).toBe('drifter');
    ticks(5);
    // /api/health reports the drifter, critter and vehicle blocks side by side.
    const status = harness.room.getStatus();
    // 7 critters, 8 drifter, 9 vehicles (4V).
    expect(status.protocolVersion).toBe(11);
    expect(status.vehicles.list.length).toBeGreaterThan(0);
    expect(status.critters.total).toBe(6);
    expect(status.critters.alive).toBe(6);
    expect(status.drifters.active).toBe(1);
    // Only living, damageable players are threats: the drifter is not one.
    expect(internal.critterThreats()).toEqual([]);

    const first = internal.critters.states()[0];
    if (!first) throw new Error('no hen');
    const { hen } = settle(first, ghost.player, 1.5);
    const fleesBefore = internal.critters.stats.flees;
    let closest = Number.POSITIVE_INFINITY;
    let fled = false;
    // She stands 1.5 m away (inside the 4 m flee radius) for 1.5 s, then walks right at the hen.
    for (let tick = 0; tick < 150; tick += 1) {
      const current = henById(hen.id);
      if (tick >= 90) {
        const feet = ghost.player.character.position;
        const yaw = Math.atan2(current.position.x - feet.x, current.position.z - feet.z);
        harness.room.handleInput(ghost.socket, { sequence: (1000 + tick) & 0xffff, buttons: InputButton.Forward, yaw, pitch: 0, weaponSlot: 1 });
      }
      internal.tick();
      const after = henById(hen.id);
      fled ||= after.behaviour === 'flee';
      closest = Math.min(closest, horizontal(after.position, ghost.player.character.position));
    }
    expect(closest).toBeLessThan(CRITTER_STATS.hen.fleeRadius / 2);
    expect(fled).toBe(false);
    expect(internal.critters.stats.flees).toBe(fleesBefore);
    expect(internal.critterThreats()).toEqual([]);

    // Control: a soldier at the same range makes the very same hen run.
    const soldier = join(harness, 'Hen Soldier', 'allrounder', 'alpine');
    ticks(2);
    const { hen: calm } = settle(henById(hen.id), soldier.player, 1.5);
    expect(calm.behaviour).not.toBe('flee');
    ticks(12);
    expect(internal.critterThreats().length).toBe(1);
    expect(henById(hen.id).behaviour).toBe('flee');
    expect(internal.critters.stats.flees).toBeGreaterThan(fleesBefore);
    dismiss([ghost, soldier]);
    ticks(PHYSICS_TICK_RATE * 6);
  });

  test('a drifter cannot bag a hen: fire requests, direct fire and skills do nothing', () => {
    const ghost = join(harness, 'Hen Ghost 2', 'drifter', 'alpine');
    ticks(5);
    const target = internal.critters.states().find((critter) => critter.alive);
    if (!target) throw new Error('no living hen');
    const { hen, spot } = settle(target, ghost.player, 2);
    ticks(2);
    const body = critterSphereCenter(hen.position, hen.yaw, CRITTER_STATS.hen.body);
    const eye = { x: spot.x, y: ghost.player.character.position.y + ghost.player.character.eyeHeight, z: spot.z };
    const dx = body.x - eye.x;
    const dy = body.y - eye.y;
    const dz = body.z - eye.z;
    const length = Math.hypot(dx, dy, dz) || 1;
    const yaw = Math.atan2(dx, dz);
    const pitch = Math.atan2(dy, Math.hypot(dx, dz));
    const weaponId = weaponForSlot(ghost.player.profile.loadout, 1);
    const fleesBefore = internal.critters.stats.flees;
    for (let shot = 0; shot < 20; shot += 1) {
      harness.room.handleInput(ghost.socket, {
        sequence: (2000 + shot) & 0xffff,
        buttons: InputButton.FirePrimary | (shot % 2 === 0 ? InputButton.Skill1 | InputButton.Skill2 | InputButton.Skill3OrTaunt : 0),
        yaw,
        pitch,
        weaponSlot: 1,
      });
      harness.room.handleFire(ghost.socket, {
        clientTick: internal.snapshotTick,
        origin: eye,
        direction: { x: dx / length, y: dy / length, z: dz / length },
        weaponId: WEAPON_TABLE.code[weaponId],
      });
      ghost.player.lastInput = { ...ghost.player.lastInput, yaw, pitch };
      internal.tryFire(ghost.player, internal.snapshotTick);
      for (const index of [0, 1, 2] as const) internal.useSkill(ghost.player, index);
      internal.tick();
    }
    expect(harness.events.filter((event) => event.eventType === 'CRITTER_KILLED')).toEqual([]);
    expect(harness.events.filter((event) => event.eventType === 'WEAPON_FIRED' || event.eventType === 'SKILL_USED')).toEqual([]);
    expect(henById(hen.id).alive).toBe(true);
    expect(internal.critters.stats.kills).toBe(0);
    // Nothing was fired, so nothing scattered the hen either.
    expect(internal.critters.stats.flees).toBe(fleesBefore);
    dismiss([ghost]);
  });
});
