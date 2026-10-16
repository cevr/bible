// The studio page's machines. One reads the film's timeline at the version
// the address names and reads it again when the owner opens another
// version; one follows the transport: paused, playing, or held by a scrub
// (which resumes play on release when it interrupted it). Time itself is the
// clock's (`clock.ts`), never a machine's state: it moves every frame.
//
//   Timeline:  Reading ─Read→ Shown ─Version→ Reading
//              Reading ─Unread→ Unreadable ─Retry | Version→ Reading
//              Shown ─Version (the one shown)→ Shown
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
  /** Version `v` could not be read: `why`. */
  Unreadable: { v: Schema.Int, why: Schema.String },
});
export type TimelineState = typeof TimelineState.Type;

export const TimelineEvent = Event({
  Read: { timeline: FilmTimeline },
  Unread: { why: Schema.String },
  /** The owner opened version `v` (0: the open one). */
  Version: { v: Schema.Int },
  Retry: {},
});
export type TimelineEvent = typeof TimelineEvent.Type;

/** The timeline machine over `read` (version `v`'s timeline, or why not), opening on version `first`. */
const timelineMachine = <R>(
  read: (v: number) => Effect.Effect<FilmTimeline, { readonly message: string }, R>,
  first: number,
) =>
  Machine.make({
    state: TimelineState,
    event: TimelineEvent,
    initial: TimelineState.Reading({ v: first }),
  })
    .task(TimelineState.Reading, ({ state }) => read(state.v), {
      onSuccess: (timeline) => TimelineEvent.Read({ timeline }),
      onFailure: (failure) => TimelineEvent.Unread({ why: failure.message }),
    })
    .on(TimelineState.Reading, TimelineEvent.Read, ({ state, event }) =>
      TimelineState.Shown({ v: state.v, timeline: event.timeline }),
    )
    .on(TimelineState.Reading, TimelineEvent.Unread, ({ state, event }) =>
      TimelineState.Unreadable({ v: state.v, why: event.why }),
    )
    .on(TimelineState.Reading, TimelineEvent.Version, ({ state, event }) =>
      Bool.match(event.v === state.v, {
        onTrue: (): TimelineState => state,
        onFalse: () => TimelineState.Reading({ v: event.v }),
      }),
    )
    .on(TimelineState.Shown, TimelineEvent.Version, ({ state, event }) =>
      Bool.match(event.v === state.v, {
        onTrue: (): TimelineState => state,
        onFalse: () => TimelineState.Reading({ v: event.v }),
      }),
    )
    .on(TimelineState.Unreadable, TimelineEvent.Version, ({ event }) =>
      TimelineState.Reading({ v: event.v }),
    )
    .on(TimelineState.Unreadable, TimelineEvent.Retry, ({ state }) =>
      TimelineState.Reading({ v: state.v }),
    );

/** The timeline machine's actor, started, reading version `first` through `read`. */
export const spawnTimeline = <R>(
  read: (v: number) => Effect.Effect<FilmTimeline, { readonly message: string }, R>,
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
