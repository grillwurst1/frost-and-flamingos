/**
 * Protocol 8 (3G drifter merged onto 3H critters): one merged WorldSnapshot
 * with a drifter (aura bits + uint16 support score), an aura-supplied
 * teammate, a vehicle and the critter trailer survives the binary codec
 * field for field.
 *
 *   bun test apps/server/test/snapshot-codec.test.ts
 */
import { describe, expect, test } from 'bun:test';
import {
  PHYSICS_TICK_RATE,
  PROTOCOL_VERSION,
  classStatsFor,
  decodeSnapshot,
  encodeSnapshot,
  type CritterState,
  type PlayerState,
  type WorldSnapshot,
} from '@frost-and-flamingos/shared';

/** Values the wire carries exactly, so decode(encode(x)) deep-equals x. */
const pos = (x: number, y: number, z: number) => ({ x: x / 80, y: y / 80, z: z / 80 });
const vel = (x: number, y: number, z: number) => ({ x: x / 128, y: y / 128, z: z / 128 });
const angle = (steps: number): number => (steps / 65535) * Math.PI * 2;

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
  vehicles: [{ id: 2, type: 1, position: pos(400, 800, 1200), yaw: angle(4000), health: 900 }],
  critters,
};

/** Header 14 B, 43 B per (non-mascot) player (support uint16 included), vehicle count + 13 B each, critter count + 12 B each. */
function expectedBytes(value: WorldSnapshot): number {
  return 14 + value.players.length * 43 + 1 + value.vehicles.length * 13 + 1 + value.critters.length * 12;
}

describe('merged protocol 8 snapshot codec', () => {
  test('protocol version is 8 (3H critters = 7, 3G drifter on top = 8)', () => {
    expect(PROTOCOL_VERSION).toBe(8);
  });

  test('a drifter with aura bits and support score plus critters round-trips with deep equality', () => {
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
    // A snapshot that stops after the vehicles (3G's own protocol 7, no critter trailer) fails, not half-reads.
    expect(decodeSnapshot(bytes.slice(0, expectedBytes({ ...snapshot, critters: [] }) - 1))).toBeNull();
  });
});
