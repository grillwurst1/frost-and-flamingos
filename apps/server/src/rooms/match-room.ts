import {
  CLASS_DEFAULT_LOADOUTS,
  DRIFTER_AURA,
  FALL_RESPAWN_Y,
  FIXED_DT,
  InputButton,
  MAP_ID,
  MASCOT_FRIENDLY_BUMP,
  MASCOT_HEADSHOT_MULTIPLIER_CAP,
  MASCOT_RAM,
  MASCOT_RAM_REWIND_TICKS,
  MASCOT_RAM_WEAPON,
  MASCOT_SHOCKWAVE,
  MASCOT_STATUS,
  MAX_INPUT_BACKLOG,
  MAX_PLAYERS,
  PHYSICS_TICK_RATE,
  WATER_LEVEL,
  PROTOCOL_VERSION,
  RESPAWN_DELAY_SECONDS,
  SKILLS,
  SNAPSHOT_INTERVAL,
  STATUS_BOOST_SCALE,
  STATUS_SLOW_SCALE,
  WEAPON_STATS,
  WEAPON_TABLE,
  PhysicsWorld,
  classAvailableForFaction,
  classCapabilities,
  classStatsFor,
  createDefaultProfile,
  critterKillValue,
  encodeGameEvent,
  encodeMapStateSync,
  encodeProfileMessage,
  encodeSnapshot,
  normalizeProfile,
  randomSpawnForFaction,
  resolveClassForFaction,
  sampleMapHeight,
  sanitizeDisplayName,
  skillsForClass,
  weaponForSlot,
  wrapAngle,
  type CharacterBody,
  type ClassCapabilities,
  type ClassId,
  type Faction,
  type GameEvent,
  type Loadout,
  type MapStateSync,
  type MascotForm,
  type MascotMotorEvent,
  type PlayerInput,
  type PlayerProfile,
  type PlayerState,
  type ProfileMessage,
  type ServerHello,
  type SkillDefinition,
  type Vec3,
  type WeaponId,
  type WeaponSlot,
  type WelcomeMessage,
  type WorldSnapshot,
} from '@frost-and-flamingos/shared';
import {
  createBotRoute,
  engagementBlocked,
  routeTowards,
  steerAlongRoute,
  swimExitYaw,
  swimWatchdog,
  type BotRoute,
} from './bot-nav.js';
import {
  normalizeDirection,
  raycastTargets,
  spreadDirection,
  type CombatTarget,
} from './combat.js';
import { CritterSystem, type CritterKill, type CritterThreat } from './critters.js';
import { mascotBotButtons, type MascotBotMemory } from './mascot-bot.js';
import { VehicleManager, type VehicleStatus } from './vehicle-manager.js';

export interface GameSocket {
  send(data: string | ArrayBuffer | Uint8Array): unknown;
  close(code?: number, reason?: string): void;
}

interface SlotAmmo {
  magazine: number;
  reserve: number;
}

interface FireRequest {
  clientTick: number;
  weaponId: number;
  origin: Vec3;
  direction: Vec3;
}

interface BotState {
  targetId: number;
  nextThinkTick: number;
  nextFireTick: number;
  nextJumpTick: number;
  nextSkillTick: number;
  nextStrafeTick: number;
  strafeDirection: number;
  aimError: number;
  patrolYaw: number;
  /** Probability of playing the mascot on each respawn (0 = never). */
  mascotChance: number;
  /** The human class this bot returns to when it is not a mascot. */
  humanClass: ClassId;
  mascot: MascotBotMemory;
  /** Human bots: ticks spent pushing forward without moving (blocked by a prop). */
  stuckTicks: number;
  /** While set, a human bot walks a sideways detour around the obstacle. */
  detourUntilTick: number;
  /** Detour side (+1 right, -1 left); flips when a detour is blocked too. */
  detourSide: number;
  /** Waypoint navigation (patrol, out-of-sight chase, blocked-charge escalation). */
  route: BotRoute;
}

/** Human bots charging a visible target: blocked this long (below BOT_STUCK_SPEED) starts a detour. */
const BOT_STUCK_TICKS = PHYSICS_TICK_RATE;
const BOT_STUCK_SPEED = 0.6;
const BOT_DETOUR_TICKS = Math.round(PHYSICS_TICK_RATE * 1.2);
/** Heading error (rad) above which a cow lining up with a swim exit pivots instead of swimming on. */
const MASCOT_EXIT_PIVOT = 0.9;

interface PlayerConnection {
  id: number;
  socket: GameSocket | null;
  isBot: boolean;
  profile: PlayerProfile;
  character: CharacterBody;
  inputQueue: PlayerInput[];
  fireQueue: FireRequest[];
  lastInput: PlayerInput;
  lastProcessedInput: number;
  previousButtons: number;
  hp: number;
  shield: number;
  alive: boolean;
  ammo: SlotAmmo[];
  activeSlot: WeaponSlot;
  reloadEndsTick: number;
  lastFireTick: number;
  kills: number;
  deaths: number;
  respawnAtTick: number;
  spawnProtectionUntil: number;
  killerId: number;
  lastAttackerId: number;
  skillCooldowns: [number, number, number];
  speedUntilTick: number;
  shieldUntilTick: number;
  cloakUntilTick: number;
  slowUntilTick: number;
  /** Cowbell daze (also sets slowUntilTick). */
  dazedUntilTick: number;
  /** Mascot ram cooldown per victim id: earliest tick of the next ram. */
  ramCooldowns: Map<number, number>;
  /** Physics tick of the last hit taken (aura vitality waits for out-of-combat). */
  lastDamagedTick: number;
  /** Reserve ammo a friendly drifter's aura owes per weapon slot (integer units, see updateSupplyAura). */
  supplyAmmo: [number, number, number];
  /** Support points (whole), see DRIFTER_AURA. They survive respawns like kills. */
  support: number;
  /** Lifetime vitality this drifter's aura healed / magazines it handed out. */
  supportVitality: number;
  supportMagazines: number;
  /** Aura flags of the current tick (snapshot status bits). */
  auraHealed: boolean;
  auraResupplied: boolean;
  auraActive: boolean;
  lastProfileUpdateAt: number;
  bot: BotState | null;
}

interface LagEntry {
  position: Vec3;
  crouched: boolean;
  alive: boolean;
  heading: number;
}

interface LagSample {
  tick: number;
  players: Map<number, LagEntry>;
}

/** Coconut-milk puddle: enemies of the owner's faction slide inside it. */
interface MilkPuddle {
  ownerId: number;
  faction: Faction;
  position: Vec3;
  radius: number;
  expiresAtTick: number;
}

export interface MascotRamRecord {
  attackerId: number;
  victimId: number;
  form: MascotForm;
  damage: number;
  closingSpeed: number;
  launch: Vec3;
  tick: number;
}

/** One mascot body contact found before any ram of the tick is resolved. */
interface RamContact {
  rammer: PlayerConnection;
  victim: PlayerConnection;
  form: MascotForm;
  /** Victim position that was touched (current or rewound). */
  touched: Vec3;
  /** Unit contact normal from the rammer toward the victim. */
  normalX: number;
  normalZ: number;
  /** Relative speed along the normal. */
  closing: number;
  /** The rammer's own speed along the normal. */
  approach: number;
  velocity: Vec3;
  speed: number;
  boosting: boolean;
}

/** A resolved enemy ram, applied after every contact of the tick is known. */
interface RamHit {
  contact: RamContact;
  damage: number;
  /** Speed the damage and launch were scaled by. */
  impactSpeed: number;
  launch: Vec3;
}

interface Projectile {
  ownerId: number;
  position: Vec3;
  velocity: Vec3;
  damage: number;
  splashRadius: number;
  weaponId: WeaponId;
  expiresAtTick: number;
}

export interface JoinResult {
  ok: true;
  welcome: WelcomeMessage;
  mapState: MapStateSync;
  /** Profiles of every other player already in the room. */
  profiles: ProfileMessage[];
}

export interface JoinError {
  ok: false;
  code: number;
  reason: string;
}

export interface MatchRoomOptions {
  /** Number of AI bots (default 4). Tests use 0 for a quiet room. */
  bots?: number;
  /** Seed of the critter simulation (default: random per server start; fixed under tests). */
  critterSeed?: number;
  /**
   * Ambient critters (wandering hens). Default true, except under `bun test`
   * (NODE_ENV=test): test rooms have none unless they pass `critters: true`
   * or a `critterSeed`, so hens never wander into other suites' firing lines.
   */
  critters?: boolean;
}

export interface RoomStatus {
  online: boolean;
  players: number;
  maxPlayers: number;
  serverTick: number;
  physicsTick: number;
  uptimeSeconds: number;
  protocolVersion: number;
  mapId: string;
  tickets: { alpine: number; lagoon: number };
  weatherBalance: number;
  mascots: {
    active: number;
    rams: number;
    shockwaves: number;
    dazes: number;
    puddles: number;
    lastRam: MascotRamRecord | null;
  };
  vehicles: VehicleStatus;
  critters: {
    alive: number;
    total: number;
    kills: number;
    respawns: number;
    flees: number;
  };
  drifters: {
    active: number;
    /** Lifetime vitality healed and magazines refilled by every drifter aura. */
    vitalityHealed: number;
    magazinesRefilled: number;
    supportPoints: number;
  };
}

const PROFILE_UPDATE_COOLDOWN_MS = 120;
const RESPAWN_DELAY_TICKS = RESPAWN_DELAY_SECONDS * PHYSICS_TICK_RATE;
const SPAWN_PROTECTION_TICKS = 2 * PHYSICS_TICK_RATE;
const LAG_HISTORY_TICKS = 2 * PHYSICS_TICK_RATE;
const MAX_LAG_REWIND_TICKS = 30;
const BOT_COUNT = 4;
/**
 * One bot per side may play the mascot (the cow for Peak Guard, the coconut
 * for the Lagoon League). They start as mascots so the class is visible in
 * every playtest and re-roll on each respawn.
 */
const BOT_NAMES = [
  { name: 'Heidi Hangtime', faction: 'alpine', classId: 'allrounder', mascotChance: 0 },
  { name: 'Bruno Gletscher', faction: 'alpine', classId: 'heavy', mascotChance: 0.6 },
  { name: 'Coral Kai', faction: 'lagoon', classId: 'infiltrator', mascotChance: 0 },
  { name: 'Sandy Palms', faction: 'lagoon', classId: 'allrounder', mascotChance: 0.6 },
] as const satisfies readonly { name: string; faction: Faction; classId: ClassId; mascotChance: number }[];

const ZERO_VELOCITY: Vec3 = { x: 0, y: 0, z: 0 };
/** "Never hit": the aura treats a fresh player as out of combat. */
const NEVER_DAMAGED_TICK = -1_000_000;
const AURA_OUT_OF_COMBAT_TICKS = Math.round(DRIFTER_AURA.outOfCombatSeconds * PHYSICS_TICK_RATE);
const AURA_HEAL_PER_TICK = DRIFTER_AURA.healPerSecond / PHYSICS_TICK_RATE;
const AURA_MAGAZINE_TICKS = Math.max(1, Math.round(DRIFTER_AURA.magazineSeconds * PHYSICS_TICK_RATE));
/** Float tolerance for whole support points (lifetime totals are sums of tick slices). */
const SUPPORT_EPSILON = 1e-6;

function capabilitiesOf(player: PlayerConnection): ClassCapabilities {
  return classCapabilities(player.profile.cosmetics.classId);
}

/** Drifters: no shot, splash, ram, shockwave or status ever reaches them. */
function untouchable(player: PlayerConnection): boolean {
  return !capabilitiesOf(player).targetable;
}

/**
 * Local playtest aid: FF_PLAYTEST_ARENA="x,z" spawns every player and bot
 * within a few metres of one point (factions on opposite sides) so mascot
 * encounters happen immediately. Unset in normal play.
 */
function parseArena(value: string | undefined): { x: number; z: number } | null {
  if (!value) return null;
  const [x, z] = value.split(',').map((part) => Number(part.trim()));
  if (x === undefined || z === undefined || !Number.isFinite(x) || !Number.isFinite(z)) return null;
  return { x, z };
}

