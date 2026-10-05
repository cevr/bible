// Every piece of film data that crosses a boundary, as Schema: the files the
// tools write (`narration/timings.json`, `sound/manifest.json`), the voice a
// film is read in, and the sound it declares. The TypeScript types are derived
// from these, so a decoded file and a hand-written film module share one
// definition. Pure: Schema runs in the browser, the tools and the tests alike.

import { Array as Arr, Option, Schema, SchemaTransformation, Struct } from 'effect';
import { ActName, Address, PartId } from './address-schema.ts';
import { inspected } from './field.ts';
import type { ease } from './time.ts';

/**
 * `schema` as a JSON file the repo keeps: two-space indent and a final
 * newline, which is what the formatter leaves, so a file the tools rewrite
 * never churns.
 */
export const repoJson = <S extends Parameters<typeof Schema.fromJsonString>[0]>(schema: S) =>
  Schema.String.pipe(
    Schema.decodeTo(
      Schema.fromJsonString(schema, { space: 2 }),
      SchemaTransformation.transform<string, string>({
        decode: (text) => text,
        encode: (json) => `${json}\n`,
      }),
    ),
  );

/** The names `names` holds more than once, each once, in first-seen order. */
const repeated = (names: ReadonlyArray<string>): ReadonlyArray<string> => [
  ...new Set(names.filter((name, i) => names.indexOf(name) !== i)),
];

// ---------------------------------------------------------------------------
// Narration

/** Seconds: finite, never negative. */
export const Seconds = Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0));

/** A key a JSON file may leave out, read as an `Option`. */
export const maybe = <S extends Schema.Top>(schema: S) => Schema.OptionFromOptionalKey(schema);

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

/**
 * Seconds at which a voice is heard (measured from the take's audio,
 * `voiced.ts`), not where the aligner puts a word, pause before it and all.
 * Branded, so aligned seconds passed where the ear is met (a short's
 * captions, its hook, its loop) are a type error.
 */
export const Heard = Seconds.pipe(Schema.brand('Heard'));
export type Heard = typeof Heard.Type;

/** Where a word's voice is heard, in seconds from the start of its take. */
export const Voiced = Schema.Struct({ start: Heard, end: Heard });
export type Voiced = typeof Voiced.Type;

/** A word timed by its voice (`heard` in `voiced.ts`): its span is where it is heard. */
export interface HeardWord extends Voiced {
  readonly text: string;
}

/**
 * A word of a take: its span as the aligner timed it (`start`, `end`, which
 * hold the pause before the word), and where inside that span its voice is
 * heard (`voiced`, measured from the take's audio when it is timed:
 * `voiced.ts`). A caption, a hook or a loop that must meet the ear reads
 * `voiced`; a mark reads the aligned `start`.
 */
export const TakeWord = Schema.Struct({
  text: Schema.String,
  start: Seconds,
  end: Seconds,
  voiced: Voiced,
}).check(
  Schema.makeFilter((w) => {
    if (w.start > w.end) return `"${w.text}" ends before it starts`;
    const { start, end } = w.voiced;
    return (
      (w.start <= start && start <= end && end <= w.end) ||
      `"${w.text}" is heard ${start}–${end}s, outside its ${w.start}–${w.end}s span`
    );
  }),
);
export type TakeWord = typeof TakeWord.Type;

/**
 * Who read a take: the ElevenLabs staging voice (`narrate`), or a person
 * (`takes import`, the lab's studio). Staging never replaces a recorded take.
 */
export const TakeSource = Schema.Literals(['elevenlabs', 'recorded']);
export type TakeSource = typeof TakeSource.Type;

