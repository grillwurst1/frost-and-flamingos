import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { JointDriver, LegSolver } from './mascot-rig';
import { relativePosition } from './mascot-rig';
import {
  Blinker,
  Pendulum,
  Spring,
  TAU,
  clamp,
  damp,
  fract,
  lerp,
  phaseDelta,
  saturate,
  shortestAngle,
  smoothstep,
  wobble,
} from './mascot-motion';

/**
 * Procedural animation of the Peak Guard cow, independent of the rig it
 * drives (the procedural mesh in mascot-cow.ts or the owner's Meshy model in
 * cow-model.ts).
 *
 * Gaits: a 4-beat lateral-sequence WALK, a diagonal-pair TROT and a
 * transverse GALLOP for sprint/charge, blended by ground speed. Every leg
 * follows the same stance/swing cycle; during stance the hoof slides back
 * under the body at exactly the body speed (stride length x cadence = speed,
 * cadence raised when the stride would outgrow the legs), so planted hooves
 * never skate. Two-bone IK (LegSolver) puts the hooves on the ground while
 * the body bobs, pitches, rears and squashes.
 *
 * Secondary motion: head nod + look toward the aim, bell as a damped
 * pendulum that clanks against the chest, a 4-segment spring tail, ear
 * flicks, blinks, angry brows while charging, idle chewing/breathing/looking
 * around/grazing, jump tuck, landing squash, hit flinch, charge pose, hoof
 * stomp rear-up and a comic topple-over death.
 */

export type CowJointName =
  | 'body'
  | 'chest'
  | 'neck'
  | 'head'
  | 'jaw'
  | 'tongue'
  | 'earL'
  | 'earR'
  | 'bell'
  | 'tail0'
  | 'tail1'
  | 'tail2'
  | 'tail3'
  | 'eyeL'
  | 'eyeR'
  | 'lidL'
  | 'lidR'
  | 'browL'
  | 'browR';

/** A rig the animator can drive. Legs are front-left, front-right, hind-left, hind-right. */
export interface CowSkeleton {
  readonly root: TransformNode;
  /** Barrel-centre pivot carrying the whole body motion (identity rest rotation). */
  readonly visual: TransformNode;
  readonly visualRestY: number;
  readonly joints: Partial<Record<CowJointName, JointDriver>>;
  readonly legs: readonly LegSolver[];
  /** Nodes from the root down to each hip, parent first (forced world-matrix refresh). */
  readonly legChains: readonly (readonly TransformNode[])[];
  /** True when the front legs hang from the `chest` joint. */
  readonly frontFromChest: boolean;
  /** Height of the barrel centre above the ground when lying on its side. */
  readonly lyingHeight: number;
  /** Rest-pose corrections of the neck (the Meshy head is turned at rest). */
  readonly neckYawBias: number;
  readonly neckPitchBias: number;
  /** The bell hangs from the `neck` joint (procedural) or the `head` joint (Meshy). */
  readonly bellParent: 'neck' | 'head';
}

export interface LegPose {
  /** 0 = IK (sole target), 1 = explicit joint deltas. */
  mode: number;
  y: number;
  z: number;
  tuck: number;
  hoof: number;
  hip: number;
  knee: number;
  middle: number;
  splay: number;
}

/** Output of one animator step (reused every frame). */
export class CowPose {
  bodyY = 0;
  bodyZ = 0;
  bodyPitch = 0;
  bodyRoll = 0;
  bodyYaw = 0;
  squashY = 1;
  squashXZ = 1;
  chestPitch = 0;
  chestYaw = 0;
  neckPitch = 0;
  neckYaw = 0;
  neckRoll = 0;
  headPitch = 0;
  headYaw = 0;
  headRoll = 0;
  jawOpen = 0;
  jawSide = 0;
  tongue = 0;
  /** Ears: swept back (+) and drooped (+). */
  earLBack = 0;
  earLDroop = 0;
  earRBack = 0;
  earRDroop = 0;
  bellPitch = 0;
  bellRoll = 0;
  readonly tailPitch = new Float64Array(4);
  readonly tailYaw = new Float64Array(4);
  blink = 0;
  /** -1 worried … 0 neutral … 1 angry. */
  mood = 0;
  eyeYaw = 0;
  eyeSpin = 0;
  ko = 0;
  readonly legs: LegPose[] = [0, 1, 2, 3].map(() => ({
    mode: 0,
    y: 0,
    z: 0,
    tuck: 0,
    hoof: 0,
    hip: 0,
    knee: 0,
    middle: 0,
    splay: 0,
  }));
}

