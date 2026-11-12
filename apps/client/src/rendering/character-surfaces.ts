import { Color4, Vector3 } from '@babylonjs/core/Maths/math';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { Scene } from '@babylonjs/core/scene';

/** Authored surfaces, built once per outfit. UV.x stores local cavity shading,
 * independently of the selected skin/hair colour; no texture or screen pass. */
function surface(scene: Scene, name: string, positions: number[], indices: number[], color: Color4,
  cavity: number[] = [], reverseWinding = true): Mesh {
  // Babylon's default front face uses the opposite winding to the RH surface
  // construction above (the same convention as GeometryBatch.triangle).
  for (let i = 0; reverseWinding && i < indices.length; i += 3) {
    const b = indices[i + 1]!; indices[i + 1] = indices[i + 2]!; indices[i + 2] = b;
  }
  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);
  const data = new VertexData();
  data.positions = positions; data.normals = normals; data.indices = indices;
  data.colors = Array.from({ length: positions.length / 3 }, () => [color.r, color.g, color.b, 0]).flat();
  data.uvs = Array.from({ length: positions.length / 3 }, (_, i) => [cavity[i] ?? 0, 0]).flat();
  const mesh = new Mesh(name, scene); data.applyToMesh(mesh, false); mesh.isPickable = false;
  return mesh;
}

export const MOUNTAIN_BOOT={width:.16,height:.16,depth:.28} as const;
const BOOT_SECTION=[[-.5,.25,-.46,.23],[-.4,.40,-.50,.67],[-.2,.43,-.50,.75],
  [.02,.47,-.50,.37],[.28,.50,-.50,.08],[.44,.42,-.48,-.02],[.5,.16,-.38,-.13]] as const;

/** Shared heel/ankle/instep/toe section for the actual leather and its laces. */
function bootSection(z:number,width:number,height:number):{radius:number;centre:number;rise:number} {
  let values:readonly number[]=BOOT_SECTION[0];
  for(let i=0;i+1<BOOT_SECTION.length;i++) {
    const a=BOOT_SECTION[i]!,b=BOOT_SECTION[i+1]!;
    if(z>b[0])continue;
    const t=Math.max(0,Math.min(1,(z-a[0])/(b[0]-a[0]))),u=t*t*(3-2*t);
    values=a.map((v,k)=>v+(b[k]!-v)*u);break;
  }
  return {radius:values[1]!*width,centre:(values[2]!+values[3]!)*height/2,rise:(values[3]!-values[2]!)*height/2};
}

function bootHeight(section:{centre:number;rise:number},cosine:number):number {
  const bottom=section.centre-section.rise,height=section.rise*2;
  // A shoe rests on a sole: its sides must not curl up like an elliptical tube.
  return bottom+height*(cosine>=0?.08+.92*cosine:.08*(1+cosine));
}

export function bootLacePoint(x:number,t:number):Vector3 {
  const z=-.15+.48*t,s=bootSection(z,MOUNTAIN_BOOT.width,MOUNTAIN_BOOT.height);
  return new Vector3(x,-.79+bootHeight(s,Math.sqrt(Math.max(0,1-(x/s.radius)**2)))+.0025,.04+z*MOUNTAIN_BOOT.depth);
}

/** Closed leather upper with a raised heel cup and a low rounded toe. */
export function sculptedBoot(scene:Scene,name:string,width:number,height:number,depth:number):Mesh {
  const p:number[]=[],f:number[]=[],cavity:number[]=[];const rows=16,sides=24;
  for(let row=0;row<=rows;row++) {
    const z=row/rows-.5,s=bootSection(z,width,height);
    for(let col=0;col<sides;col++) {
      const angle=col/sides*Math.PI*2;
      p.push(Math.sin(angle)*s.radius,bootHeight(s,Math.cos(angle)),z*depth);
      cavity.push(.025+.07*Math.max(0,-Math.cos(angle)));
      if(row) {
        const a=(row-1)*sides+col,b=(row-1)*sides+(col+1)%sides,c=row*sides+(col+1)%sides,d=row*sides+col;
        f.push(a,c,b,a,d,c);
      }
    }
  }
  for(const end of [0,rows]) {
    const s=bootSection(end/rows-.5,width,height),centre=p.length/3;
    p.push(0,s.centre,(end/rows-.5)*depth);cavity.push(.03);
    for(let col=0;col<sides;col++) {
      const a=end*sides+col,b=end*sides+(col+1)%sides;
      f.push(centre,...(end===0?[a,b]:[b,a]));
    }
  }
  return surface(scene,name,p,f,new Color4(1,1,1,1),cavity);
}

