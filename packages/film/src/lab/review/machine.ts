// The review's two machines. The synced player: every video of a set on one
// clock (the first variant's), paused, playing, scrubbed or waiting on a
// stalled video, at ½× or 1×, with one card's sound heard. The view: all the
// variants, the first against one other (side by side, or wiped: stacked
// full width, the other right of a divider), the moments (every variant's
// frame at a few instants), the first and one other's difference at a moment
// (PA-8: stills cut at the same instant, so the blend is exact), or the notes.
//
//   Paused ─Play→ Playing ─Pause→ Paused     Playing ─Stalled→ Buffering ─Resumed→ Playing
//   any ─ScrubMoved→ Scrubbing ─ScrubReleased→ Playing | Paused (as it was)
//   Playing | Buffering ─Ended→ Paused (at the end)
//   any ─Stepped | Landed | Measured | HeardChosen | RateChosen→ the same, changed
//
//   All | Pair | Wipe | Moments | Diff | Notes ─ViewChosen→ any (Pair, Wipe, Diff only with a second version)
//   Pair | Wipe | Diff ─OtherChosen→ the same, against that other
//   Moments | Diff ─MomentChosen | MomentStepped→ the same, at that moment| Pair | Moments | Notes ─ViewChosen→ any (Pair only with a second version)
//   Pair ─OtherChosen→ Pair
//   Moments ─MomentChosen | MomentStepped→ Moments
//
// Events are facts (a button pressed, the clock moved on, a video stalled);
// the driver (`sync.ts`) makes the videos do what each state says. A seek (a
// scrub, a step, Back landing on an entry's time, a play from the end) bumps `seek`, so the driver moves the
// videos only then, never for the clock's own ticks.
//
// The view is kept in the set's URL (`?view= &other= &m=`), not in an actor:
// the page reads it from there, and `stepView` runs one event through the
// view machine to the state the page writes back.

import { Effect, Match, Option, Schema } from 'effect';
import { Event, Machine, State, simulate } from 'effect-machine';
import { SET_VIEWS } from '../../core/api.ts';
import { timecode } from '../../core/time.ts';

/** Seconds a ←/→ step moves. */
export const STEP_S = 2;

/** An end not known yet: the first video's metadata has not loaded. */
export const UNKNOWN_END = Number.MAX_SAFE_INTEGER;

/** The rates the player offers. */
export const Rate = Schema.Literals([0.5, 1]);
export type Rate = typeof Rate.Type;

const Clock = {
  /** Where the set is, in seconds on its first video. */
  t: Schema.Finite,
  /** Where every video starts (the manifest's `start`). */
  start: Schema.Finite,
  /** Where the first video ends, once known (`UNKNOWN_END` before). */
  end: Schema.Finite,
  rate: Rate,
  /** The variant whose sound is heard. */
  audible: Schema.String,
  /** Counts the seeks: the driver moves the videos when it changes. */
  seek: Schema.Int,
};

export const SyncState = State({
  Paused: Clock,
  Playing: Clock,
  /** The scrub bar held; `resume` says whether to play once it is let go. */
  Scrubbing: { ...Clock, resume: Schema.Boolean },
  /** Playing, but a video has stalled: the rest wait for it. */
  Buffering: Clock,
});
export type SyncState = typeof SyncState.Type;

export const SyncEvent = Event({
  PlayPressed: {},
  PausePressed: {},
  /** Space, or the big button: play when paused, pause otherwise. */
  Toggled: {},
  /** The first video moved on while playing. */
  Ticked: { t: Schema.Finite },
  ScrubMoved: { t: Schema.Finite },
  ScrubReleased: {},
  Stepped: { by: Schema.Finite },
  /** Back or Forward landed on an entry whose `#t=` (or the set's start) is `t`. */
  Landed: { t: Schema.Finite },
  Stalled: {},
  Resumed: {},
  Ended: {},
  /** The first video's length, once its metadata loads. */
  Measured: { end: Schema.Finite },
  HeardChosen: { id: Schema.String },
  RateChosen: { rate: Rate },
});
export type SyncEvent = typeof SyncEvent.Type;

/** A state's clock, whatever the state. */
interface SyncClock {
  readonly t: number;
  readonly start: number;
  readonly end: number;
  readonly rate: Rate;
  readonly audible: string;
  readonly seek: number;
}

