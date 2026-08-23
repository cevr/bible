/** Electron main's three §3.5 artifact states, over the real Node SQLite driver.
 *
 *  This file exists because the driver is the part that gets this wrong.
 *  `node:sqlite` **creates** a missing database by default, so a host that
 *  opens `topics.db` without an existence check and without `readOnly` turns
 *  "no artifact installed" — the steady state until the first content release
 *  — into an empty file that reports itself corrupt on the first query and then
 *  stays on disk. The composer and the service are portable and already tested
 *  in core; what is host-specific, and what is asserted here, is that Electron
 *  main resolves absent / readable / corrupt exactly as the Bun host does.
 */

import { NodeFileSystem } from '@effect/platform-node';
import { TopicService } from '@bible/core/topics';
import {
  layerArtifactOrAbsent,
  topicSlug,
  WikiSectionSources,
  WikiService,
} from '@bible/core/wiki';

// The *same* driver `electron/runtime.ts` provides in production, imported
// rather than re-declared. A test that rebuilds the three options it exists to
// check keeps passing while the runtime regresses — which is what the comment
// this import replaced used to deny while doing exactly that.
import { topicsArtifactDriver as driver } from '../electron/topics-artifact-driver.js';
import { Effect, FileSystem, Layer, Option, type Scope } from 'effect';
import { describe, expect, it } from 'effect-bun-test';

const catalog = TopicService.Test([]);

const wiki = (file: string): Layer.Layer<WikiService, never, FileSystem.FileSystem> =>
  layerArtifactOrAbsent(driver, file).pipe(
    Layer.provide(catalog),
    Layer.provide(WikiSectionSources.NotWired),
  );

const tempDirectory = (
  prefix: string,
): Effect.Effect<string, never, FileSystem.FileSystem | Scope.Scope> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    return yield* fs.makeTempDirectoryScoped({ prefix }).pipe(Effect.orDie);
  });

/** What the service reports when nothing is installed at `file`. The layer is
 *  provided at this function's own boundary rather than inside a test's
 *  generator. */
const expectAbsence = (file: string) =>
  Effect.gen(function* () {
    const service = yield* WikiService;
    // Absence, not corruption. Before the fix the driver created the file
    // and the first query failed against an empty database, so this read
    // `corrupt` — the operator saw a broken install where there was simply
    // nothing installed yet.
    expect(yield* service.availability).toEqual(Option.some('artifact-not-installed'));
    const page = yield* service.topic(topicSlug('sanctuary'));
    expect(page.status).toBe('catalog');
    expect(page.unavailable).toEqual(Option.some('artifact-not-installed'));
  }).pipe(Effect.provide(wiki(file)));

/** What it reports when `file` exists but will not open. */
const expectUnreadable = (file: string) =>
  Effect.gen(function* () {
    const service = yield* WikiService;
    const failure = yield* Effect.flip(service.availability);
    // Either the open or the first statement rejects it, depending on when
    // the driver reads the header; both are the present-but-broken half of
    // the split, and neither is `artifact-not-installed`.
    expect(['open-failed', 'corrupt']).toContain(failure.category);
  }).pipe(Effect.provide(wiki(file)));

describe('electron main topics artifact', () => {
  const test = it.scopedLive.layer(NodeFileSystem.layer);

  test('reports a missing artifact as absence and creates no file', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* tempDirectory('bible-electron-wiki-absent-');
      const file = `${directory}/topics.db`;

      yield* expectAbsence(file);

      // And nothing was written. A stray zero-table `topics.db` would make the
      // *next* launch report a corrupt artifact even after the check was fixed,
      // so the absence of the file is as load-bearing as the absence value.
      expect(yield* fs.exists(file).pipe(Effect.orDie)).toBe(false);
    }));

  test('reports a present-but-unreadable artifact as a typed failure', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* tempDirectory('bible-electron-wiki-corrupt-');
      const file = `${directory}/topics.db`;
      // Bytes that are emphatically not SQLite. The file exists, so this must
      // stay distinguishable from absence: an artifact that will not open is a
      // fault the operator has to see, not a degradation to smooth over.
      yield* fs.writeFileString(file, 'not a database at all').pipe(Effect.orDie);

      yield* expectUnreadable(file);
    }));

  // The readable-artifact half of the split runs under the real Node runtime in
  // `wiki-artifact-native.test.ts`: `bun test` substitutes its own `node:sqlite`
  // build, which is compiled with `SQLITE_OMIT_LOAD_EXTENSION` and cannot open
  // the `file:…?immutable=1` URI the driver uses. The two states this file
  // *does* cover — absent and corrupt — are decided before any driver opens
  // anything, which is exactly why they are testable here.
});
