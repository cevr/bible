// The procedural synth's public face: a recipe played with a seed, and how
// loud a sound is. Its signal parts (noise, filters, envelopes) stay inside.

export { type Described, describeSound } from './analyse.ts';
export { type Loudness, loudness } from './loudness.ts';
export { SEAM_CLICK, SEAM_DB, type Seam, loopSeam, seamHeard } from './seam.ts';
export { Pitch, Recipe, SYNTH_PEAK, noteHz, synthesize } from './recipes.ts';
export { SYNTH_RATE } from './signal.ts';
