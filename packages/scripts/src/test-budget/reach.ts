// Every test file of a workspace runs: its `test` script (the one the gate
// runs, through turbo) takes it, or a script of its own run by hand
// (`test:e2e`, `test:browser`) names it. A test file no script reaches
// passes the gate without ever running, and lets its workspace fit the
// budget by running less: `test:budget` measures no workspace that leaves
// one out, and `reach.test.ts` holds every workspace of the repo to it.
//
// The reader reproduces a narrow grammar of scripts and refuses the rest: a
// script it cannot read reaches nothing, so the check can call a file
// unreached that runs, never the reverse. A script reaches files only when
// its commands are joined by `&&` alone (`andChained`), none sets a variable
// or changes the shell (`changesShell`: `BUN_OPTIONS`, `export`), none runs
// in another folder (`movesFolder`: `cd`, a subshell, `--cwd`), and each holds only
// flags that leave what runs as it is (`BUN_FLAGS`, `PLAYWRIGHT_FLAGS`; an
// unknown one, a narrowing one such as `--changed`, `-t`, `--grep`,
// `--shard`, `--list`, or an attached short value is refused).
// `bun run <script>` runs that script of the workspace, read on its own,
// and refuses words after the script's name (bun hands them on). A bun
// command in a workspace whose `bunfig.toml` does not parse, or sets a
// `[test]` key outside `BUNFIG_TEST_KEYS` (`root`, `pathIgnorePatterns`),
// reaches nothing.
//
// A `bun test` command takes a file as bun does: with no filter, every file
// named as a test (`*.test.ts`, `*_test.ts`, `*.spec.ts`, `*_spec.ts`, in
// any of bun's script extensions); a filter that starts with `./` names a
// file or a folder by its path from the workspace; any other filter takes
// each test file whose path holds it; `--path-ignore-patterns` takes none
// its globs match.
// `playwright test` takes a file as its config sets it (`playwrightRun`):
// under the config's `testDir`, its absolute path matched by its
// `testMatch` and not by its `testIgnore`, each read as playwright's file
// matcher reads it (a regex as written, a glob by `globMatcher`), and by one
// of the command's filters when it names any. The reader parses the config
// and reads the object it exports (`settingsOf`); a config it cannot read
// (none, one that does not parse or exports anything else, a spread or a
// computed key in it, a `testDir`, `testMatch`, `testIgnore` or
// `respectGitIgnore` set as anything but a literal, a setting outside
// `PLAYWRIGHT_SETTINGS` such as `projects`, `grep` or `shard`) takes none.
// A file is one playwright's walk of `testDir` finds (`walked`): it enters
// no `node_modules`, and where it respects git's ignore rules
// (`respectGitIgnore: true`, or neither it nor `testDir` set) it reads each
// `.gitignore` from `testDir` down by minimatch, as `collectFiles` does.
// Only a runner reaches a file: `bun test`, a wrapper of it the repo names
// (`BUN_TEST_WRAPPERS`), `playwright test`; any other command (`echo
// ./src`, a build) reaches none. A file named
// as a test needs a script unless it is data (`isData`): it parses and
// exports by default only an object or array of literals, which runs
// nothing when loaded and so registers no test. A test file no workspace
// holds is unreached.

import { Glob, TOML } from 'bun';
import { Effect, FileSystem, Option, Path, Predicate, Schema } from 'effect';
import { Minimatch, minimatch } from 'minimatch';
import { type Expression, type ObjectExpression, parseSync } from 'oxc-parser';
import { gateFiles } from '../guard/files.ts';
import { andChained, changesShell, commandsOf } from './shell.ts';

/** Whether bun's runner takes a file for a test by its name. */
const isTestFile = (file: string) => /(?:\.test|_test|\.spec|_spec)\.[cm]?[jt]sx?$/.test(file);

/**
 * Whether a value runs nothing when it is read: a literal, a template with no
 * expression in it, or an array or object of such values, every key a plain
 * name or a literal (no spread, no computed key, no method, getter or
 * shorthand).
 */
const isInert = (value: Expression): boolean => {
  if (value.type === 'Literal') return true;
  if (value.type === 'TemplateLiteral') return value.expressions.length === 0;
  if (value.type === 'ArrayExpression')
    return value.elements.every((element) =>
      Option.match(Option.fromNullOr(element), {
        onNone: () => true,
        onSome: (held) => held.type !== 'SpreadElement' && isInert(held),
      }),
    );
  if (value.type === 'ObjectExpression')
    return value.properties.every(
      (property) =>
        property.type === 'Property' &&
        !property.computed &&
        !property.method &&
        !property.shorthand &&
        property.kind === 'init' &&
        (property.key.type === 'Identifier' || property.key.type === 'Literal') &&
        isInert(property.value),
    );
  return false;
};

