# CLAUDE.md — Frost & Flamingos

Working notes for AI agents and humans who touch this repository. Read this before changing code.

## Mission

**Frost & Flamingos — Bullets, Fondue & Coconuts** is an original, clean-room climate-war
comedy shooter built as a Bun monorepo. The visual target is a readable, toy-like action
cartoon: snow, fondue and alpine kitsch on one side, turquoise lagoons, flamingos and beach
bars on the other. No Battlefield/EA assets, names, maps or audio may be used or imitated.

The project is delivered in milestones. **Only the current milestone may be implemented.**
Future-milestone code, placeholder gameplay loops and speculative systems are not allowed.

## Current state: M5-Kern test build (stopped for the owner's test)

M1–M4 are complete (M4: three weapon slots, server hitbox rollback, nine class skills, four
named AI bots, kill feed, 10-second live killer cam, procedural combat audio). The owner asked
to **stop after this build and test it before any further work**. It is the core of M5
("M5-Kern") plus the art and character packages that landed with it. **Do not start new work
until the owner says to continue.**

In this build:

- **Painterly comic look (1A):** brush-stroke paint pass, ink outlines, shadows and a picture
  quality setting (Auto / High / Medium / Low in Settings and Pause, `?quality=`).
- **Comic HUD and menus (1B):** cover-art menu, paper panels, painted slot/skill tiles, comic
  stickers, faction crests (owner-supplied 2D art with CSS/SVG fallbacks).
- **Mascot class (1C, 3M):** Peak Guard Alpine Cow (260 vitality) and Lagoon League Battle
  Coconut (200), no firearms, ram damage and three moves each on Q/E/T. Animated Meshy cow
  (gaits, bell, spring tail, eyelids) and coconut (12 painted faces, rolling), comic deaths.
- **Rebuilt Fjord Fiesta (1D):** typed 257 × 257 blueprint (3.125 m cells), lagoon south-west,
  village centre, summit north-east, three towers, suspension bridge, routes and both bases.
- **Painted world (2V):** billboard sprite vegetation and clutter cut from the owner's
  paintings, painted facades, painted terrain layers, ground decals, a foothill ring beyond the
  map edge and a closer camera.
- **Painted soldiers (3C):** owner-generated, rigged Meshy GLB models for all six soldiers
  (three classes × two factions) with cadence-capped gaits. `bun run models` rebuilds them from
  `art-src/meshy/`; `?painted=0` skips the painted models (soldiers fall back to the procedural
  rig, vehicles to stand-in hulls).
- **Wandering hens (3H):** three per map half, server-authoritative; they flee people and
  gunfire, can be shot (feather burst, kill-feed line) and respawn after 45 s. No score.
- **Drifter class (3G):** Creepy Mountain Girl (Peak Guard) / Hot Beach Girl (Lagoon League).
  Untouchable, unarmed, walk-only at 2.4 m/s, hovers on water. Supply aura: teammates within
  6 m heal 8 vitality/s after 3 s without damage and get one reserve magazine per weapon slot
  every 4 s; support points per 10 vitality or per magazine. Cannot capture towers, board
  vehicles or count toward team balance; hens and bots ignore her.
- **Hero weapons (4W):** 13 procedural hero weapons with hold poses for the painted soldiers;
  the umbrella only opens overhead in a long fall (visual pose, no glide).
- **Vehicles (4V):** Fondue Crawler, Coconut Beach Tank, Tactical Badi-Flamingo boat and
  Sidecar Motorcycle. F enter/exit, C switch seat, H horn, Shift plug turbo (boat), Space
  handbrake drift (sidecar), LMB vehicle gun. Base vehicles are reserved for their faction;
  the forward Crawler (Tower C) and Coconut Tank (Tower A) only spawn while their team holds
  that tower (an unused one parked at its pad leaves when the tower falls). Boats slide up
  gentle beaches and can back off in the shallows. Shared vehicle
  motor in `packages/shared/src/physics/vehicle.ts`, server manager in
  `apps/server/src/rooms/vehicle-manager.ts`.
- **Climate Conquest (4T):** three towers, 16 m capture zones, 50 tickets, death cost and
  tower-deficit ticket drain, weather balance per held tower, 20-minute rounds, 15 s results
  ceasefire and a deterministic round reset; spawn pads outside the zones with 2 s spawn
  protection. Wardrobe class/loadout changes apply at once on the spawn pad, in the menu or
  during the results, otherwise at the next respawn (with a notice); leaving the drifter class
  may move you to the smaller team at respawn (toast). Rules in `packages/shared/src/config/conquest.ts`
  and `apps/server/src/rooms/conquest.ts`; full text in `game-decisions.md` §14.1 / §10.6.
