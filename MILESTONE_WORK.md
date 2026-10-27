# Completion tracker — owner authorization, 26 October 2026

The owner has lifted the M5-Kern pause and authorized completing all remaining
milestones. Work **serially**, use focused checks, preserve laptop rendering budgets,
and push verified increments to `master`. GitHub is source of truth (`master`; no
`main` remote branch currently). Do not implement M6 before M5 is verified complete.
This file records actual completion, not aspirational checkmarks.

## M5 — in progress

- [x] Four rowboats: rowing, two-player rhythm sprint, seats, damage, respawn, visual oars/HUD.
- [x] Vehicle repair, on foot and from exposed passenger seats; preserve class skills elsewhere.
- [x] Sidecar passenger first-person V camera and riding/repair visual poses.
- [x] Biplane: shared flight motor, water/glacier takeoff and landing, pilot gun, two wing mounts, jump exits, propeller hazard.
- [x] Cable car: two counter-running cabins, station boarding/interior/roof, brake levers including hitscan, roof crouch protection, remove interim spawn plates.
- [ ] Eight T-bars, boarding/exit, free shooting, dead-rider release.
- [ ] Coaster bobs: banked path, free shooting, 45-degree launch, clear the tank-road conflict.
- [ ] Hammock: 1.5-second tension, real ballistic launch to Tower B.
- [ ] Angry NPC cow: patrol, horn/shot/explosion triggers, eight-second rampage and team-independent damage.
- [ ] Tower transformations and climate: moving snow cannon/flamingos/icicles, snowline, bounded weather particles, timed ice patches.
- [ ] M5 tests, browser checks, docs, commit/push; then advance to M6.

## M6 — gated until M5 complete

- [ ] Building damage/fire/collapse/extinguishing and corresponding colliders.
- [ ] Actual heightfield craters on eligible surfaces; shared collision/render data.
- [ ] Twelve destructible and repairable bridge/pier segments.
- [ ] Sixty felled trees, sixteen explosive silos, six billboards.
- [ ] Bounded 4,096-instance persistent decal buffer.
- [ ] Binary late-join map-state sync and deterministic round reset.
- [ ] M6 validation, docs and push.

## M7 — gated until M6 complete

- [ ] Persistent accounts/progression/economy, schema and memory fallback.
- [ ] Armory rentals, fictional VIP/Kur-Pass, character slots.
- [ ] Private/custom lobbies, settings, room codes and matchmaking.
- [ ] Ad/rewarded-ad surfaces, dynamic billboard slots and analytics.
- [ ] Podium/end screen and server-authoritative round rewards.
- [ ] M7 validation, docs and push.

## M8 — gated until M7 complete

- [ ] Performance/netcode/audio/security/regression review; fix findings.
- [ ] Final visual/gameplay browser QA and EN/DE documentation.
- [ ] Reproducible deployment configuration and available deployment target.
- [ ] Final typecheck/build/tests, commit and push.

## Existing validated baseline

Commit `6302c16`: 230 automated tests; typecheck/build; configurable skinned avatars,
WebGL2 browser preview/persistence/local/remote comparison and WebGPU material compilation.
Cloud rendering is software; do not claim native Mac temperature or frame-rate measurements.

## Latest verified increment: M5 rowing/repair

Four rowboats and repair are complete. Short F/C/W/X taps are buffered until
simulation consumes them; typing in form fields does not issue gameplay actions.
Painted hull and separate oars are visible in browser. Native WebGL2 playtest
confirms boarding, movement, rhythm HUD and repair (130 → 137 HP) without errors.
The isolated input-edge test and 237 automated tests pass (10 scripts, 177 server,
50 client); strict typecheck is clean and production build succeeds. Browser
rendering remains software, so there is no native Mac performance claim.

## Latest increment: M5 biplane

Shared deterministic flight, full pitch/bank collision and binary pose (protocol 10),
three crew, fixed pilot MG, wing weapons/repairs, Space bailout, water/glacier
takeoff/landing and propeller blast hazard are implemented. Owner's aircraft is
11,817 triangles with one 1536 px paint texture and an animated propeller.
WebGL2 playtest passes boarding, authoritative flight with pilot + wing rider,
MG, Space exit and the painted model without console errors. Dedicated tests
cover deterministic replay, wire alignment, both runways, crash vs safe landing,
3D wing anchors and enemy/friendly propeller handling. Release checks pass: 244 tests (10 scripts, 184 server, 50 client), clean strict
typecheck, successful production build and WebGL2 flight smoke.

Sidecar passenger first-person view, held wrench and skeletal riding poses are
verified: 248 tests (10 scripts, 185 server, 53 client), clean strict typecheck,
production build and WebGL2 passenger/repair/wardrobe checks without errors.
No new shaders or wire-layout changes in this increment. Next: cable car, then
other map toys. Both shared firing height and own-hull exclusions now match
the seated camera; do not regress personal weapon fire from the tub.
Keep all remaining M5 items gated ahead of M6.

## Current owner priority: latest screenshot

New milestone features pause for the visual reference pass; see `VISUAL_REFERENCE_WORK.md`.
Field HUD, real nameplates/minimap, reference waistcoat/default outfit, gorge frost and
bridge silhouette are implemented. Exact composition, proportions and destruction effects
remain open; do not mark the visual target complete.

Cable car release checks: 255 tests (10 scripts, 189 server, 56 client), clean strict
typecheck and production builds. WebGL2 checks real cabin motion, H interior/roof switching,
C crouch, F exit and station brake binary events without console errors. The rendered
cabin and fallback rowboats now unfreeze their map-batch world matrices; regression checks
verify hull translation and actual oar rotation. Five material variants compile under
WebGPU without device/shader errors. Native Mac performance remains unmeasured.

Visual follow-up: reference foreground framing, lateral camera collision, clean snaps,
real reticle convergence and thin-cover projectile fixes pass 262 tests, strict
typecheck/build and a WebGL2 medium real-opponent hit check. New milestone toys remain
deferred for current graphics. Next visible corrections: backpack clock orientation,
tall detailed ski boots and stronger soldier silhouette.
