# Completion tracker — owner authorization, 26 October 2026

The owner has lifted the M5-Kern pause and authorized completing all remaining
milestones. Work **serially**, use focused checks, preserve laptop rendering budgets,
and push verified increments to `master`. GitHub is source of truth (`master`; no
`main` remote branch currently). Do not implement M6 before M5 is verified complete.
This file records actual completion, not aspirational checkmarks.

## M5 — in progress

- [x] Four rowboats: rowing, two-player rhythm sprint, seats, damage, respawn, visual oars/HUD.
- [x] Vehicle repair, on foot and from exposed passenger seats; preserve class skills elsewhere.
- [ ] Sidecar passenger first-person V camera and riding/repair visual poses.
- [ ] Biplane: shared flight motor, water/glacier takeoff and landing, pilot gun, two wing mounts, jump exits, propeller hazard.
- [ ] Cable car: two counter-running cabins, station boarding/interior/roof, brake levers including hitscan, roof crouch protection, remove interim spawn plates.
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

Next: biplane. Source parts probe (no repo
changes) is /tmp/m5-plane-parts-probe.log: -X-forward, scale 6.8, bounds +-3.229 X,
Y 0..2.776, Z -2.694..2.704. Propeller is component 5 at (-.023,1.810,2.389),
size (1.670,1.229,.139); two wings at Y1.38 and Y2.628. Keep the actual source
untouched, add split rule and model tuning, shared deterministic flight, 3 seats,
wing exits, pilot gun, prop hazard and native model propeller spin. Snapshot seats
already have variable length (up to 8); flight pitch/roll will need explicit wire
fields and the corresponding protocol bump (currently 9). Do not repurpose turret
fields as flight state. The rest of M5 follows this aircraft package before M6.
