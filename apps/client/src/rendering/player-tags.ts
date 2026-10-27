import { Matrix, Vector3 } from '@babylonjs/core/Maths/math';
import type { Scene } from '@babylonjs/core/scene';
import type { PhysicsWorld, Vec3 } from '@frost-and-flamingos/shared';
import type { PlayerTag } from '../state/tactical';

export interface TagCandidate { id:number; name:string; feet:Vec3; height:number; friendly:boolean; local:boolean; cloaked?:boolean }
const identity = Matrix.Identity();

/** Screen-space names use the drawn avatar position, with a real world line-of-sight check. */
export function projectPlayerTags(scene:Scene,physics:PhysicsWorld,candidates:readonly TagCandidate[],ignoredHull?:number):PlayerTag[] {
  const camera=scene.activeCamera;
  if(!camera)return[];
  // Camera springs have advanced since the previous draw; project against this frame.
  scene.updateTransformMatrix(true);
  const engine=scene.getEngine(), width=engine.getRenderWidth(),height=engine.getRenderHeight();
  const viewport=camera.viewport.toGlobal(width,height), transform=scene.getTransformMatrix(), output:PlayerTag[]=[];
  for(const candidate of candidates) {
    if(candidate.cloaked && !candidate.friendly)continue;
    const head={x:candidate.feet.x,y:candidate.feet.y+candidate.height*.94,z:candidate.feet.z};
    const dx=head.x-camera.position.x,dy=head.y-camera.position.y,dz=head.z-camera.position.z;
    const distance=Math.hypot(dx,dy,dz);
    if(distance<.3||distance>160)continue;
    const hit=physics.raycast(camera.position,{x:dx/distance,y:dy/distance,z:dz/distance},Math.max(0,distance-.28),ignoredHull,true);
    if(hit)continue;
    const projected=Vector3.Project(new Vector3(head.x,head.y+candidate.height*.15,head.z),identity,transform,viewport);
    const x=projected.x/width*100,y=projected.y/height*100;
    if(projected.z<0||projected.z>1||x<0||x>100||y<0||y>100)continue;
    output.push({id:candidate.id,name:candidate.name,x,y,friendly:candidate.friendly,local:candidate.local});
  }
  return output;
}
