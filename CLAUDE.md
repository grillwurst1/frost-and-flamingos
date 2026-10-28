# CLAUDE.md — Frost & Flamingos

Working notes for AI agents and humans who touch this repository. Read this before changing code.

## Mission

**Frost & Flamingos — Bullets, Fondue & Coconuts** is an original, clean-room climate-war
comedy shooter built as a Bun monorepo. The visual target is a readable, toy-like action
cartoon: snow, fondue and alpine kitsch on one side, turquoise lagoons, flamingos and beach
bars on the other. No Battlefield/EA assets, names, maps or audio may be used or imitated.

The project is delivered in milestones. **Only the current milestone may be implemented.**
Future-milestone code, placeholder gameplay loops and speculative systems are not allowed.

## Active owner priority: latest visual reference (27 October 2026)

The owner now requires the actual game, players and HUD to follow the latest
supplied screenshot, including live blue allied/red enemy name labels and triangle
markers. The tracked base reference is `Gemini_Generated_Image_qyqgueqyqgueqyqg.jpeg`;
the latest chat revision adds player names. This visual work takes priority over
new milestone features. Preserve all existing mechanics, wardrobe choices and
laptop rendering budgets. Work serially and compare the running game visually.
On 28 October the owner again rejected soldier quality. Prioritise actual player
sculpting, proportions and articulated hands before broader world art or M5 additions.
On 28 October the owner additionally required an outfit-independent body skin base;
fix scalp/forehead continuity and preserve all colour/clothing choices.
The owner explicitly requires continuing until the screenshot figure quality is met,
not ending after another small polish pass. Save verified increments, then continue.
`VISUAL_REFERENCE_WORK.md` records this task. Finish validation of the already
implemented cable car alongside the graphics; M6/M7 remain gated.

## Current state: M5 completion authorized (26 October 2026)

M1–M4 and the M5 core are complete. On 26 October the owner explicitly authorized
continuing through the remaining milestones to completion. The previous playtest pause
is lifted. Finish and verify M5 before implementing M6, then M7 and M8. Work serially,
keep checks focused, avoid unnecessary repeated work, and push completed, verified
increments to master. Track the remaining work in `MILESTONE_WORK.md`.

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
- Protocol version **13**; EN/DE keys for every new surface; `bun run test` runs the script,
  server and client suites.

Deliberately **not** in this build:

- **1E:** the owner has now authorized the character/wardrobe fixes described below.
  These use the existing GLB animation rigs with a configurable skinned body; unrelated
  future-milestone features remain deferred.
- **Rest of M5:** T-bar ride, alpine coaster, hammock catapult, NPC cow behaviour
  and the heavy tower weather transformations. Weather currently grades sky, light and
  water and scales parachute wind. The operational cable car replaces the interim spawn plates.
- Hot Beach Girl full post-process exemption (she gets PBR shading and the character mask but
  still the silhouette ink and grading).
- M6 destruction and M7 meta are not started.

Known issues for the owner's test: the coaster start deck intrudes ~2.5 m into the tank road; a boat fully beached on dry sand stays
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

The owner authorized all remaining milestones on 26 October 2026, lifting the prior
M5-Kern playtest pause. Proceed in milestone order without asking for that authorization
again. Keep development serial to conserve usage. Update this file, `README.md`,
`game-decisions.md` and the German guide before each push.


### Klarer 3D-Look und Laptop-Budget (26. Oktober 2026)

Auf Wunsch des Besitzers wurden Grafik und Dauerlast nach dem M5-Kern-Test überarbeitet. BFH dient ausschließlich als Referenz für klare Silhouetten und weich beleuchtete 3D-Formen; fremde Modelle oder Texturen werden nicht übernommen. Der Vollbild-Kuwahara-Malfilter entfällt vollständig. Zwei feste Nachbearbeitungsschritte (feine Konturen/Farbkorrektur und FXAA) ersetzen den bisherigen Dreieraufbau; Korn, Nachschärfen und Konturwackeln entfallen. Der Tiefen-/Normalenpuffer arbeitet mit halber Breite und Höhe (ein Viertel der Pixel). Materialbeleuchtung wird weicher, Modell-Normalmaps zurückhaltender und Textur-Mipwahl weniger überschärft. Der Kamera-Blickwinkel beträgt 62 Grad. Die sichtbare Terrain-Triangulierung stimmt nun mit Rapier überein, damit Figuren auf steilen Zellen nicht schweben oder einsinken. Die Physik bleibt unverändert.

Apple-GPUs starten automatisch auf Mittel. In den Grafikeinstellungen sind 30/45/60 FPS wählbar und gespeichert; Standard 45 FPS, Menüs höchstens 30 FPS. Niedrig behält bis zu 1600×900 Bildpunkte für bessere Lesbarkeit. Die automatische Qualitätsregelung berücksichtigt das gewählte FPS-Limit, damit absichtlich sparsame 30 FPS nicht als Überlast gelten. Diese Änderungen ersetzen die entsprechenden früheren Angaben zu Malfilter, 720p und 60 FPS-Standard. Weitere Meilenstein-Funktionen bleiben pausiert.

Das eigene Detailmodell wird bereits hinter dem Menü mit der vom Server zugewiesenen Fraktion angefordert. Die bedarfsgesteuerte Prüfung des Kamerabilds bleibt auf entfernte Figuren beschränkt. Dadurch muss die lokale Figur nicht erst mehrere sichtbare Frames als einfacher Platzhalter verbringen. Der Browservergleich prüft ausdrücklich das geladene Detailmodell. Das behebt die Ladeverzögerung; die mitgelieferten Modellgeometrien wurden dabei nicht neu modelliert.


### Räumlicher Boden (26. Oktober 2026)

Der Besitzer hat die flach wirkenden Bodentexturen beanstandet. Das Dorfpflaster bekommt daher echte, niedrig profilierte Steine mit abgeschrägten Kanten. Vier kleine, gemeinsam instanzierte Steingeometrien und ein Mörtelbett bilden das Pflaster; die Steine sind statisch und höchstens fünf Zentimeter höher als der Physikboden. Brunnenzugang und Spawnflächen bleiben frei. Außerhalb von 42 Metern entfällt die zusätzliche Geometrie. Die kleinen Steine werden nur im Farbdurchlauf gerendert; ihre Flächennormalen und abgedunkelten Fasen liefern die lokale Schattierung. Sie werden nicht erneut in die Schatten- oder Konturpässe geschickt.

