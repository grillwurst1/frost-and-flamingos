import { Color3 } from '@babylonjs/core/Maths/math';
import { Material } from '@babylonjs/core/Materials/material';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { Scene } from '@babylonjs/core/scene';

/**
 * The coconut's drawn face, after the owner's expression sheet: a canvas
 * painted procedurally onto a spherical decal on the upright face layer.
 * ANGRY is the default; HAPPY after a hit, DIZZY when stunned or knocked
 * back, SQUASHED on hard landings and damage, SHOUT while slamming or
 * turbo-rolling, KO when eliminated. The pupils follow the roll direction.
 */

export type CoconutExpression = 'angry' | 'happy' | 'dizzy' | 'squashed' | 'shout' | 'ko';

const WIDTH = 512;
const HEIGHT = 384;
const INK = '#1b1410';
/** Patch extents on the shell (radians): yaw ±, latitude range. */
const YAW_SPAN = 1.2;
const LAT_MIN = -0.42;
const LAT_MAX = 0.95;

/** Spherical patch with UVs mapped by angle, floating just above the shell. */
export function createFaceDecal(scene: Scene, radii: { x: number; y: number; z: number }, lift: number): Mesh {
  const columns = 24;
  const rows = 18;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let row = 0; row <= rows; row += 1) {
    const v = row / rows;
    const latitude = LAT_MIN + (LAT_MAX - LAT_MIN) * v;
    for (let column = 0; column <= columns; column += 1) {
      const u = column / columns;
      const yaw = -YAW_SPAN + 2 * YAW_SPAN * u;
      const dx = Math.sin(yaw) * Math.cos(latitude);
      const dy = Math.sin(latitude);
      const dz = Math.cos(yaw) * Math.cos(latitude);
      const radius = 1 / Math.sqrt((dx / radii.x) ** 2 + (dy / radii.y) ** 2 + (dz / radii.z) ** 2);
      positions.push(dx * (radius + lift), dy * (radius + lift), dz * (radius + lift));
      uvs.push(u, v);
    }
  }
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const a = row * (columns + 1) + column;
      const b = a + 1;
      const c = a + columns + 1;
      const d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  }
  const data = new VertexData();
  data.positions = positions;
  data.indices = indices;
  data.uvs = uvs;
  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);
  data.normals = normals;
  const mesh = new Mesh('coconut-face-decal', scene);
  data.applyToMesh(mesh);
  mesh.isPickable = false;
  return mesh;
}

/** Canvas x/y for a point on the shell given as yaw/latitude in radians. */
function at(yaw: number, latitude: number): [number, number] {
  const u = (yaw + YAW_SPAN) / (2 * YAW_SPAN);
  const v = (latitude - LAT_MIN) / (LAT_MAX - LAT_MIN);
  return [u * WIDTH, (1 - v) * HEIGHT];
}

export class CoconutFacePainter {
  readonly texture: DynamicTexture;
  readonly material: StandardMaterial;
  private key = '';

  constructor(scene: Scene) {
    this.texture = new DynamicTexture('coconut-face-texture', { width: WIDTH, height: HEIGHT }, scene, true);
    this.texture.hasAlpha = true;
    this.material = new StandardMaterial('coconut-face-material', scene);
    this.material.diffuseTexture = this.texture;
    this.material.emissiveTexture = this.texture;
    this.material.useAlphaFromDiffuseTexture = true;
    this.material.transparencyMode = Material.MATERIAL_ALPHATEST;
    this.material.alphaCutOff = 0.4;
    this.material.disableLighting = true;
    this.material.specularColor = Color3.Black();
    // The decal's inner side only ever faces the shell, so cull nothing.
    this.material.backFaceCulling = false;
    this.draw('angry', 0, 0);
  }

  /** Redraws only when the expression or the quantised gaze changes. */
  draw(expression: CoconutExpression, lookX: number, lookY: number): void {
    const gx = Math.round(Math.max(-1, Math.min(1, lookX)) * 3);
    const gy = Math.round(Math.max(-1, Math.min(1, lookY)) * 2);
    const key = `${expression}|${gx}|${gy}`;
    if (key === this.key) return;
    this.key = key;
    const context = this.texture.getContext() as CanvasRenderingContext2D;
    context.clearRect(0, 0, WIDTH, HEIGHT);
    context.lineCap = 'round';
    context.lineJoin = 'round';
    switch (expression) {
      case 'happy':
        this.happy(context);
        break;
      case 'dizzy':
        this.dizzy(context);
        break;
      case 'squashed':
        this.squashed(context);
        break;
      case 'shout':
        this.eyes(context, gx / 3, gy / 2, 0.9);
        this.brows(context, 0.32);
        this.shoutMouth(context);
        break;
      case 'ko':
        this.koEyes(context);
        this.wobblyMouth(context);
        break;
      default:
        this.eyes(context, gx / 3, gy / 2, 1);
        this.brows(context, 0.24);
        this.frown(context);
    }
    this.texture.update(true);
  }