/** A thin bevelled sole follows the same heel/toe footprint as the upper. */
export function sculptedBootSole(scene:Scene,name:string,width:number,height:number,depth:number):Mesh {
  const outline:Vector3[]=[];
  for(const side of [1,-1])for(let i=0;i<=16;i++) {
    const z=(side===1?16-i:i)/16-.5;
    outline.push(new Vector3(bootSection(z,width,height).radius*side,0,z*depth));
  }
  const p:number[]=[],f:number[]=[],count=outline.length,profile=[[.94,-.5],[1,-.32],[1,.32],[.94,.5]] as const;
  for(let row=0;row<profile.length;row++)for(let col=0;col<count;col++) {
    const point=outline[col]!,[scale,y]=profile[row]!;
    p.push(point.x*scale,y*height,point.z*scale);
    if(row){const a=(row-1)*count+col,b=(row-1)*count+(col+1)%count,c=row*count+(col+1)%count,d=row*count+col;f.push(a,b,c,a,c,d);}
  }
  for(const row of [0,profile.length-1]) {
    const centre=p.length/3;p.push(0,profile[row]![1]*height,0);
    for(let col=0;col<count;col++){const a=row*count+col,b=row*count+(col+1)%count;f.push(centre,...(row===0?[b,a]:[a,b]));}
  }
  return surface(scene,name,p,f,new Color4(1,1,1,1));
}

/** A short neck flowing into the trapezius; no split circumferential seam. */
export function sculptedNeck(scene:Scene,name:string):Mesh {
  const profile=[[.110,-.065],[.095,-.040],[.077,-.010],[.068,.025],[.071,.060]] as const;
  const p:number[]=[],f:number[]=[];const sides=32;
  for(let row=0;row<profile.length;row++)for(let col=0;col<sides;col++) {
    const [radius,y]=profile[row]!,angle=col/sides*Math.PI*2;
    p.push(Math.sin(angle)*radius,y,Math.cos(angle)*radius*.85);
    if(row) {
      const a=(row-1)*sides+col,b=(row-1)*sides+(col+1)%sides,c=row*sides+(col+1)%sides,d=row*sides+col;
      f.push(a,b,c,a,c,d);
    }
  }
  for(const row of [0,profile.length-1]) {
    const centre=p.length/3;p.push(0,profile[row]![1],0);
    for(let col=0;col<sides;col++) {
      const a=row*sides+col,b=row*sides+(col+1)%sides;
      f.push(centre,...(row===0?[b,a]:[a,b]));
    }
  }
  return surface(scene,name,p,f,new Color4(1,1,1,1));
}

/** A fitted leather/cloth ribbon with bevelled edges, following the garment
 * rather than floating as a straight board across a curved chest/back. */