/** What narrate records for one scene: its words in order, all inside the take. */
export const VoiceTiming = Schema.Struct({
  /** Hash of the spoken text; a mismatch means the take is stale. */
  hash: Schema.String,
  file: Schema.String,
  duration: Seconds,
  words: Schema.Array(TakeWord),
  /**
   * A take stored with no source was staged: it reads as `elevenlabs`, and a
   * staged take is written with none, so the committed timings never churn.
   */
  source: Schema.optionalKey(TakeSource).pipe(
    Schema.decodeTo(
      TakeSource,
      SchemaTransformation.transformOptional({
        decode: (source) => Option.orElseSome(source, (): TakeSource => 'elevenlabs'),
        encode: (source) => Option.filter(source, (s) => s !== 'elevenlabs'),
      }),
    ),
  ),
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
export const TimingsJson = repoJson(Timings);

/** Voice settings as the API takes them: named numbers. */
const VoiceSettings = Schema.Record(Schema.String, Schema.Finite);

/**
 * Settings a model reads, and nothing else: the API ignores a key it does not
 * know, so a slider the model lacks would change the take's key and nothing
 * in the take. Each is a number from 0 to 1.
 */
const settingsOnly = (model: string, keys: ReadonlyArray<string>) =>
  Schema.makeFilter((settings: Readonly<Record<string, number>>) => {
    const entries = Object.entries(settings);
    const unknown = entries.filter(([key]) => !keys.includes(key)).map(([key]) => key);
    if (unknown.length > 0) {
      return `${model} takes ${keys.join(' and ')} only, not ${unknown.join(', ')}`;
    }
    const out = entries.filter(([, value]) => value < 0 || value > 1).map(([key]) => key);
    return out.length === 0 || `${out.join(', ')} must be from 0 to 1`;
  });

/**
 * One voice reads every line, through text-to-speech. `eleven_v4` has two
 * sliders, `stability` and `similarity_boost` (no style, no speed); the
 * earlier models take any setting the API names.
 */
export const Reader = Schema.Union([
  Schema.Struct({
    voiceId: Schema.String,
    model: Schema.Literals(['eleven_v3', 'eleven_multilingual_v2', 'eleven_flash_v2_5']),
    settings: VoiceSettings,
  }),
  Schema.Struct({
    voiceId: Schema.String,
    model: Schema.Literal('eleven_v4'),
    settings: VoiceSettings.check(settingsOnly('eleven_v4', ['stability', 'similarity_boost'])),
  }),
]);
export type Reader = typeof Reader.Type;

/** One voice of a cast: the name a line hands over to with `{@name}`. */
const CastVoice = Schema.Struct({ name: Schema.String, voiceId: Schema.String });
type CastVoice = typeof CastVoice.Type;

/**
 * Voices in conversation, every take read through text-to-dialogue, so a
 * question and its answer share one take. The first voice reads until a line
 * hands over to another. The endpoint takes two settings for the whole take:
 * `stability`, and `similarity` (how close to the source voice; the API's
 * default is 0.75 when it is left out).
 */
export const Cast = Schema.Struct({
  model: Schema.Literals(['eleven_v3', 'eleven_v4']),
  settings: VoiceSettings.check(
    Schema.makeFilter(
      (settings: Readonly<Record<string, number>>) =>
        'stability' in settings || 'a cast needs stability',
    ),
    settingsOnly('text-to-dialogue', ['stability', 'similarity']),
  ),
  voices: Schema.NonEmptyArray(CastVoice),
}).check(
  Schema.makeFilter((cast) => {
    const twice = repeated(cast.voices.map((v) => v.name));
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
// Scenes: the part of a scene the clock reads. A drawing adds `draw`, which is
// code, not data; the tools decode only this part.

/** How a scene arrives from the previous one. */
export const Transition = Schema.Union([
  Schema.Struct({ kind: Schema.Literal('cut') }),
  Schema.Struct({ kind: Schema.Literal('fade'), dur: Seconds }),
  /** Slide across one long sheet, like a camera panning a mural. */
  Schema.Struct({
    kind: Schema.Literal('pan'),
    dur: Seconds,
    dir: Schema.optionalKey(Schema.Literals([1, -1])),
  }),
  /** A broad brush stroke sweeps across and leaves the new scene behind it. */
  Schema.Struct({
    kind: Schema.Literal('ink'),
    dur: Seconds,
    color: Schema.optionalKey(Schema.String),
  }),
]);
export type Transition = typeof Transition.Type;

/** The name of an easing curve in `ease` (`time.ts`), so a cue's easing is data. */
export const EaseName = Schema.Literals([
  'linear',
  'inQuad',
  'outQuad',
  'inOutQuad',
  'inCubic',
  'outCubic',
  'inOutCubic',
  'outQuart',
  'inOutQuart',
  'outExpo',
  'inOutExpo',
  'inSine',
  'inOutSine',
  'outBack',
  'outSoft',
]);
export type EaseName = typeof EaseName.Type;

/** Fails the typecheck unless `EaseName` names every curve in `ease` and nothing else. */
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;
type _EaseNamesMatch = Assert<Same<EaseName, keyof typeof ease>>;

/** A scene's landmarks: its start, where its voice starts and ends, and its end. */
const Landmark = Schema.Literals(['start', 'speech', 'speechEnd', 'end']);
type Landmark = typeof Landmark.Type;

/** A key a point must not name beside its own anchor. */
const none = Schema.optionalKey(Schema.Never);

/** A `{mark}` in the scene's narration, or the first `word` said at or after it. */
const onMark = {
  mark: Schema.String,
  /** Pin to this word at or after the mark, not the mark; read as a take is checked (`normalizeWords`). */
  word: Schema.optionalKey(Schema.String),
  cue: none,
  edge: none,
  at: none,
};

/** A named cue's start, or its end with `edge: 'end'`. */
const onCue = {
  cue: Schema.String,
  edge: Schema.optionalKey(Schema.Literals(['start', 'end'])),
  mark: none,
  word: none,
  at: none,
};

/** A scene landmark. */
const onLandmark = { at: Landmark, mark: none, word: none, cue: none, edge: none };

/**
 * A point in a scene, never at a second: a `{mark}` (where the word it
 * precedes starts) or a word pinned after it, a named cue (its start, or its
 * end with `edge: 'end'`; a short's `to` takes the end when no edge is
 * named), or a landmark. A point names one anchor. A short's spans, the
 * sound's cues and a timeline's anchors (`anchorPoint`) all resolve through
 * one function, `pointIn`.
 */
export const ScenePoint = Schema.Union([
  Schema.Struct(onMark),
  Schema.Struct(onCue),
  Schema.Struct(onLandmark),
]);
export type ScenePoint = typeof ScenePoint.Type;

/** A share of a cue, from none of it to all of it. */
const Share = Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1 }));

const spanTiming = {
  offset: Schema.optionalKey(Schema.Finite),
  /** How `f.at(name)` eases across the cue. Defaults to `DEFAULT_EASE` (`time.ts`). */
  ease: Schema.optionalKey(EaseName),
  /**
   * The share of the cue over which `f.stagger(name, i, n)` spreads its items'
   * starts; each item lasts the rest. Defaults to 0: every item is the whole cue.
   */
  stagger: Schema.optionalKey(Share),
  /**
   * The cue is a designed silence: `film check` lets the master fall quiet
   * across it without a `DeadAir` finding. Only where the script means one
   * (after the key quotation, the black moment, the beat before the last word).
   */
  silence: Schema.optionalKey(Schema.Literal(true)),
};

/** A span that lasts its length: from its anchor, or up to it. */
const byDur = {
  /** Defaults to 0, an instant. */
  dur: Schema.optionalKey(Seconds),
  /**
   * The span ends at its anchor (plus `offset`) and starts `dur` before it:
   * a motion that lands on its moment, so a `dur` edit keeps the landing.
   */
  ends: Schema.optionalKey(Schema.Literal(true)),
  until: Schema.optionalKey(Schema.Never),
  untilOffset: Schema.optionalKey(Schema.Never),
};

/**
 * Where a span runs `until`: a `{mark}` in the scene's narration (its name),
 * a scene landmark (`{ at: 'speechEnd' }`), so a re-take moves the end with
 * it, or another cue's edge (`{ cue: 'roll' }`, its end unless `edge` names
 * the start), so a lab drag of that cue moves the end with it.
 */
export const Until = Schema.Union([
  Schema.String,
  Schema.Struct({ at: Landmark, cue: none, edge: none }),
  Schema.Struct({
    cue: Schema.String,
    edge: Schema.optionalKey(Schema.Literals(['start', 'end'])),
    at: none,
  }),
]);
export type Until = typeof Until.Type;

/** A span that ends on a mark, a landmark or a cue's edge, or a set time off it. */
const untilPoint = {
  until: Until,
  /**
   * Where the span ends off its `until` point, in seconds (negative: before
   * it), as `offset` is where it starts off its anchor. The end still follows
   * the point: a lab drag of the end off it writes this, never a `dur`.
   * Defaults to 0, on the point.
   */
  untilOffset: Schema.optionalKey(Schema.Finite),
  dur: Schema.optionalKey(Schema.Never),
  ends: Schema.optionalKey(Schema.Never),
};

/** One anchor's two spans: ended by `dur`, or `until` a mark, a landmark or a cue's edge; never both. */
const anchored = <A extends Schema.Struct.Fields>(anchor: A) =>
  [
    Schema.Struct({ ...anchor, ...spanTiming, ...byDur }),
    Schema.Struct({ ...anchor, ...spanTiming, ...untilPoint }),
  ] as const;

/**
 * Where a named cue starts (or, with `ends`, lands), plus how long it lasts:
 * at a `{mark}` in the scene's narration, or at the first `word` said at or
 * after it (a word pin, for a beat on a word that has no mark:
 * `{ mark: 'gift', word: 'faith' }`; a line that never says it there is
 * `WordMissing` at layout), at the end of another cue (`after`), at its start
 * (`with`), or at a scene landmark (`at`: its start, where the voice starts
 * or ends, or its end). Each anchor is a `ScenePoint` (`anchorPoint`), resolved
 * as every other point in a scene is.
 */
export const Span = Schema.Union([
  ...anchored({
    mark: Schema.String,
    /** Pin to this word at or after the mark, not the mark; read as a take is checked (`normalizeWords`). */
    word: Schema.optionalKey(Schema.String),
  }),
  ...anchored({ after: Schema.String }),
  ...anchored({ with: Schema.String }),
  ...anchored({ at: Landmark }),
]);
export type Span = typeof Span.Type;

/** A scene's timeline: cue name → span. */
export const Timeline = Schema.Record(Schema.String, Span);
export type Timeline = typeof Timeline.Type;

/** One coordinate of a point, in canvas pixels: a pixel a step, ten with Shift, a hundredth with Alt. */
export const Pixel = Schema.Finite.annotate(
  inspected({ unit: 'px', step: 1, coarse: 10, fine: 0.01 }),
);

/** A point in canvas pixels. */
export const Point = Schema.Tuple([Pixel, Pixel]);
export type Point = typeof Point.Type;

/** A knob's number (a zoom, a turn, a share): a hundredth a step, a tenth with Shift, a thousandth with Alt. */
export const KnobNumber = Schema.Finite.annotate(
  inspected({ step: 0.01, coarse: 0.1, fine: 0.001 }),
);

/** A value a drawing reads by name (`f.knob`) instead of hard-coding: a number or a point. */
export const Knob = Schema.Union([KnobNumber, Point]);
export type Knob = typeof Knob.Type;

/** A drawing's knobs: name → value, the one place the value lives. */
export const Knobs = Schema.Record(Schema.String, Knob);
export type Knobs = typeof Knobs.Type;

/** The part of a scene the clock reads. */
export const Timed = Schema.Struct({
  /** Names the scene's files, its address and its render's choice point. */
  id: PartId,
  /** Narration, with optional `{mark}` cues. Omit for a silent beat. */
  say: Schema.optionalKey(Schema.String),
  /** Silence before the voice starts. */
  lead: Schema.optionalKey(Seconds),
  /** Silence after the voice ends. */
  tail: Schema.optionalKey(Seconds),
  /** Minimum scene length. */
  min: Schema.optionalKey(Seconds),
  /** How this scene arrives from the previous one. */
  enter: Schema.optionalKey(Transition),
  /** Named moments, anchored to marks or to each other; resolved once in `layout()`. */
  timeline: Schema.optionalKey(Timeline),
  /** Named numbers and points the drawing reads with `f.knob`. */
  knobs: Schema.optionalKey(Knobs),
  /**
   * Set by `storyboard()`: the beat has no drawing yet and plays as its card.
   * A card holds still over its words by design, so `film check` reports no
   * `StaticHold` in it.
   */
  storyboard: Schema.optionalKey(Schema.Literal(true)),
});
export type Timed = typeof Timed.Type;

/**
 * One beat of a film's script (`script.ts`): what is said and how it is
 * timed, its sources, and the brief its drawing follows. The drawing's own
 * timeline and knobs live beside the drawing, not in the script.
 */
export const Beat = Schema.Struct({
  id: Timed.fields.id,
  say: Timed.fields.say,
  lead: Timed.fields.lead,
  tail: Timed.fields.tail,
  min: Timed.fields.min,
  enter: Timed.fields.enter,
  /** Sources, in the order they are used; they feed the end card and sources.md. */
  cite: Schema.optionalKey(Schema.Array(Schema.String)),
  /** What the picture does: the brief for the scene's drawing. */
  picture: Schema.String,
});
export type Beat = typeof Beat.Type;

/**
 * A film's script: its beats in order, each id kept as written, so a
 * registry keyed by beat (`scenesOf`'s drawings, a light per scene) names only
 * beats the script has. An identity.
 */
export const defineScript = <const Id extends string>(
  beats: ReadonlyArray<Beat & { readonly id: Id }>,
): ReadonlyArray<Beat & { readonly id: Id }> => beats;

/**
 * `script.ts`'s optional `heardAs`: a word of the script (a name, mostly) and
 * the ways speech-to-text writes it, so a take that reads it right is not a
 * mismatch: `{ Ellet: ['Elliot', 'Elliott'] }`.
 */
export const HeardAs = Schema.Record(Schema.String, Schema.Array(Schema.String));
export type HeardAs = typeof HeardAs.Type;

// ---------------------------------------------------------------------------
// Shorts

/** One stretch of one scene a short plays: `from` a point `to` a later one. */
export const ShortSpan = Schema.Struct({
  scene: Schema.String,
  from: ScenePoint,
  to: ScenePoint,
});
export type ShortSpan = typeof ShortSpan.Type;

/** A vertical short cut from a film (`shorts.ts`): its spans, played back to back. */
export const Short = Schema.Struct({
  /** Names its files (`out/<film>/shorts/<id>.mp4`) and its address. */
  id: PartId,
  title: Schema.String,
  /**
   * The line set above the picture from the first frame for its first
   * seconds (`SHORT_LAYOUT`), for the viewer who watches with the sound off:
   * the narrator's own question, or a claim against expectation.
   */
  hook: Schema.optionalKey(Schema.NonEmptyString),
  spans: Schema.NonEmptyArray(ShortSpan),
});
export type Short = typeof Short.Type;

/** A film's `shorts.ts`: its shorts, each id once. */
export const Shorts = Schema.Array(Short).check(
  Schema.makeFilter((shorts) => {
    const twice = repeated(shorts.map((s) => s.id));
    return twice.length === 0 || `short ids must be unique: ${twice.join(', ')}`;
  }),
);
export type Shorts = typeof Shorts.Type;

// ---------------------------------------------------------------------------
// Sound

/** A sound cue's scene and its nudge off the point, in seconds. */
const inScene = { scene: Schema.String, offset: Schema.optionalKey(Schema.Finite) };

/**
 * A moment on the film clock: a scene, a point in it (`ScenePoint`: a mark,
 * a named cue's edge or a landmark such as `speech`), and an offset in
 * seconds: `{ scene: 'mirror', at: 'speech' }`, `{ scene: 'roof', cue: 'lower' }`.
 * The scene's start is a landmark like the rest: `{ scene: 'cold', at: 'start' }`.
 */
export const Cue = Schema.Union([
  Schema.Struct({ ...inScene, ...onMark }),
  Schema.Struct({ ...inScene, ...onCue }),
  Schema.Struct({ ...inScene, ...onLandmark }),
]);
export type Cue = typeof Cue.Type;

/**
 * One movement of the score: from the start of `from` until the next movement
 * begins (the first opens the film). Movements turn where the music does, so
 * they need not fall on the film's acts (`look.acts`).
 */
export const Movement = Schema.Struct({
  from: Schema.String,
  name: Schema.String,
  styles: Schema.Array(Schema.String),
  avoid: Schema.optionalKey(Schema.Array(Schema.String)),
});
export type Movement = typeof Movement.Type;

export const MusicModel = Schema.Literals(['music_v2', 'music_v2_5']);

/** One score for the film: a musical language (its styles), in movements timed to the film. */
export const Music = Schema.Struct({
  model: MusicModel,
  styles: Schema.Array(Schema.String),
  avoid: Schema.Array(Schema.String),
  movements: Schema.Array(Movement),
});
export type Music = typeof Music.Type;

/**
 * The film's score: one or more options, each a whole score in its own
 * musical language, composed for the whole film; `play` names the one the mix
 * plays (`mix --score <option>` plays another). The levels are dB against the
 * voice as the mix measures it: `under` wherever anyone speaks (short gaps
 * included), `alone` where no one speaks for a while (the title card, the
 * landing, the credits).
 */
export const Score = Schema.Struct({
  play: Schema.String,
  under: Schema.Finite,
  alone: Schema.Finite,
  options: Schema.Record(Schema.String, Music),
}).check(
  Schema.makeFilter(
    (score) =>
      Object.hasOwn(score.options, score.play) ||
      `plays "${score.play}", which is none of its options (${Object.keys(score.options).join(', ')})`,
  ),
);
export type Score = typeof Score.Type;

/**
 * A one-shot from the app's sound library (`sounds/library.ts`), placed on
 * each of its cues. A film names sounds, never prompts.
 */
export const SoundEffect = Schema.Struct({
  /** The library's name for it: `paper.slide`. */
  sound: Schema.String,
  /** Its level in dB relative to the voice; else the library's, else the one-shot default. */
  level: Schema.optionalKey(Schema.Finite),
  /**
   * What lands on each cue, as the lock records it for each take (so a take
   * with a slow start needs no hand offset and a kept take swapped for
   * another stays on the cue): `'onset'`, where its sound begins (a
   * sustained sound, steps or a creak, whose silent lead-in would be heard
   * late); `'hit'`, its loudest moment (an impact, the rest played before
   * it); `'start'` (the default), its first sample.
   */
  sync: Schema.optionalKey(Schema.Literals(['start', 'onset', 'hit'])),
  at: Schema.Array(Cue),
});
export type SoundEffect = typeof SoundEffect.Type;

/**
 * A bed: a library sound looped from one cue to another, crossfaded into
 * itself where it wraps, faded in and out, ducked under the voice unless the
 * library says it sits under everything.
 */
const SoundBed = Schema.Struct({
  sound: Schema.String,
  /** dB relative to the voice; else the library's, else the bed default. */
  level: Schema.optionalKey(Schema.Finite),
  from: Cue,
  to: Cue,
  /** Seconds each end fades over; `BED_FADE` when none. */
  fade: Schema.optionalKey(Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0))),
});
type SoundBed = typeof SoundBed.Type;

