# Gameplay video — active visual target, 6 November 2026

Owner explicitly supplied `gemini_generated_video_e01d97e8.mp4` on GitHub master
and requires recurrent actual demo screenshots. Source merged from c5d0006; never
replace or edit that 7,905,104-byte owner file. 1280×720, 24fps, 10.026667 seconds.
Inspected decoded frames at approximately 0, 3 and 7 seconds, plus extracted first
8 seconds under /workspace/visual-reference/video-target. These are reference
frames, not game captures or evidence of implemented rendering.

This takes priority over the earlier Gemini bridge composition. The video shows
an Alpine snow-basin battle, warm outlined figures, a broad bald orange-bearded
hero with rolled sleeves/lederhosen/brown boots/cuckoo backpack and a large golden
snow cannon. Clear model contours and clothing folds, blue snow shadows, dense
rounded snow banks, overlapping chalet roofs, solid tank treads and cabin, thin
readable cable, large billowing snow impacts. Camera follows the running hero
closely, with a wider combat vista behind him. Several allies/enemies remain
large enough to read. HUD: tickets across the top, compact clock below, round
minimap upper right, four illustrated action slots bottom right, live health
bars over players. Do not ship fake chat, invented network players or scripted
scores to resemble the generated video. Real Conquest rules remain authoritative.

The published basin checkpoint is 92acf50 on master. Its shared world definition
supports an authored compact Alpine basin without loading the full field.
The 7 November pass below continues actual character/cabin art and real browser
comparison; publication of a structural checkpoint is not visual acceptance.
No screenshot background or flat replacement for actors; keep selectable skin
and outfits, articulated animation, solid collision and bounded laptop resources.

Acceptance is OPEN: current scene/character silhouette, snow volumes, camera,
HUD and effects still differ materially. Tests do not establish visual parity.
Native Mac M4 thermals/FPS remain unmeasured; Cloud WebGL2 is a compatibility
check and full WebGPU shader-module diagnostics remain unverified.

First implementation: live top score/clock, round actual-grid minimap, broader bald/orange-bearded heavy preset with brown boots (saved outfits preserved), closer centred 3.6 m/.85 FOV camera and small real heightfield snow drifts. Camera update previously restored the global FOV; now respects the reference profile. Capture and compare before claiming any visual acceptance.

## Alpine basin art pass in progress

Owner explicitly reiterated graphics priority. Replaced the bridge composition:
filled actual central ravine into continuous snowy terrain, removed central bridge/
waterfall/foreground fence, added second enterable chalet, placed crawler left and
moved cast onto readable snow hills. Snow is real shared grid/collision geometry.
Protocol16; village starts unburned, but existing ignition/extinguishing and reset
work (initial-burning test fixture explicit). Actual player HP bars, local tag hidden,
warmer heavy skin preset5, white independent knee-sock layers over retained skin,
longer lederhosen and red clock roof. Fitted snow-cannon hip hold with reachable
side support grip, gold body and hose loop. Stronger full-resolution character ink,
quieter surface colour/bump, wood/snow gabled station roofs and matching ramp
colliders, routing around both chalets. No copied frame behind the gameplay.

Snow-stream original solid puff effect: fixed64 global instances in2draws, no
per-shot mesh/material/texture creation, camera cull beyond60m. Both shader
languages reuse the existing instanced form-lighting shader. 500burst pool test
passes, expires/disposes. Actual WebGL2 first basin capture saw world0attribute3,
64instances and no console/context/HTTP failures. First cloud shot around the high
old hold exposed an ugly arms-up pose; lower grip/side grip changes now in review.

Evidence in /workspace/visual-reference/video-basin-first (first layout/FX),
video-character-pose (latest gameplay + front/face detail, camera override explicitly
for asset inspection). Do not call first-layout capture the final current appearance.
The old compact checkpoint6241995 is already on master, source video merged from
c5d0006. The basin/asset pass was pushed as 92acf50; subsequent passes require visual review/checks,
update4mandatory docs and save real artifacts before publishing. Exact video
acceptance remains OPEN. Continue actual clothing/character art if needed after
review; adding polygons alone does not prove fidelity.


## Validated basin / outfit checkpoint

Real cream shirt is selectable as torso_alpine_shirt, rather than recolouring
the green waistcoat. New reference bodyType.12 (0=sturdy,1=slim),ginger index0,
Alpine-heavy shared head frame1.36 (all headgear selections), aim-stabilised
head independent of the retargeted idle's downward nod. Eye/beard/hair/hat
placements share the corrected frame; base complexion remains independent.
Golden cannon's physical side support is on +X (holder left), verified through
three idle phases for both Heavy rigs. Earlier -X grip was unreachable.

Known open issue: close-up boot edges still look noisy. The donor-fur diagnosis
was incorrect: Alpine-heavy already uses the generated closed boots. No
redundant native-feet override retained. Inspect actual lace/sole geometry and
post contours before claiming a footwear fix. Chalet decoration, landscape
composition, cast scale, character sculpt/clothing and effects still differ
from the owner video; exact visual acceptance remains OPEN.


