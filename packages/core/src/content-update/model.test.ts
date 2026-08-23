/** §10 Milestone 9's "Core tests" bullet, clause by clause.
 *
 *  "the update policy is one portable policy — the compiled pin is the floor, a
 *  newer runtime revision is offered, an artifact whose `schema_major` exceeds
 *  the app's is refused; … offline yields the pinned floor with no error."
 *
 *  Every case here runs `decideUpdate` directly, because that is the *whole* of
 *  the policy: the three hosts differ only in how the manifest bytes arrive, so
 *  a policy test that went through a transport would be testing the transport.
 *  The transport's own claim — that all three refuse the same overrun — is
 *  `manifest-http.test.ts` plus the three host suites.
 */

import { Effect, Option, Schema } from 'effect';
import { describe, expect, it } from 'effect-bun-test';

import { corpusGeneration, corpusRevision } from '../corpus-supply/model.js';
import { TOPICS_SCHEMA_MAJOR } from '../corpus-supply/file-artifact.js';
import {
  ContentFloor,
  ContentManifest,
  ContentManifestEntry,
  decideUpdate,
  type ContentDecision,
  type ManifestFetchOutcome,
} from './model.js';

const entry = (input: {
  readonly revision: string;
  readonly generation: number;
  readonly schemaMajor?: number;
}): ContentManifestEntry =>
  ContentManifestEntry.make({
    revision: corpusRevision(input.revision),
    url: `https://github.com/cevr/bible/releases/download/${input.revision}/topics.db`,
    sha256: `sha256:${'a'.repeat(64)}`,
    size: 4_096,
    schema_major: input.schemaMajor ?? TOPICS_SCHEMA_MAJOR,
    generation: corpusGeneration(input.generation),
  });

const fetched = (entries: Record<string, ContentManifestEntry>): ManifestFetchOutcome => ({
  _tag: 'fetched',
  manifest: ContentManifest.make({
    revision: corpusRevision('manifest-1'),
    artifacts: entries,
  }),
});

const OFFLINE: ManifestFetchOutcome = { _tag: 'unavailable', detail: 'no network' };

/** A build whose compiled pin is `content-v3`, published as generation 3. */
const pinnedFloor = ContentFloor.make({
  pinned: Option.some(corpusRevision('content-v3')),
  pinnedGeneration: Option.some(corpusGeneration(3)),
  schemaMajor: TOPICS_SCHEMA_MAJOR,
});

/** The build that ships today: no topics release is published, so the pin is
 *  `None` (`TOPICS_ARTIFACT_RELEASE`) and so is its generation. */
const unpinnedFloor = ContentFloor.make({
  pinned: Option.none(),
  pinnedGeneration: Option.none(),
  schemaMajor: TOPICS_SCHEMA_MAJOR,
});

/** One decision over the topics corpus, so each case below reads as the three
 *  facts it varies rather than as a four-field literal. */
const decideTopics = (input: {
  readonly floor?: ContentFloor;
  readonly installed?: number;
  readonly manifest: ManifestFetchOutcome;
}): ContentDecision =>
  decideUpdate({
    corpus: 'topics',
    floor: input.floor ?? pinnedFloor,
    installed: Option.map(Option.fromUndefinedOr(input.installed), corpusGeneration),
    manifest: input.manifest,
  });

