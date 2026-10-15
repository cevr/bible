import { describe, expect, it } from 'effect-bun-test';
import { Array as Arr, Effect, Fiber, Option, Stream } from 'effect';
import { TestClock } from 'effect/testing';
import type { PhoneCopy } from '../../core/served.ts';
import { copyAwaited } from './phone.ts';

/** A copy's asks answered by `answers` in turn (the last again once they run out), a minute of the page's clock gone by: what it heard, and how often it asked. */
const awaited = (answers: ReadonlyArray<PhoneCopy | 'lost'>) =>
  Effect.gen(function* () {
    let asked = 0;
    const ask = Effect.suspend(() => {
      const answer = Option.getOrElse(
        Arr.get(answers, Math.min(asked, answers.length - 1)),
        (): PhoneCopy | 'lost' => 'pending',
      );
      asked += 1;
      if (answer === 'lost') return Effect.fail('lost' as const);
      return Effect.succeed(answer);
    });
    const fiber = yield* Stream.runCollect(copyAwaited(ask)).pipe(Effect.forkChild);
    for (let i = 0; i < 20; i += 1) yield* TestClock.adjust('3 seconds');
    const heard = yield* Fiber.join(fiber);
    return { heard, asked };
  });

describe('a page waiting on a phone copy', () => {
  it.effect('asks after it while it is on its way, and stops once it has failed', () =>
    Effect.gen(function* () {
      const { heard, asked } = yield* awaited(['pending', 'pending', 'failed']);
      expect(heard).toEqual(['pending', 'pending', 'failed']);
      expect(asked).toBe(3);
    }),
  );

  it.effect('stops once it is made', () =>
    Effect.gen(function* () {
      const { heard, asked } = yield* awaited(['pending', 'ready']);
      expect(heard).toEqual(['pending', 'ready']);
      expect(asked).toBe(2);
    }),
  );

  it.effect('hears a lost ask as on its way, and asks again', () =>
    Effect.gen(function* () {
      const { heard, asked } = yield* awaited(['lost', 'failed']);
      expect(heard).toEqual(['pending', 'failed']);
      expect(asked).toBe(2);
    }),
  );
});
