/**
 * Package 3G — the untouchable drifter class (Creepy Mountain Girl / Hot
 * Beach Girl): immunity, pass-through, walk-only motor, water hover, team
 * placement, bot exclusion, prediction determinism and the supply aura.
 *
 *   bun test apps/server/test
 */
import RAPIER from '@dimforge/rapier3d-compat';
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import {
  CLASS_STATS,
  DRIFTER_AURA,
  FJORD_MAP,
  DRIFTER_FORM_AVAILABLE,
  DRIFTER_TUNING,
  InputButton,
  PHYSICS_TICK_RATE,
  PhysicsWorld,
  SKILLS,
  WATER_LEVEL,
  WEAPON_STATS,
  WORLD_COLLISION_GROUP,
  classCapabilities,
  colliderHeightAt,
  createDefaultProfile,
  decodeProfileMessage,
  decodeSnapshot,
  encodeProfileMessage,
  encodeSnapshot,
  resolveClassForFaction,
  sampleMapHeight,
  type PlayerInput,
  type Vec3,
} from '@frost-and-flamingos/shared';
import {
  aimAt,
  createRoom,
  eventsFor,
  findDeepWater,
  findFlat,
  findGentleShores,
  findSteepShores,
  STEEP_SHORE_REPROS,
  join,
  place,
  run,
  type Harness,
  type Joined,
  type TestPlayer,
} from './harness';

// Physics worlds and long tick runs are slow on a shared CI/dev box.
setDefaultTimeout(120_000);

const B = InputButton;
const SECOND = PHYSICS_TICK_RATE;

interface ShockwaveInternals {
  applyMascotShockwave(player: TestPlayer, kind: 'stomp' | 'pound', position: Vec3): void;
  ringCowbell(player: TestPlayer): void;
  spillMilk(player: TestPlayer, position: Vec3): void;
  resolveMascotRams(): void;
}

function horizontalSpeed(player: TestPlayer): number {
  const velocity = player.character.velocity;
  return Math.hypot(velocity.x, velocity.z);
}

function chest(player: TestPlayer): Vec3 {
  const feet = player.character.position;
  return { x: feet.x, y: feet.y + 1.05, z: feet.z };
}

/** Low on the body: well below the head sphere, so a sniper round is never a headshot kill. */
function hips(player: TestPlayer, lift = 0.62): Vec3 {
  const feet = player.character.position;
  return { x: feet.x, y: feet.y + lift, z: feet.z };
}

let harness: Harness;
let spot: { x: number; z: number };

beforeAll(async () => {
  harness = await createRoom();
  spot = findFlat(-120, -60);
});

afterAll(() => {
  harness.room.stop();
});

/** Fresh players for one test; the room is shared, so everyone leaves afterwards. */
function cast(entries: Array<[string, Parameters<typeof join>[2], Parameters<typeof join>[3]]>): Joined[] {
  return entries.map(([name, classId, faction]) => join(harness, name, classId, faction));
}

function dismiss(joined: Joined[]): void {
  for (const entry of joined) harness.room.leaveBySocket(entry.socket);
  harness.events.length = 0;
}

describe('drifter class config', () => {
  test('capabilities: unarmed, skill-less, untouchable, cannot capture, no team weight, bots never pick', () => {
    const caps = classCapabilities('drifter');
    expect(caps).toEqual({
      armed: false,
      skills: false,
      damageable: false,
      targetable: false,
      canCapture: false,
      countsTowardBalance: false,
      botsMayPick: false,
    });
    expect(classCapabilities('allrounder').canCapture).toBe(true);
    expect(CLASS_STATS.drifter.moveSpeed).toBeLessThan(CLASS_STATS.allrounder.moveSpeed);
    expect(DRIFTER_FORM_AVAILABLE.mountain_girl).toBe(true);
  });

  test('protocol: profile and snapshot round-trip the drifter, support points and aura flags', () => {
    const profile = { ...createDefaultProfile('Ghost', 'drifter'), faction: 'alpine' as const };
    const decoded = decodeProfileMessage(encodeProfileMessage({ playerId: 7, profile }));
    expect(decoded?.profile.cosmetics.classId).toBe('drifter');

    const players = cast([['Wire Ghost', 'drifter', 'alpine'], ['Wire Mate', 'allrounder', 'alpine']]);
    const ghost = players[0]!.player;
    ghost.support = 1234;
    ghost.auraActive = true;
    players[1]!.player.auraHealed = true;
    players[1]!.player.auraResupplied = true;
    const snapshot = decodeSnapshot(encodeSnapshot(harness.internal.buildSnapshot()));
    const wireGhost = snapshot?.players.find((entry) => entry.id === ghost.id);
    const wireMate = snapshot?.players.find((entry) => entry.id === players[1]!.player.id);
    expect(wireGhost?.classId).toBe('drifter');
    expect(wireGhost?.support).toBe(1234);
    expect(wireGhost?.auraActive).toBe(true);
    expect(wireGhost?.ammo).toBe(0);
    expect(wireMate?.auraHealed).toBe(true);
    expect(wireMate?.auraResupplied).toBe(true);
    expect(wireMate?.auraActive).toBe(false);
    dismiss(players);
  });
});

