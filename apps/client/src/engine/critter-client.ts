import {
  readCritterKillValue,
  type CritterBehaviour,
  type CritterSpecies,
  type CritterState,
  type GameEvent,
  type PlayerProfile,
  type Vec3,
} from '@frost-and-flamingos/shared';
import { audio } from '../audio/synth';
import type { CritterFx } from '../rendering/critter-fx';
import type { MascotFx } from '../rendering/mascot-fx';
import { pushKillFeed, showComicPop, showHitMarker } from '../state/game';

/**
 * Client side of the ambient critters (wandering hens): interpolates the
 * authoritative critter trailer like remote players (snapshot history, a
 * small render delay), drives one view per critter, plays their sparse
 * clucking, the panic flutter and the death squawk, and turns the
 * CRITTER_KILLED event into a feather burst, a "BOK!" popup and a kill-feed
 * line. No gameplay here: the server decides everything.
 */

/** What a critter view needs to pose itself this frame. */
export interface CritterPose {
  position: Vec3;
  yaw: number;
  speed: number;
  behaviour: CritterBehaviour;
  airborne: boolean;
  /** Vertical speed estimated from the interpolated path (hops). */
  verticalSpeed: number;
}

export interface CritterView {
  update(delta: number, pose: CritterPose): void;
  setVisible(visible: boolean): void;
  /** Death: the body pops away (it hides itself when the pop ends). */
  pop(): void;
  dispose(): void;
}

/** Returns null when the species' model is unavailable: then nothing is drawn. */
export type CritterViewFactory = (species: CritterSpecies, id: number) => CritterView | null;

interface SnapshotEntry {
  critters: readonly CritterState[];
  receivedAt: number;
}

interface CritterTrack {
  id: number;
  species: CritterSpecies;
  view: CritterView | null;
  /** View requested but the factory returned null (model missing or loading). */
  retryAt: number;
  visible: boolean;
  lastPosition: Vec3;
  lastBehaviour: CritterBehaviour;
  lastY: number;
  nextCluckAt: number;
  lastPanicAt: number;
  pitch: number;
  /** Last pose handed to the view: a death pop keeps playing on it. */
  lastPose: CritterPose | null;
  /** performance.now() after which a running death pop is forced hidden; 0 when none. */
  popUntil: number;
}

export interface CritterKillContext {
  localId: number | null;
  profiles: ReadonlyMap<number, PlayerProfile>;
}

const INTERPOLATION_DELAY_MS = 110;
const HISTORY = 30;
/** A jump larger than this between two snapshots is a respawn: snap, do not glide. */
const TELEPORT_DISTANCE = 3;
const CLUCK_RANGE = 22;
const PANIC_RANGE = 32;
const VIEW_RETRY_MS = 1500;
/**
 * The client stops ticking a death pop after this long and hides the view
 * itself (the hen view's pop is 0.14 s; slow frames clamp delta to 0.1 s).
 */
export const CRITTER_POP_GUARD_MS = 450;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function shortestAngle(from: number, to: number): number {
  let difference = (to - from) % (Math.PI * 2);
  if (difference > Math.PI) difference -= Math.PI * 2;
  if (difference < -Math.PI) difference += Math.PI * 2;
  return difference;
}

function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

export interface CritterClientOptions {
  fx: CritterFx;
  mascotFx: MascotFx | null;
  viewFactory: CritterViewFactory;
}

export class CritterClient {
  private readonly fx: CritterFx;
  private readonly mascotFx: MascotFx | null;
  private viewFactory: CritterViewFactory;
  private readonly history: SnapshotEntry[] = [];
  private readonly tracks = new Map<number, CritterTrack>();
  /** Critters bagged by an event the interpolated snapshots have not caught up with. */
  private readonly killedAt = new Map<number, number>();
  private disposed = false;

  constructor(options: CritterClientOptions) {
    this.fx = options.fx;
    this.mascotFx = options.mascotFx;
    this.viewFactory = options.viewFactory;
  }

  /** Swaps the view factory (e.g. once the painted models have loaded). */
  setViewFactory(factory: CritterViewFactory): void {
    this.viewFactory = factory;
    for (const track of this.tracks.values()) {
      track.view?.dispose();
      track.view = null;
      track.retryAt = 0;
    }
  }

