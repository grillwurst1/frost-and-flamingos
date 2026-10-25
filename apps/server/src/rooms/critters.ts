import {
  CRITTER_ROSTER,
  CRITTER_STATS,
  FIXED_DT,
  FJORD_MAP,
  PHYSICS_TICK_RATE,
  critterHalfAt,
  critterSphereCenter,
  isCritterDryGround,
  type CritterBehaviour,
  type CritterSpecies,
  type CritterSpeciesStats,
  type CritterState,
  type Faction,
  type PhysicsWorld,
  type Vec3,
  type WeaponId,
} from '@frost-and-flamingos/shared';
import { raySphere } from './combat.js';

/**
 * Server-authoritative ambient critters (the wandering hens).
 *
 * Deterministic fixed-step simulation: every random choice comes from one
 * seeded generator and the critters are updated in id order, so the same seed
 * and the same threats replay the same paths. Motion is ground-sampled
 * against the static world (raycasts through the shared PhysicsWorld, never
 * a collider of their own): a feeler probe ahead of the feet refuses walls,
 * steps that are too high, drops that are too deep, the waterline and the
 * other half of the map. Critters never block players or bullets; only their
 * own small hit spheres take shots, splash, melee and mascot rams.
 */

export interface CritterThreat {
  position: Vec3;
}

export interface CritterKill {
  critterId: number;
  species: CritterSpecies;
  position: Vec3;
  killerId: number;
  weaponId: WeaponId | null;
}

export interface CritterHit {
  critterId: number;
  distance: number;
}

export interface CritterSystemOptions {
  seed: number;
  onKill?: (kill: CritterKill) => void;
}

interface Critter {
  id: number;
  species: CritterSpecies;
  stats: CritterSpeciesStats;
  half: Faction;
  home: Vec3;
  position: Vec3;
  /** Height of the walkable surface under the feet. */
  floor: number;
  yaw: number;
  speed: number;
  verticalSpeed: number;
  airborne: boolean;
  behaviour: CritterBehaviour;
  /** Ticks left in the current calm behaviour or flee burst. */
  behaviourTicks: number;
  goal: Vec3 | null;
  goalTicks: number;
  /** Desired heading while fleeing. */
  fleeYaw: number;
  fleeFrom: Vec3;
  nextHopTick: number;
  nextThreatCheckTick: number;
  blockedCount: number;
  alive: boolean;
  respawnAtTick: number;
}

interface HistorySample {
  tick: number;
  /** Per critter (id order): x, y, z, yaw, alive. */
  data: Float32Array;
}

const HISTORY_TICKS = 2 * PHYSICS_TICK_RATE;
const STRIDE = 5;
const ARRIVAL_RADIUS = 0.35;
const WALK_ACCELERATION = 3.5;
const FLEE_ACCELERATION = 28;
const BRAKE_ACCELERATION = 9;
const THREAT_VERTICAL_REACH = 2.2;
/** Probe origin above the feet: just over the highest walkable step. */
const PROBE_MARGIN = 0.05;
const SPAWN_ATTEMPTS = 40;

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function wrapAngle(angle: number): number {
  let value = angle % (Math.PI * 2);
  if (value > Math.PI) value -= Math.PI * 2;
  if (value < -Math.PI) value += Math.PI * 2;
  return value;
}

