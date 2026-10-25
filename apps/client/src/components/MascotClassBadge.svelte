<script lang="ts">
  import { MASCOT_FORM_STATS, MASCOT_RAM } from '@frost-and-flamingos/shared';
  import { t } from '../state/locale';
  import MascotPortrait from './MascotPortrait.svelte';

  /** Class-card extra for the mascot: both forms with their faction. */
</script>

<span class="mascot-badge">
  <span class="mascot-badge-line">{$t('mascot.classBadge')}</span>
  <span class="mascot-badge-forms">
    <span class="mascot-badge-form">
      <MascotPortrait form="cow" size={40} />
      <small>
        {$t('mascot.forms.cow')}<br />
        {$t('mascot.stats', {
          hp: MASCOT_FORM_STATS.cow.maxHp,
          damage: Math.round(MASCOT_RAM.cow.maxDamage * MASCOT_RAM.cow.boostMultiplier),
        })}
      </small>
    </span>
    <span class="mascot-badge-form">
      <MascotPortrait form="coconut" size={40} />
      <small>
        {$t('mascot.forms.coconut')}<br />
        {$t('mascot.stats', {
          hp: MASCOT_FORM_STATS.coconut.maxHp,
          damage: Math.round(MASCOT_RAM.coconut.maxDamage * MASCOT_RAM.coconut.boostMultiplier),
        })}
      </small>
    </span>
  </span>
</span>

<style>
  :global(.class-card.is-mascot) {
    grid-column: 1 / -1;
  }

  .mascot-badge {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    margin-top: 0.2rem;
  }

  .mascot-badge-line {
    font-size: 0.78rem;
    font-weight: 700;
  }

  .mascot-badge-forms {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.4rem;
  }

  .mascot-badge-form {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    min-width: 0;
  }

  .mascot-badge-form small {
    font-size: 0.68rem;
    line-height: 1.2;
    opacity: 0.9;
  }
</style>
