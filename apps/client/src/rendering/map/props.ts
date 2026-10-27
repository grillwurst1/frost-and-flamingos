/**
 * Small map dressing drawn in prop-local space: crates, barrels, benches,
 * lanterns, signposts, leaning fences, bunting, stone walls, silos, cheese
 * wheels, flamingo statues, tents, flags, torches and runway markers.
 */
import { crateStackParts, sampleMapHeight, type MapProp } from '@frost-and-flamingos/shared';
import { drawCheeseWheel } from './buildings';
import { Affine, GeometryBatch, hash3, mix, shade, type RGB, type V3 } from './geometry';
import { drawBush, drawFlowers } from './nature';
import { P } from './palette';

function r(seed: number, salt: number): number {
  return hash3(seed * 0.913, salt * 3.77, seed + salt * 0.31);
}

export function drawCrate(batch: GeometryBatch, size: number, seed: number, color?: RGB): void {
  const wood = color ?? mix(P.plank, P.plankLight, r(seed, 1));
  batch.box(0, size / 2, 0, size, size, size, wood, 'wood', 0.06);
  const frame = shade(wood, 0.7);
  for (const side of [-1, 1]) {
    // Cross braces on two faces and border slats
    batch.with(Affine.translation(0, size / 2, side * (size / 2 + 0.01)), () => {
      batch.with(Affine.rotationZ(Math.PI / 4), () => batch.box(0, 0, 0, size * 1.25, 0.1, 0.05, frame, 'wood', 0.02));
      batch.box(0, size / 2 - 0.06, 0, size, 0.12, 0.06, frame, 'wood', 0.02);
      batch.box(0, -size / 2 + 0.06, 0, size, 0.12, 0.06, frame, 'wood', 0.02);
    });
    batch.with(Affine.translation(side * (size / 2 + 0.01), size / 2, 0).rotateY(Math.PI / 2), () => {
      batch.with(Affine.rotationZ(-Math.PI / 4), () => batch.box(0, 0, 0, size * 1.25, 0.1, 0.05, frame, 'wood', 0.02));
    });
  }
}

function drawCrateStack(batch: GeometryBatch, prop: MapProp): void {
  const seed = prop.position.x * 3.1 + prop.position.z;
  for (const [index, part] of crateStackParts(prop.variant).entries()) {
    const p = part.position;
    batch.at(p.x, p.y, p.z, part.yaw, () => {
      if (part.kind === 'crate') drawCrate(batch, part.size, seed + index);
      else if (part.kind === 'barrel') drawBarrel(batch, seed + index, P.alpineRed);
      else drawCheeseWheel(batch, part.size, seed + index);
    });
  }
}

export function drawBarrel(batch: GeometryBatch, seed: number, band?: RGB): void {
  const wood = mix(P.log, P.logLight, r(seed, 2));
  batch.lathe(
    [
      [0.42, 0],
      [0.5, 0.32],
      [0.53, 0.65],
      [0.5, 0.98],
      [0.42, 1.3],
    ],
    10,
    (ring, segment) => shade(wood, segment % 2 === 0 ? 1.06 : 0.92),
    'wood',
    { capTop: true },
  );
  for (const y of [0.18, 1.12]) {
    batch.with(Affine.translation(0, y, 0), () => batch.lathe([[0.49, -0.05], [0.5, 0.05]], 10, band ?? P.metalDark, 'metal'));
  }
}

function drawBench(batch: GeometryBatch, variant: number): void {
  const wood = variant % 2 === 0 ? P.plankLight : P.log;
  for (let slat = 0; slat < 3; slat += 1) batch.box(0, 0.48, -0.18 + slat * 0.18, 2.0, 0.07, 0.15, wood, 'wood', 0.02);
  for (let slat = 0; slat < 2; slat += 1) {
    batch.with(Affine.translation(0, 0.78 + slat * 0.2, -0.32).rotateX(-0.2), () => batch.box(0, 0, 0, 2.0, 0.14, 0.06, wood, 'wood', 0.02));
  }
  for (const side of [-1, 1]) {
    batch.box(side * 0.85, 0.24, 0, 0.1, 0.48, 0.5, P.logDark, 'wood', 0.02);
    batch.box(side * 0.85, 0.7, -0.33, 0.09, 0.62, 0.08, P.logDark, 'wood', 0.02);
  }
}

function drawLantern(batch: GeometryBatch, variant: number): void {
  const height = variant === 1 ? 2.6 : 3.4;
  batch.lathe(
    [
      [0.2, 0],
      [0.14, 0.25],
      [0.09, 0.4],
      [0.08, height - 0.4],
    ],
    6,
    P.metalDark,
    'metal',
  );
  batch.with(Affine.translation(0, height - 0.4, 0), () => {
    batch.box(0, 0.3, 0, 0.42, 0.55, 0.42, P.windowGlow, 'plain', 0.03);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) batch.box(sx * 0.21, 0.3, sz * 0.21, 0.05, 0.6, 0.05, P.ink, 'metal', 0);
    batch.lathe(
      [
        [0.36, 0.58],
        [0.1, 0.86],
        [0.02, 0.98],
      ],
      6,
      P.ink,
      'metal',
      { capBottom: true },
    );
  });
}

