/** §9.2's index through the browser File Corpus lifecycle (round-2 F6).
 *
 *  The gap this closes: `db-worker.ts` hard-coded `vectorIndex: Option.none()`
 *  behind a comment explaining that no OPFS flat-blob store existed. The browser
 *  therefore *always* reported §9.6's `absent` — indistinguishable, from the
 *  reader's side and from every existing test's side, from a browser that had
 *  simply not downloaded the artifact.
 *
 *  So what is under test here is the **install path**, not a result shape: the
 *  shipped `layerBrowserVectorsArtifacts` driving `CorpusSupply.ensure({ target:
 *  Target.vectors() })` over a fixture BVI, with the real digest gate, the real
 *  shipped parser as the semantic verifier, and the real generation store's
 *  reserve/activate/rollback discipline. Only OPFS itself is substituted — an
 *  in-memory `BlobFileStore` and an in-memory downloader — because a worker test
 *  under Bun has no OPFS and stubbing `navigator.storage` would test the stub.
 *
 *  The production pin (`VECTORS_ARTIFACT_RELEASE`, `vectors-v1`) names a 264 MB
 *  artifact no test should download; this test supplies its own pin and its own
 *  bytes, which is exactly the seam `layerBrowserVectorsArtifacts.release` and
 *  `.fetch` exist for.
 */

import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { corpusStorageIdentity, CorpusSupply, Target } from '@bible/core/corpus-supply';
import {
  DIMENSIONS,
  encodeVectorIndex,
  MODEL_FINGERPRINT,
  parseVectorIndex,
  quantize,
  VectorBookRange,
  VectorManifest,
} from '@bible/core/search';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, Layer, Option, Stream } from 'effect';

import { makeBlobGenerationStore, type BlobFileStore } from './blob-generation-store.js';
import type { DatabaseFileDownloader } from './database-file-downloader.js';
import type { GenerationRegistry, GenerationRegistryStore } from './generation-marker.js';
import { layerBrowserVectorsArtifacts } from './vectors-artifact-browser.js';

const VECTOR_IDS = ['GC:GC 425.1', 'GC:GC 425.2', 'DA:DA 311.5'] as const;

/** A fixture index built by the **shipped writer**, so the bytes this installs
 *  are bytes the shipped parser is the authority on. */
const fixtureIndex = (fingerprint: string = MODEL_FINGERPRINT): Uint8Array => {
  const vectors = new Int8Array(VECTOR_IDS.length * DIMENSIONS);
  VECTOR_IDS.forEach((_id, row) => {
    const values = Array.from({ length: DIMENSIONS }, (_value, axis) =>
      Math.sin((row + 1) * (axis + 1)),
    );
    let norm = 0;
    for (const value of values) norm += value * value;
    vectors.set(quantize(values.map((value) => value / Math.sqrt(norm))), row * DIMENSIONS);
  });
  const gc = VECTOR_IDS.filter((id) => id.startsWith('GC:')).length;
  return new Uint8Array(
    encodeVectorIndex({
      fingerprint,
      manifest: VectorManifest.make({
        books: [
          VectorBookRange.make({ bookCode: 'GC', offset: 0, count: gc }),
          VectorBookRange.make({ bookCode: 'DA', offset: gc, count: VECTOR_IDS.length - gc }),
        ],
        paragraphIds: [...VECTOR_IDS],
      }),
      vectors,
    }),
  );
};

const digestOf = (bytes: Uint8Array): string => `sha256:${bytesToHex(sha256(bytes))}`;

/** OPFS, in a `Map`. The store's whole contract with storage is read and remove,
 *  and the downloader's is write — so three closures over one map is the entire
 *  substitution, and everything else in the path is the shipped code. */
const harness = (input: {
  /** The bytes the fetch delivers. */
  readonly bytes: Uint8Array;
  readonly revision?: string;
  /** What the pinned manifest *claims*, when the test is about the gate rather
   *  than about the artifact. Defaults to the truth about `bytes`. */
  readonly declared?: Uint8Array;
}) => {
  const files = new Map<string, Uint8Array>();
  const writes: string[] = [];
  let state: GenerationRegistry = { active: Option.none(), managed: [] };

  const blobFiles: BlobFileStore = {
    read: (filename) => Effect.sync(() => Option.fromUndefinedOr(files.get(filename))),
    remove: (filename) =>
      Effect.sync(() => {
        files.delete(filename);
      }),
  };

  /** The downloader's real contract: consume the stream, report the byte count
   *  and the sha256. The shipped OPFS one does exactly this around a writable;
   *  reproducing the hashing here rather than the writable is what keeps the
   *  digest gate under test rather than mocked away. */
  const downloader: DatabaseFileDownloader = {
    install: (stream, filename, onProgress) =>
      Effect.gen(function* () {
        const chunks: Uint8Array[] = [];
        let total = 0;
        const hasher = sha256.create();
        yield* Stream.runForEach(stream, (chunk) =>
          Effect.sync(() => {
            chunks.push(chunk);
            total += chunk.byteLength;
            hasher.update(chunk);
          }),
        );
        const merged = new Uint8Array(total);
        let at = 0;
        for (const chunk of chunks) {
          merged.set(chunk, at);
          at += chunk.byteLength;
        }
        files.set(filename, merged);
        writes.push(filename);
        onProgress(100);
        return { bytes: total, digest: `sha256:${bytesToHex(hasher.digest())}` };
      }),
  };

  const registry: GenerationRegistryStore = {
    read: Effect.sync(() => state),
    write: (next) => Effect.sync(() => void (state = next)),
  };

  const identity = corpusStorageIdentity('vectors');
  const generations = makeBlobGenerationStore({ identity, files: blobFiles, registry });

  const revision = input.revision ?? 'vectors-v1';
  const declared = input.declared ?? input.bytes;
  const layer = layerBrowserVectorsArtifacts({
    generations,
    files: blobFiles,
    downloader,
    release: Option.some({
      url: 'https://example.invalid/vectors.bvi',
      revision,
      digest: digestOf(declared),
      size: declared.byteLength,
    }),
    // The test's own bytes, in place of a network fetch.
    fetch: () => Effect.succeed({ status: 200, bytes: Stream.succeed(input.bytes) }),
  });

  return {
    generations,
    files,
    writes,
    identity,
    revision,
    registry: () => state,
    ensure: Effect.flatMap(CorpusSupply, (supply) =>
      supply.ensure({ target: Target.vectors() }),
    ).pipe(Effect.provide(CorpusSupply.layer.pipe(Layer.provide(layer)))),
  };
};

