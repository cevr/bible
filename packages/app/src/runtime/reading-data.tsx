import type { Chapter, BookNumber, ChapterNumber, SearchWindow } from '@bible/core/bible';
import type { ReadingPreferences, ReadingPreferencesPatch } from '@bible/core/reading-preferences';
import {
  scopeForLibraryCommand,
  type LibraryCollection,
  type LibraryStateScope,
  type LocationAnnotations,
  type MemoryPractice,
  type ReaderLocation,
  type ReadingPlan,
} from '@bible/core/library-state';
import type { LibraryMutationCommand } from '@bible/core/local-first';
import type {
  Page,
  PageNumber,
  Paragraph,
  ParagraphId,
  Publication,
  PublicationId,
} from '@bible/core/writings';
import type { MutationCommitValue } from '@bible/core/procedure';
import type { ParentProps } from 'solid-js';
import { createContext, untrack, useContext } from 'solid-js';

import {
  createAsyncCache,
  createSyncedCache,
  defaultCacheRuntime,
  type AsyncCache,
  type CacheRuntime,
  type SyncedCache,
} from '../cache/index.js';
import type { ProcedureClient } from '../procedure/index.js';

export interface BibleChapterInput {
  readonly book: BookNumber;
  readonly chapter: ChapterNumber;
}

export interface BibleSearchInput {
  readonly query: string;
  readonly books?: readonly BookNumber[];
  readonly offset?: number;
  readonly limit?: number;
}

export interface WritingsCatalogInput {
  readonly author?: string;
}

export interface WritingsPageInput {
  readonly publicationId: PublicationId;
  readonly page: PageNumber;
}

export interface WritingsPublicationInput {
  readonly publicationId: PublicationId;
}

export interface WritingsParagraphInput {
  readonly publicationId: PublicationId;
  readonly paragraphId: ParagraphId;
}

export interface PatchReadingPreferencesCommand {
  readonly patch: ReadingPreferencesPatch;
}

type PreferencesMutation = MutationCommitValue<ReadingPreferences>;
type LibraryMutation = MutationCommitValue<{}>;

const scopeForMutation = (command: LibraryMutationCommand): LibraryStateScope => {
  if (command._tag === 'SaveNote') {
    return {
      _tag: 'LibraryState',
      area: 'annotations',
      location: {
        source: command.source,
        resourceId: command.resourceId,
        location: command.location,
      },
    };
  }
  if (command._tag === 'DeleteNote') return { _tag: 'LibraryState', area: 'annotations' };
  return scopeForLibraryCommand(command);
};

export interface ReadingData {
  readonly bibleChapters: AsyncCache<BibleChapterInput, Chapter>;
  readonly bibleSearch: AsyncCache<BibleSearchInput, SearchWindow>;
  readonly writingsCatalog: AsyncCache<WritingsCatalogInput, readonly Publication[]>;
  readonly writingsPages: AsyncCache<WritingsPageInput, Page>;
  readonly writingsPublications: AsyncCache<WritingsPublicationInput, Page>;
  readonly writingsParagraphs: AsyncCache<WritingsParagraphInput, Paragraph>;
  readonly readingPreferences: SyncedCache<
    {},
    ReadingPreferences,
    PatchReadingPreferencesCommand,
    PreferencesMutation
  >;
  readonly annotations: SyncedCache<
    ReaderLocation,
    LocationAnnotations,
    LibraryMutationCommand,
    LibraryMutation
  >;
  readonly collections: SyncedCache<
    {},
    readonly LibraryCollection[],
    LibraryMutationCommand,
    LibraryMutation
  >;
  readonly readingPlans: SyncedCache<
    {},
    readonly ReadingPlan[],
    LibraryMutationCommand,
    LibraryMutation
  >;
  readonly memoryPractice: SyncedCache<{}, MemoryPractice, LibraryMutationCommand, LibraryMutation>;
}

export interface CreateReadingDataInput {
  readonly procedures: ProcedureClient;
  readonly runtime?: CacheRuntime<never>;
}

