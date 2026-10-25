import RAPIER from '@dimforge/rapier3d-compat';
import { classStatsFor, mascotFormOf, type ClassStats } from '../config/classes.js';
import { sampleMapHeight, surfaceTagAt } from '../config/map-fjord.js';
import {
  COCONUT_TUNING,
  COW_TUNING,
  ROLL_RESISTANCE_SCALE,
} from '../config/mascot.js';
import { MASCOT_SKILLS, SKILLS } from '../config/skills.js';
import {
  FIXED_DT,
  GRAVITY,
  PARACHUTE_AUTO_OPEN_DELAY,
  PARACHUTE_DEPLOY_FALL_SPEED,
  PARACHUTE_DIVE_SINK_SPEED,
  PARACHUTE_FORWARD_SPEED,
  PARACHUTE_HOVER_SINK_SPEED,
  PARACHUTE_HOVER_SPEED,
  PARACHUTE_MIN_CLEARANCE,
  PARACHUTE_SINK_SPEED,
  PARACHUTE_STRAFE_SPEED,
  PARACHUTE_SWAY_ANGLE,
  PHYSICS_TICK_RATE,
  PLAYER_MAX_SLOPE,
  PLAYER_SNAP_TO_GROUND,
  PLAYER_STEP_HEIGHT,
  WATER_LEVEL,
} from '../constants.js';
import type { SurfaceTag } from '../types/map.js';
import type {
  ClassId,
  Faction,
  InputButtonMask,
  MascotForm,
  MascotWireState,
  ParachuteState,
  PlayerInput,
  Vec3,
  WindState,
} from '../types/index.js';
import { InputButton, ParachuteState as Parachute } from '../types/index.js';
import { PLAYER_COLLISION_GROUP, type PhysicsWorld } from './world.js';

export interface CharacterBodyOptions {
  position: Vec3;
  classId: ClassId;
  /** Resolves the mascot form; ignored by the human classes. */
  faction?: Faction;
}

/**
 * Discrete things the mascot motor did during a tick. The server turns them
 * into damage and broadcasts; the client uses them for instant local feedback.
 */
export type MascotMotorEvent =
  | { type: 'move'; slot: 1 | 2 | 3; position: Vec3 }
  | { type: 'impact'; kind: 'stomp' | 'pound'; position: Vec3 }
  | { type: 'bounce'; position: Vec3; speed: number };

interface SurfaceProperties {
  accelerationScale: number;
  frictionScale: number;
}

const CROUCH_HEIGHT_SCALE = 0.65;
const CROUCH_SPEED_SCALE = 0.55;
const STRAFE_SPEED_SCALE = 0.85;
const BACKWARD_SPEED_SCALE = 0.7;
const SPRINT_SPEED_SCALE = 1.35;
const SWIM_SPEED = 4.2;
const SWIM_SPRINT_SPEED = 5.8;
const SWIM_FLOAT_HEIGHT = 1.12;
const ROLL_DURATION = 0.6;
const ROLL_RECOVERY = 0.4;
const MANTLE_DURATION = 0.4;
const MANTLE_MIN_RISE = 0.55;
const MANTLE_MAX_RISE = 1.6;

function moveTowards(current: number, target: number, maxDelta: number): number {
  if (Math.abs(target - current) <= maxDelta) return target;
  return current + Math.sign(target - current) * maxDelta;
}

function wrapAngle(angle: number): number {
  const twoPi = Math.PI * 2;
  let wrapped = angle % twoPi;
  if (wrapped > Math.PI) wrapped -= twoPi;
  if (wrapped < -Math.PI) wrapped += twoPi;
  return wrapped;
}

function secondsToTicks(seconds: number): number {
  return Math.max(0, Math.round(seconds * PHYSICS_TICK_RATE));
}

/** Knockback flights keep only this fraction of normal air control. */
const LAUNCH_AIR_CONTROL = 0.12;
/** Below this the coconut keeps its last facing instead of following velocity. */
const COCONUT_FACING_SPEED = 0.8;
const MASCOT_BUOYANCY = 12;

function surfacePropertiesAt(tag: SurfaceTag): SurfaceProperties {
  switch (tag) {
    case 'snow':
      return { accelerationScale: 0.8, frictionScale: 0.72 };
    case 'ice_patch':
      return { accelerationScale: 0.22, frictionScale: 0.1 };
    case 'sand':
      return { accelerationScale: 0.9, frictionScale: 0.86 };
    case 'water':
      return { accelerationScale: 0.72, frictionScale: 0.6 };
    case 'rock_cliff':
      return { accelerationScale: 0.8, frictionScale: 0.9 };
    case 'wood':
      return { accelerationScale: 1, frictionScale: 1 };
    default:
      return { accelerationScale: 1, frictionScale: 1 };
  }
}

/**
 * Shared, deterministic kinematic character motor. The same code runs inside
 * the authoritative server and the client prediction world.
 *
 * Locomotion follows the movement contract: forward 100 %, strafe 85 %,
 * backward 70 %, tactical sprint +35 %, crouch 55 % with a 35 % shorter
 * capsule, a 0.6 s dodge roll and a buoyant 4.2 / 5.8 m/s swim mode.
 *
 * The mascot class runs two extra modes of the same motor (see
 * config/mascot.ts): the cow steers its own heading like a vehicle with
 * momentum, skids and a gallop meter; the coconut is a camera-relative rolling
 * ball with slope gravity, double jump, bounces and buoyancy. Their moves and
 * cooldowns are motor state so prediction and the server agree tick for tick.
 */
export class CharacterBody {
  readonly handle: number;
  readonly stats: ClassStats;
  /** null for the human classes. */
  readonly form: MascotForm | null;
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  private readonly physics: PhysicsWorld;
  private readonly controller: RAPIER.KinematicCharacterController;
  private readonly baseHeight: number;
  private feet: Vec3;
  private linearVelocity: Vec3 = { x: 0, y: 0, z: 0 };
  private isGrounded = false;
  private previousButtons: InputButtonMask = 0;
  private currentYaw = 0;
  private currentPitch = 0;
  private currentWeaponSlot = 1;
  private crouchAmount = 0;
  private currentHeight: number;
  private isSwimming = false;
  private isSprinting = false;
  private rollTimer = 0;
  private rollRecovery = 0;
  private rollSpeed = 0;
  private rollDirection: Vec3 = { x: 0, y: 0, z: 0 };
  private mantleTimer = 0;
  private mantleStart: Vec3 = { x: 0, y: 0, z: 0 };
  private mantleTarget: Vec3 = { x: 0, y: 0, z: 0 };
  private surface: SurfaceTag = 'grass_mud';
  private parachute: ParachuteState = Parachute.Closed;
  private parachuteFallTimer = 0;
  private parachuteOpenTimer = 0;
  private parachuteSway = 0;
  private parachuteSwayVelocity = 0;
  private parachuteRepairTimer = 0;
  private canopyBlend = 0;
  private groundClearance = 0;
  private wind: WindState = { angle: 0, strength: 0 };
  private disposed = false;
  /**
   * Knockback and mascot timers count whole ticks, like the move cooldowns,
   * so a timer restored from the wire ends on exactly the same tick as the
   * server's (float seconds drift under repeated subtraction).
   */
  private launchTicks = 0;
  private slippery = false;
  // Mascot motor state (unused by the human classes).
  private mascotHeading = 0;
  private yawRate = 0;
  private stamina = 1;
  private exhausted = false;
  private galloping = false;
  private skidding = false;
  private boostTicks = 0;
  private actionTicks = 0;
  private hopTicks = 0;
  private coyoteTicks = 0;
  private waterJumpTicks = 0;
  private jumpsUsed = 0;
  private pounding = false;
  private readonly moveCooldownTicks: [number, number, number] = [0, 0, 0];
  private mascotEvents: MascotMotorEvent[] = [];

