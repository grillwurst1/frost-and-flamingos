import { InputButton, PHYSICS_TICK_RATE, type CharacterBody, type Vec3 } from '@frost-and-flamingos/shared';

/** Per-bot memory for driving a mascot body. */
export interface MascotBotMemory {
  /** Ticks spent pushing the throttle without moving (stuck on a prop). */
  stuckTicks: number;
  /** While set, back up and turn away from the obstacle. */
  reverseUntilTick: number;
  /** Turn direction used when backing out or patrolling. */
  steerBias: number;
}

function shortestAngle(from: number, to: number): number {
  let difference = (to - from) % (Math.PI * 2);
  if (difference > Math.PI) difference -= Math.PI * 2;
  if (difference < -Math.PI) difference += Math.PI * 2;
  return difference;
}

/** A few per-second odds, converted to a per-tick roll. */
function chance(perSecond: number): boolean {
  return Math.random() < perSecond / PHYSICS_TICK_RATE;
}

export interface MascotBotCommand {
  buttons: number;
  /** Camera yaw: the coconut rolls relative to it, the cow ignores it. */
  yaw: number;
}

/** Coconut pursuit speed the bot steers its velocity toward. */
const COCONUT_PURSUIT_SPEED = 14;

/**
 * Input buttons for a mascot bot. The cow steers its heading toward the
 * target with A/D and gallops/charges on straights; the coconut rolls at the
 * target (its camera yaw is set by the caller), turbo-rolls, jumps and slams.
 * Both use their slot-3 move when rivals are close.
 */
export function mascotBotButtons(
  body: CharacterBody,
  memory: MascotBotMemory,
  target: Vec3 | null,
  targetVelocity: Vec3 | null,
  patrolYaw: number,
  tick: number,
): MascotBotCommand {
  const feet = body.position;
  const velocity = body.velocity;
  const speed = Math.hypot(velocity.x, velocity.z);
  let buttons = 0;
  let yaw = target ? Math.atan2(target.x - feet.x, target.z - feet.z) : patrolYaw;

  if (body.form === 'cow') {
    if (tick < memory.reverseUntilTick) {
      buttons |= InputButton.Backward;
      buttons |= memory.steerBias > 0 ? InputButton.Left : InputButton.Right;
      return { buttons, yaw };
    }
    const distance = target ? Math.hypot(target.x - feet.x, target.z - feet.z) : 99;
    // Lead the target by the time it takes to close the gap.
    const lead = target && targetVelocity ? Math.min(1.2, distance / Math.max(6, speed)) * 0.8 : 0;
    const aimX = target ? target.x + (targetVelocity?.x ?? 0) * lead : 0;
    const aimZ = target ? target.z + (targetVelocity?.z ?? 0) * lead : 0;
    const desired = target ? Math.atan2(aimX - feet.x, aimZ - feet.z) : patrolYaw;
    const error = shortestAngle(body.heading, desired);
    buttons |= InputButton.Forward;
    if (error > 0.1) buttons |= InputButton.Right;
    else if (error < -0.1) buttons |= InputButton.Left;
    const aligned = Math.abs(error) < 0.3;
    // Keep galloping through the target: a trotting cow cannot catch a
    // backpedalling vacationer.
    if (target && aligned) buttons |= InputButton.Sprint;
    if (target && Math.abs(error) < 0.12 && distance > 4 && distance < 14 && chance(1.5)) {
      buttons |= InputButton.Skill1;
    }
    if (target && distance < 3.6 && chance(1.2)) buttons |= InputButton.Skill2;
    if (target && distance < 7 && chance(0.5)) buttons |= InputButton.Skill3OrTaunt;
    if (chance(0.08)) buttons |= InputButton.Jump;
  } else {
    // Coconut: push along (desired velocity − current velocity) so the ball
    // homes in instead of orbiting the target on its own momentum.
    buttons |= InputButton.Forward;
    const distance = target ? Math.hypot(target.x - feet.x, target.z - feet.z) : 99;
    if (target && distance > 0.5) {
      const desiredX = ((target.x - feet.x) / distance) * COCONUT_PURSUIT_SPEED;
      const desiredZ = ((target.z - feet.z) / distance) * COCONUT_PURSUIT_SPEED;
      yaw = Math.atan2(desiredX - velocity.x, desiredZ - velocity.z);
    }
    const height = target ? target.y - feet.y : 0;
    if (target && distance > 6 && distance < 26 && chance(0.7)) buttons |= InputButton.Skill1;
    if (target && (height > 1.2 || (distance < 6 && chance(0.8))) && body.grounded) {
      buttons |= InputButton.Jump;
    }
    if (target && !body.grounded && distance < 4.2 && chance(4)) buttons |= InputButton.Skill2;
    if (target && distance < 6 && chance(0.4)) buttons |= InputButton.Skill3OrTaunt;
    if (memory.stuckTicks > PHYSICS_TICK_RATE && body.grounded) buttons |= InputButton.Jump;
  }

  // Stuck detection: pushing for 1.5 s without moving backs the cow out.
  if (speed < 0.6 && body.grounded) memory.stuckTicks += 1;
  else memory.stuckTicks = Math.max(0, memory.stuckTicks - 2);
  if (memory.stuckTicks > PHYSICS_TICK_RATE * 1.5) {
    memory.stuckTicks = 0;
    memory.steerBias = Math.random() < 0.5 ? -1 : 1;
    memory.reverseUntilTick = tick + Math.round(PHYSICS_TICK_RATE * 1.1);
  }
  return { buttons, yaw };
}