Validation for this basin checkpoint:15 script cases,223 server/test cases,
21 server/src cases and158 client cases pass across batch and isolated runs.
The first client run exposed an actual snow-cannon support grip on the wrong
side; corrected to the holder's left and all six Heavy grip cases pass. The
subsequent client batch passed156 cases; two wardrobe cases hit Cloud wall-clock
timeouts. Unchanged isolated reruns pass: mountain-boot idle soles849.60ms and
all headgear13.650s. Strict diagnostics:0errors/0warnings; production builds pass.
The new head regression checks shoulder clearance, unchanged anatomy across
headgear choices and forward-facing aim after the actual animation updates.
These checks establish behavior, not accepted visual quality.

Actual1280×720Medium WebGL2 basin/front/face captures and review are retained
in docs/qa/video-basin-2026-11-06.png, video-heavy-pose-2026-11-06.png,
video-heavy-face-2026-11-06.png and video-basin-browser-2026-11-06.json.
0 page/HTTP/context failures,156draws,202925stored map vertices,17shared firs.
Face/pose are labelled dev-camera asset inspection; default scene is ordinary
public entry. A later cloud screenshot was rejected because the player died;
the helper now requires live HP and an enabled GPU pool before accepting it.
Do not use that rejected capture as FX evidence.


## Video character and cabin refinement — 7 November 2026

The shared face's feathered crease ribbons are 2.2 times wider and offset 1.25 mm
from the fitted skin instead of 0.55 mm, retaining exactly 4,251 vertices / 7,948 triangles.
This addresses the subpixel dash pattern seen in actual close-up captures without
adding geometry, textures or draws. Head hash and all six wardrobe/cache revisions
are refreshed; original owner GLBs and MP4 remain untouched. Heavy eye geometry
is 15% less open, with corrected normals, and generated Heavy torso shells are 20%
wider to meet the shoulders. Skin and outfit selections remain independent.

Both reference cabins now use quiet brown round-log facades with dark timber
frames and no flower-box/heart decoration. Field variants remain unchanged.
The reference follow camera is 3.35 m, pivot 1.35, FOV .85, pitch -.16; control stays
horizontally centred and the camera projection test retains visible soles.

Selected validation: 88 cases pass across asset/hash validation (5), camera (1),
native wardrobe (38) and outfit/footwear/terrain/reference route checks (42) plus two dodge-roll cases.
Visual acceptance against the owner video remains OPEN. Do not equate more
readable face details or passing tests with final sculpt quality. Native Mac M4
heat/FPS and full WebGPU shader diagnostics remain unverified.

7 November validation: strict diagnostics report 0 errors / 0 warnings and production
build passes. Both posed-roll ground-clearance cases also pass. A wardrobe
helper's former 400 px assertion was specific to 800 px input tests; it now checks
the actual responsive stage bounds at 1280 px. Inspection captures remain separate
from the ordinary public-entry screenshot.

Actual Medium 1280×720 public capture and protected wardrobe body/face/boot
inspection pass without page,HTTP or context errors. Evidence:
`docs/qa/video-detail-2026-11-07.json` and `video-detail-*-2026-11-07.png`.
Face crease gaps are reduced, but overall video parity remains open. The boot
close-up exposes floating straight lace bars; the waist facing/belt are too
rectangular. These are findings to fix, not accepted final footwear/clothing.


## Fitted clothing trim — 7 November 2026

Actual boot inspection exposed straight lace bars floating above curved leather.
Laces now follow the same rounded boot cross-section as closed, bevelled ribbons
with five fitted samples. They retain plain lace pigment rather than a leather
texture. Rounded hip facing/belt shells replace protruding rectangular corners;
buckle depth and fitted suspender paths follow the selected shirt dimensions.
These surfaces stay in the existing cached skinned draw, with no new textures,
per-frame fitting or separate trim meshes in the final actor.

Cotton/wool paint modulation is quieter (.17/.14 in both shader definitions),
so modelled folds remain readable. The real wardrobe stage no longer receives
a dark/white colour veil; the panel side keeps its background shade. Diagnostic
close captures hide the entire wardrobe overlay after recording the real UI.

All 69 native/modular wardrobe and independently animated footwear cases pass,
plus both ground-clearance roll cases (71 selected checks). Strict diagnostics
report 0 errors / 0 warnings and the production build passes. Final browser/build review is recorded below. Video parity
and native Mac M4 thermal/FPS acceptance remain open.

Final fitted-trim browser review passes: actual public entry and responsive
wardrobe at 1280×720 Medium WebGL2, six cast labels,0 page/HTTP/context errors.
The boot close-up confirms laces follow the surface and waist corners are rounded.
40,986 hero triangles (+1,408 over the preceding body), 156 initial draws and
193,634 stored map vertices. No throughput/thermal claim from SwiftShader.
Evidence: `docs/qa/video-fitted-2026-11-07.json` and `video-fitted-*.png`.
Ordinary UI capture retains controls; diagnostic body/face/boots hide the overlay
after opening the real wardrobe. Overall video visual acceptance remains OPEN.
