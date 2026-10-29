# Active visual target — 27 October 2026

The owner's latest supplied image with player name labels supersedes the earlier
painted/BFH look references. Base image is tracked as
Gemini_Generated_Image_qyqgueqyqgueqyqg.jpeg (GitHub f5b0067); the latest chat image
adds blue allied names and red opposing names with triangular pointers.

Priorities: clean cel-shaded 3D, readable dark contours, blue-grey angular cliffs,
white snow, clear cyan sky, timber chalet/rope bridge, broad character shapes,
legible wardrobe, compact top tickets/objectives/compass, top-right minimap,
bottom-left portrait/health, central action tiles, bottom-right weapon cards.
Use actual game state, real profiles and functional controls. Compare screenshots
from the running 3D game; do not replace gameplay with the reference image.
Preserve frame cap, quality governor, bounded effects and shared collision geometry.

## Verified increment

- Tickets, objective discs, compass, profile health, action tiles and weapon cards
  follow the reference layout while showing actual game state and key bindings.
- Real names and team-coloured triangles follow rendered players at up to 20 Hz.
  Walls and cloaked enemies hide their tags; current camera matrices prevent stale projection.
- Minimap terrain, bridge, roads and buildings are a cached SVG from the shared map.
  Live allied dots and local position/heading require no extra 3D scene.
- Waistcoat has real green panels/white sleeves; new/reset allrounders use brown short
  hair/beard, cuckoo clock and red ski boots. Saved choices remain untouched. Portrait
  headgear, hair, skin and face respond to configuration; mascots/drifters use their own emblem.
- Gorge frost applies to terrain, roofs and solid near/far firs/rocks. Snowy lanes
  retain only 18% of the prior ground-clutter density, replacing meadow sprites with
  snow dressing. Terrain/collision heights and painted paving relief are unchanged.
- Lower bridge pylons/ropes use corresponding shared collision dimensions. Blue-grey
  cliffs and cleaner cel lighting replace the default painted panorama/facade overlays.
- Existing 45 FPS default, resolution budgets, quality governor, half-resolution contour
  buffer, bounded geometry caches and two post passes remain in force.

Release evidence: 255 automated tests (10 scripts, 189 server, 56 client), strict
TypeScript/Svelte with zero errors/warnings, successful production bundles. Five native
WebGPU material variants compile without errors. WebGL2 reference captures show the real
HUD and binary-connected player names without browser errors. The browser cable-car test
verifies motion, interior/roof H, crouch C, exit F and two real brake events. Moving
world matrices are asserted for cabin/fallback rowboat geometry and oar pivots.
The full game was tested with software WebGL2; no native Mac heat/FPS claim is made.

## Remaining visual work

The exact visual target is **not complete**. Continue comparing the running game: broader
hero proportions/stance, strong angular gorge silhouette, chalet/bridge/
coast composition, vehicle detail and comic effects still differ. Camera changes must keep
aiming/occlusion functional. Burning/collapsing buildings belong to M6 after M5, not static
fake fire. Use real players/vehicles rather than inventing screenshot names or a decorative cow.
Do not start new M5 toys until the active visual request is handled; M6/M7 are not started.

Cable car itself is verified and replaces interim spawn plates. Bots do not yet ride it;
team balance remains an open M8 check. Other M5 items remain in `MILESTONE_WORK.md`.

## Foreground/aim follow-up

Closer left-foreground human camera, lateral collision and clean snap momentum are
implemented. Centre-ray targeting converges on the real eye and local muzzle. The server
uses the existing finite aim vector while keeping authoritative origins and all hit rules.
Personal projectiles start at the eye to preserve thin near cover. Four client/three
server regression cases cover framing, parallax, fast-turn aiming, malformed input and
real hits behind cover. Release passes: 262 tests (10 scripts, 192 server, 60 client), clean typecheck and build.
WebGL2 medium confirms an actual centre-reticle hit on a binary-connected opponent
(150 to 122 HP) and captures the new framing without console errors. The camera
framing is closer, but the hero silhouette and world layout still differ.
The backpack/boot/waistcoat corrections below are the following verified geometry increment.