describe('untouchable', () => {
  test('immune to hitscan, pellets, projectiles, splash, melee, skills, rams, shockwaves, daze and puddles', () => {
    const players = cast([
      ['Ghost', 'drifter', 'alpine'],
      ['Gunner', 'allrounder', 'lagoon'],
      ['Bruiser', 'heavy', 'lagoon'],
      ['Smoker', 'infiltrator', 'lagoon'],
      ['Nut', 'mascot', 'lagoon'],
      ['Cow', 'mascot', 'alpine'],
    ]);
    const [ghostJ, gunnerJ, bruiserJ, smokerJ, nutJ] = players as [Joined, Joined, Joined, Joined, Joined];
    const ghost = ghostJ.player;
    const gunner = gunnerJ.player;
    place(ghost, spot.x, spot.z);
    place(gunner, spot.x, spot.z + 8);
    place(bruiserJ.player, spot.x + 1.5, spot.z);
    place(smokerJ.player, spot.x - 1.5, spot.z);
    place(nutJ.player, spot.x, spot.z + 2);
    run(harness, 10);
    const start = { ...ghost.character.position };
    const room = harness.internal;
    const shock = room as unknown as ShockwaveInternals;

    // Hitscan (every primary/secondary), pellets and melee from point blank.
    for (const weapon of ['smg', 'lmg', 'sniper', 'shotgun', 'silenced_pistol', 'knife'] as const) {
      gunner.profile = { ...gunner.profile, loadout: { ...gunner.profile.loadout, primary: weapon } };
      gunner.ammo[0] = { magazine: 10, reserve: 10 };
      gunner.activeSlot = 1;
      place(gunner, spot.x, spot.z + (weapon === 'knife' ? 1.2 : 8));
      run(harness, 2);
      aimAt(gunner, chest(ghost));
      gunner.lastFireTick = -999;
      room.tryFire(gunner, room.snapshotTick);
    }
    // Bazooka projectile at her and its splash.
    gunner.profile = { ...gunner.profile, loadout: { ...gunner.profile.loadout, secondary: 'bazooka' } };
    gunner.ammo[1] = { magazine: 1, reserve: 6 };
    gunner.activeSlot = 2;
    place(gunner, spot.x, spot.z + 12);
    run(harness, 2);
    aimAt(gunner, chest(ghost));
    gunner.lastFireTick = -999;
    room.tryFire(gunner, room.snapshotTick);
    run(harness, 40);
    room.explode(gunner, ghost.character.position, 200, 6);
    // Direct damage call and class skills (AoE, slow).
    room.damagePlayer(ghost, gunner, 999, null, true);
    for (const [caster, index] of [[gunner, 2], [bruiserJ.player, 1], [bruiserJ.player, 2], [smokerJ.player, 1]] as const) {
      caster.lastInput = { ...caster.lastInput };
      (caster as unknown as { skillCooldowns: number[] }).skillCooldowns = [0, 0, 0];
      room.useSkill(caster, index);
    }
    // Mascot shockwaves, cowbell daze, milk puddle.
    shock.applyMascotShockwave(nutJ.player, 'pound', ghost.character.position);
    shock.applyMascotShockwave(nutJ.player, 'stomp', ghost.character.position);
    shock.ringCowbell(nutJ.player);
    shock.spillMilk(nutJ.player, ghost.character.position);
    run(harness, 5);

    expect(ghost.alive).toBe(true);
    expect(ghost.hp).toBe(CLASS_STATS.drifter.maxHp);
    expect(ghost.deaths).toBe(0);
    expect(ghost.slowUntilTick).toBe(0);
    expect(ghost.dazedUntilTick).toBe(0);
    expect(ghost.character.isSlippery).toBe(false);
    expect(ghost.character.launchSeconds).toBe(0);
    expect(eventsFor(harness, 'COMIC_HIT', ghost.id).filter((event) => event.targetId === ghost.id)).toHaveLength(0);
    expect(eventsFor(harness, 'KILL_RAGDOLL', ghost.id)).toHaveLength(0);
    // The shots really happened (weapon fired events) and she never moved.
    expect(harness.events.filter((event) => event.eventType === 'WEAPON_FIRED').length).toBeGreaterThanOrEqual(7);
    expect(Math.hypot(ghost.character.position.x - start.x, ghost.character.position.z - start.z)).toBeLessThan(0.05);
    dismiss(players);
  });

  test('a charging mascot runs straight through her: no ram, no bump, no slow-down', () => {
    const players = cast([['Ghost', 'drifter', 'alpine'], ['Nut', 'mascot', 'lagoon'], ['Moo', 'mascot', 'alpine']]);
    const [ghostJ, nutJ, cowJ] = players as [Joined, Joined, Joined];
    const lane = findFlat(spot.x + 60, spot.z, 14);
    place(ghostJ.player, lane.x, lane.z + 10);
    place(nutJ.player, lane.x, lane.z - 6);
    place(cowJ.player, lane.x + 3, lane.z - 6);
    // Coconut (enemy) and cow (teammate: friendly bump path) roll/trot north through her.
    run(harness, 150, [
      { joined: nutJ, buttons: B.Forward, yaw: 0 },
      { joined: cowJ, buttons: B.Forward, yaw: 0 },
    ]);
    const nut = nutJ.player;
    expect(nut.character.position.z).toBeGreaterThan(lane.z + 12);
    expect(eventsFor(harness, 'MASCOT_RAM', ghostJ.player.id)).toHaveLength(0);
    expect(ghostJ.player.hp).toBe(CLASS_STATS.drifter.maxHp);
    expect(ghostJ.player.character.launchSeconds).toBe(0);
    dismiss(players);
  });

  test('out-of-world respawn teleports her safely and she stays alive', () => {
    const players = cast([['Ghost', 'drifter', 'alpine']]);
    const ghost = players[0]!.player;
    place(ghost, spot.x, spot.z, -30);
    run(harness, 3);
    expect(ghost.alive).toBe(true);
    expect(ghost.character.position.y).toBeGreaterThan(-5);
    expect(ghost.deaths).toBe(0);
    dismiss(players);
  });
});

