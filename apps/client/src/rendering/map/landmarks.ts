/**
 * Landmark generators: Tower A lighthouse and harbour, Tower B clock pavilion,
 * Tower C clock house, the suspension bridge, stone arch, cable car, T-bar,
 * alpine coaster, hammock catapult, billboards, waterfall and walkways.
 * Everything is drawn from shared blueprint data so it lines up with the
 * server colliders and the routes later packages animate along.
 */
import {
  BRIDGE_PYLON_Z,
  FJORD_MAP,
  FjordLayout,
  LIGHTHOUSE,
  PAVILION,
  SUMMIT_CLOCK_HOUSE,
  bridgeDeckHeightAt,
  sampleMapHeight,
  type MapProp,
  type RoutePolyline,
} from '@frost-and-flamingos/shared';
import { drawCheeseWheel, drawIcicleRow } from './buildings';
import { Affine, GeometryBatch, hash3, mix, shade, type RGB, type V3 } from './geometry';
import { drawPalm } from './nature';
import { P } from './palette';

const DECK = FjordLayout.HARBOR_DECK_HEIGHT;

function plank(batch: GeometryBatch, cx: number, cy: number, cz: number, length: number, width: number, seed: number, alongX = true): void {
  const tone = mix(P.plank, P.plankLight, hash3(seed, cx, cz));
  if (alongX) batch.box(cx, cy, cz, length, 0.16, width - 0.05, tone, 'wood', 0.03);
  else batch.box(cx, cy, cz, width - 0.05, 0.16, length, tone, 'wood', 0.03);
}

/** Piling from the deck down into the water / sand. */
function piling(batch: GeometryBatch, x: number, z: number, top: number, worldX: number, worldZ: number, above = 0.9): void {
  const ground = Math.min(sampleMapHeight(worldX, worldZ), -0.2) - 0.6;
  batch.log([x, ground - top, z], [x, above, z], 0.18, P.logDark, 'wood', { segments: 6, endColor: P.logEnd });
}

// ---------------------------------------------------------------------------
// Tower A
// ---------------------------------------------------------------------------

export function drawHarborPlatform(batch: GeometryBatch, prop: MapProp): void {
  const radius = prop.dimensions?.x ?? 18;
  const apothem = radius * Math.cos(Math.PI / 8);
  for (let sector = 0; sector < 8; sector += 1) {
    const yaw = (sector / 8) * Math.PI * 2;
    batch.with(Affine.rotationY(yaw), () => {
      const rows = Math.round(apothem / 0.52);
      for (let row = 0; row < rows; row += 1) {
        const r = ((row + 0.5) / rows) * apothem;
        const chord = 2 * r * Math.tan(Math.PI / 8);
        plank(batch, 0, -0.08, r, chord + 0.02, apothem / rows, sector * 100 + row);
      }
      // Rim beam and posts
      batch.box(0, -0.3, apothem - 0.12, 2 * apothem * Math.tan(Math.PI / 8), 0.36, 0.3, P.logDark, 'wood', 0.05);
      const corner = rotateLocal(0, apothem, Math.PI / 8);
      const cornerRadius = Math.hypot(corner.x, corner.z) * (radius / Math.hypot(corner.x, corner.z));
      const cx = Math.sin(Math.PI / 8) * cornerRadius;
      const cz = Math.cos(Math.PI / 8) * cornerRadius;
      const world = toWorld(prop, cx, cz, yaw);
      piling(batch, cx, cz - 0.2, DECK, world.x, world.z, 1.1);
      const mid = toWorld(prop, 0, apothem, yaw);
      piling(batch, 0, apothem - 0.15, DECK, mid.x, mid.z, 0.2);
    });
  }
  // Inner pilings
  for (let index = 0; index < 8; index += 1) {
    const a = (index / 8) * Math.PI * 2;
    const x = Math.sin(a) * 9;
    const z = Math.cos(a) * 9;
    piling(batch, x, z, DECK, prop.position.x + x, prop.position.z + z, -0.3);
  }
}

function rotateLocal(x: number, z: number, angle: number): { x: number; z: number } {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: x * c + z * s, z: -x * s + z * c };
}

function toWorld(prop: MapProp, x: number, z: number, extraYaw = 0): { x: number; z: number } {
  const local = rotateLocal(x, z, extraYaw);
  const world = rotateLocal(local.x, local.z, prop.rotationY);
  return { x: prop.position.x + world.x, z: prop.position.z + world.z };
}

export function drawLighthouse(batch: GeometryBatch): void {
  const L = LIGHTHOUSE;
  // Stone base
  batch.lathe(
    [
      [L.baseRadius + 0.5, 0],
      [L.baseRadius + 0.45, 1.6],
      [L.baseRadius + 0.1, 2.0],
    ],
    16,
    (ring, segment) => mix(P.cobbleDark, P.cobble, hash3(ring, segment, 1)),
    'stone',
  );
  // Striped tower: red/white bands with a slight bulge per band.
  const bands = 6;
  const top = L.galleryHeight - 0.3;
  for (let band = 0; band < bands; band += 1) {
    const y0 = 2 + (band / bands) * (top - 2);
    const y1 = 2 + ((band + 1) / bands) * (top - 2);
    const r0 = L.baseRadius + (L.topRadius - L.baseRadius) * (band / bands);
    const r1 = L.baseRadius + (L.topRadius - L.baseRadius) * ((band + 1) / bands);
    batch.lathe(
      [
        [r0, y0],
        [(r0 + r1) / 2 + 0.06, (y0 + y1) / 2],
        [r1, y1],
      ],
      16,
      band % 2 === 0 ? P.alpineRed : P.white,
      'plaster',
    );
  }
  // Door and windows
  batch.box(0, 1.2 + 0.1, L.baseRadius + 0.35, 1.3, 2.4, 0.2, P.logDark, 'wood', 0.04);
  batch.box(0, 2.55, L.baseRadius + 0.38, 1.6, 0.2, 0.25, P.trim, 'wood', 0.03);
  for (const [y, angle] of [
    [6, 0.5],
    [9.5, 2.6],
    [12, -1.2],
  ] as const) {
    const r = L.baseRadius + (L.topRadius - L.baseRadius) * ((y - 2) / (top - 2)) + 0.02;
    batch.with(Affine.rotationY(angle).translate(0, y, r), () => {
      batch.box(0, 0, 0, 0.7, 1.0, 0.16, P.windowGlow, 'plain', 0.02);
      batch.box(0, -0.58, 0.05, 0.9, 0.14, 0.2, P.trim, 'wood', 0.02);
    });
  }
  // Gallery deck with brackets, railing posts and rail.
  batch.lathe(
    [
      [L.topRadius - 0.2, L.galleryHeight - 0.35],
      [L.galleryRadius + 0.1, L.galleryHeight - 0.2],
      [L.galleryRadius + 0.1, L.galleryHeight],
    ],
    20,
    P.plank,
    'wood',
    { capTop: true },
  );
  const posts = 20;
  for (let index = 0; index < posts; index += 1) {
    const a = (index / posts) * Math.PI * 2;
    const x = Math.sin(a) * (L.galleryRadius - 0.1);
    const z = Math.cos(a) * (L.galleryRadius - 0.1);
    batch.log([x, L.galleryHeight, z], [x, L.galleryHeight + 1.1, z], 0.06, P.white, 'wood', { segments: 4 });
    batch.log([Math.sin(a) * (L.topRadius - 0.1), L.galleryHeight - 1.6, Math.cos(a) * (L.topRadius - 0.1)], [x * 0.92, L.galleryHeight - 0.25, z * 0.92], 0.07, P.logDark, 'wood', { segments: 4 });
  }
  const rail: V3[] = [];
  for (let index = 0; index <= posts; index += 1) {
    const a = (index / posts) * Math.PI * 2;
    rail.push([Math.sin(a) * (L.galleryRadius - 0.1), L.galleryHeight + 1.12, Math.cos(a) * (L.galleryRadius - 0.1)]);
  }
  batch.tube(rail, 0.07, 5, P.alpineRed, 'wood');
  // Lantern room: glowing glass between dark mullions, red dome with a finial.
  const lanternBase = L.galleryHeight;
  batch.lathe([[3.0, lanternBase], [3.0, lanternBase + 0.9]], 14, P.alpineRedDark, 'metal', { capTop: false });
  batch.lathe([[2.6, lanternBase + 0.9], [2.6, lanternBase + L.lanternHeight]], 14, P.windowGlow, 'plain');
  for (let index = 0; index < 8; index += 1) {
    const a = (index / 8) * Math.PI * 2;
    batch.log([Math.sin(a) * 2.65, lanternBase + 0.9, Math.cos(a) * 2.65], [Math.sin(a) * 2.65, lanternBase + L.lanternHeight, Math.cos(a) * 2.65], 0.08, P.ink, 'metal', { segments: 4 });
  }
  batch.blob(0, lanternBase + 2.6, 0, 1.3, 1.2, 1.3, P.yellow, 'plain', { segments: 10, rings: 6 });
  const domeBase = lanternBase + L.lanternHeight;
  batch.lathe(
    [
      [3.2, domeBase],
      [2.9, domeBase + 0.9],
      [2.0, domeBase + 2.0],
      [0.8, domeBase + 2.9],
      [0.05, domeBase + L.domeHeight],
    ],
    16,
    (ring, segment) => (segment % 2 === 0 ? P.alpineRed : P.alpineRedDark),
    'metal',
    { capBottom: true },
  );
  batch.lathe([[0.12, domeBase + L.domeHeight - 0.1], [0.08, domeBase + L.domeHeight + 0.8]], 5, P.gold, 'metal');
  batch.blob(0, domeBase + L.domeHeight + 0.95, 0, 0.25, 0.25, 0.25, P.gold, 'metal', { segments: 6, rings: 4 });
  // Spiral stair with treads, outer posts and a rope rail.
  const steps = 34;
  const ropePoints: V3[] = [];
  for (let step = 0; step < steps; step += 1) {
    const t = (step + 0.5) / steps;
    const angle = L.spiralStart + t * L.spiralSweep;
    const y = t * L.galleryHeight;
    batch.with(Affine.rotationY(angle).translate(0, y - 0.1, L.spiralRadius), () => {
      batch.box(0, 0, 0, 0.6, 0.14, 2.1, step % 2 === 0 ? P.plankLight : P.plank, 'wood', 0.03);
    });
    if (step % 3 === 0) {
      const ox = Math.sin(angle) * (L.spiralRadius + 1.0);
      const oz = Math.cos(angle) * (L.spiralRadius + 1.0);
      batch.log([ox, Math.max(0, y - 3.5), oz], [ox, y + 1.1, oz], 0.07, P.logDark, 'wood', { segments: 4 });
      const ix = Math.sin(angle) * (L.spiralRadius - 1.0);
      const iz = Math.cos(angle) * (L.spiralRadius - 1.0);
      batch.log([ix, Math.max(0, y - 3.5), iz], [ix, y - 0.1, iz], 0.07, P.logDark, 'wood', { segments: 4 });
    }
    ropePoints.push([Math.sin(angle) * (L.spiralRadius + 1.0), y + 1.05, Math.cos(angle) * (L.spiralRadius + 1.0)]);
  }
  batch.tube(ropePoints, 0.05, 4, P.rope, 'cloth');
  // Ladder on the far side up to the gallery.
  const ladderAngle = L.spiralStart - 0.9;
  batch.with(Affine.rotationY(ladderAngle), () => {
    for (const side of [-0.35, 0.35]) batch.log([side, 0, L.baseRadius + 0.35], [side, L.galleryHeight, L.topRadius + 0.3], 0.05, P.logDark, 'wood', { segments: 4 });
    for (let rung = 1; rung < 36; rung += 1) {
      const t = rung / 36;
      const z = L.baseRadius + 0.35 + (L.topRadius - L.baseRadius) * t;
      batch.box(0, t * L.galleryHeight, z, 0.7, 0.05, 0.05, P.log, 'wood', 0);
    }
  });
}

