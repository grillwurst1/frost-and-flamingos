<script lang="ts">
  import { onMount } from 'svelte';
  import type { TranslationKey } from '@frost-and-flamingos/shared';
  import { comicPops } from '../../state/game';
  import { t } from '../../state/locale';
  import { COMIC_STICKERS, paintedSprites, probeSprite, spriteUrl } from '../icons/painted';
  import ComicText from './ComicText.svelte';

  type Variant = 'rainbow' | 'fire' | 'boom' | 'tock' | 'honk' | 'aaargh' | 'gold' | 'red' | 'ice' | 'cream';

  interface PopLook {
    /** Dictionary id of the word: `comic.<id>.text` and `comic.<id>.sprite`. */
    id: string;
    /** Small caption under the word for combat events, so no information is lost. */
    sub?: TranslationKey;
  }

  /** CSS lettering used when a language has no painted sticker (or it failed to load). */
  const VARIANTS: Record<string, Variant> = {
    boing: 'rainbow',
    pling: 'gold',
    boom: 'boom',
    bang: 'fire',
    tock_tock: 'tock',
    honk_honk: 'honk',
    aaaargh: 'aaargh',
    mooo: 'cream',
    splash: 'ice',
    ponk: 'fire',
    plosh: 'ice',
    bouch: 'red',
  };

  const WORD_KEY = /^comic\.([a-z_]+)\.text$/;

  // Preloaded at boot; probing again is a no-op and keeps this component self-contained.
  onMount(() => {
    for (const name of COMIC_STICKERS) probeSprite(name);
  });

  function lookFor(key: TranslationKey): PopLook | null {
    if (key === 'combat.kill') return { id: 'bang', sub: 'combat.kill' };
    if (key === 'combat.headshot') return { id: 'pling', sub: 'combat.headshot' };
    const match = WORD_KEY.exec(key);
    return match?.[1] ? { id: match[1] } : null;
  }
</script>

{#snippet stars()}
  <svg class="comic-star s1" viewBox="0 0 24 24"><path d="M12 1.5 L15 9 L23 9.4 L16.8 14.4 L19 22.4 L12 18 L5 22.4 L7.2 14.4 L1 9.4 L9 9 Z" /></svg>
  <svg class="comic-star s2" viewBox="0 0 24 24"><path d="M12 1.5 L15 9 L23 9.4 L16.8 14.4 L19 22.4 L12 18 L5 22.4 L7.2 14.4 L1 9.4 L9 9 Z" /></svg>
  <svg class="comic-star s3" viewBox="0 0 24 24"><path d="M12 1.5 L15 9 L23 9.4 L16.8 14.4 L19 22.4 L12 18 L5 22.4 L7.2 14.4 L1 9.4 L9 9 Z" /></svg>
{/snippet}

<div class="comic-pops" aria-hidden="true">
  {#each $comicPops as pop (pop.id)}
    {@const look = lookFor(pop.textKey)}
    <div class="comic-pop" style={`--ox:${pop.offset};--tilt:${pop.tilt}deg`}>
      {#if look}
        {@const word = $t(`comic.${look.id}.text` as TranslationKey)}
        {@const spriteName = $t(`comic.${look.id}.sprite` as TranslationKey)}
        {#if spriteName && $paintedSprites[spriteName] === 'ok'}
          <img class="comic-sprite" src={spriteUrl(spriteName)} alt={word} draggable="false" />
        {:else}
          <ComicText text={word} variant={VARIANTS[look.id] ?? 'fire'} />
          {@render stars()}
        {/if}
        {#if look.sub}
          <span class="comic-sub">{$t(look.sub)}</span>
        {/if}
      {:else}
        <ComicText text={$t(pop.textKey)} variant="fire" />
        {@render stars()}
      {/if}
    </div>
  {/each}
</div>
