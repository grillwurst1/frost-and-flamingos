# Frost & Flamingos — Bullets, Fondue & Coconuts

**Current build:** M5-Kern test build — the core of M5 (Climate Conquest, four vehicles) plus
painted world, configurable soldiers, drifters, mascots and hens.
**Active work:** completing M5, then M6–M8 in order, authorized by the owner on 26 October.
Development proceeds serially; see [MILESTONE_WORK.md](MILESTONE_WORK.md).

A clean-room, browser-based third-person multiplayer action-cartoon shooter built with
**Bun**, **Svelte 5**, **Babylon.js 8** and **Rapier3D**. Two absurd holiday resorts fight
for one fjord: the Peak Guard wants permanent snow, fondue and orderly alpine silence; the
Lagoon League wants endless summer, flamingo inflatables and barefoot chaos.

> **Milestone status**
>
> - [x] **M1 — Monorepo, i18n, Toon Engine & Playable Prototype:** monorepo, typed EN/DE
>   dictionaries, binary protocol, deterministic Rapier3D world, 30 Hz authoritative server,
>   Babylon.js WebGPU/WebGL2 toon renderer, spring camera and the first Fjord Fiesta slice.
> - [x] **M2 — Classes, Wardrobe & Identity:** three classes, persistent profiles, loadouts,
>   seven cosmetic slots, live 3D wardrobe, server-authoritative profile sync, procedural
>   character rig, supplied music beds and cover-inspired menus.
> - [x] **M3 — Core Movement, Extended Actions & Physics:** tactical sprint, crouch with a
>   35 % shorter hitbox, ledge mantle/vaulting, dodge roll, swimming, authored ice patches
>   with low-friction sliding, emergency parachute and the shared deterministic motor.
> - [x] **M4 — Weapons, Combat, Bots & Audio:** all three weapon slots, six gimmick weapons,
>   server hitbox rollback, class skills, universal widgets, cartoon death types, procedural
>   combat audio, AI bots, kill feed, live killer cam and random spawning.
> - [ ] **M5 — Fjord Fiesta, Weather Towers, Vehicles & Map Toys:** full map, three weather
>   towers, global weather shader, 50-ticket conquest loop and ten networked vehicles.
>   *In the M5-Kern test build:* rebuilt 257 × 257 Fjord Fiesta, Climate Conquest (towers,
>   tickets, weather balance, rounds) and four drivable vehicles. *Still open:* cable car,
>   T-bar, coaster, hammock, NPC cow, biplane, rowboat, gondola and vehicle repair.
> - [ ] **M6 — Destruction, Craters, Decal Ring Buffer & Match Sync:** three-stage buildings,
>   real terrain craters, repairable bridges, felled trees, billboards, 4,096-decal ring
>   buffer, deterministic round reset and late-join map sync.
> - [ ] **M7 — Meta, Economy, Monetisation & Live Features:** Drizzle schema with memory
>   fallback, economy, Kur-Pass/VIP, custom lobbies, armory rentals, ad overlays, dynamic
>   billboards, end-of-round podium and rewards.
> - [ ] **M8 — Final Polish, QA, Typecheck, Build & Deployment:** performance, netcode, audio
>   and typecheck pass, final manual, commit and GitHub push.


---

## What is playable right now

- **Climate Conquest.** Three weather towers (A Lagoon Harbor, B Village Square, C Summit
  Dairy) with 16 m capture zones, 50 vacation tickets per team, a ticket drain for the side
  holding fewer towers, a weather balance that tints sky, light and water, 20-minute rounds,
  a 15 s results ceasefire and an automatic round reset. Hold `Tab` for the scoreboard.
- **Fjord Fiesta, rebuilt and painted.** 800 m × 800 m on a 257 × 257 heightfield: lagoon and
  beach in the south-west, village and waterfall gorge in the middle, snowy summit in the
  north-east, both faction bases. Painted billboard trees, bushes and clutter, painted
  facades, painted terrain layers and ground decals, a foothill ring beyond the map edge and a
  painterly comic post pass with ink outlines.
- **Five classes.** Allrounder, Heavy and Infiltrator as painted, rigged soldiers (six Meshy
  models, one per class and faction); the **Mascot** — Alpine Cow (Peak Guard) or Battle
  Coconut (Lagoon League) — that rams instead of shooting; and the untouchable **Drifter** —
  Creepy Mountain Girl or Hot Beach Girl — who only walks and supplies her team with an aura.
- **Four vehicles.** Fondue Crawler, Coconut Beach Tank, Tactical Badi-Flamingo boat and
  Sidecar Motorcycle, two seats each, server-authoritative and predicted for the driver.
