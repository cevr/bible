/**
 * Hymnal Service
 *
 * The portable hymnal capability. Host adapters provide storage layers.
 */

import { Context, Effect, Layer, Predicate, Schema } from 'effect';

import type { CategoryId, HymnId } from '../types/ids.js';
import type { Category, Hymn } from './schemas.js';
import { HymnSummary } from './schemas.js';

export class HymnalError extends Schema.TaggedError<HymnalError>()('HymnalError', {
  cause: Schema.Unknown,
  operation: Schema.String,
  message: Schema.optional(Schema.String),
}) {}

export class HymnNotFoundError extends Schema.TaggedError<HymnNotFoundError>()(
  'HymnNotFoundError',
  { id: Schema.Finite },
) {}

const truncateFirstLine = (text: string): string => {
  const firstLine = text.split('\n')[0] ?? '';
  let suffix = '';
  if (firstLine.length > 60) suffix = '...';
  return firstLine.slice(0, 60) + suffix;
};

const summarizeHymn = (hymn: Hymn): HymnSummary => {
  let firstLine = '';
  const firstVerse = hymn.verses[0];
  if (Predicate.isNotUndefined(firstVerse)) firstLine = truncateFirstLine(firstVerse.text);
  return HymnSummary.make({
    id: hymn.id,
    name: hymn.name,
    category: hymn.category,
    firstLine,
  });
};

export interface HymnalServiceApi {
  readonly getHymn: (id: HymnId) => Effect.Effect<Hymn, HymnalError | HymnNotFoundError>;
  readonly getCategories: Effect.Effect<readonly Category[], HymnalError>;
  readonly getHymnsByCategory: (
    categoryId: CategoryId,
  ) => Effect.Effect<readonly HymnSummary[], HymnalError>;
  readonly searchHymns: (
    query: string,
    limit?: number,
  ) => Effect.Effect<readonly HymnSummary[], HymnalError>;
}

export class HymnalService extends Context.Service<HymnalService, HymnalServiceApi>()(
  '@bible/core/hymnal/HymnalService',
) {
  static Test = (
    config: {
      hymns?: readonly Hymn[];
      categories?: readonly Category[];
    } = {},
  ): Layer.Layer<HymnalService> => {
    const hymns = config.hymns ?? [];
    const categories = config.categories ?? [];

    return Layer.succeed(
      HymnalService,
      HymnalService.of({
        getHymn: (id) => {
          const hymn = hymns.find((candidate) => candidate.id === id);
          if (Predicate.isUndefined(hymn)) return Effect.fail(HymnNotFoundError.make({ id }));
          return Effect.succeed(hymn);
        },
        getCategories: Effect.succeed(categories),
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
      }),
    );
  };
}
