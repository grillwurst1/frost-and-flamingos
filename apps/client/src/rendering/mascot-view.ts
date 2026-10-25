import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math';
import { CreateDisc } from '@babylonjs/core/Meshes/Builders/discBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import type { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { Scene } from '@babylonjs/core/scene';
import {
  SKILLS,
  mascotFormForFaction,
  surfaceTagAt,
  type MascotForm,
  type MascotWireState,
  type PlayerProfile,
  type Vec3,
} from '@frost-and-flamingos/shared';
import type { AvatarPose } from './avatar';
import type { CoconutExpression } from './coconut-face';
import {
  createCharacterMaterial,
  createShadowMaterial,
  updateCharacterMaterial,
  type CharacterMaterialState,
} from './materials';
import { buildCoconutRig, COCONUT_RADIUS, type CoconutRig } from './mascot-coconut';
import { buildCowRig, COW_BODY_CENTER_Y, type CowRig } from './mascot-cow';
import { puffKindForSurface, type MascotFx } from './mascot-fx';

/**
 * Animated view for the mascot class (cow or coconut). It owns its character
 * material and shadow material (never the shared toon material), and reads
 * the same pose GameClient builds for human players plus the mascot block.
 */

function approach(current: number, target: number, amount: number): number {
  if (Math.abs(target - current) <= amount) return target;
  return current + Math.sign(target - current) * amount;
}

function shortestAngle(from: number, to: number): number {
  let difference = (to - from) % (Math.PI * 2);
  if (difference > Math.PI) difference -= Math.PI * 2;
  if (difference < -Math.PI) difference += Math.PI * 2;
  return difference;
}

