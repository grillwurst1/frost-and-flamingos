/**
 * Signature dressing from the owner's building, station and base sheets:
 * the details that make each chalet, hut and station recognisable at a
 * glance (chamois head, café awning, tiki masks, coconut lamps, nets,
 * bullwheels, lattice pylons, hangar door, runway pennants). Signs stay blank
 * — names are rendered in-engine from i18n later.
 */
import { CHALET_TERRACES, type BuildingLayout, type MapProp } from '@frost-and-flamingos/shared';
import { Affine, GeometryBatch, hash3, mix, shade, type RGB, type V3 } from './geometry';
import { P } from './palette';

/** Blank hanging sign on a wrought-iron bracket sticking out from a wall corner. */
function hangingSign(batch: GeometryBatch, x: number, y: number, z: number, outward: number, board: RGB): void {
  batch.with(Affine.translation(x, y, z).rotateY(outward), () => {
    batch.box(0, 0, 0.7, 0.08, 0.08, 1.5, P.ink, 'metal', 0);
    batch.log([0, 0.04, 0.05], [0, -0.55, 0.9], 0.03, P.ink, 'metal', { segments: 4 });
    batch.blob(0, 0.06, 1.42, 0.08, 0.08, 0.08, P.ink, 'metal', { segments: 4, rings: 2 });
    for (const z0 of [0.3, 1.1]) batch.box(0, -0.2, z0, 0.03, 0.4, 0.03, P.ink, 'metal', 0);
    batch.box(0, -0.75, 0.7, 0.12, 0.75, 1.1, board, 'wood', 0.03);
    batch.box(0, -0.75, 0.7, 0.14, 0.62, 0.95, shade(board, 1.2), 'wood', 0);
  });
}

function chamoisHead(batch: GeometryBatch, x: number, y: number, z: number): void {
  batch.with(Affine.translation(x, y, z), () => {
    batch.extrude(
      [
        [-0.55, -0.7],
        [0.55, -0.7],
        [0.7, 0],
        [0.4, 0.55],
        [-0.4, 0.55],
        [-0.7, 0],
      ],
      0.1,
      P.logLight,
      'wood',
    );
    batch.blob(0, 0, 0.25, 0.32, 0.4, 0.3, P.logDark, 'plain', { segments: 7, rings: 4 });
    batch.blob(0, -0.3, 0.45, 0.17, 0.16, 0.2, shade(P.logDark, 0.8), 'plain', { segments: 6, rings: 3 });
    for (const side of [-1, 1]) {
      batch.tube(
        [
          [side * 0.12, 0.3, 0.25],
          [side * 0.16, 0.65, 0.3],
          [side * 0.1, 0.9, 0.12],
          [side * 0.02, 0.95, -0.05],
        ],
        0.045,
        4,
        P.ink,
        'plain',
      );
      batch.blob(side * 0.3, 0.28, 0.2, 0.1, 0.06, 0.05, P.logDark, 'plain', { segments: 4, rings: 2 });
      batch.blob(side * 0.12, 0.08, 0.5, 0.04, 0.04, 0.03, P.ink, 'plain', { segments: 4, rings: 2 });
    }
  });
}

function tikiMask(batch: GeometryBatch, x: number, y: number, z: number, yaw: number, seed: number): void {
  const color = [P.logLight, P.coral, P.teal][seed % 3] ?? P.logLight;
  batch.with(Affine.translation(x, y, z).rotateY(yaw), () => {
    batch.box(0, 0, 0, 0.6, 1.0, 0.2, color, 'wood', 0.05);
    for (const side of [-1, 1]) {
      batch.box(side * 0.15, 0.2, 0.11, 0.18, 0.12, 0.04, P.white, 'plain', 0);
      batch.box(side * 0.15, 0.2, 0.13, 0.07, 0.07, 0.03, P.ink, 'plain', 0);
    }
    batch.box(0, -0.22, 0.11, 0.36, 0.12, 0.04, P.ink, 'plain', 0);
    batch.box(0, 0.45, 0.02, 0.7, 0.14, 0.24, P.yellow, 'wood', 0);
    batch.box(0, -0.02, 0.13, 0.1, 0.2, 0.06, shade(color, 0.8), 'wood', 0);
  });
}

