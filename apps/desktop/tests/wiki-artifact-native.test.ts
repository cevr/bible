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

const write = (file: string): void => {
  const database = new DatabaseSync(file);
  database.exec(`
    CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE topics (slug TEXT PRIMARY KEY, title TEXT NOT NULL, thesis_ast TEXT NOT NULL, body_ast TEXT NOT NULL, position INTEGER NOT NULL);
    CREATE TABLE topic_aliases (alias TEXT PRIMARY KEY, display TEXT NOT NULL, slug TEXT NOT NULL, canonical INTEGER NOT NULL);
    CREATE TABLE topic_edges (from_slug TEXT NOT NULL, to_slug TEXT NOT NULL, kind TEXT NOT NULL, position INTEGER NOT NULL, PRIMARY KEY (from_slug, to_slug, kind));
    CREATE TABLE topic_catalog_keys (slug TEXT PRIMARY KEY, catalog_id TEXT NOT NULL, matched_by TEXT NOT NULL);
    INSERT INTO meta (key, value) VALUES ('schema_major', '1');
    INSERT INTO topics (slug, title, thesis_ast, body_ast, position)
      VALUES ('sanctuary', 'The Sanctuary', '[]', '[]', 0);
  `);
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
});
