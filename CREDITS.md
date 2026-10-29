# Credits

## Owner-supplied art

All of the following was supplied by the project owner (generated with Google Gemini) and is
used as 2D UI art with the owner's permission, under the same status as the supplied music
beds below. None of it is third-party, stock or EA/Battlefield material.

| File | Use |
| --- | --- |
| `apps/client/public/art/cover.jpg` | Cover poster; fallback main-menu composition when no key art is present. |
| `apps/client/public/art/menu-keyart.jpg` | Main-menu key art (16:9, no lettering), full-bleed menu backdrop. |
| `apps/client/public/art/scene-01.jpg` … `scene-08.jpg` | Loading-screen backdrops (one per load, slow pan) and the error-screen backdrop. Cropped to 1024 × 500 so the HUD painted into the source images is not shown. |
| `apps/client/public/art/icons/<id>.png` (16 tiles) | Painted weapon slot tiles in the HUD dock (`smg`, `shotgun`, `sniper`, `bazooka`, `lmg`, `silenced_pistol`, `knife`, `snow_cannon`, `sand_flamer`, `crossbow`, `halberd`, `umbrella`, `horn`) and three mascot ability tiles (`mascot_cow_horns`, `mascot_cowbell`, `mascot_coconut_roll`) reserved for the mascot abilities. |
| `apps/client/public/art/icons/skills/<id>.png` (16 tiles) | Painted class-skill tiles for the Q / E / T buttons (`heal_snack`, `ram_sprint`, `battle_shout`, `armor_plate`, `barrel_blast`, `ground_slam`, `cloak`, `smoke_bomb`, `grapple_dash`), the mascot moves (`horn_charge`, `hoof_stomp`, `cowbell_clang`, `turbo_roll`, `ground_pound`, `milk_splash`) and the `wrench` repair prompt icon. |
| `apps/client/public/art/comic/<id>.png` (12 stickers) | Painted onomatopoeia for the HUD popups (`aaaargh`, `bang`, `boing`, `boom`, `bouch`, `honk_honk`, `mooo`, `pling`, `plosh`, `ponk`, `splash`, `tock_tock`). The white sticker border was removed so the ink outline is the silhouette. A language whose word differs (for example German `PENG!`) draws the word with CSS comic lettering instead (`comic.<id>.sprite` in the dictionaries). |
| `apps/client/public/art/crests/crest_alpine.png`, `crest_lagoon.png` | Faction crests for the identity chip, kill feed, death banner, loading screen and wardrobe (downsized to 256 px). |

The painted tiles, stickers and crests are loaded optionally: if a file is missing, the HUD draws
its procedural SVG pictogram, CSS lettering or SVG crest instead. The id-to-file table lives in
one place: `apps/client/src/components/icons/painted.ts` (`TILE_FILES`, `COMIC_STICKERS`).

## Painted world art (panorama, clouds, detail textures)

Derived for this project from the owner-supplied Gemini source sheets in `art-src/gemini/` (listed
in `art-src/gemini/README.md`) and processed locally with PIL and numpy, without external
services. Same status as the owner art above. Every file is optional: the look falls back to its
procedural sky, clouds, detail tiles and water foam when one is missing (contract in
`apps/client/src/rendering/art-assets.ts`).

