import * as BunHttpClient from '@effect/platform-bun/BunHttpClient';
import * as BunServices from '@effect/platform-bun/BunServices';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

import { CorpusInstallationError, CorpusSourceUnavailableError } from '../corpus-supply/errors.js';
import {
  BibleArtifact,
  type BibleArtifactInstaller,
  type BibleArtifactRecipe,
  type FileArtifactSourceKind,
  type FileCorpusArtifact,
} from '../corpus-supply/file-artifact.js';
import {
  assetSourceId,
  corpusDigest,
  corpusRevision,
  CorpusProvenance,
  registeredCorpusName,
} from '../corpus-supply/model.js';
import Database from 'better-sqlite3';
import { Effect, FileSystem, Layer, Option, Path, Predicate, Schema, Stream } from 'effect';
import { HttpClient } from 'effect/unstable/http';

export interface LocalFileArtifactSource {
  readonly kind: Exclude<FileArtifactSourceKind, 'release'>;
  readonly path: string;
  readonly label: string;
}

export interface ReleaseFileArtifactSource {
  readonly kind: 'release';
  readonly url: string;
  readonly revision: string;
  readonly digest: string;
  /** The exact byte count the pinned manifest promises; rejected before the
   *  semantic verifier ever opens the file. */
  readonly size: number;
}

export type NativeFileArtifactSource = LocalFileArtifactSource | ReleaseFileArtifactSource;

const StoredProvenance = Schema.Struct({
  source: Schema.String,
  revision: Schema.String,
  digest: Schema.String,
});

export interface NativeFileArtifactProvenanceStore {
  readonly read: (filename: string) => Effect.Effect<CorpusProvenance, unknown>;
  readonly write: (filename: string, provenance: CorpusProvenance) => Effect.Effect<void, unknown>;
}

const sourceError = (operation: string, cause: unknown): CorpusSourceUnavailableError =>
  CorpusSourceUnavailableError.make({ operation, cause });

const localSource = (corpus: string, source: LocalFileArtifactSource) => ({
  kind: source.kind,
  acquire: Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const details = yield* fs.stat(source.path);
    if (details.type !== 'File' || details.size === 0n) {
      return yield* sourceError(`open-${corpus}-artifact:${source.label}`, 'source is empty');
    }
    const modified = Option.match(details.mtime, {
      onNone: () => 'unknown',
      onSome: (value) => String(value.getTime()),
    });
    const provenance = CorpusProvenance.make({
      source: assetSourceId(source.label),
      revision: corpusRevision(`${String(details.size)}-${modified}`),
      digest: Option.none(),
    });
    return {
      kind: source.kind,
      provenance,
      expectedSize: Option.none(),
      bytes: fs
        .stream(source.path)
        .pipe(
          Stream.mapError((cause) => sourceError(`read-${corpus}-artifact:${source.label}`, cause)),
        ),
    };
  }).pipe(
    Effect.mapError((cause) => sourceError(`open-${corpus}-artifact:${source.label}`, cause)),
    Effect.provide(BunServices.layer),
  ),
});

interface FileArtifactResponse {
  readonly status: number;
  readonly bytes: Stream.Stream<Uint8Array, unknown>;
}

