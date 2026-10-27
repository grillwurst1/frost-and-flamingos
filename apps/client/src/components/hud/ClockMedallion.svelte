<script lang="ts">
  import { conquest } from '../../state/conquest';
  import { connection, localPlayer } from '../../state/game';
  import { t } from '../../state/locale';
  const pips = Array.from({length:10},(_,i)=>i);
  const towers = ['A','B','C'];
  $: owners = $conquest.towers.map(tower=>tower.owner);
  $: heading = -($localPlayer?.yaw ?? 0)*180/Math.PI;
</script>

<section class="match-hud" aria-label={$t('combat.towerControl')}>
  <div class="ticket-display">
    <div class="ticket-wing is-blue" role="meter" aria-label={$t('hud.ticketsAlps')} aria-valuemin="0" aria-valuemax="50" aria-valuenow={$connection.ticketsAlpine}>
      {#each pips as pip}<i class:is-lit={pip<Math.ceil($connection.ticketsAlpine/5)}></i>{/each}
    </div>
    <strong><span>{$connection.ticketsAlpine}</span> {$t('hud.versus')} <span class="ticket-red">{$connection.ticketsLagoon}</span></strong>
    <div class="ticket-wing is-red" role="meter" aria-label={$t('hud.ticketsBeach')} aria-valuemin="0" aria-valuemax="50" aria-valuenow={$connection.ticketsLagoon}>
      {#each pips as pip}<i class:is-lit={pip<Math.ceil($connection.ticketsLagoon/5)}></i>{/each}
    </div>
  </div>
  <div class="objective-discs">
    {#each towers as letter,index}
      {@const tower=$conquest.towers[index]}
      <div class="objective-disc" class:is-blue={owners[index]==='alpine'} class:is-red={owners[index]==='lagoon'} class:is-contested={tower?.contested}
        title={$t('hud.towerTitle',{letter,name:$t(index===0?'world.towers.a':index===1?'world.towers.b':'world.towers.c'),owner:$t(owners[index]==='alpine'?'factions.alpine.short':owners[index]==='lagoon'?'factions.lagoon.short':'hud.neutralTower')})}>
        {letter}
        {#if tower?.pushing}<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="18" fill="none" stroke="#fff5be" stroke-width="2" stroke-dasharray={`${Math.abs(tower.control)*113} 113`} transform="rotate(-90 20 20)"/></svg>{/if}
      </div>
    {/each}
  </div>
  <svg class="field-compass" viewBox="0 0 64 64" role="img" aria-label={$t('hud.compass')}>
    <circle cx="32" cy="32" r="29" fill="#456776" stroke="#17272d" stroke-width="2.4"/>
    <text x="32" y="13" text-anchor="middle">N</text><text x="32" y="59" text-anchor="middle">S</text>
    <text x="8" y="36" text-anchor="middle">W</text><text x="56" y="36" text-anchor="middle">E</text>
    <g transform={`rotate(${heading} 32 32)`}><path d="M32 16 L25 36 L32 32Z" fill="#cf786e" stroke="#20333b" stroke-width="1.4"/><path d="M32 48 L39 28 L32 32Z" fill="#a7d7e9" stroke="#20333b" stroke-width="1.4"/></g>
  </svg>
</section>