| File (under `apps/client/public/art/`) | Source (under `art-src/gemini/`) | Processing |
| --- | --- | --- |
| `sky/horizon-panorama.jpg` | `gemini-panorama-alps.webp`, `gemini-panorama-lagoon.webp`, `gemini-panorama-trans-a.webp`, `gemini-panorama-trans-b.webp` | 4096 × 1024 seamless 360° band: the four strips joined along min-cost seams, the sky repainted as one shared gradient with the cloud-sheet clouds re-scattered behind the peaks, then upscaled (Lanczos). Horizon at v = 0.717, u = 0 faces north. |
| `clouds/cloud-01.png` | `gemini-clouds.webp`, cloud 1 (reading order) | Keyed off the magenta ground, despilled, upscaled to 1024 × 412. |
| `clouds/cloud-02.png` | `gemini-clouds.webp`, cloud 2 | Keyed and despilled, upscaled to 1024 × 497. |
| `clouds/cloud-03.png` | `gemini-clouds.webp`, cloud 3 | Keyed and despilled, upscaled to 1024 × 547. |
| `clouds/cloud-04.png` | `gemini-clouds.webp`, cloud 4 | Keyed and despilled, upscaled to 1024 × 506. |
| `clouds/cloud-05.png` | `gemini-clouds.webp`, cloud 5 | Keyed and despilled, upscaled to 1024 × 634. |
| `clouds/cloud-06.png` | `gemini-clouds.webp`, cloud 6 | Keyed and despilled, upscaled to 1024 × 483. |
| `clouds/cloud-07.png` | `gemini-clouds.webp`, cloud 7 | Keyed and despilled, upscaled to 1024 × 528. |
| `clouds/cloud-08.png` | `gemini-clouds.webp`, clouds 5 and 2 | Composite of cloud 5 in front of a mirrored cloud 2, 1024 × 483. |
| `tex/snow.jpg` | `gemini-tex-snow.webp` | 512 × 512 seamless grey luminance overlay (R = G = B, mean 128); normalised only. |
| `tex/rock.jpg` | `gemini-tex-rock.webp` | Grey luminance overlay; normalised only. |
| `tex/cobblestone.jpg` | `gemini-tex-cobble.webp` | Grey luminance overlay; the vertical wrap band re-quilted from the same sheet. |
| `tex/wood_planks.jpg` | `gemini-tex-planks.webp` | Grey luminance overlay; resized to 512 px, the top/bottom wrap mismatch spread over 8 rows. |
| `tex/shingles.jpg` | `gemini-tex-shingles.webp` | Grey luminance overlay; four whole shingle rows cut on the source's 512 px period. |
| `tex/log_wall.jpg` | `gemini-tex-logwall.webp` | Grey luminance overlay; log sides only, a stray end cut patched out, 40 px blend along the grain. |
| `tex/grass.jpg` | `gemini-ground-mixed.webp` | Grey luminance overlay; toroidal quilting of 96 px grass patches that avoids snow, mud, fronds and rocks. |
| `tex/sand.jpg` | `gemini-ground-mixed.webp` | Grey luminance overlay; toroidal quilting of 160 px sand patches, ripples and pebbles kept. |
| `tex/water_foam.png` | `gemini-panorama-lagoon.webp`, `gemini-panorama-trans-a.webp` (painted sea) | Alpha foam mask, not a colour tile: white crest streaks keyed off the painted sea, perspective undone and scattered seamlessly to about 10 % coverage. RGB is white, alpha is the foam. |
| `wardrobe/fir-snow.png` | `gemini-sheet-trees.webp`, snowy fir (top left) | Cut-out for the Peak Guard wardrobe stage: white ground flood-filled from the border (outline-bounded, so the painted snow stays), 1 px alpha erode and feather, 190 × 302 at source resolution. |
| `wardrobe/palm.png` | `gemini-sheet-trees.webp`, leaning palm | Same cut-out for the Lagoon League wardrobe stage, 166 × 300. |
| `wardrobe/palm-small.png` | `gemini-sheet-trees.webp`, small palm | Same cut-out, 120 × 128. |

Derived from the same sheets and kept under `art-src/painted-world/`: `tex/<name>_color.jpg`, the
full-colour seamless tiles the grey overlays were made from, and `decals/`, 16 cut-out ground and
prop splats (`snow-patch-01`…`06`, `mud-patch-01`…`04`, `rock-01`, `rock-02` and `palm-frond-01`
from `gemini-ground-mixed.webp`; `log-end-01`…`03` from `gemini-tex-logwall.webp`). The painted
world (2V) ships byte-identical copies of all eight colour tiles in `public/art/tex/` (the
`detailColor` atlas of `rendering/detail-textures.ts`) and of the 16 decals in `public/art/decals/`
(ground decals in the sprite atlas).

