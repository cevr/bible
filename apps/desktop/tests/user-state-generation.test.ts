import {
  ClientId,
  MigrationSourceId,
  MutationId,
  Timestamp,
  copyOnMigrate,
} from '@bible/core/local-first';
import { LibraryEntityId } from '@bible/core/library-state';
import Database from 'better-sqlite3';
import { Effect, Schema } from 'effect';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';

import {
  makeDesktopCanonicalGenerationAdapter,
  prepareDesktopUserState,
} from '../electron/user-state-generation.js';
import { makeDesktopSyncStore, makeDesktopUserDatabase } from '../electron/user-state-database.js';

const directories: string[] = [];
const userStateMigrationSql = readFileSync(
  path.resolve(
    import.meta.dirname,
    '../../../packages/core/src/local-first/migrations/0001_user_state.sql',
  ),
  'utf8',
);
const makeDirectory = (): string => {
  const directory = mkdtempSync(path.join(tmpdir(), 'bible-desktop-generation-'));
  directories.push(directory);
  return directory;
};

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

const clientId = Schema.decodeSync(ClientId)('desktop-generation-test');
const verificationTimestamp = Schema.decodeSync(Timestamp)('2026-07-19T00:00:00.000Z');

const writeLegacyCache = (filename: string): void => {
  const database = new Database(filename);
  database.exec(`
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
  `);
  database.close();
};

const writeLegacyCliState = (filename: string): void => {
  const database = new Database(filename);
  database.exec(`
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
  `);
  database.close();
};

const writeWritingsCorpus = (filename: string): void => {
  const database = new Database(filename);
  database.exec(`
    CREATE TABLE books (book_id INTEGER PRIMARY KEY, book_code TEXT NOT NULL);
    INSERT INTO books VALUES (127, 'AA');
    CREATE TABLE paragraphs (
      book_id INTEGER NOT NULL,
      para_id TEXT,
      puborder INTEGER NOT NULL
    );
    INSERT INTO paragraphs VALUES (127, 'AA-paragraph-17', 17);
  `);
  database.close();
};