/**
 * Whether a file named as a test is data, not a test (a study's `*.spec.js`
 * that the CLI reads): it parses, and its one statement exports by default an
 * inert object or array (`isInert`). Loading it calls nothing, so it
 * registers no test. Any other file named as a test is taken to register
 * one, however it imports or names its runner.
 */
const isData = (file: string, text: string) => {
  const parsed = parseSync(file, text);
  if (parsed.errors.length > 0) return false;
  const [only, ...more] = parsed.program.body;
  if (more.length > 0) return false;
  return Option.exists(Option.fromUndefinedOr(only), (statement) => {
    if (statement.type !== 'ExportDefaultDeclaration') return false;
    const value = statement.declaration;
    if (value.type !== 'ObjectExpression' && value.type !== 'ArrayExpression') return false;
    return isInert(value);
  });
};

/**
 * The flags a command may hold, each by its name, and whether it takes the
 * next word as its value (`true`) or a value only after `=` (`false`).
 */
type Flags = ReadonlyMap<string, boolean>;

/**
 * The flags of bun, and of `bun test`, that leave the files and cases a run
 * takes as they are. Any other (`--changed`, `--shard`, `-t`, `--only`,
 * another `--config`, an attached short value such as `-tfast`, one this
 * does not know) may narrow it.
 */
const BUN_FLAGS: Flags = new Map([
  ['--timeout', true],
  ['--rerun-each', true],
  ['--retry', true],
  ['--preload', true],
  ['-r', true],
  ['--coverage', false],
  ['--coverage-reporter', true],
  ['--coverage-dir', true],
  ['--reporter', true],
  ['--reporter-outfile', true],
  ['--dots', false],
  ['--only-failures', false],
  ['--path-ignore-patterns', true],
  ['--max-concurrency', true],
  ['--seed', true],
  ['--randomize', false],
  ['--bail', false],
  ['--todo', false],
  ['--concurrent', false],
  ['--pass-with-no-tests', false],
  ['--isolate', false],
  ['--no-isolate', false],
  ['--parallel', false],
  ['--parallel-delay', true],
  ['--timings', true],
  ['--update-timings', false],
  ['--update-snapshots', false],
  ['-u', false],
  ['--no-orphans', false],
  ['--smol', false],
  ['--conditions', true],
  ['--define', true],
  ['-d', true],
  ['--loader', true],
  ['-l', true],
  ['--tsconfig-override', true],
  ['--env-file', true],
]);

/**
 * A command's words read against the flags it may hold: its other words,
 * and each flag with its value, both in the order the command gives them;
 * none when it holds a flag not in `flags`, or a flag that takes a value
 * with none after it. A flag that takes a value takes the next word unless
 * that word is a flag; any flag takes a value after `=`.
 */
const argumentsOf = (words: ReadonlyArray<string>, flags: Flags) => {
  const positionals: Array<string> = [];
  const given: Array<readonly [string, string]> = [];
  for (let at = 0; at < words.length; at++) {
    const word = words[at] ?? '';
    if (!word.startsWith('-')) {
      positionals.push(word);
      continue;
    }
    const [name = '', inline] = word.split(/=(.*)/s);
    const valued = Option.fromUndefinedOr(flags.get(name));
    if (Option.isNone(valued)) return Option.none();
    if (Predicate.isString(inline)) {
      given.push([name, inline]);
      continue;
    }
    if (!valued.value) {
      given.push([name, '']);
      continue;
    }
    const next = words[at + 1] ?? '-';
    if (next.startsWith('-')) return Option.none();
    at++;
    given.push([name, next]);
  }
  return Option.some({ positionals, given });
};

/** The values a command's flags `names` were given, in the order it gives them. */
const valuesOf = (
  given: ReadonlyArray<readonly [string, string]>,
  names: ReadonlyArray<string>,
): ReadonlyArray<string> =>
  given.filter(([name]) => names.includes(name)).map(([, value]) => value);

