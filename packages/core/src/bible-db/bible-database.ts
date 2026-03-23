// @effect-diagnostics strictBooleanExpressions:off
/**
 * Bible Database Service
 *
 * Provides access to Bible data stored in SQLite:
 * - Bible verses (multi-version support)
 * - Cross-references
 * - Strong's concordance
 * - Verse-word mappings
 * - Margin notes
 *
 * The database is created by the sync:bible script from JSON sources.
 * Default location: packages/core/data/bible.db (repo source of truth)
 */

import type { PlatformError } from 'effect/PlatformError';
import { Database } from 'bun:sqlite';
import { Config, ServiceMap, Effect, FileSystem, Layer, Option, Path, Schema } from 'effect';

import {
  DatabaseConnectionError,
  DatabaseQueryError,
  RecordNotFoundError,
} from '../errors/index.js';

export type BibleDatabaseError = DatabaseConnectionError | DatabaseQueryError | RecordNotFoundError;

// ============================================================================
// Schema Types
// ============================================================================

export const BookRow = Schema.Struct({
  number: Schema.Number,
  name: Schema.String,
  abbreviation: Schema.String,
  testament: Schema.Literals(['old', 'new']),
  chapters: Schema.Number,
});
export type BookRow = Schema.Schema.Type<typeof BookRow>;

export const VersionRow = Schema.Struct({
  code: Schema.String,
  name: Schema.String,
  language: Schema.String,
  year: Schema.NullOr(Schema.String),
  copyright: Schema.NullOr(Schema.String),
  is_default: Schema.Number,
});
export type VersionRow = Schema.Schema.Type<typeof VersionRow>;

export const VerseRow = Schema.Struct({
  book: Schema.Number,
  chapter: Schema.Number,
  verse: Schema.Number,
  version_code: Schema.String,
  text: Schema.String,
});
export type VerseRow = Schema.Schema.Type<typeof VerseRow>;

export const CrossRefRow = Schema.Struct({
  book: Schema.Number,
  chapter: Schema.Number,
  verse: Schema.Number,
  ref_book: Schema.Number,
  ref_chapter: Schema.Number,
  ref_verse: Schema.NullOr(Schema.Number),
  ref_verse_end: Schema.NullOr(Schema.Number),
  source: Schema.Literals(['openbible', 'tske']),
  preview_text: Schema.NullOr(Schema.String),
});
export type CrossRefRow = Schema.Schema.Type<typeof CrossRefRow>;

export const StrongsRow = Schema.Struct({
  number: Schema.String,
  language: Schema.Literals(['hebrew', 'greek']),
  lemma: Schema.String,
  transliteration: Schema.NullOr(Schema.String),
  pronunciation: Schema.NullOr(Schema.String),
  definition: Schema.String,
  kjv_definition: Schema.NullOr(Schema.String),
});
export type StrongsRow = Schema.Schema.Type<typeof StrongsRow>;

export const VerseWordRow = Schema.Struct({
  book: Schema.Number,
  chapter: Schema.Number,
  verse: Schema.Number,
  word_index: Schema.Number,
  word_text: Schema.String,
  strongs_numbers: Schema.NullOr(Schema.String), // JSON array
});
export type VerseWordRow = Schema.Schema.Type<typeof VerseWordRow>;

export const StrongsVerseRow = Schema.Struct({
  strongs_number: Schema.String,
  book: Schema.Number,
  chapter: Schema.Number,
  verse: Schema.Number,
  word_text: Schema.NullOr(Schema.String),
  word_index: Schema.NullOr(Schema.Number),
});
export type StrongsVerseRow = Schema.Schema.Type<typeof StrongsVerseRow>;

export const MarginNoteRow = Schema.Struct({
  book: Schema.Number,
  chapter: Schema.Number,
  verse: Schema.Number,
  note_index: Schema.Number,
  note_type: Schema.Literals(['hebrew', 'greek', 'alternate', 'name', 'other']),
  phrase: Schema.String,
  note_text: Schema.String,
});
export type MarginNoteRow = Schema.Schema.Type<typeof MarginNoteRow>;

// ============================================================================
// API Types (for external consumption)
// ============================================================================

export interface BibleBook {
  number: number;
  name: string;
  abbreviation: string;
  testament: 'old' | 'new';
  chapters: number;
}

export interface BibleVerse {
  book: number;
  chapter: number;
  verse: number;
  text: string;
  versionCode: string;
}

export interface CrossReference {
  book: number;
  chapter: number;
  verse: number | null;
  verseEnd: number | null;
  source: 'openbible' | 'tske';
  previewText: string | null;
}

