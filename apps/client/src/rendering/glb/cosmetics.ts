import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import type { Scene } from '@babylonjs/core/scene';
import {
  BACK_PALETTES,
  FACE_PALETTES,
  HANDS_PALETTES,
  HEADGEAR_PALETTES,
} from '@frost-and-flamingos/shared';
import { PartList } from './props';

/**
 * Simplified versions of the procedural rig's cosmetic builders, re-authored
 * as bone attachments for the painted characters. Each builder works in its
 * anchor's space:
 *   head  origin at the head centre, +Y up, +Z towards the face, for a head
 *         of radius {@link HEAD_UNIT} (scaled to the painted head),
 *   back  origin on the chest (Spine2), back surface at z = 0, +Z forward,
 *   hand  origin at the wrist, +Y along the fingers (Mixamo bone axis).
 * Keys are plain strings so items added by later packages can join in.
 */
export const HEAD_UNIT = 0.21;

interface Palette {
  primary: string;
  secondary: string;
  accent: string;
}

const FALLBACK: Palette = { primary: '#9bb9c9', secondary: '#6b747c', accent: '#f4c95d' };
const INK = '#1d1a17';

function palette(table: Readonly<Record<string, Palette>>, id: string): Palette {
  return table[id] ?? FALLBACK;
}

type Builder = (parts: PartList, colors: Palette, hairHex: string) => void;

const HALF_PI = Math.PI / 2;

const HEADGEAR: Readonly<Record<string, Builder>> = {
  head_tirol: (p, c) => {
    p.cylinder(c.primary, 0.05, 0.62, 0.62, 0, 0.18, 0, { segments: 16 });
    p.cylinder(c.primary, 0.18, 0.28, 0.36, 0, 0.29, 0, { segments: 12 });
    p.cylinder(c.secondary, 0.06, 0.37, 0.37, 0, 0.22, 0, { segments: 12 });
    p.box(c.accent, 0.05, 0.24, 0.02, 0.2, 0.33, 0.05, { rz: -0.5 });
  },
  head_fondue_pot: (p, c) => {
    p.cylinder(c.primary, 0.24, 0.38, 0.44, 0, 0.24, 0, { segments: 14 });
    p.cylinder(c.secondary, 0.05, 0.47, 0.47, 0, 0.36, 0, { segments: 14 });
    p.box('#8a5a33', 0.05, 0.05, 0.32, 0.3, 0.3, 0, { ry: 0 });
    p.sphere(c.accent, 0.08, 0, 0.41, 0);
  },
  head_marmot_fur: (p, c) => {
    p.sphere(c.primary, 0.5, 0, 0.17, -0.01, { sy: 0.62, segments: 10 });
    p.sphere(c.secondary, 0.12, -0.07, 0.24, 0.2);
    p.sphere(c.secondary, 0.12, 0.07, 0.24, 0.2);
    p.sphere(INK, 0.04, -0.05, 0.27, 0.25);
    p.sphere(INK, 0.04, 0.05, 0.27, 0.25);
    p.cylinder(c.secondary, 0.28, 0.04, 0.09, 0.16, 0.08, -0.2, { rx: -0.7, segments: 6 });
  },
  head_captain_cap: (p, c) => {
    p.cylinder(c.primary, 0.16, 0.4, 0.44, 0, 0.28, 0, { segments: 14 });
    p.cylinder(c.secondary, 0.07, 0.45, 0.45, 0, 0.21, 0, { segments: 14 });
    p.box('#222a30', 0.36, 0.04, 0.2, 0, 0.19, 0.18, { rx: -0.08 });
    p.cylinder(c.accent, 0.02, 0.1, 0.1, 0, 0.27, 0.22, { rx: HALF_PI });
  },
  head_watermelon: (p, c) => {
    p.sphere(c.primary, 0.5, 0, 0.18, 0, { sy: 0.62, segments: 12 });
    p.box(c.secondary, 0.34, 0.07, 0.16, 0, 0.19, 0.2);
    for (let seed = 0; seed < 3; seed += 1) p.sphere(c.accent, 0.025, -0.1 + seed * 0.1, 0.21, 0.28);
  },
  head_flamingo_hat: (p, c) => {
    p.sphere(c.primary, 0.3, 0, 0.3, 0, { sx: 1.2 });
    p.cylinder(c.primary, 0.24, 0.06, 0.08, 0.14, 0.42, 0, { rz: -0.35, segments: 6 });
    p.sphere(c.primary, 0.14, 0.24, 0.54, 0);
    p.box(c.secondary, 0.12, 0.05, 0.1, 0.32, 0.53, 0.02);
    p.sphere(INK, 0.03, 0.28, 0.57, 0.06);
  },
  head_diving_bell: (p, c) => {
    p.sphere(c.primary, 0.56, 0, 0.12, 0, { sy: 0.95, segments: 12 });
    p.cylinder(c.secondary, 0.1, 0.5, 0.56, 0, -0.14, 0, { segments: 14 });
    p.cylinder(c.accent, 0.03, 0.22, 0.22, 0, 0.12, 0.26, { rx: HALF_PI, segments: 12 });
    p.torus(c.secondary, 0.24, 0.025, 0, 0.12, 0.27, { rx: HALF_PI, segments: 12 });
  },
  head_bobble_hat: (p, c) => {
    p.sphere(c.primary, 0.48, 0, 0.14, -0.01, { sy: 0.7, segments: 12 });
    p.cylinder(c.secondary, 0.08, 0.47, 0.47, 0, 0.06, 0, { segments: 14 });
    p.sphere(c.accent, 0.16, 0, 0.36, -0.02);
  },
  head_bandana: (p, c) => {
    p.sphere(c.primary, 0.46, 0, 0.1, -0.01, { sy: 0.62, segments: 12 });
    p.box(c.primary, 0.12, 0.06, 0.04, 0.06, 0.06, -0.24, { rz: 0.5 });
    p.box(c.primary, 0.12, 0.06, 0.04, -0.06, 0.06, -0.24, { rz: -0.5 });
  },
  head_straw_hat: (p, c) => {
    p.cylinder(c.primary, 0.04, 0.78, 0.78, 0, 0.16, 0, { segments: 18 });
    p.cylinder(c.primary, 0.18, 0.3, 0.36, 0, 0.27, 0, { segments: 12 });
    p.cylinder(c.secondary, 0.05, 0.37, 0.37, 0, 0.2, 0, { segments: 12 });
  },
};

