import {
  LibraryBackupDocumentFromJson,
  changeSetFor,
  commandsForLibraryBackup,
  type ChangeSet,
  type ClientId,
  type MutationEnvelope,
  type MutationId,
  type LibraryMutationCommand,
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
  DataPortabilityRuntime,
  LibraryStateRuntime,
  ProcedureRuntime,
  ReadingPreferencesRuntime,
  type LibraryStateRuntimeShape,
  type ProcedureRuntimeShape,
  type ReadingPreferencesRuntimeShape,
  type DataPortabilityRuntimeShape,
} from './services.js';

interface LocalProcedureRuntimeShape {
  readonly procedures: ProcedureRuntimeShape;
  readonly preferences: ReadingPreferencesRuntimeShape;
  readonly library: LibraryStateRuntimeShape;
  readonly data: DataPortabilityRuntimeShape;
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

    const library = LibraryStateRuntime.of({
      annotations: (input) =>
        options.store
          .annotations(input)
          .pipe(Effect.mapError(procedureFailure('v1.library.annotations.get'))),
      collections: options.store.collections.pipe(
        Effect.mapError(procedureFailure('v1.library.collections.get')),
      ),
      readingPlans: options.store.readingPlans.pipe(
        Effect.mapError(procedureFailure('v1.library.plans.get')),
      ),
      memoryPractice: options.store.memoryPractice.pipe(
        Effect.mapError(procedureFailure('v1.library.practice.get')),
      ),
      mutate: (command: LibraryMutationCommand) =>
        engine.mutate(command).pipe(
          Effect.map((envelope) => ({
            _tag: 'MutationCommit' as const,
            value: {},
            commitId: Schema.decodeSync(CommitId)(envelope.mutationId),
            changes: changeSetFor(command),
          })),
          Effect.mapError(procedureFailure('v1.library.mutate')),
        ),
    });

    const data = DataPortabilityRuntime.of({
      export: options.store
        .libraryBackup(options.now())
        .pipe(
          Effect.flatMap(Schema.encodeEffect(LibraryBackupDocumentFromJson)),
          Effect.mapError(procedureFailure('v1.data.export')),
        ),
      import: (document) =>
        Effect.gen(function* () {
          const backup = yield* Schema.decodeUnknownEffect(LibraryBackupDocumentFromJson)(document);
          const commands = commandsForLibraryBackup(backup);
          yield* Effect.forEach(commands, (command) => engine.mutate(command), { discard: true });
          return { imported: commands.length };
        }).pipe(Effect.mapError(procedureFailure('v1.data.import'))),
    });

    return LocalProcedureRuntime.of({ procedures, preferences, library, data });
  });

export const layerLocalProcedureRuntime = (
  options: LocalProcedureRuntimeOptions,
): Layer.Layer<
  ProcedureRuntime | ReadingPreferencesRuntime | LibraryStateRuntime | DataPortabilityRuntime
> => {
  const base = Layer.effect(LocalProcedureRuntime, makeRuntime(options));
  return Layer.mergeAll(
    Layer.effect(
      ProcedureRuntime,
      LocalProcedureRuntime.pipe(Effect.map((runtime) => runtime.procedures)),
    ),
    Layer.effect(
      ReadingPreferencesRuntime,
      LocalProcedureRuntime.pipe(Effect.map((runtime) => runtime.preferences)),
    ),
    Layer.effect(
      LibraryStateRuntime,
      LocalProcedureRuntime.pipe(Effect.map((runtime) => runtime.library)),
    ),
    Layer.effect(
      DataPortabilityRuntime,
      LocalProcedureRuntime.pipe(Effect.map((runtime) => runtime.data)),
    ),
  ).pipe(Layer.provide(base));
};
