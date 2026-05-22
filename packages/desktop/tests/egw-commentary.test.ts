import { it } from '@effect/vitest';
import { Deferred, Effect, Fiber, Stream } from 'effect';
import { afterEach, beforeEach, expect } from 'vitest';
import { EgwCommentary } from '../src/services/egw-commentary.js';

// The renderer-side EgwCommentary service wires a `window.api.bible`
// listener at layer-build time. Tests stub the minimum slice of that API
// the service touches, then exercise the pulse-on-broadcast contract.

type Touched = readonly { readonly book: number; readonly chapter: number }[];
type BibleSlice = {
  readonly getEgwCommentary: (
    book: number,
    chapter: number,
    verse: number,
  ) => Promise<readonly unknown[]>;
  readonly getBibleVersesWithCommentary: (
    book: number,
    chapter: number,
  ) => Promise<readonly number[]>;
  readonly onEgwCommentaryUpdated: (handler: (touched: Touched) => void) => () => void;
};

let chapterCalls: { book: number; chapter: number }[] = [];
let chapterResponses: Map<string, readonly number[]> = new Map();
let listener: ((touched: Touched) => void) | null = null;

beforeEach(() => {
  chapterCalls = [];
  chapterResponses = new Map();
  listener = null;
  const slice: BibleSlice = {
    getEgwCommentary: () => Promise.resolve([]),
    getBibleVersesWithCommentary: (book, chapter) => {
      chapterCalls.push({ book, chapter });
      return Promise.resolve(chapterResponses.get(`${String(book)}:${String(chapter)}`) ?? []);
    },
    onEgwCommentaryUpdated: (handler) => {
      listener = handler;
      return () => {
        listener = null;
      };
    },
  };
  (globalThis as { window?: { api: { bible: BibleSlice } } }).window = {
    api: { bible: slice },
  };
});

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

it.effect('empty-touched pulse clears the chapter LRU and re-queries fresh data', () =>
  Effect.gen(function* () {
    chapterResponses.set('10:4', []);
    const svc = yield* EgwCommentary;
    const first = yield* svc.versesWithCommentary(10, 4);
    expect(first.size).toBe(0);
    expect(chapterCalls).toHaveLength(1);
    const cached = yield* svc.versesWithCommentary(10, 4);
    expect(cached.size).toBe(0);
    expect(chapterCalls).toHaveLength(1);
    chapterResponses.set('10:4', [1, 5, 9]);
    if (listener === null) throw new Error('listener was not registered');
    listener([]);
    const refreshed = yield* svc.versesWithCommentary(10, 4);
    expect([...refreshed].sort((a, b) => a - b)).toEqual([1, 5, 9]);
    expect(chapterCalls).toHaveLength(2);
  }).pipe(Effect.provide(EgwCommentary.layer)),
);

it.effect('targeted-touched pulse only invalidates the listed (book, chapter) keys', () =>
  Effect.gen(function* () {
    chapterResponses.set('10:4', [1]);
    chapterResponses.set('11:2', [3]);
    const svc = yield* EgwCommentary;
    yield* svc.versesWithCommentary(10, 4);
    yield* svc.versesWithCommentary(11, 2);
    expect(chapterCalls).toHaveLength(2);
    chapterResponses.set('10:4', [1, 2]);
    chapterResponses.set('11:2', [3, 4]);
    if (listener === null) throw new Error('listener was not registered');
    listener([{ book: 10, chapter: 4 }]);
    const updated = yield* svc.versesWithCommentary(10, 4);
    expect([...updated].sort((a, b) => a - b)).toEqual([1, 2]);
    expect(chapterCalls).toHaveLength(3);
    const stillCached = yield* svc.versesWithCommentary(11, 2);
    expect([...stillCached].sort((a, b) => a - b)).toEqual([3]);
    expect(chapterCalls).toHaveLength(3);
  }).pipe(Effect.provide(EgwCommentary.layer)),
);

it.effect('every broadcast bumps the changes stream so subscribers re-query', () =>
  Effect.gen(function* () {
    const svc = yield* EgwCommentary;
    const collected: number[] = [];
    const subscribed = yield* Deferred.make<void>();
    const fiber = yield* Effect.forkChild(
      Stream.runForEach(Stream.take(svc.changes, 3), (n) =>
        Effect.gen(function* () {
          collected.push(n);
          if (collected.length === 1) yield* Deferred.succeed(subscribed, undefined);
        }),
      ),
    );
    // Wait for the subscription to receive the initial replayed value
    // before firing listener calls — otherwise the synchronous bumps
    // happen before the subscriber is registered.
    yield* Deferred.await(subscribed);
    if (listener === null) throw new Error('listener was not registered');
    listener([{ book: 1, chapter: 1 }]);
    listener([]);
    yield* Fiber.join(fiber);
    expect(collected).toEqual([0, 1, 2]);
  }).pipe(Effect.provide(EgwCommentary.layer)),
);