/** A film's score, beds and effects (`sound.ts`). */
export const Sound = Schema.Struct({
  /** Effect variant and jitter identity. Defaults to the film's name; reuse it for another visual version. */
  seed: Schema.optionalKey(Schema.String),
  score: Schema.optionalKey(Score),
  beds: Schema.optionalKey(Schema.Array(SoundBed)),
  effects: Schema.Record(Schema.String, SoundEffect),
});
export type Sound = typeof Sound.Type;

/**
 * A score option as it was composed: its request hash, its file under the
 * film's `sound/` (private: generated music never sits in the public repo)
 * and the sha256 of its bytes, which the private store keeps it under.
 */
export const ScoreAsset = Schema.Struct({
  hash: Schema.String,
  file: Schema.String,
  sha256: Schema.String,
});
export type ScoreAsset = typeof ScoreAsset.Type;

/**
 * `sound/manifest.json`: each score option composed for the film, by option
 * name. Its effects and beds are the library's.
 */
export const SoundManifest = Schema.Struct({
  scores: Schema.optionalKey(Schema.Record(Schema.String, ScoreAsset)),
});
export type SoundManifest = typeof SoundManifest.Type;

/** `sound/manifest.json` on disk. */
export const SoundManifestJson = repoJson(SoundManifest);

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