describe('pass-through', () => {
  test('bullets and rockets pass through her and hit the enemy behind her', () => {
    const players = cast([['Ghost', 'drifter', 'alpine'], ['Shield', 'allrounder', 'alpine'], ['Gunner', 'infiltrator', 'lagoon']]);
    const [ghostJ, behindJ, gunnerJ] = players as [Joined, Joined, Joined];
    const ghost = ghostJ.player;
    const behind = behindJ.player;
    const gunner = gunnerJ.player;
    place(gunner, spot.x, spot.z + 14);
    place(ghost, spot.x, spot.z + 7);
    place(behind, spot.x, spot.z);
    run(harness, 12);
    // Sniper (near-zero spread) through her chest into the teammate's chest.
    gunner.profile = { ...gunner.profile, loadout: { ...gunner.profile.loadout, primary: 'sniper' } };
    gunner.ammo[0] = { magazine: 5, reserve: 25 };
    gunner.activeSlot = 1;
    aimAt(gunner, hips(behind));
    gunner.lastFireTick = -999;
    harness.internal.tryFire(gunner, harness.internal.snapshotTick);
    const hpAfterShot = behind.hp;
    expect(hpAfterShot).toBeLessThan(CLASS_STATS.allrounder.maxHp);
    expect(ghost.hp).toBe(CLASS_STATS.drifter.maxHp);
    const hit = harness.events.find((event) => event.eventType === 'COMIC_HIT');
    expect(hit?.targetId).toBe(behind.id);

    // Bazooka: the rocket flies through her and bursts on the soldier behind.
    behind.hp = CLASS_STATS.allrounder.maxHp;
    gunner.profile = { ...gunner.profile, loadout: { ...gunner.profile.loadout, secondary: 'bazooka' } };
    gunner.ammo[1] = { magazine: 1, reserve: 6 };
    gunner.activeSlot = 2;
    // Aimed high on the soldier: the rocket drops ~0.8 m over the 14 m flight.
    aimAt(gunner, hips(behind, 1.45));
    gunner.lastFireTick = -999;
    harness.events.length = 0;
    harness.internal.tryFire(gunner, harness.internal.snapshotTick);
    run(harness, 30);
    const burst = harness.events.find((event) => event.eventType === 'PROP_EXPLODE');
    expect(burst).toBeDefined();
    // The burst is at the soldier (≈0 m from him), not at the drifter 7 m in front.
    expect(Math.hypot((burst?.paramX ?? 0) - behind.character.position.x, (burst?.paramZ ?? 0) - behind.character.position.z)).toBeLessThan(2.5);
    expect(behind.hp).toBeLessThan(CLASS_STATS.allrounder.maxHp);
    expect(ghost.hp).toBe(CLASS_STATS.drifter.maxHp);
    dismiss(players);
  });

  test('players walk through her and she walks through players (no character contact)', () => {
    const players = cast([['Ghost', 'drifter', 'alpine'], ['Walker', 'heavy', 'lagoon'], ['Post', 'heavy', 'lagoon']]);
    const [ghostJ, walkerJ, postJ] = players as [Joined, Joined, Joined];
    const lane = findFlat(spot.x - 60, spot.z + 40, 14);
    place(ghostJ.player, lane.x, lane.z);
    place(walkerJ.player, lane.x, lane.z - 6);
    place(postJ.player, lane.x + 4, lane.z + 6);
    run(harness, 6);
    // The heavy walks north straight through the standing drifter…
    run(harness, 150, [{ joined: walkerJ, buttons: B.Forward, yaw: 0 }]);
    expect(walkerJ.player.character.position.z).toBeGreaterThan(lane.z + 6);
    // …and the drifter walks east straight through the standing heavy.
    place(ghostJ.player, lane.x - 4, lane.z + 6);
    run(harness, 4);
    // 12 m at her walking pace covers the 10 m to the far side of the heavy.
    run(harness, Math.ceil((12 / DRIFTER_TUNING.walkSpeed) * SECOND), [{ joined: ghostJ, buttons: B.Forward, yaw: Math.PI / 2 }]);
    expect(ghostJ.player.character.position.x).toBeGreaterThan(lane.x + 6);
    expect(Math.abs(postJ.player.character.position.x - (lane.x + 4))).toBeLessThan(0.05);
    dismiss(players);
  });
});

