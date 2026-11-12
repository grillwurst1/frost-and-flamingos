import { GeometryBatch } from './map/geometry';

/** Smooth six-sided billows, built once; analytic radial normals avoid the
 * noisy random per-vertex bumps of the previous sphere prototype. */
export function snowCloudGeometry(outline:boolean):GeometryBatch {
  const batch=new GeometryBatch();batch.jitter=0;
  batch.blob(0,0,0,1,1,1,outline?[.36,.55,.66]:[.97,.99,1],'plain',{segments:16,rings:8});
  const scale=outline?1.025:1;
  for(let i=0;i<batch.positions.length;i+=3) {
    const x=batch.positions[i]!,y=batch.positions[i+1]!,z=batch.positions[i+2]!;
    const cx=Math.cos(x*4),cy=Math.cos(y*4),cz=Math.cos(z*4),r=1+.045*cx*cy*cz;
    const gx=-.18*Math.sin(x*4)*cy*cz,gy=-.18*cx*Math.sin(y*4)*cz,gz=-.18*cx*cy*Math.sin(z*4);
    const dot=x*gx+y*gy+z*gz;
    const nx=x-(gx-x*dot)/r,ny=y-(gy-y*dot)/r,nz=z-(gz-z*dot)/r,n=Math.hypot(nx,ny,nz);
    batch.positions[i]=x*r*scale;batch.positions[i+1]=y*r*scale;batch.positions[i+2]=z*r*scale;
    batch.normals[i]=nx/n;batch.normals[i+1]=ny/n;batch.normals[i+2]=nz/n;
  }
  return batch;
}
