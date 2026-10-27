import RAPIER from '@dimforge/rapier3d-compat';
import {
  BOAT_BEACH_DEPTH,
  BOAT_DRAFT,
  SIDECAR_WHEELBASE,
  VEHICLE_MAP_LIMIT,
  VEHICLES,
  vehicleLocalToWorld,
  vehicleRotation,
  vehicleTicks,
  type DrivableVehicleKind,
  type VehicleDefinition,
} from '../config/vehicles.js';
import { sampleMapHeight, surfaceTagAt } from '../config/map-fjord.js';
import { FIXED_DT, GRAVITY, WATER_LEVEL } from '../constants.js';
import type { SurfaceTag } from '../types/map.js';
import { InputButton, type InputButtonMask, type Vec3 } from '../types/index.js';
import type { PhysicsWorld } from './world.js';
import { advanceAircraft, AIRCRAFT_RULES } from './aircraft.js';

/**
 * Membership bit 4 (0x0008) = vehicle hulls; filter = world (0x1), players
 * (0x2) and other hulls (0x8). Their contacts are never solved (kinematic).
 * A character whose membership is outside that filter (the drifter class,
 * 0x0004) passes through every hull: see `collidesWithVehicles`.
 */
export const VEHICLE_COLLISION_GROUP = 0x0008000b;

/** Elastic share of a boat's speed into a wall (above the minimum impact speed). */
const BOAT_RESTITUTION = 0.5;
const BOAT_BOUNCE_MIN_SPEED = 2;

/** Whether hulls block, ram and shove this collider (false for a membership outside the hull filter). */
export function collidesWithVehicles(collider: RAPIER.Collider): boolean {
  const membership = collider.collisionGroups() >>> 16;
  return (membership & VEHICLE_COLLISION_GROUP & 0xffff) !== 0;
}

/** What a seat controls this tick (a PlayerInput works as is). */
export interface VehicleControlInput {
  buttons: InputButtonMask;
  /** Aim yaw/pitch (world). The gunner's turret follows them. */
  yaw: number;
  pitch: number;
}

/** Everything prediction needs to restore the motor exactly. */
export interface VehicleMotorState {
  pitch?: number;
  roll?: number;
  position: Vec3;
  yaw: number;
  velocity: Vec3;
  yawRate: number;
  steer: number;
  turretYaw: number;
  turretPitch: number;
  grounded: boolean;
  beached: boolean;
  afloat: boolean;
  handbrake: boolean;
  boostTicks: number;
  boostCooldownTicks: number;
  weaponCooldownTicks: number;
}

export type VehicleMotorEvent =
  | { type: 'fire'; origin: Vec3; direction: Vec3; yaw: number; pitch: number }
  | { type: 'boost' }
  | { type: 'crash'; impact: number };

interface Traction {
  /** Acceleration and grip factor. */
  grip: number;
  /** Top-speed factor. */
  speed: number;
}

/** Surface tags → traction. Tracks dig into snow and sand; wheels slide. */
function tractionFor(chassis: VehicleDefinition['chassis'], surface: SurfaceTag): Traction {
  if (chassis === 'tracked') {
    switch (surface) {
      case 'snow':
        return { grip: 0.9, speed: 0.95 };
      case 'sand':
        return { grip: 0.85, speed: 0.9 };
      case 'ice_patch':
        return { grip: 0.45, speed: 1 };
      case 'rock_cliff':
        return { grip: 0.85, speed: 0.9 };
      case 'water':
        return { grip: 0.6, speed: 0.55 };
      default:
        return { grip: 1, speed: 1 };
    }
  }
  switch (surface) {
    case 'snow':
      return { grip: 0.62, speed: 0.82 };
    case 'sand':
      return { grip: 0.66, speed: 0.76 };
    case 'ice_patch':
      return { grip: 0.28, speed: 1 };
    case 'grass_mud':
      return { grip: 0.9, speed: 0.92 };
    case 'rock_cliff':
      return { grip: 0.8, speed: 0.85 };
    case 'water':
      return { grip: 0.5, speed: 0.45 };
    default:
      return { grip: 1, speed: 1 };
  }
}

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

function yawQuaternion(yaw: number): RAPIER.Rotation {
  return { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) };
}

