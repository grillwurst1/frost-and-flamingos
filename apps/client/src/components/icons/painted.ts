import { writable } from 'svelte/store';

/**
 * Optional painted art, supplied by the owner under `public/art/`:
 * weapon, skill and mascot-move tiles in `art/icons/` and the menu key art. Nothing here is
 * required: every consumer renders a procedural fallback until (and unless) the file proves
 * to be a real image. Probing uses `Image`, so a missing file never throws.
 */

export type PaintedState = 'ok' | 'missing';

const BASE = import.meta.env.BASE_URL;

/**
 * THE one place that maps a game id to its painted tile file (relative to `art/`).
 * Mascot move ids (horn_charge, hoof_stomp, ...) are listed with the names the art was
 * delivered under; if the mascot engineer names a move differently, add or rename the
 * key here and nothing else needs to change.
 */
export const TILE_FILES = {
  // Weapon slot tiles.
  smg: 'icons/smg.png',
  shotgun: 'icons/shotgun.png',
  sniper: 'icons/sniper.png',
  bazooka: 'icons/bazooka.png',
  lmg: 'icons/lmg.png',
  silenced_pistol: 'icons/silenced_pistol.png',
  knife: 'icons/knife.png',
  snow_cannon: 'icons/snow_cannon.png',
  sand_flamer: 'icons/sand_flamer.png',
  crossbow: 'icons/crossbow.png',
  halberd: 'icons/halberd.png',
  umbrella: 'icons/umbrella.png',
  horn: 'icons/horn.png',
  // Mascot weapon slots.
  mascot_cow_horns: 'icons/mascot_cow_horns.png',
  mascot_cowbell: 'icons/mascot_cowbell.png',
  mascot_coconut_roll: 'icons/mascot_coconut_roll.png',
  // Class skills (Q / E / T).
  heal_snack: 'icons/skills/heal_snack.png',
  ram_sprint: 'icons/skills/ram_sprint.png',
  battle_shout: 'icons/skills/battle_shout.png',
  armor_plate: 'icons/skills/armor_plate.png',
  barrel_blast: 'icons/skills/barrel_blast.png',
  ground_slam: 'icons/skills/ground_slam.png',
  cloak: 'icons/skills/cloak.png',
  smoke_bomb: 'icons/skills/smoke_bomb.png',
  grapple_dash: 'icons/skills/grapple_dash.png',
  // Faction crests (HUD chip, tickets, kill feed, death banner, loading, wardrobe).
  crest_alpine: 'crests/crest_alpine.png',
  crest_lagoon: 'crests/crest_lagoon.png',
  // Mascot moves and tools.
  horn_charge: 'icons/skills/horn_charge.png',
  hoof_stomp: 'icons/skills/hoof_stomp.png',
  cowbell_clang: 'icons/skills/cowbell_clang.png',
  turbo_roll: 'icons/skills/turbo_roll.png',
  ground_pound: 'icons/skills/ground_pound.png',
  milk_splash: 'icons/skills/milk_splash.png',
  wrench: 'icons/skills/wrench.png',
} as const satisfies Record<string, string>;

export type TileId = keyof typeof TILE_FILES;

export function hasTile(id: string): id is TileId {
  return id in TILE_FILES;
}

export function tileUrl(id: string): string | null {
  return hasTile(id) ? `${BASE}art/${TILE_FILES[id]}` : null;
}

export const MENU_KEYART_URL = `${BASE}art/menu-keyart.jpg`;
export const COVER_URL = `${BASE}art/cover.jpg`;

export function sceneUrl(index: number): string {
  return `${BASE}art/scene-${String(index).padStart(2, '0')}.jpg`;
}

/** Painted comic sticker for a popup word, e.g. `boom` -> `art/comic/boom.png`. */
export function spriteUrl(name: string): string {
  return `${BASE}art/comic/${name}.png`;
}

export const paintedSprites = writable<Record<string, PaintedState>>({});
const spritesProbed = new Set<string>();

/** Preload a comic sticker once so the first popup never flashes the text fallback. */
export function probeSprite(name: string): void {
  if (!name || spritesProbed.has(name)) return;
  spritesProbed.add(name);
  probe(spriteUrl(name), (state) => paintedSprites.update((current) => ({ ...current, [name]: state })));
}

export const paintedTiles = writable<Record<string, PaintedState>>({});
export const menuKeyart = writable<PaintedState | 'unknown'>('unknown');

const probed = new Set<string>();

function probe(url: string, done: (state: PaintedState) => void): void {
  const image = new Image();
  image.onload = () => done(image.naturalWidth > 0 ? 'ok' : 'missing');
  image.onerror = () => done('missing');
  image.src = url;
}

/** Start loading a painted tile once; the store flips to `ok` when it decodes. */
export function probeTile(id: string): void {
  if (probed.has(id)) return;
  probed.add(id);
  const url = tileUrl(id);
  if (!url) {
    paintedTiles.update((current) => ({ ...current, [id]: 'missing' }));
    return;
  }
  probe(url, (state) => paintedTiles.update((current) => ({ ...current, [id]: state })));
}

let keyartProbed = false;

/** Probe the optional menu key art once. */
export function probeMenuKeyart(): void {
  if (keyartProbed) return;
  keyartProbed = true;
  probe(MENU_KEYART_URL, (state) => menuKeyart.set(state));
}
