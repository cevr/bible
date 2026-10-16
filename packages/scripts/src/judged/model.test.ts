import { Effect, Fiber, Layer, Option } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import type { HttpClient } from 'effect/http';
import type { ChildProcessSpawner } from 'effect/process';
import { TestClock } from 'effect/testing';

import { judgedModel } from './model.js';
import { historyComment } from './rule.js';
import { LIMITS, ask } from './run.js';
import { env, hangs, holding, missing, typesafeHttp } from './testing.js';

/** TypeSafe answering every key today. */
const today = () =>
  typesafeHttp(200, (keys) => ({
    model: 'jev-latest',
    answers: Object.fromEntries(
      keys.map((k) => [
        k,
        { type: 'choice', choice: 'today', probabilities: { today: 1, history: 0 }, confidence: 1 },
      ]),
    ),
  }));

/** Asks about one comment through the lint's model over `layers`; answers the skip reason, if any. */
const askOver = (
  layers: Layer.Layer<HttpClient.HttpClient | ChildProcessSpawner.ChildProcessSpawner>,
) =>
  ask(historyComment, ['A comment.'], LIMITS).pipe(
    Effect.map((asked) => asked.reason),
    Effect.provide(judgedModel.pipe(Layer.provide(layers))),
  );

describe("the lint's TypeSafe key", () => {
  it.effect('is TYPESAFE_API_KEY when set, with no keychain read', () => {
    const http = today();
    const chain = holding('from-keychain');
    return Effect.gen(function* () {
      expect(
        yield* askOver(
          Layer.mergeAll(http.layer, chain.layer, env({ TYPESAFE_API_KEY: 'from-env' })),
        ),
      ).toEqual(Option.none());
      expect(http.requests.map((r) => r.authorization)).toEqual([Option.some('Bearer from-env')]);
      expect(chain.runs.count).toBe(0);
    });
  });

  it.effect("is the keychain's, its newline gone, when the environment has none", () => {
    const http = today();
    const chain = holding('from-keychain');
    return Effect.gen(function* () {
      expect(yield* askOver(Layer.mergeAll(http.layer, chain.layer, env({})))).toEqual(
        Option.none(),
      );
      expect(http.requests.map((r) => r.authorization)).toEqual([
        Option.some('Bearer from-keychain'),
      ]);
      expect(chain.runs.count).toBe(1);
    });
  });

  it.effect('is none when neither has one: no-key, and no request', () => {
    const http = today();
    return Effect.gen(function* () {
      expect(yield* askOver(Layer.mergeAll(http.layer, missing().layer, env({})))).toEqual(
        Option.some('no-key'),
      );
      expect(http.requests).toEqual([]);
    });
  });

  it.effect('is none when the keychain does not answer in 2 seconds', () => {
    const http = today();
    return Effect.gen(function* () {
      const run = yield* Effect.forkChild(
        askOver(Layer.mergeAll(http.layer, hangs().layer, env({}))),
      );
      yield* TestClock.adjust('2 seconds');
      expect(yield* Fiber.join(run)).toEqual(Option.some('no-key'));
      expect(http.requests).toEqual([]);
    });
  });
});