const clockOf = (state: SyncState): SyncClock => ({
  t: state.t,
  start: state.start,
  end: state.end,
  rate: state.rate,
  audible: state.audible,
  seek: state.seek,
});

const clamp = (clock: SyncClock, t: number) => Math.max(clock.start, Math.min(clock.end, t));

/** The same state with its clock changed. */
const withClock = (state: SyncState, clock: SyncClock): SyncState =>
  Match.value(state).pipe(
    Match.tagsExhaustive({
      Paused: () => SyncState.Paused(clock),
      Playing: () => SyncState.Playing(clock),
      Scrubbing: (s) => SyncState.Scrubbing({ ...clock, resume: s.resume }),
      Buffering: () => SyncState.Buffering(clock),
    }),
  );

/** How near the end a play starts over from the start. */
const AT_END_S = 0.05;

/** Play from where the clock is, or from the start when it stands at the end. */
const played = (state: SyncState): SyncState => {
  const clock = clockOf(state);
  if (clock.t < clock.end - AT_END_S) return SyncState.Playing(clock);
  return SyncState.Playing({ ...clock, t: clock.start, seek: clock.seek + 1 });
};

/** Whether a scrub let go should play: it was playing (or waiting to) when it was taken. */
const resumes = (state: SyncState): boolean =>
  Match.value(state).pipe(
    Match.tagsExhaustive({
      Paused: () => false,
      Playing: () => true,
      Scrubbing: (s) => s.resume,
      Buffering: () => true,
    }),
  );

const ANY = [
  SyncState.Paused,
  SyncState.Playing,
  SyncState.Scrubbing,
  SyncState.Buffering,
] as const;
const MOVING = [SyncState.Playing, SyncState.Buffering] as const;

/** The synced player: `audible` heard first, paused at `at` (never before `start`). */
export const syncMachine = (audible: string, start: number, at: number = start) =>
  Machine.make({
    state: SyncState,
    event: SyncEvent,
    initial: SyncState.Paused({
      t: Math.max(start, at),
      start,
      end: UNKNOWN_END,
      rate: 1,
      audible,
      seek: 0,
    }),
  })
    .on(SyncState.Paused, SyncEvent.PlayPressed, ({ state }) => played(state))
    .on(SyncState.Paused, SyncEvent.Toggled, ({ state }) => played(state))
    .on(MOVING, SyncEvent.PausePressed, ({ state }) => SyncState.Paused(clockOf(state)))
    .on(MOVING, SyncEvent.Toggled, ({ state }) => SyncState.Paused(clockOf(state)))
    .on(SyncState.Playing, SyncEvent.Ticked, ({ state, event }) =>
      SyncState.Playing({ ...clockOf(state), t: clamp(clockOf(state), event.t) }),
    )
    .on(SyncState.Playing, SyncEvent.Stalled, ({ state }) => SyncState.Buffering(clockOf(state)))
    .on(SyncState.Buffering, SyncEvent.Resumed, ({ state }) => SyncState.Playing(clockOf(state)))
    .on(MOVING, SyncEvent.Ended, ({ state }) =>
      SyncState.Paused({ ...clockOf(state), t: state.end }),
    )
    .on(ANY, SyncEvent.ScrubMoved, ({ state, event }) => {
      const clock = clockOf(state);
      return SyncState.Scrubbing({
        ...clock,
        t: clamp(clock, event.t),
        seek: clock.seek + 1,
        resume: resumes(state),
      });
    })
    .on(SyncState.Scrubbing, SyncEvent.ScrubReleased, ({ state }) => {
      if (state.resume) return SyncState.Playing(clockOf(state));
      return SyncState.Paused(clockOf(state));
    })
    .on(ANY, SyncEvent.Stepped, ({ state, event }) => {
      const clock = clockOf(state);
      return withClock(state, {
        ...clock,
        t: clamp(clock, clock.t + event.by),
        seek: clock.seek + 1,
      });
    })
    .on(ANY, SyncEvent.Landed, ({ state, event }) => {
      const clock = clockOf(state);
      return withClock(state, { ...clock, t: clamp(clock, event.t), seek: clock.seek + 1 });
    })
    .on(ANY, SyncEvent.Measured, ({ state, event }) => {
      // A time opened past the end (a link's `#t=`) stands at the end.
      const end = Math.max(state.start, event.end);
      return withClock(state, { ...clockOf(state), end, t: Math.min(state.t, end) });
    })
    .on(ANY, SyncEvent.HeardChosen, ({ state, event }) =>
      withClock(state, { ...clockOf(state), audible: event.id }),
    )
    .on(ANY, SyncEvent.RateChosen, ({ state, event }) =>
      withClock(state, { ...clockOf(state), rate: event.rate }),
    );

