<script lang="ts">
  import { DRIFTER_TUNING, drifterFormForFaction, type Faction } from '@frost-and-flamingos/shared';
  import { t } from '../state/locale';
  import DrifterEmblem from './DrifterEmblem.svelte';

  /** Class-card extra for the drifter: the form of the selected side and her one-line rule. */
  export let faction: Faction;

  $: form = drifterFormForFaction(faction);
</script>

<span class="drifter-badge">
  <DrifterEmblem {form} size={40} />
  <span class="drifter-badge-text">
    <span class="drifter-badge-line">{$t('drifter.description')}</span>
    <small>
      {$t('drifter.classBadge')}<br />
      {$t('drifter.stats', { speed: DRIFTER_TUNING.walkSpeed.toFixed(1) })}
    </small>
  </span>
</span>

<style>
  :global(.class-card.is-drifter) {
    grid-column: 1 / -1;
  }

  .drifter-badge {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.2rem;
  }

  .drifter-badge-text {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    min-width: 0;
  }

  .drifter-badge-line {
    font-size: 0.8rem;
    font-weight: 700;
    font-style: italic;
  }

  .drifter-badge-text small {
    font-size: 0.68rem;
    line-height: 1.25;
    opacity: 0.9;
  }
</style>
