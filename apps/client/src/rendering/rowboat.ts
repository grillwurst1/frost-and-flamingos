import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import type { Material } from '@babylonjs/core/Materials/material';
import { GeometryBatch, type V3, type RGB } from './map/geometry';

export interface RowboatModel { hull: Mesh; oars: Array<{ pivot: TransformNode; side: number; row: number }> }

/** Clinker-built hull with an actual open well, ribs, benches and four pivoting oars. */
export function buildRowboat(scene: Scene, material: Material, parent: TransformNode): RowboatModel {
  const batch = new GeometryBatch(); batch.jitter = 0;
  const wood: RGB = [0.49, 0.28, 0.13], light: RGB = [0.72, 0.49, 0.25];
  const hullPoint = (t: number, z: number, inner: boolean): V3 => {
    const width = Math.sqrt(Math.max(0.008, 1 - (z / 1.82) ** 2));
    return [Math.sin(t) * (inner ? 0.79 : 0.86) * width,
      0.55 - Math.cos(t) * (inner ? 0.51 : 0.61) + Math.abs(z) ** 3 * 0.012, z];
  };
  for (let length = 0; length < 28; length++) {
    const z0 = -1.78 + length * 3.56 / 28, z1 = -1.78 + (length + 1) * 3.56 / 28;
    for (let rib = 0; rib < 12; rib++) {
      const a = -Math.PI / 2 + rib * Math.PI / 12, b = a + Math.PI / 12;
      const outer = [hullPoint(a,z0,false),hullPoint(b,z0,false),hullPoint(b,z1,false),hullPoint(a,z1,false)];
      const inner = [hullPoint(a,z0,true),hullPoint(a,z1,true),hullPoint(b,z1,true),hullPoint(b,z0,true)];
      const c: RGB = rib % 2 ? wood : [0.58,0.35,0.17];
      batch.polygon(outer,c,'wood'); batch.polygon(inner,light,'wood');
    }
  }
  for (const side of [-1,1]) {
    const rim = Array.from({length:37},(_,i)=>hullPoint(side*Math.PI/2,-1.78+i*3.56/36,false));
    batch.tube(rim,0.045,10,light,'wood');
  }
  for (const z of [-1.78,1.78]) batch.box(0,0.32,z,0.18,0.6,0.09,wood,'wood',0.03);
  for (const z of [-0.6,0.55]) batch.box(0,0.43,z,1.48,0.07,0.29,light,'wood',0.025);
  for (const z of [-1.25,-0.85,-0.25,0.25,0.95,1.3]) {
    batch.tube(Array.from({length:17},(_,i)=>hullPoint(-Math.PI/2+i*Math.PI/16,z,true)),0.022,8,wood,'wood');
  }
  for (let plank=-3;plank<=3;plank++) batch.box(plank*0.12,0.08,0,0.11,0.035,2.4,light,'wood',0.008);
  batch.log([-0.2,0.6,1.69],[0.2,0.6,1.69],0.025,[0.72,0.69,0.55],'plain');
  const hull = batch.toMesh(scene,'rowboat-clinker-hull',material);
  if (!hull) throw new Error('Rowboat hull geometry is empty.');
  hull.unfreezeWorldMatrix(); hull.doNotSyncBoundingInfo=false;
  hull.parent=parent; hull.isPickable=false;
  const oars: RowboatModel['oars'] = [];
  for (const [row,z] of [-0.6,0.55].entries()) for (const side of [-1,1]) {
    const pivot = new TransformNode('rowboat-oar-pivot',scene);pivot.parent=parent;pivot.position.set(side*0.76,0.55,z);
    const oar = new GeometryBatch();oar.jitter=0;
    oar.log([0,0,0],[side*1.5,-0.18,-0.15],0.025,light,'wood',{segments:10});
    oar.box(side*1.5,-0.18,-0.15,0.5,0.04,0.18,wood,'wood',0.018);
    oar.box(side*-0.27,0,0,0.36,0.045,0.055,light,'wood',0.018);
    const blade = oar.toMesh(scene,'rowboat-oar',material);
    if (!blade) throw new Error('Rowboat oar geometry is empty.');
    blade.unfreezeWorldMatrix(); blade.doNotSyncBoundingInfo=false;
    blade.parent=pivot;
    oars.push({pivot,side,row});
  }
  return {hull,oars};
}
