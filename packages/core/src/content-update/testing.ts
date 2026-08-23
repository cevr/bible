/** The one manifest-adapter fixture all three hosts run.
 *
 *  §10 Milestone 9's adapter check is a *cross-host* claim: "web fetches the
 *  manifest through the same-origin proxy; Electron main fetches directly; CLI
 *  fetches under Bun. **All three refuse the same schema-major overrun.**" Three
 *  suites asserting three plausible refusals is not that claim — it is three
 *  claims that happen to agree today.
 *
 *  So the fixture is here, in portable core, and each host runs it against its
 *  own `HttpClient` layer. What a host supplies is the transport; what it is
 *  compared against is these bytes and these expectations.
 *
 *  Exported from `@bible/core/content-update/testing` rather than from the
 *  feature barrel, for the reason `wiki/index.ts` and `search/index.ts` draw the
 *  same seam: a shipped import must not be able to reach a fixture manifest
 *  through the barrel it reaches `ContentUpdate` through.
 */

import { Effect, Layer, Option, Schema } from 'effect';
import { HttpClient, HttpClientError, HttpClientResponse } from 'effect/unstable/http';

import { corpusGeneration, corpusRevision } from '../corpus-supply/model.js';
import { CorpusSupply } from '../corpus-supply/service.js';
import { TOPICS_SCHEMA_MAJOR } from '../corpus-supply/file-artifact.js';
import {
  ContentFloor,
  ContentManifest,
  ContentManifestEntry,
  decideUpdate,
  type ContentDecision,
} from './model.js';

import { layerHttpContentManifestAt, readManifestOver } from './manifest-http.js';
import { ContentActivation, ContentUpdate } from './service.js';

/** The manifest bodies are produced by the **published schema's own encoder**,
 *  not by hand.
 *
 *  A hand-written JSON literal is a second wire model: it can drift from
 *  `ContentManifest` without anything failing, and a fixture that drifted would
 *  quietly start exercising the malformed path while still claiming to test the
 *  overrun. Encoding through the schema means these bytes are, by construction,
 *  bytes a publisher could actually publish. */
const encodeManifest = Schema.encodeSync(Schema.fromJsonString(ContentManifest));

/** The URL every host in the fixture reads. Not the production pin: what is
 *  under test is the adapter, and a suite that reached the real release host
 *  would be testing GitHub.
 *
 *  **Loopback**, because the adapter now refuses an address outside
 *  `CONTENT_MANIFEST_ORIGINS` before it makes the request (round-3 F4). A
 *  fixture on an arbitrary hostname would be refused by the origin gate and
 *  every case would pass as `offline` for the wrong reason — which is exactly
 *  the failure the gate exists to cause, so the fixture sits on the address a
 *  real local manifest server binds. */
export const FIXTURE_MANIFEST_URL = 'http://127.0.0.1:64999/manifest.json';

/** The origins the fixture reads under.
 *
 *  Production's allowlist is the release host alone (round-4 F4): loopback used
 *  to sit on it so these fixtures would pass the gate, which meant every
 *  shipped install trusted `http://localhost` for a manifest whose whole trust
 *  basis is HTTPS. The seam is a *parameter*, so a suite states the origin it
 *  binds and the shipped list stays what §3.6 describes.
 *
 *  Two spellings of the same loopback host and one origin for a live fixture on
 *  an ephemeral port — `liveAdapterOrigins` derives that one from the base URL,
 *  because a test server's port is not known until it binds. */
export const FIXTURE_MANIFEST_ORIGINS: readonly string[] = [new URL(FIXTURE_MANIFEST_URL).origin];

/** The allowlist for a live fixture server: the origin it actually bound, plus
 *  whatever else the suite serves from. Derived rather than written, so a suite
 *  cannot allow one port and serve from another. */
export const liveAdapterOrigins = (...urls: readonly string[]): readonly string[] =>
  urls.map((url) => new URL(url).origin);

/** An address the origin gate must refuse. Named here so the host suites and
 *  the core suite are refusing the *same* address rather than three plausible
 *  ones. */
export const FORBIDDEN_MANIFEST_URL = 'https://manifest.attacker.test/manifest.json';

