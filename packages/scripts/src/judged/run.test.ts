import * as BunServices from '@effect/platform-bun/BunServices';
import { Deferred, Effect, Fiber, FileSystem, Layer, Path } from 'effect';
import { DecisionModel } from 'effect/ai';
import { describe, expect, it } from 'effect-bun-test';
import { TestClock } from 'effect/testing';

import { keepAnswers } from './cache.js';
import { judgedModel } from './model.js';
import type { JudgedRule } from './rule.js';
import { findingLine, judge, partsOf, runLine } from './run.js';

/** An item a judged rule reads. */
type RuleItem = Parameters<typeof judge>[1][number];
import { cacheKey } from './store.js';
import { env, historyComment, missing, typesafeHttp } from './testing.js';

const labelOf = (p: number) => {
  if (p >= 0.5) return 'history';
  return 'today';
};

/** Each of `keys` answered `today` for sure. */
const allToday = (keys: ReadonlyArray<string>) =>
  Object.fromEntries(
    keys.map((k) => [
      k,
      { _tag: 'Classify' as const, label: 'today', probabilities: { today: 1, history: 0 } },
    ]),
  );

const NO_USAGE = { inputTokens: 0, outputTokens: 0 };

/** A fake model: p(history) for each text by `pOf`; it records each request's keys, texts and instructions. */
const countingModel = (pOf: (text: string) => number) => {
  const requests: Array<{
    keys: Array<string>;
    texts: Array<string>;
    instructions: Array<string>;
  }> = [];
  const layer = Layer.effect(DecisionModel.DecisionModel)(
    DecisionModel.make({
      decide: ({ state, decisions }) =>
        Effect.sync(() => {
          const input = state as Record<string, string>;
          const keys = Object.keys(decisions);
          requests.push({
            keys,
            texts: keys.map((k) => input[k]!),
            instructions: keys.map((k) => decisions[k]!.instructions),
          });
          const answers = Object.fromEntries(
            keys.map((k) => {
              const p = pOf(input[k]!);
              return [
                k,
                {
                  _tag: 'Classify' as const,
                  label: labelOf(p),
                  probabilities: { today: 1 - p, history: p },
                },
              ];
            }),
          );
          return { answers, usage: NO_USAGE };
        }),
    }),
  );
  return { layer, requests };
};

const ITEMS: ReadonlyArray<Omit<RuleItem, 'rule'>> = [
  { file: 'src/a.ts', line: 3, text: 'This used to retry; pass 6 removed that.' },
  { file: 'src/a.ts', line: 9, text: 'The key used to sign each token.' },
  { file: 'src/b.ts', line: 1, text: 'Before the batch this read argv.' },
];

const P = new Map([
  ['This used to retry; pass 6 removed that.', 0.97],
  ['The key used to sign each token.', 0.02],
  ['Before the batch this read argv.', 0.89],
]);

/** A run's limits, its cache in a temporary folder. */
const judging = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'judged-run-' });
  const options: Parameters<typeof judge>[2] = {
    model: 'fake/model',
    cacheFile: path.join(dir, 'tmp', 'judged', 'cache.json'),
    bound: 200,
    budget: 60_000,
    deadline: '20 seconds',
  };
  return options;
});

const withFs = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Effect.scoped, Effect.provide(BunServices.layer));

/** Judges `items` by `rule` alone: its one outcome. */
const judgeBy = (
  rule: JudgedRule,
  items: ReadonlyArray<Omit<RuleItem, 'rule'>>,
  options: Parameters<typeof judge>[2],
) =>
  Effect.map(
    judge(
      [rule],
      items.map((item) => ({ ...item, rule })),
      options,
    ),
    (outcomes) => outcomes[0]!,
  );

/** `texts` asked by `rule`, cut into parts: each part's texts. */
const partsOfTexts = (
  rule: JudgedRule,
  texts: ReadonlyArray<string>,
  limits: Parameters<typeof partsOf>[1],
) =>
  partsOf(
    texts.map((text) => ({ rule, text })),
    limits,
  ).map((part) => part.map((q) => q.text));

