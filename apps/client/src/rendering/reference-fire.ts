import '@babylonjs/core/Meshes/thinInstanceMesh';
import { Color3, Matrix, Vector3 } from '@babylonjs/core/Maths/math';
import { BoundingInfo } from '@babylonjs/core/Culling/boundingInfo';
import type { Observer } from '@babylonjs/core/Misc/observable';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import { REFERENCE_CHALET_FIRE } from '@frost-and-flamingos/shared';
import { GeometryBatch } from './map/geometry';
import { comicFireVertexGLSL, comicFireFragmentGLSL, comicFireVertexWGSL, comicFireFragmentWGSL } from '../shaders/comic-fire';
import { excludeFromInk, excludeFromShadows } from './materials';
const FIRE_ORIGIN=REFERENCE_CHALET_FIRE.points[0]!;
const PUFFS_PER_FIRE=8;

/** Five original drawn flame effects and forty solid smoke puffs, permanently
 * bounded in two instanced draws. The server owns ignition/extinguishing.
 */
export class ReferenceChaletFireView {
  readonly meshes:readonly Mesh[];
  private readonly flames:Mesh;
  private readonly smoke:Mesh;
  private readonly material:StandardMaterial;
  private readonly fireMaterial:ShaderMaterial;
  private readonly paint:Texture;
  private readonly cameraRight=new Vector3(1,0,0);
  private burning=false;
  private time=0;
  private disposed=false;
  private readonly flameMatrices=new Float32Array(REFERENCE_CHALET_FIRE.points.length*16);
  private readonly smokeMatrices=new Float32Array(REFERENCE_CHALET_FIRE.points.length*PUFFS_PER_FIRE*16);
  private readonly matrix=Matrix.Identity();
  private readonly origin=new Vector3(FIRE_ORIGIN.x,FIRE_ORIGIN.y,FIRE_ORIGIN.z);
  private readonly observer:Observer<Scene>|null;

  constructor(private readonly scene:Scene) {
    this.material=new StandardMaterial('reference-fire-unlit',scene);
    this.material.diffuseColor=Color3.White();
    this.material.emissiveColor=new Color3(.035,.035,.035);this.material.specularColor=Color3.Black();
    const webgpu=scene.getEngine().isWebGPU;
    this.fireMaterial=new ShaderMaterial('reference-drawn-fire',scene,{
      vertexSource:webgpu?comicFireVertexWGSL:comicFireVertexGLSL,
      fragmentSource:webgpu?comicFireFragmentWGSL:comicFireFragmentGLSL,
    },{attributes:['position','uv'],uniforms:['world','viewProjection','uFireRight','uFireTime'],samplers:['fireSampler'],
      needAlphaTesting:true,shaderLanguage:webgpu?ShaderLanguage.WGSL:ShaderLanguage.GLSL});
    this.fireMaterial.backFaceCulling=false;
    this.fireMaterial.setVector3('uFireRight',this.cameraRight);this.fireMaterial.setFloat('uFireTime',0);
    this.paint=new Texture('/art/tex/comic-fire.png',scene,false,false,Texture.TRILINEAR_SAMPLINGMODE);
    this.paint.wrapU=this.paint.wrapV=Texture.CLAMP_ADDRESSMODE;
    this.fireMaterial.setTexture('fireSampler',this.paint);
    this.flames=CreatePlane('reference-chalet-flames',{size:1},scene);
    this.flames.bakeTransformIntoVertices(Matrix.Translation(0,.5,0));this.flames.material=this.fireMaterial;
    const smoke=new GeometryBatch();smoke.jitter=0;
    smoke.blob(0,0,0,1,1,1,ny=>[.23+ny*.07,.23+ny*.07,.22+ny*.08],'plain',{segments:10,rings:6,wobble:.1,seed:17});
    this.smoke=smoke.toMesh(scene,'reference-chalet-fire-smoke',this.material)!;
    this.flames.thinInstanceSetBuffer('matrix',this.flameMatrices,16,false);
    this.smoke.thinInstanceSetBuffer('matrix',this.smokeMatrices,16,false);
    this.meshes=[this.flames,this.smoke];
    const lo=new Vector3(Infinity,Infinity,Infinity),hi=new Vector3(-Infinity,-Infinity,-Infinity);
    for(const p of REFERENCE_CHALET_FIRE.points){lo.minimizeInPlaceFromFloats(p.x-6,p.y-.3,p.z-6);hi.maximizeInPlaceFromFloats(p.x+7,p.y+10,p.z+6);}
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
    const view=camera!.getViewMatrix().m;
    this.cameraRight.set(view[0]!,0,view[8]!).normalize();
    this.fireMaterial.setVector3('uFireRight',this.cameraRight);this.fireMaterial.setFloat('uFireTime',this.time);
    for(let i=0;i<REFERENCE_CHALET_FIRE.points.length;i++) {
      const point=REFERENCE_CHALET_FIRE.points[i]!,pulse=1+Math.sin(this.time*8+i*2)*.11;
      const size=i<3?1:.72;
      Matrix.ScalingToRef(size*2.6,size*3.4*pulse,size,this.matrix);
      this.matrix.setTranslationFromFloats(point.x,point.y,point.z);this.matrix.copyToArray(this.flameMatrices,i*16);
      for(let puff=0;puff<PUFFS_PER_FIRE;puff++) {
        const age=(this.time+(i*PUFFS_PER_FIRE+puff)*(5.8/40))%5.8,t=age/5.8;
        const scale=(.42+t*1.65)*Math.min(1,age*4,(5.8-age)*2);
        Matrix.ScalingToRef(scale,scale*1.13,scale,this.matrix);
        const roof=REFERENCE_CHALET_FIRE.points[1]!;
        this.matrix.setTranslationFromFloats(roof.x+age*.32+Math.sin(puff*2.1+i+age)*t*1.15,roof.y+1.3+age*.93,roof.z+Math.cos(puff*1.7+i+age*.8)*t*1.1);
        this.matrix.copyToArray(this.smokeMatrices,(i*PUFFS_PER_FIRE+puff)*16);
      }
    }
    this.flames.thinInstanceBufferUpdated('matrix');this.smoke.thinInstanceBufferUpdated('matrix');
  }
  dispose():void {
    if(this.disposed)return;this.disposed=true;
    this.scene.onBeforeRenderObservable.remove(this.observer);
    for(const mesh of this.meshes)mesh.dispose();this.material.dispose();this.fireMaterial.dispose();this.paint.dispose();
  }
}