export function drawPier(batch: GeometryBatch, prop: MapProp): void {
  const width = prop.dimensions?.x ?? 4.5;
  const length = prop.dimensions?.z ?? 6;
  const planks = Math.max(2, Math.round(length / 0.5));
  for (let index = 0; index < planks; index += 1) {
    const z = (index + 0.5) * (length / planks);
    const lean = (hash3(prop.position.x, index, prop.position.z) - 0.5) * 0.04;
    batch.with(Affine.translation(0, -0.08, z).rotateY(lean), () => {
      plank(batch, 0, 0, 0, width + (hash3(index, 2, prop.position.x) - 0.5) * 0.3, length / planks, index + prop.position.x);
    });
  }
  for (const side of [-1, 1]) {
    batch.box(side * (width / 2 - 0.1), -0.32, length / 2, 0.24, 0.3, length, P.logDark, 'wood', 0.05);
    const posts = Math.max(1, Math.round(length / 3));
    for (let post = 0; post <= posts; post += 1) {
      const z = (post / posts) * length;
      const world = toWorld(prop, side * (width / 2 + 0.1), z);
      piling(batch, side * (width / 2 + 0.1), z, DECK, world.x, world.z, 0.85 + hash3(post, side, length) * 0.4);
    }
    if (prop.variant === 1) {
      // Marked destructible segment: yellow/black hazard paint on the side beam.
      for (let stripe = 0; stripe < 6; stripe += 1) {
        batch.box(side * (width / 2 + 0.03), -0.32, (stripe + 0.5) * (length / 6), 0.06, 0.32, length / 12, stripe % 2 === 0 ? P.yellow : P.ink, 'plain', 0);
      }
    }
  }
  if (prop.variant === 3) {
    // T-head deck at the far end of the west pier.
    const headZ = length + 3.6;
    for (let index = 0; index < 16; index += 1) plank(batch, -7 + (index + 0.5) * (14 / 16), -0.08, headZ, 8, 14 / 16, index, false);
    for (const sx of [-7, 0, 7]) for (const sz of [headZ - 4, headZ + 4]) {
      const world = toWorld(prop, sx, sz);
      piling(batch, sx, sz, DECK, world.x, world.z, 0.9);
    }
    // Hanging nets and floats.
    for (let index = 0; index < 4; index += 1) {
      batch.blob(-6 + index * 4, 0.3, headZ + 4.2, 0.22, 0.22, 0.22, index % 2 === 0 ? P.alpineRed : P.yellow, 'plain', { segments: 6, rings: 4 });
    }
  }
}

export function drawStairs(batch: GeometryBatch, prop: MapProp): void {
  const drop = prop.dimensions?.y ?? 3.6;
  const run = prop.dimensions?.z ?? 5;
  const width = prop.dimensions?.x ?? 2.2;
  const steps = Math.round(drop / 0.28);
  for (let step = 0; step < steps; step += 1) {
    const t = (step + 0.5) / steps;
    batch.box(0, -t * drop, t * run, width, 0.12, run / steps + 0.05, step % 2 === 0 ? P.plankLight : P.plank, 'wood', 0.02);
  }
  for (const side of [-1, 1]) {
    batch.log([side * (width / 2 + 0.05), 0, 0], [side * (width / 2 + 0.05), -drop, run], 0.09, P.logDark, 'wood', { segments: 5 });
    batch.log([side * (width / 2 + 0.05), -drop - 0.5, run], [side * (width / 2 + 0.05), 1.0, 0.1], 0.07, P.logDark, 'wood', { segments: 4 });
  }
}

// ---------------------------------------------------------------------------
// Tower B
// ---------------------------------------------------------------------------

function drawClockFace(batch: GeometryBatch, radius: number, hour: number, rim: RGB = P.gold): void {
  batch.with(Affine.rotationX(Math.PI / 2), () => {
    batch.lathe(
      [
        [radius + 0.18, -0.08],
        [radius + 0.22, 0.04],
        [radius + 0.12, 0.12],
      ],
      24,
      rim,
      'metal',
      { capTop: false },
    );
    batch.lathe([[radius, 0], [radius, 0.06]], 24, P.cream, 'plain', { capTop: true });
  });
  for (let tick = 0; tick < 12; tick += 1) {
    const a = (tick / 12) * Math.PI * 2;
    const len = tick % 3 === 0 ? 0.3 : 0.16;
    batch.with(Affine.translation(Math.sin(a) * radius * 0.82, Math.cos(a) * radius * 0.82, 0.08).rotateZ(-a), () => {
      batch.box(0, 0, 0, 0.08 * (tick % 3 === 0 ? 1.6 : 1), len * radius, 0.03, P.ink, 'plain', 0);
    });
  }
  const minute = 0.18;
  const hourAngle = (hour / 12) * Math.PI * 2;
  batch.with(Affine.translation(0, 0, 0.12).rotateZ(-hourAngle), () => batch.box(0, radius * 0.25, 0, 0.12, radius * 0.5, 0.04, P.ink, 'plain', 0));
  batch.with(Affine.translation(0, 0, 0.14).rotateZ(-minute * Math.PI * 2), () => batch.box(0, radius * 0.36, 0, 0.08, radius * 0.72, 0.04, P.ink, 'plain', 0));
  batch.blob(0, 0, 0.16, 0.12, 0.12, 0.06, P.gold, 'metal', { segments: 6, rings: 3 });
}

export function drawClockPavilion(batch: GeometryBatch): void {
  const C = PAVILION;
  // Round stone fountain basin
  const blocks = 22;
  for (let index = 0; index < blocks; index += 1) {
    const a = (index / blocks) * Math.PI * 2;
    batch.with(Affine.rotationY(a).translate(0, 0, C.basinRadius - 0.35), () => {
      batch.box(0, C.basinHeight / 2, 0, (2 * Math.PI * C.basinRadius) / blocks + 0.05, C.basinHeight, 0.72, mix(P.cobbleDark, P.cobble, hash3(index, 1, 2)), 'stone', 0.08);
      batch.box(0, C.basinHeight + 0.06, 0, (2 * Math.PI * C.basinRadius) / blocks + 0.12, 0.14, 0.86, P.cobbleWarm, 'stone', 0.05);
    });
  }
  batch.lathe([[C.basinRadius - 0.6, 0.55], [0.01, 0.55]], 24, P.water, 'water', { capTop: false });
  batch.blob(0, 0.56, 0, C.basinRadius - 0.75, 0.02, C.basinRadius - 0.75, (ny) => (ny > 0 ? P.water : P.lagoonMid), 'water', { segments: 24, rings: 3, flatBottom: true });
  for (let ring = 0; ring < 2; ring += 1) {
    batch.with(Affine.translation(0, 0.6, 0), () => batch.lathe([[1.6 + ring * 1.4, 0], [1.75 + ring * 1.4, 0.02]], 20, P.white, 'water'));
  }
  // Central spout column with a bowl and a little splash.
  batch.lathe([[0.9, 0], [0.55, 0.6], [0.45, 1.2], [1.1, 1.5], [1.2, 1.62], [0.4, 1.62]], 12, P.cobble, 'stone');
  batch.blob(0, 1.75, 0, 0.35, 0.5, 0.35, P.waterfall, 'water', { segments: 7, rings: 4 });
  // Four tall posts with braces
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const x = sx * C.postOffset;
      const z = sz * C.postOffset;
      batch.box(x, 0.4, z, 0.95, 0.8, 0.95, P.cobble, 'stone', 0.1);
      batch.log([x, 0.7, z], [x, C.houseBottom, z], 0.3, P.log, 'wood', { segments: 8 });
      batch.log([x, C.houseBottom - 1.6, z], [x * 0.35, C.houseBottom, z], 0.12, P.logDark, 'wood', { segments: 5 });
      batch.log([x, C.houseBottom - 1.6, z], [x, C.houseBottom, z * 0.35], 0.12, P.logDark, 'wood', { segments: 5 });
    }
  }
  // Clock house
  const s = C.houseSize;
  const yb = C.houseBottom;
  batch.box(0, yb + 0.15, 0, s + 0.5, 0.3, s + 0.5, P.logDark, 'wood', 0.06);
  const boards = 14;
  for (let side = 0; side < 4; side += 1) {
    batch.with(Affine.rotationY((side * Math.PI) / 2), () => {
      for (let index = 0; index < boards; index += 1) {
        const x = -s / 2 + (index + 0.5) * (s / boards);
        batch.box(x, yb + 0.3 + (C.houseHeight - 0.3) / 2, s / 2 - 0.1, s / boards - 0.03, C.houseHeight - 0.3, 0.2, shade(P.log, 0.88 + hash3(index, side, 3) * 0.22), 'wood', 0.02);
      }
      batch.box(0, yb + C.houseHeight - 0.15, s / 2 + 0.05, s + 0.3, 0.3, 0.2, P.trim, 'wood', 0.04);
      batch.box(0, yb + 0.45, s / 2 + 0.05, s + 0.3, 0.2, 0.2, P.trim, 'wood', 0.04);
      batch.with(Affine.translation(0, yb + C.houseHeight * 0.55, s / 2 + 0.06), () => drawClockFace(batch, 1.5, 2 + side * 3));
      // Carved scallop trim under the eave
      for (let scallop = 0; scallop < 8; scallop += 1) {
        batch.blob(-s / 2 + (scallop + 0.5) * (s / 8), yb + C.houseHeight - 0.4, s / 2 + 0.12, 0.28, 0.22, 0.06, P.trim, 'wood', { segments: 6, rings: 3 });
      }
    });
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) batch.box(sx * (s / 2), yb + C.houseHeight / 2, sz * (s / 2), 0.36, C.houseHeight, 0.36, P.logDark, 'wood', 0.06);
  // Pyramid roof of shingle courses with a spire.
  const roofBase = yb + C.houseHeight;
  const courses = 7;
  for (let course = 0; course < courses; course += 1) {
    const t0 = course / courses;
    const half = (s / 2 + 0.9) * (1 - t0 * 0.92);
    batch.box(0, roofBase + t0 * C.roofHeight + 0.2, 0, half * 2, C.roofHeight / courses + 0.18, half * 2, mix(P.shingle, P.shingleRed, course % 2 === 0 ? 0.25 : 0), 'shingle', 0.12);
  }
  batch.lathe([[0.25, roofBase + C.roofHeight], [0.06, roofBase + C.roofHeight + 1.6]], 6, P.gold, 'metal');
  batch.blob(0, roofBase + C.roofHeight + 1.7, 0, 0.22, 0.22, 0.22, P.gold, 'metal', { segments: 6, rings: 4 });
}

// ---------------------------------------------------------------------------
// Tower C extras (the shell itself is a building layout)
// ---------------------------------------------------------------------------