Pflasterwege, Schnee, Sand und weitere Terrainlagen bekommen außerdem eine distanzabhängige Beleuchtungsnormalen-Variation aus den bereits gefilterten Materialfarben. Sie läuft in GLSL und WGSL ohne zusätzliche Texturabfragen, Materialtexturen oder Vollbildpass; steile Oberflächen und entfernte Details werden ausgeblendet. Das ergänzt das vorhandene Schnee-/Sandwellen-Shading. Die Gelände- und Spielfigurenphysik bleibt unverändert; das Mikrorelief ist rein visuell.


### Solide Karte und ruhigere 3D-Darstellung (26. Oktober 2026)

Auf den weiteren Spieltest des Besitzers hin wurden die stufigen Konturen und unvollständigen Kollisionen überarbeitet. Der halb aufgelöste Konturpuffer wird weich rekonstruiert; die Linien sind zurückhaltender und blenden früher aus. Runde Metallmasten verwenden mindestens zwölf Umfangssegmente. Mittel/Hoch glätten die eigentlichen Geometriekanten zusätzlich mit zwei MSAA-Samples unter WebGL2 beziehungsweise vier unter WebGPU (dessen API keine zwei unterstützt). Niedrig bleibt bei einem Sample. Die zwei Nachbearbeitungspässe, Pixelbudgets, 45-FPS-Vorgabe und dauerhafte Lastregelung bleiben erhalten. Dies ersetzt die frühere Aussage, dass MSAA auf allen Stufen abgeschaltet sei.

Die vorhandenen GLB-Figuren erhalten kontinuierliche Lichtverläufe und deutlicheres, in der Entfernung ausgeblendetes Normalmap-Relief. Die zugrunde liegenden Modelle werden nicht durch fremde Assets ersetzt. Frei kombinierte Oberteile, Hosen und Schuhe verwenden weiterhin den dafür vorgesehenen Baukasten-Körper; in der Garderobe führt „Gemaltes Outfit“ zum mitgelieferten Detailmodell zurück.

Begehbare Bäume, Palmen und Felsen sind nun räumliche Geometrien statt kameradrehender Bilder. Räumliche Gruppen wechseln nach 145 Metern auf einfachere 3D-Modelle; die Fernmodelle und Laubdetails erzeugen keine zusätzlichen Konturen. Kontaktschatten verankern sie am Boden. Bildflächen bleiben für kleines Boden-Dekor und den Hintergrund außerhalb der begehbaren Karte erhalten. Felsen sind auf die vorhandenen festen Kollisionsmaße abgestimmt. Rote Geländer an Land und Bojen im Wasser kennzeichnen die bestehende Kartenkante.

Wegzäune besitzen jetzt feste, dem Verlauf folgende Kollisionskörper. Kistenstapel werden auf Client und Server aus denselben Einzelteilen gebaut, einschließlich oberer Kisten und ihrer Drehung. Auch die allgemeine Höhenabfrage für Objektplatzierung folgt jetzt derselben Dreiecksaufteilung wie sichtbarer Boden und Rapier; die bisher verbliebene Abweichung auf steilen Zellen entfällt. Diese Korrekturen betreffen die bestehende Testkarte, nicht neue Meilenstein-Spielmechaniken.


### Gemalte Pflastertextur als 3D-Relief (26. Oktober 2026)

Nach dem weiteren Feedback des Besitzers entfallen die wiederholten Einzelstein-Grundformen. Das Relief wird stattdessen aus den gezeichneten Fugen und Steinflächen der unveränderten `art/tex/cobblestone_color.jpg` abgeleitet. Farbe und Geometrie verwenden dieselbe zwei Meter große Kachel und dieselben Koordinaten. So bleiben die unterschiedlichen Konturen und Pinselstriche erhalten; Fugen liegen tiefer und die Steinflächen steigen weich an. Eine zurückhaltende Höhenvariation über den Platz verhindert gleich hohe Steinflächen.

Eine gemeinsame, statische Bodenfläche ersetzt die vier Steinvarianten und das separate Mörtelbett. Sie bleibt unter 240.000 Dreiecken, verwendet nur einen zusätzlichen Farbdurchlauf und keine zusätzlichen Texturen. Der spezielle Pflastershader liest die vorhandene gemalte Farbkachel direkt, ohne die zusätzlichen allgemeinen Materialmuster darüberzulegen. Entfernungsausblendung bei 42 Metern, höchstens fünf Zentimeter Abstand zum Physikboden und freie Brunnen-/Spawnflächen bleiben erhalten. Das ersetzt die frühere Beschreibung des Bodens aus vier instanzierten Stein-Grundformen. Die 64×64-Höhentabelle lässt sich mit `python3 scripts/bake-paving-relief.py` (Pillow) reproduzieren; ein Test prüft den SHA-256 der unveränderten Quelltextur.


### Konfigurierbare, animierte Figuren (26. Oktober 2026)

Auf ausdrücklichen Wunsch des Besitzers wurde die Figurendarstellung im bestehenden Test-Build überarbeitet. Die sechs Soldaten verwenden weiterhin ihre mitgelieferten GLB-Skelette und Bewegungsclips, bekommen aber einen gemeinsamen, vollständig konfigurierbaren Körper. Oberteil, Hose und Schuhe lösen keinen Wechsel auf das alte starre Ersatzmodell mehr aus. Alle sieben Kleidungsbereiche, zwölf Hauttöne, acht Haarfarben, sieben Frisuren und der Körperbau beeinflussen die tatsächliche Geometrie beziehungsweise deren Farben. Vorschau, eigene Spielfigur und Mitspieler verwenden denselben Aufbau. Drifter und Maskottchen behalten ihre eigenen festen Formen.

Gesicht mit Kiefer, Augen, Nase und Ohren, einzelne Finger, Bartsträhnen, runde Gliedmaßen, Kragen, Gürtel, Knöpfe, Hosennähte und Stiefelschnürung sind räumlich ausgearbeitet. Kleidung, Haare, Haut und Accessoires werden in einem einzigen animierten Körpermesh zusammengeführt. Die vorhandenen Waffenposen, IK, Rollen und Bewegungsclips bleiben erhalten; konservative Knochenhüllen berücksichtigen bei Rollen auch die ausgewählte Kopfbedeckung. Für Soldaten entfallen die ungenutzten großen gemalten Körpertexturen. Ein auf zwölf Varianten pro Szene begrenzter Geometrie-Cache beschleunigt wiederholte Kombinationen, ohne pro Kleidungsstück eigene Draw Calls oder neue Vollbildfilter einzuführen.