export interface CowDrive {
  /** Signed speed along the heading, and sideways (m/s). */
  forward: number;
  lateral: number;
  vertical: number;
  /** Smoothed accelerations in the body frame (m/s²). */
  forwardAccel: number;
  lateralAccel: number;
  yawRate: number;
  /** Look yaw minus heading (rad). */
  aim: number;
  grounded: boolean;
  swimming: boolean;
  alive: boolean;
  launched: boolean;
  dazed: boolean;
  charging: boolean;
  /** Hoof Stomp wind-up 0…1, or -1 when not stomping. */
  stomp: number;
  skidding: boolean;
  galloping: boolean;
  /** Terrain height difference front minus back over the leg base (m). */
  slope: number;
  /** Vitality 0…1 (low = worried look). */
  vitality: number;
  /** Wardrobe/menu preview: idle only, never grazes. */
  preview: boolean;
}

interface Gait {
  duty: number;
  /** Phase offsets FL, FR, HL, HR. */
  offsets: readonly [number, number, number, number];
  lift: number;
  frontLift: number;
  cadence: (speed: number) => number;
}

const WALK: Gait = {
  duty: 0.66,
  offsets: [0.25, 0.75, 0, 0.5],
  lift: 0.1,
  frontLift: 0.12,
  cadence: (speed) => 0.8 + speed * 0.55,
};
const TROT: Gait = {
  duty: 0.4,
  offsets: [0, 0.5, 0.5, 0],
  lift: 0.15,
  frontLift: 0.19,
  cadence: (speed) => 1.55 + speed * 0.28,
};
const GALLOP: Gait = {
  duty: 0.3,
  offsets: [0.5, 0.62, 0, 0.1],
  lift: 0.2,
  frontLift: 0.24,
  cadence: (speed) => 2.05 + speed * 0.1,
};

const STOMP_RISE = 0.6;

const scratchHip = new Vector3();
const scratchQuat = new Quaternion();

function blendOffset(walk: number, trot: number, gallop: number, wTrot: number, wGallop: number): number {
  // Circular blend around the walk offset so 0.95 and 0.05 average to 0.
  return fract(walk + phaseDelta(walk, trot) * wTrot + phaseDelta(walk, gallop) * wGallop);
}

export class CowAnimator {
  readonly pose = new CowPose();
  /** Footfalls this step as a bit mask (bit i = leg i touched down). */
  footfalls = 0;
  /** Strength of a bell-on-chest clank this step (0 = none). */
  bellClank = 0;
  /** Set when the toppling cow hits the ground. */
  thud = 0;
  /** Gait weights, for dust and audio. */
  walkWeight = 1;
  trotWeight = 0;
  gallopWeight = 0;
  /** Current cadence (cycles per second). */
  cadence = 0;

  private phase = Math.random();
  private time = Math.random() * 100;
  private idle = 0;
  private air = new Spring(70, 14);
  private landDip = new Spring(160, 13);
  private squash = new Spring(190, 11);
  private flinch = new Spring(130, 9);
  private flinchSide = 1;
  private lean = new Spring(40, 9);
  private pitchLean = new Spring(40, 9);
  private brace = new Spring(60, 12);
  private stompBlend = new Spring(90, 14);
  private slam = 0;
  private wasStomping = false;
  private topple = new Spring(38, 6.5);
  private toppleSide = 1;
  private deadTime = 0;
  private thudDone = false;
  private launchSpin = 0;
  private readonly bellSwing = new Pendulum(48, 1.6, -0.3, 1.25, 0.42);
  private readonly bellSide = new Pendulum(48, 1.8, -0.9, 0.9, 0.5);
  private bellCooldown = 0;
  private readonly tail = [0, 1, 2, 3].map(() => ({ pitch: new Spring(60, 6), yaw: new Spring(60, 5) }));
  private tailSwish = 0;
  private swishTimer = 2;
  private readonly earL = { pitch: new Spring(110, 8), roll: new Spring(110, 7) };
  private readonly earR = { pitch: new Spring(110, 8), roll: new Spring(110, 7) };
  private earFlickTimer = 3;
  private earFlick = 0;
  private earFlickSide = 1;
  private readonly blinker = new Blinker();
  private hurtTimer = 0;
  private cryTimer = 0;
  private clangTimer = 0;
  private lookTimer = 2;
  private lookYaw = 0;
  private lookPitch = 0;
  private headYaw = new Spring(40, 10);
  private headPitch = new Spring(40, 10);
  private chew = 0;
  private graze = new Spring(10, 6);
  private readonly stanceWas = [true, true, true, true];
  private readonly offsets = new Float64Array(4);
  private moodValue = 0;
  private wasGrounded = true;
  private fallSpeed = 0;
  private stepAmount = 0;
  private gaitLift = 0;
  private flight = 0;

  constructor(private readonly strideLimit: number) {}

  /** Gameplay reactions: landing impact, hit, battle cry / moo, cowbell clang. */
  react(kind: 'hurt' | 'cry' | 'clang' | 'impact', strength = 1): void {
    if (kind === 'hurt') {
      this.hurtTimer = 0.32;
      this.flinchSide = Math.random() < 0.5 ? -1 : 1;
      this.flinch.kick(6 * strength);
      this.bellSwing.velocity -= 3;
    } else if (kind === 'cry') {
      this.cryTimer = 0.9;
    } else if (kind === 'clang') {
      this.clangTimer = 0.9;
      this.bellSide.velocity += 7;
      this.bellSwing.velocity += 4;
    } else {
      this.squash.kick(-3.2 * strength);
      this.landDip.kick(-1.6 * strength);
      this.bellSwing.velocity += 3 * strength;
    }
  }

