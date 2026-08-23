/** §10 Milestone 9's remaining Core-tests clause, over the *real* lifecycle:
 *  "digest or size mismatch aborts and leaves the installed version active".
 *
 *  `platform-node/file-corpus-lifecycle.test.ts` already proves the installer
 *  refuses those bytes. What that suite cannot see is the claim this milestone
 *  actually makes: that a client which *acted on a runtime offer* and got bad
 *  bytes is left with its working content and an honest report — not a failure
 *  its caller has to catch, and not an activation it did not get.
 *
 *  So these run `ContentUpdate.update` end to end, over `CorpusSupply` and
 *  `layerNativeTopicsArtifacts` — the shipped installer, the shipped atomic
 *  swap, a real file on disk — with only the manifest and the release bytes
 *  under the test's control. `platform-node` is a permitted host boundary, and
 *  a fake installer would have made the whole guarantee vacuous.
 */

import { BunFileSystem } from '@effect/platform-bun';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { Effect, FileSystem, Layer, Option } from 'effect';
import { describe, expect, it } from 'effect-bun-test';

import { corpusGeneration, corpusRevision } from '../corpus-supply/model.js';
import type { CorpusProvenance } from '../corpus-supply/model.js';
import {
  TopicsArtifact,
  TOPICS_SCHEMA_MAJOR,
  type FileArtifactRelease,
} from '../corpus-supply/file-artifact.js';
import { CorpusSupply } from '../corpus-supply/service.js';
import {
  layerNativeFileArtifacts,
  type NativeFileArtifactProvenanceStore,
  type NativeFileArtifactSource,
} from '../platform-node/bible-artifact.js';
import {
  ContentManifest,
  ContentManifestEntry,
  decideUpdate,
  type ManifestFetchOutcome,
} from './model.js';
import {
  compiledFloor,
  ContentActivation,
  ContentManifestSource,
  ContentUpdate,
} from './service.js';

/** The bytes the release actually serves. A stand-in for a `topics.db`: the
 *  semantic verifier and the provenance store are both substituted below,
 *  because what is under test is the *supply* guarantee — digest, size, swap —
 *  and opening SQLite through `better-sqlite3` hard-crashes the Bun canary this
 *  repo tests under (the same reason `nativeTopicsReader` is a parameter, and
 *  the same substitution `file-corpus-lifecycle.test.ts` makes). */
const RELEASE_BYTES = 'the newer topics artifact';
const RELEASE_DIGEST = `sha256:${bytesToHex(sha256(new TextEncoder().encode(RELEASE_BYTES)))}`;
const ACTIVE_BYTES = 'the installed topics artifact';

const manifestEntry = (input: {
  readonly digest: string;
  readonly size: number;
  readonly schemaMajor?: number;
  readonly generation?: number;
  readonly revision?: string;
}): ContentManifestEntry =>
  ContentManifestEntry.make({
    revision: corpusRevision(input.revision ?? 'content-v4'),
    url: 'https://example.test/topics.db',
    sha256: input.digest,
    size: input.size,
    schema_major: input.schemaMajor ?? TOPICS_SCHEMA_MAJOR,
    generation: corpusGeneration(input.generation ?? 4),
  });

/** Provenance in memory rather than in the artifact's own `meta` table, for
 *  the reason above: a SQLite store would open the candidate file. What it
 *  keeps is what the lifecycle actually reads back — the revision *and the
 *  generation* an activation reports — so `status` sees the generation
 *  `update` installed, which is the fact the next startup's decision turns on.
 *
 *  `Effect.suspend`, and load-bearing: `layerNativeFileArtifacts` builds the
 *  installer's `current` **once**, calling `read` at layer construction and
 *  holding the Effect it returned. A store that decided between success and
 *  failure at call time would therefore be frozen at "nothing installed" for
 *  the life of the layer — every install would succeed and every subsequent
 *  read would report `None`. Both real stores return an Effect that reads at
 *  run time, and so must this one.
 *
 *  `seed` is what makes a *restart* expressible: a store handed an existing
 *  provenance is a host that already has a verified generation on disk, which
 *  is exactly the state the re-flooring regression needs. */
