import { describe, expect, test } from 'bun:test';
import { Effect, Layer, Option, Schema } from 'effect';

import { EGWParagraphDatabase, type BookRow, type SyncStatusRow } from '../egw-db/book-database.js';
import { WritingsLibraryRuntime } from '../procedure/services.js';
import { ArchivedParagraph, PublicationArchive } from '../writings/archive.js';
import {
  Paragraph,
  Publication,
  Reference,
  WritingsLibraryPublication,
  publicationCode,
  publicationId,
  publicationOrder,
} from '../writings/model.js';
import { CorpusSourceUnavailableError } from './errors.js';
import { WritingsContribution, unknownProvenance } from './model.js';
import { CorpusSupply } from './service.js';
import { layerWritingsAssetSource } from './source.js';
import { layerWritingsLibraryRuntime } from './writings-library.js';

const id = publicationId(127);
const code = publicationCode('PP');
const publication = new Publication({
  id,
  code,
  title: 'Patriarchs and Prophets',
  author: 'Ellen G. White',
  paragraphCount: Option.some(1),
});
const archive = new PublicationArchive({
  publication,
  paragraphs: [
    new ArchivedParagraph({
      refcode: 'PP 1.1',
      paragraph: new Paragraph({
        reference: Reference.paragraph(id, 'pp-1-1'),
        publicationCode: code,
        order: publicationOrder(1),
        page: Option.none(),
        number: Option.none(),
        refcode: Option.some('PP 1.1'),
        nodes: [{ _tag: 'Text', text: 'The opening paragraph' }],
        elementType: Option.none(),
        elementSubtype: Option.none(),
      }),
      isHeading: false,
    }),
  ],
  bibleReferences: [],
});
const contribution = new WritingsContribution({
  provenance: unknownProvenance('test-source', '1'),
  archive,
});

const compose = (
  database: Layer.Layer<EGWParagraphDatabase>,
  source: ReturnType<typeof layerWritingsAssetSource>,
) => {
  const supply = CorpusSupply.layer.pipe(Layer.provide(database), Layer.provide(source));
  return layerWritingsLibraryRuntime.pipe(
    Layer.provide(database),
    Layer.provide(source),
    Layer.provide(supply),
  );
};

describe('shared Writings library runtime', () => {
  test('projects source status and installs through CorpusSupply', async () => {
    const books: BookRow[] = [];
    const statuses: SyncStatusRow[] = [];
    let acquisitions = 0;
    const database = EGWParagraphDatabase.Test({
      books,
      syncStatuses: statuses,
      needsSync: () => statuses.length === 0,
      installPublicationArchive: (installed) => {
        books.push({
          book_id: installed.publication.id,
          book_code: installed.publication.code,
          book_title: installed.publication.title,
          book_author: installed.publication.author,
          paragraph_count: installed.paragraphs.length,
          created_at: '2026-07-20T00:00:00.000Z',
        });
        statuses.push({
          book_id: installed.publication.id,
          book_code: installed.publication.code,
          status: 'success',
          error_message: null,
          last_attempt: '2026-07-20T00:00:00.000Z',
          paragraph_count: installed.paragraphs.length,
        });
        return installed.paragraphs.length;
      },
    });
    const source = layerWritingsAssetSource({
      catalog: Effect.succeed([publication]),
      acquire: () =>
        Effect.sync(() => {
          acquisitions += 1;
          return contribution;
        }),
    });

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const library = yield* WritingsLibraryRuntime;
        const before = yield* library.get;
        const downloaded = yield* library.download(id);
        const after = yield* library.get;
        return { before, downloaded, after };
      }).pipe(Effect.provide(compose(database, source))),
    );

    expect(result.before[0]).toMatchObject({ source: 'remote', status: 'pending' });
    expect(result.downloaded).toMatchObject({ status: 'success', paragraphCount: 1 });
    expect(result.after[0]).toMatchObject({ source: 'local', status: 'success' });
    expect(acquisitions).toBe(1);
  });

  test('keeps installed and status-only publications available when the source is offline', async () => {
    const local: BookRow = {
      book_id: id,
      book_code: code,
      book_title: publication.title,
      book_author: publication.author,
      paragraph_count: 1,
      created_at: '2026-07-20T00:00:00.000Z',
    };
    const failed: SyncStatusRow = {
      book_id: 128,
      book_code: 'GC',
      status: 'failed',
      error_message: 'offline',
      last_attempt: '2026-07-20T00:00:00.000Z',
      paragraph_count: 0,
    };
    const database = EGWParagraphDatabase.Test({ books: [local], syncStatuses: [failed] });
    const source = layerWritingsAssetSource({
      catalog: Effect.fail(
        new CorpusSourceUnavailableError({ operation: 'catalog', cause: 'offline' }),
      ),
      acquire: () =>
        Effect.fail(new CorpusSourceUnavailableError({ operation: 'acquire', cause: 'offline' })),
    });
    const result = await Effect.runPromise(
      Effect.flatMap(WritingsLibraryRuntime, (library) => library.get).pipe(
        Effect.provide(compose(database, source)),
      ),
    );
    const encoded = Schema.encodeSync(Schema.Array(WritingsLibraryPublication))(result);

    expect(encoded).toHaveLength(2);
    expect(encoded[0]).toMatchObject({ code: 'PP', source: 'local', status: 'success' });
    expect(encoded[1]).toMatchObject({
      code: 'GC',
      author: 'Unknown author',
      source: 'empty',
      status: 'failed',
      error: 'offline',
    });
  });
});
