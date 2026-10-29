import { beforeAll, afterAll, expect, test } from 'bun:test';
import { FJORD_MAP, InputButton, MID_SUPPORT_STAIRS, vehicleLocalToWorld, MAP_HALF_SIZE, PhysicsWorld, colliderHeightAt } from '@frost-and-flamingos/shared';
import { crateStackParts } from '../../../packages/shared/src/config/map/solids';

let world: PhysicsWorld;
beforeAll(async () => { world = await PhysicsWorld.create(); });
afterAll(() => world.dispose());

test('every route fence has a physical rail, rather than decoration-only geometry', () => {
  const fences = FJORD_MAP.props.filter(p => p.kind === 'fence' && !p.id.startsWith('boundary_'));
  expect(fences.length).toBeGreaterThan(4);
  for (const prop of fences) expect(prop.colliders.length).toBeGreaterThan(0);
});

test('the upper crate in every stack really supports feet and stops chest-height rays', () => {
  for (const prop of FJORD_MAP.props.filter(p => p.kind === 'crate_stack')) {
    const top = crateStackParts(prop.variant).filter(p => p.kind === 'crate').sort((a, b) => b.position.y - a.position.y)[0]!;
    const c = Math.cos(prop.rotationY), s = Math.sin(prop.rotationY);
    const x = prop.position.x + c * top.position.x + s * top.position.z;
    const z = prop.position.z - s * top.position.x + c * top.position.z;
    const y = prop.position.y + top.position.y + top.size;
    const hit = world.raycast({ x, y: y + 0.15, z }, { x: 0, y: -1, z: 0 }, 0.3);
    expect(hit, prop.id).not.toBeNull();
    expect(hit!.point.y, prop.id).toBeCloseTo(y, 2);
  }
});

test('a walking character cannot pass straight through a route fence', () => {
  const fence = FJORD_MAP.props.find(p => p.kind === 'fence' && p.id.startsWith('lane_') && p.colliders.length > 0)!;
  const piece = fence.colliders.find(c => c.type === 'box')!;
  const yaw = piece.type === 'box' ? piece.rotation?.y ?? 0 : 0;
  const nx = Math.cos(yaw), nz = -Math.sin(yaw);
  const cx = fence.position.x + piece.offset.x, cz = fence.position.z + piece.offset.z;
  const x = cx - nx * 1.5, z = cz - nz * 1.5;
  const body = world.createCharacter({ classId: 'allrounder', faction: 'alpine', position: { x, y: colliderHeightAt(x, z) + 0.1, z } });
  try {
    for (let tick = 0; tick < 180; tick++) {
      body.simulate({ sequence: tick, buttons: InputButton.Forward, yaw: Math.atan2(nx, nz), pitch: 0, weaponSlot: 1 }); world.step();
    }
    expect((body.position.x - cx) * nx + (body.position.z - cz) * nz).toBeLessThan(-0.15);
  } finally { world.removeCharacter(body); }
});

test('visible perimeter markers follow the same hard map limit', () => {
  const markers = FJORD_MAP.props.filter(p => p.id.startsWith('boundary_'));
  expect(markers.length).toBeGreaterThan(10);
  for (const prop of markers) expect(Math.max(Math.abs(prop.position.x), Math.abs(prop.position.z))).toBeCloseTo(MAP_HALF_SIZE - 0.5, 3);
});

function walkTo(body: ReturnType<PhysicsWorld['createCharacter']>, target: { x: number; y: number; z: number }, label: string): void {
  let tick = 0;
  for (; tick < 360; tick++) {
    const p = body.position;
    if (Math.hypot(p.x - target.x, p.z - target.z) < .08) break;
    body.simulate({ sequence: tick, buttons: InputButton.Forward, yaw: Math.atan2(target.x - p.x, target.z - p.z), pitch: 0, weaponSlot: 1 });
    world.step();
  }
  expect(Math.hypot(body.position.x - target.x, body.position.z - target.z), label).toBeLessThan(.2);
  // A descending capsule can be briefly above the ramp between fixed ticks;
  // less than one ordinary stair riser is allowed, never a floor-height drop.
  expect(Math.abs(body.position.y - target.y), label).toBeLessThan(.24);
}

