/**
 * Hymnal Database Service
 *
 * Provides access to hymn data stored in SQLite:
 * - 920 hymns from the SDA Hymnal
 * - 68 categories
 * - Full-text search support
 *
 * The database is located at packages/core/data/hymnal.db
 */

import type { PlatformError } from 'effect/PlatformError';
import { Database } from 'bun:sqlite';
import { Config, Context, Effect, FileSystem, Layer, Option, Path } from 'effect';

import {
  DatabaseConnectionError,
  DatabaseQueryError,
  RecordNotFoundError,
} from '../errors/database.js';
import type { HymnalDatabaseError } from '../errors/hymnal.js';
import type { CategoryId, HymnId } from '../types/ids.js';
import {
  Category,
  Hymn,
  HymnSummary,
  HymnVerse,
  type CategoryRow,
  type HymnRow,
} from './schemas.js';

// ============================================================================
// Verse Parsing
// ============================================================================

interface RawVerse {
  id: number;
  text: string;
}

function parseVerses(json: string): HymnVerse[] {
  try {
    const parsed = JSON.parse(json) as RawVerse[];
    return parsed.map(
      (v) =>
        new HymnVerse({
          id: v.id as HymnVerse['id'],
          text: v.text,
        }),
    );
  } catch {
    return [];
  }
}

function getFirstLine(json: string): string {
  try {
    const parsed = JSON.parse(json) as RawVerse[];
    const first = parsed[0];
    if (first?.text !== undefined) {
      const firstLine = first.text.split('\n')[0] ?? '';
      return firstLine.slice(0, 60) + (firstLine.length > 60 ? '...' : '');
    }
  } catch {
    // ignore
  }
  return '';
}

// ============================================================================
// Service Interface
// ============================================================================

/**
 * Hymnal Database service interface.
 */
export interface HymnalDatabaseService {
  readonly getHymn: (id: HymnId) => Effect.Effect<Option.Option<Hymn>, HymnalDatabaseError>;
  readonly getCategories: () => Effect.Effect<readonly Category[], HymnalDatabaseError>;
  readonly getHymnsByCategory: (
    categoryId: CategoryId,
  ) => Effect.Effect<readonly HymnSummary[], HymnalDatabaseError>;
  readonly searchHymns: (
    query: string,
    limit?: number,
  ) => Effect.Effect<readonly HymnSummary[], HymnalDatabaseError>;
}

// ============================================================================
// Service Definition
// ============================================================================

