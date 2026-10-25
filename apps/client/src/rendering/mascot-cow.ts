import { Color4, Vector3 } from '@babylonjs/core/Maths/math';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import type { Scene } from '@babylonjs/core/scene';
import { fbm3, ink, mixColor, PartBin, shade, smoothNormals, type Paint } from './mascot-geometry';

/**
 * The Peak Guard cow, built to the owner's turnaround sheet: barrel body
 * with a deep chest and a slightly sagging belly, large rounded Holstein
 * patches, a big boxy-rounded head with a black eye patch, salmon-pink muzzle,
 * short ivory horns with dark tips, curly tuft, black/pink floppy ears,
 * stitched leather collar with a big copper bell, blue-grey bedroll, leather
 * saddlebags, girth strap, pink udder, tufted tail and four articulated legs
 * with cloven hooves.
 *
 * Space: +Z forward, +Y up, feet at y = 0. `visual` sits at the barrel centre
 * so whole-body tilts (gallop rocking, rearing, flips) pivot naturally.
 */

export const COW_BODY_CENTER_Y = 0.95;
const HIP_Y = -0.26;
const LEG_X = 0.27;
const FRONT_Z = 0.44;
const HIND_Z = -0.46;
const UPPER_LEG = 0.32;
const LOWER_LEG = 0.27;

const WHITE = ink('#f8f5ee');
const WHITE_SHADE = ink('#e9e4da');
const BLACK = ink('#1d1a1b');
const PINK = ink('#e8919a');
const PINK_DARK = ink('#c86a76');
const PINK_INNER = ink('#f2a7b0');
const NOSTRIL = ink('#5a2830');
const HORN = ink('#f3e6c4');
const HOOF = ink('#2b2826');
const LEATHER = ink('#7a4a26');
const LEATHER_DARK = ink('#5a3418');
const STITCH = ink('#e0b47a');
const BRASS = ink('#e8b030');
const COPPER = ink('#c8742e');
const COPPER_LIGHT = ink('#ee9f58');
const COPPER_DARK = ink('#8a4a1c');
const BELL_MOUTH = ink('#2e1a10');
const BEDROLL = ink('#6f8fae');
const BEDROLL_DARK = ink('#3f5a78');
const EYE_WHITE = ink('#ffffff');
const PUPIL = ink('#141015');

interface Patch {
  center: Vector3;
  radius: number;
}

/**
 * Irregular rounded patches: distance ratio wobbled by low-frequency noise,
 * with a narrow smooth edge so vertex interpolation cannot stair-step it.
 */
function patchPaint(patches: readonly Patch[], base: Color4, spot: Color4, wobble = 0.5, seed = 0): Paint {
  return (point) => {
    let coverage = 0;
    for (const patch of patches) {
      const ratio = Vector3.Distance(point, patch.center) / patch.radius;
      const jitter = (fbm3(point.x * 2.6 + seed, point.y * 2.6, point.z * 2.6) - 0.5) * wobble;
      const edge = ratio + jitter;
      coverage = Math.max(coverage, Math.min(1, Math.max(0, (1.04 - edge) / 0.08)));
    }
    // Soft cool shade toward the belly keeps the white readable in toon light.
    const white = point.y < -0.25 ? mixColor(base, WHITE_SHADE, Math.min(1, (-0.25 - point.y) * 3)) : base;
    return coverage > 0 ? mixColor(white, spot, coverage * coverage * (3 - 2 * coverage)) : white;
  };
}

const BODY_PATCHES: readonly Patch[] = [
  { center: new Vector3(-0.44, 0.12, 0.24), radius: 0.36 },
  { center: new Vector3(0.45, 0.06, 0.3), radius: 0.3 },
  { center: new Vector3(-0.42, 0.06, -0.4), radius: 0.27 },
  { center: new Vector3(0.38, 0.18, -0.5), radius: 0.34 },
  { center: new Vector3(0.04, 0.46, -0.14), radius: 0.24 },
  { center: new Vector3(-0.32, -0.32, 0.02), radius: 0.11 },
];