  constructor(physics: PhysicsWorld, handle: number, options: CharacterBodyOptions) {
    this.physics = physics;
    this.handle = handle;
    const faction = options.faction ?? 'alpine';
    this.stats = classStatsFor(options.classId, faction);
    this.form = mascotFormOf(options.classId, faction);
    this.baseHeight = this.stats.height;
    this.currentHeight = this.baseHeight;
    this.feet = { ...options.position };

    const centerY = options.position.y + this.baseHeight / 2;
    const bodyDescription = RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(options.position.x, centerY, options.position.z)
      .setCcdEnabled(false);
    this.body = physics.world.createRigidBody(bodyDescription);
    const halfHeight = Math.max(0.01, (this.baseHeight - this.stats.radius * 2) / 2);
    const shape =
      this.form === 'coconut'
        ? RAPIER.ColliderDesc.ball(this.stats.radius)
        : RAPIER.ColliderDesc.capsule(halfHeight, this.stats.radius);
    const colliderDescription = shape
      .setFriction(0)
      .setRestitution(0)
      .setCollisionGroups(PLAYER_COLLISION_GROUP);
    this.collider = physics.world.createCollider(colliderDescription, this.body);

    this.controller = physics.world.createCharacterController(0.02);
    // The cow cannot mantle and only takes low steps; the ball rolls over
    // kerbs. Both keep the human slope rules.
    const stepHeight =
      this.form === 'cow' ? 0.35 : this.form === 'coconut' ? 0.32 : PLAYER_STEP_HEIGHT;
    this.controller.enableAutostep(stepHeight, 0.22, false);
    this.controller.enableSnapToGround(PLAYER_SNAP_TO_GROUND);
    this.controller.setMaxSlopeClimbAngle(PLAYER_MAX_SLOPE);
    this.controller.setMinSlopeSlideAngle((46 * Math.PI) / 180);
    this.controller.setApplyImpulsesToDynamicBodies(false);
    this.controller.setCharacterMass(this.form === 'cow' ? 600 : this.form === 'coconut' ? 45 : 78);
  }

  get position(): Vec3 {
    return { ...this.feet };
  }

  get velocity(): Vec3 {
    return { ...this.linearVelocity };
  }

  get grounded(): boolean {
    return this.isGrounded;
  }

  get yaw(): number {
    return this.currentYaw;
  }

  get pitch(): number {
    return this.currentPitch;
  }

  get colliderHandle(): number {
    return this.collider.handle;
  }

  get buttons(): InputButtonMask {
    return this.previousButtons;
  }

  get height(): number {
    return this.currentHeight;
  }

  get standHeight(): number {
    return this.baseHeight;
  }

  get crouched(): boolean {
    return this.crouchAmount > 0.45;
  }

  get crouchBlend(): number {
    return this.crouchAmount;
  }

  get swimming(): boolean {
    return this.isSwimming;
  }

  get sprinting(): boolean {
    return this.isSprinting;
  }

  get rolling(): boolean {
    return this.rollTimer > 0;
  }

  get surfaceTag(): SurfaceTag {
    return this.surface;
  }

  get parachuteState(): ParachuteState {
    return this.parachute;
  }

  get parachuteOpen(): boolean {
    return this.parachute === Parachute.Intact || this.parachute === Parachute.Tattered;
  }

  /** 0 = stowed, 1 = fully inflated; used by the canopy renderer. */
  get parachuteBlend(): number {
    return this.canopyBlend;
  }

  /** Canopy pendulum angle in radians (positive = right). */
  get parachuteSwayAngle(): number {
    return this.parachuteSway;
  }

  get parachuteRepairRemaining(): number {
    return this.parachuteRepairTimer;
  }

  get clearanceToGround(): number {
    return this.groundClearance;
  }

  /** Body facing: look yaw for humans, steered heading for the cow, roll direction for the coconut. */
  get heading(): number {
    return this.form ? this.mascotHeading : this.currentYaw;
  }

  get launchSeconds(): number {
    return this.launchTicks / PHYSICS_TICK_RATE;
  }

  /** True while Horn Charge or Turbo Roll is running. */
  get mascotBoosting(): boolean {
    return this.boostTicks > 0;
  }

  get mascotPounding(): boolean {
    return this.pounding;
  }

  /** Snapshot of the mascot motor for the wire and for reconciliation. */
  get mascotState(): MascotWireState | null {
    if (!this.form) return null;
    return {
      heading: this.mascotHeading,
      yawRate: this.yawRate,
      stamina: this.stamina,
      boostSeconds: this.boostTicks / PHYSICS_TICK_RATE,
      actionSeconds: this.actionTicks / PHYSICS_TICK_RATE,
      hopSeconds: (this.form === 'cow' ? this.hopTicks : this.waterJumpTicks) / PHYSICS_TICK_RATE,
      coyoteSeconds: this.coyoteTicks / PHYSICS_TICK_RATE,
      cooldownTicks: [
        this.moveCooldownTicks[0],
        this.moveCooldownTicks[1],
        this.moveCooldownTicks[2],
      ],
      pounding: this.pounding,
      skidding: this.skidding,
      galloping: this.galloping,
      exhausted: this.exhausted,
      jumpsUsed: this.jumpsUsed,
    };
  }

  /** Remaining move cooldowns in seconds (slot order). */
  get mascotCooldownSeconds(): [number, number, number] {
    return [
      this.moveCooldownTicks[0] / PHYSICS_TICK_RATE,
      this.moveCooldownTicks[1] / PHYSICS_TICK_RATE,
      this.moveCooldownTicks[2] / PHYSICS_TICK_RATE,
    ];
  }

  /** Restores authoritative extended state before replaying inputs. */
  restoreExtended(launchSeconds: number, mascot: MascotWireState | null): void {
    this.launchTicks = secondsToTicks(launchSeconds);
    if (!this.form || !mascot) return;
    this.mascotHeading = mascot.heading;
    this.stamina = Math.min(1, Math.max(0, mascot.stamina));
    this.boostTicks = secondsToTicks(mascot.boostSeconds);
    this.actionTicks = secondsToTicks(mascot.actionSeconds);
    if (this.form === 'cow') this.hopTicks = secondsToTicks(mascot.hopSeconds);
    else this.waterJumpTicks = secondsToTicks(mascot.hopSeconds);
    this.coyoteTicks = secondsToTicks(mascot.coyoteSeconds);
    this.moveCooldownTicks[0] = mascot.cooldownTicks[0];
    this.moveCooldownTicks[1] = mascot.cooldownTicks[1];
    this.moveCooldownTicks[2] = mascot.cooldownTicks[2];
    this.pounding = mascot.pounding;
    this.skidding = mascot.skidding;
    this.galloping = mascot.galloping;
    this.exhausted = mascot.exhausted;
    this.jumpsUsed = mascot.jumpsUsed;
    this.yawRate = mascot.yawRate;
  }

  /**
   * Server-applied ram/shockwave flight: sets the velocity and blunts air
   * control. A launch also knocks the cow out of a Hoof Stomp wind-up.
   */
  launch(velocity: Vec3, seconds: number): void {
    this.linearVelocity = { ...velocity };
    this.launchTicks = Math.max(this.launchTicks, secondsToTicks(seconds));
    this.isGrounded = false;
    this.rollTimer = 0;
    this.mantleTimer = 0;
    this.pounding = false;
    this.actionTicks = 0;
    if (this.parachuteOpen) this.cutawayParachute();
  }

  /** Ram recoil: the mascot keeps a fraction of its horizontal speed and hops. */
  applyRecoil(keep: number, hop: number): void {
    this.linearVelocity.x *= keep;
    this.linearVelocity.z *= keep;
    if (hop > 0) {
      this.linearVelocity.y = Math.max(this.linearVelocity.y, hop);
      this.isGrounded = false;
    }
  }

  /** Coconut-milk puddle: ice traction while set (authoritative, per tick). */
  setSlippery(slippery: boolean): void {
    this.slippery = slippery;
  }

  get isSlippery(): boolean {
    return this.slippery;
  }

  /** Returns and clears the mascot events of the ticks simulated since the last call. */
  drainMascotEvents(): MascotMotorEvent[] {
    if (this.mascotEvents.length === 0) return [];
    const events = this.mascotEvents;
    this.mascotEvents = [];
    return events;
  }

