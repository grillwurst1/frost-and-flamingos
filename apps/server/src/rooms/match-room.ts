import {
  CLASS_STATS,
  FALL_RESPAWN_Y,
  FIXED_DT,
  MAP_ID,
  MAX_INPUT_BACKLOG,
  MAX_PLAYERS,
  PHYSICS_TICK_RATE,
  PROTOCOL_VERSION,
  SNAPSHOT_INTERVAL,
  normalizeProfile,
  sanitizeDisplayName,
  type ClassId,
  type Faction,
  type GameEvent,
  type MapStateSync,
  type PlayerInput,
  type PlayerProfile,
  type PlayerState,
  type ProfileMessage,
  type ServerHello,
  type WelcomeMessage,
  type WorldSnapshot,
  PhysicsWorld,
  encodeGameEvent,
  encodeMapStateSync,
  encodeProfileMessage,
  encodeSnapshot,
  randomSpawnForFaction,
} from '@frost-and-flamingos/shared';
import type { CharacterBody } from '@frost-and-flamingos/shared';

export interface GameSocket {
  send(data: string | ArrayBuffer | Uint8Array): unknown;
  close(code?: number, reason?: string): void;
}

interface PlayerConnection {
  id: number;
  socket: GameSocket;
  profile: PlayerProfile;
  character: CharacterBody;
  inputQueue: PlayerInput[];
  lastInput: PlayerInput;
  lastProcessedInput: number;
  hp: number;
  lastProfileUpdateAt: number;
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

export class MatchRoom {
  private readonly physics: PhysicsWorld;
  private readonly players = new Map<number, PlayerConnection>();
  private readonly sockets = new Map<GameSocket, number>();
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
    return new MatchRoom(physics);
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
    if (this.players.size === 0) {
      if (this.physicsTick % PHYSICS_TICK_RATE === 0) this.snapshotTick += 1;
      return;
    }

    const wind = this.currentWind();
    for (const player of this.players.values()) {
      const input = player.inputQueue.shift();
      const parachuteBefore = player.character.parachuteState;
      player.character.setWind(wind);
      if (input) {
        player.lastInput = input;
        player.lastProcessedInput = input.sequence;
        player.character.simulate(input);
      } else {
        player.character.simulate(
          {
            sequence: player.lastProcessedInput,
            buttons: 0,
            yaw: player.lastInput.yaw,
            pitch: player.lastInput.pitch,
            weaponSlot: player.lastInput.weaponSlot,
          },
          false,
        );
      }
      if (parachuteBefore === 0 && player.character.parachuteState !== 0) {
        this.broadcastEvent({
          eventType: 'PARACHUTE_POPPED',
          actorId: player.id,
          targetId: 0,
          paramX: 0,
          paramZ: 0,
          paramValue: player.character.parachuteState,
        });
      }
    }

    this.physics.step();

    for (const player of this.players.values()) {
      const position = player.character.position;
      // Deep water is a swim mode now; only a true fall out of the world
      // returns the player to a safe spawn.
      if (position.y < FALL_RESPAWN_Y) {
        this.respawn(player);
      }
    }

    if (this.physicsTick % SNAPSHOT_INTERVAL === 0) {
      this.snapshotTick += 1;
      this.broadcastSnapshot();
    }
  }

  private currentWind(): { angle: number; strength: number } {
    return {
      angle: this.windAngle + (this.physicsTick % 7200) * 0.00012,
      strength: Math.min(1, Math.abs(this.weatherBalance)) * 0.65,
    };
  }

  private respawn(player: PlayerConnection): void {
    const spawn = randomSpawnForFaction(player.profile.faction);
    player.character.teleport(spawn.position);
    player.character.restore(spawn.position, { x: 0, y: 0, z: 0 }, false, 0);
    player.hp = CLASS_STATS[player.profile.cosmetics.classId].maxHp;
    player.inputQueue.length = 0;
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
    const initialInput: PlayerInput = {
      sequence: 0,
      buttons: 0,
      yaw: 0,
      pitch: 0,
      weaponSlot: 1,
    };
    const player: PlayerConnection = {
      id,
      socket,
      profile,
      character,
      inputQueue: [],
      lastInput: initialInput,
      lastProcessedInput: 0,
      hp: CLASS_STATS[classId].maxHp,
      lastProfileUpdateAt: 0,
    };
    this.players.set(id, player);
    this.sockets.set(socket, id);

    const profiles: ProfileMessage[] = [];
    const newProfilePacket = encodeProfileMessage({ playerId: id, profile });
    for (const other of this.players.values()) {
      if (other.id === id) continue;
      profiles.push({ playerId: other.id, profile: other.profile });
      other.socket.send(newProfilePacket);
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
    if (!player) return;
    if (player.inputQueue.length >= MAX_INPUT_BACKLOG) {
      player.inputQueue.shift();
    }
    player.inputQueue.push(input);
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

    if (classId !== player.profile.cosmetics.classId) {
      const position = player.character.position;
      this.physics.removeCharacter(player.character);
      player.character = this.physics.createCharacter({ position, classId });
      player.hp = CLASS_STATS[classId].maxHp;
      player.inputQueue.length = 0;
    }

    player.profile = profile;
    this.broadcastProfile(player);
  }

  broadcastEvent(event: GameEvent): void {
    const packet = encodeGameEvent(event);
    for (const player of this.players.values()) {
      player.socket.send(packet);
    }
  }

  private broadcastProfile(player: PlayerConnection): void {
    const packet = encodeProfileMessage({ playerId: player.id, profile: player.profile });
    for (const other of this.players.values()) {
      other.socket.send(packet);
    }
  }

  private broadcastSnapshot(): void {
    const packet = encodeSnapshot(this.buildSnapshot());
    for (const player of this.players.values()) {
      player.socket.send(packet);
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
        alive: player.hp > 0,
        crouched: state.crouched,
        swimming: state.swimming,
        sprinting: state.sprinting,
        rolling: state.rolling,
        parachuteState: state.parachuteState,
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