function drawSignpost(batch: GeometryBatch, variant: number): void {
  batch.log([0, -0.2, 0], [0, 2.8, 0], 0.09, P.logDark, 'wood', { segments: 6 });
  const colors = [P.alpineRed, P.peakBlue, P.coral, P.yellow];
  for (let arrow = 0; arrow < 3; arrow += 1) {
    const yaw = (arrow - 1) * 0.9 + variant * 0.4;
    batch.with(Affine.translation(0, 2.3 - arrow * 0.42, 0).rotateY(yaw), () => {
      batch.extrude(
        [
          [0, -0.15],
          [0.95, -0.15],
          [1.15, 0],
          [0.95, 0.15],
          [0, 0.15],
        ],
        0.06,
        colors[(arrow + variant) % colors.length] ?? P.alpineRed,
        'wood',
      );
      batch.box(0.55, 0, 0.035, 0.7, 0.05, 0.01, P.cream, 'plain', 0);
    });
  }
}

/** Leaning rustic fence following a polyline with terrain-snapped posts. */
function drawFence(batch: GeometryBatch, path: readonly { x: number; y: number; z: number }[], origin: V3, variant: number): void {
  const snowFence = variant === 4;
  const overlook = variant === 5;
  const post = snowFence ? P.alpineRed : P.logDark;
  const rail = snowFence ? P.alpineRed : overlook ? P.plankGrey : P.log;
  for (let index = 0; index + 1 < path.length; index += 1) {
    const a = path[index];
    const b = path[index + 1];
    if (!a || !b) continue;
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    const posts = Math.max(1, Math.round(length / 2.4));
    for (let p = 0; p <= posts; p += 1) {
      if (p === posts && index + 2 < path.length) continue;
      const t = p / posts;
      const x = a.x + (b.x - a.x) * t;
      const z = a.z + (b.z - a.z) * t;
      const y = sampleMapHeight(x, z);
      const lean = (hash3(x, z, variant) - 0.5) * 0.16;
      const top: V3 = [x - origin[0] + lean, y - origin[1] + 1.25, z - origin[2] + lean * 0.6];
      if (overlook) batch.with(Affine.translation(x-origin[0],y-origin[1]+.55,z-origin[2])
        .rotateY(Math.atan2(b.x-a.x,b.z-a.z)),()=>batch.box(0,0,0,.2,1.4,.2,post,'wood',.025));
      else batch.log([x - origin[0], y - origin[1] - 0.3, z - origin[2]], top, 0.1, post, 'wood', { segments: 5, taper: 0.85 });
    }
    for (let p = 0; p < posts; p += 1) {
      const t0 = p / posts;
      const t1 = (p + 1) / posts;
      const x0 = a.x + (b.x - a.x) * t0;
      const z0 = a.z + (b.z - a.z) * t0;
      const x1 = a.x + (b.x - a.x) * t1;
      const z1 = a.z + (b.z - a.z) * t1;
      const y0 = sampleMapHeight(x0, z0);
      const y1 = sampleMapHeight(x1, z1);
      for (const height of snowFence ? [0.45, 0.8, 1.1] : [0.5, 1.0]) {
        const sag = (hash3(x0, height, z1) - 0.5) * 0.12;
        if (overlook) batch.with(Affine.translation((x0+x1)/2-origin[0],(y0+y1)/2-origin[1]+height,(z0+z1)/2-origin[2])
          .rotateY(Math.atan2(x1-x0,z1-z0)).rotateX(-Math.atan2(y1-y0,length/posts)),
          ()=>batch.box(0,0,0,.13,.18,length/posts+.06,rail,'wood',.02));
        else batch.log(
          [x0 - origin[0], y0 - origin[1] + height + sag, z0 - origin[2]],
          [x1 - origin[0], y1 - origin[1] + height - sag, z1 - origin[2]],
          0.06,
          rail,
          'wood',
          { segments: 5 },
        );
      }
    }
  }
}

/** Sagging bunting rope with triangular flags. */
export function drawBunting(batch: GeometryBatch, a: V3, b: V3, seed: number, sag = 0.9): void {
  const samples = 14;
  const points: V3[] = [];
  for (let index = 0; index <= samples; index += 1) {
    const t = index / samples;
    points.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - Math.sin(t * Math.PI) * sag, a[2] + (b[2] - a[2]) * t]);
  }
  batch.tube(points, 0.03, 4, P.rope, 'cloth');
  const length = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const flags = Math.max(3, Math.round(length / 0.75));
  for (let flag = 0; flag < flags; flag += 1) {
    const t = (flag + 0.5) / flags;
    const x = a[0] + (b[0] - a[0]) * t;
    const y = a[1] + (b[1] - a[1]) * t - Math.sin(t * Math.PI) * sag;
    const z = a[2] + (b[2] - a[2]) * t;
    const dx = (b[0] - a[0]) / length;
    const dz = (b[2] - a[2]) / length;
    const half = 0.22;
    const color = P.bunting[(flag + seed) % P.bunting.length] ?? P.coral;
    const tri: V3[] = [
      [x - dx * half, y, z - dz * half],
      [x + dx * half, y, z + dz * half],
      [x, y - 0.42, z],
    ];
    batch.polygon(tri, color, 'cloth');
    batch.polygon(tri, shade(color, 0.85), 'cloth', true);
  }
}