/** Muzzle world point and direction for a vehicle pose and turret state. */
export function vehicleMuzzle(
  definition: VehicleDefinition,
  position: Vec3,
  yaw: number,
  turretYaw: number,
  turretPitch: number,
): { origin: Vec3; direction: Vec3; yaw: number; pitch: number } | null {
  const weapon = definition.weapon;
  if (!weapon) return null;
  const aimYaw = yaw + turretYaw;
  const pivot = vehicleLocalToWorld(position, yaw, weapon.turretPivot);
  const barrel = vehicleLocalToWorld(pivot, aimYaw, weapon.barrelPivot);
  const cosPitch = Math.cos(turretPitch);
  const sinPitch = Math.sin(turretPitch);
  // Barrel space: +Z along the barrel (pitched up by turretPitch), +Y its up.
  const local = weapon.muzzle;
  const forwardY = local.z * sinPitch + local.y * cosPitch;
  const forwardZ = local.z * cosPitch - local.y * sinPitch;
  const origin = vehicleLocalToWorld(barrel, aimYaw, { x: local.x, y: forwardY, z: forwardZ });
  const direction = {
    x: Math.sin(aimYaw) * cosPitch,
    y: sinPitch,
    z: Math.cos(aimYaw) * cosPitch,
  };
  return { origin, direction, yaw: wrapAngle(aimYaw), pitch: turretPitch };
}

/**
 * Shared, deterministic vehicle motor: the same code drives the
 * authoritative server vehicles and the driver's client prediction.
 *
 * A kinematic hull (rounded box) moved by Rapier's character
 * controller, so it collides with the static world and other hulls, climbs
 * up to its slope limit, steps over kerbs and snaps to the ground. Player
 * capsules never block a hull; the server resolves run-overs instead.
 *
 * Chassis models:
 *   tracked  skid steer: W/S throttle, A/D turn on the spot, very high side grip;
 *   wheeled  arcade bicycle model: steering angle → yaw rate ∝ speed, Space is
 *            the handbrake (low rear grip → drift);
 *   boat     floats at the waterline (bobbing is visual), thrust and rudder
 *            only while afloat, low side grip (drift), Shift = plug turbo;
 *            terrain shallower than BOAT_BEACH_DEPTH beaches it (no thrust).
 *   aircraft arcade flight with pitch/bank, fixed gun and float-ski landings.
 * Land vehicles treat water deeper than their ford depth as a wall; a hull
 * that ends up deeper anyway (falling in) reports `drowned`.
 */
export class VehicleBody {
  readonly handle: number;
  readonly kind: DrivableVehicleKind;
  readonly definition: VehicleDefinition;
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  private readonly physics: PhysicsWorld;
  private readonly controller: RAPIER.KinematicCharacterController;
  private readonly colliderOffsetY: number;
  private readonly clearanceShape: RAPIER.Cuboid;
  private readonly clearanceOffsetY: number;
  private base: Vec3;
  private heading: number;
  private flightPitch = 0;
  private flightRoll = 0;
  private linear: Vec3 = { x: 0, y: 0, z: 0 };
  private turnRate = 0;
  private steerAngle = 0;
  private turret = 0;
  private barrel = 0;
  private isGrounded = false;
  private isBeached = false;
  private isAfloat = false;
  private braking = false;
  private boost = 0;
  private boostCooldown = 0;
  private weaponCooldown = 0;
  private previousDriver: InputButtonMask = 0;
  private previousGunner: InputButtonMask = 0;
  private events: VehicleMotorEvent[] = [];
  private restingTicks = 0;
  private stalledTicks = 0;
  private measuredSpeed = 0;
  private disposed = false;

  constructor(physics: PhysicsWorld, handle: number, kind: DrivableVehicleKind, position: Vec3, yaw: number) {
    this.physics = physics;
    this.handle = handle;
    this.kind = kind;
    this.definition = VEHICLES[kind];
    const half = this.definition.halfExtents;
    this.base = { ...position };
    this.heading = wrapAngle(yaw);

    const boat = this.definition.chassis === 'boat';
    // The boat hull floats: its collider starts above the keel so sand under
    // a shallow hull never wedges it; a steeper shore still stops the bow.
    const bottom = boat ? 0.3 : 0;
    const halfY = Math.max(0.15, half.y - bottom / 2);
    this.colliderOffsetY = bottom + halfY;
    const border = Math.min(0.25, halfY * 0.45, half.x * 0.3);
    const bodyDescription = RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(position.x, position.y, position.z)
      .setRotation(yawQuaternion(this.heading));
    this.body = physics.world.createRigidBody(bodyDescription);
    const colliderDescription = RAPIER.ColliderDesc.roundCuboid(
      Math.max(0.05, half.x - border),
      Math.max(0.05, halfY - border),
      Math.max(0.05, half.z - border),
      border,
    )
      .setTranslation(0, this.colliderOffsetY, 0)
      .setFriction(0.5)
      .setRestitution(0)
      .setCollisionGroups(VEHICLE_COLLISION_GROUP);
    this.collider = physics.world.createCollider(colliderDescription, this.body);

    // Turning on the spot is refused when the upper hull would cut into a
    // wall; the lower part may graze bumps the step height covers anyway.
    const clearanceBottom = bottom + this.definition.stepHeight + 0.12;
    const clearanceHalfY = Math.max(0.1, (half.y * 2 - clearanceBottom) / 2 - 0.05);
    this.clearanceShape = new RAPIER.Cuboid(half.x * 0.97, clearanceHalfY, half.z * 0.97);
    this.clearanceOffsetY = clearanceBottom + clearanceHalfY;

    this.controller = physics.world.createCharacterController(0.03);
    this.controller.setUp({ x: 0, y: 1, z: 0 });
    this.controller.setSlideEnabled(true);
    this.controller.setMaxSlopeClimbAngle(this.definition.maxSlope);
    this.controller.setMinSlopeSlideAngle(this.definition.maxSlope + (6 * Math.PI) / 180);
    if (boat || this.definition.chassis === 'aircraft') {
      this.controller.disableAutostep();
      this.controller.disableSnapToGround();
    } else {
      this.controller.enableAutostep(this.definition.stepHeight, 0.25, false);
      this.controller.enableSnapToGround(0.55);
    }
    this.controller.setApplyImpulsesToDynamicBodies(false);
    this.syncCollider();
    if (boat) this.settleBoat();
  }

