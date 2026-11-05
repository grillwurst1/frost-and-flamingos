import '@babylonjs/core/Meshes/thinInstanceMesh';
/** Original 3D set dressing for the playable Gletscherpass slice.
 * Two merged static draws and one bounded instanced chimney plume; no new images,
 * render targets, particle emitters, timers or per-frame mesh allocations.
 */
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math';
import type { Scene } from '@babylonjs/core/scene';
import type { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import { FJORD_MAP, REFERENCE_MARKERS, roofBase, sampleMapHeight } from '@frost-and-flamingos/shared';
import { excludeFromInk, excludeFromShadows } from './materials';
import { Affine, GeometryBatch, mix, type RGB, type V3 } from './map/geometry';
import { P } from './map/palette';

export function buildReferenceWorld(scene: Scene, material: ShaderMaterial) {
  const wood: RGB = [.44,.29,.16], trim: RGB = [.24,.16,.10], snow: RGB = [.89,.96,1];
  const details = new GeometryBatch(); details.jitter = 0;
  for(const prop of REFERENCE_MARKERS.filter(p=>p.kind==='rock')) {
    const hull=prop.colliders.find(c=>c.type==='hull');if(!hull||hull.type!=='hull')continue;
    const points=hull.vertices.map(p=>[p.x,p.y,p.z] as V3);
    details.at(prop.position.x,prop.position.y,prop.position.z,prop.rotationY,()=>{
      for(let ring=0;ring<2;ring++)for(let side=0;side<8;side++) {
        const next=(side+1)%8,a=points[ring*8+side]!,b=points[ring*8+next]!;
        details.orientedPolygon([a,b,points[(ring+1)*8+next]!,points[(ring+1)*8+side]!],
          [a[0]+b[0],.2,a[2]+b[2]],mix(P.rockShade,P.rockLight,.24+ring*.25+(side%3)*.045),'rock');
      }
      details.orientedPolygon(points.slice(0,8),[0,-1,0],P.rockShade,'rock');
      details.orientedPolygon(points.slice(16),[0,1,0],P.rockLight,'rock');
      const cap=points.slice(16).map(([x,y,z]):V3=>[x*1.015,y+.045,z*1.015]);
      details.orientedPolygon(cap,[0,1,0],snow,'snow');
    });
  }
  for (const prop of REFERENCE_MARKERS.filter(p => p.kind === 'crate_stack')) {
    const {x,y,z} = prop.position;
    details.with(Affine.translation(x,y,z).rotateY(prop.rotationY), () => {
      details.box(0,.55,0,1.1,1.1,1.1,trim,'wood',.035);
      for(let row=0;row<4;row++)for(const side of [-1,1]) {
        details.box(0,.15+row*.26,side*.56,.99,.22,.055,wood,'wood',.012);
        details.box(side*.56,.15+row*.26,0,.055,.22,.99,wood,'wood',.012);
      }
      for(const side of [-1,1]) {
        for(const x of [-.44,.44])details.box(x,.55,side*.60,.09,1.12,.07,[.64,.46,.27],'wood',.01);
        details.with(Affine.translation(0,.55,side*.61).rotateZ(.72),()=>details.box(0,0,0,.08,1.31,.05,[.64,.46,.27],'wood',.01));
      }
      details.box(0,1.11,0,1.18,.12,1.18,snow,'snow',.055);
    });
  }
  // Fine packed drifts on existing solid terrain. Maximum added height 8 cm,
  // below the normal step height; never bridge the ravine or cover a doorway.
  const banks = new GeometryBatch(); banks.jitter = 0;
  for(let i=0;i<36;i++) {
    const z=40+(i%18)*4.1, x=i<18?31+Math.sin(i*2.3)*3:-33+Math.sin(i*1.9)*3;
    const y=sampleMapHeight(x,z);
    if(y<17 || [[x-.9,z],[x+.9,z],[x,z-.65],[x,z+.65]].some(([px,pz])=>Math.abs(sampleMapHeight(px!,pz!)-y)>.15))continue;
    banks.blob(x,y-.08,z,.55+(i%3)*.18,.16,.32+(i%4)*.1,snow,'snow',{segments:12,rings:5,seed:i,wobble:.08});
  }
  // Small golden ironwork and a deep door lintel, attached to the real chalet.
  const chalet=FJORD_MAP.props.find(p=>p.id==='chalet_north')!,layout=chalet.building!;
  details.with(Affine.translation(chalet.position.x,chalet.position.y,chalet.position.z).rotateY(chalet.rotationY),()=>{
    for(const side of [-1,1]) {
      const x=side*(layout.width/2-.15), z=layout.depth/2+.12;
      details.box(x,2.2,z,.13,.72,.14,trim,'wood',.025);
      details.box(x,2.48,z+.12,.35,.08,.33,trim,'metal',.025);
      details.box(x,2.20,z+.12,.22,.43,.22,[.98,.74,.30],'plain',.035);
      details.box(x,1.96,z+.12,.32,.07,.31,trim,'metal',.025);
    }
  });
  const meshes = [details.toMesh(scene,'reference-set-dressing',material),banks.toMesh(scene,'reference-packed-snow',material)].filter(m=>m!==null);
  const puff=new GeometryBatch();puff.jitter=0;
  puff.blob(0,0,0,1,1,1,[.76,.82,.84],'plain',{segments:10,rings:6});
  const plume=puff.toMesh(scene,'reference-chimney-smoke',material)!;
  plume.alwaysSelectAsActiveMesh=true;excludeFromInk(plume);excludeFromShadows(plume);plume.isPickable=false;plume.receiveShadows=false;
  const localX=layout.width*.21, localZ=-layout.depth*.175;
  const outlet=new Vector3(chalet.position.x+Math.cos(chalet.rotationY)*localX+Math.sin(chalet.rotationY)*localZ,
    chalet.position.y+roofBase(layout)+Math.tan(layout.roof.pitch)*(layout.width/2+layout.roof.overhang-Math.abs(localX))+2.1,
    chalet.position.z-Math.sin(chalet.rotationY)*localX+Math.cos(chalet.rotationY)*localZ);
  const matrices=new Float32Array(8*16), matrix=Matrix.Identity();let elapsed=0;
  plume.thinInstanceSetBuffer('matrix',matrices,16,false);
  const observer=scene.onBeforeRenderObservable.add(()=>{
    const camera=scene.activeCamera;if(!camera)return;
    const near=Vector3.DistanceSquared(camera.globalPosition,outlet)<180*180;
    plume.setEnabled(near);if(!near)return;
    elapsed+=Math.min(scene.getEngine().getDeltaTime()/1000,.05);
    for(let i=0;i<8;i++) {
      const age=(elapsed+i*.68)%5.44, t=age/5.44;
      const size=(.18+t*.64)*Math.min(1,age*4,(5.44-age)*2);
      Matrix.ScalingToRef(size,size*1.12,size,matrix);
      matrix.setTranslationFromFloats(outlet.x+age*.30+Math.sin(age*2+i)*.12,outlet.y+age*.72,outlet.z+age*.12);
      matrix.copyToArray(matrices,i*16);
    }
    plume.thinInstanceBufferUpdated('matrix');
  });
  scene.onDisposeObservable.addOnce(()=>scene.onBeforeRenderObservable.remove(observer));
  return [...meshes,plume];
}
