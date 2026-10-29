import { AudioEngine } from './engine';
import { resilientAudio } from './lifetime';

export * from './engine';

/** Optional audio must never terminate the game's render/input loop. */
export const audio = resilientAudio(new AudioEngine());
