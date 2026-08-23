import { and, eq, isNull, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { SQLiteAsyncDatabase } from 'drizzle-orm/sqlite-core';
import { Effect, Function, Match, Option, Predicate, Schema } from 'effect';

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
import type { SqliteEffectBridgeService } from './database.js';
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
  type UserStateRelations,
} from './schema.js';
import {
  StaleRevisionError,
  type SyncStore,
  SyncStoreError,
  type LocalMutationInput,
} from './sync-store.js';

const SQL_NULL = sql`null`;

const messageOf = (cause: unknown): string => {
  if (cause instanceof Error) return cause.message;
  return String(cause);
};

const mapStoreError = (operation: string) => (cause: unknown) =>
  SyncStoreError.make({ operation, message: messageOf(cause), cause });

const decodeEnvelope = Schema.decodeUnknownSync(MutationEnvelope);
const decodeMigrationReceipt = Schema.decodeUnknownSync(LegacyMigrationReceipt);

type ResultKind = 'sync' | 'async';
type MaybePromise<A> = A | PromiseLike<A>;

export interface DrizzleUserDatabase<TResultKind extends ResultKind, TRunResult> {
  readonly drizzle: SQLiteAsyncDatabase<TResultKind, TRunResult, UserStateRelations>;
  readonly bridge: SqliteEffectBridgeService;
}

const isPromiseLike = <A>(value: MaybePromise<A>): value is PromiseLike<A> =>
  Predicate.isPromiseLike(value);

const flatMap = <A, B>(
  value: MaybePromise<A>,
  continuation: (value: A) => MaybePromise<B>,
): MaybePromise<B> => {
  if (isPromiseLike(value)) {
    return value.then(continuation);
  }
  return continuation(value);
};

const asVoid = <A>(value: MaybePromise<A>): MaybePromise<void> =>
  flatMap(value, Function.constVoid);

type Operation = () => MaybePromise<unknown>;

