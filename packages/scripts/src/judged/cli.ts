// The judged lint's command (`lint-judged.ts` runs it): its flags, the run
// of every judged rule of the lint config over the changed items, and the
// boundary that turns every failure but a gating finding and an interrupt
// into one `reason=error` skip line and success. It takes its model as a
// layer for the config's model name, so a test runs the whole command
// in-process over a model of its own.

import { Cause, Console, Effect, Layer, Option, Path, Ref, Runtime, Schema } from 'effect';
import type { DecisionModel } from 'effect/ai';
import { Command, Flag } from 'effect/cli';

import { changedItems } from './changes.js';
import { JudgedLint, judgedLintLayer } from './config.js';
import { cacheModel } from './rule.js';
import { LIMITS, detailOf, findingLine, judge, runLine } from './run.js';

/** Findings that fail the run: a rule at `error`, or any finding under `--strict`. */
class GatingFindings extends Schema.TaggedError<GatingFindings>()('GatingFindings', {
  findings: Schema.Finite,
}) {
  override readonly [Runtime.errorReported] = false;
}

const isGatingFindings = Schema.is(GatingFindings);

/** A model layer for a model's name. */
type ModelOf<E, R> = (model: string) => Layer.Layer<DecisionModel.DecisionModel, E, R>;

/** Lints the repo's changed items against `base`; `read` holds how many items the selectors found. */
const lint = Effect.fn('lintJudged')(function* (
  base: string,
  strict: boolean,
  read: Ref.Ref<number>,
) {
  const path = yield* Path.Path;
  const config = yield* JudgedLint;
  const root = config.root;
  const changed = yield* changedItems(root, base, config.ignorePatterns, [
    ...new Set(config.rules.map((rule) => rule.selector)),
  ]);
  const items = config.rules.flatMap((rule) =>
    changed
      .filter((item) => item.selector === rule.selector)
      .map((item) => ({ rule, file: item.file, line: item.line, text: item.text })),
  );
  yield* Ref.set(read, items.length);
  const outcomes = yield* judge(config.rules, items, {
    model: cacheModel(config.settings.model),
    cacheFile: path.join(root, config.settings.cache),
    ...LIMITS,
  });
  for (const outcome of outcomes)
    yield* Effect.forEach(outcome.findings, (finding) =>
      Console.log(findingLine(outcome.rule, finding)),
    );
  yield* Effect.forEach(outcomes, (outcome) => Console.log(runLine(outcome)));
  const gating = outcomes
    .filter((outcome) => strict || outcome.rule.severity === 'error')
    .reduce((n, outcome) => n + outcome.findings.length, 0);
  if (gating > 0) return yield* GatingFindings.make({ findings: gating });
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
        Flag.withDescription(
          'exit non-zero on any finding (off: only a rule at severity error fails the run)',
        ),
      ),
    },
    ({ base, strict }) => lint(base, strict, read),
  ).pipe(Command.withDescription('Run the judged lint rules over the changed items'));

/**
 * `program` with every failure but `GatingFindings` and an interrupt turned
 * into the run's `reason=error` skip line (`rule=*`: the failure is the
 * run's, before or across its rules; `detail=` the failure's tag, or
 * `defect`), the failure's first line on stderr, and success.
 */
const failOpen =
  (read: Ref.Ref<number>) =>
  <A, E extends { readonly _tag: string }, R>(program: Effect.Effect<A, E, R>) =>
    Effect.catchCause(program, (cause) => {
      const error = Cause.findErrorOption(cause);
      if (Cause.hasInterrupts(cause) || Option.exists(error, isGatingFindings))
        return Effect.failCause(cause);
      return Effect.gen(function* () {
        const detail = Option.match(error, { onNone: () => 'defect', onSome: detailOf });
        yield* Console.log(
          `[judged] skipped rule=* reason=error items=${yield* Ref.get(read)} detail=${detail}`,
        );
        yield* Console.error(`[judged] ${Cause.pretty(cause).split('\n')[0]?.slice(0, 300)}`);
      });
    });

/**
 * The judged lint run with `args` in the repo at `cwd`, over `modelOf` the
 * config's model: the config and the model layer are built inside the
 * boundary, so their failure fails open too.
 */
export const lintJudged = <E extends { readonly _tag: string }, R>(
  args: ReadonlyArray<string>,
  cwd: string,
  modelOf: ModelOf<E, R>,
) =>
  Effect.suspend(() => {
    const read = Ref.makeUnsafe(0);
    const repo = judgedLintLayer(cwd);
    const model = Layer.unwrap(
      Effect.gen(function* () {
        const config = yield* JudgedLint;
        return modelOf(config.settings.model);
      }),
    );
    return Command.runWith(commandOf(read), { version: '1.0.0' })(args).pipe(
      Effect.provide(Layer.provideMerge(model, repo)),
      failOpen(read),
    );
  });
