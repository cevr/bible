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

/** A module's code without its comments, so a doc's `export const look` names nothing. */
const codeOf = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** `a, type B, c as d` → the names each part gives: the left of `as` (`pick` 0) or its right (1). */
const namesIn = (list: string, pick: 0 | 1): ReadonlyArray<string> =>
  list
    .split(',')
    .map((part) => {
      const sides = part.replace(/^\s*type\s+/, '').split(/\s+as\s+/);
      return (sides[pick] ?? sides[0])?.trim();
    })
    .flatMap((name) =>
      Option.toArray(Option.filter(Option.fromUndefinedOr(name), (n) => n !== '')),
    );

/** The names a module exports: its `export { … }` blocks (as renamed) and its exported declarations. */
const exported = (source: string): ReadonlyArray<string> => [
  ...Arr.flatMap([...source.matchAll(/export\s*(?:type\s*)?\{([^}]*)\}/g)], (m) =>
    namesIn(
      Option.getOrElse(Option.fromUndefinedOr(m[1]), () => ''),
      1,
    ),
  ),
  ...Arr.flatMap(
    [
      ...source.matchAll(
        /export\s+(?:declare\s+)?(?:async\s+)?(?:const|let|function|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g,
      ),
    ],
    (m) => Option.toArray(Option.fromUndefinedOr(m[1])),
  ),
];

/** Each `import`/`export … from` of a file: the names it takes, and from where. */
const takes = (source: string) =>
  [...source.matchAll(/(?:import|export)\s*(?:type\s*)?\{([^}]*)\}\s*from\s*'([^']+)'/g)].map(
    (m) => ({
      names: namesIn(
        Option.getOrElse(Option.fromUndefinedOr(m[1]), () => ''),
        0,
      ),
      from: m[2] ?? '',
    }),
  );

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
      const sources = new Map<string, string>();
      for (const file of files)
        sources.set(file, codeOf(yield* fs.readFileString(path.join(root, file))));

      const found: Record<string, { readonly whole: boolean; readonly unused: string[] }> = {};
      for (const { entry, file } of ENTRIES) {
        const at = path.join(films, file);
        const source = codeOf(yield* fs.readFileString(at));
        const used = new Set<string>();
        for (const [user, text] of sources) {
          if (path.join(root, user) === at) continue;
          for (const take of takes(text)) {
            const fromEntry =
              take.from === `@bible/film/${entry}` ||
              (take.from.startsWith('.') &&
                path.resolve(path.dirname(path.join(root, user)), take.from) === at);
            if (fromEntry) for (const name of take.names) used.add(name);
          }
        }
        found[entry] = {
          whole: /export\s*\*/.test(source),
          unused: exported(source).filter((name) => !used.has(name)),
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
      const sources = new Map<string, string>();
      for (const file of files)
        sources.set(file, codeOf(yield* fs.readFileString(path.join(root, file))));
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
      /** Each module's `export * from` sources: a name taken from it is taken from them too. */
      const stars = new Map<string, ReadonlyArray<string>>();
      for (const [file, text] of sources)
        stars.set(
          file,
          [...text.matchAll(/export\s*\*\s*from\s*'([^']+)'/g)].flatMap((m) =>
            Option.toArray(resolved(file, m[1] ?? '')),
          ),
        );
      const used = new Set<string>();
      const take = (module: string, name: string) => {
        used.add(`${module}#${name}`);
        for (const star of stars.get(module) ?? []) used.add(`${star}#${name}`);
      };
      for (const [user, text] of sources)
        for (const { names, from } of takes(text))
          for (const module of Option.toArray(resolved(user, from)))
            if (module !== user) for (const name of names) take(module, name);

      const unused = [...sources]
        .filter(
          ([file]) => SWEPT.some((dir) => file.startsWith(dir)) && !/\.test\.tsx?$/.test(file),
        )
        .flatMap(([file, text]) =>
          exported(text)
            .filter((name) => !used.has(`${file}#${name}`))
            .map((name) => `${file.slice('packages/film/src/'.length)} ${name}`),
        );
      expect(unused).toEqual([]);
    }).pipe(Effect.provide(BunServices.layer)),
  );
});
