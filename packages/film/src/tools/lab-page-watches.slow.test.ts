// A lab page's watches follow what its builds read: an app named through a
// link is watched where it lies, one save made as the watched folders change
// is heard, and so is a file the page newly reads, saved while it builds.
// The app is in a temp folder, where the box's watch is the question
// (`fixtures/lab-app.ts`).

import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Layer, Option, Path, Record, Ref } from 'effect';
import { PageBundler } from './lab-page.ts';
import {
  Platform,
  html,
  appFolderWith,
  appFolder,
  served,
  app,
  buildOf,
} from './fixtures/lab-app.ts';

describe("the watches, as a build's reads change", () => {
  it.live(
    'an app named through a link is watched where it lies, as the bundler names what it read: a first build hears no save of its own, and a later save is heard',
    () =>
      Effect.gen(function* () {
        // Every file the build reads lies in a folder watched from the start (an entry's).
        const { spec, write } = yield* appFolderWith({
          'review.html': html('review', './src/lab.ts'),
          'src/review.server.tsx': "export const rendered = () => 'served';\n",
        });
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const dir = path.dirname(spec.pages.review);
        // The same folder by another name, as macOS names its temp folder (`/var` for `/private/var`).
        const linked = `${dir}-linked`;
        yield* fs.symlink(dir, linked);
        const through = (file: string) => path.join(linked, path.relative(dir, file));
        const { page, ask } = yield* served(
          {
            ...spec,
            pages: Record.map(spec.pages, through),
            servers: { review: through(spec.servers.review) },
            films: through(spec.films),
          },
          PageBundler.layer,
        );
        const built = buildOf((yield* ask('/')).text);
        // Past the arming check of any watch the build began: nothing was saved since.
        const held = yield* page.wait(
          { since: built, server: Option.none(), film: Option.none() },
          '1 second',
        );
        expect(held.build).toBe(built);
        const heard = yield* Effect.andThen(
          write('src/lab.ts', "console.log('the lab, saved');\n"),
          page.wait({ since: built, server: Option.none(), film: Option.none() }, '5 seconds'),
        );
        expect(heard.build).toBeGreaterThan(built);
      }).pipe(Effect.scoped, Effect.provide(Platform)),
  );

  it.live('one save, made as the watched folders change, is heard', () =>
    Effect.gen(function* () {
      const { ask, script, waitWriting, waitOnce, write } = yield* app;
      yield* ask('/');
      // The page now reads one more folder: the watches change with its next build.
      yield* write('extra/x.ts', "export const x = 'x';\n");
      const moved = yield* waitWriting(
        0,
        '10 seconds',
        'src/p.ts',
        "import { shared } from '../lib/shared.ts';\nimport { x } from '../extra/x.ts';\nconsole.log(shared, x);\n",
      );
      expect((yield* ask('/')).status).toBe(200);
      // One save at once, to a folder watched before and after.
      const heard = yield* waitOnce(
        moved.build,
        '5 seconds',
        'lib/shared.ts',
        "export const shared = 'shared three';\n",
      );
      expect(heard.build).toBeGreaterThan(moved.build);
      expect(yield* script).toContain('shared three');
    }).pipe(Effect.scoped, Effect.provide(Platform)),
  );

  it.live('a file the page newly reads, saved while it builds, is heard', () =>
    Effect.gen(function* () {
      const { spec, write } = yield* appFolder;
      const path = yield* Path.Path;
      const dir = path.dirname(spec.pages.review);
      // A bundler whose reads are scripted: the entries and `graph`, and `during` once, mid-build.
      const graph = yield* Ref.make<ReadonlyArray<string>>([path.join(dir, 'src', 'p.ts')]);
      const during = yield* Ref.make<Effect.Effect<void>>(Effect.void);
      const scripted = Layer.effect(
        PageBundler,
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          return PageBundler.of({
            bundle: (entries, root) =>
              Effect.gen(function* () {
                const outputs = yield* Effect.forEach(entries, (entry) =>
                  Effect.map(fs.readFile(entry), (bytes) => ({
                    path: path.relative(root, entry),
                    bytes,
                    type: 'text/html;charset=utf-8',
                  })),
                );
                yield* Effect.flatten(Ref.getAndSet(during, Effect.void));
                return {
                  outputs,
                  server: [],
                  inputs: [...entries, ...(yield* Ref.get(graph))],
                  serverInputs: [],
                };
              }).pipe(Effect.mapError((error) => ({ reason: error.message, files: [] }))),
          });
        }),
      );
      const { page, ask } = yield* served(spec, scripted);
      yield* ask('/');
      // The first build may count once a save it read in the last second: the build once that is heard.
      const settled = (yield* page.wait(
        { since: 0, server: Option.none(), film: Option.none() },
        '1 second',
      )).build;
      // p.ts now imports src/new.ts, in a folder already watched; new.ts is saved as the
      // next build reads it, and its save is judged against the build before, which did not read it.
      yield* write('src/new.ts', 'export const v = 1;\n');
      yield* Ref.set(graph, [path.join(dir, 'src', 'p.ts'), path.join(dir, 'src', 'new.ts')]);
      const imports = yield* Effect.andThen(
        write('src/p.ts', "import { v } from './new.ts';\nconsole.log(v);\n"),
        page.wait({ since: settled, server: Option.none(), film: Option.none() }, '5 seconds'),
      );
      expect(imports.build).toBeGreaterThan(settled);
      yield* Ref.set(
        during,
        Effect.andThen(write('src/new.ts', 'export const v = 2;\n'), () =>
          Effect.sleep('300 millis'),
        ).pipe(Effect.orDie),
      );
      const second = buildOf((yield* ask('/')).text);
      const heard = yield* page.wait(
        { since: second, server: Option.none(), film: Option.none() },
        '3 seconds',
      );
      expect(heard.build).toBeGreaterThan(second);
    }).pipe(Effect.scoped, Effect.provide(Platform)),
  );
});
