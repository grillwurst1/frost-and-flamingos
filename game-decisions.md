# Game Decisions — Frost & Flamingos

**Working title:** *Frost & Flamingos — Bullets, Fondue & Coconuts*  
**Genre:** Third-person multiplayer action-cartoon shooter  
**Mode:** 8v8 “Climate Conquest”  
**Platform:** Browser (WebGPU with WebGL2 fallback), local macOS playtest target  
**Engine:** Babylon.js v8 · Rapier3D · Bun · Svelte 5  
**Languages:** English (master dictionary) and German (fully typed translation)  
**Status:** Milestones 1–4 complete; Milestone 5 next  
**Last updated:** 24 October 2026

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
2. **No downloaded or stock 3D models.** The only `.glb` files are models the project owner generated with Meshy (image-to-3D) from the owner's own art: the painted, rigged soldiers and the two drifter characters in `apps/client/public/models/`, built from the untouched downloads in `art-src/meshy/` by `bun run models` and listed in [`CREDITS.md`](CREDITS.md). Every model is optional: a missing file falls back to the procedural character, and `?painted=0` turns them off. Weapons, props and the map stay procedural (Babylon.js mesh builders or generated vertex data), with colliders derived from the shared blueprint.
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

### 5.3 Not implemented (design reference or later)

- Weapons firing, damage, hit registration, lag compensation, kill feed and kill cam.
- Bots and matchmaking.
- Vehicles, aircraft, cable car, ski lift, coaster, rowboats, cow and hammock catapult.
- Destruction stages, terrain craters, bridge repair, falling trees, explosive silos, billboards and decal ring buffer.
- Dynamic weather balance and its visual/gameplay effects.
- Full 257×257 map rebuild and the master map orientation.
- End screen, podium, scoreboard, armory shop, VIP pass, ads and custom lobbies.

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
- Current server rule: pick the faction with fewer players; on a tie, pick randomly. The preference is not currently guaranteed.
- The server never accepts a client-side faction change after join. Profile updates keep the server-assigned faction.
- HUD colours, spawn points and class flavour names follow the server-assigned faction.

This keeps match balance authoritative and prevents faction stacking. If preference-aware matchmaking is added later, it must remain server-authoritative.

---

## 7. Classes

There are three classes. Every class can use every cosmetic item; class only controls the capsule, health, movement feel and default loadout.

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
- Changing class rebuilds the server capsule at the same feet position, restores full class HP and clears the input queue.
- The client must rebuild its local prediction capsule and character view when the class changes.
- Cosmetics do not reset when switching class unless the player explicitly resets the profile. The current profile store uses class default cosmetics on class change; this is a convenience choice and should be reviewed if players expect outfits to persist across classes.

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
| 5 | `Crouch` | C toggle, Ctrl hold |
| 6 | `Sprint` | Shift |
| 7 | `FirePrimary` | LMB |
| 8 | `FireSecondary` | RMB |
| 9 | `Reload` | R |
| 10 | `Interact` | F |
| 11 | `Heal` | Q |
| 12 | `Wrench` | E |
| 13 | `Skill1` | 1 |
| 14 | `Skill2` | 2 |
| 15 | `Skill3OrTaunt` | 3 / T |

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
| Weapon slot | Mouse wheel or 4 / 5 / 6 |
| Fire primary / secondary | LMB / RMB |
| Reload | R |
| Interact | F |
| Heal snack | Q |
| Wrench / repair | E |
| Class skills | 1 / 2 / 3 |
| Taunt | T |
| Pause / release mouse | Esc |
| Telemetry | F1 |

**Decision:** `C` is the crouch toggle and the sprint-roll gesture; `Ctrl` is hold-to-crouch. `V` is shoulder swap, not knife. The knife is a secondary weapon mode on the Infiltrator’s pistol slot.

### 9.5 Camera

- Spring-loaded over-the-shoulder camera with terrain collision.
- Mouse yaw is authoritative for movement; camera position is smoothed.
- Shoulder offset, pitch clamp, zoom distance and collision distance are tunable constants.
- The menu uses a slow orbit around the preview stage, not the gameplay camera.

