/**
 * Climate Conquest rules, headless and Rapier-free: capture / neutralise /
 * contest timing, who counts in a zone, tickets (bleed + deaths), weather,
 * round end and the deterministic reset, plus the snapshot block codec.
 */
import { describe, expect, test } from 'bun:test';
import {
  BinaryReader,
  BinaryWriter,
  CLASS_CAPABILITIES,
  CLASS_IDS,
  CONQUEST_RULES,
  CONQUEST_TOWERS,
  INTERMISSION_TICKS,
  PHYSICS_TICK_RATE,
  ROUND_TICKS,
  decodeSnapshot,
  encodeSnapshot,
  readConquestState,
  writeConquestState,
  type ClassId,
  type Faction,
  type WorldSnapshot,
} from '@frost-and-flamingos/shared';
import {
  ClimateConquest,
  countTowerPresence,
  type ConquestEvent,
  type TowerPresence,
} from '../src/rooms/conquest';

const A = 0;
const B = 1;
const C = 2;
const EMPTY: TowerPresence = { alpine: 0, lagoon: 0 };

function presenceAt(index: number, alpine: number, lagoon: number): TowerPresence[] {
  return CONQUEST_TOWERS.map((_, tower) => (tower === index ? { alpine, lagoon } : { ...EMPTY }));
}

/** Steps until an event of `type` fires; returns the 1-based tick count (or -1). */
function ticksUntil(conquest: ClimateConquest, presence: TowerPresence[], type: ConquestEvent['type'], limit = 20000): number {
  for (let tick = 1; tick <= limit; tick += 1) {
    if (conquest.step(presence).some((event) => event.type === type)) return tick;
  }
  return -1;
}

function run(conquest: ClimateConquest, presence: TowerPresence[], count: number): ConquestEvent[] {
  const events: ConquestEvent[] = [];
  for (let tick = 0; tick < count; tick += 1) events.push(...conquest.step(presence));
  return events;
}

describe('round start', () => {
  test('each side holds its home tower, B is neutral, 50 tickets, balanced weather', () => {
    const conquest = new ClimateConquest();
    const snapshot = conquest.snapshot();
    expect(snapshot.towers.map((tower) => tower.owner)).toEqual(['lagoon', null, 'alpine']);
    expect(snapshot.towers.map((tower) => tower.control)).toEqual([1, 0, -1]);
    expect(conquest.ticketsOf('alpine')).toBe(50);
    expect(conquest.ticketsOf('lagoon')).toBe(50);
    expect(conquest.weatherBalance).toBe(0);
    expect(snapshot.phase).toBe('live');
    expect(snapshot.round).toBe(1);
    expect(snapshot.secondsLeft).toBe(CONQUEST_RULES.roundSeconds);
  });
});

describe('capture timing', () => {
  test('one player takes a neutral tower in exactly 8 s', () => {
    const conquest = new ClimateConquest();
    expect(ticksUntil(conquest, presenceAt(B, 1, 0), 'captured')).toBe(8 * PHYSICS_TICK_RATE);
    expect(conquest.ownerOf('tower_b')).toBe('alpine');
  });

  test('two players need 6 s, three or more need 4 s', () => {
    expect(ticksUntil(new ClimateConquest(), presenceAt(B, 0, 2), 'captured')).toBe(6 * PHYSICS_TICK_RATE);
    expect(ticksUntil(new ClimateConquest(), presenceAt(B, 0, 3), 'captured')).toBe(4 * PHYSICS_TICK_RATE);
    expect(ticksUntil(new ClimateConquest(), presenceAt(B, 0, 7), 'captured')).toBe(4 * PHYSICS_TICK_RATE);
  });

  test('speed follows the head-count advantage: 3 vs 2 captures like a lone player', () => {
    const conquest = new ClimateConquest();
    expect(ticksUntil(conquest, presenceAt(B, 3, 2), 'captured')).toBe(8 * PHYSICS_TICK_RATE);
  });

  test('an enemy tower is neutralised first (4 s alone), then raised (8 s)', () => {
    const conquest = new ClimateConquest();
    const presence = presenceAt(A, 1, 0);
    let neutralisedAt = -1;
    let capturedAt = -1;
    for (let tick = 1; tick <= 2000 && capturedAt < 0; tick += 1) {
      for (const event of conquest.step(presence)) {
        if (event.type === 'neutralised') {
          neutralisedAt = tick;
          expect(event.faction).toBe('alpine');
          expect(event.previousOwner).toBe('lagoon');
          expect(conquest.ownerOf('tower_a')).toBeNull();
        }
        if (event.type === 'captured') capturedAt = tick;
      }
    }
    expect(neutralisedAt).toBe(4 * PHYSICS_TICK_RATE);
    expect(capturedAt).toBe(neutralisedAt + 8 * PHYSICS_TICK_RATE);
    expect(conquest.ownerOf('tower_a')).toBe('alpine');
  });

  test('three attackers flip an enemy tower in 2 s + 4 s', () => {
    const conquest = new ClimateConquest();
    expect(ticksUntil(conquest, presenceAt(C, 0, 3), 'neutralised')).toBe(2 * PHYSICS_TICK_RATE);
    expect(ticksUntil(conquest, presenceAt(C, 0, 3), 'captured')).toBe(4 * PHYSICS_TICK_RATE);
  });
});

