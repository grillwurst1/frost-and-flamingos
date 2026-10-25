/**
 * Authored structures of Fjord Fiesta: the three weather towers, the great
 * suspension bridge, the harbour piers, faction bases, cable-car / T-bar /
 * coaster infrastructure and the village dressing. Every entry carries its
 * own colliders in prop-local space; the client renders the same entries.
 */
import type { Vec3 } from '../../types/index.js';
import type { BuildingLayout, MapPropKind, PropCollider, SurfaceTag } from '../../types/map.js';
import {
  beachBarLayout,
  boxCollider,
  buildingColliders,
  chaletLayout,
  cylinderCollider,
  dairyFortressLayout,
  fisherHutLayout,
  hangarLayout,
  bambooGarageLayout,
  prismCollider,
  rampCollider,
  stairCollider,
  sideHutLayout,
  sphereCollider,
} from './buildings.js';
import {
  ALPINE_BASE_POSITION,
  BRIDGE_NORTH,
  BRIDGE_SOUTH,
  BRIDGE_WIDTH,
  CABLE_CAR_STATIONS,
  CABLE_STATION_YAWS,
  GLACIER_RUNWAY,
  GORGE,
  GORGE_TRAIL_WIDTH,
  GORGE_TRAILS,
  GORGE_WALKWAY_HEIGHT,
  HARBOR_DECK_HEIGHT,
  HARBOR_PLATFORM_RADIUS,
  ICE_PATCH_LAYOUT,
  LAGOON_BASE_POSITION,
  STONE_ARCH,
  TANK_ROAD_POINTS,
  TOWER_A_POSITION,
  TOWER_B_POSITION,
  TOWER_C_POSITION,
  VILLAGE_HEIGHT,
  WATERFALL,
  WATER_RUNWAY,
} from './layout.js';
import { lerp, localToWorld, projectOnPolyline, resampleLinear, rotateY, vec3, yawTowards } from './math.js';
import { FJORD_ROUTES } from './routes.js';
import { sampleMapHeight } from './terrain.js';

export interface PropSeed {
  id: string;
  kind: MapPropKind;
  x: number;
  z: number;
  /** Anchor height; defaults to the terrain height. */
  y?: number;
  rotationY?: number;
  scale?: number;
  variant?: number;
  dimensions?: Vec3;
  building?: BuildingLayout;
  path?: Vec3[];
  colliders?: PropCollider[];
  destructibleId?: string;
  surface?: SurfaceTag;
}

const ground = (x: number, z: number): number => sampleMapHeight(x, z);

function building(
  id: string,
  kind: MapPropKind,
  layout: BuildingLayout,
  x: number,
  z: number,
  rotationY: number,
  options: { y?: number; destructibleId?: string; variant?: number; extra?: PropCollider[] } = {},
): PropSeed {
  return {
    id,
    kind,
    x,
    z,
    y: options.y ?? ground(x, z),
    rotationY,
    variant: options.variant ?? 0,
    building: layout,
    dimensions: { x: layout.width, y: 0, z: layout.depth },
    colliders: [...buildingColliders(layout, options.destructibleId), ...(options.extra ?? [])],
    ...(options.destructibleId ? { destructibleId: options.destructibleId } : {}),
  };
}

function crateStack(id: string, x: number, z: number, rotationY: number, variant: number, y?: number): PropSeed {
  const height = variant % 3 === 0 ? 2.4 : variant % 3 === 1 ? 1.2 : 1.8;
  return {
    id,
    kind: 'crate_stack',
    x,
    z,
    y: y ?? ground(x, z),
    rotationY,
    variant,
    colliders: [boxCollider(1.25, height / 2, 0.75, 0, height / 2, 0)],
  };
}

function barrel(id: string, x: number, z: number, variant: number, y?: number): PropSeed {
  return {
    id,
    kind: 'barrel',
    x,
    z,
    y: y ?? ground(x, z),
    rotationY: variant * 1.3,
    variant,
    colliders: [cylinderCollider(0.5, 0.65, 0, 0.65, 0)],
  };
}

function simple(
  id: string,
  kind: MapPropKind,
  x: number,
  z: number,
  rotationY: number,
  variant = 0,
  colliders: PropCollider[] = [],
  y?: number,
  scale = 1,
): PropSeed {
  return { id, kind, x, z, y: y ?? ground(x, z), rotationY, variant, colliders, scale };
}

function polylineProp(id: string, kind: MapPropKind, path: Vec3[], variant = 0, colliders: PropCollider[] = []): PropSeed {
  const first = path[0] ?? vec3(0, 0, 0);
  return { id, kind, x: first.x, z: first.z, y: first.y, rotationY: 0, variant, path, colliders };
}

/** Low wall along a straight XZ line with one collider per segment, anchored at the origin. */
function stoneWall(id: string, ax: number, az: number, bx: number, bz: number, height = 1.05, variant = 0): PropSeed {
  const length = Math.hypot(bx - ax, bz - az);
  const yaw = Math.atan2(bx - ax, bz - az);
  const steps = Math.max(1, Math.ceil(length / 8));
  const path: Vec3[] = [];
  const colliders: PropCollider[] = [];
  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps;
    const x = lerp(ax, bx, t);
    const z = lerp(az, bz, t);
    path.push(vec3(x, ground(x, z), z));
  }
  const origin = path[0] ?? vec3(ax, 0, az);
  for (let index = 0; index + 1 < path.length; index += 1) {
    const a = path[index];
    const b = path[index + 1];
    if (!a || !b) continue;
    const segment = Math.hypot(b.x - a.x, b.z - a.z);
    const localCenter = rotateY((a.x + b.x) / 2 - origin.x, (a.z + b.z) / 2 - origin.z, -yaw);
    colliders.push(
      boxCollider(0.45, height / 2, segment / 2 + 0.05, localCenter.x, (a.y + b.y) / 2 - origin.y + height / 2 - 0.1, localCenter.z, {
        surface: 'cobblestone',
      }),
    );
  }
  return { id, kind: 'stone_wall', x: origin.x, z: origin.z, y: origin.y, rotationY: yaw, variant, path, colliders };
}

// ---------------------------------------------------------------------------
// Tower A — Lagoon Harbor
// ---------------------------------------------------------------------------

export type PierId = 'pier_ne' | 'pier_e' | 'pier_s' | 'pier_w';

export interface PierLayout {
  id: PierId;
  yaw: number;
  start: Vec3;
  length: number;
  landing: boolean;
}

const PIER_WIDTH = 4.5;
const PIER_SEGMENT = 6;
const PLATFORM_APOTHEM = HARBOR_PLATFORM_RADIUS * Math.cos(Math.PI / 8);

function pierLength(start: Vec3, yaw: number, minimum: number, maximum: number): { length: number; landing: boolean } {
  const dx = Math.sin(yaw);
  const dz = Math.cos(yaw);
  for (let s = minimum; s <= maximum; s += 0.5) {
    if (ground(start.x + dx * s, start.z + dz * s) >= 0.5) return { length: s + 1, landing: true };
  }
  return { length: maximum, landing: false };
}

function makePierLayouts(): PierLayout[] {
  const A = TOWER_A_POSITION;
  const definitions: { id: PierId; yaw: number; min: number; max: number; fixed?: number }[] = [
    { id: 'pier_ne', yaw: Math.PI / 4, min: 13, max: 60 },
    { id: 'pier_e', yaw: Math.PI / 2, min: 13, max: 60 },
    { id: 'pier_s', yaw: Math.PI + 0.18, min: 13, max: 50 },
    { id: 'pier_w', yaw: -Math.PI / 2, min: 13, max: 26, fixed: 24 },
  ];
  return definitions.map((definition) => {
    const start = vec3(
      A.x + Math.sin(definition.yaw) * (PLATFORM_APOTHEM - 0.4),
      HARBOR_DECK_HEIGHT,
      A.z + Math.cos(definition.yaw) * (PLATFORM_APOTHEM - 0.4),
    );
    const span =
      definition.fixed !== undefined
        ? { length: definition.fixed, landing: false }
        : pierLength(start, definition.yaw, definition.min, definition.max);
    return { id: definition.id, yaw: definition.yaw, start, length: span.length, landing: span.landing };
  });
}

export const PIER_LAYOUTS: readonly PierLayout[] = makePierLayouts();

function pierDeck(from: number, to: number): PropCollider {
  return boxCollider(PIER_WIDTH / 2, 0.18, (to - from) / 2, 0, -0.18, (from + to) / 2, { surface: 'wood' });
}

