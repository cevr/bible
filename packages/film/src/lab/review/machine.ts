// The review's two machines. The synced player: every video of a set on one
// clock (the first variant's), paused, playing, scrubbed or waiting on a
// stalled video, at ½× or 1×, with one card's sound heard. The view: all the
// variants, the first against one other, the moments (every variant's frame
// at a few instants), or the notes.
//
//   Paused ─Play→ Playing ─Pause→ Paused     Playing ─Stalled→ Buffering ─Resumed→ Playing
//   any ─ScrubMoved→ Scrubbing ─ScrubReleased→ Playing | Paused (as it was)
//   Playing | Buffering ─Ended→ Paused (at the end)
//   any ─Stepped | Landed | Measured | HeardChosen | RateChosen→ the same, changed
//
//   All | Pair | Moments | Notes ─ViewChosen→ any (Pair only with a second version)
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

/** What the transport says of the clock, in timecode: `00:00:12:09 / 00:00:25:00`, and when it waits on a video. */
export const clockText = (state: SyncState): string => {
  const end = Match.value(state.end >= UNKNOWN_END).pipe(
    Match.when(true, () => '…'),
    Match.orElse(() => timecode(state.end)),
  );
  const waiting = Match.value(state._tag).pipe(
    Match.when('Buffering', () => ' · waiting'),
    Match.orElse(() => ''),
  );
  return `${timecode(Math.max(0, state.t))} / ${end}${waiting}`;
};

/** The scrub bar's reach: the first video's end once known, else where the clock is. */
export const reachOf = (state: SyncState): number => {
  if (state.end >= UNKNOWN_END) return Math.max(state.t, state.start);
  return state.end;
};

// ---------------------------------------------------------------------------
// The view

export const ViewName = Schema.Literals(['all', 'pair', 'moments', 'notes']);
export type ViewName = typeof ViewName.Type;

export const ViewState = State({
  All: {},
  /** The first variant against `other`. */
  Pair: { other: Schema.String },
  /** Every variant's frame at the `index`th moment. */
  Moments: { index: Schema.Int },
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

const VIEWS = [ViewState.All, ViewState.Pair, ViewState.Moments, ViewState.Notes] as const;

/** The state `view` shows: a pair against `other`, the moments from the first. */
const viewEntered = (view: ViewName, other: string): ViewState =>
  Match.value(view).pipe(
    Match.when('all', () => ViewState.All),
    Match.when('pair', () => ViewState.Pair({ other })),
    Match.when('moments', () => ViewState.Moments({ index: 0 })),
    Match.orElse(() => ViewState.Notes),
  );

/** `index + by`, wrapped round `count` (0 when there are none). */
export const wrapped = (index: number, by: number, count: number): number => {
  const n = Math.max(1, count);
  return (((index + by) % n) + n) % n;
};

/**
 * The view machine, starting in `initial`; a pair's first other is `other`.
 * A set with no other (one version) has no side by side: it opens in All
 * where a link asks for the pair, and choosing the pair leaves it as it is.
 */
export const viewMachine = (initial: ViewState, other: Option.Option<string>) =>
  Machine.make({
    state: ViewState,
    event: ViewEvent,
    initial: Match.value(initial).pipe(
      Match.tag('Pair', (pair): ViewState =>
        Option.match(other, { onSome: () => pair, onNone: () => ViewState.All }),
      ),
      Match.orElse((s) => s),
    ),
  })
    .on(VIEWS, ViewEvent.ViewChosen, ({ state, event }) => {
      // A pair keeps the other it had; the moments start from the first.
      const kept = Match.value(state).pipe(
        Match.tag('Pair', (s) => Option.some(s.other)),
        Match.orElse(() => other),
      );
      return Option.match(kept, {
        onSome: (o) => viewEntered(event.view, o),
        onNone: () =>
          Match.value(event.view).pipe(
            Match.when('pair', () => state),
            Match.orElse((view) => viewEntered(view, '')),
          ),
      });
    })
    .on(ViewState.Pair, ViewEvent.OtherChosen, ({ event }) => ViewState.Pair({ other: event.id }))
    .on(ViewState.Moments, ViewEvent.MomentChosen, ({ event }) =>
      ViewState.Moments({ index: Math.max(0, event.index) }),
    )
    .on(ViewState.Moments, ViewEvent.MomentStepped, ({ state, event }) =>
      ViewState.Moments({ index: wrapped(state.index, event.by, event.count) }),
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
      Moments: (): ViewName => 'moments',
      Notes: (): ViewName => 'notes',
    }),
  );

/** Whether a view plays the videos (so shows the transport): all, and the pair. */
export const playsIn = (view: ViewName): boolean => view === 'all' || view === 'pair';

/** The instants the moments show when the set names none: 5, 25, 50, 75 and 95% in. */
const MOMENT_SPREAD = [0.05, 0.25, 0.5, 0.75, 0.95] as const;

/** Five instants spread over a video of `seconds`, none before `start`, to a tenth. */
export const spreadMoments = (seconds: number, start: number): ReadonlyArray<number> =>
  MOMENT_SPREAD.map((x) => Math.max(start, Math.round(seconds * x * 10) / 10));
