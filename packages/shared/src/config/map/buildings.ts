/**
 * Parametric building shells shared by the server colliders and the client
 * meshes. A layout describes floors, wall openings, stairs, stairwells,
 * balconies and the roof; `buildingColliders` turns it into Rapier-ready
 * boxes with real door gaps, walkable stair ramps and upper floors.
 */
import type { Vec3 } from '../../types/index.js';
import type {
  BuildingFloor,
  BuildingLayout,
  BuildingStyle,
  PropCollider,
  StairFlight,
  SurfaceTag,
  WallOpening,
} from '../../types/map.js';

export type WallSide = WallOpening['wall'];

interface ColliderOptions {
  rotation?: Vec3;
  surface?: SurfaceTag;
  pieceId?: string;
}

export function boxCollider(
  halfX: number,
  halfY: number,
  halfZ: number,
  offsetX: number,
  offsetY: number,
  offsetZ: number,
  options: ColliderOptions = {},
): PropCollider {
  return {
    type: 'box',
    halfExtents: { x: halfX, y: halfY, z: halfZ },
    offset: { x: offsetX, y: offsetY, z: offsetZ },
    ...(options.rotation ? { rotation: options.rotation } : {}),
    ...(options.surface ? { surface: options.surface } : {}),
    ...(options.pieceId ? { pieceId: options.pieceId } : {}),
  };
}

export function cylinderCollider(
  radius: number,
  halfHeight: number,
  offsetX: number,
  offsetY: number,
  offsetZ: number,
  options: Omit<ColliderOptions, 'rotation'> = {},
): PropCollider {
  return {
    type: 'cylinder',
    radius,
    halfHeight,
    offset: { x: offsetX, y: offsetY, z: offsetZ },
    ...(options.surface ? { surface: options.surface } : {}),
    ...(options.pieceId ? { pieceId: options.pieceId } : {}),
  };
}

export function sphereCollider(radius: number, offsetX: number, offsetY: number, offsetZ: number): PropCollider {
  return { type: 'sphere', radius, offset: { x: offsetX, y: offsetY, z: offsetZ } };
}

export function prismCollider(
  sides: number,
  radius: number,
  halfHeight: number,
  offsetX: number,
  offsetY: number,
  offsetZ: number,
  options: Omit<ColliderOptions, 'rotation'> = {},
): PropCollider {
  return {
    type: 'prism',
    sides,
    radius,
    halfHeight,
    offset: { x: offsetX, y: offsetY, z: offsetZ },
    ...(options.surface ? { surface: options.surface } : {}),
    ...(options.pieceId ? { pieceId: options.pieceId } : {}),
  };
}

/**
 * A thin box whose top face runs from `from` to `to` (prop-local feet
 * positions). Used for stairs, ramps, sagging bridge segments and the arch.
 */
export function rampCollider(
  from: Vec3,
  to: Vec3,
  width: number,
  thickness: number,
  options: Omit<ColliderOptions, 'rotation'> = {},
): PropCollider {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const horizontal = Math.hypot(dx, dz);
  const length = Math.hypot(horizontal, dy);
  const yaw = Math.atan2(dx, dz);
  const pitch = -Math.atan2(dy, horizontal);
  // Up vector of the tilted box: Ry(yaw) · Rx(pitch) · (0, 1, 0).
  const upY = Math.cos(pitch);
  const upForward = Math.sin(pitch);
  const upX = Math.sin(yaw) * upForward;
  const upZ = Math.cos(yaw) * upForward;
  const half = thickness / 2;
  return boxCollider(
    width / 2,
    half,
    length / 2,
    (from.x + to.x) / 2 - upX * half,
    (from.y + to.y) / 2 - upY * half,
    (from.z + to.z) / 2 - upZ * half,
    { rotation: { x: pitch, y: yaw, z: 0 }, ...options },
  );
}

export interface WallSpan {
  side: WallSide;
  /** Start / end along the wall axis (local X for front/back, local Z for left/right). */
  from: number;
  to: number;
  /** Bottom / top above the floor. */
  bottom: number;
  top: number;
}

export interface WallFrame {
  side: WallSide;
  /** Constant coordinate of the wall centre plane (z for front/back, x for left/right). */
  plane: number;
  /** Extent along the wall axis. */
  min: number;
  max: number;
}