  get position(): Vec3 {
    return { ...this.base };
  }

  get yaw(): number {
    return this.heading;
  }

  get pitch(): number { return this.flightPitch; }
  get roll(): number { return this.flightRoll; }

  get velocity(): Vec3 {
    return { ...this.linear };
  }

  get forwardSpeed(): number {
    return this.linear.x * Math.sin(this.heading) + this.linear.z * Math.cos(this.heading);
  }

  get speed(): number {
    return Math.hypot(this.linear.x, this.linear.z);
  }

  /** Horizontal speed the hull really moved last tick (rams use it, not the drive speed). */
  get movedSpeed(): number {
    return this.measuredSpeed;
  }

  get yawRate(): number {
    return this.turnRate;
  }

  get turretYaw(): number {
    return this.turret;
  }

  get turretPitch(): number {
    return this.barrel;
  }

  get grounded(): boolean {
    return this.isGrounded;
  }

  get beached(): boolean {
    return this.isBeached;
  }

  get afloat(): boolean {
    return this.isAfloat;
  }

  get boosting(): boolean {
    return this.boost > 0;
  }

  get colliderHandle(): number {
    return this.collider.handle;
  }

  /** A land vehicle whose hull sank below its ford depth (fell into the sea). */
  get drowned(): boolean {
    if (this.definition.chassis === 'boat' || this.definition.chassis === 'aircraft') return false;
    return this.base.y < WATER_LEVEL - this.definition.fordDepth - 0.6;
  }

  /** True after a while without motion or input (the server may skip it). */
  get resting(): boolean {
    return this.restingTicks > 90;
  }

  get state(): VehicleMotorState {
    return {
      ...(this.definition.chassis === 'aircraft' ? { pitch: this.flightPitch, roll: this.flightRoll } : {}),
      position: { ...this.base },
      yaw: this.heading,
      velocity: { ...this.linear },
      yawRate: this.turnRate,
      steer: this.steerAngle,
      turretYaw: this.turret,
      turretPitch: this.barrel,
      grounded: this.isGrounded,
      beached: this.isBeached,
      afloat: this.isAfloat,
      handbrake: this.braking,
      boostTicks: this.boost,
      boostCooldownTicks: this.boostCooldown,
      weaponCooldownTicks: this.weaponCooldown,
    };
  }

  get driverButtons(): InputButtonMask {
    return this.previousDriver;
  }

  get gunnerButtons(): InputButtonMask {
    return this.previousGunner;
  }

  muzzle(): { origin: Vec3; direction: Vec3; yaw: number; pitch: number } | null {
    if (this.definition.chassis === 'aircraft' && this.definition.weapon) {
      const weapon = this.definition.weapon;
      const local = { x: weapon.barrelPivot.x + weapon.muzzle.x, y: weapon.barrelPivot.y + weapon.muzzle.y, z: weapon.barrelPivot.z + weapon.muzzle.z };
      const origin = vehicleLocalToWorld(this.base,this.heading,local,this.flightPitch,this.flightRoll);
      const direction = vehicleLocalToWorld({x:0,y:0,z:0},this.heading,{x:0,y:0,z:1},this.flightPitch,this.flightRoll);
      return { origin, direction, yaw: this.heading, pitch: this.flightPitch };
    }
    return vehicleMuzzle(this.definition, this.base, this.heading, this.turret, this.barrel);
  }

  drainEvents(): VehicleMotorEvent[] {
    const events = this.events;
    this.events = [];
    return events;
  }