/** The synced player's actor, started. */
export const spawnSync = (audible: string, start: number, at: number = start) =>
  Machine.spawn(syncMachine(audible, start, at)).pipe(Effect.tap((actor) => actor.start));

export type SyncActor = Effect.Success<ReturnType<typeof spawnSync>>;

/** Whether the videos should be running: only while playing (a stall holds them all). */
export const runningOf = (state: SyncState): boolean => state._tag === 'Playing';

/**
 * What the transport says of the clock, in two parts: where it is
 * (`00:00:12:09`), and the rest (` / 00:00:25:00`, and ` · waiting` while it
 * waits on a video), which a phone's one-row transport leaves out.
 */
export const clockParts = (state: SyncState) => {
  const end = Match.value(state.end >= UNKNOWN_END).pipe(
    Match.when(true, () => '…'),
    Match.orElse(() => timecode(state.end)),
  );
  const waiting = Match.value(state._tag).pipe(
    Match.when('Buffering', () => ' · waiting'),
    Match.orElse(() => ''),
  );
  return { at: timecode(Math.max(0, state.t)), rest: ` / ${end}${waiting}` };
};

/** What the transport says of the clock, in timecode: `00:00:12:09 / 00:00:25:00`, and when it waits on a video. */
export const clockText = (state: SyncState): string => {
  const { at, rest } = clockParts(state);
  return `${at}${rest}`;
};

/** The scrub bar's reach: the first video's end once known, else where the clock is. */
export const reachOf = (state: SyncState): number => {
  if (state.end >= UNKNOWN_END) return Math.max(state.t, state.start);
  return state.end;
};

// ---------------------------------------------------------------------------
// The view

export const ViewName = Schema.Literals(SET_VIEWS);
export type ViewName = typeof ViewName.Type;

export const ViewState = State({
  All: {},
  /** The first variant against `other`, side by side. */
  Pair: { other: Schema.String },
  /** The first variant against `other`, stacked full width: the first left of a divider, `other` right of it. */
  Wipe: { other: Schema.String },
  /** Every variant's frame at the `index`th moment. */
  Moments: { index: Schema.Int },
  /** The first variant's frame and `other`'s at the `index`th moment, in the difference blend. */
  Diff: { other: Schema.String, index: Schema.Int },
  Notes: {},
});
export type ViewState = typeof ViewState.Type;

export const ViewEvent = Event({
  ViewChosen: { view: ViewName },
  OtherChosen: { id: Schema.String },
  MomentChosen: { index: Schema.Int },
  /** ←/→ in the moments: `by` moments on, wrapping round the set's `count`. */
  MomentStepped: { by: Schema.Int, count: Schema.Int },
});
export type ViewEvent = typeof ViewEvent.Type;

const VIEWS = [
  ViewState.All,
  ViewState.Pair,
  ViewState.Wipe,
  ViewState.Moments,
  ViewState.Diff,
  ViewState.Notes,
] as const;

/** The views of the first against one other: a set of one has none of them. */
const PAIRED: ReadonlyArray<ViewName> = ['pair', 'wipe', 'diff'];

/** The state `view` shows: a pair, its wipe or its difference against `other`, the moments at `index`. */
const viewEntered = (view: ViewName, other: string, index: number): ViewState =>
  Match.value(view).pipe(
    Match.when('all', () => ViewState.All),
    Match.when('pair', () => ViewState.Pair({ other })),
    Match.when('wipe', () => ViewState.Wipe({ other })),
    Match.when('moments', () => ViewState.Moments({ index })),
    Match.when('diff', () => ViewState.Diff({ other, index })),
    Match.orElse(() => ViewState.Notes),
  );

/** The other `state` is against: a pair's, its wipe's or its difference's. */
export const otherOf = (state: ViewState): Option.Option<string> =>
  Match.value(state).pipe(
    Match.tag('Pair', 'Wipe', 'Diff', (s) => Option.some(s.other)),
    Match.orElse(() => Option.none()),
  );

