import {
  ClientId,
  MigrationSourceId,
  MutationId,
  Timestamp,
  copyOnMigrate,
} from '@bible/core/local-first';
import { LibraryEntityId } from '@bible/core/library-state';
import { NodeServices } from '@effect/platform-node';
import { describe, expect, it } from '@effect/vitest';
import Database from 'better-sqlite3';
import { Effect, FileSystem, Path, Schema } from 'effect';

import {
  makeDesktopCanonicalGenerationAdapter,
  prepareDesktopUserState,
} from '../electron/user-state-generation.js';
import { makeDesktopSyncStore, makeDesktopUserDatabase } from '../electron/user-state-database.js';

const clientId = Schema.decodeSync(ClientId)('desktop-generation-test');
const verificationTimestamp = Schema.decodeSync(Timestamp)('2026-07-19T00:00:00.000Z');
const encodeJson = Schema.encodeSync(Schema.UnknownFromJsonString);
const decodeJson = Schema.decodeSync(Schema.UnknownFromJsonString);

const withDatabase = <A, E, R>(
  filename: string,
  use: (database: Database.Database) => Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> =>
  Effect.acquireUseRelease(
    Effect.sync(() => new Database(filename)),
    use,
    (database) => Effect.sync(() => database.close()),
  );

const writeDatabase = (filename: string, sql: string): Effect.Effect<void> =>
  withDatabase(filename, (database) => Effect.sync(() => database.exec(sql)));

const writeLegacyCache = (filename: string): Effect.Effect<void> =>
  writeDatabase(
    filename,
    `
    CREATE TABLE bible_last_position (
      id INTEGER PRIMARY KEY,
      book INTEGER NOT NULL,
      chapter INTEGER NOT NULL,
      verse INTEGER
    );
    INSERT INTO bible_last_position VALUES (0, 43, 3, 16);
    CREATE TABLE last_position (
      id INTEGER PRIMARY KEY,
      book_id INTEGER NOT NULL,
      para_id TEXT,
      paragraph_id TEXT
    );
    INSERT INTO last_position VALUES (0, 127, 'AA-chapter-1', 'AA-paragraph-1');
    CREATE TABLE books (book_id INTEGER PRIMARY KEY);
    INSERT INTO books VALUES (127);
    CREATE TABLE paragraphs (
      book_id INTEGER NOT NULL,
      ref_code TEXT NOT NULL,
      para_id TEXT,
      puborder INTEGER NOT NULL
    );
    INSERT INTO paragraphs VALUES (127, 'AA 1.1', 'AA-paragraph-1', 1);
    CREATE TABLE book_lists (book_id INTEGER PRIMARY KEY);
    INSERT INTO book_lists VALUES (0);
  `,
  );

const writeLegacyCliState = (filename: string): Effect.Effect<void> =>
  writeDatabase(
    filename,
    `
    CREATE TABLE position (id INTEGER PRIMARY KEY, book, chapter, verse);
    INSERT INTO position VALUES (1, 43, 3, 16);
    INSERT INTO position VALUES (2, 'malformed', 1, 1);
    CREATE TABLE preferences (id INTEGER PRIMARY KEY, theme, display_mode);
    INSERT INTO preferences VALUES (1, 'sepia', 'paragraph');
    CREATE TABLE egw_position (
      id INTEGER PRIMARY KEY,
      book_code,
      page,
      paragraph,
      puborder
    );
    INSERT INTO egw_position VALUES (1, 'AA', 1, 1, 17);
    CREATE TABLE user_cross_refs (
      id TEXT PRIMARY KEY,
      source_book,
      source_chapter,
      source_verse,
      ref_book,
      ref_chapter,
      ref_verse,
      ref_verse_end,
      type,
      note,
      created_at
    );
    INSERT INTO user_cross_refs VALUES (
      'cli-xref', 43, 3, 16, 1, 1, 1, 2, 'thematic', 'reader note', 1700000000000
    );
    CREATE TABLE cross_ref_classifications (id INTEGER PRIMARY KEY);
    INSERT INTO cross_ref_classifications VALUES (1);
    CREATE TABLE ai_search_cache (query TEXT PRIMARY KEY);
    INSERT INTO ai_search_cache VALUES ('derived');
    CREATE TABLE terminal_palette (id INTEGER PRIMARY KEY);
    INSERT INTO terminal_palette VALUES (1);
  `,
  );

const writeWritingsCorpus = (filename: string): Effect.Effect<void> =>
  writeDatabase(
    filename,
    `
    CREATE TABLE books (book_id INTEGER PRIMARY KEY, book_code TEXT NOT NULL);
    INSERT INTO books VALUES (127, 'AA');
    CREATE TABLE paragraphs (
      book_id INTEGER NOT NULL,
      para_id TEXT,
      puborder INTEGER NOT NULL
    );
    INSERT INTO paragraphs VALUES (127, 'AA-paragraph-17', 17);
  `,
  );

const useCanonicalDatabase = <A, E, R>(
  filename: string,
  use: (database: ReturnType<typeof makeDesktopUserDatabase>) => Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> =>
  Effect.acquireUseRelease(
    Effect.sync(() => makeDesktopUserDatabase(filename)),
    use,
    (database) => database.close,
  );

const testWorkspace = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const directory = yield* fs.makeTempDirectoryScoped({ prefix: 'bible-desktop-generation-' });
  const migrationSql = yield* fs.readFileString(
    path.resolve(
      import.meta.dirname,
      '../../../packages/core/src/local-first/migrations/0001_user_state.sql',
    ),
  );
  return { fs, path, directory, migrationSql };
});