/** A range of a measure, low to high, both included. */
const Range = Schema.Tuple([Schema.Finite, Schema.Finite]);

/**
 * One act of a film (`look.acts`, declared in film order): where it starts,
 * its chapter title, and the light it should measure. An act holds its
 * scenes (`membersOf`): the film's colour script, lights and chapters all
 * read them.
 */
export const Act = Schema.Struct({
  /** The scene the act starts on; it runs until the next act's. The first holds every scene before it. */
  from: PartId,
  /** The act's name, for the report: `cold open`, `valley`. */
  name: ActName,
  /**
   * The narrator's question that opens the act, in the viewer's words: its
   * YouTube chapter title (`film chapters`).
   */
  chapter: Schema.optionalKey(Schema.String),
  /** Mean luma, 0–255, the act's frames should measure. */
  luma: Schema.optionalKey(Range),
  /** Mean saturation, 0–1. */
  saturation: Schema.optionalKey(Range),
  /** The most of its frames that may be darker than luma 60, 0–1. */
  dark: Schema.optionalKey(Share),
});
export type Act = typeof Act.Type;

/**
 * A film's declared look (`export const look` in `film.ts`): its acts, in
 * film order, each named once, since `act:<name>` addresses one part.
 */
export const Look = Schema.Struct({
  acts: Schema.Array(Act).check(
    Schema.makeFilter((acts) => {
      const twice = repeated(acts.map((a) => a.name));
      return twice.length === 0 || `acts must be named once: ${twice.join(', ')}`;
    }),
  ),
});
export type Look = typeof Look.Type;

