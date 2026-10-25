<script lang="ts">
  import { localPlayer } from '../../state/game';
  import { t } from '../../state/locale';
  import { factionClassNameKey, factionNameKey } from '../../state/labels';
  import Crest from '../icons/Crest.svelte';

  $: player = $localPlayer;
  $: faction = player?.faction ?? 'alpine';
  $: classId = player?.classId ?? 'allrounder';
</script>

<section class={`identity-chip is-${faction}`} title={$t(factionNameKey(faction))}>
  <Crest {faction} />
  <div class="identity-text">
    <strong>{$t(factionClassNameKey(faction, classId))}</strong>
    <span>{player ? $t(player.zoneKey) : $t('hud.waitingForServer')}</span>
  </div>
  {#if classId === 'drifter'}
    <!-- She never kills or dies: her score is the support she hands out. -->
    <div class="identity-score" aria-label={$t('drifter.hud.support')}>
      <span title={$t('drifter.hud.support')}><i class="is-support"></i>{$t('drifter.hud.supportPoints', { points: player?.support ?? 0 })}</span>
    </div>
  {:else}
  <div class="identity-score" aria-label={`${$t('combat.kills')} / ${$t('combat.deaths')}`}>
    <span title={$t('combat.kills')}><i class="is-kills"></i>{player?.kills ?? 0}</span>
    <span title={$t('combat.deaths')}><i class="is-deaths"></i>{player?.deaths ?? 0}</span>
  </div>
  {/if}
</section>
