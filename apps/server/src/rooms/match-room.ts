import {
  CLASS_STATS,
  DEFAULT_CLASS,
  FALL_RESPAWN_Y,
  FIXED_DT,
  MAP_ID,
  MAX_INPUT_BACKLOG,
  MAX_PLAYERS,
  PHYSICS_TICK_RATE,
  PROTOCOL_VERSION,
  SNAPSHOT_INTERVAL,
  WATER_LEVEL,
  WATER_RESPAWN_DEPTH,
  type ClassId,
  type Faction,
  type GameEvent,
  type MapStateSync,
  type PlayerInput,
  type PlayerState,
  type ServerHello,
  type WelcomeMessage,
  type WorldSnapshot,
  PhysicsWorld,
  encodeGameEvent,
  encodeMapStateSync,
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
  displayName: string;
  faction: Faction;
  classId: ClassId;
  character: CharacterBody;
  inputQueue: PlayerInput[];
  lastInput: PlayerInput;
  lastProcessedInput: number;
  hp: number;
}

export interface JoinResult {
  ok: true;
  welcome: WelcomeMessage;
  mapState: MapStateSync;
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

    for (const player of this.players.values()) {
      const input = player.inputQueue.shift();
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
    }

    this.physics.step();

    for (const player of this.players.values()) {
      const position = player.character.position;
      const inDeepWater =
        position.y < WATER_LEVEL - WATER_RESPAWN_DEPTH && position.y < WATER_LEVEL;
      if (position.y < FALL_RESPAWN_Y || inDeepWater) {
        this.respawn(player);
      }
    }

    if (this.physicsTick % SNAPSHOT_INTERVAL === 0) {
      this.snapshotTick += 1;
      this.broadcastSnapshot();
    }
  }

  private respawn(player: PlayerConnection): void {
    const spawn = randomSpawnForFaction(player.faction);
    player.character.teleport(spawn.position);
    player.character.restore(spawn.position, { x: 0, y: 0, z: 0 }, false, 0);
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

    const faction = this.pickFaction();
    const classId: ClassId = DEFAULT_CLASS;
    const spawn = randomSpawnForFaction(faction);
    const character = this.physics.createCharacter({ position: spawn.position, classId });
    const id = this.allocatePlayerId();
    const displayName = sanitizeDisplayName(hello.displayName, id);
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
      displayName,
      faction,
      classId,
      character,
      inputQueue: [],
      lastInput: initialInput,
      lastProcessedInput: 0,
      hp: CLASS_STATS[classId].maxHp,
    };
    this.players.set(id, player);
    this.sockets.set(socket, id);

    return {
      ok: true,
      welcome: {
        playerId: id,
        faction,
        classId,
        serverTick: this.snapshotTick,
        spawn: { ...spawn.position },
        protocolVersion: PROTOCOL_VERSION,
      },
      mapState: {
        destructibles: [],
        bridges: [],
        craters: [],
      },
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

  broadcastEvent(event: GameEvent): void {
    const packet = encodeGameEvent(event);
    for (const player of this.players.values()) {
      player.socket.send(packet);
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
      players.push({
        id: player.id,
        faction: player.faction,
        classId: player.classId,
        position: state.position,
        velocity: state.velocity,
        yaw: state.yaw,
        hp: player.hp,
        maxHp: CLASS_STATS[player.classId].maxHp,
        grounded: state.grounded,
        alive: player.hp > 0,
        lastProcessedInput: player.lastProcessedInput,
      });
    }
    return {
      serverTick: this.snapshotTick,
      weatherBalance: this.weatherBalance,
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
      if (player.faction === 'alpine') alpine += 1;
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

function sanitizeDisplayName(name: string, id: number): string {
  const cleaned = name
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, 24);
  return cleaned.length > 0 ? cleaned : `Vacationer ${id}`;
}
