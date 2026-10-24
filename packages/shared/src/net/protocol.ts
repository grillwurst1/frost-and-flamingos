import { MAX_PLAYERS } from '../constants.js';
import type {
  BridgeState,
  ClassId,
  CraterState,
  DestructibleState,
  Faction,
  GameEvent,
  GameEventType,
  MapStateSync,
  PlayerInput,
  PlayerState,
  ServerHello,
  Vec3,
  VehicleSnapshot,
  WelcomeMessage,
  WorldSnapshot,
} from '../types/index.js';
import {
  CLASS_CODE,
  FACTION_CODE,
  GameEventCode,
  Opcode,
  PLAYER_FLAG,
  type GameEventCodeValue,
} from './opcodes.js';
import { BinaryReader } from './reader.js';
import { BinaryWriter } from './writer.js';

const FACTION_BY_CODE: Record<number, Faction> = { 0: 'alpine', 1: 'lagoon' };
const CLASS_BY_CODE: Record<number, ClassId> = {
  0: 'allrounder',
  1: 'heavy',
  2: 'infiltrator',
};

const EVENT_BY_CODE = new Map<GameEventCodeValue, GameEventType>(
  (Object.entries(GameEventCode) as Array<[GameEventType, GameEventCodeValue]>).map(
    ([event, code]) => [code, event],
  ),
);

export interface FireWeaponMessage {
  clientTick: number;
  origin: Vec3;
  direction: Vec3;
  weaponId: number;
}

export type DecodedMessage =
  | { opcode: typeof Opcode.C2S_INPUT; input: PlayerInput }
  | { opcode: typeof Opcode.S2C_WORLD_SNAPSHOT; snapshot: WorldSnapshot }
  | { opcode: typeof Opcode.C2S_FIRE_WEAPON; fire: FireWeaponMessage }
  | { opcode: typeof Opcode.S2C_GAME_EVENT; event: GameEvent }
  | { opcode: typeof Opcode.S2C_MAP_STATE_SYNC; mapState: MapStateSync }
  | { opcode: typeof Opcode.C2S_HELLO; hello: ServerHello }
  | { opcode: typeof Opcode.S2C_WELCOME; welcome: WelcomeMessage }
  | { opcode: typeof Opcode.C2S_PING; clientTimeMs: number }
  | { opcode: typeof Opcode.S2C_PONG; clientTimeMs: number; serverTick: number };

function safeDecode<T>(factory: () => T): T | null {
  try {
    return factory();
  } catch {
    return null;
  }
}

function decodeFaction(code: number): Faction {
  const faction = FACTION_BY_CODE[code];
  if (!faction) throw new RangeError('Unknown faction code.');
  return faction;
}

function decodeClass(code: number): ClassId {
  const classId = CLASS_BY_CODE[code];
  if (!classId) throw new RangeError('Unknown class code.');
  return classId;
}

export function encodeInput(input: PlayerInput): ArrayBuffer {
  return new BinaryWriter(20)
    .writeUint8(Opcode.C2S_INPUT)
    .writeUint16(input.sequence & 0xffff)
    .writeUint16(input.buttons & 0xffff)
    .writeFloat32(input.yaw)
    .writeFloat32(input.pitch)
    .writeUint8(input.weaponSlot)
    .finish();
}

export function decodeInput(source: ArrayBuffer | ArrayBufferView): PlayerInput | null {
  return safeDecode(() => {
    const reader = new BinaryReader(source);
    if (reader.readUint8() !== Opcode.C2S_INPUT) throw new RangeError('Wrong opcode.');
    const sequence = reader.readUint16();
    const buttons = reader.readUint16();
    const yaw = reader.readFloat32();
    const pitch = reader.readFloat32();
    const weaponSlotRaw = reader.readUint8();
    const weaponSlot = weaponSlotRaw === 2 ? 2 : weaponSlotRaw === 3 ? 3 : 1;
    if (!Number.isFinite(yaw) || !Number.isFinite(pitch)) throw new RangeError('Invalid angles.');
    return { sequence, buttons, yaw, pitch, weaponSlot };
  });
}

