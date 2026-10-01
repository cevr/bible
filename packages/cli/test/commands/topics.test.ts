/** `bible topics status --json` and `bible topics update --json` print the
 *  `ContentUpdate` service's own result through the core codecs.
 *
 *  `packages/core/src/content-update/*.test.ts` already proves the policy. What
 *  it cannot see is the last hop: whether the *command* still runs the shared
 *  codec on the way to stdout. A hand-written projection reappearing in the
 *  printer would leave every other suite green and break every script that pipes
 *  `--json`.
 *
 *  So these tests run the real command — argument parsing, the layer seam, the
 *  encoder, `Console.log` — and compare its captured stdout to the bytes the
 *  same `ContentUpdate` instance answers with when asked directly.
 */

import {
  ContentActivation,
  ContentManifest,
  ContentManifestEntry,
  ContentManifestSource,
  ContentStatusJson,
  ContentUpdate,
  ContentUpdateJson,
} from '@bible/core/content-update';
import {
  ADAPTER_EXPECTATIONS,
  OVERRUN_REVISION,
  refusingContentUpdate,
} from '@bible/core/content-update/testing';
import {
  corpusGeneration,
  corpusRevision,
  CorpusSupply,
  type CorpusProvenance,
  TOPICS_SCHEMA_MAJOR,
  TopicsArtifact,
} from '@bible/core/corpus-supply';
import { layerNativeFileArtifacts } from '@bible/core/corpus-supply/bun';
import { BunFileSystem } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Layer, Option, Schema } from 'effect';

import { topicsStatus, topicsUpdate } from '../../src/commands/topics.js';
import { ContentLayer } from '../../src/commands/topics-layer.js';
import { runCli } from '../lib/run-cli.js';

/** One service instance for both seams: a difference in service construction
 *  must not be able to hide behind a difference the test was not looking for. */
const fixtureContent: Layer.Layer<ContentUpdate> = refusingContentUpdate;

/** The codecs are restated here rather than imported from the command, because
 *  what is under test is that the command produces *these* bytes. Importing the
 *  command's own helpers would make the assertion true by construction. */
const encodeStatus = Schema.encodeEffect(Schema.fromJsonString(ContentStatusJson, { space: 2 }));
const encodeUpdate = Schema.encodeEffect(Schema.fromJsonString(ContentUpdateJson, { space: 2 }));

/** `status`, asked of the fixture service and encoded the way the command
 *  encodes it. */
const serviceStatusJson = Effect.flatMap(ContentUpdate, (content) => content.status('topics')).pipe(
  Effect.flatMap(encodeStatus),
  Effect.provide(fixtureContent),
);

/** `update`, asked the same way. */
const serviceUpdateJson = Effect.flatMap(ContentUpdate, (content) => content.update('topics')).pipe(
  Effect.flatMap(encodeUpdate),
  Effect.provide(fixtureContent),
);

/** The bytes an offered release serves, and their true digest. A stand-in for
 *  a `topics.db`: what is under test is whether `status` reaches for the
 *  installer at all, so the bytes are not a database and the semantic verifier
 *  is substituted below, as `content-update/service.test.ts` does. */
const RELEASE_BYTES = 'the offered topics artifact';
const RELEASE_URL = 'https://example.test/topics-v4.db';
const OFFERED_REVISION = corpusRevision('content-v4');

/** A CLI host that is genuinely being offered an installable update.
 *
 *  Wired the way the shipped CLI is — `CorpusSupply` over the native file
 *  artifact lifecycle, a real temp destination, the real atomic swap — with
 *  only the manifest and the release bytes under the test's control. A stubbed
 *  supply would make the mutation-freedom claim vacuous: a `status` that called
 *  the installer would have nothing to call.
 *
 *  The recipe carries **no compiled source**, so the only path from the offered
 *  entry to the installer is the release source `installFrom` builds — which
 *  means every fetch recorded here was caused by acting on the offer. */