const FACE: Readonly<Record<string, Builder>> = {
  face_full_beard: (p, _c, hair) => {
    p.box(hair, 0.3, 0.18, 0.12, 0, -0.14, 0.13);
    p.box(hair, 0.18, 0.16, 0.1, 0, -0.24, 0.12);
    p.box(hair, 0.16, 0.04, 0.04, 0, -0.055, 0.21);
  },
  face_short_beard: (p, c) => {
    p.box(c.primary, 0.28, 0.12, 0.1, 0, -0.15, 0.13);
    p.box(c.primary, 0.15, 0.04, 0.04, 0, -0.055, 0.21);
  },
  face_mustache: (p, _c, hair) => {
    p.cylinder(hair, 0.16, 0.025, 0.035, -0.07, -0.045, 0.205, { rz: Math.PI / 2.4, segments: 5 });
    p.cylinder(hair, 0.16, 0.025, 0.035, 0.07, -0.045, 0.205, { rz: -Math.PI / 2.4, segments: 5 });
  },
  face_icicle_beard: (p, c) => {
    for (let icicle = 0; icicle < 5; icicle += 1) {
      p.cylinder(icicle % 2 === 0 ? c.primary : c.secondary, 0.12 + (icicle % 2) * 0.06, 0, 0.055, -0.12 + icicle * 0.06, -0.18 - (icicle % 2) * 0.03, 0.17, { segments: 5 });
    }
    p.box(c.primary, 0.16, 0.03, 0.03, 0, -0.05, 0.21);
  },
  face_bubble_pipe: (p, c) => {
    p.cylinder(c.primary, 0.16, 0.022, 0.022, 0.09, -0.09, 0.2, { rz: Math.PI / 2.8, segments: 5 });
    p.cylinder(c.secondary, 0.08, 0.07, 0.05, 0.16, -0.03, 0.2, { segments: 6 });
    p.sphere(c.accent, 0.07, 0.2, 0.06, 0.2);
  },
  face_snorkel_mask: (p, c) => {
    p.box(c.primary, 0.25, 0.12, 0.06, 0, 0.03, 0.21);
    p.box(c.secondary, 0.2, 0.08, 0.02, 0, 0.03, 0.24);
    p.cylinder(c.accent, 0.36, 0.03, 0.03, 0.16, 0.14, 0.12, { segments: 6 });
  },
  face_eyepatch_beard: (p, c) => {
    p.box(c.primary, 0.1, 0.075, 0.02, -0.078, 0.035, 0.235);
    p.box(c.primary, 0.42, 0.022, 0.02, 0, 0.06, 0.1);
    p.box(c.secondary, 0.26, 0.2, 0.12, 0, -0.16, 0.13);
  },
  face_flamingo_shades: (p, c) => {
    p.box(c.secondary, 0.28, 0.065, 0.025, 0, 0.035, 0.225);
    p.box(c.primary, 0.11, 0.055, 0.02, -0.075, 0.035, 0.24);
    p.box(c.primary, 0.11, 0.055, 0.02, 0.075, 0.035, 0.24);
  },
  face_sunglasses: (p, c) => {
    p.box(c.secondary, 0.28, 0.05, 0.025, 0, 0.035, 0.225);
    p.box(c.primary, 0.11, 0.06, 0.02, -0.075, 0.03, 0.24);
    p.box(c.primary, 0.11, 0.06, 0.02, 0.075, 0.03, 0.24);
  },
  face_sunscreen: (p, c) => {
    p.box(c.primary, 0.055, 0.09, 0.02, 0, -0.01, 0.245);
    p.box(c.secondary, 0.06, 0.03, 0.02, -0.11, -0.02, 0.215);
    p.box(c.secondary, 0.06, 0.03, 0.02, 0.11, -0.02, 0.215);
  },
};

