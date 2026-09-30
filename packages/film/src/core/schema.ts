// Every piece of film data that crosses a boundary, as Schema: the files the
// tools write (`narration/timings.json`, `sound/manifest.json`), the voice a
// film is read in, and the sound it declares. The TypeScript types are derived
// from these, so a decoded file and a hand-written film module share one
// definition. Pure: Schema runs in the browser, the tools and the tests alike.

import { Array as Arr, Effect, Option, Schema, SchemaTransformation } from 'effect';
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

/** Where a word's voice is heard, in seconds from the start of its take. */
export const Voiced = Schema.Struct({ start: Seconds, end: Seconds });
export type Voiced = typeof Voiced.Type;

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
export const CastVoice = Schema.Struct({ name: Schema.String, voiceId: Schema.String });
export type CastVoice = typeof CastVoice.Type;

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
  'inOutSine',
  'outBack',
  'outSoft',
]);
export type EaseName = typeof EaseName.Type;

/** Fails the typecheck unless `EaseName` names every curve in `ease` and nothing else. */
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;
export type EaseNamesMatch = Assert<Same<EaseName, keyof typeof ease>>;

/** A scene's landmarks: its start, where its voice starts and ends, and its end. */
export const Landmark = Schema.Literals(['start', 'speech', 'speechEnd', 'end']);
export type Landmark = typeof Landmark.Type;

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
};

/** A span that ends on a `{mark}` in the scene's narration, so a re-take moves the end with it. */
const untilMark = {
  until: Schema.String,
  dur: Schema.optionalKey(Schema.Never),
  ends: Schema.optionalKey(Schema.Never),
};

/** One anchor's two spans: ended by `dur`, or `until` a mark; never both. */
const anchored = <A extends Schema.Struct.Fields>(anchor: A) =>
  [
    Schema.Struct({ ...anchor, ...spanTiming, ...byDur }),
    Schema.Struct({ ...anchor, ...spanTiming, ...untilMark }),
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

/** A point in canvas pixels. */
export const Point = Schema.Tuple([Schema.Finite, Schema.Finite]);
export type Point = typeof Point.Type;

/** A value a drawing reads by name (`f.knob`) instead of hard-coding: a number or a point. */
export const Knob = Schema.Union([Schema.Finite, Point]);
export type Knob = typeof Knob.Type;

/** A drawing's knobs: name → value, the one place the value lives. */
export const Knobs = Schema.Record(Schema.String, Knob);
export type Knobs = typeof Knobs.Type;

/** The part of a scene the clock reads. */
export const Timed = Schema.Struct({
  id: Schema.String,
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

/** A short's id names its files (`out/<film>/shorts/<id>.mp4`): lower case, digits and dashes. */
const ShortId = Schema.String.check(Schema.isPattern(/^[a-z0-9][a-z0-9-]*$/));

/** A vertical short cut from a film (`shorts.ts`): its spans, played back to back. */
export const Short = Schema.Struct({
  id: ShortId,
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
    const ids = shorts.map((s) => s.id);
    const twice = ids.filter((id, i) => ids.indexOf(id) !== i);
    return twice.length === 0 || `short ids must be unique: ${[...new Set(twice)].join(', ')}`;
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
  at: Schema.Array(Cue),
});
export type SoundEffect = typeof SoundEffect.Type;

/**
 * A bed: a library sound looped from one cue to another, crossfaded into
 * itself where it wraps, faded in and out, ducked under the voice unless the
 * library says it sits under everything.
 */
export const SoundBed = Schema.Struct({
  sound: Schema.String,
  /** dB relative to the voice; else the library's, else the bed default. */
  level: Schema.optionalKey(Schema.Finite),
  from: Cue,
  to: Cue,
  /** Seconds each end fades over; `BED_FADE` when none. */
  fade: Schema.optionalKey(Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0))),
});
export type SoundBed = typeof SoundBed.Type;

/** A film's score, beds and effects (`sound.ts`). */
export const Sound = Schema.Struct({
  score: Schema.optionalKey(Score),
  beds: Schema.optionalKey(Schema.Array(SoundBed)),
  effects: Schema.Record(Schema.String, SoundEffect),
});
export type Sound = typeof Sound.Type;

/** A generated file, keyed so a changed request is known to be stale. */
export const Asset = Schema.Struct({
  hash: Schema.String,
  file: Schema.String,
});
export type Asset = typeof Asset.Type;

/**
 * A score option as it was composed: its request hash, its file under the
 * film's `sound/` (private: generated music never sits in the public repo)
 * and the sha256 of its bytes, which the private store keeps it under and
 * the pre-commit guard knows it by.
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

/**
 * One line of text as drawn, from the text probe, in canvas pixels after the
 * transform it was drawn under: its box as four corners (top-left, top-right,
 * bottom-right, bottom-left; rotated with the text), the axis-aligned box
 * around them (`x, y, w, h`), and its effective opacity. `scene` is the scene
 * that drew it; `order` is when, among everything the probe recorded in the
 * frame (text and ink share one count).
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
  order: Schema.Int,
  /**
   * The seed of the hand that wrote it (`f.hand(key)`): which line this is,
   * when two say the same words. A stroke's `marks` names it.
   */
  hand: Schema.optionalKey(Schema.Finite),
  /**
   * The `order` of the plate this line sits on (`probePlate`): the plate
   * carries it, so the two never collide; any other text over the plate does.
   */
  on: Schema.optionalKey(Schema.Int),
  /**
   * How many canvas pixels one unit of the space it was drawn in spans
   * (`sqrt(|det|)` of the transform): what turns a drift on screen back into
   * the drawing's own units.
   */
  scale: Schema.Finite,
  /** Set on the caption line: the voice's words, drawn over the picture. */
  caption: Schema.optionalKey(Schema.Literal(true)),
});
export type TextBox = typeof TextBox.Type;