describe('walk-only motor', () => {
  test('calm walk speed; Shift, Space, C and roll do nothing; long falls drift down slowly', () => {
    const players = cast([['Ghost', 'drifter', 'alpine']]);
    const ghostJ = players[0]!;
    const ghost = ghostJ.player;
    const lane = findFlat(spot.x + 30, spot.z - 50, 14);
    place(ghost, lane.x, lane.z);
    run(harness, 6);
    let maxSpeed = 0;
    let maxRise = 0;
    for (let tick = 0; tick < 180; tick += 1) {
      const buttons = B.Forward | B.Sprint | (tick % 20 === 0 ? B.Jump : 0) | (tick % 30 === 5 ? B.Crouch : 0);
      run(harness, 1, [{ joined: ghostJ, buttons, yaw: 0 }]);
      maxSpeed = Math.max(maxSpeed, horizontalSpeed(ghost));
      maxRise = Math.max(maxRise, ghost.character.velocity.y);
      expect(ghost.character.crouched).toBe(false);
      expect(ghost.character.rolling).toBe(false);
      expect(ghost.character.sprinting).toBe(false);
    }
    expect(maxSpeed).toBeLessThanOrEqual(DRIFTER_TUNING.walkSpeed + 0.05);
    expect(maxSpeed).toBeGreaterThan(DRIFTER_TUNING.walkSpeed - 0.3);
    expect(maxRise).toBeLessThan(0.5);

    // Dropped from 40 m: she never falls faster than the ghostly descent cap and opens no parachute.
    const drop = place(ghost, lane.x, lane.z, sampleMapHeight(lane.x, lane.z) + 40);
    let fastest = 0;
    for (let tick = 0; tick < 4 * SECOND; tick += 1) {
      run(harness, 1, [{ joined: ghostJ, buttons: B.Jump, yaw: 0 }]);
      fastest = Math.min(fastest, ghost.character.velocity.y);
      expect(ghost.character.parachuteState).toBe(0);
    }
    expect(fastest).toBeGreaterThanOrEqual(-DRIFTER_TUNING.maxFallSpeed - 0.01);
    expect(drop.y - ghost.character.position.y).toBeGreaterThan(8);
    expect(ghost.alive).toBe(true);
    dismiss(players);
  });

  test('over deep water she hovers on the surface, walks on it and never swims', () => {
    const players = cast([['Ghost', 'drifter', 'alpine'], ['Swimmer', 'allrounder', 'alpine']]);
    const [ghostJ, swimmerJ] = players as [Joined, Joined];
    const sea = findDeepWater();
    place(ghostJ.player, sea.x, sea.z, WATER_LEVEL + 3);
    place(swimmerJ.player, sea.x + 5, sea.z, WATER_LEVEL + 3);
    run(harness, 3 * SECOND);
    const floor = WATER_LEVEL + DRIFTER_TUNING.waterHoverHeight;
    expect(ghostJ.player.character.position.y).toBeCloseTo(floor, 3);
    expect(ghostJ.player.character.swimming).toBe(false);
    expect(ghostJ.player.character.grounded).toBe(true);
    expect(swimmerJ.player.character.swimming).toBe(true);
    const before = { ...ghostJ.player.character.position };
    run(harness, 2 * SECOND, [{ joined: ghostJ, buttons: B.Forward, yaw: Math.atan2(-sea.x, -sea.z) }]);
    const after = ghostJ.player.character.position;
    expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeGreaterThan(DRIFTER_TUNING.walkSpeed * 1.5);
    if (sampleMapHeight(after.x, after.z) < WATER_LEVEL) expect(after.y).toBeCloseTo(floor, 3);
    expect(ghostJ.player.character.swimming).toBe(false);
    expect(ghostJ.player.alive).toBe(true);
    dismiss(players);
  });

  test('walking up and down gentle beaches her feet never dip below the water surface', () => {
    const players = cast([['Ghost', 'drifter', 'alpine']]);
    const ghostJ = players[0]!;
    const ghost = ghostJ.player;
    const reach = 8;
    const shores = findGentleShores(12, reach);
    expect(shores.length).toBeGreaterThanOrEqual(3);
    // Long enough at walking pace to cross from `reach` m out to `reach` m up the beach.
    const crossingTicks = Math.ceil(((reach * 2 + 1) / DRIFTER_TUNING.walkSpeed) * SECOND);
    let crossings = 0;
    let below = 0;
    let lowest = Infinity;
    let maxPop = 0;
    for (const shore of shores) {
      place(ghost, shore.x - shore.dirX * reach, shore.z - shore.dirZ * reach, WATER_LEVEL + 0.5);
      run(harness, SECOND / 2);
      const uphill = Math.atan2(shore.dirX, shore.dirZ);
      for (const yaw of [uphill, uphill + Math.PI]) {
        let lastY = ghost.character.position.y;
        for (let tick = 0; tick < crossingTicks; tick += 1) {
          run(harness, 1, [{ joined: ghostJ, buttons: B.Forward, yaw }]);
          const y = ghost.character.position.y;
          if (y < WATER_LEVEL - 0.005) below += 1;
          lowest = Math.min(lowest, y);
          maxPop = Math.max(maxPop, Math.abs(y - lastY));
          lastY = y;
        }
        crossings += 1;
      }
    }
    console.log('[3G shore]', JSON.stringify({ shores: shores.length, crossings, ticksBelowWater: below, lowest, maxPop }));
    expect(below).toBe(0);
    expect(maxPop).toBeLessThan(0.15);
    expect(ghost.alive).toBe(true);
    dismiss(players);
  });

  test('across steep shore cells (collider under water, sampled height dry) she never wades under', () => {
    const players = cast([['Ghost', 'drifter', 'alpine']]);
    const ghostJ = players[0]!;
    const ghost = ghostJ.player;
    const shores = findSteepShores(9);
    expect(shores.length).toBeGreaterThan(STEEP_SHORE_REPROS.length);
    // Through each point from 8 headings: 5 m before it to 5 m past it.
    const approach = 5;
    const walkTicks = Math.ceil(((approach * 2) / DRIFTER_TUNING.walkSpeed) * SECOND);
    let crossings = 0;
    let below = 0;
    let lowest = Infinity;
    let maxStep = 0;
    const progress: number[] = [];
    for (const shore of shores) {
      for (let heading = 0; heading < 8; heading += 1) {
        const yaw = (heading / 8) * Math.PI * 2;
        const startX = shore.x - Math.sin(yaw) * approach;
        const startZ = shore.z - Math.cos(yaw) * approach;
        place(ghost, startX, startZ, Math.max(colliderHeightAt(startX, startZ), WATER_LEVEL) + 0.4);
        run(harness, SECOND / 2);
        let lastY = ghost.character.position.y;
        const from = { ...ghost.character.position };
        for (let tick = 0; tick < walkTicks; tick += 1) {
          run(harness, 1, [{ joined: ghostJ, buttons: B.Forward, yaw }]);
          const y = ghost.character.position.y;
          if (y < WATER_LEVEL - 0.005) below += 1;
          lowest = Math.min(lowest, y);
          maxStep = Math.max(maxStep, Math.abs(y - lastY));
          lastY = y;
        }
        const to = ghost.character.position;
        progress.push(Math.hypot(to.x - from.x, to.z - from.z) / (approach * 2));
        crossings += 1;
      }
    }
    progress.sort((a, b) => a - b);
    const median = progress[Math.floor(progress.length / 2)] ?? 0;
    console.log('[3G steep shore]', JSON.stringify({ shores: shores.length, crossings, ticksBelowWater: below, lowest, maxStep, progressMin: progress[0], progressMedian: median }));
    expect(below).toBe(0);
    // Step-downs of up to ~0.5 m on steep banks are cosmetic (accepted).
    expect(maxStep).toBeLessThan(0.55);
    // She keeps walking: no crossing stalls outright (a few headings meet
    // rock or a bank steeper than her climb limit), and most cover nearly
    // the full distance.
    expect(progress[0] ?? 0).toBeGreaterThan(0.1);
    expect(median).toBeGreaterThan(0.8);
    expect(ghost.alive).toBe(true);
    dismiss(players);
  });

  test('steps up onto a 0.3 m kerb at walking pace (autostep intact)', () => {
    const players = cast([['Ghost', 'drifter', 'alpine']]);
    const ghostJ = players[0]!;
    const ghost = ghostJ.player;
    const site = findFlat(spot.x + 70, spot.z + 70, 14);
    const kerbCentre = { x: site.x, z: site.z + 4 };
    const top = colliderHeightAt(kerbCentre.x, kerbCentre.z) + 0.3;
    const world = harness.internal.physics.world;
    // 4 x 4 m box, 0.3 m proud of the ground, 2 m ahead of her.
    const kerb = world.createCollider(
      RAPIER.ColliderDesc.cuboid(2, 0.25, 2)
        .setTranslation(kerbCentre.x, top - 0.25, kerbCentre.z)
        .setCollisionGroups(WORLD_COLLISION_GROUP),
    );
    place(ghost, site.x, site.z);
    run(harness, SECOND / 2);
    // 4 m north: over the kerb's edge to its middle.
    run(harness, Math.ceil((4 / DRIFTER_TUNING.walkSpeed) * SECOND), [{ joined: ghostJ, buttons: B.Forward, yaw: 0 }]);
    const feet = ghost.character.position;
    world.removeCollider(kerb, false);
    console.log('[3G kerb]', JSON.stringify({ feetY: feet.y, top, z: feet.z - site.z }));
    expect(feet.z - site.z).toBeGreaterThan(2.5);
    expect(Math.abs(feet.y - top)).toBeLessThan(0.08);
    dismiss(players);
  });

  test('walks onto the lagoon dock from its side (autostep onto the deck)', () => {
    const players = cast([['Ghost', 'drifter', 'lagoon']]);
    const ghostJ = players[0]!;
    const ghost = ghostJ.player;
    const dock = FJORD_MAP.props.find((prop) => prop.id === 'lagoon_dock');
    expect(dock).toBeDefined();
    const deck = dock?.colliders.find((collider) => collider.type === 'box');
    if (!dock || !deck || deck.type !== 'box') throw new Error('lagoon_dock has no deck box');
    const cos = Math.cos(dock.rotationY);
    const sin = Math.sin(dock.rotationY);
    const centre = {
      x: dock.position.x + deck.offset.x * cos + deck.offset.z * sin,
      z: dock.position.z - deck.offset.x * sin + deck.offset.z * cos,
    };
    const top = dock.position.y + deck.offset.y + deck.halfExtents.y;
    // The deck's local x axis in world space; start 1.5 m off its side edge.
    const yaw = dock.rotationY + (deck.rotation?.y ?? 0);
    const axis = { x: Math.cos(yaw), z: -Math.sin(yaw) };
    const start = { x: centre.x - axis.x * (deck.halfExtents.x + 1.5), z: centre.z - axis.z * (deck.halfExtents.x + 1.5) };
    place(ghost, start.x, start.z, Math.max(colliderHeightAt(start.x, start.z), WATER_LEVEL + DRIFTER_TUNING.waterHoverHeight) + 0.3);
    run(harness, SECOND);
    const walk = Math.ceil(((deck.halfExtents.x + 1.5) / DRIFTER_TUNING.walkSpeed) * SECOND);
    run(harness, walk, [{ joined: ghostJ, buttons: B.Forward, yaw: Math.atan2(axis.x, axis.z) }]);
    const feet = ghost.character.position;
    const travelled = Math.hypot(feet.x - start.x, feet.z - start.z);
    console.log('[3G dock]', JSON.stringify({ feetY: feet.y, top, travelled, ticks: walk }));
    expect(travelled).toBeGreaterThan(deck.halfExtents.x);
    expect(Math.abs(feet.y - top)).toBeLessThan(0.1);
    dismiss(players);
  });

  test('walks up a 30 degree slope at nearly her full pace', () => {
    const players = cast([['Ghost', 'drifter', 'alpine']]);
    const ghostJ = players[0]!;
    const ghost = ghostJ.player;
    const site = findFlat(spot.x - 50, spot.z + 90, 14);
    const angle = Math.PI / 6;
    const half = { x: 1.5, y: 0.1, z: 4 };
    const ground = colliderHeightAt(site.x, site.z + 1);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    // A ramp rising north whose top face starts at ground level 1 m ahead of the site.
    const centre = { x: site.x, y: ground - cos * half.y + sin * half.z, z: site.z + 1 + sin * half.y + cos * half.z };
    const world = harness.internal.physics.world;
    const ramp = world.createCollider(
      RAPIER.ColliderDesc.cuboid(half.x, half.y, half.z)
        .setTranslation(centre.x, centre.y, centre.z)
        .setRotation({ x: Math.sin(-angle / 2), y: 0, z: 0, w: Math.cos(-angle / 2) })
        .setCollisionGroups(WORLD_COLLISION_GROUP),
    );
    // Start a quarter of the way up the top face.
    const s = -half.z / 2;
    place(ghost, centre.x, centre.z - sin * half.y + cos * s, centre.y + cos * half.y + sin * s + 0.05);
    run(harness, SECOND / 3);
    const from = { ...ghost.character.position };
    const seconds = 1.2;
    run(harness, Math.round(seconds * SECOND), [{ joined: ghostJ, buttons: B.Forward, yaw: 0 }]);
    const to = ghost.character.position;
    world.removeCollider(ramp, false);
    const travelled = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
    console.log('[3G ramp]', JSON.stringify({ travelled, climbed: to.y - from.y, expected: DRIFTER_TUNING.walkSpeed * seconds }));
    expect(to.y - from.y).toBeGreaterThan(0.5);
    expect(travelled).toBeGreaterThanOrEqual(0.7 * DRIFTER_TUNING.walkSpeed * seconds);
    dismiss(players);
  });

  test('colliderHeightAt matches the Rapier heightfield (downward rays)', async () => {
    const physics = await PhysicsWorld.create();
    const rayHeight = (x: number, z: number): number | null => {
      const ray = new RAPIER.Ray({ x, y: 200, z }, { x: 0, y: -1, z: 0 });
      const hit = physics.world.castRay(ray, 400, true, undefined, undefined, undefined, undefined, (collider) =>
        collider.shape.type === RAPIER.ShapeType.HeightField,
      );
      return hit ? 200 - hit.timeOfImpact : null;
    };
    let seed = 7;
    const random = (): number => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const points = [...STEEP_SHORE_REPROS];
    for (let index = 0; index < 4000; index += 1) points.push({ x: (random() - 0.5) * 796, z: (random() - 0.5) * 796 });
    let worst = 0;
    let worstSampled = 0;
    for (const point of points) {
      const height = rayHeight(point.x, point.z);
      expect(height).not.toBeNull();
      worst = Math.max(worst, Math.abs(colliderHeightAt(point.x, point.z) - (height ?? 0)));
      worstSampled = Math.max(worstSampled, Math.abs(sampleMapHeight(point.x, point.z) - (height ?? 0)));
    }
    console.log('[3G collider height]', JSON.stringify({ points: points.length, worst, worstSampled }));
    expect(worst).toBeLessThan(0.001);
    physics.dispose();
  });
});

