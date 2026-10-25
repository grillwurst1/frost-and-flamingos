<script lang="ts">
  import { connection } from '../state/game';
  import { t } from '../state/locale';
  import AudioSettings from './AudioSettings.svelte';
  import ControlsList from './ControlsList.svelte';
  import GraphicsSettings from './GraphicsSettings.svelte';
  import ComicText from './hud/ComicText.svelte';

  export let onResume: () => void;
  export let onMenu: () => void;
  export let onWardrobe: () => void;

  let showControls = false;
  let showAudio = false;
  let showGraphics = false;

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

<div class="overlay-center">
  <div class="overlay-scrim"></div>
  <section class="pause-panel paper">
    <div class="paper-rail"></div>
    <div class="panel-inner">
      <div class="panel-top">
        <span class="eyebrow">{$t('menu.pausedEyebrow')}</span>
        <span class="hud-chip">
          <span class="status-dot" data-state={$connection.status}></span>
          {$t(statusLabelKey)}
        </span>
      </div>

      <h2 class="panel-title"><ComicText text={$t('menu.pausedTitle')} variant="gold" /></h2>
      <p class="panel-lead">{$t('menu.pausedBody')}</p>

      <div class="pause-actions">
        <button class="btn-primary" type="button" disabled={!connected} on:click={onResume}>
          <svg class="btn-play-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 3 L21 12 L6 21 Z" fill="#1b1410" />
          </svg>
          {$t('menu.resume')}
        </button>
        <button class="btn-ghost" type="button" on:click={onWardrobe}>
          {$t('menu.wardrobe')}
        </button>
        <button class="btn-ghost" type="button" on:click={onMenu}>
          {$t('menu.mainMenu')}
        </button>
      </div>
      <p class="field-hint">{$t('menu.resumeHint')}</p>

      <div class="hairline panel-gap"></div>

      <div class="panel-row">
        <h3>{$t('menu.controlsTitle')}</h3>
        <button class="btn-ghost" type="button" aria-expanded={showControls} on:click={() => (showControls = !showControls)}>
          {showControls ? $t('menu.controlsClose') : $t('menu.controlsOpen')}
        </button>
      </div>
      <p class="field-hint">{$t('menu.controlsBody')}</p>
      {#if showControls}
        <ControlsList />
      {/if}

      <div class="hairline panel-gap"></div>

      <div class="panel-row">
        <h3>{$t('audio.title')}</h3>
        <button class="btn-ghost" type="button" aria-expanded={showAudio} on:click={() => (showAudio = !showAudio)}>
          {showAudio ? $t('common.close') : $t('menu.settings')}
        </button>
      </div>
      {#if showAudio}
        <AudioSettings />
      {/if}

      <div class="hairline panel-gap"></div>

      <div class="panel-row">
        <h3>{$t('graphics.title')}</h3>
        <button class="btn-ghost" type="button" aria-expanded={showGraphics} on:click={() => (showGraphics = !showGraphics)}>
          {showGraphics ? $t('common.close') : $t('menu.settings')}
        </button>
      </div>
      {#if showGraphics}
        <GraphicsSettings />
      {/if}

      <div class="panel-chips">
        <span class="hud-chip">{$t('menu.serverLabel')}</span>
        <span class="hud-chip mono">{$t('menu.tickRate')}</span>
        <span class="hud-chip mono">{$t('menu.physicsRate')}</span>
      </div>
      <p class="field-hint">{$t('menu.escapeHint')}</p>
    </div>
  </section>
</div>
