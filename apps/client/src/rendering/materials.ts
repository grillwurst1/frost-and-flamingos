import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { ShaderStore } from '@babylonjs/core/Engines/shaderStore';
import { Color3, Color4, Vector2, Vector3, Vector4 } from '@babylonjs/core/Maths/math';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { BaseTexture } from '@babylonjs/core/Materials/Textures/baseTexture';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import {
  characterFragmentGLSL,
  characterFragmentWGSL,
  characterVertexGLSL,
  characterVertexWGSL,
} from '../shaders/character';
import { cloudFragmentGLSL, cloudFragmentWGSL, cloudVertexGLSL, cloudVertexWGSL } from '../shaders/cloud';
import { DETAIL_SAMPLERS, DETAIL_UNIFORMS } from '../shaders/detail';
import { LOOK_SAMPLERS, LOOK_UNIFORMS } from '../shaders/look-common';
import { comicFragmentGLSL, comicFragmentWGSL, paintFragmentGLSL, paintFragmentWGSL } from '../shaders/post';
import { skyFragmentGLSL, skyFragmentWGSL, skyVertexGLSL, skyVertexWGSL } from '../shaders/sky';
import {
  toonFragmentGLSL,
  toonFragmentWGSL,
  toonVertexGLSL,
  toonVertexWGSL,
} from '../shaders/toon';
import {
  FACADE_ATTRIBUTES,
  FACADE_SAMPLERS,
  FACADE_UNIFORMS,
  facadeFragmentGLSL,
  facadeFragmentWGSL,
  facadeVertexGLSL,
  facadeVertexWGSL,
} from '../shaders/facade';
import {
  SPRITE_ATTRIBUTES,
  SPRITE_SAMPLERS,
  SPRITE_UNIFORMS,
  spriteFragmentGLSL,
  spriteFragmentWGSL,
  spriteVertexGLSL,
  spriteVertexWGSL,
} from '../shaders/sprite';
import {
  waterFragmentGLSL,
  waterFragmentWGSL,
  waterVertexGLSL,
  waterVertexWGSL,
} from '../shaders/water';
import { registerLookMaterial } from './look-state';

/**
 * Direction towards the sun: south-west, ~40° above the horizon. High enough
 * that character and prop shadows stay compact contact shapes (paintings)
 * instead of long streaks across snow and roads.
 */
export const SUN_DIRECTION = new Vector3(-0.6, 0.71, -0.6).normalize();
/** Light aerial haze (was the heavy fog). Starts far so only distant mountains turn blue. */
export const FOG_COLOR = new Color4(0.66, 0.83, 0.96, 1);
export const FOG_NEAR = 260;
export const FOG_FAR = 1500;

// ---------------------------------------------------------------------------
// Surface ids — illustrated detail contract for the shared toon material.
//
// Vertex colour RGB stays the albedo. Vertex colour ALPHA selects the painted
// detail pattern (triplanar, object space, no UVs needed):
//   alpha >= 0.75  -> SURFACE_AUTO: classified in-shader from albedo + slope
//                     (pale = snow, warm yellow = sand, green = grass/foliage,
//                     brown = log wood, grey = rock). Terrain and untagged
//                     props use this, so every existing colour keeps working.
//   alpha <  0.75  -> explicit id, encoded as (id + 0.5) / 32.
// Use `surfaceColor('#8b5a2b', SURFACE_LOG)` when painting parts, or
// `tagSurface(mesh, SURFACE_SHINGLE)` on a part before merging it.
// Glossy ids (METAL, PLASTIC, ICE, GLASS) also get the toy-plastic glint.
// ---------------------------------------------------------------------------
export const SURFACE_AUTO = -1;
export const SURFACE_PLAIN = 0;
export const SURFACE_WOOD = 1;
export const SURFACE_LOG = 2;
export const SURFACE_SHINGLE = 3;
export const SURFACE_STONE = 4;
export const SURFACE_SNOW = 5;
export const SURFACE_SAND = 6;
export const SURFACE_GRASS = 7;
export const SURFACE_ROCK = 8;
export const SURFACE_PLASTER = 9;
export const SURFACE_METAL = 10;
export const SURFACE_PLASTIC = 11;
export const SURFACE_FABRIC = 12;
export const SURFACE_FOLIAGE = 13;
export const SURFACE_ICE = 14;
export const SURFACE_GLASS = 15;

