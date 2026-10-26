/**
 * Protocol 9 conquest block, appended to every world snapshot after the
 * critter trailer (14 bytes):
 *
 *   per tower A, B, C (3 bytes each):
 *     u8 flags   bits 0-1 owner, bits 2-3 pushing side (0 none, 1 Peak Guard,
 *                2 Lagoon League), bit 4 contested
 *     i8 control signed capture control × 127 (−127 Peak Guard … +127 Lagoon)
 *     u8 counts  low nibble Peak Guard, high nibble Lagoon League (capped 15)
 *   u8  round    bit 0 phase (0 live, 1 ended), bits 1-2 winner, bits 3-4
 *                reason (0 none, 1 tickets, 2 time)
 *   u16 round number
 *   u16 seconds left × 10 (round time while live, intermission while ended)
 */
import type {
  ConquestSnapshot,
  Faction,
  RoundEndReason,
  TowerControlState,
} from '../types/index.js';
import type { BinaryReader } from './reader.js';
import type { BinaryWriter } from './writer.js';

const CONQUEST_TOWER_COUNT = 3;
const CONTESTED_BIT = 1 << 4;

function sideToWire(faction: Faction | null): number {
  return faction === 'alpine' ? 1 : faction === 'lagoon' ? 2 : 0;
}

function wireToSide(code: number): Faction | null {
  if (code === 0) return null;
  if (code === 1) return 'alpine';
  if (code === 2) return 'lagoon';
  throw new RangeError('Invalid conquest side code.');
}

function reasonToWire(reason: RoundEndReason | null): number {
  return reason === 'tickets' ? 1 : reason === 'time' ? 2 : 0;
}

function wireToReason(code: number): RoundEndReason | null {
  if (code === 0) return null;
  if (code === 1) return 'tickets';
  if (code === 2) return 'time';
  throw new RangeError('Invalid round end reason.');
}

function nibble(count: number): number {
  return Math.max(0, Math.min(15, Math.round(count)));
}

/**
 * Legacy header byte (`turretStates`, protocol ≤ 6): 2 bits of owner per
 * tower, A in bits 0-1. Kept in the header for tools that only read it.
 */
export function towerOwnerBits(towers: readonly Pick<TowerControlState, 'owner'>[]): number {
  let bits = 0;
  towers.slice(0, CONQUEST_TOWER_COUNT).forEach((tower, index) => {
    bits |= sideToWire(tower.owner) << (index * 2);
  });
  return bits & 0xff;
}

export function emptyTowerControl(owner: Faction | null = null): TowerControlState {
  return {
    owner,
    control: owner === 'alpine' ? -1 : owner === 'lagoon' ? 1 : 0,
    pushing: null,
    contested: false,
    alpine: 0,
    lagoon: 0,
  };
}

export function writeConquestState(writer: BinaryWriter, state: ConquestSnapshot): void {
  for (let index = 0; index < CONQUEST_TOWER_COUNT; index += 1) {
    const tower = state.towers[index] ?? emptyTowerControl();
    const control = Math.max(-1, Math.min(1, Number.isFinite(tower.control) ? tower.control : 0));
    writer
      .writeUint8(sideToWire(tower.owner) | (sideToWire(tower.pushing) << 2) | (tower.contested ? CONTESTED_BIT : 0))
      .writeInt8(Math.round(control * 127))
      .writeUint8(nibble(tower.alpine) | (nibble(tower.lagoon) << 4));
  }
  writer
    .writeUint8((state.phase === 'ended' ? 1 : 0) | (sideToWire(state.winner) << 1) | (reasonToWire(state.reason) << 3))
    .writeUint16(Math.max(0, Math.min(65535, Math.round(state.round))))
    .writeUint16(Math.max(0, Math.min(65535, Math.round(state.secondsLeft * 10))));
}

export function readConquestState(reader: BinaryReader): ConquestSnapshot {
  const towers: TowerControlState[] = [];
  for (let index = 0; index < CONQUEST_TOWER_COUNT; index += 1) {
    const flags = reader.readUint8();
    const control = reader.readInt8() / 127;
    const counts = reader.readUint8();
    towers.push({
      owner: wireToSide(flags & 3),
      control,
      pushing: wireToSide((flags >> 2) & 3),
      contested: (flags & CONTESTED_BIT) !== 0,
      alpine: counts & 0x0f,
      lagoon: counts >> 4,
    });
  }
  const round = reader.readUint8();
  const roundNumber = reader.readUint16();
  const secondsLeft = reader.readUint16() / 10;
  const [a, b, c] = towers;
  if (!a || !b || !c) throw new RangeError('Incomplete conquest block.');
  return {
    towers: [a, b, c],
    phase: (round & 1) === 1 ? 'ended' : 'live',
    winner: wireToSide((round >> 1) & 3),
    reason: wireToReason((round >> 3) & 3),
    round: roundNumber,
    secondsLeft,
  };
}
