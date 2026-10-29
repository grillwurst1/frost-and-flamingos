/**
 * Route polylines of Fjord Fiesta. They are sampled densely so later vehicle
 * and map-toy packages can move gondolas, T-bars, bobs, tanks and the cow
 * along exactly the geometry the client renders.
 */
import type { Vec3 } from '../../types/index.js';
import type {
  CableCarRoute,
  CableCarStation,
  CoasterRoute,
  CowPatrol,
  HammockCatapult,
  MapRoutes,
  RoadRoute,
  RoutePolyline,
  Runway,
  TBarRoute,
} from '../../types/map.js';
import {
  CABLE_BRAKE_LEVERS_LOCAL,
  CABLE_BRAKE_HANDLE,
  CABLE_CAR_STATIONS,
  CABLE_STATION_YAWS,
  COASTAL_RAMP_POINTS,
  COASTAL_RAMP_WIDTH,
  COASTER_CONTROL,
  COW_HOME,
  GLACIER_RUNWAY,
  GORGE,
  HAMMOCK_POSITION,
  HAMMOCK_TARGET,
  TANK_ROAD_POINTS,
  TANK_ROAD_WIDTH,
  TBAR_BOTTOM,
  TBAR_TOP,
  VILLAGE_LANE_POINTS,
  VILLAGE_LANE_WIDTH,
  WATER_RUNWAY,
} from './layout.js';
import { catmullRom, clamp, lerp, localToWorld, makeRoute, projectOnPolyline, vec3 } from './math.js';
import { sampleMapHeight } from './terrain.js';

function road(id: string, points: readonly Vec3[], width: number): RoadRoute {
  const route = makeRoute(
    id,
    points.map((point) => ({ x: point.x, y: Math.max(point.y, sampleMapHeight(point.x, point.z)), z: point.z })),
  );
  return { ...route, width, surface: 'cobblestone' };
}

// ---------------------------------------------------------------------------
// Cable car
// ---------------------------------------------------------------------------

const CABLE_HANGER = 4.2;
const CABLE_CLEARANCE = 6;

function spanPoints(a: Vec3, b: Vec3, step: number): Vec3[] {
  const horizontal = Math.hypot(b.x - a.x, b.z - a.z);
  const sag = horizontal * 0.016;
  const samples = Math.max(2, Math.ceil(horizontal / step));
  const points: Vec3[] = [];
  for (let index = 0; index <= samples; index += 1) {
    const t = index / samples;
    points.push({
      x: lerp(a.x, b.x, t),
      y: lerp(a.y, b.y, t) - 4 * sag * t * (1 - t),
      z: lerp(a.z, b.z, t),
    });
  }
  return points;
}

/** Worst gondola clearance over a span, ignoring the docking zones next to stations. */
function spanClearance(a: Vec3, b: Vec3, dockA: boolean, dockB: boolean): number {
  let worst = Number.POSITIVE_INFINITY;
  for (const point of spanPoints(a, b, 3)) {
    if (dockA && Math.hypot(point.x - a.x, point.z - a.z) < 22) continue;
    if (dockB && Math.hypot(point.x - b.x, point.z - b.z) < 22) continue;
    const ground = Math.max(0, sampleMapHeight(point.x, point.z));
    worst = Math.min(worst, point.y - CABLE_HANGER - ground);
  }
  return worst;
}

/** Raises a pylon saddle until both neighbouring spans clear the terrain. */
function pylonSaddle(
  previous: Vec3,
  previousIsStation: boolean,
  x: number,
  z: number,
  next: Vec3,
  nextIsStation: boolean,
  minimumHeight: number,
): Vec3 {
  const ground = sampleMapHeight(x, z);
  let height = minimumHeight;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const saddle = vec3(x, ground + height, z);
    if (
      spanClearance(previous, saddle, previousIsStation, false) >= CABLE_CLEARANCE &&
      spanClearance(saddle, next, false, nextIsStation) >= CABLE_CLEARANCE
    ) {
      return saddle;
    }
    height += 1;
  }
  return vec3(x, ground + height, z);
}

