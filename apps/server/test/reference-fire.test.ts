import { expect, test } from 'bun:test';
import { ARENA_CHALET, PROTOCOL_VERSION, decodeMapStateSync, encodeMapStateSync, REFERENCE_CHALET_FIRE, WEAPON_TABLE, createDefaultProfile, type CharacterBody } from '@frost-and-flamingos/shared';
import { ReferenceChaletFire } from '../src/rooms/reference-fire';
import { MatchRoom } from '../src/rooms/match-room';
import { RecordingSocket, internals, joinPlayer, placePlayer, playerOf, run, sendInput, InputButton } from './vehicle-helpers';
import type { ClimateConquest } from '../src/rooms/conquest';

const point=REFERENCE_CHALET_FIRE.points[3]!;
function putOut(fire:ReferenceChaletFire) {for(let i=0;i<20;i++)fire.hit('snow_cannon',point);}

test('chalet fire needs sustained snow, remains extinguished and can be re-ignited by a real flame weapon',()=>{
  const fire=new ReferenceChaletFire();expect(fire.snapshot().burning).toBe(true);
  for(let i=0;i<19;i++)expect(fire.hit('snow_cannon',point)).toBeNull();
  expect(fire.snapshot().burning).toBe(true);expect(fire.hit('snow_cannon',point)).toBe('extinguished');
  expect(fire.snapshot().burning).toBe(false);expect(fire.hit('snow_cannon',point)).toBeNull();
  expect(fire.hit('sand_flamer',point)).toBe('ignited');expect(fire.snapshot().burning).toBe(true);
});

test('shots elsewhere and ordinary bullets cannot control the chalet fire',()=>{
  const fire=new ReferenceChaletFire();
  for(let i=0;i<30;i++){fire.hit('snow_cannon',{x:0,y:0,z:0});fire.hit('smg',point);}
  expect(fire.snapshot().burning).toBe(true);putOut(fire);
  expect(fire.hit('sand_flamer',{x:0,y:0,z:0})).toBeNull();expect(fire.snapshot().burning).toBe(false);
  fire.reset();expect(fire.snapshot()).toEqual({id:REFERENCE_CHALET_FIRE.id,stage:0,hp:500,burning:true});
});

test('only a burning patch is dangerous at an actual nearby body height',()=>{
  const fire=new ReferenceChaletFire(),feet={...point,y:point.y-.8};
  expect(fire.dangerNear(feet,1.88)).not.toBeNull();
  expect(fire.dangerNear({...feet,x:feet.x+10},1.88)).toBeNull();putOut(fire);
  expect(fire.dangerNear(feet,1.88)).toBeNull();
});

test('authoritative snow-cannon wall hits extinguish the chalet, sync a late join, and reset with the round',async()=>{
  const room=await MatchRoom.create({reference:true,initialReferenceFire:true,bots:0,critters:false});
  try {
    const socket=new RecordingSocket(),profile=createDefaultProfile('Firefighter');profile.loadout.gimmick='snow_cannon';
    const joined=room.join(socket,{protocolVersion:PROTOCOL_VERSION,profile});if(!joined.ok)throw new Error(joined.reason);
    expect(joined.mapState.destructibles[0]!.burning).toBe(true);
    expect(decodeMapStateSync(encodeMapStateSync(joined.mapState))!.destructibles[0]).toEqual(joined.mapState.destructibles[0]);
    const id=joined.welcome.playerId,chalet=ARENA_CHALET,layout=chalet.building!;
    const world=(x:number,y:number,z:number)=>({x:chalet.position.x+Math.cos(chalet.rotationY)*x+Math.sin(chalet.rotationY)*z,
      y:chalet.position.y+y,z:chalet.position.z-Math.sin(chalet.rotationY)*x+Math.cos(chalet.rotationY)*z});
    const outside=world(-layout.width*.42,.06,layout.depth/2+2.3),target=world(-layout.width*.42,layout.floors.at(-1)!.elevation+1.2,layout.depth/2);
    placePlayer(room,id,outside);let sequence=1;
    room.handleInput(socket,{sequence:sequence++,buttons:0,yaw:0,pitch:0,weaponSlot:3});run(room,2);
    for(let shot=0;shot<32;shot++) {
      const body=playerOf(room,id).character as CharacterBody,p=body.position;
      const origin={x:p.x,y:p.y+body.eyeHeight,z:p.z},dx=target.x-origin.x,dy=target.y-origin.y,dz=target.z-origin.z,length=Math.hypot(dx,dy,dz);
      room.handleFire(socket,{clientTick:room.getServerTick(),origin,direction:{x:dx/length,y:dy/length,z:dz/length},weaponId:WEAPON_TABLE.code.snow_cannon});
      run(room,8);
    }
    expect(socket.eventsOf('ENV_EXTINGUISH')).toHaveLength(1);
    const witness=room.join(new RecordingSocket(),{protocolVersion:PROTOCOL_VERSION,profile:createDefaultProfile('Late fire witness')});
    if(!witness.ok)throw new Error(witness.reason);expect(witness.mapState.destructibles[0]!.burning).toBe(false);
    (room as unknown as {conquest:ClimateConquest}).conquest.devSetTickets('lagoon',0);run(room,16*60);
    const after=room.join(new RecordingSocket(),{protocolVersion:PROTOCOL_VERSION,profile:createDefaultProfile('New round witness')});
    if(!after.ok)throw new Error(after.reason);expect(after.mapState.destructibles[0]!.burning).toBe(true);
  }finally {room.stop();}
});

test('exposed players burn near a real roof patch while the drifter remains immune',async()=>{
  const room=await MatchRoom.create({reference:true,initialReferenceFire:true,bots:0,critters:false});
  try {
    const human=joinPlayer(room,'alpine'),drifter=joinPlayer(room,'alpine','drifter');
    const humanBody=playerOf(room,human.id),ghost=playerOf(room,drifter.id),p=REFERENCE_CHALET_FIRE.points[1]!;
    const initialHuman=humanBody.hp,initialGhost=ghost.hp;
    sendInput(room,human,InputButton.Forward);run(room,1);
    placePlayer(room,human.id,{...p,y:p.y+.15});placePlayer(room,drifter.id,{...p,y:p.y+.15});run(room,60);
    expect(humanBody.hp).toBeLessThan(initialHuman);expect(ghost.hp).toBe(initialGhost);
  }finally {room.stop();}
});


test('the video village starts intact and round reset restores its initial cold state',async()=>{
  const room=await MatchRoom.create({reference:true,bots:0,critters:false});
  try{
    const socket=new RecordingSocket(),joined=room.join(socket,{protocolVersion:PROTOCOL_VERSION,profile:createDefaultProfile('Village visitor')});
    expect(joined.ok).toBe(true);if(!joined.ok)throw new Error(joined.reason);
    expect(joined.mapState.destructibles[0]!.burning).toBe(false);
    const fire=new ReferenceChaletFire(false);expect(fire.hit('sand_flamer',point)).toBe('ignited');expect(fire.snapshot().burning).toBe(true);
    fire.reset();expect(fire.snapshot().burning).toBe(false);
  }finally{room.stop();}
});
