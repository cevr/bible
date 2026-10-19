#!/usr/bin/env bun
// How right a judged rule is on its labelled corpus
// (`fixtures/<rule in kebab case>.json`), against the live model: the rule
// as the repo's `.oxlintrc.json` defines it, every case in one request
// (split past `--bound`), no cache. Not a test: it costs a request and the
// model is not deterministic.
//
//   bun run --cwd packages/scripts judged:measure --rule historyComment
//   bun run --cwd packages/scripts judged:measure --rule historyComment --as line  # each case's `line`, not its `text`
//   bun run --cwd packages/scripts judged:measure --rule testOracle --bound 50     # requests of 50 at once
//   bun run --cwd packages/scripts judged:measure --rule testOracle --repeat 3     # the corpus three times over, one request
//   bun run --cwd packages/scripts judged:measure --rule testOracle --model <m>    # another model than the config's
//
// Prints one line, `<rule> model=<m> as=<field> bound=<n> requests=<n>
// cases=<n> n=<n> conflicts=<n> sent=<n> right=<n> wrong=<n> unanswered=<n>
// hand-right=<n>/<n> positives=<n> threshold=<t> reported=<n> true=<n>
// precision=<p> recall=<r> wall=<ms> in=<tokens> out=<tokens>`, then the
// precision and recall at other thresholds, then each wrong case. `n` is the
// distinct texts of the `cases`, each scored once (the model answers a text
// once); `conflicts` the texts whose cases disagree on a label; `sent` the
// texts asked about (`n` times `--repeat`); `positives` the scored texts
// labelled the rule's reporting label; `reported` those at or over the
// rule's threshold, `true` how many of them are positives: precision is
// true/reported, the share a gate would fail on rightly, and recall
// true/positives.

import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Clock, Console, Effect, FileSystem, Layer, Option, Path, Schema } from 'effect';
import { Command, Flag } from 'effect/cli';
import { FetchHttpClient } from 'effect/http';

import { JudgedLint, judgedLintLayer } from './config.js';
import { judgedModel } from './model.js';
import { LIMITS, ask, partsOf, questionKey } from './run.js';

const Case = Schema.Struct({
  source: Schema.String,
  label: Schema.String,
  text: Schema.String,
  line: Schema.optional(Schema.String),
});

const Corpus = Schema.fromJsonString(Schema.Struct({ cases: Schema.Array(Case) }));

/** The other thresholds a measure prints precision and recall at. */
const SWEEP = [0.5, 0.6, 0.7, 0.8, 0.9, 0.95];

/** A rule's id as its corpus' file name: `testOracle` → `test-oracle`. */
const kebab = (id: string) => id.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

/** `n / d` to two places, `-` for none. */
const share = (n: number, d: number) => {
  if (d === 0) return '-';
  return (n / d).toFixed(2);
};

class UnknownRule extends Schema.TaggedError<UnknownRule>()('UnknownRule', {
  message: Schema.String,
}) {}

