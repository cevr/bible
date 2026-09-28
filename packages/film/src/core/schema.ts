// Every piece of film data that crosses a boundary, as Schema: the files the
// tools write (`narration/timings.json`, `sound/manifest.json`), the voice a
// film is read in, and the sound it declares. The TypeScript types are derived
// from these, so a decoded file and a hand-written film module share one
// definition. Pure: Schema runs in the browser, the tools and the tests alike.

import { Array as Arr, Option, Schema, SchemaTransformation } from 'effect';
import type { ease } from './time.ts';

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
  words: Schema.Array(Word),
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
};

/** A span that ends by its length. */
const byDur = {
  /** Defaults to 0, an instant. */
  dur: Schema.optionalKey(Seconds),
  until: Schema.optionalKey(Schema.Never),
};

/** A span that ends on a `{mark}` in the scene's narration, so a re-take moves the end with it. */
const untilMark = {
  until: Schema.String,
  dur: Schema.optionalKey(Schema.Never),
};

/** One anchor's two spans: ended by `dur`, or `until` a mark; never both. */
const anchored = <A extends Schema.Struct.Fields>(anchor: A) =>
  [
    Schema.Struct({ ...anchor, ...spanTiming, ...byDur }),
    Schema.Struct({ ...anchor, ...spanTiming, ...untilMark }),
  ] as const;

/**
 * Where a named cue starts, plus how long it lasts: at a `{mark}` in the
 * scene's narration, or at the first `word` said at or after it (a word pin,
 * for a beat on a word that has no mark: `{ mark: 'gift', word: 'faith' }`;
 * a line that never says it there is `WordMissing` at layout), at the end of
 * another cue (`after`), at its start (`with`), or at a scene landmark (its
 * start, where the voice starts or ends, or its end).
 */
export const Span = Schema.Union([
  ...anchored({
    mark: Schema.String,
    /** Pin to this word at or after the mark, not the mark; read as a take is checked (`normalizeWords`). */
    word: Schema.optionalKey(Schema.String),
  }),
  ...anchored({ after: Schema.String }),
  ...anchored({ with: Schema.String }),
  ...anchored({ scene: Schema.Literals(['start', 'speech', 'speechEnd', 'end']) }),
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
 * `script.ts`'s optional `heardAs`: a word of the script (a name, mostly) and
 * the ways speech-to-text writes it, so a take that reads it right is not a
 * mismatch: `{ Ellet: ['Elliot', 'Elliott'] }`.
 */
export const HeardAs = Schema.Record(Schema.String, Schema.Array(Schema.String));
export type HeardAs = typeof HeardAs.Type;

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

/** A probed frame: every line of text and every mark of ink it drew. */
export const Probed = Schema.Struct({
  texts: Schema.Array(TextBox),
  inks: Schema.Array(InkMark),
});
export type Probed = typeof Probed.Type;

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
export const NotesFileJson = Schema.String.pipe(
  Schema.decodeTo(Schema.fromJsonString(NotesFile, { space: 2 }), fileText),
);

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

/** One finding of `film check --static`, as it prints it. */
export const CheckLine = Schema.Struct({
  level: Schema.Literals(['error', 'warning']),
  tag: Schema.String,
  message: Schema.String,
});
export type CheckLine = typeof CheckLine.Type;

/**
 * The lab API's root for one film: every route is under `/lab/<film>/`, so a
 * page for another film cannot read or write this one's (the server answers
 * 409 for a film it does not serve).
 */
export const labBase = (film: string): `/lab/${string}` => `/lab/${encodeURIComponent(film)}`;

/** One change the lab made to a scene file, as a page is told of it. */
const LabStep = Schema.Struct({ scene: Schema.String, file: Schema.String, target: Schema.String });

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
  scene: Schema.String,
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
