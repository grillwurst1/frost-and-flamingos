# Credits

## Owner-supplied art

All of the following was supplied by the project owner (generated with Google Gemini) and is
used as UI art under the same status as the supplied music beds.

| File | Use |
| --- | --- |
| `apps/client/public/art/cover.jpg` | Cover poster; fallback main-menu composition when no key art is present. |
| `apps/client/public/art/menu-keyart.jpg` | Main-menu key art (16:9, no lettering), full-bleed menu backdrop. |
| `apps/client/public/art/scene-01.jpg` … `scene-08.jpg` | Loading-screen backdrops (one per load, slow pan) and the error-screen backdrop. |
| `apps/client/public/art/icons/<id>.png` (16 tiles) | Painted weapon slot tiles in the HUD dock (`smg`, `shotgun`, `sniper`, `bazooka`, `lmg`, `silenced_pistol`, `knife`, `snow_cannon`, `sand_flamer`, `crossbow`, `halberd`, `umbrella`, `horn`) and three mascot ability tiles (`mascot_cow_horns`, `mascot_cowbell`, `mascot_coconut_roll`) reserved for the mascot abilities. |
| `apps/client/public/art/icons/skills/<id>.png` (16 tiles) | Painted class-skill tiles for the Q / E / T buttons (`heal_snack`, `ram_sprint`, `battle_shout`, `armor_plate`, `barrel_blast`, `ground_slam`, `cloak`, `smoke_bomb`, `grapple_dash`), the mascot moves (`horn_charge`, `hoof_stomp`, `cowbell_clang`, `turbo_roll`, `ground_pound`, `milk_splash`) and the `wrench` repair prompt icon. |

The painted tiles are loaded optionally: if a tile is missing, the HUD draws its procedural SVG
pictogram for that weapon or skill instead. The id-to-file table lives in one place:
`apps/client/src/components/icons/painted.ts` (`TILE_FILES`).

## Fonts

- Luckiest Guy (display) and Fredoka (body), both SIL Open Font License 1.1, bundled through
  `@fontsource/luckiest-guy` and `@fontsource/fredoka`. They are served from the app bundle, not a CDN.