function harborSeeds(): PropSeed[] {
  const A = TOWER_A_POSITION;
  const seeds: PropSeed[] = [];
  seeds.push({
    id: 'tower_a_platform',
    kind: 'harbor_platform',
    x: A.x,
    z: A.z,
    y: HARBOR_DECK_HEIGHT,
    rotationY: 0,
    dimensions: { x: HARBOR_PLATFORM_RADIUS, y: 0.6, z: HARBOR_PLATFORM_RADIUS },
    surface: 'wood',
    colliders: [prismCollider(8, HARBOR_PLATFORM_RADIUS, 0.3, 0, -0.3, 0, { surface: 'wood' })],
  });

  // Lighthouse: tower, 14 m gallery, lantern and a half-turn exterior spiral stair.
  const lighthouse: PropCollider[] = [
    cylinderCollider(4.3, LIGHTHOUSE.galleryHeight / 2, 0, LIGHTHOUSE.galleryHeight / 2, 0),
    cylinderCollider(LIGHTHOUSE.galleryRadius, 0.15, 0, LIGHTHOUSE.galleryHeight - 0.15, 0, { surface: 'wood' }),
    cylinderCollider(3.2, (LIGHTHOUSE.lanternHeight + LIGHTHOUSE.domeHeight) / 2, 0, LIGHTHOUSE.galleryHeight + (LIGHTHOUSE.lanternHeight + LIGHTHOUSE.domeHeight) / 2, 0),
  ];
  const spiralStart = LIGHTHOUSE.spiralStart;
  const spiralSweep = LIGHTHOUSE.spiralSweep;
  const spiralRadius = LIGHTHOUSE.spiralRadius;
  const steps = 10;
  for (let index = 0; index < steps; index += 1) {
    const a0 = spiralStart + (index / steps) * spiralSweep;
    const a1 = spiralStart + ((index + 1) / steps) * spiralSweep;
    lighthouse.push(
      rampCollider(
        vec3(Math.sin(a0) * spiralRadius, (index / steps) * 14, Math.cos(a0) * spiralRadius),
        vec3(Math.sin(a1) * spiralRadius, ((index + 1) / steps) * 14, Math.cos(a1) * spiralRadius),
        2.1,
        0.3,
        { surface: 'wood' },
      ),
    );
  }
  const topAngle = spiralStart + spiralSweep;
  lighthouse.push(
    boxCollider(1.3, 0.15, 1.3, Math.sin(topAngle + 0.12) * 6.6, 13.85, Math.cos(topAngle + 0.12) * 6.6, { surface: 'wood' }),
  );
  // Gallery railing with a gap where the stair arrives.
  for (let index = 0; index < 14; index += 1) {
    const angle = (index / 14) * Math.PI * 2;
    const difference = Math.abs(((angle - topAngle + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    if (difference < 0.38) continue;
    lighthouse.push(
      boxCollider(1.45, 0.55, 0.06, Math.sin(angle) * 6.2, 14.55, Math.cos(angle) * 6.2, {
        rotation: { x: 0, y: angle + Math.PI / 2, z: 0 },
      }),
    );
  }
  seeds.push({
    id: 'tower_a_lighthouse',
    kind: 'lighthouse',
    x: A.x,
    z: A.z,
    y: HARBOR_DECK_HEIGHT,
    rotationY: 0,
    dimensions: { x: 4.5, y: 22, z: spiralStart },
    colliders: lighthouse,
  });

  // Piers with two destructible 6 m segments each, plus landings to the beach.
  for (const pier of PIER_LAYOUTS) {
    for (const segment of [1, 2] as const) {
      const from = (segment - 1) * PIER_SEGMENT;
      const start = localToWorld(pier.start, pier.yaw, vec3(0, 0, from));
      seeds.push({
        id: `${pier.id}_seg${segment}`,
        kind: 'pier',
        x: start.x,
        z: start.z,
        y: HARBOR_DECK_HEIGHT,
        rotationY: pier.yaw,
        variant: 1,
        dimensions: { x: PIER_WIDTH, y: 0.36, z: PIER_SEGMENT },
        destructibleId: `${pier.id}_seg${segment}`,
        surface: 'wood',
        colliders: [
          boxCollider(PIER_WIDTH / 2, 0.18, PIER_SEGMENT / 2, 0, -0.18, PIER_SEGMENT / 2, {
            surface: 'wood',
            pieceId: `${pier.id}_seg${segment}`,
          }),
        ],
      });
    }
    const restFrom = PIER_SEGMENT * 2;
    const restStart = localToWorld(pier.start, pier.yaw, vec3(0, 0, restFrom));
    const restLength = pier.length - restFrom;
    const colliders: PropCollider[] = [pierDeck(0, restLength)];
    if (pier.landing) {
      const end = localToWorld(pier.start, pier.yaw, vec3(0, 0, pier.length + 3.5));
      colliders.push(
        rampCollider(vec3(0, 0, restLength - 0.2), vec3(0, ground(end.x, end.z) - HARBOR_DECK_HEIGHT + 0.05, restLength + 3.5), PIER_WIDTH, 0.3, {
          surface: 'wood',
        }),
      );
    }
    if (pier.id === 'pier_w') {
      // T-head deck for the fisher huts and the rowboat moorings.
      colliders.push(boxCollider(7, 0.18, 4, 0, -0.18, restLength + 3.6, { surface: 'wood' }));
    }
    seeds.push({
      id: `${pier.id}_rest`,
      kind: 'pier',
      x: restStart.x,
      z: restStart.z,
      y: HARBOR_DECK_HEIGHT,
      rotationY: pier.yaw,
      variant: pier.landing ? 2 : pier.id === 'pier_w' ? 3 : 0,
      dimensions: { x: PIER_WIDTH, y: 0.36, z: restLength },
      surface: 'wood',
      colliders,
    });
  }

  // Fisher huts on the west pier head.
  const west = PIER_LAYOUTS.find((pier) => pier.id === 'pier_w');
  if (west) {
    for (const side of [-1, 1]) {
      const local = vec3(side * 4.4, 0, west.length + 3.4);
      const position = localToWorld(west.start, west.yaw, local);
      seeds.push(
        building(`fisher_hut_${side < 0 ? 'a' : 'b'}`, 'fisher_hut', fisherHutLayout(), position.x, position.z, west.yaw + (side < 0 ? Math.PI / 2 : -Math.PI / 2), {
          y: HARBOR_DECK_HEIGHT,
          variant: side < 0 ? 0 : 1,
        }),
      );
    }
  }

  // Beach bars (destructible) at the beach transition.
  seeds.push(
    building('beach_bar_north', 'beach_bar', beachBarLayout('world.buildings.coconutShack'), -173, -137, yawTowards({ x: -173, z: -137 }, A), {
      destructibleId: 'building_beach_bar_north',
      variant: 0,
    }),
  );
  seeds.push(
    building('beach_bar_east', 'beach_bar', beachBarLayout('world.buildings.flamingoBar'), -138, -191, yawTowards({ x: -138, z: -191 }, A), {
      destructibleId: 'building_beach_bar_east',
      variant: 1,
    }),
  );

  // Four life-size pink flamingos on the platform corners.
  for (let index = 0; index < 4; index += 1) {
    const angle = Math.PI / 8 + (index * Math.PI) / 2 + Math.PI / 4;
    const x = A.x + Math.sin(angle) * 14.2;
    const z = A.z + Math.cos(angle) * 14.2;
    seeds.push(simple(`flamingo_statue_${index}`, 'flamingo_statue', x, z, angle + Math.PI, index, [cylinderCollider(0.7, 1.7, 0, 1.7, 0)], HARBOR_DECK_HEIGHT, 1.3));
  }

  // Platform dressing: crates, barrels and coconut pressure silos.
  const deckItem = (angle: number, radius: number): [number, number] => [A.x + Math.sin(angle) * radius, A.z + Math.cos(angle) * radius];
  [1.95, 3.53, 5.1, 0.42].forEach((angle, index) => {
    const [x, z] = deckItem(angle, 15.2);
    seeds.push(crateStack(`harbor_crates_${index}`, x, z, angle, index % 3, HARBOR_DECK_HEIGHT));
  });
  [140, 300, 8].map((degrees) => (degrees * Math.PI) / 180).forEach((angle, index) => {
    const [x, z] = deckItem(angle, 15.6);
    seeds.push(barrel(`harbor_barrel_${index}`, x, z, index, HARBOR_DECK_HEIGHT));
  });

  // Bunting from the gallery to the platform corners (visual only).
  for (let index = 0; index < 8; index += 1) {
    const angle = (index / 8) * Math.PI * 2 + Math.PI / 8;
    seeds.push(
      polylineProp(`harbor_bunting_${index}`, 'bunting', [
        vec3(A.x + Math.sin(angle) * 5.8, HARBOR_DECK_HEIGHT + 15.2, A.z + Math.cos(angle) * 5.8),
        vec3(A.x + Math.sin(angle) * 17.2, HARBOR_DECK_HEIGHT + 4.6, A.z + Math.cos(angle) * 17.2),
      ], index),
    );
    seeds.push(
      simple(`harbor_pole_${index}`, 'flag', A.x + Math.sin(angle) * 17.2, A.z + Math.cos(angle) * 17.2, angle, 3, [cylinderCollider(0.14, 2.4, 0, 2.4, 0)], HARBOR_DECK_HEIGHT),
    );
  }

  // Stairs down into the water so swimmers can climb back onto the decks.
  const exits: { id: string; origin: Vec3; yaw: number }[] = [];
  if (west) {
    exits.push({ id: 'harbor_steps_west', origin: localToWorld(west.start, west.yaw, vec3(0, 0, west.length + 7.6)), yaw: west.yaw });
  }
  for (const [index, angle] of [-Math.PI / 4 - Math.PI / 2, Math.PI * 0.75 - 0.1].entries()) {
    exits.push({
      id: `harbor_steps_${index}`,
      origin: vec3(A.x + Math.sin(angle) * (PLATFORM_APOTHEM - 0.2), HARBOR_DECK_HEIGHT, A.z + Math.cos(angle) * (PLATFORM_APOTHEM - 0.2)),
      yaw: angle,
    });
  }
  for (const exit of exits) {
    seeds.push({
      id: exit.id,
      kind: 'stairs',
      x: exit.origin.x,
      z: exit.origin.z,
      y: HARBOR_DECK_HEIGHT,
      rotationY: exit.yaw,
      variant: 0,
      dimensions: { x: 2.2, y: HARBOR_DECK_HEIGHT + 1.6, z: 5.2 },
      surface: 'wood',
      colliders: [rampCollider(vec3(0, 0, 0), vec3(0, -HARBOR_DECK_HEIGHT - 1.6, 5.2), 2.2, 0.3, { surface: 'wood' })],
    });
  }

  // Mooring bollards on the outer piers (rowboat vehicles spawn next to them).
  for (const pier of PIER_LAYOUTS) {
    if (pier.id === 'pier_ne') continue;
    const at = localToWorld(pier.start, pier.yaw, vec3(PIER_WIDTH / 2 + 0.1, 0, Math.min(pier.length - 3, 17)));
    seeds.push(simple(`${pier.id}_mooring`, 'rowboat_mooring', at.x, at.z, pier.yaw, 0, [], HARBOR_DECK_HEIGHT));
  }
  return seeds;
}

// ---------------------------------------------------------------------------
// Tower B — Village Square, chalets and the great suspension bridge
// ---------------------------------------------------------------------------

/** Tower B centrepiece dimensions (shared by colliders, visuals and attach points). */
export const PAVILION = {
  basinRadius: 5.6,
  basinHeight: 0.85,
  postOffset: 2.35,
  houseBottom: 6.4,
  houseSize: 5.2,
  houseHeight: 4.4,
  roofHeight: 3.6,
} as const;

/** Tower C clock house on the roof deck (building-local). */
export const SUMMIT_CLOCK_HOUSE = {
  center: { x: 0, z: -1.6 },
  width: 10,
  depth: 6.8,
  base: 10,
  height: 8.2,
  roofHeight: 4.2,
} as const;

/** Lighthouse dimensions above the platform deck. */
export const LIGHTHOUSE = {
  baseRadius: 4.6,
  topRadius: 3.5,
  galleryHeight: 14,
  galleryRadius: 6.3,
  lanternHeight: 4.4,
  domeHeight: 3.4,
  spiralRadius: 7.3,
  spiralStart: -Math.PI * 0.62,
  spiralSweep: Math.PI * 1.06,
} as const;

/** Front terraces (depth in metres) of the Alpen-Bistro café and the Tiki-Alm. */
export const CHALET_TERRACES: Readonly<Record<string, number>> = {
  chalet_east: 3.4,
  chalet_south: 3,
};

/** Raised front terrace with railings, a gap and a step at the door. */
function terraceColliders(width: number, depth: number, plinth: number, terraceDepth: number, doorOffset: number, pieceId: string): PropCollider[] {
  const halfW = width / 2;
  const halfD = depth / 2;
  const z0 = halfD;
  const z1 = halfD + terraceDepth;
  const rail = 1.0;
  const gapFrom = doorOffset - 1.1;
  const gapTo = doorOffset + 1.1;
  return [
    boxCollider(halfW, plinth / 2, terraceDepth / 2, 0, plinth / 2, (z0 + z1) / 2, { surface: 'wood', pieceId }),
    boxCollider((gapFrom + halfW) / 2, rail / 2, 0.06, (-halfW + gapFrom) / 2, plinth + rail / 2, z1 - 0.06, { pieceId }),
    boxCollider((halfW - gapTo) / 2, rail / 2, 0.06, (gapTo + halfW) / 2, plinth + rail / 2, z1 - 0.06, { pieceId }),
    boxCollider(0.06, rail / 2, terraceDepth / 2, -halfW + 0.06, plinth + rail / 2, (z0 + z1) / 2, { pieceId }),
    boxCollider(0.06, rail / 2, terraceDepth / 2, halfW - 0.06, plinth + rail / 2, (z0 + z1) / 2, { pieceId }),
    boxCollider(1.1, plinth / 4, 0.4, doorOffset, plinth / 4, z1 + 0.4, { surface: 'wood', pieceId }),
  ];
}

/** Stone step in front of the door so the plinth is a comfortable climb. */
function doorStepColliders(depth: number, plinth: number, doorOffset: number, pieceId: string): PropCollider[] {
  return [boxCollider(1.2, plinth / 4, 0.45, doorOffset, plinth / 4, depth / 2 + 0.7, { surface: 'cobblestone', pieceId })];
}

export const CHALET_PLACEMENTS = [
  { id: 'chalet_west', nameKey: 'world.buildings.gasthof', x: -31, z: -12, rotationY: Math.PI / 2, style: 'log_chalet' as const, doorOffset: 2.6 },
  { id: 'chalet_east', nameKey: 'world.buildings.bistro', x: 31, z: -6, rotationY: -Math.PI / 2, style: 'plaster_chalet' as const, doorOffset: -2.4 },
  { id: 'chalet_south', nameKey: 'world.buildings.tikiAlm', x: -4, z: -31, rotationY: 0, style: 'tiki_chalet' as const, doorOffset: 2.8 },
  { id: 'chalet_north', nameKey: 'world.buildings.bakery', x: -29, z: 31, rotationY: (3 * Math.PI) / 4, style: 'log_chalet' as const, doorOffset: -2.2 },
];

function villageSeeds(): PropSeed[] {
  const seeds: PropSeed[] = [];
  const B = TOWER_B_POSITION;
  // Square wooden clock house on four posts over a round stone fountain.
  const basin: PropCollider[] = [];
  for (let index = 0; index < 14; index += 1) {
    const angle = (index / 14) * Math.PI * 2;
    const r = PAVILION.basinRadius - 0.35;
    basin.push(
      boxCollider(1.3, PAVILION.basinHeight / 2, 0.36, Math.sin(angle) * r, PAVILION.basinHeight / 2, Math.cos(angle) * r, {
        rotation: { x: 0, y: angle + Math.PI / 2, z: 0 },
        surface: 'cobblestone',
      }),
    );
  }
  seeds.push({
    id: 'tower_b_pavilion',
    kind: 'clock_pavilion',
    x: B.x,
    z: B.z,
    y: VILLAGE_HEIGHT,
    rotationY: 0,
    surface: 'cobblestone',
    colliders: [
      ...basin,
      cylinderCollider(0.9, 0.7, 0, 0.7, 0),
      ...[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) =>
          cylinderCollider(0.32, PAVILION.houseBottom / 2, sx * PAVILION.postOffset, PAVILION.houseBottom / 2, sz * PAVILION.postOffset),
        ),
      ),
      boxCollider(
        PAVILION.houseSize / 2,
        PAVILION.houseHeight / 2,
        PAVILION.houseSize / 2,
        0,
        PAVILION.houseBottom + PAVILION.houseHeight / 2,
        0,
      ),
    ],
  });

  for (const placement of CHALET_PLACEMENTS) {
    const layout = chaletLayout({
      style: placement.style,
      width: 13,
      depth: 10,
      nameKey: placement.nameKey,
      snow: placement.style !== 'tiki_chalet',
      doorOffset: placement.doorOffset,
    });
    const destructibleId = `building_${placement.id}`;
    const terrace = CHALET_TERRACES[placement.id];
    const extra = terrace
      ? terraceColliders(layout.width, layout.depth, layout.plinth, terrace, placement.doorOffset, destructibleId)
      : doorStepColliders(layout.depth, layout.plinth, placement.doorOffset, destructibleId);
    seeds.push(
      building(placement.id, 'chalet', layout, placement.x, placement.z, placement.rotationY, {
        y: VILLAGE_HEIGHT,
        destructibleId,
        variant: CHALET_PLACEMENTS.indexOf(placement),
        extra,
      }),
    );
  }

  // Low stone walls around the square with gaps for the bridge, road, lanes and ramp.
  const e = 45.5;
  const walls: [number, number, number, number][] = [
    [-e, e, -9, e],
    [9, e, e, e],
    [e, e, e, 26],
    [e, 3, e, -e],
    [e, -e, 30, -e],
    [11, -e, -34, -e],
    [-e, -36, -e, 0],
    [-e, 19, -e, e],
  ];
  walls.forEach(([ax, az, bx, bz], index) => seeds.push(stoneWall(`square_wall_${index}`, ax, az, bx, bz, 1.05, index)));

  // Two big 1930s tourism billboards on the square.
  seeds.push(billboard('billboard_square_ne', 37, 35, yawTowards({ x: 37, z: 35 }, { x: 0, z: 0 }), 0));
  seeds.push(billboard('billboard_square_sw', -38, -22, yawTowards({ x: -38, z: -22 }, { x: 0, z: 0 }), 1));

  // Crate stacks and barrels as cover.
  const crates: [number, number, number][] = [
    [14, 14, 0],
    [-15, -13, 1],
    [17, -18, 2],
    [-18, 18, 2],
    [24, 30, 1],
    [-36, -38, 0],
    [38, -30, 0],
    [8, -22, 1],
    [-8, 24, 0],
    [-22, -2, 1],
  ];
  crates.forEach(([x, z, variant], index) => seeds.push(crateStack(`square_crates_${index}`, x, z, index * 0.9, variant, VILLAGE_HEIGHT)));
  ([
    [16, 16.5],
    [-16.5, -15],
    [26, -36],
    [-40, 36],
    [40, 12],
  ] as const).forEach(([x, z], index) => seeds.push(barrel(`square_barrel_${index}`, x, z, index, VILLAGE_HEIGHT)));

  // Market stalls, well, maypole, benches, lanterns, flower carts and signposts.
  ([
    [18, 2, -Math.PI / 2, 0],
    [-16, -26, 0, 1],
    [14, 30, Math.PI, 2],
  ] as const).forEach(([x, z, yaw, variant], index) =>
    seeds.push(simple(`market_stall_${index}`, 'flower_cart', x, z, yaw, variant, [boxCollider(1.6, 0.6, 0.9, 0, 0.6, 0)], VILLAGE_HEIGHT)),
  );
  seeds.push(simple('village_well', 'well', -14, 12, 0.3, 0, [cylinderCollider(1.25, 0.5, 0, 0.5, 0)], VILLAGE_HEIGHT));
  seeds.push(simple('village_maypole', 'flag', 20, 22, 0, 1, [cylinderCollider(0.32, 6, 0, 6, 0)], VILLAGE_HEIGHT));
  // The palm leaning over the Tiki-Alm's back (survives the building).
  seeds.push(simple('tiki_alm_palm', 'palm', -9, -38.6, 0.6, 1, [cylinderCollider(0.37, 1.76, 0, 1.76, 0)], VILLAGE_HEIGHT, 1.1));
  const benches: [number, number, number][] = [
    [9, 9, Math.PI * 1.25],
    [-9, 9, Math.PI * 0.75],
    [9, -9, Math.PI * 1.75],
    [-9, -9, Math.PI * 0.25],
    [-26, 40, Math.PI],
    [30, -40, 0],
  ];
  benches.forEach(([x, z, yaw], index) =>
    seeds.push(simple(`square_bench_${index}`, 'bench', x, z, yaw, index % 2, [boxCollider(1, 0.25, 0.3, 0, 0.25, 0)], VILLAGE_HEIGHT)),
  );
  const lanterns: [number, number][] = [
    [9.5, 9.5],
    [-9.5, 9.5],
    [9.5, -9.5],
    [-9.5, -9.5],
    [40, 40],
    [-40, -40],
    [40, -40],
    [-41, 41],
    [6, 44],
    [-6, 44],
    [44, 6],
    [-44, -4],
  ];
  lanterns.forEach(([x, z], index) =>
    seeds.push(simple(`square_lantern_${index}`, 'lantern', x, z, index * 0.8, 0, [cylinderCollider(0.14, 1.8, 0, 1.8, 0)], VILLAGE_HEIGHT)),
  );
  seeds.push(simple('square_sign_bridge', 'signpost', 7.5, 41, Math.PI, 0, [cylinderCollider(0.12, 1.4, 0, 1.4, 0)], VILLAGE_HEIGHT));
  seeds.push(simple('square_sign_ramp', 'signpost', -40, -43, Math.PI * 0.25, 1, [cylinderCollider(0.12, 1.4, 0, 1.4, 0)], VILLAGE_HEIGHT));
  seeds.push(simple('square_sign_road', 'signpost', 43, 1, -Math.PI / 2, 2, [cylinderCollider(0.12, 1.4, 0, 1.4, 0)], VILLAGE_HEIGHT));
  // Flower beds and hay along the walls.
  ([
    [-30, -44, 0],
    [36, 44, Math.PI],
    [-44, 30, Math.PI / 2],
    [44, -20, -Math.PI / 2],
  ] as const).forEach(([x, z, yaw], index) => seeds.push(simple(`square_flowers_${index}`, 'flowers', x, z, yaw, index, [], VILLAGE_HEIGHT)));
  seeds.push(simple('square_hay_0', 'hay_bale', 36, 18, 0.4, 0, [cylinderCollider(0.8, 0.6, 0, 0.6, 0)], VILLAGE_HEIGHT));
  seeds.push(simple('square_hay_1', 'hay_bale', -38, -8, 1.2, 1, [cylinderCollider(0.8, 0.6, 0, 0.6, 0)], VILLAGE_HEIGHT));

  // Village pond (frozen) with reeds and a bench.
  const pond = ICE_PATCH_LAYOUT[0];
  seeds.push(simple('village_pond', 'ice_rink', pond.x, pond.z, 0.3, 0, [], undefined, pond.radius));
  seeds.push(simple('village_pond_bench', 'bench', pond.x + 9, pond.z + 5, -1.9, 0, [boxCollider(1, 0.25, 0.3, 0, 0.25, 0)]));

  seeds.push(...bridgeSeeds());
  seeds.push(...midSupportSeeds());
  return seeds;
}

function billboard(id: string, x: number, z: number, rotationY: number, variant: number, y?: number): PropSeed {
  const posts = 2.3;
  return {
    id,
    kind: 'billboard',
    x,
    z,
    y: y ?? ground(x, z),
    rotationY,
    variant,
    dimensions: { x: 6, y: 3.5, z: posts },
    destructibleId: id,
    colliders: [
      boxCollider(3, 1.75, 0.14, 0, posts + 1.75, 0, { pieceId: id }),
      cylinderCollider(0.16, posts / 2, -2.4, posts / 2, -0.1, { pieceId: id }),
      cylinderCollider(0.16, posts / 2, 2.4, posts / 2, -0.1, { pieceId: id }),
    ],
  };
}

/** Deck heights of the sagging suspension bridge, metres. */
export function bridgeDeckHeightAt(z: number): number {
  const t = (z - BRIDGE_SOUTH.z) / (BRIDGE_NORTH.z - BRIDGE_SOUTH.z);
  return BRIDGE_SOUTH.y - Math.sin(Math.PI * Math.min(1, Math.max(0, t))) * 0.55;
}

export const BRIDGE_PYLON_Z = [62.5, 80.5] as const;
export const BRIDGE_SEGMENTS = 4;

function bridgeSeeds(): PropSeed[] {
  const seeds: PropSeed[] = [];
  const length = BRIDGE_NORTH.z - BRIDGE_SOUTH.z;
  const segment = length / BRIDGE_SEGMENTS;
  for (let index = 0; index < BRIDGE_SEGMENTS; index += 1) {
    const z0 = BRIDGE_SOUTH.z + index * segment;
    const z1 = z0 + segment;
    const y0 = bridgeDeckHeightAt(z0);
    const y1 = bridgeDeckHeightAt(z1);
    const pieceId = `bridge_seg${index + 1}`;
    seeds.push({
      id: pieceId,
      kind: 'bridge_deck',
      x: 0,
      z: z0,
      y: y0,
      rotationY: 0,
      variant: index,
      dimensions: { x: BRIDGE_WIDTH, y: y1 - y0, z: segment },
      destructibleId: pieceId,
      surface: 'wood',
      colliders: [
        rampCollider(vec3(0, 0, 0), vec3(0, y1 - y0, segment), BRIDGE_WIDTH, 0.4, { surface: 'wood', pieceId }),
        boxCollider(0.06, 0.55, segment / 2, -BRIDGE_WIDTH / 2 + 0.06, (y1 - y0) / 2 + 0.55, segment / 2, { pieceId }),
        boxCollider(0.06, 0.55, segment / 2, BRIDGE_WIDTH / 2 - 0.06, (y1 - y0) / 2 + 0.55, segment / 2, { pieceId }),
      ],
    });
  }
  // Massive log pylons standing on the gorge floor, and anchor frames on both rims.
  for (const [index, z] of BRIDGE_PYLON_Z.entries()) {
    const footY = ground(0, z) - 0.2;
    const height = 31 - footY;
    seeds.push({
      id: `bridge_pylon_${index}`,
      kind: 'bridge_pylon',
      x: 0,
      z,
      y: footY,
      rotationY: 0,
      variant: 0,
      dimensions: { x: 7.8, y: height, z: 1.2 },
      colliders: [
        cylinderCollider(0.62, height / 2, -3.9, height / 2, 0),
        cylinderCollider(0.62, height / 2, 3.9, height / 2, 0),
        boxCollider(4.4, 0.35, 0.5, 0, bridgeDeckHeightAt(z) - footY - 0.75, 0),
      ],
    });
  }
  for (const [index, z] of [BRIDGE_SOUTH.z - 3, BRIDGE_NORTH.z + 3].entries()) {
    const footY = ground(0, z);
    seeds.push({
      id: `bridge_anchor_${index}`,
      kind: 'bridge_pylon',
      x: 0,
      z,
      y: footY,
      rotationY: 0,
      variant: 1,
      dimensions: { x: 7.6, y: 7.5, z: 1 },
      colliders: [cylinderCollider(0.5, 3.75, -3.8, 3.75, 0), cylinderCollider(0.5, 3.75, 3.8, 3.75, 0)],
    });
  }

  // Lower gorge walkways on stilts at +2.5 along both floor edges, joined by plank crossings.
  for (const side of [-1, 1]) {
    const path: Vec3[] = [];
    for (let x = -30; x <= 30; x += 6) {
      const z = GORGE.centerAt(x) + side * (GORGE.halfFloorAt(x) - 1.6);
      path.push(vec3(x, GORGE_WALKWAY_HEIGHT, z));
    }
    const colliders: PropCollider[] = [];
    const origin = path[0] ?? vec3(0, 0, 0);
    for (let index = 0; index + 1 < path.length; index += 1) {
      const a = path[index];
      const b = path[index + 1];
      if (!a || !b) continue;
      colliders.push(
        rampCollider(vec3(a.x - origin.x, 0, a.z - origin.z), vec3(b.x - origin.x, 0, b.z - origin.z), 2.4, 0.3, { surface: 'wood' }),
      );
    }
    seeds.push({ ...polylineProp(`gorge_walkway_${side < 0 ? 'south' : 'north'}`, 'walkway', path, side < 0 ? 0 : 1, colliders), surface: 'wood' });
  }
  // Boardwalks climbing the gorge walls from the walkways to both rims.
  GORGE_TRAILS.forEach((trail, index) => {
    const path = resampleLinear(trail, 3);
    const origin = path[0] ?? vec3(0, 0, 0);
    const colliders: PropCollider[] = [];
    for (let segment = 0; segment + 1 < path.length; segment += 1) {
      const a = path[segment];
      const b = path[segment + 1];
      if (!a || !b) continue;
      const from = vec3(a.x - origin.x, a.y - origin.y, a.z - origin.z);
      const to = vec3(b.x - origin.x, b.y - origin.y, b.z - origin.z);
      colliders.push(rampCollider(from, to, GORGE_TRAIL_WIDTH, 0.3, { surface: 'wood' }));
      // Rail on the gorge side so nobody walks off by accident.
      const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
      const length = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      const nx = (b.z - a.z) / length;
      const nz = -(b.x - a.x) / length;
      const center = GORGE.centerAt(mid.x);
      const towardCenter = Math.abs(mid.z + nz - center) < Math.abs(mid.z - nz - center) ? 1 : -1;
      const off = (GORGE_TRAIL_WIDTH / 2 - 0.08) * towardCenter;
      colliders.push(
        rampCollider(
          vec3(from.x + nx * off, from.y + 1.05, from.z + nz * off),
          vec3(to.x + nx * off, to.y + 1.05, to.z + nz * off),
          0.12,
          1.0,
        ),
      );
    }
    seeds.push({ ...polylineProp(`gorge_trail_${index}`, 'walkway', path, 4 + index, colliders), surface: 'wood' });
  });
  for (const [index, x] of [-14, 14].entries()) {
    const south = vec3(x, GORGE_WALKWAY_HEIGHT, GORGE.centerAt(x) - (GORGE.halfFloorAt(x) - 1.6));
    const north = vec3(x, GORGE_WALKWAY_HEIGHT, GORGE.centerAt(x) + (GORGE.halfFloorAt(x) - 1.6));
    seeds.push({
      ...polylineProp(`gorge_crossing_${index}`, 'walkway', [south, north], 2, [
        rampCollider(vec3(0, 0, 0), vec3(north.x - south.x, 0, north.z - south.z), 1.8, 0.3, { surface: 'wood' }),
      ]),
      surface: 'wood',
    });
  }
  // Ladders from the walkways up the pylons (visual climb aids) and the gorge-floor waterfall.
  for (const [index, z] of BRIDGE_PYLON_Z.entries()) {
    seeds.push(simple(`bridge_ladder_${index}`, 'ladder', -5.1, z, Math.PI / 2, 0, [], GORGE_WALKWAY_HEIGHT, bridgeDeckHeightAt(z) - GORGE_WALKWAY_HEIGHT));
  }
  seeds.push({
    id: 'gorge_waterfall',
    kind: 'waterfall',
    x: WATERFALL.top.x,
    z: WATERFALL.top.z,
    y: WATERFALL.top.y,
    rotationY: yawTowards(WATERFALL.top, WATERFALL.bottom),
    dimensions: { x: WATERFALL.width, y: WATERFALL.top.y - WATERFALL.bottom.y, z: Math.hypot(WATERFALL.top.x - WATERFALL.bottom.x, WATERFALL.top.z - WATERFALL.bottom.z) },
    colliders: [],
  });

  // Stone arch where the tank road crosses the narrow east ravine.
  const south = projectOnPolyline(STONE_ARCH.south.x, STONE_ARCH.south.z, TANK_ROAD_POINTS);
  const north = projectOnPolyline(STONE_ARCH.north.x, STONE_ARCH.north.z, TANK_ROAD_POINTS);
  const archSouth = vec3(STONE_ARCH.south.x, south.y, STONE_ARCH.south.z);
  const archNorth = vec3(STONE_ARCH.north.x, north.y, STONE_ARCH.north.z);
  const archYaw = yawTowards(archSouth, archNorth);
  const archLength = Math.hypot(archNorth.x - archSouth.x, archNorth.z - archSouth.z);
  seeds.push({
    id: 'stone_arch',
    kind: 'stone_arch',
    x: archSouth.x,
    z: archSouth.z,
    y: archSouth.y,
    rotationY: archYaw,
    dimensions: { x: STONE_ARCH.width, y: archNorth.y - archSouth.y, z: archLength },
    surface: 'cobblestone',
    colliders: [
      rampCollider(vec3(0, 0, -1.5), vec3(0, archNorth.y - archSouth.y, archLength + 1.5), STONE_ARCH.width, 1.2, { surface: 'cobblestone' }),
      boxCollider(0.5, 0.6, archLength / 2 + 1.5, -STONE_ARCH.width / 2 + 0.5, (archNorth.y - archSouth.y) / 2 + 0.6, archLength / 2),
      boxCollider(0.5, 0.6, archLength / 2 + 1.5, STONE_ARCH.width / 2 - 0.5, (archNorth.y - archSouth.y) / 2 + 0.6, archLength / 2),
    ],
  });
  return seeds;
}

/** Cable-car mid support at the village edge: a timber tower with a boarding deck at +28. */
function midSupportSeeds(): PropSeed[] {
  const station = CABLE_CAR_STATIONS.mid;
  const footY = ground(station.x, station.z);
  const rise = station.y - footY;
  const yaw = CABLE_STATION_YAWS.mid;
  const half = rise / 2;
  const colliders: PropCollider[] = [
    boxCollider(3.6, 0.2, 3, 0, rise - 0.2, 0, { surface: 'wood' }),
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => cylinderCollider(0.35, rise / 2, sx * 3.2, rise / 2, sz * 2.6))),
    // Two switchback flights on the outside of the tower with a landing.
    stairCollider(vec3(5.6, 0, -6.8), vec3(5.6, half, 1.2), 1.6, { surface: 'wood' }),
    boxCollider(1.6, 0.15, 1.2, 4.8, half - 0.15, 2.4, { surface: 'wood' }),
    stairCollider(vec3(4.0, half, 3.6), vec3(4.0, rise, -2.6), 1.6, { surface: 'wood' }),
    boxCollider(0.6, 0.15, 1.2, 3.9, rise - 0.15, -2.2, { surface: 'wood' }),
  ];
  return [
    {
      id: 'cable_station_mid',
      kind: 'cable_station',
      x: station.x,
      z: station.z,
      y: footY,
      rotationY: yaw,
      variant: 1,
      dimensions: { x: 7.2, y: rise, z: 6 },
      surface: 'wood',
      colliders,
    },
  ];
}

