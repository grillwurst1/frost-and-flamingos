import { expect, test } from 'bun:test';
import RAPIER from '@dimforge/rapier3d-compat';
import { WEAPON_TABLE, convergedShotDirection, sampleMapHeight, type PlayerProfile, type Vec3 } from '@frost-and-flamingos/shared';
import { InputButton, createRoom, joinPlayer, placePlayer, playerOf, run, sendInput } from './vehicle-helpers';

function aimAt(room: Awaited<ReturnType<typeof createRoom>>, id:number, target:Vec3) {
  const p=playerOf(room,id) as unknown as {character:{position:Vec3;eyeHeight:number}};
  const eye={...p.character.position,y:p.character.position.y+p.character.eyeHeight};
  const camera={x:eye.x+1.9,y:eye.y-.24,z:eye.z-3.25};
  return {eye,direction:convergedShotDirection(eye,camera,{x:0,y:0,z:1},target.z-camera.z)};
}

test('offset reticle shots damage the actual target; a forged forward origin still cannot bypass a wall',async()=>{
  const room=await createRoom();
  try{
    const shooter=joinPlayer(room,'alpine'),enemy=joinPlayer(room,'lagoon','heavy');
    const position={x:288,y:sampleMapHeight(288,125)+.05,z:125};
    placePlayer(room,shooter.id,position);
    placePlayer(room,enemy.id,{x:position.x+1.9,y:sampleMapHeight(position.x+1.9,135)+.05,z:135});
    run(room,3);
    const hp=playerOf(room,enemy.id).hp;
    const fire=(forged=false)=>{
      const {eye,direction}=aimAt(room,shooter.id,playerOf(room,enemy.id).character.position);
      sendInput(room,shooter,InputButton.FirePrimary,0,0);sendInput(room,enemy,0);
      room.handleFire(shooter.socket,{clientTick:room.getServerTick(),origin:forged?{...eye,z:eye.z+5}:eye,direction,weaponId:WEAPON_TABLE.code.smg});
    };
    run(room,12,()=>fire());
    expect(playerOf(room,enemy.id).hp).toBeLessThan(hp);
    const after=playerOf(room,enemy.id).hp;
    const physics=(room as unknown as {physics:{world:RAPIER.World}}).physics;
    const wall=physics.world.createCollider(RAPIER.ColliderDesc.cuboid(4,3,.12).setTranslation(288,position.y+2,128));
    try{run(room,12,()=>fire(true));expect(playerOf(room,enemy.id).hp).toBe(after)}
    finally{physics.world.removeCollider(wall,true)}
  }finally{room.stop()}
});

test('a malformed request cannot fire or consume ammunition',async()=>{
  const room=await createRoom();
  try{
    const shooter=joinPlayer(room,'alpine');
    const p=playerOf(room,shooter.id) as unknown as {profile:PlayerProfile;character:{position:Vec3;eyeHeight:number};ammo:Array<{magazine:number}>};
    const ammunition=p.ammo[0]!.magazine;
    for(const direction of [{x:NaN,y:0,z:1},{x:0,y:0,z:4},{x:0,y:0,z:0}]){
      const origin={...p.character.position,y:p.character.position.y+p.character.eyeHeight};
      sendInput(room,shooter,InputButton.FirePrimary,0,0);
      room.handleFire(shooter.socket,{clientTick:room.getServerTick(),origin,direction,weaponId:WEAPON_TABLE.code.smg});run(room,1);
    }
    expect(shooter.socket.eventsOf('WEAPON_FIRED')).toHaveLength(0);
    expect(p.ammo[0]!.magazine).toBe(ammunition);
  }finally{room.stop()}
});

test('personal projectiles start at the server eye and cannot skip a thin wall beside the muzzle',async()=>{
  const room=await createRoom();
  try{
    const shooter=joinPlayer(room,'alpine','heavy');
    const p=playerOf(room,shooter.id) as unknown as {profile:PlayerProfile;character:{position:Vec3;eyeHeight:number}};
    p.profile.loadout.secondary='bazooka';
    const position={x:288,y:sampleMapHeight(288,125)+.05,z:125};
    placePlayer(room,shooter.id,position);run(room,2);
    const origin={...p.character.position,y:p.character.position.y+p.character.eyeHeight};
    const physics=(room as unknown as {physics:{world:RAPIER.World}}).physics;
    const wall=physics.world.createCollider(RAPIER.ColliderDesc.cuboid(3,3,.06).setTranslation(origin.x,origin.y,origin.z+.4));
    try{
      room.handleInput(shooter.socket,{sequence:shooter.sequence++,buttons:InputButton.FirePrimary,yaw:0,pitch:0,weaponSlot:2});
      run(room,1);
      room.handleFire(shooter.socket,{clientTick:room.getServerTick(),origin,direction:{x:0,y:0,z:1},weaponId:WEAPON_TABLE.code.bazooka});
      run(room,1);
      expect(shooter.socket.eventsOf('WEAPON_FIRED')).toHaveLength(1);
      expect((room as unknown as {projectiles:unknown[]}).projectiles).toHaveLength(0);
    }finally{physics.world.removeCollider(wall,true)}
  }finally{room.stop()}
});
