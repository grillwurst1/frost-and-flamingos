/**
 * Bot soak: the four resort bots play 15 simulated minutes of Climate
 * Conquest on their own. Towers must change hands and at least one round
 * must end (and reset) on tickets. Runs the real room tick, so it takes a
 * while; FF_SOAK_MINUTES shortens or lengthens it.
 */
import { expect, test } from 'bun:test';
import { PHYSICS_TICK_RATE } from '@frost-and-flamingos/shared';
import { createConquestRoom } from './conquest-harness';

const MINUTES = Number(process.env.FF_SOAK_MINUTES ?? 15);

test(
  `${MINUTES}-minute bot soak: towers change hands and a round ends`,
  async () => {
    const harness = await createConquestRoom(true);
    const { internal } = harness;
    const total = Math.round(MINUTES * 60 * PHYSICS_TICK_RATE);
    const started = performance.now();
    const roundEnds: Array<{ tick: number; winner: string | null; reason: string | null; tickets: [number, number] }> = [];
    let previousPhase = internal.conquest.phase;
    let resets = 0;
    let minWeather = 0;
    let maxWeather = 0;
    for (let tick = 0; tick < total; tick += 1) {
      internal.tick();
      const phase = internal.conquest.phase;
      if (phase !== previousPhase) {
        if (phase === 'ended') {
          const status = internal.conquest.status();
          roundEnds.push({ tick, winner: status.winner, reason: status.reason, tickets: [status.tickets.alpine, status.tickets.lagoon] });
        } else {
          resets += 1;
        }
        previousPhase = phase;
      }
      minWeather = Math.min(minWeather, internal.conquest.weatherBalance);
      maxWeather = Math.max(maxWeather, internal.conquest.weatherBalance);
    }
    const seconds = (performance.now() - started) / 1000;
    const captures = harness.events.filter((event) => event.eventType === 'TURRET_CAPTURED');
    const kills = harness.events.filter((event) => event.eventType === 'KILL_RAGDOLL').length;
    const status = internal.conquest.status();
    console.log(
      `[soak] ${MINUTES} min in ${seconds.toFixed(1)} s: ${captures.length} tower events ` +
        `(${captures.filter((event) => event.paramZ === 1).length} captures), ${kills} kills, ` +
        `${roundEnds.length} round ends ${JSON.stringify(roundEnds)}, ${resets} resets, ` +
        `weather ${minWeather.toFixed(2)}..${maxWeather.toFixed(2)}, now ${JSON.stringify(status.towers.map((tower) => tower.owner))} ` +
        `tickets ${status.tickets.alpine}:${status.tickets.lagoon}`,
    );
    console.log(
      `[soak] tower log: ${captures
        .map((event) => `${(event.tick / 60).toFixed(0)}s ${'ABC'[event.paramX]} ${event.paramZ === 1 ? 'captured' : 'neutralised'} by ${event.paramValue === 1 ? 'alpine' : 'lagoon'}`)
        .join(', ')}`,
    );
    expect(captures.filter((event) => event.paramZ === 1).length).toBeGreaterThanOrEqual(3);
    expect(roundEnds.length).toBeGreaterThanOrEqual(1);
    expect(roundEnds.some((end) => end.reason === 'tickets')).toBe(true);
    expect(maxWeather - minWeather).toBeGreaterThan(0.3);
  },
  30 * 60 * 1000,
);