## Soldier geometry follow-up

Broader body morph, curved waistcoat/pockets, outward clock dial and actual gable/
weights, tall detailed ski boots, covered cuff suppression and continuous ankle binding
are implemented. Default body ~44k triangles, one skinned draw; variants remain under
60k. New geometric checks detect the previous inward dial and inverted ankle faces.
The old ankle mapping produces minimum front normal Z=-0.827; the corrected mapping
keeps it above -0.006. WebGL2 front/back/three-quarter captures pass without errors.
An additional full soldier-scene WebGPU attempt fails in the Cloud with adapter/8 MiB
mapped-buffer initialization errors even at 320×240. Earlier WGSL material compilation
passes are separate evidence, not a full native game success. Native Mac is unmeasured.

Next visual work: the actual snowy gorge/chalet/bridge/coast composition. Compare a
playable close ledge against the target, preserve shared height/colliders/navigation,
and keep buildings/vegetation solid. The exact screenshot match is still unfinished.

Geometry release validation: 266 tests pass (10 scripts, 192 server, 64 client),
strict TypeScript/Svelte is clean, production bundles build, and the animated
WebGL2 close-up passes without console errors. The stricter ankle regression
also passes and fails against the previous mapping (inward-facing normals).

## Playable gorge composition

A shared raised overlook east of the bridge, foot approach and solid timber rail,
relocated horizontal-board chalet on a higher ledge with a right-hand balcony, and a
battle clearing are implemented. Heightfield, props and colliders share the same blueprint.
Protocol 12 requires matching static maps. Five new world tests and existing solidity/
spawn checks pass (21 focused cases). The bridge's stronger 1.4 m sag remains walkable;
northwest navigation and the nearby spawn pad clear the house and square walls.
Fences now sample the same
per-post terrain heights as the render mesh instead of linearly interpolating only
path endpoints, which could bury rails under curved ground. Snow reaches the gorge floor.

Release checks: 271 tests pass (10 scripts, 197 server, 64 client), zero TypeScript/
Svelte errors or warnings and successful production builds. The hen damage fixture
now reserves body space as well as eye line of sight: its old stand could intersect
a rail, causing physics to displace the shooter before the shot. All ten damage
cases pass with the corrected stand. No production hit rules were weakened.
No shader, texture or full-screen pass was added. Exact target matching is still open.

Final WebGL2 medium scene passes without console errors: menu connected, deployment,
actual overlook terrain and four visible server-assigned player tags. The capture is
`docs/qa/gorge-reference-2026-10-27.png` (staged test peers, real binary sockets).
Observed frame draw calls: 304 with these players/settings; this is software rendering,
not a native FPS or Mac thermal benchmark. Continue coast, silhouette and vehicle work.

## Owner rejection: still too unprofessional and pixelated

Treat this as an art-quality task, not an accepted screenshot match. Corrected
enclosed-shin/boot intersections and long triangles crossing nonlinear limb bends;
added rolled reference sleeves and a rounder hat. Default body: 51,384 tris, one
skinned draw; all tested outfits below 60k. Two new checks cover exposed forearm/
hidden shin surfaces and short boot bend spans. The 18 focused model tests pass.

Character lighting now retains smooth form shading; contours preserve resolved
coverage and avoid duplicate coarse depth ink. Snow decoration/colour contrast is
quieter while rock textures and terrain relief remain. Six isolated native WGSL
variants (world, paving, terrain, painted, modular and contour) compile without
shader/device errors. A whole native scene attempt still fails with the Cloud's
external-instance error; compilation is not a successful full native game check.
WebGL2 animated detail views pass without errors. Full field comparison/release
checks follow; exact target matching and native Mac thermal measurements remain open.

