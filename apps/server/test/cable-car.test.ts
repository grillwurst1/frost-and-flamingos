import { expect, test } from 'bun:test';
import {
  CABLE_CAR_CYCLE_TICKS, CABLE_CAR_RULES, FJORD_MAP, VEHICLE_FLAG, VEHICLE_SLOTS,
  sampleCableCar, vehicleLocalToWorld, WEAPON_TABLE, weaponForSlot, type Vec3,
} from '@frost-and-flamingos/shared';
import { createRoom, joinPlayer, playerOf, placePlayer, run, sendInput, tap, InputButton } from './vehicle-helpers';

test('two cabins stop at all three stations, run in opposite directions and repeat their route exactly', () => {
  const leg = FJORD_MAP.routes.cableCar.legSeconds * 60, stop = CABLE_CAR_RULES.stopSeconds * 60;
  expect(VEHICLE_SLOTS.filter(s => s.kind === 'cable_car')).toHaveLength(2);
  for (const cabin of [0, 1] as const) {
    expect(sampleCableCar(0, cabin)).toEqual(sampleCableCar(CABLE_CAR_CYCLE_TICKS, cabin));
    const stations = new Set<number>();
    for (let step = 0; step < 4; step++) {
      const tick = step * (leg + stop);
      const a = sampleCableCar(tick, cabin), b = sampleCableCar(tick + stop - 1, cabin);
      expect(a.position).toEqual(b.position); expect(a.stopped).toBe(true);
      if (a.station !== null) stations.add(a.station);
    }
    expect(stations).toEqual(new Set([0, 1, 2]));
  }
  const a = sampleCableCar(stop + leg / 2, 0), b = sampleCableCar(stop + leg / 2, 1);
  expect(a.stopped).toBe(false); expect(b.stopped).toBe(false);
  expect(Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z)).toBeGreaterThan(10);
});

test('inside and roof crews ride full cabin poses; F and H board/change/exit without an empty-cabin timeout', async () => {
  const room = await createRoom();
  try {
    const player = joinPlayer(room, 'alpine'), body = room.vehicles.vehicleBody(100)!;
    expect(body).not.toBeNull();
    placePlayer(room, player.id, vehicleLocalToWorld(body.position, body.yaw, { x: 1.8, y: 0.12, z: 0 }));
    tap(room, player, InputButton.Interact);
    expect(room.vehicles.seatFor(player.id)?.vehicleId).toBe(100);
    expect(room.vehicles.isShielded(player.id)).toBe(true);
    for (let i = 0; i < 3 && room.vehicles.seatFor(player.id)!.seat < 2; i++) tap(room, player, InputButton.Heal);
    expect(room.vehicles.seatFor(player.id)!.seat).toBeGreaterThanOrEqual(2);
    expect(room.vehicles.isShielded(player.id)).toBe(false);
    run(room, CABLE_CAR_RULES.stopSeconds * 60 + 240, () => sendInput(room, player, 0));
    const seat = room.vehicles.seatFor(player.id)!.seat, feet = playerOf(room, player.id).character.position;
    const anchor = vehicleLocalToWorld(body.position, body.yaw, body.definition.seats[seat]!.anchor, body.pitch, body.roll);
    expect(Math.hypot(feet.x-anchor.x, feet.y-anchor.y, feet.z-anchor.z)).toBeLessThan(0.001);
    const wire = player.socket.latest!.vehicles.find(v => v.id === 100)!;
    expect(wire.flags & VEHICLE_FLAG.ExtendedPose).not.toBe(0);
    expect(wire.seats[seat]).toBe(player.id);
    tap(room, player, InputButton.Interact);
    expect(room.vehicles.seatFor(player.id)).toBeNull();
    expect(playerOf(room, player.id).character.position.y).toBeGreaterThan(body.position.y + 2.5);
    const hp = room.vehicles.vehicleHp(100);room.vehicles.devDamage(100, null, 5000);
    expect(room.vehicles.vehicleHp(100)).toBe(hp);
    // Simulate more than the generic 75-second tow timeout.
    run(room, 60 * 76);
    expect(room.vehicles.lifecycleOf(100)).toBe('active');
    expect(room.vehicles.vehicleBody(100)).toBe(body);
  } finally { room.stop(); }
}, 15000);

test('station F brake freezes both cabins; crouched roof crew and cabin crew remain while standing roof crew fall', async () => {
  const room = await createRoom();
  try {
    const inside=joinPlayer(room,'alpine'), standing=joinPlayer(room,'alpine'), crouched=joinPlayer(room,'alpine'), lever=joinPlayer(room,'lagoon');
    for (const [seat,p] of [[0,inside],[2,standing],[3,crouched]] as const) expect(room.vehicles.devEnter(playerOf(room,p.id) as never,100,seat)).toBe(true);
    run(room,CABLE_CAR_RULES.stopSeconds * 60 + 120,()=>{sendInput(room,inside,0);sendInput(room,standing,0);sendInput(room,crouched,InputButton.Crouch)});
    const stop=FJORD_MAP.routes.cableCar.stations[0]!.brakeLever;
    const operator=playerOf(room,lever.id);placePlayer(room,lever.id,{x:stop.x,y:stop.y-1.3,z:stop.z+0.5});
    const before=room.vehicles.vehicleBody(100)!.position;
    sendInput(room,crouched,InputButton.Crouch);sendInput(room,lever,InputButton.Interact);run(room,1);
    expect(room.vehicles.seatFor(standing.id)).toBeNull();
    expect(room.vehicles.seatFor(crouched.id)?.seat).toBe(3);
    expect(room.vehicles.seatFor(inside.id)?.seat).toBe(0);
    expect(crouched.socket.latest?.players.find(p=>p.id===crouched.id)?.crouched).toBe(true);
    run(room,60,()=>sendInput(room,crouched,InputButton.Crouch));
    expect(room.vehicles.vehicleBody(100)!.position).toEqual(before);
    expect(Math.abs(room.vehicles.vehicleBody(100)!.pitch)).toBeLessThanOrEqual(0.32);
    expect(lever.socket.eventsOf('GONDOLA_BRAKE')).toHaveLength(2);
    run(room,100,()=>sendInput(room,crouched,InputButton.Crouch));
    expect(room.vehicles.vehicleBody(100)!.position).not.toEqual(before);
    expect(operator.alive).toBe(true);
    room.vehicles.resetAll();
    expect(room.vehicles.isCrouched(crouched.id)).toBe(false);
    expect(room.vehicles.vehicleBody(100)!.position).toEqual(sampleCableCar(0,0).position);
  } finally { room.stop(); }
});

