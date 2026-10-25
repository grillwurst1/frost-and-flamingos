import type { Color4, Vector3 } from '@babylonjs/core/Maths/math';
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
import type { WeaponPose } from '../weapons/designs';
import { buildHeroWeapon } from '../weapons/hero-weapon';

/**
 * Small vertex-coloured prop builder for the painted characters: the
 * parachute canopy and cosmetic attachments, plus the adapter onto the
 * shared hero weapons (rendering/weapons). Props render with the
 * vertex-colour variant of the GLB cel shader (one merged mesh = one draw
 * call each).
 *
 * Weapon space: the right wrist target is the origin, the barrel points
 * along +Z and +Y is up (metres). The animator places this frame in front of
 * the chest along the aim direction and pulls the hands onto the grips with IK.
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
   * 'shoulders': `offset` is relative to the shoulder midpoint and scales
   * with the arm length (default 'chest': relative to Spine2, unscaled).
   */
  anchor?: 'chest' | 'shoulders';
}

/** Per-frame state a weapon prop animates from (umbrella canopy, flashes). */
export interface WeaponPropState {
  airborne: boolean;
  preview: boolean;
}

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

const GLB_STYLE: Readonly<Record<WeaponPose, HoldStyle>> = {
  rifle: 'rifle',
  hip: 'rifle',
  pistol: 'pistol',
  launcher: 'launcher',
  knife: 'melee',
  polearm: 'polearm',
  umbrella: 'umbrella',
  horn: 'launcher',
};

/**
 * Held weapon for the painted soldiers: the shared hero-weapon module
 * (rendering/weapons) built in wrist space, with its hold data mapped onto
 * this animator's HoldSpec. The hold is refreshed from the prop each frame
 * so state-dependent holds (umbrella overhead while gliding) follow.
 */
export function buildWeaponProp(scene: Scene, id: WeaponId, material: ShaderMaterial): WeaponProp | null {
  const weapon = buildHeroWeapon(scene, id, material, { origin: 'wrist' });
  if (!weapon) return null;
  const pose = weapon.pose;
  const hold: HoldSpec = {
    style: GLB_STYLE[weapon.hold.pose],
    support: pose.support,
    tilt: pose.tilt,
    offset: pose.shoulder,
    yaw: pose.yaw,
    anchor: 'shoulders',
  };
  return {
    mesh: weapon.mesh,
    hold,
    muzzle: weapon.muzzle,
    fire: () => weapon.fire(),
    animate: (deltaSeconds, state) => {
      weapon.animate(deltaSeconds, state);
      hold.tilt = pose.tilt;
      hold.offset = pose.shoulder;
      hold.yaw = pose.yaw;
    },
  };
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
