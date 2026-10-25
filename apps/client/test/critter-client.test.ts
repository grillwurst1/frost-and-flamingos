import { describe, expect, mock, test } from 'bun:test';
import { get } from 'svelte/store';
import { critterKillValue, type CritterState, type GameEvent } from '@frost-and-flamingos/shared';

// Web Audio is not available under bun: the critter client only calls these.
mock.module('../src/audio/synth', () => ({
  audio: {
    playHenCluck: () => undefined,
    playHenPanic: () => undefined,
    playHenSquawk: () => undefined,
    playHitMarker: () => undefined,
  },
}));

const { CritterClient, CRITTER_POP_GUARD_MS } = await import('../src/engine/critter-client');
const { killFeed } = await import('../src/state/game');
type CritterPose = Parameters<import('../src/engine/critter-client').CritterView['update']>[1];
type CritterFx = ConstructorParameters<typeof CritterClient>[0]['fx'];

const FRAME_MS = 1000 / 30;
/** Same pop length and contract as rendering/critters/hen-view.ts. */
const POP_SECONDS = 0.14;

/**
 * Stub view with HenView's contract: pop() starts the squash, update()
 * advances it and hides the view when it ends, setVisible() shows/hides and
 * cancels a pop. `selfHiding: false` models a view that never ends its pop.
 */
class StubView {
  enabled = true;
  visible = true;
  popTime = -1;
  popFinished = false;
  updates: CritterPose[] = [];
  calls: string[] = [];

  constructor(private readonly selfHiding = true) {}

  update(delta: number, pose: CritterPose): void {
    this.updates.push(pose);
    if (this.popTime >= 0 && this.selfHiding) {
      this.popTime += delta;
      if (this.popTime >= POP_SECONDS) {
        this.popTime = -1;
        this.popFinished = true;
        this.visible = false;
      }
    }
    this.enabled = this.visible;
  }

  setVisible(visible: boolean): void {
    this.calls.push(`setVisible(${visible})`);
    this.visible = visible;
    this.popTime = -1;
    this.enabled = visible;
  }

  pop(): void {
    this.calls.push('pop');
    if (this.visible) this.popTime = 0;
  }

  dispose(): void {
    this.calls.push('dispose');
  }
}

function hen(alive: boolean, x = 2): CritterState {
  return {
    id: 1,
    species: 'hen',
    half: 'alpine',
    position: { x, y: 18, z: 0 },
    yaw: 0,
    speed: alive ? 0.6 : 0,
    behaviour: 'walk',
    alive,
    airborne: false,
  };
}

const fx = { update: () => undefined, featherBurst: () => undefined } as unknown as CritterFx;

function harness(selfHiding = true) {
  const view = new StubView(selfHiding);
  const client = new CritterClient({ fx, mascotFx: null, viewFactory: () => view });
  let now = 10_000;
  const frame = (alive: boolean, x = 2): void => {
    now += FRAME_MS;
    client.onSnapshot([hen(alive, x)], now);
    client.update(FRAME_MS / 1000, now, { x: 0, y: 18, z: 0 });
  };
  const kill = (): number => {
    const event: GameEvent = {
      eventType: 'CRITTER_KILLED',
      actorId: 7,
      targetId: 1,
      paramX: 20,
      paramZ: 0,
      paramValue: critterKillValue('hen', 'smg'),
    };
    client.handleKill(event, { localId: null, profiles: new Map() }, now);
    return now;
  };
  return { view, client, frame, kill, time: () => now };
}

describe('critter client death pop', () => {
  test('a CRITTER_KILLED event plays the pop and hides the view within 0.5 s', () => {
    const { view, frame, kill, time } = harness();
    for (let i = 0; i < 30; i++) frame(true);
    expect(view.enabled).toBe(true);
    const updatesBefore = view.updates.length;
    const killedAt = kill();
    // The interpolated snapshots still show her alive for a few frames, then dead.
    let hiddenAt = -1;
    for (let i = 0; i < 60; i++) {
      frame(i >= 4 ? false : true);
      if (hiddenAt < 0 && !view.enabled) hiddenAt = time();
    }
    expect(view.calls).toContain('pop');
    expect(view.updates.length).toBeGreaterThan(updatesBefore);
    expect(view.popFinished).toBe(true);
    expect(hiddenAt).toBeGreaterThan(0);
    expect(hiddenAt - killedAt).toBeLessThan(500);
    expect(view.enabled).toBe(false);
    // The pop plays where she died: the last live pose, standing still.
    const last = view.updates[view.updates.length - 1];
    expect(last?.speed).toBe(0);
    expect(last?.position.x).toBeCloseTo(2, 5);
    const line = get(killFeed).at(-1);
    expect(line?.critter).toBe('hen');
    expect(line?.weaponId).toBe('smg');
  });

  test('a view that never ends its pop is hidden by the guard', () => {
    const { view, frame, kill, time } = harness(false);
    for (let i = 0; i < 10; i++) frame(true);
    const killedAt = kill();
    let hiddenAt = -1;
    for (let i = 0; i < 40; i++) {
      frame(false);
      if (hiddenAt < 0 && !view.enabled) hiddenAt = time();
    }
    expect(view.calls.at(-1)).toBe('setVisible(false)');
    expect(hiddenAt - killedAt).toBeGreaterThanOrEqual(CRITTER_POP_GUARD_MS - FRAME_MS);
    expect(hiddenAt - killedAt).toBeLessThan(CRITTER_POP_GUARD_MS + 2 * FRAME_MS);
  });

  test('a death seen only through snapshots hides at once, and a respawn shows the hen again', () => {
    const { view, frame } = harness();
    for (let i = 0; i < 10; i++) frame(true);
    frame(false);
    frame(false);
    frame(false);
    frame(false);
    frame(false);
    expect(view.enabled).toBe(false);
    expect(view.calls).not.toContain('pop');
    const updates = view.updates.length;
    for (let i = 0; i < 30; i++) frame(false);
    // Dead and not popping: no more posing.
    expect(view.updates.length).toBe(updates);
    // Respawn somewhere else on her half.
    for (let i = 0; i < 10; i++) frame(true, 40);
    expect(view.enabled).toBe(true);
    expect(view.calls.at(-1)).toBe('setVisible(true)');
    expect(view.updates.at(-1)?.position.x).toBeCloseTo(40, 5);
  });

  test('a kill event for a hen that is already hidden does not pop', () => {
    const { view, frame, kill } = harness();
    for (let i = 0; i < 10; i++) frame(true);
    for (let i = 0; i < 8; i++) frame(false);
    expect(view.enabled).toBe(false);
    kill();
    for (let i = 0; i < 20; i++) frame(false);
    expect(view.enabled).toBe(false);
    expect(view.popFinished).toBe(false);
  });
});
