import { derived, get, writable } from 'svelte/store';
import {
  DEFAULT_LOCALE,
  isLocale,
  translate,
  type Locale,
  type TranslationKey,
  type TranslationParams,
} from '@frost-and-flamingos/shared';

const STORAGE_KEY = 'frost-and-flamingos.locale';

function detectLocale(): Locale {
  if (typeof window === 'undefined') return DEFAULT_LOCALE;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isLocale(stored)) return stored;
  } catch {
    // Storage can be unavailable in hardened browser profiles.
  }
  const browserLocale = window.navigator.language.slice(0, 2).toLowerCase();
  return browserLocale === 'de' ? 'de' : DEFAULT_LOCALE;
}

export const locale = writable<Locale>(detectLocale());

locale.subscribe((value) => {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = value;
    document.title = translate(value, 'meta.title');
  }
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Non-fatal: the switcher still works for the current session.
  }
});

export const t = derived(locale, ($locale) => {
  return (key: TranslationKey, params?: TranslationParams): string =>
    translate($locale, key, params);
});

export function setLocale(next: Locale): void {
  locale.set(next);
}

export function currentLocale(): Locale {
  return get(locale);
}

export function translateNow(key: TranslationKey, params?: TranslationParams): string {
  return translate(get(locale), key, params);
}
