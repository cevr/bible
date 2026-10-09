// The workspace the dead-export check reads: every TypeScript file of the
// packages and apps, how a specifier (a relative path, `@bible/film/canvas`)
// points at one of them, which files something outside the module graph runs
// (the roots: apps, bins, scripts a `package.json` runs), and which are tests
// or their support (which use an export for real no more than its own file
// does).

import { Array as Arr, Effect, FileSystem, Option, Path, Schema } from 'effect';
import { type ModuleRecord, type Resolve, type Workspace, recordOf } from './graph.js';

/** A package's name and the files its `exports`, `main` and `bin` name. */
const PackageJson = Schema.fromJsonString(
  Schema.Struct({
    name: Schema.optionalKey(Schema.String),
    main: Schema.optionalKey(Schema.String),
    bin: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
    exports: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
    scripts: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
  }),
);

/** A package: its directory, its name, and its entry files by the specifier that names them. */
interface Package {
  readonly dir: string;
  readonly name: Option.Option<string>;
  /** `.`, `./canvas`, `main` or `bin:bible` → the file, relative to the root. */
  readonly entries: ReadonlyMap<string, string>;
  /** The TypeScript files its `bin` and `scripts` run, relative to the root. */
  readonly runs: ReadonlyArray<string>;
  /** Where `~/` points inside the package, from its tsconfig `paths` (`~/*` → `./app/*`): `packages/cli/`. */
  readonly home: Option.Option<string>;
}

/** A type-level check (`x.types.ts`): it uses the types it pins, and its own names are read by the compiler. */
const isTypeCheck = (file: string) => file.endsWith('.types.ts');

/** A test, a fixture or its support: code that runs to prove, not to ship. */
const isTestCode = (file: string) =>
  /\.(test|spec)\.tsx?$/.test(file) ||
  /(^|\/)testing\.tsx?$/.test(file) ||
  /-fixture\.tsx?$/.test(file) ||
  /\/(fixtures|e2e|__tests__)\//.test(file) ||
  /^packages\/[^/]+\/lint\//.test(file);

/** Whether `file` is a module the check reads: TypeScript, and not a dependency or build output. */
const isSource = (file: string) =>
  /\.tsx?$/.test(file) && !/(^|\/)(node_modules|out|dist|\.deploy|\.alchemy|\.turbo)\//.test(file);

/** The extensions a specifier may leave off, or write as `.js` for a `.ts` file. */
const candidates = (base: string): ReadonlyArray<string> => [
  base,
  base.replace(/\.js$/, '.ts'),
  base.replace(/\.js$/, '.tsx'),
  `${base}.ts`,
  `${base}.tsx`,
  `${base}/index.ts`,
  `${base}/index.tsx`,
];

/** A package specifier: its name (`@bible/film`, `effect`) and the entry after it (`/canvas`). */
const SPECIFIER = /^(@[^/]+\/[^/]+|[^/@][^/]*)(\/.*)?$/;

/** A tsconfig's `"~/*": ["./app/*"]`: the directory `~/` stands for, captured as `app/`. */
const TILDE = /"~\/\*"\s*:\s*\[\s*"\.\/([^"*]*)\*"/;

/** A script command that runs a TypeScript file: `bun src/x.ts`, `bun run --cwd . src/x.ts`. */
const RUNS_FILE = /(?:^|[\s;&|(])(?:bun|node|tsx)\s+(?:(?:run|--\S+)\s+)*(\S+\.tsx?)(?=\s|$)/g;

/** Package files that run without an importer or a script naming them, by what runs them. */
const RUN_BY_NAME: ReadonlyMap<string, string> = new Map([
  [
    'packages/cli/src/main.ts',
    'the entry packages/cli/scripts/build.ts compiles into the bible bin',
  ],
  [
    'packages/film/src/tools/page-render-worker.ts',
    'the Worker packages/film/src/tools/page-render.ts spawns',
  ],
]);

/** The `package.json` of directory `dir`, read: none for a directory that is no package. */
const readPackage = (root: string, dir: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const text = yield* Effect.option(fs.readFileString(path.join(root, dir, 'package.json')));
    const json = Option.flatMap(text, Schema.decodeUnknownOption(PackageJson));
    const tsconfig = yield* Effect.option(fs.readFileString(path.join(root, dir, 'tsconfig.json')));
    const home = Option.flatMap(tsconfig, (config) =>
      Option.flatMap(Option.fromNullishOr(TILDE.exec(config)), (m) =>
        Option.map(Option.fromNullishOr(m[1]), (to) => path.join(dir, to)),
      ),
    );
    return Option.map(json, (pkg): Package => {
      const named = [
        ...Object.entries(Option.getOrElse(Option.fromUndefinedOr(pkg.exports), () => ({}))),
        ...Option.toArray(
          Option.map(Option.fromUndefinedOr(pkg.main), (m) => ['main', m] as const),
        ),
        ...Object.values(Option.getOrElse(Option.fromUndefinedOr(pkg.bin), () => ({}))).map(
          (file) => [`bin:${file}`, file] as const,
        ),
      ];
      const commands = Object.values(
        Option.getOrElse(Option.fromUndefinedOr(pkg.scripts), () => ({})),
      );
      const scripted = commands.flatMap((command) =>
        [...command.matchAll(RUNS_FILE)].flatMap((m) => Option.toArray(Option.fromNullishOr(m[1]))),
      );
      const bins = Object.values(Option.getOrElse(Option.fromUndefinedOr(pkg.bin), () => ({})));
      return {
        dir,
        home,
        runs: [...scripted, ...bins].map((file) => path.join(dir, file)),
        name: Option.fromUndefinedOr(pkg.name),
        entries: new Map(named.map(([key, file]) => [key, path.join(dir, file)])),
      };
    });
  });

