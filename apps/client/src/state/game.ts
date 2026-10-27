import { writable } from 'svelte/store';
import type {
  ClassId,
  CritterSpecies,
  Faction,
  ParachuteState,
  TranslationKey,
  TranslationParams,
  Vec3,
  WeaponId,
  WeaponSlot,
} from '@frost-and-flamingos/shared';

export type GamePhase = 'booting' | 'menu' | 'deploying' | 'playing' | 'paused' | 'error';
export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'offline';
export type RendererName = 'webgpu' | 'webgl2' | 'pending';
export type LoadingStepStatus = 'pending' | 'active' | 'done' | 'failed';

export interface LoadingState {
  progress: number;
  engine: LoadingStepStatus;
  world: LoadingStepStatus;
  network: LoadingStepStatus;
  renderer: RendererName;
}

export interface LocalPlayerView {
  yaw: number;
  id: number;
  faction: Faction;
  classId: ClassId;
  hp: number;
  maxHp: number;
  position: Vec3;
  velocity: Vec3;
  grounded: boolean;
  crouched: boolean;
  swimming: boolean;
  sprinting: boolean;
  rolling: boolean;
  parachuteState: ParachuteState;
  weaponSlot: WeaponSlot;
  weaponId: WeaponId;
  weaponIds: [WeaponId, WeaponId, WeaponId];
  ammo: number;
  reserve: number;
  reloading: boolean;
  shield: number;
  kills: number;
  deaths: number;
  skillCooldowns: [number, number, number];
  cloaked: boolean;
  alive: boolean;
  zoneKey: TranslationKey;
  /** Support points earned with the drifter supply aura. */
  support: number;
  /** A friendly drifter's aura is healing / refilling the local player. */
  auraHealed: boolean;
  auraResupplied: boolean;
  /** Drifter only: teammates her aura supplies right now. */
  auraTargets: number;
}

export interface ConnectionState {
  status: ConnectionStatus;
  attempt: number;
  pingMs: number;
  serverTick: number;
  playersOnline: number;
  maxPlayers: number;
  snapshots: number;
  ticketsAlpine: number;
  ticketsLagoon: number;
  weatherBalance: number;
  towerStates: number;
  /** Capture progress per tower A, B, C in 0..1. The HUD shows a ring only while 0 < value < 1. */
  towerProgress: [number, number, number];
}

export interface HudState {
  fps: number;
  frameMs: number;
  drawCalls: number;
  activeMeshes: number;
  resolution: string;
  pendingInputs: number;
  predictionError: number;
  engine: RendererName;
  lastSnapshotTick: number;
  inputSequence: number;
  localPosition: Vec3;
  localVelocity: Vec3;
  grounded: boolean;
  musicTrack: string;
  musicBpm: number;
}

export interface AppError {
  titleKey: TranslationKey;
  bodyKey: TranslationKey;
}

export interface ToastMessage {
  id: number;
  key: TranslationKey;
  params?: TranslationParams;
}

export const phase = writable<GamePhase>('booting');
export const loading = writable<LoadingState>({
  progress: 0.04,
  engine: 'pending',
  world: 'pending',
  network: 'pending',
  renderer: 'pending',
});
export const connection = writable<ConnectionState>({
  status: 'connecting',
  attempt: 0,
  pingMs: 0,
  serverTick: 0,
  playersOnline: 0,
  maxPlayers: 16,
  snapshots: 0,
  ticketsAlpine: 50,
  ticketsLagoon: 50,
  weatherBalance: 0,
  towerStates: 0,
  towerProgress: [0, 0, 0],
});
export const localPlayer = writable<LocalPlayerView | null>(null);

/** One line of the live scoreboard (hold Tab). */
export interface ScoreboardRow {
  id: number;
  name: string;
  faction: Faction;
  classId: ClassId;
  kills: number;
  deaths: number;
  /** Support points (drifter supply aura). */
  support: number;
  alive: boolean;
  local: boolean;
}

