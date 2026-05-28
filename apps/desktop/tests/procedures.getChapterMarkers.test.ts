/**
 * End-to-end tests for the unified `getChapterMarkers` procedure.
 *
 * Asserts:
 *   1. The handler aggregates all three marker lanes (commentary, notes,
 *      xrefs) into the canonical output shape for a single (book, chapter).
 *   2. The three lanes fan out *concurrently* — we prove this by making each
 *      seeded service wait on a shared Deferred that is only released once
 *      all three handlers have entered. If the handler ran them serially
 *      the await would deadlock and the test would time out.
 */

import { it } from '@effect/vitest';
import { Deferred, Effect, Fiber, Layer, Stream } from 'effect';
import { expect } from 'vitest';

import { procedures } from '../src/procedures.js';
import { BibleMarginNotes } from '../src/services/bible-margin-notes.js';
import { BibleXrefs } from '../src/services/bible-xrefs.js';
import { EgwCommentary } from '../src/services/egw-commentary.js';

const BOOK = 1;
const CHAPTER = 1;

const fixtureLayers = Layer.mergeAll(
  EgwCommentary.layerTest(
    new Map(),
    new Map([[`${String(BOOK)}:${String(CHAPTER)}`, new Set([2, 5])]]),
  ),
  BibleMarginNotes.layerTest(
    new Map(),
    new Map([[`${String(BOOK)}:${String(CHAPTER)}`, new Set([3, 7])]]),
  ),
  BibleXrefs.layerTest(
    new Map(),
    new Map([[`${String(BOOK)}:${String(CHAPTER)}`, new Set([1, 9])]]),
  ),
);

it.effect('aggregates all three lanes for a single (book, chapter)', () =>
  Effect.gen(function* () {
    const result = yield* procedures.bible.getChapterMarkers.handle({
      book: BOOK,
      chapter: CHAPTER,
    });
    expect(result.commentaryVerses).toEqual([2, 5]);
    expect(result.xrefVerses).toEqual([1, 9]);
    expect(result.notedVerses).toEqual([3, 7]);
  }).pipe(Effect.provide(fixtureLayers)),
);

it.effect('returns empty lanes for an unseeded (book, chapter)', () =>
  Effect.gen(function* () {
    const result = yield* procedures.bible.getChapterMarkers.handle({
      book: 99,
      chapter: 99,
    });
    expect(result.commentaryVerses).toEqual([]);
    expect(result.xrefVerses).toEqual([]);
    expect(result.notedVerses).toEqual([]);
  }).pipe(Effect.provide(fixtureLayers)),
);

// Concurrency gate: each lane awaits a shared "released" Deferred and bumps
// an "entered" counter Deferred when it starts. The harness waits for all
// three entries before releasing the gate. If the handler ran serially,
// only the first lane would enter, the gate would never trip, and the test
// would time out.
it.effect('fans out the three lanes concurrently (not serially)', () =>
  Effect.gen(function* () {
    const released = yield* Deferred.make<void>();
    const commentaryEntered = yield* Deferred.make<void>();
    const notesEntered = yield* Deferred.make<void>();
    const xrefsEntered = yield* Deferred.make<void>();

    const gatedCommentary = Layer.succeed(EgwCommentary, {
      getCommentary: () => Effect.succeed([]),
      versesWithCommentary: () =>
        Effect.gen(function* () {
          yield* Deferred.succeed(commentaryEntered, undefined);
          yield* Deferred.await(released);
          return new Set([2, 5]) as ReadonlySet<number>;
        }),
      changes: Stream.make(0),
    });

    const gatedNotes = Layer.succeed(BibleMarginNotes, {
      getMarginNotes: () => Effect.succeed([]),
      versesWithNotes: () =>
        Effect.gen(function* () {
          yield* Deferred.succeed(notesEntered, undefined);
          yield* Deferred.await(released);
          return new Set([3]) as ReadonlySet<number>;
        }),
      chapterMarginNotes: () => Effect.succeed(new Map() as ReadonlyMap<number, readonly never[]>),
    });

    const gatedXrefs = Layer.succeed(BibleXrefs, {
      getCrossRefs: () => Effect.succeed([]),
      versesWithCrossRefs: () =>
        Effect.gen(function* () {
          yield* Deferred.succeed(xrefsEntered, undefined);
          yield* Deferred.await(released);
          return new Set([1, 9]) as ReadonlySet<number>;
        }),
    });

    const gatedLayers = Layer.mergeAll(gatedCommentary, gatedNotes, gatedXrefs);

    // Fork the handler. Wait for all three lanes to enter (proves
    // concurrency), then release the gate so each lane completes.
    const handlerFiber = yield* procedures.bible.getChapterMarkers
      .handle({ book: BOOK, chapter: CHAPTER })
      .pipe(Effect.provide(gatedLayers), Effect.forkChild({ startImmediately: true }));

    yield* Deferred.await(commentaryEntered);
    yield* Deferred.await(notesEntered);
    yield* Deferred.await(xrefsEntered);
    yield* Deferred.succeed(released, undefined);

    const result = yield* Fiber.join(handlerFiber);
    expect(result.commentaryVerses).toEqual([2, 5]);
    expect(result.xrefVerses).toEqual([1, 9]);
    expect(result.notedVerses).toEqual([3]);
  }),
);
