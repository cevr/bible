import { and, asc, eq } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import type { BunUserDatabase } from './database-bun.js';
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
import { mutationJournal, notes, serverRevisions, syncClients, tombstones } from './schema.js';
import {
  StaleRevisionError,
  type SyncStore,
  SyncStoreError,
  type LocalMutationInput,
} from './sync-store.js';

const messageOf = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

const mapStoreError = (operation: string) => (cause: unknown) =>
  new SyncStoreError({ operation, message: messageOf(cause), cause });

const decodeEnvelope = Schema.decodeUnknownSync(MutationEnvelope);

const applyCommand = (
  database: BunUserDatabase,
  command: DomainMutationCommand,
  createdAt: Timestamp,
  mutationId: MutationId,
  serverRevision?: ServerRevision,
): void => {
  if (command._tag === 'SaveNote') {
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
      .run();
    database.drizzle
      .delete(tombstones)
      .where(and(eq(tombstones.entityType, 'note'), eq(tombstones.entityId, command.noteId)))
      .run();
    return;
  }

  database.drizzle
    .update(notes)
    .set({ deletedAt: createdAt, updatedAt: createdAt })
    .where(eq(notes.id, command.noteId))
    .run();
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
    .run();
};

const clientRow = (database: BunUserDatabase, clientId: ClientId) =>
  database.drizzle.select().from(syncClients).where(eq(syncClients.clientId, clientId)).get();

export const makeBunSyncStore = (database: BunUserDatabase, localClientId: ClientId): SyncStore => {
  const ensureClient = (createdAt: Timestamp): void => {
    if (!clientRow(database, localClientId)) {
      database.drizzle
        .insert(syncClients)
        .values({ clientId: localClientId, createdAt, updatedAt: createdAt })
        .run();
    }
  };

  const mutate = Effect.fn('BunSyncStore.mutate')((input: LocalMutationInput) =>
    database.bridge
      .transaction(() => {
        ensureClient(input.createdAt);
        const client = clientRow(database, localClientId);
        if (!client) {
          throw new Error('sync client was not created');
        }
        const sequence = Schema.decodeSync(MutationSequence)(client.nextSequence);
        const envelope = decodeEnvelope({
          clientId: input.clientId,
          sequence,
          mutationId: input.mutationId,
          schemaVersion: CURRENT_SCHEMA_VERSION,
          command: input.command,
          createdAt: input.createdAt,
        });

        applyCommand(database, input.command, input.createdAt, input.mutationId);
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
          .run();
        database.drizzle
          .update(syncClients)
          .set({ nextSequence: sequence + 1, updatedAt: input.createdAt })
          .where(eq(syncClients.clientId, localClientId))
          .run();

        return { envelope, changes: changeSetFor(input.command) };
      })
      .pipe(Effect.mapError(mapStoreError('mutate'))),
  );

  const pending = database.bridge
    .all({
      execute: () =>
        database.drizzle
          .select()
          .from(mutationJournal)
          .where(eq(mutationJournal.status, 'pending'))
          .orderBy(asc(mutationJournal.sequence))
          .all()
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
    })
    .pipe(Effect.mapError(mapStoreError('pending')));

  const markAccepted = Effect.fn('BunSyncStore.markAccepted')(
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

  const applyPatch = Effect.fn('BunSyncStore.applyPatch')(function* (
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
        for (const [index, envelope] of patch.mutations.entries()) {
          const envelopeRevision = Schema.decodeSync(ServerRevision)(
            patch.baseRevision + index + 1,
          );
          applyCommand(
            database,
            envelope.command,
            envelope.createdAt,
            envelope.mutationId,
            envelopeRevision,
          );
          database.drizzle
            .insert(serverRevisions)
            .values({
              revision: envelopeRevision,
              mutationId: envelope.mutationId,
              envelope,
              acceptedAt: envelope.createdAt,
            })
            .onConflictDoNothing()
            .run();
          scopes.push(...changeSetFor(envelope.command).scopes);
        }

        for (const envelope of pendingMutations) {
          applyCommand(database, envelope.command, envelope.createdAt, envelope.mutationId);
        }

        const timestamp =
          patch.mutations.at(-1)?.createdAt ??
          Schema.decodeSync(Timestamp)('1970-01-01T00:00:00.000Z');
        ensureClient(timestamp);
        database.drizzle
          .update(syncClients)
          .set({ lastServerRevision: patch.revision, updatedAt: timestamp })
          .where(eq(syncClients.clientId, localClientId))
          .run();
        return { scopes };
      })
      .pipe(Effect.mapError(mapStoreError('applyPatch')));
  });

  const note = Effect.fn('BunSyncStore.note')((id: string) =>
    database.bridge
      .get({
        execute: () => database.drizzle.select().from(notes).where(eq(notes.id, id)).get(),
      })
      .pipe(Effect.mapError(mapStoreError('note'))),
  );

  return { mutate, pending, markAccepted, revision, applyPatch, note };
};
