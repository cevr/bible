import { and, eq, isNull } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import { Effect, Schema } from 'effect';

import { DEFAULT_READING_PREFERENCES, ReadingPreferences } from '../reading-preferences/model.js';

import type { SqliteEffectBridgeShape } from './database.js';
import {
  changeSetFor,
  CURRENT_SCHEMA_VERSION,
  MutationEnvelope,
  MutationSequence,
  ServerRevision,
  Timestamp,
  type ChangeSet,
  type ChangeScope,
  type ClientId,
  type DomainMutationCommand,
  type MutationId,
  type RevisionPatch,
} from './model.js';
import {
  mutationJournal,
  notes,
  preferences as preferenceRows,
  serverRevisions,
  syncClients,
  tombstones,
  type UserStateSchema,
} from './schema.js';
import {
  StaleRevisionError,
  type SyncStore,
  SyncStoreError,
  type LocalMutationInput,
} from './sync-store.js';

const messageOf = (cause: unknown): string => {
  if (cause instanceof Error) return cause.message;
  return String(cause);
};

const mapStoreError = (operation: string) => (cause: unknown) =>
  new SyncStoreError({ operation, message: messageOf(cause), cause });

const decodeEnvelope = Schema.decodeUnknownSync(MutationEnvelope);

type ResultKind = 'sync' | 'async';
type MaybePromise<A> = A | PromiseLike<A>;

export interface DrizzleUserDatabase<TResultKind extends ResultKind, TRunResult> {
  readonly drizzle: BaseSQLiteDatabase<TResultKind, TRunResult, UserStateSchema>;
  readonly bridge: SqliteEffectBridgeShape;
}

const isPromiseLike = <A>(value: MaybePromise<A>): value is PromiseLike<A> =>
  typeof value === 'object' &&
  value !== null &&
  'then' in value &&
  typeof value.then === 'function';

const flatMap = <A, B>(
  value: MaybePromise<A>,
  continuation: (value: A) => MaybePromise<B>,
): MaybePromise<B> => {
  if (isPromiseLike(value)) {
    return value.then(continuation);
  }
  return continuation(value);
};

const asVoid = <A>(value: MaybePromise<A>): MaybePromise<void> => flatMap(value, () => undefined);

type Operation = () => MaybePromise<unknown>;

const runThen = <A>(
  operations: ReadonlyArray<Operation>,
  done: () => MaybePromise<A>,
  index = 0,
): MaybePromise<A> => {
  const operation = operations[index];
  if (operation === undefined) return done();
  return flatMap(operation(), () => runThen(operations, done, index + 1));
};

const applyCommand = <TResultKind extends ResultKind, TRunResult>(
  database: DrizzleUserDatabase<TResultKind, TRunResult>,
  command: DomainMutationCommand,
  createdAt: Timestamp,
  mutationId: MutationId,
  serverRevision?: ServerRevision,
): MaybePromise<void> => {
  if (command._tag === 'SetReadingPreferences') {
    return asVoid(
      database.drizzle
        .insert(preferenceRows)
        .values({
          key: 'reading',
          value: command.preferences,
          createdAt,
          updatedAt: createdAt,
          deletedAt: null,
        })
        .onConflictDoUpdate({
          target: preferenceRows.key,
          set: {
            value: command.preferences,
            updatedAt: createdAt,
            deletedAt: null,
          },
        })
        .run(),
    );
  }

  if (command._tag === 'SaveNote') {
    return asVoid(
      runThen(
        [
          () =>
            database.drizzle
              .insert(notes)
              .values({
                id: command.noteId,
                source: command.source,
                resourceId: command.resourceId,
                location: command.location,
                content: command.content,
                createdAt,
                updatedAt: createdAt,
                deletedAt: null,
              })
              .onConflictDoUpdate({
                target: notes.id,
                set: {
                  source: command.source,
                  resourceId: command.resourceId,
                  location: command.location,
                  content: command.content,
                  updatedAt: createdAt,
                  deletedAt: null,
                },
              })
              .run(),
          () =>
            database.drizzle
              .delete(tombstones)
              .where(
                and(eq(tombstones.entityType, 'note'), eq(tombstones.entityId, command.noteId)),
              )
              .run(),
        ],
        () => undefined,
      ),
    );
  }

  return asVoid(
    runThen(
      [
        () =>
          database.drizzle
            .update(notes)
            .set({ deletedAt: createdAt, updatedAt: createdAt })
            .where(eq(notes.id, command.noteId))
            .run(),
        () =>
          database.drizzle
            .insert(tombstones)
            .values({
              entityType: 'note',
              entityId: command.noteId,
              deletedByMutationId: mutationId,
              serverRevision,
              deletedAt: createdAt,
            })
            .onConflictDoUpdate({
              target: [tombstones.entityType, tombstones.entityId],
              set: {
                deletedByMutationId: mutationId,
                serverRevision,
                deletedAt: createdAt,
              },
            })
            .run(),
      ],
      () => undefined,
    ),
  );
};

