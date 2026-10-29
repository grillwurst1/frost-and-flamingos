# Frost & Flamingos — Bullets, Fondue & Coconuts

**Current build:** M5 in progress — Climate Conquest, six drivable vehicle types plus cable cars,
painted world, configurable soldiers, drifters, mascots and hens.
**Active work:** matching the owner’s latest visual reference; further M5 features follow
after this graphics pass, then M6–M8 in order.
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
>   tickets, weather balance, rounds), six drivable vehicle types and repairs. *Still open:*
>   T-bar, coaster, hammock, NPC cow and full tower weather transformations.
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
- **Fjord Fiesta in 3D.** 800 m × 800 m on a shared 257 × 257 heightfield: lagoon,
  village, snowy gorge, summit and both faction bases. Solid 3D vegetation/rocks, painted
  terrain and actual paving relief, clean cel shading, contours and FXAA.
- **Five classes.** Configurable skinned Allrounder, Heavy and Infiltrator, the ramming
  Alpine Cow/Battle Coconut mascots and the untouchable supply-aura Drifter.
- **Vehicles and cable cars.** Fondue Crawler, Coconut Beach Tank, Badi-Flamingo, sidecar,
  rowboats and biplanes, plus two counter-running cable cars with interior/roof seats and
  working emergency brakes. Authority and prediction share the same vehicle motor.
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
| `?renderer=webgl2` | Use the validated WebGL2 default. |
| `?renderer=webgpu` | Explicitly opt into the experimental WebGPU path. |
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
  `apps/server/src/rooms/conquest.ts` (fixed-step simulation); protocol version **11**.
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

- **Rest of M5:** T-bar ride, alpine coaster, hammock catapult, NPC cow behaviour
  and full tower transformations. The cable car is operational; interim gorge spawn plates
  are removed. Bots do not yet use the cabins, so team balance remains open.
- **Hot Beach Girl:** her full exemption from the painterly post pass is open; she still gets
  the silhouette ink and the colour grading.
- **M6 destruction and M7 meta** are not started.

Known issues:

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
and hides its hands behind the menu/wardrobe. Other seats use the centred follow view.

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

### Latest visual reference and cable car (27 October 2026)

The field HUD now follows the latest reference: tickets/objectives/compass at the top,
map at top right, profile health at bottom left, skills/tools in the centre and weapon
cards at bottom right. Blue allied/red enemy names and triangles follow actual players,
respect world occlusion and hide cloaked opponents. The cached map uses real shared map
data and live allied positions, with no second 3D camera. Key labels reflect the actual
Q/E/T skills, slot 3 and X repair; weapon slots remain 1/2/3.

New/reset allrounders wear a green waistcoat over white sleeves, brown beard, cuckoo clock
and red ski boots. Wardrobe settings remain editable and saved profiles are preserved.
Snowy gorge rims, blue-grey faceted cliffs, lower solid bridge posts and cleaner cel
lighting bring the environment closer to the reference. Painted skies/facades are optional
via `?paintedSky=1&paintedFacades=1`; the default uses the actual 3D surfaces. The existing
frame cap, quality governor and two post passes remain. An exact visual match is still
unfinished; see `VISUAL_REFERENCE_WORK.md`.

Cable car: F boards/exits, H cycles interior/roof seats, C/Ctrl crouches on the roof.
F at a station lever or a hitscan shot brakes both cabins for two seconds. Crouched roof
riders hold on; standing roof riders fall. Cabins wait three seconds at each station.
Protocol 11 adds the append-only cabin vehicle kind and reuses the existing full-pose
and crouch fields. A cabin is one merged mesh under 6,000 triangles.

Verified 27 October: 255 automated tests (10 script, 189 server, 56 client), clean strict
TypeScript/Svelte diagnostics and successful production bundles. WebGL2 checks real HUD/
nameplates and cable-car motion, seat changes, crouch, exit and station brake events without
console errors. Five material variants compile under WebGPU without errors. Moving cabin
and fallback boat meshes now follow their parents; regression checks cover hull translation
and oar rotation. Cloud rendering is software; native Mac heat/FPS remain unmeasured.

### Reference foreground camera and reticle (27 October 2026)

The human follow camera now centres the hero horizontally (owner update, 29 October).
Obstruction rays retain wall clearance; follow movement keeps vehicles in frame.
Personal shots converge on the centre-ray target from the server eye instead of running
parallel past the reticle. Only a finite normalized aim is accepted; origin, cover,
range, ammo, cadence and damage remain authoritative. Aim stays independent of movement
yaw while the spring camera catches a fast turn. Muzzle tracers converge on the same point.
Personal projectiles begin at the eye so they cannot skip a thin wall within 70 cm.
No packet-layout change, texture, post-processing pass or per-frame target ray is added.

