import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { Vector3 } from '@babylonjs/core/Maths/math';
import type { Scene } from '@babylonjs/core/scene';
import type { PhysicsWorld } from '@frost-and-flamingos/shared';

const MOUSE_SENSITIVITY = 0.0022;
const MIN_PITCH = -1.15;
const MAX_PITCH = 1.1;
const MIN_DISTANCE = 2.7;
const MAX_DISTANCE = 8.2;
const SHOULDER_OFFSET = 0.62;
const EYE_HEIGHT = 1.58;

interface SpringState {
  value: Vector3;
  velocity: Vector3;
}

function springStep(state: SpringState, target: Vector3, stiffness: number, damping: number, dt: number): void {
  const ax = (target.x - state.value.x) * stiffness - state.velocity.x * damping;
  const ay = (target.y - state.value.y) * stiffness - state.velocity.y * damping;
  const az = (target.z - state.value.z) * stiffness - state.velocity.z * damping;
  state.velocity.x += ax * dt;
  state.velocity.y += ay * dt;
  state.velocity.z += az * dt;
  state.value.x += state.velocity.x * dt;
  state.value.y += state.velocity.y * dt;
  state.value.z += state.velocity.z * dt;
}

/**
 * Spring-loaded over-the-shoulder camera with terrain-aware collision.
 * Input yaw is authoritative for movement; the camera itself is smoothed.
 */
export class CameraRig {
  readonly camera: FreeCamera;
  private readonly pivotSpring: SpringState = {
    value: new Vector3(0, 0, 0),
    velocity: new Vector3(0, 0, 0),
  };
  private readonly positionSpring: SpringState = {
    value: new Vector3(0, 0, 0),
    velocity: new Vector3(0, 0, 0),
  };
  private yaw = 0;
  private pitch = -0.08;
  private targetYaw = 0;
  private targetPitch = -0.08;
  private distance = 4.8;
  private targetDistance = 4.8;
  private shoulderSide = 1;
  private collisionDistance = 4.8;
  private menuAngle = 0.6;
  private initialized = false;

  constructor(scene: Scene) {
    this.camera = new FreeCamera('player-camera', new Vector3(0, 40, -80), scene);
    this.camera.minZ = 0.12;
    this.camera.maxZ = 5000;
    this.camera.fov = 0.88;
    this.camera.inputs.clear();
    this.camera.inertia = 0;
  }

  get lookYaw(): number {
    return this.targetYaw;
  }

  get lookPitch(): number {
    return this.targetPitch;
  }

  get currentYaw(): number {
    return this.yaw;
  }

  get currentPitch(): number {
    return this.pitch;
  }

  handleMouse(deltaX: number, deltaY: number): void {
    this.targetYaw += deltaX * MOUSE_SENSITIVITY;
    this.targetPitch = Math.max(MIN_PITCH, Math.min(MAX_PITCH, this.targetPitch - deltaY * MOUSE_SENSITIVITY));
  }

  swapShoulder(): void {
    this.shoulderSide *= -1;
  }

  zoom(delta: number): void {
    this.targetDistance = Math.max(MIN_DISTANCE, Math.min(MAX_DISTANCE, this.targetDistance + delta * 0.0022));
  }

  resetAngles(yaw: number, pitch = -0.08): void {
    this.yaw = yaw;
    this.targetYaw = yaw;
    this.pitch = pitch;
    this.targetPitch = pitch;
    this.targetDistance = 4.8;
    this.distance = 4.8;
    this.collisionDistance = 4.8;
    this.initialized = false;
  }

  updatePlayer(dt: number, feet: Vector3, physics: PhysicsWorld): void {
    const clampedDt = Math.min(0.05, Math.max(0.001, dt));
    const yawAlpha = 1 - Math.exp(-clampedDt * 22);
    const pitchAlpha = 1 - Math.exp(-clampedDt * 20);
    this.yaw += shortestAngle(this.yaw, this.targetYaw) * yawAlpha;
    this.pitch += (this.targetPitch - this.pitch) * pitchAlpha;
    this.distance += (this.targetDistance - this.distance) * (1 - Math.exp(-clampedDt * 12));

    const cosPitch = Math.cos(this.pitch);
    const forward = new Vector3(
      Math.sin(this.yaw) * cosPitch,
      Math.sin(this.pitch),
      Math.cos(this.yaw) * cosPitch,
    );
    const right = new Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const pivot = new Vector3(
      feet.x + right.x * SHOULDER_OFFSET * this.shoulderSide,
      feet.y + EYE_HEIGHT + 0.14,
      feet.z + right.z * SHOULDER_OFFSET * this.shoulderSide,
    );
    const desiredCamera = pivot.subtract(forward.scale(this.distance));

    if (!this.initialized) {
      this.pivotSpring.value.copyFrom(pivot);
      this.positionSpring.value.copyFrom(desiredCamera);
      this.initialized = true;
    }

    springStep(this.pivotSpring, pivot, 190, 27, clampedDt);

    const direction = desiredCamera.subtract(this.pivotSpring.value);
    const rayLength = direction.length();
    let allowedDistance = this.distance;
    if (rayLength > 0.001) {
      const normalized = direction.scale(1 / rayLength);
      const hit = physics.raycast(this.pivotSpring.value, normalized, rayLength + 0.4);
      if (hit) {
        allowedDistance = Math.max(1.05, hit.distance - 0.35);
      }
    }
    const collisionAlpha = 1 - Math.exp(-clampedDt * (allowedDistance < this.collisionDistance ? 24 : 7));
    this.collisionDistance += (allowedDistance - this.collisionDistance) * collisionAlpha;

    const collisionAdjusted = this.pivotSpring.value.add(forward.scale(-this.collisionDistance));
    springStep(this.positionSpring, collisionAdjusted, 150, 24, clampedDt);

    this.camera.position.copyFrom(this.positionSpring.value);
    const lookAt = this.pivotSpring.value.add(forward.scale(24));
    this.camera.setTarget(lookAt);
  }

  updateMenu(dt: number): void {
    this.menuAngle += dt * 0.035;
    const radius = 205;
    const height = 82 + Math.sin(this.menuAngle * 0.7) * 8;
    const position = new Vector3(
      Math.cos(this.menuAngle) * radius,
      height,
      -10 + Math.sin(this.menuAngle) * radius,
    );
    this.camera.position.copyFrom(position);
    this.camera.setTarget(new Vector3(0, 24, -10));
    this.initialized = false;
  }

  snapToPlayer(feet: Vector3): void {
    this.initialized = false;
    this.pivotSpring.value.set(feet.x, feet.y + EYE_HEIGHT + 0.14, feet.z);
    const cosPitch = Math.cos(this.pitch);
    const forward = new Vector3(
      Math.sin(this.yaw) * cosPitch,
      Math.sin(this.pitch),
      Math.cos(this.yaw) * cosPitch,
    );
    this.positionSpring.value.copyFrom(this.pivotSpring.value.subtract(forward.scale(this.distance)));
    this.camera.position.copyFrom(this.positionSpring.value);
    this.camera.setTarget(this.pivotSpring.value.add(forward.scale(24)));
  }
}

function shortestAngle(from: number, to: number): number {
  let difference = (to - from) % (Math.PI * 2);
  if (difference > Math.PI) difference -= Math.PI * 2;
  if (difference < -Math.PI) difference += Math.PI * 2;
  return difference;
}
