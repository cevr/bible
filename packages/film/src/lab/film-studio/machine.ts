// The studio page's machines. One reads the film's timeline at the version
// the address names and reads it again when the owner opens another
// version; one follows the transport: paused, playing, or held by a scrub
// (which remembers whether it cut play off; the page resumes play on
// release, `context.tsx`). Time itself is the clock's (`clock.ts`), never a
// machine's state: it moves every frame.
//
//   Timeline:  Reading ─Read→ Shown ─Version→ Reading
//              Reading ─Unread→ Unreadable ─Retry (a failure that can pass) | Version→ Reading
//              Reading ─Version (another)→ Reading, its read started again
//              Shown ─Version (the one shown)→ Shown
//              Shown ─Refresh→ Refreshing ─Read | Unread→ Shown
//              Refreshing ─Refresh→ Refreshing, its read started again
//   A read's answer names its version: Reading hears only its own, so a
//   read the owner left while it was in flight never shows. Refreshing
//   shows the timeline it had while the version is read again (a write
//   landed: a try kept, a beat approved), and keeps it when the read fails;
//   a write that lands while it reads starts the read again, so the read
//   that ends holds it.
//   Transport: Paused ─Played→ Playing ─Paused→ Paused
//              Paused | Playing ─Grab→ Scrubbing{resume} ─Release→ Paused
//              Scrubbing hears no Played or Paused: the scrub holds the clock.
//
// Nothing here touches the DOM or the lab: the read is the provider's
// effect, faked in tests.

import { Boolean as Bool, Effect, Schema } from 'effect';
import { Event, Machine, State } from 'effect-machine';
import { FilmTimeline } from '../../core/timeline-schema.ts';

export const TimelineState = State({
  /** Reading version `v` (0: the production's open one). */
  Reading: { v: Schema.Int },
  /** The timeline of version `v` as read. */
  Shown: { v: Schema.Int, timeline: FilmTimeline },
  /** Version `v` could not be read: `why`; `lasting` when a retry cannot change it (a refusal). */
  Unreadable: { v: Schema.Int, why: Schema.String, lasting: Schema.Boolean },
  /** Version `v`'s `timeline`, shown while it is read again. */
  Refreshing: { v: Schema.Int, timeline: FilmTimeline },
});
export type TimelineState = typeof TimelineState.Type;

export const TimelineEvent = Event({
  /** Version `v`'s timeline, read. */
  Read: { v: Schema.Int, timeline: FilmTimeline },
  /** Version `v` could not be read: `why`; `lasting` when a retry cannot change it. */
  Unread: { v: Schema.Int, why: Schema.String, lasting: Schema.Boolean },
  /** The owner opened version `v` (0: the open one). */
  Version: { v: Schema.Int },
  Retry: {},
  /** Something the version shows was written: read it again, showing what it shows meanwhile. */
  Refresh: {},
});
export type TimelineEvent = typeof TimelineEvent.Type;

/** Why a read failed, and whether reading again can change it. */
export interface ReadFailure {
  readonly message: string;
  readonly lasting: boolean;
}

