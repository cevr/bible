// Every piece of film data that crosses a boundary, as Schema: the files the
// tools write (`narration/timings.json`, `sound/manifest.json`), the voice a
// film is read in, and the sound it declares. The TypeScript types are derived
// from these, so a decoded file and a hand-written film module share one
// definition. Pure: Schema runs in the browser, the tools and the tests alike.

import { Schema, SchemaTransformation } from 'effect';

/**
 * A JSON file as the repo keeps it: two-space indent and a final newline, which
 * is what the formatter leaves, so a file the tools rewrite never churns.
 */
const fileText = SchemaTransformation.transform<string, string>({
  decode: (text) => text,
  encode: (json) => `${json}\n`,
});

// ---------------------------------------------------------------------------
// Narration

/** One spoken word, in seconds from the start of its take. */
export const Word = Schema.Struct({
  text: Schema.String,
  start: Schema.Finite,
  end: Schema.Finite,
});
export type Word = typeof Word.Type;

/** What narrate records for one scene. */
export const VoiceTiming = Schema.Struct({
  /** Hash of the spoken text; a mismatch means the take is stale. */
  hash: Schema.String,
  file: Schema.String,
  duration: Schema.Finite,
  words: Schema.Array(Word),
});
export type VoiceTiming = typeof VoiceTiming.Type;

/** `narration/timings.json`: every current take, under the voice that read it. */
export const Timings = Schema.Struct({
  /** `voiceKey(voice)`: a different voice makes every take stale. */
  voice: Schema.String,
  scenes: Schema.Record(Schema.String, VoiceTiming),
});
export type Timings = typeof Timings.Type;

/** `timings.json` on disk. */
export const TimingsJson = Schema.String.pipe(
  Schema.decodeTo(Schema.fromJsonString(Timings, { space: 2 }), fileText),
);

/** Who reads a film, and how (`voice.ts`). Changing any of it re-records every beat. */
export const Voice = Schema.Struct({
  voiceId: Schema.String,
  model: Schema.Literals([
    'eleven_v3',
    'eleven_multilingual_v2',
    'eleven_flash_v2_5',
    'eleven_turbo_v2_5',
  ]),
  settings: Schema.Record(Schema.String, Schema.Finite),
});
export type Voice = typeof Voice.Type;

// ---------------------------------------------------------------------------
// Scenes: the part of a scene the clock reads. A drawing adds `draw`, which is
// code, not data; the tools decode only this part.

/** How a scene arrives from the previous one. */
export const Transition = Schema.Union([
  Schema.Struct({ kind: Schema.Literal('cut') }),
  Schema.Struct({ kind: Schema.Literal('fade'), dur: Schema.Finite }),
  /** Slide across one long sheet, like a camera panning a mural. */
  Schema.Struct({
    kind: Schema.Literal('pan'),
    dur: Schema.Finite,
    dir: Schema.optionalKey(Schema.Literals([1, -1])),
  }),
  /** A broad brush stroke sweeps across and leaves the new scene behind it. */
  Schema.Struct({
    kind: Schema.Literal('ink'),
    dur: Schema.Finite,
    color: Schema.optionalKey(Schema.String),
  }),
]);
export type Transition = typeof Transition.Type;

const spanTiming = {
  offset: Schema.optionalKey(Schema.Finite),
  /** Defaults to 0, an instant. */
  dur: Schema.optionalKey(Schema.Finite),
};

/** Where a named cue starts, plus how long it lasts. */
export const Span = Schema.Union([
  /** At a `{mark}` in the scene's narration. */
  Schema.Struct({ mark: Schema.String, ...spanTiming }),
  /** At the end of another cue. */
  Schema.Struct({ after: Schema.String, ...spanTiming }),
  /** At the start of another cue. */
  Schema.Struct({ with: Schema.String, ...spanTiming }),
  /** At a scene landmark: its start, where the voice starts or ends, or its end. */
  Schema.Struct({
    scene: Schema.Literals(['start', 'speech', 'speechEnd', 'end']),
    ...spanTiming,
  }),
]);
export type Span = typeof Span.Type;

/** A scene's timeline: cue name → span. */
export const Timeline = Schema.Record(Schema.String, Span);
export type Timeline = typeof Timeline.Type;

/** The part of a scene the clock reads. */
export const Timed = Schema.Struct({
  id: Schema.String,
  /** Narration, with optional `{mark}` cues. Omit for a silent beat. */
  say: Schema.optionalKey(Schema.String),
  /** Silence before the voice starts. */
  lead: Schema.optionalKey(Schema.Finite),
  /** Silence after the voice ends. */
  tail: Schema.optionalKey(Schema.Finite),
  /** Minimum scene length. */
  min: Schema.optionalKey(Schema.Finite),
  /** How this scene arrives from the previous one. */
  enter: Schema.optionalKey(Transition),
  /** Named moments, anchored to marks or to each other; resolved once in `layout()`. */
  timeline: Schema.optionalKey(Timeline),
});
export type Timed = typeof Timed.Type;

// ---------------------------------------------------------------------------
// Sound