function drawStoneWall(batch: GeometryBatch, prop: MapProp): void {
  const path = prop.path ?? [];
  const origin: V3 = [prop.position.x, prop.position.y, prop.position.z];
  for (let index = 0; index + 1 < path.length; index += 1) {
    const a = path[index];
    const b = path[index + 1];
    if (!a || !b) continue;
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    const stones = Math.max(2, Math.round(length / 0.8));
    for (let course = 0; course < 2; course += 1) {
      for (let stone = 0; stone < stones; stone += 1) {
        const t = (stone + 0.5 + (course % 2) * 0.5) / stones;
        if (t > 1) continue;
        const x = a.x + (b.x - a.x) * t;
        const z = a.z + (b.z - a.z) * t;
        const y = a.y + (b.y - a.y) * t;
        const size = 0.42 + hash3(x, course, z) * 0.18;
        batch.blob(x - origin[0], y - origin[1] + 0.25 + course * 0.48, z - origin[2], size, 0.3, 0.46, mix(P.cobbleDark, P.cobble, hash3(x, z, course)), 'stone', {
          segments: 5,
          rings: 2,
          flat: true,
          wobble: 0.28,
          seed: stone + course * 31,
        });
      }
    }
    // Grass or snow tufts on top of the wall
    const tufts = Math.round(length / 2.5);
    for (let tuft = 0; tuft < tufts; tuft += 1) {
      const t = (tuft + hash3(tuft, a.x, 2)) / tufts;
      batch.blob(a.x + (b.x - a.x) * t - origin[0], a.y + (b.y - a.y) * t - origin[1] + 1.05, a.z + (b.z - a.z) * t - origin[2], 0.4, 0.16, 0.35, P.grassShade, 'grass', {
        segments: 5,
        rings: 3,
      });
    }
  }
}

function drawFlowerCart(batch: GeometryBatch, variant: number): void {
  const awning = [P.alpineRed, P.peakBlue, P.coral][variant % 3] ?? P.alpineRed;
  batch.box(0, 0.75, 0, 3.0, 0.15, 1.6, P.plank, 'wood', 0.04);
  batch.box(0, 0.4, 0, 2.9, 0.65, 1.5, P.log, 'wood', 0.05);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) batch.log([sx * 1.4, 0.8, sz * 0.72], [sx * 1.4, 2.4, sz * 0.72], 0.06, P.logDark, 'wood', { segments: 5 });
  }
  // Striped awning
  for (let stripe = 0; stripe < 6; stripe += 1) {
    batch.with(Affine.translation(-1.5 + (stripe + 0.5) * 0.5, 2.45, 0).rotateX(0.18), () => {
      batch.box(0, 0, 0, 0.5, 0.08, 1.9, stripe % 2 === 0 ? awning : P.white, 'cloth', 0.02);
    });
  }
  if (variant === 1) {
    for (let index = 0; index < 4; index += 1) batch.at(-1.1 + index * 0.72, 0.82, 0, 0, () => drawCheeseWheel(batch, 0.32, index));
  } else {
    batch.with(Affine.translation(0, 0.8, 0), () => drawFlowers(batch, 2.4, variant + 5));
    for (let index = 0; index < 4; index += 1) batch.box(-1.1 + index * 0.72, 0.95, 0.3, 0.4, 0.3, 0.4, P.plankLight, 'wood', 0.03);
  }
  for (const side of [-1, 1]) {
    batch.with(Affine.translation(side * 1.2, 0.42, 0.85), () => {
      batch.lathe([[0.42, -0.05], [0.42, 0.05]], 10, P.logDark, 'wood', { capTop: true, capBottom: true });
    });
  }
}

function drawWell(batch: GeometryBatch): void {
  batch.lathe(
    [
      [1.25, 0],
      [1.3, 0.5],
      [1.25, 1.0],
      [1.0, 1.0],
      [1.0, 0.6],
    ],
    12,
    (ring, segment) => mix(P.cobbleDark, P.cobble, hash3(ring, segment, 3)),
    'stone',
  );
  batch.cylinder(1.0, 1.0, 0.1, 12, P.water, 'water', { y: 0.55 });
  for (const side of [-1, 1]) batch.log([side * 1.1, 0.9, 0], [side * 1.1, 2.6, 0], 0.1, P.logDark, 'wood', { segments: 5 });
  batch.log([-1.3, 2.4, 0], [1.3, 2.4, 0], 0.08, P.log, 'wood', { segments: 5 });
  for (const sign of [1, -1]) {
    batch.with(Affine.translation(0, 2.75, 0).rotateX(sign * 0.6), () => batch.box(0, 0, sign * 0.55, 2.8, 0.1, 1.3, P.shingle, 'shingle', 0.03));
  }
  batch.box(0.3, 1.7, 0, 0.32, 0.36, 0.32, P.log, 'wood', 0.04);
}

