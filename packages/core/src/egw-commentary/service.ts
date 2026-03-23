// @effect-diagnostics strictBooleanExpressions:off
/**
 * EGW Commentary Service
 *
 * Provides commentary lookup by Bible verse from the EGW Bible Commentary volumes (BC1-BC7).
 * Uses the indexed paragraph_bible_refs table for fast O(1) lookups.
 */

import { ServiceMap, Effect, Layer, Schema } from 'effect';

import { EGWParagraphDatabase } from '../egw-db/book-database.js';
import type * as EGWSchemas from '../egw/schemas.js';
import type { CommentaryEntry, CommentaryResult, VerseReference } from './types.js';

/**
 * Error types for the commentary service
 */
export class CommentaryError extends Schema.TaggedErrorClass<CommentaryError>()('CommentaryError', {
  message: Schema.String,
  cause: Schema.optional(Schema.Unknown),
}) {}

/**
 * Union of all commentary errors
 */
export type CommentaryServiceError = CommentaryError;

/**
 * Convert EGW paragraph to commentary entry
 */
function paragraphToEntry(
  para: EGWSchemas.Paragraph,
  bookCode: string,
  bookTitle: string,
): CommentaryEntry {
  return {
    refcode: para.refcode_short ?? para.refcode_long ?? '',
    bookCode,
    bookTitle,
    content: para.content ?? '',
    puborder: para.puborder,
  };
}

// ============================================================================
// Service Interface
// ============================================================================

/**
 * EGW Commentary service interface.
 * Provides commentary lookup from EGW Bible Commentary volumes.
 */
export interface EGWCommentaryServiceShape {
  readonly getCommentary: (
    verse: VerseReference,
  ) => Effect.Effect<CommentaryResult, CommentaryServiceError>;
  readonly searchCommentary: (
    query: string,
    limit?: number,
  ) => Effect.Effect<readonly CommentaryEntry[], CommentaryServiceError>;
}

// ============================================================================
// Service Definition
// ============================================================================

/**
 * EGW Commentary Service
 *
 * Provides commentary lookup from EGW Bible Commentary volumes.
 */
export class EGWCommentaryService extends ServiceMap.Service<
  EGWCommentaryService,
  EGWCommentaryServiceShape
>()('@bible/core/egw-commentary/service/EGWCommentaryService') {
  /**
   * Live implementation using EGWParagraphDatabase.
   */
  static Live: Layer.Layer<EGWCommentaryService, never, EGWParagraphDatabase> = Layer.effect(
    EGWCommentaryService,
    Effect.gen(function* () {
      const db = yield* EGWParagraphDatabase;

      /**
       * Get commentary for a specific Bible verse
       *
       * Uses the indexed paragraph_bible_refs table for fast O(1) lookup
       * instead of streaming through all paragraphs.
       */
      const getCommentary = (
        verse: VerseReference,
      ): Effect.Effect<CommentaryResult, CommentaryServiceError> =>
        db.getParagraphsByBibleRef(verse.book, verse.chapter, verse.verse).pipe(
          Effect.map((paragraphs) => ({
            verse,
            entries: paragraphs.map((para) =>
              paragraphToEntry(para, para.bookCode, para.bookTitle),
            ),
          })),
          Effect.mapError(
            (e) =>
              new CommentaryError({
                message: 'Failed to get commentary',
                cause: e,
              }),
          ),
        );

      /**
       * Search commentary by text query
       *
       * Uses FTS5 full-text search for efficient text matching.
       */
      const searchCommentary = (
        query: string,
        limit: number = 20,
      ): Effect.Effect<readonly CommentaryEntry[], CommentaryServiceError> =>
        db.searchParagraphs(query, limit).pipe(
          Effect.map((paragraphs) =>
            // Filter to BC volumes only
            paragraphs
              .filter((para) => {
                const refcode = para.refcode_short ?? para.refcode_long ?? '';
                return /^[1-7]BC/i.test(refcode);
              })
              .map((para) => {
                const refcode = para.refcode_short ?? para.refcode_long ?? '';
                const bcVolume = refcode.substring(0, 3).toUpperCase();
                return paragraphToEntry(
                  para,
                  bcVolume,
                  `Bible Commentary Volume ${bcVolume.charAt(0)}`,
                );
              }),
          ),
          Effect.mapError(
            (e) =>
              new CommentaryError({
                message: 'Failed to search commentary',
                cause: e,
              }),
          ),
        );

      return {
        getCommentary,
        searchCommentary,
      };
    }),
  );

  /**
   * Default layer - alias for Live (backwards compatibility).
   */
  static Default = EGWCommentaryService.Live;

  /**
   * Test implementation with configurable mock data.
   */
  static Test = (
    config: {
      entries?: readonly CommentaryEntry[];
    } = {},
  ): Layer.Layer<EGWCommentaryService> =>
    Layer.succeed(EGWCommentaryService, {
      getCommentary: (verse) =>
        Effect.succeed({
          verse,
          entries: config.entries ?? [],
        }),
      searchCommentary: () => Effect.succeed(config.entries ?? []),
    });
}
