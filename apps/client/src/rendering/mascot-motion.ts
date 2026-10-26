/**
 * Small, allocation-free motion helpers shared by the mascot animators.
 * Everything is dt-based: springs integrate in fixed sub-steps so they
 * behave the same at 30, 60 or 144 fps (and stay stable at 5 fps).
 */

export const TAU = Math.PI * 2;

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function saturate(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

export function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = saturate((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Exponential approach, frame-rate independent. */
export function damp(current: number, target: number, rate: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

export function approach(current: number, target: number, amount: number): number {
  if (Math.abs(target - current) <= amount) return target;
  return current + Math.sign(target - current) * amount;
}

export function shortestAngle(from: number, to: number): number {
  let difference = (to - from) % TAU;
  if (difference > Math.PI) difference -= TAU;
  if (difference < -Math.PI) difference += TAU;
  return difference;
}

/** Positive fractional part (phase wrap). */
export function fract(value: number): number {
  return value - Math.floor(value);
}

/** Smallest signed difference between two phases in [0, 1). */
export function phaseDelta(from: number, to: number): number {
  let difference = fract(to - from);
  if (difference > 0.5) difference -= 1;
  return difference;
}

/** Deterministic smooth noise in roughly [-1, 1] (sum of incommensurate sines). */
export function wobble(time: number, seed: number): number {
  return (
    Math.sin(time * 1.7 + seed * 12.9898) * 0.5 +
    Math.sin(time * 2.9 + seed * 78.233) * 0.3 +
    Math.sin(time * 5.3 + seed * 37.719) * 0.2
  );
}

const SPRING_STEP = 1 / 120;

/**
 * Damped spring x'' = k (target - x) - c x'. `kick` adds an instant velocity
 * change (impulses from landings, hits, direction changes).
 */
export class Spring {
  value: number;
  velocity = 0;

  constructor(
    public stiffness: number,
    public damping: number,
    initial = 0,
  ) {
    this.value = initial;
  }

  kick(velocity: number): void {
    this.velocity += velocity;
  }

  step(target: number, dt: number, force = 0): number {
    let remaining = Math.min(dt, 0.25);
    while (remaining > 1e-6) {
      const h = remaining > SPRING_STEP ? SPRING_STEP : remaining;
      this.velocity += ((target - this.value) * this.stiffness - this.velocity * this.damping + force) * h;
      this.value += this.velocity * h;
      remaining -= h;
    }
    return this.value;
  }

  reset(value = 0): void {
    this.value = value;
    this.velocity = 0;
  }
}

/**
 * Pendulum about a pivot that is itself accelerated (the cowbell): angle
 * from the hanging direction, driven by the pivot acceleration along the
 * swing direction. Optional one-sided stop (the bell hitting the chest)
 * reports the impact speed through `lastImpact`.
 */
export class Pendulum {
  angle = 0;
  velocity = 0;
  /** Angular speed of the last stop impact this step (rad/s), 0 if none. */
  lastImpact = 0;

  constructor(
    /** g / length (1/s²). */
    private readonly omegaSquared: number,
    private readonly damping: number,
    private readonly stopMin = -Infinity,
    private readonly stopMax = Infinity,
    private readonly restitution = 0.4,
  ) {}

  /** `acceleration` = pivot acceleration along the swing axis (m/s²) / gravity. */
  step(acceleration: number, dt: number): number {
    this.lastImpact = 0;
    let remaining = Math.min(dt, 0.25);
    while (remaining > 1e-6) {
      const h = remaining > SPRING_STEP ? SPRING_STEP : remaining;
      const torque = -this.omegaSquared * (Math.sin(this.angle) + acceleration * Math.cos(this.angle));
      this.velocity += (torque - this.velocity * this.damping) * h;
      this.angle += this.velocity * h;
      if (this.angle < this.stopMin) {
        this.angle = this.stopMin;
        if (this.velocity < 0) {
          this.lastImpact = Math.max(this.lastImpact, -this.velocity);
          this.velocity = -this.velocity * this.restitution;
        }
      } else if (this.angle > this.stopMax) {
        this.angle = this.stopMax;
        if (this.velocity > 0) {
          this.lastImpact = Math.max(this.lastImpact, this.velocity);
          this.velocity = -this.velocity * this.restitution;
        }
      }
      remaining -= h;
    }
    return this.angle;
  }

  reset(): void {
    this.angle = 0;
    this.velocity = 0;
    this.lastImpact = 0;
  }
}

/** Natural blink scheduler: 120–180 ms blinks every 2–6 s, sometimes double. */
export class Blinker {
  private timer: number;
  private closing = 0;
  private duration = 0.15;
  private pendingDouble = false;

  constructor(private readonly random: () => number = Math.random) {
    this.timer = 1 + this.random() * 3;
  }

  /** Returns lid closure 0 (open) … 1 (shut). */
  update(dt: number): number {
    if (this.closing > 0) {
      this.closing = Math.max(0, this.closing - dt);
      const t = 1 - this.closing / this.duration;
      return Math.sin(Math.PI * Math.min(1, t)) ** 0.6;
    }
    this.timer -= dt;
    if (this.timer <= 0) {
      this.duration = 0.12 + this.random() * 0.06;
      this.closing = this.duration;
      if (this.pendingDouble) {
        this.pendingDouble = false;
        this.timer = 2 + this.random() * 4;
      } else if (this.random() < 0.18) {
        this.pendingDouble = true;
        this.timer = 0.08;
      } else {
        this.timer = 2 + this.random() * 4;
      }
    }
    return 0;
  }

  /** Starts a blink immediately (dev hook). */
  trigger(): void {
    this.duration = 0.16;
    this.closing = this.duration;
  }

  get blinking(): boolean {
    return this.closing > 0;
  }
}