const clientRow = <TResultKind extends ResultKind, TRunResult>(
  database: DrizzleUserDatabase<TResultKind, TRunResult>,
  clientId: ClientId,
) => database.drizzle.select().from(syncClients).where(eq(syncClients.clientId, clientId)).get();

export const makeDrizzleSyncStore = <TResultKind extends ResultKind, TRunResult>(
  database: DrizzleUserDatabase<TResultKind, TRunResult>,
  localClientId: ClientId,
): SyncStore => {
  const ensureClient = (createdAt: Timestamp): MaybePromise<void> =>
    flatMap(clientRow(database, localClientId), (client) => {
      if (client !== undefined) return undefined;
      return asVoid(
        database.drizzle
          .insert(syncClients)
          .values({ clientId: localClientId, createdAt, updatedAt: createdAt })
          .run(),
      );
    });

  const mutate = Effect.fn('DrizzleSyncStore.mutate')((input: LocalMutationInput) =>
    database.bridge
      .transaction(() =>
        flatMap(ensureClient(input.createdAt), () =>
          flatMap(clientRow(database, localClientId), (client) => {
            if (client === undefined) return undefined;
            const sequence = Schema.decodeSync(MutationSequence)(client.nextSequence);
            const envelope = decodeEnvelope({
              clientId: input.clientId,
              sequence,
              mutationId: input.mutationId,
              schemaVersion: CURRENT_SCHEMA_VERSION,
              command: input.command,
              createdAt: input.createdAt,
            });

            return runThen(
              [
                () => applyCommand(database, input.command, input.createdAt, input.mutationId),
                () =>
                  database.drizzle
                    .insert(mutationJournal)
                    .values({
                      mutationId: envelope.mutationId,
                      clientId: envelope.clientId,
                      sequence: envelope.sequence,
                      schemaVersion: envelope.schemaVersion,
                      command: envelope.command,
                      createdAt: envelope.createdAt,
                    })
                    .run(),
                () =>
                  database.drizzle
                    .update(syncClients)
                    .set({ nextSequence: sequence + 1, updatedAt: input.createdAt })
                    .where(eq(syncClients.clientId, localClientId))
                    .run(),
              ],
              () => ({ envelope, changes: changeSetFor(input.command) }),
            );
          }),
        ),
      )
      .pipe(
        Effect.mapError(mapStoreError('mutate')),
        Effect.flatMap((result) => {
          if (result !== undefined) return Effect.succeed(result);
          return Effect.fail(
            new SyncStoreError({
              operation: 'mutate',
              message: 'sync client was not created',
            }),
          );
        }),
      ),
  );

  const pending = database.bridge
    .all({
      execute: () =>
        flatMap(
          database.drizzle
            .select()
            .from(mutationJournal)
            .where(eq(mutationJournal.status, 'pending'))
            .all(),
          (rows) =>
            rows
              .toSorted((left, right) => left.sequence - right.sequence)
              .map((row) =>
                decodeEnvelope({
                  clientId: row.clientId,
                  sequence: row.sequence,
                  mutationId: row.mutationId,
                  schemaVersion: row.schemaVersion,
                  command: row.command,
                  createdAt: row.createdAt,
                }),
              ),
        ),
    })
    .pipe(Effect.mapError(mapStoreError('pending')));

  const markAccepted = Effect.fn('DrizzleSyncStore.markAccepted')(
    (mutationId: MutationId, revision: ServerRevision) =>
      database.bridge
        .run({
          execute: () =>
            database.drizzle
              .update(mutationJournal)
              .set({ status: 'accepted', serverRevision: revision })
              .where(eq(mutationJournal.mutationId, mutationId))
              .run(),
        })
        .pipe(Effect.asVoid, Effect.mapError(mapStoreError('markAccepted'))),
  );

  const revision = database.bridge.get({ execute: () => clientRow(database, localClientId) }).pipe(
    Effect.map((row) => Schema.decodeSync(ServerRevision)(row?.lastServerRevision ?? 0)),
    Effect.mapError(mapStoreError('revision')),
  );

  const applyPatch = Effect.fn('DrizzleSyncStore.applyPatch')(function* (
    patch: RevisionPatch,
  ): Effect.fn.Return<ChangeSet, SyncStoreError | StaleRevisionError> {
    const currentRevision = yield* revision;
    if (currentRevision !== patch.baseRevision) {
      return yield* new StaleRevisionError({
        expected: currentRevision,
        actual: patch.baseRevision,
      });
    }
    const pendingMutations = yield* pending;
    return yield* database.bridge
      .transaction(() => {
        const scopes: Array<ChangeScope> = [];
        const operations: Array<Operation> = [];
        for (const [index, envelope] of patch.mutations.entries()) {
          const envelopeRevision = Schema.decodeSync(ServerRevision)(
            patch.baseRevision + index + 1,
          );
          operations.push(
            () =>
              applyCommand(
                database,
                envelope.command,
                envelope.createdAt,
                envelope.mutationId,
                envelopeRevision,
              ),
            () =>
              database.drizzle
                .insert(serverRevisions)
                .values({
                  revision: envelopeRevision,
                  mutationId: envelope.mutationId,
                  envelope,
                  acceptedAt: envelope.createdAt,
                })
                .onConflictDoNothing()
                .run(),
          );
          scopes.push(...changeSetFor(envelope.command).scopes);
        }

        for (const envelope of pendingMutations) {
          operations.push(() =>
            applyCommand(database, envelope.command, envelope.createdAt, envelope.mutationId),
          );
        }

        const lastMutation = patch.mutations.at(-1);
        let timestamp = Schema.decodeSync(Timestamp)('1970-01-01T00:00:00.000Z');
        if (lastMutation !== undefined) timestamp = lastMutation.createdAt;
        operations.push(
          () => ensureClient(timestamp),
          () =>
            database.drizzle
              .update(syncClients)
              .set({ lastServerRevision: patch.revision, updatedAt: timestamp })
              .where(eq(syncClients.clientId, localClientId))
              .run(),
        );
        return runThen(operations, () => ({ scopes }));
      })
      .pipe(Effect.mapError(mapStoreError('applyPatch')));
  });

  const note = Effect.fn('DrizzleSyncStore.note')((id: string) =>
    database.bridge
      .get({
        execute: () => database.drizzle.select().from(notes).where(eq(notes.id, id)).get(),
      })
      .pipe(Effect.mapError(mapStoreError('note'))),
  );

  const readingPreferences = database.bridge
    .get({
      execute: () =>
        database.drizzle
          .select({ value: preferenceRows.value })
          .from(preferenceRows)
          .where(and(eq(preferenceRows.key, 'reading'), isNull(preferenceRows.deletedAt)))
          .get(),
    })
    .pipe(
      Effect.flatMap((row) => {
        if (row === undefined) return Effect.succeed(DEFAULT_READING_PREFERENCES);
        return Schema.decodeUnknownEffect(ReadingPreferences)(row.value);
      }),
      Effect.mapError(mapStoreError('readingPreferences')),
    );

  return { mutate, pending, markAccepted, revision, applyPatch, note, readingPreferences };
};
