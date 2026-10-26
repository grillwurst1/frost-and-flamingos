import { writable } from 'svelte/store';
import type { VisualQuality } from '../rendering/scene-look';

/**
 * Picture-quality setting. 'auto' lets GameClient pick the tier from the GPU
 * class (rendering/gpu-tier.ts) and its continuous frame-time governor; a fixed tier
 * overrides both. `?quality=high|medium|low|auto` forces a setting for one
 * session without touching the saved choice.
 */
export type VisualQualitySetting = 'auto' | VisualQuality;

export const VISUAL_QUALITY_SETTINGS: readonly VisualQualitySetting[] = ['auto', 'high', 'medium', 'low'];

const STORAGE_KEY = 'frost-and-flamingos.visualQuality';

function isSetting(value: unknown): value is VisualQualitySetting {
  return value === 'auto' || value === 'high' || value === 'medium' || value === 'low';
}

function initialSetting(): VisualQualitySetting {
  if (typeof window === 'undefined') return 'auto';
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('quality');
    if (isSetting(fromUrl)) return fromUrl;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isSetting(stored)) return stored;
  } catch {
    // URL or storage access can be blocked; fall back to automatic.
  }
  return 'auto';
}

/** The player's choice ('auto' or a fixed tier). */
export const visualQualitySetting = writable<VisualQualitySetting>(initialSetting());

/** The tier the renderer is using right now; null until the engine is up. */
export const activeVisualQuality = writable<VisualQuality | null>(null);

/** Applies and saves a player choice. */
export function chooseVisualQuality(setting: VisualQualitySetting): void {
  visualQualitySetting.set(setting);
  try {
    window.localStorage.setItem(STORAGE_KEY, setting);
  } catch {
    // Storage may be unavailable (private mode); the setting still applies.
  }
}
