#!/usr/bin/env bun
/** Builds the canonical unified Bible database from bundled source catalogs. */

import * as SqliteBun from '@effect/sql-sqlite-bun/SqliteClient';
import { Effect, Layer } from 'effect';
import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  BibleCorpus,
  type CrossReferenceAsset,
  type KjvAssetFile,
  type MarginNotesAsset,
  type StrongsLexiconAsset,
  type StrongsVerseAsset,
} from '../bible-db/index.js';

export interface BibleSyncPaths {
  readonly assetsDirectory: string;
  readonly database: string;
  readonly runtimeDatabase?: string;
}

const DATA_DIR = path.resolve(import.meta.dir, '../../data');

export const DEFAULT_BIBLE_SYNC_PATHS: BibleSyncPaths = {
  assetsDirectory: path.resolve(import.meta.dir, '../../assets'),
  database: path.resolve(DATA_DIR, 'bible.db'),
  runtimeDatabase: (() => {
    const home = process.env['HOME'] ?? process.env['USERPROFILE'];
    return home === undefined ? undefined : path.join(home, '.bible', 'bible.db');
  })(),
};

const removeDatabaseFiles = (filename: string): void => {
  for (const candidate of [filename, `${filename}-shm`, `${filename}-wal`]) {
    fs.rmSync(candidate, { force: true });
  }
};

const loadJson = (assetsDirectory: string, filename: string): unknown => {
  const filepath = path.join(assetsDirectory, filename);
  console.log(`Loading ${filename}...`);
  return JSON.parse(fs.readFileSync(filepath, 'utf8')) as unknown;
};

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

export async function syncBible(
  force: boolean,
  paths: BibleSyncPaths = DEFAULT_BIBLE_SYNC_PATHS,
): Promise<void> {
  console.log('=== Bible Database Sync ===\n');

  if (fs.existsSync(paths.database) && !force) {
    console.log('Database already exists. Use --force to recreate.');
    return;
  }

  fs.mkdirSync(path.dirname(paths.database), { recursive: true });
  const buildingDatabase = `${paths.database}.building`;
  removeDatabaseFiles(buildingDatabase);

  const kjv = loadJson(paths.assetsDirectory, 'kjv.json') as KjvAssetFile;
  const kjvStrongs = loadJson(
    paths.assetsDirectory,
    'kjv-strongs.json',
  ) as readonly StrongsVerseAsset[];
  const strongs = loadJson(paths.assetsDirectory, 'strongs.json') as Readonly<
    Record<string, StrongsLexiconAsset>
  >;
  const openBible = loadJson(paths.assetsDirectory, 'cross-refs.json') as CrossReferenceAsset;
  const tskePath = path.join(paths.assetsDirectory, 'cross-refs-tske.json');
  const tske = fs.existsSync(tskePath)
    ? (loadJson(paths.assetsDirectory, 'cross-refs-tske.json') as CrossReferenceAsset)
    : null;
  const marginNotes = loadJson(paths.assetsDirectory, 'margin-notes.json') as MarginNotesAsset;

  console.log(`Creating database at ${paths.database}...`);
  try {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const corpus = yield* BibleCorpus;

        console.log("Importing KJV verses and Strong's word mappings...");
        const kjvResult = yield* corpus.importKjv(kjv, kjvStrongs);

        console.log("Importing Strong's lexicon...");
        const lexiconResult = yield* corpus.importStrongsLexicon(strongs);

        console.log('Importing OpenBible cross-references...');
        const openBibleResult = yield* corpus.importCrossReferences('openbible', openBible);

        const tskeResult =
          tske === null
            ? null
            : yield* corpus
                .importCrossReferences('tske', tske)
                .pipe(
                  Effect.tap(() =>
                    Effect.sync(() => console.log('Imported TSKe cross-references.')),
                  ),
                );

        console.log('Importing KJV margin notes...');
        const marginResult = yield* corpus.importMarginNotes(marginNotes);

        console.log('Optimizing database...');
        yield* corpus.finalizeImport(new Date().toISOString());

        return { kjvResult, lexiconResult, openBibleResult, tskeResult, marginResult };
      }).pipe(Effect.provide(corpusLayer(buildingDatabase))),
    );

    removeDatabaseFiles(paths.database);
    fs.renameSync(buildingDatabase, paths.database);

    console.log(`  Verses: ${result.kjvResult.verses}`);
    console.log(`  Strong's verses: ${result.kjvResult.withStrongs}`);
    console.log(`  Strong's definitions: ${result.lexiconResult.imported}`);
    console.log(`  OpenBible references: ${result.openBibleResult.imported}`);
    console.log(`  TSKe references: ${result.tskeResult?.imported ?? 0}`);
    console.log(`  Margin notes: ${result.marginResult.imported}`);
  } catch (error) {
    removeDatabaseFiles(buildingDatabase);
    throw error;
  }

  if (paths.runtimeDatabase !== undefined) {
    fs.mkdirSync(path.dirname(paths.runtimeDatabase), { recursive: true });
    fs.copyFileSync(paths.database, paths.runtimeDatabase);
    console.log(`\nCopied to runtime location: ${paths.runtimeDatabase}`);
  }

  const sizeMB = (fs.statSync(paths.database).size / 1024 / 1024).toFixed(2);
  console.log('\n=== Sync Complete ===');
  console.log(`Database: ${paths.database}`);
  console.log(`Size: ${sizeMB} MB`);
}

if (import.meta.main) {
  const force = process.argv.slice(2).includes('--force');
  syncBible(force).catch((error: unknown) => {
    console.error('Sync failed:', error);
    process.exitCode = 1;
  });
}