export function wallFrames(layout: BuildingLayout): WallFrame[] {
  const t = layout.wallThickness;
  const halfW = layout.width / 2;
  const halfD = layout.depth / 2;
  return [
    { side: 'front', plane: halfD - t / 2, min: -halfW, max: halfW },
    { side: 'back', plane: -halfD + t / 2, min: -halfW, max: halfW },
    { side: 'left', plane: -halfW + t / 2, min: -halfD + t, max: halfD - t },
    { side: 'right', plane: halfW - t / 2, min: -halfD + t, max: halfD - t },
  ];
}

/**
 * Splits each wall of a floor into solid spans around its openings. Doors and
 * counters cut the collider; windows and slits only cut the visual mesh, so
 * `includeGlazed` selects which kinds of opening are subtracted.
 */
export function wallSpans(layout: BuildingLayout, floor: BuildingFloor, includeGlazed: boolean): WallSpan[] {
  const spans: WallSpan[] = [];
  for (const frame of wallFrames(layout)) {
    const openings = floor.openings
      .filter((opening) => opening.wall === frame.side)
      .filter((opening) => includeGlazed || opening.kind === 'door' || opening.kind === 'counter')
      .map((opening) => ({
        from: Math.max(frame.min, opening.offset - opening.width / 2),
        to: Math.min(frame.max, opening.offset + opening.width / 2),
        bottom: opening.sill,
        top: Math.min(floor.height, opening.sill + opening.height),
      }))
      .sort((a, b) => a.from - b.from);
    let cursor = frame.min;
    for (const opening of openings) {
      if (opening.from > cursor + 0.01) {
        spans.push({ side: frame.side, from: cursor, to: opening.from, bottom: 0, top: floor.height });
      }
      if (opening.bottom > 0.01) {
        spans.push({ side: frame.side, from: opening.from, to: opening.to, bottom: 0, top: opening.bottom });
      }
      if (opening.top < floor.height - 0.01) {
        spans.push({ side: frame.side, from: opening.from, to: opening.to, bottom: opening.top, top: floor.height });
      }
      cursor = Math.max(cursor, opening.to);
    }
    if (cursor < frame.max - 0.01) {
      spans.push({ side: frame.side, from: cursor, to: frame.max, bottom: 0, top: floor.height });
    }
  }
  return spans;
}

/** Rectangles of a slab with rectangular holes removed (simple strip decomposition). */
export function slabRects(
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  holes: readonly { minX: number; maxX: number; minZ: number; maxZ: number }[],
): { minX: number; maxX: number; minZ: number; maxZ: number }[] {
  if (holes.length === 0) return [{ minX, maxX, minZ, maxZ }];
  const xs = new Set<number>([minX, maxX]);
  for (const hole of holes) {
    xs.add(Math.max(minX, Math.min(maxX, hole.minX)));
    xs.add(Math.max(minX, Math.min(maxX, hole.maxX)));
  }
  const columns = [...xs].sort((a, b) => a - b);
  const result: { minX: number; maxX: number; minZ: number; maxZ: number }[] = [];
  for (let index = 0; index + 1 < columns.length; index += 1) {
    const x0 = columns[index] ?? minX;
    const x1 = columns[index + 1] ?? maxX;
    if (x1 - x0 < 0.01) continue;
    const mid = (x0 + x1) / 2;
    const blocking = holes
      .filter((hole) => mid > hole.minX && mid < hole.maxX)
      .map((hole) => ({ minZ: hole.minZ, maxZ: hole.maxZ }))
      .sort((a, b) => a.minZ - b.minZ);
    let cursor = minZ;
    for (const hole of blocking) {
      if (hole.minZ > cursor + 0.01) result.push({ minX: x0, maxX: x1, minZ: cursor, maxZ: hole.minZ });
      cursor = Math.max(cursor, hole.maxZ);
    }
    if (cursor < maxZ - 0.01) result.push({ minX: x0, maxX: x1, minZ: cursor, maxZ });
  }
  return result;
}

const SLAB = 0.3;

