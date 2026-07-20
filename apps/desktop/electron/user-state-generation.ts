import {
  ClientId,
  CopyOnMigrateError,
  MigrationDiagnosticId,
  MigrationSourceId,
  MutationId,
  Timestamp,
  copyOnMigrate,
  projectCliState,
  projectDesktopCache,
  projectDesktopSettings,
  type CanonicalGeneration,
  type CanonicalGenerationAdapter,
  type DomainMutationCommand,
  type DesktopDeviceStateProjection,
  type LegacyCliEgwPosition,
  type LegacyDesktopEgwPosition,
  type LegacySourceProjection,
  type MigrationDiagnostic,
  type MigrationSemanticCount,
} from '@bible/core/local-first';
import { LibraryEntityId, type ReaderLocation } from '@bible/core/library-state';
import Database from 'better-sqlite3';
import { DateTime, Effect, Option, Schema } from 'effect';

import {
  makeDesktopSyncStore,
  makeDesktopUserDatabase,
  type DesktopUserDatabase,
} from './user-state-database.js';
import * as Host from './user-state-generation-host.js';

const GENERATION_PATTERN = /^user-state-v1-[0-9a-f]{16}$/u;
const GENERATED_FILE_PATTERN = /^(user-state-v1-[0-9a-f]{16})\.sqlite(?:-(?:wal|shm|journal))?$/u;
const ACTIVE_MARKER = 'user-state.active';
const ACTIVE_MARKER_TEMP = 'user-state.active.tmp';
const DEVICE_STATE = 'device-state.v1.json';
const DEVICE_STATE_TEMP = 'device-state.v1.json.tmp';
const encodeJson = Schema.encodeSync(Schema.UnknownFromJsonString);

const CacheBook = Schema.Struct({ book_id: Schema.Int });
const CacheParagraph = Schema.Struct({
  book_id: Schema.Int,
  ref_code: Schema.NonEmptyString,
  para_id: Schema.NullOr(Schema.String),
});
const CliWritingsParagraph = Schema.Struct({
  book_id: Schema.Int,
  book_code: Schema.NonEmptyString,
  para_id: Schema.NonEmptyString,
  puborder: Schema.Int,
});

interface DesktopLegacySnapshot {
  readonly fingerprint: string;
  readonly commands: ReadonlyArray<DomainMutationCommand>;
  readonly diagnostics: ReadonlyArray<MigrationDiagnostic>;
}

interface DesktopSettingsSnapshot extends DesktopLegacySnapshot {
  readonly deviceState: DesktopDeviceStateProjection;
}

export interface DesktopUserStateGeneration {
  readonly generation: string;
  readonly filename: string;
  readonly activated: boolean;
}

export interface DesktopUserStateGenerationOptions {
  readonly userDataPath: string;
  readonly cacheFile?: string;
  readonly settingsFile?: string;
  readonly cliStateFile?: string;
  readonly writingsFile?: string;
  readonly migrationSql: string;
  readonly clientId?: ClientId;
  readonly log?: (line: string) => void;
}

export interface DesktopCanonicalGenerationAdapterOptions {
  readonly userDataPath: string;
  readonly migrationSql: string;
  readonly clientId: ClientId;
  readonly verificationTimestamp: Timestamp;
  readonly deviceState?: DesktopDeviceStateProjection;
  readonly log: (line: string) => void;
}

const sourceCache = Schema.decodeSync(MigrationSourceId)('desktop-cache');
const sourceSettings = Schema.decodeSync(MigrationSourceId)('desktop-settings');
const sourceCli = Schema.decodeSync(MigrationSourceId)('cli-state');
const defaultClientId = Schema.decodeSync(ClientId)('desktop-local');

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const mapCopyError = (operation: string, message: string) => (cause: unknown) =>
  new CopyOnMigrateError({ operation, message, cause });

const attempt = <A>(operation: string, message: string, evaluate: () => A) =>
  Effect.try({ try: evaluate, catch: mapCopyError(operation, message) });

const digest = Host.digest;

const fingerprint = (bytes: Uint8Array): string => `sha256:${digest(bytes)}`;

const databaseFingerprint = Host.databaseFingerprint;

