import { Vector3 } from '@babylonjs/core/Maths/math';

/** Normalised cloth outline, including a sloping shoulder into the neck. */
const OUTLINE = [[-.5,.38],[-.35,.40],[-.05,.46],[.20,.50],[.36,.47],[.44,.36],[.50,.20]] as const;

/** Shape-preserving cubic interpolation avoids angular rings and shoulder overshoot. */
export function shirtRadius(height: number): number {
  const y = Math.max(-.5, Math.min(.5, height));
  const slope = (i: number): number => {
    const a = OUTLINE[Math.max(0,i-1)]!, b = OUTLINE[i]!, c = OUTLINE[Math.min(OUTLINE.length-1,i+1)]!;
    if (i === 0) return (c[1]-b[1])/(c[0]-b[0]);
    if (i === OUTLINE.length-1) return (b[1]-a[1])/(b[0]-a[0]);
    const left=(b[1]-a[1])/(b[0]-a[0]),right=(c[1]-b[1])/(c[0]-b[0]);
    return left*right<=0 ? 0 : 2*left*right/(left+right);
  };
  for(let i=0;i+1<OUTLINE.length;i++) {
    const a=OUTLINE[i]!,b=OUTLINE[i+1]!;
    if(y>b[0])continue;
    const span=b[0]-a[0],t=(y-a[0])/span,t2=t*t,t3=t2*t;
    return (2*t3-3*t2+1)*a[1]+(t3-2*t2+t)*span*slope(i)
      +(-2*t3+3*t2)*b[1]+(t3-t2)*span*slope(i+1);
  }
  return OUTLINE[OUTLINE.length-1]![1];
}

export function shirtProfile(): Array<[number,number]> {
  const levels=new Set<number>(OUTLINE.map(([y])=>y));
  for(let i=0;i<=24;i++)levels.add(i/24-.5);
  return [...levels].sort((a,b)=>a-b).map(y=>[shirtRadius(y),y]);
}

/** One surface definition for the actual shell, placket, collar and harness. */
export function shirtSurface(angle:number,u:number,width:number,depth:number): readonly [number,number] {
  const radius=shirtRadius(u),edge=Math.max(0,1-Math.abs(u*2));
  const fold=Math.sin(angle*7+u*4)*.004*edge*edge;
  return [Math.sin(angle)*(width*radius+fold),Math.cos(angle)*(depth*radius+fold)];
}

export function shirtPoint(x:number,y:number,width:number,height:number,depth:number,centre:number,offset=.006,back=1):Vector3 {
  const u=Math.max(-.5,Math.min(.5,(y-centre)/height));
  const target=Math.max(-.94*width*shirtRadius(u),Math.min(.94*width*shirtRadius(u),x));
  let lo=-Math.PI/2,hi=Math.PI/2;
  for(let i=0;i<20;i++) {
    const a=(lo+hi)/2,angle=back>0?a:Math.PI-a;
    if(shirtSurface(angle,u,width,depth)[0]<target)lo=a;else hi=a;
  }
  const a=(lo+hi)/2,point=shirtSurface(back>0?a:Math.PI-a,u,width,depth);
  return new Vector3(point[0],centre+u*height,point[1]+back*offset);
}