describe('a judged rule', () => {
  it.effect('asks for every item in one request, a classify per item under c0…cN', () => {
    const model = countingModel((text) => P.get(text) ?? 0);
    return Effect.gen(function* () {
      const outcome = yield* judgeBy(historyComment, ITEMS, yield* judging);
      expect(model.requests.map((r) => r.keys)).toEqual([['c0', 'c1', 'c2']]);
      expect(model.requests[0]?.texts).toEqual(ITEMS.map((i) => i.text));
      expect(model.requests[0]?.instructions[1]).toStartWith(
        'Judge the code comment under key c1. HISTORY means',
      );
      // The texts are at 0.97, 0.02 and 0.89: the first alone is a finding.
      expect(outcome.findings).toEqual([{ file: 'src/a.ts', line: 3, p: 0.97, kept: true }]);
      expect(outcome.findings.map((f) => findingLine(historyComment, f))).toEqual([
        "src/a.ts:3 warning judged(historyComment): the comment tells the code's history: say what it does today and why; how it got here lives in git log p=0.97",
      ]);
      expect(runLine(outcome)).toBe(
        '[judged] rule=historyComment items=3 cached=0 asked=3 findings=1',
      );
    }).pipe(Effect.provide(model.layer), withFs);
  });

  it.effect('reports at p 0.9 exactly, and not just under it', () => {
    const at = new Map([
      ['At the threshold.', 0.9],
      ['Just under it.', 0.8999],
    ]);
    const model = countingModel((text) => at.get(text) ?? 0);
    return Effect.gen(function* () {
      const items = [...at.keys()].map((text, i) => ({ file: 'src/t.ts', line: i + 1, text }));
      const outcome = yield* judgeBy(historyComment, items, yield* judging);
      expect(outcome.findings).toEqual([{ file: 'src/t.ts', line: 1, p: 0.9, kept: true }]);
    }).pipe(Effect.provide(model.layer), withFs);
  });

  it.effect('asks once for a text two items share', () => {
    const model = countingModel(() => 0.95);
    return Effect.gen(function* () {
      const twice = [ITEMS[0]!, { ...ITEMS[0]!, file: 'src/c.ts', line: 7 }];
      const outcome = yield* judgeBy(historyComment, twice, yield* judging);
      expect(model.requests.map((r) => r.keys)).toEqual([['c0']]);
      expect(outcome.findings.map((f) => `${f.file}:${f.line}`)).toEqual([
        'src/a.ts:3',
        'src/c.ts:7',
      ]);
      // The line counts items: both were asked about, in one text.
      expect(runLine(outcome)).toBe(
        '[judged] rule=historyComment items=2 cached=0 asked=2 findings=2',
      );
    }).pipe(Effect.provide(model.layer), withFs);
  });

  it.effect('splits past its bound of items or of estimated tokens', () =>
    Effect.sync(() => {
      const texts = ['a', 'b', 'c', 'd', 'e'];
      expect(partsOfTexts(historyComment, texts, { bound: 2, budget: 60_000 })).toEqual([
        ['a', 'b'],
        ['c', 'd'],
        ['e'],
      ]);
      expect(partsOfTexts(historyComment, texts, { bound: 200, budget: 60_000 })).toEqual([texts]);
      // About 190 tokens an item: a budget of 500 holds two.
      expect(partsOfTexts(historyComment, texts, { bound: 200, budget: 500 })).toEqual([
        ['a', 'b'],
        ['c', 'd'],
        ['e'],
      ]);
      // A unit past ASCII costs 1.3 tokens (Jev counted Greek near 1.23):
      // two of these 1,000 Greek letters do not fit in 2,500, which two
      // would at a token a unit.
      const greek = 'λόγος'.repeat(200);
      expect(partsOfTexts(historyComment, [greek, greek], { bound: 200, budget: 2500 })).toEqual([
        [greek],
        [greek],
      ]);
      // A text past the budget alone still goes, in a part of its own.
      const long = 'x'.repeat(5000);
      expect(partsOfTexts(historyComment, ['a', long, 'b'], { bound: 200, budget: 500 })).toEqual([
        ['a'],
        [long],
        ['b'],
      ]);
    }),
  );

  it.live('sends the parts at once', () => {
    // Each request answers only once all three are in flight: parts sent one
    // after another would wait past their deadline and skip.
    let inFlight = 0;
    const allIn = Deferred.makeUnsafe<boolean>();
    const together = Layer.effect(DecisionModel.DecisionModel)(
      DecisionModel.make({
        decide: ({ decisions }) =>
          Effect.gen(function* () {
            inFlight++;
            if (inFlight === 3) yield* Deferred.succeed(allIn, true);
            yield* Deferred.await(allIn);
            return { answers: allToday(Object.keys(decisions)), usage: NO_USAGE };
          }),
      }),
    );
    return Effect.gen(function* () {
      const items = ['a', 'b', 'c', 'd', 'e'].map((text, i) => ({
        file: 'src/a.ts',
        line: i + 1,
        text,
      }));
      const outcome = yield* judgeBy(historyComment, items, {
        ...(yield* judging),
        bound: 2,
        deadline: '2 seconds',
      });
      expect(runLine(outcome)).toBe(
        '[judged] rule=historyComment items=5 cached=0 asked=5 findings=0',
      );
    }).pipe(Effect.provide(together), withFs);
  });

  it.effect("asks every rule's items in the one request, each with its own rule's words", () => {
    const model = countingModel(() => 0.95);
    const other: JudgedRule = {
      ...historyComment,
      id: 'otherRule',
      subject: 'test case',
      instructions: 'OTHER means something else.',
    };
    return Effect.gen(function* () {
      const outcomes = yield* judge(
        [historyComment, other],
        [
          { ...ITEMS[0]!, rule: historyComment },
          { ...ITEMS[0]!, rule: other },
        ],
        yield* judging,
      );
      expect(model.requests.map((r) => r.instructions)).toEqual([
        [
          `Judge the code comment under key c0. ${historyComment.instructions}`,
          'Judge the test case under key c1. OTHER means something else.',
        ],
      ]);
      expect(outcomes.map(runLine)).toEqual([
        '[judged] rule=historyComment items=1 cached=0 asked=1 findings=1',
        '[judged] rule=otherRule items=1 cached=0 asked=1 findings=1',
      ]);
    }).pipe(Effect.provide(model.layer), withFs);
  });

  it.effect(
    'keeps its answers: a rerun asks only for new text, and with none new asks nothing',
    () => {
      const model = countingModel((text) => P.get(text) ?? 0.99);
      return Effect.gen(function* () {
        const options = yield* judging;
        const first = yield* judgeBy(historyComment, ITEMS, options);
        const again = yield* judgeBy(historyComment, ITEMS, options);
        expect(model.requests).toHaveLength(1);
        expect(again.findings).toEqual(first.findings);
        expect(runLine(again)).toBe(
          '[judged] rule=historyComment items=3 cached=3 asked=0 findings=1',
        );
        const added = [...ITEMS, { file: 'src/d.ts', line: 4, text: 'We switched to Rive.' }];
        const third = yield* judgeBy(historyComment, added, options);
        expect(model.requests.map((r) => r.texts)).toEqual([
          ITEMS.map((i) => i.text),
          ['We switched to Rive.'],
        ]);
        expect(third.findings.map((f) => f.file)).toEqual(['src/a.ts', 'src/d.ts']);
        // Another model's answers, or another version of the rule's, are not these.
        yield* judgeBy(historyComment, ITEMS, { ...options, model: 'fake/other' });
        yield* judgeBy({ ...historyComment, version: 2 }, ITEMS, options);
        expect(model.requests).toHaveLength(4);
      }).pipe(Effect.provide(model.layer), withFs);
    },
  );
});

