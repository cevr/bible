// The notes feed, the lab's live connection to the server, with no DOM: it
// reads the notes, then long-polls past the cursor; a wait that brings
// changes reads the notes again, and one that brings none waits again. A
// failed read or wait loses the feed with the server's words, and it
// connects again after a pause. A change this page made reads the notes at
// once.

import { Effect, Layer, Option, SubscriptionRef } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { Machine, assertPath, simulate } from 'effect-machine';
import { TestClock } from 'effect/testing';
import type { Note, NotesFile, NotesWait } from '../../core/schema.ts';
import { LabRefused, NotesApi, type NotesCalls } from '../api.ts';
import { FeedEvent, FeedState, RETRY_MS, feedMachine, feedText } from './feed.ts';

const note = (id: string, text = 'the ball rises too early'): Note => ({
  scene: 'one',
  T: 1,
  frame: 30,
  text,
  id,
  film: 'probe',
  seq: 1,
  changed: 1,
  status: 'open',
  still: `${id}.png`,
  thread: [],
  createdAt: '2026-09-28T00:00:00.000Z',
});

const refused = LabRefused.make({
  status: 503,
  message: 'StoreFailed: notes.json is being written',
});

/**
 * A notes API whose reads answer `reads` in turn (the last one again after),
 * and whose waits answer `waits` in turn, then never. It keeps what was asked.
 */
const fake = (
  reads: ReadonlyArray<Effect.Effect<NotesFile, LabRefused>>,
  waits: ReadonlyArray<NotesWait> = [],
) => {
  const asked: Array<string> = [];
  let read = 0;
  let waited = 0;
  const api: NotesCalls = {
    notes: Effect.suspend(() => {
      asked.push('notes');
      const answer = reads[Math.min(read, reads.length - 1)] ?? Effect.die('no read');
      read += 1;
      return answer;
    }),
    wait: (since) =>
      Effect.suspend(() => {
        asked.push(`wait ${since}`);
        const answer = Option.fromUndefinedOr(waits[waited]);
        waited += 1;
        return Option.match(answer, { onNone: () => Effect.never, onSome: Effect.succeed });
      }),
    add: () => Effect.die('not asked'),
    reply: () => Effect.die('not asked'),
    resolve: () => Effect.die('not asked'),
  };
  return { asked, layer: Layer.succeed(NotesApi, api) };
};

const file = (seq: number, notes: ReadonlyArray<Note>): NotesFile => ({
  film: 'probe',
  seq,
  notes,
});

/** No calls: the transitions alone. */
const quiet = fake([]).layer;

describe('the transitions', () => {
  it.effect('connecting goes live on the notes read; a wait with nothing new waits again', () =>
    Effect.gen(function* () {
      yield* assertPath(
        feedMachine,
        [
          FeedEvent.Synced({ notes: [note('n1')], cursor: 1 }),
          FeedEvent.Waited({ cursor: 1 }),
          FeedEvent.Synced({ notes: [note('n1'), note('n2')], cursor: 2 }),
        ],
        ['Connecting', 'Live', 'Live', 'Live'],
      );
    }).pipe(Effect.provide(quiet)),
  );

  it.effect('a drop loses the feed, keeping the notes; a retry connects again', () =>
    Effect.gen(function* () {
      const result = yield* simulate(feedMachine, [
        FeedEvent.Synced({ notes: [note('n1')], cursor: 1 }),
        FeedEvent.Dropped({ reason: 'notes.json is being written' }),
        FeedEvent.Retry,
      ]);
      expect(result.states.slice(2)).toEqual([
        FeedState.Lost({ notes: [note('n1')], cursor: 1, reason: 'notes.json is being written' }),
        FeedState.Connecting({ notes: [note('n1')], cursor: 1 }),
      ]);
    }).pipe(Effect.provide(quiet)),
  );

  it.effect('a change this page made reads the notes again, live or lost', () =>
    Effect.gen(function* () {
      yield* assertPath(
        feedMachine,
        [
          FeedEvent.Synced({ notes: [], cursor: 0 }),
          FeedEvent.Refresh,
          FeedEvent.Dropped({ reason: 'x' }),
          FeedEvent.Refresh,
        ],
        ['Connecting', 'Live', 'Connecting', 'Lost', 'Connecting'],
      );
    }).pipe(Effect.provide(quiet)),
  );

  it.effect('the cursor never goes back', () =>
    Effect.gen(function* () {
      const result = yield* simulate(feedMachine, [
        FeedEvent.Synced({ notes: [], cursor: 4 }),
        FeedEvent.Waited({ cursor: 2 }),
      ]);
      expect(result.finalState).toEqual(FeedState.Live({ notes: [], cursor: 4 }));
    }).pipe(Effect.provide(quiet)),
  );
});

/** The feed, spawned and connecting. */
const started = Machine.spawn(feedMachine).pipe(Effect.tap((actor) => actor.start));

describe('the connection, through an actor', () => {
  it.effect('reads, waits past the cursor, and reads again when a wait brings changes', () => {
    const { asked, layer } = fake(
      [Effect.succeed(file(1, [note('n1')])), Effect.succeed(file(2, [note('n1', 'moved')]))],
      [{ cursor: 2, events: [] }],
    );
    return Effect.gen(function* () {
      const actor = yield* started;
      yield* TestClock.adjust('10 millis');
      expect(yield* SubscriptionRef.get(actor.state)).toEqual(
        FeedState.Live({ notes: [note('n1')], cursor: 2 }),
      );
      expect(asked).toEqual(['notes', 'wait 1', 'wait 2']);
    }).pipe(Effect.scoped, Effect.provide(layer));
  });

  it.effect('a wait with changes reads the notes again', () => {
    const moved = note('n1', 'moved');
    const { asked, layer } = fake(
      [Effect.succeed(file(1, [note('n1')])), Effect.succeed(file(2, [moved]))],
      [
        {
          cursor: 2,
          events: [{ _tag: 'NoteAdded', seq: 2, note: moved }],
        },
      ],
    );
    return Effect.gen(function* () {
      const actor = yield* started;
      yield* TestClock.adjust('10 millis');
      expect(yield* SubscriptionRef.get(actor.state)).toEqual(
        FeedState.Live({ notes: [moved], cursor: 2 }),
      );
      expect(asked).toEqual(['notes', 'wait 1', 'notes', 'wait 2']);
    }).pipe(Effect.scoped, Effect.provide(layer));
  });

  it.effect(`a failed read is lost, and connects again after ${RETRY_MS} ms`, () => {
    const { asked, layer } = fake([Effect.fail(refused), Effect.succeed(file(0, []))]);
    return Effect.gen(function* () {
      const actor = yield* started;
      yield* TestClock.adjust('10 millis');
      const lost = yield* SubscriptionRef.get(actor.state);
      expect(feedText(lost)).toBe('notes offline: notes.json is being written; trying again');
      yield* TestClock.adjust(`${RETRY_MS} millis`);
      const back = yield* SubscriptionRef.get(actor.state);
      expect(back).toEqual(FeedState.Live({ notes: [], cursor: 0 }));
      expect(feedText(back)).toBe('');
      expect(asked).toEqual(['notes', 'notes', 'wait 0']);
    }).pipe(Effect.scoped, Effect.provide(layer));
  });
});
