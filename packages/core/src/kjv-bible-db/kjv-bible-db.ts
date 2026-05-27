/**
 * KJV Bible Database Service using Effect SQL
 *
 * Stores the King James Version Bible text together with per-word Strong's
 * tagging (when available) in one table, and the Hebrew/Greek Strong's
 * lexicon in a second table. Depends only on `SqlClient.SqlClient` so any
 * SQLite driver layer (sqlite-bun, sqlite-node) can satisfy it.
 *
 * Schema:
 * - kjv_verses: one row per verse, with optional embedded Strong's word JSON
 * - strongs_lexicon: Hebrew/Greek code -> lemma / transliteration / definition
 *
 * The Strong's "parallel" dataset only covers ~70% of KJV verses, so the
 * strongs_words column is nullable rather than a separate join table — the
 * single-table read is one less query at chapter-render time.
 */

import { Context, Effect, Layer, Option, Schema } from 'effect';
import * as SqlClient from 'effect/unstable/sql/SqlClient';
import type { SqlError } from 'effect/unstable/sql/SqlError';

// Bump when the on-disk shape changes. Init drops and rebuilds the KJV
// tables on mismatch — the bundled JSON re-imports in seconds, so we don't
// ship migration SQL.
const SCHEMA_VERSION = 1;

// The KJV asset has exactly this many verses. `isImported` treats a row
// count below this as a partial/corrupt import (a previous transaction
// crashed mid-write) and reports unimported so the next launch
// re-runs the bundled import.
const EXPECTED_KJV_VERSE_COUNT = 31102;

// ---------------------------------------------------------------------------
// Asset shapes (input to import)
// ---------------------------------------------------------------------------

export interface KjvAssetVerse {
  readonly book_name: string;
  readonly book: number;
  readonly chapter: number;
  readonly verse: number;
  readonly text: string;
}

export interface KjvAssetFile {
  readonly verses: readonly KjvAssetVerse[];
}

export interface StrongsWord {
  readonly text: string;
  readonly strongs?: readonly string[];
}

export interface StrongsVerseRow {
  readonly book: number;
  readonly chapter: number;
  readonly verse: number;
  readonly words: readonly StrongsWord[];
}

export interface StrongsLexiconRaw {
  readonly lemma: string;
  readonly xlit: string;
  readonly def: string;
}

// ---------------------------------------------------------------------------
// Renderer-facing payloads
// ---------------------------------------------------------------------------

export interface KjvVersePayload {
  readonly book: number;
  readonly chapter: number;
  readonly verse: number;
  readonly book_name: string;
  readonly text: string;
}

export interface KjvChapterPayload {
  readonly book: number;
  readonly chapter: number;
  readonly book_name: string;
  readonly verses: readonly KjvVersePayload[];
}

export interface KjvStrongsVersePayload {
  readonly book: number;
  readonly chapter: number;
  readonly verse: number;
  readonly book_name: string;
  readonly words: readonly StrongsWord[];
}

export interface KjvStrongsChapterPayload {
  readonly book: number;
  readonly chapter: number;
  readonly book_name: string;
  readonly verses: readonly KjvStrongsVersePayload[];
}

export interface StrongsLexiconEntry {
  readonly code: string;
  readonly language: 'hebrew' | 'greek';
  readonly lemma: string;
  readonly transliteration: string;
  readonly definition: string;
}

/** One row in a concordance lookup — the verse text the word appeared in plus
 *  the surface word as tagged (so e.g. searching H776 surfaces `earth`,
 *  `land`, `country` rather than just the lemma). */
export interface StrongsConcordanceHit {
  readonly book: number;
  readonly chapter: number;
  readonly verse: number;
  readonly book_name: string;
  readonly text: string;
  readonly word: string;
}

// ---------------------------------------------------------------------------
// Row schemas
// ---------------------------------------------------------------------------

const KjvVerseRow = Schema.Struct({
  book: Schema.Number,
  chapter: Schema.Number,
  verse: Schema.Number,
  book_name: Schema.String,
  text: Schema.String,
  strongs_words: Schema.NullOr(Schema.String),
});
type KjvVerseRow = Schema.Schema.Type<typeof KjvVerseRow>;

const LexiconRow = Schema.Struct({
  code: Schema.String,
  language: Schema.String,
  lemma: Schema.String,
  transliteration: Schema.String,
  definition: Schema.String,
});
type LexiconRow = Schema.Schema.Type<typeof LexiconRow>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const parseWords = (json: string): readonly StrongsWord[] => {
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as readonly StrongsWord[]) : [];
  } catch {
    return [];
  }
};

const languageOf = (code: string): 'hebrew' | 'greek' | null => {
  const prefix = code.charAt(0);
  if (prefix === 'H') return 'hebrew';
  if (prefix === 'G') return 'greek';
  return null;
};