- Protocol version **9**; EN/DE keys for every new surface; `bun run test` runs the script,
  server and client suites.

Deliberately **not** in this build:

- **1E** — the rewrite of the procedural fallback characters is deferred (unreviewed, conflicts
  with 3C/4W; every class already shows its painted model). Review and merge on request.
- **Rest of M5:** cable car ride, T-bar ride, alpine coaster, hammock catapult, NPC cow
  behaviour, biplane, rowboat and gondola vehicles, vehicle repair and the heavy tower weather
  transformations. Weather currently grades sky, light and water and scales parachute wind.
  `INTERIM_CABLE_CAR_SPAWNS` (Peak Guard plates on the gorge floor below the mid station)
  stays until the cable car lands.
- Hot Beach Girl full post-process exemption (she gets PBR shading and the character mask but
  still the silhouette ink and grading).
- M6 destruction and M7 meta are not started.

Known issues for the owner's test: the terrain collider and the rendered terrain split steep
cells along opposite diagonals (up to ~3.7 m, feet can float or sink on steep slopes); the
coaster start deck intrudes ~2.5 m into the tank road; a boat fully beached on dry sand stays
stuck while crewed (empty, it deflates after 10 s and respawns); bot rounds lean Lagoon (about
6:14 in soaks); while the Lagoon League holds Tower C its summit pads can see the Peak Guard
base pads; the map is heavy (~1.3M+ triangles) and may run slowly on weak GPUs — use the
picture quality setting.

**Next, after the owner's test:** fix what the test finds, then the rest of M5 (map toys and the
remaining vehicles; delete the interim spawn plates when the cable car lands). Do not implement
M6 destruction or M7 meta systems before M5 is complete.

## Performance fixes after the owner's test (26 October 2026)

The owner authorized performance fixes and a push to master; the pause still applies to new milestone features. Rendering is capped at 60 FPS. Auto quality now reacts to sustained load throughout gameplay (4 s warmup plus 5 s overload; no automatic upgrades or changes to manual settings). Full-screen targets have pixel budgets: high 2560×1440, medium 1920×1080, low 1280×720, refreshed on resize/fullscreen. FXAA remains; redundant scene MSAA is off, medium uses 1024 shadows and cheaper filtering. Hidden tabs skip the frame work. Noise buffers are cached per AudioContext (bounded64entries), saturation curves per drive (bounded32), avoiding repeated audio-array generation during combat. Caches contain immutable recipe inputs.

## Repository map

```
apps/
  client/                 Svelte 5 + Vite 7 + Babylon.js 8 browser client
    public/models/        owner-generated Meshy GLBs (soldiers, drifters, hen, vehicles, mascots/)
    public/art/           owner-supplied 2D art (UI, painted world sprites/facades/textures)
    src/audio/            procedural synth, gibberish voice, supplied SFX recipes, music registry
    src/engine/           GameClient, camera rig, input; conquest/vehicle/critter/drifter/mascot clients
    src/net/              reconnecting binary WebSocket client
    src/rendering/        map, painted GLB library (glb/), hero weapons, vehicles, hens, mascots
    src/shaders/          GLSL/WGSL pairs (toon, post, sprite, facade, glb-character, …)
    src/state/            Svelte stores for phase, connection, HUD, conquest, vehicle, locale
    src/components/       menu, HUD (hud/), wardrobe, loading, pause, settings, debug, toast, error UI
    test/                 client unit tests (bun test, Babylon null engine)
  server/                 Bun authoritative game server
    src/rooms/            MatchRoom loop, combat, conquest, vehicle manager, critters, bots
    src/index.ts          HTTP health/config endpoints + WebSocket upgrade
    test/                 server suites (conquest, vehicles, drifter, spawns, codecs, soaks)
packages/
  shared/                 code shared by client and server
    src/config/           classes, drifter, mascot, critters, conquest, vehicles, weapons,
                          skills, cosmetics, profiles and the Fjord Fiesta blueprint (map/)
    src/i18n/             English master dictionary + typed German dictionary
    src/net/              binary opcodes, reader/writer, protocol and conquest codecs
    src/physics/          Rapier world, prop colliders, character motor, vehicle motor
    src/types/            shared domain types
art-src/                  untouched owner sources (Meshy downloads, Gemini sheets, painted world)
scripts/
  dev.ts                  starts server + client, tears both down on Ctrl+C
  optimize-models.ts      `bun run models`: Meshy downloads → public/models GLBs + manifest
  tests/                  script tests (painted model outputs)
```

