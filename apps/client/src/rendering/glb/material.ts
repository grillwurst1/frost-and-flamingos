import '@babylonjs/core/Shaders/ShadersInclude/bonesDeclaration';
import '@babylonjs/core/Shaders/ShadersInclude/bonesVertex';
import '@babylonjs/core/ShadersWGSL/ShadersInclude/bonesDeclaration';
import '@babylonjs/core/ShadersWGSL/ShadersInclude/bonesVertex';
import { Vector3, Vector4 } from '@babylonjs/core/Maths/math';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import type { BaseTexture } from '@babylonjs/core/Materials/Textures/baseTexture';
import type { Scene } from '@babylonjs/core/scene';
import { LOOK_SAMPLERS, LOOK_UNIFORMS } from '../../shaders/look-common';
import {
  glbCharacterFragmentGLSL,
  glbCharacterFragmentWGSL,
  glbCharacterVertexGLSL,
  glbCharacterVertexWGSL,
} from '../../shaders/glb-character';
import { registerLookMaterial } from '../look-state';
import { markCharacterLookMaterial, SUN_DIRECTION, type CharacterMaterialState } from '../materials';

/** Painted texture set shared by every instance of one model. */
export interface PaintedTextures {
  albedo: BaseTexture;
  normal: BaseTexture | null;
}

/**
 * x normal-map strength, y saturation, z contrast, w shade lift. The Meshy
 * normal maps are mostly fine sculpt noise, so they stay subtle; the WebP
 * albedo needs no saturation/contrast push (that crushed the painted darks).
 */
const PAINT_PARAMS = new Vector4(0.25, 1.0, 1.0, 0.28);
const PROP_PARAMS = new Vector4(0, 1, 1, 0.12);

/**
 * One material per character view (the effect uniforms are per character);
 * the compiled shader program and the painted textures are shared, so a
 * second view of the same model costs no extra compile or texture memory.
 */
/** Scene-alpha look mask values (see shaders/post.ts). */
export const LOOK_MASK_CHARACTER = 0;
export const LOOK_MASK_EXEMPT = 0.5;

export interface GlbMaterialOptions {
  /** Scene-alpha look mask: 0 stylised character (default), 0.5 exempt. */
  lookMask?: number;
}

export function createGlbMaterial(
  scene: Scene,
  name: string,
  textures: PaintedTextures | null,
  options: GlbMaterialOptions = {},
): ShaderMaterial {
  const webgpu = scene.getEngine().isWebGPU;
  const textured = textures !== null;
  const material = new ShaderMaterial(
    name,
    scene,
    {
      vertexSource: webgpu ? glbCharacterVertexWGSL : glbCharacterVertexGLSL,
      fragmentSource: webgpu ? glbCharacterFragmentWGSL : glbCharacterFragmentGLSL,
    },
    {
      attributes: textured ? ['position', 'normal', 'uv'] : ['position', 'normal', 'color'],
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
        'uLookMask',
        ...LOOK_UNIFORMS,
      ],
      samplers: textured ? ['albedoSampler', 'normalSampler', ...LOOK_SAMPLERS] : [...LOOK_SAMPLERS],
      defines: textured ? ['#define FF_TEXTURED'] : [],
      shaderLanguage: webgpu ? ShaderLanguage.WGSL : ShaderLanguage.GLSL,
    },
  );
  material.setVector3('lightDirection', SUN_DIRECTION);
  material.setVector3('cameraPosition', Vector3.Zero());
  material.setFloat('rimStrength', 0.5);
  material.setFloat('uBattleDamage', 0);
  material.setFloat('uCharredState', 0);
  material.setFloat('uFrozenState', 0);
  material.setFloat('uTime', 0);
  material.setVector4('uPaintParams', textured ? PAINT_PARAMS : PROP_PARAMS);
  material.setFloat('uLookMask', options.lookMask ?? LOOK_MASK_CHARACTER);
  if (textures) {
    material.setTexture('albedoSampler', textures.albedo);
    // Without a normal map the shader samples the albedo and a zero strength.
    material.setTexture('normalSampler', textures.normal ?? textures.albedo);
    if (!textures.normal) material.setVector4('uPaintParams', new Vector4(0, PAINT_PARAMS.y, PAINT_PARAMS.z, PAINT_PARAMS.w));
  }
  material.backFaceCulling = true;
  markCharacterLookMaterial(material);
  registerLookMaterial(scene, material, 'character', SUN_DIRECTION);
  return material;
}

export function updateGlbMaterial(
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