/** Rapier colliders for a building shell in building-local space. */
export function buildingColliders(layout: BuildingLayout, pieceId?: string): PropCollider[] {
  const colliders: PropCollider[] = [];
  const t = layout.wallThickness;
  const halfW = layout.width / 2;
  const halfD = layout.depth / 2;
  const options = pieceId ? { pieceId } : {};

  if (layout.plinth > 0.05) {
    colliders.push(boxCollider(halfW + 0.25, layout.plinth / 2, halfD + 0.25, 0, layout.plinth / 2, 0, options));
  }

  layout.floors.forEach((floor, index) => {
    // Floor slab (ground floor sits on the plinth; upper floors keep stairwells open).
    const holes =
      index === 0
        ? []
        : layout.stairwells.map((well) => ({
            minX: well.center.x - well.size.x / 2,
            maxX: well.center.x + well.size.x / 2,
            minZ: well.center.z - well.size.z / 2,
            maxZ: well.center.z + well.size.z / 2,
          }));
    const holesForFloor = holes.filter((hole) => stairwellBelongsToFloor(layout, index, hole));
    for (const rect of slabRects(-halfW + t * 0.5, halfW - t * 0.5, -halfD + t * 0.5, halfD - t * 0.5, holesForFloor)) {
      colliders.push(
        boxCollider(
          (rect.maxX - rect.minX) / 2,
          SLAB / 2,
          (rect.maxZ - rect.minZ) / 2,
          (rect.minX + rect.maxX) / 2,
          floor.elevation - SLAB / 2,
          (rect.minZ + rect.maxZ) / 2,
          { surface: 'wood', ...options },
        ),
      );
    }
    // Walls with real door gaps.
    for (const span of wallSpans(layout, floor, false)) {
      const length = span.to - span.from;
      const height = span.top - span.bottom;
      if (length < 0.05 || height < 0.05) continue;
      const along = (span.from + span.to) / 2;
      const y = floor.elevation + (span.bottom + span.top) / 2;
      if (span.side === 'front' || span.side === 'back') {
        const z = span.side === 'front' ? halfD - t / 2 : -halfD + t / 2;
        colliders.push(boxCollider(length / 2, height / 2, t / 2, along, y, z, options));
      } else {
        const x = span.side === 'right' ? halfW - t / 2 : -halfW + t / 2;
        colliders.push(boxCollider(t / 2, height / 2, length / 2, x, y, along, options));
      }
    }
  });

  for (const flight of layout.stairs) {
    colliders.push(rampCollider(flight.from, flight.to, flight.width, 0.35, { surface: 'wood', ...options }));
  }

  // Railings around stairwell holes on upper floors (open on the stair's arrival side).
  layout.floors.forEach((floor, index) => {
    if (index === 0) return;
    for (const well of layout.stairwells) {
      const hole = {
        minX: well.center.x - well.size.x / 2,
        maxX: well.center.x + well.size.x / 2,
        minZ: well.center.z - well.size.z / 2,
        maxZ: well.center.z + well.size.z / 2,
      };
      if (!stairwellBelongsToFloor(layout, index, hole)) continue;
      const rail = 0.5;
      const y = floor.elevation + rail;
      // Rail along the long side facing the room; the arrival end stays open.
      const innerX = well.center.x + (well.center.x < 0 ? 1 : -1) * (well.size.x / 2 + 0.05);
      colliders.push(boxCollider(0.05, rail, well.size.z / 2, innerX, y, well.center.z, options));
    }
  });

  const balcony = layout.balcony;
  if (balcony) {
    const floor = layout.floors[balcony.floor];
    if (floor) {
      const y = floor.elevation;
      const d = balcony.depth;
      const rail = balcony.railHeight;
      for (const side of balcony.sides) {
        if (side === 'front' || side === 'back') {
          const sign = side === 'front' ? 1 : -1;
          const z = sign * (halfD + d / 2);
          const wraps = balcony.sides.includes('left') || balcony.sides.includes('right');
          const extra = wraps ? d : 0;
          colliders.push(boxCollider(halfW + extra, SLAB / 2, d / 2, 0, y - SLAB / 2, z, { surface: 'wood', ...options }));
          colliders.push(boxCollider(halfW + extra, rail / 2, 0.06, 0, y + rail / 2, sign * (halfD + d - 0.06), options));
        } else {
          const sign = side === 'right' ? 1 : -1;
          const x = sign * (halfW + d / 2);
          colliders.push(boxCollider(d / 2, SLAB / 2, halfD, x, y - SLAB / 2, 0, { surface: 'wood', ...options }));
          colliders.push(boxCollider(0.06, rail / 2, halfD + d, sign * (halfW + d - 0.06), y + rail / 2, 0, options));
        }
        // End rails when the balcony does not wrap around a corner.
        if ((side === 'front' || side === 'back') && !balcony.sides.includes('left') && !balcony.sides.includes('right')) {
          const sign = side === 'front' ? 1 : -1;
          for (const end of [-1, 1]) {
            colliders.push(boxCollider(0.06, rail / 2, d / 2, end * (halfW - 0.06), y + rail / 2, sign * (halfD + d / 2), options));
          }
        }
      }
    }
  }

  const top = roofBase(layout);
  if (layout.roof.kind === 'flat') {
    const holes = layout.stairwells
      .map((well) => ({
        minX: well.center.x - well.size.x / 2,
        maxX: well.center.x + well.size.x / 2,
        minZ: well.center.z - well.size.z / 2,
        maxZ: well.center.z + well.size.z / 2,
      }))
      .filter((hole) => stairwellBelongsToFloor(layout, layout.floors.length, hole));
    for (const rect of slabRects(-halfW, halfW, -halfD, halfD, holes)) {
      colliders.push(
        boxCollider(
          (rect.maxX - rect.minX) / 2,
          SLAB / 2,
          (rect.maxZ - rect.minZ) / 2,
          (rect.minX + rect.maxX) / 2,
          top - SLAB / 2,
          (rect.minZ + rect.maxZ) / 2,
          { surface: 'wood', ...options },
        ),
      );
    }
    const parapet = 1.15;
    colliders.push(boxCollider(halfW, parapet / 2, 0.12, 0, top + parapet / 2, halfD - 0.12, options));
    colliders.push(boxCollider(halfW, parapet / 2, 0.12, 0, top + parapet / 2, -halfD + 0.12, options));
    colliders.push(boxCollider(0.12, parapet / 2, halfD, halfW - 0.12, top + parapet / 2, 0, options));
    colliders.push(boxCollider(0.12, parapet / 2, halfD, -halfW + 0.12, top + parapet / 2, 0, options));
  } else if (layout.roof.kind === 'barrel') {
    // Barrel vault (hangar): a low solid hump over the walls.
    const rise = layout.width * 0.22;
    colliders.push(boxCollider(halfW + layout.roof.overhang, rise / 2, halfD + layout.roof.overhang, 0, top + rise / 2, 0, options));
  } else {
    // Pitched roofs: the ridge runs front-to-back (local Z) so the gable faces the front.
    const overhang = layout.roof.overhang;
    const pitch = layout.roof.pitch;
    const run = halfW + overhang;
    const rise = Math.tan(pitch) * run;
    for (const sign of [1, -1]) {
      const from = { x: 0, y: top + rise, z: 0 };
      const to = { x: sign * run, y: top, z: 0 };
      colliders.push(rampCollider(from, to, layout.depth + overhang * 2, 0.4, options));
    }
    // Attic fill so the roof void is solid from the outside.
    colliders.push(boxCollider(halfW * 0.5, rise / 3, halfD, 0, top + rise / 3, 0, options));
  }
  return colliders;
}