  setWind(wind: WindState): void {
    this.wind = { angle: wind.angle, strength: Math.max(0, wind.strength) };
  }

  /** Dead players stop blocking movement and bullets until they respawn. */
  setColliderEnabled(enabled: boolean): void {
    this.collider.setEnabled(enabled);
  }

  /** Approximate eye height above the feet for hit validation and muzzle FX. */
  get eyeHeight(): number {
    return this.currentHeight - this.stats.radius * 0.65;
  }

  setParachuteState(state: ParachuteState): void {
    this.parachute = state;
    this.canopyBlend = state === Parachute.Closed ? 0 : 1;
    if (state === Parachute.Closed) {
      this.parachuteFallTimer = 0;
      this.parachuteOpenTimer = 0;
      this.parachuteSway = 0;
      this.parachuteSwayVelocity = 0;
    }
  }

  teleport(position: Vec3): void {
    this.feet = { ...position };
    this.linearVelocity = { x: 0, y: 0, z: 0 };
    this.isGrounded = false;
    this.isSwimming = false;
    this.rollTimer = 0;
    this.rollRecovery = 0;
    this.mantleTimer = 0;
    this.crouchAmount = 0;
    this.currentHeight = this.baseHeight;
    this.parachute = Parachute.Closed;
    this.parachuteFallTimer = 0;
    this.parachuteOpenTimer = 0;
    this.parachuteSway = 0;
    this.parachuteSwayVelocity = 0;
    this.parachuteRepairTimer = 0;
    this.canopyBlend = 0;
    this.launchTicks = 0;
    this.slippery = false;
    this.resetMascotState();
    this.updateColliderShape();
    const centerY = position.y + this.baseHeight / 2;
    this.body.setTranslation({ x: position.x, y: centerY, z: position.z }, true);
    this.body.setNextKinematicTranslation({ x: position.x, y: centerY, z: position.z });
    this.syncColliderPose();
  }

  /**
   * Restores authoritative movement state before replaying inputs. Pass the
   * authoritative swimming flag: the motor's water-entry damping keys off the
   * previous tick's flag, so a stale one would re-apply it during the replay.
   */
  restore(
    position: Vec3,
    velocity: Vec3,
    grounded: boolean,
    previousButtons?: InputButtonMask,
    parachuteState?: ParachuteState,
    swimming?: boolean,
  ): void {
    this.feet = { ...position };
    this.linearVelocity = { ...velocity };
    this.isGrounded = grounded;
    if (swimming !== undefined) this.isSwimming = swimming;
    if (previousButtons !== undefined) this.previousButtons = previousButtons;
    if (parachuteState !== undefined) {
      this.parachute = parachuteState;
      this.canopyBlend = parachuteState === Parachute.Closed ? 0 : 1;
      if (parachuteState === Parachute.Closed) {
        this.parachuteFallTimer = 0;
        this.parachuteOpenTimer = 0;
        this.parachuteSway = 0;
        this.parachuteSwayVelocity = 0;
      }
    } else if (grounded) {
      this.parachute = Parachute.Closed;
      this.canopyBlend = 0;
    }
    const centerY = position.y + this.baseHeight / 2;
    this.body.setTranslation({ x: position.x, y: centerY, z: position.z }, true);
    this.body.setNextKinematicTranslation({ x: position.x, y: centerY, z: position.z });
    this.syncColliderPose();
  }

  private resetMascotState(): void {
    this.yawRate = 0;
    this.stamina = 1;
    this.exhausted = false;
    this.galloping = false;
    this.skidding = false;
    this.boostTicks = 0;
    this.actionTicks = 0;
    this.hopTicks = 0;
    this.coyoteTicks = 0;
    this.waterJumpTicks = 0;
    this.jumpsUsed = 0;
    this.pounding = false;
    this.moveCooldownTicks[0] = 0;
    this.moveCooldownTicks[1] = 0;
    this.moveCooldownTicks[2] = 0;
    this.mascotEvents = [];
  }

  /** Crouch offset of the collider relative to the body (0 for mascots). */
  private colliderOffsetY(): number {
    return this.form ? 0 : (this.currentHeight - this.baseHeight) / 2;
  }

  /**
   * Rapier only moves attached colliders to their body on world.step(), and
   * Collider.setTranslation is world-space. Every time the motor moves the
   * body directly (teleport, reconciliation restore, mantle, crouch) the
   * collider's world pose is synced at once, so the character controller
   * never sweeps from a stale pose.
   */
  private syncColliderPose(): void {
    const center = this.body.translation();
    this.collider.setTranslation({ x: center.x, y: center.y + this.colliderOffsetY(), z: center.z });
  }

  private updateColliderShape(): void {
    // The coconut is a ball and the cow never crouches.
    if (this.form) return;
    const halfHeight = Math.max(0.01, (this.currentHeight - this.stats.radius * 2) / 2);
    this.collider.setHalfHeight(halfHeight);
    this.collider.setTranslationWrtParent({ x: 0, y: this.colliderOffsetY(), z: 0 });
    this.syncColliderPose();
  }

  private startRoll(forwardX: number, forwardZ: number): void {
    this.rollTimer = ROLL_DURATION;
    this.rollRecovery = 0;
    this.rollSpeed = Math.max(9, this.stats.moveSpeed * 1.5);
    this.rollDirection = { x: forwardX, y: 0, z: forwardZ };
    this.linearVelocity.x = forwardX * this.rollSpeed;
    this.linearVelocity.z = forwardZ * this.rollSpeed;
    this.linearVelocity.y = 2.4;
    this.isGrounded = false;
  }

  private tryMantle(forwardX: number, forwardZ: number): boolean {
    const wall = this.physics.raycast(
      { x: this.feet.x, y: this.feet.y + 0.65, z: this.feet.z },
      { x: forwardX, y: 0, z: forwardZ },
      1.05,
    );
    if (!wall || wall.distance < 0.12) return false;
    const probeX = wall.point.x + forwardX * 0.45;
    const probeZ = wall.point.z + forwardZ * 0.45;
    const ledge = this.physics.raycast(
      { x: probeX, y: this.feet.y + this.baseHeight + 0.35, z: probeZ },
      { x: 0, y: -1, z: 0 },
      this.baseHeight + 0.9,
    );
    if (!ledge) return false;
    const rise = ledge.point.y - this.feet.y;
    if (rise < MANTLE_MIN_RISE || rise > MANTLE_MAX_RISE) return false;
    this.mantleTimer = MANTLE_DURATION;
    this.mantleStart = { ...this.feet };
    this.mantleTarget = {
      x: wall.point.x + forwardX * 0.55,
      y: ledge.point.y + 0.04,
      z: wall.point.z + forwardZ * 0.55,
    };
    this.linearVelocity = { x: 0, y: 0, z: 0 };
    return true;
  }

  private measureGroundClearance(): number {
    const terrainFloor = Math.max(sampleMapHeight(this.feet.x, this.feet.z), WATER_LEVEL);
    const terrainClearance = Math.max(0, this.feet.y - terrainFloor);
    const hit = this.physics.raycast(
      { x: this.feet.x, y: this.feet.y + 0.2, z: this.feet.z },
      { x: 0, y: -1, z: 0 },
      90,
    );
    if (!hit) return terrainClearance;
    return Math.max(0, Math.min(terrainClearance, hit.distance - 0.2));
  }

  private deployParachute(): void {
    this.parachute = Parachute.Intact;
    this.parachuteFallTimer = 0;
    this.parachuteOpenTimer = 0;
    this.parachuteSway = 0;
    this.parachuteSwayVelocity = 0;
    this.isSprinting = false;
  }

  private cutawayParachute(): void {
    if (this.parachute === Parachute.Closed) return;
    this.parachute = Parachute.Closed;
    this.parachuteFallTimer = 0;
    this.parachuteOpenTimer = 0;
    this.parachuteSway = 0;
    this.parachuteSwayVelocity = 0;
  }

