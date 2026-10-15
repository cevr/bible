#!/usr/bin/env bun
// The judged lint: rules a model decides (`judged/rule.ts`), run over the
// comment blocks the working tree adds or changes against the merge base of
// `--base` (origin/main) and HEAD. Every item the cache
// (`tmp/judged/cache.json`) does not answer goes to TypeSafe's model in one
// request. A finding prints as
//
//   <file>:<line> warning judged(<rule>): <message> p=<p>
//
// and each rule ends on one `[judged]` line: what it read, or why it skipped
// (`[judged] skipped rule=<rule> reason=<no-key|timeout|rate-limit|http|incomplete> items=<n>`).
// The model never fails the step: a skip passes, and so does a finding,
// unless `--strict` (off: no rule gates until its labelled corpus shows the
// precision a gate needs).
//
//   bun run lint:judged                  # against origin/main
//   bun run lint:judged --base <ref>     # against another base
//
// The model is `JUDGED_MODEL` (jev-latest); the key `TYPESAFE_API_KEY`, else
// the macOS keychain item `typesafe-api-key` (account `bible-tools`).

import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Console, Effect, Layer, Path, Runtime, Schema } from 'effect';
import { Command, Flag } from 'effect/cli';
import { FetchHttpClient } from 'effect/http';

import { changedComments, repoRoot } from './judged/comments.js';
import { cacheModel, modelName, typesafeKey, typesafeModel } from './judged/model.js';
import { historyComment } from './judged/rule.js';
import { LIMITS, findingLine, judge, runLine } from './judged/run.js';

class StrictFindings extends Schema.TaggedError<StrictFindings>()('StrictFindings', {
  findings: Schema.Finite,
}) {
  override readonly [Runtime.errorReported] = false;
}

const lint = Effect.fn('lintJudged')(function* (base: string, strict: boolean) {
  const path = yield* Path.Path;
  const root = yield* repoRoot;
  const model = yield* modelName;
  const items = yield* changedComments(root, base);
  const outcome = yield* judge(historyComment, items, {
    model: cacheModel(model),
    cacheFile: path.join(root, 'tmp', 'judged', 'cache.json'),
    ...LIMITS,
  });
  yield* Effect.forEach(outcome.findings, (finding) =>
    Console.log(findingLine(historyComment, finding)),
  );
  yield* Console.log(runLine(historyComment, outcome));
  if (strict && outcome.findings.length > 0)
    return yield* StrictFindings.make({ findings: outcome.findings.length });
});

const command = Command.make(
  'lint-judged',
  {
    base: Flag.String('base').pipe(
      Flag.withDefault('origin/main'),
      Flag.withDescription('the ref whose merge base with HEAD the changed lines are read against'),
    ),
    strict: Flag.Boolean('strict').pipe(
      Flag.withDefault(false),
      Flag.withDescription('exit non-zero on a finding (off: judged rules warn)'),
    ),
  },
  ({ base, strict }) => lint(base, strict),
).pipe(Command.withDescription('Run the judged lint rules over the changed comments'));

const model = Layer.unwrap(Effect.map(modelName, (name) => typesafeModel(name, typesafeKey)));

Command.run(command, { version: '1.0.0' }).pipe(
  Effect.provide(
    model.pipe(Layer.provideMerge(FetchHttpClient.layer), Layer.provideMerge(BunServices.layer)),
  ),
  BunRuntime.runMain,
);