export function drawSummitRoof(batch: GeometryBatch, width: number, depth: number): void {
  const H = SUMMIT_CLOCK_HOUSE;
  const top = H.base;
  // Roof deck planks and a crenellated parapet with shooting slits.
  for (let index = 0; index < Math.round(width / 0.5); index += 1) {
    const x = -width / 2 + (index + 0.5) * 0.5;
    batch.box(x, top - 0.12, 0, 0.47, 0.24, depth, index % 2 === 0 ? P.plank : P.plankLight, 'wood', 0.02);
  }
  for (const sign of [1, -1]) {
    for (let index = 0; index < Math.round(width / 1.2); index += 1) {
      const x = -width / 2 + (index + 0.5) * 1.2;
      batch.box(x, top + 0.6, sign * (depth / 2 - 0.12), 1.0, 1.2, 0.26, index % 2 === 0 ? P.logDark : P.log, 'wood', 0.04);
    }
    for (let index = 0; index < Math.round(depth / 1.2); index += 1) {
      const z = -depth / 2 + (index + 0.5) * 1.2;
      batch.box(sign * (width / 2 - 0.12), top + 0.6, z, 0.26, 1.2, 1.0, index % 2 === 0 ? P.logDark : P.log, 'wood', 0.04);
    }
    batch.box(0, top + 1.25, sign * (depth / 2 - 0.12), width, 0.14, 0.34, P.trim, 'wood', 0.03);
    batch.box(sign * (width / 2 - 0.12), top + 1.25, 0, 0.34, 0.14, depth, P.trim, 'wood', 0.03);
  }
  for (let lump = 0; lump < 10; lump += 1) {
    const a = hash3(lump, 3, 9);
    batch.blob((a - 0.5) * width * 0.85, top + 0.05, (hash3(lump, 5, 1) - 0.5) * depth * 0.85, 1.4, 0.25, 1.0, P.snow, 'snow', { segments: 7, rings: 3, flatBottom: true });
  }
  // Clock house with the giant clock face on its front gable.
  batch.with(Affine.translation(H.center.x, 0, H.center.z), () => {
    const w = H.width;
    const d = H.depth;
    const boards = Math.round(w / 0.4);
    for (const side of [1, -1]) {
      batch.with(Affine.rotationY(side > 0 ? 0 : Math.PI), () => {
        for (let index = 0; index < boards; index += 1) {
          const x = -w / 2 + (index + 0.5) * (w / boards);
          const gable = Math.max(0, (1 - Math.abs(x) / (w / 2)) * H.roofHeight - 0.15);
          batch.box(x, top + (H.height + gable) / 2, d / 2 - 0.15, w / boards - 0.03, H.height + gable, 0.3, shade(P.logDark, 0.9 + hash3(index, side, 2) * 0.25), 'wood', 0.02);
        }
      });
    }
    for (const side of [1, -1]) {
      for (let course = 0; course < Math.round(H.height / 0.34); course += 1) {
        const y = top + (course + 0.5) * 0.34;
        batch.log([side * (w / 2 - 0.15), y, -d / 2 - 0.3], [side * (w / 2 - 0.15), y, d / 2 + 0.3], 0.19, shade(P.log, 0.9 + hash3(course, side, 4) * 0.2), 'wood', { segments: 6, endColor: P.logEnd });
      }
    }
    batch.with(Affine.translation(0, top + H.height * 0.62, d / 2 + 0.05), () => {
      drawClockFace(batch, 2.6, 4);
      // Cuckoo door and a carved bird above the clock.
      batch.box(0, 3.2, 0.05, 1.1, 1.0, 0.16, P.alpineRed, 'wood', 0.04);
      batch.blob(0, 3.3, 0.35, 0.3, 0.26, 0.32, P.yellow, 'plain', { segments: 6, rings: 4 });
      // Carved leaves either side.
      for (const side of [-1, 1]) {
        for (let leaf = 0; leaf < 3; leaf += 1) batch.blob(side * (3.2 + leaf * 0.25), -1.6 + leaf * 1.1, 0.1, 0.35, 0.55, 0.08, P.logLight, 'wood', { segments: 6, rings: 3 });
      }
    });
    // Steep gable roof (ridge front-to-back) with heavy snow and icicles.
    const run = w / 2 + 0.8;
    const pitch = Math.atan2(H.roofHeight, w / 2);
    const slope = Math.hypot(run, run * Math.tan(pitch));
    const roofTop = top + H.height + H.roofHeight + 0.2;
    for (const sign of [1, -1]) {
      batch.with(Affine.translation(0, roofTop, 0).rotateZ(-sign * pitch), () => {
        const rows = Math.round(slope / 0.42);
        for (let row = 0; row < rows; row += 1) {
          batch.box(sign * ((row + 0.5) / rows) * slope, -0.05, 0, slope / rows + 0.12, 0.18, d + 1.6, mix(P.shingleDark, P.shingle, hash3(row, sign, 6)), 'shingle', 0.03);
        }
        batch.box(sign * slope * 0.5, 0.16, 0, slope + 0.1, 0.4, d + 1.7, P.snow, 'snow', 0.16);
      });
    }
    batch.blob(0, roofTop + 0.3, 0, 0.6, 0.35, d / 2 + 0.9, P.snow, 'snow', { segments: 10, rings: 4 });
    for (const sign of [1, -1]) drawIcicleRow(batch, [sign * (run + 0.05), top + H.height - 0.35, -d / 2 - 0.6], [sign * (run + 0.05), top + H.height - 0.35, d / 2 + 0.6], sign * 7);
  });
}

/** Brass snow cannon on the clock-house ridge (team-held dressing of Tower C). */
export function drawSnowCannon(batch: GeometryBatch): void {
  batch.box(0, 0.35, 0, 1.4, 0.7, 1.4, P.metalDark, 'metal', 0.1);
  batch.lathe([[0.5, 0.7], [0.4, 1.3]], 10, P.metal, 'metal', { capTop: true });
  batch.with(Affine.translation(0, 1.6, 0).rotateX(-0.55), () => {
    batch.lathe(
      [
        [0.55, -1.2],
        [0.62, -0.9],
        [0.48, 0],
        [0.52, 2.2],
        [0.75, 2.6],
        [0.7, 2.9],
      ],
      14,
      (ring) => (ring >= 4 ? P.gold : P.yellow),
      'metal',
      { capBottom: true },
    );
    for (const y of [-0.6, 0.8, 1.8]) batch.with(Affine.translation(0, y, 0), () => batch.lathe([[0.58, -0.07], [0.58, 0.07]], 14, P.gold, 'metal'));
  });
  for (const side of [-1, 1]) batch.box(side * 0.7, 1.55, 0, 0.2, 0.7, 0.7, P.metalDark, 'metal', 0.05);
}

// ---------------------------------------------------------------------------
// The great suspension bridge
// ---------------------------------------------------------------------------

export function drawBridgeDeck(batch: GeometryBatch, prop: MapProp): void {
  const width = prop.dimensions?.x ?? 6;
  const length = prop.dimensions?.z ?? 12.5;
  const rise = prop.dimensions?.y ?? 0;
  const planks = Math.round(length / 0.42);
  for (let index = 0; index < planks; index += 1) {
    const t = (index + 0.5) / planks;
    const z = t * length;
    const y = rise * t - 0.1;
    const broken = hash3(prop.variant, index, 3);
    const w = width + (broken - 0.5) * 0.5;
    batch.with(Affine.translation((broken - 0.5) * 0.12, y, z).rotateY((broken - 0.5) * 0.05), () => {
      batch.box(0, 0, 0, w, 0.18, length / planks - 0.06, mix(P.plank, P.plankLight, broken), 'wood', 0.03);
    });
  }
  for (const side of [-1, 1]) {
    batch.log([side * (width / 2 - 0.15), -0.35, 0], [side * (width / 2 - 0.15), rise - 0.35, length], 0.2, P.logDark, 'wood', { segments: 6 });
    // Rope hand rail sagging between posts
    const posts = 3;
    for (let post = 0; post <= posts; post += 1) {
      const t = post / posts;
      batch.log([side * (width / 2 - 0.05), rise * t - 0.2, t * length], [side * (width / 2 - 0.05), rise * t + 1.15, t * length], 0.09, P.log, 'wood', { segments: 5 });
    }
    const rope: V3[] = [];
    for (let index = 0; index <= 10; index += 1) {
      const t = index / 10;
      rope.push([side * (width / 2 - 0.05), rise * t + 1.1 - Math.sin(((t * posts) % 1) * Math.PI) * 0.18, t * length]);
    }
    batch.tube(rope, 0.06, 5, P.rope, 'cloth');
    const lower = rope.map(([x, y, z]): V3 => [x, y - 0.5, z]);
    batch.tube(lower, 0.045, 4, P.ropeDark, 'cloth');
  }
  // Cross joists under the deck
  for (let joist = 0; joist <= 3; joist += 1) {
    const t = joist / 3;
    batch.box(0, rise * t - 0.45, t * length, width + 0.6, 0.26, 0.3, P.logDark, 'wood', 0.05);
  }
}

export function drawBridgePylon(batch: GeometryBatch, prop: MapProp): void {
  const height = prop.dimensions?.y ?? 28;
  const half = (prop.dimensions?.x ?? 7.8) / 2;
  if (prop.variant === 1) {
    // Rim anchor frame with rope coils
    for (const side of [-1, 1]) {
      batch.log([side * half, -0.5, 0], [side * half * 0.95, height, 0], 0.45, P.log, 'wood', { segments: 8 });
      batch.log([side * half, height * 0.4, 0], [side * half * 0.5, -0.3, -2.4], 0.25, P.logDark, 'wood', { segments: 6 });
      batch.with(Affine.translation(side * half, height * 0.55, 0.5), () => batch.lathe([[0.55, -0.25], [0.6, 0], [0.55, 0.25]], 10, P.rope, 'cloth'));
    }
    batch.log([-half, height - 0.6, 0], [half, height - 0.6, 0], 0.32, P.logDark, 'wood', { segments: 7 });
    return;
  }
  for (const side of [-1, 1]) {
    // Massive leg built from three lashed logs
    for (let log = 0; log < 3; log += 1) {
      const ox = side * half + (log - 1) * 0.42;
      const lean = side * -0.35;
      batch.log([ox, -0.6, (log - 1) * 0.2], [ox + lean, height, (log - 1) * 0.1], 0.32 - log * 0.03, shade(P.log, 0.9 + log * 0.08), 'wood', { segments: 7 });
    }
    for (let band = 1; band < 6; band += 1) {
      const y = (band / 6) * height;
      batch.with(Affine.translation(side * half - side * 0.35 * (y / height), y, 0), () => batch.lathe([[0.82, -0.12], [0.85, 0], [0.82, 0.12]], 10, P.rope, 'cloth'));
    }
  }
  // Cross braces and the top beam with cable saddles
  for (const y of [height * 0.35, height * 0.75]) {
    batch.log([-half, y - 2.2, 0], [half, y + 1.4, 0], 0.18, P.logDark, 'wood', { segments: 5 });
    batch.log([half, y - 2.2, 0], [-half, y + 1.4, 0], 0.18, P.logDark, 'wood', { segments: 5 });
  }
  batch.log([-half - 1.2, height - 0.4, 0], [half + 1.2, height - 0.4, 0], 0.38, P.logDark, 'wood', { segments: 8 });
  for (const side of [-1, 1]) batch.blob(side * (half - 0.35), height + 0.2, 0, 0.45, 0.35, 0.6, P.metalDark, 'metal', { segments: 6, rings: 4 });
}

/** Main suspension cables and hangers, drawn in world space. */
export function drawBridgeCables(batch: GeometryBatch): void {
  const south = FjordLayout.BRIDGE_SOUTH;
  const north = FjordLayout.BRIDGE_NORTH;
  const pylonTop = 31;
  const anchorTop = { south: sampleMapHeight(0, south.z - 3) + 7, north: sampleMapHeight(0, north.z + 3) + 7 };
  for (const side of [-1, 1]) {
    const x = side * 3.6;
    const points: V3[] = [];
    const supports: V3[] = [
      [x, anchorTop.south, south.z - 3],
      [x, pylonTop, BRIDGE_PYLON_Z[0]],
      [x, pylonTop, BRIDGE_PYLON_Z[1]],
      [x, anchorTop.north, north.z + 3],
    ];
    for (let span = 0; span + 1 < supports.length; span += 1) {
      const a = supports[span] as V3;
      const b = supports[span + 1] as V3;
      const sag = span === 1 ? 7.5 : 1.5;
      for (let index = span === 0 ? 0 : 1; index <= 12; index += 1) {
        const t = index / 12;
        points.push([x, a[1] + (b[1] - a[1]) * t - Math.sin(t * Math.PI) * sag, a[2] + (b[2] - a[2]) * t]);
      }
    }
    batch.tube(points, 0.16, 6, P.ropeDark, 'cloth');
    // Hangers from the main cable down to the deck edge
    for (const point of points) {
      if (point[2] < south.z + 1 || point[2] > north.z - 1) continue;
      const deck = bridgeDeckHeightAt(point[2]);
      if (point[1] - deck < 1.4) continue;
      batch.tube([point, [side * 3.0, deck + 1.1, point[2]]], 0.04, 4, P.rope, 'cloth');
    }
  }
}

