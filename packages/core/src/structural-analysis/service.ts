/**
 * Structural Analysis Service
 *
 * Deterministic analysis service that orchestrates BibleDatabase methods
 * to gather passage-level data for structural analysis. No AI — pure data operations.
 */

import { Context, Effect, Layer, Option } from 'effect';

import { BibleDatabase } from '../bible-db/bible-database.js';
import type {
  BibleVerse,
  CrossReference,
  MarginNote,
  StrongsEntry,
  VerseWord,
} from '../bible-db/bible-database.js';
import { StructuralAnalysisError } from './error.js';
import {
  SYMBOLIC_NUMBERS,
  type PassageContext,
  type SymbolicNumber,
  type WordFrequencyEntry,
  type WordFrequencyResult,
} from './types.js';

// ============================================================================
// Service Interface
// ============================================================================

export interface StructuralAnalysisShape {
  /** Combined: verses + words + strongs + crossrefs + margin notes + word frequency */
  readonly getPassageContext: (
    book: number,
    chapter: number,
    verseStart: number,
    verseEnd: number,
  ) => Effect.Effect<PassageContext, StructuralAnalysisError>;
}

// ============================================================================
// Service Definition
// ============================================================================

export class StructuralAnalysis extends Context.Service<
  StructuralAnalysis,
  StructuralAnalysisShape
