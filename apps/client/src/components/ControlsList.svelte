<script lang="ts">
  import { mascotFormOf, type ClassId, type MascotForm, type TranslationKey } from '@frost-and-flamingos/shared';
  import { localPlayer, phase } from '../state/game';
  import { t } from '../state/locale';
  import { profile } from '../state/profile';

  interface ControlRow {
    label: TranslationKey;
    value: TranslationKey;
  }

  const SHARED_ROWS: ControlRow[] = [
    { label: 'controls.taunt', value: 'controls.tauntKey' },
    { label: 'controls.scoreboard', value: 'controls.scoreboardKey' },
    { label: 'controls.shoulder', value: 'controls.shoulderKey' },
    { label: 'controls.zoom', value: 'controls.zoomKey' },
    { label: 'controls.pause', value: 'controls.pauseKey' },
    { label: 'controls.debug', value: 'controls.debugKey' },
  ];

  const HUMAN_ROWS: ControlRow[] = [
    { label: 'controls.movement', value: 'controls.moveKeys' },
    { label: 'controls.look', value: 'controls.mouse' },
    { label: 'controls.jump', value: 'controls.jumpKey' },
    { label: 'controls.sprint', value: 'controls.sprintKey' },
    { label: 'controls.crouch', value: 'controls.crouchKey' },
    { label: 'controls.roll', value: 'controls.rollKey' },
    { label: 'controls.parachute', value: 'controls.parachuteKey' },
    { label: 'controls.fire', value: 'controls.fireKey' },
    { label: 'controls.weaponSlot', value: 'controls.weaponKey' },
    { label: 'controls.reload', value: 'controls.reloadKey' },
    { label: 'controls.skills', value: 'controls.skillKey' },
    { label: 'controls.interact', value: 'controls.interactKey' },
    { label: 'controls.vehicleEnter', value: 'controls.vehicleEnterKey' },
    { label: 'controls.vehicleSeat', value: 'controls.vehicleSeatKey' },
    { label: 'controls.vehicleHorn', value: 'controls.vehicleHornKey' },
    { label: 'controls.vehicleTurbo', value: 'controls.vehicleTurboKey' },
    { label: 'controls.vehicleDrift', value: 'controls.vehicleDriftKey' },
    ...SHARED_ROWS,
  ];

  const COW_ROWS: ControlRow[] = [
    { label: 'mascot.controls.throttle', value: 'mascot.controls.throttleKey' },
    { label: 'mascot.controls.steer', value: 'mascot.controls.steerKey' },
    { label: 'mascot.controls.gallop', value: 'mascot.controls.gallopKey' },
    { label: 'mascot.controls.hop', value: 'mascot.controls.hopKey' },
    { label: 'mascot.controls.camera', value: 'controls.mouse' },
    { label: 'mascot.controls.moves', value: 'mascot.controls.movesKey' },
    ...SHARED_ROWS,
  ];

  const COCONUT_ROWS: ControlRow[] = [
    { label: 'mascot.controls.roll', value: 'mascot.controls.rollKey' },
    { label: 'mascot.controls.camera', value: 'controls.mouse' },
    { label: 'mascot.controls.jump', value: 'mascot.controls.jumpKey' },
    { label: 'mascot.controls.moves', value: 'mascot.controls.movesKey' },
    ...SHARED_ROWS,
  ];

  // The drifter only walks: movement, look and the camera keys, nothing else.
  const DRIFTER_ROWS: ControlRow[] = [
    { label: 'drifter.controls.walk', value: 'drifter.controls.walkKey' },
    { label: 'controls.look', value: 'controls.mouse' },
    ...SHARED_ROWS.filter((row) => row.label !== 'controls.taunt'),
  ];

  // In a round the server-assigned class and faction decide; in the menus the
  // local profile does.
  $: inRound = ($phase === 'playing' || $phase === 'paused') && $localPlayer !== null;
  let form: MascotForm | null = null;
  $: form = inRound && $localPlayer
    ? mascotFormOf($localPlayer.classId, $localPlayer.faction)
    : mascotFormOf($profile.cosmetics.classId, $profile.faction);
  let classId: ClassId = 'allrounder';
  $: classId = inRound && $localPlayer ? $localPlayer.classId : $profile.cosmetics.classId;
  $: rows =
    classId === 'drifter'
      ? DRIFTER_ROWS
      : form === 'cow'
        ? COW_ROWS
        : form === 'coconut'
          ? COCONUT_ROWS
          : HUMAN_ROWS;
</script>

<div class="controls-grid">
  {#each rows as row (row.label)}
    <div class="controls-row">
      <span>{$t(row.label)}</span>
      <kbd>{$t(row.value)}</kbd>
    </div>
  {/each}
  {#if form === 'coconut'}
    <p class="controls-note">{$t('mascot.controls.poundHint')}</p>
  {:else if classId === 'drifter'}
    <p class="controls-note">{$t('drifter.controls.noActions')}</p>
  {/if}
</div>

<style>
  .controls-note {
    grid-column: 1 / -1;
    margin: 0.25rem 0 0;
    font-size: 0.7rem;
    opacity: 0.7;
  }
</style>
