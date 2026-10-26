import type { VisualQuality } from './render-profile';

/** Bound full-screen targets even on 4K/Retina displays; CSS/UI stay native. */
export function renderRatio(width: number, height: number, dpr: number, cap: number, tier: VisualQuality): number {
  const pixels = tier === 'high' ? 2560 * 1440 : tier === 'medium' ? 1920 * 1080 : 1600 * 900;
  return Math.min(dpr, cap, Math.sqrt(pixels / Math.max(1, width * height)));
}

/** Sustained overload lowers Auto one tier; warmup/cooldown prevent allocation churn. */
export class QualityGovernor {
  private startedAt: number | null = null;
  private slowSince: number | null = null;

  reset(): void {
    this.startedAt = this.slowSince = null;
  }

  observe(now: number, frameMs: number, tier: VisualQuality, enabled: boolean, targetFps = 60): VisualQuality {
    if (!enabled || tier === 'low' || !Number.isFinite(frameMs)) {
      this.reset();
      return tier;
    }
    this.startedAt ??= now;
    if (now - this.startedAt < 4000 || frameMs <= Math.max(28, (1000 / Math.max(1, targetFps)) * 1.3)) {
      this.slowSince = null;
      return tier;
    }
    this.slowSince ??= now;
    if (now - this.slowSince < 5000) return tier;
    this.reset();
    return tier === 'high' ? 'medium' : 'low';
  }
}