describe('the browser vectors artifact (F6)', () => {
  it.effect('installs, verifies and activates a flat BVI generation', () =>
    Effect.gen(function* () {
      const bytes = fixtureIndex();
      const test = harness({ bytes });

      const receipt = yield* test.ensure;

      const activation = receipt.activated.find((entry) => entry.corpus === 'vectors');
      expect(activation?.corpus).toBe('vectors');
      // The shipped parser's own count, produced by `verifyVectorIndexBytes`
      // over the bytes that were *stored* rather than the bytes received.
      expect(activation?.installed).toBe(VECTOR_IDS.length);

      // The generation carries the corpus's own derived name, so it is one this
      // store owns and one `ownsGeneration` will retire.
      const generation = yield* test.generations.activeFilename;
      expect(Option.isSome(generation)).toBe(true);
      if (Option.isNone(generation)) return;
      expect(test.identity.ownsGeneration(generation.value)).toBe(true);
      expect(Option.contains(test.registry().active, generation.value)).toBe(true);

      // The handoff: the store serves the activated generation's bytes, and they
      // parse as the index that was installed. Against the pre-fix worker this
      // is `Option.none()` unconditionally.
      const served = yield* test.generations.activeBytes;
      expect(Option.isSome(served)).toBe(true);
      if (Option.isNone(served)) return;
      const parsed = parseVectorIndex(served.value);
      expect(parsed._tag).toBe('ok');
      if (parsed._tag !== 'ok') return;
      expect(parsed.index.count).toBe(VECTOR_IDS.length);
      expect(parsed.index.fingerprint).toBe(MODEL_FINGERPRINT);
      expect([...parsed.index.manifest.paragraphIds]).toEqual([...VECTOR_IDS]);

      // Provenance is a sidecar beside the generation, not bytes inside it: the
      // installed artifact is byte-identical to what was published.
      expect(
        Buffer.from(test.files.get(generation.value) ?? new Uint8Array()).equals(
          Buffer.from(bytes),
        ),
      ).toBe(true);
      expect(test.files.has(`${generation.value}.provenance.json`)).toBe(true);
    }),
  );

  it.effect('reports the installed generation on a second ensure rather than reinstalling', () =>
    Effect.gen(function* () {
      const test = harness({ bytes: fixtureIndex() });
      yield* test.ensure;
      const writesAfterFirst = test.writes.length;

      const second = yield* test.ensure;

      // No new activation and no new write: the sidecar provenance made the
      // active generation readable, so `current` matched the release pin.
      expect(second.activated.some((entry) => entry.corpus === 'vectors')).toBe(false);
      expect(test.writes.length).toBe(writesAfterFirst);
    }),
  );

  it.effect('refuses a foreign-fingerprint index and activates nothing', () =>
    Effect.gen(function* () {
      // Intact bytes, correct format, wrong model — a digest gate cannot see
      // this, and the semantic verifier is the only thing that can.
      const test = harness({ bytes: fixtureIndex('some-other-model/512d/int8') });

      const outcome = yield* Effect.exit(test.ensure);

      const activated =
        outcome._tag === 'Success' &&
        outcome.value.activated.some((entry) => entry.corpus === 'vectors');
      expect(activated).toBe(false);
      // Nothing is being served, and the candidate was discarded along with its
      // sidecar rather than left where a later boot could adopt it.
      expect(yield* test.generations.activeBytes).toEqual(Option.none());
      expect(Option.isNone(test.registry().active)).toBe(true);
      for (const written of test.writes) expect(test.files.has(written)).toBe(false);
    }),
  );

  it.effect('refuses bytes whose digest does not match the manifest', () =>
    Effect.gen(function* () {
      // The pin promises one index's digest; the fetch delivers a different
      // index. The gate must close on the digest, before the semantic verifier
      // is allowed to look at bytes that would in fact have parsed.
      const promised = fixtureIndex();
      const delivered = fixtureIndex('some-other-model/512d/int8');
      const test = harness({ bytes: delivered, declared: promised });

      const outcome = yield* Effect.exit(test.ensure);

      const activated =
        outcome._tag === 'Success' &&
        outcome.value.activated.some((entry) => entry.corpus === 'vectors');
      expect(activated).toBe(false);
      expect(yield* test.generations.activeBytes).toEqual(Option.none());
      // The candidate was discarded rather than left for a later boot to adopt.
      for (const written of test.writes) expect(test.files.has(written)).toBe(false);
    }),
  );
});
