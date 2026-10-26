/**
 * Wardrobe changes in a live room and the capability flags behind them:
 * no revive or heal through profile updates, class/loadout deferral, the
 * team rebalance when a non-balancing class (the drifter) switches to a
 * combat class, unarmed owners losing their shots and bots dropping
 * untouchable targets. A drifter-like class is simulated by overriding the
 * capabilities of an existing class for the duration of a test.
 */
import { afterEach, describe, expect, test } from 'bun:test';
import {
  CLASS_CAPABILITIES,
  RESPAWN_DELAY_SECONDS,
  PHYSICS_TICK_RATE,
  createDefaultProfile,
  decodeGameEvent,
  type ClassCapabilities,
  type ClassId,
  type Faction,
  type PlayerInput,
  type PlayerProfile,
} from '@frost-and-flamingos/shared';
import { addDummy, createConquestRoom, place, ticks, type ConquestHarness, type ConquestTestPlayer } from './conquest-harness';

const capabilities = CLASS_CAPABILITIES as Record<ClassId, ClassCapabilities>;
const original = { ...capabilities };

function override(classId: ClassId, patch: Partial<ClassCapabilities>): void {
  capabilities[classId] = { ...original[classId], ...patch };
}

afterEach(() => {
  for (const classId of Object.keys(original) as ClassId[]) capabilities[classId] = original[classId];
});

function wardrobe(harness: ConquestHarness, player: ConquestTestPlayer, classId: ClassId, tweak?: (profile: PlayerProfile) => void): void {
  const profile: PlayerProfile = { ...createDefaultProfile(player.profile.displayName, classId), faction: player.profile.faction };
  tweak?.(profile);
  player.lastProfileUpdateAt = 0;
  const socket = player.socket;
  if (!socket) throw new Error('Dummy without socket.');
  (harness.room as unknown as { handleProfileUpdate(socket: unknown, profile: PlayerProfile): void }).handleProfileUpdate(socket, profile);
}

function walkAway(player: ConquestTestPlayer): void {
  const feet = player.character.position;
  place(player, { x: feet.x + 8, y: feet.y + 0.2, z: feet.z + 8 });
}

const RESPAWN_TICKS = RESPAWN_DELAY_SECONDS * PHYSICS_TICK_RATE;

/** One client input with a button down (the player has deployed). */
function press(harness: ConquestHarness, player: ConquestTestPlayer): void {
  const socket = player.socket;
  if (!socket) throw new Error('Dummy without socket.');
  const input: PlayerInput = {
    sequence: player.lastProcessedInput + 1,
    buttons: 1,
    yaw: player.character.heading,
    pitch: 0,
    weaponSlot: 1,
  };
  (harness.room as unknown as { handleInput(socket: unknown, input: PlayerInput): void }).handleInput(socket, input);
}

/** Room members these tests poke beyond the shared harness view. */
function internals(harness: ConquestHarness): {
  useSkill(player: ConquestTestPlayer, index: 0 | 1 | 2): void;
  players: Map<number, { cloakUntilTick: number }>;
} {
  return harness.internal as unknown as {
    useSkill(player: ConquestTestPlayer, index: 0 | 1 | 2): void;
    players: Map<number, { cloakUntilTick: number }>;
  };
}