/** Where bun's subcommand stands in a `bun` command (`test`, `run`, a file): past bun's own flags and their values. */
const subcommandAt = (words: ReadonlyArray<string>) => {
  let at = 1;
  while ((words[at] ?? '').startsWith('-')) {
    const word = words[at] ?? '';
    const valued = !word.includes('=') && BUN_FLAGS.get(word) === true;
    at += 1;
    if (valued && !(words[at] ?? '-').startsWith('-')) at += 1;
  }
  return at;
};

/**
 * What a command runs: a `bun test`'s filters and the globs it leaves out
 * (every test file when it names no filter), or the files playwright's
 * config takes.
 */
type Run =
  | {
      readonly kind: 'bunTest';
      readonly filters: ReadonlyArray<string>;
      readonly ignores: ReadonlyArray<string>;
    }
  | { readonly kind: 'playwright'; readonly takes: (file: string) => boolean };

/**
 * A `bun test`'s arguments read as bun reads them: its filters, and its
 * ignore patterns; nothing when it holds a flag outside `BUN_FLAGS`.
 */
const bunTestOf = (words: ReadonlyArray<string>): ReadonlyArray<Run> =>
  Option.match(argumentsOf(words, BUN_FLAGS), {
    onNone: () => [],
    onSome: ({ positionals, given }) => [
      {
        kind: 'bunTest',
        filters: positionals,
        ignores: valuesOf(given, ['--path-ignore-patterns']),
      },
    ],
  });

/**
 * The keys of a bunfig's `[test]` that leave its files and cases as they
 * are: any other (`root`, `pathIgnorePatterns`, one this does not know)
 * may narrow what `bun test` runs.
 */
const BUNFIG_TEST_KEYS = new Set([
  'preload',
  'smol',
  'timeout',
  'retry',
  'rerunEach',
  'randomize',
  'seed',
  'concurrentTestGlob',
  'onlyFailures',
  'reporter',
  'coverage',
  'coverageThreshold',
  'coverageReporter',
  'coverageDir',
  'coverageSkipTestFiles',
  'coveragePathIgnorePatterns',
  'coverageIgnoreSourcemaps',
]);

const Bunfig = Schema.Struct({
  test: Schema.optionalKey(Schema.Record(Schema.String, Schema.Unknown)),
});

/**
 * Whether a workspace's `bunfig.toml` (its text, `''` when it has none)
 * may narrow what a `bun test` run there takes: it does not parse, or its
 * `[test]` sets a key not in `BUNFIG_TEST_KEYS`.
 */
const bunfigNarrows = (text: string) =>
  Option.match(
    Option.flatMap(Option.liftThrowable(TOML.parse)(text), Schema.decodeUnknownOption(Bunfig)),
    {
      onNone: () => true,
      onSome: ({ test = {} }) => Object.keys(test).some((key) => !BUNFIG_TEST_KEYS.has(key)),
    },
  );

/** A path filter's path from the workspace, `./src/` as `src`; none for one outside it. */
const pathOf = (filter: string): Option.Option<string> => {
  if (filter.startsWith('/') || filter.split('/').includes('..')) return Option.none();
  return Option.some(
    filter
      .split('/')
      .filter((part) => part !== '.' && part !== '')
      .join('/'),
  );
};

/** Whether a command takes `file` (its path from the workspace, `/` between its parts). */
const runsFile = (run: Run, file: string) => {
  if (file.split('/').includes('node_modules')) return false;
  if (run.kind === 'playwright') return run.takes(file);
  if (run.ignores.some((pattern) => new Glob(pattern).match(file))) return false;
  const named = isTestFile(file);
  if (run.filters.length === 0) return named;
  return run.filters.some((filter) => {
    const asPath = Option.liftPredicate(filter, (f) => f.startsWith('./'));
    return Option.match(Option.flatMap(asPath, pathOf), {
      onNone: () => named && file.includes(filter),
      // `./` is the workspace itself: every file named as a test under it.
      onSome: (at) => (at === '' && named) || file === at || (named && file.startsWith(`${at}/`)),
    });
  });
};

/**
 * The flags of `playwright test` that leave the files and cases it runs as
 * they are. Any other (`--grep`, `-g`, `-G`, `--grep-invert`, `--project`,
 * `--shard`, `--last-failed`, `--only-changed`, `--list`, `--ui`, an
 * attached short value, one this does not know) may narrow it or run none.
 */