function alongLine(a: Vec3, b: Vec3, t: number): { x: number; z: number } {
  return { x: lerp(a.x, b.x, t), z: lerp(a.z, b.z, t) };
}

function buildCableCar(): CableCarRoute {
  const valley = vec3(CABLE_CAR_STATIONS.valley.x, CABLE_CAR_STATIONS.valley.y + CABLE_HANGER, CABLE_CAR_STATIONS.valley.z);
  const mid = vec3(CABLE_CAR_STATIONS.mid.x, CABLE_CAR_STATIONS.mid.y + CABLE_HANGER, CABLE_CAR_STATIONS.mid.z);
  const mountain = vec3(
    CABLE_CAR_STATIONS.mountain.x,
    CABLE_CAR_STATIONS.mountain.y + CABLE_HANGER,
    CABLE_CAR_STATIONS.mountain.z,
  );
  const p1 = alongLine(valley, mid, 0.29);
  const pylon1 = pylonSaddle(valley, true, p1.x, p1.z, mid, true, 16);
  // Two pylons carry the long climb from the village edge up to Tower C.
  const p2 = alongLine(mid, mountain, 0.36);
  const p3 = alongLine(mid, mountain, 0.7);
  let pylon2 = pylonSaddle(mid, true, p2.x, p2.z, mountain, true, 12);
  let pylon3 = pylonSaddle(pylon2, false, p3.x, p3.z, mountain, true, 12);
  pylon2 = pylonSaddle(mid, true, p2.x, p2.z, pylon3, false, 12);
  pylon3 = pylonSaddle(pylon2, false, p3.x, p3.z, mountain, true, 12);
  const supports = [valley, pylon1, mid, pylon2, pylon3, mountain];
  const cablePoints: Vec3[] = [];
  for (let index = 0; index + 1 < supports.length; index += 1) {
    const a = supports[index];
    const b = supports[index + 1];
    if (!a || !b) continue;
    const span = spanPoints(a, b, 4);
    if (index > 0) span.shift();
    cablePoints.push(...span);
  }
  const cable = makeRoute('cable_car_cable', cablePoints);
  const gondolaPath = makeRoute(
    'cable_car_gondola',
    cablePoints.map((point) => ({ x: point.x, y: point.y - CABLE_HANGER, z: point.z })),
  );
  const stationDistance = (station: Vec3): number =>
    projectOnPolyline(station.x, station.z, gondolaPath.points, gondolaPath.distances).along;
  const brake = (platform: Vec3, yaw: number, base: Vec3) => ({
    brakeBase: localToWorld(platform, yaw, base),
    brakeLever: localToWorld(platform, yaw, { x: base.x,
      y: CABLE_BRAKE_HANDLE.hinge + CABLE_BRAKE_HANDLE.length * Math.cos(CABLE_BRAKE_HANDLE.angle),
      z: base.z + CABLE_BRAKE_HANDLE.length * Math.sin(CABLE_BRAKE_HANDLE.angle) }),
  });
  const stations: CableCarStation[] = [
    {
      id: 'valley',
      labelKey: 'world.stations.valley',
      platform: { ...CABLE_CAR_STATIONS.valley },
      ...brake(CABLE_CAR_STATIONS.valley, CABLE_STATION_YAWS.valley, CABLE_BRAKE_LEVERS_LOCAL.valley),
      pathDistance: 0,
    },
    {
      id: 'mid',
      labelKey: 'world.stations.mid',
      platform: { ...CABLE_CAR_STATIONS.mid },
      ...brake(CABLE_CAR_STATIONS.mid, CABLE_STATION_YAWS.mid, CABLE_BRAKE_LEVERS_LOCAL.mid),
      pathDistance: stationDistance(CABLE_CAR_STATIONS.mid),
    },
    {
      id: 'mountain',
      labelKey: 'world.stations.mountain',
      platform: { ...CABLE_CAR_STATIONS.mountain },
      ...brake(CABLE_CAR_STATIONS.mountain, CABLE_STATION_YAWS.mountain, CABLE_BRAKE_LEVERS_LOCAL.mountain),
      pathDistance: gondolaPath.length,
    },
  ];
  return {
    cable,
    gondolaPath,
    stations,
    pylons: [pylon1, pylon2, pylon3],
    gondolas: 2,
    legSeconds: 22,
    hangerLength: CABLE_HANGER,
  };
}

