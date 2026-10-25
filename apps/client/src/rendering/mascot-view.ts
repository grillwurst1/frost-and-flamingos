import { Quaternion, Vector3, Vector4 } from '@babylonjs/core/Maths/math';
import { CreateDisc } from '@babylonjs/core/Meshes/Builders/discBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import type { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Constants } from '@babylonjs/core/Engines/constants';
import type { Scene } from '@babylonjs/core/scene';
import {
  COCONUT_TUNING,
  SKILLS,
  mascotFormForFaction,
  sampleMapHeight,
  surfaceTagAt,
  type MascotForm,
  type MascotWireState,
  type PlayerProfile,
  type Vec3,
} from '@frost-and-flamingos/shared';
import { audio } from '../audio/synth';
import type { AvatarPose } from './avatar';
import { CoconutFaceController, FACE, faceAtlas, type FaceCell } from './coconut-expression';
import { applyCowPose, CowAnimator, type CowDrive, type CowSkeleton } from './cow-animator';
import { createShadowMaterial, type CharacterMaterialState } from './materials';
import { buildCoconutRig, buildCoconutShell, buildFibreFringe, COCONUT_RADIUS, LEI_SEGMENTS, type CoconutRig, type ShellStyle } from './mascot-coconut';
import { buildCowRig } from './mascot-cow';
import { puffKindForSurface, type MascotFx } from './mascot-fx';
import { createMascotMaterial, updateMascotMaterial } from './mascot-material';
import { buildMeshyCow, buildMeshyShell, type CowClipLayer, type MeshyShell } from './mascot-meshy';
import { mascotModels } from './mascot-models';
import { clamp, damp, saturate, shortestAngle, Spring } from './mascot-motion';

/**
 * Animated view for the mascot class (cow or coconut). It owns its mascot
 * materials and shadow material (never the shared toon material) and reads
 * the same pose GameClient builds for human players plus the mascot block.
 *
 * Cow: cow-animator.ts drives either the owner's Meshy cow (when its model
 * is in the manifest) or the procedural rig. Coconut: the shell rolls
 * exactly with the ground speed; face + lei + painted expressions sit on an
 * upright layer. Everything here is visual only.
 */

export type MascotReaction = 'score' | 'hurt' | 'impact' | 'kill' | 'cry' | 'clang';

/** Shell used for the coconut when the Meshy file is present: 'meshy' or the painted procedural nut. */
export type CoconutShellChoice = 'meshy' | 'painted' | 'vertex';
const DEFAULT_COCONUT_SHELL: CoconutShellChoice = 'painted';

const HUSK_URL = `${import.meta.env.BASE_URL}art/mascot/coconut-husk.jpg`;
const huskTextures = new WeakMap<Scene, { texture: Texture; failed: boolean; listeners: Set<() => void> }>();

function huskTexture(scene: Scene): { texture: Texture; failed: boolean; listeners: Set<() => void> } {
  let entry = huskTextures.get(scene);
  if (entry) return entry;
  const listeners = new Set<() => void>();
  const created = { texture: null as unknown as Texture, failed: false, listeners };
  created.texture = new Texture(HUSK_URL, scene, {
    invertY: false,
    samplingMode: Constants.TEXTURE_TRILINEAR_SAMPLINGMODE,
    onError: () => {
      created.failed = true;
      for (const listener of listeners) listener();
    },
  });
  created.texture.anisotropicFilteringLevel = 4;
  huskTextures.set(scene, created);
  entry = created;
  return entry;
}

/** Starts loading the mascot textures (face atlas, painted husk) during boot. */
export function preloadMascotTextures(scene: Scene): void {
  faceAtlas(scene);
  if (coconutShellChoice() === 'painted') huskTexture(scene);
}

function queryOverride(name: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return new URLSearchParams(window.location.search).get(name);
  } catch {
    return null;
  }
}

/** Dev/screenshot override of the coconut shell (`?coconutShell=meshy|painted|vertex`). */
export function coconutShellChoice(): CoconutShellChoice {
  const value = queryOverride('coconutShell');
  return value === 'meshy' || value === 'painted' || value === 'vertex' ? value : DEFAULT_COCONUT_SHELL;
}

/** `?mascotModels=off` keeps the procedural mascots (fallback testing). */
function modelsEnabled(): boolean {
  return queryOverride('mascotModels') !== 'off';
}

interface CowBody {
  skeleton: CowSkeleton;
  mesh: Mesh;
  strideLimit: number;
  headHeight: number;
  clip: CowClipLayer | null;
  kind: 'procedural' | 'meshy';
  dispose(): void;
}

const scratchQuat = new Quaternion();
const scratchAxis = new Vector3();
const scratchPoint = { x: 0, y: 0, z: 0 };
const scratchVelocity = { x: 0, y: 0, z: 0 };
const scratchVector = new Vector3();

