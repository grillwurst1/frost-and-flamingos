import { CONQUEST_TOWERS, REFERENCE_TOWERS } from '@frost-and-flamingos/shared';
/** Fixed public reference skirmish; its wardrobe is saved separately. */
export const referenceScene = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('scene') === 'reference';
export const sceneTowers = referenceScene ? REFERENCE_TOWERS : CONQUEST_TOWERS;