function drawFlag(batch: GeometryBatch, variant: number): void {
  const height = variant === 1 ? 12 : variant === 3 ? 4.8 : 10;
  batch.lathe(
    [
      [0.2, 0],
      [0.13, height * 0.6],
      [0.09, height],
    ],
    6,
    variant === 1 ? P.cream : P.logDark,
    'wood',
  );
  batch.blob(0, height + 0.15, 0, 0.22, 0.22, 0.22, P.gold, 'metal', { segments: 6, rings: 4 });
  if (variant === 1) {
    // Maypole: garland ring and spiral ribbons
    batch.with(Affine.translation(0, height - 1, 0), () => batch.lathe([[0.9, -0.12], [0.95, 0], [0.9, 0.12]], 12, P.leaf, 'foliage'));
    for (let ribbon = 0; ribbon < 6; ribbon += 1) {
      const angle = (ribbon / 6) * Math.PI * 2;
      const a: V3 = [Math.sin(angle) * 0.9, height - 1.1, Math.cos(angle) * 0.9];
      const b: V3 = [Math.sin(angle + 0.6) * 3.2, 0.3, Math.cos(angle + 0.6) * 3.2];
      batch.tube([a, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 0.8, (a[2] + b[2]) / 2], b], 0.05, 4, P.ribbon[ribbon] ?? P.alpineRed, 'cloth');
    }
    return;
  }
  if (variant === 3) {
    batch.with(Affine.translation(0, height - 0.5, 0), () => {
      batch.extrude([[0, 0], [1.1, -0.3], [0, -0.6]], 0.04, P.coral, 'cloth');
    });
    return;
  }
  const colors: RGB[] = variant === 2 ? [P.coral, P.yellow] : [P.alpineRed, P.white];
  // Waving flag: a ribbon with two sine waves.
  const left: V3[] = [];
  const right: V3[] = [];
  for (let index = 0; index <= 6; index += 1) {
    const t = index / 6;
    const wave = Math.sin(t * Math.PI * 2) * 0.18 * t;
    left.push([t * 2.6, height - 0.25, wave]);
    right.push([t * 2.6, height - 1.75 + t * 0.1, wave]);
  }
  batch.ribbon(left, right, colors[0] ?? P.alpineRed, 'cloth');
  batch.with(Affine.translation(1.2, height - 1.0, 0.04), () => {
    if (variant === 2) {
      batch.extrude(
        Array.from({ length: 10 }, (_, index): [number, number] => {
          const a = (index / 10) * Math.PI * 2;
          const rr = index % 2 === 0 ? 0.42 : 0.18;
          return [Math.sin(a) * rr, Math.cos(a) * rr];
        }).reverse(),
        0.03,
        colors[1] ?? P.yellow,
        'cloth',
      );
    } else {
      batch.box(0, 0, 0, 0.22, 0.8, 0.03, colors[1] ?? P.white, 'cloth', 0);
      batch.box(0, 0, 0, 0.8, 0.22, 0.03, colors[1] ?? P.white, 'cloth', 0);
    }
  });
}

function drawSilo(batch: GeometryBatch, prop: MapProp): void {
  const seed = prop.position.x + prop.position.z;
  if (prop.kind === 'cheese_silo') {
    // Giant 1000-year cheese wheel on a timber cradle.
    batch.box(0, 0.12, 0, 2.6, 0.24, 1.0, P.logDark, 'wood', 0.04);
    batch.with(Affine.translation(0, 0, 0), () => drawCheeseWheel(batch, 1.35, seed));
    batch.box(0, 1.0, 1.3, 0.8, 0.5, 0.06, P.alpineRed, 'plain', 0.02);
    return;
  }
  // Coconut pressure silo: bamboo-banded tank with a giant coconut dome.
  batch.lathe(
    [
      [0.85, 0],
      [0.92, 0.3],
      [0.92, 2.2],
      [0.85, 2.5],
    ],
    12,
    (ring, segment) => (segment % 3 === 0 ? P.bambooDark : P.bamboo),
    'wood',
  );
  for (const y of [0.5, 1.4, 2.2]) batch.with(Affine.translation(0, y, 0), () => batch.lathe([[0.97, -0.08], [0.97, 0.08]], 12, P.ropeDark, 'cloth'));
  batch.blob(0, 2.6, 0, 1.0, 0.85, 1.0, (ny) => (ny > 0.75 ? P.palmTrunkDark : P.coconut), 'wood', { segments: 10, rings: 6, wobble: 0.08, seed });
  for (let eye = 0; eye < 3; eye += 1) {
    const a = (eye / 3) * Math.PI * 2;
    batch.blob(Math.sin(a) * 0.3, 3.35, Math.cos(a) * 0.3, 0.1, 0.06, 0.1, P.ink, 'plain', { segments: 5, rings: 3 });
  }
  batch.box(0, 1.6, 0.93, 0.5, 0.5, 0.06, P.yellow, 'plain', 0.02);
  batch.box(0, 1.6, 0.97, 0.12, 0.34, 0.02, P.ink, 'plain', 0);
}