/** A manifest body naming a schema major **one above** what this build reads.
 *
 *  The refusal is the whole point of the fixture, so the overrun is derived
 *  from `TOPICS_SCHEMA_MAJOR` rather than hard-coded: raising the build's schema
 *  major must keep this an overrun rather than quietly turning it into an
 *  installable version. */
export const OVERRUN_MANIFEST_BODY = encodeManifest(
  ContentManifest.make({
    revision: corpusRevision('manifest-overrun'),
    artifacts: {
      topics: ContentManifestEntry.make({
        revision: corpusRevision('content-v9'),
        url: 'https://manifest.test/topics.db',
        sha256: `sha256:${'c'.repeat(64)}`,
        size: 16_384,
        schema_major: TOPICS_SCHEMA_MAJOR + 1,
        generation: corpusGeneration(9),
      }),
    },
  }),
);

/** A manifest body this build may install, so a host proving it refuses the
 *  overrun also proves the refusal is about the schema and not about the
 *  adapter failing to read anything at all. */
export const OFFERED_MANIFEST_BODY = encodeManifest(
  ContentManifest.make({
    revision: corpusRevision('manifest-offered'),
    artifacts: {
      topics: ContentManifestEntry.make({
        revision: corpusRevision('content-v4'),
        url: 'https://manifest.test/topics.db',
        sha256: `sha256:${'d'.repeat(64)}`,
        size: 16_384,
        schema_major: TOPICS_SCHEMA_MAJOR,
        generation: corpusGeneration(4),
      }),
    },
  }),
);

/** A build with no pin, so the fixture's decisions turn only on the manifest.
 *  `TOPICS_ARTIFACT_RELEASE` is `None` today, so this is also what ships. */
export const FIXTURE_FLOOR: ContentFloor = ContentFloor.make({
  pinned: Option.none(),
  pinnedGeneration: Option.none(),
  schemaMajor: TOPICS_SCHEMA_MAJOR,
});

/** An `HttpClient` that answers the fixture URL with one body and one status,
 *  and nothing else with a 404.
 *
 *  A client rather than a stubbed `ContentManifestSource`: the adapter under
 *  test *is* the step from an HTTP response to a `ManifestFetchOutcome`, so a
 *  fixture that skipped the response would skip the thing being checked. Each
 *  host wires this behind its own real client in production and behind this one
 *  here, which is what makes the three comparable. */
export const fixtureManifestClient = (input: {
  readonly body: string;
  readonly status?: number;
}): Layer.Layer<HttpClient.HttpClient> =>
  Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make((request) =>
      Effect.succeed(
        HttpClientResponse.fromWeb(
          request,
          new Response(input.body, { status: input.status ?? 200 }),
        ),
      ),
    ),
  );

/** A client that cannot reach anything — §3.6's offline host.
 *
 *  It **fails** with a real `HttpClientError` rather than dying. That is the
 *  distinction the adapter is built on: a request that did not complete is a
 *  declared failure the adapter maps onto `offline`, while a defect is a fault
 *  that must still reach the operator. A fixture that died here would have
 *  passed only against an adapter with a blanket cause catch — the exact shape
 *  the lint rules forbid. */
export const unreachableManifestClient: Layer.Layer<HttpClient.HttpClient> = Layer.succeed(
  HttpClient.HttpClient,
  HttpClient.make((request) =>
    Effect.fail(
      new HttpClientError.HttpClientError({
        reason: new HttpClientError.TransportError({
          request,
          description: 'the fixture client is offline',
        }),
      }),
    ),
  ),
);

/** The decision one host reaches for a manifest body, over its own client.
 *
 *  This is the whole fixture: read the manifest through `readManifestOver` —
 *  the same function every host's adapter runs — and decide with `decideUpdate`
 *  against a build that has nothing installed. A host's suite calls it with its
 *  client and asserts the tag. */
