<script lang="ts">
  /**
   * Comic lettering: fat rounded display letters, per-letter cel gradients, a thick
   * ink outline and a hard drop shadow (see the BOING! and PLING! references).
   * Each letter is three stacked layers: an ink underlay that carries the outline,
   * an optional light rim and a gradient fill on top. The same component builds the
   * onomatopoeia popups, the death banner and the cover-style logo.
   */
  export let text: string;
  export let variant:
    | 'rainbow'
    | 'fire'
    | 'boom'
    | 'tock'
    | 'honk'
    | 'aaargh'
    | 'gold'
    | 'red'
    | 'ice'
    | 'flamingo'
    | 'cream' = 'fire';

  const RAINBOW_HUES = [196, 34, 112, 208, 330, 345, 160];

  $: words = text.split(/\s+/).filter(Boolean);
</script>

<span class={`comic-text is-${variant}`} role="img" aria-label={text}>
  {#each words as word, wordIndex (wordIndex)}
    <span class="comic-word" style={`--wi:${wordIndex}`}>
      {#each [...word] as letter, index (index)}
        <span
          class="comic-letter"
          style={`--i:${index};--h:${RAINBOW_HUES[index % RAINBOW_HUES.length]}`}
          aria-hidden="true"
        >
          <span class="comic-back">{letter}</span>
          <span class="comic-rim">{letter}</span>
          <span class="comic-front">{letter}</span>
        </span>
      {/each}
    </span>
  {/each}
</span>
