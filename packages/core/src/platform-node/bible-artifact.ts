import * as BunHttpClient from '@effect/platform-bun/BunHttpClient';
import * as BunServices from '@effect/platform-bun/BunServices';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

import {
  BibleArtifactInstaller,
  layerBibleArtifactRecipe,
  type BibleArtifactRecipe,
  type BibleArtifactSourceKind,
} from '../corpus-supply/bible-artifact.js';
import { CorpusInstallationError, CorpusSourceUnavailableError } from '../corpus-supply/errors.js';
import {
  assetSourceId,
  corpusDigest,
  corpusRevision,
  CorpusProvenance,
} from '../corpus-supply/model.js';
import Database from 'better-sqlite3';
import { Effect, FileSystem, Layer, Option, Path, Schema, Stream } from 'effect';
import { HttpClient } from 'effect/unstable/http';

export interface LocalBibleArtifactSource {
  readonly kind: Exclude<BibleArtifactSourceKind, 'release'>;
  readonly path: string;
  readonly label: string;
}

export interface ReleaseBibleArtifactSource {
  readonly kind: 'release';
  readonly url: string;
  readonly revision: string;
  readonly digest: string;
}

export type NativeBibleArtifactSource = LocalBibleArtifactSource | ReleaseBibleArtifactSource;

const StoredProvenance = Schema.Struct({
  source: Schema.String,
  revision: Schema.String,
  digest: Schema.String,
});

export interface NativeBibleArtifactProvenanceStore {
  readonly read: (filename: string) => Effect.Effect<CorpusProvenance, unknown>;
  readonly write: (filename: string, provenance: CorpusProvenance) => Effect.Effect<void, unknown>;
}

const sourceError = (operation: string, cause: unknown): CorpusSourceUnavailableError =>
  new CorpusSourceUnavailableError({ operation, cause });

const localSource = (source: LocalBibleArtifactSource) => ({
  kind: source.kind,
  acquire: Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const details = yield* fs.stat(source.path);
    if (details.type !== 'File' || details.size === 0n) {
      return yield* sourceError(`open-bible-artifact:${source.label}`, 'source is empty');
    }
    const modified = Option.match(details.mtime, {
      onNone: () => 'unknown',
      onSome: (value) => String(value.getTime()),
    });
    const provenance = new CorpusProvenance({
      source: assetSourceId(source.label),
      revision: corpusRevision(`${String(details.size)}-${modified}`),
      digest: Option.none(),
    });
    return {
      kind: source.kind,
      provenance,
      bytes: fs
        .stream(source.path)
        .pipe(
          Stream.mapError((cause) => sourceError(`read-bible-artifact:${source.label}`, cause)),
        ),
    };
  }).pipe(
    Effect.mapError((cause) => sourceError(`open-bible-artifact:${source.label}`, cause)),
    Effect.provide(BunServices.layer),
  ),
});

interface BibleArtifactResponse {
  readonly status: number;
  readonly bytes: Stream.Stream<Uint8Array, unknown>;
}

const releaseSource = (
  source: ReleaseBibleArtifactSource,
  fetchArtifact: (url: string) => Effect.Effect<BibleArtifactResponse, unknown>,
) => ({
  kind: source.kind,
  acquire: Effect.succeed({
    kind: source.kind,
    provenance: new CorpusProvenance({
      source: assetSourceId('bible-release'),
      revision: corpusRevision(source.revision),
      digest: Option.some(corpusDigest(source.digest)),
    }),
    bytes: Stream.unwrap(
      fetchArtifact(source.url).pipe(
        Effect.mapError((cause) => sourceError('fetch-bible-release', cause)),
        Effect.flatMap((response) => {
          if (response.status < 200 || response.status >= 300)
            return Effect.fail(
              sourceError('fetch-bible-release', `HTTP ${String(response.status)}`),
            );
          return Effect.succeed(
            response.bytes.pipe(
              Stream.mapError((cause) => sourceError('read-bible-release', cause)),
            ),
          );
        }),
      ),
    ),
  }),
});

const openDatabase = (filename: string, readonly: boolean) =>
  Effect.try({
    try: () => new Database(filename, { readonly, fileMustExist: true }),
    catch: (cause) => cause,
  });

const closeDatabase = (database: Database.Database) =>
  Effect.try({
    try: () => database.close(),
    catch: (cause) => cause,
  });

