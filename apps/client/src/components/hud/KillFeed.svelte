<script lang="ts">
  import { weaponSlotForId } from '@frost-and-flamingos/shared';
  import type { Faction, WeaponId } from '@frost-and-flamingos/shared';
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
</script>

<aside class="kill-feed" aria-label={$t('combat.killFeed')}>
  {#each rows as row (row.entry.id)}
    {@const entry = row.entry}
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
  {/each}
</aside>