export function drawFlamingoStatue(batch: GeometryBatch, scale: number): void {
  batch.box(0, 0.25 * scale, 0, 1.2 * scale, 0.5 * scale, 1.2 * scale, P.trim, 'stone', 0.08);
  for (const side of [-1, 1]) {
    batch.log([side * 0.18 * scale, 0.5 * scale, 0], [side * 0.12 * scale, 1.6 * scale, 0.05 * scale], 0.06 * scale, P.coral, 'plain', { segments: 5 });
  }
  batch.blob(0, 1.95 * scale, 0, 0.55 * scale, 0.42 * scale, 0.78 * scale, (ny) => (ny > 0.2 ? P.flamingoLight : P.flamingo), 'plain', { segments: 10, rings: 6 });
  batch.blob(0, 2.0 * scale, -0.55 * scale, 0.2 * scale, 0.32 * scale, 0.35 * scale, P.flamingo, 'plain', { segments: 6, rings: 4 });
  const neck: V3[] = [
    [0, 2.15 * scale, 0.45 * scale],
    [0, 2.7 * scale, 0.75 * scale],
    [0, 3.25 * scale, 0.55 * scale],
    [0, 3.5 * scale, 0.7 * scale],
  ];
  batch.tube(neck, 0.11 * scale, 6, P.flamingo, 'plain');
  batch.blob(0, 3.55 * scale, 0.78 * scale, 0.22 * scale, 0.2 * scale, 0.26 * scale, P.flamingo, 'plain', { segments: 7, rings: 4 });
  batch.with(Affine.translation(0, 3.5 * scale, 1.0 * scale).rotateX(0.9), () => {
    batch.lathe([[0.09 * scale, 0], [0.06 * scale, 0.22 * scale], [0.02 * scale, 0.4 * scale]], 5, P.ink, 'plain');
  });
  for (const side of [-1, 1]) {
    batch.blob(side * 0.15 * scale, 3.62 * scale, 0.88 * scale, 0.05 * scale, 0.05 * scale, 0.05 * scale, P.white, 'plain', { segments: 5, rings: 3 });
  }
}

function drawTent(batch: GeometryBatch, variant: number): void {
  if (variant >= 3) {
    // Round tiki hut with a shaggy thatch cone.
    batch.lathe([[1.8, 0], [1.8, 2.0]], 10, (ring, segment) => (segment % 2 === 0 ? P.bamboo : P.bambooDark), 'wood');
    batch.lathe(
      [
        [2.6, 1.8],
        [1.6, 2.8],
        [0.3, 4.0],
        [0.05, 4.3],
      ],
      12,
      (ring, segment) => mix(P.thatchDark, P.thatch, (segment % 3) / 3),
      'thatch',
      { wobble: 0.12, seed: variant, capBottom: true },
    );
    batch.box(0, 1.0, 1.75, 1.0, 1.8, 0.1, P.ink, 'plain', 0);
    return;
  }
  const canvas = [P.cream, P.peakBlue, P.shutterGreen][variant % 3] ?? P.cream;
  for (const sign of [1, -1]) {
    batch.with(Affine.translation(0, 2.4, 0).rotateZ(sign * 0.85), () => batch.box(sign * 1.6, 0, 0, 3.2, 0.06, 5.0, canvas, 'cloth', 0.02));
  }
  batch.log([0, 0, -2.4], [0, 2.5, -2.4], 0.07, P.logDark, 'wood', { segments: 5 });
  batch.log([0, 0, 2.4], [0, 2.5, 2.4], 0.07, P.logDark, 'wood', { segments: 5 });
  batch.box(0, 2.0, 0, 0.12, 0.12, 5.0, P.log, 'wood', 0);
  batch.blob(0, 2.55, 0, 0.6, 0.15, 2.4, P.snow, 'snow', { segments: 6, rings: 3 });
}

function drawTikiTorch(batch: GeometryBatch): void {
  batch.lathe([[0.08, 0], [0.07, 2.0]], 5, P.bambooDark, 'wood');
  batch.lathe([[0.12, 1.95], [0.2, 2.25], [0.16, 2.4]], 6, P.thatchDark, 'thatch', { capTop: true });
  batch.blob(0, 2.6, 0, 0.16, 0.3, 0.16, P.yellow, 'plain', { segments: 6, rings: 4 });
  batch.blob(0, 2.55, 0, 0.12, 0.2, 0.12, P.coral, 'plain', { segments: 5, rings: 3 });
}

