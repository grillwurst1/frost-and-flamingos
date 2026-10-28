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

Soldier follow-up: broader body, curved waistcoat, readable cuckoo clock, tall ski boots
and continuous ankle binding. WebGL2 detail views are verified, default body ~44k tris
in one skinned draw. Full Cloud WebGPU detail scene is blocked by adapter/buffer errors;
prior WGSL material compilation is not a successful full-game native check. Next: the
gorge/chalet/bridge/coast composition in the current visual task.

Geometry release validation: 266 tests pass (10 scripts, 192 server, 64 client),
strict TypeScript/Svelte is clean, production bundles build, and the animated
WebGL2 close-up passes without console errors. The stricter ankle regression
also passes and fails against the previous mapping (inward-facing normals).

The gorge increment adds the walkable snow overlook/rail, raised horizontal-board
chalet/right balcony, floor snow, stronger solid bridge sag and clear northwest
navigation/spawn. Protocol 12 matches the revised static map. Five new world tests
and the corrected body-clear hen test fixture pass; full release checks total 271
(10 scripts, 197 server, 64 client), with clean typecheck and production builds.
Continue visual work on coast composition, hero proportions, vehicles and effects;
the exact target is unfinished, and further milestone toys remain deferred.

Final WebGL2 medium comparison passes without browser errors; the actual game capture
with binary-connected test peers is `docs/qa/gorge-reference-2026-10-27.png`.

The owner rejected this graphic quality. Further milestone features remain paused.
Current art pass fixes boot/limb intersections, reference sleeves/hat, character
lighting/coverage contours and noisy snow. See `VISUAL_REFERENCE_WORK.md` for
actual validation and open art work. Automated test success is not visual sign-off.

Quality pass release: 273 tests, clean typecheck/build, six native WGSL compilations,
clean WebGL2 model and 1280×714 field capture. Target remains unfinished; next is
the selectable field vest/reference Heavy, preserving old wardrobe choices/profiles.


Field-vest/sculpt increment implements that next step: EN/DE selectable sleeveless
vest and reference new/reset Heavy, continuous faces/arms, inset eyes/lids, preserved
head normals, garment binding and boot/cuff cleanup. Existing outfits stay valid;
protocol 13 appends torso code 8. Calmer cliff shading retains terrain geometry.
WebGL2 model and actual field captures are clean; native queue completion remains
blocked by the Cloud GPU external-instance error. Exact visual matching, world
composition and vehicle model quality remain open. New milestone features stay
paused; see `VISUAL_REFERENCE_WORK.md`.

Field-vest release validation: **280 tests pass** (10 scripts, 198 server, 72 client),
strict TypeScript/Svelte checks report zero errors/warnings, and production builds
complete. WebGL2 model/field browser checks pass without console errors. Six native
WGSL variants reach compilation; strict GPU queue completion fails with the Cloud
external-instance error. Visual-reference acceptance and native hardware QA remain open.


28 October: the owner again prioritises player detail. Figure sculpt work adds face
planes/orbits, connected beard, tailored garments/harness/hat, adjusted head/boot
proportions and genuinely articulated fingers/palms. Fix the single-part bare-arm
offset and include finger bounds in roll clearance. Cavity shading keeps selected
profile paint exact, with no added body draw or screen pass. Protocol stays 13.
Reference acceptance and further model art remain open; no new M5/M6/M7 features.

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
