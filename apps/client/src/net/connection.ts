import {
  MAX_PLAYERS,
  PROTOCOL_VERSION,
  WS_PATH,
  decodeGameEvent,
  decodeMapStateSync,
  decodePong,
  decodeProfileMessage,
  decodeSnapshot,
  decodeWelcome,
  encodeFireWeapon,
  encodeHello,
  encodeInput,
  encodePing,
  encodeProfileUpdate,
  peekOpcode,
  Opcode,
  type FireWeaponMessage,
  type GameEvent,
  type MapStateSync,
  type PlayerInput,
  type PlayerProfile,
  type ProfileMessage,
  type WelcomeMessage,
  type WorldSnapshot,
} from '@frost-and-flamingos/shared';
import {
  notify,
  updateConnection,
  type ConnectionStatus,
} from '../state/game';
import { getProfile } from '../state/profile';

export interface NetworkHandlers {
  onWelcome: (welcome: WelcomeMessage) => void;
  onSnapshot: (snapshot: WorldSnapshot) => void;
  onMapState: (mapState: MapStateSync) => void;
  onProfile: (message: ProfileMessage) => void;
  onGameEvent: (event: GameEvent) => void;
  onProtocolMismatch: () => void;
}

type Timer = ReturnType<typeof setTimeout>;

function socketUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}${WS_PATH}`;
}

/**
 * Reconnecting binary WebSocket client. It only ever sends protocol messages;
 * the authoritative server decides what is true.
 */
export class NetworkClient {
  private readonly handlers: NetworkHandlers;
  private socket: WebSocket | null = null;
  private reconnectTimer: Timer | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectAttempt = 0;
  private joined = false;
  private disposed = false;
  private wasConnected = false;
  private lastPingSentAt = 0;
  private snapshotCount = 0;

  constructor(handlers: NetworkHandlers) {
    this.handlers = handlers;
  }

  get ready(): boolean {
    return this.socket !== null && this.socket.readyState === WebSocket.OPEN && this.joined;
  }

  connect(): void {
    if (this.disposed) return;
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }
    this.clearReconnect();
    const status: ConnectionStatus = this.reconnectAttempt > 0 ? 'reconnecting' : 'connecting';
    updateConnection({ status, attempt: this.reconnectAttempt });
    this.joined = false;

    let socket: WebSocket;
    try {
      socket = new WebSocket(socketUrl());
    } catch {
      this.scheduleReconnect();
      return;
    }
    socket.binaryType = 'arraybuffer';
    this.socket = socket;

    socket.addEventListener('open', () => {
      if (this.socket !== socket) return;
      socket.send(
        encodeHello({
          protocolVersion: PROTOCOL_VERSION,
          profile: getProfile(),
        }),
      );
      this.startPingLoop();
    });

    socket.addEventListener('message', (event) => {
      if (this.socket !== socket) return;
      const data = event.data;
      if (!(data instanceof ArrayBuffer)) return;
      this.handlePacket(data);
    });

    socket.addEventListener('close', (event) => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.joined = false;
      this.stopPingLoop();
      if (this.disposed) return;

      if (event.code === 4002) {
        updateConnection({ status: 'offline', attempt: 0 });
        this.handlers.onProtocolMismatch();
        return;
      }

      if (event.code === 4004) {
        updateConnection({ status: 'offline', attempt: 0 });
        notify('notifications.serverFull');
        this.scheduleReconnect();
        return;
      }

      updateConnection({ status: 'reconnecting', attempt: this.reconnectAttempt + 1 });
      if (this.wasConnected) notify('notifications.disconnected');
      this.scheduleReconnect();
    });

    socket.addEventListener('error', () => {
      // The close event owns the reconnect state machine.
    });
  }

  disconnect(): void {
    this.disposed = true;
    this.clearReconnect();
    this.stopPingLoop();
    this.joined = false;
    if (this.socket) {
      this.socket.close(1000, 'Client shutting down.');
      this.socket = null;
    }
    updateConnection({ status: 'offline', attempt: 0 });
  }

  sendInput(input: PlayerInput): void {
    if (!this.ready || !this.socket) return;
    this.socket.send(encodeInput(input));
  }

  sendProfile(profile: PlayerProfile): void {
    if (!this.ready || !this.socket) return;
    this.socket.send(encodeProfileUpdate(profile));
  }

  sendFire(fire: FireWeaponMessage): void {
    if (!this.ready || !this.socket) return;
    this.socket.send(encodeFireWeapon(fire));
  }

  private handlePacket(buffer: ArrayBuffer): void {
    const opcode = peekOpcode(buffer);
    if (opcode === null) return;

    if (opcode === Opcode.S2C_WELCOME) {
      const welcome = decodeWelcome(buffer);
      if (!welcome) return;
      const reconnected = this.wasConnected;
      this.joined = true;
      this.reconnectAttempt = 0;
      this.wasConnected = true;
      this.snapshotCount = 0;
      updateConnection({
        status: 'connected',
        attempt: 0,
        serverTick: welcome.serverTick,
        playersOnline: 1,
        maxPlayers: MAX_PLAYERS,
        snapshots: 0,
      });
      notify(reconnected ? 'notifications.reconnected' : 'notifications.connected');
      this.handlers.onWelcome(welcome);
      return;
    }

    if (opcode === Opcode.S2C_WORLD_SNAPSHOT) {
      const snapshot = decodeSnapshot(buffer);
      if (!snapshot) return;
      this.snapshotCount += 1;
      updateConnection({
        status: 'connected',
        serverTick: snapshot.serverTick,
        playersOnline: snapshot.players.length,
        snapshots: this.snapshotCount,
      });
      this.handlers.onSnapshot(snapshot);
      return;
    }

    if (opcode === Opcode.S2C_MAP_STATE_SYNC) {
      const mapState = decodeMapStateSync(buffer);
      if (mapState) this.handlers.onMapState(mapState);
      return;
    }

    if (opcode === Opcode.S2C_PROFILE) {
      const message = decodeProfileMessage(buffer);
      if (message) this.handlers.onProfile(message);
      return;
    }

    if (opcode === Opcode.S2C_GAME_EVENT) {
      const event = decodeGameEvent(buffer);
      if (event) this.handlers.onGameEvent(event);
      return;
    }

    if (opcode === Opcode.S2C_PONG) {
      const pong = decodePong(buffer);
      if (!pong) return;
      const rtt = Math.max(0, performance.now() - pong.clientTimeMs);
      updateConnection({ pingMs: Math.round(rtt), serverTick: pong.serverTick });
    }
  }

  private startPingLoop(): void {
    this.stopPingLoop();
    this.sendPing();
    this.pingTimer = setInterval(() => this.sendPing(), 2000);
  }

  private stopPingLoop(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private sendPing(): void {
    if (!this.ready || !this.socket) return;
    this.lastPingSentAt = performance.now();
    this.socket.send(encodePing(this.lastPingSentAt));
  }

  private scheduleReconnect(): void {
    if (this.disposed || this.reconnectTimer) return;
    this.reconnectAttempt += 1;
    const delay = Math.min(8000, 700 * 2 ** Math.min(4, this.reconnectAttempt - 1));
    updateConnection({ status: 'reconnecting', attempt: this.reconnectAttempt });
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
