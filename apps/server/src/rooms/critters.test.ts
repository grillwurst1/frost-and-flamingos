/**
 * Headless checks of the ambient critters (wandering hens): the wander AI
 * stays on its half and out of the water, flees, dies to every damage
 * source, respawns on time, survives the snapshot codec and is deterministic.
 *
 *   bun test apps/server/src/rooms/critters.test.ts
 */
import { describe, expect, test } from 'bun:test';
import {
  CRITTER_STATS,
  FJORD_MAP,
  InputButton,
  PHYSICS_TICK_RATE,
  PROTOCOL_VERSION,
  PhysicsWorld,
  WATER_LEVEL,
  WEAPON_TABLE,
  createDefaultProfile,
  critterHalfAt,
  critterSphereCenter,
  decodeGameEvent,
  decodeSnapshot,
  encodeSnapshot,
  isCritterDryGround,
  peekOpcode,
  readCritterKillValue,
  Opcode,
  type CharacterBody,
  type ClassId,
  type CritterState,
  type GameEvent,
  type Loadout,
  type Vec3,
  type WeaponId,
  type WeaponSlot,
  type WorldSnapshot,
} from '@frost-and-flamingos/shared';
import { ClimateConquest } from './conquest';
import { CritterSystem, type CritterKill, type CritterThreat } from './critters.js';
import { MatchRoom, type GameSocket } from './match-room.js';

