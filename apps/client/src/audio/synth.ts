import type { Faction, SurfaceTag, Vec3, WeaponId } from '@frost-and-flamingos/shared';
import { scheduleGibberish } from './gibberish';
import {
  createOutdoorImpulseResponse,
  SFX_LIBRARY,
  type SfxDestination,
} from './library';
import {
  GAMEPLAY_MUSIC_TRACKS,
  MENU_MUSIC_TRACK,
  MUSIC_TRACKS,
  ROUND_MUSIC_TRACK,
  nextGameplayTier,
  type GameplayMusicTier,
  type MusicTrackDefinition,
  type RoundMusicCue,
} from './tracks';

export type AudioScene = 'menu' | 'loading' | 'gameplay';
export type AmbienceKind = 'menu' | 'alpine' | 'lagoon' | 'village' | 'water';
export type BusName = 'sfx' | 'vehicle' | 'voice' | 'ambience' | 'music';
export type UiSound =
  | 'click'
  | 'confirm'
  | 'hover'
  | 'back'
  | 'error'
  | 'tick'
  | 'equip'
  | 'shuffle'
  | 'reset';

export interface AudioVolumes {
  master: number;
  sfx: number;
  music: number;
  voice: number;
}

const SFX_RECIPES = new Map(SFX_LIBRARY.map((recipe) => [recipe.id, recipe]));

export const DEFAULT_AUDIO_VOLUMES: AudioVolumes = {
  master: 0.8,
  sfx: 0.9,
  music: 0.5,
  voice: 0.9,
};

interface ToneConfig {
  frequency: number;
  endFrequency?: number;
  duration: number;
  gain: number;
  type?: OscillatorType;
  bus?: BusName;
  when?: number;
  attack?: number;
  panner?: PannerNode;
}

interface NoiseConfig {
  duration: number;
  gain: number;
  filter?: BiquadFilterType;
  frequency?: number;
  endFrequency?: number;
  q?: number;
  bus?: BusName;
  when?: number;
  attack?: number;
  panner?: PannerNode;
}

const TRACK_LEVEL = 0.85;
const TRACK_FADE_IN = 1.4;
const TRACK_FADE_OUT = 0.9;
const TRACK_SWITCH_FADE = 2.1;
const TRACK_SWITCH_COOLDOWN = 4;
const MENU_BEAT = 60 / 96;
const GAMEPLAY_STEP = 60 / 128 / 4;
const MENU_CHORDS: readonly number[] = [57, 53, 48, 55];
const MENU_SCALE: readonly number[] = [69, 72, 74, 76, 79, 81, 84, 86];
const GAMEPLAY_SCALE: readonly number[] = [45, 48, 50, 52, 55, 57, 60, 62, 64, 67];

