/** The one thing this URI builder has to get right: the path SQLite opens is
 *  the path the caller named.
 *
 *  `?` and `#` are the whole test. Both are legal in a POSIX filename and both
 *  are URI delimiters, so an encoder that preserves delimiters — `encodeURI`,
 *  which the two copies of this helper used to call — hands SQLite a URI whose
 *  path ends early and whose query string is whatever the directory name
 *  happened to contain. The stat check and the open then disagree about which
 *  file they mean, which is the failure mode this file falsifies.
 */

import * as SqliteBun from '@effect/sql-sqlite-bun/SqliteClient';
import { Database } from 'bun:sqlite';
import { Effect, FileSystem, type Layer, type Scope } from 'effect';
import { SqlClient } from 'effect/unstable/sql';
import { describe, expect, it } from 'effect-bun-test';

import { BunFileSystem } from '@effect/platform-bun';

import { immutableFileUri } from './immutable-uri.js';

/** A directory whose name carries both delimiters, plus a space and a percent
 *  sign for good measure — every character that has to survive the round trip
 *  in one name. */
const HOSTILE = 'weird?dir#1 100%';

/** The read half of the strong assertion, at its own boundary: the SQLite
 *  client layer is built from the file this helper is handed, so the provide
 *  belongs to this effect rather than to a block nested inside the test. */
const readMarkerValues = (file: string): Effect.Effect<readonly string[], never, Scope.Scope> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const rows = yield* sql<{ readonly value: string }>`SELECT value FROM marker`;
    return rows.map((row) => row.value);
  }).pipe(
    Effect.provide(
      SqliteBun.layer({
        filename: immutableFileUri(file),
        readonly: true,
        readwrite: false,
        create: false,
        disableWAL: true,
      }) as Layer.Layer<SqlClient.SqlClient>,
    ),
    Effect.orDie,
  );

const hostileDirectory = (): Effect.Effect<string, never, FileSystem.FileSystem | Scope.Scope> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const parent = yield* fs
      .makeTempDirectoryScoped({ prefix: 'bible-immutable-uri-' })
      .pipe(Effect.orDie);
    const directory = `${parent}/${HOSTILE}`;
    yield* fs.makeDirectory(directory).pipe(Effect.orDie);
    return directory;
  });

describe('immutableFileUri', () => {
  it.effect('encodes the delimiters that would otherwise truncate the path', () =>
    Effect.sync(() => {
      const uri = immutableFileUri('/tmp/weird?dir#1/topics.db');
      // The delimiters are gone from the path half; `?immutable=1` is the only
      // query string. Under `encodeURI` this read
      // `file:/tmp/weird?dir#1/topics.db?immutable=1`, whose path was
      // `/tmp/weird`.
      expect(uri).toBe('file:/tmp/weird%3Fdir%231/topics.db?immutable=1');
      expect(uri.indexOf('?')).toBe(uri.lastIndexOf('?'));
      expect(uri).not.toContain('#');
    }),
  );

  it.effect('keeps `/` a separator and leaves an already-formed URI alone', () =>
    Effect.sync(() => {
      expect(immutableFileUri('/a/b/c.db')).toBe('file:/a/b/c.db?immutable=1');
      expect(immutableFileUri('file:/a/b.db?mode=ro')).toBe('file:/a/b.db?mode=ro&immutable=1');
    }),
  );

  const test = it.scopedLive.layer(BunFileSystem.layer);

  test('opens the file the caller named, not a prefix of it', () =>
    Effect.gen(function* () {
      const directory = yield* hostileDirectory();
      const file = `${directory}/artifact.db`;
      yield* Effect.sync(() => {
        const database = new Database(file, { create: true });
        database.exec(`CREATE TABLE marker (value TEXT NOT NULL);`);
        database.prepare('INSERT INTO marker (value) VALUES (?)').run('present');
        database.close();
      });

      // The strong form of the assertion: a real read-only, no-create open
      // through the real driver. With `encodeURI` the URI's path was the
      // truncated `…/weird`, `create: false` refused to conjure it, and the
      // open died — the artifact was on disk and unreadable for no reason but
      // its parent directory's name.
      const values = yield* readMarkerValues(file);

      expect(values).toEqual(['present']);
    }));
});