describe('contest and empty zones', () => {
  test('an equal standoff stalls the progress and flags the zone as contested', () => {
    const conquest = new ClimateConquest();
    run(conquest, presenceAt(B, 1, 0), 120);
    const before = conquest.snapshot().towers[B].control;
    expect(before).toBeLessThan(0);
    run(conquest, presenceAt(B, 2, 2), 900);
    const tower = conquest.snapshot().towers[B];
    expect(tower.control).toBe(before);
    expect(tower.contested).toBe(true);
    expect(tower.pushing).toBeNull();
    expect(tower.owner).toBeNull();
  });

  test('defenders outnumbering attackers win back an owned tower', () => {
    const conquest = new ClimateConquest();
    run(conquest, presenceAt(A, 2, 0), 60);
    expect(conquest.snapshot().towers[A].control).toBeLessThan(1);
    run(conquest, presenceAt(A, 1, 3), 600);
    expect(conquest.snapshot().towers[A].control).toBe(1);
    expect(conquest.ownerOf('tower_a')).toBe('lagoon');
  });

  test('an empty zone drifts back: partial capture to neutral, a dented tower to its owner', () => {
    const conquest = new ClimateConquest();
    run(conquest, presenceAt(B, 0, 1), 240);
    run(conquest, presenceAt(A, 1, 0), 120);
    const dented = conquest.snapshot();
    expect(dented.towers[B].control).toBeGreaterThan(0);
    expect(dented.towers[A].control).toBeLessThan(1);
    run(conquest, presenceAt(-1, 0, 0), CONQUEST_RULES.recoverSeconds * PHYSICS_TICK_RATE);
    const settled = conquest.snapshot();
    expect(settled.towers[B].control).toBe(0);
    expect(settled.towers[A].control).toBe(1);
    expect(settled.towers.map((tower) => tower.owner)).toEqual(['lagoon', null, 'alpine']);
  });
});

describe('who counts inside a zone', () => {
  const tower = CONQUEST_TOWERS[B];
  if (!tower) throw new Error('Tower B missing.');
  const at = (dx: number, dy: number, dz: number) => ({ x: tower.position.x + dx, y: tower.position.y + dy, z: tower.position.z + dz });
  const body = (faction: Faction, classId: ClassId, position = at(4, 0, 2), alive = true) => ({ faction, classId, alive, position });

  test('living capture-capable players inside the cylinder count, per side', () => {
    const presence = countTowerPresence([
      body('alpine', 'allrounder'),
      body('alpine', 'mascot'),
      body('lagoon', 'heavy', at(-10, 1, 9)),
      body('lagoon', 'infiltrator', at(0, 14, 0)),
    ]);
    expect(presence[B]).toEqual({ alpine: 2, lagoon: 2 });
    expect(presence[A]).toEqual({ alpine: 0, lagoon: 0 });
  });

  test('the dead, the outside and those far above or below do not count', () => {
    const presence = countTowerPresence([
      body('alpine', 'allrounder', at(4, 0, 2), false),
      body('alpine', 'allrounder', at(tower.captureRadius + 0.5, 0, 0)),
      body('lagoon', 'allrounder', at(0, CONQUEST_RULES.zoneAbove + 2, 0)),
      body('lagoon', 'allrounder', at(0, -CONQUEST_RULES.zoneBelow - 1, 0)),
    ]);
    expect(presence[B]).toEqual({ alpine: 0, lagoon: 0 });
  });

  test('a class flagged canCapture: false (the drifter) never tips a zone', () => {
    // Every class of this build captures; a class with the flag off is skipped.
    for (const classId of CLASS_IDS) expect(CLASS_CAPABILITIES[classId].canCapture).toBe(true);
    const drifterLike = (classId: ClassId) => classId !== 'infiltrator';
    const presence = countTowerPresence(
      [body('alpine', 'infiltrator'), body('alpine', 'infiltrator'), body('lagoon', 'allrounder')],
      drifterLike,
    );
    expect(presence[B]).toEqual({ alpine: 0, lagoon: 1 });
    const conquest = new ClimateConquest();
    expect(ticksUntil(conquest, presence, 'captured')).toBe(8 * PHYSICS_TICK_RATE);
    expect(conquest.ownerOf('tower_b')).toBe('lagoon');
  });
});

