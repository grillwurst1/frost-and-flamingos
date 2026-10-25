<script lang="ts">
  import { RESPAWN_DELAY_SECONDS, weaponSlotForId } from '@frost-and-flamingos/shared';
  import { deathState, localPlayer } from '../../state/game';
  import { t } from '../../state/locale';
  import { classNameKey, weaponNameKeyForSlot } from '../../state/labels';
  import Crest from '../icons/Crest.svelte';
  import Pictogram from '../icons/Pictogram.svelte';

  const RING_RADIUS = 44;
  const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

  $: death = $deathState;
  $: progress = death ? Math.max(0, Math.min(1, death.respawnSeconds / RESPAWN_DELAY_SECONDS)) : 0;
  $: killerHealth = death
    ? Math.max(0, Math.min(100, (death.killerHp / Math.max(1, death.killerMaxHp)) * 100))
    : 0;
  $: killerName = death?.killerName || '—';
  $: localFaction = $localPlayer?.faction ?? null;
  // The killer is an opponent unless the game says otherwise.
  $: killerSide = death?.killerFaction ?? (localFaction ? (localFaction === 'alpine' ? 'lagoon' : 'alpine') : null);
</script>

{#if death}
  <div class="death-screen">
    <header class="death-banner">
      <div class="death-ribbon">
        {#if killerSide}
          <span class="death-crest"><Crest faction={killerSide} /></span>
        {/if}
        <span class="death-ribbon-text">{$t('combat.eliminatedBy', { name: killerName })}</span>
      </div>
      <div class="death-details">
        {#if death.killerClassId}
          <span class="death-chip">{$t(classNameKey(death.killerClassId))}</span>
        {/if}
        {#if death.weaponId}
          <span class="death-chip is-weapon">
            <span class="death-weapon-icon"><Pictogram weapon={death.weaponId} /></span>
            {$t(weaponNameKeyForSlot(weaponSlotForId(death.weaponId), death.weaponId))}
          </span>
        {/if}
        {#if death.headshot}
          <span class="death-chip is-gold">{$t('combat.headshot')}</span>
        {/if}
        <span class="death-chip is-hp" title={$t('combat.killerVitality')}>
          <span class="death-hp-track"><span class="death-hp-fill" style={`width:${killerHealth}%`}></span></span>
          <strong class="mono">{Math.round(death.killerHp)}</strong>
        </span>
      </div>
      <span class="death-watching">{$t('combat.watching', { name: killerName })}</span>
    </header>

    <aside class="death-note paper">
      <strong class="display">{$t('combat.deathTitle')}</strong>
      <p>{$t('combat.deathBody')}</p>
      <span class="death-tip">{$t('combat.deathTip')}</span>
    </aside>

    <div class="death-timer" role="timer" aria-label={$t('combat.respawnIn', { seconds: Math.ceil(death.respawnSeconds) })}>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r="47" fill="#fff3d4" stroke="#1b1410" stroke-width="5" />
        <circle cx="50" cy="50" r={RING_RADIUS} fill="none" stroke="#e2c88f" stroke-width="7" />
        <circle
          cx="50"
          cy="50"
          r={RING_RADIUS}
          fill="none"
          stroke="#e8353f"
          stroke-width="7"
          stroke-linecap="round"
          stroke-dasharray={`${RING_LENGTH * progress} ${RING_LENGTH}`}
          transform="rotate(-90 50 50)"
        />
        <circle cx="50" cy="50" r="38" fill="none" stroke="#1b1410" stroke-width="2.4" />
      </svg>
      <div class="death-timer-text">
        <strong>{Math.ceil(death.respawnSeconds)}</strong>
        <span>{$t('combat.respawnShort')}</span>
      </div>
    </div>
  </div>
{/if}
