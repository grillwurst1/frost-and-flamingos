<script lang="ts">
  import { appError } from '../state/game';
  import { t } from '../state/locale';

  function reload(): void {
    window.location.reload();
  }

  $: titleKey = $appError?.titleKey ?? 'errors.engineTitle';
  $: bodyKey = $appError?.bodyKey ?? 'errors.unknown';
</script>

<div class="fixed inset-0 z-40 grid place-items-center p-4 sm:p-6">
  <div class="overlay-scrim"></div>
  <section class="glass-strong relative w-full max-w-lg rounded-2xl p-6 sm:p-8">
    <span class="eyebrow mb-3">{$t('meta.title')}</span>
    <h1 class="display text-4xl text-white">{$t(titleKey)}</h1>
    <p class="mt-3 text-[0.82rem] leading-relaxed text-glacier-200/70">{$t(bodyKey)}</p>
    <div class="mt-6 flex flex-wrap gap-2">
      <button class="btn-primary" type="button" on:click={reload}>
        {$t('common.retry')}
      </button>
    </div>
    <p class="mt-4 text-[0.64rem] leading-relaxed text-glacier-200/35">
      {$t('menu.serverOfflineHint')}
    </p>
  </section>
</div>