const PLAYWRIGHT_FLAGS: Flags = new Map([
  ['--config', true],
  ['-c', true],
  ['--workers', true],
  ['-j', true],
  ['--reporter', true],
  ['--timeout', true],
  ['--retries', true],
  ['--repeat-each', true],
  ['--max-failures', true],
  ['-x', false],
  ['--output', true],
  ['--global-timeout', true],
  ['--trace', true],
  ['--tsconfig', true],
  ['--browser', true],
  ['--headed', false],
  ['--forbid-only', false],
  ['--fully-parallel', false],
  ['--pass-with-no-tests', false],
  ['--quiet', false],
  ['--update-snapshots', false],
  ['-u', false],
  ['--ignore-snapshots', false],
  ['--fail-on-flaky-tests', false],
]);

/**
 * The settings of a playwright config that leave the files and cases it
 * runs as `playwrightRun` reads them. A config that sets any other
 * (`projects`, `grep`, `grepInvert`, `shard`, one this does not know) takes
 * none.
 */
const PLAYWRIGHT_SETTINGS = new Set([
  'testDir',
  'testMatch',
  'testIgnore',
  'respectGitIgnore',
  'timeout',
  'retries',
  'workers',
  'reporter',
  'use',
  'webServer',
  'fullyParallel',
  'forbidOnly',
  'outputDir',
  'expect',
  'globalSetup',
  'globalTeardown',
  'globalTimeout',
  'maxFailures',
  'preserveOutput',
  'quiet',
  'reportSlowTests',
  'snapshotDir',
  'snapshotPathTemplate',
  'updateSnapshots',
  'updateSourceMethod',
  'ignoreSnapshots',
  'metadata',
  'name',
  'tsconfig',
  'build',
  'captureGitInfo',
  'failOnFlakyTests',
  'repeatEach',
]);

/** The names playwright looks for its config under, in the folder it runs in, when no `--config` names one. */
const PLAYWRIGHT_CONFIGS = ['ts', 'js', 'mts', 'mjs', 'cts', 'cjs'].map(
  (ext) => `playwright.config.${ext}`,
);

/** Playwright's own `testMatch` when its config sets none. */
const PLAYWRIGHT_MATCH = '**/*.@(spec|test).?(c|m)[jt]s?(x)';

/**
 * A test of a file's absolute path by a glob, as playwright's
 * `createFileMatcher` makes one: `**\/` before it unless it starts so, read
 * by minimatch (the version playwright bundles, held by `reach.test.ts`)
 * with no regard to case and dot files taken. A regex it tests as written.
 */
const globMatcher = (pattern: string) => {
  let glob = pattern;
  if (!glob.startsWith('**/')) glob = `**/${glob}`;
  return (file: string) => minimatch(file, glob, { nocase: true, dot: true });
};

/**
 * The settings a config's default export sets, each by its key: the object
 * it exports, as written or passed alone to `defineConfig`. None when the
 * config does not parse, exports anything else, or sets a key the reader
 * cannot name (a spread, a computed key), which could set any setting.
 */
const settingsOf = (file: string, text: string): Option.Option<ReadonlyMap<string, Expression>> => {
  const parsed = parseSync(file, text);
  if (parsed.errors.length > 0) return Option.none();
  const exported = parsed.program.body.flatMap((node) => {
    if (node.type !== 'ExportDefaultDeclaration') return [];
    return [node.declaration];
  });
  const [declaration, ...more] = exported;
  if (more.length > 0) return Option.none();
  return Option.flatMap(Option.fromUndefinedOr(declaration), (node) => {
    let object = Option.none<ObjectExpression>();
    if (node.type === 'ObjectExpression') object = Option.some(node);
    if (
      node.type === 'CallExpression' &&
      node.callee.type === 'Identifier' &&
      node.callee.name === 'defineConfig' &&
      node.arguments.length === 1
    )
      Option.map(Option.fromUndefinedOr(node.arguments[0]), (argument) => {
        if (argument.type === 'ObjectExpression') object = Option.some(argument);
      });
    return Option.flatMap(object, (config) => {
      const settings = new Map<string, Expression>();
      for (const property of config.properties) {
        if (property.type === 'SpreadElement' || property.computed) return Option.none();
        if (property.key.type === 'Identifier') settings.set(property.key.name, property.value);
        else if (property.key.type === 'Literal')
          settings.set(String(property.key.value), property.value);
        else return Option.none();
      }
      return Option.some(settings);
    });
  });
};

/** A setting's string: none when it is set as anything but a string literal. */
const stringOf = (value: Expression): Option.Option<string> => {
  if (value.type !== 'Literal' || !Predicate.isString(value.value)) return Option.none();
  return Option.some(value.value);
};