  forceBlink(): void {
    this.blinker.trigger();
  }

  /** Puts the cow back on its feet (respawn, new rig). */
  reset(): void {
    this.topple.reset(0);
    this.deadTime = 0;
    this.thudDone = false;
    this.launchSpin = 0;
    this.bellSwing.reset();
    this.bellSide.reset();
    this.air.reset(0);
    this.stompBlend.reset(0);
  }

  update(dt: number, drive: CowDrive): CowPose {
    const pose = this.pose;
    this.time += dt;
    this.footfalls = 0;
    this.bellClank = 0;
    this.thud = 0;
    this.hurtTimer = Math.max(0, this.hurtTimer - dt);
    this.cryTimer = Math.max(0, this.cryTimer - dt);
    this.clangTimer = Math.max(0, this.clangTimer - dt);
    this.bellCooldown = Math.max(0, this.bellCooldown - dt);
    const t = this.time;

    const speed = Math.abs(drive.forward);
    const planar = Math.hypot(drive.forward, drive.lateral);
    const grounded = drive.grounded || drive.swimming;
    const airborne = !grounded;
    if (airborne) this.fallSpeed = Math.max(this.fallSpeed, -drive.vertical);
    if (grounded && !this.wasGrounded && drive.alive) {
      const impact = this.fallSpeed;
      if (impact > 2) {
        this.squash.kick(-Math.min(4.5, impact * 0.34));
        this.landDip.kick(-Math.min(2.6, impact * 0.22));
        this.bellSwing.velocity += Math.min(6, impact * 0.5);
        this.earL.pitch.kick(impact * 0.8);
        this.earR.pitch.kick(impact * 0.8);
      }
      this.fallSpeed = 0;
    }
    if (grounded) this.fallSpeed = 0;
    this.wasGrounded = grounded;

    // --- gait weights and phase -------------------------------------------------
    const forcedGallop = (drive.galloping || drive.charging) && speed > 4;
    let wGallop = forcedGallop ? 1 : smoothstep(7.6, 9.2, speed);
    let wWalk = 1 - smoothstep(1.7, 3.0, speed);
    wWalk = Math.min(wWalk, 1 - wGallop);
    let wTrot = Math.max(0, 1 - wWalk - wGallop);
    if (drive.swimming) {
      wWalk = 1;
      wTrot = 0;
      wGallop = 0;
    }
    this.walkWeight = damp(this.walkWeight, wWalk, 6, dt);
    this.trotWeight = damp(this.trotWeight, wTrot, 6, dt);
    this.gallopWeight = damp(this.gallopWeight, wGallop, 6, dt);
    const total = this.walkWeight + this.trotWeight + this.gallopWeight || 1;
    wWalk = this.walkWeight / total;
    wTrot = this.trotWeight / total;
    wGallop = this.gallopWeight / total;

    const turning = Math.abs(drive.yawRate) * 0.55;
    const effective = Math.max(speed, turning, drive.swimming ? 1.4 : 0);
    const stepTarget = grounded && drive.alive && drive.stomp < 0 ? smoothstep(0.08, 0.7, effective) : 0;
    this.stepAmount = damp(this.stepAmount, stepTarget, 9, dt);
    const duty = WALK.duty * wWalk + TROT.duty * wTrot + GALLOP.duty * wGallop;
    let cadence =
      WALK.cadence(effective) * wWalk + TROT.cadence(effective) * wTrot + GALLOP.cadence(effective) * wGallop;
    // Stride = speed / cadence; the stance sweep (duty x stride) must fit the
    // legs, so the cadence rises when the stride would outgrow them. Small
    // steps while starting (stepAmount < 1) slow the cycle, never the hooves.
    const limit = Math.max(0.12, this.strideLimit * (1 + wGallop * 0.35 + wTrot * 0.15));
    cadence = Math.max(cadence * this.stepAmount, (speed * duty) / limit);
    this.cadence = cadence;
    const direction = drive.forward < -0.05 ? -1 : 1;
    this.phase = fract(this.phase + cadence * dt * direction);
    const sweep = cadence > 1e-4 ? (speed * duty) / cadence : 0;
    const phase = this.phase;
    const lift = (WALK.lift * wWalk + TROT.lift * wTrot + GALLOP.lift * wGallop) * this.stepAmount;
    const frontLift = (WALK.frontLift * wWalk + TROT.frontLift * wTrot + GALLOP.frontLift * wGallop) * this.stepAmount;
    this.gaitLift = lift;

    // --- whole-body motion ---------------------------------------------------------
    const amount = this.stepAmount;
    const walkBob = -0.016 * (0.5 + 0.5 * Math.cos(TAU * 2 * (phase - 0.1)));
    const trotBob = -0.038 * (0.5 + 0.5 * Math.cos(TAU * 2 * (phase - 0.2)));
    const gallopBob = -0.06 * (0.5 + 0.5 * Math.cos(TAU * 2 * (phase - 0.1))) + 0.03;
    const bob = (walkBob * wWalk + trotBob * wTrot + gallopBob * wGallop) * amount;
    const gallopPitch = -0.11 * Math.cos(TAU * (phase - 0.1)) * wGallop;
    const trotPitch = 0.018 * Math.sin(TAU * 2 * (phase - 0.2)) * wTrot;
    const walkPitch = 0.012 * Math.sin(TAU * 2 * phase) * wWalk;
    const walkRoll = 0.035 * Math.sin(TAU * (phase + 0.1)) * wWalk;
    const trotRoll = 0.014 * Math.sin(TAU * phase) * wTrot;
    this.flight = wGallop * amount;

    const turnLean = this.lean.step(clamp(-drive.lateralAccel * 0.012 - drive.yawRate * speed * 0.01, -0.2, 0.2), dt);
    const accelPitch = this.pitchLean.step(clamp(-drive.forwardAccel * 0.006, -0.1, 0.1), dt);
    const braceTarget = drive.skidding || (drive.forwardAccel < -9 && speed > 3) ? 1 : 0;
    const brace = this.brace.step(braceTarget, dt);
    const airTarget = airborne && drive.alive && !drive.launched ? 1 : 0;
    const air = saturate(this.air.step(airTarget, dt));
    const dip = this.landDip.step(0, dt);
    const squash = this.squash.step(0, dt);
    const flinch = this.flinch.step(0, dt);

    // Stomp: rear up on the hind legs, then slam.
    const stomping = drive.stomp >= 0;
    if (this.wasStomping && !stomping) {
      this.slam = 0.32;
      this.squash.kick(-3);
      this.landDip.kick(-1.4);
      this.bellSwing.velocity += 5;
    }
    this.wasStomping = stomping;
    this.slam = Math.max(0, this.slam - dt);
    const rise = this.stompBlend.step(stomping ? Math.sin(Math.min(1, drive.stomp * 1.25) * Math.PI * 0.5) : 0, dt);

    // Death: topple onto the side with a bounce.
    if (!drive.alive) {
      if (this.deadTime === 0) {
        this.toppleSide = Math.random() < 0.5 ? -1 : 1;
        this.thudDone = false;
      }
      this.deadTime += dt;
    } else if (this.deadTime > 0) {
      this.reset();
    }
    const toppled = this.topple.step(drive.alive ? 0 : 1, dt);
    if (!drive.alive && !this.thudDone && toppled > 0.96) {
      this.thudDone = true;
      this.thud = 1;
      this.bellSwing.velocity += 6;
    }
    const lying = clamp(toppled, 0, 1.15);

    // Knocked flying: tumble.
    if (drive.launched && drive.alive) this.launchSpin += dt * 9;
    else this.launchSpin = damp(this.launchSpin, Math.round(this.launchSpin / TAU) * TAU, 8, dt);

    const swim = drive.swimming ? 1 : 0;
    pose.bodyY =
      bob * (1 - air) +
      dip * 0.14 +
      rise * STOMP_RISE * 0.34 -
      brace * 0.04 -
      swim * (0.32 + Math.sin(t * 2.4) * 0.03) +
      air * clamp(drive.vertical * 0.01, -0.04, 0.04);
    pose.bodyZ = -rise * 0.12;
    pose.bodyPitch =
      (gallopPitch + trotPitch + walkPitch) * amount * (1 - air) +
      accelPitch -
      brace * 0.07 -
      rise * 0.62 +
      (this.slam > 0 ? 0.07 * (this.slam / 0.32) : 0) +
      air * clamp(-drive.vertical * 0.03, -0.22, 0.25) -
      Math.atan2(drive.slope, 1.0) * (1 - air) -
      flinch * 0.05 -
      swim * 0.12;
    const tumble = drive.launched && drive.alive ? this.launchSpin : 0;
    pose.bodyRoll =
      (walkRoll + trotRoll) * amount +
      turnLean +
      flinch * 0.06 * this.flinchSide +
      lying * (Math.PI / 2 + 0.08) * this.toppleSide +
      tumble +
      (drive.dazed ? Math.sin(t * 2.1) * 0.05 : 0);
    pose.bodyYaw = drive.dazed ? Math.sin(t * 1.3) * 0.05 : 0;
    const breathe = Math.sin(t * TAU * 0.28) * 0.012;
    pose.squashY = 1 + squash * 0.22 + breathe * (1 - amount);
    pose.squashXZ = 1 - squash * 0.12 - breathe * 0.4 * (1 - amount);
    // Rest the barrel on its side: the centre drops to the lying height.
    pose.bodyY += this.lyingDrop * Math.min(1, lying);
    pose.chestPitch = (0.09 * Math.sin(TAU * (phase - 0.55)) * wGallop * amount) + rise * 0.1;
    pose.chestYaw = clamp(drive.yawRate * 0.05, -0.1, 0.1);

    // --- head, neck, face ------------------------------------------------------------
    const idleNow = grounded && planar < 0.25 && Math.abs(drive.yawRate) < 0.3 && drive.alive && !stomping;
    this.idle = idleNow ? this.idle + dt : 0;
    this.lookTimer -= dt;
    if (this.lookTimer <= 0) {
      this.lookTimer = 2.5 + Math.random() * 3.5;
      this.lookYaw = (Math.random() - 0.5) * 1.1;
      this.lookPitch = (Math.random() - 0.5) * 0.3;
    }
    const idleWeight = smoothstep(0.6, 1.6, this.idle);
    const grazing = this.graze.step(!drive.preview && this.idle > 9 && Math.sin(this.idle * 0.35) > -0.6 ? 1 : 0, dt);
    const aim = clamp(drive.aim, -1.3, 1.3);
    const charging = drive.charging && drive.alive ? 1 : 0;
    const yawTarget =
      (aim * 0.5 + drive.yawRate * 0.12) * (1 - idleWeight * 0.6) + this.lookYaw * idleWeight * (1 - grazing);
    const pitchTarget = this.lookPitch * idleWeight * (1 - grazing);
    const headYaw = this.headYaw.step(clamp(yawTarget, -0.75, 0.75) * (1 - charging * 0.7), dt);
    const headPitchLook = this.headPitch.step(pitchTarget, dt);
    const nodWalk = Math.sin(TAU * 2 * (phase + 0.05)) * 0.06 * wWalk;
    const nodTrot = Math.sin(TAU * 2 * (phase - 0.15)) * 0.035 * wTrot;
    const nodGallop = Math.sin(TAU * (phase - 0.3)) * 0.08 * wGallop;
    const clangShake = this.clangTimer > 0 ? Math.sin(this.clangTimer * 34) * 0.28 * (this.clangTimer / 0.9) : 0;
    const hurtJerk = this.hurtTimer > 0 ? -0.25 * (this.hurtTimer / 0.32) : 0;
    pose.neckPitch =
      (nodWalk + nodTrot + nodGallop) * amount -
      pose.bodyPitch * 0.45 * (1 - lying) +
      charging * 0.5 +
      grazing * 0.95 +
      headPitchLook +
      hurtJerk +
      swim * -0.35 +
      rise * 0.25 +
      air * clamp(drive.vertical * 0.02, -0.15, 0.12) +
      lying * 0.25;
    pose.neckYaw = headYaw * 0.65 + (drive.dazed ? Math.sin(t * 2.6) * 0.18 : 0);
    pose.neckRoll = clangShake * 0.6 + (drive.dazed ? Math.sin(t * 2.6 + 1.2) * 0.14 : 0) - turnLean * 0.4 + lying * 0.3 * this.toppleSide;
    pose.headPitch = charging * 0.14 + grazing * 0.25 - this.cryTimer * 0.25;
    pose.headYaw = headYaw * 0.35 + clangShake;
    pose.headRoll = idleWeight * Math.sin(t * 1.1) * 0.03 + (drive.dazed ? Math.sin(t * 5) * 0.2 : 0);

    // Chewing: cud-grinding sideways circle while idle or grazing; mouth open on a moo.
    const chewing = drive.alive ? Math.max(idleWeight, grazing) : 0;
    this.chew += dt * (1.5 + grazing * 0.6) * chewing;
    const moo = this.cryTimer > 0 ? Math.sin(Math.min(1, (0.9 - this.cryTimer) * 4) * Math.PI * 0.5) * (this.cryTimer > 0.15 ? 1 : this.cryTimer / 0.15) : 0;
    pose.jawOpen = (Math.max(0, Math.sin(this.chew * TAU)) * 0.08 * chewing + moo * 0.45 + (drive.alive ? 0 : 0.3)) * 1;
    pose.jawSide = Math.cos(this.chew * TAU) * 0.08 * chewing;
    pose.tongue = drive.alive ? 0 : smoothstep(0.4, 1.2, this.deadTime);
    // Subtle head motion carries the chewing on rigs without a jaw.
    pose.headRoll += Math.cos(this.chew * TAU) * 0.012 * chewing;
    pose.headPitch += Math.max(0, Math.sin(this.chew * TAU)) * 0.01 * chewing;

    // Mood: angry while charging/stomping/clanging, worried when dazed/hurt/low.
    const angry = charging || stomping || this.clangTimer > 0 || this.cryTimer > 0 ? 1 : drive.skidding ? 0.5 : 0;
    const worried = drive.dazed || drive.launched || drive.vitality < 0.3 ? 1 : 0;
    this.moodValue = damp(this.moodValue, angry > 0 ? angry : -worried, 10, dt);
    pose.mood = this.moodValue;
    const blink = this.blinker.update(dt);
    pose.blink = !drive.alive ? 1 : this.hurtTimer > 0 ? 1 : Math.max(blink, charging * 0.3, grazing * 0.35);
    pose.ko = drive.alive ? 0 : 1;
    pose.eyeYaw = clamp(aim * 0.4 + drive.yawRate * 0.15, -0.35, 0.35) + (idleWeight > 0.5 ? this.lookYaw * 0.4 : 0);
    pose.eyeSpin = drive.dazed ? t * 9 : 0;

    // --- ears -------------------------------------------------------------------------
    this.earFlickTimer -= dt;
    if (this.earFlickTimer <= 0) {
      this.earFlickTimer = 1.8 + Math.random() * 3.6;
      this.earFlick = 0.22;
      this.earFlickSide = Math.random() < 0.5 ? -1 : 1;
    }
    this.earFlick = Math.max(0, this.earFlick - dt);
    const flick = this.earFlick > 0 ? Math.sin((1 - this.earFlick / 0.22) * Math.PI * 2) * 0.7 : 0;
    const bounceAccel = (Math.cos(TAU * 2 * phase) * (wGallop * 14 + wTrot * 8 + wWalk * 3)) * amount;
    const earBack = charging * 0.55 + (this.hurtTimer > 0 ? 0.4 : 0) + wGallop * amount * 0.3;
    const earDroop = (drive.dazed ? 0.45 : 0) + (drive.alive ? 0 : 0.6) + air * 0.25;
    pose.earLBack = this.earL.pitch.step(earBack, dt, -bounceAccel * 0.6);
    pose.earLDroop = this.earL.roll.step(
      earDroop + (this.earFlickSide < 0 ? flick : 0),
      dt,
      bounceAccel * 0.8 - drive.lateralAccel * 0.5,
    );
    pose.earRBack = this.earR.pitch.step(earBack, dt, -bounceAccel * 0.6);
    pose.earRDroop = this.earR.roll.step(
      earDroop + (this.earFlickSide > 0 ? flick : 0),
      dt,
      bounceAccel * 0.8 + drive.lateralAccel * 0.5,
    );

    // --- bell pendulum ------------------------------------------------------------------
    const vertical = -bounceAccel * 0.04;
    const swing = this.bellSwing.step((drive.forwardAccel + vertical * 2) / 9.81, dt);
    const side = this.bellSide.step((drive.lateralAccel + flinch * 4 * this.flinchSide) / 9.81, dt);
    const impact = Math.max(this.bellSwing.lastImpact, this.bellSide.lastImpact * 0.6);
    // Only real knocks clank (stops, landings, hits); the stride jingle is MascotClient's.
    if (impact > 2.6 && this.bellCooldown <= 0 && drive.alive) {
      this.bellClank = Math.min(1, impact / 7);
      this.bellCooldown = 0.45;
    }
    // Angles relative to gravity; the rig compensates the parents' tilt.
    pose.bellPitch = -swing;
    pose.bellRoll = side;

    // --- tail: 4 springs, whip from the base ---------------------------------------------
    this.swishTimer -= dt;
    if (this.swishTimer <= 0) {
      this.swishTimer = 1.5 + Math.random() * 3;
      this.tailSwish = (Math.random() < 0.5 ? -1 : 1) * (0.9 + Math.random() * 0.5);
    }
    this.tailSwish = damp(this.tailSwish, 0, 2.2, dt);
    const stream = clamp(speed * 0.07 + wGallop * amount * 0.35 + air * 0.4 + charging * 0.3, 0, 1.2);
    const idleSwish = Math.sin(t * 1.9) * 0.25 * (1 - amount) + this.tailSwish * 0.6;
    const tailBounce = bounceAccel * 0.5;
    let parentPitch = 0;
    let parentYaw = 0;
    for (let index = 0; index < 4; index += 1) {
      const segment = this.tail[index];
      if (!segment) continue;
      const basePitch = index === 0 ? -stream * 0.9 + (drive.alive ? 0 : 0.2) : parentPitch * 0.55;
      const baseYaw = index === 0 ? idleSwish + (drive.alive ? 0 : 0) : parentYaw * 0.7;
      const pitch = segment.pitch.step(basePitch, dt, tailBounce * (index + 1) * 0.15 + drive.forwardAccel * 0.08 * (index + 1));
      const yaw = segment.yaw.step(baseYaw, dt, -drive.lateralAccel * 0.12 * (index + 1) + drive.yawRate * 0.6);
      pose.tailPitch[index] = clamp(pitch, -1.2, 1);
      pose.tailYaw[index] = clamp(yaw, -1.2, 1.2);
      parentPitch = pitch;
      parentYaw = yaw;
    }

    // --- legs ------------------------------------------------------------------------------
    const offsets = this.offsets;
    for (let leg = 0; leg < 4; leg += 1) {
      offsets[leg] = blendOffset(WALK.offsets[leg] ?? 0, TROT.offsets[leg] ?? 0, GALLOP.offsets[leg] ?? 0, wTrot, wGallop);
    }
    for (let leg = 0; leg < 4; leg += 1) {
      const out = pose.legs[leg];
      if (!out) continue;
      const front = leg < 2;
      const p = fract(phase + (offsets[leg] ?? 0));
      const stance = p < duty;
      if (stance && !this.stanceWas[leg] && amount > 0.3 && grounded) this.footfalls |= 1 << leg;
      this.stanceWas[leg] = stance;
      let z = 0;
      let y = 0;
      let tuck = 0;
      let hoof = 0;
      if (stance) {
        const s = p / duty;
        z = sweep * 0.5 - s * sweep;
      } else {
        const s = (p - duty) / (1 - duty);
        const eased = s * s * (3 - 2 * s);
        z = -sweep * 0.5 + sweep * eased + Math.sin(Math.PI * s) * sweep * 0.06;
        const arc = Math.sin(Math.PI * Math.min(1, s * (front ? 1.12 : 1))) ** 0.75;
        y = (front ? frontLift : lift) * arc;
        tuck = arc * (front ? 0.9 : 0.55) * (0.4 + wGallop * 0.6 + wTrot * 0.3) * amount;
        hoof = arc * (front ? 0.8 : -0.45) * amount;
      }
      // Gallop: forelegs reach ahead, hind legs push from further back.
      z += (front ? 0.06 : -0.05) * wGallop * amount;
      // Skid brace: forelegs planted ahead, hind legs under the belly.
      z = lerp(z, front ? 0.26 : 0.12, brace);
      y *= 1 - brace;
      // Airborne tuck.
      y = lerp(y, front ? 0.3 : 0.24, air);
      z = lerp(z, front ? 0.02 : -0.04, air);
      tuck = lerp(tuck, front ? 1.3 : 0.9, air);
      hoof = lerp(hoof, front ? 1.1 : -0.7, air);
      // Ground follows the slope under the legs.
      const ground = (front ? 0.5 : -0.5) * drive.slope * (1 - air);
      out.mode = 0;
      out.y = ground + y;
      out.z = z;
      out.tuck = tuck;
      out.hoof = hoof;
      out.hip = 0;
      out.knee = 0;
      out.middle = 0;
      out.splay = 0;

      if (stomping && front) {
        // Forelegs pawing high while rearing.
        const paw = Math.sin(t * 9 + leg * 1.6) * 0.25;
        out.mode = 1;
        out.hip = lerp(0, -1.05 + paw, rise);
        out.knee = lerp(0, 1.4 - paw, rise);
        out.middle = 0.4 * rise;
        out.hoof = 0.6 * rise;
      }
      if (drive.swimming) {
        const paddle = TAU * (phase + (offsets[leg] ?? 0));
        out.mode = 1;
        out.hip = Math.sin(paddle) * 0.55;
        out.knee = Math.max(0, -Math.cos(paddle)) * 0.9;
        out.middle = 0.2;
        out.hoof = 0.4;
      }
      if (drive.launched && drive.alive) {
        out.mode = 1;
        out.hip = Math.sin(t * 21 + leg * 1.7) * 0.75;
        out.knee = 0.5 + Math.sin(t * 17 + leg) * 0.45;
        out.middle = 0.3;
        out.hoof = 0.5;
        out.splay = (leg % 2 === 0 ? -1 : 1) * 0.3;
      }
      if (lying > 0.01) {
        // Stiff legs sticking out, with the odd comic twitch.
        const twitch = Math.max(0, Math.sin(this.deadTime * 3.1 + leg * 2.4) - 0.9) * 1.6;
        out.mode = 1;
        out.hip = lerp(out.hip, (front ? -0.32 : 0.32) + twitch * 0.2, Math.min(1, lying));
        out.knee = lerp(out.knee, 0, Math.min(1, lying));
        out.middle = lerp(out.middle, 0, Math.min(1, lying));
        out.hoof = lerp(out.hoof, 0, Math.min(1, lying));
        out.splay = lerp(out.splay, (leg % 2 === 0 ? -1 : 1) * 0.18, Math.min(1, lying));
      }
    }
    return pose;
  }