function railing(batch: GeometryBatch, a: V3, b: V3, height: number, color: RGB, bamboo: boolean): void {
  const length = Math.hypot(b[0] - a[0], b[2] - a[2]);
  const posts = Math.max(2, Math.round(length / (bamboo ? 0.32 : 0.28)));
  for (let index = 0; index <= posts; index += 1) {
    const t = index / posts;
    const x = a[0] + (b[0] - a[0]) * t;
    const z = a[2] + (b[2] - a[2]) * t;
    if (bamboo) batch.log([x, a[1], z], [x, a[1] + height, z], 0.05, index % 2 === 0 ? P.bamboo : P.bambooDark, 'wood', { segments: 5 });
    else batch.box(x, a[1] + height / 2, z, 0.13, height, 0.13, index % 2 === 0 ? color : shade(color, 1.12), 'wood', 0);
  }
  batch.log([a[0], a[1] + height, a[2]], [b[0], b[1] + height, b[2]], 0.06, bamboo ? P.bambooDark : shade(color, 0.85), 'wood', { segments: 5 });
  batch.log([a[0], a[1] + height * 0.45, a[2]], [b[0], b[1] + height * 0.45, b[2]], 0.045, bamboo ? P.bamboo : shade(color, 0.85), 'wood', { segments: 4 });
}

function terrace(batch: GeometryBatch, layout: BuildingLayout, depth: number, doorOffset: number, bamboo: boolean): void {
  const halfW = layout.width / 2;
  const z0 = layout.depth / 2;
  const z1 = z0 + depth;
  const y = layout.plinth;
  const boards = Math.round(layout.width / 0.42);
  for (let index = 0; index < boards; index += 1) {
    const x = -halfW + (index + 0.5) * (layout.width / boards);
    batch.box(x, y - 0.09, (z0 + z1) / 2, layout.width / boards - 0.04, 0.18, depth, bamboo ? mix(P.bamboo, P.thatch, hash3(index, 1, 2)) : mix(P.plank, P.plankLight, hash3(index, 3, 4)), 'wood', 0);
  }
  batch.box(0, y / 2 - 0.1, z1 - 0.1, layout.width, y, 0.2, P.logDark, 'wood', 0);
  const gapFrom = doorOffset - 1.1;
  const gapTo = doorOffset + 1.1;
  railing(batch, [-halfW, y, z1 - 0.06], [gapFrom, y, z1 - 0.06], 1.0, P.log, bamboo);
  railing(batch, [gapTo, y, z1 - 0.06], [halfW, y, z1 - 0.06], 1.0, P.log, bamboo);
  railing(batch, [-halfW + 0.06, y, z0], [-halfW + 0.06, y, z1], 1.0, P.log, bamboo);
  railing(batch, [halfW - 0.06, y, z0], [halfW - 0.06, y, z1], 1.0, P.log, bamboo);
  batch.box(doorOffset, y / 4, z1 + 0.4, 2.2, y / 2, 0.8, bamboo ? P.bamboo : P.cobble, bamboo ? 'wood' : 'stone', 0.05);
}

function cafeSet(batch: GeometryBatch, x: number, y: number, z: number, seed: number): void {
  batch.with(Affine.translation(x, y, z), () => {
    batch.lathe([[0.08, 0], [0.06, 0.72], [0.45, 0.74], [0.45, 0.8]], 10, P.white, 'metal', { capTop: true });
    batch.blob(0, 0.86, 0, 0.12, 0.08, 0.12, hash3(seed, 1, 1) > 0.5 ? P.flowerRed : P.flowerYellow, 'foliage', { segments: 4, rings: 2 });
    for (const side of [-1, 1]) {
      batch.with(Affine.translation(side * 0.8, 0, 0).rotateY(side * Math.PI / 2), () => {
        batch.box(0, 0.45, 0, 0.42, 0.06, 0.42, P.alpineRed, 'wood', 0);
        batch.box(0, 0.72, -0.19, 0.42, 0.5, 0.05, P.alpineRed, 'wood', 0);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) batch.box(sx * 0.17, 0.22, sz * 0.17, 0.04, 0.45, 0.04, P.ink, 'metal', 0);
      });
    }
  });
}

function stripedAwning(batch: GeometryBatch, width: number, y: number, z: number, reach: number): void {
  const stripes = Math.round(width / 0.55);
  for (let index = 0; index < stripes; index += 1) {
    const x = -width / 2 + (index + 0.5) * (width / stripes);
    batch.with(Affine.translation(x, y, z).rotateX(0.28), () => {
      batch.box(0, 0, reach / 2, width / stripes, 0.06, reach, index % 2 === 0 ? P.cream : P.logLight, 'cloth', 0);
      // Scalloped valance
      batch.box(0, -0.18, reach, width / stripes, 0.36, 0.04, index % 2 === 0 ? P.cream : P.logLight, 'cloth', 0);
    });
  }
  for (const side of [-1, 1]) batch.log([side * (width / 2), y, z], [side * (width / 2), y - 0.6, z + reach * 0.9], 0.03, P.ink, 'metal', { segments: 4 });
}

