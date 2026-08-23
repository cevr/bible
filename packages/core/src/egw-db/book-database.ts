/**
 * EGW Paragraph Database Service using Effect SQL
 *
 * Stores EGW books, paragraphs, Bible references, and sync status in a SQLite
 * database. The service depends only on `SqlClient.SqlClient`, so any
 * driver-specific layer (sqlite-bun, sqlite-node) can satisfy it.
 *
 * Schema:
 * - books: normalized book metadata (book_id PK, book_code, book_title, ...)
 * - paragraphs: per-paragraph content with pre-computed navigation fields
 *   (page_number, paragraph_number, is_chapter_heading)
 * - paragraph_bible_refs: indexed Bible reference lookup for commentary
 * - paragraphs_fts: FTS5 virtual table backed by paragraphs.content +
 *   refcode_short
 * - sync_status: incremental sync bookkeeping
 */

import { Context, DateTime, Effect, Layer, Option, Predicate, Schema, Stream } from 'effect';
import * as SqlClient from 'effect/unstable/sql/SqlClient';
import type { SqlError } from 'effect/unstable/sql/SqlError';
import type * as Statement from 'effect/unstable/sql/Statement';

import { EGW_SCOPE_AUTHORS, type CorpusScope } from '../writings/corpus-scope.js';

import {
  ensureSchemaVersionsTable,
  readSchemaVersion,
  writeSchemaVersion,
} from '../db/schema-version.js';
import * as EGWSchemas from '../egw/schemas.js';
import { Node, nodesToText } from '../egw/ast.js';
import { isChapterHeading } from '../egw/parse.js';
import type { PublicationArchive } from '../writings/archive.js';
import type { CorpusProvenance } from '../corpus-supply/model.js';

// Bump when the on-disk paragraphs schema changes shape (column rename, type
// change, FTS index source change, …). The init code reads PRAGMA user_version
// and drops/recreates the paragraphs tables on mismatch so callers don't need
// to ship migration SQL — a re-sync rebuilds them. Books and sync_status are
// preserved across version bumps because their shape is stable.
const SCHEMA_VERSION = 3;
// Identity for this service's row in the shared `schema_versions` table.
const SCHEMA_NAME = 'egw_paragraphs';

export class ParagraphDataIntegrityError extends Schema.TaggedError<ParagraphDataIntegrityError>()(
  'ParagraphDataIntegrityError',
  {
    cause: Schema.Unknown,
    location: Schema.String,
  },
) {}

/** Errors emitted by the Effect SQL persistence adapter. */
export type ParagraphDatabaseError = SqlError | ParagraphDataIntegrityError;

export const BookRow = Schema.Struct({
  book_id: Schema.Finite,
  book_code: Schema.String,
  book_title: Schema.String,
  book_author: Schema.String,
  paragraph_count: Schema.Finite,
  created_at: Schema.String,
});

export type BookRow = Schema.Schema.Type<typeof BookRow>;

const { refcode_long, puborder, element_type, element_subtype } = EGWSchemas.Paragraph.fields;

// SQL row shape. `nodes_json` is JSON-encoded `readonly Node[]`; `content_text`
// is the plain-text projection used by the FTS5 virtual table. Both are
// derived from the AST at write time so reads don't have to parse anything.
// `para_id` and `refcode_short` stay as `string | null` on the row (SQLite
// has no Option type); `paragraphToRow` / `rowToParagraph` translate at the
// storage boundary.
export const ParagraphRow = Schema.Struct({
  para_id: Schema.optional(Schema.NullOr(Schema.String)),
  refcode_short: Schema.optional(Schema.NullOr(Schema.String)),
  refcode_long,
  nodes_json: Schema.String,
  content_text: Schema.String,
  puborder,
  element_type,
  element_subtype,
  book_id: Schema.Finite,
  ref_code: Schema.String,
  page_number: Schema.NullOr(Schema.Finite),
  paragraph_number: Schema.NullOr(Schema.Finite),
  is_chapter_heading: Schema.Finite,
  created_at: Schema.String,
  updated_at: Schema.String,
});

export type ParagraphRow = Schema.Schema.Type<typeof ParagraphRow>;

export const BibleRefRow = Schema.Struct({
  para_book_id: Schema.Finite,
  para_ref_code: Schema.String,
  bible_book: Schema.Finite,
  bible_chapter: Schema.Finite,
  bible_verse: Schema.NullOr(Schema.Finite),
});

export type BibleRefRow = Schema.Schema.Type<typeof BibleRefRow>;

const MaxPageRow = Schema.Struct({
  max_page: Schema.NullOr(Schema.Finite),
});
type MaxPageRow = Schema.Schema.Type<typeof MaxPageRow>;

const CommentaryVerseRow = Schema.Struct({
  bible_verse: Schema.NullOr(Schema.Finite),
});
type CommentaryVerseRow = Schema.Schema.Type<typeof CommentaryVerseRow>;

// EGW wire schema fields this database does not persist; the wire type requires `null`.
const wireNull = Option.getOrNull(Option.none<never>());

export const SyncStatus = Schema.Literals(['pending', 'success', 'failed']);
export type SyncStatus = typeof SyncStatus.Type;

export const SyncStatusRow = Schema.Struct({
  book_id: Schema.Finite,
  book_code: Schema.String,
  status: SyncStatus,
  error_message: Schema.NullOr(Schema.String),
  last_attempt: Schema.String,
  paragraph_count: Schema.Finite,
  source: Schema.optional(Schema.NullOr(Schema.String)),
  revision: Schema.optional(Schema.NullOr(Schema.String)),
  digest: Schema.optional(Schema.NullOr(Schema.String)),
});

export type SyncStatusRow = Schema.Schema.Type<typeof SyncStatusRow>;

// Parse "PP 351.1" -> { page: 351, paragraph: 1 }; "PP 351" -> { page: 351, paragraph: none }
interface RefcodeNumbers {
  readonly page: Option.Option<number>;
  readonly paragraph: Option.Option<number>;
}

const parseInteger = (digits: Option.Option<string>): Option.Option<number> =>
  digits.pipe(Option.map((value) => Number.parseInt(value, 10)));

function parseRefcodeNumbers(refcode: Option.Option<string>): RefcodeNumbers {
  if (Option.isNone(refcode)) return { page: Option.none(), paragraph: Option.none() };
  const match = refcode.value.match(/\s(\d+)\.(\d+)$/);
  if (match) {
    return {
      page: parseInteger(Option.fromNullishOr(match[1])),
      paragraph: parseInteger(Option.fromNullishOr(match[2])),
    };
  }
  const pageMatch = refcode.value.match(/\s(\d+)$/);
  if (pageMatch) {
    return { page: parseInteger(Option.fromNullishOr(pageMatch[1])), paragraph: Option.none() };
  }
  return { page: Option.none(), paragraph: Option.none() };
}

// ============================================================================
// Service Interface
// ============================================================================

/** One paragraph in the in-memory double, plus the two things a real corpus
 *  supplies that an array cannot.
 *
 *  `ftsRank` is the FTS5 relevance the double has no index to compute. A test
 *  about §9.3's strong-BM25 short-circuit has to *state* that the top hit is
 *  strong and clearly separated — that is its premise — and without this field
 *  it could only be stated against a real SQLite corpus whose scores happened
 *  to land in the right regime. Optional, so every existing configuration is
 *  unchanged and reads as the weak default. */
export type TestParagraph = EGWSchemas.Paragraph & {
  readonly bookCode: string;
  readonly ftsRank?: number;
};

/** The paragraphs the in-memory double's search matches, before any cap.
 *
 *  Module-level so `searchParagraphs` and `countSearchParagraphs` share it the
 *  way the live implementations share `searchFilters`. A double whose count and
 *  rows were filtered by two hand-written copies of the same three conditions
 *  would let a `total` bug pass in tests and appear only against SQLite. */
/** The terms an FTS5 MATCH string asks for, as the double reads them.
 *
 *  Quoted runs and bare words both reduce to lower-cased words. It is not FTS5
 *  syntax — there is no NEAR, no prefix, no boolean — because the double is not
 *  an FTS engine and pretending otherwise would invite tests to depend on
 *  behavior it does not have. What it does model is the one property every
 *  caller relies on: *a search returns rows that contain the query's words*. */
