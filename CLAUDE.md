# CLAUDE.md — Frost & Flamingos

Working notes for AI agents and humans who touch this repository. Read this before changing code.

## Mission

**Frost & Flamingos — Bullets, Fondue & Coconuts** is an original, clean-room climate-war
comedy shooter built as a Bun monorepo. The visual target is a readable, toy-like action
cartoon: snow, fondue and alpine kitsch on one side, turquoise lagoons, flamingos and beach
bars on the other. No Battlefield/EA assets, names, maps or audio may be used or imitated.

The project is delivered in milestones. **Only the current milestone may be implemented.**
Future-milestone code, placeholder gameplay loops and speculative systems are not allowed.

## Current milestone: M1 — Movement & World

M1 is a playable third-person multiplayer movement prototype:

- Bun workspace with a Svelte/Vite client and a Bun authoritative server.
- Shared, immutable Fjord Fiesta blueprint with a Rapier heightfield and prop colliders.
- Deterministic shared Rapier kinematic character motor at 60 Hz.
- Authoritative Bun server at 30 snapshots/s with binary WebSocket protocol.
- Babylon.js v8 renderer with WebGPU and WebGL2 fallback.
- Custom toon, water and sky shaders; procedural vertex-coloured props and thin instances.
- Spring-loaded over-the-shoulder camera, local prediction/reconciliation, remote interpolation.
- Walkable snow, village, beach, water and fall-respawn behaviour.
- Fully typed English/German i18n with a live language switcher.
- Menu, loading screen, HUD, pause menu, telemetry overlay, error and toast surfaces.

**Explicitly out of scope for M1:** weapons and shooting, bots, vehicles, destruction,
classes other than the Allrounder, cosmetics/wardrobe, match scoring and progression.
Weapons, bots, vehicles and destruction belong to later milestones. Do not add them now.

## Repository map

```
apps/
  client/                 Svelte 5 + Vite 7 + Babylon.js 8 browser client
    src/engine/           GameClient, camera rig, input controller
    src/net/              reconnecting binary WebSocket client
    src/rendering/        map, character rig, shaders/materials, mesh helpers
    src/state/            Svelte stores for phase, connection, HUD, locale
    src/components/       menu, HUD, loading, pause, debug, toast, error UI
  server/                 Bun authoritative game server
    src/rooms/            MatchRoom simulation loop and snapshots
    src/index.ts          HTTP health/config endpoints + WebSocket upgrade
packages/
  shared/                 code shared by client and server
    src/config/           classes, weapons and Fjord Fiesta blueprint
    src/i18n/             English master dictionary + typed German dictionary
    src/net/              binary opcodes, reader/writer, protocol codecs
    src/physics/          Rapier world, prop colliders, character motor
    src/types/            shared domain types
scripts/
  dev.ts                  starts server + client, tears both down on Ctrl+C
```

## Commands

Run everything from the repository root. Bun 1.4.4 is the supported runtime.

| Command | Purpose |
| --- | --- |
| `bun install` | Install all workspace dependencies. |
| `bun run dev` | Start the authoritative server and Vite client together. |
| `bun run build` | Build shared, client and server bundles. |
| `bun run typecheck` | Strict TypeScript + Svelte diagnostics for all workspaces. |
| `bun run stop` | Kill orphaned processes on ports 5173, 3000 and 4173. |
| `bun run clean` | Remove build output, Vite caches and local server data. |
| `bun run clean:all` | `clean` plus all `node_modules` and `bun.lock`. |

Client: <http://localhost:5173> — server health: <http://127.0.0.1:3000/api/health>.

## Architecture contract

### Authority and time

- The server is authoritative. It simulates at **60 Hz** and broadcasts snapshots at **30 Hz**
  (`PHYSICS_TICK_RATE`, `SERVER_TICK_RATE`, `SNAPSHOT_INTERVAL` in shared constants).
- The client predicts the local character with the same shared motor and fixed timestep.
- Inputs carry a wrapping 16-bit sequence. The server acknowledges `lastProcessedInput`.
- On snapshots the client drops acknowledged inputs, compares prediction to authority and
  replays pending inputs. Hard errors above the snap threshold snap the camera.
- Remote players are interpolated from snapshot history with a small delay; do not move them
  with local physics.

Changing packet layout requires a `PROTOCOL_VERSION` bump and matching encode/decode changes.
All packets are binary; never introduce JSON messages on the gameplay socket.

