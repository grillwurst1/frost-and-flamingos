import RAPIER from '@dimforge/rapier3d-compat';
import { describe, expect, test } from 'bun:test';
import type { PhysicsWorld } from '@frost-and-flamingos/shared';
import { InputButton, VEHICLE_SLOTS, VEHICLE_REPAIR, VEHICLES, rowingBeat, vehicleLocalToWorld } from '@frost-and-flamingos/shared';
import { createRoom, internals, joinPlayer, parkVehicle, placePlayer, playerOf, run, sendInput, slotByKind, tap } from './vehicle-helpers';

describe('rowboats', () => {
  test('four working rowboats spawn, hold two rowers, and a single rower cannot invoke a turbo', async () => {
    const room = await createRoom();
    try {
      const boats = VEHICLE_SLOTS.filter(slot => slot.kind === 'rowboat');
      expect(boats).toHaveLength(4);
      for (const slot of boats) expect(room.vehicles.lifecycleOf(slot.id)).toBe('active');
      const slot = boats[0]!, a = joinPlayer(room, 'alpine'), b = joinPlayer(room, 'alpine');
      parkVehicle(room, slot.id, -235, -180, 0);
      expect(room.vehicles.devEnter(playerOf(room, a.id) as never, slot.id)).toBe(true);
      expect(room.vehicles.devEnter(playerOf(room, b.id) as never, slot.id, 1)).toBe(true);
      run(room, 120, () => { sendInput(room,a,InputButton.Forward|InputButton.Sprint);sendInput(room,b,0); });
      const body = room.vehicles.vehicleBody(slot.id)!;
      expect(body.speed).toBeGreaterThan(6);
      expect(body.speed).toBeLessThanOrEqual(8.1);
      expect(body.state.boostTicks).toBe(0);
      expect(room.vehicles.seatFor(b.id)?.seat).toBe(1);
    } finally { room.stop(); }
  });

  test('both W strokes on the same beat start the 16 m/s sync sprint', async () => {
    const room = await createRoom();
    try {
      const slot = slotByKind('rowboat','map'), a = joinPlayer(room,'alpine'), b = joinPlayer(room,'alpine');
      parkVehicle(room,slot.id,-235,-180,0);
      room.vehicles.devEnter(playerOf(room,a.id) as never,slot.id);
      room.vehicles.devEnter(playerOf(room,b.id) as never,slot.id,1);
      let peak = 0;
      run(room,240,()=>{
        const phase = (internals(room).physicsTick + 1) % 48;
        // Press at beat 0, hold through the recovery, release before the next beat.
        const row = phase < 38 ? InputButton.Forward : 0;
        sendInput(room,a,row);sendInput(room,b,row);
        peak = Math.max(peak,room.vehicles.vehicleBody(slot.id)!.speed);
      });
      expect(peak).toBeGreaterThan(14.5);
      expect(peak).toBeLessThanOrEqual(16.1);
      expect(rowingBeat(48).aligned).toBe(true);
      expect(rowingBeat(24).aligned).toBe(false);
    } finally { room.stop(); }
  });
});