---

## 10. Map: Fjord Fiesta

The map is called **Fjord Fiesta**. It is a single 800 m × 800 m vertical playground split into three climate bands.

### 10.1 Master dimensions

| Property | Master spec | Current prototype |
| --- | --- | --- |
| World size | 800 m × 800 m (`X/Z −400…+400`) | 800 m × 800 m |
| Heightfield | 257 × 257 vertices (~3.125 m cells) | 160 × 160 segments (161 × 161 vertices, 5 m cells) |
| Water level | `Y = 0.0` | `Y = 0.0` |
| Lagoon floor | Down to `Y = −4.5` | Approximate analytic terrain |
| Fall respawn | Below the world | `Y < −12` |
| Orientation | Southwest lagoon, centre village, northeast summit | **Currently reversed:** summit southwest, harbour northeast |

The full 257×257 rebuild and orientation correction are part of the later map milestone. The current prototype is a simplified but walkable version of the same idea.

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

- **No manual spawn selection menu.**
- After a **10.0 s live killer cam**, the server respawns the player at a random eligible spawn point (team-protected, free-raycast checked). There is no separate respawn countdown: the 10-second live view is the countdown.
- Eligible spawns are the protected spawn pads around towers currently held by the player’s team. If the team holds **zero towers**, the faction main base is used.
- The random roll happens on the server; the client cannot request a spawn.
- The current prototype uses `randomSpawnForFaction` with pre-authored spawn points. Full tower-based spawning arrives with the match-flow milestone.

---

## 11. Destruction, terrain craters and weather

This is a master reference for the destruction/weather milestone. None of it is implemented in the current M2 slice.

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

This is a master reference for the combat milestone. None of it is implemented in M2. The current server accepts fire packets but intentionally ignores them.

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

Combat is **not** part of M2. The server currently accepts and ignores `C2S_FIRE_WEAPON`. Do not add damage, hit registration, bots or kill flow before the combat milestone brief. The weapon tables exist now only so profiles, loadouts and the wardrobe can be validated against the final ID contract.

---

## 13. Vehicles, aircraft and map toys

This is a master reference for the vehicle milestone. None of it is implemented yet.

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

- Server-authoritative Rapier3D rigid bodies with client-side interpolation.
- Enter/exit with `F`; seat switching with `C` / `F1`–`F2`; horn with `H`.
- Vehicle health, seat occupancy, turret yaw and boost state are server-owned.
- Vehicle routes and spawns are data, not hand-placed per client.
- Vehicles are not part of M2.

---

## 14. Match flow and game mode

### 14.1 Mode: 8v8 Climate Conquest

- Two teams of up to 8 players; missing slots may later be filled with AI bots.
- Each team starts with **50 Vacation Tickets**.
- A weather tower is captured when more living players/bots of one faction are inside its **16 m capture radius** than the other faction.
- Capture time: **8.0 s** with one player, **4.0 s** with three or more.
- Holding towers shifts `weatherBalance` and contributes to the team’s climate control.
- A team loses tickets when the enemy controls the climate/towers (full ticket-drain rules are part of the match-flow milestone).
- The match ends when a team reaches **0 tickets** or the round timer expires.

### 14.2 Round flow

1. **Boot / login:** load renderer, world and network; show cover-inspired start screen.
2. **Matchmaking:** one-click “Play Now” joins an open 8v8 round (later fills with bots).
3. **Spawn:** random protected spawn at a held tower, or faction base if none held.
4. **Live round:** movement, capture, combat, vehicles, destruction, weather.
5. **Death:** 10.0 s live killer cam showing what the killer is currently doing, then a random server-chosen respawn.
6. **Victory:** winner podium cinematic in the map centre, top three scorers of the winning team on the steps, confetti, golden talers and palm leaves.
7. **Scoreboard:** kills, deaths, tower captures, bridge repairs, earned Alpen-Taler / Resort Crowns.
8. **Next match / return to menu.**

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

