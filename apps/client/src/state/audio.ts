import { get, writable } from 'svelte/store';
import { DEFAULT_AUDIO_VOLUMES, audio, type AudioVolumes } from '../audio/synth';

const STORAGE_KEY = 'frost-and-flamingos.audio';

function clampVolume(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(1, Math.max(0, value));
}

function loadVolumes(): AudioVolumes {
  if (typeof window === 'undefined') return { ...DEFAULT_AUDIO_VOLUMES };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_AUDIO_VOLUMES };
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      master: clampVolume(parsed.master, DEFAULT_AUDIO_VOLUMES.master),
      sfx: clampVolume(parsed.sfx, DEFAULT_AUDIO_VOLUMES.sfx),
      music: clampVolume(parsed.music, DEFAULT_AUDIO_VOLUMES.music),
      voice: clampVolume(parsed.voice, DEFAULT_AUDIO_VOLUMES.voice),
    };
  } catch {
    return { ...DEFAULT_AUDIO_VOLUMES };
  }
}

export const audioVolumes = writable<AudioVolumes>(loadVolumes());

audioVolumes.subscribe((volumes) => {
  audio.setVolumes(volumes);
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(volumes));
  } catch {
    // Storage can be blocked; the session still uses the current volumes.
  }
});

export function setVolume(key: keyof AudioVolumes, value: number): void {
  audioVolumes.update((current) => ({
    ...current,
    [key]: Math.min(1, Math.max(0, value)),
  }));
}

export function getVolumes(): AudioVolumes {
  return get(audioVolumes);
}

export function resetVolumes(): void {
  audioVolumes.set({ ...DEFAULT_AUDIO_VOLUMES });
}
