# Compact physical reference arena — 6 November 2026

Implemented in this checkpoint: independent 128m, 256-segment grid; exact
Rapier triangle sampler; shared per-world terrain/surface/cable queries; real
X-spanning sagging bridge and enterable chalet; four closed stair flights and
coast landing meeting at their actual edges; solid stair/foreground rails;
three reachable cable stations with ordinary F boarding/exiting, roof seats,
H seat changes and emergency brake/shot support; room-specific bot navigation;
shared 17 firs/9 palms; real original cast/vehicles/fire. Protocol 15.

Reference default is (0,23,-20), yaw0, pitch-.3; centred close video FOV .85, distance3.6, pivot1.60.
Full field defaults/motors retained. New reference renderer loads 163,391 stored
map vertices versus 1,420,595 in the published large-map slice. Actual Medium
browser captured all seven labels, instanced GPU transforms and no page/context
errors. No screenshot background or flat replacement for solid actors.

Tests: 15 scripts, 243 server, 157 client across batch/isolated checks. Existing
30s wardrobe timeout passes isolated in24.14s; assertions unchanged. Strict0/0,
production build complete at compact checkpoint. QA artifacts will retain real
browser evidence and distinguish source video frames from demo captures.

The owner has now supplied the gameplay video on upstream master c5d0006.
It supersedes the bridge composition: continue from VIDEO_REFERENCE_WORK.md.
This scene is structural progress, NOT accepted visual parity or completed M5.
Native M4 thermal/FPS measurement and full WebGPU diagnostics remain open.


The bridge composition above is historical. The current protocol16 basin has
continuous actual terrain, two enterable log chalets and gabled gondola roofs
with matching physical ramps. Current camera:3.9m/.85FOV,pivot1.45,pitch-.16.
Follow VIDEO_REFERENCE_WORK.md; no video parity acceptance implied.
