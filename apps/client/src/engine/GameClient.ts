import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine';
import { Engine } from '@babylonjs/core/Engines/engine';
import { WebGPUEngine } from '@babylonjs/core/Engines/webgpuEngine';
import { Color3, Color4, Vector3 } from '@babylonjs/core/Maths/math';
import { Scene } from '@babylonjs/core/scene';
import {
  CLASS_STATS,
  FIXED_DT,
  InputButton,
  MAX_PREDICTION_REPLAY,
  ParachuteState,
  PhysicsWorld,
  RESPAWN_DELAY_SECONDS,
  WEAPON_STATS,
  WEAPON_TABLE,
  createDefaultProfile,
  profileAppearanceKey,
  skillsForClass,
  surfaceTagAt,
  weaponForSlot,
  zoneAt,
  type CharacterBody,
  type ClassId,
  type Faction,
  type GameEvent,
  type PlayerInput,
  type PlayerProfile,
  type PlayerState,
  type ProfileMessage,
  type TranslationKey,
  type Vec3,
  type WelcomeMessage,
  type WeaponId,
  type WeaponSlot,
  type WindState,
  type WorldSnapshot,
} from '@frost-and-flamingos/shared';
import { audio, type AmbienceKind } from '../audio/synth';
import { NetworkClient } from '../net/connection';
import { buildFjordFiesta, type MapVisuals } from '../rendering/map';
import { CharacterView, type CharacterPose } from '../rendering/character';
import {
  createShadowMaterial,
  createToonMaterial,
  updateSkyMaterial,
  updateToonMaterial,
  updateWaterMaterial,
} from '../rendering/materials';
import {
  clearCombatUi,
  damageFlash,
  deathState,
  debugVisible,
  expireCombatUi,
  localPlayer,
  notify,
  pushKillFeed,
  showComicPop,
  showHitMarker,
  phase,
  setLoadingProgress,
  setLoadingStep,
  setPhase,
  setRenderer,
  showError,
  updateConnection,
  updateDeathCountdown,
  updateHud,
  wardrobeEffect,
  wardrobeOpen,
  wardrobeSpin,
  type GamePhase,
  type RendererName,
  type WardrobeEffect,
} from '../state/game';
import {
  applyServerProfile,
  getProfile,
  profile as profileStore,
  profileFingerprint,
} from '../state/profile';
import { CameraRig } from './camera-rig';
import { installMapDevTools, type DevCameraOverride } from './dev-tools';
import { InputController } from './input';

const INTERPOLATION_DELAY_MS = 110;
const SNAPSHOT_HISTORY = 40;
const RECONCILE_THRESHOLD = 0.12;
const HARD_SNAP_THRESHOLD = 2.4;
const HUD_INTERVAL_MS = 220;
const REMOTE_TIMEOUT_MS = 1600;
const BOOT_TIMEOUT_MS = 20000;
const DEPLOYMENT_DURATION_MS = 2600;

interface PendingInput {
  input: PlayerInput;
  previousButtons: number;
  position: Vec3;
  velocity: Vec3;
  grounded: boolean;
  wind: WindState;
}

interface SnapshotEntry {
  snapshot: WorldSnapshot;
  receivedAt: number;
}

interface RemoteView {
  view: CharacterView;
  key: string;
  lastSeenAt: number;
  stepDistance: number;
  swimTimer: number;
  wasGrounded: boolean;
  wasSwimming: boolean;
}

const PROFILE_SEND_DELAY_MS = 160;
const FALLBACK_PROFILE = createDefaultProfile('Vacationer');

function toVector3(value: Vec3): Vector3 {
  return new Vector3(value.x, value.y, value.z);
}

