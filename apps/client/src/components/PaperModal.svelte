<script lang="ts">
  import { t } from '../state/locale';

  /** Cream paper dialog with a wooden rail, used for settings and the field manual. */
  export let title: string;
  export let onClose: () => void;

  function onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    onClose();
  }
</script>

<svelte:window on:keydown={onKeydown} />

<div class="modal-layer" role="dialog" aria-modal="true" aria-label={title}>
  <button class="modal-scrim" type="button" aria-label={$t('common.close')} on:click={onClose}></button>
  <section class="modal-panel paper">
    <div class="paper-rail"></div>
    <header class="modal-head">
      <h2 class="display">{title}</h2>
      <button class="icon-btn" type="button" aria-label={$t('common.close')} on:click={onClose}>
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.2 3.2 L12.8 12.8 M12.8 3.2 L3.2 12.8" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" /></svg>
      </button>
    </header>
    <div class="modal-body">
      <slot />
    </div>
  </section>
</div>