/** Elevation of the roof base (top of the highest storey). */
export function roofBase(layout: BuildingLayout): number {
  const last = layout.floors[layout.floors.length - 1];
  if (!last) return 3;
  return last.elevation + last.height + SLAB;
}

/** Each stairwell is assigned to the floor its stair flight arrives at. */
function stairwellBelongsToFloor(
  layout: BuildingLayout,
  floorIndex: number,
  hole: { minX: number; maxX: number; minZ: number; maxZ: number },
): boolean {
  const elevation =
    floorIndex < layout.floors.length ? (layout.floors[floorIndex]?.elevation ?? 0) : roofBase(layout);
  return layout.stairs.some((flight) => {
    const arrives = Math.abs(Math.max(flight.from.y, flight.to.y) - elevation) < 0.4;
    const cx = (flight.from.x + flight.to.x) / 2;
    const cz = (flight.from.z + flight.to.z) / 2;
    const inside = cx >= hole.minX - 0.2 && cx <= hole.maxX + 0.2 && cz >= hole.minZ - 2 && cz <= hole.maxZ + 2;
    return arrives && inside;
  });
}

// ---------------------------------------------------------------------------
// Authored layouts
// ---------------------------------------------------------------------------

function window(wall: WallSide, offset: number, width = 1.3, height = 1.3, sill = 0.95): WallOpening {
  return { wall, offset, width, height, sill, kind: 'window' };
}

