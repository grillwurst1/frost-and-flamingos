import { Color4 } from '@babylonjs/core/Maths/math';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { CreateDisc } from '@babylonjs/core/Meshes/Builders/discBuilder';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';
import type { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import type { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import {
  BACK_PALETTES,
  CLASS_STATS,
  FACE_PALETTES,
  FEET_PALETTES,
  HAIR_COLORS,
  HANDS_PALETTES,
  HEADGEAR_PALETTES,
  LEGS_PALETTES,
  ParachuteState,
  SKIN_TONES,
  TORSO_PALETTES,
  type PlayerProfile,
  type Vec3,
} from '@frost-and-flamingos/shared';
import {
  createCharacterMaterial,
  hexToColor4,
  updateCharacterMaterial,
  type CharacterMaterialState,
} from './materials';
import { mergeParts } from './mesh-utils';

const MODEL_HEIGHT = 1.88;
const SPINE_Y = 0.88;
const HEAD_Y = 0.78;
const HEAD_RADIUS = 0.21;
const EYE = hexToColor4('#10161c');
const WHITE = hexToColor4('#f7fbff');
const METAL = hexToColor4('#b9c2c9');
const DARK_METAL = hexToColor4('#5c666e');
const GOLD = hexToColor4('#e7b84d');
const BLACK = hexToColor4('#222a30');

interface MeshOptions {
  skin?: boolean;
  rotationX?: number;
  rotationY?: number;
  rotationZ?: number;
  segments?: number;
  scaleX?: number;
  scaleY?: number;
  scaleZ?: number;
}

type PartList = Mesh[];

function paint(mesh: Mesh, color: Color4, skin: boolean): Mesh {
  const tinted = skin ? new Color4(color.r, color.g, color.b, 1) : new Color4(color.r, color.g, color.b, 0);
  const vertexCount = mesh.getTotalVertices();
  const colors = new Float32Array(vertexCount * 4);
  for (let index = 0; index < vertexCount; index += 1) {
    colors[index * 4] = tinted.r;
    colors[index * 4 + 1] = tinted.g;
    colors[index * 4 + 2] = tinted.b;
    colors[index * 4 + 3] = tinted.a;
  }
  mesh.setVerticesData('color', colors, false, 4);
  mesh.isPickable = false;
  return mesh;
}

function box(
  scene: Scene,
  parts: PartList,
  name: string,
  width: number,
  height: number,
  depth: number,
  x: number,
  y: number,
  z: number,
  color: Color4,
  options: MeshOptions = {},
): Mesh {
  const mesh = CreateBox(name, { width, height, depth }, scene);
  mesh.position.set(x, y, z);
  if (options.rotationX) mesh.rotation.x = options.rotationX;
  if (options.rotationY) mesh.rotation.y = options.rotationY;
  if (options.rotationZ) mesh.rotation.z = options.rotationZ;
  if (options.scaleX || options.scaleY || options.scaleZ) {
    mesh.scaling.set(options.scaleX ?? 1, options.scaleY ?? 1, options.scaleZ ?? 1);
  }
  paint(mesh, color, options.skin ?? false);
  parts.push(mesh);
  return mesh;
}

function sphere(
  scene: Scene,
  parts: PartList,
  name: string,
  diameter: number,
  x: number,
  y: number,
  z: number,
  color: Color4,
  options: MeshOptions = {},
): Mesh {
  const mesh = CreateSphere(name, { diameter, segments: options.segments ?? 8 }, scene);
  mesh.position.set(x, y, z);
  if (options.rotationX) mesh.rotation.x = options.rotationX;
  if (options.rotationY) mesh.rotation.y = options.rotationY;
  if (options.rotationZ) mesh.rotation.z = options.rotationZ;
  if (options.scaleX || options.scaleY || options.scaleZ) {
    mesh.scaling.set(options.scaleX ?? 1, options.scaleY ?? 1, options.scaleZ ?? 1);
  }
  paint(mesh, color, options.skin ?? false);
  parts.push(mesh);
  return mesh;
}

function cylinder(
  scene: Scene,
  parts: PartList,
  name: string,
  height: number,
  top: number,
  bottom: number,
  x: number,
  y: number,
  z: number,
  color: Color4,
  options: MeshOptions = {},
): Mesh {
  const mesh = CreateCylinder(
    name,
    { height, diameterTop: top, diameterBottom: bottom, tessellation: options.segments ?? 8 },
    scene,
  );
  mesh.position.set(x, y, z);
  if (options.rotationX) mesh.rotation.x = options.rotationX;
  if (options.rotationY) mesh.rotation.y = options.rotationY;
  if (options.rotationZ) mesh.rotation.z = options.rotationZ;
  if (options.scaleX || options.scaleY || options.scaleZ) {
    mesh.scaling.set(options.scaleX ?? 1, options.scaleY ?? 1, options.scaleZ ?? 1);
  }
  paint(mesh, color, options.skin ?? false);
  parts.push(mesh);
  return mesh;
}

function torus(
  scene: Scene,
  parts: PartList,
  name: string,
  diameter: number,
  thickness: number,
  x: number,
  y: number,
  z: number,
  color: Color4,
  options: MeshOptions = {},
): Mesh {
  const mesh = CreateTorus(
    name,
    { diameter, thickness, tessellation: options.segments ?? 12 },
    scene,
  );
  mesh.position.set(x, y, z);
  if (options.rotationX) mesh.rotation.x = options.rotationX;
  if (options.rotationY) mesh.rotation.y = options.rotationY;
  if (options.rotationZ) mesh.rotation.z = options.rotationZ;
  paint(mesh, color, options.skin ?? false);
  parts.push(mesh);
  return mesh;
}

function disc(
  scene: Scene,
  parts: PartList,
  name: string,
  diameter: number,
  x: number,
  y: number,
  z: number,
  color: Color4,
  options: MeshOptions = {},
): Mesh {
  const mesh = CreateDisc(name, { radius: diameter / 2, tessellation: options.segments ?? 12 }, scene);
  mesh.position.set(x, y, z);
  if (options.rotationX) mesh.rotation.x = options.rotationX;
  if (options.rotationY) mesh.rotation.y = options.rotationY;
  if (options.rotationZ) mesh.rotation.z = options.rotationZ;
  paint(mesh, color, options.skin ?? false);
  parts.push(mesh);
  return mesh;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

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

export interface CharacterPose {
  position: Vec3;
  velocity: Vec3;
  yaw: number;
  grounded: boolean;
  alive: boolean;
  crouched?: boolean;
  crouchBlend?: number;
  swimming?: boolean;
  sprinting?: boolean;
  rolling?: boolean;
  parachuteState?: ParachuteState;
  parachuteBlend?: number;
  parachuteSway?: number;
}

/**
 * Fully procedural 7-slot character rig. The body, hair, face, headgear and
 * back item are merged into one mesh; each arm and leg stays a separate mesh
 * so the whole avatar renders in five draw calls.
 */
export class CharacterView {
  readonly root: TransformNode;
  readonly material: ShaderMaterial;
  private readonly scene: Scene;
  private readonly spine: TransformNode;
  private readonly leftHip: TransformNode;
  private readonly rightHip: TransformNode;
  private readonly leftShoulder: TransformNode;
  private readonly rightShoulder: TransformNode;
  private readonly shadow: Mesh;
  private readonly shadowMaterial: StandardMaterial;
  private readonly canopyPivot: TransformNode;
  private readonly canopy: Mesh | null;
  private readonly stats;
  private walkPhase = 0;
  private yaw = 0;
  private bodyBob = 0;
  private rollPhase = 0;
  private effects: CharacterMaterialState = { battleDamage: 0, charred: 0, frozen: 0 };
  private disposed = false;

  constructor(
    scene: Scene,
    shadowMaterial: StandardMaterial,
    profile: PlayerProfile,
  ) {
    this.scene = scene;
    this.shadowMaterial = shadowMaterial;
    this.stats = CLASS_STATS[profile.cosmetics.classId];
    const cosmetics = profile.cosmetics;
    const skinHex = SKIN_TONES[cosmetics.skinToneIndex] ?? SKIN_TONES[0];
    const hairHex = HAIR_COLORS[cosmetics.hairColorIndex] ?? HAIR_COLORS[0];
    const bodyType = Math.min(1, Math.max(0, cosmetics.bodyType));
    const shoulderWidth = lerp(0.62, 0.5, bodyType);
    const hipWidth = lerp(0.34, 0.46, bodyType);
    const waistWidth = lerp(0.46, 0.38, bodyType);
    const chestDepth = lerp(0.34, 0.3, bodyType);

    this.material = createCharacterMaterial(scene, `character-${profile.displayName}`, skinHex);
    this.root = new TransformNode('character-root', scene);
    this.root.scaling.setAll(this.stats.height / MODEL_HEIGHT);

    this.spine = new TransformNode('character-spine', scene);
    this.spine.parent = this.root;
    this.spine.position.y = SPINE_Y;

    const body: PartList = [];
    const torsoPalette = TORSO_PALETTES[cosmetics.torso];
    const torsoPrimary = hexToColor4(torsoPalette.primary);
    const torsoSecondary = hexToColor4(torsoPalette.secondary);
    const torsoAccent = hexToColor4(torsoPalette.accent);
    const skinColor = hexToColor4(skinHex);
    const sleeve = this.sleeveColor(cosmetics.torso, torsoPrimary, WHITE, skinColor);
    const bareArms =
      cosmetics.torso === 'torso_bare_suspenders' ||
      cosmetics.torso === 'torso_flamingo_ring' ||
      cosmetics.torso === 'torso_barrel_armor';

    // Torso silhouette morphs continuously with bodyType.
    box(scene, body, 'chest', shoulderWidth * 0.88, 0.36, chestDepth, 0, 0.36, 0, torsoPrimary);
    box(scene, body, 'waist', waistWidth, 0.24, chestDepth * 0.9, 0, 0.1, 0, torsoPrimary);
    box(scene, body, 'hip', hipWidth + 0.05, 0.18, chestDepth * 0.92, 0, -0.04, 0, torsoPrimary);
    cylinder(scene, body, 'neck', 0.14, 0.16, 0.18, 0, 0.6, 0, skinColor, { skin: true });

    // Head, face and ears.
    sphere(scene, body, 'head', HEAD_RADIUS * 2, 0, HEAD_Y, 0, skinColor, {
      skin: true,
      segments: 12,
      scaleY: 1.06,
      scaleZ: 0.98,
    });
    sphere(scene, body, 'ear-left', 0.085, -HEAD_RADIUS * 0.98, HEAD_Y, 0, skinColor, {
      skin: true,
      segments: 6,
    });
    sphere(scene, body, 'ear-right', 0.085, HEAD_RADIUS * 0.98, HEAD_Y, 0, skinColor, {
      skin: true,
      segments: 6,
    });
    sphere(scene, body, 'eye-left', 0.072, -0.078, HEAD_Y + 0.035, 0.185, WHITE, { segments: 6 });
    sphere(scene, body, 'eye-right', 0.072, 0.078, HEAD_Y + 0.035, 0.185, WHITE, { segments: 6 });
    sphere(scene, body, 'pupil-left', 0.038, -0.078, HEAD_Y + 0.035, 0.218, EYE, { segments: 6 });
    sphere(scene, body, 'pupil-right', 0.038, 0.078, HEAD_Y + 0.035, 0.218, EYE, { segments: 6 });
    sphere(scene, body, 'glint-left', 0.014, -0.09, HEAD_Y + 0.052, 0.233, WHITE, { segments: 5 });
    sphere(scene, body, 'glint-right', 0.014, 0.066, HEAD_Y + 0.052, 0.233, WHITE, { segments: 5 });
    box(scene, body, 'brow-left', 0.09, 0.026, 0.03, -0.08, HEAD_Y + 0.105, 0.2, EYE, {
      rotationZ: -0.12,
    });
    box(scene, body, 'brow-right', 0.09, 0.026, 0.03, 0.08, HEAD_Y + 0.105, 0.2, EYE, {
      rotationZ: 0.12,
    });
    sphere(scene, body, 'nose', 0.082, 0, HEAD_Y - 0.015, 0.205, skinColor, {
      skin: true,
      segments: 6,
    });
    box(scene, body, 'mouth', 0.085, 0.018, 0.012, 0, HEAD_Y - 0.105, 0.2, EYE);
    box(scene, body, 'chin', 0.11, 0.035, 0.03, 0, HEAD_Y - 0.15, 0.175, skinColor, { skin: true });

    this.buildTorsoDetails(scene, body, cosmetics.torso, {
      torsoPrimary,
      torsoSecondary,
      torsoAccent,
      skinColor,
      chestDepth,
      shoulderWidth,
      waistWidth,
    });
    this.buildBackItem(scene, body, cosmetics.back);
    this.buildFace(scene, body, cosmetics.face, HEAD_Y, skinColor, hairHex);
    this.buildHair(scene, body, cosmetics.hairStyleIndex, HEAD_Y, hairHex);
    this.buildHeadgear(scene, body, cosmetics.headgear, HEAD_Y, hairHex);

    const bodyMesh = mergeParts(scene, 'character-body-mesh', body, this.material);
    if (bodyMesh) {
      bodyMesh.parent = this.spine;
      bodyMesh.position.set(0, 0, 0);
    }

    this.leftShoulder = new TransformNode('left-shoulder', scene);
    this.leftShoulder.parent = this.spine;
    this.leftShoulder.position.set(-shoulderWidth / 2 - 0.02, 0.49, 0);
    this.rightShoulder = new TransformNode('right-shoulder', scene);
    this.rightShoulder.parent = this.spine;
    this.rightShoulder.position.set(shoulderWidth / 2 + 0.02, 0.49, 0);

    this.leftShoulder.rotation.z = 0.07;
    this.rightShoulder.rotation.z = -0.07;

    const leftArm = this.buildArm(scene, cosmetics.hands, sleeve, skinColor, bareArms, 'left');
    leftArm.parent = this.leftShoulder;
    const rightArm = this.buildArm(scene, cosmetics.hands, sleeve, skinColor, bareArms, 'right');
    rightArm.parent = this.rightShoulder;

    this.leftHip = new TransformNode('left-hip', scene);
    this.leftHip.parent = this.root;
    this.leftHip.position.set(-hipWidth / 2, 0.86, 0);
    this.rightHip = new TransformNode('right-hip', scene);
    this.rightHip.parent = this.root;
    this.rightHip.position.set(hipWidth / 2, 0.86, 0);

    const leftLeg = this.buildLeg(scene, cosmetics.legs, cosmetics.feet, skinColor, 'left');
    leftLeg.parent = this.leftHip;
    const rightLeg = this.buildLeg(scene, cosmetics.legs, cosmetics.feet, skinColor, 'right');
    rightLeg.parent = this.rightHip;

    this.shadow = CreateDisc('character-shadow', { radius: 0.55, tessellation: 20 }, scene);
    this.shadow.rotation.x = Math.PI / 2;
    this.shadow.position.y = 0.02;
    this.shadow.material = shadowMaterial;
    this.shadow.isPickable = false;
    this.shadow.parent = this.root;
    this.shadow.alphaIndex = 0;

    this.canopyPivot = new TransformNode('character-canopy-pivot', scene);
    this.canopyPivot.parent = this.root;
    this.canopyPivot.position.y = 1.15;
    this.canopy = this.buildCanopy(scene, profile);
    this.canopyPivot.setEnabled(false);
  }

  private buildCanopy(scene: Scene, profile: PlayerProfile): Mesh | null {
    const parts: PartList = [];
    const alpine = profile.faction === 'alpine';
    const primary = hexToColor4(alpine ? '#eef8ff' : '#3bd3bf');
    const secondary = hexToColor4(alpine ? '#ff6b5e' : '#ffd166');
    const trim = hexToColor4(alpine ? '#7dcbe9' : '#eafaff');
    const cord = hexToColor4('#d8e6ee');
    const harness = hexToColor4('#22303a');

    cylinder(scene, parts, 'canopy-skirt', 0.75, 1.4, 3.25, 0, 1.55, 0, secondary, {
      segments: 16,
    });
    sphere(scene, parts, 'canopy-dome', 3.25, 0, 1.84, 0, primary, {
      segments: 16,
      scaleY: 0.34,
    });
    torus(scene, parts, 'canopy-rim', 3.3, 0.065, 0, 1.2, 0, trim, { segments: 20 });
    for (const [x, z] of [
      [-1.35, -0.34],
      [1.35, -0.34],
      [-1.35, 0.34],
      [1.35, 0.34],
    ] as const) {
      cylinder(scene, parts, 'canopy-cord', 1.0, 0.026, 0.026, x, 0.7, z, cord, {
        segments: 5,
      });
    }
    torus(scene, parts, 'canopy-harness', 0.72, 0.06, 0, 0.02, 0, harness, { segments: 12 });

    const merged = mergeParts(scene, 'character-canopy-mesh', parts, this.material);
    if (merged) {
      merged.parent = this.canopyPivot;
      merged.position.set(0, 0, 0);
    }
    return merged;
  }

  private sleeveColor(
    torso: PlayerProfile['cosmetics']['torso'],
    primary: Color4,
    white: Color4,
    skin: Color4,
  ): Color4 {
    if (torso === 'torso_dirndl_vest') return white;
    if (torso === 'torso_bare_suspenders' || torso === 'torso_flamingo_ring') return skin;
    if (torso === 'torso_barrel_armor') return skin;
    if (torso === 'torso_bathrobe') return primary;
    return primary;
  }

  private buildTorsoDetails(
    scene: Scene,
    body: PartList,
    torso: PlayerProfile['cosmetics']['torso'],
    palette: {
      torsoPrimary: Color4;
      torsoSecondary: Color4;
      torsoAccent: Color4;
      skinColor: Color4;
      chestDepth: number;
      shoulderWidth: number;
      waistWidth: number;
    },
  ): void {
    const { torsoPrimary, torsoSecondary, torsoAccent, skinColor, chestDepth, shoulderWidth, waistWidth } = palette;
    const front = chestDepth / 2 + 0.012;

    if (torso === 'torso_tracht_shirt') {
      box(scene, body, 'tracht-placket', 0.07, 0.33, 0.02, 0, 0.36, front, torsoSecondary);
      for (let button = 0; button < 3; button += 1) {
        sphere(scene, body, 'tracht-button', 0.035, 0, 0.25 + button * 0.1, front + 0.012, torsoAccent, {
          segments: 5,
        });
      }
      box(scene, body, 'tracht-collar', 0.2, 0.05, 0.04, 0, 0.53, front, torsoAccent);
      box(scene, body, 'tracht-suspenders-left', 0.035, 0.36, 0.02, -0.14, 0.35, front, torsoSecondary);
      box(scene, body, 'tracht-suspenders-right', 0.035, 0.36, 0.02, 0.14, 0.35, front, torsoSecondary);
    } else if (torso === 'torso_dirndl_vest') {
      box(scene, body, 'dirndl-blouse', shoulderWidth * 0.8, 0.34, chestDepth + 0.01, 0, 0.37, 0, WHITE);
      box(scene, body, 'dirndl-vest-left', 0.16, 0.32, 0.025, -0.12, 0.34, front, torsoPrimary);
      box(scene, body, 'dirndl-vest-right', 0.16, 0.32, 0.025, 0.12, 0.34, front, torsoPrimary);
      box(scene, body, 'dirndl-lace', 0.12, 0.04, 0.03, 0, 0.48, front + 0.01, torsoAccent);
      box(scene, body, 'dirndl-apron', waistWidth * 0.7, 0.22, 0.025, 0, 0.05, front, torsoSecondary);
    } else if (torso === 'torso_loden_coat') {
      box(scene, body, 'loden-lapel-left', 0.1, 0.34, 0.025, -0.1, 0.38, front, torsoSecondary, {
        rotationZ: 0.16,
      });
      box(scene, body, 'loden-lapel-right', 0.1, 0.34, 0.025, 0.1, 0.38, front, torsoSecondary, {
        rotationZ: -0.16,
      });
      for (let button = 0; button < 3; button += 1) {
        sphere(scene, body, 'loden-button', 0.032, 0.02, 0.2 + button * 0.11, front + 0.014, GOLD, {
          segments: 5,
        });
      }
      box(scene, body, 'loden-belt', waistWidth + 0.02, 0.07, chestDepth + 0.02, 0, 0.03, 0, torsoSecondary);
    } else if (torso === 'torso_hawaii_shirt') {
      for (let flower = 0; flower < 5; flower += 1) {
        const angle = (flower / 5) * Math.PI * 2;
        sphere(
          scene,
          body,
          'hawaii-flower',
          0.09,
          Math.cos(angle) * 0.17,
          0.26 + (flower % 3) * 0.11,
          front + 0.008,
          flower % 2 === 0 ? torsoSecondary : torsoAccent,
          { segments: 5, scaleZ: 0.35 },
        );
      }
      box(scene, body, 'hawaii-collar', 0.24, 0.05, 0.04, 0, 0.53, front, WHITE);
    } else if (torso === 'torso_flamingo_ring') {
      torus(scene, body, 'flamingo-ring', 0.56, 0.11, 0, 0.12, 0, torsoPrimary, {
        rotationX: Math.PI / 2,
        segments: 16,
      });
      sphere(scene, body, 'flamingo-head', 0.16, 0.31, 0.2, 0.14, torsoPrimary, { segments: 7 });
      cylinder(scene, body, 'flamingo-neck', 0.16, 0.06, 0.07, 0.31, 0.13, 0.14, torsoPrimary, {
        segments: 6,
      });
      box(scene, body, 'flamingo-beak', 0.09, 0.045, 0.12, 0.31, 0.18, 0.24, torsoSecondary);
    } else if (torso === 'torso_bathrobe') {
      box(scene, body, 'bathrobe-lapel-left', 0.11, 0.4, 0.025, -0.1, 0.35, front, WHITE, {
        rotationZ: 0.1,
      });
      box(scene, body, 'bathrobe-lapel-right', 0.11, 0.4, 0.025, 0.1, 0.35, front, WHITE, {
        rotationZ: -0.1,
      });
      box(scene, body, 'bathrobe-belt', waistWidth + 0.04, 0.06, chestDepth + 0.03, 0, 0.05, 0, torsoAccent);
      sphere(scene, body, 'bathrobe-belt-knot', 0.09, 0.16, 0.05, front + 0.02, torsoAccent, {
        segments: 5,
      });
    } else if (torso === 'torso_bare_suspenders') {
      // The torso itself is skin. Redraw the chest and waist with the skin mask.
      box(scene, body, 'bare-chest', shoulderWidth * 0.86, 0.34, chestDepth + 0.005, 0, 0.37, 0, skinColor, {
        skin: true,
      });
      box(scene, body, 'bare-waist', waistWidth * 0.98, 0.22, chestDepth * 0.92, 0, 0.1, 0, skinColor, {
        skin: true,
      });
      box(scene, body, 'suspender-left', 0.04, 0.42, 0.025, -0.14, 0.32, front, torsoSecondary);
      box(scene, body, 'suspender-right', 0.04, 0.42, 0.025, 0.14, 0.32, front, torsoSecondary);
    } else if (torso === 'torso_barrel_armor') {
      for (let slat = 0; slat < 7; slat += 1) {
        const angle = (slat / 7) * Math.PI * 2;
        box(
          scene,
          body,
          'barrel-slat',
          0.1,
          0.46,
          0.04,
          Math.sin(angle) * (waistWidth / 2 + 0.03),
          0.2,
          Math.cos(angle) * (chestDepth / 2 + 0.03),
          torsoPrimary,
          { rotationY: angle },
        );
      }
      torus(scene, body, 'barrel-hoop-top', waistWidth + 0.11, 0.035, 0, 0.36, 0, torsoAccent, {
        rotationX: Math.PI / 2,
        segments: 14,
      });
      torus(scene, body, 'barrel-hoop-bottom', waistWidth + 0.09, 0.035, 0, 0.05, 0, torsoAccent, {
        rotationX: Math.PI / 2,
        segments: 14,
      });
    }
  }

  private buildBackItem(scene: Scene, body: PartList, back: PlayerProfile['cosmetics']['back']): void {
    if (back === 'back_none') return;
    const palette = BACK_PALETTES[back];
    const primary = hexToColor4(palette.primary);
    const secondary = hexToColor4(palette.secondary);
    const accent = hexToColor4(palette.accent);
    const backZ = -0.23;

    if (back === 'back_cuckoo_clock') {
      box(scene, body, 'cuckoo-house', 0.34, 0.42, 0.14, 0, 0.28, backZ, primary);
      box(scene, body, 'cuckoo-roof', 0.42, 0.1, 0.2, 0, 0.54, backZ, secondary, {
        rotationZ: Math.PI / 4,
      });
      disc(scene, body, 'cuckoo-face', 0.18, 0, 0.31, backZ - 0.075, WHITE, {
        rotationY: Math.PI,
        segments: 14,
      });
      box(scene, body, 'cuckoo-hand', 0.012, 0.07, 0.012, 0, 0.34, backZ - 0.09, BLACK);
      box(scene, body, 'cuckoo-pendulum', 0.02, 0.16, 0.02, 0, 0.08, backZ - 0.08, GOLD);
      sphere(scene, body, 'cuckoo-bob', 0.07, 0, -0.01, backZ - 0.08, accent, { segments: 5 });
      box(scene, body, 'cuckoo-door', 0.1, 0.1, 0.02, 0, 0.42, backZ - 0.08, secondary);
    } else if (back === 'back_leather_pack') {
      box(scene, body, 'leather-pack', 0.36, 0.36, 0.16, 0, 0.28, backZ, primary);
      box(scene, body, 'leather-flap', 0.38, 0.12, 0.18, 0, 0.43, backZ, secondary);
      box(scene, body, 'leather-strap-left', 0.05, 0.4, 0.05, -0.16, 0.32, backZ + 0.04, secondary);
      box(scene, body, 'leather-strap-right', 0.05, 0.4, 0.05, 0.16, 0.32, backZ + 0.04, secondary);
      box(scene, body, 'leather-buckle', 0.08, 0.06, 0.02, 0, 0.33, backZ - 0.09, accent);
    } else if (back === 'back_lifebuoy') {
      torus(scene, body, 'lifebuoy', 0.46, 0.1, 0, 0.28, backZ, primary, {
        rotationY: Math.PI / 2,
        segments: 16,
      });
      for (let stripe = 0; stripe < 4; stripe += 1) {
        const angle = (stripe / 4) * Math.PI * 2;
        box(
          scene,
          body,
          'lifebuoy-stripe',
          0.1,
          0.06,
          0.02,
          Math.sin(angle) * 0.19,
          0.28 + Math.cos(angle) * 0.19,
          backZ - 0.05,
          secondary,
          { rotationZ: -angle },
        );
      }
    } else if (back === 'back_surfboard') {
      box(scene, body, 'surfboard', 0.3, 0.9, 0.06, 0, 0.28, backZ - 0.04, primary, {
        rotationZ: 0.18,
        scaleY: 1,
      });
      box(scene, body, 'surfboard-stripe', 0.06, 0.86, 0.065, 0, 0.28, backZ - 0.05, secondary, {
        rotationZ: 0.18,
      });
      box(scene, body, 'surfboard-fin', 0.08, 0.12, 0.04, -0.1, -0.18, backZ - 0.06, accent);
    } else if (back === 'back_mini_bbq') {
      box(scene, body, 'bbq-body', 0.34, 0.2, 0.2, 0, 0.22, backZ - 0.02, primary);
      box(scene, body, 'bbq-grill', 0.38, 0.04, 0.24, 0, 0.34, backZ - 0.02, DARK_METAL);
      for (let bar = 0; bar < 4; bar += 1) {
        box(scene, body, 'bbq-bar', 0.36, 0.012, 0.02, 0, 0.36, backZ - 0.09 + bar * 0.045, METAL);
      }
      box(scene, body, 'bbq-leg-left', 0.03, 0.2, 0.03, -0.11, 0.05, backZ, secondary, {
        rotationZ: 0.16,
      });
      box(scene, body, 'bbq-leg-right', 0.03, 0.2, 0.03, 0.11, 0.05, backZ, secondary, {
        rotationZ: -0.16,
      });
      sphere(scene, body, 'bbq-sausage', 0.07, 0.08, 0.37, backZ - 0.04, accent, {
        segments: 5,
        scaleX: 2.2,
        rotationZ: Math.PI / 2,
      });
    }
  }

  private buildFace(
    scene: Scene,
    body: PartList,
    face: PlayerProfile['cosmetics']['face'],
    headY: number,
    skin: Color4,
    hair: string,
  ): void {
    if (face === 'face_none') return;
    const palette = FACE_PALETTES[face];
    const primary = hexToColor4(palette.primary);
    const secondary = hexToColor4(palette.secondary);
    const accent = hexToColor4(palette.accent);
    const hairColor = hexToColor4(hair);

    if (face === 'face_full_beard') {
      box(scene, body, 'beard-jaw', 0.3, 0.18, 0.12, 0, headY - 0.14, 0.13, hairColor);
      box(scene, body, 'beard-chin', 0.18, 0.16, 0.1, 0, headY - 0.24, 0.12, hairColor);
      box(scene, body, 'beard-left', 0.08, 0.18, 0.1, -0.13, headY - 0.08, 0.14, hairColor);
      box(scene, body, 'beard-right', 0.08, 0.18, 0.1, 0.13, headY - 0.08, 0.14, hairColor);
      box(scene, body, 'beard-mustache', 0.16, 0.04, 0.04, 0, headY - 0.055, 0.21, hairColor);
    } else if (face === 'face_mustache') {
      cylinder(scene, body, 'mustache-left', 0.16, 0.025, 0.035, -0.07, headY - 0.045, 0.205, hairColor, {
        rotationZ: Math.PI / 2.4,
        segments: 5,
      });
      cylinder(scene, body, 'mustache-right', 0.16, 0.025, 0.035, 0.07, headY - 0.045, 0.205, hairColor, {
        rotationZ: -Math.PI / 2.4,
        segments: 5,
      });
    } else if (face === 'face_icicle_beard') {
      for (let icicle = 0; icicle < 5; icicle += 1) {
        cylinder(
          scene,
          body,
          'icicle-beard',
          0.12 + (icicle % 2) * 0.06,
          0,
          0.055,
          -0.12 + icicle * 0.06,
          headY - 0.18 - (icicle % 2) * 0.03,
          0.17,
          icicle % 2 === 0 ? primary : secondary,
          { segments: 5 },
        );
      }
      box(scene, body, 'ice-mustache', 0.16, 0.03, 0.03, 0, headY - 0.05, 0.21, primary);
    } else if (face === 'face_bubble_pipe') {
      cylinder(scene, body, 'pipe-stem', 0.16, 0.022, 0.022, 0.09, headY - 0.09, 0.2, primary, {
        rotationZ: Math.PI / 2.8,
        segments: 5,
      });
      cylinder(scene, body, 'pipe-bowl', 0.08, 0.07, 0.05, 0.16, headY - 0.03, 0.2, secondary, {
        segments: 6,
      });
      sphere(scene, body, 'pipe-bubble-one', 0.07, 0.2, headY + 0.06, 0.2, accent, {
        segments: 6,
      });
      sphere(scene, body, 'pipe-bubble-two', 0.045, 0.24, headY + 0.14, 0.22, accent, {
        segments: 6,
      });
    } else if (face === 'face_snorkel_mask') {
      box(scene, body, 'snorkel-mask', 0.25, 0.12, 0.06, 0, headY + 0.03, 0.21, primary);
      box(scene, body, 'snorkel-glass', 0.2, 0.08, 0.02, 0, headY + 0.03, 0.24, secondary);
      cylinder(scene, body, 'snorkel-tube', 0.36, 0.03, 0.03, 0.16, headY + 0.14, 0.12, accent, {
        segments: 6,
      });
      cylinder(scene, body, 'snorkel-top', 0.06, 0.045, 0.045, 0.16, headY + 0.33, 0.12, accent, {
        segments: 6,
        rotationX: Math.PI / 2,
      });
    } else if (face === 'face_eyepatch_beard') {
      box(scene, body, 'eyepatch', 0.1, 0.075, 0.02, -0.078, headY + 0.035, 0.235, primary);
      box(scene, body, 'eyepatch-strap', 0.42, 0.022, 0.02, 0, headY + 0.06, 0.1, primary);
      box(scene, body, 'eyepatch-beard', 0.26, 0.2, 0.12, 0, headY - 0.16, 0.13, secondary);
      box(scene, body, 'eyepatch-mustache', 0.15, 0.04, 0.04, 0, headY - 0.06, 0.21, secondary);
    } else if (face === 'face_flamingo_shades') {
      box(scene, body, 'shades-frame', 0.28, 0.065, 0.025, 0, headY + 0.035, 0.225, secondary);
      box(scene, body, 'shades-lens-left', 0.11, 0.055, 0.02, -0.075, headY + 0.035, 0.24, primary);
      box(scene, body, 'shades-lens-right', 0.11, 0.055, 0.02, 0.075, headY + 0.035, 0.24, primary);
      box(scene, body, 'shades-arm-left', 0.02, 0.02, 0.18, -0.16, headY + 0.04, 0.12, secondary);
      box(scene, body, 'shades-arm-right', 0.02, 0.02, 0.18, 0.16, headY + 0.04, 0.12, secondary);
    } else if (face === 'face_sunscreen') {
      box(scene, body, 'sunscreen-nose', 0.055, 0.09, 0.02, 0, headY - 0.01, 0.245, primary);
      box(scene, body, 'sunscreen-cheek-left', 0.06, 0.03, 0.02, -0.11, headY - 0.02, 0.215, secondary);
      box(scene, body, 'sunscreen-cheek-right', 0.06, 0.03, 0.02, 0.11, headY - 0.02, 0.215, secondary);
      sphere(scene, body, 'sunscreen-dot', 0.025, 0, headY + 0.1, 0.225, accent, { segments: 5 });
    }
  }

  private buildHair(
    scene: Scene,
    body: PartList,
    styleIndex: number,
    headY: number,
    hairHex: string,
  ): void {
    if (styleIndex === 6) return;
    const hair = hexToColor4(hairHex);
    const dark = new Color4(hair.r * 0.7, hair.g * 0.7, hair.b * 0.7, 0);

    if (styleIndex === 0) {
      sphere(scene, body, 'hair-buzz', 0.43, 0, headY + 0.1, -0.01, hair, {
        scaleY: 0.48,
        segments: 10,
      });
    } else if (styleIndex === 1) {
      sphere(scene, body, 'hair-afro', 0.56, 0, headY + 0.16, -0.02, hair, {
        segments: 10,
        scaleY: 0.9,
      });
      sphere(scene, body, 'hair-afro-side-left', 0.2, -0.2, headY + 0.02, 0, hair, { segments: 6 });
      sphere(scene, body, 'hair-afro-side-right', 0.2, 0.2, headY + 0.02, 0, hair, { segments: 6 });
    } else if (styleIndex === 2) {
      sphere(scene, body, 'hair-cap', 0.44, 0, headY + 0.1, -0.01, hair, {
        scaleY: 0.55,
        segments: 10,
      });
      for (let lock = 0; lock < 5; lock += 1) {
        const offset = -0.16 + lock * 0.08;
        box(scene, body, 'hair-wave', 0.07, 0.42 + (lock % 2) * 0.1, 0.06, offset, headY - 0.18, -0.14, hair, {
          rotationZ: offset * 0.6,
        });
      }
      box(scene, body, 'hair-wave-left', 0.08, 0.34, 0.06, -0.2, headY - 0.1, 0.02, hair, {
        rotationZ: 0.12,
      });
      box(scene, body, 'hair-wave-right', 0.08, 0.34, 0.06, 0.2, headY - 0.1, 0.02, hair, {
        rotationZ: -0.12,
      });
    } else if (styleIndex === 3) {
      sphere(scene, body, 'hair-cap', 0.44, 0, headY + 0.1, -0.01, hair, {
        scaleY: 0.55,
        segments: 10,
      });
      for (let braid = 0; braid < 2; braid += 1) {
        const x = braid === 0 ? -0.17 : 0.17;
        for (let knot = 0; knot < 4; knot += 1) {
          sphere(scene, body, 'braid-knot', 0.09, x + Math.sin(knot) * 0.02, headY - 0.02 - knot * 0.1, -0.08, knot % 2 === 0 ? hair : dark, {
            segments: 6,
          });
        }
        sphere(scene, body, 'braid-tie', 0.06, x, headY - 0.4, -0.08, GOLD, { segments: 5 });
      }
    } else if (styleIndex === 4) {
      sphere(scene, body, 'hair-cap', 0.44, 0, headY + 0.1, -0.01, hair, {
        scaleY: 0.55,
        segments: 10,
      });
      sphere(scene, body, 'ponytail-base', 0.14, 0, headY + 0.14, -0.19, hair, { segments: 6 });
      cylinder(scene, body, 'ponytail', 0.34, 0.08, 0.13, 0, headY - 0.02, -0.23, hair, {
        rotationX: -0.4,
        segments: 6,
      });
      sphere(scene, body, 'ponytail-tip', 0.1, 0, headY - 0.19, -0.28, dark, { segments: 6 });
    } else if (styleIndex === 5) {
      sphere(scene, body, 'hair-cap', 0.44, 0, headY + 0.1, -0.01, hair, {
        scaleY: 0.55,
        segments: 10,
      });
      box(scene, body, 'pompadour', 0.3, 0.16, 0.2, 0, headY + 0.24, 0.05, hair, {
        rotationX: -0.18,
        rotationZ: 0.04,
      });
      sphere(scene, body, 'pompadour-curl', 0.18, 0.02, headY + 0.3, 0.12, dark, {
        segments: 6,
        scaleY: 0.7,
      });
    }
  }

  private buildHeadgear(
    scene: Scene,
    body: PartList,
    headgear: PlayerProfile['cosmetics']['headgear'],
    headY: number,
    hairHex: string,
  ): void {
    if (headgear === 'head_none') return;
    const palette = HEADGEAR_PALETTES[headgear];
    const primary = hexToColor4(palette.primary);
    const secondary = hexToColor4(palette.secondary);
    const accent = hexToColor4(palette.accent);

    if (headgear === 'head_tirol') {
      cylinder(scene, body, 'tirol-brim', 0.05, 0.62, 0.62, 0, headY + 0.18, 0, primary, {
        segments: 14,
      });
      cylinder(scene, body, 'tirol-crown', 0.18, 0.28, 0.36, 0, headY + 0.29, 0, primary, {
        segments: 10,
      });
      cylinder(scene, body, 'tirol-band', 0.06, 0.37, 0.37, 0, headY + 0.22, 0, secondary, {
        segments: 12,
      });
      box(scene, body, 'tirol-feather', 0.05, 0.24, 0.02, 0.2, headY + 0.33, 0.05, accent, {
        rotationZ: -0.5,
      });
    } else if (headgear === 'head_fondue_pot') {
      cylinder(scene, body, 'fondue-pot', 0.24, 0.38, 0.44, 0, headY + 0.24, 0, primary, {
        segments: 12,
      });
      cylinder(scene, body, 'fondue-rim', 0.05, 0.47, 0.47, 0, headY + 0.36, 0, secondary, {
        segments: 14,
      });
      torus(scene, body, 'fondue-handle-left', 0.14, 0.035, -0.23, headY + 0.27, 0, secondary, {
        rotationY: Math.PI / 2,
        segments: 8,
      });
      torus(scene, body, 'fondue-handle-right', 0.14, 0.035, 0.23, headY + 0.27, 0, secondary, {
        rotationY: Math.PI / 2,
        segments: 8,
      });
      sphere(scene, body, 'fondue-knob', 0.08, 0, headY + 0.41, 0, accent, { segments: 6 });
    } else if (headgear === 'head_marmot_fur') {
      sphere(scene, body, 'fur-cap', 0.5, 0, headY + 0.17, -0.01, primary, {
        scaleY: 0.62,
        segments: 10,
      });
      cylinder(scene, body, 'fur-tail', 0.28, 0.04, 0.09, 0.16, headY + 0.08, -0.2, secondary, {
        rotationX: -0.7,
        segments: 6,
      });
      sphere(scene, body, 'fur-tail-tip', 0.08, 0.18, headY - 0.03, -0.3, accent, { segments: 5 });
    } else if (headgear === 'head_captain_cap') {
      cylinder(scene, body, 'captain-crown', 0.16, 0.4, 0.44, 0, headY + 0.28, 0, primary, {
        segments: 12,
      });
      cylinder(scene, body, 'captain-band', 0.07, 0.45, 0.45, 0, headY + 0.21, 0, secondary, {
        segments: 14,
      });
      box(scene, body, 'captain-peak', 0.36, 0.04, 0.2, 0, headY + 0.19, 0.18, BLACK, {
        rotationX: -0.08,
      });
      disc(scene, body, 'captain-badge', 0.1, 0, headY + 0.27, 0.22, accent, { segments: 8 });
    } else if (headgear === 'head_watermelon') {
      sphere(scene, body, 'melon-rind', 0.5, 0, headY + 0.18, 0, primary, {
        scaleY: 0.62,
        segments: 10,
      });
      box(scene, body, 'melon-flesh', 0.34, 0.07, 0.16, 0, headY + 0.19, 0.2, secondary);
      for (let seed = 0; seed < 3; seed += 1) {
        sphere(scene, body, 'melon-seed', 0.025, -0.1 + seed * 0.1, headY + 0.21, 0.28, accent, {
          segments: 4,
        });
      }
    } else if (headgear === 'head_flamingo_hat') {
      sphere(scene, body, 'flamingo-hat-body', 0.24, 0, headY + 0.32, 0, primary, {
        segments: 8,
        scaleX: 1.2,
      });
      cylinder(scene, body, 'flamingo-hat-neck', 0.24, 0.06, 0.08, 0.14, headY + 0.42, 0, primary, {
        rotationZ: -0.35,
        segments: 6,
      });
      sphere(scene, body, 'flamingo-hat-head', 0.14, 0.24, headY + 0.54, 0, primary, { segments: 6 });
      box(scene, body, 'flamingo-hat-beak', 0.12, 0.05, 0.1, 0.32, headY + 0.53, 0.02, secondary);
      sphere(scene, body, 'flamingo-hat-eye', 0.02, 0.28, headY + 0.57, 0.06, EYE, { segments: 4 });
    } else if (headgear === 'head_diving_bell') {
      sphere(scene, body, 'diving-bell', 0.54, 0, headY + 0.2, 0, primary, {
        scaleY: 0.9,
        segments: 12,
      });
      cylinder(scene, body, 'diving-collar', 0.1, 0.5, 0.56, 0, headY - 0.03, 0, secondary, {
        segments: 14,
      });
      disc(scene, body, 'diving-window', 0.2, 0, headY + 0.23, 0.25, accent, { segments: 10 });
      torus(scene, body, 'diving-window-ring', 0.22, 0.025, 0, headY + 0.23, 0.26, secondary, {
        segments: 10,
      });
      sphere(scene, body, 'diving-bolt-left', 0.06, -0.27, headY + 0.2, 0, secondary, { segments: 5 });
      sphere(scene, body, 'diving-bolt-right', 0.06, 0.27, headY + 0.2, 0, secondary, { segments: 5 });
    }

    // A few hats intentionally show a tuft of hair at the back.
    if (headgear !== 'head_diving_bell' && headgear !== 'head_fondue_pot') {
      sphere(scene, body, 'hat-hair-tuft', 0.14, 0, headY + 0.06, -0.2, hexToColor4(hairHex), {
        segments: 5,
      });
    }
  }

  private buildArm(
    scene: Scene,
    hands: PlayerProfile['cosmetics']['hands'],
    sleeve: Color4,
    skin: Color4,
    bare: boolean,
    side: 'left' | 'right',
  ): Mesh {
    const parts: PartList = [];
    const armColor = bare ? skin : sleeve;
    box(scene, parts, `${side}-upper-arm`, 0.13, 0.32, 0.14, 0, -0.16, 0, armColor, {
      skin: bare,
    });
    sphere(scene, parts, `${side}-elbow`, 0.13, 0, -0.33, 0, armColor, { skin: bare, segments: 6 });
    box(scene, parts, `${side}-forearm`, 0.115, 0.26, 0.125, 0, -0.46, 0, armColor, {
      skin: bare,
    });
    if (!bare) {
      box(scene, parts, `${side}-cuff`, 0.135, 0.06, 0.145, 0, -0.59, 0, WHITE);
    }

    const handColor = HANDS_PALETTES[hands];
    const handPrimary = hexToColor4(handColor.primary);
    const handSecondary = hexToColor4(handColor.secondary);

    if (hands === 'hands_pirate_hook' && side === 'right') {
      cylinder(scene, parts, 'hook-wrist', 0.08, 0.09, 0.1, 0, -0.64, 0, handSecondary, {
        segments: 6,
      });
      torus(scene, parts, 'hook-curve', 0.15, 0.03, 0, -0.74, 0.03, handPrimary, {
        rotationY: Math.PI / 2,
        segments: 8,
      });
      cylinder(scene, parts, 'hook-tip', 0.1, 0.005, 0.035, 0, -0.81, 0.05, handPrimary, {
        segments: 5,
      });
    } else if (hands === 'hands_boxing') {
      sphere(scene, parts, `${side}-boxing-glove`, 0.22, 0, -0.68, 0.02, handPrimary, {
        segments: 7,
        scaleY: 1.15,
      });
      cylinder(scene, parts, `${side}-boxing-cuff`, 0.08, 0.15, 0.15, 0, -0.58, 0, handSecondary, {
        segments: 7,
      });
    } else if (hands === 'hands_mittens') {
      sphere(scene, parts, `${side}-mitten`, 0.18, 0, -0.67, 0.01, handPrimary, {
        segments: 6,
        scaleY: 1.1,
      });
      cylinder(scene, parts, `${side}-mitten-cuff`, 0.06, 0.14, 0.14, 0, -0.59, 0, handSecondary, {
        segments: 7,
      });
    } else {
      sphere(scene, parts, `${side}-hand`, 0.15, 0, -0.66, 0.01, skin, {
        skin: true,
        segments: 6,
        scaleY: 1.1,
      });
      if (hands === 'hands_gold_watch') {
        torus(scene, parts, `${side}-watch`, 0.13, 0.022, 0, -0.6, 0, handPrimary, {
          rotationX: Math.PI / 2,
          segments: 8,
        });
        disc(scene, parts, `${side}-watch-face`, 0.06, 0.02, -0.6, 0.065, handSecondary, {
          segments: 8,
        });
      }
    }

    const merged = mergeParts(scene, `${side}-arm-mesh`, parts, this.material);
    if (!merged) throw new Error('Failed to build character arm.');
    merged.parent = side === 'left' ? this.leftShoulder : this.rightShoulder;
    merged.position.set(0, 0, 0);
    return merged;
  }

  private buildLeg(
    scene: Scene,
    legs: PlayerProfile['cosmetics']['legs'],
    feet: PlayerProfile['cosmetics']['feet'],
    skin: Color4,
    side: 'left' | 'right',
  ): Mesh {
    const parts: PartList = [];
    const palette = LEGS_PALETTES[legs];
    const primary = hexToColor4(palette.primary);
    const secondary = hexToColor4(palette.secondary);
    const accent = hexToColor4(palette.accent);
    const shorts =
      legs === 'legs_lederhosen' ||
      legs === 'legs_boardshorts' ||
      legs === 'legs_long_johns';
    const thighSkin = legs === 'legs_lederhosen' || legs === 'legs_boardshorts';
    const thighColor = thighSkin ? skin : primary;
    const shinColor = thighSkin ? skin : primary;

    box(scene, parts, `${side}-thigh`, 0.16, shorts ? 0.3 : 0.4, 0.18, 0, shorts ? -0.15 : -0.2, 0, thighColor, {
      skin: thighSkin,
    });
    sphere(scene, parts, `${side}-knee`, 0.14, 0, -0.4, 0, shinColor, {
      skin: thighSkin,
      segments: 6,
    });
    box(scene, parts, `${side}-shin`, 0.145, 0.34, 0.16, 0, -0.58, 0, shinColor, {
      skin: thighSkin,
    });

    if (legs === 'legs_striped_trousers') {
      for (let stripe = 0; stripe < 4; stripe += 1) {
        box(scene, parts, `${side}-stripe`, 0.152, 0.035, 0.165, 0, -0.1 - stripe * 0.14, 0, secondary);
      }
    } else if (legs === 'legs_olive_pants') {
      box(scene, parts, `${side}-cargo-pocket`, 0.05, 0.12, 0.13, side === 'left' ? -0.1 : 0.1, -0.28, 0.02, secondary);
      box(scene, parts, `${side}-cuff`, 0.155, 0.05, 0.17, 0, -0.73, 0, accent);
    } else if (legs === 'legs_lederhosen') {
      box(scene, parts, `${side}-lederhosen`, 0.17, 0.14, 0.19, 0, -0.07, 0, primary);
      box(scene, parts, `${side}-sock`, 0.15, 0.12, 0.16, 0, -0.72, 0, secondary);
      box(scene, parts, `${side}-sock-stripe`, 0.155, 0.03, 0.165, 0, -0.66, 0, accent);
    } else if (legs === 'legs_boardshorts') {
      box(scene, parts, `${side}-boardshort`, 0.175, 0.16, 0.19, 0, -0.08, 0, primary);
      box(scene, parts, `${side}-boardshort-stripe`, 0.18, 0.035, 0.195, 0, -0.03, 0, secondary);
    } else if (legs === 'legs_long_johns') {
      box(scene, parts, `${side}-longjohn-cuff`, 0.15, 0.05, 0.17, 0, -0.73, 0, WHITE);
      box(scene, parts, `${side}-longjohn-dot`, 0.04, 0.04, 0.02, 0, -0.2, 0.09, accent);
    }

    const feetPalette = FEET_PALETTES[feet];
    const footPrimary = hexToColor4(feetPalette.primary);
    const footSecondary = hexToColor4(feetPalette.secondary);
    const footAccent = hexToColor4(feetPalette.accent);

    if (feet === 'feet_peg_leg' && side === 'right') {
      cylinder(scene, parts, 'peg-leg', 0.34, 0.06, 0.09, 0, -0.7, 0, footPrimary, {
        segments: 7,
      });
      cylinder(scene, parts, 'peg-foot', 0.06, 0.02, 0.16, 0, -0.87, 0.02, footSecondary, {
        segments: 7,
      });
    } else if (feet === 'feet_dive_flippers') {
      box(scene, parts, `${side}-flipper`, 0.19, 0.055, 0.5, 0, -0.81, 0.17, footPrimary, {
        rotationX: -0.06,
      });
      box(scene, parts, `${side}-flipper-sole`, 0.2, 0.02, 0.5, 0, -0.84, 0.17, footSecondary);
    } else if (feet === 'feet_ski_boots') {
      box(scene, parts, `${side}-ski-boot`, 0.2, 0.22, 0.3, 0, -0.77, 0.05, footPrimary);
      box(scene, parts, `${side}-ski-sole`, 0.21, 0.04, 0.32, 0, -0.89, 0.05, footSecondary);
      box(scene, parts, `${side}-ski-buckle`, 0.21, 0.03, 0.04, 0, -0.73, 0.14, footAccent);
      box(scene, parts, `${side}-ski-buckle-low`, 0.21, 0.03, 0.04, 0, -0.8, 0.14, footAccent);
    } else if (feet === 'feet_sandals_socks') {
      box(scene, parts, `${side}-sock`, 0.17, 0.16, 0.22, 0, -0.77, 0.03, WHITE);
      box(scene, parts, `${side}-sandal`, 0.19, 0.035, 0.3, 0, -0.87, 0.07, footPrimary);
      box(scene, parts, `${side}-sandal-strap`, 0.2, 0.03, 0.05, 0, -0.82, 0.1, footSecondary);
    } else {
      box(scene, parts, `${side}-boot`, 0.19, 0.17, 0.28, 0, -0.79, 0.04, footPrimary);
      box(scene, parts, `${side}-boot-sole`, 0.2, 0.05, 0.3, 0, -0.89, 0.04, footSecondary);
      box(scene, parts, `${side}-boot-cuff`, 0.2, 0.04, 0.2, 0, -0.7, 0.01, footAccent);
    }

    const merged = mergeParts(scene, `${side}-leg-mesh`, parts, this.material);
    if (!merged) throw new Error('Failed to build character leg.');
    merged.parent = side === 'left' ? this.leftHip : this.rightHip;
    merged.position.set(0, 0, 0);
    return merged;
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

  update(deltaSeconds: number, pose: CharacterPose): void {
    if (this.disposed) return;
    this.setPosition(pose.position);
    this.setYaw(pose.yaw);
    const speed = Math.hypot(pose.velocity.x, pose.velocity.z);
    const normalizedSpeed = Math.min(2.2, speed / Math.max(1, this.stats.moveSpeed));
    const crouch = Math.min(1, Math.max(0, pose.crouchBlend ?? (pose.crouched ? 1 : 0)));
    const swimming = pose.swimming ?? false;
    const rolling = pose.rolling ?? false;
    const sprinting = pose.sprinting ?? false;
    const parachuteBlend = Math.min(
      1,
      Math.max(
        0,
        pose.parachuteBlend ??
          (pose.parachuteState === ParachuteState.Intact || pose.parachuteState === ParachuteState.Tattered
            ? 1
            : 0),
      ),
    );
    this.updateCanopy(deltaSeconds, parachuteBlend, pose.parachuteSway ?? 0);
    this.walkPhase += deltaSeconds * (3.2 + normalizedSpeed * 8.4 + (sprinting ? 2 : 0));

    if (!pose.alive) {
      this.root.rotation.z = approach(this.root.rotation.z, 1.35, deltaSeconds * 4);
      this.spine.rotation.x = approach(this.spine.rotation.x, -0.7, deltaSeconds * 3);
      this.spine.position.y = approach(this.spine.position.y, 0.35, deltaSeconds * 4);
      this.updateMaterial();
      return;
    }
    this.root.rotation.z = approach(this.root.rotation.z, 0, deltaSeconds * 6);

    if (swimming) {
      this.spine.rotation.x = approach(this.spine.rotation.x, -1.12, deltaSeconds * 6);
      this.spine.position.y = approach(this.spine.position.y, SPINE_Y - 0.34, deltaSeconds * 6);
      this.leftHip.rotation.x = Math.sin(this.walkPhase * 1.6) * 0.35;
      this.rightHip.rotation.x = -Math.sin(this.walkPhase * 1.6) * 0.35;
      this.leftShoulder.rotation.x = Math.sin(this.walkPhase) * 1.2 - 0.5;
      this.rightShoulder.rotation.x = -Math.sin(this.walkPhase) * 1.2 - 0.5;
      this.leftShoulder.rotation.z = 0.22;
      this.rightShoulder.rotation.z = -0.22;
      this.bodyBob = Math.sin(performance.now() * 0.004) * 0.035;
      this.spine.position.y += this.bodyBob;
      this.updateMaterial();
      return;
    }

    if (rolling) {
      this.rollPhase += deltaSeconds * 11;
      this.spine.rotation.x = -this.rollPhase;
      this.spine.position.y = SPINE_Y - 0.3 + Math.sin(this.rollPhase) * 0.08;
      this.leftHip.rotation.x = 1.1;
      this.rightHip.rotation.x = 1.1;
      this.leftShoulder.rotation.x = 1.2;
      this.rightShoulder.rotation.x = 1.2;
      this.updateMaterial();
      return;
    }
    this.rollPhase = 0;

    const baseLean = 0.12 * crouch + (sprinting ? 0.16 : 0);
    this.spine.rotation.x = approach(this.spine.rotation.x, baseLean, deltaSeconds * 6);
    const targetSpineY = SPINE_Y - 0.3 * crouch;
    this.bodyBob = pose.grounded
      ? Math.abs(Math.sin(this.walkPhase * 2)) * 0.022 * normalizedSpeed
      : 0;
    this.spine.position.y = approach(this.spine.position.y, targetSpineY + this.bodyBob, deltaSeconds * 12);

    const swing = pose.grounded ? normalizedSpeed * (sprinting ? 0.92 : 0.72) : 0.28;
    const phase = this.walkPhase;
    if (pose.grounded) {
      this.leftHip.rotation.x = Math.sin(phase) * swing + crouch * 0.55;
      this.rightHip.rotation.x = -Math.sin(phase) * swing + crouch * 0.55;
      this.leftShoulder.rotation.x = -Math.sin(phase) * swing * 0.8 - crouch * 0.3;
      this.rightShoulder.rotation.x = Math.sin(phase) * swing * 0.8 - crouch * 0.3;
      this.leftShoulder.rotation.z = 0.07 + crouch * 0.08;
      this.rightShoulder.rotation.z = -0.07 - crouch * 0.08;
    } else {
      this.leftHip.rotation.x = approach(this.leftHip.rotation.x, -0.42, deltaSeconds * 6);
      this.rightHip.rotation.x = approach(this.rightHip.rotation.x, 0.32, deltaSeconds * 6);
      this.leftShoulder.rotation.x = approach(this.leftShoulder.rotation.x, -0.95, deltaSeconds * 5);
      this.rightShoulder.rotation.x = approach(this.rightShoulder.rotation.x, -0.95, deltaSeconds * 5);
      this.leftShoulder.rotation.z = 0.2;
      this.rightShoulder.rotation.z = -0.2;
    }

    this.updateMaterial();
  }

  updatePreview(deltaSeconds: number, spin: number): void {
    this.update(deltaSeconds, {
      position: this.root.position.asArray().length === 3
        ? { x: this.root.position.x, y: this.root.position.y, z: this.root.position.z }
        : { x: 0, y: 0, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      yaw: spin,
      grounded: true,
      alive: true,
    });
    this.walkPhase += deltaSeconds * 0.9;
    this.spine.position.y = SPINE_Y + Math.sin(performance.now() * 0.0018) * 0.012;
    this.spine.rotation.x = 0;
    this.leftShoulder.rotation.x = Math.sin(performance.now() * 0.0015) * 0.05;
    this.rightShoulder.rotation.x = -Math.sin(performance.now() * 0.0015) * 0.05;
    this.leftHip.rotation.x = 0;
    this.rightHip.rotation.x = 0;
  }

  private updateCanopy(deltaSeconds: number, blend: number, sway: number): void {
    const visible = blend > 0.01;
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
    updateCharacterMaterial(this.material, camera.position, performance.now() / 1000, this.effects);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.dispose(false, false);
    this.material.dispose();
    this.shadowMaterial.dispose();
  }
}
