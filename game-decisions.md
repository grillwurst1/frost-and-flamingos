# Game Decisions — Frost & Flamingos

**Working title:** *Frost & Flamingos — Bullets, Fondue & Coconuts*  
**Genre:** Third-person multiplayer action-cartoon shooter  
**Mode:** 8v8 “Climate Conquest”  
**Platform:** Browser (WebGPU with WebGL2 fallback), local macOS playtest target  
**Engine:** Babylon.js v8 · Rapier3D · Bun · Svelte 5  
**Languages:** English (master dictionary) and German (fully typed translation)  
**Status:** Milestones 1–4 and M5 core complete; remaining M5–M8 authorized on 26 October 2026
**Last updated:** 26 October 2026

This document is the single written record of the game’s direction, content, systems, technical contracts and scope decisions. It intentionally separates **what is implemented**, **what is being implemented**, and **what is a design reference for later milestones**. When the code and this document disagree, the code is the current truth and this document must be corrected.

---

## Table of contents

1. [Status legend](#1-status-legend)
2. [Elevator pitch and tone](#2-elevator-pitch-and-tone)
3. [Clean-room IP and asset policy](#3-clean-room-ip-and-asset-policy)
4. [Technical architecture](#4-technical-architecture)
5. [Current implementation status](#5-current-implementation-status)
6. [Factions and world fiction](#6-factions-and-world-fiction)
7. [Classes](#7-classes)
8. [Character customisation and wardrobe](#8-character-customisation-and-wardrobe)
9. [Movement and input contract](#9-movement-and-input-contract)
10. [Map: Fjord Fiesta](#10-map-fjord-fiesta)
11. [Destruction, terrain craters and weather](#11-destruction-terrain-craters-and-weather)
12. [Weapons, skills and combat](#12-weapons-skills-and-combat)
13. [Vehicles, aircraft and map toys](#13-vehicles-aircraft-and-map-toys)
14. [Match flow and game mode](#14-match-flow-and-game-mode)
15. [UI, screens and flow](#15-ui-screens-and-flow)
16. [Audio design](#16-audio-design)
17. [Networking and protocol](#17-networking-and-protocol)
18. [Persistence and profile ownership](#18-persistence-and-profile-ownership)
19. [Localisation contract](#19-localisation-contract)
20. [Art direction and rendering](#20-art-direction-and-rendering)
21. [Performance budgets and constraints](#21-performance-budgets-and-constraints)
22. [Milestones and scope gates](#22-milestones-and-scope-gates)
23. [Known deviations and open issues](#23-known-deviations-and-open-issues)
24. [Key files](#24-key-files)
25. [Verification checklist](#25-verification-checklist)

---

## 1. Status legend

| Marker | Meaning |
| --- | --- |
| **Implemented** | Working in the repository and covered by the current milestone. |
| **In progress** | Code exists on the current uncommitted M2 branch, but integration, verification or UI is incomplete. |
| **Design reference** | Fully specified, but deliberately not implemented yet. Do not ship a broken stub. |
| **Later milestone** | Explicitly out of scope until its milestone gate. |

The project is deliberately milestone-gated. A system described in this document does **not** become in-scope merely because it is written down. The current milestone brief always wins.

---

## 2. Elevator pitch and tone

Two rival holiday resorts share one absurd fjord. The **Peak Guard** wants permanent snow, fondue and orderly alpine silence. The **Lagoon League** wants endless summer, flamingo inflatables and barefoot chaos. Both sides are convinced they are the reasonable ones. The result is a slapstick climate war fought with fondue cannons, coconut mortars, snow cannons, alphorns and weaponised pool toys.

The tone is:

- **Action cartoon, 12+.** Hard comic outlines, saturated alpine/tropical palettes, toy-like proportions.
- **No blood.** Kills are knockouts: ragdolls, helmet pops, blast launches, freeze blocks, ash statues, pinball “BOING!” impacts.
- **Deadpan absurdity.** The world is played straight; the equipment is ridiculous.
- **Readable first.** Silhouettes, class colours, faction colour accents and surface materials must read at gameplay distance.
- **Original.** No real-world military imitation, no Battlefield/EA assets, names, maps, audio or copied compositions.

The subtitle *“Bullets, Fondue & Coconuts”* is the promise: alpine kitsch meets tropical nonsense, with combat as the punchline.

---

## 3. Clean-room IP and asset policy

These are hard rules, not preferences:

1. **No Battlefield/EA assets, names, maps, logos, sounds or imitations.** The game may be inspired by the *feeling* of large-scale vehicle sandbox shooters, but every name, model, sound, map and character is original.
2. **No downloaded or stock 3D models.** The only `.glb` files are models the project owner generated with Meshy (image-to-3D) from the owner's own art: the painted, rigged soldiers, the two drifter characters, the hen, the four drivable vehicles and the cow/coconut mascots in `apps/client/public/models/`, built from the untouched downloads in `art-src/meshy/` (`bun run models`, `bun scripts/optimize-mascots.ts`) and listed in [`CREDITS.md`](CREDITS.md). Soldiers, vehicles and mascots are optional: a missing file falls back to the procedural character, the vertex-coloured stand-in hull or the procedural mascot (`?painted=0`, `?mascotModels=off`); the drifters have no procedural fallback. Weapons, props and the map stay procedural (Babylon.js mesh builders or generated vertex data), with colliders derived from the shared blueprint.
3. **No external heightmap images.** Terrain comes from a deterministic mathematical height function shared by client and server.
4. **No external audio files except the supplied music beds.** All ambience and SFX are synthesised at runtime with the Web Audio API. The only external audio is the project owner's supplied music in `apps/client/public/audio/` (menu, gameplay intensity beds and round/death bed). Besides audio, the only external files are the owner-supplied 2D UI art in `apps/client/public/art/` (rule 5), the owner-generated 3D models in `apps/client/public/models/` (rule 2) and the bundled Luckiest Guy / Fredoka fonts.
5. **No stock or third-party UI art.** Panels, badges and decorative elements are CSS, SVG or procedural canvas. The exception is owner-supplied, AI-generated 2D art in `apps/client/public/art/` (menu key art and cover, loading scenes, painted weapon/skill tiles, comic popup stickers, faction crests), which is permitted UI art. Every such file is optional: the HUD falls back to procedural SVG pictograms, CSS lettering and SVG crests when it is missing. [`CREDITS.md`](CREDITS.md) lists each file.
6. **No real brands.** The in-game currency is **Alpen-Taler / Resort Crowns**, not a real currency. The “VIP” pass and “Armory Rental” are fictional meta systems.
7. **The attached reference images are art-direction inspiration only.** They are never traced or copied into the 3D game, and the `PHOTO-*.jpg` references in the repository root are not shipped. Owner-supplied art that the owner explicitly hands over as UI art (rule 5) is shipped under `apps/client/public/art/`; the loading/error scene paintings are cropped so the HUD painted into them never appears on screen.

---

## 4. Technical architecture

### 4.1 Repository shape

```
apps/
  client/                 Svelte 5 + Vite 7 + Babylon.js 8 browser client
    src/audio/            procedural Web Audio synthesis and gibberish voice
    src/components/       menu, HUD, loading, pause, wardrobe, settings, overlays
    src/engine/           GameClient, camera rig, input controller
    src/net/              reconnecting binary WebSocket client
    src/rendering/        map, character rig, materials, mesh helpers
    src/shaders/          hand-authored GLSL and WGSL shader pairs
    src/state/            Svelte stores for phase, connection, HUD, profile, locale
  server/                 Bun authoritative game server
    src/rooms/            MatchRoom simulation loop and snapshots
    src/index.ts          HTTP health/config endpoints + WebSocket upgrade
packages/
  shared/                 code shared by client and server
    src/config/           classes, cosmetics, profile, weapons, Fjord Fiesta blueprint
    src/i18n/             English master dictionary + typed German dictionary
    src/net/              binary opcodes, reader/writer, protocol codecs
    src/physics/          Rapier world, prop colliders, character motor
    src/types/            shared domain types
scripts/
  dev.ts                  starts server + client, tears both down on Ctrl+C
```

### 4.2 Authority and time

- The **server is authoritative**. It owns player position, health, class changes, respawns, match state and (later) damage, vehicles, destruction and weather.
- Physics runs at **60 Hz** (`PHYSICS_TICK_RATE = 60`, `FIXED_DT = 1/60`).
- Snapshots are broadcast at **30 Hz** (`SERVER_TICK_RATE = 30`, `SNAPSHOT_INTERVAL = 2`).
- The client predicts the local character with the **same shared motor** and fixed timestep.
- Inputs carry a wrapping **16-bit sequence**. The server acknowledges `lastProcessedInput`.
- On snapshots the client drops acknowledged inputs, compares prediction to authority and replays pending inputs.
- Remote players are interpolated from a short snapshot history; they are never moved by local physics.

### 4.3 Determinism

- One character motor only: `packages/shared/src/physics/character.ts`. Do not fork it for client or server.
- One map blueprint only: `packages/shared/src/config/map-fjord.ts`. Client visuals and server colliders derive from the same data.
- No frame-time-dependent gameplay maths. Use `FIXED_DT`.
- The same Rapier heightfield and prop colliders are built on both sides.
- Map props are immutable data; hand-placing colliders twice is forbidden.

### 4.4 Rendering

- Babylon.js imported from `@babylonjs/core` submodules; no legacy full bundle.
- Custom shaders have **both GLSL and WGSL** paths. WebGL2 is a first-class path, tested with `?renderer=webgl2`.
- Procedural props are merged, vertex-coloured or thin-instanced to keep draw calls low.
- The camera is a spring-driven over-the-shoulder rig, not a free camera.
- Sky diameter 3200, camera far plane 5000; changing one requires checking the other.

### 4.5 UI

- Svelte components read stores and call explicit intent methods on `GameClient`.
- UI components never touch Babylon or Rapier directly.
- No hardcoded user-facing or gameplay strings. English is the master dictionary; German must implement the exact same shape.

### 4.6 Commands

| Command | Purpose |
| --- | --- |
| `bun install` | Install workspace dependencies. |
| `bun run dev` | Start authoritative server and Vite client together. |
| `bun run build` | Build shared, client and server bundles. |
| `bun run typecheck` | Strict TypeScript + Svelte diagnostics for all workspaces. |
| `bun run stop` | Kill orphaned processes on ports 5173, 3000 and 4173. |
| `bun run clean` | Remove build output, Vite caches and local server data. |
| `bun run clean:all` | `clean` plus all `node_modules` and `bun.lock`. |

Client: <http://localhost:5173>  
Server health: <http://127.0.0.1:3000/api/health>

---

## 5. Current implementation status

### 5.1 Milestone 1 — complete

M1 is implemented, verified, committed as **`ac53883`** and pushed to `master` at `https://github.com/grillwurst1/frost-and-flamingos`.

M1 delivered:

- Bun workspace with Svelte/Vite client and Bun authoritative server.
- Shared, immutable Fjord Fiesta blueprint with a Rapier heightfield and prop colliders.
- Deterministic shared Rapier kinematic character motor at 60 Hz.
- Authoritative server at 30 snapshots/s with a binary WebSocket protocol.
- Babylon.js v8 renderer with WebGPU and WebGL2 fallback.
- Custom toon, water and sky shaders; procedural vertex-coloured props and thin instances.
- Spring-loaded over-the-shoulder camera, local prediction/reconciliation, remote interpolation.
- Walkable snow, village, beach, water and fall-respawn behaviour.
- Fully typed English/German i18n with a live language switcher.
- Menu, loading screen, HUD, pause menu, telemetry overlay, error and toast surfaces.

### 5.2 Milestone 2 — complete

M2 adds classes, persistent profiles, loadouts, wardrobe/cosmetics, authoritative profile sync, the full procedural character rig, movement expansion, procedural audio and the cover-inspired start/loading experience. It is committed and pushed to `master`.

Delivered:

- **Shared config:** `ids.ts`, `cosmetics.ts`, `profile.ts`, updated `classes.ts` and `weapons.ts`.
- **Shared types:** profile/cosmetic unions, `WelcomeMessage` carrying a full profile, `ServerHello` carrying a full profile, `ProfileMessage`, `PlayerState` crouch/swim/sprint/roll flags, full 16-bit `InputButton` layout.
- **Protocol v2:** full profile write/read codec; `S2C_PROFILE` and `C2S_PROFILE_UPDATE`; snapshot flags for crouch/swim/sprint/roll; class max HP.
- **Server:** profile-aware join, validation, class rebuild, profile broadcasts, profile update handling, swim instead of deep-water respawn, class HP restore on respawn.
- **Movement:** directional speed multipliers, sprint, crouch, dodge roll, swimming, buoyancy, ledge mantle, air control, surface-aware traction, jump tuning.
- **Input:** full 16-bit mapping, crouch toggle/hold, sprint-roll gesture, weapon slots, fire buttons, skills, interact/heal/wrench/reload/taunt, wheel weapon switching, Alt+wheel zoom.
- **Client profile store:** LocalStorage persistence, class/faction/name/cosmetic/loadout setters, randomise/reset, server profile application, profile fingerprint.
- **Character material and rig (just written, not yet verified):** per-character shader with skin mask, battle damage, charred and frozen uniforms; 7-slot procedural rig with 12 skin tones, 8 hair colours, 7 hairstyles and bodyType morph; merged body/arms/legs for five character draw calls.

Also delivered in the completed milestone:

- `NetworkClient` sends and receives full profiles (`S2C_PROFILE`, `C2S_PROFILE_UPDATE`).
- `GameClient` maintains an authoritative profile map and rebuilds views on appearance changes.
- `Wardrobe.svelte`, `SlotCarousel.svelte` and `AudioSettings.svelte` with live 3D preview.
- Procedural `synth.ts`, `gibberish.ts` and the supplied `library.ts` SFX recipes.
- Cover-inspired main menu, boot/deployment loading screens and deployment overlay.
- EN/DE wardrobe, audio, movement, class and deployment keys.
- External supplied music beds with menu/gameplay/round roles and intensity crossfades.
- Emergency parachute state machine, canopy visual, wind drift and audio.
- Per-frame draw-call telemetry, full typecheck and production build.

### 5.3 Milestone 3 — complete

Tactical sprint, crouch with a 35 % shorter hitbox, ledge mantle, dodge roll, swimming, authored ice patches and the emergency parachute on the shared deterministic motor.

### 5.4 Milestone 4 — complete

Three weapon slots, six gimmick weapons, authoritative fire with server hitbox rollback (two-second lag history), nine class skills, four named AI bots, kill feed, 10-second live killer cam and procedural combat audio.

### 5.5 M5-Kern test build — implemented, waiting for the owner's test

On 25 October the owner asked to stop after the next playable milestone and test it before work resumes. The build that answers this is the core of M5 plus the art and character packages that landed with it:

- **1A painterly comic look:** brush-stroke paint pass, ink outlines, shadows; picture quality Auto / High / Medium / Low (`?quality=` overrides it for one session).
- **1B comic HUD and menus:** cover-art menu, paper panels, painted slot/skill tiles, comic stickers, faction crests, each with a CSS/SVG fallback.
- **1C / 3M mascot class:** Alpine Cow (Peak Guard) and Battle Coconut (Lagoon League), see §7.6; animated Meshy cow (gaits, bell, spring tail, eyelids) and coconut (12 painted faces, rolling), comic deaths. URL options `?mascotModels=off`, `?coconutShell=painted|meshy|vertex`, `?lei=procedural`, `?cowWalk=clip`.
- **1D rebuilt Fjord Fiesta:** typed 257 × 257 blueprint (3.125 m cells) in the master orientation (lagoon south-west, summit north-east), three towers, suspension bridge, routes and both bases.
- **2V painted world:** billboard sprite vegetation and clutter cut from the owner's paintings, painted facades, painted terrain layers, ground decals, a foothill ring beyond the map edge and a closer camera.
- **3C painted soldiers:** owner-generated, rigged Meshy GLB models for all six soldiers (three classes × two factions), cadence-capped gaits; `bun run models` rebuilds them, `?painted=0` skips the painted models (soldiers fall back to the procedural rig, vehicles to stand-in hulls); `bun run test` covers the pipeline.
- **3H wandering hens:** three per map half, server-authoritative; they flee people, gunfire and blasts, can be shot (feather burst, kill-feed line, no score) and respawn after 45 s. Drifters do not scare them.
- **3G drifter class:** Creepy Mountain Girl / Hot Beach Girl, see §7.7.
- **4W hero weapons:** 13 procedural hero weapons (3 primaries, 4 secondaries, 6 gimmicks) with hold poses for the painted soldiers; the umbrella only opens overhead in a long fall (visual pose).
- **4V vehicles:** Fondue Crawler, Coconut Beach Tank, Tactical Badi-Flamingo and Sidecar Motorcycle, see §13.8.
- **4T Climate Conquest:** towers, tickets, weather balance, rounds and spawns, see §14.1 and §10.6.
- **Protocol 13** (§17.2); EN/DE keys for every new surface.

### 5.6 Not implemented (design reference or later)

- **Deferred from the M5-Kern build:** the 1E rewrite of the procedural fallback characters (unreviewed, conflicts with 3C/4W; every class already shows its painted model) and the Hot Beach Girl's full post-process exemption.
- **Rest of M5:** cable car ride, T-bar ride, alpine coaster, hammock catapult, NPC cow behaviour, biplane, rowboat and gondola, vehicle repair, the heavy tower weather transformations (unfolding snow cannon, spraying flamingos, icicles) and the weather's effect on the snowline, particles and ice patches (§11.5). Weather currently grades sky, light and water and scales the parachute wind.
- **M6:** destruction stages, terrain craters, bridge repair, falling trees, explosive silos, billboards, decal ring buffer and late-join map sync.
- **M7:** end screen and podium, armory shop, VIP pass, ads, custom lobbies and matchmaking.

---

## 6. Factions and world fiction

### 6.1 The Peak Guard / Die Gipfel-Garde

- **Idea of a perfect holiday:** crisp snow, quiet pistes, fondue at altitude, everything on time.
- **Visual identity:** alpine blue, glacier white, signal red, brass/gold accents, dark green loden.
- **Motto (EN):** “Keep the frost. Serve the fondue.”
- **Motto (DE):** „Halt den Frost. Serviere das Fondue.“
- **Home base:** Peak Guard Base Camp at approximately `(+310, +58, +310)`, a fortified high-alpine depot behind Tower C.
- **Signature kit:** fondue-pot helmets, loden coats, lederhosen, ski boots, cuckoo-clock backpacks, snow cannons.

### 6.2 The Lagoon League / Die Lagunen-Liga

- **Idea of a perfect holiday:** endless summer, bare feet, flamingo inflatables, something cold with a tiny umbrella.
- **Visual identity:** turquoise, flamingo pink, coral, sunshine yellow, white sand.
- **Motto (EN):** “Endless summer. Armed and barefoot.”
- **Motto (DE):** „Endloser Sommer. Bewaffnet und barfuß.“
- **Home base:** Lagoon League Beachhead at approximately `(-310, +2.5, -310)`, a protected palm peninsula southwest of Tower A.
- **Signature kit:** captain caps, Hawaiian shirts, bathrobes, boardshorts, dive flippers, lifebuoys, coconut tanks.

### 6.3 Faction assignment decision

- A profile stores a **faction preference**.
- The **server assigns the actual faction** at join time to keep teams balanced.
- Current server rule: pick the faction with fewer players (bots count, drifters do not); on a tie the preference wins. The preference is not guaranteed. A drifter is not balanced: she joins her preferred side. Leaving the drifter class redeploys the player at once through the respawn, which re-runs the balance and may move them to the smaller side (toast "You now play for … to keep the teams even").
- The server never accepts a client-side faction change after join. Profile updates keep the server-assigned faction.
- HUD colours, spawn points and class flavour names follow the server-assigned faction.

This keeps match balance authoritative and prevents faction stacking. If preference-aware matchmaking is added later, it must remain server-authoritative.

---

## 7. Classes

There are five classes (wire codes 0–4, append only): the three soldier classes below, the **Mascot** (§7.6) and the **Drifter** (§7.7). Every soldier class can use every cosmetic item; class only controls the capsule, health, movement feel and default loadout. Mascots and drifters have a fixed look. What a class may do is one flag table, `CLASS_CAPABILITIES` in `packages/shared/src/config/classes.ts` (armed, skills, damageable, targetable, canCapture, countsTowardBalance, botsMayPick); gameplay code asks these flags instead of comparing class ids.

### 7.1 Shared class contract

| Stat | Allrounder | Heavy | Infiltrator |
| --- | ---: | ---: | ---: |
| Max HP | 150 | 220 | 110 |
| Base move speed | 7.0 m/s | 5.6 m/s | 8.1 m/s |
| Sprint multiplier | 1.35 | 1.35 | 1.35 |
| Capsule radius | 0.45 m | 0.62 m | 0.38 m |
| Capsule height | 1.80 m | 1.95 m | 1.75 m |
| Jump speed | 7.9 | 7.9 | 7.9 |
| Ground acceleration | 56 | 42 | 66 |
| Air acceleration | 22.4 | 16.8 | 26.4 |
| Ground friction | 11 | 10 | 12 |

Jump speed 7.9 with gravity −24 produces roughly a **1.3 m** jump height. Air acceleration is **40 %** of ground acceleration.

### 7.2 Allrounder

| Faction | Name | Role |
| --- | --- | --- |
| Alpine | **Geissen-Major** | Allrounder |
| Lagoon | **Yacht-Kapitän** | Allrounder |

- The flexible mid-range class. Good health, good speed, forgiving recoil.
- Default loadout: **SMG / Pump-Action Shotgun / Alphorn**.
- Fantasy: a holiday rep who has seen too much and packed exactly the right amount of fondue.

### 7.3 Heavy

| Faction | Name | Role |
| --- | --- | --- |
| Alpine | **Senn-Koloss** | Heavy |
| Lagoon | **Hafen-Hüne** | Heavy |

- Slow, heavily armoured anchor. Highest HP, largest silhouette, best sustained fire.
- Default loadout: **LMG / Anti-Tank Bazooka / Portable Snow Cannon**.
- Fantasy: a dairy colossus or harbour bruiser who treats suppressive fire as a form of hospitality.

### 7.4 Infiltrator

| Faction | Name | Role |
| --- | --- | --- |
| Alpine | **Gämsen-Jäger** | Infiltrator |
| Lagoon | **Riff-Schmuggler** | Infiltrator |

- Fast, fragile, precision-oriented. Best flanking and vertical play.
- Default loadout: **Bolt-Action Sniper / Silenced Pistol & Knife / Tell Crossbow**.
- Fantasy: a mountain hunter or reef smuggler who considers “stealth” a suggestion.

### 7.5 Class switching

- Class is part of the profile (`cosmetics.classId`) and is synchronised to the server.
- **When a change applies (M5-Kern):** a class or loadout change from the wardrobe applies at once while the player is still fresh on the spawn pad (protected, within 4 m of the pad, unhurt, no shot or skill yet, outside every capture zone), before the first deployment from the menu, and during the 15 s results ceasefire. Otherwise it is stored and applies at the next respawn, and the player sees the notice "New class and loadout apply at your next respawn." Name and cosmetics of the current class still apply live. A drifter (who never dies) redeploys at once instead (§6.3).
- Applying a change rebuilds the server capsule at the same feet position, keeps the health fraction and running skill cooldowns, keeps the ammo of unchanged weapons and clears the input queue.
- The client must rebuild its local prediction capsule and character view when the class changes.
- Cosmetics do not reset when switching class unless the player explicitly resets the profile. The current profile store uses class default cosmetics on class change; this is a convenience choice and should be reviewed if players expect outfits to persist across classes.

### 7.6 Mascot

| Faction | Form | Vitality | Movement |
| --- | --- | ---: | --- |
| Alpine | **Alpine Cow / Alpenkuh** | 260 | W/S throttle, brake and reverse, A/D steer; trot 6.4 m/s, gallop (Shift + W, drains a meter) 11.5 m/s; Space hop. |
| Lagoon | **Battle Coconut / Kampf-Kokosnuss** | 200 | Rolls with WASD relative to the camera, 10.5 m/s under its own power (slopes add more); Space jump and double jump. |

- Fixed suit, no firearms (`armed: false`), no soldier skills; fights by ramming at speed (teammates only get a friendly bump).
- Three moves on Q / E / T (or 1 / 2 / 3 + click): cow **Horn Charge**, **Hoof Stomp**, **Cowbell Clang**; coconut **Turbo Roll**, **Ground Pound** (air only), **Coconut Milk Splash**.
- Can capture towers, counts toward team balance; bots may play it (one bot per side may roll the mascot).
- Cannot board vehicles (§13.8).
- Visuals: the owner's Meshy cow (gait solver, bell pendulum, spring tail, ear flicks, blinking eyelids) and Meshy/painted coconut shell with 12 painted face expressions and a painted lei.

### 7.7 Drifter

| Faction | Form |
| --- | --- |
| Alpine | **Creepy Mountain Girl / Gruseliges Bergmädchen** |
| Lagoon | **Hot Beach Girl** |

- **Untouchable:** cannot be hurt, launched, slowed or blocked; shots, blasts, rams and bodies pass through her (own collision group). Bots never target her.
- **Unarmed and walk-only:** no weapons, skills, jump, sprint, crouch or taunt. Walk 2.4 m/s (strafe 85 %, backward 65 %); long falls become a slow drift (at most 3.2 m/s down); over water she hovers just above the surface (no swimming).
- **Supply aura** (passive, both forms identical, `DRIFTER_AURA`): teammates within **6 m** heal **8 vitality/s** once they have taken no damage for **3 s**, and their reserve ammo refills by **one magazine per weapon slot every 4 s**. Each teammate is supplied by one drifter only (no stacking); enemies and the drifter herself are never affected. Mascots get the heal but no ammo.
- **Support points:** one per 10 vitality healed and one per magazine handed out; shown on the Tab scoreboard (kills, deaths, support) and reset each round.
- **Rules:** cannot capture towers (the capture bar says so), does not count toward team balance, cannot board vehicles, never appears in the kill feed. Hens do not flee from her.
- Fixed appearance: only the call sign can be changed. She only exists as her painted model (never the procedural rig; until it loads only her contact shadow shows). The Hot Beach Girl is the photoreal exception (PBR shading on the character mask); her full exemption from the painterly post pass is still open.

---

## 8. Character customisation and wardrobe

### 8.1 Design goal

The wardrobe is a **live 3D character editor**, not a paper-doll menu. Every change is visible immediately on a rotating character standing on an alpine/beach podium, with the same rig used in gameplay. Cosmetics are visible on **all** characters in multiplayer because profiles are server-synchronised.

### 8.2 Body and identity controls

| Control | Range | Notes |
| --- | --- | --- |
| Body type | `0.0 … 1.0` continuous | 0 = broader/masculine silhouette, 1 = narrower/feminine silhouette. Shoulder width, hip width, waist and chest depth morph continuously. |
| Skin tone | 12 curated tones | Rosy alpine through deep warm brown. |
| Hair colour | 8 colours | Signature ginger-orange first, then auburn, blonde, platinum, brown, dark brown, black, silver. |
| Hair style | 7 styles | Buzzcut, afro, long waves, braids, ponytail, pompadour, bald. |
| Voice pitch | `0.8 … 1.25` | Drives the procedural gibberish voice preview and future voice lines. |

**Skin tones (`SKIN_TONES`):** `#fad7c0`, `#f3c2a2`, `#e8ad88`, `#d99568`, `#c67d4e`, `#b06a3b`, `#8e5129`, `#733e1d`, `#5c2e14`, `#48220e`, `#361809`, `#261005`.

**Hair colours (`HAIR_COLORS`):** `#ff5511`, `#b83214`, `#f2c94c`, `#f5efe0`, `#6b3a20`, `#3b2010`, `#1a1a1d`, `#dcdfe4`.

**Hair styles (`HAIR_STYLE_IDS`):** `buzzcut`, `afro`, `long_waves`, `braids`, `ponytail`, `pompadour`, `bald`.

### 8.3 The seven cosmetic slots

The order of each ID list is part of the network contract. Append new IDs at the end; never reorder an existing table.

#### Headgear (`HEADGEAR_IDS`)

| ID | Concept |
| --- | --- |
| `head_none` | No headgear. |
| `head_tirol` | Green Tyrolean felt hat, red band, feather. |
| `head_fondue_pot` | Steel fondue pot with handles and a knob. |
| `head_marmot_fur` | Fur cap with a tail. |
| `head_captain_cap` | White captain’s cap, dark band, gold badge. |
| `head_watermelon` | Watermelon-rind helmet with pink flesh and seeds. |
| `head_flamingo_hat` | Pink flamingo head/neck hat with beak. |
| `head_diving_bell` | Brass diving helmet with a glass window and bolts. |

#### Face (`FACE_IDS`)

| ID | Concept |
| --- | --- |
| `face_none` | No facial hair or accessory. |
| `face_full_beard` | Full alpine beard and moustache. |
| `face_mustache` | Curled moustache. |
| `face_icicle_beard` | Pale-blue icicle beard. |
| `face_bubble_pipe` | Pipe with floating bubbles. |
| `face_snorkel_mask` | Snorkel mask and tube. |
| `face_eyepatch_beard` | Eyepatch with a beard. |
| `face_flamingo_shades` | Pink flamingo sunglasses. |
| `face_sunscreen` | White sunscreen stripe and cheek dots. |

#### Torso (`TORSO_IDS`)

| ID | Concept |
| --- | --- |
| `torso_tracht_shirt` | Cream tracht shirt, dark placket, gold buttons, suspenders. |
| `torso_dirndl_vest` | Red dirndl vest over a white blouse, apron. |
| `torso_loden_coat` | Green loden coat, gold buttons, belt. |
| `torso_hawaii_shirt` | Turquoise Hawaiian shirt with coral/yellow flowers. |
| `torso_flamingo_ring` | Pink inflatable flamingo ring around the waist. |
| `torso_bathrobe` | Pink bathrobe with white lapels and belt. |
| `torso_bare_suspenders` | Bare skin torso with leather suspenders. |
| `torso_barrel_armor` | Wooden barrel armour with metal hoops. |

#### Back (`BACK_IDS`)

| ID | Concept |
| --- | --- |
| `back_none` | No back item. |
| `back_cuckoo_clock` | Wooden cuckoo clock with face, pendulum and door. |
| `back_leather_pack` | Leather rucksack with straps and buckle. |
| `back_lifebuoy` | White/red lifebuoy. |
| `back_surfboard` | Tall surfboard with stripe and fin. |
| `back_mini_bbq` | Mini grill with legs, bars and a sausage. |

#### Hands (`HANDS_IDS`)

| ID | Concept |
| --- | --- |
| `hands_bare` | Bare hands. |
| `hands_mittens` | Red mittens with white cuffs. |
| `hands_boxing` | Oversized red boxing gloves. |
| `hands_pirate_hook` | Metal hook on the right hand. |
| `hands_gold_watch` | Gold wristwatch. |

#### Legs (`LEGS_IDS`)

| ID | Concept |
| --- | --- |
| `legs_lederhosen` | Brown lederhosen, socks and striped cuffs. |
| `legs_striped_trousers` | Cream trousers with dark horizontal stripes. |
| `legs_olive_pants` | Olive cargo trousers with pocket and cuff. |
| `legs_boardshorts` | Teal boardshorts with coral stripe. |
| `legs_long_johns` | Red long johns with white cuffs. |

#### Feet (`FEET_IDS`)

| ID | Concept |
| --- | --- |
| `feet_mountain_boots` | Brown mountain boots with thick soles. |
| `feet_ski_boots` | Red ski boots with buckles. |
| `feet_dive_flippers` | Long teal dive flippers. |
| `feet_sandals_socks` | White socks in sandals. |
| `feet_peg_leg` | Wooden peg leg (right leg) with a metal foot. |

### 8.4 Default outfits

- **Allrounder:** bodyType 0.45, skin tone 1, ginger hair, pompadour, Tyrolean hat, tracht shirt, leather pack, bare hands, lederhosen, mountain boots, voice 1.0.
- **Heavy:** bodyType 0.18, skin tone 9, ginger hair, afro, fondue-pot helmet, full beard, barrel armour, mini BBQ, boxing gloves, striped trousers, ski boots, voice 0.82.
- **Infiltrator:** bodyType 0.78, skin tone 4, black hair, long waves, marmot-fur cap, eyepatch beard, loden coat, no back item, pirate hook, olive pants, sandals with socks, voice 1.12.

### 8.5 Character rig decisions

- **Fully procedural.** No external meshes. Built from boxes, spheres, cylinders, tori and discs.
- **Five draw calls per character:** one merged body (torso, head, hair, face, headgear, back item), two arms, two legs, plus a shadow disc.
- **Per-character material.** One `ShaderMaterial` per character, disposed with the view.
- **Skin mask in vertex-colour alpha.** Alpha 1 = skin, alpha 0 = cloth/cosmetic. The character shader outputs opaque alpha, so the mask never makes parts transparent.
- **Skin tone is a uniform** (`uSkinColor`), not baked into vertices, so a wardrobe change only needs a material update.
- **Effects are uniforms:** `uBattleDamage`, `uCharredState`, `uFrozenState`, `uTime`. Battle damage adds procedural soot; charred darkens the whole model; frozen adds an ice tint and shimmer.
- **Body morph is continuous** through shoulder width, hip width, waist width and chest depth.
- **Class height scales the whole rig** to the class capsule height (`stats.height / 1.88`).
- **Animation:** walk/run swing, sprint lean and larger swing, crouch squat and lower spine, dodge-roll tuck, swim lean with arm strokes and flutter kicks, air pose, knockout fall.
- **Wardrobe preview:** idle breathing, slow rotation, live rebuild on profile changes, optional freeze/burn/soot test effects.

### 8.6 Wardrobe UX decisions

- The editor must expose all seven slots as carousel/dropdown controls with previous/next arrows, not a flat wall of text.
- Sliders for body type, skin tone, hair colour, hair style and voice pitch.
- Class and faction selectors at the top; class changes update the default loadout and capsule preview.
- Live 3D preview rotates on an alpine/beach podium.
- **Randomise** and **Reset** actions.
- **Voice preview** button that speaks a short procedural gibberish line at the current pitch.
- **Test effects** buttons for freeze, charred/ash and soot/battle damage; they are preview-only and must not affect gameplay.
- **Loadout selectors** for primary, secondary and gimmick, validated against the shared weapon tables.
- Closing the wardrobe returns to the previous screen (menu or pause) without losing the profile.

### 8.7 Profile sync rules

- The profile is stored client-side in `localStorage` under `frost-and-flamingos.profile`.
- The client sends the full profile in `C2S_HELLO`.
- The server normalises and sanitises it, assigns faction, then broadcasts the authoritative profile.
- The client sends `C2S_PROFILE_UPDATE` when the player changes class, cosmetics or loadout.
- The server rate-limits profile updates to one every **120 ms**.
- The server broadcasts `S2C_PROFILE` to all players.
- The client rebuilds a character view only when the **appearance key** changes (faction, class, bodyType, skin, hair, all seven slots). Display name, loadout and voice pitch do not force a mesh rebuild.
- Body type is quantised to 8 bits on the wire (`*255`); voice pitch is quantised to 8 bits (`*100`).

---

## 9. Movement and input contract

### 9.1 Locomotion

| Action | Behaviour |
| --- | --- |
| Forward | 100 % of class move speed. |
| Strafe | 85 % of class move speed. |
| Backward | 70 % of class move speed. |
| Sprint | +35 % speed, forward-ish only; not while crouched. |
| Crouch | 55 % speed; capsule height shrinks to 65 % of stand height; stand-up blocked by headroom raycast. |
| Dodge roll | Tap crouch while sprinting forward. 0.6 s roll, 0.4 s recovery. Initial speed at least 9 m/s, decays to 5.5 m/s. |
| Jump | 7.9 m/s initial vertical speed; gravity −24; roughly 1.3 m jump height. |
| Air control | 40 % of ground acceleration. |
| Swim | 4.2 m/s; sprint swim 5.8 m/s; buoyancy floats the body near the surface. |
| Ledge mantle | 0.4 s animation for ledges 0.55–1.6 m above the feet; triggered by jump toward a wall. |
| Fall respawn | Only below `FALL_RESPAWN_Y = -12`. Deep water is swim mode, not a respawn. |
| Step height | 0.45 m autostep. |
| Max slope | 52°. |
| Ground snap | 0.45 m. |

**Deep-water decision:** entering deep water now transitions to swimming. It does not teleport the player to a spawn. This makes the lagoon, harbour and gorge floor playable. Only falling out of the world respawns.

### 9.2 Surface properties

| Surface tag | Trigger | Acceleration scale | Friction scale | Footstep character |
| --- | --- | ---: | ---: | --- |
| `water` | Height below water level − 0.15 | 0.72 | 0.60 | Splash/plunge. |
| `sand` | Height 0–7.5 m, southwest sector | 0.90 | 0.86 | Soft “shff-shff”. |
| `grass_mud` | Height 7.5–22 m, outside village/rock | 1.00 | 1.00 | Grass/earth crunch. |
| `cobblestone` | Within 42 m of village centre or main road | 1.00 | 1.00 | Stone clack. |
| `snow` | Height ≥ 22 m or dynamic weather override | 0.80 | 0.72 | Snow crunch. |
| `ice_patch` | Temporary snow-cannon zone | 0.22 | 0.10 | Slithering skid. |
| `rock_cliff` | Slope > 0.68 | 0.80 | 0.90 | Scraping rock. |
| `wood` | Bridges, docks, roofs | 1.00 | 1.00 | Hollow “tock-tock”. |

The master design also uses surface tags for crater eligibility and audio. The shared helper is `surfaceTagAt(x, z)`.

### 9.3 Input button layout (16-bit)

The input mask is a shared network contract. Never reorder bits.

| Bit | Button | Typical binding |
| ---: | --- | --- |
| 0 | `Forward` | W / Arrow Up |
| 1 | `Backward` | S / Arrow Down |
| 2 | `Left` | A / Arrow Left |
| 3 | `Right` | D / Arrow Right |
| 4 | `Jump` | Space |
| 5 | `Crouch` | C toggle, Ctrl hold; a short C pulse = dodge roll (sprinting) or seat switch (vehicle) |
| 6 | `Sprint` | Shift (also the Badi-Flamingo plug turbo) |
| 7 | `FirePrimary` | LMB (also the vehicle gun) |
| 8 | `FireSecondary` | RMB (sent, currently unused by gameplay) |
| 9 | `Reload` | R |
| 10 | `Interact` | F (also enter / leave a vehicle) |
| 11 | `Heal` | H — carries the vehicle horn |
| 12 | `Wrench` | unbound (reserved for repairs) |
| 13 | `Skill1` | Q |
| 14 | `Skill2` | E |
| 15 | `Skill3OrTaunt` | T |

Weapon slots (1 / 2 / 3, wheel) travel in the input frame's slot field, not in the mask. The taunt (`G`, local animation and voice) and the Tab scoreboard are client-side only.

### 9.4 Current control map

| Action | Input |
| --- | --- |
| Move | W A S D / arrow keys |
| Look | Mouse (pointer lock) |
| Jump | Space |
| Sprint | Shift |
| Crouch | C toggle, Ctrl hold |
| Dodge roll | Tap C while sprinting forward |
| Swap shoulder | V |
| Camera distance | Alt + mouse wheel |
| Weapon slot | 1 / 2 / 3 or mouse wheel |
| Fire | LMB |
| Reload | R |
| Interact / enter a vehicle | F |
| Class skills | Q / E / T (skill 1 / 2 / 3; E is skill 2 on foot) |
| Taunt | G |
| Scoreboard | Hold Tab (in a round only; elsewhere Tab moves the keyboard focus) |
| Pause / release mouse | Esc |
| Telemetry | F1 |

**In a vehicle:**

| Action | Input |
| --- | --- |
| Enter / leave | F (within 2.4 m of the hull) |
| Drive | W / S throttle and reverse, A / D steer |
| Switch seat | C (a tap; crouch is cleared on the way in and out) |
| Horn | H (0.9 s cooldown) |
| Vehicle gun (tank cannon, flamingo harpoon) | LMB, aim with the mouse |
| Plug turbo (Badi-Flamingo, afloat) | Shift |
| Handbrake drift (Sidecar) | Space |

**Mascot and drifter:** the cow uses W/S throttle, A/D steer, Shift + W gallop, Space hop; the coconut rolls with WASD relative to the camera and double-jumps with Space; both use Q / E / T (or 1 / 2 / 3 + click) for their moves. The drifter only has WASD and the mouse.

**Decision:** `C` is the crouch toggle and the sprint-roll gesture (and the seat switch in a vehicle); `Ctrl` is hold-to-crouch. `V` is shoulder swap, not knife. The knife is its own secondary weapon (`knife`). `Q` / `E` / `T` are the three class skills; the heal snack is the Allrounder's skill 1, and there is no separate wrench key in this build.

### 9.5 Camera

- Spring-loaded over-the-shoulder camera with terrain collision.
- Mouse yaw is authoritative for movement; camera position is smoothed.
- Shoulder offset, pitch clamp, zoom distance and collision distance are tunable constants.
- The menu uses a slow orbit around the preview stage, not the gameplay camera.

---

## 10. Map: Fjord Fiesta

The map is called **Fjord Fiesta**. It is a single 800 m × 800 m vertical playground split into three climate bands.

### 10.1 Master dimensions

| Property | Master spec | Current build (1D rebuild) |
| --- | --- | --- |
| World size | 800 m × 800 m (`X/Z −400…+400`) | 800 m × 800 m |
| Heightfield | 257 × 257 vertices (~3.125 m cells) | 257 × 257 vertices (`MAP_SEGMENTS = 256`, 3.125 m cells) |
| Water level | `Y = 0.0` | `Y = 0.0` |
| Lagoon floor | Down to `Y = −4.5` | `LAGOON_FLOOR = −4.5` |
| Fall respawn | Below the world | `Y < −12` |
| Orientation | Southwest lagoon, centre village, northeast summit | As the master spec |

The 1D rebuild made the map a typed blueprint under `packages/shared/src/config/map/` (layout, terrain, structures, buildings, routes, gameplay, scatter), re-exported by `map-fjord.ts`. A foothill ring beyond the playable square is purely visual (2V). Known gap: the Rapier heightfield splits each cell along the other diagonal than the rendered mesh and `sampleMapHeight`, so on steep cells the collider and the visible ground differ by up to ~3.7 m (`colliderHeightAt` in `physics/world.ts` gives the collider height).

### 10.2 Vertical drama

1. **Southwest — South Sea Lagoon & Sand Beach (`Y = −4.5 … +6`).** Turquoise water, white-gold sand, coconut palm groves, rock cliffs and the wooden pier network of **Tower A (Lagoon Harbor)**.
2. **Centre — Alpine Village & Cable-Car Gorge (`Y = +18`, gorge floor `Y = +1.5`).** Cobblestone plateau, two-storey wooden chalets, **Tower B (Village Square)**, and a deep gorge with a waterfall crossed only by the high suspension bridge, cable car, biplane or umbrella glide.
3. **Northeast — Snowy Alps & Glacier Tongue (`Y = +22 … +85`, play plateau `Y = +55`).** Steep snow slopes, dense fir forest, serpentine tank road, ski-lift line, alpine coaster and the cuckoo-clock summit fortress of **Tower C (Summit Dairy)**.

### 10.3 The three weather towers

#### Tower A — Lagoon Harbor / Lagunen-Hafen

- **Position:** approximately `(-190, 2, -185)`.
- **Architecture:** red-and-white striped lighthouse, 22 m tall, 9 m base diameter, on a large octagonal wooden platform (radius 18 m, `Y = +2`).
- **Access:** four 4.5 m-wide wooden piers radiate northeast/east to the beach and west/south to boat moorings and fisher huts.
- **Vertical play:** exterior stairs and a ladder to the 14 m gallery, a 360° sniper/observation nest.
- **Destructible elements:** four access piers, each with two marked 6 m bridge segments (150 HP). Destroyed segments leave a water gap; players can swim, jump or repair with the wrench in 3 s. Two destructible beach bars/fisher huts at the beach transition, surrounded by crates, explosive coconut pressure silos (100 HP) and fallable coconut palms.
- **Weather transformation:** Lagoon-held = warm yellow dome, bunting, four life-size pink decorative flamingos spraying golden sun sparks. Peak-held = yellow-white giant snow cannon unfolds from the dome, icicles grow on the railing, powder snow covers the harbour.

#### Tower B — Village Square / Dorfplatz

- **Position:** approximately `(0, 18, 0)`.
- **Architecture:** raised 90 m × 90 m cobblestone plateau at the climate border between beach ascent and gorge.
- **Centrepiece:** weather clock tower / village fountain pavilion (capture zone), low stone walls, crate stacks and two large 1930s tourism billboards.
- **Three destructible chalets:** Chalet West “Gasthof Gamsbart”, Chalet East “Alpen-Bistro”, Chalet South “Tiki-Alm”. All are two-storey, enterable buildings with interior stairs, wooden balconies and attics. They use the full three-stage destruction pipeline.
- **The great suspension bridge:** directly north of the square, a 50 m long, 6 m wide wooden suspension bridge on thick cables and massive wooden pylons spans a 16.5 m gorge (waterfall in the west flowing into the lagoon). The bridge consists of four individually destructible and repairable wooden segments (150 HP each).
- **Lower gorge walkways (`Y = +2.5`):** players who fall (and survive) or flank from below find narrow rock/wood walkways at the pylon feet, plus ladders and rope lifts back up.
- **The angry Alpine Cow:** an invulnerable brown-and-white cow with a large golden bell grazes near the south bridgehead. A horn honk (`H`) or a nearby explosion sends it on an 8 s rampage at 18 m/s across the bridge and square. Anyone hit takes 90 damage and is launched with a “BOING!” and cowbell clatter.

#### Tower C — Summit Dairy / Gipfel-Käserei

- **Position:** approximately `(+210, 55, +220)`.
- **Architecture:** a three-storey, sprawling giant wooden chalet styled like a monumental Swiss cuckoo clock, with surrounding shooting-slit balconies, heavy shingle roof, a giant clock face on the southwest façade and a large yellow-white roof snow cannon.
- **Interior:** ground floor stores giant, partly explosive 1000-year cheese wheels (100 HP); wooden stairs lead to balconies at `Y = +60` and the roof at `Y = +65`.
- **Transport hub:** west balcony = red cable-car mountain station with emergency brake lever (`F`); south slope = T-bar ski-lift exit and serpentine tank road; east terrace = alpine coaster start platform winding down to the beach.

### 10.4 Faction main bases

1. **Alpine Base — Peak Guard Base Camp (`+310, +58, +310`).** Protected high-alpine depot behind Tower C: tank hangar (Fondue Crawler spawn), sidecar motorcycle and alpine snow runway for the biplane.
2. **Insel-Basis — Lagoon League Beachhead (`−310, +2.5, −310`).** Protected palm peninsula southwest of Tower A: bamboo garage (Coconut Beach Tank spawn), boat dock for the Tactical Pool Flamingo, sidecar motorcycle and water runway for the biplane.

### 10.5 Map props and landmarks

The current shared blueprint includes chalets, beach bars, summit lodges, docks, a lighthouse, a fountain, a maypole, pines, palms, rocks and distant mountain silhouettes. Props are procedurally built, merged or thin-instanced. The map is immutable data; client visuals and server colliders derive from it.

### 10.6 Spawns

Implemented in the M5-Kern build (`selectConquestSpawn` in `packages/shared/src/config/conquest.ts`, facing in `apps/server/src/rooms/spawn-facing.ts`):

- **No spawn menu.** After the **10 s live killer cam** the server picks a random free pad (no living player or parked hull on it) at a tower your team holds, or at your main base if your team holds none. There is no separate respawn countdown: the 10-second live view is the countdown. The client cannot request a spawn.
- **Pads sit outside every capture zone:** Tower A on the piers’ solid rest decks, 29–34 m from the lighthouse (past the destructible 6 m segments); Tower B on the plaza edge; Tower C on the summit terraces. Each tower has a pad set per faction; only the holder’s set is eligible, and the plates show it.
- **2 s spawn protection** (`SPAWN_PROTECTION_SECONDS`): immune and not counted in capture zones, shown as a soft glow on the pad and a “Protected” tag.
- **Facing:** you face the nearest tower your team does not safely hold (enemy or neutral, contested, or being pushed by the rivals), otherwise the map centre, along the most open line of sight with room for the camera.
- **INTERIM until the cable car exists:** while Peak Guard holds Tower C, **85 %** of its Tower C spawns use three plates on the gorge floor right below the cable-car mid station, at `(54, 70)`, `(50, 74)` and `(54, 76)`: out of sight of every rival Tower B pad, at least 45 m from them; bots climb out by the south gorge trail. Delete `INTERIM_CABLE_CAR_SPAWNS` and its branch in `selectConquestSpawn` when the cable car lands.
- **Wardrobe:** class and loadout changes apply at once on the spawn pad, before the first deployment and during the results; otherwise at the next respawn, with a notice (§7.5).
- **Balance note:** time to the Tower B zone (`apps/server/test/time-to-b.ts`): on the original layout Peak Guard needed 88.5 s vs 33.6 s for the Lagoon League (bot rounds 0:7). With the pad moves and the 85 % share, a 150-minute bot soak measured 43.2 s vs 44.2 s and rounds 6:14 (still Lagoon-leaning from bot combat; the knob is `BOT_PRECISION_AIM_ERROR` = 0.045, `FF_BOT_PRECISION_AIM` overrides it).
- **Known:** while the Lagoon League holds Tower C, its summit pads can see the Peak Guard base pads (base pads are only live while Peak Guard holds no tower).

---

## 11. Destruction, terrain craters and weather

This is a master reference for the destruction milestone (M6) and the weather part of M5. Nothing in §11.1–11.4 or §11.6 is implemented yet. For §11.5, the M5-Kern build simulates `weatherBalance` on the server (§14.1) and the client grades sky, light, haze and water between the icy and golden presets; it also scales the parachute wind. The snowline shift, global particles and ice-patch timing in the table are not implemented yet.

### 11.1 Destructible buildings

- **Eight enterable main buildings** (two beach bars at Tower A, four alpine chalets at Tower B, two side huts at Tower C), each with **500 structure HP**.
- **Stage 0 — INTACT (100–65 % HP):** all walls, shutters, balconies and roof intact; enterable via doors and interior stairs.
- **Stage 1 — DAMAGED (<65 % HP):** individual façade boards and balcony railings break out with wood splinters; irregular sniper holes appear in walls; physics collider switches to the Stage 1 mesh.
- **Stage 2 — BURNING:** triggered by flamethrower, bazooka, tank shell or barrel explosion. Toon fire tongues and a tall black smoke column. Loses **18 structure HP/s**; players upstairs/on the roof take **12 heat damage/s**. The portable snow cannon’s snow stream extinguishes the fire after **1.5 s cumulative** exposure, with a white steam cloud and hiss; the building returns to **Stage 1 (DAMAGED)** and the firefighter earns **+100 Alpen-Taler**.
- **Stage 3 — COLLAPSED RUIN (0 HP):** roof and upper floor collapse with a crash and a huge dust/soot cloud. Players inside take **90 collapse damage** (“BOING!”). The charred ground-floor masonry remains at **1.1–1.3 m** height, perfect crouch cover for the rest of the round.

### 11.2 Physical terrain craters

`applyTerrainCrater(x, z, radius, depth)`:

1. Server computes a smooth cosine depression for all heightfield vertices within **radius 2.5–4.0 m**, by **depth 0.8–1.2 m**, capped at **−2.2 m** below original terrain to prevent falling through the world or under groundwater. A slight raised rim of **+0.25 m** at `d = 0.85–1.15 × radius`.
2. Server rebuilds its Rapier heightfield and sends `S2C_GAME_EVENT (TERRAIN_CRATER)`.
3. Clients update exactly the same Babylon.js terrain vertices, recompute normals for the affected patch and darken the crater interior with brown/soot vertex colours.
4. **Gameplay:** a standing or crouched soldier can jump into a fresh crater and use it as a real trench on an open beach or snow slope.

Craters are only created on `SAND`, `GRASS_MUD` and `SNOW`. Water hits produce a large 3D water fountain instead. Cobblestone produces a flat cracked decal. Rock cliffs produce ricochet sparks and a soot decal. Wood destroys the bridge/house segment instead.

### 11.3 Destructible and repairable bridges

- **12 segments:** four on the great gorge suspension bridge, eight on the harbour piers. Each has **150 HP**.
- **Stage INTACT:** full load capacity for infantry and motorcycles.
- **Stage DESTROYED:** planks fall away; only side posts/cables remain. The Rapier ground collider for that segment is disabled; players who do not jump or glide fall into the gorge/water.
- **Stage PATCHED:** a player standing within **3.5 m** of the remaining posts holds **E for 3.0 s**. Dust clouds and 3D “TOCK! TOCK! BANG!” text appear. A crooked but fully walkable improvised plank bridge (**100 HP**) folds back up. Server event: `ENV_BRIDGE_REPAIR`.

### 11.4 Trees, silos, billboards and decals

- **60 fallable trees:** 35 alpine firs in the north, 25 coconut palms in the south, **80 HP** each.
  - Fall physically in the direction of the last hit over **1.2 s**.
  - A player or bot in the fall corridor takes **80 crush damage** with a loud “BOING!”.
  - The fallen trunk remains as horizontal cover (`r = 0.45 m`, `l = 7.0 m`) for the rest of the match.
- **16 explosive giant cheese wheels and coconut pressure silos:** **100 HP**.
  - Placed at road crossings, bridgeheads and towers.
  - At 0 HP they swell to **1.5×** over **1.0 s** with a warning whistle, then explode for **130 damage** in a **6 m radius**, tear a real crater, set nearby houses to **Stage 2 (BURNING)** and blast-launch hit enemies.
- **6 large 1930s tourism billboards:** wooden frames **6 m × 3.5 m** on main paths, with retro ads (“Visit the Summit Dairy — 1000 years of maturity!” / “Sunshine galore in the lagoon!” plus a dynamic ad slot in Milestone 6). Can be shot through and blown apart.
- **Persistent decal ring buffer:** **4,096 ThinInstances**. Bullet hits leave holes in walls/piers, explosions leave black soot, cheese/coconut shells leave coloured splatters. All decals survive until the round ends with no per-decal draw-call overhead.

### 11.5 Dynamic weather

The server computes a global **`weatherBalance`** every tick:

- `−1.0` = absolute alpine ice storm.
- `0.0` = sunny-fresh transition weather (round start).
- `+1.0` = 35 °C tropical heat.

Each held **Peak Guard** tower shifts the balance **−0.015/s** toward frost. Each held **Lagoon League** tower shifts it **+0.015/s** toward tropical sun.

| Parameter | −1.0 Alpine dominance | 0.0 Balanced | +1.0 Island dominance |
| --- | --- | --- | --- |
| Sky and light | Steel-blue icy (`#A8C8E8`), cool directional light | Bright azure (`#58A8F8`), neutral white light | Warm tropical gold (`#FFE098`), deep-yellow sun |
| Global particles | Dense horizontal snowstorm across the whole map | Light snow in the north, clear air in the south | Glittering sun sparks and heat shimmer |
| Terrain snowline | Snow creeps down to the beach (`Y = +2`) | Natural line at `Y = +22` | Snow retreats to the highest peaks (`Y = +48`) |
| Ice patches | Last **7.5 s** | **5.0 s** | Melt faster, **3.0 s** |

### 11.6 Late join and round reset

- **Late join:** `S2C_MAP_STATE_SYNC` carries all current destructible states (building stages, bridge states, fallen trees, exploded silos) and all terrain craters `(x, z, radius, depth)`. The client applies them to its heightfield and meshes in under 5 ms.
- **Deterministic reset:** when a team reaches 0 vacation tickets (or a host/VIP restarts the match), after the podium sequence the whole map resets in 0 ms:
  - Heightfield restored from the immutable `baseHeightData: Float32Array`; all craters gone.
  - All eight buildings back to Stage 0; all 12 bridge segments intact; all 60 trees/palms and 16 cheese/coconut silos back in place.
  - Decal ring buffer index reset to 0; all bullet holes and soot gone.
  - All 10 vehicles respawn polished at their start positions.

---

## 12. Weapons, skills and combat

This is the master reference for combat. M4 implemented the three-slot system, the weapons, class skills and combat feedback; the M5-Kern build draws the 13 weapons as procedural hero weapons with hold poses (4W). Where the numbers below differ from `packages/shared/src/config/weapons.ts` and `skills.ts`, the code is the current truth. In particular the class skills in play are the nine of `CLASS_SKILLS` on **Q / E / T** (Allrounder: Fondue snack, Ram sprint, Battle yodel; Heavy: Cheese armour, Barrel blast, Ground slam; Infiltrator: Reef cloak, Smoke bomb, Grapple dash), not the §12.4 table, and there is no separate Q heal / E wrench widget (§12.5).

### 12.1 Three-slot weapon system

Every class carries exactly three weapons:

- **Slot 1 — Primary:** core workhorse.
- **Slot 2 — Secondary:** close support, launcher or sidearm.
- **Slot 3 — Gimmick:** class-defining slapstick special.

Slots 1 and 2 deliver 70 % of core gunplay. Slot 3 delivers 30 % lethal action-cartoon nonsense.

### 12.2 Primary and secondary weapons

#### Allrounder

**SMG (`smg`)**

- Look: compact 1930s/40s Thompson/MP40-inspired cartoon SMG with dark wooden stock, vertical foregrip, ribbed cooling shroud and drum or curved magazine.
- 450 RPM automatic, 0.133 s per shot.
- 14 damage body, 21 headshot; damage falloff starts at 25 m, minimum 8.
- 30-round magazine, 1.8 s reload.
- Hitscan with server rollback; fast yellow-orange tracer lines.

**Pump-Action Shotgun (`shotgun`)**

- Look: bulky cartoon shotgun with an extra-thick flared blunderbuss muzzle, ribbed wooden pump fore-end and brass fittings.
- 75 RPM, 0.8 s pump cycle.
- **8 pellets × 8 damage** (max 64 per hit, 1.25× headshot).
- 6-round magazine, single-shell reload every 0.45 s.
- **Knockback:** if at least 5 pellets hit within 8 m, the target receives a physical 4.5 m/s impulse away from the shooter.

#### Heavy

**Heavy Machine Gun (`lmg`)**

- Look: massive hip-fired MG with a thick perforated heat shield, belt feed with visibly wobbling brass cartridges and a side pan/box magazine.
- 600 RPM, 0.10 s per shot.
- 12 damage body, 18 headshot.
- 75-round magazine, 3.2 s reload.
- No classic iron-sight ADS; RMB activates **“Braced Hip-Fire”**, tightening the spread cone by 45 % at 50 % movement speed.

**Anti-Tank Bazooka (`bazooka`)**

- Look: long olive-green steel tube on the shoulder with a flared rear nozzle, iron crosshair sight and a bulbous cartoon rocket with a red-white checkerboard nose.
- 35 m/s physical projectile with slight gravity drop and a thick grey smoke trail.
- **65 direct hit + up to 40 splash** in a **4.5 m** radius.
- 1 rocket magazine, 2.4 s reload, 8 reserve.
- On soft ground (`SNOW`, `SAND`, `GRASS_MUD`) digs a real **2.8 m radius, 0.9 m deep** trench crater.
- Heavily damages buildings and immediately sets intact/damaged wooden houses to **Stage 2 (BURNING)**.
- Lethal hits force **`BLAST_LAUNCH`**: soot-blackened team-rocket flight with boots, hat and backpack flying off.

#### Infiltrator

**Bolt-Action Sniper Rifle (`sniper`)**

- Look: elegant, overlong repeating rifle with fine walnut stock, bolt handle and a large brass scope on mounting rings.
- 55 RPM, 1.1 s cycle.
- **65 body / 110 headshot**; one-shot kill on an enemy Infiltrator.
- 5-round magazine, 2.2 s reload.
- RMB switches to full-screen scope with distance reticles.
- Every lethal headshot forces **`HELMET_POP`**: the enemy hat/helmet flies off with a loud “PLING!”, a big 3D comic word and a 360° victim pirouette.

**Dual-Combo: Silenced Pistol / Squirt-Blaster & Giant Pocket Knife / Cutlass (`pistol_knife`)**

- Primary (LMB): slim agent pistol with a long cylindrical suppressor (alpine) or a brightly coloured high-pressure tactical tropical water/pressure pistol with a yellow pressure tank (island). Identical hitscan ballistics.
- Secondary/melee (RMB or V within 2.5 m): oversized red Swiss giant pocket knife with blade, saw and corkscrew (alpine) or a curved pirate cutlass with gold handguard (island).
- Pistol: 300 RPM semi-auto, 22 damage body / 35 headshot, 12 rounds, 1.4 s reload. No muzzle-flash giveaway at long range.
- Knife: 50 damage front/side; **120 damage backstab** when executed within a 100° cone behind the target, causing an instant spin knockout.

### 12.3 The six gimmick weapons (Slot 3)

All classes can equip any gimmick in the wardrobe/armory.

#### 1. Portable Snow Cannon (`snow_cannon`)

- **Look:** a shrunken portable version of a modern yellow-white ski-resort snow cannon: chunky yellow-white turbine cylinder, black rear fan grille, chrome multi-nozzle ring at the wide front, two side handles and a thick yellow high-pressure hose running from the bottom to the player’s back.
- **Snowstorm stream (hold LMB):** continuous conical high-pressure snow stream, **12 m range**, **2.5 m end width**, dense white powder and glittering ice crystals.
- **Combat:** **28 damage/s** in the cone and a stacking cold slow up to **−50 % movement speed**.
- **Ice patches:** where the stream hits the ground, glittering pale-blue `IcePatch` zones last **5.0 s** (7.5 s in alpine weather). Enemies crossing lose 90 % ground friction (`0.10`) and slide with flailing cartoon arms.
- **Firefighter mechanic:** holding the stream on a **Stage 2 BURNING** building for **1.5 s** extinguishes it with white steam and saves it from collapse.
- **Elemental death — FREEZE:** a kill freezes the victim in their current pose inside a semi-transparent pale-blue ice block; their eyes roll in panic for **1.2 s**, then the block tips over and shatters into **15 glittering ice cubes**.

#### 2. Sand & Flame Thrower (`sand_flamer`)

- **Look:** improvised tiki/alpine burner made from a red propane tank, a brass burner tube with a pilot flame and a side-mounted sand blower funnel.
- **Primary (LMB — flame):** **10 m** flame cone, **32 damage/s** plus **8 damage/s** afterburn for **2.5 s**. Intact/damaged wooden houses/beach bars ignite after **1.2 s** of sustained fire (**Stage 2 BURNING**). Melts `IcePatch` immediately.
- **Secondary (RMB — sandstorm cloud, 8 s cooldown):** compact sandstorm pressure cloud, **4.5 m radius** for **3.5 s**; enemy vision is obscured by a dense yellow-brown overlay and their crosshair wobbles.
- **Elemental death — ASH:** a kill turns the victim into a stiff, pitch-black soot statue (`uCharredState = 1.0`), blinks twice with white cartoon eyes, then collapses into a small grey ash pile. Their intact hat drops onto it from above.

#### 3. Tell Crossbow / Harpoon Launcher (`crossbow`)

- **Look:** heavy medieval Swiss steel bow crossbow with wooden stock and a copper winch under the barrel; fires thick barbed bolts with an attached tow rope.
- **Bolt shot (LMB):** fast projectile, **55 m/s**, **55 damage**, **85 headshot**, **1.4 s** reload.
- **Clothing pin:** if the bolt hits an enemy standing less than **2.5 m** from a wall, tree or wooden fence, the enemy is pinned to it for **2.0 s** (cannot move, can still shoot).
- **Tow-rope / Tarzan swing:** hitting any vehicle (Badi Flamingo, Fondue/Coconut tank, motorcycle, cable car, even a taking-off biplane) locks a tow rope up to **18 m** and drags the shooter behind it like water-skiing/ski-joring (Space to release). Hitting the underside of the gorge bridge or a roof beam enables a pendulum swing across the abyss.

#### 4. Swiss Halberd / Boarding Trident (`halberd`)

- **Look:** 2.4 m polearm with an ash shaft and a polished steel crescent axe, spike and red tassel (alpine) or a golden sea trident with barnacle decoration (island).
- **Wide swing (LMB):** **75 damage** in a wide **110°** arc in front, **3.2 m** reach, **0.75 s** swing interval. Fells any tree/palm on the map in exactly **2 hits**.
- **Berserker charge (RMB, 9 s cooldown):** level the polearm forward and charge for **2.0 s** at **+60 % speed** with white comic speed lines; the first enemy hit takes **115 damage**.
- **Signature knockout:** every halberd kill forces **`HELMET_POP`** with a giant screen-filling “PLING!” comic effect, flying hat and a 360° victim pirouette.

#### 5. Bulletproof Storm Umbrella / Armoured Parasol (`umbrella`)

- **Look:** large domed umbrella with a walking-stick wooden handle and a reinforced steel spike tip; canopy in brown-gold Art Nouveau or bright rainbow/beach stripes.
- **Active on ground (hold LMB or RMB — riot shield):** holds the open umbrella as a frontal shield, absorbing **85 %** of all frontal bullet and explosion damage. Bullets bounce off with visible sparks and a bright “Pling-Plong!”.
- **Passive/active in air (hold Space in air — Mary Poppins glider):** opens above the head, slowing descent to **−2.2 m/s**. The player can fire their secondary weapon (pistol/shotgun) one-handed while gliding.

#### 6. Alphorn / Foghorn Sonic Cannon (`horn`)

- **Look:** portable 2.2 m wooden alphorn with carved birch decoration and a curved bell, plus a shoulder rest (or a thick brass ship’s foghorn with an air tank).
- **Charge and release (hold LMB for 0.6 s):** fires a visible expanding **3D sound-wave ring** (**10 m cone range**, **4.0 m end width**), **35 damage**, **3.5 s** cooldown.
- **Knockback and airblast reflection:** all enemies in the cone are launched **15 m away and 5 m up** — perfect for blasting opponents off the suspension bridge, cable-car roofs or harbour piers. If an enemy bazooka rocket, burning barrel, tank shell (cheese wheel/coconut) or grenade is flying toward the player at the moment of the blast, it is reflected **180° back to the sender** and changes ownership to the alphorn player.

### 12.4 Class skills (1 / 2 / 3)

| Class | Key 1 (14 s) | Key 2 (16 s) | Key 3 (12 s) |
| --- | --- | --- | --- |
| **Allrounder** | **Cryo / Incendiary Ammo:** 8 s of special ammo, +20 % weapon damage; alpine = blue frost slow, island = orange burn tick. | **Motivation Horn:** blow a small hand horn; all allies within 10 m instantly heal **+45 HP** and gain **+15 % movement speed** for 3 s. | **Blast Wave Grenade:** throw a thick cheese/coconut shard grenade, **75 damage**, **2.5 m** terrain crater, knocks enemies away. |
| **Heavy** | **Heroic Overcharge Shield:** drink hot raclette oil/chilli sauce; gain a glowing **+80 HP** overshield for 6 s. | **Explosive Barrel Toss:** lift a burning wooden barrel overhead and throw it forward; it rolls downhill, explodes on contact for **85 damage** and sets houses to **Stage 2**. | **Battering Sprint:** charge for 3.0 s at **+40 % speed** with a lowered shoulder; breaks damaged wooden walls and rams enemies for **50 damage + “BOING!” pinball launch**. |
| **Infiltrator** | **Stealth Cloak:** 8.0 s of **85 % transparent** wavy silhouette; ends early when firing a weapon. | **Binocular Spotting:** look through a wooden/brass binocular; mark all targeted enemies and vehicles with a red silhouette through walls for the whole team for 8.0 s. | **Bear Trap / Spike Clam Mine:** place a jagged iron alpine bear trap or giant spiked clam (max 2 active). Snaps on enemy contact for **45 damage** and holds the victim in place for **2.5 s**. |

### 12.5 Universal widgets (Q and E)

**Q — Self-Heal Snack (12 s cooldown)**

- Pull out a yellow holey Swiss cheese wedge or a coconut with a colourful umbrella straw.
- Eat/drink for **2.0 s** at 80 % movement speed.
- Regenerate **+50 HP over 3.0 s**.
- Instantly cleans all black soot and patches from the character model (`uBattleDamage → 0.0`).

**E (hold) — Cartoon Wrench & Air Pump (no cooldown)**

- A giant, shiny silver double-open-end wrench.
- **Vehicle repair:** hold E next to a friendly vehicle, or while riding in a motorcycle sidecar/biplane wing, to repair it at **35 HP/s** with “KLONK-KLONK!” sounds and sparks.
- **Bridge/pier rebuild (`ENV_BRIDGE_REPAIR`):** hold E for **3.0 s** at a destroyed gorge bridge or harbour pier segment to raise a comic dust cloud with 3D “TOCK! TOCK! BANG!” text and build a **provisional plank bridge (100 HP)**.

### 12.6 Combat feedback and VFX

- **3D comic onomatopoeia billboards** (`spawnComicTextVFX`) scale elastically from 0.2 to 1.3 in 0.12 s, wobble slightly and fade upward after 0.85 s:
  - **`PLING!`** (yellow-gold): headshots, halberd kills (`HELMET_POP`), umbrella ricochets.
  - **`BOING!`** (rainbow): collision knockback from Badi Flamingo, alpine cow, battering sprint, motorcycle roadkill or falling trees.
  - **`BOOM!`** (red-orange): Fondue/Coconut tank cannon, bazooka and cheese/coconut silo explosions.
  - **`TOCK! TOCK! BANG!`** (yellow-white): bridge and vehicle repairs with the wrench.
  - **`HUPEN! / HONK! HONK!`** (yellow): sidecar motorcycle horn.
  - **`AAAARGH!`** (turquoise-red): a player falling from the suspension bridge or cable-car roof into the gorge.
- **Kill cam:** on death, a **10-second live killer cam** — the camera smoothly follows the killer and shows what they are actually doing in the match, like *Battlefield Heroes*. A banner shows name, class, kill icon and remaining HP. If the killer wears the cuckoo-clock backpack, the wooden cuckoo pops out live. If the killer presses `T`, they perform their Schuhplattler or Hula taunt for the kill cam. After 10 seconds the player respawns at a random server-chosen spawn point.
- **Damage model:** hitscan for most guns with server rollback; physical projectiles for bazooka, tank shells, crossbow bolts and grenades. 500 ms rollback ring buffer (`lag-comp.ts`).

### 12.7 Combat scope decision

Combat shipped with M4 (authoritative fire, server hitbox rollback against a two-second lag history, skills, bots, kill feed, killer cam). The M5-Kern build adds vehicle weapons and rams (§13.8), hens as shootable critters, the untouchable drifter (shots pass through her) and the results ceasefire (§14.1). Weapon-driven destruction (craters, burning buildings, bridge damage) stays M6.

---

## 13. Vehicles, aircraft and map toys

This is the master reference for the vehicles and map toys of M5. The M5-Kern build implements the four drivable vehicles of §13.2–13.5 with the values in §13.8; the biplane and rowboats now also work, together with vehicle repair. Cable car, T-bar, coaster, hammock and NPC cow (§13.7) remain in progress.

### 13.1 The ten vehicles and map toys

| # | Vehicle / toy | Count | Spawn points and route |
| ---: | --- | ---: | --- |
| 1 | **Tactical Badi-Flamingo** | 3 | 1× island base, 1× Tower A main pier (`−165, 0, −175`), 1× east beach (`+60, 0, −210`). Amphibious; can slide far up the beach with the plug turbo. |
| 2 | **Armored Fondue Crawler** | 1–2 | 1× alpine base (`+290, 56, +285`), 1× on capturing Tower C (`+175, 52, +195`). Drives the 10 m serpentine tank road with two hairpins and a stone arch ramp east of the gorge to Tower B and the beach. |
| 3 | **Coconut Beach Tank** | 1–2 | 1× island base (`−285, 2.5, −280`), 1× beach in front of Tower A (`−130, 3, −140`). Rolls up the coastal sand ramp to Tower B and toward the summit. |
| 4 | **Rowboats** | 4 | Moored at the four wooden piers around Tower A and at the foot of the gorge waterfall (`−140, 0, +75`). |
| 5 | **Red Cable Car** | 2 gondolas, counter-running | Cable between beach-cliff valley station (`−110, 8, −95`), mid-support at the village edge (`+45, 28, +50`) and Tower C mountain station (`+195, 58, +210`). 22 s per leg. Emergency brake lever (`F`) at all three stations. |
| 6 | **T-Bar Ski Lift** | Endless loop, 8 bars | From the northeast village edge at Tower B (`+85, 19, +115`) steeply up to just below Tower C (`+185, 54, +195`). Players hook in with `F` at 11 m/s and can shoot freely during the ride. |
| 7 | **Alpine Coaster** | Endless dispenser (bobs at start) | Starts on Tower C’s east terrace (`+235, 55, +210`). Turquoise-silver stainless trough on support pillars, four steep banked curves down the eastern rock massif at 24 m/s, ending in a 45° jump ramp (`+110, 12, −140`) that catapults the bob over the beach into the lagoon. |
| 8 | **Sidecar Motorcycle** | 4 | 1× alpine base, 1× island base, 2× opposite each other at Tower B. Fits the wide tank road, the narrow suspension bridge and the harbour piers. |
| 9 | **Biplane** | 2 | 1× with floats on the water runway (`−330, 0.5, −180`), 1× with skis/wheels on the glacier airfield (`+280, 57, +150`). |
| 10 | **Hammock Catapult & Alpine Cow** | 1 each, fixed | Hammock between two thick coconut palms on the east beach (`+65, 3.5, −95`); catapults the player in a fixed ballistic arc onto the east side of Tower B (`+30, 18.5, −10`). Cow patrols the village square in front of the suspension bridge (`0, 18, +38`). |

### 13.2 Vehicle 1 — Tactical Badi-Flamingo

- **Look:** giant 3.8 m long, 2.6 m wide inflated pink flamingo with a glossy `VinylGlossShader`, white highlights, rubber weld seams, white water-splash decals on the wings and a thick white plug at the tail. Long curved neck with big googly eyes and a black-white-pink beak.
- **Seats:** 2. Seat 1 = pilot in the front ring with a small steering wheel. Seat 2 = gunner behind, operating a 360° harpoon machine gun mounted directly on the flamingo’s head/neck.
- **Amphibious:** glides on water at 12 m/s with a white bow wave; can slide short distances onto flat sand.
- **Zero collision damage, lethal “BOING!” pinball knockback:** indestructible rubber; ramming rocks, piers or other boats causes an elastic bounce and no structural damage. Hitting an enemy swimmer/beach walker or rowboat acts like a giant pinball bumper: **65–110 damage** depending on speed and a rainbow “BOING!” launch at 14 m/s.
- **Plug turbo (Shift, 7 s cooldown):** pulls the big white tail plug; a massive high-pressure air/water bubble jet accelerates to **2.5× speed (30 m/s)** for **2.5 s**. Can launch from the sea across the beach, through beach bars and through groups like bowling pins.
- **0 HP balloon zigzag flight:** at **450 vehicle HP**, it does not explode like metal; it throws the occupants and zooms away like a released, farting-whistling balloon in a wild 3D zigzag across the sky until it shrinks into the sea (20 s respawn).

### 13.3 Vehicle 2 — Armored Fondue Crawler

- **Look:** absurd cross between a bright-red Swiss snow groomer and a heavy cartoon tank, 4.6 m long, 3.0 m wide, **650 HP**. Wide sparking steel snow tracks, red armoured cab with armoured-glass slits, searchlights and a massive red-orange V-plow dozer blade. Yellow Swiss cheese wheels strapped to the sides as extra armour.
- **Fondue cauldron turret (360°):** instead of a normal turret, a giant red enamelled cast-iron fondue pot bubbles with glowing yellow cheese, including a giant wooden stirring spoon that turns while driving. The thick cannon barrel with a gold muzzle brake protrudes from the pot and drips liquid cheese.
- **Seats:** Seat 1 = driver and gunner, drives tracks at **9.5 m/s**, turns in place, fires the fondue main gun (LMB, one shot every **3.0 s**). Seat 2 = commander hatch beside the spoon, can fire 360° with their hand weapon or repair with E.
- **Main gun (`TANK_CANNON_FIRE`):** fires a glowing hot rotating giant cheese wheel at **42 m/s** with a huge “BOOM!” comic word. **85 direct + 50 splash** in a **5.0 m** radius, leaves a giant yellow cheese splat, digs a **3.5 m radius, 1.1 m deep** crater on snow/grass/sand, sets wooden houses to **Stage 2** and blast-launches killed infantry.
- **Dozer physics:** flattens trees/palms on contact and flings run-over enemies aside for **95–120 roadkill damage + “BOING!”**.

### 13.4 Vehicle 3 — Coconut Beach Tank

- **Look:** tropical counterpart to the Fondue tank, **650 HP**, identical hitbox and driving values for fair balance. Olive/jungle-green armoured half-track chassis with huge treaded rollers or wooden tracks, a woven bamboo ram grille at the front and large green camouflage palm fronds on the fenders (optional straw-roof cab shelter).
- **Giant coconut turret (360°):** a house-sized fibrous brown giant coconut as an armoured dome. The cannon is a thick green giant bamboo trunk wrapped in rope. A round cut-out coconut lid with a white flesh rim sits on top and opens when Seat 2 enters.
- **Seats:** Seat 1 = driver and gunner, 9.5 m/s, fires the bamboo-coconut mortar (LMB, one shot every 3.0 s). Seat 2 = coconut-hatch gunner, fires 360° from the open dome or repairs with E.
- **Main gun:** fires a massive armoured giant coconut cannonball at **42 m/s** with a dull “THUMP-BOOM!”. Same damage and physics as the Fondue tank (**85 direct / 50 splash**). Impacts raise an **8 m sand fountain**, dig a **3.5 m radius, 1.1 m deep** trench crater, set alpine chalets to **Stage 2** and destroy bridge segments in 2 hits.

### 13.5 Vehicle 4 — Sidecar Motorcycle

- **Look:** classic 1930s combination, **280 HP**. Powerful copper-orange or cream-white retro machine with a round chrome headlight, spoked wheels, curved fender, loud twin exhaust and a right-mounted sidecar of riveted metal with a solid oak rim.
- **Seat 1 — driver:** high speed (**19 m/s**), sharp drift physics in corners (Space + A/D), horn (`H` → yellow “HUPEN! HONK! HONK!” 3D comic text over the handlebars) and roadkill ram (**75–120 damage + “BOING!” launch**). Fits the narrow gorge suspension bridge and harbour piers.
- **Seat 2 — sidecar passenger with `V` first-person camera:** can turn 360° and fire all personal weapons, or use the wrench (`E`) on the sidecar rim to repair the motorcycle live during a chase. The `V` camera shows the riveted wood/metal edge below, the player’s cartoon hands with wrench or weapon, and the driver beside them.

### 13.6 Vehicle 5 — Biplane

- **Look:** charming light-blue/white 1930s biplane, **320 HP**, two stacked wings with struts, open tandem cockpit, spinning front propeller with radial engine, and combined float-skis (pontoons with wheels) so it can start and land on the lagoon and the glacier strip.
- **Seats and wing mounts:** Seat 1 = pilot in the cockpit, intuitive arcade flight (W/S throttle 14–28 m/s, mouse pitch/roll, A/D rudder) plus a forward-firing synchronized twin MG (LMB, 500 RPM, 15 damage). Seats 2 and 3 = wing-riders on the left and right upper wings, up to two players who climb on with `F` (`WingMountSocket_L` / `WingMountSocket_R`). They stand/kneel like stuntmen in the wind, have free fields of fire downward and sideways (ideal for bazooka bombing or sniper trick shots) and can repair the plane mid-turn with E. Jumping off with Space lets them deploy the Mary Poppins umbrella and land softly behind enemy lines.
- **Deadly front-propeller shredder:** any enemy soldier touching the spinning propeller disc on the nose — on the ground, in water or in the air — is instantly launched across half the map with a deafening “BOING-WHACK!” and **`BLAST_LAUNCH`** (fully soot-blackened, boots and hat flying off). No blood.

### 13.7 Vehicles and toys 6–10

**6. Red Cable Car**

- Two bright-red panoramic gondolas with a white star emblem shuttle on a cable between the beach cliff, the village support and Tower C.
- Inside the cabin you are protected from shots from below; on the roof you have a 360° field of fire.
- **Turbo / emergency brake lever (`F` at the three stations or shooting the red lever on the support pylon):** triggers a screeching steel braking manoeuvre and violent fore/aft rocking. Every player on the gondola roof who is **not crouched** (`Ctrl`/`C`) at that moment loses their grip and falls into the deep gorge with an “AAAARGH!”.

**7. T-Bar Ski Lift**

- Pulls players on T-shaped wooden bars at **11 m/s** up the steep snow slope from Tower B to Tower C. The soldier holds the bar with one hand and can fire freely with the other. If killed on the lift, their physics ragdoll is dragged comically through the snow for **2.0 s** before releasing.

**8. Alpine Coaster / Water Slide**

- A **24 m/s** turquoise-silver stainless trough on tall support pillars from Tower C down to the coast. Players enter small colourful single-seat bobs (pink, yellow, purple, blue) with `F`, race through four steep banked curves with free shooting, and launch off a **45° jump ramp** in a wide flight over the beach.

**9. Rowboat**

- Classic brown wooden rowboats, **200 HP**, at the Tower A harbour piers. One player rows at **8 m/s**. If **2 players** sit in the boat and press W in sync with the displayed rhythm indicator (every **0.8 s**), the **sync sprint (16 m/s)** triggers with a white wake trail.

**10. Hammock Catapult & the Angry Alpine Cow**

- **Beach hammock:** lie in the giant red-yellow-green hammock between the two palms on the east beach with `F`; it tensions backward for **1.5 s** like a slingshot and fires the player in a high arc directly onto Tower B.
- **The Angry Alpine Cow:** an invulnerable, stocky brown-and-white Swiss cow with horned head, angrily knitted brows and a giant golden cowbell on the village square in front of the suspension bridge. If anyone honks (`H`) within **15 m**, shoots it or causes an explosion nearby, its head flashes red and it gallops for **8.0 s** at **18 m/s** in a zigzag across the bridge and square. Every player hit — regardless of team — takes **90 damage** and flies into the gorge with “BOING!” and loud cowbell clatter.

### 13.8 Vehicle system decisions

Implemented in the M5-Kern build (data in `packages/shared/src/config/vehicles.ts`, shared motor `packages/shared/src/physics/vehicle.ts`, server `apps/server/src/rooms/vehicle-manager.ts`, client `apps/client/src/engine/vehicle-client.ts`):

- **Authority:** kinematic Rapier hulls simulated by the server with the shared vehicle motor; remote vehicles are interpolated, the local driver predicts with the same motor. Health, seats, turret aim, boost and wrecks are server-owned; vehicles travel in a snapshot block (protocol 10, with conditional signed pitch/bank for aircraft).
- **Controls:** enter / exit with `F` within 2.4 m of the hull (E stays the class skill); switch seat with `C` (a tap; there is no F1/F2 seat key, F1 stays the telemetry); horn with `H` (on the Heal bit, 0.9 s cooldown, comic “HONK! HONK!”); `LMB` fires the vehicle gun, aimed with the mouse; `Shift` fires the Badi-Flamingo’s plug turbo (only afloat); `Space` is the Sidecar’s handbrake drift. Boarding swings the camera behind the hull.
- **Who may ride:** only armed, damageable classes (`classMayUseVehicles`): mascots and drifters cannot board, and switching a seated player to one of them frees the seat. Base vehicles are reserved for their faction; map vehicles are open to everyone, but a crewed vehicle only takes its crew’s team.

| Vehicle | HP | Top speed | Seats | Weapon | Respawn |
| --- | ---: | --- | --- | --- | ---: |
| Fondue Crawler | 650 | 9.5 m/s, reverse 4.5 | driver & cheese cannon (inside) · commander in the pot (own weapons) | cannon 85 direct + 50 splash in 5 m, 3 s, 42 m/s | 30 s |
| Coconut Beach Tank | 650 | 9.5 m/s, reverse 4.5 | driver & coconut mortar (inside) · coconut-hatch gunner (own weapons) | mortar, same values | 30 s |
| Tactical Badi-Flamingo | 450 | 12 m/s; plug turbo 2.5× for 2.5 s, 7 s cooldown | pilot · harpoon gunner | harpoon gun 28 per hit, automatic, 85 m/s | 20 s |
| Sidecar Motorcycle | 280 | 19 m/s, reverse 5 | driver · sidecar passenger (own weapons) | — | 15 s |

- **Rams:** run-overs deal Fondue/Coconut 95–120, Flamingo “BOING!” 65–110, Sidecar 75–120 by speed, with a launch. Bullets do reduced damage to hulls (tanks 25 %, boat 50 %, sidecar 60 %); explosives full. A destroyed vehicle blasts 55 damage in 6 m and ejects its crew; the flamingo zooms off as a deflating balloon.
- **Spawns (data, `FJORD_VEHICLE_SPAWNS`):** Lagoon base flamingo, coconut tank and sidecar; Peak Guard base crawler and sidecar; two map flamingos (harbour pier, east beach) and two map sidecars (village east and west). **Capture-gated:** the forward Fondue Crawler at Tower C spawns only while Peak Guard holds Tower C, the forward Coconut Tank at the harbour beach only while the Lagoon League holds Tower A; an unused one parked at its pad leaves when the tower falls. A round reset empties every seat first, then respawns all vehicles at their start positions.
- **Boats:** float on the water, slide up gentle beaches and can reverse or rudder off while water is still under the hull. An empty, beached boat deflates after 10 s. An empty vehicle more than 25 m from its spawn is towed back after 75 s.
- **Not built yet:** vehicle repair (the wrench), craters and burning buildings from vehicle shells (M6), the sidecar passenger’s first-person `V` camera, and vehicles 5–10 (§13.6–13.7). Known: a boat driven fully onto dry sand stays stuck while crewed; the coaster start deck intrudes ~2.5 m into the serpentine tank road.

---

## 14. Match flow and game mode

### 14.1 Mode: 8v8 Climate Conquest

Implemented in the M5-Kern build: numbers in `CONQUEST_RULES` (`packages/shared/src/config/conquest.ts`), simulation in integer units per fixed tick in `apps/server/src/rooms/conquest.ts`, so a round replays bit-identically. Two teams of up to 8 (`TEAM_SIZE`); four named AI bots play the towers.

- **50 tickets** per team.
- **Zone:** 16 m radius, from 4.5 m below to 16 m above the tower; living, capture-capable players count (not the drifter), except while spawn-protected.
- The side with more players inside moves the control; equal numbers stall (contested).
- **Capture** neutral → owned: **8 / 6 / 4 s** at an advantage of 1 / 2 / 3+.
- **Neutralise** owned → neutral (also undoing a rival’s partial capture): **4 / 3 / 2 s**. A full enemy flip therefore takes 12 / 9 / 6 s.
- An empty zone drifts back to its owner (or to neutral) over **24 s**.
- Each death costs the victim’s team **1 ticket**.
- The team holding fewer towers loses **1 ticket every 6 s per tower of deficit** (every 3 s at a deficit of 2, every 2 s at 3).
- **Weather:** ±0.015/s per held tower (net: Lagoon League towers push toward +1, Peak Guard towers toward −1), clamped to ±1, reset to 0 each round.
- The round ends when a team reaches **0 tickets** (both in the same tick = draw) or after **20:00** (more tickets wins; equal = draw).
- Then a **15 s results ceasefire:** no damage, captures or tickets; hulls, rams and hens hold fire too (`MatchRoom.isCeasefire()`).
- **Reset:** 50 : 50 tickets; A Lagoon League, C Peak Guard, B neutral; weather 0; everyone respawns with K/D 0 (drifter support points too); vehicles reset first; shots and puddles in flight vanish.
- HUD: tower badges and round clock on the clock medallion, the capture bar inside a zone, tower feed lines and “TOWER TAKEN!” / “TOWER LOST!” pops, the results banner with the next-round countdown and the Tab scoreboard (kills, deaths, support).

### 14.2 Round flow

1. **Boot / login:** load renderer, world and network; show cover-inspired start screen.
2. **Matchmaking:** one-click “Play Now” joins an open 8v8 round (later fills with bots).
3. **Spawn:** random protected spawn at a held tower, or faction base if none held.
4. **Live round:** movement, capture, combat, vehicles, destruction, weather.
5. **Death:** 10.0 s live killer cam showing what the killer is currently doing, then a random server-chosen respawn.
6. **Victory:** winner podium cinematic in the map centre, top three scorers of the winning team on the steps, confetti, golden talers and palm leaves.
7. **Scoreboard:** kills, deaths, tower captures, bridge repairs, earned Alpen-Taler / Resort Crowns.
8. **Next match / return to menu.**

In the M5-Kern build steps 6–8 are the 15 s results banner (winner, reason, tickets, next-round countdown) followed by an automatic reset into the next round on the same server; the podium, rewards and end-of-match scoreboard remain M7 work. The live Tab scoreboard (kills, deaths, support) exists already.

### 14.3 End screen decisions

- The podium is a cinematic 3D scene, not a static image.
- The top three players of the winning team stand in full 7-slot outfits and perform automatic triumph poses (yodelling, flexing, air guitar on their weapon).
- The losing team is visible small on the ground in the background, some performing ash or ice-block slapstick deaths.
- Statistics table is semi-transparent cartoon UI.
- Buttons: **Next Match**, **Rewarded Ad / 2× Taler** (free users), **Return to Menu**.
- End screen and podium are later-milestone work.

---

## 15. UI, screens and flow

### 15.1 Design language

- Hard comic outlines, rounded cartoon plates, bold stamp/display typography.
- Alpine blue/white meets tropical turquoise/pink.
- Immediate reactive feedback; hover and click sounds; no latency.
- Every menu is usable with mouse and keyboard; pointer lock is only for gameplay.
- All copy is localised.

### 15.2 Start / login screen (`MainMenu.svelte`)

**Background and 3D stage**

- A dynamic Babylon.js panorama of Fjord Fiesta: snowy alpine peaks with a rotating cable car on one side, sunny South Sea lagoon with palms and lighthouse on the other.
- A lone, gracefully rotating character in their current 7-slot outfit stands on a wooden/snow podium in the foreground.
- A gentle global weather effect sprinkles light snowflakes and sun sparks over the screen.

**Logo and title**

- Top centre: the game logo in bold, slightly tilted 3D comic letters with a white-pink gradient and ice-crystal accents: **“FROST & FLAMINGOS”**.
- Below: the subtitle in yellow stamp lettering: *“Bullets, Fondue & Coconuts / Blei, Fondue & Kokosnüsse”*.

**Main menu buttons**

- **PLAY NOW / JETZT SPIELEN:** one-click matchmaking into an open 8v8 round.
- **WARDROBE & ARMORY / KLEIDERSCHRANK & LAGER:** opens the 7-slot character editor and weapon storage.
- **THE ARMORY RENTAL / WAFFEN-LEIHHAUS:** opens the Slot-3 rental shop and All-Inclusive pack.
- **RESORT VIP CLUB / KUR-PASS:** opens the VIP subscription modal and custom/private lobby creator.
- **SETTINGS / EINSTELLUNGEN:** graphics quality (WebGPU/WebGL2), master/FX/voice volume and controls.

**Language switcher**

- Compact top-right `[ EN | DE ]` switch; changes the entire dictionary live without reloading.

**Current M2 direction**

- The menu is being rebuilt around the supplied cover art: a split alpine/lagoon composition, icy-pink bold title, character stage on the right, menu stack on the left.
- The wardrobe is the primary M2 entry; armory/VIP entries can be visible but gated as “Soon” until their milestones.
- The connection status, server info, profile card and controls remain available without cluttering the cover composition.

### 15.3 Loading screen (`LoadingScreen.svelte`)

- Full-screen deep-blue cartoon background with stylised mountain silhouettes and palms along the bottom.
- Centre: a large golden **resort crown / alpine taler** spinning as the loading animation.
- Random slapstick loading tips in the current UI language, e.g.:
  - “Did you know? The snow cannon doesn’t just extinguish burning chalets — it freezes opponents into ice cubes!”
  - “Beware the alpine cow on the village bridge! Don’t honk unless you want to fly.”
  - “Press F to board the Tactical Badi-Flamingo — mind the plug turbo!”
- Thick yellow-black striped construction progress bar labelled “Loading bullets, fondue & coconuts (0–100 %)…”.
- Steps: renderer, world, network. Renderer label shows WebGPU or WebGL2.
- The current M1 loading screen is being redesigned to this cover-inspired look.

### 15.4 HUD (`Hud.svelte`)

**Action-cartoon HUD layout**

- **Bottom centre — compact status bar:**
  - Left: green HP bar with red heart icon.
  - Centre: **ticket counter** (`50 VS 48`) in two coloured boxes (blue for Peak Guard, coral for Lagoon League).
  - Right: **weather/climate bar** (`weatherBalance`) with snowflake/sun-star indicator.
- **Bottom right — four coloured action slots 1–4:**
  - Rounded square cartoon icons with key numbers (`1`, `2`, `3`, `4` + cooldown overlay) for weapon slots, active class skills and widgets (`Q`/`E`).
- Crosshair centre.
- Top-left: faction, class, health, zone.
- Top-right: connection, ping, player count, FPS.
- Bottom-left: zone, renderer.
- Current M1 HUD shows “Training / M1” and a no-combat note; it is being updated for classes, loadout slots and movement states.

### 15.5 Death screen and kill cam (`DeathScreen.svelte`)

- On death: a brief red screen-edge pulse, then a **10-second live killer cam** that follows the killer and shows their current actions in real time.
- Top banner: **“ELIMINATED BY / ERLEDIGT VON: [player name]”** with class, kill icon (bazooka, snow cannon, halberd, etc.) and the killer’s remaining HP.
- Slapstick highlight: the killer is visible live; the cuckoo-clock backpack can pop its wooden bird; pressing `T` performs the Schuhplattler or Hula taunt for the kill cam.
- Bottom: large circular timer **“Respawning in 10… 9… 8…”**. After it expires, the player respawns automatically at a random server-chosen spawn point.
- Death screen and killer cam are later-milestone work.

### 15.6 End screen and winner podium (`EndScreen.svelte`)

- Camera sweeps to a grand podium in the map centre.
- Top three scorers of the winning team stand on the steps in full 7-slot outfits, performing triumph poses while confetti, golden talers and palm leaves rain down.
- Losing team visible small in the background, some in ash/ice-block slapstick deaths.
- Semi-transparent cartoon statistics table: kills, deaths, tower captures, bridge repairs, earned Alpen-Taler / Resort Crowns.
- Buttons: **NEXT MATCH**, **REWARDED AD / 2× TALER**, **RETURN TO MENU**.
- Later-milestone work.

### 15.7 Wardrobe (`Wardrobe.svelte`)

- Live 3D character editor with all sliders, seven slot carousels and a rotating alpine/beach podium.
- Class and faction selectors; body type 0.0–1.0; 12 skin tones; 8 hair colours including ginger-orange; hairstyle carousel 0–6; voice pitch 0.8–1.25.
- Seven dropdown/carousel slots: `HEADGEAR`, `FACE`, `TORSO`, `BACK`, `HANDS`, `LEGS`, `FEET`.
- Loadout selectors for primary, secondary and gimmick.
- Voice preview, test effects, randomise, reset, save/apply.
- Accessible from the main menu and the pause menu.
- In progress for M2.

### 15.8 Armory rental (`ArmoryShop.svelte`)

- Shows all six Slot-3 gimmick weapons: snow cannon, sand/flame thrower, crossbow, halberd, umbrella, alphorn.
- Rent for **150 talers for 3 days**, buy permanently for **1200 talers**, or unlock the **All-Inclusive Arsenal Pack for 14.90 CHF**.
- Later-milestone/meta work; no real payment integration in the playtest.

### 15.9 VIP modal and custom lobby (`VipModal.svelte`)

- **4.90 CHF/month** Kur-Pass/VIP.
- Unlocks: no ads, all six character slots, 1000 talers/month, gold VIP outfit.
- **Custom Lobby Creator:** VIP players create a private room, share a room code, set ticket count (e.g. 100) and bot count.
- Later-milestone/meta work.

### 15.10 Inter-match ad and rewarded overlay (`AdOverlay.svelte`)

- 10-second inter-match spot between rounds for free users, skippable by VIP.
- Voluntary rewarded buttons to double round talers.
- Later-milestone/meta work; no real ad network in the playtest.

### 15.11 Settings

- Graphics: WebGPU/WebGL2 preference, quality level, render scale.
- Audio: master, SFX, music/ambience, voice.
- Controls: rebinding and a read-only field manual.
- Language: EN/DE.
- Settings persist locally.
- The settings surface is part of the M2/M3 UI polish; the current language switcher already persists.

### 15.12 UI scope decision

M2 implements the start screen, loading screen, wardrobe, HUD refresh, pause/controls and settings shell. Armory shop, VIP, ads, death screen, end screen and podium are **later milestone** UI. They may appear as disabled “Soon” entries, but must not ship as fake functional screens.

---

## 16. Audio design

### 16.1 Hard rule

**Zero external audio files.** No `.mp3`, `.wav`, `.ogg` or sample libraries. Everything is synthesised at runtime with the Web Audio API in:

- `apps/client/src/audio/synth.ts`
- `apps/client/src/audio/gibberish.ts`

### 16.2 Audio graph

```
sources → sfxGain ─────┐
sources → vehicleGain ─┤
sources → voiceGain ───┼→ masterGain → limiter (DynamicsCompressor) → destination
sources → ambienceGain ┘
```

- **Master limiter:** `DynamicsCompressorNode` with a high ratio (≈20:1), fast attack (≈3 ms), moderate release (≈250 ms), threshold around −6 dB, to prevent clipping when many slapstick sounds overlap.
- **Four buses:** `sfxGain`, `vehicleGain`, `voiceGain`, `ambienceGain`.
- **3D positional audio:** `PannerNode` with HRTF panning, inverse distance model, ref distance and max distance tuned per sound. Listener position/orientation follows the camera.
- **Autoplay policy:** the `AudioContext` starts suspended and resumes on the first user gesture (click/keydown). No sound before interaction.
- **Volume settings:** master, SFX, music/ambience and voice, persisted locally.

### 16.3 Sound content

**UI**

- Soft click, bright confirm, hover tick, back/cancel, error buzz.
- Wardrobe carousel tick, equip “pop”, randomise shuffle, reset chime.
- Voice preview gibberish.

**Movement**

- Footsteps per surface: sand “shff-shff”, grass/earth crunch, snow crunch, cobblestone clack, wood “tock-tock”, rock scrape, water splash, ice skid.
- Jump whoosh, landing thud, roll whoosh/fabric flap, swim stroke and splash, deep-water entry plunge.
- Sprint breathing and wind (subtle, optional).

**Comedy / combat (later)**

- Snow cannon hiss and ice crackle.
- Flamethrower roar and afterburn crackle.
- Bazooka launch whoosh and explosion boom.
- Tank cannon “BOOM!”, cheese splat, coconut thump.
- Crossbow twang, bolt thunk, rope reel.
- Halberd whoosh and “PLING!”.
- Umbrella ricochet “Pling-Plong!”.
- Alphorn blast and sound-wave ring.
- Cowbell clatter and cow rampage.
- Comic text pops: “BOING!”, “PLING!”, “TOCK! TOCK! BANG!”, “HUPEN!”, “AAAARGH!”.
- Freeze crystal shatter, ash “Puff!”, blast-launch whistle.

**Ambience**

- Alpine wind, distant cable-car hum, village chatter, waterfall, lagoon waves, gulls, palm rustle.
- Weather-driven mix: blizzard wind vs tropical insects/heat shimmer.
- Menu ambience is calmer; gameplay ambience is dynamic.

**Music**

- Fully procedural, no samples.
- **Menu theme:** warm, slightly goofy alpine waltz crossed with a lazy tropical steel-drum feel; plucked lead, soft pad, brushed percussion.
- **Gameplay theme:** faster, percussion-driven, with layered tension based on ticket/weather state.
- **Victory/defeat stingers:** short procedural brass/ukulele flourishes.
- Music must duck under voice and important SFX.

### 16.4 Gibberish voice

- `gibberish.ts` synthesises short cartoon babble from formant-like oscillator bursts, pitch contour and consonant noise.
- Voice pitch parameter `0.8–1.25` shifts the base frequency and formant centres.
- Used for the wardrobe voice preview, future taunts, effort grunts and kill-cam reactions.
- It must sound like a language without being one; no recorded words.

### 16.5 Audio scope decision

M2 implements the audio engine, buses, limiter, 3D panner, footsteps, swim/jump/land/roll, UI sounds, menu/gameplay music, ambience, voice preview and wardrobe feedback. Combat/vehicle sounds are added with their milestones. The audio system must remain fully procedural forever.

---

## 17. Networking and protocol

### 17.1 Transport

- Binary WebSocket at `WS_PATH` (`/ws`).
- No JSON on the gameplay socket.
- The HTTP server exposes `/api/health` and `/api/config` for status and protocol metadata.
- The client automatically reconnects with exponential backoff.
- Close codes: `4002` protocol mismatch, `4004` server full, `4001` handshake timeout, `4003` malformed handshake, `4005` duplicate join.

### 17.2 Protocol version

**Current version: 13** (`PROTOCOL_VERSION` in `packages/shared/src/constants.ts`).

- 2: HELLO/WELCOME carry full profiles instead of `displayName`/`faction`/`classId`.
- 7: ambient critter trailer in the snapshot and the `CRITTER_KILLED` event (3H).
- 8: drifter class (`CLASS_CODE` 4), aura status bits and a uint16 support score per snapshot player (3G).
- 9: vehicle block in the snapshot (between the players and the critter trailer) and the `VEHICLE_*` events (4V); the Climate Conquest block after the critter trailer, `spawnYaw` in Welcome and the `PROFILE_NOTICE` event (4T). Game event codes are unique across all packages (`apps/server/test/event-codes.test.ts`); the merged snapshot has round-trip codec tests.
- 10: conditional aircraft pitch/bank in vehicle snapshots and shared flight poses.
- 11: append-only cable-car kind, roof crouch flag and cabin/brake events.
- 12: revised gorge terrain, chalet, bridge sag and fence colliders. The binary layout is unchanged, but both ends must use the same static map for prediction and collision.
- 13: append-only `torso_field_vest` code 8; old torso codes 0–7 remain stable. Matching versions are required to decode the new wardrobe choice.

Any packet layout change requires a `PROTOCOL_VERSION` bump and matching encode/decode changes on both sides.

### 17.3 Opcodes

| Opcode | Value | Direction | Purpose |
| --- | ---: | --- | --- |
| `C2S_INPUT` | `0x01` | client → server | Input frame. |
| `S2C_WORLD_SNAPSHOT` | `0x02` | server → client | World state snapshot. |
| `C2S_FIRE_WEAPON` | `0x03` | client → server | Fire intent (accepted and ignored until combat). |
| `S2C_GAME_EVENT` | `0x04` | server → client | Gameplay event. |
| `S2C_MAP_STATE_SYNC` | `0x05` | server → client | Late-join destructible/crater state. |
| `C2S_HELLO` | `0x06` | client → server | Handshake + full profile. |
| `S2C_WELCOME` | `0x07` | server → client | Player id, profile, tick, spawn, protocol. |
| `C2S_PING` | `0x08` | client → server | Ping with client timestamp. |
| `S2C_PONG` | `0x09` | server → client | Pong with server tick. |
| `S2C_PROFILE` | `0x0a` | server → client | Authoritative profile broadcast. |
| `C2S_PROFILE_UPDATE` | `0x0b` | client → server | Cosmetic/class/loadout update. |

### 17.4 Profile wire layout

`writeProfile` / `readProfile` encode:

1. Display name (string, max 32 bytes on the wire; sanitised to 24 characters).
2. Faction code (0 = alpine, 1 = lagoon).
3. Class code (0 = allrounder, 1 = heavy, 2 = infiltrator, 3 = mascot, 4 = drifter).
4. `bodyType` quantised to 8 bits (`*255`).
5. Skin tone index (8 bits).
6. Hair colour index (8 bits).
7. Hair style index (8 bits).
8. Headgear table code (8 bits).
9. Face table code (8 bits).
10. Torso table code (8 bits).
11. Back table code (8 bits).
12. Hands table code (8 bits).
13. Legs table code (8 bits).
14. Feet table code (8 bits).
15. Voice pitch quantised to 8 bits (`*100`).
16. Primary weapon table code (8 bits).
17. Secondary weapon table code (8 bits).
18. Gimmick weapon table code (8 bits).

Invalid enum values are rejected by the decoder and replaced with class defaults by `normalizeCosmetics` / `normalizeLoadout`.

### 17.5 Snapshots

Snapshots carry:

- Server tick.
- `weatherBalance` (quantised signed byte).
- Tickets for both factions.
- Turret/capture states.
- Players: id, faction, class, position, velocity, yaw, HP, max HP, grounded/alive/crouched/swimming/sprinting/rolling flags, last processed input.
- Vehicles (protocol 9): one block per active vehicle (kind, pose, health, seats, aim, flags).
- Critters (protocol 7) and the Climate Conquest block (protocol 9: tower owners, control, push and contest state, round phase, winner, timer).

### 17.6 Server rules

- The server validates and normalises every profile.
- The server assigns faction.
- The server owns HP, class rebuild and respawn.
- Profile updates are rate-limited to one per **120 ms**.
- Display names are sanitised: control characters removed, trimmed, max **24 characters**, fallback `Vacationer <id>`.
- A class change rebuilds the capsule at the same feet position, restores full class HP and clears the input queue.
- Deep water is swim mode; only `Y < −12` respawns.
- The server simulates at 60 Hz even when idle, so the tick counter stays consistent.

### 17.7 Client prediction

- `RECONCILE_THRESHOLD = 0.12 m`: small errors are ignored.
- `HARD_SNAP_THRESHOLD = 2.4 m`: hard errors clear pending inputs and snap the camera.
- `MAX_PREDICTION_REPLAY = 24` input frames.
- `MAX_INPUT_BACKLOG = 6` on the server; older inputs are dropped.
- Remote interpolation delay ≈ **110 ms**, history of **40** snapshots, remote timeout **1600 ms**.
- Snapshots are received at 30 Hz; the local simulation runs at 60 Hz.

---

## 18. Persistence and profile ownership

### 18.1 Client persistence

| Key | Contents |
| --- | --- |
| `frost-and-flamingos.profile` | Full `PlayerProfile` JSON: display name, faction preference, cosmetics, loadout. |
| `frost-and-flamingos.locale` | `en` or `de`. |

- The profile is normalised on load; corrupted or partial data falls back to a generated default profile with a random callsign.
- The profile is saved on every store change.
- Hardened browser profiles that block storage still work for the session.
- The server is authoritative for the profile during a match; the client applies the server profile after welcome and after `S2C_PROFILE`.

### 18.2 Profile ownership decision

- There are **no accounts** in the current playtest. The profile is device-local and sent on connect.
- The server treats the client profile as a *request*, not as truth. It validates, sanitises and may override faction.
- Cosmetic ownership, currency, rentals and progression are not implemented. The current wardrobe exposes all items for playtesting.
- When accounts/meta arrive, the server must own entitlement and currency; the client profile remains a cache.

---

## 19. Localisation contract

- **English is the master dictionary.** `packages/shared/src/i18n/locales/en.ts` defines the exact shape.
- **German is typed against English.** `de.ts` is `TranslationDictionary`, so a missing, extra or stale key is a TypeScript error.
- **No hardcoded user-facing or gameplay strings.** UI labels, notifications, errors, control labels, zone names, class names, cosmetic names, weapon names, loading tips and HUD copy all live in the dictionaries.
- Use the `t` store / `$t('key')` pattern in Svelte.
- Interpolation uses `{name}` placeholders.
- The language switcher changes the entire UI live and persists to `localStorage`.
- `TranslationKey` is a strongly typed dot-path union derived from the English dictionary.
- Do not use English text as a lookup key.
- New M2 keys needed include:
  - Class names per faction.
  - Wardrobe title, tabs, sliders, slot labels, every cosmetic item label, randomise/reset, voice preview, test effects.
  - Loadout labels and every weapon name.
  - Movement states: crouched, sprinting, swimming, rolling.
  - Audio/settings labels and volume names.
  - Loading tips and cover-menu copy.
  - Controls: crouch, roll, weapon slots, skills, heal, wrench, interact, taunt, zoom.
- German must use natural game language, not literal word-for-word translation. Examples: “Gipfel-Garde”, “Lagunen-Liga”, “Kleiderschrank & Lager”, “Kur-Pass”, “Alpen-Taler”.

---

## 20. Art direction and rendering

### 20.1 Visual pillars

1. **Toy-like action cartoon.** Chunky shapes, exaggerated proportions, readable silhouettes.
2. **Hard comic outlines.** Toon bands, strong rim light, dark contour accents where possible.
3. **Split climate palette.** Icy alpine blue/white/red against tropical turquoise/pink/coral/yellow.
4. **Material storytelling.** Snow, wet sand, cobblestone, wood, rock, ice and water must be distinguishable by colour and footstep sound.
5. **Slapstick readability.** Comic text, freeze blocks, ash statues and blast launches must read instantly.

### 20.2 Shaders

- **Toon shader:** shared map/character cel lighting with discrete diffuse bands, sky bounce, rim light and distance fog. GLSL and WGSL.
- **Water shader:** depth-based colour, foam near shore, animated ripples, sky reflection tint. Transparent.
- **Sky shader:** gradient zenith/horizon, sun disc/glow, time animation.
- **Character shader:** toon lighting plus skin mask, skin tone uniform, battle damage, charred and frozen states. Output is opaque.
- **Future shaders:** vinyl gloss for inflatables, weather particles, destruction decals, comic text billboards.

### 20.3 Character rendering decisions

- Five draw calls per character (body, two arms, two legs) plus shadow.
- One material per character; do not share skin tone across players.
- Merge static cosmetic parts; keep arms/legs separate for animation.
- Use low-poly primitives and vertex colours; no texture atlases.
- Shadow is a soft dark disc, not a real-time shadow map.

### 20.4 Map rendering decisions

- Terrain is a single vertex-coloured ground mesh generated from the shared height function.
- Water is a separate transparent ground mesh with depth-based vertex data.
- Props are merged per building or thin-instanced for repeated trees/rocks.
- Distant mountains are low-poly cones outside the playable area.
- Sky is an infinite-distance sphere.
- Keep draw calls low; the map should remain readable on integrated GPUs.

### 20.5 Cover-inspired start screen

- The start screen adapts the supplied cover composition: split alpine/lagoon panorama, bold icy-pink **FROST & FLAMINGOS** title, character stage, playful subtitle.
- It must be original CSS/SVG/3D composition, not a copy of the reference image.
- The 3D character preview uses the real rig and current outfit.
- The menu must still be readable at 1280×720 and on narrow windows.

---

## 21. Performance budgets and constraints

### 21.1 Targets

- 60 FPS gameplay on a modern integrated GPU at 1280×720–1440×900.
- 30 Hz snapshots, 60 Hz physics; no frame-time-dependent gameplay.
- Character draw calls: ≤6 per avatar.
- Map draw calls: keep merged/thin-instanced; avoid per-prop materials.
- Shader compilation: first load may take a moment; show progress and tips.
- WebGPU preferred; WebGL2 fallback must render the same content.

### 21.2 Constraints

- Strict TypeScript, no implicit `any`, no `@ts-ignore`.
- `noUncheckedIndexedAccess` is expected in shared code (verify per tsconfig).
- Reuse shared types, protocol reader/writer, mesh helpers and labels before adding new ones.
- No core-mechanic TODOs. Deferred systems are documented and gated, not stubbed.
- Client/server boundary: UI components do not touch Babylon or Rapier.
- Do not add future-milestone systems early.
- Keep `CLAUDE.md` and `BEDIENUNGSANLEITUNG.md` current.

### 21.3 Browser/environment notes

- Server binds `127.0.0.1` by default; it is a local playtest server.
- `scripts/dev.ts` uses `import.meta.dir` because the repository path contains spaces.
- If ports are stuck, run `bun run stop`.
- Rapier’s deprecation notice about initialization parameters is expected and harmless.
- Headless Chrome screenshots may need `--headless=new --remote-debugging-port=9223 --use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader` for WebGL2.
- Browser screenshots can fail when the desktop window is hidden.

---

## 22. Milestones and scope gates

### M1 — Movement & World (complete)

Playable third-person multiplayer movement prototype: map, physics, prediction, remote players, camera, HUD, menus, i18n, docs.

### M2 — Classes, Wardrobe & Identity (complete)

Classes, persistent profiles, loadouts, wardrobe/cosmetics, server profile sync, full character rig, movement expansion (crouch/roll/swim/mantle), procedural audio, cover-inspired start/loading experience, HUD refresh, i18n and docs.

**M2 acceptance:**

- Three classes selectable; stats and capsules differ.
- Profile persists across reloads.
- Cosmetics and loadout survive reconnect.
- Server broadcasts and validates profiles.
- All players see each other’s cosmetics.
- Wardrobe live preview works and is reachable from menu and pause.
- Voice preview and test effects work.
- Procedural audio buses, limiter, 3D panner, footsteps, UI sounds, music and ambience work with no external files.
- Cover-inspired start/loading screens.
- EN/DE complete, typecheck and build clean, runtime-tested with two clients.
- `CLAUDE.md` and `BEDIENUNGSANLEITUNG.md` updated.

The numbering below matches the README (it replaces an older draft numbering in which weapons were M3 and vehicles M4).

### M3 — Core Movement, Extended Actions & Physics (complete)

Tactical sprint, crouch, mantle, dodge roll, swimming, ice patches, emergency parachute, shared deterministic motor.

### M4 — Weapons, Combat, Bots & Audio (complete)

Weapons, firing, damage, hit registration, lag compensation, skills, killer cam, combat VFX and audio, four AI bots.

### M5 — Fjord Fiesta, Weather Towers, Vehicles & Map Toys (M5-Kern test build, paused)

Full 257×257 map in the master orientation, three weather towers, weather balance, 50-ticket Climate Conquest and the vehicles/map toys of §13. **M5-Kern (done, §5.5):** map rebuild, Climate Conquest, Fondue Crawler, Coconut Beach Tank, Badi-Flamingo, Sidecar. **Rest of M5 (after the owner's test):** cable car, T-bar, coaster, hammock, NPC cow, biplane, rowboat, gondola, vehicle repair, full tower transformations and weather effects.

### M6 — Destruction, Craters, Decal Ring Buffer & Match Sync (later)

Eight destructible buildings, 12 bridge segments, 60 trees, 16 silos, 6 billboards, 4,096-decal ring buffer, terrain craters, late-join map sync, deterministic map reset.

### M7 — Meta, Economy, Monetisation & Live Features (later)

Accounts, progression, Alpen-Taler, armory rentals, VIP, custom lobbies, ads/rewarded ads, end screen/podium, matchmaking, analytics.

### M8 — Final Polish, QA & Deployment (later)

Performance, netcode, audio and typecheck pass, final manual, deployment.

**Continuation (26 October 2026):** the owner lifted the previous playtest pause and authorized all remaining milestones. Complete and verify each milestone in order; work serially to conserve usage.

**Do not implement ahead of the gate.** If a feature is written in this document but belongs to a later milestone, it is a reference, not an instruction.

---

## 23. Known deviations and open issues

These are the current gaps between the master design and the repository. They are tracked so nobody mistakes a design reference for shipped behaviour.

1. **Terrain collider vs rendered terrain.** The Rapier heightfield splits each cell along the other diagonal than the rendered mesh, so on steep cells the two differ by up to ~3.7 m: feet can float above or sink into steep slopes (§10.1).
2. **The map toys of M5 are not built yet** (cable car, T-bar, coaster, hammock, NPC cow) and neither are the biplane, rowboat and gondola. Their stations, masts and tracks stand as scenery. Until the cable car exists, Peak Guard uses the interim gorge plates (§10.6).
3. **No destruction, craters or late-join map sync** (M6). The packet exists but carries empty arrays. The weather balance is simulated and grades the look, but has no snowline, particle or ice-patch effect yet (§11.5).
4. **No vehicle repair**; the `Wrench` input bit is unbound.
5. **A boat driven fully onto dry sand stays stuck** while crewed (empty, it deflates after 10 s and respawns). **The coaster start deck intrudes ~2.5 m into the serpentine tank road.**
6. **Bot balance leans Lagoon** (about 6:14 rounds in bot soaks, §10.6), and while the Lagoon League holds Tower C its summit pads can see the Peak Guard base pads.
7. **Faction preference is not guaranteed.** The server balances teams and may override the profile preference (§6.3).
8. **Class change resets cosmetics to class defaults** in the client profile store. This is a convenience decision, not a final UX rule.
9. **No accounts or server-side persistence.** The profile is device-local and sent on connect.
10. **Performance:** the painted map is heavy (~1.3 million triangles and more) and may run slowly on weak GPUs; the picture quality setting (Auto / High / Medium / Low) is the lever.
11. **Hot Beach Girl:** she uses PBR shading on the character mask, but her full exemption from the painterly post pass is open (she still gets the silhouette ink and the grading).
12. **The emergency parachute uses transitional separate `parachuteState` and wind bytes.** A later pass may migrate to the packed `stateFlags` bits and `windPacked` nibble from the supplementary deep-dive.
13. **The UI/HUD master specification is only partially implemented.** The combat and conquest HUD, results banner and Tab scoreboard ship; armory, VIP, podium and ad surfaces are M7 work.
14. **The procedural fallback characters are the M2 rig.** The 1E rewrite was deferred from the M5-Kern build; every class shows its painted model, and the procedural rig only appears as a fallback (`?painted=0`, custom torso/legs/feet outfits, the first seconds while a model loads).
15. **The latest map/weapons/vehicles/UI master specs are design references.** Their full implementation is gated by the milestone in which the underlying system exists.

---

## 24. Key files

### Shared

| File | Responsibility |
| --- | --- |
| `packages/shared/src/types/index.ts` | Factions, classes, cosmetics unions, profiles, player state, input bits, snapshots, messages. |
| `packages/shared/src/constants.ts` | Tick rates, map size, water level, gravity, movement constants, protocol version. |
| `packages/shared/src/config/ids.ts` | Stable two-way ID tables and record guards. |
| `packages/shared/src/config/cosmetics.ts` | All cosmetic IDs, palettes, skin tones, hair colours/styles, defaults, normalisation. |
| `packages/shared/src/config/profile.ts` | Profile defaults, sanitisation, normalisation, appearance key. |
| `packages/shared/src/config/classes.ts` | Class IDs, stats, faction theme, default loadouts. |
| `packages/shared/src/config/weapons.ts` | Weapon ID tables, main/gimmick definitions. |
| `packages/shared/src/config/map-fjord.ts` | Map dimensions, analytic terrain, height sampling, zones, spawns, props, surface tags (blueprint parts under `config/map/`). |
| `packages/shared/src/config/conquest.ts` | Climate Conquest rules, capture zone test, interim cable-car spawns. |
| `packages/shared/src/config/vehicles.ts` | Vehicle definitions, seats, weapons, slots, ride rules. |
| `packages/shared/src/config/drifter.ts` | Drifter forms, walk tuning and supply aura. |
| `packages/shared/src/config/mascot.ts` | Cow and coconut tuning, mascot rams. |
| `packages/shared/src/config/critters.ts` | Hen species stats and behaviour weights. |
| `packages/shared/src/physics/vehicle.ts` | The shared vehicle motor (server simulation, driver prediction). |
| `packages/shared/src/net/opcodes.ts` | Opcodes, faction/class codes, player flags, event codes. |
| `packages/shared/src/net/protocol.ts` | All binary encode/decode functions, including profile codec. |
| `packages/shared/src/physics/character.ts` | The single deterministic kinematic character motor. |
| `packages/shared/src/physics/world.ts` | Rapier world, heightfield, prop colliders, raycasts. |
| `packages/shared/src/i18n/locales/en.ts` | English master dictionary. |
| `packages/shared/src/i18n/locales/de.ts` | German typed dictionary. |

### Server

| File | Responsibility |
| --- | --- |
| `apps/server/src/index.ts` | HTTP endpoints, WebSocket upgrade, handshake, packet dispatch. |
| `apps/server/src/rooms/match-room.ts` | Authoritative simulation, profiles, snapshots, respawns, join/leave, drifter aura. |
| `apps/server/src/rooms/conquest.ts` | Fixed-step towers, tickets, weather and round flow. |
| `apps/server/src/rooms/vehicle-manager.ts` | Vehicle spawns, seats, driving, weapons, rams, wrecks. |
| `apps/server/src/rooms/critters.ts` | Wandering hens. |
| `apps/server/src/rooms/spawn-facing.ts` | Spawn objective and facing. |

### Client

| File | Responsibility |
| --- | --- |
| `apps/client/src/engine/GameClient.ts` | Renderer, prediction, network, camera/input loop, HUD updates. |
| `apps/client/src/engine/camera-rig.ts` | Spring over-the-shoulder camera and menu orbit. |
| `apps/client/src/engine/input.ts` | Keyboard/mouse/pointer-lock input and button mask. |
| `apps/client/src/net/connection.ts` | Reconnecting binary WebSocket client. |
| `apps/client/src/state/profile.ts` | Persistent profile store and setters. |
| `apps/client/src/state/game.ts` | Phase, loading, connection, HUD, toasts, errors. |
| `apps/client/src/state/locale.ts` | Locale store and `t` helper. |
| `apps/client/src/rendering/character.ts` | Full procedural 7-slot character rig and animation. |
| `apps/client/src/rendering/materials.ts` | Toon, water, sky, character and shadow materials. |
| `apps/client/src/rendering/map.ts` | Terrain, water, sky, props, thin instances, preview stage. |
| `apps/client/src/shaders/character.ts` | Character GLSL/WGSL shader pair. |
| `apps/client/src/audio/synth.ts` | Procedural audio engine, buses, limiter, panner, music, SFX (planned). |
| `apps/client/src/audio/gibberish.ts` | Procedural cartoon voice (planned). |
| `apps/client/src/components/Wardrobe.svelte` | Live 3D wardrobe (planned). |
| `apps/client/src/components/MainMenu.svelte` | Cover-inspired start screen (redesign planned). |
| `apps/client/src/components/LoadingScreen.svelte` | Cover-inspired loading screen (redesign planned). |
| `apps/client/src/components/Hud.svelte` | Gameplay HUD. |
| `apps/client/src/components/PauseMenu.svelte` | Pause, controls, wardrobe access. |
| `apps/client/src/styles/app.css` | Design tokens, glass surfaces, buttons, HUD, menu, loading styles. |

---

## 25. Verification checklist

Before committing any milestone:

1. `bun run typecheck` — 0 errors, 0 warnings.
2. `bun run build` — shared, client and server build; `bun run test` — script, server and client suites pass.
3. `bun run dev`, open the client and confirm the menu reaches **Connected**.
4. Click **Play Now**, confirm the HUD appears and the renderer line says WebGPU (or WebGL2).
5. Move with WASD, jump with Space, sprint with Shift, crouch with C/Ctrl, roll with C while sprinting, swap shoulder with V, zoom with Alt+wheel.
6. Swim in deep water; confirm no respawn until falling below the world.
7. Open the wardrobe from menu and pause; change class, body type, skin, hair and all seven slots; confirm live preview and persistence after reload.
8. Change the loadout; confirm it persists and is sent to the server.
9. Open a second tab; confirm both characters show the correct cosmetics and class.
10. Switch EN/DE live; check menu, HUD, pause, wardrobe, loading and debug copy.
11. Test `?renderer=webgl2` to exercise the fallback shader path.
12. Confirm no shader compilation errors or uncaught exceptions in the browser console.
13. Confirm no external audio, model or heightmap files were added beyond the owner-supplied ones allowed by §3 (and listed in `CREDITS.md`).
14. Update `CLAUDE.md` and `BEDIENUNGSANLEITUNG.md` with the new milestone state.

The only expected console warning is Rapier’s deprecation notice about initialization parameters; it is harmless and originates inside `@dimforge/rapier3d-compat`.

---

*This document is a living decision record. Add new decisions here when they are made; move items between “design reference” and “implemented” only when the code and verification agree.*


## Performance follow-up — 26 October 2026

The owner's test reported heavy resource consumption and occasional long-session stalls. Inspection confirmed an uncapped High DPR with 4× scene MSAA before multiple full-screen passes; a one-shot menu-only governor that never responded to combat or thermal throttling; and procedural audio rebuilding noise buffers and 44100-sample saturation curves for repeated effects. This patch bounds target resolution, removes scene MSAA while retaining FXAA, caps rendering at 60 FPS, reduces Medium shadow cost, skips hidden-tab frame work and caches immutable audio inputs with fixed entry limits. Auto quality can step High→Medium→Low after sustained load during gameplay, with warmup between steps and no oscillating automatic upgrades. Manual settings remain manual.

Regression tests cover long-session adaptation, short spikes/manual/hidden behavior, Retina/4K target budgets and repeated audio effects with bounded caches. Cloud SwiftShader rendering cannot establish hardware frame rates or prove that all intermittent stalls are eliminated.

Validation: strict typecheck and production build passed. Script tests:10 passed. Server tests:165 passed on the first run, two vehicle cases exceeded the default5s timeout under parallel browser/build load; the entire affected10-test suite passed with a30s timeout, with unchanged assertions. Client tests:29 passed including5 new regressions. A real WebGL2/SwiftShader browser entered the round and pause menu, rendered advancing frames and snapshots, and reported zero uncaught page errors. Four samples showed meshes268→288→286→282 and textures56→66→71→70 while models loaded; this short run does not establish leak freedom over hours.


### Klarer 3D-Look und Laptop-Budget (26. Oktober 2026)

Auf Wunsch des Besitzers wurden Grafik und Dauerlast nach dem M5-Kern-Test überarbeitet. BFH dient ausschließlich als Referenz für klare Silhouetten und weich beleuchtete 3D-Formen; fremde Modelle oder Texturen werden nicht übernommen. Der Vollbild-Kuwahara-Malfilter entfällt vollständig. Zwei feste Nachbearbeitungsschritte (feine Konturen/Farbkorrektur und FXAA) ersetzen den bisherigen Dreieraufbau; Korn, Nachschärfen und Konturwackeln entfallen. Der Tiefen-/Normalenpuffer arbeitet mit halber Breite und Höhe (ein Viertel der Pixel). Materialbeleuchtung wird weicher, Modell-Normalmaps zurückhaltender und Textur-Mipwahl weniger überschärft. Der Kamera-Blickwinkel beträgt 62 Grad. Die sichtbare Terrain-Triangulierung stimmt nun mit Rapier überein, damit Figuren auf steilen Zellen nicht schweben oder einsinken. Die Physik bleibt unverändert.

Apple-GPUs starten automatisch auf Mittel. In den Grafikeinstellungen sind 30/45/60 FPS wählbar und gespeichert; Standard 45 FPS, Menüs höchstens 30 FPS. Niedrig behält bis zu 1600×900 Bildpunkte für bessere Lesbarkeit. Die automatische Qualitätsregelung berücksichtigt das gewählte FPS-Limit, damit absichtlich sparsame 30 FPS nicht als Überlast gelten. Diese Änderungen ersetzen die entsprechenden früheren Angaben zu Malfilter, 720p und 60 FPS-Standard. Weitere Meilenstein-Funktionen bleiben pausiert.

Das eigene Detailmodell wird bereits hinter dem Menü mit der vom Server zugewiesenen Fraktion angefordert. Die bedarfsgesteuerte Prüfung des Kamerabilds bleibt auf entfernte Figuren beschränkt. Dadurch muss die lokale Figur nicht erst mehrere sichtbare Frames als einfacher Platzhalter verbringen. Der Browservergleich prüft ausdrücklich das geladene Detailmodell. Das behebt die Ladeverzögerung; die mitgelieferten Modellgeometrien wurden dabei nicht neu modelliert.

Validierung dieser Überarbeitung: Typprüfung ohne Fehler/Warnungen, Produktionsbuild erfolgreich; 10 Skript-, 167 Server- und 34 Clienttests bestanden (211 insgesamt). Der WebGL2-Browserlauf prüfte das tatsächlich geladene Detailmodell, beide verbleibenden Post-Pässe, den 0,5-fachen G-Buffer sowie Speichern und Anwenden von 30 FPS über die Oberfläche. Sechs Messungen über rund zwei Minuten nach dem Aufwärmen blieben bei 254 Meshes, 70 Materialien und 57 Texturen; Frames und Snapshots liefen weiter. Keine unbehandelten JavaScript- oder Shaderfehler. Das ist ein Software-WebGL-Test, keine Temperatur-/FPS-Messung auf Apple-Hardware und kein stundenlanger Leckfreiheit-Nachweis.


### Räumlicher Boden (26. Oktober 2026)

Der Besitzer hat die flach wirkenden Bodentexturen beanstandet. Das Dorfpflaster bekommt daher echte, niedrig profilierte Steine mit abgeschrägten Kanten. Vier kleine, gemeinsam instanzierte Steingeometrien und ein Mörtelbett bilden das Pflaster; die Steine sind statisch und höchstens fünf Zentimeter höher als der Physikboden. Brunnenzugang und Spawnflächen bleiben frei. Außerhalb von 42 Metern entfällt die zusätzliche Geometrie. Die kleinen Steine werden nur im Farbdurchlauf gerendert; ihre Flächennormalen und abgedunkelten Fasen liefern die lokale Schattierung. Sie werden nicht erneut in die Schatten- oder Konturpässe geschickt.

Pflasterwege, Schnee, Sand und weitere Terrainlagen bekommen außerdem eine distanzabhängige Beleuchtungsnormalen-Variation aus den bereits gefilterten Materialfarben. Sie läuft in GLSL und WGSL ohne zusätzliche Texturabfragen, Materialtexturen oder Vollbildpass; steile Oberflächen und entfernte Details werden ausgeblendet. Das ergänzt das vorhandene Schnee-/Sandwellen-Shading. Die Gelände- und Spielfigurenphysik bleibt unverändert; das Mikrorelief ist rein visuell.

Validierung: Typprüfung ohne Fehler/Warnungen und Produktionsbuild erfolgreich. 10 Skript-, 167 Server- und 36 Clienttests bestanden (213 insgesamt); die beiden neuen Tests prüfen Bodenhöhe, freie Spawnflächen, gemeinsame Geometrien und das Dreiecksbudget einschließlich Mörtelbett. Die Bildkontrolle im WebGL2-Browser zeigte das geladene Detailmodell und räumliche Pflasterkanten; Menü, Runde, Pause sowie der gespeicherte Wechsel auf 30 FPS funktionierten ohne JavaScript- oder Shaderfehler. Zwei Messungen nach dem Aufwärmen blieben bei 254 Meshes, 56 Texturen und 70 Materialien, während Frames und Snapshots weiterliefen. Diese kurze Prüfung mit Software-Rendering ist keine Leistungs- oder Temperaturmessung auf einem MacBook.


### Solide Karte und ruhigere 3D-Darstellung (26. Oktober 2026)

Auf den weiteren Spieltest des Besitzers hin wurden die stufigen Konturen und unvollständigen Kollisionen überarbeitet. Der halb aufgelöste Konturpuffer wird weich rekonstruiert; die Linien sind zurückhaltender und blenden früher aus. Runde Metallmasten verwenden mindestens zwölf Umfangssegmente. Mittel/Hoch glätten die eigentlichen Geometriekanten zusätzlich mit zwei MSAA-Samples unter WebGL2 beziehungsweise vier unter WebGPU (dessen API keine zwei unterstützt). Niedrig bleibt bei einem Sample. Die zwei Nachbearbeitungspässe, Pixelbudgets, 45-FPS-Vorgabe und dauerhafte Lastregelung bleiben erhalten. Dies ersetzt die frühere Aussage, dass MSAA auf allen Stufen abgeschaltet sei.

Die vorhandenen GLB-Figuren erhalten kontinuierliche Lichtverläufe und deutlicheres, in der Entfernung ausgeblendetes Normalmap-Relief. Die zugrunde liegenden Modelle werden nicht durch fremde Assets ersetzt. Frei kombinierte Oberteile, Hosen und Schuhe verwenden weiterhin den dafür vorgesehenen Baukasten-Körper; in der Garderobe führt „Gemaltes Outfit“ zum mitgelieferten Detailmodell zurück.

Begehbare Bäume, Palmen und Felsen sind nun räumliche Geometrien statt kameradrehender Bilder. Räumliche Gruppen wechseln nach 145 Metern auf einfachere 3D-Modelle; die Fernmodelle und Laubdetails erzeugen keine zusätzlichen Konturen. Kontaktschatten verankern sie am Boden. Bildflächen bleiben für kleines Boden-Dekor und den Hintergrund außerhalb der begehbaren Karte erhalten. Felsen sind auf die vorhandenen festen Kollisionsmaße abgestimmt. Rote Geländer an Land und Bojen im Wasser kennzeichnen die bestehende Kartenkante.

Wegzäune besitzen jetzt feste, dem Verlauf folgende Kollisionskörper. Kistenstapel werden auf Client und Server aus denselben Einzelteilen gebaut, einschließlich oberer Kisten und ihrer Drehung. Auch die allgemeine Höhenabfrage für Objektplatzierung folgt jetzt derselben Dreiecksaufteilung wie sichtbarer Boden und Rapier; die bisher verbliebene Abweichung auf steilen Zellen entfällt. Diese Korrekturen betreffen die bestehende Testkarte, nicht neue Meilenstein-Spielmechaniken.

Validierung dieser Kartenkorrektur: Typprüfung ohne Fehler/Warnungen und Produktionsbuild bestanden. 10 Skript- und 38 Clienttests bestanden. Von 171 Servertests bestanden zunächst 170; der verbleibende Test suchte Teststellen anhand der behobenen Höhenabweichung. Seine Suche verwendet jetzt echte Ufersteigungen und behält sämtliche Bewegungsprüfungen bei; die komplette betroffene 25-Test-Datei bestand anschließend, darunter 72 steile Uferdurchquerungen und der Höhenvergleich mit 4.003 Rapier-Raycasts. Insgesamt sind damit 219 Tests abgedeckt. Der WebGL2-Browser prüfte Detailmodell, Dorfplatz, Lagune, Pause und gespeicherte 30 FPS ohne JavaScript- oder Shaderfehler. Nach dem Aufwärmen blieben die zwei Stichproben bei 504 Meshes, 56 Texturen und 70 Materialien, bei fortlaufenden Frames und Snapshots. Der vollständige WebGPU-Spieltest scheiterte in der Cloud am Verlust des Software-GPU-Geräts; daraus wird keine Aussage über die Apple-Hardware abgeleitet.


### Gemalte Pflastertextur als 3D-Relief (26. Oktober 2026)

Nach dem weiteren Feedback des Besitzers entfallen die wiederholten Einzelstein-Grundformen. Das Relief wird stattdessen aus den gezeichneten Fugen und Steinflächen der unveränderten `art/tex/cobblestone_color.jpg` abgeleitet. Farbe und Geometrie verwenden dieselbe zwei Meter große Kachel und dieselben Koordinaten. So bleiben die unterschiedlichen Konturen und Pinselstriche erhalten; Fugen liegen tiefer und die Steinflächen steigen weich an. Eine zurückhaltende Höhenvariation über den Platz verhindert gleich hohe Steinflächen.

Eine gemeinsame, statische Bodenfläche ersetzt die vier Steinvarianten und das separate Mörtelbett. Sie bleibt unter 240.000 Dreiecken, verwendet nur einen zusätzlichen Farbdurchlauf und keine zusätzlichen Texturen. Der spezielle Pflastershader liest die vorhandene gemalte Farbkachel direkt, ohne die zusätzlichen allgemeinen Materialmuster darüberzulegen. Entfernungsausblendung bei 42 Metern, höchstens fünf Zentimeter Abstand zum Physikboden und freie Brunnen-/Spawnflächen bleiben erhalten. Das ersetzt die frühere Beschreibung des Bodens aus vier instanzierten Stein-Grundformen. Die 64×64-Höhentabelle lässt sich mit `python3 scripts/bake-paving-relief.py` (Pillow) reproduzieren; ein Test prüft den SHA-256 der unveränderten Quelltextur.

Validierung der texturgebundenen Pflasterfassung: 10 Skript-, 38 Client- und 171 Servertests bestanden (219 insgesamt), Typprüfung ohne Fehler/Warnungen und Produktionsbuild erfolgreich. Der WebGL2-Spieltest mit dem geladenen Detailmodell, Pause, gespeicherten 30 FPS und fortlaufenden Frames/Snapshots bestand ohne JavaScript- oder Shaderfehler; zwei Stichproben blieben bei 489 Meshes, 56 Texturen und 71 Materialien. Die vier Materialvarianten für Welt, Pflaster, Terrain und Figuren wurden zusätzlich unter WebGPU ohne Kompilierungs- oder Validierungsfehler geprüft. Der vollständige WebGPU-Spieltest bleibt von der oben dokumentierten Cloud-Softwaretreiber-Einschränkung getrennt. Die abschließende Bildkontrolle bestätigte die ursprünglichen Steinfarben und Pinselstriche; die Farbkachel wird nicht neu geschrieben.


### Konfigurierbare, animierte Figuren (26. Oktober 2026)

Auf ausdrücklichen Wunsch des Besitzers wurde die Figurendarstellung im bestehenden Test-Build überarbeitet. Die sechs Soldaten verwenden weiterhin ihre mitgelieferten GLB-Skelette und Bewegungsclips, bekommen aber einen gemeinsamen, vollständig konfigurierbaren Körper. Oberteil, Hose und Schuhe lösen keinen Wechsel auf das alte starre Ersatzmodell mehr aus. Alle sieben Kleidungsbereiche, zwölf Hauttöne, acht Haarfarben, sieben Frisuren und der Körperbau beeinflussen die tatsächliche Geometrie beziehungsweise deren Farben. Vorschau, eigene Spielfigur und Mitspieler verwenden denselben Aufbau. Drifter und Maskottchen behalten ihre eigenen festen Formen.

Gesicht mit Kiefer, Augen, Nase und Ohren, einzelne Finger, Bartsträhnen, runde Gliedmaßen, Kragen, Gürtel, Knöpfe, Hosennähte und Stiefelschnürung sind räumlich ausgearbeitet. Kleidung, Haare, Haut und Accessoires werden in einem einzigen animierten Körpermesh zusammengeführt. Die vorhandenen Waffenposen, IK, Rollen und Bewegungsclips bleiben erhalten; konservative Knochenhüllen berücksichtigen bei Rollen auch die ausgewählte Kopfbedeckung. Für Soldaten entfallen die ungenutzten großen gemalten Körpertexturen. Ein auf zwölf Varianten pro Szene begrenzter Geometrie-Cache beschleunigt wiederholte Kombinationen, ohne pro Kleidungsstück eigene Draw Calls oder neue Vollbildfilter einzuführen.

Die Garderobe bezeichnet den Standard-Reset jetzt als „Standardkleidung anziehen“. Haut- und Haarfarbfelder haben eindeutige Beschriftungen, auch für Tastatur-/Screenreader-Bedienung. Die bestehende Profil-Speicherung und binäre Übertragung bleiben erhalten. Dies ersetzt die frühere Aussage, dass frei kombinierte Oberteile, Hosen und Schuhe nur am einfachen Baukasten-Modell dargestellt werden. Neue M5-Spielmechaniken bleiben pausiert.

Schnelle Mehrfachklicks auf Frisur- und Kleidungspfeile lesen den aktuellen Auswahlwert, statt einen noch nicht aktualisierten UI-Zwischenstand wiederzuverwenden. „Glatze“ erzeugt auch unter Hüten keinen zusätzlichen Haarbüschel. Validierung: 230 automatisierte Tests (10 Skript-, 171 Server-, 49 Client-Tests), TypeScript/Svelte ohne Fehler oder Warnungen und erfolgreicher Produktionsbuild. WebGL2-Browsertests prüfen Vorschau, alle sieben Kleidungsbereiche, Haut-/Haarwahl, Körperbau, Speicherung nach Neuladen, die eigene Figur, eine über das echte binäre Protokoll verbundene Mitspielerfigur und schnelle Auswahlwechsel ohne Konsolenfehler. Der neue Materialshader wurde außerdem unter WebGPU kompiliert. Die Cloud verwendet Software-Rendering; native Mac-FPS und Wärmeentwicklung wurden damit nicht gemessen.

### M5 continuation — boats and repair, 26 October 2026

The prior test pause is lifted. The four authored rowboat slots are now active:
200 HP, 8 m/s forward, two rowers; tapping W together on the 0.8 s HUD beat gives
16 m/s strokes. Both strokes must fall within 0.14 s of the same beat. Manual
Shift cannot bypass the rhythm. Respawn 20 s. Owner-supplied painted hull and
separate animated oars are the near model; a bounded procedural boat is the LOD.

Vehicle repair uses **hold X**, reserving E for the shipped class skill (supersedes
the old wrench key in §13). It restores 40 HP/s within 3.5 m, requires a clear world
ray to a friendly active hull and never exceeds max HP. Armed, damageable players
on foot or in exposed seats with free hands may repair; drivers with occupied
hands cannot. Repairing blocks personal firing. M5's other open items remain in
`MILESTONE_WORK.md`; this is a verified increment, not completion of M5.

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

## Owner visual revision and operational cable car — 27 October 2026

The latest owner screenshot with live blue/red names supersedes the older painterly
reference for the current graphics work. Use real 3D geometry, actual players/profile
choices and functional HUD readouts; no screenshot background or fabricated combat state.
Compact field HUD, cached shared-map SVG, occlusion-aware name tags (20 Hz), waistcoat,
reference-style new/reset allrounder outfit, gorge frost, faceted blue-grey cliffs and
lower bridge/collision posts are implemented. Preserve the painted paving relief,
45 FPS default, persistent quality governor, bounded caches and two post passes.
The current build is not an exact match in composition, proportions or effects.

Two cable cars use a shared fixed-tick route clock, opposite lanes, smooth acceleration
and eight-second station stops (updated 29 October). Each has two protected cabin seats and two exposed
roof seats. F boards/exits; H changes seats; C/Ctrl holds on in a crouch. Station levers
(F or unobstructed hitscan) stop/rock both cabins for two seconds, with a 2.5-second
trigger cooldown. Queue braking until all player inputs for the tick are applied, so
roof survival never depends on player iteration order. Standing roof crew inherit
momentum and are thrown off; crouched/interior crew remain.

Protocol 11 appends the cable-car kind without renumbering previous kinds; existing
extended pitch/roll and player crouch fields carry the motion. Cabins are invulnerable
fixed-route transports, never empty-towed. Remove interim cable-car spawn plates and
use normal tower/base spawns. Bot cabin navigation and team balance remain open.
Merged rounded cabin geometry is under 6,000 triangles and uses opaque painted glazing
without additional textures or transparent passes. All remaining M5 toys precede M6.

Verified 27 October: 255 automated tests (10 script, 189 server, 56 client), clean strict
TypeScript/Svelte diagnostics and successful production bundles. WebGL2 checks real HUD/
nameplates and cable-car motion, seat changes, crouch, exit and station brake events without
console errors. Five material variants compile under WebGPU without errors. Moving cabin
and fallback boat meshes now follow their parents; regression checks cover hull translation
and oar rotation. Cloud rendering is software; native Mac heat/FPS remain unmeasured.

### Reticle convergence for the reference camera

Use a closer left-foreground shoulder framing with lateral camera collision. The visual
centre ray chooses the nearest world/avatar point; the player's firing direction points
from the authoritative eye toward it. The client submits that finite normalized input
through the existing FireRequest direction. Movement yaw can differ during spring-camera
turns. The server never advances the shot origin to a client-requested point and retains
cover/range/ammo/cadence/rewind/damage checks. Shots from personal projectile weapons start
at the eye, preventing the previous 70 cm spawn offset from bypassing a thin wall.
Local muzzle tracers converge to the same target. Camera snaps clear spring momentum.
All work is within the active graphics/functional correction, not a new milestone.

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

### Shared gorge layout follow-up (27 October 2026)

The east overlook is part of the existing 257×257 terrain heightfield, with a
gentle south approach and steep gorge face. Its bevelled timber fence and all
other fence proxies sample each visible post's terrain height, fixing curved
ground that previously left collision rails underground. The relocated north
chalet uses the shared enterable layout, horizontal-board walls and a right-hand
balcony; the old square wall leaves the house clear. Northwest bot waypoints go
around both house and perimeter wall. The existing bridge keeps its four solid
segments with a stronger 1.4 m sag. Snow extends to the gorge floor, and the fir
clearing preserves all sixty fallable trees and three capture towers.

Protocol 12 rejects clients with the previous static map; no binary field changes.
Five new tests simulate real approach/rail contact, inspect chalet supports/floors,
cross the bridge and walk the changed navigation corridor. Geometry stays merged;
there are no new texture, shader or post-processing passes. Existing resolution
and frame budgets remain. This is a visual increment, not completion of the
reference or a start on M6 destruction.

Release checks pass: 271 tests (10 scripts, 197 server, 64 client), clean typecheck
and production builds. The hen damage fixture now also reserves room for the body;
a clear eye ray could previously put the shooter inside a rail and displace it.
All ten damage cases pass without weakening production hit rules. Final WebGL2
medium gameplay capture passes with real binary-connected players and no browser
errors (`docs/qa/gorge-reference-2026-10-27.png`). Native Mac heat/FPS are unmeasured.

### Graphic quality follow-up after owner rejection

The previous result is not accepted as the reference quality. Refine the actual
3D models and rendering rather than treating compile/test success as art approval.
Long arm/leg triangles now split along their longitudinal span before nonlinear
binding; shared midpoint indices keep smooth surfaces connected. This happens once
per outfit in the existing bounded cache, not during animation. Tall boots omit the
enclosed shin surface that previously poked through the shell. Reference sleeves
roll above the elbow; all skin colours still affect the forearms. Hat segmentation
increases locally, without a global subdivision or extra draw. Default: 51,384 tris,
one skinned body; all wardrobe variants tested below the existing 60k ceiling.

Character light mixes broad smooth form shading with a restrained cel step. The
contour shader preserves MSAA alpha coverage, uses a fine full-resolution character
outline and suppresses the duplicate half-resolution geometric edge on character
pixels. A coverage gate keeps ordinary sprite edges out of this silhouette path.
GLSL/WGSL remain paired. Snow sparkle and snow-only colour-tile contrast decrease;
terrain relief and stone colour detail remain. No additional texture, render target
or post-processing pass. The 45 FPS default, resolution budgets and governor remain.

Release validation: 273 tests (10 scripts, 197 server, 66 client), zero strict
TypeScript/Svelte errors/warnings, successful production bundles, six isolated
WGSL compilations, and clean WebGL2 detail/1280×714 gameplay captures. Full native
scene validation remains blocked by the Cloud external-instance error. The long
beached-boat test receives 15 s instead of 5 s wall-clock allowance after a 5.19 s
timeout with all assertions passing; no simulated time or gameplay rules changed.
Screenshots in `docs/qa/figure-quality-*.png` and `field-quality-1280.png` document
the result; the reference is still unfinished.


### Continuous figure sculpt and field waistcoat (27 October 2026)

Keep genuine configurable 3D figures: fused facial surface with inset eyes/lids,
continuous arms, rounded soles and hidden boot-covered cuffs. Preserve head wrap
normals through uniform head mapping; refine spine garment surfaces before skin
binding and omit enclosed chest/waist beneath closed waistcoats. Matte skin avoids
plastic glints. All skin/hair/wardrobe selection continues to come from real profiles.

Add sleeveless field vest as torso code 8 (append-only, protocol 13). New/reset
Heavy is bald with bare arms, olive vest/trousers and mountain boots. Old saved
profiles and all codes/options remain, including barrel armour and pot headgear.
Default Allrounder 50,214 triangles and Heavy 28,308, one animated body draw each.
Cache limit 12 and existing frame/pixel budgets stay; no added texture, target or
post pass. Cliff paint/normal and texture contrast are quieter without changing
terrain geometry, physics, paving or individual stone texture/relief.

`docs/qa/reference-heavy-vest.png` and `reference-field-vest-1280.png` show actual
WebGL2 output. Field actors use real binary profiles with test-staged positions;
the cow is a player mascot and the vehicle has loaded its real model. No fake fire
or screenshot background is added. Overall composition/model quality still falls
short of the supplied reference; further world/vehicle art remains active. Native
shader modules reached compilation, but strict queue completion failed on Cloud
SwiftShader with an external-instance/device-loss error. Native gameplay/Mac
thermal performance is unverified.

Field-vest release validation: **280 tests pass** (10 scripts, 198 server, 72 client),
strict TypeScript/Svelte checks report zero errors/warnings, and production builds
complete. WebGL2 model/field browser checks pass without console errors. Six native
WGSL variants reach compilation; strict GPU queue completion fails with the Cloud
external-instance error. Visual-reference acceptance and native hardware QA remain open.


### Detailed configurable soldier surfaces (28 October 2026)

The owner again rejects player quality; prioritise real figure geometry over new
features. Model fused facial planes and recessed sockets, a connected carved jaw
beard, tailored vest folds, fitted leather harnesses/seams and an oval curled felt
hat. Reduce modular head/footwear proportions and oversized buckles; native fixed
characters, physics heights and protocol 13 remain unchanged. Hold-mouth geometry
uses the same reduced head frame as the mesh.

Replace rigid visible fingers with rig-native palms and phalanges bound to existing
finger joints. Existing grip/reload poses now deform those vertices. Preserve glove,
hook and watch options and incomplete-rig fallback. Include all digit bounds in Hand
roll envelopes, without per-frame CPU skinning. Bake the offset on a one-part bare
arm before resetting the merged mesh; this corrects the detached raised arm case.

Keep exact selected profile RGB and skin masks; authored cavity shade travels in
UV.x and only affects modular lighting. This adds no texture, render target, post
pass or body draw; retain bounded caches and frame/pixel budgets. No artificial
screenshot overlay or fake player labels. Visual acceptance is still outstanding.

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


### Reusable anatomical arm surfaces — 28 October 2026

Use the owner's Lagoon Heavy arm sculpt as a bind-surface donor for configurable
sleeveless torsos. Retarget geometry and normals with the existing skeleton
anchors, align A/T-pose limb directions and preserve four-weight GPU skinning.
Import arm topology into the selected soldier's existing body draw; retain
its original painted sleeves when those match the outfit. Hands keep their
configurable articulated rig. Skin is a base uniform; arm paint contributes
only neutral cavity shading. Pack arm paint beside curls below the unchanged
face tile, retaining the 13.3 MiB shared texture budget and the 12-recipe cache.
No protocol, combat, physics or class statistics change.


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


### Facial landmarks and garment ownership — 28 October 2026

Map configurable face accessories from the original eye/mouth landmarks to the
shared sculpt, retaining the different Heavy head width. Eyepatch beards use the
same sculpted jaw and selected hair colour as full beards, with a wrapped leather
strap and an open lip area.

Treat olive-trouser calves as trouser fabric, not footwear. A continuous shaped
surface prevents a native boot choice from discarding the lower pants. Knee and
cuff compression are static geometry plus local cavity shade; all cloth uses
the existing skinning path and body draw. No new texture or render pass.

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


### Reference SMG proportions and calf ownership — 28 October 2026

Use the compact original box-magazine SMG silhouette from the current reference
and existing SVG HUD pictogram. Keep its gameplay identity/statistics unchanged.
The smaller merged prop has 1,052 triangles (previously 1,318); support-hand
grip and muzzle data are authored in the same coordinates as the mesh. No new
texture or render pass.

The Alpine Allrounder source separates ankle boots below .25 m from calf/sock
geometry above .30 m. Relabel the latter as legs above Foot.y + .12, so the
existing skin mask/shader covers exposed calves and changing pants also removes
the old socks. The original artist source stays untouched; derived data is
content-versioned as before.


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


### Wrist boundary for shared anatomy — 28 October 2026

Clip the donor arm surface against the actual wrist plane, keeping a 4 mm skin
overlap with the configurable hand. Bone-majority regions alone contained parts
of a second hand. Interpolate UVs/normals and merge/normalise the strongest four
skin influences at cut vertices. This is an offline bake; animation/runtime
cost and the shared texture allocation do not increase.


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


Configurable-head eye detail uses original procedural 3D surfaces instead of
enlarging the donor eye texture. Closed eye whites and lens-shaped iris/pupil/
highlight surfaces follow the socket angle. They share the skinned body draw,
material and bounded outfit cache. Existing native heads remain untouched.
Selected skin under the old eye pigment uses vertex alpha 2; shared atlas UVs
and category 2 remain intact. Both shader backends override pigment and gloss
for this solid anatomical base, preventing a donor pupil or foreign body atlas
from leaking through. No wardrobe options, samplers or protocol fields change.
Validation and limitations: `docs/qa/sculpted-eyes-2026-10-28.json`.


The outfit-independent head skin uses a unified closed surface instead of
overlapping painted face/scalp layers. Offline voxel union and local smoothing
relax the old moustache folds, then decimation bounds geometry. Pigment 3 is a
shaded anatomical feature: the lip RGB derives from selected skin and its
source shade, while pigment 0 remains solid selected skin, 1 atlas paint and
2 selected hair. Geometric eyes retain their own solid feature colours.

Because the new face does not sample paint, final packing discards its tile.
The existing curl and arm tiles occupy the same pixels in half the atlas
height; UVs and all six content hashes change together. No new sampler, draw,
frame-loop rebuild or gameplay protocol field is introduced. Source GLBs and
remaining native heads are preserved. Validation: `docs/qa/unified-head-2026-10-29.json`.


Weapon/body clearance is derived from actual selected torso surfaces. The
body cache keeps immutable front/back bounds from torso parts and native torso
regions; head/neck, trousers and backpack parts are excluded. This prevents an
old winter coat, beard or fused swim ring from displacing a changed outfit's gun.

Support-hand failure must not disable its own clavicle protraction. A continuous
extra shoulder yaw, capped at 0.65 radians, helps short broad rigs. Their carry
pull can gain up to 0.06 armature units, still subject to torso/stock/right-arm
limits. Contact remains on the actual support/foregrip-back segment. No gun
stats, muzzle direction, protocol, texture or draw count changes. Validation:
`docs/qa/weapon-grips-2026-10-29.json`.


Replacement anatomical hands are generated offline from owner-rig landmarks,
united into closed surfaces and bounded to 4,000 triangles per pair. Their
semantic skin and neutral creases do not sample donor clothing/complexion.
Embed them in the content-hashed body geometry; validate child topology data,
weights and combined budgets without allowing nested children. Anatomical palm
axes remove exporter bone-roll differences; real finger lengths preserve short
phalanges. Compatible cached bodies remain a single draw. Preserve native hands
where selected, and the existing rigid-wrist fallback where digits are absent.

Arm anatomy, hands and wrist accessories use semantic part tags. Distance from
the shoulder cannot decide whether a crossing watch/cuff is a hand. The full
watch band/case/dial is bound rigidly to ForeArm; its band encircles the wrist.


Following cow-skill/crawler-driving-plus-firing freezes reported on Chrome 156
arm64, default to the runtime-tested WebGL2 backend. WebGPU remains explicit
opt-in until dynamic gameplay/effect validation succeeds; do not infer a native
Metal root cause from the cloud device failure. Graphics quality tiers remain.

Audio is optional feedback: a synchronous browser audio exception must not
escape the render callback and terminate scheduling. The public synth facade
keeps method identity, uses the same engine, logs once per failing method and
allows later cues. Transient audio nodes own their lifecycle; shared positional
destinations remain alive until all overlapping partials finish. Suspended
contexts must not accumulate playback or automation. Shared buses never belong
to transient cleanup. Recipe tails release their mixer/reverb destinations.


The owner authorizes occasional independent antics for the playable cow. A
local director generates ordinary movement inputs; existing prediction, server
movement limits, stamina, collision and ram resolution remain authoritative.
It does not add NPC entities, hidden speed bonuses or friendly-fire damage.
Nearby living humans on either faction are equally eligible. The director
checks line of sight, height and the stopping path, brakes when necessary,
and yields immediately to abilities, jump and countersteering. Idle grazing
needs grass and is canceled by movement. Bouts are brief and infrequent.

Grazing is a cosmetic head/neck pose, including a manual standing Ctrl request,
with no smaller collider or movement benefit. Existing mascot flag bit 6
replicates it; absent false values retain old snapshot object shapes. Protocol
13 and packet sizes stay unchanged. Coconut jump bits remain 4–5.

The alphorn's authored length is about 3.4 m. Mouth anchoring must take priority
over short-arm compensation: adapt the right clavicle and wrist pose rather
than moving the mouthpiece away from the lips. Ground clearance pivots around
the mouth. A restrained breath pulse/sonic ring group reuses geometry; weapon
damage, range and cooldown remain unchanged.


### Closed arm surfaces and outfit-independent skin (29 October 2026)

Derived bare-arm anatomy must be closed at wrist/shoulder cuts, without
floating garment fragments. Offline smoothing/decimation has a firm triangle
budget; the current shared pair uses 2,578 triangles and one existing body draw.
Only same-side Arm/ForeArm/Hand influences may drive it: source garment labels
contained unrelated hip, leg, spine and head weights that distorted the pose.
Smooth elbow/wrist blending preserves the current animation rig.

Arm skin reads the selected base colour and neutral cavity shading, without
painted source skin. Hands do not depend on the arm paint atlas. Only the curl
tile retains paint at unchanged pixel density; the smaller shared texture pair
is estimated at 3.33 MiB RGBA8 with mips. Preserve legacy asset compatibility,
all existing wardrobe choices, source GLBs, source paint and animation clips.


### Map access and centred player framing — 29 October 2026

The latest owner instruction overrides the earlier 1.9 m human shoulder offset:
horizontal framing is centred, retaining follow springs, obstruction tests,
zoom and mouse aim. V is presented as the sidecar passenger-view control.

Close staircase risers geometrically while retaining one smooth physics slab
per flight. Building stairs share the thick, buried-toe ramp used by transport
stairs. Verify floor transitions through actual forward/backward traversal.

Cable-car station dwell increases to eight seconds. Align the valley floor
with the route platform (remove its former +0.279 m error). Open both end
portals and raise interior foot anchors clear of the floor. Docked interior
exits must select an unobstructed spot at platform height; roof/in-flight exits
keep their existing behavior. F remains boarding/exiting; H cycles seats.

Brake targets follow the visible released red grip, not a point below it.
Keep pedestals and operator approaches outside docked cabin colliders. Matching
solid pedestals, true eye-height/line-of-sight prompts, actual lever animation
and localised feedback make the existing two-second stop observable. Do not
change ram/roof-bracing rules, packet layout or protocol 13 for these fixes.

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


### Coherent scene graphics within existing budgets (29 October 2026)

Blend smooth shape lighting with the comic bands; retain readable silhouettes
without strong plastic rim/glint or fluorescent terrain colours. Continuous
meadow washes, cooler bounce and distance haze establish depth while keeping
all map/character geometry and collision data intact. Natural texture mip
footprints replace negative sharpening bias; wardrobe pigments remain separate
from illumination. Water specular stars are derivative-filtered and fade when
subpixel, with calmer temporal sparkle.

Clouds use eight groups of six joined puffs and an elliptical shelf, with
arithmetic periodic wrapping. Remove world albedo powers and skip specular
powers for matte surfaces. Keep existing textures, shadow/MSAA/pixel budgets,
45 FPS default and the two post passes. These shader reductions do not prove
native M4 performance. Lower cabin framing to avoid a near-lens haul rope;
retain the controlled player's horizontal centre and all verified map repairs.

Validation: 14 script, 211 server and 128 client cases verified (353 total).
Two unchanged server cases hit their existing limits in the full run, then
passed separately without timeout changes (3.21/7.59 s versus 5/15 s limits).
All browser captures and skin probes pass; 9 WGSL variants compile. Shader
cost reductions are not a native-Mac FPS/temperature benchmark.
Strict types report zero errors/warnings and production builds pass.


### Reference art decisions — 29 October 2026

Default clothes must not restore a different fused/painted face. Prefer the
scene-shared closed head for all soldiers when validated assets are available;
keep the old complete fallback. A closed beard is fitted to this actual skin
sculpt offline (1,536 triangles), follows selected hair and stays in the body
draw. The tracht waistcoat uses a complete tailored shell with native sleeve
folds; short hair, hat feather and goggles are real geometry. No source art or
clips are overwritten. Generated head hashes/revisions are rebuilt together.

Large paper-like ground props are replaced by small opaque volumes. Existing
painted rock/wood/foliage detail remains on those surfaces. Chunk size 100 m,
cutoff 110 m, maximum 1,400 vertices/chunk and 65,536 total, no added directional
shadow casters or screen-space edge work. These are low decoration, not new
non-solid cover; blueprint colliders, layout and paving stay unchanged. Rocks
retain the authored collision envelope while their chipped planes/snow caps vary.

The minimap interpolates terrain contours into cached SVG paths with holes and
rounded sub-cell corners, using the same map data and no additional 3D view.
Human camera stays horizontally centred; pivot 1.50 m, distance 3.60 m, same
FOV/collision/aim behaviour. Protocol 13, quality/FPS budgets and post passes stay.
Validation: 361 tests, clean strict types and successful builds; screenshot art
acceptance and native M4 thermal/FPS checks remain open.

The six-rig render comparison additionally found shirt fragments labelled as
sleeves across the chest and a missing native-trouser calf when changing shoes.
Fitted-vest sleeves now reject those off-arm fragments; replacement shoes keep
a continuous trouser calf. All three new regressions fail before the fix and
pass afterwards. The final full client suite has 136 passing cases; script/
server remain the passing 14/211 from the full run, with no timeout changes.


29 October, continued reference finishing: use vertex-alpha contact shadows in
the existing avatar/hen draw, not a hard opaque-edged disc or new shadow texture.
Bake 16 short-range anatomical occlusion rays offline into the existing neutral
UV.x cavity channel; keep skin RGB unmodified before lighting. Classify pale
Spine-bound shirt tails as torso even below Hips; they must leave with the old
shirt when mixing clothes. Clouds retain their analytical silhouette but use
broad illustrated underside shading, removing radial seams, dark rim and
per-cloud normal/glow work. No new texture, render pass or protocol change.
Full 14 script / 211 server / 137 client checks pass (362), clean types/build.


29 October — bridge boards are about 0.8 m with 2.5 cm visual gaps and minimal
yaw; remove duplicate segment posts, use rounder sparse posts and fewer thin
rope/hanger lines. Preserve deck/rail colliders, route and sag. Bridge triangles
5,104→3,240. Outside-map painted forest density is .40 near the edge/.16 farther
out/.10 on low tropical outskirts, versus .72; instances 9,398→2,369, fade at
750 m. Playable solid nature and collision blueprint are unchanged.
Crowded name labels stack with connector lines to their unchanged anchors;
visibility/faction/cloak rules stay, and layout uses CSS viewport dimensions.
Snow cannon keeps its gameplay/hold geometry, now blue/red as in the latest
reference; matching vector weapon icons remain texture-free. Full 364 checks,
clean types and successful builds. No protocol, texture or fullscreen-pass change.
