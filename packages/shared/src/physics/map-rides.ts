import { GRAVITY, PHYSICS_TICK_RATE } from '../constants.js';
import { FJORD_ROUTES } from '../config/map/routes.js';
import { projectOnPolyline } from '../config/map/math.js';
import type { RoutePolyline } from '../types/map.js';
import type { Vec3 } from '../types/index.js';

export type MapRideKind = 'tbar' | 'coaster_bob' | 'hammock';
export function isMapRide(kind: string): kind is MapRideKind {
  return kind === 'tbar' || kind === 'coaster_bob' || kind === 'hammock';
}
export interface RidePose { position: Vec3; yaw: number; pitch: number; roll: number; index: number }

/** Sample the actual, collision-backed route; binary search is bounded by its size. */
export function sampleRidePath(route: RoutePolyline, distance: number): RidePose {
  const d = Math.max(0, Math.min(route.length, distance));
  let low = 0, high = route.points.length - 1;
  while (low + 1 < high) { const mid = (low + high) >>> 1; if (route.distances[mid]! <= d) low = mid; else high = mid; }
  const a = route.points[low]!, b = route.points[high]!, span = route.distances[high]! - route.distances[low]!;
  const t = span > 0 ? (d - route.distances[low]!) / span : 0;
  return { position: { x: a.x + (b.x-a.x)*t, y: a.y + (b.y-a.y)*t, z: a.z + (b.z-a.z)*t },
    yaw: Math.atan2(b.x-a.x,b.z-a.z), pitch: Math.atan2(b.y-a.y,Math.hypot(b.x-a.x,b.z-a.z)), roll: 0, index: low };
}

/** Eight continuously circulating bars: feet on snow uphill, empty return overhead. */
export function sampleTBar(distance: number): RidePose & { returning: boolean } {
  const lift=FJORD_ROUTES.tBar, length=lift.ridePath.length, phase=((distance%(2*length))+2*length)%(2*length);
  const returning=phase>=length, along=returning?2*length-phase:phase, pose=sampleRidePath(lift.ridePath,along);
  pose.position.y+=.05; pose.pitch=0;
  if(returning) {
    const rope=sampleRidePath(lift.cable,along/length*lift.cable.length);
    pose.position.x+=Math.cos(pose.yaw)*1.6;pose.position.z-=Math.sin(pose.yaw)*1.6;
    pose.position.y=rope.position.y-1.7;pose.yaw+=Math.PI;
  }
  return {...pose,returning};
}

export function initialTBarDistance(position:Vec3,yaw:number):number {
  const route=FJORD_ROUTES.tBar.ridePath,projection=projectOnPolyline(position.x,position.z,route.points,route.distances);
  return Math.cos(yaw-sampleRidePath(route,projection.along).yaw)<0?2*route.length-projection.along:projection.along;
}

export function tbarHangerLength(position:Vec3):number {
  const rope=FJORD_ROUTES.tBar.cable,p=projectOnPolyline(position.x,position.z,rope.points,rope.distances);
  return Math.max(.35,p.y-position.y-.95);
}

/** Real ballistic launch, integrated by the normal character motor after release. */
export function hammockLaunchVelocity(start=FJORD_ROUTES.hammock.seat,target=FJORD_ROUTES.hammock.target):Vec3 {
  const g=Math.abs(GRAVITY),apex=Math.max(start.y,target.y)+24,vy=Math.sqrt(2*g*(apex-start.y));
  const seconds=(vy+Math.sqrt(vy*vy+2*g*(start.y-target.y)))/g;
  return {x:(target.x-start.x)/seconds,y:vy,z:(target.z-start.z)/seconds};
}

export const MAP_RIDE_TUNING = { tbarSpeed:11, coasterSpeed:24, tensionTicks:Math.round(1.5*PHYSICS_TICK_RATE), corpseDragTicks:2*PHYSICS_TICK_RATE } as const;