export function encodeHello(hello: ServerHello): ArrayBuffer {
  return new BinaryWriter(64)
    .writeUint8(Opcode.C2S_HELLO)
    .writeUint8(hello.protocolVersion)
    .writeString(hello.displayName)
    .finish();
}

export function decodeHello(source: ArrayBuffer | ArrayBufferView): ServerHello | null {
  return safeDecode(() => {
    const reader = new BinaryReader(source);
    if (reader.readUint8() !== Opcode.C2S_HELLO) throw new RangeError('Wrong opcode.');
    return {
      protocolVersion: reader.readUint8(),
      displayName: reader.readString(32),
    };
  });
}

export function encodeWelcome(welcome: WelcomeMessage): ArrayBuffer {
  return new BinaryWriter(32)
    .writeUint8(Opcode.S2C_WELCOME)
    .writeUint16(welcome.playerId)
    .writeUint8(FACTION_CODE[welcome.faction])
    .writeUint8(CLASS_CODE[welcome.classId])
    .writeUint32(welcome.serverTick)
    .writeFloat32(welcome.spawn.x)
    .writeFloat32(welcome.spawn.y)
    .writeFloat32(welcome.spawn.z)
    .writeUint8(welcome.protocolVersion)
    .finish();
}

export function decodeWelcome(source: ArrayBuffer | ArrayBufferView): WelcomeMessage | null {
  return safeDecode(() => {
    const reader = new BinaryReader(source);
    if (reader.readUint8() !== Opcode.S2C_WELCOME) throw new RangeError('Wrong opcode.');
    return {
      playerId: reader.readUint16(),
      faction: decodeFaction(reader.readUint8()),
      classId: decodeClass(reader.readUint8()),
      serverTick: reader.readUint32(),
      spawn: {
        x: reader.readFloat32(),
        y: reader.readFloat32(),
        z: reader.readFloat32(),
      },
      protocolVersion: reader.readUint8(),
    };
  });
}

export function encodeSnapshot(snapshot: WorldSnapshot): ArrayBuffer {
  const writer = new BinaryWriter(512 + snapshot.players.length * 30);
  writer
    .writeUint8(Opcode.S2C_WORLD_SNAPSHOT)
    .writeUint32(snapshot.serverTick)
    .writeInt8(Math.round(Math.max(-1, Math.min(1, snapshot.weatherBalance)) * 100))
    .writeUint16(snapshot.ticketsAlpine)
    .writeUint16(snapshot.ticketsLagoon)
    .writeUint8(snapshot.turretStates & 0xff)
    .writeUint8(snapshot.players.length & 0xff);

  for (const player of snapshot.players) {
    writer
      .writeUint16(player.id)
      .writeUint8(FACTION_CODE[player.faction])
      .writeUint8(CLASS_CODE[player.classId])
      .writePosition(player.position)
      .writeVelocity(player.velocity)
      .writeAngle(player.yaw)
      .writeUint16(Math.max(0, Math.min(65535, Math.round(player.hp))))
      .writeUint8(
        (player.alive ? PLAYER_FLAG.Alive : 0) | (player.grounded ? PLAYER_FLAG.Grounded : 0),
      )
      .writeUint16(player.lastProcessedInput & 0xffff);
  }

  writer.writeUint8(snapshot.vehicles.length & 0xff);
  for (const vehicle of snapshot.vehicles) {
    writer
      .writeUint16(vehicle.id)
      .writeUint8(vehicle.type)
      .writePosition(vehicle.position)
      .writeAngle(vehicle.yaw)
      .writeUint16(Math.max(0, Math.min(65535, Math.round(vehicle.health))));
  }

  return writer.finish();
}

