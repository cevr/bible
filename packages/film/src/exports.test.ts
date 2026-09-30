// The package's browser and test entries carry only what their users use:
// every name an entry exports is imported by name from it somewhere, by a
// film's code under apps/ or by a test (or a test's fixture), through the
// package specifier (`@bible/film/canvas`) or a path to the entry's file. An
// export nobody reads is deleted from the entry, not kept "in case", and an
// entry names its exports (`export *` publishes a module whole). The
// engine's own parts stay exported from their files for the framework and
// its tests.
//
// The entries guarded, and who uses them:
//   canvas    films, their kits and tests: the draw kit
//   player    the app's page, its film registry, a film's `Narrated` type
//   stand-in  the framework's and a film's tests: the one stand-in context
// `core`, `tools`, `lab` and `review` are not guarded here: the pure core
// and the tooling entries are read by the CLI and the tools by path.

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Array as Arr, Effect, FileSystem, Option, Path } from 'effect';

/** Each guarded entry: its specifier under `@bible/film/` and its file under packages/film. */
const ENTRIES = [
  { entry: 'canvas', file: 'src/canvas/index.ts' },
  { entry: 'player', file: 'src/player/index.ts' },
  { entry: 'stand-in', file: 'src/canvas/fixtures/stand-in.ts' },
] as const;

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

/** Whether `file` is where a user of an entry lives: a film's code, or a test or its fixture. */
const isUser = (file: string) =>
  /\.tsx?$/.test(file) &&
  !file.includes('node_modules') &&
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
        ],
        isUser,
      );
      const sources = new Map<string, string>();
      for (const file of files) sources.set(file, yield* fs.readFileString(path.join(root, file)));

      const found: Record<string, { readonly whole: boolean; readonly unused: string[] }> = {};
      for (const { entry, file } of ENTRIES) {
        const at = path.join(films, file);
        const source = yield* fs.readFileString(at);
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
});
