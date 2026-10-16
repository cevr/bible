// The studio's read model: a film's timeline, one version at a time, every
// stage of the flow laid on the film's clock (script → concept → Board →
// voice → animatic → scenes → sound → render → shorts). The lab's `timeline`
// tool answers it and the studio page draws it, so an agent and the owner
// read one model.
//
// It is built from what the lab already reads, never a file parsed a second
// way: the version's clock (`FilmClock`, made by `film read clock` from
// `core/layout.ts` over the film's scenes and takes, or a version folder's
// `script.ts`), the Board (`core/board.ts`), the catalogue
// (`core/catalogue.ts`), the production's ledger (`core/production.ts`), the
// lab's asks (`core/ask.ts`) and the film's notes (`core/notes.ts`).
//
// A track is a stage. A stage with no material has no lane: it is named in
// the flow (`ahead`, with what starts it) and the first one is the Next row.
// The animatic has no lane (it is the Board on the voice clock) and is
// reached when both are. The concept stage keeps no record yet, so it is a
// named gap, never a lane. Each clip carries its state (made, kept,
// approved) and its clock (`estimated`: its length is read from its words at
// the reading pace, no take measures it; the page hatches it).
//
// The markers are what waits on the owner and has a time: open asks and his
// notes not yet done. The header counts what waits on him (open asks, notes
// an agent answered, beats ready to approve) and carries the agents' "doing
// now" lines. Pure: the lab's service reads the sources and calls
// `timelineOf`.

import { Array as Arr, Boolean as Bool, Match, Option, Order, Result, Schema } from 'effect';
import { type Address, addressKey } from './address-schema.ts';
import { pageHref } from './api.ts';
import { type AskRecord, materialsIn } from './ask.ts';
import {
  type BoardFile,
  PANEL_START,
  type Panel,
  approvalOf,
  approveBeat,
  shownTry,
} from './board.ts';
import {
  type Catalogue,
  MAIN_VARIANT,
  RenderKind,
  approvalState,
  renderIn,
  sceneSlot,
  subjectOf,
} from './catalogue.ts';
import { type PartError, stretchesOf } from './acts.ts';
import { boardPath, gist, notePath } from './lab-events.ts';
import type { Placed } from './layout.ts';
import { noteT } from './notes.ts';
import { FilmVersionUnkept, FilmVersionUnknown } from './refusals.ts';
import type { Note } from './schema.ts';
import { FILM_FPS } from './time.ts';

// ---------------------------------------------------------------------------
// The clock a version plays on

/** How a beat's voice stands: no words, words read at the reading pace, a staging take, the owner's take. */
const BeatVoice = Schema.Literals(['silent', 'estimated', 'staging', 'owner']);
type BeatVoice = typeof BeatVoice.Type;

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
type ClockBeat = typeof ClockBeat.Type;

/** A part laid over the clock (an act, a score movement): its name, the beat it starts on, its film seconds. */
const ClockPart = Schema.Struct({
  name: Schema.String,
  from: Schema.String,
  start: Schema.Finite,
  end: Schema.Finite,
});
type ClockPart = typeof ClockPart.Type;

/** A version's clock: its beats in order, its acts, and the movements of the score it plays. */
export const FilmClock = Schema.Struct({
  beats: Schema.Array(ClockBeat),
  acts: Schema.Array(ClockPart),
  movements: Schema.Array(ClockPart),
});
export type FilmClock = typeof FilmClock.Type;

/** What a part declares: the beat it begins on and its name (an act, a movement). */
interface PartOf {
  readonly from: string;
  readonly name: string;
}

/** `parts` laid over `placed` (`stretchesOf`): each one's film seconds. */
const partsOn = (
  parts: ReadonlyArray<PartOf>,
  placed: ReadonlyArray<Placed>,
): Result.Result<ReadonlyArray<ClockPart>, PartError> =>
  Result.map(stretchesOf(parts, placed), (stretches) =>
    stretches.map((s) => ({ name: s.part.name, from: s.part.from, start: s.from, end: s.to })),
  );

/** How a placed beat's voice stands. */
const voiceOf = (p: Placed): BeatVoice => {
  if (p.voice.spoken.length === 0) return 'silent';
  if (!p.voice.recorded) return 'estimated';
  if (p.voice.source === 'recorded') return 'owner';
  return 'staging';
};

