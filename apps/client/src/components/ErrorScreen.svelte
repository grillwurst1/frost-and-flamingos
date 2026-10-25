<script lang="ts">
  import { appError } from '../state/game';
  import { t } from '../state/locale';
  import { sceneUrl } from './icons/painted';

  function reload(): void {
    window.location.reload();
  }

  $: titleKey = $appError?.titleKey ?? 'errors.engineTitle';
  $: bodyKey = $appError?.bodyKey ?? 'errors.unknown';
</script>

<div class="overlay-center is-error" style={`--error-art:url(${sceneUrl(5)})`}>
  <div class="overlay-scrim is-art"></div>
  <section class="error-panel paper">
    <div class="paper-rail"></div>
    <div class="panel-inner">
      <span class="eyebrow">{$t('meta.title')}</span>
      <h1 class="display error-title">{$t(titleKey)}</h1>
      <p class="panel-lead">{$t(bodyKey)}</p>
      <div class="error-actions">
        <button class="btn-primary" type="button" on:click={reload}>
          {$t('common.retry')}
        </button>
      </div>
      <p class="field-hint">{$t('menu.serverOfflineHint')}</p>
    </div>
  </section>
</div>
