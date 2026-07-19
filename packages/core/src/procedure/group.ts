import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/unstable/rpc';

import { BookNumber, Chapter, ChapterNumber, SearchWindow } from '../bible/model.js';
import {
  LibraryCollection,
  LocationAnnotations,
  MemoryPractice,
  ReaderLocation,
  ReadingPlan,
} from '../library-state/model.js';
import { LibraryMutationCommand } from '../local-first/model.js';
import {
  ReadingPreferences,
  ReadingPreferencesPatch as ReadingPreferencesPatchSchema,
} from '../reading-preferences/model.js';
import { TopicDetail, TopicId, TopicSummary } from '../topics/model.js';
import {
  Page,
  PageNumber,
  Paragraph,
  ParagraphId,
  Publication,
  PublicationId,
  WritingsDownloadResult,
  WritingsLibraryPublication,
} from '../writings/model.js';
import {
  CURRENT_PROTOCOL_VERSION,
  CURRENT_RUNTIME_SCHEMA_VERSION,
  IncompatibleRuntimeError,
  MutationCommit,
  ProcedureError,
  ProtocolVersion,
  RuntimeConnection,
  RuntimeEvent,
  RuntimeEventSequence,
  RuntimeSchemaVersion,
} from './model.js';

const sanitizedDefect = Schema.Defect({ excludeCause: true });

export const RuntimeConnect = Rpc.make('v1.runtime.connect', {
  payload: {
    protocolVersion: ProtocolVersion,
    schemaVersion: RuntimeSchemaVersion,
  },
  success: RuntimeConnection,
  error: IncompatibleRuntimeError,
  defect: sanitizedDefect,
});

export const RuntimeEvents = Rpc.make('v1.runtime.events', {
  payload: { afterSequence: RuntimeEventSequence },
  success: RuntimeEvent,
  error: ProcedureError,
  defect: sanitizedDefect,
  stream: true,
});

export const BibleChapterGet = Rpc.make('v1.reading.bibleChapter.get', {
  payload: { book: BookNumber, chapter: ChapterNumber },
  success: Chapter,
  error: ProcedureError,
  defect: sanitizedDefect,
});

export const BibleSearchGet = Rpc.make('v1.reading.bibleSearch.get', {
  payload: {
    query: Schema.String,
    books: Schema.optional(Schema.Array(BookNumber)),
    offset: Schema.optional(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
    limit: Schema.optional(Schema.Int.check(Schema.isGreaterThan(0))),
  },
  success: SearchWindow,
  error: ProcedureError,
  defect: sanitizedDefect,
});

export const WritingsCatalogGet = Rpc.make('v1.reading.writingsCatalog.get', {
  payload: { author: Schema.optional(Schema.NonEmptyString) },
  success: Schema.Array(Publication),
  error: ProcedureError,
  defect: sanitizedDefect,
});

export const WritingsPageGet = Rpc.make('v1.reading.writingsPage.get', {
  payload: { publicationId: PublicationId, page: PageNumber },
  success: Page,
  error: ProcedureError,
  defect: sanitizedDefect,
});

export const WritingsPublicationOpen = Rpc.make('v1.reading.writingsPublication.open', {
  payload: { publicationId: PublicationId },
  success: Page,
  error: ProcedureError,
  defect: sanitizedDefect,
});

export const WritingsParagraphGet = Rpc.make('v1.reading.writingsParagraph.get', {
  payload: { publicationId: PublicationId, paragraphId: ParagraphId },
  success: Paragraph,
  error: ProcedureError,
  defect: sanitizedDefect,
});

export const WritingsLibraryGet = Rpc.make('v1.reading.writingsLibrary.get', {
  payload: {},
  success: Schema.Array(WritingsLibraryPublication),
  error: ProcedureError,
  defect: sanitizedDefect,
});

export const WritingsPublicationDownload = Rpc.make('v1.reading.writingsPublication.download', {
  payload: { publicationId: PublicationId },
  success: WritingsDownloadResult,
  error: ProcedureError,
  defect: sanitizedDefect,
});

export const WritingsLibraryDownloadAll = Rpc.make('v1.reading.writingsLibrary.downloadAll', {
  payload: {},
  success: Schema.Array(WritingsDownloadResult),
  error: ProcedureError,
  defect: sanitizedDefect,
});

export const ReadingContinuityGet = Rpc.make('v1.reading.continuity.get', {
  payload: {},
  success: Schema.NullOr(ReaderLocation),
  error: ProcedureError,
  defect: sanitizedDefect,
});

export const ReadingContinuityRecord = Rpc.make('v1.reading.continuity.record', {
  payload: {
    location: ReaderLocation,
    progress: Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 0, maximum: 10_000 }))),
  },
  success: MutationCommit(Schema.Struct({})),
  error: ProcedureError,
  defect: sanitizedDefect,
});