test('every building staircase connects both floors when walked up and down through its landings', () => {
  for (const prop of FJORD_MAP.props) for (const [i, flight] of (prop.building?.stairs ?? []).entries()) {
    const transform = (p: { x: number; y: number; z: number }) => ({
      x: prop.position.x + Math.cos(prop.rotationY) * p.x + Math.sin(prop.rotationY) * p.z,
      y: prop.position.y + p.y,
      z: prop.position.z - Math.sin(prop.rotationY) * p.x + Math.cos(prop.rotationY) * p.z,
    });
    const a = transform(flight.from), b = transform(flight.to), length = Math.hypot(b.x - a.x, b.z - a.z);
    const dx = (b.x - a.x) / length, dz = (b.z - a.z) / length;
    // The toe may face an exterior wall; approach it sideways from inside
    // the room instead of spawning beyond that wall in an impossible pad.
    const inward = ((a.x - prop.position.x) * dz - (a.z - prop.position.z) * dx) > 0 ? -1 : 1;
    const lower = { x: a.x + dx * .3 + dz * inward * 1.5, y: a.y, z: a.z + dz * .3 - dx * inward * 1.5 };
    const toe = { x: a.x + dx * .4, y: a.y + (b.y - a.y) * .4 / length, z: a.z + dz * .4 };
    b.x += dx * .7; b.z += dz * .7;
    const body = world.createCharacter({ classId: 'allrounder', faction: 'alpine', position: { ...lower, y: lower.y + .08 } });
    try {
      walkTo(body, toe, `${prop.id} stair ${i} approach`);
      walkTo(body, b, `${prop.id} stair ${i} up`);
      walkTo(body, toe, `${prop.id} stair ${i} down`);
      walkTo(body, lower, `${prop.id} stair ${i} leave`);
    }
    finally { world.removeCharacter(body); }
  }
});

for (const station of FJORD_MAP.routes.cableCar.stations) test(`${station.id} station stairs and landings can be walked both ways without jumping`, () => {
  const prop = FJORD_MAP.props.find(p => p.id === `cable_station_${station.id}`)!;
  const rise = prop.dimensions!.y, m = MID_SUPPORT_STAIRS;
  const local = station.id === 'mid' ? [
    { x: m.lower.fromX, y: 0, z: m.lower.z },
    { x: m.lower.toX + .6, y: rise / 2, z: m.lower.z },
    { x: m.lower.toX + .6, y: rise / 2, z: m.upper.z },
    { x: m.upper.toX - 1, y: rise, z: m.upper.z },
    { x: m.upper.toX - 1, y: rise, z: 1.5 },
  ] : station.id === 'mountain' ? [
    { x: 5.6, y: 0, z: -6.4 }, { x: 5.6, y: rise, z: .4 }, { x: 2.5, y: rise, z: .4 },
  ] : [{ x: 0, y: 0, z: 6 }, { x: 0, y: rise, z: 3 }];
  const points = local.map(p => vehicleLocalToWorld(prop.position, prop.rotationY, p));
  points[0]!.y = Math.max(points[0]!.y, colliderHeightAt(points[0]!.x, points[0]!.z));
  const body = world.createCharacter({ classId: 'allrounder', faction: 'alpine', position: { ...points[0]!, y: points[0]!.y + .08 } });
  try {
    for (const goal of [...points.slice(1), ...points.slice(0, -1).reverse()]) walkTo(body, goal, `${station.id} access`);
    expect(prop.position.y + rise).toBeCloseTo(station.platform.y, 4);
  } finally { world.removeCharacter(body); }
});
