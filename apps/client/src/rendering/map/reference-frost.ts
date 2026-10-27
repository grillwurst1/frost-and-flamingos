/** Authored snow through the gorge, including its low floor; collision uses the same heightfield. */
export function referenceFrost(x:number,z:number,height:number):number {
  const fade=(a:number,b:number,v:number):number=>{const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t)};
  return (1-fade(70,115,Math.abs(x)))*fade(20,40,z)*(1-fade(155,195,z))*fade(-2,1,height);
}