Die Garderobe bezeichnet den Standard-Reset jetzt als „Standardkleidung anziehen“. Haut- und Haarfarbfelder haben eindeutige Beschriftungen, auch für Tastatur-/Screenreader-Bedienung. Die bestehende Profil-Speicherung und binäre Übertragung bleiben erhalten. Dies ersetzt die frühere Aussage, dass frei kombinierte Oberteile, Hosen und Schuhe nur am einfachen Baukasten-Modell dargestellt werden. Neue M5-Spielmechaniken bleiben pausiert.

Schnelle Mehrfachklicks auf Frisur- und Kleidungspfeile lesen den aktuellen Auswahlwert, statt einen noch nicht aktualisierten UI-Zwischenstand wiederzuverwenden. „Glatze“ erzeugt auch unter Hüten keinen zusätzlichen Haarbüschel. Validierung: 230 automatisierte Tests (10 Skript-, 171 Server-, 49 Client-Tests), TypeScript/Svelte ohne Fehler oder Warnungen und erfolgreicher Produktionsbuild. WebGL2-Browsertests prüfen Vorschau, alle sieben Kleidungsbereiche, Haut-/Haarwahl, Körperbau, Speicherung nach Neuladen, die eigene Figur, eine über das echte binäre Protokoll verbundene Mitspielerfigur und schnelle Auswahlwechsel ohne Konsolenfehler. Der neue Materialshader wurde außerdem unter WebGPU kompiliert. Die Cloud verwendet Software-Rendering; native Mac-FPS und Wärmeentwicklung wurden damit nicht gemessen.

### M5 continuation: rowboats and vehicle repair

The owner lifted the playtest pause and authorized all remaining milestones.
Four rowboats are now active in the existing vehicle system (wire kind already
reserved, no packet-layout change). Two crew, 200 HP, 8 m/s, synchronized 16 m/s
strokes on a 0.8 s beat, authoritative timing and matching HUD. Source Meshy boat
is processed into hull/oar-left/oar-right; 11,846 triangles, 1536 px shared paint,
no normal texture. A detailed procedural fallback keeps loading/missing assets
functional. Only nearby/on-screen boats request the painted model. Model tooling
uses the current Bun executable's `x` command, requiring no separate bunx binary.

X holds vehicle repair (40 HP/s, 3.5 m, world line of sight, friendly hulls only,
armed/damageable classes; exposed hand-weapon seats can repair). E remains skill 2.
Repair cannot exceed max HP or be combined with firing. Beat state resets when a
seat is freed. Remainder of M5 stays active; do not advance to M6 until it passes.

Validation (27 October): 237 automated tests pass (10 scripts, 177 server, 50 client), strict typecheck reports zero errors/warnings, and all production bundles build. The WebGL2 browser test checks the painted hull and moving oars, short-tap boarding, movement, rhythm HUD and actual repair (130 to 137 HP), with no console errors. Short action taps now survive slow render frames until consumed by simulation; inputs in text fields are ignored. No native Mac heat/FPS measurement is claimed.

### M5 continuation — biplane (27 October 2026)

Both authored aircraft are operational: 320 HP, water/glacier takeoff and landing,
14–28 m/s arcade flight (W/S throttle, mouse steering/pitch, A/D rudder), fixed
forward MG (15 damage, 500 RPM), pilot and two exposed upper-wing seats. Space
bails out with inherited momentum; the normal emergency umbrella remains available.
Wing riders can fire their own loadout and hold X to repair. A spinning propeller
launches enemy soldiers with the soot-blackened blast death; friendly crew are spared.
Hard impacts wreck the plane; an abandoned airborne wreck continues falling.

Flight uses the same deterministic motor for authority and prediction. Protocol 10
adds signed pitch/bank only to records carrying the extended-pose flag; variable
crew lists and existing vehicle codes are preserved. The owner's source model is
reduced to 11,817 triangles with one 1536 px colour texture and a separate spinning
propeller. A procedural fallback remains available. No additional full-screen pass
or normal texture is introduced. M5 remains in progress.

Validation: all 244 automated tests pass (10 script, 184 server, 50 client),
including the 15-minute bot soak. Strict typecheck has zero errors/warnings and
all production bundles build. WebGL2 checks real binary flight with pilot and
wing rider, painted model, firing and bailout without console errors. The prior
boat ram fixture now uses open water away from the seaplane spawn. Cloud tests
use software rendering; native Mac temperature/FPS have not been measured.

### M5 continuation — sidecar passenger view and vehicle poses (27 October 2026)

V toggles a true first-person view in the sidecar passenger seat. Mouse look
remains free through 360 degrees; the riveted tub, driver, wardrobe-coloured
forearms, individual fingers/gloves and current hero weapon remain visible.
Holding X replaces the weapon with a steel wrench; repairing still blocks fire.
The vehicle card moves above the hands. The view resets on seat changes or exit
and hides its hands behind the menu/wardrobe. Other seats retain shoulder swapping.

The existing animated skeleton now bends knees at seated footrests, puts drivers'
hands on the controls, rows and braces wing riders. Aircraft pitch/bank carries
the rider's body. Shared seat eye drops keep authoritative firing at seated
height; the shooter's own hull is excluded from personal hitscan/projectile
world rays. Other hulls and walls still block shots. No packet-layout change.

Only one local hands mesh and the existing hero weapon are active. Appearance
changes replace/dispose that geometry; no full-screen pass, texture or new
animation library is added. The actual five hand choices and both extreme skin
tones are covered by geometry/colour checks; repeated switches remain bounded.

Validation: 248 automated tests pass (10 scripts, 185 server, 53 client),
including the bot soak and real passenger damage/repair/fire suppression.
Strict typecheck reports zero errors/warnings; production bundles build.
WebGL2 checks V, painted motorcycle interior, hands/weapon and held wrench,
actual repair, return to third person and hiding hands in the wardrobe, with no
console errors. A focused viewmodel lifecycle check also passes after the final
framing adjustment. Native Mac temperature/FPS remain unmeasured.

### Latest screenshot: field HUD, soldiers and gorge (27 October 2026)

The new visual reference is the active priority, with the player-name revision in chat
as the latest target. The HUD now has ticket wings, objective discs and compass, a square
live minimap, wardrobe-aware portrait/health, five functional action tiles and three
weapon cards. Nameplates use real profiles, team colours, triangle pointers, current
rendered positions and static-world line of sight. They update at up to 20 Hz independently
of inventory telemetry, use the current camera matrix, and hide cloaked enemies.
Minimap terrain/roads/buildings are a cached SVG, not a second 3D render.