function damp(current: number, target: number, rate: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

/** Critically-damped-ish spring used for all the secondary motion. */
class Spring {
  value = 0;
  velocity = 0;

  constructor(
    private readonly stiffness: number,
    private readonly damping: number,
  ) {}

  step(target: number, dt: number, impulse = 0): number {
    this.velocity += impulse;
    this.velocity += ((target - this.value) * this.stiffness - this.velocity * this.damping) * dt;
    this.value += this.velocity * dt;
    return this.value;
  }
}

export type MascotReaction = 'score' | 'hurt' | 'impact';

const TAU = Math.PI * 2;

export class MascotView {
  readonly root: TransformNode;
  readonly material: ShaderMaterial;
  readonly form: MascotForm;
  private readonly scene: Scene;
  private readonly shadow: Mesh;
  private readonly shadowMaterial: StandardMaterial;
  private readonly fx: MascotFx | null;
  private readonly cow: CowRig | null;
  private readonly coconut: CoconutRig | null;
  private effects: CharacterMaterialState = { battleDamage: 0, charred: 0, frozen: 0 };
  private disposed = false;

  private heading = 0;
  private time = Math.random() * 10;
  private gait = 0;
  private lastVelocity = new Vector3();
  private lastHeading = 0;
  private wasGrounded = true;
  private wasAlive = true;
  private fallSpeed = 0;
  private puffTimer = 0;
  private blinkTimer = 2 + Math.random() * 3;
  private blink = 0;
  private flip = 0;
  private stompActive = false;
  private slam = 0;
  private happyTimer = 0;
  private squashTimer = 0;
  private angryTimer = 0;
  private readonly squash = new Spring(160, 11);
  private readonly bellX = new Spring(55, 3.2);
  private readonly bellZ = new Spring(55, 3.2);
  private readonly earSpring = new Spring(90, 7);
  private readonly tailX = new Spring(26, 3.4);
  private readonly tailZ = new Spring(26, 3);
  private readonly tailLowerX = new Spring(40, 4.5);
  private readonly lean = new Spring(40, 8);
  private faceYaw = 0;
  private facePitch = 0;
  private readonly spin = new Vector3();
  private readonly restQuaternion = Quaternion.Identity();

  constructor(scene: Scene, shadowMaterial: StandardMaterial, profile: PlayerProfile, fx: MascotFx | null) {
    this.scene = scene;
    this.shadowMaterial = shadowMaterial;
    this.fx = fx;
    this.form = mascotFormForFaction(profile.faction);
    this.material = createCharacterMaterial(scene, `mascot-${this.form}-${profile.displayName}`, '#ffffff');
    this.root = new TransformNode(`mascot-${this.form}-root`, scene);
    if (this.form === 'cow') {
      this.cow = buildCowRig(scene, this.material, this.root);
      this.coconut = null;
    } else {
      this.coconut = buildCoconutRig(scene, this.material, this.root);
      this.cow = null;
    }
    this.shadow = CreateDisc('mascot-shadow', { radius: this.form === 'cow' ? 0.62 : 0.62, tessellation: 24 }, scene);
    this.shadow.rotation.x = Math.PI / 2;
    this.shadow.position.y = 0.02;
    if (this.form === 'cow') this.shadow.scaling.set(1, 1.75, 1);
    this.shadow.material = shadowMaterial;
    this.shadow.isPickable = false;
    this.shadow.parent = this.root;
  }

  /** Feet-to-head-top height, for overhead markers (dizzy stars). */
  get headHeight(): number {
    return this.form === 'cow' ? 1.75 : COCONUT_RADIUS * 2 + 0.25;
  }

  setEffects(partial: Partial<CharacterMaterialState>): void {
    this.effects = { ...this.effects, ...partial };
  }

  setYaw(yaw: number, immediate = false): void {
    this.heading = immediate ? yaw : this.heading + shortestAngle(this.heading, yaw) * 0.24;
    if (this.cow) this.root.rotation.y = this.heading;
    if (immediate) {
      this.faceYaw = yaw;
      this.lastHeading = yaw;
    }
  }

  setPosition(position: Vec3): void {
    this.root.position.set(position.x, position.y, position.z);
  }

  /** Gameplay feedback that drives expressions (ram hit, damage, shockwave). */
  react(reaction: MascotReaction): void {
    if (reaction === 'score') this.happyTimer = 1.4;
    else if (reaction === 'hurt') this.squashTimer = Math.max(this.squashTimer, 0.45);
    else this.angryTimer = 0.8;
    if (reaction === 'hurt' && this.coconut) this.squash.velocity -= 2.4;
  }

  update(deltaSeconds: number, pose: AvatarPose): void {
    if (this.disposed) return;
    const dt = Math.min(0.05, Math.max(0.0001, deltaSeconds));
    this.time += dt;
    this.setPosition(pose.position);
    const mascot = pose.mascot ?? null;
    const targetHeading = mascot?.heading ?? pose.heading ?? pose.yaw;
    this.heading += shortestAngle(this.heading, targetHeading) * (1 - Math.exp(-dt * 16));
    const velocity = new Vector3(pose.velocity.x, pose.velocity.y, pose.velocity.z);
    const acceleration = velocity.subtract(this.lastVelocity).scale(1 / dt);
    this.lastVelocity.copyFrom(velocity);
    const yawRate = shortestAngle(this.lastHeading, this.heading) / dt;
    this.lastHeading = this.heading;
    this.happyTimer = Math.max(0, this.happyTimer - dt);
    this.squashTimer = Math.max(0, this.squashTimer - dt);
    this.angryTimer = Math.max(0, this.angryTimer - dt);
    this.updateBlink(dt);

    const landed = pose.grounded && !this.wasGrounded;
    if (!pose.grounded) this.fallSpeed = Math.max(this.fallSpeed, -velocity.y);
    if (landed) {
      const impact = this.fallSpeed;
      this.squash.velocity -= Math.min(5, impact * 0.32);
      if (impact > 9) this.squashTimer = Math.max(this.squashTimer, 0.35);
      if (impact > 6 && this.fx) {
        this.fx.burst(puffKindForSurface(surfaceTagAt(pose.position.x, pose.position.z)), pose.position, 8, 2.6, 0.38);
      }
    }
    if (pose.grounded) this.fallSpeed = 0;
    this.wasGrounded = pose.grounded;

    if (this.cow) this.animateCow(this.cow, dt, pose, mascot, velocity, acceleration, yawRate);
    else if (this.coconut) this.animateCoconut(this.coconut, dt, pose, mascot, velocity);
    this.wasAlive = pose.alive;
    this.shadow.setEnabled(pose.alive || this.form === 'coconut');
    this.updateMaterial();
  }

  updatePreview(deltaSeconds: number, spin: number): void {
    const position = this.root.position;
    this.update(deltaSeconds, {
      position: { x: position.x, y: position.y, z: position.z },
      velocity: { x: 0, y: 0, z: 0 },
      yaw: spin,
      heading: spin,
      grounded: true,
      alive: true,
      mascot: null,
    });
    if (this.coconut) {
      // The preview coconut turns on its stand so the fibres show.
      this.coconut.shell.rotationQuaternion = Quaternion.RotationYawPitchRoll(spin, 0, 0);
    }
  }

  private updateBlink(dt: number): void {
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) {
      this.blink = 0.14;
      this.blinkTimer = 2.2 + Math.random() * 3.4;
    }
    this.blink = Math.max(0, this.blink - dt);
  }

  // ---------------------------------------------------------------------------
  // Cow
  // ---------------------------------------------------------------------------

  private animateCow(
    rig: CowRig,
    dt: number,
    pose: AvatarPose,
    mascot: MascotWireState | null,
    velocity: Vector3,
    acceleration: Vector3,
    yawRate: number,
  ): void {
    this.root.rotation.y = this.heading;
    const sin = Math.sin(this.heading);
    const cos = Math.cos(this.heading);
    const forward = velocity.x * sin + velocity.z * cos;
    const lateral = velocity.x * cos - velocity.z * sin;
    const forwardAccel = acceleration.x * sin + acceleration.z * cos;
    const lateralAccel = acceleration.x * cos - acceleration.z * sin;
    const speed = Math.hypot(velocity.x, velocity.z);
    const boosting = (mascot?.boostSeconds ?? 0) > 0;
    const stomping = (mascot?.actionSeconds ?? 0) > 0;
    const galloping = (mascot?.galloping ?? false) || boosting || speed > 8.4;
    const skidding = mascot?.skidding ?? false;
    const launched = (pose.launchSeconds ?? 0) > 0 && !pose.grounded;
    const swimming = pose.swimming ?? false;
    const angry = boosting || stomping || this.angryTimer > 0 || skidding;
    const worried = (pose.dazed ?? false) || launched;

    // Hoof stomp slam: the wind-up just finished.
    if (this.stompActive && !stomping) this.slam = 0.3;
    this.stompActive = stomping;
    this.slam = Math.max(0, this.slam - dt);

    // --- whole-body pose ---------------------------------------------------------
    const squash = this.squash.step(0, dt);
    let pitch = 0;
    let lift = 0;
    let roll = this.lean.step(Math.max(-0.22, Math.min(0.22, -lateral * 0.035 - yawRate * speed * 0.012)), dt);
    if (!pose.alive) {
      this.flip = approach(this.flip, Math.PI, dt * 5);
      rig.visual.rotation.set(0, 0, this.flip);
      rig.visual.position.y = damp(rig.visual.position.y, 0.6, 6, dt);
      this.poseCowDead(rig, dt);
      return;
    }
    if (!this.wasAlive) {
      this.flip = 0;
      rig.visual.rotation.z = 0;
    }
    if (launched) {
      // Knocked flying: tumble and flail.
      this.flip += dt * 9;
      roll = this.flip;
    } else if (this.flip !== 0) {
      this.flip = 0;
    }
    if (stomping) {
      const windup = 1 - (mascot?.actionSeconds ?? 0) / SKILLS.hoof_stomp.durationSeconds;
      const eased = Math.sin(Math.min(1, windup * 1.2) * Math.PI * 0.5);
      pitch = -0.55 * eased;
      lift = Math.sin(-pitch) * 0.5;
    } else if (this.slam > 0) {
      pitch = 0.08 * (this.slam / 0.3);
    }

    // Gait phase: trot and gallop cycles driven by ground speed.
    const moving = pose.grounded && speed > 0.25;
    const cycle = galloping ? 2.7 : 1.45;
    if (moving || swimming) {
      this.gait += (Math.max(speed, swimming ? 1.6 : 0) / cycle) * dt * Math.sign(forward || 1);
    }
    const phase = this.gait * TAU;
    if (galloping && moving) {
      pitch += Math.sin(phase) * 0.09;
      lift += Math.abs(Math.sin(phase)) * 0.06;
    } else if (moving) {
      lift += Math.abs(Math.sin(phase * 2)) * 0.025 * Math.min(1, speed / 4);
    }
    const breathe = Math.sin(this.time * 1.9) * 0.012;
    rig.visual.position.y = COW_BODY_CENTER_Y + lift + (swimming ? -0.05 + Math.sin(this.time * 2.4) * 0.03 : 0);
    rig.visual.rotation.x = damp(rig.visual.rotation.x, pitch + (boosting ? 0.06 : 0), 14, dt);
    rig.visual.rotation.z = launched ? roll : damp(rig.visual.rotation.z, roll, 12, dt);
    rig.body.scaling.set(1 - squash * 0.2, 1 + squash * 0.35 + breathe, 1 - squash * 0.12);

    // --- legs -----------------------------------------------------------------------
    const offsets = galloping ? [0.55, 0.68, 0.02, 0.14] : [0, 0.5, 0.5, 0];
    const amplitude = galloping ? 0.78 : Math.min(0.55, speed * 0.1 + (swimming ? 0.35 : 0));
    for (let index = 0; index < 4; index += 1) {
      const hip = rig.hips[index];
      const knee = rig.knees[index];
      if (!hip || !knee) continue;
      const front = index < 2;
      let hipAngle = 0;
      let kneeAngle = 0;
      if (launched) {
        hipAngle = Math.sin(this.time * 22 + index * 1.7) * 0.7;
        kneeAngle = 0.6 + Math.sin(this.time * 19 + index) * 0.4;
      } else if (stomping && front) {
        hipAngle = -1.1;
        kneeAngle = 1.3;
      } else if (stomping) {
        hipAngle = 0.35;
        kneeAngle = 0.2;
      } else if (!pose.grounded && !swimming) {
        hipAngle = front ? -0.5 : 0.55;
        kneeAngle = 0.7;
      } else if (moving || swimming) {
        const legPhase = phase + (offsets[index] ?? 0) * TAU;
        hipAngle = Math.sin(legPhase) * amplitude;
        kneeAngle = Math.max(0, -Math.cos(legPhase)) * amplitude * (swimming ? 1.5 : 1.3);
        if (skidding) hipAngle = front ? -0.45 : 0.25;
      }
      hip.rotation.x = damp(hip.rotation.x, hipAngle, 26, dt);
      knee.rotation.x = damp(knee.rotation.x, kneeAngle, 26, dt);
      hip.rotation.z = damp(hip.rotation.z, skidding ? (index % 2 === 0 ? -0.12 : 0.12) : 0, 10, dt);
    }

    // --- neck, head and face ----------------------------------------------------------
    const charge = boosting ? 0.5 : 0;
    const gallopNod = galloping && moving ? Math.sin(phase * 2) * 0.07 : 0;
    const trotNod = !galloping && moving ? Math.sin(phase * 2) * 0.04 : 0;
    const swimLift = swimming ? -0.38 : 0;
    const rear = stomping ? -0.35 : 0;
    const idleLook = speed < 0.3 ? Math.sin(this.time * 0.4) * 0.25 : 0;
    rig.neck.rotation.x = damp(rig.neck.rotation.x, 0.1 + charge + gallopNod + trotNod + swimLift + rear, 10, dt);
    rig.neck.rotation.y = damp(rig.neck.rotation.y, Math.max(-0.35, Math.min(0.35, yawRate * 0.14)) + idleLook, 6, dt);
    rig.head.rotation.z = damp(rig.head.rotation.z, (pose.dazed ? Math.sin(this.time * 5) * 0.25 : 0) - roll * 0.4, 8, dt);

    const browAngle = angry ? 0.42 : worried ? -0.32 : 0.06;
    const browDrop = angry ? -0.02 : worried ? 0.02 : 0;
    for (const [brow, side] of [
      [rig.browLeft, -1],
      [rig.browRight, 1],
    ] as const) {
      brow.rotation.z = damp(brow.rotation.z, side * browAngle, 14, dt);
      brow.position.y = damp(brow.position.y, 0.245 + browDrop, 14, dt);
    }
    const eyeOpen = this.blink > 0 ? 0.12 : angry ? 0.78 : worried ? 1.15 : 1;
    for (const [eye, side] of [
      [rig.eyeLeft, -1],
      [rig.eyeRight, 1],
    ] as const) {
      eye.scaling.y = damp(eye.scaling.y, eyeOpen, 30, dt);
      eye.rotation.y = damp(eye.rotation.y, Math.max(-0.4, Math.min(0.4, yawRate * 0.2)) + side * 0.02, 10, dt);
      eye.rotation.z = pose.dazed ? Math.sin(this.time * 9 + side) * 0.3 : 0;
    }

    // --- secondary motion: ears, bell, tail ---------------------------------------------
    const bounce = moving ? Math.cos(phase * 2) * (galloping ? 9 : 4) : 0;
    const ear = this.earSpring.step(0, dt, (bounce - acceleration.y * 0.02) * dt);
    const earFlick = Math.max(0, Math.sin(this.time * 0.7) - 0.96) * 6;
    rig.earLeft.rotation.z = -(-0.45 + ear * 0.6 - earFlick * 0.3 + (galloping ? -0.25 : 0));
    rig.earRight.rotation.z = -0.45 + ear * 0.6 + (galloping ? -0.25 : 0);
    rig.earLeft.rotation.x = galloping ? 0.35 : 0;
    rig.earRight.rotation.x = galloping ? 0.35 : 0;

    const bellX = this.bellX.step(-rig.neck.rotation.x * 0.6, dt, (forwardAccel * 0.05 + bounce * 0.12) * dt);
    const bellZ = this.bellZ.step(0, dt, (-lateralAccel * 0.05 - yawRate * 0.4) * dt);
    rig.bell.rotation.x = Math.max(-1.1, Math.min(1.1, bellX));
    rig.bell.rotation.z = Math.max(-0.9, Math.min(0.9, bellZ));

    const tailStream = Math.min(1.2, speed * 0.1 + (launched ? 0.8 : 0));
    const swish = Math.sin(this.time * 1.6) * (speed < 0.5 ? 0.22 : 0.08);
    const tailX = this.tailX.step(0.12 + tailStream, dt, (forwardAccel * 0.04 + bounce * 0.1) * dt);
    const tailZ = this.tailZ.step(swish, dt, (lateralAccel * 0.05 + yawRate * 0.25) * dt);
    rig.tailUpper.rotation.x = tailX;
    rig.tailUpper.rotation.z = tailZ;
    rig.tailLower.rotation.x = this.tailLowerX.step(tailStream * 0.5, dt, -bounce * 0.15 * dt);
    rig.tailLower.rotation.z = tailZ * 0.8;

    // --- dust -----------------------------------------------------------------------------
    this.puffTimer -= dt;
    if (this.fx && pose.grounded && !swimming && this.puffTimer <= 0 && (galloping || skidding || boosting) && speed > 5) {
      this.puffTimer = skidding ? 0.05 : 0.09;
      const kind = puffKindForSurface(surfaceTagAt(pose.position.x, pose.position.z));
      const side = Math.random() < 0.5 ? -1 : 1;
      const back = skidding ? 0.2 : -0.6;
      this.fx.puff(
        kind,
        {
          x: pose.position.x + sin * back + cos * side * 0.35,
          y: pose.position.y + 0.12,
          z: pose.position.z + cos * back - sin * side * 0.35,
        },
        { x: -velocity.x * 0.12 + (Math.random() - 0.5), y: 0.8 + Math.random() * 0.6, z: -velocity.z * 0.12 + (Math.random() - 0.5) },
        0.32 + Math.random() * 0.22 + (boosting ? 0.12 : 0),
        0.55,
      );
    }
    if (this.slam > 0.28 && this.fx) {
      this.fx.burst(puffKindForSurface(surfaceTagAt(pose.position.x, pose.position.z)), pose.position, 14, 4.5, 0.5);
    }
  }

  private poseCowDead(rig: CowRig, dt: number): void {
    const twitch = Math.sin(this.time * 14) * 0.08;
    for (let index = 0; index < 4; index += 1) {
      const hip = rig.hips[index];
      const knee = rig.knees[index];
      if (!hip || !knee) continue;
      hip.rotation.x = damp(hip.rotation.x, (index < 2 ? -0.15 : 0.15) + twitch * (index % 2 ? 1 : -1), 8, dt);
      knee.rotation.x = damp(knee.rotation.x, 0.1, 8, dt);
    }
    rig.neck.rotation.x = damp(rig.neck.rotation.x, -0.45, 6, dt);
    rig.head.rotation.z = damp(rig.head.rotation.z, 0.4, 6, dt);
    rig.eyeLeft.scaling.y = damp(rig.eyeLeft.scaling.y, 0.15, 10, dt);
    rig.eyeRight.scaling.y = damp(rig.eyeRight.scaling.y, 0.15, 10, dt);
    rig.tailUpper.rotation.x = damp(rig.tailUpper.rotation.x, -0.6, 6, dt);
    rig.bell.rotation.x = damp(rig.bell.rotation.x, 2.2, 4, dt);
  }

  // ---------------------------------------------------------------------------
  // Coconut
  // ---------------------------------------------------------------------------

  private animateCoconut(
    rig: CoconutRig,
    dt: number,
    pose: AvatarPose,
    mascot: MascotWireState | null,
    velocity: Vector3,
  ): void {
    const speed = Math.hypot(velocity.x, velocity.z);
    const swimming = pose.swimming ?? false;
    const pounding = mascot?.pounding ?? false;
    const boosting = (mascot?.boostSeconds ?? 0) > 0;
    const launched = (pose.launchSeconds ?? 0) > 0 && !pose.grounded;

    // Rolling: the shell turns by distance / radius about cross(up, velocity).
    if (!pose.alive) {
      this.spin.scaleInPlace(Math.max(0, 1 - dt * 3));
    } else if ((pose.grounded || swimming) && speed > 0.05) {
      const rate = speed / COCONUT_RADIUS;
      this.spin.set((velocity.z / speed) * rate, 0, (-velocity.x / speed) * rate);
      if (swimming) this.spin.scaleInPlace(0.35);
    } else if (!pose.grounded) {
      // Airborne: keep tumbling, a double jump adds a forward flip.
      if ((mascot?.jumpsUsed ?? 0) >= 2 && this.spin.length() < 9) {
        const fx = Math.sin(this.faceYaw);
        const fz = Math.cos(this.faceYaw);
        this.spin.addInPlace(new Vector3(fz, 0, -fx).scale(dt * 30));
      }
      this.spin.scaleInPlace(Math.max(0, 1 - dt * 0.6));
    }
    if (pounding) this.spin.scaleInPlace(Math.max(0, 1 - dt * 8));
    const spinRate = this.spin.length();
    const shell = rig.shell.rotationQuaternion ?? Quaternion.Identity();
    if (spinRate > 0.01) {
      const step = Quaternion.RotationAxis(this.spin.scale(1 / spinRate), spinRate * dt);
      rig.shell.rotationQuaternion = step.multiply(shell);
    } else {
      rig.shell.rotationQuaternion = shell;
    }
    if (speed < 0.6 && pose.grounded && pose.alive) {
      // Settle with the three holes on the crown, facing the same way as the face.
      Quaternion.RotationYawPitchRollToRef(this.faceYaw, 0, 0, this.restQuaternion);
      Quaternion.SlerpToRef(shell, this.restQuaternion, Math.min(1, dt * 2.2), shell);
      rig.shell.rotationQuaternion = shell;
      this.spin.scaleInPlace(Math.max(0, 1 - dt * 6));
    }

    // Face layer: turns toward the heading and leans into the roll.
    const headingTarget = mascot?.heading ?? pose.heading ?? pose.yaw;
    const turn = shortestAngle(this.faceYaw, headingTarget);
    this.faceYaw += turn * (1 - Math.exp(-dt * (speed > 1 ? 7 : 3)));
    const lean = !pose.alive
      ? 0.25
      : pounding
        ? 0.32
        : !pose.grounded && !swimming
          ? Math.max(-0.25, Math.min(0.25, -velocity.y * 0.02))
          : Math.min(0.28, speed * 0.022);
    this.facePitch = damp(this.facePitch, lean, 8, dt);
    rig.face.rotation.set(this.facePitch, this.faceYaw, !pose.alive ? 0.5 : swimming ? Math.sin(this.time * 2.1) * 0.08 : 0);

    // Squash and stretch: launch stretch, landing squash, slam stretch.
    const target = pounding ? 0.18 : !pose.grounded && velocity.y > 3 ? 0.1 : 0;
    const squash = this.squash.step(target, dt);
    const squashY = 1 + squash * 1.2;
    const squashXZ = 1 - squash * 0.5;
    rig.visual.scaling.set(squashXZ, squashY, squashXZ);
    const bob = swimming ? Math.sin(this.time * 2.3) * 0.05 : 0;
    rig.visual.position.y = COCONUT_RADIUS * squashY + bob - (pose.alive ? 0 : 0.05);

    // Expression.
    let expression: CoconutExpression = 'angry';
    if (!pose.alive) expression = 'ko';
    else if (pose.dazed || launched) expression = 'dizzy';
    else if (this.happyTimer > 0) expression = 'happy';
    else if (this.squashTimer > 0) expression = 'squashed';
    else if (pounding || boosting) expression = 'shout';
    const relative = Math.atan2(velocity.x, velocity.z) - this.faceYaw;
    // Canvas right is the coconut's own left (-X), so a roll toward +X
    // (sin > 0, its right) moves the pupils toward canvas left: hence the sign.
    const lookX = speed > 0.5 ? -Math.sin(relative) * Math.min(1, speed / 6) : Math.sin(this.time * 0.5) * 0.3;
    const lookY = Math.max(-1, Math.min(1, velocity.y / 10));
    rig.painter.draw(this.blink > 0 && expression === 'angry' ? 'squashed' : expression, lookX, lookY);

    // Sand/dust trail and splashes.
    this.puffTimer -= dt;
    if (this.fx && this.puffTimer <= 0 && pose.alive) {
      if (swimming && speed > 1) {
        this.puffTimer = 0.12;
        this.fx.puff('splash', { x: pose.position.x, y: pose.position.y + 0.55, z: pose.position.z }, {
          x: (Math.random() - 0.5) * 1.5,
          y: 1.4,
          z: (Math.random() - 0.5) * 1.5,
        }, 0.3, 0.5);
      } else if (pose.grounded && speed > 5) {
        this.puffTimer = boosting ? 0.04 : 0.07;
        const kind = puffKindForSurface(surfaceTagAt(pose.position.x, pose.position.z));
        this.fx.puff(
          kind,
          {
            x: pose.position.x - (velocity.x / speed) * 0.5 + (Math.random() - 0.5) * 0.4,
            y: pose.position.y + 0.1,
            z: pose.position.z - (velocity.z / speed) * 0.5 + (Math.random() - 0.5) * 0.4,
          },
          { x: -velocity.x * 0.1, y: 0.7 + Math.random() * 0.5, z: -velocity.z * 0.1 },
          0.28 + Math.random() * 0.2 + (boosting ? 0.15 : 0),
          0.5,
        );
      }
      if (this.squashTimer > 0.3 && this.fx) {
        // Crumbs of husk when squashed.
        this.fx.burst('dirt', { x: pose.position.x, y: pose.position.y + 0.3, z: pose.position.z }, 5, 2.2, 0.14);
        this.squashTimer = 0.3;
      }
    }
  }

  private updateMaterial(): void {
    const camera = this.scene.activeCamera;
    if (!camera) return;
    updateCharacterMaterial(this.material, camera.position, performance.now() / 1000, this.effects);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.coconut?.painter.dispose();
    this.root.dispose(false, false);
    this.material.dispose();
    this.shadowMaterial.dispose();
  }
}