### Painted world sprites and facades (2V)

| Files | Source | Processing |
| --- | --- | --- |
| `sprites/<id>.png` (46) | `gemini-sheet-trees.webp`, `gemini-sprites-vegetation.webp`, `gemini-sprites-clutter.webp` | Firs, palms, bushes, boulders, tufts and village/beach clutter cut out, keyed and despilled; height, pivot and biome tags per sprite in `sprites/manifest.json`. Packed into one atlas at load (`rendering/sprite-atlas.ts`). |
| `facades/<building>-<panel>.png` (24) | `gemini-facade-gasthof.webp`, `-bistro`, `-tikialm`, `-towerc`, `-towerb`, `-lighthouse` | Front/side/back/roof panels split from each 2×2 sheet and magenta-keyed (alpha follows the silhouette); panel metrics in `facades/manifest.json`, mapped onto the buildings by `rendering/map/facades.ts`. |

Like the other painted world art these are optional: without the manifests or images the map keeps
its procedural trees, rocks, clutter and building faces.

## Painted 3D characters (Meshy)

The soldier `*-wardrobe.json` and `*-wardrobe-mask.webp` files are derived locally
from these same owner-supplied meshes/paint. They preserve the attribution and
licence of the originals; they introduce no external game assets.


The six playable soldiers' painted, rigged and animated 3D models were generated by the project
owner with **Meshy** (meshy.ai, image-to-3D with the Mixamo-style auto-rig and clip library) from
the owner-generated (Google Gemini) A-pose references in `art-src/for-3d/`. The Creepy Mountain
Girl was generated and auto-rigged in Meshy by the owner from a reference image the owner
supplied, which is not kept in this repository. The Hot Beach Girl is Meshy's static image-to-3D export
(`art-src/meshy/meshy-lagoon-beachgirl-static.glb`) of an original character image the owner
supplied (generated with Google Gemini), which is not kept in this repository either. She was rigged and animated
in the project with Blender (`art-src/meshy/tools/autorig_beachgirl.py`): the skeleton and the
Walking / Walk_Backward clips are retargeted from the Creepy Mountain Girl, Cheer from the Lagoon
allrounder, and Idle is a procedural pose baked by the script.
Meshy output generated on the free plan is licensed **CC BY 4.0**
(<https://creativecommons.org/licenses/by/4.0/>); the attribution is kept for every model here,
whatever plan it was generated on. Attribution: "3D model generated with Meshy
(meshy.ai)". The untouched downloads are in `art-src/meshy/`. `bun run models`
(`scripts/optimize-models.ts`) processes exactly the shipped models below: it drops the
metallic-roughness map, encodes the painted 2048 px textures as WebP, and bakes each model's
animation clips into its own GLB. Clips a soldier lacks are retargeted at build time from the
other soldiers. The two drifter characters keep only their own clips.

| File | Character | Source | License |
| --- | --- | --- | --- |
| `apps/client/public/models/alpine-allrounder.glb` | Peak Guard allrounder | `art-src/meshy/meshy-alpine-allrounder.glb` | CC BY 4.0, 3D model generated with Meshy (meshy.ai) |
| `apps/client/public/models/alpine-heavy.glb` | Peak Guard heavy | `art-src/meshy/meshy-alpine-heavy.glb` | CC BY 4.0, 3D model generated with Meshy (meshy.ai) |
| `apps/client/public/models/alpine-infiltrator.glb` | Peak Guard infiltrator | `art-src/meshy/meshy-alpine-infiltrator.glb` | CC BY 4.0, 3D model generated with Meshy (meshy.ai) |
| `apps/client/public/models/lagoon-allrounder.glb` | Lagoon League allrounder | `art-src/meshy/meshy-lagoon-allrounder.glb` | CC BY 4.0, 3D model generated with Meshy (meshy.ai) |
| `apps/client/public/models/lagoon-heavy.glb` | Lagoon League heavy | `art-src/meshy/meshy-lagoon-heavy.glb` | CC BY 4.0, 3D model generated with Meshy (meshy.ai) |
| `apps/client/public/models/lagoon-infiltrator.glb` | Lagoon League infiltrator | `art-src/meshy/meshy-lagoon-infiltrator.glb` | CC BY 4.0, 3D model generated with Meshy (meshy.ai) |
| `apps/client/public/models/alpine-ghostgirl.glb` | Creepy Mountain Girl (drifter) | `art-src/meshy/meshy-alpine-ghostgirl.glb` | CC BY 4.0, 3D model generated with Meshy (meshy.ai) |
| `apps/client/public/models/lagoon-beachgirl.glb` | Hot Beach Girl (drifter; Meshy's static export, rigged in the project) | `art-src/meshy/meshy-lagoon-beachgirl.glb` | CC BY 4.0, 3D model generated with Meshy (meshy.ai) |
| `apps/client/public/models/hen.glb` (+ `hen-basecolor.webp`, 1024²; simplified to 7.8k triangles) | Wandering hen (ambient critter) | `art-src/meshy/meshy-hen.glb` | CC BY 4.0, 3D model generated with Meshy (meshy.ai) |
| `apps/client/public/models/vehicle-fondue-crawler.glb` (+ `-basecolor.webp`; simplified to about 8k triangles) | Armored Fondue Crawler | `art-src/meshy/meshy-vehicle-fondue-crawler.glb` | CC BY 4.0, 3D model generated with Meshy (meshy.ai) |
| `apps/client/public/models/vehicle-coconut-tank.glb` (+ `-basecolor.webp`; simplified to about 8k triangles) | Coconut Beach Tank | `art-src/meshy/meshy-vehicle-coconut-tank.glb` | CC BY 4.0, 3D model generated with Meshy (meshy.ai) |
| `apps/client/public/models/vehicle-flamingo-boat.glb` (+ `-basecolor.webp`; simplified to about 8k triangles) | Tactical Badi-Flamingo | `art-src/meshy/meshy-vehicle-flamingo-boat.glb` | CC BY 4.0, 3D model generated with Meshy (meshy.ai) |
| `apps/client/public/models/vehicle-sidecar.glb` (+ `-basecolor.webp`; simplified to about 8k triangles) | Sidecar Motorcycle | `art-src/meshy/meshy-vehicle-sidecar.glb` | CC BY 4.0, 3D model generated with Meshy (meshy.ai) |
| `apps/client/public/models/mascots/cow.glb` | Alpine Cow mascot (bell and ear bones added by `scripts/optimize-mascots.ts`) | `art-src/meshy/meshy-cow.glb` | CC BY 4.0, 3D model generated with Meshy (meshy.ai) |
| `apps/client/public/models/mascots/coconut.glb` | Battle Coconut mascot (optional shell, `?coconutShell=meshy`) | `art-src/meshy/meshy-coconut.glb` | CC BY 4.0, 3D model generated with Meshy (meshy.ai) |

The other Meshy downloads in `art-src/meshy/` (biplane, rowboat, gondola, NPC cow) are not shipped yet.

### Mascot art

| File | Use | Source |
| --- | --- | --- |
| `apps/client/public/art/mascot/coconut-faces.png` | The coconut's 12 painted expressions | owner-generated (Google Gemini) sheet `art-src/gemini/gemini-coconut-faces.webp` |
| `apps/client/public/art/mascot/lei-flowers.png` | The coconut's flower garland | owner-generated (Google Gemini) sheet `art-src/gemini/gemini-lei-flowers.webp` |
| `apps/client/public/art/mascot/coconut-husk.jpg` | Painted husk of the default coconut shell | painted from the owner's coconut design sheet `art-src/gemini/gemini-sheet-coconut.webp` |

## Music

The five music beds in `apps/client/public/audio/` were supplied by the project owner and are
used with permission. The track registry is `apps/client/src/audio/tracks.ts`.

| File | Title | Use |
| --- | --- | --- |
| `lederhosen-on-the-sand.mp3` | Lederhosen on the Sand | Main-menu theme. |
| `skiing-the-sandbar.mp3` | Skiing the Sandbar | Round loading, round end and death / killer-cam bed. |
| `midday-at-the-chalet.mp3` | Midday at the Chalet | Calm gameplay bed. |
| `surfing-the-alpine-slope.mp3` | Surfing the Alpine Slope | Medium-intensity gameplay bed. |
| `the-cactus-gambit.mp3` | The Cactus Gambit | High-intensity gameplay bed. |

All other sound (effects, ambience, gibberish voices) is synthesised at runtime.

## Fonts

- Luckiest Guy (display, Apache License 2.0; copyright 2010 Brian J. Bonislawsky DBA
  Astigmatic) and Fredoka (body, SIL Open Font License 1.1; copyright 2016 The Fredoka Project
  Authors), bundled through `@fontsource/luckiest-guy` and `@fontsource/fredoka` and served
  from the app bundle, not a CDN. The full licence texts ship with each package:
  `node_modules/@fontsource/luckiest-guy/LICENSE` and `node_modules/@fontsource/fredoka/LICENSE`.


The derived `soldier-head.json`, its `soldier-head-*.webp` paint pair, and reusable
Afro geometry use the owner's original Alpine Infiltrator and Lagoon Allrounder
Meshy sculpts under the Meshy attribution/license above. The clean skull, eyebrow
and hair closure surfaces are procedural additions. `scripts/bake-soldier-head.py`,
`bake-head-atlas.py` and `bake-soldier-afro.py` document the transformations. Original
source files are unmodified; no Battlefield/EA artwork or models are included.


`soldier-body.json` and the arm tile inside the shared soldier atlas derive from
the owner's Lagoon Heavy Meshy model under the same attribution/license above.
`scripts/bake-soldier-body.py` extracts the sculpt and repacks its original paint;
the runtime only retargets it to the existing soldier rigs. Original source files
are unmodified.


The reusable arm derivative also clips the original donor hand fragments at the
wrist, preserving/interpolating the owner's UV paint, normals and skin weights.
This transformation is implemented in `scripts/bake-soldier-body.py`; the owner's
original Meshy GLB remains unchanged.


The closed wrist/palm caps, rounded procedural fingertips and wrist-only grip
are original project geometry. The complete wrist cross-section is derived
from the owner's Lagoon Heavy Meshy sculpt, clipped/capped in the wardrobe
bake; original source GLBs, paint and animation files remain unchanged.


The configurable-head ellipsoid eye whites and geometric iris, pupil and glint
surfaces are original project art. They follow the owner's shared scout head
coordinates, without modifying the source GLBs or importing external assets.


The closed configurable head is an offline voxel union/refinement of the
owner's scout sculpt and the project's scalp, with bounded decimation. The
project's geometric lip contour follows that surface and selected complexion.
The original owner GLBs, source images and animations are unchanged.


The closed replacement hand sculpt, palm/finger lofts, thumb webs, neutral crease
shading and watch case/dial/hands are original project geometry. The hand sculpt
follows joint landmarks from the owner's Alpine Allrounder rig; its source hash
records that anatomical reference, not copied source hand surfaces. Blender
performs an offline union/smoothing/decimation on generated geometry only.
Owner GLBs, source paint and animations remain unchanged.


The extended alphorn tube/bell, smooth mouthpiece and restrained breath pose
are original project geometry/animation. The cow's input director and replicated
graze pose reuse the original cow rig and existing project locomotion/ram rules.
No source GLB, owner paint or external game asset has been modified/imported.


The closed solid arm sculpt derives only from the owner's Lagoon Heavy rig
and arm surfaces. Offline limb-envelope cleanup, boundary closure, smoothing,
retopology and anatomical weights are project work. Solid selected skin and
neutral crease shading replace source arm paint; curl paint remains the owner's
original tile at its existing pixel density. Source GLBs, images and clips are
unchanged. Blender performs offline processing only; no external game assets.