  /**
   * Space deploys immediately while eligible and cuts away once open.
   * Otherwise the canopy opens automatically after 1.2 s of a fast fall with
   * at least 4.5 m of clear air below the feet. C also cuts away.
   */
  private updateParachuteTransitions(
    jumpPressed: boolean,
    jumpWasPressed: boolean,
    crouchPressed: boolean,
  ): void {
    const inAir = !this.isGrounded && !this.isSwimming;
    this.groundClearance = inAir ? this.measureGroundClearance() : 0;
    const hasClearance = inAir && this.groundClearance >= PARACHUTE_MIN_CLEARANCE;
    const canDeploy =
      hasClearance && this.linearVelocity.y < PARACHUTE_DEPLOY_FALL_SPEED;

    if (this.parachute === Parachute.Closed) {
      // The timer runs from the start of a clear fall, so a 1.2 s auto-open is
      // not lost to the time spent accelerating past the deploy speed.
      if (!hasClearance || this.linearVelocity.y >= 0) {
        this.parachuteFallTimer = 0;
        return;
      }
      this.parachuteFallTimer += FIXED_DT;
      const manualDeploy = jumpPressed && !jumpWasPressed && canDeploy;
      const automaticDeploy =
        this.parachuteFallTimer >= PARACHUTE_AUTO_OPEN_DELAY && canDeploy;
      if (manualDeploy || automaticDeploy) this.deployParachute();
      return;
    }

    if (this.parachute === Parachute.CollapsedFalling) return;
    if ((jumpPressed && !jumpWasPressed) || crouchPressed) this.cutawayParachute();
  }

  private simulateParachute(
    forwardX: number,
    forwardZ: number,
    rightX: number,
    rightZ: number,
    normalizedX: number,
    forwardAxis: number,
    hasMovement: boolean,
  ): void {
    this.isSprinting = false;
    const forwardSpeed =
      forwardAxis > 0.2
        ? PARACHUTE_FORWARD_SPEED
        : forwardAxis < -0.2
          ? -PARACHUTE_HOVER_SPEED
          : 0;
    const strafeSpeed = normalizedX * PARACHUTE_STRAFE_SPEED;
    const windDriftX = Math.cos(this.wind.angle) * this.wind.strength * 2.2;
    const windDriftZ = Math.sin(this.wind.angle) * this.wind.strength * 2.2;
    const desiredX = forwardX * forwardSpeed + rightX * strafeSpeed + windDriftX;
    const desiredZ = forwardZ * forwardSpeed + rightZ * strafeSpeed + windDriftZ;
    const acceleration = (hasMovement ? 10 : 4) * FIXED_DT;
    this.linearVelocity.x = moveTowards(this.linearVelocity.x, desiredX, acceleration);
    this.linearVelocity.z = moveTowards(this.linearVelocity.z, desiredZ, acceleration);

    const targetSink =
      forwardAxis < -0.2
        ? PARACHUTE_DIVE_SINK_SPEED
        : forwardAxis > 0.2
          ? PARACHUTE_SINK_SPEED
          : PARACHUTE_HOVER_SINK_SPEED;
    this.linearVelocity.y = moveTowards(this.linearVelocity.y, targetSink, 30 * FIXED_DT);

    const targetSway = normalizedX * PARACHUTE_SWAY_ANGLE;
    this.parachuteSwayVelocity += (targetSway - this.parachuteSway) * 26 * FIXED_DT;
    this.parachuteSwayVelocity *= 0.94;
    this.parachuteSway += this.parachuteSwayVelocity * FIXED_DT;
    this.parachuteSway = Math.max(-PARACHUTE_SWAY_ANGLE, Math.min(PARACHUTE_SWAY_ANGLE, this.parachuteSway));
  }