  // --- parts ------------------------------------------------------------------

  private eyes(context: CanvasRenderingContext2D, lookX: number, lookY: number, open: number): void {
    for (const side of [-1, 1]) {
      const [x, y] = at(side * 0.27, 0.27);
      context.save();
      context.translate(x, y);
      // Upper lid cut slanted toward the nose gives the angry squint.
      context.beginPath();
      context.ellipse(0, 0, 44, 46 * open, 0, 0, Math.PI * 2);
      context.fillStyle = '#ffffff';
      context.fill();
      context.lineWidth = 9;
      context.strokeStyle = INK;
      context.stroke();
      context.beginPath();
      context.arc(lookX * 16 - side * 4, -lookY * 12 + 6, 13, 0, Math.PI * 2);
      context.fillStyle = INK;
      context.fill();
      context.beginPath();
      context.arc(lookX * 16 - side * 4 + 5, -lookY * 12 + 1, 4, 0, Math.PI * 2);
      context.fillStyle = '#ffffff';
      context.fill();
      // Cut the eye above a lid line that is low at the nose, high outside.
      const inner = -side * 52;
      const outer = side * 52;
      context.beginPath();
      context.moveTo(inner, -14);
      context.lineTo(outer, -52);
      context.lineTo(outer, -80);
      context.lineTo(inner, -80);
      context.closePath();
      context.globalCompositeOperation = 'destination-out';
      context.fill();
      context.globalCompositeOperation = 'source-over';
      context.restore();
      // Lid line.
      context.beginPath();
      const [lx, ly] = at(side * 0.27, 0.27);
      context.moveTo(lx + side * -46, ly - 14);
      context.lineTo(lx + side * 46, ly - 50);
      context.lineWidth = 9;
      context.strokeStyle = INK;
      context.stroke();
    }
  }

  private brows(context: CanvasRenderingContext2D, slant: number): void {
    for (const side of [-1, 1]) {
      const [x, y] = at(side * 0.27, 0.52);
      context.save();
      context.translate(x, y);
      context.rotate(side * slant);
      context.beginPath();
      context.moveTo(-58, -6);
      context.quadraticCurveTo(0, -26, 58, -4);
      context.lineTo(56, 16);
      context.quadraticCurveTo(0, 2, -60, 14);
      context.closePath();
      context.fillStyle = INK;
      context.fill();
      context.restore();
    }
    // Furrow between the brows.
    const [fx, fy] = at(0, 0.46);
    context.beginPath();
    context.moveTo(fx - 8, fy - 14);
    context.quadraticCurveTo(fx, fy, fx + 8, fy - 14);
    context.lineWidth = 5;
    context.strokeStyle = INK;
    context.stroke();
  }

  private frown(context: CanvasRenderingContext2D): void {
    const [x, y] = at(0, -0.05);
    context.beginPath();
    context.moveTo(x - 62, y + 22);
    context.quadraticCurveTo(x, y - 34, x + 62, y + 22);
    context.lineWidth = 12;
    context.strokeStyle = INK;
    context.stroke();
    // Little chin crease under the frown.
    context.beginPath();
    context.moveTo(x - 20, y + 40);
    context.quadraticCurveTo(x, y + 30, x + 20, y + 40);
    context.lineWidth = 5;
    context.stroke();
  }

