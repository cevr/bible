// The canvas public entry (`@bible/film/canvas`) carries only what films and
// tests use: every name `index.ts` exports is imported by name somewhere under
// apps/ or by a test (or a test's fixture) from the entry, so an export no
// film reads is deleted from the entry, not kept "in case". The engine's own
// parts stay exported from their files for the framework and its tests.

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Array as Arr, Effect, FileSystem, Option, Path } from 'effect';

/** The names inside every `export { … } from` block of the entry, `type` dropped. */
const exported = (source: string): ReadonlyArray<string> =>
  Arr.flatMap([...source.matchAll(/export\s*\{([^}]*)\}\s*from/g)], (m) =>
    namesIn(Option.getOrElse(Option.fromUndefinedOr(m[1]), () => '')),
  );

/** `a, type B, c as d` → `a`, `B`, `c`: the names as the entry spells them. */
const namesIn = (list: string): ReadonlyArray<string> =>
  list
    .split(',')
    .map((part) =>
      part
        .replace(/^\s*type\s+/, '')
        .split(/\s+as\s+/)[0]
        ?.trim(),
    )
    .flatMap((name) =>
      Option.toArray(Option.filter(Option.fromUndefinedOr(name), (n) => n !== '')),
    );

/** What a file imports (or passes on, as a film's kit does) by name from the canvas entry, by package or by path. */
const imported = (source: string): ReadonlyArray<string> =>
  Arr.flatMap(
    [
      ...source.matchAll(
        /(?:import|export)\s*(?:type\s*)?\{([^}]*)\}\s*from\s*'(?:@bible\/film\/canvas|[./]*(?:canvas\/)?index\.ts)'/g,
      ),
    ],
    (m) => namesIn(Option.getOrElse(Option.fromUndefinedOr(m[1]), () => '')),
  );

/**
 * Whether `file` is where a user of the entry lives: a film's code, or a test
 * or its fixture. An app's `out/` is output, and tests copy films into it and
 * remove them while this walks, so it is never read.
 */
const isUser = (file: string) =>
  /\.tsx?$/.test(file) &&
  !file.includes('node_modules') &&
  !/^apps\/[^/]+\/out\//.test(file) &&
  (file.startsWith('apps/') || /\.test\.tsx?$/.test(file) || file.includes('/fixtures/'));

describe('the canvas entry', () => {
  it.effect('exports only names a film or a test imports from it', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = path.resolve(import.meta.dir, '../../../..');
      const entry = yield* fs.readFileString(path.join(import.meta.dir, 'index.ts'));
      const files = Arr.filter(
        [
          ...(yield* fs.readDirectory(path.join(root, 'apps'), { recursive: true })).map(
            (f) => `apps/${f}`,
          ),
          ...(yield* fs.readDirectory(path.join(root, 'packages/film/src'), {
            recursive: true,
          })).map((f) => `packages/film/src/${f}`),
        ],
        isUser,
      );
      const used = new Set<string>();
      for (const file of files) {
        if (file === 'packages/film/src/canvas/exports.test.ts') continue;
        for (const name of imported(yield* fs.readFileString(path.join(root, file))))
          used.add(name);
      }
      const unused = exported(entry).filter((name) => !used.has(name));
      expect(unused).toEqual([]);
    }).pipe(Effect.provide(BunServices.layer)),
  );
});