const countRows = (database: Database.Database, table: string, where = '') =>
  Effect.try({
    try: () => {
      const row = Schema.decodeUnknownSync(Schema.Struct({ count: Schema.Number }))(
        database.prepare(`SELECT COUNT(*) AS count FROM ${table} ${where}`).get(),
      );
      return row.count;
    },
    catch: (cause) => cause,
  });

const verifyBibleDatabase = (filename: string): Effect.Effect<number, unknown> =>
  Effect.acquireUseRelease(
    openDatabase(filename, true),
    (database) =>
      Effect.gen(function* () {
        const integrity = yield* Effect.try({
          try: () => database.pragma('integrity_check', { simple: true }),
          catch: (cause) => cause,
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

const sqliteProvenanceStore: NativeBibleArtifactProvenanceStore = {
  read: (filename) =>
    Effect.acquireUseRelease(
      openDatabase(filename, true),
      (database) =>
        Effect.try({
          try: () => {
            const value = (key: string): unknown =>
              database.prepare('SELECT value FROM meta WHERE key = ?').get(key);
            const row = Schema.Struct({ value: Schema.String });
            const stored = Schema.decodeUnknownSync(StoredProvenance)({
              source: Schema.decodeUnknownSync(row)(value('corpus_source')).value,
              revision: Schema.decodeUnknownSync(row)(value('corpus_revision')).value,
              digest: Schema.decodeUnknownSync(row)(value('corpus_digest')).value,
            });
            return new CorpusProvenance({
              source: assetSourceId(stored.source),
              revision: corpusRevision(stored.revision),
              digest: Option.some(corpusDigest(stored.digest)),
            });
          },
          catch: (cause) => cause,
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
          catch: (cause) => cause,
        }),
      closeDatabase,
    ),
};

const readCurrent = (
  destination: string,
  verify: (filename: string) => Effect.Effect<number, unknown>,
  provenanceStore: NativeBibleArtifactProvenanceStore,
): Effect.Effect<Option.Option<CorpusProvenance>> =>
  verify(destination).pipe(Effect.andThen(provenanceStore.read(destination)), Effect.option);

export const layerNativeBibleArtifacts = (input: {
  readonly destination: string;
  readonly sources: readonly NativeBibleArtifactSource[];
  readonly fetch?: (url: string) => Effect.Effect<Response, unknown>;
  readonly verify?: (filename: string) => Effect.Effect<number, unknown>;
  readonly provenanceStore?: NativeBibleArtifactProvenanceStore;
}): Layer.Layer<BibleArtifactInstaller | BibleArtifactRecipe> => {
  const verify = input.verify ?? verifyBibleDatabase;
  let fetchArtifact: (url: string) => Effect.Effect<BibleArtifactResponse, unknown>;
  const injectedFetch = input.fetch;
  if (injectedFetch !== undefined) {
    fetchArtifact = (url) =>
      injectedFetch(url).pipe(
        Effect.flatMap((response) => {
          if (response.body === null) {
            return Effect.fail(sourceError('fetch-bible-release', 'response has no body'));
          }
          return Effect.succeed({
            status: response.status,
            bytes: Stream.fromAsyncIterable(response.body, (cause) => cause),
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
  const makeSource = (source: NativeBibleArtifactSource) => {
    if (source.kind === 'release') return releaseSource(source, fetchArtifact);
    return localSource(source);
  };
  const recipe = layerBibleArtifactRecipe(input.sources.map(makeSource));
  const installer = Layer.succeed(
    BibleArtifactInstaller,
    BibleArtifactInstaller.of({
      current: readCurrent(input.destination, verify, provenanceStore).pipe(
        Effect.mapError((cause) => new CorpusInstallationError({ corpus: 'bible', cause })),
      ),
      install: (artifact) =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          yield* fs.makeDirectory(path.dirname(input.destination), { recursive: true });
          const building = `${input.destination}.building`;
          const hasher = sha256.create();
          const install = Effect.gen(function* () {
            yield* artifact.bytes.pipe(
              Stream.tap((chunk) => Effect.sync(() => hasher.update(chunk))),
              Stream.run(fs.sink(building)),
            );
            const digest = corpusDigest(`sha256:${bytesToHex(hasher.digest())}`);
            if (Option.exists(artifact.provenance.digest, (expected) => expected !== digest)) {
              return yield* Effect.fail(
                'Bible Artifact digest does not match its release manifest',
              );
            }
            const installed = yield* verify(building);
            const provenance = new CorpusProvenance({
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
          Effect.mapError((cause) => new CorpusInstallationError({ corpus: 'bible', cause })),
          Effect.provide(BunServices.layer),
        ),
    }),
  );
  return Layer.merge(recipe, installer);
};
