import { Color4, Quaternion, Vector3 } from '@babylonjs/core/Maths/math';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import type { Scene } from '@babylonjs/core/scene';
import { CoconutFaceDecal } from './coconut-expression';
import { fbm3, ink, mixColor, PartBin, seededRandom, shade } from './mascot-geometry';
import { excludeFromInk, excludeFromShadows } from './materials';
import { buildRigidSkin } from './mascot-rig';

/**
 * The Lagoon League coconut, after the owner's turnaround: a near-spherical,
 * very fibrous brown shell with three dark holes in a small triangle on top;
 * the owner's painted face (coconut-expression.ts) on the upper front and a
 * dense hibiscus/plumeria lei worn low around the lower third, tilted up
 * toward the back.
 *
 * Node layout (feet at y = 0):
 *   visual        centre pivot: squash & stretch, bob
 *   wobbleYaw → wobbleScale → wobbleUnyaw   jelly wobble along an arbitrary
 *                 horizontal axis (direction changes)
 *   shell         rolls with the motion (quaternion); the shell MESH is
 *                 swappable (procedural husk or the owner's Meshy shell)
 *   face          upright layer that turns to the heading and leans into turns
 *   lei-0…7       eight spring-driven lei segments, ONE skinned mesh
 *   facePivot     the painted face decal (squash "pop" on expression swaps)
 */

export const COCONUT_RADIUS = 0.7;
export const SHELL_RADII = new Vector3(0.69, 0.71, 0.69);
export const LEI_SEGMENTS = 8;

const HUSK = ink('#7a4a26');
const HUSK_LIGHT = ink('#a9753f');
const HUSK_DARK = ink('#4c2c14');
const HOLE = ink('#24130a');
const HOLE_RIM = ink('#5e3a1c');
const LEAF = ink('#3fae49');
const LEAF_DARK = ink('#2a7d36');
/** Painted-husk tints (multiplied with the texture). */
const TINT_PLAIN = ink('#ffffff');
const TINT_HOLE = ink('#2a1c14');
const TINT_RIM = ink('#8a6a52');
const TINT_FIBRE_LIGHT = ink('#ffe2bc');
const TINT_FIBRE_DARK = ink('#a88c74');

/** Flower palette from the reference: pink, orange, yellow, blue, white. */
const FLOWERS: ReadonlyArray<{ petal: Color4; centre: Color4; kind: 'hibiscus' | 'plumeria' }> = [
  { petal: ink('#ff5fa2'), centre: ink('#ffe066'), kind: 'hibiscus' },
  { petal: ink('#ff8c2e'), centre: ink('#ffd23f'), kind: 'hibiscus' },
  { petal: ink('#ffd23f'), centre: ink('#ff8c2e'), kind: 'plumeria' },
  { petal: ink('#4fa8ff'), centre: ink('#fff4c2'), kind: 'plumeria' },
  { petal: ink('#fff8ec'), centre: ink('#ffd23f'), kind: 'plumeria' },
  { petal: ink('#ff3d6e'), centre: ink('#ffe066'), kind: 'hibiscus' },
];

/**
 * The three "eye" holes: two side by side and one below them, on the front
 * of the crown (shell space, ~55/55/44° latitude and ~20° apart so they read
 * as three separate holes from the chase camera).
 */
const HOLE_DIRECTIONS = [
  new Vector3(-0.17, 0.82, 0.55).normalize(),
  new Vector3(0.17, 0.82, 0.55).normalize(),
  new Vector3(0, 0.7, 0.71).normalize(),
];
/** cos of a hole's angular radius (≈ 4.5°). */
const HOLE_CONE = 0.9969;
/** Fibres keep clear of the holes by this much (cos 8°). */
const HOLE_CLEARANCE = Math.cos((8 * Math.PI) / 180);

/** How the shell surface is painted. */
export type ShellStyle = 'painted' | 'vertex';