Default allrounder/reset clothing now follows the green waistcoat, white sleeves, brown
beard, cuckoo clock and red ski boots of the reference. Existing saved selections stay
intact. Gorge rims/nearby roofs have authored visual frost, cliffs use blue-grey angular
lighting, and bridge pylons/ropes are lower. Post collision sizes follow the same shared
layout; terrain heights and the painted paving relief remain unchanged.

The default sky and building surfaces use the existing 3D geometry, without painted
panorama/cloud/facade overlays. `?paintedSky=1&paintedFacades=1` opts into the older art.
Crisper cel shading and restrained material detail/colour grading use the existing
GLSL/WGSL materials. The 45 FPS default, automatic load governor, resolution budgets,
half-resolution contour buffer and two post-processing passes remain. The screenshot
is not matched exactly: composition, soldier proportions and later destruction effects
still need work. Do not claim a native Mac performance or temperature measurement.

### Cable car (M5 continuation, protocol 11)

Two rounded red cabins counter-run on the authored valley/mid/summit route, with three-second
station stops, protected interior seats and two exposed roof seats. F boards/exits; H
cycles seats; C/Ctrl crouches on the roof. F near a station lever or a real hitscan shot
pulls the emergency brake: both cabins stop/rock for two seconds. Standing roof riders
are thrown off; crouched and interior crew stay aboard. Cabins have no empty tow timeout.
The old interim gorge spawn plates are removed; bots do not use the cable car yet and
team balance still needs its M8 pass. The cabin is a single merged procedural mesh below
6,000 triangles, without a texture download or transparent-glass pass.

Release checks and browser evidence are recorded in `VISUAL_REFERENCE_WORK.md`.

Verified 27 October: 255 automated tests (10 script, 189 server, 56 client), clean strict
TypeScript/Svelte diagnostics and successful production bundles. WebGL2 checks real HUD/
nameplates and cable-car motion, seat changes, crouch, exit and station brake events without
console errors. Five material variants compile under WebGPU without errors. Moving cabin
and fallback boat meshes now follow their parents; regression checks cover hull translation
and oar rotation. Cloud rendering is software; native Mac heat/FPS remain unmeasured.

### Reference framing and actual reticle aim (27 October 2026)

Human camera defaults: 1.9 m shoulder, 1.64 m pivot, 3.25 m distance, same 62-degree FOV.
Lateral collision retracts the shoulder near walls; snaps clear both spring velocities.
`shared/aim.ts` validates finite unit-direction input and converges a camera centre ray
on a target from the actual eye. Do not validate against movement yaw: the camera spring
may still face elsewhere after a fast turn. The server keeps authoritative eye origin,
world obstruction, range, rewind, ammo and cadence. Existing FireRequest direction now
drives personal shots/remote tracers; the wire layout and protocol 11 stay unchanged.
Projectile origins no longer advance 70 cm through near cover. Four client and three
server regression tests cover framing, wall retraction, aim, malformed vectors and cover.
The 75-second tow/handover integration case has a 15-second CI wall-clock allowance;
its simulated duration and assertions are unchanged. No additional render pass.

Validation of the framing/aim follow-up: 262 tests pass (10 script, 192 server,
60 client), strict typecheck is clean and production builds succeed. WebGL2 medium
confirms an actual reticle hit through the binary client/server path (150 → 122 HP),
with no browser errors. The exact screenshot match remains open.

### Soldier geometry follow-up (27 October 2026)

Soldier body morphs have broader chests/limbs while retaining all wardrobe and skin
choices. The green waistcoat is a curved shell with raised pockets, not flat panels.
The cuckoo clock has an outward-facing dial, twelve hour marks, two hands, two gabled
roof panels, plank seams and hanging weights. Tall ski boots add shafts, cuffs, straps,
side clasps and exposed toe hardware. Covered trouser cuffs are omitted to prevent
clipping through the boot. Ankle binding blends continuously to the horizontal foot
cross-section, preventing inside-out clasp faces during animation.

The default detail body is about 44,000 triangles in one skinned draw; all tested
wardrobe variants stay below 60,000. No texture, material draw or full-screen pass is
added. Regression checks cover dial orientation, curved vest, tall boots and the
ankle's outward normals; the old binding fails the last check.

The WebGL2 three-view animated detail scene passes without errors. An additional
whole-scene WebGPU attempt does not pass in this Cloud: adapter initialization /
8 MiB mapped-buffer allocation fails even at 320×240. Earlier five WGSL material
compilations passed; do not claim a successful full WebGPU soldier scene or native
Mac performance measurement. The exact target still needs world-layout/silhouette
work. Further milestone features remain deferred for the current visual request.

Geometry release validation: 266 tests pass (10 scripts, 192 server, 64 client),
strict TypeScript/Svelte is clean, production bundles build, and the animated
WebGL2 close-up passes without console errors. The stricter ankle regression
also passes and fails against the previous mapping (inward-facing normals).

### Playable gorge composition (27 October 2026, protocol 12)

The shared heightfield now includes an east snow overlook with a walkable south
approach. A solid timber rail follows the actual per-post terrain heights; the
same fix applies to existing fences. The north chalet has moved back to its own
ledge, horizontal-board walls and a right balcony. The gorge floor receives snow,
the bridge sag is 1.4 m in shared geometry/physics, and giant firs leave the battle
clearing open. Northwest navigation clears the relocated house and square walls.
Five real-world physics tests cover these changes. Client/server must update
together despite unchanged packet fields (protocol 12). No shader, texture or
post pass was added. Continue the visual comparison; exact composition, coast,
vehicles and hero proportions still differ. Keep M5 toys and M6/M7 gated as above.

Gorge release validation: 271 tests (10 scripts, 197 server, 64 client), clean strict
typecheck and production builds. Final WebGL2 medium capture has no browser errors;
see `docs/qa/gorge-reference-2026-10-27.png`. Test players use real binary connections
and server-assigned teams. Hen damage fixtures now check standing body clearance,
preventing rail overlap from moving the shooter before firing. No production hit
rules changed. Full native WebGPU/Mac limitations above remain; no new shaders here.

### Owner rejected the graphic quality (27 October 2026)

