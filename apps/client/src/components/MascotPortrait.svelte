<script lang="ts">
  import type { MascotForm } from '@frost-and-flamingos/shared';

  /** Inline SVG face portraits of the two mascot forms (no text inside). */
  export let form: MascotForm;
  export let size = 72;
  /** 'angry' tightens the brows (charging / slamming), 'dizzy' swirls the eyes. */
  export let mood: 'normal' | 'angry' | 'dizzy' = 'normal';
</script>

{#if form === 'cow'}
  <svg class="portrait" width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
    <circle cx="50" cy="50" r="48" fill="#7dc8f0" stroke="#1b1410" stroke-width="4" />
    <!-- horns -->
    <path d="M28 30 C20 22 18 12 24 6 C26 14 32 20 36 24 Z" fill="#f3e6c4" stroke="#1b1410" stroke-width="3" />
    <path d="M72 30 C80 22 82 12 76 6 C74 14 68 20 64 24 Z" fill="#f3e6c4" stroke="#1b1410" stroke-width="3" />
    <path d="M22 9 C23 7 24 6 24 6 C25 9 26 11 27 12 Z" fill="#5a4636" />
    <path d="M78 9 C77 7 76 6 76 6 C75 9 74 11 73 12 Z" fill="#5a4636" />
    <!-- ears -->
    <ellipse cx="16" cy="42" rx="13" ry="7" transform="rotate(-18 16 42)" fill="#1d1a1b" stroke="#1b1410" stroke-width="3" />
    <ellipse cx="17" cy="42" rx="7" ry="3.5" transform="rotate(-18 17 42)" fill="#f2a7b0" />
    <ellipse cx="84" cy="42" rx="13" ry="7" transform="rotate(18 84 42)" fill="#1d1a1b" stroke="#1b1410" stroke-width="3" />
    <ellipse cx="83" cy="42" rx="7" ry="3.5" transform="rotate(18 83 42)" fill="#f2a7b0" />
    <!-- head -->
    <path d="M26 34 C26 20 74 20 74 34 L76 62 C76 78 24 78 24 62 Z" fill="#f8f5ee" stroke="#1b1410" stroke-width="3.5" />
    <path d="M27 36 C30 26 44 26 46 38 C46 48 36 52 29 48 Z" fill="#1d1a1b" />
    <!-- tuft -->
    <circle cx="46" cy="25" r="5" fill="#ece6da" stroke="#1b1410" stroke-width="2" />
    <circle cx="54" cy="24" r="5" fill="#ece6da" stroke="#1b1410" stroke-width="2" />
    <!-- eyes -->
    {#if mood === 'dizzy'}
      <path d="M38 41 m-6 0 a6 6 0 1 0 12 0 a4 4 0 1 0 -8 0 a2 2 0 1 0 4 0" fill="none" stroke="#1b1410" stroke-width="2.4" />
      <path d="M62 41 m-6 0 a6 6 0 1 0 12 0 a4 4 0 1 0 -8 0 a2 2 0 1 0 4 0" fill="none" stroke="#1b1410" stroke-width="2.4" />
    {:else}
      <ellipse cx="38" cy="42" rx="7.5" ry="9" fill="#fff" stroke="#1b1410" stroke-width="2.6" />
      <ellipse cx="62" cy="42" rx="7.5" ry="9" fill="#fff" stroke="#1b1410" stroke-width="2.6" />
      <circle cx="39" cy="44" r="4.2" fill="#141015" />
      <circle cx="61" cy="44" r="4.2" fill="#141015" />
      <circle cx="40.5" cy="42.5" r="1.4" fill="#fff" />
      <circle cx="62.5" cy="42.5" r="1.4" fill="#fff" />
    {/if}
    {#if mood === 'angry'}
      <path d="M29 30 L45 35" stroke="#1b1410" stroke-width="4.5" stroke-linecap="round" />
      <path d="M71 30 L55 35" stroke="#1b1410" stroke-width="4.5" stroke-linecap="round" />
    {:else}
      <path d="M31 31 Q38 28 45 31" fill="none" stroke="#1b1410" stroke-width="3.5" stroke-linecap="round" />
      <path d="M55 31 Q62 28 69 31" fill="none" stroke="#1b1410" stroke-width="3.5" stroke-linecap="round" />
    {/if}
    <!-- muzzle -->
    <ellipse cx="50" cy="66" rx="24" ry="15" fill="#e8919a" stroke="#1b1410" stroke-width="3.5" />
    <ellipse cx="41" cy="63" rx="4.5" ry="3" fill="#5a2830" />
    <ellipse cx="59" cy="63" rx="4.5" ry="3" fill="#5a2830" />
    <path d="M40 72 Q50 77 60 72" fill="none" stroke="#a24f5c" stroke-width="2.4" stroke-linecap="round" />
    <!-- collar + bell -->
    <path d="M28 80 Q50 90 72 80" fill="none" stroke="#7a4a26" stroke-width="5" />
    <path d="M44 84 L56 84 L60 96 L40 96 Z" fill="#c8742e" stroke="#1b1410" stroke-width="2.5" />
  </svg>
{:else}
  <svg class="portrait" width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
    <circle cx="50" cy="50" r="48" fill="#ff9fc8" stroke="#1b1410" stroke-width="4" />
    <circle cx="50" cy="50" r="38" fill="#7a4a26" stroke="#1b1410" stroke-width="3.5" />
    <!-- fibre strokes -->
    {#each [22, 28, 34, 40, 46, 52, 58, 64, 70, 76] as x (x)}
      <path d={`M${x} ${20 + Math.abs(50 - x) * 0.4} Q${x + 2} 50 ${x - 1} ${80 - Math.abs(50 - x) * 0.4}`} fill="none" stroke="#a9753f" stroke-width="1.6" opacity="0.8" />
    {/each}
    <!-- holes -->
    <circle cx="45" cy="19" r="2.6" fill="#24130a" />
    <circle cx="55" cy="19" r="2.6" fill="#24130a" />
    <circle cx="50" cy="24" r="2.6" fill="#24130a" />
    <!-- eyes -->
    {#if mood === 'dizzy'}
      <path d="M38 44 m-6 0 a6 6 0 1 0 12 0 a4 4 0 1 0 -8 0 a2 2 0 1 0 4 0" fill="none" stroke="#1b1410" stroke-width="2.6" />
      <path d="M62 38 l2 5 5 1 -4 3 1 5 -4 -3 -4 3 1 -5 -4 -3 5 -1 Z" fill="none" stroke="#1b1410" stroke-width="2.4" />
    {:else}
      <ellipse cx="38" cy="44" rx="8.5" ry="8" fill="#fff" stroke="#1b1410" stroke-width="2.6" />
      <ellipse cx="62" cy="44" rx="8.5" ry="8" fill="#fff" stroke="#1b1410" stroke-width="2.6" />
      <circle cx="40" cy="46" r="3" fill="#120c0a" />
      <circle cx="60" cy="46" r="3" fill="#120c0a" />
      <path d="M28 37 L48 41 L48 34 L28 34 Z" fill="#7a4a26" />
      <path d="M72 37 L52 41 L52 34 L72 34 Z" fill="#7a4a26" />
    {/if}
    <path d="M27 31 L46 38" stroke="#1b1410" stroke-width={mood === 'angry' ? 6.5 : 5.5} stroke-linecap="round" />
    <path d="M73 31 L54 38" stroke="#1b1410" stroke-width={mood === 'angry' ? 6.5 : 5.5} stroke-linecap="round" />
    <!-- frown -->
    <path d="M40 62 Q50 55 60 62" fill="none" stroke="#1b1410" stroke-width="3.6" stroke-linecap="round" />
    <!-- lei -->
    {#each [[20, 72, '#ff5fa2'], [31, 79, '#ff8c2e'], [43, 83, '#ffd23f'], [57, 83, '#4fa8ff'], [69, 79, '#fff8ec'], [80, 72, '#ff3d6e']] as [x, y, fill] (x)}
      <circle cx={x} cy={y} r="6" fill={String(fill)} stroke="#1b1410" stroke-width="2" />
      <circle cx={x} cy={y} r="1.8" fill="#ffe066" />
    {/each}
    <path d="M25 77 l-4 4 M37 82 l-2 5 M63 82 l2 5 M75 77 l4 4" stroke="#3fae49" stroke-width="3" stroke-linecap="round" />
  </svg>
{/if}

<style>
  .portrait {
    display: block;
    flex: none;
    filter: drop-shadow(0 2px 0 rgba(27, 20, 16, 0.55));
  }
</style>