export class MascotView {
  readonly root: TransformNode;
  readonly form: MascotForm;
  private readonly scene: Scene;
  private readonly name: string;
  private readonly shadow: Mesh;
  private readonly shadowMaterial: StandardMaterial;
  private readonly fx: MascotFx | null;
  private readonly preview: boolean;
  private effects: CharacterMaterialState = { battleDamage: 0, charred: 0, frozen: 0 };
  private disposed = false;
  private readonly materials: ShaderMaterial[] = [];
  /** Vertex-coloured parts: procedural cow, lei, fibres. */
  private readonly partMaterial: ShaderMaterial;

  private heading = 0;
  private time = Math.random() * 10;
  private readonly lastVelocity = new Vector3();
  private readonly velocity = new Vector3();
  private readonly accel = new Vector3();
  private lastHeading = 0;
  private yawRate = 0;
  private wasGrounded = true;
  private wasAlive = true;
  private fallSpeed = 0;
  private puffTimer = 0;
  private lastVitality = 1;
  private lastKills = -1;
  private idleTime = 0;
  private dazedLook = 0;
  private readonly forcedExpression: { cell: FaceCell | null } = { cell: null };

  // Cow --------------------------------------------------------------------------
  private cowAnimator: CowAnimator | null = null;
  private cowBody: CowBody | null = null;
  private pendingModel: (() => void) | null = null;
  private cowFallbackTimer: ReturnType<typeof setTimeout> | null = null;
  private useClipWalk = false;
  private clipPhase = 0;
  private readonly drive: CowDrive = {
    forward: 0,
    lateral: 0,
    vertical: 0,
    forwardAccel: 0,
    lateralAccel: 0,
    yawRate: 0,
    aim: 0,
    grounded: true,
    swimming: false,
    alive: true,
    launched: false,
    dazed: false,
    charging: false,
    stomp: -1,
    skidding: false,
    galloping: false,
    slope: 0,
    vitality: 1,
    preview: false,
  };

  // Coconut ----------------------------------------------------------------------
  private coconut: CoconutRig | null = null;
  private coconutShell: CoconutShellChoice = 'painted';
  private shellMaterial: ShaderMaterial | null = null;
  private meshyShell: MeshyShell | null = null;
  private fibreFringe: Mesh | null = null;
  private readonly faceController = new CoconutFaceController();
  private readonly squash = new Spring(170, 9);
  private readonly wobbleX = new Spring(90, 7);
  private readonly wobbleZ = new Spring(90, 7);
  private readonly faceBob = new Spring(140, 10);
  private readonly lean = new Spring(50, 9);
  private readonly leiBounce: Spring[] = [];
  private readonly leiSway: Spring[] = [];
  private readonly leiOut: Spring[] = [];
  private readonly leiAxes: Vector3[] = [];
  private shake = 0;
  private faceYaw = 0;
  private facePitch = 0;
  private rollAngle = 0;
  private cryTimer = 0;
  private readonly spin = new Vector3();
  private readonly restQuaternion = Quaternion.Identity();
  private readonly normal = new Vector3(0, 1, 0);
  private readonly lastPosition = new Vector3();

  constructor(
    scene: Scene,
    shadowMaterial: StandardMaterial,
    profile: PlayerProfile,
    fx: MascotFx | null,
    preview = false,
  ) {
    this.scene = scene;
    this.shadowMaterial = shadowMaterial;
    this.fx = fx;
    this.preview = preview;
    this.form = mascotFormForFaction(profile.faction);
    this.name = `${this.form}-${profile.displayName}`;
    this.root = new TransformNode(`mascot-${this.form}-root`, scene);
    this.partMaterial = createMascotMaterial(scene, `mascot-${this.name}-parts`);
    this.materials.push(this.partMaterial);
    if (this.form === 'cow') {
      this.cowAnimator = new CowAnimator(0.4);
      this.setupCow();
    } else {
      this.setupCoconut();
    }
    this.shadow = CreateDisc('mascot-shadow', { radius: 0.62, tessellation: 24 }, scene);
    this.shadow.rotation.x = Math.PI / 2;
    this.shadow.position.y = 0.02;
    if (this.form === 'cow') this.shadow.scaling.set(1, 1.75, 1);
    this.shadow.material = shadowMaterial;
    this.shadow.isPickable = false;
    this.shadow.parent = this.root;
  }

  /** Feet-to-head-top height, for overhead markers (dizzy stars). */
  get headHeight(): number {
    return this.form === 'cow' ? this.cowBody?.headHeight ?? 1.75 : COCONUT_RADIUS * 2 + 0.25;
  }

  /** Current gait cadence in cycles per second (dev probes / strips). */
  get gaitCadence(): number {
    return this.cowAnimator?.cadence ?? 0;
  }

  /** Which rig the cow uses right now (for dev probes). */
  get rigKind(): string {
    if (this.form === 'cow') return this.cowBody?.kind ?? 'pending';
    return this.coconutShell;
  }

  // ---------------------------------------------------------------------------
  // Construction
  // ---------------------------------------------------------------------------

