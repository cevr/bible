// The package's browser and test entries carry only what their users use:
// every name an entry exports is imported by name from it somewhere, by a
// film's code under apps/, by a test (or a test's fixture, a lint rule's
// among them), through the package specifier (`@bible/film/canvas`) or a
// path to the entry's file. An export nobody reads is deleted from the
// entry, not kept "in case", and an entry names its exports (`export *`
// publishes a module whole). The engine's own parts stay exported from their
// files for the framework and its tests, and in a swept directory (`SWEPT`)
// only while another file imports them: a name its own file alone reads is
// not exported. A directory joins `SWEPT` once its unread exports are gone.
//
// Imports and exports are read by the parser (oxc), so a comment or a string
// that looks like code names nothing. A namespace import, an `import()` and
// an `export * as` take a module whole.
//
// The entries guarded, and who uses them:
//   canvas    films, their kits and tests: the draw kit
//   player    the app's page, its film registry, a film's `Narrated` type
//   stand-in  the framework's and a film's tests, and `check --draw`'s leg
//             (tools/draw-check.ts), which draws every scene into it
//   core      films, their kits, the app's sound library and tests: the
//             clock, the script and sound schemas, the mix plan
// `tools`, `lab`, `review` and `testing` (the tools' test doubles) are not
// guarded here: the tooling entries are read by the CLI and the tests, and
// the framework reads each core module by its path.

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Array as Arr, Effect, FileSystem, Option, Path, Schema } from 'effect';
import {
  type ExportExportName,
  type ExportImportName,
  type ImportName,
  parseSync,
} from 'oxc-parser';

/** The tools that use a guarded entry as its users do: the draw leg draws into the stand-in. */
const TOOL_USERS: ReadonlySet<string> = new Set(['packages/film/src/tools/draw-check.ts']);

/**
 * The directories whose modules export only what another file imports by
 * name (a test or a lint fixture counts, an `export * from` passes a name
 * through): an export its own file alone reads is not exported.
 */
const SWEPT = ['packages/film/src/core/', 'packages/film/src/lab/'] as const;

/** `packages/film/package.json`'s specifiers: `./core` → `./src/core/index.ts`. */
const PackageExports = Schema.fromJsonString(
  Schema.Struct({ exports: Schema.Record(Schema.String, Schema.String) }),
);

/** Each guarded entry: its specifier under `@bible/film/` and its file under packages/film. */
const ENTRIES = [
  { entry: 'canvas', file: 'src/canvas/index.ts' },
  { entry: 'player', file: 'src/player/index.ts' },
  { entry: 'stand-in', file: 'src/canvas/fixtures/stand-in.ts' },
  { entry: 'core', file: 'src/core/index.ts' },
] as const;

/** What one import or re-export takes from `from`: some of its names, or (None) the module whole. */
interface Take {
  readonly from: string;
  readonly names: Option.Option<ReadonlyArray<string>>;
}

/** A module's imports and exports, as the parser reads them. */
interface ModuleRecord {
  /** The names it exports (as renamed): declarations, `export { … }` and re-exports. */
  readonly exports: ReadonlyArray<string>;
  /** Its `import`s, `import()`s and `export … from`s. */
  readonly takes: ReadonlyArray<Take>;
  /** Its `export * from` sources: a name taken from it is taken from them too. */
  readonly stars: ReadonlyArray<string>;
}

/** A name as an import or export entry spells it; a default is `default`. */
const nameOf = (entry: ImportName | ExportImportName | ExportExportName): Option.Option<string> => {
  if (entry.kind === 'Default') return Option.some('default');
  return Option.fromNullishOr(entry.name);
};

type Parsed = ReturnType<typeof parseSync>['module'];

/** An `import … from`: its names, or the module whole for `import * as`. */
const importTake = (i: Parsed['staticImports'][number]): Take => {
  if (i.entries.some((e) => e.importName.kind === 'NamespaceObject'))
    return { from: i.moduleRequest.value, names: Option.none() };
  return {
    from: i.moduleRequest.value,
    names: Option.some(i.entries.flatMap((e) => Option.toArray(nameOf(e.importName)))),
  };
};