export interface CoconutRig {
  visual: TransformNode;
  wobbleYaw: TransformNode;
  wobbleScale: TransformNode;
  wobbleUnyaw: TransformNode;
  shell: TransformNode;
  facePivot: TransformNode;
  face: TransformNode;
  lei: LeiBuild;
  /** Procedural shell mesh (null while the Meshy shell is in use). */
  shellMesh: Mesh | null;
  decal: CoconutFaceDecal;
}

function node(scene: Scene, name: string, parent: TransformNode, x = 0, y = 0, z = 0): TransformNode {
  const transform = new TransformNode(name, scene);
  transform.parent = parent;
  transform.position.set(x, y, z);
  return transform;
}

/** Point on the shell surface (face space) in a direction, pushed out by `lift`. */
function onShell(direction: Vector3, lift: number): Vector3 {
  const d = direction.normalizeToNew();
  const radius =
    1 / Math.sqrt((d.x / SHELL_RADII.x) ** 2 + (d.y / SHELL_RADII.y) ** 2 + (d.z / SHELL_RADII.z) ** 2);
  return d.scale(radius + lift);
}

/** Euler angles that turn local +Z toward `direction` (for surface decals). */
function facing(direction: Vector3, roll = 0): Vector3 {
  const d = direction.normalizeToNew();
  const yaw = Math.atan2(d.x, d.z);
  const pitch = -Math.asin(Math.max(-1, Math.min(1, d.y)));
  return new Vector3(pitch, yaw, roll);
}

/** Lumps and fibre ridges of the shell surface, as a radius scale for a unit direction. */
function shellRelief(unit: Vector3): number {
  const lumps = (fbm3(unit.x * 4.5, unit.y * 4.5, unit.z * 4.5) - 0.5) * 0.07;
  const longitude = Math.atan2(unit.x, unit.z);
  const ridges = Math.sin(longitude * 30 + fbm3(unit.x * 3, unit.y * 3, unit.z * 3) * 7) * 0.008;
  return 1 + lumps + ridges;
}

function huskPaint(point: Vector3): Color4 {
  const length = point.length() || 1;
  const unit = point.scale(1 / length);
  for (const hole of HOLE_DIRECTIONS) {
    if (Vector3.Dot(unit, hole) > HOLE_CONE) return HOLE;
  }
  const longitude = Math.atan2(unit.x, unit.z);
  const latitude = Math.asin(Math.max(-1, Math.min(1, unit.y)));
  const warp = fbm3(point.x * 3.2, point.y * 3.2, point.z * 3.2) * 7;
  // Vertical hair strokes running pole to pole.
  const striation = Math.sin(longitude * 38 + warp + latitude * 1.5);
  const speckle = fbm3(point.x * 14, point.y * 14, point.z * 14);
  let color = striation > 0.55 ? HUSK_LIGHT : striation < -0.6 ? HUSK_DARK : HUSK;
  if (speckle > 0.7) color = shade(color, 1.18);
  else if (speckle < 0.3) color = shade(color, 0.82);
  // The very top of the cap is darker and smoother, like the real nut.
  if (unit.y > 0.93) color = mixColor(color, HUSK_DARK, (unit.y - 0.93) * 6);
  return color;
}

/** Tint for the painted husk texture: plain everywhere except the pores. */
function huskTint(point: Vector3): Color4 {
  const unit = point.normalizeToNew();
  for (const hole of HOLE_DIRECTIONS) {
    if (Vector3.Dot(unit, hole) > HOLE_CONE) return TINT_HOLE;
  }
  return TINT_PLAIN;
}

/**
 * The procedural shell: lumpy husk, three pores and fibre tufts. `painted`
 * keeps UVs for the painted husk texture (vertex colours become tints);
 * `vertex` paints the husk procedurally into the vertex colours.
 */