  /** Barrel-centre drop when lying (set by the rig: lying height - rest height). */
  lyingDrop = -0.5;

  /** True while the gallop's flight phase lifts all four hooves. */
  get flying(): number {
    return this.flight;
  }
}

/** Writes a pose into a rig. Legs are solved last, after the body has moved. */
export function applyCowPose(skeleton: CowSkeleton, pose: CowPose): void {
  const visual = skeleton.visual;
  visual.position.set(0, skeleton.visualRestY + pose.bodyY, pose.bodyZ);
  Quaternion.RotationYawPitchRollToRef(pose.bodyYaw, pose.bodyPitch, pose.bodyRoll, scratchQuat);
  if (!visual.rotationQuaternion) visual.rotationQuaternion = new Quaternion();
  visual.rotationQuaternion.copyFrom(scratchQuat);
  const joints = skeleton.joints;
  joints.body?.setScale(pose.squashXZ, pose.squashY, pose.squashXZ);
  joints.chest?.set(pose.chestPitch, pose.chestYaw, 0);
  if (joints.neck) {
    joints.neck.set(pose.neckPitch + skeleton.neckPitchBias, pose.neckYaw + skeleton.neckYawBias, pose.neckRoll);
    joints.head?.set(pose.headPitch, pose.headYaw, pose.headRoll);
  } else if (joints.head) {
    joints.head.set(
      pose.neckPitch + pose.headPitch + skeleton.neckPitchBias,
      pose.neckYaw + pose.headYaw + skeleton.neckYawBias,
      pose.neckRoll + pose.headRoll,
    );
  }
  joints.jaw?.set(pose.jawOpen, pose.jawSide, 0);
  joints.tongue?.setScale(1, 1, 0.05 + pose.tongue * 0.95);
  // Ears stick out sideways: yaw sweeps them back, roll droops them (signs per side).
  joints.earL?.set(0, -pose.earLBack, pose.earLDroop);
  joints.earR?.set(0, pose.earRBack, -pose.earRDroop);
  // The bell hangs from the neck/head: cancel the parents' tilt so it swings about gravity.
  const neckPitch = pose.neckPitch + skeleton.neckPitchBias;
  const parentPitch =
    pose.bodyPitch +
    (joints.chest ? pose.chestPitch : 0) +
    neckPitch +
    (skeleton.bellParent === 'head' ? pose.headPitch : 0);
  const parentRoll = pose.bodyRoll + pose.neckRoll + (skeleton.bellParent === 'head' ? pose.headRoll : 0);
  joints.bell?.set(pose.bellPitch - parentPitch, 0, pose.bellRoll - parentRoll * 0.85);
  joints.tail0?.set(pose.tailPitch[0] ?? 0, pose.tailYaw[0] ?? 0, 0);
  joints.tail1?.set(pose.tailPitch[1] ?? 0, pose.tailYaw[1] ?? 0, 0);
  joints.tail2?.set(pose.tailPitch[2] ?? 0, pose.tailYaw[2] ?? 0, 0);
  joints.tail3?.set(pose.tailPitch[3] ?? 0, pose.tailYaw[3] ?? 0, 0);
  const lid = saturate(pose.blink);
  const angry = Math.max(0, pose.mood);
  const worried = Math.max(0, -pose.mood);
  if (joints.lidL || joints.lidR) {
    // Open = dome swung back into the head (-90°), shut = over the eye's front (+90°).
    const close = Math.max(lid, angry * 0.3, pose.ko);
    joints.lidL?.set(-Math.PI / 2 + close * Math.PI * 0.97, 0, 0);
    joints.lidR?.set(-Math.PI / 2 + close * Math.PI * 0.97, 0, 0);
    const eyeScale = 1 + worried * 0.12;
    joints.eyeL?.setScale(eyeScale, eyeScale, 1);
    joints.eyeR?.setScale(eyeScale, eyeScale, 1);
  } else {
    const open = 1 - lid * 0.88 - angry * 0.2 + worried * 0.12;
    joints.eyeL?.setScale(1, open, 1);
    joints.eyeR?.setScale(1, open, 1);
  }
  joints.eyeL?.set(0, pose.eyeYaw, Math.sin(pose.eyeSpin) * 0.3);
  joints.eyeR?.set(0, pose.eyeYaw, Math.sin(pose.eyeSpin + 1) * 0.3);
  const browAngle = angry * 0.45 - worried * 0.35 + 0.04;
  joints.browL?.set(0, 0, -browAngle);
  joints.browR?.set(0, 0, browAngle);
  joints.browL?.setOffset(0, -angry * 0.025 + worried * 0.02, 0);
  joints.browR?.setOffset(0, -angry * 0.025 + worried * 0.02, 0);

  // Legs: refresh the world matrices down to each hip, then solve.
  const root = skeleton.root;
  for (let leg = 0; leg < skeleton.legs.length; leg += 1) {
    const solver = skeleton.legs[leg];
    const legPose = pose.legs[leg];
    const chain = skeleton.legChains[leg];
    if (!solver || !legPose || !chain) continue;
    if (legPose.mode === 1) {
      solver.pose(legPose.hip, legPose.knee, legPose.middle, legPose.hoof, legPose.splay);
      continue;
    }
    for (const node of chain) node.computeWorldMatrix(true);
    const hipNode = solver.joints[0]?.node;
    if (!hipNode) continue;
    relativePosition(hipNode, root, scratchHip);
    const front = leg < 2;
    const parentPitch = pose.bodyPitch + (front && skeleton.frontFromChest ? pose.chestPitch : 0);
    solver.solve(
      scratchHip.y,
      scratchHip.z,
      parentPitch,
      legPose.y + solver.restSoleY + skeleton.visualRestY,
      legPose.z + solver.restSoleZ,
      legPose.tuck,
      legPose.hoof,
    );
  }
}
