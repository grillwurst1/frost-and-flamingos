<script lang="ts">
  import type { TranslationKey } from '@frost-and-flamingos/shared';
  import { t } from '../state/locale';

  export let label: string;
  export let ids: readonly string[];
  export let value: string;
  export let onChange: (value: string) => void;
  export let nameKey: (value: string) => TranslationKey;
  export let swatch: ((value: string) => string) | undefined = undefined;

  $: index = Math.max(0, ids.indexOf(value));
  $: colour = swatch ? swatch(value) : null;

  function step(direction: number): void {
    if (ids.length === 0) return;
    const next = ids[(index + direction + ids.length) % ids.length];
    if (next) onChange(next);
  }
</script>

<div class="slot-row">
  <div class="slot-label">
    <span>{label}</span>
    {#if colour}
      <span class="slot-swatch" style={`background:${colour}`} aria-hidden="true"></span>
    {/if}
  </div>
  <div class="slot-control">
    <button class="slot-arrow" type="button" aria-label={$t('wardrobe.previous')} on:click={() => step(-1)}>
      ‹
    </button>
    <span class="slot-value">{$t(nameKey(value))}</span>
    <button class="slot-arrow" type="button" aria-label={$t('wardrobe.next')} on:click={() => step(1)}>
      ›
    </button>
  </div>
  <span class="slot-count mono">{$t('wardrobe.itemCount', { index: index + 1, count: ids.length })}</span>
</div>
