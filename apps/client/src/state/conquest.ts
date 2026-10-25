import { writable } from 'svelte/store';
import {
  CONQUEST_RULES,
  emptyTowerControl,
  type ConquestSnapshot,
  type Faction,
} from '@frost-and-flamingos/shared';

/**
 * Climate Conquest as the HUD sees it: the latest authoritative round state
 * plus where the local player stands. The engine (ConquestClient) writes it;
 * components only read.
 */
export interface ConquestView extends ConquestSnapshot {
  /** Wire index of the capture zone the local player stands in (−1 none). */
  localZone: number;
  /** The local player's class counts toward captures (false for the drifter). */
  localCanCapture: boolean;
  /** True once the first snapshot arrived (before that the view is the round-start default). */
  synced: boolean;
}

export const conquest = writable<ConquestView>({
  towers: [emptyTowerControl('lagoon'), emptyTowerControl(null), emptyTowerControl('alpine')],
  phase: 'live',
  winner: null,
  reason: null,
  round: 1,
  secondsLeft: CONQUEST_RULES.roundSeconds,
  localZone: -1,
  localCanCapture: true,
  synced: false,
});

/** A capture or neutralisation line of the resort feed (shown beside the kill ribbons). */
export interface ObjectiveFeedEntry {
  id: number;
  kind: 'captured' | 'neutralised';
  towerIndex: number;
  /** The team that took the tower (or pulled its flag down). */
  faction: Faction;
  at: number;
}

export const objectiveFeed = writable<ObjectiveFeedEntry[]>([]);

let objectiveFeedId = 0;

export function pushObjectiveFeed(entry: Omit<ObjectiveFeedEntry, 'id'>): void {
  objectiveFeedId += 1;
  objectiveFeed.update((entries) => [...entries.slice(-3), { ...entry, id: objectiveFeedId }]);
}

/** Objective lines stay a little longer than kill ribbons (8 s). */
export function pruneObjectiveFeed(now: number): void {
  objectiveFeed.update((entries) => {
    const live = entries.filter((entry) => now - entry.at < 8000);
    return live.length === entries.length ? entries : live;
  });
}

/** The local player is inside its spawn protection (HUD tag). */
export const spawnProtected = writable(false);

export function resetConquestUi(): void {
  objectiveFeed.set([]);
  spawnProtected.set(false);
  conquest.update((state) => ({ ...state, localZone: -1 }));
}