export const decisionOverClient = (input: {
  readonly client: Layer.Layer<HttpClient.HttpClient>;
  readonly url?: string;
  /** The origins this case reads under. Defaults to the fixture's own, so a
   *  case that is not about the gate does not have to state one — and a case
   *  that *is* about the gate (a forbidden address) states nothing either,
   *  because the fixture list is exactly as narrow as production's. */
  readonly origins?: readonly string[];
}): Effect.Effect<ContentDecision> =>
  readManifestOver(
    input.url ?? FIXTURE_MANIFEST_URL,
    input.origins ?? FIXTURE_MANIFEST_ORIGINS,
  ).pipe(
    Effect.provide(input.client),
    Effect.map((manifest) =>
      decideUpdate({
        corpus: 'topics',
        floor: FIXTURE_FLOOR,
        installed: Option.none(),
        manifest,
      }),
    ),
  );

/** What every host must report, keyed by the fixture case it is given.
 *
 *  A record over the cases rather than three assertions repeated per host: a
 *  case added here is a case every host suite must then answer, and a host that
 *  drifts fails against the same table the other two pass.
 *
 *  `offered` is not `up-to-date`: `FIXTURE_FLOOR` pins nothing, so the manifest
 *  entry is genuinely above this build's floor. */
export const ADAPTER_EXPECTATIONS = {
  overrun: 'refused',
  offered: 'offer',
  unreachable: 'offline',
  notFound: 'offline',
  malformed: 'offline',
} satisfies Record<string, ContentDecision['_tag']>;

/** The revision a host must name when it refuses. Carried so a settings entry
 *  can say which version needs a newer app; asserted so a host that dropped it
 *  fails rather than rendering a refusal with nothing in it. */
export const OVERRUN_REVISION = corpusRevision('content-v9');

/** A `ContentUpdate` that reads the overrun manifest over the fixture client
 *  and installs through no wired corpus — the layer both host round-trip suites
 *  put behind their real transport.
 *
 *  Whole-service rather than a stubbed status: what a round trip checks is that
 *  §3.6's value survives *this host's* encoder, and a hand-built `ContentStatus`
 *  would be a value no policy ever produced. The refusal is the case chosen
 *  because it carries the most structure across the wire — a nested manifest
 *  entry, an `Option` for `installed`, and an `Option` inside `floor.pinned` —
 *  so an encoding that drops any of them fails here rather than in production. */
export const refusingContentUpdate: Layer.Layer<ContentUpdate> = ContentUpdate.Live.pipe(
  Layer.provide(
    layerHttpContentManifestAt(FIXTURE_MANIFEST_URL, FIXTURE_MANIFEST_ORIGINS).pipe(
      Layer.provide(fixtureManifestClient({ body: OVERRUN_MANIFEST_BODY })),
    ),
  ),
  Layer.provide(CorpusSupply.layer),
  // A round trip is about the encoder, and this fixture refuses rather than
  // activating — so there is nothing to reopen and nothing to stub.
  Layer.provide(ContentActivation.Inert),
);

/** The five fixture cases, as the clients that produce them.
 *
 *  Keyed by exactly the keys of {@link ADAPTER_EXPECTATIONS}, so a case added to
 *  one is a compile error until it is added to the other. A host suite iterates
 *  this rather than listing cases itself — which is what stops a host from
 *  quietly running four of the five and still reporting green. */
export const ADAPTER_CASES = {
  overrun: fixtureManifestClient({ body: OVERRUN_MANIFEST_BODY }),
  offered: fixtureManifestClient({ body: OFFERED_MANIFEST_BODY }),
  unreachable: unreachableManifestClient,
  notFound: fixtureManifestClient({ body: 'not found', status: 404 }),
  malformed: fixtureManifestClient({ body: '{"revision":"m","artifacts":{"topics":{}}}' }),
} satisfies Record<keyof typeof ADAPTER_EXPECTATIONS, Layer.Layer<HttpClient.HttpClient>>;

/** Every fixture case decided over one host's transport, as a plain record the
 *  suite compares against {@link ADAPTER_EXPECTATIONS} in a single assertion.
 *
 *  One `toEqual` rather than five: a host that answers four cases and throws on
 *  the fifth then fails on the missing key instead of never reaching it. */
