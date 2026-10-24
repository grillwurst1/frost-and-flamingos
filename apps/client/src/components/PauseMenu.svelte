<script lang="ts">
  import { connection } from '../state/game';
  import { t } from '../state/locale';
  import ControlsList from './ControlsList.svelte';

  export let onResume: () => void;
  export let onMenu: () => void;

  let showControls = false;

  $: connected = $connection.status === 'connected';
</script>

<div class="fixed inset-0 z-30 grid place-items-center p-4 sm:p-6">
  <div class="overlay-scrim"></div>
  <section class="pause-panel glass-strong relative max-h-[calc(100vh-2rem)] w-full max-w-xl overflow-y-auto p-6 sm:p-8">
    <div class="mb-4 flex items-center justify-between gap-3">
      <span class="eyebrow">{$t('menu.pausedEyebrow')}</span>
      <span class="hud-chip"><span class="status-dot" data-state={$connection.status}></span>
        {$connection.status === 'connected'
          ? $t('common.connected')
          : $connection.status === 'reconnecting'
            ? $t('hud.reconnecting')
            : $t('common.offline')}
      </span>
    </div>

    <h2 class="display text-5xl text-white">{$t('menu.pausedTitle')}</h2>
    <p class="mt-3 text-[0.8rem] leading-relaxed text-glacier-200/65">{$t('menu.pausedBody')}</p>

    <div class="mt-6 flex flex-col gap-2 sm:flex-row">
      <button class="btn-primary flex-1" type="button" disabled={!connected} on:click={onResume}>
        <span aria-hidden="true">▶</span>
        {$t('menu.resume')}
      </button>
      <button class="btn-ghost sm:min-w-[9rem]" type="button" on:click={onMenu}>
        {$t('menu.mainMenu')}
      </button>
    </div>
    <p class="mt-2 text-[0.66rem] leading-relaxed text-glacier-200/45">{$t('menu.resumeHint')}</p>

    <div class="hairline my-5"></div>

    <div class="mb-3 flex items-center justify-between gap-3">
      <h3 class="font-display text-base font-black uppercase tracking-[0.05em] text-white">
        {$t('menu.controlsTitle')}
      </h3>
      <button class="btn-ghost" type="button" aria-expanded={showControls} on:click={() => (showControls = !showControls)}>
        {showControls ? $t('menu.controlsClose') : $t('menu.controlsOpen')}
      </button>
    </div>
    <p class="mb-3 text-[0.7rem] leading-relaxed text-glacier-200/50">{$t('menu.controlsBody')}</p>
    {#if showControls}
      <ControlsList />
    {/if}

    <div class="mt-5 flex flex-wrap items-center gap-2 text-[0.62rem] text-glacier-200/45">
      <span class="hud-chip">{$t('menu.serverLabel')}</span>
      <span class="hud-chip mono">{$t('menu.tickRate')}</span>
      <span class="hud-chip mono">{$t('menu.physicsRate')}</span>
    </div>
    <p class="mt-3 text-[0.64rem] leading-relaxed text-glacier-200/35">{$t('menu.escapeHint')}</p>
  </section>
</div>