  private setupCow(): void {
    const library = mascotModels(this.scene);
    if (!modelsEnabled()) {
      this.attachProceduralCow();
      return;
    }
    library.load('cow');
    const status = library.status('cow');
    if (status === 'ready') {
      this.attachMeshyCow();
      return;
    }
    if (status === 'missing' || status === 'failed') {
      this.attachProceduralCow();
      return;
    }
    // Still loading: wait (no procedural flash) but never longer than a few seconds.
    this.pendingModel = library.whenSettled('cow', () => {
      this.pendingModel = null;
      if (this.disposed) return;
      if (this.cowFallbackTimer) clearTimeout(this.cowFallbackTimer);
      this.cowFallbackTimer = null;
      if (this.cowBody?.kind === 'meshy') return;
      const previous = this.cowBody;
      if (library.status('cow') === 'ready' && this.attachMeshyCow()) previous?.dispose();
      else if (!previous) this.attachProceduralCow();
    });
    this.cowFallbackTimer = setTimeout(() => {
      this.cowFallbackTimer = null;
      if (!this.disposed && !this.cowBody) this.attachProceduralCow();
    }, 6000);
  }

  private attachProceduralCow(): void {
    const built = buildCowRig(this.scene, this.partMaterial, this.root);
    if (!built) return;
    this.cowBody = {
      skeleton: built.skeleton,
      mesh: built.mesh,
      strideLimit: built.strideLimit,
      headHeight: built.headHeight,
      clip: null,
      kind: 'procedural',
      dispose: () => {
        built.skeleton.root.dispose(false, false);
        built.mesh.skeleton?.dispose();
        built.mesh.dispose();
      },
    };
    this.cowAnimator = new CowAnimator(built.strideLimit);
    this.cowAnimator.lyingDrop = built.skeleton.lyingHeight - built.skeleton.visualRestY;
  }

  private attachMeshyCow(): boolean {
    const asset = mascotModels(this.scene).asset('cow');
    if (!asset) return false;
    const built = buildMeshyCow(this.scene, asset, this.root, this.name);
    if (!built) return false;
    this.materials.push(built.material);
    this.cowBody = {
      skeleton: built.skeleton,
      mesh: built.mesh,
      strideLimit: built.strideLimit,
      headHeight: built.headHeight,
      clip: built.clip,
      kind: 'meshy',
      dispose: () => {
        const index = this.materials.indexOf(built.material);
        if (index >= 0) this.materials.splice(index, 1);
        built.dispose();
      },
    };
    this.cowAnimator = new CowAnimator(built.strideLimit);
    this.cowAnimator.lyingDrop = built.skeleton.lyingHeight - built.skeleton.visualRestY;
    return true;
  }

  private setupCoconut(): void {
    this.coconutShell = coconutShellChoice();
    const style: ShellStyle = this.coconutShell === 'vertex' ? 'vertex' : 'painted';
    const husk = style === 'painted' ? huskTexture(this.scene) : null;
    this.shellMaterial =
      husk && !husk.failed
        ? createMascotMaterial(this.scene, `mascot-${this.name}-husk`, {
            albedo: husk.texture,
            vertexTint: true,
            paint: new Vector4(0, 1.08, 1.1, 0.12),
          })
        : this.partMaterial;
    if (this.shellMaterial !== this.partMaterial) this.materials.push(this.shellMaterial);
    const rig = buildCoconutRig(this.scene, this.shellMaterial, this.partMaterial, this.root, husk && !husk.failed ? 'painted' : 'vertex');
    this.coconut = rig;
    for (const material of rig.decal.materials) this.materials.push(material);
    for (let segment = 0; segment < LEI_SEGMENTS; segment += 1) {
      const stiffness = 150 * (1 + 0.18 * Math.sin(segment * 2.1));
      this.leiBounce.push(new Spring(stiffness, 6.5));
      this.leiSway.push(new Spring(stiffness * 0.8, 6));
      this.leiOut.push(new Spring(stiffness * 1.2, 8));
      const direction = rig.leiDirections[segment] ?? new Vector3(0, 0, 1);
      // Tangent axis: rotating about it slides the segment's flowers up/down the shell.
      this.leiAxes.push(new Vector3(direction.z, 0, -direction.x));
    }
    if (husk && !husk.failed) {
      husk.listeners.add(() => this.huskFailed());
    }
    if (this.coconutShell === 'meshy' && modelsEnabled()) {
      const library = mascotModels(this.scene);
      library.load('coconut');
      this.pendingModel = library.whenSettled('coconut', () => {
        this.pendingModel = null;
        if (!this.disposed && library.status('coconut') === 'ready') this.attachMeshyShell();
      });
    }
  }

  private huskFailed(): void {
    const rig = this.coconut;
    if (!rig || this.disposed || this.meshyShell) return;
    rig.shellMesh?.dispose();
    rig.shellMesh = buildCoconutShell(this.scene, this.partMaterial, rig.shell, 'vertex');
  }

  private attachMeshyShell(): void {
    const rig = this.coconut;
    const asset = mascotModels(this.scene).asset('coconut');
    if (!rig || !asset || this.meshyShell) return;
    const shell = buildMeshyShell(this.scene, asset, rig.shell, COCONUT_RADIUS * 1.005, this.name);
    if (!shell) return;
    this.meshyShell = shell;
    this.materials.push(shell.material);
    rig.shellMesh?.setEnabled(false);
    this.fibreFringe = buildFibreFringe(this.scene, this.partMaterial, rig.shell);
  }

