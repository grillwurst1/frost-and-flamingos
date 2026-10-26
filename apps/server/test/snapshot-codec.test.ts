/**
 * Protocol 9 (3H critters = 7, 3G drifter = 8, 4V vehicles = 9): one merged
 * WorldSnapshot with a drifter (aura bits + uint16 support score), an
 * aura-supplied teammate riding a vehicle, the full 4V vehicle block and the
 * critter trailer survives the binary codec field for field, in the order
 * players -> vehicles -> critters.
 *
 *   bun test apps/server/test/snapshot-codec.test.ts
 */
import { describe, expect, test } from 'bun:test';
import {
  PHYSICS_TICK_RATE,
  PROTOCOL_VERSION,
  VEHICLE_FLAG,
  VEHICLE_KIND_TABLE,
  VEHICLES,
  classStatsFor,
  decodeSnapshot,
  encodeSnapshot,
  type CritterState,
  type PlayerState,
  type VehicleSnapshot,
  type WorldSnapshot,
} from '@frost-and-flamingos/shared';

/** Values the wire carries exactly, so decode(encode(x)) deep-equals x. */
const pos = (x: number, y: number, z: number) => ({ x: x / 80, y: y / 80, z: z / 80 });
const vel = (x: number, y: number, z: number) => ({ x: x / 128, y: y / 128, z: z / 128 });
const angle = (steps: number): number => (steps / 65535) * Math.PI * 2;
/** Signed wire angles (vehicle yaw / turret yaw decode to -π…π). */
const signedAngle = (steps: number): number => (steps > 32767 ? angle(steps) - Math.PI * 2 : angle(steps));
/** Milli-unit wire values (yaw rate, steer, turret pitch). */
const milli = (value: number): number => value / 1000;

function player(overrides: Partial<PlayerState> & Pick<PlayerState, 'id' | 'faction' | 'classId'>): PlayerState {
  const yaw = overrides.yaw ?? angle(9000);
  return {
    position: pos(1000, 1440, -3240),
    velocity: vel(64, -32, 160),
    yaw,
    hp: classStatsFor(overrides.classId, overrides.faction).maxHp,
    maxHp: classStatsFor(overrides.classId, overrides.faction).maxHp,
    grounded: true,
    alive: true,
    crouched: false,
    swimming: false,
    sprinting: false,
    rolling: false,
    parachuteState: 0,
    weaponSlot: 1,
    ammo: 0,
    reserve: 0,
    reloading: false,
    shield: 0,
    kills: 0,
    deaths: 0,
    skillCooldown1: 0,
    skillCooldown2: 0,
    skillCooldown3: 0,
    cloaked: false,
    lastProcessedInput: 0,
    heading: yaw,
    launchSeconds: 0,
    dazed: false,
    slowed: false,
    boosted: false,
    slippery: false,
    support: 0,
    auraHealed: false,
    auraResupplied: false,
    auraActive: false,
    mascot: null,
    ...overrides,
  };
}

const drifter = player({
  id: 3,
  faction: 'alpine',
  classId: 'drifter',
  yaw: angle(20000),
  heading: angle(20000),
  kills: 0,
  deaths: 2,
  lastProcessedInput: 65530,
  launchSeconds: 30 / PHYSICS_TICK_RATE,
  // Above 255 and above 32767: the score really is a uint16.
  support: 40321,
  auraActive: true,
});

const mate = player({
  id: 9,
  faction: 'alpine',
  classId: 'allrounder',
  position: pos(1040, 1442, -3200),
  hp: 87,
  ammo: 24,
  reserve: 96,
  weaponSlot: 2,
  kills: 4,
  skillCooldown1: 2.5,
  skillCooldown3: 12.3,
  slowed: true,
  auraHealed: true,
  auraResupplied: true,
});

const enemy = player({
  id: 12,
  faction: 'lagoon',
  classId: 'heavy',
  position: pos(-15200, 112, -12000),
  shield: 40,
  sprinting: true,
  grounded: false,
  boosted: true,
});

// The teammate drives the tank (gunner seat free); an enemy boat floats empty on its turbo cooldown.
const tank: VehicleSnapshot = {
  id: 2,
  type: VEHICLE_KIND_TABLE.code.coconut_tank,
  position: pos(400, 800, 1200),
  yaw: signedAngle(4000),
  health: 900,
  velocity: vel(512, -16, -384),
  yawRate: milli(731),
  steer: milli(-210),
  turretYaw: signedAngle(60000),
  turretPitch: milli(120),
  flags: VEHICLE_FLAG.Grounded | VEHICLE_FLAG.Handbrake,
  boostTicks: 0,
  boostCooldownTicks: 0,
  weaponCooldownTicks: 180,
  seats: VEHICLES.coconut_tank.seats.map((_, index) => (index === 0 ? mate.id : 0)),
};
const boat: VehicleSnapshot = {
  id: 7,
  type: VEHICLE_KIND_TABLE.code.badi_flamingo,
  position: pos(-15600, 0, -12400),
  yaw: signedAngle(50000),
  health: 312,
  velocity: vel(0, 0, 0),
  yawRate: 0,
  steer: 0,
  turretYaw: 0,
  turretPitch: milli(-45),
  flags: VEHICLE_FLAG.Afloat,
  boostTicks: 150,
  boostCooldownTicks: 420,
  weaponCooldownTicks: 0,
  seats: VEHICLES.badi_flamingo.seats.map(() => 0),
};
const vehicles: VehicleSnapshot[] = [tank, boat];