  simulate(input: PlayerInput, trackButtons = true, speedScale = 1): void {
    if (this.disposed) return;

    this.currentYaw = input.yaw;
    this.currentPitch = input.pitch;
    this.currentWeaponSlot = input.weaponSlot;
    const buttons = input.buttons;
    this.launchTicks = Math.max(0, this.launchTicks - 1);

    if (this.form) {
      this.simulateMascot(input, trackButtons, speedScale);
      return;
    }

    if (this.mantleTimer > 0) {
      this.mantleTimer = Math.max(0, this.mantleTimer - FIXED_DT);
      const progress = 1 - this.mantleTimer / MANTLE_DURATION;
      const eased = progress * progress * (3 - 2 * progress);
      this.feet = {
        x: this.mantleStart.x + (this.mantleTarget.x - this.mantleStart.x) * eased,
        y: this.mantleStart.y + (this.mantleTarget.y - this.mantleStart.y) * eased,
        z: this.mantleStart.z + (this.mantleTarget.z - this.mantleStart.z) * eased,
      };
      this.isGrounded = false;
      this.isSwimming = false;
      const centerY = this.feet.y + this.baseHeight / 2;
      this.body.setTranslation({ x: this.feet.x, y: centerY, z: this.feet.z }, true);
      this.body.setNextKinematicTranslation({ x: this.feet.x, y: centerY, z: this.feet.z });
      this.syncColliderPose();
      if (this.mantleTimer <= 0) this.isGrounded = true;
      if (trackButtons) this.previousButtons = buttons;
      return;
    }

    const moveX =
      (buttons & InputButton.Right ? 1 : 0) - (buttons & InputButton.Left ? 1 : 0);
    const moveZ =
      (buttons & InputButton.Forward ? 1 : 0) - (buttons & InputButton.Backward ? 1 : 0);
    const magnitude = Math.hypot(moveX, moveZ);
    const normalizedX = magnitude > 1 ? moveX / magnitude : moveX;
    const normalizedZ = magnitude > 1 ? moveZ / magnitude : moveZ;
    const forwardAxis = normalizedZ;
    const hasMovement = magnitude > 0.001;

    this.surface = surfaceTagAt(this.feet.x, this.feet.z, this.feet.y);
    const groundHeight = sampleMapHeight(this.feet.x, this.feet.z);
    const deepWater = groundHeight < WATER_LEVEL - 1.1;
    const wasSwimming = this.isSwimming;
    this.isSwimming =
      deepWater && this.feet.y < WATER_LEVEL - 0.18 && this.mantleTimer <= 0;
    if (this.isSwimming && !wasSwimming) {
      this.linearVelocity.y = Math.min(this.linearVelocity.y, 1.5);
    }

    const crouchWanted =
      (buttons & InputButton.Crouch) !== 0 && !this.isSwimming && !this.parachuteOpen;
    let crouchTarget = crouchWanted ? 1 : 0;
    if (!crouchWanted && this.crouchAmount > 0.4) {
      const headroom = this.physics.raycast(
        { x: this.feet.x, y: this.feet.y + this.currentHeight * 0.55, z: this.feet.z },
        { x: 0, y: 1, z: 0 },
        this.baseHeight - this.currentHeight * 0.55 + 0.25,
      );
      if (headroom) crouchTarget = 1;
    }
    this.crouchAmount = moveTowards(this.crouchAmount, crouchTarget, FIXED_DT * 7);
    this.currentHeight = this.baseHeight * (1 - (1 - CROUCH_HEIGHT_SCALE) * this.crouchAmount);
    this.updateColliderShape();

    if (this.rollRecovery > 0) {
      this.rollRecovery = Math.max(0, this.rollRecovery - FIXED_DT);
    }

    const sprintHeld = (buttons & InputButton.Sprint) !== 0;
    const crouchPressed =
      (buttons & InputButton.Crouch) !== 0 &&
      (this.previousButtons & InputButton.Crouch) === 0;
    const jumpPressed = (buttons & InputButton.Jump) !== 0;
    const jumpWasPressed = (this.previousButtons & InputButton.Jump) !== 0;

    const forwardX = Math.sin(input.yaw);
    const forwardZ = Math.cos(input.yaw);
    const rightX = Math.cos(input.yaw);
    const rightZ = -Math.sin(input.yaw);

    this.updateParachuteTransitions(jumpPressed, jumpWasPressed, crouchPressed);

    if (
      this.isGrounded &&
      !this.parachuteOpen &&
      crouchPressed &&
      sprintHeld &&
      forwardAxis > 0.4 &&
      this.rollTimer <= 0 &&
      this.rollRecovery <= 0 &&
      !this.isSwimming
    ) {
      this.startRoll(forwardX, forwardZ);
    }

    if (
      this.rollTimer <= 0 &&
      this.rollRecovery <= 0 &&
      this.isGrounded &&
      !this.parachuteOpen &&
      jumpPressed &&
      !jumpWasPressed &&
      forwardAxis > 0.35 &&
      !this.isSwimming &&
      this.tryMantle(forwardX, forwardZ)
    ) {
      if (trackButtons) this.previousButtons = buttons;
      return;
    }

    const rolling = this.rollTimer > 0;
    if (this.parachuteOpen) {
      this.simulateParachute(
        forwardX,
        forwardZ,
        rightX,
        rightZ,
        normalizedX,
        forwardAxis,
        hasMovement,
      );
    } else if (rolling) {
      this.rollTimer = Math.max(0, this.rollTimer - FIXED_DT);
      this.rollSpeed = Math.max(5.5, this.rollSpeed - FIXED_DT * 7.5);
      this.linearVelocity.x = this.rollDirection.x * this.rollSpeed;
      this.linearVelocity.z = this.rollDirection.z * this.rollSpeed;
      if (this.rollTimer <= 0) {
        this.rollRecovery = ROLL_RECOVERY;
        this.linearVelocity.x *= 0.18;
        this.linearVelocity.z *= 0.18;
      }
    } else if (this.isSwimming) {
      const swimSprint = sprintHeld;
      const targetY = WATER_LEVEL - SWIM_FLOAT_HEIGHT + (jumpPressed ? 0.55 : 0);
      const buoyancy = (targetY - this.feet.y) * 14;
      this.linearVelocity.y += buoyancy * FIXED_DT;
      this.linearVelocity.y *= 0.9;
      if (this.feet.y < WATER_LEVEL - 3.2) this.linearVelocity.y += 18 * FIXED_DT;

      if (hasMovement) {
        const speed = (swimSprint ? SWIM_SPRINT_SPEED : SWIM_SPEED) * speedScale;
        const desiredX = (forwardX * normalizedZ + rightX * normalizedX) * speed;
        const desiredZ = (forwardZ * normalizedZ + rightZ * normalizedX) * speed;
        const acceleration = 18 * FIXED_DT;
        this.linearVelocity.x = moveTowards(this.linearVelocity.x, desiredX, acceleration);
        this.linearVelocity.z = moveTowards(this.linearVelocity.z, desiredZ, acceleration);
      } else {
        const drag = 3.2 * FIXED_DT;
        this.linearVelocity.x = moveTowards(this.linearVelocity.x, 0, drag);
        this.linearVelocity.z = moveTowards(this.linearVelocity.z, 0, drag);
      }
      this.isSprinting = swimSprint && hasMovement;
    } else {
      const canSprint = sprintHeld && forwardAxis > 0.25 && this.crouchAmount < 0.35;
      const sprintScale = canSprint ? SPRINT_SPEED_SCALE : 1;
      const crouchScale = 1 - (1 - CROUCH_SPEED_SCALE) * this.crouchAmount;
      const directionScale = Math.hypot(
        normalizedX * STRAFE_SPEED_SCALE,
        normalizedZ * (normalizedZ >= 0 ? 1 : BACKWARD_SPEED_SCALE),
      );
      const targetSpeed =
        this.stats.moveSpeed * directionScale * sprintScale * crouchScale * speedScale;
      this.isSprinting = canSprint && hasMovement;

      if (this.rollRecovery > 0) {
        const drag = 22 * FIXED_DT;
        this.linearVelocity.x = moveTowards(this.linearVelocity.x, 0, drag);
        this.linearVelocity.z = moveTowards(this.linearVelocity.z, 0, drag);
      } else {
        const desiredX = (forwardX * normalizedZ + rightX * normalizedX) * targetSpeed;
        const desiredZ = (forwardZ * normalizedZ + rightZ * normalizedX) * targetSpeed;
        if (this.isGrounded) {
          if (hasMovement) {
            const acceleration =
              this.stats.groundAcceleration * surfacePropertiesAt(this.tractionSurface()).accelerationScale * FIXED_DT;
            this.linearVelocity.x = moveTowards(this.linearVelocity.x, desiredX, acceleration);
            this.linearVelocity.z = moveTowards(this.linearVelocity.z, desiredZ, acceleration);
          } else {
            const friction =
              this.stats.groundFriction * surfacePropertiesAt(this.tractionSurface()).frictionScale * FIXED_DT;
            this.linearVelocity.x = moveTowards(this.linearVelocity.x, 0, friction);
            this.linearVelocity.z = moveTowards(this.linearVelocity.z, 0, friction);
          }
        } else if (hasMovement) {
          const control = this.launchTicks > 0 ? LAUNCH_AIR_CONTROL : 1;
          const acceleration = this.stats.airAcceleration * control * FIXED_DT;
          this.linearVelocity.x = moveTowards(this.linearVelocity.x, desiredX, acceleration);
          this.linearVelocity.z = moveTowards(this.linearVelocity.z, desiredZ, acceleration);
        }
      }

      if (this.isGrounded && jumpPressed && !jumpWasPressed && this.rollRecovery <= 0) {
        this.linearVelocity.y = this.stats.jumpSpeed;
        this.isGrounded = false;
      }

      if (!this.isGrounded) {
        this.linearVelocity.y = Math.max(-52, this.linearVelocity.y + GRAVITY * FIXED_DT);
      } else if (this.linearVelocity.y < 0) {
        this.linearVelocity.y = -1.5;
      }
    }

    this.moveAndCollide();

    if (this.parachuteOpen && (this.isGrounded || this.isSwimming)) {
      this.cutawayParachute();
    }
    const canopyTarget = this.parachuteOpen ? 1 : 0;
    this.canopyBlend = moveTowards(this.canopyBlend, canopyTarget, FIXED_DT * 3.8);
    this.parachuteRepairTimer = Math.max(0, this.parachuteRepairTimer - FIXED_DT);
    if (trackButtons) this.previousButtons = buttons;
  }

  /** Surface used for traction: an enemy milk puddle behaves like ice. */
  private tractionSurface(): SurfaceTag {
    return this.slippery ? 'ice_patch' : this.surface;
  }

  /**
   * Moves the collider by the current velocity through the character
   * controller, snaps to ground, clips velocity against what blocked it and
   * commits the new feet position. Shared by every movement mode.
   * A positive wallRestitution reflects part of a hard horizontal block.
   * Returns the horizontal speed that was blocked (m/s).
   */
  private moveAndCollide(wallRestitution = 0, wallMinSpeed = Number.POSITIVE_INFINITY): number {
    const desiredMovement = {
      x: this.linearVelocity.x * FIXED_DT,
      y: this.linearVelocity.y * FIXED_DT,
      z: this.linearVelocity.z * FIXED_DT,
    };

    this.controller.computeColliderMovement(
      this.collider,
      desiredMovement,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      undefined,
      (collider) => !this.physics.isPlayerCollider(collider.handle),
    );

    const corrected = this.controller.computedMovement();
    const controllerGrounded = this.controller.computedGrounded();
    const center = this.body.translation();
    const nextCenter = {
      x: center.x + corrected.x,
      y: center.y + corrected.y,
      z: center.z + corrected.z,
    };

    const proposedFeetY = nextCenter.y - this.baseHeight / 2;
    const probe = this.physics.raycast(
      { x: nextCenter.x, y: proposedFeetY + 0.18, z: nextCenter.z },
      { x: 0, y: -1, z: 0 },
      PLAYER_SNAP_TO_GROUND + 0.18,
    );
    const probeDrop = probe ? proposedFeetY - probe.point.y : Number.POSITIVE_INFINITY;
    let grounded = controllerGrounded;
    if (
      !grounded &&
      probe !== null &&
      probeDrop >= -0.04 &&
      probeDrop <= PLAYER_SNAP_TO_GROUND &&
      this.linearVelocity.y <= 0.1 &&
      !this.isSwimming
    ) {
      grounded = true;
      nextCenter.y = probe.point.y + this.baseHeight / 2 + 0.02;
      this.linearVelocity.y = 0;
    }

    const blockedX = desiredMovement.x - corrected.x;
    const blockedZ = desiredMovement.z - corrected.z;
    const blockedSpeed = Math.hypot(blockedX, blockedZ) / FIXED_DT;
    const wallBounce = wallRestitution > 0 && blockedSpeed > wallMinSpeed;
    // Climbing a slope or stair ramp shortens the horizontal step. Keeping the
    // intended velocity there stops the per-axis acceleration from skewing the
    // heading sideways (players slid off ramps and drifted on hillsides).
    // A mascot wall bounce always clips first so the reflection points away.
    const climbingSlope =
      !wallBounce && controllerGrounded && corrected.y > desiredMovement.y + 0.0001;
    if (!climbingSlope && Math.abs(corrected.x - desiredMovement.x) > 0.0001) {
      this.linearVelocity.x = corrected.x / FIXED_DT;
    }
    if (!climbingSlope && Math.abs(corrected.z - desiredMovement.z) > 0.0001) {
      this.linearVelocity.z = corrected.z / FIXED_DT;
    }
    if (wallBounce) {
      this.linearVelocity.x -= (blockedX / FIXED_DT) * wallRestitution;
      this.linearVelocity.z -= (blockedZ / FIXED_DT) * wallRestitution;
    }
    if (desiredMovement.y > 0 && corrected.y < desiredMovement.y - 0.0001) {
      this.linearVelocity.y = 0;
    }

    if (grounded && this.linearVelocity.y < 0) {
      this.linearVelocity.y = 0;
    }

    this.isGrounded = grounded && !this.isSwimming;
    this.feet = {
      x: nextCenter.x,
      y: nextCenter.y - this.baseHeight / 2,
      z: nextCenter.z,
    };
    this.body.setNextKinematicTranslation(nextCenter);
    return blockedSpeed;
  }

