#!/usr/bin/env bun
// How right historyComment is on its labelled corpus
// (`fixtures/history-comment.json`), against the live model: every case in
// one request (split past `--bound`), no cache. Not a test: it costs a
// request and the model is not deterministic.
//
//   bun run --filter @bible/scripts judged:measure
//   bun run --filter @bible/scripts judged:measure --as line      # the reported lines, not the blocks
//   bun run --filter @bible/scripts judged:measure --bound 50     # four requests at once
//   bun run --filter @bible/scripts judged:measure --repeat 3     # the corpus three times over, one request
//
// Prints one line, `historyComment model=<m> as=<line|block> bound=<n>
// requests=<n> n=<n> right=<n> wrong=<n> unanswered=<n> hand-right=<n>/6
// reported=<n> history=<n> (the cases at or over the rule's threshold, and how
// many of them are history: the precision a gate would need)
// wall=<ms> in=<tokens> out=<tokens>`, then each wrong case.

import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Clock, Console, Effect, FileSystem, Layer, Option, Path, Schema } from 'effect';
import { Command, Flag } from 'effect/cli';
import { FetchHttpClient } from 'effect/http';

import { judgedModel, modelName } from './model.js';
import { historyComment } from './rule.js';
import { LIMITS, ask, partsOf } from './run.js';

const Corpus = Schema.fromJsonString(
  Schema.Struct({
    cases: Schema.Array(
      Schema.Struct({
        source: Schema.String,
        line: Schema.String,
        block: Schema.String,
        label: Schema.Literals(['today', 'history']),
      }),
    ),
  }),
);

const measure = Effect.fn('judged.measure')(function* (
  as: 'line' | 'block',
  bound: Option.Option<number>,
  repeat: number,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const file = path.join(import.meta.dir, 'fixtures', 'history-comment.json');
  const { cases } = yield* Schema.decodeEffect(Corpus)(yield* fs.readFileString(file));
  const texts = Array.from({ length: repeat }, () => cases.map((c) => c[as])).flat();
  const limit = Option.getOrElse(bound, () => LIMITS.bound);
  const started = yield* Clock.currentTimeMillis;
  const asked = yield* ask(historyComment, texts, {
    ...LIMITS,
    bound: limit,
    deadline: '120 seconds',
  });
  const wall = (yield* Clock.currentTimeMillis) - started;
  const judged = cases.flatMap((c) =>
    Option.toArray(
      Option.map(Option.fromUndefinedOr(asked.answers.get(c[as])), (answer) => ({
        ...c,
        got: answer.label,
        p: answer.probabilities['history'] ?? 0,
      })),
    ),
  );
  const wrong = judged.filter((c) => c.got !== c.label);
  const reported = judged.filter((c) => c.p >= historyComment.threshold);
  const handRight = judged.filter((c) => c.source === 'hand' && c.got === c.label).length;
  yield* Console.log(
    [
      `historyComment model=${yield* modelName} as=${as} bound=${limit}`,
      `requests=${partsOf(historyComment, texts, { ...LIMITS, bound: limit }).length} n=${texts.length}`,
      `right=${judged.length - wrong.length} wrong=${wrong.length}`,
      `unanswered=${cases.length - judged.length}${Option.match(asked.reason, { onNone: () => '', onSome: (r) => ` reason=${r}` })}`,
      `hand-right=${handRight}/6`,
      `reported=${reported.length} history=${reported.filter((c) => c.label === 'history').length}`,
      `wall=${wall}ms`,
      `in=${asked.usage.inputTokens} out=${asked.usage.outputTokens}`,
    ].join(' '),
  );
  yield* Effect.forEach(wrong, (c) =>
    Console.log(
      `  ${c.got} p=${c.p.toFixed(2)} want=${c.label} ${c.source} ${c.line.slice(0, 90)}`,
    ),
  );
});

const command = Command.make(
  'judged-measure',
  {
    as: Flag.Literals('as', ['block', 'line']).pipe(
      Flag.withDefault('block'),
      Flag.withDescription(
        'judge each comment block (as the lint does) or the reported line alone',
      ),
    ),
    bound: Flag.Int('bound').pipe(
      Flag.optional,
      Flag.withDescription('items a request holds at most (all of them)'),
    ),
    repeat: Flag.Int('repeat').pipe(
      Flag.withDefault(1),
      Flag.withDescription('send the corpus this many times over, to probe the size bound'),
    ),
  },
  ({ as, bound, repeat }) => measure(as, bound, repeat),
).pipe(
  Command.withDescription('Measure historyComment on its labelled corpus against the live model'),
);

Command.run(command, { version: '1.0.0' }).pipe(
  Effect.provide(
    judgedModel.pipe(
      Layer.provideMerge(FetchHttpClient.layer),
      Layer.provideMerge(BunServices.layer),
    ),
  ),
  BunRuntime.runMain,
);
