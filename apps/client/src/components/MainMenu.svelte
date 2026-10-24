<script lang="ts">
  import { connection } from '../state/game';
  import { t } from '../state/locale';
  import { factionMottoKey } from '../state/labels';
  import ControlsList from './ControlsList.svelte';

  export let onPlay: () => void;

  let showControls = false;

  $: connected = $connection.status === 'connected';
  $: titleParts = $t('meta.title').split('&');
  $: statusLabel =
    $connection.status === 'connected'
      ? $t('common.connected')
      : $connection.status === 'reconnecting'
        ? $t('hud.reconnecting')
        : $connection.status === 'connecting'
          ? $t('common.connecting')
          : $t('common.offline');

  function reconnect(): void {
    window.location.reload();
  }
</script>

<div class="fixed inset-0 z-20">
  <div class="overlay-scrim"></div>
  <div class="menu-shell">
    <section class="menu-panel glass">
      <div class="mb-5 flex flex-wrap items-center justify-between gap-3">
        <span class="eyebrow">{$t('menu.eyebrow')}</span>
        <span class="hud-chip mono text-[0.58rem]">{$t('menu.buildLabel')}</span>
      </div>

      <div class="mb-6">
        <p class="mb-1 text-[0.68rem] font-extrabold uppercase tracking-[0.24em] text-glacier-200/60">
          {$t('meta.season')}
        </p>
        <h1 class="display text-[clamp(3.5rem,8vw,6.5rem)] text-white">
          {titleParts[0]?.trim() ?? $t('meta.title')}
          {#if titleParts.length > 1}<span class="text-fondue-400">&amp;</span>{/if}
          {titleParts[1]?.trim() ?? ''}
        </h1>
        <p class="mt-3 font-display text-[clamp(1.3rem,2.6vw,2rem)] font-black uppercase tracking-[0.04em] text-glacier-200">
          {$t('meta.subtitle')}
        </p>
      </div>

      <p class="mb-5 max-w-xl text-[0.9rem] leading-relaxed text-glacier-100/90">
        {$t('menu.lead')}
      </p>
      <p class="mb-6 max-w-xl text-[0.78rem] leading-relaxed text-glacier-200/60">
        {$t('menu.body')}
      </p>

      <div class="mb-4 flex flex-wrap items-center gap-2">
        <span class="hud-chip"><span class="status-dot" data-state={$connection.status}></span>{statusLabel}</span>
        <span class="hud-chip">{$t('menu.serverLabel')}</span>
        <span class="hud-chip mono">{$t('menu.tickRate')}</span>
        <span class="hud-chip mono">{$t('menu.physicsRate')}</span>
      </div>

      <button class="btn-primary w-full sm:w-auto" type="button" disabled={!connected} on:click={onPlay}>
        <span aria-hidden="true">▶</span>
        {$t('menu.playNow')}
      </button>
      <p class="mt-2 text-[0.68rem] leading-relaxed text-glacier-200/55">
        {connected ? $t('menu.playHint') : $t('menu.waitingForServer')}
      </p>

      {#if !connected}
        <div class="mt-4 rounded-lg border border-coral-400/30 bg-coral-500/10 p-3">
          <p class="text-[0.74rem] leading-relaxed text-coral-300">
            {$t('menu.serverOfflineHint')}
          </p>
          <button class="btn-ghost mt-3" type="button" on:click={reconnect}>
            {$t('menu.reconnect')}
          </button>
        </div>
      {/if}

      <div class="hairline my-6"></div>

      <div class="mb-3 flex items-center justify-between gap-3">
        <h2 class="font-display text-lg font-black uppercase tracking-[0.04em] text-white">
          {$t('menu.controlsTitle')}
        </h2>
        <button class="btn-ghost" type="button" aria-expanded={showControls} on:click={() => (showControls = !showControls)}>
          {showControls ? $t('menu.controlsClose') : $t('menu.controlsOpen')}
        </button>
      </div>
      <p class="mb-3 text-[0.72rem] leading-relaxed text-glacier-200/55">{$t('menu.controlsBody')}</p>
      {#if showControls}
        <ControlsList />
      {/if}

      <div class="mt-6 grid gap-2 sm:grid-cols-3">
        <div class="feature-card">
          <strong>{$t('menu.featureMovement')}</strong>
          <span>{$t('menu.featureMovementBody')}</span>
        </div>
        <div class="feature-card">
          <strong>{$t('menu.featureMultiplayer')}</strong>
          <span>{$t('menu.featureMultiplayerBody')}</span>
        </div>
        <div class="feature-card">
          <strong>{$t('menu.featureMap')}</strong>
          <span>{$t('menu.featureMapBody')}</span>
        </div>
      </div>

      <div class="mt-5 rounded-lg border border-fondue-400/20 bg-fondue-400/[0.06] p-3">
        <p class="text-[0.7rem] font-extrabold uppercase tracking-[0.12em] text-fondue-300">
          {$t('menu.m1Title')}
        </p>
        <p class="mt-1 text-[0.72rem] leading-relaxed text-glacier-200/60">{$t('menu.m1Body')}</p>
        <p class="mt-2 text-[0.68rem] leading-relaxed text-glacier-200/45">{$t('menu.nextMilestone')}</p>
      </div>

      <p class="mt-5 text-[0.64rem] leading-relaxed text-glacier-200/35">
        {$t('menu.footer')} · {$t('meta.cleanRoom')}
      </p>
    </section>

    <aside class="menu-aside">
      <div class="menu-aside-card glass-strong">
        <span class="eyebrow mb-2">{$t('meta.badge')}</span>
        <h3>{$t('meta.tagline')}</h3>
        <p>{$t('menu.playersOnline', { count: $connection.playersOnline })}</p>
        <div class="hairline my-3"></div>
        <dl class="space-y-2 text-[0.7rem]">
          <div>
            <dt class="text-[0.55rem] font-extrabold uppercase tracking-[0.16em] text-glacier-300">{$t('factions.alpine.short')}</dt>
            <dd class="mt-0.5 leading-relaxed text-glacier-100/70">{$t(factionMottoKey('alpine'))}</dd>
          </div>
          <div>
            <dt class="text-[0.55rem] font-extrabold uppercase tracking-[0.16em] text-lagoon-300">{$t('factions.lagoon.short')}</dt>
            <dd class="mt-0.5 leading-relaxed text-glacier-100/70">{$t(factionMottoKey('lagoon'))}</dd>
          </div>
        </dl>
        <div class="hairline my-3"></div>
        <p class="mono text-[0.62rem] leading-relaxed text-glacier-200/45">
          {$t('hud.playerCount', { count: $connection.playersOnline, max: $connection.maxPlayers })}
        </p>
        <p class="mt-2 text-[0.62rem] leading-relaxed text-glacier-200/45">{$t('menu.escapeHint')}</p>
      </div>
    </aside>
  </div>
</div>
