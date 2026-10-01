import { sound as originalSound } from '../righteousness-by-faith/sound.ts';

// The same existing effect variants and jitter, so the original master stays current.
export const sound = { ...originalSound, seed: 'righteousness-by-faith' };