function createAmmo(loadout: Loadout): SlotAmmo[] {
  const slots: WeaponSlot[] = [1, 2, 3];
  return slots.map((slot) => {
    const stats = WEAPON_STATS[weaponForSlot(loadout, slot)];
    return { magazine: stats.magazine, reserve: stats.reserve };
  });
}

function idleInput(sequence: number, yaw: number, pitch: number, weaponSlot: WeaponSlot): PlayerInput {
  return { sequence, buttons: 0, yaw, pitch, weaponSlot };
}

function directionFromAngles(yaw: number, pitch: number): Vec3 {
  const cosPitch = Math.cos(pitch);
  return {
    x: Math.sin(yaw) * cosPitch,
    y: Math.sin(pitch),
    z: Math.cos(yaw) * cosPitch,
  };
}

function distance3(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function secondsToTicks(seconds: number): number {
  return Math.max(1, Math.round(seconds * PHYSICS_TICK_RATE));
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Positions travel as decimetres in the int16 event parameters. */
function toDecimetres(value: number): number {
  return Math.max(-32767, Math.min(32767, Math.round(value * 10)));
}

/** Shortest distance from a point to a vertical capsule (feet-based). */
function distanceToCapsule(point: Vec3, feet: Vec3, radius: number, height: number): number {
  const low = feet.y + radius;
  const high = feet.y + Math.max(radius, height - radius);
  const y = Math.min(high, Math.max(low, point.y));
  return Math.hypot(point.x - feet.x, point.y - y, point.z - feet.z);
}

export class MatchRoom {
  private readonly physics: PhysicsWorld;
  private readonly critters: CritterSystem;
  private readonly players = new Map<number, PlayerConnection>();
  private readonly sockets = new Map<GameSocket, number>();
  private readonly lagHistory: LagSample[] = [];
  private readonly projectiles: Projectile[] = [];
  private readonly puddles: MilkPuddle[] = [];
  private readonly arena = parseArena(process.env.FF_PLAYTEST_ARENA);
  private readonly mascotStats = {
    rams: 0,
    shockwaves: 0,
    dazes: 0,
    lastRam: null as MascotRamRecord | null,
  };
  private nextPlayerId = 1;
  private physicsTick = 0;
  private snapshotTick = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastFrameTime = 0;
  private accumulator = 0;
  private readonly startedAt = Date.now();
  private ticketsAlpine = 50;
  private ticketsLagoon = 50;
  private weatherBalance = 0;
  private windAngle = 0.6;
  private windStrength = 0;
  /** Drivable vehicles (package 4V); see vehicle-manager.ts. */
  readonly vehicles: VehicleManager<PlayerConnection>;

  private constructor(physics: PhysicsWorld, critterSeed: number, critters: boolean) {
    this.physics = physics;
    this.vehicles = new VehicleManager<PlayerConnection>(physics, {
      physicsTick: () => this.physicsTick,
      snapshotTick: () => this.snapshotTick,
      players: () => this.players.values(),
      player: (id) => this.players.get(id),
      damagePlayer: (target, attacker, damage, weaponId, headshot) =>
        this.damagePlayer(target, attacker, damage, weaponId, headshot),
      explode: (owner, position, damage, radius, weaponId) => this.explode(owner, position, damage, radius, weaponId),
      combatTargets: (owner, clientTick) => this.combatTargets(owner, clientTick),
      broadcastEvent: (event) => this.broadcastEvent(event),
      // Hens (package 3H): vehicle shells, harpoons, splash and run-overs.
      critterRaycast: (origin, direction, maxDistance) => this.critters.raycast(origin, direction, maxDistance, null),
      killCritter: (critterId, killerId, weaponId) => {
        this.critters.kill(critterId, killerId, weaponId);
      },
      killCrittersInSphere: (center, radius, killerId, weaponId) => this.critters.killInSphere(center, radius, killerId, weaponId, null),
    });
    this.critters = new CritterSystem(physics, {
      seed: critterSeed,
      enabled: critters,
      onKill: (kill) => this.broadcastCritterKill(kill),
    });
  }

  static async create(options: MatchRoomOptions = {}): Promise<MatchRoom> {
    const physics = await PhysicsWorld.create();
    const testRun = process.env.NODE_ENV === 'test';
    const critters = options.critters ?? (!testRun || options.critterSeed !== undefined);
    // Tests are reproducible: a fixed seed unless one is given.
    const seed = options.critterSeed ?? (testRun ? 0x3e9 : Math.floor(Math.random() * 0xffffffff));
    const room = new MatchRoom(physics, seed, critters);
    room.spawnBots(options.bots ?? BOT_COUNT);
    return room;
  }

  start(): void {
    if (this.timer) return;
    this.lastFrameTime = performance.now();
    this.timer = setInterval(() => this.update(), 1000 / 120);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.physics.dispose();
  }

  private update(): void {
    const now = performance.now();
    const elapsed = Math.min(0.25, (now - this.lastFrameTime) / 1000);
    this.lastFrameTime = now;
    this.accumulator += elapsed;
    let steps = 0;
    while (this.accumulator >= FIXED_DT && steps < 6) {
      this.tick();
      this.accumulator -= FIXED_DT;
      steps += 1;
    }
    if (steps === 6) this.accumulator = 0;
  }

  private tick(): void {
    this.physicsTick += 1;
    const wind = this.currentWind();
    this.updatePuddles();

    for (const player of this.players.values()) {
      this.tickTimers(player);
      if (!player.alive) {
        if (player.respawnAtTick > 0 && this.physicsTick >= player.respawnAtTick) {
          this.respawn(player);
        }
        continue;
      }
      // Whoever leaves the world through a crack or off an edge is put back.
      if (player.character.position.y < FALL_RESPAWN_Y) {
        this.respawn(player);
        continue;
      }

      const input = player.isBot
        ? this.vehicles.botAdjust(player, this.botInput(player))
        : player.inputQueue.shift() ?? null;
      if (input) {
        this.applyInput(player, input, wind);
      } else if (!player.isBot) {
        this.applyInput(
          player,
          idleInput(
            player.lastProcessedInput,
            player.lastInput.yaw,
            player.lastInput.pitch,
            player.activeSlot,
          ),
          wind,
          false,
        );
      }

      if (!player.isBot && player.fireQueue.length > 0) {
        const fire = player.fireQueue.shift();
        if (fire) this.tryFire(player, fire.clientTick);
      }
    }

    this.vehicles.step();
    this.critters.step(this.physicsTick, this.critterThreats());
    this.physics.step();
    this.resolveMascotRams();
    this.resolveCritterRams();
    this.updateSupplyAura();
    // Out-of-world guard: anything that slips below the world respawns safely.
    for (const player of this.players.values()) {
      if (player.alive && player.character.position.y < FALL_RESPAWN_Y) this.respawn(player);
    }
    this.updateProjectiles();
    this.recordLagHistory();

    if (this.physicsTick % SNAPSHOT_INTERVAL === 0) {
      this.snapshotTick += 1;
      this.broadcastSnapshot();
    }
  }

  private tickTimers(player: PlayerConnection): void {
    // Mascot cooldowns are motor state, mirrored after every simulate.
    for (let index = 0; index < 3 && !player.character.form; index += 1) {
      const cooldown = player.skillCooldowns[index] ?? 0;
      if (cooldown > 0) {
        player.skillCooldowns[index] = Math.max(0, cooldown - FIXED_DT);
      }
    }
    if (player.shieldUntilTick > 0 && this.physicsTick >= player.shieldUntilTick) {
      player.shield = 0;
      player.shieldUntilTick = 0;
    }
    if (player.reloadEndsTick > 0 && this.physicsTick >= player.reloadEndsTick) {
      this.finishReload(player);
    }
  }

  private applyInput(
    player: PlayerConnection,
    input: PlayerInput,
    wind: { angle: number; strength: number },
    trackButtons = true,
  ): void {
    const previousButtons = player.previousButtons;
    if (input.weaponSlot !== player.activeSlot) {
      player.activeSlot = input.weaponSlot;
      player.reloadEndsTick = 0;
      player.lastFireTick = -999;
    }
    player.lastInput = input;
    player.lastProcessedInput = input.sequence;
    const mascot = player.character.form !== null;

    // Vehicles: seated players drive/aim instead of walking; F enters and exits.
    const seat = this.vehicles.handleInput(player, input, previousButtons, trackButtons);
    if (seat !== 'none') {
      if (seat === 'hands' && (input.buttons & InputButton.Reload) !== 0 && (previousButtons & InputButton.Reload) === 0) {
        this.startReload(player);
      }
      if (seat === 'hands' && player.isBot && (input.buttons & InputButton.FirePrimary) !== 0) {
        this.tryFire(player, this.snapshotTick);
      }
      if (trackButtons) player.previousButtons = input.buttons;
      return;
    }

    if (
      !mascot &&
      (input.buttons & InputButton.Reload) !== 0 &&
      (previousButtons & InputButton.Reload) === 0
    ) {
      this.startReload(player);
    }
    // Mascot moves are started by the shared motor (predicted on the client).
    if (!mascot) this.handleSkillInput(player, input.buttons, previousButtons);

    player.character.setWind(wind);
    player.character.simulate(input, trackButtons, this.speedScaleFor(player));
    if (mascot) {
      player.skillCooldowns = player.character.mascotCooldownSeconds;
      for (const event of player.character.drainMascotEvents()) {
        this.handleMascotEvent(player, event);
      }
    }

    if (!mascot && player.isBot && (input.buttons & InputButton.FirePrimary) !== 0) {
      this.tryFire(player, this.snapshotTick);
    }
    if (trackButtons) player.previousButtons = input.buttons;
  }

  /** Same formula as the client prediction (status bits travel in the snapshot). */
  private speedScaleFor(player: PlayerConnection): number {
    if (this.physicsTick < player.slowUntilTick) return STATUS_SLOW_SCALE;
    if (this.physicsTick < player.speedUntilTick) return STATUS_BOOST_SCALE;
    return 1;
  }

  private currentWind(): { angle: number; strength: number } {
    return {
      angle: this.windAngle + (this.physicsTick % 7200) * 0.00012,
      strength: Math.min(1, Math.abs(this.weatherBalance)) * 0.65,
    };
  }

  /**
   * Spawn point for a faction (the playtest arena when configured). Map spawns
   * skip pads another living player is standing on.
   */
  private spawnFor(faction: Faction, selfId = 0): { position: Vec3 } {
    if (!this.arena) {
      return randomSpawnForFaction(faction, Math.random, (position) =>
        this.isSpawnOccupied(position, selfId),
      );
    }
    const side = faction === 'alpine' ? -1 : 1;
    const x = this.arena.x + side * 9 + (Math.random() - 0.5) * 6;
    const z = this.arena.z + (Math.random() - 0.5) * 6;
    return { position: { x, y: sampleMapHeight(x, z) + 0.4, z } };
  }

  private respawn(player: PlayerConnection): void {
    const spawn = this.spawnFor(player.profile.faction, player.id);
    if (player.bot) this.rollBotClass(player, spawn.position);
    const classId = player.profile.cosmetics.classId;
    player.character.setColliderEnabled(true);
    player.character.teleport(spawn.position);
    player.character.restore(spawn.position, ZERO_VELOCITY, false, 0);
    player.hp = classStatsFor(classId, player.profile.faction).maxHp;
    player.shield = 0;
    player.alive = true;
    player.respawnAtTick = 0;
    player.killerId = 0;
    player.lastAttackerId = 0;
    player.dazedUntilTick = 0;
    player.ramCooldowns.clear();
    player.lastDamagedTick = NEVER_DAMAGED_TICK;
    player.supplyAmmo = [0, 0, 0];
    player.ammo = createAmmo(player.profile.loadout);
    player.activeSlot = 1;
    player.reloadEndsTick = 0;
    player.lastFireTick = -999;
    player.skillCooldowns = [0, 0, 0];
    player.speedUntilTick = 0;
    player.shieldUntilTick = 0;
    player.cloakUntilTick = 0;
    player.slowUntilTick = 0;
    player.spawnProtectionUntil = this.physicsTick + SPAWN_PROTECTION_TICKS;
    player.inputQueue.length = 0;
    player.fireQueue.length = 0;
    player.previousButtons = 0;
    player.lastInput = idleInput(player.lastProcessedInput, 0, 0, 1);
    if (player.bot) {
      player.bot.targetId = 0;
      player.bot.nextThinkTick = this.physicsTick;
      player.bot.route = createBotRoute();
      player.bot.stuckTicks = 0;
      player.bot.detourUntilTick = 0;
      player.bot.mascot.stuckTicks = 0;
      player.bot.mascot.reverseUntilTick = 0;
    }
    this.broadcastEvent({
      eventType: 'PLAYER_RESPAWNED',
      actorId: player.id,
      targetId: 0,
      paramX: 0,
      paramZ: 0,
      paramValue: 0,
    });
  }

  /** True when another living player stands on (or right next to) a spawn pad. */
  private isSpawnOccupied(position: Vec3, selfId: number): boolean {
    for (const other of this.players.values()) {
      if (other.id === selfId || !other.alive || untouchable(other)) continue;
      const feet = other.character.position;
      if (Math.hypot(feet.x - position.x, feet.z - position.z) < 1.6 && Math.abs(feet.y - position.y) < 2.5) return true;
    }
    return false;
  }

  /**
   * DEV-only probe (enabled with FF_DEV_TOOLS=1): moves a player onto the
   * highest walkable surface at (x, z), or to an explicit height.
   */
  devTeleport(playerId: number, x: number, z: number, y?: number): { ok: boolean; position?: Vec3 } {
    const player = this.players.get(playerId);
    if (!player || !player.alive) return { ok: false };
    let height = y;
    if (height === undefined) {
      const hit = this.physics.raycast({ x, y: 160, z }, { x: 0, y: -1, z: 0 }, 200);
      height = (hit?.point.y ?? 0) + 0.05;
    }
    const position = { x, y: height, z };
    player.character.teleport(position);
    player.character.restore(position, ZERO_VELOCITY, false, 0);
    player.inputQueue.length = 0;
    return { ok: true, position };
  }

  /**
   * DEV-only vehicle probe (FF_DEV_TOOLS=1): `enter` seats the player in a
   * vehicle (seat index `value`), `damage` hurts a vehicle by `value`,
   * `park` moves a vehicle (with its crew) onto the ground or water at x/z.
   */
  devVehicle(
    playerId: number,
    action: string,
    vehicleId: number,
    value: number,
    place: { x: number; z: number; yaw: number } | null = null,
  ): { ok: boolean } {
    const player = this.players.get(playerId);
    if (action === 'enter') return { ok: !!player && player.alive && this.vehicles.devEnter(player, vehicleId, Math.max(0, Math.floor(value))) };
    if (action === 'damage') return { ok: this.vehicles.devDamage(vehicleId, null, value) };
    if (action === 'park' && place) return { ok: this.vehicles.devPark(vehicleId, place.x, place.z, place.yaw) };
    return { ok: false };
  }

  private eyePosition(player: PlayerConnection): Vec3 {
    const position = player.character.position;
    return {
      x: position.x,
      y: position.y + player.character.eyeHeight,
      z: position.z,
    };
  }

  private startReload(player: PlayerConnection): void {
    if (!player.alive || player.reloadEndsTick > this.physicsTick) return;
    if (player.character.form || !capabilitiesOf(player).armed) return;
    const weaponId = weaponForSlot(player.profile.loadout, player.activeSlot);
    const stats = WEAPON_STATS[weaponId];
    if (stats.magazine <= 0 || stats.reloadSeconds <= 0) return;
    const ammo = player.ammo[player.activeSlot - 1];
    if (!ammo || ammo.magazine >= stats.magazine || ammo.reserve <= 0) return;
    player.reloadEndsTick =
      this.physicsTick + Math.max(1, Math.round(stats.reloadSeconds * PHYSICS_TICK_RATE));
  }

  private finishReload(player: PlayerConnection): void {
    const weaponId = weaponForSlot(player.profile.loadout, player.activeSlot);
    const stats = WEAPON_STATS[weaponId];
    const ammo = player.ammo[player.activeSlot - 1];
    player.reloadEndsTick = 0;
    if (!ammo || stats.magazine <= 0) return;
    const loaded = Math.min(stats.magazine - ammo.magazine, ammo.reserve);
    ammo.magazine += Math.max(0, loaded);
    ammo.reserve -= Math.max(0, loaded);
  }

  private tryFire(player: PlayerConnection, clientTick: number): void {
    if (!player.alive) return;
    // Mascots and drifters carry no firearms.
    if (player.character.form || !capabilitiesOf(player).armed) return;
    // Only seats that keep their hands free (commander hatch, sidecar tub) fire the own loadout.
    if (!this.vehicles.mayUseHandWeapons(player.id)) return;
    const weaponId = weaponForSlot(player.profile.loadout, player.activeSlot);
    const stats = WEAPON_STATS[weaponId];
    if (stats.fireMode === 'melee' && stats.damage <= 0) return;
    if (player.reloadEndsTick > this.physicsTick) return;

    const minimumTicks = Math.max(1, Math.round((PHYSICS_TICK_RATE * 60) / Math.max(1, stats.rpm)));
    if (this.physicsTick - player.lastFireTick < minimumTicks) return;

    const ammo = player.ammo[player.activeSlot - 1];
    if (stats.magazine > 0) {
      if (!ammo) return;
      if (ammo.magazine <= 0) {
        this.startReload(player);
        return;
      }
      ammo.magazine -= 1;
      if (ammo.magazine <= 0 && ammo.reserve > 0) this.startReload(player);
    }

    player.lastFireTick = this.physicsTick;
    this.broadcastEvent({
      eventType: 'WEAPON_FIRED',
      actorId: player.id,
      targetId: 0,
      // The camera yaw is unbounded: wrapped first, or the int16 clamps it.
      paramX: Math.round(wrapAngle(player.lastInput.yaw) * 100),
      paramZ: Math.round(player.lastInput.pitch * 100),
      paramValue: WEAPON_TABLE.code[weaponId],
    });
    // Gunfire scatters the critters near the shooter and along the shot up to
    // where it meets the world. A projectile arcs: only the shooter's
    // surroundings scatter now, the impact blast does the rest.
    {
      const eye = this.eyePosition(player);
      const aim = directionFromAngles(player.lastInput.yaw, player.lastInput.pitch);
      const lane =
        stats.fireMode === 'projectile' ? 0 : Math.min(stats.range, this.physics.raycast(eye, aim, stats.range)?.distance ?? stats.range);
      this.critters.alertShot(eye, aim, lane);
    }

    if (stats.fireMode === 'projectile') {
      const direction = directionFromAngles(player.lastInput.yaw, player.lastInput.pitch);
      const origin = this.eyePosition(player);
      const forward = normalizeDirection(direction);
      this.projectiles.push({
        ownerId: player.id,
        position: {
          x: origin.x + forward.x * 0.7,
          y: origin.y + forward.y * 0.7,
          z: origin.z + forward.z * 0.7,
        },
        velocity: {
          x: forward.x * Math.max(30, stats.projectileSpeed),
          y: forward.y * Math.max(30, stats.projectileSpeed),
          z: forward.z * Math.max(30, stats.projectileSpeed),
        },
        damage: stats.damage,
        splashRadius: stats.splashRadius,
        weaponId,
        expiresAtTick: this.physicsTick + PHYSICS_TICK_RATE * 5,
      });
      return;
    }

    const pellets = Math.max(1, stats.pellets);
    for (let pellet = 0; pellet < pellets; pellet += 1) {
      const direction = spreadDirection(
        directionFromAngles(player.lastInput.yaw, player.lastInput.pitch),
        stats.spread,
      );
      this.resolveShot(player, stats.range, stats.damage, weaponId, direction, clientTick);
    }
  }

  private resolveShot(
    player: PlayerConnection,
    range: number,
    damage: number,
    weaponId: WeaponId,
    direction: Vec3,
    clientTick: number,
  ): void {
    const origin = this.eyePosition(player);
    const worldHit = this.physics.raycast(origin, direction, range);
    const maxDistance = Math.min(range, worldHit?.distance ?? range);
    const targets = this.combatTargets(player, player.isBot ? 0 : clientTick);
    const hit = raycastTargets(origin, direction, maxDistance, targets);
    // Hulls and critters stop bullets: the nearest of hull, critter and player takes the shot.
    const vehicleHit = this.vehicles.raycast(origin, normalizeDirection(direction), maxDistance + 0.3, this.vehicles.vehicleIdOf(player.id));
    // Critters are rewound like players.
    const rewindTick = player.isBot ? null : (this.findLagSample(clientTick)?.tick ?? null);
    const critterHit = this.critters.raycast(origin, direction, maxDistance, rewindTick);
    const playerDistance = hit ? hit.distance : Number.POSITIVE_INFINITY;
    const critterDistance = critterHit ? critterHit.distance : Number.POSITIVE_INFINITY;
    if (vehicleHit && vehicleHit.distance < playerDistance && vehicleHit.distance <= critterDistance) {
      this.vehicles.damageFromWeapon(vehicleHit.id, player, damage, weaponId);
      return;
    }
    if (critterHit && critterDistance < playerDistance) {
      this.critters.kill(critterHit.critterId, player.id, weaponId);
      return;
    }
    if (!hit) return;
    const target = this.players.get(hit.id);
    if (!target) return;
    this.damagePlayer(target, player, damage, weaponId, hit.headshot);
  }

  private combatTargets(player: PlayerConnection, clientTick: number): CombatTarget[] {
    const sample = player.isBot ? null : this.findLagSample(clientTick);
    const targets: CombatTarget[] = [];
    for (const other of this.players.values()) {
      if (other.id === player.id) continue;
      if (other.profile.faction === player.profile.faction) continue;
      // Shots and projectiles pass through a drifter to whoever stands behind her.
      if (untouchable(other)) continue;
      // Crews inside the armour are hit through their vehicle instead.
      if (this.vehicles.isShielded(other.id)) continue;
      const classStats = classStatsFor(other.profile.cosmetics.classId, other.profile.faction);
      const state = sample?.players.get(other.id);
      targets.push({
        id: other.id,
        position: state?.position ?? other.character.position,
        crouched: state?.crouched ?? other.character.crouched,
        radius: classStats.radius,
        height: classStats.height,
        alive: state?.alive ?? other.alive,
        form: other.character.form,
        heading: state?.heading ?? other.character.heading,
      });
    }
    return targets;
  }

  private findLagSample(clientTick: number): LagSample | null {
    if (this.lagHistory.length === 0) return null;
    const rewindSnapshots = Math.max(0, Math.min(12, this.snapshotTick - clientTick));
    const rewindTicks = Math.min(
      MAX_LAG_REWIND_TICKS,
      rewindSnapshots * SNAPSHOT_INTERVAL + 6,
    );
    const targetTick = this.physicsTick - rewindTicks;
    let best: LagSample | null = this.lagHistory[0] ?? null;
    for (const sample of this.lagHistory) {
      if (sample.tick <= targetTick) best = sample;
      else break;
    }
    return best;
  }

  private recordLagHistory(): void {
    const players = new Map<number, LagEntry>();
    for (const player of this.players.values()) {
      players.set(player.id, {
        position: { ...player.character.position },
        crouched: player.character.crouched,
        alive: player.alive,
        heading: player.character.heading,
      });
    }
    this.lagHistory.push({ tick: this.physicsTick, players });
    while (this.lagHistory.length > LAG_HISTORY_TICKS) this.lagHistory.shift();
  }

  private damagePlayer(
    target: PlayerConnection,
    attacker: PlayerConnection | null,
    baseDamage: number,
    weaponId: WeaponId | null,
    headshot: boolean,
  ): void {
    if (!target.alive || baseDamage <= 0) return;
    // Untouchable: no hit, no marker, no vignette, no kill.
    if (!capabilitiesOf(target).damageable) return;
    if (attacker && attacker.profile.faction === target.profile.faction) return;
    if (this.physicsTick < target.spawnProtectionUntil) return;
    target.lastDamagedTick = this.physicsTick;

    const weaponMultiplier = headshot && weaponId ? WEAPON_STATS[weaponId].headshotMultiplier : 1;
    // A mascot's head is a small part of a big body: headshots on it count less.
    const multiplier = target.character.form
      ? Math.min(weaponMultiplier, MASCOT_HEADSHOT_MULTIPLIER_CAP)
      : weaponMultiplier;
    let damage = baseDamage * multiplier;
    const absorbed = Math.min(target.shield, damage);
    target.shield = Math.max(0, target.shield - absorbed);
    damage -= absorbed;
    target.hp = Math.max(0, target.hp - damage);
    target.lastAttackerId = attacker?.id ?? 0;

    this.broadcastEvent({
      eventType: 'COMIC_HIT',
      actorId: attacker?.id ?? 0,
      targetId: target.id,
      paramX: headshot ? 1 : 0,
      paramZ: 0,
      paramValue: Math.max(1, Math.min(65535, Math.round(damage + absorbed))),
    });

    if (target.hp <= 0) this.killPlayer(target, attacker, weaponId, headshot);
  }

  private killPlayer(
    target: PlayerConnection,
    attacker: PlayerConnection | null,
    weaponId: WeaponId | null,
    headshot: boolean,
  ): void {
    if (!target.alive) return;
    if (!capabilitiesOf(target).damageable) return;
    target.alive = false;
    target.hp = 0;
    target.shield = 0;
    target.deaths += 1;
    target.respawnAtTick = this.physicsTick + RESPAWN_DELAY_TICKS;
    target.killerId = attacker && attacker.id !== target.id ? attacker.id : 0;
    target.character.setColliderEnabled(false);
    target.reloadEndsTick = 0;
    target.previousButtons = 0;
    target.inputQueue.length = 0;
    target.fireQueue.length = 0;
    target.cloakUntilTick = 0;
    if (attacker && attacker.id !== target.id) attacker.kills += 1;

    this.broadcastEvent({
      eventType: 'KILL_RAGDOLL',
      actorId: target.killerId,
      targetId: target.id,
      paramX: headshot ? 1 : 0,
      paramZ: 0,
      paramValue: weaponId ? WEAPON_TABLE.code[weaponId] : 0,
    });
  }

  private handleSkillInput(
    player: PlayerConnection,
    buttons: number,
    previousButtons: number,
  ): void {
    if (
      (buttons & InputButton.Skill1) !== 0 &&
      (previousButtons & InputButton.Skill1) === 0
    ) {
      this.useSkill(player, 0);
    }
    if (
      (buttons & InputButton.Skill2) !== 0 &&
      (previousButtons & InputButton.Skill2) === 0
    ) {
      this.useSkill(player, 1);
    }
    if (
      (buttons & InputButton.Skill3OrTaunt) !== 0 &&
      (previousButtons & InputButton.Skill3OrTaunt) === 0
    ) {
      this.useSkill(player, 2);
    }
  }

  private useSkill(player: PlayerConnection, index: 0 | 1 | 2): void {
    if (!player.alive || !capabilitiesOf(player).skills) return;
    if ((player.skillCooldowns[index] ?? 0) > 0) return;
    const skill = skillsForClass(player.profile.cosmetics.classId, player.profile.faction)[index];
    if (!skill) return;
    player.skillCooldowns[index] = skill.cooldownSeconds;
    this.applySkill(player, skill);
    this.broadcastEvent({
      eventType: 'SKILL_USED',
      actorId: player.id,
      targetId: 0,
      paramX: index + 1,
      paramZ: 0,
      paramValue: index + 1,
    });
  }

  private applySkill(player: PlayerConnection, skill: SkillDefinition): void {
    const classId = player.profile.cosmetics.classId;
    switch (skill.kind) {
      case 'heal': {
        player.hp = Math.min(classStatsFor(classId, player.profile.faction).maxHp, player.hp + skill.amount);
        return;
      }
      case 'mascot':
        // Resolved from motor events in handleMascotEvent.
        return;
      case 'shield': {
        player.shield = Math.max(player.shield, skill.amount);
        player.shieldUntilTick = this.physicsTick + Math.round(skill.durationSeconds * PHYSICS_TICK_RATE);
        return;
      }
      case 'speed': {
        player.speedUntilTick = this.physicsTick + Math.round(skill.durationSeconds * PHYSICS_TICK_RATE);
        return;
      }
      case 'cloak': {
        player.cloakUntilTick = this.physicsTick + Math.round(skill.durationSeconds * PHYSICS_TICK_RATE);
        return;
      }
      case 'aoe': {
        this.critterBlast(player.character.position, skill.radius, player.id, null);
        for (const other of this.players.values()) {
          if (other.id === player.id || !other.alive || untouchable(other)) continue;
          if (other.profile.faction === player.profile.faction) continue;
          // Crews inside the armour are out of reach.
          if (this.vehicles.isShielded(other.id)) continue;
          if (distance3(player.character.position, other.character.position) > skill.radius) continue;
          this.damagePlayer(other, player, skill.amount, null, false);
        }
        return;
      }
      case 'slow': {
        this.critterBlast(player.character.position, skill.radius, player.id, null);
        for (const other of this.players.values()) {
          if (other.id === player.id || !other.alive || untouchable(other)) continue;
          if (other.profile.faction === player.profile.faction) continue;
          // Crews inside the armour are out of reach.
          if (this.vehicles.isShielded(other.id)) continue;
          if (distance3(player.character.position, other.character.position) > skill.radius) continue;
          other.slowUntilTick = Math.max(
            other.slowUntilTick,
            this.physicsTick + Math.round(skill.durationSeconds * PHYSICS_TICK_RATE),
          );
          this.damagePlayer(other, player, skill.amount, null, false);
        }
        return;
      }
      case 'dash': {
        const yaw = player.lastInput.yaw;
        const direction = { x: Math.sin(yaw), y: 0, z: Math.cos(yaw) };
        const origin = this.eyePosition(player);
        const wall = this.physics.raycast(origin, direction, skill.amount);
        const travel = wall ? Math.max(0, wall.distance - 0.45) : skill.amount;
        const position = player.character.position;
        player.character.teleport({
          x: position.x + direction.x * travel,
          y: position.y + 0.08,
          z: position.z + direction.z * travel,
        });
        return;
      }
    }
    return;
  }

  private updateProjectiles(): void {
    for (let index = this.projectiles.length - 1; index >= 0; index -= 1) {
      const projectile = this.projectiles[index];
      if (!projectile) continue;
      if (this.physicsTick >= projectile.expiresAtTick) {
        this.projectiles.splice(index, 1);
        continue;
      }
      const owner = this.players.get(projectile.ownerId);
      if (!owner || !owner.alive) {
        this.projectiles.splice(index, 1);
        continue;
      }

      const speed = Math.hypot(projectile.velocity.x, projectile.velocity.y, projectile.velocity.z);
      const step = speed * FIXED_DT;
      const direction = normalizeDirection(projectile.velocity);
      const from = projectile.position;
      const worldHit = this.physics.raycast(from, direction, step);
      if (worldHit) {
        this.explode(owner, worldHit.point, projectile.damage, projectile.splashRadius, projectile.weaponId);
        this.projectiles.splice(index, 1);
        continue;
      }

      const targets = this.combatTargets(owner, 0);
      const hit = raycastTargets(from, direction, step, targets) ?? this.critters.raycast(from, direction, step, null);
      const next = {
        x: from.x + projectile.velocity.x * FIXED_DT,
        y: from.y + projectile.velocity.y * FIXED_DT,
        z: from.z + projectile.velocity.z * FIXED_DT,
      };
      projectile.position = next;
      projectile.velocity.y -= 9.81 * FIXED_DT;
      if (hit) {
        this.explode(owner, next, projectile.damage, projectile.splashRadius, projectile.weaponId);
        this.projectiles.splice(index, 1);
        continue;
      }
      if (next.y < FALL_RESPAWN_Y) {
        this.explode(owner, next, projectile.damage, projectile.splashRadius, projectile.weaponId);
        this.projectiles.splice(index, 1);
      }
    }
  }

  private explode(
    owner: PlayerConnection,
    position: Vec3,
    damage: number,
    radius: number,
    weaponId: WeaponId | null = null,
  ): void {
    if (radius <= 0) return;
    this.critterBlast(position, radius, owner.id, weaponId);
    for (const other of this.players.values()) {
      if (!other.alive || untouchable(other)) continue;
      if (other.id === owner.id) continue;
      if (other.profile.faction === owner.profile.faction) continue;
      if (this.vehicles.isShielded(other.id)) continue;
      const distance = distance3(position, other.character.position);
      if (distance > radius) continue;
      const falloff = Math.max(0.3, 1 - (distance / radius) * 0.7);
      this.damagePlayer(other, owner, damage * falloff, weaponId, false);
    }
    this.vehicles.explode(owner, position, damage, radius, weaponId);
    this.broadcastEvent({
      eventType: 'PROP_EXPLODE',
      actorId: owner.id,
      targetId: 0,
      paramX: Math.round(position.x),
      paramZ: Math.round(position.z),
      paramValue: Math.round(radius * 10),
    });
  }

  // ---------------------------------------------------------------------------
  // Mascots: rams, shockwaves, cowbell daze and coconut-milk puddles
  // ---------------------------------------------------------------------------

  private handleMascotEvent(player: PlayerConnection, event: MascotMotorEvent): void {
    const form = player.character.form;
    if (!form || !player.alive) return;
    if (event.type === 'move') {
      this.broadcastEvent({
        eventType: 'SKILL_USED',
        actorId: player.id,
        targetId: 0,
        paramX: event.slot,
        paramZ: 0,
        paramValue: event.slot,
      });
      if (event.slot === 3 && form === 'cow') this.ringCowbell(player);
      if (event.slot === 3 && form === 'coconut') this.spillMilk(player, event.position);
      return;
    }
    if (event.type === 'impact') {
      this.applyMascotShockwave(player, event.kind, event.position);
    }
  }

  private isEnemy(a: PlayerConnection, b: PlayerConnection): boolean {
    return a.id !== b.id && a.profile.faction !== b.profile.faction;
  }

  /** Hoof Stomp / Ground Pound: radial damage with outward knockback. */
  private applyMascotShockwave(
    player: PlayerConnection,
    kind: 'stomp' | 'pound',
    position: Vec3,
  ): void {
    const skill = kind === 'stomp' ? SKILLS.hoof_stomp : SKILLS.ground_pound;
    const wave = MASCOT_SHOCKWAVE[kind];
    const heading = player.character.heading;
    this.mascotStats.shockwaves += 1;
    // Same volume as for players: the radius on the ground, within the wave's vertical reach.
    this.critterBlast(position, skill.radius, player.id, kind === 'stomp' ? 'hoof_stomp' : 'ground_pound', wave.verticalReach);
    this.broadcastEvent({
      eventType: 'MASCOT_IMPACT',
      actorId: player.id,
      targetId: 0,
      paramX: toDecimetres(position.x),
      paramZ: toDecimetres(position.z),
      paramValue: kind === 'stomp' ? 1 : 2,
    });
    for (const other of this.players.values()) {
      if (!other.alive || !this.isEnemy(player, other) || untouchable(other)) continue;
      if (this.vehicles.isShielded(other.id)) continue;
      const feet = other.character.position;
      const dx = feet.x - position.x;
      const dz = feet.z - position.z;
      const distance = Math.hypot(dx, dz);
      if (distance > skill.radius || Math.abs(feet.y - position.y) > wave.verticalReach) continue;
      const closeness = 1 - distance / skill.radius;
      const directionX = distance > 0.1 ? dx / distance : Math.sin(heading);
      const directionZ = distance > 0.1 ? dz / distance : Math.cos(heading);
      if (this.physicsTick >= other.spawnProtectionUntil) {
        const push = wave.horizontal * (0.6 + 0.4 * closeness);
        other.character.launch(
          { x: directionX * push, y: wave.vertical, z: directionZ * push },
          wave.launchSeconds,
        );
      }
      this.damagePlayer(
        other,
        player,
        skill.amount * (0.5 + 0.5 * closeness),
        kind === 'stomp' ? 'hoof_stomp' : 'ground_pound',
        false,
      );
    }
  }

  /** Cowbell Clang: rivals in range are dazed (slowed, wobbly camera). */
  private ringCowbell(player: PlayerConnection): void {
    const skill = SKILLS.cowbell_clang;
    const until = this.physicsTick + secondsToTicks(skill.durationSeconds);
    for (const other of this.players.values()) {
      if (!other.alive || !this.isEnemy(player, other) || untouchable(other)) continue;
      if (this.physicsTick < other.spawnProtectionUntil) continue;
      if (this.vehicles.isShielded(other.id)) continue;
      if (distance3(player.character.position, other.character.position) > skill.radius) continue;
      other.dazedUntilTick = Math.max(other.dazedUntilTick, until);
      other.slowUntilTick = Math.max(other.slowUntilTick, until);
      other.lastAttackerId = player.id;
      this.mascotStats.dazes += 1;
    }
  }

  /**
   * Coconut Milk Splash: a puddle that makes the owner's rivals slide. A
   * splash cast in the air lands on the ground below, where it is drawn.
   */
  private spillMilk(player: PlayerConnection, position: Vec3): void {
    const skill = SKILLS.milk_splash;
    const ground = this.physics.raycast(
      { x: position.x, y: position.y + 0.3, z: position.z },
      { x: 0, y: -1, z: 0 },
      MASCOT_STATUS.puddleDropReach,
    );
    const groundY = ground ? ground.point.y : sampleMapHeight(position.x, position.z);
    this.puddles.push({
      ownerId: player.id,
      faction: player.profile.faction,
      position: { x: position.x, y: Math.min(position.y, groundY), z: position.z },
      radius: skill.radius,
      expiresAtTick: this.physicsTick + secondsToTicks(skill.durationSeconds),
    });
    while (this.puddles.length > MASCOT_STATUS.maxPuddles) this.puddles.shift();
    this.broadcastEvent({
      eventType: 'MASCOT_PUDDLE',
      actorId: player.id,
      targetId: 0,
      paramX: toDecimetres(position.x),
      paramZ: toDecimetres(position.z),
      paramValue: Math.round(skill.durationSeconds * 10),
    });
  }

  /** Expires puddles and sets per-tick slippery traction on the rivals inside. */
  private updatePuddles(): void {
    for (let index = this.puddles.length - 1; index >= 0; index -= 1) {
      const puddle = this.puddles[index];
      if (puddle && this.physicsTick >= puddle.expiresAtTick) this.puddles.splice(index, 1);
    }
    for (const player of this.players.values()) {
      let slippery = false;
      if (player.alive && !untouchable(player)) {
        const feet = player.character.position;
        for (const puddle of this.puddles) {
          if (puddle.faction === player.profile.faction) continue;
          const horizontal = Math.hypot(feet.x - puddle.position.x, feet.z - puddle.position.z);
          if (horizontal > puddle.radius) continue;
          // The puddle follows the ground, so its reach grows with the slope
          // allowance toward the rim (it still ignores roofs and bridges above).
          const reach =
            MASCOT_STATUS.puddleVerticalReach + horizontal * MASCOT_STATUS.puddleSlopeAllowance;
          if (Math.abs(feet.y - puddle.position.y) <= reach) {
            slippery = true;
            break;
          }
        }
      }
      player.character.setSlippery(slippery);
    }
  }

  private lagSampleAt(tick: number): LagSample | null {
    let best: LagSample | null = null;
    for (const sample of this.lagHistory) {
      if (sample.tick <= tick) best = sample;
      else break;
    }
    return best;
  }

  /** Centre of a mascot's ram contact sphere (ahead of the cow, the coconut's middle). */
  private ramContactPoint(player: PlayerConnection, form: MascotForm): Vec3 {
    const tuning = MASCOT_RAM[form];
    const feet = player.character.position;
    const heading = player.character.heading;
    return {
      x: feet.x + Math.sin(heading) * tuning.contactForward,
      y: feet.y + tuning.contactHeight,
      z: feet.z + Math.cos(heading) * tuning.contactForward,
    };
  }

  /**
   * Victim position the rammer's contact sphere touches, or null. Two mascots
   * touch symmetrically: either one's sphere reaching the other's body counts,
   * so the longer cow reach cannot decide a head-on clash on its own.
   */
  private ramTouch(
    rammer: PlayerConnection,
    form: MascotForm,
    victim: PlayerConnection,
    rewind: LagSample | null,
  ): Vec3 | null {
    const tuning = MASCOT_RAM[form];
    const contact = this.ramContactPoint(rammer, form);
    const stats = classStatsFor(victim.profile.cosmetics.classId, victim.profile.faction);
    const current = victim.character.position;
    const rewound = rewind?.players.get(victim.id);
    for (const candidate of rewound && rewound.alive ? [current, rewound.position] : [current]) {
      if (distanceToCapsule(contact, candidate, stats.radius, stats.height) <= tuning.contactRadius + stats.radius) {
        return candidate;
      }
    }
    const victimForm = victim.character.form;
    if (victimForm) {
      const rammerStats = classStatsFor(rammer.profile.cosmetics.classId, rammer.profile.faction);
      const reach = MASCOT_RAM[victimForm].contactRadius + rammerStats.radius;
      const victimContact = this.ramContactPoint(victim, victimForm);
      if (distanceToCapsule(victimContact, rammer.character.position, rammerStats.radius, rammerStats.height) <= reach) {
        return current;
      }
    }
    return null;
  }

  /** Every ram contact of this tick, from the pre-resolution poses and velocities. */
  private collectRamContacts(): RamContact[] {
    const contacts: RamContact[] = [];
    for (const rammer of this.players.values()) {
      const form = rammer.character.form;
      if (!form || !rammer.alive) continue;
      const tuning = MASCOT_RAM[form];
      const velocity = rammer.character.velocity;
      const speed = Math.hypot(velocity.x, velocity.z);
      if (speed < tuning.minSpeed) continue;
      const feet = rammer.character.position;
      const rewind = rammer.isBot ? null : this.lagSampleAt(this.physicsTick - MASCOT_RAM_REWIND_TICKS);
      for (const victim of this.players.values()) {
        if (victim.id === rammer.id || !victim.alive) continue;
        // Mascots charge straight through a drifter: no ram, no bump.
        if (untouchable(victim)) continue;
        if (this.vehicles.isShielded(victim.id)) continue;
        if (this.physicsTick < (rammer.ramCooldowns.get(victim.id) ?? 0)) continue;
        const touched = this.ramTouch(rammer, form, victim, rewind);
        if (!touched) continue;
        let normalX = touched.x - feet.x;
        let normalZ = touched.z - feet.z;
        const length = Math.hypot(normalX, normalZ);
        if (length < 0.05) {
          normalX = velocity.x / speed;
          normalZ = velocity.z / speed;
        } else {
          normalX /= length;
          normalZ /= length;
        }
        const victimVelocity = victim.character.velocity;
        const closing =
          (velocity.x - victimVelocity.x) * normalX + (velocity.z - victimVelocity.z) * normalZ;
        if (closing < tuning.minSpeed) continue;
        contacts.push({
          rammer,
          victim,
          form,
          touched,
          normalX,
          normalZ,
          closing,
          approach: velocity.x * normalX + velocity.z * normalZ,
          velocity,
          speed,
          boosting: rammer.character.mascotBoosting,
        });
      }
    }
    return contacts;
  }

  /** Damage and launch of one enemy ram at the given impact speed. */
  private ramHit(contact: RamContact, impactSpeed: number): RamHit {
    const tuning = MASCOT_RAM[contact.form];
    const strength = clamp01((impactSpeed - tuning.minSpeed) / (tuning.fullSpeed - tuning.minSpeed));
    const boost = contact.boosting ? tuning.boostMultiplier : 1;
    const damage = (tuning.minDamage + (tuning.maxDamage - tuning.minDamage) * strength) * boost;
    // Launch along the contact normal, carried a little in the travel direction.
    let launchX = contact.normalX + (contact.velocity.x / contact.speed) * 0.6;
    let launchZ = contact.normalZ + (contact.velocity.z / contact.speed) * 0.6;
    const launchLength = Math.hypot(launchX, launchZ) || 1;
    launchX /= launchLength;
    launchZ /= launchLength;
    const horizontal = Math.min(
      tuning.launchHorizontalCap,
      tuning.launchHorizontal + tuning.launchHorizontalPerSpeed * impactSpeed,
    );
    return {
      contact,
      damage,
      impactSpeed,
      launch: {
        x: launchX * horizontal,
        y: tuning.launchVertical + tuning.launchVerticalPerSpeed * impactSpeed,
        z: launchZ * horizontal,
      },
    };
  }

  /**
   * Ram ("umrammen") resolution after the physics step, in two phases: every
   * contact is collected from the same pre-resolution state, then all of them
   * are applied. Human mascots also test the victims' positions a few ticks
   * back, which is roughly what the rammer saw on screen. Two enemy mascots
   * that both charge into each other clash: each takes the other's ram,
   * scaled by the other's own speed, and both are launched.
   */
  private resolveMascotRams(): void {
    const contacts = this.collectRamContacts();
    if (contacts.length === 0) return;
    const handled = new Set<string>();
    const recoils = new Map<PlayerConnection, { keep: number; hop: number }>();
    const bumps: RamContact[] = [];
    const hits: RamHit[] = [];
    const addRecoil = (player: PlayerConnection, keep: number, hop: number): void => {
      const previous = recoils.get(player);
      recoils.set(player, {
        keep: Math.min(keep, previous?.keep ?? 1),
        hop: Math.max(hop, previous?.hop ?? 0),
      });
    };

    for (const contact of contacts) {
      const { rammer, victim } = contact;
      if (handled.has(`${rammer.id}>${victim.id}`)) continue;
      handled.add(`${rammer.id}>${victim.id}`);
      const tuning = MASCOT_RAM[contact.form];
      rammer.ramCooldowns.set(victim.id, this.physicsTick + secondsToTicks(tuning.victimCooldown));

      if (victim.profile.faction === rammer.profile.faction) {
        bumps.push(contact);
        addRecoil(rammer, MASCOT_FRIENDLY_BUMP.keep, 0);
        continue;
      }

      // An enemy mascot pair is resolved once, from both sides' own speeds.
      const counter = victim.character.form
        ? contacts.find((other) => other.rammer === victim && other.victim === rammer)
        : undefined;
      if (counter) {
        handled.add(`${victim.id}>${rammer.id}`);
        const counterTuning = MASCOT_RAM[counter.form];
        victim.ramCooldowns.set(rammer.id, this.physicsTick + secondsToTicks(counterTuning.victimCooldown));
        if (contact.approach >= tuning.minSpeed && counter.approach >= counterTuning.minSpeed) {
          hits.push(this.ramHit(contact, contact.approach), this.ramHit(counter, counter.approach));
          continue;
        }
        if (counter.approach > contact.approach) {
          // The "victim" is the one charging: it is the rammer of this pair.
          if (this.physicsTick >= rammer.spawnProtectionUntil) {
            hits.push(this.ramHit(counter, counter.closing));
            addRecoil(victim, counterTuning.recoilKeep, counterTuning.recoilHop);
          }
          continue;
        }
      }
      if (this.physicsTick < victim.spawnProtectionUntil) continue;
      hits.push(this.ramHit(contact, contact.closing));
      addRecoil(rammer, tuning.recoilKeep, tuning.recoilHop);
    }

    // Recoil first so a rammer that is also launched this tick keeps its flight.
    for (const [player, recoil] of recoils) player.character.applyRecoil(recoil.keep, recoil.hop);
    for (const bump of bumps) {
      let launchX = bump.normalX + (bump.velocity.x / bump.speed) * 0.6;
      let launchZ = bump.normalZ + (bump.velocity.z / bump.speed) * 0.6;
      const launchLength = Math.hypot(launchX, launchZ) || 1;
      launchX /= launchLength;
      launchZ /= launchLength;
      bump.victim.character.launch(
        {
          x: launchX * MASCOT_FRIENDLY_BUMP.horizontal,
          y: MASCOT_FRIENDLY_BUMP.vertical,
          z: launchZ * MASCOT_FRIENDLY_BUMP.horizontal,
        },
        MASCOT_FRIENDLY_BUMP.launchSeconds,
      );
      this.broadcastEvent({
        eventType: 'MASCOT_RAM',
        actorId: bump.rammer.id,
        targetId: bump.victim.id,
        paramX: toDecimetres(bump.touched.x),
        paramZ: toDecimetres(bump.touched.z),
        paramValue: 0,
      });
    }
    for (const hit of hits) {
      const { rammer, victim, form, touched } = hit.contact;
      // A spawn-protected side of a clash is neither launched nor hurt.
      if (!victim.alive || this.physicsTick < victim.spawnProtectionUntil) continue;
      victim.character.launch(hit.launch, MASCOT_RAM[form].launchSeconds);
      this.mascotStats.rams += 1;
      this.mascotStats.lastRam = {
        attackerId: rammer.id,
        victimId: victim.id,
        form,
        damage: Math.round(hit.damage),
        closingSpeed: Math.round(hit.impactSpeed * 100) / 100,
        launch: {
          x: Math.round(hit.launch.x * 100) / 100,
          y: Math.round(hit.launch.y * 100) / 100,
          z: Math.round(hit.launch.z * 100) / 100,
        },
        tick: this.physicsTick,
      };
      this.broadcastEvent({
        eventType: 'MASCOT_RAM',
        actorId: rammer.id,
        targetId: victim.id,
        paramX: toDecimetres(touched.x),
        paramZ: toDecimetres(touched.z),
        paramValue: Math.max(1, Math.round(hit.damage)),
      });
      this.damagePlayer(victim, rammer, hit.damage, MASCOT_RAM_WEAPON[form], false);
    }
  }

  // ---------------------------------------------------------------------------
  // Critters (wandering hens)
  // ---------------------------------------------------------------------------

  /**
   * Living, damageable players scare critters; nobody else does. Untouchable
   * drifters (classCapabilities(...).damageable === false) walk among the hens
   * without making them flee.
   */
  private critterThreats(): CritterThreat[] {
    const threats: CritterThreat[] = [];
    for (const player of this.players.values()) {
      if (player.alive && capabilitiesOf(player).damageable) {
        threats.push({ position: player.character.position });
      }
    }
    return threats;
  }

  /** Splash, shockwaves and area skills: critters inside die, those nearby scatter. */
  private critterBlast(
    position: Vec3,
    radius: number,
    killerId: number,
    weaponId: WeaponId | null,
    verticalReach: number | null = null,
  ): void {
    this.critters.killInSphere(position, radius, killerId, weaponId, null, verticalReach);
    this.critters.alertBlast(position, radius);
  }

  /** A charging mascot runs critters over (contact sphere, current and rewound poses). */
  private resolveCritterRams(): void {
    for (const rammer of this.players.values()) {
      const form = rammer.character.form;
      if (!form || !rammer.alive) continue;
      const tuning = MASCOT_RAM[form];
      const velocity = rammer.character.velocity;
      if (Math.hypot(velocity.x, velocity.z) < tuning.minSpeed) continue;
      const rewindTick = rammer.isBot ? null : this.physicsTick - MASCOT_RAM_REWIND_TICKS;
      this.critters.killInSphere(
        this.ramContactPoint(rammer, form),
        tuning.contactRadius,
        rammer.id,
        MASCOT_RAM_WEAPON[form],
        rewindTick,
      );
    }
  }

  private broadcastCritterKill(kill: CritterKill): void {
    this.broadcastEvent({
      eventType: 'CRITTER_KILLED',
      actorId: kill.killerId,
      targetId: kill.critterId,
      paramX: toDecimetres(kill.position.x),
      paramZ: toDecimetres(kill.position.z),
      paramValue: critterKillValue(kill.species, kill.weaponId),
    });
  }

  /** DEV-only probe (FF_DEV_TOOLS=1): gathers the critters of that half around a point. */
  devGatherCritters(x: number, z: number): { ok: boolean; moved: number } {
    const hit = this.physics.raycast({ x, y: 160, z }, { x: 0, y: -1, z: 0 }, 200);
    const moved = this.critters.gather({ x, y: hit?.point.y ?? 0, z });
    return { ok: moved > 0, moved };
  }

  // ---------------------------------------------------------------------------
  // Drifters: supply aura ("Versorgungs-Aura") and support points
  // ---------------------------------------------------------------------------

  /**
   * Every tick, each living teammate of a drifter within DRIFTER_AURA.radius
   * is supplied by exactly one drifter (the nearest; a second one adds
   * nothing): vitality regenerates while the teammate has been out of combat
   * for outOfCombatSeconds, and every weapon slot with a reserve refills one
   * magazine's worth per magazineSeconds (never the loaded magazine). The
   * supplying drifter earns a support point per vitalityPerPoint healed and per
   * magazinesPerPoint handed out. Drifters and enemies are never supplied.
   */
  private updateSupplyAura(): void {
    const drifters: PlayerConnection[] = [];
    for (const player of this.players.values()) {
      player.auraHealed = false;
      player.auraResupplied = false;
      player.auraActive = false;
      if (player.alive && player.character.drifter) drifters.push(player);
    }
    if (drifters.length === 0) return;
    const aura = DRIFTER_AURA;
    for (const mate of this.players.values()) {
      if (!mate.alive || mate.character.drifter) continue;
      const feet = mate.character.position;
      let supplier: PlayerConnection | null = null;
      let nearest = Number.POSITIVE_INFINITY;
      for (const drifter of drifters) {
        if (drifter.profile.faction !== mate.profile.faction) continue;
        const distance = distance3(drifter.character.position, feet);
        if (distance <= aura.radius && distance < nearest) {
          nearest = distance;
          supplier = drifter;
        }
      }
      if (!supplier) continue;

      const maxHp = classStatsFor(mate.profile.cosmetics.classId, mate.profile.faction).maxHp;
      const outOfCombat = this.physicsTick - mate.lastDamagedTick >= AURA_OUT_OF_COMBAT_TICKS;
      if (outOfCombat && mate.hp < maxHp) {
        const healed = Math.min(AURA_HEAL_PER_TICK, maxHp - mate.hp);
        mate.hp = Math.min(maxHp, mate.hp + healed);
        mate.auraHealed = true;
        supplier.auraActive = true;
        supplier.supportVitality += healed;
      }

      if (!mate.character.form && capabilitiesOf(mate).armed) {
        for (let index = 0; index < 3; index += 1) {
          const slot = (index + 1) as WeaponSlot;
          const stats = WEAPON_STATS[weaponForSlot(mate.profile.loadout, slot)];
          const ammo = mate.ammo[index];
          // Charge gimmicks without a reserve (and melee) are not resupplied.
          if (!ammo || stats.magazine <= 0 || stats.reserve <= 0) continue;
          if (ammo.reserve >= stats.reserve) {
            mate.supplyAmmo[index] = 0;
            continue;
          }
          // Exact integer bookkeeping: every tick owes `magazine` units and one
          // round costs AURA_MAGAZINE_TICKS units (one magazine per magazineSeconds).
          const owed = (mate.supplyAmmo[index] ?? 0) + stats.magazine;
          const whole = Math.floor(owed / AURA_MAGAZINE_TICKS);
          const rounds = Math.min(whole, stats.reserve - ammo.reserve);
          mate.supplyAmmo[index] = owed - whole * AURA_MAGAZINE_TICKS;
          if (rounds > 0) {
            ammo.reserve += rounds;
            supplier.supportMagazines += rounds / stats.magazine;
          }
          mate.auraResupplied = true;
          supplier.auraActive = true;
        }
      }
    }
    for (const drifter of drifters) {
      drifter.support =
        Math.floor(drifter.supportVitality / aura.vitalityPerPoint + SUPPORT_EPSILON) +
        Math.floor(drifter.supportMagazines / aura.magazinesPerPoint + SUPPORT_EPSILON);
    }
  }

  private drifterStatus(): RoomStatus['drifters'] {
    let active = 0;
    let vitalityHealed = 0;
    let magazinesRefilled = 0;
    let supportPoints = 0;
    for (const player of this.players.values()) {
      if (player.character.drifter) active += 1;
      vitalityHealed += player.supportVitality;
      magazinesRefilled += player.supportMagazines;
      supportPoints += player.support;
    }
    return {
      active,
      vitalityHealed: Math.round(vitalityHealed * 10) / 10,
      magazinesRefilled: Math.round(magazinesRefilled * 100) / 100,
      supportPoints,
    };
  }

  /** Mascot-capable bots re-roll between the mascot and their human class. */
  private rollBotClass(player: PlayerConnection, position: Vec3): void {
    const bot = player.bot;
    if (!bot || bot.mascotChance <= 0) return;
    const classId: ClassId = Math.random() < bot.mascotChance ? 'mascot' : bot.humanClass;
    if (classId === player.profile.cosmetics.classId) return;
    if (!classCapabilities(classId).botsMayPick) return;
    const base = createDefaultProfile(player.profile.displayName, classId);
    player.profile = {
      ...base,
      displayName: player.profile.displayName,
      faction: player.profile.faction,
      loadout: { ...CLASS_DEFAULT_LOADOUTS[classId] },
    };
    this.physics.removeCharacter(player.character);
    player.character = this.physics.createCharacter({
      position,
      classId,
      faction: player.profile.faction,
    });
    bot.mascot.stuckTicks = 0;
    bot.mascot.reverseUntilTick = 0;
    bot.stuckTicks = 0;
    bot.detourUntilTick = 0;
    this.broadcastProfile(player);
  }

  private spawnBots(count: number): void {
    for (const entry of BOT_NAMES.slice(0, Math.max(0, count))) {
      const id = this.allocatePlayerId();
      const classId: ClassId = entry.mascotChance > 0 ? 'mascot' : entry.classId;
      const base = createDefaultProfile(entry.name, classId);
      const profile: PlayerProfile = {
        ...base,
        faction: entry.faction,
        loadout: { ...CLASS_DEFAULT_LOADOUTS[classId] },
      };
      const spawn = this.spawnFor(entry.faction);
      const character = this.physics.createCharacter({
        position: spawn.position,
        classId,
        faction: entry.faction,
      });
      const player: PlayerConnection = {
        id,
        socket: null,
        isBot: true,
        profile,
        character,
        inputQueue: [],
        fireQueue: [],
        lastInput: idleInput(0, Math.random() * Math.PI * 2, -0.05, 1),
        lastProcessedInput: 0,
        previousButtons: 0,
        hp: classStatsFor(classId, entry.faction).maxHp,
        shield: 0,
        alive: true,
        ammo: createAmmo(profile.loadout),
        activeSlot: 1,
        reloadEndsTick: 0,
        lastFireTick: -999,
        kills: 0,
        deaths: 0,
        respawnAtTick: 0,
        spawnProtectionUntil: this.physicsTick + SPAWN_PROTECTION_TICKS,
        killerId: 0,
        lastAttackerId: 0,
        skillCooldowns: [0, 0, 0],
        speedUntilTick: 0,
        shieldUntilTick: 0,
        cloakUntilTick: 0,
        slowUntilTick: 0,
        dazedUntilTick: 0,
        ramCooldowns: new Map(),
        lastDamagedTick: NEVER_DAMAGED_TICK,
        supplyAmmo: [0, 0, 0],
        support: 0,
        supportVitality: 0,
        supportMagazines: 0,
        auraHealed: false,
        auraResupplied: false,
        auraActive: false,
        lastProfileUpdateAt: 0,
        bot: {
          mascotChance: entry.mascotChance,
          humanClass: entry.classId,
          mascot: { stuckTicks: 0, reverseUntilTick: 0, steerBias: Math.random() < 0.5 ? -1 : 1 },
          stuckTicks: 0,
          detourUntilTick: 0,
          detourSide: Math.random() < 0.5 ? -1 : 1,
          targetId: 0,
          nextThinkTick: 0,
          nextFireTick: 0,
          nextJumpTick: 0,
          nextSkillTick: 0,
          nextStrafeTick: 0,
          strafeDirection: Math.random() < 0.5 ? -1 : 1,
          aimError: 0,
          patrolYaw: Math.random() * Math.PI * 2,
          route: createBotRoute(),
        },
      };
      this.players.set(id, player);
    }
  }

  private botInput(player: PlayerConnection): PlayerInput {
    const bot = player.bot;
    if (!bot) {
      return idleInput(
        player.lastProcessedInput + 1,
        player.lastInput.yaw,
        player.lastInput.pitch,
        1,
      );
    }

    if (this.physicsTick >= bot.nextThinkTick) {
      bot.nextThinkTick = this.physicsTick + 12;
      bot.targetId = this.selectBotTarget(player);
    }

    const target = bot.targetId > 0 ? this.players.get(bot.targetId) : null;
    const live = target && target.alive ? target : null;
    if (player.character.form) return this.mascotBotInput(player, bot, live);

    const classId = player.profile.cosmetics.classId;
    const feet = player.character.position;
    const route = bot.route;
    const weaponId = weaponForSlot(player.profile.loadout, player.activeSlot);
    const weapon = WEAPON_STATS[weaponId];
    let buttons = 0;
    let yaw = player.lastInput.yaw;
    let pitch = player.lastInput.pitch;

    if (live) {
      const origin = this.eyePosition(player);
      const targetPoint = {
        x: live.character.position.x,
        y: live.character.position.y + live.character.eyeHeight * 0.85,
        z: live.character.position.z,
      };
      const dx = targetPoint.x - origin.x;
      const dy = targetPoint.y - origin.y;
      const dz = targetPoint.z - origin.z;
      const horizontal = Math.hypot(dx, dz);
      yaw = Math.atan2(dx, dz);
      pitch = Math.atan2(dy, Math.max(0.001, horizontal)) + bot.aimError;
      const distance = Math.hypot(horizontal, dy);
      const targetDirection = normalizeDirection({ x: dx, y: dy, z: dz });

      // Out of sight (across the gorge, behind a chalet) or blocked while
      // charging: follow the waypoint graph towards the target instead.
      if (this.physicsTick >= route.nextSightTick) {
        route.nextSightTick = this.physicsTick + 12;
        route.seesTarget = this.hasLineOfSight(origin, targetPoint, distance, targetDirection, live.id);
      }
      if (!route.seesTarget || this.physicsTick < route.chaseUntilTick) {
        // Routed movement has its own stuck escalation (hop, sidestep, re-plan).
        bot.stuckTicks = 0;
        bot.detourUntilTick = 0;
        routeTowards(route, feet, live.character.position, this.physicsTick);
        const steer = steerAlongRoute(route, feet, this.physicsTick, Math.random);
        let chaseButtons = InputButton.Forward;
        if (steer.sprint) chaseButtons |= InputButton.Sprint;
        if (steer.jump) chaseButtons |= InputButton.Jump;
        const chaseAmmo = player.ammo[0];
        if (chaseAmmo && chaseAmmo.magazine <= 0 && chaseAmmo.reserve > 0) chaseButtons |= InputButton.Reload;
        return { sequence: player.lastProcessedInput + 1, buttons: chaseButtons, yaw: steer.yaw, pitch: -0.05, weaponSlot: 1 };
      }

      // Line of sight, refreshed every 12 ticks (firing re-checks it below).
      const visible = route.seesTarget;
      const detouring = this.physicsTick < bot.detourUntilTick;
      const charging = distance > Math.max(9, weapon.range * 0.45);
      if (detouring) {
        // Walk sideways around the prop that blocked the charge, hopping onto ledges.
        yaw += (bot.detourSide * Math.PI) / 2;
        pitch = -0.05;
        buttons |= InputButton.Forward | InputButton.Sprint;
        buttons |= bot.detourSide > 0 ? InputButton.Left : InputButton.Right;
        if (this.physicsTick >= bot.nextJumpTick) {
          buttons |= InputButton.Jump;
          bot.nextJumpTick = this.physicsTick + 24;
        }
      } else {
        if (charging) buttons |= InputButton.Forward;
        if (distance > 24) buttons |= InputButton.Sprint;
        if (visible && distance < 5) buttons |= InputButton.Backward;
        if (this.physicsTick >= bot.nextStrafeTick) {
          bot.strafeDirection *= -1;
          bot.nextStrafeTick = this.physicsTick + 40 + Math.floor(Math.random() * 45);
        }
        if (visible && distance < 32) {
          buttons |= bot.strafeDirection > 0 ? InputButton.Right : InputButton.Left;
        }
        if (this.physicsTick >= bot.nextJumpTick && distance < 17) {
          buttons |= InputButton.Jump;
          bot.nextJumpTick = this.physicsTick + 140 + Math.floor(Math.random() * 120);
        }

        if (
          this.physicsTick >= bot.nextFireTick &&
          distance <= weapon.range &&
          this.hasLineOfSight(origin, targetPoint, distance, targetDirection, live.id)
        ) {
          buttons |= InputButton.FirePrimary;
          const interval = Math.max(
            1,
            Math.round((PHYSICS_TICK_RATE * 60) / Math.max(1, weapon.rpm)),
          );
          bot.nextFireTick =
            this.physicsTick +
            interval +
            (weapon.automatic ? 0 : 5) +
            Math.floor(Math.random() * 9);
          bot.aimError = (Math.random() - 0.5) * 0.045;
        }

        if (
          player.hp < classStatsFor(classId, player.profile.faction).maxHp * 0.42 &&
          this.physicsTick >= bot.nextSkillTick
        ) {
          buttons |= InputButton.Skill1;
          bot.nextSkillTick = this.physicsTick + 180;
        }
      }

      // Two-stage unstick for the straight (unrouted) charge: a prop that
      // blocks the body for a second starts a sideways detour (a blocked
      // detour flips side); no net progress for two seconds escalates to the
      // waypoint graph, which then owns the stuck handling.
      if (charging || detouring) {
        if (engagementBlocked(route, feet, this.physicsTick)) {
          route.chaseUntilTick = this.physicsTick + 300;
          bot.detourUntilTick = 0;
          bot.stuckTicks = 0;
        }
      } else {
        route.engageCheckTick = this.physicsTick;
        route.engageCheckPosition = { ...feet };
      }
      const velocity = player.character.velocity;
      const blocked =
        (buttons & InputButton.Forward) !== 0 &&
        player.character.grounded &&
        Math.hypot(velocity.x, velocity.z) < BOT_STUCK_SPEED;
      if (blocked) bot.stuckTicks += 1;
      else bot.stuckTicks = Math.max(0, bot.stuckTicks - 2);
      const limit = detouring ? BOT_STUCK_TICKS / 2 : BOT_STUCK_TICKS;
      if (bot.stuckTicks > limit) {
        bot.stuckTicks = 0;
        if (detouring) bot.detourSide = -bot.detourSide;
        bot.detourUntilTick = this.physicsTick + BOT_DETOUR_TICKS;
      }
    } else {
      // Patrol the waypoint graph towards a tower or a random landmark.
      bot.stuckTicks = 0;
      bot.detourUntilTick = 0;
      const steer = steerAlongRoute(route, feet, this.physicsTick, Math.random);
      yaw = steer.yaw;
      bot.patrolYaw = yaw;
      pitch = -0.05;
      buttons |= InputButton.Forward;
      if (steer.sprint) buttons |= InputButton.Sprint;
      if (steer.jump) buttons |= InputButton.Jump;
    }

    const ammo = player.ammo[0];
    if (ammo && ammo.magazine <= 0 && ammo.reserve > 0) {
      buttons |= InputButton.Reload;
    }

    return {
      sequence: player.lastProcessedInput + 1,
      buttons,
      yaw,
      pitch,
      weaponSlot: 1,
    };
  }

  /**
   * Mascot bots: a visible rival is charged directly (cow heading steering,
   * coconut velocity homing in mascotBotButtons). Patrols and rivals out of
   * sight, or a charge that made no progress, follow the waypoint graph; the
   * route's yaw becomes the mascot's patrol heading. The motor-level backing
   * out / rolling detour in mascotBotButtons stays as the body's own recovery
   * (a cow cannot sidestep), the route handles re-planning.
   */
  private mascotBotInput(
    player: PlayerConnection,
    bot: BotState,
    target: PlayerConnection | null,
  ): PlayerInput {
    const route = bot.route;
    const feet = player.character.position;
    let pursue = target;
    if (target) {
      const origin = this.eyePosition(player);
      const targetPoint = {
        x: target.character.position.x,
        y: target.character.position.y + target.character.eyeHeight * 0.6,
        z: target.character.position.z,
      };
      const dx = targetPoint.x - origin.x;
      const dy = targetPoint.y - origin.y;
      const dz = targetPoint.z - origin.z;
      const distance = Math.hypot(dx, dy, dz);
      if (this.physicsTick >= route.nextSightTick) {
        route.nextSightTick = this.physicsTick + 12;
        route.seesTarget = this.hasLineOfSight(
          origin,
          targetPoint,
          distance,
          normalizeDirection({ x: dx, y: dy, z: dz }),
          target.id,
        );
      }
      if (!route.seesTarget || this.physicsTick < route.chaseUntilTick) {
        routeTowards(route, feet, target.character.position, this.physicsTick);
        pursue = null;
      } else if (Math.hypot(dx, dz) > 6) {
        if (engagementBlocked(route, feet, this.physicsTick)) {
          route.chaseUntilTick = this.physicsTick + 300;
        }
      } else {
        route.engageCheckTick = this.physicsTick;
        route.engageCheckPosition = { ...feet };
      }
    }
    let routeButtons = 0;
    let pivot = false;
    const swimming = player.character.swimming;
    if (!pursue) {
      const steer = steerAlongRoute(route, feet, this.physicsTick, Math.random);
      bot.patrolYaw = steer.yaw;
      if (steer.jump) routeButtons |= InputButton.Jump;
      // Long legs of an out-of-sight chase at a gallop (the coconut ignores it).
      if (steer.sprint && target) routeButtons |= InputButton.Sprint;
      if (swimWatchdog(route, feet, swimming, this.physicsTick, Math.random)) {
        // Gave up on that exit: back out and head for the next one.
        if (player.character.form === 'cow') {
          bot.mascot.steerBias = Math.random() < 0.5 ? -1 : 1;
          bot.mascot.reverseUntilTick = this.physicsTick + PHYSICS_TICK_RATE;
        }
      } else if ((swimming || feet.y < WATER_LEVEL) && player.character.form === 'cow') {
        // Swimming or wading, the cow turns too slowly to pivot onto a stair at its toe: line it up.
        const exitYaw = swimExitYaw(route, feet, swimming);
        if (exitYaw !== null) {
          bot.patrolYaw = exitYaw;
          // Far off the stair heading: pivot on the spot instead of looping wide.
          const error = exitYaw - player.character.heading;
          pivot = Math.abs(Math.atan2(Math.sin(error), Math.cos(error))) > MASCOT_EXIT_PIVOT;
        }
      }
    } else {
      swimWatchdog(route, feet, false, this.physicsTick, Math.random);
    }
    const command = mascotBotButtons(
      player.character,
      bot.mascot,
      pursue ? pursue.character.position : null,
      pursue ? pursue.character.velocity : null,
      bot.patrolYaw,
      this.physicsTick,
    );
    let buttons = command.buttons | routeButtons;
    if (pivot) buttons &= ~(InputButton.Forward | InputButton.Sprint);
    return {
      sequence: player.lastProcessedInput + 1,
      buttons,
      yaw: command.yaw,
      pitch: 0,
      weaponSlot: 1,
    };
  }

  private selectBotTarget(player: PlayerConnection): number {
    let bestId = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const other of this.players.values()) {
      if (other.id === player.id || !other.alive) continue;
      if (other.profile.faction === player.profile.faction) continue;
      // Bots never waste a bullet on a drifter: nothing can touch her.
      if (untouchable(other)) continue;
      const distance = distance3(player.character.position, other.character.position);
      if (distance > 85) continue;
      if (
        this.physicsTick < other.cloakUntilTick &&
        distance > 4.5
      ) {
        continue;
      }
      if (distance < bestDistance) {
        bestDistance = distance;
        bestId = other.id;
      }
    }
    return bestId;
  }

  private hasLineOfSight(
    origin: Vec3,
    target: Vec3,
    distance: number,
    direction: Vec3,
    targetId = 0,
  ): boolean {
    const hit = this.physics.raycast(origin, direction, distance);
    // The hull of the vehicle the target rides counts as a clear shot at it.
    return hit === null || hit.distance >= distance - 0.6 || this.vehicles.isVehicleSurfaceNear(hit.point, target, targetId);
  }

  join(socket: GameSocket, hello: ServerHello): JoinResult | JoinError {
    if (hello.protocolVersion !== PROTOCOL_VERSION) {
      return { ok: false, code: 4002, reason: 'Protocol version mismatch.' };
    }
    if (this.players.size >= MAX_PLAYERS) {
      return { ok: false, code: 4004, reason: 'The resort is full.' };
    }
    if (this.sockets.has(socket)) {
      return { ok: false, code: 4005, reason: 'This socket already joined.' };
    }

    const id = this.allocatePlayerId();
    const requested = normalizeProfile(hello.profile);
    const faction = this.pickFaction(requested.faction, requested.cosmetics.classId);
    // A drifter form that has not shipped falls back to the default class.
    const classId: ClassId = resolveClassForFaction(requested.cosmetics.classId, faction);
    const displayName = sanitizeDisplayName(requested.displayName, `Vacationer ${id}`);
    const profile: PlayerProfile = {
      displayName,
      faction,
      cosmetics: { ...requested.cosmetics, classId },
      loadout: requested.loadout,
    };
    const spawn = this.spawnFor(faction);
    const character = this.physics.createCharacter({ position: spawn.position, classId, faction });
    const player: PlayerConnection = {
      id,
      socket,
      isBot: false,
      profile,
      character,
      inputQueue: [],
      fireQueue: [],
      lastInput: idleInput(0, 0, 0, 1),
      lastProcessedInput: 0,
      previousButtons: 0,
      hp: classStatsFor(classId, faction).maxHp,
      shield: 0,
      alive: true,
      ammo: createAmmo(profile.loadout),
      activeSlot: 1,
      reloadEndsTick: 0,
      lastFireTick: -999,
      kills: 0,
      deaths: 0,
      respawnAtTick: 0,
      spawnProtectionUntil: this.physicsTick + SPAWN_PROTECTION_TICKS,
      killerId: 0,
      lastAttackerId: 0,
      skillCooldowns: [0, 0, 0],
      speedUntilTick: 0,
      shieldUntilTick: 0,
      cloakUntilTick: 0,
      slowUntilTick: 0,
      dazedUntilTick: 0,
      ramCooldowns: new Map(),
      lastDamagedTick: NEVER_DAMAGED_TICK,
      supplyAmmo: [0, 0, 0],
      support: 0,
      supportVitality: 0,
      supportMagazines: 0,
      auraHealed: false,
      auraResupplied: false,
      auraActive: false,
      lastProfileUpdateAt: 0,
      bot: null,
    };
    this.players.set(id, player);
    this.sockets.set(socket, id);

    const profiles: ProfileMessage[] = [];
    const newProfilePacket = encodeProfileMessage({ playerId: id, profile });
    for (const other of this.players.values()) {
      if (other.id === id) continue;
      profiles.push({ playerId: other.id, profile: other.profile });
      other.socket?.send(newProfilePacket);
    }

    return {
      ok: true,
      welcome: {
        playerId: id,
        profile,
        serverTick: this.snapshotTick,
        spawn: { ...spawn.position },
        protocolVersion: PROTOCOL_VERSION,
      },
      mapState: {
        destructibles: [],
        bridges: [],
        craters: [],
      },
      profiles,
    };
  }

  leaveBySocket(socket: GameSocket): void {
    const playerId = this.sockets.get(socket);
    if (playerId === undefined) return;
    this.sockets.delete(socket);
    const player = this.players.get(playerId);
    if (!player) return;
    this.players.delete(playerId);
    this.physics.removeCharacter(player.character);
  }

  handleInput(socket: GameSocket, input: PlayerInput): void {
    const playerId = this.sockets.get(socket);
    if (playerId === undefined) return;
    const player = this.players.get(playerId);
    if (!player || player.isBot) return;
    if (player.inputQueue.length >= MAX_INPUT_BACKLOG) {
      player.inputQueue.shift();
    }
    player.inputQueue.push(input);
  }

  handleFire(socket: GameSocket, fire: FireRequest): void {
    const playerId = this.sockets.get(socket);
    if (playerId === undefined) return;
    const player = this.players.get(playerId);
    if (!player || player.isBot || !player.alive) return;
    if (player.character.form || !capabilitiesOf(player).armed) return;
    if (!this.vehicles.mayUseHandWeapons(player.id)) return;
    const weaponId = WEAPON_TABLE.byCode[fire.weaponId];
    if (!weaponId) return;
    if (weaponId !== weaponForSlot(player.profile.loadout, player.activeSlot)) return;
    const serverEye = this.eyePosition(player);
    if (distance3(serverEye, fire.origin) > 6) return;
    if (player.fireQueue.length >= 8) player.fireQueue.shift();
    player.fireQueue.push(fire);
  }

  /**
   * Applies a validated cosmetic/class/loadout change. Faction stays
   * server-assigned; a class change rebuilds the capsule at the same feet
   * position and restores full class health.
   */
  handleProfileUpdate(socket: GameSocket, incoming: PlayerProfile): void {
    const playerId = this.sockets.get(socket);
    if (playerId === undefined) return;
    const player = this.players.get(playerId);
    if (!player) return;

    const now = Date.now();
    if (now - player.lastProfileUpdateAt < PROFILE_UPDATE_COOLDOWN_MS) return;
    player.lastProfileUpdateAt = now;

    const normalized = normalizeProfile(incoming, player.profile);
    // The faction stays; a drifter form that has not shipped falls back.
    const classId = resolveClassForFaction(normalized.cosmetics.classId, player.profile.faction);
    const profile: PlayerProfile = {
      displayName: sanitizeDisplayName(normalized.displayName, `Vacationer ${player.id}`),
      faction: player.profile.faction,
      cosmetics: { ...normalized.cosmetics, classId },
      loadout: normalized.loadout,
    };

    const classChanged = classId !== player.profile.cosmetics.classId;
    if (classChanged) {
      const position = player.character.position;
      this.physics.removeCharacter(player.character);
      player.character = this.physics.createCharacter({
        position,
        classId,
        faction: player.profile.faction,
      });
    }

    player.profile = profile;
    player.hp = classStatsFor(classId, profile.faction).maxHp;
    player.shield = 0;
    player.alive = true;
    player.respawnAtTick = 0;
    player.killerId = 0;
    player.ammo = createAmmo(profile.loadout);
    player.activeSlot = 1;
    player.reloadEndsTick = 0;
    player.lastFireTick = -999;
    player.skillCooldowns = [0, 0, 0];
    player.speedUntilTick = 0;
    player.shieldUntilTick = 0;
    player.cloakUntilTick = 0;
    player.slowUntilTick = 0;
    player.dazedUntilTick = 0;
    player.ramCooldowns.clear();
    player.lastDamagedTick = NEVER_DAMAGED_TICK;
    player.supplyAmmo = [0, 0, 0];
    player.spawnProtectionUntil = this.physicsTick + SPAWN_PROTECTION_TICKS;
    player.inputQueue.length = 0;
    player.fireQueue.length = 0;
    player.previousButtons = 0;
    player.character.setColliderEnabled(true);
    this.broadcastProfile(player);
  }

  broadcastEvent(event: GameEvent): void {
    const packet = encodeGameEvent(event);
    for (const player of this.players.values()) {
      player.socket?.send(packet);
    }
  }

  private broadcastProfile(player: PlayerConnection): void {
    const packet = encodeProfileMessage({ playerId: player.id, profile: player.profile });
    for (const other of this.players.values()) {
      other.socket?.send(packet);
    }
  }

  private broadcastSnapshot(): void {
    const packet = encodeSnapshot(this.buildSnapshot());
    for (const player of this.players.values()) {
      player.socket?.send(packet);
    }
  }

  private buildSnapshot(): WorldSnapshot {
    const players: PlayerState[] = [];
    for (const player of this.players.values()) {
      const state = player.character;
      const classId = player.profile.cosmetics.classId;
      const unarmed = state.form !== null || !classCapabilities(classId).armed;
      players.push({
        id: player.id,
        faction: player.profile.faction,
        classId,
        position: state.position,
        velocity: state.velocity,
        yaw: state.yaw,
        hp: player.hp,
        maxHp: classStatsFor(classId, player.profile.faction).maxHp,
        grounded: state.grounded,
        alive: player.alive,
        crouched: state.crouched,
        swimming: state.swimming,
        sprinting: state.sprinting,
        rolling: state.rolling,
        parachuteState: state.parachuteState,
        weaponSlot: player.activeSlot,
        // Mascot slots are moves and drifters are unarmed: no magazine to report.
        ammo: unarmed ? 0 : (player.ammo[player.activeSlot - 1]?.magazine ?? 0),
        reserve: unarmed ? 0 : (player.ammo[player.activeSlot - 1]?.reserve ?? 0),
        reloading: player.reloadEndsTick > this.physicsTick,
        shield: Math.round(player.shield),
        kills: player.kills,
        deaths: player.deaths,
        skillCooldown1: player.skillCooldowns[0] ?? 0,
        skillCooldown2: player.skillCooldowns[1] ?? 0,
        skillCooldown3: player.skillCooldowns[2] ?? 0,
        cloaked: this.physicsTick < player.cloakUntilTick,
        lastProcessedInput: player.lastProcessedInput,
        heading: state.heading,
        launchSeconds: state.launchSeconds,
        dazed: this.physicsTick < player.dazedUntilTick,
        slowed: this.physicsTick < player.slowUntilTick,
        boosted: this.physicsTick < player.speedUntilTick,
        slippery: state.isSlippery,
        support: player.support,
        auraHealed: player.auraHealed,
        auraResupplied: player.auraResupplied,
        auraActive: player.auraActive,
        mascot: state.mascotState,
      });
    }
    const wind = this.currentWind();
    return {
      serverTick: this.snapshotTick,
      weatherBalance: this.weatherBalance,
      windAngle: wind.angle,
      windStrength: wind.strength,
      ticketsAlpine: this.ticketsAlpine,
      ticketsLagoon: this.ticketsLagoon,
      turretStates: 0,
      players,
      vehicles: this.vehicles.snapshot(),
      critters: this.critters.states(),
    };
  }

  /**
   * Balances the teams; on a tie the player's wardrobe preference wins. A
   * class that adds no combat strength (the drifter) is neither balanced nor
   * counted: she joins her preferred side, or the side whose form exists.
   */
  private pickFaction(preferred: Faction, classId: ClassId): Faction {
    if (!classCapabilities(classId).countsTowardBalance) {
      if (classAvailableForFaction(classId, preferred)) return preferred;
      const other: Faction = preferred === 'alpine' ? 'lagoon' : 'alpine';
      if (classAvailableForFaction(classId, other)) return other;
    }
    let alpine = 0;
    let lagoon = 0;
    for (const player of this.players.values()) {
      if (!capabilitiesOf(player).countsTowardBalance) continue;
      if (player.profile.faction === 'alpine') alpine += 1;
      else lagoon += 1;
    }
    if (alpine < lagoon) return 'alpine';
    if (lagoon < alpine) return 'lagoon';
    return preferred;
  }

  private allocatePlayerId(): number {
    for (let attempt = 0; attempt < 65535; attempt += 1) {
      const candidate = this.nextPlayerId;
      this.nextPlayerId = this.nextPlayerId >= 65535 ? 1 : this.nextPlayerId + 1;
      if (!this.players.has(candidate)) return candidate;
    }
    throw new Error('No free player id.');
  }

  getServerTick(): number {
    return this.snapshotTick;
  }

  getStatus(): RoomStatus {
    return {
      online: true,
      players: this.players.size,
      maxPlayers: MAX_PLAYERS,
      serverTick: this.snapshotTick,
      physicsTick: this.physicsTick,
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
      protocolVersion: PROTOCOL_VERSION,
      mapId: MAP_ID,
      tickets: { alpine: this.ticketsAlpine, lagoon: this.ticketsLagoon },
      weatherBalance: this.weatherBalance,
      mascots: {
        active: [...this.players.values()].filter((player) => player.character.form !== null).length,
        rams: this.mascotStats.rams,
        shockwaves: this.mascotStats.shockwaves,
        dazes: this.mascotStats.dazes,
        puddles: this.puddles.length,
        lastRam: this.mascotStats.lastRam,
      },
      vehicles: this.vehicles.status(),
      critters: {
        alive: this.critters.states().filter((critter) => critter.alive).length,
        total: this.critters.count,
        kills: this.critters.stats.kills,
        respawns: this.critters.stats.respawns,
        flees: this.critters.stats.flees,
      },
      drifters: this.drifterStatus(),
    };
  }
}
