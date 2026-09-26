/** §9.2's vector index as a browser File Corpus (round-2 F6, browser half).
 *
 *  `corpus-artifact-database.ts` installs SQLite artifacts: it streams into an
 *  OPFS generation through a VFS-aware downloader, opens the candidate as a
 *  database, runs a semantic verifier over SQL, and writes provenance into the
 *  file's own `meta` table. None of the last three apply to a flat binary, which
 *  is why the worker's `vectorIndex` was `Option.none()` with a comment saying
 *  the store did not exist.
 *
 *  What is reused rather than re-derived:
 *
 *  - the artifact declaration itself (`VectorsArtifact`) and therefore the
 *    recipe/installer service keys and the whole `CorpusSupply.ensure` pipeline,
 *  - the streaming-and-hashing downloader `makeDatabaseFileDownloader`, which is
 *    already byte-agnostic — it writes a stream to an OPFS file and returns the
 *    length and the sha256, which is exactly the digest gate's whole input,
 *  - the generation/rollback discipline, in `makeBlobGenerationStore`,
 *  - the semantic verifier, `verifyVectorIndexBytes`, which is the *shipped
 *    parser* rather than a browser restatement of it.
 *
 *  What differs is provenance. A flat artifact has nowhere inside it to record
 *  which release its bytes came from, so it goes in a sidecar file beside the
 *  generation — the same decision `sidecarProvenanceStore` takes on the native
 *  host, so the two hosts answer "where did this generation come from" the same
 *  way.
 */

import * as BrowserHttpClient from '@effect/platform-browser/BrowserHttpClient';
import {
  assetSourceId,
  corpusDigest,
  corpusGeneration,
  corpusRevision,
  CorpusInstallationError,
  CorpusProvenance,
  CorpusSourceUnavailableError,
  registeredCorpusName,
  type FileArtifactRelease,
  type FileArtifactSourceService,
} from '@bible/core/corpus-supply';
import {
  VECTORS_ARTIFACT_RELEASE,
  VectorsArtifact,
  verifyVectorIndexBytes,
  type VectorsArtifactInstaller,
  type VectorsArtifactRecipe,
} from '@bible/core/search';
import { Effect, Layer, Option, Schema, Stream } from 'effect';
import { HttpClient } from 'effect/unstable/http';

import type { BlobFileStore, BlobGenerationStore } from './blob-generation-store.js';
import type { DatabaseFileDownloader } from './database-file-downloader.js';

const sourceError = (operation: string, cause: unknown): CorpusSourceUnavailableError =>
  CorpusSourceUnavailableError.make({ operation, cause });

/** Provenance for one flat generation, as it is stored beside it.
 *
 *  The same fields the SQLite artifacts keep in `meta`, so the two hosts and
 *  the two layouts record the identical facts. `generation` is optional because
 *  every sidecar written before §3.6's runtime path existed has no such key, and
 *  a decoder that demanded one would report those generations unreadable. */
const StoredProvenance = Schema.Struct({
  source: Schema.String,
  revision: Schema.String,
  digest: Schema.String,
  generation: Schema.optionalKey(Schema.Int),
});

const sidecarName = (filename: string): string => `${filename}.provenance.json`;

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

/** Reads one generation's sidecar provenance. `None` when the sidecar is
 *  missing or unreadable, which `current` reports as "no active generation" —
 *  the right answer for a file this build cannot account for. */
const readProvenance = (
  files: BlobFileStore,
  filename: string,
): Effect.Effect<Option.Option<CorpusProvenance>> =>
  Effect.gen(function* () {
    const bytes = yield* files.read(sidecarName(filename));
    if (Option.isNone(bytes)) return yield* Effect.fail('no sidecar');
    const stored = yield* Schema.decodeEffect(Schema.fromJsonString(StoredProvenance))(
      new TextDecoder().decode(bytes.value),
    );
    return CorpusProvenance.make({
      source: assetSourceId(stored.source),
      revision: corpusRevision(stored.revision),
      digest: Option.some(corpusDigest(stored.digest)),
      generation: Option.map(Option.fromUndefinedOr(stored.generation), corpusGeneration),
    });
  }).pipe(Effect.option);

/** How the sidecar is written: through the same streaming installer the artifact
 *  itself uses, so there is one way bytes reach OPFS rather than two. */
const writeProvenance = (
  downloader: DatabaseFileDownloader,
  filename: string,
  provenance: CorpusProvenance,
): Effect.Effect<void, unknown> =>
  Effect.gen(function* () {
    const digest = yield* Option.match(provenance.digest, {
      onNone: () => Effect.fail('Artifact digest is required'),
      onSome: Effect.succeed,
    });
    const encoded = yield* Schema.encodeEffect(Schema.fromJsonString(StoredProvenance))({
      source: provenance.source,
      revision: provenance.revision,
      digest,
      ...Option.match(provenance.generation, {
        onNone: () => ({}),
        onSome: (generation) => ({ generation: Number(generation) }),
      }),
    });
    yield* downloader.install(
      Stream.succeed(new TextEncoder().encode(encoded)),
      sidecarName(filename),
      () => {},
    );
  });

/** Installs §9.2's index into an inactive OPFS generation: reserve a candidate
 *  in the durable registry, stream and hash, reject a manifest-digest or size
 *  mismatch, run the shipped parser over the written bytes, write the sidecar,
 *  then hand the reader over. Any failure discards the candidate and leaves the
 *  active generation in place. */