/** A setting's boolean: none when it is set as anything but `true` or `false`. */
const booleanOf = (value: Expression): Option.Option<boolean> => {
  if (value.type !== 'Literal' || !Predicate.isBoolean(value.value)) return Option.none();
  return Option.some(value.value);
};

/**
 * A `testMatch` or `testIgnore` setting as a test of a file's absolute
 * path, as playwright tests it: a regex literal as written, a string
 * literal by `globMatcher`, `absent` when the config sets none; none when it
 * sets it some other way (a list, a name), which this does not read.
 */
const patternOf = (
  settings: ReadonlyMap<string, Expression>,
  key: string,
  absent: (file: string) => boolean,
): Option.Option<(file: string) => boolean> =>
  Option.match(Option.fromUndefinedOr(settings.get(key)), {
    onNone: () => Option.some(absent),
    onSome: (value) => {
      if (value.type === 'Literal' && 'regex' in value) {
        const match = new RegExp(value.regex.pattern, value.regex.flags);
        return Option.some((file: string) => match.test(file));
      }
      return Option.map(stringOf(value), globMatcher);
    },
  });

/** A line of a `.gitignore` as playwright reads it, and the folder it is read in. */
interface IgnoreRule {
  readonly dir: string;
  readonly rule: Minimatch;
}

/** The rules of a `.gitignore` read in `dir`: each line but blanks and comments, by minimatch as playwright reads it. */
const rulesOf = (dir: string, text: string): ReadonlyArray<IgnoreRule> =>
  text.split(/\r?\n/).flatMap((line) => {
    const pattern = line.trim();
    if (pattern === '') return [];
    const rule = new Minimatch(pattern, { matchBase: true, dot: true, flipNegate: true });
    if (rule.comment) return [];
    return [{ dir, rule }];
  });

/** Where an entry stands as playwright walks its folders. */
type Standing = 'included' | 'ignored' | 'ignored-but-recurse';

/** `path`, from `base`, with `/` between its parts: the path itself from the workspace's own folder. */
const fromDir = (base: string, path: string) => {
  if (base === '') return path;
  return path.slice(base.length + 1);
};

/**
 * Where `entry` stands under `rules`, from where its folder stands, as
 * playwright's `collectFiles` reads it: each rule in turn, a negated one
 * taking back what an earlier one ignored.
 */
const standingOf = (
  entry: string,
  rules: ReadonlyArray<IgnoreRule>,
  isDirectory: boolean,
  parent: Standing,
): Standing => {
  let standing = parent;
  for (const { dir, rule } of rules) {
    const includes = rule.negate;
    if ((standing === 'included') === includes) continue;
    /** What a rule that matches sets: a negated one includes, any other ignores. */
    let matched: Standing = 'ignored';
    if (includes) matched = 'included';
    const relative = fromDir(dir, entry);
    if (rule.match(`/${relative}`) || rule.match(relative)) {
      standing = matched;
    } else if (isDirectory && (rule.match(`/${relative}/`) || rule.match(`${relative}/`))) {
      standing = matched;
    } else if (
      isDirectory &&
      includes &&
      (rule.match(`/${relative}`, true) || rule.match(relative, true))
    ) {
      standing = 'ignored-but-recurse';
    }
  }
  return standing;
};

/**
 * Whether playwright's walk of `testDir` (from the workspace) finds `path`:
 * it enters no `node_modules` folder, and where it respects git's ignore
 * rules it reads each `.gitignore` from `testDir` down as it walks (none
 * above it), entering no folder they ignore and finding no file they do
 * not include.
 */
const walked = (
  testDir: string,
  path: string,
  respectsGit: boolean,
  gitignores: Readonly<Record<string, string>>,
) => {
  const parts = fromDir(testDir, path).split('/');
  const rulesIn = (dir: string) => {
    if (!respectsGit) return [];
    return Option.match(Option.fromUndefinedOr(gitignores[dir]), {
      onNone: () => [],
      onSome: (text) => rulesOf(dir, text),
    });
  };
  let dir = testDir;
  let rules = rulesIn(dir);
  let standing: Standing = 'included';
  for (const [at, part] of parts.entries()) {
    const entry = [dir, part].filter((piece) => piece !== '').join('/');
    const isDirectory = at < parts.length - 1;
    if (isDirectory && part === 'node_modules') return false;
    standing = standingOf(entry, rules, isDirectory, standing);
    if (!isDirectory) return standing === 'included';
    if (standing === 'ignored') return false;
    dir = entry;
    rules = [...rules, ...rulesIn(dir)];
  }
  return false;
};

