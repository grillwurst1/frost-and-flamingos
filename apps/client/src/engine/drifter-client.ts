import {
  CLASS_STATS,
  DRIFTER_AURA,
  classStatsFor,
  drifterFormForFaction,
  type DrifterForm,
  type Faction,
  type PlayerState,
  type Vec3,
  type WorldSnapshot,
} from '@frost-and-flamingos/shared';
import { audio } from '../audio/synth';
import type { AvatarView } from '../rendering/avatar';
import type { DrifterFx } from '../rendering/drifter-fx';

/**
 * Client side of the drifter class: everything cosmetic that follows from the
 * authoritative snapshot. It lays the aura ring under friendly drifters,
 * sends music-box notes / coral sparkles and cocktails to the teammates the
 * server reports as healed, plays her lullaby to nearby listeners, triggers
 * her beckon/cheer when she starts healing someone, and works out the pose
 * extras her view needs (whom to stare at, how much someone overlaps her).
 */

/** Head turns toward the nearest enemy within this range (creepy stare). */
const STARE_RANGE = 15;
/** The lullaby is only played to listeners this close (the panner never cuts off). */
const HUM_RANGE = 12;
/** Interpolated positions lag the server a little: allow some slack on the radius. */
const AURA_SLACK = 1;
/** Shortest gap between two healing gestures of one drifter (s). */
const GESTURE_COOLDOWN = 4;

/**
 * An original lullaby for the music box, A minor, as semitones above A4
 * (null = rest). Two four-bar phrases; the box slows down at each phrase end.
 */
const LULLABY: ReadonlyArray<number | null> = [
  7, 12, 15, 14, 12, 7, 8, 7, 5, 7, null, null,
  7, 12, 15, 19, 17, 15, 14, 11, 12, null, null, null,
];
const LULLABY_STEP = 0.42;

interface DrifterState {
  form: DrifterForm;
  step: number;
  stepTimer: number;
  /** Teammates healed by her in the previous frame, with their emission timers. */
  healing: Map<number, number>;
  gestureCooldown: number;
  clinkTimer: number;
}

export interface DrifterFrame {
  snapshot: WorldSnapshot | undefined;
  /** Rendered feet of a player (prediction for the local one, interpolation otherwise). */
  positionOf: (id: number) => Vec3 | null;
  viewFor: (id: number) => AvatarView | null;
  localFaction: Faction;
  listener: Vec3 | null;
}

/** View extras for a drifter: what her head stares at and the pass-through shimmer (0–1). */
export interface DrifterPoseExtras {
  stare: Vec3 | null;
  shimmer: number;
}

/** Drifter views play their healing gesture through this optional method. */
type GesturingView = AvatarView & { gesture?: () => void };

