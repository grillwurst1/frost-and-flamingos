import type { Color4 } from '@babylonjs/core/Maths/math';
import { Vector3 } from '@babylonjs/core/Maths/math';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import type { Scene } from '@babylonjs/core/scene';
import type { WeaponId } from '@frost-and-flamingos/shared';
import { hexToColor4 } from '../materials';
import { mergeParts, paintMesh } from '../mesh-utils';

/**
 * Small vertex-coloured prop builder for the painted characters: held
 * weapons and the parachute canopy. Props render with the vertex-colour
 * variant of the GLB cel shader (one merged mesh = one draw call each).
 *
 * Weapon space: the right-hand grip is the origin, the barrel points along
 * +Z and +Y is up (metres). The animator places this frame in front of the
 * chest along the aim direction and pulls the hands onto the grips with IK.
 */
interface PartOptions {
  rx?: number;
  ry?: number;
  rz?: number;
  segments?: number;
}

export class PartList {
  readonly parts: Mesh[] = [];
  constructor(private readonly scene: Scene) {}

  private place(mesh: Mesh, color: Color4, x: number, y: number, z: number, options: PartOptions): Mesh {
    mesh.position.set(x, y, z);
    mesh.rotation.set(options.rx ?? 0, options.ry ?? 0, options.rz ?? 0);
    paintMesh(mesh, color);
    mesh.isPickable = false;
    this.parts.push(mesh);
    return mesh;
  }

  box(hex: string, w: number, h: number, d: number, x: number, y: number, z: number, options: PartOptions = {}): Mesh {
    return this.place(CreateBox('prop-box', { width: w, height: h, depth: d }, this.scene), hexToColor4(hex), x, y, z, options);
  }

  /** Cylinder along +Y unless rotated (rx = PI/2 points it along +Z). */
  cylinder(hex: string, length: number, top: number, bottom: number, x: number, y: number, z: number, options: PartOptions = {}): Mesh {
    const mesh = CreateCylinder(
      'prop-cylinder',
      { height: length, diameterTop: top, diameterBottom: bottom, tessellation: options.segments ?? 10 },
      this.scene,
    );
    return this.place(mesh, hexToColor4(hex), x, y, z, options);
  }

  sphere(hex: string, diameter: number, x: number, y: number, z: number, options: PartOptions & { sx?: number; sy?: number; sz?: number } = {}): Mesh {
    const mesh = CreateSphere('prop-sphere', { diameter, segments: options.segments ?? 8 }, this.scene);
    mesh.scaling.set(options.sx ?? 1, options.sy ?? 1, options.sz ?? 1);
    return this.place(mesh, hexToColor4(hex), x, y, z, options);
  }

  torus(hex: string, diameter: number, thickness: number, x: number, y: number, z: number, options: PartOptions = {}): Mesh {
    const mesh = CreateTorus('prop-torus', { diameter, thickness, tessellation: options.segments ?? 16 }, this.scene);
    return this.place(mesh, hexToColor4(hex), x, y, z, options);
  }

  merge(name: string, material: ShaderMaterial): Mesh | null {
    return mergeParts(this.scene, name, this.parts, material);
  }
}

export type HoldStyle = 'rifle' | 'pistol' | 'launcher' | 'melee' | 'polearm' | 'umbrella';

export interface HoldSpec {
  style: HoldStyle;
  /** Support (left) hand grip in weapon space, or null = free left arm. */
  support: Vector3 | null;
  /** Weapon-space pitch offset (polearms are held tilted up). */
  tilt: number;
  /**
   * Right-hand grip relative to the anchor in the aim frame (x = character
   * right, y = up, z = forward); overrides the style's default offset.
   */
  offset?: readonly [number, number, number];
  /** Weapon yaw against the aim (radians, + = muzzle to the holder's left). */
  yaw?: number;
  /**
   * 'shoulders': `offset` is relative to the bind-pose shoulder point (rigid
   * on Spine2) and scales with arm length and body bulk; the support-hand
   * pull is capped. Default 'chest': relative to Spine2, unscaled.
   */
  anchor?: 'chest' | 'shoulders';
  /**
   * Weapon-space z of the stock butt for the chest-clearance rule; null =
   * nothing behind the grip (poles, pistols). Omitted: the mesh bounds.
   */
  rear?: number | null;
}

/** Per-frame state a weapon prop animates from (umbrella canopy, flashes). */
export interface WeaponPropState {
  airborne: boolean;
  preview: boolean;
}

