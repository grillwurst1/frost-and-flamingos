<script lang="ts">
  import { WEAPON_STATS } from '@frost-and-flamingos/shared';
  import { hitMarker, localPlayer } from '../../state/game';

  $: player = $localPlayer;
  $: weapon = player ? WEAPON_STATS[player.weaponId] : WEAPON_STATS.smg;
  $: speed = player ? Math.hypot(player.velocity.x, player.velocity.z) : 0;
  $: gap = Math.round(5 + weapon.spread * 640 + Math.min(8, speed * 0.55) + (player?.grounded ? 0 : 3));
</script>

<div
  class="crosshair-hud"
  class:is-reloading={player?.reloading}
  style={`--gap:${gap}`}
  aria-hidden="true"
>
  <span class="ch-dot"></span>
  <span class="ch-line is-top"></span>
  <span class="ch-line is-right"></span>
  <span class="ch-line is-bottom"></span>
  <span class="ch-line is-left"></span>
</div>

{#if $hitMarker}
  {#key $hitMarker.id}
    <div
      class="hit-marker"
      class:is-headshot={$hitMarker.headshot}
      class:is-kill={$hitMarker.kill}
      aria-hidden="true"
    >
      <span></span><span></span><span></span><span></span>
    </div>
  {/key}
{/if}
