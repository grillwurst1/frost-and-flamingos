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