The owner still finds the game unprofessional/pixelated and requires the supplied
reference. Passing tests is not visual acceptance. Keep further milestone features
paused and judge changes in actual gameplay captures at the reference resolution.
The current pass removes enclosed shin surfaces from tall boots, subdivides long
limb triangles before nonlinear rig binding, rolls the reference shirt sleeves,
rounds the Tyrolean hat, and softens sculpted character form lighting. Character
contours preserve resolved coverage rather than applying a binary alpha threshold
and coarse half-resolution depth ink over the same silhouette. Snow decoration
and snow colour-tile contrast are reduced; stone textures and terrain relief stay.
No new screen target, texture or post pass; frame/quality limits remain. The default
body has 51,384 triangles in one skinned draw; tested variants remain below 60k.
Do not call the screenshot target complete. Continue silhouette, vehicle and map art.

Quality-pass release: 273 tests pass (10 scripts, 197 server, 66 client), clean
typecheck/build, six isolated native WGSL compilations and error-free WebGL2 model/
1280×714 gameplay captures. See `docs/qa/field-quality-1280.png` and the figure-quality
before/after images (different idle poses). The long beached-boat integration case
has 15 s wall-clock allowance; the failed 5 s attempt passed every physics assertion
but took 5.19 s in Cloud. Simulation steps/assertions are unchanged. Native Mac is
unmeasured. The subsequent field-vest/sculpt pass below implements that next step.
Broader world/vehicle art remains open; keep saved profiles and all old outfits intact.


### Continuous sculpt, field vest and reference Heavy (protocol 13)

Implemented the next visual increment: continuous sculpted head with fused facial
forms, inset eyes/lids and preserved wrap normals; continuous arm lofts instead of
intersecting shoulder/elbow primitives; rounder boot soles and hidden trouser cuffs.
Trachten/Hawaii shirts have short/rolled sleeves. Closed tracht/field waistcoats
replace the enclosed chest/waist, and long spine-bound garment triangles are refined
before binding as well as limbs. Skin highlights are matte.

Append-only torso code 8 is the selectable EN/DE sleeveless field vest with pockets,
snaps, zip and shoulder tabs. New/reset Heavy: bald, light skin, bare arms, olive
vest/trousers, mountain boots. Saved profiles and all old cosmetic options remain.
Protocol 13 is required on both ends; packet fields and codes 0–7 are unchanged.
Default Allrounder 50,214 triangles, Heavy 28,308, each one skinned draw; cache 12.
No added texture/target/post pass; preserve the frame governor and quality budgets.

Cliff vertex paint uses broad strata; reduced steep-rock texture contrast and
facet-normal emphasis retain relief without emphasising every heightfield triangle.
No collider, terrain height, path or natural-rock/paving relief changed here.
WebGL2 model and full field captures pass with no console errors. The field uses
actual binary players/cow and waits for the real vehicle model, not its fallback.
See `docs/qa/reference-heavy-vest.png` and `reference-field-vest-1280.png`.
The image target remains unfinished; next priority is world/vehicle form and scene
composition, not new M5/M6/M7 features.

Native isolated shaders reached compilation, but strict queue-completion validation
failed with Cloud SwiftShader's external-instance/device-loss error. This is not a
successful native game/render test. Do not claim M4 hardware performance or heat.

Field-vest release validation: **280 tests pass** (10 scripts, 198 server, 72 client),
strict TypeScript/Svelte checks report zero errors/warnings, and production builds
complete. WebGL2 model/field browser checks pass without console errors. Six native
WGSL variants reach compilation; strict GPU queue completion fails with the Cloud
external-instance error. Visual-reference acceptance and native hardware QA remain open.


### Owner-priority soldier sculpt (28 October 2026)

Actual geometry, not sharper post-processing: stronger fused face anatomy and eye
sockets, one jaw-following carved beard, tailored cloth folds/seams, fitted bevelled
leather harnesses, pinched felt crown/curled oval brim, quieter leather stitching.
Modular head radius is 0.80 of catalogue Heavy / 0.90 for other soldiers; the shared
`modularHeadFrame` also updates mouth/hold measurements. Footwear is narrower with
smaller ski buckles. Heights, physics, movement, wardrobe IDs and protocol 13 stay.

Native finger joints now carry real phalange surfaces plus a rig-fitted palm. The
existing fist/trigger solver previously moved empty finger joints while visible
fingers were rigid to Hand. Keep mittens/boxing/hook/watch choices and incomplete-rig
fallbacks. Roll envelopes collect articulated digits under Hand; coarse roll checks
remain bounded instead of adding per-frame CPU skinning. Bare articulated arms can
have only one source part: bake its transform before mergeParts' single-part path
and reset, otherwise the whole arm loses its offset. Both forearms are regression-tested.

UV.x carries local authored cavity shade through subdivision/cache/skinning; profile
RGB and the skin mask remain exact. Only the modular material reads it; spheres'
ordinary UVs are cleared, painted/fixed characters and weapon materials retain their
existing paths. GLSL/WGSL match. No new texture, target or post pass, one body draw,
cache 12 and existing FPS/pixel budgets. Check images rather than treating tests as
visual sign-off. The owner's screenshot quality remains active work.

Validation: **283 tests pass** (10 scripts, 198 server, 75 client). After the final
strap-fit adjustment, all 75 client tests pass again; final strict typecheck has
zero errors/warnings and all production builds succeed. WebGL2 connected menu,
deployment and field capture pass without console errors after a fresh dev-server
start (a stale Vite error overlay blocked the earlier attempt). Six isolated native
WGSL variants reach compilation; GPU queue completion still fails with Cloud
SwiftShader's external-instance error. Full native/Mac thermal QA remains open.

Final default body counts: Allrounder **46,236** / Heavy **25,756** triangles, one
skinned body draw each (previously 50,214 / 28,308). No measured M4 FPS/heat claim.
See [model views](docs/qa/player-sculpt-2026-10-28.png) and
[actual 1280×714 game](docs/qa/player-field-2026-10-28.png). The field uses actual
binary-connected profiles; positions are staged. Earlier model captures use
different poses. These record progress, not acceptance of the screenshot target.


### Authored soldier surfaces restored (28 October 2026)

The direct comparison found the principal quality loss: the configurable body had
replaced the owner's detailed Meshy geometry with simpler procedural forms. The
new native wardrobe mesh retains matching authored head, shirt/arms, hands, trousers
and headgear surfaces and merges selected replacement parts into the same skinned
draw. Authored normals, UV paint and finger weights survive. glTF's opposite face
winding is corrected when importing its surfaces into the mixed mesh. Unused
replacement vertices are compacted out. The reference allrounder has 25,364 triangles
in one body draw (previously 46,236). This is a triangle reduction, not a measured
Mac thermal/FPS result.