function midiToFrequency(note: number): number {
  return 440 * 2 ** ((note - 69) / 12);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

interface TrackVoice {
  readonly id: string;
  readonly source: AudioBufferSourceNode;
  readonly gain: GainNode;
}

/**
 * The audio engine. Every gameplay sound, ambience layer and voice cue is
 * synthesised with the Web Audio API. The supplied music beds are decoded into
 * AudioBuffers and routed through the same music bus, master gain and limiter.
 * The procedural score remains as a fallback while a track loads or if a file
 * is unavailable.
 *
 * Graph: sources -> sfx/vehicle/voice/ambience/music -> masterGain -> limiter
 *        -> destination.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;
  private sfxGain: GainNode | null = null;
  private vehicleGain: GainNode | null = null;
  private voiceGain: GainNode | null = null;
  private ambienceGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private trackBus: GainNode | null = null;
  private reverbSend: ConvolverNode | null = null;
  private readonly trackVoices = new Set<TrackVoice>();
  private readonly trackBuffers = new Map<string, AudioBuffer>();
  private readonly trackLoading = new Set<string>();
  private readonly trackFailures = new Set<string>();
  private activeTrackId: string | null = null;
  private gameplayTier: GameplayMusicTier = 'calm';
  private roundCue: RoundMusicCue | null = null;
  private lastTrackSwitchAt = Number.NEGATIVE_INFINITY;
  private noiseBuffer: AudioBuffer | null = null;
  private volumes: AudioVolumes = { ...DEFAULT_AUDIO_VOLUMES };
  private scene: AudioScene = 'menu';
  private unlocked = false;
  private musicTimer: ReturnType<typeof setInterval> | null = null;
  private musicStep = 0;
  private nextMusicTime = 0;
  private musicIntensity = 0.45;
  private desiredAmbience: AmbienceKind = 'menu';
  private ambienceKind: AmbienceKind | null = null;
  private ambienceSource: AudioBufferSourceNode | null = null;
  private ambienceFilter: BiquadFilterNode | null = null;
  private ambienceLevel: GainNode | null = null;
  private ambienceLfo: OscillatorNode | null = null;
  private ambienceLfoGain: GainNode | null = null;
  private ambienceTimer: ReturnType<typeof setInterval> | null = null;

  private readonly unlockFromGesture = (): void => {
    this.unlock();
  };

  constructor() {
    if (typeof window === 'undefined') return;
    window.addEventListener('pointerdown', this.unlockFromGesture, { passive: true });
    window.addEventListener('keydown', this.unlockFromGesture);
  }

  get isUnlocked(): boolean {
    return this.unlocked;
  }

  /** True once the round/death bed is decoded and can start immediately. */
  get roundTrackReady(): boolean {
    return this.trackBuffers.has(ROUND_MUSIC_TRACK.id);
  }

  /** Current external bed (or empty when the procedural fallback is playing). */
  get musicState(): {
    trackId: string | null;
    title: string;
    bpm: number;
    tier: GameplayMusicTier;
    scene: AudioScene;
    roundCue: RoundMusicCue | null;
  } {
    const track =
      this.activeTrackId === null
        ? null
        : MUSIC_TRACKS.find((entry) => entry.id === this.activeTrackId) ?? null;
    return {
      trackId: this.activeTrackId,
      title: track?.title ?? '',
      bpm: track?.bpm ?? 0,
      tier: this.gameplayTier,
      scene: this.scene,
      roundCue: this.roundCue,
    };
  }

  /** Must be called from a user gesture at least once (autoplay policy). */
  unlock(): void {
    if (typeof window === 'undefined') return;
    if (!this.ctx) this.createContext();
    const ctx = this.ctx;
    if (!ctx) return;
    if (ctx.state === 'suspended') void ctx.resume();
    if (this.unlocked) return;
    this.unlocked = true;
    window.removeEventListener('pointerdown', this.unlockFromGesture);
    window.removeEventListener('keydown', this.unlockFromGesture);
    this.restartMusic();
    this.startAmbience(this.desiredAmbience);
    this.preloadMusicTracks();
    this.syncActiveTrack(TRACK_FADE_IN);
  }

  setVolumes(next: Partial<AudioVolumes>): void {
    this.volumes = { ...this.volumes, ...next };
    this.applyVolumes();
  }

  setScene(scene: AudioScene): void {
    if (this.scene === scene) return;
    this.scene = scene;
    if (this.ctx && this.unlocked) {
      this.restartMusic();
      this.syncActiveTrack(1.6);
    }
  }

  setMusicIntensity(value: number): void {
    this.musicIntensity = clamp01(value);
    this.updateGameplayTier();
  }

  /**
   * Selects the in-game transition bed for round loading, round end or the
   * death/killer view. Pass null to return to the intensity-driven gameplay
   * bed. The menu never uses this bed.
   */
  setRoundCue(cue: RoundMusicCue | null): void {
    if (this.roundCue === cue) return;
    this.roundCue = cue;
    if (this.scene === 'gameplay' && this.unlocked) {
      this.syncActiveTrack(cue === null ? TRACK_SWITCH_FADE : 1.2);
    }
  }

  setAmbience(kind: AmbienceKind): void {
    this.desiredAmbience = kind;
    if (!this.ctx || !this.unlocked) return;
    this.startAmbience(kind);
  }

  updateListener(position: Vec3, forward: Vec3): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const listener = ctx.listener;
    const now = ctx.currentTime;
    listener.positionX.setTargetAtTime(position.x, now, 0.02);
    listener.positionY.setTargetAtTime(position.y, now, 0.02);
    listener.positionZ.setTargetAtTime(position.z, now, 0.02);
    listener.forwardX.setTargetAtTime(forward.x, now, 0.02);
    listener.forwardY.setTargetAtTime(forward.y, now, 0.02);
    listener.forwardZ.setTargetAtTime(forward.z, now, 0.02);
    listener.upX.setTargetAtTime(0, now, 0.02);
    listener.upY.setTargetAtTime(1, now, 0.02);
    listener.upZ.setTargetAtTime(0, now, 0.02);
  }

  playUi(sound: UiSound): void {
    if (!this.ctx) return;
    switch (sound) {
      case 'click':
        this.tone({ frequency: 760, endFrequency: 620, duration: 0.045, gain: 0.07, type: 'triangle' });
        this.noise({ duration: 0.025, gain: 0.03, filter: 'highpass', frequency: 2600 });
        break;
      case 'confirm':
        this.tone({ frequency: 620, endFrequency: 940, duration: 0.1, gain: 0.08, type: 'triangle' });
        this.tone({ frequency: 940, endFrequency: 1240, duration: 0.14, gain: 0.06, type: 'sine', when: (this.ctx.currentTime ?? 0) + 0.07 });
        break;
      case 'hover':
        this.tone({ frequency: 1480, duration: 0.022, gain: 0.022, type: 'sine' });
        break;
      case 'back':
        this.tone({ frequency: 520, endFrequency: 310, duration: 0.12, gain: 0.06, type: 'triangle' });
        break;
      case 'error':
        this.tone({ frequency: 190, endFrequency: 150, duration: 0.16, gain: 0.08, type: 'square' });
        this.tone({ frequency: 142, duration: 0.18, gain: 0.05, type: 'sawtooth', when: (this.ctx.currentTime ?? 0) + 0.04 });
        break;
      case 'tick':
        this.tone({ frequency: 1220, duration: 0.026, gain: 0.035, type: 'sine' });
        break;
      case 'equip':
        this.tone({ frequency: 280, endFrequency: 640, duration: 0.09, gain: 0.09, type: 'sine' });
        this.noise({ duration: 0.05, gain: 0.045, filter: 'bandpass', frequency: 2100, q: 2 });
        break;
      case 'shuffle':
        for (let index = 0; index < 4; index += 1) {
          this.tone({
            frequency: 500 + index * 130,
            duration: 0.035,
            gain: 0.04,
            type: 'triangle',
            when: (this.ctx.currentTime ?? 0) + index * 0.045,
          });
        }
        break;
      case 'reset':
        this.tone({ frequency: 523, duration: 0.12, gain: 0.06, type: 'sine' });
        this.tone({ frequency: 659, duration: 0.12, gain: 0.055, type: 'sine', when: (this.ctx.currentTime ?? 0) + 0.08 });
        this.tone({ frequency: 784, duration: 0.16, gain: 0.05, type: 'sine', when: (this.ctx.currentTime ?? 0) + 0.16 });
        break;
      default:
        break;
    }
  }

  playFootstep(
    surface: SurfaceTag,
    position?: Vec3,
    sprinting = false,
    flippers = false,
  ): void {
    const panner = this.panner(position, 2.4, 38);
    const volume = sprinting ? 0.15 : 0.11;
    const shift = 0.92 + Math.random() * 0.16;
    const recipeId = flippers
      ? 'SFX_FOOTSTEP_FLIPPERS'
      : surface === 'snow'
        ? 'SFX_FOOTSTEP_SNOW'
        : surface === 'sand'
          ? 'SFX_FOOTSTEP_SAND'
          : surface === 'wood'
            ? 'SFX_FOOTSTEP_WOOD'
            : null;
    if (recipeId && this.playRecipe(recipeId, { position, volume: sprinting ? 0.58 : 0.46 })) {
      return;
    }
    switch (surface) {
      case 'snow':
        this.noise({ duration: 0.1, gain: volume, filter: 'lowpass', frequency: 1250 * shift, panner });
        this.noise({ duration: 0.05, gain: volume * 0.45, filter: 'bandpass', frequency: 2900 * shift, q: 0.8, panner });
        break;
      case 'sand':
        this.noise({ duration: 0.16, gain: volume * 0.9, filter: 'bandpass', frequency: 720 * shift, q: 0.7, panner });
        break;
      case 'grass_mud':
        this.noise({ duration: 0.12, gain: volume, filter: 'bandpass', frequency: 1100 * shift, q: 1.1, panner });
        break;
      case 'cobblestone':
        this.tone({ frequency: 720 * shift, duration: 0.035, gain: volume * 0.5, type: 'triangle', panner });
        this.noise({ duration: 0.045, gain: volume * 0.6, filter: 'bandpass', frequency: 1800 * shift, q: 2.4, panner });
        break;
      case 'wood':
        this.tone({ frequency: 360 * shift, duration: 0.06, gain: volume * 0.55, type: 'triangle', panner });
        this.noise({ duration: 0.05, gain: volume * 0.45, filter: 'bandpass', frequency: 900 * shift, q: 2, panner });
        break;
      case 'rock_cliff':
        this.noise({ duration: 0.09, gain: volume, filter: 'bandpass', frequency: 1750 * shift, q: 3.2, panner });
        this.tone({ frequency: 260 * shift, duration: 0.04, gain: volume * 0.3, type: 'square', panner });
        break;
      case 'water':
        this.noise({ duration: 0.2, gain: volume * 1.15, filter: 'lowpass', frequency: 850 * shift, panner });
        break;
      case 'ice_patch':
        if (this.playRecipe('SFX_ICE_SLIDE', { position, volume: 0.5 })) break;
        this.tone({ frequency: 2400 * shift, duration: 0.1, gain: volume * 0.3, type: 'sine', panner });
        this.noise({ duration: 0.14, gain: volume * 0.55, filter: 'highpass', frequency: 2100, panner });
        break;
      default:
        this.noise({ duration: 0.1, gain: volume, filter: 'lowpass', frequency: 1200, panner });
        break;
    }
  }

  playWeaponFire(weaponId: WeaponId, position?: Vec3, local = false): void {
    const panner = local ? undefined : this.panner(position, 5, 70);
    const volume = local ? 0.16 : 0.2;
    switch (weaponId) {
      case 'smg':
        this.noise({ duration: 0.07, gain: volume, filter: 'bandpass', frequency: 1900, q: 1.2, panner });
        this.tone({ frequency: 150, endFrequency: 70, duration: 0.07, gain: volume * 0.8, type: 'square', panner });
        break;
      case 'lmg':
        this.noise({ duration: 0.11, gain: volume * 1.15, filter: 'lowpass', frequency: 1400, panner });
        this.tone({ frequency: 105, endFrequency: 48, duration: 0.12, gain: volume, type: 'square', panner });
        break;
      case 'sniper':
        this.noise({ duration: 0.16, gain: volume * 1.5, filter: 'highpass', frequency: 900, panner });
        this.noise({ duration: 0.28, gain: volume * 0.55, filter: 'lowpass', frequency: 420, when: (this.ctx?.currentTime ?? 0) + 0.03, panner });
        this.tone({ frequency: 82, endFrequency: 38, duration: 0.22, gain: volume * 1.2, type: 'sine', panner });
        break;
      case 'shotgun':
        this.noise({ duration: 0.2, gain: volume * 1.6, filter: 'lowpass', frequency: 950, panner });
        this.tone({ frequency: 92, endFrequency: 40, duration: 0.18, gain: volume * 1.1, type: 'square', panner });
        break;
      case 'bazooka':
        this.noise({ duration: 0.36, gain: volume * 1.2, filter: 'bandpass', frequency: 360, endFrequency: 1200, q: 0.7, panner });
        this.tone({ frequency: 62, endFrequency: 32, duration: 0.3, gain: volume * 1.4, type: 'sine', panner });
        break;
      case 'silenced_pistol':
        this.noise({ duration: 0.045, gain: volume * 0.55, filter: 'bandpass', frequency: 2400, q: 2, panner });
        this.tone({ frequency: 240, endFrequency: 140, duration: 0.05, gain: volume * 0.4, type: 'triangle', panner });
        break;
      case 'knife':
      case 'halberd':
        this.noise({ duration: 0.16, gain: volume * 0.7, filter: 'bandpass', frequency: 900, endFrequency: 2600, q: 1.4, panner });
        break;
      case 'snow_cannon':
      case 'sand_flamer':
        this.noise({ duration: 0.2, gain: volume * 0.65, filter: 'highpass', frequency: 1500, panner });
        this.noise({ duration: 0.12, gain: volume * 0.4, filter: 'bandpass', frequency: 600, q: 0.8, panner });
        break;
      case 'crossbow':
        this.tone({ frequency: 620, endFrequency: 180, duration: 0.09, gain: volume * 0.9, type: 'triangle', panner });
        this.noise({ duration: 0.08, gain: volume * 0.4, filter: 'highpass', frequency: 2400, panner });
        break;
      case 'horn':
        this.tone({ frequency: 110, endFrequency: 82, duration: 0.5, gain: volume * 1.4, type: 'sawtooth', panner });
        this.tone({ frequency: 165, endFrequency: 123, duration: 0.45, gain: volume * 0.6, type: 'triangle', panner });
        break;
      case 'umbrella':
        this.noise({ duration: 0.14, gain: volume * 0.5, filter: 'bandpass', frequency: 1200, q: 1.2, panner });
        break;
    }
  }

  playWeaponReload(weaponId: WeaponId): void {
    const now = this.ctx?.currentTime ?? 0;
    const heavy = weaponId === 'lmg' || weaponId === 'shotgun' || weaponId === 'bazooka';
    this.noise({ duration: 0.05, gain: 0.055, filter: 'bandpass', frequency: 1800, q: 2 });
    this.tone({ frequency: 330, duration: 0.04, gain: 0.04, type: 'square', when: now + 0.08 });
    this.tone({ frequency: heavy ? 190 : 280, duration: 0.05, gain: 0.05, type: 'square', when: now + 0.2 });
    this.noise({ duration: 0.07, gain: 0.05, filter: 'highpass', frequency: 2200, when: now + 0.32 });
  }

  playDryFire(): void {
    this.tone({ frequency: 880, duration: 0.025, gain: 0.05, type: 'square' });
    this.noise({ duration: 0.03, gain: 0.03, filter: 'highpass', frequency: 3000 });
  }

  playHitMarker(headshot: boolean, kill: boolean): void {
    const now = this.ctx?.currentTime ?? 0;
    this.tone({
      frequency: headshot ? 1480 : 1080,
      duration: 0.045,
      gain: 0.06,
      type: 'triangle',
    });
    if (kill) {
      this.tone({ frequency: 660, duration: 0.09, gain: 0.07, type: 'triangle', when: now + 0.04 });
      this.tone({ frequency: 990, duration: 0.12, gain: 0.06, type: 'sine', when: now + 0.1 });
    }
  }

  playExplosion(position?: Vec3): void {
    const panner = this.panner(position, 8, 120);
    const now = this.ctx?.currentTime ?? 0;
    this.noise({ duration: 0.65, gain: 0.26, filter: 'lowpass', frequency: 780, endFrequency: 120, panner });
    this.tone({ frequency: 64, endFrequency: 28, duration: 0.55, gain: 0.24, type: 'sine', panner });
    this.noise({ duration: 0.3, gain: 0.1, filter: 'bandpass', frequency: 1800, q: 0.6, when: now + 0.08, panner });
  }

  playSkill(slot: number, position?: Vec3): void {
    const panner = this.panner(position, 5, 55);
    const now = this.ctx?.currentTime ?? 0;
    const base = slot === 1 ? 420 : slot === 2 ? 520 : 640;
    this.tone({ frequency: base, endFrequency: base * 1.9, duration: 0.16, gain: 0.09, type: 'triangle', panner });
    this.tone({ frequency: base * 1.5, endFrequency: base * 2.4, duration: 0.22, gain: 0.06, type: 'sine', when: now + 0.07, panner });
    this.noise({ duration: 0.16, gain: 0.04, filter: 'highpass', frequency: 1800, panner });
  }

  playDamageTick(): void {
    this.tone({ frequency: 160, endFrequency: 96, duration: 0.1, gain: 0.06, type: 'sawtooth' });
    this.noise({ duration: 0.08, gain: 0.04, filter: 'lowpass', frequency: 700 });
  }

  playWrench(position?: Vec3): void {
    if (!this.playRecipe('SFX_WRENCH_REPAIR', { position, volume: 0.85 })) {
      this.playUi('equip');
    }
  }

  playHeal(position?: Vec3): void {
    if (!this.playRecipe('SFX_SNACK_HEAL', { position, volume: 0.9, bus: 'voice' })) {
      this.playUi('confirm');
    }
  }

  playIceSlide(position?: Vec3): void {
    this.playRecipe('SFX_ICE_SLIDE', { position, volume: 0.6 });
  }

  playDeathScream(position?: Vec3, pitch = 1): void {
    this.playRecipe('VOICE_DEATH_SCREAM_CANYON', {
      position,
      pitch,
      volume: 0.9,
      bus: 'voice',
    });
  }

  playTaunt(faction: Faction, pitch = 1, position?: Vec3): void {
    const id =
      faction === 'lagoon' ? 'VOICE_LAGUNEN_LIGA_PIRATE' : 'VOICE_GIPFEL_GARDE_YODEL';
    if (!this.playRecipe(id, { position, pitch, volume: 0.9, bus: 'voice' })) {
      this.previewVoice(pitch, faction);
    }
  }

  playJump(position?: Vec3): void {
    const panner = this.panner(position, 3, 30);
    this.noise({ duration: 0.18, gain: 0.1, filter: 'bandpass', frequency: 620, endFrequency: 1700, q: 0.8, panner });
    this.tone({ frequency: 210, endFrequency: 420, duration: 0.14, gain: 0.045, type: 'sine', panner });
  }

  playLand(position?: Vec3): void {
    const panner = this.panner(position, 3, 32);
    this.tone({ frequency: 105, endFrequency: 58, duration: 0.16, gain: 0.14, type: 'sine', panner });
    this.noise({ duration: 0.11, gain: 0.09, filter: 'lowpass', frequency: 480, panner });
  }

  playRoll(position?: Vec3): void {
    const panner = this.panner(position, 3, 32);
    this.noise({ duration: 0.32, gain: 0.11, filter: 'bandpass', frequency: 460, endFrequency: 1500, q: 0.9, panner });
    this.noise({ duration: 0.22, gain: 0.05, filter: 'highpass', frequency: 1800, when: (this.ctx?.currentTime ?? 0) + 0.12, panner });
  }

  playParachuteOpen(position?: Vec3): void {
    const panner = this.panner(position, 4.5, 55);
    const now = this.ctx?.currentTime ?? 0;
    this.noise({
      duration: 0.55,
      gain: 0.16,
      filter: 'bandpass',
      frequency: 320,
      endFrequency: 2100,
      q: 0.7,
      panner,
    });
    this.tone({
      frequency: 170,
      endFrequency: 360,
      duration: 0.22,
      gain: 0.07,
      type: 'triangle',
      panner,
    });
    for (let flap = 0; flap < 3; flap += 1) {
      this.noise({
        duration: 0.16,
        gain: 0.08 - flap * 0.015,
        filter: 'lowpass',
        frequency: 900 - flap * 140,
        endFrequency: 380,
        when: now + 0.22 + flap * 0.18,
        panner,
      });
    }
  }

  playParachuteClose(position?: Vec3): void {
    const panner = this.panner(position, 3.5, 40);
    this.noise({ duration: 0.3, gain: 0.1, filter: 'bandpass', frequency: 1500, endFrequency: 420, q: 0.9, panner });
    this.tone({ frequency: 300, endFrequency: 120, duration: 0.2, gain: 0.05, type: 'triangle', panner });
  }

  playSplash(position?: Vec3, deep = false): void {
    const panner = this.panner(position, 3.5, 42);
    this.noise({ duration: deep ? 0.6 : 0.35, gain: deep ? 0.2 : 0.14, filter: 'lowpass', frequency: 950, endFrequency: 320, panner });
    this.tone({ frequency: 190, endFrequency: 72, duration: deep ? 0.32 : 0.2, gain: 0.09, type: 'sine', panner });
    if (deep) {
      this.noise({ duration: 0.4, gain: 0.06, filter: 'bandpass', frequency: 2100, q: 0.7, when: (this.ctx?.currentTime ?? 0) + 0.08, panner });
    }
  }

  playSwimStroke(position?: Vec3): void {
    const panner = this.panner(position, 2.6, 28);
    this.noise({ duration: 0.24, gain: 0.07, filter: 'lowpass', frequency: 620, endFrequency: 240, panner });
    this.noise({ duration: 0.12, gain: 0.03, filter: 'bandpass', frequency: 1600, q: 0.8, when: (this.ctx?.currentTime ?? 0) + 0.06, panner });
  }

  previewVoice(pitch: number, faction: Faction = 'alpine'): void {
    this.unlock();
    const id =
      faction === 'lagoon' ? 'VOICE_LAGUNEN_LIGA_PIRATE' : 'VOICE_GIPFEL_GARDE_YODEL';
    if (this.playRecipe(id, { pitch, volume: 0.9, bus: 'voice' })) return;
    const ctx = this.ctx;
    const bus = this.voiceGain;
    if (!ctx || !bus) return;
    scheduleGibberish(ctx, bus, pitch, ctx.currentTime + 0.03, this.noiseBuffer ?? undefined);
  }

  private createContext(): void {
    if (this.ctx) return;
    try {
      const ctx = new AudioContext({ latencyHint: 'interactive' });
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -6;
      limiter.knee.value = 0;
      limiter.ratio.value = 20;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.25;
      limiter.connect(ctx.destination);

      const master = ctx.createGain();
      master.gain.value = this.volumes.master;
      master.connect(limiter);

      this.sfxGain = this.createBus(ctx, master);
      this.vehicleGain = this.createBus(ctx, master);
      this.voiceGain = this.createBus(ctx, master);
      this.ambienceGain = this.createBus(ctx, master);
      this.musicGain = this.createBus(ctx, master);
      this.trackBus = this.createBus(ctx, this.musicGain);

      const convolver = ctx.createConvolver();
      convolver.buffer = createOutdoorImpulseResponse(ctx, 1.35, 3.5);
      const reverbGain = ctx.createGain();
      reverbGain.gain.value = 0.24;
      convolver.connect(reverbGain);
      reverbGain.connect(this.sfxGain);
      this.reverbSend = convolver;
      (this.sfxGain as SfxDestination).reverbSend = convolver;

      this.ctx = ctx;
      this.masterGain = master;
      this.limiter = limiter;
      this.noiseBuffer = this.createNoiseBuffer(ctx);
      this.applyVolumes();
    } catch (error) {
      console.warn('[frost-and-flamingos] Web Audio unavailable.', error);
      this.ctx = null;
    }
  }

  private createBus(ctx: AudioContext, destination: AudioNode): GainNode {
    const gain = ctx.createGain();
    gain.gain.value = 1;
    gain.connect(destination);
    return gain;
  }

  private createNoiseBuffer(ctx: AudioContext): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * 2);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < length; index += 1) {
      data[index] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  private applyVolumes(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    const set = (node: GainNode | null, value: number): void => {
      if (!node) return;
      node.gain.cancelScheduledValues(now);
      node.gain.setTargetAtTime(clamp01(value), now, 0.03);
    };
    set(this.masterGain, this.volumes.master);
    set(this.sfxGain, this.volumes.sfx);
    set(this.vehicleGain, this.volumes.sfx * 0.9);
    set(this.voiceGain, this.volumes.voice);
    set(this.ambienceGain, this.volumes.music * 0.8);
    set(this.musicGain, this.volumes.music * 0.7);
  }

  private bus(name: BusName): GainNode | null {
    switch (name) {
      case 'vehicle':
        return this.vehicleGain;
      case 'voice':
        return this.voiceGain;
      case 'ambience':
        return this.ambienceGain;
      case 'music':
        return this.musicGain;
      case 'sfx':
      default:
        return this.sfxGain;
    }
  }

  private panner(
    position?: Vec3,
    refDistance = 3,
    maxDistance = 45,
    bus: BusName = 'sfx',
  ): PannerNode | undefined {
    const ctx = this.ctx;
    if (!ctx || !position) return undefined;
    const panner = ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = refDistance;
    panner.maxDistance = maxDistance;
    panner.rolloffFactor = 1.35;
    panner.positionX.value = position.x;
    panner.positionY.value = position.y;
    panner.positionZ.value = position.z;
    const destination = this.bus(bus);
    if (destination) panner.connect(destination);
    return panner;
  }

  /**
   * Builds the destination for a library recipe: a volume stage, an optional
   * HRTF panner and the shared outdoor convolution send.
   */
  private recipeDestination(
    position: Vec3 | undefined,
    bus: BusName,
    volume: number,
  ): SfxDestination | null {
    const ctx = this.ctx;
    const destination = this.bus(bus);
    if (!ctx || !destination) return null;
    const input: GainNode & SfxDestination = ctx.createGain();
    input.gain.value = volume;
    if (position) {
      const panner = this.panner(position, 2.6, 48, bus);
      if (!panner) return null;
      input.connect(panner);
    } else {
      input.connect(destination);
    }
    if (this.reverbSend) {
      const send = ctx.createGain();
      send.gain.value = 0.3;
      input.connect(send);
      send.connect(this.reverbSend);
      input.reverbSend = send;
    }
    return input;
  }

  /** Plays a supplied procedural recipe. Returns false when it is unavailable. */
  private playRecipe(
    id: string,
    options: { position?: Vec3; pitch?: number; volume?: number; bus?: BusName } = {},
  ): boolean {
    const ctx = this.ctx;
    const recipe = SFX_RECIPES.get(id);
    if (!ctx || !recipe) return false;
    const destination = this.recipeDestination(
      options.position,
      options.bus ?? 'sfx',
      options.volume ?? 1,
    );
    if (!destination) return false;
    recipe.play(ctx, destination, ctx.currentTime + 0.008, options.pitch ?? 1);
    return true;
  }

  private tone(config: ToneConfig): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const when = config.when ?? ctx.currentTime;
    const destination = config.panner ?? this.bus(config.bus ?? 'sfx');
    if (!destination) return;
    const oscillator = ctx.createOscillator();
    oscillator.type = config.type ?? 'sine';
    oscillator.frequency.setValueAtTime(Math.max(20, config.frequency), when);
    if (config.endFrequency !== undefined) {
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, config.endFrequency), when + config.duration);
    }
    const gain = ctx.createGain();
    const attack = Math.min(config.duration * 0.8, Math.max(0.002, config.attack ?? 0.006));
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, config.gain), when + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + config.duration);
    oscillator.connect(gain);
    gain.connect(destination);
    oscillator.start(when);
    oscillator.stop(when + config.duration + 0.03);
  }

  private noise(config: NoiseConfig): void {
    const ctx = this.ctx;
    if (!ctx || !this.noiseBuffer) return;
    const when = config.when ?? ctx.currentTime;
    const destination = config.panner ?? this.bus(config.bus ?? 'sfx');
    if (!destination) return;
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = config.filter ?? 'lowpass';
    filter.frequency.setValueAtTime(Math.max(20, config.frequency ?? 1000), when);
    if (config.endFrequency !== undefined) {
      filter.frequency.exponentialRampToValueAtTime(Math.max(20, config.endFrequency), when + config.duration);
    }
    filter.Q.value = config.q ?? 0.8;
    const gain = ctx.createGain();
    const attack = Math.min(config.duration * 0.7, Math.max(0.002, config.attack ?? 0.004));
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, config.gain), when + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + config.duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(destination);
    source.start(when, Math.random() * 1.6);
    source.stop(when + config.duration + 0.04);
  }

  private preloadMusicTracks(): void {
    for (const track of MUSIC_TRACKS) void this.loadTrack(track);
  }

  private desiredTrack(): MusicTrackDefinition {
    if (this.scene === 'menu') return MENU_MUSIC_TRACK;
    if (this.scene === 'loading' || this.roundCue !== null) return ROUND_MUSIC_TRACK;
    return GAMEPLAY_MUSIC_TRACKS[this.gameplayTier];
  }

  private updateGameplayTier(): void {
    const current = this.gameplayTier;
    const next = nextGameplayTier(current, this.musicIntensity);
    if (next === current) return;
    const ctx = this.ctx;
    if (ctx && ctx.currentTime - this.lastTrackSwitchAt < TRACK_SWITCH_COOLDOWN) return;
    this.gameplayTier = next;
    if (this.scene === 'gameplay' && this.unlocked) this.syncActiveTrack(TRACK_SWITCH_FADE);
  }

  private syncActiveTrack(fade: number): void {
    if (!this.unlocked || !this.ctx) return;
    const desired = this.desiredTrack();
    if (this.activeTrackId === desired.id) return;
    const buffer = this.trackBuffers.get(desired.id);
    if (!buffer) {
      const active = this.activeTrackId === null
        ? null
        : MUSIC_TRACKS.find((entry) => entry.id === this.activeTrackId) ?? null;
      if (active !== null && active.role !== desired.role) {
        this.fadeOutAllTracks(Math.min(TRACK_FADE_OUT, fade));
      }
      void this.loadTrack(desired);
      return;
    }
    this.crossfadeTo(desired, buffer, fade);
  }

  private async loadTrack(track: MusicTrackDefinition): Promise<void> {
    if (
      this.trackBuffers.has(track.id) ||
      this.trackLoading.has(track.id) ||
      this.trackFailures.has(track.id)
    ) {
      return;
    }
    const ctx = this.ctx;
    if (!ctx) return;
    this.trackLoading.add(track.id);
    try {
      const response = await fetch(track.url);
      if (!response.ok) {
        throw new Error(`Music track request failed with ${response.status}.`);
      }
      const encoded = await response.arrayBuffer();
      this.trackBuffers.set(track.id, await ctx.decodeAudioData(encoded));
      if (this.unlocked) this.syncActiveTrack(TRACK_FADE_IN);
    } catch (error) {
      this.trackFailures.add(track.id);
      console.warn(
        `[frost-and-flamingos] Music track "${track.title}" unavailable; the procedural score remains active.`,
        error,
      );
    } finally {
      this.trackLoading.delete(track.id);
    }
  }

  private crossfadeTo(track: MusicTrackDefinition, buffer: AudioBuffer, fade: number): void {
    const ctx = this.ctx;
    const bus = this.trackBus;
    if (!ctx || !bus) return;
    const now = ctx.currentTime;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(TRACK_LEVEL, now + Math.max(0.2, fade));
    source.connect(gain);
    gain.connect(bus);
    const voice: TrackVoice = { id: track.id, source, gain };
    this.trackVoices.add(voice);
    source.onended = () => {
      this.trackVoices.delete(voice);
      try {
        gain.disconnect();
      } catch {
        // The graph may already be torn down; nothing else to do.
      }
    };
    for (const other of [...this.trackVoices]) {
      if (other !== voice) this.fadeOutVoice(other, fade);
    }
    source.start(now + 0.02);
    this.activeTrackId = track.id;
    this.lastTrackSwitchAt = now;
  }

  private fadeOutVoice(voice: TrackVoice, fade: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    const duration = Math.max(0.05, fade);
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setValueAtTime(Math.max(0.0001, voice.gain.gain.value), now);
    voice.gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    try {
      voice.source.stop(now + duration + 0.1);
    } catch {
      // The source may already have ended; the gain fade still cleans up.
    }
  }

  private fadeOutAllTracks(fade: number): void {
    this.activeTrackId = null;
    for (const voice of [...this.trackVoices]) this.fadeOutVoice(voice, fade);
  }

  private restartMusic(): void {
    if (this.musicTimer) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
    const ctx = this.ctx;
    if (!ctx || !this.unlocked) return;
    this.musicStep = 0;
    this.nextMusicTime = ctx.currentTime + 0.12;
    this.musicTimer = setInterval(() => this.scheduleMusic(), 90);
    this.scheduleMusic();
  }

  private scheduleMusic(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const horizon = ctx.currentTime + 0.45;
    if (this.nextMusicTime < ctx.currentTime - 0.2) this.nextMusicTime = ctx.currentTime + 0.05;
    while (this.nextMusicTime < horizon) {
      if (this.scene !== 'gameplay') {
        if (this.activeTrackId === null) this.scheduleMenuStep(this.musicStep, this.nextMusicTime);
        this.nextMusicTime += MENU_BEAT;
      } else {
        if (this.activeTrackId === null) {
          this.scheduleGameplayStep(this.musicStep, this.nextMusicTime);
        }
        this.nextMusicTime += GAMEPLAY_STEP;
      }
      this.musicStep += 1;
    }
  }

  private scheduleMenuStep(step: number, when: number): void {
    const beat = step % 3;
    const bar = Math.floor(step / 3) % MENU_CHORDS.length;
    const root = MENU_CHORDS[bar] ?? 57;
    if (beat === 0) {
      this.tone({ frequency: midiToFrequency(root - 12), duration: MENU_BEAT * 1.7, gain: 0.055, type: 'triangle', bus: 'music', when });
      const chord = [root, root + 4, root + 7];
      for (const note of chord) {
        this.tone({ frequency: midiToFrequency(note), duration: MENU_BEAT * 2.2, gain: 0.014, type: 'sine', bus: 'music', when: when + 0.01 });
      }
    } else {
      this.noise({ duration: 0.06, gain: 0.018, filter: 'highpass', frequency: 4200, bus: 'music', when });
    }
    const melodyIndex = (step * 3 + bar) % MENU_SCALE.length;
    const melody = MENU_SCALE[melodyIndex] ?? 72;
    this.tone({
      frequency: midiToFrequency(melody),
      duration: MENU_BEAT * 0.62,
      gain: beat === 0 ? 0.03 : 0.02,
      type: 'triangle',
      bus: 'music',
      when: when + 0.01,
    });
    if (step % 6 === 3) {
      this.tone({
        frequency: midiToFrequency(melody + 12),
        duration: MENU_BEAT * 0.4,
        gain: 0.012,
        type: 'sine',
        bus: 'music',
        when: when + MENU_BEAT * 0.5,
      });
    }
  }

  private scheduleGameplayStep(step: number, when: number): void {
    const sixteenth = step % 16;
    const bar = Math.floor(step / 16) % 4;
    const root = GAMEPLAY_SCALE[bar] ?? 45;
    if (sixteenth === 0 || sixteenth === 8 || sixteenth === 6) {
      this.tone({ frequency: 120, endFrequency: 48, duration: 0.12, gain: 0.09, type: 'sine', bus: 'music', when });
    }
    if (sixteenth === 4 || sixteenth === 12) {
      this.noise({ duration: 0.09, gain: 0.045, filter: 'bandpass', frequency: 2200, q: 0.8, bus: 'music', when });
    }
    if (sixteenth % 2 === 0) {
      this.noise({ duration: 0.025, gain: 0.016, filter: 'highpass', frequency: 7000, bus: 'music', when });
    }
    if (sixteenth % 2 === 0) {
      const bassNote = root + (sixteenth % 8 === 0 ? 0 : 7);
      this.tone({
        frequency: midiToFrequency(bassNote),
        duration: GAMEPLAY_STEP * 1.7,
        gain: 0.045,
        type: 'sawtooth',
        bus: 'music',
        when,
      });
    }
    const arpIndex = (step * 5 + bar * 2) % GAMEPLAY_SCALE.length;
    const arp = GAMEPLAY_SCALE[arpIndex] ?? 57;
    this.tone({
      frequency: midiToFrequency(arp + 12),
      duration: GAMEPLAY_STEP * 0.72,
      gain: 0.012 + this.musicIntensity * 0.018,
      type: 'square',
      bus: 'music',
      when: when + 0.005,
    });
    if (sixteenth === 0) {
      this.tone({
        frequency: midiToFrequency(root + 12),
        duration: GAMEPLAY_STEP * 10,
        gain: 0.012,
        type: 'sine',
        bus: 'music',
        when,
      });
    }
  }

  private startAmbience(kind: AmbienceKind): void {
    if (this.ambienceKind === kind) return;
    this.stopAmbience();
    const ctx = this.ctx;
    const bus = this.ambienceGain;
    if (!ctx || !bus || !this.noiseBuffer || !this.unlocked) return;

    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 0.6;
    const level = ctx.createGain();
    level.gain.value = 0.0001;

    const config: Record<AmbienceKind, { frequency: number; lfo: number; depth: number; gain: number }> = {
      menu: { frequency: 760, lfo: 0.06, depth: 210, gain: 0.035 },
      alpine: { frequency: 1050, lfo: 0.08, depth: 320, gain: 0.055 },
      lagoon: { frequency: 620, lfo: 0.16, depth: 280, gain: 0.075 },
      village: { frequency: 820, lfo: 0.05, depth: 180, gain: 0.042 },
      water: { frequency: 520, lfo: 0.2, depth: 260, gain: 0.09 },
    };
    const settings = config[kind];
    filter.frequency.value = settings.frequency;
    level.gain.setTargetAtTime(settings.gain, ctx.currentTime, 0.6);

    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = settings.lfo;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = settings.depth;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);

    source.connect(filter);
    filter.connect(level);
    level.connect(bus);
    source.start();
    lfo.start();
    level.gain.setTargetAtTime(settings.gain, ctx.currentTime + 0.05, 0.7);

    this.ambienceSource = source;
    this.ambienceFilter = filter;
    this.ambienceLevel = level;
    this.ambienceLfo = lfo;
    this.ambienceLfoGain = lfoGain;
    this.ambienceKind = kind;

    if (kind === 'lagoon' || kind === 'menu' || kind === 'water') {
      this.ambienceTimer = setInterval(() => {
        if (Math.random() < 0.55) this.playGull();
      }, 9000);
    } else if (kind === 'village') {
      this.ambienceTimer = setInterval(() => this.playBell(), 17000);
    } else if (kind === 'alpine') {
      this.ambienceTimer = setInterval(() => this.playBell(true), 23000);
    }
  }

  private stopAmbience(): void {
    if (this.ambienceTimer) {
      clearInterval(this.ambienceTimer);
      this.ambienceTimer = null;
    }
    const ctx = this.ctx;
    const source = this.ambienceSource;
    const level = this.ambienceLevel;
    const lfo = this.ambienceLfo;
    if (ctx && level) {
      const now = ctx.currentTime;
      level.gain.cancelScheduledValues(now);
      level.gain.setTargetAtTime(0.0001, now, 0.12);
    }
    if (ctx && source) {
      try {
        source.stop(ctx.currentTime + 0.55);
      } catch {
        // Already stopped.
      }
    }
    if (ctx && lfo) {
      try {
        lfo.stop(ctx.currentTime + 0.55);
      } catch {
        // Already stopped.
      }
    }
    this.ambienceSource = null;
    this.ambienceFilter = null;
    this.ambienceLevel = null;
    this.ambienceLfo = null;
    this.ambienceLfoGain = null;
    this.ambienceKind = null;
  }

  private playGull(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const panner = this.panner(
      { x: (Math.random() - 0.5) * 40, y: 8 + Math.random() * 10, z: (Math.random() - 0.5) * 40 },
      10,
      80,
    );
    this.tone({ frequency: 1300, endFrequency: 880, duration: 0.16, gain: 0.022, type: 'sine', panner });
    this.tone({ frequency: 1450, endFrequency: 980, duration: 0.13, gain: 0.018, type: 'sine', when: ctx.currentTime + 0.2, panner });
  }

  private playBell(distant = false): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const gain = distant ? 0.012 : 0.02;
    this.tone({ frequency: 660, duration: 0.9, gain, type: 'sine', bus: 'ambience' });
    this.tone({ frequency: 990, duration: 0.7, gain: gain * 0.7, type: 'sine', bus: 'ambience' });
    this.tone({ frequency: 1320, duration: 0.5, gain: gain * 0.4, type: 'sine', bus: 'ambience' });
  }
}

export const audio = new AudioEngine();
