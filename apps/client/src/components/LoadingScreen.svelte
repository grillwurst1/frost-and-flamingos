<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import type { TranslationKey } from '@frost-and-flamingos/shared';
  import { loading, localPlayer } from '../state/game';
  import { factionClassNameKey, factionNameKey } from '../state/labels';
  import { t } from '../state/locale';
  import CoverLogo from './CoverLogo.svelte';
  import Crest from './icons/Crest.svelte';
  import { sceneUrl } from './icons/painted';

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

  const TIPS: TranslationKey[] = [
    'loading.tipWardrobe',
    'loading.tipMovement',
    'loading.tipParachute',
    'loading.tipMultiplayer',
    'loading.tipHeadshot',
    'loading.tipSkills',
    'loading.tipGimmick',
    'loading.tipWater',
    'loading.tipKillcam',
    'loading.tipTaunt',
    'loading.tipCheese',
    'loading.tipReload',
  ];

  const SCENE_COUNT = 8;
  const TIP_SECONDS = 5.5;

  // One painted backdrop and a random first tip per load.
  const scene = 1 + Math.floor(Math.random() * SCENE_COUNT);
  let tipIndex = Math.floor(Math.random() * TIPS.length);
  let timer: ReturnType<typeof setInterval> | undefined;

  onMount(() => {
    timer = setInterval(() => {
      tipIndex = (tipIndex + 1 + Math.floor(Math.random() * (TIPS.length - 1))) % TIPS.length;
    }, TIP_SECONDS * 1000);
  });

  onDestroy(() => {
    if (timer) clearInterval(timer);
  });

  $: deploying = mode === 'deploy';
  $: player = $localPlayer;
  $: progressPercent = Math.round($loading.progress * 100);
  $: rendererLabel =
    $loading.renderer === 'webgpu'
      ? $t('hud.webgpu')
      : $loading.renderer === 'webgl2'
        ? $t('hud.webgl2')
        : $t('common.loading');
  $: tip = TIPS[tipIndex] ?? TIPS[0] ?? 'loading.tipWardrobe';
</script>

<div class="loading-screen">
  <div class="loading-art" style={`background-image:url(${sceneUrl(scene)})`} aria-hidden="true"></div>
  <div class="loading-shade" aria-hidden="true"></div>

  <div class="loading-brand">
    <CoverLogo />
  </div>

  <div class="loading-versus" aria-hidden="true">
    <div class="versus-side">
      <Crest faction="alpine" />
      <span>{$t('loading.coverAlpine')}</span>
    </div>
    <b>{$t('hud.versus')}</b>
    <div class="versus-side">
      <Crest faction="lagoon" />
      <span>{$t('loading.coverLagoon')}</span>
    </div>
  </div>

  <div class="loading-bottom">
    <div class="loading-head">
      <svg class="taler" viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r="46" fill="#f4b72e" stroke="#1b1410" stroke-width="5" />
        <circle cx="50" cy="50" r="38" fill="#ffd96e" stroke="#a8751a" stroke-width="3" />
        <circle cx="50" cy="50" r="33" fill="none" stroke="#1b1410" stroke-width="2" stroke-dasharray="3 3.4" />
        <path d="M27 66 L27 40 L39 53 L50 33 L61 53 L73 40 L73 66 Z" fill="#f4b72e" stroke="#1b1410" stroke-width="4" stroke-linejoin="round" />
        <rect x="27" y="62" width="46" height="9" rx="3" fill="#e0952a" stroke="#1b1410" stroke-width="4" />
        <circle cx="27" cy="38" r="4.4" fill="#ff5a7a" stroke="#1b1410" stroke-width="2.6" />
        <circle cx="50" cy="31" r="4.8" fill="#6bd7ff" stroke="#1b1410" stroke-width="2.6" />
        <circle cx="73" cy="38" r="4.4" fill="#ff5a7a" stroke="#1b1410" stroke-width="2.6" />
        <path d="M22 36 A32 32 0 0 1 44 18" fill="none" stroke="#fff6c8" stroke-width="4" stroke-linecap="round" opacity="0.85" />
      </svg>
      <div class="loading-headline">
        <h2 class="display">{$t(deploying ? 'loading.deployTitle' : 'loading.title')}</h2>
        <span class="loading-sub">{$t(deploying ? 'loading.deployEyebrow' : 'loading.subtitle')}</span>
      </div>
      <span class="loading-percent mono">{deploying ? '' : `${progressPercent}%`}</span>
    </div>

    {#if deploying}
      <div class="stripe-bar is-indeterminate" role="progressbar" aria-label={$t('loading.deployTitle')}>
        <div class="stripe-fill"></div>
      </div>
      <div class="loading-chips">
        <span class="loading-chip"><b>{$t('loading.deployDestination')}</b> {$t('world.mapName')}</span>
        {#if player}
          <span class="loading-chip">
            <b>{$t('loading.deployAssignment')}</b>
            {$t(factionNameKey(player.faction))} · {$t(factionClassNameKey(player.faction, player.classId))}
          </span>
        {/if}
        <span class="loading-chip is-live">{$t('loading.deployStatus')}</span>
      </div>
    {:else}
      <div
        class="stripe-bar"
        role="progressbar"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow={progressPercent}
        aria-label={$loading.progress >= 1 ? $t('loading.ready') : $t('loading.enter')}
      >
        <div class="stripe-fill" style={`width:${progressPercent}%`}></div>
      </div>
      <div class="loading-chips">
        {#each steps as step (step.id)}
          <span
            class="loading-chip"
            data-active={$loading[step.id] === 'active'}
            data-done={$loading[step.id] === 'done'}
            data-failed={$loading[step.id] === 'failed'}
          >
            <i class="step-icon" aria-hidden="true">
              {#if $loading[step.id] === 'done'}
                <svg viewBox="0 0 16 16"><path d="M3 8.5 L6.6 12 L13 4.5" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" /></svg>
              {:else if $loading[step.id] === 'failed'}
                <svg viewBox="0 0 16 16"><path d="M8 3 V9 M8 12.3 V12.6" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" /></svg>
              {/if}
            </i>
            {$t(step.labelKey)}
          </span>
        {/each}
        <span class="loading-chip is-renderer">{rendererLabel}</span>
      </div>
    {/if}

    <aside class="loading-tip paper">
      <span class="tip-label">{$t('loading.tipsTitle')}</span>
      {#key tip}
        <p>{$t(deploying ? 'loading.deployHint' : tip)}</p>
      {/key}
    </aside>
  </div>
</div>