describe('tickets', () => {
  test('equal tower counts do not bleed', () => {
    const conquest = new ClimateConquest();
    run(conquest, presenceAt(-1, 0, 0), 60 * PHYSICS_TICK_RATE);
    expect(conquest.ticketsOf('alpine')).toBe(50);
    expect(conquest.ticketsOf('lagoon')).toBe(50);
  });

  test('the side holding fewer towers loses 1 ticket per 6 s per tower of deficit', () => {
    const conquest = new ClimateConquest();
    expect(ticksUntil(conquest, presenceAt(B, 1, 0), 'captured')).toBeGreaterThan(0);
    // 2 vs 1: Lagoon League bleeds one ticket every 6 s.
    run(conquest, presenceAt(-1, 0, 0), 60 * PHYSICS_TICK_RATE);
    expect(conquest.ticketsOf('lagoon')).toBe(40);
    expect(conquest.ticketsOf('alpine')).toBe(50);
    // 3 vs 0: three times as fast (one ticket every 2 s).
    conquest.devSetTower('tower_a', 'alpine');
    run(conquest, presenceAt(-1, 0, 0), 30 * PHYSICS_TICK_RATE);
    expect(conquest.ticketsOf('lagoon')).toBe(25);
  });

  test('every death costs the victim team one ticket; none during the intermission', () => {
    const conquest = new ClimateConquest();
    for (let index = 0; index < 3; index += 1) expect(conquest.recordDeath('alpine')).toBe(true);
    conquest.recordDeath('lagoon');
    expect(conquest.ticketsOf('alpine')).toBe(47);
    expect(conquest.ticketsOf('lagoon')).toBe(49);
    conquest.devSetTickets('lagoon', 0);
    conquest.step(presenceAt(-1, 0, 0));
    expect(conquest.phase).toBe('ended');
    expect(conquest.recordDeath('alpine')).toBe(false);
    expect(conquest.ticketsOf('alpine')).toBe(47);
  });
});

describe('weather balance', () => {
  test('each held tower pushes 0.015/s toward its climate, clamped to ±1', () => {
    const conquest = new ClimateConquest();
    expect(ticksUntil(conquest, presenceAt(B, 1, 0), 'captured')).toBeGreaterThan(0);
    const start = conquest.weatherBalance;
    run(conquest, presenceAt(-1, 0, 0), 20 * PHYSICS_TICK_RATE);
    expect(conquest.weatherBalance - start).toBeCloseTo(-0.015 * 20, 6);
    conquest.devSetTower('tower_a', 'alpine');
    conquest.devSetTickets('lagoon', 60000);
    run(conquest, presenceAt(-1, 0, 0), 60 * PHYSICS_TICK_RATE);
    expect(conquest.weatherBalance).toBe(-1);
  });
});

