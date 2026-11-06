import '@babylonjs/core/Meshes/thinInstanceMesh';
import { Matrix } from '@babylonjs/core/Maths/math';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage';
import type { Scene } from '@babylonjs/core/scene';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Vec3 } from '@frost-and-flamingos/shared';
import { GeometryBatch } from './map/geometry';
import { SUN_DIRECTION, excludeFromInk, excludeFromShadows } from './materials';
import { comicSmokeVertexGLSL, comicSmokeFragmentGLSL, comicSmokeVertexWGSL, comicSmokeFragmentWGSL } from '../shaders/comic-fire';

/** One global fixed pool: overlapping shots never create meshes, materials or timers. */
export const SNOW_STREAM_CAPACITY=64;
const BURST=16;
interface Puff {active:boolean;fresh:boolean;age:number;life:number;x:number;y:number;z:number;dx:number;dy:number;dz:number;size:number;seed:number}
export class SnowStream {
  readonly meshes:readonly Mesh[];
  private readonly material:ShaderMaterial;
  private readonly matrix=Matrix.Identity();
  private readonly matrices=new Float32Array(SNOW_STREAM_CAPACITY*16);
  private readonly puffs:Puff[]=Array.from({length:SNOW_STREAM_CAPACITY},()=>({active:false,fresh:false,age:0,life:1,x:0,y:0,z:0,dx:0,dy:0,dz:0,size:0,seed:0}));
  private cursor=0;
  private disposed=false;
  constructor(private readonly scene:Scene,private readonly ray:(origin:Vec3,direction:Vec3,range:number)=>number|null){
    const gpu=scene.getEngine().isWebGPU;
    this.material=new ShaderMaterial('snow-stream-form',scene,{
      vertexSource:(gpu?comicSmokeVertexWGSL:comicSmokeVertexGLSL).replace('(.62+.38*max','(.88+.12*max'),
      fragmentSource:gpu?comicSmokeFragmentWGSL:comicSmokeFragmentGLSL,
    },{attributes:['position','normal','color'],uniforms:['world','viewProjection','uSmokeLight'],shaderLanguage:gpu?ShaderLanguage.WGSL:ShaderLanguage.GLSL});
    this.material.setVector3('uSmokeLight',SUN_DIRECTION);
    this.meshes=[false,true].map(outline=>{
      const batch=new GeometryBatch();batch.jitter=0;
      const radius=outline?1.035:1;
      batch.blob(0,0,0,radius,radius,radius,outline?[.43,.68,.81]:[.95,.985,1],'plain',{segments:20,rings:9,wobble:.065,seed:43});
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
    for(let i=0;i<BURST;i++){
      const index=this.cursor++%SNOW_STREAM_CAPACITY,p=this.puffs[index]!,t=i/(BURST-1),along=.15+t*Math.min(4.5,length),curl=Math.sin(i*2.4)*t*.35;
      Object.assign(p,{active:true,fresh:true,age:0,life:.65+t*.45,
        x:origin.x+direction.x*along+rightX*curl,y:origin.y+direction.y*along+Math.cos(i*1.9)*t*.22,z:origin.z+direction.z*along+rightZ*curl,
        dx:direction.x*2.2,dy:direction.y*2.2+.25,dz:direction.z*2.2,size:.16+t*.48,seed:i});
    }
  }
  update(delta:number):void{
    if(this.disposed)return;let count=0;
    for(let i=0;i<SNOW_STREAM_CAPACITY;i++){
      const p=this.puffs[i]!;
      if(p.active){if(p.fresh)p.fresh=false;else p.age+=Math.max(0,delta);if(p.age>=p.life)p.active=false;}
      if(p.active){
        const t=p.age/p.life,size=p.size*(1+t*.55)*Math.min(1,(1-t)*5);
        Matrix.ScalingToRef(size,size*(.9+.08*Math.sin(p.seed)),size,this.matrix);
        this.matrix.setTranslationFromFloats(p.x+p.dx*p.age,p.y+p.dy*p.age,p.z+p.dz*p.age);count++;
      }else Matrix.ScalingToRef(0,0,0,this.matrix);
      this.matrix.copyToArray(this.matrices,i*16);
    }
    for(const mesh of this.meshes){mesh.setEnabled(count>0);if(count>0)mesh.thinInstanceBufferUpdated('matrix');}
  }
  dispose():void{if(this.disposed)return;this.disposed=true;for(const mesh of this.meshes)mesh.dispose();this.material.dispose();}
}
