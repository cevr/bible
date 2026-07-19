import { and, eq, isNull } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import { Effect, Schema } from 'effect';

import {
  LibraryCollection as LibraryCollectionSchema,
  LocationAnnotations as LocationAnnotationsSchema,
  MemoryPractice as MemoryPracticeSchema,
  ReaderLocation as ReaderLocationSchema,
  ReadingPlan as ReadingPlanSchema,
} from '../library-state/model.js';
import type {
  LibraryCollection,
  MemoryPractice,
  ReaderLocation,
  ReadingPlan,
} from '../library-state/model.js';
import { DEFAULT_READING_PREFERENCES, ReadingPreferences } from '../reading-preferences/model.js';

import { LibraryBackupDocument } from './backup.js';
import type { SqliteEffectBridgeShape } from './database.js';
import {
  LegacyMigrationReceipt,
  type LegacyMigrationBatch,
  type LegacyMigrationResult,
  type MigrationSourceId,
} from './legacy-migration.js';
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
  bookmarks,
  collectionMembers,
  collections as collectionRows,
  markers,
  memoryVerses,
  migrationDiagnostics,
  migrationReceipts,
  mutationJournal,
  notes,
  practiceHistory,
  preferences as preferenceRows,
  readingPlanProgress,
  readingPlans as readingPlanRows,
  readingHistory,
  readingPositions,
  serverRevisions,
  syncClients,
  tombstones,
  userCrossReferences,
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
const decodeMigrationReceipt = Schema.decodeUnknownSync(LegacyMigrationReceipt);

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
  const removeTombstone =
    (entityType: string, entityId: string): Operation =>
    () =>
      database.drizzle
        .delete(tombstones)
        .where(and(eq(tombstones.entityType, entityType), eq(tombstones.entityId, entityId)))
        .run();
  const saveTombstone =
    (entityType: string, entityId: string): Operation =>
    () =>
      database.drizzle
        .insert(tombstones)
        .values({
          entityType,
          entityId,
          deletedByMutationId: mutationId,
          serverRevision,
          deletedAt: createdAt,
        })
        .onConflictDoUpdate({
          target: [tombstones.entityType, tombstones.entityId],
          set: { deletedByMutationId: mutationId, serverRevision, deletedAt: createdAt },
        })
        .run();

  switch (command._tag) {
    case 'RecordReading': {
      const positionId = `${command.location.source}:${command.location.resourceId}`;
      return asVoid(
        runThen(
          [
            () =>
              database.drizzle
                .insert(readingPositions)
                .values({
                  id: positionId,
                  source: command.location.source,
                  resourceId: command.location.resourceId,
                  location: command.location.location,
                  progress: command.progress,
                  createdAt,
                  updatedAt: command.readAt,
                  deletedAt: null,
                })
                .onConflictDoUpdate({
                  target: [readingPositions.source, readingPositions.resourceId],
                  set: {
                    location: command.location.location,
                    progress: command.progress,
                    updatedAt: command.readAt,
                    deletedAt: null,
                  },
                })
                .run(),
            () =>
              database.drizzle
                .insert(readingHistory)
                .values({
                  id: command.historyId,
                  source: command.location.source,
                  resourceId: command.location.resourceId,
                  location: command.location.location,
                  readAt: command.readAt,
                  createdAt,
                  updatedAt: createdAt,
                  deletedAt: null,
                })
                .onConflictDoNothing()
                .run(),
          ],
          () => undefined,
        ),
      );
    }
    case 'SetReadingPreferences':
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
            set: { value: command.preferences, updatedAt: createdAt, deletedAt: null },
          })
          .run(),
      );
    case 'SaveNote':
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
            removeTombstone('note', command.noteId),
          ],
          () => undefined,
        ),
      );
    case 'DeleteNote':
      return asVoid(
        runThen(
          [
            () =>
              database.drizzle
                .update(notes)
                .set({ deletedAt: createdAt, updatedAt: createdAt })
                .where(eq(notes.id, command.noteId))
                .run(),
            saveTombstone('note', command.noteId),
          ],
          () => undefined,
        ),
      );
    case 'SaveBookmark':
      return asVoid(
        runThen(
          [
            () =>
              database.drizzle
                .insert(bookmarks)
                .values({
                  id: command.id,
                  source: command.location.source,
                  resourceId: command.location.resourceId,
                  location: command.location.location,
                  label: command.label,
                  createdAt,
                  updatedAt: createdAt,
                  deletedAt: null,
                })
                .onConflictDoUpdate({
                  target: bookmarks.id,
                  set: {
                    source: command.location.source,
                    resourceId: command.location.resourceId,
                    location: command.location.location,
                    label: command.label,
                    updatedAt: createdAt,
                    deletedAt: null,
                  },
                })
                .run(),
            removeTombstone('bookmark', command.id),
          ],
          () => undefined,
        ),
      );
    case 'DeleteBookmark':
      return asVoid(
        runThen(
          [
            () =>
              database.drizzle
                .update(bookmarks)
                .set({ deletedAt: createdAt, updatedAt: createdAt })
                .where(eq(bookmarks.id, command.id))
                .run(),
            saveTombstone('bookmark', command.id),
          ],
          () => undefined,
        ),
      );
    case 'SaveMarker':
      return asVoid(
        runThen(
          [
            () =>
              database.drizzle
                .insert(markers)
                .values({
                  id: command.id,
                  source: command.location.source,
                  resourceId: command.location.resourceId,
                  location: command.location.location,
                  style: command.style,
                  color: command.color,
                  createdAt,
                  updatedAt: createdAt,
                  deletedAt: null,
                })
                .onConflictDoUpdate({
                  target: markers.id,
                  set: {
                    source: command.location.source,
                    resourceId: command.location.resourceId,
                    location: command.location.location,
                    style: command.style,
                    color: command.color,
                    updatedAt: createdAt,
                    deletedAt: null,
                  },
                })
                .run(),
            removeTombstone('marker', command.id),
          ],
          () => undefined,
        ),
      );
    case 'DeleteMarker':
      return asVoid(
        runThen(
          [
            () =>
              database.drizzle
                .update(markers)
                .set({ deletedAt: createdAt, updatedAt: createdAt })
                .where(eq(markers.id, command.id))
                .run(),
            saveTombstone('marker', command.id),
          ],
          () => undefined,
        ),
      );
    case 'SaveUserCrossReference':
      return asVoid(
        runThen(
          [
            () =>
              database.drizzle
                .insert(userCrossReferences)
                .values({
                  id: command.id,
                  fromSource: command.from.source,
                  fromResourceId: command.from.resourceId,
                  fromLocation: command.from.location,
                  toSource: command.to.source,
                  toResourceId: command.to.resourceId,
                  toLocation: command.to.location,
                  toEndSource: command.toEnd?.source ?? null,
                  toEndResourceId: command.toEnd?.resourceId ?? null,
                  toEndLocation: command.toEnd?.location ?? null,
                  kind: command.kind,
                  note: command.note,
                  createdAt,
                  updatedAt: createdAt,
                  deletedAt: null,
                })
                .onConflictDoUpdate({
                  target: userCrossReferences.id,
                  set: {
                    fromSource: command.from.source,
                    fromResourceId: command.from.resourceId,
                    fromLocation: command.from.location,
                    toSource: command.to.source,
                    toResourceId: command.to.resourceId,
                    toLocation: command.to.location,
                    toEndSource: command.toEnd?.source ?? null,
                    toEndResourceId: command.toEnd?.resourceId ?? null,
                    toEndLocation: command.toEnd?.location ?? null,
                    kind: command.kind,
                    note: command.note,
                    updatedAt: createdAt,
                    deletedAt: null,
                  },
                })
                .run(),
            removeTombstone('reference', command.id),
          ],
          () => undefined,
        ),
      );
    case 'DeleteUserCrossReference':
      return asVoid(
        runThen(
          [
            () =>
              database.drizzle
                .update(userCrossReferences)
                .set({ deletedAt: createdAt, updatedAt: createdAt })
                .where(eq(userCrossReferences.id, command.id))
                .run(),
            saveTombstone('reference', command.id),
          ],
          () => undefined,
        ),
      );
    case 'SaveCollection':
      return asVoid(
        runThen(
          [
            () =>
              database.drizzle
                .insert(collectionRows)
                .values({
                  id: command.id,
                  name: command.name,
                  description: command.description,
                  createdAt,
                  updatedAt: createdAt,
                  deletedAt: null,
                })
                .onConflictDoUpdate({
                  target: collectionRows.id,
                  set: {
                    name: command.name,
                    description: command.description,
                    updatedAt: createdAt,
                    deletedAt: null,
                  },
                })
                .run(),
            removeTombstone('collection', command.id),
          ],
          () => undefined,
        ),
      );
    case 'DeleteCollection':
      return asVoid(
        runThen(
          [
            () =>
              database.drizzle
                .update(collectionRows)
                .set({ deletedAt: createdAt, updatedAt: createdAt })
                .where(eq(collectionRows.id, command.id))
                .run(),
            saveTombstone('collection', command.id),
          ],
          () => undefined,
        ),
      );
    case 'AddCollectionMember':
      return asVoid(
        database.drizzle
          .insert(collectionMembers)
          .values({
            collectionId: command.collectionId,
            memberId: command.memberId,
            memberType: command.memberType,
            position: command.position,
            createdAt,
            updatedAt: createdAt,
            deletedAt: null,
          })
          .onConflictDoUpdate({
            target: [collectionMembers.collectionId, collectionMembers.memberId],
            set: {
              memberType: command.memberType,
              position: command.position,
              updatedAt: createdAt,
              deletedAt: null,
            },
          })
          .run(),
      );
    case 'RemoveCollectionMember':
      return asVoid(
        database.drizzle
          .update(collectionMembers)
          .set({ deletedAt: createdAt, updatedAt: createdAt })
          .where(
            and(
              eq(collectionMembers.collectionId, command.collectionId),
              eq(collectionMembers.memberId, command.memberId),
            ),
          )
          .run(),
      );
    case 'SaveReadingPlan':
      return asVoid(
        runThen(
          [
            () =>
              database.drizzle
                .insert(readingPlanRows)
                .values({
                  id: command.id,
                  title: command.title,
                  description: command.description,
                  definition: { steps: command.steps },
                  createdAt,
                  updatedAt: createdAt,
                  deletedAt: null,
                })
                .onConflictDoUpdate({
                  target: readingPlanRows.id,
                  set: {
                    title: command.title,
                    description: command.description,
                    definition: { steps: command.steps },
                    updatedAt: createdAt,
                    deletedAt: null,
                  },
                })
                .run(),
            removeTombstone('plan', command.id),
          ],
          () => undefined,
        ),
      );
    case 'DeleteReadingPlan':
      return asVoid(
        runThen(
          [
            () =>
              database.drizzle
                .update(readingPlanRows)
                .set({ deletedAt: createdAt, updatedAt: createdAt })
                .where(eq(readingPlanRows.id, command.id))
                .run(),
            saveTombstone('plan', command.id),
          ],
          () => undefined,
        ),
      );
    case 'SetReadingPlanProgress': {
      let deletedAt: Timestamp | null = null;
      if (command.completedAt === null) deletedAt = createdAt;
      return asVoid(
        database.drizzle
          .insert(readingPlanProgress)
          .values({
            planId: command.planId,
            stepId: command.stepId,
            completedAt: command.completedAt,
            createdAt,
            updatedAt: createdAt,
            deletedAt,
          })
          .onConflictDoUpdate({
            target: [readingPlanProgress.planId, readingPlanProgress.stepId],
            set: { completedAt: command.completedAt, updatedAt: createdAt, deletedAt },
          })
          .run(),
      );
    }
    case 'SaveMemoryVerse':
      return asVoid(
        runThen(
          [
            () =>
              database.drizzle
                .insert(memoryVerses)
                .values({
                  id: command.id,
                  resourceId: command.resourceId,
                  location: command.location,
                  endLocation: command.endLocation,
                  prompt: command.prompt,
                  nextPracticeAt: command.nextPracticeAt,
                  intervalDays: command.intervalDays,
                  createdAt,
                  updatedAt: createdAt,
                  deletedAt: null,
                })
                .onConflictDoUpdate({
                  target: memoryVerses.id,
                  set: {
                    resourceId: command.resourceId,
                    location: command.location,
                    endLocation: command.endLocation,
                    prompt: command.prompt,
                    nextPracticeAt: command.nextPracticeAt,
                    intervalDays: command.intervalDays,
                    updatedAt: createdAt,
                    deletedAt: null,
                  },
                })
                .run(),
            removeTombstone('memory-verse', command.id),
          ],
          () => undefined,
        ),
      );
    case 'DeleteMemoryVerse':
      return asVoid(
        runThen(
          [
            () =>
              database.drizzle
                .update(memoryVerses)
                .set({ deletedAt: createdAt, updatedAt: createdAt })
                .where(eq(memoryVerses.id, command.id))
                .run(),
            saveTombstone('memory-verse', command.id),
          ],
          () => undefined,
        ),
      );
    case 'RecordMemoryPractice':
      return asVoid(
        runThen(
          [
            () =>
              database.drizzle
                .insert(practiceHistory)
                .values({
                  id: command.id,
                  memoryVerseId: command.memoryVerseId,
                  rating: command.rating,
                  practicedAt: command.practicedAt,
                  createdAt,
                  updatedAt: createdAt,
                  deletedAt: null,
                })
                .onConflictDoUpdate({
                  target: practiceHistory.id,
                  set: {
                    memoryVerseId: command.memoryVerseId,
                    rating: command.rating,
                    practicedAt: command.practicedAt,
                    updatedAt: createdAt,
                    deletedAt: null,
                  },
                })
                .run(),
            () =>
              database.drizzle
                .update(memoryVerses)
                .set({
                  nextPracticeAt: command.nextPracticeAt,
                  intervalDays: command.intervalDays,
                  updatedAt: createdAt,
                })
                .where(eq(memoryVerses.id, command.memoryVerseId))
                .run(),
          ],
          () => undefined,
        ),
      );
  }
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

  const migrationReceipt = Effect.fn('DrizzleSyncStore.migrationReceipt')(
    (sourceId: MigrationSourceId) =>
      database.bridge
        .get({
          execute: () =>
            database.drizzle
              .select()
              .from(migrationReceipts)
              .where(eq(migrationReceipts.sourceId, sourceId))
              .get(),
        })
        .pipe(
          Effect.map((row) => {
            if (row === undefined) return undefined;
            return decodeMigrationReceipt(row);
          }),
          Effect.mapError(mapStoreError('migrationReceipt')),
        ),
  );

  const importLegacy = Effect.fn('DrizzleSyncStore.importLegacy')((batch: LegacyMigrationBatch) =>
    database.bridge
      .transaction(() =>
        flatMap(
          database.drizzle
            .select()
            .from(migrationReceipts)
            .where(eq(migrationReceipts.sourceId, batch.sourceId))
            .get(),
          (existingRow) => {
            if (existingRow !== undefined) {
              const existing = decodeMigrationReceipt(existingRow);
              if (existing.fingerprint === batch.fingerprint) {
                return { _tag: 'Existing' as const, receipt: existing };
              }
              return { _tag: 'Conflict' as const, receipt: existing };
            }

            return flatMap(ensureClient(batch.completedAt), () =>
              flatMap(clientRow(database, localClientId), (client) => {
                if (client === undefined) return { _tag: 'MissingClient' as const };
                const initialSequence = client.nextSequence;
                const operations: Array<Operation> = [];

                for (const [index, item] of batch.items.entries()) {
                  const sequence = Schema.decodeSync(MutationSequence)(initialSequence + index);
                  const envelope = decodeEnvelope({
                    clientId: localClientId,
                    sequence,
                    mutationId: item.mutationId,
                    schemaVersion: CURRENT_SCHEMA_VERSION,
                    command: item.command,
                    createdAt: item.createdAt,
                  });
                  operations.push(
                    () =>
                      applyCommand(
                        database,
                        envelope.command,
                        envelope.createdAt,
                        envelope.mutationId,
                      ),
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
                  );
                }

                operations.push(() =>
                  database.drizzle
                    .update(syncClients)
                    .set({
                      nextSequence: initialSequence + batch.items.length,
                      updatedAt: batch.completedAt,
                    })
                    .where(eq(syncClients.clientId, localClientId))
                    .run(),
                );
                for (const diagnostic of batch.diagnostics) {
                  operations.push(() =>
                    database.drizzle
                      .insert(migrationDiagnostics)
                      .values({
                        ...diagnostic,
                        sourceId: batch.sourceId,
                        createdAt: batch.completedAt,
                      })
                      .run(),
                  );
                }

                const receipt = decodeMigrationReceipt({
                  sourceId: batch.sourceId,
                  fingerprint: batch.fingerprint,
                  generation: batch.generation,
                  mutationCount: batch.items.length,
                  diagnosticCount: batch.diagnostics.length,
                  semanticCounts: batch.semanticCounts,
                  completedAt: batch.completedAt,
                });
                operations.push(() =>
                  database.drizzle.insert(migrationReceipts).values(receipt).run(),
                );
                return runThen(operations, () => ({ _tag: 'Imported' as const, receipt }));
              }),
            );
          },
        ),
      )
      .pipe(
        Effect.mapError(mapStoreError('importLegacy')),
        Effect.flatMap((result): Effect.Effect<LegacyMigrationResult, SyncStoreError> => {
          if (result._tag === 'Imported') {
            return Effect.succeed({ imported: true, receipt: result.receipt });
          }
          if (result._tag === 'Existing') {
            return Effect.succeed({ imported: false, receipt: result.receipt });
          }
          if (result._tag === 'Conflict') {
            return Effect.fail(
              new SyncStoreError({
                operation: 'importLegacy',
                message: `migration source ${batch.sourceId} already completed with a different fingerprint`,
              }),
            );
          }
          return Effect.fail(
            new SyncStoreError({
              operation: 'importLegacy',
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

  const annotations = Effect.fn('DrizzleSyncStore.annotations')((location: ReaderLocation) =>
    Effect.all({
      bookmarks: database.bridge.all({
        execute: () =>
          database.drizzle
            .select()
            .from(bookmarks)
            .where(
              and(
                eq(bookmarks.source, location.source),
                eq(bookmarks.resourceId, location.resourceId),
                eq(bookmarks.location, location.location),
                isNull(bookmarks.deletedAt),
              ),
            )
            .all(),
      }),
      notes: database.bridge.all({
        execute: () =>
          database.drizzle
            .select()
            .from(notes)
            .where(
              and(
                eq(notes.source, location.source),
                eq(notes.resourceId, location.resourceId),
                eq(notes.location, location.location),
                isNull(notes.deletedAt),
              ),
            )
            .all(),
      }),
      markers: database.bridge.all({
        execute: () =>
          database.drizzle
            .select()
            .from(markers)
            .where(
              and(
                eq(markers.source, location.source),
                eq(markers.resourceId, location.resourceId),
                eq(markers.location, location.location),
                isNull(markers.deletedAt),
              ),
            )
            .all(),
      }),
      crossReferences: database.bridge.all({
        execute: () =>
          database.drizzle
            .select()
            .from(userCrossReferences)
            .where(
              and(
                eq(userCrossReferences.fromSource, location.source),
                eq(userCrossReferences.fromResourceId, location.resourceId),
                eq(userCrossReferences.fromLocation, location.location),
                isNull(userCrossReferences.deletedAt),
              ),
            )
            .all(),
      }),
    }).pipe(
      Effect.map((rows) =>
        Schema.decodeUnknownSync(LocationAnnotationsSchema)({
          bookmarks: rows.bookmarks,
          notes: rows.notes,
          markers: rows.markers,
          crossReferences: rows.crossReferences,
        }),
      ),
      Effect.mapError(mapStoreError('annotations')),
    ),
  );

  const collections = Effect.all({
    parents: database.bridge.all({
      execute: () =>
        database.drizzle
          .select()
          .from(collectionRows)
          .where(isNull(collectionRows.deletedAt))
          .all(),
    }),
    members: database.bridge.all({
      execute: () =>
        database.drizzle
          .select()
          .from(collectionMembers)
          .where(isNull(collectionMembers.deletedAt))
          .all(),
    }),
  }).pipe(
    Effect.map(
      ({ parents, members }): ReadonlyArray<LibraryCollection> =>
        parents.map((parent) =>
          Schema.decodeUnknownSync(LibraryCollectionSchema)({
            ...parent,
            members: members
              .filter((member) => member.collectionId === parent.id)
              .toSorted((left, right) => left.position - right.position),
          }),
        ),
    ),
    Effect.mapError(mapStoreError('collections')),
  );

  const readingPlans = Effect.all({
    plans: database.bridge.all({
      execute: () =>
        database.drizzle
          .select()
          .from(readingPlanRows)
          .where(isNull(readingPlanRows.deletedAt))
          .all(),
    }),
    progress: database.bridge.all({
      execute: () =>
        database.drizzle
          .select()
          .from(readingPlanProgress)
          .where(isNull(readingPlanProgress.deletedAt))
          .all(),
    }),
  }).pipe(
    Effect.map(
      ({ plans, progress }): ReadonlyArray<ReadingPlan> =>
        plans.map((plan) => {
          const definition = Schema.decodeUnknownSync(
            Schema.Struct({ steps: ReadingPlanSchema.fields.steps }),
          )(plan.definition);
          return Schema.decodeUnknownSync(ReadingPlanSchema)({
            ...plan,
            steps: definition.steps,
            progress: progress.filter((entry) => entry.planId === plan.id),
          });
        }),
    ),
    Effect.mapError(mapStoreError('readingPlans')),
  );

  const memoryPractice = Effect.all({
    verses: database.bridge.all({
      execute: () =>
        database.drizzle.select().from(memoryVerses).where(isNull(memoryVerses.deletedAt)).all(),
    }),
    history: database.bridge.all({
      execute: () =>
        database.drizzle
          .select()
          .from(practiceHistory)
          .where(isNull(practiceHistory.deletedAt))
          .all(),
    }),
  }).pipe(
    Effect.map(
      ({ verses, history }): MemoryPractice =>
        Schema.decodeUnknownSync(MemoryPracticeSchema)({
          verses: verses.map((verse) => ({
            ...verse,
            endLocation: verse.endLocation ?? undefined,
          })),
          history,
        }),
    ),
    Effect.mapError(mapStoreError('memoryPractice')),
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

  const latestReading = database.bridge
    .all({
      execute: () =>
        database.drizzle
          .select({
            source: readingPositions.source,
            resourceId: readingPositions.resourceId,
            location: readingPositions.location,
            updatedAt: readingPositions.updatedAt,
          })
          .from(readingPositions)
          .where(isNull(readingPositions.deletedAt))
          .all(),
    })
    .pipe(
      Effect.map((rows) => {
        const row = rows.toSorted((left, right) =>
          right.updatedAt.localeCompare(left.updatedAt),
        )[0];
        if (row === undefined) return undefined;
        return Schema.decodeUnknownSync(ReaderLocationSchema)(row);
      }),
      Effect.mapError(mapStoreError('latestReading')),
    );

  const libraryBackup = Effect.fn('DrizzleSyncStore.libraryBackup')((exportedAt: Timestamp) =>
    Effect.all({
      annotations: Effect.all({
        bookmarks: database.bridge.all({
          execute: () =>
            database.drizzle.select().from(bookmarks).where(isNull(bookmarks.deletedAt)).all(),
        }),
        notes: database.bridge.all({
          execute: () => database.drizzle.select().from(notes).where(isNull(notes.deletedAt)).all(),
        }),
        markers: database.bridge.all({
          execute: () =>
            database.drizzle.select().from(markers).where(isNull(markers.deletedAt)).all(),
        }),
        crossReferences: database.bridge.all({
          execute: () =>
            database.drizzle
              .select()
              .from(userCrossReferences)
              .where(isNull(userCrossReferences.deletedAt))
              .all(),
        }),
      }).pipe(Effect.map(Schema.decodeUnknownSync(LocationAnnotationsSchema))),
      collections,
      memoryPractice,
      preferences: readingPreferences,
      readingPlans,
    }).pipe(
      Effect.map(({ annotations: active, ...state }) =>
        Schema.decodeUnknownSync(LibraryBackupDocument)({
          format: 'bible-library-backup',
          version: 1,
          exportedAt,
          ...state,
          bookmarks: active.bookmarks,
          notes: active.notes,
          markers: active.markers,
          crossReferences: active.crossReferences,
        }),
      ),
      Effect.mapError(mapStoreError('libraryBackup')),
    ),
  );

  return {
    mutate,
    importLegacy,
    migrationReceipt,
    pending,
    markAccepted,
    revision,
    applyPatch,
    note,
    annotations,
    collections,
    readingPlans,
    memoryPractice,
    readingPreferences,
    latestReading,
    libraryBackup,
  };
};