export const scoreboardOpen = writable(false);
export const scoreboard = writable<ScoreboardRow[]>([]);
export const hud = writable<HudState>({
  fps: 0,
  frameMs: 0,
  drawCalls: 0,
  activeMeshes: 0,
  resolution: '—',
  pendingInputs: 0,
  predictionError: 0,
  engine: 'pending',
  lastSnapshotTick: 0,
  inputSequence: 0,
  localPosition: { x: 0, y: 0, z: 0 },
  localVelocity: { x: 0, y: 0, z: 0 },
  grounded: false,
  musicTrack: '',
  musicBpm: 0,
});
export const appError = writable<AppError | null>(null);
export const debugVisible = writable(false);
export const controlsOpen = writable(false);
export const wardrobeOpen = writable(false);
export const wardrobeSpin = writable(true);
export type WardrobeEffect = 'none' | 'damaged' | 'charred' | 'frozen';
export const wardrobeEffect = writable<WardrobeEffect>('none');
export const toast = writable<ToastMessage | null>(null);

export interface KillFeedEntry {
  id: number;
  killerId: number;
  killerName: string;
  victimId: number;
  victimName: string;
  weaponId: WeaponId | null;
  headshot: boolean;
  at: number;
  /** Optional teams of the two parties; the HUD infers them from the local player when absent. */
  killerFaction?: Faction;
  victimFaction?: Faction;
  /** Set for a bagged ambient critter: the ribbon reads "{name} bagged a hen" (no victim side). */
  critter?: CritterSpecies;
}

export interface HitMarkerState {
  id: number;
  headshot: boolean;
  kill: boolean;
  at: number;
}

export type DeathStage = 'killcam' | 'respawn';

export interface DeathState {
  killerId: number;
  killerName: string;
  killerClassId: ClassId | null;
  killerHp: number;
  killerMaxHp: number;
  weaponId: WeaponId | null;
  headshot: boolean;
  stage: DeathStage;
  respawnSeconds: number;
  at: number;
  /** Optional team of the killer; the HUD assumes the opposite team when absent. */
  killerFaction?: Faction;
}

export interface ComicPopState {
  id: number;
  textKey: TranslationKey;
  at: number;
  /** Horizontal layout seed in -1..1 so overlapping pops fan out. */
  offset: number;
  /** Slight comic tilt in degrees. */
  tilt: number;
}

export interface InteractionPromptState {
  key: TranslationKey;
  params?: TranslationParams;
  /** Key cap label (i18n); defaults to the Interact key. */
  keyLabel?: TranslationKey;
  /** Optional painted tile id from the HUD's `TILE_FILES` map, e.g. `wrench` for repairs. */
  icon?: string;
}

export const killFeed = writable<KillFeedEntry[]>([]);
export const hitMarker = writable<HitMarkerState | null>(null);
export const damageFlash = writable(0);
export const deathState = writable<DeathState | null>(null);
export const comicPop = writable<ComicPopState | null>(null);
/** Up to three simultaneous comic popups, newest last. `comicPop` always mirrors the newest. */
export const comicPops = writable<ComicPopState[]>([]);
export const interactionPrompt = writable<InteractionPromptState | null>(null);

let killFeedId = 0;
let hitMarkerId = 0;
let comicPopId = 0;
/** Horizontal lanes so back-to-back popups fan out instead of stacking. */
const COMIC_POP_LANES = [-1.05, 1.05, 0] as const;

export function pushKillFeed(entry: Omit<KillFeedEntry, 'id'>): void {
  killFeedId += 1;
  killFeed.update((entries) => [...entries.slice(-5), { ...entry, id: killFeedId }]);
}

export function pruneKillFeed(now: number): void {
  killFeed.update((entries) => entries.filter((entry) => now - entry.at < 7000));
}

export function showHitMarker(headshot: boolean, kill: boolean): void {
  hitMarkerId += 1;
  hitMarker.set({ id: hitMarkerId, headshot, kill, at: performance.now() });
}

export function clearCombatUi(): void {
  killFeed.set([]);
  hitMarker.set(null);
  damageFlash.set(0);
  deathState.set(null);
  comicPop.set(null);
  comicPops.set([]);
  interactionPrompt.set(null);
}

/** Expire short-lived combat feedback without timers leaking across rounds. */
export function expireCombatUi(now: number): void {
  pruneKillFeed(now);
  hitMarker.update((marker) => (marker && now - marker.at < 420 ? marker : null));
  comicPop.update((pop) => (pop && now - pop.at < 1900 ? pop : null));
  comicPops.update((pops) => {
    const live = pops.filter((pop) => now - pop.at < 1900);
    return live.length === pops.length ? pops : live;
  });
}

