import { expect, test } from 'bun:test';
import { MatchRoom } from '../src/rooms/match-room';
import type { PhysicsWorld } from '@frost-and-flamingos/shared';
const wait=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));

test('an empty match can suspend CPU ticks, retain solid physics and resume without catching up idle time',async()=>{
  const room=await MatchRoom.create({bots:0,critters:false});
  try {
    room.start();await wait(50);room.pause();const paused=room.getStatus().physicsTick;
    expect(paused).toBeGreaterThan(0);await wait(40);expect(room.getStatus().physicsTick).toBe(paused);
    const world=(room as unknown as {physics:PhysicsWorld}).physics;
    expect(world.raycastStatic({x:0,y:100,z:0},{x:0,y:-1,z:0},200)).not.toBeNull();
    room.start();await wait(50);expect(room.getStatus().physicsTick).toBeGreaterThan(paused);
  }finally {room.stop();}
});
