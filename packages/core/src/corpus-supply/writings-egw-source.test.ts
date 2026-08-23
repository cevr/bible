import { Effect, Layer, Option, Stream } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { strToU8, zipSync } from 'fflate';

import { EGWParagraphDatabase } from '../egw-db/book-database.js';
import { EGWApiClient, type EGWApiClientService } from '../egw/client.js';
import type { Book, Paragraph, TocItem } from '../egw/schemas.js';
import type { PublicationArchive } from '../writings/archive.js';
import { publicationId } from '../writings/model.js';
import { Target } from './model.js';
import { CorpusSupply } from './service.js';
import { layerEgwWritingsAssetSource } from './writings-egw-source.js';

// Wire-shape fields the schema encodes as `null` when absent.
const wireNull = Option.getOrNull(Option.none<never>());

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
  id_prev: wireNull,
  id_next: wireNull,
  refcode_1: wireNull,
  refcode_2: wireNull,
  refcode_3: wireNull,
  refcode_4: wireNull,
  refcode_short: Option.some('PP 1.1'),
  refcode_long: wireNull,
  element_type: 'p',
  element_subtype: wireNull,
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
  getLanguages: Effect.succeed([]),
  getFoldersByLanguage: () => Effect.succeed([]),
  getBooksByFolder: () => Effect.succeed([]),
  getBooks: () => Stream.fromIterable([book]),
  getBook: () => Effect.succeed(book),
  getBookToc: () => Effect.succeed([toc]),
  getChapterContent: () => Effect.succeed([paragraph]),
  downloadBook: () => Effect.succeed(new ArrayBuffer(0)),
  search: () =>
    Effect.succeed({ next: wireNull, previous: wireNull, total: 0, count: 0, results: [] }),
  getSuggestions: () => Effect.succeed([]),
  getBookCoverUrl: () => Effect.succeed('https://example.test/cover'),
  getMirrors: Effect.succeed([]),
};

/** The supply round at its own boundary. Each test composes its own layer from
 *  that test's API double, so the provide belongs here rather than to a block
 *  nested inside the test's generator. */
const ensureWritings = (layer: Layer.Layer<CorpusSupply>) =>
  Effect.flatMap(CorpusSupply, (supply) =>
    supply.ensure({ target: Target.writings([publicationId(127)]), refresh: true }),
  ).pipe(Effect.provide(layer));

