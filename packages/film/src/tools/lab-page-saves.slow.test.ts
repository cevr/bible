// A lab page's wait and a save: a change to a file the page was built from
// (its source, its HTML entry, another package's source, a file only its
// server entry reads) wakes a waiting page and the next ask is the new code;
// a change to a file no build read wakes nothing. The app is in a temp
// folder, where the box's watch is the question (`fixtures/lab-app.ts`).

import { describe, expect, it } from 'effect-bun-test';
import { Effect, Option } from 'effect';
import { Platform, html, app, buildOf } from './fixtures/lab-app.ts';

describe('a save to a file a build read', () => {
  it.live(
    'a change to a file the page was built from wakes a wait, and the page is the new code',
    () =>
      Effect.gen(function* () {
        const { ask, script, waitWriting } = yield* app;
        yield* ask('/');
        const { build } = yield* waitWriting(
          0,
          '10 seconds',
          'src/p.ts',
          "console.log('second');\n",
        );
        expect(build).toBeGreaterThan(0);
        expect(buildOf((yield* ask('/')).text)).toBeGreaterThanOrEqual(build);
        expect(yield* script).toContain('second');
      }).pipe(Effect.scoped, Effect.provide(Platform)),
  );

  it.live(
    "the build's other files wake a wait too: its HTML entry, and another package's source",
    () =>
      Effect.gen(function* () {
        const { ask, script, waitWriting } = yield* app;
        yield* ask('/');
        const entry = yield* waitWriting(
          0,
          '10 seconds',
          'review.html',
          html('looked', './src/p.ts'),
        );
        expect(entry.build).toBeGreaterThan(0);
        expect((yield* ask('/')).text).toContain('<title>looked</title>');
        const shared = yield* waitWriting(
          entry.build,
          '10 seconds',
          'lib/shared.ts',
          "export const shared = 'shared two';\n",
        );
        expect(shared.build).toBeGreaterThan(entry.build);
        expect(yield* script).toContain('shared two');
      }).pipe(Effect.scoped, Effect.provide(Platform)),
  );

  it.live(
    'a file only the server entry reads is a file the pages were built from: its change wakes a wait',
    () =>
      Effect.gen(function* () {
        const { ask, page, waitWriting } = yield* app;
        yield* ask('/');
        const settled = (yield* page.wait(
          { since: 0, server: Option.none(), film: Option.none() },
          '1 second',
        )).build;
        const { build } = yield* waitWriting(
          settled,
          '10 seconds',
          'lib/server-only.ts',
          "export const only = 'server two';\n",
        );
        expect(build).toBeGreaterThan(settled);
      }).pipe(Effect.scoped, Effect.provide(Platform)),
  );

  it.live('a change to a file no build read wakes nothing', () =>
    Effect.gen(function* () {
      const { ask, page, waitWriting } = yield* app;
      yield* ask('/');
      // The first build may count once a save it read in the last second: the build once that is heard.
      const settled = (yield* page.wait(
        { since: 0, server: Option.none(), film: Option.none() },
        '1 second',
      )).build;
      const { build } = yield* waitWriting(settled, '1 second', 'src/notes.json', '{"seq":1}');
      expect(build).toBe(settled);
    }).pipe(Effect.scoped, Effect.provide(Platform)),
  );
});
