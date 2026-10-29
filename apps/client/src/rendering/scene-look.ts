import '@babylonjs/core/Engines/Extensions/engine.multiRender';
import '@babylonjs/core/Engines/WebGPU/Extensions/engine.multiRender';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent';
import '@babylonjs/core/Rendering/geometryBufferRendererSceneComponent';
import type { Camera } from '@babylonjs/core/Cameras/camera';
import { renderRatio } from './quality-governor';
import { RENDER_PROFILES as QUALITY, sceneSampleCount, type VisualQuality } from './render-profile';
export type { VisualQuality } from './render-profile';
import { Constants } from '@babylonjs/core/Engines/constants';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import type { Effect } from '@babylonjs/core/Materials/effect';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage';
import type { BaseTexture } from '@babylonjs/core/Materials/Textures/baseTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Color3, Color4, Vector3, Vector4 } from '@babylonjs/core/Maths/math';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { FxaaPostProcess } from '@babylonjs/core/PostProcesses/fxaaPostProcess';
import { PostProcess } from '@babylonjs/core/PostProcesses/postProcess';
import { GeometryBufferRenderer } from '@babylonjs/core/Rendering/geometryBufferRenderer';
import type { Scene } from '@babylonjs/core/scene';
import type { Nullable } from '@babylonjs/core/types';
import { WATER_LEVEL } from '@frost-and-flamingos/shared';
import { COMIC_SAMPLERS, COMIC_UNIFORMS } from '../shaders/post';
import { PANORAMA_HORIZON_V, PANORAMA_RADIANS_PER_V, artUrl, loadArtImage, probeArt } from './art-assets';
import { createDetailTextures, type DetailTextureSet } from './detail-textures';
import { applyLookToAll, getLookContext, type LookContext, type LookValues } from './look-state';
import type { MapVisuals } from './map';
import {
  SUN_DIRECTION,
  createCloudMaterial,
  excludeFromInk,
  excludeFromShadows,
  hexToColor3,
  isInkExcluded,
  isLookSolidMaterial,
  isShadowExcluded,
  isWaterMaterial,
  registerLookPostShaders,
} from './materials';

/**
 * Global comic/painterly look for the whole scene:
 *
 *   lights      warm DirectionalLight sun (shadow caster) + sky/ground
 *               HemisphericLight fill (for any StandardMaterial others add).
 *   shadows     one ShadowGenerator map (R32F/R16F) fitted around the camera
 *               every frame, texel-snapped; toon + character shaders sample it
 *               with their own PCF and land shadows in the tinted shade band.
 *   g-buffer    Half-resolution GeometryBufferRenderer (view depth + normals) of every
 *               solid mesh. Feeds the ink outlines and the water depth foam.
 *   post        one subtle contour/grade pass -> FXAA. No full-screen paint,
 *               grain or sharpen. Two scene samples on medium/high cover thin silhouettes.
 *   sky/water   uniforms + optional painted panorama/cloud billboards.
 *
 * Quality tiers: high / medium / low via {@link SceneLook.setVisualQuality}.
 * GameClient picks the tier (player setting, GPU class, frame-time governor;
 * see rendering/gpu-tier.ts and state/graphics.ts). Medium and low also cap
 * the effective device pixel ratio.
 * Weather: {@link SceneLook.setWeatherLook} (-1 icy, 0 azure, +1 golden).
 */
const SHADOW_DEPTH_RANGE = 420;
const CLOUD_RING_DISTANCE = 1550;
const CLOUD_WIDTH_SCALE = CLOUD_RING_DISTANCE / 1350;
const CLOUD_FILES = ['01', '02', '03', '04', '05', '06', '07', '08'].map((id) => `clouds/cloud-${id}.png`);

interface WeatherPreset {
  zenith: Color3;
  horizon: Color3;
  sunDisc: Color3;
  glow: Color3;
  sunColor: Color3;
  skyFill: Color3;
  groundFill: Color3;
  shadeCool: Color3;
  shadeWarm: Color3;
  haze: Color4;
  hazeStart: number;
  groundHaze: Color3;
  cloudShade: Color3;
  cloudScale: number;
  waterShallow: Color3;
  waterMid: Color3;
  waterDeep: Color3;
  /** exposure, contrast, saturation, vibrance */
  grade: Vector4;
  shadowTone: Color3;
  highlightTone: Color3;
  tint: Color3;
}

const hex = hexToColor3;

const WEATHER_NEUTRAL: WeatherPreset = {
  zenith: hex('#63BCE5'),
  horizon: hex('#C4E5ED'),
  sunDisc: new Color3(1, 0.99, 0.9),
  glow: new Color3(1, 0.93, 0.7),
  // Warm key light against cool blue-violet shade (paintings).
  sunColor: new Color3(1.04, 1.01, 0.94),
  skyFill: new Color3(0.90, 0.97, 1.04),
  groundFill: new Color3(0.86, 0.89, 0.85),
  shadeCool: new Color3(0.74, 0.83, 1.0),
  shadeWarm: new Color3(0.86, 0.90, 0.96),
  haze: new Color4(0.71, 0.84, 0.91, 0.55),
  hazeStart: 90,
  groundHaze: new Color3(0.72, 0.86, 0.95),
  cloudShade: hex('#C9DDF0'),
  cloudScale: 0.85,
  waterShallow: hex('#75CFC9'),
  waterMid: hex('#36A8BC'),
  waterDeep: hex('#216D97'),
  grade: new Vector4(1.0, 1.06, 0.96, 0.06),
  shadowTone: new Color3(-0.015, 0.0, 0.04),
  highlightTone: new Color3(0.012, 0.004, -0.006),
  tint: new Color3(1, 1, 1),
};

