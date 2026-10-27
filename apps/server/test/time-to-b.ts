/**
 * Balance probe (bun run, not a test): how long bots of each faction need
 * from a spawn to the Tower B capture zone. Two measures over a bot-only
 * run: per-life travel (spawn at a home pad → first step into zone B, lives
 * that reach it) and the round-start race (reset → first of each side in
 * zone B). Also prints the round win split.
 *
 *   bun test/time-to-b.ts [minutes]
 */
import { FJORD_MAP, PHYSICS_TICK_RATE, captureZoneIndexAt, type Faction, type Vec3 } from '@frost-and-flamingos/shared';
import { createConquestRoom } from './conquest-harness';

const minutes = Number(process.argv[2] ?? 30);
const harness = await createConquestRoom(true);
const { internal } = harness;

function sourceOf(position: Vec3): string {
  let best = 'unknown';
  let bestDistance = 1.5;
  for (const spawn of FJORD_MAP.spawns) {
    const distance = Math.hypot(spawn.position.x - position.x, spawn.position.z - position.z);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = spawn.source;
    }
  }
  return best;
}

interface Life {
  faction: Faction;
  source: string;
  startTick: number;
  reached: boolean;
}

const lives = new Map<number, Life>();
const travel: Record<string, number[]> = {};
const races: Array<Record<Faction, number | null>> = [];
let race: Record<Faction, number | null> | null = { alpine: null, lagoon: null };
let raceStart = 0;
const wins: Record<string, number> = { alpine: 0, lagoon: 0, draw: 0 };
let previousPhase = internal.conquest.phase;
let seenEvents = 0;

function startLife(id: number, tick: number): void {
  const player = internal.players.get(id);
  if (!player) return;
  lives.set(id, { faction: player.profile.faction, source: sourceOf(player.character.position), startTick: tick, reached: false });
}

for (const player of internal.players.values()) startLife(player.id, 0);
const total = Math.round(minutes * 60 * PHYSICS_TICK_RATE);
for (let tick = 1; tick <= total; tick += 1) {
  internal.tick();
  for (; seenEvents < harness.events.length; seenEvents += 1) {
    const event = harness.events[seenEvents];
    if (event?.eventType === 'PLAYER_RESPAWNED') startLife(event.actorId, tick);
  }
  const phase = internal.conquest.phase;
  if (phase !== previousPhase) {
    if (phase === 'ended') {
      wins[internal.conquest.winner ?? 'draw'] = (wins[internal.conquest.winner ?? 'draw'] ?? 0) + 1;
      if (race) races.push(race);
      race = null;
    } else {
      race = { alpine: null, lagoon: null };
      raceStart = tick;
    }
    previousPhase = phase;
  }
  if (phase !== 'live') continue;
  for (const player of internal.players.values()) {
    if (!player.alive) continue;
    if (captureZoneIndexAt(player.character.position) !== 1) continue;
    const life = lives.get(player.id);
    if (life && !life.reached) {
      life.reached = true;
      const key = `${life.faction}:${life.source}`;
      (travel[key] ??= []).push((tick - life.startTick) / PHYSICS_TICK_RATE);
    }
    if (race && race[player.profile.faction] === null) race[player.profile.faction] = (tick - raceStart) / PHYSICS_TICK_RATE;
  }
}

const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : NaN);
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? (sorted[Math.floor(sorted.length / 2)] ?? NaN) : NaN;
};
console.log(`[time-to-B] ${minutes} simulated minutes`);
for (const [key, values] of Object.entries(travel).sort()) {
  console.log(`  per-life ${key.padEnd(22)} n=${String(values.length).padStart(3)} mean ${mean(values).toFixed(1)} s median ${median(values).toFixed(1)} s`);
}
for (const faction of ['alpine', 'lagoon'] as const) {
  const all = Object.entries(travel)
    .filter(([key]) => key.startsWith(`${faction}:`) && !key.endsWith(':tower_b'))
    .flatMap(([, values]) => values);
  console.log(`  per-life ${faction} (spawns outside B) n=${all.length} mean ${mean(all).toFixed(1)} s median ${median(all).toFixed(1)} s`);
}
const roundTicks: number[] = [];
const raceTimes = (faction: Faction) => races.map((entry) => entry[faction]).filter((value): value is number => value !== null);
console.log(`  round-start race: alpine mean ${mean(raceTimes('alpine')).toFixed(1)} s (n=${raceTimes('alpine').length}), lagoon mean ${mean(raceTimes('lagoon')).toFixed(1)} s (n=${raceTimes('lagoon').length})`);
console.log(`  rounds won: alpine ${wins.alpine}, lagoon ${wins.lagoon}, draw ${wins.draw}`);
const kills: Record<string, number> = { alpine: 0, lagoon: 0 };
for (const event of harness.events) {
  if (event.eventType !== 'KILL_RAGDOLL') continue;
  const killer = internal.players.get(event.actorId);
  if (killer) kills[killer.profile.faction] = (kills[killer.profile.faction] ?? 0) + 1;
}
console.log(`  kills by faction: alpine ${kills.alpine}, lagoon ${kills.lagoon}`);
const perBot = new Map<number, { kills: number; deaths: number; weapons: Map<number, number>; classes: Set<string> }>();
for (const event of harness.events) {
  if (event.eventType !== 'KILL_RAGDOLL') continue;
  const killer = perBot.get(event.actorId) ?? { kills: 0, deaths: 0, weapons: new Map(), classes: new Set() };
  killer.kills += 1;
  killer.weapons.set(event.paramValue, (killer.weapons.get(event.paramValue) ?? 0) + 1);
  perBot.set(event.actorId, killer);
  const victim = perBot.get(event.targetId) ?? { kills: 0, deaths: 0, weapons: new Map(), classes: new Set() };
  victim.deaths += 1;
  perBot.set(event.targetId, victim);
}
for (const player of internal.players.values()) {
  const stats = perBot.get(player.id);
  console.log(`  ${player.profile.displayName.padEnd(16)} ${player.profile.faction} now=${player.profile.cosmetics.classId} kills ${stats?.kills ?? 0} deaths ${stats?.deaths ?? 0} weapons ${JSON.stringify([...(stats?.weapons ?? new Map())])}`);
}
if (process.env.FF_TOWER_LOG) {
  console.log(
    '  towers: ' +
      harness.events
        .filter((event) => event.eventType === 'TURRET_CAPTURED')
        .map((event) => `${(event.tick / 60).toFixed(0)}s ${'ABC'[event.paramX]}${event.paramZ === 1 ? '+' : '-'}${event.paramValue === 1 ? 'alp' : 'lag'}`)
        .join(' '),
  );
}
process.exit(0);
