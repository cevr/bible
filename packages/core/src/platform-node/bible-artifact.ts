import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

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
import { Effect, Layer, Option, Schema, Stream } from 'effect';

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

const sidecarPath = (destination: string): string => `${destination}.provenance.json`;

const sourceError = (operation: string, cause: unknown): CorpusSourceUnavailableError =>
  new CorpusSourceUnavailableError({ operation, cause });

const localSource = (source: LocalBibleArtifactSource) => ({
  kind: source.kind,
  acquire: Effect.tryPromise({
    try: async () => {
      const details = await stat(source.path);
      if (!details.isFile() || details.size === 0) throw new Error('source is empty');
      const provenance = new CorpusProvenance({
        source: assetSourceId(source.label),
        revision: corpusRevision(`${String(details.size)}-${String(details.mtimeMs)}`),
        digest: Option.none(),
      });
      return {
        kind: source.kind,
        provenance,
        bytes: Stream.fromAsyncIterable(createReadStream(source.path), (cause) =>
          sourceError(`read-bible-artifact:${source.label}`, cause),
        ),
      };
    },
    catch: (cause) => sourceError(`open-bible-artifact:${source.label}`, cause),
  }),
});

const releaseSource = (
  source: ReleaseBibleArtifactSource,
  fetchArtifact: (url: string) => Promise<Response>,
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
      Effect.tryPromise({
        try: async () => {
          const response = await fetchArtifact(source.url);
          if (!response.ok) throw new Error(`HTTP ${String(response.status)}`);
          if (response.body === null) throw new Error('response has no body');
          return Stream.fromAsyncIterable(response.body, (cause) =>
            sourceError('read-bible-release', cause),
          );
        },
        catch: (cause) => sourceError('fetch-bible-release', cause),
      }),
    ),
  }),
});

const verifyBibleDatabase = (filename: string): number => {
  const database = new Database(filename, { readonly: true, fileMustExist: true });
  try {
    const integrity = database.pragma('integrity_check', { simple: true });
    if (integrity !== 'ok') throw new Error(`SQLite integrity check failed: ${String(integrity)}`);
    const count = (table: string, where = ''): number => {
      const row = Schema.decodeUnknownSync(Schema.Struct({ count: Schema.Number }))(
        database.prepare(`SELECT COUNT(*) AS count FROM ${table} ${where}`).get(),
      );
      return row.count;
    };
    if (count('books') !== 66) throw new Error('Bible Artifact does not contain the 66-book Canon');
    const verses = count('verses', "WHERE version_code = 'KJV'");
    if (verses !== 31_102) throw new Error(`Bible Artifact contains ${String(verses)} KJV Verses`);
    if (count('strongs') === 0) throw new Error("Bible Artifact has no Strong's lexicon");
    if (count('cross_refs', "WHERE source = 'openbible'") === 0)
      throw new Error('Bible Artifact has no OpenBible Cross References');
    if (count('cross_refs', "WHERE source = 'tske'") === 0)
      throw new Error('Bible Artifact has no TSKe Cross References');
    if (count('margin_notes') === 0) throw new Error('Bible Artifact has no Margin Notes');
    if (count('topics') === 0) throw new Error('Bible Artifact has no Topics');
    return verses;
  } finally {
    database.close();
  }
};

const readCurrent = async (
  destination: string,
  verify: (filename: string) => number,
): Promise<Option.Option<CorpusProvenance>> => {
  try {
    verify(destination);
    const stored = Schema.decodeUnknownSync(StoredProvenance)(
      JSON.parse(await readFile(sidecarPath(destination), 'utf8')),
    );
    return Option.some(
      new CorpusProvenance({
        source: assetSourceId(stored.source),
        revision: corpusRevision(stored.revision),
        digest: Option.some(corpusDigest(stored.digest)),
      }),
    );
  } catch {
    return Option.none();
  }
};

export const layerNativeBibleArtifacts = (input: {
  readonly destination: string;
  readonly sources: readonly NativeBibleArtifactSource[];
  readonly fetch?: (url: string) => Promise<Response>;
  readonly verify?: (filename: string) => number;
}): Layer.Layer<BibleArtifactInstaller | BibleArtifactRecipe> => {
  const verify = input.verify ?? verifyBibleDatabase;
  const fetchArtifact = input.fetch ?? globalThis.fetch;
  const recipe = layerBibleArtifactRecipe(
    input.sources.map((source) =>
      source.kind === 'release' ? releaseSource(source, fetchArtifact) : localSource(source),
    ),
  );
  const installer = Layer.succeed(
    BibleArtifactInstaller,
    BibleArtifactInstaller.of({
      current: Effect.tryPromise({
        try: () => readCurrent(input.destination, verify),
        catch: (cause) => new CorpusInstallationError({ corpus: 'bible', cause }),
      }),
      install: (artifact) =>
        Effect.tryPromise({
          try: async () => {
            await mkdir(path.dirname(input.destination), { recursive: true });
            const building = `${input.destination}.building`;
            const hasher = createHash('sha256');
            const hashStream = new Transform({
              transform(chunk: Buffer, _encoding, callback) {
                hasher.update(chunk);
                callback(null, chunk);
              },
            });
            try {
              await pipeline(
                Readable.from(Stream.toAsyncIterable(artifact.bytes)),
                hashStream,
                createWriteStream(building),
              );
              const digest = corpusDigest(`sha256:${hasher.digest('hex')}`);
              if (Option.exists(artifact.provenance.digest, (expected) => expected !== digest)) {
                throw new Error('Bible Artifact digest does not match its release manifest');
              }
              const installed = verify(building);
              const provenance = new CorpusProvenance({
                source: artifact.provenance.source,
                revision: artifact.provenance.revision,
                digest: Option.some(digest),
              });
              await rename(building, input.destination);
              const sidecar = sidecarPath(input.destination);
              const buildingSidecar = `${sidecar}.building`;
              await writeFile(
                buildingSidecar,
                JSON.stringify({
                  source: provenance.source,
                  revision: provenance.revision,
                  digest,
                }),
              );
              await rename(buildingSidecar, sidecar);
              return { installed, provenance };
            } catch (cause) {
              await unlink(building).catch(() => undefined);
              throw cause;
            }
          },
          catch: (cause) => new CorpusInstallationError({ corpus: 'bible', cause }),
        }),
    }),
  );
  return Layer.merge(recipe, installer);
};