export type SurfaceId =
  | typeof SURFACE_AUTO
  | typeof SURFACE_PLAIN
  | typeof SURFACE_WOOD
  | typeof SURFACE_LOG
  | typeof SURFACE_SHINGLE
  | typeof SURFACE_STONE
  | typeof SURFACE_SNOW
  | typeof SURFACE_SAND
  | typeof SURFACE_GRASS
  | typeof SURFACE_ROCK
  | typeof SURFACE_PLASTER
  | typeof SURFACE_METAL
  | typeof SURFACE_PLASTIC
  | typeof SURFACE_FABRIC
  | typeof SURFACE_FOLIAGE
  | typeof SURFACE_ICE
  | typeof SURFACE_GLASS;

/** Vertex-colour alpha that encodes a surface id for the toon material. */
export function surfaceAlpha(id: SurfaceId): number {
  return id < 0 ? 1 : (id + 0.5) / 32;
}

export function hexToColor4(hex: string, alpha = 1): Color4 {
  const clean = hex.replace('#', '');
  const value = clean.length === 3
    ? clean.split('').map((char) => char + char).join('')
    : clean.padEnd(6, '0').slice(0, 6);
  const number = Number.parseInt(value, 16);
  return new Color4(
    ((number >> 16) & 0xff) / 255,
    ((number >> 8) & 0xff) / 255,
    (number & 0xff) / 255,
    alpha,
  );
}

export function hexToColor3(hex: string): Color3 {
  const color = hexToColor4(hex);
  return new Color3(color.r, color.g, color.b);
}

/** Albedo colour tagged with a surface id, ready for `paintMesh`/vertex colours. */
export function surfaceColor(hex: string, id: SurfaceId): Color4 {
  return hexToColor4(hex, surfaceAlpha(id));
}

/**
 * Re-tags every vertex of a (not yet merged) toon mesh with a surface id,
 * keeping its albedo. Meshes without vertex colours are left untouched.
 */
export function tagSurface(mesh: Mesh, id: SurfaceId): Mesh {
  const colors = mesh.getVerticesData(VertexBuffer.ColorKind);
  if (!colors) return mesh;
  const alpha = surfaceAlpha(id);
  const next = new Float32Array(colors.length);
  for (let index = 0; index < colors.length; index += 4) {
    next[index] = colors[index] ?? 0;
    next[index + 1] = colors[index + 1] ?? 0;
    next[index + 2] = colors[index + 2] ?? 0;
    next[index + 3] = alpha;
  }
  mesh.setVerticesData(VertexBuffer.ColorKind, next, false, 4);
  return mesh;
}

/** Opt-out flags read by the scene look (ink outline pass / shadow casting). */
const noInk = new WeakSet<object>();
const noShadow = new WeakSet<object>();

/** Excludes a mesh from the screen-space ink outline (e.g. glass, effects, decals). */
export function excludeFromInk(mesh: object): void {
  noInk.add(mesh);
}

/** Stops a mesh from casting a directional shadow. */
export function excludeFromShadows(mesh: object): void {
  noShadow.add(mesh);
}

export function isInkExcluded(mesh: object): boolean {
  return noInk.has(mesh);
}

export function isShadowExcluded(mesh: object): boolean {
  return noShadow.has(mesh);
}

/**
 * Registers the painterly post-process shaders (`ffPaint`, `ffComic`) in both
 * shader stores. Idempotent; scene-look calls it before creating the passes.
 */
export function registerLookPostShaders(): void {
  ShaderStore.ShadersStore.ffPaintPixelShader = paintFragmentGLSL;
  ShaderStore.ShadersStoreWGSL.ffPaintPixelShader = paintFragmentWGSL;
  ShaderStore.ShadersStore.ffComicPixelShader = comicFragmentGLSL;
  ShaderStore.ShadersStoreWGSL.ffComicPixelShader = comicFragmentWGSL;
}

const toonMaterials = new WeakSet<ShaderMaterial>();
const characterMaterials = new WeakSet<ShaderMaterial>();
const waterMaterials = new WeakSet<ShaderMaterial>();
const facadeMaterials = new WeakSet<ShaderMaterial>();

/** True for the shared toon, character and painted facade materials (solid, lit, inked). */
export function isLookSolidMaterial(material: unknown): boolean {
  return (
    material instanceof ShaderMaterial &&
    (toonMaterials.has(material) || characterMaterials.has(material) || facadeMaterials.has(material))
  );
}