export function tailoredStrip(scene: Scene, name: string, path: readonly Vector3[], width: number | ((t:number)=>number),
  thickness: number, color: Color4): Mesh {
  const positions: number[] = [], indices: number[] = [], cavity: number[] = [];
  const section = [[-.5, -.25], [-.43, -.5], [.43, -.5], [.5, -.25], [.5, .25], [.43, .5], [-.43, .5], [-.5, .25]] as const;
  for (let row = 0; row < path.length; row++) {
    const p = path[row]!;
    const tangent = path[Math.min(row + 1, path.length - 1)]!.subtract(path[Math.max(0, row - 1)]!).normalize();
    const normal = new Vector3(p.x * .3, 0, p.z < 0 ? -1 : 1);
    const across = Vector3.Cross(tangent, normal).normalize();
    const out = Vector3.Cross(across, tangent).normalize();
    const rowWidth=typeof width==='number'?width:width(row/Math.max(1,path.length-1));
    for (const [x, z] of section) {
      const at = p.add(across.scale(x * rowWidth)).add(out.scale(z * thickness));
      positions.push(at.x, at.y, at.z); cavity.push(z < 0 ? .12 : .025);
    }
    if (row) for (let j = 0; j < 8; j++) {
      const a = (row - 1) * 8 + j, b = (row - 1) * 8 + (j + 1) % 8, c = row * 8 + (j + 1) % 8, d = row * 8 + j;
      indices.push(a, b, c, a, c, d);
    }
  }
  for (let j = 1; j < 7; j++) {
    indices.push(0, j + 1, j);
    const last = (path.length - 1) * 8; indices.push(last, last + j, last + j + 1);
  }
  return surface(scene, name, positions, indices, color, cavity, false);
}

/** A real folded cloth ring, open for the arm and closed through its thickness. */
export function rolledSleeve(scene:Scene,name:string,diameter:number,height:number,color:Color4):Mesh {
  const section=[[.060,-.025],[.066,-.028],[.076,-.022],[.079,-.009],[.077,.011],[.071,.025],[.061,.024],[.058,.014],[.058,-.014]] as const;
  const p:number[]=[],indices:number[]=[],cavity:number[]=[];const sides=32;
  for(const [r,y] of section)for(let j=0;j<sides;j++) {
    const a=j/sides*Math.PI*2;
    p.push(Math.sin(a)*r*diameter/.158,y*height/.056+Math.cos(a*2)*.0015,Math.cos(a)*r*diameter/.158);
    cavity.push(r<.065?.10:.025);
  }
  for(let row=0;row<section.length;row++)for(let j=0;j<sides;j++) {
    const a=row*sides+j,b=row*sides+(j+1)%sides,c=((row+1)%section.length)*sides+(j+1)%sides,d=((row+1)%section.length)*sides+j;
    indices.push(a,b,c,a,c,d);
  }
  return surface(scene,name,p,indices,color,cavity);
}

/** One shaped beard wraps around the jaw, with broad carved locks. Its upper
 * edge follows cheeks/sideburns and its pointed chin replaces intersecting balls. */
export function sculptedBeard(scene: Scene, headY: number, color: Color4): Mesh {
  const positions: number[] = [], indices: number[] = [], cavity: number[] = [];
  const rows = 14, segments = 40;
  for (let row = 0; row <= rows; row++) {
    const t = row / rows;
    for (let col = 0; col <= segments; col++) {
      const angle = -1.85 + col / segments * 3.7;
      const side = Math.abs(Math.sin(angle));
      // Leave the central lip opening below the moustache, while sideburns
      // continue to the cheeks. A solid upper edge obscures the sculpted mouth.
      const upper = -.13 + side ** 2 * .14;
      const lower = -.272 + side ** 1.5 * .09;
      const y = lower + (upper - lower) * t;
      const radius = .055 + .143 * Math.sin(t * Math.PI / 2);
      const groove = (.5 + .5 * Math.cos(angle * 19 + t * .8)) * .006 * Math.sin(Math.PI * t);
      const front = Math.max(0, Math.cos(angle));
      positions.push(Math.sin(angle) * (radius + groove), headY + y,
        Math.cos(angle) * (radius * .94 + groove) + front * .036);
      cavity.push(.04 + .16 * (1 - t) + .07 * (1 - Math.cos(angle * 19)) * Math.sin(Math.PI * t));
      if (row && col) {
        const a = (row - 1) * (segments + 1) + col - 1, b = a + 1, c = row * (segments + 1) + col, d = c - 1;
        indices.push(a, b, c, a, c, d);
      }
    }
  }
  return surface(scene, 'sculpted-jaw-beard', positions, indices, color, cavity);
}

