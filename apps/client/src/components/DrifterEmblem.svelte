<script lang="ts">
  import type { DrifterForm } from '@frost-and-flamingos/shared';

  /**
   * Comic emblem of the drifter class: a pale floating silhouette in an inked
   * medallion (icy blue for the Creepy Mountain Girl, coral for the Hot Beach
   * Girl) with a dashed "pass-through" ring. UI iconography only.
   */
  export let form: DrifterForm = 'mountain_girl';
  export let size = 44;

  $: beach = form === 'beach_girl';
  $: fill = beach ? '#ffb38a' : '#bfe3ff';
  $: rim = beach ? '#f0508c' : '#2f7fd8';
  $: figure = beach ? '#fff4e8' : '#f6fbff';
  $: hair = beach ? '#7a3b1e' : '#1b1410';
</script>

<svg class="drifter-emblem" viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" focusable="false">
  <circle cx="32" cy="32" r="29" fill={fill} stroke="#1b1410" stroke-width="3.4" />
  <circle cx="32" cy="32" r="23.5" fill="none" stroke={rim} stroke-width="2.6" stroke-dasharray="4.5 3.5" opacity="0.9" />
  <!-- Long hair behind the head, then the hovering dress with a ragged hem. -->
  <path d="M22 19 C22 10 42 10 42 19 L44 34 L20 34 Z" fill={hair} stroke="#1b1410" stroke-width="2" stroke-linejoin="round" />
  <ellipse cx="32" cy="20.5" rx="6.6" ry="7.6" fill={figure} stroke="#1b1410" stroke-width="2" />
  <path
    d="M24.5 30 Q32 25.5 39.5 30 L43 47 L39.5 45 L37 48.5 L34 45.5 L31 49 L28 45.5 L25 48.5 L21 46.5 Z"
    fill={figure}
    stroke="#1b1410"
    stroke-width="2"
    stroke-linejoin="round"
  />
  <ellipse cx="29.4" cy="20.6" rx="1.5" ry="2.1" fill="#1b1410" />
  <ellipse cx="34.6" cy="20.6" rx="1.5" ry="2.1" fill="#1b1410" />
  <!-- Hover gap: a soft shadow under the hem. -->
  <ellipse cx="32" cy="55" rx="9" ry="1.8" fill="#1b1410" opacity="0.28" />
</svg>

<style>
  .drifter-emblem {
    flex: none;
    display: block;
  }
</style>
