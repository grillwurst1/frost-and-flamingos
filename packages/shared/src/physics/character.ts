import RAPIER from '@dimforge/rapier3d-compat';
import { CLASS_STATS, type ClassStats } from '../config/classes.js';
import { sampleMapHeight, surfaceTagAt } from '../config/map-fjord.js';
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
  PLAYER_MAX_SLOPE,
  PLAYER_SNAP_TO_GROUND,
  PLAYER_STEP_HEIGHT,
  WATER_LEVEL,
} from '../constants.js';
import type { SurfaceTag } from '../types/map.js';
import type {
  ClassId,
  InputButtonMask,
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
}

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
 */
export class CharacterBody {
  readonly handle: number;
  readonly stats: ClassStats;
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

  constructor(physics: PhysicsWorld, handle: number, options: CharacterBodyOptions) {
    this.physics = physics;
    this.handle = handle;
    this.stats = CLASS_STATS[options.classId];
    this.baseHeight = this.stats.height;
    this.currentHeight = this.baseHeight;
    this.feet = { ...options.position };

    const centerY = options.position.y + this.baseHeight / 2;
    const bodyDescription = RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(options.position.x, centerY, options.position.z)
      .setCcdEnabled(false);
    this.body = physics.world.createRigidBody(bodyDescription);
    const halfHeight = Math.max(0.01, (this.baseHeight - this.stats.radius * 2) / 2);
    const colliderDescription = RAPIER.ColliderDesc.capsule(halfHeight, this.stats.radius)
      .setFriction(0)
      .setRestitution(0)
      .setCollisionGroups(PLAYER_COLLISION_GROUP);
    this.collider = physics.world.createCollider(colliderDescription, this.body);

    this.controller = physics.world.createCharacterController(0.02);
    this.controller.enableAutostep(PLAYER_STEP_HEIGHT, 0.22, false);
    this.controller.enableSnapToGround(PLAYER_SNAP_TO_GROUND);
    this.controller.setMaxSlopeClimbAngle(PLAYER_MAX_SLOPE);
    this.controller.setMinSlopeSlideAngle((46 * Math.PI) / 180);
    this.controller.setApplyImpulsesToDynamicBodies(false);
    this.controller.setCharacterMass(78);
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
    this.updateColliderShape();
    const centerY = position.y + this.baseHeight / 2;
    this.body.setTranslation({ x: position.x, y: centerY, z: position.z }, true);
    this.body.setNextKinematicTranslation({ x: position.x, y: centerY, z: position.z });
  }

  restore(
    position: Vec3,
    velocity: Vec3,
    grounded: boolean,
    previousButtons?: InputButtonMask,
    parachuteState?: ParachuteState,
  ): void {
    this.feet = { ...position };
    this.linearVelocity = { ...velocity };
    this.isGrounded = grounded;
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
  }

  private updateColliderShape(): void {
    const halfHeight = Math.max(0.01, (this.currentHeight - this.stats.radius * 2) / 2);
    this.collider.setHalfHeight(halfHeight);
    // Relative to the body: `setTranslation` would move the collider to world space.
    this.collider.setTranslationWrtParent({ x: 0, y: (this.currentHeight - this.baseHeight) / 2, z: 0 });
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
              this.stats.groundAcceleration * surfacePropertiesAt(this.surface).accelerationScale * FIXED_DT;
            this.linearVelocity.x = moveTowards(this.linearVelocity.x, desiredX, acceleration);
            this.linearVelocity.z = moveTowards(this.linearVelocity.z, desiredZ, acceleration);
          } else {
            const friction =
              this.stats.groundFriction * surfacePropertiesAt(this.surface).frictionScale * FIXED_DT;
            this.linearVelocity.x = moveTowards(this.linearVelocity.x, 0, friction);
            this.linearVelocity.z = moveTowards(this.linearVelocity.z, 0, friction);
          }
        } else if (hasMovement) {
          const acceleration = this.stats.airAcceleration * FIXED_DT;
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

    if (Math.abs(corrected.x - desiredMovement.x) > 0.0001) {
      this.linearVelocity.x = corrected.x / FIXED_DT;
    }
    if (Math.abs(corrected.z - desiredMovement.z) > 0.0001) {
      this.linearVelocity.z = corrected.z / FIXED_DT;
    }
    if (desiredMovement.y > 0 && corrected.y < desiredMovement.y - 0.0001) {
      this.linearVelocity.y = 0;
    }

    if (grounded && this.linearVelocity.y < 0) {
      this.linearVelocity.y = 0;
    }

    this.isGrounded = grounded && !this.isSwimming;

    if (this.parachuteOpen && (this.isGrounded || this.isSwimming)) {
      this.cutawayParachute();
    }
    const canopyTarget = this.parachuteOpen ? 1 : 0;
    this.canopyBlend = moveTowards(this.canopyBlend, canopyTarget, FIXED_DT * 3.8);
    this.parachuteRepairTimer = Math.max(0, this.parachuteRepairTimer - FIXED_DT);
    if (trackButtons) this.previousButtons = buttons;
    this.feet = {
      x: nextCenter.x,
      y: nextCenter.y - this.baseHeight / 2,
      z: nextCenter.z,
    };
    this.body.setNextKinematicTranslation(nextCenter);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.controller.free();
    this.physics.world.removeRigidBody(this.body);
  }
}
