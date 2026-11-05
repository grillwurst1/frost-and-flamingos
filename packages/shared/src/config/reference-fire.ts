/** The reference chalet's real extinguishable fire; no terrain/collision changes. */
import { FJORD_MAP } from './map-fjord.js';
import { roofBase } from './map/buildings.js';
import type { Vec3 } from '../types/index.js';
const chalet=FJORD_MAP.props.find(prop=>prop.id==='chalet_north')!;
const layout=chalet.building!;
const transform=(x:number,y:number,z:number):Vec3=>({
  x:chalet.position.x+Math.cos(chalet.rotationY)*x+Math.sin(chalet.rotationY)*z,
  y:chalet.position.y+y,
  z:chalet.position.z-Math.sin(chalet.rotationY)*x+Math.cos(chalet.rotationY)*z,
});
const ridge=roofBase(layout)+Math.tan(layout.roof.pitch)*(layout.width/2+layout.roof.overhang);
export const REFERENCE_CHALET_FIRE={
  id:FJORD_MAP.destructibles.buildings.find(building=>building.propId===chalet.id)!.netId,
  maxHp:500,
  cooling:100,
  damage:8,
  radius:1.5,
  points:[
    ...[-.28,0,.25].map((side,i)=>transform(layout.width*side,ridge-Math.tan(layout.roof.pitch)*Math.abs(layout.width*side)+.25,(i-1)*layout.depth*.18)),
    ...[-.24,.24].map(side=>transform(layout.width*side,layout.floors[1]!.elevation+1.25,layout.depth/2+.25)),
  ] as readonly Vec3[],
} as const;

/** The hit must be on the actual chalet, including its roof, within weapon range. */
export function insideReferenceChalet(point:Vec3):boolean {
  const dx=point.x-chalet.position.x,dz=point.z-chalet.position.z;
  const x=Math.cos(chalet.rotationY)*dx-Math.sin(chalet.rotationY)*dz;
  const z=Math.sin(chalet.rotationY)*dx+Math.cos(chalet.rotationY)*dz;
  const y=point.y-chalet.position.y;
  return Math.abs(x)<=layout.width/2+layout.roof.overhang+.35&&Math.abs(z)<=layout.depth/2+layout.roof.overhang+.35&&y>=-.15&&y<=ridge+1.5;
}
