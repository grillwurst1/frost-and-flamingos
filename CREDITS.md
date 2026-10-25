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
