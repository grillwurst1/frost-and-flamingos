/**
 * Spawning in a live room (Rapier world): pads follow tower ownership, the
 * main base backs up a team without towers, every pad has open sky and
 * camera room, and spawns face the next objective across open ground.
 * Also the room-level conquest hooks: death tickets, the results ceasefire
 * and the round reset.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  CONQUEST_TOWERS,
  FJORD_MAP,
  INTERMISSION_TICKS,
  PhysicsWorld,
  type Faction,
  type TowerId,
  type Vec3,
} from '@frost-and-flamingos/shared';
import { MAP_CENTRE, scoreSpawnFacings, spawnFacingYaw } from '../src/rooms/spawn-facing';
import { addDummy, createConquestRoom, place, ticks, type ConquestHarness } from './conquest-harness';

function sourceOf(position: Vec3): TowerId | 'base' | null {
  const pad = FJORD_MAP.spawns.find(
    (spawn) => Math.hypot(spawn.position.x - position.x, spawn.position.z - position.z) < 0.01,
  );
  return pad?.source ?? null;
}

function spawnSources(harness: ConquestHarness, faction: Faction, rolls = 40): Set<string> {
  const sources = new Set<string>();
  for (let roll = 0; roll < rolls; roll += 1) sources.add(String(sourceOf(harness.internal.spawnFor(faction).position)));
  return sources;
}

describe('pad audit (static blueprint)', () => {
  let world: PhysicsWorld;
  beforeAll(async () => {
    world = await PhysicsWorld.create();
  });
  afterAll(() => world.dispose());

  test('every pad has open sky above it (no roof, eave or station overhead)', () => {
    const blocked: string[] = [];
    for (const pad of FJORD_MAP.spawns) {
      for (let ray = 0; ray < 9; ray += 1) {
        const angle = (ray / 8) * Math.PI * 2;
        const radius = ray === 8 ? 0 : 1.6;
        const origin = {
          x: pad.position.x + Math.sin(angle) * radius,
          y: pad.position.y + 0.6,
          z: pad.position.z + Math.cos(angle) * radius,
        };
        const hit = world.raycast(origin, { x: 0, y: 1, z: 0 }, 6);
        if (hit) {
          blocked.push(`${pad.id} (${hit.distance.toFixed(1)} m)`);
          break;
        }
      }
    }
    expect(blocked).toEqual([]);
  });

  test('from every pad, the chosen facing toward any objective is open with camera room', () => {
    const poor: string[] = [];
    const objectives = [...CONQUEST_TOWERS.map((tower) => tower.position), MAP_CENTRE];
    for (const pad of FJORD_MAP.spawns) {
      for (const objective of objectives) {
        if (Math.hypot(objective.x - pad.position.x, objective.z - pad.position.z) < 25) continue;
        const yaw = spawnFacingYaw(world, pad.position, objective);
        const chosen = scoreSpawnFacings(world, pad.position, objective).find((entry) => Math.abs(entry.yaw - yaw) < 1e-9);
        if (!chosen || chosen.eye < 20 || chosen.camera < 4.5) {
          poor.push(`${pad.id}: eye ${chosen?.eye.toFixed(1)} camera ${chosen?.camera.toFixed(1)}`);
        }
      }
    }
    expect(poor).toEqual([]);
  });

  test('facing turns away from a wall right in front of the pad', () => {
    // A wall 1.5 m north of a test point: facing north (the objective) is blocked.
    const wall = {
      raycast(origin: Vec3, direction: Vec3, max: number) {
        if (direction.z > 0.2) {
          const distance = (1.5 - 0) / direction.z;
          if (Math.abs(origin.x + direction.x * distance) < 4 && distance < max) return { distance };
        }
        return null;
      },
    };
    const yaw = spawnFacingYaw(wall, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 100 });
    expect(Math.abs(yaw)).toBeGreaterThan(Math.PI / 4);
    expect(Math.abs(yaw)).toBeLessThan((3 * Math.PI) / 4);
  });
});

describe('spawn selection follows tower ownership', () => {
  let harness: ConquestHarness;
  beforeAll(async () => {
    harness = await createConquestRoom(false);
  });

  test('round start: each side spawns at its home tower', () => {
    expect(spawnSources(harness, 'alpine')).toEqual(new Set(['tower_c']));
    expect(spawnSources(harness, 'lagoon')).toEqual(new Set(['tower_a']));
  });

  test('a captured tower adds its pads; losing every tower falls back to the main base', () => {
    const conquest = harness.internal.conquest;
    conquest.devSetTower('tower_b', 'alpine');
    expect(spawnSources(harness, 'alpine', 80)).toEqual(new Set(['tower_c', 'tower_b']));
    conquest.devSetTower('tower_a', 'alpine');
    expect(spawnSources(harness, 'lagoon')).toEqual(new Set(['base']));
    conquest.devSetTower('tower_a', 'lagoon');
    conquest.devSetTower('tower_b', null);
  });

  test('spawns face the next objective, not the pad’s own tower', () => {
    for (let roll = 0; roll < 12; roll += 1) {
      const spawn = harness.internal.spawnFor('alpine');
      // Peak Guard at the summit: the nearest open objective is the neutral Tower B.
      const target = CONQUEST_TOWERS[1]?.position ?? MAP_CENTRE;
      const bearing = Math.atan2(target.x - spawn.position.x, target.z - spawn.position.z);
      const turn = Math.abs(Math.atan2(Math.sin(spawn.yaw - bearing), Math.cos(spawn.yaw - bearing)));
      expect(turn).toBeLessThanOrEqual((135 * Math.PI) / 180 + 1e-6);
    }
  });
});

describe('room-level conquest hooks', () => {
  let harness: ConquestHarness;
  beforeAll(async () => {
    harness = await createConquestRoom(false);
  });

  test('a kill costs the victim team one ticket', () => {
    const alpine = addDummy(harness, 'alpine');
    const lagoon = addDummy(harness, 'lagoon');
    ticks(harness, 150);
    harness.internal.damagePlayer(lagoon, alpine, 10000, null, false);
    expect(lagoon.alive).toBe(false);
    expect(harness.internal.conquest.ticketsOf('lagoon')).toBe(49);
    expect(harness.internal.conquest.ticketsOf('alpine')).toBe(50);
  });

  test('a player standing in a zone captures it and the snapshot reports it', () => {
    const alpine = [...harness.internal.players.values()].find((player) => player.profile.faction === 'alpine');
    if (!alpine) throw new Error('No alpine dummy.');
    const towerB = CONQUEST_TOWERS[1];
    if (!towerB) throw new Error('Tower B missing.');
    place(alpine, { x: towerB.position.x + 9, y: towerB.position.y + 0.1, z: towerB.position.z });
    ticks(harness, 30);
    const progress = harness.internal.buildSnapshot().conquest.towers[1];
    expect(progress?.alpine).toBe(1);
    expect(progress?.pushing).toBe('alpine');
    ticks(harness, 8 * 60);
    expect(harness.internal.conquest.ownerOf('tower_b')).toBe('alpine');
    const captured = harness.events.find((event) => event.eventType === 'TURRET_CAPTURED');
    expect(captured?.paramX).toBe(1);
    expect(captured?.paramZ).toBe(1);
    expect(captured?.paramValue).toBe(1);
    expect(harness.internal.buildSnapshot().turretStates).toBe(2 | (1 << 2) | (1 << 4));
  });

  test('the results intermission is a ceasefire, then everyone respawns with a clean score', () => {
    const players = [...harness.internal.players.values()];
    const alpine = players.find((player) => player.profile.faction === 'alpine');
    const lagoon = players.find((player) => player.profile.faction === 'lagoon');
    if (!alpine || !lagoon) throw new Error('Dummies missing.');
    harness.internal.conquest.devSetTickets('lagoon', 0);
    ticks(harness, 1);
    expect(harness.internal.conquest.phase).toBe('ended');
    expect(harness.internal.buildSnapshot().conquest.winner).toBe('alpine');
    ticks(harness, 700);
    const hp = alpine.hp;
    harness.internal.damagePlayer(alpine, lagoon, 50, null, false);
    expect(alpine.hp).toBe(hp);
    harness.events.length = 0;
    ticks(harness, INTERMISSION_TICKS);
    expect(harness.internal.conquest.phase).toBe('live');
    expect(harness.internal.conquest.round).toBe(2);
    const respawned = new Set(harness.events.filter((event) => event.eventType === 'PLAYER_RESPAWNED').map((event) => event.actorId));
    for (const player of players) {
      expect(respawned.has(player.id)).toBe(true);
      expect(player.alive).toBe(true);
      expect(player.kills).toBe(0);
      expect(player.deaths).toBe(0);
    }
    expect(harness.internal.conquest.ownerOf('tower_b')).toBeNull();
    expect(harness.internal.conquest.ticketsOf('lagoon')).toBe(50);
    // Respawn events carry a valid facing.
    expect(harness.events.find((event) => event.eventType === 'PLAYER_RESPAWNED')?.paramX).toBe(1);
  });
});
