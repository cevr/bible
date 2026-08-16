import { Schema } from 'effect';
import { Rpc, RpcGroup, type RpcSchema } from 'effect/unstable/rpc';

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
import { PhraseDictionary, TopicSlug, WikiPage, WikiPageSummary } from '../wiki/model.js';
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

/**
 * Domain procedure constructor: every domain procedure in the group fails
 * with `ProcedureError` and sanitizes defects before they cross the
 * transport. New RPC families declare payload/success only; the failure
 * convention is structural, not copy-paste. `RuntimeConnect` is the one
 * procedure outside the convention (it fails with the handshake error).
 */
const procedure = <
  const Tag extends string,
  Payload extends Schema.Top | Schema.Struct.Fields,
  Success extends Schema.Top,
  const IsStream extends boolean = false,
>(
  tag: Tag,
  options: {
    readonly payload: Payload;
    readonly success: Success;
    readonly stream?: IsStream;
  },
): Rpc.Rpc<
  Tag,
  Payload extends Schema.Struct.Fields ? Schema.Struct<Payload> : Payload,
  IsStream extends true ? RpcSchema.Stream<Success, typeof ProcedureError> : Success,
  IsStream extends true ? typeof Schema.Never : typeof ProcedureError
> =>
  Rpc.make(tag, {
    ...options,
    error: ProcedureError,
    defect: sanitizedDefect,
  });

export const RuntimeConnect = Rpc.make('v1.runtime.connect', {
  payload: {
    protocolVersion: ProtocolVersion,
    schemaVersion: RuntimeSchemaVersion,
  },
  success: RuntimeConnection,
  error: IncompatibleRuntimeError,
  defect: sanitizedDefect,
});

export const RuntimeEvents = procedure('v1.runtime.events', {
  payload: { afterSequence: RuntimeEventSequence },
  success: RuntimeEvent,
  stream: true,
});

export const BibleChapterGet = procedure('v1.reading.bibleChapter.get', {
  payload: { book: BookNumber, chapter: ChapterNumber },
  success: Chapter,
});

export const BibleSearchGet = procedure('v1.reading.bibleSearch.get', {
  payload: {
    query: Schema.String,
    books: Schema.optional(Schema.Array(BookNumber)),
    offset: Schema.optional(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
    limit: Schema.optional(Schema.Int.check(Schema.isGreaterThan(0))),
  },
  success: SearchWindow,
});

export const WritingsCatalogGet = procedure('v1.reading.writingsCatalog.get', {
  payload: { author: Schema.optional(Schema.NonEmptyString) },
  success: Schema.Array(Publication),
});

export const WritingsPageGet = procedure('v1.reading.writingsPage.get', {
  payload: { publicationId: PublicationId, page: PageNumber },
  success: Page,
});

export const WritingsPublicationOpen = procedure('v1.reading.writingsPublication.open', {
  payload: { publicationId: PublicationId },
  success: Page,
});

export const WritingsParagraphGet = procedure('v1.reading.writingsParagraph.get', {
  payload: { publicationId: PublicationId, paragraphId: ParagraphId },
  success: Paragraph,
});

export const WritingsLibraryGet = procedure('v1.reading.writingsLibrary.get', {
  payload: {},
  success: Schema.Array(WritingsLibraryPublication),
});

export const WritingsPublicationDownload = procedure('v1.reading.writingsPublication.download', {
  payload: { publicationId: PublicationId },
  success: WritingsDownloadResult,
});

export const WritingsLibraryDownloadAll = procedure('v1.reading.writingsLibrary.downloadAll', {
  payload: {},
  success: Schema.Array(WritingsDownloadResult),
});

export const ReadingContinuityGet = procedure('v1.reading.continuity.get', {
  payload: {},
  success: Schema.NullOr(ReaderLocation),
});

export const ReadingContinuityRecord = procedure('v1.reading.continuity.record', {
  payload: {
    location: ReaderLocation,
    progress: Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 0, maximum: 10_000 }))),
  },
  success: MutationCommit(Schema.Struct({})),
});

export const ReadingPreferencesGet = procedure('v1.preferences.reading.get', {
  payload: {},
  success: ReadingPreferences,
});

export const PatchReadingPreferencesProcedure = procedure('v1.preferences.reading.patch', {
  payload: { patch: ReadingPreferencesPatchSchema },
  success: MutationCommit(ReadingPreferences),
});

export const LocationAnnotationsGet = procedure('v1.library.annotations.get', {
  payload: ReaderLocation.fields,
  success: LocationAnnotations,
});

export const CollectionsGet = procedure('v1.library.collections.get', {
  payload: {},
  success: Schema.Array(LibraryCollection),
});

export const ReadingPlansGet = procedure('v1.library.plans.get', {
  payload: {},
  success: Schema.Array(ReadingPlan),
});

export const MemoryPracticeGet = procedure('v1.library.practice.get', {
  payload: {},
  success: MemoryPractice,
});

export const LibraryMutate = procedure('v1.library.mutate', {
  payload: { command: LibraryMutationCommand },
  success: MutationCommit(Schema.Struct({})),
});

export const DataExport = procedure('v1.data.export', {
  payload: {},
  success: Schema.String,
});

export const DataImport = procedure('v1.data.import', {
  payload: { document: Schema.String },
  success: Schema.Struct({ imported: Schema.Int.pipe(Schema.check(Schema.isGreaterThan(0))) }),
});

export const TopicsList = procedure('v1.topics.list', {
  payload: {
    query: Schema.optional(Schema.String),
    letter: Schema.optional(Schema.String),
  },
  success: Schema.Array(TopicSummary),
});

export const TopicGet = procedure('v1.topics.get', {
  payload: { id: TopicId },
  success: TopicDetail,
});

/** The composed topic page (§2.5): authored core plus the §6.1 section lineup,
 *  assembled by the one core composer. The whole page in one round trip — the
 *  reader always wants all six sections, and per-section procedures would turn
 *  one warm batched read into six MessagePort crossings for no gain. */
export const WikiTopicGet = procedure('v1.wiki.topic.get', {
  payload: { slug: TopicSlug },
  success: WikiPage,
});

export const WikiTopicsList = procedure('v1.wiki.topics.list', {
  payload: {
    query: Schema.optional(Schema.String),
    letter: Schema.optional(Schema.String),
  },
  success: Schema.Array(WikiPageSummary),
});

/** The compiled alias table, whole. Milestone 4's matcher builds its automaton
 *  from this payload once per client; the payload ships now so the three hosts
 *  already agree on its shape when the matcher lands. */
export const WikiDictionaryGet = procedure('v1.wiki.dictionary.get', {
  payload: {},
  success: PhraseDictionary,
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
  WikiTopicGet,
  WikiTopicsList,
  WikiDictionaryGet,
);

export const expectedRuntimeConnection = {
  protocolVersion: CURRENT_PROTOCOL_VERSION,
  schemaVersion: CURRENT_RUNTIME_SCHEMA_VERSION,
};
