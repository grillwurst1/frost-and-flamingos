/**
 * Building shells derived from the shared `BuildingLayout`: the same wall
 * spans, door gaps, floors, stairs and roof the server colliders use, dressed
 * as chunky illustration-style chalets, beach bars, huts and the cuckoo-clock
 * fortress of Tower C.
 */
import {
  roofBase,
  wallFrames,
  wallSpans,
  type BuildingFloor,
  type BuildingLayout,
  type WallOpening,
} from '@frost-and-flamingos/shared';
import { Affine, GeometryBatch, hash3, mix, shade, type RGB, type V3 } from './geometry';
import { P } from './palette';
import type { SurfaceKind } from './surfaces';

type WallSide = WallOpening['wall'];
type WallMaterial = 'logs' | 'lapBoards' | 'boards' | 'plaster' | 'bamboo' | 'metal' | 'greyBoards';

interface BuildingStyle {
  ground: WallMaterial;
  upper: WallMaterial;
  wood: RGB;
  trim: RGB;
  shutter: RGB;
  roof: RGB;
  roofKind: 'shingle' | 'thatch' | 'metal';
  flowers: boolean;
  hearts: boolean;
  plinthStone: boolean;
}

function styleFor(layout: BuildingLayout, variant: number): BuildingStyle {
  const shutters = [P.shutterRed, P.shutterGreen, P.shutterRed, P.shutterBlue];
  const shutter = shutters[variant % shutters.length] ?? P.shutterRed;
  switch (layout.style) {
    case 'log_chalet':
      if (variant === 3) return { ground:'lapBoards',upper:'lapBoards',wood:[.45,.35,.26],
        trim:P.logDark,shutter:P.logDark,roof:P.shingleDark,roofKind:'shingle',flowers:false,hearts:false,plinthStone:true };
      return { ground:'logs',upper:'logs',wood:P.log,trim:P.trim,shutter,roof:P.shingle,roofKind:'shingle',flowers:true,hearts:true,plinthStone:true };
    case 'plaster_chalet':
      // Alpen-Bistro: white plaster ground floor, plank upper floor with flower boxes.
      return { ground: 'plaster', upper: 'boards', wood: P.log, trim: P.trim, shutter, roof: P.shingle, roofKind: 'shingle', flowers: true, hearts: true, plinthStone: true };
    case 'tiki_chalet':
      // Tiki-Alm: log body under a thick palm-thatch roof.
      return { ground: 'logs', upper: 'logs', wood: P.logLight, trim: P.trim, shutter: P.teal, roof: P.thatch, roofKind: 'thatch', flowers: true, hearts: false, plinthStone: true };
    case 'beach_bar':
      return { ground: 'bamboo', upper: 'bamboo', wood: P.bamboo, trim: P.cream, shutter: P.coral, roof: P.thatch, roofKind: 'thatch', flowers: true, hearts: false, plinthStone: false };
    case 'fisher_hut':
      return { ground: 'greyBoards', upper: 'greyBoards', wood: P.plankGrey, trim: P.cream, shutter: P.shutterBlue, roof: P.shingleDark, roofKind: 'shingle', flowers: false, hearts: false, plinthStone: false };
    case 'side_hut':
      // Snowy side hut: weathered grey planks.
      return { ground: 'greyBoards', upper: 'greyBoards', wood: P.plankGrey, trim: P.trim, shutter, roof: P.shingleDark, roofKind: 'shingle', flowers: false, hearts: true, plinthStone: true };
    case 'dairy_fortress':
      return { ground: 'boards', upper: 'logs', wood: P.logDark, trim: P.trim, shutter: P.shutterRed, roof: P.shingleDark, roofKind: 'shingle', flowers: true, hearts: true, plinthStone: true };
    case 'hangar':
      // Tank hangar: dark planks.
      return { ground: 'boards', upper: 'boards', wood: P.logDark, trim: P.cream, shutter: P.alpineRed, roof: P.metal, roofKind: 'metal', flowers: false, hearts: false, plinthStone: true };
    case 'bamboo_garage':
      return { ground: 'bamboo', upper: 'bamboo', wood: P.bamboo, trim: P.cream, shutter: P.coral, roof: P.thatch, roofKind: 'thatch', flowers: false, hearts: false, plinthStone: false };
    default:
      return { ground: 'logs', upper: 'logs', wood: P.log, trim: P.trim, shutter, roof: P.shingle, roofKind: 'shingle', flowers: true, hearts: true, plinthStone: true };
  }
}

interface Frame {
  side: WallSide;
  plane: number;
  min: number;
  max: number;
}

/** Local point on a wall: `along` the wall axis, `out` metres outward from the wall centre plane. */
function wallPoint(frame: Frame, along: number, y: number, out: number): V3 {
  switch (frame.side) {
    case 'front':
      return [along, y, frame.plane + out];
    case 'back':
      return [along, y, frame.plane - out];
    case 'left':
      return [frame.plane - out, y, along];
    default:
      return [frame.plane + out, y, along];
  }
}

function wallYaw(side: WallSide): number {
  switch (side) {
    case 'front':
      return 0;
    case 'back':
      return Math.PI;
    case 'left':
      return -Math.PI / 2;
    default:
      return Math.PI / 2;
  }
}

/** Runs `draw` in a frame where +X runs along the wall and +Z points outward. */
function onWall(batch: GeometryBatch, frame: Frame, along: number, y: number, out: number, draw: () => void): void {
  const point = wallPoint(frame, along, y, out);
  const yaw = wallYaw(frame.side);
  const flipAlong = frame.side === 'back' || frame.side === 'right' ? -1 : 1;
  batch.with(Affine.translation(point[0], point[1], point[2]).rotateY(yaw).scale(flipAlong, 1, 1), draw);
}

