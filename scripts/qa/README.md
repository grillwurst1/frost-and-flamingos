# Real-browser playability soak

Run this after the regular `bun run test`, `bun run typecheck` and `bun run build`
checks. It uses a real Chromium page, WebGL2, Web Audio, binary networking and
normal keyboard/mouse input. Development endpoints arrange a vehicle seat and
an out-of-world respawn; they do not replace the physics/render loop or reset
ability cooldowns.

Start a dedicated local stack with no other players:

```sh
FF_NO_BOTS=1 FF_DEV_TOOLS=1 bun run dev
```

With Playwright installed in your tooling environment, run:

```sh
PLAYWRIGHT_MODULE=/absolute/path/to/playwright-core/index.mjs \
CHROMIUM_PATH=/absolute/path/to/chrome \
FF_QA_SECONDS=600 FF_QA_OUTPUT=/tmp/frost-playability \
node scripts/qa/playability.mjs
```

`PLAYWRIGHT_MODULE` defaults to `playwright` and `CHROMIUM_PATH` to Playwright's
installed Chromium. No production dependency is added. `FF_QA_URL` changes the
local base URL. `FF_QA_SOFTWARE=1` explicitly selects SwiftShader in Cloud; leave
it unset when checking a native GPU. The canvas is 800×450 at low quality, so
this run checks stability and resource lifetime, not full-resolution throughput.
Keep the stack running and avoid other renderers, bakes or tests during the soak.

The script checks:

- Connection, deployment and actual cow Q/E/T activation twice each, followed by
  advancing rendered frames.
- A queued combat-class change applied by the existing out-of-world respawn
  guard. A cow that already acted does not change class merely by opening its
  menu; the same next-respawn rule applies as during combat.
- Ten real minutes of combined driving and cannon fire by default, with live
  snapshots, finite positions, driver occupancy and bounded input/projectile
  queues. It requires actual movement and at least six shots.
- Samples of meshes, geometries, materials, texture wrappers/internal textures,
  JS heap and connected audio-node IDs every 30 seconds. The audio probe retains
  numeric IDs only, never nodes. Warmed scene resources may vary with transient
  effects; persistent growth beyond the recorded tolerance fails the run.
- Pause/resume and return/deploy cycles, Chrome page freeze/resume, context loss,
  uncaught errors, failed HTTP responses and a final screenshot.

`playability.json` contains every checkpoint and any failure. A passing run is
evidence for these exercised paths. It does not establish universal crash-free
operation, native M4 temperature/FPS, WebGPU acceptance, or all remaining
milestones. JS heap measurements exclude GPU and native decoded-audio memory.

## Gletscherpass reference scene

`scripts/qa/reference-scene.mjs` enters the public `/?scene=reference` menu,
checks the authored spawn and loaded modular hero, records the bounded crawler/
smoke draws, walks/jumps with real input and saves an actual renderer capture.
Use the same Playwright/Chromium/output/software environment variables above.
The public-entry capture uses 1280×800 at Medium; subsequent input checks and
the isolated mechanics flow use 800×500 Low. `FF_QA_REFERENCE_LOW=1` also makes
the public capture Low. `FF_QA_REFERENCE_CLOSE=1` adds a posed real 3D avatar
inspection with the wardrobe overlay hidden only for that diagnostic capture. Do not infer native GPU throughput from
Cloud SwiftShader timings.

For an isolated capture/board/drive/fire/exit flow, start a fresh stack with
`FF_NO_BOTS=1 FF_DEV_TOOLS=1 bun run dev`, then set
`FF_QA_REFERENCE_MECHANICS=1`. Only the starting bridge/vehicle locations are
staged through loopback development endpoints, scoped to the reference room;
objectives, F boarding, driving, shooting and F exit use ordinary server rules.
This includes sixty real seconds of combined driving/shooting and resource
checkpoints. Run without that flag and without `FF_NO_BOTS` for the live cast.
The reference scene itself works without development tools or URL teleports.

`FF_QA_REFERENCE_FIRE=1` adds an isolated real-input chalet extinguishing test
(requires `FF_NO_BOTS=1 FF_DEV_TOOLS=1`). Development staging arranges position
on the supported roof guard pad and aim; slot 3, mouse fire, weapon range, line of sight, hit processing and the
binary map-state update are normal gameplay. `FF_QA_REFERENCE_CAPTURE_ONLY=1`
saves only the public entry/render checkpoint, useful for the live cast at
Medium. Protocol 16 rejects old connected clients; refresh both build ends.

The input run acquires pointer lock before sending mouse input and records
the actual control bits, selected slot, outgoing fire count and last fire packet.
It requires at least two ordinary shots before waiting for extinguishing.
The fire checkpoint also checks the fixed five flame quads / forty smoke puffs.
Do not edit client code/assets during a run: Vite hot reload invalidates it.
The close option saves both full-body and face views of the actual loaded,
posed 3D wardrobe model at 1280×800 Medium. These are diagnostic inspection
views; `reference-scene.png` remains the unchanged public gameplay camera.
`FF_QA_REFERENCE_THREE_QUARTER=1` adds a three-quarter diagnostic body view
to the close captures. This rotates the real wardrobe avatar, then restores
its facing before the boot inspection; it does not change the public camera.

Gletscherpass is now the default at `/`; `FF_QA_REFERENCE_ROOT=1` verifies that
entry instead of the explicit reference alias. The menu must link to
`/?scene=field`, which the full-field playability script uses explicitly.
`FF_QA_REFERENCE_CAST=1` additionally requires all six live cast labels in the starting view (run with bots enabled). Driver staging uses
the shared crawler spawn/yaw; F and, if necessary, C select the actual driver.

## Painted material equivalence

`scripts/qa/material-equivalence.mjs` compares real WebGL2 pixel readbacks with
the painted surface shader from commit `022fb93`. It uses the same browser,
URL/output and software-renderer variables. A deterministic multi-surface grid
exercises dominant/triplanar modes, painted/unpainted material and near/fading/far
detail. The grid must contain actual non-background coverage; it is a controlled
shader comparison, not a scene screenshot or native GPU throughput benchmark.

On slow Cloud hosts, long existing physics cases can exceed Bun's default
five-second wall-clock test budget. Preserve their assertions and run the complete
server coverage with `bun test --timeout 15000 ./apps/server/src ./apps/server/test`.
The source directory contains 21 additional critter cases and must be included.


For current video-format art inspection, set `FF_QA_REFERENCE_VIDEO=1` for
1280×720 Medium. `FF_QA_REFERENCE_WARDROBE_ONLY=1 FF_QA_REFERENCE_CLOSE=1`
records the ordinary public view, opens the real wardrobe and captures posed
full-body, face and boot detail. The close views use a labelled diagnostic camera
and hide the overlay; they are asset inspection, not live combat screenshots.
This avoids a combat death invalidating a lengthy Cloud pose session.

`FF_QA_REFERENCE_SNOW=1` checks ordinary slot-3 firing before any pose inspection.
It now requires positive real HP, an enabled 64-instance cloud pool and an
active GPU transform attribute, rejecting the earlier disabled-pool false pass.
The legacy `FF_QA_REFERENCE_FIRE=1` expects an initially burning test fixture;
the current public village starts cold. Its old capture is not verification of
that newer default. Authoritative cold-start, ignition and extinguishing/reset
behavior is covered in `apps/server/test/reference-fire.test.ts`.
