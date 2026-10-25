import {
  CLASS_DEFAULT_LOADOUTS,
  CLASS_STATS,
  FALL_RESPAWN_Y,
  FIXED_DT,
  InputButton,
  MAP_ID,
  MAX_INPUT_BACKLOG,
  MAX_PLAYERS,
  PHYSICS_TICK_RATE,
  PROTOCOL_VERSION,
  RESPAWN_DELAY_SECONDS,
  SNAPSHOT_INTERVAL,
  WEAPON_STATS,
  WEAPON_TABLE,
  PhysicsWorld,
  createDefaultProfile,
  encodeGameEvent,
  encodeMapStateSync,
  encodeProfileMessage,
  encodeSnapshot,
  normalizeProfile,
  randomSpawnForFaction,
  sanitizeDisplayName,
  skillsForClass,
  weaponForSlot,
  type CharacterBody,
  type ClassId,
  type Faction,
  type GameEvent,
  type Loadout,
  type MapStateSync,
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
import { createBotRoute, engagementBlocked, routeTowards, steerAlongRoute, type BotRoute } from './bot-nav.js';
import {
  normalizeDirection,
  raycastTargets,
  spreadDirection,
  type CombatTarget,
} from './combat.js';

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
  route: BotRoute;
}

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
  lastProfileUpdateAt: number;
  bot: BotState | null;
}

interface LagSample {
  tick: number;
  players: Map<number, { position: Vec3; crouched: boolean; alive: boolean }>;
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
}

const PROFILE_UPDATE_COOLDOWN_MS = 120;
const RESPAWN_DELAY_TICKS = RESPAWN_DELAY_SECONDS * PHYSICS_TICK_RATE;
const SPAWN_PROTECTION_TICKS = 2 * PHYSICS_TICK_RATE;
const LAG_HISTORY_TICKS = 2 * PHYSICS_TICK_RATE;
const MAX_LAG_REWIND_TICKS = 30;
const BOT_COUNT = 4;
const BOT_NAMES = [
  { name: 'Heidi Hangtime', faction: 'alpine', classId: 'allrounder' },
  { name: 'Bruno Gletscher', faction: 'alpine', classId: 'heavy' },
  { name: 'Coral Kai', faction: 'lagoon', classId: 'infiltrator' },
  { name: 'Sandy Palms', faction: 'lagoon', classId: 'allrounder' },
] as const satisfies readonly { name: string; faction: Faction; classId: ClassId }[];

const ZERO_VELOCITY: Vec3 = { x: 0, y: 0, z: 0 };

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

export class MatchRoom {
  private readonly physics: PhysicsWorld;
  private readonly players = new Map<number, PlayerConnection>();
  private readonly sockets = new Map<GameSocket, number>();
  private readonly lagHistory: LagSample[] = [];
  private readonly projectiles: Projectile[] = [];
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

  private constructor(physics: PhysicsWorld) {
    this.physics = physics;
  }

