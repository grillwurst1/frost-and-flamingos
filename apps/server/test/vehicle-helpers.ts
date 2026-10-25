/**
 * Headless helpers for the vehicle tests: a MatchRoom without bots, fake
 * sockets that record every packet, and deterministic tick stepping.
 */
import {
  InputButton,
  PROTOCOL_VERSION,
  VEHICLE_SLOTS,
  createDefaultProfile,
  decodeGameEvent,
  decodeSnapshot,
  peekOpcode,
  Opcode,
  type ClassId,
  type Faction,
  type GameEvent,
  type PlayerInput,
  type Vec3,
  type WorldSnapshot,
} from '@frost-and-flamingos/shared';
import { MatchRoom, type GameSocket } from '../src/rooms/match-room';

export class RecordingSocket implements GameSocket {
  readonly events: GameEvent[] = [];
  latest: WorldSnapshot | null = null;
  send(data: string | ArrayBuffer | Uint8Array): unknown {
    if (typeof data === 'string') return undefined;
    const buffer = data instanceof Uint8Array ? data : new Uint8Array(data);
    const opcode = peekOpcode(buffer);
    if (opcode === Opcode.S2C_GAME_EVENT) {
      const event = decodeGameEvent(buffer);
      if (event) this.events.push(event);
    } else if (opcode === Opcode.S2C_WORLD_SNAPSHOT) {
      this.latest = decodeSnapshot(buffer);
    }
    return undefined;
  }
  close(): void {}
  eventsOf(type: GameEvent['eventType']): GameEvent[] {
    return this.events.filter((event) => event.eventType === type);
  }
}

interface RoomInternals {
  tick(): void;
  players: Map<number, { id: number; isBot: boolean; alive: boolean; hp: number; character: { position: Vec3; teleport(position: Vec3): void; restore(p: Vec3, v: Vec3, g: boolean, b?: number): void }; spawnProtectionUntil: number; profile: { faction: Faction } }>;
  physicsTick: number;
}

export interface TestPlayer {
  id: number;
  socket: RecordingSocket;
  sequence: number;
}

export async function createRoom(): Promise<MatchRoom> {
  const room = await MatchRoom.create();
  const internals = room as unknown as RoomInternals;
  for (const [id, player] of [...internals.players]) {
    if (player.isBot) {
      internals.players.delete(id);
      (room as unknown as { physics: { removeCharacter(c: unknown): void } }).physics.removeCharacter(player.character);
    }
  }
  return room;
}

export function internals(room: MatchRoom): RoomInternals {
  return room as unknown as RoomInternals;
}

export function joinPlayer(room: MatchRoom, faction: Faction, classId: ClassId = 'allrounder', name = 'Tester'): TestPlayer {
  const socket = new RecordingSocket();
  const profile = { ...createDefaultProfile(name, classId), faction };
  // pickFaction balances teams: join until the requested faction is granted.
  const result = room.join(socket, { protocolVersion: PROTOCOL_VERSION, profile });
  if (!result.ok) throw new Error(`join failed: ${result.reason}`);
  const player = internals(room).players.get(result.welcome.playerId);
  if (!player) throw new Error('joined player missing');
  player.profile.faction = faction;
  player.spawnProtectionUntil = 0;
  return { id: result.welcome.playerId, socket, sequence: 1 };
}

export function playerOf(room: MatchRoom, id: number): RoomInternals['players'] extends Map<number, infer P> ? P : never {
  const player = internals(room).players.get(id);
  if (!player) throw new Error(`player ${id} missing`);
  return player as never;
}

export function placePlayer(room: MatchRoom, id: number, position: Vec3): void {
  const player = playerOf(room, id);
  player.character.teleport(position);
  player.character.restore(position, { x: 0, y: 0, z: 0 }, false, 0);
}

/** Queues one input for the next tick. */
export function sendInput(room: MatchRoom, player: TestPlayer, buttons: number, yaw = 0, pitch = 0): PlayerInput {
  const input: PlayerInput = { sequence: player.sequence, buttons, yaw, pitch, weaponSlot: 1 };
  player.sequence = player.sequence >= 0xffff ? 1 : player.sequence + 1;
  room.handleInput(player.socket, input);
  return input;
}

/** Runs ticks; `each` queues inputs before every tick. */
export function run(room: MatchRoom, ticks: number, each?: (tick: number) => void): void {
  for (let tick = 0; tick < ticks; tick += 1) {
    each?.(tick);
    internals(room).tick();
  }
}

/** Presses and releases a button over two ticks. */
export function tap(room: MatchRoom, player: TestPlayer, button: number, yaw = 0): void {
  sendInput(room, player, button, yaw);
  internals(room).tick();
  sendInput(room, player, 0, yaw);
  internals(room).tick();
}

export function slotByKind(kind: string, trigger: 'base' | 'map' = 'base'): (typeof VEHICLE_SLOTS)[number] {
  const slot = VEHICLE_SLOTS.find((entry) => entry.kind === kind && entry.spawn.trigger === trigger);
  if (!slot) throw new Error(`no ${kind} slot`);
  return slot;
}

/** Moves a vehicle onto the ground (or the water) at x/z, facing `yaw`. */
export function parkVehicle(room: MatchRoom, vehicleId: number, x: number, z: number, yaw: number): void {
  const body = room.vehicles.vehicleBody(vehicleId);
  if (!body) throw new Error(`vehicle ${vehicleId} missing`);
  const physics = (room as unknown as { physics: { raycast(o: Vec3, d: Vec3, m: number): { point: Vec3 } | null } }).physics;
  const hit = physics.raycast({ x, y: 140, z }, { x: 0, y: -1, z: 0 }, 200);
  const y = body.definition.chassis === 'boat' ? 0 : (hit?.point.y ?? 0) + 0.04;
  body.teleport({ x, y, z }, yaw);
}

/**
 * Autopilot for a seated driver: steers toward each waypoint in turn with
 * A/D and keeps W pressed. Returns the index of the last waypoint reached.
 */
export function drivePath(room: MatchRoom, driver: TestPlayer, vehicleId: number, path: readonly Vec3[], ticks: number, extraButtons = 0): number {
  const body = room.vehicles.vehicleBody(vehicleId);
  if (!body) throw new Error(`vehicle ${vehicleId} missing`);
  let target = 0;
  for (let tick = 0; tick < ticks && target < path.length; tick += 1) {
    const point = path[target];
    if (!point) break;
    const position = body.position;
    const dx = point.x - position.x;
    const dz = point.z - position.z;
    if (Math.hypot(dx, dz) < 4) {
      target += 1;
      continue;
    }
    const wanted = Math.atan2(dx, dz);
    let error = wanted - body.yaw;
    while (error > Math.PI) error -= Math.PI * 2;
    while (error < -Math.PI) error += Math.PI * 2;
    let buttons = extraButtons;
    if (error > 0.08) buttons |= InputButton.Right;
    if (error < -0.08) buttons |= InputButton.Left;
    if (Math.abs(error) < 1.2) buttons |= InputButton.Forward;
    sendInput(room, driver, buttons, body.yaw);
    internals(room).tick();
  }
  return target;
}

export { InputButton };
