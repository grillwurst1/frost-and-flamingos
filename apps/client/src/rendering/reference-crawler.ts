import '@babylonjs/core/Meshes/thinInstanceMesh';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';
import type { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import { VEHICLES } from '@frost-and-flamingos/shared';
import { Affine, GeometryBatch, type RGB } from './map/geometry';

/** Clean, authored comic crawler: four shared-material draws, no texture downloads.
 * Pivot/muzzle dimensions are exactly the authoritative Fondue Crawler's.
 */
export function buildReferenceCrawler(scene: Scene, parent: TransformNode, material: ShaderMaterial) {
  const red: RGB = [.67,.075,.095], bright: RGB = [.84,.13,.14], steel: RGB = [.21,.26,.29];
  const dark: RGB = [.075,.095,.11], gold: RGB = [.93,.63,.17], cream: RGB = [.91,.86,.69];
  const body = new GeometryBatch(); body.jitter = 0;
  body.box(0,.93,0,2.48,.68,4.2,red,'metal',.16,bright);
  body.box(0,1.31,-.3,2.2,.21,3.25,bright,'metal',.08);
  body.box(0,1.49,1.14,1.50,.59,.86,red,'metal',.08);
  for(const side of [-1,1]) {
    body.box(side*.41,1.57,1.585,.65,.30,.045,dark,'plain',.01);
    body.box(side*.41,1.59,1.612,.55,.22,.02,[.37,.68,.75],'plain',.01);
    body.box(side*.41,1.64,1.626,.49,.033,.01,[.75,.87,.85],'plain',0);
    body.box(side*1.02,1.35,-1.16,.15,.11,.8,gold,'metal',.025);
    body.box(side*1.29,1.08,0,.38,.18,4.36,red,'metal',.035);
    for(let wheel=0;wheel<6;wheel++) {
      const z=-1.62+wheel*.65;
      body.with(Affine.translation(side*1.14,.56,z).rotateZ(-side*Math.PI/2),()=>{
        body.cylinder(.39,.39,.27,16,dark,'metal');
        body.cylinder(.28,.28,.285,16,steel,'metal');
        body.cylinder(.12,.12,.31,12,gold,'metal');
      });
    }
    for(const z of [-1.7,-.9,0,.9,1.7])body.blob(side*1.13,1.06,z,.035,.035,.035,gold,'metal',{segments:6,rings:3});
    body.box(side*.99,1.0,2.14,.30,.25,.11,steel,'metal',.04);
    body.blob(side*.99,1.04,2.21,.095,.095,.035,cream,'plain',{segments:12,rings:5});
    body.with(Affine.translation(side*1.28,1.25,-.1).rotateZ(Math.PI/2),()=>body.cylinder(.045,.045,.09,10,gold,'metal'));
  }
  // Armoured snow blade and rear engine louvres.
  body.box(0,.47,2.30,2.78,.70,.18,bright,'metal',.07,cream);
  body.box(0,.16,2.39,2.83,.09,.15,steel,'metal',.02);
  for(let i=0;i<9;i++)body.box((i-4)*.18,1.46,-1.26,.10,.035,.61,dark,'metal',.01);
  body.box(0,1.16,-2.14,1.12,.21,.08,steel,'metal',.02);
  for(const x of [-.75,.75])body.blob(x,1.10,-2.14,.075,.08,.04,[.94,.25,.10],'plain',{segments:10,rings:4});
  const hull=body.toMesh(scene,'reference-crawler-hull',material)!; hull.parent=parent; hull.unfreezeWorldMatrix();
  const weapon=VEHICLES.fondue_crawler.weapon!;
  const turret=new TransformNode('reference-crawler-turret',scene);turret.parent=parent;
  turret.position.copyFromFloats(weapon.turretPivot.x,weapon.turretPivot.y,weapon.turretPivot.z);
  const pot=new GeometryBatch();pot.jitter=0;
  pot.lathe([[.66,0],[.80,.12],[.91,.32],[.94,.70],[.88,.94],[.86,1.0],[.76,1.02]],32,red,'metal',{capBottom:true,capTop:false});
  pot.with(Affine.translation(0,.97,0),()=>pot.tube(Array.from({length:33},(_,i)=>[Math.sin(i/32*Math.PI*2)*.85,0,Math.cos(i/32*Math.PI*2)*.85]),.045,8,steel,'metal'));
  pot.cylinder(.76,.76,.06,32,gold,'plain',{y:.94});
  for(const side of [-1,1])pot.tube([[side*.85,.69,-.25],[side*1.13,.69,-.25],[side*1.13,.69,.25],[side*.85,.69,.25]],.055,10,steel,'metal');
  // A Swiss cross, three dimensional spoon and actual cheese holes.
  pot.box(0,.47,-.916,.39,.105,.025,cream,'plain',.01);pot.box(0,.47,-.918,.105,.39,.025,cream,'plain',.01);
  pot.log([.43,.98,-.25],[.75,1.81,-.39],.043,[.43,.24,.10],'wood',{segments:12});
  pot.blob(.77,1.82,-.40,.085,.16,.046,[.53,.32,.14],'wood',{segments:14,rings:6});
  for(let i=0;i<5;i++)pot.blob(Math.sin(i*2.4)*.48,.995,Math.cos(i*2.4)*.48,.13,.012,.09,[.75,.40,.06],'plain',{segments:12,rings:4});
  const dome=pot.toMesh(scene,'reference-crawler-caquelon',material)!;dome.parent=turret; dome.unfreezeWorldMatrix();
  const barrel=new TransformNode('reference-crawler-barrel',scene);barrel.parent=turret;
  barrel.position.copyFromFloats(weapon.barrelPivot.x,weapon.barrelPivot.y,weapon.barrelPivot.z);
  const gun=new GeometryBatch();gun.jitter=0;
  gun.with(Affine.rotationX(Math.PI/2),()=>{
    gun.cylinder(.17,.14,1.38,20,steel,'metal');
    gun.cylinder(.24,.21,.30,20,gold,'metal',{y:1.33});
    gun.cylinder(.15,.15,.015,20,dark,'plain',{y:1.645});
    gun.cylinder(.23,.23,.08,20,cream,'metal',{y:.15});
  });
  const cannon=gun.toMesh(scene,'reference-crawler-cannon',material)!;cannon.parent=barrel; cannon.unfreezeWorldMatrix();
  const link=new GeometryBatch();link.jitter=0;
  link.box(0,0,0,.46,.12,.215,dark,'metal',.018);
  link.box(0,-.069,0,.43,.045,.055,steel,'metal',.01);
  const tracks=link.toMesh(scene,'reference-crawler-tracks',material)!;tracks.parent=parent; tracks.unfreezeWorldMatrix();
  const count=40, matrices=new Float32Array(count*2*16), pos=new Vector3(), rotation=new Quaternion(), matrix=Matrix.Identity();
  const perimeter=6.6+Math.PI, scale=Vector3.One();let travel=0;
  function update(dt:number,speed:number) {
    if(Math.abs(speed)<.001&&tracks.thinInstanceCount>0)return;
    travel=(travel+dt*speed)%perimeter;
    for(let i=0;i<count;i++) {
      const d=((i/count*perimeter-travel)%perimeter+perimeter)%perimeter;
      let y:number,z:number,angle:number;
      if(d<3.3){y=.10;z=-1.65+d;angle=0;}
      else if(d<3.3+Math.PI*.5){const a=(d-3.3)/.5-Math.PI/2;y=.60+Math.sin(a)*.5;z=1.65+Math.cos(a)*.5;angle=-a-Math.PI/2;}
      else if(d<6.6+Math.PI*.5){y=1.10;z=1.65-(d-3.3-Math.PI*.5);angle=Math.PI;}
      else {const a=(d-6.6-Math.PI*.5)/.5+Math.PI/2;y=.60+Math.sin(a)*.5;z=-1.65+Math.cos(a)*.5;angle=-a-Math.PI/2;}
      Quaternion.RotationAxisToRef(Vector3.RightReadOnly,angle,rotation);
      for(let side=0;side<2;side++){pos.set(side===0?-1.29:1.29,y,z);Matrix.ComposeToRef(scale,rotation,pos,matrix);matrix.copyToArray(matrices,(i*2+side)*16);}
    }
    if(tracks.thinInstanceCount===0)tracks.thinInstanceSetBuffer('matrix',matrices,16,false);else tracks.thinInstanceBufferUpdated('matrix');
  }
  update(0,1);
  return {hull,turret,barrel,update};
}
