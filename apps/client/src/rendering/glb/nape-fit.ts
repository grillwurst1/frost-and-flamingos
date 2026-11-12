import type { Vector3 } from '@babylonjs/core/Maths/math';

/** Fit only the Heavy's lower occiput into its neck, once per cached body.
 * The closed skin, face, cranium height and all selected pigments are retained. */
export function fitHeavyNape(point:Vector3,normal:Vector3):void {
  const u=Math.max(0,Math.min(1,(1.35-point.y)/.05)),v=Math.max(0,Math.min(1,(-.04-point.z)/.03));
  const sy=u*u*(3-2*u),sz=v*v*(3-2*v),w=sy*sz;
  if(w===0)return;
  const wy=-6*u*(1-u)/.05*sz,wz=-6*v*(1-v)/.03*sy;
  const x=point.x,z=point.z,centre=-.045;
  const xx=1-.1*w,xy=-.1*x*wy,xz=-.1*x*wz;
  const zy=.4*(centre-z)*wy,zz=1-.4*w+.4*(centre-z)*wz;
  const nx=normal.x/xx,nz=(normal.z-xz*nx)/zz,ny=normal.y-xy*nx-zy*nz;
  normal.set(nx,ny,nz).normalize();
  point.x=x*xx;point.z=z+.4*(centre-z)*w;
}
