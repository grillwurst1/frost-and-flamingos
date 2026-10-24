# Frost & Flamingos — Bullets, Fondue & Coconuts

**Current milestone:** M4 — Weapons, Combat, Bots & Audio (complete)
**Next milestone:** M5 — Fjord Fiesta, Weather Towers, Vehicles & Map Toys

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

- **Two resorts, one map.** Explore snow, village, beach, harbour, water and cliff terrain.
- **Three classes** with different HP, speed, capsule size and default loadouts.
- **Live wardrobe:** body type, 12 skin tones, 8 hair colours, 7 hairstyles, 7 cosmetic slots,
  loadout selectors, voice preview and freeze/charred/soot preview effects.
- **Persistent identity:** your profile is stored in `localStorage` and synchronised to every
  other player through the authoritative server.
- **Movement:** walk, sprint, crouch, dodge roll, jump, mantle, swim, low-friction ice
  sliding and an emergency parachute with wind drift, steering and a faction-specific canopy.
- **Ice rinks:** two authored frozen patches (village pond and summit rink) use the shared
  `ice_patch` surface tag for gliding, flailing movement and ice-slide audio.
- **Multiplayer:** 60 Hz authoritative physics, 30 Hz binary snapshots, client prediction,
  reconciliation and remote interpolation.
- **Combat:** three weapon slots per class, six gimmick weapons, server-side hitbox rollback,
  headshots, shields, reloads, projectile splash damage, nine class skills and a 10-second
  live killer cam before random-faction respawn.
- **Bots and feedback:** four named AI bots, kill feed, adaptive crosshair, hit markers,
  damage vignette, comic popups, procedural combat SFX/voice and four cartoon death outcomes.
- **Audio:** fully procedural Web Audio graph (SFX, voice, ambience, limiter and 3D panning)
  plus the project owner's supplied music beds. No external samples.
- **UI:** cover-inspired main menu, boot/deployment loading screens, full combat HUD, pause
  menu, wardrobe, audio settings, debug telemetry and a live EN/DE switcher.

Vehicles, weather towers, terrain destruction, the 4,096-decal ring buffer and the
meta/economy layer are gated behind M5–M7.

---

## Quick start

Requirements: **Bun 1.4.4+**, a modern Chrome/Edge/Safari with WebGPU or WebGL2.

```bash
bun install
bun run dev
```

Open <http://localhost:5173>. The server health endpoint is
<http://127.0.0.1:3000/api/health>.

Useful commands:

| Command | Purpose |
| --- | --- |
| `bun run dev` | Start the authoritative server and Vite client together. |
| `bun run typecheck` | Strict TypeScript and Svelte diagnostics for all workspaces. |
| `bun run build` | Build shared, client and server bundles. |
| `bun run preview` | Preview the production client build. |
| `bun run stop` | Free ports 5173, 3000 and 4173. |
| `bun run clean` | Remove build output and caches. |

Force the WebGL2 fallback with <http://localhost:5173/?renderer=webgl2>.

---

## Controls

| Action | Input |
| --- | --- |
| Move | `W` `A` `S` `D` / arrow keys |
| Look | Mouse |
| Jump / deploy parachute | `Space` |
| Sprint | `Shift` |
| Crouch toggle / dodge roll while sprinting | `C` |
| Crouch hold | `Ctrl` |
| Shoulder swap | `V` |
| Camera distance | Mouse wheel |
| Weapon slots | `1` `2` `3` / mouse wheel |
| Zoom | `Alt` + mouse wheel |
| Interact / heal / repair / reload / taunt | `F` `Q` `E` `R` `T` |
| Pause | `Esc` |
| Telemetry | `F1` |

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
scripts/      dev stack launcher
```

- **One character motor** in `packages/shared/src/physics/character.ts`; the client predicts
  with it and the server simulates it at 60 Hz.
- **One map blueprint** in `packages/shared/src/config/map-fjord.ts`; client visuals and
  server colliders derive from it.
- **Binary protocol only.** Changing packet layout requires a `PROTOCOL_VERSION` bump.
- **No hardcoded UI copy.** English is the master dictionary; German is typed against it.
- **No external 3D models, heightmaps, textures or audio samples.** Props, characters,
  vehicles and effects are procedural. The only external audio is the supplied music beds in
  `apps/client/public/audio/`, used with the project owner's permission.

See [`game-decisions.md`](game-decisions.md) for the full design and decision record,
[`CLAUDE.md`](CLAUDE.md) for agent-facing engineering notes and
[`BEDIENUNGSANLEITUNG.md`](BEDIENUNGSANLEITUNG.md) for the German manual.

---

## Asset and IP policy

This is an original clean-room project. It contains no Battlefield/EA assets, names, maps,
sounds or copied compositions. All characters, props, weapons, vehicles, effects and
interface art are generated procedurally. External audio is limited to the music files
supplied by the project owner.

---

## Verification

Before each milestone is pushed:

1. `bun run typecheck` — 0 errors, 0 warnings.
2. `bun run build` — shared, client and server build.
3. Menu reaches **Connected** and **Play Now** enters the round.
4. Movement, camera, wardrobe, profile persistence and audio are exercised in the browser.
5. Two browser tabs see each other and exchange cosmetics.
6. WebGL2 fallback is tested with `?renderer=webgl2`.
7. No uncaught exceptions; only Rapier's harmless deprecation warning is expected.