/**
 * The files `playwright test` takes with `words` (the command's words past
 * `test`) in the workspace at `absolute`, its configs by their path from
 * it: those under the config's `testDir` (from the config's folder; the
 * folder itself when it sets none) whose absolute path its `testMatch`
 * takes and its `testIgnore` does not, and one of the command's filters
 * (each a regex of that path) when it names any. None when the config is
 * missing or sets its files in a way this does not read.
 */
const playwrightRun = (
  words: ReadonlyArray<string>,
  workspace: Pick<Workspace, 'configs' | 'absolute' | 'gitignores'>,
): Run => {
  const { configs, absolute, gitignores } = workspace;
  const read = argumentsOf(words, PLAYWRIGHT_FLAGS);
  const filters = Option.match(read, { onNone: () => [], onSome: (a) => a.positionals });
  // The last `--config` or `-c` names the config; one given by a path this
  // does not read (absolute, or out of the workspace) takes none, never the
  // default config.
  const file = Option.flatMap(read, ({ given }) =>
    Option.match(Option.fromUndefinedOr(valuesOf(given, ['--config', '-c']).at(-1)), {
      onNone: () => Option.fromUndefinedOr(PLAYWRIGHT_CONFIGS.find((name) => name in configs)),
      onSome: pathOf,
    }),
  );
  const takes = Option.flatMap(file, (at) =>
    Option.flatMap(Option.fromUndefinedOr(configs[at]), (text) =>
      Option.flatMap(settingsOf(at, text), (settings) => {
        if ([...settings.keys()].some((key) => !PLAYWRIGHT_SETTINGS.has(key))) return Option.none();
        const folder = at.split('/').slice(0, -1);
        const dir = Option.match(Option.fromUndefinedOr(settings.get('testDir')), {
          onNone: () => Option.some('.'),
          onSome: stringOf,
        });
        // Playwright skips what git ignores when the config says so, and by
        // default when it sets neither `testDir` nor `respectGitIgnore`.
        const gitPolicy = Option.match(Option.fromUndefinedOr(settings.get('respectGitIgnore')), {
          onNone: () => Option.some(!settings.has('testDir')),
          onSome: booleanOf,
        });
        return Option.flatMap(Option.all([dir, gitPolicy]), ([dir, respectsGit]) =>
          Option.flatMap(pathOf([...folder, dir].join('/')), (root) =>
            Option.map(
              Option.all([
                patternOf(settings, 'testMatch', globMatcher(PLAYWRIGHT_MATCH)),
                patternOf(settings, 'testIgnore', () => false),
              ]),
              ([matches, ignored]) =>
                (path: string) => {
                  const under = root === '' || path.startsWith(`${root}/`);
                  const file = `${absolute}/${path}`;
                  const named =
                    filters.length === 0 || filters.some((f) => new RegExp(f).test(file));
                  return (
                    under &&
                    walked(root, path, respectsGit, gitignores) &&
                    matches(file) &&
                    !ignored(file) &&
                    named
                  );
                },
            ),
          ),
        );
      }),
    ),
  );
  return {
    kind: 'playwright',
    takes: Option.getOrElse(takes, () => () => false),
  };
};

/** A command's words from its program on, a package runner (`bunx`, `npx`) before it gone. */
const programWords = (words: ReadonlyArray<string>) => {
  if (words[0] === 'bunx' || words[0] === 'npx') return words.slice(1);
  return words;
};

/** The commands that move the shell to another folder for the commands after them. */
const MOVES = new Set(['cd', 'pushd', 'popd']);

/**
 * Whether a command runs in another folder than its workspace's, or moves
 * the script there: a word that is `cd`, `pushd` or `popd`, a word that opens
 * a subshell (`(`), or a flag that names a folder to run in (`--cwd`,
 * `--chdir`, `-C`), any program's.
 */
const movesFolder = (words: ReadonlyArray<string>) =>
  words.some(
    (word) => MOVES.has(word) || word.startsWith('(') || /^(?:--cwd|--chdir|-C)(?:=|$)/.test(word),
  );

/**
 * What the script `name` of a workspace runs: each `bun test`, each
 * wrapper of it (`wrappers`, read as `bun test` with the words it is
 * given), each `playwright test`, and the scripts it runs with `bun run`
 * followed, each in a shell of its own; any other command runs nothing this
 * credits. It runs nothing this can read when its commands are joined by
 * anything but `&&` (`andChained`: one may not run, or fail unseen), when
 * one sets a variable or changes the shell (`changesShell`: it may hand a
 * program flags), when one runs in another folder (`movesFolder`,
 * wherever it stands: the reader reads every path from the workspace's
 * folder), or when it hands a script it runs more words.
 */
