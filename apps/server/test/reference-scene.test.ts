import { expect, test } from 'bun:test';
import { PhysicsWorld, REFERENCE_TOWERS, REFERENCE_MARKERS, REFERENCE_WORLD, REFERENCE_SCENE, arenaHeightAt, referenceSpawn, InputButton, PHYSICS_TICK_RATE, INTERMISSION_TICKS, type CharacterBody } from '@frost-and-flamingos/shared';
import { MatchRoom } from '../src/rooms/match-room';
import { joinPlayer, internals, playerOf, placePlayer, run, sendInput } from './vehicle-helpers';
import { ClimateConquest, countTowerPresence } from '../src/rooms/conquest';

test('reference room joins at the authored vista, captures the snow basin and respawns locally',async()=>{
  const room=await MatchRoom.create({reference:true,bots:0,critters:false});
  try {
    const player=joinPlayer(room,'alpine'),body=playerOf(room,player.id),spawn=referenceSpawn('alpine').position;
    expect(body.character.position.x).toBe(spawn.x);expect(body.character.position.z).toBe(spawn.z);
    expect(player.socket.latest).toBeNull();
    run(room,3);expect(player.socket.latest!.vehicles.map(v=>v.id).sort((a,b)=>a-b)).toEqual([100,101,201,202]);
    expect(player.socket.latest!.conquest.towers.map(t=>t.owner)).toEqual(['alpine',null,'lagoon']);
    run(room,3*PHYSICS_TICK_RATE);
    expect(player.socket.latest!.ticketsAlpine).toBe(50);expect(player.socket.latest!.ticketsLagoon).toBe(50);
    sendInput(room,player,InputButton.Forward);
    placePlayer(room,player.id,{x:.7,y:arenaHeightAt(.7,0)+.06,z:0});
    run(room,9*PHYSICS_TICK_RATE);
    expect(player.socket.latest!.conquest.towers[1]!.owner).toBe('alpine');
    placePlayer(room,player.id,{x:1,y:-30,z:0});run(room,8*PHYSICS_TICK_RATE);
    expect(body.character.position.x).toBeCloseTo(spawn.x,1);expect(body.character.position.z).toBeCloseTo(spawn.z,1);
    expect(body.character.position.y).toBeGreaterThan(22.8);
  }finally {room.stop();}
});

test('reference crate cover is solid and the snow basin walks end to end',async()=>{
  const room=await MatchRoom.create({reference:true,bots:0,critters:false});
  try {
    const player=joinPlayer(room,'alpine'),body=playerOf(room,player.id);
    const crate=REFERENCE_MARKERS.find(p=>p.kind==='crate_stack')!;
    placePlayer(room,player.id,{x:crate.position.x,y:crate.position.y+.06,z:crate.position.z-2});
    run(room,50,()=>sendInput(room,player,InputButton.Forward));
    expect(body.character.position.z).toBeLessThan(crate.position.z-.7);
    placePlayer(room,player.id,{x:-13,y:18.46,z:0});
    for(let t=0;t<800&&body.character.position.x<15;t++)run(room,1,()=>sendInput(room,player,InputButton.Forward,Math.PI/2));
    run(room,60,()=>sendInput(room,player,0));
    expect(body.character.position.x).toBeGreaterThan(13);expect(body.character.position.y).toBeGreaterThan(17.5);
  }finally {room.stop();}
});

test('local objectives use their own positions and reset their own initial owners',()=>{
  const position=REFERENCE_TOWERS[0]!.position;
  const candidates=[{position,classId:'allrounder' as const,faction:'alpine' as const,alive:true}];
  expect(countTowerPresence(candidates,undefined,REFERENCE_TOWERS)[0]!.alpine).toBe(1);
  expect(countTowerPresence(candidates)[0]!.alpine).toBe(0);
  const conquest=new ClimateConquest({tower_a:'alpine',tower_b:null,tower_c:'lagoon'});
  for(let i=0;i<50;i++)conquest.recordDeath('lagoon');
  for(let i=0;i<=INTERMISSION_TICKS;i++)conquest.step([]);
  expect(conquest.snapshot().round).toBe(2);expect(conquest.snapshot().towers.map(t=>t.owner)).toEqual(['alpine',null,'lagoon']);
  expect(new ClimateConquest().snapshot().towers.map(t=>t.owner)).toEqual(['lagoon',null,'alpine']);
});