const WOOD = '#9a5f30';
const DARK_WOOD = '#6b3f1e';
const STEEL = '#59646e';
const DARK = '#2e343a';
const LIGHT = '#b7c1c9';
const BRASS = '#d9a640';
const HALF_PI = Math.PI / 2;

function stock(p: PartList, hex: string): void {
  p.box(hex, 0.055, 0.08, 0.24, 0, -0.01, -0.17, { rx: 0.18 });
}

function grip(p: PartList, hex: string): void {
  p.box(hex, 0.045, 0.11, 0.05, 0, -0.04, 0.0, { rx: 0.32 });
}

const BUILDERS: Partial<Record<WeaponId, (p: PartList) => HoldSpec>> = {
  smg: (p) => {
    stock(p, WOOD);
    grip(p, WOOD);
    p.box(STEEL, 0.07, 0.085, 0.3, 0, 0.055, 0.1);
    p.cylinder(DARK, 0.26, 0.032, 0.032, 0, 0.065, 0.36, { rx: HALF_PI });
    p.cylinder(DARK, 0.06, 0.15, 0.15, 0, -0.02, 0.14, { rz: HALF_PI, segments: 14 });
    p.box(WOOD, 0.045, 0.1, 0.05, 0, -0.03, 0.3, { rx: -0.1 });
    return { style: 'rifle', support: new Vector3(0, -0.05, 0.22), tilt: 0 };
  },
  lmg: (p) => {
    stock(p, DARK_WOOD);
    grip(p, DARK);
    p.box(DARK, 0.085, 0.1, 0.42, 0, 0.06, 0.15);
    p.cylinder(STEEL, 0.42, 0.04, 0.04, 0, 0.07, 0.56, { rx: HALF_PI });
    p.box(BRASS, 0.07, 0.1, 0.12, 0.06, 0.0, 0.12);
    p.box(DARK, 0.03, 0.03, 0.18, 0, 0.13, 0.12);
    p.cylinder(DARK, 0.2, 0.016, 0.016, 0.04, -0.04, 0.62, { rx: 0.5 });
    p.cylinder(DARK, 0.2, 0.016, 0.016, -0.04, -0.04, 0.62, { rx: 0.5 });
    return { style: 'rifle', support: new Vector3(0, -0.02, 0.26), tilt: 0 };
  },
  sniper: (p) => {
    stock(p, WOOD);
    grip(p, WOOD);
    p.box(WOOD, 0.06, 0.07, 0.4, 0, 0.04, 0.16);
    p.cylinder(DARK, 0.5, 0.028, 0.028, 0, 0.07, 0.6, { rx: HALF_PI });
    p.cylinder(DARK, 0.26, 0.055, 0.05, 0, 0.15, 0.12, { rx: HALF_PI, segments: 12 });
    p.cylinder(LIGHT, 0.02, 0.06, 0.06, 0, 0.15, 0.26, { rx: HALF_PI, segments: 12 });
    return { style: 'rifle', support: new Vector3(0, -0.01, 0.24), tilt: 0 };
  },
  shotgun: (p) => {
    stock(p, DARK_WOOD);
    grip(p, DARK_WOOD);
    p.box(STEEL, 0.07, 0.07, 0.14, 0, 0.05, 0.05);
    p.cylinder(DARK, 0.46, 0.042, 0.042, 0.022, 0.07, 0.34, { rx: HALF_PI });
    p.cylinder(DARK, 0.46, 0.042, 0.042, -0.022, 0.07, 0.34, { rx: HALF_PI });
    p.box(WOOD, 0.07, 0.05, 0.16, 0, 0.025, 0.28);
    return { style: 'rifle', support: new Vector3(0, -0.01, 0.22), tilt: 0 };
  },
  bazooka: (p) => {
    p.cylinder('#5f7a3a', 0.95, 0.15, 0.15, 0, 0.11, 0.12, { rx: HALF_PI, segments: 14 });
    p.cylinder(BRASS, 0.08, 0.18, 0.18, 0, 0.11, 0.58, { rx: HALF_PI, segments: 14 });
    p.cylinder(DARK, 0.06, 0.17, 0.17, 0, 0.11, -0.34, { rx: HALF_PI, segments: 14 });
    grip(p, DARK);
    p.box(DARK, 0.04, 0.1, 0.05, 0, 0.0, 0.3, { rx: 0.2 });
    p.box('#f5c95b', 0.04, 0.05, 0.08, 0.08, 0.2, 0.0);
    return { style: 'launcher', support: new Vector3(0, -0.02, 0.3), tilt: 0 };
  },
  silenced_pistol: (p) => {
    p.box(DARK, 0.045, 0.06, 0.19, 0, 0.055, 0.06);
    p.cylinder(STEEL, 0.15, 0.036, 0.036, 0, 0.06, 0.23, { rx: HALF_PI });
    p.box(DARK_WOOD, 0.04, 0.11, 0.05, 0, -0.01, 0.0, { rx: 0.25 });
    return { style: 'pistol', support: new Vector3(0.035, -0.03, -0.01), tilt: 0 };
  },
  knife: (p) => {
    p.box(DARK_WOOD, 0.035, 0.035, 0.11, 0, 0, 0.0);
    p.box(LIGHT, 0.012, 0.045, 0.2, 0, 0.005, 0.15);
    p.box(BRASS, 0.07, 0.02, 0.02, 0, 0, 0.06);
    return { style: 'melee', support: null, tilt: 0.9 };
  },
  snow_cannon: (p) => {
    grip(p, DARK);
    p.cylinder('#2f7fd8', 0.5, 0.13, 0.16, 0, 0.08, 0.18, { rx: HALF_PI, segments: 14 });
    p.cylinder('#eef8ff', 0.1, 0.19, 0.19, 0, 0.08, 0.46, { rx: HALF_PI, segments: 14 });
    p.cylinder('#eef8ff', 0.16, 0.12, 0.09, 0, 0.21, 0.08, { segments: 12 });
    p.box(DARK, 0.04, 0.1, 0.05, 0, -0.03, 0.3);
    return { style: 'rifle', support: new Vector3(0, -0.04, 0.24), tilt: 0 };
  },
  sand_flamer: (p) => {
    grip(p, DARK);
    p.box('#f26f5e', 0.07, 0.08, 0.3, 0, 0.05, 0.12);
    p.cylinder(BRASS, 0.24, 0.05, 0.08, 0, 0.06, 0.38, { rx: HALF_PI, segments: 12 });
    p.cylinder('#f5c95b', 0.24, 0.12, 0.12, 0.09, -0.02, 0.06, { rx: HALF_PI, segments: 12 });
    p.box(DARK, 0.04, 0.09, 0.05, 0, -0.03, 0.26);
    return { style: 'rifle', support: new Vector3(0, -0.04, 0.22), tilt: 0 };
  },
  crossbow: (p) => {
    stock(p, WOOD);
    grip(p, WOOD);
    p.box(WOOD, 0.05, 0.06, 0.5, 0, 0.05, 0.16);
    p.box(DARK_WOOD, 0.62, 0.035, 0.04, 0, 0.06, 0.38, { ry: 0 });
    p.box(LIGHT, 0.56, 0.008, 0.008, 0, 0.065, 0.28);
    p.cylinder(BRASS, 0.34, 0.014, 0.014, 0, 0.09, 0.26, { rx: HALF_PI });
    return { style: 'rifle', support: new Vector3(0, -0.01, 0.24), tilt: 0 };
  },
  halberd: (p) => {
    p.cylinder(WOOD, 1.8, 0.04, 0.045, 0, 0, 0.5, { rx: HALF_PI });
    p.box(LIGHT, 0.02, 0.24, 0.18, 0, 0.1, 1.28);
    p.box(LIGHT, 0.02, 0.06, 0.24, 0, -0.02, 1.32, { rx: 0.2 });
    p.cylinder(LIGHT, 0.22, 0.0, 0.05, 0, 0, 1.48, { rx: HALF_PI });
    return { style: 'polearm', support: new Vector3(0, 0, 0.42), tilt: 0.95 };
  },
  umbrella: (p) => {
    p.cylinder(DARK_WOOD, 0.9, 0.025, 0.025, 0, 0.45, 0, {});
    p.torus(DARK_WOOD, 0.1, 0.022, 0.05, -0.02, 0, { rz: HALF_PI });
    p.cylinder('#f26f5e', 0.18, 0.06, 1.1, 0, 0.92, 0, { segments: 12 });
    p.cylinder('#f5c95b', 0.04, 0.02, 0.06, 0, 1.03, 0, {});
    return { style: 'umbrella', support: null, tilt: 0 };
  },
  horn: (p) => {
    p.cylinder(WOOD, 1.1, 0.06, 0.09, 0, 0.05, 0.45, { rx: HALF_PI });
    p.cylinder(DARK_WOOD, 0.22, 0.3, 0.1, 0, 0.05, 1.08, { rx: HALF_PI, segments: 14 });
    p.torus(BRASS, 0.12, 0.02, 0, 0.05, 0.3, { rx: HALF_PI });
    return { style: 'launcher', support: new Vector3(0, -0.02, 0.32), tilt: 0 };
  },
};

