import { describe, expect, test } from 'bun:test';
import { Deferred, Effect, Exit, Fiber } from 'effect';

import { makeBatcher } from './batch.js';

const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(effect);

describe('makeBatcher', () => {
  test('inputs submitted together go out as one batch, answered slot for slot', () =>
    run(
      Effect.gen(function* () {
        const batches: string[][] = [];
        const batcher = makeBatcher<string, string, string>({
          window: '5 millis',
          maxSize: 8,
          run: (inputs) =>
            Effect.sync(() => {
              batches.push([...inputs]);
              return inputs.map((input) => {
                if (input === 'bad') return Exit.fail('bad input');
                return Exit.succeed(input.toUpperCase());
              });
            }),
        });
        const answers = yield* Effect.all(
          ['a', 'bad', 'b'].map((input) => Effect.result(batcher.submit(input))),
          { concurrency: 3 },
        );
        expect(batches).toEqual([['a', 'bad', 'b']]);
        expect(answers.map((answer) => answer._tag)).toEqual(['Success', 'Failure', 'Success']);
        const [first, , third] = answers;
        if (first?._tag === 'Success') expect(first.success).toBe('A');
        if (third?._tag === 'Success') expect(third.success).toBe('B');
      }),
    ));

  test('a failed batch fails every caller in it', () =>
    run(
      Effect.gen(function* () {
        const batcher = makeBatcher<string, string, string>({
          window: '5 millis',
          maxSize: 8,
          run: () => Effect.fail('transport down'),
        });
        const answers = yield* Effect.all(
          ['a', 'b'].map((input) => Effect.flip(batcher.submit(input))),
          { concurrency: 3 },
        );
        expect(answers).toEqual(['transport down', 'transport down']);
      }),
    ));

  test('a full batch closes and the next input opens another', () =>
    run(
      Effect.gen(function* () {
        const sizes: number[] = [];
        const batcher = makeBatcher<number, number, never>({
          window: '5 millis',
          maxSize: 2,
          run: (inputs) =>
            Effect.sync(() => {
              sizes.push(inputs.length);
              return inputs.map((input) => Exit.succeed(input));
            }),
        });
        const answers = yield* Effect.all(
          [1, 2, 3].map((input) => batcher.submit(input)),
          { concurrency: 3 },
        );
        expect(answers).toEqual([1, 2, 3]);
        expect(sizes.toSorted()).toEqual([1, 2]);
      }),
    ));

  test('the last caller to leave interrupts the batch in flight', () =>
    run(
      Effect.gen(function* () {
        const started = yield* Deferred.make<boolean>();
        const released = yield* Deferred.make<boolean>();
        const batcher = makeBatcher<string, string, never>({
          window: '1 millis',
          maxSize: 8,
          run: () =>
            Deferred.succeed(started, true).pipe(
              Effect.andThen(Effect.never),
              Effect.onInterrupt(() => Deferred.succeed(released, true)),
            ),
        });
        const caller = yield* Effect.forkChild(batcher.submit('hold'));
        yield* Deferred.await(started);
        yield* Fiber.interrupt(caller);
        expect(yield* Deferred.await(released)).toBe(true);
      }),
    ));

  test('a batch with a caller still waiting runs to the end', () =>
    run(
      Effect.gen(function* () {
        const started = yield* Deferred.make<boolean>();
        const proceed = yield* Deferred.make<boolean>();
        const batcher = makeBatcher<string, string, never>({
          window: '1 millis',
          maxSize: 8,
          run: (inputs) =>
            Deferred.succeed(started, true).pipe(
              Effect.andThen(Deferred.await(proceed)),
              Effect.as(inputs.map((input) => Exit.succeed(input))),
            ),
        });
        const leaving = yield* Effect.forkChild(batcher.submit('leaving'));
        const staying = yield* Effect.forkChild(batcher.submit('staying'));
        yield* Deferred.await(started);
        yield* Fiber.interrupt(leaving);
        yield* Deferred.succeed(proceed, true);
        expect(yield* Fiber.join(staying)).toBe('staying');
      }),
    ));
});
