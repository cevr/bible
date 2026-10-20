// The judged lint's command (`lint-judged.ts` runs it): its flag, the run
// of every judged rule of the lint config over the repo's items, the
// run's findings written by file for the plugin (`findings.ts`; one that
// cannot be written is said on one line), the findings oxlint cannot report
// printed, and the boundary that turns every failure but a gating finding and an interrupt
// into one `reason=error` skip line and success. It takes its model as a
// layer for the config's model name, so a test runs the whole command
// in-process over a model of its own.

import {
  Cause,
  Clock,
  Console,
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
  Ref,
  Runtime,
  Schema,
} from 'effect';
import type { DecisionModel } from 'effect/ai';
import { Command, Flag } from 'effect/cli';

import { Findings, findingsFileOf, makersHash, ruleSignature } from './findings.js';
import { readByOxlint } from './items.js';
import { JudgedLint, judgedLintLayer } from './config.js';
import { cacheModel } from './rule.js';
import { LIMITS, detailOf, findingLine, judge, runLine } from './run.js';
import { repoItems } from './sources.js';
import { dayOf, storeFileOf } from './store.js';

/** Findings that fail the run: a rule at `error`, or any finding under `--strict`. */
class GatingFindings extends Schema.TaggedError<GatingFindings>()('GatingFindings', {
  findings: Schema.Finite,
}) {
  override readonly [Runtime.errorReported] = false;
}

const isGatingFindings = Schema.is(GatingFindings);

/** A model layer for a model's name. */
type ModelOf<E, R> = (model: string) => Layer.Layer<DecisionModel.DecisionModel, E, R>;

/**
 * The findings file of a run on `day`: each file the run read, by its hash,
 * with the findings the store keeps of each rule that judged all its items
 * there, for the plugin to report; a Markdown file oxlint never reads holds
 * none.
 */
const findingsOf = (
  day: number,
  model: string,
  outcomes: Effect.Success<ReturnType<typeof judge>>['outcomes'],
  files: ReadonlyArray<{ readonly file: string; readonly hash: string }>,
): Findings => ({
  day,
  makers: makersHash(),
  rules: Object.fromEntries(
    outcomes.map((outcome) => [outcome.rule.id, ruleSignature(model, outcome.rule)]),
  ),
  files: Object.fromEntries(
    files
      .filter(({ file }) => readByOxlint(file))
      .map(({ file, hash }) => [
        file,
        {
          hash,
          rules: Object.fromEntries(
            outcomes
              .filter((outcome) => !outcome.unjudged.has(file))
              .map((outcome) => [
                outcome.rule.id,
                outcome.findings
                  .filter((finding) => finding.kept && finding.file === file)
                  .map(({ start, p }) => ({ start, p })),
              ]),
          ),
        },
      ]),
  ),
});

/** Writes `findings` to `file` whole, through a temporary file renamed over it; one that cannot be written is said on one line. */
const writeFindings = (file: string, findings: Findings) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    yield* fs.makeDirectory(path.dirname(file), { recursive: true });
    const temporary = `${file}.${process.pid}.tmp`;
    yield* fs.writeFileString(temporary, yield* Schema.encodeEffect(Findings)(findings));
    yield* fs.rename(temporary, file);
  }).pipe(
    Effect.catch((error) => Console.error(`[judged] findings not kept detail=${error._tag}`)),
  );

/** Lints the repo's items; `read` holds how many items the selectors found. */
const lint = Effect.fn('lintJudged')(function* (strict: boolean, read: Ref.Ref<number>) {
  const config = yield* JudgedLint;
  const path = yield* Path.Path;
  const root = config.root;
  const model = cacheModel(config.settings.model);
  const tree = yield* repoItems(root, config.ignorePatterns, config.rules, {
    model,
    file: path.join(root, config.settings.checkout, 'items.json'),
  });
  yield* Ref.set(read, tree.items.length);
  const { outcomes, usage } = yield* judge(config.rules, tree.items, {
    model,
    storeFile: storeFileOf(root, config.settings.store),
    textsOf: tree.textsOf,
    ...LIMITS,
  });
  if (usage.inputTokens > 0)
    yield* Console.error(`[judged] tokens input=${usage.inputTokens} output=${usage.outputTokens}`);
  yield* writeFindings(
    findingsFileOf(root, config.settings.checkout),
    findingsOf(dayOf(yield* Clock.currentTimeMillis), model, outcomes, tree.files),
  );
  // oxlint reports, at the rule's severity, every finding the plugin can
  // read; the runner prints and gates on the rest (a series script, an
  // answer the store could not keep), or on every one under --strict.
  const own = outcomes.map((outcome) => ({
    rule: outcome.rule,
    findings: outcome.findings.filter(
      (finding) => strict || !finding.kept || !readByOxlint(finding.file),
    ),
  }));
  for (const outcome of own)
    yield* Effect.forEach(outcome.findings, (finding) =>
      Console.log(findingLine(outcome.rule, finding)),
    );
  yield* Effect.forEach(outcomes, (outcome) => Console.log(runLine(outcome)));
  const gating = own
    .filter((outcome) => strict || outcome.rule.severity === 'error')
    .reduce((n, outcome) => n + outcome.findings.length, 0);
  if (gating > 0) return yield* GatingFindings.make({ findings: gating });
});

const commandOf = (read: Ref.Ref<number>) =>
  Command.make(
    'lint-judged',
    {
      strict: Flag.Boolean('strict').pipe(
        Flag.withDefault(false),
        Flag.withDescription(
          "print every finding, oxlint's too, and exit non-zero on any (off: only a finding oxlint cannot report, of a rule at severity error, fails the run)",
        ),
      ),
    },
    ({ strict }) => lint(strict, read),
  ).pipe(Command.withDescription("Run the judged lint rules over the repo's items"));

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