// ---------------------------------------------------------------------------
// Tower C — Summit Dairy
// ---------------------------------------------------------------------------

export const SUMMIT_YAW = -0.75 * Math.PI;

/** Coaster start stairs climb at tan⁻¹(0.68) ≈ 34°, well under the motor's 52° limit. */
const COASTER_STAIR_SLOPE = 0.68;

function summitSeeds(): PropSeed[] {
  const seeds: PropSeed[] = [];
  const C = TOWER_C_POSITION;
  const layout = dairyFortressLayout();
  seeds.push(
    building('tower_c_dairy', 'summit_dairy', layout, C.x, C.z, SUMMIT_YAW, {
      y: C.y,
      extra: [
        // Clock house on the roof deck; the snow cannon sits on its ridge.
        boxCollider(
          SUMMIT_CLOCK_HOUSE.width / 2,
          SUMMIT_CLOCK_HOUSE.height / 2,
          SUMMIT_CLOCK_HOUSE.depth / 2,
          SUMMIT_CLOCK_HOUSE.center.x,
          SUMMIT_CLOCK_HOUSE.base + SUMMIT_CLOCK_HOUSE.height / 2,
          SUMMIT_CLOCK_HOUSE.center.z,
        ),
        boxCollider(
          SUMMIT_CLOCK_HOUSE.width / 2 - 1.5,
          SUMMIT_CLOCK_HOUSE.roofHeight / 2,
          SUMMIT_CLOCK_HOUSE.depth / 2,
          SUMMIT_CLOCK_HOUSE.center.x,
          SUMMIT_CLOCK_HOUSE.base + SUMMIT_CLOCK_HOUSE.height + SUMMIT_CLOCK_HOUSE.roofHeight / 2,
          SUMMIT_CLOCK_HOUSE.center.z,
        ),
      ],
    }),
  );
  // Giant cheese wheels stored inside (explosive silos).
  const cheese: [number, number][] = [
    [-6, -4],
    [6, -4.5],
  ];
  cheese.forEach(([lx, lz], index) => {
    const at = localToWorld(C, SUMMIT_YAW, vec3(lx, 0, lz));
    const id = `silo_summit_cellar_${index}`;
    seeds.push({
      ...simple(id, 'cheese_silo', at.x, at.z, index, index, [cylinderCollider(1.35, 0.6, 0, 0.6, 0, { pieceId: id })], C.y),
      destructibleId: id,
    });
  });

  // Two destructible side huts.
  seeds.push(building('summit_hut_west', 'side_hut', sideHutLayout('world.buildings.skiHut'), 180, 240, yawTowards({ x: 180, z: 240 }, C), {
    y: C.y,
    destructibleId: 'building_summit_hut_west',
    variant: 0,
  }));
  seeds.push(building('summit_hut_east', 'side_hut', sideHutLayout('world.buildings.milkHut'), 252, 222, yawTowards({ x: 252, z: 222 }, C), {
    y: C.y,
    destructibleId: 'building_summit_hut_east',
    variant: 1,
  }));

  // Cable-car mountain station: a deck 3 m above the plateau with stairs.
  const mountain = CABLE_CAR_STATIONS.mountain;
  const mountainFoot = ground(mountain.x, mountain.z);
  const rise = mountain.y - mountainFoot;
  const stationYaw = CABLE_STATION_YAWS.mountain;
  seeds.push({
    id: 'cable_station_mountain',
    kind: 'cable_station',
    x: mountain.x,
    z: mountain.z,
    y: mountainFoot,
    rotationY: stationYaw,
    variant: 2,
    dimensions: { x: 8, y: rise, z: 9 },
    surface: 'wood',
    colliders: [
      boxCollider(4, 0.25, 4.5, 0, rise - 0.25, 0, { surface: 'wood' }),
      stairCollider(vec3(5.6, 0, -6.4), vec3(5.6, rise, -0.6), 1.8, { surface: 'wood' }),
      boxCollider(1.4, 0.15, 1.4, 5.2, rise - 0.15, 0.6, { surface: 'wood' }),
      // Carved station chalet at the back of the covered docking balcony.
      boxCollider(4, 2.7, 1.2, 0, rise + 2.7, 3.3, { surface: 'wood' }),
    ],
  });

  // Coaster start platform on the east terrace.
  const coasterStart = FJORD_ROUTES.coaster.start;
  const coasterFoot = ground(coasterStart.x, coasterStart.z);
  const coasterYaw = yawTowards(coasterStart, FJORD_ROUTES.coaster.track.points[4] ?? coasterStart);
  const coasterRise = Math.max(0.4, coasterStart.y - coasterFoot);
  seeds.push({
    id: 'coaster_platform',
    kind: 'coaster_platform',
    x: coasterStart.x,
    z: coasterStart.z,
    y: coasterFoot,
    rotationY: coasterYaw,
    dimensions: { x: 7, y: coasterRise, z: 6 },
    surface: 'wood',
    colliders: [
      boxCollider(3.5, coasterRise / 2, 3, -3.4, coasterRise / 2, -1, { surface: 'wood' }),
      // Stairs off the back edge, away from the summit ring path.
      stairCollider(vec3(-6.9 - coasterRise / COASTER_STAIR_SLOPE, 0, -1), vec3(-6.9, coasterRise, -1), 2.2, { surface: 'wood' }),
    ],
  });
  const terrace = localToWorld(vec3(coasterStart.x, coasterFoot, coasterStart.z), coasterYaw, vec3(-6.5, 0, 2));
  seeds.push({
    ...simple('silo_summit_terrace', 'cheese_silo', terrace.x, terrace.z, 0.4, 2, [
      cylinderCollider(1.35, 0.6, 0, 0.6, 0, { pieceId: 'silo_summit_terrace' }),
    ]),
    destructibleId: 'silo_summit_terrace',
  });

  // Summit rink, flags, crates, snowmen, sleds and ski racks.
  const rink = ICE_PATCH_LAYOUT[1];
  seeds.push(simple('summit_rink', 'ice_rink', rink.x, rink.z, 0, 1, [], undefined, rink.radius));
  ([
    [190, 228, 0],
    [226, 200, 1],
    [236, 236, 2],
    [204, 248, 0],
  ] as const).forEach(([x, z, variant], index) => seeds.push(crateStack(`summit_crates_${index}`, x, z, index * 1.1, variant)));
  ([
    [214, 196],
    [188, 214],
    [258, 244],
  ] as const).forEach(([x, z], index) => seeds.push(simple(`summit_snowman_${index}`, 'snowman', x, z, index * 1.7, index, [cylinderCollider(0.8, 0.9, 0, 0.9, 0)])));
  ([
    [222, 244, 0.4],
    [244, 260, 2.2],
  ] as const).forEach(([x, z, yaw], index) => seeds.push(simple(`summit_skis_${index}`, 'ski_rack', x, z, yaw, index, [boxCollider(1.2, 0.8, 0.25, 0, 0.8, 0)])));
  ([
    [230, 196, 0.2],
    [196, 238, 1.5],
  ] as const).forEach(([x, z, yaw], index) => seeds.push(simple(`summit_woodpile_${index}`, 'woodpile', x, z, yaw, index, [boxCollider(1.4, 0.6, 0.6, 0, 0.6, 0)])));
  seeds.push(simple('summit_sled_0', 'sled', 218, 252, 0.9, 0));
  seeds.push(simple('summit_flag', 'flag', 224, 226, 0, 0, [cylinderCollider(0.18, 5, 0, 5, 0)]));
  return seeds;
}

