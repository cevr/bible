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

/**
 * A package at `<temp dir>/pkg` holding `files`, whose tsconfig's wildcard
 * reads `**\/*.ts`, plus `listed` as its `files` entry when given.
 */
const fixture = (files: Record<string, string>, listed?: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const root = `${yield* fs.makeTempDirectoryScoped()}/pkg`;
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
    for (const [file, source] of Object.entries(files)) {
      const at = `${root}/${file}`;
      yield* fs.makeDirectory(at.slice(0, at.lastIndexOf('/')), { recursive: true });
      yield* fs.writeFileString(at, source);
    }
    return root;
  });

const verdict = (files: Record<string, string>) =>
  fixture(files).pipe(Effect.flatMap(check), Effect.flip, Effect.scoped);

const text = <E>(stream: Stream.Stream<Uint8Array, E>) =>
  Stream.mkString(Stream.decodeText(stream));

/** Whether `tsc --noEmit` over the package at `root` exits non-zero. */
const tscRefuses = (root: string) =>
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner;
    const child = yield* spawner.spawn(
      ChildProcess.make(process.execPath, [yield* tscScript, '-p', root, '--pretty', 'false'], {
        forceKillAfter: '5 seconds',
      }),
    );
    const [, , code] = yield* Effect.all([text(child.stdout), text(child.stderr), child.exitCode], {
      concurrency: 3,
    });
    return Number(code) !== 0;
  }).pipe(Effect.scoped);

/** Whether the temp dir's file system finds a name under another case. */
const caseInsensitive = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const dir = yield* fs.makeTempDirectoryScoped();
  yield* fs.writeFileString(`${dir}/probe`, '');
  return yield* fs.exists(`${dir}/PROBE`);
}).pipe(Effect.scoped);

const importer = (specifier: string) =>
  `import { broken } from '${specifier}';\nexport const used: string = broken;\n`;
const declaration = 'export declare const broken: NotAType;\n';

/**
 * Each route by which tsc loads a package file under a spelling of its own: a
 * declaration file (the rule on tsc's spelling) whose own error `skipLibCheck`
 * hides, and the disk's spelling of that file.
 */
const routes: ReadonlyArray<{
  readonly route: string;
  readonly files: Record<string, string>;
  readonly listed?: ReadonlyArray<string>;
  readonly disk: string;
}> = [
  {
    route: 'foo.d.TS, imported as ./foo.js',
    files: { 'src/a.ts': importer('./foo.js'), 'src/foo.d.TS': declaration },
    disk: 'src/foo.d.TS',
  },
  {
    route: 'foo.d.TS, referenced as ./foo.d.ts',
    files: {
      'src/a.ts': '/// <reference path="./foo.d.ts" />\nexport const a = 1;\n',
      'src/foo.d.TS': declaration,
    },
    disk: 'src/foo.d.TS',
  },
  {
    route: 'foo.d.TS, listed in files as src/foo.d.ts',
    files: { 'src/a.ts': 'export const a = 1;\n', 'src/foo.d.TS': declaration },
    listed: ['src/foo.d.ts'],
    disk: 'src/foo.d.TS',
  },
  {
    route: 'foo.d.MTS, imported as ./foo.mjs',
    files: { 'src/a.ts': importer('./foo.mjs'), 'src/foo.d.MTS': declaration },
    disk: 'src/foo.d.MTS',
  },
  {
    route: 'style.d.css.TS, imported as ./style.d.css.js',
    files: { 'src/a.ts': importer('./style.d.css.js'), 'src/style.d.css.TS': declaration },
    disk: 'src/style.d.css.TS',
  },
  {
    route: 'foo.D.TS, imported as ./foo.js',
    files: { 'src/a.ts': importer('./foo.js'), 'src/foo.D.TS': declaration },
    disk: 'src/foo.D.TS',
  },
  {
    route: 'foo.d.tſ (long s), imported as ./foo.js',
    files: { 'src/a.ts': importer('./foo.js'), 'src/foo.d.tſ': declaration },
    disk: 'src/foo.d.tſ',
  },
  {
    route: 'foo.d.TS, imported from outside the package as ../../PKG/src/foo.js',
    files: { 'src/a.ts': importer('../../PKG/src/foo.js'), 'src/foo.d.TS': declaration },
    disk: 'src/foo.d.TS',
  },
  {
    route: 'foo.d.tſ (long s), imported from outside the package as ../../PKG/src/foo.js',
    files: { 'src/a.ts': importer('../../PKG/src/foo.js'), 'src/foo.d.tſ': declaration },
    disk: 'src/foo.d.tſ',
  },
  {
    route: 'foo.D.ts, imported as ./foo.js',
    files: { 'src/a.ts': importer('./foo.js'), 'src/foo.D.ts': declaration },
    disk: 'src/foo.D.ts',
  },
  {
    route: 'Foo.d.ts, imported as ./foo.js',
    files: { 'src/a.ts': importer('./foo.js'), 'src/Foo.d.ts': declaration },
    disk: 'src/Foo.d.ts',
  },
  {
    route: 'Sub/foo.d.ts, imported as ./sub/foo.js',
    files: { 'src/a.ts': importer('./sub/foo.js'), 'src/Sub/foo.d.ts': declaration },
    disk: 'src/Sub/foo.d.ts',
  },
];

/** The package's typecheck over one fixture: tsc's exit, and the check's verdict. */
const typecheck = (files: Record<string, string>, listed?: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const root = yield* fixture(files, listed);
    const [tscRefused, outcome] = yield* Effect.all(
      [tscRefuses(root), check(root).pipe(Effect.flip, Effect.option)],
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
    return { tscRefused, check: said };
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
});

describe("the package's typecheck over a file tsc spells its own way", () => {
  it('refuses each declaration route: the check names the file by its disk spelling where the disk folds case, and tsc refuses where it does not', () =>
    Effect.gen(function* () {
      const folds = yield* caseInsensitive;
      const seen = yield* Effect.forEach(
        routes,
        ({ route, files, listed }) =>
          typecheck(files, listed).pipe(Effect.map((outcome) => [route, outcome] as const)),
        { concurrency: routes.length },
      );
      const wanted = routes.map(({ route, disk }) => [route, disk] as const);
      if (folds) {
        expect(seen.map(([route, outcome]) => [route, outcome.check])).toEqual(
          wanted.map(([route, disk]) => [route, `Unchecked ${disk}`]),
        );
      } else {
        expect(seen.map(([route, outcome]) => [route, outcome.tscRefused])).toEqual(
          wanted.map(([route]) => [route, true]),
        );
      }
    }).pipe(Effect.provide(BunServices.layer), Effect.runPromise));

  it('passes foo.TS, which is not a declaration file, and tsc reports its error', () =>
    Effect.gen(function* () {
      const outcome = yield* typecheck({
        'src/a.ts': importer('./foo.js'),
        'src/foo.TS': 'export const broken: NotAType = 1 as never;\n',
      });
      expect(outcome).toEqual({ tscRefused: true, check: 'pass' });
    }).pipe(Effect.provide(BunServices.layer), Effect.runPromise));
});
