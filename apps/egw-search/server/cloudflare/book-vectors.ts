/**
 * A newly installed book's vectors: its paragraphs read from the corpus,
 * embedded through Workers AI and upserted into Vectorize, a page at a time.
 *
 * The index was built once from the whole corpus (`vectors.bvi`); after that,
 * a book the weekly sync installs has no vectors until this adds them, and a
 * search's vector leg cannot find it. Which paragraphs get a vector, and
 * under what identity, is the compiler's rule (`vectorDocument`,
 * `paragraphIdentity`), and the metadata is the filter's
 * (`vectorMetadata`): a book embedded here is indexed exactly as the
 * compiler would have indexed it.
 *
 * A page is one durable step of the sync's Workflow: one read, a few model
 * calls, one upsert. Upserting is idempotent by id, so a retried page writes
 * the same vectors again rather than duplicates.
 *
 * A book installed again (a recheck) keeps the vectors of the paragraphs it
 * did not change: its pages read only the paragraphs the install added or
 * edited (`scope: 'changed'`), and the vectors of the ones it removed are
 * deleted (`removedVectorIds`).
 */
import { Array as Arr, Effect, Option, Schema } from 'effect';
import * as SqlClient from 'effect/sql/SqlClient';

import { paragraphIdentity } from '@bible/core/egw-db';
import { type QueryEmbedderUnavailable, vectorDocument } from '@bible/core/search';
import { EGW_SCOPE_AUTHORS } from '@bible/core/writings';

import { vectorMetadata } from './vectorize.ts';

/** Paragraphs per page: one upsert, and a few model calls of
 *  `EMBEDDING_BATCH`. Well inside Vectorize's 1,000 vectors per upsert. */
export const BOOK_VECTORS_PAGE = 500;

/** The part of the Vectorize binding a page writes through. */
export interface VectorizeUpsert {
  readonly upsert: (
    vectors: {
      id: string;
      values: number[];
      metadata: Record<string, string>;
    }[],
  ) => Promise<unknown>;
}

/** Which of a book's paragraphs a page embeds: all of them (a first
 *  install), or those its latest install added or edited (a recheck). */
export type BookVectorsScope = 'book' | 'changed';

/** What one page did, as plain data: a Workflow step's result. */
export interface BookVectorsPage {
  /** Paragraph rows read. Fewer than `BOOK_VECTORS_PAGE` is the book's end. */
  readonly read: number;
  /** Vectors upserted: the rows the index holds (`vectorDocument`). */
  readonly upserted: number;
  /** The last row read, where the next page starts. */
  readonly after: number;
}

export class BookVectorsFailed extends Schema.TaggedError<BookVectorsFailed>()(
  'BookVectorsFailed',
  {
    bookId: Schema.Finite,
    reason: Schema.String,
  },
) {}

const Rows = Schema.Array(
  Schema.Struct({
    row_id: Schema.Finite,
    book_code: Schema.String,
    ref_code: Schema.String,
    para_id: Schema.NullOr(Schema.String),
    refcode_short: Schema.NullOr(Schema.String),
    content_text: Schema.String,
    section: Schema.NullOr(Schema.String),
    book_type: Schema.NullOr(Schema.String),
    book_subtype: Schema.NullOr(Schema.String),
  }),
);

const encodeAuthors = Schema.encodeSync(Schema.fromJsonString(Schema.Array(Schema.String)));

/** One page of a book's vectors, from the row after `after`.
 *
 *  Rows come in `rowid` order, which is unique and is the order the install
 *  wrote them in. A book outside the vector scope (`EGW_SCOPE_AUTHORS`)
 *  reads no rows, so its first page is its last. */