function horizontalDistance(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function secondsToTicks(seconds: number): number {
  return Math.max(1, Math.round(seconds * PHYSICS_TICK_RATE));
}

/** Distance from a point to the segment a + t·direction, t ∈ [0, length], and the closest point. */
function distanceToSegment(point: Vec3, origin: Vec3, direction: Vec3, length: number): { distance: number; closest: Vec3 } {
  const t = Math.max(
    0,
    Math.min(
      length,
      (point.x - origin.x) * direction.x + (point.y - origin.y) * direction.y + (point.z - origin.z) * direction.z,
    ),
  );
  const closest = { x: origin.x + direction.x * t, y: origin.y + direction.y * t, z: origin.z + direction.z * t };
  return { distance: Math.hypot(point.x - closest.x, point.y - closest.y, point.z - closest.z), closest };
}

const nav = FJORD_MAP.nav;
const adjacency: number[][] = nav.nodes.map(() => []);
for (const [a, b] of nav.edges) {
  adjacency[a]?.push(b);
  adjacency[b]?.push(a);
}

export class CritterSystem {
  private readonly physics: PhysicsWorld;
  private readonly random: () => number;
  private readonly onKill: (kill: CritterKill) => void;
  private readonly critters: Critter[] = [];
  private readonly history: HistorySample[] = [];
  /** Land nav nodes per half that are clear of the spawn pads, with spawn weights. */
  private readonly spawnNodes: Record<Faction, Array<{ index: number; weight: number }>> = { alpine: [], lagoon: [] };
  private tick = 0;
  private threats: readonly CritterThreat[] = [];
  /** Lifetime counters for /api/health and tests. */
  readonly stats = { kills: 0, respawns: 0, flees: 0 };

  constructor(physics: PhysicsWorld, options: CritterSystemOptions) {
    this.physics = physics;
    this.random = mulberry32(options.seed);
    this.onKill = options.onKill ?? (() => {});
    this.collectSpawnNodes();
    let id = 1;
    for (const species of CRITTER_ROSTER) {
      const stats = CRITTER_STATS[species];
      for (const half of ['alpine', 'lagoon'] as const) {
        for (let index = 0; index < stats.perHalf; index += 1) {
          const critter = this.createCritter(id, species, half);
          id += 1;
          this.critters.push(critter);
          this.place(critter, this.findSpawn(critter, []));
        }
      }
    }
  }

  get count(): number {
    return this.critters.length;
  }

  private collectSpawnNodes(): void {
    const stats = Object.values(CRITTER_STATS);
    const padClearance = Math.max(...stats.map((entry) => entry.spawnPadClearance));
    // One roster today; the weights of the first species shape the spawn pool.
    const weights = CRITTER_STATS[CRITTER_ROSTER[0] ?? 'hen'].spawnZoneWeights;
    nav.nodes.forEach((node, index) => {
      if (node.water) return;
      if (!isCritterDryGround(node.position.y)) return;
      for (const spawn of FJORD_MAP.spawns) {
        if (horizontalDistance(spawn.position, node.position) < padClearance) return;
      }
      const weight = weights[node.zone] ?? 1;
      if (weight <= 0) return;
      this.spawnNodes[critterHalfAt(node.position.x, node.position.z)].push({ index, weight });
    });
  }

  /** Weighted random spawn node of a half. */
  private pickSpawnNode(half: Faction): number {
    const nodes = this.spawnNodes[half];
    let total = 0;
    for (const node of nodes) total += node.weight;
    let roll = this.random() * total;
    for (const node of nodes) {
      roll -= node.weight;
      if (roll <= 0) return node.index;
    }
    return nodes[nodes.length - 1]?.index ?? 0;
  }

  private createCritter(id: number, species: CritterSpecies, half: Faction): Critter {
    const origin = { x: 0, y: 0, z: 0 };
    return {
      id,
      species,
      stats: CRITTER_STATS[species],
      half,
      home: { ...origin },
      position: { ...origin },
      floor: 0,
      yaw: 0,
      speed: 0,
      verticalSpeed: 0,
      airborne: false,
      behaviour: 'idle',
      behaviourTicks: 0,
      goal: null,
      goalTicks: 0,
      fleeYaw: 0,
      fleeFrom: { ...origin },
      nextHopTick: 0,
      nextThreatCheckTick: 0,
      blockedCount: 0,
      alive: true,
      respawnAtTick: 0,
    };
  }

  // ---------------------------------------------------------------------------
  // Ground probes
  // ---------------------------------------------------------------------------

  /**
   * Walkable surface height below (x, z), probing down from `fromY`. Returns
   * null for no ground within reach or when the probe starts inside a prop.
   */
  private groundBelow(x: number, z: number, fromY: number, reach: number): number | null {
    const hit = this.physics.raycast({ x, y: fromY, z }, { x: 0, y: -1, z: 0 }, reach);
    if (!hit || hit.distance < 0.02) return null;
    return hit.point.y;
  }

  /** True when a point is a legal place for this critter to stand. */
  private standable(critter: Critter, x: number, z: number, floor: number): boolean {
    return isCritterDryGround(floor) && critterHalfAt(x, z) === critter.half;
  }

  /**
   * Feeler: can the critter take a step along `yaw`? Probes a point ahead of
   * the feet for walls, too-high steps, too-deep drops, water and the half.
   */
  private canMove(critter: Critter, yaw: number): boolean {
    const stats = critter.stats;
    const directionX = Math.sin(yaw);
    const directionZ = Math.cos(yaw);
    const base = Math.max(critter.position.y, critter.floor);
    const probeY = base + stats.stepUp + PROBE_MARGIN;
    const reach = stats.feelerDistance + stats.clearance;
    const wall = this.physics.raycast(
      { x: critter.position.x, y: probeY, z: critter.position.z },
      { x: directionX, y: 0, z: directionZ },
      reach,
    );
    if (wall) return false;
    const aheadX = critter.position.x + directionX * stats.feelerDistance;
    const aheadZ = critter.position.z + directionZ * stats.feelerDistance;
    const ahead = this.groundBelow(aheadX, aheadZ, probeY, stats.stepUp + PROBE_MARGIN + stats.maxDrop + 0.3);
    if (ahead === null) return false;
    if (critter.floor - ahead > stats.maxDrop) return false;
    return this.standable(critter, aheadX, aheadZ, ahead);
  }

  // ---------------------------------------------------------------------------
  // Spawning
  // ---------------------------------------------------------------------------

  private range(bounds: readonly [number, number]): number {
    return bounds[0] + (bounds[1] - bounds[0]) * this.random();
  }

  /** Validates a spawn spot; returns the feet position or null. */
  private spawnSpot(critter: Critter, x: number, z: number, nearY: number, avoid: readonly Vec3[]): Vec3 | null {
    const stats = critter.stats;
    if (critterHalfAt(x, z) !== critter.half) return null;
    const floor = this.groundBelow(x, z, nearY + 2, 4.5);
    if (floor === null || Math.abs(floor - nearY) > 1.6) return null;
    if (!isCritterDryGround(floor)) return null;
    for (const spawn of FJORD_MAP.spawns) {
      if (Math.hypot(spawn.position.x - x, spawn.position.z - z) < stats.spawnPadClearance) return null;
    }
    const position = { x, y: floor, z };
    for (const other of avoid) {
      if (horizontalDistance(other, position) < stats.spawnPlayerClearance) return null;
    }
    for (const other of this.critters) {
      if (other !== critter && other.alive && horizontalDistance(other.position, position) < 2) return null;
    }
    // Free standing room around the feet, and a free column above them.
    const probeY = floor + stats.stepUp + PROBE_MARGIN;
    for (let index = 0; index < 4; index += 1) {
      const angle = (index / 4) * Math.PI * 2;
      if (
        this.physics.raycast({ x, y: probeY, z }, { x: Math.sin(angle), y: 0, z: Math.cos(angle) }, stats.clearance + 0.25)
      ) {
        return null;
      }
    }
    if (this.physics.raycast({ x, y: probeY, z }, { x: 0, y: 1, z: 0 }, 1.2)) return null;
    return position;
  }

  private findSpawn(critter: Critter, avoid: readonly Vec3[]): Vec3 {
    const nodes = this.spawnNodes[critter.half];
    for (let attempt = 0; attempt < SPAWN_ATTEMPTS && nodes.length > 0; attempt += 1) {
      const node = nav.nodes[this.pickSpawnNode(critter.half)];
      if (!node) continue;
      const angle = this.random() * Math.PI * 2;
      const radius = attempt < SPAWN_ATTEMPTS / 2 ? 1 + this.random() * 5 : this.random() * 2;
      const spot = this.spawnSpot(
        critter,
        node.position.x + Math.sin(angle) * radius,
        node.position.z + Math.cos(angle) * radius,
        node.position.y,
        // Late attempts relax the player clearance before giving up.
        attempt < SPAWN_ATTEMPTS - 8 ? avoid : [],
      );
      if (spot) return spot;
    }
    // Every attempt failed (tiny half or crowded): the first candidate node.
    const fallback = nav.nodes[nodes[0]?.index ?? 0]?.position ?? { x: 0, y: 0, z: 0 };
    return { ...fallback };
  }

  private place(critter: Critter, position: Vec3): void {
    critter.position = { ...position };
    critter.floor = position.y;
    critter.home = { ...position };
    critter.yaw = wrapAngle(this.random() * Math.PI * 2);
    critter.speed = 0;
    critter.verticalSpeed = 0;
    critter.airborne = false;
    critter.goal = null;
    critter.blockedCount = 0;
    this.startCalm(critter, 'idle');
  }

  // ---------------------------------------------------------------------------
  // Behaviour
  // ---------------------------------------------------------------------------

  private startCalm(critter: Critter, behaviour: Exclude<CritterBehaviour, 'walk' | 'flee'>): void {
    const stats = critter.stats;
    const seconds =
      behaviour === 'peck'
        ? stats.peckSeconds
        : behaviour === 'scratch'
          ? stats.scratchSeconds
          : behaviour === 'look'
            ? stats.lookSeconds
            : stats.idleSeconds;
    critter.behaviour = behaviour;
    critter.behaviourTicks = secondsToTicks(this.range(seconds));
    critter.goal = null;
  }

  private chooseNext(critter: Critter): void {
    const weights = critter.stats.behaviourWeights;
    let roll = this.random() * (weights.walk + weights.peck + weights.scratch + weights.look + weights.idle);
    if ((roll -= weights.walk) < 0) {
      this.startWalk(critter);
    } else if ((roll -= weights.peck) < 0) {
      this.startCalm(critter, 'peck');
    } else if ((roll -= weights.scratch) < 0) {
      this.startCalm(critter, 'scratch');
    } else if ((roll -= weights.look) < 0) {
      this.startCalm(critter, 'look');
    } else {
      this.startCalm(critter, 'idle');
    }
  }

  /** Nearest dry nav node on the critter's half, within a short walk. */
  private nearestNavNode(critter: Critter): number {
    let best = -1;
    let bestDistance = 30;
    nav.nodes.forEach((node, index) => {
      if (node.water || Math.abs(node.position.y - critter.position.y) > 4) return;
      const distance = horizontalDistance(node.position, critter.position);
      if (distance >= bestDistance) return;
      if (critterHalfAt(node.position.x, node.position.z) !== critter.half) return;
      best = index;
      bestDistance = distance;
    });
    return best;
  }

  /** A goal partway toward a neighbouring nav node, or a short random heading. */
  private pickGoal(critter: Critter): Vec3 {
    const stats = critter.stats;
    const distance = this.range(stats.wanderDistance);
    const fromHome = horizontalDistance(critter.position, critter.home);
    if (fromHome < stats.homeRadius && this.random() < 0.45) {
      const start = this.nearestNavNode(critter);
      const neighbours = start >= 0 ? (adjacency[start] ?? []).filter((index) => {
        const node = nav.nodes[index];
        return node !== undefined && !node.water && critterHalfAt(node.position.x, node.position.z) === critter.half;
      }) : [];
      const pick = neighbours[Math.min(neighbours.length - 1, Math.floor(this.random() * neighbours.length))];
      const target = pick === undefined ? nav.nodes[start] : nav.nodes[pick];
      if (target) {
        const dx = target.position.x - critter.position.x;
        const dz = target.position.z - critter.position.z;
        const length = Math.hypot(dx, dz);
        if (length > 0.5) {
          const travel = Math.min(length, distance);
          const side = (this.random() - 0.5) * 2;
          return {
            x: critter.position.x + (dx / length) * travel + (dz / length) * side,
            y: critter.position.y,
            z: critter.position.z + (dz / length) * travel - (dx / length) * side,
          };
        }
      }
    }
    let heading = this.random() * Math.PI * 2;
    if (fromHome > stats.homeRadius) {
      heading = Math.atan2(critter.home.x - critter.position.x, critter.home.z - critter.position.z) + (this.random() - 0.5) * 1.2;
    }
    return {
      x: critter.position.x + Math.sin(heading) * distance,
      y: critter.position.y,
      z: critter.position.z + Math.cos(heading) * distance,
    };
  }

  private startWalk(critter: Critter): void {
    // Prefer a goal whose first step is walkable (no pacing at a wall or a ledge).
    let goal = this.pickGoal(critter);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (this.canMove(critter, Math.atan2(goal.x - critter.position.x, goal.z - critter.position.z))) break;
      goal = this.pickGoal(critter);
    }
    critter.behaviour = 'walk';
    critter.goal = goal;
    const distance = horizontalDistance(goal, critter.position);
    critter.goalTicks = secondsToTicks(distance / critter.stats.walkSpeed * 2 + 1.5);
    critter.blockedCount = 0;
  }

  private startFlee(critter: Critter, from: Vec3): void {
    if (!critter.alive) return;
    const stats = critter.stats;
    const startled = critter.behaviour !== 'flee';
    critter.behaviour = 'flee';
    critter.behaviourTicks = Math.max(critter.behaviourTicks, secondsToTicks(this.range(stats.fleeSeconds)));
    critter.fleeFrom = { ...from };
    critter.goal = null;
    critter.blockedCount = 0;
    const away = Math.atan2(critter.position.x - from.x, critter.position.z - from.z);
    critter.fleeYaw = wrapAngle(away + (this.random() - 0.5) * 0.9);
    if (startled) {
      this.stats.flees += 1;
      // A startled flap first, then hops at intervals.
      critter.nextHopTick = this.tick;
    }
  }

  private nearestThreat(critter: Critter, reach: number): CritterThreat | null {
    let best: CritterThreat | null = null;
    let bestDistance = reach;
    for (const threat of this.threats) {
      if (Math.abs(threat.position.y - critter.position.y) > THREAT_VERTICAL_REACH) continue;
      const distance = horizontalDistance(threat.position, critter.position);
      if (distance < bestDistance) {
        best = threat;
        bestDistance = distance;
      }
    }
    return best;
  }

  /** Desired heading and speed for this tick from the behaviour. */
  private steer(critter: Critter): { yaw: number; speed: number; turnRate: number } {
    const stats = critter.stats;
    if (critter.behaviour === 'flee') {
      return { yaw: critter.fleeYaw, speed: stats.fleeSpeed, turnRate: stats.fleeTurnRate };
    }
    if (critter.behaviour === 'walk' && critter.goal) {
      const yaw = Math.atan2(critter.goal.x - critter.position.x, critter.goal.z - critter.position.z);
      // Turn on the spot first when the goal is behind.
      const error = Math.abs(wrapAngle(yaw - critter.yaw));
      return { yaw, speed: error > 1.2 ? 0 : stats.walkSpeed, turnRate: stats.walkTurnRate };
    }
    return { yaw: critter.yaw, speed: 0, turnRate: stats.walkTurnRate };
  }

  private updateBehaviour(critter: Critter): void {
    const stats = critter.stats;
    if (this.tick >= critter.nextThreatCheckTick) {
      critter.nextThreatCheckTick = this.tick + 6;
      const fleeing = critter.behaviour === 'flee';
      const threat = this.nearestThreat(critter, fleeing ? stats.fleeRadius * 1.5 : stats.fleeRadius);
      if (threat) {
        if (fleeing) {
          // Still chased: keep running, away from the current nearest threat.
          critter.behaviourTicks = Math.max(critter.behaviourTicks, secondsToTicks(0.6));
          const away = Math.atan2(critter.position.x - threat.position.x, critter.position.z - threat.position.z);
          if (Math.abs(wrapAngle(away - critter.fleeYaw)) > 1.1) critter.fleeYaw = wrapAngle(away + (this.random() - 0.5) * 0.6);
          critter.fleeFrom = { ...threat.position };
        } else {
          this.startFlee(critter, threat.position);
        }
      }
    }

    if (critter.behaviour === 'flee') {
      critter.behaviourTicks -= 1;
      if (critter.behaviourTicks <= 0 && !critter.airborne) this.startCalm(critter, 'look');
      return;
    }
    if (critter.behaviour === 'walk') {
      critter.goalTicks -= 1;
      const goal = critter.goal;
      if (!goal || critter.goalTicks <= 0 || horizontalDistance(goal, critter.position) < ARRIVAL_RADIUS) {
        this.startCalm(critter, this.random() < 0.6 ? 'peck' : 'look');
      }
      return;
    }
    critter.behaviourTicks -= 1;
    if (critter.behaviourTicks <= 0) this.chooseNext(critter);
  }

  /** A blocked step: walkers pick a new way, fleers swerve to the freer side. */
  private handleBlocked(critter: Critter): void {
    critter.blockedCount += 1;
    if (critter.behaviour === 'flee') {
      const away = Math.atan2(critter.position.x - critter.fleeFrom.x, critter.position.z - critter.fleeFrom.z);
      const turn = (Math.PI / 2) * (0.75 + this.random() * 0.5);
      const left = wrapAngle(critter.fleeYaw + turn);
      const right = wrapAngle(critter.fleeYaw - turn);
      const preferLeft = Math.cos(left - away) >= Math.cos(right - away);
      // Alternate sides when cornered so the critter does not shuffle in place.
      const useLeft = critter.blockedCount % 3 === 0 ? !preferLeft : preferLeft;
      critter.fleeYaw = useLeft ? left : right;
      return;
    }
    if (critter.behaviour === 'walk') {
      if (critter.blockedCount > 3) {
        this.startCalm(critter, 'look');
        return;
      }
      const heading = wrapAngle(critter.yaw + (this.random() < 0.5 ? 1 : -1) * (1 + this.random() * 1.6));
      const distance = this.range(critter.stats.wanderDistance) * 0.6;
      critter.goal = {
        x: critter.position.x + Math.sin(heading) * distance,
        y: critter.position.y,
        z: critter.position.z + Math.cos(heading) * distance,
      };
      critter.goalTicks = secondsToTicks(distance / critter.stats.walkSpeed * 2 + 1);
    }
  }

  private move(critter: Critter): void {
    const stats = critter.stats;
    const steer = this.steer(critter);
    const error = wrapAngle(steer.yaw - critter.yaw);
    const maxTurn = steer.turnRate * FIXED_DT;
    critter.yaw = wrapAngle(critter.yaw + Math.max(-maxTurn, Math.min(maxTurn, error)));

    const acceleration =
      steer.speed < critter.speed ? BRAKE_ACCELERATION : critter.behaviour === 'flee' ? FLEE_ACCELERATION : WALK_ACCELERATION;
    const change = acceleration * FIXED_DT;
    critter.speed += Math.max(-change, Math.min(change, steer.speed - critter.speed));
    if (critter.speed < 0.01) critter.speed = 0;

    if (critter.behaviour === 'flee' && !critter.airborne && this.tick >= critter.nextHopTick) {
      critter.verticalSpeed = stats.hopSpeed;
      critter.airborne = true;
      critter.nextHopTick = this.tick + secondsToTicks(this.range(stats.hopInterval));
    }

    if (critter.speed > 0) {
      if (this.canMove(critter, critter.yaw)) {
        const step = critter.speed * FIXED_DT;
        const nextX = critter.position.x + Math.sin(critter.yaw) * step;
        const nextZ = critter.position.z + Math.cos(critter.yaw) * step;
        const base = Math.max(critter.position.y, critter.floor);
        const floor = this.groundBelow(nextX, nextZ, base + stats.stepUp + PROBE_MARGIN, stats.stepUp + PROBE_MARGIN + stats.maxDrop + 0.3);
        if (floor !== null && critter.floor - floor <= stats.maxDrop && this.standable(critter, nextX, nextZ, floor)) {
          critter.position.x = nextX;
          critter.position.z = nextZ;
          critter.floor = floor;
          critter.blockedCount = Math.max(0, critter.blockedCount - 1);
        } else {
          critter.speed = 0;
          this.handleBlocked(critter);
        }
      } else {
        critter.speed = 0;
        this.handleBlocked(critter);
      }
    }

    // Vertical: snap onto the surface, or fall/hop with fluttering gravity.
    if (critter.airborne || critter.position.y > critter.floor + 0.3) {
      critter.airborne = true;
      critter.verticalSpeed += stats.gravity * FIXED_DT;
      critter.position.y += critter.verticalSpeed * FIXED_DT;
      if (critter.position.y <= critter.floor) {
        critter.position.y = critter.floor;
        critter.verticalSpeed = 0;
        critter.airborne = false;
      }
    } else {
      critter.position.y = critter.floor;
      critter.verticalSpeed = 0;
    }
  }

  private respawn(critter: Critter): void {
    critter.alive = true;
    critter.respawnAtTick = 0;
    this.place(critter, this.findSpawn(critter, this.threats.map((threat) => threat.position)));
    this.stats.respawns += 1;
  }

  // ---------------------------------------------------------------------------
  // Public simulation API
  // ---------------------------------------------------------------------------

  /** One fixed step. `threats` are the living players critters run from. */
  step(tick: number, threats: readonly CritterThreat[]): void {
    this.tick = tick;
    this.threats = threats;
    for (const critter of this.critters) {
      if (!critter.alive) {
        if (tick >= critter.respawnAtTick) this.respawn(critter);
        continue;
      }
      this.updateBehaviour(critter);
      this.move(critter);
    }
    this.recordHistory();
  }

  private recordHistory(): void {
    const data = new Float32Array(this.critters.length * STRIDE);
    this.critters.forEach((critter, index) => {
      const offset = index * STRIDE;
      data[offset] = critter.position.x;
      data[offset + 1] = critter.position.y;
      data[offset + 2] = critter.position.z;
      data[offset + 3] = critter.yaw;
      data[offset + 4] = critter.alive ? 1 : 0;
    });
    this.history.push({ tick: this.tick, data });
    while (this.history.length > HISTORY_TICKS) this.history.shift();
  }

  private sampleAt(tick: number): HistorySample | null {
    let best: HistorySample | null = null;
    for (const sample of this.history) {
      if (sample.tick <= tick) best = sample;
      else break;
    }
    return best ?? this.history[0] ?? null;
  }

  /** A shot was fired: critters near the shooter or the shot lane scatter. */
  alertShot(origin: Vec3, direction: Vec3, length: number): void {
    for (const critter of this.critters) {
      if (!critter.alive) continue;
      const stats = critter.stats;
      if (horizontalDistance(origin, critter.position) < stats.gunfireRadius && Math.abs(origin.y - critter.position.y) < 6) {
        this.startFlee(critter, origin);
        continue;
      }
      const lane = distanceToSegment(critter.position, origin, direction, length);
      if (lane.distance < stats.shotLaneRadius) this.startFlee(critter, lane.closest);
    }
  }

  /** An explosion: critters within the blast plus a margin run from it. */
  alertBlast(center: Vec3, radius: number): void {
    for (const critter of this.critters) {
      if (!critter.alive) continue;
      const distance = Math.hypot(critter.position.x - center.x, critter.position.y - center.y, critter.position.z - center.z);
      if (distance < radius + critter.stats.blastMargin) this.startFlee(critter, center);
    }
  }

  /**
   * Nearest critter hit sphere on a ray. `atTick` rewinds to the critter
   * poses of that physics tick (lag compensation); null tests live poses.
   */
  raycast(origin: Vec3, direction: Vec3, maxDistance: number, atTick: number | null): CritterHit | null {
    const sample = atTick === null ? null : this.sampleAt(atTick);
    let best: CritterHit | null = null;
    this.critters.forEach((critter, index) => {
      let position = critter.position;
      let yaw = critter.yaw;
      let alive = critter.alive;
      if (sample && sample.data.length >= (index + 1) * STRIDE) {
        const offset = index * STRIDE;
        position = { x: sample.data[offset] ?? 0, y: sample.data[offset + 1] ?? 0, z: sample.data[offset + 2] ?? 0 };
        yaw = sample.data[offset + 3] ?? 0;
        // Already dead now means the shot cannot bag it twice.
        alive = (sample.data[offset + 4] ?? 0) > 0 && critter.alive;
      }
      if (!alive) return;
      for (const sphere of [critter.stats.body, critter.stats.head]) {
        const distance = raySphere(origin, direction, critterSphereCenter(position, yaw, sphere), sphere.radius);
        if (distance !== null && distance <= maxDistance && (!best || distance < best.distance)) {
          best = { critterId: critter.id, distance };
        }
      }
    });
    return best;
  }

  /**
   * Kills every living critter whose body touches the sphere; returns how
   * many. With `rewindTick` the pose of that tick counts too (what a lagging
   * rammer saw on screen).
   */
  killInSphere(center: Vec3, radius: number, killerId: number, weaponId: WeaponId | null, rewindTick: number | null = null): number {
    const sample = rewindTick === null ? null : this.sampleAt(rewindTick);
    let kills = 0;
    this.critters.forEach((critter, index) => {
      if (!critter.alive) return;
      const poses: Array<{ position: Vec3; yaw: number }> = [{ position: critter.position, yaw: critter.yaw }];
      if (sample && sample.data.length >= (index + 1) * STRIDE && (sample.data[index * STRIDE + 4] ?? 0) > 0) {
        const offset = index * STRIDE;
        poses.push({
          position: { x: sample.data[offset] ?? 0, y: sample.data[offset + 1] ?? 0, z: sample.data[offset + 2] ?? 0 },
          yaw: sample.data[offset + 3] ?? 0,
        });
      }
      for (const pose of poses) {
        const body = critterSphereCenter(pose.position, pose.yaw, critter.stats.body);
        const distance = Math.hypot(body.x - center.x, body.y - center.y, body.z - center.z);
        if (distance <= radius + critter.stats.body.radius) {
          this.kill(critter.id, killerId, weaponId);
          kills += 1;
          return;
        }
      }
    });
    return kills;
  }

  kill(critterId: number, killerId: number, weaponId: WeaponId | null): boolean {
    const critter = this.critters.find((entry) => entry.id === critterId);
    if (!critter || !critter.alive) return false;
    critter.alive = false;
    critter.speed = 0;
    critter.airborne = false;
    critter.respawnAtTick = this.tick + secondsToTicks(critter.stats.respawnSeconds);
    this.stats.kills += 1;
    this.onKill({
      critterId: critter.id,
      species: critter.species,
      position: { ...critter.position },
      killerId,
      weaponId,
    });
    return true;
  }

  states(): CritterState[] {
    return this.critters.map((critter) => ({
      id: critter.id,
      species: critter.species,
      half: critter.half,
      position: { ...critter.position },
      yaw: critter.yaw,
      speed: critter.speed,
      behaviour: critter.behaviour,
      alive: critter.alive,
      airborne: critter.airborne,
    }));
  }

  /** Ticks until a dead critter returns (0 when alive or unknown). */
  respawnTicksLeft(critterId: number): number {
    const critter = this.critters.find((entry) => entry.id === critterId);
    return critter && !critter.alive ? Math.max(0, critter.respawnAtTick - this.tick) : 0;
  }

  /**
   * DEV/test tool: moves the living critters of the half that `center` lies
   * on into a loose ring around it (validated spots), as their new home.
   */
  gather(center: Vec3, minRadius = 5, maxRadius = 9): number {
    const half = critterHalfAt(center.x, center.z);
    let moved = 0;
    for (const critter of this.critters) {
      if (critter.half !== half || !critter.alive) continue;
      for (let attempt = 0; attempt < 30; attempt += 1) {
        const angle = this.random() * Math.PI * 2;
        const radius = minRadius + this.random() * (maxRadius - minRadius);
        const spot = this.spawnSpot(
          critter,
          center.x + Math.sin(angle) * radius,
          center.z + Math.cos(angle) * radius,
          center.y,
          [],
        );
        if (!spot) continue;
        this.place(critter, spot);
        moved += 1;
        break;
      }
    }
    return moved;
  }

  /** Test hook: put one critter at an exact spot and facing, calm. */
  placeForTest(critterId: number, position: Vec3, yaw: number): void {
    const critter = this.critters.find((entry) => entry.id === critterId);
    if (!critter) return;
    critter.alive = true;
    critter.respawnAtTick = 0;
    this.place(critter, position);
    critter.yaw = yaw;
  }
}