const deterministicKey = (fingerprintValue: string, pathValue: string): string =>
  digest(`${fingerprintValue}\u0000${pathValue}`).slice(0, 32);

const deterministicTimestamp = (fingerprintValue: string, pathValue: string): Timestamp => {
  const seconds = Number.parseInt(deterministicKey(fingerprintValue, pathValue).slice(0, 8), 16);
  const epoch = 946_684_800_000 + (seconds % 1_000_000_000) * 1_000;
  return Schema.decodeSync(Timestamp)(DateTime.formatIso(DateTime.makeUnsafe(epoch)));
};

const generationFilename = (userDataPath: string, generation: string): string =>
  Host.join(userDataPath, `${generation}.sqlite`);

const tableExists = (database: Database.Database, table: string): boolean =>
  database
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
    .get(table) !== undefined;

const countCacheRows = (database: Database.Database, table: string): number => {
  if (!tableExists(database, table)) return 0;
  let value: unknown;
  switch (table) {
    case 'book_lists':
      value = database.prepare('SELECT COUNT(*) FROM book_lists').pluck().get();
      break;
    case 'tocs':
      value = database.prepare('SELECT COUNT(*) FROM tocs').pluck().get();
      break;
    case 'chapters':
      value = database.prepare('SELECT COUNT(*) FROM chapters').pluck().get();
      break;
    case 'folders':
      value = database.prepare('SELECT COUNT(*) FROM folders').pluck().get();
      break;
    case 'folder_books':
      value = database.prepare('SELECT COUNT(*) FROM folder_books').pluck().get();
      break;
    case 'cross_ref_classifications':
      value = database.prepare('SELECT COUNT(*) FROM cross_ref_classifications').pluck().get();
      break;
    case 'ai_search_cache':
      value = database.prepare('SELECT COUNT(*) FROM ai_search_cache').pluck().get();
      break;
    case 'terminal_palette':
      value = database.prepare('SELECT COUNT(*) FROM terminal_palette').pluck().get();
      break;
    default:
      return 0;
  }
  return Option.getOrElse(Schema.decodeUnknownOption(Schema.Int)(value), () => 0);
};

const rowsOfLength = (length: number): ReadonlyArray<undefined> =>
  Array.from({ length }, () => undefined);

const readCachePositionRows = (database: Database.Database): Readonly<Record<string, unknown>> => {
  let bible: ReadonlyArray<unknown> = [];
  if (tableExists(database, 'bible_last_position')) {
    bible = database.prepare('SELECT * FROM bible_last_position ORDER BY rowid').all();
  }
  let writings: ReadonlyArray<unknown> = [];
  if (tableExists(database, 'last_position')) {
    writings = database
      .prepare('SELECT * FROM last_position ORDER BY rowid')
      .all()
      .map((row) => {
        if (!isRecord(row) || 'paragraph_id' in row) return row;
        return { ...row, paragraph_id: null };
      });
  }
  return {
    bible_last_position: bible,
    last_position: writings,
    book_lists: rowsOfLength(countCacheRows(database, 'book_lists')),
    tocs: rowsOfLength(countCacheRows(database, 'tocs')),
    chapters: rowsOfLength(countCacheRows(database, 'chapters')),
    folders: rowsOfLength(countCacheRows(database, 'folders')),
    folder_books: rowsOfLength(countCacheRows(database, 'folder_books')),
  };
};

