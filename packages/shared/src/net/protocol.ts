import { MAX_PLAYERS, PHYSICS_TICK_RATE } from '../constants.js';
import { CLASS_DEFAULT_LOADOUTS, CLASS_TABLE, classStatsFor } from '../config/classes.js';
import {
  BACK_TABLE,
  createDefaultCosmetics,
  FACE_TABLE,
  FEET_TABLE,
  HANDS_TABLE,
  HEADGEAR_TABLE,
  LEGS_TABLE,
  normalizeCosmetics,
  TORSO_TABLE,
} from '../config/cosmetics.js';
import { createDefaultProfile, normalizeLoadout, normalizeProfile } from '../config/profile.js';
import {
  GIMMICK_WEAPON_TABLE,
  PRIMARY_WEAPON_TABLE,
  SECONDARY_WEAPON_TABLE,
} from '../config/weapons.js';
import { CRITTER_BEHAVIOUR_TABLE, CRITTER_SPECIES_TABLE } from '../config/critters.js';
import { VEHICLE_FLAG } from '../config/vehicles.js';
import type { IdTable } from '../config/ids.js';
import type {
  BridgeState,
  ClassId,
  CritterState,
  MascotWireState,
  CraterState,
  DestructibleState,
  Faction,
  GameEvent,
  GameEventType,
  MapStateSync,
  PlayerInput,
  PlayerProfile,
  PlayerState,
  ProfileMessage,
  ServerHello,
  Vec3,
  VehicleSnapshot,
  WelcomeMessage,
  WorldSnapshot,
} from '../types/index.js';
import {
  CLASS_CODE,
  CRITTER_BEHAVIOUR_MASK,
  CRITTER_FLAG,
  FACTION_CODE,
  GameEventCode,
  MASCOT_FLAG,
  MASCOT_JUMPS_SHIFT,
  Opcode,
  PLAYER_FLAG,
  PLAYER_STATUS_FLAG,
  type GameEventCodeValue,
} from './opcodes.js';
import { readConquestState, writeConquestState } from './conquest-codec.js';
import { BinaryReader } from './reader.js';
import { BinaryWriter } from './writer.js';