/**
 * Marks an extra character shader (e.g. the painted GLB characters) as a
 * solid, lit, inked look material so it casts directional shadows.
 */
export function markCharacterLookMaterial(material: ShaderMaterial): void {
  characterMaterials.add(material);
}

export function isWaterMaterial(material: unknown): boolean {
  return material instanceof ShaderMaterial && waterMaterials.has(material);
}

/** Vertex attributes of the painted terrain layers (see shaders/detail.ts, FF_TERRAIN). */
export const TERRAIN_MIX_A_ATTRIBUTE = 'terrainMixA';
export const TERRAIN_MIX_B_ATTRIBUTE = 'terrainMixB';

export interface ToonMaterialOptions {
  /** Terrain variant: painted layer weights from `terrainMixA/B` instead of albedo classification. */
  terrain?: boolean;
}

export function createToonMaterial(scene: Scene, name: string, options: ToonMaterialOptions = {}): ShaderMaterial {
  const webgpu = scene.getEngine().isWebGPU;
  const terrain = options.terrain === true;
  const material = new ShaderMaterial(
    name,
    scene,
    {
      vertexSource: webgpu ? toonVertexWGSL : toonVertexGLSL,
      fragmentSource: webgpu ? toonFragmentWGSL : toonFragmentGLSL,
    },
    {
      attributes: terrain ? ['position', 'normal', TERRAIN_MIX_A_ATTRIBUTE, TERRAIN_MIX_B_ATTRIBUTE] : ['position', 'normal'],
      defines: terrain ? ['#define FF_TERRAIN'] : [],
      uniforms: [
        'world',
        'viewProjection',
        'lightDirection',
        'cameraPosition',
        'rimStrength',
        ...LOOK_UNIFORMS,
        ...DETAIL_UNIFORMS,
      ],
      samplers: [...LOOK_SAMPLERS, ...DETAIL_SAMPLERS],
      shaderLanguage: webgpu ? ShaderLanguage.WGSL : ShaderLanguage.GLSL,
    },
  );
  material.setVector3('lightDirection', SUN_DIRECTION);
  material.setVector3('cameraPosition', Vector3.Zero());
  material.setFloat('rimStrength', 0.5);
  material.backFaceCulling = true;
  toonMaterials.add(material);
  registerLookMaterial(scene, material, 'toon', SUN_DIRECTION);
  return material;
}

export function updateToonMaterial(material: ShaderMaterial, cameraPosition: Vector3): void {
  material.setVector3('cameraPosition', cameraPosition);
}

/**
 * One material per character. Cloth colours travel in vertex colours while the
 * skin tone is a uniform, so a whole wardrobe can be rebuilt without creating
 * a material per cosmetic slot.
 */
export function createCharacterMaterial(
  scene: Scene,
  name: string,
  skinHex: string,
): ShaderMaterial {
  const webgpu = scene.getEngine().isWebGPU;
  const material = new ShaderMaterial(
    name,
    scene,
    {
      vertexSource: webgpu ? characterVertexWGSL : characterVertexGLSL,
      fragmentSource: webgpu ? characterFragmentWGSL : characterFragmentGLSL,
    },
    {
      attributes: ['position', 'normal', 'color'],
      uniforms: [
        'world',
        'worldViewProjection',
        'lightDirection',
        'cameraPosition',
        'fogColor',
        'fogNear',
        'fogFar',
        'rimStrength',
        'uSkinColor',
        'uBattleDamage',
        'uCharredState',
        'uFrozenState',
        'uTime',
        ...LOOK_UNIFORMS,
      ],
      samplers: [...LOOK_SAMPLERS],
      shaderLanguage: webgpu ? ShaderLanguage.WGSL : ShaderLanguage.GLSL,
    },
  );
  material.setVector3('lightDirection', SUN_DIRECTION);
  material.setColor4('fogColor', FOG_COLOR);
  material.setFloat('fogNear', FOG_NEAR);
  material.setFloat('fogFar', FOG_FAR);
  material.setFloat('rimStrength', 0.55);
  material.setColor3('uSkinColor', hexToColor3(skinHex));
  material.setFloat('uBattleDamage', 0);
  material.setFloat('uCharredState', 0);
  material.setFloat('uFrozenState', 0);
  material.setFloat('uTime', 0);
  material.backFaceCulling = true;
  characterMaterials.add(material);
  registerLookMaterial(scene, material, 'character', SUN_DIRECTION);
  return material;
}