describe('team placement and bots', () => {
  test('she joins her preferred available side, never counts toward balance, and falls back without a form', async () => {
    const local = await createRoom();
    const a1 = join(local, 'A1', 'allrounder', 'alpine');
    expect(a1.player.profile.faction).toBe('alpine');
    // A drifter always gets her Peak Guard form, even while the alps already lead…
    const ghost = join(local, 'Ghost', 'drifter', 'alpine');
    expect(ghost.player.profile.faction).toBe('alpine');
    expect(ghost.player.profile.cosmetics.classId).toBe('drifter');
    // …and adds no weight: 1 fighter v 0 → the next fighter is balanced to the lagoon.
    const l1 = join(local, 'L1', 'infiltrator', 'alpine');
    expect(l1.player.profile.faction).toBe('lagoon');
    // 1 v 1 with the drifter excluded is a tie, so the preference wins (counted, she would tip it).
    const a2 = join(local, 'A2', 'heavy', 'alpine');
    expect(a2.player.profile.faction).toBe('alpine');
    // Asking for the lagoon drifter while the Hot Beach Girl has not shipped.
    const beach = join(local, 'Beach', 'drifter', 'lagoon');
    expect(beach.player.profile.cosmetics.classId).toBe('drifter');
    expect(beach.player.profile.faction).toBe(DRIFTER_FORM_AVAILABLE.beach_girl ? 'lagoon' : 'alpine');
    // Two drifters on the alps still weigh nothing: 2 v 1 → the next fighter goes lagoon.
    const l2 = join(local, 'L2', 'allrounder', 'alpine');
    expect(l2.player.profile.faction).toBe('lagoon');
    // A lagoon fighter switching to the drifter in-round (faction fixed) falls back.
    const switched = { ...l1.player.profile, cosmetics: { ...l1.player.profile.cosmetics, classId: 'drifter' as const } };
    local.room.handleProfileUpdate(l1.socket, switched);
    expect(l1.player.profile.cosmetics.classId).toBe(DRIFTER_FORM_AVAILABLE.beach_girl ? 'drifter' : 'allrounder');
    expect(l1.player.character.drifter).toBe(DRIFTER_FORM_AVAILABLE.beach_girl ? 'beach_girl' : null);
    // A Peak Guard fighter may switch to the drifter in-round.
    const toGhost = { ...a1.player.profile, cosmetics: { ...a1.player.profile.cosmetics, classId: 'drifter' as const } };
    local.room.handleProfileUpdate(a1.socket, toGhost);
    expect(a1.player.profile.cosmetics.classId).toBe('drifter');
    expect(a1.player.character.drifter).toBe('mountain_girl');
    local.room.stop();
  });

  test('each side places its own drifter; a side whose form has not shipped falls back', async () => {
    const availability = DRIFTER_FORM_AVAILABLE as Record<'mountain_girl' | 'beach_girl', boolean>;
    const shipped = availability.beach_girl;
    try {
      availability.beach_girl = true;
      const both = await createRoom();
      const ghost = join(both, 'Ghost', 'drifter', 'alpine');
      const beach = join(both, 'Beach', 'drifter', 'lagoon');
      expect([ghost.player.profile.faction, ghost.player.character.drifter]).toEqual(['alpine', 'mountain_girl']);
      expect([beach.player.profile.faction, beach.player.character.drifter]).toEqual(['lagoon', 'beach_girl']);
      both.room.stop();

      availability.beach_girl = false;
      expect(resolveClassForFaction('drifter', 'lagoon')).toBe('allrounder');
      expect(resolveClassForFaction('drifter', 'alpine')).toBe('drifter');
      const local = await createRoom();
      // Asking for the lagoon drifter: she is placed on the side whose form exists.
      const asked = join(local, 'Asked', 'drifter', 'lagoon');
      expect([asked.player.profile.faction, asked.player.profile.cosmetics.classId]).toEqual(['alpine', 'drifter']);
      // A lagoon fighter switching to the drifter in-round (faction fixed) keeps a combat class.
      const fighter = join(local, 'Fighter', 'infiltrator', 'lagoon');
      expect(fighter.player.profile.faction).toBe('lagoon');
      const switched = { ...fighter.player.profile, cosmetics: { ...fighter.player.profile.cosmetics, classId: 'drifter' as const } };
      local.room.handleProfileUpdate(fighter.socket, switched);
      expect(fighter.player.profile.cosmetics.classId).toBe('allrounder');
      expect(fighter.player.character.drifter).toBeNull();
      local.room.stop();
    } finally {
      availability.beach_girl = shipped;
    }
  });

  test('bots never target her and never roll her class', async () => {
    const local = await createRoom(true);
    const bots = [...local.internal.players.values()].filter((player) => player.isBot);
    const lagoonBot = bots.find((bot) => bot.profile.faction === 'lagoon');
    if (!lagoonBot) throw new Error('no lagoon bot');
    // Every other alpine body is moved far away: the drifter is the only alpine in reach.
    const ghost = join(local, 'Ghost', 'drifter', 'alpine');
    for (const bot of bots) if (bot.profile.faction === 'alpine') place(bot, 300, -300);
    const lane = findFlat(-200, 100, 12);
    place(lagoonBot, lane.x, lane.z);
    place(ghost.player, lane.x, lane.z + 6);
    expect(local.internal.selectBotTarget(lagoonBot)).toBe(0);
    for (let roll = 0; roll < 400; roll += 1) {
      for (const bot of bots) {
        local.internal.rollBotClass(bot, bot.character.position);
        expect(bot.profile.cosmetics.classId).not.toBe('drifter');
      }
    }
    // A bot left to its brain for 4 s near her fires no shot at her.
    local.events.length = 0;
    for (let tick = 0; tick < 4 * SECOND; tick += 1) local.internal.tick();
    expect(local.events.filter((event) => event.eventType === 'COMIC_HIT' && event.targetId === ghost.player.id)).toHaveLength(0);
    expect(ghost.player.hp).toBe(CLASS_STATS.drifter.maxHp);
    local.room.stop();
  });
});

