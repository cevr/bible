// @effect-diagnostics strictBooleanExpressions:off anyUnknownInErrorContext:off
/**
 * Study Data Context
 *
 * Provides access to cross-references, Strong's concordance, and margin notes.
 * Uses BibleDatabase from @bible/core for unified data access.
 */

import type { LanguageModel } from 'ai';
import {
  BibleDatabase,
  type CrossReference,
  type StrongsEntry,
  type VerseWord,
  type MarginNote,
  type ConcordanceResult,
} from '@bible/core/bible-db';
import { BunServices } from '@effect/platform-bun';
import { Effect, Layer, ManagedRuntime, Option } from 'effect';
import { createContext, useContext, type ParentProps } from 'solid-js';

import { BibleState } from '../../data/bible/state.js';
import type { CrossRefType, UserCrossRef } from '../../data/bible/state.js';
import {
  createCrossRefService,
  type ClassifiedCrossReference,
  type CrossRefServiceInstance,
} from '../../data/study/cross-refs.js';
import { classifySingleCrossRef, classifyVerseCrossRefs } from '../../data/study/classification.js';
import { appRuntime } from '../lib/app-runtime.js';

// Re-export types from BibleDatabase for consumers
export type {
  ClassifiedCrossReference,
  ConcordanceResult,
  CrossReference,
  MarginNote,
  StrongsEntry,
  VerseWord,
};

// WordWithStrongs is used by word-mode and verse.tsx
// It's a simplified version of VerseWord
export interface WordWithStrongs {
  text: string;
  strongs?: string[];
}

// Type for Strong's entry (aligned with study-db types for backwards compat)
export interface StrongsEntryCompat {
  number: string;
  lemma: string;
  xlit: string;
  pron?: string;
  def: string;
  kjvDef?: string;
}

// Type for concordance result
export interface ConcordanceResultCompat {
  book: number;
  chapter: number;
  verse: number;
  word: string;
}

// Type for margin note
export interface MarginNoteCompat {
  type: 'hebrew' | 'greek' | 'alternate' | 'name' | 'other';
  phrase: string;
  text: string;
}

// Create combined layer with all dependencies
const BibleServicesLayer = BibleDatabase.Default.pipe(Layer.provideMerge(BunServices.layer));

// Create ManagedRuntime
const runtime = ManagedRuntime.make(BibleServicesLayer);

// Module-level flag to track initialization
let initialized = false;

// Initialization promise
let initPromise: Promise<void> | null = null;

async function ensureInitialized(): Promise<void> {
  if (initialized) return;
  if (initPromise) return initPromise;

  initPromise = runtime
    .runPromise(
      Effect.gen(function* () {
        // Just access the database to trigger initialization
        const db = yield* BibleDatabase;
        yield* db.getBooks();
      }),
    )
    .then(() => {
      initialized = true;
    });

  return initPromise;
}

// Helper to run an effect synchronously if possible
function runSync<T>(effect: Effect.Effect<T, unknown, BibleDatabase>, defaultValue: T): T {
  if (!initialized) return defaultValue;
  try {
    return runtime.runSync(effect);
  } catch {
    return defaultValue;
  }
}

interface StudyDataContextValue {
  /** Whether the database is still loading */
  isLoading: () => boolean;

  /** Error from database initialization (if any) */
  error: () => Error | undefined;

  /** Get enriched cross-references for a verse (returns empty array if not ready) */
  getCrossRefs: (book: number, chapter: number, verse: number) => ClassifiedCrossReference[];

  /** Whether a verse's cross-refs have been classified */
  isClassified: (book: number, chapter: number, verse: number) => boolean;

  /** Classify all unclassified cross-refs for a verse using AI (batch) */
  classifyVerse: (
    book: number,
    chapter: number,
    verse: number,
    models: { high: LanguageModel; low: LanguageModel },
  ) => Promise<void>;

  /** Classify a single cross-ref using AI */
  classifyRef: (
    source: { book: number; chapter: number; verse: number },
    target: ClassifiedCrossReference,
    models: { high: LanguageModel; low: LanguageModel },
  ) => Promise<void>;

  /** Manually set the type on a cross-ref */
  setRefType: (
    source: { book: number; chapter: number; verse: number },
    target: ClassifiedCrossReference,
    type: CrossRefType,
  ) => void;