Skin, hair and cloth masks are derived from the original UV paint and skeletal
regions, including named/unnamed face descendants. Padded UV-island gutters prevent
pale seams on dark skin. The green waistcoat preserves shirt/sleeve details. Paint
and a 1024 mask are shared per visible class; soldier normal maps are not loaded
for this path. No render target or post pass is added. Full-screen/FPS limits and
the 12-outfit cache remain. Colour textures add a bounded per-class memory cost
compared with the previous untextured body; they are never copied per player.

`bun run wardrobe-assets` rebuilds six metadata/mask pairs from the unchanged
optimised GLBs (Python 3, NumPy, Pillow). Run it after `bun run models`; committed
SHA-256/topology checks reject stale derived data and keep the complete fallback.
Both loaded rig and wardrobe paint are awaited before a detailed view is swapped
in. Protocol 13 and saved profile IDs remain unchanged.

Not every head/outfit has an authored counterpart yet. Unsupported hair/beard/hat
combinations currently retain complete configurable replacement parts, avoiding
open scalp holes or hidden stale cosmetics. Continue with a reusable detailed
clean/bald head (especially the reference Heavy), then other hair/face variants and
class-specific anatomy. The owner's screenshot target is still active; do not
resume new M5/M6/M7 features or call this visual acceptance.

Native wardrobe release validation: **289 automated tests pass** (11 asset/script,
198 server, 80 client); strict TypeScript/Svelte has zero errors/warnings and all
production bundles build. The server suite was rerun by itself after two 5-second
fixtures timed out while competing with software rendering; all 198 then passed
without changing any assertion or timeout. Client tests also passed in isolation.
WebGL2 renders verify actual painted anatomy, the corrected front-face winding,
three skin/hair combinations and a single skinned draw. Seven shader variants,
including native wardrobe, compile through the WebGPU path, but the cloud's strict
GPU queue check still fails with an external-instance OperationError; this is not
a successful native GPU gameplay test. Native M4 performance remains unmeasured.

The full WebGL2 game check also passed at 1280×714 on Low (software rendering):
Connected → Play Now, authoritative overlook positioning, live named protocol
peers, loaded painted crawler and actual local native-wardrobe body, with no
browser errors. The saved field image is `docs/qa/native-wardrobe-field-2026-10-28.png`;
model/colour comparisons sit beside it. This remains a progress capture, not
screenshot acceptance; remote custom heads and other art differences remain.

### Anatomical skin base and detailed configurable heads (28 October 2026)

The owner explicitly requires one body skin colour before clothing, with outfits
layered over it, and reported a forehead colour discontinuity. Every configurable
soldier now has one `uSkinColor` from the saved profile, including the complete
unpainted fallback. Exposed anatomical surfaces and the scalp use that same base;
outfit paint contributes only a small neutral crease shade, never its original
skin hue. Skin-mask gutters retain coverage. Hair, eyes and clothing keep their
own pigment layers. Selecting a shirt/vest does not change the head anatomy or
skin base. This adds no render pass, draw call or per-player texture.

Custom bald/clean-face/headgear combinations now reuse the scout's sculpted eyes,
nose, ears and lips, a closed smooth skull and rounded 3D eyebrows. This avoids
exposing hidden hat cuts or retaining a flesh-coloured hat cuff. The clean head is
baked offline, including UV repacking and pigment transfer in Blender. Skin/hair
selections remain independent. The original sculpted afro also supplies reusable
curls for other face choices; its shade data multiplies the selected hair colour.
A smaller inner hair surface covers areas originally hidden by goggles. Masks
separate actual black hair from facial creases and goggle paint.

The shared head geometry and 1024×2048 colour / 512×1024 mask atlas are cached once per scene
(about 13.3 MiB for RGBA textures with mipmaps), rather than per outfit/player. Normal
maps remain disabled for this soldier path. The original default hero retains its
25,364-triangle single body draw; alternate heads/curls remain under the existing
60k outfit ceiling. Body recipe cache 12, 45-FPS/pixel limits and protocol 13 remain.
The Alpine Heavy's old fur coat hem is no longer imported as selected olive pants.

`bun run wardrobe-assets` now also requires Blender (verified with 4.3.2), Python 3,
NumPy and Pillow. It derives the closed head and curls from the unchanged owner
GLBs, updates all six metadata hashes, and emits the shared paint pair. Runtime
validates topology and SHA-256; incomplete/stale data keeps a complete fallback.
Original artwork, GLBs and animation clips remain unchanged. See CREDITS for the
Meshy attribution. Further exposed-arm/garment refinement and world art still need
visual work; the owner's full screenshot target has not been accepted as complete.

The forehead correction also repairs skin triangles crossing the original GLB
hat split. Eligibility is clipped to the actual 3D forehead on Alpine models;
the mask can identify skin inside a hat-labelled triangle while retaining the
hat's own paint. The shader applies the anatomical skin layer there as well.

Release checks: **296 automated tests pass** (12 derived-asset/script, 198 server,
86 client), strict TypeScript/Svelte reports zero errors/warnings, and all production
bundles build. The full suite passed after the final forehead-mask bake. WebGL2
GPU readback verifies the actual fragment's unlit base output: face, closed scalp
and an original-model forehead skin UV inside a hat-labelled triangle all equal
the selected RGB value exactly for every one of the twelve palette entries.
`docs/qa/skin-base-probe-2026-10-28.json` records the values and fixture scope. This
is a base-colour check before lighting/post, not a visual screenshot acceptance.

The real wardrobe UI check passes in WebGL2 with no browser errors: bald Heavy,
skin tone 9 and hair colour 3, field vest → tracht → Hawaii shirt while keeping
skin selection, profile persistence after reload, then actual gameplay with that
saved appearance. `docs/qa/skin-base-wardrobe-2026-10-28.png` and the corresponding
gameplay capture show the result; remaining garment/anatomy art is still visible.
All eight shader variants, including the shared head and skin base, reach WebGPU
compilation. The cloud's strict queue completion still raises the existing
external-instance OperationError, so native GPU gameplay and Mac M4 thermal/FPS
behaviour remain unverified. Do not describe the compile check as a native playtest.

The last Afro mask correction includes true zero-black source pixels (strict
colour-ratio comparisons had excluded them). After that derived-data rebuild,
all 12 asset/script and all 86 client tests passed again, and the production build
passed; server sources are unchanged from the passing 198-test run. The shared
curl mesh contains 4,605 triangles. Native shader code is unchanged from the eight
compiled WebGPU variants. Skin base/readback and wardrobe persistence checks remain
as recorded above.