- **Wandering hens** on both halves of the map: they scatter from people and gunfire and can
  be shot (feather burst and a kill-feed line, no score).
- **Live wardrobe:** body type, 12 skin tones, 8 hair colours, 7 hairstyles, 7 cosmetic slots,
  loadout selectors, voice preview and freeze/charred/soot preview effects.
- **Persistent identity:** your profile is stored in `localStorage` and synchronised to every
  other player through the authoritative server.
- **Movement:** walk, sprint, crouch, dodge roll, jump, mantle, swim, low-friction ice
  sliding and an emergency parachute with wind drift, steering and a faction-specific canopy.
- **Ice rinks:** three authored frozen patches (village pond, summit rink, glacier tongue)
  use the shared `ice_patch` surface tag for gliding, flailing movement and ice-slide audio.
- **Multiplayer:** 60 Hz authoritative physics, 30 Hz binary snapshots, client prediction,
  reconciliation and remote interpolation.
- **Combat:** three weapon slots per class drawn as 13 hero weapons with hold poses, six
  gimmick weapons, server-side hitbox rollback, headshots, shields, reloads, projectile splash
  damage, nine class skills, 2 s spawn protection and a 10-second live killer cam.
- **Bots and feedback:** four named AI bots that play the towers, kill feed, adaptive
  crosshair, hit markers, damage vignette, comic popups, procedural combat SFX/voice and four
  cartoon death outcomes.
- **Audio:** fully procedural Web Audio graph (SFX, voice, ambience, limiter and 3D panning)
  plus the project owner's supplied music beds. No external samples.
- **UI:** comic cover-art main menu, boot/deployment loading screens, full combat and conquest
  HUD, round results banner, pause menu, wardrobe, audio and picture-quality settings, debug
  telemetry and a live EN/DE switcher.

