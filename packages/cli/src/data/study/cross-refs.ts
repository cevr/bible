import type { BibleDatabaseService, CrossReference } from '@bible/core/bible-db';
import type { ClassifiedCrossReference, CrossRefType } from '@bible/core/bible-cross-refs';
import { Effect } from 'effect';

import {
  type BibleStateService,
  type CrossRefClassification,
  type UserCrossRef,
} from '../bible/state.js';

function classificationKey(book: number, chapter: number, verse: number | null): string {
  return `${book}:${chapter}:${verse ?? 0}`;
}

/**
 * CrossRefService merges bible.db cross-refs with state.db classifications and user refs.
 * Created with services owned by the initialized app runtime.
 */
export function createCrossRefService(state: BibleStateService, database: BibleDatabaseService) {
  return {
    getCrossRefs(book: number, chapter: number, verse: number): ClassifiedCrossReference[] {
      // 1. Get bible.db refs
      const rawRefs: readonly CrossReference[] = Effect.runSync(
        database.getCrossRefs(book, chapter, verse),
      );

      // 2. Build classification lookup map
      const classifications = state.getClassifications(book, chapter, verse);
      const classMap = new Map<string, CrossRefClassification>();
      for (const c of classifications) {
        classMap.set(classificationKey(c.refBook, c.refChapter, c.refVerse), c);
      }

      // 3. Enrich bible.db refs
      const enriched: ClassifiedCrossReference[] = rawRefs.map((r: CrossReference) => {
        const key = classificationKey(r.book, r.chapter, r.verse);
        const cls = classMap.get(key);
        return {
          book: r.book,
          chapter: r.chapter,
          verse: r.verse,
          verseEnd: r.verseEnd,
          source: r.source,
          previewText: r.previewText,
          classification: cls?.type ?? null,
          confidence: cls?.confidence ?? null,
        };
      });

      // 4. Append user cross-refs
      const userRefs = state.getUserCrossRefs(book, chapter, verse);
      for (const u of userRefs) {
        enriched.push({
          book: u.refBook,
          chapter: u.refChapter,
          verse: u.refVerse,
          verseEnd: u.refVerseEnd,
          source: 'user',
          previewText: null,
          classification: u.type,
          confidence: null,
          userNote: u.note,
          userRefId: u.id,
        });
      }

      return enriched;
    },

    isClassified(book: number, chapter: number, verse: number): boolean {
      return state.hasClassifications(book, chapter, verse);
    },

    saveClassifications(
      book: number,
      chapter: number,
      verse: number,
      classifications: CrossRefClassification[],
    ): void {
      state.setClassifications(book, chapter, verse, classifications);
    },

    addUserRef(
      source: { book: number; chapter: number; verse: number },
      target: { book: number; chapter: number; verse?: number; verseEnd?: number },
      options?: { type?: CrossRefType; note?: string },
    ): UserCrossRef {
      return state.addUserCrossRef(source, target, options);
    },

    /** Save a single classification for one ref (upserts) */
    saveClassification(
      book: number,
      chapter: number,
      verse: number,
      classification: CrossRefClassification,
    ): void {
      state.setClassifications(book, chapter, verse, [classification]);
    },

    removeUserRef(id: string): void {
      state.removeUserCrossRef(id);
    },
  };
}

export type CrossRefServiceInstance = ReturnType<typeof createCrossRefService>;