  // ---------------------------------------------------------------------------
  // AvatarView
  // ---------------------------------------------------------------------------

  setEffects(partial: Partial<CharacterMaterialState>): void {
    this.effects = { ...this.effects, ...partial };
  }

  setYaw(yaw: number, immediate = false): void {
    this.heading = immediate ? yaw : this.heading + shortestAngle(this.heading, yaw) * 0.24;
    if (this.form === 'cow') this.root.rotation.y = this.heading;
    if (immediate) {
      this.faceYaw = yaw;
      this.lastHeading = yaw;
    }
  }

  setPosition(position: Vec3): void {
    this.root.position.set(position.x, position.y, position.z);
  }

  /** Gameplay feedback that drives expressions and secondary motion. */
  react(reaction: MascotReaction): void {
    if (this.form === 'cow') {
      const animator = this.cowAnimator;
      if (!animator) return;
      if (reaction === 'hurt') animator.react('hurt');
      else if (reaction === 'impact' || reaction === 'score') animator.react('impact', reaction === 'score' ? 1.2 : 0.8);
      else if (reaction === 'clang') animator.react('clang');
      else animator.react('cry');
      return;
    }
    if (reaction === 'hurt') {
      this.faceController.react('hurt');
      this.squash.kick(-3);
      this.shake = Math.max(this.shake, 0.25);
    } else if (reaction === 'score') {
      this.faceController.react('score');
      this.squash.kick(-7);
      this.shake = Math.max(this.shake, 0.38);
    } else if (reaction === 'impact') {
      this.squash.kick(-5);
      this.shake = Math.max(this.shake, 0.3);
    } else if (reaction === 'kill') {
      this.faceController.react('kill');
    } else {
      this.faceController.react('cry');
      this.cryTimer = 0.85;
    }
  }

  /** Dev/screenshot hook: hold one coconut expression (null = gameplay). */
  forceExpression(cell: FaceCell | null): void {
    this.forcedExpression.cell = cell;
    this.faceController.force(cell);
  }

  /** Dev hook: start a blink now. */
  forceBlink(): void {
    this.cowAnimator?.forceBlink();
    this.faceController.forceBlink();
  }

  /** Dev hook: play Meshy's walk clip instead of the procedural walk. */
  setClipWalk(enabled: boolean): void {
    this.useClipWalk = enabled;
  }

  update(deltaSeconds: number, pose: AvatarPose): void {
    if (this.disposed) return;
    const dt = Math.min(0.25, Math.max(0.0001, deltaSeconds));
    this.time += dt;
    this.setPosition(pose.position);
    const mascot = pose.mascot ?? null;
    const targetHeading = mascot?.heading ?? pose.heading ?? pose.yaw;
    this.heading += shortestAngle(this.heading, targetHeading) * (1 - Math.exp(-dt * 16));
    this.velocity.set(pose.velocity.x, pose.velocity.y, pose.velocity.z);
    // Smoothed acceleration: remote velocities change in snapshot steps.
    const ax = (this.velocity.x - this.lastVelocity.x) / dt;
    const ay = (this.velocity.y - this.lastVelocity.y) / dt;
    const az = (this.velocity.z - this.lastVelocity.z) / dt;
    this.accel.set(
      damp(this.accel.x, clamp(ax, -60, 60), 14, dt),
      damp(this.accel.y, clamp(ay, -80, 80), 14, dt),
      damp(this.accel.z, clamp(az, -60, 60), 14, dt),
    );
    this.lastVelocity.copyFrom(this.velocity);
    this.yawRate = damp(this.yawRate, shortestAngle(this.lastHeading, this.heading) / dt, 12, dt);
    this.lastHeading = this.heading;

    // Gameplay-derived reactions: damage taken and kills scored.
    const vitality = pose.vitality ?? 1;
    if (pose.alive && this.wasAlive && vitality < this.lastVitality - 0.004) this.react('hurt');
    this.lastVitality = vitality;
    if (pose.kills !== undefined) {
      if (this.lastKills >= 0 && pose.kills > this.lastKills) this.react('kill');
      this.lastKills = pose.kills;
    }
    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    this.idleTime = pose.grounded && speed < 0.3 && pose.alive ? this.idleTime + dt : 0;

    if (!pose.grounded) this.fallSpeed = Math.max(this.fallSpeed, -this.velocity.y);
    const landed = pose.grounded && !this.wasGrounded;
    if (landed && this.fallSpeed > 6 && this.fx) {
      this.fx.burst(puffKindForSurface(surfaceTagAt(pose.position.x, pose.position.z)), pose.position, 8, 2.6, 0.38);
    }

    if (this.form === 'cow') this.animateCow(dt, pose, mascot);
    else if (this.coconut) this.animateCoconut(this.coconut, dt, pose, mascot, landed);
    if (pose.grounded) this.fallSpeed = 0;
    this.wasGrounded = pose.grounded;
    this.wasAlive = pose.alive;
    this.shadow.setEnabled(pose.alive || this.form === 'coconut');
    this.updateMaterials();
  }