// ---------------------------------------------------------------------------
// Faction bases
// ---------------------------------------------------------------------------

function alpineBaseSeeds(): PropSeed[] {
  const seeds: PropSeed[] = [];
  const base = ALPINE_BASE_POSITION;
  const hangarYaw = yawTowards({ x: 334, z: 318 }, GLACIER_RUNWAY.end);
  seeds.push(building('alpine_hangar', 'hangar', hangarLayout(), 334, 318, hangarYaw, { y: base.y, variant: 0 }));
  seeds.push(simple('alpine_tent_0', 'tent', 296, 330, 2.4, 0, [boxCollider(2.2, 1.2, 2.6, 0, 1.2, 0)], base.y));
  seeds.push(simple('alpine_tent_1', 'tent', 286, 314, 2.0, 1, [boxCollider(2.2, 1.2, 2.6, 0, 1.2, 0)], base.y));
  seeds.push(simple('alpine_tent_2', 'tent', 322, 290, 0.6, 2, [boxCollider(2.2, 1.2, 2.6, 0, 1.2, 0)], base.y));
  ([
    [306, 296, 0],
    [300, 318, 1],
    [326, 304, 2],
    [314, 334, 0],
  ] as const).forEach(([x, z, variant], index) => seeds.push(crateStack(`alpine_crates_${index}`, x, z, index * 0.8, variant, base.y)));
  ([
    [340, 300],
    [342, 303],
    [339, 306],
  ] as const).forEach(([x, z], index) => seeds.push(barrel(`alpine_fuel_${index}`, x, z, index + 3, base.y)));
  seeds.push(simple('alpine_flag_0', 'flag', 300, 304, 0, 0, [cylinderCollider(0.18, 5, 0, 5, 0)], base.y));
  seeds.push(simple('alpine_flag_1', 'flag', 318, 300, 0, 0, [cylinderCollider(0.18, 5, 0, 5, 0)], base.y));
  seeds.push(simple('alpine_campfire', 'campfire', 304, 322, 0, 0, [], base.y));
  // Glacier runway edge markers.
  const dx = GLACIER_RUNWAY.end.x - GLACIER_RUNWAY.start.x;
  const dz = GLACIER_RUNWAY.end.z - GLACIER_RUNWAY.start.z;
  const length = Math.hypot(dx, dz);
  const side = { x: dz / length, z: -dx / length };
  for (let s = 0; s <= length; s += 18) {
    for (const sign of [-1, 1]) {
      const x = GLACIER_RUNWAY.start.x + (dx / length) * s + side.x * sign * (GLACIER_RUNWAY.width / 2 + 1);
      const z = GLACIER_RUNWAY.start.z + (dz / length) * s + side.z * sign * (GLACIER_RUNWAY.width / 2 + 1);
      seeds.push(simple(`glacier_marker_${Math.round(s)}_${sign}`, 'runway_marker', x, z, 0, sign < 0 ? 0 : 1));
    }
  }
  return seeds;
}