const HEN = CRITTER_STATS.hen;

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function horizontal(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** Every rule a living critter must obey on every tick. */
function assertLegal(physics: PhysicsWorld, critter: CritterState, tick: number): void {
  const where = `tick ${tick} critter ${critter.id} at ${critter.position.x.toFixed(2)},${critter.position.y.toFixed(2)},${critter.position.z.toFixed(2)}`;
  if (critterHalfAt(critter.position.x, critter.position.z) !== critter.half) throw new Error(`left its half: ${where}`);
  if (critter.position.y < WATER_LEVEL + 0.04) throw new Error(`in the water: ${where}`);
  // Headroom: the head never pokes into a ceiling (bridge decks, overhangs), standing or hopping.
  const above = physics.raycast(
    { x: critter.position.x, y: critter.position.y + 0.02, z: critter.position.z },
    { x: 0, y: 1, z: 0 },
    HEN.height - 0.03,
  );
  if (above) throw new Error(`head in a ceiling (${(above.distance + 0.02).toFixed(2)} m clear): ${where}`);
  if (!critter.airborne) {
    // Standing on a real surface, not inside a prop: the floor right below the feet.
    // Exactly on a collider edge a vertical ray may see either the edge or the
    // surface below it, so probes at the feet (centre and a 5 cm ring, three
    // start heights) must find the floor the hen stands on.
    let best: number | null = null;
    for (const [ox, oz] of [[0, 0], [0.05, 0], [-0.05, 0], [0, 0.05], [0, -0.05]] as const) {
      for (const lift of [0.2, HEN.stepUp + 0.05, 0.5]) {
        const hit = physics.raycast(
          { x: critter.position.x + ox, y: critter.position.y + lift, z: critter.position.z + oz },
          { x: 0, y: -1, z: 0 },
          lift + 0.6,
        );
        if (!hit || hit.distance < 0.02) continue;
        if (best === null || Math.abs(hit.point.y - critter.position.y) < Math.abs(best - critter.position.y)) best = hit.point.y;
      }
    }
    if (best === null) throw new Error(`no floor / inside a prop: ${where}`);
    if (Math.abs(best - critter.position.y) > 0.08) throw new Error(`floating ${(critter.position.y - best).toFixed(2)} m: ${where}`);
    if (!isCritterDryGround(best)) throw new Error(`wet floor: ${where}`);
  }
}

describe('critter spawning', () => {
  test('three hens per half on dry ground, away from spawn pads', async () => {
    const physics = await PhysicsWorld.create();
    const system = new CritterSystem(physics, { seed: 11 });
    const states = system.states();
    expect(states.length).toBe(HEN.perHalf * 2);
    expect(states.filter((critter) => critter.half === 'alpine').length).toBe(HEN.perHalf);
    expect(states.filter((critter) => critter.half === 'lagoon').length).toBe(HEN.perHalf);
    for (const critter of states) {
      expect(critter.alive).toBe(true);
      expect(critter.species).toBe('hen');
      assertLegal(physics, critter, 0);
      for (const spawn of FJORD_MAP.spawns) {
        expect(horizontal(spawn.position, critter.position)).toBeGreaterThanOrEqual(HEN.spawnPadClearance - 1e-6);
      }
    }
    physics.dispose();
  });
});

describe('critter wander soak', () => {
  test(
    'ten minutes: stays on its half, out of the water, never inside props, keeps moving',
    async () => {
      const physics = await PhysicsWorld.create();
      // CRITTER_SOAK_SEED=<n> re-runs the soak on another map population.
      const seed = Number(process.env.CRITTER_SOAK_SEED ?? 2024);
      const system = new CritterSystem(physics, { seed });
      const script = mulberry32(seed ^ 0x5eed);
      const ticks = 10 * 60 * PHYSICS_TICK_RATE;
      const travelled = new Map<number, number>();
      const last = new Map<number, Vec3>();
      const behaviours = new Set<string>();
      let threat: CritterThreat | null = null;
      let threatUntil = 0;
      for (let tick = 1; tick <= ticks; tick += 1) {
        // A pest walks up to a random hen every ~8 s; gunfire every ~13 s.
        if (tick % 480 === 0) {
          const states = system.states();
          const target = states[Math.floor(script() * states.length)];
          if (target) {
            const angle = script() * Math.PI * 2;
            threat = { position: { x: target.position.x + Math.sin(angle) * 2, y: target.position.y, z: target.position.z + Math.cos(angle) * 2 } };
            threatUntil = tick + 90;
          }
        }
        if (tick % 780 === 0) {
          const states = system.states();
          const target = states[Math.floor(script() * states.length)];
          if (target) system.alertShot({ x: target.position.x + 8, y: target.position.y + 1.5, z: target.position.z }, { x: -1, y: 0, z: 0 }, 30);
        }
        if (threat && tick > threatUntil) threat = null;
        system.step(tick, threat ? [threat] : []);
        for (const critter of system.states()) {
          behaviours.add(critter.behaviour);
          assertLegal(physics, critter, tick);
          const previous = last.get(critter.id);
          if (previous) travelled.set(critter.id, (travelled.get(critter.id) ?? 0) + horizontal(previous, critter.position));
          last.set(critter.id, { ...critter.position });
        }
      }
      for (const [id, distance] of travelled) {
        // Wandering hens cover ground (≈ 0.2–0.5 m/s on average).
        if (distance < 25) throw new Error(`hen ${id} barely moved: ${distance.toFixed(1)} m`);
      }
      for (const behaviour of ['walk', 'peck', 'scratch', 'look', 'flee']) expect(behaviours.has(behaviour)).toBe(true);
      expect(system.stats.flees).toBeGreaterThan(20);
      console.log(
        `soak seed ${seed}: ${ticks} ticks, flees ${system.stats.flees}, travelled ${[...travelled.values()].map((value) => value.toFixed(0)).join('/')} m`,
      );
      physics.dispose();
    },
    600_000,
  );
});

describe('critter flee', () => {
  test('a player inside 4 m, a nearby shot and a blast all make it run', async () => {
    const physics = await PhysicsWorld.create();
    const system = new CritterSystem(physics, { seed: 5 });
    const hen = system.states()[0];
    if (!hen) throw new Error('no hen');
    let tick = 0;
    const run = (count: number, threats: CritterThreat[]): void => {
      for (let index = 0; index < count; index += 1) {
        tick += 1;
        system.step(tick, threats);
      }
    };
    const reset = (): Vec3 => {
      system.placeForTest(hen.id, hen.position, 0);
      run(2, []);
      const state = system.states().find((critter) => critter.id === hen.id);
      if (!state) throw new Error('lost hen');
      expect(state.behaviour).not.toBe('flee');
      return state.position;
    };

    // Player 2.5 m away.
    let start = reset();
    const player = { position: { x: start.x + 2.5, y: start.y, z: start.z } };
    run(8, [player]);
    let state = system.states().find((critter) => critter.id === hen.id);
    expect(state?.behaviour).toBe('flee');
    const before = horizontal(state?.position ?? start, player.position);
    run(40, [player]);
    state = system.states().find((critter) => critter.id === hen.id);
    const after = horizontal(state?.position ?? start, player.position);
    // It ran away (or, cornered, at least did not approach).
    expect(after).toBeGreaterThanOrEqual(before - 0.05);

    // A player 6 m away is ignored.
    run(240, []);
    start = reset();
    run(30, [{ position: { x: start.x + 6, y: start.y, z: start.z } }]);
    expect(system.states().find((critter) => critter.id === hen.id)?.behaviour).not.toBe('flee');

    // Gunfire 10 m away.
    start = reset();
    system.alertShot({ x: start.x + 10, y: start.y + 1.6, z: start.z }, { x: 1, y: 0, z: 0 }, 80);
    run(1, []);
    expect(system.states().find((critter) => critter.id === hen.id)?.behaviour).toBe('flee');

    // A shot whizzing past from 40 m.
    run(240, []);
    start = reset();
    system.alertShot({ x: start.x + 40, y: start.y + 0.5, z: start.z + 1 }, { x: -1, y: 0, z: 0 }, 80);
    run(1, []);
    expect(system.states().find((critter) => critter.id === hen.id)?.behaviour).toBe('flee');

    // An explosion 9 m away.
    run(240, []);
    start = reset();
    system.alertBlast({ x: start.x, y: start.y, z: start.z + 9 }, 5.5);
    run(1, []);
    expect(system.states().find((critter) => critter.id === hen.id)?.behaviour).toBe('flee');
    physics.dispose();
  });
});

describe('critter respawn', () => {
  test('a bagged hen returns 45 s later on the same half', async () => {
    const physics = await PhysicsWorld.create();
    const kills: CritterKill[] = [];
    const system = new CritterSystem(physics, { seed: 77, onKill: (kill) => kills.push(kill) });
    let tick = 0;
    system.step((tick += 1), []);
    const hen = system.states()[4];
    if (!hen) throw new Error('no hen');
    expect(system.kill(hen.id, 3, 'smg')).toBe(true);
    expect(system.kill(hen.id, 3, 'smg')).toBe(false);
    expect(kills.length).toBe(1);
    expect(kills[0]?.killerId).toBe(3);
    const respawnTicks = HEN.respawnSeconds * PHYSICS_TICK_RATE;
    expect(system.respawnTicksLeft(hen.id)).toBe(respawnTicks);
    for (let index = 0; index < respawnTicks - 1; index += 1) {
      system.step((tick += 1), []);
      if (system.states().find((critter) => critter.id === hen.id)?.alive) throw new Error(`respawned early at +${index + 1}`);
    }
    system.step((tick += 1), []);
    const back = system.states().find((critter) => critter.id === hen.id);
    expect(back?.alive).toBe(true);
    expect(back?.half).toBe(hen.half);
    if (back) assertLegal(physics, back, tick);
    expect(system.stats.respawns).toBe(1);
    physics.dispose();
  });
});

describe('critter determinism', () => {
  test('same seed and same threats replay the same paths', async () => {
    const run = async (seed: number): Promise<string[]> => {
      const physics = await PhysicsWorld.create();
      const system = new CritterSystem(physics, { seed });
      const frames: string[] = [];
      for (let tick = 1; tick <= 3600; tick += 1) {
        const first = system.states()[0];
        // A scripted chaser follows the first hen for a while.
        const threats =
          first && tick > 600 && tick < 900
            ? [{ position: { x: first.position.x + 1.5, y: first.position.y, z: first.position.z } }]
            : [];
        system.step(tick, threats);
        if (tick % 30 === 0) {
          frames.push(
            system
              .states()
              .map((critter) => `${critter.position.x},${critter.position.y},${critter.position.z},${critter.yaw},${critter.behaviour}`)
              .join('|'),
          );
        }
      }
      physics.dispose();
      return frames;
    };
    const a = await run(31337);
    const b = await run(31337);
    const c = await run(31338);
    expect(a.length).toBe(120);
    expect(b).toEqual(a);
    expect(c[0]).not.toBe(a[0]);
  }, 120_000);
});

describe('critter snapshot codec', () => {
  test('round-trips through the binary snapshot', () => {
    const critters: CritterState[] = [
      { id: 1, species: 'hen', half: 'alpine', position: { x: 12.34, y: 18.02, z: -40.5 }, yaw: 2.9, speed: 0.95, behaviour: 'walk', alive: true, airborne: false },
      { id: 2, species: 'hen', half: 'lagoon', position: { x: -190.1, y: 1.4, z: -150.7 }, yaw: -2.5, speed: 4.4, behaviour: 'flee', alive: true, airborne: true },
      { id: 3, species: 'hen', half: 'lagoon', position: { x: -200, y: 2, z: -160 }, yaw: 0, speed: 0, behaviour: 'peck', alive: false, airborne: false },
      { id: 4, species: 'hen', half: 'alpine', position: { x: 5, y: 30, z: 5 }, yaw: 1, speed: 0, behaviour: 'scratch', alive: true, airborne: false },
      { id: 5, species: 'hen', half: 'alpine', position: { x: 6, y: 30, z: 6 }, yaw: -1, speed: 0, behaviour: 'look', alive: true, airborne: false },
      { id: 6, species: 'hen', half: 'lagoon', position: { x: 7, y: 3, z: 7 }, yaw: 3.1, speed: 0, behaviour: 'idle', alive: true, airborne: false },
    ];
    const snapshot: WorldSnapshot = {
      serverTick: 1234,
      weatherBalance: 0,
      windAngle: 0,
      windStrength: 0,
      ticketsAlpine: 50,
      ticketsLagoon: 50,
      turretStates: 0,
      players: [],
      vehicles: [],
      critters,
      conquest: new ClimateConquest().snapshot(),
    };
    const decoded = decodeSnapshot(encodeSnapshot(snapshot));
    if (!decoded) throw new Error('decode failed');
    expect(decoded.critters.length).toBe(critters.length);
    critters.forEach((critter, index) => {
      const back = decoded.critters[index];
      if (!back) throw new Error('missing');
      expect(back.id).toBe(critter.id);
      expect(back.species).toBe(critter.species);
      expect(back.half).toBe(critter.half);
      expect(back.behaviour).toBe(critter.behaviour);
      expect(back.alive).toBe(critter.alive);
      expect(back.airborne).toBe(critter.airborne);
      expect(Math.abs(back.position.x - critter.position.x)).toBeLessThan(0.0126);
      expect(Math.abs(back.position.y - critter.position.y)).toBeLessThan(0.0126);
      expect(Math.abs(back.position.z - critter.position.z)).toBeLessThan(0.0126);
      expect(Math.abs(Math.atan2(Math.sin(back.yaw - critter.yaw), Math.cos(back.yaw - critter.yaw)))).toBeLessThan(0.0002);
      expect(Math.abs(back.speed - critter.speed)).toBeLessThan(0.026);
    });
    const empty = decodeSnapshot(encodeSnapshot({ ...snapshot, critters: [] }));
    expect(empty?.critters).toEqual([]);
    // A truncated trailer is rejected, not half-read.
    const bytes = new Uint8Array(encodeSnapshot(snapshot));
    expect(decodeSnapshot(bytes.slice(0, bytes.length - 3))).toBeNull();
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(7);
  });
});

// ---------------------------------------------------------------------------
// Damage sources through the real match room
// ---------------------------------------------------------------------------

interface FakeSocket extends GameSocket {
  events: GameEvent[];
}

function fakeSocket(): FakeSocket {
  const events: GameEvent[] = [];
  return {
    events,
    send(data) {
      if (!(data instanceof ArrayBuffer)) return;
      if (peekOpcode(data) !== Opcode.S2C_GAME_EVENT) return;
      const event = decodeGameEvent(data);
      if (event) events.push(event);
    },
    close() {},
  };
}

interface RoomPlayer {
  id: number;
  character: CharacterBody;
  alive: boolean;
  hp: number;
}

/** The room's private internals the tests drive directly. */
interface RoomInternals {
  tick(): void;
  critters: CritterSystem;
  players: Map<number, RoomPlayer>;
  snapshotTick: number;
  physics: PhysicsWorld;
}

async function quietRoom(seed: number): Promise<{ room: MatchRoom; inner: RoomInternals }> {
  const room = await MatchRoom.create({ bots: 0, critterSeed: seed });
  return { room, inner: room as unknown as RoomInternals };
}

function joinPlayer(room: MatchRoom, classId: ClassId, loadout?: Loadout): { socket: FakeSocket; id: number } {
  const socket = fakeSocket();
  const profile = createDefaultProfile(`Tester ${classId}`, classId);
  const result = room.join(socket, {
    protocolVersion: PROTOCOL_VERSION,
    profile: { ...profile, loadout: loadout ?? profile.loadout },
  });
  if (!result.ok) throw new Error(result.reason);
  return { socket, id: result.welcome.playerId };
}

function ticks(inner: RoomInternals, count: number): void {
  for (let index = 0; index < count; index += 1) inner.tick();
}

function aimAt(from: Vec3, to: Vec3): { yaw: number; pitch: number; direction: Vec3 } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  return {
    yaw: Math.atan2(dx, dz),
    pitch: Math.atan2(dy, Math.hypot(dx, dz)),
    direction: { x: dx / length, y: dy / length, z: dz / length },
  };
}

