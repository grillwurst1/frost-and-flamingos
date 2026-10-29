import { expect, test } from 'bun:test';
import { CowMischief } from '../../client/src/engine/cow-mischief';
import { createRoom, join, place, run, sendInput } from './harness';

test.each([true,false])('autonomous cow movement produces a real authoritative ram (friendly=%s)', async friendly => {
  const h = await createRoom();
  try {
    const cow = join(h, 'Antics cow', 'mascot', 'alpine');
    const enemy = join(h, 'Enemy human', 'allrounder', 'lagoon');
    const ally = join(h, 'Friendly human', 'allrounder', 'alpine');
    const victim = friendly ? ally : enemy, other = friendly ? enemy : ally;
    place(cow.player, -60, -30); cow.player.character.setHeading(0);
    place(victim.player, -60, -24); place(other.player, 150, 150);
    run(h, 20);
    const director = new CowMischief(() => 0);
    for (let tick = 0; tick < 1200; tick++) {
      const character = cow.player.character, state = character.mascotState!;
      const buttons = director.update(0, { dt: 1 / 30, enabled: true, grounded: character.grounded,
        swimming: character.swimming, busy: false, position: character.position, heading: state.heading,
        speed: Math.hypot(character.velocity.x,character.velocity.z), stamina: state.stamina,
        selfId: cow.player.id, players: h.internal.buildSnapshot().players,
        canGraze: () => false, visible: () => true, safe: () => true });
      sendInput(h, cow, buttons); h.internal.tick();
      if (h.events.some(e => e.eventType === 'MASCOT_RAM' && e.actorId === cow.player.id && e.targetId === victim.player.id)) break;
    }
    const hits = h.events.filter(e => e.eventType === 'MASCOT_RAM' && e.actorId === cow.player.id && e.targetId === victim.player.id);
    expect(hits.length).toBeGreaterThan(0);
    if (friendly) { expect(hits[0]!.paramValue).toBe(0); expect(victim.player.hp).toBe(150); }
    else { expect(hits[0]!.paramValue).toBeGreaterThan(0); expect(victim.player.hp).toBeLessThan(150); }
  } finally { h.room.stop(); }
});