const WEATHER_ICY: WeatherPreset = {
  zenith: hex('#6E92BC'),
  horizon: hex('#A8C8E8'),
  sunDisc: new Color3(0.95, 0.97, 1.0),
  glow: new Color3(0.8, 0.88, 1.0),
  sunColor: new Color3(0.93, 0.97, 1.05),
  skyFill: new Color3(0.95, 1.0, 1.08),
  groundFill: new Color3(0.98, 0.98, 1.0),
  shadeCool: new Color3(0.78, 0.87, 1.0),
  shadeWarm: new Color3(0.88, 0.9, 0.98),
  haze: new Color4(0.74, 0.83, 0.92, 0.64),
  hazeStart: 65,
  groundHaze: new Color3(0.78, 0.85, 0.92),
  cloudShade: new Color3(0.7, 0.77, 0.86),
  cloudScale: 1.1,
  waterShallow: hex('#5FCFD6'),
  waterMid: hex('#2E9DB8'),
  waterDeep: hex('#1B5E8C'),
  grade: new Vector4(0.98, 1.12, 0.8, 0.1),
  shadowTone: new Color3(-0.02, 0.01, 0.07),
  highlightTone: new Color3(-0.01, 0.005, 0.03),
  tint: new Color3(0.8, 0.9, 1.02),
};

const WEATHER_GOLDEN: WeatherPreset = {
  zenith: hex('#3F86D4'),
  horizon: hex('#FFE098'),
  sunDisc: new Color3(1, 0.96, 0.72),
  glow: new Color3(1, 0.8, 0.38),
  sunColor: new Color3(1.12, 1.0, 0.8),
  skyFill: new Color3(1.0, 0.98, 0.98),
  groundFill: new Color3(1.08, 0.97, 0.86),
  shadeCool: new Color3(0.86, 0.88, 0.98),
  shadeWarm: new Color3(1.0, 0.87, 0.84),
  haze: new Color4(0.98, 0.9, 0.72, 0.46),
  hazeStart: 140,
  groundHaze: new Color3(0.98, 0.9, 0.74),
  cloudShade: new Color3(0.98, 0.85, 0.7),
  cloudScale: 0.75,
  waterShallow: hex('#4AE8CC'),
  waterMid: hex('#1EB8BE'),
  waterDeep: hex('#0E6F9E'),
  grade: new Vector4(1.02, 1.1, 1.02, 0.1),
  shadowTone: new Color3(0.0, -0.01, 0.03),
  highlightTone: new Color3(0.07, 0.035, -0.04),
  tint: new Color3(1.06, 1.0, 0.9),
};

function clonePreset(preset: WeatherPreset): WeatherPreset {
  const copy = { ...preset };
  for (const key of Object.keys(copy) as Array<keyof WeatherPreset>) {
    const value = copy[key];
    if (value instanceof Color3 || value instanceof Color4 || value instanceof Vector4) {
      (copy as Record<keyof WeatherPreset, unknown>)[key] = value.clone();
    }
  }
  return copy;
}

function lerpColor3(a: Color3, b: Color3, t: number, out: Color3): void {
  out.set(a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t);
}

interface DevHandle {
  setWeatherLook(balance: number): void;
  setVisualQuality(tier: VisualQuality): void;
  quality(): VisualQuality;
  setCameraOverride(x: number, y: number, z: number, tx: number, ty: number, tz: number): void;
  clearCameraOverride(): void;
  /** Space-separated "x y z tx ty tz" (snap-tool friendly: no commas). */
  cam(spec: string): void;
  values: LookValues;
  stats(): Record<string, unknown>;
  /** Resolves after `count` more rendered frames (capture tooling). */
  waitFrames(count: number): Promise<number>;
}