  onSnapshot(critters: readonly CritterState[], receivedAt: number): void {
    if (this.disposed) return;
    this.history.push({ critters, receivedAt });
    if (this.history.length > HISTORY) this.history.shift();
  }

  /** Reconnect / new welcome: forget everything. */
  reset(): void {
    this.history.length = 0;
    this.killedAt.clear();
    for (const track of this.tracks.values()) track.view?.dispose();
    this.tracks.clear();
  }

  private track(state: CritterState, now: number): CritterTrack {
    let track = this.tracks.get(state.id);
    if (!track || track.species !== state.species) {
      track?.view?.dispose();
      track = {
        id: state.id,
        species: state.species,
        view: null,
        retryAt: 0,
        visible: false,
        lastPosition: { ...state.position },
        lastBehaviour: state.behaviour,
        lastY: state.position.y,
        nextCluckAt: now + 2000 + Math.random() * 9000,
        lastPanicAt: 0,
        // Every hen keeps her own voice.
        pitch: 0.9 + ((state.id * 0.137) % 0.24),
        lastPose: null,
        popUntil: 0,
      };
      this.tracks.set(state.id, track);
    }
    if (!track.view && now >= track.retryAt) {
      track.view = this.viewFactory(state.species, state.id);
      if (!track.view) track.retryAt = now + VIEW_RETRY_MS;
      // A view made for a critter that is currently dead starts hidden.
      else track.view.setVisible(track.visible);
    }
    return track;
  }

  update(delta: number, now: number, listener: Vec3 | null): void {
    if (this.disposed) return;
    this.fx.update(delta);
    const latest = this.history[this.history.length - 1];
    if (!latest) return;
    const renderTime = now - INTERPOLATION_DELAY_MS;
    let older = this.history[0] ?? latest;
    let newer = latest;
    for (const entry of this.history) {
      if (entry.receivedAt <= renderTime) older = entry;
      if (entry.receivedAt >= renderTime) {
        newer = entry;
        break;
      }
    }
    const span = newer.receivedAt - older.receivedAt;
    const t = span > 0 ? Math.min(1, Math.max(0, (renderTime - older.receivedAt) / span)) : 1;

    for (const state of newer.critters) {
      const track = this.track(state, now);
      const previous = older.critters.find((entry) => entry.id === state.id);
      let position = state.position;
      let yaw = state.yaw;
      let speed = state.speed;
      let alive = state.alive;
      // Glide between two live samples; a death or a respawn (teleport) snaps to the newer one.
      if (previous && previous.alive && state.alive && distance(previous.position, state.position) < TELEPORT_DISTANCE) {
        position = {
          x: lerp(previous.position.x, state.position.x, t),
          y: lerp(previous.position.y, state.position.y, t),
          z: lerp(previous.position.z, state.position.z, t),
        };
        yaw = previous.yaw + shortestAngle(previous.yaw, state.yaw) * t;
        speed = lerp(previous.speed, state.speed, t);
      }

      const killed = this.killedAt.get(state.id);
      if (killed !== undefined) {
        // The event beats the delayed interpolation: keep it gone until the
        // snapshots agree, then let the alive flag decide again.
        if (!state.alive || now - killed > 3000) this.killedAt.delete(state.id);
        else alive = false;
      }

      const verticalSpeed = delta > 0 ? (position.y - track.lastY) / delta : 0;
      track.lastY = position.y;
      if (alive !== track.visible) {
        track.visible = alive;
        if (alive) {
          // Respawn: show the view again (this also resets a cut-off pop).
          track.popUntil = 0;
          track.view?.setVisible(true);
        } else if (track.popUntil === 0) {
          // A death seen only through the snapshots: no pop, hide at once.
          track.view?.setVisible(false);
        }
      }
      if (alive) {
        const pose: CritterPose = {
          position,
          yaw,
          speed,
          behaviour: state.behaviour,
          airborne: state.airborne,
          verticalSpeed,
        };
        track.lastPose = pose;
        track.view?.update(delta, pose);
        this.playVoice(track, state.behaviour, position, listener, now);
      } else if (track.popUntil > 0) {
        this.tickPop(track, delta, now);
      }
      track.lastPosition = { ...position };
      track.lastBehaviour = state.behaviour;
    }
  }