export interface StrongsEntry {
  number: string;
  language: 'hebrew' | 'greek';
  lemma: string;
  transliteration: string | null;
  pronunciation: string | null;
  definition: string;
  kjvDefinition: string | null;
}

export interface VerseWord {
  text: string;
  strongsNumbers: string[] | null;
}

export interface MarginNote {
  type: 'hebrew' | 'greek' | 'alternate' | 'name' | 'other';
  phrase: string;
  text: string;
}

export interface ConcordanceResult {
  book: number;
  chapter: number;
  verse: number;
  word: string | null;
}

export interface VerseSearchResult {
  book: number;
  chapter: number;
  verse: number;
  text: string;
  versionCode: string;
}

// ============================================================================
// Service Interface
// ============================================================================

/**
 * Bible Database service interface.
 * Provides access to Bible data stored in SQLite.
 */
export interface BibleDatabaseService {
  // Book operations
  readonly getBooks: () => Effect.Effect<readonly BibleBook[], BibleDatabaseError>;
  readonly getBook: (
    bookNum: number,
  ) => Effect.Effect<Option.Option<BibleBook>, BibleDatabaseError>;

  // Verse operations
  readonly getChapter: (
    book: number,
    chapter: number,
    versionCode?: string,
  ) => Effect.Effect<readonly BibleVerse[], BibleDatabaseError>;
  readonly getVerse: (
    book: number,
    chapter: number,
    verse: number,
    versionCode?: string,
  ) => Effect.Effect<Option.Option<BibleVerse>, BibleDatabaseError>;
  readonly searchVerses: (
    query: string,
    limit?: number,
    versionCode?: string,
  ) => Effect.Effect<readonly VerseSearchResult[], BibleDatabaseError>;

  // Cross-reference operations
  readonly getCrossRefs: (
    book: number,
    chapter: number,
    verse: number,
  ) => Effect.Effect<readonly CrossReference[], BibleDatabaseError>;

  // Strong's operations
  readonly getStrongsEntry: (
    number: string,
  ) => Effect.Effect<Option.Option<StrongsEntry>, BibleDatabaseError>;
  readonly searchStrongs: (
    query: string,
    limit?: number,
  ) => Effect.Effect<readonly StrongsEntry[], BibleDatabaseError>;
  readonly getVersesWithStrongs: (
    strongsNumber: string,
  ) => Effect.Effect<readonly ConcordanceResult[], BibleDatabaseError>;
  readonly getStrongsCount: (strongsNumber: string) => Effect.Effect<number, BibleDatabaseError>;

  // Verse word operations
  readonly getVerseWords: (
    book: number,
    chapter: number,
    verse: number,
  ) => Effect.Effect<readonly VerseWord[], BibleDatabaseError>;
  readonly hasStrongsMapping: (
    book: number,
    chapter: number,
    verse: number,
  ) => Effect.Effect<boolean, BibleDatabaseError>;

  // Margin notes operations
  readonly getMarginNotes: (
    book: number,
    chapter: number,
    verse: number,
  ) => Effect.Effect<readonly MarginNote[], BibleDatabaseError>;
}

// ============================================================================
// Service Definition
// ============================================================================

