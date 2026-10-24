# Frost & Flamingos — Bullets, Fondue & Coconuts

**Current milestone:** M2 — Classes, Wardrobe & Identity (complete)
**Next milestone:** M3 — Weapons & Combat

A clean-room, browser-based third-person multiplayer action-cartoon shooter built with
**Bun**, **Svelte 5**, **Babylon.js 8** and **Rapier3D**. Two absurd holiday resorts fight
for one fjord: the Peak Guard wants permanent snow, fondue and orderly alpine silence; the
Lagoon League wants endless summer, flamingo inflatables and barefoot chaos.

> **Milestone status**
>
> - [x] **M1 — Movement & World:** playable map, deterministic movement, authoritative
>   multiplayer, prediction/reconciliation, camera, HUD, menus and EN/DE localisation.
> - [x] **M2 — Classes, Wardrobe & Identity:** three classes, persistent profiles, loadouts,
>   seven cosmetic slots, live 3D wardrobe, server-authoritative profile sync, expanded
>   movement (crouch, dodge roll, swim, mantle), emergency parachute, procedural character
>   rig, supplied music beds, supplied procedural SFX library and cover-inspired menus.
> - [ ] **M3 — Weapons & Combat:** firing, damage, hit registration, lag compensation,
>   skills, bots, kill feed, live killer cam and random respawn.
> - [ ] **M4 — Vehicles & Aircraft:** drivable map toys, seats, vehicle physics, repairs,
>   horns, cable car and alpine cow.
> - [ ] **M5 — Destruction, Craters & Weather:** destructible buildings, bridges, trees,
>   silos and billboards, terrain craters, decal ring buffer, dynamic weather and map sync.
> - [ ] **M6 — Meta, Economy & Live Features:** tickets/towers match flow, full combat HUD,
>   armory rentals, VIP pass, custom lobbies, end-of-round podium and rewards.

---

## What is playable right now

- **Two resorts, one map.** Explore snow, village, beach, harbour, water and cliff terrain.
- **Three classes** with different HP, speed, capsule size and default loadouts.
- **Live wardrobe:** body type, 12 skin tones, 8 hair colours, 7 hairstyles, 7 cosmetic slots,
  loadout selectors, voice preview and freeze/charred/soot preview effects.
- **Persistent identity:** your profile is stored in `localStorage` and synchronised to every
  other player through the authoritative server.
- **Movement:** walk, sprint, crouch, dodge roll, jump, mantle, swim and an emergency
  parachute with wind drift, steering and a faction-specific canopy.
- **Multiplayer:** 60 Hz authoritative physics, 30 Hz binary snapshots, client prediction,
  reconciliation and remote interpolation.
- **Audio:** fully procedural Web Audio graph (SFX, voice, ambience, limiter and 3D panning)
  plus the project owner's supplied music beds. No external samples.
- **UI:** cover-inspired main menu, boot/deployment loading screens, HUD, pause menu,
  wardrobe, audio settings, debug telemetry and a live EN/DE switcher.

Weapons do not fire yet, and there are no bots, vehicles, damage or destruction. Those
systems are deliberately gated behind M3–M6.

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