/**
 * Finds a dry stand point `distance` from the hen with a clear line of sight
 * from the eye to the hen's body (on the hen's level).
 */
function standPoint(physics: PhysicsWorld, hen: CritterState, distance: number, eyeHeight: number): Vec3 | null {
  const body = critterSphereCenter(hen.position, hen.yaw, HEN.body);
  for (const scale of [1, 0.85, 1.15, 0.7]) {
    for (let index = 0; index < 48; index += 1) {
      const angle = (index / 48) * Math.PI * 2;
      const x = hen.position.x + Math.sin(angle) * distance * scale;
      const z = hen.position.z + Math.cos(angle) * distance * scale;
      const ground = physics.raycast({ x, y: hen.position.y + 3, z }, { x: 0, y: -1, z: 0 }, 6);
      if (!ground || ground.distance < 0.05 || !isCritterDryGround(ground.point.y)) continue;
      if (Math.abs(ground.point.y - hen.position.y) > 0.6) continue;
      const eye = { x, y: ground.point.y + 0.02 + eyeHeight, z };
      const aim = aimAt(eye, body);
      const reach = Math.hypot(body.x - eye.x, body.y - eye.y, body.z - eye.z);
      // Clear line to the hen's body, with a margin: no terrain bump or prop in the way.
      if (physics.raycast(eye, aim.direction, reach + 0.25)) continue;
      return { x, y: ground.point.y, z };
    }
  }
  return null;
}