const runThen = <A>(
  operations: ReadonlyArray<Operation>,
  done: () => MaybePromise<A>,
  index = 0,
): MaybePromise<A> => {
  const operation = operations[index];
  if (Predicate.isUndefined(operation)) return done();
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

  return Match.value(command).pipe(
    Match.tagsExhaustive({
      RecordReading: (c) => {
        const positionId = `${c.location.source}:${c.location.resourceId}`;
        return asVoid(
          runThen(
            [
              () =>
                database.drizzle
                  .insert(readingPositions)
                  .values({
                    id: positionId,
                    source: c.location.source,
                    resourceId: c.location.resourceId,
                    location: c.location.location,
                    progress: c.progress,
                    createdAt,
                    updatedAt: c.readAt,
                  })
                  .onConflictDoUpdate({
                    target: [readingPositions.source, readingPositions.resourceId],
                    set: {
                      location: c.location.location,
                      progress: c.progress,
                      updatedAt: c.readAt,
                      deletedAt: SQL_NULL,
                    },
                  })
                  .run(),
              () =>
                database.drizzle
                  .insert(readingHistory)
                  .values({
                    id: c.historyId,
                    source: c.location.source,
                    resourceId: c.location.resourceId,
                    location: c.location.location,
                    readAt: c.readAt,
                    createdAt,
                    updatedAt: createdAt,
                  })
                  .onConflictDoNothing()
                  .run(),
            ],
            Function.constVoid,
          ),
        );
      },
      SetReadingPreferences: (c) =>
        asVoid(
          database.drizzle
            .insert(preferenceRows)
            .values({
              key: 'reading',
              value: c.preferences,
              createdAt,
              updatedAt: createdAt,
            })
            .onConflictDoUpdate({
              target: preferenceRows.key,
              set: { value: c.preferences, updatedAt: createdAt, deletedAt: SQL_NULL },
            })
            .run(),
        ),
      SaveNote: (c) =>
        asVoid(
          runThen(
            [
              () =>
                database.drizzle
                  .insert(notes)
                  .values({
                    id: c.noteId,
                    source: c.source,
                    resourceId: c.resourceId,
                    location: c.location,
                    content: c.content,
                    createdAt,
                    updatedAt: createdAt,
                  })
                  .onConflictDoUpdate({
                    target: notes.id,
                    set: {
                      source: c.source,
                      resourceId: c.resourceId,
                      location: c.location,
                      content: c.content,
                      updatedAt: createdAt,
                      deletedAt: SQL_NULL,
                    },
                  })
                  .run(),
              removeTombstone('note', c.noteId),
            ],
            Function.constVoid,
          ),
        ),
      DeleteNote: (c) =>
        asVoid(
          runThen(
            [
              () =>
                database.drizzle
                  .update(notes)
                  .set({ deletedAt: createdAt, updatedAt: createdAt })
                  .where(eq(notes.id, c.noteId))
                  .run(),
              saveTombstone('note', c.noteId),
            ],
            Function.constVoid,
          ),
        ),
      SaveBookmark: (c) =>
        asVoid(
          runThen(
            [
              () =>
                database.drizzle
                  .insert(bookmarks)
                  .values({
                    id: c.id,
                    source: c.location.source,
                    resourceId: c.location.resourceId,
                    location: c.location.location,
                    label: c.label,
                    createdAt,
                    updatedAt: createdAt,
                  })
                  .onConflictDoUpdate({
                    target: bookmarks.id,
                    set: {
                      source: c.location.source,
                      resourceId: c.location.resourceId,
                      location: c.location.location,
                      label: c.label,
                      updatedAt: createdAt,
                      deletedAt: SQL_NULL,
                    },
                  })
                  .run(),
              removeTombstone('bookmark', c.id),
            ],
            Function.constVoid,
          ),
        ),
      DeleteBookmark: (c) =>
        asVoid(
          runThen(
            [
              () =>
                database.drizzle
                  .update(bookmarks)
                  .set({ deletedAt: createdAt, updatedAt: createdAt })
                  .where(eq(bookmarks.id, c.id))
                  .run(),
              saveTombstone('bookmark', c.id),
            ],
            Function.constVoid,
          ),
        ),
      SaveMarker: (c) =>
        asVoid(
          runThen(
            [
              () =>
                database.drizzle
                  .insert(markers)
                  .values({
                    id: c.id,
                    source: c.location.source,
                    resourceId: c.location.resourceId,
                    location: c.location.location,
                    style: c.style,
                    color: c.color,
                    createdAt,
                    updatedAt: createdAt,
                  })
                  .onConflictDoUpdate({
                    target: markers.id,
                    set: {
                      source: c.location.source,
                      resourceId: c.location.resourceId,
                      location: c.location.location,
                      style: c.style,
                      color: c.color,
                      updatedAt: createdAt,
                      deletedAt: SQL_NULL,
                    },
                  })
                  .run(),
              removeTombstone('marker', c.id),
            ],
            Function.constVoid,
          ),
        ),
      DeleteMarker: (c) =>
        asVoid(
          runThen(
            [
              () =>
                database.drizzle
                  .update(markers)
                  .set({ deletedAt: createdAt, updatedAt: createdAt })
                  .where(eq(markers.id, c.id))
                  .run(),
              saveTombstone('marker', c.id),
            ],
            Function.constVoid,
          ),
        ),
      SaveUserCrossReference: (c) =>
        asVoid(
          runThen(
            [
              () =>
                database.drizzle
                  .insert(userCrossReferences)
                  .values({
                    id: c.id,
                    fromSource: c.from.source,
                    fromResourceId: c.from.resourceId,
                    fromLocation: c.from.location,
                    toSource: c.to.source,
                    toResourceId: c.to.resourceId,
                    toLocation: c.to.location,
                    toEndSource: c.toEnd?.source ?? SQL_NULL,
                    toEndResourceId: c.toEnd?.resourceId ?? SQL_NULL,
                    toEndLocation: c.toEnd?.location ?? SQL_NULL,
                    kind: c.kind,
                    note: c.note,
                    createdAt,
                    updatedAt: createdAt,
                  })
                  .onConflictDoUpdate({
                    target: userCrossReferences.id,
                    set: {
                      fromSource: c.from.source,
                      fromResourceId: c.from.resourceId,
                      fromLocation: c.from.location,
                      toSource: c.to.source,
                      toResourceId: c.to.resourceId,
                      toLocation: c.to.location,
                      toEndSource: c.toEnd?.source ?? SQL_NULL,
                      toEndResourceId: c.toEnd?.resourceId ?? SQL_NULL,
                      toEndLocation: c.toEnd?.location ?? SQL_NULL,
                      kind: c.kind,
                      note: c.note,
                      updatedAt: createdAt,
                      deletedAt: SQL_NULL,
                    },
                  })
                  .run(),
              removeTombstone('reference', c.id),
            ],
            Function.constVoid,
          ),
        ),
      DeleteUserCrossReference: (c) =>
        asVoid(
          runThen(
            [
              () =>
                database.drizzle
                  .update(userCrossReferences)
                  .set({ deletedAt: createdAt, updatedAt: createdAt })
                  .where(eq(userCrossReferences.id, c.id))
                  .run(),
              saveTombstone('reference', c.id),
            ],
            Function.constVoid,
          ),
        ),
      SaveCollection: (c) =>
        asVoid(
          runThen(
            [
              () =>
                database.drizzle
                  .insert(collectionRows)
                  .values({
                    id: c.id,
                    name: c.name,
                    description: c.description,
                    createdAt,
                    updatedAt: createdAt,
                  })
                  .onConflictDoUpdate({
                    target: collectionRows.id,
                    set: {
                      name: c.name,
                      description: c.description,
                      updatedAt: createdAt,
                      deletedAt: SQL_NULL,
                    },
                  })
                  .run(),
              removeTombstone('collection', c.id),
            ],
            Function.constVoid,
          ),
        ),
      DeleteCollection: (c) =>
        asVoid(
          runThen(
            [
              () =>
                database.drizzle
                  .update(collectionRows)
                  .set({ deletedAt: createdAt, updatedAt: createdAt })
                  .where(eq(collectionRows.id, c.id))
                  .run(),
              saveTombstone('collection', c.id),
            ],
            Function.constVoid,
          ),
        ),
      AddCollectionMember: (c) =>
        asVoid(
          database.drizzle
            .insert(collectionMembers)
            .values({
              collectionId: c.collectionId,
              memberId: c.memberId,
              memberType: c.memberType,
              position: c.position,
              createdAt,
              updatedAt: createdAt,
            })
            .onConflictDoUpdate({
              target: [collectionMembers.collectionId, collectionMembers.memberId],
              set: {
                memberType: c.memberType,
                position: c.position,
                updatedAt: createdAt,
                deletedAt: SQL_NULL,
              },
            })
            .run(),
        ),
      RemoveCollectionMember: (c) =>
        asVoid(
          database.drizzle
            .update(collectionMembers)
            .set({ deletedAt: createdAt, updatedAt: createdAt })
            .where(
              and(
                eq(collectionMembers.collectionId, c.collectionId),
                eq(collectionMembers.memberId, c.memberId),
              ),
            )
            .run(),
        ),
      SaveReadingPlan: (c) =>
        asVoid(
          runThen(
            [
              () =>
                database.drizzle
                  .insert(readingPlanRows)
                  .values({
                    id: c.id,
                    title: c.title,
                    description: c.description,
                    definition: { steps: c.steps },
                    createdAt,
                    updatedAt: createdAt,
                  })
                  .onConflictDoUpdate({
                    target: readingPlanRows.id,
                    set: {
                      title: c.title,
                      description: c.description,
                      definition: { steps: c.steps },
                      updatedAt: createdAt,
                      deletedAt: SQL_NULL,
                    },
                  })
                  .run(),
              removeTombstone('plan', c.id),
            ],
            Function.constVoid,
          ),
        ),
      DeleteReadingPlan: (c) =>
        asVoid(
          runThen(
            [
              () =>
                database.drizzle
                  .update(readingPlanRows)
                  .set({ deletedAt: createdAt, updatedAt: createdAt })
                  .where(eq(readingPlanRows.id, c.id))
                  .run(),
              saveTombstone('plan', c.id),
            ],
            Function.constVoid,
          ),
        ),
      SetReadingPlanProgress: (c) => {
        let deletedAt: Timestamp | SQL = SQL_NULL;
        if (Predicate.isNull(c.completedAt)) deletedAt = createdAt;
        return asVoid(
          database.drizzle
            .insert(readingPlanProgress)
            .values({
              planId: c.planId,
              stepId: c.stepId,
              completedAt: c.completedAt,
              createdAt,
              updatedAt: createdAt,
              deletedAt,
            })
            .onConflictDoUpdate({
              target: [readingPlanProgress.planId, readingPlanProgress.stepId],
              set: { completedAt: c.completedAt, updatedAt: createdAt, deletedAt },
            })
            .run(),
        );
      },
      SaveMemoryVerse: (c) =>
        asVoid(
          runThen(
            [
              () =>
                database.drizzle
                  .insert(memoryVerses)
                  .values({
                    id: c.id,
                    resourceId: c.resourceId,
                    location: c.location,
                    endLocation: c.endLocation,
                    prompt: c.prompt,
                    nextPracticeAt: c.nextPracticeAt,
                    intervalDays: c.intervalDays,
                    createdAt,
                    updatedAt: createdAt,
                  })
                  .onConflictDoUpdate({
                    target: memoryVerses.id,
                    set: {
                      resourceId: c.resourceId,
                      location: c.location,
                      endLocation: c.endLocation,
                      prompt: c.prompt,
                      nextPracticeAt: c.nextPracticeAt,
                      intervalDays: c.intervalDays,
                      updatedAt: createdAt,
                      deletedAt: SQL_NULL,
                    },
                  })
                  .run(),
              removeTombstone('memory-verse', c.id),
            ],
            Function.constVoid,
          ),
        ),
      DeleteMemoryVerse: (c) =>
        asVoid(
          runThen(
            [
              () =>
                database.drizzle
                  .update(memoryVerses)
                  .set({ deletedAt: createdAt, updatedAt: createdAt })
                  .where(eq(memoryVerses.id, c.id))
                  .run(),
              saveTombstone('memory-verse', c.id),
            ],
            Function.constVoid,
          ),
        ),
      RecordMemoryPractice: (c) =>
        asVoid(
          runThen(
            [
              () =>
                database.drizzle
                  .insert(practiceHistory)
                  .values({
                    id: c.id,
                    memoryVerseId: c.memoryVerseId,
                    rating: c.rating,
                    practicedAt: c.practicedAt,
                    createdAt,
                    updatedAt: createdAt,
                  })
                  .onConflictDoUpdate({
                    target: practiceHistory.id,
                    set: {
                      memoryVerseId: c.memoryVerseId,
                      rating: c.rating,
                      practicedAt: c.practicedAt,
                      updatedAt: createdAt,
                      deletedAt: SQL_NULL,
                    },
                  })
                  .run(),
              () =>
                database.drizzle
                  .update(memoryVerses)
                  .set({
                    nextPracticeAt: c.nextPracticeAt,
                    intervalDays: c.intervalDays,
                    updatedAt: createdAt,
                  })
                  .where(eq(memoryVerses.id, c.memoryVerseId))
                  .run(),
            ],
            Function.constVoid,
          ),
        ),
    }),
  );
};

