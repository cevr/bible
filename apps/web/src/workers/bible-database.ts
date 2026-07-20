import * as BrowserHttpClient from '@effect/platform-browser/BrowserHttpClient';
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
import { HttpClient } from 'effect/unstable/http';
import * as SQLite from 'wa-sqlite';

import type { BibleGenerationStore } from './bible-generation-store.js';
import type { DatabaseFileDownloader } from './database-file-downloader.js';
import type { SqliteDatabase } from './sqlite-database.js';

const sourceError = (operation: string, cause: unknown): CorpusSourceUnavailableError =>
  new CorpusSourceUnavailableError({ operation, cause });

const countRows = Effect.fn('BrowserBibleArtifacts.countRows')(function* (
  database: SqliteDatabase,
  table: string,
  where = '',
) {
  const rows = yield* database.query(`SELECT COUNT(*) AS count FROM ${table} ${where}`);
  const value = rows[0]?.['count'];
  if (typeof value !== 'number') return yield* Effect.fail(`Cannot count ${table}`);
  return value;
});

const verifyBibleDatabase = Effect.fn('BrowserBibleArtifacts.verify')(function* (
  database: SqliteDatabase,
) {
  const integrity = yield* database.query('PRAGMA integrity_check');
  if (integrity[0]?.['integrity_check'] !== 'ok') {
    return yield* Effect.fail('SQLite integrity check failed');
  }
  if ((yield* countRows(database, 'books')) !== 66) {
    return yield* Effect.fail('Bible Artifact lacks the 66-book Canon');
  }
  const verses = yield* countRows(database, 'verses', "WHERE version_code = 'KJV'");
  if (verses !== 31_102) {
    return yield* Effect.fail(`Bible Artifact contains ${String(verses)} KJV Verses`);
  }
  if ((yield* countRows(database, 'strongs')) === 0) {
    return yield* Effect.fail("Bible Artifact has no Strong's lexicon");
  }
  if ((yield* countRows(database, 'cross_refs', "WHERE source = 'openbible'")) === 0) {
    return yield* Effect.fail('Bible Artifact has no OpenBible Cross References');
  }
  if ((yield* countRows(database, 'cross_refs', "WHERE source = 'tske'")) === 0) {
    return yield* Effect.fail('Bible Artifact has no TSKe Cross References');
  }
  if ((yield* countRows(database, 'margin_notes')) === 0) {
    return yield* Effect.fail('Bible Artifact has no Margin Notes');
  }
  if ((yield* countRows(database, 'topics')) === 0) {
    return yield* Effect.fail('Bible Artifact has no Topics');
  }
  return verses;
});

const readProvenance = (database: SqliteDatabase): Effect.Effect<Option.Option<CorpusProvenance>> =>
  Effect.gen(function* () {
    yield* verifyBibleDatabase(database);
    const rows = yield* database.query(
      "SELECT key, value FROM meta WHERE key IN ('corpus_source', 'corpus_revision', 'corpus_digest')",
    );
    const values = new Map(rows.map((row) => [row['key'], row['value']]));
    const source = values.get('corpus_source');
    const revision = values.get('corpus_revision');
    const digest = values.get('corpus_digest');
    if (typeof source !== 'string' || typeof revision !== 'string' || typeof digest !== 'string') {
      return yield* Effect.fail('Bible Artifact provenance is incomplete');
    }
    return new CorpusProvenance({
      source: assetSourceId(source),
      revision: corpusRevision(revision),
      digest: Option.some(corpusDigest(digest)),
    });
  }).pipe(Effect.option);

const generationName = Effect.fn('BrowserBibleArtifacts.generationName')(function* (
  provenance: CorpusProvenance,
) {
  if (Option.isNone(provenance.digest)) return yield* Effect.fail('Artifact digest is required');
  const digest = provenance.digest.value;
  const revision = provenance.revision.replace(/[^a-zA-Z0-9._-]/gu, '-');
  return `bible-${revision}-${digest.slice('sha256:'.length, 'sha256:'.length + 12)}.db`;
});

const writeProvenance = Effect.fn('BrowserBibleArtifacts.writeProvenance')(function* (
  database: SqliteDatabase,
  provenance: CorpusProvenance,
) {
  if (Option.isNone(provenance.digest)) return yield* Effect.fail('Artifact digest is required');
  const digest = provenance.digest.value;
  yield* database.exec('BEGIN IMMEDIATE');
  const upsert =
    'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value';
  const write = Effect.gen(function* () {
    yield* database.write(upsert, ['corpus_source', provenance.source]);
    yield* database.write(upsert, ['corpus_revision', provenance.revision]);
    yield* database.write(upsert, ['corpus_digest', digest]);
    yield* database.exec('COMMIT');
  });
  yield* write.pipe(Effect.onError(() => database.exec('ROLLBACK').pipe(Effect.ignore)));
});

