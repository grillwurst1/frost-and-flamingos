import type { Locale } from '../types/index.js';
import { de } from './locales/de.js';
import { en } from './locales/en.js';
import type { TranslationDictionary, TranslationKey } from './schema.js';

export type { TranslationDictionary, TranslationKey } from './schema.js';
export { en, de };

export const SUPPORTED_LOCALES: readonly Locale[] = ['en', 'de'];
export const DEFAULT_LOCALE: Locale = 'en';

const dictionaries: Record<Locale, TranslationDictionary> = { en, de };

export function isLocale(value: unknown): value is Locale {
  return value === 'en' || value === 'de';
}

export function resolveLocale(value: unknown): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

export function getDictionary(locale: Locale): TranslationDictionary {
  return dictionaries[locale];
}

export type TranslationParams = Record<string, string | number>;

function interpolate(template: string, params?: TranslationParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

/**
 * Resolve a dot path against the selected dictionary. Keys are strongly typed,
 * so typos are caught by TypeScript before they ever reach the UI.
 */
export function translate(locale: Locale, key: TranslationKey, params?: TranslationParams): string {
  const dictionary = dictionaries[locale];
  const segments = key.split('.');
  let current: unknown = dictionary;
  for (const segment of segments) {
    if (typeof current !== 'object' || current === null || !(segment in current)) {
      return key;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return typeof current === 'string' ? interpolate(current, params) : key;
}

export function formatNumber(locale: Locale, value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(locale, options).format(value);
}

export function formatMeters(locale: Locale, value: number, fractionDigits = 1): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}