### Physics and world

- `packages/shared/src/physics/world.ts` owns Rapier initialization, the heightfield and
  static prop colliders. Both client and server build the same world from the same blueprint.
- `packages/shared/src/physics/character.ts` is the only character motor. Do not fork it for
  the client or server.
- The Fjord Fiesta blueprint in `packages/shared/src/config/map-fjord.ts` is immutable data.
  Client visuals and server colliders must derive from it; never hand-place colliders twice.
- Keep simulation deterministic: fixed `FIXED_DT`, no frame-time-dependent gameplay maths.
- Water and fall respawns are authoritative server behaviour. The client only reacts.

### Rendering

- Babylon.js is imported from `@babylonjs/core` submodules. Avoid the legacy full bundle.
- The toon material is shared by the map and all characters. A `CharacterView` owns only its
  shadow material and must not dispose the shared toon material.
- Custom shaders live in `src/shaders/` and are registered through `src/rendering/materials.ts`.
  GLSL and WGSL paths must both compile; test WebGL2 with `?renderer=webgl2`.
- Procedural props are merged/vertex-coloured or thin-instanced. Keep draw calls low.
- Camera is a spring-driven over-the-shoulder rig. Do not replace it with a free camera.
- Sky diameter is 3200 and camera far plane 5000. Changing one requires checking the other.

### UI and i18n

- **No hardcoded user-facing or gameplay strings in components.** Add keys to the English
  master dictionary (`packages/shared/src/i18n/locales/en.ts`) first, then implement the exact
  same shape in German (`de.ts`). The German dictionary is typed against the English schema,
  so missing/stale keys must fail typecheck.
- Use the `t` store / `$t('key')` pattern. Interpolation uses `{name}` placeholders.
- UI strings, notifications, errors, control labels, zone labels and HUD text are all i18n.
- The language switcher persists to `localStorage` under `frost-and-flamingos.locale`.
- Do not use English text as a lookup key or embed copy in stores.

### Code style

- Strict TypeScript, `noUncheckedIndexedAccess`, no implicit `any`, no `@ts-ignore`.
- Prefer explicit domain types from shared over anonymous object shapes.
- Keep client/server boundaries explicit: UI components read stores and call intent methods;
  they do not touch Babylon or Rapier directly.
- Reuse existing helpers (`mesh-utils`, `labels`, protocol reader/writer) before adding new ones.
- Avoid core-mechanic TODOs. If something is deferred to a later milestone, say so in docs and
  gate it behind that milestone instead of shipping a broken stub.

## Verification checklist

Before committing:

1. `bun run typecheck` — must report 0 errors and 0 warnings.
2. `bun run build` — shared, client and server must build.
3. `bun run dev`, open the client and confirm the menu reaches **Connected**.
4. Click **Play Now**, confirm the HUD appears and the renderer line says WebGPU (or WebGL2).
5. Move with WASD, jump with Space, sprint with Shift, swap shoulder with C, zoom with wheel.
6. Press Esc, confirm the pause menu; resume and return to the menu.
7. Switch EN/DE live; check menu, HUD, pause and debug copy.
8. Open a second tab and confirm both vacationers appear and move.
9. Test `?renderer=webgl2` to exercise the fallback shader path.
10. Confirm no shader compilation errors or uncaught exceptions in the browser console.

The only expected console warning is Rapier's deprecation notice about initialization
parameters; it is harmless and originates inside `@dimforge/rapier3d-compat`.

## Known environment notes

- `scripts/dev.ts` uses `import.meta.dir` instead of `new URL(...).pathname`; URL-encoded
  spaces break `cwd` in this repository path.
- The server binds `127.0.0.1` by default. It is a local playtest server, not a public service.
- If ports are stuck after a crash, run `bun run stop`.
- Vite's dependency optimizer may re-run after dependency changes; that is expected.
- WebGPU is preferred when `navigator.gpu` exists; any initialization failure falls back to
  WebGL2. Do not make WebGL2 a second-class path.

## Roadmap boundaries

Do not implement ahead of the milestone gate:

- **M2+:** additional classes, loadouts, cosmetics/wardrobe.
- **M3+:** weapons, shooting, damage, combat feedback.
- **Later:** bots, vehicles, destructible props, terrain craters, bridges, turrets, match flow,
  progression and persistence.

When the user says **“Go für Milestone 2”**, read the milestone brief first, update this file
and the German guide, then implement only that milestone.
