// Every test file of a workspace runs: its `test` script (the one the gate
// runs, through turbo) takes it, or a script of its own run by hand
// (`test:e2e`, `test:browser`) names it. A test file no script reaches
// passes the gate without ever running, and lets its workspace fit the
// budget by running less: `test:budget` measures no workspace that leaves
// one out, and `reach.test.ts` holds every workspace of the repo to it.
//
// A `bun test` command takes a file as bun does: with no filter, every file
// named as a test (`*.test.ts`, `*_test.ts`, `*.spec.ts`, `*_spec.ts`, in
// any of bun's script extensions); a filter that starts with `./` names a
// file or a folder by its path from the workspace; any other filter takes
// each test file whose path holds it; `--path-ignore-patterns` takes none
// its globs match. `bun run <script>` runs that script of the workspace.
// `playwright test` takes a file as its config sets it (`playwrightRun`):
// under the config's `testDir`, its absolute path matched by its
// `testMatch` and not by its `testIgnore`, each read as playwright's file
// matcher reads it (a regex as written, a glob by `globMatcher`), and by one
// of the command's filters when it names any; a config the reader cannot
// read (none, a `testDir`, `testMatch` or `testIgnore` named as anything but
// a literal, `projects`) takes none. A by-hand script's other commands (a
// wrapper of `bun test`) reach a file only by naming it, or a folder that
// holds it, by its path. A file named as a test that registers none
// (`holdsTests`) needs no script.

import { Glob } from 'bun';
import { Effect, FileSystem, Option, Path, Schema } from 'effect';
import { minimatch } from 'minimatch';
import { gateFiles } from '../guard/files.ts';
import { commandsOf } from './shell.ts';

/** Whether bun's runner takes a file for a test by its name. */
const isTestFile = (file: string) => /(?:\.test|_test|\.spec|_spec)\.[cm]?[jt]sx?$/.test(file);

/**
 * Whether a file's text registers tests: it imports a test runner (`bun:test`,
 * `effect-bun-test`, playwright's, vitest), or a line opens with a call of
 * bun's global `describe`, `it` or `test`. A file named as a test that does
 * neither (a study's `*.spec.js` that the CLI reads) holds none to run.
 */