/**
 * The lint's model over a fake TypeSafe answering every request with
 * `status` and `body` (of the request's question keys), its key in the
 * environment; it records the requests' URLs. `keyless` is the same model
 * with no key, in the environment or the keychain.
 */
const typesafeAnswering = (status: number, body: (keys: ReadonlyArray<string>) => unknown) => {
  const http = typesafeHttp(status, body);
  const over = (vars: Record<string, string>) =>
    judgedModel('jev-latest').pipe(
      Layer.provide(Layer.mergeAll(http.layer, missing().layer, env(vars))),
    );
  return {
    layer: over({ TYPESAFE_API_KEY: 'test-key' }),
    keyless: over({}),
    requests: http.requests,
  };
};

const choice = (label: string, history: number) => ({
  type: 'choice',
  choice: label,
  probabilities: { today: 1 - history, history },
  confidence: 0.96,
});

/** Judges ITEMS through `layer`, expects no finding, and answers the run's `[judged]` line. */
const lineOver = <E>(layer: Layer.Layer<DecisionModel.DecisionModel, E>) =>
  Effect.gen(function* () {
    const outcome = yield* judgeBy(historyComment, ITEMS, yield* judging);
    expect(outcome.findings).toEqual([]);
    return runLine(outcome);
  }).pipe(Effect.provide(layer), withFs);