export interface CharacterMaterialState {
  battleDamage: number;
  charred: number;
  frozen: number;
}

export function updateCharacterMaterial(
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

export function createWaterMaterial(scene: Scene, name: string): ShaderMaterial {
  const webgpu = scene.getEngine().isWebGPU;
  const material = new ShaderMaterial(
    name,
    scene,
    {
      vertexSource: webgpu ? waterVertexWGSL : waterVertexGLSL,
      fragmentSource: webgpu ? waterFragmentWGSL : waterFragmentGLSL,
    },
    {
      attributes: ['position', 'color'],
      uniforms: [
        'world',
        'worldViewProjection',
        'time',
        'cameraPosition',
        'sunDirection',
        'deepColor',
        'shallowColor',
        'foamColor',
        'skyColor',
        'midColor',
        'uWaterParams',
        'uFFScreen',
        'uCamForward',
        'uFFHazeColor',
        'uFFHazeParams',
        'uFFSunColor',
      ],
      samplers: ['sceneDepth', 'foamTex'],
      needAlphaBlending: true,
      shaderLanguage: webgpu ? ShaderLanguage.WGSL : ShaderLanguage.GLSL,
    },
  );
  material.setFloat('time', 0);
  material.setVector3('cameraPosition', Vector3.Zero());
  material.backFaceCulling = false;
  material.alpha = 1;
  waterMaterials.add(material);
  registerLookMaterial(scene, material, 'water', SUN_DIRECTION);
  return material;
}

export function updateWaterMaterial(material: ShaderMaterial, cameraPosition: Vector3, time: number): void {
  material.setVector3('cameraPosition', cameraPosition);
  material.setFloat('time', time);
}

export function createSkyMaterial(scene: Scene, name: string): ShaderMaterial {
  const webgpu = scene.getEngine().isWebGPU;
  const material = new ShaderMaterial(
    name,
    scene,
    {
      vertexSource: webgpu ? skyVertexWGSL : skyVertexGLSL,
      fragmentSource: webgpu ? skyFragmentWGSL : skyFragmentGLSL,
    },
    {
      attributes: ['position'],
      uniforms: [
        'worldViewProjection',
        'sunDirection',
        'zenithColor',
        'horizonColor',
        'sunColor',
        'time',
        'uGlowColor',
        'uGroundHaze',
        'uCloudLit',
        'uCloudShade',
        'uCloudParams',
        'uPanoParams',
        'uPanoFade',
        'uPanoTint',
      ],
      samplers: ['panorama'],
      shaderLanguage: webgpu ? ShaderLanguage.WGSL : ShaderLanguage.GLSL,
      useClipPlane: false,
    },
  );
  material.setFloat('time', 0);
  material.backFaceCulling = false;
  material.disableDepthWrite = true;
  registerLookMaterial(scene, material, 'sky', SUN_DIRECTION);
  return material;
}

export function updateSkyMaterial(material: ShaderMaterial, time: number): void {
  material.setFloat('time', time);
}

/** Painted cloud billboard material (one per cloud texture). */
export function createCloudMaterial(scene: Scene, name: string, texture: BaseTexture): ShaderMaterial {
  const webgpu = scene.getEngine().isWebGPU;
  const material = new ShaderMaterial(
    name,
    scene,
    {
      vertexSource: webgpu ? cloudVertexWGSL : cloudVertexGLSL,
      fragmentSource: webgpu ? cloudFragmentWGSL : cloudFragmentGLSL,
    },
    {
      attributes: ['position', 'uv'],
      uniforms: ['world', 'worldViewProjection', 'cameraPosition', 'uCloudTint', 'uCloudHaze', 'uOpacity'],
      samplers: ['cloudTexture'],
      needAlphaBlending: true,
      shaderLanguage: webgpu ? ShaderLanguage.WGSL : ShaderLanguage.GLSL,
      useClipPlane: false,
    },
  );
  material.setTexture('cloudTexture', texture);
  material.setFloat('uOpacity', 1);
  material.backFaceCulling = false;
  material.disableDepthWrite = true;
  registerLookMaterial(scene, material, 'cloud', SUN_DIRECTION);
  return material;
}

/**
 * Painted sprite material over the shared atlas (rendering/sprite-atlas.ts).
 * `billboard`: alpha-tested, camera-facing trees/clutter (writes depth, stays
 * out of the g-buffer, ink-free marker alpha). `ground`: alpha-blended flat
 * decals and shadow blobs lying on the terrain.
 */
export function createSpriteMaterial(
  scene: Scene,
  name: string,
  atlas: BaseTexture,
  atlasSize: { width: number; height: number },
  mode: 'billboard' | 'ground',
): ShaderMaterial {
  const webgpu = scene.getEngine().isWebGPU;
  const ground = mode === 'ground';
  const material = new ShaderMaterial(
    name,
    scene,
    {
      vertexSource: webgpu ? spriteVertexWGSL : spriteVertexGLSL,
      fragmentSource: webgpu ? spriteFragmentWGSL : spriteFragmentGLSL,
    },
    {
      attributes: [...SPRITE_ATTRIBUTES],
      uniforms: [...SPRITE_UNIFORMS, ...LOOK_UNIFORMS],
      samplers: [...SPRITE_SAMPLERS, ...LOOK_SAMPLERS],
      defines: ground ? ['#define GROUND'] : [],
      needAlphaTesting: !ground,
      needAlphaBlending: ground,
      shaderLanguage: webgpu ? ShaderLanguage.WGSL : ShaderLanguage.GLSL,
      useClipPlane: false,
    },
  );
  material.setTexture('spriteAtlas', atlas);
  material.setVector2('uAtlasSize', new Vector2(atlasSize.width, atlasSize.height));
  // x alpha threshold, y sway scale, z (reserved), w lit share inside cast shadow.
  material.setVector4('uSpriteParams', new Vector4(0.5, 1, 0, 0.3));
  material.setFloat('uTime', 0);
  material.backFaceCulling = false;
  if (ground) {
    material.disableDepthWrite = true;
    material.zOffset = -2;
  }
  registerLookMaterial(scene, material, 'sprite', SUN_DIRECTION);
  return material;
}

/**
 * ShaderMaterial that exposes its painted atlas as the alpha-test texture, so
 * Babylon's g-buffer (ink outlines) and shadow-map passes cut the same
 * silhouettes (gable outlines, pavilion gaps) as the main pass.
 */
class AlphaTestedShaderMaterial extends ShaderMaterial {
  alphaTestTexture: BaseTexture | null = null;

  override getAlphaTestTexture(): BaseTexture | null {
    return this.alphaTestTexture ?? null;
  }
}

/** Painted facade material over the facade atlas (rendering/facade-atlas.ts). */
export function createFacadeMaterial(scene: Scene, name: string, atlas: BaseTexture): ShaderMaterial {
  const webgpu = scene.getEngine().isWebGPU;
  const material = new AlphaTestedShaderMaterial(
    name,
    scene,
    {
      vertexSource: webgpu ? facadeVertexWGSL : facadeVertexGLSL,
      fragmentSource: webgpu ? facadeFragmentWGSL : facadeFragmentGLSL,
    },
    {
      attributes: [...FACADE_ATTRIBUTES],
      uniforms: [...FACADE_UNIFORMS, ...LOOK_UNIFORMS],
      samplers: [...FACADE_SAMPLERS, ...LOOK_SAMPLERS],
      needAlphaTesting: true,
      shaderLanguage: webgpu ? ShaderLanguage.WGSL : ShaderLanguage.GLSL,
      useClipPlane: false,
    },
  );
  material.alphaTestTexture = atlas;
  material.setTexture('facadeAtlas', atlas);
  // x alpha cutoff, y shade depth, z light level of faces turned from the sun, w lit share in cast shadow.
  material.setVector4('uFacadeParams', new Vector4(0.5, 0.86, 0.42, 0.38));
  material.backFaceCulling = true;
  facadeMaterials.add(material);
  registerLookMaterial(scene, material, 'painted', SUN_DIRECTION);
  return material;
}

/**
 * Soft contact shadow under each character. The directional shadow map does
 * the real casting; this disc only grounds the feet, so it is faint and
 * tinted towards the blue shade colour instead of black.
 */
export function createShadowMaterial(scene: Scene, name: string): StandardMaterial {
  const material = new StandardMaterial(name, scene);
  material.disableLighting = true;
  material.diffuseColor = Color3.Black();
  material.emissiveColor = new Color3(0.06, 0.1, 0.2);
  material.alpha = 0.16;
  material.backFaceCulling = false;
  material.disableDepthWrite = true;
  return material;
}