const makeEgwResolver = (
  database: Database.Database,
): ((position: LegacyDesktopEgwPosition) => ReaderLocation | undefined) => {
  let books: ReadonlyArray<typeof CacheBook.Type> = [];
  if (tableExists(database, 'books')) {
    books = database
      .prepare('SELECT book_id FROM books ORDER BY book_id')
      .all()
      .flatMap((row) => Option.toArray(Schema.decodeUnknownOption(CacheBook)(row)));
  }
  let paragraphs: ReadonlyArray<typeof CacheParagraph.Type> = [];
  if (tableExists(database, 'paragraphs')) {
    paragraphs = database
      .prepare('SELECT book_id, ref_code, para_id FROM paragraphs ORDER BY book_id, puborder')
      .all()
      .flatMap((row) => Option.toArray(Schema.decodeUnknownOption(CacheParagraph)(row)));
  }
  const bookIds = new Set(books.map((book) => book.book_id));

  return (position) => {
    if (!bookIds.has(position.book_id)) return undefined;
    const requestedParagraph = position.paragraph_id ?? position.para_id;
    if (requestedParagraph === null) {
      return {
        source: 'egw',
        resourceId: String(position.book_id),
        location: `/writings/${String(position.book_id)}`,
      };
    }
    const matches = paragraphs.filter(
      (paragraph) =>
        paragraph.book_id === position.book_id &&
        (paragraph.para_id === requestedParagraph || paragraph.ref_code === requestedParagraph),
    );
    if (matches.length !== 1) return undefined;
    const match = matches[0];
    if (match === undefined) return undefined;
    if (match.para_id === null) return undefined;
    return {
      source: 'egw',
      resourceId: String(position.book_id),
      location: `/writings/${String(position.book_id)}/p/${encodeURIComponent(match.para_id)}`,
    };
  };
};

const makeCliEgwResolver = (
  writingsFile: string | undefined,
): Effect.Effect<
  (position: LegacyCliEgwPosition) => ReaderLocation | undefined,
  CopyOnMigrateError
> => {
  const unavailable = (): ReaderLocation | undefined => undefined;
  if (writingsFile === undefined) return Effect.succeed(unavailable);
  const file = writingsFile;
  return attempt('inspect-writings', 'local Writings corpus could not be inspected', () =>
    Host.exists(file),
  ).pipe(
    Effect.flatMap((exists) => {
      if (!exists) return Effect.succeed(unavailable);
      return Effect.acquireUseRelease(
        attempt(
          'open-writings',
          'local Writings corpus could not be opened read-only',
          () => new Database(file, { readonly: true, fileMustExist: true }),
        ),
        (database) =>
          attempt('resolve-writings', 'local Writings coordinates could not be indexed', () => {
            if (!tableExists(database, 'books') || !tableExists(database, 'paragraphs')) {
              return unavailable;
            }
            const rows = database
              .prepare(
                `SELECT p.book_id, b.book_code, p.para_id, p.puborder
                 FROM paragraphs p
                 JOIN books b ON b.book_id = p.book_id
                 WHERE p.para_id IS NOT NULL
                 ORDER BY p.book_id, p.puborder`,
              )
              .all()
              .flatMap((row) =>
                Option.toArray(Schema.decodeUnknownOption(CliWritingsParagraph)(row)),
              );
            return (position: LegacyCliEgwPosition): ReaderLocation | undefined => {
              if (position.puborder === null) return undefined;
              const matches = rows.filter(
                (row) =>
                  row.book_code.toLowerCase() === position.book_code.toLowerCase() &&
                  row.puborder === position.puborder,
              );
              if (matches.length !== 1) return undefined;
              const match = matches[0];
              if (match === undefined) return undefined;
              return {
                source: 'egw',
                resourceId: String(match.book_id),
                location: `/writings/${String(match.book_id)}/p/${encodeURIComponent(match.para_id)}`,
              };
            };
          }),
        (database) => Effect.sync(() => database.close()),
      );
    }),
    Effect.catch(() => Effect.succeed(unavailable)),
  );
};

const semanticCountsFor = (
  commands: ReadonlyArray<DomainMutationCommand>,
): ReadonlyArray<MigrationSemanticCount> => {
  const readingPositions = new Set<string>();
  let readingHistory = 0;
  let preferences = 0;
  const crossReferences = new Set<string>();
  for (const command of commands) {
    if (command._tag === 'RecordReading') {
      readingPositions.add(`${command.location.source}:${command.location.resourceId}`);
      readingHistory += 1;
    }
    if (command._tag === 'SetReadingPreferences') preferences = 1;
    if (command._tag === 'SaveUserCrossReference') crossReferences.add(command.id);
  }
  const counts: Array<MigrationSemanticCount> = [];
  if (readingPositions.size > 0) {
    counts.push({ entity: 'reading_positions', count: readingPositions.size });
  }
  if (readingHistory > 0) counts.push({ entity: 'reading_history', count: readingHistory });
  if (preferences > 0) counts.push({ entity: 'preferences', count: preferences });
  if (crossReferences.size > 0) {
    counts.push({ entity: 'user_cross_references', count: crossReferences.size });
  }
  return counts;
};