const makeOfferingHost = (destination: string) => {
  const fetches: string[] = [];
  let provenance = Option.none<CorpusProvenance>();
  const artifacts = layerNativeFileArtifacts({
    artifact: TopicsArtifact,
    destination,
    // A provenance store that actually remembers, so a second run over this
    // host reads the generation the first one installed. The shipped SQLite
    // store cannot be used here: it writes `meta` rows into the candidate, and
    // the fixture bytes are not a database.
    provenanceStore: {
      read: () =>
        // Absence is the store's failure channel, as it is for the shipped
        // sidecar and SQLite stores: a file with no provenance is a file this
        // host has not installed.
        Effect.fromOption(provenance, () => 'no provenance is recorded'),
      write: (_file, written) =>
        Effect.sync(() => {
          provenance = Option.some(written);
        }),
    },
    sources: [],
    fetch: (url) =>
      Effect.sync(() => {
        fetches.push(url);
        return new Response(RELEASE_BYTES);
      }),
    verify: () => Effect.succeed(3),
  });
  const entry = ContentManifestEntry.make({
    revision: OFFERED_REVISION,
    url: RELEASE_URL,
    // Hashed here rather than written down: a literal digest would need
    // re-deriving by hand every time the fixture bytes change, and a stale one
    // would turn this into the *mismatch* case without saying so.
    sha256: `sha256:${new Bun.CryptoHasher('sha256').update(RELEASE_BYTES).digest('hex')}`,
    size: RELEASE_BYTES.length,
    schema_major: TOPICS_SCHEMA_MAJOR,
    generation: corpusGeneration(4),
  });
  return {
    fetches: (): readonly string[] => fetches,
    layer: ContentUpdate.Live.pipe(
      Layer.provide(CorpusSupply.layer.pipe(Layer.provide(artifacts))),
      Layer.provide(
        ContentManifestSource.layerOf({
          _tag: 'fetched',
          manifest: ContentManifest.make({
            revision: corpusRevision('manifest-1'),
            artifacts: { topics: entry },
          }),
        }),
      ),
      // The CLI reopens nothing: its next read is a new process.
      Layer.provide(ContentActivation.Inert),
    ),
  };
};