/** Keep the killer-cam countdown in sync with the authoritative respawn. */
export function updateDeathCountdown(now: number, totalSeconds: number): void {
  deathState.update((state) => {
    if (!state) return state;
    const remaining = Math.max(0, totalSeconds - (now - state.at) / 1000);
    if (Math.abs(state.respawnSeconds - remaining) < 0.05) return state;
    return { ...state, respawnSeconds: remaining };
  });
}

export function setInteractionPrompt(prompt: InteractionPromptState | null): void {
  interactionPrompt.set(prompt);
}

/** Ids of the comic words in the dictionary (`comic.<id>.text` / `comic.<id>.sprite`). */
export type ComicWord =
  | 'boing'
  | 'pling'
  | 'boom'
  | 'bang'
  | 'tock_tock'
  | 'honk_honk'
  | 'aaaargh'
  | 'mooo'
  | 'splash'
  | 'ponk'
  | 'plosh'
  | 'bouch'
  | 'bok';

const lastPopAt = new Map<string, number>();
const POP_DEDUPE_MS = 700;

/**
 * Show a comic onomatopoeia popup by word id. Intended mapping for gameplay events:
 * hit/headshot PLING, launch/knockback BOING, explosion BOOM, gunshot kill BANG, repair
 * TOCK TOCK, horn HONK, fall into the gorge AAAARGH, cow ram MOOO, water entry SPLASH,
 * coconut bonk PONK, mud/puddle PLOSH, melee hit BOUCH.
 */
export function showComicWord(word: ComicWord): void {
  showComicPop(`comic.${word}.text` as TranslationKey);
}

export function showComicPop(textKey: TranslationKey): void {
  const nowMs = performance.now();
  const last = lastPopAt.get(textKey);
  // The same word twice within a moment is one popup (several systems may report one event).
  if (last !== undefined && nowMs - last < POP_DEDUPE_MS) return;
  lastPopAt.set(textKey, nowMs);
  comicPopId += 1;
  const pop: ComicPopState = {
    id: comicPopId,
    textKey,
    at: performance.now(),
    offset: (COMIC_POP_LANES[comicPopId % COMIC_POP_LANES.length] ?? 0) + (Math.random() - 0.5) * 0.2,
    tilt: (Math.random() - 0.5) * 16,
  };
  comicPop.set(pop);
  comicPops.update((pops) => [...pops.slice(-2), pop]);
}

let toastId = 0;
let toastTimer: ReturnType<typeof setTimeout> | null = null;

export function notify(key: TranslationKey, params?: TranslationParams, durationMs = 3200): void {
  toastId += 1;
  toast.set({ id: toastId, key, params });
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.set(null);
    toastTimer = null;
  }, durationMs);
}

export function dismissToast(): void {
  if (toastTimer) {
    clearTimeout(toastTimer);
    toastTimer = null;
  }
  toast.set(null);
}

export function setLoadingProgress(progress: number): void {
  loading.update((state) => ({ ...state, progress: Math.min(1, Math.max(0, progress)) }));
}

export function setLoadingStep(step: 'engine' | 'world' | 'network', status: LoadingStepStatus): void {
  loading.update((state) => ({ ...state, [step]: status }));
}

export function setRenderer(renderer: RendererName): void {
  loading.update((state) => ({ ...state, renderer }));
  hud.update((state) => ({ ...state, engine: renderer }));
}

export function setPhase(next: GamePhase): void {
  phase.set(next);
}

export function showMenu(): void {
  phase.set('menu');
}

export function enterGame(): void {
  phase.set('playing');
}

export function pauseGame(): void {
  phase.update((current) => (current === 'playing' ? 'paused' : current));
}

export function resumeGame(): void {
  phase.update((current) => (current === 'paused' ? 'playing' : current));
}

export function showError(titleKey: TranslationKey, bodyKey: TranslationKey): void {
  appError.set({ titleKey, bodyKey });
  phase.set('error');
}

export function clearError(): void {
  appError.set(null);
}

export function updateHud(partial: Partial<HudState>): void {
  hud.update((state) => ({ ...state, ...partial }));
}

export function updateConnection(partial: Partial<ConnectionState>): void {
  connection.update((state) => ({ ...state, ...partial }));
}