/** Places the hen (calm, history settled) and parks the player far away first. */
function prepareHen(
  room: MatchRoom,
  inner: RoomInternals,
  socket: FakeSocket,
  playerId: number,
  henIndex: number,
  stand: number,
  slot: WeaponSlot = 1,
): {
  hen: CritterState;
  spot: Vec3;
} {
  const player = inner.players.get(playerId);
  if (!player) throw new Error('no player');
  // The first hen (from henIndex on) that has a clear shooting spot at that range.
  const states = inner.critters.states();
  let hen: CritterState | undefined;
  let spot: Vec3 | null = null;
  for (let offset = 0; offset < states.length && !spot; offset += 1) {
    hen = states[(henIndex + offset) % states.length];
    if (hen) spot = standPoint(inner.physics, hen, stand, player.character.eyeHeight);
  }
  if (!hen || !spot) throw new Error(`no clear shooting spot at ${stand} m`);
  const away = { x: hen.position.x + (spot.x - hen.position.x) * (14 / stand), z: hen.position.z + (spot.z - hen.position.z) * (14 / stand) };
  room.devTeleport(playerId, away.x, away.z);
  // Equip the weapon slot while parked out of the hen's sight.
  room.handleInput(socket, { sequence: 50, buttons: 0, yaw: 0, pitch: 0, weaponSlot: slot });
  inner.critters.placeForTest(hen.id, hen.position, hen.yaw);
  ticks(inner, 12);
  const settled = inner.critters.states().find((critter) => critter.id === hen.id);
  if (!settled || horizontal(settled.position, hen.position) > 0.01) throw new Error('hen wandered off before the shot');
  return { hen: settled, spot };
}