/**
 * Wardrobe/menu preview of the mascot class: the form of the player's
 * faction on the podium and the other form beside it, so the class card's
 * "Cow (Alps) / Coconut (Beach)" is visible in 3D.
 */
export class MascotPreviewPair {
  readonly root: TransformNode;
  private readonly scene: Scene;
  private readonly primary: MascotView;
  private readonly secondary: MascotView;
  private readonly stage = new Vector3();

  constructor(scene: Scene, shadowMaterial: StandardMaterial, profile: PlayerProfile) {
    this.scene = scene;
    this.root = new TransformNode('mascot-preview-pair', scene);
    this.primary = new MascotView(scene, shadowMaterial, profile, null);
    const other = profile.faction === 'alpine' ? 'lagoon' : 'alpine';
    this.secondary = new MascotView(
      scene,
      createShadowMaterial(scene, `mascot-preview-shadow-${other}`),
      { ...profile, faction: other },
      null,
    );
    this.primary.root.parent = this.root;
    this.secondary.root.parent = this.root;
    this.secondary.root.scaling.setAll(0.82);
  }

  setEffects(partial: Partial<CharacterMaterialState>): void {
    this.primary.setEffects(partial);
    this.secondary.setEffects(partial);
  }

  setYaw(yaw: number, immediate = false): void {
    this.primary.setYaw(yaw, immediate);
    this.secondary.setYaw(yaw, immediate);
  }

