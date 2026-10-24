import { writable } from 'svelte/store';
import type {
  ClassId,
  Faction,
  TranslationKey,
  TranslationParams,
  Vec3,
} from '@frost-and-flamingos/shared';

export type GamePhase = 'booting' | 'menu' | 'playing' | 'paused' | 'error';
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
  id: number;
  faction: Faction;
  classId: ClassId;
  hp: number;
  maxHp: number;
  position: Vec3;
  velocity: Vec3;
  grounded: boolean;
  zoneKey: TranslationKey;
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
});
export const localPlayer = writable<LocalPlayerView | null>(null);
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
});
export const appError = writable<AppError | null>(null);
export const debugVisible = writable(false);
export const controlsOpen = writable(false);
export const toast = writable<ToastMessage | null>(null);

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