const makeProvenanceStore = (
  seed: Option.Option<CorpusProvenance> = Option.none(),
): NativeFileArtifactProvenanceStore => {
  let current = seed;
  return {
    read: () =>
      Effect.suspend(() =>
        Option.match(current, {
          onNone: () => Effect.fail('provenance is unavailable'),
          onSome: Effect.succeed,
        }),
      ),
    write: (_filename, provenance) =>
      Effect.sync(() => {
        current = Option.some(provenance);
      }),
  };
};

const offering = (entry: ContentManifestEntry): ManifestFetchOutcome => ({
  _tag: 'fetched',
  manifest: ContentManifest.make({
    revision: corpusRevision('manifest-1'),
    artifacts: { topics: entry },
  }),
});

/** How many times the release URL was fetched, and with what.
 *
 *  The observable that separates "the manifest entry reached the installer"
 *  from "the host re-ran its own compiled sources and reported success anyway"
 *  — the failure round-3 F1 found, which every earlier assertion in this file
 *  was blind to because the fixture built the release source *from the entry*
 *  before the service ever ran. */
interface FetchLog {
  readonly urls: () => readonly string[];
}

/** One host, wired the way Electron main is: the native topics lifecycle over a
 *  temp destination and a manifest source the test controls.
 *
 *  **The recipe carries no release source.** That is the whole point (round-3
 *  F1): the offered entry is not in this host's compiled source list, so the
 *  only path from the manifest to the installer is `CorpusSupply.installFrom`
 *  through the recipe's `releaseSource` builder. A host whose `update` called
 *  `ensure` would find nothing to install here and report an activation it did
 *  not perform — or none at all.
 *
 *  `sources` holds only what a real host holds before any release is published:
 *  the local candidates. `localSources` lets a test add one, which is how the
 *  "a local source is not what an offer installs" case is expressed. */
const hostFor = (input: {
  readonly destination: string;
  readonly entry: ContentManifestEntry;
  readonly bytes: string;
  readonly provenanceStore?: NativeFileArtifactProvenanceStore;
  readonly localSources?: readonly NativeFileArtifactSource[];
  readonly log?: FetchLog & { readonly record: (url: string) => void };
  /** What the host does after an activation. Defaulting to `Inert` keeps every
   *  case that is not about the reader honest about what it composes: the
   *  update runs the same way whether or not a host has readers to reopen. */
  readonly activation?: Layer.Layer<ContentActivation>;
}) => {
  const artifacts = layerNativeFileArtifacts({
    artifact: TopicsArtifact,
    destination: input.destination,
    provenanceStore: input.provenanceStore ?? makeProvenanceStore(),
    sources: input.localSources ?? [],
    fetch: (url) =>
      Effect.sync(() => {
        input.log?.record(url);
        return new Response(input.bytes);
      }),
    // The semantic verifier stands in for the SQLite one: a candidate that got
    // this far is bytes the digest and size already accepted, and the count it
    // reports is what the Activation carries.
    verify: () => Effect.succeed(3),
  });
  return ContentUpdate.Live.pipe(
    Layer.provide(CorpusSupply.layer.pipe(Layer.provide(artifacts))),
    Layer.provide(ContentManifestSource.layerOf(offering(input.entry))),
    Layer.provide(input.activation ?? ContentActivation.Inert),
  );
};

/** Records the corpora a run told the host to reopen. The observable for F3 at
 *  *this* seam: `service-reload.test.ts` proves a reload serves new bytes, and
 *  this proves an update is what asks for one. */
const makeActivationLog = () => {
  const reopened: string[] = [];
  return {
    layer: ContentActivation.layerOf((corpus) => Effect.sync(() => reopened.push(corpus))),
    reopened: (): readonly string[] => reopened,
  };
};