>()('@bible/core/structural-analysis/service/StructuralAnalysis') {
  static Live: Layer.Layer<StructuralAnalysis, never, BibleDatabase> = Layer.effect(
    StructuralAnalysis,
    Effect.gen(function* () {
      const db = yield* BibleDatabase;

      const getPassageWords = (
        book: number,
        chapter: number,
        verseStart: number,
        verseEnd: number,
      ): Effect.Effect<ReadonlyMap<number, readonly VerseWord[]>, StructuralAnalysisError> =>
        Effect.gen(function* () {
          const result = new Map<number, readonly VerseWord[]>();
          for (let v = verseStart; v <= verseEnd; v++) {
            const words = yield* db.getVerseWords(book, chapter, v);
            result.set(v, words);
          }
          return result;
        }).pipe(
          Effect.mapError(
            (e) =>
              new StructuralAnalysisError({
                message: 'Failed to get passage words',
                cause: e,
              }),
          ),
        );

      const computeWordFrequency = (
        wordsMap: ReadonlyMap<number, readonly VerseWord[]>,
      ): WordFrequencyResult => {
        const counts = new Map<string, number>();
        for (const words of wordsMap.values()) {
          for (const w of words) {
            const normalized = w.text.toLowerCase().replace(/[^a-z']/g, '');
            if (normalized.length > 0) {
              counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
            }
          }
        }

        const entries: WordFrequencyEntry[] = [];
        for (const [word, count] of counts) {
          let symbolicCount: SymbolicNumber | null = null;
          if ((SYMBOLIC_NUMBERS as readonly number[]).includes(count)) {
            symbolicCount = count as SymbolicNumber;
          }
          entries.push({ word, count, symbolicCount });
        }

        entries.sort((a, b) => b.count - a.count);

        return {
          entries,
          symbolicEntries: entries.filter((e) => e.symbolicCount !== null),
        };
      };

      const getWordFrequency = (
        words: ReadonlyMap<number, readonly VerseWord[]>,
      ): Effect.Effect<WordFrequencyResult> => Effect.succeed(computeWordFrequency(words));

      const getStrongsRoots = (
        strongsNumbers: readonly string[],
      ): Effect.Effect<ReadonlyMap<string, StrongsEntry>, StructuralAnalysisError> =>
        Effect.gen(function* () {
          const result = new Map<string, StrongsEntry>();
          for (const sn of strongsNumbers) {
            const entryOpt = yield* db.getStrongsEntry(sn);
            if (Option.isSome(entryOpt)) {
              result.set(sn, entryOpt.value);
            }
          }
          return result;
        }).pipe(
          Effect.mapError(
            (e) =>
              new StructuralAnalysisError({
                message: "Failed to get Strong's entries",
                cause: e,
              }),
          ),
        );

      const getPassageCrossRefs = (
        book: number,
        chapter: number,
        verseStart: number,
        verseEnd: number,
      ): Effect.Effect<ReadonlyMap<number, readonly CrossReference[]>, StructuralAnalysisError> =>
        Effect.gen(function* () {
          const result = new Map<number, readonly CrossReference[]>();
          for (let v = verseStart; v <= verseEnd; v++) {
            const refs = yield* db.getCrossRefs(book, chapter, v);
            result.set(v, refs);
          }
          return result;
        }).pipe(
          Effect.mapError(
            (e) =>
              new StructuralAnalysisError({
                message: 'Failed to get cross-references',
                cause: e,
              }),
          ),
        );

      const getPassageMarginNotes = (
        book: number,
        chapter: number,
        verseStart: number,
        verseEnd: number,
      ): Effect.Effect<ReadonlyMap<number, readonly MarginNote[]>, StructuralAnalysisError> =>
        Effect.gen(function* () {
          const result = new Map<number, readonly MarginNote[]>();
          for (let v = verseStart; v <= verseEnd; v++) {
            const notes = yield* db.getMarginNotes(book, chapter, v);
            result.set(v, notes);
          }
          return result;
        }).pipe(
          Effect.mapError(
            (e) =>
              new StructuralAnalysisError({
                message: 'Failed to get margin notes',
                cause: e,
              }),
          ),
        );

      const getPassageContext = (
        book: number,
        chapter: number,
        verseStart: number,
        verseEnd: number,
      ): Effect.Effect<PassageContext, StructuralAnalysisError> =>
        Effect.gen(function* () {
          // Get verses
          const verses: BibleVerse[] = [];
          for (let v = verseStart; v <= verseEnd; v++) {
            const verseOpt = yield* db.getVerse(book, chapter, v);
            if (Option.isSome(verseOpt)) {
              verses.push(verseOpt.value);
            }
          }

          // Get words
          const words = yield* getPassageWords(book, chapter, verseStart, verseEnd);

          // Collect unique Strong's numbers from words
          const allStrongsNumbers = new Set<string>();
          for (const verseWords of words.values()) {
            for (const w of verseWords) {
              if (w.strongsNumbers) {
                for (const sn of w.strongsNumbers) allStrongsNumbers.add(sn);
              }
            }
          }

          // Get Strong's entries
          const strongsEntries = yield* getStrongsRoots([...allStrongsNumbers]);

          // Get cross-refs
          const crossRefs = yield* getPassageCrossRefs(book, chapter, verseStart, verseEnd);

          // Get margin notes
          const marginNotes = yield* getPassageMarginNotes(book, chapter, verseStart, verseEnd);

          // Compute word frequency
          const wordFrequency = yield* getWordFrequency(words);

          return {
            book,
            chapter,
            verseStart,
            verseEnd,
            verses,
            words,
            strongsEntries,
            crossRefs,
            marginNotes,
            wordFrequency,
          };
        }).pipe(
          Effect.mapError(
            (e) =>
              new StructuralAnalysisError({
                message: 'Failed to get passage context',
                cause: e,
              }),
          ),
        );

      return {
        getPassageContext,
      };
    }),
  );

  static Default = StructuralAnalysis.Live;

  static Test = (
    config: {
      passageContext?: PassageContext;
    } = {},
  ): Layer.Layer<StructuralAnalysis> =>
    Layer.succeed(StructuralAnalysis, {
      getPassageContext: () =>
        Effect.succeed(
          config.passageContext ?? {
            book: 0,
            chapter: 0,
            verseStart: 0,
            verseEnd: 0,
            verses: [],
            words: new Map(),
            strongsEntries: new Map(),
            crossRefs: new Map(),
            marginNotes: new Map(),
            wordFrequency: { entries: [], symbolicEntries: [] },
          },
        ),
    });
}
