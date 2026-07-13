/**
 * Study Data Context
 *
 * Presents the study capabilities used by the Bible reader while keeping database,
 * persisted-state, and AI-classification coordination behind one local interface.
 */

import type { BibleRouteReference } from '@bible/core/app';
import type { VerseReference } from '@bible/core/bible';
import type { ClassifiedCrossReference, CrossRefType } from '@bible/core/bible-cross-refs';
import {
  BibleDatabase,
  type ConcordanceResult,
  type MarginNote,
  type StrongsEntry,
  type VerseWord,
} from '@bible/core/bible-db';
import type { LanguageModel } from 'ai';
import { Effect, Option } from 'effect';
import { createContext, useContext, type ParentProps } from 'solid-js';

import { BibleState } from '../../data/bible/state.js';
import type { UserCrossRef } from '../../data/bible/state.js';
import { classifySingleCrossRef, classifyVerseCrossRefs } from '../../data/study/classification.js';
import { createCrossRefService } from '../../data/study/cross-refs.js';
import { AI } from '../../services/ai.js';
import { useAppRuntime, type AppServices } from '../lib/index.js';

interface ClassificationModels {
  readonly high: LanguageModel;
  readonly low: LanguageModel;
}

interface CrossReferenceCapabilities {
  readonly forVerse: (reference: VerseReference) => readonly ClassifiedCrossReference[];
  readonly classifyVerse: (
    reference: VerseReference,
    models: ClassificationModels,
  ) => Promise<void>;
  readonly classify: (
    source: VerseReference,
    target: ClassifiedCrossReference,
    models: ClassificationModels,
  ) => Promise<void>;
  readonly setType: (
    source: VerseReference,
    target: ClassifiedCrossReference,
    type: CrossRefType,
  ) => void;
  readonly add: (
    source: VerseReference,
    target: BibleRouteReference,
    options?: { readonly type?: CrossRefType; readonly note?: string },
  ) => UserCrossRef;
  readonly remove: (id: string) => void;
}

interface ConcordanceCapabilities {
  readonly entry: (number: string) => StrongsEntry | undefined;
  readonly words: (reference: VerseReference) => readonly VerseWord[];
  readonly verses: (strongsNumber: string) => readonly ConcordanceResult[];
  readonly count: (strongsNumber: string) => number;
  readonly search: (query: string) => readonly StrongsEntry[];
}

interface MarginNoteCapabilities {
  readonly forVerse: (reference: VerseReference) => readonly MarginNote[];
}

interface StudyDataContextValue {
  readonly crossReferences: CrossReferenceCapabilities;
  readonly concordance: ConcordanceCapabilities;
  readonly marginNotes: MarginNoteCapabilities;
}

const StudyDataContext = createContext<StudyDataContextValue>();

export function StudyDataProvider(props: ParentProps) {
  const runtime = useAppRuntime<AppServices>();
  const services = runtime.runSync(
    Effect.gen(function* () {
      return { database: yield* BibleDatabase, state: yield* BibleState };
    }),
  );
  const crossReferences = createCrossRefService(services.state, services.database);
  const runDatabase = <A, E>(effect: Effect.Effect<A, E>): A => Effect.runSync(effect);

  const value: StudyDataContextValue = {
    crossReferences: {
      forVerse: (reference) =>
        crossReferences.getCrossRefs(reference.book, reference.chapter, reference.verse),
      classifyVerse: async (reference, models) => {
        await runtime
          .runPromise(
            classifyVerseCrossRefs(reference, crossReferences).pipe(
              Effect.provide(AI.fromModel(models)),
            ),
          )
          .then(
            () => undefined,
            () => undefined,
          );
      },
      classify: async (source, target, models) => {
        await runtime
          .runPromise(
            classifySingleCrossRef(source, target, crossReferences).pipe(
              Effect.provide(AI.fromModel(models)),
            ),
          )
          .then(
            () => undefined,
            () => undefined,
          );
      },
      setType: (source, target, type) => {
        crossReferences.saveClassification(source.book, source.chapter, source.verse, {
          refBook: target.book,
          refChapter: target.chapter,
          refVerse: target.verse,
          refVerseEnd: target.verseEnd,
          type,
          confidence: null,
          classifiedAt: Date.now(),
        });
      },
      add: (source, target, options) =>
        crossReferences.addUserRef(
          source,
          {
            book: target.book,
            chapter: target.chapter,
            verse: target._tag === 'verse' ? target.verse : undefined,
          },
          options,
        ),
      remove: (id) => crossReferences.removeUserRef(id),
    },
    concordance: {
      entry: (number) =>
        Option.getOrUndefined(runDatabase(services.database.getStrongsEntry(number))),
      words: (reference) =>
        runDatabase(
          services.database.getVerseWords(reference.book, reference.chapter, reference.verse),
        ),
      verses: (strongsNumber) => runDatabase(services.database.getVersesWithStrongs(strongsNumber)),
      count: (strongsNumber) => runDatabase(services.database.getStrongsCount(strongsNumber)),
      search: (query) => runDatabase(services.database.searchStrongs(query)),
    },
    marginNotes: {
      forVerse: (reference) =>
        runDatabase(
          services.database.getMarginNotes(reference.book, reference.chapter, reference.verse),
        ),
    },
  };

  return <StudyDataContext.Provider value={value}>{props.children}</StudyDataContext.Provider>;
}

export function useStudyData(): StudyDataContextValue {
  const context = useContext(StudyDataContext);
  if (context === undefined) {
    throw new Error('useStudyData must be used within a StudyDataProvider');
  }
  return context;
}