function heartOutline(size: number): [number, number][] {
  const points: [number, number][] = [];
  for (let index = 0; index < 14; index += 1) {
    const t = (index / 14) * Math.PI * 2;
    const x = 16 * Math.pow(Math.sin(t), 3);
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    points.push([(x / 17) * size, (y / 17) * size]);
  }
  return points.reverse();
}

function wallMaterialSurface(material: WallMaterial): SurfaceKind {
  if (material === 'plaster') return 'plaster';
  if (material === 'metal') return 'metal';
  return 'wood';
}

/** Draws one storey's walls (all four sides) with the chosen material. */
function drawWalls(batch: GeometryBatch, layout: BuildingLayout, floor: BuildingFloor, floorIndex: number, material: WallMaterial, style: BuildingStyle): void {
  const t = layout.wallThickness;
  const spans = wallSpans(layout, floor, true);
  for (const frame of wallFrames(layout)) {
    const frameSpans = spans.filter((span) => span.side === frame.side);
    if (material === 'lapBoards') {
      const rows = Math.ceil(floor.height/0.32), course = floor.height/rows;
      for(let row=0;row<rows;row++)for(const span of frameSpans) {
        const lo=Math.max(span.bottom,row*course),hi=Math.min(span.top,(row+1)*course);
        if(hi-lo<.025)continue;
        const a=wallPoint(frame,span.from,floor.elevation+lo+.008,0);
        const b=wallPoint(frame,span.to,floor.elevation+hi-.008,0);
        drawWallSlab(batch,frame,a,b,t,shade(style.wood,.92+hash3(row,floorIndex,frame.plane)*.14),'wood');
      }
      continue;
    }
    if (material === 'logs') {
      const course = 0.33;
      const courses = Math.max(1, Math.round(floor.height / course));
      const actual = floor.height / courses;
      for (let index = 0; index < courses; index += 1) {
        const y = floor.elevation + (index + 0.5) * actual;
        const local = y - floor.elevation;
        const alternate = (index + floorIndex + (frame.side === 'front' || frame.side === 'back' ? 0 : 1)) % 2 === 0;
        for (const span of frameSpans) {
          if (local < span.bottom - 0.01 || local > span.top + 0.01) continue;
          let from = span.from;
          let to = span.to;
          // Notched corners: alternate courses run past the corner.
          const extend = alternate ? 0.42 + hash3(index, floorIndex, frame.plane) * 0.12 : 0.18;
          if (Math.abs(from - frame.min) < 0.01) from -= frame.side === 'front' || frame.side === 'back' ? extend : extend + t;
          if (Math.abs(to - frame.max) < 0.01) to += frame.side === 'front' || frame.side === 'back' ? extend : extend + t;
          const a = wallPoint(frame, from, y, 0);
          const b = wallPoint(frame, to, y, 0);
          const tone = shade(style.wood, 0.9 + hash3(index * 1.3, floorIndex, frame.plane) * 0.2);
          batch.log(a, b, actual * 0.6, tone, 'wood', { segments: 7, endColor: P.logEnd });
        }
      }
      // Inner board lining keeps the wall visually solid from inside.
      for (const span of frameSpans) {
        const a = wallPoint(frame, span.from, floor.elevation + span.bottom, -t * 0.32);
        const b = wallPoint(frame, span.to, floor.elevation + span.top, -t * 0.32);
        drawWallSlab(batch, frame, a, b, 0.06, shade(style.wood, 0.8), 'wood');
      }
      continue;
    }
    for (const span of frameSpans) {
      const length = span.to - span.from;
      const height = span.top - span.bottom;
      if (length < 0.05 || height < 0.05) continue;
      const bottom = floor.elevation + span.bottom;
      if (material === 'plaster') {
        const a = wallPoint(frame, span.from, bottom, 0);
        const b = wallPoint(frame, span.to, bottom + height, 0);
        drawWallSlab(batch, frame, a, b, t, mix(P.plaster, P.plasterWarm, hash3(span.from, bottom, 1)), 'plaster');
        continue;
      }
      if (material === 'metal') {
        const a = wallPoint(frame, span.from, bottom, 0);
        const b = wallPoint(frame, span.to, bottom + height, 0);
        drawWallSlab(batch, frame, a, b, t, P.metal, 'metal');
        continue;
      }
      // Vertical boards (or bamboo poles) with slight height jitter.
      const board = material === 'bamboo' ? 0.2 : 0.32;
      const count = Math.max(1, Math.round(length / board));
      const width = length / count;
      for (let index = 0; index < count; index += 1) {
        const along = span.from + (index + 0.5) * width;
        const jitter = (hash3(along, bottom, frame.plane) - 0.5) * 0.06;
        if (material === 'bamboo') {
          const a = wallPoint(frame, along, bottom - 0.02, 0);
          const b = wallPoint(frame, along, bottom + height + jitter, 0);
          batch.log(a, b, width * 0.5, index % 2 === 0 ? P.bamboo : P.bambooDark, 'wood', { segments: 6, endColor: P.thatchDark });
        } else {
          const tone = material === 'greyBoards' ? mix(P.plankGrey, P.cream, hash3(along, 2, 3) * 0.25) : shade(style.wood, 0.88 + hash3(along, 1, frame.plane) * 0.22);
          const a = wallPoint(frame, along - width * 0.47, bottom, 0);
          const b = wallPoint(frame, along + width * 0.47, bottom + height + jitter, 0);
          drawWallSlab(batch, frame, a, b, t, tone, 'wood');
        }
      }
      if (material === 'bamboo') {
        const a = wallPoint(frame, span.from, bottom, -t * 0.25);
        const b = wallPoint(frame, span.to, bottom + height, -t * 0.25);
        drawWallSlab(batch, frame, a, b, 0.08, P.thatchDark, 'thatch');
      }
    }
  }
}

