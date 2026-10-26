<script lang="ts">
  import {
    frameLimit,
    chooseFrameLimit,
    VISUAL_QUALITY_SETTINGS,
    activeVisualQuality,
    chooseVisualQuality,
    visualQualitySetting,
    type VisualQualitySetting,
  } from '../state/graphics';
  import type { FrameLimit } from '../rendering/render-profile';
  import { t } from '../state/locale';

  const limits: FrameLimit[] = [30, 45, 60];
  const frameKeys = {30: 'graphics.frames30', 45: 'graphics.frames45', 60: 'graphics.frames60'} as const;

  type QualityLabelKey = 'graphics.auto' | 'graphics.high' | 'graphics.medium' | 'graphics.low';

  const labelKeys: Record<VisualQualitySetting, QualityLabelKey> = {
    auto: 'graphics.auto',
    high: 'graphics.high',
    medium: 'graphics.medium',
    low: 'graphics.low',
  };
</script>

<div class="graphics-settings">
  <div class="section-heading">
    <span>{$t('graphics.title')}</span>
    <small>{$t('graphics.subtitle')}</small>
  </div>

  <div class="quality-choices" role="group" aria-label={$t('graphics.title')}>
    {#each VISUAL_QUALITY_SETTINGS as setting (setting)}
      <button
        class="btn-ghost"
        type="button"
        aria-pressed={$visualQualitySetting === setting}
        on:click={() => chooseVisualQuality(setting)}
      >
        {$t(labelKeys[setting])}
      </button>
    {/each}
  </div>

  {#if $activeVisualQuality}
    <p class="field-hint">
      {$t($visualQualitySetting === 'auto' ? 'graphics.activeAuto' : 'graphics.active', {
        tier: $t(labelKeys[$activeVisualQuality]),
      })}
    </p>
  {/if}
  <p class="field-hint">{$t('graphics.hint')}</p>
  <div class="section-heading"><span>{$t('graphics.frameLimit')}</span></div>
  <div class="quality-choices" role="group" aria-label={$t('graphics.frameLimit')}>
    {#each limits as limit}
      <button class="btn-ghost" type="button" aria-pressed={$frameLimit === limit} on:click={() => chooseFrameLimit(limit)}>{$t(frameKeys[limit])}</button>
    {/each}
  </div>
  <p class="field-hint">{$t('graphics.frameHint')}</p>
</div>

<style>
  .graphics-settings .section-heading {
    margin-top: 0;
  }

  .quality-choices {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin: 0.5rem 0 0.2rem;
  }
</style>
