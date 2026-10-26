<script lang="ts">
  import { CONQUEST_TOWERS, TOWER_LETTERS, weaponSlotForId } from '@frost-and-flamingos/shared';
  import type { Faction, WeaponId } from '@frost-and-flamingos/shared';
  import { objectiveFeed, type ObjectiveFeedEntry } from '../../state/conquest';
  import { killFeed, localPlayer } from '../../state/game';
  import { t } from '../../state/locale';
  import { weaponNameKeyForSlot } from '../../state/labels';
  import Crest from '../icons/Crest.svelte';
  import Pictogram from '../icons/Pictogram.svelte';

  /**
   * The team of a kill-feed party: explicit when the game reports it, otherwise inferred
   * from the local player (an opponent of the local player is on the other team).
   */
  function resolveSide(
    explicit: Faction | undefined,
    id: number,
    otherId: number,
    localId: number,
    localFaction: Faction | null,
  ): Faction | null {
    if (explicit) return explicit;
    if (!localFaction) return null;
    if (id === localId) return localFaction;
    if (otherId === localId && id !== otherId) return localFaction === 'alpine' ? 'lagoon' : 'alpine';
    return null;
  }

  function weaponName(id: WeaponId): string {
    return $t(weaponNameKeyForSlot(weaponSlotForId(id), id));
  }

  $: localId = $localPlayer?.id ?? -1;
  $: localFaction = $localPlayer?.faction ?? null;
  $: rows = $killFeed.map((entry) => ({
    entry,
    killerSide: resolveSide(entry.killerFaction, entry.killerId, entry.victimId, localId, localFaction),
    victimSide: resolveSide(entry.victimFaction, entry.victimId, entry.killerId, localId, localFaction),
  }));

  type FeedRow =
    | { type: 'kill'; key: string; at: number; row: (typeof rows)[number] }
    | { type: 'objective'; key: string; at: number; entry: ObjectiveFeedEntry };

  // Kill ribbons and tower lines in one chronological column (newest at the bottom).
  $: feed = [
    ...rows.map((row): FeedRow => ({ type: 'kill', key: `k${row.entry.id}`, at: row.entry.at, row })),
    ...$objectiveFeed.map((entry): FeedRow => ({ type: 'objective', key: `o${entry.id}`, at: entry.at, entry })),
  ]
    .sort((a, b) => a.at - b.at)
    .slice(-7);

  function objectiveText(entry: ObjectiveFeedEntry): string {
    const tower = CONQUEST_TOWERS[entry.towerIndex];
    return $t(`conquest.feed.${entry.kind}`, {
      team: $t(`factions.${entry.faction}.short`),
      tower: tower ? $t(tower.labelKey) : '',
    });
  }
</script>

<aside class="kill-feed" aria-label={$t('combat.killFeed')}>
  {#each feed as item (item.key)}
    {#if item.type === 'objective'}
      {@const tower = CONQUEST_TOWERS[item.entry.towerIndex]}
      <div class="kill-ribbon is-objective" class:is-mine={item.entry.faction === localFaction}>
        <span class="kill-crest"><Crest faction={item.entry.faction} /></span>
        <span class="feed-objective">{objectiveText(item.entry)}</span>
        {#if tower}
          <span class={`feed-tower is-${item.entry.kind === 'captured' ? item.entry.faction : 'neutral'}`}>{TOWER_LETTERS[tower.id]}</span>
        {/if}
      </div>
    {:else}
    {@const row = item.row}
    {@const entry = row.entry}
    {#if entry.critter}
      <div class="kill-ribbon is-critter" class:is-mine={entry.killerId === localId}>
        {#if row.killerSide}
          <span class="kill-crest"><Crest faction={row.killerSide} /></span>
        {/if}
        {#if entry.weaponId}
          <span class="kill-weapon" title={weaponName(entry.weaponId)}><Pictogram weapon={entry.weaponId} /></span>
        {/if}
        <span class="kill-critter-line">
          {entry.killerName
            ? $t(`critters.killFeed.${entry.critter}`, { name: entry.killerName })
            : $t('critters.killFeed.henAnonymous')}
        </span>
        <span class="kill-hen" aria-hidden="true">
          <svg viewBox="0 0 32 32">
            <path class="hen-tail" d="M5.5 15.5 C3 11 4.5 7.5 7.5 6.5 C8.5 9.5 9.5 11 11.5 12.5 Z" />
            <path class="hen-body" d="M7 14 C7 21.5 11.5 26 18 26 C24 26 27 22.5 27 18.5 C27 15.5 25.5 13.5 24 12.5 L22.5 7.5 C21.5 5 17.5 5 16.5 8 C16 10 16.5 12.5 15.5 14 C13 15.5 9.5 15 7 14 Z" />
            <path class="hen-wing" d="M12 17.5 C14.5 21.5 18.5 22.5 21.5 20.5 C18.5 20 16 18.5 14.5 16.5 Z" />
            <path class="hen-comb" d="M17.5 6.5 C17 4 18.5 3 19.5 4.2 C20 2.8 22 3 22 4.8 C23.3 4.4 24 5.8 23 7 Z" />
            <path class="hen-beak" d="M24.2 9 L28 10.3 L24.4 11.6 Z" />
            <circle class="hen-eye" cx="21.6" cy="9.4" r="1.05" />
            <path class="hen-legs" d="M15.5 26 L14.5 29.5 M19.5 26 L20.5 29.5" />
          </svg>
        </span>
      </div>
    {:else}
    <div
      class="kill-ribbon"
      class:is-mine={entry.killerId === localId}
      class:is-victim={entry.victimId === localId}
    >
      {#if row.killerSide}
        <span class="kill-crest"><Crest faction={row.killerSide} /></span>
      {/if}
      <span class="kill-name is-killer">{entry.killerName || '—'}</span>
      <span class="kill-weapon" title={entry.weaponId ? weaponName(entry.weaponId) : ''}>
        {#if entry.weaponId}
          <Pictogram weapon={entry.weaponId} />
        {/if}
        {#if entry.headshot}
          <span class="kill-head" title={$t('combat.headshot')} aria-label={$t('combat.headshot')}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.5 L15 9 L23 9.4 L16.8 14.4 L19 22.4 L12 18 L5 22.4 L7.2 14.4 L1 9.4 L9 9 Z" /></svg>
          </span>
        {/if}
      </span>
      <span class="kill-name is-victim">{entry.victimName}</span>
      {#if row.victimSide}
        <span class="kill-crest"><Crest faction={row.victimSide} /></span>
      {/if}
    </div>
    {/if}
    {/if}
  {/each}
</aside>