export class SceneLook {
  private static readonly FORWARD = new Vector3(0, 0, 1);
  private static readonly RIGHT = new Vector3(1, 0, 0);
  private static readonly UP = new Vector3(0, 1, 0);
  readonly scene: Scene;
  readonly camera: Camera;
  readonly sun: DirectionalLight;
  readonly fill: HemisphericLight;
  private readonly context: LookContext;
  private readonly webgpu: boolean;
  private shadowGenerator: ShadowGenerator | null = null;
  private readonly geometryBuffer: GeometryBufferRenderer | null;
  private readonly detail: DetailTextureSet;
  private comicPass: PostProcess | null = null;
  /**
   * Final FXAA on every tier: the ink is drawn after the MSAA resolve from a
   * single-sample g-buffer, so only a pass after ffComic smooths it.
   */
  private fxaaPass: FxaaPostProcess | null = null;
  private visuals: MapVisuals | null = null;
  private quality: VisualQuality = 'high';
  private weather = 0;
  private readonly grade = new Vector4(1, 1, 1, 0);
  private readonly gradeExtra = new Vector4(0.04, 0, 1, 1);
  private readonly shadowTone = new Color3(0, 0, 0);
  private readonly highlightTone = new Color3(0, 0, 0);
  private readonly inkParams = new Vector4(0.76, 0.075, 0.76, 0);
  private readonly inkFade = new Vector4(28, 145, 0.6, 0.3);
  private readonly gbufferList: AbstractMesh[] = [];
  private cloudRoot: TransformNode | null = null;
  private hasPainterlyClouds = false;
  private hasPanorama = false;
  /** Neutral weather preset, colour-matched to the painted panorama once loaded. */
  private readonly neutral: WeatherPreset = clonePreset(WEATHER_NEUTRAL);
  private cameraOverride: { position: Vector3; target: Vector3 } | null = null;
  private disposed = false;
  /** True while the opaque loading screen covers the canvas. */
  private booting = true;
  private readonly tmpWater = new Color3();
  private readonly tmpForward = new Vector3();
  private readonly tmpRight = new Vector3();
  private readonly tmpUp = new Vector3();
  private readonly shadowDirection = new Vector3();
  private readonly shadowFlat = new Vector3();
  private readonly shadowCenter = new Vector3();
  private readonly shadowRight = new Vector3();
  private readonly shadowUp = new Vector3();

  constructor(scene: Scene, camera: Camera, initialQuality: VisualQuality) {
    this.scene = scene;
    this.camera = camera;
    this.webgpu = scene.getEngine().isWebGPU;
    this.context = getLookContext(scene, SUN_DIRECTION);
    const values = this.context.values;

    scene.clearColor = new Color4(values.horizon.r, values.horizon.g, values.horizon.b, 1);
    scene.ambientColor = new Color3(0.55, 0.62, 0.7);
    scene.fogEnabled = false;

    this.sun = new DirectionalLight('ff-sun', SUN_DIRECTION.scale(-1), scene);
    this.sun.intensity = 1.15;
    this.sun.autoUpdateExtends = false;
    this.sun.autoCalcShadowZBounds = false;
    this.sun.shadowFrustumSize = QUALITY[this.quality].shadowFrustum;
    this.sun.shadowMinZ = 0;
    this.sun.shadowMaxZ = SHADOW_DEPTH_RANGE;
    this.fill = new HemisphericLight('ff-sky-fill', new Vector3(0, 1, 0), scene);
    this.fill.intensity = 0.55;

    this.detail = createDetailTextures(scene);
    this.context.textures.detailA = this.detail.detailA;
    this.context.textures.detailB = this.detail.detailB;
    this.context.textures.detailC = this.detail.detailC;
    this.context.textures.detailColor = this.detail.detailColor;

    // Slim g-buffer: linear view depth in R32F, view normals in RGBA16F.
    const gbr = scene.enableGeometryBufferRenderer(0.5, Constants.TEXTUREFORMAT_DEPTH24_STENCIL8, {
      [GeometryBufferRenderer.DEPTH_TEXTURE_TYPE]: {
        textureType: Constants.TEXTURETYPE_FLOAT,
        textureFormat: Constants.TEXTUREFORMAT_R,
      },
      [GeometryBufferRenderer.NORMAL_TEXTURE_TYPE]: {
        textureType: Constants.TEXTURETYPE_HALF_FLOAT,
        textureFormat: Constants.TEXTUREFORMAT_RGBA,
      },
    });
    this.geometryBuffer = gbr && gbr.isSupported ? gbr : null;
    if (this.geometryBuffer) {
      this.geometryBuffer.renderTransparentMeshes = false;
      // Smooth reconstruction of the half-resolution edge buffer, rather than
      // copying its two-pixel staircase over otherwise antialiased silhouettes.
      for (const texture of this.geometryBuffer.getGBuffer().textures) {
        const caps = scene.getEngine().getCaps();
        const canFilter = texture.textureType === Constants.TEXTURETYPE_FLOAT
          ? caps.textureFloatLinearFiltering : caps.textureHalfFloatLinearFiltering;
        if (canFilter) texture.updateSamplingMode(Constants.TEXTURE_BILINEAR_SAMPLINGMODE);
      }
      this.geometryBuffer.getGBuffer().getCustomRenderList = (_pass, defaultList, length) =>
        this.filterGeometryBuffer(defaultList, length);
      values.waterParams.x = 1;
    }

    this.setVisualQuality(initialQuality);
    this.setWeatherLook(0);
    this.setBooting(true);
    if (new URLSearchParams(window.location.search).get('paintedSky') === '1') void this.loadPaintedSky();
    this.installDevHandle();
  }

  /**
   * Hooks the map once the world is built: the sky and water never get ink or
   * cast shadows, and the terrain only receives shadows (casting it would only
   * add acne on its own slopes; the cel bands already shade them).
   */
  attachMap(visuals: MapVisuals): void {
    this.visuals = visuals;
    excludeFromInk(visuals.skyMesh);
    excludeFromInk(visuals.waterMesh);
    excludeFromShadows(visuals.skyMesh);
    excludeFromShadows(visuals.waterMesh);
    excludeFromShadows(visuals.terrainMesh);
  }

  get visualQuality(): VisualQuality {
    return this.quality;
  }

