import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

const timestamps = {
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
};

const softDelete = {
  deletedAt: text('deleted_at'),
};

export const syncMetadata = sqliteTable('sync_metadata', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const migrationReceipts = sqliteTable('migration_receipts', {
  sourceId: text('source_id').primaryKey(),
  fingerprint: text('fingerprint').notNull(),
  generation: text('generation').notNull(),
  mutationCount: integer('mutation_count').notNull(),
  diagnosticCount: integer('diagnostic_count').notNull(),
  semanticCounts: text('semantic_counts', { mode: 'json' }).notNull(),
  completedAt: text('completed_at').notNull(),
});

export const migrationDiagnostics = sqliteTable(
  'migration_diagnostics',
  {
    id: text('id').primaryKey(),
    sourceId: text('source_id').notNull(),
    path: text('path').notNull(),
    category: text('category', {
      enum: ['malformed', 'out-of-range', 'ambiguous', 'quarantined', 'discarded'],
    }).notNull(),
    message: text('message').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('migration_diagnostics_source').on(table.sourceId)],
);

export const syncClients = sqliteTable('sync_clients', {
  clientId: text('client_id').primaryKey(),
  nextSequence: integer('next_sequence').notNull().default(1),
  lastServerRevision: integer('last_server_revision').notNull().default(0),
  ...timestamps,
});

export const readingPositions = sqliteTable(
  'reading_positions',
  {
    id: text('id').primaryKey(),
    source: text('source', { enum: ['bible', 'egw'] }).notNull(),
    resourceId: text('resource_id').notNull(),
    location: text('location').notNull(),
    progress: integer('progress').notNull().default(0),
    ...timestamps,
    ...softDelete,
  },
  (table) => [uniqueIndex('reading_positions_source_resource').on(table.source, table.resourceId)],
);

export const readingHistory = sqliteTable(
  'reading_history',
  {
    id: text('id').primaryKey(),
    source: text('source', { enum: ['bible', 'egw'] }).notNull(),
    resourceId: text('resource_id').notNull(),
    location: text('location').notNull(),
    readAt: text('read_at').notNull(),
    ...timestamps,
    ...softDelete,
  },
  (table) => [index('reading_history_read_at').on(table.readAt)],
);

export const preferences = sqliteTable('preferences', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }).notNull(),
  ...timestamps,
  ...softDelete,
});

export const bookmarks = sqliteTable(
  'bookmarks',
  {
    id: text('id').primaryKey(),
    source: text('source', { enum: ['bible', 'egw'] }).notNull(),
    resourceId: text('resource_id').notNull(),
    location: text('location').notNull(),
    label: text('label'),
    ...timestamps,
    ...softDelete,
  },
  (table) => [index('bookmarks_location').on(table.source, table.resourceId, table.location)],
);

export const notes = sqliteTable(
  'notes',
  {
    id: text('id').primaryKey(),
    source: text('source', { enum: ['bible', 'egw'] }).notNull(),
    resourceId: text('resource_id').notNull(),
    location: text('location').notNull(),
    content: text('content').notNull(),
    ...timestamps,
    ...softDelete,
  },
  (table) => [index('notes_location').on(table.source, table.resourceId, table.location)],
);

export const markers = sqliteTable(
  'markers',
  {
    id: text('id').primaryKey(),
    source: text('source', { enum: ['bible', 'egw'] }).notNull(),
    resourceId: text('resource_id').notNull(),
    location: text('location').notNull(),
    style: text('style').notNull(),
    color: text('color'),
    ...timestamps,
    ...softDelete,
  },
  (table) => [index('markers_location').on(table.source, table.resourceId, table.location)],
);

export const userCrossReferences = sqliteTable(
  'user_cross_references',
  {
    id: text('id').primaryKey(),
    fromSource: text('from_source', { enum: ['bible', 'egw'] }).notNull(),
    fromResourceId: text('from_resource_id').notNull(),
    fromLocation: text('from_location').notNull(),
    toSource: text('to_source', { enum: ['bible', 'egw'] }).notNull(),
    toResourceId: text('to_resource_id').notNull(),
    toLocation: text('to_location').notNull(),
    toEndSource: text('to_end_source', { enum: ['bible', 'egw'] }),
    toEndResourceId: text('to_end_resource_id'),
    toEndLocation: text('to_end_location'),
    kind: text('kind'),
    note: text('note'),
    ...timestamps,
    ...softDelete,
  },
  (table) => [
    index('user_cross_references_from').on(
      table.fromSource,
      table.fromResourceId,
      table.fromLocation,
    ),
  ],
);