/** Box spanning two wall points with a thickness across the wall. */
function drawWallSlab(batch: GeometryBatch, frame: Frame, a: V3, b: V3, thickness: number, color: RGB, surface: SurfaceKind): void {
  const horizontal = frame.side === 'front' || frame.side === 'back';
  const cx = (a[0] + b[0]) / 2;
  const cy = (a[1] + b[1]) / 2;
  const cz = (a[2] + b[2]) / 2;
  const sx = horizontal ? Math.abs(b[0] - a[0]) : thickness;
  const sz = horizontal ? thickness : Math.abs(b[2] - a[2]);
  batch.box(cx, cy, cz, sx, Math.abs(b[1] - a[1]), sz, color, surface, 0.035);
}

function drawOpenings(batch: GeometryBatch, layout: BuildingLayout, floor: BuildingFloor, style: BuildingStyle, seed: number): void {
  const t = layout.wallThickness;
  const frames = wallFrames(layout);
  for (const opening of floor.openings) {
    const frame = frames.find((candidate) => candidate.side === opening.wall);
    if (!frame) continue;
    const bottom = floor.elevation + opening.sill;
    const top = Math.min(floor.elevation + floor.height, bottom + opening.height);
    const halfWidth = opening.width / 2;
    onWall(batch, frame, opening.offset, bottom, t / 2 + 0.02, () => {
      const height = top - bottom;
      const trim = opening.kind === 'counter' ? P.cream : style.trim;
      // White frame
      batch.box(-halfWidth - 0.07, height / 2, 0, 0.16, height + 0.16, 0.12, trim, 'wood', 0.03);
      batch.box(halfWidth + 0.07, height / 2, 0, 0.16, height + 0.16, 0.12, trim, 'wood', 0.03);
      batch.box(0, height + 0.08, 0, opening.width + 0.3, 0.18, 0.14, trim, 'wood', 0.03);
      if (opening.kind === 'window' || opening.kind === 'slit') {
        batch.box(0, -0.06, 0.04, opening.width + 0.34, 0.14, 0.24, trim, 'wood', 0.03);
        const glow = hash3(seed, opening.offset, bottom) > 0.55;
        batch.box(0, height / 2, -t * 0.45, opening.width, height, 0.06, glow ? P.windowGlow : P.glassDark, 'plain', 0);
        if (opening.kind === 'window') {
          batch.box(0, height / 2, -t * 0.4, 0.07, height, 0.08, trim, 'wood', 0);
          batch.box(0, height * 0.55, -t * 0.4, opening.width, 0.07, 0.08, trim, 'wood', 0);
          // Open shutters with heart cut-outs.
          for (const side of [-1, 1]) {
            const shutterWidth = halfWidth * 0.95;
            const x = side * (halfWidth + 0.15 + shutterWidth / 2);
            batch.box(x, height / 2, 0.02, shutterWidth, height + 0.05, 0.08, style.shutter, 'wood', 0.025);
            batch.box(x, height * 0.25, 0.07, shutterWidth * 0.85, 0.06, 0.04, shade(style.shutter, 0.75), 'wood', 0);
            batch.box(x, height * 0.75, 0.07, shutterWidth * 0.85, 0.06, 0.04, shade(style.shutter, 0.75), 'wood', 0);
            if (style.hearts) {
              batch.with(Affine.translation(x, height * 0.5, 0.075), () => {
                batch.extrude(heartOutline(0.16), 0.03, P.ink, 'plain');
              });
            }
          }
          if (style.flowers && opening.sill > 0.5) {
            batch.box(0, -0.22, 0.24, opening.width + 0.25, 0.3, 0.32, style.wood, 'wood', 0.04);
            const blooms = Math.max(3, Math.round(opening.width / 0.25));
            for (let bloom = 0; bloom < blooms; bloom += 1) {
              const bx = -opening.width / 2 + (bloom + 0.5) * (opening.width / blooms);
              const palette = [P.flowerRed, P.flowerPink, P.flowerWhite, P.flowerYellow];
              batch.blob(bx, -0.02, 0.26, 0.14, 0.12, 0.14, palette[(bloom + Math.floor(seed)) % palette.length] ?? P.flowerRed, 'foliage', { segments: 4, rings: 2 });
            }
          }
        }
      } else if (opening.kind === 'door') {
        // Door leaf swung open against the outer wall.
        batch.box(0, -0.03, 0.08, opening.width + 0.3, 0.08, 0.3, P.logDark, 'wood', 0.02);
        batch.with(Affine.translation(halfWidth + 0.08, 0, 0.02).rotateY(-1.45), () => {
          batch.box(opening.width * 0.48, Math.min(height, 2.4) / 2, 0.05, opening.width * 0.95, Math.min(height, 2.4), 0.1, shade(style.wood, 0.8), 'wood', 0.03);
          batch.box(opening.width * 0.48, Math.min(height, 2.4) * 0.3, 0.12, opening.width * 0.8, 0.09, 0.05, shade(style.wood, 0.62), 'wood', 0);
          batch.box(opening.width * 0.48, Math.min(height, 2.4) * 0.72, 0.12, opening.width * 0.8, 0.09, 0.05, shade(style.wood, 0.62), 'wood', 0);
        });
      } else {
        // Counter: bar top board.
        batch.box(0, -0.05, 0.3, opening.width + 0.4, 0.12, 0.7, P.plankLight, 'wood', 0.04);
      }
    });
  }
}

