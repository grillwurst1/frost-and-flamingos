import RAPIER from '@dimforge/rapier3d-compat';
import { CLASS_STATS, type ClassStats } from '../config/classes.js';
import { FJORD_MAP, terrainSlopeAt } from '../config/map-fjord.js';
import {
  FIXED_DT,
  GRAVITY,
  PLAYER_MAX_SLOPE,
  PLAYER_SNAP_TO_GROUND,
  PLAYER_STEP_HEIGHT,
} from '../constants.js';
import type { ClassId, InputButtonMask, PlayerInput, Vec3 } from '../types/index.js';
import { InputButton } from '../types/index.js';
import { PLAYER_COLLISION_GROUP, type PhysicsWorld } from './world.js';

export interface CharacterBodyOptions {
  position: Vec3;
  classId: ClassId;
}

interface SurfaceProperties {
  accelerationScale: number;
  frictionScale: number;
}

function moveTowards(current: number, target: number, maxDelta: number): number {
  if (Math.abs(target - current) <= maxDelta) return target;
  return current + Math.sign(target - current) * maxDelta;
}

function surfacePropertiesAt(x: number, z: number): SurfaceProperties {
  const height = FJORD_MAP.heightAt(x, z);
  const slope = terrainSlopeAt(x, z);
  if (height > 36 && slope < 0.7) {
    return { accelerationScale: 0.72, frictionScale: 0.38 };
  }
  if (height < 5) {
    return { accelerationScale: 0.9, frictionScale: 0.82 };
  }
  return { accelerationScale: 1, frictionScale: 1 };
}

/**
 * Shared, deterministic kinematic character motor. The same code runs inside
 * the authoritative server and the client prediction world.
 */
export class CharacterBody {
  readonly handle: number;
  readonly stats: ClassStats;
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  private readonly physics: PhysicsWorld;
  private readonly controller: RAPIER.KinematicCharacterController;
  private feet: Vec3;
  private linearVelocity: Vec3 = { x: 0, y: 0, z: 0 };
  private isGrounded = false;
  private previousButtons: InputButtonMask = 0;
  private currentYaw = 0;
  private currentPitch = 0;
  private currentWeaponSlot = 1;
  private disposed = false;

  constructor(physics: PhysicsWorld, handle: number, options: CharacterBodyOptions) {
    this.physics = physics;
    this.handle = handle;
    this.stats = CLASS_STATS[options.classId];
    this.feet = { ...options.position };

    const centerY = options.position.y + this.stats.height / 2;
    const bodyDescription = RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(options.position.x, centerY, options.position.z)
      .setCcdEnabled(false);
    this.body = physics.world.createRigidBody(bodyDescription);
    const halfHeight = Math.max(0.01, (this.stats.height - this.stats.radius * 2) / 2);
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

  teleport(position: Vec3): void {
    this.feet = { ...position };
    this.linearVelocity = { x: 0, y: 0, z: 0 };
    this.isGrounded = false;
    const centerY = position.y + this.stats.height / 2;
    this.body.setTranslation({ x: position.x, y: centerY, z: position.z }, true);
    this.body.setNextKinematicTranslation({ x: position.x, y: centerY, z: position.z });
  }

  restore(
    position: Vec3,
    velocity: Vec3,
    grounded: boolean,
    previousButtons?: InputButtonMask,
  ): void {
    this.feet = { ...position };
    this.linearVelocity = { ...velocity };
    this.isGrounded = grounded;
    if (previousButtons !== undefined) this.previousButtons = previousButtons;
    const centerY = position.y + this.stats.height / 2;
    this.body.setTranslation({ x: position.x, y: centerY, z: position.z }, true);
    this.body.setNextKinematicTranslation({ x: position.x, y: centerY, z: position.z });
  }

  simulate(input: PlayerInput, trackButtons = true): void {
    if (this.disposed) return;

    this.currentYaw = input.yaw;
    this.currentPitch = input.pitch;
    this.currentWeaponSlot = input.weaponSlot;

    const moveX = (input.buttons & InputButton.Right ? 1 : 0) - (input.buttons & InputButton.Left ? 1 : 0);
    const moveZ =
      (input.buttons & InputButton.Forward ? 1 : 0) - (input.buttons & InputButton.Backward ? 1 : 0);
    const magnitude = Math.hypot(moveX, moveZ);
    const normalizedX = magnitude > 1 ? moveX / magnitude : moveX;
    const normalizedZ = magnitude > 1 ? moveZ / magnitude : moveZ;
    const sprinting = (input.buttons & InputButton.Sprint) !== 0;
    const targetSpeed = this.stats.moveSpeed * (sprinting ? this.stats.sprintMultiplier : 1);
    const surface = surfacePropertiesAt(this.feet.x, this.feet.z);

    const forwardX = Math.sin(input.yaw);
    const forwardZ = Math.cos(input.yaw);
    const rightX = Math.cos(input.yaw);
    const rightZ = -Math.sin(input.yaw);
    const desiredX = (forwardX * normalizedZ + rightX * normalizedX) * targetSpeed;
    const desiredZ = (forwardZ * normalizedZ + rightZ * normalizedX) * targetSpeed;

    const hasMovement = magnitude > 0.001;
    if (this.isGrounded) {
      if (hasMovement) {
        const acceleration = this.stats.groundAcceleration * surface.accelerationScale * FIXED_DT;
        this.linearVelocity.x = moveTowards(this.linearVelocity.x, desiredX, acceleration);
        this.linearVelocity.z = moveTowards(this.linearVelocity.z, desiredZ, acceleration);
      } else {
        const friction = this.stats.groundFriction * surface.frictionScale * FIXED_DT;
        this.linearVelocity.x = moveTowards(this.linearVelocity.x, 0, friction);
        this.linearVelocity.z = moveTowards(this.linearVelocity.z, 0, friction);
      }
    } else if (hasMovement) {
      const acceleration = this.stats.airAcceleration * FIXED_DT;
      this.linearVelocity.x = moveTowards(this.linearVelocity.x, desiredX, acceleration);
      this.linearVelocity.z = moveTowards(this.linearVelocity.z, desiredZ, acceleration);
    }

    const jumpPressed = (input.buttons & InputButton.Jump) !== 0;
    const jumpWasPressed = (this.previousButtons & InputButton.Jump) !== 0;
    if (this.isGrounded && jumpPressed && !jumpWasPressed) {
      this.linearVelocity.y = this.stats.jumpSpeed;
      this.isGrounded = false;
    }

    if (!this.isGrounded) {
      this.linearVelocity.y = Math.max(-52, this.linearVelocity.y + GRAVITY * FIXED_DT);
    } else if (this.linearVelocity.y < 0) {
      this.linearVelocity.y = -1.5;
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

    // Rapier's snap-to-ground flag can flicker while traversing a heightfield.
    // A short downward probe keeps ground detection stable without letting the
    // character hover above the surface.
    const proposedFeetY = nextCenter.y - this.stats.height / 2;
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
      this.linearVelocity.y <= 0.1
    ) {
      grounded = true;
      nextCenter.y = probe.point.y + this.stats.height / 2 + 0.02;
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

    this.isGrounded = grounded;
    if (trackButtons) this.previousButtons = input.buttons;
    this.feet = {
      x: nextCenter.x,
      y: nextCenter.y - this.stats.height / 2,
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
