<script lang="ts">
  import { connection, damageFlash, deathState, interactionPrompt, localPlayer, wardrobeOpen } from '../state/game';
  import { t } from '../state/locale';
  import ClockMedallion from './hud/ClockMedallion.svelte';
  import ComicEvents from './hud/ComicEvents.svelte';
  import ComicPops from './hud/ComicPops.svelte';
  import Crosshair from './hud/Crosshair.svelte';
  import DeathScreen from './hud/DeathScreen.svelte';
  import IdentityChip from './hud/IdentityChip.svelte';
  import Pictogram from './icons/Pictogram.svelte';
  import KillFeed from './hud/KillFeed.svelte';
  import Scoreboard from './hud/Scoreboard.svelte';
  import MascotHud from './MascotHud.svelte';
  import DrifterHud from './DrifterHud.svelte';
  import StatusBar from './hud/StatusBar.svelte';
  import WeaponDock from './hud/WeaponDock.svelte';

  $: player = $localPlayer;
  // Mascots carry no firearms: MascotHud shows their portrait, vitality and moves.
  $: isMascot = player?.classId === 'mascot';
  // Drifters carry nothing: no crosshair, no dock, no skills; DrifterHud shows her aura.
  $: isDrifter = player?.classId === 'drifter';
  $: dead = $deathState !== null;
  $: maxHp = Math.max(1, player?.maxHp ?? 100);
  $: lowHealth = !!player && player.alive && !isDrifter && (player.hp / maxHp) * 100 <= 30;
  $: offline = $connection.status !== 'connected';
  $: connectionLabel =
    $connection.status === 'reconnecting'
      ? $t('hud.reconnecting')
      : $connection.status === 'connecting'
        ? $t('common.connecting')
        : $t('common.offline');
</script>

<!-- The wardrobe can open from the pause menu: hide (not unmount) the HUD so it keeps its
     timers and probes but never shows through the fitting room. -->
<div class="hud-root" class:is-dead={dead} class:is-covered={$wardrobeOpen} aria-live="polite">
  <!-- Comic ink vignettes: hit flash, low-health pulse and the death wash. -->
  <div class="hud-vignette hud-vignette-damage" style={`opacity:${Math.min(1, $damageFlash * 0.95)}`} aria-hidden="true"></div>
  <div class="hud-vignette hud-vignette-low" class:is-active={lowHealth} aria-hidden="true"></div>
  <div class="hud-vignette hud-vignette-death" class:is-active={dead} aria-hidden="true"></div>

  <ClockMedallion />
  <IdentityChip />
  <KillFeed />

  {#if offline}
    <div class="hud-offline" role="status">
      <span class="status-dot" data-state={$connection.status}></span>
      {connectionLabel}
    </div>
  {/if}

  {#if !dead && !isMascot && !isDrifter}
    <Crosshair />
  {/if}
  <ComicPops />
  <ComicEvents />

  {#if $interactionPrompt}
    <div class="hud-interaction-prompt" class:has-icon={!!$interactionPrompt.icon}>
      {#if $interactionPrompt.icon}
        <span class="prompt-tile"><Pictogram tile={$interactionPrompt.icon} painted /></span>
      {/if}
      <kbd>F</kbd>
      <span>{$t($interactionPrompt.key, $interactionPrompt.params)}</span>
    </div>
  {/if}

  <StatusBar />
  {#if isMascot}
    <MascotHud />
  {:else if isDrifter}
    <DrifterHud />
  {:else}
    <WeaponDock />
  {/if}

  <div class="hud-controls-hint" aria-hidden="true">
    <span class="hint-title">{$t('hud.controlsHintTitle')}</span>
    {#if isDrifter}
      <span><kbd>{$t('drifter.controls.walkKey')}</kbd> {$t('drifter.controls.hint')}</span>
    {:else if isMascot}
      <span><kbd>{$t('mascot.controls.movesKey')}</kbd> {$t('mascot.controls.moves')}</span>
    {:else}
      <span><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> {$t('combat.weapon')}</span>
      <span><kbd>Q</kbd><kbd>E</kbd><kbd>T</kbd> {$t('combat.skills')}</span>
      <span><kbd>R</kbd> {$t('combat.reloadShort')}</span>
      <span><kbd>F</kbd> {$t('combat.interactShort')}</span>
    {/if}
  </div>

  <Scoreboard />
  <DeathScreen />
</div>