  /**
   * Keeps a death pop running on the hen's last pose until the view hides
   * itself; after the guard time the client hides it regardless.
   */
  private tickPop(track: CritterTrack, delta: number, now: number): void {
    if (now >= track.popUntil || !track.lastPose) {
      track.popUntil = 0;
      track.view?.setVisible(false);
      return;
    }
    track.view?.update(delta, { ...track.lastPose, speed: 0, verticalSpeed: 0 });
  }

  private playVoice(track: CritterTrack, behaviour: CritterBehaviour, position: Vec3, listener: Vec3 | null, now: number): void {
    const near = listener ? distance(listener, position) : Number.POSITIVE_INFINITY;
    if (behaviour === 'flee' && track.lastBehaviour !== 'flee') {
      if (near < PANIC_RANGE && now - track.lastPanicAt > 1200) {
        track.lastPanicAt = now;
        audio.playHenPanic(position, track.pitch);
      }
      // A panicking hen does not cluck for a moment afterwards.
      track.nextCluckAt = Math.max(track.nextCluckAt, now + 2500);
      return;
    }
    if (behaviour === 'flee' || now < track.nextCluckAt) return;
    // Sparse: every 5–14 s per hen, a little more often while pecking.
    track.nextCluckAt = now + (behaviour === 'peck' ? 4000 : 5500) + Math.random() * 8500;
    if (near < CLUCK_RANGE) audio.playHenCluck(position, track.pitch);
  }

  /** CRITTER_KILLED: feathers, "BOK!", the squawk and a kill-feed line. */
  handleKill(event: GameEvent, context: CritterKillContext, now = performance.now()): void {
    if (this.disposed) return;
    const { species, weaponId } = readCritterKillValue(event.paramValue);
    const track = this.tracks.get(event.targetId);
    const groundY = track?.lastPosition.y ?? 0;
    const position: Vec3 = { x: event.paramX / 10, y: groundY, z: event.paramZ / 10 };
    if (track && distance(track.lastPosition, position) < 4) position.y = track.lastPosition.y;
    this.killedAt.set(event.targetId, now);
    if (track) {
      if (track.visible && track.view) {
        // The pop is ticked by update() until it ends (or the guard hides it).
        track.view.pop();
        track.popUntil = now + CRITTER_POP_GUARD_MS;
      } else {
        track.popUntil = 0;
        track.view?.setVisible(false);
      }
      track.visible = false;
    }

    this.fx.featherBurst(position);
    this.mascotFx?.burst('milk', position, 7, 1.5, 0.3);
    this.mascotFx?.popup('comic.bok.text', { x: position.x, y: position.y + 0.9, z: position.z }, 'gold', 1.15);
    audio.playHenSquawk(position, track?.pitch ?? 1);

    const killer = context.profiles.get(event.actorId);
    pushKillFeed({
      killerId: event.actorId,
      killerName: killer?.displayName ?? '',
      victimId: 0,
      victimName: '',
      weaponId,
      headshot: false,
      at: now,
      ...(killer ? { killerFaction: killer.faction } : {}),
      critter: species ?? 'hen',
    });
    if (event.actorId !== 0 && event.actorId === context.localId) {
      showHitMarker(false, false);
      audio.playHitMarker(false, false);
      showComicPop('comic.bok.text');
    }
  }

  /** Last rendered (interpolated) position of a living critter, or null. */
  renderedPosition(id: number): Vec3 | null {
    const track = this.tracks.get(id);
    return track && track.visible ? track.lastPosition : null;
  }

  /** DEV probe data. */
  debugInfo(): Record<string, unknown> {
    const latest = this.history[this.history.length - 1]?.critters ?? [];
    return {
      critters: latest.map((critter) => ({
        id: critter.id,
        half: critter.half,
        alive: critter.alive,
        behaviour: critter.behaviour,
        position: critter.position,
        view: this.tracks.get(critter.id)?.view !== null && this.tracks.get(critter.id)?.view !== undefined,
        visible: this.tracks.get(critter.id)?.visible ?? false,
      })),
      feathers: this.fx.activeFeathers,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const track of this.tracks.values()) track.view?.dispose();
    this.tracks.clear();
    this.history.length = 0;
    this.fx.dispose();
  }
}
