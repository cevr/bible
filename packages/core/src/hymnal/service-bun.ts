import type { PlatformError } from 'effect/PlatformError';
import { Database } from 'bun:sqlite';
import { Config, Effect, FileSystem, Layer, Option, Path, Predicate, Schema } from 'effect';

import { CategoryId, HymnId } from '../types/ids.js';
import {
  Category,
  Hymn,
  HymnSummary,
  HymnVerse,
  type CategoryRow,
  type HymnRow,
} from './schemas.js';
import { HymnalError, HymnalService, HymnNotFoundError } from './service.js';

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
  if (Predicate.isUndefined(first)) return '';
  return truncateFirstLine(first.text);
};

export const layerHymnalBun: Layer.Layer<
  HymnalService,
  HymnalError | Config.ConfigError | PlatformError,
  FileSystem.FileSystem | Path.Path
> = Layer.effect(
  HymnalService,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const homeDirectory = yield* Config.String('HOME');
    const defaultDbPath = path.join(homeDirectory, '.bible', 'hymnal.db');
    const dbPath = yield* Config.String('HYMNAL_DB_PATH').pipe(Config.withDefault(defaultDbPath));

    if (!(yield* fs.exists(dbPath))) {
      return yield* HymnalError.make({
        operation: 'open',
        cause: dbPath,
        message: `Hymnal database not found at ${dbPath}.`,
      });
    }

    const db = yield* Effect.try({
      try: () => new Database(dbPath, { readonly: true }),
      catch: (cause) =>
        HymnalError.make({
          operation: 'open',
          message: `Failed to open hymnal database at ${dbPath}`,
          cause,
        }),
    });

    yield* Effect.addFinalizer(() =>
      Effect.try({
        try: () => db.close(false),
        catch: (cause) =>
          HymnalError.make({
            operation: 'close',
            message: 'Failed to close hymnal database',
            cause,
          }),
      }).pipe(Effect.ignore),
    );

    const getHymn = Effect.fn('HymnalService.getHymn')(function* (id: HymnId) {
      const hymn = yield* Effect.try({
        try: () => {
          const row = db.query<HymnRow, [number]>('SELECT * FROM hymns WHERE id = ?').get(id);
          if (Predicate.isNull(row)) return Option.none<Hymn>();
          return Option.some(
            Hymn.make({
              id: HymnId.make(row.id),
              name: row.name,
              category: row.category,
              categoryId: CategoryId.make(row.category_id),
              verses: decodeHymnVerses(row.verses),
            }),
          );
        },
        catch: (cause) => HymnalError.make({ operation: 'getHymn', cause }),
      });

      return yield* Option.match(hymn, {
        onNone: () => Effect.fail(HymnNotFoundError.make({ id })),
        onSome: Effect.succeed,
      });
    });

    const getCategories = Effect.try({
      try: () =>
        db
          .query<CategoryRow, []>('SELECT * FROM categories ORDER BY id')
          .all()
          .map((row) => Category.make({ id: CategoryId.make(row.id), name: row.name })),
      catch: (cause) => HymnalError.make({ operation: 'getCategories', cause }),
    }).pipe(Effect.withSpan('HymnalService.getCategories'));

    const getHymnsByCategory = Effect.fn('HymnalService.getHymnsByCategory')(
      (categoryId: CategoryId) =>
        Effect.try({
          try: () =>
            db
              .query<HymnRow, [number]>('SELECT * FROM hymns WHERE category_id = ? ORDER BY id')
              .all(categoryId)
              .map((row) =>
                HymnSummary.make({
                  id: HymnId.make(row.id),
                  name: row.name,
                  category: row.category,
                  firstLine: firstLineFromJson(row.verses),
                }),
              ),
          catch: (cause) => HymnalError.make({ operation: 'getHymnsByCategory', cause }),
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
            .map((row) =>
              HymnSummary.make({
                id: HymnId.make(row.id),
                name: row.name,
                category: row.category,
                firstLine: firstLineFromJson(row.verses),
              }),
            );
        },
        catch: (cause) => HymnalError.make({ operation: 'searchHymns', cause }),
      }),
    );

    return HymnalService.of({ getHymn, getCategories, getHymnsByCategory, searchHymns });
  }),
);