Validation of the framing/aim follow-up: 262 tests pass (10 script, 192 server,
60 client), strict typecheck is clean and production builds succeed. WebGL2 medium
confirms an actual reticle hit through the binary client/server path (150 → 122 HP),
with no browser errors. The exact screenshot match remains open.

### Soldier detail pass (27 October 2026)

Broader animated soldiers, curved green waistcoat, outward-facing cuckoo-clock dial
with roof/hands/weights, and tall ski boots with actual clasps replace the previous
flat/hidden details. Foot binding no longer folds the ankle hardware. Wardrobe choices
remain editable; use “Wear the standard clothing” for the new allrounder reference outfit.
Default body: about 44k triangles, one skinned draw, no new texture or post pass.
WebGL2 detail captures pass. The optional full WebGPU figure scene remains blocked
by the Cloud adapter/buffer failure; native Mac performance is not measured.

Geometry release validation: 266 tests pass (10 scripts, 192 server, 64 client),
strict TypeScript/Svelte is clean, production bundles build, and the animated
WebGL2 close-up passes without console errors. The stricter ankle regression
also passes and fails against the previous mapping (inward-facing normals).

### Playable snowy gorge (27 October 2026)

A raised snow overlook east of the suspension bridge has a walkable south approach
and solid bevelled timber rails. The north chalet sits further back on its own ledge,
with horizontal boards and a wraparound right balcony. Snow reaches the gorge floor;
the bridge has a stronger shared visual/physical sag. Large firs leave the battle
clearing open. The northwest waypoint route goes around the house and square walls.

Fence colliders now sample the terrain at every visible post, preventing rails from
becoming buried on curved ground. Five new physics tests cover the approach, rail,
chalet floors/balcony, clearing, bridge crossing and northwest route. Protocol 12
requires matching client/server static-map data. No texture or post pass is added;
the 45 FPS default and quality budgets remain. The exact reference remains unfinished.

Release: 271 tests pass (10 scripts, 197 server, 64 client), clean TypeScript/Svelte
and production builds. The final WebGL2 medium scene connects, deploys and displays
real binary-connected player profiles without console errors.
[Actual game capture](docs/qa/gorge-reference-2026-10-27.png) uses staged test players;
it records the current result, not completion of the reference. Native Mac performance
remains unmeasured.

### Character and contour quality pass

The owner rejected the prior visual result; exact reference matching remains active.
Long limb surfaces are refined before rig binding, hidden shin surfaces no longer
pierce tall boots, and the reference shirt has rolled sleeves. The hat has a smoother
silhouette. Character lighting has a broad form gradient, and the contour pass keeps
MSAA coverage instead of drawing coarse depth-buffer ink over the character edge.
Snow has quieter colour detail and much less decorative glitter. Existing stone
textures/relief remain. No new texture, render target or screen pass is added.
The default soldier is 51,384 triangles in one skinned draw, with bounded outfit caches.

Validation: 273 tests pass (10 scripts, 197 server, 66 client), clean strict typecheck
and production build. Six isolated WGSL variants compile. WebGL2 detail views and
[actual gameplay at 1280×714](docs/qa/field-quality-1280.png) pass without errors.
[Earlier model](docs/qa/figure-quality-before.png) / [updated model](docs/qa/figure-quality-after.png)
show different idle poses. This is an improvement, not acceptance of the reference target.


### Sculpted figures and reference Heavy

Heads now use a continuous sculpted face, inset eyes and lids; arms have connected
shoulder-to-wrist surfaces. Closed waistcoats replace enclosed torso surfaces to
avoid skin cutting through clothing. Rounder boot soles and covered cuffs clean up
the lower silhouette. Skin is less glossy; cliff shading and colour detail are calmer
while retaining the actual 3D terrain and texture.

The selectable sleeveless field waistcoat adds pockets, snaps and shoulder tabs.
New/reset Heavy profiles use it with a bald head, bare arms, olive trousers and
mountain boots. Saved profiles and all previous wardrobe choices remain; select
“Wear the standard clothing” on the Heavy to apply its new default. EN/DE supported.
Protocol **13** appends torso code 8; update client and server together.

The default Allrounder has 50,214 triangles, the Heavy 28,308, each in one skinned
body draw; outfit caches stay bounded at 12. No texture, render target or screen
pass was added, and the 45 FPS default remains.
[Model comparison](docs/qa/reference-heavy-vest.png) and
[actual game at 1280×714](docs/qa/reference-field-vest-1280.png) document this increment.
The field capture uses real binary-connected profiles, a player cow and a loaded
vehicle model; test positions are staged. The exact reference, overall map composition
and vehicle art remain unfinished. Native Mac heat/FPS remain unmeasured.