describe('round flow', () => {
  test('0 tickets ends the round, 15 s results, then a reset to the round-start state', () => {
    const conquest = new ClimateConquest();
    run(conquest, presenceAt(B, 0, 2), 900);
    conquest.devSetTickets('alpine', 1);
    conquest.recordDeath('alpine');
    const ended = conquest.step(presenceAt(B, 0, 2));
    expect(ended).toEqual([{ type: 'round_ended', winner: 'lagoon', reason: 'tickets', round: 1 }]);
    const results = conquest.snapshot();
    expect(results.phase).toBe('ended');
    expect(results.winner).toBe('lagoon');
    expect(results.secondsLeft).toBe(CONQUEST_RULES.intermissionSeconds);
    // Frozen during the results: no capture, no bleed, no weather drift.
    const frozenWeather = conquest.weatherBalance;
    const frozenTickets = conquest.ticketsOf('lagoon');
    const events = run(conquest, presenceAt(A, 5, 0), INTERMISSION_TICKS - 1);
    expect(events).toEqual([]);
    expect(conquest.ownerOf('tower_a')).toBe('lagoon');
    expect(conquest.weatherBalance).toBe(frozenWeather);
    expect(conquest.ticketsOf('lagoon')).toBe(frozenTickets);
    expect(conquest.step(presenceAt(-1, 0, 0))).toEqual([{ type: 'round_reset', round: 2 }]);
    const fresh = new ClimateConquest().snapshot();
    expect(conquest.snapshot()).toEqual({ ...fresh, round: 2 });
    expect(conquest.ticketsOf('alpine')).toBe(50);
    expect(conquest.ticketsOf('lagoon')).toBe(50);
    expect(conquest.weatherBalance).toBe(0);
  });

  test('the round timer ends a stalemate: equal tickets is a draw', () => {
    const conquest = new ClimateConquest();
    const events = run(conquest, presenceAt(-1, 0, 0), ROUND_TICKS);
    expect(events).toEqual([{ type: 'round_ended', winner: null, reason: 'time', round: 1 }]);
  });

  test('the same presence script always plays the same round', () => {
    const script = (seed: number) => {
      let state = seed >>> 0;
      const random = () => {
        state = (state * 1664525 + 1013904223) >>> 0;
        return state / 4294967296;
      };
      const conquest = new ClimateConquest();
      const log: string[] = [];
      let presence = presenceAt(-1, 0, 0);
      for (let tick = 0; tick < 3 * ROUND_TICKS && conquest.round < 4; tick += 1) {
        if (tick % 90 === 0) presence = CONQUEST_TOWERS.map(() => ({ alpine: Math.floor(random() * 4), lagoon: Math.floor(random() * 4) }));
        if (tick % 45 === 0 && random() < 0.5) conquest.recordDeath(random() < 0.5 ? 'alpine' : 'lagoon');
        for (const event of conquest.step(presence)) log.push(`${tick}:${JSON.stringify(event)}`);
        if (tick % 600 === 0) log.push(JSON.stringify(conquest.snapshot()));
      }
      return log;
    };
    const first = script(1234);
    expect(first.some((line) => line.includes('round_reset'))).toBe(true);
    expect(script(1234)).toEqual(first);
  });
});

describe('snapshot conquest block', () => {
  test('round-trips through the binary snapshot', () => {
    const conquest = new ClimateConquest();
    const mixed = presenceAt(B, 2, 1);
    mixed[A] = { alpine: 1, lagoon: 1 };
    run(conquest, mixed, 100);
    const state = conquest.snapshot();
    const snapshot: WorldSnapshot = {
      serverTick: 77,
      weatherBalance: 0.25,
      windAngle: 1,
      windStrength: 0.2,
      ticketsAlpine: 50,
      ticketsLagoon: 49,
      turretStates: 0,
      players: [],
      vehicles: [],
      conquest: state,
    };
    const decoded = decodeSnapshot(encodeSnapshot(snapshot));
    expect(decoded).not.toBeNull();
    const towers = decoded?.conquest.towers ?? [];
    expect(towers[B]?.pushing).toBe('alpine');
    expect(towers[B]?.alpine).toBe(2);
    expect(towers[B]?.lagoon).toBe(1);
    expect(towers[B]?.control ?? 0).toBeCloseTo(state.towers[B].control, 1);
    expect(towers[A]?.contested).toBe(true);
    expect(towers.map((tower) => tower.owner)).toEqual(['lagoon', null, 'alpine']);
    expect(decoded?.conquest.round).toBe(1);
    expect(decoded?.conquest.secondsLeft).toBeCloseTo(state.secondsLeft, 1);
  });

  test('the ended phase, winner and reason survive the wire', () => {
    const writer = new BinaryWriter(32);
    const conquest = new ClimateConquest();
    conquest.devSetTickets('lagoon', 0);
    conquest.step(presenceAt(-1, 0, 0));
    writeConquestState(writer, conquest.snapshot());
    const decoded = readConquestState(new BinaryReader(writer.finish()));
    expect(decoded.phase).toBe('ended');
    expect(decoded.winner).toBe('alpine');
    expect(decoded.reason).toBe('tickets');
    expect(decoded.secondsLeft).toBe(CONQUEST_RULES.intermissionSeconds);
  });
});
