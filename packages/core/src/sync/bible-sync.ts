/** Builds the canonical unified Bible database from bundled source catalogs. */

import * as SqliteBun from '@effect/sql-sqlite-bun/SqliteClient';
import { Config, Console, DateTime, Effect, FileSystem, Layer, Option, Path, Schema } from 'effect';

import { BibleCorpus, decodeBibleCorpusArchive } from '../bible-db/index.js';

export interface BibleSyncPaths {
  readonly assetsDirectory: string;
  readonly database: string;
  readonly runtimeDatabase?: string;
}

const decodeJson = Schema.decodeUnknownEffect(Schema.UnknownFromJsonString);

export const defaultBibleSyncPaths = Effect.fn('BibleSync.defaultPaths')(function* () {
  const path = yield* Path.Path;
  const home = yield* Config.string('HOME').pipe(
    Config.orElse(() => Config.string('USERPROFILE')),
    Config.option,
  );
  const dataDirectory = path.resolve(import.meta.dir, '../../data');
  let runtimeDatabase: string | undefined;
  if (Option.isSome(home)) runtimeDatabase = path.join(home.value, '.bible', 'bible.db');
  return {
    assetsDirectory: path.resolve(import.meta.dir, '../../assets'),
    database: path.resolve(dataDirectory, 'bible.db'),
    runtimeDatabase,
  } satisfies BibleSyncPaths;
});

const removeDatabaseFiles = Effect.fn('BibleSync.removeDatabaseFiles')(function* (
  filename: string,
) {
  const fs = yield* FileSystem.FileSystem;
  for (const candidate of [filename, `${filename}-shm`, `${filename}-wal`]) {
    yield* fs.remove(candidate, { force: true });
  }
});

const loadJson = Effect.fn('BibleSync.loadJson')(function* (
  assetsDirectory: string,
  filename: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  yield* Console.log(`Loading ${filename}...`);
  const source = yield* fs.readFileString(path.join(assetsDirectory, filename));
  return yield* decodeJson(source);
});

const corpusLayer = (filename: string) =>
  BibleCorpus.layer.pipe(
    Layer.provide(
      SqliteBun.layer({
        filename,
        create: true,
        readwrite: true,
        disableWAL: true,
      }),
    ),
  );

export const syncBible = Effect.fn('BibleSync.syncBible')(function* (
  force: boolean,
  paths: BibleSyncPaths,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  yield* Console.log('=== Bible Database Sync ===\n');

  if ((yield* fs.exists(paths.database)) && !force) {
    yield* Console.log('Database already exists. Use --force to recreate.');
    return;
  }

  yield* fs.makeDirectory(path.dirname(paths.database), { recursive: true });
  const buildingDatabase = `${paths.database}.building`;
  yield* removeDatabaseFiles(buildingDatabase);

  const archive = yield* Effect.all(
    {
      kjv: loadJson(paths.assetsDirectory, 'kjv.json'),
      strongsVerses: loadJson(paths.assetsDirectory, 'kjv-strongs.json'),
      strongsLexicon: loadJson(paths.assetsDirectory, 'strongs.json'),
      openBibleCrossReferences: loadJson(paths.assetsDirectory, 'cross-refs.json'),
      tskeCrossReferences: loadJson(paths.assetsDirectory, 'cross-refs-tske.json'),
      marginNotes: loadJson(paths.assetsDirectory, 'margin-notes.json'),
      topics: loadJson(paths.assetsDirectory, 'naves-topical-bible.json'),
    },
    { concurrency: 1 },
  ).pipe(Effect.flatMap(decodeBibleCorpusArchive));

  yield* Console.log(`Creating database at ${paths.database}...`);
  const install = Effect.gen(function* () {
    const now = yield* DateTime.now;
    const result = yield* Effect.gen(function* () {
      const corpus = yield* BibleCorpus;
      yield* Console.log('Installing canonical Bible Corpus...');
      return yield* corpus.install(archive, DateTime.formatIso(now));
    }).pipe(Effect.provide(corpusLayer(buildingDatabase)));

    yield* removeDatabaseFiles(paths.database);
    yield* fs.rename(buildingDatabase, paths.database);

    yield* Console.log(`  Verses: ${String(result.kjv.verses)}`);
    yield* Console.log(`  Strong's verses: ${String(result.kjv.withStrongs)}`);
    yield* Console.log(`  Strong's definitions: ${String(result.lexicon.imported)}`);
    yield* Console.log(`  OpenBible references: ${String(result.openBible.imported)}`);
    yield* Console.log(`  TSKe references: ${String(result.tske.imported)}`);
    yield* Console.log(`  Margin notes: ${String(result.marginNotes.imported)}`);
    yield* Console.log(`  Topics: ${String(result.topics.topics)}`);
    yield* Console.log(`  Topic references: ${String(result.topics.references)}`);
  });
  yield* install.pipe(
    Effect.onError(() => removeDatabaseFiles(buildingDatabase).pipe(Effect.ignore)),
  );

  if (paths.runtimeDatabase !== undefined) {
    yield* fs.makeDirectory(path.dirname(paths.runtimeDatabase), { recursive: true });
    yield* fs.copyFile(paths.database, paths.runtimeDatabase);
    yield* Console.log(`\nCopied to runtime location: ${paths.runtimeDatabase}`);
  }

  const details = yield* fs.stat(paths.database);
  const sizeMB = (Number(details.size) / 1024 / 1024).toFixed(2);
  yield* Console.log('\n=== Sync Complete ===');
  yield* Console.log(`Database: ${paths.database}`);
  yield* Console.log(`Size: ${sizeMB} MB`);
});
