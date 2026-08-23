/** Reading EGW-scope paragraphs out of the writings database, for embedding.
 *
 *  `bun:sqlite` directly, the way `topics-compiler/lookups.ts` does: the
 *  compiler is Bun build tooling rather than portable runtime core, and a
 *  streaming read of ~961,761 rows wants the synchronous driver rather than a
 *  service graph.
 *
 *  The scope is `EGW_SCOPE_AUTHORS`, imported rather than restated. §9.2 pins
 *  the index to exactly that partition, and a builder that enumerated its own
 *  author list would be free to disagree with the search that reads the result —
 *  which is the one disagreement nothing downstream could detect, because the
 *  index would simply contain paragraphs the scope filter never asks about.
 */

import { EGW_SCOPE_AUTHORS } from '@bible/core/writings';
import { Database } from 'bun:sqlite';

import type { VectorSourceRow } from './emit.js';
import { Effect, Option, Schema } from 'effect';

/** Why the source read could not produce a corpus.
 *
 *  A tagged error on the error channel rather than an empty array. The previous
 *  shape returned `[]` for *every* failure — an unopenable file, a renamed
 *  column, a schema the decoder rejected — and `main.ts` reports an empty
 *  corpus as "no EGW-scope paragraphs in <file>", which points the operator at
 *  the corpus when the fault is in the query. A build tool that turns a schema
 *  break into "your database is empty" is a build tool that gets debugged in
 *  the wrong place.
 */
export class VectorSourceError extends Schema.TaggedError<VectorSourceError>()(
  'VectorSourceError',
  { message: Schema.String },
) {}

const Rows = Schema.Array(
  Schema.Struct({
    book_code: Schema.String,
    ref_code: Schema.String,
    // §9.2's join key. Unique across all 3,012,004 corpus rows, where
    // `(book_code, refcode_short)` is not: the EGW partition alone has 961,750
    // non-empty rows and only 944,672 distinct book:refcode pairs, so 17,078
    // paragraphs would be written under another paragraph's id.
    para_id: Schema.NullOr(Schema.String),
    refcode_short: Schema.NullOr(Schema.String),
    content_text: Schema.String,
  }),
);

const decodeRows = Schema.decodeUnknownEffect(Rows);

/** Every EGW-scope paragraph, in a stable order.
 *
 *  Ordered by `(book_code, puborder)` so the emitted buffer's row order is a
 *  function of the corpus rather than of SQLite's join plan. That is what makes
 *  a rebuild over unchanged input produce an identical artifact — and therefore
 *  an identical digest, which is the whole trust surface the supply pipeline
 *  rests on.
 *
 *  `--limit` exists because §10 forbids running this over the full corpus during
 *  the milestone: 961,761 embeddings is hours of GPU time, and what has to be
 *  proven here is the writer, not the corpus.
 *
 *  The database is an `acquireUseRelease` resource. The previous shape opened it
 *  inside `Effect.sync` and closed it on the success path only, so a decode
 *  failure or an interruption leaked the handle and its WAL — and a build tool
 *  that leaks a read handle on a 4.5 GB database leaves the file locked for
 *  whatever runs next.
 */
export const readVectorSource = (input: {
  readonly filename: string;
  readonly limit: Option.Option<number>;
}): Effect.Effect<readonly VectorSourceRow[], VectorSourceError> =>
  Effect.acquireUseRelease(
    Effect.try({
      try: () => new Database(input.filename, { readonly: true }),
      catch: (cause) =>
        VectorSourceError.make({ message: `cannot open ${input.filename}: ${String(cause)}` }),
    }),
    (database) =>
      Effect.gen(function* () {
        const placeholders = EGW_SCOPE_AUTHORS.map(() => '?').join(', ');
        const limit = Option.getOrElse(input.limit, () => -1);
        const rows = yield* Effect.try({
          try: () =>
            database
              .prepare(
                `SELECT b.book_code, p.ref_code, p.para_id, p.refcode_short, p.content_text
                 FROM paragraphs p
                 JOIN books b ON p.book_id = b.book_id
                 WHERE b.book_author IN (${placeholders})
                 ORDER BY b.book_code, p.puborder
                 LIMIT ?`,
              )
              .all(...EGW_SCOPE_AUTHORS, limit),
          catch: (cause) => VectorSourceError.make({ message: `query failed: ${String(cause)}` }),
        });
        // On the error channel, not swallowed into an empty corpus: a schema
        // the decoder rejects is a build that must stop, not a build that
        // silently writes a zero-vector index.
        const decoded = yield* decodeRows(rows).pipe(
          Effect.mapError((cause) =>
            VectorSourceError.make({
              message: `unexpected paragraphs schema in ${input.filename}: ${String(cause)}`,
            }),
          ),
        );
        return decoded.flatMap((row): readonly VectorSourceRow[] => {
          const paraId = row.para_id ?? '';
          // No identity, no vector. A row the index could name only ambiguously
          // is a row the fusion could not join back, so it is left out rather
          // than written under a key that collides.
          if (paraId.length === 0) return [];
          const refcode = row.refcode_short ?? row.ref_code;
          if (refcode.length === 0) return [];
          const text = row.content_text.trim();
          // `content_text` is the corpus's own flattened text, which is what
          // `paragraphs_fts` indexes — so the lexical leg and the vector leg
          // see the same words, and neither is matching against markup the
          // other cannot.
          //
          // A paragraph with no text is a structural row — a heading anchor, a
          // page marker — and embedding it would put a vector with no meaning
          // into the index for the scan to rank.
          if (text.length === 0) return [];
          return [{ bookCode: row.book_code, paraId, refcode, text }];
        });
      }),
    (database) => Effect.sync(() => database.close()),
  );