const FACTION_BY_CODE: Record<number, Faction> = { 0: 'alpine', 1: 'lagoon' };
const CLASS_BY_CODE: Record<number, ClassId> = {
  0: 'allrounder',
  1: 'heavy',
  2: 'infiltrator',
  3: 'mascot',
  4: 'drifter',
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
  | { opcode: typeof Opcode.S2C_PROFILE; profile: ProfileMessage }
  | { opcode: typeof Opcode.C2S_PROFILE_UPDATE; profile: PlayerProfile }
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

function readTableId<T extends string>(reader: BinaryReader, table: IdTable<T>): T {
  const id = table.byCode[reader.readUint8()];
  if (id === undefined) throw new RangeError('Unknown profile id.');
  return id;
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

/** Skill cooldowns travel in deciseconds so a 26 s cooldown fits a uint16. */
function cooldownToWire(seconds: number): number {
  return Math.max(0, Math.min(65535, Math.round(seconds * 10)));
}

function wireToCooldown(value: number): number {
  return value / 10;
}

/**
 * Short motor timers travel as whole physics ticks (0–255 = 0–4.25 s). The
 * motor counts them in ticks too, so a restored timer is exact.
 */
function shortTimerToWire(seconds: number): number {
  return Math.max(0, Math.min(255, Math.round(seconds * PHYSICS_TICK_RATE)));
}

function wireToShortTimer(value: number): number {
  return value / PHYSICS_TICK_RATE;
}

/** Sanity cap for the critter trailer (the map holds a handful). */
const MAX_WIRE_CRITTERS = 64;
/** Critter ground speed travels as u8 twentieths of a metre per second. */
const CRITTER_SPEED_SCALE = 20;

/** Critter trailer entry: 12 bytes (id, species, state, position, yaw, speed). */
function writeCritterState(writer: BinaryWriter, critter: CritterState): void {
  writer
    .writeUint8(critter.id & 0xff)
    .writeUint8(CRITTER_SPECIES_TABLE.code[critter.species])
    .writeUint8(
      (CRITTER_BEHAVIOUR_TABLE.code[critter.behaviour] & CRITTER_BEHAVIOUR_MASK) |
        (critter.alive ? CRITTER_FLAG.Alive : 0) |
        (critter.half === 'lagoon' ? CRITTER_FLAG.LagoonHalf : 0) |
        (critter.airborne ? CRITTER_FLAG.Airborne : 0),
    )
    .writePosition(critter.position)
    .writeAngle(critter.yaw)
    .writeUint8(clampByte(critter.speed * CRITTER_SPEED_SCALE));
}

function readCritterState(reader: BinaryReader): CritterState {
  const id = reader.readUint8();
  const species = readTableId(reader, CRITTER_SPECIES_TABLE);
  const state = reader.readUint8();
  const behaviour = CRITTER_BEHAVIOUR_TABLE.byCode[state & CRITTER_BEHAVIOUR_MASK];
  if (behaviour === undefined) throw new RangeError('Unknown critter behaviour.');
  const position = reader.readPosition();
  const yaw = reader.readAngle();
  const speed = reader.readUint8() / CRITTER_SPEED_SCALE;
  return {
    id,
    species,
    half: (state & CRITTER_FLAG.LagoonHalf) !== 0 ? 'lagoon' : 'alpine',
    position,
    // Wire angles are 0…2π; the simulation keeps -π…π.
    yaw: yaw > Math.PI ? yaw - Math.PI * 2 : yaw,
    speed,
    behaviour,
    alive: (state & CRITTER_FLAG.Alive) !== 0,
    airborne: (state & CRITTER_FLAG.Airborne) !== 0,
  };
}

function writeMascotState(writer: BinaryWriter, mascot: MascotWireState): void {
  writer
    .writeAngle(mascot.heading)
    .writeInt16(Math.max(-32767, Math.min(32767, Math.round(mascot.yawRate * 1000))))
    .writeUint8(clampByte(mascot.stamina * 255))
    .writeUint8(shortTimerToWire(mascot.boostSeconds))
    .writeUint8(shortTimerToWire(mascot.actionSeconds))
    .writeUint8(shortTimerToWire(mascot.hopSeconds))
    .writeUint8(shortTimerToWire(mascot.coyoteSeconds))
    .writeUint8(
      (mascot.pounding ? MASCOT_FLAG.Pounding : 0) |
        (mascot.skidding ? MASCOT_FLAG.Skidding : 0) |
        (mascot.galloping ? MASCOT_FLAG.Galloping : 0) |
        (mascot.exhausted ? MASCOT_FLAG.Exhausted : 0) |
        (mascot.grazing ? MASCOT_FLAG.Grazing : 0) |
        ((Math.max(0, Math.min(3, mascot.jumpsUsed)) & 3) << MASCOT_JUMPS_SHIFT),
    )
    .writeUint16(Math.max(0, Math.min(65535, mascot.cooldownTicks[0])))
    .writeUint16(Math.max(0, Math.min(65535, mascot.cooldownTicks[1])))
    .writeUint16(Math.max(0, Math.min(65535, mascot.cooldownTicks[2])));
}

function readMascotState(reader: BinaryReader): MascotWireState {
  const heading = reader.readAngle();
  const yawRate = reader.readInt16() / 1000;
  const stamina = reader.readUint8() / 255;
  const boostSeconds = wireToShortTimer(reader.readUint8());
  const actionSeconds = wireToShortTimer(reader.readUint8());
  const hopSeconds = wireToShortTimer(reader.readUint8());
  const coyoteSeconds = wireToShortTimer(reader.readUint8());
  const flags = reader.readUint8();
  const cooldownTicks: [number, number, number] = [
    reader.readUint16(),
    reader.readUint16(),
    reader.readUint16(),
  ];
  return {
    // Wire angles are 0…2π; the motor keeps -π…π.
    heading: heading > Math.PI ? heading - Math.PI * 2 : heading,
    yawRate,
    stamina,
    boostSeconds,
    actionSeconds,
    hopSeconds,
    coyoteSeconds,
    cooldownTicks,
    pounding: (flags & MASCOT_FLAG.Pounding) !== 0,
    skidding: (flags & MASCOT_FLAG.Skidding) !== 0,
    galloping: (flags & MASCOT_FLAG.Galloping) !== 0,
    exhausted: (flags & MASCOT_FLAG.Exhausted) !== 0,
    ...((flags & MASCOT_FLAG.Grazing) ? { grazing: true } : {}),
    jumpsUsed: (flags >> MASCOT_JUMPS_SHIFT) & 3,
  };
}

/** Short motor counters as whole ticks (u16). */
function ticksToWire(ticks: number): number {
  return Math.max(0, Math.min(65535, Math.round(ticks)));
}

function milliToWire(value: number): number {
  return Math.max(-32767, Math.min(32767, Math.round(value * 1000)));
}

/**
 * Vehicle block (protocol 9, 35 B + 2 B per seat): id u16, kind u8, flags u8,
 * base position, velocity, yaw u16, yaw rate i16 (mrad/s), steer i16 (mrad),
 * turret yaw u16 (relative), turret pitch i16 (mrad), health u16, turbo,
 * turbo cooldown and weapon cooldown u16 ticks, seat count u8 + seat
 * occupant ids u16 (0 = free).
 */
function writeVehicleState(writer: BinaryWriter, vehicle: VehicleSnapshot): void {
  writer
    .writeUint16(vehicle.id)
    .writeUint8(vehicle.type)
    .writeUint8(vehicle.flags & 0xff)
    .writePosition(vehicle.position)
    .writeVelocity(vehicle.velocity)
    .writeAngle(vehicle.yaw)
    .writeInt16(milliToWire(vehicle.yawRate))
    .writeInt16(milliToWire(vehicle.steer))
    .writeAngle(vehicle.turretYaw)
    .writeInt16(milliToWire(vehicle.turretPitch))
    .writeUint16(Math.max(0, Math.min(65535, Math.round(vehicle.health))))
    .writeUint16(ticksToWire(vehicle.boostTicks))
    .writeUint16(ticksToWire(vehicle.boostCooldownTicks))
    .writeUint16(ticksToWire(vehicle.weaponCooldownTicks))
    .writeUint8(Math.min(8, vehicle.seats.length));
  for (const occupant of vehicle.seats.slice(0, 8)) writer.writeUint16(occupant & 0xffff);
  if (vehicle.flags & VEHICLE_FLAG.ExtendedPose) writer.writeInt16(milliToWire(vehicle.pitch ?? 0)).writeInt16(milliToWire(vehicle.roll ?? 0));
}

function readVehicleState(reader: BinaryReader): VehicleSnapshot {
  const id = reader.readUint16();
  const type = reader.readUint8();
  const flags = reader.readUint8();
  const position = reader.readPosition();
  const velocity = reader.readVelocity();
  const yaw = reader.readAngle();
  const yawRate = reader.readInt16() / 1000;
  const steer = reader.readInt16() / 1000;
  const turretRaw = reader.readAngle();
  const turretPitch = reader.readInt16() / 1000;
  const health = reader.readUint16();
  const boostTicks = reader.readUint16();
  const boostCooldownTicks = reader.readUint16();
  const weaponCooldownTicks = reader.readUint16();
  const seatCount = reader.readUint8();
  if (seatCount > 8) throw new RangeError('Too many vehicle seats.');
  const seats: number[] = [];
  for (let seat = 0; seat < seatCount; seat += 1) seats.push(reader.readUint16());
  const pose = flags & VEHICLE_FLAG.ExtendedPose ? { pitch: reader.readInt16() / 1000, roll: reader.readInt16() / 1000 } : {};
  return {
    ...pose,
    id,
    type,
    flags,
    position,
    velocity,
    yaw: yaw > Math.PI ? yaw - Math.PI * 2 : yaw,
    yawRate,
    steer,
    // Wire angles are 0…2π; the motor keeps -π…π.
    turretYaw: turretRaw > Math.PI ? turretRaw - Math.PI * 2 : turretRaw,
    turretPitch,
    health,
    boostTicks,
    boostCooldownTicks,
    weaponCooldownTicks,
    seats,
  };
}

/**
 * Writes the appearance/loadout part of a profile. The display name and faction
 * travel with it because a profile is also a self-contained player record.
 */
export function writeProfile(writer: BinaryWriter, profile: PlayerProfile): void {
  const cosmetics = profile.cosmetics;
  writer
    .writeString(profile.displayName)
    .writeUint8(FACTION_CODE[profile.faction])
    .writeUint8(CLASS_TABLE.code[cosmetics.classId])
    .writeUint8(clampByte(cosmetics.bodyType * 255))
    .writeUint8(clampByte(cosmetics.skinToneIndex))
    .writeUint8(clampByte(cosmetics.hairColorIndex))
    .writeUint8(clampByte(cosmetics.hairStyleIndex))
    .writeUint8(HEADGEAR_TABLE.code[cosmetics.headgear])
    .writeUint8(FACE_TABLE.code[cosmetics.face])
    .writeUint8(TORSO_TABLE.code[cosmetics.torso])
    .writeUint8(BACK_TABLE.code[cosmetics.back])
    .writeUint8(HANDS_TABLE.code[cosmetics.hands])
    .writeUint8(LEGS_TABLE.code[cosmetics.legs])
    .writeUint8(FEET_TABLE.code[cosmetics.feet])
    .writeUint8(clampByte(cosmetics.voicePitch * 100))
    .writeUint8(PRIMARY_WEAPON_TABLE.code[profile.loadout.primary])
    .writeUint8(SECONDARY_WEAPON_TABLE.code[profile.loadout.secondary])
    .writeUint8(GIMMICK_WEAPON_TABLE.code[profile.loadout.gimmick]);
}

export function readProfile(reader: BinaryReader): PlayerProfile {
  const displayName = reader.readString(32);
  const faction = decodeFaction(reader.readUint8());
  const classId = readTableId(reader, CLASS_TABLE);
  const cosmetics = normalizeCosmetics(
    {
      classId,
      bodyType: reader.readUint8() / 255,
      skinToneIndex: reader.readUint8(),
      hairColorIndex: reader.readUint8(),
      hairStyleIndex: reader.readUint8(),
      headgear: readTableId(reader, HEADGEAR_TABLE),
      face: readTableId(reader, FACE_TABLE),
      torso: readTableId(reader, TORSO_TABLE),
      back: readTableId(reader, BACK_TABLE),
      hands: readTableId(reader, HANDS_TABLE),
      legs: readTableId(reader, LEGS_TABLE),
      feet: readTableId(reader, FEET_TABLE),
      voicePitch: reader.readUint8() / 100,
    },
    createDefaultCosmetics(classId),
  );
  const loadout = normalizeLoadout(
    {
      primary: readTableId(reader, PRIMARY_WEAPON_TABLE),
      secondary: readTableId(reader, SECONDARY_WEAPON_TABLE),
      gimmick: readTableId(reader, GIMMICK_WEAPON_TABLE),
    },
    CLASS_DEFAULT_LOADOUTS[classId],
  );
  return normalizeProfile(
    { displayName, faction, cosmetics, loadout },
    createDefaultProfile(displayName.length > 0 ? displayName : 'Vacationer', classId),
  );
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
  const writer = new BinaryWriter(160);
  writer.writeUint8(Opcode.C2S_HELLO).writeUint8(hello.protocolVersion);
  writeProfile(writer, hello.profile);
  return writer.finish();
}

export function decodeHello(source: ArrayBuffer | ArrayBufferView): ServerHello | null {
  return safeDecode(() => {
    const reader = new BinaryReader(source);
    if (reader.readUint8() !== Opcode.C2S_HELLO) throw new RangeError('Wrong opcode.');
    return {
      protocolVersion: reader.readUint8(),
      profile: readProfile(reader),
    };
  });
}

export function encodeWelcome(welcome: WelcomeMessage): ArrayBuffer {
  const writer = new BinaryWriter(192);
  writer
    .writeUint8(Opcode.S2C_WELCOME)
    .writeUint16(welcome.playerId)
    .writeUint32(welcome.serverTick)
    .writePosition(welcome.spawn)
    .writeUint8(welcome.protocolVersion);
  writeProfile(writer, welcome.profile);
  // Protocol 9: spawn facing.
  writer.writeAngle(welcome.spawnYaw);
  return writer.finish();
}

export function decodeWelcome(source: ArrayBuffer | ArrayBufferView): WelcomeMessage | null {
  return safeDecode(() => {
    const reader = new BinaryReader(source);
    if (reader.readUint8() !== Opcode.S2C_WELCOME) throw new RangeError('Wrong opcode.');
    const playerId = reader.readUint16();
    const serverTick = reader.readUint32();
    const spawn = reader.readPosition();
    const protocolVersion = reader.readUint8();
    const profile = readProfile(reader);
    const spawnYaw = reader.readAngle();
    return { playerId, serverTick, spawn, spawnYaw, protocolVersion, profile };
  });
}

export function encodeProfileMessage(message: ProfileMessage): ArrayBuffer {
  const writer = new BinaryWriter(192);
  writer.writeUint8(Opcode.S2C_PROFILE).writeUint16(message.playerId);
  writeProfile(writer, message.profile);
  return writer.finish();
}

export function decodeProfileMessage(
  source: ArrayBuffer | ArrayBufferView,
): ProfileMessage | null {
  return safeDecode(() => {
    const reader = new BinaryReader(source);
    if (reader.readUint8() !== Opcode.S2C_PROFILE) throw new RangeError('Wrong opcode.');
    return {
      playerId: reader.readUint16(),
      profile: readProfile(reader),
    };
  });
}

export function encodeProfileUpdate(profile: PlayerProfile): ArrayBuffer {
  const writer = new BinaryWriter(192);
  writer.writeUint8(Opcode.C2S_PROFILE_UPDATE);
  writeProfile(writer, profile);
  return writer.finish();
}

export function decodeProfileUpdate(
  source: ArrayBuffer | ArrayBufferView,
): PlayerProfile | null {
  return safeDecode(() => {
    const reader = new BinaryReader(source);
    if (reader.readUint8() !== Opcode.C2S_PROFILE_UPDATE) throw new RangeError('Wrong opcode.');
    return readProfile(reader);
  });
}

export function encodeSnapshot(snapshot: WorldSnapshot): ArrayBuffer {
  const writer = new BinaryWriter(512 + snapshot.players.length * 58);
  writer
    .writeUint8(Opcode.S2C_WORLD_SNAPSHOT)
    .writeUint32(snapshot.serverTick)
    .writeInt8(Math.round(Math.max(-1, Math.min(1, snapshot.weatherBalance)) * 100))
    .writeUint8(clampByte((snapshot.windAngle / (Math.PI * 2)) * 255))
    .writeUint8(clampByte(snapshot.windStrength * 255))
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
        (player.alive ? PLAYER_FLAG.Alive : 0) |
          (player.grounded ? PLAYER_FLAG.Grounded : 0) |
          (player.crouched ? PLAYER_FLAG.Crouched : 0) |
          (player.swimming ? PLAYER_FLAG.Swimming : 0) |
          (player.sprinting ? PLAYER_FLAG.Sprinting : 0) |
          (player.rolling ? PLAYER_FLAG.Rolling : 0) |
          (player.reloading ? PLAYER_FLAG.Reloading : 0) |
          (player.cloaked ? PLAYER_FLAG.Cloaked : 0),
      )
      .writeUint8(player.parachuteState & 0x03)
      .writeUint8(player.weaponSlot & 0x03)
      .writeUint16(Math.max(0, Math.min(65535, Math.round(player.ammo))))
      .writeUint16(Math.max(0, Math.min(65535, Math.round(player.reserve))))
      .writeUint16(Math.max(0, Math.min(65535, Math.round(player.shield))))
      .writeUint8(Math.max(0, Math.min(255, Math.round(player.kills))))
      .writeUint8(Math.max(0, Math.min(255, Math.round(player.deaths))))
      .writeUint16(cooldownToWire(player.skillCooldown1))
      .writeUint16(cooldownToWire(player.skillCooldown2))
      .writeUint16(cooldownToWire(player.skillCooldown3))
      .writeUint16(player.lastProcessedInput & 0xffff)
      .writeUint8(
        (player.dazed ? PLAYER_STATUS_FLAG.Dazed : 0) |
          (player.slowed ? PLAYER_STATUS_FLAG.Slowed : 0) |
          (player.boosted ? PLAYER_STATUS_FLAG.Boosted : 0) |
          (player.slippery ? PLAYER_STATUS_FLAG.Slippery : 0) |
          (player.auraHealed ? PLAYER_STATUS_FLAG.AuraHealed : 0) |
          (player.auraResupplied ? PLAYER_STATUS_FLAG.AuraResupplied : 0) |
          (player.auraActive ? PLAYER_STATUS_FLAG.AuraActive : 0),
      )
      .writeUint8(shortTimerToWire(player.launchSeconds))
      // Protocol 8: support points (drifter supply aura).
      .writeUint16(Math.max(0, Math.min(65535, Math.floor(player.support))));
    // The class is known before this point, so the block is implicit.
    if (player.classId === 'mascot') {
      writeMascotState(
        writer,
        player.mascot ?? {
          heading: player.heading,
          yawRate: 0,
          stamina: 1,
          boostSeconds: 0,
          actionSeconds: 0,
          hopSeconds: 0,
          coyoteSeconds: 0,
          cooldownTicks: [0, 0, 0],
          pounding: false,
          skidding: false,
          galloping: false,
          exhausted: false,
          jumpsUsed: 0,
        },
      );
    }
  }

  writer.writeUint8(snapshot.vehicles.length & 0xff);
  for (const vehicle of snapshot.vehicles) writeVehicleState(writer, vehicle);

  // Protocol 7: ambient critter trailer.
  const critters = snapshot.critters.slice(0, MAX_WIRE_CRITTERS);
  writer.writeUint8(critters.length);
  for (const critter of critters) writeCritterState(writer, critter);

  // Protocol 9: Climate Conquest block (towers, round phase, timer), after the critter trailer.
  writeConquestState(writer, snapshot.conquest);

  return writer.finish();
}

