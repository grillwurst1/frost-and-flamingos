/**
 * Headless match-room harness for gameplay tests (bun test). The room runs
 * without its timer: tests place players, script inputs and call tick()
 * directly, so every step is deterministic apart from weapon spread.
 */
import {
  FJORD_MAP,
  PROTOCOL_VERSION,
  WATER_LEVEL,
  createDefaultProfile,
  sampleMapHeight,
  type CharacterBody,
  type ClassId,
  type Faction,
  type GameEvent,
  type PhysicsWorld,
  type PlayerInput,
  type PlayerProfile,
  type Vec3,
  type WeaponSlot,
} from '@frost-and-flamingos/shared';
import { MatchRoom, type GameSocket } from '../src/rooms/match-room';

/** The private room members the tests drive (structural view of MatchRoom). */
export interface TestPlayer {
  id: number;
  socket: GameSocket | null;
  isBot: boolean;
  profile: PlayerProfile;
  character: CharacterBody;
  hp: number;
  shield: number;
  alive: boolean;
  kills: number;
  deaths: number;
  ammo: Array<{ magazine: number; reserve: number }>;
  activeSlot: WeaponSlot;
  lastInput: PlayerInput;
  lastFireTick: number;
  spawnProtectionUntil: number;
  slowUntilTick: number;
  dazedUntilTick: number;
  lastDamagedTick: number;
  support: number;
  supportVitality: number;
  supportMagazines: number;
  auraHealed: boolean;
  auraResupplied: boolean;
  auraActive: boolean;
  bot: { targetId: number; mascotChance: number; humanClass: ClassId } | null;
}

export interface RoomInternals {
  players: Map<number, TestPlayer>;
  physics: PhysicsWorld;
  physicsTick: number;
  snapshotTick: number;
  tick(): void;
  broadcastEvent(event: GameEvent): void;
  tryFire(player: TestPlayer, clientTick: number): void;
  explode(owner: TestPlayer, position: Vec3, damage: number, radius: number): void;
  damagePlayer(target: TestPlayer, attacker: TestPlayer | null, damage: number, weaponId: null, headshot: boolean): void;
  useSkill(player: TestPlayer, index: 0 | 1 | 2): void;
  selectBotTarget(player: TestPlayer): number;
  rollBotClass(player: TestPlayer, position: Vec3): void;
  buildSnapshot(): import('@frost-and-flamingos/shared').WorldSnapshot;
}

export interface Harness {
  room: MatchRoom;
  internal: RoomInternals;
  events: Array<GameEvent & { tick: number }>;
}

/** A room with its four bots removed and every broadcast event recorded. */
export async function createRoom(keepBots = false): Promise<Harness> {
  const room = await MatchRoom.create();
  const internal = room as unknown as RoomInternals;
  if (!keepBots) {
    for (const player of [...internal.players.values()]) {
      internal.physics.removeCharacter(player.character);
      internal.players.delete(player.id);
    }
  }
  const events: Array<GameEvent & { tick: number }> = [];
  const original = internal.broadcastEvent.bind(room);
  internal.broadcastEvent = (event: GameEvent) => {
    events.push({ ...event, tick: internal.physicsTick });
    original(event);
  };
  return { room, internal, events };
}

export interface Joined {
  player: TestPlayer;
  socket: GameSocket;
}

let sequence = 1;

export function join(harness: Harness, name: string, classId: ClassId, faction: Faction): Joined {
  const socket: GameSocket = { send() {}, close() {} };
  const profile: PlayerProfile = { ...createDefaultProfile(name, classId), faction };
  const result = harness.room.join(socket, { protocolVersion: PROTOCOL_VERSION, profile });
  if (!result.ok) throw new Error(result.reason);
  const player = harness.internal.players.get(result.welcome.playerId);
  if (!player) throw new Error('joined player missing');
  player.spawnProtectionUntil = 0;
  return { player, socket };
}

/** Places a player's feet on the ground at (x, z) (or at an explicit height), at rest. */
export function place(player: TestPlayer, x: number, z: number, y?: number): Vec3 {
  const position = { x, y: y ?? sampleMapHeight(x, z) + 0.05, z };
  player.character.teleport(position);
  player.character.restore(position, { x: 0, y: 0, z: 0 }, y === undefined, 0);
  return position;
}

export function sendInput(harness: Harness, joined: Joined, buttons: number, yaw = 0, pitch = 0, weaponSlot: WeaponSlot = 1): void {
  harness.room.handleInput(joined.socket, { sequence: sequence++ & 0xffff, buttons, yaw, pitch, weaponSlot });
}

/** Runs ticks, feeding every listed human the same buttons each tick. */
export function run(harness: Harness, ticks: number, feed: Array<{ joined: Joined; buttons: number; yaw?: number }> = []): void {
  for (let tick = 0; tick < ticks; tick += 1) {
    for (const entry of feed) sendInput(harness, entry.joined, entry.buttons, entry.yaw ?? 0);
    harness.internal.tick();
  }
}

