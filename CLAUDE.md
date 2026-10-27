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
- Protocol version **11**; EN/DE keys for every new surface; `bun run test` runs the script,
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