  /** Applies a tier. Persistence and the choice itself belong to GameClient / state/graphics. */
  setVisualQuality(tier: VisualQuality): void {
    if (this.disposed) return;
    this.quality = tier;
    const profile = QUALITY[tier];
    const values = this.context.values;
    values.detailParams.set(0.09, 35, 120, profile.detailMode);
    // Painted colour tiles on wood, logs, shingles and cobbles (~1 repeat per 2 m).
    values.colorParams.set(0.2, 0.5, 0, 0);
    values.toonParams.w = 0;
    this.gradeExtra.y = 0;
    this.inkParams.w = 0;
    this.sun.shadowFrustumSize = profile.shadowFrustum;
    this.ensureShadows(profile.shadowSize);
    values.shadowParams.w = profile.shadowFilter;
    this.ensurePostProcesses();
    if (this.comicPass) this.comicPass.samples = sceneSampleCount(tier, this.webgpu, this.scene.getEngine().getCaps().maxMSAASamples);
    this.applyPixelRatio(profile.maxPixelRatio);
  }

  /**
   * While the opaque loading screen hides the canvas, skip the shadow map,
   * g-buffer and post passes: slow machines need every millisecond to boot.
   */
  setBooting(booting: boolean): void {
    if (this.disposed) return;
    this.booting = booting;
    this.scene.renderTargetsEnabled = !booting;
    this.scene.postProcessesEnabled = !booting;
  }

  /**
   * Weather grading: -1 icy steel-blue sky and cool light, 0 azure default,
   * +1 golden haze with a deep yellow sun. Drives sky, light, water and grade.
   */
  setWeatherLook(balance: number): void {
    const b = Math.max(-1, Math.min(1, Number.isFinite(balance) ? balance : 0));
    this.weather = b;
    const target = b < 0 ? WEATHER_ICY : WEATHER_GOLDEN;
    const t = Math.abs(b);
    const n = this.neutral;
    const v = this.context.values;
    lerpColor3(n.zenith, target.zenith, t, v.zenith);
    lerpColor3(n.horizon, target.horizon, t, v.horizon);
    lerpColor3(n.sunDisc, target.sunDisc, t, v.sunDisc);
    lerpColor3(n.glow, target.glow, t, v.glow);
    lerpColor3(n.sunColor, target.sunColor, t, v.sunColor);
    lerpColor3(n.skyFill, target.skyFill, t, v.skyFill);
    lerpColor3(n.groundFill, target.groundFill, t, v.groundFill);
    lerpColor3(n.shadeCool, target.shadeCool, t, v.shadeCool);
    lerpColor3(n.shadeWarm, target.shadeWarm, t, v.shadeWarm);
    lerpColor3(n.groundHaze, target.groundHaze, t, v.groundHaze);
    lerpColor3(n.cloudShade, target.cloudShade, t, v.cloudShade);
    lerpColor3(n.tint, target.tint, t, v.panoTint);
    lerpColor3(n.tint, target.tint, t, v.billboardTint);
    v.hazeColor.set(
      n.haze.r + (target.haze.r - n.haze.r) * t,
      n.haze.g + (target.haze.g - n.haze.g) * t,
      n.haze.b + (target.haze.b - n.haze.b) * t,
      n.haze.a + (target.haze.a - n.haze.a) * t,
    );
    v.hazeParams.x = n.hazeStart + (target.hazeStart - n.hazeStart) * t;
    v.cloudParams.x = this.hasPainterlyClouds ? 0 : n.cloudScale + (target.cloudScale - n.cloudScale) * t;
    const water = this.tmpWater;
    lerpColor3(n.waterShallow, target.waterShallow, t, water);
    v.waterShallow.set(water.r, water.g, water.b, 1);
    lerpColor3(n.waterMid, target.waterMid, t, water);
    v.waterMid.set(water.r, water.g, water.b, 1);
    lerpColor3(n.waterDeep, target.waterDeep, t, water);
    v.waterDeep.set(water.r, water.g, water.b, 1);
    v.waterSky.set(v.horizon.r, v.horizon.g, v.horizon.b, 1);
    this.grade.set(
      n.grade.x + (target.grade.x - n.grade.x) * t,
      n.grade.y + (target.grade.y - n.grade.y) * t,
      n.grade.z + (target.grade.z - n.grade.z) * t,
      n.grade.w + (target.grade.w - n.grade.w) * t,
    );
    lerpColor3(n.shadowTone, target.shadowTone, t, this.shadowTone);
    lerpColor3(n.highlightTone, target.highlightTone, t, this.highlightTone);
    this.sun.diffuse.copyFrom(v.sunColor);
    this.fill.diffuse.copyFrom(v.skyFill);
    this.fill.groundColor.set(v.groundFill.r * 0.55, v.groundFill.g * 0.5, v.groundFill.b * 0.45);
    this.scene.clearColor.set(v.horizon.r, v.horizon.g, v.horizon.b, 1);
  }

  get weatherBalance(): number {
    return this.weather;
  }

