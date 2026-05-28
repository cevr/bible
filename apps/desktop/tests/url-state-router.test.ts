import { it } from '@effect/vitest';
import { Deferred, Effect, Fiber, Option, Stream } from 'effect';
import { describe, expect } from 'vitest';
import {
  decode,
  encode,
  UrlStateRouter,
  type UrlSelection,
  type UrlStateRouterTestShape,
} from '../src/services/url-state-router.js';

describe('encode/decode round-trips', () => {
  const cases: ReadonlyArray<readonly [string, UrlSelection]> = [
    ['#/bible/43/3', { _tag: 'bible-chapter', book: 43, chapter: 3 }],
    ['#/bible/43/3/16', { _tag: 'bible-verse', book: 43, chapter: 3, verse: 16 }],
    ['#/egw/book/127', { _tag: 'egw-book', bookId: 127 }],
    ['#/egw/127/127.46', { _tag: 'egw-chapter', bookId: 127, chapterParaId: '127.46' }],
    [
      '#/egw/127/127.46/127.47',
      {
        _tag: 'egw-highlight',
        bookId: 127,
        chapterParaId: '127.46',
        highlightParaId: '127.47',
      },
    ],
  ];
  for (const [hash, sel] of cases) {
    it(`encodes ${sel._tag} → ${hash}`, () => {
      expect(encode(Option.some(sel))).toBe(hash);
    });
    it(`decodes ${hash} → ${sel._tag}`, () => {
      expect(decode(hash)).toStrictEqual(Option.some(sel));
    });
    it(`round-trips ${sel._tag}`, () => {
      expect(decode(encode(Option.some(sel)))).toStrictEqual(Option.some(sel));
    });
  }

  it('encodes None to the empty string', () => {
    expect(encode(Option.none())).toBe('');
  });

  it('decodes empty hash to None', () => {
    expect(decode('')).toStrictEqual(Option.none());
    expect(decode('#')).toStrictEqual(Option.none());
  });

  it('decodes unrecognized prefix to None', () => {
    expect(decode('#garbage')).toStrictEqual(Option.none());
    expect(decode('#/foo/bar')).toStrictEqual(Option.none());
  });

  it('decodes bible with too few segments to None', () => {
    expect(decode('#/bible/43')).toStrictEqual(Option.none());
    expect(decode('#/bible')).toStrictEqual(Option.none());
  });

  it('decodes bible with too many segments to None', () => {
    expect(decode('#/bible/43/3/16/extra')).toStrictEqual(Option.none());
  });

  it('still parses high book numbers — validation is the consumer', () => {
    // book id 200 is past the 66-book canon, but the router doesn't gate on
    // that. Decoding into a valid variant is fine; the consumer rejects.
    expect(decode('#/bible/200/5')).toStrictEqual(
      Option.some({ _tag: 'bible-chapter', book: 200, chapter: 5 }),
    );
  });

  it('rejects non-integer ids', () => {
    expect(decode('#/bible/abc/3')).toStrictEqual(Option.none());
    expect(decode('#/bible/43/3.5')).toStrictEqual(Option.none());
    expect(decode('#/bible/43/-1')).toStrictEqual(Option.none());
  });

  it('decodes URL-encoded paraIds', () => {
    expect(decode('#/egw/127/127%2E46')).toStrictEqual(
      Option.some({ _tag: 'egw-chapter', bookId: 127, chapterParaId: '127.46' }),
    );
  });

  it('rejects malformed URL escapes', () => {
    expect(decode('#/egw/127/%E0%A4%A')).toStrictEqual(Option.none());
  });

  it('rejects egw without an id', () => {
    expect(decode('#/egw')).toStrictEqual(Option.none());
    expect(decode('#/egw/book')).toStrictEqual(Option.none());
    expect(decode('#/egw/book/abc')).toStrictEqual(Option.none());
  });
});

describe('UrlStateRouter.layerTest', () => {
  it.effect('seeds from the initial hash', () =>
    Effect.gen(function* () {
      const r = yield* UrlStateRouter;
      const sel = yield* r.read;
      expect(sel).toStrictEqual(Option.some({ _tag: 'bible-chapter', book: 43, chapter: 3 }));
    }).pipe(Effect.provide(UrlStateRouter.layerTest('#/bible/43/3'))),
  );

  it.effect('round-trips write → read', () =>
    Effect.gen(function* () {
      const r = yield* UrlStateRouter;
      yield* r.write(Option.some({ _tag: 'bible-verse', book: 43, chapter: 3, verse: 16 }));
      const sel = yield* r.read;
      expect(sel).toStrictEqual(
        Option.some({ _tag: 'bible-verse', book: 43, chapter: 3, verse: 16 }),
      );
    }).pipe(Effect.provide(UrlStateRouter.layerTest())),
  );

  it.effect('writing None clears the hash', () =>
    Effect.gen(function* () {
      const r = yield* UrlStateRouter;
      yield* r.write(Option.some({ _tag: 'bible-chapter', book: 43, chapter: 3 }));
      yield* r.write(Option.none());
      const sel = yield* r.read;
      expect(sel).toStrictEqual(Option.none());
    }).pipe(Effect.provide(UrlStateRouter.layerTest())),
  );

  it.effect('simulated popstate emits a decoded selection', () =>
    Effect.gen(function* () {
      const r = (yield* UrlStateRouter) as UrlStateRouterTestShape;
      // Wrap in `Effect.scoped` so the forked fiber's scope is closed by
      // the test boundary, mirroring how production wires `forkChild`.
      yield* Effect.scoped(
        Effect.gen(function* () {
          // Subscribe BEFORE the simulated event. The SubscriptionRef's
          // replay-current behaviour emits the seed value first; use a
          // Deferred to wait for that emit so the simulated change isn't
          // racing the subscription handshake.
          const subscribed = yield* Deferred.make<void>();
          const collected: Option.Option<UrlSelection>[] = [];
          const fiber = yield* r.popstate.pipe(
            Stream.take(2),
            Stream.runForEach((next) =>
              Effect.gen(function* () {
                collected.push(next);
                if (collected.length === 1) yield* Deferred.succeed(subscribed, undefined);
              }),
            ),
            Effect.forkChild,
          );
          yield* Deferred.await(subscribed);
          yield* r._simulatePopstate('#/bible/43/3/16');
          yield* Fiber.join(fiber);
          expect(collected.at(-1)).toStrictEqual(
            Option.some({ _tag: 'bible-verse', book: 43, chapter: 3, verse: 16 }),
          );
        }),
      );
    }).pipe(Effect.provide(UrlStateRouter.layerTest())),
  );
});
