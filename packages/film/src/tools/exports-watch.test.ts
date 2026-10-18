// The lab's watch on the workspace's exports, over a workspace in memory on
// the test clock: it reads the root's package.json and each its workspaces
// name; a change to a package's other fields goes unseen; an `exports` map
// changed (a subpath added by a merge) ends the watch with `ExportsChanged`,
// naming the package, on the next read; and the root is found above a
// workspace's folder.

import { describe, expect, it } from 'effect-bun-test';
import { Effect, Fiber, Layer, Option, Path } from 'effect';
import { TestClock } from 'effect/testing';
import { ExportsChanged, watchExports, workspaceRoot } from './exports-watch.ts';
import { memoryFileSystem, text } from './testing.ts';

/** How often the test's watch reads. */
const EVERY = '3 seconds';

const FILM = (exports: string) =>
  `{ "name": "@w/film", "version": "1.0.0", "exports": ${exports} }\n`;

const workspace = () =>
  new Map<string, Uint8Array>([
    ['/w/package.json', text('{ "name": "w", "workspaces": ["packages/*", "apps/*"] }\n')],
    ['/w/packages/film/package.json', text(FILM('{ ".": "./src/index.ts" }'))],
    ['/w/packages/core/package.json', text('{ "name": "@w/core" }\n')],
    ['/w/apps/animations/package.json', text('{ "name": "animations" }\n')],
    ['/w/apps/animations/cli.ts', text('')],
  ]);

const inMemory = (files: Map<string, Uint8Array>) =>
  Layer.mergeAll(
    memoryFileSystem(files, new Set(['/w/packages', '/w/apps', '/w/apps/animations'])),
    Path.layer,
  );

describe('the exports watch', () => {
  it.effect('finds the root above an app, and none above the workspace', () => {
    const files = workspace();
    return Effect.gen(function* () {
      expect(yield* workspaceRoot('/w/apps/animations')).toEqual(Option.some('/w'));
      expect(yield* workspaceRoot('/elsewhere')).toEqual(Option.none());
    }).pipe(Effect.provide(inMemory(files)));
  });

  it.effect('ends with ExportsChanged once an exports map changes, and not before', () => {
    const files = workspace();
    return Effect.gen(function* () {
      const watch = yield* Effect.forkChild(watchExports('/w', EVERY));
      yield* TestClock.adjust(EVERY);
      // An app's package.json, read under the workspaces' `apps/*`, that does not read.
      files.set('/w/apps/animations/package.json', text('{ not json'));
      yield* TestClock.adjust(EVERY);
      expect(watch.pollUnsafe()).toBeUndefined();
      files.set('/w/apps/animations/package.json', text('{ "name": "animations" }\n'));
      // A version bumped: no exports changed.
      files.set(
        '/w/packages/film/package.json',
        text(FILM('{ ".": "./src/index.ts" }').replace('1.0.0', '1.0.1')),
      );
      yield* TestClock.adjust(EVERY);
      expect(watch.pollUnsafe()).toBeUndefined();
      // A merge adds a subpath.
      files.set(
        '/w/packages/film/package.json',
        text(FILM('{ ".": "./src/index.ts", "./style": "./src/style/index.ts" }')),
      );
      yield* TestClock.adjust(EVERY);
      const failed = yield* Effect.flip(Fiber.join(watch));
      expect(failed).toEqual(ExportsChanged.make({ files: ['packages/film/package.json'] }));
    }).pipe(Effect.provide(inMemory(files)));
  });
});