Release validation is complete: 273 tests pass (10 scripts, 197 server, 66 client),
clean typecheck/build, six isolated native WGSL compilations and error-free WebGL2
model/1280×714 actual gameplay captures. See `docs/qa/field-quality-1280.png` and
`figure-quality-before.png` / `figure-quality-after.png` (different idle poses).
The beached-boat test's wall-clock allowance is 15 s after a 5.19 s Cloud timeout;
all physical assertions and fixed simulation steps remain. The target is not accepted.

Next: selectable sleeveless field vest and a reference Heavy default (bald head,
bare arms, olive clothing), retaining saved outfits and all old choices. Broader
world/vehicle art and consistent reference comparison remain open.


### Field vest and connected figure forms

Implemented selectable EN/DE sleeveless vest (append-only torso 8, protocol 13)
and reference Heavy default; saved outfits and previous choices are preserved.
Faces fuse nose/brow/cheeks into one smooth surface with inset eyes and lids.
Arms are continuous lofts; head seam normals survive rig mapping. Closed vests
replace inner torso surfaces, spine garments refine before binding, boot soles
round and covered cuffs disappear. Skin gloss is reduced.

Default Allrounder 50,214 triangles / Heavy 28,308, one animated body draw each,
cache still 12, no new texture/target/post pass. Cliffs use broad vertex-colour
strata, gentler facet lighting and lower steep-rock texture contrast; actual terrain
and rock/paving relief remain. WebGL2 model and full field QA pass without errors.
See `docs/qa/reference-heavy-vest.png` and `reference-field-vest-1280.png`; actors
are real binary players, including cow, with staged test positions and loaded
vehicle geometry. Native queue completion fails with the Cloud external-instance
error despite modules reaching compilation; no full native or Mac sign-off.

The target is still open: chalet/bridge/vehicle proportions, environment composition,
vehicle sculpting and overall professional model quality need further work. Do not
mark the owner's screenshot accepted or resume new milestone features yet.

Field-vest release validation: **280 tests pass** (10 scripts, 198 server, 72 client),
strict TypeScript/Svelte checks report zero errors/warnings, and production builds
complete. WebGL2 model/field browser checks pass without console errors. Six native
WGSL variants reach compilation; strict GPU queue completion fails with the Cloud
external-instance error. Visual-reference acceptance and native hardware QA remain open.


### Soldier detail priority, 28 October 2026

Owner again rejects player quality. This increment sculpts face planes/orbits, a
continuous carved beard, tailored vest folds/seams/harness, pinched oval felt hat,
more restrained leather stitching and proportionally smaller heads/boots/hardware.
Actual finger joints now skin visible phalanges/palms, replacing the rigid hand
paddles. Preserve alternate hand choices and rigs without full finger chains.
A single-part bare arm must bake its local offset before its transform is reset;
the new forearm test guards the detached-arm failure seen during this work.
Roll envelopes include digit geometry under Hand, retaining coarse fixed work.

UV cavity shade is interpolated through rig refinement/cache and leaves selected
RGB/skin masks intact. Only the soft modular material reads it. No texture, extra
post pass or body draw; cache 12 and existing render budgets remain. Original
fixed-look characters and all wardrobe options persist. Native Mac thermals/FPS
remain unmeasured. Do not mark exact screenshot quality complete.

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


### Sculpted configurable arms — 28 October 2026

Reused the owner's bare-arm sculpt for sleeveless wardrobe choices, retaining
selected skin colour and detailed native sleeves for matching shirts. Retarget
geometry/normals to the target bind skeleton once; preserve animation weights,
one body draw and articulated hands. Added donor-identity and cross-rig joint
anchor regressions. The atlas keeps its existing 1024×2048 / 512×1024 allocation;
face resolution remains unchanged, curls and arms share its lower half.
Remaining garments, facial accessories and overall screenshot acceptance are
still open.


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


### Beard fit and continuous trouser fabric — 28 October 2026