// ---------------------------------------------------------------------------
// T-bar ski lift
// ---------------------------------------------------------------------------

const TBAR_CABLE_HEIGHT = 6.2;
const TBAR_PYLON_SPACING = 26;
/** Masts stand to the left of the track and reach over it with a crossarm. */
export const TBAR_MAST_OFFSET = 2.8;
/** Where the lift line crosses the tank road, masts keep 1.5 m clear of the road edge (+ mast radius). */
const TBAR_MAST_ROAD_CLEARANCE = TANK_ROAD_WIDTH / 2 + 1.5 + 0.5;
/** The cable stays this high over the snow, and over the tank road (tanks pass under it). */
export const TBAR_CABLE_TERRAIN_CLEARANCE = 2.5;
export const TBAR_CABLE_ROAD_CLEARANCE = 4.5;

/** Lowest clearance deficit of one straight cable span (and where along it, 0–1). */
function cableSpanDeficit(a: Vec3, b: Vec3): { deficit: number; at: number } {
  let worst = { deficit: Number.NEGATIVE_INFINITY, at: 0.5 };
  const steps = Math.max(8, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.5));
  for (let step = 0; step <= steps; step += 1) {
    const u = step / steps;
    const x = lerp(a.x, b.x, u);
    const z = lerp(a.z, b.z, u);
    let need = sampleMapHeight(x, z) + TBAR_CABLE_TERRAIN_CLEARANCE;
    const road = projectOnPolyline(x, z, TANK_ROAD_POINTS);
    if (road.distance <= TANK_ROAD_WIDTH / 2 + 1) need = Math.max(need, road.y + TBAR_CABLE_ROAD_CLEARANCE);
    const deficit = need - lerp(a.y, b.y, u);
    if (deficit > worst.deficit) worst = { deficit, at: u };
  }
  return worst;
}

