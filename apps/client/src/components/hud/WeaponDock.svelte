<script lang="ts">
  import { WEAPON_STATS, skillsForClass, weaponSlotForId, type TranslationKey, type WeaponId } from '@frost-and-flamingos/shared';
  import { localPlayer } from '../../state/game';
  import { t } from '../../state/locale';
  import { weaponNameKeyForSlot } from '../../state/labels';
  import Pictogram from '../icons/Pictogram.svelte';
  const skillKeys=['Q','E','T'];
  $: player=$localPlayer;
  $: weapons=player?.weaponIds??['smg','shotgun','snow_cannon'] as WeaponId[];
  $: skills=skillsForClass(player?.classId??'allrounder',player?.faction);
  $: active=player?.weaponSlot??1;
  function shortName(id:WeaponId):TranslationKey{return `hud.weaponShort.${id}` as TranslationKey;}
  function name(id:WeaponId):TranslationKey{return weaponNameKeyForSlot(weaponSlotForId(id),id);}
</script>

<div class="equipment-hud">
  <div class="equipment-actions" aria-label={$t('combat.skills')}>
    {#each skills as skill,index}
      {@const cooldown=player?.skillCooldowns[index]??0}
      <div class="field-action" class:is-ready={cooldown<=0} title={`${$t(skill.nameKey)} — ${$t(skill.descriptionKey)}`}>
        <Pictogram skill={skill.id}/>
        {#if cooldown>0}<span class="action-cooldown">{Math.ceil(cooldown)}</span>{/if}
        <kbd>{skillKeys[index]}</kbd>
      </div>
    {/each}
    <div class="field-action is-gimmick" title={$t(name(weapons[2]??'snow_cannon'))}><Pictogram weapon={weapons[2]??'snow_cannon'}/><kbd>3</kbd></div>
    <div class="field-action is-tool" title={$t('vehicles.hud.repair')}><Pictogram tile="wrench"/><kbd>{$t('vehicles.keys.repair')}</kbd></div>
  </div>
  <div class="field-loadout" aria-label={$t('combat.weapon')}>
    {#each weapons as weapon,index}
      {@const selected=active===index+1}
      <div class={`field-weapon field-weapon-${index+1}`} class:is-selected={selected} class:is-reloading={selected&&player?.reloading} title={`${$t(name(weapon))} · ${index+1}`}>
        <strong>{$t(shortName(weapon))}</strong>
        <Pictogram {weapon}/>
        {#if selected}<span class="field-ammo">{player?.reloading?$t('hud.reloadingShort'):WEAPON_STATS[weapon].magazine>0?`(${player?.ammo??0}/${player?.reserve??0})`:'∞'}</span>{/if}
      </div>
    {/each}
  </div>
</div>