export const ReadingPreferencesGet = Rpc.make('v1.preferences.reading.get', {
  payload: {},
  success: ReadingPreferences,
  error: ProcedureError,
  defect: sanitizedDefect,
});

export const PatchReadingPreferencesProcedure = Rpc.make('v1.preferences.reading.patch', {
  payload: { patch: ReadingPreferencesPatchSchema },
  success: MutationCommit(ReadingPreferences),
  error: ProcedureError,
  defect: sanitizedDefect,
});

export const LocationAnnotationsGet = Rpc.make('v1.library.annotations.get', {
  payload: ReaderLocation.fields,
  success: LocationAnnotations,
  error: ProcedureError,
  defect: sanitizedDefect,
});

export const CollectionsGet = Rpc.make('v1.library.collections.get', {
  payload: {},
  success: Schema.Array(LibraryCollection),
  error: ProcedureError,
  defect: sanitizedDefect,
});

export const ReadingPlansGet = Rpc.make('v1.library.plans.get', {
  payload: {},
  success: Schema.Array(ReadingPlan),
  error: ProcedureError,
  defect: sanitizedDefect,
});

export const MemoryPracticeGet = Rpc.make('v1.library.practice.get', {
  payload: {},
  success: MemoryPractice,
  error: ProcedureError,
  defect: sanitizedDefect,
});

export const LibraryMutate = Rpc.make('v1.library.mutate', {
  payload: { command: LibraryMutationCommand },
  success: MutationCommit(Schema.Struct({})),
  error: ProcedureError,
  defect: sanitizedDefect,
});

export const DataExport = Rpc.make('v1.data.export', {
  payload: {},
  success: Schema.String,
  error: ProcedureError,
  defect: sanitizedDefect,
});

export const DataImport = Rpc.make('v1.data.import', {
  payload: { document: Schema.String },
  success: Schema.Struct({ imported: Schema.Int.pipe(Schema.check(Schema.isGreaterThan(0))) }),
  error: ProcedureError,
  defect: sanitizedDefect,
});

export const TopicsList = Rpc.make('v1.topics.list', {
  payload: {
    query: Schema.optional(Schema.String),
    letter: Schema.optional(Schema.String),
  },
  success: Schema.Array(TopicSummary),
  error: ProcedureError,
  defect: sanitizedDefect,
});

export const TopicGet = Rpc.make('v1.topics.get', {
  payload: { id: TopicId },
  success: TopicDetail,
  error: ProcedureError,
  defect: sanitizedDefect,
});

export const BibleProcedureGroup = RpcGroup.make(
  RuntimeConnect,
  RuntimeEvents,
  BibleChapterGet,
  BibleSearchGet,
  WritingsCatalogGet,
  WritingsPageGet,
  WritingsPublicationOpen,
  WritingsParagraphGet,
  WritingsLibraryGet,
  WritingsPublicationDownload,
  WritingsLibraryDownloadAll,
  ReadingContinuityGet,
  ReadingContinuityRecord,
  ReadingPreferencesGet,
  PatchReadingPreferencesProcedure,
  LocationAnnotationsGet,
  CollectionsGet,
  ReadingPlansGet,
  MemoryPracticeGet,
  LibraryMutate,
  DataExport,
  DataImport,
  TopicsList,
  TopicGet,
);

export const expectedRuntimeConnection = {
  protocolVersion: CURRENT_PROTOCOL_VERSION,
  schemaVersion: CURRENT_RUNTIME_SCHEMA_VERSION,
} as const;