  setPosition(position: Vec3): void {
    this.stage.set(position.x, position.y, position.z);
    this.root.position.set(0, 0, 0);
  }

  update(deltaSeconds: number, pose: AvatarPose): void {
    this.primary.update(deltaSeconds, pose);
  }

  updatePreview(deltaSeconds: number, spin: number): void {
    // Keep the companion beside the podium centre, toward the camera's left.
    const camera = this.scene.activeCamera;
    let sideX = 1.65;
    let sideZ = 0;
    if (camera) {
      const dx = camera.position.x - this.stage.x;
      const dz = camera.position.z - this.stage.z;
      const length = Math.hypot(dx, dz) || 1;
      // Screen-left on the ground plane, nudged back from the camera.
      sideX = (-dz / length) * 1.55 - (dx / length) * 0.5;
      sideZ = (dx / length) * 1.55 - (dz / length) * 0.5;
    }
    this.primary.setPosition({ x: this.stage.x, y: this.stage.y, z: this.stage.z });
    this.secondary.setPosition({ x: this.stage.x + sideX, y: this.stage.y, z: this.stage.z + sideZ });
    this.primary.updatePreview(deltaSeconds, spin);
    this.secondary.updatePreview(deltaSeconds, spin + 0.6);
  }

  dispose(): void {
    this.primary.dispose();
    this.secondary.dispose();
    this.root.dispose(false, false);
  }
}