function buildTBar(): TBarRoute {
  const dx = TBAR_TOP.x - TBAR_BOTTOM.x;
  const dz = TBAR_TOP.z - TBAR_BOTTOM.z;
  const horizontal = Math.hypot(dx, dz);
  const samples = Math.ceil(horizontal / 2);
  const ride: Vec3[] = [];
  for (let index = 0; index <= samples; index += 1) {
    const t = index / samples;
    const x = TBAR_BOTTOM.x + dx * t;
    const z = TBAR_BOTTOM.z + dz * t;
    ride.push(vec3(x, sampleMapHeight(x, z), z));
  }
  const pylonCount = Math.max(1, Math.round(horizontal / TBAR_PYLON_SPACING) - 1);
  const pylons: Vec3[] = [];
  const cablePoints: Vec3[] = [vec3(TBAR_BOTTOM.x, sampleMapHeight(TBAR_BOTTOM.x, TBAR_BOTTOM.z) + TBAR_CABLE_HEIGHT - 1, TBAR_BOTTOM.z)];
  // Masts stand at TBAR_MAST_OFFSET to the left of the line (see structures.ts).
  const yaw = Math.atan2(dx, dz);
  const mastClear = (t: number): boolean =>
    projectOnPolyline(
      TBAR_BOTTOM.x + dx * t - Math.cos(yaw) * TBAR_MAST_OFFSET,
      TBAR_BOTTOM.z + dz * t + Math.sin(yaw) * TBAR_MAST_OFFSET,
      TANK_ROAD_POINTS,
    ).distance >= TBAR_MAST_ROAD_CLEARANCE;
  for (let index = 1; index <= pylonCount; index += 1) {
    // Evenly spaced, except that a mast never stands on the tank road: it
    // slides along the lift line to the nearest clear spot.
    const nominal = index / (pylonCount + 1);
    let t = nominal;
    for (let shift = 0; shift <= 0.15 && !mastClear(t); shift += 0.002) {
      if (mastClear(nominal - shift)) t = nominal - shift;
      else if (mastClear(nominal + shift)) t = nominal + shift;
    }
    const x = TBAR_BOTTOM.x + dx * t;
    const z = TBAR_BOTTOM.z + dz * t;
    pylons.push(vec3(x, sampleMapHeight(x, z) + TBAR_CABLE_HEIGHT, z));
  }
  // Masts beside a span that sags too close to the snow or the tank road grow
  // taller (the stations at both ends keep their height).
  const stations = [cablePoints[0] ?? vec3(0, 0, 0), vec3(TBAR_TOP.x, sampleMapHeight(TBAR_TOP.x, TBAR_TOP.z) + TBAR_CABLE_HEIGHT - 1, TBAR_TOP.z)] as const;
  const line = (): Vec3[] => [stations[0], ...pylons, stations[1]];
  for (let pass = 0; pass < 16; pass += 1) {
    let raised = false;
    const points = line();
    for (let span = 0; span + 1 < points.length; span += 1) {
      const a = points[span];
      const b = points[span + 1];
      if (!a || !b) continue;
      const { deficit, at } = cableSpanDeficit(a, b);
      if (deficit <= 0.01) continue;
      const lift = deficit + 0.05;
      const startMast = span >= 1 ? pylons[span - 1] : undefined;
      const endMast = span + 1 <= pylons.length ? pylons[span] : undefined;
      if (startMast && endMast) {
        startMast.y += lift;
        endMast.y += lift;
      } else if (endMast) {
        endMast.y += lift / Math.max(0.2, at);
      } else if (startMast) {
        startMast.y += lift / Math.max(0.2, 1 - at);
      }
      raised = true;
    }
    if (!raised) break;
  }
  cablePoints.push(...pylons, stations[1]);
  return {
    ridePath: makeRoute('tbar_ride', ride),
    cable: makeRoute('tbar_cable', cablePoints),
    bottom: vec3(TBAR_BOTTOM.x, sampleMapHeight(TBAR_BOTTOM.x, TBAR_BOTTOM.z), TBAR_BOTTOM.z),
    top: vec3(TBAR_TOP.x, sampleMapHeight(TBAR_TOP.x, TBAR_TOP.z), TBAR_TOP.z),
    pylons,
    bars: 8,
    speed: 11,
  };
}

// ---------------------------------------------------------------------------
// Alpine coaster
// ---------------------------------------------------------------------------

const COASTER_LIP = vec3(110, 12, -140);
const COASTER_RAMP_ANGLE = Math.PI / 4;

