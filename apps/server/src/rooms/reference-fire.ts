import { WEAPON_STATS, type DestructibleState, type Vec3, type WeaponId } from '@frost-and-flamingos/shared';
import { REFERENCE_CHALET_FIRE, insideReferenceChalet } from '@frost-and-flamingos/shared';

/** Reference-only environmental state. Existing map-sync carries its burning flag. */
export class ReferenceChaletFire {
  private cooling=0;
  private burning:boolean;
  constructor(private readonly initialBurning=true){this.burning=initialBurning;}
  snapshot():DestructibleState {return {id:REFERENCE_CHALET_FIRE.id,stage:0,hp:REFERENCE_CHALET_FIRE.maxHp,burning:this.burning};}
  reset():void {this.burning=this.initialBurning;this.cooling=0;}
  hit(weapon:WeaponId,point:Vec3):'extinguished'|'ignited'|null {
    if(!insideReferenceChalet(point))return null;
    if(this.burning&&weapon==='snow_cannon') {
      this.cooling+=WEAPON_STATS.snow_cannon.damage;
      if(this.cooling>=REFERENCE_CHALET_FIRE.cooling){this.burning=false;this.cooling=0;return 'extinguished';}
    } else if(!this.burning&&weapon==='sand_flamer') {
      this.burning=true;this.cooling=0;return 'ignited';
    }
    return null;
  }
  /** Caller additionally checks actual solid-wall occlusion before dealing damage. */
  dangerNear(feet:Vec3,height:number):Vec3|null {
    if(!this.burning)return null;
    const y=feet.y+height*.55;
    return REFERENCE_CHALET_FIRE.points.find(point=>Math.hypot(feet.x-point.x,y-point.y,feet.z-point.z)<REFERENCE_CHALET_FIRE.radius)??null;
  }
}
