/** Authored compact terrain and solid routes for the PHOTO arena.
 * Rendering, prediction and authority consume this same compact blueprint. */
import type { BuildingLayout, CableCarRoute, HeightfieldData, MapProp, NavGraph, StaticWorldDefinition, SurfaceTag } from '../types/map.js';
import type { Vec3 } from '../types/index.js';
import { boxCollider, buildingColliders, chaletLayout, rampCollider, roofBase, stairCollider } from './map/buildings.js';
import { sampleHeightfield } from './map/heightfield.js';
import { makeRoute } from './map/math.js';
import { CABLE_BRAKE_HANDLE } from './map/layout.js';
export const ARENA_SIZE = 128;
export const ARENA_SEGMENTS = 256;
export const ARENA_LEVELS = { foreground: 23, bank: 18.4, north: 28, east: 14.4 } as const;
export const ARENA_VILLAGE = {
  main: { x: -24, z: 23, y: 24.8, width: 13, depth: 10 },
  rear: { x: -10.5, z: 28, y: 24.8, width: 9, depth: 7 },
} as const;
const STATION_FOUNDATIONS = [
  {x:-30,z:36,y:24.8,rx:4,rz:6}, {x:0,z:40,y:28,rx:4,rz:4}, {x:27,z:18,y:18.4,rx:6,rz:6},
] as const;
const GROUND_PADS = [...Object.values(ARENA_VILLAGE).map(p=>({...p,rx:p.width/2+1.3,rz:p.depth/2+1.3})),...STATION_FOUNDATIONS];
export const ARENA_ANCHORS = { alpine: { x: 0, z: -20 }, lagoon: { x: 23, z: 9 }, preview: { x: 0, z: -24 }, chalet: { x: ARENA_VILLAGE.main.x, z: ARENA_VILLAGE.main.z }, crawler: { x: -7.6, z: -7.5 }, sidecar: { x: 10, z: -22 } } as const;
const smooth = (a: number, b: number, value: number) => { const t = Math.max(0, Math.min(1, (value - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Positive inside a rounded shelf. Overlapping shelves keep route seams solid. */
function shelfDistance(x: number, z: number, x0: number, x1: number, z0: number, z1: number): number {
  const r = 1.8, qx = Math.abs(x - (x0 + x1) / 2) - ((x1 - x0) / 2 - r), qz = Math.abs(z - (z0 + z1) / 2) - ((z1 - z0) / 2 - r);
  return r - Math.hypot(Math.max(0, qx), Math.max(0, qz)) - Math.min(0, Math.max(qx, qz));
}
function peak(x: number, z: number, cx: number, cz: number, radius: number, height: number): number {
  const t = Math.max(0, 1 - ((x - cx) ** 2 + (z - cz) ** 2) / (radius * radius));
  return height * t * t * t;
}
/** Physical rounded snow banks, sampled into the same collision/render grid.
 * The pattern has finite support; paths and foundations are cleared below. */
export const ARENA_SNOW_BANKS = [
  [-7,-23,3.8,2.6,.65],[7,-23,4.4,2.6,.7],[-12,-15,4.1,2.8,.8],[10,-13,4.3,2.6,.9],
  [-27,-8,4.2,3.1,.9],[-23,-3,3.5,2.5,.8],[-13,4,4,2.6,.75],[-7,7,3.9,2.8,.85],
  [1,9,4.1,2.7,.85],[8,7,4,3,.8],[15,-2,3.7,2.4,.9],[26,-5,4.1,2.8,1.05],
  [-29,10,4.4,3.1,1],[-16,11,4,2.8,.8],[-9,16,4.4,3.2,.9],[-1,18,4.2,3,.8],
  [8,16,4.5,3.4,.95],[22,12,4.5,3.2,1.1],[29,16,4.3,3.1,.95],[-4,28,4.7,3.2,.85],
  [7,29,4.7,3.5,.85],[17,29,4.4,3.1,1],[28,28,4.3,3.1,.9],
  [-13,-19,2.2,1.5,.5],[-4,-16,2.4,1.6,.42],[3,-18,2.2,1.7,.46],[13,-19,2.3,1.6,.55],
  [-24,-10,2.3,1.7,.55],[-22,-7,2.1,1.5,.5],[-24,3,2.4,1.6,.6],[-14,8,2.2,1.5,.45],
  [-11,9,2.3,1.7,.52],[-4,8,2.1,1.6,.48],[3,5,2.4,1.6,.52],[9,4,2.2,1.5,.5],
  [-5,15,2.3,1.7,.5],[4,16,2.4,1.5,.48],[12,17,2.3,1.8,.55],[26,4,2.5,1.7,.65],
  [-10,-10,6.7,5.5,2.3],
] as const;
function bankTop(x: number, z: number): number {
  // Straight grades match the two long stair ramps, including their landings.
  const grade = lerp(ARENA_LEVELS.foreground, ARENA_LEVELS.bank, Math.max(0, Math.min(1, (z + 20) / 14)));
  const axisDistance=Math.min(Math.abs(x+18),Math.abs(x-20));
  const stairBlend=1-smooth(1.7,3.2,axisDistance);
  const low=lerp(lerp(ARENA_LEVELS.foreground,ARENA_LEVELS.bank,smooth(-20,-6,z)),grade,stairBlend);
  const plateau = lerp(low, ARENA_LEVELS.north, smooth(x < -21 ? 31 : 24, x < -21 ? 45 : 40, z));
  const clearRoute = Math.abs(x+18)<3 || Math.abs(x-20)<3;
  const drifts=clearRoute?0:peak(x,z,7,-26,5,1.2)+peak(x,z,-10,-25,5,1.1)+peak(x,z,27,-20,5,1.4)
    +peak(x,z,-30,-9,4,1.2)+peak(x,z,31,-1,3.5,1.5)+peak(x,z,-6,32,3,1.4);
  const basinSnow=clearRoute?0:peak(x,z,7,8,6,1.5)+peak(x,z,-8,11,5,.8)+peak(x,z,10,22,5,1.4)+peak(x,z,14,6,8,3.5)+peak(x,z,4,-13,5,.6)+peak(x,z,-8,-14,6,.8);
  let snowBanks=0;
  for(const [cx,cz,rx,rz,height] of ARENA_SNOW_BANKS) {
    const t=Math.max(0,1-((x-cx)/rx)**2-((z-cz)/rz)**2);
    snowBanks+=height*t*t;
  }
  const paths=smooth(1.8,3.5,axisDistance)*smooth(.75,2.2,Math.abs(z));
  let height=plateau+drifts+basinSnow+snowBanks*paths
    +peak(x,z,-31,49,6,12)+peak(x,z,-15,50,8,9)+peak(x,z,29,35,7,3.5);
  let closest=Infinity,weight=0,level=0;
  for(const pad of GROUND_PADS) {
    const dx=Math.max(0,Math.abs(x-pad.x)-pad.rx),dz=Math.max(0,Math.abs(z-pad.z)-pad.rz);
    const distance=Math.hypot(dx,dz);
    if(distance<.00001)return pad.y;
    closest=Math.min(closest,distance);
    const influence=(1-smooth(0,14,distance))/(distance*distance);
    weight+=influence;level+=influence*pad.y;
  }
  if(weight>0)height=lerp(height,level/weight,1-smooth(0,14,closest));
  // A level, physical packed-snow turnout supports both tracks of the crawler.
  // Its short shoulder leaves the basin crossing and stair lanes unchanged.
  const crawler=ARENA_ANCHORS.crawler;
  const turnout=Math.hypot(Math.max(0,Math.abs(x-crawler.x)-4),Math.max(0,Math.abs(z-crawler.z)-2.8));
  height=lerp(height,21.4,1-smooth(0,4,turnout));
  return height;
}
function analyticHeight(x: number, z: number): number {
  const wave = Math.sin(z * .31) * .55 * smooth(3, 8, Math.abs(z));
  const d = Math.max(shelfDistance(x, z, -35, 35, -30, -16), shelfDistance(x, z, -35, -10 + wave, -20, 38), shelfDistance(x, z, 10 + wave, 34, -20, 38), shelfDistance(x, z, -35, 35, 28, 47),shelfDistance(x,z,-13,13,-25,40));
  const inside=smooth(-4,2,d);
  if(inside===1)return bankTop(x,z);
  // The supplied video is an enclosed Alpine valley. Extend the same physical
  // grid into snow terraces/rims instead of the previous island and beach.
  let outer=lerp(23,28,smooth(5,48,z));
  outer=lerp(outer,lerp(18.4,ARENA_LEVELS.east,smooth(30,55,x)),smooth(27,43,x));
  outer+=peak(x,z,-51,30,23,13)+peak(x,z,-45,-37,19,9)
    +peak(x,z,55,42,18,20)+peak(x,z,12,61,24,13)+peak(x,z,50,-34,18,11);
  // Keep both existing eastern flights and their landing open above the snow.
  const upper=lerp(18.4,16,Math.max(0,Math.min(1,(x-32.5)/12.5)));
  const lower=lerp(16,ARENA_LEVELS.east,Math.max(0,Math.min(1,(z-15.5)/12.5)));
  let height=inside===0?outer:lerp(outer,bankTop(x,z),inside);
  height=lerp(height,upper,(1-smooth(1.6,3.5,Math.abs(z-14)))*smooth(29,32,x));
  return lerp(height,lower,(1-smooth(1.6,3.5,Math.abs(x-46.5)))*smooth(11,13,z)*(1-smooth(30,34,z)));
}
const heights = new Float32Array((ARENA_SEGMENTS + 1) ** 2);
for (let col = 0; col <= ARENA_SEGMENTS; col++)
  for (let row = 0; row <= ARENA_SEGMENTS; row++)
    heights[col * (ARENA_SEGMENTS + 1) + row] = analyticHeight(-ARENA_SIZE / 2 + col * ARENA_SIZE / ARENA_SEGMENTS, -ARENA_SIZE / 2 + row * ARENA_SIZE / ARENA_SEGMENTS);
export const ARENA_GRID: HeightfieldData = { size: ARENA_SIZE, segments: ARENA_SEGMENTS, heights };
export function arenaHeightAt(x: number, z: number): number { return sampleHeightfield(ARENA_GRID, x, z); }
/** The video village has low cabins under broad gables, rather than two-storey lodges. */
function villageCabin(shell: BuildingLayout): BuildingLayout {
  const { balcony: _balcony, ...body } = shell;
  return { ...body, floors: body.floors.slice(0, 1), stairs: [], stairwells: [] };
}
const layout = villageCabin(chaletLayout({ style: 'log_chalet', width: ARENA_VILLAGE.main.width, depth: ARENA_VILLAGE.main.depth, snow: true, doorOffset: -2.2, nameKey: 'world.buildings.bakery' }));
export const ARENA_CHALET: MapProp = { id: 'arena_chalet', kind: 'chalet', position: { ...ARENA_ANCHORS.chalet, y: ARENA_VILLAGE.main.y }, rotationY: Math.PI, scale: 1, variant: 3,
  building: layout, destructibleId: 'building_chalet_north', colliders: buildingColliders(layout, 'building_chalet_north') };
const rearLayout=villageCabin(chaletLayout({style:'log_chalet',width:ARENA_VILLAGE.rear.width,depth:ARENA_VILLAGE.rear.depth,snow:true,doorOffset:1.2,nameKey:'world.buildings.milkHut'}));
export const ARENA_REAR_CHALET:MapProp={id:'arena_rear_chalet',kind:'chalet',position:{x:ARENA_VILLAGE.rear.x,y:ARENA_VILLAGE.rear.y,z:ARENA_VILLAGE.rear.z},rotationY:Math.PI,scale:1,variant:3,building:rearLayout,colliders:buildingColliders(rearLayout)};
export const ARENA_BUILDINGS:readonly MapProp[]=[ARENA_CHALET,ARENA_REAR_CHALET];
const rearStep:MapProp={id:'arena_rear_step',kind:'stairs',position:{x:ARENA_VILLAGE.rear.x-1.2,y:ARENA_VILLAGE.rear.y,z:ARENA_VILLAGE.rear.z-4.05},rotationY:0,scale:1,variant:0,dimensions:{x:2.4,y:.225,z:1.1},colliders:[boxCollider(1.2,.1125,.55,0,.1125,0,{surface:'cobblestone'})]};

/** Render these explicit solid steps from their dimensions, including side door. */
const chaletSteps: MapProp[] = [{ x: 2.2, z: -5.55, width: 2.4, depth: 1.1 }, { x: -7.05, z: -3, width: 1.1, depth: 2.4 }].map((p, i) => ({
  id: `arena_chalet_step_${i}`, kind: 'stairs', position: { x: ARENA_CHALET.position.x + p.x, y: ARENA_CHALET.position.y, z: ARENA_CHALET.position.z + p.z },
  rotationY: 0, scale: 1, variant: 0, dimensions: { x: p.width, y: layout.plinth / 2, z: p.depth },
  colliders: [boxCollider(p.width / 2, layout.plinth / 4, p.depth / 2, 0, layout.plinth / 4, 0, { surface: 'cobblestone' })],
}));
export const ARENA_ACCESS_FLIGHTS = [
  { id: 'west', from: { x: -18, y: 23.08, z: -20 }, to: { x: -18, y: 18.48, z: -6 }, width: 3 },
  { id: 'east', from: { x: 20, y: 23.08, z: -20 }, to: { x: 20, y: 18.48, z: -6 }, width: 3 },
  { id: 'coast_upper', from: { x: 32.5, y: 18.48, z: 14 }, to: { x: 45, y: 16.08, z: 14 }, width: 3 },
  { id: 'coast_lower', from: { x: 46.5, y: 16.08, z: 15.5 }, to: { x: 46.5, y: 14.48, z: 28 }, width: 3 },
] as const;
const access: MapProp[] = ARENA_ACCESS_FLIGHTS.map(f => ({ id: `arena_stairs_${f.id}`, kind: 'stairs', position: { x: 0, y: 0, z: 0 }, rotationY: 0, scale: 1, variant: 0,
  path: [f.from, f.to], colliders: [stairCollider(f.from.y < f.to.y ? f.from : f.to, f.from.y < f.to.y ? f.to : f.from, f.width, { surface: 'wood' })] }));
/** The same centre lines describe the visible stair rails and their solid shapes. */
export const ARENA_HANDRAILS: readonly MapProp[] = ARENA_ACCESS_FLIGHTS.flatMap(f => {
  const dx = f.to.x - f.from.x, dz = f.to.z - f.from.z, length = Math.hypot(dx, dz);
  return [-1, 1].map(side => {
    const path = Array.from({ length: 5 }, (_, i) => { const t = i / 4; return { x: f.from.x + dx * t + dz / length * 1.6 * side, y: lerp(f.from.y, f.to.y, t), z: f.from.z + dz * t - dx / length * 1.6 * side }; });
    return { id: `arena_rail_${f.id}_${side}`, kind: 'fence' as const, position: { x: 0, y: 0, z: 0 }, rotationY: 0, scale: 1, variant: 0, path,
      colliders: [rampCollider({ ...path[0]!, y: path[0]!.y + 1.05 }, { ...path[4]!, y: path[4]!.y + 1.05 }, .13, .13, { surface: 'wood' }),
        ...path.map(p => ({ type: 'cylinder' as const, radius: .085, halfHeight: .65, offset: { ...p, y: p.y + .45 }, surface: 'wood' as const }))] };
  });
});
export function arenaSurfaceAt(x: number, z: number, feetY = arenaHeightAt(x, z)): SurfaceTag {
  for(const house of ARENA_BUILDINGS){
    const p=house.position,shape=house.building!;
    if(Math.abs(x-p.x)<shape.width/2+.1&&Math.abs(z-p.z)<shape.depth/2+.1&&feetY>p.y+.2)
      return feetY>=p.y+roofBase(shape)?'snow':'wood';
  }
  for(const station of ARENA_STATION_PROPS){
    if(Math.abs(feetY-station.position.y)>.4)continue;
    const dx=x-station.position.x,dz=z-station.position.z,c=Math.cos(station.rotationY),s=Math.sin(station.rotationY);
    if(Math.abs(c*dx-s*dz)<5&&Math.abs(s*dx+c*dz)<3)return 'wood';
  }
  for (const f of ARENA_ACCESS_FLIGHTS) {
    const dx = f.to.x - f.from.x, dz = f.to.z - f.from.z, length2 = dx * dx + dz * dz;
    const t = ((x - f.from.x) * dx + (z - f.from.z) * dz) / length2;
    if (t >= 0 && t <= 1 && Math.hypot(x - f.from.x - dx * t, z - f.from.z - dz * t) < f.width / 2 && Math.abs(feetY - lerp(f.from.y, f.to.y, t)) < .6)
      return 'wood';
  }
  if (Math.abs(x - 46.5) < 1.6 && Math.abs(z - 14) < 1.6 && Math.abs(feetY - 16.08) < .5)
    return 'wood';
  return 'snow';
}
const stops: readonly Vec3[] = STATION_FOUNDATIONS.map(({x,y,z})=>({x,y,z}));
const floorPoints: Vec3[] = [];
for (let leg = 0; leg < 2; leg++)
  for (let i = leg === 0 ? 0 : 1; i <= 32; i++) {
    const a = stops[leg]!, b = stops[leg + 1]!, t = i / 32;
    const x = lerp(a.x, b.x, t), z = lerp(a.z, b.z, t), yaw = Math.atan2(b.x - a.x, b.z - a.z);
    const envelope = Math.max(...[-3.5, 0, 3.5].flatMap(side => [-1.8, 0, 1.8].map(along => arenaHeightAt(x + Math.cos(yaw) * side + Math.sin(yaw) * along, z - Math.sin(yaw) * side + Math.cos(yaw) * along))));
    floorPoints.push({ x, y: Math.max(lerp(a.y, b.y, t) + Math.sin(t * Math.PI) * 1.6, envelope + Math.sin(t * Math.PI) * .6), z });
  }
const gondolaPath = makeRoute('arena_cabin_floor', floorPoints);
export const ARENA_CABLE: CableCarRoute = {
  gondolaPath, cable: makeRoute('arena_haul_rope', floorPoints.map(p => ({ ...p, y: p.y + 4 }))),
  stations: stops.map((platform, i) => {
    const a = stops[i === 2 ? 1 : i]!, b = stops[i === 2 ? 2 : i + 1]!, yaw = Math.atan2(b.x - a.x, b.z - a.z);
    const brakeBase = { x: platform.x + Math.cos(yaw) * 4.3, y: platform.y, z: platform.z - Math.sin(yaw) * 4.3 };
    return { id: (['valley', 'mid', 'mountain'] as const)[i]!, labelKey: (['world.stations.valley', 'world.stations.mid', 'world.stations.mountain'] as const)[i]!,
      platform, brakeBase, brakeLever: { x: brakeBase.x + Math.sin(yaw) * CABLE_BRAKE_HANDLE.length * Math.sin(CABLE_BRAKE_HANDLE.angle), y: brakeBase.y + CABLE_BRAKE_HANDLE.hinge + CABLE_BRAKE_HANDLE.length * Math.cos(CABLE_BRAKE_HANDLE.angle), z: brakeBase.z + Math.cos(yaw) * CABLE_BRAKE_HANDLE.length * Math.sin(CABLE_BRAKE_HANDLE.angle) }, pathDistance: gondolaPath.distances[i * 32]! };
  }), pylons: [], gondolas: 2, legSeconds: 12, hangerLength: 4,
};
export const ARENA_STATION_PROPS: readonly MapProp[] = ARENA_CABLE.stations.map((station, i) => {
  const a = stops[i === 2 ? 1 : i]!, b = stops[i === 2 ? 2 : i + 1]!;
  return { id: `arena_station_${station.id}`, kind: 'cable_station', position: station.platform, rotationY: Math.atan2(b.x - a.x, b.z - a.z), scale: 1, variant: i,
    dimensions: { x: 10, y: 0, z: 6 }, colliders: [boxCollider(5, .18, 3, 0, -.18, 0, { surface: 'wood' }), rampCollider({x:-5.25,y:5.45,z:0},{x:0,y:6.7,z:0},6.7,.25,{surface:'snow'}),rampCollider({x:0,y:6.7,z:0},{x:5.25,y:5.45,z:0},6.7,.25,{surface:'snow'}),
      ...[-1, 1].flatMap(side => [-1, 1].map(end => boxCollider(.14, 2.6, .14, side * 4.6, 2.6, end * 2.5, { surface: 'wood' })))] };
});
const FIR_POINTS=[[-7.3,-16],[-27,-9],[-32,0],[-29,7],[-32,25],[-23,30],[-33,43],[-24,44],[-8,45],[-3,47],[8,40],[14,38],[22,31],[29,30],[-30,-26],[-23,-27],[-11,-26],
  [38,7],[40,9],[49,10],[37,28],[42,32],[51,32],[52,22],[39,25],[37,18]] as const;
const trees:MapProp[]=FIR_POINTS.map(([x,z],i)=>({id:`arena_fir_${i}`,kind:'fir',position:{x,y:arenaHeightAt(x,z),z},rotationY:i*2.13,scale:.72+(i%3)*.1,variant:i%3,
  surface:'snow',colliders:[{type:'cylinder',radius:.28,halfHeight:2.8,offset:{x:0,y:2.8,z:0},surface:'wood'}]}));
export const ARENA_NATURE: readonly MapProp[] = trees;
const fencePath = Array.from({ length: 11 }, (_, i) => { const x = -33, z = -17+i*2.4; return { x, y: arenaHeightAt(x, z), z }; });
export const ARENA_FENCE: MapProp = { id: 'arena_foreground_fence', kind: 'fence', position: { x: 0, y: 0, z: 0 }, rotationY: 0, scale: 1, variant: 0, path: fencePath, colliders: [...fencePath.map(p => ({ type: 'cylinder' as const, radius: .105, halfHeight: .67, offset: { ...p, y: p.y + .55 }, surface: 'wood' as const })), ...fencePath.slice(0, -1).flatMap((a, i) => { const b = fencePath[i + 1]!; return [.45, 1.08].map(height => rampCollider({ ...a, y: a.y + height }, { ...b, y: b.y + height }, .16, .16, { surface: 'wood' })); })] };
const landing: MapProp = { id: 'arena_coast_landing', kind: 'stairs', position: { x: 46.5, y: 15.83, z: 14 }, rotationY: 0, scale: 1, variant: 0, dimensions: { x: 3, y: .25, z: 3 }, colliders: [boxCollider(1.5, .125, 1.5, 0, .125, 0, { surface: 'wood' })] };
export const ARENA_SOLID_PROPS: readonly MapProp[] = [ARENA_CHALET,ARENA_REAR_CHALET,rearStep, ARENA_FENCE, ...ARENA_HANDRAILS, landing, ...chaletSteps, ...access, ...ARENA_STATION_PROPS, ...trees];
export const ARENA_GEOMETRY: StaticWorldDefinition = { ...ARENA_GRID, props: ARENA_SOLID_PROPS, heightAt: arenaHeightAt, surfaceAt: arenaSurfaceAt, cableCar: ARENA_CABLE };
// Every edge follows ground, a bridge segment or one explicit stair flight.
const navCoordinates = [[-18, -20], [0, -20], [20, -20], [-18, -19], [20, -19], [-18, -6], [20, -6], [-12, 0], [-6, 0], [0, 0], [6, 0], [12, 0],
  [-18, 6], [-30, 7], [-30, 36], [-24, 36], [-18, 32], [-16.2, 22], [-3, 22], [0, 40], [10, 34], [20, 24], [28, 24], [27, 18], [20, 8], [32, 14],
  [46.5, 14], [46.5, 28], [40, 28], [40, 12],[-33,24]] as const;
export const ARENA_NAV: NavGraph = { nodes: navCoordinates.map(([x, z], id) => ({ id, position: { x, y: (id === 26 ? 16.08 : arenaHeightAt(x, z)), z }, zone: 'village' })),
  edges: [[0, 1], [1, 2], [0, 3], [2, 4], [3, 5], [4, 6], [5, 7], [7, 8], [8, 9], [9, 10], [10, 11], [11, 6], [5, 12], [12, 13], [13,30],[30,14], [14, 15], [15, 16], [16, 17], [17, 18], [18, 19], [19, 20], [20, 21], [21, 22], [22, 23], [23, 24], [24, 6], [24, 25], [25, 26], [26, 27], [27, 28], [28, 29]] };
