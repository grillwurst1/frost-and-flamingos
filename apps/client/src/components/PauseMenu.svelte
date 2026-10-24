<script lang="ts">
  import { connection } from '../state/game';
  import { t } from '../state/locale';
  import AudioSettings from './AudioSettings.svelte';
  import ControlsList from './ControlsList.svelte';

  export let onResume: () => void;
  export let onMenu: () => void;
  export let onWardrobe: () => void;

  let showControls = false;
  let showAudio = false;

  $: connected = $connection.status === 'connected';
  $: statusLabelKey =
    $connection.status === 'connected'
      ? ('common.connected' as const)
      : $connection.status === 'reconnecting'
        ? ('hud.reconnecting' as const)
        : $connection.status === 'connecting'
          ? ('common.connecting' as const)
          : ('common.offline' as const);
</script>

<div class="fixed inset-0 z-30 grid place-items-center p-4 sm:p-6">
  <div class="overlay-scrim"></div>
  <section class="pause-panel glass-strong relative max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto p-6 sm:p-8">
    <div class="mb-4 flex items-center justify-between gap-3">
      <span class="eyebrow">{$t('menu.pausedEyebrow')}</span>
      <span class="hud-chip">
        <span class="status-dot" data-state={$connection.status}></span>
        {$t(statusLabelKey)}
      </span>
    </div>

    <h2 class="display text-5xl text-white">{$t('menu.pausedTitle')}</h2>
    <p class="mt-3 max-w-xl text-[0.8rem] leading-relaxed text-glacier-200/65">{$t('menu.pausedBody')}</p>

    <div class="pause-actions mt-6">
      <button class="btn-primary" type="button" disabled={!connected} on:click={onResume}>
        <span aria-hidden="true">▶</span>
        {$t('menu.resume')}
      </button>
      <button class="btn-ghost" type="button" on:click={onWardrobe}>
        {$t('menu.wardrobe')}
      </button>
      <button class="btn-ghost" type="button" on:click={onMenu}>
        {$t('menu.mainMenu')}
      </button>
    </div>
    <p class="mt-2 text-[0.66rem] leading-relaxed text-glacier-200/45">{$t('menu.resumeHint')}</p>

    <div class="hairline my-5"></div>

    <div class="mb-3 flex items-center justify-between gap-3">
      <h3 class="font-display text-base font-black uppercase tracking-[0.05em] text-white">
        {$t('menu.controlsTitle')}
      </h3>
      <button
        class="btn-ghost"
        type="button"
        aria-expanded={showControls}
        on:click={() => (showControls = !showControls)}
      >
        {showControls ? $t('menu.controlsClose') : $t('menu.controlsOpen')}
      </button>
    </div>
    <p class="mb-3 text-[0.7rem] leading-relaxed text-glacier-200/50">{$t('menu.controlsBody')}</p>
    {#if showControls}
      <ControlsList />
    {/if}

    <div class="hairline my-5"></div>

    <div class="mb-3 flex items-center justify-between gap-3">
      <h3 class="font-display text-base font-black uppercase tracking-[0.05em] text-white">
        {$t('audio.title')}
      </h3>
      <button class="btn-ghost" type="button" aria-expanded={showAudio} on:click={() => (showAudio = !showAudio)}>
        {showAudio ? $t('common.close') : $t('menu.settings')}
      </button>
    </div>
    {#if showAudio}
      <AudioSettings />
    {/if}

    <div class="mt-5 flex flex-wrap items-center gap-2 text-[0.62rem] text-glacier-200/45">
      <span class="hud-chip">{$t('menu.serverLabel')}</span>
      <span class="hud-chip mono">{$t('menu.tickRate')}</span>
      <span class="hud-chip mono">{$t('menu.physicsRate')}</span>
    </div>
    <p class="mt-3 text-[0.64rem] leading-relaxed text-glacier-200/35">{$t('menu.escapeHint')}</p>
  </section>
</div>
