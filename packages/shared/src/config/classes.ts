import type { ClassId, Faction } from '../types/index.js';

export interface ClassStats {
  id: ClassId;
  maxHp: number;
  moveSpeed: number;
  sprintMultiplier: number;
  radius: number;
  height: number;
  jumpSpeed: number;
  groundAcceleration: number;
  airAcceleration: number;
  groundFriction: number;
}

export const CLASS_STATS: Record<ClassId, ClassStats> = {
  allrounder: {
    id: 'allrounder',
    maxHp: 150,
    moveSpeed: 7,
    sprintMultiplier: 1.32,
    radius: 0.45,
    height: 1.8,
    jumpSpeed: 7.4,
    groundAcceleration: 56,
    airAcceleration: 16,
    groundFriction: 11,
  },
  heavy: {
    id: 'heavy',
    maxHp: 220,
    moveSpeed: 5.6,
    sprintMultiplier: 1.24,
    radius: 0.62,
    height: 1.95,
    jumpSpeed: 6.5,
    groundAcceleration: 42,
    airAcceleration: 12,
    groundFriction: 10,
  },
  infiltrator: {
    id: 'infiltrator',
    maxHp: 110,
    moveSpeed: 8.1,
    sprintMultiplier: 1.38,
    radius: 0.38,
    height: 1.75,
    jumpSpeed: 8.1,
    groundAcceleration: 66,
    airAcceleration: 22,
    groundFriction: 12,
  },
};

export const FACTION_THEME: Record<
  Faction,
  {
    nameKey: string;
    shortNameKey: string;
    primaryHex: string;
    secondaryHex: string;
    accentHex: string;
    darkHex: string;
    uiGradient: [string, string];
  }
> = {
  alpine: {
    nameKey: 'factions.alpine.name',
    shortNameKey: 'factions.alpine.short',
    primaryHex: '#e8f4ff',
    secondaryHex: '#c62f45',
    accentHex: '#f4c95d',
    darkHex: '#12324b',
    uiGradient: ['#dff4ff', '#7db7d8'],
  },
  lagoon: {
    nameKey: 'factions.lagoon.name',
    shortNameKey: 'factions.lagoon.short',
    primaryHex: '#12b8a6',
    secondaryHex: '#ff6b5e',
    accentHex: '#ffd166',
    darkHex: '#073f4b',
    uiGradient: ['#ffd6a5', '#ff7f73'],
  },
};

export const DEFAULT_CLASS: ClassId = 'allrounder';