export interface CowRig {
  visual: TransformNode;
  body: TransformNode;
  neck: TransformNode;
  head: TransformNode;
  eyeLeft: TransformNode;
  eyeRight: TransformNode;
  browLeft: TransformNode;
  browRight: TransformNode;
  earLeft: TransformNode;
  earRight: TransformNode;
  bell: TransformNode;
  tailUpper: TransformNode;
  tailLower: TransformNode;
  /** Order: front-left, front-right, hind-left, hind-right. */
  hips: [TransformNode, TransformNode, TransformNode, TransformNode];
  knees: [TransformNode, TransformNode, TransformNode, TransformNode];
  meshes: Mesh[];
}

/** Rotates an offset about +Y (Babylon convention: +Z turns toward +X). */
function rotateY(offset: Vector3, angle: number): Vector3 {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return new Vector3(offset.x * cos + offset.z * sin, offset.y, -offset.x * sin + offset.z * cos);
}

function node(scene: Scene, name: string, parent: TransformNode, x = 0, y = 0, z = 0): TransformNode {
  const transform = new TransformNode(name, scene);
  transform.parent = parent;
  transform.position.set(x, y, z);
  return transform;
}

/** Barrel: flat-ish ends, straight back, deep chest and a sagging belly. */
function barrelDeform(point: Vector3, unit: Vector3): void {
  const t = unit.z;
  point.z = Math.sign(unit.z) * Math.abs(unit.z) ** 0.72 * 0.72;
  if (unit.y > 0) point.y = Math.abs(unit.y) ** 0.78 * 0.44;
  else point.y = -(Math.abs(unit.y) ** 0.9) * 0.44 - (1 - t * t) * -unit.y * 0.07;
  // Chest a touch deeper and wider than the rump.
  const chest = Math.max(0, t) * 0.06;
  point.x *= 1 + chest * 0.6;
  if (unit.y < 0) point.y -= chest * -unit.y;
}