export function buildCoconutShell(scene: Scene, material: ShaderMaterial, parent: TransformNode, style: ShellStyle): Mesh | null {
  const painted = style === 'painted';
  const shellBin = new PartBin(scene, 'coconut-shell-mesh');
  shellBin.blob(SHELL_RADII, painted ? huskTint : huskPaint, {}, 40, (point, unit) => {
    let scale = shellRelief(unit);
    for (const hole of HOLE_DIRECTIONS) {
      const alignment = Vector3.Dot(unit, hole);
      if (alignment > HOLE_CONE) scale -= (alignment - HOLE_CONE) * 7;
    }
    point.scaleInPlace(scale);
  });
  // Each hole is its own dark inset with a lighter worn rim, so it reads
  // regardless of how densely the shell is tessellated.
  for (const hole of HOLE_DIRECTIONS) {
    const surface = onShell(hole, 0).scale(shellRelief(hole));
    const inset = (depth: number): Vector3 => surface.subtract(hole.scale(depth));
    shellBin.blob(new Vector3(0.07, 0.06, 0.016), painted ? TINT_RIM : HOLE_RIM, { at: inset(0.012), rotation: facing(hole) }, 10);
    shellBin.blob(new Vector3(0.055, 0.045, 0.02), painted ? TINT_HOLE : HOLE, { at: inset(0.012), rotation: facing(hole) }, 10);
  }
  pushFibres(scene, shellBin, painted);
  return shellBin.merge(material, parent);
}

/** Fibre tufts so the silhouette is hairy, not a perfect ball. */
function pushFibres(scene: Scene, bin: PartBin, painted: boolean, count = 190, radiusScale = 1): void {
  const random = seededRandom(1337);
  for (let index = 0; index < count; index += 1) {
    const u = random() * 2 - 1;
    const theta = random() * Math.PI * 2;
    const ring = Math.sqrt(1 - u * u);
    const direction = new Vector3(Math.cos(theta) * ring, u, Math.sin(theta) * ring);
    if (direction.y > 0.85) continue;
    if (HOLE_DIRECTIONS.some((hole) => Vector3.Dot(direction, hole) > HOLE_CLEARANCE)) continue;
    const base = onShell(direction, -0.01).scale(radiusScale);
    // Short enough to stay under the face decal while the shell tumbles.
    const length = (0.025 + random() * 0.03) * radiusScale;
    // Fibres comb slightly along the meridians.
    const comb = new Vector3(-direction.x * direction.y, 1 - direction.y * direction.y, -direction.z * direction.y)
      .normalize()
      .scale(0.35 + random() * 0.3);
    const tipDirection = direction.add(comb).normalize();
    const spike = CreateCylinder(
      'coconut-fibre',
      { height: length, diameterTop: 0, diameterBottom: (0.018 + random() * 0.014) * radiusScale, tessellation: 4 },
      scene,
    );
    const rotation = new Quaternion();
    Quaternion.FromUnitVectorsToRef(Vector3.Up(), tipDirection, rotation);
    spike.rotationQuaternion = rotation;
    spike.position.copyFrom(base.add(tipDirection.scale(length / 2)));
    spike.bakeCurrentTransformIntoVertices();
    const light = random() > 0.5;
    bin.push(spike, painted ? (light ? TINT_FIBRE_LIGHT : TINT_FIBRE_DARK) : light ? HUSK_LIGHT : HUSK_DARK);
  }
}

/**
 * Fibre fringe for a smooth external shell (the Meshy nut): the same spiky
 * tufts as the procedural husk, vertex coloured, as their own small mesh.
 */
export function buildFibreFringe(scene: Scene, material: ShaderMaterial, parent: TransformNode): Mesh | null {
  const bin = new PartBin(scene, 'coconut-fibre-fringe');
  pushFibres(scene, bin, false, 320, 1.0);
  return bin.merge(material, parent);
}