/** The moment `state` is at: the moments' or the difference's. */
const indexOf = (state: ViewState): number =>
  Match.value(state).pipe(
    Match.tag('Moments', 'Diff', (s) => s.index),
    Match.orElse(() => 0),
  );

/** `index + by`, wrapped round `count` (0 when there are none). */
export const wrapped = (index: number, by: number, count: number): number => {
  const n = Math.max(1, count);
  return (((index + by) % n) + n) % n;
};

/** `state` at moment `index`: the moments, or the difference against the same other. */
const atMoment = (state: ViewState, index: number): ViewState =>
  Match.value(state).pipe(
    Match.tag('Diff', (s) => ViewState.Diff({ other: s.other, index })),
    Match.orElse(() => ViewState.Moments({ index })),
  );

/**
 * The view machine, starting in `initial`; a pair's first other is `other`.
 * A set with no other (one version) has no side by side, no wipe and no
 * difference: it opens in All where a link asks for one, and choosing one
 * leaves it as it is. The pair, its wipe and its difference share the other
 * chosen; the moments and the difference share the moment.
 */
export const viewMachine = (initial: ViewState, other: Option.Option<string>) =>
  Machine.make({
    state: ViewState,
    event: ViewEvent,
    initial: Option.match(otherOf(initial), {
      onNone: () => initial,
      onSome: (): ViewState =>
        Option.match(other, { onSome: () => initial, onNone: () => ViewState.All }),
    }),
  })
    .on(VIEWS, ViewEvent.ViewChosen, ({ state, event }) =>
      Option.match(
        Option.orElse(otherOf(state), () => other),
        {
          onSome: (o) => viewEntered(event.view, o, indexOf(state)),
          onNone: () =>
            Match.value(PAIRED.includes(event.view)).pipe(
              Match.when(true, () => state),
              Match.orElse(() => viewEntered(event.view, '', indexOf(state))),
            ),
        },
      ),
    )
    .on(ViewState.Pair, ViewEvent.OtherChosen, ({ event }) => ViewState.Pair({ other: event.id }))
    .on(ViewState.Wipe, ViewEvent.OtherChosen, ({ event }) => ViewState.Wipe({ other: event.id }))
    .on(ViewState.Diff, ViewEvent.OtherChosen, ({ state, event }) =>
      ViewState.Diff({ other: event.id, index: state.index }),
    )
    .on([ViewState.Moments, ViewState.Diff], ViewEvent.MomentChosen, ({ state, event }) =>
      atMoment(state, Math.max(0, event.index)),
    )
    .on([ViewState.Moments, ViewState.Diff], ViewEvent.MomentStepped, ({ state, event }) =>
      atMoment(state, wrapped(state.index, event.by, event.count)),
    );

/** The view `event` leaves `state` in, with `other` a pair's first other. */
export const stepView = (
  state: ViewState,
  other: Option.Option<string>,
  event: ViewEvent,
): ViewState => Effect.runSync(simulate(viewMachine(state, other), [event])).finalState;

/** The name of the view `state` shows. */
export const viewNameOf = (state: ViewState): ViewName =>
  Match.value(state).pipe(
    Match.tagsExhaustive({
      All: (): ViewName => 'all',
      Pair: (): ViewName => 'pair',
      Wipe: (): ViewName => 'wipe',
      Moments: (): ViewName => 'moments',
      Diff: (): ViewName => 'diff',
      Notes: (): ViewName => 'notes',
    }),
  );

/**
 * Whether a view plays the videos (so shows the transport): all, the pair
 * and its wipe. The difference stands on stills: two videos kept within the
 * sync's drift would still differ by a frame, and light false edges.
 */
export const playsIn = (view: ViewName): boolean =>
  view === 'all' || view === 'pair' || view === 'wipe';

/** The instants the moments show when the set names none: 5, 25, 50, 75 and 95% in. */
const MOMENT_SPREAD = [0.05, 0.25, 0.5, 0.75, 0.95] as const;

/** Five instants spread over a video of `seconds`, none before `start`, to a tenth. */
export const spreadMoments = (seconds: number, start: number): ReadonlyArray<number> =>
  MOMENT_SPREAD.map((x) => Math.max(start, Math.round(seconds * x * 10) / 10));
