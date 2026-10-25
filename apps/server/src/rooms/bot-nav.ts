/**
 * Bot navigation over the Fjord Fiesta waypoint graph (`FJORD_MAP.nav`).
 * Bots without a combat target pick a goal near a weather tower, plan an A*
 * route over walkable edges and steer from node to node. A stuck detector
 * makes them hop, then sidestep and skip ahead, and finally re-plan from the
 * closest node other than the one they could not reach.
 */
import { FJORD_MAP, type TowerId, type Vec3 } from '@frost-and-flamingos/shared';

const nav = FJORD_MAP.nav;
const adjacency: number[][] = nav.nodes.map(() => []);
for (const [a, b] of nav.edges) {
  adjacency[a]?.push(b);
  adjacency[b]?.push(a);
}

function nodePosition(index: number): Vec3 {
  return nav.nodes[index]?.position ?? { x: 0, y: 0, z: 0 };
}

function isWaterNode(index: number): boolean {
  return nav.nodes[index]?.water === true;
}

function horizontal(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** Deck, pier, bridge and stair-top nodes: reachable only by their stairs, never from below. */
const elevated = nav.nodes.map((node) => node.position.y - FJORD_MAP.heightAt(node.position.x, node.position.z) > 1.2);

const ARRIVAL_RADIUS = 2.4;
/** Swim exits sit just off the foot of a narrow stair: arrive on its axis so the climb lines up. */
const WATER_ARRIVAL_RADIUS = 1;
/** A node counts as reached only on its own level: not from under a pier, not from a ledge far below. */
const ARRIVAL_BELOW = 1.5;
const ARRIVAL_ABOVE = 2.5;

function arrived(node: number, position: Vec3): boolean {
  const target = nodePosition(node);
  const dy = position.y - target.y;
  const radius = isWaterNode(node) ? WATER_ARRIVAL_RADIUS : ARRIVAL_RADIUS;
  return horizontal(target, position) < radius && dy > -ARRIVAL_BELOW && dy < ARRIVAL_ABOVE;
}

/**
 * Closest node on a similar level (so a bot in the gorge does not pick the
 * bridge above it, and a swimmer picks a water stair or the beach rather than
 * the pier deck over its head). `avoid` skips a node the bot just failed to reach.
 */
export function nearestNode(position: Vec3, avoid = -1): number {
  let best = 0;
  let bestScore = Number.POSITIVE_INFINITY;
  nav.nodes.forEach((node, index) => {
    if (index === avoid) return;
    const rise = node.position.y - position.y;
    const dy = Math.abs(rise);
    let score = horizontal(node.position, position) + (dy > 4 ? dy * 6 : dy);
    if (rise > 1.2) score += (rise - 1.2) * (elevated[index] ? 40 : 4);
    if (score < bestScore) {
      bestScore = score;
      best = index;
    }
  });
  return best;
}

/** A* over the undirected waypoint graph; returns node indices from start to goal. */
export function planRoute(start: number, goal: number): number[] {
  if (start === goal) return [goal];
  const open = new Set<number>([start]);
  const came = new Map<number, number>();
  const g = new Map<number, number>([[start, 0]]);
  const f = new Map<number, number>([[start, horizontal(nodePosition(start), nodePosition(goal))]]);
  while (open.size > 0) {
    let current = -1;
    let currentScore = Number.POSITIVE_INFINITY;
    for (const candidate of open) {
      const score = f.get(candidate) ?? Number.POSITIVE_INFINITY;
      if (score < currentScore) {
        currentScore = score;
        current = candidate;
      }
    }
    if (current === goal) {
      const path = [current];
      while (came.has(current)) {
        current = came.get(current) ?? current;
        path.unshift(current);
      }
      return path;
    }
    open.delete(current);
    for (const next of adjacency[current] ?? []) {
      const tentative = (g.get(current) ?? 0) + horizontal(nodePosition(current), nodePosition(next));
      if (tentative < (g.get(next) ?? Number.POSITIVE_INFINITY)) {
        came.set(next, current);
        g.set(next, tentative);
        f.set(next, tentative + horizontal(nodePosition(next), nodePosition(goal)));
        open.add(next);
      }
    }
  }
  return [start];
}

/** Patrol goals: every node except the swim exits in the water. */
const LAND_NODES = nav.nodes.flatMap((_, index) => (isWaterNode(index) ? [] : [index]));
const TOWER_GOALS: Record<TowerId, number[]> = { tower_a: [], tower_b: [], tower_c: [] };
for (const tower of FJORD_MAP.towers) {
  for (const index of LAND_NODES) {
    const node = nav.nodes[index];
    if (node && horizontal(node.position, tower.position) < 26) TOWER_GOALS[tower.id].push(index);
  }
}

export interface BotRoute {
  nodes: number[];
  index: number;
  checkTick: number;
  checkPosition: Vec3;
  stuckStrikes: number;
  /** While before this tick, walk sideways past whatever blocks the way. */
  sidestepUntilTick: number;
  sidestepSign: number;
  /** Final node of the current plan (-1 when none). */
  goalNode: number;
  /** Combat pursuit: line of sight to the target, refreshed every 12 ticks. */
  seesTarget: boolean;
  nextSightTick: number;
  /** Until this tick the bot follows the graph to its target even with sight (it was blocked). */
  chaseUntilTick: number;
  engageCheckTick: number;
  engageCheckPosition: Vec3;
}

export function createBotRoute(): BotRoute {
  return {
    nodes: [],
    index: 0,
    checkTick: 0,
    checkPosition: { x: 0, y: 0, z: 0 },
    stuckStrikes: 0,
    sidestepUntilTick: 0,
    sidestepSign: 1,
    goalNode: -1,
    seesTarget: true,
    nextSightTick: 0,
    chaseUntilTick: 0,
    engageCheckTick: 0,
    engageCheckPosition: { x: 0, y: 0, z: 0 },
  };
}

/**
 * Points the route at a world position (a combat target out of sight or
 * behind an obstacle). Re-plans only when the target's nearest node changes.
 */
export function routeTowards(route: BotRoute, position: Vec3, goal: Vec3, tick: number): void {
  const goalNode = nearestNode(goal);
  if (route.goalNode === goalNode && route.nodes.length > 0 && route.index < route.nodes.length) return;
  route.nodes = planRoute(nearestNode(position), goalNode);
  route.index = 0;
  route.goalNode = goalNode;
  route.checkTick = tick;
  route.checkPosition = { ...position };
}

/**
 * Engagement stuck check while charging a visible target in a straight line:
 * returns true when the bot barely moved for two seconds (railing, cliff, gorge).
 */
export function engagementBlocked(route: BotRoute, position: Vec3, tick: number): boolean {
  if (tick - route.engageCheckTick < 120) return false;
  const moved = horizontal(position, route.engageCheckPosition);
  route.engageCheckTick = tick;
  route.engageCheckPosition = { ...position };
  return moved < 1.2;
}

/** Picks a new goal: mostly the contested towers, sometimes a random waypoint. */
export function chooseGoal(random: () => number): number {
  const roll = random();
  const pool =
    roll < 0.4
      ? TOWER_GOALS.tower_b
      : roll < 0.6
        ? TOWER_GOALS.tower_a
        : roll < 0.8
          ? TOWER_GOALS.tower_c
          : LAND_NODES;
  const options = pool.length > 0 ? pool : LAND_NODES;
  return options[Math.min(options.length - 1, Math.floor(random() * options.length))] ?? 0;
}

export interface SteerResult {
  yaw: number;
  jump: boolean;
  sprint: boolean;
}

/**
 * Advances a bot along its route and returns the yaw to walk towards.
 * `tick` is the physics tick; the stuck check runs every 1.5 s.
 */
export function steerAlongRoute(route: BotRoute, position: Vec3, tick: number, random: () => number): SteerResult {
  if (route.nodes.length === 0 || route.index >= route.nodes.length) {
    const start = nearestNode(position);
    route.goalNode = chooseGoal(random);
    route.nodes = planRoute(start, route.goalNode);
    route.index = 0;
    route.checkTick = tick;
    route.checkPosition = { ...position };
  }
  while (route.index < route.nodes.length - 1 && arrived(route.nodes[route.index] ?? 0, position)) {
    route.index += 1;
  }
  let target = nodePosition(route.nodes[route.index] ?? 0);
  if (route.index === route.nodes.length - 1 && arrived(route.nodes[route.index] ?? 0, position)) {
    route.nodes = [];
  }
  let jump = false;
  if (tick - route.checkTick >= 90) {
    const moved = horizontal(position, route.checkPosition);
    if (moved < 1.6) {
      route.stuckStrikes += 1;
      jump = true;
      // Below a deck or ledge the next node is out of reach: re-plan at once.
      const unreachable = target.y - position.y > ARRIVAL_BELOW;
      if (route.stuckStrikes === 2 && !unreachable) {
        // Sidestep past the obstacle and aim for the following node instead
        // (a swim exit must be reached exactly, so keep that one).
        route.sidestepSign = random() < 0.5 ? -1 : 1;
        route.sidestepUntilTick = tick + 36;
        if (route.index < route.nodes.length - 1 && !isWaterNode(route.nodes[route.index] ?? -1)) {
          route.index += 1;
          target = nodePosition(route.nodes[route.index] ?? 0);
        }
      } else if (route.stuckStrikes >= 2) {
        // Re-plan from the closest node other than the one we could not reach.
        const blocked = route.nodes[route.index] ?? -1;
        route.goalNode = route.goalNode >= 0 && route.goalNode !== blocked ? route.goalNode : chooseGoal(random);
        route.nodes = planRoute(nearestNode(position, blocked), route.goalNode);
        route.index = 0;
        route.stuckStrikes = 0;
        target = nodePosition(route.nodes[0] ?? 0);
      }
    } else {
      route.stuckStrikes = 0;
    }
    route.checkTick = tick;
    route.checkPosition = { ...position };
  }
  let yaw = Math.atan2(target.x - position.x, target.z - position.z);
  if (tick < route.sidestepUntilTick) yaw += (route.sidestepSign * Math.PI) / 2;
  return {
    yaw,
    jump,
    sprint: horizontal(target, position) > 14,
  };
}
