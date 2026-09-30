// Pure film core: the clock, seeded randomness, narration timing, named cues,
// sound cues, scene layout, the mix and the procedural synth. Nothing here
// touches the DOM at runtime, so the Bun scripts and tests import it
// directly. The entry names what films, their kits, the app's sound library
// and tests import from `@bible/film/core` (guarded by exports.test.ts); the
// framework's own code reads each module by its path.

export { type Key, clamp, ease, envelope, gait, keys, lerp, progress, staggered } from './time.ts';
export { hash2, rng } from './random.ts';
export {
  LabWrite,
  Look,
  Looks,
  Movement,
  Music,
  Shorts,
  Sound,
  SoundManifest,
  SoundManifestJson,
  TimingsJson,
  Voice,
  defineScript,
} from './schema.ts';
export { hashText, parse, takeScript, voiceKey } from './narration.ts';
export { StudioBeats } from './studio.ts';
export { musicKey, musicPlan } from './sound.ts';
export { type Placed, layout } from './layout.ts';
export { membersOf } from './acts.ts';
export { CatalogueJson } from './catalogue.ts';
export { ChoicePoint, FilmChoices } from './choice.ts';
export { type Pcm } from './audio.ts';
export { type MixPlan, mixPlan } from './mix.ts';
export {
  DEFAULT_JITTER,
  JITTER_DELAY,
  Lock,
  LockEntry,
  LockJson,
  type SoundSource,
  Variant,
  defineLibrary,
  gainFor,
  levelOf,
  requestKey,
  sourceLabel,
} from './sfx.ts';
export { StoreConfig, defineStore } from './store.ts';
