<script lang="ts">
  import type { Faction } from '@frost-and-flamingos/shared';
  import { scoreboard, scoreboardOpen } from '../../state/game';
  import { t } from '../../state/locale';
  import { factionClassNameKey, factionShortKey } from '../../state/labels';
  import Crest from '../icons/Crest.svelte';

  /** Live scoreboard while Tab is held: both teams with kills, deaths and support points. */
  const FACTIONS: readonly Faction[] = ['alpine', 'lagoon'];

  $: rows = $scoreboard;
</script>

{#if $scoreboardOpen}
  <section class="scoreboard" aria-label={$t('scoreboard.title')}>
    <header class="scoreboard-header">
      <strong>{$t('scoreboard.title')}</strong>
      <small>{$t('scoreboard.hint')}</small>
    </header>
    <div class="scoreboard-teams">
      {#each FACTIONS as faction (faction)}
        <div class={`scoreboard-team is-${faction}`}>
          <div class="scoreboard-team-name">
            <Crest {faction} />
            <span>{$t(factionShortKey(faction))}</span>
          </div>
          <table>
            <thead>
              <tr>
                <th class="is-name">{$t('scoreboard.player')}</th>
                <th>{$t('scoreboard.kills')}</th>
                <th>{$t('scoreboard.deaths')}</th>
                <th>{$t('scoreboard.support')}</th>
              </tr>
            </thead>
            <tbody>
              {#each rows.filter((row) => row.faction === faction) as row (row.id)}
                <tr class:is-local={row.local} class:is-down={!row.alive}>
                  <td class="is-name">
                    <span class="scoreboard-player">{row.name}</span>
                    <small>{$t(factionClassNameKey(row.faction, row.classId))}{row.local ? ` · ${$t('scoreboard.you')}` : ''}</small>
                  </td>
                  <td>{row.classId === 'drifter' ? '—' : row.kills}</td>
                  <td>{row.classId === 'drifter' ? '—' : row.deaths}</td>
                  <td class="is-support">{row.support}</td>
                </tr>
              {:else}
                <tr><td class="is-empty" colspan="4">{$t('scoreboard.empty')}</td></tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/each}
    </div>
  </section>
{/if}

<style>
  .scoreboard {
    position: absolute;
    top: 50%;
    left: 50%;
    z-index: 6;
    width: min(46rem, calc(100vw - 4rem));
    padding: 0.8rem 1rem 0.9rem;
    border: 0.2rem solid var(--ink);
    border-radius: 1rem;
    background: linear-gradient(180deg, #fffaf0, var(--cream-2));
    box-shadow:
      inset 0 0 0 0.14rem rgba(255, 255, 255, 0.55),
      var(--shadow-hard);
    color: var(--ink);
    font-family: var(--font-body);
    transform: translate(-50%, -50%);
    pointer-events: none;
  }

  .scoreboard-header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: 0.5rem;
  }

  .scoreboard-header strong {
    font-family: var(--font-display);
    font-size: 1.4rem;
    letter-spacing: 0.04em;
  }

  .scoreboard-header small {
    font-size: 0.72rem;
    opacity: 0.75;
  }

  .scoreboard-teams {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.8rem;
  }

  .scoreboard-team {
    padding: 0.4rem 0.5rem;
    border: 0.14rem solid var(--ink);
    border-top: 0.4rem solid var(--blue);
    border-radius: 0.7rem;
    background: rgba(255, 255, 255, 0.55);
  }

  .scoreboard-team.is-lagoon {
    border-top-color: var(--coral);
  }

  .scoreboard-team-name {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin-bottom: 0.25rem;
    font-weight: 700;
  }

  .scoreboard-team-name :global(svg) {
    width: 1.6rem;
    height: 1.6rem;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.8rem;
    font-variant-numeric: tabular-nums;
  }

  th {
    padding: 0.15rem 0.25rem;
    border-bottom: 0.12rem dashed var(--paper-edge);
    font-size: 0.64rem;
    letter-spacing: 0.06em;
    text-align: right;
    text-transform: uppercase;
  }

  td {
    padding: 0.2rem 0.25rem;
    text-align: right;
    vertical-align: top;
  }

  .is-name {
    text-align: left;
  }

  td.is-name small {
    display: block;
    font-size: 0.64rem;
    opacity: 0.75;
  }

  .scoreboard-player {
    font-weight: 700;
  }

  td.is-support {
    color: var(--green-dark);
    font-weight: 700;
  }

  tr.is-local {
    background: rgba(255, 210, 63, 0.35);
  }

  tr.is-down {
    opacity: 0.55;
  }

  td.is-empty {
    text-align: center;
    opacity: 0.6;
  }
</style>
