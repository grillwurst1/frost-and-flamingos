import { describe, expect, test } from 'bun:test';
import {
  AIRCRAFT_RULES, FjordLayout, InputButton, PhysicsWorld, VEHICLE_FLAG, VEHICLE_KIND_TABLE,
  VEHICLE_SLOTS, WEAPON_TABLE, sampleMapHeight, vehicleLocalToWorld, vehicleWorldToLocal,
} from '@frost-and-flamingos/shared';
import { createRoom, joinPlayer, playerOf, placePlayer, run, sendInput, slotBySpawn, tap } from './vehicle-helpers';

const W=InputButton.Forward;
const waterSlot=()=>slotBySpawn('biplane_water');

describe('biplane flight and crew',()=>{
  test('both aircraft spawn, float or stand on their runway, and transmit all three seats and full pose',async()=>{
    const room=await createRoom();
    try{
      expect(VEHICLE_SLOTS.filter(s=>s.kind==='biplane')).toHaveLength(2);
      const slot=waterSlot(), pilot=joinPlayer(room,'lagoon'), left=joinPlayer(room,'lagoon'), right=joinPlayer(room,'lagoon');
      const body=room.vehicles.vehicleBody(slot.id)!;expect(body).not.toBeNull();
      expect(body.position.y).toBeCloseTo(-.25,1);
      for(const [seat,p] of [pilot,left,right].entries())expect(room.vehicles.devEnter(playerOf(room,p.id) as never,slot.id,seat)).toBe(true);
      run(room,210,()=>{sendInput(room,pilot,W,.06,.3);sendInput(room,left,0);sendInput(room,right,0)});
      expect(room.vehicles.lifecycleOf(slot.id)).toBe('active');
      expect(body.position.y).toBeGreaterThan(1);
      expect(Math.hypot(body.velocity.x,body.velocity.y,body.velocity.z)).toBeGreaterThan(14);
      const wire=pilot.socket.latest!.vehicles.find(v=>v.id===slot.id)!;
      expect(wire.type).toBe(VEHICLE_KIND_TABLE.code.biplane);
      expect(wire.flags&VEHICLE_FLAG.ExtendedPose).not.toBe(0);
      expect(wire.seats).toEqual([pilot.id,left.id,right.id]);
      expect(wire.pitch).toBeCloseTo(body.pitch,2);
      expect(wire.roll).toBeDefined();
    }finally{room.stop()}
  });

  test('takes off from the glacier strip and climbs clear of the terrain',async()=>{
    const room=await createRoom();
    try{
      const slot=slotBySpawn('biplane_glacier'), pilot=joinPlayer(room,'alpine');
      const {start,end}=FjordLayout.GLACIER_RUNWAY,yaw=Math.atan2(end.x-start.x,end.z-start.z);
      const body=room.vehicles.vehicleBody(slot.id)!;
      const x=286,z=130,y=sampleMapHeight(x,z)+.04;body.teleport({x,y,z},yaw);
      room.vehicles.devEnter(playerOf(room,pilot.id) as never,slot.id);
      run(room,240,()=>sendInput(room,pilot,W,yaw,.3));
      expect(room.vehicles.lifecycleOf(slot.id)).toBe('active');
      expect(body.position.y).toBeGreaterThan(y+2);
      expect(body.grounded).toBe(false);
      expect(body.speed).toBeGreaterThan(15);
    }finally{room.stop()}
  });

  test('wing mounts follow pitch and bank, pilot gun fires forward, Space exits with inherited flight',async()=>{
    const room=await createRoom();
    try{
      const slot=waterSlot(), pilot=joinPlayer(room,'lagoon'), rider=joinPlayer(room,'lagoon');
      const body=room.vehicles.vehicleBody(slot.id)!;body.teleport({x:-330,y:35,z:-180},0);
      body.restore({...body.state,velocity:{x:0,y:0,z:20},grounded:false,pitch:.18,roll:.45});
      room.vehicles.devEnter(playerOf(room,pilot.id) as never,slot.id);room.vehicles.devEnter(playerOf(room,rider.id) as never,slot.id,1);
      run(room,1,()=>{sendInput(room,pilot,InputButton.FirePrimary,0,.18);sendInput(room,rider,0)});
      const anchor=vehicleLocalToWorld(body.position,body.yaw,body.definition.seats[1]!.anchor,body.pitch,body.roll);
      const feet=playerOf(room,rider.id).character.position;
      expect(Math.hypot(feet.x-anchor.x,feet.y-anchor.y,feet.z-anchor.z)).toBeLessThan(.001);
      expect(pilot.socket.eventsOf('TANK_CANNON_FIRE').at(-1)?.paramValue).toBe(WEAPON_TABLE.code.biplane_mg);
      const muzzle=body.muzzle()!;expect(muzzle.direction.y).toBeGreaterThan(.1);
      tap(room,rider,InputButton.Jump);
      expect(room.vehicles.seatFor(rider.id)).toBeNull();
      expect((playerOf(room,rider.id).character as unknown as {launchSeconds:number}).launchSeconds).toBeGreaterThan(0);
    }finally{room.stop()}
  });

  test('spinning propeller launches an enemy with a blast death and spares its crew faction',async()=>{
    const room=await createRoom();
    try{
      const slot=waterSlot(), pilot=joinPlayer(room,'lagoon'), enemy=joinPlayer(room,'alpine'), friend=joinPlayer(room,'lagoon');
      const body=room.vehicles.vehicleBody(slot.id)!;body.teleport({x:-330,y:-.2,z:-180},0);
      room.vehicles.devEnter(playerOf(room,pilot.id) as never,slot.id);
      const p=AIRCRAFT_RULES.propeller.center;
      placePlayer(room,enemy.id,vehicleLocalToWorld(body.position,body.yaw,{...p,y:p.y-.9}));
      placePlayer(room,friend.id,vehicleLocalToWorld(body.position,body.yaw,{...p,x:p.x+.6,y:p.y-.9}));
      run(room,2,()=>sendInput(room,pilot,0));
      expect(playerOf(room,enemy.id).alive).toBe(false);
      expect(playerOf(room,friend.id).hp).toBe(150);
      expect(enemy.socket.eventsOf('KILL_BLAST_LAUNCH').some(e=>e.targetId===enemy.id)).toBe(true);
    }finally{room.stop()}
  });

  test('gentle water approach lands, while a steep high-speed impact wrecks the aircraft',async()=>{
    const room=await createRoom();
    try{
      const slot=waterSlot(), pilot=joinPlayer(room,'lagoon'), body=room.vehicles.vehicleBody(slot.id)!;
      body.teleport({x:-330,y:1.2,z:-200},0);body.restore({...body.state,velocity:{x:0,y:-1,z:14},grounded:false,pitch:-.06});
      room.vehicles.devEnter(playerOf(room,pilot.id) as never,slot.id);
      run(room,140,()=>sendInput(room,pilot,InputButton.Backward,0,-.06));
      expect(room.vehicles.lifecycleOf(slot.id)).toBe('active');expect(body.afloat).toBe(true);expect(body.grounded).toBe(true);
      body.teleport({x:-330,y:1,z:-200},0);body.restore({...body.state,velocity:{x:0,y:-10,z:20},grounded:false,pitch:-.55});
      run(room,60,()=>sendInput(room,pilot,InputButton.Backward,0,-.55));
      expect(room.vehicles.lifecycleOf(slot.id)).toBe('wreck');
    }finally{room.stop()}
  });
});

test('flight replay is deterministic and 3D vehicle transforms invert correctly',async()=>{
  const a=await PhysicsWorld.create(),b=await PhysicsWorld.create();
  try{
    const x=a.createVehicle('biplane',{x:-330,y:-.25,z:-200},0),y=b.createVehicle('biplane',{x:-330,y:-.25,z:-200},0);
    for(let i=0;i<300;i++){
      const input={buttons:W,yaw:i>240?.3:0,pitch:.3};
      x.simulate(input,input);a.step();y.simulate(input,input);b.step();
    }
    expect(x.state).toEqual(y.state);
    const local={x:1.8,y:2.76,z:1.1};
    const world=vehicleLocalToWorld(x.position,x.yaw,local,.35,-.55);
    const back=vehicleWorldToLocal(x.position,x.yaw,world,.35,-.55);
    expect(back.x).toBeCloseTo(local.x,10);expect(back.y).toBeCloseTo(local.y,10);expect(back.z).toBeCloseTo(local.z,10);
  }finally{a.dispose();b.dispose()}
});