describe('profile updates', () => {
  test('a dead player is not revived: the change is stored for the respawn', async () => {
    const harness = await createConquestRoom(false);
    const alpine = addDummy(harness, 'alpine');
    const lagoon = addDummy(harness, 'lagoon');
    ticks(harness, 150);
    harness.internal.damagePlayer(lagoon, alpine, 10000, null, false);
    expect(lagoon.alive).toBe(false);
    const respawnAt = lagoon.respawnAtTick;
    wardrobe(harness, lagoon, 'heavy');
    expect(lagoon.alive).toBe(false);
    expect(lagoon.hp).toBe(0);
    expect(lagoon.respawnAtTick).toBe(respawnAt);
    expect(lagoon.profile.cosmetics.classId).toBe('allrounder');
    ticks(harness, RESPAWN_TICKS + 2);
    expect(lagoon.alive).toBe(true);
    expect(lagoon.profile.cosmetics.classId).toBe('heavy');
    expect(lagoon.pendingProfile).toBeNull();
  });

  test('a class change while alive away from the spawn waits for the next respawn', async () => {
    const harness = await createConquestRoom(false);
    const alpine = addDummy(harness, 'alpine');
    const lagoon = addDummy(harness, 'lagoon');
    ticks(harness, 150);
    walkAway(lagoon);
    harness.internal.damagePlayer(lagoon, alpine, 40, null, false);
    const hp = lagoon.hp;
    const protection = lagoon.spawnProtectionUntil;
    wardrobe(harness, lagoon, 'heavy');
    expect(lagoon.profile.cosmetics.classId).toBe('allrounder');
    expect(lagoon.hp).toBe(hp);
    expect(lagoon.spawnProtectionUntil).toBe(protection);
    expect(lagoon.pendingProfile?.cosmetics.classId).toBe('heavy');
    // Spamming updates neither heals nor renews the immunity.
    for (let index = 0; index < 5; index += 1) wardrobe(harness, lagoon, index % 2 === 0 ? 'infiltrator' : 'heavy');
    expect(lagoon.hp).toBe(hp);
    expect(lagoon.spawnProtectionUntil).toBe(protection);
    harness.internal.damagePlayer(lagoon, alpine, 10000, null, false);
    ticks(harness, RESPAWN_TICKS + 2);
    expect(lagoon.profile.cosmetics.classId).toBe('infiltrator');
  });

  test('fresh at the spawn, a class change applies at once without renewing protection', async () => {
    const harness = await createConquestRoom(false);
    const lagoon = addDummy(harness, 'lagoon');
    ticks(harness, 30);
    const protection = lagoon.spawnProtectionUntil;
    wardrobe(harness, lagoon, 'heavy');
    expect(lagoon.profile.cosmetics.classId).toBe('heavy');
    expect(lagoon.hp).toBe(220);
    expect(lagoon.spawnProtectionUntil).toBe(protection);
  });

  test('cosmetic-only changes apply live and leave health alone', async () => {
    const harness = await createConquestRoom(false);
    const alpine = addDummy(harness, 'alpine');
    const lagoon = addDummy(harness, 'lagoon');
    ticks(harness, 150);
    harness.internal.damagePlayer(lagoon, alpine, 50, null, false);
    const hp = lagoon.hp;
    const hair = (lagoon.profile.cosmetics.hairColorIndex + 1) % 8;
    wardrobe(harness, lagoon, 'allrounder', (profile) => {
      profile.cosmetics = { ...profile.cosmetics, hairColorIndex: hair };
    });
    expect(lagoon.profile.cosmetics.hairColorIndex).toBe(hair);
    expect(lagoon.hp).toBe(hp);
    expect(lagoon.alive).toBe(true);
  });
});

