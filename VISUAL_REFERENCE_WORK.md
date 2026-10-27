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
hero proportions/stance, foreground framing, strong angular gorge silhouette, chalet/bridge/
coast composition, vehicle detail and comic effects still differ. Camera changes must keep
aiming/occlusion functional. Burning/collapsing buildings belong to M6 after M5, not static
fake fire. Use real players/vehicles rather than inventing screenshot names or a decorative cow.
Do not start new M5 toys until the active visual request is handled; M6/M7 are not started.

Cable car itself is verified and replaces interim spawn plates. Bots do not yet ride it;
team balance remains an open M8 check. Other M5 items remain in `MILESTONE_WORK.md`.
