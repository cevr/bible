import {
  ClientId,
  copyOnMigrate,
  MigrationDiagnosticId,
  MigrationSourceId,
  MutationId,
  projectWebState,
  Timestamp,
  type DomainMutationCommand,
  type LegacySourceProjection,
  type MigrationSemanticCount,
  type SyncStore,
} from '@bible/core/local-first';
import { LibraryEntityId, type ReaderLocation } from '@bible/core/library-state';
import { Effect, Schema } from 'effect';
import * as SQLite from 'wa-sqlite';

import type { GenerationMarkerStore } from './generation-marker.js';
import {
  makeSqliteDatabase,
  type SqliteDatabase,
  type WorkerSqliteApi,
} from './sqlite-database.js';
import { makeBrowserSyncStore, makeBrowserUserDatabase } from './user-state-database.js';
import {
  generationDatabaseName,
  makeWebCanonicalGenerationAdapter,
  type BrowserSqliteVfs,
  vfsFileExists,
} from './user-state-generation.js';

const LEGACY_FILENAME = 'state.db';
const SOURCE_ID = Schema.decodeSync(MigrationSourceId)('web-state.db');
const EMPTY_SOURCE = '{"legacy":"missing"}';
const encodeJson = Schema.encodeUnknownEffect(Schema.UnknownFromJsonString);
const decodeJson = Schema.decodeUnknownEffect(Schema.UnknownFromJsonString);

const legacyTables = [
  ['history', 'SELECT * FROM history ORDER BY visited_at, id'],
  ['bookmarks', 'SELECT * FROM bookmarks ORDER BY id'],
  ['cross_ref_classifications', 'SELECT * FROM cross_ref_classifications ORDER BY id'],
  ['user_cross_refs', 'SELECT * FROM user_cross_refs ORDER BY id'],
  ['sync_meta', 'SELECT * FROM sync_meta ORDER BY id'],
  ['verse_notes', 'SELECT * FROM verse_notes ORDER BY id'],
  ['collections', 'SELECT * FROM collections ORDER BY id'],
  [
    'collection_verses',
    'SELECT * FROM collection_verses ORDER BY collection_id, book, chapter, verse',
  ],
  ['verse_markers', 'SELECT * FROM verse_markers ORDER BY id'],
  ['egw_notes', 'SELECT * FROM egw_notes ORDER BY id'],
  ['egw_markers', 'SELECT * FROM egw_markers ORDER BY id'],
  [
    'egw_collection_items',
    'SELECT * FROM egw_collection_items ORDER BY collection_id, book_code, puborder',
  ],
  ['reading_plans', 'SELECT * FROM reading_plans ORDER BY id'],
  ['reading_plan_items', 'SELECT * FROM reading_plan_items ORDER BY plan_id, day_number, id'],
  ['reading_plan_progress', 'SELECT * FROM reading_plan_progress ORDER BY plan_id, item_id'],
  ['memory_verses', 'SELECT * FROM memory_verses ORDER BY id'],
  ['memory_practice', 'SELECT * FROM memory_practice ORDER BY practiced_at, id'],
] as const;

export interface WebUserStateMigrationOptions {
  readonly sqlite3: WorkerSqliteApi;
  readonly vfsName: string;
  readonly vfs: BrowserSqliteVfs;
  readonly marker: GenerationMarkerStore;
  readonly writingsDatabase: SqliteDatabase;
  readonly migrationSql: string;
  readonly log: (line: string) => void;
}

export interface OpenWebUserState {
  readonly generation: string;
  readonly database: SqliteDatabase;
  readonly store: SyncStore;
}