describe('§3.6 the update policy', () => {
  it.effect('offers a runtime generation above what is installed', () =>
    Effect.sync(() => {
      const decision = decideTopics({
        installed: 3,
        manifest: fetched({ topics: entry({ revision: 'content-v4', generation: 4 }) }),
      });
      expect(decision._tag).toBe('offer');
      if (decision._tag !== 'offer') return;
      expect(String(decision.entry.revision)).toBe('content-v4');
    }),
  );

  it.effect('reports up-to-date when the manifest names the installed generation', () =>
    Effect.sync(() => {
      expect(
        decideTopics({
          installed: 4,
          manifest: fetched({ topics: entry({ revision: 'content-v4', generation: 4 }) }),
        })._tag,
      ).toBe('up-to-date');
    }),
  );

  /** **The downgrade clause** (round-3 F2).
   *
   *  A client that already holds generation 5 and reads a manifest naming
   *  generation 4 is *ahead* of what the publisher currently names — the
   *  ordinary state during a rollback. It must install nothing, and it must not
   *  report an error either: nothing is wrong, the client is simply newer.
   *
   *  The tags here sort the wrong way on purpose. `content-v4` is
   *  lexicographically below `content-v5`, so a comparison by revision string
   *  would also pass; what fails without the generation is the *equality*
   *  comparison the first cut used, which treated any different tag as newer
   *  and offered this entry. */
  it.effect('never offers a generation below what is installed', () =>
    Effect.sync(() => {
      expect(
        decideTopics({
          installed: 5,
          manifest: fetched({ topics: entry({ revision: 'content-v4', generation: 4 }) }),
        })._tag,
      ).toBe('up-to-date');
    }),
  );

  /** The same rule where the tags sort the *other* way — a re-published tag
   *  that reads as "newer" by string and older by ordinal. Only the number
   *  decides. */
  it.effect('never offers a generation below what is installed, whatever the tag sorts as', () =>
    Effect.sync(() => {
      expect(
        decideTopics({
          installed: 5,
          manifest: fetched({ topics: entry({ revision: 'content-zz', generation: 2 }) }),
        })._tag,
      ).toBe('up-to-date');
    }),
  );

  /** The floor clause, and the one a naive "is it installed?" check gets wrong.
   *
   *  With nothing installed, a manifest entry at the compiled pin's generation
   *  is not an offer: those exact bytes are what the local recipe already
   *  supplies with no network, so offering them would send a client to the
   *  release host to download content its own packaged copy contains. */
  it.effect('never offers the compiled pin itself, even with nothing installed', () =>
    Effect.sync(() => {
      expect(
        decideTopics({
          manifest: fetched({ topics: entry({ revision: 'content-v3', generation: 3 }) }),
        })._tag,
      ).toBe('up-to-date');
    }),
  );

  /** And nothing *below* the pin either. A manifest naming an older release
   *  than the one this build ships would otherwise talk a fresh machine into
   *  downloading content worse than what it already has on disk. */
  it.effect('never offers below the compiled pin', () =>
    Effect.sync(() => {
      expect(
        decideTopics({
          manifest: fetched({ topics: entry({ revision: 'content-v2', generation: 2 }) }),
        })._tag,
      ).toBe('up-to-date');
    }),
  );

  /** The other half of the floor: a manifest above the pin is offered when
   *  nothing is installed, so a fresh install is not stranded on the floor. */
  it.effect('offers above the pin when nothing is installed yet', () =>
    Effect.sync(() => {
      expect(
        decideTopics({
          manifest: fetched({ topics: entry({ revision: 'content-v5', generation: 5 }) }),
        })._tag,
      ).toBe('offer');
    }),
  );

  /** **The fresh machine with no network** (round-3 F7).
   *
   *  Nothing installed, a compiled pin, and no manifest. §10 M9's clause is
   *  "offline yields the pinned floor with no error" — and the case that
   *  actually exercises "the pinned floor" is this one, where the pin is the
   *  only content the host has. The decision is `offline`, it is a *value*, and
   *  the floor it reports is the pin. */
  it.effect('a fresh machine with no network reports the pinned floor and no error', () =>
    Effect.sync(() => {
      const decision = decideTopics({ manifest: OFFLINE });
      expect(decision._tag).toBe('offline');
      // The floor the host would install from is intact and reportable: the
      // caller reads a pin, not an empty state.
      expect(Option.getOrUndefined(Option.map(pinnedFloor.pinned, String))).toBe('content-v3');
      expect(Option.getOrUndefined(Option.map(pinnedFloor.pinnedGeneration, Number))).toBe(3);
    }),
  );

  it.effect('refuses an artifact whose schema major exceeds this build', () =>
    Effect.sync(() => {
      const decision = decideTopics({
        installed: 3,
        manifest: fetched({
          topics: entry({
            revision: 'content-v9',
            generation: 9,
            schemaMajor: TOPICS_SCHEMA_MAJOR + 1,
          }),
        }),
      });
      expect(decision._tag).toBe('refused');
      if (decision._tag !== 'refused') return;
      expect(decision.reason).toBe('schema-major');
      // The refused version is carried, so a settings entry can say *which*
      // version needs a newer app rather than only that something was refused.
      expect(String(decision.available.revision)).toBe('content-v9');
    }),
  );

  /** The gate runs before the comparison. A client somehow holding a too-new
   *  generation must be told to update the app, not told it is current. */
  it.effect('refuses a too-new schema major even when it matches what is installed', () =>
    Effect.sync(() => {
      expect(
        decideTopics({
          installed: 9,
          manifest: fetched({
            topics: entry({
              revision: 'content-v9',
              generation: 9,
              schemaMajor: TOPICS_SCHEMA_MAJOR + 1,
            }),
          }),
        })._tag,
      ).toBe('refused');
    }),
  );

  it.effect('accepts an artifact whose schema major equals this build', () =>
    Effect.sync(() => {
      expect(
        decideTopics({
          manifest: fetched({
            topics: entry({
              revision: 'content-v4',
              generation: 4,
              schemaMajor: TOPICS_SCHEMA_MAJOR,
            }),
          }),
        })._tag,
      ).toBe('offer');
    }),
  );

  /** §3.6's cadence rule the other way round: an *older* schema is content this
   *  build can still read, so it is not refused. */
  it.effect('accepts an artifact whose schema major is below this build', () =>
    Effect.sync(() => {
      expect(
        decideTopics({
          manifest: fetched({
            topics: entry({ revision: 'content-v4', generation: 4, schemaMajor: 0 }),
          }),
        })._tag,
      ).toBe('offer');
    }),
  );

  it.effect('yields the pinned floor with no error when the manifest did not arrive', () =>
    Effect.sync(() => {
      const decision = decideTopics({ installed: 3, manifest: OFFLINE });
      // Not `up-to-date`: a client that could not check must not claim it is
      // current. And not a failure — `decideUpdate` returns a value, and there
      // is no error channel for a caller to catch.
      expect(decision._tag).toBe('offline');
      if (decision._tag !== 'offline') return;
      expect(decision.detail).toBe('no network');
    }),
  );

  it.effect('reports offline for a build with no pin at all, rather than failing', () =>
    Effect.sync(() => {
      expect(decideTopics({ floor: unpinnedFloor, manifest: OFFLINE })._tag).toBe('offline');
    }),
  );

  /** A manifest that arrived and named nothing for this corpus is a *check that
   *  succeeded*, not one that failed. Reporting `offline` here would tell a
   *  client its network was down whenever the publisher had nothing new. */
  it.effect('reports up-to-date when the manifest carries no entry for the corpus', () =>
    Effect.sync(() => {
      expect(decideTopics({ installed: 3, manifest: fetched({}) })._tag).toBe('up-to-date');
    }),
  );
});