/** Curved, tapered felt-hat feather with a raised quill and no alpha plane. */
export function sculptedHatFeather(scene: Scene, headY: number, color: Color4): Mesh {
  const positions: number[] = [], indices: number[] = [], cavity: number[] = [];
  const rows = 16, sides = 8;
  for (let row = 0; row <= rows; row++) {
    const t = row / rows;
    const width = .001 + .024 * Math.sin(Math.PI * t) ** .7;
    const x = .20 + .075 * t + .025 * t * t, y = headY + .23 + .27 * t;
    for (let col = 0; col < sides; col++) {
      const a = col / sides * Math.PI * 2;
      positions.push(x + Math.cos(a) * width, y - Math.cos(a) * width * .4,
        .035 + .025 * t * t + Math.sin(a) * (.002 + .004 * (1 - t)));
      cavity.push(.035 + .10 * Math.abs(Math.cos(a)));
      if (row) {
        const aa = (row - 1) * sides + col, b = (row - 1) * sides + (col + 1) % sides;
        const c = row * sides + (col + 1) % sides, d = row * sides + col;
        indices.push(aa, b, c, aa, c, d);
      }
    }
  }
  for (let col = 1; col < sides - 1; col++) {
    indices.push(0, col + 1, col);
    const last = rows * sides; indices.push(last, last + col, last + col + 1);
  }
  return surface(scene, 'tirol-sculpted-feather', positions, indices, color, cavity);
}

/** A continuous sculpted hair volume with a real forehead opening. A full
 * sphere reaches in front of the eyes; the hairline must follow the skull. */
export function sculptedHairCap(scene: Scene, headY: number, color: Color4, style: number): Mesh {
  const positions: number[] = [], indices: number[] = [], cavity: number[] = [];
  const sides = 64, rows = 18, afro = style === 1, quiff = style === 5;
  for (let row = 0; row < rows; row++) {
    const t = row / rows * Math.PI / 2;
    for (let col = 0; col < sides; col++) {
      const angle = col / sides * Math.PI * 2, front = Math.max(0, Math.cos(angle));
      const hairline = style === 0 ? .035 + .12 * front : -.065 + .22 * front ** 3;
      const crown = afro ? .39 : quiff ? .40 : .30;
      const bulge = afro ? .055 * Math.sin(t * 2) : .012 * Math.sin(t * 2);
      const curl = afro ? .009 * Math.sin(angle * 18 + row * 1.7) * Math.sin(row * 1.8 + angle * 3) : .0035 * Math.sin(angle * 22 + t * 3);
      const rx = (afro ? .300 : .220) + bulge + curl;
      const rz = (.207 + .027 * (1 - front)) + bulge + curl;
      positions.push(Math.sin(angle) * rx * Math.cos(t),
        headY + hairline + (crown - hairline) * Math.sin(t) + (quiff ? .045 * front * Math.sin(2 * t) : 0),
        -.015 + Math.cos(angle) * rz * Math.cos(t));
      cavity.push(afro ? .025 + .08 * Math.max(0, -curl / .009) : .025);
      if (row) {
        const a = (row - 1) * sides + col, b = (row - 1) * sides + (col + 1) % sides;
        const c = row * sides + col, d = row * sides + (col + 1) % sides;
        indices.push(a, b, c, b, d, c);
      }
    }
  }
  const pole = positions.length / 3;
  positions.push(0, headY + (afro ? .39 : quiff ? .40 : .30), -.015); cavity.push(.025);
  for (let col = 0; col < sides; col++) indices.push((rows - 1) * sides + col, (rows - 1) * sides + (col + 1) % sides, pole);
  if (afro) for (let curl = 0; curl < 12; curl++) {
    // Rounded forehead curls fill the area hidden by the source's goggles.
    const angle = -1.1 + curl / 11 * 2.2;
    const center = new Vector3(Math.sin(angle) * .22, headY + .19 + .035 * Math.cos(angle), .18 * Math.cos(angle) - .015);
    const radius = .043, first = positions.length / 3, columns = 8, rings = 4;
    for (let row = 1; row < rings; row++) {
      const latitude = -Math.PI / 2 + row / rings * Math.PI;
      for (let col = 0; col < columns; col++) {
        const phi = col / columns * Math.PI * 2;
        positions.push(center.x + Math.sin(phi) * Math.cos(latitude) * radius,
          center.y + Math.sin(latitude) * radius, center.z + Math.cos(phi) * Math.cos(latitude) * radius);
        cavity.push(.025);
        if (row > 1) {
          const a = first + (row - 2) * columns + col, b = first + (row - 2) * columns + (col + 1) % columns;
          const c = first + (row - 1) * columns + col, d = first + (row - 1) * columns + (col + 1) % columns;
          indices.push(a, b, c, b, d, c);
        }
      }
    }
    const low = positions.length / 3; positions.push(center.x, center.y - radius, center.z); cavity.push(.04);
    const high = positions.length / 3; positions.push(center.x, center.y + radius, center.z); cavity.push(.025);
    for (let col = 0; col < columns; col++) {
      indices.push(low, first + (col + 1) % columns, first + col);
      const last = first + (rings - 2) * columns; indices.push(last + col, last + (col + 1) % columns, high);
    }
  }
  return surface(scene, 'sculpted-hair-cap', positions, indices, color, cavity);
}

