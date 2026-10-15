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
  page: { readonly bookId: number; readonly after: number },
  embed: (
    texts: readonly string[],
  ) => Effect.Effect<readonly Int8Array[], QueryEmbedderUnavailable>,
  index: VectorizeUpsert,
) {
  const sql = yield* SqlClient.SqlClient;
  const failed = (reason: string) => BookVectorsFailed.make({ bookId: page.bookId, reason });
  const rows = yield* sql`
    SELECT
      p.rowid AS row_id, b.book_code, p.ref_code, p.para_id, p.refcode_short, p.content_text,
      b.section, b.book_type, b.book_subtype
    FROM paragraphs p
    JOIN books b ON b.book_id = p.book_id
    WHERE p.book_id = ${page.bookId}
      AND p.rowid > ${page.after}
      AND b.book_author IN (SELECT value FROM json_each(${encodeAuthors(EGW_SCOPE_AUTHORS)}))
    ORDER BY p.rowid
    LIMIT ${BOOK_VECTORS_PAGE}
  `.pipe(
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
