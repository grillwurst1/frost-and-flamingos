<script lang="ts">
  import {
    MASCOT_SKILLS,
    SKILLS,
    mascotFormForFaction,
    type Faction,
  } from '@frost-and-flamingos/shared';
  import { t } from '../state/locale';
  import MascotPortrait from './MascotPortrait.svelte';

  /** Replaces the human cosmetic and loadout sections while the mascot is selected. */
  export let faction: Faction;

  const iconBase = `${import.meta.env.BASE_URL}art/icons/skills/`;
  $: form = mascotFormForFaction(faction);
  $: moves = MASCOT_SKILLS[form];
</script>

<div class="section-heading">
  <span>{$t('mascot.wardrobeTitle')}</span>
  <small>{$t('mascot.formsLine')}</small>
</div>
<div class="mascot-wardrobe">
  <div class="mascot-wardrobe-form">
    <MascotPortrait {form} size={64} />
    <div>
      <span class="eyebrow">{$t('mascot.yourForm')}</span>
      <strong>{$t(form === 'cow' ? 'mascot.forms.cow' : 'mascot.forms.coconut')}</strong>
      <small>{$t(form === 'cow' ? 'mascot.formFaction.cow' : 'mascot.formFaction.coconut')}</small>
    </div>
  </div>
  <p class="field-hint">{$t('mascot.wardrobeBody')}</p>
  <p class="field-hint">{$t('mascot.wardrobeRam')}</p>
  <p class="field-hint">{$t(form === 'cow' ? 'mascot.controlsCow' : 'mascot.controlsCoconut')}</p>

  <div class="section-heading">
    <span>{$t('mascot.wardrobeMoves')}</span>
    <small>{$t('mascot.hud.moveKeys')}</small>
  </div>
  <ul class="mascot-wardrobe-moves">
    {#each moves as move, index (move)}
      <li>
        <img src={`${iconBase}${move}.png`} alt="" width="44" height="44" draggable="false" />
        <span>
          <strong>{index + 1} · {$t(SKILLS[move].nameKey)}</strong>
          <small>{$t(SKILLS[move].descriptionKey)}</small>
        </span>
      </li>
    {/each}
  </ul>
  <p class="field-hint">{$t('mascot.wardrobeVoice')}</p>
</div>

<style>
  .mascot-wardrobe {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .mascot-wardrobe-form {
    display: flex;
    align-items: center;
    gap: 0.7rem;
  }

  .mascot-wardrobe-form div {
    display: flex;
    flex-direction: column;
    gap: 0.08rem;
  }

  .mascot-wardrobe-form strong {
    font-size: 1.1rem;
  }

  .mascot-wardrobe-moves {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .mascot-wardrobe-moves li {
    display: flex;
    gap: 0.55rem;
    align-items: center;
  }

  .mascot-wardrobe-moves img {
    flex: none;
    border-radius: 0.55rem;
    border: 2px solid #1b1410;
  }

  .mascot-wardrobe-moves span {
    display: flex;
    flex-direction: column;
    gap: 0.05rem;
  }

  .mascot-wardrobe-moves small {
    font-size: 0.74rem;
    opacity: 0.85;
    line-height: 1.25;
  }
</style>
