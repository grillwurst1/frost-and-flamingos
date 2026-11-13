import { expect,test } from 'bun:test';
import { FJORD_MAP, FIXED_DT, GRAVITY, MAP_RIDE_TUNING, VEHICLE_SLOTS, WEAPON_TABLE, sampleTBar, hammockLaunchVelocity, sampleRidePath, type CharacterBody } from '@frost-and-flamingos/shared';
import { createRoom,joinPlayer,playerOf,placePlayer,run,sendInput,tap,InputButton } from './vehicle-helpers';
import {localToWorld,projectOnPolyline,quaternionFromYawPitchRoll,rotateByQuaternion} from '../../../packages/shared/src/config/map/math';

test('the coaster loading deck and its actual stair hull leave the full tank-road corridor clear',()=>{
  const platform=FJORD_MAP.props.find(p=>p.id==='coaster_platform')!,road=FJORD_MAP.routes.tankRoad;
  let samples=0;
  for(const collider of platform.colliders) {
    const vertices=collider.type==='hull'?collider.vertices:collider.type==='box'?
      [-1,1].flatMap(x=>[-1,1].flatMap(y=>[-1,1].map(z=>({x:x*collider.halfExtents.x,y:y*collider.halfExtents.y,z:z*collider.halfExtents.z})))):[];
    const local=collider.type==='box'?collider.rotation:undefined;
    const rotation=quaternionFromYawPitchRoll(platform.rotationY+(local?.y??0),local?.x??0,local?.z??0),offset=localToWorld(platform.position,platform.rotationY,collider.offset);
    for(const v of vertices) {
      const p=rotateByQuaternion(v,rotation),at={x:p.x+offset.x,z:p.z+offset.z};
      expect(projectOnPolyline(at.x,at.z,road.points,road.distances).distance).toBeGreaterThan(road.width/2+1.5);samples++;
    }
  }
  expect(samples).toBeGreaterThanOrEqual(10);
});

test('eight T-bars circulate on the authored route and the real hammock trajectory meets Tower B',()=>{
  expect(VEHICLE_SLOTS.filter(s=>s.kind==='tbar')).toHaveLength(8);
  expect(VEHICLE_SLOTS.filter(s=>s.kind==='coaster_bob')).toHaveLength(4);
  const length=FJORD_MAP.routes.tBar.ridePath.length;
  for(let i=0;i<8;i++) {
    const a=sampleTBar(i*length/4),b=sampleTBar(i*length/4+length*2);
    expect(a.position.x).toBeCloseTo(b.position.x,5);expect(a.position.z).toBeCloseTo(b.position.z,5);
    expect(a.returning).toBe(i>=4);
  }
  const {seat,target}=FJORD_MAP.routes.hammock,v=hammockLaunchVelocity();
  const t=(v.y+Math.sqrt(v.y*v.y+2*Math.abs(GRAVITY)*(seat.y-target.y)))/Math.abs(GRAVITY);
  expect(seat.x+v.x*t).toBeCloseTo(target.x,5);expect(seat.z+v.z*t).toBeCloseTo(target.z,5);
  expect(seat.y+v.y*t+.5*GRAVITY*t*t).toBeCloseTo(target.y,5);
});

test('F boards the moving lift, leaves weapons free and releases the rider at the summit',async()=>{
  const room=await createRoom();try {
    const p=joinPlayer(room,'alpine'),bar=room.vehicles.vehicleBody(110)!;expect(bar).not.toBeNull();
    placePlayer(room,p.id,{x:bar.position.x+Math.cos(bar.yaw)*.8,y:bar.position.y,z:bar.position.z-Math.sin(bar.yaw)*.8});
    tap(room,p,InputButton.Interact);expect(room.vehicles.seatFor(p.id)?.vehicleId).toBe(110);
    expect(room.vehicles.mayUseHandWeapons(p.id)).toBe(true);expect(room.vehicles.isShielded(p.id)).toBe(false);
    const start={...playerOf(room,p.id).character.position};
    run(room,60,()=>sendInput(room,p,0));
    expect(Math.hypot(playerOf(room,p.id).character.position.x-start.x,playerOf(room,p.id).character.position.z-start.z)).toBeGreaterThan(6);
    run(room,Math.ceil(FJORD_MAP.routes.tBar.ridePath.length/11*60)+5,()=>sendInput(room,p,0));
    expect(room.vehicles.seatFor(p.id)).toBeNull();expect(playerOf(room,p.id).alive).toBe(true);
  }finally{room.stop()}
},15000);