/**
 * A look the film chooses between at named levels (the ground's lift: `now`,
 * `light`, `lighter`): each level's value, and `play`, the one the film is
 * drawn at. The review compares them and a pick rewrites `play`.
 */
const LookOption = Schema.Struct({
  options: Schema.Record(Schema.String, Schema.Finite),
  play: Schema.String,
}).check(
  Schema.makeFilter(
    (look) =>
      Object.hasOwn(look.options, look.play) ||
      `plays "${look.play}", which is none of its levels (${Object.keys(look.options).join(', ')})`,
  ),
);
type LookOption = typeof LookOption.Type;

/** A film's look options by name (`export const looks` in `palette.ts`). */
export const Looks = Schema.Record(Schema.String, LookOption);
export type Looks = typeof Looks.Type;

// ---------------------------------------------------------------------------
// Lab notes: what a viewer marks on a frame in the lab (`film lab`), and the
// thread the agent answers it in. `lab/<film>/notes.json` holds them; stills sit
// beside it in `stills/`.

/** A pinned point (`w` and `h` 0) or a dragged box, in canvas pixels. */
export const NoteBox = Schema.Struct({
  x: Schema.Finite,
  y: Schema.Finite,
  w: Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0)),
  h: Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0)),
});
export type NoteBox = typeof NoteBox.Type;