  private readonly previewPose: AvatarPose = {
    position: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    yaw: 0,
    heading: 0,
    grounded: true,
    alive: true,
    mascot: null,
  };

  updatePreview(deltaSeconds: number, spin: number): void {
    const pose = this.previewPose;
    const position = this.root.position;
    pose.position.x = position.x;
    pose.position.y = position.y;
    pose.position.z = position.z;
    pose.yaw = spin;
    pose.heading = spin;
    this.update(deltaSeconds, pose);
    if (this.coconut) {
      // The preview coconut turns on its stand so the fibres show.
      Quaternion.RotationYawPitchRollToRef(spin, 0, 0, this.restQuaternion);
      this.coconut.shell.rotationQuaternion?.copyFrom(this.restQuaternion);
    }
  }

  // ---------------------------------------------------------------------------
  // Cow
  // ---------------------------------------------------------------------------

  private animateCow(dt: number, pose: AvatarPose, mascot: MascotWireState | null): void {
    this.root.rotation.y = this.heading;
    const body = this.cowBody;
    const animator = this.cowAnimator;
    if (!body || !animator) return;
    const sin = Math.sin(this.heading);
    const cos = Math.cos(this.heading);
    const velocity = this.velocity;
    const drive = this.drive;
    drive.forward = velocity.x * sin + velocity.z * cos;
    drive.lateral = velocity.x * cos - velocity.z * sin;
    drive.vertical = velocity.y;
    drive.forwardAccel = this.accel.x * sin + this.accel.z * cos;
    drive.lateralAccel = this.accel.x * cos - this.accel.z * sin;
    drive.yawRate = this.yawRate;
    drive.aim = shortestAngle(this.heading, pose.yaw);
    drive.grounded = pose.grounded;
    drive.swimming = pose.swimming ?? false;
    drive.alive = pose.alive;
    drive.launched = (pose.launchSeconds ?? 0) > 0 && !pose.grounded;
    drive.dazed = pose.dazed ?? false;
    drive.charging = (mascot?.boostSeconds ?? 0) > 0;
    const stomping = (mascot?.actionSeconds ?? 0) > 0;
    drive.stomp = stomping ? saturate(1 - (mascot?.actionSeconds ?? 0) / SKILLS.hoof_stomp.durationSeconds) : -1;
    drive.skidding = mascot?.skidding ?? false;
    drive.galloping = mascot?.galloping ?? false;
    drive.vitality = pose.vitality ?? 1;
    drive.preview = this.preview;
    // Slope under the legs, only when standing on the terrain itself.
    const x = pose.position.x;
    const z = pose.position.z;
    const ground = sampleMapHeight(x, z);
    if (pose.grounded && Math.abs(pose.position.y - ground) < 0.35) {
      const front = sampleMapHeight(x + sin * 0.45, z + cos * 0.45);
      const back = sampleMapHeight(x - sin * 0.45, z - cos * 0.45);
      drive.slope = damp(drive.slope, clamp(front - back, -0.45, 0.45), 10, dt);
    } else {
      drive.slope = damp(drive.slope, 0, 6, dt);
    }
    const cowPose = animator.update(dt, drive);
    applyCowPose(body.skeleton, cowPose);
    if (body.clip && this.useClipWalk) {
      this.clipPhase = (this.clipPhase + dt * animator.cadence * Math.sign(drive.forward || 1)) % 1;
      body.clip.apply(this.clipPhase, animator.walkWeight * saturate(Math.abs(drive.forward) / 0.6));
    }

    // Feedback: bell clank, topple thud, hoof dust.
    const fx = this.fx;
    if (fx && animator.bellClank > 0) audio.playCowbell(pose.position, 0.25 + animator.bellClank * 0.5);
    if (fx && animator.thud > 0) {
      audio.playCowbell(pose.position, 0.85);
      audio.playLand(pose.position);
      fx.burst(puffKindForSurface(surfaceTagAt(x, z)), pose.position, 12, 3.2, 0.45);
    }
    const speed = Math.abs(drive.forward);
    if (fx && animator.footfalls && pose.grounded && !drive.swimming && speed > 3.2) {
      const kind = puffKindForSurface(surfaceTagAt(x, z));
      const big = animator.gallopWeight > 0.5 || drive.charging;
      for (let leg = 0; leg < 4; leg += 1) {
        if (!(animator.footfalls & (1 << leg))) continue;
        const solver = body.skeleton.legs[leg];
        const legPose = cowPose.legs[leg];
        if (!solver || !legPose) continue;
        if (!big && Math.random() < 0.5) continue;
        const lx = solver.restX;
        const lz = solver.restSoleZ + legPose.z;
        scratchPoint.x = x + cos * lx + sin * lz;
        scratchPoint.y = pose.position.y + 0.08;
        scratchPoint.z = z - sin * lx + cos * lz;
        scratchVelocity.x = -velocity.x * 0.12 + (Math.random() - 0.5) * 0.8;
        scratchVelocity.y = 0.7 + Math.random() * 0.5;
        scratchVelocity.z = -velocity.z * 0.12 + (Math.random() - 0.5) * 0.8;
        fx.puff(kind, scratchPoint, scratchVelocity, 0.22 + speed * 0.022 + (drive.charging ? 0.12 : 0), 0.5);
      }
    }
    this.puffTimer -= dt;
    if (fx && pose.grounded && !drive.swimming && drive.skidding && speed > 4 && this.puffTimer <= 0) {
      this.puffTimer = 0.05;
      const side = Math.random() < 0.5 ? -1 : 1;
      scratchPoint.x = x + sin * 0.5 + cos * side * 0.3;
      scratchPoint.y = pose.position.y + 0.1;
      scratchPoint.z = z + cos * 0.5 - sin * side * 0.3;
      scratchVelocity.x = -velocity.x * 0.1;
      scratchVelocity.y = 0.9;
      scratchVelocity.z = -velocity.z * 0.1;
      fx.puff(puffKindForSurface(surfaceTagAt(x, z)), scratchPoint, scratchVelocity, 0.38, 0.55);
    }
    if (fx && drive.stomp < 0 && this.wasStomping) {
      fx.burst(puffKindForSurface(surfaceTagAt(x, z)), pose.position, 14, 4.5, 0.5);
    }
    this.wasStomping = drive.stomp >= 0;
  }