const readLegacyBytes = (filename: string): Uint8Array => {
  if (!Host.exists(filename)) return new Uint8Array();
  return Host.readBytes(filename);
};

const snapshotDesktopCache = (
  filename: string,
): Effect.Effect<DesktopLegacySnapshot, CopyOnMigrateError> =>
  Effect.gen(function* () {
    const bytes = yield* attempt(
      'snapshot-cache',
      'legacy desktop cache could not be snapshotted',
      () => readLegacyBytes(filename),
    );
    const sourceFingerprint = yield* attempt(
      'fingerprint-cache',
      'legacy desktop cache fingerprint could not be computed',
      () => databaseFingerprint(filename, bytes),
    );
    if (bytes.byteLength === 0) {
      const projected = projectDesktopCache(
        {},
        {
          nextDiagnosticId: (legacyPath) =>
            Schema.decodeSync(MigrationDiagnosticId)(
              `desktop-cache-${deterministicKey(sourceFingerprint, `diagnostic:${legacyPath}`)}`,
            ),
          nextHistoryId: (legacyPath) =>
            Schema.decodeSync(LibraryEntityId)(
              `desktop-cache-${deterministicKey(sourceFingerprint, `history:${legacyPath}`)}`,
            ),
          timestampFor: (legacyPath) => deterministicTimestamp(sourceFingerprint, legacyPath),
          resolveEgwLocation: () => undefined,
        },
      );
      return { fingerprint: sourceFingerprint, ...projected };
    }
    return yield* Effect.acquireUseRelease(
      attempt(
        'open-cache',
        'legacy desktop cache could not be opened read-only',
        () => new Database(filename, { readonly: true, fileMustExist: true }),
      ),
      (database) =>
        attempt('project-cache', 'legacy desktop cache could not be projected', () => {
          const input = readCachePositionRows(database);
          const resolveEgwLocation = makeEgwResolver(database);
          const projected = projectDesktopCache(input, {
            nextDiagnosticId: (legacyPath) =>
              Schema.decodeSync(MigrationDiagnosticId)(
                `desktop-cache-${deterministicKey(sourceFingerprint, `diagnostic:${legacyPath}`)}`,
              ),
            nextHistoryId: (legacyPath) =>
              Schema.decodeSync(LibraryEntityId)(
                `desktop-cache-${deterministicKey(sourceFingerprint, `history:${legacyPath}`)}`,
              ),
            timestampFor: (legacyPath) => deterministicTimestamp(sourceFingerprint, legacyPath),
            resolveEgwLocation,
          });
          return { fingerprint: sourceFingerprint, ...projected };
        }),
      (database) => Effect.sync(() => database.close()),
    );
  });

const snapshotDesktopSettings = (
  filename: string,
): Effect.Effect<DesktopSettingsSnapshot, CopyOnMigrateError> =>
  attempt('snapshot-settings', 'legacy desktop settings could not be snapshotted', () => {
    const bytes = readLegacyBytes(filename);
    const sourceFingerprint = fingerprint(bytes);
    let input: unknown = {};
    if (bytes.byteLength > 0) {
      input = Option.getOrUndefined(
        Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Unknown))(
          Buffer.from(bytes).toString('utf8'),
        ),
      );
    }
    const projected = projectDesktopSettings(input, {
      nextDiagnosticId: (legacyPath) =>
        Schema.decodeSync(MigrationDiagnosticId)(
          `desktop-settings-${deterministicKey(sourceFingerprint, `diagnostic:${legacyPath}`)}`,
        ),
    });
    return { fingerprint: sourceFingerprint, ...projected };
  });

const readCliRows = (database: Database.Database): Readonly<Record<string, unknown>> => {
  const read = (table: string, sql: string): ReadonlyArray<unknown> => {
    if (!tableExists(database, table)) return [];
    return database.prepare(sql).all();
  };
  return {
    position: read('position', 'SELECT * FROM position ORDER BY rowid'),
    preferences: read('preferences', 'SELECT * FROM preferences ORDER BY rowid'),
    egw_position: read('egw_position', 'SELECT * FROM egw_position ORDER BY rowid'),
    user_cross_refs: read('user_cross_refs', 'SELECT * FROM user_cross_refs ORDER BY rowid'),
    cross_ref_classifications: rowsOfLength(countCacheRows(database, 'cross_ref_classifications')),
    ai_search_cache: rowsOfLength(countCacheRows(database, 'ai_search_cache')),
    terminal_palette: rowsOfLength(countCacheRows(database, 'terminal_palette')),
  };
};

