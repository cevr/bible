import type { LibraryEntityId, ReaderLocation } from '../library-state/index.js';
import {
  LibraryBackupDocumentFromJson,
  changeSetFor,
  commandsForLibraryBackup,
  type ChangeSet,
  type ClientId,
  type MutationEnvelope,
  type MutationId,
  MigrationSourceId,
  type DomainMutationCommand,
  type LibraryMutationCommand,
  type SyncStore,
  type SyncTransport,
  type Timestamp,
  makeSyncEngine,
} from '../local-first/index.js';
import { applyReadingPreferencesPatch } from '../reading-preferences/model.js';
import { Context, Effect, Layer, Predicate, PubSub, Ref, Schema, Stream } from 'effect';

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
  type MutationCommitValue,
} from './model.js';
import {
  DataPortabilityRuntime,
  LibraryStateRuntime,
  ProcedureRuntime,
  ReadingContinuityRuntime,
  ReadingPreferencesRuntime,
  type LibraryStateRuntimeService,
  type ProcedureRuntimeService,
  type ReadingContinuityRuntimeService,
  type ReadingPreferencesRuntimeService,
  type DataPortabilityRuntimeService,
} from './services.js';

interface LocalProcedureRuntimeService {
  readonly procedures: ProcedureRuntimeService;
  readonly preferences: ReadingPreferencesRuntimeService;
  readonly continuity: ReadingContinuityRuntimeService;
  readonly library: LibraryStateRuntimeService;
  readonly data: DataPortabilityRuntimeService;
}

class LocalProcedureRuntime extends Context.Service<
  LocalProcedureRuntime,
  LocalProcedureRuntimeService
>()('@bible/core/procedure/LocalProcedureRuntime') {}

export interface LocalProcedureRuntimeOptions {
  readonly clientId: ClientId;
  readonly store: SyncStore;
  readonly transport: SyncTransport;
  readonly generation: RuntimeGeneration;
  readonly capabilities: readonly RuntimeCapability[];
  readonly nextMutationId: () => MutationId;
  readonly nextHistoryId: () => LibraryEntityId;
  readonly nextCommitId: () => CommitId;
  readonly now: () => Timestamp;
}

const procedureFailure =
  (procedure: string) =>
  (cause: unknown): ProcedureError => {
    let code = 'UnexpectedProcedureFailure';
    let message = String(cause);
    if (Predicate.isObject(cause)) {
      const tag = cause['_tag'];
      if (Predicate.isString(tag) && tag.length > 0) code = tag;
      const detail = cause['message'];
      if (Predicate.isString(detail) && detail.length > 0) message = detail;
    }
    return ProcedureError.make({ procedure, code, message });
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
          if (Predicate.isNotUndefined(context.mutation)) {
            commitId = yield* Schema.decodeEffect(CommitId)(context.mutation.mutationId).pipe(
              Effect.orDie,
            );
          }
          yield* PubSub.publish(events, {
            _tag: 'RuntimeCommitted',
            sequence: yield* Schema.decodeEffect(RuntimeEventSequence)(nextSequence).pipe(
              Effect.orDie,
            ),
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
            IncompatibleRuntimeError.make({
              expectedProtocolVersion: CURRENT_PROTOCOL_VERSION,
              actualProtocolVersion: Schema.decodeSync(ProtocolVersion)(input.protocolVersion),
              expectedSchemaVersion: CURRENT_RUNTIME_SCHEMA_VERSION,
              actualSchemaVersion: Schema.decodeSync(RuntimeSchemaVersion)(input.schemaVersion),
            }),
          );
        }
        return Effect.succeed(
          RuntimeConnection.make({
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
          const commit: MutationCommitValue<typeof value> = {
            _tag: 'MutationCommit',
            value,
            commitId: yield* Schema.decodeEffect(CommitId)(envelope.mutationId).pipe(Effect.orDie),
            changes: { scopes: [{ _tag: 'ReadingPreferences' }] },
          };
          return commit;
        }).pipe(Effect.mapError(procedureFailure('v1.preferences.reading.patch'))),
    });

    const continuity = ReadingContinuityRuntime.of({
      get: options.store.latestReading.pipe(
        Effect.mapError(procedureFailure('v1.reading.continuity.get')),
      ),
      record: (input: { readonly location: ReaderLocation; readonly progress: number }) => {
        const command: DomainMutationCommand = {
          _tag: 'RecordReading',
          historyId: options.nextHistoryId(),
          location: input.location,
          progress: input.progress,
          readAt: options.now(),
        };
        return engine.mutate(command).pipe(
          Effect.map((envelope): MutationCommitValue<{}> => ({
            _tag: 'MutationCommit',
            value: {},
            commitId: Schema.decodeSync(CommitId)(envelope.mutationId),
            changes: changeSetFor(command),
          })),
          Effect.mapError(procedureFailure('v1.reading.continuity.record')),
        );
      },
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
          Effect.map((envelope): MutationCommitValue<{}> => ({
            _tag: 'MutationCommit',
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
          const backup = yield* Schema.decodeEffect(LibraryBackupDocumentFromJson)(document);
          const commands = commandsForLibraryBackup(backup);
          const importId = options.nextMutationId();
          const completedAt = options.now();
          yield* options.store.importLegacy({
            sourceId: yield* Schema.decodeEffect(MigrationSourceId)(
              `backup-${String(importId)}`,
            ).pipe(Effect.orDie),
            fingerprint: `backup-${String(importId)}`,
            generation: String(options.generation),
            items: commands.map((command) => ({
              mutationId: options.nextMutationId(),
              command,
              createdAt: options.now(),
            })),
            diagnostics: [],
            semanticCounts: [{ entity: 'backup-commands', count: commands.length }],
            completedAt,
          });
          yield* Effect.forEach(
            commands,
            (command) => publish(changeSetFor(command), { source: 'local' }),
            { discard: true },
          );
          return { imported: commands.length };
        }).pipe(Effect.mapError(procedureFailure('v1.data.import'))),
    });

    return LocalProcedureRuntime.of({ procedures, preferences, continuity, library, data });
  });

export const layerLocalProcedureRuntime = (
  options: LocalProcedureRuntimeOptions,
): Layer.Layer<
  | ProcedureRuntime
  | ReadingPreferencesRuntime
  | ReadingContinuityRuntime
  | LibraryStateRuntime
  | DataPortabilityRuntime
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
      ReadingContinuityRuntime,
      LocalProcedureRuntime.pipe(Effect.map((runtime) => runtime.continuity)),
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
