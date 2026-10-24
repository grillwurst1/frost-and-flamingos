<script lang="ts">
  import { locale, setLocale, t } from '../state/locale';
</script>

<div class="language-switcher" role="group" aria-label={$t('language.label')}>
  <button
    type="button"
    aria-pressed={$locale === 'en'}
    title={$t('language.switchTo', { language: $t('language.english') })}
    on:click={() => setLocale('en')}
  >
    EN
  </button>
  <button
    type="button"
    aria-pressed={$locale === 'de'}
    title={$t('language.switchTo', { language: $t('language.german') })}
    on:click={() => setLocale('de')}
  >
    DE
  </button>
</div>
