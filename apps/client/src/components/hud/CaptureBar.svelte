<script lang="ts">
  import { CONQUEST_TOWERS, TOWER_LETTERS, type Faction, type TranslationKey } from '@frost-and-flamingos/shared';
  import { conquest } from '../../state/conquest';
  import { localPlayer } from '../../state/game';
  import { t } from '../../state/locale';
  import Crest from '../icons/Crest.svelte';

  /**
   * Tug-of-war capture plate while the local player stands in a tower zone:
   * the tower badge in its owner's colour, what is happening (capturing,
   * neutralising, defending, losing, contested, secured), a bar that fills
   * from the centre toward the side the control leans to, and the head count.
   */
  $: state = $conquest;
  $: index = state.localZone;
  $: tower = index >= 0 ? state.towers[index] : undefined;
  $: definition = index >= 0 ? CONQUEST_TOWERS[index] : undefined;
  $: own = ($localPlayer?.faction ?? 'alpine') as Faction;
  $: rival = (own === 'alpine' ? 'lagoon' : 'alpine') as Faction;
  $: visible = !!tower && !!definition && state.phase === 'live' && ($localPlayer?.alive ?? false);
  $: towerName = definition ? $t(definition.labelKey) : '';
  $: control = Math.max(-1, Math.min(1, tower?.control ?? 0));
  $: ownSign = own === 'alpine' ? -1 : 1;
  $: ownCount = tower ? tower[own] : 0;
  $: rivalCount = tower ? tower[rival] : 0;
  $: labelKey = ((): TranslationKey => {
    if (!tower) return 'conquest.zone';
    if (!state.localCanCapture) return 'conquest.cannotCapture';
    if (tower.pushing === own) {
      if (tower.owner === own) return 'conquest.restoring';
      return Math.sign(control) === -ownSign ? 'conquest.neutralising' : 'conquest.capturing';
    }
    if (tower.pushing === rival) return tower.owner === own ? 'conquest.losing' : 'conquest.enemyCapturing';
    if (tower.contested) return 'conquest.contested';
    if (tower.owner === own) return 'conquest.secured';
    return tower.owner === rival ? 'conquest.enemyHeld' : 'conquest.neutralHeld';
  })();
  $: tone =
    tower?.contested ? 'is-contested' : tower?.pushing === own ? 'is-gaining' : tower?.pushing === rival ? 'is-losing' : 'is-idle';
  // Alpine fills leftwards from the centre, lagoon rightwards.
  $: fillLeft = control < 0 ? 50 + control * 50 : 50;
  $: fillWidth = Math.abs(control) * 50;
  $: fillSide = control < 0 ? 'alpine' : 'lagoon';
  $: ownerClass = tower?.owner === 'alpine' ? 'is-alpine' : tower?.owner === 'lagoon' ? 'is-lagoon' : 'is-neutral';
</script>

{#if visible && definition}
  <div class={`capture-plate ${tone}`} role="status" aria-live="polite">
    <span class={`capture-badge ${ownerClass}`}>{TOWER_LETTERS[definition.id]}</span>
    <div class="capture-main">
      <span class="capture-title">{$t(labelKey, { tower: towerName })}</span>
      <div
        class="capture-track"
        role="meter"
        aria-label={$t('conquest.zone')}
        aria-valuemin="-100"
        aria-valuemax="100"
        aria-valuenow={Math.round(control * 100)}
      >
        <span class={`capture-fill is-${fillSide}`} style={`left:${fillLeft}%;width:${fillWidth}%`}></span>
        <span class="capture-mid"></span>
      </div>
    </div>
    <span class="capture-count" title={$t('conquest.versus', { own: ownCount, rival: rivalCount })}>
      <span class="capture-crest"><Crest faction={own} /></span>
      <strong>{ownCount}</strong>
      <i>:</i>
      <strong>{rivalCount}</strong>
      <span class="capture-crest"><Crest faction={rival} /></span>
    </span>
    {#if tower?.contested && labelKey !== 'conquest.contested'}
      <span class="capture-chip">{$t('conquest.contested')}</span>
    {/if}
  </div>
{/if}
