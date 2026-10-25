/**
 * Headless match-room access for the conquest tests. The room runs without
 * its timer: tests call tick() directly and read the private members through
 * a structural view, so every step is a fixed simulation tick.
 */
import { PROTOCOL_VERSION, createDefaultProfile } from '@frost-and-flamingos/shared';
import type {
  CharacterBody,
  ClassId,
  Faction,
  GameEvent,
  PlayerProfile,
  Vec3,
  WorldSnapshot,
} from '@frost-and-flamingos/shared';
import { MatchRoom } from '../src/rooms/match-room';
import type { ClimateConquest } from '../src/rooms/conquest';

export interface ConquestTestPlayer {
  id: number;
  isBot: boolean;
  profile: PlayerProfile;
  character: CharacterBody;
  hp: number;
  alive: boolean;
  kills: number;
  deaths: number;
  respawnAtTick: number;
  spawnProtectionUntil: number;
}

export interface ConquestRoomInternals {
  players: Map<number, ConquestTestPlayer>;
  physicsTick: number;
  conquest: ClimateConquest;
  tick(): void;
  broadcastEvent(event: GameEvent): void;
  spawnFor(faction: Faction, selfId?: number): { position: Vec3; yaw: number };
  damagePlayer(target: ConquestTestPlayer, attacker: ConquestTestPlayer | null, damage: number, weaponId: null, headshot: boolean): void;
  killPlayer(target: ConquestTestPlayer, attacker: ConquestTestPlayer | null, weaponId: null, headshot: boolean): void;
  buildSnapshot(): WorldSnapshot;
  physics: { removeCharacter(character: CharacterBody): void };
}

export interface ConquestHarness {
  room: MatchRoom;
  internal: ConquestRoomInternals;
  events: Array<GameEvent & { tick: number }>;
}

/** A room (optionally without its four bots) whose broadcast events are recorded. */
export async function createConquestRoom(keepBots: boolean): Promise<ConquestHarness> {
  const room = await MatchRoom.create();
  const internal = room as unknown as ConquestRoomInternals;
  if (!keepBots) {
    for (const player of [...internal.players.values()]) {
      internal.physics.removeCharacter(player.character);
      internal.players.delete(player.id);
    }
  }
  const events: Array<GameEvent & { tick: number }> = [];
  const broadcast = internal.broadcastEvent.bind(room);
  internal.broadcastEvent = (event: GameEvent) => {
    events.push({ ...event, tick: internal.physicsTick });
    broadcast(event);
  };
  return { room, internal, events };
}

/** A socketless, input-less vacationer (stands still unless the test moves it). */
export function addDummy(harness: ConquestHarness, faction: Faction, classId: ClassId = 'allrounder'): ConquestTestPlayer {
  const room = harness.room as unknown as {
    join(socket: { send(data: unknown): void; close(): void }, hello: unknown): { ok: boolean; welcome?: { playerId: number } };
  };
  const socket = { send: () => undefined, close: () => undefined };
  const result = room.join(socket, {
    protocolVersion: PROTOCOL_VERSION,
    profile: profileFor(faction, classId),
  });
  if (!result.ok || !result.welcome) throw new Error('Dummy join failed.');
  const player = harness.internal.players.get(result.welcome.playerId);
  if (!player) throw new Error('Dummy missing.');
  // Team balancing may have flipped the side: force the one the test asked for.
  player.profile = { ...player.profile, faction };
  return player;
}

function profileFor(faction: Faction, classId: ClassId): PlayerProfile {
  return { ...createDefaultProfile(`Test ${faction}`, classId), faction };
}

/** Puts a body at a position (feet), at rest. */
export function place(player: ConquestTestPlayer, position: Vec3): void {
  player.character.teleport(position);
  player.character.restore(position, { x: 0, y: 0, z: 0 }, true, 0);
}

export function ticks(harness: ConquestHarness, count: number): void {
  for (let index = 0; index < count; index += 1) harness.internal.tick();
}
