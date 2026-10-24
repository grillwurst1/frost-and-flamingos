import { Color3, Color4, Vector3 } from '@babylonjs/core/Maths/math';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { Scene } from '@babylonjs/core/scene';
import {
  characterFragmentGLSL,
  characterFragmentWGSL,
  characterVertexGLSL,
  characterVertexWGSL,
} from '../shaders/character';
import { skyFragmentGLSL, skyFragmentWGSL, skyVertexGLSL, skyVertexWGSL } from '../shaders/sky';
import {
  toonFragmentGLSL,
  toonFragmentWGSL,
  toonVertexGLSL,
  toonVertexWGSL,
} from '../shaders/toon';
import {
  waterFragmentGLSL,
  waterFragmentWGSL,
  waterVertexGLSL,
  waterVertexWGSL,
} from '../shaders/water';

export const SUN_DIRECTION = new Vector3(-0.48, 0.79, -0.39).normalize();
export const FOG_COLOR = new Color4(0.58, 0.78, 0.84, 1);
export const FOG_NEAR = 105;
export const FOG_FAR = 560;

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

export function createToonMaterial(scene: Scene, name: string): ShaderMaterial {
  const webgpu = scene.getEngine().isWebGPU;
  const material = new ShaderMaterial(
    name,
    scene,
    {
      vertexSource: webgpu ? toonVertexWGSL : toonVertexGLSL,
      fragmentSource: webgpu ? toonFragmentWGSL : toonFragmentGLSL,
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
      ],
      shaderLanguage: webgpu ? ShaderLanguage.WGSL : ShaderLanguage.GLSL,
    },
  );
  material.setVector3('lightDirection', SUN_DIRECTION);
  material.setColor4('fogColor', FOG_COLOR);
  material.setFloat('fogNear', FOG_NEAR);
  material.setFloat('fogFar', FOG_FAR);
  material.setFloat('rimStrength', 0.5);
  material.backFaceCulling = true;
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
      ],
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
      ],
      needAlphaBlending: true,
      shaderLanguage: webgpu ? ShaderLanguage.WGSL : ShaderLanguage.GLSL,
    },
  );
  material.setVector3('sunDirection', SUN_DIRECTION);
  material.setColor4('deepColor', hexToColor4('#075c73'));
  material.setColor4('shallowColor', hexToColor4('#54d8c8'));
  material.setColor4('foamColor', hexToColor4('#f2fff9'));
  material.setColor4('skyColor', hexToColor4('#9fd8ea'));
  material.backFaceCulling = false;
  material.alpha = 1;
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
      uniforms: ['worldViewProjection', 'sunDirection', 'zenithColor', 'horizonColor', 'sunColor', 'time'],
      shaderLanguage: webgpu ? ShaderLanguage.WGSL : ShaderLanguage.GLSL,
      useClipPlane: false,
    },
  );
  material.setVector3('sunDirection', SUN_DIRECTION);
  material.setColor3('zenithColor', hexToColor3('#1a5f8f'));
  material.setColor3('horizonColor', hexToColor3('#c8ecf4'));
  material.setColor3('sunColor', hexToColor3('#ffe8a6'));
  material.setFloat('time', 0);
  material.backFaceCulling = false;
  material.disableDepthWrite = true;
  return material;
}

export function updateSkyMaterial(material: ShaderMaterial, time: number): void {
  material.setFloat('time', time);
}

export function createShadowMaterial(scene: Scene, name: string): StandardMaterial {
  const material = new StandardMaterial(name, scene);
  material.disableLighting = true;
  material.diffuseColor = Color3.Black();
  material.emissiveColor = new Color3(0.015, 0.04, 0.055);
  material.alpha = 0.28;
  material.backFaceCulling = false;
  material.disableDepthWrite = true;
  return material;
}