describe('desktop canonical user-state generation', () => {
  test('verifies before atomic activation and preserves both legacy files byte-for-byte', async () => {
    const directory = makeDirectory();
    const cacheFile = path.join(directory, 'cache.sqlite');
    const settingsFile = path.join(directory, 'settings.json');
    const marker = path.join(directory, 'user-state.active');
    writeLegacyCache(cacheFile);
    writeFileSync(
      settingsFile,
      JSON.stringify({
        theme: 'dark',
        fontFamily: 42,
        inlineStrongs: false,
        uiScale: 'lg',
        bibleDrawerWidth: 420,
        bibleStudyTab: 'words',
        readerMode: 'egw',
      }),
    );
    const cacheBefore = readFileSync(cacheFile);
    const settingsBefore = readFileSync(settingsFile);
    const observations: Array<{ readonly line: string; readonly active: boolean }> = [];

    const result = await Effect.runPromise(
      prepareDesktopUserState({
        userDataPath: directory,
        cacheFile,
        settingsFile,
        migrationSql: userStateMigrationSql,
        clientId,
        log: (line) => observations.push({ line, active: existsSync(marker) }),
      }),
    );

    expect(result.activated).toBe(true);
    expect(readFileSync(marker, 'utf8').trim()).toBe(result.generation);
    expect(readFileSync(cacheFile)).toEqual(cacheBefore);
    expect(readFileSync(settingsFile)).toEqual(settingsBefore);
    expect(JSON.parse(readFileSync(path.join(directory, 'device-state.v1.json'), 'utf8'))).toEqual({
      version: 1,
      uiScale: 'lg',
      bibleDrawerWidth: 420,
      bibleStudyTab: 'words',
    });
    expect(
      observations.find((event) => event.line.startsWith('[migration] generation-verified')),
    ).toEqual(expect.objectContaining({ active: false }));
    expect(
      observations.find((event) => event.line.startsWith('[migration] generation-activated')),
    ).toEqual(expect.objectContaining({ active: true }));
    expect(observations.map((event) => event.line)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^\[migration\] generation-created /u),
        expect.stringMatching(/^\[migration\] generation-reopened /u),
        expect.stringMatching(/^\[migration\] generation-verified /u),
        expect.stringMatching(/^\[migration\] generation-activated /u),
      ]),
    );

    const canonical = makeDesktopUserDatabase(result.filename);
    await Effect.runPromise(canonical.migrate(userStateMigrationSql));
    const store = makeDesktopSyncStore(canonical, clientId);
    expect(await Effect.runPromise(store.readingPreferences)).toEqual(
      expect.objectContaining({ colorMode: 'dark', showStrongs: false }),
    );
    expect(await Effect.runPromise(store.latestReading)).toBeDefined();
    await Effect.runPromise(store.libraryBackup(verificationTimestamp));
    await Effect.runPromise(canonical.close);
  });

  test('imports CLI personal state, quarantines malformed siblings, and preserves the source', async () => {
    const directory = makeDirectory();
    const cliStateFile = path.join(directory, 'state.db');
    const writingsFile = path.join(directory, 'writings.db');
    writeLegacyCliState(cliStateFile);
    writeWritingsCorpus(writingsFile);
    const bytesBefore = readFileSync(cliStateFile);

    const result = await Effect.runPromise(
      prepareDesktopUserState({
        userDataPath: directory,
        cliStateFile,
        writingsFile,
        migrationSql: userStateMigrationSql,
        clientId,
      }),
    );

    expect(readFileSync(cliStateFile)).toEqual(bytesBefore);
    const canonical = makeDesktopUserDatabase(result.filename);
    await Effect.runPromise(canonical.migrate(userStateMigrationSql));
    const store = makeDesktopSyncStore(canonical, clientId);
    const backup = await Effect.runPromise(store.libraryBackup(verificationTimestamp));
    expect(backup.crossReferences).toEqual([
      expect.objectContaining({
        id: 'cli-xref',
        kind: 'thematic',
        note: 'reader note',
        toLocation: '/bible/1/1/1',
        toEndLocation: '/bible/1/1/2',
      }),
    ]);
    expect(await Effect.runPromise(store.readingPreferences)).toEqual(
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
    await Effect.runPromise(canonical.close);
  });

  test('does not activate or mutate a corrupt CLI source', async () => {
    const directory = makeDirectory();
    const cliStateFile = path.join(directory, 'state.db');
    writeFileSync(cliStateFile, 'not a sqlite database');
    const bytesBefore = readFileSync(cliStateFile);

    const result = await Effect.runPromiseExit(
      prepareDesktopUserState({
        userDataPath: directory,
        cliStateFile,
        migrationSql: userStateMigrationSql,
        clientId,
      }),
    );

    expect(result._tag).toBe('Failure');
    expect(existsSync(path.join(directory, 'user-state.active'))).toBe(false);
    expect(readFileSync(cliStateFile)).toEqual(bytesBefore);
  });

  test('quarantines CLI Writings continuity when the replaceable corpus is corrupt', async () => {
    const directory = makeDirectory();
    const cliStateFile = path.join(directory, 'state.db');
    const writingsFile = path.join(directory, 'writings.db');
    writeLegacyCliState(cliStateFile);
    writeFileSync(writingsFile, 'not a sqlite database');
    const cliBefore = readFileSync(cliStateFile);
    const writingsBefore = readFileSync(writingsFile);

    const result = await Effect.runPromise(
      prepareDesktopUserState({
        userDataPath: directory,
        cliStateFile,
        writingsFile,
        migrationSql: userStateMigrationSql,
        clientId,
      }),
    );

    expect(result.activated).toBe(true);
    expect(readFileSync(cliStateFile)).toEqual(cliBefore);
    expect(readFileSync(writingsFile)).toEqual(writingsBefore);
    const canonical = makeDesktopUserDatabase(result.filename);
    await Effect.runPromise(canonical.migrate(userStateMigrationSql));
    const backup = await Effect.runPromise(
      makeDesktopSyncStore(canonical, clientId).libraryBackup(verificationTimestamp),
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
    await Effect.runPromise(canonical.close);
  });

  test('returns an already-active generation without reopening or rewriting it', async () => {
    const directory = makeDirectory();
    const settingsFile = path.join(directory, 'settings.json');
    writeFileSync(settingsFile, JSON.stringify({ theme: 'sepia' }));
    const first = await Effect.runPromise(
      prepareDesktopUserState({
        userDataPath: directory,
        settingsFile,
        migrationSql: userStateMigrationSql,
        clientId,
      }),
    );
    const modifiedBefore = statSync(first.filename).mtimeMs;
    const deviceModifiedBefore = statSync(path.join(directory, 'device-state.v1.json')).mtimeMs;
    const logs: string[] = [];

    const second = await Effect.runPromise(
      prepareDesktopUserState({
        userDataPath: directory,
        settingsFile,
        migrationSql: userStateMigrationSql,
        clientId,
        log: (line) => logs.push(line),
      }),
    );

    expect(second).toEqual({ ...first, activated: false });
    expect(statSync(first.filename).mtimeMs).toBe(modifiedBefore);
    expect(statSync(path.join(directory, 'device-state.v1.json')).mtimeMs).toBe(
      deviceModifiedBefore,
    );
    expect(logs.some((line) => line.includes('already-active'))).toBe(true);
    expect(logs.some((line) => line.includes('generation-reopened'))).toBe(false);
  });

  test('recovers from a corrupt marker and removes only known inactive generation files', async () => {
    const directory = makeDirectory();
    const marker = path.join(directory, 'user-state.active');
    const inactive = path.join(directory, 'user-state-v1-deadbeefdeadbeef.sqlite');
    const inactiveWal = `${inactive}-wal`;
    const inactiveJournal = `${inactive}-journal`;
    const unrelated = path.join(directory, 'user-state-not-ours.sqlite');
    const unrelatedSuffix = `${inactive}-backup`;
    writeFileSync(marker, '../../not-a-generation');
    writeFileSync(inactive, 'interrupted');
    writeFileSync(inactiveWal, 'interrupted wal');
    writeFileSync(inactiveJournal, 'interrupted journal');
    writeFileSync(unrelated, 'keep');
    writeFileSync(unrelatedSuffix, 'keep suffix');
    writeFileSync(path.join(directory, 'user-state.active.tmp'), 'interrupted marker');

    const result = await Effect.runPromise(
      prepareDesktopUserState({
        userDataPath: directory,
        migrationSql: userStateMigrationSql,
        clientId,
      }),
    );

    expect(result.activated).toBe(true);
    expect(existsSync(inactive)).toBe(false);
    expect(existsSync(inactiveWal)).toBe(false);
    expect(existsSync(inactiveJournal)).toBe(false);
    expect(readFileSync(unrelated, 'utf8')).toBe('keep');
    expect(readFileSync(unrelatedSuffix, 'utf8')).toBe('keep suffix');
    expect(readFileSync(marker, 'utf8').trim()).toBe(result.generation);
    expect(existsSync(path.join(directory, 'user-state.active.tmp'))).toBe(false);
  });

  test('semantic mismatch prevents activation', async () => {
    const directory = makeDirectory();
    const generation = 'user-state-v1-1111111111111111';
    const adapter = makeDesktopCanonicalGenerationAdapter({
      userDataPath: directory,
      migrationSql: userStateMigrationSql,
      clientId,
      verificationTimestamp,
      log: () => undefined,
    });
    const sourceId = Schema.decodeSync(MigrationSourceId)('desktop-test-mismatch');
    const result = await Effect.runPromiseExit(
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
    expect(existsSync(path.join(directory, 'user-state.active'))).toBe(false);
  });

  test('device-state persistence failure prevents canonical marker activation', async () => {
    const directory = makeDirectory();
    mkdirSync(path.join(directory, 'device-state.v1.json.tmp'));
    const generation = 'user-state-v1-2222222222222222';
    const adapter = makeDesktopCanonicalGenerationAdapter({
      userDataPath: directory,
      migrationSql: userStateMigrationSql,
      clientId,
      verificationTimestamp,
      deviceState: { uiScale: 'lg' },
      log: () => undefined,
    });

    const result = await Effect.runPromiseExit(
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
    expect(existsSync(path.join(directory, 'user-state.active'))).toBe(false);
  });
});
