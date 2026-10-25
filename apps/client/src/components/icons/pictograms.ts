import type { SkillId, WeaponId } from '@frost-and-flamingos/shared';

/**
 * Procedural cartoon pictograms for weapons and class skills.
 *
 * Every icon is hand-built SVG markup for a 64 x 64 view box: chunky shapes, a warm
 * near-black ink outline and flat cel colours, matching the supplied comic HUD
 * references. No bitmaps or external art are involved.
 */

const INK = '#1B1410';
const SW = 3;

const METAL = '#9AA3B5';
const METAL_LIGHT = '#D3DAE6';
const METAL_DARK = '#4C5366';
const WOOD = '#C07A32';
const WOOD_DARK = '#7A4A1E';
const BRASS = '#F4B72E';
const CHEESE = '#FFD23F';
const CHEESE_DARK = '#F0A91C';
const RED = '#E0343A';
const ICE = '#8FD6FF';
const WHITE = '#FFFFFF';

type Attrs = Record<string, string | number>;

function attrs(extra: Attrs): string {
  return Object.entries(extra)
    .map(([key, value]) => `${key}="${value}"`)
    .join(' ');
}

/** Inked path. */
function p(d: string, fill: string, extra: Attrs = {}): string {
  return `<path d="${d}" fill="${fill}" stroke="${INK}" stroke-width="${SW}" stroke-linejoin="round" stroke-linecap="round" ${attrs(extra)}/>`;
}

/** Inked rounded rectangle. */
function r(x: number, y: number, w: number, h: number, rx: number, fill: string, extra: Attrs = {}): string {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${INK}" stroke-width="${SW}" stroke-linejoin="round" ${attrs(extra)}/>`;
}

/** Inked circle or ellipse. */
function c(cx: number, cy: number, rx: number, ry: number, fill: string, extra: Attrs = {}): string {
  return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}" stroke="${INK}" stroke-width="${SW}" ${attrs(extra)}/>`;
}

/** Thick two-tone line: ink underlay plus a coloured core. */
function line(d: string, colour: string, width: number, extra: Attrs = {}): string {
  return (
    `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${width + SW * 1.6}" stroke-linecap="round" stroke-linejoin="round" ${attrs(extra)}/>` +
    `<path d="${d}" fill="none" stroke="${colour}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" ${attrs(extra)}/>`
  );
}

/** Small sparkle used as accent on many icons. */
function spark(x: number, y: number, size: number, fill = WHITE): string {
  const s = size;
  return p(
    `M${x} ${y - s} L${x + s * 0.3} ${y - s * 0.3} L${x + s} ${y} L${x + s * 0.3} ${y + s * 0.3} L${x} ${y + s} L${x - s * 0.3} ${y + s * 0.3} L${x - s} ${y} L${x - s * 0.3} ${y - s * 0.3} Z`,
    fill,
    { 'stroke-width': 2 },
  );
}

/** Weapons are drawn horizontally and tilted for a dynamic, comic pose. */
function tilt(inner: string, degrees = -26): string {
  return `<g transform="rotate(${degrees} 32 32)">${inner}</g>`;
}


// Mascot moves (cow / coconut). Painted tiles normally cover these; the SVGs are the fallback.
const COW_WHITE = '#FFF8EC';
const COCONUT = '#8A5A34';
const COCONUT_DARK = '#5A3A22';
const MILK = '#F6FBFF';

const MASCOT_HORNS =
  p('M14 26 Q4 20 8 8 Q14 18 22 20 Z', '#F4E3C0') +
  p('M50 26 Q60 20 56 8 Q50 18 42 20 Z', '#F4E3C0') +
  c(32, 34, 18, 16, COW_WHITE) +
  c(24, 28, 5, 4, INK, { 'stroke-width': 0 }) +
  c(42, 40, 4, 3, INK, { 'stroke-width': 0 }) +
  c(32, 44, 11, 7, '#FFB3C7') +
  c(28, 44, 1.6, 2, INK, { 'stroke-width': 0 }) +
  c(36, 44, 1.6, 2, INK, { 'stroke-width': 0 });

const MASCOT_SPEED = line('M2 22 H12', WHITE, 2.2) + line('M0 34 H10', WHITE, 2.2) + line('M3 46 H13', WHITE, 2.2);

