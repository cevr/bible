/**
 * Hymnal Service
 *
 * High-level API for accessing hymnal data.
 * Wraps HymnalDatabase with additional business logic.
 */

import { Context, Effect, Layer, Option } from 'effect';

import { RecordNotFoundError } from '../errors/database.js';
import type { HymnalDatabaseError } from '../errors/hymnal.js';
import type { CategoryId, HymnId } from '../types/ids.js';
import { HymnalDatabase } from './database.js';
import type { Category, Hymn, HymnSummary } from './schemas.js';

// ============================================================================
// Theme to Category Mapping
// ============================================================================

/**
 * Maps common themes to hymnal category IDs.
 * Categories from SDA Hymnal (1-68).
 */
const THEME_CATEGORY_MAP: Record<string, number[]> = {
  // Worship themes
  worship: [1, 2, 3, 4, 5], // Adoration, Morning, Evening, Opening, Close
  praise: [1], // Adoration and Praise
  morning: [2], // Morning Worship
  evening: [3], // Evening Worship
  opening: [4], // Opening of Worship
  closing: [5], // Close of Worship

  // God themes
  trinity: [6],
  love: [7], // Love of God
  majesty: [8], // Majesty and Power
  nature: [9], // Power of God in Nature
  faithfulness: [10], // Faithfulness of God

  // Christ themes
  jesus: [11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
  birth: [11], // Birth
  life: [12], // Life and Ministry
  suffering: [13], // Suffering and Death
  resurrection: [14], // Resurrection
  ascension: [15], // Ascension and Priesthood
  coming: [16, 17], // Second Coming, Kingdom

  // Holy Spirit
  spirit: [21], // Holy Spirit

  // Scriptures
  bible: [22], // Word of God
  scripture: [22],

  // Gospel themes
  gospel: [23], // Gospel
  salvation: [24, 25, 26], // Invitation, Repentance, Forgiveness
  invitation: [24],
  repentance: [25],
  forgiveness: [26],
  grace: [27], // Consecration
  faith: [28, 29], // Trust, Obedience
  trust: [28],
  obedience: [29],

  // Christian life
  prayer: [30, 31], // Prayer, Meditation
  meditation: [31],
  peace: [32], // Joy and Peace
  joy: [32],
  hope: [33], // Hope and Comfort
  comfort: [33],
  courage: [34], // Courage
  guidance: [35], // Guidance
  pilgrimage: [36], // Pilgrimage
  victory: [37], // Warfare and Victory
  warfare: [37],

  // Church themes
  church: [38, 39, 40, 41], // Church, Mission, Ordination, Marriage
  mission: [39],
  marriage: [40],
  family: [41], // Home and Family
  home: [41],
  children: [42], // Children
  youth: [43], // Youth

  // Doctrinal
  sabbath: [44, 45, 46], // Sabbath
  communion: [47], // Lord's Supper
  baptism: [48],
  dedication: [49],
  judgment: [50], // Judgment
  resurrection_hope: [51], // Resurrection
  heaven: [52], // Heaven

  // Seasonal
  thanksgiving: [53],
  new_year: [54],
  harvest: [55],

  // Closing
  benediction: [56, 57, 58], // Closing hymns
  amen: [59],
};

// ============================================================================
// Service Interface
// ============================================================================

/**
 * Hymnal service interface.
 */
export interface HymnalServiceShape {
  /**
   * Get a hymn by its number.
   * Returns HymnNotFoundError if not found.
   */
  readonly getHymn: (id: HymnId) => Effect.Effect<Hymn, HymnalDatabaseError>;

  /**
   * Get all hymn categories.
   */
  readonly getCategories: () => Effect.Effect<readonly Category[], HymnalDatabaseError>;

  /**
   * Get all hymns in a category.
   */
  readonly getHymnsByCategory: (
    categoryId: CategoryId,
  ) => Effect.Effect<readonly HymnSummary[], HymnalDatabaseError>;

  /**
   * Search hymns by text in name or lyrics.
   */
  readonly searchHymns: (
    query: string,
    limit?: number,
  ) => Effect.Effect<readonly HymnSummary[], HymnalDatabaseError>;

  /**
   * Find hymns related to a theme.
   * Maps theme to categories, with fallback to text search.
   */
  readonly findHymnsByTheme: (
    theme: string,
    limit?: number,
  ) => Effect.Effect<readonly HymnSummary[], HymnalDatabaseError>;
}

// ============================================================================
// Service Definition
// ============================================================================

export class HymnalService extends Context.Service<HymnalService, HymnalServiceShape>()(
  '@bible/core/hymnal/service/HymnalService',
) {
  /**
   * Live implementation using HymnalDatabase.
   */
  static Live: Layer.Layer<HymnalService, never, HymnalDatabase> = Layer.effect(
    HymnalService,
    Effect.gen(function* () {
      const db = yield* HymnalDatabase;

      const getHymn = Effect.fn('HymnalService.getHymn')(function* (id: HymnId) {
        const hymn = yield* db.getHymn(id);
        return yield* Option.match(hymn, {
          onNone: () =>
            Effect.fail(
              new RecordNotFoundError({
                entity: 'Hymn',
                id: String(id),
              }),
            ),
          onSome: Effect.succeed,
        });
      });

      const getCategories = Effect.fn('HymnalService.getCategories')(function* () {
        return yield* db.getCategories();
      });

      const getHymnsByCategory = Effect.fn('HymnalService.getHymnsByCategory')(function* (
        categoryId: CategoryId,
      ) {
        return yield* db.getHymnsByCategory(categoryId);
      });

      const searchHymns = Effect.fn('HymnalService.searchHymns')(function* (
        query: string,
        limit?: number,
      ) {
        return yield* db.searchHymns(query, limit);
      });

      const findHymnsByTheme = Effect.fn('HymnalService.findHymnsByTheme')(function* (
        theme: string,
        limit = 10,
      ) {
        // Normalize theme for lookup
        const normalizedTheme = theme.toLowerCase().replace(/[\s-_]+/g, '_');

        // Find matching category IDs
        const categoryIds = THEME_CATEGORY_MAP[normalizedTheme];

        if (categoryIds !== undefined && categoryIds.length > 0) {
          // Get hymns from matching categories
          const results: HymnSummary[] = [];
          for (const catId of categoryIds) {
            if (results.length >= limit) break;
            const hymns = yield* db.getHymnsByCategory(catId as CategoryId);
            for (const hymn of hymns) {
              if (results.length >= limit) break;
              // Avoid duplicates
              if (!results.some((r) => r.id === hymn.id)) {
                results.push(hymn);
              }
            }
          }
          return results;
        }

        // Fallback to text search
        return yield* db.searchHymns(theme, limit);
      });

      return {
        getHymn,
        getCategories,
        getHymnsByCategory,
        searchHymns,
        findHymnsByTheme,
      };
    }),
  );

  /**
   * Default layer - alias for Live
   */
  static Default = HymnalService.Live;

  /**
   * Test implementation with configurable mock data.
   */
  static Test = (
    config: {
      hymns?: readonly Hymn[];
      categories?: readonly Category[];
    } = {},
  ): Layer.Layer<HymnalService> =>
    Layer.effect(
      HymnalService,
      Effect.gen(function* () {
        const db = yield* HymnalDatabase;

        return {
          getHymn: (id) =>
            db.getHymn(id).pipe(
              Effect.flatMap(
                Option.match({
                  onNone: () =>
                    Effect.fail(
                      new RecordNotFoundError({
                        entity: 'Hymn',
                        id: String(id),
                      }),
                    ),
                  onSome: Effect.succeed,
                }),
              ),
            ),
          getCategories: () => db.getCategories(),
          getHymnsByCategory: (categoryId) => db.getHymnsByCategory(categoryId),
          searchHymns: (query, limit) => db.searchHymns(query, limit),
          findHymnsByTheme: (theme, limit = 10) => db.searchHymns(theme, limit),
        };
      }),
    ).pipe(Layer.provide(HymnalDatabase.Test(config)));
}