function drawFloorSlab(batch: GeometryBatch, layout: BuildingLayout, floor: BuildingFloor, floorIndex: number): void {
  const t = layout.wallThickness;
  const halfW = layout.width / 2 - t * 0.5;
  const halfD = layout.depth / 2 - t * 0.5;
  const holes = floorIndex === 0 ? [] : layout.stairwells;
  const plank = 0.42;
  const count = Math.max(1, Math.round((halfW * 2) / plank));
  for (let index = 0; index < count; index += 1) {
    const x0 = -halfW + (index / count) * halfW * 2;
    const x1 = x0 + (halfW * 2) / count;
    const cx = (x0 + x1) / 2;
    // Split the plank around stairwell holes.
    let segments: [number, number][] = [[-halfD, halfD]];
    for (const hole of holes) {
      if (cx < hole.center.x - hole.size.x / 2 || cx > hole.center.x + hole.size.x / 2) continue;
      const h0 = hole.center.z - hole.size.z / 2;
      const h1 = hole.center.z + hole.size.z / 2;
      segments = segments.flatMap(([a, b]): [number, number][] => {
        if (h1 <= a || h0 >= b) return [[a, b]];
        const parts: [number, number][] = [];
        if (h0 > a) parts.push([a, h0]);
        if (h1 < b) parts.push([h1, b]);
        return parts;
      });
    }
    for (const [z0, z1] of segments) {
      batch.box(cx, floor.elevation - 0.14, (z0 + z1) / 2, x1 - x0 - 0.02, 0.28, z1 - z0, index % 2 === 0 ? P.plank : P.plankLight, 'wood', 0.02);
    }
  }
}

function drawStairs(batch: GeometryBatch, layout: BuildingLayout): void {
  for (const flight of layout.stairs) {
    const rise = flight.to.y - flight.from.y;
    const steps = Math.max(3, Math.round(rise / 0.24));
    for (let step = 0; step < steps; step += 1) {
      const t0 = step / steps;
      const t1 = (step + 1) / steps;
      const x = flight.from.x + (flight.to.x - flight.from.x) * (t0 + t1) / 2;
      const z = flight.from.z + (flight.to.z - flight.from.z) * (t0 + t1) / 2;
      const y = flight.from.y + rise * t1;
      const depth = Math.hypot(flight.to.x - flight.from.x, flight.to.z - flight.from.z) / steps;
      const yaw = Math.atan2(flight.to.x - flight.from.x, flight.to.z - flight.from.z);
      batch.at(x, y - 0.08, z, yaw, () => {
        batch.box(0, 0, 0, flight.width, 0.16, depth + 0.04, step % 2 === 0 ? P.plankLight : P.plank, 'wood', 0.02);
      });
    }
    // Stringers
    for (const side of [-1, 1]) {
      const yaw = Math.atan2(flight.to.x - flight.from.x, flight.to.z - flight.from.z);
      const off = { x: Math.cos(yaw) * side * (flight.width / 2 + 0.05), z: -Math.sin(yaw) * side * (flight.width / 2 + 0.05) };
      batch.log([flight.from.x + off.x, flight.from.y, flight.from.z + off.z], [flight.to.x + off.x, flight.to.y, flight.to.z + off.z], 0.08, P.logDark, 'wood', { segments: 5 });
    }
  }
}

function drawBalcony(batch: GeometryBatch, layout: BuildingLayout, style: BuildingStyle): void {
  const balcony = layout.balcony;
  if (!balcony) return;
  const floor = layout.floors[balcony.floor];
  if (!floor) return;
  const halfW = layout.width / 2;
  const halfD = layout.depth / 2;
  const d = balcony.depth;
  const y = floor.elevation;
  const wraps = balcony.sides.includes('left') || balcony.sides.includes('right');
  for (const side of balcony.sides) {
    const along = side === 'front' || side === 'back';
    const sign = side === 'front' || side === 'right' ? 1 : -1;
    const length = along ? layout.width + (wraps ? d * 2 : 0) : layout.depth;
    const center: V3 = along ? [0, y, sign * (halfD + d / 2)] : [sign * (halfW + d / 2), y, 0];
    const yaw = along ? 0 : Math.PI / 2;
    batch.at(center[0], center[1], center[2], yaw, () => {
      // Plank deck with visible joists
      const planks = Math.max(2, Math.round(length / 0.45));
      for (let index = 0; index < planks; index += 1) {
        const x = -length / 2 + (index + 0.5) * (length / planks);
        batch.box(x, -0.12, 0, length / planks - 0.03, 0.2, d, index % 2 === 0 ? P.plank : P.plankLight, 'wood', 0.02);
      }
      for (const end of [-1, 0, 1]) {
        batch.box(end * (length / 2 - 0.3), -0.45, 0, 0.18, 0.5, d * 0.95, P.logDark, 'wood', 0.03);
      }
      // Carved balusters with a top rail and flower boxes.
      const outer = (along ? sign : sign) * (d / 2 - 0.08);
      const zRail = along ? outer : outer;
      const balusters = Math.max(4, Math.round(length / 0.3));
      batch.fineDetail(
        () => {
          for (let index = 0; index <= balusters; index += 1) {
            const x = -length / 2 + (index / balusters) * length;
            batch.box(x, balcony.railHeight / 2, zRail, 0.16, balcony.railHeight, 0.07, index % 2 === 0 ? style.wood : shade(style.wood, 1.15), 'wood', 0.02);
          }
        },
        // Far away the comb of balusters reads as one painted board.
        () => batch.box(0, balcony.railHeight / 2, zRail, length, balcony.railHeight, 0.07, shade(style.wood, 1.05), 'wood', 0),
      );
      batch.box(0, balcony.railHeight + 0.05, zRail, length + 0.1, 0.14, 0.2, shade(style.wood, 0.85), 'wood', 0.04);
      batch.box(0, 0.12, zRail, length + 0.1, 0.1, 0.16, shade(style.wood, 0.85), 'wood', 0.03);
      if (style.flowers) {
        const boxes = Math.max(1, Math.floor(length / 3.2));
        for (let index = 0; index < boxes; index += 1) {
          const x = -length / 2 + (index + 0.5) * (length / boxes);
          batch.box(x, balcony.railHeight - 0.1, zRail + sign * 0.2, 1.3, 0.28, 0.3, P.log, 'wood', 0.03);
          for (let bloom = 0; bloom < 6; bloom += 1) {
            const palette = [P.flowerRed, P.flowerPink, P.flowerRed, P.flowerWhite];
            batch.blob(x - 0.55 + bloom * 0.22, balcony.railHeight + 0.1, zRail + sign * 0.22, 0.14, 0.13, 0.14, palette[bloom % palette.length] ?? P.flowerRed, 'foliage', {
              segments: 4,
              rings: 2,
            });
          }
          for (let leaf = 0; leaf < 3; leaf += 1) {
            batch.blob(x - 0.4 + leaf * 0.4, balcony.railHeight - 0.15, zRail + sign * 0.38, 0.14, 0.2, 0.06, P.leaf, 'foliage', { segments: 4, rings: 3 });
          }
        }
      }
    });
  }
}

