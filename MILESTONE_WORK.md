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


Player-art work continues with sculpted bare arms for configurable sleeveless
outfits. It preserves the independent skin base, the single skinned body draw
and the existing shared texture allocation. This does not complete the visual
reference gate or authorize moving past M5; garment/accessory refinement remains.


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


The current player-art pass also fixes selected beard colour/fit and olive-trouser
calves disappearing with native boots. Continuous cloth folds and cargo-flap
details remain within the existing body draw and texture budget. These are
visual-reference increments; the larger artwork gate remains open.

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


Current figure-art work also corrects the SMG's proportions/grip and original
Alpine calf skin/garment ownership. The smaller weapon reduces its geometry
without changing combat rules. Continue the visual-reference gate before new
milestone mechanics; hand silhouettes and broader world polish remain open.


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


Fixed duplicate donor-hand fragments in the shared arm sculpt by clipping at
the wrist during baking. The configured hands/skin selection remain independent.
This reduces geometry and adds no runtime/rendering step. The wider reference
artwork gate remains open.


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


Verified configurable-head eye geometry, solid socket skin, six-region/all-12
WebGL2 skin fixtures and actual game firing/reload. 97 client tests and strict
types/build pass; script/server checks are unchanged. Eight WGSL variants
compile, but cloud queue/device failure prevents runtime acceptance. The next
art defect is the actual upper-lip/mouth surface, not its texture resolution.
Reference quality and M5 completion remain gated. See `docs/qa/sculpted-eyes-*`.


Verified the closed configurable head, relaxed upper lip, selected-skin lip
crease and half-height shared atlas. 309 checks, types and builds pass; all
12 skin colours and wardrobe persistence/game entry pass in WebGL2. Native
M4 and WebGPU runtime remain unverified. The next visible defect is the Heavy
support hand; investigate the actual hold before adding more finger geometry.
The reference art gate and M5 completion remain open. See `docs/qa/unified-head-*`.


Verified torso-aware holds, backpack-independent bounds and Heavy support-hand
reach for three guns/three idle phases. 105 client tests, strict types/build
and real game fire/reload pass (script/server checks unchanged: 316 total).
No additional rendering geometry or textures. Evidence: `docs/qa/weapon-grips-*`.
The visible remaining hand/palm and shoulder garment artwork still prevents
reference acceptance; M5/new milestone feature work remains gated by that art.
