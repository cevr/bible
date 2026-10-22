// A lab page that does not build answers the bundler's words in the studio's
// look, asks again with a pause, and serves again once fixed: by a save of
// the fix, by its wait building again when no save comes, and when the fix
// lands in a folder no build read. A server entry that reads a film's code
// does not build. The app is in a temp folder (`fixtures/lab-app.ts`).

import { describe, expect, it } from 'effect-bun-test';
import {
  Array as Arr,
  Deferred,
  Effect,
  Exit,
  Fiber,
  FileSystem,
  Layer,
  Option,
  Path,
  Ref,
} from 'effect';
import { LONGEST_WAIT } from '../core/wait.ts';
import { PageBundler } from './lab-page.ts';
import {
  Platform,
  appFolderWith,
  appFolder,
  served,
  app,
  buildOf,
  serverOf,
} from './fixtures/lab-app.ts';

describe('a page that does not build', () => {
  it.live('a page that does not build answers the bundler, and serves again once fixed', () =>
    Effect.gen(function* () {
      const { ask, script, waitWriting } = yield* app;
      yield* ask('/');
      yield* waitWriting(0, '10 seconds', 'src/p.ts', "import './missing.ts';\n");
      const broken = yield* ask('/');
      expect(broken.status).toBe(500);
      expect(broken.text).toContain('missing.ts');
      // In the studio's look: its tokens, no colour of its own.
      expect(broken.text).toContain('--surface-0:');
      expect(broken.text).toContain('background:var(--surface-0)');
      // The failed build read nothing new; a fix to the file it last read is still heard.
      const built = buildOf(broken.text);
      yield* waitWriting(built, '10 seconds', 'src/p.ts', "console.log('fixed');\n");
      expect((yield* ask('/')).status).toBe(200);
      expect(yield* script).toContain('fixed');
    }).pipe(Effect.scoped, Effect.provide(Platform)),
  );

  it.live(
    "a server entry that reads a film's code, a scene's or the stills' drawing does not build, naming each; the browser's pages may",
    () =>
      Effect.gen(function* () {
        const { ask, page, write, waitWriting, spec } = yield* app;
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const stills = path.resolve(import.meta.dir, '..', 'player', 'stills.ts');
        for (const folder of [
          path.join(spec.films, 'toy', 'scenes'),
          path.join(path.dirname(spec.pages.review), 'lib', 'scenes'),
        ])
          yield* fs.makeDirectory(folder, { recursive: true });
        yield* write('src/films/toy/scenes/one.ts', "export const one = 'scene one';\n");
        yield* write('src/films/toy/scenes/shown.ts', "export const shown = 'drawn';\n");
        yield* write('lib/scenes/two.ts', "export const two = 'scene two';\n");
        // The browser's page draws the film: allowed.
        yield* write(
          'src/p.ts',
          "import { shown } from './films/toy/scenes/shown.ts';\nconsole.log(shown);\n",
        );
        yield* write(
          'src/review.server.tsx',
          `import { one } from './films/toy/scenes/one.ts';\nimport { two } from '../lib/scenes/two.ts';\nimport { makeStills } from '${stills}';\nexport const rendered = () => [one, two, typeof makeStills].join(' ');\n`,
        );
        const refused = yield* ask('/');
        expect(refused.status).toBe(500);
        const failed = Option.getOrElse((yield* page.built).failed, () => '');
        expect(failed).toContain('draws no film');
        expect(failed).toContain('films/toy/scenes/one.ts');
        expect(failed).toContain('lib/scenes/two.ts');
        expect(failed).toContain('player/stills.ts');
        expect(failed).not.toContain('shown.ts');
        // The server entry drawing none: the pages build, the browser's still drawing the film.
        yield* waitWriting(
          buildOf(refused.text),
          '10 seconds',
          'src/review.server.tsx',
          "export const rendered = () => 'none';\n",
        );
        expect((yield* ask('/')).status).toBe(200);
      }).pipe(Effect.scoped, Effect.provide(Platform)),
  );

  it.live("a build that fails is the look's failure, in the bundler's words", () =>
    Effect.gen(function* () {
      const { ask, page, write } = yield* app;
      yield* ask('/');
      yield* write('src/p.ts', "import './missing.ts';\n");
      const now = yield* page.built;
      expect(Option.getOrElse(now.failed, () => '')).toContain('missing.ts');
    }).pipe(Effect.scoped, Effect.provide(Platform)),
  );

  it.live('a first build that fails hears one save of its fix, with no build before it', () =>
    Effect.gen(function* () {
      const { spec, write } = yield* appFolderWith({ 'src/p.ts': "import './missing.ts';\n" });
      const { page, ask } = yield* served(spec, PageBundler.layer);
      const broken = yield* ask('/');
      expect(broken.status).toBe(500);
      const since = buildOf(broken.text);
      yield* write('src/p.ts', "console.log('fixed cold');\n");
      const heard = yield* page.wait(
        { since, server: Option.none(), film: Option.none() },
        '5 seconds',
      );
      expect(heard.build).toBeGreaterThan(since);
      expect((yield* ask('/')).status).toBe(200);
    }).pipe(Effect.scoped, Effect.provide(Platform)),
  );

  it.live(
    'a page that failed for a file in a folder no build read: its wait alone builds again, hears the fix, and the page then serves',
    () =>
      Effect.gen(function* () {
        // The bundler names the importer (src/p.ts), never lib/, where the fix lands.
        const { spec, write } = yield* appFolderWith({
          'src/p.ts': "import { gone } from '../lib/missing.ts';\nconsole.log(gone);\n",
        });
        const { page, ask } = yield* served(spec, PageBundler.layer);
        const broken = yield* ask('/');
        expect(broken.status).toBe(500);
        const since = buildOf(broken.text);
        // The failed page's wait, as its own script asks it; no page is asked meanwhile.
        const waiting = yield* Effect.forkChild(
          page.wait({ since, server: Option.none(), film: Option.none() }, '5 seconds'),
        );
        yield* write('lib/missing.ts', "export const gone = 'made';\n");
        const heard = yield* Fiber.join(waiting);
        expect(heard.build).toBeGreaterThan(since);
        // The page it reloads onto, asked once: the build the wait made, served.
        const fixed = yield* ask('/');
        expect([fixed.status, buildOf(fixed.text)]).toEqual([200, heard.build]);
      }).pipe(Effect.scoped, Effect.provide(Platform)),
  );

  it.live(
    'a failed page whose next build would build, with no save to hear, is woken by its wait building again',
    () =>
      Effect.gen(function* () {
        const { spec } = yield* appFolder;
        // The bundler fails its first two builds and builds the third, whatever the files:
        // as Bun's resolver did, holding a folder as a failed build listed it a moment ago.
        const bundles = yield* Ref.make(0);
        const flaky = Layer.effect(
          PageBundler,
          Effect.gen(function* () {
            const bundler = yield* PageBundler;
            return PageBundler.of({
              bundle: (entries, root, how) =>
                Effect.flatMap(
                  Ref.updateAndGet(bundles, (n) => n + 1),
                  (n) => {
                    if (n <= 2) return Effect.fail({ reason: `stale resolve ${n}`, files: [] });
                    return bundler.bundle(entries, root, how);
                  },
                ),
            });
          }),
        ).pipe(Layer.provide(PageBundler.layerTest));
        const { page, ask } = yield* served(spec, flaky);
        const broken = yield* ask('/');
        expect([broken.status, broken.text.includes('stale resolve 1')]).toEqual([500, true]);
        const since = buildOf(broken.text);
        // The failed page's wait, as its own script asks it; nothing is saved, no page asked.
        const heard = yield* page.wait(
          { since, server: Option.none(), film: Option.none() },
          '5 seconds',
        );
        expect(heard.build).toBeGreaterThan(since);
        const fixed = yield* ask('/');
        expect([fixed.status, buildOf(fixed.text)]).toEqual([200, heard.build]);
      }).pipe(Effect.scoped, Effect.provide(Platform)),
  );

  it.live(
    'a page that does not build asks again with a pause on every answer but newer code, and reloads once',
    () =>
      Effect.gen(function* () {
        const { ask, waitWriting } = yield* app;
        yield* ask('/');
        yield* waitWriting(0, '10 seconds', 'src/p.ts', "import './missing.ts';\n");
        const broken = (yield* ask('/')).text;
        const code = /<script>([\s\S]*)<\/script>/.exec(broken)?.[1] ?? '';
        const server = serverOf(broken);
        const build = buildOf(broken);
        // What the page hears: a proxy's 502, no answer, its own build again, then another server's.
        const answers = [
          { ok: false, json: {} },
          'unreachable',
          { ok: true, json: { build, server } },
          { ok: true, json: { build: 0, server: 'another' } },
        ] as const;
        const heard: Array<string> = [];
        let asked = 0;
        const reloaded = Deferred.makeUnsafe<void>();
        const fakeFetch = (url: string) => {
          heard.push(`ask ${url}`);
          // A page that asks past its last answer has missed newer code: the test ends there.
          if (asked >= answers.length) {
            Deferred.doneUnsafe(reloaded, Exit.void);
            return Effect.runPromise(Effect.never);
          }
          const answer = Arr.get(answers, asked);
          asked += 1;
          return Effect.runPromise(
            Option.match(
              Option.filter(answer, (a) => a !== 'unreachable'),
              {
                onNone: () => Effect.die('no answer'),
                onSome: (a) =>
                  Effect.succeed({
                    ok: a.ok,
                    json: () => Effect.runPromise(Effect.succeed(a.json)),
                  }),
              },
            ),
          );
        };
        const fakeTimeout = (resume: () => void, ms: number) => {
          heard.push(`pause ${ms}`);
          resume();
        };
        const location = {
          reload: () => {
            heard.push('reload');
            Deferred.doneUnsafe(reloaded, Exit.void);
          },
        };
        // The page's own script, run over a fake fetch, location and timer.
        new Function('fetch', 'location', 'setTimeout', code)(fakeFetch, location, fakeTimeout);
        yield* Deferred.await(reloaded);
        const wait = `/api/review/build?since=${build}&server=${server}&timeout=${LONGEST_WAIT}`;
        expect(heard).toEqual([
          `ask ${wait}`,
          'pause 2000',
          `ask ${wait}`,
          'pause 2000',
          `ask ${wait}`,
          'pause 2000',
          `ask ${wait}`,
          'reload',
        ]);
      }).pipe(Effect.scoped, Effect.provide(Platform)),
  );
});
