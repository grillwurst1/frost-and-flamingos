<script lang="ts">
  import type { SkillId, WeaponId } from '@frost-and-flamingos/shared';
  import { paintedTiles, probeTile, tileUrl } from './painted';
  import { skillPictogram, tilePictogram, weaponPictogram } from './pictograms';

  /** A weapon id, a skill id, or any painted tile id from `TILE_FILES` (mascot moves, wrench). */
  export let weapon: WeaponId | null = null;
  export let skill: SkillId | null = null;
  export let tile: string | null = null;
  /**
   * Slot-sized use: prefer the owner's painted PNG tile when it exists and fall back to the
   * inline SVG pictogram otherwise (404, decode failure or no painted art for that id).
   */
  export let painted = false;

  $: tileId = tile ?? weapon ?? skill;
  $: markup = weapon
    ? weaponPictogram(weapon)
    : skill
      ? skillPictogram(skill)
      : tilePictogram(tile);
  $: url = tileId ? tileUrl(tileId) : null;
  $: usePainted = painted && !!tileId && !!url && $paintedTiles[tileId] === 'ok';

  $: if (painted && tileId) probeTile(tileId);
</script>

{#if usePainted && url}
  <img class="pictogram is-painted" src={url} alt="" draggable="false" />
{:else}
  <svg class="pictogram" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
    {@html markup}
  </svg>
{/if}
