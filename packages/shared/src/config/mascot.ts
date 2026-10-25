import type { MascotForm } from '../types/index.js';
import type { SurfaceTag } from './map-fjord.js';

/**
 * Mascot class tuning: the Peak Guard cow and the Lagoon League coconut.
 * Every number the shared motor, the server combat code and the HUD use for
 * mascots lives here (move cooldowns, radii and damage live in SKILLS).
 * Speeds are m/s, accelerations m/s², angles rad, times s.
 */

export interface CowTuning {
  /** W without Shift. */
  readonly trotSpeed: number;
  /** W + Shift while the gallop meter has charge. */
  readonly gallopSpeed: number;
  /** Horn Charge burst speed. */
  readonly chargeSpeed: number;
  readonly reverseSpeed: number;
  readonly trotAcceleration: number;
  readonly gallopAcceleration: number;
  readonly chargeAcceleration: number;
  /** S while still moving forward. */
  readonly brakeDeceleration: number;
  /** No throttle: the cow keeps its momentum and slows gently. */
  readonly coastDeceleration: number;
  /** Above the current target speed (e.g. after a charge). */
  readonly overspeedDeceleration: number;
  readonly turnRateStanding: number;
  readonly turnRateGallop: number;
  readonly turnRateCharge: number;
  /** How quickly the yaw rate follows the steering input (rad/s²). */
  readonly turnResponse: number;
  /** Lateral grip: how fast sideways slip is killed. */
  readonly grip: number;
  /** Reduced grip while turning hard above skidSpeed. */
  readonly skidGrip: number;
  readonly skidSpeed: number;
  /** Lateral slip above this counts as a visible skid. */
  readonly skidSlip: number;
  readonly hopSpeed: number;
  readonly hopCooldown: number;
  readonly staminaDrain: number;
  readonly staminaRegen: number;
  readonly staminaRegenIdle: number;
  /** After running dry the gallop unlocks again at this charge. */
  readonly staminaRestart: number;
  readonly swimSpeed: number;
  /** Feet depth below the water surface while swimming (head stays above). */
  readonly swimFeetDepth: number;
  readonly swimTurnRate: number;
  /** Speed lost per second while Hoof Stomp winds up. */
  readonly stompBrake: number;
}

export const COW_TUNING: CowTuning = {
  trotSpeed: 6.4,
  gallopSpeed: 11.5,
  chargeSpeed: 14.5,
  reverseSpeed: 3.2,
  trotAcceleration: 8.5,
  gallopAcceleration: 10.5,
  chargeAcceleration: 28,
  brakeDeceleration: 17,
  coastDeceleration: 4.2,
  overspeedDeceleration: 7,
  turnRateStanding: 2.6,
  turnRateGallop: 1.25,
  turnRateCharge: 1.0,
  turnResponse: 9,
  grip: 30,
  skidGrip: 6.5,
  skidSpeed: 8.2,
  skidSlip: 1.2,
  hopSpeed: 4.4,
  hopCooldown: 0.5,
  staminaDrain: 0.22,
  staminaRegen: 0.16,
  staminaRegenIdle: 0.3,
  staminaRestart: 0.3,
  swimSpeed: 2.6,
  swimFeetDepth: 0.95,
  swimTurnRate: 1.4,
  stompBrake: 22,
};

export interface CoconutTuning {
  readonly rollAcceleration: number;
  /** Top speed the coconut can reach under its own power. Slopes can exceed it. */
  readonly maxRollSpeed: number;
  readonly turboMaxSpeed: number;
  readonly turboAcceleration: number;
  /** Driven above top speed (after a turbo or a slope), the extra speed bleeds off this fast. */
  readonly overspeedDrag: number;
  /** Instant push when Turbo Roll starts. */
  readonly turboKick: number;
  /** Rolling resistance on grass; surfaces scale it (ROLL_RESISTANCE_SCALE). */
  readonly rollingResistance: number;
  /** Fraction of gravity that accelerates the ball along a slope. */
  readonly slopeGravityScale: number;
  readonly airAcceleration: number;
  readonly jumpSpeed: number;
  readonly doubleJumpSpeed: number;
  readonly maxJumps: number;
  /** Grace period after rolling off an edge in which the ground jump still works. */
  readonly coyoteSeconds: number;
  /** Landing faster than this bounces the ball. */
  readonly bounceMinFallSpeed: number;
  readonly bounceRestitution: number;
  readonly bounceMax: number;
  /** Fraction of the blocked speed that bounces back off walls. */
  readonly wallRestitution: number;
  readonly wallBounceMinSpeed: number;
  readonly poundSpeed: number;
  readonly poundBounce: number;
  /** Feet depth below the surface while floating (the top of the shell stays dry). */
  readonly floatFeetDepth: number;
  readonly paddleSpeed: number;
  readonly paddleAcceleration: number;
  readonly waterJumpSpeed: number;
  /** Absolute horizontal speed cap (steep slopes, launches). */
  readonly hardSpeedCap: number;
}