/** One freehand pen stroke, in canvas pixels. */
export const InkStroke = Schema.Array(Point);
export type InkStroke = typeof InkStroke.Type;

export const NoteAuthor = Schema.Literals(['user', 'agent']);
export type NoteAuthor = typeof NoteAuthor.Type;

/** `open` until the agent replies (`replied`); a user reply opens it again; `resolved` closes it. */
export const NoteStatus = Schema.Literals(['open', 'replied', 'resolved']);
export type NoteStatus = typeof NoteStatus.Type;

/** A change's place in the film's note log: every change takes the next number. */
const Seq = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));

export const Reply = Schema.Struct({
  seq: Seq,
  by: NoteAuthor,
  text: Schema.String,
  /** A still file in `stills/`, e.g. the agent's after-frame. */
  still: Schema.optionalKey(Schema.String),
  /** ISO time. */
  at: Schema.String,
});
export type Reply = typeof Reply.Type;

/** The named cue edge nearest the note's time, in its scene. */
export const NoteCue = Schema.Struct({
  name: Schema.String,
  edge: Schema.Literals(['start', 'end']),
});
export type NoteCue = typeof NoteCue.Type;

/**
 * A stretch of a note's scene the note is about, in scene-local seconds (as
 * the lab's `#t=` and the note's `local` count them): the in and out points
 * marked when it was written, cut to its scene.
 */
export const NoteRange = Schema.Struct({ from: Seconds, to: Seconds }).check(
  Schema.makeFilter((r) => r.to > r.from || 'a range ends after it starts'),
);
export type NoteRange = typeof NoteRange.Type;

/** What the lab sends for a new note: the frame, where it was marked, and what it says. */
export const NoteDraft = Schema.Struct({
  scene: Schema.String,
  /** Film seconds, as the film was laid out when the note was made. */
  T: Seconds,
  /**
   * Scene-local seconds: how far into `scene` the note was made. The lab reads
   * a note here while its scene exists (`noteT`), so a note keeps its frame
   * when an earlier beat is re-taken. Optional and additive: a note made
   * before it reads at `T`.
   */
  local: Schema.optionalKey(Seconds),
  frame: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  /** The edge of the cue selected as it was written nearest its time, else of any cue in its scene. */
  cue: Schema.optionalKey(NoteCue),
  /** The `{mark}` nearest the note's time, in its scene. */
  mark: Schema.optionalKey(Schema.String),
  /**
   * The stretch of its scene it is about (its scope chip's `t 3.2–4.0 s`).
   * Optional and additive: a note without one is about its frame.
   */
  range: Schema.optionalKey(NoteRange),
  box: Schema.optionalKey(NoteBox),
  ink: Schema.optionalKey(Schema.Array(InkStroke)),
  text: Schema.String.check(Schema.isNonEmpty()),
});
export type NoteDraft = typeof NoteDraft.Type;

export const Note = Schema.Struct({
  ...NoteDraft.fields,
  /** `n<seq>`: short enough to type in `film notes reply`. */
  id: Schema.String,
  film: Schema.String,
  /** The change that made the note. */
  seq: Seq,
  /** The last change to touch it (made, replied or resolved). */
  changed: Seq,
  status: NoteStatus,
  /** The exact frame, as the lab drew it, in `stills/`. */
  still: Schema.String,
  thread: Schema.Array(Reply),
  /** ISO time. */
  createdAt: Schema.String,
});
export type Note = typeof Note.Type;

/** `lab/<film>/notes.json`. `seq` is the last change's number: the cursor a watcher waits past. */
export const NotesFile = Schema.Struct({
  film: Schema.String,
  seq: Seq,
  notes: Schema.Array(Note),
});
export type NotesFile = typeof NotesFile.Type;

/** `notes.json` on disk. */
export const NotesFileJson = repoJson(NotesFile);

/** A change after a cursor: a new note, a reply in a thread, or a note resolved. */
export const NoteEvent = Schema.Union([
  Schema.TaggedStruct('NoteAdded', { seq: Seq, note: Note }),
  Schema.TaggedStruct('NoteReplied', { seq: Seq, note: Note, reply: Reply }),
  Schema.TaggedStruct('NoteResolved', { seq: Seq, note: Note }),
]);
export type NoteEvent = typeof NoteEvent.Type;

