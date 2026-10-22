import * as BunServices from '@effect/platform-bun/BunServices';
import { Database } from 'bun:sqlite';
import { Clock, Console, Deferred, Effect, Fiber, FileSystem, Layer, Path, Ref } from 'effect';
import { DecisionModel } from 'effect/ai';
import { describe, expect, it } from 'effect-bun-test';
import { TestClock } from 'effect/testing';

import { changes, keepAnswers, readCache } from './cache.js';
import { judgedModel } from './model.js';
import { type JudgedRule, ruleKey } from './rule.js';
import { findingLine, judge, partsOf, runLine } from './run.js';

/** An item a judged rule reads. */
type RuleItem = Parameters<typeof judge>[1][number];

/** A run's options but how it reads the texts it asks about: `judgeBy` reads them from its cases. */
type Options = Omit<Parameters<typeof judge>[2], 'textsOf'>;
import { type Answer, type Verdict, MAX_AGE_DAYS, cacheKey, dayOf } from './store.js';
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

/**
 * An item as a case writes it: its text, its own key its text unless the
 * case names one, and its offset 0 unless the case names one.
 */
type CaseItem = Omit<RuleItem, 'rule' | 'key' | 'start'> & {
  readonly text: string;
  readonly key?: string;
  readonly start?: number;
};

const ITEMS: ReadonlyArray<CaseItem> = [
  { file: 'src/a.ts', line: 3, text: 'This used to retry; pass 6 removed that.' },
  { file: 'src/a.ts', line: 9, text: 'The key used to sign each token.' },
  { file: 'src/b.ts', line: 1, text: 'Before the batch this read argv.' },
];

const P = new Map([
  ['This used to retry; pass 6 removed that.', 0.97],
  ['The key used to sign each token.', 0.02],
  ['Before the batch this read argv.', 0.89],
]);

/** A run's limits, its store in a temporary folder. */
const judging = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'judged-run-' });
  const options: Options = {
    model: 'fake/model',
    storeFile: path.join(dir, '.git', 'judged', 'store.json'),
    bound: 200,
    budget: 60_000,
    perQuestion: 30_000,
    deadline: '20 seconds',
  };
  return options;
});

/** Keeps `fresh` in the store at `file` on the clock's day, as a run that read nothing else. */
const keep = (file: string, fresh: ReadonlyMap<string, Verdict>) =>
  Effect.flatMap(Clock.currentTimeMillis, (now) =>
    keepAnswers(file, { fresh, read: new Set(), day: dayOf(now) }),
  );

const withFs = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Effect.scoped, Effect.provide(BunServices.layer));

/**
 * Judges `items`, each by its rule, as the runner does: each keyed in the
 * store for its rule on the options' model, each asked text read from its
 * case.
 */
const judgeAll = (
  rules: ReadonlyArray<JudgedRule>,
  items: ReadonlyArray<CaseItem & { readonly rule: JudgedRule }>,
  options: Options,
) => {
  const keyed = items.map(({ text, key, start, ...item }) => ({
    item: {
      ...item,
      start: start ?? 0,
      key: cacheKey(ruleKey(item.rule), options.model, key ?? text),
    },
    text,
  }));
  const texts = new Map(keyed.map(({ item, text }) => [item.key, text]));
  return Effect.map(
    judge(
      rules,
      keyed.map(({ item }) => item),
      {
        ...options,
        textsOf: (asked) => Effect.succeed(asked.map((item) => texts.get(item.key) ?? '')),
      },
    ),
    ({ outcomes }) => outcomes,
  );
};

/** Judges `items` by `rule` alone: its one outcome. */
const judgeBy = (rule: JudgedRule, items: ReadonlyArray<CaseItem>, options: Options) =>
  Effect.map(
    judgeAll(
      [rule],
      items.map((item) => ({ ...item, rule })),
      options,
    ),
    (outcomes) => outcomes[0]!,
  );