const BACK: Readonly<Record<string, Builder>> = {
  back_cuckoo_clock: (p, c) => {
    p.box(c.primary, 0.34, 0.42, 0.14, 0, -0.02, -0.07);
    p.box(c.secondary, 0.42, 0.1, 0.2, 0, 0.24, -0.07, { rz: Math.PI / 4 });
    p.cylinder('#f7fbff', 0.02, 0.18, 0.18, 0, 0.01, -0.15, { rx: HALF_PI, segments: 14 });
    p.box('#e7b84d', 0.02, 0.16, 0.02, 0, -0.22, -0.15);
  },
  back_leather_pack: (p, c) => {
    p.box(c.primary, 0.36, 0.36, 0.16, 0, -0.02, -0.08);
    p.box(c.secondary, 0.38, 0.12, 0.18, 0, 0.13, -0.08);
    p.box(c.accent, 0.08, 0.06, 0.02, 0, 0.03, -0.17);
  },
  back_bedroll_pack: (p, c) => {
    p.box(c.primary, 0.34, 0.34, 0.15, 0, -0.04, -0.08);
    p.cylinder(c.secondary, 0.46, 0.14, 0.14, 0, 0.2, -0.08, { rz: HALF_PI, segments: 10 });
  },
  back_lifebuoy: (p, c) => {
    p.torus(c.primary, 0.46, 0.1, 0, -0.02, -0.06, { rx: HALF_PI, segments: 18 });
    for (let stripe = 0; stripe < 4; stripe += 1) {
      const angle = (stripe / 4) * Math.PI * 2;
      p.box(c.secondary, 0.1, 0.06, 0.12, Math.sin(angle) * 0.23, -0.02 + Math.cos(angle) * 0.23, -0.06, { rz: -angle });
    }
  },
  back_surfboard: (p, c) => {
    p.box(c.primary, 0.3, 0.9, 0.06, 0, -0.02, -0.06, { rz: 0.18 });
    p.box(c.secondary, 0.06, 0.86, 0.065, 0, -0.02, -0.07, { rz: 0.18 });
  },
  back_mini_bbq: (p, c) => {
    p.box(c.primary, 0.34, 0.2, 0.2, 0, -0.08, -0.1);
    p.box('#5c666e', 0.38, 0.04, 0.24, 0, 0.04, -0.1);
    p.box(c.secondary, 0.03, 0.2, 0.03, -0.11, -0.25, -0.08, { rz: 0.16 });
    p.box(c.secondary, 0.03, 0.2, 0.03, 0.11, -0.25, -0.08, { rz: -0.16 });
  },
};