export function buildCoconutRig(
  scene: Scene,
  shellMaterial: ShaderMaterial,
  leiMaterial: ShaderMaterial,
  root: TransformNode,
  style: ShellStyle,
  leiStyle: LeiStyle,
): CoconutRig {
  const visual = node(scene, 'coconut-visual', root, 0, COCONUT_RADIUS, 0);
  const wobbleYaw = node(scene, 'coconut-wobble-yaw', visual);
  const wobbleScale = node(scene, 'coconut-wobble-scale', wobbleYaw);
  const wobbleUnyaw = node(scene, 'coconut-wobble-unyaw', wobbleScale);

  // --- rolling shell ------------------------------------------------------------
  const shell = node(scene, 'coconut-shell', wobbleUnyaw);
  shell.rotationQuaternion = Quaternion.Identity();
  const shellMesh = buildCoconutShell(scene, shellMaterial, shell, style);

  // --- upright face + lei layer ------------------------------------------------------
  const face = node(scene, 'coconut-face', wobbleUnyaw);
  const lei = leiStyle === 'painted' ? buildPaintedLei(scene, leiMaterial, face) : buildProceduralLei(scene, leiMaterial, face);

  // Painted face decal (expressions swap cells; the procedural painter is the fallback).
  const facePivot = node(scene, 'coconut-face-pivot', face);
  const decal = new CoconutFaceDecal(scene, facePivot, SHELL_RADII, 0.06);

  return {
    visual,
    wobbleYaw,
    wobbleScale,
    wobbleUnyaw,
    shell,
    face,
    facePivot,
    lei,
    shellMesh,
    decal,
  };
}

/** Lei garland: spring-driven segments (bones) skinned into one mesh. */
export interface LeiBuild {
  style: LeiStyle;
  root: TransformNode;
  segments: TransformNode[];
  /** Horizontal outward direction of each segment (face space). */
  directions: Vector3[];
  mesh: Mesh | null;
}

export type LeiStyle = 'painted' | 'procedural';

/** Lei worn low like a necklace: lowest at the front, rising toward the back. */
function leiHeight(angle: number): number {
  return -0.52 + (1 - Math.cos(angle)) * 0.2;
}

function leiRoot(scene: Scene, face: TransformNode, count: number, name: string): Pick<LeiBuild, 'root' | 'segments' | 'directions'> {
  const root = node(scene, name, face);
  const segments: TransformNode[] = [];
  const directions: Vector3[] = [];
  for (let segment = 0; segment < count; segment += 1) {
    // Segment pivots sit at the nut's centre, so their small rotations slide
    // the flowers along the shell surface instead of into it.
    segments.push(node(scene, `${name}-${segment}`, root));
    const angle = (segment / count) * Math.PI * 2;
    directions.push(new Vector3(Math.sin(angle), 0, Math.cos(angle)));
  }
  return { root, segments, directions };
}