/** The answer TypeSafe gives the first item, history; every other is today. */
const FIRST = new Map([['c0', choice('history', 0.96)]]);

describe('a judged rule never fails on its model', () => {
  it.effect('answers through TypeSafe in one request', () => {
    const typesafe = typesafeAnswering(200, (keys) => ({
      model: 'jev-latest',
      answers: Object.fromEntries(keys.map((k) => [k, FIRST.get(k) ?? choice('today', 0.04)])),
      usage: { input_tokens: 10, output_tokens: 3 },
    }));
    return Effect.gen(function* () {
      const outcome = yield* judgeBy(historyComment, ITEMS, yield* judging);
      expect(typesafe.requests.map((r) => r.url)).toEqual(['https://api.typesafe.ai/v1/systemone']);
      expect(outcome.findings).toEqual([{ file: 'src/a.ts', line: 3, p: 0.96, kept: true }]);
    }).pipe(Effect.provide(typesafe.layer), withFs);
  });

  it.effect('skips no-key, asking nothing, with no key', () => {
    const typesafe = typesafeAnswering(200, () => ({}));
    return Effect.gen(function* () {
      expect(yield* lineOver(typesafe.keyless)).toBe(
        '[judged] skipped rule=historyComment reason=no-key items=3',
      );
      expect(typesafe.requests).toEqual([]);
    });
  });

  it.effect('skips timeout when the request passes its deadline', () => {
    const asked = Deferred.makeUnsafe<boolean>();
    const silent = Layer.effect(DecisionModel.DecisionModel)(
      DecisionModel.make({
        decide: () => Effect.andThen(Deferred.succeed(asked, true), Effect.never),
      }),
    );
    return Effect.gen(function* () {
      const run = yield* Effect.forkChild(lineOver(silent));
      yield* Deferred.await(asked);
      yield* TestClock.adjust('20 seconds');
      expect(yield* Fiber.join(run)).toBe(
        '[judged] skipped rule=historyComment reason=timeout items=3',
      );
    });
  });

  it.effect('skips rate-limit on a 429', () =>
    Effect.gen(function* () {
      const typesafe = typesafeAnswering(429, () => ({ message: 'Rate limit exceeded' }));
      expect(yield* lineOver(typesafe.layer)).toBe(
        '[judged] skipped rule=historyComment reason=rate-limit items=3',
      );
    }),
  );

  it.effect('skips http on a server error', () =>
    Effect.gen(function* () {
      const typesafe = typesafeAnswering(500, () => ({ message: 'Upstream request failed' }));
      expect(yield* lineOver(typesafe.layer)).toBe(
        '[judged] skipped rule=historyComment reason=http items=3',
      );
    }),
  );

  it.effect('skips http on a request past the input limit', () =>
    Effect.gen(function* () {
      const typesafe = typesafeAnswering(400, () => ({
        detail: { error_type: 'max_tokens_exceeded' },
      }));
      expect(yield* lineOver(typesafe.layer)).toBe(
        '[judged] skipped rule=historyComment reason=http items=3',
      );
    }),
  );

  it.effect('skips incomplete when the answer misses an item', () =>
    Effect.gen(function* () {
      const typesafe = typesafeAnswering(200, (keys) => ({
        model: 'jev-latest',
        answers: Object.fromEntries(keys.slice(1).map((k) => [k, choice('today', 0.04)])),
      }));
      expect(yield* lineOver(typesafe.layer)).toBe(
        '[judged] skipped rule=historyComment reason=incomplete items=3',
      );
    }),
  );

  it.effect(
    'still reports what it has cached when the rest skips, and counts only the rest',
    () => {
      const { keyless } = typesafeAnswering(200, () => ({}));
      return Effect.gen(function* () {
        const options = yield* judging;
        const kept = ITEMS[0]!.text;
        yield* keepAnswers(
          options.cacheFile,
          new Map([
            [
              cacheKey('historyComment@1', options.model, kept),
              { label: 'history', probabilities: { today: 0.03, history: 0.97 } },
            ],
          ]),
          new Map(),
        );
        const outcome = yield* judgeBy(historyComment, ITEMS, options);
        expect(outcome.findings).toEqual([{ file: 'src/a.ts', line: 3, p: 0.97, kept: true }]);
        expect(runLine(outcome)).toBe('[judged] skipped rule=historyComment reason=no-key items=2');
      }).pipe(Effect.provide(keyless), withFs);
    },
  );
});