describe('immediate kit swaps are narrow', () => {
  test('a drifter switching to a combat class at its pad still waits and rebalances at respawn', async () => {
    const harness = await createConquestRoom(false);
    override('infiltrator', { countsTowardBalance: false });
    addDummy(harness, 'alpine');
    addDummy(harness, 'lagoon');
    addDummy(harness, 'lagoon');
    const drifter = addDummy(harness, 'lagoon', 'infiltrator');
    ticks(harness, 20);
    wardrobe(harness, drifter, 'allrounder');
    expect(drifter.profile.cosmetics.classId).toBe('infiltrator');
    expect(drifter.pendingProfile?.cosmetics.classId).toBe('allrounder');
    harness.internal.killPlayer(drifter, null, null, false);
    ticks(harness, RESPAWN_TICKS + 2);
    expect(drifter.profile.cosmetics.classId).toBe('allrounder');
    expect(drifter.profile.faction).toBe('alpine');
  });

  test('an untouchable drifter switching to a combat class redeploys at once, rebalanced', async () => {
    const harness = await createConquestRoom(false);
    override('infiltrator', { countsTowardBalance: false, damageable: false, targetable: false });
    addDummy(harness, 'alpine');
    addDummy(harness, 'lagoon');
    addDummy(harness, 'lagoon');
    const drifter = addDummy(harness, 'lagoon', 'infiltrator');
    ticks(harness, 20);
    walkAway(drifter);
    ticks(harness, 4 * PHYSICS_TICK_RATE);
    const deaths = drifter.deaths;
    wardrobe(harness, drifter, 'allrounder');
    expect(drifter.alive).toBe(true);
    expect(drifter.pendingProfile).toBeNull();
    expect(drifter.profile.cosmetics.classId).toBe('allrounder');
    expect(drifter.profile.faction).toBe('alpine');
    expect(drifter.deaths).toBe(deaths);
    const feet = drifter.character.position;
    expect(Math.hypot(feet.x - drifter.spawnPosition.x, feet.z - drifter.spawnPosition.z)).toBeLessThan(0.5);
    expect(harness.room.isCeasefire()).toBe(false);
  });

  test('a drifter switching during the results waits for the reset and rebalances', async () => {
    const harness = await createConquestRoom(false);
    override('infiltrator', { countsTowardBalance: false });
    addDummy(harness, 'alpine');
    addDummy(harness, 'lagoon');
    addDummy(harness, 'lagoon');
    const drifter = addDummy(harness, 'lagoon', 'infiltrator');
    ticks(harness, 20);
    harness.internal.conquest.devSetTickets('alpine', 0);
    ticks(harness, 2);
    expect(harness.room.isCeasefire()).toBe(true);
    wardrobe(harness, drifter, 'allrounder');
    expect(drifter.profile.cosmetics.classId).toBe('infiltrator');
    ticks(harness, 15 * PHYSICS_TICK_RATE + 2);
    expect(harness.room.isCeasefire()).toBe(false);
    expect(drifter.profile.cosmetics.classId).toBe('allrounder');
    expect(drifter.profile.faction).toBe('alpine');
  });

  test('no free swap once the player acted or the protection ran out; cooldowns carry over', async () => {
    const harness = await createConquestRoom(false);
    const heavy = addDummy(harness, 'lagoon', 'heavy');
    ticks(harness, 10);
    internals(harness).useSkill(heavy, 1);
    const cooldowns = [...heavy.skillCooldowns];
    expect(cooldowns[1]).toBeGreaterThan(0);
    wardrobe(harness, heavy, 'heavy', (profile) => {
      profile.loadout = { ...profile.loadout, gimmick: profile.loadout.gimmick === 'horn' ? 'halberd' : 'horn' };
    });
    expect(heavy.pendingProfile).not.toBeNull();
    expect(heavy.skillCooldowns).toEqual(cooldowns);

    const fresh = addDummy(harness, 'lagoon', 'allrounder');
    press(harness, fresh);
    ticks(harness, 130);
    wardrobe(harness, fresh, 'heavy');
    expect(fresh.profile.cosmetics.classId).toBe('allrounder');
    expect(fresh.pendingProfile?.cosmetics.classId).toBe('heavy');
  });

  test('a class picked in the menu wardrobe applies before Play, long after the join', async () => {
    const harness = await createConquestRoom(false);
    const player = addDummy(harness, 'lagoon', 'allrounder');
    ticks(harness, 5 * PHYSICS_TICK_RATE);
    wardrobe(harness, player, 'heavy');
    expect(player.pendingProfile).toBeNull();
    expect(player.profile.cosmetics.classId).toBe('heavy');
    // Play Now sends nothing; the first pressed input then plays the new class.
    press(harness, player);
    ticks(harness, 2);
    expect(player.profile.cosmetics.classId).toBe('heavy');
    expect(player.alive).toBe(true);
  });

  test('a swap that does apply keeps the cooldowns and ends the old class cloak', async () => {
    const harness = await createConquestRoom(false);
    const sneak = addDummy(harness, 'lagoon', 'infiltrator');
    ticks(harness, 10);
    harness.internal.conquest.devSetTickets('alpine', 0);
    ticks(harness, 2);
    sneak.skillCooldowns = [5, 0, 7];
    internals(harness).players.get(sneak.id)!.cloakUntilTick = harness.internal.physicsTick + 300;
    wardrobe(harness, sneak, 'heavy');
    expect(sneak.profile.cosmetics.classId).toBe('heavy');
    expect(sneak.skillCooldowns).toEqual([5, 0, 7]);
    expect(internals(harness).players.get(sneak.id)!.cloakUntilTick).toBe(0);
  });

  test('a deferred change tells the owner it applies at the next respawn', async () => {
    const harness = await createConquestRoom(false);
    const player = addDummy(harness, 'lagoon');
    const notices: number[] = [];
    if (!player.socket) throw new Error('Dummy without socket.');
    player.socket.send = (data: string | ArrayBuffer | Uint8Array) => {
      const event = data instanceof ArrayBuffer ? decodeGameEvent(data) : null;
      if (event?.eventType === 'PROFILE_NOTICE') notices.push(event.paramValue);
    };
    ticks(harness, 150);
    walkAway(player);
    wardrobe(harness, player, 'heavy');
    expect(notices).toEqual([1]);
  });
});