test('illustrated stone cover has real matching convex roofs and leaves the visitor pad clear',async()=>{
  const physics=await PhysicsWorld.create([],REFERENCE_WORLD);
  try {
    const rocks=REFERENCE_MARKERS.filter(p=>p.kind==='rock');expect(rocks.length).toBeGreaterThan(8);
    for(const rock of rocks) {
      expect(Math.hypot(rock.position.x-REFERENCE_SCENE.spawn.alpine.x,rock.position.z-REFERENCE_SCENE.spawn.alpine.z)).toBeGreaterThan(3.5);
      const hull=rock.colliders.find(c=>c.type==='hull')!;
      if(hull.type!=='hull')throw new Error('stone hull missing');
      const top=hull.vertices[16]!;
      const height=top.y-top.x*.07-top.z*.05;
      const hit=physics.raycast({x:rock.position.x,y:rock.position.y+height+2,z:rock.position.z},{x:0,y:-1,z:0},5);
      expect(hit).not.toBeNull();
      // This is an actual Rapier ray against the hull, not the terrain under it.
      expect(hit!.point.y).toBeCloseTo(rock.position.y+height,3);
    }
  }finally{physics.dispose();}
});

test('reference tank drives and fires continuously through its normal authoritative controls',async()=>{
  const room=await MatchRoom.create({reference:true,bots:0,critters:false});
  try {
    const player=joinPlayer(room,'alpine');
    expect(room.vehicles.devEnter(playerOf(room,player.id) as never,201,0)).toBe(true);
    const before={...room.vehicles.vehicleBody(201)!.position};
    run(room,8*PHYSICS_TICK_RATE,()=>sendInput(room,player,InputButton.Forward|InputButton.FirePrimary,-1.5,0));
    const tank=room.vehicles.vehicleBody(201)!;
    expect(Math.hypot(tank.position.x-before.x,tank.position.z-before.z)).toBeGreaterThan(1);
    expect(Object.values(tank.position).every(Number.isFinite)).toBe(true);
    expect(player.socket.eventsOf('TANK_CANNON_FIRE').length).toBeGreaterThanOrEqual(2);
    expect(room.vehicles.seatFor(player.id)?.vehicleId).toBe(201);
  }finally {room.stop();}
});

test('reference cast includes armed soldiers and a living cow in the basin, without changing the regular cast',async()=>{
  const room=await MatchRoom.create({reference:true,critters:false});
  try {
    const cast=[...internals(room).players.values()].map(p=>({...p,character:p.character as CharacterBody}));
    expect(cast).toHaveLength(6);
    const cow=cast.find(p=>p.profile.faction==='alpine'&&p.character.form==='cow');
    expect(cow).toBeDefined();expect(cow!.character.position.z).toBe(0);
    expect(cast.filter(p=>p.character.form===null)).toHaveLength(5);
  }finally {room.stop();}
});

test('the rooftop defender holds solid snow roof clear of the fire and respawns at its supported post',async()=>{
  const room=await MatchRoom.create({reference:true,critters:false});
  try {
    const cast=internals(room).players,guard=cast.get(1)!;
    expect(guard.character.position.y).toBeGreaterThan(27);
    const start={...guard.character.position},human=joinPlayer(room,'alpine');
    sendInput(room,human,InputButton.Forward);run(room,100);
    expect(guard.alive).toBe(true);expect(guard.character.position.y).toBeGreaterThan(27);
    expect(Math.hypot(guard.character.position.x-start.x,guard.character.position.z-start.z)).toBeLessThan(.15);
    room.devTeleport(1,0,-20,-30);run(room,2);
    expect(guard.character.position.y).toBeGreaterThan(27);
    expect(Math.hypot(guard.character.position.x-start.x,guard.character.position.z-start.z)).toBeLessThan(.15);
  }finally {room.stop();}
});

test('the reference cow stays supported by the actual basin terrain throughout the intro',async()=>{
  const room=await MatchRoom.create({reference:true,bots:6,critters:false});
  try {
    const cow=playerOf(room,5);
    expect((cow.character as CharacterBody).form).toBe('cow');
    run(room,600);
    expect(cow.alive).toBe(true);expect(cow.hp).toBe(260);
    expect(cow.character.position.x).toBeCloseTo(4,1);
    expect(cow.character.position.z).toBeCloseTo(0,1);
    expect(cow.character.position.y).toBeGreaterThan(arenaHeightAt(4,0)-.1);
    expect(cow.character.position.y).toBeLessThan(arenaHeightAt(4,0)+.5);
  }finally{room.stop();}
});

test('the basin defender holds its actual ground throughout the reference intro',async()=>{
  const room=await MatchRoom.create({reference:true,bots:6,critters:false});
  try {
    const defender=playerOf(room,4);run(room,600);
    expect(defender.alive).toBe(true);
    expect(defender.character.position.x).toBeCloseTo(7,1);
    expect(defender.character.position.z).toBeCloseTo(0,1);
    expect(defender.character.position.y).toBeGreaterThan(16);
    expect(defender.character.position.y).toBeLessThan(arenaHeightAt(7,0)+.4);
  }finally{room.stop();}
});
