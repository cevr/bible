/** The readable-artifact half of Electron main's §3.5 states, under the real
 *  Node runtime.
 *
 *  Separated from `wiki-artifact.test.ts` for one reason: `bun test`
 *  substitutes its own `node:sqlite`, built with `SQLITE_OMIT_LOAD_EXTENSION`,
 *  which cannot open the `file:…?immutable=1` URI Electron main's driver uses.
 *  Absent and corrupt are decided before any driver opens anything and are
 *  covered there; *reading* an installed artifact needs the runtime the desktop
 *  actually ships, which is what `test:electron-native` provides.
 */

import { NodeFileSystem } from '@effect/platform-node';
import { TopicService } from '@bible/core/topics';
import {
  layerArtifactOrAbsent,
  layerReloadableArtifact,
  ReloadableArtifact,
  topicSlug,
  WikiSectionSources,
  WikiService,
} from '@bible/core/wiki';

// The *same* driver `electron/runtime.ts` provides in production, imported
// rather than re-declared. A test that rebuilds the three options it exists to
// check keeps passing while the runtime regresses — which is what the comment
// this import replaced used to deny while doing exactly that.
import { topicsArtifactDriver as driver } from '../electron/topics-artifact-driver.js';
import { describe, expect, it } from '@effect/vitest';
import { Effect, FileSystem, Layer, Option } from 'effect';
import { DatabaseSync } from 'node:sqlite';

const write = (file: string, slug = 'sanctuary', title = 'The Sanctuary'): void => {
  const database = new DatabaseSync(file);
  database.exec(`
    CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE topics (slug TEXT PRIMARY KEY, title TEXT NOT NULL, thesis_ast TEXT NOT NULL, body_ast TEXT NOT NULL, position INTEGER NOT NULL);
    CREATE TABLE topic_aliases (alias TEXT PRIMARY KEY, display TEXT NOT NULL, slug TEXT NOT NULL, canonical INTEGER NOT NULL);
    CREATE TABLE topic_edges (from_slug TEXT NOT NULL, to_slug TEXT NOT NULL, kind TEXT NOT NULL, position INTEGER NOT NULL, PRIMARY KEY (from_slug, to_slug, kind));
    CREATE TABLE topic_catalog_keys (slug TEXT PRIMARY KEY, catalog_id TEXT NOT NULL, matched_by TEXT NOT NULL);
    INSERT INTO meta (key, value) VALUES ('schema_major', '1');
  `);
  database
    .prepare('INSERT INTO topics (slug, title, thesis_ast, body_ast, position) VALUES (?,?,?,?,0)')
    .run(slug, title, '[]', '[]');
  database.close();
};

describe('electron main topics artifact (native)', () => {
  it.effect('reads an installed artifact read-only through the Node driver', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs
        .makeTempDirectoryScoped({ prefix: 'bible-electron-wiki-native-' })
        .pipe(Effect.orDie);
      const file = `${directory}/topics.db`;
      yield* Effect.sync(() => write(file));

      yield* Effect.gen(function* () {
        const service = yield* WikiService;
        // The artifact exists and is readable, so no absence and no failure —
        // the third of the three states, and the one that proves the read-only
        // no-create driver did not break the normal path while fixing the
        // missing-file one.
        expect(Option.isNone(yield* service.availability)).toBe(true);
        const page = yield* service.topic(topicSlug('sanctuary'));
        expect(page.status).toBe('flagship');
        expect(page.title).toBe('The Sanctuary');
      }).pipe(
        Effect.provide(
          layerArtifactOrAbsent(driver, file).pipe(
            Layer.provide(TopicService.Test([])),
            Layer.provide(WikiSectionSources.NotWired),
          ),
        ),
      );
    }).pipe(Effect.scoped, Effect.provide(NodeFileSystem.layer)),
  );

  /** §3.6's reload, through the driver Electron main actually loads.
   *
   *  The portable suite proves the reload seam over `bun:sqlite`
   *  (`packages/core/src/wiki/service-reload.test.ts`). What it cannot prove is
   *  that *this* driver participates: `node:sqlite` spells no-create through
   *  `readonly` rather than a `create` flag, and it is the driver whose
   *  `immutable=1` inode caused the finding in the first place. So the swap is
   *  re-run here, on the runtime the desktop ships — which is also the only
   *  runtime that can open the URI at all.
   *
   *  Two artifacts, one path, one rename between them, and content that exists
   *  only in the second. */
  it.effect('serves the new artifact after a reload, through the Node driver', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs
        .makeTempDirectoryScoped({ prefix: 'bible-electron-wiki-reload-' })
        .pipe(Effect.orDie);
      const file = `${directory}/topics.db`;
      const staged = `${directory}/topics.db.building`;
      yield* Effect.sync(() => write(file));

      yield* Effect.gen(function* () {
        const wiki = yield* WikiService;
        const artifact = yield* ReloadableArtifact;

        const slugs = () => Effect.map(wiki.list({}), (pages) => pages.map((p) => String(p.slug)));
        expect(yield* slugs()).toEqual(['sanctuary']);

        yield* Effect.sync(() => write(staged, 'investigative-judgment', 'The Judgment'));
        yield* fs.rename(staged, file).pipe(Effect.orDie);

        // The inode this driver holds is the old one, which is the whole
        // reason the reload seam exists.
        expect(yield* slugs()).toEqual(['sanctuary']);

        yield* artifact.reload;
        expect(yield* slugs()).toEqual(['investigative-judgment']);
        expect((yield* wiki.topic(topicSlug('investigative-judgment'))).title).toBe('The Judgment');
      }).pipe(
        Effect.provide(
          layerReloadableArtifact(driver, file).pipe(
            Layer.provide(TopicService.Test([])),
            Layer.provide(WikiSectionSources.NotWired),
          ),
        ),
      );
    }).pipe(Effect.scoped, Effect.provide(NodeFileSystem.layer)),
  );
});
