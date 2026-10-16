// The shape of a film's timeline (`film-timeline.ts` builds it): the clock a
// version plays on, its versions, and the timeline the studio page draws and
// the `timeline` tool answers, each a Schema. Kept apart from the model's
// functions so the lab's API (`api.ts`) declares the studio's route over it
// without importing what the model imports (its links are `api.ts`'s own).

import { Schema } from 'effect';
import { RenderKind } from './catalogue.ts';

/** How a beat's voice stands: no words, words read at the reading pace, a staging take, the owner's take. */
const BeatVoice = Schema.Literals(['silent', 'estimated', 'staging', 'owner']);
export type BeatVoice = typeof BeatVoice.Type;

/** A named moment, in film seconds. */
const TimedMark = Schema.Struct({ name: Schema.String, at: Schema.Finite });

/** One beat on the clock: where it sits, where its words are heard, its marks, its voice and whether a scene draws it. */
const ClockBeat = Schema.Struct({
  id: Schema.String,
  start: Schema.Finite,
  dur: Schema.Finite,
  /** Where its words are heard, film seconds; none for a silent beat. */
  speech: Schema.optionalKey(Schema.Struct({ start: Schema.Finite, end: Schema.Finite })),
  /** Its `{mark}`s, film seconds. */
  marks: Schema.Array(TimedMark),
  voice: BeatVoice,
  /** Whether a scene draws it (a beat `storyboard()` sets plays as its card, drawn by none). */
  drawn: Schema.Boolean,
});
export type ClockBeat = typeof ClockBeat.Type;

/** A part laid over the clock (an act, a score movement): its name, the beat it starts on, its film seconds. */
const ClockPart = Schema.Struct({
  name: Schema.String,
  from: Schema.String,
  start: Schema.Finite,
  end: Schema.Finite,
});
export type ClockPart = typeof ClockPart.Type;

/** A version's clock: its beats in order, its acts, and the movements of the score it plays. */
export const FilmClock = Schema.Struct({
  beats: Schema.Array(ClockBeat),
  acts: Schema.Array(ClockPart),
  movements: Schema.Array(ClockPart),
});
export type FilmClock = typeof FilmClock.Type;

/**
 * Where a version's files are: its own folder (`<film>/v<n>/script.ts`), the
 * film's registered files (the newest version without a folder), or nowhere
 * (a version a later one replaced in place).
 */
const VersionFiles = Schema.Literals(['folder', 'film', 'none']);
export type VersionFiles = typeof VersionFiles.Type;

/** A version as the timeline names it: its number, its title, whether it is the open one, and where its files are. */
const FilmVersion = Schema.Struct({
  n: Schema.Int,
  title: Schema.String,
  open: Schema.Boolean,
  files: VersionFiles,
});
export type FilmVersion = typeof FilmVersion.Type;

/** The nine stages of the flow, in order. */
export const Stage = Schema.Literals([
  'script',
  'concept',
  'board',
  'voice',
  'animatic',
  'scenes',
  'sound',
  'render',
  'shorts',
]);
export type Stage = typeof Stage.Type;

/** The seven tracks: a stage each, but the animatic (the Board on the voice clock) and the shorts (on the render's versions). */
export const Track = Schema.Literals([
  'script',
  'concept',
  'board',
  'voice',
  'scenes',
  'sound',
  'render',
]);
export type Track = typeof Track.Type;

/** Where a clip stands: made, kept (the one chosen), or approved by the owner. */
const ClipState = Schema.Literals(['made', 'kept', 'approved']);
export type ClipState = typeof ClipState.Type;

/** How a clip's span is known: measured (a take, a declared hold) or estimated (words at the reading pace). */
const ClipClock = Schema.Literals(['measured', 'estimated']);
export type ClipClock = typeof ClipClock.Type;

const ClipFields = {
  start: Schema.Finite,
  dur: Schema.Finite,
  state: ClipState,
  clock: ClipClock,
};

/** A beat of the script: its id, where its words are heard, its marks. */
const ScriptClip = Schema.Struct({
  ...ClipFields,
  beat: Schema.String,
  speech: Schema.optionalKey(Schema.Struct({ start: Schema.Finite, end: Schema.Finite })),
  marks: Schema.Array(TimedMark),
});
export type ScriptClip = typeof ScriptClip.Type;

/**
 * A Board panel where the animatic shows it (a beat's first from the beat's
 * start, a later one from its mark), held to the next panel or its beat's
 * end: its try shown, or a card the engine sets.
 */
const BoardClip = Schema.Struct({
  ...ClipFields,
  panel: Schema.String,
  beat: Schema.String,
  /** The mark it is said on, or `start`. */
  mark: Schema.String,
  /** Film seconds its mark is said at (the beat's start for `start`, or a mark its line lacks). */
  markAt: Schema.Finite,
  /** The try shown (the kept one, else the first); none for a card. */
  try: Schema.optionalKey(Schema.Int),
  /** Whether it is a card or a verse page the engine sets, not a picture. */
  card: Schema.Boolean,
});
export type BoardClip = typeof BoardClip.Type;

/** A beat's take over its speech: the staging voice's (made) or the owner's (kept). */
const VoiceClip = Schema.Struct({
  ...ClipFields,
  beat: Schema.String,
  source: Schema.Literals(['staging', 'owner']),
});
export type VoiceClip = typeof VoiceClip.Type;

/** A beat a scene draws, over the beat's span: approved when its render is. */
const SceneClip = Schema.Struct({ ...ClipFields, beat: Schema.String });
export type SceneClip = typeof SceneClip.Type;

