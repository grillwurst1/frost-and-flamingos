import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { Color4, Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { CreateDisc } from '@babylonjs/core/Meshes/Builders/discBuilder';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { Scene } from '@babylonjs/core/scene';
import type { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import {
  FJORD_MAP,
  MAP_SEGMENTS,
  MAP_SIZE,
  WATER_LEVEL,
  sampleMapHeight,
  terrainSlopeAt,
  type MapProp,
  type PropCollider,
} from '@frost-and-flamingos/shared';
import { createSkyMaterial, createWaterMaterial, hexToColor4 } from './materials';
import { enableThinInstances, mergeParts, paintMesh } from './mesh-utils';

const SAND = hexToColor4('#e9d49b');
const WET_SAND = hexToColor4('#cdb47c');
const MEADOW = hexToColor4('#7fa85b');
const MEADOW_DARK = hexToColor4('#648f4c');
const ROCK = hexToColor4('#747d84');
const ROCK_DARK = hexToColor4('#59636b');
const SNOW = hexToColor4('#f3f9ff');
const SNOW_SHADOW = hexToColor4('#d7e7f0');
const STONE = hexToColor4('#a7a28f');
const WOOD = hexToColor4('#7a5135');
const WOOD_DARK = hexToColor4('#4e3324');
const WOOD_LIGHT = hexToColor4('#a9774b');
const CREAM = hexToColor4('#f1e6cc');
const CREAM_WARM = hexToColor4('#e9d7b4');
const RED = hexToColor4('#b93c46');
const DEEP_RED = hexToColor4('#7f2937');
const TEAL = hexToColor4('#139f96');
const TEAL_DARK = hexToColor4('#0b6f70');
const CORAL = hexToColor4('#f26f5e');
const CORAL_DARK = hexToColor4('#c84d4c');
const YELLOW = hexToColor4('#f5c95b');
const WINDOW_GLOW = hexToColor4('#ffd88a');
const GLASS = hexToColor4('#9fd8ea');
const PINE = hexToColor4('#2f6b4c');
const PINE_LIGHT = hexToColor4('#3f8058');
const PINE_DARK = hexToColor4('#214d3b');
const PALM = hexToColor4('#3f8b54');
const PALM_LIGHT = hexToColor4('#67a95d');
const PINK = hexToColor4('#f08fa4');
const PINK_LIGHT = hexToColor4('#ffc0c8');
const BLACK = hexToColor4('#252d32');
const GOLD = hexToColor4('#e7b84d');

interface PathSegment {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  width: number;
}

const PATHS: PathSegment[] = [
  { ax: 0, az: -10, bx: 44, bz: 44, width: 4.2 },
  { ax: 44, az: 44, bx: 104, bz: 86, width: 4.2 },
  { ax: 104, az: 86, bx: 168, bz: 138, width: 4.2 },
  { ax: 168, az: 138, bx: 242, bz: 214, width: 4.2 },
  { ax: 0, az: -10, bx: -64, bz: -72, width: 3.8 },
  { ax: -64, az: -72, bx: -146, bz: -152, width: 3.8 },
  { ax: -146, az: -152, bx: -222, bz: -226, width: 3.8 },
  { ax: 0, az: -10, bx: -16, bz: -92, width: 3.2 },
  { ax: -16, az: -92, bx: 20, bz: -155, width: 3.2 },
];

function distanceToSegment(x: number, z: number, segment: PathSegment): number {
  const dx = segment.bx - segment.ax;
  const dz = segment.bz - segment.az;
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared < 0.0001) return Math.hypot(x - segment.ax, z - segment.az);
  const t = Math.max(0, Math.min(1, ((x - segment.ax) * dx + (z - segment.az) * dz) / lengthSquared));
  return Math.hypot(x - (segment.ax + dx * t), z - (segment.az + dz * t));
}

function pathMask(x: number, z: number): number {
  let best = Number.POSITIVE_INFINITY;
  for (const segment of PATHS) {
    const distance = distanceToSegment(x, z, segment);
    if (distance < best) best = distance;
  }
  if (best > 7) return 0;
  return 1 - Math.min(1, Math.max(0, (best - 2.1) / 4.9));
}

function noise2(x: number, z: number): number {
  const value = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function mixColor(a: Color4, b: Color4, t: number): Color4 {
  return new Color4(
    a.r + (b.r - a.r) * t,
    a.g + (b.g - a.g) * t,
    a.b + (b.b - a.b) * t,
    a.a + (b.a - a.a) * t,
  );
}

function terrainColorAt(x: number, z: number, height: number, slope: number): Color4 {
  const grain = (noise2(x * 0.18, z * 0.18) - 0.5) * 0.08;
  const patch = noise2(x * 0.035, z * 0.035);

  if (height < WATER_LEVEL + 0.35) {
    return mixColor(WET_SAND, SAND, Math.max(0, height + 1.4) / 1.75);
  }
  if (height < 2.9) {
    return mixColor(SAND, MEADOW, Math.max(0, (height - 1.2) / 1.7) * 0.35);
  }
  if (slope > 0.82) {
    return mixColor(ROCK_DARK, ROCK, patch);
  }
  if (height > 43 || (height > 34 && slope > 0.5)) {
    const snowBlend = Math.min(1, Math.max(0, (height - 36) / 12 + (slope - 0.35) * 0.6));
    return mixColor(SNOW_SHADOW, SNOW, Math.min(1, snowBlend + grain));
  }
  if (height > 27) {
    return mixColor(ROCK, ROCK_DARK, patch * 0.8);
  }

  const villageDistance = Math.hypot(x, z + 10);
  const path = pathMask(x, z);
  const meadow = mixColor(MEADOW_DARK, MEADOW, patch);
  if (villageDistance < 30) {
    const plaza = 1 - Math.min(1, Math.max(0, (villageDistance - 18) / 12));
    return mixColor(meadow, STONE, plaza * 0.78 + path * 0.2);
  }
  if (path > 0.02) {
    return mixColor(meadow, STONE, Math.min(0.92, path * 0.9));
  }
  if (height > 17.6 && height < 22 && patch > 0.62) {
    return mixColor(meadow, MEADOW_DARK, 0.4);
  }
  return new Color4(
    Math.min(1, Math.max(0, meadow.r + grain)),
    Math.min(1, Math.max(0, meadow.g + grain)),
    Math.min(1, Math.max(0, meadow.b + grain)),
    1,
  );
}

class PropBuilder {
  readonly parts: Mesh[] = [];
  private readonly origin: Vector3;
  private readonly rotationY: number;

  constructor(
    private readonly scene: Scene,
    private readonly material: ShaderMaterial,
    origin: { x: number; y: number; z: number },
    rotationY = 0,
  ) {
    this.origin = new Vector3(origin.x, origin.y, origin.z);
    this.rotationY = rotationY;
  }

  worldPoint(localX: number, localY: number, localZ: number): Vector3 {
    const cos = Math.cos(this.rotationY);
    const sin = Math.sin(this.rotationY);
    return new Vector3(
      this.origin.x + localX * cos + localZ * sin,
      this.origin.y + localY,
      this.origin.z - localX * sin + localZ * cos,
    );
  }

  add(mesh: Mesh, localX: number, localY: number, localZ: number, color: Color4): Mesh {
    mesh.position.copyFrom(this.worldPoint(localX, localY, localZ));
    mesh.rotation.y += this.rotationY;
    paintMesh(mesh, color);
    mesh.material = this.material;
    mesh.isPickable = false;
    this.parts.push(mesh);
    return mesh;
  }

  box(
    name: string,
    width: number,
    height: number,
    depth: number,
    x: number,
    y: number,
    z: number,
    color: Color4,
    rotationY = 0,
  ): Mesh {
    const mesh = CreateBox(name, { width, height, depth }, this.scene);
    mesh.rotation.y = rotationY;
    return this.add(mesh, x, y, z, color);
  }

  cylinder(
    name: string,
    height: number,
    diameterTop: number,
    diameterBottom: number,
    x: number,
    y: number,
    z: number,
    color: Color4,
    tessellation = 12,
  ): Mesh {
    const mesh = CreateCylinder(
      name,
      { height, diameterTop, diameterBottom, tessellation },
      this.scene,
    );
    return this.add(mesh, x, y, z, color);
  }

  cone(
    name: string,
    height: number,
    diameter: number,
    x: number,
    y: number,
    z: number,
    color: Color4,
    tessellation = 12,
    rotationY = 0,
  ): Mesh {
    const mesh = CreateCylinder(
      name,
      { height, diameterTop: 0, diameterBottom: diameter, tessellation },
      this.scene,
    );
    mesh.rotation.y = rotationY;
    return this.add(mesh, x, y, z, color);
  }

  sphere(
    name: string,
    diameter: number,
    x: number,
    y: number,
    z: number,
    color: Color4,
    segments = 8,
  ): Mesh {
    const mesh = CreateSphere(name, { diameter, segments }, this.scene);
    return this.add(mesh, x, y, z, color);
  }

  torus(
    name: string,
    diameter: number,
    thickness: number,
    x: number,
    y: number,
    z: number,
    color: Color4,
  ): Mesh {
    const mesh = CreateTorus(name, { diameter, thickness, tessellation: 24 }, this.scene);
    return this.add(mesh, x, y, z, color);
  }

  finish(name: string): Mesh | null {
    return mergeParts(this.scene, name, this.parts, this.material);
  }
}

function firstBoxCollider(prop: MapProp): Extract<PropCollider, { type: 'box' }> | null {
  for (const collider of prop.colliders) {
    if (collider.type === 'box') return collider;
  }
  return null;
}

function buildChalet(scene: Scene, material: ShaderMaterial, prop: MapProp): Mesh | null {
  const collider = firstBoxCollider(prop);
  const width = collider ? collider.halfExtents.x * 2 : 12;
  const depth = collider ? collider.halfExtents.z * 2 : 9;
  const wallHeight = collider ? collider.halfExtents.y * 2 : 6;
  const isSummit = prop.kind === 'summit_lodge';
  const isBar = prop.kind === 'beach_bar';
  const variant = prop.variant % 3;
  const wallColor = isBar ? CREAM_WARM : variant === 0 ? CREAM : variant === 1 ? CREAM_WARM : hexToColor4('#e3cba5');
  const roofColor = isSummit ? hexToColor4('#d8e8f2') : isBar ? hexToColor4('#b98b4f') : variant === 1 ? DEEP_RED : RED;
  const trim = isBar ? TEAL : WOOD_DARK;
  const builder = new PropBuilder(scene, material, prop.position, prop.rotationY);

  builder.box('foundation', width * 1.06, 0.45, depth * 1.06, 0, 0.22, 0, STONE);
  builder.box('walls', width, wallHeight, depth, 0, wallHeight / 2 + 0.4, 0, wallColor);

  const roofHeight = Math.min(width, depth) * (isBar ? 0.34 : 0.48);
  builder.cone(
    'roof',
    roofHeight,
    Math.hypot(width, depth) * 1.1,
    0,
    wallHeight + 0.4 + roofHeight / 2,
    0,
    roofColor,
    4,
    Math.PI / 4,
  );

  if (!isBar) {
    builder.box('chimney', 0.7, 2.1, 0.7, width * 0.28, wallHeight + roofHeight * 0.82, -depth * 0.22, STONE);
    builder.box('chimney-cap', 0.92, 0.18, 0.92, width * 0.28, wallHeight + roofHeight * 0.82 + 1.12, -depth * 0.22, ROCK_DARK);
  }

  const frontZ = depth / 2 + 0.04;
  const windowY = wallHeight * 0.55 + 0.4;
  const windowOffset = width * 0.25;
  for (const side of [-1, 1]) {
    builder.box('window-frame', 1.5, 1.4, 0.12, side * windowOffset, windowY, frontZ, WOOD_DARK);
    builder.box('window-glow', 1.18, 1.08, 0.14, side * windowOffset, windowY, frontZ + 0.05, WINDOW_GLOW);
    builder.box('window-cross', 0.08, 1.08, 0.16, side * windowOffset, windowY, frontZ + 0.08, WOOD_DARK);
    builder.box('window-cross', 1.18, 0.08, 0.16, side * windowOffset, windowY, frontZ + 0.08, WOOD_DARK);
    builder.box('flower-box', 1.55, 0.22, 0.3, side * windowOffset, windowY - 0.82, frontZ + 0.12, WOOD);
    for (let flower = -2; flower <= 2; flower += 1) {
      builder.sphere('flower', 0.24, side * windowOffset + flower * 0.28, windowY - 0.65, frontZ + 0.12, flower % 2 === 0 ? CORAL : YELLOW, 5);
    }
  }

  builder.box('door-frame', 1.55, 2.5, 0.12, 0, 1.65, frontZ, trim);
  builder.box('door', 1.18, 2.18, 0.14, 0, 1.6, frontZ + 0.05, WOOD_DARK);
  builder.sphere('door-knob', 0.16, 0.38, 1.55, frontZ + 0.14, GOLD, 6);

  builder.box('balcony', width * 0.82, 0.16, 1.1, 0, wallHeight * 0.68 + 0.4, frontZ + 0.48, WOOD);
  for (let bar = -4; bar <= 4; bar += 1) {
    builder.box('balcony-bar', 0.08, 0.8, 0.08, bar * (width * 0.82) / 9, wallHeight * 0.68 + 0.82, frontZ + 0.96, WOOD_DARK);
  }
  builder.box('balcony-rail', width * 0.82, 0.1, 0.1, 0, wallHeight * 0.68 + 1.22, frontZ + 0.96, WOOD_DARK);

  if (isBar) {
    builder.box('counter', width * 0.75, 0.9, 1.0, 0, 1.0, frontZ + 1.0, WOOD_LIGHT);
    builder.box('counter-top', width * 0.8, 0.12, 1.2, 0, 1.5, frontZ + 1.0, TEAL);
    for (const stool of [-1.8, 0, 1.8]) {
      builder.cylinder('stool', 0.8, 0.65, 0.75, stool, 0.4, frontZ + 2.3, CORAL, 10);
    }
    builder.box('sign', 3.4, 0.9, 0.16, 0, wallHeight * 0.88 + 0.4, frontZ + 0.08, TEAL_DARK);
    builder.box('sign-stripe', 3.0, 0.12, 0.18, 0, wallHeight * 0.88 + 0.4, frontZ + 0.17, CORAL);
    builder.cylinder('palm-trunk', 5.2, 0.28, 0.5, width * 0.52, 2.6, frontZ + 2.2, WOOD, 8);
    for (let frond = 0; frond < 6; frond += 1) {
      const angle = (frond / 6) * Math.PI * 2;
      const leaf = CreateBox('frond', { width: 0.45, height: 0.08, depth: 3.1 }, scene);
      leaf.position.copyFrom(builder.worldPoint(width * 0.52 + Math.sin(angle) * 1.35, 5.1, frontZ + 2.2 + Math.cos(angle) * 1.35));
      leaf.rotation.set(-0.28, angle, 0);
      paintMesh(leaf, frond % 2 === 0 ? PALM : PALM_LIGHT);
      leaf.material = material;
      leaf.isPickable = false;
      builder.parts.push(leaf);
    }
  }

  if (isSummit) {
    builder.box('snow-ridge', width * 0.9, 0.12, depth * 0.9, 0, wallHeight + 0.46, 0, SNOW);
    builder.cylinder('flag-pole', 3.6, 0.09, 0.09, -width * 0.32, wallHeight + 2.0, 0, WOOD_DARK, 6);
    builder.box('flag', 2.0, 1.1, 0.05, -width * 0.32 + 1.0, wallHeight + 3.2, 0, RED);
    builder.box('flag-cross-v', 0.28, 1.1, 0.07, -width * 0.32 + 1.0, wallHeight + 3.2, 0.01, CREAM);
    builder.box('flag-cross-h', 1.1, 0.28, 0.07, -width * 0.32 + 1.0, wallHeight + 3.2, 0.01, CREAM);
  }

  return builder.finish(prop.id);
}

function buildDock(scene: Scene, material: ShaderMaterial, prop: MapProp): Mesh | null {
  const dimensions = prop.dimensions ?? { x: 5, y: 0.45, z: 20 };
  const builder = new PropBuilder(scene, material, prop.position, prop.rotationY);
  builder.box('deck', dimensions.x, 0.42, dimensions.z, 0, -0.21, 0, WOOD);
  const plankCount = Math.max(6, Math.round(dimensions.z / 2.2));
  for (let plank = 0; plank < plankCount; plank += 1) {
    const z = -dimensions.z / 2 + (plank + 0.5) * (dimensions.z / plankCount);
    builder.box('plank', dimensions.x * 1.01, 0.05, dimensions.z / plankCount * 0.86, 0, 0.015, z, plank % 2 === 0 ? WOOD_LIGHT : WOOD);
  }
  const postCount = Math.max(2, Math.round(dimensions.z / 8));
  for (let post = 0; post <= postCount; post += 1) {
    const z = -dimensions.z / 2 + 1.2 + (post / postCount) * (dimensions.z - 2.4);
    for (const side of [-1, 1]) {
      const world = builder.worldPoint(side * dimensions.x * 0.42, 0, z);
      const ground = sampleMapHeight(world.x, world.z) - 0.6;
      const top = prop.position.y - 0.35;
      const height = Math.max(1, top - ground);
      builder.cylinder('piling', height, 0.26, 0.32, side * dimensions.x * 0.42, (ground + top) / 2 - prop.position.y, z, WOOD_DARK, 8);
    }
  }
  return builder.finish(prop.id);
}

function buildLighthouse(scene: Scene, material: ShaderMaterial, prop: MapProp): Mesh | null {
  const builder = new PropBuilder(scene, material, prop.position, prop.rotationY);
  builder.cylinder('base', 2.4, 7.0, 7.4, 0, 1.2, 0, STONE, 20);
  builder.cylinder('tower', 18, 6.0, 7.0, 0, 10.5, 0, CREAM, 20);
  for (const band of [4.6, 10.2, 15.8]) {
    builder.cylinder('red-band', 2.2, 6.9, 6.9, 0, band, 0, RED, 20);
  }
  builder.torus('gallery', 9.4, 0.28, 0, 19.4, 0, WOOD_DARK);
  builder.cylinder('lantern', 2.2, 5.0, 5.4, 0, 20.7, 0, GLASS, 16);
  builder.cylinder('lantern-frame', 2.5, 5.8, 5.8, 0, 20.7, 0, WOOD_DARK, 8);
  builder.cone('roof', 2.6, 6.4, 0, 23.2, 0, DEEP_RED, 16);
  builder.sphere('light', 1.9, 0, 20.8, 0, YELLOW, 10);
  builder.box('door', 1.3, 2.4, 0.2, 0, 1.9, 3.55, WOOD_DARK);
  builder.box('door-frame', 1.7, 2.8, 0.14, 0, 1.9, 3.48, RED);
  builder.box('window', 0.7, 1.1, 0.12, 0, 12.5, 3.3, WINDOW_GLOW);
  builder.box('window', 0.7, 1.1, 0.12, 0, 16.8, 3.3, WINDOW_GLOW);
  return builder.finish(prop.id);
}

function buildFountain(scene: Scene, material: ShaderMaterial, prop: MapProp): Mesh | null {
  const builder = new PropBuilder(scene, material, prop.position, prop.rotationY);
  builder.cylinder('basin', 1.3, 8.8, 9.2, 0, 0.65, 0, STONE, 24);
  builder.cylinder('basin-inner', 0.2, 7.8, 7.8, 0, 1.32, 0, TEAL_DARK, 24);
  builder.cylinder('water', 0.12, 7.3, 7.3, 0, 1.42, 0, TEAL, 24);
  builder.cylinder('column', 2.5, 1.0, 1.4, 0, 2.2, 0, STONE, 12);
  builder.cylinder('bowl', 0.4, 3.4, 2.6, 0, 3.5, 0, STONE, 16);
  builder.cylinder('bowl-water', 0.1, 3.0, 3.0, 0, 3.72, 0, TEAL, 16);
  builder.sphere('finial', 0.9, 0, 4.1, 0, GOLD, 10);

  // A proud flamingo statue keeps the fountain firmly on-brand.
  builder.sphere('flamingo-body', 1.35, 0, 4.65, 0, PINK, 10);
  builder.sphere('flamingo-wing', 0.85, 0.2, 4.72, 0.2, PINK_LIGHT, 8);
  builder.cylinder('flamingo-neck', 1.45, 0.24, 0.34, 0.38, 5.35, 0, PINK, 8);
  builder.sphere('flamingo-head', 0.58, 0.42, 6.0, 0, PINK, 8);
  builder.cone('flamingo-beak', 0.55, 0.28, 0.72, 5.98, 0, BLACK, 6, Math.PI / 2);
  builder.cylinder('flamingo-leg', 1.1, 0.1, 0.12, -0.28, 3.85, 0, CORAL_DARK, 6);
  builder.cylinder('flamingo-leg', 1.1, 0.1, 0.12, 0.28, 3.85, 0, CORAL_DARK, 6);

  return builder.finish(prop.id);
}

function buildMaypole(scene: Scene, material: ShaderMaterial, prop: MapProp): Mesh | null {
  const builder = new PropBuilder(scene, material, prop.position, prop.rotationY);
  builder.cylinder('pole', 11, 0.35, 0.5, 0, 5.5, 0, WOOD, 10);
  builder.torus('top-ring', 2.4, 0.16, 0, 10.8, 0, YELLOW);
  builder.sphere('top', 0.75, 0, 11.4, 0, GOLD, 10);
  const ribbonColors = [CORAL, TEAL, YELLOW, CREAM, PINK, GLASS];
  for (let ribbon = 0; ribbon < ribbonColors.length; ribbon += 1) {
    const angle = (ribbon / ribbonColors.length) * Math.PI * 2;
    const leaf = CreateBox('ribbon', { width: 0.16, height: 10.2, depth: 0.03 }, scene);
    leaf.position.copyFrom(builder.worldPoint(Math.sin(angle) * 0.9, 5.5, Math.cos(angle) * 0.9));
    leaf.rotation.set(0.12 * Math.cos(angle), angle, 0.12 * Math.sin(angle));
    paintMesh(leaf, ribbonColors[ribbon] ?? CORAL);
    leaf.material = material;
    leaf.isPickable = false;
    builder.parts.push(leaf);
  }
  return builder.finish(prop.id);
}

function buildFlag(scene: Scene, material: ShaderMaterial, prop: MapProp): Mesh | null {
  const builder = new PropBuilder(scene, material, prop.position, prop.rotationY);
  const lagoon = prop.variant % 2 === 1;
  const primary = lagoon ? TEAL : RED;
  const secondary = lagoon ? CORAL : CREAM;
  builder.cylinder('pole', 9.5, 0.18, 0.3, 0, 4.75, 0, WOOD_DARK, 8);
  builder.sphere('pole-top', 0.36, 0, 9.65, 0, GOLD, 8);
  builder.box('flag', 3.0, 1.7, 0.06, 1.55, 8.45, 0, primary);
  builder.box('flag-band', 3.0, 0.24, 0.08, 1.55, 8.45, 0.02, secondary);
  builder.box('flag-mark-v', 0.3, 1.2, 0.09, 1.55, 8.45, 0.03, secondary);
  builder.box('flag-mark-h', 1.2, 0.3, 0.09, 1.55, 8.45, 0.03, secondary);
  return builder.finish(prop.id);
}

function buildLookout(scene: Scene, material: ShaderMaterial, prop: MapProp): Mesh | null {
  const builder = new PropBuilder(scene, material, prop.position, prop.rotationY);
  for (const x of [-2.2, 2.2]) {
    for (const z of [-2.2, 2.2]) {
      builder.cylinder('leg', 8.4, 0.24, 0.36, x, 4.2, z, WOOD_DARK, 8);
    }
  }
  for (const y of [2.4, 4.8, 7.2]) {
    builder.box('brace-x', 4.8, 0.12, 0.12, 0, y, -2.2, WOOD);
    builder.box('brace-x', 4.8, 0.12, 0.12, 0, y, 2.2, WOOD);
    builder.box('brace-z', 0.12, 0.12, 4.8, -2.2, y, 0, WOOD);
    builder.box('brace-z', 0.12, 0.12, 4.8, 2.2, y, 0, WOOD);
  }
  builder.box('platform', 6.2, 0.35, 6.2, 0, 8.4, 0, WOOD_LIGHT);
  for (const side of [-1, 1]) {
    builder.box('railing', 6.2, 0.12, 0.12, 0, 9.35, side * 3.0, WOOD_DARK);
    builder.box('railing', 0.12, 0.12, 6.2, side * 3.0, 9.35, 0, WOOD_DARK);
    for (let post = -2; post <= 2; post += 1) {
      builder.box('rail-post', 0.1, 0.9, 0.1, post * 1.4, 8.9, side * 3.0, WOOD);
      builder.box('rail-post', 0.1, 0.9, 0.1, side * 3.0, 8.9, post * 1.4, WOOD);
    }
  }
  builder.cone('roof', 2.2, 7.4, 0, 10.2, 0, DEEP_RED, 4, Math.PI / 4);
  builder.cylinder('ladder-rail', 8.2, 0.08, 0.08, 0, 4.1, 3.25, WOOD, 6);
  for (let rung = 1; rung <= 10; rung += 1) {
    builder.box('rung', 0.8, 0.08, 0.08, 0, rung * 0.7, 3.25, WOOD_LIGHT);
  }
  return builder.finish(prop.id);
}

function buildUmbrella(scene: Scene, material: ShaderMaterial, prop: MapProp): Mesh | null {
  const builder = new PropBuilder(scene, material, prop.position, prop.rotationY);
  const colors = [CORAL, TEAL, YELLOW];
  const canopy = colors[prop.variant % colors.length] ?? CORAL;
  builder.cylinder('pole', 3.4, 0.1, 0.12, 0, 1.7, 0, WOOD_LIGHT, 8);
  builder.cone('canopy', 1.15, 5.2, 0, 3.65, 0, canopy, 10);
  builder.torus('rim', 5.1, 0.12, 0, 3.12, 0, CREAM);
  builder.sphere('finial', 0.28, 0, 4.3, 0, CREAM, 6);
  builder.box('towel', 2.5, 0.03, 1.35, 1.4, 0.035, 0.7, prop.variant % 2 === 0 ? PINK : TEAL, 0.15);
  builder.box('towel-stripe', 2.5, 0.035, 0.18, 1.4, 0.045, 0.7, CREAM, 0.15);
  builder.sphere('ball', 0.55, -0.9, 0.28, 1.2, YELLOW, 8);
  builder.box('ball-stripe', 0.56, 0.12, 0.56, -0.9, 0.28, 1.2, CORAL);
  return builder.finish(prop.id);
}

function buildPineTemplate(scene: Scene, material: ShaderMaterial, variant: number): Mesh | null {
  const builder = new PropBuilder(scene, material, Vector3.Zero());
  const heightScale = variant === 1 ? 1.18 : variant === 2 ? 0.86 : 1;
  builder.cylinder('trunk', 3.2 * heightScale, 0.3, 0.52, 0, 1.6 * heightScale, 0, WOOD_DARK, 8);
  const tiers = [
    { y: 3.2, h: 3.7, d: 4.4 },
    { y: 5.4, h: 3.2, d: 3.4 },
    { y: 7.1, h: 2.6, d: 2.3 },
  ];
  for (let index = 0; index < tiers.length; index += 1) {
    const tier = tiers[index];
    if (!tier) continue;
    const color = variant === 1 ? PINE_DARK : variant === 2 ? PINE_LIGHT : PINE;
    builder.cone('tier', tier.h * heightScale, tier.d * heightScale, 0, tier.y * heightScale, 0, color, 10);
    builder.cone(
      'snow-cap',
      tier.h * 0.34 * heightScale,
      tier.d * 0.54 * heightScale,
      0,
      (tier.y + tier.h * 0.38) * heightScale,
      0,
      SNOW,
      10,
    );
  }
  return builder.finish(`pine_${variant}`);
}

function buildPalmTemplate(scene: Scene, material: ShaderMaterial, variant: number): Mesh | null {
  const builder = new PropBuilder(scene, material, Vector3.Zero());
  const height = variant === 1 ? 6.8 : 5.8;
  builder.cylinder('trunk', height, 0.28, 0.52, 0, height / 2, 0, WOOD, 10);
  for (let ring = 1; ring <= 5; ring += 1) {
    builder.torus('trunk-ring', 0.62 - ring * 0.03, 0.08, 0, ring * (height / 6), 0, WOOD_DARK);
  }
  const fronds = 7;
  for (let frond = 0; frond < fronds; frond += 1) {
    const angle = (frond / fronds) * Math.PI * 2 + (variant === 1 ? 0.2 : 0);
    const leaf = CreateBox('frond', { width: 0.5, height: 0.09, depth: 3.4 }, scene);
    leaf.position.copyFrom(builder.worldPoint(Math.sin(angle) * 1.45, height + 0.1, Math.cos(angle) * 1.45));
    leaf.rotation.set(-0.26, angle, 0);
    paintMesh(leaf, frond % 2 === 0 ? PALM : PALM_LIGHT);
    leaf.material = material;
    leaf.isPickable = false;
    builder.parts.push(leaf);
  }
  for (let coconut = 0; coconut < 3; coconut += 1) {
    const angle = (coconut / 3) * Math.PI * 2;
    builder.sphere('coconut', 0.32, Math.sin(angle) * 0.38, height - 0.15, Math.cos(angle) * 0.38, WOOD_DARK, 6);
  }
  return builder.finish(`palm_${variant}`);
}

function buildRockTemplate(scene: Scene, material: ShaderMaterial, variant: number): Mesh | null {
  const builder = new PropBuilder(scene, material, Vector3.Zero());
  const diameter = 1.6 + variant * 0.45;
  const rock = CreateSphere('rock', { diameter, segments: 6 }, scene);
  rock.scaling.set(1.25, 0.85, 1.0);
  paintMesh(rock, variant === 1 ? ROCK_DARK : ROCK);
  rock.material = material;
  rock.isPickable = false;
  builder.parts.push(rock);
  const cap = CreateSphere('rock-cap', { diameter: diameter * 0.72, segments: 6 }, scene);
  cap.scaling.set(1.15, 0.22, 0.92);
  cap.position.copyFrom(builder.worldPoint(0, diameter * 0.52, 0));
  paintMesh(cap, variant === 2 ? SNOW : SNOW_SHADOW);
  cap.material = material;
  cap.isPickable = false;
  builder.parts.push(cap);
  return builder.finish(`rock_${variant}`);
}

function buildFlamingo(scene: Scene, material: ShaderMaterial, x: number, z: number, scale: number, rotation: number): Mesh | null {
  const ground = sampleMapHeight(x, z);
  const builder = new PropBuilder(scene, material, new Vector3(x, ground, z), rotation);
  builder.cylinder('leg', 1.25 * scale, 0.09 * scale, 0.11 * scale, -0.25 * scale, 0.62 * scale, 0, CORAL_DARK, 6);
  builder.cylinder('leg', 1.25 * scale, 0.09 * scale, 0.11 * scale, 0.25 * scale, 0.62 * scale, 0, CORAL_DARK, 6);
  builder.sphere('body', 1.35 * scale, 0, 1.35 * scale, 0, PINK, 10);
  builder.sphere('wing', 0.95 * scale, 0.12 * scale, 1.4 * scale, 0.18 * scale, PINK_LIGHT, 8);
  builder.cylinder('neck', 1.5 * scale, 0.22 * scale, 0.34 * scale, 0.42 * scale, 2.1 * scale, 0, PINK, 8);
  builder.sphere('head', 0.55 * scale, 0.5 * scale, 2.85 * scale, 0, PINK, 8);
  builder.cone('beak', 0.6 * scale, 0.28 * scale, 0.82 * scale, 2.78 * scale, 0, BLACK, 6, Math.PI / 2);
  builder.sphere('eye', 0.1 * scale, 0.62 * scale, 2.93 * scale, 0.18 * scale, CREAM, 5);
  return builder.finish(`flamingo_${x}_${z}`);
}

function buildDistantMountains(scene: Scene, material: ShaderMaterial): Mesh | null {
  const builder = new PropBuilder(scene, material, Vector3.Zero());
  const peaks = [
    { x: -760, z: -520, h: 180, d: 340, snow: 0.36 },
    { x: -420, z: -820, h: 230, d: 430, snow: 0.4 },
    { x: 20, z: -900, h: 160, d: 300, snow: 0.34 },
    { x: 470, z: -760, h: 210, d: 390, snow: 0.38 },
    { x: 850, z: -360, h: 150, d: 280, snow: 0.32 },
    { x: 920, z: 180, h: 190, d: 330, snow: 0.36 },
    { x: 700, z: 720, h: 140, d: 300, snow: 0.3 },
    { x: 180, z: 880, h: 175, d: 320, snow: 0.34 },
    { x: -360, z: 820, h: 205, d: 360, snow: 0.38 },
    { x: -820, z: 420, h: 165, d: 300, snow: 0.32 },
  ];
  for (const peak of peaks) {
    builder.cone('mountain', peak.h, peak.d, peak.x, peak.h / 2 - 12, peak.z, mixColor(ROCK_DARK, GLASS, 0.22), 7);
    builder.cone('mountain-snow', peak.h * peak.snow, peak.d * 0.43, peak.x, peak.h * (1 - peak.snow / 2) - 12, peak.z, SNOW_SHADOW, 7);
  }
  return builder.finish('distant_mountains');
}

export interface MapVisuals {
  waterMaterial: ShaderMaterial;
  skyMaterial: ShaderMaterial;
  waterMesh: Mesh;
  skyMesh: Mesh;
  terrainMesh: Mesh;
}

export function buildFjordFiesta(scene: Scene, material: ShaderMaterial): MapVisuals {
  const skyMaterial = createSkyMaterial(scene, 'sky-material');
  const waterMaterial = createWaterMaterial(scene, 'water-material');

  const terrain = CreateGround(
    'fjord-terrain',
    { width: MAP_SIZE, height: MAP_SIZE, subdivisions: MAP_SEGMENTS, updatable: true },
    scene,
  );
  const positions = terrain.getVerticesData(VertexBuffer.PositionKind);
  const indices = terrain.getIndices();
  if (!positions || !indices) {
    throw new Error('The terrain mesh could not be generated.');
  }
  const vertexCount = positions.length / 3;
  const colors = new Float32Array(vertexCount * 4);
  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    const x = positions[vertex * 3] ?? 0;
    const z = positions[vertex * 3 + 2] ?? 0;
    const y = sampleMapHeight(x, z);
    positions[vertex * 3 + 1] = y;
    const color = terrainColorAt(x, z, y, terrainSlopeAt(x, z));
    colors[vertex * 4] = color.r;
    colors[vertex * 4 + 1] = color.g;
    colors[vertex * 4 + 2] = color.b;
    colors[vertex * 4 + 3] = color.a;
  }
  const normals = new Float32Array(vertexCount * 3);
  VertexData.ComputeNormals(positions, indices, normals);
  terrain.setVerticesData(VertexBuffer.PositionKind, positions, true);
  terrain.setVerticesData(VertexBuffer.NormalKind, normals, true);
  terrain.setVerticesData(VertexBuffer.ColorKind, colors, false, 4);
  terrain.material = material;
  terrain.isPickable = false;
  terrain.receiveShadows = false;
  terrain.alwaysSelectAsActiveMesh = true;

  const water = CreateGround(
    'fjord-water',
    { width: MAP_SIZE + 12, height: MAP_SIZE + 12, subdivisions: 96, updatable: false },
    scene,
  );
  const waterPositions = water.getVerticesData(VertexBuffer.PositionKind);
  if (!waterPositions) throw new Error('The water mesh could not be generated.');
  const waterColors = new Float32Array((waterPositions.length / 3) * 4);
  for (let vertex = 0; vertex < waterPositions.length / 3; vertex += 1) {
    const x = waterPositions[vertex * 3] ?? 0;
    const z = waterPositions[vertex * 3 + 2] ?? 0;
    const depth = WATER_LEVEL - sampleMapHeight(x, z);
    const depthRatio = Math.min(1, Math.max(0, depth / 16));
    const foam = depth <= 0 ? 0 : 1 - Math.min(1, Math.max(0, (depth - 0.2) / 3.4));
    const alpha = depth <= 0.05 ? 0 : Math.min(0.88, 0.38 + depthRatio * 0.5);
    waterColors[vertex * 4] = foam;
    waterColors[vertex * 4 + 1] = depthRatio;
    waterColors[vertex * 4 + 2] = 0;
    waterColors[vertex * 4 + 3] = alpha;
  }
  water.setVerticesData(VertexBuffer.ColorKind, waterColors, false, 4);
  water.material = waterMaterial;
  water.isPickable = false;
  water.position.y = WATER_LEVEL + 0.04;
  water.alwaysSelectAsActiveMesh = true;

  const sky = CreateSphere('fjord-sky', { diameter: 3200, segments: 32, sideOrientation: Mesh.BACKSIDE }, scene);
  sky.material = skyMaterial;
  sky.infiniteDistance = true;
  sky.isPickable = false;
  sky.alwaysSelectAsActiveMesh = true;
  sky.renderingGroupId = 0;

  const distantMountains = buildDistantMountains(scene, material);
  if (distantMountains) {
    distantMountains.isPickable = false;
    distantMountains.alwaysSelectAsActiveMesh = true;
  }

  const templates = new Map<string, Mesh>();
  for (let variant = 0; variant < 3; variant += 1) {
    const pine = buildPineTemplate(scene, material, variant);
    if (pine) templates.set(`pine_${variant}`, pine);
    const rock = buildRockTemplate(scene, material, variant);
    if (rock) templates.set(`rock_${variant}`, rock);
  }
  for (let variant = 0; variant < 2; variant += 1) {
    const palm = buildPalmTemplate(scene, material, variant);
    if (palm) templates.set(`palm_${variant}`, palm);
  }

  const scatterTransforms = new Map<string, Matrix[]>();
  const addScatter = (kind: string, prop: MapProp): void => {
    const list = scatterTransforms.get(kind) ?? [];
    const matrix = Matrix.Compose(
      new Vector3(prop.scale, prop.scale, prop.scale),
      Quaternion.RotationYawPitchRoll(prop.rotationY, 0, 0),
      new Vector3(prop.position.x, prop.position.y, prop.position.z),
    );
    list.push(matrix);
    scatterTransforms.set(kind, list);
  };

  for (const prop of FJORD_MAP.props) {
    if (prop.kind === 'pine') {
      addScatter(`pine_${prop.variant % 3}`, prop);
      continue;
    }
    if (prop.kind === 'palm') {
      addScatter(`palm_${prop.variant % 2}`, prop);
      continue;
    }
    if (prop.kind === 'rock') {
      addScatter(`rock_${prop.variant % 3}`, prop);
      continue;
    }

    let mesh: Mesh | null = null;
    switch (prop.kind) {
      case 'chalet':
      case 'beach_bar':
      case 'summit_lodge':
        mesh = buildChalet(scene, material, prop);
        break;
      case 'dock':
        mesh = buildDock(scene, material, prop);
        break;
      case 'lighthouse':
        mesh = buildLighthouse(scene, material, prop);
        break;
      case 'fountain':
        mesh = buildFountain(scene, material, prop);
        break;
      case 'maypole':
        mesh = buildMaypole(scene, material, prop);
        break;
      case 'signal_flag':
        mesh = buildFlag(scene, material, prop);
        break;
      case 'lookout_tower':
        mesh = buildLookout(scene, material, prop);
        break;
      case 'umbrella':
        mesh = buildUmbrella(scene, material, prop);
        break;
      default:
        break;
    }
    if (mesh) {
      mesh.isPickable = false;
      mesh.alwaysSelectAsActiveMesh = false;
    }
  }

  for (const [kind, matrices] of scatterTransforms) {
    const template = templates.get(kind);
    if (!template || matrices.length === 0) continue;
    const data = new Float32Array(matrices.length * 16);
    matrices.forEach((matrix, index) => matrix.copyToArray(data, index * 16));
    enableThinInstances(template, data);
  }

  const flamingos = [
    buildFlamingo(scene, material, 232, 214, 1.1, -0.5),
    buildFlamingo(scene, material, 246, 207, 0.9, 0.3),
    buildFlamingo(scene, material, 268, 253, 1.2, 1.8),
    buildFlamingo(scene, material, 154, 128, 0.85, -1.1),
  ];
  for (const flamingo of flamingos) {
    if (flamingo) {
      flamingo.isPickable = false;
      flamingo.alwaysSelectAsActiveMesh = false;
    }
  }

  // Decorative village plaza trim, kept visual-only so the authoritative
  // collision world remains the single source of truth.
  const plaza = CreateDisc('village-plaza-trim', { radius: 18.5, tessellation: 48 }, scene);
  plaza.position.set(0, sampleMapHeight(0, -10) + 0.06, -10);
  plaza.rotation.x = Math.PI / 2;
  paintMesh(plaza, hexToColor4('#8f8d7e'));
  plaza.material = material;
  plaza.isPickable = false;
  plaza.alphaIndex = 0;

  return { waterMaterial, skyMaterial, waterMesh: water, skyMesh: sky, terrainMesh: terrain };
}
