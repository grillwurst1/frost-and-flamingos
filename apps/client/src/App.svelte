<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { GameClient } from './engine/GameClient';
  import { audio } from './audio/synth';
  import { appError, debugVisible, phase, wardrobeOpen } from './state/game';
  import { t } from './state/locale';
  import DebugPanel from './components/DebugPanel.svelte';
  import ErrorScreen from './components/ErrorScreen.svelte';
  import Hud from './components/Hud.svelte';
  import LanguageSwitcher from './components/LanguageSwitcher.svelte';
  import LoadingScreen from './components/LoadingScreen.svelte';
  import MainMenu from './components/MainMenu.svelte';
  import PauseMenu from './components/PauseMenu.svelte';
  import Toast from './components/Toast.svelte';
  import Wardrobe from './components/Wardrobe.svelte';

  let canvas: HTMLCanvasElement | undefined;
  let game: GameClient | undefined;

  function openWardrobe(): void {
    wardrobeOpen.set(true);
    audio.playUi('confirm');
  }

  function closeWardrobe(): void {
    wardrobeOpen.set(false);
    audio.playUi('back');
  }

  function handleGlobalClick(event: MouseEvent): void {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest('button');
    if (!button || button.hasAttribute('disabled')) return;
    if (button.closest('[data-custom-sound]')) return;
    audio.playUi('click');
  }

  function handleGlobalKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || !get(wardrobeOpen)) return;
    event.preventDefault();
    closeWardrobe();
  }

  onMount(() => {
    if (!canvas) return;
    const client = new GameClient(canvas);
    game = client;
    // Development-only handle for playtest automation and console debugging.
    // It is stripped from production builds by Vite's dead-code elimination.
    if (import.meta.env.DEV) {
      (window as unknown as { __frostDebug?: GameClient }).__frostDebug = client;
    }
    void client.init();
    window.addEventListener('click', handleGlobalClick);
    window.addEventListener('keydown', handleGlobalKeydown);
    return () => {
      window.removeEventListener('click', handleGlobalClick);
      window.removeEventListener('keydown', handleGlobalKeydown);
      client.dispose();
      game = undefined;
    };
  });
</script>

<canvas bind:this={canvas} class="game-canvas" aria-label={$t('meta.title')}></canvas>

<!-- Menu, loading and pause only: during play the top-right corner belongs to the kill feed. -->
{#if !$wardrobeOpen && $phase !== 'playing'}
  <div class="lang-dock">
    <LanguageSwitcher />
  </div>
{/if}

{#if $phase === 'booting' || $phase === 'deploying'}
  <LoadingScreen mode={$phase === 'deploying' ? 'deploy' : 'boot'} />
{/if}

{#if $phase === 'menu' && !$wardrobeOpen}
  <MainMenu onPlay={() => game?.startPlaying()} onWardrobe={openWardrobe} />
{/if}

{#if $phase === 'playing' || $phase === 'paused'}
  <Hud />
{/if}

{#if $phase === 'paused' && !$wardrobeOpen}
  <PauseMenu
    onResume={() => game?.startPlaying()}
    onMenu={() => game?.returnToMenu()}
    onWardrobe={openWardrobe}
  />
{/if}

{#if $wardrobeOpen}
  <Wardrobe onClose={closeWardrobe} />
{/if}

{#if $phase === 'error' || $appError}
  <ErrorScreen />
{/if}

{#if $debugVisible}
  <DebugPanel />
{/if}

<Toast />