  // ---------------------------------------------------------------------------
  // Mascot modes
  // ---------------------------------------------------------------------------

  private emitMascot(event: MascotMotorEvent): void {
    // Bounded so a client that never drains (e.g. paused) cannot grow it.
    if (this.mascotEvents.length < 32) this.mascotEvents.push(event);
  }

  /** Starts a move if its motor cooldown is free. Returns true when it fired. */
  private startMove(index: 0 | 1 | 2): boolean {
    if (!this.form || (this.moveCooldownTicks[index] ?? 0) > 0) return false;
    const skill = SKILLS[MASCOT_SKILLS[this.form][index]];
    this.moveCooldownTicks[index] = secondsToTicks(skill.cooldownSeconds);
    this.emitMascot({
      type: 'move',
      slot: (index + 1) as 1 | 2 | 3,
      position: { ...this.feet },
    });
    return true;
  }

  /** Ground normal under the body (props included), or null in the air. */
  private groundNormal(): Vec3 | null {
    const origin = { x: this.feet.x, y: this.feet.y + this.stats.radius, z: this.feet.z };
    const ray = new RAPIER.Ray(origin, { x: 0, y: -1, z: 0 });
    const hit = this.physics.world.castRayAndGetNormal(
      ray,
      this.stats.radius + 0.6,
      true,
      undefined,
      undefined,
      undefined,
      undefined,
      (collider) => !this.physics.isPlayerCollider(collider.handle),
    );
    if (!hit) return null;
    const n = hit.normal;
    if (n.y <= 0.05) return null;
    return { x: n.x, y: n.y, z: n.z };
  }

  private simulateMascot(input: PlayerInput, trackButtons: boolean, speedScale: number): void {
    const buttons = input.buttons;
    const previous = this.previousButtons;
    const edge = (bit: number): boolean => (buttons & bit) !== 0 && (previous & bit) === 0;
    // Slots 1–3 are the mascot moves: Q/E/T, or the left mouse button on the
    // selected slot.
    const fireEdge = edge(InputButton.FirePrimary);
    const pressed: [boolean, boolean, boolean] = [
      edge(InputButton.Skill1) || (fireEdge && input.weaponSlot === 1),
      edge(InputButton.Skill2) || (fireEdge && input.weaponSlot === 2),
      edge(InputButton.Skill3OrTaunt) || (fireEdge && input.weaponSlot === 3),
    ];
    for (let index = 0; index < 3; index += 1) {
      const ticks = this.moveCooldownTicks[index] ?? 0;
      if (ticks > 0) this.moveCooldownTicks[index] = ticks - 1;
    }
    this.boostTicks = Math.max(0, this.boostTicks - 1);
    this.hopTicks = Math.max(0, this.hopTicks - 1);
    this.waterJumpTicks = Math.max(0, this.waterJumpTicks - 1);
    this.crouchAmount = 0;
    this.rollTimer = 0;
    this.rollRecovery = 0;
    if (this.parachute !== Parachute.Closed) this.cutawayParachute();
    this.canopyBlend = 0;
    this.groundClearance = 0;

    this.surface = surfaceTagAt(this.feet.x, this.feet.z, this.feet.y);
    const groundHeight = sampleMapHeight(this.feet.x, this.feet.z);
    const deepWater = groundHeight < WATER_LEVEL - 1.1;

    if (this.form === 'cow') {
      this.simulateCow(buttons, previous, pressed, speedScale, deepWater);
    } else {
      this.simulateCoconut(input, buttons, previous, pressed, speedScale, deepWater);
    }
    if (trackButtons) this.previousButtons = buttons;
  }

