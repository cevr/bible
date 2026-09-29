// The procedural synth's public face: a recipe played with a seed, and how
// loud a sound is. Its signal parts (noise, filters, envelopes) stay inside.

export { type Loudness, loudness } from './loudness.ts';
export { Pitch, Recipe, SYNTH_PEAK, noteHz, synthesize } from './recipes.ts';
export { SYNTH_RATE } from './signal.ts';