/** A score movement, from its beat to the next movement's. */
const SoundClip = Schema.Struct({
  ...ClipFields,
  movement: Schema.String,
  from: Schema.String,
});
export type SoundClip = typeof SoundClip.Type;

/** A render in the catalogue over its address's span. */
const RenderClip = Schema.Struct({
  ...ClipFields,
  /** Its address, as `addressKey` writes it (`film`, `act:valley`, `scenes:a,b`). */
  address: Schema.String,
  variant: Schema.String,
  kind: RenderKind,
});
export type RenderClip = typeof RenderClip.Type;

/** One lane: a track with material, its clips in film order. */
const Lane = Schema.Union([
  Schema.Struct({ track: Schema.tag('script'), clips: Schema.Array(ScriptClip) }),
  Schema.Struct({ track: Schema.tag('board'), clips: Schema.Array(BoardClip) }),
  Schema.Struct({ track: Schema.tag('voice'), clips: Schema.Array(VoiceClip) }),
  Schema.Struct({ track: Schema.tag('scenes'), clips: Schema.Array(SceneClip) }),
  Schema.Struct({ track: Schema.tag('sound'), clips: Schema.Array(SoundClip) }),
  Schema.Struct({ track: Schema.tag('render'), clips: Schema.Array(RenderClip) }),
]).pipe(Schema.toTaggedUnion('track'));
export type Lane = typeof Lane.Type;

/** A stage of the flow as the version stands: reached (it has material), a gap (no record to read yet), or ahead (with what starts it). */
export const FlowStage = Schema.Union([
  Schema.Struct({ state: Schema.tag('reached'), stage: Stage }),
  Schema.Struct({ state: Schema.tag('gap'), stage: Stage, why: Schema.String }),
  Schema.Struct({ state: Schema.tag('ahead'), stage: Stage, starts: Schema.String }),
]).pipe(Schema.toTaggedUnion('state'));
export type FlowStage = typeof FlowStage.Type;

/** The Next row: the first stage ahead, with what starts it, the gap it starts from (when the stage before it is one), and the later ones. */
const NextRow = Schema.Struct({
  stage: Stage,
  starts: Schema.String,
  gap: Schema.optionalKey(Schema.Struct({ stage: Stage, why: Schema.String })),
  later: Schema.Array(Stage),
});
export type NextRow = typeof NextRow.Type;

/** A flag above the ruler for what waits on the owner: an open ask, or his note not yet done. Its `kind` is its one word. */
const Marker = Schema.Union([
  Schema.Struct({
    kind: Schema.tag('ask'),
    id: Schema.String,
    title: Schema.String,
    at: Schema.Finite,
    /** Its lab page. */
    href: Schema.String,
  }),
  Schema.Struct({
    kind: Schema.tag('note'),
    id: Schema.String,
    /** Its words, in a line. */
    text: Schema.String,
    beat: Schema.String,
    at: Schema.Finite,
    status: Schema.Literals(['open', 'replied']),
    href: Schema.String,
  }),
]).pipe(Schema.toTaggedUnion('kind'));
export type Marker = typeof Marker.Type;

/** One thing that waits on the owner: an open ask, a note an agent answered, a beat whose Board is ready to approve. */
const Waiting = Schema.Union([
  Schema.Struct({
    kind: Schema.tag('ask'),
    id: Schema.String,
    title: Schema.String,
    href: Schema.String,
  }),
  Schema.Struct({
    kind: Schema.tag('note'),
    id: Schema.String,
    text: Schema.String,
    href: Schema.String,
  }),
  Schema.Struct({ kind: Schema.tag('approve'), beat: Schema.String, href: Schema.String }),
]).pipe(Schema.toTaggedUnion('kind'));
export type Waiting = typeof Waiting.Type;

/** An agent's "doing now" line (the `working` tool), as the lab holds it. */
export const WorkingLine = Schema.Struct({
  by: Schema.String,
  text: Schema.String,
  /** When it was said, ISO. */
  at: Schema.String,
});
export type WorkingLine = typeof WorkingLine.Type;

/**
 * The header's line: the version's stage among the nine, what waits on the
 * owner (`waits`, only when something does: "N wait on you"), and what the
 * agents say they are doing now.
 */
const TimelineHeader = Schema.Struct({
  stage: Stage,
  waits: Schema.optionalKey(
    Schema.Struct({ count: Schema.Int, items: Schema.NonEmptyArray(Waiting) }),
  ),
  working: Schema.Array(WorkingLine),
});
type TimelineHeader = typeof TimelineHeader.Type;

/** A film's timeline at one version: what the studio draws and the `timeline` tool answers. */
export const FilmTimeline = Schema.Struct({
  film: Schema.String,
  /** The production whose ledger names its versions; none for a film with no ledger. */
  production: Schema.optionalKey(Schema.String),
  version: FilmVersion,
  versions: Schema.Array(FilmVersion),
  /** Film seconds, the last beat's end. */
  duration: Schema.Finite,
  /** The act bands, from the version's declared acts. */
  bands: Schema.Array(ClockPart),
  lanes: Schema.Array(Lane),
  /** Each of the nine stages as the version stands. */
  flow: Schema.Array(FlowStage),
  next: Schema.optionalKey(NextRow),
  markers: Schema.Array(Marker),
  header: TimelineHeader,
});
export type FilmTimeline = typeof FilmTimeline.Type;