  static async create(): Promise<MatchRoom> {
    const physics = await PhysicsWorld.create();
    const room = new MatchRoom(physics);
    room.spawnBots();
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

    for (const player of this.players.values()) {
      this.tickTimers(player);
      if (!player.alive) {
        if (player.respawnAtTick > 0 && this.physicsTick >= player.respawnAtTick) {
          this.respawn(player);
        }
        continue;
      }

      const input = player.isBot
        ? this.botInput(player)
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

    this.physics.step();
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
    for (let index = 0; index < 3; index += 1) {
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

    if ((input.buttons & InputButton.Reload) !== 0 && (previousButtons & InputButton.Reload) === 0) {
      this.startReload(player);
    }
    this.handleSkillInput(player, input.buttons, previousButtons);

    const speedScale =
      this.physicsTick < player.slowUntilTick
        ? 0.62
        : this.physicsTick < player.speedUntilTick
          ? 1.5
          : 1;
    player.character.setWind(wind);
    player.character.simulate(input, trackButtons, speedScale);

    if (player.isBot && (input.buttons & InputButton.FirePrimary) !== 0) {
      this.tryFire(player, this.snapshotTick);
    }
    if (trackButtons) player.previousButtons = input.buttons;
  }

  private currentWind(): { angle: number; strength: number } {
    return {
      angle: this.windAngle + (this.physicsTick % 7200) * 0.00012,
      strength: Math.min(1, Math.abs(this.weatherBalance)) * 0.65,
    };
  }

  private respawn(player: PlayerConnection): void {
    const spawn = randomSpawnForFaction(player.profile.faction, Math.random, (position) =>
      this.isSpawnOccupied(position, player.id),
    );
    const classId = player.profile.cosmetics.classId;
    player.character.setColliderEnabled(true);
    player.character.teleport(spawn.position);
    player.character.restore(spawn.position, ZERO_VELOCITY, false, 0);
    player.hp = CLASS_STATS[classId].maxHp;
    player.shield = 0;
    player.alive = true;
    player.respawnAtTick = 0;
    player.killerId = 0;
    player.lastAttackerId = 0;
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
      if (other.id === selfId || !other.alive) continue;
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
      paramX: Math.round(player.lastInput.yaw * 100),
      paramZ: Math.round(player.lastInput.pitch * 100),
      paramValue: WEAPON_TABLE.code[weaponId],
    });

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
      const classStats = CLASS_STATS[other.profile.cosmetics.classId];
      const state = sample?.players.get(other.id);
      targets.push({
        id: other.id,
        position: state?.position ?? other.character.position,
        crouched: state?.crouched ?? other.character.crouched,
        radius: classStats.radius,
        height: classStats.height,
        alive: state?.alive ?? other.alive,
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
    const players = new Map<number, { position: Vec3; crouched: boolean; alive: boolean }>();
    for (const player of this.players.values()) {
      players.set(player.id, {
        position: { ...player.character.position },
        crouched: player.character.crouched,
        alive: player.alive,
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
    if (attacker && attacker.profile.faction === target.profile.faction) return;
    if (this.physicsTick < target.spawnProtectionUntil) return;

    const multiplier =
      headshot && weaponId ? WEAPON_STATS[weaponId].headshotMultiplier : 1;
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
    if (!player.alive) return;
    if ((player.skillCooldowns[index] ?? 0) > 0) return;
    const skill = skillsForClass(player.profile.cosmetics.classId)[index];
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
        player.hp = Math.min(CLASS_STATS[classId].maxHp, player.hp + skill.amount);
        return;
      }
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
        for (const other of this.players.values()) {
          if (other.id === player.id || !other.alive) continue;
          if (other.profile.faction === player.profile.faction) continue;
          if (distance3(player.character.position, other.character.position) > skill.radius) continue;
          this.damagePlayer(other, player, skill.amount, null, false);
        }
        return;
      }
      case 'slow': {
        for (const other of this.players.values()) {
          if (other.id === player.id || !other.alive) continue;
          if (other.profile.faction === player.profile.faction) continue;
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
        this.explode(owner, worldHit.point, projectile.damage, projectile.splashRadius);
        this.projectiles.splice(index, 1);
        continue;
      }

      const targets = this.combatTargets(owner, 0);
      const hit = raycastTargets(from, direction, step, targets);
      const next = {
        x: from.x + projectile.velocity.x * FIXED_DT,
        y: from.y + projectile.velocity.y * FIXED_DT,
        z: from.z + projectile.velocity.z * FIXED_DT,
      };
      projectile.position = next;
      projectile.velocity.y -= 9.81 * FIXED_DT;
      if (hit) {
        this.explode(owner, next, projectile.damage, projectile.splashRadius);
        this.projectiles.splice(index, 1);
        continue;
      }
      if (next.y < FALL_RESPAWN_Y) {
        this.explode(owner, next, projectile.damage, projectile.splashRadius);
        this.projectiles.splice(index, 1);
      }
    }
  }

  private explode(
    owner: PlayerConnection,
    position: Vec3,
    damage: number,
    radius: number,
  ): void {
    if (radius <= 0) return;
    for (const other of this.players.values()) {
      if (!other.alive) continue;
      if (other.id === owner.id) continue;
      if (other.profile.faction === owner.profile.faction) continue;
      const distance = distance3(position, other.character.position);
      if (distance > radius) continue;
      const falloff = Math.max(0.3, 1 - (distance / radius) * 0.7);
      this.damagePlayer(other, owner, damage * falloff, null, false);
    }
    this.broadcastEvent({
      eventType: 'PROP_EXPLODE',
      actorId: owner.id,
      targetId: 0,
      paramX: Math.round(position.x),
      paramZ: Math.round(position.z),
      paramValue: Math.round(radius * 10),
    });
  }

  private spawnBots(): void {
    for (const entry of BOT_NAMES.slice(0, BOT_COUNT)) {
      const id = this.allocatePlayerId();
      const base = createDefaultProfile(entry.name, entry.classId);
      const profile: PlayerProfile = {
        ...base,
        faction: entry.faction,
        loadout: { ...CLASS_DEFAULT_LOADOUTS[entry.classId] },
      };
      const spawn = randomSpawnForFaction(entry.faction);
      const character = this.physics.createCharacter({
        position: spawn.position,
        classId: entry.classId,
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
        hp: CLASS_STATS[entry.classId].maxHp,
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
        lastProfileUpdateAt: 0,
        bot: {
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
    const classId = player.profile.cosmetics.classId;
    const weaponId = weaponForSlot(player.profile.loadout, player.activeSlot);
    const weapon = WEAPON_STATS[weaponId];
    let buttons = 0;
    let yaw = player.lastInput.yaw;
    let pitch = player.lastInput.pitch;

    if (target && target.alive) {
      const origin = this.eyePosition(player);
      const targetPoint = {
        x: target.character.position.x,
        y: target.character.position.y + target.character.eyeHeight * 0.85,
        z: target.character.position.z,
      };
      const dx = targetPoint.x - origin.x;
      const dy = targetPoint.y - origin.y;
      const dz = targetPoint.z - origin.z;
      const horizontal = Math.hypot(dx, dz);
      yaw = Math.atan2(dx, dz);
      pitch = Math.atan2(dy, Math.max(0.001, horizontal)) + bot.aimError;
      const distance = Math.hypot(horizontal, dy);

      // Out of sight (across the gorge, behind a chalet) or blocked while
      // charging: follow the waypoint graph towards the target instead.
      const route = bot.route;
      if (this.physicsTick >= route.nextSightTick) {
        route.nextSightTick = this.physicsTick + 12;
        route.seesTarget = this.hasLineOfSight(origin, targetPoint, distance, normalizeDirection({ x: dx, y: dy, z: dz }));
      }
      if (!route.seesTarget || this.physicsTick < route.chaseUntilTick) {
        routeTowards(route, player.character.position, target.character.position, this.physicsTick);
        const steer = steerAlongRoute(route, player.character.position, this.physicsTick, Math.random);
        let chaseButtons = InputButton.Forward;
        if (steer.sprint) chaseButtons |= InputButton.Sprint;
        if (steer.jump) chaseButtons |= InputButton.Jump;
        const chaseAmmo = player.ammo[0];
        if (chaseAmmo && chaseAmmo.magazine <= 0 && chaseAmmo.reserve > 0) chaseButtons |= InputButton.Reload;
        return { sequence: player.lastProcessedInput + 1, buttons: chaseButtons, yaw: steer.yaw, pitch: -0.05, weaponSlot: 1 };
      }

      if (distance > Math.max(9, weapon.range * 0.45)) {
        buttons |= InputButton.Forward;
        if (engagementBlocked(route, player.character.position, this.physicsTick)) route.chaseUntilTick = this.physicsTick + 300;
      } else {
        route.engageCheckTick = this.physicsTick;
        route.engageCheckPosition = { ...player.character.position };
      }
      if (distance > 24) buttons |= InputButton.Sprint;
      if (distance < 5) buttons |= InputButton.Backward;
      if (this.physicsTick >= bot.nextStrafeTick) {
        bot.strafeDirection *= -1;
        bot.nextStrafeTick = this.physicsTick + 40 + Math.floor(Math.random() * 45);
      }
      if (distance < 32) {
        buttons |= bot.strafeDirection > 0 ? InputButton.Right : InputButton.Left;
      }
      if (this.physicsTick >= bot.nextJumpTick && distance < 17) {
        buttons |= InputButton.Jump;
        bot.nextJumpTick = this.physicsTick + 140 + Math.floor(Math.random() * 120);
      }

      if (this.physicsTick >= bot.nextFireTick && distance <= weapon.range) {
        const targetDirection = normalizeDirection({ x: dx, y: dy, z: dz });
        if (this.hasLineOfSight(origin, targetPoint, distance, targetDirection)) {
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
      }

      const ammo = player.ammo[0];
      if (ammo && ammo.magazine <= 0 && ammo.reserve > 0) {
        buttons |= InputButton.Reload;
      }
      if (
        player.hp < CLASS_STATS[classId].maxHp * 0.42 &&
        this.physicsTick >= bot.nextSkillTick
      ) {
        buttons |= InputButton.Skill1;
        bot.nextSkillTick = this.physicsTick + 180;
      }
    } else {
      // Patrol the waypoint graph towards a tower or a random landmark.
      const steer = steerAlongRoute(bot.route, player.character.position, this.physicsTick, Math.random);
      yaw = steer.yaw;
      bot.patrolYaw = yaw;
      pitch = -0.05;
      buttons |= InputButton.Forward;
      if (steer.sprint) buttons |= InputButton.Sprint;
      if (steer.jump) buttons |= InputButton.Jump;
      const ammo = player.ammo[0];
      if (ammo && ammo.magazine <= 0 && ammo.reserve > 0) {
        buttons |= InputButton.Reload;
      }
    }

    return {
      sequence: player.lastProcessedInput + 1,
      buttons,
      yaw,
      pitch,
      weaponSlot: 1,
    };
  }

  private selectBotTarget(player: PlayerConnection): number {
    let bestId = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const other of this.players.values()) {
      if (other.id === player.id || !other.alive) continue;
      if (other.profile.faction === player.profile.faction) continue;
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
  ): boolean {
    const hit = this.physics.raycast(origin, direction, distance);
    return hit === null || hit.distance >= distance - 0.6;
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
    const faction = this.pickFaction();
    const classId: ClassId = requested.cosmetics.classId;
    const displayName = sanitizeDisplayName(requested.displayName, `Vacationer ${id}`);
    const profile: PlayerProfile = {
      displayName,
      faction,
      cosmetics: { ...requested.cosmetics, classId },
      loadout: requested.loadout,
    };
    const spawn = randomSpawnForFaction(faction);
    const character = this.physics.createCharacter({ position: spawn.position, classId });
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
      hp: CLASS_STATS[classId].maxHp,
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
    const classId = normalized.cosmetics.classId;
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
      player.character = this.physics.createCharacter({ position, classId });
    }

    player.profile = profile;
    player.hp = CLASS_STATS[classId].maxHp;
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
      players.push({
        id: player.id,
        faction: player.profile.faction,
        classId,
        position: state.position,
        velocity: state.velocity,
        yaw: state.yaw,
        hp: player.hp,
        maxHp: CLASS_STATS[classId].maxHp,
        grounded: state.grounded,
        alive: player.alive,
        crouched: state.crouched,
        swimming: state.swimming,
        sprinting: state.sprinting,
        rolling: state.rolling,
        parachuteState: state.parachuteState,
        weaponSlot: player.activeSlot,
        ammo: player.ammo[player.activeSlot - 1]?.magazine ?? 0,
        reserve: player.ammo[player.activeSlot - 1]?.reserve ?? 0,
        reloading: player.reloadEndsTick > this.physicsTick,
        shield: Math.round(player.shield),
        kills: player.kills,
        deaths: player.deaths,
        skillCooldown1: player.skillCooldowns[0] ?? 0,
        skillCooldown2: player.skillCooldowns[1] ?? 0,
        skillCooldown3: player.skillCooldowns[2] ?? 0,
        cloaked: this.physicsTick < player.cloakUntilTick,
        lastProcessedInput: player.lastProcessedInput,
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
      vehicles: [],
    };
  }

  private pickFaction(): Faction {
    let alpine = 0;
    let lagoon = 0;
    for (const player of this.players.values()) {
      if (player.profile.faction === 'alpine') alpine += 1;
      else lagoon += 1;
    }
    if (alpine < lagoon) return 'alpine';
    if (lagoon < alpine) return 'lagoon';
    return Math.random() < 0.5 ? 'alpine' : 'lagoon';
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
    };
  }
}
