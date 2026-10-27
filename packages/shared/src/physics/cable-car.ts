import { PHYSICS_TICK_RATE } from '../constants.js';
import { FJORD_ROUTES } from '../config/map/routes.js';
import { sampleRoute } from '../config/map/math.js';
import type { Vec3 } from '../types/index.js';

/** One shared route and clock; no Rapier dynamic joints or per-frame route construction. */
export const CABLE_CAR_RULES = { stopSeconds: 3, brakeSeconds: 2, laneOffset: 2.2, leverRange: 2.4, leverRadius: 0.32 } as const;
const route = FJORD_ROUTES.cableCar;
const legTicks = Math.round(route.legSeconds * PHYSICS_TICK_RATE);
const stopTicks = CABLE_CAR_RULES.stopSeconds * PHYSICS_TICK_RATE;
export const CABLE_CAR_CYCLE_TICKS = (legTicks + stopTicks) * 4;
const stops = [0, 1, 2, 1, 0] as const;

export interface CableCarPose { position: Vec3; yaw: number; stopped: boolean; station: number | null }

/** Cabin 0 starts at the valley; cabin 1 at the summit on the other haul-rope lane. */
export function sampleCableCar(tick: number, cabin: 0 | 1): CableCarPose {
  const phase = ((tick + cabin * CABLE_CAR_CYCLE_TICKS / 2) % CABLE_CAR_CYCLE_TICKS + CABLE_CAR_CYCLE_TICKS) % CABLE_CAR_CYCLE_TICKS;
  const leg = Math.floor(phase / (legTicks + stopTicks));
  const elapsed = phase - leg * (legTicks + stopTicks);
  const from = route.stations[stops[leg]!]!, to = route.stations[stops[leg + 1]!]!;
  const t = Math.max(0, Math.min(1, (elapsed - stopTicks) / legTicks));
  // Smooth acceleration at station thresholds keeps riders out of abrupt velocity jumps.
  const u = t * t * (3 - 2 * t);
  const sample = sampleRoute(route.gondolaPath, from.pathDistance + (to.pathDistance - from.pathDistance) * u);
  const yaw = Math.atan2(sample.tangent.x, sample.tangent.z);
  const lane = cabin === 0 ? CABLE_CAR_RULES.laneOffset : -CABLE_CAR_RULES.laneOffset;
  return { position: { x: sample.position.x + Math.cos(yaw) * lane, y: sample.position.y + 0.06,
    z: sample.position.z - Math.sin(yaw) * lane }, yaw, stopped: elapsed <= stopTicks, station: elapsed <= stopTicks ? stops[leg]! : null };
}

export function cableCabinAt(position: Vec3): 0 | 1 {
  const a = sampleCableCar(0, 0).position, b = sampleCableCar(0, 1).position;
  return Math.hypot(position.x - a.x, position.z - a.z) <= Math.hypot(position.x - b.x, position.z - b.z) ? 0 : 1;
}
