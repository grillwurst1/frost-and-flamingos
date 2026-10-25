import type { WeaponId } from '@frost-and-flamingos/shared';
import { shadeHex, type Ring, type V3, type WeaponKit } from './kit';

/**
 * The thirteen hero weapons as chunky cartoon props, modelled on the owner's
 * painted icon sheet (`art-out/icons/*.png`): oversized ~1.3-1.6x, clean
 * rounded hard-surface blocks, the icons' colour blocks.
 *
 * GUN SPACE (what the builders below draw in), metres:
 *   origin   centre of the right-hand grip handle at the middle finger,
 *   +Z       barrel / business end forward, +Y up,
 *   +X       the holder's LEFT (glTF armature convention of the painted
 *            soldiers; a Babylon-space rig mirrors X, see build options).
 * Pistol grips and pole shafts both run along gun-space Y through the origin,
 * so a fist that wraps a pistol grip also wraps a knife handle or a halberd
 * shaft; the hold tilt then swings the pole forward.
 *
 * Hold data is shared by both character paths: the painted-soldier animator
 * (wrist targets, shoulder offsets, tilt/yaw) and the procedural rig (pose name,
 * grip/support axes, stock butt), so the weapon and its grips stay one design.
 *
 * Design notes for the procedural fallback: the pose names and grip axes
 * follow package 1E's weapon table (rifle/hip/pistol/launcher/knife/polearm/
 * umbrella/horn), and several silhouettes adapt its toy designs (finned
 * tommy-gun barrel and drum, ribbed shotgun pump, flamer twin tanks and hose,
 * the alphorn's swept tube and bell) at the icons' larger hero scale.
 */

/** Animator families (procedural rig / 1E naming). */
export type WeaponPose = 'rifle' | 'hip' | 'pistol' | 'launcher' | 'knife' | 'polearm' | 'umbrella' | 'horn';

/** What a shot looks like leaving the muzzle. */
export type MuzzleKind = 'bullet' | 'heavy' | 'blast' | 'snow' | 'flame' | 'sonic';

export interface WeaponHoldData {
  pose: WeaponPose;
  /**
   * Right wrist target relative to the shoulder midpoint in the aim frame
   * (x right, y up, z forward; metres for 0.43 m arms, animators scale it to
   * the body's shoulder width and arm length).
   */
  shoulder: V3;
  /** Weapon pitch against the aim (radians, + = muzzle / tip up). */
  tilt: number;
  /** Weapon yaw against the aim (radians, + = muzzle towards the holder's left). */
  yaw: number;
  /** Support-hand (left) grip point in gun space, or null for one-handed weapons. */
  support: V3 | null;
  /** Axis through the right fist (gun space). */
  gripAxis: V3;
  /** Axis through the support fist (gun space). */
  supportAxis: V3;
  /** Gun-space z of the stock butt (the procedural rig seats it in the shoulder). */
  butt?: number;
  /** Muzzle socket in gun space (shots, flashes and tracers leave here). */
  muzzle: V3 | null;
  /** Direction out of the muzzle in gun space (default +Z). */
  muzzleDir?: V3;
  muzzleKind: MuzzleKind | null;
}

export interface WeaponDesign {
  hold: WeaponHoldData;
  /** Draws the always-visible body. */
  build(kit: WeaponKit): void;
  /** Optional second part with its own state (umbrella canopy: closed / open). */
  extra?: { closed: (kit: WeaponKit) => void; open: (kit: WeaponKit) => void };
  /** Wardrobe / menu turntable hold (shows the weapon without hiding the outfit). */
  preview?: { shoulder: V3; tilt: number; yaw: number };
}

// ---- palette (from the icons) ------------------------------------------------
const WALNUT = '#a8652f';
const WALNUT_DARK = '#71401d';
const STEEL = '#5d6976';
const STEEL_DARK = '#3c4550';
const STEEL_LIGHT = '#a7b3be';
const BLACK = '#2a2e35';
const BRASS = '#e2ab3f';
const BRASS_DARK = '#b07a2c';
const BLUE_STEEL = '#4f6f97';
const OLIVE = '#6e8b3d';
const MAROON = '#8b3a2a';
const SNOW_YELLOW = '#f4c430';
const FLAMER_COPPER = '#d36b2c';
const TANK_RED = '#e0482f';
const TANK_GREEN = '#56a54a';
const GRIP_RED = '#e04a5c';
const LEATHER = '#7a4526';
const HALBERD_SHAFT = '#7b2e22';
const ALPHORN = '#d79b4c';

const HALF_PI = Math.PI / 2;
const UMBRELLA_STRIPES = ['#e8432e', '#f39a1f', '#ffd23f', '#4fbf4a', '#2fc3d8', '#2f6fd8', '#8a4fd8', '#f0508c'];

// ---- shared parts ------------------------------------------------------------

/** Raked pistol grip from the receiver underside (y = top) down past the fist. */
function pistolGrip(kit: WeaponKit, hex: string, top = 0.1, length = 0.2, width = 0.052): void {
  kit.extrude(
    hex,
    [
      [-0.035, top],
      [0.04, top],
      [0.032, top - length * 0.35],
      [0.016, top - length],
      [-0.04, top - length - 0.006],
      [-0.052, top - length * 0.45],
    ],
    width,
    { bevel: 0.016 },
  );
}

/** Rounded trigger guard loop under the receiver. */
function triggerGuard(kit: WeaponKit, hex: string, top: number, z0: number, z1: number): void {
  kit.tube(
    hex,
    [
      [0, top, z0],
      [0, top - 0.05, z0 + 0.01],
      [0, top - 0.055, (z0 + z1) / 2 + 0.01],
      [0, top - 0.03, z1],
      [0, top, z1 + 0.005],
    ],
    0.009,
    { segments: 5, samples: 7 },
  );
}

