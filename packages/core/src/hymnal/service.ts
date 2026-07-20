/**
 * Hymnal Service
 *
 * The public hymnal capability. SQLite is an implementation detail of the
 * live layer rather than a second service callers need to compose.
 */

import { homedir } from 'node:os';

import type { PlatformError } from 'effect/PlatformError';
import { Database } from 'bun:sqlite';
import { Config, Context, Effect, FileSystem, Layer, Option, Path, Schema } from 'effect';

import type { CategoryId, HymnId } from '../types/ids.js';
import {
  Category,
  Hymn,
  HymnSummary,
  HymnVerse,
  type CategoryRow,
  type HymnRow,
} from './schemas.js';

export class HymnalError extends Schema.TaggedErrorClass<HymnalError>()('HymnalError', {
  cause: Schema.Unknown,
  operation: Schema.String,
  message: Schema.optional(Schema.String),
}) {}

export class HymnNotFoundError extends Schema.TaggedErrorClass<HymnNotFoundError>()(
  'HymnNotFoundError',
  { id: Schema.Number },
) {}

const HymnVersesJson = Schema.fromJsonString(Schema.Array(HymnVerse));
const decodeHymnVerses = Schema.decodeUnknownSync(HymnVersesJson);

const truncateFirstLine = (text: string): string => {
  const firstLine = text.split('\n')[0] ?? '';
  let suffix = '';
  if (firstLine.length > 60) suffix = '...';
  return firstLine.slice(0, 60) + suffix;
};

const firstLineFromJson = (json: string): string => {
  const first = decodeHymnVerses(json)[0];
  if (first === undefined) return '';
  return truncateFirstLine(first.text);
};

const summarizeHymn = (hymn: Hymn): HymnSummary => {
  let firstLine = '';
  if (hymn.verses[0] !== undefined) firstLine = truncateFirstLine(hymn.verses[0].text);
  return new HymnSummary({
    id: hymn.id,
    name: hymn.name,
    category: hymn.category,
    firstLine,
  });
};

export interface HymnalServiceShape {
  readonly getHymn: (id: HymnId) => Effect.Effect<Hymn, HymnalError | HymnNotFoundError>;
  readonly getCategories: () => Effect.Effect<readonly Category[], HymnalError>;
  readonly getHymnsByCategory: (
    categoryId: CategoryId,
  ) => Effect.Effect<readonly HymnSummary[], HymnalError>;
  readonly searchHymns: (
    query: string,
    limit?: number,
  ) => Effect.Effect<readonly HymnSummary[], HymnalError>;
}