/** What a wait returns: the changes past `since`, in order, and the cursor to wait past next. */
export const NotesWait = Schema.Struct({ cursor: Seq, events: Schema.Array(NoteEvent) });
export type NotesWait = typeof NotesWait.Type;

/** The lab's `POST /api/films/:film/notes` body: a draft and its still, a PNG in base64. */
export const NotePost = Schema.Struct({
  ...NoteDraft.fields,
  still: Schema.Uint8ArrayFromBase64,
});

/** The lab's `POST /api/films/:film/notes/:id/reply` body. */
export const ReplyPost = Schema.Struct({ text: Schema.String.check(Schema.isNonEmpty()) });

// ---------------------------------------------------------------------------
// Lab write-back: the lab edits a scene's cues and knobs in its source file.

/** A cue's offset from its anchor, in seconds: a frame a step, ten with Shift, a millisecond with Alt. */
export const CueOffset = Schema.Finite.annotate(
  inspected({ unit: 's', step: { frames: 1 }, coarse: { frames: 10 }, fine: 0.001 }),
);

/** A cue's length, in seconds, never below 0: stepped as its offset is. */
export const CueDur = Seconds.annotate(
  inspected({ unit: 's', step: { frames: 1 }, coarse: { frames: 10 }, fine: 0.001, min: 0 }),
);

/** A cue patch's fields, in the order a span writes them. */
const CuePatchFields = {
  offset: Schema.optionalKey(CueOffset),
  dur: Schema.optionalKey(CueDur),
  /**
   * End on this mark instead: it replaces the span's `dur`, as a `dur` replaces
   * its `until`, and ends on the mark itself unless `untilOffset` comes with it.
   */
  until: Schema.optionalKey(Schema.String),
  /** Where an `until` span ends off its point: 0 puts it back on the point (the key dropped). */
  untilOffset: Schema.optionalKey(CueOffset),
  ease: Schema.optionalKey(EaseName),
  stagger: Schema.optionalKey(Share),
};

/** Every key a cue patch may set, in the order a span writes them: the one list of them. */
export const CUE_PATCH_KEYS = Struct.keys(CuePatchFields);

/** `POST /lab/:film/cues/:scene/:cue`: the fields to set; a field the span lacks is added. */
export const CuePatch = Schema.Struct(CuePatchFields)
  .check(
    Schema.makeFilter(
      (p) => Object.keys(p).length > 0 || `set at least one of ${CUE_PATCH_KEYS.join(', ')}`,
    ),
  )
  .check(
    Schema.makeFilter(
      (p) => !('dur' in p && 'until' in p) || 'a span ends by its dur or on a mark, not both',
    ),
  )
  .check(
    Schema.makeFilter(
      (p) =>
        !('dur' in p && 'untilOffset' in p) ||
        'a span that ends by its dur has no until point to be off',
    ),
  );
export type CuePatch = typeof CuePatch.Type;

/** `POST /lab/:film/knobs/:scene/:knob`: the knob's new value. */
export const KnobPatch = Schema.Struct({ value: Knob });

/** A cue on the scene clock, in scene-local seconds, with the ease `f.at` applies across it. */
export const ResolvedCue = Schema.Struct({
  start: Schema.Finite,
  end: Schema.Finite,
  dur: Schema.Finite,
  ease: EaseName,
  /** The span's `stagger`, 0 when it declares none. */
  stagger: Share,
});
export type ResolvedCue = typeof ResolvedCue.Type;

/**
 * Where in the film a finding is: the part it is about (`Address`: the whole
 * film, an act, a scene, a short), and the film second it starts at when it
 * has one. A finding about the whole film (a stale master, a missing sound)
 * is the Film's; one about a scene's declarations has only its scene; a
 * short's has no film second, its seconds being its own.
 */
export const FindingAddress = Schema.Struct({
  part: Address,
  time: Schema.optionalKey(Schema.Finite),
});
export type FindingAddress = typeof FindingAddress.Type;

/** One finding of `film check`, as `--json` prints it; `address` is absent when it has none. */
export const CheckLine = Schema.Struct({
  level: Schema.Literals(['error', 'warning']),
  tag: Schema.String,
  message: Schema.String,
  address: Schema.optionalKey(FindingAddress),
});
export type CheckLine = typeof CheckLine.Type;

/**
 * One change the lab made to a file, as a page is told of it: a scene's (its
 * cue or knob) or a film's (its score's pick, its library's takes), named by
 * the scene when there is one.
 */
const LabStep = Schema.Struct({
  scene: Schema.optionalKey(Schema.String),
  file: Schema.String,
  target: Schema.String,
});

/**
 * The id the lab gives a change to a film as it makes it (`uniqueId`), the
 * change's own: never its target's words or the time it was made.
 */
export const ChangeId = Schema.String.pipe(Schema.brand('ChangeId'));
export type ChangeId = typeof ChangeId.Type;

/** The id a page gives one Undo or Redo request (`uniqueId`), by which the lab records it once it lands. */
export const RequestId = Schema.String.pipe(Schema.brand('RequestId'));
export type RequestId = typeof RequestId.Type;

