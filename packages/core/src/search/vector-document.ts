/** Which paragraphs the vector index holds, and under what identity (§9.2).
 *
 *  Two hosts decide it: the compiler that builds `vectors.bvi` from the whole
 *  corpus, and the Worker's weekly sync that adds a new book's vectors to
 *  Vectorize. One rule, so a book embedded by the sync is indexed exactly as
 *  the compiler would have indexed it. The scope (`EGW_SCOPE_AUTHORS`) is the
 *  callers' query; this is the rule for each row the query returns.
 */

import { Option } from 'effect';

/** A paragraph row as the corpus stores it, as much of it as the rule reads. */
interface VectorDocumentRow {
  readonly bookCode: string;
  readonly refCode: string;
  readonly paraId: Option.Option<string>;
  readonly refcodeShort: Option.Option<string>;
  readonly contentText: string;
}

/** A paragraph the index holds. */
interface VectorDocument {
  readonly bookCode: string;
  /** The corpus's `para_id` — §9.2's join key, and the only column unique
   *  across the whole `paragraphs` table. */
  readonly paraId: string;
  readonly refcode: string;
  /** The text embedded, trimmed, before the model's document prefix. */
  readonly text: string;
}

/** The row as an index document, or nothing when the index leaves it out.
 *
 *  - No `para_id`, no vector: a row the index could name only ambiguously is
 *    a row the fusion could not join back.
 *  - No refcode, no vector, for the same reason.
 *  - No text, no vector: a structural row (a heading anchor, a page marker)
 *    would put a vector with no meaning into the index for the scan to rank.
 *
 *  The text is `content_text`, which is what `paragraphs_fts` indexes, so the
 *  lexical leg and the vector leg see the same words. */
export const vectorDocument = (row: VectorDocumentRow): Option.Option<VectorDocument> => {
  const paraId = Option.getOrElse(row.paraId, () => '');
  if (paraId.length === 0) return Option.none();
  const refcode = Option.getOrElse(row.refcodeShort, () => row.refCode);
  if (refcode.length === 0) return Option.none();
  const text = row.contentText.trim();
  if (text.length === 0) return Option.none();
  return Option.some({ bookCode: row.bookCode, paraId, refcode, text });
};