Final skin/material refinements: imported vertices split at categorical material
region boundaries, preventing interpolated skin/outfit identifiers. A regression
fails on the old mixed triangles and passes after the split. Brown facial creases
are retained as anatomy rather than discarded as red cloth. Curl paint and face
paint share the same padded atlas, preserving the artist's curl detail with the
selected hair colour. The larger atlas costs about 13.3 MiB once per scene; no
new sampler pair, render pass or body draw is added.

The generated manifest records a stable content revision for the whole wardrobe
set. Body paint, masks and the shared atlas use versioned texture URLs; model and
metadata JSON are revalidated. This prevents a deployment from mixing cached old
skin textures with updated geometry/UVs while retaining caching for unchanged
assets. All six classes share the same revision.

Latest validation: **297 tests pass** (12 asset/script, 198 server, 87 client),
including the material-region regression. The full suite passed after the face
surface/region corrections; after adding stable cache versions, the 12 scripts
and all 87 clients passed again, with clean strict types and a successful build.
The current packed atlas also passes GPU base-colour readback for all twelve skin
tones, including the native forehead. The browser confirms all six requested
wardrobe textures carry the same generated content revision. Updated values and
request URLs are recorded in the skin-base QA JSON. Shader sources remain the
same eight compiled WebGPU variants; the previously recorded cloud queue limitation
and absence of native M4 measurements still apply.

The final versioned-asset wardrobe/gameplay flow was repeated successfully after
atlas packing and cache-key changes, with zero browser errors. Current wardrobe
and gameplay captures replace the earlier files; the four-figure comparison is
`docs/qa/skin-base-four-figures-2026-10-28.png`. It shows clean bald heads and two
Afro/face combinations under normal scene lighting, in single body draws of
28,461 / 21,080 / 32,501 / 27,047 triangles. These are progress images; primitive
exposed arms and some garments still require the next art pass. Continue that
work after saving this increment rather than declaring screenshot acceptance.


### Authored bare-arm surfaces (28 October 2026)

Configurable sleeveless outfits now reuse the owner's sculpted Lagoon Heavy
arms, retargeted once into each existing bind rig. Every exposed arm uses the
selected anatomical skin uniform; no donor complexion is imported as clothing.
The existing native sleeves and articulated configurable hands remain available.
The arms join the single skinned body draw and its animation/culling envelopes.
Their paint shares the head/curl atlas, still 1024×2048 plus a 512×1024 mask
(about 13.3 MiB RGBA with mipmaps once per scene). Curls use a narrower atlas
tile; face resolution is retained. No new sampler, render pass or per-frame CPU
skinning is introduced. Source GLBs remain unchanged. Shirt, trouser and
accessory refinement remains open; this is not screenshot-target acceptance.


Validation of the arm increment: strict types report zero errors/warnings and
production builds pass. The full test command passed (13 scripts, 198 server,
89 client); after the final arms-only atlas rebuild, the 13 scripts and 89 clients
passed again. WebGL2 base-colour readback matches all twelve selected palette
values exactly at the tested face, scalp, native forehead and authored-arm UV
fixtures. `docs/qa/sculpted-arms-probe-2026-10-28.json` records their scope and
content revision. The actual wardrobe flow also passes: select skin 9/hair 3,
change field vest → tracht → Hawaii, reload the saved profile and enter gameplay,
with zero browser errors. The wardrobe/gameplay captures are in `docs/qa/` with
the `sculpted-arms-` prefix. Shader sources are unchanged from the previously
compiled GLSL/WGSL variants; the existing cloud WebGPU queue limitation and lack
of native Mac M4 measurements still apply. This remains a visual work increment,
not acceptance of the full screenshot target.


### Configurable beard fit and trouser fabric (28 October 2026)

Eyepatch/full beards share the sculpted jaw surface and selected hair colour.
Eyepatch straps wrap around the head. Custom face accessories map the old eye
and mouth landmarks onto the actual shared sculpt; Heavy accessories also follow
its wider jaw. The beard leaves the lip opening visible. Native matching faces
keep their original artwork.

Olive trousers now use continuous sculpted fabric with knee/cuff compression and
small cargo-flap details. The entire trouser surface belongs to the legs slot;
native mountain boots no longer hide its calf fabric. Cloth remains independent
of skin colour. This adds no textures, samplers or body draws; geometry remains
within the existing outfit ceiling and uses the same GPU skinning/cache.

The same pass adds a closed, trouser-coloured waist facing beneath mixed shirts
and pants. It prevents the original shirt's shorter mesh from leaving an open
abdomen when its matching trousers are replaced; matching native trousers still
remove the extra facing. The mixed-outfit regression checks both the waist and
calf coverage. The front-normal regression samples the actual beard surface
rather than assuming the old, higher lip boundary.

The real WebGL2 wardrobe flow passes with selected skin 9, hair colour 3 and the
eyepatch beard, followed by profile reload and actual field-vest gameplay,
without browser errors. Close face and wardrobe/gameplay captures are in
`docs/qa/fitted-face-accessories-2026-10-28.png` and `docs/qa/tailored-*.png`.
These prove this increment's displayed choices, not full screenshot acceptance.


Release verification for this increment: **302 tests pass** (13 derived-asset,
198 server, 91 client), including the 15-minute simulated bot soak, selected
beard colour/chin fit, mixed-outfit waist/calf coverage, articulated fingers,
vehicle poses and roll clearance. Strict types report zero errors and warnings;
all production bundles build. GLSL/WGSL shader sources and the versioned painted
assets are unchanged; this geometry pass adds no texture allocation or render
pass. The previous native-WebGPU cloud limitation and absent M4 thermal/FPS
measurements remain. Continue figure/weapon/world refinement; the complete
reference-image target has not been accepted.


The final WebGL2 comparison after the waist closure also passes without browser
errors: mixed original shirt + olive trousers + native mountain boots and a
bald Heavy in field vest/olive trousers. The first two bodies use 26,814 and
24,616 triangles respectively, each in one submesh. The capture and exact scope
are `docs/qa/tailored-trousers-four-2026-10-28.png` and the tailored-wardrobe JSON.
Remaining source garment edges, hand silhouettes and weapon scale still need
work; no complete visual-target acceptance is claimed.


### Compact SMG and original calf skin (28 October 2026)

The SMG now follows the latest reference's compact box-magazine silhouette,
with matching support-hand grip and muzzle sockets. Geometry drops from
1,318 triangles / 806 vertices to 1,052 / 664; no extra texture or draw call.
Its weapon id, damage, cadence, ammo, reload and protocol stay unchanged.

