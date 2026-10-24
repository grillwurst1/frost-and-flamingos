export type GameplayMusicTier = 'calm' | 'mid' | 'intense';
export type MusicTrackRole = 'menu' | 'round' | 'gameplay';
export type RoundMusicCue = 'loading' | 'ended' | 'dead';

export interface MusicTrackDefinition {
  readonly id: string;
  readonly url: string;
  readonly title: string;
  /** Approximate tempo detected from the supplied master; used for scene matching. */
  readonly bpm: number;
  readonly role: MusicTrackRole;
  readonly tier?: GameplayMusicTier;
}

/**
 * Supplied music beds. The BPM measurements drive the intensity mapping:
 * calm ~90 BPM, medium ~123 BPM, hectic ~144 BPM. Replacing a file only requires
 * updating its URL/BPM here; the audio engine crossfades whatever is registered.
 */
export const MENU_MUSIC_TRACK: MusicTrackDefinition = {
  id: 'menu-lederhosen',
  url: '/audio/lederhosen-on-the-sand.mp3',
  title: 'Lederhosen on the Sand',
  bpm: 103,
  role: 'menu',
};

/**
 * In-game transition bed. It covers round loading, the round-end screen and
 * the live killer/death view. It is deliberately never used in the menu.
 * Detected tempo is ~60 BPM half-time / ~120 BPM double-time.
 */
export const ROUND_MUSIC_TRACK: MusicTrackDefinition = {
  id: 'round-sandbar',
  url: '/audio/skiing-the-sandbar.mp3',
  title: 'Skiing the Sandbar',
  bpm: 120,
  role: 'round',
};

export const GAMEPLAY_MUSIC_TRACKS: Readonly<Record<GameplayMusicTier, MusicTrackDefinition>> = {
  calm: {
    id: 'gameplay-calm',
    url: '/audio/midday-at-the-chalet.mp3',
    title: 'Midday at the Chalet',
    bpm: 90,
    role: 'gameplay',
    tier: 'calm',
  },
  mid: {
    id: 'gameplay-mid',
    url: '/audio/surfing-the-alpine-slope.mp3',
    title: 'Surfing the Alpine Slope',
    bpm: 123,
    role: 'gameplay',
    tier: 'mid',
  },
  intense: {
    id: 'gameplay-intense',
    url: '/audio/the-cactus-gambit.mp3',
    title: 'The Cactus Gambit',
    bpm: 144,
    role: 'gameplay',
    tier: 'intense',
  },
};

export const MUSIC_TRACKS: readonly MusicTrackDefinition[] = [
  MENU_MUSIC_TRACK,
  ROUND_MUSIC_TRACK,
  ...Object.values(GAMEPLAY_MUSIC_TRACKS),
];

/**
 * Hysteresis keeps the score from flapping between beds when movement speed
 * hovers around a threshold. The two thresholds per edge differ by at least
 * 0.16 intensity (~0.1 of normalised speed).
 */
export function nextGameplayTier(
  current: GameplayMusicTier,
  intensity: number,
): GameplayMusicTier {
  const value = Math.min(1, Math.max(0, intensity));
  if (current === 'calm') {
    if (value >= 0.78) return 'intense';
    if (value >= 0.5) return 'mid';
    return 'calm';
  }
  if (current === 'mid') {
    if (value >= 0.78) return 'intense';
    if (value <= 0.42) return 'calm';
    return 'mid';
  }
  if (value <= 0.42) return 'calm';
  return value <= 0.62 ? 'mid' : 'intense';
}