/** The timeline machine over `read` (version `v`'s timeline, or why not), opening on version `first`. */
const timelineMachine = <R>(
  read: (v: number) => Effect.Effect<FilmTimeline, ReadFailure, R>,
  first: number,
) =>
  Machine.make({
    state: TimelineState,
    event: TimelineEvent,
    initial: TimelineState.Reading({ v: first }),
  })
    .task(
      TimelineState.Reading,
      ({ state }) =>
        read(state.v).pipe(
          Effect.map((timeline) => TimelineEvent.Read({ v: state.v, timeline })),
          Effect.catch((failure) =>
            Effect.succeed(
              TimelineEvent.Unread({ v: state.v, why: failure.message, lasting: failure.lasting }),
            ),
          ),
        ),
      { onSuccess: (event) => event },
    )
    .when(
      TimelineState.Reading,
      TimelineEvent.Read,
      function readOfThisVersion({ state, event }) {
        return event.v === state.v;
      },
      ({ state, event }) => TimelineState.Shown({ v: state.v, timeline: event.timeline }),
    )
    .on(TimelineState.Reading, TimelineEvent.Read, ({ state }) => state)
    .when(
      TimelineState.Reading,
      TimelineEvent.Unread,
      function unreadOfThisVersion({ state, event }) {
        return event.v === state.v;
      },
      ({ state, event }) =>
        TimelineState.Unreadable({ v: state.v, why: event.why, lasting: event.lasting }),
    )
    .on(TimelineState.Reading, TimelineEvent.Unread, ({ state }) => state)
    .reenterWhen(
      TimelineState.Reading,
      TimelineEvent.Version,
      function anotherVersion({ state, event }) {
        return event.v !== state.v;
      },
      ({ event }) => TimelineState.Reading({ v: event.v }),
    )
    .on(TimelineState.Reading, TimelineEvent.Version, ({ state }) => state)
    .on(TimelineState.Shown, TimelineEvent.Version, ({ state, event }) =>
      Bool.match(event.v === state.v, {
        onTrue: (): TimelineState => state,
        onFalse: () => TimelineState.Reading({ v: event.v }),
      }),
    )
    .on(TimelineState.Unreadable, TimelineEvent.Version, ({ event }) =>
      TimelineState.Reading({ v: event.v }),
    )
    .when(
      TimelineState.Unreadable,
      TimelineEvent.Retry,
      function canPass({ state }) {
        return !state.lasting;
      },
      ({ state }) => TimelineState.Reading({ v: state.v }),
    )
    .on(TimelineState.Unreadable, TimelineEvent.Retry, ({ state }) => state)
    .on(TimelineState.Shown, TimelineEvent.Refresh, ({ state }) =>
      TimelineState.Refreshing({ v: state.v, timeline: state.timeline }),
    )
    .task(
      TimelineState.Refreshing,
      ({ state }) =>
        read(state.v).pipe(
          Effect.map((timeline) => TimelineEvent.Read({ v: state.v, timeline })),
          Effect.catch((failure) =>
            Effect.succeed(
              TimelineEvent.Unread({ v: state.v, why: failure.message, lasting: failure.lasting }),
            ),
          ),
        ),
      { onSuccess: (event) => event },
    )
    .reenter(TimelineState.Refreshing, TimelineEvent.Refresh, ({ state }) =>
      TimelineState.Refreshing({ v: state.v, timeline: state.timeline }),
    )
    .on(TimelineState.Refreshing, TimelineEvent.Read, ({ state, event }) =>
      TimelineState.Shown({ v: state.v, timeline: event.timeline }),
    )
    .on(TimelineState.Refreshing, TimelineEvent.Unread, ({ state }) =>
      TimelineState.Shown({ v: state.v, timeline: state.timeline }),
    )
    .on(TimelineState.Refreshing, TimelineEvent.Version, ({ state, event }) =>
      Bool.match(event.v === state.v, {
        onTrue: (): TimelineState => state,
        onFalse: () => TimelineState.Reading({ v: event.v }),
      }),
    );

/** The timeline machine's actor, started, reading version `first` through `read`. */
export const spawnTimeline = <R>(
  read: (v: number) => Effect.Effect<FilmTimeline, ReadFailure, R>,
  first: number,
) => Machine.spawn(timelineMachine(read, first)).pipe(Effect.tap((actor) => actor.start));

export type TimelineActor = Effect.Success<ReturnType<typeof spawnTimeline<never>>>;

const TransportState = State({
  Paused: {},
  Playing: {},
  /** A scrub holds the playhead; `resume` when it interrupted play. */
  Scrubbing: { resume: Schema.Boolean },
});
type TransportState = typeof TransportState.Type;

export const TransportEvent = Event({
  /** The clock started playing. */
  Played: {},
  /** The clock stopped (a pause, or the film's end). */
  Paused: {},
  /** A scrub took the playhead. */
  Grab: {},
  /** The scrub let it go. */
  Release: {},
});
export type TransportEvent = typeof TransportEvent.Type;

const transportMachine = Machine.make({
  state: TransportState,
  event: TransportEvent,
  initial: TransportState.Paused,
})
  .on(TransportState.Paused, TransportEvent.Played, () => TransportState.Playing)
  .on(TransportState.Playing, TransportEvent.Paused, () => TransportState.Paused)
  .on(TransportState.Paused, TransportEvent.Grab, () => TransportState.Scrubbing({ resume: false }))
  .on(TransportState.Playing, TransportEvent.Grab, () => TransportState.Scrubbing({ resume: true }))
  .on(TransportState.Scrubbing, TransportEvent.Release, () => TransportState.Paused);

/** The transport machine's actor, started, paused. */
export const spawnTransport = Machine.spawn(transportMachine).pipe(
  Effect.tap((actor) => actor.start),
);

export type TransportActor = Effect.Success<typeof spawnTransport>;