export class HymnalService extends Context.Service<HymnalService, HymnalServiceShape>()(
  '@bible/core/hymnal/HymnalService',
) {
  static Live: Layer.Layer<
    HymnalService,
    HymnalError | Config.ConfigError | PlatformError,
    FileSystem.FileSystem | Path.Path
  > = Layer.effect(
    HymnalService,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;

      const defaultDbPath = path.join(homedir(), '.bible', 'hymnal.db');
      const dbPath = yield* Config.string('HYMNAL_DB_PATH').pipe(Config.withDefault(defaultDbPath));

      if (!(yield* fs.exists(dbPath))) {
        return yield* new HymnalError({
          operation: 'open',
          cause: dbPath,
          message: `Hymnal database not found at ${dbPath}.`,
        });
      }

      const db = yield* Effect.try({
        try: () => new Database(dbPath, { readonly: true }),
        catch: (error) =>
          new HymnalError({
            operation: 'open',
            message: `Failed to open hymnal database at ${dbPath}`,
            cause: error,
          }),
      });

      yield* Effect.addFinalizer(() =>
        Effect.try({
          try: () => db.close(false),
          catch: (error) =>
            new HymnalError({
              operation: 'close',
              message: 'Failed to close hymnal database',
              cause: error,
            }),
        }).pipe(Effect.ignore),
      );

      const getHymn = Effect.fn('HymnalService.getHymn')(function* (id: HymnId) {
        const hymn = yield* Effect.try({
          try: () => {
            const row = db.query<HymnRow, [number]>('SELECT * FROM hymns WHERE id = ?').get(id);
            if (row === null) return Option.none<Hymn>();

            return Option.some(
              new Hymn({
                id: row.id as Hymn['id'],
                name: row.name,
                category: row.category,
                categoryId: row.category_id as Hymn['categoryId'],
                verses: decodeHymnVerses(row.verses),
              }),
            );
          },
          catch: (error) => new HymnalError({ operation: 'getHymn', cause: error }),
        });

        return yield* Option.match(hymn, {
          onNone: () => Effect.fail(new HymnNotFoundError({ id })),
          onSome: Effect.succeed,
        });
      });

      const getCategories = Effect.fn('HymnalService.getCategories')(() =>
        Effect.try({
          try: () =>
            db
              .query<CategoryRow, []>('SELECT * FROM categories ORDER BY id')
              .all()
              .map((row) => new Category({ id: row.id as Category['id'], name: row.name })),
          catch: (error) => new HymnalError({ operation: 'getCategories', cause: error }),
        }),
      );

      const getHymnsByCategory = Effect.fn('HymnalService.getHymnsByCategory')(
        (categoryId: CategoryId) =>
          Effect.try({
            try: () =>
              db
                .query<HymnRow, [number]>('SELECT * FROM hymns WHERE category_id = ? ORDER BY id')
                .all(categoryId)
                .map(
                  (row) =>
                    new HymnSummary({
                      id: row.id as HymnSummary['id'],
                      name: row.name,
                      category: row.category,
                      firstLine: firstLineFromJson(row.verses),
                    }),
                ),
            catch: (error) => new HymnalError({ operation: 'getHymnsByCategory', cause: error }),
          }),
      );

      const searchHymns = Effect.fn('HymnalService.searchHymns')((query: string, limit = 20) =>
        Effect.try({
          try: () => {
            const searchTerm = `%${query.toLowerCase()}%`;
            return db
              .query<HymnRow, [string, string, number]>(
                `SELECT * FROM hymns
                   WHERE LOWER(name) LIKE ? OR LOWER(verses) LIKE ?
                   ORDER BY id
                   LIMIT ?`,
              )
              .all(searchTerm, searchTerm, limit)
              .map(
                (row) =>
                  new HymnSummary({
                    id: row.id as HymnSummary['id'],
                    name: row.name,
                    category: row.category,
                    firstLine: firstLineFromJson(row.verses),
                  }),
              );
          },
          catch: (error) => new HymnalError({ operation: 'searchHymns', cause: error }),
        }),
      );

      return { getHymn, getCategories, getHymnsByCategory, searchHymns };
    }),
  );

  static Default = HymnalService.Live;

  static Test = (
    config: {
      hymns?: readonly Hymn[];
      categories?: readonly Category[];
    } = {},
  ): Layer.Layer<HymnalService> => {
    const hymns = config.hymns ?? [];
    const categories = config.categories ?? [];

    return Layer.succeed(HymnalService, {
      getHymn: (id) => {
        const hymn = hymns.find((candidate) => candidate.id === id);
        if (hymn === undefined) return Effect.fail(new HymnNotFoundError({ id }));
        return Effect.succeed(hymn);
      },
      getCategories: () => Effect.succeed(categories),
      getHymnsByCategory: (categoryId) =>
        Effect.succeed(hymns.filter((hymn) => hymn.categoryId === categoryId).map(summarizeHymn)),
      searchHymns: (query, limit = 20) => {
        const normalizedQuery = query.toLowerCase();
        const matches = hymns.filter(
          (hymn) =>
            hymn.name.toLowerCase().includes(normalizedQuery) ||
            hymn.verses.some((verse) => verse.text.toLowerCase().includes(normalizedQuery)),
        );
        let limited = matches;
        if (limit >= 0) limited = matches.slice(0, limit);
        return Effect.succeed(limited.map(summarizeHymn));
      },
    });
  };
}