/**
 * A moment on the film clock: a scene, then one of its named cues (its start,
 * or its end with `edge: 'end'`) or a mark in its narration, then an offset in
 * seconds. With neither, the offset counts from the scene's start.
 */
export const Cue = Schema.Struct({
  scene: Schema.String,
  cue: Schema.optionalKey(Schema.String),
  edge: Schema.optionalKey(Schema.Literals(['start', 'end'])),
  mark: Schema.optionalKey(Schema.String),
  offset: Schema.optionalKey(Schema.Finite),
});
export type Cue = typeof Cue.Type;

/** One stretch of the score, from the start of `from` until the next act begins. */
export const Act = Schema.Struct({
  from: Schema.String,
  name: Schema.String,
  styles: Schema.Array(Schema.String),
  avoid: Schema.optionalKey(Schema.Array(Schema.String)),
});
export type Act = typeof Act.Type;

export const MusicModel = Schema.Literals(['music_v2', 'music_v2_5']);

export const Music = Schema.Struct({
  model: MusicModel,
  styles: Schema.Array(Schema.String),
  avoid: Schema.Array(Schema.String),
  acts: Schema.Array(Act),
  /** Linear gain of the bed before it ducks under the voice. */
  gain: Schema.Finite,
});
export type Music = typeof Music.Type;

export const SoundEffect = Schema.Struct({
  prompt: Schema.String,
  secs: Schema.Finite,
  /** Linear gain; 1 leaves the generated level alone. */
  gain: Schema.optionalKey(Schema.Finite),
  at: Schema.Array(Cue),
});
export type SoundEffect = typeof SoundEffect.Type;

/** A film's music and effects (`sound.ts`). */
export const Sound = Schema.Struct({
  music: Schema.optionalKey(Music),
  effects: Schema.Record(Schema.String, SoundEffect),
});
export type Sound = typeof Sound.Type;

/** A generated file, keyed so a changed request is known to be stale. */
export const Asset = Schema.Struct({
  hash: Schema.String,
  file: Schema.String,
});
export type Asset = typeof Asset.Type;

/** `sound/manifest.json`: what has been generated for a film's sound. */
export const SoundManifest = Schema.Struct({
  music: Schema.optionalKey(Asset),
  effects: Schema.Record(Schema.String, Asset),
});
export type SoundManifest = typeof SoundManifest.Type;

/** `sound/manifest.json` on disk. */
export const SoundManifestJson = Schema.String.pipe(
  Schema.decodeTo(Schema.fromJsonString(SoundManifest, { space: 2 }), fileText),
);

/**
 * One timed chunk of the ElevenLabs composition plan for the v2 music models.
 * v2 always honours chunk durations, which is what lets the score turn with
 * the film. Field order is part of the score's hash.
 */
export const PlanChunk = Schema.Struct({
  text: Schema.String,
  duration_ms: Schema.Int,
  positive_styles: Schema.Array(Schema.String),
  negative_styles: Schema.Array(Schema.String),
  context_adherence: Schema.Literal('high'),
});
export type PlanChunk = typeof PlanChunk.Type;

export const Plan = Schema.Struct({ chunks: Schema.Array(PlanChunk) });
export type Plan = typeof Plan.Type;

// ---------------------------------------------------------------------------
// Content keys. Each is the JSON of exactly the fields that change the
// generated audio, so a gain or a comment never makes an asset stale. The
// encoded field order is the key: never reorder these structs.

/** What a voice take depends on besides its text. */
export const VoiceKey = Schema.fromJsonString(Voice.fields.settings);

/** What the score depends on. */
export const MusicRequestKey = Schema.fromJsonString(
  Schema.Struct({ model: MusicModel, plan: Plan }),
);

/** What an effect depends on. */
export const EffectRequestKey = Schema.fromJsonString(
  Schema.Struct({ prompt: Schema.String, secs: Schema.Finite }),
);

// ---------------------------------------------------------------------------
// Export: what the player's `?export` handle reports about the film it loaded.

export const ExportInfo = Schema.Struct({
  width: Schema.Int,
  height: Schema.Int,
  fps: Schema.Finite,
  duration: Schema.Finite,
  frames: Schema.Int,
  /** The mixed track's URL, present only when every take is recorded. */
  audio: Schema.optional(Schema.String),
});
export type ExportInfo = typeof ExportInfo.Type;

/** A point in canvas pixels. */
export const Point = Schema.Tuple([Schema.Finite, Schema.Finite]);
export type Point = typeof Point.Type;

/**
 * One line of text as drawn, from the text probe, in canvas pixels after the
 * transform it was drawn under: its box as four corners (top-left, top-right,
 * bottom-right, bottom-left; rotated with the text), the axis-aligned box
 * around them (`x, y, w, h`), and its effective opacity. `scene` is the scene
 * that drew it.
 */
export const TextBox = Schema.Struct({
  text: Schema.String,
  scene: Schema.String,
  x: Schema.Finite,
  y: Schema.Finite,
  w: Schema.Finite,
  h: Schema.Finite,
  corners: Schema.Tuple([Point, Point, Point, Point]),
  alpha: Schema.Finite,
});
export type TextBox = typeof TextBox.Type;