  /** Per-frame: camera-derived uniforms, shadow frustum fit, material sync. */
  update(time: number): void {
    if (this.disposed) return;
    const camera = this.camera;
    if (this.cameraOverride && 'setTarget' in camera && typeof camera.setTarget === 'function') {
      camera.position.copyFrom(this.cameraOverride.position);
      (camera as Camera & { setTarget(target: Vector3): void }).setTarget(this.cameraOverride.target);
    }
    const v = this.context.values;
    const engine = this.scene.getEngine();
    v.time = time;
    v.cameraPosition.copyFrom(camera.globalPosition);
    camera.getDirectionToRef(SceneLook.FORWARD, this.tmpForward);
    v.cameraForward.copyFrom(this.tmpForward);
    v.screen.set(1 / Math.max(1, engine.getRenderWidth()), 1 / Math.max(1, engine.getRenderHeight()), 0, 0);

    this.fitShadowFrustum();
    const gbr = this.geometryBuffer;
    if (gbr) {
      const depth = gbr.getGBuffer().textures[gbr.getTextureIndex(GeometryBufferRenderer.DEPTH_TEXTURE_TYPE)];
      if (depth) this.context.textures.sceneDepth = depth;
    }
    if (this.cloudRoot) {
      this.cloudRoot.position.copyFrom(camera.globalPosition);
      this.cloudRoot.rotation.y = Math.sin(time * 0.004) * 0.12;
    }
    applyLookToAll(this.context);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.scene.renderTargetsEnabled = true;
    this.scene.postProcessesEnabled = true;
    this.disposePostProcesses();
    this.shadowGenerator?.dispose();
    this.scene.disableGeometryBufferRenderer();
    this.detail.dispose();
    this.cloudRoot?.dispose(false, true);
    this.sun.dispose();
    this.fill.dispose();
    if (import.meta.env.DEV) {
      const holder = window as unknown as { __ff?: Record<string, unknown> };
      if (holder.__ff) delete holder.__ff.look;
    }
  }

  // -------------------------------------------------------------------------

  /** Caps the render scale on HiDPI panels (adaptToDeviceRatio renders at full DPR). */
  private applyPixelRatio(maxRatio: number): void {
    const engine = this.scene.getEngine();
    const deviceRatio = typeof window !== 'undefined' && window.devicePixelRatio > 0 ? window.devicePixelRatio : 1;
    const canvas = engine.getRenderingCanvas();
    const level = 1 / renderRatio(canvas?.clientWidth ?? 1, canvas?.clientHeight ?? 1, deviceRatio, maxRatio, this.quality);
    if (Math.abs(engine.getHardwareScalingLevel() - level) > 0.001) engine.setHardwareScalingLevel(level);
  }

  /** Re-evaluate the pixel budget after window/fullscreen changes. */
  refreshRenderScale(): void {
    this.applyPixelRatio(QUALITY[this.quality].maxPixelRatio);
  }

  private filterGeometryBuffer(list: Nullable<readonly AbstractMesh[]>, length: number): AbstractMesh[] {
    const out = this.gbufferList;
    out.length = 0;
    if (!list) return out;
    for (let index = 0; index < length; index += 1) {
      const mesh = list[index];
      if (!mesh || isInkExcluded(mesh)) continue;
      const material = mesh.material;
      if (!material || isWaterMaterial(material)) continue;
      if (material.disableDepthWrite || material.needAlphaBlendingForMesh(mesh)) continue;
      out.push(mesh);
    }
    return out;
  }

  private isShadowCaster(mesh: AbstractMesh): boolean {
    if (!mesh.isEnabled() || !mesh.isVisible || isShadowExcluded(mesh)) return false;
    if (!isLookSolidMaterial(mesh.material)) return false;
    if (this.visuals && mesh === this.visuals.terrainMesh) return false;
    if (mesh.name === 'fjord-terrain') return false;
    const sphere = mesh.getBoundingInfo().boundingSphere;
    const radius = sphere.radiusWorld;
    // Map-spanning thin-instance batches: their sphere covers the whole map.
    if (mesh instanceof Mesh && mesh.hasThinInstances) return true;
    if (radius > 360) return false;
    return this.insideShadowVolume(sphere.centerWorld, radius);
  }

  /**
   * Light-space box test against the 130 m x 130 m x 420 m shadow window that
   * fitShadowFrustum placed this frame (Babylon does not cull casters itself).
   */
  private insideShadowVolume(center: Vector3, radius: number): boolean {
    const origin = this.shadowCenter;
    const dx = center.x - origin.x;
    const dy = center.y - origin.y;
    const dz = center.z - origin.z;
    // +1 m covers the texel snap between the stored and the snapped centre.
    const half = QUALITY[this.quality].shadowFrustum * 0.5 + radius + 1;
    const right = this.shadowRight;
    if (Math.abs(dx * right.x + dy * right.y + dz * right.z) > half) return false;
    const up = this.shadowUp;
    if (Math.abs(dx * up.x + dy * up.y + dz * up.z) > half) return false;
    const direction = this.shadowDirection;
    return Math.abs(dx * direction.x + dy * direction.y + dz * direction.z) <= SHADOW_DEPTH_RANGE * 0.5 + radius + 1;
  }

