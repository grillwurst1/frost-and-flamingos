import { writable } from 'svelte/store';
import type { Faction } from '@frost-and-flamingos/shared';

export interface TacticalPlayer { id: number; x: number; z: number; faction: Faction; alive: boolean }
export interface PlayerTag { id: number; name: string; x: number; y: number; friendly: boolean; local: boolean; lift?: number }
export const tacticalPlayers = writable<TacticalPlayer[]>([]);
export const playerTags = writable<PlayerTag[]>([]);