/** Continuous cargo-trouser fabric. Broad knee and cuff compression is actual
 * geometry; local cavity shade adds depth without another texture or pass. */
export function sculptedTrouserLeg(scene: Scene, side: 'left' | 'right', bottom: number, color: Color4): Mesh {
  const positions: number[] = [], indices: number[] = [], cavity: number[] = [];
  const sides = 28, rows = Math.ceil(-bottom / .022);
  const sections = [[0, .084], [.08, .096], [.20, .092], [.31, .083], [.40, .079], [.48, .082], [.57, .075], [.67, .068], [.75, .065]] as const;
  const ridge = (d: number, centre: number, width: number) => Math.exp(-(((d - centre) / width) ** 2));
  for (let row = 0; row <= rows; row++) {
    const distance = -bottom * row / rows;
    let radius = sections[sections.length - 1]![1] as number;
    for (let k = 0; k + 1 < sections.length; k++) {
      const a = sections[k]!, b = sections[k + 1]!;
      if (distance <= b[0]) { radius = a[1] + (b[1] - a[1]) * (distance - a[0]) / (b[0] - a[0]); break; }
    }
    for (let col = 0; col < sides; col++) {
      const angle = col / sides * Math.PI * 2, front = Math.max(0, Math.cos(angle));
      const slant = .018 * Math.sin(angle), knee = .55 + .45 * front;
      const fold = knee * (.008 * ridge(distance, .355 + slant, .020) - .004 * ridge(distance, .385 + slant, .014)
        + .006 * ridge(distance, .438 - slant, .024))
        + .004 * Math.cos(angle * 3) * ridge(distance, .07, .08)
        + .004 * ridge(distance, -bottom - .035 + slant * .3, .016);
      const r = radius + fold;
      positions.push(Math.sin(angle) * r, -distance, Math.cos(angle) * r * 1.13);
      cavity.push(.025 + .10 * knee * ridge(distance, .385 + slant, .014)
        + .035 * (1 - Math.cos(angle * 2)) * ridge(distance, .1, .13));
      if (row) {
        const a = (row - 1) * sides + col, b = (row - 1) * sides + (col + 1) % sides;
        const c = row * sides + col, d = row * sides + (col + 1) % sides;
        indices.push(a, c, b, b, c, d);
      }
    }
  }
  const top = positions.length / 3; positions.push(0, 0, 0, 0, bottom, 0); cavity.push(.06, .06);
  for (let col = 0; col < sides; col++) {
    const next = (col + 1) % sides;
    indices.push(top, col, next, top + 1, rows * sides + next, rows * sides + col);
  }
  return surface(scene, `${side}-trouser-fabric`, positions, indices, color, cavity);
}