const testQueryTerms = (query: string): readonly string[] =>
  query
    .toLowerCase()
    .split(/[^\p{L}\p{N}'-]+/u)
    .filter((term) => term.length > 0);

/** One row's relevance to one query, as the double models it.
 *
 *  A configured `ftsRank` is a *rank for a query the paragraph actually
 *  answers*, so it applies in proportion to how much of the query the paragraph
 *  contains. Without that proportioning the field would be a rank the paragraph
 *  carries against every query, which is not what a rank is: the strongest row
 *  in a fixture would lead every search, including searches it matched on
 *  nothing but the word "the".
 *
 *  The proportion is the share of the query's terms present, which is the one
 *  BM25 property this matters for — a document containing more of what was
 *  asked scores better than one containing less. It is not BM25: there is no
 *  IDF, no length normalization, and a test that needs those needs a real
 *  corpus. Negative, matching FTS5. */
const testRank = (paragraph: TestParagraph, terms: readonly string[], text: string): number => {
  const configured = paragraph.ftsRank ?? -1;
  if (terms.length === 0) return configured;
  const present = terms.filter((term) => text.includes(term)).length;
  return configured * (present / terms.length);
};

/** Whether one paragraph matches the query, as an **AND** over its terms —
 *  `FTS_TERM_CONJUNCTION`'s contract, applied by the double.
 *
 *  AND, not OR. The earlier comment here claimed OR was "FTS5's default for a
 *  bare term list", and it is not: FTS5 has no bare term list in the query
 *  `ftsQuery` builds. Every term is emitted quoted and space-separated, and
 *  FTS5's implicit operator between two quoted phrases is AND. Measured against
 *  an in-memory SQLite FTS5 table over three rows — one containing `alpha`, one
 *  containing `beta`, one containing both — `"alpha" "beta"` returns 1 row and
 *  `"alpha" OR "beta"` returns 3.
 *
 *  A double that ORs where production ANDs is worse than a double with no
 *  filter at all: every multi-word fixture query returns a superset of the real
 *  result set, so a test can state a premise about a top hit that the live
 *  corpus would never have produced, and the difference only appears against
 *  SQLite. */
const testMatchesQuery = (terms: readonly string[], text: string): boolean => {
  if (terms.length === 0) return true;
  return terms.every((term) => text.includes(term));
};

const testSearchMatches = (
  config: {
    readonly books?: readonly BookRow[];
    readonly paragraphs?: readonly TestParagraph[];
  },
  query: string,
  options?: { readonly bookCode?: string; readonly scope?: CorpusScope },
) => {
  const terms = testQueryTerms(query);
  return (
    (config.paragraphs ?? [])
      .flatMap((paragraph) => {
        const book = config.books?.find((candidate) => candidate.book_code === paragraph.bookCode);
        if (Predicate.isUndefined(book)) return [];
        return [{ ...paragraph, bookId: book.book_id, bookTitle: book.book_title, book }];
      })
      .flatMap((row) => {
        const bookCode = options?.bookCode;
        if (Predicate.isNotUndefined(bookCode) && row.bookCode !== bookCode) return [];
        const isEgw = EGW_SCOPE_AUTHORS.includes(row.book.book_author);
        if (options?.scope === 'egw' && !isEgw) return [];
        if (options?.scope === 'pioneer' && isEgw) return [];
        // The query filter the double lacked. Without it every search returned
        // every paragraph, so a test could not state "this query's top hit is
        // weak" — the strongest row in the fixture led every result.
        const text = nodesToText(row.nodes).toLowerCase();
        if (!testMatchesQuery(terms, text)) return [];
        return [{ ...row, rank: testRank(row, terms, text) }];
      })
      // Best-first, the way `ORDER BY fts.rank` orders the live statement.
      .sort((left, right) => left.rank - right.rank)
  );
};

/** How a multi-term search combines its terms, written down once (round-2 B4).
 *
 *  The producer (`search/service.ts`'s `ftsQuery`) emits each term quoted and
 *  joins them with this separator; the in-memory double's `testMatchesQuery`
 *  applies the matching predicate. They used to disagree — the producer joined
 *  with a space, which FTS5 reads as **AND** between two quoted phrases, while
 *  the double matched any term, which is OR. A double looser than production
 *  admits fixture results the live corpus would never return, and the
 *  divergence surfaces only against real SQLite.
 *
 *  The value is a single space rather than the literal `AND`, because that is
 *  what FTS5 accepts as its implicit conjunction and what the shipped queries
 *  have always emitted. Measured on an in-memory FTS5 table: `"alpha" "beta"`
 *  matches only the row containing both; `"alpha" OR "beta"` matches all three.
 *
 *  Both sides import this name, so changing the contract is one edit and cannot
 *  leave the double behind. */
export const FTS_TERM_CONJUNCTION = ' ';

/** §9.2's join key, spelled once for every producer and every consumer.
 *
 *  `${bookCode}:${para_id}`, book-qualified rather than bare `para_id`. The
 *  corpus makes `para_id` globally unique today — 3,012,004 rows, 3,012,004
 *  distinct values — but that is a property of the current import rather than a
 *  declared constraint, and qualifying by the book makes the key unique under
 *  the weaker guarantee the schema actually gives (unique within a book). It
 *  costs one string concatenation and removes a whole class of silent
 *  cross-book collision.
 *
 *  A paragraph with no `para_id` gets `${bookCode}:#${refCode}`, which the `#`
 *  keeps disjoint from every real key. No row in the shipped corpus takes this
 *  branch; it exists because the column is nullable in the schema and an
 *  identity function that could return an empty string would fuse every such
 *  row onto one another.
 */
export const paragraphIdentity = (
  bookCode: string,
  paraId: Option.Option<string>,
  refCode = '',
): string =>
  Option.match(
    Option.filter(paraId, (value) => value.length > 0),
    {
      onNone: () => `${bookCode}:#${refCode}`,
      onSome: (value) => `${bookCode}:${value}`,
    },
  );

/** One scored FTS hit: the paragraph's identity, its text, and SQLite's own
 *  relevance value.
 *
 *  Deliberately not an `EGWSchemas.Paragraph`. §9's fusion keys rows by
 *  `(bookCode, refcode)` and renders a snippet, and decoding the full paragraph
 *  AST for thirty candidates — most of which the fusion discards — is the
 *  expensive half of the query for information the ranking never reads. The
 *  columns here are what the ranking and the rendered hit need, and nothing
 *  else. */
export interface ScoredParagraphRow {
  readonly bookCode: string;
  readonly bookTitle: string;
  readonly bookAuthor: string;
  /** The publication's numeric id — `books.book_id`, which is the same value
   *  `WritingsReference.paragraph` takes as its `publicationId`.
   *
   *  Carried because a search hit has to become a *link*, and the reader route
   *  is `/writings/<numeric-publication-id>/p/<raw-para_id>`. The UI used to
   *  build `/writings/<bookCode>?paragraph=<qualified-key>` out of the two
   *  fields it had, and the route decoder rejects every part of that: the first
   *  segment must parse as a positive integer, the paragraph lives in a `/p/`
   *  segment rather than a query parameter, and the id must be the corpus's own
   *  `para_id` rather than the `bookCode:para_id` join key. Every paragraph and
   *  locate link in §9's result was therefore a 404 (round-2 B2).
   *
   *  The fix is to carry what the route needs rather than to reconstruct it:
   *  `bookCode` is not a publication id and no amount of formatting turns it
   *  into one. */
  readonly publicationId: number;
  /** The corpus's own `para_id`, unqualified — the value
   *  `WritingsReference.paragraph` addresses a paragraph by.
   *
   *  Distinct from `para_id` below, which is the *join key* the vector index and
   *  the fusion share. `None` for the rows whose `para_id` column is NULL, which
   *  is also exactly the set of rows that have no paragraph route. */
  readonly rawParaId: Option.Option<string>;
  /** The corpus's own paragraph identity, and §9.2's join key.
   *
   *  Unique across the whole `paragraphs` table — 3,012,004 rows, 3,012,004
   *  distinct values, none null — which `(book_code, refcode_short)` is not: the
   *  EGW/White-Estate partition alone has 961,750 non-empty rows sharing only
   *  944,672 distinct `book:refcode` pairs, so 17,078 paragraphs would collide
   *  onto another paragraph's vector. The vector index, the lexical leg and the
   *  fusion all key on this column for that reason.
   */
  readonly para_id: string;
  readonly ref_code: string;
  readonly refcode_short: Option.Option<string>;
  /** The paragraph's decoded AST, for the caller to flatten into a snippet. */
  readonly nodes: readonly Node[];
  /** FTS5's `rank`: negative, more-negative-is-better. */
  readonly rank: number;
}

export interface EGWParagraphDatabaseService {
  /** Atomically replaces one publication from its canonical portable archive. */
  readonly installPublicationArchive: (
    archive: PublicationArchive,
    provenance?: CorpusProvenance,
  ) => Effect.Effect<number, ParagraphDatabaseError>;

  // Book operations
  readonly storeBook: (book: EGWSchemas.Book) => Effect.Effect<void, ParagraphDatabaseError>;
  readonly getBookById: (
    bookId: number,
  ) => Effect.Effect<Option.Option<BookRow>, ParagraphDatabaseError>;
  readonly getBookByCode: (
    bookCode: string,
  ) => Effect.Effect<Option.Option<BookRow>, ParagraphDatabaseError>;
  readonly getBooksByCode: (
    bookCode: string,
  ) => Effect.Effect<readonly BookRow[], ParagraphDatabaseError>;
  readonly getBooksByAuthor: (author: string) => Stream.Stream<BookRow, ParagraphDatabaseError>;
  readonly getAllBooks: Stream.Stream<BookRow, ParagraphDatabaseError>;
  readonly updateBookCount: (bookId: number) => Effect.Effect<void, ParagraphDatabaseError>;

  // Paragraph operations
  readonly storeParagraph: (
    paragraph: EGWSchemas.Paragraph,
    book: EGWSchemas.Book,
  ) => Effect.Effect<void, ParagraphDatabaseError>;
  readonly storeParagraphsBatch: (
    paragraphs: readonly EGWSchemas.Paragraph[],
    book: EGWSchemas.Book,
  ) => Effect.Effect<number, ParagraphDatabaseError>;
  readonly getParagraph: (
    bookId: number,
    refCode: string,
  ) => Effect.Effect<Option.Option<EGWSchemas.Paragraph>, ParagraphDatabaseError>;
  readonly getParagraphsByBook: (
    bookId: number,
  ) => Stream.Stream<EGWSchemas.Paragraph, ParagraphDatabaseError>;
  readonly getParagraphsByAuthor: (
    author: string,
  ) => Stream.Stream<EGWSchemas.Paragraph, ParagraphDatabaseError>;
  readonly getParagraphsByPage: (
    bookId: number,
    pageNumber: number,
  ) => Effect.Effect<readonly EGWSchemas.Paragraph[], ParagraphDatabaseError>;
  readonly getChapterHeadings: (
    bookId: number,
  ) => Effect.Effect<readonly EGWSchemas.Paragraph[], ParagraphDatabaseError>;
  /**
   * Full-text search over `paragraphs_fts`, in FTS5 relevance order.
   *
   * `scope` narrows the search to one half of the corpus by `books.book_author`
   * (§6.4) — the indexed column, so the filter costs an index probe rather than
   * a scan. It defaults to `'all'`, which is exactly what every caller written
   * before the scope existed meant.
   */
  readonly searchParagraphs: (
    query: string,
    options?: {
      readonly limit?: number;
      readonly bookCode?: string;
      readonly scope?: CorpusScope;
    },
  ) => Effect.Effect<
    readonly (EGWSchemas.Paragraph & {
      bookCode: string;
      bookTitle: string;
      bookId: number;
    })[],
    ParagraphDatabaseError
  >;
  /**
   * The same search as `searchParagraphs`, carrying each hit's FTS5 `rank`.
   *
   * A second method rather than a field added to `searchParagraphs`'s rows,
   * because the two callers want different things and the difference is not
   * cosmetic: §6's sections and §7's panel want paragraphs, and decoding a
   * relevance score they never read onto every row would be work no caller
   * asked for. §9.3's strong-BM25 short-circuit wants the *scores* — it decides
   * whether to pay for a query embedding by how strong the top hit is and how
   * far clear of the runner-up it sits — and that decision is unavailable from
   * a list whose ordering is all that survived.
   *
   * `rank` is FTS5's own value: negative, more-negative-is-better. It is passed
   * through unflipped so this method reports what SQLite said, and the one
   * place that prefers larger-is-better flips it where its thresholds are
   * written.
   */
  readonly searchScoredParagraphs: (
    query: string,
    options?: {
      readonly limit?: number;
      readonly bookCode?: string;
      readonly scope?: CorpusScope;
    },
  ) => Effect.Effect<readonly ScoredParagraphRow[], ParagraphDatabaseError>;
  /**
   * The rows behind a set of `paragraphIdentity` keys, in one statement.
   *
   * §9.4's fusion ranks ids from two legs, and the vector leg returns ids the
   * lexical leg never saw — that is the recall hybrid search exists to buy. The
   * rows for those ids have to come from somewhere, and a per-id round trip for
   * the tail of a 30-candidate list is 30 statements where one `IN (...)` does.
   *
   * Returns `ScoredParagraphRow` with `rank = 0`: these rows have no BM25 score
   * because FTS did not match them, and 0 is the value the score flip
   * (`-rank`) maps to "no lexical evidence". The caller never reads it — the
   * fused score comes from the RRF ranks — but the shape stays one shape.
   *
   * Rows are returned in whatever order SQLite yields; the caller re-orders by
   * the fused ranking, so imposing an order here would be work the caller
   * discards.
   */
  readonly findParagraphsByIdentity: (
    identities: readonly string[],
  ) => Effect.Effect<readonly ScoredParagraphRow[], ParagraphDatabaseError>;
  /**
   * How many paragraphs `searchParagraphs` matches under the same query and the
   * same filters, ignoring `limit`.
   *
   * A separate call rather than a number returned beside the rows, because the
   * two have different costs and not every caller wants both: the row query
   * pays `rowToParagraph` per hit, and a caller asking only "how long is the
   * tail" should not. Both statements are built from the same `searchFilters`,
   * so the count and the rows can never be counting different things.
   */
  readonly countSearchParagraphs: (
    query: string,
    options?: {
      readonly bookCode?: string;
      readonly scope?: CorpusScope;
    },
  ) => Effect.Effect<number, ParagraphDatabaseError>;
  /**
   * Exact-match lookup by `refcode_short` (e.g. "PP 351.1"). Returns the
   * paragraph together with its book metadata so callers can navigate without
   * a second query. NOCASE so "pp 351.1" works too. Returns up to N matches —
   * the same refcode may appear in multiple books (rare; bumped to a small
   * limit so the caller can disambiguate).
   */
  readonly findByRefcodeShort: (
    refcodeShort: string,
    limit?: number,
  ) => Effect.Effect<
    readonly (EGWSchemas.Paragraph & {
      bookCode: string;
      bookTitle: string;
      bookId: number;
    })[],
    ParagraphDatabaseError
  >;
  readonly getMaxPage: (bookId: number) => Effect.Effect<number, ParagraphDatabaseError>;
  readonly getPageNumbers: (
    bookId: number,
  ) => Effect.Effect<readonly number[], ParagraphDatabaseError>;

  // Bible reference operations
  readonly storeBibleRef: (
    bookId: number,
    refCode: string,
    bibleBook: number,
    bibleChapter: number,
    bibleVerse: Option.Option<number>,
  ) => Effect.Effect<void, ParagraphDatabaseError>;
  readonly storeBibleRefsBatch: (
    refs: readonly {
      bookId: number;
      refCode: string;
      bibleBook: number;
      bibleChapter: number;
      bibleVerse: Option.Option<number>;
    }[],
  ) => Effect.Effect<number, ParagraphDatabaseError>;
  readonly getBibleRefsByBook: (
    bookId: number,
  ) => Effect.Effect<readonly BibleRefRow[], ParagraphDatabaseError>;
  /**
   * Every paragraph whose `paragraph_bible_refs` row points at this verse.
   *
   * `bookAuthor` rides along with the code and title because the reverse lookup
   * spans the *whole* library, not the EGW half of it: Dan 7:25 alone answers
   * with 431 rows of which only 10 are White-Estate published. A caller that
   * has to scope the result by author (§8.4's "parallel EGW") can only do so
   * from the same `books.book_author` column §6.4's `CorpusScope` filters on,
   * and re-reading `books` per row to recover it would be one query per
   * paragraph for a column the join already visits.
   */
  readonly getParagraphsByBibleRef: (
    bibleBook: number,
    bibleChapter: number,
    bibleVerse?: number,
  ) => Effect.Effect<
    readonly (EGWSchemas.Paragraph & {
      bookId: number;
      bookCode: string;
      bookTitle: string;
      bookAuthor: string;
    })[],
    ParagraphDatabaseError
  >;
  /**
   * Distinct verse numbers in (bibleBook, bibleChapter) that have at least
   * one cached EGW paragraph referencing them. Used by the Bible reader to
   * mark verses with a superscript anchor in one round-trip per chapter,
   * mirroring the margin-notes `getVersesWithNotes` pattern.
   */
  readonly getBibleVersesWithCommentary: (
    bibleBook: number,
    bibleChapter: number,
  ) => Effect.Effect<readonly number[], ParagraphDatabaseError>;
  /**
   * One-shot population of `paragraph_bible_refs` from already-indexed
   * paragraphs. Skips when the table is non-empty (so a healthy install pays
   * a single COUNT(*) on boot, nothing more). When empty, streams every
   * paragraph through `extract` (extractor lives in the caller — typically
   * `extractScriptureRefs` from `@bible/core/egw`) and inserts the produced
   * rows in per-book batches.
   *
   * Exists because `storeBibleRefsBatch` was added after `storeParagraphsBatch`
   * was already populating the cache for users in the wild; without this they
   * would never see EGW commentary on Bible verses until they re-fetched
   * every chapter.
   *
   * Returns `{ scanned, inserted }` so callers can log throughput.
   */
  readonly backfillBibleRefs: (
    extract: (
      paragraphs: readonly EGWSchemas.Paragraph[],
      bookId: number,
    ) => readonly {
      bookId: number;
      refCode: string;
      bibleBook: number;
      bibleChapter: number;
      bibleVerse: Option.Option<number>;
    }[],
  ) => Effect.Effect<{ scanned: number; inserted: number }, ParagraphDatabaseError>;

  // Sync status operations
  readonly setSyncStatus: (
    bookId: number,
    bookCode: string,
    status: SyncStatus,
    paragraphCount: number,
    errorMessage?: string,
  ) => Effect.Effect<void, ParagraphDatabaseError>;
  readonly getSyncStatus: (
    bookId: number,
  ) => Effect.Effect<Option.Option<SyncStatusRow>, ParagraphDatabaseError>;
  readonly getBooksByStatus: (
    status: SyncStatus,
  ) => Effect.Effect<readonly SyncStatusRow[], ParagraphDatabaseError>;
  readonly getAllSyncStatus: Effect.Effect<readonly SyncStatusRow[], ParagraphDatabaseError>;
  readonly needsSync: (
    bookId: number,
    expected?: CorpusProvenance,
  ) => Effect.Effect<boolean, ParagraphDatabaseError>;

  // Maintenance
  readonly rebuildFtsIndex: Effect.Effect<void, ParagraphDatabaseError>;
}

// ============================================================================
// Internal helpers
// ============================================================================

type FullParagraphRow = ParagraphRow & {
  book_code: string;
  book_title: string;
  book_author?: string;
};

const NodesJson = Schema.fromJsonString(Schema.Array(Node));
const decodeNodes = Schema.decodeUnknownSync(NodesJson);
const encodeNodes = Schema.encodeSync(NodesJson);

const paragraphToRow = (
  paragraph: EGWSchemas.Paragraph,
  bookId: number,
  createdAt: string,
  updatedAt: string,
): ParagraphRow => {
  const refcodeShort = Option.getOrNull(paragraph.refcode_short);
  const paraId = Option.getOrNull(paragraph.para_id);
  const refCode =
    refcodeShort ?? paragraph.refcode_long ?? paraId ?? `book-${bookId}-para-${paragraph.puborder}`;

  const { page, paragraph: paraNum } = parseRefcodeNumbers(
    paragraph.refcode_short.pipe(Option.orElse(() => Option.fromNullishOr(paragraph.refcode_long))),
  );
  const chapterHeading = isChapterHeading(Option.fromNullishOr(paragraph.element_type));
  let chapterHeadingValue = 0;
  if (chapterHeading) chapterHeadingValue = 1;

  return {
    para_id: paraId,
    refcode_short: refcodeShort,
    refcode_long: Option.getOrNull(Option.fromNullishOr(paragraph.refcode_long)),
    // Canonical AST on disk; FTS index uses content_text projection.
    nodes_json: encodeNodes(paragraph.nodes),
    content_text: nodesToText(paragraph.nodes),
    puborder: paragraph.puborder,
    element_type: Option.getOrNull(Option.fromNullishOr(paragraph.element_type)),
    element_subtype: Option.getOrNull(Option.fromNullishOr(paragraph.element_subtype)),
    book_id: bookId,
    ref_code: refCode,
    page_number: Option.getOrNull(page),
    paragraph_number: Option.getOrNull(paraNum),
    is_chapter_heading: chapterHeadingValue,
    created_at: createdAt,
    updated_at: updatedAt,
  };
};

const archivedParagraphToRow = (
  archived: PublicationArchive['paragraphs'][number],
  bookId: number,
  createdAt: string,
): ParagraphRow => {
  let chapterHeading = 0;
  if (archived.isHeading) chapterHeading = 1;
  return {
    para_id: archived.paragraph.reference.paragraphId,
    refcode_short: Option.getOrNull(archived.paragraph.refcode),
    refcode_long: wireNull,
    nodes_json: encodeNodes(archived.paragraph.nodes),
    content_text: nodesToText(archived.paragraph.nodes),
    puborder: archived.paragraph.order,
    element_type: Option.getOrNull(archived.paragraph.elementType),
    element_subtype: Option.getOrNull(archived.paragraph.elementSubtype),
    book_id: bookId,
    ref_code: archived.refcode,
    page_number: Option.getOrNull(archived.paragraph.page),
    paragraph_number: Option.getOrNull(archived.paragraph.number),
    is_chapter_heading: chapterHeading,
    created_at: createdAt,
    updated_at: createdAt,
  };
};

const validatePublicationArchive = (archive: PublicationArchive) =>
  Effect.gen(function* () {
    const publicationId = archive.publication.id;
    const publicationCode = archive.publication.code;
    const refcodes = new Set<string>();

    for (const archived of archive.paragraphs) {
      if (archived.paragraph.reference.publicationId !== publicationId) {
        return yield* ParagraphDataIntegrityError.make({
          cause: archived.paragraph.reference,
          location: `publication(${String(publicationId)}).paragraph-publication`,
        });
      }
      if (archived.paragraph.publicationCode !== publicationCode) {
        return yield* ParagraphDataIntegrityError.make({
          cause: archived.paragraph.publicationCode,
          location: `publication(${String(publicationId)}).paragraph-code`,
        });
      }
      if (refcodes.has(archived.refcode)) {
        return yield* ParagraphDataIntegrityError.make({
          cause: archived.refcode,
          location: `publication(${String(publicationId)}).duplicate-refcode`,
        });
      }
      refcodes.add(archived.refcode);
    }

    for (const reference of archive.bibleReferences) {
      if (!refcodes.has(reference.paragraphRefcode)) {
        return yield* ParagraphDataIntegrityError.make({
          cause: reference.paragraphRefcode,
          location: `publication(${String(publicationId)}).bible-reference`,
        });
      }
    }
  });

const rowToParagraph = (row: ParagraphRow) =>
  Effect.try({
    try: (): EGWSchemas.Paragraph => ({
      para_id: Option.fromNullishOr(row.para_id),
      id_prev: wireNull,
      id_next: wireNull,
      refcode_1: wireNull,
      refcode_2: wireNull,
      refcode_3: wireNull,
      refcode_4: wireNull,
      refcode_short: Option.fromNullishOr(row.refcode_short),
      refcode_long: Option.getOrNull(Option.fromNullishOr(row.refcode_long)),
      element_type: Option.getOrNull(Option.fromNullishOr(row.element_type)),
      element_subtype: Option.getOrNull(Option.fromNullishOr(row.element_subtype)),
      nodes: decodeNodes(row.nodes_json),
      puborder: row.puborder,
    }),
    catch: (cause) =>
      ParagraphDataIntegrityError.make({
        cause,
        location: `paragraphs(${row.book_id}:${row.ref_code}).nodes_json`,
      }),
  });

// ============================================================================
// Service Definition
// ============================================================================

export class EGWParagraphDatabase extends Context.Service<
  EGWParagraphDatabase,
  EGWParagraphDatabaseService
>()('@bible/core/egw-db/book-database/EGWParagraphDatabase') {
  /**
   * Driver-agnostic layer: requires `SqlClient.SqlClient`. Initializes the
   * schema (idempotent) and exposes all CRUD/query operations. Compose with
   * a SQLite driver layer (sqlite-bun, sqlite-node) via `Layer.provide`.
   */
  static layerCore: Layer.Layer<EGWParagraphDatabase, SqlError, SqlClient.SqlClient> = Layer.effect(
    EGWParagraphDatabase,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      // Schema version check via the per-service `schema_versions` registry
      // (NOT the shared `PRAGMA user_version` — multiple services share this DB
      // file and would clobber each other's version, forcing a drop+rebuild on
      // every launch; see ../db/schema-version.ts). 0 = fresh / never-stamped;
      // a non-zero mismatch means our tables' shape changed, so drop + recreate.
      // Books/sync_status are preserved — they're stable across bumps and
      // tossing them would force callers to re-add books before a re-sync.
      yield* ensureSchemaVersionsTable(sql);
      const currentVersion = yield* readSchemaVersion(sql, SCHEMA_NAME);
      if (currentVersion !== 0 && currentVersion !== SCHEMA_VERSION) {
        yield* sql.unsafe(`DROP TABLE IF EXISTS paragraphs_fts`);
        yield* sql.unsafe(`DROP TABLE IF EXISTS paragraph_bible_refs`);
        yield* sql.unsafe(`DROP TABLE IF EXISTS paragraphs`);
        // Sync rows now point at non-existent paragraph data — mark all books
        // as needing re-sync so the next sync repopulates the new schema.
        yield* sql.unsafe(`UPDATE sync_status SET status = 'pending'`).pipe(
          Effect.catch(() => Effect.void), // table may not exist yet on first init
        );
      }

      yield* sql.unsafe(`
        CREATE TABLE IF NOT EXISTS books (
          book_id INTEGER PRIMARY KEY,
          book_code TEXT NOT NULL,
          book_title TEXT NOT NULL,
          book_author TEXT NOT NULL,
          paragraph_count INTEGER DEFAULT 0,
          created_at TEXT NOT NULL
        )
      `);
      yield* sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_books_author ON books(book_author)`);
      yield* sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_books_code ON books(book_code)`);

      yield* sql.unsafe(`
        CREATE TABLE IF NOT EXISTS paragraphs (
          book_id INTEGER NOT NULL,
          ref_code TEXT NOT NULL,
          para_id TEXT,
          refcode_short TEXT,
          refcode_long TEXT,
          nodes_json TEXT NOT NULL,
          content_text TEXT NOT NULL,
          puborder INTEGER NOT NULL,
          element_type TEXT,
          element_subtype TEXT,
          page_number INTEGER,
          paragraph_number INTEGER,
          is_chapter_heading INTEGER DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (book_id, ref_code),
          FOREIGN KEY (book_id) REFERENCES books(book_id)
        )
      `);
      yield* sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_paragraphs_book_id ON paragraphs(book_id)`);
      yield* sql.unsafe(
        `CREATE INDEX IF NOT EXISTS idx_paragraphs_ref_code ON paragraphs(ref_code)`,
      );
      yield* sql.unsafe(
        `CREATE INDEX IF NOT EXISTS idx_paragraphs_puborder ON paragraphs(book_id, puborder)`,
      );
      yield* sql.unsafe(
        `CREATE INDEX IF NOT EXISTS idx_paragraphs_page ON paragraphs(book_id, page_number)`,
      );
      yield* sql.unsafe(
        `CREATE INDEX IF NOT EXISTS idx_paragraphs_chapter ON paragraphs(book_id, is_chapter_heading) WHERE is_chapter_heading = 1`,
      );

      yield* sql.unsafe(`
        CREATE TABLE IF NOT EXISTS paragraph_bible_refs (
          para_book_id INTEGER NOT NULL,
          para_ref_code TEXT NOT NULL,
          bible_book INTEGER NOT NULL,
          bible_chapter INTEGER NOT NULL,
          bible_verse INTEGER,
          PRIMARY KEY (para_book_id, para_ref_code, bible_book, bible_chapter, bible_verse),
          FOREIGN KEY (para_book_id, para_ref_code) REFERENCES paragraphs(book_id, ref_code)
        )
      `);
      yield* sql.unsafe(
        `CREATE INDEX IF NOT EXISTS idx_pbr_bible ON paragraph_bible_refs(bible_book, bible_chapter, bible_verse)`,
      );

      // FTS indexes the plain-text projection (content_text) since AST JSON
      // would tokenize bracket/quote noise. paragraphs is still the contentless
      // backing store — we keep external-content semantics so the FTS rowid
      // stays linked to the paragraphs PK shape.
      yield* sql.unsafe(`
        CREATE VIRTUAL TABLE IF NOT EXISTS paragraphs_fts USING fts5(
          content_text,
          refcode_short,
          book_id UNINDEXED,
          content=paragraphs,
          content_rowid=rowid
        )
      `);
      yield* sql.unsafe(`
        CREATE TRIGGER IF NOT EXISTS paragraphs_fts_after_insert
        AFTER INSERT ON paragraphs BEGIN
          INSERT INTO paragraphs_fts(rowid, content_text, refcode_short, book_id)
          VALUES (new.rowid, new.content_text, new.refcode_short, new.book_id);
        END
      `);
      yield* sql.unsafe(`
        CREATE TRIGGER IF NOT EXISTS paragraphs_fts_after_delete
        AFTER DELETE ON paragraphs BEGIN
          INSERT INTO paragraphs_fts(
            paragraphs_fts, rowid, content_text, refcode_short, book_id
          ) VALUES (
            'delete', old.rowid, old.content_text, old.refcode_short, old.book_id
          );
        END
      `);
      yield* sql.unsafe(`
        CREATE TRIGGER IF NOT EXISTS paragraphs_fts_after_update
        AFTER UPDATE ON paragraphs BEGIN
          INSERT INTO paragraphs_fts(
            paragraphs_fts, rowid, content_text, refcode_short, book_id
          ) VALUES (
            'delete', old.rowid, old.content_text, old.refcode_short, old.book_id
          );
          INSERT INTO paragraphs_fts(rowid, content_text, refcode_short, book_id)
          VALUES (new.rowid, new.content_text, new.refcode_short, new.book_id);
        END
      `);

      yield* sql.unsafe(`
        CREATE TABLE IF NOT EXISTS sync_status (
          book_id INTEGER PRIMARY KEY,
          book_code TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          error_message TEXT,
          last_attempt TEXT NOT NULL,
          paragraph_count INTEGER DEFAULT 0,
          source TEXT,
          revision TEXT,
          digest TEXT
        )
      `);
      const syncColumns = yield* sql<{ readonly name: string }>`PRAGMA table_info(sync_status)`;
      const syncColumnNames = new Set(syncColumns.map((column) => column.name));
      if (!syncColumnNames.has('source'))
        yield* sql.unsafe(`ALTER TABLE sync_status ADD COLUMN source TEXT`);
      if (!syncColumnNames.has('revision'))
        yield* sql.unsafe(`ALTER TABLE sync_status ADD COLUMN revision TEXT`);
      if (!syncColumnNames.has('digest'))
        yield* sql.unsafe(`ALTER TABLE sync_status ADD COLUMN digest TEXT`);
      yield* sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_sync_status ON sync_status(status)`);

      // Stamp our schema version; the next open sees the match and skips the
      // drop/rebuild branch above.
      yield* writeSchemaVersion(sql, SCHEMA_NAME, SCHEMA_VERSION);

      // ========== Book operations ==========

      const storeBook = (book: EGWSchemas.Book) =>
        Effect.gen(function* () {
          const createdAt = DateTime.formatIso(yield* DateTime.now);
          yield* sql`
          INSERT INTO books (book_id, book_code, book_title, book_author, paragraph_count, created_at)
          VALUES (${book.book_id}, ${book.code}, ${book.title}, ${book.author}, 0, ${createdAt})
          ON CONFLICT(book_id) DO UPDATE SET
            book_code = excluded.book_code,
            book_title = excluded.book_title,
            book_author = excluded.book_author
        `;
        });

      const getBookById = (bookId: number) =>
        sql<BookRow>`SELECT * FROM books WHERE book_id = ${bookId}`.pipe(
          Effect.map((rows) => Option.fromNullishOr(rows[0])),
        );

      const getBookByCode = (bookCode: string) =>
        sql<BookRow>`SELECT * FROM books WHERE book_code = ${bookCode} COLLATE NOCASE`.pipe(
          Effect.map((rows) => Option.fromNullishOr(rows[0])),
        );

      const getBooksByCode = (bookCode: string) =>
        sql<BookRow>`SELECT * FROM books WHERE book_code = ${bookCode} COLLATE NOCASE ORDER BY book_id`;

      const getBooksByAuthor = (author: string) =>
        Stream.fromIterableEffect(
          sql<BookRow>`SELECT * FROM books WHERE book_author = ${author} ORDER BY book_id`,
        );

      const getAllBooks = Stream.fromIterableEffect(
        sql<BookRow>`SELECT * FROM books ORDER BY book_author, book_title`,
      );

      const updateBookCount = (bookId: number) =>
        sql`
          UPDATE books SET paragraph_count = (
            SELECT COUNT(*) FROM paragraphs WHERE book_id = ${bookId}
          ) WHERE book_id = ${bookId}
        `.pipe(Effect.asVoid);

      // ========== Paragraph operations ==========

      const insertParagraphRow = (row: ParagraphRow) =>
        sql`
          INSERT INTO paragraphs (
            book_id, ref_code, para_id, refcode_short, refcode_long,
            nodes_json, content_text, puborder, element_type, element_subtype,
            page_number, paragraph_number, is_chapter_heading,
            created_at, updated_at
          ) VALUES (
            ${row.book_id}, ${row.ref_code}, ${row.para_id}, ${row.refcode_short}, ${row.refcode_long},
            ${row.nodes_json}, ${row.content_text}, ${row.puborder}, ${row.element_type}, ${row.element_subtype},
            ${row.page_number}, ${row.paragraph_number}, ${row.is_chapter_heading},
            ${row.created_at}, ${row.updated_at}
          )
          ON CONFLICT(book_id, ref_code) DO UPDATE SET
            para_id = excluded.para_id,
            refcode_short = excluded.refcode_short,
            refcode_long = excluded.refcode_long,
            nodes_json = excluded.nodes_json,
            content_text = excluded.content_text,
            puborder = excluded.puborder,
            element_type = excluded.element_type,
            element_subtype = excluded.element_subtype,
            page_number = excluded.page_number,
            paragraph_number = excluded.paragraph_number,
            is_chapter_heading = excluded.is_chapter_heading,
            updated_at = excluded.updated_at
        `.pipe(Effect.asVoid);

      const installPublicationArchive = Effect.fn('EGWParagraphDatabase.installPublicationArchive')(
        function* (archive: PublicationArchive, provenance?: CorpusProvenance) {
          yield* validatePublicationArchive(archive);

          const publication = archive.publication;
          const publicationId = publication.id;
          const now = DateTime.formatIso(yield* DateTime.now);
          const rows = archive.paragraphs.map((paragraph) =>
            archivedParagraphToRow(paragraph, publicationId, now),
          );

          return yield* sql.withTransaction(
            Effect.gen(function* () {
              yield* sql`
              DELETE FROM paragraph_bible_refs WHERE para_book_id = ${publicationId}
            `;
              yield* sql`DELETE FROM paragraphs WHERE book_id = ${publicationId}`;
              yield* sql`
              INSERT INTO books (
                book_id, book_code, book_title, book_author, paragraph_count, created_at
              ) VALUES (
                ${publicationId}, ${publication.code}, ${publication.title},
                ${publication.author}, ${rows.length}, ${now}
              )
              ON CONFLICT(book_id) DO UPDATE SET
                book_code = excluded.book_code,
                book_title = excluded.book_title,
                book_author = excluded.book_author,
                paragraph_count = excluded.paragraph_count
            `;

              for (const row of rows) {
                yield* insertParagraphRow(row);
              }
              for (const reference of archive.bibleReferences) {
                let verse = Option.none<number>();
                if (reference.scripture._tag === 'verse')
                  verse = Option.some(reference.scripture.verse);
                yield* sql`
                INSERT INTO paragraph_bible_refs (
                  para_book_id, para_ref_code, bible_book, bible_chapter, bible_verse
                ) VALUES (
                  ${publicationId}, ${reference.paragraphRefcode}, ${reference.scripture.book},
                  ${reference.scripture.chapter}, ${Option.getOrNull(verse)}
                )
              `;
              }

              const provenanceOption = Option.fromNullishOr(provenance);
              const provenanceDigest = Option.getOrNull(
                Option.flatMap(provenanceOption, (value) => value.digest),
              );

              yield* sql`
              INSERT INTO sync_status (
                book_id, book_code, status, error_message, last_attempt, paragraph_count,
                source, revision, digest
              ) VALUES (
                ${publicationId}, ${publication.code}, 'success', NULL, ${now}, ${rows.length},
                ${Option.getOrNull(Option.map(provenanceOption, (value) => value.source))},
                ${Option.getOrNull(Option.map(provenanceOption, (value) => value.revision))},
                ${provenanceDigest}
              )
              ON CONFLICT(book_id) DO UPDATE SET
                book_code = excluded.book_code,
                status = excluded.status,
                error_message = NULL,
                last_attempt = excluded.last_attempt,
                paragraph_count = excluded.paragraph_count,
                source = excluded.source,
                revision = excluded.revision,
                digest = excluded.digest
            `;

              const installed = yield* sql<{ count: number }>`
              SELECT COUNT(*) AS count FROM paragraphs WHERE book_id = ${publicationId}
            `;
              const installedCount = installed[0]?.count ?? -1;
              if (installedCount !== rows.length) {
                return yield* ParagraphDataIntegrityError.make({
                  cause: { expected: rows.length, actual: installedCount },
                  location: `publication(${String(publicationId)}).installed-count`,
                });
              }
              return installedCount;
            }),
          );
        },
      );

      const storeParagraph = (paragraph: EGWSchemas.Paragraph, book: EGWSchemas.Book) =>
        Effect.gen(function* () {
          const now = DateTime.formatIso(yield* DateTime.now);

          yield* storeBook(book);

          const refCode =
            Option.getOrNull(paragraph.refcode_short) ??
            paragraph.refcode_long ??
            Option.getOrNull(paragraph.para_id) ??
            `book-${book.book_id}-para-${paragraph.puborder}`;

          const existing = yield* sql<{ created_at: string }>`
            SELECT created_at FROM paragraphs
            WHERE book_id = ${book.book_id} AND ref_code = ${refCode}
          `;
          const createdAt = existing[0]?.created_at ?? now;
          const row = paragraphToRow(paragraph, book.book_id, createdAt, now);
          yield* insertParagraphRow(row);
        });

      const storeParagraphsBatch = (
        paragraphs: readonly EGWSchemas.Paragraph[],
        book: EGWSchemas.Book,
      ) =>
        sql.withTransaction(
          Effect.gen(function* () {
            const now = DateTime.formatIso(yield* DateTime.now);
            yield* storeBook(book);
            for (const paragraph of paragraphs) {
              const row = paragraphToRow(paragraph, book.book_id, now, now);
              yield* insertParagraphRow(row);
            }
            return paragraphs.length;
          }),
        );

      const getParagraph = (bookId: number, refCode: string) =>
        sql<ParagraphRow>`
          SELECT * FROM paragraphs WHERE book_id = ${bookId} AND ref_code = ${refCode}
        `.pipe(
          Effect.flatMap((rows) =>
            Option.fromNullishOr(rows[0]).pipe(
              Option.match({
                onNone: () => Effect.succeed(Option.none<EGWSchemas.Paragraph>()),
                onSome: (row) => rowToParagraph(row).pipe(Effect.map(Option.some)),
              }),
            ),
          ),
        );

      const getParagraphsByBook = (bookId: number) =>
        Stream.fromIterableEffect(
          sql<ParagraphRow>`
            SELECT * FROM paragraphs WHERE book_id = ${bookId} ORDER BY puborder
          `,
        ).pipe(Stream.mapEffect(rowToParagraph));

      const getParagraphsByAuthor = (author: string) =>
        Stream.fromIterableEffect(
          sql<ParagraphRow>`
            SELECT p.* FROM paragraphs p
            JOIN books b ON p.book_id = b.book_id
            WHERE b.book_author = ${author}
            ORDER BY p.book_id, p.puborder
          `,
        ).pipe(Stream.mapEffect(rowToParagraph));

      const getParagraphsByPage = (bookId: number, pageNumber: number) =>
        sql<ParagraphRow>`
          SELECT * FROM paragraphs
          WHERE book_id = ${bookId} AND page_number = ${pageNumber}
          ORDER BY puborder
        `.pipe(Effect.flatMap((rows) => Effect.forEach(rows, rowToParagraph)));

      const getChapterHeadings = (bookId: number) =>
        sql<ParagraphRow>`
          SELECT * FROM paragraphs
          WHERE book_id = ${bookId} AND is_chapter_heading = 1
          ORDER BY puborder
        `.pipe(Effect.flatMap((rows) => Effect.forEach(rows, rowToParagraph)));

      /** One statement with a composed `WHERE`, rather than one hand-written
       *  statement per combination of filters — three optional filters would
       *  otherwise mean eight near-identical copies of the same join, and the
       *  `ORDER BY rank` §6.4 adds would have to be right in all eight.
       *
       *  `ORDER BY rank` is FTS5's own relevance ordering (a negative BM25, so
       *  ascending is best-first). Before §6.4 the `LIMIT` was applied with no
       *  ordering at all, which made "FTS rank" in the §6.1 table a claim the
       *  query did not honor: SQLite returned whichever rows the join reached
       *  first. Ordering *and* limiting in the same statement is what makes the
       *  cap select the best N rather than an arbitrary N. */
      /** The `WHERE` both search statements share.
       *
       *  Factored out because the count and the rows have to agree exactly: a
       *  `total` computed under a different predicate than the `items` it
       *  accompanies is worse than no total at all, and the scope filter in
       *  particular is two clauses that must stay in lockstep. */
      const searchFilters = (
        query: string,
        options?: { readonly bookCode?: string; readonly scope?: CorpusScope },
      ): (string | Statement.Fragment)[] => {
        const bookCode = options?.bookCode;
        const filters: (string | Statement.Fragment)[] = [sql`paragraphs_fts MATCH ${query}`];
        if (Predicate.isNotUndefined(bookCode)) {
          filters.push(sql`b.book_code = ${bookCode} COLLATE NOCASE`);
        }
        // The author partition is binary, so `pioneer` is expressed as the
        // negation of the same list `egw` selects — one constant, no second
        // enumeration that could drift out of agreement with the first.
        if (options?.scope === 'egw') {
          filters.push(sql.in('b.book_author', [...EGW_SCOPE_AUTHORS]));
        }
        if (options?.scope === 'pioneer') {
          filters.push(sql`NOT ${sql.in('b.book_author', [...EGW_SCOPE_AUTHORS])}`);
        }
        return filters;
      };

      /** The whole match count, which the row query's `LIMIT` cannot report.
       *
       *  `searchParagraphs` pushes the caller's cap into SQL, so its result
       *  length saturates at the cap and a caller computing "how many matched"
       *  from it can never see past the cap. §6.1's `total` means the pre-cap
       *  count, so it needs its own statement — one that runs the same MATCH
       *  and the same joins but selects a count and drops the `ORDER BY`, which
       *  FTS5 does not need in order to count. */
      const countSearchParagraphs = (
        query: string,
        options?: { readonly bookCode?: string; readonly scope?: CorpusScope },
      ) =>
        sql<{ readonly total: number }>`
              SELECT count(*) AS total
              FROM paragraphs p
              JOIN paragraphs_fts fts ON p.rowid = fts.rowid
              JOIN books b ON p.book_id = b.book_id
              WHERE ${sql.and(searchFilters(query, options))}
            `.pipe(Effect.map((rows) => rows[0]?.total ?? 0));

      const searchParagraphs = (
        query: string,
        options?: {
          readonly limit?: number;
          readonly bookCode?: string;
          readonly scope?: CorpusScope;
        },
      ) => {
        const limit = options?.limit ?? 50;
        const filters = searchFilters(query, options);
        return sql<FullParagraphRow>`
              SELECT p.*, b.book_code, b.book_title, b.book_author
              FROM paragraphs p
              JOIN paragraphs_fts fts ON p.rowid = fts.rowid
              JOIN books b ON p.book_id = b.book_id
              WHERE ${sql.and(filters)}
              ORDER BY fts.rank
              LIMIT ${limit}
            `.pipe(
          Effect.flatMap((rows) =>
            Effect.forEach(rows, (row) =>
              rowToParagraph(row).pipe(
                Effect.map((paragraph) => ({
                  ...paragraph,
                  bookCode: row.book_code,
                  bookTitle: row.book_title,
                  bookId: row.book_id,
                })),
              ),
            ),
          ),
        );
      };

      /** The same statement as `searchParagraphs`, selecting `fts.rank` and the
       *  four columns §9 renders instead of the whole row.
       *
       *  It shares `searchFilters` with the other two statements for the reason
       *  they share it with each other: three MATCH-and-scope predicates
       *  written three times is three chances for the scope filter to mean
       *  something slightly different, and a search whose scoring query and
       *  whose counting query disagree about scope is a search whose
       *  short-circuit fires on a hit the reader cannot be shown. */
      const searchScoredParagraphs = (
        query: string,
        options?: {
          readonly limit?: number;
          readonly bookCode?: string;
          readonly scope?: CorpusScope;
        },
      ) => {
        const limit = options?.limit ?? 30;
        const filters = searchFilters(query, options);
        return sql<{
          readonly book_code: string;
          readonly book_title: string;
          readonly book_author: string;
          readonly ref_code: string;
          // SQLite has no Option type, so a nullable column arrives as `null`
          // and is translated at this boundary — the same convention
          // `ParagraphRow` documents above for `refcode_short` and `para_id`.
          // oxlint-disable-next-line effect/noNullish -- the storage boundary, see above
          readonly refcode_short: string | null;
          // oxlint-disable-next-line effect/noNullish -- the storage boundary, see above
          readonly para_id: string | null;
          readonly nodes_json: string;
          readonly rank: number;
          readonly book_id: number;
        }>`
              SELECT b.book_id, b.book_code, b.book_title, b.book_author,
                     p.ref_code, p.refcode_short, p.para_id, p.nodes_json, fts.rank
              FROM paragraphs p
              JOIN paragraphs_fts fts ON p.rowid = fts.rowid
              JOIN books b ON p.book_id = b.book_id
              WHERE ${sql.and(filters)}
              ORDER BY fts.rank
              LIMIT ${limit}
            `.pipe(
          Effect.map((rows) =>
            rows.map((row): ScoredParagraphRow => ({
              bookCode: row.book_code,
              bookTitle: row.book_title,
              bookAuthor: row.book_author,
              publicationId: row.book_id,
              rawParaId: Option.fromNullishOr(row.para_id),
              para_id: paragraphIdentity(
                row.book_code,
                Option.fromNullishOr(row.para_id),
                row.ref_code,
              ),
              ref_code: row.ref_code,
              refcode_short: Option.fromNullishOr(row.refcode_short),
              nodes: decodeNodes(row.nodes_json),
              rank: row.rank,
            })),
          ),
        );
      };

      /** The rows behind a set of identity keys, in one `IN (...)`.
       *
       *  Matched on `b.book_code || ':' || p.para_id`, which is exactly what
       *  `paragraphIdentity` builds — the key is composed in SQL rather than
       *  decomposed in TypeScript so the two spellings cannot drift, and so a
       *  key this build did not produce simply matches nothing.
       *
       *  Rows whose `para_id` is NULL are unreachable by this lookup, which is
       *  correct: `paragraphIdentity` gives them a `#`-prefixed key that no
       *  concatenation of a NULL can equal, and SQLite's `||` yields NULL for
       *  them anyway. */
      const findParagraphsByIdentity = (identities: readonly string[]) => {
        if (identities.length === 0) {
          return Effect.succeed<readonly ScoredParagraphRow[]>([]);
        }
        return sql<{
          readonly book_code: string;
          readonly book_title: string;
          readonly book_author: string;
          readonly ref_code: string;
          // oxlint-disable-next-line effect/noNullish -- the storage boundary, see above
          readonly refcode_short: string | null;
          // oxlint-disable-next-line effect/noNullish -- the storage boundary, see above
          readonly para_id: string | null;
          readonly nodes_json: string;
          readonly book_id: number;
        }>`
              SELECT b.book_id, b.book_code, b.book_title, b.book_author,
                     p.ref_code, p.refcode_short, p.para_id, p.nodes_json
              FROM paragraphs p
              JOIN books b ON p.book_id = b.book_id
              WHERE b.book_code || ':' || p.para_id IN ${sql.in([...identities])}
            `.pipe(
          Effect.map((rows) =>
            rows.map((row): ScoredParagraphRow => ({
              bookCode: row.book_code,
              bookTitle: row.book_title,
              bookAuthor: row.book_author,
              publicationId: row.book_id,
              rawParaId: Option.fromNullishOr(row.para_id),
              para_id: paragraphIdentity(
                row.book_code,
                Option.fromNullishOr(row.para_id),
                row.ref_code,
              ),
              ref_code: row.ref_code,
              refcode_short: Option.fromNullishOr(row.refcode_short),
              nodes: decodeNodes(row.nodes_json),
              // No FTS match produced this row, so it carries no BM25 evidence.
              rank: 0,
            })),
          ),
        );
      };

      const getMaxPage = (bookId: number) =>
        sql<MaxPageRow>`
          SELECT MAX(page_number) as max_page FROM paragraphs WHERE book_id = ${bookId}
        `.pipe(Effect.map((rows) => rows[0]?.max_page ?? 1));

      const getPageNumbers = (bookId: number) =>
        sql<{ page_number: number }>`
          SELECT DISTINCT page_number FROM paragraphs
          WHERE book_id = ${bookId} AND page_number IS NOT NULL
          ORDER BY page_number
        `.pipe(Effect.map((rows) => rows.map((row) => row.page_number)));

      // The user types human refcodes ("DAR 62", "PP 351.1", "GC"); the index
      // stores them in the EGW canonical form ("DAR1909 62", "PP 351.1"). We
      // split on the first space: the head is matched as a book_code prefix
      // (LIKE 'DAR%' covers DAR / DAR1909 / DAR-suffix editions) and the tail
      // is matched against refcode_short as either an exact "<code> <tail>" or
      // a prefix "<code> <tail>%" (so "DAR 62" sweeps every paragraph on
      // chapter 62 in addition to the bare chapter heading).
      const findByRefcodeShort = (refcodeShort: string, limit = 5) => {
        const trimmed = refcodeShort.trim();
        const spaceAt = trimmed.indexOf(' ');
        let head = trimmed;
        let tail = '';
        if (spaceAt !== -1) {
          head = trimmed.slice(0, spaceAt);
          tail = trimmed.slice(spaceAt + 1).trim();
        }
        head = head.trim();
        const codePrefix = `${head}%`;
        // Tail variants: exact match ("DAR1909 62"), child-paragraph match
        // ("DAR1909 62.X"), and bare-code fallback for tail === '' (any row
        // under a matching book). LIKE patterns are case-insensitive in
        // SQLite by default for ASCII, but COLLATE NOCASE keeps it explicit
        // alongside the join on books.
        return sql<FullParagraphRow>`
          SELECT p.*, b.book_code, b.book_title
          FROM paragraphs p
          JOIN books b ON p.book_id = b.book_id
          WHERE b.book_code LIKE ${codePrefix} COLLATE NOCASE
            AND (
              ${tail === ''}
              OR p.refcode_short LIKE ${`% ${tail}`} COLLATE NOCASE
              OR p.refcode_short LIKE ${`% ${tail}.%`} COLLATE NOCASE
            )
          ORDER BY b.book_code, p.puborder
          LIMIT ${limit}
        `.pipe(
          Effect.flatMap((rows) =>
            Effect.forEach(rows, (row) =>
              rowToParagraph(row).pipe(
                Effect.map((paragraph) => ({
                  ...paragraph,
                  bookCode: row.book_code,
                  bookTitle: row.book_title,
                  bookId: row.book_id,
                })),
              ),
            ),
          ),
        );
      };

      // ========== Bible reference operations ==========

      const storeBibleRef = (
        bookId: number,
        refCode: string,
        bibleBook: number,
        bibleChapter: number,
        bibleVerse: Option.Option<number>,
      ) =>
        sql`
          INSERT OR IGNORE INTO paragraph_bible_refs
          (para_book_id, para_ref_code, bible_book, bible_chapter, bible_verse)
          VALUES (${bookId}, ${refCode}, ${bibleBook}, ${bibleChapter}, ${Option.getOrNull(bibleVerse)})
        `.pipe(Effect.asVoid);

      const storeBibleRefsBatch = (
        refs: readonly {
          bookId: number;
          refCode: string;
          bibleBook: number;
          bibleChapter: number;
          bibleVerse: Option.Option<number>;
        }[],
      ) => {
        if (refs.length === 0) return Effect.succeed(0);
        return sql.withTransaction(
          Effect.gen(function* () {
            for (const ref of refs) {
              yield* storeBibleRef(
                ref.bookId,
                ref.refCode,
                ref.bibleBook,
                ref.bibleChapter,
                ref.bibleVerse,
              );
            }
            return refs.length;
          }),
        );
      };

      const getBibleRefsByBook = (bookId: number) =>
        sql<BibleRefRow>`
          SELECT para_book_id, para_ref_code, bible_book, bible_chapter, bible_verse
          FROM paragraph_bible_refs WHERE para_book_id = ${bookId}
        `;

      const getBibleVersesWithCommentary = (bibleBook: number, bibleChapter: number) =>
        sql<CommentaryVerseRow>`
          SELECT DISTINCT bible_verse FROM paragraph_bible_refs
          WHERE bible_book = ${bibleBook}
            AND bible_chapter = ${bibleChapter}
            AND bible_verse IS NOT NULL
          ORDER BY bible_verse
        `.pipe(
          Effect.map((rows) => {
            const out: number[] = [];
            for (const r of rows) {
              if (Predicate.isNotNull(r.bible_verse)) out.push(r.bible_verse);
            }
            return out;
          }),
        );

      const getParagraphsByBibleRef = (
        bibleBook: number,
        bibleChapter: number,
        bibleVerse?: number,
      ) => {
        let query = sql<FullParagraphRow>`
                SELECT p.*, b.book_code, b.book_title, b.book_author
                FROM paragraphs p
                JOIN paragraph_bible_refs pbr
                  ON p.book_id = pbr.para_book_id AND p.ref_code = pbr.para_ref_code
                JOIN books b ON p.book_id = b.book_id
                WHERE pbr.bible_book = ${bibleBook}
                  AND pbr.bible_chapter = ${bibleChapter}
                ORDER BY b.book_code, p.puborder
              `;
        if (Predicate.isNotUndefined(bibleVerse)) {
          query = sql<FullParagraphRow>`
                SELECT p.*, b.book_code, b.book_title, b.book_author
                FROM paragraphs p
                JOIN paragraph_bible_refs pbr
                  ON p.book_id = pbr.para_book_id AND p.ref_code = pbr.para_ref_code
                JOIN books b ON p.book_id = b.book_id
                WHERE pbr.bible_book = ${bibleBook}
                  AND pbr.bible_chapter = ${bibleChapter}
                  AND pbr.bible_verse = ${bibleVerse}
                ORDER BY b.book_code, p.puborder
              `;
        }
        return query.pipe(
          Effect.flatMap((rows) =>
            Effect.forEach(rows, (row) =>
              rowToParagraph(row).pipe(
                Effect.map((paragraph) => ({
                  ...paragraph,
                  bookId: row.book_id,
                  bookCode: row.book_code,
                  bookTitle: row.book_title,
                  // `FullParagraphRow` types the column optional because two
                  // other statements omit it; this one selects it, so the
                  // empty fallback is unreachable rather than a default.
                  bookAuthor: Option.getOrElse(Option.fromNullishOr(row.book_author), () => ''),
                })),
              ),
            ),
          ),
        );
      };

      // ========== Sync status operations ==========

      const setSyncStatus = (
        bookId: number,
        bookCode: string,
        status: SyncStatus,
        paragraphCount: number,
        errorMessage?: string,
      ) =>
        Effect.gen(function* () {
          const lastAttempt = DateTime.formatIso(yield* DateTime.now);
          yield* sql`
          INSERT INTO sync_status (book_id, book_code, status, error_message, last_attempt, paragraph_count)
          VALUES (${bookId}, ${bookCode}, ${status}, ${Option.getOrNull(Option.fromNullishOr(errorMessage))}, ${lastAttempt}, ${paragraphCount})
          ON CONFLICT(book_id) DO UPDATE SET
            status = excluded.status,
            error_message = excluded.error_message,
            last_attempt = excluded.last_attempt,
            paragraph_count = excluded.paragraph_count
        `;
        });

      const getSyncStatus = (bookId: number) =>
        sql<SyncStatusRow>`SELECT * FROM sync_status WHERE book_id = ${bookId}`.pipe(
          Effect.map((rows) => Option.fromNullishOr(rows[0])),
        );

      const getBooksByStatus = (status: SyncStatus) =>
        sql<SyncStatusRow>`SELECT * FROM sync_status WHERE status = ${status}`;

      const getAllSyncStatus = sql<SyncStatusRow>`SELECT * FROM sync_status ORDER BY book_code`;

      const needsSync = (bookId: number, expected?: CorpusProvenance) =>
        getSyncStatus(bookId).pipe(
          Effect.map((optStatus) => {
            if (Option.isNone(optStatus) || optStatus.value.status !== 'success') return true;
            if (Predicate.isUndefined(expected)) return false;
            const status = optStatus.value;
            if (status.source !== expected.source || status.revision !== expected.revision)
              return true;
            if (Option.isNone(expected.digest)) return false;
            return status.digest !== expected.digest.value;
          }),
        );

      const rebuildFtsIndex = sql
        .unsafe(`INSERT INTO paragraphs_fts(paragraphs_fts) VALUES('rebuild')`)
        .pipe(Effect.asVoid);

      const backfillBibleRefs = (
        extract: (
          paragraphs: readonly EGWSchemas.Paragraph[],
          bookId: number,
        ) => readonly {
          bookId: number;
          refCode: string;
          bibleBook: number;
          bibleChapter: number;
          bibleVerse: Option.Option<number>;
        }[],
      ) =>
        Effect.gen(function* () {
          // Cheap gate: if anything's already in the table, assume incremental
          // indexing is keeping up and we don't need to scan the whole corpus.
          const existing = yield* sql<{ n: number }>`
            SELECT COUNT(*) AS n FROM paragraph_bible_refs LIMIT 1
          `;
          if ((existing[0]?.n ?? 0) > 0) {
            return { scanned: 0, inserted: 0 };
          }

          let scanned = 0;
          let inserted = 0;
          const books = yield* Stream.runCollect(getAllBooks);
          for (const book of books) {
            const paragraphs = yield* Stream.runCollect(getParagraphsByBook(book.book_id));
            const arr = Array.from(paragraphs);
            scanned += arr.length;
            const refs = extract(arr, book.book_id);
            if (refs.length > 0) {
              const wrote = yield* storeBibleRefsBatch(refs);
              inserted += wrote;
            }
          }
          return { scanned, inserted };
        });

      return EGWParagraphDatabase.of({
        installPublicationArchive,
        storeBook,
        getBookById,
        getBookByCode,
        getBooksByCode,
        getBooksByAuthor,
        getAllBooks,
        updateBookCount,
        storeParagraph,
        storeParagraphsBatch,
        getParagraph,
        getParagraphsByBook,
        getParagraphsByAuthor,
        getParagraphsByPage,
        getChapterHeadings,
        searchParagraphs,
        searchScoredParagraphs,
        findParagraphsByIdentity,
        countSearchParagraphs,
        findByRefcodeShort,
        getMaxPage,
        getPageNumbers,
        storeBibleRef,
        storeBibleRefsBatch,
        getBibleRefsByBook,
        getParagraphsByBibleRef,
        getBibleVersesWithCommentary,
        setSyncStatus,
        getSyncStatus,
        getBooksByStatus,
        getAllSyncStatus,
        needsSync,
        rebuildFtsIndex,
        backfillBibleRefs,
      });
    }),
  );

  /**
   * Test implementation with in-memory data.
   */
  static Test = (
    config: {
      books?: readonly BookRow[];
      paragraphs?: readonly TestParagraph[];
      bibleRefs?: readonly BibleRefRow[];
      syncStatuses?: readonly SyncStatusRow[];
      installPublicationArchive?: (
        archive: PublicationArchive,
        provenance?: CorpusProvenance,
      ) => number;
      needsSync?: (bookId: number, expected?: CorpusProvenance) => boolean;
    } = {},
  ): Layer.Layer<EGWParagraphDatabase> =>
    Layer.succeed(
      EGWParagraphDatabase,
      EGWParagraphDatabase.of({
        installPublicationArchive: (archive, provenance) =>
          Effect.succeed(
            config.installPublicationArchive?.(archive, provenance) ?? archive.paragraphs.length,
          ),
        storeBook: () => Effect.void,
        getBookById: (bookId) =>
          Effect.succeed(Option.fromNullishOr(config.books?.find((b) => b.book_id === bookId))),
        getBookByCode: (bookCode) =>
          Effect.succeed(
            Option.fromNullishOr(
              config.books?.find((b) => b.book_code.toLowerCase() === bookCode.toLowerCase()),
            ),
          ),
        getBooksByCode: (bookCode) =>
          Effect.succeed(
            config.books?.filter(
              (book) => book.book_code.toLowerCase() === bookCode.toLowerCase(),
            ) ?? [],
          ),
        getBooksByAuthor: (author) =>
          Stream.fromIterable(config.books?.filter((b) => b.book_author === author) ?? []),
        getAllBooks: Stream.suspend(() => Stream.fromIterable(config.books ?? [])),
        updateBookCount: () => Effect.void,
        storeParagraph: () => Effect.void,
        storeParagraphsBatch: (paragraphs) => Effect.succeed(paragraphs.length),
        getParagraph: (bookId, refcode) => {
          const bookCode = config.books?.find((book) => book.book_id === bookId)?.book_code;
          return Effect.succeed(
            Option.fromNullishOr(
              config.paragraphs?.find(
                (paragraph) =>
                  paragraph.bookCode === bookCode &&
                  (Option.getOrUndefined(paragraph.refcode_short) === refcode ||
                    paragraph.refcode_long === refcode),
              ),
            ),
          );
        },
        getParagraphsByBook: (bookId) => {
          const bookCode = config.books?.find((book) => book.book_id === bookId)?.book_code;
          return Stream.fromIterable(
            config.paragraphs?.filter((paragraph) => paragraph.bookCode === bookCode) ?? [],
          );
        },
        getParagraphsByAuthor: (author) => {
          const bookCodes = new Set(
            config.books
              ?.filter((book) => book.book_author === author)
              .map((book) => book.book_code) ?? [],
          );
          return Stream.fromIterable(
            config.paragraphs?.filter((paragraph) => bookCodes.has(paragraph.bookCode)) ?? [],
          );
        },
        getParagraphsByPage: (bookId, page) => {
          const bookCode = config.books?.find((book) => book.book_id === bookId)?.book_code;
          return Effect.succeed(
            config.paragraphs?.filter((paragraph) => {
              const refcode =
                Option.getOrUndefined(paragraph.refcode_short) ?? paragraph.refcode_long ?? '';
              return paragraph.bookCode === bookCode && refcode.startsWith(`${bookCode} ${page}.`);
            }) ?? [],
          );
        },
        getChapterHeadings: (bookId) => {
          const bookCode = config.books?.find((book) => book.book_id === bookId)?.book_code;
          return Effect.succeed(
            config.paragraphs?.filter(
              (paragraph) =>
                paragraph.bookCode === bookCode &&
                (paragraph.element_type === 'chapter' ||
                  paragraph.element_type === 'title' ||
                  paragraph.element_type?.toLowerCase().startsWith('h')),
            ) ?? [],
          );
        },
        // The test double applies the same three filters the live query applies,
        // so a caller that scopes its search sees a scoped result here too. The
        // relevance *order* is the one thing it cannot reproduce — there is no
        // FTS index behind it — so it preserves the configured paragraph order
        // and a test that cares about rank must use a real database.
        searchParagraphs: (query, options) =>
          Effect.succeed(
            testSearchMatches(config, query, options)
              .slice(0, options?.limit)
              .map(({ book: _book, ...row }) => row),
          ),
        // The double has no FTS index, so it cannot compute a real BM25. It
        // reports the rank a test configured on the paragraph instead, defaulting
        // to a weak one — which is what lets a §9.3 short-circuit test state its
        // premise ("the top hit is strong and clearly separated") as data rather
        // than needing a real SQLite corpus to produce it by luck.
        searchScoredParagraphs: (query, options) =>
          Effect.succeed(
            testSearchMatches(config, query, options)
              .slice(0, options?.limit)
              .map((row): ScoredParagraphRow => ({
                bookCode: row.bookCode,
                bookTitle: row.bookTitle,
                bookAuthor: row.book.book_author,
                publicationId: row.book.book_id,
                rawParaId: row.para_id,
                para_id: paragraphIdentity(
                  row.bookCode,
                  row.para_id,
                  Option.getOrElse(row.refcode_short, () => row.refcode_long ?? ''),
                ),
                ref_code: Option.getOrElse(row.refcode_short, () => row.refcode_long ?? ''),
                refcode_short: row.refcode_short,
                nodes: row.nodes,
                rank: row.rank,
              })),
          ),
        // Keyed by the same `paragraphIdentity` the live statement composes in
        // SQL, so a fixture and a real corpus answer the same key the same way.
        findParagraphsByIdentity: (identities) => {
          const wanted = new Set(identities);
          return Effect.succeed(
            (config.paragraphs ?? []).flatMap((paragraph): readonly ScoredParagraphRow[] => {
              const refCode = Option.getOrElse(
                paragraph.refcode_short,
                () => paragraph.refcode_long ?? '',
              );
              const identity = paragraphIdentity(paragraph.bookCode, paragraph.para_id, refCode);
              if (!wanted.has(identity)) return [];
              // A paragraph whose book the fixture never declared is not a row:
              // the live statement joins `books`, so an unjoinable paragraph
              // cannot appear there either.
              const found = Option.fromNullishOr(
                config.books?.find((row) => row.book_code === paragraph.bookCode),
              );
              if (Option.isNone(found)) return [];
              const book = found.value;
              return [
                {
                  bookCode: paragraph.bookCode,
                  bookTitle: book.book_title,
                  bookAuthor: book.book_author,
                  publicationId: book.book_id,
                  rawParaId: paragraph.para_id,
                  para_id: identity,
                  ref_code: refCode,
                  refcode_short: paragraph.refcode_short,
                  nodes: paragraph.nodes,
                  rank: 0,
                },
              ];
            }),
          );
        },
        // Counted off the same matcher, before the cap — the double has to model
        // the *relationship* between `items` and `total`, not just the rows, or a
        // test asserting the pre-cap total would pass here and fail on SQLite.
        countSearchParagraphs: (query, options) =>
          Effect.succeed(testSearchMatches(config, query, options).length),
        /** The locate leg's lookup, as the double models it.
         *
         *  It used to answer `[]` unconditionally, which made §9.3's locate route
         *  untestable against a fixture: the golden set declares two refcode
         *  queries as `route: 'locate'` and neither could ever produce a jump
         *  target, so no test could see the target's link — the shape round-2 B2
         *  found broken. The rules mirror the live statement: match the book by
         *  code prefix, then the tail exactly, as a child paragraph, or (for a
         *  bare code) any row in that book. */
        findByRefcodeShort: (refcodeShort, limit = 5) => {
          const trimmed = refcodeShort.trim();
          const spaceAt = trimmed.indexOf(' ');
          const split = Option.match(
            Option.liftPredicate(spaceAt, (at) => at !== -1),
            {
              onNone: () => ({ head: trimmed, tail: '' }),
              onSome: (at) => ({ head: trimmed.slice(0, at), tail: trimmed.slice(at + 1) }),
            },
          );
          const head = split.head.trim().toLowerCase();
          const tail = split.tail.trim().toLowerCase();
          return Effect.succeed(
            (config.paragraphs ?? [])
              .flatMap((paragraph) => {
                if (!paragraph.bookCode.toLowerCase().startsWith(head)) return [];
                const short = Option.getOrElse(paragraph.refcode_short, () => '').toLowerCase();
                // `LIKE '% <tail>'` and `LIKE '% <tail>.%'` in the live query: the
                // refcode's book prefix is skipped and the remainder is the
                // paragraph address, exactly or as that address's parent.
                const matches =
                  tail === '' || short.endsWith(` ${tail}`) || short.includes(` ${tail}.`);
                if (!matches) return [];
                const book = config.books?.find((row) => row.book_code === paragraph.bookCode);
                if (Predicate.isUndefined(book)) return [];
                return [
                  {
                    ...paragraph,
                    bookCode: paragraph.bookCode,
                    bookTitle: book.book_title,
                    bookId: book.book_id,
                  },
                ];
              })
              .slice(0, limit),
          );
        },
        getMaxPage: (bookId) => {
          const bookCode = config.books?.find((book) => book.book_id === bookId)?.book_code;
          const pages =
            config.paragraphs
              ?.filter((paragraph) => paragraph.bookCode === bookCode)
              .flatMap((paragraph) => {
                const refcode =
                  Option.getOrUndefined(paragraph.refcode_short) ?? paragraph.refcode_long ?? '';
                const match = refcode.match(/\s(\d+)\./);
                if (match?.[1]) return [Number.parseInt(match[1], 10)];
                return [];
              }) ?? [];
          return Effect.succeed(Math.max(0, ...pages));
        },
        getPageNumbers: (bookId) => {
          const bookCode = config.books?.find((book) => book.book_id === bookId)?.book_code;
          const pages = new Set(
            config.paragraphs
              ?.filter((paragraph) => paragraph.bookCode === bookCode)
              .flatMap((paragraph) => {
                const refcode =
                  Option.getOrUndefined(paragraph.refcode_short) ?? paragraph.refcode_long ?? '';
                const match = refcode.match(/\s(\d+)\./);
                if (match?.[1]) return [Number.parseInt(match[1], 10)];
                return [];
              }) ?? [],
          );
          return Effect.succeed([...pages].sort((left, right) => left - right));
        },
        storeBibleRef: () => Effect.void,
        storeBibleRefsBatch: (refs) => Effect.succeed(refs.length),
        getBibleRefsByBook: (bookId) =>
          Effect.succeed(config.bibleRefs?.filter((row) => row.para_book_id === bookId) ?? []),
        getParagraphsByBibleRef: (bibleBook, bibleChapter, bibleVerse) => {
          const matchingRefs =
            config.bibleRefs?.filter(
              (row) =>
                row.bible_book === bibleBook &&
                row.bible_chapter === bibleChapter &&
                (Predicate.isUndefined(bibleVerse) || row.bible_verse === bibleVerse),
            ) ?? [];
          return Effect.succeed(
            matchingRefs.flatMap((reference) => {
              const book = config.books?.find(
                (candidate) => candidate.book_id === reference.para_book_id,
              );
              const paragraph = config.paragraphs?.find(
                (candidate) =>
                  candidate.bookCode === book?.book_code &&
                  (Option.getOrUndefined(candidate.refcode_short) === reference.para_ref_code ||
                    candidate.refcode_long === reference.para_ref_code),
              );
              if (Predicate.isUndefined(book) || Predicate.isUndefined(paragraph)) return [];
              return [
                {
                  ...paragraph,
                  bookId: book.book_id,
                  bookCode: book.book_code,
                  bookTitle: book.book_title,
                  bookAuthor: book.book_author,
                },
              ];
            }),
          );
        },
        getBibleVersesWithCommentary: () => Effect.succeed([]),
        setSyncStatus: () => Effect.void,
        getSyncStatus: (bookId) =>
          Effect.succeed(
            Option.fromNullishOr(config.syncStatuses?.find((row) => row.book_id === bookId)),
          ),
        getBooksByStatus: (status) =>
          Effect.succeed(config.syncStatuses?.filter((row) => row.status === status) ?? []),
        getAllSyncStatus: Effect.succeed(config.syncStatuses ?? []),
        needsSync: (bookId, expected) =>
          Effect.succeed(config.needsSync?.(bookId, expected) ?? true),
        rebuildFtsIndex: Effect.void,
        backfillBibleRefs: () => Effect.succeed({ scanned: 0, inserted: 0 }),
      }),
    );
}