interface BrowserArtifactResponse {
  readonly status: number;
  readonly bytes: Stream.Stream<Uint8Array, unknown>;
}

const defaultFetchArtifact = (url: string): Effect.Effect<BrowserArtifactResponse, unknown> =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;
    const response = yield* client.get(url);
    return { status: response.status, bytes: response.stream };
  }).pipe(Effect.provide(BrowserHttpClient.layerFetch));

export const layerBrowserBibleArtifacts = (input: {
  readonly generations: BibleGenerationStore;
  readonly downloader: DatabaseFileDownloader;
  readonly fetch?: (url: string) => Effect.Effect<BrowserArtifactResponse, unknown>;
  readonly onProgress?: (progress: number) => void;
}): Layer.Layer<BibleArtifactInstaller | BibleArtifactRecipe> => {
  const fetchArtifact = input.fetch ?? defaultFetchArtifact;
  const onProgress = input.onProgress ?? (() => undefined);
  const recipe = layerBibleArtifactRecipe([
    {
      kind: 'release',
      acquire: Effect.succeed({
        kind: 'release',
        provenance: new CorpusProvenance({
          source: assetSourceId('bible-release'),
          revision: corpusRevision(BIBLE_ARTIFACT_RELEASE.revision),
          digest: Option.some(corpusDigest(BIBLE_ARTIFACT_RELEASE.digest)),
        }),
        bytes: Stream.unwrap(
          fetchArtifact('/api/assets/bible').pipe(
            Effect.mapError((cause) => sourceError('fetch-bible-release', cause)),
            Effect.flatMap((response) => {
              if (response.status < 200 || response.status >= 300) {
                return Effect.fail(
                  sourceError('fetch-bible-release', `HTTP ${String(response.status)}`),
                );
              }
              return Effect.succeed(
                response.bytes.pipe(
                  Stream.mapError((cause) => sourceError('read-bible-release', cause)),
                ),
              );
            }),
          ),
        ),
      }),
    },
  ]);
  const installer = Layer.succeed(
    BibleArtifactInstaller,
    BibleArtifactInstaller.of({
      current: Effect.gen(function* () {
        if (!(yield* input.generations.openActive())) return Option.none();
        return yield* readProvenance(input.generations.active);
      }).pipe(Effect.mapError((cause) => new CorpusInstallationError({ corpus: 'bible', cause }))),
      install: (artifact) =>
        Effect.gen(function* () {
          if (Option.isNone(artifact.provenance.digest)) {
            return yield* Effect.fail('Artifact digest is required');
          }
          const expectedDigest = artifact.provenance.digest.value;
          const preferredName = yield* generationName(artifact.provenance);
          let candidateName: string | undefined;
          const install = Effect.gen(function* () {
            const reserved = yield* input.generations.reserve(preferredName);
            candidateName = reserved.filename;
            const written = yield* input.downloader.install(
              artifact.bytes,
              candidateName,
              onProgress,
            );
            if (written.digest !== expectedDigest) {
              return yield* Effect.fail(
                'Bible Artifact digest does not match its release manifest',
              );
            }
            const provenance = new CorpusProvenance({
              source: artifact.provenance.source,
              revision: artifact.provenance.revision,
              digest: Option.some(corpusDigest(written.digest)),
            });
            const installed = yield* Effect.acquireUseRelease(
              reserved.database.open(SQLite.SQLITE_OPEN_READWRITE),
              () =>
                verifyBibleDatabase(reserved.database).pipe(
                  Effect.tap(() => writeProvenance(reserved.database, provenance)),
                ),
              () => reserved.database.close().pipe(Effect.ignore),
            );
            yield* input.generations.activateVerified(candidateName);
            return { installed, provenance };
          });
          return yield* install.pipe(
            Effect.onError(() => {
              if (
                candidateName !== undefined &&
                input.generations.activeFilename !== candidateName
              ) {
                return input.generations.discardCandidate(candidateName).pipe(Effect.ignore);
              }
              return Effect.void;
            }),
          );
        }).pipe(
          Effect.mapError((cause) => new CorpusInstallationError({ corpus: 'bible', cause })),
        ),
    }),
  );
  return Layer.merge(recipe, installer);
};