  /**
   * Cow: W/S throttle and brake/reverse, A/D steer a heading that is
   * independent of the camera. Turn rate falls with speed, hard turns at speed
   * lose lateral grip (skid), Shift gallops on a draining meter.
   */
  private simulateCow(
    buttons: InputButtonMask,
    previous: InputButtonMask,
    pressed: [boolean, boolean, boolean],
    speedScale: number,
    deepWater: boolean,
  ): void {
    const tuning = COW_TUNING;
    const throttle =
      (buttons & InputButton.Forward ? 1 : 0) - (buttons & InputButton.Backward ? 1 : 0);
    const steer = (buttons & InputButton.Right ? 1 : 0) - (buttons & InputButton.Left ? 1 : 0);
    const sprintHeld = (buttons & InputButton.Sprint) !== 0;
    const jumpEdge = (buttons & InputButton.Jump) !== 0 && (previous & InputButton.Jump) === 0;

    const wasSwimming = this.isSwimming;
    this.isSwimming = deepWater && this.feet.y < WATER_LEVEL - tuning.swimFeetDepth * 0.5;
    if (this.isSwimming && !wasSwimming) {
      this.linearVelocity.y = Math.min(this.linearVelocity.y, 1);
    }
    const swimming = this.isSwimming;
    const grounded = this.isGrounded;
    const traction = surfacePropertiesAt(this.tractionSurface());

    // Moves.
    if (pressed[0] && !swimming && this.startMove(0)) {
      this.boostTicks = secondsToTicks(SKILLS.horn_charge.durationSeconds);
      this.actionTicks = 0;
    }
    if (pressed[1] && grounded && !swimming && this.actionTicks <= 0 && this.startMove(1)) {
      this.actionTicks = secondsToTicks(SKILLS.hoof_stomp.durationSeconds);
      this.boostTicks = 0;
    }
    if (pressed[2]) this.startMove(2);

    if (this.actionTicks > 0) {
      this.actionTicks -= 1;
      // The hooves only land a shockwave on solid ground; a wind-up that
      // drove off a ledge fizzles (launches cancel it outright).
      if (this.actionTicks <= 0 && grounded && !swimming) {
        this.emitMascot({ type: 'impact', kind: 'stomp', position: { ...this.feet } });
      }
    }
    const boosting = this.boostTicks > 0;
    const stomping = this.actionTicks > 0;

    // Gallop meter.
    if (this.exhausted && this.stamina >= tuning.staminaRestart) this.exhausted = false;
    const wantsGallop = sprintHeld && throttle > 0 && !swimming && !boosting && !stomping;
    this.galloping = wantsGallop && !this.exhausted && this.stamina > 0 && grounded;
    if (this.galloping) {
      this.stamina = Math.max(0, this.stamina - tuning.staminaDrain * FIXED_DT);
      if (this.stamina <= 0) {
        this.exhausted = true;
        this.galloping = false;
      }
    } else if (!wantsGallop || this.exhausted) {
      const idle = throttle === 0 && Math.hypot(this.linearVelocity.x, this.linearVelocity.z) < 1;
      const regen = idle ? tuning.staminaRegenIdle : tuning.staminaRegen;
      this.stamina = Math.min(1, this.stamina + regen * FIXED_DT);
    }

    // Steering: heading first, so existing momentum shows up as lateral slip.
    const control = (grounded || swimming) && this.launchTicks <= 0;
    let forwardSpeed =
      this.linearVelocity.x * Math.sin(this.mascotHeading) +
      this.linearVelocity.z * Math.cos(this.mascotHeading);
    let targetYawRate = 0;
    if (control && !stomping) {
      const speedRatio = Math.min(1, Math.abs(forwardSpeed) / tuning.gallopSpeed);
      const rate = swimming
        ? tuning.swimTurnRate
        : boosting
          ? tuning.turnRateCharge
          : tuning.turnRateStanding + (tuning.turnRateGallop - tuning.turnRateStanding) * speedRatio;
      const direction = forwardSpeed < -0.3 ? -1 : 1;
      targetYawRate = steer * rate * direction;
    }
    this.yawRate = moveTowards(this.yawRate, targetYawRate, tuning.turnResponse * FIXED_DT);
    this.mascotHeading = wrapAngle(this.mascotHeading + this.yawRate * FIXED_DT);

    const forwardX = Math.sin(this.mascotHeading);
    const forwardZ = Math.cos(this.mascotHeading);
    const rightX = Math.cos(this.mascotHeading);
    const rightZ = -Math.sin(this.mascotHeading);
    forwardSpeed = this.linearVelocity.x * forwardX + this.linearVelocity.z * forwardZ;
    let lateralSpeed = this.linearVelocity.x * rightX + this.linearVelocity.z * rightZ;

    if (control) {
      let target = 0;
      if (swimming) {
        target = throttle > 0 ? tuning.swimSpeed : throttle < 0 ? -tuning.swimSpeed * 0.6 : 0;
      } else if (boosting) {
        target = tuning.chargeSpeed;
      } else if (throttle > 0) {
        target = this.galloping ? tuning.gallopSpeed : tuning.trotSpeed;
      } else if (throttle < 0) {
        target = -tuning.reverseSpeed;
      }
      target *= speedScale;
      const accelerationScale = swimming ? 0.6 : traction.accelerationScale;
      const frictionScale = swimming ? 1.4 : traction.frictionScale;

      if (stomping) {
        forwardSpeed = moveTowards(forwardSpeed, 0, tuning.stompBrake * FIXED_DT);
      } else if (boosting) {
        forwardSpeed =
          forwardSpeed < target
            ? Math.min(target, forwardSpeed + tuning.chargeAcceleration * accelerationScale * FIXED_DT)
            : moveTowards(forwardSpeed, target, tuning.overspeedDeceleration * FIXED_DT);
      } else if (throttle > 0) {
        if (forwardSpeed < 0) {
          forwardSpeed = Math.min(0, forwardSpeed + tuning.brakeDeceleration * accelerationScale * FIXED_DT);
        } else if (forwardSpeed < target) {
          const acceleration = this.galloping ? tuning.gallopAcceleration : tuning.trotAcceleration;
          forwardSpeed = Math.min(target, forwardSpeed + acceleration * accelerationScale * FIXED_DT);
        } else {
          forwardSpeed = moveTowards(forwardSpeed, target, tuning.overspeedDeceleration * FIXED_DT);
        }
      } else if (throttle < 0) {
        if (forwardSpeed > 0.25) {
          forwardSpeed = Math.max(0, forwardSpeed - tuning.brakeDeceleration * accelerationScale * FIXED_DT);
        } else {
          forwardSpeed = moveTowards(
            forwardSpeed,
            target,
            tuning.trotAcceleration * 0.7 * accelerationScale * FIXED_DT,
          );
        }
      } else {
        forwardSpeed = moveTowards(forwardSpeed, 0, tuning.coastDeceleration * frictionScale * FIXED_DT);
      }

      const hardTurn = Math.abs(steer) > 0 && Math.abs(forwardSpeed) > tuning.skidSpeed && !swimming;
      const grip = (hardTurn ? tuning.skidGrip : tuning.grip) * frictionScale;
      lateralSpeed = moveTowards(lateralSpeed, 0, grip * FIXED_DT);
      this.linearVelocity.x = forwardX * forwardSpeed + rightX * lateralSpeed;
      this.linearVelocity.z = forwardZ * forwardSpeed + rightZ * lateralSpeed;
    }
    this.skidding = grounded && !swimming && Math.abs(lateralSpeed) > tuning.skidSlip;
    this.isSprinting = this.galloping || boosting;

    // Vertical: small hop, buoyancy or gravity.
    if (swimming) {
      const targetY = WATER_LEVEL - tuning.swimFeetDepth;
      this.linearVelocity.y += (targetY - this.feet.y) * MASCOT_BUOYANCY * FIXED_DT;
      this.linearVelocity.y *= 0.9;
    } else {
      if (grounded && jumpEdge && this.hopTicks <= 0 && !stomping && this.launchTicks <= 0) {
        this.linearVelocity.y = tuning.hopSpeed;
        this.hopTicks = secondsToTicks(tuning.hopCooldown);
        this.isGrounded = false;
      }
      if (!this.isGrounded) {
        this.linearVelocity.y = Math.max(-52, this.linearVelocity.y + GRAVITY * FIXED_DT);
      } else if (this.linearVelocity.y < 0) {
        this.linearVelocity.y = -1.5;
      }
    }

    this.moveAndCollide();
  }