function drawSnowman(batch: GeometryBatch, variant: number): void {
  batch.blob(0, 0.7, 0, 0.85, 0.75, 0.85, P.snow, 'snow', { segments: 10, rings: 6 });
  batch.blob(0, 1.75, 0, 0.6, 0.55, 0.6, P.snow, 'snow', { segments: 9, rings: 5 });
  batch.blob(0, 2.5, 0, 0.42, 0.4, 0.42, P.snow, 'snow', { segments: 8, rings: 5 });
  batch.with(Affine.translation(0, 2.5, 0.38).rotateX(Math.PI / 2), () => batch.lathe([[0.07, 0], [0.01, 0.38]], 5, P.coral, 'plain'));
  for (const side of [-1, 1]) batch.blob(side * 0.15, 2.62, 0.36, 0.05, 0.05, 0.03, P.ink, 'plain', { segments: 4, rings: 3 });
  batch.lathe([[0.36, 2.84], [0.3, 3.2], [0.32, 3.22]], 8, variant % 2 === 0 ? P.ink : P.alpineRed, 'cloth', { capTop: true });
  batch.with(Affine.translation(0, 2.12, 0), () => batch.lathe([[0.48, 0], [0.5, 0.12]], 8, P.alpineRed, 'cloth'));
  for (const side of [-1, 1]) batch.log([side * 0.5, 1.8, 0], [side * 1.2, 2.3, 0.1], 0.04, P.logDark, 'wood', { segments: 4 });
}

function drawSkiRack(batch: GeometryBatch, variant: number): void {
  batch.box(0, 1.2, 0, 2.4, 0.1, 0.2, P.log, 'wood', 0.02);
  for (const side of [-1, 1]) batch.box(side * 1.1, 0.6, 0, 0.12, 1.2, 0.3, P.logDark, 'wood', 0.02);
  const colors = [P.alpineRed, P.peakBlue, P.yellow, P.shutterGreen];
  for (let ski = 0; ski < 5; ski += 1) {
    batch.with(Affine.translation(-0.9 + ski * 0.45, 0.95, 0.15).rotateX(-0.18), () => batch.box(0, 0, 0, 0.1, 1.9, 0.04, colors[(ski + variant) % colors.length] ?? P.alpineRed, 'wood', 0.02));
  }
}

function drawWoodpile(batch: GeometryBatch, seed: number): void {
  for (let row = 0; row < 3; row += 1) {
    for (let index = 0; index < 5 - row; index += 1) {
      const x = -1.0 + index * 0.46 + row * 0.23;
      const y = 0.22 + row * 0.38;
      batch.log([x, y, -0.6], [x, y, 0.6 + hash3(seed, index, row) * 0.15], 0.2, mix(P.log, P.logLight, hash3(index, row, seed)), 'wood', { segments: 6 });
    }
  }
  batch.blob(0, 1.3, 0, 1.2, 0.2, 0.75, P.snow, 'snow', { segments: 7, rings: 3 });
}

function drawSled(batch: GeometryBatch): void {
  for (const side of [-1, 1]) batch.tube([[side * 0.35, 0.05, -0.8], [side * 0.35, 0.05, 0.6], [side * 0.35, 0.3, 0.85]], 0.04, 4, P.metalDark, 'metal');
  for (let slat = 0; slat < 4; slat += 1) batch.box(0, 0.35, -0.6 + slat * 0.35, 0.85, 0.06, 0.25, P.alpineRed, 'wood', 0.02);
}

function drawHayBale(batch: GeometryBatch): void {
  batch.with(Affine.rotationZ(Math.PI / 2).translate(-0.6, 0, 0), () => {
    batch.lathe([[0.8, -0.6], [0.82, 0], [0.8, 0.6]], 12, (ring, segment) => (segment % 2 ? P.thatch : P.thatchDark), 'thatch', { capTop: true, capBottom: true });
  });
}

function drawCampfire(batch: GeometryBatch): void {
  for (let stone = 0; stone < 8; stone += 1) {
    const a = (stone / 8) * Math.PI * 2;
    batch.blob(Math.sin(a) * 0.8, 0.12, Math.cos(a) * 0.8, 0.22, 0.16, 0.22, P.rock, 'rock', { segments: 5, rings: 3, flat: true });
  }
  for (let log = 0; log < 3; log += 1) {
    const a = (log / 3) * Math.PI * 2;
    batch.log([Math.sin(a) * 0.6, 0.1, Math.cos(a) * 0.6], [0, 0.55, 0], 0.09, P.logDark, 'wood', { segments: 5 });
  }
  batch.blob(0, 0.55, 0, 0.3, 0.5, 0.3, P.yellow, 'plain', { segments: 6, rings: 4 });
  batch.blob(0, 0.5, 0, 0.22, 0.34, 0.22, P.coral, 'plain', { segments: 5, rings: 3 });
}

function drawSurfRack(batch: GeometryBatch): void {
  batch.box(0, 1.0, 0, 3.0, 0.12, 0.2, P.bamboo, 'wood', 0.03);
  const colors = [P.coral, P.teal, P.yellow, P.flamingo];
  for (let board = 0; board < 4; board += 1) {
    batch.with(Affine.translation(-1.1 + board * 0.72, 1.1, 0.12).rotateX(-0.25), () => {
      batch.blob(0, 0, 0, 0.26, 1.1, 0.06, colors[board] ?? P.coral, 'plain', { segments: 8, rings: 5 });
    });
  }
}