describe('supply aura', () => {
  function setup(): { ghost: Joined; mate: Joined; enemy: Joined; players: Joined[] } {
    const players = cast([['Ghost', 'drifter', 'alpine'], ['Mate', 'allrounder', 'alpine'], ['Enemy', 'allrounder', 'lagoon']]);
    const [ghost, mate, enemy] = players as [Joined, Joined, Joined];
    const lane = findFlat(spot.x - 40, spot.z - 40, 12);
    place(ghost.player, lane.x, lane.z);
    place(mate.player, lane.x + 3, lane.z);
    place(enemy.player, lane.x - 3, lane.z);
    harness.internal.tick();
    return { ghost, mate, enemy, players };
  }

  test('heals teammates out of combat at 8/s, capped, and earns 1 point per 10 vitality', () => {
    const { ghost, mate, enemy, players } = setup();
    const max = CLASS_STATS.allrounder.maxHp;
    mate.player.hp = 60;
    enemy.player.hp = 60;
    ghost.player.supportVitality = 0;
    ghost.player.support = 0;
    run(harness, 5 * SECOND);
    expect(mate.player.hp).toBeCloseTo(60 + DRIFTER_AURA.healPerSecond * 5, 3);
    expect(enemy.player.hp).toBe(60);
    expect(ghost.player.hp).toBe(CLASS_STATS.drifter.maxHp);
    expect(ghost.player.support).toBe(4);
    expect(mate.player.auraHealed).toBe(true);
    expect(ghost.player.auraActive).toBe(true);
    // Cap: never above the class maximum.
    run(harness, 15 * SECOND);
    expect(mate.player.hp).toBe(max);
    expect(mate.player.auraHealed).toBe(false);
    expect(ghost.player.supportVitality).toBeCloseTo(max - 60, 3);
    expect(ghost.player.support).toBe(Math.floor((max - 60) / DRIFTER_AURA.vitalityPerPoint));
    dismiss(players);
  });

  test('vitality waits for 3 s without damage', () => {
    const { ghost, mate, enemy, players } = setup();
    mate.player.hp = 100;
    harness.internal.damagePlayer(mate.player, enemy.player, 10, null, false);
    expect(mate.player.hp).toBe(90);
    run(harness, Math.round(DRIFTER_AURA.outOfCombatSeconds * SECOND) - 2);
    expect(mate.player.hp).toBe(90);
    run(harness, 1 * SECOND + 2);
    expect(mate.player.hp).toBeGreaterThan(90 + DRIFTER_AURA.healPerSecond * 0.9);
    expect(ghost.player.auraActive).toBe(true);
    dismiss(players);
  });

  test('radius: 6 m in, beyond 6 m out', () => {
    const { ghost, mate, players } = setup();
    const feet = ghost.player.character.position;
    place(mate.player, feet.x + DRIFTER_AURA.radius - 0.2, feet.z);
    mate.player.hp = 50;
    run(harness, SECOND);
    expect(mate.player.hp).toBeGreaterThan(50);
    place(mate.player, feet.x + DRIFTER_AURA.radius + 0.6, feet.z);
    mate.player.hp = 50;
    run(harness, SECOND);
    expect(mate.player.hp).toBe(50);
    dismiss(players);
  });

  test('a second drifter does not stack', () => {
    const { ghost, mate, players } = setup();
    const second = join(harness, 'Ghost 2', 'drifter', 'alpine');
    const feet = ghost.player.character.position;
    place(second.player, feet.x + 2, feet.z + 1);
    mate.player.hp = 50;
    run(harness, 2 * SECOND);
    expect(mate.player.hp).toBeCloseTo(50 + DRIFTER_AURA.healPerSecond * 2, 3);
    const total = ghost.player.supportVitality + second.player.supportVitality;
    expect(total).toBeCloseTo(DRIFTER_AURA.healPerSecond * 2, 3);
    dismiss([...players, second]);
  });

  test('reserve ammo: one magazine per 4 s per slot, never the magazine, gimmicks without reserve untouched, 1 point per magazine', () => {
    const { ghost, mate, enemy, players } = setup();
    mate.player.profile = {
      ...mate.player.profile,
      loadout: { primary: 'smg', secondary: 'shotgun', gimmick: 'snow_cannon' },
    };
    const smg = WEAPON_STATS.smg;
    const shotgun = WEAPON_STATS.shotgun;
    mate.player.ammo = [
      { magazine: 3, reserve: 0 },
      { magazine: 1, reserve: 0 },
      { magazine: 0, reserve: 0 },
    ];
    enemy.player.ammo = [
      { magazine: 3, reserve: 0 },
      { magazine: 1, reserve: 0 },
      { magazine: 0, reserve: 0 },
    ];
    ghost.player.supportMagazines = 0;
    ghost.player.supportVitality = 0;
    run(harness, Math.round(DRIFTER_AURA.magazineSeconds * SECOND));
    expect(mate.player.ammo[0]?.reserve).toBe(smg.magazine);
    expect(mate.player.ammo[1]?.reserve).toBe(shotgun.magazine);
    expect(mate.player.ammo[0]?.magazine).toBe(3);
    expect(mate.player.ammo[1]?.magazine).toBe(1);
    expect(mate.player.ammo[2]).toEqual({ magazine: 0, reserve: 0 });
    expect(enemy.player.ammo[0]?.reserve).toBe(0);
    expect(ghost.player.supportMagazines).toBeCloseTo(2, 6);
    expect(ghost.player.support).toBe(2);
    expect(mate.player.auraResupplied).toBe(true);
    // Never above the weapon's reserve maximum.
    run(harness, 30 * SECOND);
    expect(mate.player.ammo[0]?.reserve).toBe(smg.reserve);
    expect(mate.player.ammo[1]?.reserve).toBe(shotgun.reserve);
    expect(mate.player.auraResupplied).toBe(false);
    dismiss(players);
  });

  test('mascot teammates are healed but get no ammo; the skills table is untouched', () => {
    const players = cast([['Ghost', 'drifter', 'alpine'], ['Moo', 'mascot', 'alpine']]);
    const [ghost, cow] = players as [Joined, Joined];
    const feet = place(ghost.player, spot.x + 10, spot.z + 10);
    place(cow.player, feet.x + 2, feet.z);
    cow.player.hp = 100;
    run(harness, SECOND);
    expect(cow.player.hp).toBeGreaterThan(100);
    expect(cow.player.auraResupplied).toBe(false);
    expect(SKILLS.horn_charge.slot).toBe(1);
    dismiss(players);
  });
});

