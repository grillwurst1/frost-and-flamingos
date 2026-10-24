import { en } from './locales/en.js';

/**
 * The English dictionary is the master schema. Every other locale must
 * implement this exact shape, which makes missing or stale keys a build error.
 */
export type TranslationDictionary = typeof en;

type LeafPaths<T, Prefix extends string = ''> = {
  [Key in keyof T & string]: T[Key] extends string
    ? `${Prefix}${Key}`
    : `${Prefix}${Key}.${LeafPaths<T[Key]>}`;
}[keyof T & string];

export type TranslationKey = LeafPaths<TranslationDictionary>;