function buildCoaster(): CoasterRoute {
  // Everything but the lip is spline-sampled; the 45° kicker is analytic.
  const control = COASTER_CONTROL.slice(0, -2);
  const lowPoint = vec3(119, 6.2, -131);
  control.push(lowPoint);
  const sampled = catmullRom(control, 2);

  // Raise the trough on trestles: well clear of the snow, higher still over the tank road.
  for (const point of sampled) {
    const ground = sampleMapHeight(point.x, point.z);
    const roadDistance = projectOnPolyline(point.x, point.z, TANK_ROAD_POINTS).distance;
    const clearance = roadDistance < TANK_ROAD_WIDTH ? 6.5 : 4.5;
    point.y = Math.max(point.y, ground + clearance);
  }
  // Smooth the profile so pillars and banking read as one continuous track.
  for (let pass = 0; pass < 4; pass += 1) {
    const copy = sampled.map((point) => point.y);
    for (let index = 2; index < sampled.length - 2; index += 1) {
      const point = sampled[index];
      if (!point) continue;
      const average =
        ((copy[index - 2] ?? point.y) + (copy[index - 1] ?? point.y) + point.y + (copy[index + 1] ?? point.y) + (copy[index + 2] ?? point.y)) / 5;
      point.y = Math.max(average, sampleMapHeight(point.x, point.z) + 3.5);
    }
  }
  // Downhill all the way to the kicker: raise any point that is not above the
  // next one (this lifts the upstream end; the start platform follows it).
  for (let index = sampled.length - 2; index >= 0; index -= 1) {
    const point = sampled[index];
    const next = sampled[index + 1];
    if (point && next) point.y = Math.max(point.y, next.y + 0.04);
  }

  // Parabolic kicker from the low point to the lip with a 45° exit tangent.
  const kick: Vec3[] = [];
  const horizontal = Math.hypot(COASTER_LIP.x - lowPoint.x, COASTER_LIP.z - lowPoint.z);
  const start = sampled[sampled.length - 1] ?? lowPoint;
  const rise = COASTER_LIP.y - start.y;
  const samples = 8;
  for (let index = 1; index <= samples; index += 1) {
    const t = index / samples;
    kick.push({
      x: lerp(start.x, COASTER_LIP.x, t),
      y: start.y + rise * t * t,
      z: lerp(start.z, COASTER_LIP.z, t),
    });
  }
  const points = [...sampled, ...kick];
  const track = makeRoute('alpine_coaster', points);

  // Bank angles from horizontal curvature.
  const bank: number[] = points.map((point, index) => {
    const previous = points[Math.max(0, index - 3)] ?? point;
    const next = points[Math.min(points.length - 1, index + 3)] ?? point;
    const headingA = Math.atan2(point.x - previous.x, point.z - previous.z);
    const headingB = Math.atan2(next.x - point.x, next.z - point.z);
    let turn = headingB - headingA;
    if (turn > Math.PI) turn -= Math.PI * 2;
    if (turn < -Math.PI) turn += Math.PI * 2;
    const distance = Math.max(1, Math.hypot(next.x - previous.x, next.z - previous.z));
    return clamp((turn / distance) * 26, -0.62, 0.62);
  });

  const pillars: { top: Vec3; ground: number }[] = [];
  for (let distance = 6; distance < track.length - 4; distance += 9) {
    let low = 0;
    while (low + 1 < track.distances.length && (track.distances[low + 1] ?? 0) < distance) low += 1;
    const point = track.points[low];
    if (!point) continue;
    const ground = sampleMapHeight(point.x, point.z);
    if (point.y - ground < 1.4) continue;
    pillars.push({ top: { ...point }, ground });
  }
  // A last timber bent right under the jump-ramp lip.
  const lip = track.points[Math.max(0, track.points.length - 2)];
  if (lip) pillars.push({ top: { ...lip }, ground: sampleMapHeight(lip.x, lip.z) });
  return {
    track,
    bank,
    kickerStart: sampled.length - 1,
    start: { ...(points[0] ?? COASTER_CONTROL[0] ?? COASTER_LIP) },
    rampEnd: { ...COASTER_LIP },
    rampAngle: COASTER_RAMP_ANGLE,
    pillars,
    speed: 24,
  };
}

// ---------------------------------------------------------------------------
// Hammock catapult, cow, runways, gorge stream
// ---------------------------------------------------------------------------

