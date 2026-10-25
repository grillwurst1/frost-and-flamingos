<script lang="ts">
  import { CONQUEST_RULES, type Faction } from '@frost-and-flamingos/shared';
  import { conquest } from '../../state/conquest';
  import { connection, localPlayer } from '../../state/game';
  import { t } from '../../state/locale';
  import Crest from '../icons/Crest.svelte';

  /**
   * Round results during the 15 s intermission: the winner ribbon in team
   * colours, Victory / Defeat for the local team, the final tickets, why the
   * round ended and the countdown to the reset. (Podium and rewards are M7.)
   */
  const RING_RADIUS = 44;
  const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

  $: state = $conquest;
  $: visible = state.synced && state.phase === 'ended';
  $: winner = state.winner as Faction | null;
  $: own = $localPlayer?.faction ?? null;
  $: verdict = winner === null ? 'draw' : own === null ? 'neutral' : winner === own ? 'victory' : 'defeat';
  $: headline = winner
    ? $t('conquest.round.wins', { team: $t(`factions.${winner}.short`) })
    : $t('conquest.round.draw');
  $: seconds = Math.max(0, Math.ceil(state.secondsLeft));
  $: progress = Math.max(0, Math.min(1, state.secondsLeft / CONQUEST_RULES.intermissionSeconds));
  $: reason = state.reason === 'time' ? $t('conquest.round.reasonTime') : $t('conquest.round.reasonTickets');
</script>

{#if visible}
  <div class="round-results" role="alert">
    <header class={`round-ribbon is-${winner ?? 'draw'}`}>
      {#if winner}
        <span class="round-crest"><Crest faction={winner} /></span>
      {/if}
      <span class="round-ribbon-text">{headline}</span>
    </header>

    {#if verdict !== 'neutral'}
      <div class={`round-verdict is-${verdict}`}>
        {verdict === 'victory'
          ? $t('conquest.round.victory')
          : verdict === 'defeat'
            ? $t('conquest.round.defeat')
            : $t('conquest.round.drawShort')}
      </div>
    {/if}

    <div class="round-card paper">
      <span class="round-over">{$t('conquest.round.over', { round: state.round })}</span>
      <div class="round-tickets" aria-label={$t('conquest.round.tickets')}>
        <span class="round-ticket is-alps" class:is-winner={winner === 'alpine'}>
          <span class="round-ticket-crest"><Crest faction="alpine" /></span>
          <strong>{$connection.ticketsAlpine}</strong>
        </span>
        <span class="round-vs">{$t('hud.versus')}</span>
        <span class="round-ticket is-beach" class:is-winner={winner === 'lagoon'}>
          <strong>{$connection.ticketsLagoon}</strong>
          <span class="round-ticket-crest"><Crest faction="lagoon" /></span>
        </span>
      </div>
      <span class="round-reason">{reason}</span>
    </div>

    <div class="round-next" role="timer" aria-label={$t('conquest.round.nextRound', { seconds })}>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r="47" fill="#fff3d4" stroke="#1b1410" stroke-width="5" />
        <circle cx="50" cy="50" r={RING_RADIUS} fill="none" stroke="#e2c88f" stroke-width="7" />
        <circle
          cx="50"
          cy="50"
          r={RING_RADIUS}
          fill="none"
          stroke="#e8b030"
          stroke-width="7"
          stroke-linecap="round"
          stroke-dasharray={`${RING_LENGTH * progress} ${RING_LENGTH}`}
          transform="rotate(-90 50 50)"
        />
        <circle cx="50" cy="50" r="38" fill="none" stroke="#1b1410" stroke-width="2.4" />
      </svg>
      <div class="round-next-text">
        <strong>{seconds}</strong>
      </div>
      <span class="round-next-label">{$t('conquest.round.nextRound', { seconds })}</span>
    </div>
  </div>
{/if}