export function drawWalkway(batch: GeometryBatch, prop: MapProp): void {
  const path = prop.path ?? [];
  const origin = prop.position;
  const width = prop.variant === 2 ? 1.8 : prop.variant >= 4 ? 2.8 : 2.4;
  for (let index = 0; index + 1 < path.length; index += 1) {
    const a = path[index];
    const b = path[index + 1];
    if (!a || !b) continue;
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    const rise = b.y - a.y;
    const yaw = Math.atan2(b.x - a.x, b.z - a.z);
    batch.at(a.x - origin.x, a.y - origin.y, a.z - origin.z, yaw, () => {
      const planks = Math.max(1, Math.round(length / 0.45));
      for (let p = 0; p < planks; p += 1) {
        const t = (p + 0.5) / planks;
        plank(batch, 0, rise * t - 0.1, t * length, width + (hash3(p, index, 1) - 0.5) * 0.3, length / planks, p + index * 31);
      }
      for (const side of [-1, 1]) {
        batch.log([side * width * 0.45, -0.25, 0], [side * width * 0.45, rise - 0.25, length], 0.1, P.logDark, 'wood', { segments: 5 });
        for (const t of [0.05, 0.95]) {
          const z = t * length;
          const world = {
            x: a.x + Math.sin(yaw) * z + Math.cos(yaw) * side * width * 0.45,
            z: a.z + Math.cos(yaw) * z - Math.sin(yaw) * side * width * 0.45,
          };
          const ground = Math.min(sampleMapHeight(world.x, world.z) - a.y, rise * t - 0.4);
          batch.log([side * width * 0.45, ground - 0.3, z], [side * width * 0.45, rise * t + 1.05, z], 0.1, P.logDark, 'wood', { segments: 5 });
        }
        batch.tube(
          [
            [side * width * 0.45, 1.0, length * 0.05],
            [side * width * 0.45, rise * 0.5 + 0.82, length / 2],
            [side * width * 0.45, rise + 1.0, length * 0.95],
          ],
          0.045,
          4,
          P.rope,
          'cloth',
        );
      }
    });
  }
}

export function drawLadder(batch: GeometryBatch, height: number): void {
  for (const side of [-0.3, 0.3]) batch.log([side, 0, 0], [side, height, 0], 0.05, P.log, 'wood', { segments: 4 });
  const rungs = Math.round(height / 0.35);
  for (let rung = 1; rung < rungs; rung += 1) batch.box(0, (rung / rungs) * height, 0, 0.62, 0.05, 0.06, P.logLight, 'wood', 0);
}

export function drawWaterfall(batch: GeometryBatch, prop: MapProp): void {
  const width = prop.dimensions?.x ?? 9;
  const drop = prop.dimensions?.y ?? 27;
  const reach = prop.dimensions?.z ?? 15;
  const strands = 10;
  for (let strand = 0; strand < strands; strand += 1) {
    const x = -width / 2 + (strand + 0.5) * (width / strands);
    const left: V3[] = [];
    const right: V3[] = [];
    for (let index = 0; index <= 10; index += 1) {
      const t = index / 10;
      const forward = Math.sin(t * Math.PI * 0.5) * reach * 0.85 + t * 1.5;
      const y = -drop * t * t * 0.35 - drop * t * 0.65;
      const spread = (width / strands) * (0.55 + t * 0.35);
      left.push([x - spread, y, forward + Math.sin(strand + t * 6) * 0.3]);
      right.push([x + spread, y, forward + Math.sin(strand + t * 6) * 0.3]);
    }
    batch.ribbon(left, right, (t) => (strand % 2 === 0 ? mix(P.waterfall, P.waterfallShade, t * 0.4) : mix(P.waterfallShade, P.lagoonShallow, t * 0.3)), 'water');
  }
  // Lip and foam / mist at the base
  batch.blob(0, 0.2, 0.6, width / 2 + 0.6, 0.5, 1.4, P.rock, 'rock', { segments: 8, rings: 4, flat: true, wobble: 0.3 });
  for (let puff = 0; puff < 14; puff += 1) {
    const x = (hash3(puff, 1, 2) - 0.5) * width * 1.6;
    const z = reach + (hash3(puff, 3, 4) - 0.5) * 5;
    const s = 1.2 + hash3(puff, 5, 6) * 1.6;
    batch.blob(x, -drop + 0.4 + hash3(puff, 7, 8) * 1.5, z, s, s * 0.7, s, P.white, 'water', { segments: 7, rings: 4 });
  }
}

export function drawStoneArch(batch: GeometryBatch, prop: MapProp): void {
  const width = prop.dimensions?.x ?? 12;
  const rise = prop.dimensions?.y ?? 1;
  const length = prop.dimensions?.z ?? 16;
  const extended = length + 3;
  // Cobbled deck
  const rows = Math.round(extended / 0.7);
  for (let row = 0; row < rows; row += 1) {
    const t = (row + 0.5) / rows;
    const z = -1.5 + t * extended;
    const y = rise * Math.min(1, Math.max(0, z / length));
    const stones = Math.round(width / 0.8);
    for (let stone = 0; stone < stones; stone += 1) {
      const x = -width / 2 + (stone + 0.5 + (row % 2) * 0.25) * (width / stones);
      if (Math.abs(x) > width / 2 - 0.3) continue;
      batch.box(x, y - 0.1, z, width / stones - 0.06, 0.2, extended / rows - 0.06, mix(P.cobbleDark, P.cobble, hash3(row, stone, 7)), 'cobble', 0.05);
    }
  }
  // Parapets
  for (const side of [-1, 1]) {
    const blocks = Math.round(extended / 1.1);
    for (let block = 0; block < blocks; block += 1) {
      const z = -1.5 + (block + 0.5) * (extended / blocks);
      const y = rise * Math.min(1, Math.max(0, z / length));
      batch.box(side * (width / 2 - 0.5), y + 0.6, z, 1.0, 1.2, extended / blocks - 0.05, mix(P.cobble, P.cobbleWarm, hash3(block, side, 1)), 'stone', 0.1);
    }
  }
  // Arch ring with voussoirs and spandrel walls down to the ravine
  const span = length;
  const archRise = 7;
  const voussoirs = 18;
  for (const side of [-1, 1]) {
    for (let index = 0; index < voussoirs; index += 1) {
      const a = Math.PI * ((index + 0.5) / voussoirs);
      const z = span / 2 - Math.cos(a) * span / 2;
      const y = -archRise - 0.8 + Math.sin(a) * archRise;
      batch.with(Affine.translation(side * (width / 2 - 0.6), y, z).rotateX(a - Math.PI / 2), () => {
        batch.box(0, 0, 0, 1.2, 1.4, span / voussoirs * 1.6, index % 2 === 0 ? P.cobbleWarm : P.cobble, 'stone', 0.08);
      });
    }
  }
  for (let index = 0; index < voussoirs; index += 1) {
    const a = Math.PI * ((index + 0.5) / voussoirs);
    const z = span / 2 - Math.cos(a) * span / 2;
    const y = -archRise - 0.8 + Math.sin(a) * archRise;
    const fill = Math.max(0.4, -y - 0.2);
    batch.box(0, y + fill / 2 + 0.6, z, width - 1.4, fill, span / voussoirs + 0.1, mix(P.cobbleDark, P.rock, hash3(index, 3, 3)), 'stone', 0.05);
  }
  for (const z of [-1, span + 1]) {
    batch.box(0, -6, z, width + 0.8, 12, 3.2, mix(P.cobbleDark, P.rock, 0.4), 'stone', 0.15);
  }
}

// ---------------------------------------------------------------------------
// Cable car, T-bar, coaster
// ---------------------------------------------------------------------------

export function drawCableStation(batch: GeometryBatch, prop: MapProp): void {
  const rise = prop.dimensions?.y ?? 0.5;
  const w = prop.dimensions?.x ?? 8;
  const d = prop.dimensions?.z ?? 8;
  if (prop.variant === 1) drawMidSupport(batch, rise);
  else if (prop.variant === 2) drawMountainStation(batch, w, d, rise);
  else drawValleyStation(batch, w, d, rise);
}

/** Vertical boards with uneven tones and ragged bottoms on a wall facing ±Z. */
function boardFacade(batch: GeometryBatch, x0: number, x1: number, y0: number, y1: number, z: number, color: RGB, seed: number): void {
  const count = Math.max(1, Math.round((x1 - x0) / 0.42));
  const step = (x1 - x0) / count;
  for (let index = 0; index < count; index += 1) {
    const tone = mix(color, shade(color, 1.18), hash3(seed, index, 3));
    const drop = hash3(seed, index, 9) * 0.08;
    batch.box(x0 + (index + 0.5) * step, (y0 + y1) / 2 - drop / 2, z, step - 0.04, y1 - y0 + drop, 0.08, tone, 'wood', 0);
  }
}

/** Horizontal logs with irregular overhanging ends on a wall facing ±Z. */
function logFacade(batch: GeometryBatch, x0: number, x1: number, y0: number, y1: number, z: number, color: RGB, seed: number): void {
  const logs = Math.max(2, Math.round((y1 - y0) / 0.34));
  const step = (y1 - y0) / logs;
  for (let index = 0; index < logs; index += 1) {
    const y = y0 + (index + 0.5) * step;
    const left = 0.22 + hash3(seed, index, 1) * 0.2;
    const right = 0.22 + hash3(seed, index, 4) * 0.2;
    batch.log([x0 - left, y, z], [x1 + right, y, z], step * 0.56, mix(color, shade(color, 1.15), hash3(seed, index, 2)), 'wood', { segments: 6, endColor: P.logEnd });
  }
}

/** Framed, glowing window with sill, mullion and optional shutters (`facing` = ±1 along Z). */
function stationWindow(batch: GeometryBatch, x: number, y: number, z: number, facing: number, width: number, height: number, shutter?: RGB): void {
  batch.box(x, y, z + facing * 0.06, width + 0.24, height + 0.24, 0.08, P.trim, 'wood', 0);
  batch.box(x, y, z + facing * 0.1, width, height, 0.04, P.windowGlow, 'plain', 0);
  batch.box(x, y, z + facing * 0.13, 0.07, height, 0.04, P.trim, 'wood', 0);
  batch.box(x, y - height / 2 - 0.12, z + facing * 0.18, width + 0.4, 0.12, 0.3, P.trim, 'wood', 0);
  if (!shutter) return;
  for (const side of [-1, 1]) batch.box(x + side * (width / 2 + 0.32), y, z + facing * 0.1, 0.46, height + 0.1, 0.06, shutter, 'wood', 0);
  // Flower box under the sill
  batch.box(x, y - height / 2 - 0.34, z + facing * 0.26, width + 0.2, 0.28, 0.3, P.alpineRedDark, 'wood', 0);
  for (let flower = 0; flower < 4; flower += 1) {
    const fx = x - width / 2 + 0.1 + flower * ((width - 0.2) / 3);
    batch.blob(fx, y - height / 2 - 0.12, z + facing * 0.28, 0.13, 0.11, 0.11, flower % 2 === 0 ? P.flowerRed : P.flowerPink, 'foliage', { segments: 4, rings: 2 });
  }
}