function drawBuoy(batch: GeometryBatch, variant: number): void {
  batch.lathe([[0.45, -0.3], [0.5, 0.1], [0.35, 0.5], [0.05, 0.8]], 8, (ring) => (ring % 2 === 0 ? (variant === 0 ? P.alpineRed : P.yellow) : P.white), 'plain', { capBottom: true });
}

/** Orange pennant flag on a white pole in a little snow mound (glacier runway edge). */
function drawRunwayMarker(batch: GeometryBatch, variant: number): void {
  batch.blob(0, 0, 0, 0.42, 0.2, 0.42, P.snow, 'snow', { segments: 6, rings: 3, flatBottom: true });
  batch.log([0, -0.2, 0], [0, 2.3, 0], 0.045, P.white, 'wood', { segments: 4 });
  batch.blob(0, 2.32, 0, 0.07, 0.07, 0.07, P.orange, 'plain', { segments: 4, rings: 2 });
  const rows: V3[][] = [];
  for (let index = 0; index <= 4; index += 1) {
    const t = index / 4;
    const wave = Math.sin(t * 3.2 + variant * 1.3) * 0.09;
    rows.push([
      [0.05 + t * 0.95, 2.25 - t * 0.27, wave],
      [0.05 + t * 0.95, 1.7 + t * 0.27, wave],
    ]);
  }
  batch.sheet(rows, (t) => (t > 0.7 ? P.white : P.orange), 'cloth');
}

/** Painted steel fuel drum (blue or red) with rolling hoops and a stencil plate. */
function drawFuelDrum(batch: GeometryBatch, color: RGB): void {
  batch.lathe(
    [
      [0.4, 0],
      [0.43, 0.05],
      [0.43, 1.2],
      [0.4, 1.25],
    ],
    10,
    color,
    'metal',
    { capTop: true },
  );
  for (const y of [0.42, 0.84]) batch.with(Affine.translation(0, y, 0), () => batch.lathe([[0.45, -0.035], [0.45, 0.035]], 10, shade(color, 0.72), 'metal'));
  batch.box(0, 0.63, 0.42, 0.34, 0.2, 0.03, P.white, 'plain', 0);
  batch.with(Affine.translation(0.2, 1.25, 0.1), () => batch.lathe([[0.06, 0], [0.06, 0.07]], 6, P.metalDark, 'metal', { capTop: true }));
}

function drawMooring(batch: GeometryBatch): void {
  batch.lathe([[0.2, -0.1], [0.18, 0.5], [0.25, 0.6], [0.2, 0.7]], 8, P.metalDark, 'metal', { capTop: true });
  batch.tube([[0, 0.45, 0], [0.4, 0.2, 0.3], [0.9, -1.4, 0.5]], 0.04, 4, P.rope, 'cloth');
}

function drawIceRink(batch: GeometryBatch, radius: number, frozenPond: boolean): void {
  batch.blob(0, 0.03, 0, radius, 0.06, radius * (frozenPond ? 0.85 : 1), (ny) => (ny > 0.5 ? P.ice : P.iceDeep), 'ice', { segments: 18, rings: 3, flatBottom: true });
  const edge = Math.round(radius * 1.8);
  for (let index = 0; index < edge; index += 1) {
    const a = (index / edge) * Math.PI * 2;
    const rr = radius * (1.02 + hash3(index, radius, 1) * 0.08);
    batch.blob(Math.sin(a) * rr, 0.08, Math.cos(a) * rr * (frozenPond ? 0.85 : 1), 0.7, 0.28, 0.5, P.snow, 'snow', { segments: 5, rings: 3 });
  }
  if (frozenPond) {
    for (let index = 0; index < 5; index += 1) {
      const a = hash3(index, 4, 2) * Math.PI * 2;
      batch.with(Affine.translation(Math.sin(a) * radius * 0.95, 0, Math.cos(a) * radius * 0.8), () => drawBush(batch, 0.6, index, false));
    }
  }
}

/** Spawn plate look: a team's own (alpine stone / lagoon teak) or a neutral tower's plain stone. */
export type SpawnPadStyle = 'alpine' | 'lagoon' | 'neutral';

/**
 * Painted spawn plate, flush with the ground: the Peak Guard's grey-blue
 * stone slab with a painted ring and an edelweiss, the Lagoon League's teak
 * deck with a coral rim and a little sun, or a plain stone for a neutral
 * tower. Muted colours on purpose; the brief spawn-protection glow is drawn
 * on top at runtime.
 */