/** The 1C geometric lei (blob petals and leaves), now 8 spring segments. Fallback. */
export function buildProceduralLei(scene: Scene, material: ShaderMaterial, face: TransformNode): LeiBuild {
  const base = leiRoot(scene, face, LEI_SEGMENTS, 'coconut-lei');
  const bins = base.segments.map((_, segment) => new PartBin(scene, `coconut-lei-${segment}-mesh`));
  const flowerCount = 22;
  const segmentOf = (angle: number): number => {
    const wrapped = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    return Math.round((wrapped / (Math.PI * 2)) * LEI_SEGMENTS) % LEI_SEGMENTS;
  };
  for (let index = 0; index < flowerCount; index += 1) {
    const angle = (index / flowerCount) * Math.PI * 2 + 0.07;
    const bin = bins[segmentOf(angle)];
    if (!bin) continue;
    const wobble = Math.sin(index * 2.3) * 0.03;
    const direction = new Vector3(Math.sin(angle), leiHeight(angle) + wobble, Math.cos(angle));
    const centre = onShell(direction, 0.045);
    const spec = FLOWERS[index % FLOWERS.length] ?? FLOWERS[0];
    if (!spec) continue;
    const orient = facing(direction);
    const big = spec.kind === 'hibiscus';
    const petalLength = big ? 0.075 : 0.06;
    for (let petal = 0; petal < 5; petal += 1) {
      const petalAngle = (petal / 5) * Math.PI * 2 + index;
      const local = new Vector3(Math.cos(petalAngle) * petalLength * 0.7, Math.sin(petalAngle) * petalLength * 0.7, 0);
      const holder = new TransformNode('petal-tmp', scene);
      holder.rotation.copyFrom(orient);
      holder.computeWorldMatrix(true);
      const offset = Vector3.TransformNormal(local, holder.getWorldMatrix());
      holder.dispose();
      bin.blob(
        new Vector3(petalLength * 0.62, petalLength * (big ? 0.5 : 0.42), 0.018),
        (point) => (Vector3.Distance(point, centre) < petalLength * 0.45 ? shade(spec.petal, 0.86) : spec.petal),
        { at: centre.add(offset), rotation: new Vector3(orient.x, orient.y, petalAngle) },
        8,
      );
    }
    bin.blob(new Vector3(0.024, 0.024, 0.02), spec.centre, { at: onShell(direction, 0.06), rotation: orient }, 8);
    // Two leaves peeking out between this flower and the next.
    for (const side of [-1, 1]) {
      const leafAngle = angle + (side * Math.PI) / flowerCount;
      const leafDirection = new Vector3(Math.sin(leafAngle), leiHeight(leafAngle) + side * 0.08, Math.cos(leafAngle));
      const leafOrient = facing(leafDirection, side * 0.9);
      bin.blob(
        new Vector3(0.075, 0.03, 0.012),
        (point) => (Math.abs(point.y - onShell(leafDirection, 0.03).y) < 0.006 ? LEAF_DARK : LEAF),
        { at: onShell(leafDirection, 0.028), rotation: leafOrient },
        8,
      );
    }
  }
  bins.forEach((bin, segment) => {
    const target = base.segments[segment];
    if (target) bin.merge(material, target);
  });
  const skin = buildRigidSkin(scene, 'coconut-lei', base.root, material);
  return { style: 'procedural', ...base, mesh: skin?.mesh ?? null };
}

export const LEI_ATLAS_URL = `${import.meta.env.BASE_URL}art/mascot/lei-flowers.png`;
/** Owner's lei flower sheet, 4x4 cells of 256 on a 1024² atlas (sheet order). */
const LEI_CELL = {
  hibiscusCoral: 0,
  hibiscusOrange: 1,
  hibiscusYellow: 2,
  hibiscusRed: 3,
  plumeriaWhite: 4,
  plumeriaYellow: 5,
  plumeriaCoral: 6,
  plumeriaOrange: 7,
  blossomBlue: 8,
  blossomRoyal: 9,
  blossomSky: 10,
  blossomViolet: 11,
  leafA: 12,
  leafB: 13,
  fern: 14,
  leafPair: 15,
} as const;
/** Colour order around the garland, after the owner's turnaround. */
const LEI_SEQUENCE: readonly number[] = [
  LEI_CELL.hibiscusCoral,
  LEI_CELL.plumeriaWhite,
  LEI_CELL.blossomBlue,
  LEI_CELL.hibiscusOrange,
  LEI_CELL.plumeriaYellow,
  LEI_CELL.blossomSky,
  LEI_CELL.hibiscusRed,
  LEI_CELL.plumeriaCoral,
  LEI_CELL.blossomViolet,
  LEI_CELL.hibiscusYellow,
  LEI_CELL.plumeriaOrange,
  LEI_CELL.blossomRoyal,
];
const LEAF_SEQUENCE: readonly number[] = [LEI_CELL.leafA, LEI_CELL.leafPair, LEI_CELL.leafB, LEI_CELL.fern];
/** Painted flowers around the ring, each its own spring bone. */
export const PAINTED_LEI_FLOWERS = 24;