/**
 * Hand-attach API of the painted characters (glb-character.ts), for the
 * weapon package and anything else held in the hands:
 *
 *   - `mesh` is built in weapon space: origin at the right-hand grip, barrel
 *     along +Z, +Y up, metres at the character's scale (the view's class
 *     height scaling applies on top). The view parents it to its weapon
 *     anchor, enables only the current weapon, and disposes every prop it
 *     built when the view is disposed (one prop per weapon id and view).
 *   - `hold.style` picks the hold frame in front of the chest (rifle,
 *     pistol, launcher, melee, polearm, umbrella; see HOLD_OFFSETS there),
 *     the aim pitch and recoil move that frame, and two-bone IK pulls the
 *     right hand onto the origin.
 *   - `hold.support` is the left-hand grip in weapon space (null = the left
 *     arm stays free); `hold.tilt` pitches the prop up (polearms).
 *   - The mesh's bounding box (or `hold.rear`) is read once: its rear (minimum z) is kept in
 *     front of the chest, so long stocks are pushed forward instead of
 *     passing through the body.
 *   - Render with `material` (the view's vertex-colour cel material, so the
 *     prop gets the character look) or with your own material; the view
 *     counts one draw call per held prop.
 *
 * {@link registerWeaponProp} replaces the built-in placeholder props below
 * per weapon id; views created afterwards use the registered factory.
 */
