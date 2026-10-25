/**
 * Spawn facing: a (re)spawned player looks toward the next objective across
 * open ground, never into the wall or post next to its pad. Candidate yaws
 * fan out around the objective bearing; each is scored by how far the eye
 * line runs free (and how much room the over-the-shoulder camera has behind
 * the player), minus a penalty for turning away from the objective. Only the
 * static world is scored, so results are cached per pad and objective.
 */
import {
  CONQUEST_TOWERS,
  oppositeFaction,
  type Faction,
  type TowerControlState,
  type Vec3,
} from '@frost-and-flamingos/shared';

export interface RayWorld {
  raycast(origin: Vec3, direction: Vec3, maxDistance: number): { distance: number } | null;
}

/** Eye and camera-pivot heights above the feet used for the clearance rays. */
const EYE_HEIGHT = 1.6;
const PIVOT_HEIGHT = 1.72;
/** Eye rays longer than this count as fully open. */
const OPEN_DISTANCE = 36;
/** Third-person camera boom (camera-rig distance) plus a little margin. */
const CAMERA_ROOM = 5.2;
const STEP_DEGREES = 15;
const MAX_STEPS = 9;
/** Score lost per degree of turning away from the objective bearing. */
const TURN_PENALTY = 0.13;
const CAMERA_WEIGHT = 1.6;
/** A camera boom shorter than this pulls the view into the player's back: penalised hard. */
const CAMERA_COMFORT = 4.6;
const CAMERA_CRAMP_PENALTY = 9;
/** Lateral offsets (m) of the eye rays. */
const EYE_RAY_OFFSETS = [-0.75, 0, 0.75] as const;

/** Map centre on the Village Square plateau: the fallback objective. */
export const MAP_CENTRE: Vec3 = { x: 0, y: 18, z: 0 };

function horizontalDirection(yaw: number): Vec3 {
  return { x: Math.sin(yaw), y: 0, z: Math.cos(yaw) };
}

function freeDistance(world: RayWorld, origin: Vec3, direction: Vec3, max: number): number {
  const hit = world.raycast(origin, direction, max);
  return hit ? Math.max(0, hit.distance) : max;
}

export interface FacingScore {
  yaw: number;
  eye: number;
  camera: number;
  score: number;
}

/** Scores every candidate yaw (exposed for tests and the pad audit). */
export function scoreSpawnFacings(world: RayWorld, feet: Vec3, objective: Vec3): FacingScore[] {
  const dx = objective.x - feet.x;
  const dz = objective.z - feet.z;
  const bearing = Math.hypot(dx, dz) > 0.5 ? Math.atan2(dx, dz) : 0;
  const eye = { x: feet.x, y: feet.y + EYE_HEIGHT, z: feet.z };
  const pivot = { x: feet.x, y: feet.y + PIVOT_HEIGHT, z: feet.z };
  const scores: FacingScore[] = [];
  for (let step = -MAX_STEPS; step <= MAX_STEPS; step += 1) {
    const yaw = bearing + (step * STEP_DEGREES * Math.PI) / 180;
    const forward = horizontalDirection(yaw);
    // Three parallel eye rays: a post just beside the centre line still fills the frame.
    let eyeFree = OPEN_DISTANCE;
    for (const side of EYE_RAY_OFFSETS) {
      const origin = { x: eye.x + forward.z * side, y: eye.y, z: eye.z - forward.x * side };
      eyeFree = Math.min(eyeFree, freeDistance(world, origin, forward, OPEN_DISTANCE));
    }
    const back = { x: -forward.x, y: 0.18, z: -forward.z };
    const length = Math.hypot(back.x, back.y, back.z);
    const cameraFree = freeDistance(world, pivot, { x: back.x / length, y: back.y / length, z: back.z / length }, CAMERA_ROOM);
    scores.push({
      yaw: Math.atan2(Math.sin(yaw), Math.cos(yaw)),
      eye: eyeFree,
      camera: cameraFree,
      score:
        eyeFree +
        cameraFree * CAMERA_WEIGHT -
        Math.max(0, CAMERA_COMFORT - cameraFree) * CAMERA_CRAMP_PENALTY -
        Math.abs(step * STEP_DEGREES) * TURN_PENALTY,
    });
  }
  return scores;
}

export function spawnFacingYaw(world: RayWorld, feet: Vec3, objective: Vec3): number {
  let best: FacingScore | null = null;
  for (const candidate of scoreSpawnFacings(world, feet, objective)) {
    if (!best || candidate.score > best.score) best = candidate;
  }
  return best?.yaw ?? 0;
}

/**
 * The objective a spawning player of `faction` should face: the nearest
 * tower that is not safely theirs (enemy or neutral, contested, or being
 * pushed by the rivals); the map centre when they hold everything calmly.
 * Returns the wire index (−1 for the centre) and the point.
 */
export function spawnObjective(
  feet: Vec3,
  faction: Faction,
  towers: readonly Pick<TowerControlState, 'owner' | 'contested' | 'pushing'>[],
): { index: number; point: Vec3 } {
  const rival = oppositeFaction(faction);
  let bestIndex = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  CONQUEST_TOWERS.forEach((tower, index) => {
    const state = towers[index];
    if (!state) return;
    const open = state.owner !== faction || state.contested || state.pushing === rival;
    if (!open) return;
    const distance = Math.hypot(tower.position.x - feet.x, tower.position.z - feet.z);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });
  const tower = bestIndex >= 0 ? CONQUEST_TOWERS[bestIndex] : undefined;
  return tower ? { index: bestIndex, point: tower.position } : { index: -1, point: MAP_CENTRE };
}

/**
 * Facing cache keyed by pad id and objective index. Give it a static-world
 * ray (PhysicsWorld.raycastStatic): players, vehicles and other movers must
 * not shape a yaw that is cached for the life of the room. Map destruction
 * (M6) will need a cache epoch.
 */
export class SpawnFacingCache {
  private readonly cache = new Map<string, number>();

  constructor(private readonly world: RayWorld) {}

  yawFor(padId: string, feet: Vec3, objectiveIndex: number, objective: Vec3): number {
    const key = `${padId}|${objectiveIndex}`;
    const cached = this.cache.get(key);
    if (cached !== undefined) return cached;
    const yaw = spawnFacingYaw(this.world, feet, objective);
    this.cache.set(key, yaw);
    return yaw;
  }
}