function drawIcicleRow(batch: GeometryBatch, from: V3, to: V3, seed: number): void {
  const length = Math.hypot(to[0] - from[0], to[2] - from[2]);
  const count = Math.max(2, Math.round(length / 0.5));
  for (let index = 0; index < count; index += 1) {
    const t = (index + 0.5) / count;
    const h = 0.3 + hash3(seed, index, 3) * 0.8;
    batch.with(Affine.translation(from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, from[2] + (to[2] - from[2]) * t), () => {
      batch.lathe(
        [
          [0.1, 0],
          [0.055, -h * 0.55],
          [0.004, -h],
        ],
        5,
        (ring) => (ring === 0 ? P.snow : P.ice),
        'ice',
        { phase: index },
      );
    });
  }
}

/**
 * Gable roof (ridge along local Z, gable facing the front) with individual
 * shingle tabs, carved eave boards, ridge cap, chimney, a bulging snow
 * blanket with drift lumps and icicles along both eaves.
 */
function drawGableRoof(batch: GeometryBatch, layout: BuildingLayout, style: BuildingStyle, seed: number, options: { chimney: boolean; gableDecor: boolean }): void {
  const top = roofBase(layout);
  const halfW = layout.width / 2;
  const halfD = layout.depth / 2;
  const overhang = layout.roof.overhang;
  const run = halfW + overhang;
  const rise = Math.tan(layout.roof.pitch) * run;
  const slopeLength = Math.hypot(run, rise);
  const length = layout.depth + overhang * 2;
  const pitch = Math.atan2(rise, run);
  const thatch = style.roofKind === 'thatch';
  // Gable triangles (vertical boards) on front and back.
  for (const sign of [1, -1]) {
    const z = sign * (halfD - layout.wallThickness / 2);
    const boards = Math.max(3, Math.round(layout.width / 0.36));
    for (let index = 0; index < boards; index += 1) {
      const x = -halfW + (index + 0.5) * (layout.width / boards);
      const h = Math.max(0.05, Math.tan(pitch) * (run - Math.abs(x)) - 0.12);
      batch.box(x, top + h / 2, z, layout.width / boards - 0.03, h, layout.wallThickness * 0.8, shade(style.wood, 0.92 + hash3(x, sign, 4) * 0.16), 'wood', 0.02);
    }
    if (options.gableDecor) {
      batch.with(Affine.translation(0, top + rise * 0.45, z + sign * 0.26).rotateY(sign > 0 ? 0 : Math.PI), () => {
        batch.extrude(heartOutline(0.42), 0.08, P.ink, 'plain');
        batch.box(0, -0.85, 0, 1.6, 0.12, 0.08, style.trim, 'wood', 0.02);
      });
    }
    // Carved barge boards along the gable edges.
    for (const side of [-1, 1]) {
      batch.log(
        [0, top + rise + 0.05, sign * (length / 2)],
        [side * run, top - 0.05, sign * (length / 2)],
        0.12,
        style.trim,
        'wood',
        { segments: 5 },
      );
      const scallops = Math.round(run / 0.55);
      for (let index = 1; index < scallops; index += 1) {
        const t = index / scallops;
        batch.blob(side * run * t, top + rise * (1 - t) - 0.22, sign * (length / 2), 0.16, 0.14, 0.06, style.trim, 'wood', { segments: 5, rings: 3 });
      }
    }
  }
  // Roof slopes built from overlapping shingle rows.
  for (const sign of [1, -1]) {
    batch.with(Affine.translation(0, top + rise, 0).rotateZ(-sign * pitch), () => {
      const rows = Math.max(4, Math.round(slopeLength / (thatch ? 0.55 : 0.42)));
      for (let row = 0; row < rows; row += 1) {
        const along = ((row + 0.5) / rows) * slopeLength;
        const color = thatch
          ? mix(P.thatchDark, P.thatch, 0.5 + hash3(row, seed, sign) * 0.5)
          : mix(shade(style.roof, 0.82), style.roof, hash3(row, seed, sign));
        if (thatch) {
          batch.box(sign * along, -0.06 - row * 0.012, 0, slopeLength / rows + 0.3, 0.32, length + 0.1 * (row % 2), color, 'thatch', 0.12);
        } else {
          // Each course is laid as a few uneven runs of shingles (cheap, still hand-made looking).
          const runs = 3;
          let cursor = -length / 2;
          for (let run = 0; run < runs; run += 1) {
            const share = run === runs - 1 ? length / 2 - cursor : (length / runs) * (0.75 + hash3(run, row, seed) * 0.5);
            const runColor = shade(color, 0.9 + hash3(run, row, seed + 3) * 0.2);
            const drop = (hash3(row, run, seed + 9) - 0.5) * 0.05;
            batch.box(sign * (along + drop), -0.04 - (row % 2) * 0.02, cursor + share / 2, slopeLength / rows + 0.14, 0.15, share - 0.06, runColor, 'shingle', 0);
            cursor += share;
          }
        }
      }
      batch.box(sign * slopeLength, -0.2, 0, 0.14, 0.24, length, style.trim, 'wood', 0.03);
      if (layout.roof.snow) {
        batch.box(sign * slopeLength * 0.5, 0.14, 0, slopeLength + 0.15, 0.34, length + 0.12, P.snow, 'snow', 0.14, P.snow);
        const lumps = Math.max(4, Math.round(length / 1.3));
        for (let lump = 0; lump < lumps; lump += 1) {
          const z = -length / 2 + (lump + 0.5) * (length / lumps);
          batch.blob(sign * (slopeLength + 0.02), 0.1, z, 0.34, 0.3, (length / lumps) * 0.62, (ny) => (ny > 0 ? P.snow : P.snowShade), 'snow', {
            segments: 6,
            rings: 4,
            wobble: 0.2,
            seed: seed + lump,
          });
        }
      }
    });
  }
  batch.box(0, top + rise + 0.12, 0, 0.42, 0.24, length + 0.1, thatch ? P.thatchDark : P.logDark, thatch ? 'thatch' : 'wood', 0.08);
  if (thatch) {
    // Crossed bamboo ridge poles over both gable ends.
    for (const sign of [1, -1]) {
      for (const side of [1, -1]) {
        batch.log([side * 0.9, top + rise - 0.6, sign * (length / 2)], [-side * 0.5, top + rise + 0.9, sign * (length / 2)], 0.09, P.bamboo, 'wood', { segments: 5 });
      }
    }
  }
  if (layout.roof.snow) {
    batch.blob(0, top + rise + 0.28, 0, 0.5, 0.3, length / 2 + 0.05, P.snow, 'snow', { segments: 10, rings: 4 });
    for (const sign of [1, -1]) {
      drawIcicleRow(batch, [sign * (run + 0.05), top - 0.35, -length / 2 + 0.3], [sign * (run + 0.05), top - 0.35, length / 2 - 0.3], seed + sign);
    }
  }
  if (options.chimney) {
    const cx = halfW * 0.42;
    const cz = -halfD * 0.35;
    const base = top + rise - Math.tan(pitch) * Math.abs(cx) - 0.4;
    batch.box(cx, base + 1.0, cz, 0.9, 2.2, 0.9, P.cobble, 'stone', 0.08);
    batch.box(cx, base + 2.15, cz, 1.15, 0.22, 1.15, P.cobbleDark, 'stone', 0.06);
    if (layout.roof.snow) batch.blob(cx, base + 2.3, cz, 0.55, 0.18, 0.55, P.snow, 'snow', { segments: 6, rings: 3 });
  }
}