function fireAt(
  room: MatchRoom,
  inner: RoomInternals,
  socket: FakeSocket,
  playerId: number,
  spot: Vec3,
  target: Vec3,
  weaponId: WeaponId,
  slot: WeaponSlot,
  sequence: number,
): void {
  room.devTeleport(playerId, spot.x, spot.z, spot.y + 0.02);
  const player = inner.players.get(playerId);
  if (!player) throw new Error('no player');
  const eye = { x: spot.x, y: spot.y + 0.02 + player.character.eyeHeight, z: spot.z };
  const aim = aimAt(eye, target);
  room.handleInput(socket, { sequence, buttons: 0, yaw: aim.yaw, pitch: aim.pitch, weaponSlot: slot });
  room.handleFire(socket, { clientTick: inner.snapshotTick, origin: eye, direction: aim.direction, weaponId: WEAPON_TABLE.code[weaponId] });
  inner.tick();
}

function critterKills(socket: FakeSocket): Array<{ actor: number; target: number; weaponId: WeaponId | null }> {
  return socket.events
    .filter((event) => event.eventType === 'CRITTER_KILLED')
    .map((event) => ({ actor: event.actorId, target: event.targetId, weaponId: readCritterKillValue(event.paramValue).weaponId }));
}

describe('every damage source bags a hen', () => {
  const cases: Array<{ name: string; weapon: WeaponId; slot: WeaponSlot; loadout: Loadout; stand: number; ticksAfter: number }> = [
    { name: 'hitscan (smg)', weapon: 'smg', slot: 1, loadout: { primary: 'smg', secondary: 'shotgun', gimmick: 'horn' }, stand: 7, ticksAfter: 0 },
    { name: 'sniper', weapon: 'sniper', slot: 1, loadout: { primary: 'sniper', secondary: 'shotgun', gimmick: 'horn' }, stand: 9, ticksAfter: 0 },
    { name: 'pellets (shotgun)', weapon: 'shotgun', slot: 2, loadout: { primary: 'smg', secondary: 'shotgun', gimmick: 'horn' }, stand: 5, ticksAfter: 0 },
    { name: 'projectile splash (bazooka)', weapon: 'bazooka', slot: 2, loadout: { primary: 'lmg', secondary: 'bazooka', gimmick: 'horn' }, stand: 9, ticksAfter: 40 },
    { name: 'melee (knife)', weapon: 'knife', slot: 2, loadout: { primary: 'smg', secondary: 'knife', gimmick: 'horn' }, stand: 1.7, ticksAfter: 0 },
    { name: 'melee (halberd)', weapon: 'halberd', slot: 3, loadout: { primary: 'smg', secondary: 'shotgun', gimmick: 'halberd' }, stand: 2.2, ticksAfter: 0 },
    { name: 'beam (snow cannon)', weapon: 'snow_cannon', slot: 3, loadout: { primary: 'smg', secondary: 'shotgun', gimmick: 'snow_cannon' }, stand: 6, ticksAfter: 0 },
  ];
  for (const entry of cases) {
    test(entry.name, async () => {
      const { room, inner } = await quietRoom(404);
      const { socket, id } = joinPlayer(room, entry.weapon === 'bazooka' ? 'heavy' : 'allrounder', entry.loadout);
      ticks(inner, 5);
      const random = Math.random;
      // Spread off: pellets and beams fly dead straight in this test.
      Math.random = () => 0;
      try {
        const { hen, spot } = prepareHen(room, inner, socket, id, 1, entry.stand, entry.slot);
        const body = critterSphereCenter(hen.position, hen.yaw, HEN.body);
        fireAt(room, inner, socket, id, spot, body, entry.weapon, entry.slot, 100);
        ticks(inner, entry.ticksAfter);
        const kills = critterKills(socket);
        expect(kills.length).toBe(1);
        expect(kills[0]?.actor).toBe(id);
        expect(kills[0]?.target).toBe(hen.id);
        expect(kills[0]?.weaponId).toBe(entry.weapon);
        expect(inner.critters.states().find((critter) => critter.id === hen.id)?.alive).toBe(false);
      } finally {
        Math.random = random;
        room.stop();
      }
    }, 60_000);
  }

  test('mascot ram (cow) runs a hen over', async () => {
    const { room, inner } = await quietRoom(405);
    const { socket, id } = joinPlayer(room, 'mascot');
    ticks(inner, 5);
    const player = inner.players.get(id);
    if (!player) throw new Error('no cow');
    const { hen } = prepareHen(room, inner, socket, id, 0, 3);
    const heading = player.character.heading;
    const start = {
      x: hen.position.x - Math.sin(heading) * 1.1,
      y: hen.position.y + 0.05,
      z: hen.position.z - Math.cos(heading) * 1.1,
    };
    player.character.teleport(start);
    player.character.restore(start, { x: Math.sin(heading) * 11, y: 0, z: Math.cos(heading) * 11 }, true, 0);
    room.handleInput(socket, { sequence: 200, buttons: InputButton.Forward | InputButton.Sprint, yaw: heading, pitch: 0, weaponSlot: 1 });
    inner.tick();
    const kills = critterKills(socket);
    expect(kills.length).toBe(1);
    expect(kills[0]?.actor).toBe(id);
    expect(kills[0]?.weaponId).toBe('cow_ram');
    room.stop();
  }, 60_000);

  test('a hen takes the bullet for the player right behind it; once bagged the bullet passes', async () => {
    const { room, inner } = await quietRoom(406);
    const shooter = joinPlayer(room, 'allrounder', { primary: 'sniper', secondary: 'shotgun', gimmick: 'horn' });
    const target = joinPlayer(room, 'heavy');
    // Out of the spawn-protection window.
    ticks(inner, 2 * PHYSICS_TICK_RATE + 5);
    const victim = inner.players.get(target.id);
    const gunner = inner.players.get(shooter.id);
    const hen = inner.critters.states()[2];
    if (!victim || !gunner || !hen) throw new Error('setup failed');
    const spot = standPoint(inner.physics, hen, 8, gunner.character.eyeHeight);
    if (!spot) throw new Error('no clear shooting spot');
    // The target stands 0.45 m behind the hen on the line of fire, on the hen's ground.
    const dx = hen.position.x - spot.x;
    const dz = hen.position.z - spot.z;
    const length = Math.hypot(dx, dz);
    const bx = hen.position.x + (dx / length) * 0.45;
    const bz = hen.position.z + (dz / length) * 0.45;
    const ground = inner.physics.raycast({ x: bx, y: hen.position.y + 1.5, z: bz }, { x: 0, y: -1, z: 0 }, 3);
    if (!ground) throw new Error('no ground behind the hen');
    room.devTeleport(target.id, bx, bz, ground.point.y + 0.02);
    room.devTeleport(shooter.id, spot.x, spot.z, spot.y + 0.02);
    room.handleInput(shooter.socket, { sequence: 290, buttons: 0, yaw: 0, pitch: 0, weaponSlot: 1 });
    ticks(inner, 30);
    // The hen sits there for exactly the 6-tick rewind window before the shot.
    inner.critters.placeForTest(hen.id, hen.position, hen.yaw);
    ticks(inner, 6);
    const hpBefore = victim.hp;
    const body = critterSphereCenter(hen.position, hen.yaw, HEN.body);
    fireAt(room, inner, shooter.socket, shooter.id, spot, body, 'sniper', 1, 300);
    expect(critterKills(shooter.socket).length).toBe(1);
    expect(victim.hp).toBe(hpBefore);
    // The same line again: the hen is gone, the bullet reaches the player.
    ticks(inner, PHYSICS_TICK_RATE * 2);
    fireAt(room, inner, shooter.socket, shooter.id, spot, body, 'sniper', 1, 301);
    expect(victim.hp).toBeLessThan(hpBefore);
    room.stop();
  }, 60_000);

  test('snapshots carry the critters and the health probe counts them', async () => {
    const { room, inner } = await quietRoom(407);
    ticks(inner, 4);
    const status = room.getStatus();
    expect(status.critters.total).toBe(6);
    expect(status.critters.alive).toBe(6);
    expect(inner.critters.states().every((critter) => critter.alive)).toBe(true);
    room.stop();
  });
});