describe('authoritative vehicle repairs', () => {
  test('X repairs a nearby friendly hull at 40 HP/s and clamps to max HP', async () => {
    const room = await createRoom();
    try {
      const slot = slotByKind('fondue_crawler'), player = joinPlayer(room,'alpine');
      parkVehicle(room,slot.id,288,140,0);
      room.vehicles.devDamage(slot.id,null,100);
      const body = room.vehicles.vehicleBody(slot.id)!;
      const point = vehicleLocalToWorld(body.position,body.yaw,{x:2.3,y:0.1,z:0});
      placePlayer(room,player.id,point);run(room,2);
      const before = room.vehicles.vehicleHp(slot.id);
      run(room,60,()=>sendInput(room,player,InputButton.Wrench));
      expect(room.vehicles.vehicleHp(slot.id)-before).toBeCloseTo(VEHICLE_REPAIR.hpPerSecond,4);
      run(room,150,()=>sendInput(room,player,InputButton.Wrench));
      expect(room.vehicles.vehicleHp(slot.id)).toBe(VEHICLES.fondue_crawler.maxHp);
      expect(player.socket.eventsOf('SKILL_USED')).toHaveLength(0);
    } finally { room.stop(); }
  });

  test('an exposed passenger repairs while the driver cannot, enemies and distant players cannot', async () => {
    const room = await createRoom();
    try {
      const slot = slotByKind('fondue_crawler'), driver = joinPlayer(room,'alpine'), passenger = joinPlayer(room,'alpine'), enemy = joinPlayer(room,'lagoon');
      parkVehicle(room,slot.id,288,140,0);
      room.vehicles.devEnter(playerOf(room,driver.id) as never,slot.id);
      room.vehicles.devEnter(playerOf(room,passenger.id) as never,slot.id,1);
      room.vehicles.devDamage(slot.id,null,200);
      const before = room.vehicles.vehicleHp(slot.id);
      run(room,60,()=>sendInput(room,driver,InputButton.Wrench));
      expect(room.vehicles.vehicleHp(slot.id)).toBe(before);
      run(room,60,()=>{sendInput(room,driver,0);sendInput(room,passenger,InputButton.Wrench)});
      expect(room.vehicles.vehicleHp(slot.id)).toBeGreaterThan(before+30);
      tap(room,passenger,InputButton.Interact);
      placePlayer(room,passenger.id,{x:270,y:60,z:140});
      const body = room.vehicles.vehicleBody(slot.id)!;
      placePlayer(room,enemy.id,vehicleLocalToWorld(body.position,body.yaw,{x:2.3,y:0.1,z:0}));
      const repaired = room.vehicles.vehicleHp(slot.id);
      run(room,60,()=>{sendInput(room,passenger,InputButton.Wrench);sendInput(room,enemy,InputButton.Wrench)});
      expect(room.vehicles.vehicleHp(slot.id)).toBeCloseTo(repaired,5);
    } finally { room.stop(); }
  });
});


test('mismatched rowing beats never start the shared sprint', async () => {
  const room = await createRoom();
  try {
    const slot = slotByKind('rowboat','map'), a = joinPlayer(room,'alpine'), b = joinPlayer(room,'alpine');
    parkVehicle(room,slot.id,-235,-180,0);
    room.vehicles.devEnter(playerOf(room,a.id) as never,slot.id);
    room.vehicles.devEnter(playerOf(room,b.id) as never,slot.id,1);
    run(room,180,()=>{
      const phase = (internals(room).physicsTick + 1) % 48;
      sendInput(room,a,phase < 38 ? InputButton.Forward : 0);
      sendInput(room,b,phase >= 24 ? InputButton.Forward : 0);
    });
    const body = room.vehicles.vehicleBody(slot.id)!;
    expect(body.state.boostTicks).toBe(0);
    expect(body.speed).toBeLessThanOrEqual(8.1);
  } finally { room.stop(); }
});

test('a real wall blocks repair, and removing the wall allows it', async () => {
  const room = await createRoom();
  try {
    const slot = slotByKind('fondue_crawler'), player = joinPlayer(room,'alpine');
    parkVehicle(room,slot.id,288,140,0);
    room.vehicles.devDamage(slot.id,null,100);
    const body = room.vehicles.vehicleBody(slot.id)!;
    placePlayer(room,player.id,vehicleLocalToWorld(body.position,body.yaw,{x:2.6,y:0.1,z:0}));
    const physics = (room as unknown as {physics: PhysicsWorld}).physics;
    const wall = physics.world.createCollider(RAPIER.ColliderDesc.cuboid(0.12,2,3).setTranslation(body.position.x+1.85,body.position.y+1,body.position.z));
    run(room,2);
    const before = room.vehicles.vehicleHp(slot.id);
    run(room,60,()=>sendInput(room,player,InputButton.Wrench));
    expect(room.vehicles.vehicleHp(slot.id)).toBe(before);
    physics.world.removeCollider(wall,true);
    run(room,60,()=>sendInput(room,player,InputButton.Wrench));
    expect(room.vehicles.vehicleHp(slot.id)).toBeGreaterThan(before+30);
  } finally { room.stop(); }
});