const releaseSource = (
  corpus: string,
  source: ReleaseFileArtifactSource,
  fetchArtifact: (url: string) => Effect.Effect<FileArtifactResponse, unknown>,
) => ({
  kind: source.kind,
  acquire: Effect.succeed({
    kind: source.kind,
    provenance: CorpusProvenance.make({
      source: assetSourceId(`${corpus}-release`),
      revision: corpusRevision(source.revision),
      digest: Option.some(corpusDigest(source.digest)),
    }),
    expectedSize: Option.some(source.size),
    bytes: Stream.unwrap(
      fetchArtifact(source.url).pipe(
        Effect.mapError((cause) => sourceError(`fetch-${corpus}-release`, cause)),
        Effect.flatMap((response) => {
          if (response.status < 200 || response.status >= 300)
            return Effect.fail(
              sourceError(`fetch-${corpus}-release`, `HTTP ${String(response.status)}`),
            );
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

class FileArtifactStoreError extends Schema.TaggedError<FileArtifactStoreError>()(
  'FileArtifactStoreError',
  { operation: Schema.String, cause: Schema.Unknown },
) {}

const storeError = (operation: string) => (cause: unknown) =>
  FileArtifactStoreError.make({ operation, cause });

const openDatabase = (filename: string, readonly: boolean) =>
  Effect.try({
    try: () => new Database(filename, { readonly, fileMustExist: true }),
    catch: storeError('open-database'),
  });

const closeDatabase = (database: Database.Database) =>
  Effect.try({
    try: () => database.close(),
    catch: storeError('close-database'),
  });

const countRows = (database: Database.Database, table: string, where = '') =>
  Effect.try({
    try: () => database.prepare(`SELECT COUNT(*) AS count FROM ${table} ${where}`).get(),
    catch: storeError('count-rows'),
  }).pipe(
    Effect.flatMap((raw) =>
      Schema.decodeUnknownEffect(Schema.Struct({ count: Schema.Finite }))(raw).pipe(
        Effect.mapError(storeError('count-rows')),
      ),
    ),
    Effect.map((row) => row.count),
  );

export const verifyBibleDatabase = (filename: string): Effect.Effect<number, unknown> =>
  Effect.acquireUseRelease(
    openDatabase(filename, true),
    (database) =>
      Effect.gen(function* () {
        const integrity = yield* Effect.try({
          try: () => database.pragma('integrity_check', { simple: true }),
          catch: storeError('integrity-check'),
        });
        if (integrity !== 'ok') {
          return yield* Effect.fail(`SQLite integrity check failed: ${String(integrity)}`);
        }
        const books = yield* countRows(database, 'books');
        if (books !== 66) {
          return yield* Effect.fail('Bible Artifact does not contain the 66-book Canon');
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
      }),
    closeDatabase,
  );

const sqliteProvenanceStore: NativeFileArtifactProvenanceStore = {
  read: (filename) =>
    Effect.acquireUseRelease(
      openDatabase(filename, true),
      (database) =>
        Effect.gen(function* () {
          const row = Schema.Struct({ value: Schema.String });
          const value = (key: string) =>
            Effect.try({
              try: () => database.prepare('SELECT value FROM meta WHERE key = ?').get(key),
              catch: storeError('read-provenance'),
            }).pipe(
              Effect.flatMap((raw) =>
                Schema.decodeUnknownEffect(row)(raw).pipe(
                  Effect.mapError(storeError('read-provenance')),
                ),
              ),
              Effect.map((decoded) => decoded.value),
            );
          const stored = yield* Schema.decodeEffect(StoredProvenance)({
            source: yield* value('corpus_source'),
            revision: yield* value('corpus_revision'),
            digest: yield* value('corpus_digest'),
          }).pipe(Effect.mapError(storeError('read-provenance')));
          return CorpusProvenance.make({
            source: assetSourceId(stored.source),
            revision: corpusRevision(stored.revision),
            digest: Option.some(corpusDigest(stored.digest)),
          });
        }),
      closeDatabase,
    ),
  write: (filename, provenance) =>
    Effect.acquireUseRelease(
      openDatabase(filename, false),
      (database) =>
        Effect.try({
          try: () => {
            database.exec(
              'CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
            );
            const upsert = database.prepare(
              'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
            );
            database.transaction(() => {
              upsert.run('corpus_source', provenance.source);
              upsert.run('corpus_revision', provenance.revision);
              upsert.run('corpus_digest', Option.getOrThrow(provenance.digest));
            })();
          },
          catch: storeError('write-provenance'),
        }),
      closeDatabase,
    ),
};

const readCurrent = (
  destination: string,
  verify: (filename: string) => Effect.Effect<number, unknown>,
  provenanceStore: NativeFileArtifactProvenanceStore,
): Effect.Effect<Option.Option<CorpusProvenance>> =>
  verify(destination).pipe(Effect.andThen(provenanceStore.read(destination)), Effect.option);

/** Streams one File Corpus Artifact to `<destination>.building`, hashes while
 *  writing, rejects a manifest-digest mismatch, semantically verifies the
 *  building file, writes Provenance into it, then renames over the active
 *  file. Any failure removes the building file and leaves the active one. */
export const layerNativeFileArtifacts = <Corpus extends string, RecipeId, InstallerId>(input: {
  readonly artifact: FileCorpusArtifact<Corpus, RecipeId, InstallerId>;
  readonly destination: string;
  readonly sources: readonly NativeFileArtifactSource[];
  readonly verify: (filename: string) => Effect.Effect<number, unknown>;
  readonly fetch?: (url: string) => Effect.Effect<Response, unknown>;
  readonly provenanceStore?: NativeFileArtifactProvenanceStore;
}): Layer.Layer<InstallerId | RecipeId> => {
  const corpus = input.artifact.corpus;
  const reportedCorpus = Option.getOrUndefined(registeredCorpusName(corpus));
  const verify = input.verify;
  let fetchArtifact: (url: string) => Effect.Effect<FileArtifactResponse, unknown>;
  const injectedFetch = input.fetch;
  if (Predicate.isNotUndefined(injectedFetch)) {
    fetchArtifact = (url) =>
      injectedFetch(url).pipe(
        Effect.flatMap((response) => {
          const body = response.body;
          if (Predicate.isNull(body)) {
            return Effect.fail(sourceError(`fetch-${corpus}-release`, 'response has no body'));
          }
          return Effect.succeed({
            status: response.status,
            bytes: Stream.fromReadableStream({
              evaluate: () => body,
              onError: (cause) => cause,
            }),
          });
        }),
      );
  } else {
    fetchArtifact = (url) =>
      Effect.gen(function* () {
        const client = yield* HttpClient.HttpClient;
        const response = yield* client.get(url);
        return { status: response.status, bytes: response.stream };
      }).pipe(Effect.provide(BunHttpClient.layer));
  }
  const provenanceStore = input.provenanceStore ?? sqliteProvenanceStore;
  const makeSource = (source: NativeFileArtifactSource) => {
    if (source.kind === 'release') return releaseSource(corpus, source, fetchArtifact);
    return localSource(corpus, source);
  };
  const recipe = input.artifact.layerRecipe(input.sources.map(makeSource));
  const installer = input.artifact.layerInstaller({
    current: readCurrent(input.destination, verify, provenanceStore).pipe(
      Effect.mapError((cause) => CorpusInstallationError.make({ corpus: reportedCorpus, cause })),
    ),
    install: (artifact) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        yield* fs.makeDirectory(path.dirname(input.destination), { recursive: true });
        const building = `${input.destination}.building`;
        const hasher = sha256.create();
        let written = 0;
        const install = Effect.gen(function* () {
          yield* artifact.bytes.pipe(
            Stream.tap((chunk) =>
              Effect.sync(() => {
                hasher.update(chunk);
                written += chunk.byteLength;
              }),
            ),
            Stream.run(fs.sink(building)),
          );
          // Size and digest are the whole trust surface, so both close before
          // the semantic verifier is allowed to open the candidate file.
          if (Option.exists(artifact.expectedSize, (expected) => expected !== written)) {
            return yield* Effect.fail(
              `${input.artifact.label} Artifact size does not match its release manifest`,
            );
          }
          const digest = corpusDigest(`sha256:${bytesToHex(hasher.digest())}`);
          if (Option.exists(artifact.provenance.digest, (expected) => expected !== digest)) {
            return yield* Effect.fail(
              `${input.artifact.label} Artifact digest does not match its release manifest`,
            );
          }
          const installed = yield* verify(building);
          const provenance = CorpusProvenance.make({
            source: artifact.provenance.source,
            revision: artifact.provenance.revision,
            digest: Option.some(digest),
          });
          yield* provenanceStore.write(building, provenance);
          yield* fs.rename(building, input.destination);
          yield* fs.remove(`${input.destination}.provenance.json`, { force: true });
          return { installed, provenance };
        });
        return yield* install.pipe(
          Effect.onError(() => fs.remove(building, { force: true }).pipe(Effect.ignore)),
        );
      }).pipe(
        Effect.mapError((cause) => CorpusInstallationError.make({ corpus: reportedCorpus, cause })),
        Effect.provide(BunServices.layer),
      ),
  });
  return Layer.merge(recipe, installer);
};

/** The Bible instance of the native File Corpus lifecycle: the canonical
 *  destination plus the 66-book / 31,102-verse semantic verifier. */
export const layerNativeBibleArtifacts = (input: {
  readonly destination: string;
  readonly sources: readonly NativeFileArtifactSource[];
  readonly fetch?: (url: string) => Effect.Effect<Response, unknown>;
  readonly verify?: (filename: string) => Effect.Effect<number, unknown>;
  readonly provenanceStore?: NativeFileArtifactProvenanceStore;
}): Layer.Layer<BibleArtifactInstaller | BibleArtifactRecipe> =>
  layerNativeFileArtifacts({
    artifact: BibleArtifact,
    destination: input.destination,
    sources: input.sources,
    fetch: input.fetch,
    provenanceStore: input.provenanceStore,
    verify: input.verify ?? verifyBibleDatabase,
  });