// ---------------------------------------------------------------------------
// Review fixes: cornered flee, headroom, alert lanes, shockwave reach, test rooms
// ---------------------------------------------------------------------------

const DOWN = { x: 0, y: -1, z: 0 };
const UP = { x: 0, y: 1, z: 0 };

/**
 * Low lagoon beach spots right at the waterline: dry under the feet, water
 * 0.8 m ahead, dry ground 1.5 m to both sides and 3 m inland (a shore, not a spit).
 */
function shorelineSpots(physics: PhysicsWorld, count: number): Array<{ position: Vec3; toWater: number }> {
  const spots: Array<{ position: Vec3; toWater: number }> = [];
  const dryAt = (x: number, z: number, nearY: number): number | null => {
    const hit = physics.raycast({ x, y: nearY + 1.5, z }, DOWN, 4);
    if (!hit || hit.distance < 0.05 || !isCritterDryGround(hit.point.y) || Math.abs(hit.point.y - nearY) > 0.8) return null;
    return hit.point.y;
  };
  for (let x = -330; x <= 220 && spots.length < count; x += 6) {
    for (let z = -340; z <= -40 && spots.length < count; z += 6) {
      if (critterHalfAt(x, z) !== 'lagoon') continue;
      const ground = physics.raycast({ x, y: 60, z }, DOWN, 80);
      if (!ground || !isCritterDryGround(ground.point.y) || ground.point.y > WATER_LEVEL + 0.6) continue;
      const floor = ground.point.y;
      if (physics.raycast({ x, y: floor + 0.05, z }, UP, 1.2)) continue;
      if (spots.some((spot) => horizontal(spot.position, { x, y: floor, z }) < 25)) continue;
      for (let index = 0; index < 16; index += 1) {
        const angle = (index / 16) * Math.PI * 2;
        const sin = Math.sin(angle);
        const cos = Math.cos(angle);
        const wet = physics.raycast({ x: x + sin * 0.8, y: floor + 1, z: z + cos * 0.8 }, DOWN, 4);
        if (wet && isCritterDryGround(wet.point.y)) continue;
        if (dryAt(x - sin * 3, z - cos * 3, floor) === null) continue;
        if (dryAt(x + cos * 1.5, z - sin * 1.5, floor) === null || dryAt(x - cos * 1.5, z + sin * 1.5, floor) === null) continue;
        spots.push({ position: { x, y: floor, z }, toWater: angle });
        break;
      }
    }
  }
  return spots;
}