  private wasStomping = false;

  // ---------------------------------------------------------------------------
  // Coconut
  // ---------------------------------------------------------------------------

  private animateCoconut(rig: CoconutRig, dt: number, pose: AvatarPose, mascot: MascotWireState | null, landed: boolean): void {
    const velocity = this.velocity;
    const speed = Math.hypot(velocity.x, velocity.z);
    const swimming = pose.swimming ?? false;
    const pounding = mascot?.pounding ?? false;
    const boosting = (mascot?.boostSeconds ?? 0) > 0;
    const launched = (pose.launchSeconds ?? 0) > 0 && !pose.grounded;
    const grounded = pose.grounded || swimming;
    this.cryTimer = Math.max(0, this.cryTimer - dt);
    this.shake = Math.max(0, this.shake - dt);

    // --- roll: ω = v / r about N × v, slope-aware ------------------------------------
    const x = pose.position.x;
    const z = pose.position.z;
    const terrain = sampleMapHeight(x, z);
    if (grounded && Math.abs(pose.position.y - terrain) < 0.3) {
      const step = 0.6;
      const dx = sampleMapHeight(x + step, z) - sampleMapHeight(x - step, z);
      const dz = sampleMapHeight(x, z + step) - sampleMapHeight(x, z - step);
      this.normal.set(-dx, step * 2, -dz).normalize();
    } else {
      this.normal.set(0, 1, 0);
    }
    if (!pose.alive) {
      this.spin.scaleInPlace(Math.max(0, 1 - dt * 3));
    } else if (grounded && speed > 0.05) {
      // Tangential velocity on the ground plane (slopes included).
      const along = velocity.x * this.normal.x + velocity.y * this.normal.y + velocity.z * this.normal.z;
      scratchVector.set(velocity.x - this.normal.x * along, velocity.y - this.normal.y * along, velocity.z - this.normal.z * along);
      const tangential = scratchVector.length();
      Vector3.CrossToRef(this.normal, scratchVector, scratchAxis);
      const length = scratchAxis.length();
      if (length > 1e-5) scratchAxis.scaleInPlace(tangential / COCONUT_RADIUS / length);
      else scratchAxis.set(0, 0, 0);
      this.spin.copyFrom(scratchAxis);
      if (swimming) this.spin.scaleInPlace(0.35);
    } else if (!pose.grounded) {
      // Airborne: keep tumbling, a double jump adds a forward flip.
      if ((mascot?.jumpsUsed ?? 0) >= 2 && this.spin.length() < 9) {
        this.spin.x += Math.cos(this.faceYaw) * dt * 30;
        this.spin.z += -Math.sin(this.faceYaw) * dt * 30;
      }
      this.spin.scaleInPlace(Math.max(0, 1 - dt * 0.6));
    }
    if (pounding) this.spin.scaleInPlace(Math.max(0, 1 - dt * 8));
    const spinRate = this.spin.length();
    const shell = rig.shell.rotationQuaternion ?? (rig.shell.rotationQuaternion = Quaternion.Identity());
    if (spinRate > 0.01) {
      scratchAxis.copyFrom(this.spin).scaleInPlace(1 / spinRate);
      Quaternion.RotationAxisToRef(scratchAxis, spinRate * dt, scratchQuat);
      scratchQuat.multiplyToRef(shell, shell);
      shell.normalize();
      this.rollAngle += spinRate * dt;
    }
    if (speed < 0.6 && pose.grounded && pose.alive) {
      // Settle with the three holes on the crown, facing the same way as the face.
      Quaternion.RotationYawPitchRollToRef(this.faceYaw, 0, 0, this.restQuaternion);
      Quaternion.SlerpToRef(shell, this.restQuaternion, Math.min(1, dt * 2.2), shell);
      this.spin.scaleInPlace(Math.max(0, 1 - dt * 6));
    }

    // --- face layer: turns to the heading, leans into turns, bobs ----------------------
    const headingTarget = mascot?.heading ?? pose.heading ?? pose.yaw;
    const turn = shortestAngle(this.faceYaw, headingTarget);
    const previousYaw = this.faceYaw;
    this.faceYaw += turn * (1 - Math.exp(-dt * (speed > 1 ? 7 : 3)));
    const faceTurnRate = shortestAngle(previousYaw, this.faceYaw) / dt;
    const sin = Math.sin(this.faceYaw);
    const cos = Math.cos(this.faceYaw);
    const lateralAccel = this.accel.x * cos - this.accel.z * sin;
    const forwardAccel = this.accel.x * sin + this.accel.z * cos;
    const forwardLean = !pose.alive
      ? 0.25
      : pounding
        ? 0.32
        : !pose.grounded && !swimming
          ? clamp(-velocity.y * 0.02, -0.25, 0.25)
          : Math.min(0.28, speed * 0.022) + clamp(forwardAccel * 0.006, -0.08, 0.08);
    this.facePitch = damp(this.facePitch, forwardLean, 8, dt);
    const roll = this.lean.step(
      !pose.alive ? 0.5 : clamp(lateralAccel * 0.014 + faceTurnRate * speed * 0.012, -0.3, 0.3),
      dt,
    );
    const swimSway = swimming ? Math.sin(this.time * 2.1) * 0.08 : 0;
    Quaternion.RotationYawPitchRollToRef(this.faceYaw, this.facePitch, roll + swimSway, scratchQuat);
    if (!rig.face.rotationQuaternion) rig.face.rotationQuaternion = new Quaternion();
    rig.face.rotationQuaternion.copyFrom(scratchQuat);
    // Rolling bump: the lumpy nut lifts the upright layer twice per turn.
    const bump = grounded && speed > 0.5 ? Math.abs(Math.sin(this.rollAngle)) * Math.min(1, speed / 6) * 0.025 : 0;
    rig.face.position.y = this.faceBob.step(bump, dt, -this.accel.y * 0.02);

    // --- squash & stretch: anticipation, stretch in the air, landing overshoot ----------
    const tookOff = !pose.grounded && this.wasGrounded && velocity.y > 2 && pose.alive;
    if (tookOff) this.squash.kick(-5.5);
    if (landed && pose.alive) this.squash.kick(-Math.min(7, 1.2 + this.fallSpeed * 0.4));
    const stretchTarget = pounding ? 0.2 : !pose.grounded && !swimming ? clamp(velocity.y * 0.013, -0.04, 0.14) : 0;
    const squash = clamp(this.squash.step(stretchTarget, dt), -0.4, 0.35);
    const squashY = 1 + squash;
    const squashXZ = 1 / Math.sqrt(Math.max(0.4, squashY));
    rig.visual.scaling.set(squashXZ, squashY, squashXZ);
    const bob = swimming ? Math.sin(this.time * 2.3) * 0.05 : 0;
    const shakeAmount = this.shake > 0 ? this.shake * 0.12 : 0;
    rig.visual.position.set(
      Math.sin(this.time * 61) * shakeAmount,
      COCONUT_RADIUS * squashY + bob - (pose.alive ? 0 : 0.05),
      Math.cos(this.time * 53) * shakeAmount,
    );

    // --- jelly wobble along the direction of sudden acceleration -------------------------
    const wx = this.wobbleX.step(0, dt, -this.accel.x * 0.012);
    const wz = this.wobbleZ.step(0, dt, -this.accel.z * 0.012);
    const amount = Math.min(0.13, Math.hypot(wx, wz));
    const direction = Math.atan2(wx, wz);
    rig.wobbleYaw.rotation.y = direction;
    rig.wobbleScale.scaling.set(1 - amount * 0.5, 1 - amount * 0.25, 1 + amount);
    rig.wobbleUnyaw.rotation.y = -direction;

    // --- lei: spring-driven segments (lag, bounce, sway) --------------------------------
    for (let segment = 0; segment < LEI_SEGMENTS; segment += 1) {
      const node = rig.leiSegments[segment];
      const along = rig.leiDirections[segment];
      const axis = this.leiAxes[segment];
      const bounceSpring = this.leiBounce[segment];
      const swaySpring = this.leiSway[segment];
      const outSpring = this.leiOut[segment];
      if (!node || !along || !axis || !bounceSpring || !swaySpring || !outSpring) continue;
      // Acceleration in the face frame (the lei turns with the face).
      const radial = forwardAccel * along.z + lateralAccel * along.x;
      const tangent = forwardAccel * along.x * -1 + lateralAccel * along.z;
      const buzz = grounded && speed > 1 ? Math.sin(this.time * 17 + segment * 1.3) * speed * 0.35 : 0;
      const bounce = clamp(bounceSpring.step(0, dt, this.accel.y * 0.05 + buzz), -0.22, 0.22);
      const sway = clamp(swaySpring.step(0, dt, -tangent * 0.03 - faceTurnRate * 0.6), -0.25, 0.25);
      const out = clamp(outSpring.step(0, dt, -radial * 0.025), 0, 0.4);
      Quaternion.RotationAxisToRef(axis, bounce, scratchQuat);
      if (!node.rotationQuaternion) node.rotationQuaternion = new Quaternion();
      Quaternion.RotationYawPitchRollToRef(sway, 0, 0, node.rotationQuaternion);
      scratchQuat.multiplyToRef(node.rotationQuaternion, node.rotationQuaternion);
      node.scaling.setAll(1 + out * 0.08);
    }

    // --- expression -------------------------------------------------------------------
    const cell = this.faceController.update(dt, {
      alive: pose.alive,
      dazed: (pose.dazed ?? false) || launched,
      battleCry: boosting || pounding || this.cryTimer > 0,
      ramming: speed > COCONUT_TUNING.maxRollSpeed * 0.7 && grounded,
      airborne: !pose.grounded && !swimming,
      vitality: pose.vitality ?? 1,
      idle: this.idleTime,
      preview: this.preview,
    });
    const relative = Math.atan2(velocity.x, velocity.z) - this.faceYaw;
    this.dazedLook = speed > 0.5 ? -Math.sin(relative) * Math.min(1, speed / 6) : Math.sin(this.time * 0.5) * 0.3;
    rig.decal.show(cell, this.faceController.changed && cell !== FACE.blink, this.dazedLook, clamp(velocity.y / 10, -1, 1), dt);

    // --- sand/dust trail scaled with speed, splashes ------------------------------------
    this.puffTimer -= dt;
    const fx = this.fx;
    if (fx && this.puffTimer <= 0 && pose.alive) {
      if (swimming && speed > 1) {
        this.puffTimer = 0.12;
        scratchPoint.x = x;
        scratchPoint.y = pose.position.y + 0.55;
        scratchPoint.z = z;
        scratchVelocity.x = (Math.random() - 0.5) * 1.5;
        scratchVelocity.y = 1.4;
        scratchVelocity.z = (Math.random() - 0.5) * 1.5;
        fx.puff('splash', scratchPoint, scratchVelocity, 0.3, 0.5);
      } else if (pose.grounded && speed > 2.5) {
        this.puffTimer = clamp(0.16 - speed * 0.009, 0.03, 0.12) * (boosting ? 0.6 : 1);
        const kind = puffKindForSurface(surfaceTagAt(x, z));
        const count = speed > 8 ? 2 : 1;
        for (let index = 0; index < count; index += 1) {
          const side = (index === 0 ? -1 : 1) * 0.22;
          scratchPoint.x = x - (velocity.x / speed) * 0.5 + (velocity.z / speed) * side + (Math.random() - 0.5) * 0.25;
          scratchPoint.y = pose.position.y + 0.1;
          scratchPoint.z = z - (velocity.z / speed) * 0.5 - (velocity.x / speed) * side + (Math.random() - 0.5) * 0.25;
          scratchVelocity.x = -velocity.x * 0.1;
          scratchVelocity.y = 0.6 + Math.random() * 0.5 + speed * 0.03;
          scratchVelocity.z = -velocity.z * 0.1;
          fx.puff(kind, scratchPoint, scratchVelocity, 0.16 + speed * 0.026 + (boosting ? 0.15 : 0), 0.45 + speed * 0.012);
        }
      }
    }
    if (fx && cell === FACE.pain && this.shake > 0.2) {
      // Crumbs of husk when squashed.
      fx.burst('dirt', pose.position, 5, 2.2, 0.14);
      this.shake = 0.2;
    }
    this.lastPosition.set(x, pose.position.y, z);
  }

