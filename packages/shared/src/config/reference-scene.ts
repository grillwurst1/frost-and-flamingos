/** The playable Gletscherpass slice uses the same map/colliders and binary protocol. */
import { CONQUEST_TOWERS } from './conquest.js';
import { ARENA_ANCHORS, ARENA_CABLE, ARENA_CHALET, ARENA_GEOMETRY, arenaHeightAt as sampleMapHeight } from './reference-arena.js';
import { sampleCableCar } from '../physics/cable-car.js';
import { roofBase } from './map/buildings.js';
import { type VehicleSlot } from './vehicles.js';
import type { Faction, TowerDefinition, Vec3, MapProp } from '../types/index.js';

export const REFERENCE_SCENE = {
  id: 'reference',
  view: { yaw: .49, pitch: -.16 },
  focus: { x: 0, z: 0 },
  spawn: { alpine: ARENA_ANCHORS.alpine, lagoon: ARENA_ANCHORS.lagoon },
} as const;
const points = [{ x: -17, y: 18.4, z: 5 }, { x: 0, y: sampleMapHeight(0,0), z: 0 }, { x: 22, y: 18.4, z: 6 }];
export const REFERENCE_TOWERS: readonly TowerDefinition[] = CONQUEST_TOWERS.map((tower, i) => ({
  ...tower, position: points[i]!, captureRadius: i === 1 ? 6 : 7, homeFaction: i === 0 ? 'alpine' : i === 2 ? 'lagoon' : null,
  labelKey: (['reference.chalet', 'reference.basin', 'reference.camp'] as const)[i]!,
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
  vehicle(201, 'fondue_crawler', ARENA_ANCHORS.crawler.x, ARENA_ANCHORS.crawler.z, 1.4), vehicle(202, 'sidecar', ARENA_ANCHORS.sidecar.x, ARENA_ANCHORS.sidecar.z, -1.4),
  ...([0,1] as const).map(cabin=>{const pose=sampleCableCar(0,cabin,ARENA_CABLE);return {id:100+cabin,kind:'cable_car' as const,spawn:{id:`reference_cabin_${cabin}`,vehicle:'cable_car' as const,position:pose.position,rotationY:pose.yaw,faction:null,trigger:'map' as const}}}),
];

/** Solid marker bases/poles; identical on server and local prediction. */
const flags: MapProp[] = REFERENCE_TOWERS.map(tower => ({
  id: `reference_${tower.id}`, kind: 'flag', position: {...tower.position,x:tower.position.x+(tower.id==='tower_b'?-4:0),z:tower.position.z+(tower.id==='tower_b'?3:2)}, rotationY: 0, scale: 1, variant: 0,
  colliders: [{ type: 'cylinder', radius: .12, halfHeight: 1.22, offset: { x: 0, y: 1.22, z: 0 }, surface: 'wood' }],
}));

/** Three eight-sided strata: irregular solid geology, with one shared set of
 * points for the visible faces and Rapier hull. Deliberately outside routes. */
const boulders: MapProp[] = [
  [-8,-21,1.5,.72,.85,.4], [8,-22,1.1,.9,.7,-.8], [-10,-18,1.7,.6,.8,.1],
  [10,-16,.85,.75,.65,.6], [-28,-15,1.3,.7,.7,.3], [29,-11,1.5,.65,.9,-.3],
  [29,7,1.1,.65,.65,1], [26,10,1.8,.8,.9,-.4], [31,4,1.1,.55,.8,.7],
  [-30,3,1.4,.65,.8,.8], [-32,10,.9,.8,.7,.3], [-31,19,1.1,.65,.9,.1],
  [9,35,1.4,.55,.9,.9], [22,35,.9,.7,.8,.2],
  [4.5,-18.5,.9,.65,.65,.25],
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
  [25,6,.15], [26.3,6,.03], [29,10,-.3], [-13,6,.2], [-14.3,6,-.1], [8,-25,.4],
].map(([x,z,yaw],i): MapProp => ({
  id: `reference_crate_${i}`, kind: 'crate_stack', position: { x:x!, y:sampleMapHeight(x!,z!), z:z! },
  rotationY:yaw!,scale:1,variant:0,
  colliders:[{type:'box',halfExtents:{x:.60,y:.60,z:.60},offset:{x:0,y:.60,z:0},surface:'wood'}],
}))];

/** The live reference cast returns to its combat area; the rooftop guard has
 * an actual supported snow-roof spawn, clear of the five fire patches. */
export function referenceCastSpawn(index:number): {position:Vec3;yaw:number} {
  if(index===0) {
    const chalet=ARENA_CHALET,layout=chalet.building!;
    const x=-layout.width*.38,z=layout.depth*.37;
    const y=roofBase(layout)+Math.tan(layout.roof.pitch)*(layout.width/2+layout.roof.overhang-Math.abs(x))+.36;
    const position={x:chalet.position.x+Math.cos(chalet.rotationY)*x+Math.sin(chalet.rotationY)*z,
      y:chalet.position.y+y,z:chalet.position.z-Math.sin(chalet.rotationY)*x+Math.cos(chalet.rotationY)*z};
    return {position,yaw:Math.atan2(-position.x,-position.z)};
  }
  const [x,z]=([[-20,14],[-6.4,-13],[10,8],[7,0],[4,0],[6.2,-13]][index]??[-14,-1]) as [number,number];
  const height=sampleMapHeight(x,z);
  return {position:{x,y:height+(index===4?.15:.05),z},yaw:index===1?1.2:index===4?-.2:Math.PI};
}

export const REFERENCE_WORLD={...ARENA_GEOMETRY,props:[...ARENA_GEOMETRY.props,...REFERENCE_MARKERS]};
