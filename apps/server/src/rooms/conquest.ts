/**
 * Climate Conquest round simulation: tower capture, vacation tickets, the
 * weather balance and the live → results → reset round flow. Pure fixed-step
 * logic with integer units (no Rapier, no wall clock, no randomness), so the
 * same presence sequence always produces the same round. MatchRoom feeds it
 * the capture-zone head counts once per physics tick and reports deaths.
 */
import {
  BLEED_TICKS_PER_TICKET,
  CONQUEST_RULES,
  CONQUEST_TOWERS,
  CONTROL_FULL,
  INTERMISSION_TICKS,
  PHYSICS_TICK_RATE,
  RECOVER_RATE_PER_TICK,
  ROUND_START_TOWERS,
  ROUND_TICKS,
  WEATHER_FULL,
  captureRatePerTick,
  classCapabilities,
  controlSign,
  insideCaptureZone,
  neutraliseRatePerTick,
  type ClassId,
  type ConquestSnapshot,
  type Faction,
  type RoundEndReason,
  type RoundPhase,
  type TowerControlState,
  type TowerId,
  type Vec3,
} from '@frost-and-flamingos/shared';

/** Capture-capable living players of each side inside one tower zone. */
export interface TowerPresence {
  alpine: number;
  lagoon: number;
}

export interface CaptureCandidate {
  readonly faction: Faction;
  readonly classId: ClassId;
  readonly alive: boolean;
  readonly position: Vec3;
}

export type CapturePredicate = (classId: ClassId) => boolean;

/** Classes flagged `canCapture: false` (the drifter) never tip a zone. */
export const classMayCapture: CapturePredicate = (classId) => classCapabilities(classId).canCapture;

/** Head counts per tower (wire order A, B, C). */
export function countTowerPresence(
  candidates: Iterable<CaptureCandidate>,
  canCapture: CapturePredicate = classMayCapture,
): TowerPresence[] {
  const presence: TowerPresence[] = CONQUEST_TOWERS.map(() => ({ alpine: 0, lagoon: 0 }));
  for (const candidate of candidates) {
    if (!candidate.alive || !canCapture(candidate.classId)) continue;
    for (let index = 0; index < CONQUEST_TOWERS.length; index += 1) {
      const tower = CONQUEST_TOWERS[index];
      const count = presence[index];
      if (!tower || !count || !insideCaptureZone(tower, candidate.position)) continue;
      count[candidate.faction] += 1;
      break;
    }
  }
  return presence;
}

export type ConquestEvent =
  | { type: 'captured'; tower: TowerId; index: number; faction: Faction }
  | { type: 'neutralised'; tower: TowerId; index: number; faction: Faction; previousOwner: Faction }
  | { type: 'round_ended'; winner: Faction | null; reason: RoundEndReason; round: number }
  | { type: 'round_reset'; round: number };

interface TowerRuntime {
  readonly id: TowerId;
  owner: Faction | null;
  /** Signed integer control in −CONTROL_FULL … +CONTROL_FULL. */
  control: number;
  pushing: Faction | null;
  contested: boolean;
  alpine: number;
  lagoon: number;
}

export interface ConquestStatus {
  round: number;
  phase: RoundPhase;
  winner: Faction | null;
  reason: RoundEndReason | null;
  secondsLeft: number;
  tickets: Record<Faction, number>;
  weatherBalance: number;
  roundsCompleted: number;
  ownerChanges: number;
  towers: { id: TowerId; owner: Faction | null; control: number; contested: boolean; alpine: number; lagoon: number }[];
}

