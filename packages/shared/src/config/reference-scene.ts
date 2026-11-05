/** The playable Gletscherpass slice uses the same map/colliders and binary protocol. */
import { CONQUEST_TOWERS } from './conquest.js';
import { FJORD_MAP, sampleMapHeight } from './map-fjord.js';
import { roofBase } from './map/buildings.js';
import { VEHICLE_SLOTS, type VehicleSlot } from './vehicles.js';
import type { Faction, TowerDefinition, Vec3, MapProp } from '../types/index.js';

export const REFERENCE_SCENE = {
  id: 'reference',
  view: { yaw: -1.35, pitch: -.30 },
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
  vehicle(201, 'fondue_crawler', 14, 99, -1.5), vehicle(202, 'sidecar', 30, 48, -1.4),
  ...VEHICLE_SLOTS.filter(slot => slot.kind === 'cable_car'),
];

/** Solid marker bases/poles; identical on server and local prediction. */
const flags: MapProp[] = REFERENCE_TOWERS.map(tower => ({
  id: `reference_${tower.id}`, kind: 'flag', position: tower.position, rotationY: 0, scale: 1, variant: 0,
  colliders: [{ type: 'cylinder', radius: .12, halfHeight: 3.25, offset: { x: 0, y: 3.25, z: 0 }, surface: 'wood' }],
}));

/** Three eight-sided strata: irregular solid geology, with one shared set of
 * points for the visible faces and Rapier hull. Deliberately outside routes. */
const boulders: MapProp[] = [
  [37,62,1.5,.72,.85,.4], [35.5,59,1.1,.9,.7,-.8], [33,54,1.7,.6,.8,.1],
  [41,58,.85,.75,.65,.6], [36,66,1.3,.7,.7,.3], [48,65,1.5,.65,.9,-.3],
  [26,97,1.1,.65,.65,1], [25,113,1.8,.8,.9,-.4], [31,107,1.1,.55,.8,.7],
  [-14,57,1.4,.65,.8,.8], [-21,60,.9,.8,.7,.3], [-27,51,1.1,.65,.9,.1],
  [35,45,1.4,.55,.9,.9], [16,91,.9,.7,.8,.2],
].flatMap(([x=0,z=0,width=1,height=1,depth=1,yaw=0],i): MapProp[] => {
  const vertices:Vec3[]=[];
  for(const [radius,y] of [[.76,0],[1,.22],[.64,1]] as const)for(let side=0;side<8;side++) {
    const angle=side*Math.PI/4+.11*Math.sin(i*2.3),irregular=1+.055*Math.sin(side*2.1+i*1.7);
    const px=Math.sin(angle)*width*radius*irregular,pz=Math.cos(angle)*depth*radius*irregular;
    vertices.push({x:px,y:y*height+(y>.9?px*.07+pz*.05:0),z:pz});
  }
  const c=Math.cos(yaw),s=Math.sin(yaw);
  const floors=[sampleMapHeight(x,z),...vertices.slice(8,16).map(p=>sampleMapHeight(x+c*p.x+s*p.z,z-s*p.x+c*p.z))];
  const floor=Math.min(...floors);
  if(floor<17||Math.max(...floors)-floor>height*.8)return [];
  return [{id:`reference_boulder_${i}`,kind:'rock',position:{x,y:floor-.08,z},rotationY:yaw,scale:1,variant:i%4,
    colliders:[{type:'hull',vertices,offset:{x:0,y:0,z:0},surface:'rock_cliff'}]}];
});

/** Solid original crate dressing, away from the bridge and chalet door routes. */
export const REFERENCE_MARKERS: readonly MapProp[] = [...flags, ...boulders, ...[
  [18,99,.15], [19.3,99,.03], [27,108,-.3], [-7,44,.2], [-8.3,44,-.1], [34,53,.4],
].map(([x,z,yaw],i): MapProp => ({
  id: `reference_crate_${i}`, kind: 'crate_stack', position: { x:x!, y:sampleMapHeight(x!,z!), z:z! },
  rotationY:yaw!,scale:1,variant:0,
  colliders:[{type:'box',halfExtents:{x:.60,y:.60,z:.60},offset:{x:0,y:.60,z:0},surface:'wood'}],
}))];

/** The live reference cast returns to its combat area; the rooftop guard has
 * an actual supported snow-roof spawn, clear of the five fire patches. */
export function referenceCastSpawn(index:number): {position:Vec3;yaw:number} {
  if(index===0) {
    const chalet=FJORD_MAP.props.find(p=>p.id==='chalet_north')!,layout=chalet.building!;
    const x=-layout.width*.38,z=layout.depth*.37;
    const y=roofBase(layout)+Math.tan(layout.roof.pitch)*(layout.width/2+layout.roof.overhang-Math.abs(x))+.36;
    const position={x:chalet.position.x+Math.cos(chalet.rotationY)*x+Math.sin(chalet.rotationY)*z,
      y:chalet.position.y+y,z:chalet.position.z-Math.sin(chalet.rotationY)*x+Math.cos(chalet.rotationY)*z};
    return {position,yaw:Math.atan2(-position.x,71.5-position.z)};
  }
  const [x,z]=([[7,43],[-6,47],[-5,105],[1,75.5],[0,87],[12,96]][index]??[7,43]) as [number,number];
  // Collision uses four straight bridge ramps. Spawning on the smooth sag
  // curve can put a hoof below a ramp and let the cow fall through on join.
  const deck=FJORD_MAP.props.find(p=>p.kind==='bridge_deck'&&p.dimensions
    &&Math.abs(x-p.position.x)<=p.dimensions.x/2&&z>=p.position.z&&z<=p.position.z+p.dimensions.z);
  const height=deck?.dimensions?deck.position.y+deck.dimensions.y*(z-deck.position.z)/deck.dimensions.z:sampleMapHeight(x,z);
  return {position:{x,y:height+(index===4?.15:.05),z},yaw:index===1||index===4?-.2:Math.PI};
}