The original Alpine Allrounder's calf/sock surfaces were incorrectly grouped
with footwear by the old knee cutoff. They now belong to the leg surface above
the measured ankle-boot rim. Actual exposed calf paint uses the selected skin
base; mixed long trousers no longer import the old socks with mountain boots.
Original GLBs/albedo/animations remain unchanged; derived masks/metadata and
the stable content revision are rebuilt. A regression covers calf pigment and
boot-region boundaries. Shader sources and atlas dimensions are unchanged.


Validation: **303 tests pass** (13 script/asset, 198 server, 92 client), including
the original-calf skin/boot-boundary regression. Strict types report zero errors
and warnings; production builds pass. GPU base-colour readback matches all 12
selected skin colours exactly at the tested face/scalp/native-forehead/shared-arm
and original-calf fixtures; scope and content version are in
`docs/qa/calf-skin-base-probe-2026-10-28.json`.

The real staged WebGL2 game also passes: SMG fires (30 → 29), reports a finite
new muzzle position and reloads to 30. Live allied/enemy labels and the painted
crawler load without browser errors. The figure/field captures and measured
weapon counts are `docs/qa/compact-smg-*.png` / `compact-smg-2026-10-28.json`.
These are functional/cloud visual checks; native M4 temperatures/FPS and full
reference-image acceptance remain unverified. Continue hand and world artwork.


### Remove donor-hand remnants from reusable arms (28 October 2026)

The arm bake now clips the donor sculpt at the actual Hand/ForeArm wrist plane,
retaining 4 mm of overlap with the configurable hand. Bone-majority labels had
included donor hand fragments, producing extra finger-like spikes on sleeveless
Heavies. New cut vertices interpolate original UVs, normals and four normalised
skin weights offline. Shared arms drop from 2,293 vertices / 3,376 triangles to
2,256 / 3,323. The regression forbids arm vertices beyond the wrist margin.
No runtime pass, sampler, texture allocation or per-frame work is added.


Validation: 303 tests pass, strict types have zero errors/warnings and production
builds pass. WebGL2 close/four-view captures have zero browser errors; the
close camera uses a 2 cm near plane to avoid cutting into the hands. All 12
skin colours still match in the five GPU base-colour fixtures. Evidence:
`docs/qa/clean-wrist-*.png` and `clean-wrist-skin-probe-2026-10-28.json`.
The configured palms and arm-to-hand seams still need refinement; screenshot
quality and native M4 performance are not accepted by these checks.


### Closed configurable hands and complete wrists — 28 October 2026

Palms overlap the forearm by 18 mm and now close at both the wrist and knuckles.
Nine finger strips resolve the phalange boundaries and give the fingertips a
rounded taper. Fully jointed hands retain the existing finger/reload animation.
For a source wrist without finger bones (the Lagoon Heavy left hand), a compact
curved grip replaces the old outstretched paddle when a configurable hand is
needed; it rotates with the wrist as one grip, not as individually animated digits.
Its local finger/thumb frame now participates in the existing hold solver.

The shared-arm bake includes hand-weighted faces behind the true wrist plane
before clipping, then closes the cut. This removes the jagged semantic-region
edge rather than leaving a hole behind the new palm. Shared anatomy is now
2,259 vertices / 3,400 triangles (77 more triangles than the clipped checkpoint).
Selected skin is still the independent anatomical base. No new texture, material
pass, skeleton bone, packet field or per-frame geometry rebuild was introduced;
the single body draw and bounded outfit cache remain. Wider face/outfit/reference
quality remains open.


Validation: all 305 checks pass (13 script, 198 server, 94 client); the client
suite passes without the dev server after one 5-second fixture timeout in the
combined run. Types have zero errors/warnings and production builds pass.
Additional wrist-cap geometry and forced wrist-only/watch checks pass.
Serial WebGL2 Alpine/Lagoon close-ups, four configured figures and all 12 skin
colours at five base-colour fixtures pass with zero browser errors. Evidence:
`docs/qa/closed-hands-2026-10-28.json` and `closed-hands-*.png`. Body draws stay
at one per figure; the four captures have 25,880 / 24,904 / 32,501 / 23,201
triangles. Face sculpting and wrist blending still need artwork refinement.
The Lagoon Heavy also exposes fragments of its fused original ring/vest when
changing to a field vest with native trousers; fix that outfit combination next.


### Complete Lagoon Heavy clothing — 28 October 2026

The donor's fused vest/ring and short ragged trousers are not the selectable
bare-chest flamingo ring or full-length olive pants. Stop using those donor
clothes as native replacements. Generate complete chosen garments instead,
retaining the sculpted/shared anatomical surfaces and compatible native hands.
This removes old ring/vest fragments when switching tops and restores missing
calves in the former native-pants combination. All existing choices remain.

Validation: 95 client tests pass, including four garment combinations and
bilateral calf-fabric coverage; strict types report zero errors/warnings and
production builds pass. The previously passing 13 script and 198 server checks
are unaffected (306 checks in total). A serial WebGL2 four-figure capture has
one body draw per figure, finite muzzle positions and zero browser errors.
See `docs/qa/heavy-complete-outfits-2026-10-28.*`. No texture or frame-loop work
was added. Face, sleeve and wrist artwork still needs refinement; the reference
quality and native M4 thermal/FPS goals remain open.


### Geometric eyes on configurable heads — 28 October 2026

Shared configurable heads now have closed sculpted eyes with solid iris, pupil
and highlight geometry, aligned to the wrapped sockets. Original native heads
are retained. Old raster eye pigment underneath becomes the selected anatomical
skin. Vertex alpha 2 marks this solid anatomy; preserve the existing head-atlas
category/UVs to avoid interpolation through the body-atlas category. GLSL/WGSL
apply selected skin and matte skin gloss after painted pigment.

This adds 736 triangles per configurable head in its existing single body draw,
built only in the bounded outfit cache; texture allocation stays unchanged.
97 client tests pass, types have zero errors/warnings, production builds pass.
The earlier 13 script and 198 server checks are unchanged (308 checks total).
WebGL2 six-region fixtures match all twelve skin RGB values exactly, including
the eye sockets. Actual SMG fire/reload and staged 1280x714 game pass without
browser errors. Eight WGSL variants compile; the cloud device is destroyed at
queue validation, so WebGPU gameplay/M4 thermals remain unverified. Evidence:
`docs/qa/sculpted-eyes-2026-10-28.json` and `sculpted-eyes-*.png`.
Continue the real mouth/upper-lip sculpt, then sleeve/wrist and world artwork.
The reference acceptance and M5 art gate remain open.
