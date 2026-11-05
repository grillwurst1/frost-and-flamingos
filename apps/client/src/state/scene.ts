import { CONQUEST_TOWERS, REFERENCE_TOWERS } from '@frost-and-flamingos/shared';
/** The owner's PHOTO scene is the public default; the full field remains
 * explicitly available, with its separately saved wardrobe, at ?scene=field. */
export const referenceScene = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('scene') !== 'field';
export const sceneTowers = referenceScene ? REFERENCE_TOWERS : CONQUEST_TOWERS;