/** Building-specific decorations keyed by the blueprint prop id / style. */
export function drawBuildingExtras(batch: GeometryBatch, prop: MapProp): void {
  const layout = prop.building;
  if (!layout) return;
  const halfW = layout.width / 2;
  const halfD = layout.depth / 2;
  const upper = layout.floors[1];
  const top = upper ? upper.elevation + upper.height : (layout.floors[0]?.elevation ?? 0) + (layout.floors[0]?.height ?? 3);
  const seed = Math.floor(prop.position.x * 3 + prop.position.z);
  const doorOffset = layout.floors[0]?.openings.find((opening) => opening.wall === 'front' && opening.kind === 'door')?.offset ?? 0;
  switch (prop.id) {
    case 'chalet_west':
      chamoisHead(batch, 0, top + 1.6, halfD + 0.3);
      hangingSign(batch, -halfW, 3.0, halfD - 0.3, -Math.PI / 2, P.log);
      batch.box(doorOffset, layout.plinth / 4, halfD + 0.7, 2.4, layout.plinth / 2, 0.9, P.cobble, 'stone', 0.06);
      return;
    case 'chalet_east': {
      const depth = CHALET_TERRACES[prop.id] ?? 3.4;
      terrace(batch, layout, depth, doorOffset, false);
      stripedAwning(batch, layout.width - 0.6, 3.35, halfD + 0.1, depth - 0.2);
      cafeSet(batch, -halfW + 2.4, layout.plinth, halfD + depth / 2, seed);
      cafeSet(batch, halfW - 2.4, layout.plinth, halfD + depth / 2, seed + 1);
      hangingSign(batch, halfW, 3.0, halfD - 0.3, Math.PI / 2, P.plankLight);
      return;
    }
    case 'chalet_south': {
      const depth = CHALET_TERRACES[prop.id] ?? 3;
      terrace(batch, layout, depth, doorOffset, true);
      tikiMask(batch, -halfW - 0.25, 2.3, halfD, -Math.PI / 2, 0);
      tikiMask(batch, halfW + 0.25, 2.3, halfD, Math.PI / 2, 1);
      tikiMask(batch, 0, top + 2.0, halfD + 0.32, 0, 2);
      tikiMask(batch, -halfW + 1.2, 1.4, halfD + depth + 0.15, 0, 1);
      hangingSign(batch, halfW, 2.9, halfD - 0.3, Math.PI / 2, P.bamboo);
      return;
    }
    case 'chalet_north':
      hangingSign(batch, halfW, 3.0, halfD - 0.3, Math.PI / 2, P.log);
      batch.box(doorOffset, layout.plinth / 4, halfD + 0.7, 2.4, layout.plinth / 2, 0.9, P.cobble, 'stone', 0.06);
      return;
    default:
      break;
  }
  switch (prop.kind) {
    case 'beach_bar': {
      // Bamboo tie beam across the front gable with hanging coconut lamps
      // (the crossed ridge poles come with the thatch gable roof).
      const run = halfW + layout.roof.overhang;
      batch.log([-run, top - 0.05, halfD + 0.9], [run, top - 0.05, halfD + 0.9], 0.1, P.bamboo, 'wood', { segments: 5 });
      for (let index = 0; index < 5; index += 1) {
        const x = -halfW + 0.9 + index * ((layout.width - 1.8) / 4);
        batch.box(x, top - 0.15, halfD + 0.9, 0.02, 0.5, 0.02, P.ropeDark, 'cloth', 0);
        batch.blob(x, top - 0.55, halfD + 0.9, 0.22, 0.24, 0.22, (ny) => (ny < -0.3 ? P.windowGlow : P.coconut), 'wood', { segments: 6, rings: 4 });
      }
      for (let stool = 0; stool < 2; stool += 1) {
        batch.with(Affine.translation(-1 + stool * 2.2, 0, halfD + 1.4), () => {
          batch.lathe([[0.06, 0], [0.05, 0.75]], 5, P.bamboo, 'wood');
          batch.lathe([[0.3, 0.75], [0.28, 0.85]], 8, P.coral, 'cloth', { capTop: true });
        });
      }
      return;
    }
    case 'fisher_hut': {
      // Porthole, fishing net with glass floats and a coil of rope.
      batch.with(Affine.translation(-halfW + 1.2, 1.7, halfD + 0.05).rotateX(Math.PI / 2), () => {
        batch.lathe([[0.42, -0.06], [0.48, 0], [0.42, 0.06]], 12, P.gold, 'metal');
        batch.lathe([[0.34, 0], [0.34, 0.02]], 12, P.glassDark, 'plain', { capTop: true });
      });
      const net: V3[][] = [];
      for (let row = 0; row <= 3; row += 1) {
        const cols: V3[] = [];
        for (let col = 0; col <= 4; col += 1) {
          const x = halfW * 0.1 + col * 0.55;
          cols.push([x, 2.3 - row * 0.55 - Math.sin((col / 4) * Math.PI) * 0.25, halfD + 0.1 + Math.sin(col + row) * 0.05]);
        }
        net.push(cols);
      }
      batch.sheet(net, () => mix(P.shutterGreen, P.ink, 0.35), 'cloth');
      const floats = [P.peakBlue, P.coral, P.shutterGreen, P.yellow];
      floats.forEach((color, index) => {
        batch.blob(halfW * 0.1 + 0.3 + index * 0.6, 1.0 + (index % 2) * 0.4, halfD + 0.25, 0.2, 0.2, 0.2, color, 'plain', { segments: 6, rings: 4 });
      });
      batch.with(Affine.translation(halfW - 0.8, 0.12, halfD + 0.6), () => {
        for (let ring = 0; ring < 3; ring += 1) batch.lathe([[0.42 - ring * 0.08, ring * 0.08], [0.45 - ring * 0.08, ring * 0.08 + 0.08]], 10, P.rope, 'cloth');
      });
      return;
    }
    case 'side_hut': {
      // Stacked firewood against the side wall.
      for (let row = 0; row < 4; row += 1) {
        for (let index = 0; index < 4 - (row % 2); index += 1) {
          const z = -halfD + 0.8 + index * 0.5 + (row % 2) * 0.25;
          batch.log([halfW + 0.15, 0.2 + row * 0.36, z], [halfW + 1.3, 0.2 + row * 0.36, z], 0.18, mix(P.log, P.logLight, hash3(row, index, 5)), 'wood', { segments: 6 });
        }
      }
      batch.blob(halfW + 0.75, 1.65, -halfD + 1.6, 0.8, 0.2, 1.2, P.snow, 'snow', { segments: 6, rings: 3 });
      return;
    }
    case 'hangar': {
      // Sliding door panel pushed aside, blue/white banner, fuel drums.
      const door = layout.floors[0]?.openings.find((opening) => opening.kind === 'door' && opening.wall === 'front');
      const doorWidth = door?.width ?? 19;
      batch.box(-doorWidth / 2 - 2.2, 3.9, halfD + 0.45, 4.6, 7.8, 0.35, P.logDark, 'wood', 0.08);
      batch.box(0, 7.9, halfD + 0.4, doorWidth + 6, 0.3, 0.3, P.metalDark, 'metal', 0);
      for (const sx of [-1, 1]) {
        batch.with(Affine.translation(sx * (halfW + 0.1), 5.5, 2), () => {
          for (let stripe = 0; stripe < 4; stripe += 1) batch.box(0, -stripe * 0.7, 0, 0.06, 0.7, 2.2, stripe % 2 === 0 ? P.peakBlue : P.white, 'cloth', 0);
        });
      }
      return;
    }
    default:
      break;
  }
}

