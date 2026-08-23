/** The adapter's caching discipline, without the model.
 *
 *  §9.5's embedder is loaded lazily, and *when* a failed load is remembered is a
 *  correctness property rather than a performance one: `Effect.cached` caches
 *  the result including failures and indefinitely, so a reader who searched once
 *  while the model was still downloading would get `EmbedderUnavailable` for the
 *  rest of the process's life — including long after the download finished.
 *
 *  Driving this through the real loader would make the test a 300M-parameter
 *  download, so the cell is tested directly against a counting loader that fails
 *  once and then succeeds. That is the exact sequence the trap describes.
 */

import { describe, expect, it } from 'effect-bun-test';
import { Effect, Ref } from 'effect';

import { memoizeOnSuccess } from './embedder-transformers.js';

describe('§9.5 the model is memoized on success only', () => {
  it.scopedLive('retries after a typed load failure, then caches', () =>
    Effect.gen(function* () {
      const attempts = yield* Ref.make(0);
      // Fails the first time, succeeds afterwards: a model still downloading
      // when the reader's first query arrives.
      const load = Effect.flatMap(
        Ref.updateAndGet(attempts, (count) => count + 1),
        (count) => {
          if (count === 1) return Effect.fail('still downloading' as const);
          return Effect.succeed('model');
        },
      );

      const model = yield* memoizeOnSuccess(load);

      const first = yield* Effect.result(model);
      expect(first._tag).toBe('Failure');
      // The retry the trap forbids. Under `Effect.cached` this is still a
      // failure, and stays one forever.
      expect(yield* model).toBe('model');
      expect(yield* Ref.get(attempts)).toBe(2);
    }),
  );

  it.scopedLive('loads once across many successful reads', () =>
    Effect.gen(function* () {
      const attempts = yield* Ref.make(0);
      const load = Effect.as(
        Ref.update(attempts, (count) => count + 1),
        'model',
      );
      const model = yield* memoizeOnSuccess(load);

      for (let read = 0; read < 5; read += 1) expect(yield* model).toBe('model');
      // The memoization half: without it this is 5, and every query would
      // rebuild the graph.
      expect(yield* Ref.get(attempts)).toBe(1);
    }),
  );

  it.scopedLive('loads one model for concurrent first reads', () =>
    Effect.gen(function* () {
      const attempts = yield* Ref.make(0);
      const load = Effect.as(
        // A load slow enough that a second reader arrives mid-flight, which is
        // the case the cell's lock exists for: two concurrent 300M-parameter
        // loads would double the process's memory.
        Effect.delay(
          Ref.update(attempts, (count) => count + 1),
          '10 millis',
        ),
        'model',
      );
      const model = yield* memoizeOnSuccess(load);

      yield* Effect.all([model, model, model], { concurrency: 'unbounded' });
      expect(yield* Ref.get(attempts)).toBe(1);
    }),
  );
});