  private ensureShadows(size: number): void {
    const values = this.context.values;
    if (this.shadowGenerator && this.shadowGenerator.mapSize === size) return;
    this.shadowGenerator?.dispose();
    const engine = this.scene.getEngine();
    const caps = engine.getCaps();
    // A red-only map needs a float or half-float target; the RGBA8 fallback
    // keeps four channels so depth can be packed into them.
    const floatTarget = Boolean(
      (caps.textureFloatRender && caps.textureFloatLinearFiltering) ||
        (caps.textureHalfFloatRender && caps.textureHalfFloatLinearFiltering),
    );
    const generator = new ShadowGenerator(size, this.sun, true, undefined, floatTarget);
    generator.filter = ShadowGenerator.FILTER_NONE;
    generator.bias = 0.00014;
    generator.normalBias = 0;
    generator.transparencyShadow = false;
    const shadowMap = generator.getShadowMap();
    if (shadowMap) {
      shadowMap.refreshRate = 1;
      shadowMap.renderListPredicate = (mesh) => this.isShadowCaster(mesh);
      this.context.textures.shadowMap = shadowMap;
      const packed = shadowMap.textureType === Constants.TEXTURETYPE_UNSIGNED_BYTE ? 1 : 0;
      const minZ = !engine.useReverseDepthBuffer && engine.isNDCHalfZRange ? 0 : 1;
      const maxZ = engine.useReverseDepthBuffer && engine.isNDCHalfZRange ? 0 : 1;
      values.shadowDepth.set(minZ, minZ + maxZ, packed, engine.useReverseDepthBuffer ? -1 : 1);
      // One half-float ulp in [0.5, 1) is 1/2048 of the depth range; bias past it.
      if (shadowMap.textureType === Constants.TEXTURETYPE_HALF_FLOAT) generator.bias = 0.0007;
    }
    // Materials hold a reference to values.lightMatrix, so updating it in
    // place reaches every toon and character shader.
    generator.onAfterShadowMapRenderObservable.add(() => {
      values.lightMatrix.copyFrom(generator.getTransformMatrix());
    });
    values.shadowParams.set(1 / size, (QUALITY[this.quality].shadowFrustum / size) * 1.6, 1, 1);
    this.shadowGenerator = generator;
  }

  private fitShadowFrustum(): void {
    const camera = this.camera;
    const direction = this.shadowDirection.copyFrom(this.sun.direction).normalize();
    const forward = this.tmpForward;
    const flat = this.shadowFlat.set(forward.x, 0, forward.z);
    if (flat.lengthSquared() < 0.0001) flat.set(0, 0, 1);
    flat.normalize();
    const center = this.shadowCenter.copyFrom(camera.globalPosition).addInPlace(flat.scaleInPlace(QUALITY[this.quality].shadowFrustum * 0.32));
    // Snap the centre to whole shadow texels in light space to stop shimmering.
    const size = this.shadowGenerator?.mapSize ?? 2048;
    const texel = QUALITY[this.quality].shadowFrustum / size;
    const right = Vector3.CrossToRef(Vector3.UpReadOnly, direction, this.shadowRight).normalize();
    const up = Vector3.CrossToRef(direction, right, this.shadowUp).normalize();
    const cx = Math.round(Vector3.Dot(center, right) / texel) * texel;
    const cy = Math.round(Vector3.Dot(center, up) / texel) * texel;
    const cz = Vector3.Dot(center, direction) - SHADOW_DEPTH_RANGE * 0.5;
    this.sun.position.set(
      right.x * cx + up.x * cy + direction.x * cz,
      right.y * cx + up.y * cy + direction.y * cz,
      right.z * cx + up.z * cy + direction.z * cz,
    );
  }

  private ensurePostProcesses(): void {
    // Stable two-pass stack: changing quality never recreates full-screen targets.
    if (this.comicPass) return;
    registerLookPostShaders();
    this.comicPass = this.createComicPass();
    this.comicPass.samples = 1;
    this.fxaaPass = new FxaaPostProcess('ff-fxaa', 1, this.camera, Constants.TEXTURE_BILINEAR_SAMPLINGMODE, this.scene.getEngine());
  }

  private disposePostProcesses(): void {
    this.fxaaPass?.dispose(this.camera);
    this.fxaaPass = null;
    this.comicPass?.dispose(this.camera);
    this.comicPass = null;
  }

  private createComicPass(): PostProcess {
    const engine = this.scene.getEngine();
    const pass = new PostProcess('ff-comic', 'ffComic', {
      uniforms: [...COMIC_UNIFORMS],
      samplers: [...COMIC_SAMPLERS],
      size: 1,
      camera: this.camera,
      samplingMode: Constants.TEXTURE_BILINEAR_SAMPLINGMODE,
      engine,
      shaderLanguage: this.webgpu ? ShaderLanguage.WGSL : ShaderLanguage.GLSL,
    });
    pass.onApplyObservable.add((effect) => this.bindComic(effect));
    return pass;
  }