const MASCOT_COCONUT =
  c(36, 32, 20, 20, COCONUT) +
  `<path d="M22 20 Q30 26 26 36 M44 16 Q40 28 50 34" fill="none" stroke="${COCONUT_DARK}" stroke-width="2.4" stroke-linecap="round"/>` +
  c(30, 30, 2.6, 3.4, INK, { 'stroke-width': 0 }) +
  c(42, 30, 2.6, 3.4, INK, { 'stroke-width': 0 }) +
  `<path d="M30 40 Q36 44 42 40" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>`;

const MASCOT_BURST =
  p('M32 44 L40 36 L40 46 L56 44 L44 52 L58 60 L6 60 L20 52 L8 44 L24 46 L24 36 Z', '#FFB02E');

const MASCOT_ICONS = {
  horn_charge: MASCOT_SPEED + MASCOT_HORNS,
  hoof_stomp:
    MASCOT_BURST +
    p('M18 10 L46 10 L48 34 Q48 40 42 40 L36 40 L32 32 L28 40 L22 40 Q16 40 16 34 Z', '#4A3022') +
    r(16, 30, 32, 6, 2, '#2A1A10'),
  cowbell_clang:
    p('M22 14 L42 14 L50 46 L14 46 Z', BRASS) +
    r(28, 8, 8, 7, 2, METAL_DARK) +
    c(32, 50, 5, 4, METAL_DARK) +
    line('M6 22 Q2 30 6 38', WHITE, 2) +
    line('M58 22 Q62 30 58 38', WHITE, 2) +
    spark(52, 12, 4),
  turbo_roll: MASCOT_SPEED + MASCOT_COCONUT,
  ground_pound: MASCOT_BURST + `<g transform="translate(-4 -10) scale(0.8)">${MASCOT_COCONUT}</g>` + line('M32 2 V8', WHITE, 2),
  milk_splash:
    p('M32 6 Q46 26 46 36 Q46 50 32 50 Q18 50 18 36 Q18 26 32 6 Z', MILK) +
    c(14, 54, 6, 3.4, MILK, { 'stroke-width': 2.2 }) +
    c(50, 54, 6, 3.4, MILK, { 'stroke-width': 2.2 }) +
    c(32, 58, 9, 3.4, MILK, { 'stroke-width': 2.2 }) +
    `<path d="M26 26 Q24 32 26 38" fill="none" stroke="${ICE}" stroke-width="2.6" stroke-linecap="round"/>`,
} as const;


// Vehicle weapons and roadkill (kill feed, killer cam).
const CHEESE_WHEEL = c(32, 32, 20, 20, CHEESE) + c(32, 32, 7, 7, CHEESE_DARK) + c(22, 24, 3, 3, CHEESE_DARK) + c(42, 40, 3.4, 3, CHEESE_DARK);
const TRACK = r(6, 40, 52, 14, 7, METAL_DARK) + c(16, 47, 4, 4, METAL) + c(32, 47, 4, 4, METAL) + c(48, 47, 4, 4, METAL);

const VEHICLE_ICONS = {
  fondue_cannon: CHEESE_WHEEL + line('M50 14 L58 8', '#FF6A1A', 3) + line('M52 22 L62 20', '#FF6A1A', 3),
  coconut_mortar:
    tilt(r(4, 28, 34, 9, 3, '#7FB24A') + `<path d="M14 28 V37 M26 28 V37" stroke="${INK}" stroke-width="2.4"/>`, -20) +
    c(46, 22, 12, 12, COCONUT) +
    c(43, 19, 2, 2.4, COCONUT_DARK, { 'stroke-width': 0 }),
  harpoon_gun: tilt(line('M4 32 L50 32', METAL, 3.5) + p('M50 24 L62 32 L50 40 Z', METAL_LIGHT) + r(8, 28, 16, 9, 2, METAL_DARK)),
  dozer_ram: TRACK + p('M6 40 L14 18 L30 18 L30 40 Z', '#E0343A') + p('M2 52 L10 30 L14 30 L10 56 Z', '#FF8A2A'),
  grille_ram: TRACK + p('M10 40 L14 20 L50 20 L54 40 Z', '#5A6B2C') + `<path d="M18 22 V38 M28 22 V38 M38 22 V38 M46 22 V38" stroke="${WOOD}" stroke-width="2.6"/>`,
  sidecar_ram:
    c(16, 46, 10, 10, METAL_DARK) +
    c(50, 46, 10, 10, METAL_DARK) +
    p('M10 38 L24 24 L44 24 L56 38 Z', '#C8702A') +
    c(56, 30, 4, 4, '#FFF3B0') +
    line('M2 20 H10', WHITE, 2) +
    line('M0 30 H8', WHITE, 2),
  flamingo_boing:
    c(30, 40, 24, 14, '#FF6FB5') +
    p('M44 32 Q52 10 40 8 Q30 8 34 20', '#FF6FB5') +
    c(40, 12, 2.4, 2.4, INK, { 'stroke-width': 0 }) +
    p('M30 12 L22 16 L30 18 Z', INK) +
    spark(10, 14, 5, '#FFE14D'),
  vehicle_blast: p('M32 4 L38 20 L56 14 L46 30 L60 40 L42 42 L44 60 L32 48 L20 60 L22 42 L4 40 L18 30 L8 14 L26 20 Z', '#FF8A2A') + c(32, 34, 8, 8, '#FFE14D'),
} as const;

