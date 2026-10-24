<script lang="ts">
  import { onMount } from 'svelte';
  import { GameClient } from './engine/GameClient';
  import { appError, debugVisible, phase } from './state/game';
  import { t } from './state/locale';
  import DebugPanel from './components/DebugPanel.svelte';
  import ErrorScreen from './components/ErrorScreen.svelte';
  import Hud from './components/Hud.svelte';
  import LanguageSwitcher from './components/LanguageSwitcher.svelte';
  import LoadingScreen from './components/LoadingScreen.svelte';
  import MainMenu from './components/MainMenu.svelte';
  import PauseMenu from './components/PauseMenu.svelte';
  import Toast from './components/Toast.svelte';

  let canvas: HTMLCanvasElement | undefined;
  let game: GameClient | undefined;

  onMount(() => {
    if (!canvas) return;
    const client = new GameClient(canvas);
    game = client;
    void client.init();
    return () => {
      client.dispose();
      game = undefined;
    };
  });
</script>

<canvas bind:this={canvas} class="game-canvas" aria-label={$t('meta.title')}></canvas>

<div class="fixed right-3 top-3 z-50 sm:right-5 sm:top-5">
  <LanguageSwitcher />
</div>

{#if $phase === 'booting'}
  <LoadingScreen />
{/if}

{#if $phase === 'menu'}
  <MainMenu onPlay={() => game?.startPlaying()} />
{/if}

{#if $phase === 'playing' || $phase === 'paused'}
  <Hud />
{/if}

{#if $phase === 'paused'}
  <PauseMenu onResume={() => game?.startPlaying()} onMenu={() => game?.returnToMenu()} />
{/if}

{#if $phase === 'error' || $appError}
  <ErrorScreen />
{/if}

{#if $debugVisible}
  <DebugPanel />
{/if}

<Toast />