  setColliderEnabled(enabled: boolean): void {
    this.collider.setEnabled(enabled);
  }

  /** Places the vehicle (spawn, respawn, remote snapshot pose) and clears its motion. */
  teleport(position: Vec3, yaw: number): void {
    this.base = { ...position };
    this.heading = wrapAngle(yaw);
    this.flightPitch = 0; this.flightRoll = 0;
    this.linear = { x: 0, y: 0, z: 0 };
    this.turnRate = 0;
    this.steerAngle = 0;
    this.turret = 0;
    this.barrel = 0;
    this.boost = 0;
    this.boostCooldown = 0;
    this.weaponCooldown = 0;
    this.braking = false;
    this.previousDriver = 0;
    this.previousGunner = 0;
    this.events = [];
    this.restingTicks = 0;
    this.stalledTicks = 0;
    this.measuredSpeed = 0;
    this.isGrounded = false;
    if (this.definition.chassis === 'boat') this.settleBoat();
    this.syncCollider();
  }

  /** Restores authoritative state before replaying inputs (and remote poses). */
  restore(state: VehicleMotorState, previousDriver?: InputButtonMask, previousGunner?: InputButtonMask): void {
    this.base = { ...state.position };
    this.heading = wrapAngle(state.yaw);
    this.flightPitch = state.pitch ?? 0; this.flightRoll = state.roll ?? 0;
    this.linear = { ...state.velocity };
    this.turnRate = state.yawRate;
    this.steerAngle = state.steer;
    this.turret = wrapAngle(state.turretYaw);
    this.barrel = state.turretPitch;
    this.isGrounded = state.grounded;
    this.isBeached = state.beached;
    this.isAfloat = state.afloat;
    this.braking = state.handbrake;
    this.boost = state.boostTicks;
    this.boostCooldown = state.boostCooldownTicks;
    this.weaponCooldown = state.weaponCooldownTicks;
    if (previousDriver !== undefined) this.previousDriver = previousDriver;
    if (previousGunner !== undefined) this.previousGunner = previousGunner;
    this.restingTicks = 0;
    this.syncCollider();
  }

  /** Adds an external velocity change (explosion shove). */
  push(velocity: Vec3): void {
    this.linear.x += velocity.x;
    this.linear.y += velocity.y;
    this.linear.z += velocity.z;
    if (velocity.y > 0.5) this.isGrounded = false;
    this.restingTicks = 0;
  }