const WEAPON_ICONS: Record<WeaponId, string> = {
  smg: tilt(
    p('M15 27 L5 30 L5 37 L15 35 Z', WOOD) +
      p('M24 35 L21 50 L30 50 L32 35 Z', METAL_DARK) +
      p('M37 35 L40 47 L46 47 L44 35 Z', WOOD) +
      r(13, 25, 32, 11, 2.5, METAL) +
      r(44, 28, 16, 6, 2, METAL_LIGHT) +
      r(18, 21, 9, 5, 1.5, METAL_DARK) +
      `<path d="M17 29.5 H38" stroke="${METAL_LIGHT}" stroke-width="2" stroke-linecap="round"/>`,
  ),
  lmg: tilt(
    p('M14 26 L4 29 L4 37 L14 36 Z', WOOD) +
      line('M47 33 L43 49', METAL_DARK, 2.5) +
      line('M51 33 L56 49', METAL_DARK, 2.5) +
      r(21, 34, 15, 12, 2.5, BRASS) +
      r(12, 24, 36, 11, 2.5, METAL) +
      r(47, 27, 14, 6, 2, METAL_LIGHT) +
      `<circle cx="52" cy="30" r="1.1" fill="${INK}"/><circle cx="56" cy="30" r="1.1" fill="${INK}"/>` +
      r(22, 19, 11, 6, 2, METAL_DARK) +
      `<path d="M25 38 H33 M25 42 H33" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>`,
  ),
  sniper: tilt(
    p('M18 29 L4 32 L5 40 L18 36 Z', WOOD) +
      r(16, 28, 26, 8, 2, METAL) +
      r(41, 30, 20, 4.5, 1.5, METAL_LIGHT) +
      r(58, 29, 4, 6.5, 1.5, METAL_DARK) +
      r(20, 19, 20, 8, 4, METAL_DARK) +
      c(21, 23, 2.8, 4.2, ICE) +
      c(40, 23, 2.8, 4.2, ICE) +
      `<path d="M25 27 V29 M35 27 V29" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>` +
      p('M27 36 L29 46 L33 46 L33 36 Z', WOOD),
  ),
  shotgun: tilt(
    p('M17 28 L4 33 L4 41 L17 37 Z', WOOD) +
      r(26, 26, 35, 5.5, 2, METAL) +
      r(26, 31, 35, 5.5, 2, METAL_LIGHT) +
      r(30, 36, 14, 6, 3, WOOD) +
      r(14, 26, 14, 12, 2.5, BRASS) +
      `<path d="M21 38 Q22 46 28 45" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`,
  ),
  bazooka: tilt(
    p('M24 36 L26 46 L32 46 L32 36 Z', WOOD) +
      r(6, 23, 48, 14, 6, '#7FA24A') +
      `<path d="M16 24 V36 M40 24 V36" stroke="${INK}" stroke-width="3"/>` +
      r(50, 21, 8, 18, 3, BRASS) +
      r(3, 25, 7, 10, 3, METAL_DARK) +
      p('M20 22 L36 22 L28 10 Z', CHEESE) +
      `<circle cx="28" cy="18" r="1.6" fill="${INK}"/><circle cx="31" cy="20.4" r="1.2" fill="${INK}"/>`,
  ),
  silenced_pistol: tilt(
    p('M16 31 L31 31 L28 48 Q28 50 26 50 L21 50 Q19 50 19 48 Z', WOOD) +
      r(13, 21, 31, 11, 3, METAL) +
      r(43, 23, 18, 8, 4, METAL_DARK) +
      `<path d="M49 23 V31 M54 23 V31" stroke="${INK}" stroke-width="2"/>` +
      `<path d="M17 25 H38" stroke="${METAL_LIGHT}" stroke-width="2" stroke-linecap="round"/>` +
      `<path d="M30 32 Q30 39 24 38" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`,
  ),
  knife:
    tilt(
      r(3, 29, 20, 7, 3.5, WOOD) +
        `<path d="M8 30 V35 M14 30 V35" stroke="${WOOD_DARK}" stroke-width="2"/>` +
        r(22, 27, 5, 11, 2.5, BRASS) +
        r(27, 22, 5, 21, 2.5, METAL_LIGHT) +
        r(30, 22.5, 26, 3.2, 1.6, METAL_LIGHT, { 'stroke-width': 2.2 }) +
        r(30, 40, 26, 3.2, 1.6, METAL_LIGHT, { 'stroke-width': 2.2 }) +
        r(30, 31, 32, 3.2, 1.6, METAL_LIGHT, { 'stroke-width': 2.2 }) +
        p('M44 26 L55 26 L55 38 L44 38 Z', CHEESE) +
        `<circle cx="49" cy="30" r="1.5" fill="${CHEESE_DARK}"/><circle cx="52" cy="35" r="1.3" fill="${CHEESE_DARK}"/>`,
      -24,
    ),
  snow_cannon: tilt(
    c(15, 41, 9, 9, 'none', { stroke: INK, 'stroke-width': 9 }) +
      c(15, 41, 9, 9, 'none', { stroke: '#D9A62B', 'stroke-width': 4.5 }) +
      r(4, 22, 20, 14, 6, ICE) +
      r(22, 22, 34, 14, 5, '#FFD33D') +
      `<path d="M26 26.5 H52" stroke="#FFF1A8" stroke-width="3" stroke-linecap="round"/>` +
      r(52, 18, 8, 22, 3.5, BRASS) +
      r(30, 36, 8, 11, 3, BRASS) +
      spark(60, 12, 5, WHITE),
  ),
  sand_flamer: tilt(
    r(4, 21, 20, 17, 6, RED) +
      `<path d="M10 21 V38" stroke="${INK}" stroke-width="2.5"/>` +
      r(23, 26, 26, 8, 3, METAL_DARK) +
      r(46, 24, 5, 12, 2, BRASS) +
      p('M51 30 Q54 17 58 20 Q58 25 62 24 Q60 30 62 35 Q57 34 58 41 Q53 37 51 33 Z', '#FF8A1F') +
      p('M52 30 Q55 24 57 26 Q56 30 59 31 Q56 34 55 37 Q52 35 52 32 Z', '#FFE04A', { 'stroke-width': 2 }) +
      p('M28 34 L30 45 L35 45 L34 34 Z', WOOD),
  ),
  crossbow: tilt(
    p('M10 30 L50 30 L50 36 L22 38 L10 35 Z', WOOD) +
      line('M42 8 Q60 32 42 56', WOOD_DARK, 5) +
      `<path d="M42 8 L28 32 L42 56" fill="none" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>` +
      line('M28 32.5 H56', METAL_LIGHT, 2.2) +
      p('M54 28 L63 32.5 L54 37 Z', RED) +
      p('M26 36 L28 46 L33 46 L32 37 Z', WOOD_DARK),
    -20,
  ),
  halberd: tilt(
    line('M32 56 V12', WOOD, 5) +
      p('M32 2 L27.5 15 L36.5 15 Z', METAL_LIGHT) +
      p('M35 18 Q60 13 57 38 Q46 33 35 33 Z', METAL) +
      `<path d="M41 22 Q51 22 53 31" fill="none" stroke="${METAL_LIGHT}" stroke-width="2.4" stroke-linecap="round"/>` +
      p('M29 23 L17 26 L29 30 Z', METAL_LIGHT) +
      r(28, 40, 8, 5, 2, BRASS),
    32,
  ),
  umbrella: tilt(
    line('M32 34 V54 Q32 60 39 58', METAL_DARK, 3) +
      p('M32 9 C16 9 6 22 5 36 Q11 31 18.5 36 C19 24 25 12 32 9 Z', '#E8404B') +
      p('M32 9 C25 12 19 24 18.5 36 Q25 31 32 36 C32 25 32 15 32 9 Z', '#FFD23F') +
      p('M32 9 C32 15 32 25 32 36 Q39 31 45.5 36 C45 24 39 12 32 9 Z', '#2FC7B8') +
      p('M32 9 C39 12 45 24 45.5 36 Q52 31 59 36 C58 22 48 9 32 9 Z', '#FF6FB5') +
      `<path d="M32 9 V4" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`,
    18,
  ),
  horn: tilt(
    line('M5 38 Q28 38 46 28', WOOD, 6) +
      `<path d="M16 37.5 L16 31.5 M30 36.5 L30 30.5" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>` +
      r(3, 34, 6, 7, 2, BRASS, { transform: 'rotate(-6 6 38)' }) +
      p('M44 21 Q48 14 56 10 Q62 20 60 33 Q52 36 46 33 Z', WOOD) +
      c(55, 22, 4.2, 9.5, '#40281A', { transform: 'rotate(18 55 22)' }) +
      `<path d="M56 4 Q63 8 63 15" fill="none" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>`,
    -18,
  ),
  cow_ram: MASCOT_SPEED + MASCOT_HORNS,
  coconut_ram: MASCOT_SPEED + MASCOT_COCONUT,
  ...MASCOT_ICONS,
  ...VEHICLE_ICONS,
};