export function decodeSnapshot(source: ArrayBuffer | ArrayBufferView): WorldSnapshot | null {
  return safeDecode(() => {
    const reader = new BinaryReader(source);
    if (reader.readUint8() !== Opcode.S2C_WORLD_SNAPSHOT) throw new RangeError('Wrong opcode.');
    const serverTick = reader.readUint32();
    const weatherBalance = reader.readInt8() / 100;
    const windAngle = (reader.readUint8() / 255) * Math.PI * 2;
    const windStrength = reader.readUint8() / 255;
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
      const parachuteRaw = reader.readUint8();
      if (parachuteRaw > 3) throw new RangeError('Invalid parachute state.');
      const weaponSlotRaw = reader.readUint8();
      if (weaponSlotRaw < 1 || weaponSlotRaw > 3) throw new RangeError('Invalid weapon slot.');
      const ammo = reader.readUint16();
      const reserve = reader.readUint16();
      const shield = reader.readUint16();
      const kills = reader.readUint8();
      const deaths = reader.readUint8();
      const skillCooldown1 = wireToCooldown(reader.readUint16());
      const skillCooldown2 = wireToCooldown(reader.readUint16());
      const skillCooldown3 = wireToCooldown(reader.readUint16());
      const lastProcessedInput = reader.readUint16();
      const status = reader.readUint8();
      const launchSeconds = wireToShortTimer(reader.readUint8());
      const support = reader.readUint16();
      const mascot = classId === 'mascot' ? readMascotState(reader) : null;
      players.push({
        id,
        faction,
        classId,
        position,
        velocity,
        yaw,
        hp,
        maxHp: classStatsFor(classId, faction).maxHp,
        grounded: (flags & PLAYER_FLAG.Grounded) !== 0,
        alive: (flags & PLAYER_FLAG.Alive) !== 0,
        crouched: (flags & PLAYER_FLAG.Crouched) !== 0,
        swimming: (flags & PLAYER_FLAG.Swimming) !== 0,
        sprinting: (flags & PLAYER_FLAG.Sprinting) !== 0,
        rolling: (flags & PLAYER_FLAG.Rolling) !== 0,
        parachuteState: parachuteRaw as PlayerState['parachuteState'],
        weaponSlot: weaponSlotRaw as PlayerState['weaponSlot'],
        ammo,
        reserve,
        reloading: (flags & PLAYER_FLAG.Reloading) !== 0,
        shield,
        kills,
        deaths,
        skillCooldown1,
        skillCooldown2,
        skillCooldown3,
        cloaked: (flags & PLAYER_FLAG.Cloaked) !== 0,
        lastProcessedInput,
        heading: mascot ? mascot.heading : yaw,
        launchSeconds,
        dazed: (status & PLAYER_STATUS_FLAG.Dazed) !== 0,
        slowed: (status & PLAYER_STATUS_FLAG.Slowed) !== 0,
        boosted: (status & PLAYER_STATUS_FLAG.Boosted) !== 0,
        slippery: (status & PLAYER_STATUS_FLAG.Slippery) !== 0,
        support,
        auraHealed: (status & PLAYER_STATUS_FLAG.AuraHealed) !== 0,
        auraResupplied: (status & PLAYER_STATUS_FLAG.AuraResupplied) !== 0,
        auraActive: (status & PLAYER_STATUS_FLAG.AuraActive) !== 0,
        mascot,
      });
    }

    const vehicleCount = reader.readUint8();
    const vehicles: VehicleSnapshot[] = [];
    for (let index = 0; index < vehicleCount; index += 1) vehicles.push(readVehicleState(reader));

    const critterCount = reader.readUint8();
    if (critterCount > MAX_WIRE_CRITTERS) throw new RangeError('Too many critters in snapshot.');
    const critters: CritterState[] = [];
    for (let index = 0; index < critterCount; index += 1) critters.push(readCritterState(reader));

    const conquest = readConquestState(reader);

    return {
      serverTick,
      weatherBalance,
      windAngle,
      windStrength,
      ticketsAlpine,
      ticketsLagoon,
      turretStates,
      players,
      vehicles,
      critters,
      conquest,
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
