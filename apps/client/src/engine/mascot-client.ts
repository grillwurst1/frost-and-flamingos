import {
  COCONUT_TUNING,
  MASCOT_SKILLS,
  SKILLS,
  classStatsFor,
  mascotFormOf,
  surfaceTagAt,
  type CharacterBody,
  type Faction,
  type GameEvent,
  type MascotForm,
  type MascotMotorEvent,
  type PlayerProfile,
  type PlayerState,
  type TranslationKey,
  type Vec3,
  type WorldSnapshot,
} from '@frost-and-flamingos/shared';
import { audio } from '../audio/synth';
import { isMascotView, type AvatarView } from '../rendering/avatar';
import { puffKindForSurface, type MascotFx, type PopupStyle } from '../rendering/mascot-fx';
import { showComicPop } from '../state/game';
import { mascotHud } from '../state/mascot';
import { COCONUT_CAMERA, COW_CAMERA, HUMAN_CAMERA, type CameraProfile } from './camera-rig';

/** What the mascot layer needs to know about the world for one event. */
export interface MascotEventContext {
  localId: number | null;
  profiles: ReadonlyMap<number, PlayerProfile>;
  latest: WorldSnapshot | undefined;
  viewFor(id: number): AvatarView | null;
}

interface StrideState {
  hoof: number;
  bell: number;
  knock: number;
}

const HEAD_HEIGHT: Record<MascotForm | 'human', number> = { cow: 1.9, coconut: 1.75, human: 2.1 };

function decimetres(value: number): number {
  return value / 10;
}

export function cameraProfileFor(form: MascotForm | null): CameraProfile {
  return form === 'cow' ? COW_CAMERA : form === 'coconut' ? COCONUT_CAMERA : HUMAN_CAMERA;
}

/**
 * Client glue for the mascot class: event feedback, instant local feedback
 * from the predicted motor, stride foley, dizzy stars and the HUD store.
 */
export class MascotClient {
  private readonly strides = new Map<number, StrideState>();
  /** Players currently dazed, so the DIZZY! popup plays once per daze. */
  private readonly dazed = new Set<number>();

  constructor(private readonly fx: MascotFx) {}

  formOf(profile: PlayerProfile | undefined, state?: PlayerState): MascotForm | null {
    if (profile) return mascotFormOf(profile.cosmetics.classId, profile.faction);
    if (state) return mascotFormOf(state.classId, state.faction);
    return null;
  }

  private popup(key: TranslationKey, at: Vec3, style: PopupStyle, size = 1.4, rise = 1.9): void {
    this.fx.popup(key, { x: at.x, y: at.y + rise, z: at.z }, style, size);
  }