Eyepatch beards now use selected hair colour and the sculpted jaw surface, with
a wrapped leather strap. The shared face fit maps actual eye/mouth landmarks;
beard geometry leaves the lips open. A regression covers colour selection and
placement below the real chin. Olive trousers now have continuous shaped fabric
with broad knee/cuff folds and cargo-flap details. A second regression ensures
native mountain boots cannot discard the calf fabric. Textures/draw count stay
unchanged. Full screenshot acceptance, other outfits, hands and weapon/world
refinement remain open.

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


### Reference SMG silhouette and calf skin — 28 October 2026

Replaced the oversized drum silhouette with an original compact box-magazine
SMG matching the current reference/HUD pictogram. Support-hand grip now aligns
with the modelled foregrip, and muzzle data matches the new barrel. Static
geometry falls from 1,318 triangles / 806 vertices to 1,052 / 664. Gameplay
statistics, audio and protocol do not change.

Corrected the Alpine source calf/sock region, previously treated as footwear.
It now follows leg/skin selection and is excluded with replaced long trousers,
removing the old sock slivers. A regression verifies the exposed skin pigment
and ankle-boot boundary. Body draw/texture allocation and shader sources remain
unchanged. Further hand/world art remains open.


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


### Clean shared-arm wrist boundary — 28 October 2026

The copied arm region extended up to 6.8 cm past the donor wrist and contained
parts of the old hand. Clip against the true Hand/ForeArm plane with a 4 mm
overlap, interpolating original paint/normal/skin data. The existing configurable
hand remains the only hand. Shared anatomy falls from 2,293 / 3,376 vertices/
triangles to 2,256 / 3,323. The asset regression now checks every arm vertex's
wrist-plane projection. Original GLBs and runtime shader code remain untouched.


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


### Sculpted eyes and texture-independent sockets — 28 October 2026

Closed ellipsoid eye whites and curved iris/pupil/glint surfaces replace the
raster eyes on the shared configurable head. Their tilt follows the real face
wrap; skin underneath uses the selected base independently of donor texture.
Keep head-atlas IDs and UVs intact; a solid-anatomy alpha marker overrides old
pigment and gloss in both shader backends, avoiding a body-atlas transition.
Original native heads remain unchanged. Per configurable head: 736 triangles,
no extra texture, material or draw; no per-frame geometry construction.

Validation: 97 client tests pass (including finite/outward eye geometry and
socket-category/feature-colour checks); types report zero errors/warnings and
production builds pass. The 13 script/198 server checks are unchanged: 308
checks in total. GPU base readback matches all twelve skin colours in six
fixtures: face, scalp, original forehead, shared arm, original calf and socket.
The four views have 25,880 / 25,640 / 33,237 / 23,201 body triangles and one
body draw each. Actual 1280x714 game: SMG 30 -> 29 -> 30 on firing/reload, finite
muzzle, live nameplates and painted crawler, zero browser errors. These are
cloud software-renderer checks, not native M4 thermal/FPS measurements.

All eight WGSL variants compile. Queue validation still reports the existing
cloud external-Instance OperationError/device destruction; WebGPU runtime is
unverified. Raw records and captures: `docs/qa/sculpted-eyes-2026-10-28.json`
and `sculpted-eyes-*.png`. Mouth/upper-lip topology and sleeve/wrist sculpting
remain visibly unfinished, as does the wider world/reference artwork.


### Closed, unpainted head anatomy — 29 October 2026

Merged the extracted scout face and replacement scalp offline into one closed
volume. Local upper-lip smoothing removes the star-shaped folded skin; a
projected 3D lip contour shades from the chosen skin, independently of hair
or outfit. The source GLBs remain untouched. The shared head is now 3,651
vertices / 7,228 triangles (was 6,654 / 9,420: about 23% fewer triangles).
Geometric eyes remain, and native heads remain where selected.

