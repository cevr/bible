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
// A by-hand script's other commands (a wrapper of `bun test`, playwright)
// reach a file only by naming it, or a folder that holds it, by its path.
// A file named as a test that registers none (`holdsTests`) needs no script.

import { Glob } from 'bun';
import { Effect, FileSystem, Option, Path, Schema } from 'effect';
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

/** What a command runs: the words that name files, and the globs it leaves out. */
interface Run {
  /** Whether the command is `bun test`, which takes every test file when it names none. */
  readonly bunTest: boolean;
  readonly filters: ReadonlyArray<string>;
  readonly ignores: ReadonlyArray<string>;
}

/** A command's arguments read as `bun test` reads them: its filters, and its ignore patterns. */
const runOf = (bunTest: boolean, words: ReadonlyArray<string>): Run => {
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
  return { bunTest, filters, ignores };
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
  if (run.ignores.some((pattern) => new Glob(pattern).match(file))) return false;
  const named = isTestFile(file);
  if (run.bunTest && run.filters.length === 0) return named;
  return run.filters.some((filter) => {
    const asPath = Option.liftPredicate(filter, (f) => !run.bunTest || f.startsWith('./'));
    return Option.match(Option.flatMap(asPath, pathOf), {
      onNone: () => run.bunTest && named && file.includes(filter),
      onSome: (at) => file === at || (named && file.startsWith(`${at}/`)),
    });
  });
};

/** What the script `name` of a workspace's `scripts` runs, the scripts it runs with `bun run` followed. */
const runsOf = (
  scripts: Readonly<Record<string, string>>,
  name: string,
  seen: ReadonlySet<string> = new Set(),
): ReadonlyArray<Run> => {
  if (seen.has(name)) return [];
  const script = Option.fromUndefinedOr(scripts[name]);
  if (Option.isNone(script)) return [];
  const within = new Set([...seen, name]);
  return commandsOf(script.value).flatMap((words): ReadonlyArray<Run> => {
    if (words[0] !== 'bun') return [runOf(false, words.slice(1))];
    const at = subcommandAt(words);
    const sub = words[at] ?? '';
    const next = words[at + 1] ?? '';
    if (sub === 'run' && Option.isSome(Option.fromUndefinedOr(scripts[next])))
      return runsOf(scripts, next, within);
    if (sub === 'test') return [runOf(true, words.slice(at + 1))];
    return [runOf(false, words.slice(at))];
  });
};

/**
 * The script of a workspace's `scripts` that reaches `file` (its path from the
 * workspace): `test` when the gate's runs it, else the first `test:*` run by
 * hand that names it; none when no script does.
 */
const reachOf = (
  scripts: Readonly<Record<string, string>>,
  file: string,
): Option.Option<string> => {
  if (runsOf(scripts, 'test').some((run) => run.bunTest && runsFile(run, file)))
    return Option.some('test');
  return Option.fromUndefinedOr(
    Object.keys(scripts)
      .filter((name) => name.startsWith('test:'))
      .find((name) => runsOf(scripts, name).some((run) => runsFile(run, file))),
  );
};

/** A workspace: its folder from the repo root, and its package scripts. */
interface Workspace {
  readonly dir: string;
  readonly scripts: Readonly<Record<string, string>>;
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
        .map(({ dir, scripts }) => ({ file, by: reachOf(scripts, file.slice(dir.length + 1)) })),
    );

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
      Effect.map(
        Effect.flatMap(read(manifest), Schema.decodeEffect(Manifest)),
        ({ scripts = {} }): Workspace => ({ dir: path.dirname(manifest), scripts }),
      ),
    { concurrency: 16 },
  );
  const tests = yield* Effect.forEach(
    files.filter(isTestFile),
    (file) => Effect.map(read(file), (text): Source => ({ file, text })),
    { concurrency: 16 },
  );
  return { workspaces, tests };
});
