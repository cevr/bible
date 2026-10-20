// The judged rules as the repo's lint config writes them: each
// `judged/<id>` entry of `.oxlintrc.json`'s `rules` that is not `off`, its
// options decoded as a rule (`rule.ts`), with `settings.judged` and the
// config's ignore patterns. The config is the rules' one source: the oxlint
// plugin reads the same entries as its options.

import { JSONC } from 'bun';
import { Context, Effect, FileSystem, Layer, Option, Path, Schema } from 'effect';

import { repoRoot } from '../guard/files.js';

import { type JudgedRule, RuleOptions, Settings } from './rule.js';

const PREFIX = 'judged/';

const Severity = Schema.Literals(['off', 'warn', 'error']);

/** An entry of the config's `rules`: a severity, or a severity and its options. */
const Entry = Schema.Union([Severity, Schema.Array(Schema.Unknown)]);

const LintConfig = Schema.Struct({
  ignorePatterns: Schema.optional(Schema.Array(Schema.String)),
  settings: Schema.optional(Schema.Struct({ judged: Schema.optional(Settings) })),
  rules: Schema.optional(Schema.Record(Schema.String, Entry)),
});

/** An entry with options: `[severity, options]`. */
const WithOptions = Schema.Tuple([Severity, RuleOptions]);

/** The repo's lint config is not JSONC, or a judged entry, or its settings, is not the shape it reads. */
class LintConfigUnreadable extends Schema.TaggedError<LintConfigUnreadable>()(
  'LintConfigUnreadable',
  { file: Schema.String, detail: Schema.String },
) {
  override get message() {
    return `${this.file} does not read as a lint config: ${this.detail}`;
  }
}

/** What a run reads of the lint config. */
interface JudgedConfig {
  readonly ignorePatterns: ReadonlyArray<string>;
  readonly settings: Settings;
  readonly rules: ReadonlyArray<JudgedRule>;
}

/** The judged rule an entry `judged/<id>` declares: none when it is `off`. */
const ruleOf = (file: string, name: string, entry: typeof Entry.Type) => {
  const id = name.slice(PREFIX.length);
  if (entry === 'off') return Effect.succeed(Option.none<JudgedRule>());
  return Schema.decodeUnknownEffect(WithOptions)(entry).pipe(
    Effect.mapError(() =>
      LintConfigUnreadable.make({
        file,
        detail: `${name} is neither "off" nor [severity, the options of a judged rule]`,
      }),
    ),
    Effect.map(([severity, options]) =>
      Option.map(
        Option.liftPredicate(severity, (level) => level !== 'off'),
        (level): JudgedRule => ({ ...options, id, severity: level }),
      ),
    ),
  );
};

/** The lint config's text, read as the judged lint reads it. */
const readJudgedConfig = Effect.fn('judged.readConfig')(function* (file: string, text: string) {
  const config = yield* Effect.try({
    try: () => JSONC.parse(text),
    catch: () => LintConfigUnreadable.make({ file, detail: 'not JSONC' }),
  }).pipe(
    Effect.flatMap((json) =>
      Schema.decodeUnknownEffect(LintConfig)(json).pipe(
        Effect.mapError(() =>
          LintConfigUnreadable.make({ file, detail: 'not the shape it reads' }),
        ),
      ),
    ),
  );
  const settings = yield* Effect.fromOption(Option.fromUndefinedOr(config.settings?.judged)).pipe(
    Effect.mapError(() =>
      LintConfigUnreadable.make({ file, detail: 'it has no settings.judged (model, store)' }),
    ),
  );
  const rules = yield* Effect.forEach(
    Object.entries(config.rules ?? {}).filter(([name]) => name.startsWith(PREFIX)),
    ([name, entry]) => ruleOf(file, name, entry),
  );
  const judged: JudgedConfig = {
    ignorePatterns: config.ignorePatterns ?? [],
    settings,
    rules: rules.flatMap(Option.toArray),
  };
  return judged;
});

/** The judged rules of the repo at `root`, from its `.oxlintrc.json`. */
const judgedConfig = Effect.fn('judged.config')(function* (root: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  return yield* readJudgedConfig(
    '.oxlintrc.json',
    yield* fs.readFileString(path.join(root, '.oxlintrc.json')),
  );
});

/** The repo the judged lint runs in: its root, and its lint config's judged rules. */
export class JudgedLint extends Context.Service<
  JudgedLint,
  JudgedConfig & { readonly root: string }
>()('judged/JudgedLint') {}

/** The judged lint of the repo at `cwd`. */
export const judgedLintLayer = (cwd: string) =>
  Layer.effect(JudgedLint)(
    Effect.gen(function* () {
      const root = yield* repoRoot(cwd);
      return { root, ...(yield* judgedConfig(root)) };
    }),
  );
