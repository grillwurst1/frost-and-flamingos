/**
 * Client side of Climate Conquest: mirrors the authoritative conquest block
 * of each snapshot into the HUD stores and the tower visuals, turns tower
 * events into feed lines, comic pops and stings, plays the round-end music
 * cue, and tracks which capture zone the local (predicted) player stands in.
 * Purely presentational: the client never decides a capture.
 */
import type { Material } from '@babylonjs/core/Materials/material';
import type { Scene } from '@babylonjs/core/scene';
import {
  CONQUEST_TOWERS,
  SPAWN_PROTECTION_SECONDS,
  captureZoneIndexAt,
  classCapabilities,
  type ClassId,
  type ConquestSnapshot,
  type Faction,
  type GameEvent,
  type RoundPhase,
  type Vec3,
  type WorldSnapshot,
} from '@frost-and-flamingos/shared';
import { audio } from '../audio/synth';
import type { MapVisuals } from '../rendering/map';
import { TowerStateView, type GroundProbe } from '../rendering/tower-state';
import {
  conquest,
  objectiveFeed,
  pruneObjectiveFeed,
  pushObjectiveFeed,
  resetConquestUi,
  spawnProtected,
} from '../state/conquest';
import { notify, showComicPop, updateConnection } from '../state/game';

export interface ConquestLocal {
  id: number | null;
  faction: Faction;
  classId: ClassId;
}

/** Pads glow only for spawns the client sees within this long of the event. */
const HALO_MATCH_MS = 1200;

export class ConquestClient {
  private readonly view: TowerStateView;
  private latest: ConquestSnapshot | null = null;
  private lastPhase: RoundPhase | null = null;
  private lastRound = 0;
  private localZone = -1;
  private localCanCapture = true;
  private protectedUntil = 0;
  private lastPruneAt = 0;
  private readonly pendingHalos = new Map<number, number>();

  constructor(scene: Scene, visuals: MapVisuals, toonMaterial: Material, probe: GroundProbe) {
    this.view = new TowerStateView(scene, visuals, toonMaterial, probe);
  }

  onSnapshot(snapshot: WorldSnapshot, local: ConquestLocal): void {
    const state = snapshot.conquest;
    this.latest = state;
    this.view.setState(state.towers);
    this.localCanCapture = classCapabilities(local.classId).canCapture;
    updateConnection({
      towerProgress: [0, 1, 2].map((index) => Math.abs(state.towers[index]?.control ?? 0)) as [number, number, number],
    });
    conquest.set({ ...state, localZone: this.localZone, localCanCapture: this.localCanCapture, synced: true });

    if (this.lastPhase === 'live' && state.phase === 'ended') {
      audio.playRoundEnd(state.winner === null ? 'draw' : state.winner === local.faction ? 'victory' : 'defeat');
    }
    if (state.phase === 'ended') {
      // The results bed owns the music for the whole intermission (a death cue may not replace it).
      audio.setRoundCue('ended');
    } else if (this.lastPhase === 'ended') {
      audio.setRoundCue(null);
      objectiveFeed.set([]);
      if (state.round !== this.lastRound) notify('conquest.round.started', { round: state.round });
    }
    this.lastPhase = state.phase;
    this.lastRound = state.round;

    if (this.pendingHalos.size > 0) {
      const now = performance.now();
      for (const [id, at] of this.pendingHalos) {
        const player = snapshot.players.find((entry) => entry.id === id);
        if (player?.alive) {
          this.view.spawnHalo(player.position, player.faction);
          this.pendingHalos.delete(id);
        } else if (now - at > HALO_MATCH_MS) {
          this.pendingHalos.delete(id);
        }
      }
    }
  }

  /** TURRET_CAPTURED: paramX tower index, paramZ 1 captured / 2 neutralised, paramValue faction code + 1. */
  onTowerEvent(event: GameEvent, localFaction: Faction): void {
    const index = event.paramX;
    const tower = CONQUEST_TOWERS[index];
    if (!tower) return;
    const faction: Faction = event.paramValue === 1 ? 'alpine' : 'lagoon';
    const neutralised = event.paramZ === 2;
    pushObjectiveFeed({ kind: neutralised ? 'neutralised' : 'captured', towerIndex: index, faction, at: performance.now() });
    const friendly = faction === localFaction;
    audio.playTowerCapture(friendly, neutralised);
    if (this.localZone !== index) return;
    if (friendly && !neutralised) showComicPop('conquest.pop.captured');
    else if (!friendly && neutralised) showComicPop('conquest.pop.lost');
  }

  /** PLAYER_RESPAWNED: glow the pad once the spawn shows up in a snapshot; protect-tag the local player. */
  onRespawn(playerId: number, isLocal: boolean): void {
    const now = performance.now();
    this.pendingHalos.set(playerId, now);
    if (isLocal) {
      this.protectedUntil = now + SPAWN_PROTECTION_SECONDS * 1000;
      spawnProtected.set(true);
    }
  }

  /** Per frame: local zone membership (predicted feet), visuals and feed expiry. */
  update(delta: number, localFeet: Vec3 | null, alive: boolean): void {
    const now = performance.now();
    const zone = alive && localFeet ? captureZoneIndexAt(localFeet) : -1;
    if (zone !== this.localZone) {
      this.localZone = zone;
      conquest.update((state) => ({ ...state, localZone: zone }));
    }
    if (this.protectedUntil > 0 && now >= this.protectedUntil) {
      this.protectedUntil = 0;
      spawnProtected.set(false);
    }
    if (now - this.lastPruneAt > 250) {
      this.lastPruneAt = now;
      pruneObjectiveFeed(now);
    }
    this.view.update(delta);
  }

  /** Back to the menu: drop transient HUD state (the round state stays authoritative). */
  clearUi(): void {
    this.protectedUntil = 0;
    this.pendingHalos.clear();
    this.localZone = -1;
    resetConquestUi();
  }

  get roundPhase(): RoundPhase {
    return this.latest?.phase ?? 'live';
  }

  dispose(): void {
    this.view.dispose();
  }
}
