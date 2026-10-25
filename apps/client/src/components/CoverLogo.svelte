<script lang="ts">
  import { t } from '../state/locale';
  import ComicText from './hud/ComicText.svelte';

  /** Cover-style wordmark: icy FROST with snow caps, an ampersand and hot-pink FLAMINGOS. */
  export let subtitle = true;

  $: parts = $t('meta.title').split('&');
  $: frost = (parts[0] ?? $t('meta.title')).trim();
  $: flamingos = (parts[1] ?? '').trim();
</script>

<div class="cover-logo">
  <h1 class="logo-heading" aria-label={$t('meta.title')}>
    <span class="logo-row logo-row-top">
      <span class="logo-frost">
        <ComicText text={frost} variant="ice" />
        <svg class="snowcap" viewBox="0 0 300 46" preserveAspectRatio="none" aria-hidden="true">
          <path
            d="M0 34 Q8 8 26 16 Q40 -2 62 12 Q82 2 98 16 Q120 -4 148 12 Q170 0 192 16 Q214 2 238 14 Q262 0 278 18 Q294 14 300 32 L300 40 Q290 34 280 42 Q270 34 258 44 Q246 36 236 42 Q222 32 210 44 Q198 34 188 42 Q172 30 160 44 Q148 34 138 42 Q122 30 110 44 Q98 34 88 42 Q74 32 62 44 Q50 36 40 42 Q28 32 18 44 Q8 36 0 42 Z"
            fill="#ffffff"
            stroke="#1b1410"
            stroke-width="3"
            stroke-linejoin="round"
            vector-effect="non-scaling-stroke"
          />
          <path
            d="M10 30 Q22 22 36 28 M120 26 Q140 20 156 28 M240 28 Q256 20 270 28"
            fill="none"
            stroke="#b9d8f3"
            stroke-width="3"
            stroke-linecap="round"
            vector-effect="non-scaling-stroke"
          />
        </svg>
      </span>
      {#if flamingos}
        <span class="logo-amp"><ComicText text="&" variant="gold" /></span>
      {/if}
    </span>
    {#if flamingos}
      <span class="logo-row logo-row-bottom">
        <span class="logo-flamingos">
          <ComicText text={flamingos} variant="flamingo" />
        </span>
      </span>
    {/if}
  </h1>

  <!-- Pink feathers tucked behind the lettering, as on the cover. -->
  <svg class="logo-feather feather-a" viewBox="0 0 40 80" aria-hidden="true">
    <path d="M20 78 Q4 52 10 26 Q14 10 24 2 Q36 18 34 40 Q32 62 20 78 Z" fill="#ff8fc6" stroke="#1b1410" stroke-width="3" stroke-linejoin="round" />
    <path d="M20 76 Q22 44 24 8" fill="none" stroke="#1b1410" stroke-width="2.4" stroke-linecap="round" />
    <path d="M22 40 Q14 34 12 26 M22 54 Q14 50 11 42" fill="none" stroke="#c4337f" stroke-width="2.2" stroke-linecap="round" />
  </svg>
  <svg class="logo-feather feather-b" viewBox="0 0 40 80" aria-hidden="true">
    <path d="M20 78 Q4 52 10 26 Q14 10 24 2 Q36 18 34 40 Q32 62 20 78 Z" fill="#ffb3d9" stroke="#1b1410" stroke-width="3" stroke-linejoin="round" />
    <path d="M20 76 Q22 44 24 8" fill="none" stroke="#1b1410" stroke-width="2.4" stroke-linecap="round" />
    <path d="M22 40 Q14 34 12 26 M22 54 Q14 50 11 42" fill="none" stroke="#c4337f" stroke-width="2.2" stroke-linecap="round" />
  </svg>

  {#if subtitle}
    <p class="logo-stamp">{$t('meta.subtitle')}</p>
  {/if}
</div>
