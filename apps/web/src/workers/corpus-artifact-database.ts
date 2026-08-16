import * as BrowserHttpClient from '@effect/platform-browser/BrowserHttpClient';
import {
  assetSourceId,
  BIBLE_ARTIFACT_RELEASE,
  BibleArtifact,
  TOPICS_ARTIFACT_RELEASE,
  TopicsArtifact,
  type TopicsArtifactInstaller,
  type TopicsArtifactRecipe,
  type FileArtifactSourceService,
  type BibleArtifactInstaller,
  type BibleArtifactRecipe,
  corpusDigest,
  corpusRevision,
  CorpusInstallationError,
  CorpusProvenance,
  CorpusSourceUnavailableError,
  registeredCorpusName,
  verifyTopicsArtifact,
  type CorpusStorageIdentity,
  type FileArtifactRelease,
  type FileCorpusArtifact,
  type TopicsArtifactReader,
} from '@bible/core/corpus-supply';
import { Effect, Layer, Option, Predicate, Stream } from 'effect';
import { HttpClient } from 'effect/unstable/http';
import * as SQLite from 'wa-sqlite';

import type { CorpusGenerationStore } from './corpus-generation-store.js';
import type { DatabaseFileDownloader } from './database-file-downloader.js';
import type { SqliteDatabase } from './sqlite-database.js';

const sourceError = (operation: string, cause: unknown): CorpusSourceUnavailableError =>
  CorpusSourceUnavailableError.make({ operation, cause });

const countRows = Effect.fn('BrowserCorpusArtifacts.countRows')(function* (
  database: SqliteDatabase,
  table: string,
  where = '',
) {
  const rows = yield* database.query(`SELECT COUNT(*) AS count FROM ${table} ${where}`);
  const value = rows[0]?.['count'];
  if (!Predicate.isNumber(value)) return yield* Effect.fail(`Cannot count ${table}`);
  return value;
});

