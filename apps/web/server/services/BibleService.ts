/**
 * Bible Service - Re-export from core
 *
 * The unified BibleService now lives in @bible/core.
 * This file provides backwards compatibility for web server imports.
 */

export {
  BibleService,
  Book,
  Verse,
  ChapterReference,
  SearchResult,
  ChapterResponse,
  type BibleServiceShape,
} from '@bible/core/bible-service';

import { Layer } from 'effect';

import { BibleDatabase } from '@bible/core/bible-db';
import { BibleService } from '@bible/core/bible-service';

/**
 * BibleServiceLive - Composed layer with database dependency
 */
export const BibleServiceLive = BibleService.Live.pipe(Layer.provide(BibleDatabase.Live));