export class BibleDatabase extends ServiceMap.Service<BibleDatabase, BibleDatabaseService>()(
  '@bible/core/bible-db/bible-database/BibleDatabase',
) {
  /**
   * Live implementation using SQLite database.
   * Requires FileSystem and Path from @effect/platform.
   */
  static Live: Layer.Layer<
    BibleDatabase,
    DatabaseConnectionError | RecordNotFoundError | Config.ConfigError | PlatformError,
    FileSystem.FileSystem | Path.Path
  > = Layer.effect(
    BibleDatabase,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;

      // Determine database path
      // Priority: env var > ~/.bible/bible.db
      const homeDir = process.env.HOME ?? process.env.USERPROFILE ?? '.';
      const defaultDbPath = path.join(homeDir, '.bible', 'bible.db');

      const dbPath = yield* Config.string('BIBLE_DB_PATH').pipe(Config.withDefault(defaultDbPath));

      // Check if database exists
      const exists = yield* fs.exists(dbPath);
      if (!exists) {
        return yield* new RecordNotFoundError({
          entity: 'BibleDatabase',
          id: dbPath,
          context: {
            message: `Bible database not found at ${dbPath}. Run 'bun run sync:bible' to create it.`,
          },
        });
      }

      // Open database connection
      const db = yield* Effect.try({
        try: () => new Database(dbPath, { readonly: true }),
        catch: (error) =>
          new DatabaseConnectionError({
            message: `Failed to open database at ${dbPath}`,
            cause: error,
            database: dbPath,
          }),
      });

      // ========================================================================
      // Book Operations
      // ========================================================================

      const getBooks = (): Effect.Effect<readonly BibleBook[], BibleDatabaseError> =>
        Effect.try({
          try: () => {
            const rows = db.query<BookRow, []>('SELECT * FROM books ORDER BY number').all();
            return rows.map((r) => ({
              number: r.number,
              name: r.name,
              abbreviation: r.abbreviation,
              testament: r.testament,
              chapters: r.chapters,
            }));
          },
          catch: (error) => new DatabaseQueryError({ operation: 'getBooks', cause: error }),
        });

      const getBook = (
        bookNum: number,
      ): Effect.Effect<Option.Option<BibleBook>, BibleDatabaseError> =>
        Effect.try({
          try: () => {
            const row = db
              .query<BookRow, [number]>('SELECT * FROM books WHERE number = ?')
              .get(bookNum);
            return row
              ? Option.some({
                  number: row.number,
                  name: row.name,
                  abbreviation: row.abbreviation,
                  testament: row.testament,
                  chapters: row.chapters,
                })
              : Option.none();
          },
          catch: (error) => new DatabaseQueryError({ operation: 'getBook', cause: error }),
        });

      // ========================================================================
      // Verse Operations
      // ========================================================================

      const getChapter = (
        book: number,
        chapter: number,
        versionCode = 'KJV',
      ): Effect.Effect<readonly BibleVerse[], BibleDatabaseError> =>
        Effect.try({
          try: () => {
            const rows = db
              .query<VerseRow, [string, number, number]>(
                `SELECT * FROM verses
                 WHERE version_code = ? AND book = ? AND chapter = ?
                 ORDER BY verse`,
              )
              .all(versionCode, book, chapter);
            return rows.map((r) => ({
              book: r.book,
              chapter: r.chapter,
              verse: r.verse,
              text: r.text,
              versionCode: r.version_code,
            }));
          },
          catch: (error) => new DatabaseQueryError({ operation: 'getChapter', cause: error }),
        });

      const getVerse = (
        book: number,
        chapter: number,
        verse: number,
        versionCode = 'KJV',
      ): Effect.Effect<Option.Option<BibleVerse>, BibleDatabaseError> =>
        Effect.try({
          try: () => {
            const row = db
              .query<VerseRow, [string, number, number, number]>(
                `SELECT * FROM verses
                 WHERE version_code = ? AND book = ? AND chapter = ? AND verse = ?`,
              )
              .get(versionCode, book, chapter, verse);
            return row
              ? Option.some({
                  book: row.book,
                  chapter: row.chapter,
                  verse: row.verse,
                  text: row.text,
                  versionCode: row.version_code,
                })
              : Option.none();
          },
          catch: (error) => new DatabaseQueryError({ operation: 'getVerse', cause: error }),
        });

      const searchVerses = (
        query: string,
        limit = 50,
        versionCode = 'KJV',
      ): Effect.Effect<readonly VerseSearchResult[], BibleDatabaseError> =>
        Effect.try({
          try: () => {
            const escapedQuery = query.replace(/['"*]/g, '');
            if (!escapedQuery.trim()) return [];

            const rows = db
              .query<VerseRow, [string, string, number]>(
                `SELECT v.*
                 FROM verses v
                 JOIN verses_fts fts ON v.rowid = fts.rowid
                 WHERE verses_fts MATCH ? AND v.version_code = ?
                 LIMIT ?`,
              )
              .all(`"${escapedQuery}"`, versionCode, limit);

            return rows.map((r) => ({
              book: r.book,
              chapter: r.chapter,
              verse: r.verse,
              text: r.text,
              versionCode: r.version_code,
            }));
          },
          catch: (error) =>
            new DatabaseQueryError({
              operation: 'searchVerses',
              cause: error,
            }),
        });

      // ========================================================================
      // Cross-Reference Operations
      // ========================================================================

      const getCrossRefs = (
        book: number,
        chapter: number,
        verse: number,
      ): Effect.Effect<readonly CrossReference[], BibleDatabaseError> =>
        Effect.try({
          try: () => {
            const rows = db
              .query<CrossRefRow, [number, number, number]>(
                `SELECT ref_book, ref_chapter, ref_verse, ref_verse_end, source, preview_text
                 FROM cross_refs
                 WHERE book = ? AND chapter = ? AND verse = ?`,
              )
              .all(book, chapter, verse);

            return rows.map((r) => ({
              book: r.ref_book,
              chapter: r.ref_chapter,
              verse: r.ref_verse,
              verseEnd: r.ref_verse_end,
              source: r.source,
              previewText: r.preview_text,
            }));
          },
          catch: (error) =>
            new DatabaseQueryError({
              operation: 'getCrossRefs',
              cause: error,
            }),
        });

      // ========================================================================
      // Strong's Operations
      // ========================================================================

      const getStrongsEntry = (
        number: string,
      ): Effect.Effect<Option.Option<StrongsEntry>, BibleDatabaseError> =>
        Effect.try({
          try: () => {
            const row = db
              .query<StrongsRow, [string]>('SELECT * FROM strongs WHERE number = ?')
              .get(number.toUpperCase());

            return row
              ? Option.some({
                  number: row.number,
                  language: row.language,
                  lemma: row.lemma,
                  transliteration: row.transliteration,
                  pronunciation: row.pronunciation,
                  definition: row.definition,
                  kjvDefinition: row.kjv_definition,
                })
              : Option.none();
          },
          catch: (error) =>
            new DatabaseQueryError({
              operation: 'getStrongsEntry',
              cause: error,
            }),
        });

      const searchStrongs = (
        query: string,
        limit = 50,
      ): Effect.Effect<readonly StrongsEntry[], BibleDatabaseError> =>
        Effect.try({
          try: () => {
            const escapedQuery = query.replace(/['"*]/g, '');
            if (!escapedQuery.trim()) return [];

            const rows = db
              .query<StrongsRow, [string, number]>(
                `SELECT s.*
                 FROM strongs s
                 JOIN strongs_fts fts ON s.rowid = fts.rowid
                 WHERE strongs_fts MATCH ?
                 LIMIT ?`,
              )
              .all(`"${escapedQuery}"`, limit);

            return rows.map((r) => ({
              number: r.number,
              language: r.language,
              lemma: r.lemma,
              transliteration: r.transliteration,
              pronunciation: r.pronunciation,
              definition: r.definition,
              kjvDefinition: r.kjv_definition,
            }));
          },
          catch: (error) =>
            new DatabaseQueryError({
              operation: 'searchStrongs',
              cause: error,
            }),
        });

      const getVersesWithStrongs = (
        strongsNumber: string,
      ): Effect.Effect<readonly ConcordanceResult[], BibleDatabaseError> =>
        Effect.try({
          try: () => {
            const rows = db
              .query<StrongsVerseRow, [string]>(
                `SELECT DISTINCT book, chapter, verse, word_text
                 FROM strongs_verses
                 WHERE strongs_number = ?
                 ORDER BY book, chapter, verse`,
              )
              .all(strongsNumber.toUpperCase());

            return rows.map((r) => ({
              book: r.book,
              chapter: r.chapter,
              verse: r.verse,
              word: r.word_text,
            }));
          },
          catch: (error) =>
            new DatabaseQueryError({
              operation: 'getVersesWithStrongs',
              cause: error,
            }),
        });

      const getStrongsCount = (strongsNumber: string): Effect.Effect<number, BibleDatabaseError> =>
        Effect.try({
          try: () => {
            const row = db
              .query<{ count: number }, [string]>(
                `SELECT COUNT(DISTINCT book || '.' || chapter || '.' || verse) as count
                 FROM strongs_verses
                 WHERE strongs_number = ?`,
              )
              .get(strongsNumber.toUpperCase());
            return row?.count ?? 0;
          },
          catch: (error) =>
            new DatabaseQueryError({
              operation: 'getStrongsCount',
              cause: error,
            }),
        });

      // ========================================================================
      // Verse Word Operations
      // ========================================================================

      const getVerseWords = (
        book: number,
        chapter: number,
        verse: number,
      ): Effect.Effect<readonly VerseWord[], BibleDatabaseError> =>
        Effect.try({
          try: () => {
            const rows = db
              .query<VerseWordRow, [number, number, number]>(
                `SELECT word_text, strongs_numbers
                 FROM verse_words
                 WHERE book = ? AND chapter = ? AND verse = ?
                 ORDER BY word_index`,
              )
              .all(book, chapter, verse);

            return rows.map((r) => ({
              text: r.word_text,
              strongsNumbers: r.strongs_numbers
                ? (JSON.parse(r.strongs_numbers) as string[])
                : null,
            }));
          },
          catch: (error) =>
            new DatabaseQueryError({
              operation: 'getVerseWords',
              cause: error,
            }),
        });

      const hasStrongsMapping = (
        book: number,
        chapter: number,
        verse: number,
      ): Effect.Effect<boolean, BibleDatabaseError> =>
        Effect.try({
          try: () => {
            const row = db
              .query<{ count: number }, [number, number, number]>(
                `SELECT COUNT(*) as count
                 FROM verse_words
                 WHERE book = ? AND chapter = ? AND verse = ?`,
              )
              .get(book, chapter, verse);
            return (row?.count ?? 0) > 0;
          },
          catch: (error) =>
            new DatabaseQueryError({
              operation: 'hasStrongsMapping',
              cause: error,
            }),
        });

      // ========================================================================
      // Margin Notes Operations
      // ========================================================================

      const getMarginNotes = (
        book: number,
        chapter: number,
        verse: number,
      ): Effect.Effect<readonly MarginNote[], BibleDatabaseError> =>
        Effect.try({
          try: () => {
            const rows = db
              .query<MarginNoteRow, [number, number, number]>(
                `SELECT note_type, phrase, note_text
                 FROM margin_notes
                 WHERE book = ? AND chapter = ? AND verse = ?
                 ORDER BY note_index`,
              )
              .all(book, chapter, verse);

            return rows.map((r) => ({
              type: r.note_type,
              phrase: r.phrase,
              text: r.note_text,
            }));
          },
          catch: (error) =>
            new DatabaseQueryError({
              operation: 'getMarginNotes',
              cause: error,
            }),
        });

      // Cleanup: close database when scope ends
      yield* Effect.addFinalizer(() =>
        Effect.try({
          try: () => db.close(false),
          catch: (error) =>
            new DatabaseConnectionError({
              message: 'Failed to close database',
              cause: error,
            }),
        }).pipe(Effect.ignore),
      );

      return {
        // Book operations
        getBooks,
        getBook,
        // Verse operations
        getChapter,
        getVerse,
        searchVerses,
        // Cross-reference operations
        getCrossRefs,
        // Strong's operations
        getStrongsEntry,
        searchStrongs,
        getVersesWithStrongs,
        getStrongsCount,
        // Verse word operations
        getVerseWords,
        hasStrongsMapping,
        // Margin notes operations
        getMarginNotes,
      };
    }),
  );

  /**
   * Default layer - alias for Live (backwards compatibility).
   */
  static Default = BibleDatabase.Live;

  /**
   * Test implementation with configurable mock data.
   * Useful for unit testing without a real database.
   */
  static Test = (
    config: {
      books?: readonly BibleBook[];
      verses?: readonly BibleVerse[];
      crossRefs?: readonly CrossReference[];
      strongsEntries?: readonly StrongsEntry[];
    } = {},
  ): Layer.Layer<BibleDatabase> =>
    Layer.succeed(BibleDatabase, {
      getBooks: () => Effect.succeed(config.books ?? []),
      getBook: (bookNum) =>
        Effect.succeed(Option.fromNullishOr(config.books?.find((b) => b.number === bookNum))),
      getChapter: (book, chapter, _versionCode) =>
        Effect.succeed(
          config.verses?.filter((v) => v.book === book && v.chapter === chapter) ?? [],
        ),
      getVerse: (book, chapter, verse, _versionCode) =>
        Effect.succeed(
          Option.fromNullishOr(
            config.verses?.find(
              (v) => v.book === book && v.chapter === chapter && v.verse === verse,
            ),
          ),
        ),
      searchVerses: (_query, _limit, _versionCode) => Effect.succeed([]),
      getCrossRefs: (book, chapter, verse) =>
        Effect.succeed(
          config.crossRefs?.filter(
            (r) => r.book === book && r.chapter === chapter && r.verse === verse,
          ) ?? [],
        ),
      getStrongsEntry: (number) =>
        Effect.succeed(
          Option.fromNullishOr(config.strongsEntries?.find((e) => e.number === number)),
        ),
      searchStrongs: (_query, _limit) => Effect.succeed([]),
      getVersesWithStrongs: (_strongsNumber) => Effect.succeed([]),
      getStrongsCount: (_strongsNumber) => Effect.succeed(0),
      getVerseWords: (_book, _chapter, _verse) => Effect.succeed([]),
      hasStrongsMapping: (_book, _chapter, _verse) => Effect.succeed(false),
      getMarginNotes: (_book, _chapter, _verse) => Effect.succeed([]),
    });
}