/** `texts` asked by `rule`, cut into parts (a question's own limit 30,000 unless `limits` names one): each part's texts. */
const partsOfTexts = (
  rule: JudgedRule,
  texts: ReadonlyArray<string>,
  limits: Omit<Parameters<typeof partsOf>[1], 'perQuestion'> & { readonly perQuestion?: number },
) =>
  partsOf(
    texts.map((text) => ({ rule, text })),
    { perQuestion: 30_000, ...limits },
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
      expect(outcome.findings).toEqual([
        { file: 'src/a.ts', line: 3, start: 0, p: 0.97, kept: true },
      ]);
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
      expect(outcome.findings).toEqual([
        { file: 'src/t.ts', line: 1, start: 0, p: 0.9, kept: true },
      ]);
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

  it.effect("holds a part's state, with its longest question, to the one question's limit", () =>
    Effect.sync(() => {
      // 3,000 characters at historyComment's 3.79 a token: 801 tokens of
      // state each with its key, its words about 190. Under a budget of 60,000, a
      // question's limit of 2,000 holds two texts and the words, not three.
      const text = (letter: string) => letter.repeat(3_000);
      const texts = ['a', 'b', 'c', 'd', 'e'].map(text);
      expect(
        partsOfTexts(historyComment, texts, { bound: 200, budget: 60_000, perQuestion: 2_000 }),
      ).toEqual([texts.slice(0, 2), texts.slice(2, 4), texts.slice(4)]);
      // A rule that names no characters a token is read at 3.2: 947 tokens
      // a text, so one alone with the words fits 2,000, and two do not.
      const { charsPerToken: _, ...unmeasured } = historyComment;
      expect(
        partsOfTexts(unmeasured, texts.slice(0, 2), {
          bound: 200,
          budget: 60_000,
          perQuestion: 2_000,
        }),
      ).toEqual([texts.slice(0, 1), texts.slice(1, 2)]);
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
      const outcomes = yield* judgeAll(
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
        // Another model's answers are not these.
        yield* judgeBy(historyComment, ITEMS, { ...options, model: 'fake/other' });
        expect(model.requests).toHaveLength(3);
      }).pipe(Effect.provide(model.layer), withFs);
    },
  );

  it.effect(
    "keeps the first answer kept for a key, and reports by it: a run that asked meanwhile keeps the store's",
    () => {
      // This run's model reads the comment as today's; another checkout kept it as history first.
      const model = countingModel(() => 0.01);
      return Effect.gen(function* () {
        const options = yield* judging;
        const services = yield* Effect.context<FileSystem.FileSystem | Path.Path>();
        const item = ITEMS[0]!;
        const key = cacheKey(ruleKey(historyComment), options.model, item.text);
        const other = { label: 'history', probabilities: { history: 0.99, today: 0.01 } };
        const outcomes = yield* judge(
          [historyComment],
          [{ ...item, rule: historyComment, start: 0, key }],
          {
            ...options,
            // The other run keeps its answer while this one reads the texts it asks about.
            textsOf: (asked) =>
              Effect.as(
                Effect.provide(keep(options.storeFile, new Map([[key, other]])), services),
                asked.map(() => item.text),
              ),
          },
        );
        expect(model.requests).toHaveLength(1);
        expect(outcomes.outcomes[0]?.findings).toEqual([
          { file: 'src/a.ts', line: 3, start: 0, p: 0.99, kept: true },
        ]);
        expect((yield* readCache(options.storeFile)).get(key)?.probabilities).toEqual(
          other.probabilities,
        );
      }).pipe(Effect.provide(model.layer), withFs);
    },
  );

  it.effect(
    'reports a cached item by the store as its write left it: one another run dropped and kept anew meanwhile reports its new answer',
    () => {
      const model = countingModel((text) => P.get(text) ?? 0.99);
      return Effect.gen(function* () {
        const options = yield* judging;
        const services = yield* Effect.context<FileSystem.FileSystem | Path.Path>();
        const [cachedItem, freshItem] = [ITEMS[0]!, ITEMS[1]!];
        const keyOf = (text: string) => cacheKey(ruleKey(historyComment), options.model, text);
        const at = (p: number) => ({
          label: 'history',
          probabilities: { history: p, today: 1 - p },
        });
        const textOf = new Map(
          [cachedItem, freshItem].map((item) => [keyOf(item.text), item.text]),
        );
        yield* keep(options.storeFile, new Map([[keyOf(cachedItem.text), at(0.99)]]));
        const today = dayOf(yield* Clock.currentTimeMillis);
        const later = { read: new Set<string>(), day: today + MAX_AGE_DAYS + 1 };
        // Another run, past the store's age, drops the cached answer and keeps another for its key.
        const meanwhile = Effect.andThen(
          keepAnswers(options.storeFile, { ...later, fresh: new Map() }),
          keepAnswers(options.storeFile, {
            ...later,
            fresh: new Map([[keyOf(cachedItem.text), at(0.01)]]),
          }),
        );
        const outcomes = yield* judge(
          [historyComment],
          [cachedItem, freshItem].map((item) => ({
            ...item,
            rule: historyComment,
            start: 0,
            key: keyOf(item.text),
          })),
          {
            ...options,
            textsOf: (asked) =>
              Effect.as(
                Effect.provide(meanwhile, services),
                asked.map((item) => textOf.get(item.key) ?? ''),
              ),
          },
        );
        expect(model.requests).toHaveLength(1);
        expect(outcomes.outcomes[0]?.findings).toEqual([]);
        expect(outcomes.outcomes[0]?.unkept).toEqual(new Set());
      }).pipe(Effect.provide(model.layer), withFs);
    },
  );

  it.effect(
    'answers the day it marked its answers seen: a run that crosses midnight answers the day it began',
    () => {
      const model = countingModel((text) => P.get(text) ?? 0.99);
      return Effect.gen(function* () {
        const options = yield* judging;
        const item = ITEMS[0]!;
        const key = cacheKey(ruleKey(historyComment), options.model, item.text);
        const begun = 20_000 * 86_400_000 - 60_000;
        yield* TestClock.setTime(begun);
        const judged = yield* judge(
          [historyComment],
          [{ ...item, rule: historyComment, start: 0, key }],
          {
            ...options,
            // The run reads its texts across midnight.
            textsOf: (asked) =>
              Effect.as(
                TestClock.adjust('2 minutes'),
                asked.map(() => item.text),
              ),
          },
        );
        expect(dayOf(yield* Clock.currentTimeMillis)).toBe(20_000);
        expect(judged.day).toBe(19_999);
        expect((yield* readCache(options.storeFile)).get(key)?.seen).toBe(judged.day);
      }).pipe(Effect.provide(model.layer), withFs);
    },
  );

  it.effect('names the files whose answers the store does not keep when its write fails', () => {
    const model = countingModel((text) => P.get(text) ?? 0.99);
    return Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const options = yield* judging;
      yield* fs.makeDirectory(path.dirname(path.dirname(options.storeFile)), { recursive: true });
      yield* fs.writeFileString(path.dirname(options.storeFile), 'a file, not a folder\n');
      const outcome = yield* judgeBy(historyComment, ITEMS, options);
      expect(outcome.findings.map((f) => [f.file, f.kept])).toEqual([['src/a.ts', false]]);
      expect(outcome.unkept).toEqual(new Set(['src/a.ts', 'src/b.ts']));
    }).pipe(Effect.provide(model.layer), withFs);
  });

  it.effect(
    'names every file unkept when the store kept its answers but could not renew their day',
    () => {
      const model = countingModel((text) => P.get(text) ?? 0.99);
      return Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const options = yield* judging;
        const keyOf = (text: string) => cacheKey(ruleKey(historyComment), options.model, text);
        const today = dayOf(yield* Clock.currentTimeMillis);
        // Every answer kept ten days ago; then the store's folder takes no write.
        yield* keepAnswers(options.storeFile, {
          fresh: new Map(
            ITEMS.map((item): [string, Verdict] => {
              const p = P.get(item.text) ?? 0;
              return [
                keyOf(item.text),
                { label: 'history', probabilities: { history: p, today: 1 - p } },
              ];
            }),
          ),
          read: new Set(),
          day: today - 10,
        });
        const folder = path.dirname(options.storeFile);
        yield* Effect.acquireRelease(fs.chmod(folder, 0o555), () =>
          Effect.orDie(fs.chmod(folder, 0o755)),
        );
        const outcome = yield* judgeBy(historyComment, ITEMS, options);
        expect(model.requests).toHaveLength(0);
        expect(outcome.findings.map((f) => [f.file, f.kept])).toEqual([['src/a.ts', true]]);
        expect(outcome.unkept).toEqual(new Set(['src/a.ts', 'src/b.ts']));
      }).pipe(Effect.provide(model.layer), withFs);
    },
  );

  it.effect(
    "asks again when the rule's subject, instructions or criteria change, and not for its threshold or message",
    () => {
      const model = countingModel((text) => P.get(text) ?? 0.99);
      return Effect.gen(function* () {
        const options = yield* judging;
        yield* judgeBy(historyComment, ITEMS, options);
        const retuned = yield* judgeBy(
          { ...historyComment, threshold: 0.85, message: 'other words' },
          ITEMS,
          options,
        );
        expect(model.requests).toHaveLength(1);
        expect(runLine(retuned)).toBe(
          '[judged] rule=historyComment items=3 cached=3 asked=0 findings=2',
        );
        const reworded = [
          { ...historyComment, subject: 'source comment' },
          { ...historyComment, instructions: `${historyComment.instructions} Be strict.` },
          { ...historyComment, criteria: { ...historyComment.criteria, today: 'says what is' } },
        ];
        for (const rule of reworded) yield* judgeBy(rule, ITEMS, options);
        expect(model.requests).toHaveLength(4);
      }).pipe(Effect.provide(model.layer), withFs);
    },
  );

  it.effect(
    'keeps an answer for its key wherever its item lives, whatever its text, and asks for a key an edit changed',
    () => {
      const model = countingModel((text) => P.get(text.replace(/\s+/g, ' ')) ?? 0.99);
      return Effect.gen(function* () {
        const options = yield* judging;
        yield* judgeBy(historyComment, ITEMS, options);
        const moved = yield* judgeBy(
          historyComment,
          [
            {
              file: 'src/elsewhere/z.ts',
              line: 40,
              text: 'This used to retry;\n  pass 6 removed that.',
              key: 'This used to retry; pass 6 removed that.',
            },
            {
              file: 'src/y.ts',
              line: 2,
              text: '  The key used to sign each token.  ',
              key: 'The key used to sign each token.',
            },
          ],
          options,
        );
        expect(model.requests).toHaveLength(1);
        expect(moved.findings).toEqual([
          { file: 'src/elsewhere/z.ts', line: 40, start: 0, p: 0.97, kept: true },
        ]);
        yield* judgeBy(
          historyComment,
          [{ file: 'src/a.ts', line: 3, text: 'This used to retry.' }],
          options,
        );
        expect(model.requests).toHaveLength(2);
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
const typesafeAnswering = (
  status: Parameters<typeof typesafeHttp>[0],
  body: (keys: ReadonlyArray<string>) => unknown,
  headers?: Parameters<typeof typesafeHttp>[2],
) => {
  const http = typesafeHttp(status, body, headers);
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

/**
 * `effect` run on the test clock, moved on 50 ms at a time until it ends:
 * its retries' waits pass. The run reads and writes the store by real I/O,
 * so the clock moves until the run is done, yielding to the event loop
 * between ticks: a count of ticks runs out before slow I/O ends.
 */
const ticking = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const done = yield* Ref.make(false);
    const fiber = yield* Effect.forkChild(effect.pipe(Effect.ensuring(Ref.set(done, true))));
    while (!(yield* Ref.get(done))) {
      yield* TestClock.adjust('50 millis');
      yield* Effect.yieldNow;
    }
    return yield* Fiber.join(fiber);
  });

/** Judges ITEMS through `layer`, expects no finding, and answers the run's `[judged]` line. */
const lineOver = <E>(layer: Layer.Layer<DecisionModel.DecisionModel, E>) =>
  Effect.gen(function* () {
    const outcome = yield* judgeBy(historyComment, ITEMS, yield* judging);
    expect(outcome.findings).toEqual([]);
    return runLine(outcome);
  }).pipe(Effect.provide(layer), withFs);

/** Judges twenty items through `layer`, a part each, and answers the run's `[judged]` line. */
const onePartEachOver = <E>(layer: Layer.Layer<DecisionModel.DecisionModel, E>) =>
  Effect.gen(function* () {
    const items = Array.from({ length: 20 }, (_, i) => ({
      file: 'src/a.ts',
      line: i + 1,
      text: `item ${i}`,
    }));
    return runLine(yield* judgeBy(historyComment, items, { ...(yield* judging), bound: 1 }));
  }).pipe(Effect.provide(layer), withFs);

/** The answer TypeSafe gives the first item, history; every other is today. */
const FIRST = new Map([['c0', choice('history', 0.96)]]);

describe("a judged rule's store", () => {
  const answer = { label: 'history', probabilities: { today: 0.03, history: 0.97 } };

  it.live("keeps both runs' answers when two keep theirs at once", () =>
    Effect.gen(function* () {
      const { storeFile } = yield* judging;
      const runs = Array.from(
        { length: 6 },
        (_, run) =>
          new Map(Array.from({ length: 50 }, (_, i) => [`run${run}-key${i}`, answer] as const)),
      );
      yield* Effect.forEach(runs, (fresh) => keep(storeFile, fresh), {
        concurrency: 6,
      });
      expect((yield* readCache(storeFile)).size).toBe(300);
    }).pipe(withFs),
  );

  /** The store's lock file beside `storeFile`. */
  const lockOf = (storeFile: string) => storeFile.replace(/store\.json$/, '.store.json.lock');

  /** SQLite's write lock on the store's lock file, held for the scope, as another run would hold it. */
  const holding = (storeFile: string) =>
    Effect.acquireRelease(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        yield* fs.makeDirectory(path.dirname(storeFile), { recursive: true });
        const db = new Database(lockOf(storeFile), { create: true });
        db.exec('PRAGMA journal_mode = MEMORY');
        db.exec('BEGIN IMMEDIATE');
        return db;
      }),
      (db) => Effect.sync(() => db.close()),
    );

  it.effect('waits for a run that holds the lock, and writes nothing while it does', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const { storeFile } = yield* judging;
      const written = yield* Effect.scoped(
        Effect.gen(function* () {
          yield* holding(storeFile);
          const done = yield* Ref.make(false);
          const waiting = yield* Effect.forkChild(
            Effect.exit(keep(storeFile, new Map([['a', answer]]))).pipe(
              Effect.ensuring(Ref.set(done, true)),
            ),
          );
          // Each try is one synchronous call, then a sleep on the test clock.
          // The run makes the store's folder first, by real I/O, so the clock
          // moves until the run is done, yielding to the event loop between
          // ticks: a count of ticks runs out before a slow folder is made.
          while (!(yield* Ref.get(done))) {
            yield* TestClock.adjust('25 millis');
            yield* Effect.yieldNow;
          }
          return yield* Fiber.join(waiting);
        }),
      );
      expect(written._tag).toBe('Failure');
      expect(yield* fs.exists(storeFile)).toBe(false);
      yield* keep(storeFile, new Map([['a', answer]]));
      expect([...(yield* readCache(storeFile)).keys()]).toEqual(['a']);
    }).pipe(withFs),
  );

  it.live('takes the lock of a run that let it go: the file stays, the lock does not', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const { storeFile } = yield* judging;
      yield* Effect.scoped(holding(storeFile));
      yield* keep(storeFile, new Map([['a', answer]]));
      expect([...(yield* readCache(storeFile)).keys()]).toEqual(['a']);
      expect(yield* fs.exists(lockOf(storeFile))).toBe(true);
    }).pipe(withFs),
  );

  /** The real file system, but writing the store's partial file first does `before` to that path. */
  const writingPartial = (
    before: (fs: FileSystem.FileSystem, partial: string) => Effect.Effect<void, unknown>,
  ) =>
    Layer.effect(
      FileSystem.FileSystem,
      Effect.map(FileSystem.FileSystem, (fs) =>
        FileSystem.makeNoop({
          ...fs,
          writeFileString: (file, data, options) =>
            Effect.flatMap(
              Effect.orDie(
                Effect.when(before(fs, file), Effect.succeed(file.endsWith('.partial'))),
              ),
              () => fs.writeFileString(file, data, options),
            ),
        }),
      ),
    ).pipe(Layer.provideMerge(BunServices.layer));

  it.live('leaves no partial file when the write fails part way, and lets the lock go', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const { storeFile } = yield* judging;
      const written = yield* Effect.exit(keep(storeFile, new Map([['a', answer]])));
      expect(written._tag).toBe('Failure');
      expect(yield* fs.readDirectory(path.dirname(storeFile))).toEqual(['.store.json.lock']);
      yield* Effect.scoped(holding(storeFile));
    }).pipe(
      Effect.scoped,
      Effect.provide(
        writingPartial((fs, partial) =>
          Effect.andThen(fs.writeFileString(partial, 'a part'), Effect.fail('disk full')),
        ),
      ),
    ),
  );

  it.effect(
    'drops an answer no run read for its age, and keeps one only another checkout reads',
    () =>
      Effect.gen(function* () {
        const { storeFile } = yield* judging;
        const keepOn = (day: number, fresh: ReadonlyArray<string>, read: ReadonlyArray<string>) =>
          keepAnswers(storeFile, {
            fresh: new Map(fresh.map((key) => [key, answer])),
            read: new Set(read),
            day,
          });
        const store = Effect.map(readCache(storeFile), (kept) =>
          [...kept].map(([key, { seen }]) => `${key}@${seen}`),
        );
        yield* keepOn(0, ['old'], []);
        yield* keepOn(5, ['elsewhere'], []);
        yield* keepOn(20, ['new'], ['old', 'gone']);
        expect(yield* store).toEqual(['old@20', 'elsewhere@5', 'new@20']);
        yield* keepOn(5 + MAX_AGE_DAYS, [], []);
        expect(yield* store).toEqual(['old@20', 'elsewhere@5', 'new@20']);
        yield* keepOn(6 + MAX_AGE_DAYS, [], []);
        expect(yield* store).toEqual(['old@20', 'new@20']);
      }).pipe(withFs),
  );

  it.effect(
    'never marks an answer seen on a day before the one a later run marked it: a run that ends last keeps the later day',
    () =>
      Effect.gen(function* () {
        const { storeFile } = yield* judging;
        const store = Effect.map(readCache(storeFile), (kept) =>
          [...kept].map(([key, { seen }]) => `${key}@${seen}`),
        );
        yield* keepAnswers(storeFile, { fresh: new Map([['a', answer]]), read: new Set(), day: 0 });
        // A run that began on day 1 ends first; one that began on day 0 ends after it.
        yield* keepAnswers(storeFile, { fresh: new Map(), read: new Set(['a']), day: 1 });
        yield* keepAnswers(storeFile, {
          fresh: new Map([['a', answer]]),
          read: new Set(['a']),
          day: 0,
        });
        expect(yield* store).toEqual(['a@1']);
        // The answer lives for its age from day 1: no run of day 1 + MAX_AGE_DAYS drops it.
        yield* keepAnswers(storeFile, { fresh: new Map(), read: new Set(), day: 1 + MAX_AGE_DAYS });
        expect(yield* store).toEqual(['a@1']);
        expect(
          changes(new Map([['a', { ...answer, seen: 1 }]]), {
            fresh: new Map(),
            read: new Set(['a']),
            day: 0,
          }),
        ).toBe(false);
      }).pipe(withFs),
  );

  it.effect('writes nothing for a run that read only answers seen that day, and asked none', () =>
    Effect.sync(() => {
      const kept = new Map<string, Answer>([['a', { ...answer, seen: 7 }]]);
      const run = { fresh: new Map(), read: new Set(['a', 'gone']) };
      expect(changes(kept, { ...run, day: 7 })).toBe(false);
      expect(changes(kept, { ...run, day: 8 })).toBe(true);
      expect(changes(kept, { ...run, day: 7, fresh: new Map([['b', answer]]) })).toBe(true);
      expect(changes(kept, { fresh: new Map(), read: new Set(), day: 8 + MAX_AGE_DAYS })).toBe(
        true,
      );
    }),
  );

  it.effect('keeps an answer another run added, under the lock', () =>
    Effect.gen(function* () {
      const { storeFile } = yield* judging;
      yield* keep(storeFile, new Map([['other', answer]]));
      yield* keep(storeFile, new Map([['new', answer]]));
      expect([...(yield* readCache(storeFile)).keys()].sort()).toEqual(['new', 'other']);
    }).pipe(withFs),
  );

  it.effect('reads a store that does not decode as empty, and says so', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const { storeFile } = yield* judging;
      yield* fs.makeDirectory(path.dirname(storeFile), { recursive: true });
      yield* fs.writeFileString(storeFile, '{"answers":{},"files":[1]');
      const lines: Array<string> = [];
      const recording: Console.Console = {
        ...Console.Console.defaultValue(),
        log: (...parts: ReadonlyArray<unknown>) => {
          lines.push(parts.map(String).join(' '));
        },
      };
      const read = yield* readCache(storeFile).pipe(
        Effect.provideService(Console.Console, recording),
      );
      expect(read.size).toBe(0);
      expect(lines).toEqual([`[judged] store unread file=${storeFile} reason=decode`]);
    }).pipe(withFs),
  );
});

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
      expect(outcome.findings).toEqual([
        { file: 'src/a.ts', line: 3, start: 0, p: 0.96, kept: true },
      ]);
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

  it.effect('skips rate-limit on a 429 still met after three retries', () =>
    Effect.gen(function* () {
      const typesafe = typesafeAnswering(429, () => ({ message: 'Rate limit exceeded' }));
      expect(yield* ticking(lineOver(typesafe.layer))).toBe(
        '[judged] skipped rule=historyComment reason=rate-limit items=3',
      );
      expect(typesafe.requests).toHaveLength(4);
    }),
  );

  /**
   * Judges ITEMS through a TypeSafe that refuses the first two requests with
   * `refused` (each naming `retry-after: 2`) and answers the third; expects
   * the answer kept, and the waits between the sends at least `waits` and
   * under twice each.
   */
  const retried = (
    refused: number,
    waits: readonly [number, number],
    before: (storeFile: string) => Effect.Effect<unknown, unknown, FileSystem.FileSystem> = () =>
      Effect.void,
  ) => {
    const typesafe = typesafeAnswering(
      (_, sent) => Math.max(refused * Number(sent < 2), 200),
      (keys) => ({
        model: 'jev-latest',
        answers: Object.fromEntries(keys.map((k) => [k, FIRST.get(k) ?? choice('today', 0.04)])),
        usage: { input_tokens: 10, output_tokens: 3 },
      }),
      () => ({ 'retry-after': '2' }),
    );
    return Effect.gen(function* () {
      const options = yield* judging;
      const outcome = yield* ticking(
        Effect.andThen(before(options.storeFile), judgeBy(historyComment, ITEMS, options)),
      );
      expect(outcome.findings).toEqual([
        { file: 'src/a.ts', line: 3, start: 0, p: 0.96, kept: true },
      ]);
      const at = typesafe.requests.map((request) => request.at);
      const gaps = at.slice(1).map((time, i) => time - (at[i] ?? 0));
      expect(gaps.map((gap, i) => gap >= waits[i]! && gap < 2 * waits[i]!)).toEqual([true, true]);
    }).pipe(Effect.provide(typesafe.layer), withFs);
  };

  it.effect('asks again after a 429 that follows slow real I/O, and keeps the answers', () =>
    // The store's folder is read again and again by real I/O before the run
    // judges: the clock must move on past the retry's wait however long that takes.
    retried(429, [2_000, 2_000], (storeFile) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* Effect.repeat(fs.exists(storeFile), { times: 3_000 });
      }),
    ),
  );

  it.effect('asks again after a 429, waiting the retry-after it names, and keeps the answers', () =>
    retried(429, [2_000, 2_000]),
  );

  // TypeSafe's client reads a retry-after for a rate limit alone: a 529 backs off.
  it.effect('asks again after a 529, backing off 250 ms then 500 ms, and keeps the answers', () =>
    retried(529, [250, 500]),
  );

  it.effect('waits for no retry that would end past the deadline: the part skips at once', () =>
    Effect.gen(function* () {
      const typesafe = typesafeAnswering(
        429,
        () => ({ message: 'Rate limit exceeded' }),
        () => ({ 'retry-after': '30' }),
      );
      expect(yield* lineOver(typesafe.layer)).toBe(
        '[judged] skipped rule=historyComment reason=rate-limit items=3',
      );
      expect(typesafe.requests).toHaveLength(1);
    }),
  );

  it.effect('skips overloaded on a 529 still met after three retries', () =>
    Effect.gen(function* () {
      const typesafe = typesafeAnswering(529, () => ({ message: 'Overloaded' }));
      expect(yield* ticking(lineOver(typesafe.layer))).toBe(
        '[judged] skipped rule=historyComment reason=overloaded items=3',
      );
      expect(typesafe.requests).toHaveLength(4);
    }),
  );

  it.effect('skips no-credits when the account has none left', () =>
    Effect.gen(function* () {
      const typesafe = typesafeAnswering(402, () => ({
        detail: { error_type: 'billing_error', message: 'No available TypeSafe API credits.' },
      }));
      expect(yield* lineOver(typesafe.layer)).toBe(
        '[judged] skipped rule=historyComment reason=no-credits items=3',
      );
    }),
  );

  it.effect('sends no part after one the account refuses, for credits or a rate limit', () =>
    Effect.gen(function* () {
      // Twenty parts of one item, eight in flight at once: only those already in
      // flight are sent, once each for credits, with three retries each for a rate limit.
      for (const [status, body, reason, sent] of [
        [402, { detail: { error_type: 'billing_error' } }, 'no-credits', 8],
        [429, { message: 'Rate limit exceeded' }, 'rate-limit', 8 * 4],
      ] as const) {
        const typesafe = typesafeAnswering(status, () => body);
        expect(yield* ticking(onePartEachOver(typesafe.layer))).toBe(
          `[judged] skipped rule=historyComment reason=${reason} items=20`,
        );
        expect([status, typesafe.requests.length <= sent]).toEqual([status, true]);
      }
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

  it.effect('asks a part past the input limit again in halves, down to one item', () =>
    Effect.gen(function* () {
      const tooBig = { detail: { error_type: 'max_tokens_exceeded' } };
      const typesafe = typesafeAnswering(
        (keys) => {
          if (keys.length > 1) return 400;
          return 200;
        },
        (keys) => {
          if (keys.length > 1) return tooBig;
          return {
            model: 'jev-1.13.0',
            answers: { c0: choice('today', 0.04) },
            usage: { input_tokens: 10, output_tokens: 3 },
          };
        },
      );
      expect(yield* lineOver(typesafe.layer)).toBe(
        '[judged] rule=historyComment items=3 cached=0 asked=3 findings=0',
      );
      expect(typesafe.requests.map((request) => request.keys.length)).toEqual([3, 2, 1, 1, 1]);
    }),
  );

  it.effect('skips too-big when one item alone is past the input limit', () =>
    Effect.gen(function* () {
      const typesafe = typesafeAnswering(400, () => ({
        detail: { error_type: 'max_tokens_exceeded' },
      }));
      expect(yield* lineOver(typesafe.layer)).toBe(
        '[judged] skipped rule=historyComment reason=too-big items=3',
      );
    }),
  );

  it.effect('skips http on any other refused request', () =>
    Effect.gen(function* () {
      const typesafe = typesafeAnswering(400, () => ({ detail: { error_type: 'bad_request' } }));
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
        yield* keep(
          options.storeFile,
          new Map([
            [
              cacheKey(ruleKey(historyComment), options.model, kept),
              { label: 'history', probabilities: { today: 0.03, history: 0.97 } },
            ],
          ]),
        );
        const outcome = yield* judgeBy(historyComment, ITEMS, options);
        expect(outcome.findings).toEqual([
          { file: 'src/a.ts', line: 3, start: 0, p: 0.97, kept: true },
        ]);
        expect(runLine(outcome)).toBe('[judged] skipped rule=historyComment reason=no-key items=2');
      }).pipe(Effect.provide(keyless), withFs);
    },
  );
});