export const verifyBibleDatabase = Effect.fn('BrowserCorpusArtifacts.verifyBible')(function* (
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

/** The browser `TopicsArtifactReader`: the three reads the shared verifier makes,
 *  expressed against a `wa-sqlite` connection. The *rules* are not restated here
 *  — they are `verifyTopicsArtifact`, the same function the native adapter runs,
 *  so a candidate generation refused on desktop is refused here for the same
 *  reason and with the same message. */
export const browserTopicsReader = (database: SqliteDatabase): TopicsArtifactReader => ({
  integrity: database
    .query('PRAGMA integrity_check')
    .pipe(Effect.map((rows) => String(rows[0]?.['integrity_check']))),
  meta: (key) =>
    database
      .query('SELECT value FROM meta WHERE key = ?', [key])
      .pipe(
        Effect.map((rows) =>
          Option.fromNullishOr(rows[0]?.['value']).pipe(Option.filter(Predicate.isString)),
        ),
      ),
  count: (table) => countRows(database, table),
});

/** The Topics semantic verifier (§3.5) over an open browser generation. */
export const verifyTopicsDatabase = (database: SqliteDatabase): Effect.Effect<number, unknown> =>
  verifyTopicsArtifact(browserTopicsReader(database));

/** Semantically verifies one candidate generation before it can be activated.
 *  Returns the row count the Activation reports as `installed`. */
export type BrowserArtifactVerifier = (database: SqliteDatabase) => Effect.Effect<number, unknown>;

const readProvenance = (
  database: SqliteDatabase,
  verify: BrowserArtifactVerifier,
  label: string,
): Effect.Effect<Option.Option<CorpusProvenance>> =>
  Effect.gen(function* () {
    yield* verify(database);
    const rows = yield* database.query(
      "SELECT key, value FROM meta WHERE key IN ('corpus_source', 'corpus_revision', 'corpus_digest')",
    );
    const values = new Map(rows.map((row) => [row['key'], row['value']]));
    const source = values.get('corpus_source');
    const revision = values.get('corpus_revision');
    const digest = values.get('corpus_digest');
    if (
      !Predicate.isString(source) ||
      !Predicate.isString(revision) ||
      !Predicate.isString(digest)
    ) {
      return yield* Effect.fail(`${label} Artifact provenance is incomplete`);
    }
    return CorpusProvenance.make({
      source: assetSourceId(source),
      revision: corpusRevision(revision),
      digest: Option.some(corpusDigest(digest)),
    });
  }).pipe(Effect.option);

const generationName = Effect.fn('BrowserCorpusArtifacts.generationName')(function* (
  identity: CorpusStorageIdentity<string>,
  provenance: CorpusProvenance,
) {
  if (Option.isNone(provenance.digest)) return yield* Effect.fail('Artifact digest is required');
  const digest = provenance.digest.value;
  return identity.generationFilename(
    provenance.revision,
    digest.slice('sha256:'.length, 'sha256:'.length + 12),
  );
});

const writeProvenance = Effect.fn('BrowserCorpusArtifacts.writeProvenance')(function* (
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

/** Installs one File Corpus Artifact into an inactive OPFS generation: reserve
 *  a candidate in the durable registry, stream and hash, reject a
 *  manifest-digest mismatch, semantically verify, write Provenance, then hand
 *  the reader over. Any failure discards the candidate and leaves the active
 *  generation in place. */
export const layerBrowserFileArtifacts = <Corpus extends string, RecipeId, InstallerId>(input: {
  readonly artifact: FileCorpusArtifact<Corpus, RecipeId, InstallerId>;
  /** The pinned release, or `None` for a corpus with no published release yet.
   *  A browser has no local disk to fall back to, so `None` means the recipe
   *  offers no source at all and `ensure` reports the corpus unavailable —
   *  which the §3.5 catch-and-warn posture turns into a log line, not a
   *  startup failure. The installer stays fully wired either way, so the
   *  active generation is still read and reported. */
  readonly release: Option.Option<FileArtifactRelease>;
  /** Bound to the same corpus as the artifact: both carry the typed storage
   *  identity, so the asset path, generation filenames, IndexedDB database, and
   *  registry key all come from one derivation and a store belonging to another
   *  corpus is a compile error rather than a silent shadowing. `NoInfer` keeps
   *  the store out of the inference sites for `Corpus`; without it TypeScript
   *  widens `Corpus` to the union of both arguments and a mismatched pair
   *  typechecks. */
  readonly generations: CorpusGenerationStore<NoInfer<Corpus>>;
  readonly downloader: DatabaseFileDownloader;
  readonly verify: BrowserArtifactVerifier;
  readonly fetch?: (url: string) => Effect.Effect<BrowserArtifactResponse, unknown>;
  readonly onProgress?: (progress: number) => void;
}): Layer.Layer<InstallerId | RecipeId> => {
  const corpus = input.artifact.corpus;
  const reportedCorpus = Option.getOrUndefined(registeredCorpusName(corpus));
  const label = input.artifact.label;
  const identity = input.artifact.storage;
  const verify = input.verify;
  const fetchArtifact = input.fetch ?? defaultFetchArtifact;
  const onProgress = input.onProgress ?? (() => {});
  const releaseSource = (release: FileArtifactRelease): FileArtifactSourceService => ({
    kind: 'release',
    acquire: Effect.succeed({
      kind: 'release',
      provenance: CorpusProvenance.make({
        source: assetSourceId(`${corpus}-release`),
        revision: corpusRevision(release.revision),
        digest: Option.some(corpusDigest(release.digest)),
      }),
      expectedSize: Option.some(release.size),
      bytes: Stream.unwrap(
        fetchArtifact(identity.assetPath).pipe(
          Effect.mapError((cause) => sourceError(`fetch-${corpus}-release`, cause)),
          Effect.flatMap((response) => {
            if (response.status < 200 || response.status >= 300) {
              return Effect.fail(
                sourceError(`fetch-${corpus}-release`, `HTTP ${String(response.status)}`),
              );
            }
            return Effect.succeed(
              response.bytes.pipe(
                Stream.mapError((cause) => sourceError(`read-${corpus}-release`, cause)),
              ),
            );
          }),
        ),
      ),
    }),
  });
  const recipe = input.artifact.layerRecipe(
    Option.match(input.release, {
      onNone: () => [],
      onSome: (release) => [releaseSource(release)],
    }),
  );
  const installer = input.artifact.layerInstaller({
    current: Effect.gen(function* () {
      if (!(yield* input.generations.openActive)) return Option.none();
      return yield* readProvenance(input.generations.active, verify, label);
    }).pipe(
      Effect.mapError((cause) => CorpusInstallationError.make({ corpus: reportedCorpus, cause })),
    ),
    install: (artifact) =>
      Effect.gen(function* () {
        if (Option.isNone(artifact.provenance.digest)) {
          return yield* Effect.fail('Artifact digest is required');
        }
        const expectedDigest = artifact.provenance.digest.value;
        const preferredName = yield* generationName(identity, artifact.provenance);
        let candidateName: Option.Option<string> = Option.none();
        const install = Effect.gen(function* () {
          const reserved = yield* input.generations.reserve(preferredName);
          candidateName = Option.some(reserved.filename);
          const written = yield* input.downloader.install(
            artifact.bytes,
            reserved.filename,
            onProgress,
          );
          // Size and digest are the whole trust surface, so both close before
          // the semantic verifier is allowed to open the candidate generation.
          if (Option.exists(artifact.expectedSize, (expected) => expected !== written.bytes)) {
            return yield* Effect.fail(`${label} Artifact size does not match its release manifest`);
          }
          if (written.digest !== expectedDigest) {
            return yield* Effect.fail(
              `${label} Artifact digest does not match its release manifest`,
            );
          }
          const provenance = CorpusProvenance.make({
            source: artifact.provenance.source,
            revision: artifact.provenance.revision,
            digest: Option.some(corpusDigest(written.digest)),
          });
          const installed = yield* Effect.acquireUseRelease(
            reserved.database.open(SQLite.SQLITE_OPEN_READWRITE),
            () =>
              verify(reserved.database).pipe(
                Effect.tap(() => writeProvenance(reserved.database, provenance)),
              ),
            () => reserved.database.close.pipe(Effect.ignore),
          );
          yield* input.generations.activateVerified(reserved.filename);
          return { installed, provenance };
        });
        return yield* install.pipe(
          Effect.onError(() =>
            Option.match(candidateName, {
              onNone: () => Effect.void,
              onSome: (candidate) => {
                if (Option.contains(input.generations.activeFilename, candidate)) {
                  return Effect.void;
                }
                return input.generations.discardCandidate(candidate).pipe(Effect.ignore);
              },
            }),
          ),
        );
      }).pipe(
        Effect.mapError((cause) => CorpusInstallationError.make({ corpus: reportedCorpus, cause })),
      ),
  });
  return Layer.merge(recipe, installer);
};

/** The Bible instance of the browser File Corpus lifecycle. */
export const layerBrowserBibleArtifacts = (input: {
  readonly generations: CorpusGenerationStore<'bible'>;
  readonly downloader: DatabaseFileDownloader;
  readonly fetch?: (url: string) => Effect.Effect<BrowserArtifactResponse, unknown>;
  readonly onProgress?: (progress: number) => void;
}): Layer.Layer<BibleArtifactInstaller | BibleArtifactRecipe> =>
  layerBrowserFileArtifacts({
    artifact: BibleArtifact,
    release: Option.some(BIBLE_ARTIFACT_RELEASE),
    generations: input.generations,
    downloader: input.downloader,
    verify: verifyBibleDatabase,
    fetch: input.fetch,
    onProgress: input.onProgress,
  });

/** The Topics instance of the browser File Corpus lifecycle. The browser has
 *  no local disk to read a workspace build from, so the release pin is its only
 *  source — until one is published, the recipe is empty and `ensure` reports
 *  the corpus unavailable, which the worker catches and warns on per §3.5. */
export const layerBrowserTopicsArtifacts = (input: {
  readonly generations: CorpusGenerationStore<'topics'>;
  readonly downloader: DatabaseFileDownloader;
  readonly fetch?: (url: string) => Effect.Effect<BrowserArtifactResponse, unknown>;
  readonly onProgress?: (progress: number) => void;
}): Layer.Layer<TopicsArtifactInstaller | TopicsArtifactRecipe> =>
  layerBrowserFileArtifacts({
    artifact: TopicsArtifact,
    release: TOPICS_ARTIFACT_RELEASE,
    generations: input.generations,
    downloader: input.downloader,
    verify: verifyTopicsDatabase,
    fetch: input.fetch,
    onProgress: input.onProgress,
  });
