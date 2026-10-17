import { describe, expect, test } from 'bun:test';
import { SqliteClient } from '@effect/sql-sqlite-bun';
import { Effect, Layer, Option } from 'effect';
import { SqlClient } from 'effect/sql';

import { EGWParagraphDatabase } from '@bible/core/egw-db';
import { DIMENSIONS, QueryEmbedderUnavailable } from '@bible/core/search';

import {
  BOOK_VECTORS_PAGE,
  bookVectorsPage,
  deleteVectorIds,
  removedVectorIds,
  VECTOR_DELETE_LIMIT,
  type VectorizeUpsert,
} from './book-vectors.ts';
import { UNCLASSIFIED } from './vectorize.ts';

/** A corpus with the schema the writer builds, over one in-memory file. */
const corpus = EGWParagraphDatabase.layerCore.pipe(
  Layer.provideMerge(SqliteClient.layer({ filename: ':memory:' })),
  Layer.orDie,
);

const book = (id: number, code: string, author: string, section: Option.Option<string>) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql`
      INSERT INTO books (book_id, book_code, book_title, book_author, paragraph_count, created_at,
        book_type, book_subtype, section)
      VALUES (${id}, ${code}, ${code}, ${author}, 0, 'then', 'book', 'no pagebreaks',
        ${Option.getOrNull(section)})
    `;
  });

const paragraph = (bookId: number, order: number, paraId: Option.Option<string>, text: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql`
      INSERT INTO paragraphs (book_id, ref_code, para_id, refcode_short, nodes_json, content_text,
        puborder, created_at, updated_at)
      VALUES (${bookId}, ${`r${String(order)}`}, ${Option.getOrNull(paraId)}, ${`X ${String(order)}`}, '[]', ${text},
        ${order}, 'then', 'then')
    `;
  });

/** An embedder that answers one vector per text, and counts what it was given. */
const embedder = (seen: string[]) => (texts: readonly string[]) =>
  Effect.sync(() => {
    seen.push(...texts);
    return texts.map(() => new Int8Array(DIMENSIONS).fill(1));
  });

const index = (written: Parameters<VectorizeUpsert['upsert']>[0][number][]): VectorizeUpsert => ({
  // The binding answers a promise, as this does.
  upsert: (vectors) =>
    Effect.runPromise(
      Effect.sync(() => {
        written.push(...vectors);
        return { mutationId: 'm' };
      }),
    ),
});

