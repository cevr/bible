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
  WritingsDownloadResult,
  WritingsLibraryPublication,
} from '@bible/core/writings';
import type { MutationCommitValue } from '@bible/core/procedure';
import type { TopicDetail, TopicId, TopicListInput, TopicSummary } from '@bible/core/topics';
import type { ParentProps } from 'solid-js';
import { createContext, untrack, useContext } from 'solid-js';
import { Effect } from 'effect';

import {
  createAsyncCache,
  createSyncedCache,
  defaultCacheRuntime,
  type AsyncCache,
  type CacheRuntime,
  type SyncedCache,
} from '../cache/index.js';
import type { ProcedureClient } from '../procedure/index.js';
import { refreshWritingsCatalogAfter } from './writings-cache.js';

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

export type WritingsLibraryCommand =
  | { readonly _tag: 'DownloadPublication'; readonly publicationId: PublicationId }
  | { readonly _tag: 'DownloadAll' };

type WritingsLibraryMutation = readonly WritingsDownloadResult[];

export interface PatchReadingPreferencesCommand {
  readonly patch: ReadingPreferencesPatch;
}

export interface RecordReadingCommand {
  readonly location: ReaderLocation;
  readonly progress: number;
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
  readonly writingsLibrary: SyncedCache<
    {},
    readonly WritingsLibraryPublication[],
    WritingsLibraryCommand,
    WritingsLibraryMutation
  >;
  readonly readingPreferences: SyncedCache<
    {},
    ReadingPreferences,
    PatchReadingPreferencesCommand,
    PreferencesMutation
  >;
  readonly readingContinuity: SyncedCache<
    {},
    ReaderLocation | null,
    RecordReadingCommand,
    LibraryMutation
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
  readonly topics: AsyncCache<TopicListInput, readonly TopicSummary[]>;
  readonly topicDetails: AsyncCache<{ readonly id: TopicId }, TopicDetail>;
  readonly dataPortability: {
    readonly export: () => Promise<string>;
    readonly import: (document: string) => Promise<{ readonly imported: number }>;
  };
}

export interface CreateReadingDataInput {
  readonly procedures: ProcedureClient;
  readonly runtime?: CacheRuntime<never>;
}

export const createReadingData = (input: CreateReadingDataInput): ReadingData => {
  const runtime = input.runtime ?? defaultCacheRuntime;
  const writingsCatalog = createAsyncCache({
    name: 'WritingsCatalog',
    runtime,
    emptyInput: {},
    lookup: (query: WritingsCatalogInput) =>
      input.procedures['v1.reading.writingsCatalog.get'](query),
  });
  const writingsLibraryBase = createSyncedCache({
    name: 'WritingsLibrary',
    runtime,
    emptyInput: {},
    lookup: () => input.procedures['v1.reading.writingsLibrary.get'](),
    mutate: (command: WritingsLibraryCommand) =>
      command._tag === 'DownloadPublication'
        ? input.procedures['v1.reading.writingsPublication.download']({
            publicationId: command.publicationId,
          }).pipe(Effect.map((result) => [result]))
        : input.procedures['v1.reading.writingsLibrary.downloadAll'](),
    affects: () => ['writings-library'] as const,
    matches: () => true,
  });
  const writingsLibrary: ReadingData['writingsLibrary'] = {
    ...writingsLibraryBase,
    mutate: (command) =>
      refreshWritingsCatalogAfter(writingsLibraryBase.mutate(command), () =>
        writingsCatalog.refresh(),
      ),
  };
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
    writingsCatalog,
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
    writingsLibrary,
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
    readingContinuity: createSyncedCache({
      name: 'ReadingContinuity',
      runtime,
      emptyInput: {},
      lookup: () => input.procedures['v1.reading.continuity.get'](),
      mutate: (command) => input.procedures['v1.reading.continuity.record'](command),
      affects: () => [{ _tag: 'ReadingContinuity' as const }],
      matches: (_query, scope) => scope._tag === 'ReadingContinuity',
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
    topics: createAsyncCache({
      name: 'Topics',
      runtime,
      emptyInput: {},
      lookup: (query) => input.procedures['v1.topics.list'](query),
    }),
    topicDetails: createAsyncCache({
      name: 'TopicDetail',
      runtime,
      lookup: (query) => input.procedures['v1.topics.get'](query),
    }),
    dataPortability: {
      export: () => Effect.runPromise(input.procedures['v1.data.export']()),
      import: (document) => Effect.runPromise(input.procedures['v1.data.import']({ document })),
    },
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