function drawBarrelRoof(batch: GeometryBatch, layout: BuildingLayout, style: BuildingStyle): void {
  const top = roofBase(layout);
  const radius = layout.width / 2 + layout.roof.overhang;
  const length = layout.depth + layout.roof.overhang * 2;
  const segments = 12;
  for (let index = 0; index < segments; index += 1) {
    const a0 = Math.PI * (index / segments);
    const a1 = Math.PI * ((index + 1) / segments);
    const p0: V3 = [Math.cos(a0) * radius, top + Math.sin(a0) * radius * 0.45, 0];
    const p1: V3 = [Math.cos(a1) * radius, top + Math.sin(a1) * radius * 0.45, 0];
    const color = index % 2 === 0 ? style.roof : shade(style.roof, 1.12);
    batch.orientedPolygon(
      [
        [p0[0], p0[1], -length / 2],
        [p1[0], p1[1], -length / 2],
        [p1[0], p1[1], length / 2],
        [p0[0], p0[1], length / 2],
      ],
      [(p0[0] + p1[0]) / 2, 1, 0],
      color,
      'metal',
    );
    if (layout.roof.snow && index > 2 && index < segments - 3) {
      batch.orientedPolygon(
        [
          [p0[0] * 1.01, p0[1] + 0.18, -length / 2],
          [p1[0] * 1.01, p1[1] + 0.18, -length / 2],
          [p1[0] * 1.01, p1[1] + 0.18, length / 2],
          [p0[0] * 1.01, p0[1] + 0.18, length / 2],
        ],
        [(p0[0] + p1[0]) / 2, 1, 0],
        P.snow,
        'snow',
      );
    }
  }
  // Gable end walls under the barrel
  for (const sign of [1, -1]) {
    const points: V3[] = [];
    for (let index = 0; index <= segments; index += 1) {
      const a = Math.PI * (index / segments);
      points.push([Math.cos(a) * (layout.width / 2), top + Math.sin(a) * (layout.width / 2) * 0.45, sign * (layout.depth / 2 - 0.3)]);
    }
    batch.orientedPolygon(points, [0, 0, sign], style.wood, 'wood');
  }
}