  private bindComic(effect: Effect): void {
    const engine = this.scene.getEngine();
    const width = Math.max(1, engine.getRenderWidth());
    const height = Math.max(1, engine.getRenderHeight());
    const camera = this.camera;
    const ink = this.context.values.inkColor;
    const scale = height / 1080;
    effect.setFloat2('uTexel', 1 / width, 1 / height);
    effect.setFloat4('uInkColor', ink.r, ink.g, ink.b, this.geometryBuffer ? 0.85 : 0);
    effect.setFloat4(
      'uInkParams',
      Math.max(0.65, this.inkParams.x * Math.max(0.8, scale)),
      this.inkParams.y,
      this.inkParams.z,
      this.inkParams.w * Math.max(0.6, scale) * 1.4,
    );
    effect.setVector4('uInkFade', this.inkFade);
    effect.setFloat4('uWaterLevel', WATER_LEVEL + 0.04, 0, 0, 0);
    const position = camera.globalPosition;
    effect.setFloat3('uCamPos', position.x, position.y, position.z);
    camera.getDirectionToRef(SceneLook.FORWARD, this.tmpForward);
    camera.getDirectionToRef(SceneLook.RIGHT, this.tmpRight);
    camera.getDirectionToRef(SceneLook.UP, this.tmpUp);
    const tanHalf = Math.tan(camera.fov / 2);
    const aspect = width / height;
    effect.setFloat3('uCamForward', this.tmpForward.x, this.tmpForward.y, this.tmpForward.z);
    effect.setFloat3('uCamRight', this.tmpRight.x * tanHalf * aspect, this.tmpRight.y * tanHalf * aspect, this.tmpRight.z * tanHalf * aspect);
    effect.setFloat3('uCamUp', this.tmpUp.x * tanHalf, this.tmpUp.y * tanHalf, this.tmpUp.z * tanHalf);
    effect.setVector4('uGrade', this.grade);
    effect.setVector4('uGradeExtra', this.gradeExtra);
    effect.setColor3('uShadowTone', this.shadowTone);
    effect.setColor3('uHighlightTone', this.highlightTone);
    effect.setFloat4('uSharpen', 0, 0, 0, 0);
    const gbr = this.geometryBuffer;
    const fallback: BaseTexture = this.context.textures.sceneDepth;
    if (gbr) {
      const textures = gbr.getGBuffer().textures;
      effect.setTexture('depthSampler', textures[gbr.getTextureIndex(GeometryBufferRenderer.DEPTH_TEXTURE_TYPE)] ?? fallback);
      effect.setTexture('normalSampler', textures[gbr.getTextureIndex(GeometryBufferRenderer.NORMAL_TEXTURE_TYPE)] ?? fallback);
    } else {
      effect.setTexture('depthSampler', fallback);
      effect.setTexture('normalSampler', fallback);
    }
  }

  private async loadPaintedSky(): Promise<void> {
    const values = this.context.values;
    const [panoramaImage, foam, ...clouds] = await Promise.all([
      loadArtImage('sky/horizon-panorama.jpg'),
      probeArt('tex/water_foam.png'),
      ...CLOUD_FILES.map((file) => probeArt(file)),
    ]);
    if (this.disposed) return;
    if (panoramaImage) {
      this.matchSkyToPanorama(panoramaImage);
      const texture = new Texture(artUrl('sky/horizon-panorama.jpg'), this.scene, {
        noMipmap: true,
        invertY: false,
        samplingMode: Constants.TEXTURE_BILINEAR_SAMPLINGMODE,
        onLoad: () => {
          if (this.disposed) return;
          texture.wrapU = Constants.TEXTURE_WRAP_ADDRESSMODE;
          texture.wrapV = Constants.TEXTURE_CLAMP_ADDRESSMODE;
          this.context.textures.panorama = texture;
          // The painting already carries its sky, clouds and mountains down to the
          // horizon; only its very top row blends into the colour-matched shader sky.
          values.panoParams.set(1, PANORAMA_HORIZON_V, PANORAMA_RADIANS_PER_V, 1);
          values.panoFade.set(0.0, 0.06, 0, 0);
          this.hasPanorama = true;
          this.setWeatherLook(this.weather);
        },
      });
    }
    if (foam) {
      const texture = new Texture(artUrl('tex/water_foam.png'), this.scene, {
        onLoad: () => {
          if (this.disposed) return;
          texture.wrapU = Constants.TEXTURE_WRAP_ADDRESSMODE;
          texture.wrapV = Constants.TEXTURE_WRAP_ADDRESSMODE;
          this.context.textures.foam = texture;
          values.waterParams.w = 1;
        },
      });
    }
    const available = CLOUD_FILES.filter((_, index) => clouds[index]);
    if (available.length > 0) this.buildCloudBillboards(available);
  }

  /**
   * Samples the painted panorama so the shader sky above it (zenith) and the
   * colours derived from the horizon (clear colour, water reflection, aerial
   * haze) continue the painting instead of fighting it.
   */
  private matchSkyToPanorama(image: HTMLImageElement): void {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const average = (v0: number, v1: number, u0: number, u1: number): Color3 => {
      const data = ctx.getImageData(
        Math.floor(u0 * canvas.width),
        Math.floor(v0 * canvas.height),
        Math.max(1, Math.floor((u1 - u0) * canvas.width)),
        Math.max(1, Math.floor((v1 - v0) * canvas.height)),
      ).data;
      let r = 0;
      let g = 0;
      let b = 0;
      const count = data.length / 4;
      for (let i = 0; i < data.length; i += 4) {
        r += data[i] ?? 0;
        g += data[i + 1] ?? 0;
        b += data[i + 2] ?? 0;
      }
      return new Color3(r / count / 255, g / count / 255, b / count / 255);
    };
    const top = average(0, 0.03, 0, 1);
    // Clear sky just above the open sea (azimuth 235-320 deg, no mountains).
    const low = average(PANORAMA_HORIZON_V - 0.2, PANORAMA_HORIZON_V - 0.04, 235 / 360, 320 / 360);
    const neutral = this.neutral;
    neutral.zenith.copyFrom(top.scale(0.97));
    neutral.horizon.copyFrom(low);
    neutral.groundHaze.copyFrom(low);
    neutral.haze.set(low.r, low.g, low.b, neutral.haze.a);
  }

