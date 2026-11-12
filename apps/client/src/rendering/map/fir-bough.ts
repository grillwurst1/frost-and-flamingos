import { GeometryBatch, mix, type RGB } from './geometry';

/** A closed drooping branch with a raised white snow cushion and a green
 * underside. Two matching skin patches split material flags at the same lip;
 * one hull avoids drawing the hidden undersides of overlapping snow blobs. */
export function firBough(batch:GeometryBatch,length:number,rise:number,scale:number,covered:boolean,green:RGB):void {
  const rows=[0,.50,1],widths=[.045,.34,.012],heights=[.035,.24,.012];
  const sides=8;
  for(const top of [true,false]) {
    const snow=covered&&top,grid:number[][]=[];
    for(let row=0;row<rows.length;row++) {
      const t=rows[row]!,before=Math.max(0,row-1),after=Math.min(rows.length-1,row+1),span=rows[after]!-rows[before]!;
      const width=length*widths[row]!,height=heights[row]!*scale*(snow?1.55:1);
      const widthSlope=length*(widths[after]!-widths[before]!)/span;
      const heightSlope=(heights[after]!-heights[before]!)*scale/span*(snow?1.55:1);
      const centre=rise*(.67-.76*t),ring:number[]=[];
      for(let col=0;col<=sides/2;col++) {
        const a=(col+(top?0:sides/2))/sides*Math.PI*2-Math.PI/2,s=Math.sin(a),c=Math.cos(a);
        const nx=s*height*length,ny=c*width*length,nz=-c*width*(-.76*rise+c*heightSlope)-s*s*height*widthSlope,n=Math.hypot(nx,ny,nz)||1;
        const tone=snow?mix([.64,.78,.87],[.98,.99,1],.40+.60*Math.max(0,c)):mix(green,[.20,.40,.33],.12+.16*Math.max(0,c));
        ring.push(batch.vertex(s*width,centre+c*height,t*length,nx/n,ny/n,nz/n,tone,snow?'snow':'foliage'));
      }
      grid.push(ring);
    }
    for(let row=1;row<grid.length;row++)for(let col=0;col<sides/2;col++) {
      const a=grid[row-1]![col]!,b=grid[row-1]![col+1]!,c=grid[row]![col+1]!,d=grid[row]![col]!;
      batch.triangle(a,c,b);batch.triangle(a,d,c);
    }
    for(const row of [0,rows.length-1]) {
      const t=rows[row]!,centre=batch.vertex(0,rise*(.67-.76*t),t*length,0,0,row===0?-1:1,snow?[.77,.87,.94]:green,snow?'snow':'foliage');
      for(let col=0;col<sides/2;col++){const a=grid[row]![col]!,b=grid[row]![col+1]!;if(row===0)batch.triangle(centre,a,b);else batch.triangle(centre,b,a);}
    }
  }
}