const runsOf = (
  workspace: Pick<
    Workspace,
    'scripts' | 'configs' | 'absolute' | 'gitignores' | 'bunfig' | 'wrappers'
  >,
  name: string,
  seen: ReadonlySet<string> = new Set(),
): ReadonlyArray<Run> => {
  const { scripts, configs, absolute, gitignores } = workspace;
  if (seen.has(name)) return [];
  const script = Option.fromUndefinedOr(scripts[name]);
  if (Option.isNone(script)) return [];
  const within = new Set([...seen, name]);
  const commands = commandsOf(script.value);
  if (!andChained(script.value) || changesShell(script.value) || commands.some(movesFolder))
    return [];
  return commands.flatMap((command): ReadonlyArray<Run> => {
    const words = programWords(command);
    if (words[0] === 'playwright' && words[1] === 'test')
      return [playwrightRun(words.slice(2), { configs, absolute, gitignores })];
    if (words[0] !== 'bun') return [];
    const at = subcommandAt(words);
    const sub = words[at] ?? '';
    const next = words[at + 1] ?? '';
    // Bun reads the workspace's bunfig, and its own flags before its subcommand, for any file it runs.
    if (Option.isNone(argumentsOf(words.slice(1, at), BUN_FLAGS))) return [];
    if (sub === 'run' && Option.isSome(Option.fromUndefinedOr(scripts[next]))) {
      // Bun hands the words after the script's name to its last command, which this does not read.
      if (words.length > at + 2) return [];
      return runsOf(workspace, next, within);
    }
    if (bunfigNarrows(workspace.bunfig)) return [];
    if (sub === 'test' || workspace.wrappers.includes(Option.getOrElse(pathOf(sub), () => '')))
      return bunTestOf([...words.slice(1, at), ...words.slice(at + 1)]);
    return [];
  });
};

/**
 * The script of a workspace's `scripts` that reaches `file` (its path from the
 * workspace): `test` when the gate's runs it, else the first `test:*` run by
 * hand that names it; none when no script does.
 */
const reachOf = (workspace: Workspace, file: string): Option.Option<string> => {
  if (runsOf(workspace, 'test').some((run) => run.kind === 'bunTest' && runsFile(run, file)))
    return Option.some('test');
  return Option.fromUndefinedOr(
    Object.keys(workspace.scripts)
      .filter((name) => name.startsWith('test:'))
      .find((name) => runsOf(workspace, name).some((run) => runsFile(run, file))),
  );
};

/** A workspace: its folder from the repo root and its absolute path, its package scripts, and its playwright configs' texts by their paths from it. */
interface Workspace {
  readonly dir: string;
  readonly absolute: string;
  readonly scripts: Readonly<Record<string, string>>;
  readonly configs: Readonly<Record<string, string>>;
  /** The text of each `.gitignore` of the workspace, by its folder's path from it (`''` its own). */
  readonly gitignores: Readonly<Record<string, string>>;
  /** The text of the workspace's `bunfig.toml`, `''` when it has none (both set nothing). */
  readonly bunfig: string;
  /** The wrappers of `bun test` in the workspace (`BUN_TEST_WRAPPERS`), by their paths from it. */
  readonly wrappers: ReadonlyArray<string>;
}

/**
 * The repo's wrappers of `bun test`, by their paths from the root: each runs
 * `bun test` in its workspace with the words it is given (the film's E2E
 * runner sets `--parallel`'s count and its fixtures' folder, nothing else),
 * so `bun <wrapper> <words>` takes what `bun test <words>` takes.
 * `reach.test.ts` holds each to a file of the repo that spawns `bun test`.
 */
const BUN_TEST_WRAPPERS = ['packages/film/src/lab/fixtures/run-suite.ts'];

/** A file of the repo: its path from the root, and its text. */
interface Source {
  readonly file: string;
  readonly text: string;
}

/**
 * How each test file of `files` is reached: each file named as a test that
 * is not data (`isData`), with the script of the deepest workspace that holds
 * it that reaches it (`test`, `test:e2e`); none when no script does, or no
 * workspace holds it (no workspace's script runs it).
 */