export class HymnalDatabase extends Context.Service<HymnalDatabase, HymnalDatabaseService>()(
  '@bible/core/hymnal/database/HymnalDatabase',
) {
  /**
   * Live implementation using SQLite database.
   */
  static Live: Layer.Layer<
    HymnalDatabase,
    DatabaseConnectionError | RecordNotFoundError | Config.ConfigError | PlatformError,
    FileSystem.FileSystem | Path.Path
  > = Layer.effect(
    HymnalDatabase,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;

      // Priority: env var > ~/.bible/hymnal.db
      const homeDir = process.env['HOME'] ?? process.env['USERPROFILE'] ?? '.';
      const defaultDbPath = path.join(homeDir, '.bible', 'hymnal.db');
      const dbPath = yield* Config.string('HYMNAL_DB_PATH').pipe(Config.withDefault(defaultDbPath));

      // Check if database exists
      const exists = yield* fs.exists(dbPath);
      if (!exists) {
        return yield* new RecordNotFoundError({
          entity: 'HymnalDatabase',
          id: dbPath,
          context: {
            message: `Hymnal database not found at ${dbPath}.`,
          },
        });
      }

      // Open database connection (readonly)
      const db = yield* Effect.try({
        try: () => new Database(dbPath, { readonly: true }),
        catch: (error) =>
          new DatabaseConnectionError({
            message: `Failed to open hymnal database at ${dbPath}`,
            cause: error,
            database: dbPath,
          }),
      });

      // ========================================================================
      // Prepared Statements
      // ========================================================================

      const getHymn = (id: HymnId): Effect.Effect<Option.Option<Hymn>, HymnalDatabaseError> =>
        Effect.try({
          try: () => {
            const row = db.query<HymnRow, [number]>('SELECT * FROM hymns WHERE id = ?').get(id);

            if (row === null) return Option.none();

            return Option.some(
              new Hymn({
                id: row.id as Hymn['id'],
                name: row.name,
                category: row.category,
                categoryId: row.category_id as Hymn['categoryId'],
                verses: parseVerses(row.verses),
              }),
            );
          },
          catch: (error) => new DatabaseQueryError({ operation: 'getHymn', cause: error }),
        });

      const getCategories = (): Effect.Effect<readonly Category[], HymnalDatabaseError> =>
        Effect.try({
          try: () => {
            const rows = db.query<CategoryRow, []>('SELECT * FROM categories ORDER BY id').all();
            return rows.map(
              (r) =>
                new Category({
                  id: r.id as Category['id'],
                  name: r.name,
                }),
            );
          },
          catch: (error) => new DatabaseQueryError({ operation: 'getCategories', cause: error }),
        });

      const getHymnsByCategory = (
        categoryId: CategoryId,
      ): Effect.Effect<readonly HymnSummary[], HymnalDatabaseError> =>
        Effect.try({
          try: () => {
            const rows = db
              .query<HymnRow, [number]>('SELECT * FROM hymns WHERE category_id = ? ORDER BY id')
              .all(categoryId);

            return rows.map(
              (r) =>
                new HymnSummary({
                  id: r.id as HymnSummary['id'],
                  name: r.name,
                  category: r.category,
                  firstLine: getFirstLine(r.verses),
                }),
            );
          },
          catch: (error) =>
            new DatabaseQueryError({ operation: 'getHymnsByCategory', cause: error }),
        });

      const searchHymns = (
        query: string,
        limit = 20,
      ): Effect.Effect<readonly HymnSummary[], HymnalDatabaseError> =>
        Effect.try({
          try: () => {
            const searchTerm = `%${query.toLowerCase()}%`;

            // Use LIKE search on name and verses (case-insensitive)
            const rows = db
              .query<HymnRow, [string, string, number]>(
                `SELECT * FROM hymns
                 WHERE LOWER(name) LIKE ? OR LOWER(verses) LIKE ?
                 ORDER BY id
                 LIMIT ?`,
              )
              .all(searchTerm, searchTerm, limit);

            return rows.map(
              (r) =>
                new HymnSummary({
                  id: r.id as HymnSummary['id'],
                  name: r.name,
                  category: r.category,
                  firstLine: getFirstLine(r.verses),
                }),
            );
          },
          catch: (error) => new DatabaseQueryError({ operation: 'searchHymns', cause: error }),
        });

      // Cleanup: close database when scope ends
      yield* Effect.addFinalizer(() =>
        Effect.try({
          try: () => db.close(false),
          catch: (error) =>
            new DatabaseConnectionError({
              message: 'Failed to close hymnal database',
              cause: error,
            }),
        }).pipe(Effect.ignore),
      );

      return {
        getHymn,
        getCategories,
        getHymnsByCategory,
        searchHymns,
      };
    }),
  );

  /**
   * Default layer - alias for Live
   */
  static Default = HymnalDatabase.Live;

  /**
   * Test implementation with mock data
   */
  static Test = (
    config: {
      hymns?: readonly Hymn[];
      categories?: readonly Category[];
    } = {},
  ): Layer.Layer<HymnalDatabase> =>
    Layer.succeed(HymnalDatabase, {
      getHymn: (id) => Effect.succeed(Option.fromNullishOr(config.hymns?.find((h) => h.id === id))),
      getCategories: () => Effect.succeed(config.categories ?? []),
      getHymnsByCategory: (categoryId) =>
        Effect.succeed(
          (config.hymns ?? [])
            .filter((h) => h.categoryId === categoryId)
            .map(
              (h) =>
                new HymnSummary({
                  id: h.id,
                  name: h.name,
                  category: h.category,
                  firstLine: h.verses[0]?.text.split('\n')[0] ?? '',
                }),
            ),
        ),
      searchHymns: (query) =>
        Effect.succeed(
          (config.hymns ?? [])
            .filter(
              (h) =>
                h.name.toLowerCase().includes(query.toLowerCase()) ||
                h.verses.some((v) => v.text.toLowerCase().includes(query.toLowerCase())),
            )
            .slice(0, 20)
            .map(
              (h) =>
                new HymnSummary({
                  id: h.id,
                  name: h.name,
                  category: h.category,
                  firstLine: h.verses[0]?.text.split('\n')[0] ?? '',
                }),
            ),
        ),
    });
}