/** Blank station name board (titles are rendered in-engine from i18n). */
function stationSign(batch: GeometryBatch, y: number, z: number, facing: number): void {
  batch.box(0, y, z, 3.6, 0.82, 0.1, P.alpineRed, 'wood', 0);
  batch.box(0, y, z + facing * 0.06, 3.3, 0.6, 0.04, P.cream, 'wood', 0);
}

/** Gable roof with its ridge along local Z (eaves at x = ±halfW). */
function drawStationRoof(batch: GeometryBatch, halfW: number, halfD: number, eaveY: number, pitch: number, color: RGB, snow: boolean, z = 0): void {
  const run = halfW / Math.cos(pitch);
  const ridgeY = eaveY + halfW * Math.tan(pitch);
  for (const sign of [1, -1]) {
    batch.with(Affine.translation(0, ridgeY, z).rotateZ(-sign * pitch), () => {
      batch.box((sign * run) / 2, 0, 0, run, 0.22, halfD * 2, color, 'shingle', 0.06);
      if (snow) batch.box((sign * run) / 2, 0.2, 0, run * 0.97, 0.24, halfD * 2 + 0.06, P.snow, 'snow', 0.1);
    });
  }
  batch.box(0, ridgeY + (snow ? 0.32 : 0.12), z, 0.34, 0.22, halfD * 2 + 0.12, snow ? P.snow : shade(color, 0.78), snow ? 'snow' : 'wood', 0.04);
}

/** Bullwheel lying flat at the cable height. */
function drawBullwheel(batch: GeometryBatch, y: number, radius: number): void {
  batch.with(Affine.translation(0, y, 0), () => {
    batch.lathe([[radius, -0.12], [radius + 0.12, 0], [radius, 0.12]], 18, P.metalDark, 'metal');
    batch.lathe([[0.3, -0.2], [0.3, 0.2]], 8, P.metal, 'metal', { capTop: true, capBottom: true });
    for (let spoke = 0; spoke < 6; spoke += 1) {
      const a = (spoke / 6) * Math.PI * 2;
      batch.log([0, 0, 0], [Math.sin(a) * radius, 0, Math.cos(a) * radius], 0.06, P.metal, 'metal', { segments: 4 });
    }
  });
}

/**
 * Valley station on the beach cliff: stone base and deck, a two-storey timber
 * station house at the back, an open canopy over the boarding deck and the
 * horizontal bullwheel on its steel frame with machinery cabinets.
 */
function drawValleyStation(batch: GeometryBatch, w: number, d: number, rise: number): void {
  const halfW = w / 2;
  const halfD = d / 2;
  batch.box(0, (rise - 0.8) / 2, 0, w + 0.3, rise + 0.6, d + 0.3, P.cobble, 'stone', 0.14);
  batch.box(0, rise - 0.2, 0, w + 0.5, 0.18, d + 0.5, P.cobbleDark, 'stone', 0.04);
  for (let index = 0; index < Math.round(w / 0.45); index += 1) plank(batch, -halfW + (index + 0.5) * 0.45, rise - 0.08, 0, d, 0.45, index, false);

  // Station house (collider: x ±4.5, z −5…−2, 5.6 m tall).
  const zf = -2;
  const zb = -halfD;
  const zc = (zf + zb) / 2;
  const depth = zf - zb;
  const top = rise + 5.6;
  batch.box(0, rise + 2.8, zc, w - 0.3, 5.6, depth - 0.3, P.logDark, 'wood', 0);
  for (const [z, facing] of [
    [zf, 1],
    [zb, -1],
  ] as const) {
    boardFacade(batch, -halfW, halfW, rise, rise + 2.75, z, P.plankGrey, 11 + facing);
    logFacade(batch, -halfW + 0.2, halfW - 0.2, rise + 2.95, top, z, P.log, 21 + facing);
  }
  for (const side of [-1, 1]) {
    batch.box(side * (halfW - 0.1), rise + 2.8, zc, 0.2, 5.6, depth, mix(P.plankGrey, P.log, 0.4), 'wood', 0);
    for (const z of [zf, zb]) batch.box(side * (halfW - 0.05), rise + 2.8, z, 0.32, 5.7, 0.32, P.logDark, 'wood', 0);
  }
  batch.box(0, rise + 2.85, zc, w + 0.3, 0.24, depth + 0.3, P.logDark, 'wood', 0);
  batch.box(-2.6, rise + 1.1, zf + 0.08, 1.2, 2.2, 0.1, P.logDark, 'wood', 0);
  batch.box(-2.6, rise + 2.3, zf + 0.12, 1.5, 0.18, 0.12, P.trim, 'wood', 0);
  stationWindow(batch, 0.3, rise + 1.6, zf, 1, 1.2, 0.9);
  for (const x of [-2.6, 0, 2.6]) stationWindow(batch, x, rise + 4.25, zf, 1, 0.9, 0.9, P.shutterRed);
  for (const x of [-2, 2]) stationWindow(batch, x, rise + 4.25, zb, -1, 0.9, 0.9, P.shutterRed);
  // House roof: gable with the ridge along X.
  const pitch = 0.55;
  const run = (depth / 2 + 0.8) / Math.cos(pitch);
  const ridgeY = top + (depth / 2) * Math.tan(pitch) + 0.15;
  for (const sign of [1, -1]) {
    batch.with(Affine.translation(0, ridgeY, zc).rotateX(sign * pitch), () => {
      batch.box(0, 0, (sign * run) / 2, w + 1.0, 0.22, run, P.shingleRed, 'shingle', 0.06);
    });
  }
  batch.box(0, ridgeY + 0.12, zc, w + 1.1, 0.2, 0.32, P.logDark, 'wood', 0);
  for (const side of [-1, 1]) {
    batch.orientedPolygon(
      [
        [side * (halfW - 0.02), top, zb],
        [side * (halfW - 0.02), top, zf],
        [side * (halfW - 0.02), ridgeY - 0.1, zc],
      ],
      [side, 0, 0],
      P.plankLight,
      'wood',
    );
  }
  batch.with(Affine.translation(0, ridgeY + 0.1, zc + 0.6), () => batch.box(1.8, 0.6, 0, 0.6, 1.2, 0.6, P.cobble, 'stone', 0.06));

  // Open canopy over the boarding deck on two front posts (colliders at x ±4.1, z 4.4).
  for (const side of [-1, 1]) {
    batch.log([side * 4.1, rise, 4.4], [side * 4.1, rise + 5.2, 4.4], 0.22, P.logDark, 'wood', { segments: 6, endColor: P.logEnd });
    batch.log([side * 4.1, rise + 5.1, zf], [side * 4.1, rise + 5.1, halfD + 0.6], 0.14, P.log, 'wood', { segments: 5, endColor: P.logEnd });
    batch.log([side * 4.1, rise + 4.1, 4.4], [side * 4.1, rise + 5.05, 3.4], 0.07, P.log, 'wood', { segments: 4 });
  }
  const canopyFront = halfD + 0.6;
  drawStationRoof(batch, halfW + 0.5, (canopyFront - zf) / 2, rise + 5.2, 0.3, P.alpineRed, false, (canopyFront + zf) / 2);
  stationSign(batch, rise + 5.8, canopyFront - 0.1, 1);

  // Bullwheel frame and machinery cabinets.
  for (const side of [-1, 1]) {
    batch.log([side * 3.3, rise, 0.4], [side * 3.0, rise + 4.95, 0], 0.12, P.steel, 'metal', { segments: 5 });
    batch.log([side * 3.3, rise, -0.4], [side * 3.0, rise + 4.95, 0], 0.08, P.steel, 'metal', { segments: 4 });
  }
  batch.box(0, rise + 4.95, 0, 6.4, 0.3, 0.42, P.metalDark, 'metal', 0.04);
  batch.box(0, rise + 4.7, 0, 0.35, 0.5, 0.35, P.metal, 'metal', 0.04);
  drawBullwheel(batch, rise + 4.4, 1.9);
  for (const [x, color] of [
    [2.3, P.metal],
    [3.4, P.steel],
  ] as const) {
    batch.box(x, rise + 0.85, zf + 0.42, 0.9, 1.7, 0.6, color, 'metal', 0.05);
    batch.with(Affine.translation(x - 0.15, rise + 1.3, zf + 0.73).rotateX(Math.PI / 2), () => batch.lathe([[0.15, 0], [0.15, 0.03]], 8, P.white, 'plain', { capTop: true }));
    batch.box(x + 0.22, rise + 0.85, zf + 0.73, 0.14, 0.14, 0.05, P.alpineRed, 'plain', 0);
    batch.box(x, rise + 0.4, zf + 0.73, 0.5, 0.06, 0.04, P.yellow, 'plain', 0);
  }
}

/**
 * Mid support: steel lattice tower on concrete footings carrying the boarding
 * deck, switchback stairs, and two lattice masts with a cross-arm and the
 * sheave train the rope runs over.
 */
