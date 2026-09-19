/** Corpus scope for writings full-text search (§6.4).
 *
 *  Sections 2 and 4 of the auto-mined lineup (§6.1) query the same
 *  `paragraphs_fts` index and differ only in *whose* books they are allowed to
 *  reach. That distinction is a property of the corpus, not of a call site, so
 *  it lives here as one constant rather than as a book-code list every caller
 *  restates.
 */

import { Schema } from 'effect';

/** `egw` — Ellen G. White and the White Estate's own compilations.
 *  `pioneer` — every other author in the library: the Advent pioneers, the
 *  periodicals, and the historical works the corpus carries alongside them.
 *  `all` — no author filter at all, which is what every pre-§6.4 caller meant. */
export const CorpusScope = Schema.Literals(['egw', 'pioneer', 'all']);
export type CorpusScope = typeof CorpusScope.Type;

/** Narrows a bare string — a URL parameter, a CLI flag — to a scope. */
export const isCorpusScope = Schema.is(CorpusScope);

/** The exact `books.book_author` values that constitute the EGW scope.
 *
 *  Two values, resolved from the data rather than guessed: the 2026-08-14
 *  snapshot's `books` table carries 106 distinct authors, of which
 *  `'Ellen Gould White'` (538 books) and `'Ellen G. White Estate'` (77 books)
 *  are the White-Estate-published half. Their paragraphs total 961,761 of the
 *  corpus's 3,012,004 — the same 961,761 §9.2 pins the vector index to, which
 *  is what confirms this is the partition the spec means by "EGW/White-Estate
 *  scope" rather than a coincidental near-match.
 *
 *  The partition is deliberately *binary*: `pioneer` is the complement, not a
 *  curated allow-list. A curated list would silently drop every author nobody
 *  remembered to enumerate, and the section it backs is "pioneer witnesses" —
 *  the honest answer to "who else in this library said this" is everyone who is
 *  not Ellen White. The CLI's `PIONEER_AUTHOR_FILTERS`
 *  (`packages/cli/src/commands/egw/pioneer-authors.ts`) is a different thing
 *  and stays one: it curates the *historic* pioneers for corpus authoring, and
 *  deliberately excludes modern secondary works this scope keeps. */
export const EGW_SCOPE_AUTHORS: readonly [string, string] = [
  'Ellen Gould White',
  'Ellen G. White Estate',
];