const fingerprint = (serialized: string): Effect.Effect<string, unknown> =>
  Effect.tryPromise(() =>
    globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(serialized)),
  ).pipe(
    Effect.map((digest) =>
      [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join(''),
    ),
  );

const queryOptionalLegacyTable = (
  database: SqliteDatabase,
  sql: string,
): Effect.Effect<readonly Readonly<Record<string, unknown>>[], unknown> =>
  database.query(sql).pipe(
    Effect.catch((cause) => {
      if (String(cause).includes('no such table')) return Effect.succeed([]);
      return Effect.fail(cause);
    }),
  );

const snapshotLegacyWebStateEffect = (
  database: SqliteDatabase,
): Effect.Effect<Readonly<Record<string, unknown>>, unknown> =>
  Effect.gen(function* () {
    const positionRows = yield* queryOptionalLegacyTable(
      database,
      'SELECT * FROM position ORDER BY id',
    );
    const preferenceRows = yield* queryOptionalLegacyTable(
      database,
      'SELECT * FROM preferences ORDER BY id',
    );
    const snapshot: Record<string, unknown> = {
      position: positionRows[0],
      preferences: preferenceRows[0],
    };
    yield* Effect.forEach(
      legacyTables,
      ([name, sql]) =>
        queryOptionalLegacyTable(database, sql).pipe(
          Effect.tap((rows) =>
            Effect.sync(() => {
              snapshot[name] = rows;
            }),
          ),
        ),
      { concurrency: 1, discard: true },
    );
    return snapshot;
  });

export const snapshotLegacyWebState = (
  database: SqliteDatabase,
): Effect.Effect<Readonly<Record<string, unknown>>, unknown> =>
  snapshotLegacyWebStateEffect(database);

const semanticCounts = (
  commands: ReadonlyArray<DomainMutationCommand>,
): ReadonlyArray<MigrationSemanticCount> => {
  const entities = new Map<string, Set<string>>();
  const add = (entity: string, key: string): void => {
    const keys = entities.get(entity);
    if (keys !== undefined) keys.add(key);
    else entities.set(entity, new Set([key]));
  };
  for (const command of commands) {
    switch (command._tag) {
      case 'RecordReading':
        add('reading_positions', `${command.location.source}:${command.location.resourceId}`);
        add('reading_history', command.historyId);
        break;
      case 'SetReadingPreferences':
        add('preferences', 'reader');
        break;
      case 'SaveBookmark':
        add('bookmarks', command.id);
        break;
      case 'SaveNote':
        add('notes', command.noteId);
        break;
      case 'SaveMarker':
        add('markers', command.id);
        break;
      case 'SaveUserCrossReference':
        add('user_cross_references', command.id);
        break;
      case 'SaveCollection':
        add('collections', command.id);
        break;
      case 'AddCollectionMember':
        add('collection_members', `${command.collectionId}:${command.memberId}`);
        break;
      case 'SaveReadingPlan':
        add('reading_plans', command.id);
        break;
      case 'SetReadingPlanProgress':
        add('reading_plan_progress', `${command.planId}:${command.stepId}`);
        break;
      case 'SaveMemoryVerse':
        add('memory_verses', command.id);
        break;
      case 'RecordMemoryPractice':
        add('practice_history', command.id);
        break;
      default:
        break;
    }
  }
  return [...entities.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([entity, keys]) => ({ entity, count: keys.size }));
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const rowsFor = (
  snapshot: Readonly<Record<string, unknown>>,
  table: string,
): ReadonlyArray<unknown> => {
  const rows = snapshot[table];
  if (Array.isArray(rows)) return rows;
  return [];
};

const coordinateKey = (bookCode: string, puborder: number): string =>
  `${bookCode.toLowerCase()}:${String(puborder)}`;

export const resolveLegacyEgwCoordinates = (
  snapshot: Readonly<Record<string, unknown>>,
  writingsDatabase: SqliteDatabase,
  log: (line: string) => void,
): Effect.Effect<ReadonlyMap<string, ReaderLocation>> => {
  const coordinates = new Map<string, { readonly bookCode: string; readonly puborder: number }>();
  for (const table of ['egw_notes', 'egw_markers', 'egw_collection_items']) {
    for (const candidate of rowsFor(snapshot, table)) {
      if (!isRecord(candidate)) continue;
      const bookCode = candidate['book_code'];
      const puborder = candidate['puborder'];
      if (typeof bookCode !== 'string' || typeof puborder !== 'number') continue;
      if (!Number.isInteger(puborder)) continue;
      coordinates.set(coordinateKey(bookCode, puborder), { bookCode, puborder });
    }
  }
  const resolved = new Map<string, ReaderLocation>();
  return Effect.forEach(
    coordinates.entries(),
    ([key, coordinate]) =>
      writingsDatabase
        .query(
          `SELECT b.book_id, p.para_id
               FROM paragraphs p
               JOIN books b ON b.book_id = p.book_id
               WHERE b.book_code = ? COLLATE NOCASE AND p.puborder = ? AND p.para_id IS NOT NULL
               ORDER BY b.book_id, p.para_id`,
          [coordinate.bookCode, coordinate.puborder],
        )
        .pipe(
          Effect.tap((rows) =>
            Effect.sync(() => {
              const row = rows[0];
              if (rows.length !== 1 || row === undefined) return;
              const publicationId = row['book_id'];
              const paragraphId = row['para_id'];
              if (typeof publicationId !== 'number' || typeof paragraphId !== 'string') return;
              resolved.set(key, {
                source: 'egw',
                resourceId: String(publicationId),
                location: `/writings/${String(publicationId)}/p/${encodeURIComponent(paragraphId)}`,
              });
            }),
          ),
          Effect.catch(() =>
            Effect.sync(() => {
              log(`[migration] writings-resolver-unavailable coordinate=${key}`);
            }),
          ),
        ),
    { concurrency: 1, discard: true },
  ).pipe(Effect.as(resolved));
};

const bibleLocationFromRow = (
  row: Readonly<Record<string, unknown>>,
): ReaderLocation | undefined => {
  const book = row['book'];
  const chapter = row['chapter'];
  const verse = row['verse'];
  if (!Number.isInteger(book) || !Number.isInteger(chapter) || !Number.isInteger(verse)) {
    return undefined;
  }
  return {
    source: 'bible',
    resourceId: 'KJV',
    location: `/bible/${String(book)}/${String(chapter)}/${String(verse)}`,
  };
};

const locationKey = (location: ReaderLocation): string =>
  `${location.source}:${location.resourceId}:${location.location}`;

const collectionMemberResolver = (
  snapshot: Readonly<Record<string, unknown>>,
  egwLocations: ReadonlyMap<string, ReaderLocation>,
) => {
  const members = new Map<
    string,
    Array<{ readonly memberId: string; readonly memberType: 'bookmark' | 'note' | 'marker' }>
  >();
  const add = (
    location: ReaderLocation | undefined,
    memberId: unknown,
    memberType: 'bookmark' | 'note' | 'marker',
  ): void => {
    if (location === undefined || typeof memberId !== 'string') return;
    const key = locationKey(location);
    const current = members.get(key);
    const member = { memberId, memberType };
    if (current !== undefined) current.push(member);
    else members.set(key, [member]);
  };
  for (const [table, memberType] of [
    ['bookmarks', 'bookmark'],
    ['verse_notes', 'note'],
    ['verse_markers', 'marker'],
  ] as const) {
    for (const candidate of rowsFor(snapshot, table)) {
      if (!isRecord(candidate)) continue;
      add(bibleLocationFromRow(candidate), candidate['id'], memberType);
    }
  }
  for (const [table, memberType] of [
    ['egw_notes', 'note'],
    ['egw_markers', 'marker'],
  ] as const) {
    for (const candidate of rowsFor(snapshot, table)) {
      if (!isRecord(candidate)) continue;
      const bookCode = candidate['book_code'];
      const puborder = candidate['puborder'];
      if (typeof bookCode !== 'string' || typeof puborder !== 'number') continue;
      if (!Number.isInteger(puborder)) continue;
      add(egwLocations.get(coordinateKey(bookCode, puborder)), candidate['id'], memberType);
    }
  }
  return (_path: string, location: ReaderLocation) => {
    const candidates = members.get(locationKey(location));
    if (candidates?.length === 1) return candidates[0];
    return undefined;
  };
};

const deterministicTimestamp = (hash: string, path: string, epoch?: number): Timestamp => {
  let suffix = 'snapshot';
  if (epoch !== undefined) suffix = String(epoch);
  return Schema.decodeSync(Timestamp)(`legacy:${hash}:${path}:${suffix}`);
};

export const makeResolvedWebStateProjection = (
  snapshot: Readonly<Record<string, unknown>>,
  hash: string,
  egwLocations: ReadonlyMap<string, ReaderLocation>,
): LegacySourceProjection => {
  const projected = projectWebState(snapshot, {
    nextDiagnosticId: (path) =>
      Schema.decodeSync(MigrationDiagnosticId)(`web:${hash}:diagnostic:${path}`),
    nextHistoryId: (path) => Schema.decodeSync(LibraryEntityId)(`web:${hash}:history:${path}`),
    nextEntityId: (path) => Schema.decodeSync(LibraryEntityId)(`web:${hash}:entity:${path}`),
    timestampFor: (path, epoch) => deterministicTimestamp(hash, path, epoch),
    planStepId: (path, legacyItemId) => `web:${hash}:step:${path}:${String(legacyItemId)}`,
    resolveEgwLocation: ({ bookCode, puborder }) =>
      egwLocations.get(coordinateKey(bookCode, puborder)),
    resolveCollectionMember: collectionMemberResolver(snapshot, egwLocations),
  });
  return {
    sourceId: SOURCE_ID,
    fingerprint: `sha256:${hash}`,
    commands: projected.commands,
    diagnostics: projected.diagnostics,
    semanticCounts: semanticCounts(projected.commands),
  };
};

const openActivated = (
  options: WebUserStateMigrationOptions,
  generation: string,
): Effect.Effect<OpenWebUserState, unknown> => {
  const database = makeSqliteDatabase(
    options.sqlite3,
    generationDatabaseName(generation),
    options.vfsName,
  );
  return database.open(SQLite.SQLITE_OPEN_READWRITE).pipe(
    Effect.map(() => {
      const userDatabase = makeBrowserUserDatabase({ database });
      return {
        generation,
        database,
        store: makeBrowserSyncStore(userDatabase, Schema.decodeSync(ClientId)('web-local')),
      };
    }),
  );
};

export const migrateWebUserState = (
  options: WebUserStateMigrationOptions,
): Effect.Effect<OpenWebUserState, unknown> =>
  Effect.gen(function* () {
    const legacyExists = yield* vfsFileExists(options.vfs, LEGACY_FILENAME);
    const legacyDatabase = makeSqliteDatabase(options.sqlite3, LEGACY_FILENAME, options.vfsName);
    let exactSnapshot = EMPTY_SOURCE;
    if (legacyExists) {
      exactSnapshot = yield* Effect.acquireUseRelease(
        legacyDatabase.open(SQLite.SQLITE_OPEN_READONLY),
        () => snapshotLegacyWebStateEffect(legacyDatabase).pipe(Effect.flatMap(encodeJson)),
        () => legacyDatabase.close().pipe(Effect.ignore),
      );
    }
    const hash = yield* fingerprint(exactSnapshot);
    const decoded = yield* decodeJson(exactSnapshot);
    if (!isRecord(decoded)) return yield* Effect.fail('legacy snapshot did not decode');
    const snapshot = decoded;
    let egwLocations: ReadonlyMap<string, ReaderLocation> = new Map();
    if (legacyExists) {
      egwLocations = yield* resolveLegacyEgwCoordinates(
        snapshot,
        options.writingsDatabase,
        options.log,
      );
    }
    const generation = `user-state-v1-${hash.slice(0, 12)}`;
    const adapter = makeWebCanonicalGenerationAdapter({
      ...options,
      targetGeneration: generation,
    });
    let sources: ReadonlyArray<LegacySourceProjection> = [];
    if (legacyExists) {
      sources = [makeResolvedWebStateProjection(snapshot, hash, egwLocations)];
    }
    const completedAt = deterministicTimestamp(hash, 'completed');
    let source = 'none';
    if (legacyExists) source = 'state.db';
    options.log(`[migration] prepared source=${source} generation=${generation}`);
    const result = yield* copyOnMigrate({
      generation,
      sources,
      adapter,
      mutationId: (_sourceId, index) =>
        Schema.decodeSync(MutationId)(`web:${hash}:mutation:${String(index)}`),
      mutationTimestamp: (_sourceId, index) =>
        deterministicTimestamp(hash, `mutation:${String(index)}`),
      completedAt,
    });
    return yield* openActivated(options, result.generation);
  });