  /**
   * One fixed step. `driver` steers (null = nobody at the wheel: coasting),
   * `gunner` aims and fires the vehicle weapon (the driver's input again for
   * the tanks' driver-gunner seat).
   */
  simulate(driver: VehicleControlInput | null, gunner: VehicleControlInput | null, trackButtons = true): void {
    if (this.disposed) return;
    if (this.definition.chassis === 'aircraft') { this.simulateAircraft(driver,gunner,trackButtons); return; }
    const definition = this.definition;
    const dt = FIXED_DT;
    const buttons = driver?.buttons ?? 0;
    const throttle = (buttons & InputButton.Forward ? 1 : 0) - (buttons & InputButton.Backward ? 1 : 0);
    const steerInput = (buttons & InputButton.Right ? 1 : 0) - (buttons & InputButton.Left ? 1 : 0);
    const chassis = definition.chassis;
    this.braking = chassis === 'wheeled' && (buttons & InputButton.Jump) !== 0;

    // Plug turbo (boat): Shift press, while afloat.
    if (this.boost > 0) this.boost -= 1;
    if (this.boostCooldown > 0) this.boostCooldown -= 1;
    const boostDefinition = definition.boost;
    const sprintPressed = (buttons & InputButton.Sprint) !== 0 && (this.previousDriver & InputButton.Sprint) === 0;
    if (boostDefinition && sprintPressed && this.boostCooldown <= 0 && (chassis !== 'boat' || this.isAfloat)) {
      this.boost = vehicleTicks(boostDefinition.seconds);
      this.boostCooldown = vehicleTicks(boostDefinition.cooldownSeconds);
      this.events.push({ type: 'boost' });
    }

    const surface = chassis === 'boat' ? 'water' : surfaceTagAt(this.base.x, this.base.z, this.base.y);
    const traction = chassis === 'boat' ? { grip: 1, speed: 1 } : tractionFor(chassis, surface);
    const boostScale = this.boost > 0 && boostDefinition ? boostDefinition.speedScale : 1;
    const maxForward = definition.maxForwardSpeed * traction.speed * boostScale;
    const maxReverse = definition.maxReverseSpeed * traction.speed;
    // A boat that has just nosed onto the beach, with water still under its
    // middle, can rudder and back off (no forward thrust onto the sand).
    const centreGround = chassis === 'boat' ? sampleMapHeight(this.base.x, this.base.z) : 0;
    const shallows = chassis === 'boat' && !this.isAfloat && centreGround < WATER_LEVEL;
    // In the shallows only thrust toward deeper water works (bow or stern
    // end, whichever lies lower than the middle of the hull).
    let shallowThrust = false;
    if (shallows && throttle !== 0) {
      const end = this.definition.halfExtents.z * throttle;
      const endGround = sampleMapHeight(this.base.x + Math.sin(this.heading) * end, this.base.z + Math.cos(this.heading) * end);
      shallowThrust = endGround < centreGround;
    }
    const driving = chassis === 'boat' ? this.isAfloat || shallowThrust : this.isGrounded;
    const speedAlong = this.linear.x * Math.sin(this.heading) + this.linear.z * Math.cos(this.heading);

    // Steering first: the hull turns, its momentum lags behind (side slip),
    // and the tyres / tracks / water then grip it back into the new heading.
    let targetRate = 0;
    if (chassis === 'tracked') {
      if (this.isGrounded) {
        const speedFactor = Math.abs(speedAlong) > maxForward * 0.6 ? 0.8 : 1;
        targetRate = steerInput * definition.turnRate * speedFactor * traction.grip;
      }
      this.turnRate += (targetRate - this.turnRate) * (1 - Math.exp(-definition.turnResponse * dt));
    } else if (chassis === 'boat') {
      if (this.isAfloat || shallows) {
        const authority = Math.min(1, 0.35 + Math.abs(speedAlong) / 6);
        const direction = speedAlong < -0.5 ? -1 : 1;
        targetRate = steerInput * definition.turnRate * authority * direction * (this.boost > 0 ? 0.55 : 1);
      }
      this.turnRate += (targetRate - this.turnRate) * (1 - Math.exp(-definition.turnResponse * dt));
    } else {
      const speedRatio = Math.min(1, Math.abs(speedAlong) / definition.maxForwardSpeed);
      const maxSteer = definition.turnRate * (1 - 0.62 * speedRatio);
      const targetSteer = steerInput * maxSteer;
      this.steerAngle += (targetSteer - this.steerAngle) * (1 - Math.exp(-definition.turnResponse * dt));
      if (this.isGrounded) {
        const drift = this.braking ? 1.45 : 1;
        targetRate = (speedAlong * Math.tan(this.steerAngle) * drift) / SIDECAR_WHEELBASE;
        this.turnRate += (targetRate - this.turnRate) * (1 - Math.exp(-12 * dt));
      } else {
        this.turnRate *= Math.exp(-1.5 * dt);
      }
    }

    // Yaw, refused when the upper hull would cut into a wall.
    let nextYaw = wrapAngle(this.heading + this.turnRate * dt);
    if (Math.abs(this.turnRate) > 1e-5 && this.rotationBlocked(nextYaw)) {
      nextYaw = this.heading;
      this.turnRate = 0;
    }
    this.heading = nextYaw;
    const nextSin = Math.sin(this.heading);
    const nextCos = Math.cos(this.heading);
    let forward = this.linear.x * nextSin + this.linear.z * nextCos;
    let lateral = this.linear.x * nextCos - this.linear.z * nextSin;

    if (driving) {
      const target = throttle > 0 ? maxForward : throttle < 0 ? -maxReverse : 0;
      if (throttle !== 0 && Math.sign(forward) === -throttle && Math.abs(forward) > 0.3) {
        forward = moveTowards(forward, 0, definition.braking * traction.grip * dt);
      } else if (throttle !== 0 && Math.abs(target) >= Math.abs(forward)) {
        const acceleration = definition.acceleration * traction.grip * (this.boost > 0 ? 3.2 : 1);
        forward = moveTowards(forward, target, acceleration * dt);
      } else {
        // Coasting, or faster than the throttle allows (after a turbo).
        forward = moveTowards(forward, target, definition.coastDrag * dt);
      }
      if (this.braking) forward = moveTowards(forward, 0, definition.braking * 0.35 * traction.grip * dt);
      const grip = definition.lateralGrip * traction.grip * (this.braking ? 0.14 : 1);
      lateral = moveTowards(lateral, 0, grip * dt);
    } else if (chassis === 'boat') {
      // Beached: the hull grinds to a halt on the sand.
      forward = moveTowards(forward, 0, 9 * dt);
      lateral = moveTowards(lateral, 0, 9 * dt);
    }

    let vx = nextSin * forward + nextCos * lateral;
    let vz = nextCos * forward - nextSin * lateral;

    // Land vehicles: deep water ahead of the bow is a wall while the tracks
    // or wheels are on the ground (steep banks included; a jump still flies),
    // unless something solid holds the bow up there (a pier, deck or bridge).
    const planar = Math.hypot(vx, vz);
    if (chassis !== 'boat' && this.isGrounded && planar > 1e-3) {
      const reach = definition.halfExtents.z + planar * dt * 6;
      const bowX = this.base.x + (vx / planar) * reach;
      const bowZ = this.base.z + (vz / planar) * reach;
      const floor = WATER_LEVEL - definition.fordDepth;
      if (sampleMapHeight(bowX, bowZ) < floor) {
        const drop = definition.stepHeight + 1.5;
        const support = this.physics.raycast({ x: bowX, y: this.base.y + definition.stepHeight, z: bowZ }, { x: 0, y: -1, z: 0 }, drop, this.collider.handle);
        const supported = support !== null && support.point.y >= floor;
        if (!supported) {
          vx = 0;
          vz = 0;
        }
      }
    }

    let vy = this.linear.y;
    if (chassis === 'boat') {
      vy = 0;
      const shore = this.boatShore(vx, vz, dt);
      vx = shore.x;
      vz = shore.z;
    } else if (this.isGrounded && vy <= 0.5) {
      vy = -2;
    } else {
      vy = Math.max(-50, vy + GRAVITY * dt);
    }

    // Keep the hull on the map.
    const limit = VEHICLE_MAP_LIMIT;
    if (Math.abs(this.base.x + vx * dt) > limit) vx = 0;
    if (Math.abs(this.base.z + vz * dt) > limit) vz = 0;

    this.syncCollider();
    const desired = { x: vx * dt, y: vy * dt, z: vz * dt };
    this.controller.computeColliderMovement(
      this.collider,
      desired,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      undefined,
      (collider) => this.solid(collider.handle),
    );
    const moved = this.controller.computedMovement();
    const next = { x: this.base.x + moved.x, y: this.base.y + moved.y, z: this.base.z + moved.z };

    // Walls (steep faces of props, cliffs and other hulls) take the speed
    // that pushes into them. Gentle terrain and kerbs only shorten a step
    // (slope climbing, autostep): the drive speed is kept there, or a hull
    // could never build up speed on a bumpy slope.
    const collisions = this.controller.numComputedCollisions();
    for (let index = 0; index < collisions; index += 1) {
      const collision = this.controller.computedCollision(index);
      if (!collision) continue;
      const normal = collision.normal1;
      if (normal.y > 0.5) continue;
      const length = Math.hypot(normal.x, normal.z);
      if (length < 1e-4) continue;
      const nx = normal.x / length;
      const nz = normal.z / length;
      const into = vx * nx + vz * nz;
      if (into < 0) {
        // The rubber flamingo bounces off rocks, piers and hulls.
        const restitution = chassis === 'boat' && into < -BOAT_BOUNCE_MIN_SPEED ? BOAT_RESTITUTION : 0;
        vx -= (1 + restitution) * into * nx;
        vz -= (1 + restitution) * into * nz;
      }
    }
    const desiredHorizontal = Math.hypot(desired.x, desired.z);
    const movedHorizontal = Math.hypot(moved.x, moved.z);
    // A hull that keeps pushing without getting anywhere loses its speed.
    if (desiredHorizontal > 0.004 && movedHorizontal < desiredHorizontal * 0.25) {
      this.stalledTicks += 1;
      if (this.stalledTicks > 18) {
        vx *= 0.88;
        vz *= 0.88;
      }
    } else {
      this.stalledTicks = 0;
    }
    this.measuredSpeed = movedHorizontal / dt;

    if (chassis === 'boat') {
      this.base = next;
      this.settleBoat();
      vy = 0;
    } else {
      const grounded = this.controller.computedGrounded();
      if (grounded && vy < 0) vy = 0;
      if (desired.y > 0 && moved.y < desired.y - 1e-4) vy = 0;
      this.isGrounded = grounded;
      this.base = next;
    }
    this.linear = { x: vx, y: vy, z: vz };

    // Turret: slews toward the gunner's aim; holds without a gunner.
    const weapon = definition.weapon;
    if (this.weaponCooldown > 0) this.weaponCooldown -= 1;
    const gunnerButtons = gunner?.buttons ?? 0;
    if (weapon && gunner) {
      const targetYaw = wrapAngle(gunner.yaw - this.heading);
      const delta = wrapAngle(targetYaw - this.turret);
      this.turret = wrapAngle(this.turret + Math.max(-weapon.yawRate * dt, Math.min(weapon.yawRate * dt, delta)));
      const targetPitch = Math.max(weapon.minPitch, Math.min(weapon.maxPitch, gunner.pitch));
      this.barrel = moveTowards(this.barrel, targetPitch, weapon.pitchRate * dt);
      const fireHeld = (gunnerButtons & InputButton.FirePrimary) !== 0;
      const firePressed = fireHeld && (this.previousGunner & InputButton.FirePrimary) === 0;
      if ((weapon.automatic ? fireHeld : firePressed) && this.weaponCooldown <= 0) {
        this.weaponCooldown = vehicleTicks(weapon.cooldownSeconds);
        const muzzle = this.muzzle();
        if (muzzle) this.events.push({ type: 'fire', ...muzzle });
      }
    }

    const still = Math.hypot(vx, vz) < 0.05 && Math.abs(this.turnRate) < 1e-3 && (this.isGrounded || chassis === 'boat');
    this.restingTicks = still && buttons === 0 && gunnerButtons === 0 ? this.restingTicks + 1 : 0;
    if (trackButtons) {
      this.previousDriver = buttons;
      this.previousGunner = gunnerButtons;
    }
    this.commitPose();
  }

