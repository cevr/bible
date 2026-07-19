import type { ReadingPreferences, ReadingPreferencesPatch } from '../reading-preferences/model.js';
import type {
  LibraryCollection,
  LocationAnnotations,
  MemoryPractice,
  ReaderLocation,
  ReadingPlan,
} from '../library-state/model.js';
import type { LibraryMutationCommand } from '../local-first/model.js';
import { Context, type Effect, type Stream } from 'effect';

import type {
  IncompatibleRuntimeError,
  MutationCommitValue,
  ProcedureError,
  RuntimeConnection,
  RuntimeEvent,
  RuntimeEventSequence,
} from './model.js';

export interface ProcedureRuntimeShape {
  readonly connect: (input: {
    readonly protocolVersion: number;
    readonly schemaVersion: number;
  }) => Effect.Effect<RuntimeConnection, IncompatibleRuntimeError>;
  readonly events: (input: {
    readonly afterSequence: RuntimeEventSequence;
  }) => Stream.Stream<RuntimeEvent, ProcedureError>;
}

export class ProcedureRuntime extends Context.Service<ProcedureRuntime, ProcedureRuntimeShape>()(
  '@bible/core/procedure/ProcedureRuntime',
) {}

export interface ReadingPreferencesRuntimeShape {
  readonly get: Effect.Effect<ReadingPreferences, ProcedureError>;
  readonly patch: (
    input: ReadingPreferencesPatch,
  ) => Effect.Effect<MutationCommitValue<ReadingPreferences>, ProcedureError>;
}

export class ReadingPreferencesRuntime extends Context.Service<
  ReadingPreferencesRuntime,
  ReadingPreferencesRuntimeShape
>()('@bible/core/procedure/ReadingPreferencesRuntime') {}

export interface LibraryStateRuntimeShape {
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
  LibraryStateRuntimeShape
>()('@bible/core/procedure/LibraryStateRuntime') {}
