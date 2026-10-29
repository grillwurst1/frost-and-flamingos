import '@babylonjs/core/Bones/skeleton';
import { AnimationGroup } from '@babylonjs/core/Animations/animationGroup';
import type { InstantiatedEntries } from '@babylonjs/core/assetContainer';
import { BoundingInfo } from '@babylonjs/core/Culling/boundingInfo';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math';
import { createContactShadow } from './contact-shadow';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import type { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { Scene } from '@babylonjs/core/scene';
import {
  CLASS_STATS,
  SKIN_TONES,
  HAIR_COLORS,
  ParachuteState,
  WEAPON_STATS,
  type PlayerProfile,
  type Vec3,
  type WeaponId,
} from '@frost-and-flamingos/shared';
import type { AvatarPose, AvatarView } from './avatar';
import { CharacterView } from './character';
import { buildModularBody, modularHeadFrame, modularRollBoxes, modularTorsoFrame } from './glb/modular-body';
import { bodySurfaceRecipe } from './glb/body-surfaces';
import { wristHandSurface } from './glb/hand-surface';
import { nativeWardrobeRecipe } from './glb/native-wardrobe';
import { createShadowMaterial, type CharacterMaterialState } from './materials';
import {
  PAINTED_MODELS,
  paintedModelSpec,
  type ClipRole,
  type PaintedModelSpec,
} from './glb/catalog';
import { gaitContactPhase } from './glb/clips';
import {
  BAKE_FPS,
  bindWorldTransform,
  jointName,
  paintedModelLibrary,
  type BakedClip,
  type PaintedModelAsset,
  type TorsoDepth,
} from './glb/library';
import { createGlbMaterial, updateGlbMaterial, type PaintedTextures } from './glb/material';
import { buildCanopyProp, buildWeaponProp, buildWrenchProp, type HoldSpec, type HoldStyle, type WeaponProp } from './glb/props';
import { closestOnSegment, fistTargets, groundLift, headFrame, keepOutZ, segmentReach, supportPoints, type HandSide, type HeadFrame } from './glb/hold';
import { GlbRig, type RigJoint, type HandLocalFrame } from './glb/rig';
import { registerHeroWeaponProps } from './weapons/glb-adapter';

/**
 * Player view for the owner's painted Meshy characters.
 *
 * Same public surface as the procedural {@link CharacterView} (AvatarView):
 * GameClient drives it through `update(delta, pose)`, `updatePreview`,
 * `setEffects`, `setPosition`, `setYaw`, `dispose` and `root`.
 *
 *   root (feet, yaw)            Babylon world space, faces +Z like the rig
 *   ├─ tiltPivot (ground)       death topple / prone swim fallback
 *   │  └─ rollPivot (mid body)  dodge-roll spin
 *   │     └─ modelRoot (scale)  class height / painted model height
 *   │        └─ glTF __root__   handedness flip, then the armature
 *   ├─ canopy pivot             parachute
 *   └─ contact shadow disc
 *
 * Animation: baked clips (see glb/clips.ts and glb/glb-binary.ts) are blended per joint with
 * weights from the movement state (idle/walk/run/sprint/backpedal/air/swim/
 * death, reload and taunt overlays), then procedural layers run in armature
 * space: crouch (hips drop + leg IK), strafe hip twist, aim pitch on the
 * spine, recoil/melee swing, and two-bone arm IK onto the held weapon.
 */
type GlbPose = AvatarPose;

/**
 * Animation roles plus the speed-picked gaits that reuse a model's run cycle:
 * a fast crouch plays it under the procedural crouch, a fast backpedal plays
 * it reversed.
 */
type BindingRole = ClipRole | 'crouchRun' | 'runBack';
type AvatarAsset = { asset: PaintedModelAsset; textures: PaintedTextures | null };

/** Native wardrobe paint is shared per class; incomplete assets retain the full fallback. */
async function loadAvatarModel(scene: Scene, key: string): Promise<AvatarAsset | null> {
  const library = paintedModelLibrary(scene);
  if (PAINTED_MODELS[key]?.cosmetics === false) return library.loadWithTextures(key);
  const asset = await library.load(key);
  return asset ? { asset, textures: asset.wardrobe ? await library.wardrobeTextures(key) : null } : null;
}

const LOOPING: Readonly<Record<BindingRole, boolean>> = {
  crouchRun: true,
  runBack: true,
  idle: true,
  walk: true,
  combatWalk: true,
  run: true,
  sprint: true,
  backpedal: true,
  crouchBack: true,
  air: false,
  swim: true,
  death: false,
  taunt: false,
  reload: true,
  emote: false,
};

/**
 * Fallback ground speed (m/s, model space) at which each loop plays at 1×.
 * Painted models measure it per clip at load (BakedClip.naturalSpeed, the
 * stance-foot speed); these values only cover clips without leg motion.
 */
const NATURAL_SPEED: Partial<Record<BindingRole, number>> = {
  walk: 1.3,
  combatWalk: 0.7,
  run: 3.9,
  sprint: 3.9,
  backpedal: 0.95,
};
/** Highest playback rate of any in-place loop. */
const MAX_LOOP_RATE = 8;
/**
 * Plausible cadence ceilings (steps per second; every cycle is one stride,
 * two steps). Above them the stride lengthens (up to MAX_STRIDE) and the
 * remaining speed difference shows as a little foot slide instead of
 * strobing legs.
 */
const CADENCE_CAP: Readonly<Record<string, number>> = {
  walk: 3.0,
  combatWalk: 3.0,
  backpedal: 3.0,
  crouchRun: 3.3,
  runBack: 3.3,
  run: 3.6,
  sprint: 4.5,
};
/** Longest stride: the leg swing (UpLeg/Leg rotation from bind) scaled up to this factor. */
const MAX_STRIDE = 1.3;

const LOCOMOTION: readonly BindingRole[] = ['walk', 'combatWalk', 'run', 'sprint', 'backpedal', 'crouchRun', 'runBack'];
const OVERLAY_ROLES: readonly BindingRole[] = ['reload', 'taunt', 'emote'];
const STRIDE_JOINTS = ['LeftUpLeg', 'LeftLeg', 'RightUpLeg', 'RightLeg'] as const;
const AXIS_Z = new Vector3(0, 0, 1);
/** Head stare: turn rate (rad/s) and the yaw / pitch the neck and head may cover. */
const STARE_TURN_RATE = 0.9;
const STARE_MAX_YAW = 1.15;
const STARE_MAX_PITCH = 0.45;

/** Step length (model units) of a cycle at 1×: natural speed × duration / 2 steps. */
function stepLength(clip: BakedClip, fallback: number): number {
  return ((clip.naturalSpeed ?? fallback) * clip.duration) / 2;
}

interface ClipBinding {
  role: BindingRole;
  clip: BakedClip;
  /** Instance joint index → clip bone index (-1 = bind pose). */
  map: Int16Array;
  /** Instance joint index → 1 when the overlay mask includes it. */
  upper: Uint8Array;
  time: number;
  weight: number;
  target: number;
  rate: number;
  /** Plays backwards (walk standing in for a backpedal clip). */
  reverse: boolean;
  /** Frozen frame (seconds) instead of advancing, or null. */
  hold: number | null;
  /** Stride lengthening (≥ 1) used while the cadence is capped. */
  stride: number;
}

/** Hold offsets in the aim frame: x = character right, y = up, z = forward. */
const HOLD_OFFSETS: Readonly<Record<HoldStyle, readonly [number, number, number]>> = {
  rifle: [0.0, -0.1, 0.28],
  launcher: [0.15, 0.02, 0.25],
  pistol: [0.03, -0.04, 0.34],
  melee: [0.22, -0.16, 0.24],
  polearm: [0.18, -0.2, 0.18],
  umbrella: [0.2, -0.12, 0.2],
};

/** Shoulder-anchored holds: the most the weapon moves for the support hand. */
const MAX_SUPPORT_PULL = 0.08;
/** Hold state easing (1/s): support slide and reach weight settle in ~0.2 s. */
const HOLD_EASE = 12;
/** Held props keep their lowest point this far above the feet (armature units). */
const GROUND_CLEARANCE = 0.04;
/** The most a short arm pulls a mouth-held horn off the lips (into a beard). */
/** A long fall, not a jump (hops last ~0.66 s): the umbrella may open overhead. */
const FALL_AIR_TIME = 0.9;
const FALL_SPEED = 4;

const AXIS_X = new Vector3(1, 0, 0);
const AXIS_Y = new Vector3(0, 1, 0);

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

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Character-space hold vector (x right, y up, z forward) → armature space (right = -X). */
function toArmature(x: number, y: number, z: number): Vector3 {
  return new Vector3(-x, y, z);
}

/** Bounding points per held prop (weapon space), measured once. */
const propPoints = new WeakMap<WeaponProp, Vector3[]>();

/** The prop mesh and its directly attached parts that show at rest (not the open canopy). */
function propMeshes(prop: WeaponProp): Mesh[] {
  const parts = prop.mesh.getChildMeshes(true).filter((child): child is Mesh => child instanceof Mesh && child.isEnabled(false));
  return [prop.mesh, ...parts];
}

const liveViews = new Set<GlbCharacterView>();
const pendingViews = new Set<{ debugInfo(): Record<string, unknown> }>();
const debugEvents: string[] = [];
let lastLibrary: ReturnType<typeof paintedModelLibrary> | null = null;

function debugEvent(message: string): void {
  if (!import.meta.env.DEV) return;
  debugEvents.push(`${Math.round(performance.now())} ${message}`);
  if (debugEvents.length > 60) debugEvents.shift();
}

function installGlbDebugHandle(): void {
  if (!import.meta.env.DEV || typeof window === 'undefined') return;
  const holder = window as unknown as { __ffGlb?: unknown };
  if (holder.__ffGlb) return;
  holder.__ffGlb = {
    views: () => [...liveViews].map((view) => view.debugInfo()),
    pending: () => [...pendingViews].map((view) => view.debugInfo()),
    events: () => [...debugEvents],
    scene: () => lastLibrary?.sceneRef ?? null,
    /** Shows/hides painted views whose label contains `label` (draw-call probes). */
    setEnabled: (label: string, enabled: boolean) => {
      let count = 0;
      for (const view of liveViews) {
        if (!String(view.debugInfo().view).includes(label)) continue;
        view.root.setEnabled(enabled);
        count += 1;
      }
      return count;
    },
    library: () => {
      const library = lastLibrary;
      if (!library) return null;
      // ready: no requested model is still loading. Per key: status, load
      // time (ms) and whether anything asked for it (models load lazily).
      const result: Record<string, unknown> = { ready: library.idle };
      for (const key of Object.keys(PAINTED_MODELS)) {
        result[key] = [library.status(key), library.timings.get(key) ?? null, library.requested(key)];
      }
      return result;
    },
  };
}

export class GlbCharacterView implements AvatarView {
  readonly root: TransformNode;
  private readonly scene: Scene;
  private readonly asset: PaintedModelAsset;
  private readonly tiltPivot: TransformNode;
  private readonly rollPivot: TransformNode;
  /** Height of the roll pivot above the feet (tucked body centre). */
  private readonly rollCentre: number;
  /** Current roll pivot height and safety lift (both rate-limited). */
  private rollPivotY: number;
  private rollLift = 0;
  /** Armature space → model-root space (static glTF root chain), cached on first roll. */
  private armatureToModel: Matrix | null = null;
  /** Head attachment (headgear/face items), part of the roll clearance. */
  private headAttachment: Mesh | null = null;
  private readonly modelRoot: TransformNode;
  private readonly entries: InstantiatedEntries;
  private readonly armature: TransformNode;
  private readonly bodyMesh: Mesh;
  readonly renderedCosmetics: PlayerProfile['cosmetics'];
  private readonly material: ShaderMaterial;
  private readonly propMaterial: ShaderMaterial;
  private readonly shadow: Mesh;
  private readonly shadowMaterial: StandardMaterial;
  private readonly canopyPivot: TransformNode;
  /** Parachute canopy, built on its first deployment. */
  private canopy: Mesh | null = null;
  private readonly canopyAlpine: boolean;
  private readonly weaponAnchor: TransformNode;
  private readonly rig: GlbRig;
  private readonly joints: TransformNode[] = [];
  private readonly jointIndex = new Map<string, number>();
  private readonly bindRotations: Float32Array;
  private readonly bindHips: Vector3;
  private readonly accumulator: Float32Array;
  private readonly hipsAccumulator = new Vector3();
  private readonly bindings = new Map<BindingRole, ClipBinding>();
  private readonly weapons = new Map<WeaponId | 'wrench', WeaponProp | null>();
  private readonly attachments: Mesh[] = [];
  private readonly height: number;
  /** false for unarmed characters: weapons are never shown. */
  private readonly armedModel: boolean;
  private readonly scale: number;
  private readonly shoulderHalf: number;
  /** Bind-pose shoulder midpoint in Spine2's frame (shoulder-anchored holds). */
  private readonly shoulderLocal: Vector3 | null;
  /** Bind-pose chest front surface point in Spine2's frame (hero holds stay in front of it). */
  private readonly frontLocal: Vector3 | null;
  private readonly torso: TorsoDepth | null;
  /** Bind-pose right arm length (shoulder → elbow → wrist). */
  private readonly armLength: number;
  private readonly supportPullLimit: number;
  private readonly bulk: number;
  private weapon: WeaponProp | null = null;
  /** Rear end (weapon-space z) of the held prop, kept in front of the chest. */
  private weaponRear = 0;
  private weaponId: WeaponId | 'wrench' | null = null;
  private riding: AvatarPose['riding'] = undefined;
  /** Head centre and mouth in the Head joint's frame (alphorn mouthpiece, umbrella clearance). */
  private readonly head: HeadFrame | null;
  /** Finger joints and their fist rotations: the hands close on what they hold. */
  private readonly fists: Readonly<Record<HandSide, ReadonlyArray<{ node: TransformNode; fist: Quaternion; trigger: boolean }>>>;
  /** Weapon-space points bounding the held prop (ground rule), and scratch space. */
  private weaponPoints: Vector3[] = [];
  private readonly liftScratch: Vector3[] = [];
  /** Support hand: eased slide along the foregrip (0..1) and IK weight. */
  private supportSlide = 0;
  private supportReach = 1;
  private supportShoulder = 0;
  private mouthShoulder = 0;
  private readonly wristHands: Partial<Record<HandSide, HandLocalFrame>> = {};
  /** The next hold frame snaps the eased hold state (just equipped). */
  private holdSnap = true;
  private holdDt = 0;
  /** True once driven by updatePreview (wardrobe / menu turntable). */
  private previewing = false;
  private effects: CharacterMaterialState = { battleDamage: 0, charred: 0, frozen: 0 };
  private yaw = 0;
  private disposed = false;
  // Movement state.
  private airTime = 0;
  private deathTime = 0;
  private rollPhase = 0;
  /** Forward curl of the dodge-roll tuck (0..1). */
  private rollTuck = 0;
  /** Air clip active last frame (its rising edge rewinds to just before the apex). */
  private airActive = false;
  /** The painted headgear sub-mesh was dropped for another headgear item. */
  private hatHidden = false;
  private crouch = 0;
  private twist = 0;
  private pitch = 0;
  private remotePitch = 0;
  private remotePitchTimer = 0;
  private recoil = 0;
  private swing = -1;
  private tauntTime = -1;
  private breath = Math.random() * 10;
  private parachute = 0;
  private swim = 0;
  private armed = 0;
  private aliveBlend = 1;
  /** See {@link snapToPose}. */
  private snapNext = false;
  private deathTilt = 0;
  private locoPhase = Math.random();
  /** Walk-only characters (spec.gait): idle/walk/backpedal blending only. */
  private readonly gait: PaintedModelSpec['gait'] | null;
  private readonly nativeWardrobe: boolean;
  private readonly sharedWardrobeHead: boolean;
  private readonly sharedWardrobeBody: boolean;
  private readonly hover: PaintedModelSpec['hover'] | null;
  private hoverPhase = Math.random() * Math.PI * 2;
  private emoteTime = -1;
  private stareYaw = 0;
  private starePitch = 0;
  private stareTarget: Vector3 | null = null;
  private dither = 0;

  constructor(
    scene: Scene,
    shadowMaterial: StandardMaterial,
    profile: PlayerProfile,
    asset: PaintedModelAsset,
    textures: PaintedTextures | null,
  ) {
    registerHeroWeaponProps();
    this.scene = scene;
    this.renderedCosmetics = { ...profile.cosmetics };
    this.asset = asset;
    this.shadowMaterial = shadowMaterial;
    const spec = asset.spec;
    const classHeight = (CLASS_STATS as Partial<Record<string, { height: number }>>)[profile.cosmetics.classId]?.height;
    this.height = spec.heightMeters ?? classHeight ?? asset.height;
    this.armedModel = spec.armed !== false;
    this.scale = this.height / asset.height;
    this.bulk = spec.bulk;
    this.torso = asset.torso;
    const leftArm = asset.bindPositions.get('LeftArm');
    const rightArm = asset.bindPositions.get('RightArm');
    this.shoulderHalf = leftArm && rightArm ? Math.max(0.1, Math.abs(leftArm.x - rightArm.x) / 2) : 0.2;
    const spine2 = bindWorldTransform(asset, 'Spine2');
    this.shoulderLocal =
      spine2 && leftArm && rightArm
        ? leftArm.add(rightArm).scaleInPlace(0.5).subtractInPlace(spine2.position).rotateByQuaternionToRef(Quaternion.Inverse(spine2.rotation), new Vector3())
        : null;
    this.frontLocal =
      spine2 && asset.torso
        ? new Vector3(0, 0, asset.torso.front - asset.torso.chestZ).rotateByQuaternionToRef(Quaternion.Inverse(spine2.rotation), new Vector3())
        : null;
    const rightElbow = asset.bindPositions.get('RightForeArm');
    const rightWrist = asset.bindPositions.get('RightHand');
    this.armLength =
      rightArm && rightElbow && rightWrist ? Vector3.Distance(rightArm, rightElbow) + Vector3.Distance(rightElbow, rightWrist) : 0.43;
    this.supportPullLimit = MAX_SUPPORT_PULL + Math.min(.06, Math.max(0, this.shoulderHalf * 2 - this.armLength) * .6);

    this.root = new TransformNode('glb-character-root', scene);
    this.tiltPivot = new TransformNode('glb-tilt-pivot', scene);
    this.tiltPivot.parent = this.root;
    this.rollPivot = new TransformNode('glb-roll-pivot', scene);
    this.rollPivot.parent = this.tiltPivot;
    // Roll pivot at the tucked body centre, so the curled figure stays above the ground.
    const rollCentre = 0.36 * this.height;
    this.rollCentre = rollCentre;
    this.rollPivotY = rollCentre;
    this.rollPivot.position.y = rollCentre;
    this.modelRoot = new TransformNode('glb-model-root', scene);
    this.modelRoot.parent = this.rollPivot;
    this.modelRoot.position.y = -rollCentre;
    this.modelRoot.scaling.setAll(this.scale);

    this.gait = spec.gait ?? null;
    this.hover = spec.hover ?? null;
    // The photoreal exception shades PBR instead of the cel bands. It keeps
    // the character look mask (no interior ink, only the bold silhouette)
    // and stays in the g-buffer like every character: the painterly post
    // has no out-of-band exemption yet (see shaders/post.ts).
    this.nativeWardrobe = spec.cosmetics !== false && Boolean(asset.wardrobe && textures?.wardrobeMask);
    // Use the same closed anatomy for every outfit, including the default
    // beard/hat. Fused donor faces otherwise restore painted, oversized eyes
    // and change the head shape when a single wardrobe item is removed.
    this.sharedWardrobeHead = this.nativeWardrobe && Boolean(asset.wardrobeHead && textures?.head);
    const bodySurfaces = bodySurfaceRecipe(profile, asset);
    this.sharedWardrobeBody = this.nativeWardrobe && Boolean(asset.wardrobeBody
      && (asset.wardrobeBody.solidAnatomy || (asset.wardrobeHead && textures?.head))) && bodySurfaces.arms;
    this.material = createGlbMaterial(
      scene,
      `glb-${spec.key}-${profile.displayName}`,
      spec.cosmetics === false || this.nativeWardrobe ? textures : null,
      spec.cosmetics === false ? (spec.photoreal ? { photoreal: true } : {}) : { soft: true, skin: SKIN_TONES[profile.cosmetics.skinToneIndex] ?? SKIN_TONES[0],
        wardrobe: this.nativeWardrobe && asset.wardrobe ? {
          hair: HAIR_COLORS[profile.cosmetics.hairColorIndex] ?? HAIR_COLORS[0],
          skinReference: asset.wardrobe.skinReference, hairReference: asset.wardrobe.hairReference,
          head: (this.sharedWardrobeHead || this.sharedWardrobeBody) && asset.wardrobeHead ? { skinReference: asset.wardrobeHead.skinReference, hairReference: asset.wardrobeHead.hairReference } : undefined,
          greenVest: profile.cosmetics.torso === 'torso_tracht_shirt' && nativeWardrobeRecipe(profile, asset).torso,
          torso: [Math.abs(leftArm?.x ?? .2), asset.bindPositions.get('Hips')?.y ?? .85, (asset.bindPositions.get('Neck')?.y ?? 1.25) + .10, asset.bindPositions.get('Spine2')?.z ?? 0],
        } : undefined },
    );
    this.propMaterial = createGlbMaterial(scene, `glb-props-${profile.displayName}`, null);

    this.entries = asset.container.instantiateModelsToScene((name) => name, false, {
      doNotInstantiate: true,
      predicate: (entity: unknown) => !(entity instanceof AnimationGroup),
    });
    const gltfRoot = this.entries.rootNodes[0] as TransformNode | undefined;
    if (!gltfRoot) throw new Error('Painted model has no root node.');
    gltfRoot.parent = this.modelRoot;
    const mesh = gltfRoot.getChildMeshes(false).find((candidate): candidate is Mesh => candidate instanceof Mesh && candidate.skeleton !== null);
    if (!mesh) throw new Error('Painted model has no skinned mesh.');
    this.bodyMesh = mesh;
    mesh.material = this.material;
    mesh.isPickable = false;
    // Skinned bounds are never refreshed, so the body culls against a static
    // box: the bind box grown by the ~1 m a death clip travels on the ground
    // plus the roll/tilt pivots.
    const bindBox = mesh.getBoundingInfo();
    mesh.setBoundingInfo(
      new BoundingInfo(bindBox.minimum.subtract(new Vector3(1.2, 0.2, 1.2)), bindBox.maximum.add(new Vector3(1.2, 0.5, 1.2))),
    );
    for (const child of gltfRoot.getChildMeshes(false)) child.isPickable = false;

    // Joint nodes by normalised Mixamo name, in parent-first order.
    const nodes = new Map<string, TransformNode>();
    for (const node of gltfRoot.getChildTransformNodes(false)) {
      const name = jointName(node.name);
      if (asset.jointParents.has(name) && !nodes.has(name)) nodes.set(name, node);
    }
    const depth = (name: string): number => {
      let count = 0;
      for (let parent = asset.jointParents.get(name) ?? null; parent; parent = asset.jointParents.get(parent) ?? null) count += 1;
      return count;
    };
    const ordered = [...nodes.keys()].sort((a, b) => depth(a) - depth(b));
    this.bindRotations = new Float32Array(ordered.length * 4);
    ordered.forEach((name, index) => {
      const node = nodes.get(name);
      if (!node) return;
      const bind = asset.bindPose.get(name);
      if (bind) {
        node.position.copyFrom(bind.position);
        node.scaling.copyFrom(bind.scaling);
        node.rotationQuaternion = bind.rotation.clone();
      } else if (!node.rotationQuaternion) {
        node.rotationQuaternion = Quaternion.FromEulerVector(node.rotation);
      }
      const rotation = node.rotationQuaternion ?? Quaternion.Identity();
      this.bindRotations.set([rotation.x, rotation.y, rotation.z, rotation.w], index * 4);
      this.joints.push(node);
      this.jointIndex.set(name, index);
    });
    this.accumulator = new Float32Array(ordered.length * 4);
    this.bindHips = asset.bindPose.get('Hips')?.position.clone() ?? Vector3.Zero();
    const hipsNode = nodes.get('Hips');
    this.armature = (hipsNode?.parent as TransformNode | null) ?? gltfRoot;
    this.rig = new GlbRig(nodes, asset.jointParents);
    for (const side of ['Left', 'Right'] as const) {
      if (!this.rig.has(`${side}HandMiddle1`) || !this.rig.has(`${side}HandThumb1`)) {
        const hand = wristHandSurface(asset, side);
        if (hand) this.wristHands[side] = hand.localFrame;
      }
    }
    if (spec.cosmetics !== false) {
      this.bodyMesh = buildModularBody(scene, profile, asset, mesh, this.material, this.nativeWardrobe, this.sharedWardrobeHead, this.sharedWardrobeBody);
      this.torso = modularTorsoFrame(this.bodyMesh) ?? asset.torso;
      this.frontLocal = spine2 && this.torso
        ? new Vector3(0, 0, this.torso.front - this.torso.chestZ).rotateByQuaternionToRef(Quaternion.Inverse(spine2.rotation), new Vector3()) : null;
      mesh.isVisible = false;
      const box = this.bodyMesh.getBoundingInfo();
      this.bodyMesh.setBoundingInfo(new BoundingInfo(box.minimum.subtract(new Vector3(1.2, 0.2, 1.2)), box.maximum.add(new Vector3(1.2, 0.5, 1.2))));
      this.hatHidden = profile.cosmetics.headgear === 'head_none';
    }
    this.head = headFrame(asset, this.bodyMesh, spec.cosmetics === false ? spec.head : modularHeadFrame(profile, asset, this.nativeWardrobe, this.sharedWardrobeHead));
    const fist = (side: HandSide): Array<{ node: TransformNode; fist: Quaternion; trigger: boolean }> =>
      fistTargets(asset, side).flatMap((target) => {
        const node = nodes.get(target.joint);
        return node ? [{ node, fist: target.fist, trigger: target.trigger }] : [];
      });
    this.fists = { Left: fist('Left'), Right: fist('Right') };

    const upperRoots = new Set(['Spine1', 'Spine2']);
    const isUpper = (name: string): boolean => {
      for (let current: string | null = name; current; current = asset.jointParents.get(current) ?? null) {
        if (upperRoots.has(current)) return true;
      }
      return false;
    };
    for (const [role, clip] of asset.clips) this.bind(role, clip, isUpper, ordered);
    // Missing roles borrow a stand-in clip with its own clock.
    const run = asset.clips.get('run');
    const walk = asset.clips.get('walk');
    if (this.gait && !this.bindings.has('idle') && walk && this.gait.idleRate !== undefined) {
      // No idle clip: the walk loop played almost still is a quiet, uncanny stand.
      this.bind('idle', walk, isUpper, ordered);
    }
    if (!this.bindings.has('sprint') && run && !this.gait) this.bind('sprint', run, isUpper, ordered);
    if (!this.bindings.has('combatWalk') && walk && !this.gait) this.bind('combatWalk', walk, isUpper, ordered);
    if (!this.bindings.has('air') && run && !this.gait) {
      this.bind('air', run, isUpper, ordered);
      const air = this.bindings.get('air');
      if (air) air.hold = run.duration * 0.3;
    }
    if (!this.bindings.has('backpedal') && walk) {
      // Reversed walk: its backward heel strike is the forward cycle's most trailing foot.
      this.bind('backpedal', { ...walk, contactPhase: gaitContactPhase(walk, asset, true) }, isUpper, ordered);
      const backpedal = this.bindings.get('backpedal');
      if (backpedal) backpedal.reverse = true;
    }
    if (run) {
      // Speed-picked gaits (see BindingRole).
      this.bind('crouchRun', run, isUpper, ordered);
      this.bind('runBack', { ...run, contactPhase: gaitContactPhase(run, asset, true) }, isUpper, ordered);
      const runBack = this.bindings.get('runBack');
      if (runBack) runBack.reverse = true;
      // Sprint on whichever of the sprint and run cycles takes the longer
      // step, i.e. the lower cadence at sprint speed.
      const sprint = this.bindings.get('sprint');
      if (sprint && sprint.clip !== run && stepLength(run, NATURAL_SPEED.run ?? 3.9) > stepLength(sprint.clip, NATURAL_SPEED.sprint ?? 3.9)) {
        this.bind('sprint', run, isUpper, ordered);
      }
    }

    // The modular body already contains all seven selected wardrobe slots.

    this.weaponAnchor = new TransformNode('glb-weapon-anchor', scene);
    this.weaponAnchor.parent = this.armature;
    this.weaponAnchor.rotationQuaternion = Quaternion.Identity();

    this.shadow = createContactShadow(scene, 'glb-character-shadow', 0.55 * (spec.bulk > 1.1 ? 1.2 : 1));
    this.shadow.rotation.x = Math.PI / 2;
    this.shadow.position.y = 0.02;
    this.shadow.material = shadowMaterial;
    this.shadow.isPickable = false;
    this.shadow.parent = this.root;
    this.shadow.alphaIndex = 0;

    this.canopyPivot = new TransformNode('glb-canopy-pivot', scene);
    this.canopyPivot.parent = this.root;
    this.canopyPivot.position.y = 1.15;
    this.canopyAlpine = profile.faction === 'alpine';
    this.canopyPivot.setEnabled(false);
    liveViews.add(this);
    installGlbDebugHandle();
  }

  /** DEV probe: model, resolved clips (with donors) and current weights. */
  debugInfo(): Record<string, unknown> {
    const clips: Record<string, string> = {};
    const weights: Record<string, number> = {};
    for (const [role, binding] of this.bindings) {
      const clip = binding.clip;
      clips[role] = clip.retargetedFrom && !clip.name.includes('@') ? `${clip.name} (from ${clip.retargetedFrom})` : clip.name;
      if (binding.weight > 0.01) weights[role] = Math.round(binding.weight * 100) / 100;
    }
    return {
      model: this.asset.spec.key,
      renderer: this.asset.spec.cosmetics === false ? 'painted-fixed' : this.nativeWardrobe ? 'native-wardrobe' : 'modular-skinned',
      cosmetics: this.renderedCosmetics,
      geometry: { vertices: this.bodyMesh.getTotalVertices(), triangles: this.bodyMesh.getTotalIndices() / 3 },
      view: this.shadowMaterial.name,
      enabled: this.root.isEnabled(true),
      position: this.root.getAbsolutePosition().asArray().map((value) => Math.round(value * 100) / 100),
      weapon: this.weaponId,
      hatHidden: this.hatHidden,
      drawCalls: this.drawCalls(),
      yaw: Math.round(this.yaw * 1000) / 1000,
      clips,
      weights,
      probe: {
        grip: this.weaponAnchor.position.asArray().map((value) => Math.round(value * 1000) / 1000),
        weaponRot: this.weaponAnchor.rotationQuaternion?.asArray().map((value) => Math.round(value * 1000) / 1000),
        rightHand: this.rig.position('RightHand')?.asArray().map((value) => Math.round(value * 1000) / 1000),
        leftHand: this.rig.position('LeftHand')?.asArray().map((value) => Math.round(value * 1000) / 1000),
        chest: this.rig.position('Spine2')?.asArray().map((value) => Math.round(value * 1000) / 1000),
        armatureParent: this.armature.name,
        armatureRot: this.armature.rotationQuaternion?.asArray().map((value) => Math.round(value * 1000) / 1000),
      },
    };
  }

  private bind(role: BindingRole, clip: BakedClip, isUpper: (name: string) => boolean, ordered: readonly string[]): void {
    const clipIndex = new Map<string, number>();
    clip.bones.forEach((bone, index) => clipIndex.set(bone, index));
    const map = new Int16Array(ordered.length);
    const upper = new Uint8Array(ordered.length);
    ordered.forEach((name, index) => {
      map[index] = clipIndex.get(name) ?? -1;
      upper[index] = isUpper(name) ? 1 : 0;
    });
    this.bindings.set(role, {
      role,
      clip,
      map,
      upper,
      time: Math.random() * clip.duration,
      weight: role === 'idle' ? 1 : 0,
      target: 0,
      rate: 1,
      reverse: false,
      hold: null,
      stride: 1,
    });
  }

  setEffects(partial: Partial<CharacterMaterialState>): void {
    this.effects = { ...this.effects, ...partial };
  }

  setYaw(yaw: number, immediate = false): void {
    this.yaw = immediate ? yaw : this.yaw + shortestAngle(this.yaw, yaw) * 0.24;
    this.root.rotation.y = this.yaw;
  }

  setPosition(position: Vec3): void {
    this.root.position.set(position.x, position.y, position.z);
  }

  /** Fire feedback: recoil for guns, a swing for melee weapons. */
  kick(pitch?: number): void {
    if (pitch !== undefined) {
      this.remotePitch = pitch;
      this.remotePitchTimer = 1.4;
    }
    const style = this.weapon?.hold.style;
    if (style === 'melee' || style === 'polearm' || style === 'umbrella') {
      if (this.swing < 0 || this.swing > 0.6) this.swing = 0;
    } else {
      this.recoil = 1;
    }
    this.weapon?.fire?.();
  }

  /** World position of the held weapon's muzzle socket (shots, tracers), or null. */
  muzzlePosition(): Vector3 | null {
    const muzzle = this.weapon?.muzzle;
    if (!muzzle || !this.weapon?.mesh.isEnabled()) return null;
    muzzle.computeWorldMatrix(true);
    return muzzle.getAbsolutePosition().clone();
  }

  /** Taunt/victory clip (T key); ignored when the model has none. */
  taunt(): void {
    if (this.bindings.has('taunt')) this.tauntTime = 0;
  }

  /** Second idle one-shot (spec clip role `emote`); ignored when the model has none. */
  emote(): void {
    if (this.bindings.has('emote') && this.tauntTime < 0) this.emoteTime = 0;
  }

  /** True while the taunt or emote one-shot plays. */
  get performing(): boolean {
    return this.tauntTime >= 0 || this.emoteTime >= 0;
  }

  updatePreview(deltaSeconds: number, spin: number, weaponId?: WeaponId | null): void {
    this.previewing = true;
    this.setYaw(spin, true);
    this.update(deltaSeconds, {
      position: { x: this.root.position.x, y: this.root.position.y, z: this.root.position.z },
      velocity: { x: 0, y: 0, z: 0 },
      yaw: spin,
      grounded: true,
      alive: true,
      weaponId: weaponId ?? null,
      pitch: 0.05,
    });
  }

  /**
   * The next update jumps every blend straight to its target instead of
   * easing in, for a view that replaces another mid-action (a stand-in swap
   * while swimming, parachuting or dead must not restart the motion).
   */
  snapToPose(): void {
    this.snapNext = true;
  }

  update(deltaSeconds: number, pose: GlbPose): void {
    if (this.disposed) return;
    const dt = Math.min(0.1, Math.max(0, deltaSeconds));
    const snap = this.snapNext ? 1e4 : 1;
    this.snapNext = false;
    this.setPosition(pose.position);
    this.setYaw(pose.yaw);
    this.shadow.setEnabled(!pose.riding);

    const alive = pose.alive;
    const swimming = pose.swimming ?? false;
    const rolling = pose.rolling ?? false;
    const sprinting = pose.sprinting ?? false;
    const crouchTarget = Math.min(1, Math.max(0, pose.crouchBlend ?? (pose.crouched ? 1 : 0)));
    const parachuteTarget = Math.min(
      1,
      Math.max(
        0,
        pose.parachuteBlend ??
          (pose.parachuteState === ParachuteState.Intact || pose.parachuteState === ParachuteState.Tattered ? 1 : 0),
      ),
    );
    this.parachute = approach(this.parachute, parachuteTarget, dt * 3 * snap);
    this.updateCanopy(dt, this.parachute, pose.parachuteSway ?? 0);

    // Local-space velocity: x = right, z = forward (Babylon root space).
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    const forwardSpeed = pose.velocity.x * sin + pose.velocity.z * cos;
    const rightSpeed = pose.velocity.x * cos - pose.velocity.z * sin;
    const speed = Math.hypot(pose.velocity.x, pose.velocity.z) / Math.max(0.5, this.scale);
    const backward = speed > 0.4 && forwardSpeed < -0.35 * Math.hypot(forwardSpeed, rightSpeed);

    this.airTime = pose.grounded || swimming ? 0 : this.airTime + dt;
    const airborne = !pose.grounded && !swimming && (this.airTime > 0.12 || this.parachute > 0.2);
    this.swim = approach(this.swim, swimming ? 1 : 0, dt * 4 * snap);
    this.crouch = approach(this.crouch, rolling ? 1 : crouchTarget, dt * 7 * snap);
    // Alive and death state always ease, even on a swap snap: the server may
    // already have revived a player whose dead snapshot is still current.
    this.aliveBlend = approach(this.aliveBlend, alive ? 1 : 0, dt * 6);
    if (alive) this.deathTime = 0;
    else this.deathTime += dt;

    // ---- clip weights -------------------------------------------------
    const targets: Partial<Record<BindingRole, number>> = {};
    const has = (role: BindingRole): boolean => this.bindings.has(role);
    const gait = this.gait;
    if (gait) {
      // Walk only: she keeps her walk (or her stand) even while drifting down.
      const move = smoothstep(0.2, 0.9, speed);
      if (backward && has('backpedal')) targets.backpedal = move;
      else targets.walk = move;
      targets.idle = 1 - move;
    } else if (!alive) {
      if (has('death')) targets.death = 1;
      else targets.idle = 1;
    } else if (swimming) {
      if (has('swim')) targets.swim = 1;
      else targets.combatWalk = 1;
    } else if (rolling) {
      // Dodge roll: a crouched tuck (curled by the procedural layer), not the jump clip.
      targets.idle = 1;
    } else if (airborne) {
      targets.air = 1;
    } else {
      const move = smoothstep(0.35, 1.6, speed);
      if (backward && has('backpedal')) {
        // Fast backpedal: the run cycle reversed (the backpedal cycle would strobe).
        const fast = has('runBack') ? smoothstep(1.3, 2.0, speed) : 0;
        targets.backpedal = move * (1 - fast);
        targets.runBack = move * fast;
      } else if (this.crouch > 0.5) {
        // Fast crouch: the run cycle under the procedural crouch.
        const fast = has('crouchRun') ? smoothstep(1.2, 1.5, speed) : 0;
        targets.combatWalk = move * (1 - fast);
        targets.crouchRun = move * fast;
      } else if (sprinting) {
        targets.sprint = move;
      } else {
        const run = smoothstep(2.2, 4.4, speed);
        targets.run = move * run;
        targets.walk = move * (1 - run);
      }
      targets.idle = 1 - move;
    }
    const fade = dt * (alive ? 9 : 5);
    for (const binding of this.bindings.values()) {
      if (OVERLAY_ROLES.includes(binding.role)) continue;
      binding.target = targets[binding.role] ?? 0;
      // A swap snap jumps the gait weights, never the death clip (see above).
      binding.weight = approach(binding.weight, binding.target, binding.role === 'death' ? fade : fade * snap);
      const natural = binding.clip.naturalSpeed ?? NATURAL_SPEED[binding.role];
      binding.rate = 1;
      binding.stride = 1;
      if (natural) {
        // Cadence-capped rate; the stride lengthens to cover what the cap leaves.
        const cap = CADENCE_CAP[binding.role];
        const capRate = cap ? (cap * binding.clip.duration) / 2 : MAX_LOOP_RATE;
        binding.rate = Math.min(MAX_LOOP_RATE, capRate, Math.max(0.55, speed / natural));
        binding.stride = Math.min(MAX_STRIDE, Math.max(1, speed / (natural * binding.rate)));
      }
      if (gait) {
        // Rate follows the speed exactly so the feet stay planted.
        binding.stride = 1;
        if (binding.role === 'walk') binding.rate = Math.min(3, Math.max(0.3, speed / gait.walk));
        if (binding.role === 'backpedal') binding.rate = Math.min(3, Math.max(0.3, speed / gait.backpedal));
        if (binding.role === 'idle' && binding.clip === this.bindings.get('walk')?.clip) binding.rate = gait.idleRate ?? 1;
      }
      if (binding.role === 'swim') binding.rate = 0.8 + Math.min(1, speed / 4) * 0.5;
      if (binding.role === 'combatWalk' && swimming && !has('swim')) binding.rate = 0.7;
    }
    const air = this.bindings.get('air');
    if (air && air.hold === null) {
      // A real jump clip: on take-off run quickly into the apex, then hold it
      // while airborne; it stays parked while grounded.
      if (air.target > 0 && !this.airActive) air.time = Math.max(0, air.clip.apexTime - 0.3);
      this.airActive = air.target > 0;
      air.rate = air.target > 0 && air.time < air.clip.apexTime ? 1.6 : 0;
    }
    const death = this.bindings.get('death');
    if (death) {
      death.time = Math.min(death.clip.duration - 1 / BAKE_FPS, this.deathTime * 1.15);
      death.rate = 0;
    }
    // Overlays: reload (upper body) and taunt (full body, standing only).
    const reload = this.bindings.get('reload');
    if (reload) {
      const reloading = Boolean(pose.reloading) && alive && !swimming;
      if (reloading && reload.weight < 0.05) reload.time = 0;
      reload.target = reloading ? 0.85 : 0;
      reload.weight = approach(reload.weight, reload.target, dt * 6);
      const seconds = this.weaponId && this.weaponId !== 'wrench' ? WEAPON_STATS[this.weaponId].reloadSeconds : 0;
      reload.rate = seconds > 0.2 ? Math.min(3, reload.clip.duration / seconds) : 1.5;
    }
    const tauntBinding = this.bindings.get('taunt');
    if (tauntBinding) {
      const idle = alive && !swimming && pose.grounded && speed < 0.5;
      if (this.tauntTime >= 0 && idle) {
        this.tauntTime += dt;
        tauntBinding.time = this.tauntTime;
        if (this.tauntTime >= tauntBinding.clip.duration) this.tauntTime = -1;
      } else {
        this.tauntTime = -1;
      }
      tauntBinding.rate = 0;
      tauntBinding.target = this.tauntTime >= 0 ? 1 : 0;
      tauntBinding.weight = approach(tauntBinding.weight, tauntBinding.target, dt * 5);
    }
    const emoteBinding = this.bindings.get('emote');
    if (emoteBinding) {
      const idle = alive && !swimming && speed < 0.5 && this.tauntTime < 0;
      if (this.emoteTime >= 0 && idle) {
        this.emoteTime += dt;
        emoteBinding.time = this.emoteTime;
        if (this.emoteTime >= emoteBinding.clip.duration) this.emoteTime = -1;
      } else {
        this.emoteTime = -1;
      }
      emoteBinding.rate = 0;
      emoteBinding.target = this.emoteTime >= 0 ? 1 : 0;
      emoteBinding.weight = approach(emoteBinding.weight, emoteBinding.target, dt * 4);
    }

    // Locomotion loops share one normalised phase so blended legs stay in step.
    let dominant: ClipBinding | null = null;
    for (const role of LOCOMOTION) {
      const binding = this.bindings.get(role);
      if (binding && binding.hold === null && (!dominant || binding.weight > dominant.weight)) dominant = binding;
    }
    if (dominant && dominant.weight > 0.002) {
      this.locoPhase = (this.locoPhase + (dt * dominant.rate) / Math.max(0.1, dominant.clip.duration)) % 1;
    }
    for (const binding of this.bindings.values()) {
      if (binding.hold !== null) {
        binding.time = binding.hold;
        continue;
      }
      if (LOCOMOTION.includes(binding.role)) {
        // Shared phase 0 = left-foot contact in every cycle.
        const phase = binding.reverse ? 1 - this.locoPhase : this.locoPhase;
        binding.time = ((phase + (binding.clip.contactPhase ?? 0)) % 1) * binding.clip.duration;
        continue;
      }
      const duration = binding.clip.duration;
      binding.time += dt * binding.rate * (binding.reverse ? -1 : 1);
      if (LOOPING[binding.role]) {
        binding.time = ((binding.time % duration) + duration) % duration;
      } else {
        binding.time = Math.min(duration, Math.max(0, binding.time));
      }
    }

    this.sampleClips();
    this.lengthenStride();
    if (gait) {
      // In-place walking: drop any forward root motion baked into a clip.
      const hips = this.rig.node('Hips');
      if (hips) hips.position.z = this.bindHips.z;
    }

    // ---- procedural layers ---------------------------------------------
    this.breath += dt;
    this.riding = pose.riding;
    this.setWeapon(this.armedModel ? pose.repairing ? 'wrench' : pose.weaponId ?? null : null);
    const style = this.weapon?.hold.style ?? null;
    const weaponVisible =
      alive && !swimming && !rolling && this.parachute < 0.2 && this.tauntTime < 0 && this.weapon !== null;
    this.armed = approach(this.armed, weaponVisible ? 1 : 0, dt * 6 * snap);
    if (this.weapon) this.weapon.mesh.setEnabled(this.armed > 0.3);
    this.holdDt = dt;
    const falling = airborne && this.airTime > FALL_AIR_TIME && pose.velocity.y < -FALL_SPEED;
    this.weapon?.animate?.(dt, { falling, preview: this.previewing });

    if (this.remotePitchTimer > 0) this.remotePitchTimer -= dt;
    const pitchInput = pose.pitch ?? (this.remotePitchTimer > 0 ? this.remotePitch : 0);
    this.pitch = approach(this.pitch, alive ? Math.max(-0.9, Math.min(0.9, pitchInput)) : 0, dt * 6);
    const twistTarget =
      alive && pose.grounded && !swimming && speed > 0.8 && !backward
        ? Math.max(-1.1, Math.min(1.1, Math.atan2(rightSpeed, Math.max(0.1, Math.abs(forwardSpeed))))) * 0.7
        : 0;
    this.twist = approach(this.twist, twistTarget, dt * 4);
    this.recoil = Math.max(0, this.recoil - dt * 9);
    if (this.swing >= 0) {
      this.swing += dt;
      if (this.swing > 0.55) this.swing = -1;
    }

    this.stareTarget = pose.stare ? new Vector3(pose.stare.x, pose.stare.y, pose.stare.z) : null;
    this.dither = approach(this.dither, Math.min(0.85, Math.max(0, pose.shimmer ?? 0)), dt * 6);
    this.applyProcedural(alive, style);
    this.applyStare(dt, alive);

    // ---- whole-body pivots ----------------------------------------------
    if (rolling) this.rollPhase += dt * 11;
    else this.rollPhase = 0;
    this.rollTuck = approach(this.rollTuck, rolling ? 1 : 0, dt * 10);
    this.rollPivot.rotation.x = this.rollPhase;
    this.updateRollPivot(rolling, dt);
    const proneSwim = swimming && !has('swim') ? 1.2 : 0;
    const deathTarget = !alive && !has('death') ? -1.45 : 0;
    this.deathTilt = approach(this.deathTilt, deathTarget, dt * (deathTarget !== 0 ? 4.5 : 8));
    this.tiltPivot.rotation.x = this.deathTilt + proneSwim * this.swim - (pose.vehiclePitch ?? 0);
    this.tiltPivot.rotation.z = pose.vehicleRoll ?? 0;
    this.tiltPivot.position.y = has('swim') ? 0 : -0.32 * this.swim;
    if (this.hover) {
      // Ghostly hover: the body floats a hand's breadth up with a slow bob;
      // the contact shadow stays on the ground.
      this.hoverPhase += (dt * Math.PI * 2) / Math.max(0.5, this.hover.period);
      this.rollPivot.position.y = 0.55 + this.hover.height + Math.sin(this.hoverPhase) * this.hover.bob;
    }
    this.updateMaterial();
  }

  /**
   * Slow creepy stare: neck and head turn toward `pose.stare` (a world
   * point), limited and rate-limited, and ease back when there is none.
   */
  private applyStare(dt: number, alive: boolean): void {
    let yawTarget = 0;
    let pitchTarget = 0;
    const head = this.rig.position('Head');
    if (alive && this.stareTarget && head) {
      const inverse = this.armature.getWorldMatrix().clone().invert();
      const local = Vector3.TransformCoordinates(this.stareTarget, inverse).subtract(head);
      const horizontal = Math.hypot(local.x, local.z);
      if (horizontal > 0.05) {
        yawTarget = Math.max(-STARE_MAX_YAW, Math.min(STARE_MAX_YAW, Math.atan2(local.x, local.z)));
        pitchTarget = Math.max(-STARE_MAX_PITCH, Math.min(STARE_MAX_PITCH, Math.atan2(local.y, horizontal)));
      }
    }
    this.stareYaw = approach(this.stareYaw, yawTarget, dt * STARE_TURN_RATE);
    this.starePitch = approach(this.starePitch, pitchTarget, dt * STARE_TURN_RATE * 0.6);
    if (Math.abs(this.stareYaw) < 0.002 && Math.abs(this.starePitch) < 0.002) return;
    const rig = this.rig;
    for (const [joint, share] of [['Neck', 0.4], ['Head', 0.6]] as const) {
      rig.refresh();
      rig.rotateWorld(joint, Quaternion.RotationAxis(AXIS_Y, this.stareYaw * share));
      rig.refresh();
      const forward = AXIS_Z.rotateByQuaternionToRef(Quaternion.RotationAxis(AXIS_Y, this.stareYaw), new Vector3());
      const side = Vector3.Cross(AXIS_Y, forward).normalize();
      rig.rotateWorld(joint, Quaternion.RotationAxis(side, -this.starePitch * share));
    }
    rig.refresh();
  }

  /** Blends the active clips into the joint nodes (bind pose fills any gap). */
  private sampleClips(): void {
    const acc = this.accumulator;
    const bind = this.bindRotations;
    const count = this.joints.length;
    acc.fill(0);
    const hips = this.hipsAccumulator.set(0, 0, 0);
    let total = 0;
    let hipsTotal = 0;
    for (const binding of this.bindings.values()) {
      if (OVERLAY_ROLES.includes(binding.role)) continue;
      const weight = binding.weight;
      if (weight < 0.002) continue;
      total += weight;
      this.accumulate(binding, weight, null);
      const clipHips = binding.clip.hips;
      if (clipHips) {
        const [a, b, t] = this.frameOf(binding);
        hips.x += ((clipHips[a * 3] ?? 0) * (1 - t) + (clipHips[b * 3] ?? 0) * t) * weight;
        hips.y += ((clipHips[a * 3 + 1] ?? 0) * (1 - t) + (clipHips[b * 3 + 1] ?? 0) * t) * weight;
        hips.z += ((clipHips[a * 3 + 2] ?? 0) * (1 - t) + (clipHips[b * 3 + 2] ?? 0) * t) * weight;
        hipsTotal += weight;
      }
    }
    // Remaining weight rests on the bind pose (procedural idle).
    const rest = Math.max(0, 1 - total);
    if (rest > 0) {
      for (let index = 0; index < count * 4; index += 1) acc[index] = (acc[index] ?? 0) + (bind[index] ?? 0) * rest;
    }
    hips.addInPlace(this.bindHips.scale(Math.max(0, 1 - hipsTotal)));
    if (hipsTotal > 1) hips.scaleInPlace(1 / hipsTotal);
    // Overlays slerp-like (nlerp) towards their pose on their mask.
    for (const role of OVERLAY_ROLES) {
      const binding = this.bindings.get(role);
      if (!binding || binding.weight < 0.002) continue;
      this.normalizeAccumulator();
      this.accumulate(binding, binding.weight, role === 'reload' ? binding.upper : null, true);
    }
    this.normalizeAccumulator();
    for (let index = 0; index < count; index += 1) {
      const rotation = this.joints[index]?.rotationQuaternion;
      if (!rotation) continue;
      rotation.set(acc[index * 4] ?? 0, acc[index * 4 + 1] ?? 0, acc[index * 4 + 2] ?? 0, acc[index * 4 + 3] ?? 1);
    }
    const hipsIndex = this.jointIndex.get('Hips');
    const hipsNode = hipsIndex === undefined ? null : this.joints[hipsIndex];
    hipsNode?.position.copyFrom(hips);
  }

  /**
   * Lengthens the stride while a gait plays at its cadence cap: the thigh
   * and knee rotations away from bind are scaled by the weighted stride
   * factor of the locomotion cycles.
   */
  private lengthenStride(): void {
    let factor = 0;
    let weight = 0;
    for (const role of LOCOMOTION) {
      const binding = this.bindings.get(role);
      if (!binding || binding.weight < 0.002) continue;
      factor += binding.stride * binding.weight;
      weight += binding.weight;
    }
    if (weight < 0.01) return;
    const stride = 1 + (factor / weight - 1) * Math.min(1, weight);
    if (stride < 1.005) return;
    for (const name of STRIDE_JOINTS) {
      const index = this.jointIndex.get(name);
      const rotation = index === undefined ? null : this.joints[index]?.rotationQuaternion;
      const bind = this.asset.bindPose.get(name)?.rotation;
      if (!rotation || !bind) continue;
      // delta = bind^-1 * current, scaled by angle, re-applied on bind.
      const delta = Quaternion.Inverse(bind).multiply(rotation);
      if (delta.w < 0) delta.scaleInPlace(-1);
      const half = Math.acos(Math.min(1, delta.w));
      const sinHalf = Math.sin(half);
      if (sinHalf < 1e-5) continue;
      const scaledHalf = half * stride;
      const k = Math.sin(scaledHalf) / sinHalf;
      delta.set(delta.x * k, delta.y * k, delta.z * k, Math.cos(scaledHalf));
      rotation.copyFrom(bind.multiply(delta));
    }
  }

  private frameOf(binding: ClipBinding): [number, number, number] {
    const clip = binding.clip;
    const position = binding.time * BAKE_FPS;
    const last = clip.frames - 1;
    let a = Math.floor(position);
    let b = a + 1;
    const t = position - a;
    if (LOOPING[binding.role]) {
      a = ((a % clip.frames) + clip.frames) % clip.frames;
      b = ((b % clip.frames) + clip.frames) % clip.frames;
    } else {
      a = Math.min(last, Math.max(0, a));
      b = Math.min(last, Math.max(0, b));
    }
    return [a, b, t];
  }

  /**
   * Adds one clip's pose into the accumulator. With `blendInto`, the existing
   * (normalised) pose is lerped towards the clip by `weight` on the mask.
   */
  private accumulate(binding: ClipBinding, weight: number, mask: Uint8Array | null, blendInto = false): void {
    const acc = this.accumulator;
    const bind = this.bindRotations;
    const clip = binding.clip;
    const [a, b, t] = this.frameOf(binding);
    const stride = clip.bones.length * 4;
    const rows = clip.rotations;
    const count = this.joints.length;
    for (let index = 0; index < count; index += 1) {
      if (mask && !mask[index]) continue;
      const bone = binding.map[index] ?? -1;
      let x: number;
      let y: number;
      let z: number;
      let w: number;
      if (bone < 0) {
        if (blendInto) continue;
        x = bind[index * 4] ?? 0;
        y = bind[index * 4 + 1] ?? 0;
        z = bind[index * 4 + 2] ?? 0;
        w = bind[index * 4 + 3] ?? 1;
      } else {
        const oa = a * stride + bone * 4;
        const ob = b * stride + bone * 4;
        let bx = rows[ob] ?? 0;
        let by = rows[ob + 1] ?? 0;
        let bz = rows[ob + 2] ?? 0;
        let bw = rows[ob + 3] ?? 1;
        const ax = rows[oa] ?? 0;
        const ay = rows[oa + 1] ?? 0;
        const az = rows[oa + 2] ?? 0;
        const aw = rows[oa + 3] ?? 1;
        if (ax * bx + ay * by + az * bz + aw * bw < 0) {
          bx = -bx;
          by = -by;
          bz = -bz;
          bw = -bw;
        }
        x = ax + (bx - ax) * t;
        y = ay + (by - ay) * t;
        z = az + (bz - az) * t;
        w = aw + (bw - aw) * t;
      }
      // Keep every contribution in the bind pose's hemisphere.
      const reference =
        (bind[index * 4] ?? 0) * x + (bind[index * 4 + 1] ?? 0) * y + (bind[index * 4 + 2] ?? 0) * z + (bind[index * 4 + 3] ?? 1) * w;
      const sign = reference < 0 ? -1 : 1;
      if (blendInto) {
        const keep = 1 - weight;
        acc[index * 4] = (acc[index * 4] ?? 0) * keep + x * sign * weight;
        acc[index * 4 + 1] = (acc[index * 4 + 1] ?? 0) * keep + y * sign * weight;
        acc[index * 4 + 2] = (acc[index * 4 + 2] ?? 0) * keep + z * sign * weight;
        acc[index * 4 + 3] = (acc[index * 4 + 3] ?? 0) * keep + w * sign * weight;
      } else {
        acc[index * 4] = (acc[index * 4] ?? 0) + x * sign * weight;
        acc[index * 4 + 1] = (acc[index * 4 + 1] ?? 0) + y * sign * weight;
        acc[index * 4 + 2] = (acc[index * 4 + 2] ?? 0) + z * sign * weight;
        acc[index * 4 + 3] = (acc[index * 4 + 3] ?? 0) + w * sign * weight;
      }
    }
  }

  private normalizeAccumulator(): void {
    const acc = this.accumulator;
    const bind = this.bindRotations;
    for (let index = 0; index < this.joints.length; index += 1) {
      const o = index * 4;
      const length = Math.hypot(acc[o] ?? 0, acc[o + 1] ?? 0, acc[o + 2] ?? 0, acc[o + 3] ?? 0);
      if (length < 1e-6) {
        acc[o] = bind[o] ?? 0;
        acc[o + 1] = bind[o + 1] ?? 0;
        acc[o + 2] = bind[o + 2] ?? 0;
        acc[o + 3] = bind[o + 3] ?? 1;
      } else {
        acc[o] = (acc[o] ?? 0) / length;
        acc[o + 1] = (acc[o + 1] ?? 0) / length;
        acc[o + 2] = (acc[o + 2] ?? 0) / length;
        acc[o + 3] = (acc[o + 3] ?? 0) / length;
      }
    }
  }

  /**
   * Keeps the tucked roll above the ground. Clearance points: the head and
   * whatever hat is drawn (painted hat, or the body top when it was swapped
   * out, plus any attached headgear) as spheres, the chest, shoulders and the
   * hand tips (knuckle plus the fingers). From the current pose the pivot
   * height is chosen so a full turn about it keeps every point 2 cm up
   * (c >= (y² + z² - (m + r)²) / 2(y - m - r) per point), and a small
   * safety lift covers what the pose changes mid-roll. Both move at a
   * bounded rate, so no hop happens in one frame.
   */
  private updateRollPivot(rolling: boolean, dt: number): void {
    const margin = 0.02;
    let pivotTarget = this.rollCentre;
    let liftTarget = 0;
    const spheres = rolling ? this.rollClearanceSpheres() : [];
    if (spheres.length > 0) {
      for (const [y, z, r] of spheres) {
        const reach = margin + r;
        if (y <= reach + 0.05) continue;
        pivotTarget = Math.max(pivotTarget, (y * y + z * z - reach * reach) / (2 * (y - reach)));
      }
      pivotTarget = Math.min(pivotTarget, 0.75 * this.height);
    }
    // Moving the pivot shifts the body by Δc·(1 - cos φ): free at the start
    // of the turn, so it may move fast there and barely at all mid-roll.
    const half = Math.cos(this.rollPhase * 0.5);
    this.rollPivotY = approach(this.rollPivotY, pivotTarget, dt * (0.5 + 8 * half * half));
    if (spheres.length > 0) {
      const c = this.rollPivotY;
      const cos = Math.cos(this.rollPhase);
      const sin = Math.sin(this.rollPhase);
      let lowest = Infinity;
      for (const [y, z, r] of spheres) lowest = Math.min(lowest, c + (y - c) * cos - z * sin - r);
      liftTarget = Math.max(0, margin - lowest);
    }
    this.rollLift = approach(this.rollLift, liftTarget, dt * 2);
    this.rollPivot.position.y = this.rollPivotY + this.rollLift;
    this.modelRoot.position.y = -this.rollPivotY;
  }

  /** Clearance spheres [height above the feet, forward offset, radius] in unrotated roll space. */
  private rollClearanceSpheres(): Array<[number, number, number]> {
    const rig = this.rig;
    const hips = rig.node('Hips');
    const armature = hips?.parent instanceof TransformNode ? hips.parent : null;
    if (!armature) return [];
    if (!this.armatureToModel) {
      // The glTF root chain between the model root and the armature is static.
      this.modelRoot.computeWorldMatrix(true);
      const chain: TransformNode[] = [];
      for (let node: TransformNode | null = armature; node && node !== this.modelRoot; node = node.parent instanceof TransformNode ? node.parent : null) {
        chain.unshift(node);
      }
      for (const node of chain) node.computeWorldMatrix(true);
      this.armatureToModel = armature.getWorldMatrix().multiply(Matrix.Invert(this.modelRoot.getWorldMatrix()));
    }
    const toModel = this.armatureToModel;
    const scale = this.scale;
    const out: Array<[number, number, number]> = [];
    const add = (point: Vector3, radius: number): void => {
      const local = Vector3.TransformCoordinates(point, toModel);
      out.push([local.y * scale, local.z * scale, radius * scale]);
    };
    const boxes = modularRollBoxes(this.bodyMesh);
    if (boxes.length) {
      for (const box of boxes) {
        const position = rig.position(box.joint), rotation = rig.rotation(box.joint);
        if (!position || !rotation) continue;
        for (const corner of box.corners) add(position.add(corner.rotateByQuaternionToRef(rotation, new Vector3())), 0.015);
      }
      return out;
    }
    for (const joint of ['Spine2', 'LeftShoulder', 'RightShoulder'] as const) {
      const position = rig.position(joint);
      if (position) add(position, 0.06);
    }
    for (const side of ['Left', 'Right'] as const) {
      const hand = rig.position(`${side}Hand`);
      const knuckle = rig.position(`${side}HandMiddle1`);
      if (!hand || !knuckle) continue;
      const toKnuckle = knuckle.subtract(hand);
      // Fingertips: the knuckle plus about the finger length beyond it.
      add(knuckle.add(toKnuckle.scale(1.3)), 0.03);
      add(knuckle, 0.04);
    }
    const head = rig.position('Head');
    const neck = rig.position('Neck');
    const bindHead = this.asset.bindPositions.get('Head');
    if (head && neck && bindHead) {
      const top = (this.hatHidden || !this.asset.hatSplit ? this.asset.bodyTop : this.asset.height) - bindHead.y;
      const headTop = Math.max(this.asset.spec.head.radius * 1.2, top);
      const up = head.subtract(neck).normalize();
      add(head.add(up.scale(headTop * 0.5)), Math.max(headTop * 0.5, this.asset.spec.head.radius) * 1.1);
    }
    const attachment = this.headAttachment;
    const headRotation = rig.rotation('Head');
    if (attachment && head && headRotation) {
      // Attached headgear and face items: their bounding-box corners carried by the animated head.
      const box = attachment.getBoundingInfo().boundingBox;
      const rotation = attachment.rotationQuaternion ?? Quaternion.Identity();
      for (const corner of box.vectors) {
        const inHead = attachment.position.add(corner.multiply(attachment.scaling).rotateByQuaternionToRef(rotation, new Vector3()));
        add(head.add(inHead.rotateByQuaternionToRef(headRotation, new Vector3())), 0.01);
      }
    }
    return out;
  }

  private applyProcedural(alive: boolean, style: HoldStyle | null): void {
    const rig = this.rig;
    rig.refresh();
    const blend = this.aliveBlend * (1 - this.swim);

    // Crouch: drop the hips and keep the animated feet planted with leg IK.
    const crouch = this.crouch * blend;
    if (crouch > 0.01) {
      const leftFoot = rig.position('LeftFoot')?.clone();
      const rightFoot = rig.position('RightFoot')?.clone();
      const hips = rig.node('Hips');
      if (hips) hips.position.y -= crouch * this.bindHips.y * 0.3;
      rig.refresh();
      if (leftFoot) rig.solveTwoBone('LeftUpLeg', 'LeftLeg', 'LeftFoot', leftFoot, new Vector3(0.2, 0, 1), 1);
      if (rightFoot) rig.solveTwoBone('RightUpLeg', 'RightLeg', 'RightFoot', rightFoot, new Vector3(-0.2, 0, 1), 1);
    }

    // Bent knees with planted footrests; the existing skeleton and IK do all skinning.
    if (this.riding) {
      const seated = this.riding !== 'wing';
      const left = rig.position('LeftFoot')?.clone();
      const right = rig.position('RightFoot')?.clone();
      const hips = rig.node('Hips');
      if (hips) hips.position.y -= this.bindHips.y * (seated ? 0.36 : 0.14) * blend;
      rig.refresh();
      for (const [side, foot] of [['Left', left], ['Right', right]] as const) {
        if (!foot) continue;
        foot.z += this.height * (seated ? 0.16 : 0.015) * blend;
        rig.solveTwoBone(`${side}UpLeg`, `${side}Leg`, `${side}Foot`, foot, new Vector3(side === 'Left' ? 0.15 : -0.15, 0, 1), blend);
        rig.refresh();
      }
      if (this.riding === 'steer' || this.riding === 'row') {
        const chest = rig.position('Spine2');
        if (chest) for (const side of ['Left', 'Right'] as const) {
          const sign = side === 'Left' ? 1 : -1;
          const stroke = this.riding === 'row' ? Math.sin(this.breath * 7.85) * 0.09 : 0;
          const grip = chest.add(new Vector3(sign * this.height * 0.14, -this.height * 0.13, this.height * 0.25 + stroke));
          rig.solveTwoBone(`${side}Arm`, `${side}ForeArm`, `${side}Hand`, grip, new Vector3(sign, -1, 0), blend);
          rig.refresh();
          this.closeHand(side, blend, false);
        }
      }
    }

    // Dodge-roll tuck: curl the spine and head forward.
    const tuck = this.rollTuck * blend;
    if (tuck > 0.01) {
      for (const [joint, angle] of [['Spine', 0.35], ['Spine1', 0.4], ['Spine2', 0.4], ['Neck', 0.3]] as const) {
        rig.rotateWorld(joint, Quaternion.RotationAxis(AXIS_X, angle * tuck));
        rig.refresh();
      }
    }

    // Strafe: hips turn towards the movement, the chest stays on target.
    const twist = this.twist * blend;
    if (Math.abs(twist) > 0.01) {
      rig.rotateWorld('Hips', Quaternion.RotationAxis(AXIS_Y, -twist));
      rig.refresh();
      rig.rotateWorld('Spine', Quaternion.RotationAxis(AXIS_Y, twist * 0.55));
      rig.refresh();
      rig.rotateWorld('Spine1', Quaternion.RotationAxis(AXIS_Y, twist * 0.45));
      rig.refresh();
    }

    // Aim pitch (+ a little lean when crouched), spread over the spine.
    const recoilKick = this.recoil * 0.06;
    const lean = crouch * 0.18;
    const pitch = (this.pitch + recoilKick) * blend * this.armedOrPreview() - lean;
    if (Math.abs(pitch) > 0.002) {
      const parts: Array<[RigJoint, number]> = [
        ['Spine', 0.3],
        ['Spine1', 0.3],
        ['Spine2', 0.4],
      ];
      for (const [joint, share] of parts) {
        rig.rotateWorld(joint, Quaternion.RotationAxis(AXIS_X, -pitch * share));
        rig.refresh();
      }
    }
    // Breathing when the model has no idle clip of its own.
    if (!this.bindings.has('idle') || this.asset.clips.get('idle')?.retargetedFrom !== null) {
      const idle = this.bindings.get('idle')?.weight ?? 1;
      const breath = Math.sin(this.breath * 2.1) * 0.025 * idle * blend;
      if (Math.abs(breath) > 0.001) {
        rig.rotateWorld('Spine2', Quaternion.RotationAxis(AXIS_X, breath));
        rig.refresh();
      }
    }

    // Weapon frame in front of the chest, hands pulled onto the grips.
    // Every rule below is continuous in the animated pose (smooth weights,
    // closed-form solves, eased state), so the weapon never jumps a frame.
    const weapon = this.weapon;
    const armed = this.armed * blend;
    if (!weapon || armed < 0.01 || !style) return;
    const chest = rig.position('Spine2');
    if (!chest) return;
    const hold = weapon.hold;
    const ease = this.holdSnap ? 1 : 1 - Math.exp(-HOLD_EASE * this.holdDt);
    this.holdSnap = false;
    const offset = hold.offset ?? HOLD_OFFSETS[style];
    // Long props (alphorn, polearms) follow only part of the aim pitch.
    const aim = Quaternion.RotationAxis(AXIS_X, -this.pitch * blend * (hold.pitchScale ?? 1));
    // Shoulder-anchored holds sit relative to the shoulder line and scale
    // with the arm length, so every painted body (high-shouldered heavies,
    // short-armed scouts) reaches the same grips.
    // The shoulder point rides rigidly on Spine2 (bind pose), so clavicle
    // animation in the clips does not move the weapon.
    let anchor = chest;
    let reachScale = 1;
    let clearance = 0;
    const spineRotation = rig.rotation('Spine2');
    const tucked = hold.anchor === 'shoulders';
    const mouthpiece = hold.mouthpiece ?? null;
    // Protract the clavicles before any reach test, so the tests see the
    // shoulders the arms start from: clips that roll the shoulders back (the
    // heavies' idles) would leave the grips out of reach. A horn at the mouth
    // hunches the shoulders forward a little more.
    if (tucked) rig.rotateWorld('RightShoulder', Quaternion.RotationAxis(AXIS_Y, (mouthpiece ? 0.65 : 0.3) * armed));
    if (hold.support) rig.rotateWorld('LeftShoulder', Quaternion.RotationAxis(AXIS_Y, -0.38 * armed));
    if (tucked || hold.support) rig.refresh();
    if (tucked && this.shoulderLocal && spineRotation) {
      anchor = chest.add(this.shoulderLocal.rotateByQuaternionToRef(spineRotation, new Vector3()));
      reachScale = Math.min(1.25, Math.max(0.8, this.armLength / 0.43));
      // Bulky bodies (barrel chests, beards, swim rings) push the weapon out.
      clearance = (this.bulk - 1) * 0.37;
    }
    const local = toArmature(
      offset[0] * Math.min(1.1, this.shoulderHalf / 0.2),
      offset[1] * reachScale,
      offset[2] * reachScale + clearance - this.recoil * 0.05,
    );
    let frame = aim;
    if (this.swing >= 0) {
      // Melee swing: wind up, then slash down-forward across the body.
      const t = this.swing / 0.55;
      const arc = t < 0.3 ? -1.1 * (t / 0.3) : -1.1 + 2.3 * smoothstep(0.3, 0.75, t);
      frame = aim.multiply(Quaternion.RotationAxis(AXIS_X, arc * (1 - smoothstep(0.75, 1, t))));
      local.y += 0.12 * Math.sin(Math.PI * Math.min(1, t * 1.4));
    }
    const grip = anchor.add(local.rotateByQuaternionToRef(frame, new Vector3()));
    let weaponRotation = frame
      .multiply(Quaternion.RotationAxis(AXIS_Y, hold.yaw ?? 0))
      .multiply(Quaternion.RotationAxis(AXIS_X, -hold.tilt));
    // Alphorn: the mouthpiece stays on the measured lips. Adapt the clavicle
    // to the wrist target rather than pulling the instrument away from the face.
    const mouth = mouthpiece && this.head ? this.headPoint(this.head.mouth) : null;
    const seatAtMouth = (): void => {
      if (mouth && mouthpiece) grip.copyFrom(mouth.subtract(mouthpiece.rotateByQuaternionToRef(weaponRotation, new Vector3())));
    };
    seatAtMouth();
    // Long props never sink below the feet: pitch up about the grip (or the mouthpiece).
    weaponRotation = this.liftOffGround(grip, weaponRotation, mouth ? mouthpiece : null);
    seatAtMouth();
    this.clearHead(grip, weaponRotation, hold);
    let support = this.supportPoint(hold, grip, weaponRotation);
    if (support && !mouth) {
      // Short painted arms: pull the whole weapon towards the left shoulder
      // until the support hand can reach its grip.
      const leftArm = rig.position('LeftArm');
      const leftFore = rig.position('LeftForeArm');
      const leftHand = rig.position('LeftHand');
      if (leftArm && leftFore && leftHand) {
        const reach = 0.92 * (Vector3.Distance(leftArm, leftFore) + Vector3.Distance(leftFore, leftHand));
        const toShoulder = leftArm.subtract(support);
        const distance = toShoulder.length();
        if (distance > reach && distance > 1e-4) {
          // Shoulder-anchored holds keep their place (pull a little at
          // most); the support hand then slides along the foregrip below.
          const pull = Math.min(distance - reach, tucked ? this.supportPullLimit : Infinity);
          const shift = toShoulder.scale(pull / distance);
          grip.addInPlace(shift);
          support = support.add(shift);
        }
      }
    }
    // Long stocks stay in front of the chest (soft limit): the arm-reach
    // pull above and the aim pitch would otherwise push the butt through the
    // body. Then the grip is clamped to the right arm's reach, and only a
    // hard limit (the butt never leaves through the back) may override that.
    // Shoulder-anchored holds tuck the stock against the body (under the
    // arm), so for them only the hard limit applies.
    const torso = this.torso;
    const tailZ = (): number =>
      grip.add(new Vector3(0, 0, this.weaponRear).rotateByQuaternionToRef(weaponRotation, new Vector3())).z;
    if (torso && this.weaponRear < -0.02 && !tucked) {
      const deficit = chest.z + (torso.front - torso.chestZ) + 0.03 - tailZ();
      if (deficit > 0) grip.z += deficit;
    }
    const rightArm = rig.position('RightArm');
    const rightFore = rig.position('RightForeArm');
    const rightHand = rig.position('RightHand');
    if (mouth && rightArm && rightFore && rightHand) {
      const reach = 0.92 * (Vector3.Distance(rightArm, rightFore) + Vector3.Distance(rightFore, rightHand));
      const shoulder = rig.position('RightShoulder');
      if (shoulder) {
        const ax = rightArm.x - shoulder.x, az = rightArm.z - shoulder.z;
        const tx = grip.x - shoulder.x, tz = grip.z - shoulder.z;
        const yaw = Math.atan2(az * tx - ax * tz, ax * tx + az * tz);
        const excess = Vector3.Distance(rightArm, grip) - reach;
        const target = Math.max(0, Math.min(.8, yaw)) * smoothstep(.01, .12, excess);
        this.mouthShoulder += (target - this.mouthShoulder) * ease;
        if (this.mouthShoulder > .001) {
          rig.rotateWorld('RightShoulder', Quaternion.RotationAxis(AXIS_Y, this.mouthShoulder * armed));
          rig.refresh();
        }
      }
    } else if (rightArm && rightFore && rightHand && tucked) {
      // Hero holds never put the grip inside the body: in front of the torso
      // across its width (fading out past the shoulder line), and when the
      // arm is too short (heavies' bellies) the grip slides sideways and up
      // towards the right shoulder line to the first point in reach, never
      // back into the chest. If even that is out of reach, the hand falls
      // short of the grip rather than the weapon sinking in.
      const reach = 0.92 * (Vector3.Distance(rightArm, rightFore) + Vector3.Distance(rightFore, rightHand));
      const front = this.frontLocal && spineRotation ? chest.add(this.frontLocal.rotateByQuaternionToRef(spineRotation, new Vector3())) : null;
      const keepOut = (point: Vector3): void => {
        if (front) point.z = keepOutZ(point.x, point.z, chest.x, this.shoulderHalf, front.z + 0.02);
      };
      keepOut(grip);
      // Raise a low grip a little on the way, never up into the face (big guns sit above the grip).
      const end = new Vector3(rightArm.x, Math.max(grip.y, rightArm.y - 0.28), grip.z);
      keepOut(end);
      const slide = segmentReach(grip, end, rightArm, reach);
      grip.addInPlace(end.subtract(grip).scaleInPlace(slide));
      keepOut(grip);
      // Still too far (an outstretched pistol): pull straight in, but not into the chest.
      const toGrip = grip.subtract(rightArm);
      const distance = toGrip.length();
      if (distance > reach && distance > 1e-4) {
        grip.copyFrom(rightArm.add(toGrip.scale(reach / distance)));
        keepOut(grip);
      }
    } else if (rightArm && rightFore && rightHand) {
      const reach = 0.92 * (Vector3.Distance(rightArm, rightFore) + Vector3.Distance(rightFore, rightHand));
      const toGrip = grip.subtract(rightArm);
      const distance = toGrip.length();
      if (distance > reach && distance > 1e-4) grip.copyFrom(rightArm.add(toGrip.scale(reach / distance)));
    }
    if (torso && this.weaponRear < -0.02 && !mouth) {
      const deficit = chest.z + (torso.back - torso.chestZ) + (tucked ? 0.08 : 0.06) - tailZ();
      if (deficit > 0) grip.z += deficit;
    }
    if (support) support = this.supportPoint(hold, grip, weaponRotation);
    const leftArm = rig.position('LeftArm');
    const leftFore = rig.position('LeftForeArm');
    const leftWrist = rig.position('LeftHand');
    if (support && leftArm && leftFore && leftWrist) {
      // Out of reach (short arms, big bellies): the support hand slides back
      // along the foregrip / shaft to the first point in reach, never past
      // its back end; when even that is out of reach the left arm eases back
      // to its animated pose instead of hovering beside the weapon.
      const reach = 0.92 * (Vector3.Distance(leftArm, leftFore) + Vector3.Distance(leftFore, leftWrist));
      const back = hold.supportBack ? grip.add(hold.supportBack.rotateByQuaternionToRef(weaponRotation, new Vector3())) : support.clone();
      const shoulder = tucked ? rig.position('LeftShoulder') : null;
      if (shoulder) {
        // A short, broad rig can reach the foregrip by bringing its clavicle
        // forward. Do not leave it behind the chest once the hand fades out.
        // Work from the unchanged clip pose each frame, with a bounded/eased yaw.
        const dx = back.x - support.x, dy = back.y - support.y, dz = back.z - support.z;
        const length = dx * dx + dy * dy + dz * dz;
        const t = length > 1e-8 ? Math.max(0, Math.min(1,
          ((leftArm.x - support.x) * dx + (leftArm.y - support.y) * dy + (leftArm.z - support.z) * dz) / length)) : 0;
        const x = support.x + dx * t, y = support.y + dy * t, z = support.z + dz * t;
        const excess = Math.hypot(x - leftArm.x, y - leftArm.y, z - leftArm.z) - reach;
        const ax = leftArm.x - shoulder.x, az = leftArm.z - shoulder.z;
        const tx = x - shoulder.x, tz = z - shoulder.z;
        const yaw = Math.atan2(az * tx - ax * tz, ax * tx + az * tz);
        const target = Math.max(-.65, Math.min(0, yaw)) * smoothstep(.01, .12, excess);
        this.supportShoulder += (target - this.supportShoulder) * ease;
        if (Math.abs(this.supportShoulder) > .001) {
          rig.rotateWorld('LeftShoulder', Quaternion.RotationAxis(AXIS_Y, this.supportShoulder * armed));
          rig.refresh();
        }
      }
      this.supportSlide += (segmentReach(support, back, leftArm, reach) - this.supportSlide) * ease;
      support = support.add(back.subtract(support).scaleInPlace(this.supportSlide));
      const excess = Vector3.Distance(leftArm, support) - reach;
      this.supportReach += (1 - smoothstep(0.03, 0.14, excess) - this.supportReach) * ease;
    }
    this.weaponAnchor.position.copyFrom(grip);
    this.weaponAnchor.rotationQuaternion?.copyFrom(weaponRotation);

    const rightPole = toArmature(0.7, -1, -0.45).normalize();
    rig.solveTwoBone('RightArm', 'RightForeArm', 'RightHand', grip, rightPole, armed);
    rig.refresh();
    const fingers = toArmature(-0.35, -0.45, 0.82).normalize().rotateByQuaternionToRef(weaponRotation, new Vector3());
    const thumb = toArmature(-0.2, 0.65, 0.73).normalize().rotateByQuaternionToRef(weaponRotation, new Vector3());
    rig.orientHand('RightHand', 'RightHandMiddle1', 'RightHandThumb1', fingers, thumb, armed, 'RightForeArm', this.wristHands.Right);
    // The fist closes on the grip (the trigger finger stays half open on guns).
    const trigger = !mouthpiece && (style === 'rifle' || style === 'pistol' || style === 'launcher');
    this.closeHand('Right', armed, trigger);
    if (support) {
      const reloadDrop = 1 - (this.bindings.get('reload')?.weight ?? 0) * 0.8;
      const leftWeight = armed * reloadDrop * this.supportReach;
      const leftPole = toArmature(-0.6, -1, -0.5).normalize();
      rig.solveTwoBone('LeftArm', 'LeftForeArm', 'LeftHand', support, leftPole, leftWeight);
      rig.refresh();
      const leftFingers = toArmature(0.45, -0.35, 0.82).normalize().rotateByQuaternionToRef(weaponRotation, new Vector3());
      const leftThumb = toArmature(0.15, 0.6, 0.78).normalize().rotateByQuaternionToRef(weaponRotation, new Vector3());
      rig.orientHand('LeftHand', 'LeftHandMiddle1', 'LeftHandThumb1', leftFingers, leftThumb, leftWeight, 'LeftForeArm', this.wristHands.Left);
      this.closeHand('Left', leftWeight, false);
    }
  }

  /** A point given in the Head joint's frame, in armature space (current pose). */
  private headPoint(local: Vector3): Vector3 | null {
    const head = this.rig.position('Head');
    const rotation = this.rig.rotation('Head');
    if (!head || !rotation) return null;
    return head.add(local.rotateByQuaternionToRef(rotation, new Vector3()));
  }

  /**
   * Pitches the prop up (about the grip, or a weapon-space pivot) just enough
   * that its lowest bounding point stays above the feet.
   */
  private liftOffGround(grip: Vector3, rotation: Quaternion, pivotLocal: Vector3 | null): Quaternion {
    const points = this.weaponPoints;
    if (points.length === 0) return rotation;
    const pivot = pivotLocal ? grip.add(pivotLocal.rotateByQuaternionToRef(rotation, new Vector3())) : grip;
    const scratch = this.liftScratch;
    points.forEach((point, index) => {
      const target = scratch[index] ?? (scratch[index] = new Vector3());
      target.copyFrom(point);
      if (pivotLocal) target.subtractInPlace(pivotLocal);
      target.rotateByQuaternionToRef(rotation, target);
    });
    scratch.length = points.length;
    const lift = groundLift(scratch, GROUND_CLEARANCE - pivot.y, 1.2);
    return lift > 1e-4 ? Quaternion.RotationAxis(AXIS_X, -lift).multiply(rotation) : rotation;
  }

  /** Pushes a prop's head-clearance capsule (furled umbrella) sideways out of the head. */
  private clearHead(grip: Vector3, rotation: Quaternion, hold: HoldSpec): void {
    const capsule = hold.headClear;
    const centre = capsule && this.head ? this.headPoint(this.head.centre) : null;
    if (!capsule || !centre || !this.head) return;
    const from = grip.add(capsule.from.rotateByQuaternionToRef(rotation, new Vector3()));
    const to = grip.add(capsule.to.rotateByQuaternionToRef(rotation, new Vector3()));
    const away = closestOnSegment(from, to, centre).subtractInPlace(centre);
    const needed = capsule.radius + this.head.radius + 0.01;
    const distance = away.length();
    if (distance >= needed) return;
    away.y = 0;
    // Straight above or through the centre: out to the holder's right.
    if (away.lengthSquared() < 1e-6) away.copyFrom(toArmature(1, 0, 0));
    grip.addInPlace(away.normalize().scaleInPlace(needed - distance));
  }

  /** Closes one hand's fingers towards a fist (slerp from the clip pose). */
  private closeHand(side: HandSide, weight: number, trigger: boolean): void {
    if (weight <= 0.001) return;
    for (const { node, fist, trigger: triggerFinger } of this.fists[side]) {
      const rotation = node.rotationQuaternion;
      if (rotation) Quaternion.SlerpToRef(rotation, fist, weight * (trigger && triggerFinger ? 0.4 : 1), rotation);
    }
  }

  private armedOrPreview(): number {
    return 0.35 + 0.65 * this.armed;
  }

  private supportPoint(hold: HoldSpec, grip: Vector3, rotation: Quaternion): Vector3 | null {
    if (!hold.support) return null;
    const support = hold.support.rotateByQuaternionToRef(rotation, new Vector3());
    return grip.add(support);
  }

  private setWeapon(id: WeaponId | 'wrench' | null): void {
    if (id === this.weaponId) return;
    this.weaponId = id;
    if (this.weapon) this.weapon.mesh.setEnabled(false);
    this.weapon = null;
    if (!id) return;
    let prop = this.weapons.get(id);
    if (prop === undefined) {
      prop = id === 'wrench' ? buildWrenchProp(this.scene, this.propMaterial) : buildWeaponProp(this.scene, id, this.propMaterial);
      if (prop) {
        prop.mesh.parent = this.weaponAnchor;
        prop.mesh.position.set(0, 0, 0);
      }
      this.weapons.set(id, prop);
    }
    this.weapon = prop ?? null;
    // A prop equipped again starts furled and flash-free; the hold snaps into place.
    prop?.reset?.();
    this.holdSnap = true;
    this.rig.resetTwist();
    this.weaponPoints = prop ? (propPoints.get(prop) ?? propPoints.set(prop, supportPoints(propMeshes(prop))).get(prop) ?? []) : [];
    const rear = prop?.hold.rear;
    this.weaponRear = !prop ? 0 : rear !== undefined ? Math.min(0, rear ?? 0) : Math.min(0, prop.mesh.getBoundingInfo().boundingBox.minimum.z);
  }

  private updateCanopy(deltaSeconds: number, blend: number, sway: number): void {
    const visible = blend > 0.01;
    if (visible && !this.canopy) {
      this.canopy = buildCanopyProp(this.scene, this.canopyAlpine, this.propMaterial);
      if (this.canopy) this.canopy.parent = this.canopyPivot;
    }
    this.canopyPivot.setEnabled(visible);
    if (!visible) return;
    const eased = blend * blend * (3 - 2 * blend);
    this.canopyPivot.scaling.setAll(0.32 + eased * 0.68);
    this.canopyPivot.rotation.z = sway * 0.55;
    this.canopyPivot.rotation.x = -0.08 * eased;
    this.canopyPivot.position.y = 1.15 + Math.sin(performance.now() * 0.0028) * 0.025 * eased;
    this.canopyPivot.rotation.y += deltaSeconds * 0.08 * eased;
  }

  private updateMaterial(): void {
    const camera = this.scene.activeCamera;
    if (!camera) return;
    const time = performance.now() / 1000;
    updateGlbMaterial(this.material, camera.position, time, this.effects, this.dither * (0.75 + Math.sin(time * 37) * 0.25));
    updateGlbMaterial(this.propMaterial, camera.position, time, this.effects);
  }

  /** Draw calls this view adds to the main pass (body, props, shadow disc). */
  drawCalls(): number {
    let count = this.bodyMesh.subMeshes.length + 1 + this.attachments.length;
    if (this.weapon?.mesh.isEnabled()) {
      count += 1 + this.weapon.mesh.getChildMeshes(false).filter((child) => child.isEnabled()).length;
    }
    if (this.canopyPivot.isEnabled()) count += 1;
    return count;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    liveViews.delete(this);
    this.entries.dispose();
    for (const prop of this.weapons.values()) prop?.mesh.dispose();
    this.root.dispose(false, false);
    this.material.dispose();
    this.propMaterial.dispose();
    this.shadowMaterial.dispose();
  }
}

/** Invisible stand-in for the frame or two until a loaded painted view may be built. */
class EmptyAvatarView implements AvatarView {
  readonly root: TransformNode;

  constructor(
    scene: Scene,
    private readonly shadowMaterial: StandardMaterial,
  ) {
    this.root = new TransformNode('glb-placeholder', scene);
  }

  update(_deltaSeconds: number, pose: AvatarPose): void {
    this.setPosition(pose.position);
  }

  updatePreview(): void {}

  setEffects(): void {}

  setPosition(position: Vec3): void {
    this.root.position.set(position.x, position.y, position.z);
  }

  setYaw(): void {}

  dispose(): void {
    this.root.dispose();
    this.shadowMaterial.dispose();
  }
}

/** Frame of the last painted-view construction per scene (one per rendered frame). */
const lastSwapFrames = new WeakMap<Scene, number>();

/** Claims this frame's painted-view construction for `scene`; false when already taken. */
function takeSwapBudget(scene: Scene): boolean {
  const frame = scene.getFrameId();
  if (lastSwapFrames.get(scene) === frame) return false;
  lastSwapFrames.set(scene, frame);
  return true;
}

/** Characters further away than this never trigger a painted-model download. */
const LAZY_LOAD_DISTANCE = 220;
/** Seconds between on-screen checks of a stand-in. */
const LAZY_CHECK_INTERVAL = 0.25;

/**
 * Stand-in while the painted model is not loaded: shows the procedural rig,
 * requests its rig (plus textures for fixed-look extras) once it is on
 * screen (or shown in the wardrobe preview), and swaps to the painted view
 * in place. If the model turns out to be unavailable, the stand-in stays.
 */
class PendingPaintedView implements AvatarView {
  private current: AvatarView;
  private painted = false;
  private disposed = false;
  private requested = false;
  private loaded: { asset: PaintedModelAsset; textures: PaintedTextures | null } | null = null;
  /** The stand-in shows nothing (model already loaded), so it may swap at any time. */
  private readonly placeholder: boolean;
  private checkIn = 0;
  private effects: Partial<CharacterMaterialState> = {};
  private lastYaw = 0;
  private label = '';
  private readonly key: string | null;
  private readonly center = new Vector3();

  debugInfo(): Record<string, unknown> {
    return {
      view: this.label,
      model: this.key,
      painted: this.painted,
      requested: this.requested,
      disposed: this.disposed,
      enabled: this.root.isEnabled(false),
    };
  }

  constructor(
    private readonly scene: Scene,
    shadowMaterial: StandardMaterial,
    private readonly profile: PlayerProfile,
    /** Already loaded: show nothing for the frame or two until the swap budget allows. */
    preloaded: { asset: PaintedModelAsset; textures: PaintedTextures | null } | null = null,
    priority = false,
  ) {
    this.current = preloaded ? new EmptyAvatarView(scene, shadowMaterial) : new CharacterView(scene, shadowMaterial, profile);
    this.placeholder = preloaded !== null;
    this.loaded = preloaded;
    this.requested = preloaded !== null;
    this.label = shadowMaterial.name;
    this.key = paintedModelSpec(profile)?.key ?? null;
    lastLibrary = paintedModelLibrary(scene);
    pendingViews.add(this);
    installGlbDebugHandle();
    debugEvent(`pending ${this.label}`);
    if (priority) this.request();
  }

  /** True when the stand-in is enabled, near enough and inside the camera frustum. */
  private onScreen(): boolean {
    const root = this.current.root;
    if (!root.isEnabled()) return false;
    const camera = this.scene.activeCamera;
    if (!camera) return false;
    const position = root.getAbsolutePosition();
    this.center.set(position.x, position.y + 0.9, position.z);
    if (Vector3.DistanceSquared(this.center, camera.globalPosition) > LAZY_LOAD_DISTANCE * LAZY_LOAD_DISTANCE) return false;
    const planes = this.scene.frustumPlanes;
    if (!planes || planes.length < 6) return true;
    return planes.every((plane) => plane.dotCoordinate(this.center) > -1.4);
  }

  private request(): void {
    if (this.requested || !this.key) return;
    this.requested = true;
    const key = this.key;
    const label = this.label;
    debugEvent(`request ${label} ${key}`);
    void loadAvatarModel(this.scene, key)
      .then((loaded) => {
        if (this.disposed) {
          debugEvent(`pending ${label} disposed before ${key} loaded`);
          return;
        }
        debugEvent(`loaded ${label} ${key} ${loaded ? 'ok' : 'unavailable'}`);
        // Swapped from update(): at most one view per frame, never mid-death.
        this.loaded = loaded;
      })
      .catch((error: unknown) => {
        console.warn('[frost-and-flamingos] painted view swap failed; keeping the procedural rig', error);
      });
  }

  /**
   * Swaps to the painted view once it has loaded: one swap per rendered
   * frame across all stand-ins (each construction clones a skeleton), and
   * not while the character is dead or parachuting, so a corpse or a
   * descending player keeps its pose instead of restarting it.
   */
  private trySwap(alive: boolean, steady: boolean): void {
    const loaded = this.loaded;
    if (!loaded || this.painted || this.disposed) return;
    if (!this.placeholder && (!alive || !steady)) return;
    if (!takeSwapBudget(this.scene)) return;
    try {
      const previous = this.current;
      const enabled = previous.root.isEnabled(false);
      const position = previous.root.position;
      const shadow = createShadowMaterial(this.scene, `${this.label}-painted`);
      const next = new GlbCharacterView(this.scene, shadow, this.profile, loaded.asset, loaded.textures);
      next.setPosition({ x: position.x, y: position.y, z: position.z });
      next.setYaw(this.lastYaw, true);
      next.setEffects(this.effects);
      next.root.setEnabled(enabled);
      next.snapToPose();
      previous.dispose();
      this.current = next;
      this.painted = true;
      pendingViews.delete(this);
    } catch (error) {
      this.loaded = null;
      console.warn('[frost-and-flamingos] painted view swap failed; keeping the procedural rig', error);
    }
  }

  private checkOnScreen(deltaSeconds: number): void {
    if (this.requested || this.painted) return;
    this.checkIn -= deltaSeconds;
    if (this.checkIn > 0) return;
    this.checkIn = LAZY_CHECK_INTERVAL;
    if (this.onScreen()) this.request();
  }

  get root(): TransformNode {
    return this.current.root;
  }

  update(deltaSeconds: number, pose: AvatarPose): void {
    this.lastYaw = pose.yaw;
    // Remote poses carry only parachuteState: read it the way the views do.
    const chute =
      pose.parachuteBlend ??
      (pose.parachuteState === ParachuteState.Intact || pose.parachuteState === ParachuteState.Tattered ? 1 : 0);
    this.trySwap(pose.alive, chute < 0.05);
    this.current.update(deltaSeconds, pose);
    this.checkOnScreen(deltaSeconds);
  }

  updatePreview(deltaSeconds: number, spin: number, weaponId?: WeaponId | null): void {
    this.lastYaw = spin;
    this.trySwap(true, true);
    this.current.updatePreview(deltaSeconds, spin, weaponId);
    // The wardrobe / menu preview is always on screen.
    this.request();
  }

  setEffects(partial: Partial<CharacterMaterialState>): void {
    this.effects = { ...this.effects, ...partial };
    this.current.setEffects(partial);
  }

  setPosition(position: Vec3): void {
    this.current.setPosition(position);
  }

  setYaw(yaw: number, immediate?: boolean): void {
    this.lastYaw = yaw;
    this.current.setYaw(yaw, immediate);
  }

  kick(pitch?: number): void {
    this.current.kick?.(pitch);
  }

  taunt(): void {
    this.current.taunt?.();
  }

  muzzlePosition(): Vector3 | null {
    return this.current.muzzlePosition?.() ?? null;
  }

  get isPainted(): boolean {
    return this.painted;
  }

  dispose(): void {
    this.disposed = true;
    pendingViews.delete(this);
    debugEvent(`dispose pending ${this.label}`);
    this.current.dispose();
  }
}

/**
 * Factory hook used by createAvatarView: a configurable skinned view, a
 * pending stand-in while its rig loads, or null when no rig is available.
 */
export function createPaintedAvatarView(
  scene: Scene,
  shadowMaterial: StandardMaterial,
  profile: PlayerProfile,
  priority = false,
): AvatarView | null {
  const spec = paintedModelSpec(profile);
  if (!spec) {
    debugEvent(`procedural ${shadowMaterial.name} no painted model`);
    return null;
  }
  const library = paintedModelLibrary(scene);
  const status = library.status(spec.key);
  debugEvent(`create ${shadowMaterial.name} ${spec.key} ${status}`);
  if (status === 'missing' || status === 'failed') return null;
  const asset = library.get(spec.key);
  if (asset && !asset.skinned) return null;
  const textures = spec.cosmetics === false ? library.loadedTexturesOf(spec.key) : library.loadedWardrobeTexturesOf(spec.key);
  if (asset && (textures || (spec.cosmetics !== false && !asset.wardrobe))) {
    // Same budget as the stand-in swaps: at most one painted view is built
    // per frame (N remotes joining at once queue up, one per frame).
    if (!takeSwapBudget(scene)) return new PendingPaintedView(scene, shadowMaterial, profile, { asset, textures }, priority);
    try {
      return new GlbCharacterView(scene, shadowMaterial, profile, asset, textures);
    } catch (error) {
      console.warn('[frost-and-flamingos] painted view failed; using the procedural rig', error);
      return null;
    }
  }
  return new PendingPaintedView(scene, shadowMaterial, profile, null, priority);
}

/**
 * Boot prefetch: reads the manifest and downloads the local player's painted
 * rig (and fixed-look extras' textures) before the first spawn. Every other
 * model loads lazily when its character first appears on screen. Resolves
 * once the prefetch settled.
 */
export async function preloadPaintedModels(scene: Scene, profile: PlayerProfile | null = null): Promise<void> {
  lastLibrary = paintedModelLibrary(scene);
  installGlbDebugHandle();
  const library = lastLibrary;
  await library.available();
  const spec = profile ? paintedModelSpec(profile) : null;
  if (spec && library.status(spec.key) !== 'missing') await loadAvatarModel(scene, spec.key);
}

/**
 * Model keys the client can show: listed in the manifest, registered in the
 * catalogue and not failed (after {@link preloadPaintedModels}).
 */
export function paintedModelsAvailable(scene: Scene): ReadonlySet<string> {
  const library = paintedModelLibrary(scene);
  const keys = new Set<string>();
  for (const key of Object.keys(PAINTED_MODELS)) {
    const status = library.status(key);
    if (status === 'loading' || status === 'ready') keys.add(key);
  }
  return keys;
}
