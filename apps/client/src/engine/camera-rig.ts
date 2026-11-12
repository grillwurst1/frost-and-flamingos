import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { Vector3 } from '@babylonjs/core/Maths/math';
import type { Scene } from '@babylonjs/core/scene';
import type { PhysicsWorld, Vec3, MascotForm, WeaponId } from '@frost-and-flamingos/shared';

const MOUSE_SENSITIVITY = 0.0022;
const MIN_PITCH = -1.15;
const MAX_PITCH = 1.1;
const MIN_DISTANCE = 2.7;
const MAX_DISTANCE = 8.2;
/** Centred follow view: the owner now wants the controlled player on the
 * horizontal centre line, rather than the old 1.9 m painting-style offset. */
const SHOULDER_OFFSET = 0;
// Full-body field framing retains room for the larger field HUD.
const PLAYER_PIVOT_HEIGHT = 1.50;
const PLAYER_DISTANCE = 3.60;
/** Vertical FOV while playing (62 deg); menu, wardrobe and killer cam keep the tele framing. */
const PLAYER_FOV = 1.0821;
const SHOWCASE_FOV = 0.88;

export type PreviewCameraMode = 'menu' | 'wardrobe';

/**
 * Per-body framing. Humans use the centred follow default; the cow sits
 * further back and lower, the coconut slightly higher, both centred.
 */
export interface CameraProfile {
  pivotHeight: number;
  distance: number;
  shoulder: number;
  fov?: number;
  /** Look just ahead of the body while viewing from its side. Aim remains independent. */
  focusAhead?: number;
  /** Hip-fired snow aims from the real eyes, independently of its side view. */
  aimFromEyes?: boolean;
}

export const HUMAN_CAMERA: CameraProfile = { pivotHeight: PLAYER_PIVOT_HEIGHT, distance: PLAYER_DISTANCE, shoulder: SHOULDER_OFFSET };
/** Video shoulder framing keeps the cannon/stream clear of the hero's back.
 * Field play, mascots and vehicles retain their centred profiles. */
export const REFERENCE_HUMAN_CAMERA: CameraProfile = { ...HUMAN_CAMERA, pivotHeight: 1.65, distance:3.15, shoulder:2.1, focusAhead:.8, fov:.85 };
// Wider optics keep the entire real spread reticle inside 16:10 windows.
// Move closer as well so the hero keeps a large video silhouette.
export const REFERENCE_SNOW_CAMERA:CameraProfile={...REFERENCE_HUMAN_CAMERA,distance:1.2,shoulder:3.0,focusAhead:1.2,fov:1.10,aimFromEyes:true};
export const COW_CAMERA: CameraProfile = { pivotHeight: 1.55, distance: 6.6, shoulder: 0 };
export const COCONUT_CAMERA: CameraProfile = { pivotHeight: 2.05, distance: 5.6, shoulder: 0 };
/** Vehicles: centred, higher and further back (pivot above the vehicle base). */
export const TANK_CAMERA: CameraProfile = { pivotHeight: 3.7, distance: 10.5, shoulder: 0 };
export const BOAT_CAMERA: CameraProfile = { pivotHeight: 2.7, distance: 8.4, shoulder: 0 };
export const SIDECAR_CAMERA: CameraProfile = { pivotHeight: 2.3, distance: 6.8, shoulder: 0 };
export const AIRCRAFT_CAMERA: CameraProfile = { pivotHeight: 2.8, distance: 11.5, shoulder: 0 };
export const CABLE_CAR_CAMERA: CameraProfile = { pivotHeight: 2.0, distance: 8.5, shoulder: 0 };

/** Pure selection: importing camera configuration must not register actors/VFX. */
export function cameraProfileFor(form:MascotForm|null,reference=false,weapon?:WeaponId|null):CameraProfile {
  return form==='cow'?COW_CAMERA:form==='coconut'?COCONUT_CAMERA:reference?(weapon==='snow_cannon'?REFERENCE_SNOW_CAMERA:REFERENCE_HUMAN_CAMERA):HUMAN_CAMERA;
}