Field-vest release validation: **280 tests pass** (10 scripts, 198 server, 72 client),
strict TypeScript/Svelte checks report zero errors/warnings, and production builds
complete. WebGL2 model/field browser checks pass without console errors. Six native
WGSL variants reach compilation; strict GPU queue completion fails with the Cloud
external-instance error. Visual-reference acceptance and native hardware QA remain open.


### Player form and equipment pass (28 October 2026)

Figures now have a stronger nasal bridge, cheek/chin planes, recessed eye sockets
and a continuous jaw beard. Tailored waistcoats have modelled compression folds,
fitted seams and bevelled leather harnesses. The Tyrolean hat has a pinched felt
crown and curled oval brim. Boot width/hardware and head proportions are reduced
toward the owner's reference; leather stitching replaces the white trouser stripes.

Visible fingers now bind to the existing phalange joints, so the original grip/reload
solver moves real geometry. The palm follows the rig's knuckles. Mittens, boxing
gloves, pirate hook and watch remain selectable, with fallback fingers for incomplete
rigs. Finger envelopes stay inside the roll-clearance solver. A one-part bare-arm
merge now bakes its offset correctly instead of leaving the arm above its shoulder.

Local vertex cavity shading separates eye sockets, cloth and beard without changing
selected skin/hair paint. No extra texture, screen target or body draw is needed.
The model cache stays at 12 and existing frame/pixel budgets remain.
This is further player-art work; the owner's reference has not been accepted.

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


The next soldier-art increment reuses sculpted bare arms for sleeveless
wardrobe choices, with the selected skin tone applied independently of outfit
paint. Bind-pose retargeting happens once per outfit and keeps one skinned body
draw. Face, curls and arms share the existing bounded atlas allocation. The
full reference-image target, including remaining garments, is still in progress.


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


Configurable beards now follow the selected hair colour and the detailed jaw;
the mouth opening stays visible. Olive trousers have continuous 3D fabric with
knee/cuff folds and cargo details, including when paired with native boots.
These changes keep the shared textures and single skinned body draw.

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


The reference SMG is now a compact box-magazine prop with correctly placed
support-hand and muzzle sockets, using about 20% fewer weapon triangles.
The original Alpine calf also follows the selected skin tone; long-trouser
combinations no longer inherit the old socks through their boot selection.
Weapon behaviour and all existing configuration choices remain available.


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


Reusable bare arms are now cut at the actual wrist, removing old donor-hand
fragments beside the configurable hand. Skinning and paint are preserved at
the cut, with slightly fewer vertices/triangles and unchanged shared textures.


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


Configurable heads now use sculpted eye whites, irises, pupils and glints. Their
skin base remains independent of clothing and painted donor pupils. The eyes
add 736 triangles to the existing body draw, with no new texture allocation.
97 client tests, strict types and production builds pass; gameplay fire/reload
and all twelve skin colours are checked in WebGL2. Captures, fixture scope and
the cloud WebGPU limitation are in `docs/qa/sculpted-eyes-2026-10-28.json`.
The wider screenshot-quality work remains open.


The configurable head is now a closed 3D sculpt with a smooth upper lip and
skin-relative geometric mouth contour. Its geometry falls from 9,420 to 7,228
triangles. Removing the unused face tile halves the shared hair/arm texture
budget to about 6.7 MiB (RGBA8 with mips), preserving their tile pixel density.
309 checks, strict types and production builds pass. All twelve skin choices
and actual wardrobe/reload/game entry are verified in WebGL2. Evidence and
limits: `docs/qa/unified-head-2026-10-29.json`; screenshot-quality work continues.


Weapon clearance follows the selected vest/shirt rather than the original
model's coat or ring. Both Heavy rigs now reach SMG, shotgun and snow-cannon
foregrips through tested idle poses, using bounded shoulder motion and a small
extra carry adjustment for short arms. No new draw, texture or geometry is
needed. 105 client tests, strict types/build and actual WebGL2 fire/reload pass.
Evidence: `docs/qa/weapon-grips-2026-10-29.json`; broader reference work continues.


Replacement hands now have closed palms, thumb webs and smooth articulated
fingers, using selected skin independently of clothing. The hand pair is capped
at 4,000 triangles, shares the existing body draw and needs no new texture.
Gold watches remain complete and rigid on the forearm, including the dial.
Original matching native hands and missing-finger fallbacks remain available.