The remaining M5 map toys and vehicles, terrain destruction, the 4,096-decal ring buffer and
the meta/economy layer are gated behind the rest of M5, M6 and M7 (see
[Known limitations](#known-limitations)).

---

## Quick start

Requirements: **Bun 1.4.4+**, a modern Chrome/Edge/Safari with WebGPU or WebGL2.

```bash
git clone https://github.com/grillwurst1/frost-and-flamingos.git
cd frost-and-flamingos
bun install
bun run dev
```

Open <http://localhost:5173> and stop with `Ctrl+C`. To update later: `git pull && bun install`.
The German player guide [`BEDIENUNGSANLEITUNG.md`](BEDIENUNGSANLEITUNG.md) walks through every
step on macOS. The server health endpoint is
<http://127.0.0.1:3000/api/health>.

Useful commands:

| Command | Purpose |
| --- | --- |
| `bun run dev` | Start the authoritative server and Vite client together. |
| `bun run typecheck` | Strict TypeScript and Svelte diagnostics for all workspaces. |
| `bun run build` | Build shared, client and server bundles. |
| `bun run test` | Run the script, server and client test suites (`bun test`). |
| `bun run models` | Rebuild the painted models in `apps/client/public/models/` from the Meshy downloads in `art-src/meshy/` (uses `bunx`, needs network on first use). |
| `bun run preview` | Preview the production client build. |
| `bun run stop` | Free ports 5173, 3000 and 4173. |
| `bun run clean` | Remove build output and caches. |

The painted models are committed, so `bun run models` is only needed after changing a source
model. For a quiet local server, start it with `FF_NO_BOTS=1 bun run dev` (no AI bots).

### URL options

Append these to <http://localhost:5173/> for testing (for example `?renderer=webgl2&quality=low`):

| Option | Effect |
| --- | --- |
| `?renderer=webgl2` | Force the WebGL2 fallback instead of WebGPU. |
| `?quality=auto\|high\|medium\|low` | Picture quality for this session only (the saved setting is untouched). |
| `?painted=0` | Skip the painted Meshy models: soldiers use the procedural character, vehicles their stand-in hull. |
| `?mascotModels=off` | Keep the procedural cow and coconut instead of the Meshy mascot models. |
| `?coconutShell=painted\|meshy\|vertex` | Coconut shell variant (default `painted`). |
| `?lei=procedural` | Procedural flower lei on the coconut instead of the painted one. |
| `?cowWalk=clip` | Play the Meshy cow walk clip instead of the default solver walk. |

---

## Controls

On foot (Allrounder, Heavy, Infiltrator):

| Action | Input |
| --- | --- |
| Move | `W` `A` `S` `D` / arrow keys |
| Look | Mouse |
| Jump / deploy parachute | `Space` |
| Sprint | `Shift` |
| Crouch toggle / dodge roll while sprinting forward | `C` |
| Crouch hold | `Ctrl` |
| Fire | Left mouse button |
| Weapon slots | `1` `2` `3` / mouse wheel |
| Reload | `R` |
| Class skills | `Q` `E` `T` |
| Interact / enter a vehicle | `F` |
| Taunt | `G` |
| Scoreboard | hold `Tab` |
| Shoulder swap | `V` |
| Camera distance | `Alt` + mouse wheel |
| Pause / release mouse | `Esc` |
| Telemetry | `F1` |

In a vehicle:

| Action | Input |
| --- | --- |
| Enter / leave | `F` (within reach of the hull) |
| Drive | `W` `A` `S` `D` |
| Switch seat | `C` |
| Horn | `H` |
| Vehicle gun (tank cannon, flamingo harpoon) | Left mouse button, aim with the mouse |
| Plug turbo (Badi-Flamingo, afloat) | `Shift` |
| Handbrake drift (Sidecar) | `Space` |

The commander/hatch seat of the tanks and the sidecar passenger fire their own weapons. Mascots
and drifters cannot board vehicles; base vehicles are reserved for their own faction.

Mascot: the cow drives with `W`/`S` (throttle, brake and reverse) and `A`/`D` (steer),
gallops with `Shift` + `W` and hops with `Space`; the coconut rolls with `WASD` relative to the
camera and jumps twice with `Space`. Both use `Q` `E` `T` (or `1` `2` `3` + click) for their
three moves. Drifter: `W` `A` `S` `D` and the mouse only — no jump, sprint, crouch or weapons.

While falling faster than 6.5 m/s with enough ground clearance, the emergency parachute
opens automatically after 1.2 s or immediately with `Space`. Steer with `WASD`; `Space` or
`C` cuts away. It closes automatically on the ground or in water.

---

## Architecture

```
apps/
  client/     Svelte 5 + Vite 7 + Babylon.js 8 + procedural Web Audio
  server/     Bun authoritative game server and binary WebSocket protocol
packages/
  shared/     config, physics, protocol codecs, domain types, EN/DE i18n
scripts/      dev stack launcher, model optimiser, script tests
art-src/      untouched owner sources (Meshy downloads, Gemini sheets, painted-world tiles)
```

- **One character motor** in `packages/shared/src/physics/character.ts`; the client predicts
  with it and the server simulates it at 60 Hz. Vehicles share one motor in
  `packages/shared/src/physics/vehicle.ts`.
- **Climate Conquest rules** in `packages/shared/src/config/conquest.ts` (numbers) and
  `apps/server/src/rooms/conquest.ts` (fixed-step simulation); protocol version **9**.
- **One map blueprint** in `packages/shared/src/config/map-fjord.ts`; client visuals and
  server colliders derive from it.
- **Binary protocol only.** Changing packet layout requires a `PROTOCOL_VERSION` bump.
- **No hardcoded UI copy.** English is the master dictionary; German is typed against it.
- **Owner-generated 3D models only.** The painted, rigged soldier and drifter models, the hen,
  the four vehicles and the mascots (`models/mascots/`) in `apps/client/public/models/` were
  generated by the project owner with Meshy from the owner's own art (sources in
  `art-src/meshy/`, see [`CREDITS.md`](CREDITS.md)). Soldier, mascot and vehicle models are
  optional: a missing file falls back to the procedural character or a stand-in hull, and
  `?painted=0` turns the painted models off. The drifters exist only as their painted models.
  No downloaded or stock meshes, heightmaps or audio samples; the terrain, buildings, hero
  weapons and effects are procedural. The only external audio is the supplied music beds in
  `apps/client/public/audio/`, used with the project owner's permission.
- **Owner-supplied 2D art only.** Menu key art, loading scenes, painted slot and skill
  tiles, comic stickers, faction crests and the painted-world sprites, facades, terrain tiles,
  decals, panorama and clouds in `apps/client/public/art/` come from the project owner's
  (AI-generated) sheets. Each one is optional and has a CSS/SVG or procedural fallback. See
  [`CREDITS.md`](CREDITS.md).

See [`game-decisions.md`](game-decisions.md) for the full design and decision record,
[`CLAUDE.md`](CLAUDE.md) for agent-facing engineering notes and
[`BEDIENUNGSANLEITUNG.md`](BEDIENUNGSANLEITUNG.md) for the German manual.

---

## Known limitations

This is a test build. Deliberately **not** in it:

- **Rest of M5:** no cable car or T-bar ride, alpine coaster, hammock catapult or NPC cow
  behaviour, and no biplane, rowboat or gondola. Until the cable car exists, Peak Guard gets
  interim spawn plates on the gorge floor below the cable-car mid station while it holds
  Tower C. Weather towers change hands and the weather balance tints sky, light and water,
  but the big tower transformations (unfolding snow cannon, spraying flamingos) come later.
- **No vehicle repair** yet.
- **Procedural fallback characters (1E)** — the planned rewrite is deferred; every class
  already shows its painted model, and the procedural rig only appears as a fallback.
- **Hot Beach Girl:** her full exemption from the painterly post pass is open; she still gets
  the silhouette ink and the colour grading.
- **M6 destruction and M7 meta** are not started.

Known issues:

- The terrain collider and the rendered terrain split steep cells along opposite diagonals
  (up to ~3.7 m), so feet can float above or sink into steep slopes.
- The alpine coaster's start deck intrudes ~2.5 m into the tank road.
- A boat driven fully onto dry sand stays stuck; get out and it deflates after 10 s and
  respawns.
- Bot-only rounds lean toward the Lagoon League (about 6:14 rounds in soak tests).
- While the Lagoon League holds Tower C, its summit spawn pads can see the Peak Guard base pads.
- The map is heavy (~1.3 million triangles and more) and may run slowly on weak GPUs; lower
  the picture quality in Settings (or use `?quality=low`).

---

## Asset and IP policy

This is an original clean-room project. It contains no Battlefield/EA or other third-party
assets, names, maps, sounds or copied compositions. Terrain, buildings, props, hero weapons
and effects are generated procedurally. The only external files are owner-supplied:

- the five music beds in `apps/client/public/audio/`;
- AI-generated 2D art in `apps/client/public/art/` (menu key art and cover, loading
  scenes, painted weapon and skill tiles, comic popup stickers, faction crests, mascot faces
  and the painted-world sprites, facades, tiles, decals, panorama and clouds). Every file has
  a procedural, SVG or CSS fallback;
- the owner's Meshy 3D models in `apps/client/public/models/` (soldiers, drifters, mascots,
  hen and vehicles; see above for the fallbacks);