export function drawSpawnPad(batch: GeometryBatch, style: SpawnPadStyle): void {
  if (style === 'lagoon') {
    batch.lathe([[1.3, 0], [1.34, 0.05], [1.28, 0.1]], 18, P.plank, 'wood', { capTop: true, wobble: 0.025, seed: 5 });
    for (let index = -2; index <= 2; index += 1) {
      const x = index * 0.46;
      const half = Math.sqrt(Math.max(0, 1.24 * 1.24 - x * x));
      batch.box(x, 0.103, 0, 0.035, 0.008, half * 2, P.logDark, 'wood', 0);
    }
    batch.lathe([[1.08, 0.104], [1.12, 0.112], [1.18, 0.104]], 24, shade(P.coral, 0.86), 'cloth');
    batch.cylinder(0.22, 0.22, 0.012, 12, P.yellow, 'cloth', { y: 0.104 });
    for (let ray = 0; ray < 8; ray += 1) {
      const angle = (ray / 8) * Math.PI * 2;
      batch.with(Affine.translation(Math.sin(angle) * 0.36, 0.11, Math.cos(angle) * 0.36).rotateY(angle), () => {
        batch.box(0, 0, 0, 0.05, 0.008, 0.12, shade(P.orange, 0.95), 'cloth', 0);
      });
    }
    return;
  }
  const stone = style === 'alpine' ? mix(P.cobble, P.snowShade, 0.3) : P.cobbleWarm;
  batch.lathe([[1.32, 0], [1.36, 0.05], [1.28, 0.1]], 18, stone, 'stone', { capTop: true, wobble: 0.05, seed: 11 });
  if (style === 'neutral') {
    batch.lathe([[1.06, 0.102], [1.1, 0.108], [1.15, 0.102]], 24, shade(P.cream, 0.92), 'stone');
    return;
  }
  batch.lathe([[1.06, 0.102], [1.1, 0.11], [1.16, 0.102]], 24, shade(P.peakBlue, 0.82), 'cloth');
  for (let petal = 0; petal < 6; petal += 1) {
    const angle = (petal / 6) * Math.PI * 2;
    batch.with(Affine.translation(Math.sin(angle) * 0.2, 0.108, Math.cos(angle) * 0.2).rotateY(angle), () => {
      batch.blob(0, 0, 0, 0.07, 0.012, 0.14, P.flowerWhite, 'cloth', { segments: 6, rings: 2 });
    });
  }
  batch.cylinder(0.08, 0.08, 0.014, 10, P.flowerYellow, 'cloth', { y: 0.108 });
}

/** Dispatches small dressing props; returns false when the kind is drawn elsewhere. */
export function drawSmallProp(batch: GeometryBatch, prop: MapProp): boolean {
  const seed = prop.position.x * 1.7 + prop.position.z * 0.9;
  switch (prop.kind) {
    case 'crate_stack':
      drawCrateStack(batch, prop);
      return true;
    case 'barrel':
      if (prop.id.startsWith('alpine_fuel_')) drawFuelDrum(batch, prop.variant % 2 === 0 ? P.alpineRed : P.peakBlue);
      else drawBarrel(batch, seed, prop.variant >= 3 ? P.alpineRed : undefined);
      return true;
    case 'bench':
      drawBench(batch, prop.variant);
      return true;
    case 'lantern':
      drawLantern(batch, prop.variant);
      return true;
    case 'signpost':
      drawSignpost(batch, prop.variant);
      return true;
    case 'flower_cart':
      drawFlowerCart(batch, prop.variant);
      return true;
    case 'well':
      drawWell(batch);
      return true;
    case 'flag':
      drawFlag(batch, prop.variant);
      return true;
    case 'cheese_silo':
    case 'coconut_silo':
      drawSilo(batch, prop);
      return true;
    case 'flamingo_statue':
      drawFlamingoStatue(batch, prop.scale);
      return true;
    case 'tent':
      drawTent(batch, prop.variant);
      return true;
    case 'tiki_torch':
      drawTikiTorch(batch);
      return true;
    case 'snowman':
      drawSnowman(batch, prop.variant);
      return true;
    case 'ski_rack':
      drawSkiRack(batch, prop.variant);
      return true;
    case 'woodpile':
      drawWoodpile(batch, seed);
      return true;
    case 'sled':
      drawSled(batch);
      return true;
    case 'hay_bale':
      drawHayBale(batch);
      return true;
    case 'campfire':
      drawCampfire(batch);
      return true;
    case 'surfboard_rack':
      drawSurfRack(batch);
      return true;
    case 'buoy':
      drawBuoy(batch, prop.variant);
      return true;
    case 'runway_marker':
      drawRunwayMarker(batch, prop.variant);
      return true;
    case 'rowboat_mooring':
      drawMooring(batch);
      return true;
    case 'ice_rink':
      drawIceRink(batch, prop.scale, prop.variant === 0);
      return true;
    case 'flowers':
      for (let index = 0; index < 5; index += 1) {
        batch.with(Affine.translation(-3 + index * 1.5, 0, 0), () => {
          drawBush(batch, 0.55, seed + index, true);
          drawFlowers(batch, 1.4, seed + index * 3);
        });
      }
      return true;
    case 'stone_wall':
      drawStoneWall(batch, prop);
      return true;
    case 'fence':
      drawFence(batch, prop.path ?? [], [prop.position.x, prop.position.y, prop.position.z], prop.variant);
      return true;
    case 'bunting': {
      const path = prop.path ?? [];
      const a = path[0];
      const b = path[1];
      if (a && b) {
        drawBunting(
          batch,
          [0, 0, 0],
          [b.x - a.x, b.y - a.y, b.z - a.z],
          prop.variant,
          0.9,
        );
      }
      return true;
    }
    default:
      return false;
  }
}