function drawMidSupport(batch: GeometryBatch, rise: number): void {
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      batch.box(sx * 3.4, 0.3, sz * 2.8, 1.4, 0.9, 1.4, P.cobble, 'stone', 0.1);
      batch.log([sx * 3.4, 0.6, sz * 2.8], [sx * 3.2, rise - 0.2, sz * 2.6], 0.2, P.steel, 'metal', { segments: 5 });
    }
  }
  const levels = Math.max(3, Math.round(rise / 2.6));
  for (let level = 0; level < levels; level += 1) {
    const t0 = level / levels;
    const t1 = (level + 1) / levels;
    const y0 = 0.6 + t0 * (rise - 0.8);
    const y1 = 0.6 + t1 * (rise - 0.8);
    const x0 = 3.4 - 0.2 * t0;
    const x1 = 3.4 - 0.2 * t1;
    const z0 = 2.8 - 0.2 * t0;
    const z1 = 2.8 - 0.2 * t1;
    for (const s of [-1, 1]) {
      batch.log([-x0, y0, s * z0], [x1, y1, s * z1], 0.06, P.metal, 'metal', { segments: 4, capEnds: false });
      batch.log([x0, y0, s * z0], [-x1, y1, s * z1], 0.06, P.metal, 'metal', { segments: 4, capEnds: false });
      batch.log([s * x0, y0, -z0], [s * x1, y1, z1], 0.06, P.metal, 'metal', { segments: 4, capEnds: false });
      batch.log([s * x0, y0, z0], [s * x1, y1, -z1], 0.06, P.metal, 'metal', { segments: 4, capEnds: false });
      batch.box(0, y1, s * z1, x1 * 2, 0.12, 0.12, P.steel, 'metal', 0);
      batch.box(s * x1, y1, 0, 0.12, 0.12, z1 * 2, P.steel, 'metal', 0);
    }
  }
  // Deck with a steel rim and side rails (the ±X edges stay open for the gondola).
  for (let index = 0; index < 16; index += 1) plank(batch, -3.6 + (index + 0.5) * 0.45, rise - 0.1, 0, 6, 0.45, index, false);
  batch.box(0, rise - 0.32, 0, 7.4, 0.26, 6.2, P.metalDark, 'metal', 0.04);
  for (const s of [-1, 1]) {
    for (let post = 0; post <= 8; post += 1) batch.box(-3.5 + post * 0.875, rise + 0.5, s * 2.92, 0.08, 1.0, 0.08, P.steel, 'metal', 0);
    batch.box(0, rise + 1.0, s * 2.92, 7.1, 0.08, 0.1, P.alpineRed, 'metal', 0);
    batch.box(0, rise + 0.5, s * 2.92, 7.1, 0.06, 0.06, P.steel, 'metal', 0);
  }
  // Switchback stairs on the outside of the tower.
  for (const [x, z0, z1, y0, y1] of [
    [5.2, -6.8, 1.2, 0, rise / 2],
    [4.2, 3.6, -2.6, rise / 2, rise],
  ] as const) {
    const steps = Math.round((y1 - y0) / 0.28);
    for (let step = 0; step < steps; step += 1) {
      const t = (step + 0.5) / steps;
      batch.box(x, y0 + (y1 - y0) * t, z0 + (z1 - z0) * t, 1.6, 0.12, Math.abs(z1 - z0) / steps + 0.05, P.plankLight, 'wood', 0.02);
    }
    for (const side of [-1, 1]) batch.log([x + side * 0.82, y0 - 0.2, z0], [x + side * 0.82, y1 - 0.2, z1], 0.08, P.metalDark, 'metal', { segments: 4 });
    batch.log([x + 0.85, y0 + 1.0, z0], [x + 0.85, y1 + 1.0, z1], 0.05, P.alpineRed, 'metal', { segments: 4 });
  }
  batch.box(5.2, rise / 2 - 0.15, 2.4, 2.4, 0.3, 2.4, P.plank, 'wood', 0.04);
  batch.log([5.2, 0, 2.4], [5.2, rise / 2 - 0.3, 2.4], 0.14, P.steel, 'metal', { segments: 5 });
  batch.log([5.2, 0, -6.6], [5.2, 0.4, -6.6], 0.14, P.steel, 'metal', { segments: 5 });

  // Two lattice masts carrying the cross-arm and the sheave train above the deck.
  const mastTop = rise + 5.6;
  for (const s of [-1, 1]) {
    const z = s * 2.75;
    for (const sx of [-1, 1]) batch.log([sx * 0.6, rise, z], [sx * 0.25, mastTop, z], 0.09, P.steel, 'metal', { segments: 4 });
    for (let level = 0; level < 4; level += 1) {
      const ya = rise + (level / 4) * 5.6;
      const yb = rise + ((level + 1) / 4) * 5.6;
      const xa = 0.6 - 0.35 * (level / 4);
      const xb = 0.6 - 0.35 * ((level + 1) / 4);
      batch.log([level % 2 === 0 ? -xa : xa, ya, z], [level % 2 === 0 ? xb : -xb, yb, z], 0.04, P.metal, 'metal', { segments: 4, capEnds: false });
    }
  }
  batch.box(0, mastTop, 0, 0.5, 0.42, 6.6, P.alpineRed, 'metal', 0.06);
  batch.box(0, rise + 5.1, 0, 0.16, 0.9, 0.16, P.metalDark, 'metal', 0);
  batch.box(0, rise + 4.7, 0, 3.2, 0.18, 0.22, P.metalDark, 'metal', 0);
  for (let sheave = 0; sheave < 4; sheave += 1) {
    batch.with(Affine.translation(-1.2 + sheave * 0.8, rise + 4.55, 0).rotateX(Math.PI / 2), () => {
      batch.lathe([[0.26, -0.07], [0.26, 0.07]], 8, P.metal, 'metal', { capTop: true, capBottom: true });
    });
  }
}

/**
 * Mountain station: carved snowy chalet at the back of a covered docking
 * balcony on a log trestle, carved railings, icicles and the bullwheel under
 * the ridge.
 */
function drawMountainStation(batch: GeometryBatch, w: number, d: number, rise: number): void {
  const halfW = w / 2;
  const halfD = d / 2;
  for (const sx of [-1, 1]) {
    for (const z of [-halfD + 0.3, 0, halfD - 0.3]) {
      batch.log([sx * (halfW - 0.3), -0.3, z], [sx * (halfW - 0.3), rise - 0.3, z], 0.24, P.log, 'wood', { segments: 6, endColor: P.logEnd });
    }
    batch.log([sx * (halfW - 0.3), 0.2, -halfD + 0.3], [sx * (halfW - 0.3), rise - 0.45, 0], 0.09, P.logDark, 'wood', { segments: 4 });
    batch.log([sx * (halfW - 0.3), 0.2, halfD - 0.3], [sx * (halfW - 0.3), rise - 0.45, 0], 0.09, P.logDark, 'wood', { segments: 4 });
  }
  batch.box(0, rise - 0.32, 0, w + 0.1, 0.26, d + 0.1, P.logDark, 'wood', 0.04);
  const count = Math.round(w / 0.45);
  for (let index = 0; index < count; index += 1) plank(batch, -halfW + (index + 0.5) * (w / count), rise - 0.08, 0, d, w / count, index, false);
  // Stairs on the +X side (collider ramp from z −4.6 to 1.6) and the landing.
  const steps = Math.round(rise / 0.28);
  for (let step = 0; step < steps; step += 1) {
    const t = (step + 0.5) / steps;
    batch.box(5.6, rise * t, -4.6 + 6.2 * t, 1.8, 0.12, 6.2 / steps + 0.05, P.plankLight, 'wood', 0.02);
  }
  batch.box(5.2, rise - 0.15, 0.6, 2.8, 0.3, 2.8, P.plank, 'wood', 0.04);
  for (const [x, z] of [
    [6.5, -0.7],
    [6.5, 1.9],
  ] as const) batch.log([x, -0.3, z], [x, rise + 1.0, z], 0.12, P.log, 'wood', { segments: 5, endColor: P.logEnd });
  batch.log([6.5, rise + 1.0, -0.7], [6.5, rise + 1.0, 1.9], 0.07, P.logDark, 'wood', { segments: 4 });
  batch.log([6.5, 1.0, -4.6], [6.5, rise + 1.0, 1.6], 0.06, P.logDark, 'wood', { segments: 4 });

  // Carved station chalet (collider: x ±4, z 2.1…4.5, 5.4 m tall).
  const zf = 2.1;
  const zb = halfD;
  const zc = (zf + zb) / 2;
  const top = rise + 5.4;
  batch.box(0, rise + 2.7, zc, w - 0.3, 5.4, zb - zf - 0.2, P.logDark, 'wood', 0);
  logFacade(batch, -halfW + 0.2, halfW - 0.2, rise, rise + 2.7, zf, P.log, 31);
  boardFacade(batch, -halfW, halfW, rise + 2.85, top, zf - 0.02, P.logLight, 33);
  batch.box(0, rise + 2.8, zf - 0.08, w + 0.3, 0.22, 0.22, P.logDark, 'wood', 0);
  for (let scallop = 0; scallop < 14; scallop += 1) {
    const x = -halfW + 0.3 + scallop * ((w - 0.6) / 13);
    batch.with(Affine.translation(x, rise + 2.66, zf - 0.14), () =>
      batch.extrude(
        [
          [-0.26, 0],
          [0.26, 0],
          [0.18, -0.16],
          [0, -0.24],
          [-0.18, -0.16],
        ],
        0.06,
        P.trim,
        'wood',
      ),
    );
  }
  batch.box(1.6, rise + 1.1, zf - 0.08, 1.2, 2.2, 0.1, P.logDark, 'wood', 0);
  batch.box(1.6, rise + 2.3, zf - 0.12, 1.5, 0.18, 0.12, P.trim, 'wood', 0);
  stationWindow(batch, -1.6, rise + 1.6, zf, -1, 1.1, 0.9, P.shutterRed);
  for (const x of [-2.2, 0, 2.2]) stationWindow(batch, x, rise + 4.1, zf, -1, 0.8, 0.85, P.shutterRed);
  for (const side of [-1, 1]) batch.box(side * (halfW - 0.1), rise + 2.7, zc, 0.22, 5.4, zb - zf, P.log, 'wood', 0);

  // Covered docking balcony: carved posts, railings and a big snowy roof.
  for (const side of [-1, 1]) {
    for (const z of [-halfD + 0.4, -1.0]) {
      batch.log([side * (halfW - 0.35), rise, z], [side * (halfW - 0.35), top, z], 0.17, P.log, 'wood', { segments: 6, endColor: P.logEnd });
      batch.log([side * (halfW - 0.35), top - 0.9, z], [side * (halfW - 0.35), top - 0.1, z + 0.9], 0.07, P.logDark, 'wood', { segments: 4 });
    }
    batch.log([side * (halfW - 0.35), top, -halfD - 0.6], [side * (halfW - 0.35), top, zb], 0.15, P.logDark, 'wood', { segments: 5, endColor: P.logEnd });
    const railEnd = side < 0 ? zf : -0.8;
    for (let baluster = 0; baluster < 14; baluster += 1) {
      const z = -halfD + 0.4 + baluster * ((railEnd + halfD - 0.4) / 13);
      batch.box(side * (halfW - 0.2), rise + 0.5, z, 0.06, 1.0, 0.16, baluster % 2 === 0 ? P.plankLight : P.plank, 'wood', 0);
    }
    batch.box(side * (halfW - 0.2), rise + 1.02, (railEnd - halfD + 0.4) / 2, 0.12, 0.1, railEnd + halfD - 0.4, P.logDark, 'wood', 0);
  }
  drawStationRoof(batch, halfW + 0.6, halfD + 0.7, top, 0.52, P.shingleDark, true, -0.25);
  drawIcicleRow(batch, [-(halfW + 0.6), top - 0.12, -halfD - 0.9], [-(halfW + 0.6), top - 0.12, halfD + 0.4], 0.5);
  drawIcicleRow(batch, [halfW + 0.6, top - 0.12, -halfD - 0.9], [halfW + 0.6, top - 0.12, halfD + 0.4], 0.5);
  // Carved barge boards and the blank sign on the open front gable.
  const ridgeY = top + (halfW + 0.6) * Math.tan(0.52);
  for (const side of [-1, 1]) {
    batch.log([0, ridgeY - 0.15, -halfD - 0.9], [side * (halfW + 0.6), top - 0.15, -halfD - 0.9], 0.1, P.trim, 'wood', { segments: 4 });
  }
  batch.with(Affine.translation(0, ridgeY - 0.9, -halfD - 0.85), () => batch.extrude(heartShape(0.42), 0.08, P.alpineRed, 'wood'));
  stationSign(batch, top + 0.45, -halfD - 0.8, -1);
  // Bullwheel hanging from the ridge beam at the rope height.
  batch.box(0, ridgeY - 0.5, 0, 0.3, 0.3, d, P.logDark, 'wood', 0);
  batch.box(0, rise + 5.0, 0, 0.3, ridgeY - rise - 5.3, 0.3, P.metalDark, 'metal', 0);
  drawBullwheel(batch, rise + 4.4, 1.8);
}

function heartShape(size: number): [number, number][] {
  const points: [number, number][] = [];
  for (let index = 0; index < 14; index += 1) {
    const t = (index / 14) * Math.PI * 2;
    const x = 16 * Math.pow(Math.sin(t), 3);
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    points.push([(x / 17) * size, (y / 17) * size]);
  }
  return points.reverse();
}