const snapshotCliState = (
  filename: string | undefined,
  writingsFile: string | undefined,
): Effect.Effect<DesktopLegacySnapshot, CopyOnMigrateError> =>
  Effect.gen(function* () {
    if (filename === undefined) {
      return { fingerprint: fingerprint(new Uint8Array()), commands: [], diagnostics: [] };
    }
    const bytes = yield* attempt('snapshot-cli', 'legacy CLI state could not be snapshotted', () =>
      readLegacyBytes(filename),
    );
    const sourceFingerprint = yield* attempt(
      'fingerprint-cli',
      'legacy CLI state fingerprint could not be computed',
      () => databaseFingerprint(filename, bytes),
    );
    if (bytes.byteLength === 0) {
      return { fingerprint: sourceFingerprint, commands: [], diagnostics: [] };
    }
    const resolveEgwLocation = yield* makeCliEgwResolver(writingsFile);
    return yield* Effect.acquireUseRelease(
      attempt(
        'open-cli',
        'legacy CLI state could not be opened read-only',
        () => new Database(filename, { readonly: true, fileMustExist: true }),
      ),
      (database) =>
        attempt('project-cli', 'legacy CLI state could not be projected', () => {
          const projected = projectCliState(readCliRows(database), {
            nextDiagnosticId: (legacyPath) =>
              Schema.decodeSync(MigrationDiagnosticId)(
                `cli-state-${deterministicKey(sourceFingerprint, `diagnostic:${legacyPath}`)}`,
              ),
            nextHistoryId: (legacyPath) =>
              Schema.decodeSync(LibraryEntityId)(
                `cli-state-${deterministicKey(sourceFingerprint, `history:${legacyPath}`)}`,
              ),
            timestampFor: (legacyPath, legacyEpochMilliseconds) => {
              if (legacyEpochMilliseconds === undefined) {
                return deterministicTimestamp(sourceFingerprint, legacyPath);
              }
              return deterministicTimestamp(
                sourceFingerprint,
                `${legacyPath}:${String(legacyEpochMilliseconds)}`,
              );
            },
            resolveEgwLocation,
          });
          return { fingerprint: sourceFingerprint, ...projected };
        }),
      (database) => Effect.sync(() => database.close()),
    );
  });

const projectionFor = (
  sourceId: MigrationSourceId,
  snapshot: DesktopLegacySnapshot,
  semanticCounts: ReadonlyArray<MigrationSemanticCount> = [],
): LegacySourceProjection => {
  return {
    sourceId,
    fingerprint: snapshot.fingerprint,
    commands: snapshot.commands,
    diagnostics: snapshot.diagnostics,
    semanticCounts,
  };
};

const activeEntityCount = (database: DesktopUserDatabase, entity: string): number => {
  let value: unknown;
  switch (entity) {
    case 'reading_positions':
      value = database.client
        .prepare('SELECT COUNT(*) FROM reading_positions WHERE deleted_at IS NULL')
        .pluck()
        .get();
      break;
    case 'reading_history':
      value = database.client
        .prepare('SELECT COUNT(*) FROM reading_history WHERE deleted_at IS NULL')
        .pluck()
        .get();
      break;
    case 'preferences':
      value = database.client
        .prepare('SELECT COUNT(*) FROM preferences WHERE deleted_at IS NULL')
        .pluck()
        .get();
      break;
    case 'user_cross_references':
      value = database.client
        .prepare('SELECT COUNT(*) FROM user_cross_references WHERE deleted_at IS NULL')
        .pluck()
        .get();
      break;
    default:
      return -1;
  }
  return Option.getOrElse(Schema.decodeUnknownOption(Schema.Int)(value), () => -1);
};