const makeFetchLog = (): FetchLog & { readonly record: (url: string) => void } => {
  const urls: string[] = [];
  return { urls: () => urls, record: (url) => urls.push(url) };
};

/** The two service calls at their own boundary. Each test composes its own host
 *  layer from a scratch directory, so the provide belongs to these helpers
 *  rather than to a block nested inside each test's generator. */
const runUpdate = (host: Layer.Layer<ContentUpdate>) =>
  Effect.flatMap(ContentUpdate, (service) => service.update('topics')).pipe(Effect.provide(host));

const runStatus = (host: Layer.Layer<ContentUpdate>) =>
  Effect.flatMap(ContentUpdate, (service) => service.status('topics')).pipe(Effect.provide(host));

describe('§10 M9 update over the shipped File Corpus lifecycle', () => {
  const test = it.scopedLive.layer(BunFileSystem.layer);

  test('installs an offered revision and reports the new activation', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: 'content-update-' });
      const destination = `${directory}/topics.db`;

      const outcome = yield* runUpdate(
        hostFor({
          destination,
          entry: manifestEntry({ digest: RELEASE_DIGEST, size: RELEASE_BYTES.length }),
          bytes: RELEASE_BYTES,
        }),
      );

      expect(Option.getOrUndefined(Option.map(outcome.activated, String))).toBe('content-v4');
      // The bytes actually reached the destination through the atomic swap.
      expect(yield* fs.readFileString(destination)).toBe(RELEASE_BYTES);
      expect(yield* fs.exists(`${destination}.building`)).toBe(false);
      // And the post-run status says so, so a caller reads one value rather
      // than re-asking.
      expect(outcome.status.decision._tag).toBe('up-to-date');
      expect(Option.getOrUndefined(Option.map(outcome.status.installed, String))).toBe(
        'content-v4',
      );
    }));

  /** **The reader is told** (round-3 F3, at the service seam).
   *
   *  An install ends in an atomic rename. A host holding an `immutable=1`
   *  connection is still serving the previous inode at that moment, so
   *  "activated" and "the app serves it" were two claims and only the first was
   *  true. `service-reload.test.ts` proves a reload serves the new bytes over a
   *  real driver and a real rename; this proves an activation is what asks for
   *  one, which is the half no reload test can reach. */
  test('tells the host to reopen its readers after an activation', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: 'content-update-' });
      const destination = `${directory}/topics.db`;
      const activation = makeActivationLog();

      const outcome = yield* runUpdate(
        hostFor({
          destination,
          entry: manifestEntry({ digest: RELEASE_DIGEST, size: RELEASE_BYTES.length }),
          bytes: RELEASE_BYTES,
          activation: activation.layer,
        }),
      );

      expect(Option.isSome(outcome.activated)).toBe(true);
      // Named, not merely counted: a host reopens the readers of the corpus
      // that changed and leaves the others alone.
      expect(activation.reopened()).toEqual(['topics']);
    }));

  /** The other side of it. A run that installed nothing must not tear down and
   *  rebuild a working reader — the reopen is caused by the swap, not by the
   *  attempt, and a host that reloaded on every refusal would drop connections
   *  every time an offline check ran. */
  test('does not reopen readers when nothing was activated', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: 'content-update-' });
      const destination = `${directory}/topics.db`;
      yield* fs.writeFileString(destination, ACTIVE_BYTES);
      const activation = makeActivationLog();

      const outcome = yield* runUpdate(
        hostFor({
          destination,
          entry: manifestEntry({
            digest: `sha256:${'a'.repeat(64)}`,
            size: RELEASE_BYTES.length,
          }),
          bytes: RELEASE_BYTES,
          activation: activation.layer,
        }),
      );

      expect(Option.isNone(outcome.activated)).toBe(true);
      expect(activation.reopened()).toEqual([]);
      // The refused candidate did not reach the destination either.
      expect(yield* fs.readFileString(destination)).toBe(ACTIVE_BYTES);
    }));

  test('a digest mismatch aborts and leaves the installed generation active', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: 'content-update-' });
      const destination = `${directory}/topics.db`;
      yield* fs.writeFileString(destination, ACTIVE_BYTES);

      const outcome = yield* runUpdate(
        hostFor({
          destination,
          // The manifest promises a digest the served bytes do not have.
          entry: manifestEntry({
            digest: `sha256:${'a'.repeat(64)}`,
            size: RELEASE_BYTES.length,
          }),
          bytes: RELEASE_BYTES,
        }),
      );

      // Nothing was activated, and the caller learned that from a value rather
      // than from a failure it had to catch.
      expect(Option.isNone(outcome.activated)).toBe(true);
      // The installed generation is untouched — the whole point of the clause.
      expect(yield* fs.readFileString(destination)).toBe(ACTIVE_BYTES);
      expect(yield* fs.exists(`${destination}.building`)).toBe(false);
    }));

  test('a size mismatch aborts and leaves the installed generation active', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: 'content-update-' });
      const destination = `${directory}/topics.db`;
      yield* fs.writeFileString(destination, ACTIVE_BYTES);

      const outcome = yield* runUpdate(
        hostFor({
          destination,
          // Digest matches the bytes exactly; only the declared size is
          // wrong, so nothing but the size check can reject this candidate.
          entry: manifestEntry({
            digest: RELEASE_DIGEST,
            size: RELEASE_BYTES.length + 1,
          }),
          bytes: RELEASE_BYTES,
        }),
      );

      expect(Option.isNone(outcome.activated)).toBe(true);
      expect(yield* fs.readFileString(destination)).toBe(ACTIVE_BYTES);
      expect(yield* fs.exists(`${destination}.building`)).toBe(false);
    }));

  /** §3.6's gate, exercised through the service rather than through the pure
   *  decision: a manifest above this build's schema major must not reach the
   *  installer at all, so the destination is never even opened. */
  test('a schema-major overrun is refused before any install is attempted', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: 'content-update-' });
      const destination = `${directory}/topics.db`;
      yield* fs.writeFileString(destination, ACTIVE_BYTES);

      const outcome = yield* runUpdate(
        hostFor({
          destination,
          entry: manifestEntry({
            digest: RELEASE_DIGEST,
            size: RELEASE_BYTES.length,
            schemaMajor: TOPICS_SCHEMA_MAJOR + 1,
          }),
          bytes: RELEASE_BYTES,
        }),
      );

      expect(outcome.status.decision._tag).toBe('refused');
      expect(Option.isNone(outcome.activated)).toBe(true);
      expect(yield* fs.readFileString(destination)).toBe(ACTIVE_BYTES);
    }));

  test('status never mutates: an offer left unacted-on installs nothing', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: 'content-update-' });
      const destination = `${directory}/topics.db`;

      const status = yield* runStatus(
        hostFor({
          destination,
          entry: manifestEntry({ digest: RELEASE_DIGEST, size: RELEASE_BYTES.length }),
          bytes: RELEASE_BYTES,
        }),
      );

      expect(status.decision._tag).toBe('offer');
      // `bible topics status` promises "no mutation". The install the offer
      // describes has not run, and this is the observable that says so.
      expect(yield* fs.exists(destination)).toBe(false);
    }));

  /** **The manifest entry reaches the real installer** (round-3 F1).
   *
   *  This host's compiled recipe has *no* release source — exactly the state a
   *  shipped build is in before the first content release. The only bytes any
   *  installer could obtain are the ones the offered entry names, so the URL
   *  the fetch was asked for is proof of which path ran: `update` calling
   *  `ensure` would have consulted the empty source list, installed nothing,
   *  and fetched nothing at all.
   *
   *  The three things asserted are the three things that were missing: the
   *  offered URL was fetched, the bytes it served are on disk at the
   *  destination, and the activation names the offered revision. */
  test('the offered manifest entry is what reaches the installer', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: 'content-update-' });
      const destination = `${directory}/topics.db`;
      const log = makeFetchLog();

      const outcome = yield* runUpdate(
        hostFor({
          destination,
          entry: manifestEntry({ digest: RELEASE_DIGEST, size: RELEASE_BYTES.length }),
          bytes: RELEASE_BYTES,
          log,
        }),
      );

      // The host went to the address the *manifest* named, not to any address
      // it had compiled in — because it had none compiled in.
      expect(log.urls()).toEqual(['https://example.test/topics.db']);
      expect(Option.getOrUndefined(Option.map(outcome.activated, String))).toBe('content-v4');
      expect(yield* fs.readFileString(destination)).toBe(RELEASE_BYTES);
    }));

  /** **An offer installs the offered release, not a local source** (round-3 F1).
   *
   *  With a local file also available, `ensure` would have taken it — local
   *  sources outrank a release in the recipe's own priority order, which is
   *  right for startup and wrong for an accepted offer. `installFrom` bypasses
   *  the ordering entirely because the caller has already decided *which*
   *  release it is installing. */
  test('an accepted offer installs the offered bytes even when a local source exists', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: 'content-update-' });
      const destination = `${directory}/topics.db`;
      const packaged = `${directory}/packaged-topics.db`;
      yield* fs.writeFileString(packaged, ACTIVE_BYTES);

      const outcome = yield* runUpdate(
        hostFor({
          destination,
          entry: manifestEntry({ digest: RELEASE_DIGEST, size: RELEASE_BYTES.length }),
          bytes: RELEASE_BYTES,
          localSources: [{ kind: 'packaged', path: packaged, label: 'packaged' }],
        }),
      );

      expect(Option.getOrUndefined(Option.map(outcome.activated, String))).toBe('content-v4');
      // The release bytes, not the packaged ones.
      expect(yield* fs.readFileString(destination)).toBe(RELEASE_BYTES);
    }));

  /** **A newer runtime artifact survives a restart** (round-3 F2).
   *
   *  The scenario the finding names: a host installed runtime generation 4,
   *  the app restarts, and the compiled pin is still generation 3. Nothing must
   *  re-floor the newer artifact, and the honest answer to a manifest that
   *  still names 4 is `up-to-date`.
   *
   *  The restart is expressed as what a restart *is* to this policy: a fresh
   *  service over a provenance store that already holds the installed
   *  generation — the sidecar or `meta` row a real host reads back from disk.
   *  Without the generation recorded at install time, `installedGeneration` is
   *  `None` here, the floor is all the decision has, and the manifest entry
   *  reads as an offer over an artifact that is already newer. */
  test('a runtime generation above the pin survives a restart and is not re-offered', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: 'content-update-' });
      const destination = `${directory}/topics.db`;
      const store = makeProvenanceStore();
      const entry = manifestEntry({
        digest: RELEASE_DIGEST,
        size: RELEASE_BYTES.length,
        generation: 4,
      });

      // Launch one: the offer is accepted and generation 4 is activated.
      const first = yield* runUpdate(
        hostFor({ destination, entry, bytes: RELEASE_BYTES, provenanceStore: store }),
      );
      expect(Option.getOrUndefined(Option.map(first.activated, String))).toBe('content-v4');

      // Launch two: a new service graph over the same on-disk provenance, the
      // same compiled floor, the same manifest.
      const second = yield* runStatus(
        hostFor({ destination, entry, bytes: RELEASE_BYTES, provenanceStore: store }),
      );

      // The generation the install recorded is read back — this is the fact
      // that was not being persisted.
      expect(Option.getOrUndefined(Option.map(second.installedGeneration, Number))).toBe(4);
      expect(second.decision._tag).toBe('up-to-date');
      // And the artifact on disk is still the one launch one installed.
      expect(yield* fs.readFileString(destination)).toBe(RELEASE_BYTES);
    }));

  /** The same restart, one release behind: the manifest has rolled *back* to
   *  generation 3 while this host holds 4. Still `up-to-date`, still nothing
   *  installed — a client ahead of the publisher is not a client to downgrade. */
  test('a manifest naming an older generation than the installed one installs nothing', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: 'content-update-' });
      const destination = `${directory}/topics.db`;
      const store = makeProvenanceStore();

      yield* runUpdate(
        hostFor({
          destination,
          entry: manifestEntry({
            digest: RELEASE_DIGEST,
            size: RELEASE_BYTES.length,
            generation: 4,
          }),
          bytes: RELEASE_BYTES,
          provenanceStore: store,
        }),
      );

      const log = makeFetchLog();
      const rolledBack = yield* runUpdate(
        hostFor({
          destination,
          entry: manifestEntry({
            digest: RELEASE_DIGEST,
            size: RELEASE_BYTES.length,
            generation: 3,
            revision: 'content-v3',
          }),
          bytes: 'the older topics artifact',
          provenanceStore: store,
          log,
        }),
      );

      expect(rolledBack.status.decision._tag).toBe('up-to-date');
      expect(Option.isNone(rolledBack.activated)).toBe(true);
      // Nothing was even fetched: a downgrade is refused before any bytes move.
      expect(log.urls()).toEqual([]);
      expect(yield* fs.readFileString(destination)).toBe(RELEASE_BYTES);
    }));

  /** **The fresh machine, offline** (round-3 F7).
   *
   *  No installed artifact, a compiled pin, no manifest source. §3.6 says the
   *  pinned floor stands with **no error** — so the observable is that a caller
   *  gets a value, the floor it names is the one this build compiled, and
   *  nothing was installed on the way to answering. */
  test('a fresh machine with no manifest reports the pinned floor and installs nothing', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: 'content-update-' });
      const destination = `${directory}/topics.db`;

      const artifacts = layerNativeFileArtifacts({
        artifact: TopicsArtifact,
        destination,
        provenanceStore: makeProvenanceStore(),
        sources: [],
        verify: () => Effect.succeed(3),
      });
      const status = yield* runStatus(
        ContentUpdate.Live.pipe(
          Layer.provide(CorpusSupply.layer.pipe(Layer.provide(artifacts))),
          Layer.provide(ContentManifestSource.Unreachable),
          Layer.provide(ContentActivation.Inert),
        ),
      );

      expect(status.decision._tag).toBe('offline');
      expect(Option.isNone(status.installed)).toBe(true);
      expect(Option.isNone(status.installedGeneration)).toBe(true);
      // The floor is this build's compiled pin, reported rather than invented.
      expect(status.floor.schemaMajor).toBe(TOPICS_SCHEMA_MAJOR);
      // Today's build publishes no topics release, so its pin is `None` — and
      // saying so here is what makes the `Option.some` case below a *different*
      // shape rather than the same one twice.
      expect(Option.isNone(status.floor.pinned)).toBe(true);
      // And reporting installed nothing: the destination is still absent.
      expect(yield* fs.exists(destination)).toBe(false);
    }));

  /** **The fresh machine, offline, on a build that ships a pin** (round-4 F7).
   *
   *  The case above is the *only* one today's constants can reach:
   *  `TOPICS_ARTIFACT_RELEASE` is `None`, so `floor.pinned` is `None` and the
   *  offline answer is "nothing, and nothing pinned". Every host will leave
   *  that state the day a release is published, and the floor is precisely what
   *  a fresh offline machine has *instead* of an installed generation — so the
   *  shape it takes when the pin exists cannot go untested until the release
   *  ships.
   *
   *  The pin is a real `FileArtifactRelease` through the shipped derivation
   *  (`compiledFloor`), not a hand-built `ContentFloor`: what is under test is
   *  that a published pin becomes a floor that names its revision and its
   *  ordinal, which is the step the release-day edit will rely on. */
  test('a fresh machine with a published pin reports that pin as its floor', () =>
    Effect.sync(() => {
      const pinned: FileArtifactRelease = {
        url: 'https://example.test/topics-v3.db',
        revision: 'content-v3',
        digest: RELEASE_DIGEST,
        size: RELEASE_BYTES.length,
      };
      const floor = compiledFloor({
        release: Option.some(pinned),
        generation: Option.some(corpusGeneration(3)),
        schemaMajor: TOPICS_SCHEMA_MAJOR,
      });

      // The two halves a fresh offline machine reports, and the two the
      // decision compares a manifest entry against.
      expect(Option.getOrUndefined(Option.map(floor.pinned, String))).toBe('content-v3');
      expect(Option.getOrUndefined(Option.map(floor.pinnedGeneration, Number))).toBe(3);
      expect(floor.schemaMajor).toBe(TOPICS_SCHEMA_MAJOR);

      // And it behaves as a floor: offline stands on it with no error, and a
      // manifest at or below it is already satisfied rather than an offer.
      expect(
        decideUpdate({
          corpus: 'topics',
          floor,
          installed: Option.none(),
          manifest: { _tag: 'unavailable', detail: 'no network' },
        })._tag,
      ).toBe('offline');
      expect(
        decideUpdate({
          corpus: 'topics',
          floor,
          installed: Option.none(),
          manifest: {
            _tag: 'fetched',
            manifest: ContentManifest.make({
              revision: corpusRevision('manifest-1'),
              artifacts: {
                topics: manifestEntry({
                  digest: RELEASE_DIGEST,
                  size: RELEASE_BYTES.length,
                  generation: 3,
                  revision: 'content-v3',
                }),
              },
            }),
          },
        })._tag,
      ).toBe('up-to-date');
    }));

  /** A host whose recipe offers **no** runtime install path at all reports the
   *  refusal as a value rather than installing from somewhere else.
   *
   *  `installFrom` returns `CorpusRecipeUnavailableError` when the recipe has no
   *  `releaseSource`, and `update` turns that into "nothing activated" — the
   *  same posture a digest mismatch takes, because the consequence is the same:
   *  the installed generation is still active. */
  test('a host with no runtime install path activates nothing and does not fail', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: 'content-update-' });
      const destination = `${directory}/topics.db`;
      yield* fs.writeFileString(destination, ACTIVE_BYTES);

      const noRuntimePath = Layer.merge(
        TopicsArtifact.layerRecipe({ sources: [] }),
        TopicsArtifact.layerInstaller({
          current: Effect.succeedNone,
          activeFile: Effect.succeedNone,
          install: () => Effect.die('the installer must never be reached'),
        }),
      );
      const outcome = yield* runUpdate(
        ContentUpdate.Live.pipe(
          Layer.provide(CorpusSupply.layer.pipe(Layer.provide(noRuntimePath))),
          Layer.provide(ContentActivation.Inert),
          Layer.provide(
            ContentManifestSource.layerOf(
              offering(manifestEntry({ digest: RELEASE_DIGEST, size: RELEASE_BYTES.length })),
            ),
          ),
        ),
      );

      expect(Option.isNone(outcome.activated)).toBe(true);
      expect(yield* fs.readFileString(destination)).toBe(ACTIVE_BYTES);
    }));

  /** §3.6's offline rule at the service seam: no manifest source wired means
   *  the pinned floor stands, reported as a value with no error channel. */
  test('an unreachable manifest reports offline rather than failing', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: 'content-update-' });
      const destination = `${directory}/topics.db`;
      yield* fs.writeFileString(destination, ACTIVE_BYTES);

      const artifacts = layerNativeFileArtifacts({
        artifact: TopicsArtifact,
        destination,
        provenanceStore: makeProvenanceStore(),
        sources: [],
        verify: () => Effect.succeed(3),
      });
      const status = yield* runStatus(
        ContentUpdate.Live.pipe(
          Layer.provide(CorpusSupply.layer.pipe(Layer.provide(artifacts))),
          Layer.provide(ContentManifestSource.Unreachable),
          Layer.provide(ContentActivation.Inert),
        ),
      );

      expect(status.decision._tag).toBe('offline');
      // The active generation is untouched, and no error reached this caller.
      expect(yield* fs.readFileString(destination)).toBe(ACTIVE_BYTES);
    }));
});
