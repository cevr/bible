#!/usr/bin/env bun
// The judged runner's quality guard, run by hand before a change of the
// request's form, its packing or its model lands (`quality.ts` says what it
// measures). It reads the repo's items as the lint does, draws a seeded
// sample of those the store answers, asks the model about them again
// through the runner's own `ask` (its form, its limits unless the flags name
// others, the config's model unless `--model` names another), and prints a
// line a rule beside the kept answers. It keeps nothing: the store is read,
// never written. Not a gate check: it costs a request (the default sample,
// 400 items a rule, about 0.7M input tokens) and the model is not
// deterministic.
//
//   bun run --cwd packages/scripts judged:quality
//   bun run --cwd packages/scripts judged:quality --rule testOracle --random 150 --findings 20
//   bun run --cwd packages/scripts judged:quality --bound 50          # another packing
//   bun run --cwd packages/scripts judged:quality --model jev-1.14.0  # another model
//
// Each rule's line: `<rule> random=<n> label-kept=<share> finding-kept=<share>
// new-findings=<n> findings-still=<n>/<n> moved-random=<p> moved-findings=<p>
// unanswered=<n>`, then the run's `requests=<n> in=<tokens> out=<tokens>`.
// The key is the lint's (`model.ts`), never printed.

import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Console, Duration, Effect, Layer, Option, Path } from 'effect';
import { Command, Flag } from 'effect/cli';
import { FetchHttpClient } from 'effect/http';

import { readCache } from './cache.js';
import { JudgedLint, judgedLintLayer } from './config.js';
import { judgedModel } from './model.js';
import { agreementOf, sampleOf } from './quality.js';
import { cacheModel } from './rule.js';
import { LIMITS, ask, partsOf, questionKey } from './run.js';
import { repoItems } from './sources.js';
import { storeFileOf } from './store.js';

/** `n / d` to two places, `-` for none. */
const share = (n: number, d: number) => {
  if (d === 0) return '-';
  return (n / d).toFixed(2);
};

/** A mean to two places, `-` when there was nothing to take it over. */
const mean = (n: number) => {
  if (Number.isNaN(n)) return '-';
  return n.toFixed(2);
};

const quality = Effect.fn('judged.quality')(function* (options: {
  readonly rules: ReadonlyArray<string>;
  readonly random: number;
  readonly findings: number;
  readonly seed: number;
  readonly bound: number;
  readonly budget: number;
  readonly model: string;
}) {
  const path = yield* Path.Path;
  const config = yield* JudgedLint;
  const rules = config.rules.filter(
    (rule) => options.rules.length === 0 || options.rules.includes(rule.id),
  );
  const model = cacheModel(config.settings.model);
  const tree = yield* repoItems(config.root, config.ignorePatterns, rules, {
    model,
    file: path.join(config.root, config.settings.checkout, 'items.json'),
  });
  const store = yield* readCache(storeFileOf(config.root, config.settings.store));
  const kept = tree.items.flatMap((item) =>
    Option.toArray(
      Option.map(Option.fromUndefinedOr(store.get(item.key)), (answer) => ({
        rule: item.rule,
        key: item.key,
        item,
        kept: { label: answer.label, probabilities: answer.probabilities },
      })),
    ),
  );
  const sample = sampleOf(kept, rules, options);
  const texts = yield* tree.textsOf(sample.map((entry) => entry.item));
  const questions = sample.map((entry, at) => ({
    key: entry.key,
    rule: entry.rule,
    text: texts[at] ?? '',
  }));
  const limits = {
    ...LIMITS,
    bound: options.bound,
    budget: options.budget,
    deadline: Duration.seconds(120),
  };
  const asked = yield* ask(questions, limits);
  const fresh = new Map(
    questions.flatMap((question) =>
      Option.toArray(
        Option.map(Option.fromUndefinedOr(asked.answers.get(questionKey(question))), (answer) => [
          question.key,
          answer,
        ]),
      ),
    ),
  );
  for (const rule of rules) {
    const a = agreementOf(
      rule,
      sample.filter((entry) => entry.rule.id === rule.id),
      fresh,
    );
    yield* Console.log(
      [
        `${rule.id} model=${options.model} random=${a.random}`,
        `label-kept=${share(a.labelKept, a.random)}`,
        `finding-kept=${share(a.findingKept, a.random)}`,
        `new-findings=${a.newFindings}`,
        `findings-still=${a.findingsStill}/${a.findings}`,
        `moved-random=${mean(a.movedRandom)} moved-findings=${mean(a.movedFindings)}`,
        `unanswered=${a.unanswered}`,
      ].join(' '),
    );
  }
  yield* Console.log(
    [
      `requests=${partsOf(questions, limits).length}`,
      `in=${asked.usage.inputTokens} out=${asked.usage.outputTokens}`,
      ...Option.toArray(Option.map(asked.reason, (reason) => `reason=${reason}`)),
    ].join(' '),
  );
});

const command = Command.make(
  'judged-quality',
  {
    rule: Flag.String('rule').pipe(
      Flag.atLeast(0),
      Flag.withDescription('a judged rule to sample, by its id (every rule on when none)'),
    ),
    random: Flag.Int('random').pipe(
      Flag.withDefault(300),
      Flag.withDescription('items of each rule drawn at random from those the store answers'),
    ),
    findings: Flag.Int('findings').pipe(
      Flag.withDefault(100),
      Flag.withDescription('kept findings of each rule in the sample, drawn past the random ones'),
    ),
    seed: Flag.Int('seed').pipe(Flag.withDefault(20261019), Flag.withDescription('the draw')),
    bound: Flag.Int('bound').pipe(
      Flag.withDefault(LIMITS.bound),
      Flag.withDescription("items a request holds at most (the runner's)"),
    ),
    budget: Flag.Int('budget').pipe(
      Flag.withDefault(LIMITS.budget),
      Flag.withDescription("estimated input tokens a request holds at most (the runner's)"),
    ),
    model: Flag.String('model').pipe(
      Flag.optional,
      Flag.withDescription("the TypeSafe model to ask (the config's settings.judged.model)"),
    ),
  },
  ({ rule, random, findings, seed, bound, budget, model }) => {
    const repo = judgedLintLayer(import.meta.dir);
    const asking = Layer.unwrap(
      Effect.gen(function* () {
        const config = yield* JudgedLint;
        return judgedModel(Option.getOrElse(model, () => config.settings.model));
      }),
    );
    return Effect.gen(function* () {
      const config = yield* JudgedLint;
      yield* quality({
        rules: rule,
        random,
        findings,
        seed,
        bound,
        budget,
        model: Option.getOrElse(model, () => config.settings.model),
      });
    }).pipe(Effect.provide(Layer.provideMerge(asking, repo)));
  },
).pipe(
  Command.withDescription(
    "Ask a seeded sample of the repo's judged items again and compare the answers with the kept ones",
  ),
);

Command.run(command, { version: '1.0.0' }).pipe(
  Effect.provide(Layer.mergeAll(FetchHttpClient.layer, BunServices.layer)),
  BunRuntime.runMain,
);