function lagoonBaseSeeds(): PropSeed[] {
  const seeds: PropSeed[] = [];
  const base = LAGOON_BASE_POSITION;
  const garageYaw = Math.PI / 4;
  seeds.push(building('lagoon_garage', 'bamboo_garage', bambooGarageLayout(), -326, -334, garageYaw, { y: base.y, variant: 0 }));
  // Boat dock into the lagoon on the north shore, toward the water runway.
  const dockStart = vec3(-304, HARBOR_DECK_HEIGHT - 0.6, -268);
  const dockYaw = -0.12;
  const dockLength = 26;
  seeds.push({
    id: 'lagoon_dock',
    kind: 'boat_dock',
    x: dockStart.x,
    z: dockStart.z,
    y: dockStart.y,
    rotationY: dockYaw,
    dimensions: { x: 4, y: 0.36, z: dockLength },
    surface: 'wood',
    colliders: [
      boxCollider(2, 0.18, dockLength / 2, 0, -0.18, dockLength / 2, { surface: 'wood' }),
      boxCollider(5, 0.18, 2.5, 0, -0.18, dockLength + 2, { surface: 'wood' }),
      rampCollider(vec3(0, 0, 0.2), vec3(0, ground(dockStart.x, dockStart.z - 4) - dockStart.y + 0.05, -4), 4, 0.3, { surface: 'wood' }),
    ],
  });
  ([
    [-292, -320, 0.3, 0],
    [-318, -296, 2.1, 1],
    [-340, -312, 1.3, 2],
  ] as const).forEach(([x, z, yaw, variant], index) =>
    seeds.push(simple(`lagoon_tiki_${index}`, 'tent', x, z, yaw, variant + 3, [cylinderCollider(1.9, 1.3, 0, 1.3, 0)], base.y)),
  );
  ([
    [-300, -300, 1],
    [-322, -310, 0],
    [-306, -324, 2],
  ] as const).forEach(([x, z, variant], index) => seeds.push(crateStack(`lagoon_crates_${index}`, x, z, index, variant, base.y)));
  ([
    [-296, -312],
    [-312, -292],
    [-330, -300],
    [-290, -334],
  ] as const).forEach(([x, z], index) => seeds.push(simple(`lagoon_torch_${index}`, 'tiki_torch', x, z, 0, index, [cylinderCollider(0.12, 1.1, 0, 1.1, 0)], base.y)));
  seeds.push(simple('lagoon_flag_0', 'flag', -302, -306, 0, 2, [cylinderCollider(0.18, 5, 0, 5, 0)], base.y));
  seeds.push(simple('lagoon_flag_1', 'flag', -316, -318, 0, 2, [cylinderCollider(0.18, 5, 0, 5, 0)], base.y));
  seeds.push(simple('lagoon_surf_rack', 'surfboard_rack', -296, -292, 0.8, 0, [boxCollider(1.5, 1, 0.4, 0, 1, 0)], base.y));
  // Palms around the plaza strung with pastel bunting.
  const basePalms = [
    [-284, -318, 1.05, 0],
    [-284, -300, 0.95, 2],
    [-296, -284, 1.1, 1],
    [-322, -288, 1.0, 0],
  ] as const;
  basePalms.forEach(([x, z, scale, variant], index) =>
    seeds.push(simple(`lagoon_palm_${index}`, 'palm', x, z, index * 1.9, variant, [cylinderCollider(0.34 * scale, 1.6 * scale, 0, 1.6 * scale, 0)], base.y, scale)),
  );
  for (let index = 0; index + 1 < basePalms.length; index += 1) {
    const a = basePalms[index];
    const b = basePalms[index + 1];
    if (!a || !b) continue;
    seeds.push(
      polylineProp(`lagoon_bunting_${index}`, 'bunting', [vec3(a[0], base.y + 5.6 * a[2], a[1]), vec3(b[0], base.y + 5.6 * b[2], b[1])], index + 2),
    );
  }
  // Water runway buoys.
  const dx = WATER_RUNWAY.end.x - WATER_RUNWAY.start.x;
  const dz = WATER_RUNWAY.end.z - WATER_RUNWAY.start.z;
  const length = Math.hypot(dx, dz);
  const side = { x: dz / length, z: -dx / length };
  for (let s = 0; s <= length; s += 16) {
    for (const sign of [-1, 1]) {
      const x = WATER_RUNWAY.start.x + (dx / length) * s + side.x * sign * (WATER_RUNWAY.width / 2);
      const z = WATER_RUNWAY.start.z + (dz / length) * s + side.z * sign * (WATER_RUNWAY.width / 2);
      seeds.push(simple(`water_buoy_${Math.round(s)}_${sign}`, 'buoy', x, z, 0, sign < 0 ? 0 : 1, [], 0));
    }
  }
  return seeds;
}

