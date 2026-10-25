/**
 * Bots play Climate Conquest: each picks a target tower (enemy, neutral or an
 * own tower under attack, weighted by distance and by how many teammates
 * already go there), routes to it over the waypoint graph and, once inside
 * the zone, walks between the zone's waypoints until the tower is secured.
 * MatchRoom asks for a goal position while a bot has nothing to shoot and
 * whether it is holding a zone (holding bots fight from inside the zone
 * instead of chasing rivals out of it).
 */
import {
  CONQUEST_TOWERS,
  FJORD_MAP,
  oppositeFaction,
  type ConquestSnapshot,
  type Faction,
  type Vec3,
} from '@frost-and-flamingos/shared';

/** Seconds between objective reviews (sooner when the target tower is secured). */
const REVIEW_TICKS = 180;
/** Hold waypoints sit this far inside the capture radius. */
const HOLD_MARGIN = 1.5;
const HOLD_ARRIVAL = 2.6;
/** A bot keeps its current objective unless another scores this much better. */
const STICKINESS = 1.3;

function horizontal(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** Land waypoints inside each zone (wire order A, B, C). */
const HOLD_NODES: Vec3[][] = CONQUEST_TOWERS.map((tower) => {
  const inside = FJORD_MAP.nav.nodes.filter(
    (node) =>
      !node.water &&
      horizontal(node.position, tower.position) <= tower.captureRadius - HOLD_MARGIN &&
      Math.abs(node.position.y - tower.position.y) < 6,
  );
  const nodes = inside.length > 0 ? inside : FJORD_MAP.nav.nodes.filter((node) => !node.water && horizontal(node.position, tower.position) <= tower.captureRadius + 6);
  return nodes.map((node) => ({ ...node.position }));
});

export function holdNodesOf(towerIndex: number): readonly Vec3[] {
  return HOLD_NODES[towerIndex] ?? [];
}

interface BotObjective {
  tower: number;
  nextReviewTick: number;
  lastReviewTick: number;
  holdNode: number;
}

/** A secured target tower is re-reviewed at most this often (no flip-flopping). */
const SECURED_REVIEW_TICKS = 30;

export interface ObjectiveBot {
  readonly id: number;
  readonly faction: Faction;
  readonly position: Vec3;
}

/** True when a tower is safely held by `faction`: owned at full control, nobody pushing it. */
export function towerSecured(state: ConquestSnapshot['towers'][number] | undefined, faction: Faction): boolean {
  if (!state || state.owner !== faction) return false;
  return !state.contested && state.pushing === null && Math.abs(state.control) >= 0.999;
}

export class ConquestBots {
  private readonly memory = new Map<number, BotObjective>();

  forget(botId: number): void {
    this.memory.delete(botId);
  }

  reset(): void {
    this.memory.clear();
  }

  /** Wire index of a bot's current target tower (−1 none). */
  objectiveOf(botId: number): number {
    return this.memory.get(botId)?.tower ?? -1;
  }

  /**
   * Where the bot should walk now: a hold waypoint of its target tower. Picks
   * or reviews the target first. `bots` are all bots (for team spreading).
   */
  goalFor(
    bot: ObjectiveBot,
    towers: ConquestSnapshot['towers'],
    bots: Iterable<ObjectiveBot>,
    tick: number,
    random: () => number,
  ): Vec3 | null {
    let objective = this.memory.get(bot.id);
    const current = objective ? towers[objective.tower] : undefined;
    const securedReview =
      !!objective && towerSecured(current, bot.faction) && tick - objective.lastReviewTick >= SECURED_REVIEW_TICKS;
    if (!objective || tick >= objective.nextReviewTick || securedReview) {
      const tower = this.chooseTower(bot, towers, bots, objective?.tower ?? -1, random);
      if (!objective || objective.tower !== tower) {
        const nodes = holdNodesOf(tower);
        objective = {
          tower,
          nextReviewTick: 0,
          lastReviewTick: tick,
          holdNode: Math.floor(random() * Math.max(1, nodes.length)),
        };
        this.memory.set(bot.id, objective);
      }
      objective.lastReviewTick = tick;
      objective.nextReviewTick = tick + REVIEW_TICKS + Math.floor(random() * 60);
    }
    const nodes = holdNodesOf(objective.tower);
    if (nodes.length === 0) return CONQUEST_TOWERS[objective.tower]?.position ?? null;
    let node = nodes[objective.holdNode % nodes.length];
    // Inside the zone: walk on to another hold waypoint on arrival (a moving target is harder to hit).
    if (node && horizontal(node, bot.position) < HOLD_ARRIVAL && Math.abs(node.y - bot.position.y) < 2.5 && nodes.length > 1) {
      objective.holdNode = (objective.holdNode + 1 + Math.floor(random() * (nodes.length - 1))) % nodes.length;
      node = nodes[objective.holdNode];
    }
    return node ?? null;
  }

  /** Inside its target zone while the tower is not yet secured: fight from the zone. */
  isHolding(bot: ObjectiveBot, towers: ConquestSnapshot['towers']): boolean {
    const objective = this.memory.get(bot.id);
    if (!objective) return false;
    const tower = CONQUEST_TOWERS[objective.tower];
    if (!tower) return false;
    if (horizontal(tower.position, bot.position) > tower.captureRadius) return false;
    if (Math.abs(bot.position.y - tower.position.y) > 8) return false;
    return !towerSecured(towers[objective.tower], bot.faction);
  }

  private chooseTower(
    bot: ObjectiveBot,
    towers: ConquestSnapshot['towers'],
    bots: Iterable<ObjectiveBot>,
    currentTower: number,
    random: () => number,
  ): number {
    const rival = oppositeFaction(bot.faction);
    const crowd = CONQUEST_TOWERS.map(() => 0);
    for (const other of bots) {
      if (other.id === bot.id || other.faction !== bot.faction) continue;
      const index = this.objectiveOf(other.id);
      if (index >= 0) crowd[index] = (crowd[index] ?? 0) + 1;
    }
    // A team that holds more towers garrisons its frontline (the held tower
    // closest to a tower it does not hold) and attacks less eagerly.
    const own = towers.filter((state) => state.owner === bot.faction).length;
    const leading = own > towers.filter((state) => state.owner === rival).length;
    let frontline = -1;
    let frontlineGap = Number.POSITIVE_INFINITY;
    CONQUEST_TOWERS.forEach((tower, index) => {
      if (towers[index]?.owner !== bot.faction) return;
      CONQUEST_TOWERS.forEach((other, otherIndex) => {
        if (towers[otherIndex]?.owner === bot.faction) return;
        const gap = horizontal(tower.position, other.position);
        if (gap < frontlineGap) {
          frontlineGap = gap;
          frontline = index;
        }
      });
    });
    let best = 0;
    let bestScore = Number.NEGATIVE_INFINITY;
    CONQUEST_TOWERS.forEach((tower, index) => {
      const state = towers[index];
      if (!state) return;
      let value: number;
      let crowdWeight = 0.6;
      if (state.owner === rival) value = leading ? 0.7 : 1;
      else if (state.owner === null) value = 1.25;
      else if (!towerSecured(state, bot.faction)) value = 1.5;
      else if (leading && index === frontline) {
        // One guard is plenty: a second teammate usually prefers to attack.
        value = 0.45;
        crowdWeight = 1.5;
      } else value = 0.12;
      if (state.pushing === rival && state.owner !== rival) value += 0.35;
      // Attackers avoid a rival garrison when another target is open (back-capping).
      const guards = state.owner === bot.faction ? 0 : rival === 'alpine' ? state.alpine : state.lagoon;
      const distance = horizontal(tower.position, bot.position);
      let score = (value / (1 + distance / 140)) / (1 + crowdWeight * (crowd[index] ?? 0)) / (1 + 0.5 * guards);
      score *= 0.85 + random() * 0.3;
      if (index === currentTower) score *= STICKINESS;
      if (score > bestScore) {
        bestScore = score;
        best = index;
      }
    });
    return best;
  }
}