  /** Handles mascot game events. Returns true when the event was consumed. */
  handleEvent(event: GameEvent, context: MascotEventContext): boolean {
    const players = context.latest?.players ?? [];
    const actor = players.find((player) => player.id === event.actorId);
    const actorProfile = context.profiles.get(event.actorId);
    const form = this.formOf(actorProfile, actor);
    const pitch = actorProfile?.cosmetics.voicePitch ?? 1;
    const local = event.actorId === context.localId;

    switch (event.eventType) {
      case 'MASCOT_RAM': {
        if (!form) return true;
        const victim = players.find((player) => player.id === event.targetId);
        const point = {
          x: decimetres(event.paramX),
          y: victim?.position.y ?? actor?.position.y ?? 0,
          z: decimetres(event.paramZ),
        };
        const friendly = event.paramValue === 0;
        audio.playMascotRam(form, point, friendly, pitch);
        if (friendly) {
          this.popup('mascot.popups.bump', point, 'pink', 0.9, 1.6);
          return true;
        }
        this.popup('mascot.popups.boing', point, 'rainbow', 1.8);
        if (form === 'coconut') {
          this.fx.popup('mascot.popups.tock', { x: point.x + 0.8, y: point.y + 1.1, z: point.z }, 'wood', 1.05);
        }
        this.fx.burst(puffKindForSurface(surfaceTagAt(point.x, point.z, point.y)), point, 10, 3.6, 0.42);
        const attackerView = context.viewFor(event.actorId);
        if (isMascotView(attackerView)) attackerView.react('score');
        const victimView = context.viewFor(event.targetId);
        if (isMascotView(victimView)) victimView.react('hurt');
        if (local || event.targetId === context.localId) showComicPop('mascot.popups.boing');
        return true;
      }
      case 'MASCOT_IMPACT': {
        if (!form || local) return true;
        const point = { x: decimetres(event.paramX), y: actor?.position.y ?? 0, z: decimetres(event.paramZ) };
        this.impactFeedback(form, event.paramValue === 1 ? 'stomp' : 'pound', point);
        return true;
      }
      case 'MASCOT_PUDDLE': {
        const point = { x: decimetres(event.paramX), y: actor?.position.y ?? 0, z: decimetres(event.paramZ) };
        this.fx.puddle(point, SKILLS.milk_splash.radius, event.paramValue / 10);
        this.popup('mascot.popups.splash', point, 'ice', 1.3, 1.4);
        return true;
      }
      case 'SKILL_USED': {
        if (!form) return false;
        if (!local) {
          const at = actor?.position;
          audio.playMascotMove(form, event.paramX, at, pitch);
          if (at) this.moveFeedback(form, event.paramX, at);
        }
        return true;
      }
      default:
        return false;
    }
  }

  private impactFeedback(form: MascotForm, kind: 'stomp' | 'pound', point: Vec3): void {
    const radius = kind === 'stomp' ? SKILLS.hoof_stomp.radius : SKILLS.ground_pound.radius;
    audio.playMascotImpact(form, point);
    this.fx.shockwave(point, radius);
    this.fx.burst(puffKindForSurface(surfaceTagAt(point.x, point.z, point.y)), point, 16, 5, 0.5);
    this.popup(kind === 'stomp' ? 'mascot.popups.stomp' : 'mascot.popups.pound', point, 'gold', 1.5, 1.6);
  }

  private moveFeedback(form: MascotForm, slot: number, at: Vec3): void {
    if (form === 'cow' && slot === 1) this.popup('mascot.popups.moo', at, 'ice', 1.2, 2.2);
    if (form === 'cow' && slot === 3) this.popup('mascot.popups.clang', at, 'gold', 1.5, 2.4);
  }

  /** Instant feedback for the local, predicted mascot (server echoes are skipped). */
  onLocalMotorEvents(events: readonly MascotMotorEvent[], form: MascotForm, pitch: number): void {
    for (const event of events) {
      if (event.type === 'move') {
        audio.playMascotMove(form, event.slot, undefined, pitch);
        this.moveFeedback(form, event.slot, event.position);
      } else if (event.type === 'impact') {
        this.impactFeedback(form, event.kind, event.position);
      } else if (event.type === 'bounce') {
        audio.playCoconutKnock(undefined, Math.min(1, event.speed / 14), pitch);
      }
    }
  }

  /** Mascot victims get a moo or a cracking coconut instead of the scream. */
  playDeath(profile: PlayerProfile | undefined, state: PlayerState | undefined, position?: Vec3): boolean {
    const form = this.formOf(profile, state);
    if (!form) return false;
    audio.playMascotDeath(form, position, profile?.cosmetics.voicePitch ?? 1);
    return true;
  }

  playTaunt(profile: PlayerProfile): boolean {
    const form = this.formOf(profile);
    if (!form) return false;
    audio.playMascotVoice(form, profile.cosmetics.voicePitch);
    return true;
  }

