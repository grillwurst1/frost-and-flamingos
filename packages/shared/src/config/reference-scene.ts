/** The playable Gletscherpass slice uses the same map/colliders and binary protocol. */
import { CONQUEST_TOWERS } from './conquest.js';
import { sampleMapHeight } from './map-fjord.js';
import { VEHICLE_SLOTS, type VehicleSlot } from './vehicles.js';
import type { Faction, TowerDefinition, Vec3, MapProp } from '../types/index.js';

export const REFERENCE_SCENE = {
  id: 'reference',
  view: { yaw: -1.2, pitch: -.30 },
  focus: { x: 8, z: 75 },
  spawn: { alpine: { x: 40, z: 66 }, lagoon: { x: -18, z: 112 } },
} as const;
const points = [{ x: -4, y: 18.3, z: 47 }, { x: 0, y: 16.9, z: 71.5 }, { x: 16, y: 18.4, z: 105 }];
export const REFERENCE_TOWERS: readonly TowerDefinition[] = CONQUEST_TOWERS.map((tower, i) => ({
  ...tower, position: points[i]!, captureRadius: i === 1 ? 2.5 : 7, homeFaction: i === 0 ? 'alpine' : i === 2 ? 'lagoon' : null,
  labelKey: (['reference.chalet', 'reference.bridge', 'reference.camp'] as const)[i]!,
  spawnPads: [], attachPoints: [],
}));
export function referenceSpawn(faction: Faction, index = 0): { position: Vec3; yaw: number } {
  const base = REFERENCE_SCENE.spawn[faction];
  // First visitor gets the exact authored vista; occupied pads get a safe grid.
  const x = base.x + (index % 3) * 2, z = base.z + Math.floor(index / 3) * 2;
  return { position: { x, y: sampleMapHeight(x, z) + .05, z }, yaw: faction === 'alpine' ? REFERENCE_SCENE.view.yaw : 2.9 };
}
const vehicle = (id: number, kind: VehicleSlot['kind'], x: number, z: number, yaw: number): VehicleSlot => ({
  id, kind, spawn: { id: `reference_${kind}`, vehicle: kind, position: { x, y: sampleMapHeight(x, z) + .05, z },
    rotationY: yaw, faction: null, trigger: 'map' },
});
export const REFERENCE_VEHICLES: readonly VehicleSlot[] = [
  vehicle(201, 'fondue_crawler', 22, 103, -1.5), vehicle(202, 'sidecar', 30, 48, -1.4),
  ...VEHICLE_SLOTS.filter(slot => slot.kind === 'cable_car'),
];

/** Solid marker bases/poles; identical on server and local prediction. */
const flags: MapProp[] = REFERENCE_TOWERS.map(tower => ({
  id: `reference_${tower.id}`, kind: 'flag', position: tower.position, rotationY: 0, scale: 1, variant: 0,
  colliders: [{ type: 'cylinder', radius: .12, halfHeight: 3.25, offset: { x: 0, y: 3.25, z: 0 }, surface: 'wood' }],
}));

/** Solid original crate dressing, away from the bridge and chalet door routes. */
export const REFERENCE_MARKERS: readonly MapProp[] = [...flags, ...[
  [18,99,.15], [19.3,99,.03], [27,108,-.3], [-7,44,.2], [-8.3,44,-.1], [34,53,.4],
].map(([x,z,yaw],i): MapProp => ({
  id: `reference_crate_${i}`, kind: 'crate_stack', position: { x:x!, y:sampleMapHeight(x!,z!), z:z! },
  rotationY:yaw!,scale:1,variant:0,
  colliders:[{type:'box',halfExtents:{x:.60,y:.60,z:.60},offset:{x:0,y:.60,z:0},surface:'wood'}],
}))];