describe('direct EGW Writings asset source', () => {
  it.effect('installs a provider download archive without chapter requests', () =>
    Effect.gen(function* () {
      const installed: PublicationArchive[] = [];
      const archiveBook: Book = {
        ...book,
        author: '',
        download: '/content/books/127/download',
      };
      const zipped = zipSync({
        'info.json': strToU8('{"book_id":127}'),
        'toc.json': strToU8('[]'),
        '127.1.json': strToU8(
          '[{"para_id":"pp-download-1","id_prev":null,"id_next":null,"refcode_1":"PP","refcode_2":"1","refcode_3":"1","refcode_4":"","refcode_short":"PP 1.1","refcode_long":"Patriarchs and Prophets, p. 1","element_type":"p","element_subtype":"","content":"Downloaded paragraph","puborder":1}]',
        ),
      });
      const database = EGWParagraphDatabase.Test({
        needsSync: () => true,
        installPublicationArchive: (archive) => {
          installed.push(archive);
          return archive.paragraphs.length;
        },
      });
      const source = layerEgwWritingsAssetSource.pipe(
        Layer.provide(
          Layer.succeed(
            EGWApiClient,
            EGWApiClient.of({
              ...api,
              getBook: () => Effect.succeed(archiveBook),
              getBookToc: () => Effect.die('The archive path must not request the TOC'),
              getChapterContent: () => Effect.die('The archive path must not request chapters'),
              downloadBook: () => Effect.succeed(Uint8Array.from(zipped).buffer),
            }),
          ),
        ),
      );
      const layer = CorpusSupply.layer.pipe(Layer.provide(source), Layer.provide(database));

      yield* ensureWritings(layer);

      expect(installed[0]?.paragraphs).toHaveLength(1);
      expect(installed[0]?.paragraphs[0]?.refcode).toBe('pp-download-1');
      expect(installed[0]?.publication.author).toBe('Unknown author');
    }),
  );

  it.effect('coerces a complete provider publication before installation', () =>
    Effect.gen(function* () {
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

      yield* ensureWritings(layer);

      expect(installed).toHaveLength(1);
      expect(String(installed[0]?.paragraphs[0]?.paragraph.reference.paragraphId)).toBe('pp-1-1');
      expect(installed[0]?.paragraphs[0]?.refcode).toBe('pp-1-1');
      const displayRefcode = Option.fromNullishOr(installed[0]?.paragraphs[0]).pipe(
        Option.flatMap((item) => item.paragraph.refcode),
        Option.getOrUndefined,
      );
      expect(displayRefcode).toBe('PP 1.1');
      expect(installed[0]?.bibleReferences[0]?.paragraphRefcode).toBe('pp-1-1');
      expect(installed[0]?.bibleReferences[0]?.scripture).toMatchObject({
        _tag: 'verse',
        book: 1,
        chapter: 1,
        verse: 1,
      });
    }),
  );

  it.effect('keeps duplicate display refcodes under unique provider paragraph IDs', () =>
    Effect.gen(function* () {
      const installed: PublicationArchive[] = [];
      const duplicateDisplayRefcode: Paragraph = {
        ...paragraph,
        para_id: Option.some('pp-1-2'),
        puborder: 2,
      };
      const database = EGWParagraphDatabase.Test({
        needsSync: () => true,
        installPublicationArchive: (archive) => {
          installed.push(archive);
          return archive.paragraphs.length;
        },
      });
      const source = layerEgwWritingsAssetSource.pipe(
        Layer.provide(
          Layer.succeed(
            EGWApiClient,
            EGWApiClient.of({
              ...api,
              getChapterContent: () => Effect.succeed([paragraph, duplicateDisplayRefcode]),
            }),
          ),
        ),
      );
      const layer = CorpusSupply.layer.pipe(Layer.provide(source), Layer.provide(database));

      yield* ensureWritings(layer);

      expect(installed[0]?.paragraphs.map((item) => item.refcode)).toEqual(['pp-1-1', 'pp-1-2']);
      expect(installed[0]?.bibleReferences.map((item) => item.paragraphRefcode)).toEqual([
        'pp-1-1',
        'pp-1-2',
      ]);
    }),
  );

  it.effect('deduplicates overlapping chapter responses by stable paragraph ID', () =>
    Effect.gen(function* () {
      const installed: PublicationArchive[] = [];
      const database = EGWParagraphDatabase.Test({
        needsSync: () => true,
        installPublicationArchive: (archive) => {
          installed.push(archive);
          return archive.paragraphs.length;
        },
      });
      const source = layerEgwWritingsAssetSource.pipe(
        Layer.provide(
          Layer.succeed(
            EGWApiClient,
            EGWApiClient.of({
              ...api,
              getBookToc: () =>
                Effect.succeed([toc, { ...toc, para_id: Option.some('chapter-2'), puborder: 2 }]),
            }),
          ),
        ),
      );
      const layer = CorpusSupply.layer.pipe(Layer.provide(source), Layer.provide(database));

      yield* ensureWritings(layer);

      expect(installed[0]?.paragraphs.map((item) => item.refcode)).toEqual(['pp-1-1']);
    }),
  );

  it.effect('uses the stable paragraph ID when provider refcodes are empty', () =>
    Effect.gen(function* () {
      const installed: PublicationArchive[] = [];
      const paragraphWithoutRefcode: Paragraph = {
        ...paragraph,
        para_id: Option.some('stable-provider-id'),
        refcode_short: Option.none(),
        refcode_long: '',
      };
      const database = EGWParagraphDatabase.Test({
        needsSync: () => true,
        installPublicationArchive: (archive) => {
          installed.push(archive);
          return archive.paragraphs.length;
        },
      });
      const source = layerEgwWritingsAssetSource.pipe(
        Layer.provide(
          Layer.succeed(
            EGWApiClient,
            EGWApiClient.of({
              ...api,
              getChapterContent: () => Effect.succeed([paragraphWithoutRefcode]),
            }),
          ),
        ),
      );
      const layer = CorpusSupply.layer.pipe(Layer.provide(source), Layer.provide(database));

      yield* ensureWritings(layer);

      expect(installed[0]?.paragraphs[0]?.refcode).toBe('stable-provider-id');
    }),
  );
});
