import { describe, expect, it } from 'bun:test';
import { Option, Schema } from 'effect';

import { Reference as BibleReference } from '@bible/core/bible';
import {
  ArchivedBibleReference,
  ArchivedParagraph,
  Paragraph,
  Publication,
  PublicationArchive,
  PublicationArchiveJson,
  Reference,
  publicationCode,
  publicationId,
  publicationOrder,
} from '@bible/core/writings';

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
  values: async () => [],
  write: async (sql, params) => {
    writes.push({ sql, params });
    return 1;
  },
  exec: async () => {},
});

const downloader: DatabaseFileDownloader = {
  download: async () => {},
};

const publicationIdValue = publicationId(127);
const publicationCodeValue = publicationCode('PP');
const archive = new PublicationArchive({
  publication: new Publication({
    id: publicationIdValue,
    code: publicationCodeValue,
    title: 'Patriarchs and Prophets',
    author: 'Ellen G. White',
    paragraphCount: Option.some(1),
  }),
  paragraphs: [
    new ArchivedParagraph({
      refcode: 'PP 1.1',
      paragraph: new Paragraph({
        reference: Reference.paragraph(publicationIdValue, '1'),
        publicationCode: publicationCodeValue,
        order: publicationOrder(1),
        page: Option.none(),
        number: Option.none(),
        refcode: Option.some('PP 1.1'),
        nodes: [{ _tag: 'Text', text: 'The opening paragraph.' }],
        elementType: Option.none(),
        elementSubtype: Option.none(),
      }),
      isHeading: false,
    }),
  ],
  bibleReferences: [
    new ArchivedBibleReference({
      paragraphRefcode: 'PP 1.1',
      scripture: BibleReference.verse(1, 1, 1),
    }),
  ],
});
const dump = Schema.encodeSync(PublicationArchiveJson)(archive);

describe('worker EGW database', () => {
  it('schema-decodes a publication dump before committing it', async () => {
    const writes: WriteCall[] = [];
    const progress: string[] = [];
    const installed: PublicationArchive[] = [];
    const database = makeWorkerEgwDatabase({
      database: makeDatabase(writes),
      downloader,
      fetch: async () => Response.json(dump),
      corpus: {
        initialize: async () => {},
        install: async (value) => {
          installed.push(value);
          return value.paragraphs.length;
        },
      },
    });

    expect(await database.syncBook('PP', (event) => progress.push(event.stage))).toBe(1);

    expect(progress).toEqual(['Fetching...', 'Parsing...', 'Installing...', 'Done']);
    expect(installed).toEqual([archive]);
    expect(writes).toEqual([]);
  });

  it('rejects a malformed dump before opening a transaction', async () => {
    const writes: WriteCall[] = [];
    const database = makeWorkerEgwDatabase({
      database: makeDatabase(writes),
      downloader,
      fetch: async () => Response.json({ book: { bookCode: 'PP' } }),
      corpus: {
        initialize: async () => {},
        install: async () => 0,
      },
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