export function decodeSnapshot(source: ArrayBuffer | ArrayBufferView): WorldSnapshot | null {
  return safeDecode(() => {
    const reader = new BinaryReader(source);
    if (reader.readUint8() !== Opcode.S2C_WORLD_SNAPSHOT) throw new RangeError('Wrong opcode.');
    const serverTick = reader.readUint32();
    const weatherBalance = reader.readInt8() / 100;
    const ticketsAlpine = reader.readUint16();
    const ticketsLagoon = reader.readUint16();
    const turretStates = reader.readUint8();
    const playerCount = reader.readUint8();
    if (playerCount > MAX_PLAYERS) throw new RangeError('Too many players in snapshot.');

    const players: PlayerState[] = [];
    for (let index = 0; index < playerCount; index += 1) {
      const id = reader.readUint16();
      const faction = decodeFaction(reader.readUint8());
      const classId = decodeClass(reader.readUint8());
      const position = reader.readPosition();
      const velocity = reader.readVelocity();
      const yaw = reader.readAngle();
      const hp = reader.readUint16();
      const flags = reader.readUint8();
      const lastProcessedInput = reader.readUint16();
      players.push({
        id,
        faction,
        classId,
        position,
        velocity,
        yaw,
        hp,
        maxHp: 150,
        grounded: (flags & PLAYER_FLAG.Grounded) !== 0,
        alive: (flags & PLAYER_FLAG.Alive) !== 0,
        lastProcessedInput,
      });
    }

    const vehicleCount = reader.readUint8();
    const vehicles: VehicleSnapshot[] = [];
    for (let index = 0; index < vehicleCount; index += 1) {
      vehicles.push({
        id: reader.readUint16(),
        type: reader.readUint8(),
        position: reader.readPosition(),
        yaw: reader.readAngle(),
        health: reader.readUint16(),
      });
    }

    return {
      serverTick,
      weatherBalance,
      ticketsAlpine,
      ticketsLagoon,
      turretStates,
      players,
      vehicles,
    };
  });
}

export function encodeFireWeapon(fire: FireWeaponMessage): ArrayBuffer {
  return new BinaryWriter(36)
    .writeUint8(Opcode.C2S_FIRE_WEAPON)
    .writeUint32(fire.clientTick)
    .writeFloat32(fire.origin.x)
    .writeFloat32(fire.origin.y)
    .writeFloat32(fire.origin.z)
    .writeFloat32(fire.direction.x)
    .writeFloat32(fire.direction.y)
    .writeFloat32(fire.direction.z)
    .writeUint8(fire.weaponId)
    .finish();
}

export function decodeFireWeapon(source: ArrayBuffer | ArrayBufferView): FireWeaponMessage | null {
  return safeDecode(() => {
    const reader = new BinaryReader(source);
    if (reader.readUint8() !== Opcode.C2S_FIRE_WEAPON) throw new RangeError('Wrong opcode.');
    const clientTick = reader.readUint32();
    const origin = {
      x: reader.readFloat32(),
      y: reader.readFloat32(),
      z: reader.readFloat32(),
    };
    const direction = {
      x: reader.readFloat32(),
      y: reader.readFloat32(),
      z: reader.readFloat32(),
    };
    const weaponId = reader.readUint8();
    if (!Number.isFinite(origin.x + origin.y + origin.z + direction.x + direction.y + direction.z)) {
      throw new RangeError('Invalid fire vector.');
    }
    return { clientTick, origin, direction, weaponId };
  });
}

export function encodeGameEvent(event: GameEvent): ArrayBuffer {
  return new BinaryWriter(16)
    .writeUint8(Opcode.S2C_GAME_EVENT)
    .writeUint8(GameEventCode[event.eventType])
    .writeUint16(event.actorId)
    .writeUint16(event.targetId)
    .writeInt16(event.paramX)
    .writeInt16(event.paramZ)
    .writeUint16(event.paramValue)
    .finish();
}

export function decodeGameEvent(source: ArrayBuffer | ArrayBufferView): GameEvent | null {
  return safeDecode(() => {
    const reader = new BinaryReader(source);
    if (reader.readUint8() !== Opcode.S2C_GAME_EVENT) throw new RangeError('Wrong opcode.');
    const code = reader.readUint8() as GameEventCodeValue;
    const eventType = EVENT_BY_CODE.get(code);
    if (!eventType) throw new RangeError('Unknown game event.');
    return {
      eventType,
      actorId: reader.readUint16(),
      targetId: reader.readUint16(),
      paramX: reader.readInt16(),
      paramZ: reader.readInt16(),
      paramValue: reader.readUint16(),
    };
  });
}