export const makeDesktopCanonicalGenerationAdapter = (
  options: DesktopCanonicalGenerationAdapterOptions,
): CanonicalGenerationAdapter => {
  const marker = Host.join(options.userDataPath, ACTIVE_MARKER);
  const markerTemp = Host.join(options.userDataPath, ACTIVE_MARKER_TEMP);
  const opened = new Map<object, DesktopUserDatabase>();
  const log = (action: string, context: string): void => {
    options.log(`[migration] ${action} ${context}`);
  };

  const openGeneration = (
    generation: string,
    action: string,
  ): Effect.Effect<CanonicalGeneration, CopyOnMigrateError> => {
    if (!GENERATION_PATTERN.test(generation)) {
      return Effect.fail(
        new CopyOnMigrateError({
          operation: action,
          message: 'canonical generation name is invalid',
        }),
      );
    }
    const filename = generationFilename(options.userDataPath, generation);
    return attempt(action, 'canonical generation could not be opened', () =>
      makeDesktopUserDatabase(filename),
    ).pipe(
      Effect.flatMap((database) =>
        database.migrate(options.migrationSql).pipe(
          Effect.mapError(mapCopyError(action, 'canonical schema migration failed')),
          Effect.tapError(() => database.close),
          Effect.map(() => {
            const store = makeDesktopSyncStore(database, options.clientId);
            opened.set(store, database);
            log(action, `generation=${generation}`);
            return {
              store,
              close: database.close.pipe(
                Effect.tap(() => Effect.sync(() => opened.delete(store))),
                Effect.mapError(mapCopyError('close', 'canonical generation could not close')),
              ),
            };
          }),
        ),
      ),
    );
  };

  return {
    activeGeneration: attempt('read-active', 'activation marker could not be read', () => {
      if (!Host.exists(marker)) return undefined;
      const generation = Host.readText(marker).trim();
      if (!GENERATION_PATTERN.test(generation)) {
        log('marker-invalid', 'reason=malformed');
        return undefined;
      }
      if (!Host.exists(generationFilename(options.userDataPath, generation))) {
        log('marker-invalid', 'reason=missing-generation');
        return undefined;
      }
      return generation;
    }),
    discardInactive: (activeGeneration) =>
      attempt('discard-inactive', 'inactive canonical generations could not be discarded', () => {
        for (const entry of Host.entries(options.userDataPath)) {
          const match = GENERATED_FILE_PATTERN.exec(entry);
          if (match === null) continue;
          const generation = match[1];
          if (generation === activeGeneration) continue;
          Host.unlink(Host.join(options.userDataPath, entry));
          log('generation-discarded', `file=${entry}`);
        }
        if (Host.exists(markerTemp)) Host.unlink(markerTemp);
      }),
    create: (generation) => openGeneration(generation, 'generation-created'),
    open: (generation) => openGeneration(generation, 'generation-reopened'),
    verify: (generation, receipts) => {
      const database = opened.get(generation.store);
      if (database === undefined) {
        return Effect.fail(
          new CopyOnMigrateError({
            operation: 'verify',
            message: 'canonical generation database is not open',
          }),
        );
      }
      return Effect.gen(function* () {
        for (const receipt of receipts) {
          for (const expected of receipt.semanticCounts) {
            const actual = yield* attempt(
              'verify-count',
              'canonical semantic count could not be read',
              () => activeEntityCount(database, expected.entity),
            );
            if (actual !== expected.count) {
              return yield* new CopyOnMigrateError({
                operation: 'verify-count',
                message: `canonical semantic count mismatch for ${expected.entity}`,
              });
            }
          }
        }
        const expectedReading = receipts.some((receipt) =>
          receipt.semanticCounts.some(
            (count) => count.entity === 'reading_positions' && count.count > 0,
          ),
        );
        yield* generation.store.readingPreferences.pipe(
          Effect.mapError(mapCopyError('verify-preferences', 'reading preferences decode failed')),
        );
        const latestReading = yield* generation.store.latestReading.pipe(
          Effect.mapError(mapCopyError('verify-reading', 'latest reading decode failed')),
        );
        if (expectedReading && latestReading === undefined) {
          return yield* new CopyOnMigrateError({
            operation: 'verify-reading',
            message: 'expected reading continuity is absent',
          });
        }
        yield* generation.store
          .libraryBackup(options.verificationTimestamp)
          .pipe(Effect.mapError(mapCopyError('verify-library', 'library backup decode failed')));
        log('generation-verified', `receipts=${String(receipts.length)}`);
      });
    },
    activate: (generation) =>
      Effect.gen(function* () {
        const deviceState = options.deviceState ?? {};
        const target = Host.join(options.userDataPath, DEVICE_STATE);
        const temporary = Host.join(options.userDataPath, DEVICE_STATE_TEMP);
        const encoded = `${encodeJson({ version: 1, ...deviceState })}\n`;
        yield* attempt(
          'persist-device-state',
          'desktop device state could not be persisted',
          () => {
            Host.writeText(temporary, encoded);
            Host.rename(temporary, target);
          },
        );
        const persisted = yield* attempt(
          'verify-device-state',
          'desktop device state could not be verified',
          () => Host.readText(target),
        );
        if (persisted !== encoded) {
          return yield* new CopyOnMigrateError({
            operation: 'verify-device-state',
            message: 'desktop device state verification failed',
          });
        }
        log('device-state-persisted', 'version=1');
        yield* attempt('activate', 'canonical generation could not be activated', () => {
          Host.writeText(markerTemp, `${generation}\n`);
          Host.rename(markerTemp, marker);
          log('generation-activated', `generation=${generation}`);
        });
      }),
  };
};

