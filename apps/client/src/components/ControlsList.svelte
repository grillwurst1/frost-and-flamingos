<script lang="ts">
  import type { TranslationKey } from '@frost-and-flamingos/shared';
  import { t } from '../state/locale';

  interface ControlRow {
    label: TranslationKey;
    value: TranslationKey;
  }

  const rows: ControlRow[] = [
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
    { label: 'controls.taunt', value: 'controls.tauntKey' },
    { label: 'controls.shoulder', value: 'controls.shoulderKey' },
    { label: 'controls.zoom', value: 'controls.zoomKey' },
    { label: 'controls.pause', value: 'controls.pauseKey' },
    { label: 'controls.debug', value: 'controls.debugKey' },
  ];
</script>

<div class="controls-grid">
  {#each rows as row (row.label)}
    <div class="controls-row">
      <span>{$t(row.label)}</span>
      <kbd>{$t(row.value)}</kbd>
    </div>
  {/each}
</div>