// ---------------------------------------------------------------------------
// Cable car, T-bar, coaster, hammock and route dressing
// ---------------------------------------------------------------------------

function transportSeeds(): PropSeed[] {
  const seeds: PropSeed[] = [];
  const cable = FJORD_ROUTES.cableCar;
  // Valley station on the beach cliff.
  const valley = CABLE_CAR_STATIONS.valley;
  const valleyFoot = ground(valley.x, valley.z);
  const valleyYaw = CABLE_STATION_YAWS.valley;
  const deck = Math.max(0.3, valley.y - valleyFoot);
  seeds.push({
    id: 'cable_station_valley',
    kind: 'cable_station',
    x: valley.x,
    z: valley.z,
    y: valleyFoot,
    rotationY: valleyYaw,
    variant: 0,
    dimensions: { x: 9, y: deck, z: 10 },
    surface: 'wood',
    colliders: [
      boxCollider(4.5, deck / 2, 5, 0, deck / 2, 0, { surface: 'wood' }),
      boxCollider(4.5, 2.8, 1.5, 0, deck + 2.8, -3.5, { surface: 'wood' }),
      ...[-1, 1].map((side) => cylinderCollider(0.3, 2.6, side * 4.1, deck + 2.6, 4.4)),
    ],
  });
  cable.pylons.forEach((pylon, index) => {
    const foot = ground(pylon.x, pylon.z);
    seeds.push({
      id: `cable_pylon_${index}`,
      kind: 'cable_pylon',
      x: pylon.x,
      z: pylon.z,
      y: foot,
      rotationY: yawTowards(CABLE_CAR_STATIONS.valley, CABLE_CAR_STATIONS.mountain),
      variant: index,
      dimensions: { x: 3.4, y: pylon.y - foot, z: 3.4 },
      colliders: [boxCollider(1.7, (pylon.y - foot) / 2, 1.7, 0, (pylon.y - foot) / 2, 0)],
    });
  });

  // T-bar stations and masts.
  const tbar = FJORD_ROUTES.tBar;
  const tbarYaw = yawTowards(tbar.bottom, tbar.top);
  seeds.push(
    simple('tbar_bottom', 'tbar_station', tbar.bottom.x, tbar.bottom.z, tbarYaw, 0, [
      boxCollider(2.2, 1.6, 2.2, -3.4, 1.6, -1.5),
      boxCollider(0.8, 0.6, 0.8, 0, 0.6, 0, { surface: 'cobblestone' }),
    ]),
  );
  seeds.push(
    simple('tbar_top', 'tbar_station', tbar.top.x, tbar.top.z, tbarYaw, 1, [
      boxCollider(2.2, 1.6, 2.2, -3.4, 1.6, 1.5),
      ...[-1, 1].map((side) => cylinderCollider(0.2, 2.4, side * 1.0, 2.4, 0)),
    ]),
  );
  const left = { x: -Math.cos(tbarYaw), z: Math.sin(tbarYaw) };
  tbar.pylons.forEach((top, index) => {
    const x = top.x + left.x * 2.8;
    const z = top.z + left.z * 2.8;
    const foot = ground(x, z);
    seeds.push({
      id: `tbar_pylon_${index}`,
      kind: 'tbar_pylon',
      x,
      z,
      y: foot,
      rotationY: tbarYaw,
      variant: index,
      dimensions: { x: 2.8, y: top.y - foot + 0.4, z: 0.5 },
      colliders: [cylinderCollider(0.3, (top.y - foot) / 2, 0, (top.y - foot) / 2, 0)],
    });
  });

  // Coaster trough floor and support pillars (anchored at the world origin).
  const coaster = FJORD_ROUTES.coaster;
  const troughColliders: PropCollider[] = [];
  for (let index = 0; index + 3 < coaster.track.points.length; index += 3) {
    const a = coaster.track.points[index];
    const b = coaster.track.points[index + 3];
    if (!a || !b) continue;
    troughColliders.push(rampCollider(a, b, 2.3, 0.25, { surface: 'wood' }));
  }
  for (const pillar of coaster.pillars) {
    const height = pillar.top.y - 0.5 - pillar.ground;
    if (height < 0.5) continue;
    troughColliders.push(cylinderCollider(0.32, height / 2, pillar.top.x, pillar.ground + height / 2, pillar.top.z));
  }
  seeds.push({ id: 'coaster_track', kind: 'coaster_platform', x: 0, z: 0, y: 0, rotationY: 0, variant: 1, colliders: troughColliders });

  // Hammock catapult between two thick palms on the east beach.
  const hammock = FJORD_ROUTES.hammock;
  const hammockYaw = yawTowards(hammock.seat, hammock.target);
  const anchorOffset = Math.hypot(hammock.anchorA.x - hammock.seat.x, hammock.anchorA.z - hammock.seat.z);
  seeds.push({
    id: 'hammock_catapult',
    kind: 'hammock',
    x: (hammock.anchorA.x + hammock.anchorB.x) / 2,
    z: (hammock.anchorA.z + hammock.anchorB.z) / 2,
    y: ground((hammock.anchorA.x + hammock.anchorB.x) / 2, (hammock.anchorA.z + hammock.anchorB.z) / 2),
    rotationY: hammockYaw,
    dimensions: { x: anchorOffset * 2, y: 0, z: 0 },
    colliders: [cylinderCollider(0.45, 3.2, anchorOffset, 3.2, 0), cylinderCollider(0.45, 3.2, -anchorOffset, 3.2, 0)],
  });
  return seeds;
}

