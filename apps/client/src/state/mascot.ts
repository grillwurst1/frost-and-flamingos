import { writable } from 'svelte/store';
import type { MascotForm, SkillId } from '@frost-and-flamingos/shared';

/** Live mascot status for MascotHud. null while the local player is human. */
export interface MascotHudState {
  form: MascotForm;
  hp: number;
  maxHp: number;
  alive: boolean;
  /** Cow gallop meter 0–1 (coconuts report momentum instead). */
  stamina: number;
  exhausted: boolean;
  galloping: boolean;
  boosting: boolean;
  skidding: boolean;
  pounding: boolean;
  /** Horizontal speed in m/s. */
  speed: number;
  /** Coconut momentum 0–1 relative to its turbo top speed. */
  momentum: number;
  moves: [SkillId, SkillId, SkillId];
  cooldowns: [number, number, number];
  cooldownMax: [number, number, number];
  activeSlot: 1 | 2 | 3;
  dazed: boolean;
  slippery: boolean;
}

export const mascotHud = writable<MascotHudState | null>(null);
