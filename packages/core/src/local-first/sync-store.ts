import { Schema, type Effect } from 'effect';

import type {
  LibraryCollection,
  LocationAnnotations,
  MemoryPractice,
  ReaderLocation,
  ReadingPlan,
} from '../library-state/model.js';
import type { ReadingPreferences } from '../reading-preferences/model.js';

import type { LibraryBackupDocument } from './backup.js';

import type {
  ChangeSet,
  ClientId,
  DomainMutationCommand,
  MutationEnvelope,
  MutationId,
  RevisionPatch,
  ServerRevision,
  Timestamp,
} from './model.js';

export class SyncStoreError extends Schema.TaggedErrorClass<SyncStoreError>()('SyncStoreError', {
  operation: Schema.String,
  message: Schema.String,
  cause: Schema.optional(Schema.Unknown),
}) {}

export class StaleRevisionError extends Schema.TaggedErrorClass<StaleRevisionError>()(
  'StaleRevisionError',
  { expected: Schema.Number, actual: Schema.Number },
) {}

export interface LocalMutationInput {
  readonly clientId: ClientId;
  readonly mutationId: MutationId;
  readonly command: DomainMutationCommand;
  readonly createdAt: Timestamp;
}

export interface CommittedMutation {
  readonly envelope: MutationEnvelope;
  readonly changes: ChangeSet;
}

export interface NoteRecord {
  readonly id: string;
  readonly source: 'bible' | 'egw';
  readonly resourceId: string;
  readonly location: string;
  readonly content: string;
  readonly deletedAt: string | null;
}

export interface SyncStore {
  readonly mutate: (input: LocalMutationInput) => Effect.Effect<CommittedMutation, SyncStoreError>;
  readonly pending: Effect.Effect<ReadonlyArray<MutationEnvelope>, SyncStoreError>;
  readonly markAccepted: (
    mutationId: MutationId,
    revision: ServerRevision,
  ) => Effect.Effect<void, SyncStoreError>;
  readonly revision: Effect.Effect<ServerRevision, SyncStoreError>;
  readonly applyPatch: (
    patch: RevisionPatch,
  ) => Effect.Effect<ChangeSet, SyncStoreError | StaleRevisionError>;
  readonly note: (id: string) => Effect.Effect<NoteRecord | undefined, SyncStoreError>;
  readonly annotations: (
    location: ReaderLocation,
  ) => Effect.Effect<LocationAnnotations, SyncStoreError>;
  readonly collections: Effect.Effect<ReadonlyArray<LibraryCollection>, SyncStoreError>;
  readonly readingPlans: Effect.Effect<ReadonlyArray<ReadingPlan>, SyncStoreError>;
  readonly memoryPractice: Effect.Effect<MemoryPractice, SyncStoreError>;
  readonly readingPreferences: Effect.Effect<ReadingPreferences, SyncStoreError>;
  readonly latestReading: Effect.Effect<ReaderLocation | undefined, SyncStoreError>;
  readonly libraryBackup: (
    exportedAt: Timestamp,
  ) => Effect.Effect<LibraryBackupDocument, SyncStoreError>;
}