function door(wall: WallSide, offset: number, width = 1.7, height = 2.45): WallOpening {
  return { wall, offset, width, height, sill: 0, kind: 'door' };
}

/** Straight stair rising along local −Z from `startZ` at `fromY` to `toY`. */
function stairAlongZ(x: number, startZ: number, fromY: number, toY: number, width: number, direction = -1): StairFlight {
  const run = (toY - fromY) / Math.tan((34 * Math.PI) / 180);
  return {
    from: { x, y: fromY, z: startZ },
    to: { x, y: toY, z: startZ + direction * run },
    width,
  };
}

function stairwellFor(flight: StairFlight): { center: { x: number; z: number }; size: { x: number; z: number } } {
  const minZ = Math.min(flight.from.z, flight.to.z);
  const maxZ = Math.max(flight.from.z, flight.to.z);
  return {
    center: { x: flight.from.x, z: (minZ + maxZ) / 2 },
    size: { x: flight.width + 0.3, z: maxZ - minZ + 0.7 },
  };
}

export interface ChaletOptions {
  style: BuildingStyle;
  width: number;
  depth: number;
  nameKey?: string;
  snow: boolean;
  doorOffset: number;
}

/** Two-storey enterable chalet: ground floor, interior stair, upper floor and front balcony. */
export function chaletLayout(options: ChaletOptions): BuildingLayout {
  const t = 0.45;
  const plinth = 0.45;
  const groundHeight = 3.3;
  const upperElevation = plinth + groundHeight + SLAB;
  const halfW = options.width / 2;
  const halfD = options.depth / 2;
  const stairX = -halfW + t + 0.75;
  const flight = stairAlongZ(stairX, halfD - t - 0.9, plinth, upperElevation, 1.3);
  const windowsFront = [-halfW + 2.2, halfW - 2.2].filter((offset) => Math.abs(offset - options.doorOffset) > 2);
  const ground: BuildingFloor = {
    elevation: plinth,
    height: groundHeight,
    openings: [
      door('front', options.doorOffset),
      ...windowsFront.map((offset) => window('front', offset)),
      window('back', -halfW + 2.5),
      window('back', halfW - 2.5),
      window('left', -halfD + 2.2),
      window('right', 0),
      door('right', halfD - 2.0, 1.4, 2.35),
    ],
  };
  const upper: BuildingFloor = {
    elevation: upperElevation,
    height: 3.0,
    openings: [
      door('front', 0.8, 1.5, 2.3),
      window('front', -halfW + 2.2),
      window('front', halfW - 1.8),
      window('back', 0),
      window('left', 0.5),
      window('right', -0.5),
    ],
  };
  return {
    style: options.style,
    width: options.width,
    depth: options.depth,
    wallThickness: t,
    plinth,
    floors: [ground, upper],
    stairs: [flight],
    stairwells: [stairwellFor(flight)],
    balcony: { floor: 1, depth: 1.7, sides: ['front'], railHeight: 1.05 },
    roof: { kind: 'gable', pitch: (27 * Math.PI) / 180, overhang: 1.25, snow: options.snow },
    ...(options.nameKey ? { nameKey: options.nameKey } : {}),
  };
}

export function beachBarLayout(nameKey: string): BuildingLayout {
  return {
    style: 'beach_bar',
    width: 9,
    depth: 7,
    wallThickness: 0.3,
    plinth: 0.35,
    floors: [
      {
        elevation: 0.35,
        height: 3.1,
        openings: [
          { wall: 'front', offset: -0.6, width: 5.4, height: 1.35, sill: 1.05, kind: 'counter' },
          door('right', 1.2, 1.4, 2.3),
          door('left', -1.2, 1.4, 2.3),
          window('back', 2, 1.6, 1.0, 1.2),
        ],
      },
    ],
    stairs: [],
    stairwells: [],
    roof: { kind: 'thatch', pitch: (30 * Math.PI) / 180, overhang: 1.4, snow: false },
    nameKey,
  };
}