- the bundled Luckiest Guy (Apache 2.0) and Fredoka (SIL OFL 1.1) fonts.

[`CREDITS.md`](CREDITS.md) lists every file, its use and the font licences.

---

## Verification

Before each milestone is pushed:

1. `bun run typecheck` — 0 errors, 0 warnings.
2. `bun run build` — shared, client and server build.
3. `bun run test` — script, server and client suites pass.
4. Menu reaches **Connected** and **Play Now** enters the round.
5. Movement, camera, wardrobe, profile persistence and audio are exercised in the browser.
6. Towers capture, tickets drain, vehicles board and drive, drifter and mascot play, hens
   scatter.
7. Two browser tabs see each other and exchange cosmetics.
8. WebGL2 fallback is tested with `?renderer=webgl2`.
9. No uncaught exceptions; only Rapier's harmless deprecation warning is expected.

### Performance update (26 October 2026)

Auto picture quality now adapts during gameplay as well as in menus. Rendering is capped at 60 FPS and 1440p/1080p/720p for High/Medium/Low; UI stays at native resolution. Full-screen MSAA is removed in favor of existing FXAA, and Medium uses cheaper shadows. Hidden tabs skip rendering work. Combat sound recipes reuse bounded noise/curve caches. These changes reduce GPU target memory, high-refresh load and audio allocation churn; they do not certify that every long-session hang is resolved on every device.


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

### M5 resumed: rowing and repairs (26 October 2026)

Four two-seat rowboats now spawn at the harbour piers and waterfall. W/S rows,
A/D steers, F boards/exits and C changes seats. Normal top speed is 8 m/s; both
rowers tapping W on the 0.8-second HUD beat trigger 16 m/s synchronized strokes.
Shift alone cannot trigger this sprint. Boats have 200 HP and a 20-second respawn.
The owner's painted boat is split into a hull and two animated oars, reduced to
11,846 triangles with one shared 1536 px colour texture; distant/loading boats
use a bounded, detailed procedural hull with oars.

Hold X within 3.5 m to repair a friendly vehicle at 40 HP/s. Exposed passengers
can repair while riding; drivers with occupied hands cannot. Walls, faction,
class eligibility and health limits are checked on the server. Repairing prevents
firing. E remains the class skill. M5 remains in progress; remaining work is in
[MILESTONE_WORK.md](MILESTONE_WORK.md).

Validation (27 October): 237 automated tests pass (10 scripts, 177 server, 50 client), strict typecheck reports zero errors/warnings, and all production bundles build. The WebGL2 browser test checks the painted hull and moving oars, short-tap boarding, movement, rhythm HUD and actual repair (130 to 137 HP), with no console errors. Short action taps now survive slow render frames until consumed by simulation; inputs in text fields are ignored. No native Mac heat/FPS measurement is claimed.
