/** Original distant Alpine landforms. One static draw outside the playable basin,
 * with no panorama texture, collision bodies or shadow-map coverage. */
import type { Scene } from '@babylonjs/core/scene';
import type { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { excludeFromShadows } from './materials';
import { mix } from './map/geometry';
import { SURFACE_ATTRIBUTE, surfaceId, surfaceToonAlpha } from './map/surfaces';

const PEAKS = [
  [-285,280,165,125,150],[-155,245,115,110,117],[-50,300,140,130,103],
  [-45,195,85,80,66],[150,285,150,125,108],[325,350,175,135,155],
] as const;

function heightAt(x:number,z:number):number {
  let height=-14;
  for(const [cx,cz,rx,rz,top] of PEAKS) {
    const px=(x-cx)/rx,pz=(z-cz)/rz,angle=Math.atan2(pz,px);
    const ribs=1+.20*Math.cos(angle*3+cx*.013)+.08*Math.cos(angle*5+cz*.017);
    const distance=Math.hypot(px,pz)/ribs;
    const ridge=Math.max(0,1-distance);
    height=Math.max(height,-14+top*ridge*(1+.045*Math.sin(x*.041+z*.027)));
  }
  return height;
}

export function buildReferenceAlps(scene:Scene,material:ShaderMaterial) {
  const columns=64,rows=40,dx=800/columns,dz=390/rows;
  const width=columns+1,count=width*(rows+1);
  const positions=new Float32Array(count*3),normals=new Float32Array(count*3),colors=new Float32Array(count*4);
  for(let row=0;row<=rows;row++)for(let col=0;col<=columns;col++) {
    const i=row*width+col;
    const x=-400+col*dx,z=100+row*dz;
    const altitude=heightAt(x,z);
    const nx=(heightAt(x-dx*.5,z)-heightAt(x+dx*.5,z))/dx;
    const nz=(heightAt(x,z-dz*.5)-heightAt(x,z+dz*.5))/dz;
    const length=Math.hypot(nx,1,nz),up=1/length;
    const snow=Math.min(1,Math.max(0,(altitude-2)/24))*Math.min(1,Math.max(0,(up-.35)/.25));
    const facing=Math.min(1,Math.max(0,.55+(-nx*.7-nz*.35)/length*1.3));
    const ice=mix([.31,.53,.71],[.91,.97,1],facing);
    positions.set([x,altitude,z],i*3);normals.set([nx/length,up,nz/length],i*3);
    colors.set([...mix([.44,.58,.69],ice,snow),surfaceToonAlpha('plain')],i*4);
  }
  const indices:number[]=[];
  const face=(a:number,b:number,c:number)=>{
    if(Math.max(positions[a*3+1]!,positions[b*3+1]!,positions[c*3+1]!)>-13.9)indices.push(a,b,c);
  };
  for(let row=0;row<rows;row++)for(let col=0;col<columns;col++) {
    const a=row*width+col,b=a+1,c=a+width+1,d=a+width;
    face(a,d,b);face(b,d,c);
  }
  const mesh=new Mesh('reference-distant-alps',scene),data=new VertexData();
  data.positions=positions;data.normals=normals;data.colors=colors;data.indices=indices;data.applyToMesh(mesh,false);
  mesh.setVerticesData(SURFACE_ATTRIBUTE,new Float32Array(count).fill(surfaceId('plain')),false,1);
  mesh.material=material;
  mesh.isPickable=false;mesh.receiveShadows=false;mesh.freezeWorldMatrix();
  mesh.doNotSyncBoundingInfo=true;
  excludeFromShadows(mesh);
  return mesh;
}
