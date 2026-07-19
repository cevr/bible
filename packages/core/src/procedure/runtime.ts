import {
  type ChangeSet,
  type ClientId,
  type MutationEnvelope,
  type MutationId,
  type SyncStore,
  type SyncTransport,
  type Timestamp,
  makeSyncEngine,
} from '../local-first/index.js';
import { applyReadingPreferencesPatch } from '../reading-preferences/model.js';
import { Context, Effect, Layer, PubSub, Ref, Schema, Stream } from 'effect';

import {
  CommitId,
  CURRENT_PROTOCOL_VERSION,
  CURRENT_RUNTIME_SCHEMA_VERSION,
  IncompatibleRuntimeError,
  ProcedureError,
  RuntimeConnection,
  RuntimeEventSequence,
  ProtocolVersion,
  RuntimeSchemaVersion,
  type RuntimeCapability,
  type RuntimeEvent,
  type RuntimeGeneration,
} from './model.js';
import {
  ProcedureRuntime,
  ReadingPreferencesRuntime,
  type ProcedureRuntimeShape,
  type ReadingPreferencesRuntimeShape,
} from './services.js';

interface LocalProcedureRuntimeShape {
  readonly procedures: ProcedureRuntimeShape;
  readonly preferences: ReadingPreferencesRuntimeShape;
}

class LocalProcedureRuntime extends Context.Service<
  LocalProcedureRuntime,
  LocalProcedureRuntimeShape
>()('@bible/core/procedure/LocalProcedureRuntime') {}

export interface LocalProcedureRuntimeOptions {
  readonly clientId: ClientId;
  readonly store: SyncStore;
  readonly transport: SyncTransport;
  readonly generation: RuntimeGeneration;
  readonly capabilities: readonly RuntimeCapability[];
  readonly nextMutationId: () => MutationId;
  readonly nextCommitId: () => CommitId;
  readonly now: () => Timestamp;
}

const procedureFailure =
  (procedure: string) =>
  (cause: unknown): ProcedureError => {
    let code = 'UnexpectedProcedureFailure';
    let message = String(cause);
    if (typeof cause === 'object' && cause !== null && '_tag' in cause) {
      const tag = cause['_tag'];
      if (typeof tag === 'string' && tag.length > 0) code = tag;
    }
    if (typeof cause === 'object' && cause !== null && 'message' in cause) {
      const detail = cause['message'];
      if (typeof detail === 'string' && detail.length > 0) message = detail;
    }
    return new ProcedureError({ procedure, code, message });
  };

const makeRuntime = (options: LocalProcedureRuntimeOptions) =>
  Effect.gen(function* () {
    const sequence = yield* Ref.make(0);
    const events = yield* PubSub.sliding<RuntimeEvent>({ capacity: 256, replay: 256 });

    const publish = Effect.fn('LocalProcedureRuntime.publish')(
      (
        changes: ChangeSet,
        context: { readonly source: 'local' | 'sync'; readonly mutation?: MutationEnvelope },
      ) =>
        Effect.gen(function* () {
          const nextSequence = yield* Ref.updateAndGet(sequence, (current) => current + 1);
          let commitId = options.nextCommitId();
          if (context.mutation !== undefined) {
            commitId = Schema.decodeSync(CommitId)(context.mutation.mutationId);
          }
          yield* PubSub.publish(events, {
            _tag: 'RuntimeCommitted',
            sequence: Schema.decodeSync(RuntimeEventSequence)(nextSequence),
            commitId,
            changes,
          });
        }),
    );

    const engine = makeSyncEngine({
      clientId: options.clientId,
      store: options.store,
      transport: options.transport,
      nextMutationId: options.nextMutationId,
      now: options.now,
      publish,
    });

    const procedures = ProcedureRuntime.of({
      connect: (input) => {
        if (
          input.protocolVersion !== CURRENT_PROTOCOL_VERSION ||
          input.schemaVersion !== CURRENT_RUNTIME_SCHEMA_VERSION
        ) {
          return Effect.fail(
            new IncompatibleRuntimeError({
              expectedProtocolVersion: CURRENT_PROTOCOL_VERSION,
              actualProtocolVersion: Schema.decodeSync(ProtocolVersion)(input.protocolVersion),
              expectedSchemaVersion: CURRENT_RUNTIME_SCHEMA_VERSION,
              actualSchemaVersion: Schema.decodeSync(RuntimeSchemaVersion)(input.schemaVersion),
            }),
          );
        }
        return Effect.succeed(
          new RuntimeConnection({
            protocolVersion: CURRENT_PROTOCOL_VERSION,
            schemaVersion: CURRENT_RUNTIME_SCHEMA_VERSION,
            generation: options.generation,
            capabilities: options.capabilities,
          }),
        );
      },
      events: (input) =>
        Stream.fromPubSub(events).pipe(
          Stream.filter((event) => event.sequence > input.afterSequence),
        ),
    });

    const preferences = ReadingPreferencesRuntime.of({
      get: options.store.readingPreferences.pipe(
        Effect.mapError(procedureFailure('v1.preferences.reading.get')),
      ),
      patch: (patch) =>
        Effect.gen(function* () {
          const current = yield* options.store.readingPreferences;
          const value = applyReadingPreferencesPatch(current, patch);
          const envelope = yield* engine.mutate({
            _tag: 'SetReadingPreferences',
            preferences: value,
          });
          return {
            _tag: 'MutationCommit' as const,
            value,
            commitId: Schema.decodeSync(CommitId)(envelope.mutationId),
            changes: { scopes: [{ _tag: 'ReadingPreferences' as const }] },
          };
        }).pipe(Effect.mapError(procedureFailure('v1.preferences.reading.patch'))),
    });

    return LocalProcedureRuntime.of({ procedures, preferences });
  });

export const layerLocalProcedureRuntime = (
  options: LocalProcedureRuntimeOptions,
): Layer.Layer<ProcedureRuntime | ReadingPreferencesRuntime> => {
  const base = Layer.effect(LocalProcedureRuntime, makeRuntime(options));
  return Layer.merge(
    Layer.effect(
      ProcedureRuntime,
      LocalProcedureRuntime.pipe(Effect.map((runtime) => runtime.procedures)),
    ),
    Layer.effect(
      ReadingPreferencesRuntime,
      LocalProcedureRuntime.pipe(Effect.map((runtime) => runtime.preferences)),
    ),
  ).pipe(Layer.provide(base));
};
