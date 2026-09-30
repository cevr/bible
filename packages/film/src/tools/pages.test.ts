// The export page pool, on the fake browser: it opens its pages on the
// film's export URL and reads the film's info once, a page that crashed is
// dropped for a fresh one, and every page closes when the scope does, done or
// interrupted. No Chromium.

import { test } from 'bun:test';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, Exit, Fiber, Layer } from 'effect';
import { PageCrashed } from './errors.ts';
import { type ExportPages, Pages, type PagesOptions, exportUrl } from './pages.ts';
import { type FakeRenderHost, emptyLedger, fakeRenderHost } from './testing.ts';

const setup = (host: FakeRenderHost = {}) => {
  const ledger = emptyLedger();
  const layer = Pages.layer.pipe(Layer.provide(fakeRenderHost(ledger, host)));
  /** `use` run on the pool `open` makes, in a scope of its own that closes after it. */
  const withPool = <A, E>(
    film: string,
    options: PagesOptions,
    use: (pool: ExportPages) => Effect.Effect<A, E>,
  ) =>
    Effect.scoped(
      Effect.gen(function* () {
        return yield* use(yield* (yield* Pages).open(film, options));
      }),
    ).pipe(Effect.provide(layer));
  return { ledger, withPool };
};

describe('exportUrl', () => {
  test('names the film page, export mode, and captions only when they are off', () => {
    expect(exportUrl('http://x/', 'a b', true)).toBe('http://x/?film=a%20b&export');
    expect(exportUrl('http://x/', 'f', false)).toBe('http://x/?film=f&export&captions=0');
  });
});

describe('Pages', () => {
  it.live('opens at most `workers` pages, reads the info once, and closes them all', () =>
    Effect.gen(function* () {
      const { ledger, withPool } = setup();
      const frames = yield* withPool('film', { workers: 3, captions: false }, (pool) => {
        expect(pool.info.fps).toBe(30);
        return Effect.forEach([0, 1, 2, 3, 4, 5, 6, 7], (i) => pool.call('frame', i, 'image/png'), {
          concurrency: 8,
        });
      });
      expect(frames.map((bytes) => bytes[0])).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
      expect(ledger.pages.opened).toBeLessThanOrEqual(3);
      expect(ledger.pages.closed).toBe(ledger.pages.opened);
      expect(new Set(ledger.urls)).toEqual(
        new Set(['http://preview.test/?film=film&export&captions=0']),
      );
    }),
  );

  it.live('drops a page that crashed, and the next call runs on a fresh one', () =>
    Effect.gen(function* () {
      const { ledger, withPool } = setup({
        // The first page opened dies on frame 5.
        frame: (i, page) =>
          Effect.asVoid(
            Effect.when(
              Effect.fail(PageCrashed.make({ reason: 'the renderer process died' })),
              Effect.succeed(page === 1 && i === 5),
            ),
          ),
      });
      const [crashed, next] = yield* withPool('film', { workers: 1, captions: true }, (pool) =>
        Effect.all([
          Effect.exit(pool.call('frame', 5, 'image/png')),
          pool.call('frame', 5, 'image/png'),
        ]),
      );
      expect(Exit.isFailure(crashed)).toBe(true);
      expect(next[0]).toBe(5);
      expect(ledger.pages.opened).toBe(2);
      expect(ledger.pages.closed).toBe(2);
    }),
  );

  it.live('closes every page when interrupted mid-call', () =>
    Effect.gen(function* () {
      const { ledger, withPool } = setup({ frame: () => Effect.never });
      const fiber = yield* Effect.forkChild(
        withPool('film', { workers: 4, captions: true }, (pool) =>
          Effect.forEach([0, 1, 2, 3], (i) => pool.call('frame', i, 'image/png'), {
            concurrency: 4,
          }),
        ),
      );
      yield* Effect.sleep('50 millis');
      yield* Fiber.interrupt(fiber);
      expect(ledger.pages.opened).toBe(4);
      expect(ledger.pages.closed).toBe(4);
      expect(ledger.browser).toEqual({ launched: 1, closed: 1 });
    }),
  );
});
