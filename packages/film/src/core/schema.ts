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
 * and ffprobe measure the same audio, a frame or so apart at most.
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

const spanTiming = {
  offset: Schema.optionalKey(Schema.Finite),
  /** Defaults to 0, an instant. */
  dur: Schema.optionalKey(Schema.Finite),
  /** How `f.at(name)` eases across the cue when `draw` passes no ease. Defaults to `inOutCubic`. */
  ease: Schema.optionalKey(EaseName),
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
  lead: Schema.optionalKey(Schema.Finite),
  /** Silence after the voice ends. */
  tail: Schema.optionalKey(Schema.Finite),
  /** Minimum scene length. */
  min: Schema.optionalKey(Schema.Finite),
  /** How this scene arrives from the previous one. */
  enter: Schema.optionalKey(Transition),
  /** Named moments, anchored to marks or to each other; resolved once in `layout()`. */
  timeline: Schema.optionalKey(Timeline),
  /** Named numbers and points the drawing reads with `f.knob`. */
  knobs: Schema.optionalKey(Knobs),
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
  dur: Schema.optionalKey(Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0))),
  ease: Schema.optionalKey(EaseName),
}).check(
  Schema.makeFilter((p) => Object.keys(p).length > 0 || 'set at least one of offset, dur, ease'),
);
export type CuePatch = typeof CuePatch.Type;

/** `POST /lab/knobs/:scene/:knob`: the knob's new value. */
export const KnobPatch = Schema.Struct({ value: Knob });

/** A resolved cue, scene-local seconds. */
export const CueTiming = Schema.Struct({
  start: Schema.Finite,
  end: Schema.Finite,
  dur: Schema.Finite,
  ease: EaseName,
});
export type CueTiming = typeof CueTiming.Type;

/** One finding of `film check --static`, as it prints it. */
export const CheckLine = Schema.Struct({
  level: Schema.Literals(['error', 'warning']),
  tag: Schema.String,
  message: Schema.String,
});
export type CheckLine = typeof CheckLine.Type;

/** `GET /lab/check`. */
export const CheckReport = Schema.Struct({ findings: Schema.Array(CheckLine) });
export type CheckReport = typeof CheckReport.Type;

const FieldState = Schema.Literals(['literal', 'absent', 'computed']);

/** `GET /lab/scenes/:scene/source`: where the scene's drawing is, and what the lab may rewrite. */
export const SceneSource = Schema.Struct({
  scene: Schema.String,
  /** The scene file, relative to the film's folder. */
  file: Schema.String,
  cues: Schema.Array(
    Schema.Struct({ name: Schema.String, offset: FieldState, dur: FieldState, ease: FieldState }),
  ),
  knobs: Schema.Array(Schema.Struct({ name: Schema.String, state: FieldState })),
});
export type SceneSource = typeof SceneSource.Type;

/** What a lab write (or its undo) answers: what the file now declares, and the check after it. */
export const LabWrite = Schema.Struct({
  scene: Schema.String,
  file: Schema.String,
  /** What changed: `cue topple offset`, `knob palm`, `undo cue topple offset`. */
  target: Schema.String,
  /** The cue's span as the file now declares it, when every field of it is a literal. */
  span: Schema.optionalKey(Span),
  /** The cue resolved on the scene's clock, when its timeline resolves from the file alone. */
  resolved: Schema.optionalKey(CueTiming),
  /** The knob's value as the file now declares it. */
  knob: Schema.optionalKey(Knob),
  /** `film check --static`, run fresh after the write. */
  findings: Schema.Array(CheckLine),
});
export type LabWrite = typeof LabWrite.Type;
