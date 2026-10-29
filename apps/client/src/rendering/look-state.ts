import { Constants } from '@babylonjs/core/Engines/constants';
import { Color3, Color4, Matrix, Vector3, Vector4 } from '@babylonjs/core/Maths/math';
import type { BaseTexture } from '@babylonjs/core/Materials/Textures/baseTexture';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture';
import type { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import type { Scene } from '@babylonjs/core/scene';

/**
 * Per-scene "look" state shared by every look-aware ShaderMaterial (toon,
 * character, water, sky, painted clouds). Materials register themselves when
 * created; the scene look (scene-look.ts) mutates the values below and calls
 * {@link applyLookToAll} once per frame. Materials created before a scene look
 * exists get neutral dummy textures so they always render.
 */
export type LookRole = 'toon' | 'character' | 'water' | 'sky' | 'cloud' | 'sprite' | 'painted';

export interface LookValues {
  sunDirection: Vector3;
  cameraPosition: Vector3;
  cameraForward: Vector3;
  time: number;
  sunColor: Color3;
  skyFill: Color3;
  groundFill: Color3;
  shadeCool: Color3;
  shadeWarm: Color3;
  /** rgb haze colour, a = maximum haze amount. */
  hazeColor: Color4;
  /** x start distance, y full distance, z base altitude, w altitude range. */
  hazeParams: Vector4;
  /** x rim scale, y glint scale, z band shift, w hatch strength. */
  toonParams: Vector4;
  lightMatrix: Matrix;
  /** x texel size (uv), y normal offset (m), z strength, w enabled. */
  shadowParams: Vector4;
  /** x depth min, y depth min+max, z packed (0/1). */
  shadowDepth: Vector4;
  /** x strength, y fade start, z fade end, w mode (0 off, 1 dominant, 2 triplanar). */
  detailParams: Vector4;
  /** x 1/tileA, y 1/tileB, z 1/tileC, w ink strength. */
  detailScale: Vector4;
  /** Painted colour tiles: x strength (0 = off), y repeats per metre. */
  colorParams: Vector4;
  inkColor: Color4;
  zenith: Color3;
  horizon: Color3;
  sunDisc: Color3;
  glow: Color3;
  groundHaze: Color3;
  cloudLit: Color3;
  cloudShade: Color3;
  /** x size scale (0 = off), y drift speed, z min elevation, w glow strength. */
  cloudParams: Vector4;
  /** x enabled, y horizon v, z radians per v unit, w strength. */
  panoParams: Vector4;
  /** x fade start v, y fade end v. */
  panoFade: Vector4;
  panoTint: Color3;
  billboardTint: Color3;
  waterShallow: Color4;
  waterMid: Color4;
  waterDeep: Color4;
  waterFoam: Color4;
  waterSky: Color4;
  /** x scene depth (0/1), y foam strength, z sparkle, w painted foam (0/1). */
  waterParams: Vector4;
  /** xy = 1 / render size. */
  screen: Vector4;
}

export interface LookTextures {
  shadowMap: BaseTexture;
  detailA: BaseTexture;
  detailB: BaseTexture;
  detailC: BaseTexture;
  detailColor: BaseTexture;
  sceneDepth: BaseTexture;
  foam: BaseTexture;
  panorama: BaseTexture;
}

export interface LookContext {
  readonly values: LookValues;
  readonly textures: LookTextures;
  readonly materials: Map<ShaderMaterial, LookRole>;
}

const contexts = new WeakMap<Scene, LookContext>();

function solidTexture(scene: Scene, name: string, rgba: [number, number, number, number]): RawTexture {
  const texture = RawTexture.CreateRGBATexture(
    new Uint8Array(rgba),
    1,
    1,
    scene,
    false,
    false,
    Constants.TEXTURE_NEAREST_SAMPLINGMODE,
  );
  texture.name = name;
  return texture;
}

export function defaultLookValues(sunDirection: Vector3): LookValues {
  return {
    sunDirection: sunDirection.clone(),
    cameraPosition: new Vector3(0, 40, -80),
    cameraForward: new Vector3(0, 0, 1),
    time: 0,
    sunColor: new Color3(1.08, 1.0, 0.88),
    skyFill: new Color3(0.98, 1.0, 1.04),
    groundFill: new Color3(1.04, 0.98, 0.93),
    shadeCool: new Color3(0.74, 0.83, 1.0),
    shadeWarm: new Color3(0.97, 0.91, 0.93),
    hazeColor: new Color4(0.7, 0.85, 0.97, 0.62),
    hazeParams: new Vector4(90, 680, 0, 120),
    toonParams: new Vector4(0.65, 0.35, 0, 0.22),
    lightMatrix: Matrix.Identity(),
    shadowParams: new Vector4(1 / 2048, 0.06, 1, 0),
    shadowDepth: new Vector4(1, 2, 0, 0),
    detailParams: new Vector4(0, 45, 170, 0),
    detailScale: new Vector4(1 / 4, 1 / 8, 1 / 4, 0.55),
    colorParams: new Vector4(0, 0.5, 0, 0),
    inkColor: new Color4(0x1b / 255, 0x14 / 255, 0x10 / 255, 1),
    zenith: new Color3(0x3e / 255, 0x8f / 255, 0xe0 / 255),
    horizon: new Color3(0x9f / 255, 0xd3 / 255, 0xf5 / 255),
    sunDisc: new Color3(1.0, 0.99, 0.9),
    glow: new Color3(1.0, 0.93, 0.7),
    groundHaze: new Color3(0.72, 0.86, 0.95),
    cloudLit: new Color3(1, 1, 1),
    cloudShade: new Color3(0xc9 / 255, 0xdd / 255, 0xf0 / 255),
    cloudParams: new Vector4(1, 0.0025, 0.035, 1),
    panoParams: new Vector4(0, 0.68, Math.PI / 2, 1),
    panoFade: new Vector4(0.3, 0.47, 0, 0),
    panoTint: new Color3(1, 1, 1),
    billboardTint: new Color3(1, 1, 1),
    waterShallow: new Color4(0x3f / 255, 0xe0 / 255, 0xd0 / 255, 1),
    waterMid: new Color4(0x1f / 255, 0xb5 / 255, 0xc9 / 255, 1),
    waterDeep: new Color4(0x0e / 255, 0x6f / 255, 0xa8 / 255, 1),
    waterFoam: new Color4(1, 1, 1, 1),
    waterSky: new Color4(0x9f / 255, 0xd3 / 255, 0xf5 / 255, 1),
    waterParams: new Vector4(0, 1, 1, 0),
    screen: new Vector4(1 / 1024, 1 / 576, 0, 0),
  };
}

export function getLookContext(scene: Scene, sunDirection: Vector3): LookContext {
  const existing = contexts.get(scene);
  if (existing) return existing;
  const white = solidTexture(scene, 'ff-look-white', [255, 255, 255, 255]);
  const grey = solidTexture(scene, 'ff-look-grey', [128, 128, 128, 128]);
  const black = solidTexture(scene, 'ff-look-black', [0, 0, 0, 0]);
  const context: LookContext = {
    values: defaultLookValues(sunDirection),
    textures: {
      shadowMap: white,
      detailA: grey,
      detailB: grey,
      detailC: grey,
      detailColor: grey,
      sceneDepth: black,
      foam: grey,
      panorama: grey,
    },
    materials: new Map(),
  };
  contexts.set(scene, context);
  scene.onDisposeObservable.addOnce(() => contexts.delete(scene));
  return context;
}

export function peekLookContext(scene: Scene): LookContext | undefined {
  return contexts.get(scene);
}

function applyLighting(material: ShaderMaterial, values: LookValues, textures: LookTextures): void {
  material.setVector3('lightDirection', values.sunDirection);
  material.setColor3('uFFSunColor', values.sunColor);
  material.setColor3('uFFSkyFill', values.skyFill);
  material.setColor3('uFFGroundFill', values.groundFill);
  material.setColor3('uFFShadeCool', values.shadeCool);
  material.setColor3('uFFShadeWarm', values.shadeWarm);
  material.setColor4('uFFHazeColor', values.hazeColor);
  material.setVector4('uFFHazeParams', values.hazeParams);
  material.setVector4('uFFToonParams', values.toonParams);
  material.setMatrix('uFFLightMatrix', values.lightMatrix);
  material.setVector4('uFFShadowParams', values.shadowParams);
  material.setVector4('uFFShadowDepth', values.shadowDepth);
  material.setTexture('shadowMap', textures.shadowMap);
}

export function applyLook(material: ShaderMaterial, role: LookRole, context: LookContext): void {
  const { values, textures } = context;
  switch (role) {
    case 'toon':
      applyLighting(material, values, textures);
      material.setVector3('cameraPosition', values.cameraPosition);
      material.setVector4('uFFDetailParams', values.detailParams);
      material.setVector4('uFFDetailScale', values.detailScale);
      material.setColor4('uFFInkColor', values.inkColor);
      material.setTexture('detailA', textures.detailA);
      material.setTexture('detailB', textures.detailB);
      material.setTexture('detailC', textures.detailC);
      material.setVector4('uFFColorParams', values.colorParams);
      material.setTexture('detailColor', textures.detailColor);
      return;
    case 'character':
      // cameraPosition is pushed per character by updateCharacterMaterial.
      applyLighting(material, values, textures);
      return;
    case 'sprite':
      applyLighting(material, values, textures);
      material.setVector3('cameraPosition', values.cameraPosition);
      material.setFloat('uTime', values.time);
      return;
    case 'painted':
      applyLighting(material, values, textures);
      material.setVector3('cameraPosition', values.cameraPosition);
      return;
    case 'water':
      material.setVector3('sunDirection', values.sunDirection);
      material.setColor4('shallowColor', values.waterShallow);
      material.setColor4('midColor', values.waterMid);
      material.setColor4('deepColor', values.waterDeep);
      material.setColor4('foamColor', values.waterFoam);
      material.setColor4('skyColor', values.waterSky);
      material.setVector4('uWaterParams', values.waterParams);
      material.setVector4('uFFScreen', values.screen);
      material.setVector3('uCamForward', values.cameraForward);
      material.setColor4('uFFHazeColor', values.hazeColor);
      material.setVector4('uFFHazeParams', values.hazeParams);
      material.setColor3('uFFSunColor', values.sunColor);
      material.setTexture('sceneDepth', textures.sceneDepth);
      material.setTexture('foamTex', textures.foam);
      return;
    case 'sky':
      material.setVector3('sunDirection', values.sunDirection);
      material.setColor3('zenithColor', values.zenith);
      material.setColor3('horizonColor', values.horizon);
      material.setColor3('sunColor', values.sunDisc);
      material.setColor3('uGlowColor', values.glow);
      material.setColor3('uGroundHaze', values.groundHaze);
      material.setColor3('uCloudLit', values.cloudLit);
      material.setColor3('uCloudShade', values.cloudShade);
      material.setVector4('uCloudParams', values.cloudParams);
      material.setVector4('uPanoParams', values.panoParams);
      material.setVector4('uPanoFade', values.panoFade);
      material.setColor3('uPanoTint', values.panoTint);
      material.setTexture('panorama', textures.panorama);
      return;
    case 'cloud':
      material.setVector3('cameraPosition', values.cameraPosition);
      material.setColor3('uCloudTint', values.billboardTint);
      material.setColor3('uCloudHaze', values.groundHaze);
      return;
  }
}

export function registerLookMaterial(
  scene: Scene,
  material: ShaderMaterial,
  role: LookRole,
  sunDirection: Vector3,
): void {
  const context = getLookContext(scene, sunDirection);
  context.materials.set(material, role);
  applyLook(material, role, context);
  material.onDisposeObservable.addOnce(() => {
    context.materials.delete(material);
  });
}

export function applyLookToAll(context: LookContext): void {
  // forEach instead of for..of: no per-frame iterator allocation.
  context.materials.forEach((role, material) => applyLook(material, role, context));
}