/**
 * The clock of placed beats: each beat's span, speech and marks in film
 * seconds, its voice, and whether `drawn` says a scene draws it; the acts and
 * the score's movements laid over them. Fails with the first part that names
 * no beat or is declared out of order. Pure.
 */
export const filmClock = (
  placed: ReadonlyArray<Placed>,
  parts: {
    readonly acts: ReadonlyArray<PartOf>;
    readonly movements: ReadonlyArray<PartOf>;
    readonly drawn: (p: Placed) => boolean;
  },
): Result.Result<FilmClock, PartError> =>
  Result.gen(function* () {
    const beats = placed.map((p): ClockBeat => {
      const speechStart = p.start + p.speechStart;
      return {
        id: p.spec.id,
        start: p.start,
        dur: p.dur,
        ...Option.match(
          Option.liftPredicate(p.voice.duration, (d) => d > 0),
          {
            onNone: () => ({}),
            onSome: (d) => ({ speech: { start: speechStart, end: speechStart + d } }),
          },
        ),
        marks: [...p.voice.marks].map(([name, at]) => ({ name, at: speechStart + at })),
        voice: voiceOf(p),
        drawn: parts.drawn(p),
      };
    });
    return {
      beats,
      acts: yield* partsOn(parts.acts, placed),
      movements: yield* partsOn(parts.movements, placed),
    };
  });

// ---------------------------------------------------------------------------
// Versions

/**
 * Where a version's files are: its own folder (`<film>/v<n>/script.ts`), the
 * film's registered files (the newest version without a folder), or nowhere
 * (a version a later one replaced in place).
 */
const VersionFiles = Schema.Literals(['folder', 'film', 'none']);
type VersionFiles = typeof VersionFiles.Type;

/** A version as the timeline names it: its number, its title, whether it is the open one, and where its files are. */
const FilmVersion = Schema.Struct({
  n: Schema.Int,
  title: Schema.String,
  open: Schema.Boolean,
  files: VersionFiles,
});
type FilmVersion = typeof FilmVersion.Type;

/**
 * A film's versions: its production ledger's (`versions`, oldest first; the
 * last is open), each with a folder when `folders` names its number, the
 * newest of the others on the film's registered files; a film with no
 * ledger has one version, open, on its files. Pure.
 */
export const versionsOf = (
  ledger: Option.Option<{ readonly versions: ReadonlyArray<{ readonly title: string }> }>,
  folders: ReadonlyArray<number>,
  film: string,
): ReadonlyArray<FilmVersion> =>
  Option.match(ledger, {
    onNone: (): ReadonlyArray<FilmVersion> => [{ n: 1, title: film, open: true, files: 'film' }],
    onSome: ({ versions }) => {
      const numbers = versions.map((_, i) => i + 1);
      const registered = Arr.last(numbers.filter((n) => !folders.includes(n)));
      const filesOf = (n: number): VersionFiles => {
        if (folders.includes(n)) return 'folder';
        if (Option.contains(registered, n)) return 'film';
        return 'none';
      };
      return versions.map((v, i): FilmVersion => ({
        n: i + 1,
        title: v.title,
        open: i + 1 === versions.length,
        files: filesOf(i + 1),
      }));
    },
  });

/**
 * The version a caller names, else the open one: `FilmVersionUnknown` for a
 * number the film has not, `FilmVersionUnkept` for one whose files are kept
 * nowhere. Pure.
 */
export const pickVersion = (
  film: string,
  versions: ReadonlyArray<FilmVersion>,
  asked: Option.Option<number>,
): Result.Result<FilmVersion, FilmVersionUnknown | FilmVersionUnkept> => {
  const open = Arr.findFirst(versions, (v) => v.open);
  const found = Option.match(asked, {
    onNone: () => open,
    onSome: (n) => Arr.findFirst(versions, (v) => v.n === n),
  });
  return Result.flatMap(
    Result.fromOption(found, () =>
      FilmVersionUnknown.make({
        film,
        version: Option.getOrElse(asked, () => 0),
        versions: versions.map((v) => v.n),
      }),
    ),
    (version) =>
      Bool.match(version.files === 'none', {
        onTrue: () =>
          Result.fail(
            FilmVersionUnkept.make({
              film,
              version: version.n,
              kept: versions.filter((v) => v.files !== 'none').map((v) => v.n),
            }),
          ),
        onFalse: () => Result.succeed(version),
      }),
  );
};