const critters: CritterState[] = [
  { id: 1, species: 'hen', half: 'alpine', position: pos(988, 1442, -3240), yaw: angle(12000), speed: 19 / 20, behaviour: 'walk', alive: true, airborne: false },
  { id: 2, species: 'hen', half: 'lagoon', position: pos(-15208, 112, -12056), yaw: angle(30000), speed: 88 / 20, behaviour: 'flee', alive: true, airborne: true },
  { id: 3, species: 'hen', half: 'lagoon', position: pos(-16000, 160, -12800), yaw: 0, speed: 0, behaviour: 'peck', alive: false, airborne: false },
];

const snapshot: WorldSnapshot = {
  serverTick: 987654,
  weatherBalance: -0.25,
  windAngle: (64 / 255) * Math.PI * 2,
  windStrength: 128 / 255,
  ticketsAlpine: 47,
  ticketsLagoon: 50,
  turretStates: 5,
  players: [drifter, mate, enemy],
  vehicles,
  critters,
};

const HEADER_BYTES = 14;
/** Non-mascot player record (3G support uint16 included). */
const PLAYER_BYTES = 43;
/** 4V vehicle block: 35 B + 2 B per seat. */
const vehicleBytes = (vehicle: VehicleSnapshot): number => 35 + 2 * vehicle.seats.length;

/** Header, players, vehicle count + blocks, critter count + 12 B each. */
function expectedBytes(value: WorldSnapshot): number {
  const vehicleBlock = value.vehicles.reduce((sum, vehicle) => sum + vehicleBytes(vehicle), 0);
  return HEADER_BYTES + value.players.length * PLAYER_BYTES + 1 + vehicleBlock + 1 + value.critters.length * 12;
}

describe('merged protocol 9 snapshot codec', () => {
  test('protocol version is 9 (3H critters = 7, 3G drifter = 8, 4V vehicles = 9)', () => {
    expect(PROTOCOL_VERSION).toBe(9);
  });

  test('a drifter, a seated teammate, the vehicle block and critters round-trip with deep equality', () => {
    const bytes = encodeSnapshot(snapshot);
    expect(bytes.byteLength).toBe(expectedBytes(snapshot));
    const decoded = decodeSnapshot(bytes);
    expect(decoded).not.toBeNull();
    expect(decoded).toEqual(snapshot);
    const wireDrifter = decoded?.players.find((entry) => entry.id === drifter.id);
    expect(wireDrifter?.classId).toBe('drifter');
    expect(wireDrifter?.support).toBe(40321);
    expect(wireDrifter?.auraActive).toBe(true);
    expect(wireDrifter?.auraHealed).toBe(false);
    const wireMate = decoded?.players.find((entry) => entry.id === mate.id);
    expect(wireMate?.auraHealed).toBe(true);
    expect(wireMate?.auraResupplied).toBe(true);
    expect(wireMate?.slowed).toBe(true);
    expect(decoded?.critters).toEqual(critters);
    expect(decoded?.vehicles).toEqual(vehicles);
    expect(decoded?.vehicles[0]?.seats[0]).toBe(mate.id);
    expect(decoded?.vehicles[0]?.turretYaw).toBeLessThan(0);
    // Re-encoding the decoded snapshot is byte-identical.
    if (!decoded) throw new Error('decode failed');
    expect(new Uint8Array(encodeSnapshot(decoded))).toEqual(new Uint8Array(bytes));
  });

  test('support saturates at the uint16 range and a truncated trailer is rejected', () => {
    const capped = decodeSnapshot(
      encodeSnapshot({ ...snapshot, players: [{ ...drifter, support: 70000 }, { ...mate, support: -3 }] }),
    );
    expect(capped?.players[0]?.support).toBe(65535);
    expect(capped?.players[1]?.support).toBe(0);
    const bytes = new Uint8Array(encodeSnapshot(snapshot));
    expect(decodeSnapshot(bytes.slice(0, bytes.length - 1))).toBeNull();
    // A snapshot that stops after the vehicles (no critter trailer) fails, not half-reads.
    expect(decodeSnapshot(bytes.slice(0, expectedBytes({ ...snapshot, critters: [] }) - 1))).toBeNull();
    // A protocol-8 style vehicle record (13 B, no motor state) cannot pass for protocol 9.
    expect(decodeSnapshot(bytes.slice(0, HEADER_BYTES + snapshot.players.length * PLAYER_BYTES + 1 + 13))).toBeNull();
  });

  test('wire order is players, then vehicles, then critters', () => {
    const bytes = new Uint8Array(encodeSnapshot(snapshot));
    const vehicleCountAt = HEADER_BYTES + snapshot.players.length * PLAYER_BYTES;
    expect(bytes[vehicleCountAt]).toBe(vehicles.length);
    // First vehicle record: id u16 (little or big endian, it is 2) then the kind byte.
    const firstId = (bytes[vehicleCountAt + 1] ?? 0) | ((bytes[vehicleCountAt + 2] ?? 0) << 8);
    const firstIdBigEndian = ((bytes[vehicleCountAt + 1] ?? 0) << 8) | (bytes[vehicleCountAt + 2] ?? 0);
    expect([firstId, firstIdBigEndian]).toContain(tank.id);
    expect(bytes[vehicleCountAt + 3]).toBe(tank.type);
    const critterCountAt = vehicleCountAt + 1 + vehicles.reduce((sum, vehicle) => sum + vehicleBytes(vehicle), 0);
    expect(bytes[critterCountAt]).toBe(critters.length);
    expect(critterCountAt + 1 + critters.length * 12).toBe(bytes.byteLength);
  });

  test('an empty vehicle list and an empty critter trailer still round-trip', () => {
    const bare: WorldSnapshot = { ...snapshot, players: [drifter], vehicles: [], critters: [] };
    const bytes = encodeSnapshot(bare);
    expect(bytes.byteLength).toBe(expectedBytes(bare));
    expect(decodeSnapshot(bytes)).toEqual(bare);
  });
});