  /** Add a user cross-reference */
  addUserCrossRef: (
    source: { book: number; chapter: number; verse: number },
    target: { book: number; chapter: number; verse?: number; verseEnd?: number },
    options?: { type?: CrossRefType; note?: string },
  ) => UserCrossRef;

  /** Remove a user cross-reference */
  removeUserCrossRef: (id: string) => void;

  /** Get Strong's entry (returns null if not ready) */
  getStrongsEntry: (number: string) => StrongsEntryCompat | null;

  /** Get words with Strong's numbers for a verse (returns empty array if not ready) */
  getVerseWords: (book: number, chapter: number, verse: number) => WordWithStrongs[];

  /** Get margin notes for a verse (returns empty array if not ready) */
  getMarginNotes: (book: number, chapter: number, verse: number) => MarginNoteCompat[];

  /** Search for all verses containing a Strong's number */
  searchByStrongs: (strongsNumber: string) => ConcordanceResultCompat[];

  /** Get the count of occurrences for a Strong's number */
  getStrongsOccurrenceCount: (strongsNumber: string) => number;

  /** Search Strong's entries by definition */
  searchStrongsByDefinition: (query: string) => StrongsEntryCompat[];
}

const StudyDataContext = createContext<StudyDataContextValue>();

// Initialize the database at module load time
ensureInitialized();