/** Barrel along +Z from z0 to z1 at height y, with a fatter crown ring. */
function barrel(kit: WeaponKit, hex: string, y: number, z0: number, z1: number, radius: number, crown = 1.35): void {
  kit.lathe(
    [
      { z: z0, r: radius, hex },
      { z: z1 - radius * 2.2, r: radius },
      { z: z1 - radius * 2.2, r: radius * crown, hard: true },
      { z: z1, r: radius * crown },
    ],
    { at: [0, y, 0], segments: 10, capStart: true, capEnd: true },
  );
}

/** Two-legged bipod folded forward along the barrel. */
function bipod(kit: WeaponKit, hex: string, y: number, z: number, length: number): void {
  for (const side of [-1, 1]) {
    kit.tube(hex, [
      [side * 0.022, y, z],
      [side * 0.03, y - 0.03, z + length * 0.5],
      [side * 0.032, y - 0.035, z + length],
    ], 0.009, { segments: 5, samples: 4, capEnd: true });
  }
}

// ---- designs ---------------------------------------------------------------------

const DESIGNS: Record<string, WeaponDesign> = {
  /** Tommy gun: walnut stock and grips, steel receiver, finned barrel, big drum. */
  smg: {
    hold: {
      pose: 'rifle',
      shoulder: [0.09, -0.155, 0.08],
      tilt: 0.04,
      yaw: 0.26,
      support: [0, 0.03, 0.3],
      gripAxis: [0, -1, -0.3],
      supportAxis: [0, -1, 0.1],
      butt: -0.34,
      muzzle: [0, 0.165, 0.7],
      muzzleKind: 'bullet',
    },
    build: (kit) => {
      // Receiver with a top rib and rear sight.
      kit.box(STEEL, [0.1, 0.125, 0.34], { at: [0, 0.162, 0.08], bevel: 0.026 });
      kit.box(STEEL_DARK, [0.05, 0.03, 0.2], { at: [0, 0.225, 0.06], bevel: 0.012 });
      kit.box(STEEL_DARK, [0.03, 0.05, 0.03], { at: [0, 0.245, -0.05], bevel: 0.01 });
      // Finned barrel and compensator.
      const fins: Ring[] = [{ z: 0.25, r: 0.03, hex: STEEL_DARK }];
      for (let fin = 0; fin < 5; fin += 1) {
        const z = 0.28 + fin * 0.05;
        fins.push({ z, r: 0.03 }, { z: z + 0.008, r: 0.045 }, { z: z + 0.028, r: 0.045 }, { z: z + 0.036, r: 0.03 });
      }
      fins.push({ z: 0.58, r: 0.03 }, { z: 0.58, r: 0.04, hard: true, hex: STEEL }, { z: 0.7, r: 0.038 });
      kit.lathe(fins, { at: [0, 0.165, 0], segments: 10, capEnd: true });
      kit.box(STEEL_DARK, [0.018, 0.04, 0.026], { at: [0, 0.2, 0.66], bevel: 0.006 });
      // Drum magazine (axis across the gun) with a raised hub.
      kit.lathe(
        [
          { z: -0.045, r: 0.075, hex: BLACK },
          { z: -0.04, r: 0.098 },
          { z: 0.04, r: 0.098 },
          { z: 0.045, r: 0.075 },
          { z: 0.045, r: 0.04, hard: true, hex: STEEL_LIGHT },
          { z: 0.06, r: 0.03 },
        ],
        { at: [0, 0.06, 0.14], rot: [0, HALF_PI, 0], segments: 16, capStart: true, capEnd: true },
      );
      kit.blob(STEEL_LIGHT, [0.015, 0.03, 0.03], { at: [-0.05, 0.06, 0.14], segments: 8, rings: 4 });
      // Walnut grips.
      pistolGrip(kit, WALNUT, 0.11, 0.2);
      kit.lathe(
        [
          { z: -0.12, r: 0.026, hex: WALNUT },
          { z: -0.09, r: 0.032 },
          { z: -0.06, r: 0.026 },
          { z: -0.03, r: 0.032 },
          { z: 0.0, r: 0.027 },
          { z: 0.05, r: 0.024 },
        ],
        { at: [0, 0.1, 0.31], rot: [-HALF_PI - 0.14, 0, 0], segments: 10, capStart: true, capEnd: true },
      );
      triggerGuard(kit, STEEL_DARK, 0.1, 0.03, 0.1);
      // Shaped walnut stock with a dark butt plate.
      kit.extrude(
        WALNUT,
        [
          [-0.08, 0.205],
          [-0.31, 0.17],
          [-0.33, 0.16],
          [-0.33, 0.0],
          [-0.29, -0.01],
          [-0.16, 0.07],
          [-0.08, 0.1],
        ],
        0.064,
        { bevel: 0.02 },
      );
      kit.box(BLACK, [0.066, 0.17, 0.02], { at: [0, 0.08, -0.34], rot: [-0.06, 0, 0], bevel: 0.008 });
    },
  },

  /** Pump shotgun: walnut stock and ribbed pump, steel receiver, long barrel. */
  shotgun: {
    hold: {
      pose: 'rifle',
      shoulder: [0.09, -0.155, 0.08],
      tilt: 0.05,
      yaw: 0.26,
      support: [0, 0.09, 0.29],
      gripAxis: [0, -1, -0.45],
      supportAxis: [0, -1, 0.1],
      butt: -0.36,
      muzzle: [0, 0.18, 0.8],
      muzzleKind: 'heavy',
    },
    build: (kit) => {
      kit.box(STEEL, [0.1, 0.13, 0.26], { at: [0, 0.15, 0.06], bevel: 0.026, top: [0.82, 1] });
      barrel(kit, STEEL_DARK, 0.18, 0.17, 0.8, 0.033, 1.22);
      kit.lathe([{ z: 0.17, r: 0.027, hex: STEEL_DARK }, { z: 0.68, r: 0.027 }], { at: [0, 0.12, 0], segments: 8, capEnd: true });
      // Ribbed walnut pump.
      kit.lathe(
        [
          { z: 0.2, r: 0.04, hex: WALNUT },
          { z: 0.22, r: 0.05 },
          { z: 0.4, r: 0.05 },
          { z: 0.42, r: 0.04 },
        ],
        { at: [0, 0.125, 0], segments: 12, capStart: true, capEnd: true, bump: (theta, ring) => (ring === 1 || ring === 2 ? 0.1 * Math.abs(Math.sin(theta * 3)) : 0) },
      );
      kit.blob(BRASS, [0.014, 0.014, 0.014], { at: [0, 0.218, 0.79], segments: 6, rings: 3 });
      triggerGuard(kit, STEEL_DARK, 0.09, 0.02, 0.1);
      // Semi-pistol-grip walnut stock through the fist.
      kit.extrude(
        WALNUT,
        [
          [-0.06, 0.2],
          [-0.33, 0.15],
          [-0.355, 0.135],
          [-0.36, -0.03],
          [-0.32, -0.045],
          [-0.15, 0.0],
          [-0.06, -0.09],
          [0.03, -0.085],
          [0.04, 0.0],
          [0.02, 0.09],
        ],
        0.068,
        { bevel: 0.022 },
      );
      kit.box(BLACK, [0.07, 0.18, 0.022], { at: [0, 0.055, -0.365], rot: [-0.03, 0, 0], bevel: 0.008 });
    },
  },

  /** Belt-fed machine gun: dark steel, walnut stock and handguard, brass belt, bipod. */
  lmg: {
    hold: {
      pose: 'hip',
      shoulder: [0.1, -0.185, 0.08],
      tilt: 0.06,
      yaw: 0.26,
      support: [0, 0.07, 0.3],
      gripAxis: [0, -1, -0.3],
      supportAxis: [0.1, -1, 0.1],
      butt: -0.36,
      muzzle: [0, 0.17, 0.98],
      muzzleKind: 'heavy',
    },
    build: (kit) => {
      kit.box(STEEL_DARK, [0.12, 0.16, 0.44], { at: [0, 0.16, 0.06], bevel: 0.026 });
      kit.box(BLACK, [0.115, 0.04, 0.24], { at: [0, 0.245, 0.0], bevel: 0.014 });
      // Perforated jacket (dark rings) and barrel with a flash hider.
      const jacket: Ring[] = [{ z: 0.28, r: 0.055, hex: STEEL }];
      for (let band = 0; band < 3; band += 1) {
        const z = 0.34 + band * 0.08;
        jacket.push({ z, r: 0.055 }, { z, r: 0.046, hard: true, hex: STEEL_DARK }, { z: z + 0.03, r: 0.046 }, { z: z + 0.03, r: 0.055, hard: true, hex: STEEL });
      }
      jacket.push({ z: 0.62, r: 0.055 }, { z: 0.645, r: 0.032, hex: STEEL_DARK }, { z: 0.88, r: 0.032 }, { z: 0.88, r: 0.044, hard: true }, { z: 0.98, r: 0.04 });
      kit.lathe(jacket, { at: [0, 0.17, 0], segments: 10, capStart: true, capEnd: true });
      // Carry handle and front sight.
      kit.tube(BLACK, [[0, 0.215, 0.4], [0, 0.285, 0.44], [0, 0.29, 0.54], [0, 0.215, 0.58]], 0.014, { segments: 6, samples: 8 });
      kit.box(STEEL_DARK, [0.02, 0.06, 0.03], { at: [0, 0.215, 0.9], bevel: 0.007 });
      // Walnut handguard under the jacket.
      kit.box(WALNUT, [0.11, 0.075, 0.22], { at: [0, 0.105, 0.36], bevel: 0.028 });
      bipod(kit, BLACK, 0.12, 0.64, 0.24);
      // Olive ammo box on the left; the brass belt loops out on the right
      // (the side the over-the-shoulder camera sees) and back under the gun.
      kit.box(OLIVE, [0.09, 0.14, 0.18], { at: [0.1, 0.08, 0.1], bevel: 0.018 });
      kit.tube(
        (t) => (Math.floor(t * 16) % 2 === 0 ? BRASS : BRASS_DARK),
        [
          [-0.05, 0.2, 0.08],
          [-0.1, 0.16, 0.09],
          [-0.12, 0.05, 0.1],
          [-0.09, -0.05, 0.12],
          [0.0, -0.08, 0.13],
          [0.08, -0.03, 0.12],
        ],
        0.032,
        { segments: 6, samples: 17, ry: 0.5 },
      );
      pistolGrip(kit, WALNUT_DARK, 0.09, 0.19);
      triggerGuard(kit, BLACK, 0.085, 0.03, 0.1);
      kit.extrude(
        WALNUT,
        [
          [-0.16, 0.22],
          [-0.34, 0.19],
          [-0.36, 0.175],
          [-0.36, 0.03],
          [-0.32, 0.015],
          [-0.16, 0.09],
        ],
        0.074,
        { bevel: 0.024 },
      );
      kit.box(BLACK, [0.076, 0.16, 0.022], { at: [0, 0.1, -0.365], bevel: 0.008 });
    },
  },

  /** Bazooka: olive front tube, maroon rear, two dark grips, sight box; carried on the shoulder. */
  bazooka: {
    hold: {
      pose: 'launcher',
      shoulder: [0.24, -0.135, 0.1],
      tilt: 0.02,
      yaw: 0.04,
      support: null,
      gripAxis: [0, -1, -0.15],
      supportAxis: [0, -1, 0.05],
      muzzle: [0, 0.2, 0.74],
      muzzleKind: 'blast',
    },
    build: (kit) => {
      kit.lathe(
        [
          { z: -0.62, r: 0.1, hex: shadeHex(MAROON, 0.85) },
          { z: -0.55, r: 0.082 },
          { z: -0.5, r: 0.078, hard: true, hex: MAROON },
          { z: -0.12, r: 0.078 },
          { z: -0.12, r: 0.086, hard: true, hex: BLACK },
          { z: -0.08, r: 0.086 },
          { z: -0.08, r: 0.078, hard: true, hex: OLIVE },
          { z: 0.64, r: 0.078 },
          { z: 0.64, r: 0.092, hard: true, hex: shadeHex(OLIVE, 0.78) },
          { z: 0.74, r: 0.09 },
          { z: 0.74, r: 0.066, hard: true, hex: BLACK },
          { z: 0.7, r: 0.0 },
        ],
        { at: [0, 0.2, 0], segments: 16, capStart: true },
      );
      kit.lathe([{ z: -0.625, r: 0.07, hex: BLACK }, { z: -0.58, r: 0 }], { at: [0, 0.2, 0], segments: 12 });
      // Sight box and a battery box on the left.
      kit.box(BLACK, [0.04, 0.08, 0.12], { at: [-0.0, 0.31, 0.2], bevel: 0.012 });
      kit.box(STEEL_DARK, [0.05, 0.08, 0.14], { at: [0.085, 0.17, -0.02], bevel: 0.014 });
      // Grips under the tube.
      kit.box(BLACK, [0.07, 0.04, 0.12], { at: [0, 0.115, 0.02], bevel: 0.012 });
      pistolGrip(kit, BLACK, 0.11, 0.2, 0.056);
      triggerGuard(kit, BLACK, 0.1, 0.03, 0.1);
      kit.lathe([{ z: -0.11, r: 0.026, hex: BLACK }, { z: 0.1, r: 0.03 }], { at: [0, 0.08, 0.18], rot: [HALF_PI + 0.1, 0, 0], segments: 10, capStart: true, capEnd: true });
    },
  },

  /** Hunting rifle: walnut stock, long dark barrel, black scope with brass rings. */
  sniper: {
    hold: {
      pose: 'rifle',
      shoulder: [0.09, -0.115, 0.08],
      tilt: 0.03,
      yaw: 0.26,
      support: [0, 0.1, 0.28],
      gripAxis: [0, -1, -0.45],
      supportAxis: [0, -1, 0.2],
      butt: -0.38,
      muzzle: [0, 0.165, 1.04],
      muzzleKind: 'heavy',
    },
    build: (kit) => {
      kit.box(STEEL_DARK, [0.07, 0.07, 0.24], { at: [0, 0.16, 0.06], bevel: 0.02 });
      barrel(kit, STEEL_DARK, 0.165, 0.17, 1.04, 0.027, 1.4);
      // Scope with brass rings and a bright lens.
      kit.lathe(
        [
          { z: -0.1, r: 0.05, hex: BLACK },
          { z: -0.06, r: 0.037 },
          { z: 0.12, r: 0.037 },
          { z: 0.17, r: 0.058 },
          { z: 0.22, r: 0.058 },
          { z: 0.22, r: 0.044, hard: true, hex: '#8fd8f2' },
          { z: 0.2, r: 0.0 },
        ],
        { at: [0, 0.27, 0.06], segments: 12, capStart: true },
      );
      for (const z of [-0.01, 0.13]) kit.box(BRASS, [0.034, 0.07, 0.034], { at: [0, 0.22, z], bevel: 0.011 });
      kit.blob(STEEL_LIGHT, [0.02, 0.02, 0.02], { at: [-0.075, 0.16, 0.0], segments: 6, rings: 4 });
      kit.tube(STEEL_LIGHT, [[-0.03, 0.17, 0.0], [-0.075, 0.16, 0.0]], 0.008, { segments: 5 });
      triggerGuard(kit, STEEL_DARK, 0.11, 0.02, 0.1);
      // Walnut stock + fore-end with a cheek comb.
      kit.extrude(
        WALNUT,
        [
          [-0.06, 0.19],
          [-0.22, 0.175],
          [-0.35, 0.15],
          [-0.375, 0.135],
          [-0.385, -0.04],
          [-0.34, -0.055],
          [-0.16, -0.005],
          [-0.07, -0.09],
          [0.03, -0.085],
          [0.045, 0.06],
          [0.14, 0.1],
          [0.62, 0.115],
          [0.66, 0.13],
          [0.62, 0.155],
          [0.05, 0.15],
        ],
        0.064,
        { bevel: 0.022 },
      );
      kit.box(BLACK, [0.066, 0.18, 0.022], { at: [0, 0.045, -0.39], bevel: 0.008 });
    },
  },

  /** Blue-steel pistol with walnut grip panels and a fat black silencer. */
  silenced_pistol: {
    hold: {
      pose: 'pistol',
      shoulder: [0.17, 0.015, 0.4],
      tilt: 0.0,
      yaw: 0.1,
      support: null,
      gripAxis: [0, -1, -0.25],
      supportAxis: [0, -1, -0.25],
      muzzle: [0, 0.14, 0.5],
      muzzleKind: 'bullet',
    },
    build: (kit) => {
      kit.box(BLUE_STEEL, [0.06, 0.07, 0.28], { at: [0, 0.145, 0.06], bevel: 0.018 });
      kit.box(shadeHex(BLUE_STEEL, 0.8), [0.058, 0.04, 0.22], { at: [0, 0.095, 0.05], bevel: 0.012 });
      kit.box(STEEL_DARK, [0.02, 0.035, 0.03], { at: [0, 0.18, -0.07], rot: [0.5, 0, 0], bevel: 0.008 });
      kit.lathe(
        [
          { z: 0.19, r: 0.03, hex: BLACK },
          { z: 0.205, r: 0.044 },
          { z: 0.48, r: 0.044 },
          { z: 0.5, r: 0.034 },
        ],
        { at: [0, 0.14, 0], segments: 12, capStart: true, capEnd: true },
      );
      kit.extrude(
        BLUE_STEEL,
        [
          [-0.045, 0.085],
          [0.035, 0.085],
          [0.028, 0.0],
          [0.012, -0.1],
          [-0.048, -0.105],
          [-0.06, -0.01],
        ],
        0.05,
        { bevel: 0.012 },
      );
      for (const side of [-1, 1]) {
        kit.extrude(
          WALNUT,
          [
            [-0.035, 0.06],
            [0.022, 0.06],
            [0.01, -0.085],
            [-0.042, -0.088],
            [-0.05, -0.01],
          ],
          0.012,
          { at: [side * 0.027, 0, 0], bevel: 0.004 },
        );
      }
      triggerGuard(kit, BLUE_STEEL, 0.075, 0.03, 0.09);
    },
  },

  /** Bowie knife: broad steel blade, brass guard, leather-wrapped handle, pommel. */
  knife: {
    hold: {
      pose: 'knife',
      shoulder: [0.22, -0.165, 0.26],
      tilt: -1.15,
      yaw: 0.25,
      support: null,
      gripAxis: [0, 1, 0],
      supportAxis: [0, 1, 0],
      muzzle: null,
      muzzleKind: null,
    },
    build: (kit) => {
      // Handle along +Y through the fist with chunky grip rings.
      kit.lathe(
        [
          { z: -0.085, r: 0.03, hex: LEATHER },
          { z: -0.06, r: 0.036 },
          { z: -0.035, r: 0.031 },
          { z: -0.01, r: 0.036 },
          { z: 0.015, r: 0.031 },
          { z: 0.04, r: 0.036 },
          { z: 0.07, r: 0.032 },
        ],
        { rot: [-HALF_PI, 0, 0], segments: 10, capStart: true, capEnd: true },
      );
      kit.blob(STEEL_LIGHT, [0.04, 0.03, 0.04], { at: [0, -0.1, 0], segments: 10, rings: 5 });
      kit.box(BRASS, [0.05, 0.035, 0.15], { at: [0, 0.088, 0.0], bevel: 0.014 });
      // Broad clip-point bowie blade, edge forward (+Z), dark spine strip.
      kit.extrude(
        STEEL_LIGHT,
        [
          [-0.038, 0.1],
          [0.058, 0.1],
          [0.066, 0.22],
          [0.06, 0.31],
          [0.04, 0.38],
          [0.008, 0.44],
          [-0.012, 0.38],
          [-0.038, 0.33],
        ],
        0.024,
        { bevel: 0.008 },
      );
      kit.box(STEEL, [0.028, 0.22, 0.016], { at: [0, 0.215, -0.034], bevel: 0.005 });
    },
  },

  /** Snow cannon: yellow drum body, steel turbine intake with a dark fan, yellow saddle. */
  snow_cannon: {
    hold: {
      pose: 'hip',
      shoulder: [0.1, -0.255, 0.1],
      tilt: 0.1,
      yaw: 0.24,
      support: [0, 0.36, 0.06],
      gripAxis: [0, -1, -0.2],
      supportAxis: [1, 0, 0],
      muzzle: [0, 0.2, 0.52],
      muzzleKind: 'snow',
    },
    build: (kit) => {
      kit.lathe(
        [
          { z: -0.26, r: 0.06, hex: shadeHex(SNOW_YELLOW, 0.82) },
          { z: -0.24, r: 0.1 },
          { z: -0.22, r: 0.115, hex: SNOW_YELLOW },
          { z: 0.26, r: 0.13 },
          { z: 0.26, r: 0.155, hard: true, hex: STEEL_LIGHT },
          { z: 0.3, r: 0.165 },
          { z: 0.46, r: 0.165 },
          { z: 0.5, r: 0.15 },
          { z: 0.5, r: 0.13, hard: true, hex: STEEL_DARK },
          { z: 0.44, r: 0.12 },
        ],
        { at: [0, 0.2, 0], segments: 18, capStart: true, capEnd: true },
      );
      // Fan blades and spinner.
      for (let blade = 0; blade < 6; blade += 1) {
        const angle = (blade / 6) * Math.PI * 2;
        kit.box(STEEL, [0.028, 0.105, 0.012], {
          at: [Math.cos(angle) * 0.065, 0.2 + Math.sin(angle) * 0.065, 0.455],
          rot: [0, 0.5, angle + HALF_PI],
          bevel: 0.005,
        });
      }
      kit.lathe([{ z: 0.43, r: 0.045, hex: STEEL_LIGHT }, { z: 0.49, r: 0.032 }, { z: 0.52, r: 0.0 }], { at: [0, 0.2, 0], segments: 10, capStart: true });
      // Yellow saddle mount, dark pistol grip, top carry handle, hose stub.
      kit.extrude(
        SNOW_YELLOW,
        [
          [-0.16, 0.12],
          [0.16, 0.12],
          [0.11, 0.06],
          [0.06, 0.06],
          [0.02, 0.1],
          [-0.06, 0.1],
          [-0.12, 0.05],
        ],
        0.12,
        { bevel: 0.03 },
      );
      pistolGrip(kit, BLACK, 0.1, 0.19, 0.056);
      triggerGuard(kit, BLACK, 0.09, 0.03, 0.1);
      kit.tube(BLACK, [[0, 0.31, -0.1], [0, 0.38, -0.04], [0, 0.385, 0.12], [0, 0.32, 0.18]], 0.018, { segments: 6, samples: 8 });
      kit.tube(BLACK, [[0, 0.2, -0.27], [0, 0.16, -0.34], [0, 0.06, -0.36]], 0.03, { segments: 8, samples: 5, capEnd: true });
      kit.box(STEEL_DARK, [0.05, 0.03, 0.12], { at: [0.0, 0.32, 0.36], bevel: 0.01 });
    },
  },

  /** Sand flamer: copper body, long nozzle, red + green tanks with hoses, red grip. */
  sand_flamer: {
    hold: {
      pose: 'hip',
      shoulder: [0.09, -0.185, 0.08],
      tilt: 0.08,
      yaw: 0.26,
      support: [0, 0.05, 0.27],
      gripAxis: [0, -1, -0.3],
      supportAxis: [0, -1, 0.2],
      muzzle: [0, 0.155, 0.76],
      muzzleKind: 'flame',
    },
    build: (kit) => {
      kit.box(FLAMER_COPPER, [0.1, 0.12, 0.36], { at: [0, 0.155, 0.04], bevel: 0.03 });
      kit.lathe(
        [
          { z: 0.2, r: 0.04, hex: STEEL },
          { z: 0.24, r: 0.03 },
          { z: 0.62, r: 0.03 },
          { z: 0.62, r: 0.04, hard: true, hex: STEEL_DARK },
          { z: 0.7, r: 0.05 },
          { z: 0.76, r: 0.05 },
          { z: 0.76, r: 0.034, hard: true, hex: '#ff8a1c' },
          { z: 0.74, r: 0 },
        ],
        { at: [0, 0.155, 0], segments: 12, capStart: true },
      );
      for (const z of [0.36, 0.48]) kit.lathe([{ z, r: 0.036, hex: BRASS_DARK }, { z: z + 0.03, r: 0.036 }], { at: [0, 0.155, 0], segments: 10 });
      kit.blob('#ffb02e', [0.022, 0.022, 0.022], { at: [0, 0.1, 0.72], segments: 6, rings: 4 });
      // Two upright tanks at the back-left, joined by a strap.
      for (const [index, hex] of [TANK_RED, TANK_GREEN].entries()) {
        const x = 0.075 + index * 0.0;
        const z = -0.2 + index * 0.11;
        kit.lathe(
          [
            { z: -0.12, r: 0.0, hex },
            { z: -0.11, r: 0.04 },
            { z: -0.09, r: 0.052 },
            { z: 0.1, r: 0.052 },
            { z: 0.13, r: 0.035 },
            { z: 0.145, r: 0.02, hex: BRASS },
            { z: 0.175, r: 0.02 },
            { z: 0.175, r: 0, hard: true },
          ],
          { at: [x + 0.03, 0.17, z], rot: [-HALF_PI, 0, 0], segments: 12 },
        );
      }
      kit.box(LEATHER, [0.13, 0.03, 0.25], { at: [0.105, 0.17, -0.145], bevel: 0.01 });
      kit.tube(STEEL_DARK, [[0.105, 0.35, -0.2], [0.07, 0.4, -0.1], [0.03, 0.3, 0.02], [0.02, 0.2, 0.1]], 0.014, { segments: 6, samples: 10 });
      kit.tube(STEEL_DARK, [[0.105, 0.35, -0.09], [0.12, 0.42, 0.04], [0.05, 0.25, 0.12]], 0.012, { segments: 6, samples: 8 });
      pistolGrip(kit, GRIP_RED, 0.1, 0.19);
      triggerGuard(kit, STEEL_DARK, 0.095, 0.03, 0.1);
      kit.lathe([{ z: -0.1, r: 0.026, hex: GRIP_RED }, { z: 0.07, r: 0.03 }], { at: [0, 0.06, 0.27], rot: [HALF_PI + 0.12, 0, 0], segments: 10, capStart: true, capEnd: true });
    },
  },

  /** Crossbow: walnut stock, steel prod, cream string, a loaded bolt with a brass tip. */
  crossbow: {
    hold: {
      pose: 'rifle',
      shoulder: [0.09, -0.125, 0.08],
      tilt: 0.03,
      yaw: 0.26,
      support: [0, 0.1, 0.28],
      gripAxis: [0, -1, -0.45],
      supportAxis: [0, -1, 0.15],
      butt: -0.36,
      muzzle: [0, 0.2, 0.72],
      muzzleKind: null,
    },
    build: (kit) => {
      kit.extrude(
        WALNUT,
        [
          [-0.06, 0.18],
          [-0.32, 0.15],
          [-0.35, 0.13],
          [-0.36, -0.03],
          [-0.32, -0.045],
          [-0.15, 0.005],
          [-0.07, -0.09],
          [0.03, -0.085],
          [0.045, 0.06],
          [0.12, 0.13],
          [0.62, 0.15],
          [0.64, 0.19],
          [0.05, 0.19],
        ],
        0.07,
        { bevel: 0.022 },
      );
      // Steel prod (bow), sweeping back to the tips.
      kit.tube(
        STEEL,
        [
          [0.38, 0.18, 0.44],
          [0.2, 0.185, 0.58],
          [0, 0.19, 0.62],
          [-0.2, 0.185, 0.58],
          [-0.38, 0.18, 0.44],
        ],
        (t) => 0.02 + 0.024 * (1 - Math.abs(t - 0.5) * 2),
        { segments: 8, samples: 15, capStart: true, capEnd: true, ry: 0.65 },
      );
      kit.box(STEEL_DARK, [0.1, 0.07, 0.08], { at: [0, 0.185, 0.6], bevel: 0.018 });
      kit.tube('#f1e4c4', [[0.38, 0.18, 0.44], [0, 0.205, 0.16], [-0.38, 0.18, 0.44]], 0.006, { segments: 4, samples: 3 });
      // Bolt with fletching and a brass tip.
      kit.lathe([{ z: 0.12, r: 0.01, hex: WALNUT_DARK }, { z: 0.64, r: 0.01 }, { z: 0.64, r: 0.02, hard: true, hex: BRASS }, { z: 0.72, r: 0 }], { at: [0, 0.205, 0], segments: 6 });
      kit.extrude('#e8433b', [[0.12, 0.205], [0.2, 0.205], [0.2, 0.235], [0.13, 0.25]], 0.006, { bevel: 0 });
      kit.box(BLACK, [0.04, 0.05, 0.04], { at: [0, 0.2, 0.05], bevel: 0.01 });
      kit.tube(STEEL_DARK, [[0.03, 0.16, 0.64], [0.06, 0.08, 0.68], [0, 0.04, 0.7], [-0.06, 0.08, 0.68], [-0.03, 0.16, 0.64]], 0.01, { segments: 5, samples: 9 });
      triggerGuard(kit, STEEL_DARK, 0.1, 0.02, 0.1);
      kit.box(BLACK, [0.072, 0.17, 0.02], { at: [0, 0.05, -0.365], bevel: 0.008 });
    },
  },

  /** Halberd: long oxblood shaft with steel bands, crescent axe, back spike, spear point. */
  halberd: {
    hold: {
      pose: 'polearm',
      shoulder: [0.16, -0.255, -0.02],
      tilt: -1.12,
      yaw: 0.24,
      support: [0, 0.32, 0],
      gripAxis: [0, 1, 0],
      supportAxis: [0, 1, 0],
      muzzle: null,
      muzzleKind: null,
    },
    // Guard stance in the wardrobe: the halberd stands upright beside him.
    preview: { shoulder: [0.3, -0.2, 0.16], tilt: -0.12, yaw: 0 },
    build: (kit) => {
      kit.lathe(
        [
          { z: -0.46, r: 0.032, hex: STEEL_DARK },
          { z: -0.41, r: 0.04 },
          { z: -0.38, r: 0.034, hard: true, hex: HALBERD_SHAFT },
          { z: 0.24, r: 0.034 },
          { z: 0.24, r: 0.04, hard: true, hex: STEEL },
          { z: 0.29, r: 0.04 },
          { z: 0.29, r: 0.034, hard: true, hex: HALBERD_SHAFT },
          { z: 1.08, r: 0.034 },
          { z: 1.08, r: 0.042, hard: true, hex: STEEL },
          { z: 1.42, r: 0.036 },
        ],
        { rot: [-HALF_PI, 0, 0], segments: 10, capStart: true, capEnd: true },
      );
      // Spear point.
      kit.lathe(
        [
          { z: 1.4, r: 0.036, hex: STEEL_LIGHT },
          { z: 1.47, r: 0.065 },
          { z: 1.76, r: 0.0 },
        ],
        { rot: [-HALF_PI, 0, 0], segments: 4, phase: Math.PI / 4 },
      );
      // Crescent axe blade (edge forward, +Z) and a back spike.
      kit.extrude(
        STEEL_LIGHT,
        [
          [0.03, 1.12],
          [0.15, 1.02],
          [0.3, 1.06],
          [0.38, 1.22],
          [0.34, 1.38],
          [0.2, 1.44],
          [0.03, 1.36],
        ],
        0.03,
        { bevel: 0.01 },
      );
      kit.extrude(
        STEEL,
        [
          [-0.03, 1.18],
          [-0.3, 1.27],
          [-0.03, 1.31],
        ],
        0.028,
        { bevel: 0.009 },
      );
      kit.box(BRASS, [0.09, 0.06, 0.09], { at: [0, 1.1, 0], bevel: 0.018 });
      kit.box(BRASS, [0.09, 0.05, 0.09], { at: [0, 1.4, 0], bevel: 0.016 });
    },
  },

  /** Rainbow umbrella: dark shaft, J-hook walnut handle, brass tip; canopy is the extra part. */
  umbrella: {
    hold: {
      pose: 'umbrella',
      shoulder: [0.2, -0.105, 0.16],
      tilt: 0.25,
      yaw: 0.1,
      support: null,
      gripAxis: [0, 1, 0],
      supportAxis: [0, 1, 0],
      muzzle: null,
      muzzleKind: null,
    },
    preview: { shoulder: [0.2, -0.005, 0.1], tilt: 0.7, yaw: 0.5 },
    build: (kit) => {
      kit.lathe([{ z: -0.03, r: 0.018, hex: BLACK }, { z: 0.98, r: 0.018 }], { rot: [-HALF_PI, 0, 0], segments: 6 });
      kit.lathe([{ z: 0.96, r: 0.018, hex: BRASS }, { z: 1.06, r: 0.0 }], { rot: [-HALF_PI, 0, 0], segments: 8 });
      kit.tube(
        WALNUT,
        [
          [0, 0.06, 0],
          [0, -0.07, 0],
          [0, -0.13, 0.03],
          [0, -0.12, 0.09],
          [0, -0.08, 0.1],
        ],
        0.024,
        { segments: 8, samples: 9, capEnd: true },
      );
    },
    extra: {
      closed: (kit) => {
        // Furled canopy: a slim rainbow spindle with a strap.
        kit.lathe(
          [
            { z: 0.3, r: 0.02 },
            { z: 0.44, r: 0.075 },
            { z: 0.62, r: 0.08 },
            { z: 0.93, r: 0.022 },
          ],
          { rot: [-HALF_PI, 0, 0], segments: 8, stripes: UMBRELLA_STRIPES, bump: (theta) => 0.18 * Math.abs(Math.sin(theta * 4)) },
        );
        kit.lathe([{ z: 0.58, r: 0.084, hex: BLACK }, { z: 0.62, r: 0.084 }], { rot: [-HALF_PI, 0, 0], segments: 8 });
      },
      open: (kit) => {
        // Open dome: eight two-segment gores, the rim sagging between rib tips.
        const scallop = (theta: number, ring: number): number => (ring === 0 && Math.round(theta / (Math.PI / 8)) % 2 === 1 ? -0.1 : 0);
        kit.lathe(
          [
            { z: 0.62, r: 0.68 },
            { z: 0.7, r: 0.6 },
            { z: 0.84, r: 0.4 },
            { z: 0.93, r: 0.18 },
            { z: 0.96, r: 0.02 },
          ],
          { rot: [-HALF_PI, 0, 0], segments: 16, stripes: UMBRELLA_STRIPES, stripeWidth: 2, bump: scallop },
        );
        // Underside in the same gores, shaded, so the dome reads from below too.
        kit.lathe(
          [
            { z: 0.93, r: 0.0 },
            { z: 0.615, r: 0.66 },
          ],
          {
            rot: [-HALF_PI, 0, 0],
            segments: 16,
            stripes: UMBRELLA_STRIPES.map((hex) => shadeHex(hex, 0.62)),
            stripeWidth: 2,
            bump: (theta, ring) => scallop(theta, ring === 1 ? 0 : 1),
          },
        );
        for (let rib = 0; rib < 8; rib += 1) {
          const angle = (rib / 8) * Math.PI * 2;
          kit.blob(BRASS, [0.018, 0.018, 0.018], { at: [Math.cos(angle) * 0.68, 0.62, -Math.sin(angle) * 0.68], segments: 5, rings: 3 });
        }
      },
    },
  },

  /** Alphorn: long brass-wood tube from the mouth down to an upturned bell. */
  horn: {
    hold: {
      pose: 'horn',
      shoulder: [0.04, 0.155, 0.28],
      tilt: -1.95,
      yaw: 0.0,
      support: [0, 0.17, 0],
      gripAxis: [0, 1, 0],
      supportAxis: [0, 1, 0],
      muzzle: [0, 1.39, -0.24],
      muzzleDir: [0, 0.6, -0.8],
      muzzleKind: 'sonic',
    },
    preview: { shoulder: [0.04, 0.155, 0.28], tilt: -1.85, yaw: 0.55 },
    build: (kit) => {
      // Gun -Z turns into "up" once the hold swings the tube forward-down,
      // so the tube's end curls towards -Z into the upturned bell.
      kit.tube(
        (t) => (t > 0.18 && t < 0.22 ? BRASS_DARK : t > 0.62 && t < 0.66 ? BRASS_DARK : ALPHORN),
        [
          [0, -0.14, 0],
          [0, 0.05, 0],
          [0, 0.3, 0.005],
          [0, 0.7, 0.01],
          [0, 1.05, 0.0],
          [0, 1.24, -0.06],
          [0, 1.32, -0.16],
        ],
        (t) => 0.024 + Math.pow(t, 2.0) * 0.085,
        { segments: 10, samples: 22 },
      );
      // Bell with a brass rim and a dark mouth, along (0, 0.6, -0.8).
      kit.frame({ at: [0, 1.32, -0.16], rot: [Math.PI + 0.64, 0, 0] }, () => {
        kit.lathe(
          [
            { z: -0.03, r: 0.105, hex: ALPHORN },
            { z: 0.06, r: 0.15 },
            { z: 0.11, r: 0.21 },
            { z: 0.11, r: 0.21, hard: true, hex: BRASS },
            { z: 0.135, r: 0.205 },
            { z: 0.135, r: 0.18, hard: true, hex: '#3b2414' },
            { z: 0.04, r: 0.0 },
          ],
          { segments: 14 },
        );
      });
      kit.lathe(
        [
          { z: -0.2, r: 0.03, hex: BRASS },
          { z: -0.18, r: 0.034 },
          { z: -0.14, r: 0.022 },
        ],
        { rot: [-HALF_PI, 0, 0], segments: 8, capStart: true },
      );
    },
  },
};

export function weaponDesign(id: WeaponId): WeaponDesign | null {
  return DESIGNS[id] ?? null;
}

export const HERO_WEAPON_IDS = Object.keys(DESIGNS) as WeaponId[];
