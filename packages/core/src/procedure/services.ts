import type { ReadingPreferences, ReadingPreferencesPatch } from '../reading-preferences/model.js';
import type {
  LibraryCollection,
  LocationAnnotations,
  MemoryPractice,
  ReaderLocation,
  ReadingPlan,
} from '../library-state/model.js';
import type {
  PublicationId,
  WritingsDownloadResult,
  WritingsLibraryPublication,
} from '../writings/model.js';
import type { LibraryMutationCommand } from '../local-first/model.js';
import { Context, type Effect, type Option, type Stream } from 'effect';

import type {
  IncompatibleRuntimeError,
  MutationCommitValue,
  ProcedureError,
  RuntimeConnection,
  RuntimeEvent,
  RuntimeEventSequence,
} from './model.js';

export interface ProcedureRuntimeService {
  readonly connect: (input: {
    readonly protocolVersion: number;
    readonly schemaVersion: number;
  }) => Effect.Effect<RuntimeConnection, IncompatibleRuntimeError>;
  readonly events: (input: {
    readonly afterSequence: RuntimeEventSequence;
  }) => Stream.Stream<RuntimeEvent, ProcedureError>;
}

export class ProcedureRuntime extends Context.Service<ProcedureRuntime, ProcedureRuntimeService>()(
  '@bible/core/procedure/ProcedureRuntime',
) {}

export interface ReadingPreferencesRuntimeService {
  readonly get: Effect.Effect<ReadingPreferences, ProcedureError>;
  readonly patch: (
    input: ReadingPreferencesPatch,
  ) => Effect.Effect<MutationCommitValue<ReadingPreferences>, ProcedureError>;
}

export class ReadingPreferencesRuntime extends Context.Service<
  ReadingPreferencesRuntime,
  ReadingPreferencesRuntimeService
>()('@bible/core/procedure/ReadingPreferencesRuntime') {}

export interface ReadingContinuityRuntimeService {
  readonly get: Effect.Effect<Option.Option<ReaderLocation>, ProcedureError>;
  readonly record: (input: {
    readonly location: ReaderLocation;
    readonly progress: number;
  }) => Effect.Effect<MutationCommitValue<{}>, ProcedureError>;
}

export class ReadingContinuityRuntime extends Context.Service<
  ReadingContinuityRuntime,
  ReadingContinuityRuntimeService
>()('@bible/core/procedure/ReadingContinuityRuntime') {}

export interface LibraryStateRuntimeService {
  readonly annotations: (
    input: ReaderLocation,
  ) => Effect.Effect<LocationAnnotations, ProcedureError>;
  readonly collections: Effect.Effect<ReadonlyArray<LibraryCollection>, ProcedureError>;
  readonly readingPlans: Effect.Effect<ReadonlyArray<ReadingPlan>, ProcedureError>;
  readonly memoryPractice: Effect.Effect<MemoryPractice, ProcedureError>;
  readonly mutate: (
    command: LibraryMutationCommand,
  ) => Effect.Effect<MutationCommitValue<{}>, ProcedureError>;
}

export class LibraryStateRuntime extends Context.Service<
  LibraryStateRuntime,
  LibraryStateRuntimeService
>()('@bible/core/procedure/LibraryStateRuntime') {}

export interface WritingsLibraryRuntimeService {
  readonly get: Effect.Effect<ReadonlyArray<WritingsLibraryPublication>, ProcedureError>;
  readonly download: (
    publicationId: PublicationId,
  ) => Effect.Effect<WritingsDownloadResult, ProcedureError>;
  readonly downloadAll: Effect.Effect<ReadonlyArray<WritingsDownloadResult>, ProcedureError>;
}

export class WritingsLibraryRuntime extends Context.Service<
  WritingsLibraryRuntime,
  WritingsLibraryRuntimeService
>()('@bible/core/procedure/WritingsLibraryRuntime') {}

export interface DataPortabilityRuntimeService {
  readonly export: Effect.Effect<string, ProcedureError>;
  readonly import: (
    document: string,
  ) => Effect.Effect<{ readonly imported: number }, ProcedureError>;
}

export class DataPortabilityRuntime extends Context.Service<
  DataPortabilityRuntime,
  DataPortabilityRuntimeService
>()('@bible/core/procedure/DataPortabilityRuntime') {}