export const adapterConformance: Effect.Effect<Record<string, ContentDecision['_tag']>> =
  Effect.forEach(Object.entries(ADAPTER_CASES), ([name, client]) =>
    decisionOverClient({ client }).pipe(
      Effect.map((decision): readonly [string, ContentDecision['_tag']] => [name, decision._tag]),
    ),
  ).pipe(Effect.map((entries) => Object.fromEntries(entries)));

/** The bytes a live fixture server must answer, per case.
 *
 *  {@link ADAPTER_CASES} pairs each case with a *stub client*, which proves the
 *  mapping but not the transport: a stub has no socket, no status line and no
 *  headers, so a host whose real client mishandled any of them still passed
 *  (round-3 F5). This table is the same five cases as **responses**, so a host
 *  can serve them over loopback and run its production `HttpClient` at them.
 *
 *  `unreachable` has no entry: it is the case where nothing answers, and a
 *  server that served it would not be serving that case. */
export const ADAPTER_RESPONSES = {
  overrun: { body: OVERRUN_MANIFEST_BODY, status: 200 },
  offered: { body: OFFERED_MANIFEST_BODY, status: 200 },
  // A **readable manifest body** under a 404, deliberately: a fixture whose
  //  404 body was also unparseable would read `offline` whether the host
  //  honoured the status or not, so it could not tell a host that checks the
  //  status from one that ignores it. This one can — ignoring the status turns
  //  it into `offer`.
  notFound: { body: OFFERED_MANIFEST_BODY, status: 404 },
  malformed: { body: '{"revision":"m","artifacts":{"topics":{}}}', status: 200 },
} satisfies Record<
  Exclude<keyof typeof ADAPTER_EXPECTATIONS, 'unreachable'>,
  { readonly body: string; readonly status: number }
>;

/** The served cases as `[path, response]` pairs, so a host's fixture server
 *  builds its routing table straight from this and cannot serve a case under a
 *  path the reader will not ask for. */
export const ADAPTER_ROUTES: readonly (readonly [
  string,
  { readonly body: string; readonly status: number },
])[] = Object.entries(ADAPTER_RESPONSES).map(([name, response]) => [`/${name}.json`, response]);

/** The whole cross-host table, decided over a host's **real** `HttpClient`
 *  against a **real** local server.
 *
 *  This is the claim §10 Milestone 9 actually makes — "all three refuse the
 *  same schema-major overrun" is about the three shipped transports, not about
 *  three stubs agreeing. Each host calls this with the client layer it composes
 *  in production and the base URL of a server serving {@link ADAPTER_RESPONSES},
 *  and compares against the one {@link ADAPTER_EXPECTATIONS}.
 *
 *  The base URL must be loopback: the origin gate (round-3 F4) refuses anything
 *  else before the request, which would turn every case into `offline` and make
 *  the suite pass for the wrong reason.
 *
 *  `unreachable` is produced by pointing at a port nothing is listening on —
 *  through the same real client, so what is being checked is that this host's
 *  transport turns a refused connection into `offline` rather than a defect. */
export const liveAdapterConformance = (input: {
  readonly client: Layer.Layer<HttpClient.HttpClient>;
  readonly baseUrl: string;
  /** Loopback with nothing bound. A separate parameter because a host that can
   *  serve can also choose a port it knows is closed. */
  readonly closedUrl: string;
}): Effect.Effect<Record<string, ContentDecision['_tag']>> =>
  Effect.forEach(
    [
      ...ADAPTER_ROUTES.map(([path]) => ({
        name: path.replace('/', '').replace('.json', ''),
        url: `${input.baseUrl}${path}`,
      })),
      { name: 'unreachable', url: input.closedUrl },
    ],
    (probe) =>
      decisionOverClient({
        client: input.client,
        url: probe.url,
        // The origins this suite actually bound. Derived from the two addresses
        // it was given rather than from a constant, so a live fixture on an
        // ephemeral port is admitted without production admitting loopback.
        origins: liveAdapterOrigins(input.baseUrl, input.closedUrl),
      }).pipe(
        Effect.map((decision): readonly [string, ContentDecision['_tag']] => [
          probe.name,
          decision._tag,
        ]),
      ),
  ).pipe(Effect.map((entries) => Object.fromEntries(entries)));
