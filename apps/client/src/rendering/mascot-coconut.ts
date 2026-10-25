import { Color4, Quaternion, Vector3 } from '@babylonjs/core/Maths/math';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import type { Scene } from '@babylonjs/core/scene';
import { CoconutFacePainter, createFaceDecal } from './coconut-face';
import { fbm3, ink, mixColor, PartBin, seededRandom, shade } from './mascot-geometry';

/**
 * The Lagoon League coconut, after the owner's turnaround: a near-spherical,
 * very fibrous brown shell with vertical hair strokes, a slightly hairy edge
 * and three dark holes in a small triangle on top; a drawn angry face on the
 * upper front (see coconut-face.ts) and a dense hibiscus/plumeria lei worn
 * low around the lower third, tilted up toward the back.
 *
 * The shell rolls with the motion (quaternion driven by velocity). The face
 * and lei form an upright layer that turns toward the heading and leans into
 * the roll, so the expression always reads while the fibres visibly tumble.
 */

export const COCONUT_RADIUS = 0.7;
const SHELL_RADII = new Vector3(0.69, 0.71, 0.69);

const HUSK = ink('#7a4a26');
const HUSK_LIGHT = ink('#a9753f');
const HUSK_DARK = ink('#4c2c14');
const HOLE = ink('#24130a');
const HOLE_RIM = ink('#5e3a1c');
const LEAF = ink('#3fae49');
const LEAF_DARK = ink('#2a7d36');

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
 * of the crown just above the brows (shell space, ~55/55/44° latitude and
 * ~20° apart so they read as three separate holes from the chase camera).
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

export interface CoconutRig {
  visual: TransformNode;
  shell: TransformNode;
  face: TransformNode;
  painter: CoconutFacePainter;
  meshes: Mesh[];
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

export function buildCoconutRig(scene: Scene, material: ShaderMaterial, root: TransformNode): CoconutRig {
  const meshes: Mesh[] = [];
  const keep = (mesh: Mesh | null): void => {
    if (mesh) meshes.push(mesh);
  };
  const visual = node(scene, 'coconut-visual', root, 0, COCONUT_RADIUS, 0);

  // --- rolling shell ------------------------------------------------------------
  const shell = node(scene, 'coconut-shell', visual);
  shell.rotationQuaternion = Quaternion.Identity();
  const shellBin = new PartBin(scene, 'coconut-shell-mesh');
  shellBin.blob(SHELL_RADII, huskPaint, {}, 34, (point, unit) => {
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
    shellBin.blob(new Vector3(0.07, 0.06, 0.016), HOLE_RIM, { at: inset(0.012), rotation: facing(hole) }, 10);
    shellBin.blob(new Vector3(0.055, 0.045, 0.02), HOLE, { at: inset(0.012), rotation: facing(hole) }, 10);
  }
  // Fibre tufts so the silhouette is hairy, not a perfect ball.
  const random = seededRandom(1337);
  for (let index = 0; index < 190; index += 1) {
    const u = random() * 2 - 1;
    const theta = random() * Math.PI * 2;
    const ring = Math.sqrt(1 - u * u);
    const direction = new Vector3(Math.cos(theta) * ring, u, Math.sin(theta) * ring);
    if (direction.y > 0.85) continue;
    if (HOLE_DIRECTIONS.some((hole) => Vector3.Dot(direction, hole) > HOLE_CLEARANCE)) continue;
    const base = onShell(direction, -0.01);
    // Short enough to stay under the face decal while the shell tumbles.
    const length = 0.025 + random() * 0.03;
    // Fibres comb slightly along the meridians.
    const comb = new Vector3(-direction.x * direction.y, 1 - direction.y * direction.y, -direction.z * direction.y)
      .normalize()
      .scale(0.35 + random() * 0.3);
    const tipDirection = direction.add(comb).normalize();
    const spike = CreateCylinder(
      'coconut-fibre',
      { height: length, diameterTop: 0, diameterBottom: 0.018 + random() * 0.014, tessellation: 4 },
      scene,
    );
    const rotation = new Quaternion();
    Quaternion.FromUnitVectorsToRef(Vector3.Up(), tipDirection, rotation);
    spike.rotationQuaternion = rotation;
    spike.position.copyFrom(base.add(tipDirection.scale(length / 2)));
    spike.bakeCurrentTransformIntoVertices();
    shellBin.push(spike, random() > 0.5 ? HUSK_LIGHT : HUSK_DARK);
  }
  keep(shellBin.merge(material, shell));

  // --- upright face + lei layer ------------------------------------------------------
  const face = node(scene, 'coconut-face', visual);
  const faceBin = new PartBin(scene, 'coconut-face-mesh');
  // Lei worn low like a necklace: lowest at the front, rising toward the back.
  const leiHeight = (angle: number): number => -0.52 + (1 - Math.cos(angle)) * 0.2;
  const flowerCount = 22;
  for (let index = 0; index < flowerCount; index += 1) {
    const angle = (index / flowerCount) * Math.PI * 2 + 0.07;
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
      faceBin.blob(
        new Vector3(petalLength * 0.62, petalLength * (big ? 0.5 : 0.42), 0.018),
        (point) => (Vector3.Distance(point, centre) < petalLength * 0.45 ? shade(spec.petal, 0.86) : spec.petal),
        { at: centre.add(offset), rotation: new Vector3(orient.x, orient.y, petalAngle) },
        8,
      );
    }
    faceBin.blob(new Vector3(0.024, 0.024, 0.02), spec.centre, { at: onShell(direction, 0.06), rotation: orient }, 8);
    // Two leaves peeking out between this flower and the next.
    for (const side of [-1, 1]) {
      const leafAngle = angle + (side * Math.PI) / flowerCount;
      const leafDirection = new Vector3(Math.sin(leafAngle), leiHeight(leafAngle) + side * 0.08, Math.cos(leafAngle));
      const leafOrient = facing(leafDirection, side * 0.9);
      faceBin.blob(
        new Vector3(0.075, 0.03, 0.012),
        (point) => (Math.abs(point.y - onShell(leafDirection, 0.03).y) < 0.006 ? LEAF_DARK : LEAF),
        { at: onShell(leafDirection, 0.028), rotation: leafOrient },
        8,
      );
    }
  }
  keep(faceBin.merge(material, face));

  // Drawn face decal (expressions are repainted, not remodelled).
  const painter = new CoconutFacePainter(scene);
  const decal = createFaceDecal(scene, SHELL_RADII, 0.06);
  decal.material = painter.material;
  decal.parent = face;
  meshes.push(decal);

  return { visual, shell, face, painter, meshes };
}