Solid anatomy no longer samples a face image. Remove that unused tile from
the final atlas, preserving the previous curl/arm tile pixel density and
gutters. Colour is now 1024x1024 and mask 512x512, once per scene: roughly
6.7 MiB RGBA8+mips instead of 13.3 MiB. Version geometry, UVs and textures
together. The four body captures have 25,880 / 23,448 / 31,045 / 23,201
triangles and one body draw each; native heads do not change.

309 checks pass: 13 script, 198 server, 98 client. The old bald-head check now
counts actual Head-bound geometry rather than the former paint category.
Types have zero errors/warnings; production builds pass. Software WebGL2
readback matches all 12 selected colours at six skin fixtures and the expected
skin-relative lip shade at a seventh. Actual wardrobe skin/hair selection,
reload persistence and entering the game also pass without browser errors.
See `docs/qa/unified-head-2026-10-29.json` and associated images; the comparison
shows the prototype on the left and previous sculpt on the right. Native M4
thermal/FPS behaviour, WebGPU runtime and full reference acceptance remain
unverified. Heavy hand posing and garment/shoulder transitions remain open.


### Worn-torso clearance and reachable Heavy grips — 29 October 2026

The old hold used original model coat/beard/ring bounds after changing clothes.
Cache actual selected torso bounds instead, excluding backpack/head/neck/legs.
The Heavy support hand also lost its own shoulder protraction when unreachable.
Keep that baseline active; add a continuous extra clavicle yaw up to 0.65 rad
and, for short broad rigs, at most 0.06 extra armature units of carry pull under
the existing body/stock/right-arm constraints. Static proportions/bounds are
computed once; there are no new draw calls, textures, vertices or frame mesh
rebuilds. Source rigs, animations and gameplay weapon parameters are retained.

105 client tests pass, including actual segment contact (<0.035 model units),
IK weight >0.9 and bounded shoulder yaw over three idle phases for both Heavy
rigs with SMG/shotgun/snow cannon. Backpacks do not change the cached torso
bounds. Strict types have zero errors/warnings and builds pass. Script/server
checks are unchanged (13/198; 316 total). Close/four-view WebGL2 captures and
real game 30 -> 29 -> 30 fire/reload pass with finite muzzle positions, painted
crawler/live player labels and zero browser errors. Records/captures:
`docs/qa/weapon-grips-2026-10-29.json` and associated images. These are cloud
software-renderer checks, not native M4 performance/thermal measurements.
Hand/palm sculpting and shoulder/garment transitions remain visibly unfinished.


### Closed hand anatomy and rigid watches — 29 October 2026

The first donor-hand transfer was visually rejected: exporter roll differences
and the donor's irregular surfaces produced bulky, torn fingers. The shipped
approach instead constructs a closed anatomical hand from owner-rig landmarks,
with a palm, thumb web, rounded digits and subdued joint creases. Offline union
and decimation cap both hands at 2,004 vertices / 4,000 triangles. Retarget using
palm axes and real finger lengths. Full native matching hands and wrist-only
fallbacks remain. Shared body geometry carries the data in its existing draw;
no added texture/material/sampler, no per-frame remeshing. Geometry rises modestly
on compatible replacement hands; native M4 thermal/FPS benefit is not claimed.

Semantic tags stop cutting wrist accessories in half. The complete watch stays
rigid on ForeArm, with a band around the wrist, case, dial and two clock hands.
Thumb grip curl increases. Full screenshot acceptance remains open, particularly
shoulder/garment transitions and native painted faces.

Validation: 14 script / 107 client checks pass, 198 server checks unchanged;
strict types and production builds pass. Settled WebGL2 capture has zero browser
errors. `docs/qa/closed-hands-2026-10-29.json` records scope, counts and limits.
Owner now reports cow-skill/crawler-driving freezes: fix those before more art
or autonomous-cow behaviour. Longer alphorn/cleaner animations are also requested.