export const COCONUT_TUNING: CoconutTuning = {
  rollAcceleration: 13,
  maxRollSpeed: 10.5,
  turboMaxSpeed: 17.5,
  turboAcceleration: 30,
  overspeedDrag: 3.5,
  turboKick: 4.5,
  rollingResistance: 1.3,
  slopeGravityScale: 0.62,
  airAcceleration: 5,
  jumpSpeed: 10.2,
  doubleJumpSpeed: 8.6,
  maxJumps: 2,
  coyoteSeconds: 0.12,
  bounceMinFallSpeed: 7.5,
  bounceRestitution: 0.36,
  bounceMax: 7.5,
  wallRestitution: 0.38,
  wallBounceMinSpeed: 4,
  poundSpeed: 28,
  poundBounce: 8.5,
  floatFeetDepth: 0.6,
  paddleSpeed: 3.4,
  paddleAcceleration: 8,
  waterJumpSpeed: 7.2,
  hardSpeedCap: 26,
};

/** Rolling resistance multipliers: sand drags, ice and snow let the ball run. */
export const ROLL_RESISTANCE_SCALE: Record<SurfaceTag, number> = {
  water: 2,
  sand: 2.2,
  grass_mud: 1,
  cobblestone: 0.9,
  snow: 0.8,
  ice_patch: 0.15,
  rock_cliff: 1,
  wood: 0.85,
};

/**
 * Ram ("umrammen") tuning. Contact with an enemy while the closing speed is
 * above minSpeed deals damage scaled linearly up to fullSpeed and launches the
 * victim. Friendly contact is a harmless bump.
 */
export interface MascotRamTuning {
  readonly minSpeed: number;
  readonly fullSpeed: number;
  readonly minDamage: number;
  readonly maxDamage: number;
  /** Damage multiplier while Horn Charge / Turbo Roll is active. */
  readonly boostMultiplier: number;
  readonly launchHorizontal: number;
  readonly launchHorizontalPerSpeed: number;
  readonly launchVertical: number;
  readonly launchVerticalPerSpeed: number;
  readonly launchHorizontalCap: number;
  /** Victim air-control loss after a launch. */
  readonly launchSeconds: number;
  /** One ram per victim per this many seconds. */
  readonly victimCooldown: number;
  /** Fraction of the mascot's horizontal speed kept after an enemy hit. */
  readonly recoilKeep: number;
  /** Small hop of the mascot after a hit. */
  readonly recoilHop: number;
  /** Contact sphere: forward offset along the heading, height and radius. */
  readonly contactForward: number;
  readonly contactHeight: number;
  readonly contactRadius: number;
}

export const MASCOT_RAM: Record<MascotForm, MascotRamTuning> = {
  cow: {
    minSpeed: 4.5,
    fullSpeed: 12,
    minDamage: 25,
    maxDamage: 85,
    boostMultiplier: 1.3,
    launchHorizontal: 6,
    launchHorizontalPerSpeed: 0.6,
    launchVertical: 7.5,
    launchVerticalPerSpeed: 0.25,
    launchHorizontalCap: 17,
    launchSeconds: 0.9,
    victimCooldown: 0.8,
    recoilKeep: 0.45,
    recoilHop: 1.5,
    contactForward: 0.8,
    contactHeight: 0.85,
    contactRadius: 0.85,
  },
  coconut: {
    minSpeed: 4,
    fullSpeed: 16,
    minDamage: 20,
    maxDamage: 95,
    boostMultiplier: 1,
    launchHorizontal: 7.5,
    launchHorizontalPerSpeed: 0.65,
    launchVertical: 5,
    launchVerticalPerSpeed: 0.2,
    launchHorizontalCap: 18,
    launchSeconds: 0.8,
    victimCooldown: 0.7,
    recoilKeep: 0.55,
    recoilHop: 3,
    contactForward: 0,
    contactHeight: 0.7,
    contactRadius: 0.78,
  },
};

/** Teammates are only nudged. */
export const MASCOT_FRIENDLY_BUMP = {
  horizontal: 3.5,
  vertical: 2,
  launchSeconds: 0.3,
  keep: 0.8,
} as const;

/** Knockback of the radial moves (damage and radius come from SKILLS). */
export const MASCOT_SHOCKWAVE = {
  stomp: { horizontal: 7, vertical: 6.5, launchSeconds: 0.7, verticalReach: 2.5 },
  pound: { horizontal: 8, vertical: 7, launchSeconds: 0.75, verticalReach: 3 },
} as const;

/** Cowbell daze and coconut-milk puddle behaviour. */
export const MASCOT_STATUS = {
  /** Movement scale while dazed (same as the smoke-bomb slow). */
  dazeSpeedScale: 0.62,
  /** Puddle traction counts only within this height of the puddle surface. */
  puddleVerticalReach: 1.6,
  /** Puddle visuals and the server table hold at most this many puddles. */
  maxPuddles: 8,
} as const;

/** Authoritative status speed scales shared by server and client prediction. */
export const STATUS_SLOW_SCALE = 0.62;
export const STATUS_BOOST_SCALE = 1.5;

/** Horizontal rewind for human mascots' ram tests, approximating interpolation delay. */
export const MASCOT_RAM_REWIND_TICKS = 6;