/** Every module under `dir`, as `dir/relative/path`, with the parser's reading of it. */
const readModules = (root: string, dir: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const found = yield* Effect.orElseSucceed(
      fs.readDirectory(path.join(root, dir), { recursive: true }),
      () => [],
    );
    return yield* Effect.forEach(found.map((file) => `${dir}/${file}`).filter(isSource), (file) =>
      Effect.map(
        fs.readFileString(path.join(root, file)),
        (text) => [file, recordOf(file, text)] as const,
      ),
    );
  });

/** The directories of a group (`packages`, `apps`): `packages/film`, … */
const groupDirs = (root: string, group: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const names = yield* Effect.orElseSucceed(fs.readDirectory(path.join(root, group)), () => []);
    return names.map((name) => `${group}/${name}`);
  });

/**
 * How `from`, written in `user`, points at a module of the workspace: a
 * relative path, or a package's specifier through the entries its
 * `package.json` names; none for a dependency.
 */
const resolver =
  (
    path: Path.Path,
    records: ReadonlyMap<string, ModuleRecord>,
    packages: ReadonlyMap<string, Package>,
    byDir: ReadonlyMap<string, Package>,
  ): Resolve =>
  (user, from) => {
    const exists = (base: string) => Arr.findFirst(candidates(base), (c) => records.has(c));
    if (from.startsWith('.')) return exists(path.join(path.dirname(user), from));
    if (from.startsWith('~/'))
      return Option.flatMap(
        Option.flatMap(
          Option.fromUndefinedOr(byDir.get(user.split('/').slice(0, 2).join('/'))),
          (p) => p.home,
        ),
        (home) => exists(path.join(home, from.slice(2))),
      );
    const named = Option.fromNullishOr(SPECIFIER.exec(from));
    const packageName = Option.flatMap(named, (m) => Option.fromNullishOr(m[1]));
    const entry = `.${Option.getOrElse(
      Option.flatMap(named, (m) => Option.fromNullishOr(m[2])),
      () => '',
    )}`;
    return Option.flatMap(
      Option.flatMap(
        Option.flatMap(packageName, (name) => Option.fromUndefinedOr(packages.get(name))),
        (pkg) => Option.fromUndefinedOr(pkg.entries.get(entry)),
      ),
      exists,
    );
  };

/** The workspace under `root`: its files read, its packages' entries and specifiers known. */
export const readWorkspace = (root: string) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const dirs = [...(yield* groupDirs(root, 'packages')), ...(yield* groupDirs(root, 'apps'))];
    const records = new Map<string, ModuleRecord>(
      (yield* Effect.forEach(dirs, (dir) => readModules(root, dir))).flat(),
    );
    const packages = new Map<string, Package>();
    const byDir = new Map<string, Package>();
    const runs = new Set<string>(RUN_BY_NAME.keys());
    for (const dir of [...dirs, '.']) {
      const pkg = yield* readPackage(root, dir);
      for (const found of Option.toArray(pkg)) {
        byDir.set(dir, found);
        for (const name of Option.toArray(found.name)) packages.set(name, found);
        for (const file of found.runs) runs.add(file);
      }
    }
    // What runs without an importer: all that is not package source (an app, a
    // package's scripts and tests) and the files a bin or a script runs.
    const roots = new Set(
      [...records.keys()].filter((file) => !/^packages\/[^/]+\/src\//.test(file) || runs.has(file)),
    );
    for (const file of runs) roots.add(file);
    const workspace: Workspace = {
      records,
      resolve: resolver(path, records, packages, byDir),
      consumes: (file) => !isTestCode(file) && !isTypeCheck(file),
      checked: (file) =>
        /^packages\/[^/]+\/src\//.test(file) && !isTestCode(file) && !isTypeCheck(file),
      roots,
    };
    return workspace;
  });