/**
 * What the ink probe records: a brush `stroke` (its centre line, as drawn,
 * and its width), a `fill` (a cutout's or flat fill's outline) or a declared
 * `plate` under a line of text (`probePlate`, the caption plate). In canvas
 * pixels after its transform, with the box around it, its effective opacity
 * and its place in the frame's drawing order. `marks` names the lines of text
 * a stroke marks on purpose (a strike through it, a ring round it), by the
 * seed of the hand that wrote each: it may cross those lines, and no other,
 * even one with the same words.
 */
export const InkMark = Schema.Struct({
  kind: Schema.Literals(['stroke', 'fill', 'plate']),
  scene: Schema.String,
  points: Schema.Array(Point),
  width: Schema.Finite,
  x: Schema.Finite,
  y: Schema.Finite,
  w: Schema.Finite,
  h: Schema.Finite,
  alpha: Schema.Finite,
  order: Schema.Int,
  marks: Schema.optionalKey(Schema.Array(Schema.Finite)),
  /** Canvas pixels per unit of the space it was drawn in, as `TextBox.scale`. */
  scale: Schema.Finite,
  /** Set on the caption line's plate. */
  caption: Schema.optionalKey(Schema.Literal(true)),
});
export type InkMark = typeof InkMark.Type;

/**
 * A face the probe saw (`probeFace`, called by a kit's person): its centre and
 * its height on screen in canvas pixels, and its effective opacity. What
 * `FaceSmall` reads to tell whether a scene ever gives a face human scale.
 */
export const FaceMark = Schema.Struct({
  scene: Schema.String,
  x: Schema.Finite,
  y: Schema.Finite,
  /** The face's height on screen, in canvas pixels. */
  size: Schema.Finite,
  alpha: Schema.Finite,
});
export type FaceMark = typeof FaceMark.Type;

/**
 * A hand the probe saw (`probeHand`, called by a kit's person for each of its
 * hands every frame, at rest or at work): where the hand, its shoulder and
 * its target are on screen, how big it is drawn, how far it has travelled to
 * its work, the figure's reach, whether the hand sits inside its own body's
 * silhouette and whether it is drawn over it. What `HandJump`, `HandFar` and
 * `HandHidden` read.
 */