Validation: 14 script / 107 client checks pass, 198 server checks unchanged;
strict types and production builds pass. Settled WebGL2 capture has zero browser
errors. `docs/qa/closed-hands-2026-10-29.json` records scope, counts and limits.
Owner now reports cow-skill/crawler-driving freezes: fix those before more art
or autonomous-cow behaviour. Longer alphorn/cleaner animations are also requested.


The renderer now starts on WebGL2; WebGPU is an explicit experimental opt-in.
Cow/cannon sound graphs release their transient nodes, suspended audio cannot
queue more engine automation, and an audio exception cannot stop rendering.
110 client tests and strict types/build pass. Native Chrome/M4 freeze and heat
acceptance still needs the owner's device; cloud WebGL2 checks are separate.

Actual default-WebGL2 validation: all three cow Q/E/T moves emitted; crawler
driving with eight separate cannon shots passed >90 s / >30 rendered frames
with no browser errors. Full map, physics and real network remain in the test.
Evidence: `docs/qa/freeze-stability-2026-10-29.json` and crawler capture. Native
Chrome/M4 acceptance remains open; cloud software FPS is not a benchmark.


The alphorn is now about 3.4 metres long, with smoother curved sections and a
gentle breath animation. Mouthpiece/grip contact is verified on three rigs.
The playable Alpine Cow may briefly graze on grass or bolt towards nearby
humans from either team. Skills/jump or steering reclaim control; hazards
trigger braking. Existing friendly bumps and enemy ram damage remain unchanged.
The networked graze pose uses a spare flag bit, without a larger packet or
protocol change. Types/builds and the full checks plus braking regression pass.

Authoritative room integration also verifies autonomous friendly and enemy
rams at the normal motor cadence (2 added server checks; 201 server cases
verified overall, 340 checks across script/server/client). Friendly HP stays
150; enemy HP decreases. Browser confirms replicated grazing, stomp override
and a charge start; low cloud software frame rate prevented a browser ram
contact, so that is not recorded as a passed full browser ram.

Evidence and acceptance scope: `docs/qa/alphorn-cow-2026-10-29.json` and
`alphorn-figures-2026-10-29.png`. Replicated grazing and stomp interruption
pass in the browser; both kinds of ram pass in the real server simulation.
Browser ram contact under the very low cloud software frame rate remains
unconfirmed. Continue shoulder/garment fragments and native-face art next.


Bare-arm figures now use closed, smoother anatomy with corrected shoulder and
elbow skinning. Donor garment scraps and unrelated hip/head weights are removed.
The arm sculpt drops from 3,400 to 2,578 triangles, retaining one body draw.
Skin remains independent of clothing. Removing arm paint halves the shared
curl/skin atlas pair's estimated GPU storage (6.67→3.33 MiB including mipmaps),
while preserving curl pixel density. Close pose, four outfit combinations and
all 12 skin tones are checked in the actual WebGL2 character renderer.
Evidence: `docs/qa/closed-arms-2026-10-29.json`. Full target artwork and native
Mac freeze/thermal acceptance remain open; this is a verified art increment.

Validation: full 14 script / 201 server / 125 client tests pass (340 total),
including the 15-minute simulated round soak. Strict types report zero errors
and warnings; production builds pass. No test timeout was increased.


Map access update (29 October): human follow view now centres the controlled
player horizontally. Closed timber risers fill the stair gaps, with thick
shared walking ramps at building toes. Cable-car platforms meet the cabin
route, end doors are open, seats clear the floor, and station stops last eight
seconds. Use F to board/exit and H to change seats. Inside riders exit onto a
clear platform spot when docked. Brake levers have reachable grip targets,
solid pedestals, an actual pull animation and a two-second-stop notification.
The emergency-brake/roof-rider rules and existing rendering budgets remain.

Camera follow also carries both spring origins with the controlled body and
updates interpolated vehicle poses before camera/occupants, preventing cabins
from moving off-screen after a long frame. Orbit/zoom/collision springs remain.
A brake pull delayed past its two-second timer is still shown for one render
before returning to rest, rather than disappearing without feedback.

Validation for this map/camera increment: 14 script, 211 server and 128 client
checks pass (353 total), including the 15-minute simulated conquest soak.
Strict types report zero errors/warnings. Real WebGL2 browser F boarding,
visible brake feedback, cabin-follow framing and centred player projection
pass without console errors. Evidence: docs/qa/map-access-2026-10-29.json and
map-cabin-ride/map-centered-player captures.
Production builds also pass; the existing large-client-chunk advisory remains.
