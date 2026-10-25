import '@babylonjs/core/Shaders/ShadersInclude/bonesDeclaration';
import '@babylonjs/core/Shaders/ShadersInclude/bonesVertex';
import '@babylonjs/core/ShadersWGSL/ShadersInclude/bonesDeclaration';
import '@babylonjs/core/ShadersWGSL/ShadersInclude/bonesVertex';
import { Color3, Vector3, Vector4 } from '@babylonjs/core/Maths/math';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import type { BaseTexture } from '@babylonjs/core/Materials/Textures/baseTexture';
import type { Scene } from '@babylonjs/core/scene';
import { LOOK_SAMPLERS, LOOK_UNIFORMS } from '../shaders/look-common';
import { mascotFragmentGLSL, mascotFragmentWGSL, mascotVertexGLSL, mascotVertexWGSL } from '../shaders/mascot';
import { registerLookMaterial } from './look-state';
import type { MascotEye } from './mascot-models';
import { markCharacterLookMaterial, SUN_DIRECTION, type CharacterMaterialState } from './materials';

/**
 * Materials of the mascot class (see shaders/mascot.ts). One material per
 * view and surface, because the effect uniforms (soot, charred, frozen) and
 * the face-atlas cell are per mascot; the compiled programs and textures are
 * shared between views.
 */
export interface MascotMaterialOptions {
  /** Painted albedo; omit for vertex-coloured procedural parts. */
  albedo?: BaseTexture | null;
  normal?: BaseTexture | null;
  /** Multiply the albedo by vertex colour (procedural textured shell). */
  vertexTint?: boolean;
  /** Alpha-blended decal with an atlas cell (coconut face). */
  decal?: boolean;
  /** Alpha-tested, double-sided painted cards (lei flowers). */
  cutout?: boolean;
  /** x normal strength, y saturation, z contrast, w shade lift. */
  paint?: Vector4;
  /** Shader eyelids over two eyes painted into the albedo (Meshy cow). */
  lids?: { eyes: readonly MascotEye[]; color: readonly [number, number, number] } | null;
}

/** Lid state per material (x close A, y close B, z tilt), mutated in place. */
const lidStates = new WeakMap<ShaderMaterial, Vector4>();

const DEFAULT_PAINT = new Vector4(0.6, 1.12, 1.06, 0.26);
const FULL_RECT = new Vector4(0, 0, 1, 1);

export function createMascotMaterial(scene: Scene, name: string, options: MascotMaterialOptions = {}): ShaderMaterial {
  const webgpu = scene.getEngine().isWebGPU;
  const textured = Boolean(options.albedo);
  const vertexColour = !textured || Boolean(options.vertexTint);
  const normalMapped = textured && Boolean(options.normal);
  const attributes = ['position', 'normal'];
  if (textured) attributes.push('uv');
  if (vertexColour) attributes.push('color');
  const defines: string[] = [];
  if (textured) defines.push('#define FF_TEXTURED');
  if (vertexColour) defines.push('#define FF_VCOLOR');
  if (normalMapped) defines.push('#define FF_NORMALMAP');
  if (textured && options.decal) defines.push('#define FF_DECAL');
  if (textured && options.cutout) defines.push('#define FF_CUTOUT');
  const lids = textured && options.lids && options.lids.eyes.length === 2 ? options.lids : null;
  if (lids) defines.push('#define FF_LIDS');
  const samplers: string[] = [...LOOK_SAMPLERS];
  if (textured) samplers.push('albedoSampler');
  if (normalMapped) samplers.push('normalSampler');
  const material = new ShaderMaterial(
    name,
    scene,
    {
      vertexSource: webgpu ? mascotVertexWGSL : mascotVertexGLSL,
      fragmentSource: webgpu ? mascotFragmentWGSL : mascotFragmentGLSL,
    },
    {
      attributes,
      uniforms: [
        'world',
        'viewProjection',
        'lightDirection',
        'cameraPosition',
        'rimStrength',
        'uBattleDamage',
        'uCharredState',
        'uFrozenState',
        'uTime',
        'uPaintParams',
        'uAtlasRect',
        ...(lids ? ['uEyeA', 'uEyeB', 'uEyeAxisA', 'uEyeAxisB', 'uLids', 'uLidColor'] : []),
        ...LOOK_UNIFORMS,
      ],
      samplers,
      defines,
      needAlphaBlending: Boolean(options.decal),
      shaderLanguage: webgpu ? ShaderLanguage.WGSL : ShaderLanguage.GLSL,
    },
  );
  material.setVector3('lightDirection', SUN_DIRECTION);
  material.setVector3('cameraPosition', Vector3.Zero());
  material.setFloat('rimStrength', options.decal ? 0 : 0.55);
  material.setFloat('uBattleDamage', 0);
  material.setFloat('uCharredState', 0);
  material.setFloat('uFrozenState', 0);
  material.setFloat('uTime', 0);
  material.setVector4('uPaintParams', options.paint ?? DEFAULT_PAINT);
  material.setVector4('uAtlasRect', FULL_RECT);
  if (options.albedo) material.setTexture('albedoSampler', options.albedo);
  if (lids) {
    const [a, b] = lids.eyes as [MascotEye, MascotEye];
    material.setVector4('uEyeA', new Vector4(a.centre[0], a.centre[1], a.centre[2], a.radius));
    material.setVector4('uEyeB', new Vector4(b.centre[0], b.centre[1], b.centre[2], b.radius));
    material.setVector4('uEyeAxisA', new Vector4(a.axis[0], a.axis[1], a.axis[2], Math.sign(a.inner) || 1));
    material.setVector4('uEyeAxisB', new Vector4(b.axis[0], b.axis[1], b.axis[2], Math.sign(b.inner) || 1));
    material.setColor3('uLidColor', new Color3(lids.color[0], lids.color[1], lids.color[2]));
    const state = new Vector4(0, 0, 0, 0);
    lidStates.set(material, state);
    material.setVector4('uLids', state);
  }
  if (normalMapped && options.normal) material.setTexture('normalSampler', options.normal);
  material.backFaceCulling = !options.cutout;
  if (options.decal) {
    // The decal floats just above the shell; it never needs depth writes.
    material.disableDepthWrite = true;
  } else {
    markCharacterLookMaterial(material);
  }
  registerLookMaterial(scene, material, 'character', SUN_DIRECTION);
  return material;
}

/** Eyelids of a FF_LIDS material: closure per eye (0 open, 1 shut) and tilt (+ angry, - worried). */
export function setMascotLids(material: ShaderMaterial, closeA: number, closeB: number, tilt: number): void {
  const state = lidStates.get(material);
  if (state) state.set(closeA, closeB, tilt, 0);
}

export function updateMascotMaterial(
  material: ShaderMaterial,
  cameraPosition: Vector3,
  time: number,
  state: CharacterMaterialState,
): void {
  material.setVector3('cameraPosition', cameraPosition);
  material.setFloat('uTime', time);
  material.setFloat('uBattleDamage', state.battleDamage);
  material.setFloat('uCharredState', state.charred);
  material.setFloat('uFrozenState', state.frozen);
}
