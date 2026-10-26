import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine';
import type { VisualQuality } from './scene-look';

/**
 * Picks the default painterly tier for the GPU the engine runs on.
 *
 *   software    CPU rasterisers (SwiftShader, llvmpipe, lavapipe, WARP) and
 *               WebGPU fallback adapters                          -> low
 *   integrated  Intel HD/UHD/Iris, AMD APU graphics, mobile GPUs   -> medium
 *               (old Intel HD/UHD at 1440 px or taller renders     -> low)
 *   other       discrete or unrecognised GPUs                      -> high
 *
 * Strings come from `engine.getInfo()`: the unmasked GL vendor/renderer on
 * WebGL2, the adapter vendor/architecture/description on WebGPU. Browsers that
 * mask them simply land on 'high'; GameClient's continuous frame-time governor then
 * steps down as needed if the device cannot keep up.
 */
export type GpuKind = 'software' | 'integrated' | 'discrete';

export interface GpuClass {
  kind: GpuKind;
  tier: VisualQuality;
  /** Lower-cased "vendor renderer version" string the decision was based on. */
  description: string;
}

const SOFTWARE_GPU = /swiftshader|subzero|llvmpipe|lavapipe|softpipe|software|basic render|\bwarp\b/;
const INTEGRATED_GPU =
  /intel|iris|uhd|hd graphics|mali|adreno|powervr|radeon\(tm\) graphics|radeon graphics|vega \d+ graphics/;
/** Discrete Intel Arc parts share the "intel" vendor string. */
const DISCRETE_INTEL_GPU = /arc\(tm\)|\barc a\d|xe-hpg/;
/** Intel Gen9.5 and older: "HD/UHD Graphics 520/620/630", "HD Graphics 4600", WebGPU arch "gen-9". */
const WEAK_INTEGRATED_GPU = /\bu?hd graphics p?\d{3,4}\b|\bgen-[4-9]\b/;
const WEAK_GPU_LOW_HEIGHT = 1440;

interface EngineInfo {
  vendor?: string;
  renderer?: string;
  version?: string;
}

function engineInfo(engine: AbstractEngine): string {
  try {
    // ThinEngine and WebGPUEngine both implement getInfo(); AbstractEngine does not declare it.
    const info = (engine as unknown as { getInfo?: () => EngineInfo }).getInfo?.();
    return `${info?.vendor ?? ''} ${info?.renderer ?? ''} ${info?.version ?? ''}`.toLowerCase().trim();
  } catch {
    return '';
  }
}

export function classifyGpu(engine: AbstractEngine, options: { fallbackAdapter?: boolean } = {}): GpuClass {
  const description = engineInfo(engine);
  if (options.fallbackAdapter || SOFTWARE_GPU.test(description)) {
    return { kind: 'software', tier: 'low', description };
  }
  if (INTEGRATED_GPU.test(description) && !DISCRETE_INTEL_GPU.test(description)) {
    const weak = WEAK_INTEGRATED_GPU.test(description) && engine.getRenderHeight() >= WEAK_GPU_LOW_HEIGHT;
    return { kind: 'integrated', tier: weak ? 'low' : 'medium', description };
  }
  return { kind: 'discrete', tier: 'high', description };
}
