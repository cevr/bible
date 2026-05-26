/**
 * Bible Cross-Reference Database Service using Effect SQL
 *
 * Stores the bundled cross-reference catalogs (openbible.info and TSK-extended)
 * in one table, keyed by source verse + ordered by source. Both catalogs share
 * the JSON shape `{ "book.chapter.verse": { refs: [{book, chapter, verse,
 * verseEnd?}, ...] } }` so a single importer covers both.
 *
 * Depends only on `SqlClient.SqlClient` so any SQLite driver layer
 * (sqlite-bun, sqlite-node) can satisfy it.
 *
 * Schema:
 * - cross_refs: one row per (source verse, target reference, source catalog).
 *   `target_verse_end` is nullable — most refs are single verses; ranges carry
 *   the inclusive upper bound.
 */

import { Context, Effect, Layer } from 'effect';
import * as SqlClient from 'effect/unstable/sql/SqlClient';
import type { SqlError } from 'effect/unstable/sql/SqlError';

// Bump when the on-disk shape changes. Init drops and rebuilds the cross-ref
// table on mismatch — the bundled JSON re-imports in seconds, so we don't
// ship migration SQL.
const SCHEMA_VERSION = 1;

// ---------------------------------------------------------------------------
// Asset shapes (input to import)
// ---------------------------------------------------------------------------

export interface XrefTargetRaw {
  readonly book: number;
  readonly chapter: number;
  readonly verse: number;
  readonly verseEnd?: number;
}

export interface XrefCatalogEntry {
  readonly refs: readonly XrefTargetRaw[];
}

/** Top-level shape of cross-refs.json / cross-refs-tske.json. Keyed by
 *  `"book.chapter.verse"` strings. */
export type XrefCatalog = Record<string, XrefCatalogEntry>;

/** Sources we ingest. The renderer surfaces these badges next to each
 *  reference so the user knows which catalog it came from. */
export type XrefSource = 'openbible' | 'tske';

// ---------------------------------------------------------------------------
// Renderer-facing payloads
// ---------------------------------------------------------------------------

export interface CrossRefRow {
  readonly source: XrefSource;
  readonly targetBook: number;
  readonly targetChapter: number;
  readonly targetVerse: number;
  readonly targetVerseEnd: number | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parses `"1.2.3"` → `{book: 1, chapter: 2, verse: 3}` or `null` for any
 *  malformed key (non-integer parts, wrong arity, NaN). Catalog data is
 *  trusted but we don't want a stray garbage key to abort the entire import
 *  inside the transaction. */
const parseKey = (
  key: string,
): { readonly book: number; readonly chapter: number; readonly verse: number } | null => {
  const parts = key.split('.');
  if (parts.length !== 3) return null;
  const book = Number(parts[0]);
  const chapter = Number(parts[1]);
  const verse = Number(parts[2]);
  if (!Number.isInteger(book) || !Number.isInteger(chapter) || !Number.isInteger(verse)) {
    return null;
  }
  return { book, chapter, verse };
};

// ---------------------------------------------------------------------------
// Service interface
// ---------------------------------------------------------------------------

export interface BibleXrefsDatabaseService {
  /**
   * Imports one catalog wholesale. Idempotent via PK upsert; safe to call on
   * every launch. Returns the number of cross-references written and the
   * number of source-verse keys that failed to parse (always 0 in practice
   * but exposed so callers can surface a warning if it isn't).
   */
  readonly importCatalog: (
    source: XrefSource,
    catalog: XrefCatalog,
  ) => Effect.Effect<{ readonly imported: number; readonly skipped: number }, SqlError>;

  /**
   * All cross-references emitted for the given source verse, across all
   * imported catalogs. Order is `(source, target_book, target_chapter,
   * target_verse)` — caller can re-bucket by source if it wants per-catalog
   * sections.
   */
  readonly getCrossRefs: (
    book: number,
    chapter: number,
    verse: number,
  ) => Effect.Effect<readonly CrossRefRow[], SqlError>;

  /**
   * Distinct verse numbers in the chapter that have at least one cross-reference
   * across any imported catalog. Used by the inline overlay to render an
   * `x`-superscript marker on verses that have xrefs without paying the full
   * per-verse fetch upfront.
   */
  readonly versesWithCrossRefs: (
    book: number,
    chapter: number,
  ) => Effect.Effect<readonly number[], SqlError>;

