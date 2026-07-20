import {
  assetSourceId,
  BIBLE_ARTIFACT_RELEASE,
  BibleArtifactInstaller,
  type BibleArtifactRecipe,
  corpusDigest,
  corpusRevision,
  CorpusInstallationError,
  CorpusProvenance,
  CorpusSourceUnavailableError,
  layerBibleArtifactRecipe,
} from '@bible/core/corpus-supply';
import { Effect, Layer, Option, Stream } from 'effect';
import * as SQLite from 'wa-sqlite';

import type { DatabaseFileDownloader } from './database-file-downloader.js';
import type { SqliteDatabase } from './sqlite-database.js';

const sourceError = (operation: string, cause: unknown): CorpusSourceUnavailableError =>
  new CorpusSourceUnavailableError({ operation, cause });

const verifyBibleDatabase = async (database: SqliteDatabase): Promise<number> => {
  const count = async (table: string, where = ''): Promise<number> => {
    const rows = await database.query(`SELECT COUNT(*) AS count FROM ${table} ${where}`);
    const value = rows[0]?.['count'];
    if (typeof value !== 'number') throw new Error(`Cannot count ${table}`);
    return value;
  };
  const integrity = await database.query('PRAGMA integrity_check');
  if (integrity[0]?.['integrity_check'] !== 'ok') throw new Error('SQLite integrity check failed');
  if ((await count('books')) !== 66) throw new Error('Bible Artifact lacks the 66-book Canon');
  const verses = await count('verses', "WHERE version_code = 'KJV'");
  if (verses !== 31_102) throw new Error(`Bible Artifact contains ${String(verses)} KJV Verses`);
  if ((await count('strongs')) === 0) throw new Error("Bible Artifact has no Strong's lexicon");
  if ((await count('cross_refs', "WHERE source = 'openbible'")) === 0)
    throw new Error('Bible Artifact has no OpenBible Cross References');
  if ((await count('cross_refs', "WHERE source = 'tske'")) === 0)
    throw new Error('Bible Artifact has no TSKe Cross References');
  if ((await count('margin_notes')) === 0) throw new Error('Bible Artifact has no Margin Notes');
  if ((await count('topics')) === 0) throw new Error('Bible Artifact has no Topics');
  return verses;
};

const readProvenance = async (
  database: SqliteDatabase,
): Promise<Option.Option<CorpusProvenance>> => {
  try {
    await verifyBibleDatabase(database);
    const rows = await database.query(
      "SELECT key, value FROM meta WHERE key IN ('corpus_source', 'corpus_revision', 'corpus_digest')",
    );
    const values = new Map(rows.map((row) => [row['key'], row['value']]));
    const source = values.get('corpus_source');
    const revision = values.get('corpus_revision');
    const digest = values.get('corpus_digest');
    if (typeof source !== 'string' || typeof revision !== 'string' || typeof digest !== 'string') {
      return Option.none();
    }
    return Option.some(
      new CorpusProvenance({
        source: assetSourceId(source),
        revision: corpusRevision(revision),
        digest: Option.some(corpusDigest(digest)),
      }),
    );
  } catch {
    return Option.none();
  }
};

export const layerBrowserBibleArtifacts = (input: {
  readonly database: SqliteDatabase;
  readonly downloader: DatabaseFileDownloader;
  readonly fetch?: (url: string) => Promise<Response>;
  readonly onProgress?: (progress: number) => void;
}): Layer.Layer<BibleArtifactInstaller | BibleArtifactRecipe> => {
  const fetchArtifact = input.fetch ?? globalThis.fetch;
  const recipe = layerBibleArtifactRecipe([
    {
      kind: 'release',
      acquire: Effect.succeed({
        kind: 'release',
        provenance: new CorpusProvenance({
          source: assetSourceId('bible-release'),
          revision: corpusRevision(BIBLE_ARTIFACT_RELEASE.revision),
          digest: Option.none(),
        }),
        bytes: Stream.unwrap(
          Effect.tryPromise({
            try: async () => {
              const response = await fetchArtifact(BIBLE_ARTIFACT_RELEASE.url);
              if (!response.ok) throw new Error(`HTTP ${String(response.status)}`);
              if (response.body === null) throw new Error('response has no body');
              return Stream.fromReadableStream({
                evaluate: () => response.body as ReadableStream<Uint8Array>,
                onError: (cause) => sourceError('read-bible-release', cause),
              });
            },
            catch: (cause) => sourceError('fetch-bible-release', cause),
          }),
        ),
      }),
    },
  ]);
  const installer = Layer.succeed(
    BibleArtifactInstaller,
    BibleArtifactInstaller.of({
      current: Effect.tryPromise({
        try: async () => {
          await input.database.open(SQLite.SQLITE_OPEN_READWRITE | SQLite.SQLITE_OPEN_CREATE);
          return readProvenance(input.database);
        },
        catch: (cause) => new CorpusInstallationError({ corpus: 'bible', cause }),
      }),
      install: (artifact) =>
        Effect.tryPromise({
          try: async () => {
            await input.database.close();
            const written = await input.downloader.install(
              artifact.bytes,
              'bible.db',
              input.onProgress ?? (() => undefined),
            );
            await input.database.open(SQLite.SQLITE_OPEN_READWRITE);
            const installed = await verifyBibleDatabase(input.database);
            const provenance = new CorpusProvenance({
              source: artifact.provenance.source,
              revision: artifact.provenance.revision,
              digest: Option.some(corpusDigest(written.digest)),
            });
            await input.database.write(
              'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
              ['corpus_source', provenance.source],
            );
            await input.database.write(
              'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
              ['corpus_revision', provenance.revision],
            );
            await input.database.write(
              'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
              ['corpus_digest', written.digest],
            );
            return { installed, provenance };
          },
          catch: (cause) => new CorpusInstallationError({ corpus: 'bible', cause }),
        }),
    }),
  );
  return Layer.merge(recipe, installer);
};
