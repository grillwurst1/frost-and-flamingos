import type { VisualQuality } from './scene-look';

/** Bound full-screen targets even on 4K/Retina displays; CSS/UI stay native. */
export function renderRatio(width: number, height: number, dpr: number, cap: number, tier: VisualQuality): number {
  const pixels = tier === 'high' ? 2560 * 1440 : tier === 'medium' ? 1920 * 1080 : 1280 * 720;
  return Math.min(dpr, cap, Math.sqrt(pixels / Math.max(1, width * height)));
}

/** Sustained overload lowers Auto one tier; warmup/cooldown prevent allocation churn. */
export class QualityGovernor {
  private startedAt: number | null = null;
  private slowSince: number | null = null;

  reset(): void {
    this.startedAt = this.slowSince = null;
  }

  observe(now: number, frameMs: number, tier: VisualQuality, enabled: boolean): VisualQuality {
    if (!enabled || tier === 'low' || !Number.isFinite(frameMs)) {
      this.reset();
      return tier;
    }
    this.startedAt ??= now;
    if (now - this.startedAt < 4000 || frameMs <= 28) {
      this.slowSince = null;
      return tier;
    }
    this.slowSince ??= now;
    if (now - this.slowSince < 5000) return tier;
    this.reset();
    return tier === 'high' ? 'medium' : 'low';
  }
}
