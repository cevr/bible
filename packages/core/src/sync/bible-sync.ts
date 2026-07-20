#!/usr/bin/env bun
/** Builds the canonical unified Bible database from bundled source catalogs. */

import * as SqliteBun from '@effect/sql-sqlite-bun/SqliteClient';
import { Effect, Layer } from 'effect';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { BibleCorpus, decodeBibleCorpusArchive } from '../bible-db/index.js';

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

  const archive = await Effect.runPromise(
    decodeBibleCorpusArchive({
      kjv: loadJson(paths.assetsDirectory, 'kjv.json'),
      strongsVerses: loadJson(paths.assetsDirectory, 'kjv-strongs.json'),
      strongsLexicon: loadJson(paths.assetsDirectory, 'strongs.json'),
      openBibleCrossReferences: loadJson(paths.assetsDirectory, 'cross-refs.json'),
      tskeCrossReferences: loadJson(paths.assetsDirectory, 'cross-refs-tske.json'),
      marginNotes: loadJson(paths.assetsDirectory, 'margin-notes.json'),
      topics: loadJson(paths.assetsDirectory, 'naves-topical-bible.json'),
    }),
  );

  console.log(`Creating database at ${paths.database}...`);
  try {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const corpus = yield* BibleCorpus;
        console.log('Installing canonical Bible Corpus...');
        return yield* corpus.install(archive, new Date().toISOString());
      }).pipe(Effect.provide(corpusLayer(buildingDatabase))),
    );

    removeDatabaseFiles(paths.database);
    fs.renameSync(buildingDatabase, paths.database);

    console.log(`  Verses: ${result.kjv.verses}`);
    console.log(`  Strong's verses: ${result.kjv.withStrongs}`);
    console.log(`  Strong's definitions: ${result.lexicon.imported}`);
    console.log(`  OpenBible references: ${result.openBible.imported}`);
    console.log(`  TSKe references: ${result.tske.imported}`);
    console.log(`  Margin notes: ${result.marginNotes.imported}`);
    console.log(`  Topics: ${result.topics.topics}`);
    console.log(`  Topic references: ${result.topics.references}`);
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