  private happy(context: CanvasRenderingContext2D): void {
    for (const side of [-1, 1]) {
      const [x, y] = at(side * 0.27, 0.27);
      context.beginPath();
      context.arc(x, y + 18, 34, Math.PI * 1.1, Math.PI * 1.9);
      context.lineWidth = 12;
      context.strokeStyle = INK;
      context.stroke();
      const [bx, by] = at(side * 0.27, 0.55);
      context.beginPath();
      context.moveTo(bx - 40, by + 6);
      context.quadraticCurveTo(bx, by - 18, bx + 40, by + 6);
      context.lineWidth = 11;
      context.stroke();
    }
    const [x, y] = at(0, -0.04);
    context.beginPath();
    context.moveTo(x - 92, y - 26);
    context.quadraticCurveTo(x, y - 10, x + 92, y - 26);
    context.quadraticCurveTo(x + 70, y + 74, x, y + 76);
    context.quadraticCurveTo(x - 70, y + 74, x - 92, y - 26);
    context.closePath();
    context.fillStyle = '#5a1414';
    context.fill();
    context.save();
    context.clip();
    context.fillStyle = '#ffffff';
    context.fillRect(x - 100, y - 40, 200, 40);
    context.fillStyle = '#e8606e';
    context.beginPath();
    context.ellipse(x, y + 66, 44, 26, 0, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = INK;
    context.lineWidth = 4;
    for (let tooth = -3; tooth <= 3; tooth += 1) {
      context.beginPath();
      context.moveTo(x + tooth * 24, y - 30);
      context.lineTo(x + tooth * 24, y - 2);
      context.stroke();
    }
    context.restore();
    context.lineWidth = 10;
    context.strokeStyle = INK;
    context.stroke();
  }

  private dizzy(context: CanvasRenderingContext2D): void {
    // Left eye: spiral. Right eye: star.
    const [lx, ly] = at(-0.27, 0.27);
    context.beginPath();
    for (let step = 0; step <= 60; step += 1) {
      const angle = (step / 60) * Math.PI * 5.5;
      const radius = 4 + (step / 60) * 36;
      const px = lx + Math.cos(angle) * radius;
      const py = ly + Math.sin(angle) * radius;
      if (step === 0) context.moveTo(px, py);
      else context.lineTo(px, py);
    }
    context.lineWidth = 8;
    context.strokeStyle = INK;
    context.stroke();
    const [rx, ry] = at(0.27, 0.27);
    context.beginPath();
    for (let point = 0; point < 10; point += 1) {
      const angle = (point / 10) * Math.PI * 2 - Math.PI / 2;
      const radius = point % 2 === 0 ? 40 : 17;
      context.lineTo(rx + Math.cos(angle) * radius, ry + Math.sin(angle) * radius);
    }
    context.closePath();
    context.lineWidth = 8;
    context.stroke();
    this.wobblyMouth(context);
  }

  private wobblyMouth(context: CanvasRenderingContext2D): void {
    const [x, y] = at(0, -0.04);
    context.beginPath();
    for (let step = 0; step <= 40; step += 1) {
      const t = step / 40;
      const px = x - 70 + t * 140;
      const py = y + Math.sin(t * Math.PI * 4) * 12;
      if (step === 0) context.moveTo(px, py);
      else context.lineTo(px, py);
    }
    context.lineWidth = 10;
    context.strokeStyle = INK;
    context.stroke();
  }

  private squashed(context: CanvasRenderingContext2D): void {
    for (const side of [-1, 1]) {
      const [x, y] = at(side * 0.25, 0.27);
      context.beginPath();
      context.moveTo(x - side * 36, y - 24);
      context.lineTo(x + side * 26, y);
      context.lineTo(x - side * 36, y + 24);
      context.lineWidth = 12;
      context.strokeStyle = INK;
      context.stroke();
    }
    this.brows(context, 0.42);
    const [x, y] = at(0, -0.05);
    context.beginPath();
    context.rect(x - 78, y - 26, 156, 52);
    context.fillStyle = '#ffffff';
    context.fill();
    context.lineWidth = 10;
    context.strokeStyle = INK;
    context.stroke();
    context.lineWidth = 5;
    context.beginPath();
    context.moveTo(x - 78, y);
    context.lineTo(x + 78, y);
    for (let tooth = -2; tooth <= 2; tooth += 1) {
      context.moveTo(x + tooth * 30, y - 26);
      context.lineTo(x + tooth * 30, y + 26);
    }
    context.stroke();
  }

  private shoutMouth(context: CanvasRenderingContext2D): void {
    const [x, y] = at(0, -0.06);
    context.beginPath();
    context.ellipse(x, y, 40, 30, 0, 0, Math.PI * 2);
    context.fillStyle = '#6a1616';
    context.fill();
    context.lineWidth = 10;
    context.strokeStyle = INK;
    context.stroke();
  }

  private koEyes(context: CanvasRenderingContext2D): void {
    for (const side of [-1, 1]) {
      const [x, y] = at(side * 0.27, 0.27);
      context.beginPath();
      context.moveTo(x - 30, y - 30);
      context.lineTo(x + 30, y + 30);
      context.moveTo(x + 30, y - 30);
      context.lineTo(x - 30, y + 30);
      context.lineWidth = 12;
      context.strokeStyle = INK;
      context.stroke();
    }
  }

  dispose(): void {
    this.material.dispose();
    this.texture.dispose();
  }
}
