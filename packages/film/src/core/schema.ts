// Every piece of film data that crosses a boundary, as Schema: the files the
// tools write (`narration/timings.json`, `sound/manifest.json`), and the
// script, voice and sound a film declares. The TypeScript types are derived
// from these, so a decoded file and a hand-written film module share one
// definition. Pure: Schema runs in the browser, the tools and the tests alike.

import { Array as Arr, Option, Schema, SchemaTransformation } from 'effect';

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

/** Seconds: finite, never negative. */
const Seconds = Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0));

/**
 * How far a take's last word may end past its measured length: the alignment
 * and the decoded take measure the same audio, a frame or so apart at most.
 */
export const TAKE_TOLERANCE = 0.05;

/** One spoken word, in seconds from the start of its take. */
export const Word = Schema.Struct({
  text: Schema.String,
  start: Seconds,
  end: Seconds,
}).check(Schema.makeFilter((w) => w.start <= w.end || `"${w.text}" ends before it starts`));
export type Word = typeof Word.Type;

/** What narrate records for one scene: its words in order, all inside the take. */
export const VoiceTiming = Schema.Struct({
  /** Hash of the spoken text; a mismatch means the take is stale. */
  hash: Schema.String,
  file: Schema.String,
  duration: Seconds,
  words: Schema.Array(Word),
}).check(
  Schema.makeFilter((take) => {
    const issues: Array<Schema.FilterIssue> = [];
    for (const [i, w] of take.words.entries()) {
      const early = Option.exists(Arr.get(take.words, i - 1), (before) => w.start < before.start);
      if (early)
        issues.push({
          path: ['words', i],
          issue: `"${w.text}" starts before the word ahead of it`,
        });
      if (w.end > take.duration + TAKE_TOLERANCE)
        issues.push({
          path: ['words', i],
          issue: `"${w.text}" ends at ${w.end}s, after the ${take.duration}s take`,
        });
    }
    return issues;
  }),
);
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

/** Voice settings as the API takes them: named numbers. */
const VoiceSettings = Schema.Record(Schema.String, Schema.Finite);

/** One voice reads every line, through text-to-speech. */
export const Reader = Schema.Struct({
  voiceId: Schema.String,
  model: Schema.Literals([
    'eleven_v3',
    'eleven_multilingual_v2',
    'eleven_flash_v2_5',
    'eleven_turbo_v2_5',
  ]),
  settings: VoiceSettings,
});
export type Reader = typeof Reader.Type;

/** One voice of a cast: the name a line hands over to with `{@name}`. */
export const CastVoice = Schema.Struct({ name: Schema.String, voiceId: Schema.String });
export type CastVoice = typeof CastVoice.Type;

/**
 * Voices in conversation, every take read through text-to-dialogue, so a
 * question and its answer share one take. The first voice reads until a line
 * hands over to another. The endpoint takes one setting, `stability`, for the
 * whole take.
 */
export const Cast = Schema.Struct({
  model: Schema.Literal('eleven_v3'),
  settings: Schema.Struct({ stability: Schema.Finite }),
  voices: Schema.NonEmptyArray(CastVoice),
}).check(
  Schema.makeFilter((cast) => {
    const names = cast.voices.map((v) => v.name);
    const twice = names.filter((name, i) => names.indexOf(name) !== i);
    return twice.length === 0 || `the cast names ${twice.join(', ')} more than once`;
  }),
);
export type Cast = typeof Cast.Type;

/** Who reads a film, and how (`voice.ts`). Changing any of it re-records every beat. */
export const Voice = Schema.Union([Reader, Cast]);
export type Voice = typeof Voice.Type;

/** Whether a film is read by a cast in conversation rather than by one voice. */
export const isCast = (voice: Voice): voice is Cast => 'voices' in voice;

// ---------------------------------------------------------------------------
// Beats: the script. A beat is what is said, how long it holds and how it
// arrives; its picture is the artboard of the same name in the film's Rive
// project, drawn to the beat's brief.

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
]);
export type Transition = typeof Transition.Type;

/** The part of a beat the clock reads. */
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
});
export type Timed = typeof Timed.Type;

/** One beat of a film's script (`script.ts`). */
export const Beat = Schema.Struct({
  ...Timed.fields,
  /** Sources, in the order the beat uses them. */
  cite: Schema.optionalKey(Schema.Array(Schema.String)),
  /** What the picture does: the brief its scene is drawn to, and its storyboard's card. */
  picture: Schema.String,
});
export type Beat = typeof Beat.Type;

// ---------------------------------------------------------------------------
// Sound

/**
 * A moment on the film clock: a scene, then an Event its main timeline fires
 * (where the film plays the Event's first key) or a mark in its narration,
 * then an offset in seconds. With neither, the offset counts from the scene's
 * start.
 */
export const Cue = Schema.Struct({
  scene: Schema.String,
  event: Schema.optionalKey(Schema.String),
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

/** What a voice take depends on besides its text and its voices. */
export const VoiceKey = Schema.fromJsonString(VoiceSettings);

/** What the score depends on. */
export const MusicRequestKey = Schema.fromJsonString(
  Schema.Struct({ model: MusicModel, plan: Plan }),
);

/** What an effect depends on. */
export const EffectRequestKey = Schema.fromJsonString(
  Schema.Struct({ prompt: Schema.String, secs: Schema.Finite }),
);

// ---------------------------------------------------------------------------
// Export: what the film's page reports about the film it loaded.

export const ExportInfo = Schema.Struct({
  width: Schema.Int,
  height: Schema.Int,
  /** The rate the page draws frames at, which the render asked for. */
  fps: Schema.Finite,
  duration: Schema.Finite,
  frames: Schema.Int,
});
export type ExportInfo = typeof ExportInfo.Type;