// ---------------------------------------------------------------------------
// Service interface
// ---------------------------------------------------------------------------

export interface KjvBibleDatabaseService {
  /**
   * Imports the bundled KJV verses and (subset) Strong's word tags. Idempotent
   * via PK upsert; safe to call on every launch. Returns the number of verses
   * written and the number that received Strong's tagging.
   */
  readonly importKjv: (
    kjv: KjvAssetFile,
    strongs: readonly StrongsVerseRow[],
  ) => Effect.Effect<{ readonly verses: number; readonly withStrongs: number }, SqlError>;

  /**
   * Imports the Hebrew/Greek Strong's lexicon. Entries without H/G prefix
   * (e.g. "G0" stubs) are skipped. Idempotent via PK upsert.
   */
  readonly importStrongsLexicon: (
    lex: Record<string, StrongsLexiconRaw>,
  ) => Effect.Effect<{ readonly imported: number; readonly skipped: number }, SqlError>;

  /**
   * Returns `Option.none()` when the chapter has no verses (invalid book or
   * chapter). The book name is taken from the first verse — KJV doesn't have
   * chapter-level metadata so we don't synthesize any.
   */
  readonly getChapter: (
    book: number,
    chapter: number,
  ) => Effect.Effect<Option.Option<KjvChapterPayload>, SqlError>;

  /**
   * Returns only the verses in the requested chapter that have Strong's
   * tagging. `Option.none()` when zero verses in the chapter have tags.
   */
  readonly getChapterStrongs: (
    book: number,
    chapter: number,
  ) => Effect.Effect<Option.Option<KjvStrongsChapterPayload>, SqlError>;

  readonly strongsLookup: (
    code: string,
  ) => Effect.Effect<Option.Option<StrongsLexiconEntry>, SqlError>;

  /**
   * Returns every verse where any tagged word carries the given Strong's
   * `code`. Walks `strongs_words IS NOT NULL` rows and JSON-filters in
   * memory — at ~17k tagged rows the cost is small enough that the side
   * lookup table is not yet worth the schema cost. `limit` caps the result
   * set for UI display; pass `null` to return all matches.
   */
  readonly searchVersesByStrongs: (
    code: string,
    limit: number | null,
  ) => Effect.Effect<readonly StrongsConcordanceHit[], SqlError>;

  /**
   * Counts distinct verses tagged with `code`. Independent of `limit` — the
   * UI shows the true total even when only the first N hits render.
   */
  readonly countStrongsOccurrences: (code: string) => Effect.Effect<number, SqlError>;

  /**
   * Substring search over the lexicon's lemma, transliteration, and definition
   * columns. Case-insensitive via `LIKE` with `COLLATE NOCASE`. `limit` caps
   * the result count.
   */
  readonly searchLexicon: (
    query: string,
    limit: number,
  ) => Effect.Effect<readonly StrongsLexiconEntry[], SqlError>;

  /**
   * `true` when both tables already contain rows. Used by main to skip the
   * (cheap but non-zero) JSON read + parse + transaction on subsequent
   * launches.
   */
  readonly isImported: () => Effect.Effect<boolean, SqlError>;

  /**
   * Drops and recreates `kjv_verses` and `strongs_lexicon`. Used by the
   * renderer's "Reimport KJV" recovery flow when a previous import left the
   * tables in a partial/empty state. Caller is expected to follow this with
   * `importKjv` + `importStrongsLexicon` to repopulate from the bundled
   * assets.
   */
  readonly resetTables: () => Effect.Effect<void, SqlError>;
}

// ---------------------------------------------------------------------------
// Service definition
// ---------------------------------------------------------------------------

