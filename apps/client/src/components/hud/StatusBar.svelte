<script lang="ts">
  import { drifterFormForFaction } from '@frost-and-flamingos/shared';
  import MascotPortrait from '../MascotPortrait.svelte';
  import DrifterEmblem from '../DrifterEmblem.svelte';
  import { localPlayer } from '../../state/game';
  import { spawnProtected } from '../../state/conquest';
  import { t } from '../../state/locale';
  import PlayerPortrait from './PlayerPortrait.svelte';
  $: player=$localPlayer;
  $: maxHp=Math.max(1,player?.maxHp??150);
  $: hp=Math.max(0,player?.hp??maxHp);
  $: percent=Math.max(0,Math.min(100,hp/maxHp*100));
  $: shield=Math.max(0,Math.min(100,(player?.shield??0)/maxHp*100));
</script>

<section class="player-status" class:is-low={percent<=30} aria-label={$t('hud.health')}>
  {#if player?.classId==='mascot'}
    <div class="player-portrait"><MascotPortrait form={player.faction==='alpine'?'cow':'coconut'} size={100}/></div>
  {:else if player?.classId==='drifter'}
    <div class="player-portrait"><DrifterEmblem form={drifterFormForFaction(player.faction)} size={100}/></div>
  {:else}
    <PlayerPortrait/>
  {/if}
  <div class="player-vitals">
    <strong class="health-value">{$t('hud.healthValue',{current:Math.ceil(hp),max:maxHp})}</strong>
    <div class="health-track" role="meter" aria-label={$t('hud.health')} aria-valuemin="0" aria-valuemax={maxHp} aria-valuenow={Math.ceil(hp)}>
      <i style={`width:${percent}%`}></i>{#if shield>0}<b style={`width:${shield}%`}></b>{/if}
    </div>
    <div class="reserve-line" title={$t('combat.shield')}>
      <svg viewBox="0 0 24 27" aria-hidden="true"><path d="M2 10 Q12 -6 22 10 L15 18 L12 25 L9 18Z" fill="#86b7bb" stroke="#293b40" stroke-width="1.7"/><path d="M3 9L21 9M8 9L12 25L16 9" fill="none" stroke="#e9d7a3" stroke-width="1.4"/></svg>
      <div class="reserve-track"><i style={`width:${shield}%`}></i></div>
    </div>
    {#if $spawnProtected}<span class="reference-status-tag">{$t('combat.protected')}</span>{/if}
    {#if player?.cloaked}<span class="reference-status-tag">{$t('combat.cloaked')}</span>{/if}
  </div>
</section>