  private simulateAircraft(driver: VehicleControlInput | null, gunner: VehicleControlInput | null, trackButtons: boolean): void {
    const dt = FIXED_DT;
    const terrain = sampleMapHeight(this.base.x,this.base.z);
    const support = this.physics.raycast({x:this.base.x,y:this.base.y+0.7,z:this.base.z},{x:0,y:-1,z:0},6,this.collider.handle);
    const floor = Math.max(terrain,WATER_LEVEL-BOAT_DRAFT,support?.point.y ?? -Infinity);
    const onSurface = this.isGrounded && this.base.y <= floor+1.4 && this.linear.y <= 0.3
      || this.base.y <= floor+0.06 && Math.abs(this.linear.y) < 0.3;
    const step = advanceAircraft({position:this.base,velocity:this.linear,yaw:this.heading,pitch:this.flightPitch,roll:this.flightRoll,grounded:onSurface},driver);
    this.heading = step.yaw; this.turnRate = step.yawRate;
    this.flightPitch = step.pitch; this.flightRoll = step.roll;
    if (step.takingOff) this.base.y = Math.max(this.base.y,floor+Math.sin(step.pitch)*this.definition.halfExtents.z+0.04);
    const velocity = {...step.velocity};
    if (Math.abs(this.base.x+velocity.x*dt)>VEHICLE_MAP_LIMIT) velocity.x=0;
    if (Math.abs(this.base.z+velocity.z*dt)>VEHICLE_MAP_LIMIT) velocity.z=0;
    this.syncCollider();
    this.controller.computeColliderMovement(this.collider,{x:velocity.x*dt,y:velocity.y*dt,z:velocity.z*dt},RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,undefined,c=>this.solid(c.handle));
    const moved=this.controller.computedMovement();
    const next={x:this.base.x+moved.x,y:this.base.y+moved.y,z:this.base.z+moved.z};
    let impact=0;
    for(let i=0;i<this.controller.numComputedCollisions();i++) {
      const normal=this.controller.computedCollision(i)?.normal1;
      if(!normal)continue;
      const closing=-(velocity.x*normal.x+velocity.y*normal.y+velocity.z*normal.z);
      if(normal.y<0.65) impact=Math.max(impact,closing>12?closing:0);
      else if(!onSurface && -velocity.y>AIRCRAFT_RULES.safeLandingSpeed) impact=Math.max(impact,-velocity.y);
    }
    const nextTerrain=sampleMapHeight(next.x,next.z), waterFloor=WATER_LEVEL-BOAT_DRAFT;
    const landingFloor=Math.max(nextTerrain,waterFloor);
    this.isGrounded=!step.takingOff && this.controller.computedGrounded();
    if(next.y<=landingFloor+0.035 && velocity.y<=0) {
      if(!onSurface && -velocity.y>AIRCRAFT_RULES.safeLandingSpeed)impact=Math.max(impact,-velocity.y);
      next.y=landingFloor+0.035;velocity.y=0;this.isGrounded=true;
    } else if(this.isGrounded) velocity.y=0;
    this.isAfloat=this.isGrounded && nextTerrain<WATER_LEVEL-0.4 && next.y<WATER_LEVEL+0.1;
    this.isBeached=false;
    this.measuredSpeed=Math.hypot(moved.x,moved.z)/dt;
    this.base=next;this.linear=velocity;
    this.turret=0;this.barrel=0;
    if(impact>0) {this.events.push({type:'crash',impact});this.linear={x:0,y:0,z:0};}
    const weapon=this.definition.weapon;
    if(this.weaponCooldown>0)this.weaponCooldown--;
    if(!impact && gunner && weapon && (gunner.buttons&InputButton.FirePrimary) && this.weaponCooldown<=0) {
      this.weaponCooldown=vehicleTicks(weapon.cooldownSeconds);
      const muzzle=this.muzzle();if(muzzle)this.events.push({type:'fire',...muzzle});
    }
    this.restingTicks=!driver && this.isGrounded && Math.hypot(velocity.x,velocity.z)<0.05 ? this.restingTicks+1 : 0;
    if(trackButtons) {this.previousDriver=driver?.buttons??0;this.previousGunner=gunner?.buttons??0;}
    this.commitPose();
  }