function drawPlinth(batch: GeometryBatch, layout: BuildingLayout, style: BuildingStyle): void {
  if (layout.plinth < 0.05) return;
  const w = layout.width + 0.5;
  const d = layout.depth + 0.5;
  if (style.plinthStone) {
    const stones = Math.round((w + d) * 2 / 0.9);
    for (let index = 0; index < stones; index += 1) {
      const p = (index / stones) * 4;
      const side = Math.floor(p);
      const f = p - side;
      const x = side === 0 ? -w / 2 + f * w : side === 1 ? w / 2 : side === 2 ? w / 2 - f * w : -w / 2;
      const z = side === 0 ? d / 2 : side === 1 ? d / 2 - f * d : side === 2 ? -d / 2 : -d / 2 + f * d;
      batch.blob(x, layout.plinth * 0.5, z, 0.5, layout.plinth * 0.62, 0.42, mix(P.cobbleDark, P.cobble, hash3(index, 2, 5)), 'stone', {
        segments: 5,
        rings: 3,
        flat: true,
        wobble: 0.25,
        seed: index,
      });
    }
  }
  batch.box(0, layout.plinth / 2, 0, w - 0.3, layout.plinth, d - 0.3, P.cobbleDark, 'stone', 0.06);
}

function drawInterior(batch: GeometryBatch, layout: BuildingLayout, seed: number): void {
  const ground = layout.floors[0];
  if (!ground) return;
  const y = ground.elevation;
  if (layout.style === 'beach_bar') {
    for (let index = 0; index < 3; index += 1) {
      batch.with(Affine.translation(-1.8 + index * 1.8, 0, layout.depth / 2 + 1.5), () => {
        batch.cylinder(0.25, 0.25, 0.75, 8, P.coral, 'wood', { y, capTop: true });
      });
    }
    batch.box(0, y + 0.5, -layout.depth / 2 + 0.8, layout.width - 1.5, 1.0, 0.5, P.plank, 'wood', 0.04);
    for (let bottle = 0; bottle < 6; bottle += 1) {
      batch.with(Affine.translation(-2 + bottle * 0.8, y + 1.05, -layout.depth / 2 + 0.8), () => {
        batch.lathe([[0.09, 0], [0.1, 0.25], [0.04, 0.38], [0.03, 0.5]], 6, bottle % 2 === 0 ? P.teal : P.yellow, 'plain', { capTop: true });
      });
    }
    return;
  }
  if (layout.style === 'dairy_fortress') {
    for (const [x, z] of [
      [-8, 5],
      [8, 5],
      [0, -6],
    ] as const) {
      batch.with(Affine.translation(x, y, z), () => drawCheeseWheel(batch, 1.1, seed + x));
    }
    return;
  }
  if (layout.floors.length < 2) return;
  // Table with benches and a tiled stove.
  batch.box(1.2, y + 0.78, 0.2, 2.4, 0.12, 1.2, P.plankLight, 'wood', 0.04);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) batch.box(1.2 + sx * 1.0, y + 0.38, 0.2 + sz * 0.45, 0.12, 0.76, 0.12, P.logDark, 'wood', 0.02);
  for (const sz of [-1, 1]) batch.box(1.2, y + 0.45, 0.2 + sz * 1.05, 2.2, 0.1, 0.4, P.plank, 'wood', 0.03);
  batch.box(layout.width / 2 - 1.3, y + 0.9, -layout.depth / 2 + 1.2, 1.4, 1.8, 1.1, P.trim, 'stone', 0.1);
  batch.box(layout.width / 2 - 1.3, y + 1.85, -layout.depth / 2 + 1.2, 1.6, 0.16, 1.3, P.shutterGreen, 'stone', 0.05);
  const upper = layout.floors[1];
  if (upper) {
    batch.box(layout.width / 2 - 1.6, upper.elevation + 0.3, 0, 2, 0.6, 1.1, P.alpineRed, 'cloth', 0.12);
    batch.box(layout.width / 2 - 1.6, upper.elevation + 0.68, 0.35, 1.9, 0.16, 0.3, P.white, 'cloth', 0.06);
  }
}

export function drawCheeseWheel(batch: GeometryBatch, radius: number, seed: number): void {
  batch.lathe(
    [
      [radius * 0.92, 0],
      [radius, radius * 0.12],
      [radius, radius * 0.62],
      [radius * 0.92, radius * 0.75],
    ],
    14,
    P.cheeseRind,
    'plain',
    { capTop: true, phase: seed },
  );
  for (let hole = 0; hole < 4; hole += 1) {
    const angle = hash3(seed, hole, 1) * Math.PI * 2;
    const r = radius * (0.3 + hash3(seed, hole, 2) * 0.5);
    batch.blob(Math.sin(angle) * r, radius * 0.76, Math.cos(angle) * r, radius * 0.12, 0.04, radius * 0.12, shade(P.cheese, 0.75), 'plain', { segments: 6, rings: 3 });
  }
  batch.blob(0, radius * 0.74, 0, radius * 0.86, 0.05, radius * 0.86, P.cheese, 'plain', { segments: 14, rings: 3, flatBottom: true });
}

/** Snow drifts piled against the walls of snowy buildings. */
function drawWallDrifts(batch: GeometryBatch, layout: BuildingLayout, seed: number): void {
  const halfW = layout.width / 2;
  const halfD = layout.depth / 2;
  for (let index = 0; index < 10; index += 1) {
    const side = index % 4;
    const f = hash3(seed, index, 7) - 0.5;
    const x = side === 0 || side === 2 ? f * layout.width * 0.9 : side === 1 ? halfW + 0.35 : -halfW - 0.35;
    const z = side === 1 || side === 3 ? f * layout.depth * 0.9 : side === 0 ? halfD + 0.35 : -halfD - 0.35;
    const r = 0.8 + hash3(seed, index, 8) * 0.9;
    batch.blob(x, 0.05, z, r, 0.45 + r * 0.2, r * 0.75, (ny) => (ny > 0.3 ? P.snow : P.snowMid), 'snow', {
      segments: 7,
      rings: 4,
      flatBottom: true,
      wobble: 0.2,
      seed: seed + index,
    });
  }
}