/** Fences, lanterns and signposts lining the lanes, the ramp and the road. */
function routeDressingSeeds(): PropSeed[] {
  const seeds: PropSeed[] = [];
  const fenceAlong = (id: string, points: readonly Vec3[], offset: number, from: number, to: number, variant: number): void => {
    const path: Vec3[] = [];
    for (let index = from; index < Math.min(points.length - 1, to); index += 2) {
      const a = points[index];
      const b = points[index + 1];
      if (!a || !b) continue;
      const length = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      const nx = (b.z - a.z) / length;
      const nz = -(b.x - a.x) / length;
      const x = a.x + nx * offset;
      const z = a.z + nz * offset;
      path.push(vec3(x, ground(x, z), z));
    }
    if (path.length >= 2) seeds.push(polylineProp(id, 'fence', path, variant));
  };
  const ramp = FJORD_ROUTES.coastalRamp.points;
  fenceAlong('ramp_fence_left', ramp, 8.2, 2, ramp.length - 4, 0);
  fenceAlong('ramp_fence_right', ramp, -8.2, 2, ramp.length - 4, 1);
  FJORD_ROUTES.villageLanes.forEach((lane, index) => {
    fenceAlong(`lane_${index}_fence_left`, lane.points, 4, 3, lane.points.length - 2, 2);
    fenceAlong(`lane_${index}_fence_right`, lane.points, -4, 3, lane.points.length - 2, 3);
  });
  const road = FJORD_ROUTES.tankRoad.points;
  // Wooden snow fences on the outer side of the hairpins.
  fenceAlong('road_fence_hairpin_2', road, -6.4, 42, 62, 4);
  fenceAlong('road_fence_hairpin_1', road, -6.4, 86, 104, 4);
  for (let index = 8; index < road.length - 6; index += 14) {
    const a = road[index];
    const b = road[index + 1];
    if (!a || !b) continue;
    const length = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    const x = a.x + ((b.z - a.z) / length) * 6.2;
    const z = a.z - ((b.x - a.x) / length) * 6.2;
    seeds.push(simple(`road_post_${index}`, 'lantern', x, z, 0, 1, [cylinderCollider(0.12, 1.4, 0, 1.4, 0)]));
  }
  // Billboards along the main paths.
  const rampFoot = ramp[3] ?? vec3(-130, 3, -140);
  seeds.push(billboard('billboard_ramp', rampFoot.x + 10, rampFoot.z - 4, yawTowards(rampFoot, vec3(-190, 0, -185)) + Math.PI, 2));
  const hairpin = road[50] ?? vec3(110, 45, 160);
  seeds.push(billboard('billboard_hairpin', hairpin.x - 10, hairpin.z + 6, -0.8, 3));
  seeds.push(billboard('billboard_bridge_north', 12, 108, Math.PI + 0.3, 4));
  seeds.push(billboard('billboard_bay', 84, -104, -2.4, 5));
  // Junction signposts.
  seeds.push(simple('sign_valley', 'signpost', -100, -84, 0.6, 1, [cylinderCollider(0.12, 1.4, 0, 1.4, 0)]));
  seeds.push(simple('sign_bay', 'signpost', 58, -86, -1, 0, [cylinderCollider(0.12, 1.4, 0, 1.4, 0)]));
  seeds.push(simple('sign_tbar', 'signpost', 78, 106, 0.4, 2, [cylinderCollider(0.12, 1.4, 0, 1.4, 0)]));
  seeds.push(simple('sign_harbor', 'signpost', -140, -142, -2.2, 1, [cylinderCollider(0.12, 1.4, 0, 1.4, 0)]));
  return seeds;
}