/**
 * A change in a film's history, by the id the lab gave it as it was made
 * (`change`), unique to it: an undo or a redo of it carries its id, so a
 * receipt's Undo or Redo asks for that change and no other.
 */
const HistoryStep = Schema.Struct({
  ...LabStep.fields,
  change: ChangeId,
});

/**
 * An Undo or a Redo that landed (`undo …`, `redo …`), with the id the page
 * that asked for it sent (`request`), unique to that request.
 */
const LandedStep = Schema.Struct({
  ...HistoryStep.fields,
  request: RequestId,
});

/**
 * `GET /api/films/<film>/check`: `film check --static` now; the lab's latest change
 * to a file (a write, `undo …` or `redo …`: a page that change reloaded
 * learns of it here); the writes Undo would put back and Redo would make
 * again; and the Undos and Redos that landed with a request's id, oldest
 * first (as many as Undo can walk back), so a page whose step had no answer
 * learns by its id whether it landed.
 */
export const CheckReport = Schema.Struct({
  findings: Schema.Array(CheckLine),
  latest: Schema.optionalKey(HistoryStep),
  undo: Schema.optionalKey(HistoryStep),
  redo: Schema.optionalKey(HistoryStep),
  landed: Schema.optionalKey(Schema.Array(LandedStep)),
});
export type CheckReport = typeof CheckReport.Type;

const FieldState = Schema.Literals(['literal', 'absent', 'computed']);

/** `GET /lab/:film/scenes/:scene/source`: where the scene's drawing is, and what the lab may rewrite. */
export const SceneSource = Schema.Struct({
  scene: Schema.String,
  /** The scene file, relative to the film's folder. */
  file: Schema.String,
  cues: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      offset: FieldState,
      dur: FieldState,
      until: FieldState,
      /** Additive: an answer without it (a server before it) leaves the end's offset unjudged. */
      untilOffset: Schema.optionalKey(FieldState),
      ease: FieldState,
      stagger: FieldState,
    } satisfies Record<keyof CuePatch | 'name', Schema.Top>),
  ),
  knobs: Schema.Array(Schema.Struct({ name: Schema.String, state: FieldState })),
  /**
   * A field the lab will not write, and why: the scene reads a timeline or
   * knobs no literal declares (the registry overrides it), or one other
   * scenes read too. Its cues or knobs are not listed.
   */
  refused: Schema.Array(
    Schema.Struct({ field: Schema.Literals(['timeline', 'knobs']), reason: Schema.String }),
  ),
});
export type SceneSource = typeof SceneSource.Type;

/**
 * `GET /lab/:film/scenes/:scene/head`: the scene's timeline and knobs as the file
 * declares them at HEAD (literals only), for the lab to draw beside now.
 */
export const HeadSource = Schema.Struct({
  scene: Schema.String,
  /** The scene file, relative to the film's folder. */
  file: Schema.String,
  timeline: Timeline,
  knobs: Knobs,
  /**
   * The file's code (all but the drawing's timeline and knobs literals)
   * differs from HEAD: the compare draws HEAD's data through today's code.
   */
  codeChanged: Schema.Boolean,
  /** HEAD declares the same timeline and knobs as the file does now. */
  sameData: Schema.Boolean,
});
export type HeadSource = typeof HeadSource.Type;

/**
 * The page's build: the number of the lab's pages as built now, past the
 * `since` a page was built at once the sources change, and the server that
 * numbered it (an id each lab process draws at its start): a page served by
 * another server is old code, whatever its number. A film's mix landing is
 * numbered on the same count, so a page playing the film hears it as later.
 */
export const PageBuild = Schema.Struct({ build: Schema.Finite, server: Schema.String });
export type PageBuild = typeof PageBuild.Type;

/**
 * The number the lab's pages hear the mix a write made by (a `PageBuild`),
 * the mix that write landed and no later one: a page that asked its mix
 * again once the write answered need not again when it hears that number.
 * None when the write mixed nothing, or no page listens for the film's mixes.
 */
export const mixedField = { mixed: Schema.optionalKey(PageBuild) } as const;

/** What a lab write (or its undo) answers: what the file now declares, and the check after it. */
export const LabWrite = Schema.Struct({
  /** The scene it changed (none for a film's own file: its score's pick, the library's lock), its file, and what changed: `cue topple offset`, `knob palm`, `undo cue topple offset`. */
  ...LabStep.fields,
  /**
   * The change it made, by its id (`HistoryStep.change`): an undo's or a
   * redo's is the change it stepped. None when the write changed nothing (the
   * file already said so), so there is nothing to undo.
   */
  change: Schema.optionalKey(ChangeId),
  /** The cue's span as the file now declares it, when every field of it is a literal. */
  span: Schema.optionalKey(Span),
  /** The cue resolved on the scene's clock, when its timeline resolves from the file alone. */
  resolved: Schema.optionalKey(ResolvedCue),
  /** Why the written cue could not be resolved (the film did not load or lay out), when it could not. */
  unresolved: Schema.optionalKey(Schema.String),
  /** The knob's value as the file now declares it. */
  knob: Schema.optionalKey(Knob),
  /** `film check --static`, run fresh after the write. */
  findings: Schema.Array(CheckLine),
  ...mixedField,
});
export type LabWrite = typeof LabWrite.Type;
