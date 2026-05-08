import { BibleDatabase, type CrossReference } from '@bible/core/bible-db';
import { BunServices } from '@effect/platform-bun';
import { Effect, Layer, ManagedRuntime } from 'effect';

import {
  type BibleStateService,
  type CrossRefClassification,
  type CrossRefType,
  type UserCrossRef,
} from '../bible/state.js';

/** Enriched cross-reference with optional classification and user metadata */
export interface ClassifiedCrossReference {
  book: number;
  chapter: number;
  verse: number | null;
  verseEnd: number | null;
  source: 'openbible' | 'tske' | 'user';
  previewText: string | null;
  classification: CrossRefType | null;
  confidence: number | null;
  isUserAdded: boolean;
  userNote: string | null;
  /** UUID of user-added ref (only set when isUserAdded === true) */
  userRefId: string | null;
}

function classificationKey(book: number, chapter: number, verse: number | null): string {
  return `${book}:${chapter}:${verse ?? 0}`;
}

// Module-level runtime for BibleDatabase access
const BibleDbLayer = BibleDatabase.Default.pipe(Layer.provideMerge(BunServices.layer));
const dbRuntime = ManagedRuntime.make(BibleDbLayer);

let dbInitialized = false;
let dbInitPromise: Promise<void> | null = null;

async function ensureDbInitialized(): Promise<void> {
  if (dbInitialized) return;
  if (dbInitPromise) return dbInitPromise;
  dbInitPromise = dbRuntime
    .runPromise(
      Effect.gen(function* () {
        return yield* BibleDatabase;
      }),
    )
    .then(() => {
      dbInitialized = true;
    });
  return dbInitPromise;
}

// Initialize at module load
void ensureDbInitialized();

function runDbSync<T>(effect: Effect.Effect<T, unknown, BibleDatabase>, defaultValue: T): T {
  if (!dbInitialized) return defaultValue;
  try {
    return dbRuntime.runSync(effect);
  } catch {
    return defaultValue;
  }
}

/**
 * CrossRefService merges bible.db cross-refs with state.db classifications and user refs.
 * Created with a BibleStateService instance (from app runtime).
 */
export function createCrossRefService(state: BibleStateService) {
  return {
    getCrossRefs(book: number, chapter: number, verse: number): ClassifiedCrossReference[] {
      // 1. Get bible.db refs
      const rawRefs = runDbSync(
        Effect.gen(function* () {
          const db = yield* BibleDatabase;
          return yield* db.getCrossRefs(book, chapter, verse);
        }),
        [] as readonly CrossReference[],
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
          isUserAdded: false,
          userNote: null,
          userRefId: null,
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
          isUserAdded: true,
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
