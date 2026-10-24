import { Color4, Vector3 } from '@babylonjs/core/Maths/math';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { CreateDisc } from '@babylonjs/core/Meshes/Builders/discBuilder';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';
import type { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import type { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { CLASS_STATS, type ClassId, type Faction, type Vec3 } from '@frost-and-flamingos/shared';
import { mergeParts, paintMesh } from './mesh-utils';

const SKIN_LIGHT = new Color4(0.91, 0.72, 0.56, 1);
const SKIN_MID = new Color4(0.78, 0.56, 0.4, 1);
const EYE = new Color4(0.06, 0.09, 0.11, 1);
const WHITE = new Color4(0.96, 0.98, 1, 1);

interface FactionLook {
  jacket: Color4;
  jacketDark: Color4;
  trousers: Color4;
  accent: Color4;
  accentDark: Color4;
  skin: Color4;
  hat: Color4;
  hatBand: Color4;
}

const LOOKS: Record<Faction, FactionLook> = {
  alpine: {
    jacket: new Color4(0.16, 0.32, 0.48, 1),
    jacketDark: new Color4(0.09, 0.2, 0.31, 1),
    trousers: new Color4(0.16, 0.2, 0.24, 1),
    accent: new Color4(0.78, 0.16, 0.22, 1),
    accentDark: new Color4(0.53, 0.09, 0.15, 1),
    skin: SKIN_LIGHT,
    hat: new Color4(0.8, 0.17, 0.23, 1),
    hatBand: new Color4(0.94, 0.9, 0.78, 1),
  },
  lagoon: {
    jacket: new Color4(0.07, 0.65, 0.58, 1),
    jacketDark: new Color4(0.03, 0.42, 0.4, 1),
    trousers: new Color4(0.93, 0.42, 0.33, 1),
    accent: new Color4(1, 0.76, 0.36, 1),
    accentDark: new Color4(0.82, 0.48, 0.18, 1),
    skin: SKIN_MID,
    hat: new Color4(0.95, 0.79, 0.42, 1),
    hatBand: new Color4(0.96, 0.35, 0.32, 1),
  },
};

function box(
  scene: Scene,
  name: string,
  width: number,
  height: number,
  depth: number,
  x: number,
  y: number,
  z: number,
  color: Color4,
  material: ShaderMaterial,
): Mesh {
  const mesh = CreateBox(name, { width, height, depth }, scene);
  mesh.position.set(x, y, z);
  paintMesh(mesh, color);
  mesh.material = material;
  mesh.isPickable = false;
  return mesh;
}

function sphere(
  scene: Scene,
  name: string,
  diameter: number,
  x: number,
  y: number,
  z: number,
  color: Color4,
  material: ShaderMaterial,
  segments = 8,
): Mesh {
  const mesh = CreateSphere(name, { diameter, segments }, scene);
  mesh.position.set(x, y, z);
  paintMesh(mesh, color);
  mesh.material = material;
  mesh.isPickable = false;
  return mesh;
}

function cylinder(
  scene: Scene,
  name: string,
  height: number,
  top: number,
  bottom: number,
  x: number,
  y: number,
  z: number,
  color: Color4,
  material: ShaderMaterial,
  tessellation = 10,
): Mesh {
  const mesh = CreateCylinder(name, { height, diameterTop: top, diameterBottom: bottom, tessellation }, scene);
  mesh.position.set(x, y, z);
  paintMesh(mesh, color);
  mesh.material = material;
  mesh.isPickable = false;
  return mesh;
}

export class CharacterView {
  readonly root: TransformNode;
  private readonly body: TransformNode;
  private readonly leftHip: TransformNode;
  private readonly rightHip: TransformNode;
  private readonly leftShoulder: TransformNode;
  private readonly rightShoulder: TransformNode;
  private readonly leftLeg: Mesh;
  private readonly rightLeg: Mesh;
  private readonly leftArm: Mesh;
  private readonly rightArm: Mesh;
  private readonly shadow: Mesh;
  private readonly shadowMaterial: StandardMaterial;
  private walkPhase = 0;
  private yaw = 0;
  private bodyBob = 0;
  private disposed = false;

  constructor(
    scene: Scene,
    material: ShaderMaterial,
    shadowMaterial: StandardMaterial,
    faction: Faction,
    classId: ClassId,
  ) {
    const look = LOOKS[faction];
    const stats = CLASS_STATS[classId];
    const scale = stats.height / 1.8;
    this.shadowMaterial = shadowMaterial;
    this.root = new TransformNode(`player-${faction}`, scene);
    this.root.scaling.setAll(scale);
    this.body = new TransformNode('body', scene);
    this.body.parent = this.root;

    const torsoParts: Mesh[] = [];
    torsoParts.push(box(scene, 'torso', 0.58, 0.66, 0.34, 0, 1.25, 0, look.jacket, material));
    torsoParts.push(box(scene, 'jacket-zip', 0.08, 0.62, 0.36, 0, 1.25, 0.02, look.jacketDark, material));
    torsoParts.push(box(scene, 'belt', 0.6, 0.1, 0.37, 0, 0.94, 0, look.accentDark, material));
    torsoParts.push(box(scene, 'neck', 0.2, 0.16, 0.2, 0, 1.61, 0, look.skin, material));

    const headY = 1.8;
    torsoParts.push(sphere(scene, 'head', 0.43, 0, headY, 0, look.skin, material, 10));
    torsoParts.push(sphere(scene, 'eye-left', 0.075, -0.09, headY + 0.03, 0.205, EYE, material, 6));
    torsoParts.push(sphere(scene, 'eye-right', 0.075, 0.09, headY + 0.03, 0.205, EYE, material, 6));
    torsoParts.push(sphere(scene, 'eye-glint', 0.028, -0.075, headY + 0.055, 0.238, WHITE, material, 5));
    torsoParts.push(sphere(scene, 'eye-glint', 0.028, 0.105, headY + 0.055, 0.238, WHITE, material, 5));
    torsoParts.push(box(scene, 'brow', 0.2, 0.035, 0.04, 0, headY + 0.1, 0.215, look.accentDark, material));
    torsoParts.push(sphere(scene, 'nose', 0.09, 0, headY - 0.03, 0.23, look.skin, material, 6));

    if (faction === 'alpine') {
      torsoParts.push(cylinder(scene, 'beanie', 0.24, 0.38, 0.45, 0, headY + 0.22, 0, look.hat, material, 12));
      torsoParts.push(cylinder(scene, 'beanie-brim', 0.09, 0.47, 0.47, 0, headY + 0.11, 0, look.hatBand, material, 12));
      torsoParts.push(sphere(scene, 'pom-pom', 0.18, 0, headY + 0.37, 0, look.hatBand, material, 6));
      torsoParts.push(box(scene, 'scarf', 0.48, 0.16, 0.4, 0, 1.56, 0.02, look.accent, material));
      torsoParts.push(box(scene, 'scarf-tail', 0.16, 0.42, 0.08, 0.17, 1.38, 0.2, look.accent, material));
      torsoParts.push(box(scene, 'backpack', 0.42, 0.5, 0.2, 0, 1.24, -0.27, look.accentDark, material));
      torsoParts.push(box(scene, 'backpack-strap', 0.06, 0.62, 0.06, -0.2, 1.25, -0.18, look.hatBand, material));
      torsoParts.push(box(scene, 'backpack-strap', 0.06, 0.62, 0.06, 0.2, 1.25, -0.18, look.hatBand, material));
    } else {
      torsoParts.push(cylinder(scene, 'straw-hat-brim', 0.06, 0.72, 0.72, 0, headY + 0.2, 0, look.hat, material, 16));
      torsoParts.push(cylinder(scene, 'straw-hat-top', 0.2, 0.34, 0.42, 0, headY + 0.32, 0, look.hat, material, 12));
      torsoParts.push(cylinder(scene, 'straw-hat-band', 0.07, 0.44, 0.44, 0, headY + 0.23, 0, look.hatBand, material, 12));
      torsoParts.push(box(scene, 'lei', 0.5, 0.1, 0.44, 0, 1.56, 0.02, look.accent, material));
      for (let flower = 0; flower < 6; flower += 1) {
        const angle = (flower / 6) * Math.PI * 2;
        torsoParts.push(
          sphere(scene, 'lei-flower', 0.1, Math.sin(angle) * 0.3, 1.57, Math.cos(angle) * 0.24, flower % 2 === 0 ? look.hatBand : WHITE, material, 5),
        );
      }
      torsoParts.push(box(scene, 'surf-shirt', 0.4, 0.3, 0.06, 0, 1.27, 0.2, look.accent, material));
      torsoParts.push(box(scene, 'surf-shirt-stripe', 0.4, 0.06, 0.07, 0, 1.2, 0.21, look.hatBand, material));
      torsoParts.push(box(scene, 'backpack', 0.36, 0.42, 0.18, 0, 1.24, -0.26, look.accentDark, material));
    }

    const bodyMesh = mergeParts(scene, 'character-body', torsoParts, material);
    if (bodyMesh) {
      bodyMesh.parent = this.body;
      bodyMesh.position.set(0, 0, 0);
    }

    this.leftHip = new TransformNode('left-hip', scene);
    this.leftHip.parent = this.root;
    this.leftHip.position.set(-0.17, 0.9, 0);
    this.rightHip = new TransformNode('right-hip', scene);
    this.rightHip.parent = this.root;
    this.rightHip.position.set(0.17, 0.9, 0);

    this.leftLeg = this.buildLeg(scene, material, look, 'left');
    this.leftLeg.parent = this.leftHip;
    this.leftLeg.position.set(0, 0, 0);
    this.rightLeg = this.buildLeg(scene, material, look, 'right');
    this.rightLeg.parent = this.rightHip;
    this.rightLeg.position.set(0, 0, 0);

    this.leftShoulder = new TransformNode('left-shoulder', scene);
    this.leftShoulder.parent = this.root;
    this.leftShoulder.position.set(-0.37, 1.49, 0);
    this.rightShoulder = new TransformNode('right-shoulder', scene);
    this.rightShoulder.parent = this.root;
    this.rightShoulder.position.set(0.37, 1.49, 0);

    this.leftArm = this.buildArm(scene, material, look, 'left');
    this.leftArm.parent = this.leftShoulder;
    this.leftArm.position.set(0, 0, 0);
    this.rightArm = this.buildArm(scene, material, look, 'right');
    this.rightArm.parent = this.rightShoulder;
    this.rightArm.position.set(0, 0, 0);

    this.shadow = CreateDisc('character-shadow', { radius: 0.62, tessellation: 24 }, scene);
    this.shadow.rotation.x = Math.PI / 2;
    this.shadow.position.y = 0.025;
    this.shadow.material = shadowMaterial;
    this.shadow.isPickable = false;
    this.shadow.parent = this.root;
    this.shadow.alphaIndex = 0;
  }

  private buildLeg(scene: Scene, material: ShaderMaterial, look: FactionLook, side: 'left' | 'right'): Mesh {
    const parts: Mesh[] = [];
    parts.push(box(scene, `${side}-leg`, 0.2, 0.78, 0.24, 0, -0.39, 0, look.trousers, material));
    parts.push(box(scene, `${side}-boot`, 0.25, 0.2, 0.36, 0, -0.82, 0.06, look.accentDark, material));
    parts.push(box(scene, `${side}-boot-sole`, 0.26, 0.06, 0.38, 0, -0.91, 0.06, EYE, material));
    const merged = mergeParts(scene, `${side}-leg-mesh`, parts, material);
    if (!merged) throw new Error('Failed to build character leg.');
    return merged;
  }

  private buildArm(scene: Scene, material: ShaderMaterial, look: FactionLook, side: 'left' | 'right'): Mesh {
    const parts: Mesh[] = [];
    parts.push(box(scene, `${side}-arm`, 0.16, 0.58, 0.18, 0, -0.29, 0, look.jacket, material));
    parts.push(box(scene, `${side}-cuff`, 0.18, 0.08, 0.2, 0, -0.58, 0, look.jacketDark, material));
    parts.push(sphere(scene, `${side}-hand`, 0.18, 0, -0.66, 0, look.skin, material, 6));
    const merged = mergeParts(scene, `${side}-arm-mesh`, parts, material);
    if (!merged) throw new Error('Failed to build character arm.');
    return merged;
  }

  setYaw(yaw: number, immediate = false): void {
    this.yaw = immediate ? yaw : this.yaw + shortestAngle(this.yaw, yaw) * 0.24;
    this.root.rotation.y = this.yaw;
  }

  setPosition(position: Vec3): void {
    this.root.position.set(position.x, position.y, position.z);
  }

  update(
    deltaSeconds: number,
    position: Vec3,
    velocity: Vec3,
    yaw: number,
    grounded: boolean,
    alive: boolean,
  ): void {
    if (this.disposed) return;
    this.setPosition(position);
    this.setYaw(yaw);
    const speed = Math.hypot(velocity.x, velocity.z);
    const normalizedSpeed = Math.min(1.8, speed / 6);
    this.walkPhase += deltaSeconds * (3.1 + normalizedSpeed * 8.2);

    if (!alive) {
      this.root.rotation.z = approach(this.root.rotation.z, 1.3, deltaSeconds * 4);
      this.body.rotation.x = approach(this.body.rotation.x, -0.6, deltaSeconds * 3);
      return;
    }
    this.root.rotation.z = approach(this.root.rotation.z, 0, deltaSeconds * 6);
    this.body.rotation.x = approach(this.body.rotation.x, 0, deltaSeconds * 6);

    const swing = grounded ? normalizedSpeed * 0.75 : 0.28;
    const phase = this.walkPhase;
    if (grounded) {
      this.leftHip.rotation.x = Math.sin(phase) * swing;
      this.rightHip.rotation.x = -Math.sin(phase) * swing;
      this.leftShoulder.rotation.x = -Math.sin(phase) * swing * 0.82;
      this.rightShoulder.rotation.x = Math.sin(phase) * swing * 0.82;
      this.leftShoulder.rotation.z = 0.08;
      this.rightShoulder.rotation.z = -0.08;
    } else {
      this.leftHip.rotation.x = approach(this.leftHip.rotation.x, -0.38, deltaSeconds * 6);
      this.rightHip.rotation.x = approach(this.rightHip.rotation.x, 0.3, deltaSeconds * 6);
      this.leftShoulder.rotation.x = approach(this.leftShoulder.rotation.x, -0.9, deltaSeconds * 5);
      this.rightShoulder.rotation.x = approach(this.rightShoulder.rotation.x, -0.9, deltaSeconds * 5);
      this.leftShoulder.rotation.z = 0.18;
      this.rightShoulder.rotation.z = -0.18;
    }

    this.bodyBob = grounded ? Math.abs(Math.sin(phase * 2)) * 0.022 * normalizedSpeed : 0;
    this.body.position.y = approach(this.body.position.y, this.bodyBob, deltaSeconds * 12);
    this.body.scaling.y = 1 + Math.sin(performance.now() * 0.002) * 0.004;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    // The toon material is shared by every character and the whole map, so the
    // root must only dispose its meshes. Each view owns its shadow material.
    this.root.dispose(false, false);
    this.shadowMaterial.dispose();
  }
}

function shortestAngle(from: number, to: number): number {
  let difference = (to - from) % (Math.PI * 2);
  if (difference > Math.PI) difference -= Math.PI * 2;
  if (difference < -Math.PI) difference += Math.PI * 2;
  return difference;
}

function approach(current: number, target: number, amount: number): number {
  if (Math.abs(target - current) <= amount) return target;
  return current + Math.sign(target - current) * amount;
}
