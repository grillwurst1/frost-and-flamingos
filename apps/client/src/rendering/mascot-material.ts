import '@babylonjs/core/Shaders/ShadersInclude/bonesDeclaration';
import '@babylonjs/core/Shaders/ShadersInclude/bonesVertex';
import '@babylonjs/core/ShadersWGSL/ShadersInclude/bonesDeclaration';
import '@babylonjs/core/ShadersWGSL/ShadersInclude/bonesVertex';
import { Vector3, Vector4 } from '@babylonjs/core/Maths/math';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import type { BaseTexture } from '@babylonjs/core/Materials/Textures/baseTexture';
import type { Scene } from '@babylonjs/core/scene';
import { LOOK_SAMPLERS, LOOK_UNIFORMS } from '../shaders/look-common';
import { mascotFragmentGLSL, mascotFragmentWGSL, mascotVertexGLSL, mascotVertexWGSL } from '../shaders/mascot';
import { registerLookMaterial } from './look-state';
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
}

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