function buildHammock(): HammockCatapult {
  const seat = vec3(HAMMOCK_POSITION.x, HAMMOCK_POSITION.y + 1.1, HAMMOCK_POSITION.z);
  const target = { ...HAMMOCK_TARGET };
  const apex = Math.max(seat.y, target.y) + 24;
  const points: Vec3[] = [];
  const samples = 48;
  for (let index = 0; index <= samples; index += 1) {
    const t = index / samples;
    // Quadratic Bézier through an apex control point gives a clean ballistic arc.
    const controlY = 2 * apex - (seat.y + target.y) / 2;
    const y = (1 - t) * (1 - t) * seat.y + 2 * (1 - t) * t * controlY + t * t * target.y;
    points.push(vec3(lerp(seat.x, target.x, t), y, lerp(seat.z, target.z, t)));
  }
  const yaw = Math.atan2(target.x - seat.x, target.z - seat.z);
  const side = { x: Math.cos(yaw), z: -Math.sin(yaw) };
  return {
    anchorA: vec3(HAMMOCK_POSITION.x + side.x * 3.6, HAMMOCK_POSITION.y, HAMMOCK_POSITION.z + side.z * 3.6),
    anchorB: vec3(HAMMOCK_POSITION.x - side.x * 3.6, HAMMOCK_POSITION.y, HAMMOCK_POSITION.z - side.z * 3.6),
    seat,
    target,
    arc: makeRoute('hammock_arc', points),
    tensionSeconds: 1.5,
  };
}

function buildCow(): CowPatrol {
  const home = { ...COW_HOME };
  const patrol = [
    vec3(0, 18, 38),
    vec3(-12, 18, 34),
    vec3(-16, 18, 24),
    vec3(-4, 18, 22),
    vec3(10, 18, 28),
    vec3(14, 18, 38),
  ];
  const rampage = [
    vec3(0, 18, 38),
    vec3(0, 18.1, 58),
    vec3(0, 17.8, 72),
    vec3(0, 18.1, 90),
    vec3(4, 18.4, 104),
    vec3(-3, 18.1, 86),
    vec3(1, 17.8, 66),
    vec3(-12, 18, 40),
    vec3(14, 18, 22),
    vec3(-14, 18, 8),
    vec3(12, 18, -10),
    vec3(-6, 18, -24),
    vec3(0, 18, -12),
    vec3(0, 18, 38),
  ];
  return { home, patrol, rampageRoute: makeRoute('cow_rampage', rampage) };
}

function buildGorgeStream(): RoutePolyline {
  const points: Vec3[] = [];
  for (let x = GORGE.eastEnd - 16; x >= GORGE.westEnd + 22; x -= 3) {
    const z = GORGE.centerAt(x);
    let low = Number.POSITIVE_INFINITY;
    for (const offset of [-1.5, 0, 1.5]) low = Math.min(low, sampleMapHeight(x, z + offset));
    points.push(vec3(x, Math.max(0.05, low + 0.22), z));
  }
  return makeRoute('gorge_stream', points);
}

function buildRunways(): Runway[] {
  return [
    { id: 'water_runway', start: { ...WATER_RUNWAY.start }, end: { ...WATER_RUNWAY.end }, width: WATER_RUNWAY.width, surface: 'water' },
    {
      id: 'glacier_runway',
      start: { ...GLACIER_RUNWAY.start },
      end: { ...GLACIER_RUNWAY.end },
      width: GLACIER_RUNWAY.width,
      surface: 'snow',
    },
  ];
}

export const FJORD_ROUTES: MapRoutes = {
  tankRoad: road('tank_road', TANK_ROAD_POINTS, TANK_ROAD_WIDTH),
  coastalRamp: { ...road('coastal_ramp', COASTAL_RAMP_POINTS, COASTAL_RAMP_WIDTH), surface: 'sand' },
  villageLanes: VILLAGE_LANE_POINTS.map((points, index) => road(`village_lane_${index}`, points, VILLAGE_LANE_WIDTH)),
  cableCar: buildCableCar(),
  tBar: buildTBar(),
  coaster: buildCoaster(),
  runways: buildRunways(),
  hammock: buildHammock(),
  cow: buildCow(),
  gorgeStream: buildGorgeStream(),
};