  /**
   * Coconut: a camera-relative rolling ball. Input accelerates it up to its
   * own top speed, slopes pull it downhill along the ground normal, it rolls
   * on with low resistance, double-jumps, bounces on hard landings and off
   * walls, and floats in deep water.
   */
  private simulateCoconut(
    input: PlayerInput,
    buttons: InputButtonMask,
    previous: InputButtonMask,
    pressed: [boolean, boolean, boolean],
    speedScale: number,
    deepWater: boolean,
  ): void {
    const tuning = COCONUT_TUNING;
    const moveX = (buttons & InputButton.Right ? 1 : 0) - (buttons & InputButton.Left ? 1 : 0);
    const moveZ = (buttons & InputButton.Forward ? 1 : 0) - (buttons & InputButton.Backward ? 1 : 0);
    const magnitude = Math.hypot(moveX, moveZ);
    const hasMovement = magnitude > 0.001;
    const forwardX = Math.sin(input.yaw);
    const forwardZ = Math.cos(input.yaw);
    const rightX = Math.cos(input.yaw);
    const rightZ = -Math.sin(input.yaw);
    let directionX = 0;
    let directionZ = 0;
    if (hasMovement) {
      directionX = (forwardX * moveZ + rightX * moveX) / magnitude;
      directionZ = (forwardZ * moveZ + rightZ * moveX) / magnitude;
    }
    const jumpEdge = (buttons & InputButton.Jump) !== 0 && (previous & InputButton.Jump) === 0;

    const wasSwimming = this.isSwimming;
    this.isSwimming = deepWater && this.feet.y < WATER_LEVEL - tuning.floatFeetDepth * 0.4;
    if (this.isSwimming && !wasSwimming) {
      this.linearVelocity.y = Math.max(this.linearVelocity.y * 0.35, -3);
      this.pounding = false;
    }
    const floating = this.isSwimming;
    const wasGrounded = this.isGrounded;
    if (wasGrounded) {
      this.jumpsUsed = 0;
      this.coyoteTicks = secondsToTicks(tuning.coyoteSeconds);
    } else {
      this.coyoteTicks = Math.max(0, this.coyoteTicks - 1);
    }

    // Moves.
    if (pressed[0] && this.startMove(0)) {
      this.boostTicks = secondsToTicks(SKILLS.turbo_roll.durationSeconds);
      let kickX = directionX;
      let kickZ = directionZ;
      if (!hasMovement) {
        const speed = Math.hypot(this.linearVelocity.x, this.linearVelocity.z);
        kickX = speed > 0.5 ? this.linearVelocity.x / speed : forwardX;
        kickZ = speed > 0.5 ? this.linearVelocity.z / speed : forwardZ;
      }
      this.linearVelocity.x += kickX * tuning.turboKick;
      this.linearVelocity.z += kickZ * tuning.turboKick;
    }
    if (pressed[1] && !wasGrounded && !floating && !this.pounding && this.startMove(1)) {
      this.pounding = true;
      this.linearVelocity.x *= 0.25;
      this.linearVelocity.z *= 0.25;
      this.linearVelocity.y = -tuning.poundSpeed;
    }
    if (pressed[2]) this.startMove(2);
    const boosting = this.boostTicks > 0;
    this.isSprinting = boosting;

    // Jumps: ground jump (with coyote time), air jumps, water hop.
    if (jumpEdge && !this.pounding && this.launchTicks <= 0) {
      if (floating) {
        if (this.waterJumpTicks <= 0) {
          this.linearVelocity.y = tuning.waterJumpSpeed;
          this.waterJumpTicks = secondsToTicks(tuning.waterJumpCooldown);
          this.jumpsUsed = 1;
        }
      } else if ((wasGrounded || this.coyoteTicks > 0) && this.jumpsUsed === 0) {
        this.linearVelocity.y = tuning.jumpSpeed;
        this.jumpsUsed = 1;
        this.coyoteTicks = 0;
        this.isGrounded = false;
      } else if (this.jumpsUsed < tuning.maxJumps) {
        this.linearVelocity.y = Math.max(this.linearVelocity.y, tuning.doubleJumpSpeed);
        this.jumpsUsed = Math.max(1, this.jumpsUsed) + 1;
      }
    }
    const grounded = this.isGrounded;

    if (floating) {
      const speed = tuning.paddleSpeed * speedScale;
      this.linearVelocity.x = moveTowards(
        this.linearVelocity.x,
        directionX * speed,
        tuning.paddleAcceleration * FIXED_DT,
      );
      this.linearVelocity.z = moveTowards(
        this.linearVelocity.z,
        directionZ * speed,
        tuning.paddleAcceleration * FIXED_DT,
      );
      const targetY = WATER_LEVEL - tuning.floatFeetDepth;
      if (this.linearVelocity.y <= tuning.waterJumpSpeed * 0.5) {
        this.linearVelocity.y += (targetY - this.feet.y) * MASCOT_BUOYANCY * FIXED_DT;
        this.linearVelocity.y *= 0.9;
      } else {
        this.linearVelocity.y += GRAVITY * FIXED_DT;
      }
    } else if (grounded) {
      const traction = this.tractionSurface();
      const accelerationScale = surfacePropertiesAt(traction).accelerationScale;
      const currentSpeed = Math.hypot(this.linearVelocity.x, this.linearVelocity.z);
      let driveX = directionX;
      let driveZ = directionZ;
      if (boosting && !hasMovement) {
        driveX = currentSpeed > 0.5 ? this.linearVelocity.x / currentSpeed : forwardX;
        driveZ = currentSpeed > 0.5 ? this.linearVelocity.z / currentSpeed : forwardZ;
      }
      const driving = hasMovement || boosting;
      if (driving && this.launchTicks <= 0) {
        const topSpeed = (boosting ? tuning.turboMaxSpeed : tuning.maxRollSpeed) * speedScale;
        const acceleration =
          (boosting ? tuning.turboAcceleration : tuning.rollAcceleration) * accelerationScale;
        const nextX = this.linearVelocity.x + driveX * acceleration * FIXED_DT;
        const nextZ = this.linearVelocity.z + driveZ * acceleration * FIXED_DT;
        const nextSpeed = Math.hypot(nextX, nextZ);
        // Steering may redirect extra speed (from slopes or a finished turbo)
        // but cannot hold it: above top speed it bleeds off.
        const allowed =
          currentSpeed > topSpeed
            ? Math.max(topSpeed, currentSpeed - tuning.overspeedDrag * FIXED_DT)
            : topSpeed;
        const scale = nextSpeed > allowed && nextSpeed > 0 ? allowed / nextSpeed : 1;
        this.linearVelocity.x = nextX * scale;
        this.linearVelocity.z = nextZ * scale;
      }

      // Rolling resistance, weaker while the player keeps pushing.
      const resistance =
        tuning.rollingResistance *
        (this.slippery ? ROLL_RESISTANCE_SCALE.ice_patch : ROLL_RESISTANCE_SCALE[this.surface]) *
        (driving ? 0.4 : 1);
      const rolledSpeed = Math.hypot(this.linearVelocity.x, this.linearVelocity.z);
      if (rolledSpeed > 0) {
        const reduced = Math.max(0, rolledSpeed - resistance * FIXED_DT);
        this.linearVelocity.x *= reduced / rolledSpeed;
        this.linearVelocity.z *= reduced / rolledSpeed;
      }

      // Slopes pull the ball downhill along the ground plane.
      const normal = this.groundNormal();
      if (normal) {
        const pull = -GRAVITY * tuning.slopeGravityScale * normal.y;
        this.linearVelocity.x += pull * normal.x * FIXED_DT;
        this.linearVelocity.z += pull * normal.z * FIXED_DT;
      }
    } else if (hasMovement && !this.pounding) {
      const control = this.launchTicks > 0 ? LAUNCH_AIR_CONTROL : 1;
      this.linearVelocity.x += directionX * tuning.airAcceleration * control * FIXED_DT;
      this.linearVelocity.z += directionZ * tuning.airAcceleration * control * FIXED_DT;
    }

    const horizontal = Math.hypot(this.linearVelocity.x, this.linearVelocity.z);
    if (horizontal > tuning.hardSpeedCap) {
      this.linearVelocity.x *= tuning.hardSpeedCap / horizontal;
      this.linearVelocity.z *= tuning.hardSpeedCap / horizontal;
    }

    if (!floating) {
      if (this.pounding) {
        this.linearVelocity.y = -tuning.poundSpeed;
      } else if (!this.isGrounded) {
        this.linearVelocity.y = Math.max(-52, this.linearVelocity.y + GRAVITY * FIXED_DT);
      } else if (this.linearVelocity.y < 0) {
        this.linearVelocity.y = -1.5;
      }
    }

    const fallSpeed = -this.linearVelocity.y;
    const airborneBefore = !this.isGrounded;
    const blocked = this.moveAndCollide(tuning.wallRestitution, tuning.wallBounceMinSpeed);
    if (blocked > tuning.wallBounceMinSpeed + 2) {
      this.emitMascot({ type: 'bounce', position: { ...this.feet }, speed: blocked });
    }

    if (airborneBefore && this.isGrounded) {
      if (this.pounding) {
        this.pounding = false;
        this.emitMascot({ type: 'impact', kind: 'pound', position: { ...this.feet } });
        this.linearVelocity.y = tuning.poundBounce;
        this.isGrounded = false;
        this.jumpsUsed = 1;
      } else if (fallSpeed > tuning.bounceMinFallSpeed) {
        const bounce = Math.min(tuning.bounceMax, fallSpeed * tuning.bounceRestitution);
        this.linearVelocity.y = bounce;
        this.isGrounded = false;
        // A bounce counts as touching down: the player may jump out of it.
        this.jumpsUsed = 0;
        this.coyoteTicks = secondsToTicks(tuning.coyoteSeconds);
        this.emitMascot({ type: 'bounce', position: { ...this.feet }, speed: fallSpeed });
      }
    }

    const facingSpeed = Math.hypot(this.linearVelocity.x, this.linearVelocity.z);
    if (facingSpeed > COCONUT_FACING_SPEED) {
      this.mascotHeading = Math.atan2(this.linearVelocity.x, this.linearVelocity.z);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.controller.free();
    this.physics.world.removeRigidBody(this.body);
  }
}