const holdsTests = (text: string) =>
  /from\s+['"](?:bun:test|effect-bun-test|@playwright\/test|vitest)['"]/.test(text) ||
  /^\s*(?:describe|it|test)(?:\.\w+)*\s*\(/m.test(text);

/** The flags of `bun test` (and of bun itself) that take the next word as their value. */
const VALUED = new Set([
  '--timeout',
  '--rerun-each',
  '--preload',
  '-r',
  '--test-name-pattern',
  '-t',
  '--coverage-reporter',
  '--coverage-dir',
  '--reporter',
  '--reporter-outfile',
  '--path-ignore-patterns',
  '--max-concurrency',
  '--seed',
  '--conditions',
  '--define',
  '-d',
  '--loader',
  '-l',
  '--tsconfig-override',
  '--config',
  '-c',
  '--env-file',
  '--timings',
]);

/** Where bun's subcommand stands in a `bun` command (`test`, `run`, a file): past bun's own flags and their values. */
const subcommandAt = (words: ReadonlyArray<string>) => {
  let at = 1;
  while ((words[at] ?? '').startsWith('-')) {
    const word = words[at] ?? '';
    const valued = !word.includes('=') && VALUED.has(word);
    at += 1;
    if (valued && !(words[at] ?? '-').startsWith('-')) at += 1;
  }
  return at;
};

/**
 * What a command runs: the words that name files and the globs it leaves
 * out (`bun test`, which takes every test file when it names none, or
 * another command, which takes what it names by path), or the files
 * playwright's config takes.
 */
type Run =
  | {
      readonly kind: 'bunTest' | 'named';
      readonly filters: ReadonlyArray<string>;
      readonly ignores: ReadonlyArray<string>;
    }
  | { readonly kind: 'playwright'; readonly takes: (file: string) => boolean };

/** A command's arguments read as `bun test` reads them: its filters, and its ignore patterns. */
const runOf = (kind: 'bunTest' | 'named', words: ReadonlyArray<string>): Run => {
  const filters: Array<string> = [];
  const ignores: Array<string> = [];
  for (let at = 0; at < words.length; at++) {
    const word = words[at] ?? '';
    if (!word.startsWith('-')) {
      filters.push(word);
      continue;
    }
    const [name = '', inline] = word.split(/=(.*)/s);
    const value = Option.fromUndefinedOr(inline).pipe(
      Option.orElse(() => {
        const next = words[at + 1] ?? '-';
        if (!VALUED.has(name) || next.startsWith('-')) return Option.none<string>();
        at++;
        return Option.some(next);
      }),
    );
    if (name === '--path-ignore-patterns') ignores.push(...Option.toArray(value));
  }
  return { kind, filters, ignores };
};

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
  const bunTest = run.kind === 'bunTest';
  if (bunTest && run.filters.length === 0) return named;
  return run.filters.some((filter) => {
    const asPath = Option.liftPredicate(filter, (f) => !bunTest || f.startsWith('./'));
    return Option.match(Option.flatMap(asPath, pathOf), {
      onNone: () => bunTest && named && file.includes(filter),
      // `./` is the workspace itself: every file named as a test under it.
      onSome: (at) => (at === '' && named) || file === at || (named && file.startsWith(`${at}/`)),
    });
  });
};

/** The flags of `playwright test` that take the next word as their value. */
const PLAYWRIGHT_VALUED = new Set([
  '--config',
  '-c',
  '--project',
  '--grep',
  '-g',
  '--grep-invert',
  '--workers',
  '-j',
  '--reporter',
  '--timeout',
  '--retries',
  '--repeat-each',
  '--max-failures',
  '--output',
  '--shard',
  '--global-timeout',
  '--trace',
  '--tsconfig',
]);

/** The names playwright looks for its config under, in the folder it runs in, when no `--config` names one. */
const PLAYWRIGHT_CONFIGS = ['ts', 'js', 'mts', 'mjs', 'cts', 'cjs'].map(
  (ext) => `playwright.config.${ext}`,
);

/** Playwright's own `testMatch` when its config sets none. */
const PLAYWRIGHT_MATCH = '**/*.@(spec|test).?(c|m)[jt]s?(x)';

/** Where a config sets `key`: the key, bare or quoted, and its colon. */
const keyAt = (key: string) => `\\b${key}['"]?\\s*:\\s*`;

/**
 * A config's `key`: none when the config names it anywhere but as a quoted
 * string (a list, a variable, a key in shorthand), else the string, or none
 * inside when the config does not name it.
 */
const literalOf = (text: string, key: string): Option.Option<Option.Option<string>> => {
  if (!new RegExp(`\\b${key}\\b`).test(text)) return Option.some(Option.none());
  return Option.map(
    Option.fromNullishOr(new RegExp(`${keyAt(key)}(['"])([^'"\n]*)\\1`).exec(text)),
    (m) => Option.some(m[2] ?? ''),
  );
};

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
 * A config's `key` (`testMatch`, `testIgnore`) as a test of a file's
 * absolute path, as playwright tests it: a regex literal or a quoted
 * glob, `absent` when the config sets none; none when it sets it some other
 * way (a list, a name), which this does not read.
 */
const patternOf = (
  text: string,
  key: string,
  absent: (file: string) => boolean,
): Option.Option<(file: string) => boolean> =>
  Option.match(
    Option.fromNullishOr(
      new RegExp(`${keyAt(key)}\\/((?:\\\\.|[^/\\\\\\n])+)\\/([a-z]*)`).exec(text),
    ),
    {
      onSome: (regex) => {
        const match = new RegExp(regex[1] ?? '', regex[2]);
        return Option.some((file: string) => match.test(file));
      },
      onNone: () =>
        Option.map(literalOf(text, key), (glob) =>
          Option.match(glob, { onNone: () => absent, onSome: globMatcher }),
        ),
    },
  );

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
  configs: Readonly<Record<string, string>>,
  absolute: string,
): Run => {
  const filters: Array<string> = [];
  let config = Option.none<string>();
  for (let at = 0; at < words.length; at++) {
    const word = words[at] ?? '';
    if (!word.startsWith('-')) {
      filters.push(word);
      continue;
    }
    const [name = '', inline] = word.split(/=(.*)/s);
    const value = Option.fromUndefinedOr(inline).pipe(
      Option.orElse(() => {
        const next = words[at + 1] ?? '-';
        if (!PLAYWRIGHT_VALUED.has(name) || next.startsWith('-')) return Option.none<string>();
        at++;
        return Option.some(next);
      }),
    );
    if (name === '--config' || name === '-c') config = Option.flatMap(value, pathOf);
  }
  const file = Option.orElse(config, () =>
    Option.fromUndefinedOr(PLAYWRIGHT_CONFIGS.find((name) => name in configs)),
  );
  const takes = Option.flatMap(file, (at) =>
    Option.flatMap(Option.fromUndefinedOr(configs[at]), (text) => {
      if (/\bprojects\b/.test(text)) return Option.none();
      const folder = at.split('/').slice(0, -1);
      return Option.flatMap(literalOf(text, 'testDir'), (dir) =>
        Option.flatMap(pathOf([...folder, Option.getOrElse(dir, () => '.')].join('/')), (root) =>
          Option.map(
            Option.all([
              patternOf(text, 'testMatch', globMatcher(PLAYWRIGHT_MATCH)),
              patternOf(text, 'testIgnore', () => false),
            ]),
            ([matches, ignored]) =>
              (path: string) => {
                const under = root === '' || path.startsWith(`${root}/`);
                const file = `${absolute}/${path}`;
                const named = filters.length === 0 || filters.some((f) => new RegExp(f).test(file));
                return under && matches(file) && !ignored(file) && named;
              },
          ),
        ),
      );
    }),
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

/** What the script `name` of a workspace runs, the scripts it runs with `bun run` followed. */
const runsOf = (
  workspace: Pick<Workspace, 'scripts' | 'configs' | 'absolute'>,
  name: string,
  seen: ReadonlySet<string> = new Set(),
): ReadonlyArray<Run> => {
  const { scripts, configs, absolute } = workspace;
  if (seen.has(name)) return [];
  const script = Option.fromUndefinedOr(scripts[name]);
  if (Option.isNone(script)) return [];
  const within = new Set([...seen, name]);
  return commandsOf(script.value).flatMap((command): ReadonlyArray<Run> => {
    const words = programWords(command);
    if (words[0] === 'playwright' && words[1] === 'test')
      return [playwrightRun(words.slice(2), configs, absolute)];
    if (words[0] !== 'bun') return [runOf('named', words.slice(1))];
    const at = subcommandAt(words);
    const sub = words[at] ?? '';
    const next = words[at + 1] ?? '';
    if (sub === 'run' && Option.isSome(Option.fromUndefinedOr(scripts[next])))
      return runsOf(workspace, next, within);
    if (sub === 'test') return [runOf('bunTest', words.slice(at + 1))];
    return [runOf('named', words.slice(at))];
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
}

/** A file of the repo: its path from the root, and its text. */
interface Source {
  readonly file: string;
  readonly text: string;
}

/**
 * How each test file of `files` is reached: each file named as a test that
 * registers one, inside a workspace (the deepest that holds it), with the
 * script that reaches it (`test`, `test:e2e`), none when no script does.
 */
export const reachesIn = (
  workspaces: ReadonlyArray<Workspace>,
  files: ReadonlyArray<Source>,
): ReadonlyArray<{ readonly file: string; readonly by: Option.Option<string> }> =>
  files
    .filter(({ file, text }) => isTestFile(file) && holdsTests(text))
    .flatMap(({ file }) =>
      workspaces
        .filter(({ dir }) => file.startsWith(`${dir}/`))
        .toSorted((a, b) => b.dir.length - a.dir.length)
        .slice(0, 1)
        .map((workspace) => ({
          file,
          by: reachOf(workspace, file.slice(workspace.dir.length + 1)),
        })),
    );

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
        return { dir, absolute: path.join(root, dir), scripts, configs } satisfies Workspace;
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
