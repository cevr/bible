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

/** The paragraphs the in-memory double's search matches, before any cap.
 *
 *  Module-level so `searchParagraphs` and `countSearchParagraphs` share it the
 *  way the live implementations share `searchFilters`. A double whose count and
 *  rows were filtered by two hand-written copies of the same three conditions
 *  would let a `total` bug pass in tests and appear only against SQLite. */
const testSearchMatches = (
  config: {
    readonly books?: readonly BookRow[];
    readonly paragraphs?: readonly (EGWSchemas.Paragraph & { bookCode: string })[];
  },
  options?: { readonly bookCode?: string; readonly scope?: CorpusScope },
) =>
  (config.paragraphs ?? [])
    .flatMap((paragraph) => {
      const book = config.books?.find((candidate) => candidate.book_code === paragraph.bookCode);
      if (Predicate.isUndefined(book)) return [];
      return [{ ...paragraph, bookId: book.book_id, bookTitle: book.book_title, book }];
    })
    .filter((row) => {
      const bookCode = options?.bookCode;
      if (Predicate.isNotUndefined(bookCode) && row.bookCode !== bookCode) return false;
      const isEgw = EGW_SCOPE_AUTHORS.includes(row.book.book_author);
      if (options?.scope === 'egw') return isEgw;
      if (options?.scope === 'pioneer') return !isEgw;
      return true;
    });

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

      return {
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
      };
    }),
  );

  /**
   * Test implementation with in-memory data.
   */
  static Test = (
    config: {
      books?: readonly BookRow[];
      paragraphs?: readonly (EGWSchemas.Paragraph & { bookCode: string })[];
      bibleRefs?: readonly BibleRefRow[];
      syncStatuses?: readonly SyncStatusRow[];
      installPublicationArchive?: (
        archive: PublicationArchive,
        provenance?: CorpusProvenance,
      ) => number;
      needsSync?: (bookId: number, expected?: CorpusProvenance) => boolean;
    } = {},
  ): Layer.Layer<EGWParagraphDatabase> =>
    Layer.succeed(EGWParagraphDatabase, {
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
          config.books?.filter((book) => book.book_code.toLowerCase() === bookCode.toLowerCase()) ??
            [],
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
      searchParagraphs: (_query, options) =>
        Effect.succeed(
          testSearchMatches(config, options)
            .slice(0, options?.limit)
            .map(({ book: _book, ...row }) => row),
        ),
      // Counted off the same matcher, before the cap — the double has to model
      // the *relationship* between `items` and `total`, not just the rows, or a
      // test asserting the pre-cap total would pass here and fail on SQLite.
      countSearchParagraphs: (_query, options) =>
        Effect.succeed(testSearchMatches(config, options).length),
      findByRefcodeShort: () => Effect.succeed([]),
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
      needsSync: (bookId, expected) => Effect.succeed(config.needsSync?.(bookId, expected) ?? true),
      rebuildFtsIndex: Effect.void,
      backfillBibleRefs: () => Effect.succeed({ scanned: 0, inserted: 0 }),
    });
}
