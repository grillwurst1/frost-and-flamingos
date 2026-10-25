<script lang="ts">
  import { phase, toast } from '../state/game';
  import { t } from '../state/locale';

  // In game the clock medallion owns the top centre, so the toast drops below it.
  $: inGame = $phase === 'playing' || $phase === 'paused';
</script>

{#if $toast}
  <div class="toast-stack" class:is-in-game={inGame} role="status">
    <div class="toast">{$t($toast.key, $toast.params)}</div>
  </div>
{/if}