/** Explosive giant cheese wheels and coconut pressure silos at crossings, bridgeheads and towers. */
function siloSeeds(): PropSeed[] {
  const A = TOWER_A_POSITION;
  const silos: { id: string; kind: 'cheese_silo' | 'coconut_silo'; x: number; z: number; y?: number }[] = [
    { id: 'silo_bridge_south', kind: 'cheese_silo', x: -6, z: 42 },
    { id: 'silo_bridge_north', kind: 'cheese_silo', x: 7, z: 103 },
    { id: 'silo_square_east', kind: 'cheese_silo', x: 40, z: 20 },
    { id: 'silo_arch_north', kind: 'cheese_silo', x: 110, z: 92 },
    { id: 'silo_hairpin_1', kind: 'cheese_silo', x: 220, z: 112 },
    { id: 'silo_hairpin_2', kind: 'cheese_silo', x: 98, z: 160 },
    { id: 'silo_harbor_deck_0', kind: 'coconut_silo', x: A.x + Math.sin(3.0) * 15, z: A.z + Math.cos(3.0) * 15, y: HARBOR_DECK_HEIGHT },
    { id: 'silo_harbor_deck_1', kind: 'coconut_silo', x: A.x + Math.sin(5.62) * 15, z: A.z + Math.cos(5.62) * 15, y: HARBOR_DECK_HEIGHT },
    { id: 'silo_beach_bar_east', kind: 'coconut_silo', x: -131, z: -184 },
    { id: 'silo_ramp_foot', kind: 'coconut_silo', x: -128, z: -150 },
    { id: 'silo_hammock', kind: 'coconut_silo', x: 74, z: -88 },
    { id: 'silo_valley_station', kind: 'coconut_silo', x: -100, z: -104 },
    { id: 'silo_square_south', kind: 'coconut_silo', x: -22, z: -40 },
  ];
  return silos.map((silo, index) => ({
    id: silo.id,
    kind: silo.kind,
    x: silo.x,
    z: silo.z,
    y: silo.y ?? ground(silo.x, silo.z),
    rotationY: index * 0.9,
    variant: index % 2,
    destructibleId: silo.id,
    colliders:
      silo.kind === 'cheese_silo'
        ? [cylinderCollider(1.35, 0.6, 0, 0.6, 0, { pieceId: silo.id })]
        : [cylinderCollider(0.9, 1.3, 0, 1.3, 0, { pieceId: silo.id }), sphereCollider(0.95, 0, 2.7, 0)],
  }));
}

export function authoredStructureSeeds(): PropSeed[] {
  return [
    ...harborSeeds(),
    ...villageSeeds(),
    ...summitSeeds(),
    ...alpineBaseSeeds(),
    ...lagoonBaseSeeds(),
    ...transportSeeds(),
    ...routeDressingSeeds(),
    ...siloSeeds(),
  ];
}
