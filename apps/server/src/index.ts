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

    if (url.pathname === '/api/dev/teleport' && process.env.FF_DEV_TOOLS === '1') {
      // Local capture tooling only: POST from a loopback address.
      const address = bunServer.requestIP(request)?.address ?? '';
      const loopback = address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
      if (request.method !== 'POST' || !loopback) return json({ ok: false }, 403);
      const player = Number(url.searchParams.get('player'));
      const x = Number(url.searchParams.get('x'));
      const z = Number(url.searchParams.get('z'));
      const yParam = url.searchParams.get('y');
      const y = yParam === null ? undefined : Number(yParam);
      if (!Number.isFinite(player) || !Number.isFinite(x) || !Number.isFinite(z)) return json({ ok: false }, 400);
      return json(room.devTeleport(player, x, z, y !== undefined && Number.isFinite(y) ? y : undefined));
    }

    if (url.pathname === '/api/dev/vehicle' && process.env.FF_DEV_TOOLS === '1') {
      // Local capture tooling only: POST from a loopback address.
      const address = bunServer.requestIP(request)?.address ?? '';
      const loopback = address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
      if (request.method !== 'POST' || !loopback) return json({ ok: false }, 403);
      const player = Number(url.searchParams.get('player') ?? 0);
      const vehicle = Number(url.searchParams.get('vehicle') ?? 0);
      const value = Number(url.searchParams.get('value') ?? 0);
      const action = url.searchParams.get('action') ?? '';
      if (!Number.isFinite(player) || !Number.isFinite(vehicle) || !Number.isFinite(value)) return json({ ok: false }, 400);
      const x = Number(url.searchParams.get('x'));
      const z = Number(url.searchParams.get('z'));
      const place = Number.isFinite(x) && Number.isFinite(z) ? { x, z, yaw: Number(url.searchParams.get('yaw') ?? 0) || 0 } : null;
      return json(room.devVehicle(player, action, vehicle, value, place));
    }

    if (url.pathname === '/api/dev/critters' && process.env.FF_DEV_TOOLS === '1') {
      // Local capture tooling only: gathers the hens of that map half around (x, z).
      const address = bunServer.requestIP(request)?.address ?? '';
      const loopback = address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
      if (request.method !== 'POST' || !loopback) return json({ ok: false }, 403);
      const x = Number(url.searchParams.get('x'));
      const z = Number(url.searchParams.get('z'));
      if (!Number.isFinite(x) || !Number.isFinite(z)) return json({ ok: false }, 400);
      return json(room.devGatherCritters(x, z));
    }

    if (url.pathname === '/api/dev/conquest' && process.env.FF_DEV_TOOLS === '1') {
      // Local capture tooling only: stage tower owners or tickets (POST from loopback).
      const address = bunServer.requestIP(request)?.address ?? '';
      const loopback = address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
      if (request.method !== 'POST' || !loopback) return json({ ok: false }, 403);
      const tower = url.searchParams.get('tower');
      const owner = url.searchParams.get('owner');
      const faction = url.searchParams.get('faction');
      const tickets = url.searchParams.get('tickets');
      const control = url.searchParams.get('control');
      const towerId = tower === 'tower_a' || tower === 'tower_b' || tower === 'tower_c' ? tower : undefined;
      const side = (value: string | null) => (value === 'alpine' || value === 'lagoon' ? value : undefined);
      const finite = (value: string | null) => value === null || (value.trim() !== '' && Number.isFinite(Number(value)));
      if (!finite(tickets) || !finite(control)) return json({ ok: false, reason: 'tickets and control must be numbers' }, 400);
      if (owner !== null && owner !== 'neutral' && side(owner) === undefined) return json({ ok: false, reason: 'owner must be alpine, lagoon or neutral' }, 400);
      return json({
        ok: true,
        conquest: room.devConquest({
          tower: towerId,
          owner: owner === 'neutral' ? null : side(owner),
          control: control === null ? undefined : Number(control),
          faction: side(faction),
          tickets: tickets === null ? undefined : Number(tickets),
        }),
      });
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
