/** A writings book code (`GC`, `DA`, `DAR`) — §9's book narrowing.
 *
 *  One type, in one place, for the same reason `CorpusScope` is one type: the
 *  narrowing is shared URL state (§10's "shared query/scope/book URL state"), so
 *  the reader's route and the query it produces are describing the *same* value
 *  and must agree about what values are legal.
 *
 *  Non-empty by construction, which is the whole point of naming it. `?book=`
 *  with nothing after it is not a narrowing to no book — it is the absence of a
 *  narrowing, and `Option.none` is how that is written. A plain `string` admits
 *  the empty code, so the route could carry a value that `SearchQuery` would
 *  reject at its boundary: the same round-trip defect the branded `TopicSlug`
 *  exists to prevent on `/wiki/<slug>`, one field over.
 *
 *  Not a brand. A brand would make every call site that already holds a book
 *  code from the database — `ScoredParagraphRow.book_code`, `BookRow.book_code`
 *  — decode it before use, which is ceremony over a value the corpus already
 *  guarantees. The refinement is what carries the meaning here; the nominal
 *  identity would only add friction.
 */

import { Schema } from 'effect';

export const WritingsBookCode = Schema.NonEmptyString;
export type WritingsBookCode = typeof WritingsBookCode.Type;