export interface WeaponProp {
  mesh: Mesh;
  hold: HoldSpec;
  /** Muzzle socket (child of `mesh`, +Z out of the barrel), or null. */
  muzzle?: TransformNode | null;
  /** Shot feedback on the prop itself (muzzle flash, umbrella pop). */
  fire?(): void;
  /** Per-frame prop animation; may update `hold` (umbrella overhead). */
  animate?(deltaSeconds: number, state: WeaponPropState): void;
}

export type WeaponPropFactory = (scene: Scene, id: WeaponId, material: ShaderMaterial) => WeaponProp | null;

const registeredProps = new Map<WeaponId, WeaponPropFactory>();

/** Registers the held prop of one weapon (see the hand-attach API above). */
export function registerWeaponProp(id: WeaponId, factory: WeaponPropFactory): void {
  registeredProps.set(id, factory);
}

export function buildWeaponProp(scene: Scene, id: WeaponId, material: ShaderMaterial): WeaponProp | null {
  const registered = registeredProps.get(id);
  if (registered) return registered(scene, id, material);
  const builder = BUILDERS[id];
  if (!builder) return null;
  const parts = new PartList(scene);
  const hold = builder(parts);
  const mesh = parts.merge(`glb-weapon-${id}`, material);
  if (!mesh) return null;
  return { mesh, hold };
}

/** Faction-coloured parachute canopy (pivot at the harness, canopy above). */
export function buildCanopyProp(scene: Scene, alpine: boolean, material: ShaderMaterial): Mesh | null {
  const parts = new PartList(scene);
  const primary = alpine ? '#eef8ff' : '#3bd3bf';
  const secondary = alpine ? '#ff6b5e' : '#ffd166';
  const trim = alpine ? '#7dcbe9' : '#eafaff';
  parts.cylinder(secondary, 0.75, 1.4, 3.25, 0, 1.55, 0, { segments: 16 });
  parts.sphere(primary, 3.25, 0, 1.84, 0, { segments: 16, sy: 0.34 });
  parts.torus(trim, 3.3, 0.065, 0, 1.2, 0, { segments: 20 });
  for (const [x, z] of [
    [-1.35, -0.34],
    [1.35, -0.34],
    [-1.35, 0.34],
    [1.35, 0.34],
  ] as const) {
    parts.cylinder('#d8e6ee', 1.0, 0.026, 0.026, x * 0.62, 0.7, z, { rz: x > 0 ? -0.5 : 0.5, segments: 5 });
  }
  return parts.merge('glb-canopy', material);
}
