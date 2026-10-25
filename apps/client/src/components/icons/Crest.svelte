<script lang="ts">
  import type { Faction } from '@frost-and-flamingos/shared';
  import { paintedTiles, probeTile, tileUrl } from './painted';

  /**
   * Faction crest. Uses the owner's painted crest when it loads and falls back to a small
   * inline SVG emblem (heater shield / roundel) on 404 or decode failure.
   */
  export let faction: Faction;

  $: tileId = faction === 'alpine' ? 'crest_alpine' : 'crest_lagoon';
  $: url = tileUrl(tileId);
  $: usePainted = !!url && $paintedTiles[tileId] === 'ok';
  $: probeTile(tileId);
</script>

{#if usePainted && url}
  <img class="crest is-painted" src={url} alt="" draggable="false" />
{:else}
<svg class="crest" viewBox="0 0 48 56" aria-hidden="true" focusable="false">
  {#if faction === 'alpine'}
    <path d="M24 3 L44 9 Q45 33 24 53 Q3 33 4 9 Z" fill="#2f7fd8" stroke="#1b1410" stroke-width="3" stroke-linejoin="round" />
    <path d="M24 8 L39 12.5 Q39.5 30 24 46 Q8.5 30 9 12.5 Z" fill="#6db8ff" stroke="#1b1410" stroke-width="2" stroke-linejoin="round" />
    <path d="M12 38 L22 18 L26 25 L30 20 L38 38 Z" fill="#ffffff" stroke="#1b1410" stroke-width="2.4" stroke-linejoin="round" />
    <path d="M22 18 L19 24 L23 22.5 L25 26 L26 25 Z" fill="#b9d3ec" stroke="#1b1410" stroke-width="1.2" stroke-linejoin="round" />
    <circle cx="24" cy="11" r="2.4" fill="#ffd23f" stroke="#1b1410" stroke-width="1.6" />
  {:else}
    <path d="M24 3 L44 9 Q45 33 24 53 Q3 33 4 9 Z" fill="#f0508c" stroke="#1b1410" stroke-width="3" stroke-linejoin="round" />
    <path d="M24 8 L39 12.5 Q39.5 30 24 46 Q8.5 30 9 12.5 Z" fill="#3fe0d0" stroke="#1b1410" stroke-width="2" stroke-linejoin="round" />
    <circle cx="31" cy="17" r="5" fill="#ffd23f" stroke="#1b1410" stroke-width="2" />
    <path d="M11 33 Q17 29 24 33 T38 33 L38 38 Q31 42 24 38 T11 38 Z" fill="#ffffff" stroke="#1b1410" stroke-width="2" stroke-linejoin="round" />
    <path d="M17 31 Q17 20 23 17" fill="none" stroke="#1b1410" stroke-width="3.6" stroke-linecap="round" />
    <path d="M17 31 Q17 20 23 17" fill="none" stroke="#2fb35a" stroke-width="1.8" stroke-linecap="round" />
    <path d="M23 17 Q16 14 12 18 Q17 17 21 20 M23 17 Q27 11 33 12 Q28 14 25 19" fill="#2fb35a" stroke="#1b1410" stroke-width="1.6" stroke-linejoin="round" />
  {/if}
</svg>
{/if}