test('a moving exposed rider may send a delayed real seat origin; bullets still start at the current server eye and invented origins fail',async()=>{
  const room=await createRoom();try {
    const p=joinPlayer(room,'alpine'),rider=playerOf(room,p.id),character=rider.character as CharacterBody;
    expect(room.vehicles.devEnter(rider as never,110,0)).toBe(true);
    run(room,12,()=>sendInput(room,p,0));
    const eye={x:character.position.x,y:character.position.y+character.eyeHeight,z:character.position.z},clientTick=p.socket.latest!.serverTick;
    run(room,90,()=>sendInput(room,p,0));
    expect(Math.hypot(character.position.x-eye.x,character.position.z-eye.z)).toBeGreaterThan(6);
    const current=joinPlayer(room,'lagoon'),past=joinPlayer(room,'lagoon'),now={x:character.position.x,y:character.position.y+character.eyeHeight,z:character.position.z};
    placePlayer(room,current.id,{x:now.x,y:now.y+2,z:now.z});placePlayer(room,past.id,{x:eye.x,y:eye.y+2,z:eye.z});
    sendInput(room,p,0);run(room,1);
    const before=p.socket.eventsOf('WEAPON_FIRED').length,hp=playerOf(room,current.id).hp,pastHp=playerOf(room,past.id).hp;
    room.handleFire(p.socket,{clientTick,weaponId:WEAPON_TABLE.code.smg,origin:eye,direction:{x:0,y:1,z:0}});
    run(room,1,()=>sendInput(room,p,0));
    expect(p.socket.eventsOf('WEAPON_FIRED')).toHaveLength(before+1);
    expect(playerOf(room,current.id).hp).toBeLessThan(hp);expect(playerOf(room,past.id).hp).toBe(pastHp);
    run(room,12,()=>sendInput(room,p,0));
    room.handleFire(p.socket,{clientTick,weaponId:WEAPON_TABLE.code.smg,origin:{x:eye.x+100,y:eye.y,z:eye.z+100},direction:{x:0,y:1,z:0}});
    run(room,1,()=>sendInput(room,p,0));expect(p.socket.eventsOf('WEAPON_FIRED')).toHaveLength(before+1);
    tap(room,p,InputButton.Interact);run(room,12,()=>sendInput(room,p,0));
    room.handleFire(p.socket,{clientTick,weaponId:WEAPON_TABLE.code.smg,origin:eye,direction:{x:0,y:1,z:0}});
    run(room,1,()=>sendInput(room,p,0));expect(p.socket.eventsOf('WEAPON_FIRED')).toHaveLength(before+1);
  }finally{room.stop()}
});

test('a killed lift rider is dragged for two seconds and released without reviving or enabling the corpse collider',async()=>{
  const room=await createRoom();try {
    const p=joinPlayer(room,'alpine');expect(room.vehicles.devEnter(playerOf(room,p.id) as never,110,0)).toBe(true);
    const body=playerOf(room,p.id).character as CharacterBody,player=playerOf(room,p.id);player.alive=false;body.setColliderEnabled(false);
    const before={...body.position};run(room,60);
    expect(room.vehicles.seatFor(p.id)?.vehicleId).toBe(110);
    expect(Math.hypot(body.position.x-before.x,body.position.z-before.z)).toBeGreaterThan(6);
    run(room,MAP_RIDE_TUNING.corpseDragTicks-60+2);
    expect(room.vehicles.seatFor(p.id)).toBeNull();expect(player.alive).toBe(false);expect(body.collider.isEnabled()).toBe(false);
  }finally{room.stop()}
});

test('the coaster banks through the actual track and releases a living armed rider at 45 degrees; its slot respawns',async()=>{
  const room=await createRoom();try {
    const p=joinPlayer(room,'alpine'),bob=room.vehicles.vehicleBody(120)!;expect(bob).not.toBeNull();
    placePlayer(room,p.id,{x:bob.position.x+.8,y:bob.position.y,z:bob.position.z});tap(room,p,InputButton.Interact);
    expect(room.vehicles.seatFor(p.id)?.vehicleId).toBe(120);expect(room.vehicles.mayUseHandWeapons(p.id)).toBe(true);
    let bank=0,ticks=0;
    while(room.vehicles.seatFor(p.id)&&ticks++<3000){run(room,1,()=>sendInput(room,p,0));bank=Math.max(bank,Math.abs(bob.roll));}
    expect(ticks).toBeLessThan(3000);expect(bank).toBeGreaterThan(.15);
    const rider=playerOf(room,p.id).character as CharacterBody,v=rider.velocity;
    expect(Math.atan2(v.y,Math.hypot(v.x,v.z))).toBeCloseTo(Math.PI/4,2);
    expect(Math.hypot(rider.position.x-FJORD_MAP.routes.coaster.rampEnd.x,rider.position.z-FJORD_MAP.routes.coaster.rampEnd.z)).toBeLessThan(1);
    expect(playerOf(room,p.id).alive).toBe(true);run(room,90);
    expect(room.vehicles.vehicleBody(120)).not.toBeNull();expect(room.vehicles.vehicleBody(120)).not.toBe(bob);
    expect(sampleRidePath(FJORD_MAP.routes.coaster.track,0).position).toEqual(FJORD_MAP.routes.coaster.start);
  }finally{room.stop()}
},15000);

test('the hammock tensions for 1.5 seconds then launches through the normal motor to the village',async()=>{
  const room=await createRoom();try {
    const p=joinPlayer(room,'lagoon'),hammock=room.vehicles.vehicleBody(130)!;expect(hammock).not.toBeNull();
    placePlayer(room,p.id,{x:hammock.position.x+.9,y:hammock.position.y,z:hammock.position.z});tap(room,p,InputButton.Interact);
    expect(room.vehicles.seatFor(p.id)?.vehicleId).toBe(130);
    let charge=2;while(room.vehicles.seatFor(p.id)&&charge<100){run(room,1,()=>sendInput(room,p,0));charge++;}
    expect(charge).toBeGreaterThanOrEqual(89);expect(charge).toBeLessThanOrEqual(91);
    const character=playerOf(room,p.id).character as CharacterBody;
    expect(character.velocity.y).toBeGreaterThan(25);
    let closest=Infinity;
    for(let tick=0;tick<Math.ceil(7/FIXED_DT);tick++) {
      run(room,1,()=>sendInput(room,p,0));const pos=character.position,target=FJORD_MAP.routes.hammock.target;
      if(Math.abs(pos.y-target.y)<5)closest=Math.min(closest,Math.hypot(pos.x-target.x,pos.z-target.z));
    }
    expect(closest).toBeLessThan(7);expect(playerOf(room,p.id).alive).toBe(true);
  }finally{room.stop()}
},15000);