// ---------------------------------------------------------------------------
// The model

/** The nine stages of the flow, in order. */
const Stage = Schema.Literals([
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
type Stage = typeof Stage.Type;
const STAGES: ReadonlyArray<Stage> = Stage.literals;

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
type ClipState = typeof ClipState.Type;

/** How a clip's span is known: measured (a take, a declared hold) or estimated (words at the reading pace). */
const ClipClock = Schema.Literals(['measured', 'estimated']);
type ClipClock = typeof ClipClock.Type;

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
type ScriptClip = typeof ScriptClip.Type;

/** A Board panel on its mark, held to the next panel or its beat's end: its try shown, or a card the engine sets. */
const BoardClip = Schema.Struct({
  ...ClipFields,
  panel: Schema.String,
  beat: Schema.String,
  /** The mark it is held from, or `start`. */
  mark: Schema.String,
  /** The try shown (the kept one, else the first); none for a card. */
  try: Schema.optionalKey(Schema.Int),
  /** Whether it is a card or a verse page the engine sets, not a picture. */
  card: Schema.Boolean,
});
type BoardClip = typeof BoardClip.Type;

/** A beat's take over its speech: the staging voice's (made) or the owner's (kept). */
const VoiceClip = Schema.Struct({
  ...ClipFields,
  beat: Schema.String,
  source: Schema.Literals(['staging', 'owner']),
});
type VoiceClip = typeof VoiceClip.Type;

/** A beat a scene draws, over the beat's span: approved when its render is. */
const SceneClip = Schema.Struct({ ...ClipFields, beat: Schema.String });
type SceneClip = typeof SceneClip.Type;

/** A score movement, from its beat to the next movement's. */
const SoundClip = Schema.Struct({
  ...ClipFields,
  movement: Schema.String,
  from: Schema.String,
});
type SoundClip = typeof SoundClip.Type;

/** A render in the catalogue over its address's span. */
const RenderClip = Schema.Struct({
  ...ClipFields,
  /** Its address, as `addressKey` writes it (`film`, `act:valley`, `scenes:a,b`). */
  address: Schema.String,
  variant: Schema.String,
  kind: RenderKind,
});
type RenderClip = typeof RenderClip.Type;

/** One lane: a track with material, its clips in film order. */
const Lane = Schema.Union([
  Schema.Struct({ track: Schema.tag('script'), clips: Schema.Array(ScriptClip) }),
  Schema.Struct({ track: Schema.tag('board'), clips: Schema.Array(BoardClip) }),
  Schema.Struct({ track: Schema.tag('voice'), clips: Schema.Array(VoiceClip) }),
  Schema.Struct({ track: Schema.tag('scenes'), clips: Schema.Array(SceneClip) }),
  Schema.Struct({ track: Schema.tag('sound'), clips: Schema.Array(SoundClip) }),
  Schema.Struct({ track: Schema.tag('render'), clips: Schema.Array(RenderClip) }),
]).pipe(Schema.toTaggedUnion('track'));
type Lane = typeof Lane.Type;

/** A stage of the flow as the version stands: reached (it has material), a gap (no record to read yet), or ahead (with what starts it). */
const FlowStage = Schema.Union([
  Schema.Struct({ state: Schema.tag('reached'), stage: Stage }),
  Schema.Struct({ state: Schema.tag('gap'), stage: Stage, why: Schema.String }),
  Schema.Struct({ state: Schema.tag('ahead'), stage: Stage, starts: Schema.String }),
]).pipe(Schema.toTaggedUnion('state'));
type FlowStage = typeof FlowStage.Type;

/** The Next row: the first stage ahead, with what starts it, and the later ones. */
const NextRow = Schema.Struct({
  stage: Stage,
  starts: Schema.String,
  later: Schema.Array(Stage),
});
type NextRow = typeof NextRow.Type;

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
type Marker = typeof Marker.Type;

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
type Waiting = typeof Waiting.Type;

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

/** What the model is made from: the version's clock and, for the film's registered files, its Board, catalogue and notes. */
interface TimelineSources {
  readonly film: string;
  readonly production: Option.Option<string>;
  readonly version: FilmVersion;
  readonly versions: ReadonlyArray<FilmVersion>;
  readonly clock: FilmClock;
  /** The film's Board (`board.json`): the registered files' stage, and the beats it holds ready to approve. */
  readonly board: BoardFile;
  /** The film's renders (`catalogue.json`): the registered files' stage. */
  readonly catalogue: Catalogue;
  /** Every note on the film. */
  readonly notes: ReadonlyArray<Note>;
  /** The lab's asks; those about the film are read. */
  readonly asks: ReadonlyArray<AskRecord>;
  readonly working: ReadonlyArray<WorkingLine>;
}

/** What starts each stage, said as the Next row says it. */
const STARTS: Readonly<Record<Stage, string>> = {
  script: 'Script starts from the series draft the owner keeps',
  concept: 'Concept starts from the kept script',
  board: 'Board starts from the kept concept frames',
  voice: 'Voice is staged once the Board holds',
  animatic: 'Animatic plays once the Board and the voice hold',
  scenes: 'Scenes are drawn from the approved Board',
  sound: 'Sound follows the scenes',
  render: 'Render comes once the scenes are approved',
  shorts: 'Shorts are cut from the approved render',
};

/** Why the concept stage is a gap. */
const CONCEPT_GAP =
  "the kept concept frames have no record yet: they live in sets and in an ask's picks";

/** `onTrue` when `cond` holds, else `onFalse`. */
const either = <A>(cond: boolean, onTrue: A, onFalse: A): A =>
  Bool.match(cond, { onTrue: () => onTrue, onFalse: () => onFalse });

const clockOfBeat = (beat: ClockBeat): ClipClock =>
  either<ClipClock>(beat.voice === 'estimated', 'estimated', 'measured');

const end = (beat: ClockBeat) => beat.start + beat.dur;

/** The script's beats: kept on the film's registered files, made in a version folder not yet kept. */
const scriptLane = (clock: FilmClock, files: VersionFiles): ReadonlyArray<ScriptClip> =>
  clock.beats.map((b) => ({
    start: b.start,
    dur: b.dur,
    state: either<ClipState>(files === 'film', 'kept', 'made'),
    clock: clockOfBeat(b),
    beat: b.id,
    ...Option.match(Option.fromUndefinedOr(b.speech), {
      onNone: () => ({}),
      onSome: (speech) => ({ speech }),
    }),
    marks: b.marks,
  }));

/** Whether a panel has material: a card the engine sets, or a picture with a try. */
const hasMaterial = (panel: Panel) => isCard(panel) || panel.tries.length > 0;

/** Whether a panel is a card or a verse page the engine sets. */
const isCard = (panel: Panel) => Option.isSome(Option.fromUndefinedOr(panel.text));

/** Where a panel is held from on its beat: its mark's time, else the beat's start. */
const panelStart = (beat: ClockBeat, panel: Panel): number =>
  Option.getOrElse(
    Option.map(
      Arr.findFirst(beat.marks, (m) => panel.at !== PANEL_START && m.name === panel.at),
      (m) => m.at,
    ),
    () => beat.start,
  );

/** The Board's panels on their marks, each held to the next panel of its beat or the beat's end. */
const boardLane = (clock: FilmClock, board: BoardFile): ReadonlyArray<BoardClip> =>
  clock.beats.flatMap((beat) => {
    const approved = approvalOf(board, beat.id) === 'approved';
    const held = Arr.sort(
      board.panels
        .filter((p) => p.beat === beat.id && hasMaterial(p))
        .map((panel) => ({ panel, start: panelStart(beat, panel) })),
      Order.mapInput(Order.Number, (p: { readonly start: number }) => p.start),
    );
    return held.map(({ panel, start }, i): BoardClip => {
      const until = Option.getOrElse(
        Option.map(Arr.get(held, i + 1), (next) => next.start),
        () => end(beat),
      );
      const card = isCard(panel);
      const kept = card || Option.isSome(Option.fromUndefinedOr(panel.kept));
      const state = either<ClipState>(
        approved,
        'approved',
        either<ClipState>(kept, 'kept', 'made'),
      );
      return {
        start,
        dur: Math.max(0, until - start),
        state,
        clock: clockOfBeat(beat),
        panel: panel.id,
        beat: beat.id,
        mark: panel.at,
        ...Option.match(
          Option.filter(shownTry(panel), () => !card),
          {
            onNone: () => ({}),
            onSome: (t) => ({ try: t.n }),
          },
        ),
        card,
      };
    });
  });

/** Each beat's take over its speech: the staging voice's made, the owner's kept. */
const voiceLane = (clock: FilmClock): ReadonlyArray<VoiceClip> =>
  clock.beats.flatMap((b) =>
    Option.toArray(
      Option.flatMap(Option.fromUndefinedOr(b.speech), (speech) =>
        Match.value(b.voice).pipe(
          Match.when(
            (v) => v === 'staging' || v === 'owner',
            (source): Option.Option<VoiceClip> =>
              Option.some({
                start: speech.start,
                dur: speech.end - speech.start,
                state: either<ClipState>(source === 'owner', 'kept', 'made'),
                clock: 'measured',
                beat: b.id,
                source: either<VoiceClip['source']>(source === 'owner', 'owner', 'staging'),
              }),
          ),
          Match.orElse(() => Option.none()),
        ),
      ),
    ),
  );

/** Whether the owner approved `beat`'s scene render as it stands. */
const sceneApproved = (catalogue: Catalogue, beat: string): boolean =>
  Option.exists(
    renderIn(catalogue, sceneSlot(beat, MAIN_VARIANT)),
    (render) => approvalState(catalogue, subjectOf(render)) === 'approved',
  );

/** Each beat a scene draws, approved when its render is. */
const scenesLane = (clock: FilmClock, catalogue: Catalogue): ReadonlyArray<SceneClip> =>
  clock.beats
    .filter((b) => b.drawn)
    .map((b) => ({
      start: b.start,
      dur: b.dur,
      state: either<ClipState>(sceneApproved(catalogue, b.id), 'approved', 'made'),
      clock: clockOfBeat(b),
      beat: b.id,
    }));

/** Whether any beat over `[start, end)` is estimated. */
const estimatedOver = (clock: FilmClock, start: number, until: number): ClipClock =>
  either<ClipClock>(
    clock.beats.some((b) => b.start < until && end(b) > start && b.voice === 'estimated'),
    'estimated',
    'measured',
  );

/** The score's movements, each from its beat to the next one's. */
const soundLane = (clock: FilmClock): ReadonlyArray<SoundClip> =>
  clock.movements.map((m) => ({
    start: m.start,
    dur: m.end - m.start,
    state: 'made',
    clock: estimatedOver(clock, m.start, m.end),
    movement: m.name,
    from: m.from,
  }));

/** Where a render's address sits on the clock: its recorded span, else its address's. */
const spanOf = (
  clock: FilmClock,
  address: Address,
  span: Option.Option<{ readonly from: number; readonly to: number }>,
  duration: number,
): Option.Option<{ readonly from: number; readonly to: number }> =>
  Option.orElse(span, () =>
    Match.valueTags(address, {
      Film: () => Option.some({ from: 0, to: duration }),
      Act: ({ act }) =>
        Option.map(
          Arr.findFirst(clock.acts, (a) => a.name === act),
          (a) => ({ from: a.start, to: a.end }),
        ),
      Scenes: ({ ids }) => {
        const beats = clock.beats.filter((b) => ids.includes(b.id));
        return Option.map(Option.all([Arr.head(beats), Arr.last(beats)]), ([first, last]) => ({
          from: first.start,
          to: end(last),
        }));
      },
      Short: () => Option.none(),
    }),
  );

/** The catalogue's videos of the film, an act or scenes, each over its span; approved when the owner approved it as it is. */
const renderLane = (
  clock: FilmClock,
  catalogue: Catalogue,
  duration: number,
): ReadonlyArray<RenderClip> =>
  Arr.sort(
    catalogue.renders
      .filter((r) => r.kind === 'video' && r.address._tag !== 'Short')
      .flatMap((r) =>
        Option.toArray(
          Option.map(spanOf(clock, r.address, r.span, duration), (span): RenderClip => ({
            start: span.from,
            dur: Math.max(0, span.to - span.from),
            state: either<ClipState>(
              approvalState(catalogue, subjectOf(r)) === 'approved',
              'approved',
              'made',
            ),
            clock: 'measured',
            address: addressKey(r.address),
            variant: r.variant,
            kind: r.kind,
          })),
        ),
      ),
    Order.mapInput(Order.Number, (c: RenderClip) => c.start),
  );

/** The lanes with material, in track order. */
const lanesOf = (sources: TimelineSources, duration: number): ReadonlyArray<Lane> => {
  const { clock, version } = sources;
  // The Board and the catalogue are the registered files'; a version folder has neither yet.
  const registered = version.files === 'film';
  const ifRegistered = <A>(clips: () => ReadonlyArray<A>): ReadonlyArray<A> =>
    Bool.match(registered, { onTrue: clips, onFalse: () => [] });
  const catalogue = either(registered, sources.catalogue, NO_RENDERS);
  const lanes: ReadonlyArray<Lane> = [
    { track: 'script', clips: scriptLane(clock, version.files) },
    { track: 'board', clips: ifRegistered(() => boardLane(clock, sources.board)) },
    { track: 'voice', clips: voiceLane(clock) },
    { track: 'scenes', clips: scenesLane(clock, catalogue) },
    { track: 'sound', clips: soundLane(clock) },
    { track: 'render', clips: ifRegistered(() => renderLane(clock, catalogue, duration)) },
  ];
  return lanes.filter((lane) => lane.clips.length > 0);
};

const NO_RENDERS: Catalogue = { film: '', renders: [], approvals: [], comments: [] };

/** Each stage as the lanes stand: a lane is a reached stage; the animatic is reached with the Board and the voice; shorts with a short's render. */
const flowOf = (lanes: ReadonlyArray<Lane>, shorts: boolean): ReadonlyArray<FlowStage> => {
  const has = (track: Track) => lanes.some((l) => l.track === track);
  const reached: Readonly<Record<Stage, boolean>> = {
    script: has('script'),
    concept: false,
    board: has('board'),
    voice: has('voice'),
    animatic: has('board') && has('voice'),
    scenes: has('scenes'),
    sound: has('sound'),
    render: has('render'),
    shorts,
  };
  return STAGES.map((stage): FlowStage => {
    if (stage === 'concept') return { state: 'gap', stage, why: CONCEPT_GAP };
    if (reached[stage]) return { state: 'reached', stage };
    return { state: 'ahead', stage, starts: STARTS[stage] };
  });
};

/** The furthest stage reached, else the first. */
const stageOf = (flow: ReadonlyArray<FlowStage>): Stage =>
  Option.getOrElse(
    Option.map(Arr.last(flow.filter((f) => f.state === 'reached')), (f) => f.stage),
    (): Stage => 'script',
  );

/** The stages ahead: the first with what starts it, the later ones after it. */
const nextOf = (flow: ReadonlyArray<FlowStage>): Option.Option<NextRow> => {
  const ahead = flow.flatMap((f) =>
    FlowStage.match(f, { reached: () => [], gap: () => [], ahead: (a) => [a] }),
  );
  return Option.map(Arr.head(ahead), (first) => ({
    stage: first.stage,
    starts: first.starts,
    later: ahead.slice(1).map((f) => f.stage),
  }));
};

/** Whether an ask is about the film: it names it, or its production. */
const asksAbout = (sources: TimelineSources): ReadonlyArray<AskRecord> =>
  sources.asks.filter(
    (a) => a.film === sources.film || Option.exists(sources.production, (p) => a.production === p),
  );

/** The beat an ask's material names first on this film: a script's first beat, a panel's beat, a take's. */
const askBeat = (film: string, ask: AskRecord): Option.Option<string> =>
  Arr.findFirst(materialsIn(ask.ask), ({ block }): Option.Option<string> =>
    Match.value(block).pipe(
      Match.discriminators('kind')({
        script: (s) =>
          Option.flatMap(
            Option.liftPredicate(s, (b) => b.film === film),
            (b) => Option.flatMap(Option.fromUndefinedOr(b.beats), Arr.head),
          ),
        board: (b) =>
          Option.flatMap(
            Option.liftPredicate(b, (on) => on.film === film),
            (on) =>
              Option.flatMap(Option.fromUndefinedOr(on.panels), (panels) =>
                Option.flatMap(Arr.head(panels), (id) => Arr.head(id.split('.'))),
              ),
          ),
        audio: (a) =>
          Option.map(
            Option.liftPredicate(a, (on) => on.film === film),
            (on) => on.beat,
          ),
      }),
      Match.orElse(() => Option.none<string>()),
    ),
  );

const isAsking = (ask: AskRecord) => ask.state._tag === 'Asking';

/** A note's status while it waits (open, or answered by an agent); none once it is done. */
const waitingStatus = (note: Note): Option.Option<'open' | 'replied'> =>
  Match.value(note.status).pipe(
    Match.when('resolved', () => Option.none()),
    Match.orElse((status) => Option.some(status)),
  );

/** The flags: each open ask at the first beat it names (the film's start when it names none), and, on the film's registered files, each note not yet done at its time. */
const markersOf = (sources: TimelineSources): ReadonlyArray<Marker> => {
  const { clock, film } = sources;
  const startOf = (beat: string) =>
    Option.map(
      Arr.findFirst(clock.beats, (b) => b.id === beat),
      (b) => b.start,
    );
  const asks = asksAbout(sources)
    .filter(isAsking)
    .map((ask): Marker => ({
      kind: 'ask',
      id: ask.id,
      title: ask.title,
      at: Option.getOrElse(Option.flatMap(askBeat(film, ask), startOf), () => 0),
      href: pageHref.ask(ask.id),
    }));
  const placed = clock.beats.map((b) => ({ spec: { id: b.id }, start: b.start, dur: b.dur }));
  // A note's time is on the registered film's clock: a version folder's flags none.
  const notes = Bool.match(sources.version.files === 'film', {
    onFalse: (): ReadonlyArray<Marker> => [],
    onTrue: () =>
      sources.notes.flatMap((note) =>
        Option.toArray(
          Option.map(waitingStatus(note), (status): Marker => ({
            kind: 'note',
            id: note.id,
            text: gist(note.text),
            beat: note.scene,
            at: noteT(placed, FILM_FPS, note),
            status,
            href: notePath(note),
          })),
        ),
      ),
  });
  return Arr.sort(
    [...asks, ...notes],
    Order.mapInput(Order.Number, (m: Marker) => m.at),
  );
};

/** The beats whose Board is ready to approve: every picture panel keeps a try, and the beat is not approved as it stands. */
const beatsToApprove = (board: BoardFile): ReadonlyArray<string> =>
  Arr.dedupe(board.panels.map((p) => p.beat)).filter(
    (beat) =>
      Result.isSuccess(approveBeat(board, beat, '')) && approvalOf(board, beat) !== 'approved',
  );

/** What waits on the owner, film-wide: open asks, notes an agent answered, beats ready to approve. */
const waitingOf = (sources: TimelineSources): ReadonlyArray<Waiting> => [
  ...asksAbout(sources)
    .filter(isAsking)
    .map((ask): Waiting => ({
      kind: 'ask',
      id: ask.id,
      title: ask.title,
      href: pageHref.ask(ask.id),
    })),
  ...sources.notes
    .filter((n) => n.status === 'replied')
    .map((n): Waiting => ({ kind: 'note', id: n.id, text: gist(n.text), href: notePath(n) })),
  ...beatsToApprove(sources.board).map((beat): Waiting => ({
    kind: 'approve',
    beat,
    href: boardPath(sources.film, beat, Option.none()),
  })),
];

/** The film's timeline at the sources' version. Pure. */
export const timelineOf = (sources: TimelineSources): FilmTimeline => {
  const duration = Option.getOrElse(Option.map(Arr.last(sources.clock.beats), end), () => 0);
  const lanes = lanesOf(sources, duration);
  const shorts =
    sources.version.files === 'film' &&
    sources.catalogue.renders.some((r) => r.address._tag === 'Short');
  const flow = flowOf(lanes, shorts);
  const waits = waitingOf(sources);
  return {
    film: sources.film,
    ...Option.match(sources.production, {
      onNone: () => ({}),
      onSome: (production) => ({ production }),
    }),
    version: sources.version,
    versions: sources.versions,
    duration,
    bands: sources.clock.acts,
    lanes,
    flow,
    ...Option.match(nextOf(flow), { onNone: () => ({}), onSome: (next) => ({ next }) }),
    markers: markersOf(sources),
    header: {
      stage: stageOf(flow),
      ...Option.match(Arr.match(waits, { onEmpty: Option.none, onNonEmpty: Option.some }), {
        onNone: () => ({}),
        onSome: (items) => ({ waits: { count: items.length, items } }),
      }),
      working: sources.working,
    },
  };
};

/** `timeline` with only the lanes of `tracks`, when it names some. Pure. */
export const onlyTracks = (
  timeline: FilmTimeline,
  tracks: Option.Option<ReadonlyArray<Track>>,
): FilmTimeline =>
  Option.match(tracks, {
    onNone: () => timeline,
    onSome: (only) => ({
      ...timeline,
      lanes: timeline.lanes.filter((l) => only.includes(l.track)),
    }),
  });