/** An `export … from` but `export *`: its one name, or the module whole for `export * as`. */
const reexportTake = (e: Parsed['staticExports'][number]['entries'][number]): ReadonlyArray<Take> =>
  Option.toArray(
    Option.map(
      Option.filter(
        Option.fromNullishOr(e.moduleRequest),
        () => e.importName.kind !== 'AllButDefault',
      ),
      (request): Take => ({
        from: request.value,
        names: Option.map(nameOf(e.importName), (name) => [name]),
      }),
    ),
  );

/** How the parser reads `file`: JSX only in a `.tsx`. */
const langOf = (file: string): 'ts' | 'tsx' => {
  if (file.endsWith('.tsx')) return 'tsx';
  return 'ts';
};

/** An `import('…')` with a literal specifier: the module whole. */
const dynamicTake = (source: string, d: Parsed['dynamicImports'][number]): ReadonlyArray<Take> =>
  Option.toArray(
    Option.map(
      Option.fromNullishOr(
        /^['"`]([^'"`]*)['"`]$/.exec(source.slice(d.moduleRequest.start, d.moduleRequest.end))?.[1],
      ),
      (from): Take => ({ from, names: Option.none() }),
    ),
  );

const recordOf = (file: string, source: string): ModuleRecord => {
  const { module } = parseSync(file, source, { lang: langOf(file), sourceType: 'module' });
  const entries = module.staticExports.flatMap((e) => e.entries);
  return {
    exports: entries.flatMap((e) => Option.toArray(nameOf(e.exportName))),
    takes: [
      ...module.staticImports.map(importTake),
      ...entries.flatMap(reexportTake),
      ...module.dynamicImports.flatMap((d) => dynamicTake(source, d)),
    ],
    stars: entries.flatMap((e) =>
      Option.toArray(
        Option.filter(
          Option.map(Option.fromNullishOr(e.moduleRequest), (r) => r.value),
          () => e.importName.kind === 'AllButDefault',
        ),
      ),
    ),
  };
};

/** The key a module's name is marked used under; `*` marks the module whole. */
const WHOLE = '*';

/**
 * Whether `file` is where a user of an entry lives: a film's code, or a test
 * or its fixture. An app's `out/` is output, and tests copy films into it and
 * remove them while this walks, so it is never read.
 */
const isUser = (file: string) =>
  /\.tsx?$/.test(file) &&
  !file.includes('node_modules') &&
  !/^apps\/[^/]+\/out\//.test(file) &&
  (file.startsWith('apps/') || /\.test\.tsx?$/.test(file) || file.includes('/fixtures/'));

describe('the package entries', () => {
  it.effect('a comment or a string that looks like code hides nothing and names nothing', () =>
    Effect.sync(() => {
      // tools/lab.ts's shape: a line comment holding `/*`, code, then a doc comment's `*/`.
      const record = recordOf(
        'm.ts',
        [
          '// the routes under /lab/* answer the page',
          "import { kept } from './a.ts';",
          "const s = 'export const fake = 1';",
          'export const real = kept, also = 2;',
          '/** the end */',
          "export { other } from './b.ts';",
        ].join('\n'),
      );
      expect(record.exports).toEqual(['real', 'also', 'other']);
      expect(record.takes).toEqual([
        { from: './a.ts', names: Option.some(['kept']) },
        { from: './b.ts', names: Option.some(['other']) },
      ]);
    }),
  );

  it.effect('each names its exports, and exports only names its users import from it', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = path.resolve(import.meta.dir, '../../..');
      const films = path.join(root, 'packages/film');
      const files = Arr.filter(
        [
          ...(yield* fs.readDirectory(path.join(root, 'apps'), { recursive: true })).map(
            (f) => `apps/${f}`,
          ),
          ...(yield* fs.readDirectory(path.join(films, 'src'), { recursive: true })).map(
            (f) => `packages/film/src/${f}`,
          ),
          // The lint rules' fixtures, each a film's code the rule reads.
          ...(yield* fs.readDirectory(path.join(films, 'lint/fixtures'), { recursive: true })).map(
            (f) => `packages/film/lint/fixtures/${f}`,
          ),
        ],
        (file) => isUser(file) || TOOL_USERS.has(file),
      );
      const records = new Map<string, ModuleRecord>();
      for (const file of files)
        records.set(file, recordOf(file, yield* fs.readFileString(path.join(root, file))));

      const found: Record<string, { readonly whole: boolean; readonly unused: string[] }> = {};
      for (const { entry, file } of ENTRIES) {
        const at = path.join(films, file);
        const own = recordOf(at, yield* fs.readFileString(at));
        const used = new Set<string>();
        for (const [user, record] of records) {
          if (path.join(root, user) === at) continue;
          for (const take of record.takes) {
            const fromEntry =
              take.from === `@bible/film/${entry}` ||
              (take.from.startsWith('.') &&
                path.resolve(path.dirname(path.join(root, user)), take.from) === at);
            if (fromEntry)
              for (const name of Option.getOrElse(take.names, () => [WHOLE])) used.add(name);
          }
        }
        found[entry] = {
          whole: own.stars.length > 0,
          unused: own.exports.filter((name) => !used.has(name) && !used.has(WHOLE)),
        };
      }
      expect(found).toEqual(
        Object.fromEntries(ENTRIES.map(({ entry }) => [entry, { whole: false, unused: [] }])),
      );
    }).pipe(Effect.provide(BunServices.layer)),
  );

  it.effect('every module in a swept directory exports only names another file imports', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = path.resolve(import.meta.dir, '../../..');
      const films = path.join(root, 'packages/film');
      const read = (dir: string) =>
        Effect.map(fs.readDirectory(path.join(root, dir), { recursive: true }), (found) =>
          found.map((f) => `${dir}/${f}`),
        );
      const files = Arr.filter(
        [
          ...(yield* read('apps')),
          ...(yield* read('packages/film/src')),
          ...(yield* read('packages/film/lint')),
        ],
        (file) =>
          /\.tsx?$/.test(file) &&
          !file.includes('node_modules') &&
          !/^apps\/[^/]+\/out\//.test(file),
      );
      const records = new Map<string, ModuleRecord>();
      for (const file of files)
        records.set(file, recordOf(file, yield* fs.readFileString(path.join(root, file))));
      const specifiers = yield* Schema.decodeEffect(PackageExports)(
        yield* fs.readFileString(path.join(films, 'package.json')),
      );

      /** The file `from` names, as `user` imports it: a relative path, or the package's specifier. */
      const resolved = (user: string, from: string): Option.Option<string> => {
        if (from.startsWith('.'))
          return Option.some(path.relative(root, path.resolve(root, path.dirname(user), from)));
        return Option.map(
          Option.fromUndefinedOr(specifiers.exports[`.${from.slice('@bible/film'.length)}`]),
          (file) => path.join('packages/film', file),
        );
      };
      const stars = new Map<string, ReadonlyArray<string>>();
      for (const [file, record] of records)
        stars.set(
          file,
          record.stars.flatMap((from) => Option.toArray(resolved(file, from))),
        );
      const used = new Set<string>();
      const take = (module: string, name: string) => {
        used.add(`${module}#${name}`);
        for (const star of stars.get(module) ?? []) used.add(`${star}#${name}`);
      };
      for (const [user, record] of records)
        for (const { names, from } of record.takes)
          for (const module of Option.toArray(resolved(user, from)))
            if (module !== user)
              for (const name of Option.getOrElse(names, () => [WHOLE])) take(module, name);

      const unused = [...records]
        .filter(
          ([file]) => SWEPT.some((dir) => file.startsWith(dir)) && !/\.test\.tsx?$/.test(file),
        )
        .flatMap(([file, record]) =>
          record.exports
            .filter((name) => !used.has(`${file}#${name}`) && !used.has(`${file}#${WHOLE}`))
            .map((name) => `${file.slice('packages/film/src/'.length)} ${name}`),
        );
      expect(unused).toEqual([]);
    }).pipe(Effect.provide(BunServices.layer)),
  );
});
