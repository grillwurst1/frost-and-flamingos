import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine';
import { Engine } from '@babylonjs/core/Engines/engine';
import { WebGPUEngine } from '@babylonjs/core/Engines/webgpuEngine';
import { Color3, Color4, Vector3 } from '@babylonjs/core/Maths/math';
import { Scene } from '@babylonjs/core/scene';
import {
  CLASS_STATS,
  FIXED_DT,
  MAX_PREDICTION_REPLAY,
  PhysicsWorld,
  zoneAt,
  type CharacterBody,
  type ClassId,
  type Faction,
  type PlayerInput,
  type PlayerState,
  type TranslationKey,
  type Vec3,
  type WelcomeMessage,
  type WorldSnapshot,
} from '@frost-and-flamingos/shared';
import { NetworkClient } from '../net/connection';
import { buildFjordFiesta, type MapVisuals } from '../rendering/map';
import { CharacterView } from '../rendering/character';
import {
  createShadowMaterial,
  createToonMaterial,
  updateSkyMaterial,
  updateToonMaterial,
  updateWaterMaterial,
} from '../rendering/materials';
import {
  debugVisible,
  localPlayer,
  notify,
  phase,
  setLoadingProgress,
  setLoadingStep,
  setPhase,
  setRenderer,
  showError,
  updateConnection,
  updateHud,
  type GamePhase,
  type RendererName,
} from '../state/game';
import { CameraRig } from './camera-rig';
import { InputController } from './input';

const INTERPOLATION_DELAY_MS = 110;
const SNAPSHOT_HISTORY = 40;
const RECONCILE_THRESHOLD = 0.12;
const HARD_SNAP_THRESHOLD = 2.4;
const HUD_INTERVAL_MS = 220;
const REMOTE_TIMEOUT_MS = 1600;
const BOOT_TIMEOUT_MS = 20000;

interface PendingInput {
  input: PlayerInput;
  previousButtons: number;
  position: Vec3;
  velocity: Vec3;
  grounded: boolean;
}

interface SnapshotEntry {
  snapshot: WorldSnapshot;
  receivedAt: number;
}

interface RemoteView {
  view: CharacterView;
  lastSeenAt: number;
}

function toVector3(value: Vec3): Vector3 {
  return new Vector3(value.x, value.y, value.z);
}

function sequenceAfter(a: number, b: number): boolean {
  const difference = (a - b) & 0xffff;
  return difference !== 0 && difference < 0x8000;
}

