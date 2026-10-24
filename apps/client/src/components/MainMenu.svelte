<script lang="ts">
  import { connection } from '../state/game';
  import { profile } from '../state/profile';
  import { t } from '../state/locale';
  import {
    factionClassNameKey,
    factionMottoKey,
    factionShortKey,
  } from '../state/labels';
  import AudioSettings from './AudioSettings.svelte';
  import ControlsList from './ControlsList.svelte';

  export let onPlay: () => void;
  export let onWardrobe: () => void;

  let showControls = false;
  let showSettings = false;

  $: connected = $connection.status === 'connected';
  $: titleParts = $t('meta.title').split('&');
  $: frostWord = titleParts[0]?.trim() ?? $t('meta.title');
  $: flamingoWord = titleParts[1]?.trim() ?? '';
  $: statusLabelKey =
    $connection.status === 'connected'
      ? 'common.connected' as const
      : $connection.status === 'reconnecting'
        ? 'hud.reconnecting' as const
        : $connection.status === 'connecting'
          ? 'common.connecting' as const
          : 'common.offline' as const;

  function reconnect(): void {
    window.location.reload();
  }
</script>

<div class="cover-screen">
  <div class="cover-split" aria-hidden="true">
    <div class="cover-alpine"></div>
    <div class="cover-lagoon"></div>
    <div class="cover-seam"></div>
    <div class="cover-sun"></div>
    <div class="cover-peaks"></div>
    <div class="cover-waves"></div>
  </div>
  <div class="cover-grain" aria-hidden="true"></div>

  <div class="cover-shell">
    <section class="cover-menu">
      <div class="cover-topline">
        <span class="cover-season">{$t('meta.season')}</span>
        <span class="hud-chip">{$t('menu.buildLabel')}</span>
      </div>

      <h1 class="cover-title">
        <span class="cover-title-frost">{frostWord}</span>
        {#if flamingoWord}<span class="cover-title-amp">&amp;</span>{/if}
        {#if flamingoWord}<span class="cover-title-flamingo">{flamingoWord}</span>{/if}
      </h1>
      <p class="cover-subtitle">{$t('meta.subtitle')}</p>
      <p class="cover-tagline">{$t('meta.tagline')}</p>

      <p class="cover-lead">{$t('menu.lead')}</p>

      <div class="cover-actions">
        <button class="btn-primary cover-play" type="button" disabled={!connected} on:click={onPlay}>
          <span aria-hidden="true">▶</span>
          {$t('menu.playNow')}
        </button>
        <button class="btn-ghost" type="button" on:click={onWardrobe}>
          {$t('menu.wardrobe')}
        </button>
        <button
          class="btn-ghost"
          type="button"
          aria-pressed={showSettings}
          on:click={() => (showSettings = !showSettings)}
        >
          {$t('menu.settings')}
        </button>
      </div>
      <p class="cover-hint">{$t(connected ? 'menu.playHint' : 'menu.waitingForServer')}</p>

      {#if !connected}
        <div class="cover-offline">
          <p>{$t('menu.serverOfflineHint')}</p>
          <button class="btn-ghost" type="button" on:click={reconnect}>
            {$t('menu.reconnect')}
          </button>
        </div>
      {/if}

      {#if showSettings}
        <div class="cover-settings glass">
          <AudioSettings />
          <p class="field-hint">{$t('menu.audioBody')}</p>
        </div>
      {/if}

      <div class="cover-profile">
        <div>
          <span class="hud-label">{$t('menu.profileClass')}</span>
          <strong>{$t(factionClassNameKey($profile.faction, $profile.cosmetics.classId))}</strong>
        </div>
        <div>
          <span class="hud-label">{$t('menu.profileFaction')}</span>
          <strong>{$t(factionShortKey($profile.faction))}</strong>
        </div>
        <div>
          <span class="hud-label">{$t('menu.profileVoice')}</span>
          <strong class="mono">{Math.round((($profile.cosmetics.voicePitch - 0.8) / 0.45) * 100)}%</strong>
        </div>
      </div>
      <p class="cover-profile-hint">{$t('menu.factionPreferenceHint')}</p>

      <div class="cover-controls">
        <button
          class="btn-ghost"
          type="button"
          aria-expanded={showControls}
          on:click={() => (showControls = !showControls)}
        >
          {showControls ? $t('menu.controlsClose') : $t('menu.controlsOpen')}
        </button>
        {#if showControls}
          <ControlsList />
        {/if}
      </div>

      <p class="cover-footnote">
        {$t('menu.footer')} · {$t('meta.cleanRoom')} · {$t('menu.musicCredit')}
      </p>
    </section>

    <aside class="cover-aside">
      <div class="cover-status glass-strong">
        <div class="cover-status-head">
          <span class="eyebrow">{$t('menu.statusTitle')}</span>
          <span class="status-dot" data-state={$connection.status}></span>
        </div>
        <strong class="cover-status-line">{$t(statusLabelKey)}</strong>
        <p class="mono">{$t('menu.playersOnline', { count: $connection.playersOnline })}</p>
        <div class="hairline"></div>
        <dl class="cover-factions">
          <div>
            <dt>{$t('factions.alpine.short')}</dt>
            <dd>{$t(factionMottoKey('alpine'))}</dd>
          </div>
          <div>
            <dt>{$t('factions.lagoon.short')}</dt>
            <dd>{$t(factionMottoKey('lagoon'))}</dd>
          </div>
        </dl>
        <div class="hairline"></div>
        <div class="cover-status-meta">
          <span class="hud-chip">{$t('menu.serverLabel')}</span>
          <span class="hud-chip mono">{$t('menu.tickRate')}</span>
          <span class="hud-chip mono">{$t('menu.physicsRate')}</span>
        </div>
        <p class="cover-escape">{$t('menu.escapeHint')}</p>
      </div>
    </aside>
  </div>
</div>
