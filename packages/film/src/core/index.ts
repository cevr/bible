// Pure film core: the clock, seeded randomness, narration timing, named cues,
// sound cues, scene layout, the mix, the procedural synth and the families
// code sounds are built from. Nothing here touches the DOM at runtime, so the
// Bun scripts and tests import it directly. The entry names what films, their
// kits, the app's sound library and tests import from `@bible/film/core`
// (guarded by exports.test.ts); the framework's own code reads each module by
// its path.

export { type Key, clamp, ease, gait, keys, lerp, staggered } from './time.ts';
export { hash2, rng } from './random.ts';
export { Look, Looks, Movement, Music, Shorts, Sound, defineScript } from './schema.ts';
export { membersOf } from './acts.ts';
export { defineLibrary } from './sfx.ts';
export {
  bloom,
  breeze,
  burst,
  chime,
  drain,
  drone,
  hiss,
  knock,
  notes,
  rain,
  room,
  scatter,
  sizzle,
  thump,
  whoosh,
} from './synth/graph/presets.ts';
export { defineStore } from './store.ts';
export { stagingVoice } from './staging-voice.ts';