export const bookVectorsPage = Effect.fn('BookVectors.page')(function* (
  page: { readonly bookId: number; readonly after: number; readonly scope: BookVectorsScope },
  embed: (
    texts: readonly string[],
  ) => Effect.Effect<readonly Int8Array[], QueryEmbedderUnavailable>,
  index: VectorizeUpsert,
) {
  const sql = yield* SqlClient.SqlClient;
  const failed = (reason: string) => BookVectorsFailed.make({ bookId: page.bookId, reason });
  const authors = encodeAuthors(EGW_SCOPE_AUTHORS);
  // Two statements rather than one with the scope as a condition: SQLite
  // resolves every table a statement names when it prepares it, and a
  // corpus no recheck has written to has no `paragraph_changes`.
  // A statement runs only when it is yielded, so building both costs nothing.
  let read = sql`
          SELECT
            p.rowid AS row_id, b.book_code, p.ref_code, p.para_id, p.refcode_short,
            p.content_text, b.section, b.book_type, b.book_subtype
          FROM paragraphs p
          JOIN books b ON b.book_id = p.book_id
          WHERE p.book_id = ${page.bookId}
            AND p.rowid > ${page.after}
            AND b.book_author IN (SELECT value FROM json_each(${authors}))
          ORDER BY p.rowid
          LIMIT ${BOOK_VECTORS_PAGE}
        `;
  if (page.scope === 'changed')
    read = sql`
          SELECT
            p.rowid AS row_id, b.book_code, p.ref_code, p.para_id, p.refcode_short,
            p.content_text, b.section, b.book_type, b.book_subtype
          FROM paragraphs p
          JOIN books b ON b.book_id = p.book_id
          WHERE p.book_id = ${page.bookId}
            AND p.rowid > ${page.after}
            AND b.book_author IN (SELECT value FROM json_each(${authors}))
            AND COALESCE(p.para_id, p.ref_code) IN (
              SELECT COALESCE(c.para_id, c.ref_code) FROM paragraph_changes c
              WHERE c.book_id = p.book_id
                AND c.kind IN ('added', 'edited')
                AND c.to_revision = (SELECT revision FROM sync_status WHERE book_id = p.book_id)
            )
          ORDER BY p.rowid
          LIMIT ${BOOK_VECTORS_PAGE}
        `;
  const rows = yield* read.pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(Rows)),
    Effect.mapError((cause) => failed(`read: ${String(cause)}`)),
  );

  const documents = rows.flatMap((row) =>
    Option.toArray(
      Option.map(
        vectorDocument({
          bookCode: row.book_code,
          refCode: row.ref_code,
          paraId: Option.fromNullishOr(row.para_id),
          refcodeShort: Option.fromNullishOr(row.refcode_short),
          contentText: row.content_text,
        }),
        (document) => ({
          document,
          metadata: vectorMetadata({
            code: row.book_code,
            section: Option.fromNullishOr(row.section),
            type: Option.fromNullishOr(row.book_type),
            subtype: Option.fromNullishOr(row.book_subtype),
          }),
        }),
      ),
    ),
  );

  if (documents.length > 0) {
    const vectors = yield* embed(documents.map(({ document }) => document.text)).pipe(
      Effect.mapError((cause) => failed(`embed: ${cause.reason}`)),
    );
    yield* Effect.tryPromise({
      try: () =>
        index.upsert(
          Arr.zip(documents, vectors).map(([{ document, metadata }, values]) => ({
            id: paragraphIdentity(
              document.bookCode,
              Option.some(document.paraId),
              document.refcode,
            ),
            values: Array.from(values),
            metadata,
          })),
        ),
      catch: (cause) => failed(`upsert: ${String(cause)}`),
    });
  }

  const last = Option.getOrElse(
    Option.map(Option.fromNullishOr(rows.at(-1)), (row) => row.row_id),
    () => page.after,
  );
  return { read: rows.length, upserted: documents.length, after: last } satisfies BookVectorsPage;
});

const RemovedRows = Schema.Array(
  Schema.Struct({
    book_code: Schema.String,
    ref_code: Schema.String,
    para_id: Schema.NullOr(Schema.String),
  }),
);

/** The vector ids of the paragraphs a book's latest install removed: the
 *  identities `bookVectorsPage` gave them, for the index to forget. A
 *  paragraph that never had a vector yields an id the index does not hold,
 *  which a delete ignores. */
export const removedVectorIds = Effect.fn('BookVectors.removedIds')(function* (bookId: number) {
  const sql = yield* SqlClient.SqlClient;
  const rows = yield* sql`
    SELECT b.book_code, c.ref_code, c.para_id
    FROM paragraph_changes c
    JOIN books b ON b.book_id = c.book_id
    WHERE c.book_id = ${bookId}
      AND c.kind = 'removed'
      AND c.to_revision = (SELECT revision FROM sync_status WHERE book_id = ${bookId})
  `.pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(RemovedRows)),
    Effect.mapError((cause) =>
      BookVectorsFailed.make({ bookId, reason: `read: ${String(cause)}` }),
    ),
  );
  return rows.map((row) =>
    paragraphIdentity(row.book_code, Option.fromNullishOr(row.para_id), row.ref_code),
  );
});

/** Ids per delete: Vectorize refuses more than a hundred in one call. */
export const VECTOR_DELETE_LIMIT = 100;

/** The part of the Vectorize binding a delete goes through. */
export interface VectorizeDelete {
  readonly deleteByIds: (ids: string[]) => Promise<unknown>;
}

/** Forget a book's vectors by id, a call per hundred. */
export const deleteVectorIds = Effect.fn('BookVectors.delete')(function* (
  bookId: number,
  ids: readonly string[],
  index: VectorizeDelete,
) {
  for (const chunk of Arr.chunksOf(ids, VECTOR_DELETE_LIMIT)) {
    yield* Effect.tryPromise({
      try: () => index.deleteByIds([...chunk]),
      catch: (cause) => BookVectorsFailed.make({ bookId, reason: `delete: ${String(cause)}` }),
    });
  }
  return ids.length;
});