export function drawCablePylon(batch: GeometryBatch, prop: MapProp): void {
  const height = prop.dimensions?.y ?? 18;
  const base = 1.7;
  const top = 0.6;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      batch.log([sx * base, -0.3, sz * base], [sx * top, height - 1, sz * top], 0.12, P.steel, 'metal', { segments: 5 });
    }
  }
  const levels = Math.max(3, Math.round(height / 3));
  for (let level = 0; level < levels; level += 1) {
    const y0 = (level / levels) * (height - 1);
    const y1 = ((level + 1) / levels) * (height - 1);
    const r0 = base + (top - base) * (y0 / (height - 1));
    const r1 = base + (top - base) * (y1 / (height - 1));
    for (const s of [-1, 1]) {
      batch.log([-r0, y0, s * r0], [r1, y1, s * r1], 0.05, P.metal, 'metal', { segments: 4 });
      batch.log([s * r0, y0, -r0], [s * r1, y1, r1], 0.05, P.metal, 'metal', { segments: 4 });
    }
  }
  batch.box(0, height - 0.6, 0, 5.5, 0.45, 0.7, P.alpineRed, 'metal', 0.06);
  for (const side of [-1, 1]) batch.with(Affine.translation(side * 2.4, height - 0.25, 0).rotateZ(Math.PI / 2), () => batch.lathe([[0.4, -0.15], [0.4, 0.15]], 10, P.metalDark, 'metal', { capTop: true, capBottom: true }));
  batch.box(0, 0.25, 0, base * 2 + 1.2, 0.5, base * 2 + 1.2, P.cobble, 'stone', 0.1);
}

export function drawRouteCable(batch: GeometryBatch, route: RoutePolyline, radius: number, color: RGB, offset = 0): void {
  const points = route.points.map((point): V3 => [point.x, point.y + offset, point.z]);
  batch.tube(points, radius, 5, color, 'metal');
}

export function drawTBarPylon(batch: GeometryBatch, prop: MapProp): void {
  const height = prop.dimensions?.y ?? 6;
  const reach = prop.dimensions?.x ?? 2.8;
  batch.lathe([[0.35, 0], [0.22, 0.4], [0.18, height]], 8, P.steel, 'metal');
  batch.box(0.25, 0.2, 0, 1.2, 0.4, 1.2, P.cobble, 'stone', 0.08);
  batch.log([0, height - 0.3, 0], [reach + 0.6, height - 0.3, 0], 0.1, P.alpineRed, 'metal', { segments: 5 });
  batch.with(Affine.translation(reach, height - 0.55, 0).rotateZ(Math.PI / 2), () => batch.lathe([[0.25, -0.1], [0.25, 0.1]], 8, P.metalDark, 'metal', { capTop: true, capBottom: true }));
}

/**
 * T-bar stations: a small snowy plank shed (collider at x −3.4, z ∓1.5), the
 * drive bullwheel on a concrete block at the bottom and the return wheel on a
 * timber A-frame trestle at the top.
 */
export function drawTBarStation(batch: GeometryBatch, variant: number): void {
  const shedZ = variant === 0 ? -1.5 : 1.5;
  batch.with(Affine.translation(-3.4, 0, shedZ), () => {
    batch.box(0, 0.15, 0, 4.4, 0.3, 4.4, P.cobble, 'stone', 0.06);
    batch.box(0, 1.65, 0, 3.9, 2.7, 3.9, P.plankGrey, 'wood', 0);
    boardFacade(batch, -2.0, 2.0, 0.3, 3.0, 1.98, P.plankGrey, 41 + variant);
    boardFacade(batch, -2.0, 2.0, 0.3, 3.0, -1.98, P.plankGrey, 43 + variant);
    batch.box(0.6, 1.3, 2.06, 1.0, 2.0, 0.08, P.logDark, 'wood', 0);
    batch.box(0.6, 2.38, 2.1, 1.2, 0.14, 0.1, P.trim, 'wood', 0);
    stationWindow(batch, -1.0, 1.9, 1.98, 1, 0.7, 0.6, P.shutterGreen);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) batch.box(sx * 1.95, 1.65, sz * 1.95, 0.24, 2.8, 0.24, P.logDark, 'wood', 0);
    drawStationRoof(batch, 2.5, 2.5, 3.0, 0.62, P.shingleDark, true);
    drawIcicleRow(batch, [-2.5, 2.9, -2.4], [-2.5, 2.9, 2.4], variant + 3);
    drawIcicleRow(batch, [2.5, 2.9, -2.4], [2.5, 2.9, 2.4], variant + 5);
    // Firewood stacked against the side wall.
    for (let row = 0; row < 3; row += 1) {
      for (let index = 0; index < 4 - (row % 2); index += 1) {
        const z = -1.4 + index * 0.62 + (row % 2) * 0.31;
        batch.log([2.0, 0.42 + row * 0.34, z], [2.9, 0.42 + row * 0.34, z], 0.16, mix(P.log, P.logLight, hash3(row, index, variant)), 'wood', { segments: 6, endColor: P.logEnd });
      }
    }
  });
  if (variant === 0) {
    // Drive bullwheel on its concrete block (collider 1.6 × 1.2 × 1.6).
    batch.box(0, 0.6, 0, 1.6, 1.2, 1.6, mix(P.cobble, P.white, 0.25), 'stone', 0.1);
    batch.box(0, 1.5, -0.3, 1.0, 0.6, 0.8, P.alpineRed, 'metal', 0.06);
    batch.lathe([[0.28, 1.2], [0.2, 5.0]], 7, P.steel, 'metal');
    batch.box(0, 4.95, 0, 0.6, 0.3, 0.6, P.metalDark, 'metal', 0.04);
    drawBullwheel(batch, 5.2, 1.6);
    return;
  }
  // Return wheel on a timber A-frame trestle (legs at x ±1).
  for (const sx of [-1, 1]) {
    batch.log([sx * 1.0, -0.3, -1.3], [sx * 0.45, 5.0, 0], 0.15, P.log, 'wood', { segments: 5, endColor: P.logEnd });
    batch.log([sx * 1.0, -0.3, 1.3], [sx * 0.45, 5.0, 0], 0.15, P.log, 'wood', { segments: 5, endColor: P.logEnd });
    batch.log([sx * 1.0, 0, 0], [sx * 0.45, 5.0, 0], 0.18, P.log, 'wood', { segments: 5, endColor: P.logEnd });
    batch.log([sx * 0.85, 1.6, -0.9], [sx * 0.85, 1.6, 0.9], 0.08, P.logDark, 'wood', { segments: 4 });
  }
  batch.log([-0.8, 2.6, 0], [0.8, 2.6, 0], 0.09, P.logDark, 'wood', { segments: 4 });
  batch.box(0, 5.0, 0, 1.4, 0.3, 0.5, P.logDark, 'wood', 0);
  drawBullwheel(batch, 5.2, 1.6);
}

/** Turquoise-silver coaster trough swept along the shared route with banking. */
export function drawCoasterTrack(batch: GeometryBatch): void {
  const coaster = FJORD_MAP.routes.coaster;
  const points = coaster.track.points;
  const profile: [number, number, RGB][] = [
    [-1.25, 0.75, P.coasterSilver],
    [-1.15, 0.2, P.coasterTeal],
    [-0.7, -0.12, P.coasterTeal],
    [0, -0.2, P.coasterTeal],
    [0.7, -0.12, P.coasterTeal],
    [1.15, 0.2, P.coasterTeal],
    [1.25, 0.75, P.coasterSilver],
  ];
  const rings: number[][] = [];
  const outer: number[][] = [];
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    const previous = points[Math.max(0, index - 1)];
    const next = points[Math.min(points.length - 1, index + 1)];
    if (!point || !previous || !next) continue;
    let tx = next.x - previous.x;
    let ty = next.y - previous.y;
    let tz = next.z - previous.z;
    const tl = Math.hypot(tx, ty, tz) || 1;
    tx /= tl;
    ty /= tl;
    tz /= tl;
    const bank = coaster.bank[index] ?? 0;
    // side = up × tangent, then roll by bank
    let sx = tz;
    let sz = -tx;
    const sl = Math.hypot(sx, sz) || 1;
    sx /= sl;
    sz /= sl;
    const ux0 = -sz * ty;
    const uy0 = sz * tx - sx * tz;
    const uz0 = sx * ty;
    const c = Math.cos(bank);
    const s = Math.sin(bank);
    const rx = sx * c + ux0 * s;
    const ry = uy0 * s;
    const rz = sz * c + uz0 * s;
    const ux = -sx * s + ux0 * c;
    const uy = uy0 * c;
    const uz = -sz * s + uz0 * c;
    const ring: number[] = [];
    const ringOuter: number[] = [];
    for (const [px, py, color] of profile) {
      const nx = -px * rx * 0.2 + ux;
      const ny = -px * ry * 0.2 + uy;
      const nz = -px * rz * 0.2 + uz;
      ring.push(batch.vertex(point.x + rx * px + ux * py, point.y + ry * px + uy * py, point.z + rz * px + uz * py, nx, ny, nz, color, 'metal'));
      ringOuter.push(batch.vertex(point.x + rx * px * 1.12 + ux * (py - 0.18), point.y + ry * px * 1.12 + uy * (py - 0.18), point.z + rz * px * 1.12 + uz * (py - 0.18), -nx, -ny, -nz, P.coasterSilver, 'metal'));
    }
    rings.push(ring);
    outer.push(ringOuter);
  }
  for (let index = 0; index + 1 < rings.length; index += 1) {
    const a = rings[index] as number[];
    const b = rings[index + 1] as number[];
    const oa = outer[index] as number[];
    const ob = outer[index + 1] as number[];
    for (let k = 0; k + 1 < profile.length; k += 1) {
      batch.triangle(a[k] as number, b[k] as number, b[k + 1] as number);
      batch.triangle(a[k] as number, b[k + 1] as number, a[k + 1] as number);
      batch.triangle(oa[k] as number, ob[k + 1] as number, ob[k] as number);
      batch.triangle(oa[k] as number, oa[k + 1] as number, ob[k + 1] as number);
    }
  }
  const lip = coaster.rampEnd;
  for (const pillar of coaster.pillars) {
    const h = pillar.top.y - 0.4 - pillar.ground;
    if (h < 0.4) continue;
    if (Math.hypot(pillar.top.x - lip.x, pillar.top.z - lip.z) < 18) {
      // Timber trestle under the jump ramp, braced across the track.
      let nearest = 0;
      let best = Infinity;
      points.forEach((point, index) => {
        const distance = Math.hypot(point.x - pillar.top.x, point.z - pillar.top.z);
        if (distance < best) {
          best = distance;
          nearest = index;
        }
      });
      const before = points[Math.max(0, nearest - 1)] ?? pillar.top;
      const after = points[Math.min(points.length - 1, nearest + 1)] ?? pillar.top;
      const tx = after.x - before.x;
      const tz = after.z - before.z;
      const tl = Math.hypot(tx, tz) || 1;
      drawRampBent(batch, pillar.top.x, pillar.top.y, pillar.top.z, pillar.ground, tz / tl, -tx / tl);
      continue;
    }
    batch.log([pillar.top.x, pillar.ground - 0.3, pillar.top.z], [pillar.top.x, pillar.top.y - 0.35, pillar.top.z], 0.22, P.steel, 'metal', { segments: 6 });
    batch.box(pillar.top.x, pillar.top.y - 0.45, pillar.top.z, 2.6, 0.2, 0.3, P.metalDark, 'metal', 0.04);
    batch.box(pillar.top.x, pillar.ground + 0.2, pillar.top.z, 1.0, 0.4, 1.0, P.cobble, 'stone', 0.08);
  }
}

/**
 * Coaster start: an open timber roof on log posts over a raised wooden deck on
 * a log trestle, railings, stairs at a walkable 34° and four waiting bobs.
 */