export const layerBrowserVectorsArtifacts = (input: {
  readonly generations: BlobGenerationStore<'vectors'>;
  readonly files: BlobFileStore;
  readonly downloader: DatabaseFileDownloader;
  /** The pinned release, or `None` while none is published. A browser has no
   *  local disk to fall back to, so `None` means the recipe offers no source and
   *  `ensure` reports the corpus unavailable — which §3.5's catch-and-warn turns
   *  into a log line, not a startup failure. The installer stays fully wired
   *  either way, so an already-installed generation is still read and reported. */
  readonly release?: Option.Option<FileArtifactRelease>;
  readonly fetch?: (url: string) => Effect.Effect<BrowserArtifactResponse, unknown>;
  readonly onProgress?: (progress: number) => void;
}): Layer.Layer<VectorsArtifactInstaller | VectorsArtifactRecipe> => {
  const corpus = VectorsArtifact.corpus;
  const reportedCorpus = Option.getOrUndefined(registeredCorpusName(corpus));
  const label = VectorsArtifact.label;
  const identity = VectorsArtifact.storage;
  const fetchArtifact = input.fetch ?? defaultFetchArtifact;
  const onProgress = input.onProgress ?? (() => {});
  const release = input.release ?? VECTORS_ARTIFACT_RELEASE;

  const releaseSource = (pinned: FileArtifactRelease): FileArtifactSourceService => ({
    kind: 'release',
    acquire: Effect.succeed({
      kind: 'release',
      provenance: CorpusProvenance.make({
        source: assetSourceId(`${corpus}-release`),
        revision: corpusRevision(pinned.revision),
        digest: Option.some(corpusDigest(pinned.digest)),
      }),
      expectedSize: Option.some(pinned.size),
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

  const recipe = VectorsArtifact.layerRecipe({
    sources: Option.match(release, {
      onNone: (): readonly FileArtifactSourceService[] => [],
      onSome: (pinned) => [releaseSource(pinned)],
    }),
    // §9.2's index reads the same-origin proxy for the same no-CORS reason the
    // topics artifact does, so a runtime release is the pinned path with a
    // different manifest. Wired now so vectors can join §3.6's runtime path
    // with no adapter change the day it gets a floor of its own.
    releaseSource,
  });

  const installer = VectorsArtifact.layerInstaller({
    current: Effect.gen(function* () {
      if (!(yield* input.generations.openActive)) return Option.none<CorpusProvenance>();
      const filename = yield* input.generations.activeFilename;
      if (Option.isNone(filename)) return Option.none<CorpusProvenance>();
      return yield* readProvenance(input.files, filename.value);
    }).pipe(
      Effect.mapError((cause) => CorpusInstallationError.make({ corpus: reportedCorpus, cause })),
    ),
    // The versioned OPFS filename this store activated, behind its own atomic
    // registry pointer — the shape the native flat installer now mirrors
    // (round-4 B2).
    activeFile: input.generations.activeFilename.pipe(
      Effect.mapError((cause) => CorpusInstallationError.make({ corpus: reportedCorpus, cause })),
    ),
    install: (artifact) =>
      Effect.gen(function* () {
        if (Option.isNone(artifact.provenance.digest)) {
          return yield* Effect.fail('Artifact digest is required');
        }
        const expectedDigest = artifact.provenance.digest.value;
        const preferredName = identity.generationFilename(
          artifact.provenance.revision,
          expectedDigest.slice('sha256:'.length, 'sha256:'.length + 12),
        );
        let candidateName = Option.none<string>();
        const install = Effect.gen(function* () {
          const filename = yield* input.generations.reserve(preferredName);
          candidateName = Option.some(filename);
          const written = yield* input.downloader.install(artifact.bytes, filename, onProgress);
          // Size and digest are the whole trust surface, so both close before
          // the semantic verifier is allowed to look at the candidate.
          if (Option.exists(artifact.expectedSize, (expected) => expected !== written.bytes)) {
            return yield* Effect.fail(`${label} Artifact size does not match its release manifest`);
          }
          if (written.digest !== expectedDigest) {
            return yield* Effect.fail(
              `${label} Artifact digest does not match its release manifest`,
            );
          }
          // The shipped parser, read back off OPFS rather than from the stream:
          // what must be verified is the bytes that were *stored*, not the bytes
          // that were received. A truncated write is exactly the difference.
          const stored = yield* input.files.read(filename);
          if (Option.isNone(stored)) {
            return yield* Effect.fail(`${label} Artifact was not written`);
          }
          const buffer = new ArrayBuffer(stored.value.byteLength);
          new Uint8Array(buffer).set(stored.value);
          const installed = yield* verifyVectorIndexBytes(buffer);
          const provenance = CorpusProvenance.make({
            source: artifact.provenance.source,
            revision: artifact.provenance.revision,
            digest: Option.some(corpusDigest(written.digest)),
            // The candidate's own generation, carried into the sidecar.
            generation: artifact.provenance.generation,
          });
          yield* writeProvenance(input.downloader, filename, provenance);
          yield* input.generations.activateVerified(filename);
          return { installed, provenance };
        });
        return yield* install.pipe(
          Effect.onError(() =>
            Option.match(candidateName, {
              onNone: () => Effect.void,
              onSome: (candidate) =>
                Effect.gen(function* () {
                  const active = yield* input.generations.activeFilename;
                  if (Option.contains(active, candidate)) return;
                  yield* input.generations.discardCandidate(candidate);
                  // The sidecar goes with the candidate: a failed install must
                  // leave nothing a later read could mistake for a generation.
                  yield* input.files.remove(sidecarName(candidate));
                }).pipe(Effect.ignore),
            }),
          ),
        );
      }).pipe(
        Effect.mapError((cause) => CorpusInstallationError.make({ corpus: reportedCorpus, cause })),
      ),
  });

  return Layer.merge(recipe, installer);
};