describe('prediction determinism', () => {
  type Step = { buttons: number; yaw: number };
  function script(tick: number): Step {
    const yaw = 0.4 + Math.sin(tick * 0.013) * 0.9;
    if (tick < 120) return { buttons: B.Forward | B.Sprint, yaw };
    if (tick < 200) return { buttons: B.Forward | B.Left | B.Jump, yaw };
    if (tick < 260) return { buttons: B.Backward | B.Crouch, yaw };
    if (tick < 330) return { buttons: B.Right, yaw };
    if (tick < 380) return { buttons: 0, yaw };
    return { buttons: B.Forward | (tick % 50 < 25 ? B.Right : B.Left), yaw };
  }

  async function replay(
    start: Vec3,
    ticks: number,
    classId: 'drifter' | 'allrounder' = 'drifter',
  ): Promise<{ maxError: number; drift: number; travelled: number; minY: number }> {
    const server = await PhysicsWorld.create();
    const client = await PhysicsWorld.create();
    const s = server.createCharacter({ position: start, classId, faction: 'alpine' });
    const c = client.createCharacter({ position: start, classId, faction: 'alpine' });
    const history: Array<{ position: Vec3; velocity: Vec3; grounded: boolean; sequence: number }> = [];
    const pending: Array<{ input: PlayerInput; previousButtons: number }> = [];
    const latency = 6;
    let maxError = 0;
    let minY = Number.POSITIVE_INFINITY;
    for (let tick = 1; tick <= ticks; tick += 1) {
      const step = script(tick);
      const input: PlayerInput = { sequence: tick, buttons: step.buttons, yaw: step.yaw, pitch: 0, weaponSlot: 1 };
      const previousButtons = c.buttons;
      c.simulate(input);
      client.step();
      pending.push({ input, previousButtons });
      s.simulate(input);
      server.step();
      minY = Math.min(minY, s.position.y);
      history.push({ position: s.position, velocity: s.velocity, grounded: s.grounded, sequence: tick });
      if (tick % 2 !== 0 || tick <= latency) continue;
      const authoritative = history[tick - latency - 1];
      if (!authoritative) continue;
      // Through the real wire codec (12.5 mm positions, 1/128 m/s velocities).
      const snapshot = decodeSnapshot(
        encodeSnapshot({
          serverTick: tick,
          weatherBalance: 0,
          windAngle: 0,
          windStrength: 0,
          ticketsAlpine: 50,
          ticketsLagoon: 50,
          turretStates: 0,
          vehicles: [],
          players: [
            {
              id: 1, faction: 'alpine', classId, position: authoritative.position, velocity: authoritative.velocity,
              yaw: 0, hp: 100, maxHp: 100, grounded: authoritative.grounded, alive: true, crouched: false, swimming: false,
              sprinting: false, rolling: false, parachuteState: 0, weaponSlot: 1, ammo: 0, reserve: 0, reloading: false,
              shield: 0, kills: 0, deaths: 0, skillCooldown1: 0, skillCooldown2: 0, skillCooldown3: 0, cloaked: false,
              lastProcessedInput: authoritative.sequence, heading: 0, launchSeconds: 0, dazed: false, slowed: false,
              boosted: false, slippery: false, support: 0, auraHealed: false, auraResupplied: false, auraActive: false, mascot: null,
            },
          ],
        }),
      );
      const wire = snapshot?.players[0];
      if (!wire) throw new Error('decode failed');
      while (pending.length > 0 && (pending[0]?.input.sequence ?? 0) <= wire.lastProcessedInput) pending.shift();
      const before = c.position;
      c.restore(wire.position, wire.velocity, wire.grounded, pending[0]?.previousButtons ?? c.buttons, wire.parachuteState, wire.swimming);
      c.restoreExtended(wire.launchSeconds, null);
      for (const entry of pending) {
        c.simulate(entry.input);
        client.step();
      }
      const after = c.position;
      maxError = Math.max(maxError, Math.hypot(before.x - after.x, before.y - after.y, before.z - after.z));
    }
    const drift = Math.hypot(s.position.x - c.position.x, s.position.y - c.position.y, s.position.z - c.position.z);
    const travelled = Math.hypot(s.position.x - start.x, s.position.z - start.z);
    server.dispose();
    client.dispose();
    return { maxError, drift, travelled, minY };
  }

  test('client prediction matches the server on land, slopes, falls and water (wire-quantised)', async () => {
    const land = findFlat(-60, 40);
    const onLand = await replay({ x: land.x, y: sampleMapHeight(land.x, land.z) + 0.3, z: land.z }, 480);
    const sea = findDeepWater();
    const onWater = await replay({ x: sea.x, y: WATER_LEVEL + 6, z: sea.z }, 480);
    // Reference: the same script and wire path for a soldier.
    const soldier = await replay({ x: land.x, y: sampleMapHeight(land.x, land.z) + 0.3, z: land.z }, 480, 'allrounder');
    console.log('[3G determinism] drifter land', JSON.stringify(onLand), 'drifter water', JSON.stringify(onWater), 'allrounder land', JSON.stringify(soldier));
    // Corrections stay below the client's 0.12 m reconcile threshold.
    for (const result of [onLand, onWater]) {
      expect(result.maxError).toBeLessThan(0.12);
      expect(result.drift).toBeLessThan(0.05);
      // She really walked (the script holds W for well over 3 s).
      expect(result.travelled).toBeGreaterThan(DRIFTER_TUNING.walkSpeed * 3);
    }
    expect(onWater.minY).toBeGreaterThan(WATER_LEVEL);
  });
});
