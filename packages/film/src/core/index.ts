// Pure film core: the clock, seeded randomness, narration timing, named cues,
// sound cues, scene layout, the mix and the procedural synth. Nothing here
// touches the DOM at runtime, so the Bun scripts and tests import it
// directly. The entry names what films, their kits, the app's sound library
// and tests import from `@bible/film/core` (guarded by exports.test.ts); the
// framework's own code reads each module by its path.

export { type Key, clamp, ease, envelope, gait, keys, lerp, progress, staggered } from './time.ts';
export { flicker, hash2, rng } from './random.ts';
export { Look, Looks, Movement, Music, Shorts, Sound, Voice, defineScript } from './schema.ts';
export { membersOf } from './acts.ts';
export { defineLibrary } from './sfx.ts';
export { defineStore } from './store.ts';
