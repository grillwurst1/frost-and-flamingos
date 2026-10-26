/** Shared, explicit budgets: preserve model/texture fidelity before adding screen effects. */
export type VisualQuality = 'high' | 'medium' | 'low';

export interface RenderProfile {
  detailMode: number;
  shadowSize: number;
  shadowFilter: number;
  shadowFrustum: number;
  maxPixelRatio: number;
}

export const RENDER_PROFILES: Readonly<Record<VisualQuality, RenderProfile>> = {
  high: { detailMode: 1, shadowSize: 2048, shadowFilter: 2, shadowFrustum: 100, maxPixelRatio: 1.5 },
  medium: { detailMode: 1, shadowSize: 1024, shadowFilter: 1, shadowFrustum: 80, maxPixelRatio: 1.25 },
  low: { detailMode: 1, shadowSize: 512, shadowFilter: 1, shadowFrustum: 60, maxPixelRatio: 1 },
};

export type FrameLimit = 30 | 45 | 60;

/** Menus/previews need less energy; simulation remains fixed at 60 Hz. */
export function renderFrameLimit(limit: FrameLimit, playing: boolean): number {
  return playing ? limit : Math.min(30, limit);
}