describe('capability flags', () => {
  test('leaving a non-balancing class (drifter) for a combat class rebalances the teams at respawn', async () => {
    const harness = await createConquestRoom(false);
    override('infiltrator', { countsTowardBalance: false });
    addDummy(harness, 'alpine');
    addDummy(harness, 'lagoon');
    addDummy(harness, 'lagoon');
    const drifter = addDummy(harness, 'lagoon', 'infiltrator');
    ticks(harness, 150);
    walkAway(drifter);
    wardrobe(harness, drifter, 'allrounder');
    expect(drifter.profile.faction).toBe('lagoon');
    harness.internal.killPlayer(drifter, null, null, false);
    ticks(harness, RESPAWN_TICKS + 2);
    // Lagoon already had two combat players against one: the newcomer joins the Peak Guard.
    expect(drifter.profile.cosmetics.classId).toBe('allrounder');
    expect(drifter.profile.faction).toBe('alpine');
  });

  test("a projectile vanishes once its owner's class is unarmed", async () => {
    const harness = await createConquestRoom(false);
    const shooter = addDummy(harness, 'alpine');
    const shot = (): void => {
      harness.internal.projectiles.push({
        ownerId: shooter.id,
        position: { x: 0, y: 125, z: 0 },
        velocity: { x: 0, y: 6, z: 0 },
        damage: 10,
        splashRadius: 2,
        weaponId: 'bazooka',
        expiresAtTick: harness.internal.physicsTick + 600,
      });
    };
    shot();
    ticks(harness, 1);
    expect(harness.internal.projectiles.length).toBe(1);
    harness.internal.projectiles.length = 0;
    shot();
    override('allrounder', { armed: false });
    ticks(harness, 1);
    expect(harness.internal.projectiles.length).toBe(0);
  });

  test('bots drop rivals that became untouchable', async () => {
    const harness = await createConquestRoom(true);
    const bots = [...harness.internal.players.values()].filter((player) => player.isBot);
    const hunter = bots.find((bot) => bot.profile.faction === 'alpine');
    if (!hunter) throw new Error('No alpine bot.');
    for (const bot of bots) {
      if (bot.id === hunter.id) continue;
      (harness.internal.physics as { removeCharacter(character: unknown): void }).removeCharacter(bot.character);
      harness.internal.players.delete(bot.id);
    }
    const rival = addDummy(harness, 'lagoon', 'heavy');
    ticks(harness, 150);
    const feet = hunter.character.position;
    place(rival, { x: feet.x + 6, y: feet.y + 0.3, z: feet.z });
    expect(harness.internal.selectBotTarget(hunter)).toBe(rival.id);
    override('heavy', { targetable: false });
    expect(harness.internal.selectBotTarget(hunter)).toBe(0);
  });
});

export type { Faction };