describe('bookVectorsPage', () => {
  test('upserts the paragraphs the index holds, under their identity and metadata', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        yield* book(1, 'PP', 'Ellen Gould White', Option.some('egw-writings'));
        yield* paragraph(1, 1, Option.some('84.4'), ' In the beginning. ');
        yield* paragraph(1, 2, Option.none(), 'No identity.');
        yield* paragraph(1, 3, Option.some('84.5'), '   ');
        const seen: string[] = [];
        const written: Parameters<VectorizeUpsert['upsert']>[0][number][] = [];

        const page = yield* bookVectorsPage(
          { bookId: 1, after: 0, scope: 'book' },
          embedder(seen),
          index(written),
        );

        expect(page).toEqual({ read: 3, upserted: 1, after: 3 });
        expect(seen).toEqual(['In the beginning.']);
        expect(written).toEqual([
          {
            id: 'PP:84.4',
            values: Array.from({ length: DIMENSIONS }, () => 1),
            metadata: { book: 'PP', section: 'egw-writings', type: 'book', subtype: UNCLASSIFIED },
          },
        ]);
      }).pipe(Effect.provide(corpus)),
    ));

  test('pages through a book and reads nothing for a book outside the scope', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        yield* book(1, 'PP', 'Ellen Gould White', Option.none());
        yield* book(2, 'OTHER', 'Someone Else', Option.none());
        yield* Effect.forEach(
          Array.from({ length: BOOK_VECTORS_PAGE + 1 }, (_, at) => at + 1),
          (order) => paragraph(1, order, Option.some(`p${String(order)}`), `text ${String(order)}`),
        );
        yield* paragraph(2, 1, Option.some('o1'), 'other');
        const written: Parameters<VectorizeUpsert['upsert']>[0][number][] = [];
        const upsert = index(written);

        const first = yield* bookVectorsPage(
          { bookId: 1, after: 0, scope: 'book' },
          embedder([]),
          upsert,
        );
        const second = yield* bookVectorsPage(
          { bookId: 1, after: first.after, scope: 'book' },
          embedder([]),
          upsert,
        );
        const other = yield* bookVectorsPage(
          { bookId: 2, after: 0, scope: 'book' },
          embedder([]),
          upsert,
        );

        expect([first.read, second.read]).toEqual([BOOK_VECTORS_PAGE, 1]);
        expect(new Set(written.map((vector) => vector.id)).size).toBe(BOOK_VECTORS_PAGE + 1);
        expect(other).toEqual({ read: 0, upserted: 0, after: 0 });
      }).pipe(Effect.provide(corpus)),
    ));

  test('reads nothing for an apparatus book, by its author or its type', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        yield* book(1, 'DAPlan', 'Ellen G. White Estate', Option.none());
        yield* book(2, 'TopIndex', 'Ellen Gould White', Option.none());
        yield* sql`UPDATE books SET book_type = 'topicalindex' WHERE book_id = 2`;
        yield* paragraph(1, 1, Option.some('1.1'), 'Read Genesis 1.');
        yield* paragraph(2, 1, Option.some('2.1'), 'Trouble, Time of.');
        const written: Parameters<VectorizeUpsert['upsert']>[0][number][] = [];

        const pages = yield* Effect.forEach([1, 2], (bookId) =>
          bookVectorsPage({ bookId, after: 0, scope: 'book' }, embedder([]), index(written)),
        );

        expect(pages).toEqual([
          { read: 0, upserted: 0, after: 0 },
          { read: 0, upserted: 0, after: 0 },
        ]);
        expect(written).toEqual([]);
      }).pipe(Effect.provide(corpus)),
    ));

  test('a failed embedding fails the page with the book it was for', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        yield* book(1, 'PP', 'Ellen Gould White', Option.none());
        yield* paragraph(1, 1, Option.some('84.4'), 'text');
        const failure = yield* Effect.flip(
          bookVectorsPage(
            { bookId: 1, after: 0, scope: 'book' },
            () => Effect.fail(QueryEmbedderUnavailable.make({ adapter: 'test', reason: 'down' })),
            index([]),
          ),
        );
        expect(failure).toMatchObject({ _tag: 'BookVectorsFailed', bookId: 1 });
        expect(failure.reason).toContain('down');
      }).pipe(Effect.provide(corpus)),
    ));

  test("a recheck embeds only what the book's latest install added or edited, and names what it removed", () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        const database = yield* EGWParagraphDatabase;
        // Reading the change log creates it, as the first install would.
        yield* database.paragraphChanges(1, 'zip:new');
        yield* book(1, 'PP', 'Ellen Gould White', Option.none());
        yield* paragraph(1, 1, Option.some('84.1'), 'kept');
        yield* paragraph(1, 2, Option.some('84.2'), 'edited now');
        yield* paragraph(1, 3, Option.some('84.3'), 'added');
        yield* sql`
          INSERT INTO sync_status (book_id, book_code, status, last_attempt, paragraph_count, revision)
          VALUES (1, 'PP', 'success', 'then', 3, 'zip:new')
        `;
        const change = (paraId: string, kind: string, revision: string) => sql`
          INSERT INTO paragraph_changes (book_id, ref_code, para_id, kind, puborder, to_revision, recorded_at)
          VALUES (1, ${paraId}, ${paraId}, ${kind}, 1, ${revision}, 'then')
        `;
        yield* change('84.2', 'edited', 'zip:new');
        yield* change('84.3', 'added', 'zip:new');
        yield* change('84.9', 'removed', 'zip:new');
        yield* change('84.1', 'edited', 'zip:older');
        const seen: string[] = [];

        const page = yield* bookVectorsPage(
          { bookId: 1, after: 0, scope: 'changed' },
          embedder(seen),
          index([]),
        );

        expect(seen).toEqual(['edited now', 'added']);
        expect(page.read).toBe(2);
        expect(yield* removedVectorIds(1)).toEqual(['PP:84.9']);
      }).pipe(Effect.provide(corpus)),
    ));
});

describe('deleteVectorIds', () => {
  test('deletes in calls of at most a hundred ids, every id once', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const ids = Array.from({ length: 197 }, (_, at) => `PP:${String(at)}`);
        const calls: string[][] = [];
        const deleted = yield* deleteVectorIds(1, ids, {
          deleteByIds: (chunk) => Effect.runPromise(Effect.sync(() => calls.push(chunk))),
        });

        expect(deleted).toBe(197);
        expect(calls.map((chunk) => chunk.length)).toEqual([VECTOR_DELETE_LIMIT, 97]);
        expect(calls.flat()).toEqual(ids);
      }),
    ));
});