describe('§3.6 the manifest wire model', () => {
  const decode = Schema.decodeUnknownEffect(Schema.fromJsonString(ContentManifest));

  /** One manifest body, as the **text a publisher would actually serve**.
   *
   *  Written out rather than built with an object serializer, because what is
   *  under test here is the decoder's refusal of shapes the schema's own
   *  encoder could never produce — a digest that is not a SHA-256, a missing
   *  size, a plaintext URL. Constructing those through `ContentManifest.make`
   *  is impossible by design, which is exactly why the fixture has to be bytes. */
  const manifestBody = (entry: string): string =>
    `{"revision":"manifest-2026-08","artifacts":{"topics":{${entry}}}}`;

  const VALID_TOPICS_ENTRY = `"revision":"content-v4","url":"https://github.com/cevr/bible/releases/download/content-v4/topics.db","sha256":"sha256:${'b'.repeat(64)}","size":8192,"schema_major":1,"generation":4`;

  it.effect('decodes the published shape', () =>
    Effect.gen(function* () {
      const manifest = yield* decode(manifestBody(VALID_TOPICS_ENTRY));
      expect(String(manifest.revision)).toBe('manifest-2026-08');
      const topics = Option.fromUndefinedOr(manifest.artifacts.topics);
      expect(Option.isSome(topics)).toBe(true);
      if (Option.isNone(topics)) return;
      expect(Number(topics.value.generation)).toBe(4);
    }),
  );

  /** A digest that is not a SHA-256 is not a trust surface. The whole of §3.6's
   *  trust posture is "HTTPS plus digest", so a manifest that cannot state one
   *  must not decode into a value the installer would then use. */
  it.effect('refuses an entry whose digest is not a sha256', () =>
    Effect.gen(function* () {
      const result = yield* Effect.result(
        decode(
          manifestBody(
            '"revision":"content-v4","url":"https://example.invalid/topics.db","sha256":"md5:abc","size":8192,"schema_major":1,"generation":4',
          ),
        ),
      );
      expect(result._tag).toBe('Failure');
    }),
  );

  it.effect('refuses an entry with no size', () =>
    Effect.gen(function* () {
      const result = yield* Effect.result(
        decode(
          manifestBody(
            `"revision":"content-v4","url":"https://example.invalid/topics.db","sha256":"sha256:${'b'.repeat(64)}","size":0,"schema_major":1,"generation":4`,
          ),
        ),
      );
      expect(result._tag).toBe('Failure');
    }),
  );

  /** §3.6's trust surface is HTTPS **plus** digest, and a digest over bytes
   *  fetched in the clear proves only that the bytes match what an on-path
   *  attacker wrote into the manifest. So a plaintext URL is refused at the
   *  decoder, before any client is holding a release it must remember not to
   *  install (round-3 F4). */
  it.effect('refuses an entry whose url is not https', () =>
    Effect.gen(function* () {
      const result = yield* Effect.result(
        decode(
          manifestBody(
            `"revision":"content-v4","url":"http://example.invalid/topics.db","sha256":"sha256:${'b'.repeat(64)}","size":8192,"schema_major":1,"generation":4`,
          ),
        ),
      );
      expect(result._tag).toBe('Failure');
    }),
  );

  /** No `file:` either. A manifest that could name a local path would turn the
   *  update path into an arbitrary-file read on whatever host decoded it. */
  it.effect('refuses an entry whose url is a file path', () =>
    Effect.gen(function* () {
      const result = yield* Effect.result(
        decode(
          manifestBody(
            `"revision":"content-v4","url":"file:///etc/passwd","sha256":"sha256:${'b'.repeat(64)}","size":8192,"schema_major":1,"generation":4`,
          ),
        ),
      );
      expect(result._tag).toBe('Failure');
    }),
  );

  /** The generation is not optional. An entry without one has no place on the
   *  order the decision compares by, and admitting it would put the downgrade
   *  back — a client could not tell whether such an entry was above or below
   *  what it holds. */
  it.effect('refuses an entry with no generation', () =>
    Effect.gen(function* () {
      const result = yield* Effect.result(
        decode(
          manifestBody(
            `"revision":"content-v4","url":"https://example.test/topics.db","sha256":"sha256:${'b'.repeat(64)}","size":8192,"schema_major":1`,
          ),
        ),
      );
      expect(result._tag).toBe('Failure');
    }),
  );

  /** The design clause the prompt asks for: "design so vectors can ride it
   *  later without a format break".
   *
   *  Asserted over **JSON text**, not a pre-built `ContentManifest` (round-3
   *  F7): what a publisher adds is a key in a body, and a test that constructed
   *  the value in TypeScript would have proved the *type* admits two corpora
   *  while saying nothing about whether the decoder does. It also proves the
   *  second half of the F8 split — the manifest is keyed by `CorpusFileName`
   *  even though the update surface is `'topics'` alone, so the day vectors has
   *  a floor and an installer the literal widens and no published manifest
   *  breaks. */
  it.effect('decodes a second corpus from the same manifest text, with no format change', () =>
    Effect.gen(function* () {
      const manifest = yield* decode(
        `{"revision":"manifest-2026-09","artifacts":{"topics":{${VALID_TOPICS_ENTRY}},"vectors":{"revision":"vectors-v2","url":"https://example.test/vectors.bvi","sha256":"sha256:${'c'.repeat(64)}","size":4096,"schema_major":1,"generation":2}}}`,
      );
      const vectors = Option.fromUndefinedOr(manifest.artifacts.vectors);
      expect(Option.isSome(vectors)).toBe(true);
      if (Option.isNone(vectors)) return;
      expect(String(vectors.value.revision)).toBe('vectors-v2');
      expect(Number(vectors.value.generation)).toBe(2);
      // And the topics entry beside it is untouched, so adding a key is
      // additive rather than a re-shape.
      expect(Option.isSome(Option.fromUndefinedOr(manifest.artifacts.topics))).toBe(true);
    }),
  );
});
