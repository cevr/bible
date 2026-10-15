#!/usr/bin/env bun
// The judged lint: rules a model decides (`judged/rule.ts`), run over the
// comment blocks the working tree adds or changes against the merge base of
// `--base` (origin/main) and HEAD. Every item the cache
// (`tmp/judged/cache.json`) does not answer goes to TypeSafe's model in one
// request. A finding prints as
//
//   <file>:<line> warning judged(<rule>): <message> p=<p>
//
// and each rule ends on one `[judged]` line: what it read
// (`[judged] rule=<rule> items=<n> cached=<n> asked=<n> findings=<n>`: the
// comment blocks read, those the cache answered and those the model was
// asked about; two blocks of one text go in the request once), or why it
// skipped (`[judged] skipped rule=<rule> reason=<reason> items=<n>`, the
// items it could not judge). The model's reasons are no-key, timeout,
// rate-limit, http and incomplete. Any other failure (git, the lint config,
// a defect) is `reason=error`, its `detail=` the failure's tag and its words
// on one stderr line; answers the cache cannot keep are asked again next run.
// Every one passes: the lint never blocks a push on its model or its host.
// A finding passes too, unless `--strict` (off: no rule gates until its
// labelled corpus shows the precision a gate needs); an interrupt stops it.
//
//   bun run lint:judged                  # against origin/main
//   bun run lint:judged --base <ref>     # against another base
//
// The model is `JUDGED_MODEL` (jev-latest); the key `TYPESAFE_API_KEY`, else
// the macOS keychain item `typesafe-api-key` (account `bible-tools`).

import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Cause, Console, Effect, Layer, Option, Path, Ref, Runtime, Schema } from 'effect';
import { Command, Flag } from 'effect/cli';
import { FetchHttpClient } from 'effect/http';

import { changedComments, repoRoot } from './judged/comments.js';
import { cacheModel, judgedModel, modelName } from './judged/model.js';
import { historyComment } from './judged/rule.js';
import { LIMITS, detailOf, findingLine, judge, runLine } from './judged/run.js';

class StrictFindings extends Schema.TaggedError<StrictFindings>()('StrictFindings', {
  findings: Schema.Finite,
}) {
  override readonly [Runtime.errorReported] = false;
}

const isStrictFindings = Schema.is(StrictFindings);

/** Lints the changed comments against `base`; `read` holds how many items the selector found. */
const lint = Effect.fn('lintJudged')(function* (
  base: string,
  strict: boolean,
  read: Ref.Ref<number>,
) {
  const path = yield* Path.Path;
  const root = yield* repoRoot;
  const model = yield* modelName;
  const items = yield* changedComments(root, base);
  yield* Ref.set(read, items.length);
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

const commandOf = (read: Ref.Ref<number>) =>
  Command.make(
    'lint-judged',
    {
      base: Flag.String('base').pipe(
        Flag.withDefault('origin/main'),
        Flag.withDescription(
          'the ref whose merge base with HEAD the changed lines are read against',
        ),
      ),
      strict: Flag.Boolean('strict').pipe(
        Flag.withDefault(false),
        Flag.withDescription('exit non-zero on a finding (off: judged rules warn)'),
      ),
    },
    ({ base, strict }) => lint(base, strict, read),
  ).pipe(Command.withDescription('Run the judged lint rules over the changed comments'));

/**
 * `program` with every failure but `StrictFindings` and an interrupt turned
 * into the rule's `reason=error` skip line (`detail=` the failure's tag, or
 * `defect`), the failure's first line on stderr, and success.
 */
const failOpen =
  (read: Ref.Ref<number>) =>
  <A, E extends { readonly _tag: string }, R>(program: Effect.Effect<A, E, R>) =>
    Effect.catchCause(program, (cause) => {
      const error = Cause.findErrorOption(cause);
      if (Cause.hasInterrupts(cause) || Option.exists(error, isStrictFindings))
        return Effect.failCause(cause);
      return Effect.gen(function* () {
        const detail = Option.match(error, { onNone: () => 'defect', onSome: detailOf });
        yield* Console.log(
          `[judged] skipped rule=${historyComment.id} reason=error items=${yield* Ref.get(read)} detail=${detail}`,
        );
        yield* Console.error(`[judged] ${Cause.pretty(cause).split('\n')[0]?.slice(0, 300)}`);
      });
    });

const read = Ref.makeUnsafe(0);

Command.run(commandOf(read), { version: '1.0.0' }).pipe(
  Effect.provide(
    judgedModel.pipe(
      Layer.provideMerge(FetchHttpClient.layer),
      Layer.provideMerge(BunServices.layer),
    ),
  ),
  failOpen(read),
  BunRuntime.runMain,
);
