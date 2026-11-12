import { expect, test } from 'bun:test';
import { ARENA_ACCESS_FLIGHTS, ARENA_BUILDINGS, ARENA_CABLE, ARENA_CHALET, ARENA_REAR_CHALET, ARENA_NATURE, ARENA_NAV, arenaHeightAt, cableCarCycleTicks, sampleCableCar, roofBase, vehicleDefinition, InputButton, PhysicsWorld, REFERENCE_WORLD, type PlayerInput } from '@frost-and-flamingos/shared';
import { MatchRoom } from '../src/rooms/match-room';
import { joinPlayer, placePlayer, playerOf, run, tap } from './vehicle-helpers';
const idle: PlayerInput = { sequence: 1, buttons: 0, yaw: 0, pitch: 0, weaponSlot: 1 };
test('both moving gondolas clear the village roofs and solid tree trunks over their complete cycle',()=>{
  const half=vehicleDefinition('cable_car').halfExtents,radius=Math.hypot(half.x,half.z);
  for(let tick=0;tick<cableCarCycleTicks(ARENA_CABLE);tick+=6)for(const cabin of [0,1] as const) {
    const p=sampleCableCar(tick,cabin,ARENA_CABLE).position;
    for(const building of ARENA_BUILDINGS) {
      const layout=building.building!,dx=p.x-building.position.x,dz=p.z-building.position.z;
      const x=Math.cos(building.rotationY)*dx-Math.sin(building.rotationY)*dz;
      const z=Math.sin(building.rotationY)*dx+Math.cos(building.rotationY)*dz;
      if(Math.abs(x)>layout.width/2+layout.roof.overhang+radius||Math.abs(z)>layout.depth/2+layout.roof.overhang+radius)continue;
      const top=building.position.y+roofBase(layout)+Math.tan(layout.roof.pitch)*(layout.width/2+layout.roof.overhang-Math.max(0,Math.abs(x)-radius))+.4;
      expect(p.y,`${building.id}, cabin ${cabin}, tick ${tick}`).toBeGreaterThan(top);
    }
    for(const tree of ARENA_NATURE) {
      const trunk=tree.colliders.find(c=>c.type==='cylinder');if(!trunk||trunk.type!=='cylinder')continue;
      const bottom=tree.position.y+trunk.offset.y-trunk.halfHeight,top=bottom+trunk.halfHeight*2;
      if(p.y>top||p.y+half.y*2<bottom)continue;
      expect(Math.hypot(p.x-tree.position.x,p.z-tree.position.z),`${tree.id}, cabin ${cabin}, tick ${tick}`).toBeGreaterThan(radius+trunk.radius);
    }
  }
});
test('the raised village doors and relocated station remain reachable over real snow without jumping',async()=>{
  const world=await PhysicsWorld.create([],REFERENCE_WORLD);
  try {
    const main=ARENA_CHALET.position,rear=ARENA_REAR_CHALET.position;
    const routes=[
      [{x:-18,z:6},{x:main.x+2.2,z:main.z-7},{x:main.x+2.2,z:main.z-5.55},{x:main.x+2.2,z:main.z-4}],
      [{x:-3,z:25},{x:rear.x-1.2,z:rear.z-5.5},{x:rear.x-1.2,z:rear.z-4.05},{x:rear.x-1.2,z:rear.z-2.5}],
      [ARENA_NAV.nodes[13]!.position,ARENA_NAV.nodes[30]!.position,ARENA_CABLE.stations[0]!.platform],
      [14,15,16,17,18,19].map(id=>ARENA_NAV.nodes[id]!.position),
    ];
    for(const route of routes) {
      const start=route[0]!,body=world.createCharacter({position:{...start,y:arenaHeightAt(start.x,start.z)+.06},classId:'allrounder',faction:'alpine'});
      try {
        for(const target of route.slice(1)) {
          for(let tick=0;tick<1200&&Math.hypot(body.position.x-target.x,body.position.z-target.z)>.32;tick++) {
            body.simulate({...idle,buttons:InputButton.Forward,yaw:Math.atan2(target.x-body.position.x,target.z-body.position.z)});world.step();
          }
          expect(Math.hypot(body.position.x-target.x,body.position.z-target.z)).toBeLessThan(.55);
        }
      }finally{world.removeCharacter(body)}
    }
  }finally{world.dispose()}
});
for (const flight of ARENA_ACCESS_FLIGHTS)
  test(`the actual ${flight.id} staircase climbs and descends without a gap`, async () => {
    const world = await PhysicsWorld.create([], REFERENCE_WORLD);
    try {
      const human = world.createCharacter({ position: { ...flight.to, y: flight.to.y + .06 }, classId: 'allrounder', faction: 'alpine' });
      const walk = (goal: typeof flight.from | typeof flight.to) => {
        for (let tick = 0; tick < 1400; tick++) {
          const p = human.position, distance = Math.hypot(p.x - goal.x, p.z - goal.z);
          if (distance < .35)
            break;
          if (tick % 20 === 0) {
            const dx = flight.to.x - flight.from.x, dz = flight.to.z - flight.from.z;
            const t = ((p.x - flight.from.x) * dx + (p.z - flight.from.z) * dz) / (dx * dx + dz * dz);
            if (t > 0 && t < 1)
              expect(p.y).toBeGreaterThan(flight.from.y + (flight.to.y - flight.from.y) * t - .3);
          }
          human.simulate({ ...idle, buttons: InputButton.Forward | (distance < 2 ? InputButton.Crouch : 0), yaw: Math.atan2(goal.x - p.x, goal.z - p.z) });
          world.step();
        }
        for (let tick = 0; tick < 30; tick++) {
          human.simulate(idle);
          world.step();
        }
        expect(Math.hypot(human.position.x - goal.x, human.position.z - goal.z)).toBeLessThan(.6);
        expect(Math.abs(human.position.y - goal.y)).toBeLessThan(.3);
      };
      walk(flight.from);
      walk(flight.to);
    }
    finally {
      world.dispose();
    }
  });