/** Mouse idle time before the camera starts easing behind a steered body. */
const FOLLOW_IDLE_SECONDS = 1.1;

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
 * Spring-loaded centred follow camera with terrain-aware collision.
 * Input yaw is authoritative for movement; the camera itself is smoothed.
 */
export class CameraRig {
  readonly camera: FreeCamera;
  readonly aimScreen={x:50,y:50};
  private readonly aimPoint=new Vector3();
  private readonly physicalAimPoint=new Vector3();
  private readonly projectedAim=new Vector3();
  private readonly forwardAxis=new Vector3(0,0,1);
  private readonly pivotSpring: SpringState = {
    value: new Vector3(0, 0, 0),
    velocity: new Vector3(0, 0, 0),
  };
  private readonly positionSpring: SpringState = {
    value: new Vector3(0, 0, 0),
    velocity: new Vector3(0, 0, 0),
  };
  private readonly followPivot = new Vector3();
  private yaw = 0;
  private pitch = -0.08;
  private targetYaw = 0;
  private targetPitch = -0.08;
  private distance = PLAYER_DISTANCE;
  private targetDistance = PLAYER_DISTANCE;
  private shoulderSide = 1;
  private collisionDistance = PLAYER_DISTANCE;
  private menuAngle = 0.6;
  private previewCameraAngle = 0.6;
  private initialized = false;
  private killerAngle = 0;
  private killerInitialized = false;
  private profile: CameraProfile = HUMAN_CAMERA;
  private lastMouseAt = 0;
  private wobble = 0;
  private wobbleTime = 0;
  /** A collider the occlusion ray passes through (the hull of the ridden vehicle). */
  private ignoredCollider: number | undefined = undefined;
  constructor(scene: Scene) {
    this.camera = new FreeCamera('player-camera', new Vector3(0, 40, -80), scene);
    this.camera.minZ = 0.12;
    this.camera.maxZ = 5000;
    this.camera.fov = SHOWCASE_FOV;
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

  /** The weapon ray, independent of the reference camera's side-looking frame. */
  getAimDirectionToRef(out:Vector3):Vector3 {
    if(this.profile.focusAhead===undefined){this.camera.getDirectionToRef(this.forwardAxis,out);return out;}
    const cos=Math.cos(this.pitch);
    return out.set(Math.sin(this.yaw)*cos,Math.sin(this.pitch),Math.cos(this.yaw)*cos);
  }
  get aimsFromEyes():boolean{return this.profile.aimFromEyes===true;}
  get aimTarget():Vector3{return this.aimPoint;}
  setPhysicalAimTarget(origin:Vec3,direction:Vec3,distance:number):void {
    this.physicalAimPoint.set(origin.x+direction.x*distance,origin.y+direction.y*distance,origin.z+direction.z*distance);
    if(this.aimsFromEyes){this.aimPoint.copyFrom(this.physicalAimPoint);this.projectAim();}
  }
  private projectAim():void {
    this.camera.getViewMatrix();this.camera.getProjectionMatrix();
    Vector3.TransformCoordinatesToRef(this.aimPoint,this.camera.getTransformationMatrix(),this.projectedAim);
    this.aimScreen.x=(this.projectedAim.x*.5+.5)*100;this.aimScreen.y=(.5-this.projectedAim.y*.5)*100;
  }

  /** Orbit angle of the menu/wardrobe preview camera around the podium. */
  get previewAngle(): number {
    return this.previewCameraAngle;
  }

  handleMouse(deltaX: number, deltaY: number): void {
    if (deltaX !== 0 || deltaY !== 0) this.lastMouseAt = performance.now();
    this.targetYaw += deltaX * MOUSE_SENSITIVITY;
    this.targetPitch = Math.max(MIN_PITCH, Math.min(MAX_PITCH, this.targetPitch - deltaY * MOUSE_SENSITIVITY));
  }

  swapShoulder(): void {
    this.shoulderSide *= -1;
  }

  zoom(delta: number): void {
    this.targetDistance = Math.max(this.profile.aimFromEyes?this.profile.distance:MIN_DISTANCE, Math.min(MAX_DISTANCE, this.targetDistance + delta * 0.0022));
  }

  /** Switches the framing (human / cow / coconut); the distance eases over. */
  setProfile(profile: CameraProfile): void {
    if (this.profile === profile) return;
    this.profile = profile;
    this.targetDistance = profile.distance;
  }

  /**
   * Vehicle-style follow: while the mouse rests, ease the look yaw behind a
   * body that steers its own heading (the cow). Mouse look always wins.
   */
  followHeading(dt: number, heading: number, speed: number): void {
    if (speed < 2.5) return;
    if ((performance.now() - this.lastMouseAt) / 1000 < FOLLOW_IDLE_SECONDS) return;
    const strength = Math.min(1, (speed - 2.5) / 6) * 1.6;
    this.targetYaw += shortestAngle(this.targetYaw, heading) * (1 - Math.exp(-dt * strength));
  }

  /** Occlusion ignores this collider (null: none), e.g. the own vehicle hull. */
  setIgnoredCollider(handle: number | null): void {
    this.ignoredCollider = handle ?? undefined;
  }

  /** Dazed wobble amount 0–1 (cowbell clang). */
  setWobble(amount: number): void {
    this.wobble = Math.max(0, Math.min(1, amount));
  }

  resetAngles(yaw: number, pitch = -0.08): void {
    this.yaw = yaw;
    this.targetYaw = yaw;
    this.pitch = pitch;
    this.targetPitch = pitch;
    this.targetDistance = this.profile.distance;
    this.distance = this.profile.distance;
    this.collisionDistance = this.profile.distance;
    this.initialized = false;
  }

  /** Eases the vertical field of view towards `target` (radians). */
  private easeFov(target: number, dt: number, rate = 6): void {
    const fov = this.camera.fov;
    this.camera.fov = Math.abs(target - fov) < 0.0005 ? target : fov + (target - fov) * (1 - Math.exp(-dt * rate));
  }

  updatePlayer(dt: number, feet: Vector3, physics: PhysicsWorld): void {
    const clampedDt = Math.min(0.05, Math.max(0.001, dt));
    this.easeFov(this.profile.fov ?? PLAYER_FOV, clampedDt);
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
    let shoulder = this.profile.shoulder * this.shoulderSide;
    if(this.profile.aimFromEyes)shoulder*=Math.cos(this.pitch);
    // Keep the aim lane inside the view when zooming or a rear wall pushes
    // the side camera forward. The normal field/vehicle profiles are centred.
    if(this.profile.focusAhead!==undefined)shoulder*=Math.min(1,Math.min(this.distance,this.collisionDistance)/this.profile.distance);
    if (shoulder !== 0) {
      const side = Math.sign(shoulder);
      const hit = physics.raycast(
        { x: feet.x, y: feet.y + this.profile.pivotHeight, z: feet.z },
        { x: right.x * side, y: 0, z: right.z * side },
        Math.abs(shoulder) + 0.25, this.ignoredCollider,
      );
      if (hit) shoulder = side * Math.min(Math.abs(shoulder), Math.max(0, hit.distance - 0.25));
    }
    const pivot = new Vector3(
      feet.x + right.x * shoulder,
      feet.y + this.profile.pivotHeight,
      feet.z + right.z * shoulder,
    );
    const desiredCamera = pivot.subtract(forward.scale(this.distance));

    if (!this.initialized) {
      this.pivotSpring.value.copyFrom(pivot);
      this.positionSpring.value.copyFrom(desiredCamera);
      this.pivotSpring.velocity.setAll(0);
      this.positionSpring.velocity.setAll(0);
      this.followPivot.copyFrom(pivot);
      this.initialized = true;
    } else {
      // Carry the camera with the controlled body. Integrating only 50 ms of
      // spring time after a long frame left moving cabins metres off-screen.
      // Springs still ease orbit, zoom and obstruction changes.
      const movement = pivot.subtract(this.followPivot);
      this.pivotSpring.value.addInPlace(movement);
      this.positionSpring.value.addInPlace(movement);
      this.followPivot.copyFrom(pivot);
    }

    springStep(this.pivotSpring, pivot, 190, 27, clampedDt);

    const direction = desiredCamera.subtract(this.pivotSpring.value);
    const rayLength = direction.length();
    let allowedDistance = this.distance;
    if (rayLength > 0.001) {
      const normalized = direction.scale(1 / rayLength);
      const hit = physics.raycast(this.pivotSpring.value, normalized, rayLength + 0.4, this.ignoredCollider);
      if (hit) {
        allowedDistance = Math.max(this.profile.aimFromEyes?.35:1.05, hit.distance - 0.35);
      }
    }
    const collisionAlpha = 1 - Math.exp(-clampedDt * (allowedDistance < this.collisionDistance ? 24 : 7));
    this.collisionDistance += (allowedDistance - this.collisionDistance) * collisionAlpha;

    const collisionAdjusted = this.pivotSpring.value.add(forward.scale(-this.collisionDistance));
    springStep(this.positionSpring, collisionAdjusted, 150, 24, clampedDt);

    this.camera.position.copyFrom(this.positionSpring.value);
    // Look through the actual followed pivot even while the orbit spring
    // catches up with a fast turn; movement must not push the hero sideways.
    const lookAt = this.profile.focusAhead===undefined ? this.pivotSpring.value.add(
      this.pivotSpring.value.subtract(this.camera.position).normalize().scale(24))
      : this.pivotSpring.value.subtract(right.scale(shoulder)).addInPlace(forward.scale(this.profile.focusAhead));
    if (this.wobble > 0) {
      this.wobbleTime += clampedDt;
      lookAt.addInPlace(right.scale(Math.sin(this.wobbleTime * 5.3) * 1.6 * this.wobble));
      lookAt.y += Math.sin(this.wobbleTime * 3.7) * 0.9 * this.wobble;
    }
    this.camera.setTarget(lookAt);
    if (this.wobble > 0) this.camera.rotation.z = Math.sin(this.wobbleTime * 4.1) * 0.09 * this.wobble;
    if(this.profile.focusAhead!==undefined) {
      if(this.profile.aimFromEyes)this.aimPoint.copyFrom(this.physicalAimPoint);
      else this.getAimDirectionToRef(this.aimPoint).scaleInPlace(30).addInPlace(this.camera.position);
      this.projectAim();
    }else {this.aimScreen.x=50;this.aimScreen.y=50;}
  }

  /** A vehicle passenger's eye socket; mouse look remains independent of the hull. */
  updatePassengerEyes(dt: number, eyes: Vec3): void {
    this.aimScreen.x=50;this.aimScreen.y=50;
    const step = Math.min(0.05, Math.max(0.001, dt));
    this.easeFov(this.profile.fov ?? PLAYER_FOV, step);
    this.yaw += shortestAngle(this.yaw, this.targetYaw) * (1 - Math.exp(-step * 22));
    this.pitch += (this.targetPitch - this.pitch) * (1 - Math.exp(-step * 20));
    this.camera.position.set(eyes.x, eyes.y, eyes.z);
    const cos = Math.cos(this.pitch);
    this.camera.setTarget(new Vector3(eyes.x + Math.sin(this.yaw) * cos, eyes.y + Math.sin(this.pitch), eyes.z + Math.cos(this.yaw) * cos));
    // Returning to the spring camera starts at the new seat, without the old orbit's momentum.
    this.initialized = false;
    this.pivotSpring.velocity.setAll(0);
    this.positionSpring.velocity.setAll(0);
  }

  /**
   * Slow cinematic orbit around the live killer. The spring keeps the camera
   * from snapping when the victim dies or the killer strafes behind cover.
   */
  updateKillerCam(dt: number, target: Vec3, physics: PhysicsWorld): void {
    const clampedDt = Math.min(0.05, Math.max(0.001, dt));
    this.easeFov(SHOWCASE_FOV, clampedDt);
    this.killerAngle += clampedDt * 0.24;
    const radius = 5.2;
    const lookAt = new Vector3(target.x, target.y + 1.18, target.z);
    const desired = new Vector3(
      target.x + Math.sin(this.killerAngle) * radius,
      target.y + 2.45,
      target.z + Math.cos(this.killerAngle) * radius,
    );

    const direction = desired.subtract(lookAt);
    const rayLength = direction.length();
    if (rayLength > 0.001) {
      const normalized = direction.scale(1 / rayLength);
      const hit = physics.raycast(lookAt, normalized, rayLength + 0.35);
      if (hit) {
        const allowed = Math.max(1.8, hit.distance - 0.4);
        desired.copyFrom(lookAt.add(normalized.scale(allowed)));
      }
    }
    desired.y = Math.max(target.y + 0.85, desired.y);

    if (!this.killerInitialized) {
      this.positionSpring.value.copyFrom(desired);
      this.positionSpring.velocity.set(0, 0, 0);
      this.killerInitialized = true;
    }
    springStep(this.positionSpring, desired, 110, 21, clampedDt);
    this.camera.position.copyFrom(this.positionSpring.value);
    this.camera.setTarget(lookAt);
  }

  endKillerCam(): void {
    this.killerInitialized = false;
  }

  /**
   * Slow orbit around the menu/wardrobe podium. The target is deliberately
   * offset so the character sits right of centre on the menu (menu stack on
   * the left) and left of centre in the wardrobe (editor panel on the right).
   * With a `viewAngle` (a direction with a clear background, see
   * glb/wardrobe-stage.ts) the camera only sways around it: ±0.3 rad on the
   * menu, ±0.08 rad in the wardrobe, where the figure turns on its own.
   */
  updatePreview(dt: number, stage: Vec3, mode: PreviewCameraMode, viewAngle?: number): void {
    const clampedDt = Math.min(0.05, Math.max(0.001, dt));
    this.camera.fov = SHOWCASE_FOV;
    this.menuAngle += clampedDt * (mode === 'menu' ? 0.055 : 0.11);
    this.initialized = false;

    const radius = mode === 'menu' ? 6.6 : 4.1;
    const height = mode === 'menu' ? 2.55 : 1.35;
    const targetHeight = mode === 'menu' ? 1.28 : 0.96;
    const sideOffset = mode === 'menu' ? 1.45 : 0.95;
    const angle =
      viewAngle === undefined
        ? this.menuAngle
        : viewAngle + Math.sin(this.menuAngle * (mode === 'menu' ? 0.6 : 0.4)) * (mode === 'menu' ? 0.3 : 0.08);
    this.previewCameraAngle = angle;
    const position = new Vector3(
      stage.x + Math.sin(angle) * radius,
      stage.y + height,
      stage.z + Math.cos(angle) * radius,
    );
    // Camera-forward on the ground plane, then the matching screen-right axis.
    const rightX = -Math.cos(angle);
    const rightZ = Math.sin(angle);
    const side = mode === 'menu' ? -1 : 1;
    const target = new Vector3(
      stage.x + rightX * sideOffset * side,
      stage.y + targetHeight,
      stage.z + rightZ * sideOffset * side,
    );
    this.camera.position.copyFrom(position);
    this.camera.setTarget(target);
  }

  updateMenu(dt: number): void {
    this.camera.fov = SHOWCASE_FOV;
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
    this.camera.fov = this.profile.fov ?? PLAYER_FOV;
    const shoulder = this.profile.shoulder * this.shoulderSide;
    this.pivotSpring.value.set(feet.x + Math.cos(this.yaw) * shoulder,
      feet.y + this.profile.pivotHeight, feet.z - Math.sin(this.yaw) * shoulder);
    this.pivotSpring.velocity.setAll(0);
    this.positionSpring.velocity.setAll(0);
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