Freeze stability now has priority: the owner reports all three cow skills and
crawler driving plus firing on Chrome 156 arm64. Audio lifecycle/automation
cleanup and exception isolation are implemented; WebGL2 becomes the default.
The native-Mac root cause remains unconfirmed. This does not close screenshot
acceptance or claim M4 thermal/FPS results. Longer alphorn/animation cleanup
and occasional autonomous playable-cow grazing/ramming are explicitly requested
next, with both teams eligible for the cow's target selection.

Actual default-WebGL2 validation: all three cow Q/E/T moves emitted; crawler
driving with eight separate cannon shots passed >90 s / >30 rendered frames
with no browser errors. Full map, physics and real network remain in the test.
Evidence: `docs/qa/freeze-stability-2026-10-29.json` and crawler capture. Native
Chrome/M4 acceptance remains open; cloud software FPS is not a benchmark.


### Long alphorn and autonomous playable cow — 29 October 2026

The owner requests less fragmented/pixelated figures, more detailed weapons and
ability animation, a substantially longer alphorn and occasional cow grazing or
ramming people from either faction. The alphorn now spans about 3.4 authored
metres, with smoother 3D tube/bell sections, mouth anchoring and a gentle breath
pulse. Its short-arm hold now adapts the clavicle instead of displacing the
mouthpiece by up to 0.08 model units. Three rigs pass mouth/grip/ground checks.

The playable cow gets bounded ordinary-input antics, grass-only grazing and
faction-neutral human targeting, with immediate player override and stopping-
path probes/braking. Replicated grazing uses an existing spare flag bit; no
new packet bytes, actor, per-frame mesh generation or attack bonus. Full checks
plus focused braking/motor/codec regressions and types/build pass. Broader art
acceptance remains open: clean shoulder/garment fragments and old native faces
next, then detailed weapon/world artwork. Native M4 acceptance remains open.

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


### Closed arm cleanup verified (29 October 2026)

Closed the true wrist/medial shoulder boundaries by following mesh edge loops;
removed connected donor garment overhangs, smoothed and bounded the source.
Analytical smooth arm/elbow/wrist weights replace donor hips/legs/head/spine
contamination. Source sculpt 3,400→2,578 triangles; settled bare Heavy body
25,108→24,286, one submesh. No new runtime mesh generation/draws.

Solid selected skin replaces painted arms. Curl atlas compaction preserves the
curl tile's pixel density while reducing the shared pair from estimated
6.67 to 3.33 MiB RGBA8+mips. All 12 rendered skin RGB probes pass; four real
wardrobe variants and two settled weapon holds have no browser/shader errors.
Evidence: docs/qa/closed-arms-2026-10-29.json and close/wardrobe captures.
Remaining: old native face paint, detailed garments/weapons, complete screenshot
acceptance, native Chrome/M4 freeze/thermal acceptance. Do not mark art complete.

Validation: full 14 script / 201 server / 125 client tests pass (340 total),
including the 15-minute simulated round soak. Strict types report zero errors
and warnings; production builds pass. No test timeout was increased.


29 October — owner map-access override: centred human follow camera replaces
the old lower-left offset. Closed building/harbour/station/coaster risers and
thick building walking slabs; valley platform/route alignment; open cabin end
portals, floor-clear interior feet and eight-second station dwell. Docked
inside exits require clear platform support. Actual brake grips match hitscan,
controls avoid docking hulls and get matching solid pedestals. Authoritative
events animate the existing handle meshes with translated two-second-stop
feedback. No extra texture pass or per-frame geometry, protocol stays 13.
Browser evidence and full checks are recorded with this increment; broader
character/reference acceptance and native Mac thermal acceptance remain open.

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


### Overall graphics pass — 29 October 2026

Owner requests optimizing the whole game presentation while retaining the
M4/laptop budgets, centred camera and verified map repairs. Global lighting
now blends restrained cel steps with continuous shape shading; cooler bounce,
reduced rim/specular glare and quieter ink separate cloth, skin, timber and
terrain. Meadow/fir/palm colours are less fluorescent and meadow variations
are continuous, without the old thresholded vertex patches. Distance haze
separates background planes; cold/golden weather retains its own grading.
Neutral lagoon water is turquoise with derivative-filtered highlights and
slower sparkles, reducing subpixel flicker. Native/painted character textures
use their natural mip footprint, without the extra negative sharpening bias.
Skin selection, outfits, source assets and geometry are unchanged.