  private updateMaterials(): void {
    const camera = this.scene.activeCamera;
    if (!camera) return;
    const time = performance.now() / 1000;
    for (const material of this.materials) updateMascotMaterial(material, camera.position, time, this.effects);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.pendingModel?.();
    if (this.cowFallbackTimer) clearTimeout(this.cowFallbackTimer);
    this.cowBody?.dispose();
    this.coconut?.decal.dispose();
    this.meshyShell?.dispose();
    this.fibreFringe?.dispose();
    this.root.dispose(false, false);
    for (const material of this.materials) material.dispose();
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
    this.primary = new MascotView(scene, shadowMaterial, profile, null, true);
    const other = profile.faction === 'alpine' ? 'lagoon' : 'alpine';
    this.secondary = new MascotView(
      scene,
      createShadowMaterial(scene, `mascot-preview-shadow-${other}`),
      { ...profile, faction: other },
      null,
      true,
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
    this.primary.setPosition(this.stage);
    scratchPoint.x = this.stage.x + sideX;
    scratchPoint.y = this.stage.y;
    scratchPoint.z = this.stage.z + sideZ;
    this.secondary.setPosition(scratchPoint);
    this.primary.updatePreview(deltaSeconds, spin);
    this.secondary.updatePreview(deltaSeconds, spin + 0.6);
  }

  dispose(): void {
    this.primary.dispose();
    this.secondary.dispose();
    this.root.dispose(false, false);
  }
}
