<script lang="ts">
  import type { TranslationKey } from '@frost-and-flamingos/shared';
  import { loading, localPlayer } from '../state/game';
  import { factionClassNameKey, factionNameKey } from '../state/labels';
  import { t } from '../state/locale';

  export let mode: 'boot' | 'deploy' = 'boot';

  interface LoadingStep {
    id: 'engine' | 'world' | 'network';
    labelKey: TranslationKey;
  }

  const steps: LoadingStep[] = [
    { id: 'engine', labelKey: 'loading.engine' },
    { id: 'world', labelKey: 'loading.world' },
    { id: 'network', labelKey: 'loading.network' },
  ];

  const tips: TranslationKey[] = [
    'loading.tipWardrobe',
    'loading.tipMovement',
    'loading.tipParachute',
    'loading.tipMultiplayer',
  ];

  $: deploying = mode === 'deploy';
  $: player = $localPlayer;
  $: progressPercent = Math.round($loading.progress * 100);
  $: rendererLabel =
    $loading.renderer === 'webgpu'
      ? $t('hud.webgpu')
      : $loading.renderer === 'webgl2'
        ? $t('hud.webgl2')
        : $t('common.loading');
  $: titleParts = $t('meta.title').split('&');
  $: frostWord = titleParts[0]?.trim() ?? $t('meta.title');
  $: flamingoWord = titleParts[1]?.trim() ?? '';
</script>

<div class="loading-screen loading-cover">
  <div class="cover-split" aria-hidden="true">
    <div class="cover-alpine"></div>
    <div class="cover-lagoon"></div>
    <div class="cover-seam"></div>
    <div class="cover-sun"></div>
    <div class="cover-peaks"></div>
    <div class="cover-waves"></div>
  </div>
  <div class="cover-grain" aria-hidden="true"></div>

  <div class="loading-shell">
    <section class="loading-brand">
      <div class="cover-topline">
        <span class="cover-season">{$t('meta.season')}</span>
        <span class="hud-chip">{$t('meta.badge')}</span>
      </div>

      <h1 class="cover-title loading-title">
        <span class="cover-title-frost">{frostWord}</span>
        {#if flamingoWord}<span class="cover-title-amp">&amp;</span>{/if}
        {#if flamingoWord}<span class="cover-title-flamingo">{flamingoWord}</span>{/if}
      </h1>
      <p class="cover-subtitle">{$t('meta.subtitle')}</p>
      <p class="cover-tagline">{$t('meta.tagline')}</p>

      <div class="loading-factions">
        <span class="loading-faction loading-faction-alpine">
          <strong>{$t('loading.coverAlpine')}</strong>
          <span>{$t('factions.alpine.motto')}</span>
        </span>
        <span class="loading-faction loading-faction-lagoon">
          <strong>{$t('loading.coverLagoon')}</strong>
          <span>{$t('factions.lagoon.motto')}</span>
        </span>
      </div>
    </section>

    <section class="loading-card glass-strong">
      <header class="loading-card-head">
        <div>
          <span class="eyebrow">{$t(deploying ? 'loading.deployEyebrow' : 'loading.title')}</span>
          <h2>{$t(deploying ? 'loading.deployTitle' : 'loading.subtitle')}</h2>
        </div>
        <span class="hud-chip mono">{deploying ? $t('world.mapName') : rendererLabel}</span>
      </header>

      {#if deploying}
        <div class="loading-deploy">
          <div class="loading-deploy-row">
            <span class="hud-label">{$t('loading.deployDestination')}</span>
            <strong>{$t('world.mapName')}</strong>
          </div>
          {#if player}
            <div class="loading-deploy-row">
              <span class="hud-label">{$t('loading.deployAssignment')}</span>
              <strong>
                {$t(factionNameKey(player.faction))} · {$t(factionClassNameKey(player.faction, player.classId))}
              </strong>
            </div>
          {/if}
          <div class="loading-deploy-bar" role="progressbar" aria-label={$t('loading.deployTitle')}>
            <div class="loading-deploy-bar-fill"></div>
          </div>
          <p class="loading-deploy-status">{$t('loading.deployStatus')}</p>
          <p class="loading-deploy-hint">{$t('loading.deployHint')}</p>
        </div>
      {:else}
      <div class="loading-steps">
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
            <span class="loading-step-state mono">
              {$loading[step.id] === 'done'
                ? $t('common.done')
                : $loading[step.id] === 'failed'
                  ? $t('common.retry')
                  : $loading[step.id] === 'active'
                    ? $t('common.loading')
                    : ''}
            </span>
          </div>
        {/each}
      </div>

      <div class="loading-progress">
        <div class="loading-progress-meta">
          <span>{$loading.progress >= 1 ? $t('loading.ready') : $t('loading.enter')}</span>
          <span class="mono">{progressPercent}%</span>
        </div>
        <div
          class="loading-bar"
          role="progressbar"
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow={progressPercent}
        >
          <div class="loading-bar-fill" style={`width: ${progressPercent}%`}></div>
        </div>
      </div>

      <div class="hairline"></div>

      <div class="loading-tips">
        <span class="hud-label">{$t('loading.tipsTitle')}</span>
        <ul>
          {#each tips as tip (tip)}
            <li>{$t(tip)}</li>
          {/each}
        </ul>
      </div>

      <p class="loading-slow">{$t('loading.slow')}</p>
      {/if}
    </section>
  </div>

  <footer class="loading-footer">
    <span>{$t('meta.studio')}</span>
    <span class="mono">{$t('common.version', { version: 'M2' })}</span>
    <span>{$t('meta.cleanRoom')}</span>
  </footer>
</div>
