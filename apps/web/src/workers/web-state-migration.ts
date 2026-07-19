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

const fingerprint = (serialized: string): Promise<string> =>
  crypto.subtle
    .digest('SHA-256', new TextEncoder().encode(serialized))
    .then((digest) =>
      [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join(''),
    );

const queryOptionalLegacyTable = (
  database: SqliteDatabase,
  sql: string,
): Promise<readonly Readonly<Record<string, unknown>>[]> =>
  database.query(sql).catch((cause: unknown) => {
    if (String(cause).includes('no such table')) return [];
    return Promise.reject(cause);
  });

export const snapshotLegacyWebState = (
  database: SqliteDatabase,
): Promise<Readonly<Record<string, unknown>>> =>
  queryOptionalLegacyTable(database, 'SELECT * FROM position ORDER BY id').then((positionRows) =>
    queryOptionalLegacyTable(database, 'SELECT * FROM preferences ORDER BY id').then(
      (preferenceRows) => {
        const snapshot: Record<string, unknown> = {
          position: positionRows[0],
          preferences: preferenceRows[0],
        };
        return legacyTables
          .reduce(
            (pending, [name, sql]) =>
              pending.then(() =>
                queryOptionalLegacyTable(database, sql).then((rows) => {
                  snapshot[name] = rows;
                }),
              ),
            Promise.resolve(),
          )
          .then(() => snapshot);
      },
    ),
  );

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
): Promise<ReadonlyMap<string, ReaderLocation>> => {
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
  return [...coordinates.entries()]
    .reduce(
      (pending, [key, coordinate]) =>
        pending.then(() =>
          writingsDatabase
            .query(
              `SELECT b.book_id, p.para_id
               FROM paragraphs p
               JOIN books b ON b.book_id = p.book_id
               WHERE b.book_code = ? COLLATE NOCASE AND p.puborder = ? AND p.para_id IS NOT NULL
               ORDER BY b.book_id, p.para_id`,
              [coordinate.bookCode, coordinate.puborder],
            )
            .then((rows) => {
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
            })
            .catch(() => {
              log(`[migration] writings-resolver-unavailable coordinate=${key}`);
            }),
        ),
      Promise.resolve(),
    )
    .then(() => resolved);
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
): Promise<OpenWebUserState> => {
  const database = makeSqliteDatabase(
    options.sqlite3,
    generationDatabaseName(generation),
    options.vfsName,
  );
  return database.open(SQLite.SQLITE_OPEN_READWRITE).then(() => {
    const userDatabase = makeBrowserUserDatabase({ database });
    return {
      generation,
      database,
      store: makeBrowserSyncStore(userDatabase, Schema.decodeSync(ClientId)('web-local')),
    };
  });
};

export const migrateWebUserState = (
  options: WebUserStateMigrationOptions,
): Promise<OpenWebUserState> =>
  vfsFileExists(options.vfs, LEGACY_FILENAME).then((legacyExists) => {
    const legacyDatabase = makeSqliteDatabase(options.sqlite3, LEGACY_FILENAME, options.vfsName);
    const serialized = legacyExists
      ? legacyDatabase
          .open(SQLite.SQLITE_OPEN_READONLY)
          .then(() => snapshotLegacyWebState(legacyDatabase))
          .then((snapshot) => JSON.stringify(snapshot))
          .finally(() => legacyDatabase.close())
      : Promise.resolve(EMPTY_SOURCE);
    return serialized.then((exactSnapshot) =>
      fingerprint(exactSnapshot).then((hash) => {
        const snapshot = JSON.parse(exactSnapshot);
        const resolvedLocations = legacyExists
          ? resolveLegacyEgwCoordinates(snapshot, options.writingsDatabase, options.log)
          : Promise.resolve(new Map<string, ReaderLocation>());
        return resolvedLocations.then((egwLocations) => {
          const generation = `user-state-v1-${hash.slice(0, 12)}`;
          const adapter = makeWebCanonicalGenerationAdapter({
            ...options,
            targetGeneration: generation,
          });
          const sources: ReadonlyArray<LegacySourceProjection> = legacyExists
            ? [makeResolvedWebStateProjection(snapshot, hash, egwLocations)]
            : [];
          const completedAt = deterministicTimestamp(hash, 'completed');
          options.log(
            `[migration] prepared source=${legacyExists ? 'state.db' : 'none'} generation=${generation}`,
          );
          return Effect.runPromise(
            copyOnMigrate({
              generation,
              sources,
              adapter,
              mutationId: (_sourceId, index) =>
                Schema.decodeSync(MutationId)(`web:${hash}:mutation:${String(index)}`),
              mutationTimestamp: (_sourceId, index) =>
                deterministicTimestamp(hash, `mutation:${String(index)}`),
              completedAt,
            }),
          ).then((result) => openActivated(options, result.generation));
        });
      }),
    );
  });