  /**
   * Hoof clops, a cowbell jingle and coconut knocks by distance travelled.
   * `position` undefined = the local player (non-spatial).
   */
  stride(
    id: number,
    form: MascotForm,
    delta: number,
    speed: number,
    grounded: boolean,
    galloping: boolean,
    position?: Vec3,
    at?: Vec3,
  ): void {
    let state = this.strides.get(id);
    if (!state) {
      state = { hoof: 0, bell: 0, knock: 0 };
      this.strides.set(id, state);
    }
    if (!grounded || speed < 0.4) {
      state.hoof = Math.min(state.hoof, 0.3);
      return;
    }
    const travelled = speed * delta;
    const where = at ?? position;
    const surface = where ? surfaceTagAt(where.x, where.z, where.y) : 'grass_mud';
    if (form === 'cow') {
      state.hoof += travelled;
      state.bell += travelled;
      const beat = galloping ? 0.68 : 0.74;
      if (state.hoof >= beat) {
        state.hoof = 0;
        audio.playHoof(position, surface, galloping);
      }
      if (state.bell >= (galloping ? 1.3 : 1.9)) {
        state.bell = 0;
        audio.playCowbell(position, Math.min(0.75, 0.15 + speed * 0.05));
      }
    } else {
      state.knock += travelled;
      if (state.knock >= Math.PI * 0.7 && speed > 1.5) {
        state.knock = 0;
        audio.playCoconutKnock(position, Math.min(0.45, speed * 0.03));
      }
    }
  }

  forget(id: number): void {
    this.strides.delete(id);
    this.dazed.delete(id);
  }

  /** Stars over dazed players and knocked-out mascots, and a popup when a daze starts. */
  dizzy(id: number, position: Vec3, form: MascotForm | null, dazed: boolean, alive: boolean): void {
    const show = (dazed && alive) || (!alive && form !== null);
    if (dazed && alive) {
      if (!this.dazed.has(id)) {
        this.dazed.add(id);
        this.popup('mascot.popups.dazed', position, 'gold', 1.1, HEAD_HEIGHT[form ?? 'human'] + 0.5);
      }
    } else {
      this.dazed.delete(id);
    }
    if (!show) {
      this.fx.setDizzy(id, null);
      return;
    }
    const height = !alive && form === 'cow' ? 1.25 : !alive ? 1.2 : HEAD_HEIGHT[form ?? 'human'];
    this.fx.setDizzy(id, { x: position.x, y: position.y + height, z: position.z });
  }

  /** Publishes the local mascot's status for MascotHud (null clears it). */
  publishHud(
    character: CharacterBody | null,
    state: PlayerState | null,
    faction: Faction,
    activeSlot: 1 | 2 | 3,
  ): void {
    const form = character?.form ?? null;
    if (!character || !form) {
      mascotHud.set(null);
      return;
    }
    const mascot = character.mascotState;
    const moves = MASCOT_SKILLS[form];
    const velocity = character.velocity;
    const speed = Math.hypot(velocity.x, velocity.z);
    const stats = classStatsFor('mascot', faction);
    const cooldowns = character.mascotCooldownSeconds;
    mascotHud.set({
      form,
      hp: state?.hp ?? stats.maxHp,
      maxHp: state?.maxHp ?? stats.maxHp,
      alive: state?.alive ?? true,
      stamina: mascot?.stamina ?? 1,
      exhausted: mascot?.exhausted ?? false,
      galloping: mascot?.galloping ?? false,
      boosting: character.mascotBoosting,
      skidding: mascot?.skidding ?? false,
      pounding: character.mascotPounding,
      speed,
      momentum: Math.min(1, speed / COCONUT_TUNING.turboMaxSpeed),
      moves: [moves[0], moves[1], moves[2]],
      cooldowns,
      cooldownMax: [
        SKILLS[moves[0]].cooldownSeconds,
        SKILLS[moves[1]].cooldownSeconds,
        SKILLS[moves[2]].cooldownSeconds,
      ],
      activeSlot,
      dazed: state?.dazed ?? false,
      slippery: state?.slippery ?? false,
    });
  }
}
