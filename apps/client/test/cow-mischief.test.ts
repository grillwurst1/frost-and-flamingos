import { expect, test } from 'bun:test';
import { InputButton, type PlayerState } from '@frost-and-flamingos/shared';
import { CowMischief, type CowMischiefContext } from '../src/engine/cow-mischief';

function fixture(people: Partial<PlayerState>[] = []) {
  const controller = new CowMischief(() => 0);
  const context: CowMischiefContext = { dt: .1, enabled: true, grounded: true, swimming: false, busy: false,
    position: { x: 0, y: 0, z: 0 }, heading: 0, speed: 0, stamina: 1, selfId: 1,
    players: people.map(p => ({ id: 2, classId: 'allrounder', faction: 'alpine', alive: true,
      position: { x: 0, y: 0, z: 8 }, ...p }) as PlayerState),
    canGraze: () => true, visible: () => true, safe: () => true };
  const advance = (buttons = 0, seconds = 26) => { let result = buttons; for (let i = 0; i < seconds * 10; i++) result = controller.update(buttons, context); return result; };
  return { controller, context, advance };
}

test.each(['alpine','lagoon'] as const)('cow may bolt towards a nearby %s human using ordinary gallop input', faction => {
  const f = fixture([{ faction }]);
  const buttons = f.advance();
  expect(f.controller.mode).toBe('charging');
  expect(buttons & InputButton.Forward).not.toBe(0);
  expect(buttons & InputButton.Sprint).not.toBe(0);
  expect(buttons & (InputButton.Skill1 | InputButton.Skill2 | InputButton.Skill3OrTaunt)).toBe(0);
});

test('an idle cow grazes briefly on suitable ground and movement immediately takes over', () => {
  const f = fixture(); expect(f.advance() & InputButton.Crouch).not.toBe(0);
  expect(f.controller.mode).toBe('grazing');
  expect(f.controller.update(InputButton.Forward, f.context)).toBe(InputButton.Forward);
  expect(f.controller.mode).toBeNull();
  expect(f.advance(0, 10)).toBe(0);
});

test.each([InputButton.Skill1,InputButton.Skill2,InputButton.Skill3OrTaunt,InputButton.Jump])('player ability/jump %s always interrupts autonomous charge', button => {
  const f = fixture([{}]); f.advance();
  expect(f.controller.mode).toBe('charging');
  expect(f.controller.update(button, f.context)).toBe(button);
  expect(f.controller.mode).toBeNull();
});

test('cow never pursues corpses, other mascots, hidden humans or people across a drop', () => {
  for (const changes of [{ alive: false },{ classId: 'mascot' },{ position: { x: 0, y: 4, z: 8 } }]) {
    const f = fixture([changes as Partial<PlayerState>]); f.context.canGraze = () => false;
    expect(f.advance()).toBe(0); expect(f.controller.mode).toBeNull();
  }
  const hidden = fixture([{}]); hidden.context.visible = () => false; hidden.context.canGraze = () => false;
  expect(hidden.advance()).toBe(0);
  const ledge = fixture([{}]); ledge.context.safe = () => false;
  expect(ledge.advance()).toBe(0); expect(ledge.controller.mode).toBeNull();
});

test('autonomous bouts have a bounded duration and never start in water or during an ability', () => {
  const f = fixture([{}]); f.advance(); f.advance(0, 4); expect(f.controller.mode).toBeNull();
  for (const flag of ['busy','swimming'] as const) {
    const blocked = fixture([{}]); blocked.context[flag] = true;
    expect(blocked.advance(0, 100)).toBe(0); expect(blocked.controller.mode).toBeNull();
  }
});

test('a fast bolting cow probes its braking distance and actively brakes before a ledge', () => {
  const f = fixture([{}]); f.advance(); f.context.speed = 10;
  let distance = 0;
  f.context.safe = (_heading, d) => { distance = d; return false; };
  f.advance(0, .2);
  expect(distance).toBeGreaterThan(6);
  expect(f.controller.mode).toBeNull();
  expect(f.controller.update(0, f.context) & InputButton.Backward).not.toBe(0);
  expect(f.controller.update(InputButton.Skill2, f.context)).toBe(InputButton.Skill2);
  expect(f.controller.update(0, f.context)).toBe(0);
  f.context.speed = .1;
  expect(f.controller.update(0, f.context)).toBe(0);
  expect(f.controller.update(InputButton.Skill2, f.context)).toBe(InputButton.Skill2);
});