export const createReadingData = (input: CreateReadingDataInput): ReadingData => {
  const runtime = input.runtime ?? defaultCacheRuntime;
  return {
    bibleChapters: createAsyncCache({
      name: 'BibleChapter',
      runtime,
      lookup: (query) => input.procedures['v1.reading.bibleChapter.get'](query),
    }),
    bibleSearch: createAsyncCache({
      name: 'BibleSearch',
      runtime,
      lookup: (query) => input.procedures['v1.reading.bibleSearch.get'](query),
    }),
    writingsCatalog: createAsyncCache({
      name: 'WritingsCatalog',
      runtime,
      emptyInput: {},
      lookup: (query) => input.procedures['v1.reading.writingsCatalog.get'](query),
    }),
    writingsPages: createAsyncCache({
      name: 'WritingsPage',
      runtime,
      lookup: (query) => input.procedures['v1.reading.writingsPage.get'](query),
    }),
    writingsPublications: createAsyncCache({
      name: 'WritingsPublication',
      runtime,
      lookup: (query) => input.procedures['v1.reading.writingsPublication.open'](query),
    }),
    writingsParagraphs: createAsyncCache({
      name: 'WritingsParagraph',
      runtime,
      lookup: (query) => input.procedures['v1.reading.writingsParagraph.get'](query),
    }),
    readingPreferences: createSyncedCache({
      name: 'ReadingPreferences',
      runtime,
      emptyInput: {},
      lookup: () => input.procedures['v1.preferences.reading.get'](),
      mutate: (command) =>
        input.procedures['v1.preferences.reading.patch']({ patch: command.patch }),
      affects: () => ['reading-preferences'] as const,
      matches: () => true,
    }),
    annotations: createSyncedCache({
      name: 'LocationAnnotations',
      runtime,
      lookup: (location) => input.procedures['v1.library.annotations.get'](location),
      mutate: (command) => input.procedures['v1.library.mutate']({ command }),
      affects: (command) => [scopeForMutation(command)],
      matches: (location, scope) => {
        if (scope.area !== 'annotations') return false;
        if (scope.location === undefined) return true;
        return (
          scope.location.source === location.source &&
          scope.location.resourceId === location.resourceId &&
          scope.location.location === location.location
        );
      },
    }),
    collections: createSyncedCache({
      name: 'Collections',
      runtime,
      emptyInput: {},
      lookup: () => input.procedures['v1.library.collections.get'](),
      mutate: (command) => input.procedures['v1.library.mutate']({ command }),
      affects: (command) => [scopeForMutation(command)],
      matches: (_query, scope) => scope.area === 'collections',
    }),
    readingPlans: createSyncedCache({
      name: 'ReadingPlans',
      runtime,
      emptyInput: {},
      lookup: () => input.procedures['v1.library.plans.get'](),
      mutate: (command) => input.procedures['v1.library.mutate']({ command }),
      affects: (command) => [scopeForMutation(command)],
      matches: (_query, scope) => scope.area === 'plans',
    }),
    memoryPractice: createSyncedCache({
      name: 'MemoryPractice',
      runtime,
      emptyInput: {},
      lookup: () => input.procedures['v1.library.practice.get'](),
      mutate: (command) => input.procedures['v1.library.mutate']({ command }),
      affects: (command) => [scopeForMutation(command)],
      matches: (_query, scope) => scope.area === 'practice',
    }),
  };
};

const ReadingDataContext = createContext<ReadingData>();

export interface ReadingDataProviderProps extends ParentProps {
  readonly procedures: ProcedureClient;
  readonly runtime?: CacheRuntime<never>;
}

export const ReadingDataProvider = (props: ReadingDataProviderProps) => {
  const data = untrack(() =>
    createReadingData({ procedures: props.procedures, runtime: props.runtime }),
  );
  return <ReadingDataContext value={data}>{props.children}</ReadingDataContext>;
};

export const useReadingData = (): ReadingData => useContext(ReadingDataContext);
