import { describe, expect, it } from 'bun:test';

import type { DatabaseFileDownloader } from './database-file-downloader.js';
import { makeWorkerEgwDatabase } from './egw-database.js';
import type { SqliteDatabase } from './sqlite-database.js';

interface WriteCall {
  readonly sql: string;
  readonly params: readonly unknown[] | undefined;
}

const makeDatabase = (writes: WriteCall[]): SqliteDatabase => ({
  isOpen: true,
  open: async () => {},
  close: async () => {},
  query: async () => [],
  write: async (sql, params) => {
    writes.push({ sql, params });
    return 1;
  },
  exec: async () => {},
});

const downloader: DatabaseFileDownloader = {
  download: async () => {},
};

const dump = {
  book: {
    bookId: 127,
    bookCode: 'PP',
    title: 'Patriarchs and Prophets',
    author: 'Ellen G. White',
    paragraphCount: 1,
  },
  paragraphs: [
    {
      refCode: 'PP 1.1',
      paraId: '1',
      refcodeShort: 'PP 1.1',
      nodes: [{ _tag: 'Text', text: 'The opening paragraph.' }],
      puborder: 1,
      elementType: null,
      elementSubtype: null,
      pageNumber: 1,
      paragraphNumber: 1,
      isChapterHeading: false,
    },
  ],
  bibleRefs: [{ refCode: 'PP 1.1', bibleBook: 1, bibleChapter: 1, bibleVerse: 1 }],
};

describe('worker EGW database', () => {
  it('schema-decodes a publication dump before committing it', async () => {
    const writes: WriteCall[] = [];
    const progress: string[] = [];
    const database = makeWorkerEgwDatabase({
      database: makeDatabase(writes),
      downloader,
      fetch: async () => Response.json(dump),
    });

    expect(await database.syncBook('PP', (event) => progress.push(event.stage))).toBe(1);

    expect(progress).toEqual([
      'Fetching...',
      'Parsing...',
      'Inserting...',
      'Bible refs...',
      'Indexing...',
      'Done',
    ]);
    expect(writes[0]?.sql).toBe('BEGIN IMMEDIATE');
    const paragraphInsert = writes.find((call) =>
      call.sql.includes('INSERT OR REPLACE INTO paragraphs'),
    );
    expect(paragraphInsert?.params?.[4]).toBeNull();
    expect(paragraphInsert?.params?.[6]).toBe('The opening paragraph.');
    expect(writes.some((call) => call.sql === 'COMMIT')).toBe(true);
  });

  it('rejects a malformed dump before opening a transaction', async () => {
    const writes: WriteCall[] = [];
    const database = makeWorkerEgwDatabase({
      database: makeDatabase(writes),
      downloader,
      fetch: async () => Response.json({ book: { bookCode: 'PP' } }),
    });

    const error = await database
      .syncBook('PP', () => {})
      .then(
        () => undefined,
        (cause: unknown) => cause,
      );
    expect(error).toBeDefined();
    expect(writes).toEqual([]);
  });
});