  /** Colliders the hull moves against: never players; boats follow the terrain analytically. */
  private solid(handle: number): boolean {
    if (this.physics.isPlayerCollider(handle)) return false;
    return this.definition.chassis !== 'boat' || !this.physics.isTerrainCollider(handle);
  }

  /**
   * Boats against the shore: sand is no wall, the inflatable slides up a
   * gentle beach (slowed by the slope on top of the sand friction), while a
   * bank steeper than its slope limit stops the motion into it.
   */
  private boatShore(vx: number, vz: number, dt: number): { x: number; z: number } {
    const speed = Math.hypot(vx, vz);
    if (speed < 1e-4) return { x: vx, z: vz };
    const floor = WATER_LEVEL - BOAT_DRAFT;
    const ground = (x: number, z: number): number => Math.max(floor, sampleMapHeight(x, z));
    const reach = this.definition.halfExtents.z * 0.8 + speed * dt;
    const bowX = this.base.x + (vx / speed) * reach;
    const bowZ = this.base.z + (vz / speed) * reach;
    const e = 0.6;
    const gx = (ground(bowX + e, bowZ) - ground(bowX - e, bowZ)) / (2 * e);
    const gz = (ground(bowX, bowZ + e) - ground(bowX, bowZ - e)) / (2 * e);
    const steepness = Math.hypot(gx, gz);
    let x = vx;
    let z = vz;
    if (steepness > Math.tan(this.definition.maxSlope)) {
      const into = (x * gx + z * gz) / steepness;
      if (into > 0) {
        // Rocky shores bounce the rubber hull back like any wall.
        const bounce = into > BOAT_BOUNCE_MIN_SPEED ? 1 + BOAT_RESTITUTION : 1;
        x -= (bounce * into * gx) / steepness;
        z -= (bounce * into * gz) / steepness;
      }
      return { x, z };
    }
    const rise = (x * gx + z * gz) / speed;
    if (rise > 0 && ground(this.base.x, this.base.z) > floor) {
      // Uphill on the sand: gravity along the slope.
      const slowed = Math.max(0, speed + (GRAVITY * rise * dt) / Math.hypot(1, rise));
      x *= slowed / speed;
      z *= slowed / speed;
    }
    return { x, z };
  }

