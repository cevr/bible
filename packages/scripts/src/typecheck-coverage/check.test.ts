import { describe, expect, it } from 'bun:test';
import { BunServices } from '@effect/platform-bun';
import { Effect, FileSystem, Match, Option, Schema, Stream } from 'effect';
import * as ChildProcess from 'effect/process/ChildProcess';
import { ChildProcessSpawner } from 'effect/process/ChildProcessSpawner';

import { check } from './check.js';
import { tscScript } from './tsc.js';

const encodeTsconfig = Schema.encodeEffect(
  Schema.fromJsonString(
    Schema.Struct({
      compilerOptions: Schema.Struct({
        noEmit: Schema.Boolean,
        skipLibCheck: Schema.Boolean,
        strict: Schema.Boolean,
        module: Schema.String,
        moduleResolution: Schema.String,
        types: Schema.Array(Schema.String),
      }),
      include: Schema.Array(Schema.String),
      files: Schema.optionalKey(Schema.Array(Schema.String)),
    }),
  ),
);

/** A package at `<temp dir>/pkg`, and what lies beside it. */
interface Fixture {
  /** The package's files, relative to it. */
  readonly files: Record<string, string>;
  /** Its tsconfig's `files` entry; its wildcard reads `**\/*.ts` either way. */
  readonly listed?: ReadonlyArray<string>;
  /** Files beside the package, relative to the temp dir. */
  readonly elsewhere?: Record<string, string>;
  /** Symlinks, each a path to its target, both relative to the temp dir. */
  readonly links?: Record<string, string>;
}

const write = (at: string, source: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    yield* fs.makeDirectory(at.slice(0, at.lastIndexOf('/')), { recursive: true });
    yield* fs.writeFileString(at, source);
  });

const fixture = ({ files, listed, elsewhere = {}, links = {} }: Fixture) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const root = `${dir}/pkg`;
    yield* fs.makeDirectory(root);
    const compilerOptions = {
      noEmit: true,
      skipLibCheck: true,
      strict: true,
      module: 'ESNext',
      moduleResolution: 'bundler',
      types: [],
    };
    yield* fs.writeFileString(
      `${root}/tsconfig.json`,
      yield* encodeTsconfig({
        compilerOptions,
        include: ['**/*.ts'],
        ...Option.match(Option.fromNullishOr(listed), {
          onNone: () => ({}),
          onSome: (entry) => ({ files: entry }),
        }),
      }),
    );
    for (const [file, source] of Object.entries(files)) yield* write(`${root}/${file}`, source);
    for (const [file, source] of Object.entries(elsewhere)) yield* write(`${dir}/${file}`, source);
    for (const [link, target] of Object.entries(links)) {
      yield* fs.symlink(`${dir}/${target}`, `${dir}/${link}`);
    }
    return root;
  });

const verdict = (files: Record<string, string>) =>
  fixture({ files }).pipe(Effect.flatMap(check), Effect.flip, Effect.scoped);

const text = <E>(stream: Stream.Stream<Uint8Array, E>) =>
  Stream.mkString(Stream.decodeText(stream));

/**
 * `tsc --noEmit` over the package at `root`: whether it exits non-zero, and
 * each error it reports as `<file> <code>`, the file as tsc spells it.
 */
const tscOver = (root: string) =>
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner;
    const child = yield* spawner.spawn(
      ChildProcess.make(process.execPath, [yield* tscScript, '-p', '.', '--pretty', 'false'], {
        cwd: root,
        forceKillAfter: '5 seconds',
      }),
    );
    const [stdout, , code] = yield* Effect.all(
      [text(child.stdout), text(child.stderr), child.exitCode],
      { concurrency: 3 },
    );
    const errors = stdout
      .split('\n')
      .flatMap((line) =>
        Option.toArray(
          Option.map(
            Option.fromNullishOr(/^(.*)\(\d+,\d+\): error (TS\d+)/.exec(line)),
            (match) => `${String(match[1])} ${String(match[2])}`,
          ),
        ),
      );
    return { refused: Number(code) !== 0, errors };
  }).pipe(Effect.scoped);

/** A way a disk can find a name under another spelling. */
type Fold = 'case' | 'long s' | 'normalization';

/** Which folds the temp dir's file system makes: it finds `found` as `asked`. */
const foldsOfTempDir = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const dir = yield* fs.makeTempDirectoryScoped();
  const folds = (found: string, asked: string) =>
    Effect.gen(function* () {
      yield* fs.writeFileString(`${dir}/${found}`, '');
      return yield* fs.exists(`${dir}/${asked}`);
    });
  return {
    case: yield* folds('probe', 'PROBE'),
    'long s': yield* folds('xſ', 'xs'),
    normalization: yield* folds('café', 'café'),
  } satisfies Record<Fold, boolean>;
}).pipe(Effect.scoped);

const importer = (specifier: string) =>
  `import { broken } from '${specifier}';\nexport const used: string = broken;\n`;
const declaration = 'export declare const broken: NotAType;\n';