/** Horizontal footprint (centre + radius) of every static prop collider. */
const FOOTPRINTS: ReadonlyArray<{ x: number; z: number; radius: number }> = FJORD_MAP.props.flatMap((prop) =>
  prop.colliders.map((collider) => {
    const cos = Math.cos(prop.rotationY);
    const sin = Math.sin(prop.rotationY);
    const x = prop.position.x + collider.offset.x * cos + collider.offset.z * sin;
    const z = prop.position.z - collider.offset.x * sin + collider.offset.z * cos;
    const radius =
      collider.type === 'box' ? Math.hypot(collider.halfExtents.x, collider.halfExtents.z) : collider.radius;
    return { x, z, radius };
  }),
);

function clearOfProps(x: number, z: number, clearance: number): boolean {
  return FOOTPRINTS.every((footprint) => Math.hypot(footprint.x - x, footprint.z - z) - footprint.radius > clearance);
}

/** A dry, gentle, prop-free spot (searched in rings around a centre). */
export function findFlat(centerX: number, centerZ: number, clearance = 14): { x: number; z: number } {
  for (let ring = 0; ring < 260; ring += 6) {
    for (let angle = 0; angle < Math.PI * 2; angle += 0.4) {
      const x = centerX + Math.cos(angle) * ring;
      const z = centerZ + Math.sin(angle) * ring;
      if (Math.abs(x) > 360 || Math.abs(z) > 360) continue;
      if (!clearOfProps(x, z, clearance)) continue;
      const height = sampleMapHeight(x, z);
      if (height < 2) continue;
      let gentle = true;
      for (let d = -16; d <= 16 && gentle; d += 4) {
        if (Math.abs(sampleMapHeight(x + d, z) - height) > 1.6 || Math.abs(sampleMapHeight(x, z + d) - height) > 1.6) gentle = false;
      }
      if (gentle) return { x, z };
    }
  }
  throw new Error('no flat spot');
}

/** Deep open water (sea floor well below the surface, no props). */
export function findDeepWater(depth = 4): { x: number; z: number } {
  for (let x = 380; x > -380; x -= 8) {
    for (let z = 380; z > -380; z -= 8) {
      if (sampleMapHeight(x, z) > WATER_LEVEL - depth) continue;
      if (!clearOfProps(x, z, 16)) continue;
      let deep = true;
      for (let d = -12; d <= 12 && deep; d += 4) {
        if (sampleMapHeight(x + d, z) > WATER_LEVEL - depth + 1 || sampleMapHeight(x, z + d) > WATER_LEVEL - depth + 1) deep = false;
      }
      if (deep && Math.abs(x) < 370 && Math.abs(z) < 370) return { x, z };
    }
  }
  throw new Error('no deep water');
}

/** A waterline point on a gentle beach and its uphill direction (unit, xz). */
export interface Shore {
  x: number;
  z: number;
  dirX: number;
  dirZ: number;
}

/**
 * Gentle, prop-free beaches spread over the map: each runs from `reach` m out
 * in the water (at least 0.4 m deep) to `reach` m up dry land (at least 0.4 m
 * above the surface), rising steadily the whole way.
 */
export function findGentleShores(count: number, reach = 8, clearance = 10): Shore[] {
  const shores: Shore[] = [];
  for (let x = -366; x <= 366 && shores.length < count; x += 3) {
    for (let z = -366; z <= 366 && shores.length < count; z += 3) {
      if (Math.abs(sampleMapHeight(x, z) - WATER_LEVEL) > 0.15) continue;
      const gx = (sampleMapHeight(x + 1, z) - sampleMapHeight(x - 1, z)) / 2;
      const gz = (sampleMapHeight(x, z + 1) - sampleMapHeight(x, z - 1)) / 2;
      const slope = Math.hypot(gx, gz);
      // The map's beaches rise ~0.2-0.4 m per metre; skip flats and steep banks.
      if (slope < 0.1 || slope > 0.36) continue;
      if (shores.some((shore) => Math.hypot(shore.x - x, shore.z - z) < 24)) continue;
      if (!clearOfProps(x, z, clearance + reach)) continue;
      const dirX = gx / slope;
      const dirZ = gz / slope;
      if (sampleMapHeight(x - dirX * reach, z - dirZ * reach) > WATER_LEVEL - 0.4) continue;
      if (sampleMapHeight(x + dirX * reach, z + dirZ * reach) < WATER_LEVEL + 0.4) continue;
      let steady = true;
      let previous = -Infinity;
      for (let d = -reach; d <= reach && steady; d += 1) {
        const height = sampleMapHeight(x + dirX * d, z + dirZ * d);
        if (height < previous - 0.05) steady = false;
        previous = height;
      }
      if (steady) shores.push({ x, z, dirX, dirZ });
    }
  }
  return shores;
}

/** Aims a player's look at a point (yaw/pitch from the server eye). */
export function aimAt(player: TestPlayer, target: Vec3): void {
  const feet = player.character.position;
  const eye = { x: feet.x, y: feet.y + player.character.eyeHeight, z: feet.z };
  const dx = target.x - eye.x;
  const dy = target.y - eye.y;
  const dz = target.z - eye.z;
  const yaw = Math.atan2(dx, dz);
  const pitch = Math.atan2(dy, Math.hypot(dx, dz));
  player.lastInput = { ...player.lastInput, yaw, pitch };
}

/** Events of one type that name a player as actor or target. */
export function eventsFor(harness: Harness, type: GameEvent['eventType'], playerId: number): GameEvent[] {
  return harness.events.filter((event) => event.eventType === type && (event.targetId === playerId || event.actorId === playerId));
}