function directionFromAngles(yaw: number, pitch: number): Vec3 {
  const cosPitch = Math.cos(pitch);
  return {
    x: Math.sin(yaw) * cosPitch,
    y: Math.sin(pitch),
    z: Math.cos(yaw) * cosPitch,
  };
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
  private devCamera: DevCameraOverride | null = null;
  private toonMaterial: ReturnType<typeof createToonMaterial> | null = null;

  private localId: number | null = null;
  private localFaction: Faction = 'alpine';
  private localClass: ClassId = 'allrounder';
  private localCharacter: CharacterBody | null = null;
  private localView: CharacterView | null = null;
  private localViewKey: string | null = null;
  private localProfile: PlayerProfile | null = null;
  private localSpawn: Vec3 = { x: 0, y: 0, z: 0 };
  private latestLocalState: PlayerState | null = null;
  private latestWind: WindState = { angle: 0, strength: 0 };
  private pendingInputs: PendingInput[] = [];
  private sequence = 1;
  private predictionError = 0;

  private readonly profiles = new Map<number, PlayerProfile>();
  private previewView: CharacterView | null = null;
  private previewKey: string | null = null;
  private previewYaw = 0.35;
  private previewSpin = true;
  private previewEffect: WardrobeEffect = 'none';
  private wardrobeIsOpen = false;
  private lastSentProfileFingerprint: string | null = null;
  private profileSendTimer: ReturnType<typeof setTimeout> | null = null;
  private suppressProfileSend = false;
  private viewSerial = 0;

  private lastAudioButtons = 0;
  private audioGrounded = true;
  private audioSwimming = false;
  private audioRolling = false;
  private audioParachuteOpen = false;
  private stepDistance = 0;
  private swimStrokeTimer = 0;
  private lastAmbience: AmbienceKind | null = null;

  private snapshotHistory: SnapshotEntry[] = [];
  private remoteViews = new Map<number, RemoteView>();
  private lastFireSentAt = 0;
  private fireHeld = false;
  private lastWeaponSlot: WeaponSlot = 1;
  private lastReloading = false;
  private deathKillerId = 0;
  private deathKillerName = '';
  private deathAt = 0;
  private lastDamageAt = 0;
  private lastCombatAt = 0;
  private pendingRespawnSnap = false;

  private currentPhase: GamePhase = 'booting';
  private accumulator = 0;
  private lastFrameAt = performance.now();
  private smoothedFrameMs = 16.7;
  private frameDrawCalls = 0;
  private lastDrawCallsTotal = 0;
  private lastHudAt = 0;
  private lastSnapshotTick = 0;
  private snapshotCount = 0;
  private booted = false;
  private disposed = false;
  private bootTimeout: ReturnType<typeof setTimeout> | null = null;
  private menuDelay: ReturnType<typeof setTimeout> | null = null;
  private deploymentTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly unsubscribePhase: () => void;
  private readonly unsubscribeProfile: () => void;
  private readonly unsubscribeWardrobe: () => void;
  private readonly unsubscribeSpin: () => void;
  private readonly unsubscribeEffect: () => void;
  private readonly handleResize = (): void => {
    this.engine?.resize();
  };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.unsubscribePhase = phase.subscribe((next) => {
      const wasPlaying = this.currentPhase === 'playing';
      this.currentPhase = next;
      audio.setScene(
        next === 'booting'
          ? 'loading'
          : next === 'menu' || next === 'error'
            ? 'menu'
            : 'gameplay',
      );
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
    this.unsubscribeProfile = profileStore.subscribe((value) => this.handleProfileStoreChange(value));
    this.unsubscribeWardrobe = wardrobeOpen.subscribe((open) => {
      this.wardrobeIsOpen = open;
    });
    this.unsubscribeSpin = wardrobeSpin.subscribe((spin) => {
      this.previewSpin = spin;
    });
    this.unsubscribeEffect = wardrobeEffect.subscribe((effect) => {
      this.previewEffect = effect;
      this.applyPreviewEffects();
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
        onTaunt: () => {
          const profile = this.localProfile;
          if (profile) {
            audio.playTaunt(profile.faction, profile.cosmetics.voicePitch);
          }
        },
        onPointerLockChange: (locked) => this.handlePointerLockChange(locked),
        onPointerLockError: () => notify('notifications.pointerLock'),
        onEscape: () => {
          if (this.currentPhase === 'playing') this.pause();
          else if (this.currentPhase === 'deploying') this.returnToMenu();
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
      if (import.meta.env.DEV) {
        installMapDevTools({
          scene: () => this.scene,
          engine: () => this.engine,
          localId: () => this.localId,
          visuals: () => this.visuals,
          frameDrawCalls: () => this.frameDrawCalls,
          setCameraOverride: (override) => {
            this.devCamera = override;
          },
        });
      }
      this.rebuildPreviewView(getProfile());
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
        onProfile: (message) => this.handleProfile(message),
        onGameEvent: (event) => this.handleGameEvent(event),
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
    wardrobeOpen.set(false);
    this.accumulator = 0;
    this.lastFrameAt = performance.now();
    this.cameraRig?.snapToPlayer(toVector3(this.localCharacter.position));
    if (this.currentPhase === 'paused') {
      audio.setRoundCue(null);
      setPhase('playing');
      this.input?.requestPointerLock();
      return;
    }
    // A fresh round starts with a short in-game deployment screen. This is the
    // only reliable moment to play the round bed, because the browser unlocks
    // audio on the Play click and the boot loader may finish before any gesture.
    audio.setRoundCue('loading');
    setPhase('deploying');
    this.input?.requestPointerLock();
    this.scheduleDeployment();
  }

  private scheduleDeployment(attempt = 0): void {
    if (this.deploymentTimer) clearTimeout(this.deploymentTimer);
    this.deploymentTimer = setTimeout(
      () => {
        this.deploymentTimer = null;
        if (this.disposed || this.currentPhase !== 'deploying') return;
        // The first Play click also unlocks Web Audio and starts decoding the
        // supplied beds. Keep the deployment card up a little longer rather
        // than clearing the round cue before its track can start.
        if (audio.isUnlocked && !audio.roundTrackReady && attempt < 16) {
          this.scheduleDeployment(attempt + 1);
          return;
        }
        audio.setRoundCue(null);
        this.accumulator = 0;
        this.lastFrameAt = performance.now();
        setPhase('playing');
      },
      attempt === 0 ? DEPLOYMENT_DURATION_MS : 150,
    );
  }

  pause(): void {
    if (this.currentPhase !== 'playing') return;
    setPhase('paused');
    this.input?.releasePointerLock();
  }

  returnToMenu(): void {
    if (this.deploymentTimer) {
      clearTimeout(this.deploymentTimer);
      this.deploymentTimer = null;
    }
    audio.setRoundCue(null);
    clearCombatUi();
    this.deathKillerId = 0;
    this.deathKillerName = '';
    this.deathAt = 0;
    this.lastDamageAt = 0;
    this.cameraRig?.endKillerCam();
    setPhase('menu');
    this.input?.releasePointerLock();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.bootTimeout) clearTimeout(this.bootTimeout);
    if (this.menuDelay) clearTimeout(this.menuDelay);
    if (this.deploymentTimer) clearTimeout(this.deploymentTimer);
    if (this.profileSendTimer) clearTimeout(this.profileSendTimer);
    this.unsubscribePhase();
    this.unsubscribeProfile();
    this.unsubscribeWardrobe();
    this.unsubscribeSpin();
    this.unsubscribeEffect();
    window.removeEventListener('resize', this.handleResize);
    this.input?.dispose();
    this.network?.disconnect();
    this.localView?.dispose();
    this.previewView?.dispose();
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
    this.localSpawn = welcome.spawn;
    this.pendingInputs.length = 0;
    this.sequence = 1;
    this.latestLocalState = null;
    this.profiles.clear();
    this.clearRemoteViews();
    this.deathKillerId = 0;
    this.deathKillerName = '';
    this.deathAt = 0;
    this.lastDamageAt = 0;
    this.lastFireSentAt = 0;
    this.fireHeld = false;
    this.lastReloading = false;
    clearCombatUi();
    this.cameraRig?.endKillerCam();

    this.applyAuthoritativeProfile(welcome.profile);
    this.ensureLocalCharacter(welcome.profile, welcome.spawn);
    this.localCharacter?.restore(welcome.spawn, { x: 0, y: 0, z: 0 }, false, 0);
    this.ensureLocalView(welcome.profile);
    this.localView?.setPosition(welcome.spawn);
    this.localView?.setYaw(0, true);

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

  private handleProfile(message: ProfileMessage): void {
    this.profiles.set(message.playerId, message.profile);
    if (message.playerId === this.localId) {
      this.applyAuthoritativeProfile(message.profile);
      this.ensureLocalCharacter(
        message.profile,
        this.localCharacter?.position ?? this.localSpawn,
      );
      this.ensureLocalView(message.profile);
      return;
    }

    const remote = this.remoteViews.get(message.playerId);
    if (!remote) return;
    const key = profileAppearanceKey(message.profile);
    if (remote.key === key) return;
    const lastSeenAt = remote.lastSeenAt;
    remote.view.dispose();
    const rebuilt = this.createRemoteView(message.playerId, message.profile);
    if (rebuilt) {
      rebuilt.lastSeenAt = lastSeenAt;
      this.remoteViews.set(message.playerId, rebuilt);
    } else {
      this.remoteViews.delete(message.playerId);
    }
  }

  private applyAuthoritativeProfile(profile: PlayerProfile): void {
    this.localProfile = profile;
    this.localFaction = profile.faction;
    this.localClass = profile.cosmetics.classId;
    this.suppressProfileSend = true;
    try {
      applyServerProfile(profile);
    } finally {
      this.suppressProfileSend = false;
    }
    this.lastSentProfileFingerprint = profileFingerprint(profile);
  }

  private handleProfileStoreChange(value: PlayerProfile): void {
    if (!this.suppressProfileSend) this.scheduleProfileSend();
    if (this.scene && this.toonMaterial) this.rebuildPreviewView(value);
  }

  private scheduleProfileSend(): void {
    if (!this.network?.ready) return;
    if (this.profileSendTimer) clearTimeout(this.profileSendTimer);
    this.profileSendTimer = setTimeout(() => {
      this.profileSendTimer = null;
      if (!this.network?.ready) return;
      const current = getProfile();
      const fingerprint = profileFingerprint(current);
      if (fingerprint === this.lastSentProfileFingerprint) return;
      this.network.sendProfile(current);
      this.lastSentProfileFingerprint = fingerprint;
    }, PROFILE_SEND_DELAY_MS);
  }

  private ensureLocalCharacter(profile: PlayerProfile, position: Vec3): void {
    if (!this.physics) return;
    const classId = profile.cosmetics.classId;
    if (this.localCharacter && this.localCharacter.stats.id === classId) return;
    const spawn = this.localCharacter?.position ?? position;
    if (this.localCharacter) this.physics.removeCharacter(this.localCharacter);
    this.localCharacter = this.physics.createCharacter({ position: spawn, classId });
    this.pendingInputs.length = 0;
    this.latestLocalState = null;
  }

  private ensureLocalView(profile: PlayerProfile): void {
    if (!this.scene || !this.toonMaterial) return;
    const key = profileAppearanceKey(profile);
    if (this.localView && this.localViewKey === key) return;
    const position = this.localCharacter?.position ?? this.localSpawn;
    const yaw = this.localCharacter?.yaw ?? 0;
    this.localView?.dispose();
    const shadow = createShadowMaterial(this.scene, `character-shadow-local-${this.nextViewSerial()}`);
    this.localView = new CharacterView(this.scene, shadow, profile);
    this.localViewKey = key;
    this.localView.setPosition(position);
    this.localView.setYaw(yaw, true);
  }

  private rebuildPreviewView(profile: PlayerProfile): void {
    if (!this.scene || !this.toonMaterial) return;
    const key = profileAppearanceKey(profile);
    if (this.previewView && this.previewKey === key) return;
    this.previewView?.dispose();
    const shadow = createShadowMaterial(this.scene, `character-shadow-preview-${this.nextViewSerial()}`);
    this.previewView = new CharacterView(this.scene, shadow, profile);
    this.previewKey = key;
    const stage = this.visuals?.previewStage;
    if (stage) this.previewView.setPosition(stage.position);
    this.previewView.setYaw(this.previewYaw, true);
    this.applyPreviewEffects();
  }

  private applyPreviewEffects(): void {
    const effect = this.previewEffect;
    this.previewView?.setEffects({
      battleDamage: effect === 'damaged' ? 0.85 : 0,
      charred: effect === 'charred' ? 1 : 0,
      frozen: effect === 'frozen' ? 1 : 0,
    });
  }

  private createRemoteView(playerId: number, profile: PlayerProfile): RemoteView | null {
    if (!this.scene || !this.toonMaterial) return null;
    const shadow = createShadowMaterial(this.scene, `shadow-${playerId}-${this.nextViewSerial()}`);
    const view = new CharacterView(this.scene, shadow, profile);
    return {
      view,
      key: profileAppearanceKey(profile),
      lastSeenAt: performance.now(),
      stepDistance: 0,
      swimTimer: 0,
      wasGrounded: true,
      wasSwimming: false,
    };
  }

  private clearRemoteViews(): void {
    for (const remote of this.remoteViews.values()) remote.view.dispose();
    this.remoteViews.clear();
  }

  private nextViewSerial(): number {
    this.viewSerial += 1;
    return this.viewSerial;
  }

  private profileForPlayer(player: PlayerState): PlayerProfile {
    const profile = this.profiles.get(player.id);
    if (profile) return profile;
    return {
      ...FALLBACK_PROFILE,
      faction: player.faction,
      cosmetics: { ...FALLBACK_PROFILE.cosmetics, classId: player.classId },
    };
  }

  private handleGameEvent(event: GameEvent): void {
    const now = performance.now();
    const latest = this.snapshotHistory[this.snapshotHistory.length - 1]?.snapshot;
    const actor = latest?.players.find((entry) => entry.id === event.actorId);

    switch (event.eventType) {
      case 'PARACHUTE_POPPED': {
        if (event.actorId === this.localId) return;
        audio.playParachuteOpen(actor?.position);
        return;
      }
      case 'WEAPON_FIRED': {
        if (event.actorId === this.localId) return;
        const weaponId = WEAPON_TABLE.byCode[event.paramValue];
        if (weaponId) audio.playWeaponFire(weaponId, actor?.position);
        return;
      }
      case 'COMIC_HIT': {
        this.lastCombatAt = now;
        if (event.actorId === this.localId) {
          showHitMarker(event.paramX === 1, false);
          audio.playHitMarker(event.paramX === 1, false);
        }
        if (event.targetId === this.localId) {
          this.lastDamageAt = now;
          damageFlash.set(1);
          audio.playDamageTick();
        }
        return;
      }
      case 'KILL_RAGDOLL': {
        const killerProfile = this.profiles.get(event.actorId);
        const victimProfile = this.profiles.get(event.targetId);
        const victim = latest?.players.find((entry) => entry.id === event.targetId);
        const killer = latest?.players.find((entry) => entry.id === event.actorId);
        const killerName = killerProfile?.displayName ?? '';
        const victimName = victimProfile?.displayName ?? `#${event.targetId}`;
        const weaponId = WEAPON_TABLE.byCode[event.paramValue] ?? null;
        const headshot = event.paramX === 1;
        pushKillFeed({
          killerId: event.actorId,
          killerName,
          victimId: event.targetId,
          victimName,
          weaponId,
          headshot,
          at: now,
        });
        this.lastCombatAt = now;
        if (event.actorId === this.localId) {
          showHitMarker(false, true);
          audio.playHitMarker(false, true);
          showComicPop(headshot ? 'combat.headshot' : 'combat.kill');
        }
        if (event.targetId === this.localId) {
          this.deathKillerId = event.actorId;
          this.deathKillerName = killerName;
          this.deathAt = now;
          this.lastDamageAt = now;
          deathState.set({
            killerId: event.actorId,
            killerName,
            killerClassId: killerProfile?.cosmetics.classId ?? killer?.classId ?? null,
            killerHp: killer?.hp ?? 0,
            killerMaxHp: killer?.maxHp ?? CLASS_STATS[killerProfile?.cosmetics.classId ?? 'allrounder'].maxHp,
            weaponId,
            headshot,
            stage: 'killcam',
            respawnSeconds: RESPAWN_DELAY_SECONDS,
            at: now,
          });
          audio.setRoundCue('dead');
          audio.playDeathScream(undefined, this.localProfile?.cosmetics.voicePitch ?? 1);
        } else {
          audio.playDeathScream(victim?.position, victimProfile?.cosmetics.voicePitch ?? 1);
        }
        return;
      }
      case 'PLAYER_RESPAWNED': {
        if (event.actorId !== this.localId) return;
        this.deathKillerId = 0;
        this.deathKillerName = '';
        this.deathAt = 0;
        this.lastDamageAt = 0;
        this.pendingRespawnSnap = true;
        deathState.set(null);
        this.cameraRig?.endKillerCam();
        audio.setRoundCue(null);
        return;
      }
      case 'SKILL_USED': {
        audio.playSkill(event.paramX, actor?.position);
        return;
      }
      case 'PROP_EXPLODE': {
        audio.playExplosion({
          x: event.paramX,
          y: actor?.position.y ?? 0,
          z: event.paramZ,
        });
        return;
      }
      default:
        return;
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
      towerStates: snapshot.turretStates,
    });
    this.latestWind = { angle: snapshot.windAngle, strength: snapshot.windStrength };

    if (this.localId === null || !this.localCharacter) return;
    const authoritative = snapshot.players.find((player) => player.id === this.localId);
    if (!authoritative) return;
    this.latestLocalState = authoritative;
    if (!authoritative.alive && this.deathAt === 0) {
      this.deathAt = performance.now();
      this.deathKillerId = 0;
      this.deathKillerName = '';
      deathState.set({
        killerId: 0,
        killerName: '',
        killerClassId: null,
        killerHp: 0,
        killerMaxHp: 0,
        weaponId: null,
        headshot: false,
        stage: 'killcam',
        respawnSeconds: RESPAWN_DELAY_SECONDS,
        at: this.deathAt,
      });
      audio.setRoundCue('dead');
    } else if (authoritative.alive && this.deathAt > 0) {
      this.deathAt = 0;
      this.deathKillerId = 0;
      this.deathKillerName = '';
      this.lastDamageAt = 0;
      deathState.set(null);
      this.cameraRig?.endKillerCam();
      audio.setRoundCue(null);
      this.pendingRespawnSnap = true;
    } else if (this.deathAt > 0) {
      const killer = snapshot.players.find((player) => player.id === this.deathKillerId);
      if (killer) {
        deathState.update((state) =>
          state
            ? {
                ...state,
                killerClassId: killer.classId,
                killerHp: killer.hp,
                killerMaxHp: killer.maxHp,
              }
            : state,
        );
      }
    }
    if (authoritative.alive && this.pendingRespawnSnap) {
      this.pendingRespawnSnap = false;
      this.cameraRig?.snapToPlayer(toVector3(authoritative.position));
    }
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

    if (character.parachuteState !== authoritative.parachuteState) {
      character.setParachuteState(authoritative.parachuteState);
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
      authoritative.parachuteState,
    );

    if (this.physics) {
      for (const pending of this.pendingInputs) {
        character.setWind(pending.wind);
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
    this.updatePreviewView(delta);
    this.updateRemoteViews(delta, now);
    this.updateAudio(delta);
    this.updateMaterials(now);
    this.updateHud(now);
    this.scene.render();
    const drawTotal = this.engine?._drawCalls.current ?? 0;
    this.frameDrawCalls = Math.max(0, drawTotal - this.lastDrawCallsTotal);
    this.lastDrawCallsTotal = drawTotal;
  }

  private simulateStep(): void {
    const character = this.localCharacter;
    const camera = this.cameraRig;
    if (!character || !camera || !this.network) return;
    if (this.latestLocalState && !this.latestLocalState.alive) return;

    const buttons = this.input?.buttons() ?? 0;
    const slot = this.input?.currentWeaponSlot() ?? 1;
    if (slot !== this.lastWeaponSlot) {
      this.lastWeaponSlot = slot;
      this.fireHeld = false;
      this.lastFireSentAt = 0;
      audio.playUi('equip');
    }

    const input: PlayerInput = {
      sequence: this.sequence,
      buttons,
      yaw: camera.lookYaw,
      pitch: camera.lookPitch,
      weaponSlot: slot,
    };
    this.sequence = this.sequence >= 0xffff ? 1 : this.sequence + 1;

    const previousButtons = character.buttons;
    character.setWind(this.latestWind);
    character.simulate(input);
    this.physics?.step();
    this.pendingInputs.push({
      input,
      previousButtons,
      position: character.position,
      velocity: character.velocity,
      grounded: character.grounded,
      wind: this.latestWind,
    });
    if (this.pendingInputs.length > MAX_PREDICTION_REPLAY) this.pendingInputs.shift();
    this.network.sendInput(input);
    this.maybeSendFire(buttons, slot, character, camera);
  }

  private maybeSendFire(
    buttons: number,
    slot: WeaponSlot,
    character: CharacterBody,
    camera: CameraRig,
  ): void {
    const profile = this.localProfile;
    if (!profile || !this.network) return;
    const weaponId = weaponForSlot(profile.loadout, slot);
    const stats = WEAPON_STATS[weaponId];
    const pressed = (buttons & InputButton.FirePrimary) !== 0;
    const justPressed = pressed && !this.fireHeld;
    this.fireHeld = pressed;
    if (!pressed) return;
    if (!stats.automatic && !justPressed) return;
    if (this.latestLocalState?.reloading) return;

    const state = this.latestLocalState;
    if (stats.magazine > 0 && state && state.ammo <= 0 && state.reserve <= 0) {
      if (justPressed) audio.playDryFire();
      return;
    }

    const now = performance.now();
    const interval = 60000 / Math.max(1, stats.rpm);
    if (now - this.lastFireSentAt < interval) return;
    this.lastFireSentAt = now;

    const direction = directionFromAngles(camera.lookYaw, camera.lookPitch);
    const origin = {
      x: character.position.x + direction.x * 0.25,
      y: character.position.y + character.eyeHeight + direction.y * 0.25,
      z: character.position.z + direction.z * 0.25,
    };
    this.network.sendFire({
      clientTick: this.lastSnapshotTick,
      origin,
      direction,
      weaponId: WEAPON_TABLE.code[weaponId],
    });
    audio.playWeaponFire(weaponId, undefined, true);
    if (stats.magazine > 0 && state && state.ammo <= 0) audio.playDryFire();
  }

  private updateCamera(delta: number): void {
    const camera = this.cameraRig;
    if (!camera) return;
    if (this.devCamera) {
      camera.camera.position.copyFrom(this.devCamera.position);
      camera.camera.setTarget(this.devCamera.target);
      return;
    }
    if (this.deathAt > 0 && this.physics) {
      const latest = this.snapshotHistory[this.snapshotHistory.length - 1]?.snapshot;
      const killer = latest?.players.find((player) => player.id === this.deathKillerId);
      const target = killer?.position ?? this.latestLocalState?.position ?? this.localCharacter?.position;
      if (target) {
        camera.updateKillerCam(delta, toVector3(target), this.physics);
        return;
      }
    }
    const playerCamera =
      this.currentPhase === 'playing' ||
      this.currentPhase === 'deploying' ||
      (this.currentPhase === 'paused' && !this.wardrobeIsOpen);
    if (playerCamera) {
      if (this.localCharacter && this.physics) {
        camera.updatePlayer(delta, toVector3(this.localCharacter.position), this.physics);
      }
      return;
    }
    const stage = this.visuals?.previewStage;
    if (stage) {
      camera.updatePreview(delta, stage.position, this.wardrobeIsOpen ? 'wardrobe' : 'menu');
    } else {
      camera.updateMenu(delta);
    }
  }

  private updateLocalView(delta: number): void {
    const character = this.localCharacter;
    const view = this.localView;
    if (!character || !view) return;
    const showLocal =
      this.currentPhase === 'playing' ||
      this.currentPhase === 'deploying' ||
      (this.currentPhase === 'paused' && !this.wardrobeIsOpen);
    view.root.setEnabled(showLocal);
    if (!showLocal) return;
    const moving = this.currentPhase === 'playing';
    const pose: CharacterPose = {
      position: character.position,
      velocity: moving ? character.velocity : { x: 0, y: 0, z: 0 },
      yaw: character.yaw,
      grounded: character.grounded,
      alive: this.latestLocalState?.alive ?? true,
      crouched: character.crouched,
      crouchBlend: character.crouchBlend,
      swimming: character.swimming,
      sprinting: character.sprinting,
      rolling: character.rolling,
      parachuteState: character.parachuteState,
      parachuteBlend: character.parachuteBlend,
      parachuteSway: character.parachuteSwayAngle,
    };
    view.update(delta, pose);
  }

  private updatePreviewView(delta: number): void {
    const view = this.previewView;
    if (!view) return;
    const menuLike =
      this.currentPhase === 'menu' ||
      this.currentPhase === 'booting' ||
      (this.currentPhase === 'paused' && this.wardrobeIsOpen);
    view.root.setEnabled(menuLike);
    if (!menuLike) return;
    if (this.previewSpin) this.previewYaw += delta * 0.55;
    view.updatePreview(delta, this.previewYaw);
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
      const profile = this.profileForPlayer(player);
      const profileKey = profileAppearanceKey(profile);
      let remote = this.remoteViews.get(player.id);
      if (remote && remote.key !== profileKey) {
        const lastSeenAt = remote.lastSeenAt;
        remote.view.dispose();
        remote = this.createRemoteView(player.id, profile) ?? undefined;
        if (remote) {
          remote.lastSeenAt = lastSeenAt;
          this.remoteViews.set(player.id, remote);
        } else {
          this.remoteViews.delete(player.id);
        }
      }
      if (!remote) {
        remote = this.createRemoteView(player.id, profile) ?? undefined;
        if (!remote) continue;
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
      remote.view.update(delta, {
        position,
        velocity,
        yaw,
        grounded: player.grounded,
        alive: player.alive,
        crouched: player.crouched,
        swimming: player.swimming,
        sprinting: player.sprinting,
        rolling: player.rolling,
        parachuteState: player.parachuteState,
      });

      const remoteSpeed = Math.hypot(velocity.x, velocity.z);
      if (player.swimming && !remote.wasSwimming) {
        audio.playSplash(position, true);
      } else if (!player.swimming && remote.wasSwimming) {
        audio.playSplash(position);
      }
      if (player.grounded && !remote.wasGrounded && !player.swimming) {
        audio.playLand(position);
      }
      if (player.rolling) {
        remote.stepDistance = 0;
      } else if (player.grounded && !player.swimming && remoteSpeed > 0.6) {
        remote.stepDistance += remoteSpeed * delta;
        const stride = player.sprinting ? 1.9 : player.crouched ? 2.9 : 2.4;
        if (remote.stepDistance >= stride) {
          remote.stepDistance = 0;
          audio.playFootstep(
            surfaceTagAt(position.x, position.z),
            position,
            player.sprinting,
            this.profiles.get(player.id)?.cosmetics.feet === 'feet_dive_flippers',
          );
        }
      } else {
        remote.stepDistance = Math.min(remote.stepDistance, 0.5);
      }
      if (player.swimming && remoteSpeed > 0.4) {
        remote.swimTimer -= delta;
        if (remote.swimTimer <= 0) {
          remote.swimTimer = 0.9;
          audio.playSwimStroke(position);
        }
      }
      remote.wasGrounded = player.grounded;
      remote.wasSwimming = player.swimming;
    }

    for (const [id, remote] of this.remoteViews) {
      if (now - remote.lastSeenAt > REMOTE_TIMEOUT_MS) {
        remote.view.dispose();
        this.remoteViews.delete(id);
      }
    }
  }

  private updateAudio(delta: number): void {
    const camera = this.cameraRig?.camera;
    if (camera) {
      const forward = camera.getDirection(new Vector3(0, 0, 1));
      audio.updateListener(
        { x: camera.position.x, y: camera.position.y, z: camera.position.z },
        { x: forward.x, y: forward.y, z: forward.z },
      );
    }

    const character = this.localCharacter;
    const position = character?.position ?? this.localSpawn;
    const zone = zoneAt(position.x, position.z);
    let ambience: AmbienceKind;
    if (this.currentPhase === 'menu' || this.currentPhase === 'booting' || this.currentPhase === 'error') {
      ambience = 'menu';
    } else if (character?.swimming) {
      ambience = 'water';
    } else if (zone.climate === 'lagoon') {
      ambience = 'lagoon';
    } else if (zone.climate === 'village') {
      ambience = 'village';
    } else {
      ambience = 'alpine';
    }
    if (this.lastAmbience !== ambience) {
      this.lastAmbience = ambience;
      audio.setAmbience(ambience);
    }

    if (!character) return;
    if (this.currentPhase !== 'playing') {
      this.lastAudioButtons = character.buttons;
      this.audioGrounded = character.grounded;
      this.audioSwimming = character.swimming;
      this.audioRolling = character.rolling;
      this.audioParachuteOpen = character.parachuteOpen;
      return;
    }

    const buttons = character.buttons;
    const pressedJump = (buttons & InputButton.Jump) !== 0 && (this.lastAudioButtons & InputButton.Jump) === 0;
    if (pressedJump && this.audioGrounded) audio.playJump();
    if (!this.audioGrounded && character.grounded && !character.swimming) audio.playLand();
    if (character.swimming && !this.audioSwimming) {
      audio.playSplash(position, true);
      this.swimStrokeTimer = 0.7;
    }
    if (character.rolling && !this.audioRolling) audio.playRoll();
    if (character.parachuteOpen !== this.audioParachuteOpen) {
      if (character.parachuteOpen) audio.playParachuteOpen(position);
      else audio.playParachuteClose(position);
      this.audioParachuteOpen = character.parachuteOpen;
    }

    const speed = Math.hypot(character.velocity.x, character.velocity.z);
    if (character.grounded && !character.swimming && !character.rolling && speed > 0.6) {
      this.stepDistance += speed * delta;
      const stride = character.sprinting ? 1.9 : character.crouched ? 2.9 : 2.4;
      if (this.stepDistance >= stride) {
        this.stepDistance = 0;
        audio.playFootstep(
          character.surfaceTag,
          undefined,
          character.sprinting,
          this.localProfile?.cosmetics.feet === 'feet_dive_flippers',
        );
      }
    } else if (!character.grounded || character.rolling) {
      this.stepDistance = 0;
    } else {
      this.stepDistance = Math.min(this.stepDistance, 0.5);
    }

    if (character.swimming && speed > 0.4) {
      this.swimStrokeTimer -= delta;
      if (this.swimStrokeTimer <= 0) {
        this.swimStrokeTimer = 0.9;
        audio.playSwimStroke();
      }
    } else if (!character.swimming) {
      this.swimStrokeTimer = 0.7;
    }

    const combatBoost = performance.now() - this.lastCombatAt < 7000 ? 0.18 : 0;
    audio.setMusicIntensity(
      Math.min(1, 0.35 + Math.min(0.45, speed / 12) + (character.sprinting ? 0.1 : 0) + combatBoost),
    );
    this.lastAudioButtons = buttons;
    this.audioGrounded = character.grounded;
    this.audioSwimming = character.swimming;
    this.audioRolling = character.rolling;
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
    const weaponSlot = state?.weaponSlot ?? 1;
    const weaponId = this.localProfile ? weaponForSlot(this.localProfile.loadout, weaponSlot) : 'smg';

    if (state && state.reloading !== this.lastReloading) {
      this.lastReloading = state.reloading;
      if (state.reloading && this.localProfile) {
        audio.playWeaponReload(weaponForSlot(this.localProfile.loadout, state.weaponSlot));
      }
    }

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
        crouched: state?.crouched ?? character?.crouched ?? false,
        swimming: state?.swimming ?? character?.swimming ?? false,
        sprinting: state?.sprinting ?? character?.sprinting ?? false,
        rolling: state?.rolling ?? character?.rolling ?? false,
        parachuteState:
          state?.parachuteState ?? character?.parachuteState ?? ParachuteState.Closed,
        weaponSlot,
        weaponId,
        weaponIds: this.localProfile
          ? [
              this.localProfile.loadout.primary,
              this.localProfile.loadout.secondary,
              this.localProfile.loadout.gimmick,
            ]
          : ['smg', 'shotgun', 'snow_cannon'],
        ammo: state?.ammo ?? WEAPON_STATS[weaponId].magazine,
        reserve: state?.reserve ?? WEAPON_STATS[weaponId].reserve,
        reloading: state?.reloading ?? false,
        shield: state?.shield ?? 0,
        kills: state?.kills ?? 0,
        deaths: state?.deaths ?? 0,
        skillCooldowns: [
          state?.skillCooldown1 ?? 0,
          state?.skillCooldown2 ?? 0,
          state?.skillCooldown3 ?? 0,
        ] as [number, number, number],
        cloaked: state?.cloaked ?? false,
        alive: state?.alive ?? true,
        zoneKey: zone.labelKey as TranslationKey,
      });
    }

    if (this.lastDamageAt > 0) {
      const flash = Math.max(0, 1 - (now - this.lastDamageAt) / 520);
      damageFlash.set(flash);
    }
    expireCombatUi(now);
    if (this.deathAt > 0) updateDeathCountdown(now, RESPAWN_DELAY_SECONDS);

    const drawCalls = this.frameDrawCalls;
    const activeMeshes = this.scene?.getActiveMeshes().length ?? 0;
    const width = this.engine?.getRenderWidth() ?? 0;
    const height = this.engine?.getRenderHeight() ?? 0;
    const music = audio.musicState;
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
      musicTrack: music.title,
      musicBpm: music.bpm,
    });
  }
}