test('a real hitscan shot can brake the station lever; rearward or short rays cannot', async () => {
  const room=await createRoom();
  try {
    const player=joinPlayer(room,'alpine'), lever=FJORD_MAP.routes.cableCar.stations[0]!.brakeLever;
    const origin={x:lever.x,y:lever.y,z:lever.z+3}, direction={x:0,y:0,z:-1};
    expect(room.vehicles.raycastBrakeLever(origin,direction,4)).toBeCloseTo(3-CABLE_CAR_RULES.leverRadius);
    expect(room.vehicles.raycastBrakeLever(origin,direction,1)).toBeNull();
    expect(room.vehicles.raycastBrakeLever(origin,{x:0,y:0,z:1},4)).toBeNull();
    const shooter=playerOf(room,player.id) as unknown as {character:{eyeHeight:number};profile:{loadout:Parameters<typeof weaponForSlot>[0]}};
    placePlayer(room,player.id,{...origin,y:origin.y-shooter.character.eyeHeight});
    const weapon=weaponForSlot(shooter.profile.loadout,1);
    sendInput(room,player,InputButton.FirePrimary,Math.PI,0);
    room.handleFire(player.socket,{clientTick:room.getServerTick(),origin,direction,weaponId:WEAPON_TABLE.code[weapon]});
    run(room,1);
    expect(player.socket.eventsOf('GONDOLA_BRAKE')).toHaveLength(2);
  } finally { room.stop(); }
});

for (const station of FJORD_MAP.routes.cableCar.stations) test(`ordinary F boards at ${station.id} and both inside seats exit onto the platform`, async () => {
  const room = await createRoom();
  try {
    const player = joinPlayer(room, 'alpine');
    // Wait for the ordinary route clock, without devEnter or a moved cabin.
    for (let tick = 0; tick < 2000; tick++) {
      const found = [100, 101].find(id => {
        const body = room.vehicles.vehicleBody(id)!;
        return Math.hypot(body.position.x - station.platform.x, body.position.z - station.platform.z) < 2.3
          && Math.abs(body.position.y - station.platform.y) < .2 && body.speed < .05;
      });
      if (found) break;
      run(room, 1);
    }
    for (const insideSeat of [0, 1]) {
      placePlayer(room, player.id, { ...station.platform, y: station.platform.y + .05 });
      tap(room, player, InputButton.Interact);
      expect([100, 101].includes(room.vehicles.seatFor(player.id)?.vehicleId ?? 0), station.id).toBe(true);
      for (let change = 0; change < 4 && room.vehicles.seatFor(player.id)!.seat !== insideSeat; change++) tap(room, player, InputButton.Heal);
      expect(room.vehicles.seatFor(player.id)!.seat).toBe(insideSeat);
      tap(room, player, InputButton.Interact);
      expect(room.vehicles.seatFor(player.id)).toBeNull();
      const feet = playerOf(room, player.id).character.position;
      expect(Math.abs(feet.y - station.platform.y), station.id).toBeLessThan(.15);
      run(room, 12, () => sendInput(room, player, 0));
      expect(Math.abs(playerOf(room, player.id).character.position.y - station.platform.y), `${station.id} exit must not fall`).toBeLessThan(.15);
    }
  } finally { room.stop(); }
});

for (const station of FJORD_MAP.routes.cableCar.stations) test(`the visible ${station.id} lever responds to F from its platform and stops both moving cabins`, async () => {
  const room = await createRoom();
  try {
    const player = joinPlayer(room, 'alpine');
    run(room, CABLE_CAR_RULES.stopSeconds * 60 + 180);
    const lever = station.brakeLever;
    const dx = station.platform.x - lever.x, dz = station.platform.z - lever.z, length = Math.hypot(dx, dz);
    placePlayer(room, player.id, { x: lever.x + dx / length * .8, y: station.platform.y + .05, z: lever.z + dz / length * .8 });
    tap(room, player, InputButton.Interact);
    expect(player.socket.eventsOf('GONDOLA_BRAKE')).toHaveLength(2);
    const before = [100, 101].map(id => ({ ...room.vehicles.vehicleBody(id)!.position }));
    run(room, 20);
    for (const [index, id] of [100, 101].entries()) {
      expect(room.vehicles.vehicleBody(id)!.state.handbrake).toBe(true);
      expect(room.vehicles.vehicleBody(id)!.position).toEqual(before[index]!);
    }
    run(room, 150);
    expect(room.vehicles.vehicleBody(100)!.position).not.toEqual(before[0]!);
  } finally { room.stop(); }
});
