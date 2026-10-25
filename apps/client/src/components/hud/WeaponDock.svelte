<script lang="ts">
  import { WEAPON_STATS, skillsForClass, weaponSlotForId } from '@frost-and-flamingos/shared';
  import type { TranslationKey, WeaponId } from '@frost-and-flamingos/shared';
  import { localPlayer } from '../../state/game';
  import { t } from '../../state/locale';
  import { weaponNameKeyForSlot } from '../../state/labels';
  import { paintedTiles } from '../icons/painted';
  import Pictogram from '../icons/Pictogram.svelte';

  const SLOT_KEYS = ['1', '2', '3'] as const;
  const SKILL_KEYS = ['Q', 'E', 'T'] as const;
  const DEFAULT_WEAPONS: [WeaponId, WeaponId, WeaponId] = ['smg', 'shotgun', 'snow_cannon'];

  $: player = $localPlayer;
  $: weaponIds = player?.weaponIds ?? DEFAULT_WEAPONS;
  $: skills = skillsForClass(player?.classId ?? 'allrounder');
  $: activeSlot = player?.weaponSlot ?? 1;
  $: activeId = weaponIds[activeSlot - 1] ?? weaponIds[0];
  $: activeStats = WEAPON_STATS[activeId];
  $: hasMagazine = activeStats.magazine > 0;
  $: ammo = player?.ammo ?? 0;
  $: reserve = player?.reserve ?? 0;
  $: reloading = !!player?.reloading;
  $: empty = hasMagazine && ammo <= 0 && !reloading;
  $: lowAmmo = hasMagazine && !reloading && ammo > 0 && ammo <= Math.max(2, activeStats.magazine * 0.25);

  function nameKey(id: WeaponId): TranslationKey {
    return weaponNameKeyForSlot(weaponSlotForId(id), id);
  }

  $: cooldowns = skills.map((_, index) => player?.skillCooldowns[index] ?? 0);
  $: cooldownPercents = skills.map((skill, index) =>
    skill.cooldownSeconds > 0
      ? Math.max(0, Math.min(100, ((cooldowns[index] ?? 0) / skill.cooldownSeconds) * 100))
      : 0,
  );
</script>

<div class="dock" aria-label={$t('combat.weapon')}>
  <!-- Ammo readout for the active weapon. -->
  <div class="dock-readout" class:is-empty={empty} class:is-low={lowAmmo}>
    <span class="dock-weapon-name">{$t(nameKey(activeId))}</span>
    <span class="dock-ammo mono">
      {#if !hasMagazine}
        <span class="dock-infinite" title={$t('hud.infiniteAmmo')}>∞</span>
      {:else if reloading}
        <em>{$t('hud.reloadingShort')}</em>
      {:else}
        <b>{ammo}</b><span>/ {reserve}</span>
      {/if}
    </span>
    {#if empty}
      <span class="dock-empty">{$t('combat.noAmmo')}</span>
    {/if}
  </div>

  <div class="dock-row">
    <!-- Class skills: round orbs with cooldown sweep. -->
    <div class="skill-row" aria-label={$t('combat.skills')}>
      {#each skills as skill, index (skill.id)}
        {@const left = cooldowns[index] ?? 0}
        <div
          class="skill-orb"
          class:is-ready={left <= 0}
          class:is-painted={$paintedTiles[skill.id] === 'ok'}
          title={`${$t(skill.nameKey)} — ${$t(skill.descriptionKey)}`}
          style={`--cd:${cooldownPercents[index] ?? 0}`}
        >
          <Pictogram skill={skill.id} painted />
          <span class="skill-sweep" aria-hidden="true"></span>
          {#if left > 0}
            <span class="skill-count mono">{$t('combat.cooldown', { seconds: Math.ceil(left) })}</span>
          {/if}
          <span class="skill-key">{SKILL_KEYS[index]}</span>
        </div>
      {/each}
    </div>

    <!-- Weapon slots 1-3: green, brown, maroon. -->
    <div class="slot-row-hud">
      {#each weaponIds as weaponId, index (index)}
        {@const slot = index + 1}
        {@const active = activeSlot === slot}
        <div
          class={`weapon-slot slot-${slot}`}
          class:is-active={active}
          class:is-painted={$paintedTiles[weaponId] === 'ok'}
          class:is-reloading={active && reloading}
          title={$t(nameKey(weaponId))}
          style={`--reload:${WEAPON_STATS[weaponId].reloadSeconds}s`}
        >
          <Pictogram weapon={weaponId} painted />
          {#if active && reloading}
            <span class="weapon-sweep" aria-hidden="true"></span>
          {/if}
          <span class="slot-key">{SLOT_KEYS[index]}</span>
        </div>
      {/each}
    </div>
  </div>
</div>