describe('review fixes', () => {
  test('a hen cornered at the waterline by a player on the land side runs along the shore (> 2 m in 3 s)', async () => {
    const physics = await PhysicsWorld.create();
    const spots = shorelineSpots(physics, 6);
    expect(spots.length).toBe(6);
    const results: string[] = [];
    for (const [index, spot] of spots.entries()) {
      const system = new CritterSystem(physics, { seed: 900 + index });
      const hen = system.states().find((critter) => critter.half === 'lagoon');
      if (!hen) throw new Error('no lagoon hen');
      system.placeForTest(hen.id, spot.position, spot.toWater);
      const threat: CritterThreat = {
        position: { x: spot.position.x - Math.sin(spot.toWater) * 3, y: spot.position.y, z: spot.position.z - Math.cos(spot.toWater) * 3 },
      };
      let furthest = 0;
      let fled = false;
      for (let tick = 1; tick <= 3 * PHYSICS_TICK_RATE; tick += 1) {
        system.step(tick, [threat]);
        const state = system.states().find((critter) => critter.id === hen.id);
        if (!state) throw new Error('lost hen');
        assertLegal(physics, state, tick);
        fled ||= state.behaviour === 'flee';
        furthest = Math.max(furthest, horizontal(state.position, spot.position));
      }
      results.push(`${spot.position.x},${spot.position.z}: ${furthest.toFixed(2)} m`);
      expect(fled).toBe(true);
      if (furthest <= 2) throw new Error(`hen stuck at the shore (${results.join(' | ')})`);
    }
    console.log(`shoreline flee: ${results.join(' | ')}`);
    physics.dispose();
  });

  test('a startled hen under the bridge deck hops without its head entering the deck', async () => {
    const physics = await PhysicsWorld.create();
    const system = new CritterSystem(physics, { seed: 31 });
    const hen = system.states().find((critter) => critter.half === 'alpine');
    if (!hen) throw new Error('no alpine hen');
    const x = -0.88;
    const z = 78.09;
    const floor = physics.raycast({ x, y: 2.0, z }, DOWN, 2);
    const deck = floor ? physics.raycast({ x, y: floor.point.y + 0.02, z }, UP, 3) : null;
    if (!floor || !deck) throw new Error('bridge spot moved');
    // Low clearance under the deck: a full hop (~0.36 m) would poke through.
    expect(deck.distance).toBeLessThan(HEN.height + 0.36);
    system.placeForTest(hen.id, { x, y: floor.point.y, z }, 0);
    let airborne = 0;
    for (let tick = 1; tick <= 2 * PHYSICS_TICK_RATE; tick += 1) {
      const state = system.states().find((critter) => critter.id === hen.id);
      if (!state) throw new Error('lost hen');
      system.step(tick, [{ position: { x: state.position.x + 2, y: state.position.y, z: state.position.z } }]);
      const after = system.states().find((critter) => critter.id === hen.id);
      if (!after) throw new Error('lost hen');
      assertLegal(physics, after, tick);
      if (after.airborne) airborne += 1;
    }
    expect(airborne).toBeGreaterThan(0);
    physics.dispose();
  });

  test('the shockwave volume has the players’ vertical reach', async () => {
    const physics = await PhysicsWorld.create();
    const system = new CritterSystem(physics, { seed: 3 });
    const hen = system.states()[0];
    if (!hen) throw new Error('no hen');
    const feet = { x: 10, y: 20, z: 10 };
    // Landing 3 m below and 2.5 m to the side (Hoof Stomp: radius 4, reach 2.5).
    const impact = { x: 12.5, y: 17, z: 10 };
    system.placeForTest(hen.id, feet, 0);
    expect(system.killInSphere(impact, 4, 1, 'hoof_stomp', null, 2.5)).toBe(0);
    expect(system.killInSphere({ ...impact, y: 18.5 }, 4, 1, 'hoof_stomp', null, 2.5)).toBe(1);
    system.placeForTest(hen.id, feet, 0);
    // A plain blast sphere still reaches it (splash is 3D).
    expect(system.killInSphere(impact, 4, 1, 'bazooka', null)).toBe(1);

    // The room passes the wave's reach.
    const { room, inner } = await quietRoom(408);
    const { id } = joinPlayer(room, 'mascot');
    ticks(inner, 3);
    const reaches: Array<number | null> = [];
    const original = inner.critters.killInSphere.bind(inner.critters);
    inner.critters.killInSphere = (center, radius, killerId, weaponId, rewindTick = null, verticalReach = null) => {
      reaches.push(verticalReach);
      return original(center, radius, killerId, weaponId, rewindTick, verticalReach);
    };
    const shockwave = (room as unknown as { applyMascotShockwave(player: unknown, kind: 'stomp' | 'pound', position: Vec3): void }).applyMascotShockwave.bind(room);
    shockwave(inner.players.get(id), 'stomp', { x: 0, y: 30, z: 0 });
    expect(reaches).toEqual([2.5]);
    room.stop();
    physics.dispose();
  });

  test('the gunfire alert lane ends where the shot meets the world; a rocket only scatters the shooter’s surroundings', async () => {
    const { room, inner } = await quietRoom(409);
    const sniper = joinPlayer(room, 'allrounder', { primary: 'sniper', secondary: 'shotgun', gimmick: 'horn' });
    const rocket = joinPlayer(room, 'heavy', { primary: 'lmg', secondary: 'bazooka', gimmick: 'horn' });
    const lanes: number[] = [];
    const original = inner.critters.alertShot.bind(inner.critters);
    inner.critters.alertShot = (origin, direction, length) => {
      lanes.push(length);
      original(origin, direction, length);
    };
    room.handleInput(rocket.socket, { sequence: 10, buttons: 0, yaw: 0, pitch: 0, weaponSlot: 2 });
    ticks(inner, 90);
    // Straight into the ground at the shooter's feet: the lane is ~ the eye height, not 400 m.
    const shooter = inner.players.get(sniper.id);
    if (!shooter) throw new Error('no shooter');
    const feet = { ...shooter.character.position };
    fireAt(room, inner, sniper.socket, sniper.id, feet, { x: feet.x + 0.4, y: feet.y - 1, z: feet.z }, 'sniper', 1, 20);
    const gunner = inner.players.get(rocket.id);
    if (!gunner) throw new Error('no gunner');
    const at = { ...gunner.character.position };
    fireAt(room, inner, rocket.socket, rocket.id, at, { x: at.x + 20, y: at.y + 2, z: at.z }, 'bazooka', 2, 21);
    expect(lanes.length).toBe(2);
    expect(lanes[0]).toBeLessThan(3);
    expect(lanes[0]).toBeGreaterThan(0.5);
    expect(lanes[1]).toBe(0);
    room.stop();
  });

  test('test rooms have no critters unless asked; asked-for ones are seeded', async () => {
    const plain = await MatchRoom.create({ bots: 0 });
    expect(plain.getStatus().critters.total).toBe(0);
    plain.stop();
    const first = await MatchRoom.create({ bots: 0, critters: true });
    const second = await MatchRoom.create({ bots: 0, critters: true });
    const statesOf = (room: MatchRoom): CritterState[] => (room as unknown as RoomInternals).critters.states();
    expect(statesOf(first).length).toBe(6);
    expect(statesOf(first)).toEqual(statesOf(second));
    first.stop();
    second.stop();
  });
});