export interface BuildingDrawOptions {
  variant: number;
  seed: number;
  snowy: boolean;
  /**
   * A painted facade shell (map/facades.ts) covers the outside: draw only the
   * structure behind it — floors, ceiling, inner wall lining, door frames and
   * reveals, stairs, balcony and interior.
   */
  facade?: boolean;
}

/** Inner plank lining of one storey (windows and doors stay open). */
function drawInnerLining(batch: GeometryBatch, layout: BuildingLayout, floor: BuildingFloor, style: BuildingStyle): void {
  const t = layout.wallThickness;
  for (const frame of wallFrames(layout)) {
    for (const span of wallSpans(layout, floor, true)) {
      if (span.side !== frame.side) continue;
      const a = wallPoint(frame, span.from, floor.elevation + span.bottom, -t * 0.32);
      const b = wallPoint(frame, span.to, floor.elevation + span.top, -t * 0.32);
      drawWallSlab(batch, frame, a, b, 0.06, shade(style.wood, 0.8), 'wood');
    }
  }
}

/** Jambs and head boards lining each doorway through the wall thickness. */
function drawDoorReveals(batch: GeometryBatch, layout: BuildingLayout, floor: BuildingFloor, style: BuildingStyle): void {
  const t = layout.wallThickness;
  const frames = wallFrames(layout);
  for (const opening of floor.openings) {
    if (opening.kind !== 'door' && opening.kind !== 'counter') continue;
    const frame = frames.find((candidate) => candidate.side === opening.wall);
    if (!frame) continue;
    const bottom = floor.elevation + opening.sill;
    const height = Math.min(floor.height - opening.sill, opening.height);
    onWall(batch, frame, opening.offset, bottom, 0, () => {
      for (const side of [-1, 1]) {
        batch.box(side * (opening.width / 2 + 0.05), height / 2, 0, 0.1, height, t + 0.06, shade(style.wood, 0.7), 'wood', 0.02);
      }
      batch.box(0, height + 0.05, 0, opening.width + 0.2, 0.1, t + 0.06, shade(style.wood, 0.7), 'wood', 0.02);
    });
  }
}

function drawFacadeStructure(batch: GeometryBatch, layout: BuildingLayout, style: BuildingStyle, options: BuildingDrawOptions): void {
  layout.floors.forEach((floor, index) => {
    drawFloorSlab(batch, layout, floor, index);
    drawInnerLining(batch, layout, floor, style);
    drawDoorReveals(batch, layout, floor, style);
    const doors = { ...floor, openings: floor.openings.filter((opening) => opening.kind === 'door' || opening.kind === 'counter') };
    drawOpenings(batch, layout, doors, style, options.seed + index * 13);
  });
  // Ceiling under the attic (the painted roof is single-sided).
  const top = roofBase(layout);
  drawFloorSlab(batch, layout, { elevation: top, height: 0, openings: [] }, 0);
  drawStairs(batch, layout);
  drawBalcony(batch, layout, style);
  drawInterior(batch, layout, options.seed);
  if (options.snowy && layout.roof.snow) drawWallDrifts(batch, layout, options.seed);
}

/** Full building shell in building-local space (origin = anchor, +Z = front). */
export function drawBuilding(batch: GeometryBatch, layout: BuildingLayout, options: BuildingDrawOptions): void {
  const style = styleFor(layout, options.variant);
  if (options.facade) {
    drawFacadeStructure(batch, layout, style, options);
    return;
  }
  drawPlinth(batch, layout, style);
  layout.floors.forEach((floor, index) => {
    drawFloorSlab(batch, layout, floor, index);
    drawWalls(batch, layout, floor, index, index === 0 ? style.ground : style.upper, style);
    drawOpenings(batch, layout, floor, style, options.seed + index * 13);
    // Pent-roof skirt between storeys (cuckoo-clock style) on two-storey shells.
    if (index === 0 && layout.floors.length > 1 && layout.style !== 'beach_bar') {
      const y = floor.elevation + floor.height + 0.05;
      for (const sign of [1, -1]) {
        batch.with(Affine.translation(0, y, sign * (layout.depth / 2 + 0.05)).rotateX(sign * 0.5), () => {
          batch.box(0, 0, sign * 0.3, layout.width + 0.6, 0.1, 0.7, shade(style.roof, 0.95), 'shingle', 0.03);
        });
      }
    }
  });
  drawStairs(batch, layout);
  drawBalcony(batch, layout, style);
  drawInterior(batch, layout, options.seed);
  // Corner posts frame the walls.
  const top = roofBase(layout);
  if (style.ground !== 'logs') {
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        batch.box(sx * (layout.width / 2 - 0.05), top / 2, sz * (layout.depth / 2 - 0.05), 0.34, top, 0.34, shade(style.wood, 0.75), 'wood', 0.06);
      }
    }
  }
  switch (layout.roof.kind) {
    case 'gable':
      drawGableRoof(batch, layout, style, options.seed, { chimney: layout.floors.length > 1 || layout.style === 'side_hut', gableDecor: style.hearts });
      break;
    case 'barrel':
      drawBarrelRoof(batch, layout, style);
      break;
    default:
      break;
  }
  if (options.snowy && layout.roof.snow) drawWallDrifts(batch, layout, options.seed);
}

export { drawIcicleRow, heartOutline };