export const reachesIn = (
  workspaces: ReadonlyArray<Workspace>,
  files: ReadonlyArray<Source>,
): ReadonlyArray<{ readonly file: string; readonly by: Option.Option<string> }> =>
  files
    .filter(({ file, text }) => isTestFile(file) && !isData(file, text))
    .map(({ file }) => ({
      file,
      by: Option.flatMap(
        Option.fromUndefinedOr(
          workspaces
            .filter(({ dir }) => file.startsWith(`${dir}/`))
            .toSorted((a, b) => b.dir.length - a.dir.length)[0],
        ),
        (workspace) => reachOf(workspace, file.slice(workspace.dir.length + 1)),
      ),
    }));

/**
 * The texts of the playwright configs a workspace's scripts can read, by
 * their paths from it: each a `playwright test` names by `--config`, and
 * playwright's own names in the workspace's folder, those `read` finds.
 */
const playwrightConfigs = <E, R>(
  dir: string,
  scripts: Readonly<Record<string, string>>,
  read: (file: string) => Effect.Effect<Option.Option<string>, E, R>,
) => {
  const named = Object.values(scripts).flatMap((script) =>
    commandsOf(script)
      .map(programWords)
      .filter((words) => words[0] === 'playwright')
      .flatMap((words) =>
        words.flatMap((word, at) => {
          const [name = '', inline] = word.split(/=(.*)/s);
          if (name !== '--config' && name !== '-c') return [];
          return Option.toArray(
            Option.flatMap(
              Option.orElse(Option.fromUndefinedOr(inline), () =>
                Option.fromUndefinedOr(words[at + 1]),
              ),
              pathOf,
            ),
          );
        }),
      ),
  );
  return Effect.map(
    Effect.forEach([...new Set([...named, ...PLAYWRIGHT_CONFIGS])], (file) =>
      Effect.map(read(file), (text) => Option.map(text, (t) => [file, t] as const)),
    ),
    (found) => Object.fromEntries(found.flatMap(Option.toArray)),
  );
};

const RootManifest = Schema.fromJsonString(
  Schema.Struct({ workspaces: Schema.optionalKey(Schema.Array(Schema.String)) }),
);
const Manifest = Schema.fromJsonString(
  Schema.Struct({ scripts: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)) }),
);

/**
 * The repo at `root`'s workspaces (each folder the root's `workspaces` globs
 * name with a `package.json`) and its test files, each the gate reads
 * (`guard/files.ts`) named as a test, with its text.
 */
export const repoTests = Effect.fn('reach.repoTests')(function* (root: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const read = (file: string) => fs.readFileString(path.join(root, file));
  const { workspaces: globs = [] } = yield* Schema.decodeEffect(RootManifest)(
    yield* read('package.json'),
  );
  const named = globs.map((glob) => new Glob(`${glob.replace(/\/+$/, '')}/package.json`));
  const files = yield* gateFiles(root);
  const workspaces = yield* Effect.forEach(
    files.filter((file) => named.some((glob) => glob.match(file))),
    (manifest) =>
      Effect.gen(function* () {
        const { scripts = {} } = yield* Effect.flatMap(
          read(manifest),
          Schema.decodeEffect(Manifest),
        );
        const dir = path.dirname(manifest);
        const configs = yield* playwrightConfigs(dir, scripts, (file) =>
          Effect.option(read(path.join(dir, file))),
        );
        const gitignores = Object.fromEntries(
          yield* Effect.forEach(
            files.filter((file) => file.startsWith(`${dir}/`) && file.endsWith('/.gitignore')),
            (file) =>
              Effect.map(read(file), (text) => [
                path.dirname(file.slice(dir.length + 1)).replace(/^\.$/, ''),
                text,
              ]),
          ),
        );
        const bunfig = Option.getOrElse(
          yield* Effect.option(read(path.join(dir, 'bunfig.toml'))),
          () => '',
        );
        const wrappers = BUN_TEST_WRAPPERS.filter((file) => file.startsWith(`${dir}/`)).map(
          (file) => file.slice(dir.length + 1),
        );
        return {
          dir,
          absolute: path.join(root, dir),
          scripts,
          configs,
          gitignores,
          bunfig,
          wrappers,
        } satisfies Workspace;
      }),
    { concurrency: 16 },
  );
  const tests = yield* Effect.forEach(
    files.filter(isTestFile),
    (file) => Effect.map(read(file), (text): Source => ({ file, text })),
    { concurrency: 16 },
  );
  return { workspaces, tests };
});