  /** `true` when at least one cross_refs row exists. Used by main to skip the
   *  (cheap but non-zero) JSON read + parse + transaction on subsequent launches. */
  readonly isImported: () => Effect.Effect<boolean, SqlError>;
}

// ---------------------------------------------------------------------------
// Service definition
// ---------------------------------------------------------------------------

export class BibleXrefsDatabase extends Context.Service<
  BibleXrefsDatabase,
  BibleXrefsDatabaseService
>()('@bible/core/bible-xrefs-db/BibleXrefsDatabase') {
  /**
   * Driver-agnostic layer. Initializes the schema (idempotent) and exposes
   * import + query operations. Compose with a SQLite driver layer
   * (sqlite-bun, sqlite-node) via `Layer.provide`.
   *
   * Reuses `PRAGMA user_version` for schema versioning. Other services in the
   * same DB (kjv_bible_db, egw_db) own their own tables and don't read the
   * user_version pragma — so a bump here only causes us to drop our table.
   */
  static layerCore: Layer.Layer<BibleXrefsDatabase, SqlError, SqlClient.SqlClient> = Layer.effect(
    BibleXrefsDatabase,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      // Schema-version pattern lifted from KjvBibleDatabase. Drop + recreate
      // on mismatch — the bundled JSON re-imports cheaply.
      const versionRows = yield* sql.unsafe<{ user_version: number }>(`PRAGMA user_version`);
      const currentVersion = versionRows[0]?.user_version ?? 0;
      if (currentVersion !== 0 && currentVersion !== SCHEMA_VERSION) {
        yield* sql.unsafe(`DROP TABLE IF EXISTS cross_refs`);
      }

      yield* sql.unsafe(`
        CREATE TABLE IF NOT EXISTS cross_refs (
          book INTEGER NOT NULL,
          chapter INTEGER NOT NULL,
          verse INTEGER NOT NULL,
          target_book INTEGER NOT NULL,
          target_chapter INTEGER NOT NULL,
          target_verse INTEGER NOT NULL,
          target_verse_end INTEGER,
          source TEXT NOT NULL CHECK (source IN ('openbible', 'tske')),
          PRIMARY KEY (book, chapter, verse, target_book, target_chapter, target_verse, source)
        )
      `);
      // Fast lookup by source verse — the only access pattern.
      yield* sql.unsafe(
        `CREATE INDEX IF NOT EXISTS cross_refs_source_verse ON cross_refs(book, chapter, verse)`,
      );

      // PRAGMA can't be bound — interpolate the integer literal directly.
      yield* sql.unsafe(`PRAGMA user_version = ${SCHEMA_VERSION}`);

      const importCatalog = (source: XrefSource, catalog: XrefCatalog) =>
        sql.withTransaction(
          Effect.gen(function* () {
            let imported = 0;
            let skipped = 0;
            for (const [key, entry] of Object.entries(catalog)) {
              const parsed = parseKey(key);
              if (parsed === null) {
                skipped += 1;
                continue;
              }
              for (const ref of entry.refs) {
                const verseEnd = ref.verseEnd ?? null;
                yield* sql`
                  INSERT INTO cross_refs (
                    book, chapter, verse,
                    target_book, target_chapter, target_verse, target_verse_end,
                    source
                  ) VALUES (
                    ${parsed.book}, ${parsed.chapter}, ${parsed.verse},
                    ${ref.book}, ${ref.chapter}, ${ref.verse}, ${verseEnd},
                    ${source}
                  )
                  ON CONFLICT(book, chapter, verse, target_book, target_chapter, target_verse, source)
                  DO UPDATE SET target_verse_end = excluded.target_verse_end
                `;
                imported += 1;
              }
            }
            return { imported, skipped };
          }),
        );

      const getCrossRefs = (book: number, chapter: number, verse: number) =>
        sql<{
          source: string;
          target_book: number;
          target_chapter: number;
          target_verse: number;
          target_verse_end: number | null;
        }>`
          SELECT source, target_book, target_chapter, target_verse, target_verse_end
          FROM cross_refs
          WHERE book = ${book} AND chapter = ${chapter} AND verse = ${verse}
          ORDER BY source, target_book, target_chapter, target_verse
        `.pipe(
          Effect.map((rows) =>
            rows.map(
              (r): CrossRefRow => ({
                // CHECK constraint guarantees one of the two; cast keeps the
                // boundary types tight without an extra parse step.
                source: r.source === 'tske' ? 'tske' : 'openbible',
                targetBook: r.target_book,
                targetChapter: r.target_chapter,
                targetVerse: r.target_verse,
                targetVerseEnd: r.target_verse_end,
              }),
            ),
          ),
        );

      const versesWithCrossRefs = (book: number, chapter: number) =>
        sql<{ verse: number }>`
          SELECT DISTINCT verse FROM cross_refs
          WHERE book = ${book} AND chapter = ${chapter}
          ORDER BY verse
        `.pipe(Effect.map((rows) => rows.map((r) => r.verse)));

      const isImported = () =>
        sql<{ n: number }>`SELECT COUNT(*) AS n FROM cross_refs LIMIT 1`.pipe(
          Effect.map((rows) => (rows[0]?.n ?? 0) > 0),
        );

      return BibleXrefsDatabase.of({
        importCatalog,
        getCrossRefs,
        versesWithCrossRefs,
        isImported,
      });
    }),
  );
}
