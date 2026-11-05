import '@babylonjs/core/Meshes/thinInstanceMesh';
import { Color3, Matrix, Vector3 } from '@babylonjs/core/Maths/math';
import { BoundingInfo } from '@babylonjs/core/Culling/boundingInfo';
import type { Observer } from '@babylonjs/core/Misc/observable';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import { REFERENCE_CHALET_FIRE } from '@frost-and-flamingos/shared';
import { Affine, GeometryBatch } from './map/geometry';
import { excludeFromInk, excludeFromShadows } from './materials';
const FIRE_ORIGIN=REFERENCE_CHALET_FIRE.points[0]!;

/** Five original solid flame clusters and fifteen smoke puffs, permanently
 * bounded in two instanced draws. The server owns ignition/extinguishing.
 */
export class ReferenceChaletFireView {
  readonly meshes:readonly Mesh[];
  private readonly flames:Mesh;
  private readonly smoke:Mesh;
  private readonly material:StandardMaterial;
  private burning=false;
  private time=0;
  private disposed=false;
  private readonly flameMatrices=new Float32Array(REFERENCE_CHALET_FIRE.points.length*16);
  private readonly smokeMatrices=new Float32Array(REFERENCE_CHALET_FIRE.points.length*3*16);
  private readonly matrix=Matrix.Identity();
  private readonly origin=new Vector3(FIRE_ORIGIN.x,FIRE_ORIGIN.y,FIRE_ORIGIN.z);
  private readonly observer:Observer<Scene>|null;

  constructor(private readonly scene:Scene) {
    this.material=new StandardMaterial('reference-fire-unlit',scene);
    this.material.disableLighting=true;this.material.diffuseColor=Color3.Black();
    this.material.emissiveColor=Color3.White();this.material.specularColor=Color3.Black();
    const flames=new GeometryBatch();flames.jitter=0;
    for(let tongue=0;tongue<3;tongue++) {
      const x=(tongue-1)*.35,h=tongue===1?2.2:1.5;
      flames.with(Affine.translation(x,0,0),()=>{
        flames.lathe([[.18,0],[.40,.38],[.24,h*.58],[.10,h*.82],[0,h]],12,[1,.28,.025],'plain',{capBottom:true});
        flames.lathe([[.11,.02],[.24,.30],[.15,h*.45],[0,h*.69]],12,[1,.84,.12],'plain',{capBottom:true});
      });
    }
    this.flames=flames.toMesh(scene,'reference-chalet-flames',this.material)!;
    const smoke=new GeometryBatch();smoke.jitter=0;
    smoke.blob(0,0,0,1,1,1,[.19,.23,.25],'plain',{segments:10,rings:6});
    this.smoke=smoke.toMesh(scene,'reference-chalet-fire-smoke',this.material)!;
    this.flames.thinInstanceSetBuffer('matrix',this.flameMatrices,16,false);
    this.smoke.thinInstanceSetBuffer('matrix',this.smokeMatrices,16,false);
    this.meshes=[this.flames,this.smoke];
    const lo=new Vector3(Infinity,Infinity,Infinity),hi=new Vector3(-Infinity,-Infinity,-Infinity);
    for(const p of REFERENCE_CHALET_FIRE.points){lo.minimizeInPlaceFromFloats(p.x-2,p.y-.3,p.z-2);hi.maximizeInPlaceFromFloats(p.x+4,p.y+9,p.z+3);}
    for(const mesh of this.meshes){
      mesh.isPickable=false;mesh.doNotSyncBoundingInfo=true;mesh.setBoundingInfo(new BoundingInfo(lo.clone(),hi.clone()));
      excludeFromInk(mesh);excludeFromShadows(mesh);mesh.setEnabled(false);
    }
    this.observer=scene.onBeforeRenderObservable.add(()=>this.update());
    scene.onDisposeObservable.addOnce(()=>this.dispose());
  }
  setBurning(burning:boolean):void {
    this.burning=burning;this.flames.setEnabled(burning);this.smoke.setEnabled(burning);
  }
  private update():void {
    if(!this.burning||this.disposed)return;
    const camera=this.scene.activeCamera;
    const near=!!camera&&Vector3.DistanceSquared(camera.globalPosition,this.origin)<180*180;
    this.flames.setEnabled(near);this.smoke.setEnabled(near);if(!near)return;
    this.time+=Math.min(this.scene.getEngine().getDeltaTime()/1000,.1);
    for(let i=0;i<REFERENCE_CHALET_FIRE.points.length;i++) {
      const point=REFERENCE_CHALET_FIRE.points[i]!,pulse=1+Math.sin(this.time*8+i*2)*.11;
      const size=i<3?1:.72;
      Matrix.ScalingToRef(size*(1.05-pulse*.05),size*pulse,size,this.matrix);
      this.matrix.setTranslationFromFloats(point.x,point.y,point.z);this.matrix.copyToArray(this.flameMatrices,i*16);
      for(let puff=0;puff<3;puff++) {
        const age=(this.time+puff*1.93+i*.36)%5.8,t=age/5.8;
        const scale=(.18+t*.96)*Math.min(1,age*4,(5.8-age)*2)*size;
        Matrix.ScalingToRef(scale,scale*1.13,scale,this.matrix);
        this.matrix.setTranslationFromFloats(point.x+age*.28+Math.sin(age+i)*.16,point.y+1.5+age*.93,point.z+age*.12);
        this.matrix.copyToArray(this.smokeMatrices,(i*3+puff)*16);
      }
    }
    this.flames.thinInstanceBufferUpdated('matrix');this.smoke.thinInstanceBufferUpdated('matrix');
  }
  dispose():void {
    if(this.disposed)return;this.disposed=true;
    this.scene.onBeforeRenderObservable.remove(this.observer);
    for(const mesh of this.meshes)mesh.dispose();this.material.dispose();
  }
}