/**
 * The routes by which tsc loads a package file under a spelling of its own
 * that this census holds: the case of a base name, an extension, a directory
 * or the root; the long s; Unicode normalization; a climbing path; a path
 * through a symlink; an import, a `files` entry and a reference. Each loads a
 * declaration file (the rule on tsc's spelling) whose own error `skipLibCheck`
 * hides; each names the disk's spelling of that file, and the folds a disk
 * must make for tsc to find it.
 */
const routes: ReadonlyArray<
  Fixture & { readonly route: string; readonly disk: string; readonly folds: ReadonlyArray<Fold> }
> = [
  {
    route: 'foo.d.TS, imported as ./foo.js',
    files: { 'src/a.ts': importer('./foo.js'), 'src/foo.d.TS': declaration },
    disk: 'src/foo.d.TS',
    folds: ['case'],
  },
  {
    route: 'foo.d.TS, referenced as ./foo.d.ts',
    files: {
      'src/a.ts': '/// <reference path="./foo.d.ts" />\nexport const a = 1;\n',
      'src/foo.d.TS': declaration,
    },
    disk: 'src/foo.d.TS',
    folds: ['case'],
  },
  {
    route: 'foo.d.TS, listed in files as src/foo.d.ts',
    files: { 'src/a.ts': 'export const a = 1;\n', 'src/foo.d.TS': declaration },
    listed: ['src/foo.d.ts'],
    disk: 'src/foo.d.TS',
    folds: ['case'],
  },
  {
    route: 'foo.d.MTS, imported as ./foo.mjs',
    files: { 'src/a.ts': importer('./foo.mjs'), 'src/foo.d.MTS': declaration },
    disk: 'src/foo.d.MTS',
    folds: ['case'],
  },
  {
    route: 'style.d.css.TS, imported as ./style.d.css.js',
    files: { 'src/a.ts': importer('./style.d.css.js'), 'src/style.d.css.TS': declaration },
    disk: 'src/style.d.css.TS',
    folds: ['case'],
  },
  {
    route: 'foo.D.TS, imported as ./foo.js',
    files: { 'src/a.ts': importer('./foo.js'), 'src/foo.D.TS': declaration },
    disk: 'src/foo.D.TS',
    folds: ['case'],
  },
  {
    route: 'foo.d.tſ (long s), imported as ./foo.js',
    files: { 'src/a.ts': importer('./foo.js'), 'src/foo.d.tſ': declaration },
    disk: 'src/foo.d.tſ',
    folds: ['long s'],
  },
  {
    route: 'foo.d.TS, imported from outside the package as ../../PKG/src/foo.js',
    files: { 'src/a.ts': importer('../../PKG/src/foo.js'), 'src/foo.d.TS': declaration },
    disk: 'src/foo.d.TS',
    folds: ['case'],
  },
  {
    route: 'foo.d.tſ (long s), imported from outside the package as ../../PKG/src/foo.js',
    files: { 'src/a.ts': importer('../../PKG/src/foo.js'), 'src/foo.d.tſ': declaration },
    disk: 'src/foo.d.tſ',
    folds: ['case', 'long s'],
  },
  {
    route: 'foo.d.TS, imported through an outside symlink to src as ../../ext/foo.js',
    files: { 'src/a.ts': importer('../../ext/foo.js'), 'src/foo.d.TS': declaration },
    links: { ext: 'pkg/src' },
    disk: 'src/foo.d.TS',
    folds: ['case'],
  },
  {
    route: 'café/foo.d.TS (stored composed), imported as ./café/foo.js (decomposed)',
    files: { 'src/a.ts': importer('./café/foo.js'), 'src/café/foo.d.TS': declaration },
    disk: 'src/café/foo.d.TS',
    folds: ['case', 'normalization'],
  },
  {
    route: 'foo.D.ts, imported as ./foo.js',
    files: { 'src/a.ts': importer('./foo.js'), 'src/foo.D.ts': declaration },
    disk: 'src/foo.D.ts',
    folds: ['case'],
  },
  {
    route: 'Foo.d.ts, imported as ./foo.js',
    files: { 'src/a.ts': importer('./foo.js'), 'src/Foo.d.ts': declaration },
    disk: 'src/Foo.d.ts',
    folds: ['case'],
  },
  {
    route: 'Sub/foo.d.ts, imported as ./sub/foo.js',
    files: { 'src/a.ts': importer('./sub/foo.js'), 'src/Sub/foo.d.ts': declaration },
    disk: 'src/Sub/foo.d.ts',
    folds: ['case'],
  },
];

/** The package's typecheck over one fixture: tsc's answer, and the check's verdict. */
const typecheck = (setup: Fixture) =>
  Effect.gen(function* () {
    const root = yield* fixture(setup);
    const [tsc, outcome] = yield* Effect.all(
      [tscOver(root), check(root).pipe(Effect.flip, Effect.option)],
      { concurrency: 2 },
    );
    const said = Option.match(outcome, {
      onNone: () => 'pass',
      onSome: Match.valueTags({
        Unchecked: (error) => `Unchecked ${error.files.join(' ')}`,
        Uncovered: (error) => `Uncovered ${error.files.join(' ')}`,
        ListFailed: (error) => error._tag,
        PlatformError: (error) => error._tag,
        SchemaError: (error) => error._tag,
      }),
    });
    return { tsc, check: said };
  }).pipe(Effect.scoped);