function horizontal(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export class DrifterClient {
  private readonly drifters = new Map<number, DrifterState>();
  private latest: WorldSnapshot | undefined;
  private positionOf: (id: number) => Vec3 | null = () => null;

  constructor(private readonly fx: DrifterFx) {}

  update(delta: number, frame: DrifterFrame): void {
    this.latest = frame.snapshot;
    this.positionOf = frame.positionOf;
    const players = frame.snapshot?.players ?? [];
    const seen = new Set<number>();
    for (const player of players) {
      if (player.classId !== 'drifter' || !player.alive) continue;
      const feet = frame.positionOf(player.id) ?? player.position;
      seen.add(player.id);
      let state = this.drifters.get(player.id);
      const form = drifterFormForFaction(player.faction);
      if (!state || state.form !== form) {
        state = {
          form,
          step: Math.floor(Math.random() * LULLABY.length),
          stepTimer: Math.random() * LULLABY_STEP,
          healing: new Map(),
          gestureCooldown: 0,
          clinkTimer: 0,
        };
        this.drifters.set(player.id, state);
      }
      // Her own team sees the aura radius on the ground.
      if (player.faction === frame.localFaction) this.fx.ring(player.id, form, feet, player.auraActive, delta);
      this.updateSupply(delta, player, feet, state, players, frame);
      this.updateHum(delta, player, feet, state, frame.listener);
    }
    for (const id of this.drifters.keys()) if (!seen.has(id)) this.drifters.delete(id);
    this.fx.update(delta, frame.positionOf);
  }

  /** Teammates this drifter heals right now (the nearest friendly drifter in reach of a flagged teammate). */
  private healedBy(drifter: PlayerState, feet: Vec3, players: readonly PlayerState[], frame: DrifterFrame): PlayerState[] {
    const result: PlayerState[] = [];
    for (const mate of players) {
      if (!mate.alive || !mate.auraHealed || mate.classId === 'drifter' || mate.faction !== drifter.faction) continue;
      const mateFeet = frame.positionOf(mate.id) ?? mate.position;
      const distance = Math.hypot(mateFeet.x - feet.x, mateFeet.y - feet.y, mateFeet.z - feet.z);
      if (distance > DRIFTER_AURA.radius + AURA_SLACK) continue;
      let nearest = true;
      for (const other of players) {
        if (other.id === drifter.id || other.classId !== 'drifter' || !other.alive || other.faction !== drifter.faction) continue;
        const otherFeet = frame.positionOf(other.id) ?? other.position;
        if (Math.hypot(mateFeet.x - otherFeet.x, mateFeet.y - otherFeet.y, mateFeet.z - otherFeet.z) < distance) {
          nearest = false;
          break;
        }
      }
      if (nearest) result.push(mate);
    }
    return result;
  }

  private updateSupply(
    delta: number,
    drifter: PlayerState,
    feet: Vec3,
    state: DrifterState,
    players: readonly PlayerState[],
    frame: DrifterFrame,
  ): void {
    state.gestureCooldown = Math.max(0, state.gestureCooldown - delta);
    state.clinkTimer = Math.max(0, state.clinkTimer - delta);
    const healed = this.healedBy(drifter, feet, players, frame);
    let started = false;
    const next = new Map<number, number>();
    for (const mate of healed) {
      const previous = state.healing.get(mate.id);
      if (previous === undefined) started = true;
      let timer = (previous ?? 0) - delta;
      const mateFeet = frame.positionOf(mate.id) ?? mate.position;
      if (state.form === 'mountain_girl') {
        if (timer <= 0) {
          this.fx.note(feet, mate.id);
          timer = 0.5 + Math.random() * 0.25;
        }
      } else {
        this.fx.cocktail(mate.id);
        if (timer <= 0) {
          this.fx.sparkle(mateFeet);
          timer = 0.16 + Math.random() * 0.1;
        }
      }
      next.set(mate.id, timer);
    }
    state.healing = next;
    if (started && state.gestureCooldown <= 0) {
      // Call_Gesture (beckon) for the mountain girl, Cheer for the beach girl.
      const view = frame.viewFor(drifter.id) as GesturingView | null;
      view?.gesture?.();
      state.gestureCooldown = GESTURE_COOLDOWN;
    }
    if (state.form === 'beach_girl' && healed.length > 0 && state.clinkTimer <= 0 && frame.listener) {
      if (horizontal(feet, frame.listener) <= HUM_RANGE) {
        audio.playCocktailClink({ x: feet.x, y: feet.y + 1.2, z: feet.z }, 0.045);
      }
      state.clinkTimer = 1.6 + Math.random() * 0.6;
    }
  }

  /** The Creepy Mountain Girl's music box: always faintly, a little louder while she heals. */
  private updateHum(delta: number, drifter: PlayerState, feet: Vec3, state: DrifterState, listener: Vec3 | null): void {
    if (state.form !== 'mountain_girl') return;
    state.stepTimer -= delta;
    if (state.stepTimer > 0) return;
    const index = state.step % LULLABY.length;
    const semitone = LULLABY[index];
    state.step += 1;
    // The box winds down at each phrase end.
    const phraseEnd = (index + 1) % 12 >= 9;
    state.stepTimer += LULLABY_STEP * (phraseEnd ? 1.35 : 1) * (0.97 + Math.random() * 0.06);
    if (semitone === null || semitone === undefined || !listener) return;
    if (Math.hypot(feet.x - listener.x, feet.y - listener.y, feet.z - listener.z) > HUM_RANGE) return;
    const frequency = 440 * 2 ** (semitone / 12) * (1 + (Math.random() - 0.5) * 0.006);
    audio.playMusicBoxNote({ x: feet.x, y: feet.y + 1.25, z: feet.z }, frequency, drifter.auraActive ? 0.06 : 0.035);
  }

  /** Stare target (nearest enemy head within 15 m) and the overlap shimmer for a drifter's view. */
  poseFor(id: number, feet: Vec3, faction: Faction): DrifterPoseExtras {
    let stare: Vec3 | null = null;
    let nearestEnemy = STARE_RANGE;
    let shimmer = 0;
    const ownRadius = CLASS_STATS.drifter.radius;
    for (const player of this.latest?.players ?? []) {
      if (player.id === id || !player.alive) continue;
      const other = this.positionOf(player.id) ?? player.position;
      const distance = horizontal(feet, other);
      if (player.faction !== faction && player.classId !== 'drifter') {
        const full = Math.hypot(distance, other.y - feet.y);
        if (full < nearestEnemy) {
          nearestEnemy = full;
          const height = classStatsFor(player.classId, player.faction).height;
          stare = { x: other.x, y: other.y + height * 0.9, z: other.z };
        }
      }
      // Someone walking through her: a brief ghostly flicker.
      const reach = ownRadius + classStatsFor(player.classId, player.faction).radius;
      if (distance < reach && Math.abs(other.y - feet.y) < 1.6) shimmer = Math.max(shimmer, 1 - distance / reach);
    }
    return { stare, shimmer };
  }

  dispose(): void {
    this.drifters.clear();
    this.fx.dispose();
  }
}