  /** Boat height: the waterline, or the sand under a beached hull. */
  private settleBoat(): void {
    const ground = sampleMapHeight(this.base.x, this.base.z);
    this.isAfloat = ground < WATER_LEVEL - BOAT_BEACH_DEPTH;
    this.isBeached = !this.isAfloat;
    this.isGrounded = this.isBeached;
    this.base.y = Math.max(WATER_LEVEL - BOAT_DRAFT, ground);
  }

  private rotationBlocked(yaw: number): boolean {
    const offset = vehicleLocalToWorld(this.base, yaw, { x: 0, y: this.clearanceOffsetY, z: 0 });
    const hit = this.physics.world.intersectionWithShape(
      offset,
      yawQuaternion(yaw),
      this.clearanceShape,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      undefined,
      this.collider,
      this.body,
      (collider) => this.solid(collider.handle),
    );
    return hit !== null;
  }

  /** Puts the collider at the current pose now (queries this tick) and queues the body pose. */
  private syncCollider(): void {
    const rotation = vehicleRotation(this.heading,this.flightPitch,this.flightRoll);
    if (this.definition.chassis === 'aircraft') {
      this.body.setTranslation(this.base,true); this.body.setRotation(rotation,true);
      this.collider.setTranslation(vehicleLocalToWorld(this.base,this.heading,{x:0,y:this.colliderOffsetY,z:0},this.flightPitch,this.flightRoll));
      this.collider.setRotation(rotation);
      this.body.setNextKinematicTranslation(this.base); this.body.setNextKinematicRotation(rotation);
      return;
    }
    this.collider.setTranslation({ x: this.base.x, y: this.base.y + this.colliderOffsetY, z: this.base.z });
    this.collider.setRotation(rotation);
    this.body.setTranslation(this.base, true);
    this.body.setRotation(rotation, true);
    this.body.setNextKinematicTranslation(this.base);
    this.body.setNextKinematicRotation(rotation);
  }

  private commitPose(): void {
    this.syncCollider();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.physics.world.removeCharacterController(this.controller);
    this.physics.world.removeRigidBody(this.body);
  }
}