/** A slightly cupped card (3x3 grid) facing +Z, UVs on one atlas cell. */
function leiCard(scene: Scene, cell: number, size: number, cup: number): Mesh {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const column = cell % 4;
  const row = Math.floor(cell / 4);
  const inset = 2 / 1024;
  const u0 = column / 4 + inset;
  const v0 = row / 4 + inset;
  const span = 0.25 - inset * 2;
  const steps = 3;
  for (let j = 0; j <= steps; j += 1) {
    for (let i = 0; i <= steps; i += 1) {
      const x = (i / steps - 0.5) * size;
      const y = (0.5 - j / steps) * size;
      const r = (x * x + y * y) / ((size * size) / 4);
      positions.push(x, y, -cup * r * size);
      uvs.push(u0 + (i / steps) * span, v0 + (j / steps) * span);
    }
  }
  for (let j = 0; j < steps; j += 1) {
    for (let i = 0; i < steps; i += 1) {
      const a = j * (steps + 1) + i;
      const b = a + 1;
      const c = a + steps + 1;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const data = new VertexData();
  data.positions = positions;
  data.uvs = uvs;
  data.indices = indices;
  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);
  data.normals = normals;
  const mesh = new Mesh('coconut-lei-card', scene);
  data.applyToMesh(mesh);
  return mesh;
}

/**
 * The owner's painted lei: flower cards (hibiscus, plumeria, blossoms) with
 * leaves tucked between them, all on one atlas, one skinned mesh, one draw
 * call; every flower is its own spring bone (lag and bounce per flower).
 */
export function buildPaintedLei(scene: Scene, material: ShaderMaterial, face: TransformNode): LeiBuild {
  const base = leiRoot(scene, face, PAINTED_LEI_FLOWERS, 'coconut-painted-lei');
  const random = seededRandom(4242);
  const place = (card: Mesh, direction: Vector3, lift: number, roll: number, parent: TransformNode): void => {
    const orient = facing(direction, roll);
    card.rotation.copyFrom(orient);
    card.position.copyFrom(onShell(direction, lift));
    card.bakeCurrentTransformIntoVertices();
    card.parent = parent;
  };
  for (let index = 0; index < PAINTED_LEI_FLOWERS; index += 1) {
    const segment = base.segments[index];
    if (!segment) continue;
    const angle = (index / PAINTED_LEI_FLOWERS) * Math.PI * 2 + 0.05;
    const cell = LEI_SEQUENCE[index % LEI_SEQUENCE.length] ?? 0;
    const hibiscus = cell <= LEI_CELL.hibiscusRed;
    const blossom = cell >= LEI_CELL.blossomBlue;
    // Card sizes so the painted flowers (≈ 2/3 of a cell, blossoms ≈ 1/2) read
    // 18–24 cm across and overlap into one dense garland, as on the owner's sheet.
    const size = hibiscus ? 0.36 : blossom ? 0.36 : 0.33;
    const wobble = (random() - 0.5) * 0.05;
    const direction = new Vector3(Math.sin(angle), leiHeight(angle) + wobble, Math.cos(angle));
    // Leaves first, a touch lower on the shell so the flowers overlap them.
    const leafAngle = angle + Math.PI / PAINTED_LEI_FLOWERS;
    const leafCell = LEAF_SEQUENCE[index % LEAF_SEQUENCE.length] ?? LEI_CELL.leafA;
    const leafDirection = new Vector3(Math.sin(leafAngle), leiHeight(leafAngle) + (index % 2 === 0 ? 0.07 : -0.06), Math.cos(leafAngle));
    const leaf = leiCard(scene, leafCell, 0.3, 0.08);
    const leafRoll = (index % 2 === 0 ? 1 : -1) * (0.9 + random() * 0.6) + Math.PI;
    place(leaf, leafDirection, 0.012, leafRoll, segment);
    const flower = leiCard(scene, cell, size, 0.1);
    place(flower, direction, 0.034 + random() * 0.012, random() * Math.PI * 2, segment);
  }
  const skin = buildRigidSkin(scene, 'coconut-painted-lei', base.root, material);
  if (skin) {
    excludeFromInk(skin.mesh);
    excludeFromShadows(skin.mesh);
  }
  return { style: 'painted', ...base, mesh: skin?.mesh ?? null };
}
