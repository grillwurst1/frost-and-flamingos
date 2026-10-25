<script lang="ts">
  import { onMount } from 'svelte';
  import { connection } from '../state/game';
  import { profile } from '../state/profile';
  import { t } from '../state/locale';
  import { factionClassNameKey, factionShortKey } from '../state/labels';
  import AudioSettings from './AudioSettings.svelte';
  import ControlsList from './ControlsList.svelte';
  import CoverLogo from './CoverLogo.svelte';
  import GraphicsSettings from './GraphicsSettings.svelte';
  import PaperModal from './PaperModal.svelte';
  import { COVER_URL, MENU_KEYART_URL, menuKeyart, probeMenuKeyart } from './icons/painted';

  export let onPlay: () => void;
  export let onWardrobe: () => void;

  let showControls = false;
  let showSettings = false;

  onMount(() => probeMenuKeyart());

  // The painted key art (no lettering) is preferred; the supplied cover poster is the fallback.
  // While the probe is still running the key-art layout is kept (art fading in), so the menu
  // never flashes the poster composition and then jumps.
  $: keyart = $menuKeyart !== 'missing';
  $: keyartReady = $menuKeyart === 'ok';
  $: connected = $connection.status === 'connected';
  $: statusLabelKey =
    $connection.status === 'connected'
      ? ('common.connected' as const)
      : $connection.status === 'reconnecting'
        ? ('hud.reconnecting' as const)
        : $connection.status === 'connecting'
          ? ('common.connecting' as const)
          : ('common.offline' as const);

  function reconnect(): void {
    window.location.reload();
  }
</script>

<div class="menu-screen" class:has-keyart={keyart}>
  <div class="menu-backdrop" aria-hidden="true">
    {#if keyart}
      <img class="menu-keyart" class:is-loading={!keyartReady} src={MENU_KEYART_URL} alt="" draggable="false" />
    {:else}
      <div class="menu-blur" style={`background-image:url(${COVER_URL})`}></div>
    {/if}
    <div class="menu-vignette"></div>
  </div>

  <div class="menu-layout">
    {#if !keyart}
      <figure class="menu-poster">
        <img src={COVER_URL} alt={`${$t('meta.title')} — ${$t('meta.subtitle')}`} draggable="false" />
        <span class="poster-badge">{$t('meta.badge')}</span>
      </figure>
    {/if}

    <section class="menu-stack">
      {#if keyart}
        <CoverLogo />
      {/if}

      <div class="menu-topline">
        <span class="menu-ticket-chip">{$t('meta.season')}</span>
        {#if keyart}<span class="menu-ticket-chip is-badge">{$t('meta.badge')}</span>{/if}
      </div>

      <p class="menu-lead">{$t('menu.lead')}</p>

      <div class="menu-actions">
        <button class="btn-primary cover-play" type="button" disabled={!connected} on:click={onPlay}>
          <svg class="btn-play-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 3 L21 12 L6 21 Z" fill="#1b1410" />
          </svg>
          {$t('menu.playNow')}
        </button>
        <div class="menu-actions-row">
          <button class="btn-ghost" type="button" on:click={onWardrobe}>
            {$t('menu.wardrobe')}
          </button>
          <button class="btn-ghost" type="button" on:click={() => (showSettings = true)}>
            {$t('menu.settings')}
          </button>
        </div>
      </div>
      {#if connected}
        <p class="menu-hint">{$t('menu.playHint')}</p>
      {:else}
        <div class="menu-offline paper">
          <p>{$t('menu.serverOfflineHint')}</p>
          <button class="btn-ghost" type="button" on:click={reconnect}>
            {$t('menu.reconnect')}
          </button>
        </div>
      {/if}

      <div class="menu-tickets" aria-label={$t('menu.profileTitle')}>
        <div class="menu-ticket">
          <span class="hud-label">{$t('menu.profileClass')}</span>
          <strong>{$t(factionClassNameKey($profile.faction, $profile.cosmetics.classId))}</strong>
        </div>
        <div class="menu-ticket">
          <span class="hud-label">{$t('menu.profileFaction')}</span>
          <strong>{$t(factionShortKey($profile.faction))}</strong>
        </div>
        <div class="menu-ticket">
          <span class="hud-label">{$t('menu.profileVoice')}</span>
          <strong class="mono">{Math.round((($profile.cosmetics.voicePitch - 0.8) / 0.45) * 100)}%</strong>
        </div>
      </div>
      <p class="menu-note">{$t('menu.factionPreferenceHint')}</p>

      <div class="menu-footer-row">
        <button class="btn-ghost" type="button" on:click={() => (showControls = true)}>
          {$t('menu.controlsOpen')}
        </button>
        <span class="menu-status" title={$t('menu.statusTitle')}>
          <span class="status-dot" data-state={$connection.status}></span>
          {$t(statusLabelKey)} · {$t('menu.playersOnline', { count: $connection.playersOnline })}
        </span>
      </div>

      <p class="menu-footnote">
        {$t('menu.footer')} · {$t('meta.cleanRoom')} · {$t('menu.musicCredit')}
      </p>
    </section>
  </div>

  {#if showSettings}
    <PaperModal title={$t('menu.settings')} onClose={() => (showSettings = false)}>
      <AudioSettings />
      <p class="field-hint">{$t('menu.audioBody')}</p>
      <div class="hairline panel-gap"></div>
      <GraphicsSettings />
    </PaperModal>
  {/if}

  {#if showControls}
    <PaperModal title={$t('menu.controlsTitle')} onClose={() => (showControls = false)}>
      <p class="field-hint modal-lead">{$t('menu.controlsBody')}</p>
      <ControlsList />
    </PaperModal>
  {/if}
</div>
