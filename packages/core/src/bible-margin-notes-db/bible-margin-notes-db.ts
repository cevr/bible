/**
 * Bible Margin Notes Database Service using Effect SQL
 *
 * Stores the bundled margin-notes catalog (packages/core/assets/margin-notes.json).
 * The asset shape is `{ "book.chapter.verse": [{type, phrase, text}, ...] }`
 * where `type` is one of `hebrew | alternate | other | greek | name`. Multiple
 * notes per verse are common — schema keeps them ordered by an `idx` column so
 * the renderer's superscript anchors stay stable across launches.
 *
 * Depends only on `SqlClient.SqlClient` so any SQLite driver layer
 * (sqlite-bun, sqlite-node) can satisfy it.
 *
 * Schema:
 * - margin_notes: one row per (book, chapter, verse, idx). `idx` is the
 *   zero-based position in the source array — preserves the order the asset
 *   shipped with, which is the order we render.
 * - margin_notes_verse_index: index on (book, chapter) to support the
 *   "which verses in this chapter have notes" lookup used by the verse anchor.
 */

import { Context, Effect, Layer } from 'effect';
import * as SqlClient from 'effect/unstable/sql/SqlClient';
import type { SqlError } from 'effect/unstable/sql/SqlError';

// Bump when the on-disk shape changes. Init drops and rebuilds the
// margin_notes table on mismatch — the bundled JSON re-imports in seconds, so
// we don't ship migration SQL.
const SCHEMA_VERSION = 1;

// ---------------------------------------------------------------------------
// Asset shapes (input to import)
// ---------------------------------------------------------------------------

/** Annotation kind exactly as it appears in the bundled asset. The list is
 *  closed — the renderer can switch on it for the badge color/wording. */
export type MarginNoteType = 'hebrew' | 'alternate' | 'other' | 'greek' | 'name';

export interface MarginNoteRaw {
  readonly type: MarginNoteType;
  readonly phrase: string;
  readonly text: string;
}

/** Top-level shape of margin-notes.json. Keyed by `"book.chapter.verse"` strings. */
export type MarginNotesCatalog = Record<string, readonly MarginNoteRaw[]>;

// ---------------------------------------------------------------------------
// Renderer-facing payloads
// ---------------------------------------------------------------------------

export interface MarginNoteRow {
  readonly idx: number;
  readonly type: MarginNoteType;
  readonly phrase: string;
  readonly text: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parses `"1.2.3"` → `{book: 1, chapter: 2, verse: 3}` or `null` for any
 *  malformed key (non-integer parts, wrong arity, NaN). Catalog data is
 *  trusted but we don't want a stray garbage key to abort the import. */
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

const isMarginNoteType = (value: string): value is MarginNoteType =>
  value === 'hebrew' ||
  value === 'alternate' ||
  value === 'other' ||
  value === 'greek' ||
  value === 'name';

// ---------------------------------------------------------------------------
// Service interface
// ---------------------------------------------------------------------------

export interface BibleMarginNotesDatabaseService {
  /**
   * Imports the catalog wholesale. Idempotent via PK upsert; safe to call on
   * every launch. Returns the number of notes written and the number of
   * source-verse keys that failed to parse (always 0 in practice but exposed
   * so callers can surface a warning if it isn't).
   */
  readonly importCatalog: (
    catalog: MarginNotesCatalog,
  ) => Effect.Effect<{ readonly imported: number; readonly skipped: number }, SqlError>;

  /**
   * All margin notes for the given source verse, ordered by their original
   * position in the asset. Returns `[]` for any verse not in the catalog —
   * the renderer surfaces an inline empty state rather than treating that as
   * an error.
   */
  readonly getMarginNotes: (
    book: number,
    chapter: number,
    verse: number,
  ) => Effect.Effect<readonly MarginNoteRow[], SqlError>;

  /**
   * Verse numbers in a given (book, chapter) that have at least one note,
   * paired with their note count. Used by the chapter renderer to mark
   * verses with a superscript anchor — one round-trip per chapter rather
   * than one per verse keeps the verse loop cheap.
   */
  readonly versesWithNotes: (
    book: number,
    chapter: number,
  ) => Effect.Effect<ReadonlyMap<number, number>, SqlError>;