describe('bible topics', () => {
  /** The two host-wired cases need a real filesystem: they write a real
   *  artifact through the real atomic swap. The other cases do not, and
   *  providing it to all of them costs nothing. */
  const hosted = it.scopedLive.layer(BunFileSystem.layer);

  it.scopedLive('status --json is byte-identical to the service status', () =>
    Effect.gen(function* () {
      const cli = yield* runCli(topicsStatus, ['--json'], {}).pipe(
        Effect.provideService(ContentLayer, fixtureContent),
      );
      expect(cli.success).toBe(true);

      expect(cli.stdout).toBe(yield* serviceStatusJson);
      // Not vacuous: the fixture manifest names a schema major above this
      // build's, so both sides are carrying a real refusal rather than two
      // empty envelopes that happen to match.
      expect(cli.stdout).toContain(ADAPTER_EXPECTATIONS.overrun);
      expect(cli.stdout).toContain(String(OVERRUN_REVISION));
    }),
  );

  it.scopedLive('update --json is byte-identical to the service update', () =>
    Effect.gen(function* () {
      const cli = yield* runCli(topicsUpdate, ['--json'], {}).pipe(
        Effect.provideService(ContentLayer, fixtureContent),
      );
      expect(cli.success).toBe(true);

      expect(cli.stdout).toBe(yield* serviceUpdateJson);
    }),
  );

  /** §3.6's contract for `status`: **asking what state a machine is in must not
   *  change it** (round-3 F6).
   *
   *  The earlier version of this test called `service.status` directly, over a
   *  manifest that *refused* — so the strongest thing it could prove was that a
   *  run with nothing to install installed nothing. That is true of a `status`
   *  which secretly installs, too.
   *
   *  This one closes both gaps. It runs the **real command handler**, over an
   *  **offer**: a host with nothing installed, a manifest naming bytes it could
   *  install right now, and the shipped native installer wired behind it. The
   *  observables are the ones that would actually move — how many times the
   *  release URL was fetched, and what is on disk — so a `status` that reached
   *  for the installer fails here rather than in production. */
  hosted('status does not install, even when an update is on offer', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: 'cli-topics-status-' });
      const destination = `${directory}/topics.db`;
      const offer = makeOfferingHost(destination);

      const cli = yield* runCli(topicsStatus, ['--json'], {}).pipe(
        Effect.provideService(ContentLayer, offer.layer),
      );
      expect(cli.success).toBe(true);

      // Not vacuous: this host *is* being offered something installable, which
      // is the only state in which the claim has content.
      expect(cli.stdout).toContain('offer');

      // Zero installer invocations. The release URL is the installer's only
      // way to obtain the bytes, so a fetch count of zero is the whole claim.
      expect(offer.fetches()).toEqual([]);
      // And nothing reached the filesystem: neither the artifact nor the
      // staging file the atomic swap writes before renaming.
      expect(yield* fs.exists(destination)).toBe(false);
      expect(yield* fs.exists(`${destination}.building`)).toBe(false);
    }),
  );

  /** The other half, so the assertion above cannot pass because the host was
   *  incapable of installing anything. Same host, same offer, `update` instead
   *  of `status` — this one *does* fetch and *does* write. */
  hosted('update over that same host does install, so the check above is not vacuous', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: 'cli-topics-update-' });
      const destination = `${directory}/topics.db`;
      const offer = makeOfferingHost(destination);

      const cli = yield* runCli(topicsUpdate, ['--json'], {}).pipe(
        Effect.provideService(ContentLayer, offer.layer),
      );
      expect(cli.success).toBe(true);

      expect(offer.fetches()).toEqual([RELEASE_URL]);
      expect(yield* fs.readFileString(destination)).toBe(RELEASE_BYTES);
      expect(cli.stdout).toContain(String(OFFERED_REVISION));
    }),
  );

  it.scopedLive('the human output names the refused revision and what to do', () =>
    Effect.gen(function* () {
      const cli = yield* runCli(topicsStatus, [], {}).pipe(
        Effect.provideService(ContentLayer, fixtureContent),
      );
      expect(cli.success).toBe(true);

      // Without `--json` the operator still gets both facts: which version was
      // refused, and that a newer app is what unblocks it. A refusal printed as
      // only a tag would leave them with nothing to act on.
      expect(cli.stdout).toContain(String(OVERRUN_REVISION));
      expect(cli.stdout).toContain('newer app');
      expect(cli.stdout).toContain('installed  (none)');
    }),
  );

  it.scopedLive('a refused update on a host with nothing installed says nothing is active', () =>
    Effect.gen(function* () {
      const cli = yield* runCli(topicsUpdate, [], {}).pipe(
        Effect.provideService(ContentLayer, fixtureContent),
      );
      expect(cli.success).toBe(true);

      // The run is reported and nothing failed. But this fixture host holds no
      // artifact — `status.installed` is `None` — so the line must not claim an
      // installed generation is still serving. There is none (round-4 B3).
      expect(cli.stdout).toContain('activated  (nothing');
      expect(cli.stdout).toContain('no content is installed');
      expect(cli.stdout).not.toContain('the installed generation is still active');
    }),
  );

  /** The same "activated nothing" line on a host that *does* hold a
   *  generation — §3.6's mismatch posture, where saying the installed content
   *  still serves is the true and reassuring thing to say.
   *
   *  Reached by installing once and then running again: the second run finds
   *  the offered revision already active, activates nothing, and reports a
   *  host whose content is working. */
  hosted('an update that activates nothing on an installed host says it still serves', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: 'bible-topics-update-' });
      const host = makeOfferingHost(`${directory}/topics.db`);

      const first = yield* runCli(topicsUpdate, [], {}).pipe(
        Effect.provideService(ContentLayer, host.layer),
      );
      expect(first.stdout).toContain(`activated  ${String(OFFERED_REVISION)}`);

      const second = yield* runCli(topicsUpdate, [], {}).pipe(
        Effect.provideService(ContentLayer, host.layer),
      );
      expect(second.success).toBe(true);
      expect(second.stdout).toContain('the installed generation is still active');
      expect(second.stdout).not.toContain('no content is installed');
    }),
  );
});
