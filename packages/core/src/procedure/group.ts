import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/unstable/rpc';

import { BookNumber, Chapter, ChapterNumber } from '../bible/model.js';
import {
  ReadingPreferences,
  ReadingPreferencesPatch as ReadingPreferencesPatchSchema,
} from '../reading-preferences/model.js';
import {
  Page,
  PageNumber,
  Paragraph,
  ParagraphId,
  Publication,
  PublicationId,
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

export const BibleProcedureGroup = RpcGroup.make(
  RuntimeConnect,
  RuntimeEvents,
  BibleChapterGet,
  WritingsCatalogGet,
  WritingsPageGet,
  WritingsPublicationOpen,
  WritingsParagraphGet,
  ReadingPreferencesGet,
  PatchReadingPreferencesProcedure,
);

export const expectedRuntimeConnection = {
  protocolVersion: CURRENT_PROTOCOL_VERSION,
  schemaVersion: CURRENT_RUNTIME_SCHEMA_VERSION,
} as const;