export class KjvBibleDatabase extends Context.Service<KjvBibleDatabase, KjvBibleDatabaseService>()(
  '@bible/core/kjv-bible-db/KjvBibleDatabase',
) {
  /**
   * Driver-agnostic layer. Initializes the schema (idempotent) and exposes
   * import + query operations. Compose with a SQLite driver layer
   * (sqlite-bun, sqlite-node) via `Layer.provide`.
   */
  static layerCore: Layer.Layer<KjvBibleDatabase, SqlError, SqlClient.SqlClient> = Layer.effect(
    KjvBibleDatabase,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      const createSchema = Effect.gen(function* () {
        yield* sql.unsafe(`
          CREATE TABLE IF NOT EXISTS kjv_verses (
            book INTEGER NOT NULL,
            chapter INTEGER NOT NULL,
            verse INTEGER NOT NULL,
            book_name TEXT NOT NULL,
            text TEXT NOT NULL,
            strongs_words TEXT,
            PRIMARY KEY (book, chapter, verse)
          )
        `);
        yield* sql.unsafe(
          `CREATE INDEX IF NOT EXISTS kjv_verses_chapter ON kjv_verses(book, chapter)`,
        );
        yield* sql.unsafe(`
          CREATE TABLE IF NOT EXISTS strongs_lexicon (
            code TEXT PRIMARY KEY,
            language TEXT NOT NULL CHECK (language IN ('hebrew', 'greek')),
            lemma TEXT NOT NULL,
            transliteration TEXT NOT NULL,
            definition TEXT NOT NULL
          )
        `);
        // PRAGMA can't be bound — interpolate the integer literal directly.
        yield* sql.unsafe(`PRAGMA user_version = ${SCHEMA_VERSION}`);
      });

      // Schema version: on mismatch drop and recreate. The bundled JSON
      // re-imports in seconds so we don't ship migration SQL — the next
      // ensureImported() call repopulates from assets.
      const versionRows = yield* sql.unsafe<{ user_version: number }>(`PRAGMA user_version`);
      const currentVersion = versionRows[0]?.user_version ?? 0;
      if (currentVersion !== 0 && currentVersion !== SCHEMA_VERSION) {
        yield* sql.unsafe(`DROP TABLE IF EXISTS kjv_verses`);
        yield* sql.unsafe(`DROP TABLE IF EXISTS strongs_lexicon`);
      }

      yield* createSchema;

      const importKjv = (kjv: KjvAssetFile, strongs: readonly StrongsVerseRow[]) =>
        sql.withTransaction(
          Effect.gen(function* () {
            // Build a (book,chapter,verse) -> words map once so the verse
            // loop is one Map.get per row, not a linear scan.
            const strongsByKey = new Map<string, readonly StrongsWord[]>();
            for (const v of strongs) {
              strongsByKey.set(`${v.book}:${v.chapter}:${v.verse}`, v.words);
            }
            let withStrongs = 0;
            for (const v of kjv.verses) {
              const words = strongsByKey.get(`${v.book}:${v.chapter}:${v.verse}`);
              const wordsJson = words === undefined ? null : JSON.stringify(words);
              if (wordsJson !== null) withStrongs += 1;
              yield* sql`
                INSERT INTO kjv_verses (book, chapter, verse, book_name, text, strongs_words)
                VALUES (${v.book}, ${v.chapter}, ${v.verse}, ${v.book_name}, ${v.text}, ${wordsJson})
                ON CONFLICT(book, chapter, verse) DO UPDATE SET
                  book_name = excluded.book_name,
                  text = excluded.text,
                  strongs_words = excluded.strongs_words
              `;
            }
            return { verses: kjv.verses.length, withStrongs };
          }),
        );

      const importStrongsLexicon = (lex: Record<string, StrongsLexiconRaw>) =>
        sql.withTransaction(
          Effect.gen(function* () {
            let imported = 0;
            let skipped = 0;
            for (const [code, raw] of Object.entries(lex)) {
              const language = languageOf(code);
              if (language === null) {
                skipped += 1;
                continue;
              }
              yield* sql`
                INSERT INTO strongs_lexicon (code, language, lemma, transliteration, definition)
                VALUES (${code}, ${language}, ${raw.lemma}, ${raw.xlit}, ${raw.def})
                ON CONFLICT(code) DO UPDATE SET
                  language = excluded.language,
                  lemma = excluded.lemma,
                  transliteration = excluded.transliteration,
                  definition = excluded.definition
              `;
              imported += 1;
            }
            return { imported, skipped };
          }),
        );

      const getChapter = (book: number, chapter: number) =>
        sql<KjvVerseRow>`
          SELECT book, chapter, verse, book_name, text, NULL AS strongs_words
          FROM kjv_verses
          WHERE book = ${book} AND chapter = ${chapter}
          ORDER BY verse
        `.pipe(
          Effect.map((rows) => {
            if (rows.length === 0) return Option.none<KjvChapterPayload>();
            const first = rows[0];
            if (first === undefined) return Option.none<KjvChapterPayload>();
            return Option.some<KjvChapterPayload>({
              book,
              chapter,
              book_name: first.book_name,
              verses: rows.map((r) => ({
                book: r.book,
                chapter: r.chapter,
                verse: r.verse,
                book_name: r.book_name,
                text: r.text,
              })),
            });
          }),
        );

      const getChapterStrongs = (book: number, chapter: number) =>
        sql<KjvVerseRow>`
          SELECT book, chapter, verse, book_name, text, strongs_words
          FROM kjv_verses
          WHERE book = ${book} AND chapter = ${chapter} AND strongs_words IS NOT NULL
          ORDER BY verse
        `.pipe(
          Effect.map((rows) => {
            if (rows.length === 0) return Option.none<KjvStrongsChapterPayload>();
            const first = rows[0];
            if (first === undefined) return Option.none<KjvStrongsChapterPayload>();
            return Option.some<KjvStrongsChapterPayload>({
              book,
              chapter,
              book_name: first.book_name,
              verses: rows.map((r) => ({
                book: r.book,
                chapter: r.chapter,
                verse: r.verse,
                book_name: r.book_name,
                words: r.strongs_words === null ? [] : parseWords(r.strongs_words),
              })),
            });
          }),
        );

      const strongsLookup = (code: string) =>
        sql<LexiconRow>`
          SELECT code, language, lemma, transliteration, definition
          FROM strongs_lexicon
          WHERE code = ${code}
        `.pipe(
          Effect.map((rows) => {
            const row = rows[0];
            if (row === undefined) return Option.none<StrongsLexiconEntry>();
            const lang = row.language === 'hebrew' ? 'hebrew' : 'greek';
            return Option.some<StrongsLexiconEntry>({
              code: row.code,
              language: lang,
              lemma: row.lemma,
              transliteration: row.transliteration,
              definition: row.definition,
            });
          }),
        );

      const searchVersesByStrongs = (code: string, limit: number | null) =>
        sql<KjvVerseRow>`
          SELECT book, chapter, verse, book_name, text, strongs_words
          FROM kjv_verses
          WHERE strongs_words IS NOT NULL
            AND strongs_words LIKE ${`%"${code}"%`}
          ORDER BY book, chapter, verse
        `.pipe(
          Effect.map((rows) => {
            const out: StrongsConcordanceHit[] = [];
            for (const row of rows) {
              if (row.strongs_words === null) continue;
              const words = parseWords(row.strongs_words);
              for (const w of words) {
                if (w.strongs?.includes(code) === true) {
                  out.push({
                    book: row.book,
                    chapter: row.chapter,
                    verse: row.verse,
                    book_name: row.book_name,
                    text: row.text,
                    word: w.text,
                  });
                  break;
                }
              }
              if (limit !== null && out.length >= limit) break;
            }
            return out;
          }),
        );

      const countStrongsOccurrences = (code: string) =>
        sql<KjvVerseRow>`
          SELECT book, chapter, verse, book_name, text, strongs_words
          FROM kjv_verses
          WHERE strongs_words IS NOT NULL
            AND strongs_words LIKE ${`%"${code}"%`}
        `.pipe(
          Effect.map((rows) => {
            let count = 0;
            for (const row of rows) {
              if (row.strongs_words === null) continue;
              const words = parseWords(row.strongs_words);
              for (const w of words) {
                if (w.strongs?.includes(code) === true) {
                  count += 1;
                  break;
                }
              }
            }
            return count;
          }),
        );

      const searchLexicon = (query: string, limit: number) => {
        const like = `%${query}%`;
        return sql<LexiconRow>`
          SELECT code, language, lemma, transliteration, definition
          FROM strongs_lexicon
          WHERE lemma LIKE ${like} COLLATE NOCASE
             OR transliteration LIKE ${like} COLLATE NOCASE
             OR definition LIKE ${like} COLLATE NOCASE
          ORDER BY code
          LIMIT ${limit}
        `.pipe(
          Effect.map((rows) =>
            rows.map((row) => ({
              code: row.code,
              language: row.language === 'hebrew' ? ('hebrew' as const) : ('greek' as const),
              lemma: row.lemma,
              transliteration: row.transliteration,
              definition: row.definition,
            })),
          ),
        );
      };

      const isImported = () =>
        Effect.gen(function* () {
          const verseCount = yield* sql<{ n: number }>`SELECT COUNT(*) AS n FROM kjv_verses`;
          // Treat a partial import (e.g. a crashed transaction that left
          // the table populated but incomplete) as not-imported so the
          // next launch re-runs from the bundled asset.
          if ((verseCount[0]?.n ?? 0) < EXPECTED_KJV_VERSE_COUNT) return false;
          const lexCount = yield* sql<{ n: number }>`SELECT COUNT(*) AS n FROM strongs_lexicon`;
          return (lexCount[0]?.n ?? 0) > 0;
        });

      const resetTables = () =>
        Effect.gen(function* () {
          yield* sql.unsafe(`DROP TABLE IF EXISTS kjv_verses`);
          yield* sql.unsafe(`DROP TABLE IF EXISTS strongs_lexicon`);
          yield* createSchema;
        });

      return KjvBibleDatabase.of({
        importKjv,
        importStrongsLexicon,
        getChapter,
        getChapterStrongs,
        strongsLookup,
        searchVersesByStrongs,
        countStrongsOccurrences,
        searchLexicon,
        isImported,
        resetTables,
      });
    }),
  );
}