**Current version: 2.**

Version 2 was bumped because HELLO/WELCOME layouts changed from `displayName`/`faction`/`classId` to full profiles.

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
3. Class code (0 = allrounder, 1 = heavy, 2 = infiltrator).
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
- Vehicles: id, type, position, yaw, health (empty in M2).

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

### M3 — Weapons & Combat (next)

Weapons, firing, damage, hit registration, lag compensation, skills, kill cam, death screen, combat VFX, bots maybe.

### M4 — Vehicles & Aircraft (later)

Ten vehicles/toys, seats, vehicle physics, repairs, horns, cable car, ski lift, coaster, cow.

### M5 — Destruction, Craters & Weather (later)

Eight destructible buildings, 12 bridge segments, 60 trees, 16 silos, 6 billboards, decal ring buffer, terrain craters, dynamic weather, late-join map sync, deterministic reset, full 257×257 map and orientation correction.

### M6 — Meta, Economy & Live Features (later)

Accounts, progression, Alpen-Taler, armory rentals, VIP, custom lobbies, ads/rewarded ads, end screen/podium, matchmaking, analytics.

**Do not implement ahead of the gate.** If a feature is written in this document but belongs to a later milestone, it is a reference, not an instruction.

---

## 23. Known deviations and open issues

These are the current gaps between the master design and the repository. They are tracked so nobody mistakes a design reference for shipped behaviour.

1. **Map orientation is reversed.** The master spec puts the lagoon southwest and the summit northeast. The current prototype has the summit southwest and the harbour northeast. A full map rework is not started.
2. **Heightfield resolution is 160×160 segments (161×161 vertices, 5 m cells)**, not the master 257×257 (~3.125 m cells).
3. **The current map is a simplified playable slice.** Towers, chalets, lighthouse, docks, gorge, waterfall and prop layout are approximations, not the full master layout.
4. **No destruction, craters, weather balance or late-join map sync.** The packet exists but carries empty arrays.
5. **No combat.** Fire packets are ignored. Weapon tables are data-only until M3.
6. **No vehicles, bots, match tickets or capture logic.** Tickets are static 50/50 in snapshots.
7. **Faction preference is not honoured.** The server balances teams and may override the profile preference.
8. **Class change resets cosmetics to class defaults** in the client profile store. This is a convenience decision, not a final UX rule.
9. **No accounts or server-side persistence.** The profile is device-local and sent on connect.
10. **The HUD still shows M2 training copy and a no-combat note.** The full combat HUD belongs to M3/M6.
11. **The character rig is typechecked and rendered locally, but remote avatar appearance has only been verified at the profile-data level.** A visual two-client check remains on the M3 test pass.
12. **The emergency parachute uses transitional separate `parachuteState` and wind bytes.** M3 will migrate to the packed `stateFlags` bits and `windPacked` nibble from the supplementary deep-dive.
13. **The UI/HUD master specification is only partially implemented.** M2 ships the menu, loading, wardrobe, pause, settings and basic HUD; the full combat HUD, armory, VIP, podium and ad surfaces are M3–M6 work.
14. **The latest map/weapons/vehicles/UI master specs are design references.** Their full implementation is gated by the milestone in which the underlying system exists.

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
| `packages/shared/src/config/map-fjord.ts` | Map dimensions, analytic terrain, height sampling, zones, spawns, props, surface tags. |
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
| `apps/server/src/rooms/match-room.ts` | Authoritative simulation, profiles, snapshots, respawns, join/leave. |

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
2. `bun run build` — shared, client and server build.
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
13. Confirm no external audio/model/heightmap files were added.
14. Update `CLAUDE.md` and `BEDIENUNGSANLEITUNG.md` with the new milestone state.

The only expected console warning is Rapier’s deprecation notice about initialization parameters; it is harmless and originates inside `@dimforge/rapier3d-compat`.

---

*This document is a living decision record. Add new decisions here when they are made; move items between “design reference” and “implemented” only when the code and verification agree.*
