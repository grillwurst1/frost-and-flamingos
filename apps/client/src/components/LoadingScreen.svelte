<script lang="ts">
  import type { TranslationKey } from '@frost-and-flamingos/shared';
  import { loading } from '../state/game';
  import { t } from '../state/locale';

  interface LoadingStep {
    id: 'engine' | 'world' | 'network';
    labelKey: TranslationKey;
  }

  const steps: LoadingStep[] = [
    { id: 'engine', labelKey: 'loading.engine' },
    { id: 'world', labelKey: 'loading.world' },
    { id: 'network', labelKey: 'loading.network' },
  ];

  $: progressPercent = Math.round($loading.progress * 100);
  $: rendererLabel =
    $loading.renderer === 'webgpu'
      ? $t('hud.webgpu')
      : $loading.renderer === 'webgl2'
        ? $t('hud.webgl2')
        : $t('common.loading');
</script>

<div class="loading-screen">
  <div class="loading-noise" aria-hidden="true"></div>
  <div class="relative flex w-full max-w-2xl flex-col items-center px-6">
    <div class="relative mb-9 grid place-items-center">
      <div class="loading-ring" aria-hidden="true"></div>
      <div class="loading-mark">F&amp;F</div>
    </div>

    <p class="eyebrow mb-3">{$t('meta.season')}</p>
    <h1 class="display text-center text-5xl text-white sm:text-6xl">{$t('loading.title')}</h1>
    <p class="mt-3 max-w-md text-center text-sm leading-relaxed text-glacier-200/80">
      {$t('loading.subtitle')}
    </p>

    <div class="mt-9 w-full max-w-md space-y-3">
      {#each steps as step (step.id)}
        <div
          class="loading-step"
          data-active={$loading[step.id] === 'active'}
          data-done={$loading[step.id] === 'done'}
          data-failed={$loading[step.id] === 'failed'}
        >
          <span class="loading-step-icon" aria-hidden="true">
            {$loading[step.id] === 'done'
              ? '✓'
              : $loading[step.id] === 'failed'
                ? '!'
                : $loading[step.id] === 'active'
                  ? '•'
                  : '·'}
          </span>
          <span>{$t(step.labelKey)}</span>
        </div>
      {/each}
    </div>

    <div class="mt-7 w-full max-w-md">
      <div class="mb-2 flex items-center justify-between text-[0.62rem] font-bold uppercase tracking-[0.18em] text-glacier-200/60">
        <span>{rendererLabel}</span>
        <span class="mono">{progressPercent}%</span>
      </div>
      <div class="loading-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={progressPercent}>
        <div class="loading-bar-fill" style={`width: ${progressPercent}%`}></div>
      </div>
    </div>

    <p class="mt-6 text-center text-[0.68rem] leading-relaxed text-glacier-200/45">
      {$t('loading.slow')}
    </p>
  </div>
</div>