const SKILL_ICONS: Record<SkillId, string> = {
  heal_snack:
    p('M6 38 L50 20 L58 40 L58 50 Q58 52 56 52 L8 52 Q6 52 6 50 Z', CHEESE_DARK) +
    p('M6 38 L50 20 L58 40 Z', CHEESE) +
    `<ellipse cx="22" cy="36" rx="4" ry="2.4" fill="${CHEESE_DARK}" stroke="${INK}" stroke-width="2" transform="rotate(-18 22 36)"/>` +
    `<ellipse cx="42" cy="32" rx="3" ry="2" fill="${CHEESE_DARK}" stroke="${INK}" stroke-width="2" transform="rotate(-18 42 32)"/>` +
    `<ellipse cx="18" cy="46" rx="4" ry="3" fill="#C98512" stroke="${INK}" stroke-width="2"/>` +
    `<ellipse cx="40" cy="45" rx="5" ry="3.4" fill="#C98512" stroke="${INK}" stroke-width="2"/>` +
    p('M50 14 C44 8 38 14 44 20 L50 25 L56 20 C62 14 56 8 50 14 Z', RED, { 'stroke-width': 2.4 }) +
    spark(57, 31, 4),
  ram_sprint:
    line('M4 20 H20', WHITE, 2.4) +
    line('M2 31 H16', WHITE, 2.4) +
    line('M5 42 H18', WHITE, 2.4) +
    p('M28 8 L44 8 L44 32 Q58 33 60 44 L60 52 L26 52 L26 40 Q28 35 28 32 Z', '#B8682C') +
    r(26, 46, 34, 8, 3, '#4A3022') +
    `<path d="M30 14 H42 M30 20 H42" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>` +
    p('M50 36 Q58 30 61 36', 'none', { stroke: WHITE, 'stroke-width': 2.6 }),
  battle_shout:
    c(22, 33, 15, 19, '#FF8FB8') +
    c(22, 33, 10.5, 14, '#8A1C2B') +
    c(22, 41, 7, 5, '#FF6FB5', { 'stroke-width': 2.4 }) +
    p('M42 18 Q52 33 42 48', 'none', { stroke: INK, 'stroke-width': 9 }) +
    p('M42 18 Q52 33 42 48', 'none', { stroke: '#FFD23F', 'stroke-width': 4 }) +
    p('M49 10 Q64 33 49 56', 'none', { stroke: INK, 'stroke-width': 9 }) +
    p('M49 10 Q64 33 49 56', 'none', { stroke: '#FF8A1F', 'stroke-width': 4 }),
  armor_plate:
    p('M32 5 L55 13 Q56 38 32 59 Q8 38 9 13 Z', CHEESE) +
    p('M32 11 L49 17 Q49 35 32 52 Q15 35 15 17 Z', CHEESE_DARK, { 'stroke-width': 2.4 }) +
    `<ellipse cx="26" cy="25" rx="4.6" ry="3.2" fill="#C98512" stroke="${INK}" stroke-width="2"/>` +
    `<ellipse cx="38" cy="32" rx="4" ry="3" fill="#C98512" stroke="${INK}" stroke-width="2"/>` +
    `<ellipse cx="29" cy="41" rx="3" ry="2.4" fill="#C98512" stroke="${INK}" stroke-width="2"/>` +
    spark(46, 20, 4.5),
  barrel_blast:
    p('M17 20 Q9 35 17 52 L47 52 Q55 35 47 20 Z', WOOD) +
    `<path d="M14 28 Q32 34 50 28 M13 44 Q32 50 51 44" fill="none" stroke="${INK}" stroke-width="3"/>` +
    `<path d="M14 28 Q32 34 50 28 M13 44 Q32 50 51 44" fill="none" stroke="${METAL}" stroke-width="1.4"/>` +
    c(32, 20, 15, 5, WOOD_DARK) +
    line('M32 17 Q30 9 38 6', '#6B5B4B', 2) +
    spark(42, 8, 6, '#FFE04A') +
    `<path d="M24 36 L26 44 M36 36 L38 44" stroke="${WOOD_DARK}" stroke-width="2" stroke-linecap="round"/>`,
  ground_slam:
    p('M32 33 L44 22 L40 34 L58 32 L44 41 L52 54 L36 46 L32 58 L27 46 L10 53 L20 41 L5 34 L22 34 L16 21 Z', '#FFB02E') +
    p('M32 38 L38 32 L36 39 L45 38 L38 43 L42 50 L33 45 L31 52 L28 45 L20 49 L25 42 L18 38 L27 38 L24 31 Z', '#FFE04A', { 'stroke-width': 2 }) +
    r(21, 2, 22, 22, 8, '#F1B27C') +
    `<path d="M26.5 8 V20 M32 8 V20 M37.5 8 V20" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>`,
  cloak:
    p(
      'M32 5 Q15 7 16 27 L11 55 Q17 51 21.5 57 Q27 51 32 57 Q37 51 42.5 57 Q47 51 53 55 L48 27 Q49 7 32 5 Z',
      '#9CEDE6',
      { 'stroke-dasharray': '5 3.4' },
    ) +
    c(25, 26, 3.6, 5, INK) +
    c(39, 26, 3.6, 5, INK) +
    `<ellipse cx="24" cy="24.4" rx="1.2" ry="1.5" fill="${WHITE}"/><ellipse cx="38" cy="24.4" rx="1.2" ry="1.5" fill="${WHITE}"/>` +
    `<path d="M24 38 Q32 43 40 38" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>` +
    spark(54, 13, 4.2) +
    spark(9, 20, 3.4),
  smoke_bomb:
    c(26, 40, 16, 16, '#3A4252') +
    `<path d="M16 32 Q19 26 25 25" fill="none" stroke="#7B869B" stroke-width="3.4" stroke-linecap="round"/>` +
    line('M33 27 Q40 18 46 22', '#7A5A32', 2.4) +
    spark(49, 21, 6, '#FFE04A') +
    c(50, 46, 8, 7, '#E5E9F0') +
    c(40, 54, 7, 5.6, '#CBD2DD') +
    c(56, 36, 6, 5.4, '#E5E9F0') +
    c(44, 12, 6.4, 5, '#F4F6FA', { 'stroke-width': 2.4 }),
  grapple_dash:
    line('M5 56 Q10 44 4 34 Q12 36 15 28', '#B07A3C', 2.4, { 'stroke-dasharray': '1 0' }) +
    line('M14 46 L40 20', METAL_DARK, 4.5) +
    line('M40 20 Q36 8 48 6', METAL, 4.4) +
    line('M40 20 Q54 20 58 8', METAL, 4.4) +
    line('M40 20 L55 29', METAL, 4.4) +
    c(14, 46, 4.4, 4.4, BRASS) +
    line('M22 56 H34', WHITE, 2.2) +
    line('M30 60 H44', WHITE, 2.2),
  ...MASCOT_ICONS,
};

const FALLBACK = p('M32 6 L39 24 L58 25 L43 37 L48 56 L32 45 L16 56 L21 37 L6 25 L25 24 Z', CHEESE);

const WRENCH =
  line('M12 52 L38 26', METAL_LIGHT, 7) +
  p('M36 8 Q52 6 54 20 L46 20 L46 26 L54 28 Q52 42 36 40 Q30 38 28 32 L36 28 L36 20 L28 16 Q30 10 36 8 Z', METAL) +
  c(14, 50, 5.5, 5.5, METAL_DARK);

/** Fallback artwork for painted tiles that have no weapon or skill pictogram (mascot moves, tools). */
export function tilePictogram(id: string | null): string {
  return id === 'wrench' ? WRENCH : FALLBACK;
}

export function weaponPictogram(id: WeaponId): string {
  return WEAPON_ICONS[id] ?? FALLBACK;
}

export function skillPictogram(id: SkillId): string {
  return SKILL_ICONS[id] ?? FALLBACK;
}

export const ALL_WEAPON_PICTOGRAMS = WEAPON_ICONS;
export const ALL_SKILL_PICTOGRAMS = SKILL_ICONS;