Sky clouds form a connected shelf and six smoothly blended puffs per group.
Eight groups replace twelve: maximum circle evaluations 108→48. Periodic
angle wrapping uses fract arithmetic instead of sin/cos/atan for every group.
World shading removes three albedo power evaluations; matte surfaces skip
the two specular powers. These are shader-cost reductions, not measured native
M4 FPS/temperature claims. Texture sizes, scene geometry, shadow/MSAA/pixel
budgets, 45 FPS default and the two comic/FXAA passes stay unchanged.
Cabin follow pivot is 2 m so the overhead rope clears the lens; the controlled
player remains horizontally centred and the previous map interactions stay.

Real WebGL2 bridge/harbour/summit captures, four native wardrobe/weapon variants
and all 12 selected skin RGB probes pass without browser errors. Nine WGSL
material configurations compile (sky, water, world, paving, terrain, textured,
soft/native wardrobe and contour); cloud WebGPU reports a context-loss/restore
warning, so this is compilation coverage, not complete WebGPU gameplay/native
acceptance. WebGL2 remains the compatibility default. Evidence is recorded in
docs/qa/graphics-overall-2026-10-29.json. Full target-model/art acceptance stays
open; do not call this exact screenshot parity or finished later milestones.

Validation: 14 script, 211 server and 128 client cases verified (353 total).
Two unchanged server cases hit their existing limits in the full run, then
passed separately without timeout changes (3.21/7.59 s versus 5/15 s limits).
All browser captures and skin probes pass; 9 WGSL variants compile. Shader
cost reductions are not a native-Mac FPS/temperature benchmark.
Strict types report zero errors/warnings and production builds pass.


### Reference forms and continuous wardrobe anatomy — 29 October 2026

The owner again asks to continue until the screenshot looks right. Replaced
remaining large ground paper props with bounded opaque dressing, varied rock
planes/separate snow caps, and blocky minimap heights with interpolated contours.
All loaded soldier outfits now use the same closed head, a fitted closed beard,
shorter cheek-clearing hair, curved feather, rounded goggles and a tailored green
waistcoat over retained native sleeves. Centred follow pivot/distance are now
1.50/3.60 m so normal-view feet clear the HUD. Texture/post/FPS budgets and
protocol 13 stay; original assets, physics/layout and paving are unchanged.

Full tests pass: 14 script, 211 server, 136 client (361); strict types report
zero errors/warnings and builds pass. Beard bake is reproducible through the
full wardrobe-assets command; its 1,536 triangles replace the discarded generic
beard in the same draw. Real dressing depth, global budget, contour holes/edges,
head continuity and camera framing have regressions. Browser evidence follows
with this increment. Continue judging the actual game against the image: these
checks alone do not establish visual acceptance or native M4 performance.

The six-rig render comparison additionally found shirt fragments labelled as
sleeves across the chest and a missing native-trouser calf when changing shoes.
Fitted-vest sleeves now reject those off-arm fragments; replacement shoes keep
a continuous trouser calf. All three new regressions fail before the fix and
pass afterwards. The final full client suite has 136 passing cases; script/
server remain the passing 14/211 from the full run, with no timeout changes.

Browser evidence: `docs/qa/reference-forms-2026-10-29.json`, six-rig wardrobe,
real network scene and harbour/summit captures. Final six bodies use
35,584 / 24,286 / 23,674 / 31,927 / 21,744 / 19,997 triangles, one draw each.
Static map vertex count is 1,743,468 versus 1,715,331 (+28,137), with no new
textures/post pass. Complete target acceptance remains open; continue original
garment waist fringes, sculpt proportions, clouds and contact-shadow refinement.