  /** `true` when at least one margin_notes row exists. Used by main to skip the
   *  (cheap but non-zero) JSON read + parse + transaction on subsequent launches. */
  readonly isImported: () => Effect.Effect<boolean, SqlError>;
}

// ---------------------------------------------------------------------------
// Service definition
// ---------------------------------------------------------------------------

export class BibleMarginNotesDatabase extends Context.Service<
  BibleMarginNotesDatabase,
  BibleMarginNotesDatabaseService
>()('@bible/core/bible-margin-notes-db/BibleMarginNotesDatabase') {
  /**
   * Driver-agnostic layer. Initializes the schema (idempotent) and exposes
   * import + query operations. Compose with a SQLite driver layer
   * (sqlite-bun, sqlite-node) via `Layer.provide`.
   *
   * Reuses `PRAGMA user_version` for schema versioning. Other services in the
   * same DB own their own tables and don't read user_version — a bump here
   * only causes us to drop the margin_notes table.
   */
  static layerCore: Layer.Layer<BibleMarginNotesDatabase, SqlError, SqlClient.SqlClient> =
    Layer.effect(
      BibleMarginNotesDatabase,
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;

        // Schema-version pattern lifted from BibleXrefsDatabase. Drop + recreate
        // on mismatch — the bundled JSON re-imports cheaply.
        const versionRows = yield* sql.unsafe<{ user_version: number }>(`PRAGMA user_version`);
        const currentVersion = versionRows[0]?.user_version ?? 0;
        if (currentVersion !== 0 && currentVersion !== SCHEMA_VERSION) {
          yield* sql.unsafe(`DROP TABLE IF EXISTS margin_notes`);
        }

        yield* sql.unsafe(`
        CREATE TABLE IF NOT EXISTS margin_notes (
          book INTEGER NOT NULL,
          chapter INTEGER NOT NULL,
          verse INTEGER NOT NULL,
          idx INTEGER NOT NULL,
          type TEXT NOT NULL CHECK (type IN ('hebrew', 'alternate', 'other', 'greek', 'name')),
          phrase TEXT NOT NULL,
          text TEXT NOT NULL,
          PRIMARY KEY (book, chapter, verse, idx)
        )
      `);
        // Fast lookup of "which verses in this chapter have notes". The PK
        // covers per-verse lookups already; this one targets the per-chapter
        // anchor-mark query.
        yield* sql.unsafe(
          `CREATE INDEX IF NOT EXISTS margin_notes_book_chapter ON margin_notes(book, chapter)`,
        );

        // PRAGMA can't be bound — interpolate the integer literal directly.
        yield* sql.unsafe(`PRAGMA user_version = ${SCHEMA_VERSION}`);

        const importCatalog = (catalog: MarginNotesCatalog) =>
          sql.withTransaction(
            Effect.gen(function* () {
              let imported = 0;
              let skipped = 0;
              for (const [key, notes] of Object.entries(catalog)) {
                const parsed = parseKey(key);
                if (parsed === null) {
                  skipped += 1;
                  continue;
                }
                let idx = 0;
                for (const note of notes) {
                  // Defensive: the asset is hand-curated. Skip individual notes
                  // with an unknown type rather than aborting the transaction.
                  if (!isMarginNoteType(note.type)) {
                    skipped += 1;
                    idx += 1;
                    continue;
                  }
                  yield* sql`
                  INSERT INTO margin_notes (book, chapter, verse, idx, type, phrase, text)
                  VALUES (
                    ${parsed.book}, ${parsed.chapter}, ${parsed.verse}, ${idx},
                    ${note.type}, ${note.phrase}, ${note.text}
                  )
                  ON CONFLICT(book, chapter, verse, idx)
                  DO UPDATE SET
                    type = excluded.type,
                    phrase = excluded.phrase,
                    text = excluded.text
                `;
                  imported += 1;
                  idx += 1;
                }
              }
              return { imported, skipped };
            }),
          );

        const getMarginNotes = (book: number, chapter: number, verse: number) =>
          sql<{ idx: number; type: string; phrase: string; text: string }>`
          SELECT idx, type, phrase, text
          FROM margin_notes
          WHERE book = ${book} AND chapter = ${chapter} AND verse = ${verse}
          ORDER BY idx
        `.pipe(
            Effect.map((rows) =>
              rows.map((r): MarginNoteRow => {
                // CHECK constraint guarantees a valid type; the cast keeps the
                // boundary types tight without an extra parse step. Fall back
                // to 'other' if the runtime guarantee is somehow violated.
                const t: MarginNoteType = isMarginNoteType(r.type) ? r.type : 'other';
                return { idx: r.idx, type: t, phrase: r.phrase, text: r.text };
              }),
            ),
          );

        const versesWithNotes = (book: number, chapter: number) =>
          sql<{ verse: number; n: number }>`
          SELECT verse, COUNT(*) AS n
          FROM margin_notes
          WHERE book = ${book} AND chapter = ${chapter}
          GROUP BY verse
          ORDER BY verse
        `.pipe(
            Effect.map((rows) => {
              const map = new Map<number, number>();
              for (const r of rows) map.set(r.verse, r.n);
              return map as ReadonlyMap<number, number>;
            }),
          );

        const isImported = () =>
          sql<{ n: number }>`SELECT COUNT(*) AS n FROM margin_notes LIMIT 1`.pipe(
            Effect.map((rows) => (rows[0]?.n ?? 0) > 0),
          );

        return BibleMarginNotesDatabase.of({
          importCatalog,
          getMarginNotes,
          versesWithNotes,
          isImported,
        });
      }),
    );
}