export function drawCoasterPlatform(batch: GeometryBatch, prop: MapProp): void {
  const rise = prop.dimensions?.y ?? 1.5;
  for (const x of [-6.7, -3.4, -0.1]) {
    for (const z of [-3.8, -1, 1.8]) batch.log([x, -0.3, z], [x, rise - 0.3, z], 0.2, P.log, 'wood', { segments: 6, endColor: P.logEnd });
  }
  for (const z of [-3.8, 1.8]) {
    batch.log([-6.7, 0.3, z], [-0.1, rise - 0.6, z], 0.08, P.logDark, 'wood', { segments: 4 });
    batch.log([-0.1, 0.3, z], [-6.7, rise - 0.6, z], 0.08, P.logDark, 'wood', { segments: 4 });
  }
  for (const x of [-6.7, -0.1]) {
    batch.log([x, 0.3, -3.8], [x, rise - 0.6, 1.8], 0.08, P.logDark, 'wood', { segments: 4 });
    batch.log([x, 0.3, 1.8], [x, rise - 0.6, -3.8], 0.08, P.logDark, 'wood', { segments: 4 });
  }
  batch.box(-3.4, rise - 0.3, -1, 7.1, 0.26, 6.1, P.logDark, 'wood', 0.04);
  for (let index = 0; index < 15; index += 1) plank(batch, -3.4 + (-3.5 + (index + 0.5) * (7 / 15)), rise - 0.08, -1, 6, 7 / 15, index, false);
  // Railings: back (−X, gap for the stairs), both ends; the trough side (+X) stays open.
  const balusters = (a: V3, b: V3, count: number): void => {
    for (let index = 0; index <= count; index += 1) {
      const t = index / count;
      batch.box(a[0] + (b[0] - a[0]) * t, rise + 0.5, a[2] + (b[2] - a[2]) * t, 0.12, 1.0, 0.12, index % 2 === 0 ? P.plankLight : P.plank, 'wood', 0);
    }
    batch.log([a[0], rise + 1.02, a[2]], [b[0], rise + 1.02, b[2]], 0.06, P.logDark, 'wood', { segments: 4 });
  };
  balusters([-6.85, 0, -3.95], [-6.85, 0, -2.2], 3);
  balusters([-6.85, 0, 0.2], [-6.85, 0, 1.95], 3);
  balusters([-6.85, 0, 1.95], [0, 0, 1.95], 12);
  balusters([-6.85, 0, -3.95], [0, 0, -3.95], 12);
  // Stairs off the back edge (collider ramp from x −6.9 − rise/0.68 up to −6.9 at z −1).
  const run = rise / 0.68;
  const steps = Math.max(2, Math.round(rise / 0.22));
  for (let step = 0; step < steps; step += 1) {
    const t = (step + 0.5) / steps;
    batch.box(-6.9 - run + run * t, rise * t, -1, run / steps + 0.05, 0.12, 2.2, P.plankLight, 'wood', 0.02);
  }
  for (const side of [-1, 1]) {
    batch.log([-6.9 - run, -0.2, -1 + side * 1.15], [-6.9, rise - 0.2, -1 + side * 1.15], 0.1, P.logDark, 'wood', { segments: 4 });
    batch.log([-6.9 - run, 1.0, -1 + side * 1.2], [-6.9, rise + 1.0, -1 + side * 1.2], 0.05, P.log, 'wood', { segments: 4 });
    for (const t of [0.3, 0.65]) {
      batch.log([-6.9 - run + run * t, -0.3, -1 + side * 1.2], [-6.9 - run + run * t, rise * t + 1.0, -1 + side * 1.2], 0.06, P.log, 'wood', { segments: 4 });
    }
  }
  // Open timber roof on four log posts.
  for (const sx of [-6.6, -0.2]) for (const sz of [-3.8, 1.8]) batch.log([sx, rise, sz], [sx, rise + 3.2, sz], 0.15, P.log, 'wood', { segments: 5, endColor: P.logEnd });
  for (const sx of [-6.6, -0.2]) batch.log([sx, rise + 3.15, -4.3], [sx, rise + 3.15, 2.3], 0.12, P.logDark, 'wood', { segments: 5, endColor: P.logEnd });
  batch.with(Affine.translation(-3.4, 0, -1), () => drawStationRoof(batch, 3.9, 3.5, rise + 3.25, 0.5, P.shingleDark, true));
  // Waiting bobs in four colours
  const colors = [P.flamingo, P.yellow, P.flowerPurple, P.peakBlue];
  for (let bob = 0; bob < 4; bob += 1) {
    batch.with(Affine.translation(-5.6 + bob * 1.5, rise, 1.0), () => {
      batch.blob(0, 0.35, 0, 0.6, 0.35, 0.9, colors[bob] ?? P.flamingo, 'plain', { segments: 8, rings: 4, flatBottom: true });
      batch.blob(0, 0.5, -0.1, 0.42, 0.2, 0.55, P.ink, 'plain', { segments: 7, rings: 3 });
    });
  }
}

/** Timber bent under the jump ramp: a centre post (the collider), splayed legs, cap beam and braces. */
function drawRampBent(batch: GeometryBatch, x: number, y: number, z: number, ground: number, sideX: number, sideZ: number): void {
  const capY = y - 0.4;
  batch.log([x, ground - 0.3, z], [x, capY, z], 0.3, P.log, 'wood', { segments: 6, endColor: P.logEnd });
  const legTop: V3[] = [];
  const legFoot: V3[] = [];
  for (const s of [-1, 1]) {
    const gx = x + sideX * s * 2.3;
    const gz = z + sideZ * s * 2.3;
    const foot: V3 = [gx, sampleMapHeight(gx, gz) - 0.3, gz];
    const head: V3 = [x + sideX * s * 1.15, capY, z + sideZ * s * 1.15];
    batch.log(foot, head, 0.17, P.log, 'wood', { segments: 5, endColor: P.logEnd });
    legFoot.push(foot);
    legTop.push(head);
  }
  batch.log([x - sideX * 1.5, capY, z - sideZ * 1.5], [x + sideX * 1.5, capY, z + sideZ * 1.5], 0.17, P.logDark, 'wood', { segments: 5, endColor: P.logEnd });
  const [footA, footB] = legFoot as [V3, V3];
  const [headA, headB] = legTop as [V3, V3];
  const at = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  batch.log(at(footA, headA, 0.12), at(footB, headB, 0.8), 0.08, P.logDark, 'wood', { segments: 4 });
  batch.log(at(footB, headB, 0.12), at(footA, headA, 0.8), 0.08, P.logDark, 'wood', { segments: 4 });
  batch.log(at(footA, headA, 0.45), at(footB, headB, 0.45), 0.08, P.logDark, 'wood', { segments: 4 });
}

// ---------------------------------------------------------------------------
// Hammock catapult, billboards, docks, hangars
// ---------------------------------------------------------------------------

export function drawHammock(batch: GeometryBatch, prop: MapProp): void {
  const half = (prop.dimensions?.x ?? 7.2) / 2;
  for (const side of [-1, 1]) {
    batch.with(Affine.translation(side * half, 0, 0), () => drawPalm(batch, 1.25, 1, side * 17 + 3, side > 0 ? -Math.PI / 2 + 0.3 : Math.PI / 2 - 0.3));
  }
  const stripes = [P.alpineRed, P.yellow, P.shutterGreen];
  const segments = 8;
  for (let stripe = 0; stripe < 6; stripe += 1) {
    const z0 = -0.9 + stripe * 0.3;
    const left: V3[] = [];
    const right: V3[] = [];
    for (let index = 0; index <= segments; index += 1) {
      const t = index / segments;
      const x = -half * 0.78 + t * half * 1.56;
      const y = 2.2 - Math.sin(t * Math.PI) * 1.1;
      const curl = Math.abs(z0 + 0.15) * 0.25;
      left.push([x, y + curl, z0]);
      right.push([x, y + curl, z0 + 0.3]);
    }
    batch.ribbon(left, right, stripes[stripe % 3] ?? P.alpineRed, 'cloth');
  }
  for (const side of [-1, 1]) {
    batch.tube([[side * half, 2.4, 0], [side * half * 0.78, 2.2, -0.9]], 0.04, 4, P.rope, 'cloth');
    batch.tube([[side * half, 2.4, 0], [side * half * 0.78, 2.2, 0.9]], 0.04, 4, P.rope, 'cloth');
  }
}

export function drawBillboardFrame(batch: GeometryBatch, prop: MapProp): void {
  const width = prop.dimensions?.x ?? 6;
  const height = prop.dimensions?.y ?? 3.5;
  const posts = prop.dimensions?.z ?? 2.3;
  for (const side of [-1, 1]) {
    batch.log([side * 2.4, -0.4, -0.1], [side * 2.4, posts + height + 0.3, -0.1], 0.16, P.logDark, 'wood', { segments: 6 });
    batch.log([side * 2.4, 0, -1.6], [side * 2.4, posts * 0.9, -0.15], 0.1, P.logDark, 'wood', { segments: 5 });
  }
  batch.box(0, posts + height / 2, -0.06, width + 0.1, height + 0.1, 0.12, P.plankGrey, 'wood', 0.03);
  // Chunky painted frame
  batch.box(0, posts + height + 0.12, 0.04, width + 0.5, 0.28, 0.22, P.alpineRed, 'wood', 0.06);
  batch.box(0, posts - 0.12, 0.04, width + 0.5, 0.28, 0.22, P.alpineRed, 'wood', 0.06);
  for (const side of [-1, 1]) batch.box(side * (width / 2 + 0.12), posts + height / 2, 0.04, 0.26, height + 0.5, 0.22, P.alpineRed, 'wood', 0.06);
  // Vertex-colour fallback poster (covered by the painted poster texture when it loads).
  batch.box(0, posts + height / 2, 0.01, width - 0.05, height - 0.05, 0.02, mix(P.glass, P.cream, 0.4), 'plain', 0);
  batch.box(0, posts + height - 0.45, 0.025, width - 0.4, 0.6, 0.01, P.cream, 'plain', 0);
  batch.blob(-1.4, posts + 1.4, 0.04, 1.0, 0.9, 0.05, prop.variant % 2 === 0 ? P.cheese : P.flamingo, 'plain', { segments: 10, rings: 3 });
  batch.extrude(
    [
      [0, posts + 0.25],
      [3, posts + 0.25],
      [1.6, posts + 2.4],
    ],
    0.04,
    P.snowShade,
    'plain',
  );
  // Little lamps on top
  for (const side of [-1, 1]) batch.with(Affine.translation(side * 1.6, posts + height + 0.3, 0.3).rotateX(0.6), () => batch.lathe([[0.05, 0], [0.22, 0.3], [0.25, 0.32]], 6, P.metalDark, 'metal', { capTop: true }));
}

export function drawBoatDock(batch: GeometryBatch, prop: MapProp): void {
  const width = prop.dimensions?.x ?? 4;
  const length = prop.dimensions?.z ?? 26;
  for (let index = 0; index < Math.round(length / 0.5); index += 1) plank(batch, 0, -0.08, (index + 0.5) * 0.5, width, 0.5, index);
  for (let index = 0; index < 20; index += 1) plank(batch, -5 + (index + 0.5) * 0.5, -0.08, length + 2, 5, 0.5, index + 40, false);
  for (const side of [-1, 1]) {
    for (let post = 0; post <= Math.round(length / 3); post += 1) {
      const z = post * 3;
      const world = toWorld(prop, side * (width / 2 + 0.1), z);
      piling(batch, side * (width / 2 + 0.1), z, prop.position.y, world.x, world.z, 0.9);
    }
  }
  batch.with(Affine.translation(-3.5, 0, length + 3.5), () => batch.lathe([[0.4, 0], [0.45, 0.6]], 10, P.coral, 'plain', { capTop: true }));
  drawLifeRing(batch);
}

function drawLifeRing(batch: GeometryBatch): void {
  // Life ring hung on the dock post.
  batch.with(Affine.translation(2.3, 0.6, 2).rotateZ(Math.PI / 2), () => {
    batch.lathe(
      [
        [0.45, -0.1],
        [0.55, 0],
        [0.45, 0.1],
      ],
      12,
      (ring, segment) => (Math.floor(segment / 3) % 2 === 0 ? P.coral : P.white),
      'plain',
    );
  });
}

export { drawCheeseWheel };