export const HandMark = Schema.Struct({
  scene: Schema.String,
  side: Schema.Literals(['far', 'near']),
  /** The hand on screen, in canvas pixels. */
  x: Schema.Finite,
  y: Schema.Finite,
  /** Its shoulder on screen: the same hand is found again a frame on by the shoulder it moves round. */
  sx: Schema.Finite,
  sy: Schema.Finite,
  /** Where it works (its rest when it has no work), on screen. */
  tx: Schema.Finite,
  ty: Schema.Finite,
  /** The hand's length drawn on screen, wrist to fingertips, in px. */
  size: Schema.Finite,
  /** The figure's reach on screen, in px: the farthest a hand works from its shoulder. */
  radius: Schema.Finite,
  /** How far it has travelled from its rest to its work, 0 to 1. */
  reach: Schema.Finite,
  /** The hand lies inside the silhouette of its own body (garment and head). */
  inside: Schema.Boolean,
  /** The hand is drawn over that body, not behind it. */
  over: Schema.Boolean,
  alpha: Schema.Finite,
});
export type HandMark = typeof HandMark.Type;

/** A probed frame: every line of text and every mark of ink it drew, and the faces and hands. */
export const Probed = Schema.Struct({
  texts: Schema.Array(TextBox),
  inks: Schema.Array(InkMark),
  /** Recorded only where the sink asks for faces (the look pass). */
  faces: Schema.optionalKey(Schema.Array(FaceMark)),
  /** Recorded only where the sink asks for hands (the look pass). */
  hands: Schema.optionalKey(Schema.Array(HandMark)),
});
export type Probed = typeof Probed.Type;

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
  from: Schema.String,
  /** The act's name, for the report: `cold open`, `valley`. */
  name: Schema.String,
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

/** A film's declared look (`export const look` in `film.ts`): its acts, in film order. */
export const Look = Schema.Struct({ acts: Schema.Array(Act) });
export type Look = typeof Look.Type;

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