export const collections = sqliteTable('collections', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  ...timestamps,
  ...softDelete,
});

export const collectionMembers = sqliteTable(
  'collection_members',
  {
    collectionId: text('collection_id')
      .notNull()
      .references(() => collections.id),
    memberId: text('member_id').notNull(),
    memberType: text('member_type', {
      enum: ['bookmark', 'note', 'marker', 'reference'],
    }).notNull(),
    position: integer('position').notNull().default(0),
    ...timestamps,
    ...softDelete,
  },
  (table) => [primaryKey({ columns: [table.collectionId, table.memberId] })],
);

export const readingPlans = sqliteTable('reading_plans', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  definition: text('definition', { mode: 'json' }).notNull(),
  ...timestamps,
  ...softDelete,
});

export const readingPlanProgress = sqliteTable(
  'reading_plan_progress',
  {
    planId: text('plan_id')
      .notNull()
      .references(() => readingPlans.id),
    stepId: text('step_id').notNull(),
    completedAt: text('completed_at'),
    ...timestamps,
    ...softDelete,
  },
  (table) => [primaryKey({ columns: [table.planId, table.stepId] })],
);

export const memoryVerses = sqliteTable(
  'memory_verses',
  {
    id: text('id').primaryKey(),
    resourceId: text('resource_id').notNull(),
    location: text('location').notNull(),
    prompt: text('prompt'),
    nextPracticeAt: text('next_practice_at'),
    intervalDays: integer('interval_days').notNull().default(0),
    ...timestamps,
    ...softDelete,
  },
  (table) => [index('memory_verses_due').on(table.nextPracticeAt)],
);

export const practiceHistory = sqliteTable(
  'practice_history',
  {
    id: text('id').primaryKey(),
    memoryVerseId: text('memory_verse_id')
      .notNull()
      .references(() => memoryVerses.id),
    rating: integer('rating').notNull(),
    practicedAt: text('practiced_at').notNull(),
    ...timestamps,
    ...softDelete,
  },
  (table) => [index('practice_history_verse').on(table.memoryVerseId, table.practicedAt)],
);

export const mutationJournal = sqliteTable(
  'mutation_journal',
  {
    mutationId: text('mutation_id').primaryKey(),
    clientId: text('client_id')
      .notNull()
      .references(() => syncClients.clientId),
    sequence: integer('sequence').notNull(),
    schemaVersion: integer('schema_version').notNull(),
    command: text('command', { mode: 'json' }).notNull(),
    createdAt: text('created_at').notNull(),
    status: text('status', { enum: ['pending', 'accepted'] })
      .notNull()
      .default('pending'),
    serverRevision: integer('server_revision'),
  },
  (table) => [
    uniqueIndex('mutation_journal_client_sequence').on(table.clientId, table.sequence),
    index('mutation_journal_pending').on(table.status, table.clientId, table.sequence),
  ],
);

export const serverRevisions = sqliteTable('server_revisions', {
  revision: integer('revision').primaryKey(),
  mutationId: text('mutation_id').notNull().unique(),
  envelope: text('envelope', { mode: 'json' }).notNull(),
  acceptedAt: text('accepted_at').notNull(),
});

export const tombstones = sqliteTable(
  'tombstones',
  {
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    deletedByMutationId: text('deleted_by_mutation_id').notNull(),
    serverRevision: integer('server_revision'),
    deletedAt: text('deleted_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.entityType, table.entityId] })],
);

export const userStateSchema = {
  bookmarks,
  collectionMembers,
  collections,
  markers,
  memoryVerses,
  migrationDiagnostics,
  migrationReceipts,
  mutationJournal,
  notes,
  practiceHistory,
  preferences,
  readingHistory,
  readingPlanProgress,
  readingPlans,
  readingPositions,
  serverRevisions,
  syncClients,
  syncMetadata,
  tombstones,
  userCrossReferences,
};

export type UserStateSchema = typeof userStateSchema;