function shortestAngle(from: number, to: number): number {
  let difference = (to - from) % (Math.PI * 2);
  if (difference > Math.PI) difference -= Math.PI * 2;
  if (difference < -Math.PI) difference += Math.PI * 2;
  return difference;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

async function createEngine(canvas: HTMLCanvasElement): Promise<{
  engine: AbstractEngine;
  renderer: RendererName;
}> {
  const params = new URLSearchParams(window.location.search);
  const forceWebGL = params.get('renderer') === 'webgl2';

  if (!forceWebGL && typeof navigator !== 'undefined' && navigator.gpu) {
    let webgpu: WebGPUEngine | null = null;
    try {
      const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
      if (!adapter) throw new Error('No WebGPU adapter available.');
      webgpu = new WebGPUEngine(canvas, {
        antialias: true,
        adaptToDeviceRatio: true,
        powerPreference: 'high-performance',
        stencil: true,
      });
      await webgpu.initAsync();
      return { engine: webgpu, renderer: 'webgpu' };
    } catch (error) {
      console.warn('[frost-and-flamingos] WebGPU unavailable, using WebGL2.', error);
      // A WebGPUEngine that failed during initAsync may not have created its
      // device yet. Babylon's dispose assumes it exists, so never let cleanup
      // prevent the WebGL2 fallback from starting.
      try {
        webgpu?.dispose();
      } catch (disposeError) {
        console.warn('[frost-and-flamingos] WebGPU cleanup failed.', disposeError);
      }
    }
  }

  const engine = new Engine(
    canvas,
    true,
    {
      antialias: true,
      stencil: true,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
    },
    true,
  );
  return { engine, renderer: 'webgl2' };
}

/**
 * Owns the Babylon renderer, the local prediction world, the authoritative
 * network link and the camera/input loop. UI components only read stores and
 * call the explicit intent methods below.
 */
export class GameClient {
  private readonly canvas: HTMLCanvasElement;
  private engine: AbstractEngine | null = null;
  private scene: Scene | null = null;
  private physics: PhysicsWorld | null = null;
  private cameraRig: CameraRig | null = null;
  private input: InputController | null = null;
  private network: NetworkClient | null = null;
  private visuals: MapVisuals | null = null;
  private toonMaterial: ReturnType<typeof createToonMaterial> | null = null;

  private localId: number | null = null;
  private localFaction: Faction = 'alpine';
  private localClass: ClassId = 'allrounder';
  private localCharacter: CharacterBody | null = null;
  private localView: CharacterView | null = null;
  private localViewFaction: Faction | null = null;
  private localViewClass: ClassId | null = null;
  private latestLocalState: PlayerState | null = null;
  private pendingInputs: PendingInput[] = [];
  private sequence = 1;
  private predictionError = 0;

  private snapshotHistory: SnapshotEntry[] = [];
  private remoteViews = new Map<number, RemoteView>();

  private currentPhase: GamePhase = 'booting';
  private accumulator = 0;
  private lastFrameAt = performance.now();
  private smoothedFrameMs = 16.7;
  private lastHudAt = 0;
  private lastSnapshotTick = 0;
  private snapshotCount = 0;
  private booted = false;
  private disposed = false;
  private bootTimeout: ReturnType<typeof setTimeout> | null = null;
  private menuDelay: ReturnType<typeof setTimeout> | null = null;
  private readonly unsubscribePhase: () => void;
  private readonly handleResize = (): void => {
    this.engine?.resize();
  };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.unsubscribePhase = phase.subscribe((next) => {
      const wasPlaying = this.currentPhase === 'playing';
      this.currentPhase = next;
      if (next !== 'playing' && this.input?.isLocked) {
        this.input.releasePointerLock();
      }
      if (next === 'playing' && !wasPlaying) {
        this.accumulator = 0;
        this.lastFrameAt = performance.now();
        if (this.localCharacter) {
          this.cameraRig?.snapToPlayer(toVector3(this.localCharacter.position));
        }
      }
    });
  }

  async init(): Promise<void> {
    try {
      setLoadingStep('engine', 'active');
      setLoadingProgress(0.08);
      const { engine, renderer } = await createEngine(this.canvas);
      if (this.disposed) {
        engine.dispose();
        return;
      }
      this.engine = engine;
      setRenderer(renderer);
      setLoadingProgress(0.2);

      const scene = new Scene(engine);
      scene.clearColor = new Color4(0.58, 0.78, 0.84, 1);
      scene.ambientColor = new Color3(0.34, 0.44, 0.5);
      scene.skipPointerMovePicking = true;
      scene.collisionsEnabled = false;
      this.scene = scene;

      this.cameraRig = new CameraRig(scene);
      this.input = new InputController(this.canvas, {
        onMouseMove: (deltaX, deltaY) => this.cameraRig?.handleMouse(deltaX, deltaY),
        onWheel: (delta) => this.cameraRig?.zoom(delta),
        onSwapShoulder: () => this.cameraRig?.swapShoulder(),
        onToggleDebug: () => debugVisible.update((visible) => !visible),
        onPointerLockChange: (locked) => this.handlePointerLockChange(locked),
        onPointerLockError: () => notify('notifications.pointerLock'),
        onEscape: () => {
          if (this.currentPhase === 'playing') this.pause();
        },
      });
      window.addEventListener('resize', this.handleResize);

      this.engine.runRenderLoop(() => this.frame());
      setLoadingStep('engine', 'done');
      setLoadingProgress(0.34);
      if (renderer === 'webgl2' && typeof navigator !== 'undefined' && navigator.gpu) {
        notify('notifications.webglFallback');
      }

      setLoadingStep('world', 'active');
      const physics = await PhysicsWorld.create();
      if (this.disposed) {
        physics.dispose();
        return;
      }
      this.physics = physics;
      this.toonMaterial = createToonMaterial(scene, 'fjord-toon-material');
      this.visuals = buildFjordFiesta(scene, this.toonMaterial);
      setLoadingProgress(0.7);
      setLoadingStep('world', 'done');
      if (this.disposed) return;

      setLoadingStep('network', 'active');
      setLoadingProgress(0.82);
      this.bootTimeout = setTimeout(() => {
        if (!this.booted && !this.disposed) {
          setLoadingStep('network', 'failed');
          showError('errors.networkTitle', 'errors.networkBody');
        }
      }, BOOT_TIMEOUT_MS);

      this.network = new NetworkClient({
        onWelcome: (welcome) => this.handleWelcome(welcome),
        onSnapshot: (snapshot) => this.handleSnapshot(snapshot),
        onMapState: () => {
          // M1 has no destructibles, bridges or craters yet. The packet is
          // decoded and acknowledged so later milestones can extend it.
        },
        onProtocolMismatch: () => showError('errors.networkTitle', 'errors.protocol'),
      });
      this.network.connect();
    } catch (error) {
      console.error('[frost-and-flamingos] boot failed', error);
      setLoadingStep('engine', 'failed');
      setLoadingStep('world', 'failed');
      setLoadingStep('network', 'failed');
      showError('errors.engineTitle', 'errors.engineBody');
    }
  }

  startPlaying(): void {
    if (this.currentPhase !== 'menu' && this.currentPhase !== 'paused') return;
    if (!this.network?.ready || !this.localCharacter) return;
    this.accumulator = 0;
    this.lastFrameAt = performance.now();
    this.cameraRig?.snapToPlayer(toVector3(this.localCharacter.position));
    setPhase('playing');
    this.input?.requestPointerLock();
  }

  pause(): void {
    if (this.currentPhase !== 'playing') return;
    setPhase('paused');
    this.input?.releasePointerLock();
  }

  returnToMenu(): void {
    setPhase('menu');
    this.input?.releasePointerLock();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.bootTimeout) clearTimeout(this.bootTimeout);
    if (this.menuDelay) clearTimeout(this.menuDelay);
    this.unsubscribePhase();
    window.removeEventListener('resize', this.handleResize);
    this.input?.dispose();
    this.network?.disconnect();
    this.localView?.dispose();
    for (const remote of this.remoteViews.values()) remote.view.dispose();
    this.remoteViews.clear();
    this.physics?.dispose();
    this.scene?.dispose();
    this.engine?.dispose();
    this.scene = null;
    this.engine = null;
    this.physics = null;
  }

  private handlePointerLockChange(locked: boolean): void {
    if (locked) return;
    if (this.currentPhase === 'playing') {
      setPhase('paused');
    }
  }

  private handleWelcome(welcome: WelcomeMessage): void {
    if (this.disposed || !this.scene || !this.physics || !this.toonMaterial) return;
    this.booted = true;
    if (this.bootTimeout) {
      clearTimeout(this.bootTimeout);
      this.bootTimeout = null;
    }
    setLoadingStep('network', 'done');
    setLoadingProgress(1);

    this.localId = welcome.playerId;
    this.localFaction = welcome.faction;
    this.localClass = welcome.classId;
    this.pendingInputs.length = 0;
    this.sequence = 1;
    this.latestLocalState = null;

    const existing = this.localCharacter;
    if (existing && existing.stats.id !== welcome.classId) {
      this.physics.removeCharacter(existing);
      this.localCharacter = null;
    }
    if (!this.localCharacter) {
      this.localCharacter = this.physics.createCharacter({
        position: welcome.spawn,
        classId: welcome.classId,
      });
    } else {
      this.localCharacter.restore(welcome.spawn, { x: 0, y: 0, z: 0 }, false, 0);
    }

    if (
      this.localView &&
      this.localViewFaction === welcome.faction &&
      this.localViewClass === welcome.classId
    ) {
      this.localView.setPosition(welcome.spawn);
      this.localView.setYaw(0, true);
    } else {
      this.localView?.dispose();
      const localShadow = createShadowMaterial(this.scene, 'character-shadow-local');
      this.localView = new CharacterView(
        this.scene,
        this.toonMaterial,
        localShadow,
        welcome.faction,
        welcome.classId,
      );
      this.localViewFaction = welcome.faction;
      this.localViewClass = welcome.classId;
      this.localView.setPosition(welcome.spawn);
    }

    this.cameraRig?.resetAngles(0);
    this.cameraRig?.snapToPlayer(toVector3(welcome.spawn));
    this.lastFrameAt = performance.now();
    this.accumulator = 0;

    if (this.currentPhase === 'booting') {
      this.menuDelay = setTimeout(() => {
        if (!this.disposed && this.currentPhase === 'booting') {
          setPhase('menu');
          notify('notifications.spawned');
        }
      }, 420);
    }
  }

  private handleSnapshot(snapshot: WorldSnapshot): void {
    if (this.disposed) return;
    this.snapshotCount += 1;
    this.lastSnapshotTick = snapshot.serverTick;
    this.snapshotHistory.push({ snapshot, receivedAt: performance.now() });
    if (this.snapshotHistory.length > SNAPSHOT_HISTORY) this.snapshotHistory.shift();
    updateConnection({
      playersOnline: snapshot.players.length,
      snapshots: this.snapshotCount,
      serverTick: snapshot.serverTick,
      ticketsAlpine: snapshot.ticketsAlpine,
      ticketsLagoon: snapshot.ticketsLagoon,
      weatherBalance: snapshot.weatherBalance,
    });

    if (this.localId === null || !this.localCharacter) return;
    const authoritative = snapshot.players.find((player) => player.id === this.localId);
    if (!authoritative) return;
    this.latestLocalState = authoritative;
    this.reconcile(authoritative);
  }

  private reconcile(authoritative: PlayerState): void {
    const character = this.localCharacter;
    if (!character) return;

    const acknowledged = authoritative.lastProcessedInput;
    while (
      this.pendingInputs.length > 0 &&
      !sequenceAfter(this.pendingInputs[0]?.input.sequence ?? 0, acknowledged)
    ) {
      this.pendingInputs.shift();
    }

    const predicted = character.position;
    const error = Math.hypot(
      predicted.x - authoritative.position.x,
      predicted.y - authoritative.position.y,
      predicted.z - authoritative.position.z,
    );
    this.predictionError = error;

    if (error <= RECONCILE_THRESHOLD) return;

    const hardSnap = error > HARD_SNAP_THRESHOLD;
    if (hardSnap) this.pendingInputs.length = 0;
    const previousButtons =
      this.pendingInputs[0]?.previousButtons ?? character.buttons;
    character.restore(
      authoritative.position,
      authoritative.velocity,
      authoritative.grounded,
      previousButtons,
    );

    if (this.physics) {
      for (const pending of this.pendingInputs) {
        character.simulate(pending.input);
        this.physics.step();
      }
    }

    if (hardSnap) {
      this.cameraRig?.snapToPlayer(toVector3(character.position));
      this.accumulator = 0;
    }
  }

  private frame(): void {
    if (this.disposed || !this.scene) return;
    const now = performance.now();
    const delta = Math.min(0.1, Math.max(0.0001, (now - this.lastFrameAt) / 1000));
    this.lastFrameAt = now;
    this.smoothedFrameMs = this.smoothedFrameMs * 0.92 + delta * 1000 * 0.08;

    if (this.currentPhase === 'playing') {
      this.accumulator += delta;
      let steps = 0;
      while (this.accumulator >= FIXED_DT && steps < 5) {
        this.simulateStep();
        this.accumulator -= FIXED_DT;
        steps += 1;
      }
      if (steps === 5) this.accumulator = 0;
    }

    this.updateCamera(delta);
    this.updateLocalView(delta);
    this.updateRemoteViews(delta, now);
    this.updateMaterials(now);
    this.updateHud(now);
    this.scene.render();
  }

  private simulateStep(): void {
    const character = this.localCharacter;
    const camera = this.cameraRig;
    if (!character || !camera || !this.network) return;

    const input: PlayerInput = {
      sequence: this.sequence,
      buttons: this.input?.buttons() ?? 0,
      yaw: camera.lookYaw,
      pitch: camera.lookPitch,
      weaponSlot: 1,
    };
    this.sequence = this.sequence >= 0xffff ? 1 : this.sequence + 1;

    const previousButtons = character.buttons;
    character.simulate(input);
    this.physics?.step();
    this.pendingInputs.push({
      input,
      previousButtons,
      position: character.position,
      velocity: character.velocity,
      grounded: character.grounded,
    });
    if (this.pendingInputs.length > MAX_PREDICTION_REPLAY) this.pendingInputs.shift();
    this.network.sendInput(input);
  }

  private updateCamera(delta: number): void {
    const camera = this.cameraRig;
    if (!camera) return;
    if (this.currentPhase === 'playing' || this.currentPhase === 'paused') {
      if (this.localCharacter && this.physics) {
        camera.updatePlayer(delta, toVector3(this.localCharacter.position), this.physics);
      }
    } else {
      camera.updateMenu(delta);
    }
  }

  private updateLocalView(delta: number): void {
    const character = this.localCharacter;
    const view = this.localView;
    if (!character || !view) return;
    const moving = this.currentPhase === 'playing';
    view.update(
      delta,
      character.position,
      moving ? character.velocity : { x: 0, y: 0, z: 0 },
      character.yaw,
      character.grounded,
      true,
    );
  }

  private updateRemoteViews(delta: number, now: number): void {
    const history = this.snapshotHistory;
    if (history.length === 0) return;
    const latestEntry = history[history.length - 1];
    if (!latestEntry) return;
    const latest = latestEntry.snapshot;
    const renderTime = now - INTERPOLATION_DELAY_MS;

    let olderEntry = history[0] ?? latestEntry;
    let newerEntry = latestEntry;
    for (const entry of history) {
      if (entry.receivedAt <= renderTime) {
        olderEntry = entry;
      }
      if (entry.receivedAt >= renderTime) {
        newerEntry = entry;
        break;
      }
    }
    const span = newerEntry.receivedAt - olderEntry.receivedAt;
    const t = span > 0 ? Math.min(1, Math.max(0, (renderTime - olderEntry.receivedAt) / span)) : 1;

    for (const player of latest.players) {
      if (player.id === this.localId) continue;
      let remote = this.remoteViews.get(player.id);
      if (!remote) {
        if (!this.scene || !this.toonMaterial) continue;
        const shadowMaterial = createShadowMaterial(this.scene, `shadow-${player.id}`);
        const view = new CharacterView(
          this.scene,
          this.toonMaterial,
          shadowMaterial,
          player.faction,
          player.classId,
        );
        remote = { view, lastSeenAt: now };
        this.remoteViews.set(player.id, remote);
      }
      remote.lastSeenAt = now;

      const previous = olderEntry.snapshot.players.find((entry) => entry.id === player.id);
      let position = player.position;
      let velocity = player.velocity;
      if (previous) {
        position = {
          x: lerp(previous.position.x, player.position.x, t),
          y: lerp(previous.position.y, player.position.y, t),
          z: lerp(previous.position.z, player.position.z, t),
        };
        const sampleTime = Math.max(0.001, span / 1000);
        velocity = {
          x: (player.position.x - previous.position.x) / sampleTime,
          y: (player.position.y - previous.position.y) / sampleTime,
          z: (player.position.z - previous.position.z) / sampleTime,
        };
      }
      const yaw = previous
        ? previous.yaw + shortestAngle(previous.yaw, player.yaw) * t
        : player.yaw;
      remote.view.update(delta, position, velocity, yaw, player.grounded, player.alive);
    }

    for (const [id, remote] of this.remoteViews) {
      if (now - remote.lastSeenAt > REMOTE_TIMEOUT_MS) {
        remote.view.dispose();
        this.remoteViews.delete(id);
      }
    }
  }

  private updateMaterials(now: number): void {
    const camera = this.cameraRig?.camera;
    if (!camera || !this.visuals || !this.toonMaterial) return;
    const time = now / 1000;
    updateToonMaterial(this.toonMaterial, camera.position);
    updateWaterMaterial(this.visuals.waterMaterial, camera.position, time);
    updateSkyMaterial(this.visuals.skyMaterial, time);
  }

  private updateHud(now: number): void {
    if (now - this.lastHudAt < HUD_INTERVAL_MS) return;
    this.lastHudAt = now;
    const character = this.localCharacter;
    const state = this.latestLocalState;
    const position = state?.position ?? character?.position ?? { x: 0, y: 0, z: 0 };
    const velocity = state?.velocity ?? character?.velocity ?? { x: 0, y: 0, z: 0 };
    const grounded = state?.grounded ?? character?.grounded ?? false;
    const zone = zoneAt(position.x, position.z);

    if (this.localId !== null) {
      localPlayer.set({
        id: this.localId,
        faction: this.localFaction,
        classId: this.localClass,
        hp: state?.hp ?? CLASS_STATS[this.localClass].maxHp,
        maxHp: state?.maxHp ?? CLASS_STATS[this.localClass].maxHp,
        position,
        velocity,
        grounded,
        zoneKey: zone.labelKey as TranslationKey,
      });
    }

    const drawCalls = this.engine?._drawCalls.current ?? 0;
    const activeMeshes = this.scene?.getActiveMeshes().length ?? 0;
    const width = this.engine?.getRenderWidth() ?? 0;
    const height = this.engine?.getRenderHeight() ?? 0;
    updateHud({
      fps: Math.round(this.engine?.getFps() ?? 0),
      frameMs: Math.round(this.smoothedFrameMs * 10) / 10,
      drawCalls,
      activeMeshes,
      resolution: `${width} × ${height}`,
      pendingInputs: this.pendingInputs.length,
      predictionError: Math.round(this.predictionError * 1000) / 1000,
      engine: this.engine?.isWebGPU ? 'webgpu' : 'webgl2',
      lastSnapshotTick: this.lastSnapshotTick,
      inputSequence: this.sequence,
      localPosition: position,
      localVelocity: velocity,
      grounded,
    });
  }
}
