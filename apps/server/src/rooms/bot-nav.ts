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
  /** Swim watchdog: the route node a swimming bot is heading for, and since when. */
  swimNode: number;
  swimSinceTick: number;
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
    swimNode: -1,
    swimSinceTick: 0,
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

/** Open water this far back from a stair toe lets a slow-turning swimmer line up with the stair. */
const SWIM_EXIT_STAGING = 5;
/** Pure-pursuit carrot distance along the stair axis. */
const SWIM_EXIT_LOOKAHEAD = 4;
/** Off-axis distance that counts as on the stair's lane (the flight is 2.2 m wide). */
const SWIM_EXIT_LANE = 1.2;
/** Off-axis distance that clears the flight and its toe for a cow-sized swimmer. */
const SWIM_EXIT_CLEAR = 3;
/**
 * A swimmer on the lane closer than this to the top node (horizontally) is
 * not on the flight but under its high end or the deck (the top node sits
 * 2.5 m in from the deck edge; the flight underside clears a swimming cow
 * only in its last half metre).
 */
const SWIM_EXIT_HEAD = 3;
/** Beyond this distance from the toe (along or across the axis) no line-up is needed yet. */
const SWIM_EXIT_RANGE = 20;
/** A swimmer heading for the same node this long gives up on it and re-plans. */
const SWIM_GIVE_UP_TICKS = 20 * 60;
/** ...or this long when the node is a deck overhead with no stair down to the water. */
const SWIM_OVERHEAD_TICKS = 3 * 60;

/**
 * Heading for a body leaving the water by a stair (its route is at a swim
 * exit, or at the stair top above it). A body that turns slowly (the cow)
 * cannot pivot onto a narrow flight at its toe the way a vacationer does: it
 * overshoots and loops beside the stair or drifts under the deck. Instead it
 * swims round the flight to open water off the toe and is led onto the stair
 * axis with a pure-pursuit carrot, so it reaches the toe lined up. In stair
 * coordinates (along the axis from the water node to the top node, across
 * it):
 * - well off the toe: pursue the axis (or first fall back onto its line);
 * - on the lane at the toe or on the flight: pursue the axis up the flight;
 * - beside the flight, or swimming under its high end or the deck: slide
 *   sideways clear of it, then swim round to the toe side.
 * Advances the route past the toe once the body is on the stair lane.
 * Returns null when no swim exit is involved.
 */
export function swimExitYaw(route: BotRoute, position: Vec3, swimming: boolean): number | null {
  const current = route.nodes[route.index];
  if (current === undefined) return null;
  let toe: number | undefined;
  let top: number | undefined;
  if (isWaterNode(current)) {
    const next = route.nodes[route.index + 1];
    if (next === undefined || !(adjacency[current] ?? []).includes(next)) return null;
    toe = current;
    top = next;
  } else {
    if (nodePosition(current).y - position.y <= ARRIVAL_BELOW) return null;
    toe = (adjacency[current] ?? []).find(isWaterNode);
    top = current;
  }
  if (toe === undefined) return null;
  const water = nodePosition(toe);
  const stairTop = nodePosition(top);
  const length = horizontal(stairTop, water);
  if (length < 0.01) return null;
  const ux = (stairTop.x - water.x) / length;
  const uz = (stairTop.z - water.z) / length;
  // Right-hand normal of the axis.
  const nx = uz;
  const nz = -ux;
  const rx = position.x - water.x;
  const rz = position.z - water.z;
  const along = rx * ux + rz * uz;
  const across = rx * nx + rz * nz;
  // Far out, just swim for the node; the line-up only matters near the flight.
  if (along < -SWIM_EXIT_RANGE || Math.abs(across) > SWIM_EXIT_RANGE) return null;
  const offAxis = Math.abs(across);
  const side = across >= 0 ? 1 : -1;
  const inLane = offAxis <= SWIM_EXIT_LANE;
  // On the lane at the toe: the swim exit is reached, climb for the top.
  if (toe === current && inLane && along > -0.5) route.index += 1;
  let aimAlong: number;
  let aimAcross = 0;
  if (along <= -SWIM_EXIT_STAGING + 2) {
    const inCone = offAxis <= SWIM_EXIT_LANE + (-along - (SWIM_EXIT_STAGING - 2)) * 0.8;
    aimAlong = inCone ? along + SWIM_EXIT_LOOKAHEAD : -SWIM_EXIT_STAGING - offAxis * 0.5;
  } else if (inLane && (along <= length - SWIM_EXIT_HEAD || !swimming)) {
    aimAlong = along + SWIM_EXIT_LOOKAHEAD;
  } else if (offAxis < SWIM_EXIT_CLEAR) {
    aimAlong = along;
    aimAcross = side * (SWIM_EXIT_CLEAR + 1.5);
  } else {
    aimAlong = -SWIM_EXIT_STAGING;
    aimAcross = side * SWIM_EXIT_CLEAR;
  }
  const aimX = water.x + ux * aimAlong + nx * aimAcross;
  const aimZ = water.z + uz * aimAlong + nz * aimAcross;
  return Math.atan2(aimX - position.x, aimZ - position.z);
}

/** Closest node a swimmer can reach from the water: a swim exit or ground-level shore, never a deck. */
function nearestSwimNode(position: Vec3, avoid: number): number {
  let best = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  nav.nodes.forEach((node, index) => {
    if (index === avoid || (elevated[index] && !isWaterNode(index))) return;
    const distance = horizontal(node.position, position) + Math.abs(node.position.y - position.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  });
  return best >= 0 ? best : nearestNode(position, avoid);
}

/**
 * Backstop for swimmers. A swimmer whose route node is a deck or pier above
 * it with no stair down to the water (it swam under a pier mid-route) gives
 * up on it after 3 s; any other node after 20 s without reaching it. It then
 * re-plans from the closest node it can swim to (a stair foot or a beach).
 * Returns true when it re-planned. Call every bot tick; it resets on land.
 */
export function swimWatchdog(
  route: BotRoute,
  position: Vec3,
  swimming: boolean,
  tick: number,
  random: () => number,
): boolean {
  const node = swimming ? (route.nodes[route.index] ?? -1) : -1;
  if (node < 0 || node !== route.swimNode) {
    route.swimNode = node;
    route.swimSinceTick = tick;
    return false;
  }
  const overhead =
    elevated[node] === true &&
    nodePosition(node).y - position.y > ARRIVAL_BELOW &&
    !(adjacency[node] ?? []).some(isWaterNode);
  if (tick - route.swimSinceTick < (overhead ? SWIM_OVERHEAD_TICKS : SWIM_GIVE_UP_TICKS)) return false;
  route.goalNode = route.goalNode >= 0 && route.goalNode !== node ? route.goalNode : chooseGoal(random);
  route.nodes = planRoute(nearestSwimNode(position, node), route.goalNode);
  route.index = 0;
  route.stuckStrikes = 0;
  route.checkTick = tick;
  route.checkPosition = { ...position };
  route.swimNode = route.nodes[0] ?? -1;
  route.swimSinceTick = tick;
  return true;
}