type ImportOutcome =
  | { readonly _tag: 'Existing'; readonly receipt: LegacyMigrationReceipt }
  | { readonly _tag: 'Conflict'; readonly receipt: LegacyMigrationReceipt }
  | { readonly _tag: 'Imported'; readonly receipt: LegacyMigrationReceipt }
  | { readonly _tag: 'MissingClient' };

const clientRow = <TResultKind extends ResultKind, TRunResult>(
  database: DrizzleUserDatabase<TResultKind, TRunResult>,
  clientId: ClientId,
) => database.drizzle.select().from(syncClients).where(eq(syncClients.clientId, clientId)).get();

export const makeDrizzleSyncStore = <TResultKind extends ResultKind, TRunResult>(
  database: DrizzleUserDatabase<TResultKind, TRunResult>,
  localClientId: ClientId,
): SyncStore => {
  const ensureClient = (createdAt: Timestamp): MaybePromise<void> =>
    flatMap(clientRow(database, localClientId), (client): MaybePromise<void> => {
      if (Predicate.isNotUndefined(client)) return;
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
            if (Predicate.isUndefined(client)) return Option.none();
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
              () => Option.some({ envelope, changes: changeSetFor(input.command) }),
            );
          }),
        ),
      )
      .pipe(
        Effect.mapError(mapStoreError('mutate')),
        Effect.flatMap(
          Option.match({
            onSome: Effect.succeed,
            onNone: () =>
              Effect.fail(
                SyncStoreError.make({
                  operation: 'mutate',
                  message: 'sync client was not created',
                }),
              ),
          }),
        ),
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
          Effect.map(Option.map(decodeMigrationReceipt)),
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
          (existingRow): MaybePromise<ImportOutcome> => {
            if (Predicate.isNotUndefined(existingRow)) {
              const existing = decodeMigrationReceipt(existingRow);
              if (existing.fingerprint === batch.fingerprint) {
                return { _tag: 'Existing', receipt: existing };
              }
              return { _tag: 'Conflict', receipt: existing };
            }

            return flatMap(ensureClient(batch.completedAt), () =>
              flatMap(clientRow(database, localClientId), (client): MaybePromise<ImportOutcome> => {
                if (Predicate.isUndefined(client)) return { _tag: 'MissingClient' };
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
                return runThen(operations, (): ImportOutcome => ({ _tag: 'Imported', receipt }));
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
              SyncStoreError.make({
                operation: 'importLegacy',
                message: `migration source ${batch.sourceId} already completed with a different fingerprint`,
              }),
            );
          }
          return Effect.fail(
            SyncStoreError.make({
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
    Effect.map((row) =>
      Schema.decodeSync(ServerRevision)(
        row.pipe(
          Option.map((client) => client.lastServerRevision),
          Option.getOrElse(() => 0),
        ),
      ),
    ),
    Effect.mapError(mapStoreError('revision')),
  );

  const applyPatch = Effect.fn('DrizzleSyncStore.applyPatch')(function* (
    patch: RevisionPatch,
  ): Effect.fn.Return<ChangeSet, SyncStoreError | StaleRevisionError> {
    const currentRevision = yield* revision;
    if (currentRevision !== patch.baseRevision) {
      return yield* StaleRevisionError.make({
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
        if (Predicate.isNotUndefined(lastMutation)) timestamp = lastMutation.createdAt;
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
      .pipe(
        Effect.map(
          Option.map((found) => ({
            id: found.id,
            source: found.source,
            resourceId: found.resourceId,
            location: found.location,
            content: found.content,
            deletedAt: Option.fromNullOr(found.deletedAt),
          })),
        ),
        Effect.mapError(mapStoreError('note')),
      ),
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
        Schema.decodeSync(LocationAnnotationsSchema)({
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
    Effect.map(({ parents, members }): ReadonlyArray<LibraryCollection> =>
      parents.map((parent) =>
        Schema.decodeSync(LibraryCollectionSchema)({
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
    Effect.map(({ plans, progress }): ReadonlyArray<ReadingPlan> =>
      plans.map((plan) => {
        const definition = Schema.decodeUnknownSync(
          Schema.Struct({ steps: ReadingPlanSchema.fields.steps }),
        )(plan.definition);
        return Schema.decodeSync(ReadingPlanSchema)({
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
    Effect.map(({ verses, history }): MemoryPractice =>
      Schema.decodeSync(MemoryPracticeSchema)({
        verses: verses.map((verse) => ({
          ...verse,
          endLocation: Option.getOrUndefined(Option.fromNullishOr(verse.endLocation)),
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
      Effect.flatMap(
        Option.match({
          onNone: () => Effect.succeed(DEFAULT_READING_PREFERENCES),
          onSome: (found) => Schema.decodeUnknownEffect(ReadingPreferences)(found.value),
        }),
      ),
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
      Effect.map((rows) =>
        Option.fromNullishOr(
          rows.toSorted((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0],
        ).pipe(Option.map(Schema.decodeUnknownSync(ReaderLocationSchema))),
      ),
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
        Schema.decodeSync(LibraryBackupDocument)({
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