for (const station of ARENA_CABLE.stations)
  test(`compact ${station.id} station boards and exits through ordinary F`, async () => {
    const room = await MatchRoom.create({ reference: true, bots: 0, critters: false });
    try {
      const human = joinPlayer(room, 'alpine');
      let found = false;
      for (let tick = 0; tick < 1300; tick++) {
        found = [100, 101].some(id => { const cabin = room.vehicles.vehicleBody(id)!; return Math.hypot(cabin.position.x - station.platform.x, cabin.position.z - station.platform.z) < 2.3 && Math.abs(cabin.position.y - station.platform.y) < .2 && cabin.speed < .05; });
        if (found)
          break;
        run(room, 1);
      }
      expect(found).toBe(true);
      placePlayer(room, human.id, { ...station.platform, y: station.platform.y + .05 });
      tap(room, human, InputButton.Interact);
      expect([100, 101]).toContain(room.vehicles.seatFor(human.id)?.vehicleId ?? -1);
      tap(room, human, InputButton.Interact);
      expect(room.vehicles.seatFor(human.id)).toBeNull();
      run(room, 30);
      expect(Math.abs(playerOf(room, human.id).character.position.y - station.platform.y)).toBeLessThan(.15);
      expect(playerOf(room, human.id).alive).toBe(true);
    }
    finally {
      room.stop();
    }
  });
test('compact emergency lever brakes both moving cabins and releases on the same authoritative clock', async () => {
  const room = await MatchRoom.create({ reference: true, bots: 0, critters: false });
  try {
    const human = joinPlayer(room, 'alpine');
    run(room, 650);
    const station = ARENA_CABLE.stations[0]!, p = station.brakeLever;
    placePlayer(room, human.id, { x: p.x, y: station.platform.y + .05, z: p.z + .6 });
    const before = [100, 101].map(id => ({ ...room.vehicles.vehicleBody(id)!.position }));
    tap(room, human, InputButton.Interact);
    expect(human.socket.eventsOf('GONDOLA_BRAKE')).toHaveLength(2);
    run(room, 60);
    expect([100, 101].map(id => room.vehicles.vehicleBody(id)!.position)).toEqual(before);
    run(room, 90);
    expect(room.vehicles.vehicleBody(100)!.position).not.toEqual(before[0]);
  }
  finally {
    room.stop();
  }
});
test('the video basin is open continuous snow instead of an impassable foreground fence', async () => {
  const world = await PhysicsWorld.create([], REFERENCE_WORLD);
  try {
    const body = world.createCharacter({ position: { x: 0, y: 23.05, z: -20 }, classId: 'allrounder', faction: 'alpine' });
    for (let tick = 0; tick < 240; tick++) {
      body.simulate({ ...idle, buttons: InputButton.Forward });
      world.step();
    }
    expect(body.position.z).toBeGreaterThan(0);
    expect(body.position.z).toBeLessThan(10);
    expect(body.position.y).toBeGreaterThan(18.3);
  }
  finally {
    world.dispose();
  }
});