function startOwner(id: TowerId): Faction | null {
  if (ROUND_START_TOWERS.alpine.includes(id)) return 'alpine';
  if (ROUND_START_TOWERS.lagoon.includes(id)) return 'lagoon';
  return null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export class ClimateConquest {
  private readonly towers: TowerRuntime[] = CONQUEST_TOWERS.map((tower) => ({
    id: tower.id,
    owner: null,
    control: 0,
    pushing: null,
    contested: false,
    alpine: 0,
    lagoon: 0,
  }));
  private readonly tickets: Record<Faction, number> = { alpine: 0, lagoon: 0 };
  private readonly bleedTicks: Record<Faction, number> = { alpine: 0, lagoon: 0 };
  private weatherUnits = 0;
  private phaseValue: RoundPhase = 'live';
  private winnerValue: Faction | null = null;
  private reasonValue: RoundEndReason | null = null;
  private roundValue = 1;
  private elapsedTicks = 0;
  private intermissionTicks = 0;
  private roundsCompleted = 0;
  private ownerChanges = 0;

  constructor() {
    this.resetRound(1);
  }

  get phase(): RoundPhase {
    return this.phaseValue;
  }

  get isLive(): boolean {
    return this.phaseValue === 'live';
  }

  get round(): number {
    return this.roundValue;
  }

  get winner(): Faction | null {
    return this.winnerValue;
  }

  /** −1 alpine ice storm … +1 tropical heat (game-decisions 11.5). */
  get weatherBalance(): number {
    return this.weatherUnits / WEATHER_FULL;
  }

  ticketsOf(faction: Faction): number {
    return this.tickets[faction];
  }

  heldTowers(faction: Faction): TowerId[] {
    return this.towers.filter((tower) => tower.owner === faction).map((tower) => tower.id);
  }

  isTowerHeldBy(tower: TowerId, faction: Faction): boolean {
    return this.towers.some((entry) => entry.id === tower && entry.owner === faction);
  }

  ownerOf(tower: TowerId): Faction | null {
    return this.towers.find((entry) => entry.id === tower)?.owner ?? null;
  }

  /** A death costs the victim's team its ticket while the round is live. Returns true when charged. */
  recordDeath(faction: Faction): boolean {
    if (!this.isLive) return false;
    this.tickets[faction] = Math.max(0, this.tickets[faction] - CONQUEST_RULES.deathTicketCost);
    return true;
  }

  /** One fixed physics tick. `presence` is in wire order (A, B, C). */
  step(presence: readonly TowerPresence[]): ConquestEvent[] {
    const events: ConquestEvent[] = [];
    if (!this.isLive) {
      this.intermissionTicks = Math.max(0, this.intermissionTicks - 1);
      if (this.intermissionTicks === 0) {
        this.resetRound(this.roundValue + 1);
        events.push({ type: 'round_reset', round: this.roundValue });
      }
      return events;
    }

    this.elapsedTicks += 1;
    this.towers.forEach((tower, index) => {
      this.stepTower(tower, index, presence[index] ?? { alpine: 0, lagoon: 0 }, events);
    });

    const alpineHeld = this.heldCount('alpine');
    const lagoonHeld = this.heldCount('lagoon');
    this.weatherUnits = clamp(this.weatherUnits + (lagoonHeld - alpineHeld), -WEATHER_FULL, WEATHER_FULL);
    this.bleed('alpine', lagoonHeld - alpineHeld);
    this.bleed('lagoon', alpineHeld - lagoonHeld);

    const alpineOut = this.tickets.alpine <= 0;
    const lagoonOut = this.tickets.lagoon <= 0;
    if (alpineOut || lagoonOut) {
      this.endRound(alpineOut && lagoonOut ? null : alpineOut ? 'lagoon' : 'alpine', 'tickets', events);
    } else if (this.elapsedTicks >= ROUND_TICKS) {
      const lead = this.tickets.alpine - this.tickets.lagoon;
      this.endRound(lead > 0 ? 'alpine' : lead < 0 ? 'lagoon' : null, 'time', events);
    }
    return events;
  }

  snapshot(): ConquestSnapshot {
    const [a, b, c] = this.towers.map((tower): TowerControlState => ({
      owner: tower.owner,
      control: tower.control / CONTROL_FULL,
      pushing: tower.pushing,
      contested: tower.contested,
      alpine: tower.alpine,
      lagoon: tower.lagoon,
    }));
    if (!a || !b || !c) throw new Error('Climate Conquest needs exactly three towers.');
    return {
      towers: [a, b, c],
      phase: this.phaseValue,
      winner: this.winnerValue,
      reason: this.reasonValue,
      round: this.roundValue,
      secondsLeft: this.secondsLeft(),
    };
  }

  status(): ConquestStatus {
    return {
      round: this.roundValue,
      phase: this.phaseValue,
      winner: this.winnerValue,
      reason: this.reasonValue,
      secondsLeft: Math.round(this.secondsLeft() * 10) / 10,
      tickets: { ...this.tickets },
      weatherBalance: Math.round(this.weatherBalance * 1000) / 1000,
      roundsCompleted: this.roundsCompleted,
      ownerChanges: this.ownerChanges,
      towers: this.towers.map((tower) => ({
        id: tower.id,
        owner: tower.owner,
        control: Math.round((tower.control / CONTROL_FULL) * 1000) / 1000,
        contested: tower.contested,
        alpine: tower.alpine,
        lagoon: tower.lagoon,
      })),
    };
  }

  // -------------------------------------------------------------------------
  // Local playtest tooling (FF_DEV_TOOLS): stage a tower or end the round.
  // -------------------------------------------------------------------------

  /** Sets a tower's owner (full control) or neutral, with an optional partial control. */
  devSetTower(tower: TowerId, owner: Faction | null, control?: number): boolean {
    const entry = this.towers.find((candidate) => candidate.id === tower);
    if (!entry) return false;
    entry.owner = owner;
    const full = owner ? controlSign(owner) * CONTROL_FULL : 0;
    entry.control =
      control === undefined || !Number.isFinite(control)
        ? full
        : Math.round(clamp(control, -1, 1) * CONTROL_FULL);
    if (owner && Math.sign(entry.control) !== controlSign(owner)) entry.control = full;
    return true;
  }

  devSetTickets(faction: Faction, tickets: number): boolean {
    if (!Number.isFinite(tickets)) return false;
    this.tickets[faction] = Math.max(0, Math.min(65535, Math.round(tickets)));
    return true;
  }

  // -------------------------------------------------------------------------

  private secondsLeft(): number {
    const ticks = this.isLive ? Math.max(0, ROUND_TICKS - this.elapsedTicks) : this.intermissionTicks;
    return ticks / PHYSICS_TICK_RATE;
  }

  private heldCount(faction: Faction): number {
    let count = 0;
    for (const tower of this.towers) if (tower.owner === faction) count += 1;
    return count;
  }

  /** The side holding fewer towers loses a ticket per BLEED_TICKS_PER_TICKET per tower of deficit. */
  private bleed(faction: Faction, deficit: number): void {
    if (deficit <= 0) {
      this.bleedTicks[faction] = 0;
      return;
    }
    this.bleedTicks[faction] += deficit;
    while (this.bleedTicks[faction] >= BLEED_TICKS_PER_TICKET) {
      this.bleedTicks[faction] -= BLEED_TICKS_PER_TICKET;
      this.tickets[faction] = Math.max(0, this.tickets[faction] - 1);
    }
  }

  private stepTower(tower: TowerRuntime, index: number, presence: TowerPresence, events: ConquestEvent[]): void {
    const alpine = Math.max(0, presence.alpine);
    const lagoon = Math.max(0, presence.lagoon);
    tower.alpine = alpine;
    tower.lagoon = lagoon;
    tower.contested = alpine > 0 && lagoon > 0;

    if (alpine === lagoon) {
      tower.pushing = null;
      // An equal standoff stalls; an empty zone drifts back to its resting state.
      if (alpine === 0) this.recover(tower);
      return;
    }

    const pusher: Faction = alpine > lagoon ? 'alpine' : 'lagoon';
    const advantage = Math.abs(alpine - lagoon);
    const sign = controlSign(pusher);
    const current = tower.control;
    // Defenders on a fully held tower move nothing: it is secured, not "being pushed".
    tower.pushing = current === sign * CONTROL_FULL ? null : pusher;
    const undoing = current !== 0 && Math.sign(current) !== sign;
    let next = current + sign * (undoing ? neutraliseRatePerTick(advantage) : captureRatePerTick(advantage));

    if (undoing && Math.sign(next) !== Math.sign(current)) {
      // Reached or crossed neutral this tick: the flag comes down, the raise starts next tick.
      next = 0;
      const previousOwner = tower.owner;
      if (previousOwner) {
        tower.owner = null;
        this.ownerChanges += 1;
        events.push({ type: 'neutralised', tower: tower.id, index, faction: pusher, previousOwner });
      }
    }

    tower.control = clamp(next, -CONTROL_FULL, CONTROL_FULL);
    if (Math.abs(tower.control) === CONTROL_FULL && tower.owner !== pusher) {
      tower.owner = pusher;
      this.ownerChanges += 1;
      events.push({ type: 'captured', tower: tower.id, index, faction: pusher });
    }
  }

  private recover(tower: TowerRuntime): void {
    const target = tower.owner ? controlSign(tower.owner) * CONTROL_FULL : 0;
    if (tower.control < target) tower.control = Math.min(target, tower.control + RECOVER_RATE_PER_TICK);
    else if (tower.control > target) tower.control = Math.max(target, tower.control - RECOVER_RATE_PER_TICK);
  }

  private endRound(winner: Faction | null, reason: RoundEndReason, events: ConquestEvent[]): void {
    this.phaseValue = 'ended';
    this.winnerValue = winner;
    this.reasonValue = reason;
    this.intermissionTicks = INTERMISSION_TICKS;
    this.roundsCompleted += 1;
    // The intermission is a ceasefire: no zone shows a fight or a head count.
    for (const tower of this.towers) {
      tower.pushing = null;
      tower.contested = false;
      tower.alpine = 0;
      tower.lagoon = 0;
    }
    events.push({ type: 'round_ended', winner, reason, round: this.roundValue });
  }

  /** Round start: tickets, round-start towers, balanced weather, fresh timer. */
  private resetRound(round: number): void {
    this.roundValue = round;
    this.phaseValue = 'live';
    this.winnerValue = null;
    this.reasonValue = null;
    this.elapsedTicks = 0;
    this.intermissionTicks = 0;
    this.weatherUnits = 0;
    this.tickets.alpine = CONQUEST_RULES.startTickets;
    this.tickets.lagoon = CONQUEST_RULES.startTickets;
    this.bleedTicks.alpine = 0;
    this.bleedTicks.lagoon = 0;
    for (const tower of this.towers) {
      tower.owner = startOwner(tower.id);
      tower.control = tower.owner ? controlSign(tower.owner) * CONTROL_FULL : 0;
      tower.pushing = null;
      tower.contested = false;
      tower.alpine = 0;
      tower.lagoon = 0;
    }
  }
}