export function encodeMapStateSync(mapState: MapStateSync): ArrayBuffer {
  const writer = new BinaryWriter(64 + mapState.destructibles.length * 3 + mapState.craters.length * 8);
  writer.writeUint8(Opcode.S2C_MAP_STATE_SYNC);
  writer.writeUint16(mapState.destructibles.length);
  for (const destructible of mapState.destructibles) {
    writer.writeUint16(destructible.id).writeUint8(destructible.stage);
  }
  writer.writeUint16(mapState.craters.length);
  for (const crater of mapState.craters) {
    writer
      .writePosition({ x: crater.x, y: 0, z: crater.z })
      .writeUint8(Math.max(0, Math.min(255, Math.round(crater.radius * 10))))
      .writeUint8(Math.max(0, Math.min(255, Math.round(crater.depth * 100))));
  }
  // Bridge state is an additive extension used by the later destruction milestone.
  writer.writeUint16(mapState.bridges.length);
  for (const bridge of mapState.bridges) {
    writer
      .writeUint16(bridge.id)
      .writeUint8(bridge.stage === 'intact' ? 0 : bridge.stage === 'patched' ? 1 : 2)
      .writeUint16(bridge.hp);
  }
  return writer.finish();
}

export function decodeMapStateSync(source: ArrayBuffer | ArrayBufferView): MapStateSync | null {
  return safeDecode(() => {
    const reader = new BinaryReader(source);
    if (reader.readUint8() !== Opcode.S2C_MAP_STATE_SYNC) throw new RangeError('Wrong opcode.');
    const destructibleCount = reader.readUint16();
    const destructibles: DestructibleState[] = [];
    for (let index = 0; index < destructibleCount; index += 1) {
      const id = reader.readUint16();
      const stageRaw = reader.readUint8();
      if (stageRaw > 3) throw new RangeError('Invalid destruction stage.');
      destructibles.push({
        id,
        stage: stageRaw as DestructibleState['stage'],
        hp: stageRaw === 0 ? 100 : 0,
        burning: stageRaw === 2,
      });
    }
    const craterCount = reader.readUint16();
    const craters: CraterState[] = [];
    for (let index = 0; index < craterCount; index += 1) {
      const position = reader.readPosition();
      craters.push({
        x: position.x,
        z: position.z,
        radius: reader.readUint8() / 10,
        depth: reader.readUint8() / 100,
      });
    }
    const bridgeCount = reader.readUint16();
    const bridges: BridgeState[] = [];
    for (let index = 0; index < bridgeCount; index += 1) {
      const id = reader.readUint16();
      const stage = reader.readUint8();
      bridges.push({
        id,
        stage: stage === 0 ? 'intact' : stage === 1 ? 'patched' : 'broken',
        hp: reader.readUint16(),
      });
    }
    return { destructibles, craters, bridges };
  });
}

export function encodePing(clientTimeMs: number): ArrayBuffer {
  return new BinaryWriter(9).writeUint8(Opcode.C2S_PING).writeFloat64(clientTimeMs).finish();
}

export function decodePing(source: ArrayBuffer | ArrayBufferView): number | null {
  return safeDecode(() => {
    const reader = new BinaryReader(source);
    if (reader.readUint8() !== Opcode.C2S_PING) throw new RangeError('Wrong opcode.');
    return reader.readFloat64();
  });
}

export function encodePong(clientTimeMs: number, serverTick: number): ArrayBuffer {
  return new BinaryWriter(13)
    .writeUint8(Opcode.S2C_PONG)
    .writeFloat64(clientTimeMs)
    .writeUint32(serverTick)
    .finish();
}

export function decodePong(
  source: ArrayBuffer | ArrayBufferView,
): { clientTimeMs: number; serverTick: number } | null {
  return safeDecode(() => {
    const reader = new BinaryReader(source);
    if (reader.readUint8() !== Opcode.S2C_PONG) throw new RangeError('Wrong opcode.');
    return {
      clientTimeMs: reader.readFloat64(),
      serverTick: reader.readUint32(),
    };
  });
}

export function peekOpcode(source: ArrayBuffer | ArrayBufferView): number | null {
  try {
    return new BinaryReader(source).readUint8();
  } catch {
    return null;
  }
}