export function StudyDataProvider(props: ParentProps) {
  // Lazy cross-ref service (needs BibleState from bible context)
  let crossRefSvc: CrossRefServiceInstance | null = null;
  function getCrossRefSvc(): CrossRefServiceInstance | null {
    if (crossRefSvc !== null) return crossRefSvc;
    try {
      // Get BibleState from the app runtime (available after BibleProvider mounts)
      const state = appRuntime.runSync(
        Effect.gen(function* () {
          return yield* BibleState;
        }),
      );
      crossRefSvc = createCrossRefService(state);
      return crossRefSvc;
    } catch {
      return null;
    }
  }

  // Wrap database methods to handle loading state
  const getCrossRefs = (
    book: number,
    chapter: number,
    verse: number,
  ): ClassifiedCrossReference[] => {
    const svc = getCrossRefSvc();
    if (svc !== null) {
      return svc.getCrossRefs(book, chapter, verse);
    }
    // Fallback: raw refs without classifications
    return runSync(
      Effect.gen(function* () {
        const db = yield* BibleDatabase;
        const refs = yield* db.getCrossRefs(book, chapter, verse);
        return refs.map(
          (r: CrossReference): ClassifiedCrossReference => ({
            book: r.book,
            chapter: r.chapter,
            verse: r.verse,
            verseEnd: r.verseEnd,
            source: r.source,
            previewText: r.previewText,
            classification: null,
            confidence: null,
            isUserAdded: false,
            userNote: null,
            userRefId: null,
          }),
        );
      }),
      [],
    );
  };

  const getStrongsEntry = (number: string): StrongsEntryCompat | null =>
    runSync(
      Effect.gen(function* () {
        const db = yield* BibleDatabase;
        const opt = yield* db.getStrongsEntry(number);
        return Option.match(opt, {
          onNone: () => null,
          onSome: (e: StrongsEntry) => ({
            number: e.number,
            lemma: e.lemma,
            xlit: e.transliteration ?? '',
            pron: e.pronunciation ?? undefined,
            def: e.definition,
            kjvDef: e.kjvDefinition ?? undefined,
          }),
        });
      }),
      null,
    );

  const getVerseWords = (book: number, chapter: number, verse: number): WordWithStrongs[] =>
    runSync(
      Effect.gen(function* () {
        const db = yield* BibleDatabase;
        const words = yield* db.getVerseWords(book, chapter, verse);
        return words.map((w: VerseWord) => ({
          text: w.text,
          strongs: w.strongsNumbers ?? undefined,
        }));
      }),
      [],
    );

  const getMarginNotes = (book: number, chapter: number, verse: number): MarginNoteCompat[] =>
    runSync(
      Effect.gen(function* () {
        const db = yield* BibleDatabase;
        const notes = yield* db.getMarginNotes(book, chapter, verse);
        return notes.map((n: MarginNote) => ({
          type: n.type,
          phrase: n.phrase,
          text: n.text,
        }));
      }),
      [],
    );

  const searchByStrongs = (strongsNumber: string): ConcordanceResultCompat[] =>
    runSync(
      Effect.gen(function* () {
        const db = yield* BibleDatabase;
        const results = yield* db.getVersesWithStrongs(strongsNumber);
        return results.map((r: ConcordanceResult) => ({
          book: r.book,
          chapter: r.chapter,
          verse: r.verse,
          word: r.word ?? '',
        }));
      }),
      [],
    );

  const getStrongsOccurrenceCount = (strongsNumber: string): number =>
    runSync(
      Effect.gen(function* () {
        const db = yield* BibleDatabase;
        return yield* db.getStrongsCount(strongsNumber);
      }),
      0,
    );

  const searchStrongsByDefinition = (query: string): StrongsEntryCompat[] =>
    runSync(
      Effect.gen(function* () {
        const db = yield* BibleDatabase;
        const entries = yield* db.searchStrongs(query);
        return entries.map((e: StrongsEntry) => ({
          number: e.number,
          lemma: e.lemma,
          xlit: e.transliteration ?? '',
          pron: e.pronunciation ?? undefined,
          def: e.definition,
          kjvDef: e.kjvDefinition ?? undefined,
        }));
      }),
      [],
    );

  const isClassified = (book: number, chapter: number, verse: number): boolean => {
    const svc = getCrossRefSvc();
    return svc !== null ? svc.isClassified(book, chapter, verse) : false;
  };

  const classifyVerse = async (
    book: number,
    chapter: number,
    verse: number,
    models: { high: LanguageModel; low: LanguageModel },
  ): Promise<void> => {
    const svc = getCrossRefSvc();
    if (svc === null) return;
    try {
      await classifyVerseCrossRefs(book, chapter, verse, svc, models);
    } catch {
      // AI not available — silently fail
    }
  };

  const classifyRef = async (
    source: { book: number; chapter: number; verse: number },
    target: ClassifiedCrossReference,
    models: { high: LanguageModel; low: LanguageModel },
  ): Promise<void> => {
    const svc = getCrossRefSvc();
    if (svc === null) return;
    try {
      await classifySingleCrossRef(source, target, svc, models);
    } catch {
      // AI not available — silently fail
    }
  };

  const setRefType = (
    source: { book: number; chapter: number; verse: number },
    target: ClassifiedCrossReference,
    type: CrossRefType,
  ): void => {
    const svc = getCrossRefSvc();
    if (svc === null) return;
    svc.saveClassification(source.book, source.chapter, source.verse, {
      refBook: target.book,
      refChapter: target.chapter,
      refVerse: target.verse,
      refVerseEnd: target.verseEnd,
      type,
      confidence: null,
      classifiedAt: Date.now(),
    });
  };

  const addUserCrossRef = (
    source: { book: number; chapter: number; verse: number },
    target: { book: number; chapter: number; verse?: number; verseEnd?: number },
    options?: { type?: CrossRefType; note?: string },
  ): UserCrossRef => {
    const svc = getCrossRefSvc();
    if (svc === null) {
      throw new Error('CrossRefService not initialized');
    }
    return svc.addUserRef(source, target, options);
  };

  const removeUserCrossRef = (id: string): void => {
    const svc = getCrossRefSvc();
    if (svc !== null) {
      svc.removeUserRef(id);
    }
  };

  const value: StudyDataContextValue = {
    isLoading: () => !initialized,
    error: () => undefined,
    getCrossRefs,
    isClassified,
    classifyVerse,
    classifyRef,
    setRefType,
    addUserCrossRef,
    removeUserCrossRef,
    getStrongsEntry,
    getVerseWords,
    getMarginNotes,
    searchByStrongs,
    getStrongsOccurrenceCount,
    searchStrongsByDefinition,
  };

  return <StudyDataContext.Provider value={value}>{props.children}</StudyDataContext.Provider>;
}

export function useStudyData(): StudyDataContextValue {
  const ctx = useContext(StudyDataContext);
  if (!ctx) {
    throw new Error('useStudyData must be used within a StudyDataProvider');
  }
  return ctx;
}