const measure = Effect.fn('judged.measure')(function* (
  id: string,
  as: 'text' | 'line',
  bound: Option.Option<number>,
  repeat: number,
  model: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const config = yield* JudgedLint;
  const rule = yield* Effect.fromOption(
    Option.fromUndefinedOr(config.rules.find((r) => r.id === id)),
  ).pipe(
    Effect.mapError(() =>
      UnknownRule.make({
        message: `no judged rule ${id} is on in .oxlintrc.json; the rules are ${config.rules.map((r) => r.id).join(', ')}`,
      }),
    ),
  );
  const file = path.join(import.meta.dir, 'fixtures', `${kebab(id)}.json`);
  const corpus = yield* Schema.decodeEffect(Corpus)(yield* fs.readFileString(file));
  const textOf = (c: (typeof corpus.cases)[number]) => {
    if (as === 'line') return c.line ?? c.text;
    return c.text;
  };
  // One case a text: the model answers a text once, so a text the corpus
  // holds twice is scored once, and two cases of one text must agree.
  const byText = new Map<string, Array<(typeof corpus.cases)[number]>>();
  for (const c of corpus.cases) byText.set(textOf(c), [...(byText.get(textOf(c)) ?? []), c]);
  const conflicts = [...byText.values()].filter((group) =>
    group.some((c) => c.label !== group[0]?.label),
  ).length;
  const cases = [...byText.values()].flatMap((group) => group.slice(0, 1));
  const questions = Array.from({ length: repeat }, () =>
    cases.map((c) => ({ rule, text: textOf(c) })),
  ).flat();
  const limit = Option.getOrElse(bound, () => LIMITS.bound);
  const started = yield* Clock.currentTimeMillis;
  const asked = yield* ask(questions, { ...LIMITS, bound: limit, deadline: '120 seconds' });
  const wall = (yield* Clock.currentTimeMillis) - started;
  const judged = cases.flatMap((c) =>
    Option.toArray(
      Option.map(
        Option.fromUndefinedOr(asked.answers.get(questionKey({ rule, text: textOf(c) }))),
        (answer) => ({ ...c, got: answer.label, p: answer.probabilities[rule.reports] ?? 0 }),
      ),
    ),
  );
  const wrong = judged.filter((c) => c.got !== c.label);
  const positives = judged.filter((c) => c.label === rule.reports).length;
  const at = (threshold: number) => {
    const reported = judged.filter((c) => c.p >= threshold);
    const right = reported.filter((c) => c.label === rule.reports).length;
    return { reported: reported.length, right };
  };
  const chosen = at(rule.threshold);
  const hand = judged.filter((c) => c.source === 'hand');
  yield* Console.log(
    [
      `${rule.id} model=${model} as=${as} bound=${limit}`,
      `requests=${partsOf(questions, { ...LIMITS, bound: limit }).length}`,
      `cases=${corpus.cases.length} n=${cases.length} conflicts=${conflicts} sent=${questions.length}`,
      `right=${judged.length - wrong.length} wrong=${wrong.length}`,
      `unanswered=${cases.length - judged.length}${Option.match(asked.reason, { onNone: () => '', onSome: (r) => ` reason=${r}` })}`,
      `hand-right=${hand.filter((c) => c.got === c.label).length}/${hand.length}`,
      `positives=${positives} threshold=${rule.threshold}`,
      `reported=${chosen.reported} true=${chosen.right}`,
      `precision=${share(chosen.right, chosen.reported)} recall=${share(chosen.right, positives)}`,
      `wall=${wall}ms`,
      `in=${asked.usage.inputTokens} out=${asked.usage.outputTokens}`,
    ].join(' '),
  );
  yield* Console.log(
    `  sweep ${SWEEP.map((threshold) => {
      const { reported, right } = at(threshold);
      return `${threshold}:p=${share(right, reported)},r=${share(right, positives)},n=${reported}`;
    }).join(' ')}`,
  );
  yield* Effect.forEach(wrong, (c) =>
    Console.log(
      `  ${c.got} p=${c.p.toFixed(2)} want=${c.label} ${c.source} ${textOf(c).replace(/\s+/g, ' ').slice(0, 110)}`,
    ),
  );
});

const command = Command.make(
  'judged-measure',
  {
    rule: Flag.String('rule').pipe(
      Flag.withDescription('the judged rule to measure, by its id in .oxlintrc.json'),
    ),
    as: Flag.Literals('as', ['text', 'line']).pipe(
      Flag.withDefault('text'),
      Flag.withDescription("judge each case's text (as the lint does) or its reported line alone"),
    ),
    bound: Flag.Int('bound').pipe(
      Flag.optional,
      Flag.withDescription('items a request holds at most (all of them)'),
    ),
    repeat: Flag.Int('repeat').pipe(
      Flag.withDefault(1),
      Flag.withDescription('send the corpus this many times over, to probe the size bound'),
    ),
    model: Flag.String('model').pipe(
      Flag.optional,
      Flag.withDescription("the TypeSafe model to ask (the config's settings.judged.model)"),
    ),
  },
  ({ rule, as, bound, repeat, model }) => {
    const repo = judgedLintLayer(import.meta.dir);
    const asking = Layer.unwrap(
      Effect.gen(function* () {
        const config = yield* JudgedLint;
        return judgedModel(Option.getOrElse(model, () => config.settings.model));
      }),
    );
    return Effect.gen(function* () {
      const config = yield* JudgedLint;
      yield* measure(
        rule,
        as,
        bound,
        repeat,
        Option.getOrElse(model, () => config.settings.model),
      );
    }).pipe(Effect.provide(Layer.provideMerge(asking, repo)));
  },
).pipe(
  Command.withDescription('Measure a judged rule on its labelled corpus against the live model'),
);

Command.run(command, { version: '1.0.0' }).pipe(
  Effect.catchTag('UnknownRule', (error) => Console.error(error.message)),
  Effect.provide(Layer.mergeAll(FetchHttpClient.layer, BunServices.layer)),
  BunRuntime.runMain,
);
