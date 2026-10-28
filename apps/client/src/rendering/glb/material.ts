import '@babylonjs/core/Shaders/ShadersInclude/bonesDeclaration';
import '@babylonjs/core/Shaders/ShadersInclude/bonesVertex';
import '@babylonjs/core/ShadersWGSL/ShadersInclude/bonesDeclaration';
import '@babylonjs/core/ShadersWGSL/ShadersInclude/bonesVertex';
import { Color3, Vector3, Vector4 } from '@babylonjs/core/Maths/math';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import type { BaseTexture } from '@babylonjs/core/Materials/Textures/baseTexture';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
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
  wardrobeMask?: BaseTexture;
  head?: { albedo: BaseTexture; mask: BaseTexture };
}

/**
 * x normal-map strength, y saturation, z contrast, w shade lift. The Meshy
 * normal maps are mostly fine sculpt noise, so they stay subtle; the WebP
 * albedo needs no saturation/contrast push (that crushed the painted darks).
 */
const flatNormals = new WeakMap<Scene, RawTexture>();

/** Shared 1×1 tangent-space +Z normal for painted models without a normal map. */
function flatNormalTexture(scene: Scene): RawTexture {
  let texture = flatNormals.get(scene);
  if (!texture) {
    texture = RawTexture.CreateRGBATexture(new Uint8Array([128, 128, 255, 255]), 1, 1, scene, false, false, Texture.NEAREST_SAMPLINGMODE);
    texture.name = 'glb-flat-normal';
    flatNormals.set(scene, texture);
    const created = texture;
    scene.onDisposeObservable.addOnce(() => created.dispose());
  }
  return texture;
}

const PAINT_PARAMS = new Vector4(0.4, 1.0, 1.0, 0.04);
const PROP_PARAMS = new Vector4(0, 1, 1, 0.12);

/**
 * One material per character view (the effect uniforms are per character);
 * the compiled shader program and the painted textures are shared, so a
 * second view of the same model costs no extra compile or texture memory.
 */
/**
 * Scene-alpha look mask values (see shaders/post.ts): 0 stylised character,
 * 1 world. There is no in-band "exempt" value (blends could fake it).
 */
export const LOOK_MASK_CHARACTER = 0;
export const LOOK_MASK_WORLD = 1;

export interface GlbMaterialOptions {
  /** Continuous lighting for the detailed, fully configurable skinned body. */
  soft?: boolean;
  /** Anatomical base colour, independent of every outfit texture. */
  skin?: string;
  wardrobe?: { hair: string; skinReference: readonly number[]; hairReference: readonly number[]; greenVest: boolean; torso: readonly number[]; head?: { skinReference: readonly number[]; hairReference: readonly number[] } };
  /** Scene-alpha look mask: {@link LOOK_MASK_CHARACTER} (default) or {@link LOOK_MASK_WORLD}. */
  lookMask?: number;
  /** Physically based shading instead of the cel bands (textured only). */
  photoreal?: boolean;
}

export function createGlbMaterial(
  scene: Scene,
  name: string,
  textures: PaintedTextures | null,
  options: GlbMaterialOptions = {},
): ShaderMaterial {
  const webgpu = scene.getEngine().isWebGPU;
  const native = Boolean(textures?.wardrobeMask && options.wardrobe);
  const sharedHead = native && Boolean(textures?.head && options.wardrobe?.head);
  const textured = textures !== null && !native;
  const material = new ShaderMaterial(
    name,
    scene,
    {
      vertexSource: webgpu ? glbCharacterVertexWGSL : glbCharacterVertexGLSL,
      fragmentSource: webgpu ? glbCharacterFragmentWGSL : glbCharacterFragmentGLSL,
    },
    {
      attributes: textured ? ['position', 'normal', 'uv'] : ['position', 'normal', 'color', ...(options.soft ? ['uv'] : []), ...(native ? ['uv2'] : [])],
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
        'uDither',
        ...(options.soft ? ['uSkinColor'] : []),
        ...(native ? ['uWardrobeHair', 'uSkinReference', 'uHairReference', 'uGreenVest', 'uWardrobeTorso'] : []),
        ...(sharedHead ? ['uHeadSkinReference', 'uHeadHairReference'] : []),
        ...LOOK_UNIFORMS,
      ],
      samplers: textured ? ['albedoSampler', 'normalSampler', ...LOOK_SAMPLERS] : native ? ['albedoSampler', 'wardrobeMaskSampler', ...(sharedHead ? ['headPaintSampler', 'headMaskSampler'] : []), ...LOOK_SAMPLERS] : [...LOOK_SAMPLERS],
      defines: textured
        ? ['#define FF_TEXTURED', ...(options.photoreal ? ['#define FF_PHOTOREAL'] : [])]
        : options.soft ? ['#define FF_SOFT_CHARACTER', ...(native ? ['#define FF_NATIVE_WARDROBE'] : []), ...(sharedHead ? ['#define FF_WARDROBE_HEAD'] : [])] : [],
      shaderLanguage: webgpu ? ShaderLanguage.WGSL : ShaderLanguage.GLSL,
    },
  );
  material.setVector3('lightDirection', SUN_DIRECTION);
  material.setVector3('cameraPosition', Vector3.Zero());
  material.setFloat('rimStrength', 0.32);
  material.setFloat('uBattleDamage', 0);
  material.setFloat('uCharredState', 0);
  material.setFloat('uFrozenState', 0);
  material.setFloat('uTime', 0);
  material.setVector4('uPaintParams', textured ? PAINT_PARAMS : options.soft ? new Vector4(0, 1, 1, 0) : PROP_PARAMS);
  material.setFloat('uLookMask', options.lookMask ?? LOOK_MASK_CHARACTER);
  material.setFloat('uDither', 0);
  if (options.soft) material.setColor3('uSkinColor', Color3.FromHexString(options.skin ?? '#fac39c'));
  if (native && textures && options.wardrobe) {
    const w = options.wardrobe;
    material.setTexture('albedoSampler', textures.albedo); material.setTexture('wardrobeMaskSampler', textures.wardrobeMask!);
    material.setColor3('uWardrobeHair', Color3.FromHexString(w.hair));
    material.setVector3('uSkinReference', Vector3.FromArray(w.skinReference)); material.setVector3('uHairReference', Vector3.FromArray(w.hairReference));
    if (sharedHead && textures.head && w.head) {
      material.setTexture('headPaintSampler', textures.head.albedo); material.setTexture('headMaskSampler', textures.head.mask);
      material.setVector3('uHeadSkinReference', Vector3.FromArray(w.head.skinReference)); material.setVector3('uHeadHairReference', Vector3.FromArray(w.head.hairReference));
    }
    material.setFloat('uGreenVest', w.greenVest ? 1 : 0); material.setVector4('uWardrobeTorso', Vector4.FromArray(w.torso));
  } else if (textures) {
    material.setTexture('albedoSampler', textures.albedo);
    // Without a normal map: a flat 1×1 normal (tangent-space +Z) and zero strength.
    material.setTexture('normalSampler', textures.normal ?? flatNormalTexture(scene));
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
  dither = 0,
): void {
  material.setVector3('cameraPosition', cameraPosition);
  material.setFloat('uTime', time);
  material.setFloat('uBattleDamage', state.battleDamage);
  material.setFloat('uCharredState', state.charred);
  material.setFloat('uFrozenState', state.frozen);
  material.setFloat('uDither', dither);
}