export function fisherHutLayout(): BuildingLayout {
  return {
    style: 'fisher_hut',
    width: 5.6,
    depth: 4.6,
    wallThickness: 0.25,
    plinth: 0,
    floors: [{ elevation: 0, height: 2.7, openings: [door('front', 0.6, 1.3, 2.2), window('left', 0, 1, 0.9, 1.1)] }],
    stairs: [],
    stairwells: [],
    roof: { kind: 'gable', pitch: (24 * Math.PI) / 180, overhang: 0.6, snow: false },
  };
}

export function sideHutLayout(nameKey: string): BuildingLayout {
  return {
    style: 'side_hut',
    width: 8.4,
    depth: 6.6,
    wallThickness: 0.42,
    plinth: 0.35,
    floors: [
      {
        elevation: 0.35,
        height: 3.2,
        openings: [door('front', 1.2), window('front', -2.2), window('left', 0), window('right', 0), window('back', 0)],
      },
    ],
    stairs: [],
    stairwells: [],
    roof: { kind: 'gable', pitch: (30 * Math.PI) / 180, overhang: 1.0, snow: true },
    nameKey,
  };
}

/**
 * Tower C: three-storey cuckoo-clock fortress. Ground floor (+55) with cheese
 * storage, first floor (+60) with a wrap-around slit balcony, roof deck (+65)
 * with parapet and the clock house carrying the snow cannon.
 */
export function dairyFortressLayout(): BuildingLayout {
  const width = 24;
  const depth = 18;
  const t = 0.55;
  const halfW = width / 2;
  const halfD = depth / 2;
  const firstFlight = stairAlongZ(-halfW + t + 0.9, halfD - t - 1.2, 0, 5, 1.6);
  const roofFlight = stairAlongZ(halfW - t - 0.9, -halfD + t + 1.2, 5, 10, 1.6, 1);
  return {
    style: 'dairy_fortress',
    width,
    depth,
    wallThickness: t,
    plinth: 0,
    floors: [
      {
        elevation: 0,
        height: 4.7,
        openings: [
          door('front', 0, 2.6, 3.1),
          door('left', -2, 1.8, 2.6),
          door('right', 2, 1.8, 2.6),
          door('back', 4, 1.8, 2.6),
          window('front', -7, 1.5, 1.4, 1.2),
          window('front', 7, 1.5, 1.4, 1.2),
          window('back', -5, 1.5, 1.4, 1.2),
        ],
      },
      {
        elevation: 5,
        height: 4.7,
        openings: [
          door('front', -4.5, 1.6, 2.4),
          door('front', 4.5, 1.6, 2.4),
          door('back', 0, 1.6, 2.4),
          door('left', 2.5, 1.6, 2.4),
          door('right', -2.5, 1.6, 2.4),
          window('front', 0, 1.8, 1.4, 1.1),
          window('back', -7, 1.4, 1.3, 1.1),
          window('back', 7, 1.4, 1.3, 1.1),
        ],
      },
    ],
    stairs: [firstFlight, roofFlight],
    stairwells: [stairwellFor(firstFlight), stairwellFor(roofFlight)],
    balcony: { floor: 1, depth: 2.6, sides: ['front', 'back', 'left', 'right'], railHeight: 1.2 },
    roof: { kind: 'flat', pitch: 0, overhang: 0.4, snow: true },
    nameKey: 'world.buildings.summitDairy',
  };
}

export function hangarLayout(): BuildingLayout {
  return {
    style: 'hangar',
    width: 26,
    depth: 20,
    wallThickness: 0.6,
    plinth: 0.2,
    floors: [{ elevation: 0.2, height: 8.6, openings: [door('front', 0, 19, 7.6), door('back', -8, 1.6, 2.5)] }],
    stairs: [],
    stairwells: [],
    roof: { kind: 'barrel', pitch: 0, overhang: 0.8, snow: true },
  };
}

export function bambooGarageLayout(): BuildingLayout {
  return {
    style: 'bamboo_garage',
    width: 18,
    depth: 13,
    wallThickness: 0.45,
    plinth: 0.2,
    floors: [{ elevation: 0.2, height: 5.6, openings: [door('front', 0, 13.5, 5), door('back', 5, 1.5, 2.4)] }],
    stairs: [],
    stairwells: [],
    roof: { kind: 'thatch', pitch: (26 * Math.PI) / 180, overhang: 1.4, snow: false },
  };
}