describe('desktop canonical user-state generation', () => {
  it.layer(NodeServices.layer)((it) => {
    const test = it.effect;

    test('verifies before atomic activation and preserves both legacy files byte-for-byte', () =>
      Effect.gen(function* () {
        const { fs, path, directory, migrationSql } = yield* testWorkspace;
        const cacheFile = path.join(directory, 'cache.sqlite');
        const settingsFile = path.join(directory, 'settings.json');
        const marker = path.join(directory, 'user-state.active');
        yield* writeLegacyCache(cacheFile);
        yield* fs.writeFileString(
          settingsFile,
          encodeJson({
            theme: 'dark',
            fontFamily: 42,
            inlineStrongs: false,
            uiScale: 'lg',
            bibleDrawerWidth: 420,
            bibleStudyTab: 'words',
            readerMode: 'egw',
          }),
        );
        const cacheBefore = yield* fs.readFile(cacheFile);
        const settingsBefore = yield* fs.readFile(settingsFile);
        const observations: string[] = [];

        const result = yield* prepareDesktopUserState({
          userDataPath: directory,
          cacheFile,
          settingsFile,
          migrationSql,
          clientId,
          log: (line) => observations.push(line),
        });

        expect(result.activated).toBe(true);
        expect((yield* fs.readFileString(marker)).trim()).toBe(result.generation);
        expect(yield* fs.readFile(cacheFile)).toEqual(cacheBefore);
        expect(yield* fs.readFile(settingsFile)).toEqual(settingsBefore);
        expect(
          decodeJson(yield* fs.readFileString(path.join(directory, 'device-state.v1.json'))),
        ).toEqual({
          version: 1,
          uiScale: 'lg',
          bibleDrawerWidth: 420,
          bibleStudyTab: 'words',
        });
        const verifiedIndex = observations.findIndex((event) =>
          event.startsWith('[migration] generation-verified'),
        );
        const activatedIndex = observations.findIndex((event) =>
          event.startsWith('[migration] generation-activated'),
        );
        expect(verifiedIndex).toBeGreaterThanOrEqual(0);
        expect(activatedIndex).toBeGreaterThan(verifiedIndex);
        expect(observations).toEqual(
          expect.arrayContaining([
            expect.stringMatching(/^\[migration\] generation-created /u),
            expect.stringMatching(/^\[migration\] generation-reopened /u),
            expect.stringMatching(/^\[migration\] generation-verified /u),
            expect.stringMatching(/^\[migration\] generation-activated /u),
          ]),
        );

        yield* useCanonicalDatabase(result.filename, (canonical) =>
          Effect.gen(function* () {
            yield* canonical.migrate(migrationSql);
            const store = makeDesktopSyncStore(canonical, clientId);
            expect(yield* store.readingPreferences).toEqual(
              expect.objectContaining({ colorMode: 'dark', showStrongs: false }),
            );
            expect(yield* store.latestReading).toBeDefined();
            yield* store.libraryBackup(verificationTimestamp);
          }),
        );
      }));

    test('imports CLI personal state, quarantines malformed siblings, and preserves the source', () =>
      Effect.gen(function* () {
        const { fs, path, directory, migrationSql } = yield* testWorkspace;
        const cliStateFile = path.join(directory, 'state.db');
        const writingsFile = path.join(directory, 'writings.db');
        yield* writeLegacyCliState(cliStateFile);
        yield* writeWritingsCorpus(writingsFile);
        const bytesBefore = yield* fs.readFile(cliStateFile);

        const result = yield* prepareDesktopUserState({
          userDataPath: directory,
          cliStateFile,
          writingsFile,
          migrationSql,
          clientId,
        });

        expect(yield* fs.readFile(cliStateFile)).toEqual(bytesBefore);
        yield* useCanonicalDatabase(result.filename, (canonical) =>
          Effect.gen(function* () {
            yield* canonical.migrate(migrationSql);
            const store = makeDesktopSyncStore(canonical, clientId);
            const backup = yield* store.libraryBackup(verificationTimestamp);
            expect(backup.crossReferences).toEqual([
              expect.objectContaining({
                id: 'cli-xref',
                kind: 'thematic',
                note: 'reader note',
                toLocation: '/bible/1/1/1',
                toEndLocation: '/bible/1/1/2',
              }),
            ]);
            expect(yield* store.readingPreferences).toEqual(
              expect.objectContaining({ colorMode: 'sepia', bibleLayout: 'paragraph' }),
            );
            const diagnosticPaths = canonical.client
              .prepare('SELECT path FROM migration_diagnostics WHERE source_id = ? ORDER BY path')
              .pluck()
              .all('cli-state');
            expect(diagnosticPaths).toEqual([
              'ai_search_cache',
              'cross_ref_classifications',
              'position[1]',
              'terminal_palette',
            ]);
          }),
        );
      }));

    test('does not activate or mutate a corrupt CLI source', () =>
      Effect.gen(function* () {
        const { fs, path, directory, migrationSql } = yield* testWorkspace;
        const cliStateFile = path.join(directory, 'state.db');
        yield* fs.writeFileString(cliStateFile, 'not a sqlite database');
        const bytesBefore = yield* fs.readFile(cliStateFile);

        const result = yield* Effect.exit(
          prepareDesktopUserState({
            userDataPath: directory,
            cliStateFile,
            migrationSql,
            clientId,
          }),
        );

        expect(result._tag).toBe('Failure');
        expect(yield* fs.exists(path.join(directory, 'user-state.active'))).toBe(false);
        expect(yield* fs.readFile(cliStateFile)).toEqual(bytesBefore);
      }));

    test('quarantines CLI Writings continuity when the replaceable corpus is corrupt', () =>
      Effect.gen(function* () {
        const { fs, path, directory, migrationSql } = yield* testWorkspace;
        const cliStateFile = path.join(directory, 'state.db');
        const writingsFile = path.join(directory, 'writings.db');
        yield* writeLegacyCliState(cliStateFile);
        yield* fs.writeFileString(writingsFile, 'not a sqlite database');
        const cliBefore = yield* fs.readFile(cliStateFile);
        const writingsBefore = yield* fs.readFile(writingsFile);

        const result = yield* prepareDesktopUserState({
          userDataPath: directory,
          cliStateFile,
          writingsFile,
          migrationSql,
          clientId,
        });

        expect(result.activated).toBe(true);
        expect(yield* fs.readFile(cliStateFile)).toEqual(cliBefore);
        expect(yield* fs.readFile(writingsFile)).toEqual(writingsBefore);
        yield* useCanonicalDatabase(result.filename, (canonical) =>
          Effect.gen(function* () {
            yield* canonical.migrate(migrationSql);
            const backup = yield* makeDesktopSyncStore(canonical, clientId).libraryBackup(
              verificationTimestamp,
            );
            expect(backup.crossReferences).toHaveLength(1);
            expect(
              canonical.client
                .prepare(
                  "SELECT category FROM migration_diagnostics WHERE source_id = 'cli-state' AND path = 'egw_position[0]'",
                )
                .pluck()
                .get(),
            ).toBe('quarantined');
          }),
        );
      }));

    test('returns an already-active generation without reopening or rewriting it', () =>
      Effect.gen(function* () {
        const { fs, path, directory, migrationSql } = yield* testWorkspace;
        const settingsFile = path.join(directory, 'settings.json');
        yield* fs.writeFileString(settingsFile, encodeJson({ theme: 'sepia' }));
        const first = yield* prepareDesktopUserState({
          userDataPath: directory,
          settingsFile,
          migrationSql,
          clientId,
        });
        const modifiedBefore = (yield* fs.stat(first.filename)).mtime;
        const deviceModifiedBefore = (yield* fs.stat(path.join(directory, 'device-state.v1.json')))
          .mtime;
        const logs: string[] = [];

        const second = yield* prepareDesktopUserState({
          userDataPath: directory,
          settingsFile,
          migrationSql,
          clientId,
          log: (line) => logs.push(line),
        });

        expect(second).toEqual({ ...first, activated: false });
        expect((yield* fs.stat(first.filename)).mtime).toEqual(modifiedBefore);
        expect((yield* fs.stat(path.join(directory, 'device-state.v1.json'))).mtime).toEqual(
          deviceModifiedBefore,
        );
        expect(logs.some((line) => line.includes('already-active'))).toBe(true);
        expect(logs.some((line) => line.includes('generation-reopened'))).toBe(false);
      }));

    test('recovers from a corrupt marker and removes only known inactive generation files', () =>
      Effect.gen(function* () {
        const { fs, path, directory, migrationSql } = yield* testWorkspace;
        const marker = path.join(directory, 'user-state.active');
        const inactive = path.join(directory, 'user-state-v1-deadbeefdeadbeef.sqlite');
        const inactiveWal = `${inactive}-wal`;
        const inactiveJournal = `${inactive}-journal`;
        const unrelated = path.join(directory, 'user-state-not-ours.sqlite');
        const unrelatedSuffix = `${inactive}-backup`;
        yield* fs.writeFileString(marker, '../../not-a-generation');
        yield* fs.writeFileString(inactive, 'interrupted');
        yield* fs.writeFileString(inactiveWal, 'interrupted wal');
        yield* fs.writeFileString(inactiveJournal, 'interrupted journal');
        yield* fs.writeFileString(unrelated, 'keep');
        yield* fs.writeFileString(unrelatedSuffix, 'keep suffix');
        yield* fs.writeFileString(
          path.join(directory, 'user-state.active.tmp'),
          'interrupted marker',
        );

        const result = yield* prepareDesktopUserState({
          userDataPath: directory,
          migrationSql,
          clientId,
        });

        expect(result.activated).toBe(true);
        expect(yield* fs.exists(inactive)).toBe(false);
        expect(yield* fs.exists(inactiveWal)).toBe(false);
        expect(yield* fs.exists(inactiveJournal)).toBe(false);
        expect(yield* fs.readFileString(unrelated)).toBe('keep');
        expect(yield* fs.readFileString(unrelatedSuffix)).toBe('keep suffix');
        expect((yield* fs.readFileString(marker)).trim()).toBe(result.generation);
        expect(yield* fs.exists(path.join(directory, 'user-state.active.tmp'))).toBe(false);
      }));

    test('semantic mismatch prevents activation', () =>
      Effect.gen(function* () {
        const { fs, directory, migrationSql } = yield* testWorkspace;
        const generation = 'user-state-v1-1111111111111111';
        const adapter = makeDesktopCanonicalGenerationAdapter({
          userDataPath: directory,
          migrationSql,
          clientId,
          verificationTimestamp,
          log: () => undefined,
        });
        const sourceId = Schema.decodeSync(MigrationSourceId)('desktop-test-mismatch');
        const result = yield* Effect.exit(
          copyOnMigrate({
            generation,
            adapter,
            sources: [
              {
                sourceId,
                fingerprint: 'sha256:test',
                commands: [
                  {
                    _tag: 'RecordReading',
                    historyId: Schema.decodeSync(LibraryEntityId)('history-mismatch'),
                    location: {
                      source: 'bible',
                      resourceId: 'KJV',
                      location: '/bible/43/3/16',
                    },
                    progress: 0,
                    readAt: verificationTimestamp,
                  },
                ],
                diagnostics: [],
                semanticCounts: [{ entity: 'reading_positions', count: 2 }],
              },
            ],
            mutationId: () => Schema.decodeSync(MutationId)('mutation-mismatch'),
            mutationTimestamp: () => verificationTimestamp,
            completedAt: verificationTimestamp,
          }),
        );

        expect(result._tag).toBe('Failure');
        expect(yield* fs.exists(`${directory}/user-state.active`)).toBe(false);
      }));

    test('device-state persistence failure prevents canonical marker activation', () =>
      Effect.gen(function* () {
        const { fs, path, directory, migrationSql } = yield* testWorkspace;
        yield* fs.makeDirectory(path.join(directory, 'device-state.v1.json.tmp'));
        const generation = 'user-state-v1-2222222222222222';
        const adapter = makeDesktopCanonicalGenerationAdapter({
          userDataPath: directory,
          migrationSql,
          clientId,
          verificationTimestamp,
          deviceState: { uiScale: 'lg' },
          log: () => undefined,
        });

        const result = yield* Effect.exit(
          copyOnMigrate({
            generation,
            adapter,
            sources: [],
            mutationId: () => Schema.decodeSync(MutationId)('unused-mutation'),
            mutationTimestamp: () => verificationTimestamp,
            completedAt: verificationTimestamp,
          }),
        );

        expect(result._tag).toBe('Failure');
        expect(yield* fs.exists(path.join(directory, 'user-state.active'))).toBe(false);
      }));
  });
});