export function buildCowRig(scene: Scene, material: ShaderMaterial, root: TransformNode): CowRig {
  const meshes: Mesh[] = [];
  const keep = (mesh: Mesh | null): void => {
    if (mesh) meshes.push(mesh);
  };
  const visual = node(scene, 'cow-visual', root, 0, COW_BODY_CENTER_Y, 0);

  // --- body: barrel, udder and back gear -------------------------------------
  const body = node(scene, 'cow-body', visual);
  const bodyBin = new PartBin(scene, 'cow-body-mesh');
  bodyBin.blob(new Vector3(0.45, 0.44, 0.72), patchPaint(BODY_PATCHES, WHITE, BLACK, 0.55, 3), {}, 80, barrelDeform);
  // Rump roundness and shoulder hump so the silhouette is not a plain egg.
  bodyBin.blob(new Vector3(0.36, 0.3, 0.3), patchPaint(BODY_PATCHES, WHITE, BLACK, 0.55, 3), {
    at: new Vector3(0, 0.18, -0.5),
  }, 36);
  bodyBin.blob(new Vector3(0.38, 0.3, 0.32), patchPaint(BODY_PATCHES, WHITE, BLACK, 0.55, 3), {
    at: new Vector3(0, 0.16, 0.46),
  }, 36);
  // Udder with four teats between the hind legs, hanging clear of the belly.
  bodyBin.blob(new Vector3(0.15, 0.13, 0.16), PINK_INNER, { at: new Vector3(0, -0.54, -0.27) });
  for (const [x, z] of [
    [-0.06, -0.21],
    [0.06, -0.21],
    [-0.06, -0.33],
    [0.06, -0.33],
  ] as const) {
    bodyBin.capsule(new Vector3(x, -0.64, z), new Vector3(x * 1.15, -0.72, z), 0.022, PINK_DARK, 0.018, 8);
  }
  // Bedroll across the shoulders with spiral ends and two buckled straps.
  const roll = CreateCylinder('cow-bedroll', { height: 1.02, diameter: 0.33, tessellation: 24 }, scene);
  roll.rotation.z = Math.PI / 2;
  roll.position.set(0, 0.58, 0.1);
  roll.bakeCurrentTransformIntoVertices();
  smoothNormals(roll);
  bodyBin.push(roll, (point) => {
    const band = Math.sin(Math.atan2(point.y - 0.58, point.z - 0.1) * 3 + point.x * 2) > 0.85;
    return band ? shade(BEDROLL, 0.88) : BEDROLL;
  });
  for (const side of [-1, 1]) {
    const spiral: Vector3[] = [];
    for (let step = 0; step <= 40; step += 1) {
      const t = step / 40;
      const angle = t * Math.PI * 5;
      const radius = 0.02 + t * 0.135;
      spiral.push(new Vector3(side * 0.512, 0.58 + Math.sin(angle) * radius, 0.1 + Math.cos(angle) * radius));
    }
    bodyBin.tube(spiral, () => 0.011, BEDROLL_DARK, 6);
  }
  for (const x of [-0.27, 0.27]) {
    bodyBin.torus(0.35, 0.045, LEATHER, { at: new Vector3(x, 0.58, 0.1), rotation: new Vector3(0, 0, Math.PI / 2) }, 24);
    bodyBin.blob(new Vector3(0.035, 0.024, 0.048), BRASS, { at: new Vector3(x, 0.765, 0.1) }, 8);
  }
  // Girth strap: from the saddlebags down under the belly behind the front legs.
  const girth: Vector3[] = [];
  for (let step = 0; step <= 24; step += 1) {
    const angle = Math.PI * 1.08 + (step / 24) * Math.PI * 0.84;
    const up = Math.sin(angle);
    girth.push(new Vector3(Math.cos(angle) * 0.475, up * 0.5 + 0.02, 0.2 - Math.abs(Math.cos(angle)) * 0.1));
  }
  bodyBin.tube(girth, () => 0.032, LEATHER_DARK, 6);
  // Saddlebags with flaps and brass buckles, joined by a strap over the back.
  for (const side of [-1, 1]) {
    const boxy = (radii: Vector3) => (point: Vector3, unit: Vector3): void => {
      point.x = Math.sign(unit.x) * Math.abs(unit.x) ** 0.45 * radii.x;
      point.y = Math.sign(unit.y) * Math.abs(unit.y) ** 0.45 * radii.y;
      point.z = Math.sign(unit.z) * Math.abs(unit.z) ** 0.45 * radii.z;
    };
    const bag = new Vector3(0.075, 0.17, 0.2);
    bodyBin.blob(bag, LEATHER, { at: new Vector3(side * 0.5, -0.04, -0.04) }, 16, boxy(bag));
    const flap = new Vector3(0.035, 0.085, 0.21);
    bodyBin.blob(flap, LEATHER_DARK, { at: new Vector3(side * 0.565, 0.06, -0.04), rotation: new Vector3(0, 0, side * 0.08) }, 14, boxy(flap));
    bodyBin.blob(new Vector3(0.02, 0.045, 0.035), BRASS, { at: new Vector3(side * 0.6, -0.02, -0.04) }, 8);
    bodyBin.capsule(new Vector3(side * 0.6, 0.0, -0.04), new Vector3(side * 0.6, 0.12, -0.04), 0.012, LEATHER_DARK, 0.012, 6);
  }
  const strap: Vector3[] = [];
  for (let step = 0; step <= 20; step += 1) {
    const angle = (step / 20) * Math.PI;
    strap.push(new Vector3(Math.cos(angle) * 0.49, 0.08 + Math.sin(angle) * 0.4, -0.12));
  }
  bodyBin.tube(strap, () => 0.022, LEATHER_DARK, 6);
  keep(bodyBin.merge(material, body));

  // --- neck with the stitched collar --------------------------------------------
  const neck = node(scene, 'cow-neck', visual, 0, 0.16, 0.58);
  const neckBin = new PartBin(scene, 'cow-neck-mesh');
  neckBin.blob(new Vector3(0.27, 0.3, 0.3), WHITE, { at: new Vector3(0, 0.02, 0.1), rotation: new Vector3(-0.55, 0, 0) }, 18);
  neckBin.torus(0.56, 0.13, (point, normal) => {
    // Stitching: a dashed tan line along the outer face of the strap.
    const angle = Math.atan2(point.x, point.y);
    const outward = normal.x * point.x + normal.y * point.y > 0.18;
    return outward && Math.sin(angle * 26) > 0.35 && Math.abs(normal.z) < 0.35 ? STITCH : LEATHER;
  }, { at: new Vector3(0, 0.0, 0.08), rotation: new Vector3(Math.PI / 2 - 0.55, 0, 0), scale: new Vector3(1, 0.75, 1) }, 40);
  neckBin.blob(new Vector3(0.05, 0.05, 0.03), BRASS, { at: new Vector3(0.26, 0.12, 0.2) }, 8);
  keep(neckBin.merge(material, neck));

  // --- bell: hangs from the collar in front of the chest --------------------------
  const bell = node(scene, 'cow-bell', neck, 0, -0.27, 0.27);
  const bellBin = new PartBin(scene, 'cow-bell-mesh');
  bellBin.torus(0.07, 0.022, LEATHER_DARK, { at: new Vector3(0, -0.01, 0), rotation: new Vector3(0, Math.PI / 2, 0) }, 14);
  bellBin.lathe(
    [
      [0.0, -0.03],
      [0.045, -0.035],
      [0.072, -0.07],
      [0.085, -0.14],
      [0.1, -0.22],
      [0.13, -0.27],
      [0.135, -0.285],
      [0.118, -0.29],
    ],
    (point) => {
      if (point.y > -0.09) return COPPER_DARK;
      if (point.y > -0.16 && point.y < -0.12) return COPPER_LIGHT;
      return point.y < -0.26 ? COPPER_DARK : COPPER;
    },
    {},
    22,
  );
  bellBin.lathe(
    [
      [0.0, -0.08],
      [0.06, -0.09],
      [0.09, -0.2],
      [0.116, -0.288],
    ],
    BELL_MOUTH,
    {},
    18,
  );
  bellBin.capsule(new Vector3(0, -0.09, 0), new Vector3(0, -0.22, 0), 0.012, COPPER_DARK, 0.012, 6);
  bellBin.blob(new Vector3(0.038, 0.038, 0.038), COPPER_DARK, { at: new Vector3(0, -0.245, 0) }, 10);
  keep(bellBin.merge(material, bell));

  // --- head ------------------------------------------------------------------------
  const head = node(scene, 'cow-head', neck, 0, 0.16, 0.26);
  const headBin = new PartBin(scene, 'cow-head-mesh');
  const facePatch: readonly Patch[] = [
    { center: new Vector3(-0.22, 0.12, 0.28), radius: 0.17 },
    { center: new Vector3(0.21, 0.14, 0.24), radius: 0.14 },
  ];
  headBin.blob(new Vector3(0.3, 0.3, 0.34), patchPaint(facePatch, WHITE, BLACK, 0.4, 9), { at: new Vector3(0, 0.02, 0.17) }, 36, (point, unit) => {
    // Boxy-rounded: a soft superellipsoid.
    point.x = Math.sign(unit.x) * Math.abs(unit.x) ** 0.8 * 0.3;
    point.y = Math.sign(unit.y) * Math.abs(unit.y) ** 0.85 * 0.3;
  });
  // Big rounded muzzle with nostrils and a little smile.
  headBin.blob(new Vector3(0.27, 0.19, 0.19), PINK, { at: new Vector3(0, -0.11, 0.45) }, 20, (point) => {
    if (point.z > 0.08) point.z = 0.08 + (point.z - 0.08) * 0.7;
  });
  for (const side of [-1, 1]) {
    headBin.blob(new Vector3(0.048, 0.03, 0.022), NOSTRIL, {
      at: new Vector3(side * 0.1, -0.07, 0.6),
      rotation: new Vector3(0.25, 0, side * -0.5),
    }, 10);
  }
  const smile: Vector3[] = [];
  for (let step = 0; step <= 10; step += 1) {
    const x = -0.11 + (step / 10) * 0.22;
    smile.push(new Vector3(x, -0.185 + (x / 0.11) ** 2 * 0.035, 0.585 - (x / 0.11) ** 2 * 0.05));
  }
  headBin.tube(smile, () => 0.009, PINK_DARK, 6);
  // Horns: short, stout, up and out then slightly in; ivory with warmer tips.
  for (const side of [-1, 1]) {
    const horn = [
      new Vector3(side * 0.16, 0.22, 0.12),
      new Vector3(side * 0.23, 0.28, 0.13),
      new Vector3(side * 0.26, 0.35, 0.12),
      new Vector3(side * 0.24, 0.4, 0.1),
    ];
    headBin.tube(horn, (t) => 0.06 * (1 - t) + 0.028, (point) => (point.y > 0.37 ? shade(HORN, 0.9) : HORN), 10);
  }
  // Curly white tuft between the horns.
  for (const [x, y, z, r] of [
    [0, 0.315, 0.14, 0.065],
    [-0.065, 0.295, 0.1, 0.055],
    [0.065, 0.295, 0.11, 0.055],
    [0.02, 0.33, 0.21, 0.05],
    [-0.045, 0.32, 0.21, 0.045],
  ] as const) {
    headBin.blob(new Vector3(r, r * 0.9, r), WHITE_SHADE, { at: new Vector3(x, y, z) }, 10);
  }
  keep(headBin.merge(material, head));

  // Eyes: big, slightly bulging ovals with large pupils and highlights, set
  // into the face and turned with its curvature (mascot-view animates the
  // node's own rotation, so the turn is baked into the parts).
  const eyes: TransformNode[] = [];
  for (const side of [-1, 1]) {
    const eye = node(scene, side < 0 ? 'cow-eye-left' : 'cow-eye-right', head, side * 0.15, 0.11, 0.42);
    const eyeBin = new PartBin(scene, 'cow-eye-mesh');
    const turn = side * 0.4;
    const rotation = new Vector3(0, turn, 0);
    eyeBin.blob(new Vector3(0.085, 0.1, 0.06), EYE_WHITE, { rotation }, 14);
    eyeBin.blob(new Vector3(0.056, 0.066, 0.03), PUPIL, {
      at: rotateY(new Vector3(side * -0.008, -0.004, 0.04), turn),
      rotation,
    }, 12);
    eyeBin.blob(new Vector3(0.019, 0.019, 0.012), EYE_WHITE, {
      at: rotateY(new Vector3(side * -0.024 + 0.016, 0.03, 0.066), turn),
      rotation,
    }, 8);
    keep(eyeBin.merge(material, eye));
    eyes.push(eye);
  }
  // Brows hug the forehead: the inner end sits forward, the outer end follows
  // the head back around its curve.
  const brows: TransformNode[] = [];
  for (const side of [-1, 1]) {
    const brow = node(scene, side < 0 ? 'cow-brow-left' : 'cow-brow-right', head, side * 0.15, 0.245, 0.365);
    const browBin = new PartBin(scene, 'cow-brow-mesh');
    browBin.capsule(new Vector3(-0.06, 0, side * 0.055), new Vector3(0.06, 0, -side * 0.055), 0.024, BLACK, 0.02, 8);
    keep(browBin.merge(material, brow));
    brows.push(brow);
  }
  // Floppy ears: black leaf-shaped flaps with a pink inner inset, turned a
  // little forward (mascot-view animates the node's droop and flick).
  const ears: TransformNode[] = [];
  for (const side of [-1, 1]) {
    const ear = node(scene, side < 0 ? 'cow-ear-left' : 'cow-ear-right', head, side * 0.28, 0.14, 0.08);
    const earBin = new PartBin(scene, 'cow-ear-mesh');
    earBin.blob(
      new Vector3(0.15, 0.085, 0.035),
      (point, normal) =>
        normal.z > 0.5 && Math.abs(point.y) < 0.05 && Math.abs(point.x - side * 0.12) < 0.09 ? PINK_INNER : BLACK,
      { at: new Vector3(side * 0.12, 0, 0), rotation: new Vector3(0, side * 0.35, 0) },
      14,
    );
    keep(earBin.merge(material, ear));
    ear.rotation.z = side * -0.45;
    ears.push(ear);
  }

  // --- tail: two segments for a lively sway, black tuft at the end ----------------
  const tailUpper = node(scene, 'cow-tail-upper', visual, 0, 0.36, -0.74);
  const tailUpperBin = new PartBin(scene, 'cow-tail-upper-mesh');
  tailUpperBin.capsule(new Vector3(0, 0, 0), new Vector3(0, -0.32, -0.04), 0.028, WHITE, 0.022, 8);
  keep(tailUpperBin.merge(material, tailUpper));
  const tailLower = node(scene, 'cow-tail-lower', tailUpper, 0, -0.32, -0.04);
  const tailLowerBin = new PartBin(scene, 'cow-tail-lower-mesh');
  tailLowerBin.capsule(new Vector3(0, 0, 0), new Vector3(0, -0.26, 0), 0.02, WHITE, 0.018, 8);
  tailLowerBin.blob(new Vector3(0.06, 0.12, 0.06), BLACK, { at: new Vector3(0, -0.33, 0) }, 12, (point) => {
    point.x += (fbm3(point.y * 30, 1, 2) - 0.5) * 0.03;
  });
  keep(tailLowerBin.merge(material, tailLower));

  // --- legs -------------------------------------------------------------------------
  const hips: TransformNode[] = [];
  const knees: TransformNode[] = [];
  const legSpots: readonly Patch[] = [
    { center: new Vector3(0.06, -0.12, 0.05), radius: 0.07 },
  ];
  const layout: Array<[number, number, boolean]> = [
    [-LEG_X, FRONT_Z, true],
    [LEG_X, FRONT_Z, false],
    [-LEG_X, HIND_Z, false],
    [LEG_X, HIND_Z, true],
  ];
  for (const [x, z, spotted] of layout) {
    const hip = node(scene, 'cow-hip', visual, x, HIP_Y, z);
    const upperBin = new PartBin(scene, 'cow-upper-leg-mesh');
    const hind = z < 0;
    upperBin.capsule(
      new Vector3(0, 0.05, 0),
      new Vector3(0, -UPPER_LEG, hind ? -0.02 : 0.01),
      hind ? 0.16 : 0.145,
      spotted ? patchPaint(legSpots, WHITE, BLACK, 0.3, x * 7) : WHITE,
      0.105,
      12,
    );
    keep(upperBin.merge(material, hip));
    const knee = node(scene, 'cow-knee', hip, 0, -UPPER_LEG, hind ? -0.02 : 0.01);
    const lowerBin = new PartBin(scene, 'cow-lower-leg-mesh');
    // The cannon ends inside the hoof, so no white cap shows under the sole.
    lowerBin.capsule(new Vector3(0, 0, 0), new Vector3(0, -LOWER_LEG + 0.02, 0.01), 0.1, WHITE, 0.088, 12);
    lowerBin.blob(new Vector3(0.105, 0.06, 0.12), (point, normal) => {
      // Cloven hoof: a dark notch down the front.
      return normal.z > 0.35 && Math.abs(point.x) < 0.012 ? BLACK : HOOF;
    }, { at: new Vector3(0, -LOWER_LEG - 0.065, 0.02) }, 14, (point) => {
      // Flatten the underside into a sole (squash toward the centre line).
      if (point.y < -0.02) point.y = -0.02 + (point.y + 0.02) * 0.3;
    });
    keep(lowerBin.merge(material, knee));
    hips.push(hip);
    knees.push(knee);
  }

  return {
    visual,
    body,
    neck,
    head,
    eyeLeft: eyes[0] as TransformNode,
    eyeRight: eyes[1] as TransformNode,
    browLeft: brows[0] as TransformNode,
    browRight: brows[1] as TransformNode,
    earLeft: ears[0] as TransformNode,
    earRight: ears[1] as TransformNode,
    bell,
    tailUpper,
    tailLower,
    hips: hips as CowRig['hips'],
    knees: knees as CowRig['knees'],
    meshes,
  };
}
