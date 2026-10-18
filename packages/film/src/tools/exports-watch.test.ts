// The lab's watch on the workspace's exports, over a workspace in memory on
// the test clock: it reads the root's package.json and each its workspaces
// name; a change to a package's other fields goes unseen; an `exports` map
// changed (a subpath added by a merge) ends the watch with `ExportsChanged`,
// naming the package, on the next read, held to the maps read before the
// watch began; a package.json caught mid-write (empty, cut off, gone) is read
// again once and otherwise keeps what it said; the root is found above a workspace's folder; and the lab the
// watch ends closes its scope and what it holds before it is started again.

import { describe, expect, it } from 'effect-bun-test';
import { Context, Effect, Exit, Fiber, Layer, Option, Path } from 'effect';
import { TestClock } from 'effect/testing';
import {
  Relaunch,
  exportsNow,
  relaunchOnExportsChange,
  watchExports,
  workspaceRoot,
} from './exports-watch.ts';
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

/** What a watch's failure says: its tag and the files it names. */
const changed = (e: { readonly _tag: string; readonly files: ReadonlyArray<string> }) => ({
  _tag: e._tag,
  files: e.files,
});

const FILM_CHANGED = { _tag: 'ExportsChanged', files: ['packages/film/package.json'] };

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
      const watch = yield* Effect.forkChild(watchExports(yield* exportsNow('/w'), EVERY));
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
      expect(changed(failed)).toEqual(FILM_CHANGED);
    }).pipe(Effect.provide(inMemory(files)));
  });

  it.effect('a package.json caught mid-write, or gone a moment, ends nothing', () => {
    const files = workspace();
    return Effect.gen(function* () {
      const watch = yield* Effect.forkChild(watchExports(yield* exportsNow('/w'), EVERY));
      // A checkout between its unlink and its write: empty, then cut off, then gone.
      for (const caught of ['', '{ "name": "@w/film", "exp']) {
        files.set('/w/packages/film/package.json', text(caught));
        yield* TestClock.adjust(EVERY);
        expect(watch.pollUnsafe()).toBeUndefined();
      }
      files.delete('/w/packages/film/package.json');
      yield* TestClock.adjust(EVERY);
      expect(watch.pollUnsafe()).toBeUndefined();
      // Written again with its exports as they were (a dependency bumped).
      files.set('/w/packages/film/package.json', text(FILM('{ ".": "./src/index.ts" }')));
      yield* TestClock.adjust(EVERY);
      expect(watch.pollUnsafe()).toBeUndefined();
    }).pipe(Effect.provide(inMemory(files)));
  });

  it.effect(
    'a package.json caught mid-write is read again, and a change seen then ends the watch',
    () => {
      const files = workspace();
      return Effect.gen(function* () {
        const read = yield* exportsNow('/w');
        // The watch's first pass catches the merge mid-write; the merge has written it by its second read.
        files.set('/w/packages/film/package.json', text(''));
        const watch = yield* Effect.forkChild(watchExports(read, EVERY));
        yield* Effect.yieldNow;
        files.set(
          '/w/packages/film/package.json',
          text(FILM('{ ".": "./src/index.ts", "./style": "./src/style/index.ts" }')),
        );
        yield* TestClock.adjust('250 millis');
        const failed = yield* Effect.flip(Fiber.join(watch));
        expect(changed(failed)).toEqual(FILM_CHANGED);
      }).pipe(Effect.provide(inMemory(files)));
    },
  );

  it.effect('holds the watch to the maps read before it began', () => {
    const files = workspace();
    return Effect.gen(function* () {
      const read = yield* exportsNow('/w');
      // A merge lands while the lab starts, before the watch's first pass.
      files.set(
        '/w/packages/film/package.json',
        text(FILM('{ ".": "./src/index.ts", "./style": "./src/style/index.ts" }')),
      );
      const watch = yield* Effect.forkChild(watchExports(read, EVERY));
      yield* TestClock.adjust(EVERY);
      const failed = yield* Effect.flip(Fiber.join(watch));
      expect(changed(failed)).toEqual(FILM_CHANGED);
    }).pipe(Effect.provide(inMemory(files)));
  });

  it.effect('closes the lab and what it holds, then starts it again', () => {
    const files = workspace();
    const seen: Array<string> = [];
    class Pages extends Context.Service<Pages, { readonly at: string }>()('test/Pages') {}
    const held = Layer.effect(
      Pages,
      Effect.acquireRelease(
        Effect.sync(() => Pages.of({ at: 'chrome' })),
        () => Effect.sync(() => seen.push('pages closed')),
      ),
    );
    // The lab as `film lab` runs it: its exports read, its servers up, then its watch.
    const lab = Effect.gen(function* () {
      const read = yield* exportsNow('/w');
      const pages = yield* Pages;
      yield* Effect.addFinalizer(() => Effect.sync(() => seen.push('servers closed')));
      seen.push(`lab up over ${pages.at}`);
      return yield* watchExports(read, EVERY);
    });
    const relaunch = Layer.succeed(
      Relaunch,
      Relaunch.of({
        relaunch: (why) =>
          Effect.andThen(
            Effect.sync(() => seen.push(`relaunch: ${why}`)),
            Effect.die('started again'),
          ),
      }),
    );
    return Effect.gen(function* () {
      const running = yield* Effect.forkChild(Effect.exit(relaunchOnExportsChange(lab, held)));
      yield* TestClock.adjust(EVERY);
      expect(seen).toEqual(['lab up over chrome']);
      files.set(
        '/w/packages/film/package.json',
        text(FILM('{ ".": "./src/index.ts", "./style": "./src/style/index.ts" }')),
      );
      yield* TestClock.adjust(EVERY);
      const ended = yield* Fiber.join(running);
      expect(Exit.isFailure(ended)).toBe(true);
      expect(seen).toEqual([
        'lab up over chrome',
        'servers closed',
        'pages closed',
        'relaunch: the exports of packages/film/package.json changed: the lab starts again to resolve them',
      ]);
    }).pipe(Effect.provide(Layer.merge(relaunch, inMemory(files))));
  });
});
