import { FIXED_DT, GRAVITY } from '../constants.js';
import { InputButton, type Vec3 } from '../types/index.js';

export const AIRCRAFT_RULES = {
  takeoffSpeed: 14, cruiseSpeed: 20, maxSpeed: 28, acceleration: 6,
  maxPitch: 0.65, maxBank: 0.68, ceiling: 165, safeLandingSpeed: 7,
  propeller: { center: { x: -0.023, y: 1.81, z: 2.389 }, radius: 0.86, depth: 0.28 },
} as const;

export interface AircraftState {
  position: Vec3; velocity: Vec3; yaw: number; pitch: number; roll: number;
  grounded: boolean;
}
export interface AircraftControl { buttons: number; yaw: number; pitch: number }
export interface AircraftStep { velocity: Vec3; yaw: number; yawRate: number; pitch: number; roll: number; takingOff: boolean }
const clamp = (n: number, min: number, max: number): number => Math.max(min, Math.min(max,n));
const approach = (value: number, target: number, delta: number): number => value + clamp(target-value,-delta,delta);
const angle = (n: number): number => Math.atan2(Math.sin(n),Math.cos(n));

/** Fixed-step arcade flight. World collisions are resolved by VehicleBody on both peers. */
export function advanceAircraft(state: AircraftState, input: AircraftControl | null): AircraftStep {
  const rules = AIRCRAFT_RULES, dt = FIXED_DT, buttons = input?.buttons ?? 0;
  const throttle = (buttons & InputButton.Forward ? 1 : 0) - (buttons & InputButton.Backward ? 1 : 0);
  const rudder = (buttons & InputButton.Right ? 1 : 0) - (buttons & InputButton.Left ? 1 : 0);
  const current = Math.min(rules.maxSpeed,Math.hypot(state.velocity.x,state.velocity.y,state.velocity.z));
  const targetSpeed = !input ? 0 : state.grounded ? throttle > 0 ? rules.maxSpeed : 0
    : throttle > 0 ? rules.maxSpeed : throttle < 0 ? rules.takeoffSpeed : rules.cruiseSpeed;
  const speed = approach(current,targetSpeed,(state.grounded && throttle<=0 ? 3 : rules.acceleration)*dt);
  const canLift = speed >= rules.takeoffSpeed;
  const requestedPitch = input ? clamp(input.pitch,-0.55,rules.maxPitch) : -0.22;
  const takingOff = state.grounded && canLift && requestedPitch > 0.06;
  const pitchTarget = state.grounded && !takingOff ? 0 : !canLift ? -0.22 : requestedPitch;
  const pitch = approach(state.pitch,state.position.y >= rules.ceiling ? Math.min(0,pitchTarget) : pitchTarget,0.75*dt);
  const turn = input ? angle(input.yaw-state.yaw) : 0;
  const authority = clamp(speed/14,0,1);
  const yawRate = clamp(turn*1.4+rudder*0.55,-0.95,0.95)*authority;
  const yaw = angle(state.yaw+yawRate*dt);
  const targetBank = state.grounded && !takingOff ? 0 : -clamp(turn*0.95+rudder*0.28,-rules.maxBank,rules.maxBank);
  const roll = approach(state.roll,targetBank,1.15*dt);
  let vy = state.grounded && !takingOff ? -1.5 : canLift ? Math.sin(pitch)*speed : Math.max(-40,state.velocity.y+GRAVITY*0.35*dt);
  if (state.position.y >= rules.ceiling) vy = Math.min(0,vy);
  const planar = canLift ? speed * Math.cos(pitch) : speed;
  return {velocity:{x:Math.sin(yaw)*planar,y:vy,z:Math.cos(yaw)*planar},yaw,yawRate,pitch,roll,takingOff};
}
