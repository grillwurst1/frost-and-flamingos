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