export const prepareDesktopUserState = Effect.fn('Desktop.prepareUserState')(
  (
    options: DesktopUserStateGenerationOptions,
  ): Effect.Effect<DesktopUserStateGeneration, CopyOnMigrateError> =>
    Effect.gen(function* () {
      const cacheFile = options.cacheFile ?? Host.join(options.userDataPath, 'cache.sqlite');
      const settingsFile = options.settingsFile ?? Host.join(options.userDataPath, 'settings.json');
      const log = options.log ?? (() => undefined);
      const cache = yield* snapshotDesktopCache(cacheFile);
      const settings = yield* snapshotDesktopSettings(settingsFile);
      const cli = yield* snapshotCliState(options.cliStateFile, options.writingsFile);
      const generationHash = digest(
        `${sourceCache}:${cache.fingerprint}\u0000${sourceSettings}:${settings.fingerprint}\u0000${sourceCli}:${cli.fingerprint}`,
      );
      const generation = `user-state-v1-${generationHash.slice(0, 16)}`;
      const completedAt = deterministicTimestamp(generationHash, 'completed');
      const aggregateCounts = semanticCountsFor([
        ...cache.commands,
        ...settings.commands,
        ...cli.commands,
      ]);
      const sources = [
        projectionFor(sourceCache, cache),
        projectionFor(sourceSettings, settings),
        projectionFor(sourceCli, cli, aggregateCounts),
      ];
      const fingerprints = new Map(sources.map((source) => [source.sourceId, source.fingerprint]));
      log(`[migration] snapshot-ready sources=${String(sources.length)} generation=${generation}`);
      const adapter = makeDesktopCanonicalGenerationAdapter({
        userDataPath: options.userDataPath,
        migrationSql: options.migrationSql,
        clientId: options.clientId ?? defaultClientId,
        verificationTimestamp: completedAt,
        deviceState: settings.deviceState,
        log,
      });
      const result = yield* copyOnMigrate({
        generation,
        sources,
        adapter,
        mutationId: (sourceId, index) => {
          const sourceFingerprint = fingerprints.get(sourceId) ?? generationHash;
          return Schema.decodeSync(MutationId)(
            `desktop-migration-${deterministicKey(sourceFingerprint, `mutation:${String(index)}`)}`,
          );
        },
        mutationTimestamp: (sourceId, index) => {
          const sourceFingerprint = fingerprints.get(sourceId) ?? generationHash;
          return deterministicTimestamp(sourceFingerprint, `mutation:${String(index)}`);
        },
        completedAt,
      });
      if (!result.activated) {
        yield* adapter.discardInactive(result.generation);
        log(`[migration] already-active generation=${result.generation}`);
      }
      return {
        generation: result.generation,
        filename: generationFilename(options.userDataPath, result.generation),
        activated: result.activated,
      };
    }),
);
