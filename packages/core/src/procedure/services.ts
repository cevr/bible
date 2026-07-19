import type { ReadingPreferences, ReadingPreferencesPatch } from '../reading-preferences/model.js';
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
