<script lang="ts">
  import { DRIFTER_AURA, drifterFormForFaction, type Faction } from '@frost-and-flamingos/shared';
  import { t } from '../state/locale';
  import DrifterEmblem from './DrifterEmblem.svelte';

  /** Replaces the appearance, voice, outfit and loadout sections while the drifter is selected. */
  export let faction: Faction;

  $: form = drifterFormForFaction(faction);
</script>

<div class="section-heading">
  <span>{$t('drifter.wardrobeTitle')}</span>
  <small>{$t('drifter.classBadge')}</small>
</div>
<div class="drifter-wardrobe">
  <div class="drifter-wardrobe-form">
    <DrifterEmblem {form} size={64} />
    <div>
      <span class="eyebrow">{$t('drifter.yourForm')}</span>
      <strong>{$t(`drifter.forms.${form}`)}</strong>
      <small>{$t(`drifter.formFaction.${form}`)}</small>
    </div>
  </div>
  <p class="drifter-wardrobe-motto">{$t('drifter.description')}</p>
  <p class="field-hint">{$t('drifter.wardrobeBody')}</p>
  <p class="field-hint">
    {$t('drifter.wardrobeAura', {
      radius: DRIFTER_AURA.radius,
      heal: DRIFTER_AURA.healPerSecond,
      seconds: DRIFTER_AURA.outOfCombatSeconds,
      magazine: DRIFTER_AURA.magazineSeconds,
    })}
  </p>
  <p class="field-hint">{$t(`drifter.wardrobeAuraTheme.${form}`)}</p>
  <p class="field-hint">{$t('drifter.wardrobePoints', { vitality: DRIFTER_AURA.vitalityPerPoint })}</p>
  <p class="field-hint">{$t('drifter.wardrobeRules')}</p>
  <p class="field-hint">{$t('drifter.controls.noActions')}</p>
  <p class="field-hint is-fixed">{$t('drifter.wardrobeFixed')}</p>
</div>

<style>
  .drifter-wardrobe {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .drifter-wardrobe-form {
    display: flex;
    align-items: center;
    gap: 0.7rem;
  }

  .drifter-wardrobe-form div {
    display: flex;
    flex-direction: column;
    gap: 0.08rem;
  }

  .drifter-wardrobe-form strong {
    font-size: 1.1rem;
  }

  .drifter-wardrobe-motto {
    margin: 0.15rem 0 0;
    font-weight: 700;
    font-style: italic;
  }

  .is-fixed {
    font-weight: 700;
  }
</style>