## Commands

Run everything from the repository root. Bun 1.4.4 is the supported runtime.

| Command | Purpose |
| --- | --- |
| `bun install` | Install all workspace dependencies. |
| `bun run dev` | Start the authoritative server and Vite client together. |
| `bun run build` | Build shared, client and server bundles. |
| `bun run typecheck` | Strict TypeScript + Svelte diagnostics for all workspaces. |
| `bun run test` | Script, server and client test suites (`bun test`). |
| `bun run models` | Rebuild the painted models in `apps/client/public/models/` from `art-src/meshy/`. |
| `bun run preview` | Preview the production client build. |
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
- `packages/shared/src/physics/vehicle.ts` is the only vehicle motor: the server simulates the
  hulls with it and the local driver predicts with it.
- The Fjord Fiesta blueprint in `packages/shared/src/config/map-fjord.ts` (parts under
  `config/map/`) is immutable data.
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
- Painted Meshy models load through `src/rendering/glb/library.ts` from
  `public/models/manifest.json` (mascots: `src/rendering/mascot-models.ts`, own manifest).
  Soldier, mascot and vehicle models are optional and must keep a working fallback (procedural
  character, vehicle stand-in hull); a drifter only ever shows her painted model (contact
  shadow until it loads). Only listed files are requested.
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
3. `bun run test` — script, server and client suites must pass.
4. `bun run dev`, open the client and confirm the menu reaches **Connected**.
5. Click **Play Now**, confirm the HUD appears and the renderer line says WebGPU (or WebGL2).
6. Move with WASD, jump with Space, sprint with Shift, crouch with C/Ctrl, roll while
   sprinting, swim in deep water and deploy the parachute from a long fall.
7. Open the wardrobe from menu and pause; change class, cosmetics, body type and loadout;
   confirm the live preview updates and the profile survives a reload.
8. Preview the voice and test freeze/charred/soot effects.
9. Press Esc, confirm the pause menu; resume and return to the menu.
10. Switch EN/DE live; check menu, loading, deployment, HUD, pause, wardrobe and debug copy.
11. Open a second tab and confirm both vacationers appear, move and exchange cosmetics.
12. Confirm menu music, gameplay intensity beds and the round/death bed switch correctly.
13. Stand in a tower's capture ring and watch the capture bar, tickets and round clock; board
    a vehicle with F, switch seat with C, honk with H; play a drifter and a mascot; hold Tab
    for the scoreboard; shoot a hen.
14. Test `?renderer=webgl2` to exercise the fallback shader path.
15. Confirm no shader compilation errors or uncaught exceptions in the browser console.

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
- Server env flags for local tooling: `FF_NO_BOTS=1` starts without the four AI bots,
  `FF_DEV_TOOLS=1` enables the `/api/dev/*` endpoints (teleport, vehicle, critters, conquest
  staging). `FF_SERVER_PORT` / `FF_CLIENT_PORT` move the dev stack to other ports.
- `bun run models` drives the glTF Transform CLI through `bunx`, so it needs network access on
  first use. The committed outputs in `apps/client/public/models/` are what the game loads.
- Client URL options: `?renderer=webgl2`, `?quality=auto|high|medium|low`, `?painted=0`,
  `?mascotModels=off`, `?coconutShell=painted|meshy|vertex`, `?lei=procedural`, `?cowWalk=clip`.

## Roadmap boundaries

Milestone numbering follows the README. Do not implement ahead of the milestone gate:

- **M5 (rest, after the owner's test):** cable car (and the real Peak Guard fast route that
  replaces the interim spawn plates), T-bar ride, alpine coaster, hammock catapult, NPC cow,
  biplane, rowboat, gondola, vehicle repair, full tower weather transformations.
- **M6:** destructible buildings, bridges, trees, silos and billboards, terrain craters, the
  4,096-decal ring buffer, deterministic map reset and late-join map-state sync.
- **M7:** meta — persistence schema, economy, Kur-Pass/VIP, custom lobbies, armory rentals, ad
  overlays, dynamic billboards, end-of-round podium and rewards.
- **M8:** final polish, QA, performance/netcode/audio pass and deployment.

The owner first asked for the remaining milestones to be completed autonomously, with a GitHub
push after each one. Since 25 October the standing instruction is: **stop after the M5-Kern
test build and wait** — the owner tests it, and work resumes only when the owner says so.
Update this file, `README.md`, `game-decisions.md` and the German guide before each push.
