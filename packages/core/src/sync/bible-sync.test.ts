import { BunServices } from '@effect/platform-bun';
import { Effect, FileSystem, Path, Schema } from 'effect';
import { describe, expect, it } from 'effect-bun-test';

import { BibleDatabase } from '../bible-db/bible-database.js';
import * as BibleDatabaseBun from '../bible-db/bible-database-bun.js';
import { syncBible } from './bible-sync.js';

const encodeJson = Schema.encodeSync(Schema.UnknownFromJsonString);

const writeAsset = Effect.fn('BibleSyncTest.writeAsset')(function* (
  assetsDirectory: string,
  name: string,
  value: unknown,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  yield* fs.writeFileString(path.join(assetsDirectory, name), encodeJson(value));
});

const readGenesis = (database: string) =>
  Effect.gen(function* () {
    const bible = yield* BibleDatabase;
    return (yield* bible.getChapter(1, 1))[0]?.text ?? '';
  }).pipe(Effect.provide(BibleDatabaseBun.layerBun(database)));

describe('Bible sync', () => {
  const test = it.scopedLive.layer(BunServices.layer);

  test('atomically builds the canonical schema and preserves an existing database without force', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: 'bible-sync-' });
      const assetsDirectory = path.join(directory, 'assets');
      const database = path.join(directory, 'bible.db');
      const runtimeDatabase = path.join(directory, 'runtime', 'bible.db');
      yield* fs.makeDirectory(assetsDirectory, { recursive: true });
      yield* writeAsset(assetsDirectory, 'kjv.json', {
        metadata: { name: 'King James Version', year: '1611/1769' },
        verses: [{ book_name: 'Genesis', book: 1, chapter: 1, verse: 1, text: 'In the beginning' }],
      });
      yield* writeAsset(assetsDirectory, 'kjv-strongs.json', [
        {
          book: 1,
          chapter: 1,
          verse: 1,
          words: [{ text: 'In' }, { text: 'beginning', strongs: ['H7225'] }],
        },
      ]);
      yield* writeAsset(assetsDirectory, 'strongs.json', {
        H7225: { lemma: 'reshith', xlit: 'reshith', def: 'beginning' },
      });
      yield* writeAsset(assetsDirectory, 'cross-refs.json', {
        '1.1.1': { refs: [{ book: 43, chapter: 1, verse: 1 }] },
      });
      yield* writeAsset(assetsDirectory, 'cross-refs-tske.json', {
        '1.1.1': { refs: [{ book: 58, chapter: 1, verse: 1 }] },
      });
      yield* writeAsset(assetsDirectory, 'margin-notes.json', {
        '1.1.1': [{ type: 'hebrew', phrase: 'beginning', text: 'First in order' }],
      });
      yield* writeAsset(assetsDirectory, 'naves-topical-bible.json', {
        meta: {
          id: 'test-topics',
          title: 'Test topics',
          license: 'public-domain',
          provenance: { source_url: 'https://example.test/topics', source_hash: 'test-hash' },
        },
        data: [
          {
            entry_id: 'test-topics.creation',
            topic: 'CREATION',
            alt_topics: [],
            subtopics: [
              {
                label: 'General references',
                references: [{ raw: 'Gen 1:1', osis: ['Gen.1.1'] }],
              },
            ],
          },
        ],
      });

      yield* syncBible(true, { assetsDirectory, database, runtimeDatabase });

      expect(yield* readGenesis(database)).toBe('In the beginning');
      expect((yield* fs.readFile(runtimeDatabase)).byteLength).toBeGreaterThan(0);
      expect(yield* fs.exists(`${database}.building`)).toBe(false);

      yield* writeAsset(assetsDirectory, 'kjv.json', {
        metadata: { name: 'King James Version', year: '1611/1769' },
        verses: [{ book_name: 'Genesis', book: 1, chapter: 1, verse: 1, text: 'Changed source' }],
      });

      yield* syncBible(false, { assetsDirectory, database, runtimeDatabase });
      expect(yield* readGenesis(database)).toBe('In the beginning');
    }));
});