describe('the coverage check over a package', () => {
  it("names a nested file that tsc's wildcard skips", () =>
    Effect.gen(function* () {
      // tsc's `**` skips dot-directories, so only a walk of every level finds it.
      const error = yield* verdict({
        'src/a.ts': 'export const a = 1;\n',
        'src/.hidden/x.ts': 'export const x = 1;\n',
      });
      expect(error._tag).toBe('Uncovered');
      expect(error._tag === 'Uncovered' && error.files).toEqual(['src/.hidden/x.ts']);
    }).pipe(Effect.provide(BunServices.layer), Effect.runPromise));

  it('refuses a declaration file in the program', () =>
    Effect.gen(function* () {
      const error = yield* verdict({
        'src/a.ts': 'export const a = 1;\n',
        'src/decl.d.ts': 'export declare const broken: string;\n',
      });
      expect(error._tag).toBe('Unchecked');
      expect(error._tag === 'Unchecked' && error.files).toEqual(['src/decl.d.ts']);
    }).pipe(Effect.provide(BunServices.layer), Effect.runPromise));

  it("refuses a declaration file by the rule's wider form", () =>
    Effect.gen(function* () {
      const error = yield* verdict({
        'src/a.ts': 'export const a = 1;\n',
        'src/style.d.css.ts': 'export declare const broken: NotAType;\n',
      });
      expect(error._tag).toBe('Unchecked');
      expect(error._tag === 'Unchecked' && error.files).toEqual(['src/style.d.css.ts']);
    }).pipe(Effect.provide(BunServices.layer), Effect.runPromise));

  it('passes symlinked sources that tsc checks, and a declaration file whose real path is outside the package', () =>
    Effect.gen(function* () {
      const outcome = yield* typecheck({
        files: { 'src/real.ts': 'export const real = 1;\n' },
        elsewhere: {
          'outside/lib/x.ts': 'export const x = 1;\n',
          'outside/types.d.ts': 'export declare const t: string;\n',
        },
        links: {
          'pkg/src/alias.ts': 'pkg/src/real.ts',
          'pkg/src/vendor': 'outside/lib',
          'pkg/src/types.d.ts': 'outside/types.d.ts',
        },
      });
      expect(outcome).toEqual({ tsc: { refused: false, errors: [] }, check: 'pass' });
    }).pipe(Effect.provide(BunServices.layer), Effect.runPromise));
});

/** What the census asks of a route: the check names it, or tsc refuses it. */
const asked = (route: (typeof routes)[number], folded: Record<Fold, boolean>) => {
  if (route.folds.every((fold) => folded[fold])) return `check: Unchecked ${route.disk}`;
  return 'tsc: refuses';
};

/** The answer to what the census asks of a route, as the typecheck gave it. */
const answered = (
  route: (typeof routes)[number],
  folded: Record<Fold, boolean>,
  outcome: { readonly tsc: { readonly refused: boolean }; readonly check: string },
) => {
  if (route.folds.every((fold) => folded[fold])) return `check: ${outcome.check}`;
  if (outcome.tsc.refused) return 'tsc: refuses';
  return `tsc: passes, check: ${outcome.check}`;
};

describe("the package's typecheck over a file tsc spells its own way", () => {
  it("refuses each declaration route: the check names the file by its disk spelling where the disk makes the route's folds, and tsc refuses where it does not", () =>
    Effect.gen(function* () {
      const folded = yield* foldsOfTempDir;
      const seen = yield* Effect.forEach(
        routes,
        (route) =>
          typecheck(route).pipe(
            Effect.map((outcome) => [route.route, answered(route, folded, outcome)]),
          ),
        { concurrency: routes.length },
      );
      expect(seen).toEqual(routes.map((route) => [route.route, asked(route, folded)]));
    }).pipe(Effect.provide(BunServices.layer), Effect.runPromise));

  it('passes foo.TS, which is not a declaration file: tsc reports its error where the disk folds case, and cannot find it where the disk does not', () =>
    Effect.gen(function* () {
      const folded = yield* foldsOfTempDir;
      const outcome = yield* typecheck({
        files: {
          'src/a.ts': importer('./foo.js'),
          'src/foo.TS': 'export const broken: NotAType = 1 as never;\n',
        },
      });
      const errors = Match.value(folded.case).pipe(
        Match.when(true, () => ['src/foo.ts TS2304']),
        Match.orElse(() => ['src/a.ts TS2307']),
      );
      expect(outcome).toEqual({ tsc: { refused: true, errors }, check: 'pass' });
    }).pipe(Effect.provide(BunServices.layer), Effect.runPromise));
});