  private buildCloudBillboards(files: string[]): void {
    const root = new TransformNode('ff-cloud-billboards', this.scene);
    this.cloudRoot = root;
    // A few large painted clouds: low ones over the open sea (no peaks to hide),
    // higher ones over the alps so the painted summits stay visible.
    const layout: Array<{ azimuth: number; elevation: number; width: number }> = [
      { azimuth: 250, elevation: 7, width: 560 },
      { azimuth: 296, elevation: 11, width: 470 },
      { azimuth: 214, elevation: 16, width: 420 },
      { azimuth: 338, elevation: 21, width: 500 },
      { azimuth: 62, elevation: 27, width: 560 },
      { azimuth: 128, elevation: 25, width: 500 },
      { azimuth: 176, elevation: 13, width: 430 },
      { azimuth: 18, elevation: 24, width: 440 },
    ];
    let created = 0;
    layout.forEach((slot, index) => {
      const file = files[index % files.length];
      if (!file) return;
      const texture = new Texture(artUrl(file), this.scene, { noMipmap: false, invertY: true });
      texture.hasAlpha = true;
      texture.wrapU = Constants.TEXTURE_CLAMP_ADDRESSMODE;
      texture.wrapV = Constants.TEXTURE_CLAMP_ADDRESSMODE;
      const material = createCloudMaterial(this.scene, `ff-cloud-${index}`, texture);
      const azimuth = (slot.azimuth * Math.PI) / 180;
      const elevation = (slot.elevation * Math.PI) / 180;
      const distance = CLOUD_RING_DISTANCE;
      const width = slot.width * CLOUD_WIDTH_SCALE;
      const plane = CreatePlane(`ff-cloud-${index}`, { width, height: width * 0.5 }, this.scene);
      plane.material = material;
      plane.parent = root;
      plane.position.set(
        Math.sin(azimuth) * Math.cos(elevation) * distance,
        Math.sin(elevation) * distance,
        Math.cos(azimuth) * Math.cos(elevation) * distance,
      );
      plane.billboardMode = Mesh.BILLBOARDMODE_Y;
      plane.isPickable = false;
      plane.alwaysSelectAsActiveMesh = true;
      plane.alphaIndex = -1000 + index;
      excludeFromInk(plane);
      excludeFromShadows(plane);
      created += 1;
    });
    if (created > 0) {
      this.hasPainterlyClouds = true;
      this.context.values.cloudParams.x = 0;
    }
  }

  private installDevHandle(): void {
    if (!import.meta.env.DEV) return;
    const holder = window as unknown as { __ff?: Record<string, unknown> };
    const handle: DevHandle = {
      setWeatherLook: (balance) => this.setWeatherLook(balance),
      setVisualQuality: (tier) => this.setVisualQuality(tier),
      quality: () => this.quality,
      setCameraOverride: (x, y, z, tx, ty, tz) => {
        this.cameraOverride = { position: new Vector3(x, y, z), target: new Vector3(tx, ty, tz) };
      },
      clearCameraOverride: () => {
        this.cameraOverride = null;
      },
      cam: (spec) => {
        const [x = 0, y = 0, z = 0, tx = 0, ty = 0, tz = 1] = spec.trim().split(/\s+/).map(Number);
        this.cameraOverride = { position: new Vector3(x, y, z), target: new Vector3(tx, ty, tz) };
      },
      values: this.context.values,
      waitFrames: (count) =>
        new Promise((resolve) => {
          let remaining = Math.max(1, Math.floor(count));
          const observer = this.scene.onAfterRenderObservable.add(() => {
            remaining -= 1;
            if (remaining > 0) return;
            this.scene.onAfterRenderObservable.remove(observer);
            resolve(this.scene.getEngine().frameId);
          });
        }),
      stats: () => ({
        quality: this.quality,
        weather: this.weather,
        booting: this.booting,
        webgpu: this.webgpu,
        frameId: this.scene.getEngine().frameId,
        drawCalls: this.scene.getEngine()._drawCalls.current,
        activeMeshes: this.scene.getActiveMeshes().length,
        shadowCasters: this.shadowGenerator?.getShadowMap()?.renderList?.length ?? 0,
        shadowMapSize: this.shadowGenerator?.mapSize ?? 0,
        gbuffer: Boolean(this.geometryBuffer),
        sceneSamples: this.comicPass?.samples ?? 1,
        postProcesses: this.camera._postProcesses.filter(Boolean).map((pass) => pass?.name),
        painterlyClouds: this.hasPainterlyClouds,
        panorama: this.hasPanorama,
      }),
    };
    holder.__ff = { ...(holder.__ff ?? {}), look: handle };
  }
}

export function createSceneLook(scene: Scene, camera: Camera, initialQuality: VisualQuality): SceneLook {
  return new SceneLook(scene, camera, initialQuality);
}
