import { describe, expect, test } from 'bun:test';
import { Effect, Layer, Option, Stream } from 'effect';

import { EGWParagraphDatabase } from '../egw-db/book-database.js';
import { EGWApiClient, type EGWApiClientService } from '../egw/client.js';
import type { Book, Paragraph, TocItem } from '../egw/schemas.js';
import type { PublicationArchive } from '../writings/archive.js';
import { publicationId } from '../writings/model.js';
import { Target } from './model.js';
import { CorpusSupply } from './service.js';
import { layerEgwWritingsAssetSource } from './writings-egw-source.js';

const book: Book = {
  book_id: 127,
  code: 'PP',
  lang: 'en',
  type: 'book',
  title: 'Patriarchs and Prophets',
  author: 'Ellen G. White',
  npages: 1,
  pub_year: '1890',
  folder_id: 1,
  cover: {},
  files: {},
  permission_required: 'public',
  sort: 1,
  is_audiobook: false,
  nelements: 1,
};
const toc: TocItem = {
  para_id: Option.some('chapter-1'),
  level: 1,
  refcode_short: Option.some('PP 1'),
  puborder: 1,
};
const paragraph: Paragraph = {
  para_id: Option.some('pp-1-1'),
  id_prev: null,
  id_next: null,
  refcode_1: null,
  refcode_2: null,
  refcode_3: null,
  refcode_4: null,
  refcode_short: Option.some('PP 1.1'),
  refcode_long: null,
  element_type: 'p',
  element_subtype: null,
  nodes: [
    {
      _tag: 'ScriptureRef',
      title: 'Genesis 1:1',
      dataLink: '1965.1',
      children: [{ _tag: 'Text', text: 'Genesis 1:1' }],
    },
  ],
  puborder: 1,
};

const api: EGWApiClientService = {
  getLanguages: () => Effect.succeed([]),
  getFoldersByLanguage: () => Effect.succeed([]),
  getBooksByFolder: () => Effect.succeed([]),
  getBooks: () => Stream.fromIterable([book]),
  getBook: () => Effect.succeed(book),
  getBookToc: () => Effect.succeed([toc]),
  getChapterContent: () => Effect.succeed([paragraph]),
  downloadBook: () => Effect.succeed(new ArrayBuffer(0)),
  search: () => Effect.succeed({ next: null, previous: null, total: 0, count: 0, results: [] }),
  getSuggestions: () => Effect.succeed([]),
  getBookCoverUrl: () => Effect.succeed('https://example.test/cover'),
  getMirrors: () => Effect.succeed([]),
};

describe('direct EGW Writings asset source', () => {
  test('coerces a complete provider publication before installation', async () => {
    const installed: PublicationArchive[] = [];
    const database = EGWParagraphDatabase.Test({
      needsSync: () => true,
      installPublicationArchive: (archive) => {
        installed.push(archive);
        return archive.paragraphs.length;
      },
    });
    const source = layerEgwWritingsAssetSource.pipe(
      Layer.provide(Layer.succeed(EGWApiClient, EGWApiClient.of(api))),
    );
    const layer = CorpusSupply.layer.pipe(Layer.provide(source), Layer.provide(database));

    await Effect.runPromise(
      Effect.flatMap(CorpusSupply, (supply) =>
        supply.ensure({ target: Target.writings([publicationId(127)]), refresh: true }),
      ).pipe(Effect.provide(layer)),
    );

    expect(installed).toHaveLength(1);
    expect(String(installed[0]?.paragraphs[0]?.paragraph.reference.paragraphId)).toBe('pp-1-1');
    expect(installed[0]?.bibleReferences[0]?.scripture).toMatchObject({
      _tag: 'verse',
      book: 1,
      chapter: 1,
      verse: 1,
    });
  });
});
