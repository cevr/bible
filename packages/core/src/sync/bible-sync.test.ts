import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, test } from 'bun:test';
import { Effect } from 'effect';

import { BibleDatabase } from '../bible-db/bible-database.js';
import * as BibleDatabaseBun from '../bible-db/bible-database-bun.js';
import { syncBible } from './bible-sync.js';

const directory = mkdtempSync(join(tmpdir(), 'bible-sync-'));
const assetsDirectory = join(directory, 'assets');
const database = join(directory, 'bible.db');
const runtimeDatabase = join(directory, 'runtime', 'bible.db');

const writeAsset = (name: string, value: unknown): void => {
  writeFileSync(join(assetsDirectory, name), JSON.stringify(value));
};

const readGenesis = (): Promise<string> =>
  Effect.runPromise(
    Effect.gen(function* () {
      const bible = yield* BibleDatabase;
      return (yield* bible.getChapter(1, 1))[0]?.text ?? '';
    }).pipe(Effect.provide(BibleDatabaseBun.layerBun(database))),
  );

afterAll(() => rmSync(directory, { recursive: true, force: true }));

describe('Bible sync', () => {
  test('atomically builds the canonical schema and preserves an existing database without force', async () => {
    mkdirSync(assetsDirectory, { recursive: true });
    writeAsset('kjv.json', {
      metadata: { name: 'King James Version', year: '1611/1769' },
      verses: [{ book_name: 'Genesis', book: 1, chapter: 1, verse: 1, text: 'In the beginning' }],
    });
    writeAsset('kjv-strongs.json', [
      {
        book: 1,
        chapter: 1,
        verse: 1,
        words: [{ text: 'In' }, { text: 'beginning', strongs: ['H7225'] }],
      },
    ]);
    writeAsset('strongs.json', {
      H7225: { lemma: 'reshith', xlit: 'reshith', def: 'beginning' },
    });
    writeAsset('cross-refs.json', {
      '1.1.1': { refs: [{ book: 43, chapter: 1, verse: 1 }] },
    });
    writeAsset('cross-refs-tske.json', {
      '1.1.1': { refs: [{ book: 58, chapter: 1, verse: 1 }] },
    });
    writeAsset('margin-notes.json', {
      '1.1.1': [{ type: 'hebrew', phrase: 'beginning', text: 'First in order' }],
    });

    await syncBible(true, { assetsDirectory, database, runtimeDatabase });

    expect(await readGenesis()).toBe('In the beginning');
    expect(readFileSync(runtimeDatabase).byteLength).toBeGreaterThan(0);
    expect(existsSync(`${database}.building`)).toBe(false);

    const kjv = JSON.parse(readFileSync(join(assetsDirectory, 'kjv.json'), 'utf8')) as {
      verses: Array<{ text: string }>;
    };
    kjv.verses[0]!.text = 'Changed source';
    writeFileSync(join(assetsDirectory, 'kjv.json'), JSON.stringify(kjv));

    await syncBible(false, { assetsDirectory, database, runtimeDatabase });
    expect(await readGenesis()).toBe('In the beginning');
  });
});