/** What the lab sends for a new note: the frame, where it was marked, and what it says. */
export const NoteDraft = Schema.Struct({
  scene: Schema.String,
  /** Film seconds. */
  T: Seconds,
  frame: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  cue: Schema.optionalKey(NoteCue),
  /** The `{mark}` nearest the note's time, in its scene. */
  mark: Schema.optionalKey(Schema.String),
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

/** The lab's `POST /lab/notes` body: a draft and its still, a PNG in base64. */
export const NotePost = Schema.Struct({
  ...NoteDraft.fields,
  still: Schema.Uint8ArrayFromBase64,
});

/** The lab's `POST /lab/notes/:id/reply` body. */
export const ReplyPost = Schema.Struct({ text: Schema.String.check(Schema.isNonEmpty()) });

// ---------------------------------------------------------------------------
// Lab write-back: the lab edits a scene's cues and knobs in its source file.

/** `POST /lab/cues/:scene/:cue`: the fields to set; a field the span lacks is added. */
export const CuePatch = Schema.Struct({
  offset: Schema.optionalKey(Schema.Finite),
  dur: Schema.optionalKey(Seconds),
  /** End on this mark instead: it replaces the span's `dur`, as a `dur` replaces its `until`. */
  until: Schema.optionalKey(Schema.String),
  ease: Schema.optionalKey(EaseName),
  stagger: Schema.optionalKey(Share),
})
  .check(
    Schema.makeFilter(
      (p) => Object.keys(p).length > 0 || 'set at least one of offset, dur, until, ease, stagger',
    ),
  )
  .check(
    Schema.makeFilter(
      (p) => !('dur' in p && 'until' in p) || 'a span ends by its dur or on a mark, not both',
    ),
  );
export type CuePatch = typeof CuePatch.Type;

/** `POST /lab/knobs/:scene/:knob`: the knob's new value. */
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
 * Where in the film a finding is: the scene it names, and the film second it
 * starts at. A finding about the whole film (a stale master, a missing sound)
 * has neither; one about a scene's declarations has only the scene.
 */
export const FindingAddress = Schema.Struct({
  scene: Schema.optionalKey(Schema.String),
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
 * The lab API's root for one film: every route is under `/lab/<film>/`, so a
 * page for another film cannot read or write this one's (the server answers
 * 409 for a film it does not serve).
 */
export const labBase = (film: string): `/lab/${string}` => `/lab/${encodeURIComponent(film)}`;

/** Where the review serves a file by its ref, and its phone copy. */
export const REVIEW_FILES = '/review/files/';
export const REVIEW_PHONE = '/review/phone/';

/** A ref as a URL path: each segment encoded, the slashes kept. */
const refPath = (ref: string) =>
  ref
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');

/** The review's URL for a file, by its ref. */
export const reviewFileUrl = (ref: string): string => `${REVIEW_FILES}${refPath(ref)}`;

/** The review's URL for a video's 720p phone copy, by its ref. */
export const reviewPhoneUrl = (ref: string): string => `${REVIEW_PHONE}${refPath(ref)}`;

/** The review's URL for a frame of a video, `w` px wide, at `t` s (10% in when none). */
export const reviewFrameUrl = (ref: string, t: Option.Option<number>, w: number): string => {
  const at = Option.match(t, { onNone: () => '', onSome: (s) => `&t=${s.toFixed(2)}` });
  return `/review/frame?ref=${encodeURIComponent(ref)}&w=${Math.round(w)}${at}`;
};

/** A film's options (`GET`), under its lab base. */
export const optionsUrl = (film: string): string => `${labBase(film)}/options`;

/** The film's whole mix with the score option `option` playing (an m4a). */
export const scoreMixUrl = (film: string, option: string): string =>
  `${optionsUrl(film)}/score/${encodeURIComponent(option)}/mix`;

/** A library sound's take (by its sha256) alone: its file as the library keeps it. */
export const takeAudioUrl = (film: string, sound: string, take: string): string =>
  `${optionsUrl(film)}/effect/${encodeURIComponent(sound)}/takes/${encodeURIComponent(take)}/audio`;

/** The film's whole mix with `sound` playing only this take at each of its placements (an m4a). */
export const takeMixUrl = (film: string, sound: string, take: string): string =>
  `${optionsUrl(film)}/effect/${encodeURIComponent(sound)}/takes/${encodeURIComponent(take)}/mix`;

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
 * `GET /lab/<film>/check`: `film check --static` now; the lab's latest change
 * to a file (a write, `undo …` or `redo …`: a page that change reloaded
 * learns of it here); and the writes Undo would put back and Redo would make
 * again.
 */
export const CheckReport = Schema.Struct({
  findings: Schema.Array(CheckLine),
  latest: Schema.optionalKey(LabStep),
  undo: Schema.optionalKey(LabStep),
  redo: Schema.optionalKey(LabStep),
});
export type CheckReport = typeof CheckReport.Type;

const FieldState = Schema.Literals(['literal', 'absent', 'computed']);

/** `GET /lab/scenes/:scene/source`: where the scene's drawing is, and what the lab may rewrite. */
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
      ease: FieldState,
      stagger: FieldState,
    }),
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
 * `GET /lab/scenes/:scene/head`: the scene's timeline and knobs as the file
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

/** What a lab write (or its undo) answers: what the file now declares, and the check after it. */
export const LabWrite = Schema.Struct({
  /** The scene the write changed; none for a film's own file (its score's pick, the library's lock). */
  scene: Schema.optionalKey(Schema.String),
  file: Schema.String,
  /** What changed: `cue topple offset`, `knob palm`, `undo cue topple offset`. */
  target: Schema.String,
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
});
export type LabWrite = typeof LabWrite.Type;

// ---------------------------------------------------------------------------
// Review: the options a film (or a sketchbook) is choosing between, compared
// in sync, and the one picked. An option is a `Choice` in code (`Option` is
// Effect's): a choice point with named variants, each with media to compare.
// Its kind says how it is picked. A render set is reviewed only. A score's
// options pick the one the mix plays (`play` in `sound.ts`). A library
// sound's takes are kept or rejected (`library.lock.json`). A look (a style
// at named levels) joins the union when it has a pick to write.

/**
 * A file the review serves where it lies, named by `ref`: its review root's
 * label, then its path under that root (`out/art3/roof.A.share.mp4`). Every
 * review route takes a ref, never a path on the box.
 */
export const ReviewFile = Schema.Struct({
  ref: Schema.String,
  name: Schema.String,
  size: Schema.Finite,
  /** Last modified, ms since the epoch. */
  mtime: Schema.Finite,
});
export type ReviewFile = typeof ReviewFile.Type;

/**
 * A video, and its 720p phone copy's state: only a big video gets one (a
 * phone streams it in place of the master), made in the background.
 */
export const ReviewVideo = Schema.Struct({
  ...ReviewFile.fields,
  phone: Schema.Literals(['none', 'pending', 'ready']),
});
export type ReviewVideo = typeof ReviewVideo.Type;

/** A key a JSON file may leave out, read as an `Option`. */
const maybe = <S extends Schema.Top>(schema: S) => Schema.OptionFromOptionalKey(schema);

/** A key a JSON file may leave out, read as `fallback` when it does. */
const orElse = <S extends Schema.Top>(schema: S, fallback: S['Encoded']) =>
  schema.pipe(Schema.withDecodingDefaultKey(Effect.succeed(fallback)));

const ManifestVariant = Schema.Struct({
  label: maybe(Schema.String),
  /** A line under the label: what the variant is. */
  tag: maybe(Schema.String),
  verdict: maybe(Schema.String),
  /** A markdown file of notes, relative to the folder. */
  notes: maybe(Schema.String),
  /** The video, relative to the folder, when it is not `<clip>.<id>.mp4` beside it. */
  file: maybe(Schema.String),
});

const ManifestSet = Schema.Struct({
  title: maybe(Schema.String),
  /** Variant ids, first to last; the rest follow by name. */
  order: orElse(Schema.Array(Schema.String), []),
  /** Where every video starts, in seconds. */
  start: orElse(Seconds, 0),
  /** The instants the Moments view shows; five spread over the first variant otherwise. */
  moments: maybe(Schema.Array(Seconds)),
  variants: orElse(Schema.Record(Schema.String, ManifestVariant), {}),
});

/**
 * A folder's optional `review.json`: a title and a line for the folder, docs,
 * and per comparison set (by clip) its title, order, start, moments, and each
 * variant's label, tag, verdict, notes, or file when it lies elsewhere. Every
 * key may be left out.
 */
export const ReviewManifest = Schema.Struct({
  title: maybe(Schema.String),
  blurb: maybe(Schema.String),
  /** Markdown files, relative to the folder, shown with it. */
  docs: orElse(Schema.Array(Schema.String), []),
  sets: orElse(Schema.Record(Schema.String, ManifestSet), {}),
});
export type ReviewManifest = typeof ReviewManifest.Type;

export const ReviewManifestJson = Schema.fromJsonString(ReviewManifest);

/** One variant of a render set: a video, with what the manifest says of it. */
export const RenderVariant = Schema.Struct({
  id: Schema.String,
  label: Schema.String,
  tag: maybe(Schema.String),
  verdict: maybe(Schema.String),
  notes: maybe(ReviewFile),
  video: ReviewVideo,
});
export type RenderVariant = typeof RenderVariant.Type;

/**
 * A comparison set: the videos in one folder named `<clip>.<variant>[.share].mp4`
 * (a share copy standing in for its master), with the manifest's say. Reviewed
 * only: nothing in source picks one.
 */
export const RenderChoice = Schema.TaggedStruct('RenderChoice', {
  clip: Schema.String,
  title: Schema.String,
  start: Seconds,
  moments: maybe(Schema.Array(Seconds)),
  variants: Schema.Array(RenderVariant),
});
export type RenderChoice = typeof RenderChoice.Type;

/** A folder of renders: its comparison sets, and what is in no set. */
export const ReviewFolder = Schema.Struct({
  /** The folder's ref: its root's label, then its path under the root. */
  ref: Schema.String,
  title: maybe(Schema.String),
  blurb: maybe(Schema.String),
  /** Its newest file's mtime. */
  mtime: Schema.Finite,
  sets: Schema.Array(RenderChoice),
  videos: Schema.Array(ReviewVideo),
  images: Schema.Array(ReviewFile),
  docs: Schema.Array(ReviewFile),
});
export type ReviewFolder = typeof ReviewFolder.Type;

/** `GET /review/index`: every folder under the roots with something to review, newest first. */
export const ReviewIndex = Schema.Struct({ folders: Schema.Array(ReviewFolder) });
export type ReviewIndex = typeof ReviewIndex.Type;

/** `GET /review/duration`: a video's length. */
export const ReviewDuration = Schema.Struct({ seconds: Seconds });
export type ReviewDuration = typeof ReviewDuration.Type;

/** `GET /review/films`: the app's films, each with options to pick from at `?film=<film>`. */
export const ReviewFilms = Schema.Struct({ films: Schema.Array(Schema.String) });
export type ReviewFilms = typeof ReviewFilms.Type;

/**
 * Where a score option stands in the film's store: `current` (composed for
 * the movements and timing as they are), `stale` (composed before they changed:
 * it still plays) or `missing` (never composed here: nothing to hear).
 */
export const ScoreState = Schema.Literals(['current', 'stale', 'missing']);
export type ScoreState = typeof ScoreState.Type;

/** One of the film's score options: its musical language, its movements, its state. */
export const ScoreVariant = Schema.Struct({
  /** The option's name in `sound.ts`. */
  id: Schema.String,
  styles: Schema.Array(Schema.String),
  movements: Schema.Array(Movement),
  state: ScoreState,
});
export type ScoreVariant = typeof ScoreVariant.Type;

/** The film's score options, the one `play` names picked: each heard as the film's whole mix. */
export const ScoreChoice = Schema.TaggedStruct('ScoreChoice', {
  /** The option the film's mix plays (`play`). */
  picked: Schema.String,
  variants: Schema.Array(ScoreVariant),
});
export type ScoreChoice = typeof ScoreChoice.Type;

/** A take of a library sound: kept (it plays), or a candidate waiting to be kept or rejected. */
export const EffectTakeState = Schema.Literals(['kept', 'candidate']);
export type EffectTakeState = typeof EffectTakeState.Type;

export const EffectTake = Schema.Struct({
  /** Its sha256: the lock's name for it, wherever it waits. */
  id: Schema.String,
  state: EffectTakeState,
  /** 1-based among the kept variants, or among the candidates, as `sfx keep` and `unkeep` count. */
  index: Schema.Int,
  secs: Seconds,
  /** Its loudest 400 ms, LUFS. */
  loudest: Schema.Finite,
  made: Schema.String,
  /** Made for the declaration as it reads now (else for an older one). */
  current: Schema.Boolean,
});
export type EffectTake = typeof EffectTake.Type;

/** One place the film plays an effect: its name in `sound.ts`, its scene, its film time. */
export const EffectPlacement = Schema.Struct({
  effect: Schema.String,
  scene: Schema.String,
  at: Seconds,
});
export type EffectPlacement = typeof EffectPlacement.Type;

/**
 * A library sound the film's effects play: its kept variants (the picks: they
 * rotate through its placements) and its candidates, each heard alone and in
 * place.
 */
export const EffectChoice = Schema.TaggedStruct('EffectChoice', {
  /** The library's name for it: `paper.slide`. */
  sound: Schema.String,
  placements: Schema.Array(EffectPlacement),
  takes: Schema.Array(EffectTake),
});
export type EffectChoice = typeof EffectChoice.Type;

/** A film's choice point: a score to play, a sound's takes to keep. */
export const FilmChoice = Schema.Union([ScoreChoice, EffectChoice]).pipe(
  Schema.toTaggedUnion('_tag'),
);
export type FilmChoice = typeof FilmChoice.Type;

/** `GET /lab/<film>/options`: the film's choices. */
export const FilmChoices = Schema.Struct({
  film: Schema.String,
  /**
   * The film's renders under the review's roots, newest first: the picture
   * each option's mix is heard against (its own sound muted). None until the
   * film is rendered.
   */
  pictures: Schema.Array(ReviewVideo),
  choices: Schema.Array(FilmChoice),
});
export type FilmChoices = typeof FilmChoices.Type;

/** `POST /lab/<film>/options/score/pick`: play `option` (`play` in `sound.ts`). */
export const ScorePick = Schema.Struct({ option: Schema.String });
export type ScorePick = typeof ScorePick.Type;

/** What becomes of a take: kept (it plays), unkept (it waits again) or rejected (never offered again). */
export const TakeAct = Schema.Literals(['keep', 'unkeep', 'reject']);
export type TakeAct = typeof TakeAct.Type;

/** `POST /lab/<film>/options/effect/:sound/takes`: a take kept, unkept or rejected. */
export const TakeCuration = Schema.Struct({ take: Schema.String, act: TakeAct });
export type TakeCuration = typeof TakeCuration.Type;

/** What a pick answers: the file it changed, the film's choices as they now stand, and the check after it. */
export const ChoiceWrite = Schema.Struct({
  file: Schema.String,
  /** What changed: `score play piano`, `sound paper.slide keep 3f2a…`. */
  target: Schema.String,
  choices: FilmChoices,
  findings: Schema.Array(CheckLine),
});
export type ChoiceWrite = typeof ChoiceWrite.Type;
