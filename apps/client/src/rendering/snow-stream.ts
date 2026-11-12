import '@babylonjs/core/Meshes/thinInstanceMesh';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage';
import type { Scene } from '@babylonjs/core/scene';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Vec3 } from '@frost-and-flamingos/shared';
import { snowCloudGeometry } from './snow-cloud';
import { SUN_DIRECTION, excludeFromInk, excludeFromShadows } from './materials';
import { comicSmokeVertexGLSL, comicSmokeFragmentGLSL, comicSmokeVertexWGSL, comicSmokeFragmentWGSL } from '../shaders/comic-fire';

/** One global fixed pool: overlapping shots never create meshes, materials or timers. */
export const SNOW_STREAM_CAPACITY=64;
const BURST=16;
interface Puff {active:boolean;fresh:boolean;age:number;life:number;x:number;y:number;z:number;dx:number;dy:number;dz:number;size:number;seed:number;travel:number}
export class SnowStream {
  readonly meshes:readonly Mesh[];
  private readonly material:ShaderMaterial;
  private readonly matrix=Matrix.Identity();
  private readonly rotation=Quaternion.Identity();
  private readonly scale=new Vector3();
  private readonly translation=new Vector3();
  private readonly matrices=new Float32Array(SNOW_STREAM_CAPACITY*16);
  private readonly puffs:Puff[]=Array.from({length:SNOW_STREAM_CAPACITY},()=>({active:false,fresh:false,age:0,life:1,x:0,y:0,z:0,dx:0,dy:0,dz:0,size:0,seed:0,travel:0}));
  private cursor=0;
  private disposed=false;
  constructor(private readonly scene:Scene,private readonly ray:(origin:Vec3,direction:Vec3,range:number)=>number|null){
    const gpu=scene.getEngine().isWebGPU;
    this.material=new ShaderMaterial('snow-stream-form',scene,{
      vertexSource:gpu?comicSmokeVertexWGSL.replace('input.color.rgb*(.62+.38*max(0.0,dot(n,uniforms.uSmokeLight)))','mix(input.color.rgb,mix(vec3f(.72,.84,.94),input.color.rgb,.5+.5*smoothstep(-.5,.85,dot(n,uniforms.uSmokeLight))),step(.7,input.color.r))')
        :comicSmokeVertexGLSL.replace('color.rgb*(.62+.38*max(0.0,dot(n,uSmokeLight)))','mix(color.rgb,mix(vec3(.72,.84,.94),color.rgb,.5+.5*smoothstep(-.5,.85,dot(n,uSmokeLight))),step(.7,color.r))'),
      fragmentSource:gpu?comicSmokeFragmentWGSL:comicSmokeFragmentGLSL,
    },{attributes:['position','normal','color'],uniforms:['world','viewProjection','uSmokeLight'],shaderLanguage:gpu?ShaderLanguage.WGSL:ShaderLanguage.GLSL});
    this.material.setVector3('uSmokeLight',SUN_DIRECTION);
    this.meshes=[false,true].map(outline=>{
      const batch=snowCloudGeometry(outline);
      const mesh=batch.toMesh(scene,outline?'snow-stream-contour':'snow-stream-cloud',this.material)!;
      if(outline)mesh.flipFaces(false);
      mesh.isPickable=false;mesh.receiveShadows=false;mesh.alwaysSelectAsActiveMesh=true;
      excludeFromInk(mesh);excludeFromShadows(mesh);
      mesh.thinInstanceSetBuffer('matrix',this.matrices,16,false);mesh.setEnabled(false);
      return mesh;
    });
    scene.onDisposeObservable.addOnce(()=>this.dispose());
  }
  shot(origin:Vec3,yaw:number,pitch:number):void{
    if(this.disposed)return;
    const camera=this.scene.activeCamera;if(camera&&((camera.globalPosition.x-origin.x)**2+(camera.globalPosition.y-origin.y)**2+(camera.globalPosition.z-origin.z)**2)>60*60)return;
    const direction={x:Math.sin(yaw)*Math.cos(pitch),y:Math.sin(pitch),z:Math.cos(yaw)*Math.cos(pitch)};
    const length=Math.max(0,Math.min(7.5,this.ray(origin,direction,7.5)??7.5)-.15);
    if(length<.2)return;
    const rightX=Math.cos(yaw),rightZ=-Math.sin(yaw);
    const upX=-Math.sin(yaw)*Math.sin(pitch),upY=Math.cos(pitch),upZ=-Math.cos(yaw)*Math.sin(pitch);
    for(let i=0;i<BURST;i++){
      const seed=this.cursor++,index=seed%SNOW_STREAM_CAPACITY,p=this.puffs[index]!,jet=i<4;
      const stage=Math.floor((i-4)/3),t=jet?i/3:(stage+.2)/3.2;
      const along=Math.min(length*.94,jet?.08+i*.12:.55+t*Math.min(3.95,Math.max(0,length-.55)));
      const angle=((i-4)%3)*Math.PI*2/3+Math.floor(seed/16)*.37,spread=jet?0:.15+t*.25,side=Math.cos(angle)*spread,up=Math.sin(angle)*spread;
      Object.assign(p,{active:true,fresh:true,age:0,life:jet?.16+t*.03:.60+t*.40,
        x:origin.x+direction.x*along+rightX*side+upX*up,y:origin.y+direction.y*along+upY*up,z:origin.z+direction.z*along+rightZ*side+upZ*up,
        dx:direction.x*2.1,dy:direction.y*2.1+.18,dz:direction.z*2.1,size:(jet?.05+i*.015:.24+t*.26)*(.92+.12*Math.sin(seed*1.7)),seed,travel:Math.max(0,length-along)});
    }
  }
  update(delta:number):void{
    if(this.disposed)return;let count=0;
    for(let i=0;i<SNOW_STREAM_CAPACITY;i++){
      const p=this.puffs[i]!;
      if(p.active){if(p.fresh)p.fresh=false;else p.age+=Math.max(0,delta);if(p.age>=p.life)p.active=false;}
      if(p.active){
        const t=p.age/p.life,size=p.size*(1+t*.55)*Math.min(1,(1-t)*5);
        this.scale.setAll(size);Quaternion.RotationYawPitchRollToRef(p.seed*1.7,p.seed*.63,p.seed*.31,this.rotation);
        const movement=Math.min(p.age,p.travel/2.1);
        this.translation.set(p.x+p.dx*movement,p.y+p.dy*movement,p.z+p.dz*movement);
        Matrix.ComposeToRef(this.scale,this.rotation,this.translation,this.matrix);count++;
      }else Matrix.ScalingToRef(0,0,0,this.matrix);
      this.matrix.copyToArray(this.matrices,i*16);
    }
    for(const mesh of this.meshes){mesh.setEnabled(count>0);if(count>0)mesh.thinInstanceBufferUpdated('matrix');}
  }
  dispose():void{if(this.disposed)return;this.disposed=true;for(const mesh of this.meshes)mesh.dispose();this.material.dispose();}
}
