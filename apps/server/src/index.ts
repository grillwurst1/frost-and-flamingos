import {
  MAP_ID,
  MAX_PLAYERS,
  NETWORK_PORT,
  PHYSICS_TICK_RATE,
  PROTOCOL_VERSION,
  SERVER_TICK_RATE,
  WS_PATH,
  decodeFireWeapon,
  decodeHello,
  decodeInput,
  decodePing,
  decodeProfileUpdate,
  encodeMapStateSync,
  encodePong,
  encodeProfileMessage,
  encodeWelcome,
  peekOpcode,
  Opcode,
} from '@frost-and-flamingos/shared';
import { MatchRoom } from './rooms/match-room.js';

interface SocketData {
  joined: boolean;
  playerId: number | null;
  helloTimeout: ReturnType<typeof setTimeout> | null;
}

const port = Number(process.env.PORT ?? NETWORK_PORT);
const hostname = process.env.HOST ?? '127.0.0.1';

const room = await MatchRoom.create();
room.start();

const jsonHeaders = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'access-control-allow-origin': '*',
};

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: jsonHeaders });
}

const server = Bun.serve<SocketData>({
  port,
  hostname,
  fetch(request, bunServer) {
    const url = new URL(request.url);

    if (url.pathname === WS_PATH) {
      const upgraded = bunServer.upgrade(request, {
        data: { joined: false, playerId: null, helloTimeout: null },
      });
      if (upgraded) return undefined;
      return json({ error: 'websocket_upgrade_failed' }, 426);
    }

    if (url.pathname === '/api/health') {
      return json({ status: 'ok', ...room.getStatus() });
    }

    if (url.pathname === '/api/config') {
      return json({
        protocolVersion: PROTOCOL_VERSION,
        mapId: MAP_ID,
        maxPlayers: MAX_PLAYERS,
        serverTickRate: SERVER_TICK_RATE,
        physicsTickRate: PHYSICS_TICK_RATE,
        websocketPath: WS_PATH,
      });
    }

    if (url.pathname === '/') {
      return json({
        service: 'Frost & Flamingos authoritative server',
        status: 'ok',
        health: '/api/health',
        config: '/api/config',
        websocket: WS_PATH,
      });
    }

    return json({ error: 'not_found' }, 404);
  },
  websocket: {
    data: {} as SocketData,
    open(ws) {
      ws.data.helloTimeout = setTimeout(() => {
        if (!ws.data.joined) {
          ws.close(4001, 'Handshake timeout.');
        }
      }, 8000);
    },
    message(ws, message) {
      if (typeof message === 'string') return;
      const opcode = peekOpcode(message);
      if (opcode === null) return;

      if (opcode === Opcode.C2S_HELLO) {
        if (ws.data.joined) return;
        const hello = decodeHello(message);
        if (!hello) {
          ws.close(4003, 'Malformed handshake.');
          return;
        }
        if (hello.protocolVersion !== PROTOCOL_VERSION) {
          ws.close(4002, 'Protocol version mismatch.');
          return;
        }
        const result = room.join(ws, hello);
        if (!result.ok) {
          ws.close(result.code, result.reason);
          return;
        }
        ws.data.joined = true;
        ws.data.playerId = result.welcome.playerId;
        if (ws.data.helloTimeout) {
          clearTimeout(ws.data.helloTimeout);
          ws.data.helloTimeout = null;
        }
        ws.send(encodeWelcome(result.welcome));
        for (const profile of result.profiles) {
          ws.send(encodeProfileMessage(profile));
        }
        ws.send(encodeMapStateSync(result.mapState));
        return;
      }

      if (!ws.data.joined) return;

      if (opcode === Opcode.C2S_PROFILE_UPDATE) {
        const profile = decodeProfileUpdate(message);
        if (profile) room.handleProfileUpdate(ws, profile);
        return;
      }

      if (opcode === Opcode.C2S_INPUT) {
        const input = decodeInput(message);
        if (input) room.handleInput(ws, input);
        return;
      }

      if (opcode === Opcode.C2S_PING) {
        const clientTime = decodePing(message);
        if (clientTime !== null) {
          ws.send(encodePong(clientTime, room.getServerTick()));
        }
        return;
      }

      if (opcode === Opcode.C2S_FIRE_WEAPON) {
        const fire = decodeFireWeapon(message);
        if (fire) room.handleFire(ws, fire);
        return;
      }
    },
    close(ws) {
      if (ws.data.helloTimeout) {
        clearTimeout(ws.data.helloTimeout);
        ws.data.helloTimeout = null;
      }
      room.leaveBySocket(ws);
    },
  },
});

console.log(`[frost-and-flamingos] authoritative server ready at http://${hostname}:${port}`);
console.log(`[frost-and-flamingos] websocket endpoint ws://${hostname}:${port}${WS_PATH}`);

let shuttingDown = false;
function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[frost-and-flamingos] ${signal} received, closing resort server.`);
  room.stop();
  server.stop(true);
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