/** Hand items: built once per hand; `right` marks the weapon hand. */
const HANDS: Readonly<Record<string, (p: PartList, c: Palette, right: boolean) => void>> = {
  hands_mittens: (p, c) => {
    p.sphere(c.primary, 0.13, 0, 0.06, 0, { sz: 0.75 });
    p.cylinder(c.secondary, 0.04, 0.1, 0.1, 0, 0.0, 0, { segments: 10 });
  },
  hands_boxing: (p, c) => {
    p.sphere(c.primary, 0.16, 0, 0.07, 0, { sz: 0.85 });
    p.cylinder(c.secondary, 0.06, 0.11, 0.11, 0, -0.01, 0, { segments: 10 });
  },
  hands_leather_gloves: (p, c) => {
    p.sphere(c.primary, 0.11, 0, 0.05, 0, { sz: 0.7 });
    p.cylinder(c.secondary, 0.04, 0.09, 0.1, 0, -0.01, 0, { segments: 10 });
  },
  hands_pirate_hook: (p, c, right) => {
    if (right) return;
    p.cylinder(c.secondary, 0.06, 0.08, 0.09, 0, 0.02, 0, { segments: 10 });
    p.torus(c.primary, 0.1, 0.022, 0, 0.11, 0.03, { ry: HALF_PI, segments: 10 });
  },
  hands_gold_watch: (p, c, right) => {
    if (right) return;
    p.torus(c.primary, 0.08, 0.018, 0, -0.02, 0, { segments: 12 });
  },
};

function build(scene: Scene, name: string, material: ShaderMaterial, fill: (parts: PartList) => void): Mesh | null {
  const parts = new PartList(scene);
  fill(parts);
  return parts.merge(name, material);
}

/**
 * Head attachment: headgear and face items merged into one mesh. `headgear`
 * 'hair_cap' builds a short hair cap for "no headgear" when the painted hat
 * comes off; null skips that slot.
 */
export function buildHeadAttachment(
  scene: Scene,
  headgear: string | null,
  face: string | null,
  hairHex: string,
  material: ShaderMaterial,
): Mesh | null {
  const hat = headgear ? HEADGEAR[headgear] : undefined;
  const faceBuilder = face ? FACE[face] : undefined;
  if (!hat && !faceBuilder && headgear !== 'hair_cap') return null;
  return build(scene, 'glb-head-items', material, (parts) => {
    if (headgear === 'hair_cap') parts.sphere(hairHex, 0.46, 0, 0.06, -0.02, { sy: 0.7, segments: 12 });
    else if (hat && headgear) hat(parts, palette(HEADGEAR_PALETTES, headgear), hairHex);
    if (faceBuilder && face) faceBuilder(parts, palette(FACE_PALETTES, face), hairHex);
  });
}

export function buildBackAttachment(scene: Scene, id: string, material: ShaderMaterial): Mesh | null {
  const builder = BACK[id];
  if (!builder) return null;
  return build(scene, `glb-back-${id}`, material, (parts) => builder(parts, palette(BACK_PALETTES, id), INK));
}

export function buildHandAttachment(scene: Scene, id: string, right: boolean, material: ShaderMaterial): Mesh | null {
  const builder = HANDS[id];
  if (!builder) return null;
  return build(scene, `glb-hand-${id}`, material, (parts) => builder(parts, palette(HANDS_PALETTES, id), right));
}