/** Height of the brake lever's hinge above the station platform. */
export const BRAKE_LEVER_HINGE = 0.9;

/** Static pedestal of the emergency brake (drawn into the station chunk, platform-local). */
export function drawBrakeLeverBase(batch: GeometryBatch): void {
  batch.box(0, BRAKE_LEVER_HINGE / 2, 0, 0.42, BRAKE_LEVER_HINGE, 0.42, P.metalDark, 'metal', 0.05);
  batch.box(0, BRAKE_LEVER_HINGE - 0.32, 0.22, 0.32, 0.22, 0.02, P.yellow, 'plain', 0);
  batch.box(0, BRAKE_LEVER_HINGE - 0.32, 0.235, 0.2, 0.06, 0.02, P.ink, 'plain', 0);
  batch.with(Affine.translation(0, BRAKE_LEVER_HINGE, 0).rotateZ(Math.PI / 2), () => batch.lathe([[0.09, -0.24], [0.09, 0.24]], 8, P.metal, 'metal', { capTop: true, capBottom: true }));
}

/**
 * Red emergency brake handle, hinge at the origin, leaning back (−Z) in the
 * "released" pose. It is its own mesh so the vehicle package can pull it by
 * rotating around local X.
 */
export function drawBrakeLeverHandle(batch: GeometryBatch): void {
  batch.with(Affine.rotationX(-0.45), () => {
    batch.lathe([[0.05, 0], [0.04, 0.85]], 6, P.alpineRed, 'metal', { capTop: true });
    batch.blob(0, 0.9, 0, 0.11, 0.11, 0.11, P.alpineRed, 'plain', { segments: 6, rings: 4 });
  });
}
