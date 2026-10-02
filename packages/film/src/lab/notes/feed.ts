// The notes feed, the lab page's live connection to its server, as one
// machine: it reads the notes, then long-polls past the cursor, so a reply
// the agent makes from `film notes` lands on the page as it is written. A
// wait that brings changes reads the notes again; one that brings none (the
// server answers empty after WAIT_S) waits again. A read takes the file's own
// cursor, and a wait whose cursor went back (a notes file trashed, moved or
// restored, even to an empty log) reads again, so the page shows the file
// as it is and waits past where it stands. A failed read or wait loses
// the feed, keeping the notes it had and saying the server's words, and it
// connects again after RETRY_MS: a state timeout, so the timer is the actor's
// and stops with the state. A change this page made (a note, a reply, a
// resolve) reads the notes at once. Each state's call is its task, so leaving
// the state cancels it (the long-poll's fetch with it).
//
//   Connecting ─Synced→ Live ─Waited | Synced→ Live
//   Connecting | Live ─Dropped→ Lost ─Retry (after RETRY_MS)→ Connecting
//   Live | Lost ─Refresh→ Connecting        Connecting ─Refresh→ Connecting (read again)

import { Duration, Effect, Match, Schema } from 'effect';
import { Event, Machine, State } from 'effect-machine';
import { Note, NotesFile } from '../../core/schema.ts';
import { type LabFailure, NotesApi } from '../api.ts';

/** How long a lost feed waits before it connects again. */
export const RETRY_MS = 2000;

const Notes = Schema.Array(Note);
/** A change's number in the film's note log: the cursor a wait waits past. */
const Cursor = NotesFile.fields.seq;

export const FeedState = State({
  /** Reading the notes. */
  Connecting: { notes: Notes, cursor: Cursor },
  /** The notes read, and a wait out past `cursor`. */
  Live: { notes: Notes, cursor: Cursor },
  /** The last read or wait failed: the server's words, and the notes it had. */
  Lost: { notes: Notes, cursor: Cursor, reason: Schema.String },
});
export type FeedState = typeof FeedState.Type;

export const FeedEvent = Event({
  /** The notes, read at `cursor`. */
  Synced: { notes: Notes, cursor: Cursor },
  /** A wait answered with nothing new, at `cursor`. */
  Waited: { cursor: Cursor },
  Dropped: { reason: Schema.String },
  Retry: {},
  /** This page changed the notes. */
  Refresh: {},
});
export type FeedEvent = typeof FeedEvent.Type;

/** Read the notes: the file's own cursor, even below the last one (a reset file). */
const read = NotesApi.use((api) =>
  Effect.map(api.notes, (file) => FeedEvent.Synced({ notes: file.notes, cursor: file.seq })),
);

/** Wait past `cursor`; read the notes again if the wait brought changes or the cursor went back. */
const follow = (cursor: number) =>
  NotesApi.use((api) =>
    Effect.flatMap(api.wait(cursor), (waited): Effect.Effect<FeedEvent, LabFailure, NotesApi> => {
      // A cursor gone back is a reset file, read again even when it has no events.
      if (waited.events.length === 0 && waited.cursor >= cursor)
        return Effect.succeed(FeedEvent.Waited({ cursor: waited.cursor }));
      return read;
    }),
  );

const dropped = (e: { readonly message: string }) => FeedEvent.Dropped({ reason: e.message });

export const feedMachine = Machine.make({
  state: FeedState,
  event: FeedEvent,
  initial: FeedState.Connecting({ notes: [], cursor: 0 }),
})
  .task(FeedState.Connecting, () => read, { onFailure: dropped })
  .on(FeedState.Connecting, FeedEvent.Synced, ({ event }) =>
    FeedState.Live({ notes: event.notes, cursor: event.cursor }),
  )
  .task(FeedState.Live, ({ state }) => follow(state.cursor), { onFailure: dropped })
  .reenter(FeedState.Live, FeedEvent.Synced, ({ event }) =>
    FeedState.Live({ notes: event.notes, cursor: event.cursor }),
  )
  .reenter(FeedState.Live, FeedEvent.Waited, ({ state, event }) =>
    FeedState.Live({ notes: state.notes, cursor: Math.max(state.cursor, event.cursor) }),
  )
  .on([FeedState.Connecting, FeedState.Live], FeedEvent.Dropped, ({ state, event }) =>
    FeedState.Lost({ notes: state.notes, cursor: state.cursor, reason: event.reason }),
  )
  .timeout(FeedState.Lost, { duration: Duration.millis(RETRY_MS), event: FeedEvent.Retry })
  .on(FeedState.Lost, FeedEvent.Retry, ({ state }) =>
    FeedState.Connecting({ notes: state.notes, cursor: state.cursor }),
  )
  .on([FeedState.Live, FeedState.Lost], FeedEvent.Refresh, ({ state }) =>
    FeedState.Connecting({ notes: state.notes, cursor: state.cursor }),
  )
  .reenter(FeedState.Connecting, FeedEvent.Refresh, ({ state }) =>
    FeedState.Connecting({ notes: state.notes, cursor: state.cursor }),
  );

/** The feed's actor, connecting. */
export const spawnFeed = Machine.spawn(feedMachine).pipe(Effect.tap((actor) => actor.start));

export type FeedActor = Effect.Success<typeof spawnFeed>;

/** What the notes say of the feed: nothing while it holds, the reason once lost. */
export const feedText = (state: FeedState): string =>
  Match.value(state).pipe(
    Match.tag('Lost', (s) => `notes offline: ${s.reason}; trying again`),
    Match.orElse(() => ''),
  );
