import { beforeAll, afterAll, expect, test } from 'bun:test';
import { FJORD_MAP, InputButton, MAP_HALF_SIZE, PhysicsWorld, colliderHeightAt } from '@frost-and-flamingos/shared';
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
