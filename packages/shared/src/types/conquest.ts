/**
 * Climate Conquest round state as the server simulates it and the snapshot
 * carries it (protocol 9 conquest block). Tower order is always A, B, C.
 */
import type { Faction } from './index.js';

export type RoundPhase = 'live' | 'ended';

/** Why a round ended: one side ran out of tickets, or the round timer expired. */
export type RoundEndReason = 'tickets' | 'time';

export interface TowerControlState {
  /** Faction holding the tower, null while it is neutral. */
  owner: Faction | null;
  /**
   * Signed capture control in -1..1: -1 = fully Peak Guard, +1 = fully
   * Lagoon League, 0 = neutral. Ownership changes at the extremes; an owned
   * tower turns neutral when the control crosses zero.
   */
  control: number;
  /** Faction whose majority moves the control this tick (null: stalled or empty). */
  pushing: Faction | null;
  /** Both factions have capture-capable players inside the zone. */
  contested: boolean;
  /** Capture-capable living players inside the zone (capped at 15 on the wire). */
  alpine: number;
  lagoon: number;
}

export interface ConquestSnapshot {
  towers: [TowerControlState, TowerControlState, TowerControlState];
  phase: RoundPhase;
  /** Winner of the round that just ended (null while live, or on a draw). */
  winner: Faction | null;
  reason: RoundEndReason | null;
  /** 1-based round counter of the running server. */
  round: number;
  /** Live: round time left. Ended: intermission left before the reset. */
  secondsLeft: number;
}
