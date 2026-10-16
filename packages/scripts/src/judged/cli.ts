// The judged lint's command (`lint-judged.ts` runs it): its flags, the run
// over the changed comments, and the boundary that turns every failure but a
// `--strict` finding and an interrupt into the rule's `reason=error` skip
// line and success. It takes its model as a layer, so a test runs the whole
// command in-process over a model of its own.

import { Cause, Console, Effect, type Layer, Option, Path, Ref, Runtime, Schema } from 'effect';
import type { DecisionModel } from 'effect/ai';
import { Command, Flag } from 'effect/cli';

import { changedComments, repoRoot } from './comments.js';
import { cacheModel, modelName } from './model.js';
import { historyComment } from './rule.js';
import { LIMITS, detailOf, findingLine, judge, runLine } from './run.js';

class StrictFindings extends Schema.TaggedError<StrictFindings>()('StrictFindings', {
  findings: Schema.Finite,
}) {
  override readonly [Runtime.errorReported] = false;
}

const isStrictFindings = Schema.is(StrictFindings);

/** Lints the changed comments of the repo at `cwd` against `base`; `read` holds how many items the selector found. */
const lint = Effect.fn('lintJudged')(function* (
  cwd: string,
  base: string,
  strict: boolean,
  read: Ref.Ref<number>,
) {
  const path = yield* Path.Path;
  const root = yield* repoRoot(cwd);
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

const commandOf = (read: Ref.Ref<number>, cwd: string) =>
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
    ({ base, strict }) => lint(cwd, base, strict, read),
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

/**
 * The judged lint run with `args` in the repo at `cwd`, over `model`: the
 * model layer is built inside the boundary, so its failure fails open too.
 */
export const lintJudged = <E extends { readonly _tag: string }, R>(
  args: ReadonlyArray<string>,
  cwd: string,
  model: Layer.Layer<DecisionModel.DecisionModel, E, R>,
) =>
  Effect.suspend(() => {
    const read = Ref.makeUnsafe(0);
    return Command.runWith(commandOf(read, cwd), { version: '1.0.0' })(args).pipe(
      Effect.provide(model),
      failOpen(read),
    );
  });
