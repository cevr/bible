/** §3.6's runtime manifest and the decision one client makes about it.
 *
 *  The whole of the hybrid release cadence is two numbers and one gate: the
 *  compiled pin is the **offline floor** an app can always install with no
 *  network, and a JSON manifest on a stable GitHub-releases URL offers
 *  content-only versions newer than it, refused when the artifact's
 *  `schema_major` exceeds what this build compiled against.
 *
 *  Everything here is portable and pure. What differs between the three hosts
 *  is only *how the manifest bytes arrive* — a same-origin proxy in the
 *  browser, `HttpClient` in Electron main, `HttpClient` under Bun — which is
 *  why the fetch is a separate service and this file has no transport in it at
 *  all.
 */

import { Option, Predicate, Schema } from 'effect';

import { CorpusFileName, CorpusGeneration, CorpusRevision } from '../corpus-supply/model.js';

/** The corpora §3.6's runtime path can actually update, as a closed literal.
 *
 *  **`topics` alone in v1**, deliberately narrower than `CorpusFileName`. The
 *  earlier surface accepted every file corpus and then applied the *topics*
 *  schema floor to all of them, so a caller could ask this build to update
 *  `bible` or `vectors` and be told a decision computed against the wrong gate
 *  — for corpora with no runtime installer behind them at all (round-3 F8). A
 *  closed literal makes that request unrepresentable at every seam: the RPC
 *  payload, the CLI, the service.
 *
 *  The **manifest** stays keyed by `CorpusFileName`, which is the point of the
 *  split: a publisher can name `vectors` in the manifest the day it has a floor
 *  and an installer, and no wire model, decoder, or installed client changes —
 *  only this literal widens. */
export const UpdatableCorpus = Schema.Literals(['topics']);
export type UpdatableCorpus = typeof UpdatableCorpus.Type;

/** An artifact or manifest address this build will fetch.
 *
 *  §3.6 fixes the trust surface at "HTTPS plus digest — no signing". A digest
 *  only proves the bytes are the bytes the *manifest* named, so if the manifest
 *  or the artifact can arrive over a channel an attacker controls, the digest
 *  proves nothing about the release. Requiring `https:` in the schema is what
 *  makes that structural: a plaintext URL never decodes into a value any client
 *  could act on (round-3 F4).
 *
 *  **The platform's own parser decides, not a pattern.** A `^https://\S+$`
 *  regex accepts strings no URL parser will ever resolve — `https://%` is the
 *  short one (round-4 B4) — so an entry could decode into a value every client
 *  would then fail to fetch, one host at a time, with the refusal arriving as a
 *  transport error rather than as the decode failure it is. `URL.parse` is the
 *  same parser `isAllowedManifestOrigin` and every host's client run, and it
 *  answers `null` rather than throwing, which is what lets it be a filter.
 *
 *  The Type stays a `string`: what an installer is handed is an address to
 *  fetch, and a decoded `URL` object would be re-serialized at every seam that
 *  passes it on. The parse is the *check*, not the representation. */
export const ContentUrl = Schema.NonEmptyString.check(
  Schema.makeFilter<string>((url) => {
    const parsed = URL.parse(url);
    if (Predicate.isNull(parsed)) return 'Content URL must be a URL this build can parse';
    if (parsed.protocol !== 'https:') return 'Content URL must be https';
    return true;
  }),
);
export type ContentUrl = typeof ContentUrl.Type;

/** One artifact's entry in the runtime manifest: the exact bytes one content
 *  version consists of, in the shape `FileArtifactRelease` already pins.
 *
 *  `schema_major` is the field the compiled pin has no room for and the runtime
 *  path cannot do without. A pinned release is compiled against this build, so
 *  its schema is known by construction; a manifest entry was published *after*
 *  this build shipped, so it has to say which schema its bytes are, and this
 *  build has to be able to refuse it. Snake-cased on the wire because it is the
 *  same key the artifact's own `meta` table carries (§2.2) — one name for one
 *  fact, whether it is read from a JSON manifest or from an installed file. */
export class ContentManifestEntry extends Schema.Class<ContentManifestEntry>(
  'ContentUpdate/ManifestEntry',
)({
  revision: CorpusRevision,
  /** **HTTPS only.** §3.6's whole trust surface is "HTTPS plus digest — no
   *  signing", and a digest over bytes fetched in the clear is a digest an
   *  on-path attacker chose. A `http://` or `file://` entry is refused at the
   *  decoder rather than at the fetch, so no client is ever handed a release it
   *  would then have to remember not to install (round-3 F4). */
  url: ContentUrl,
  sha256: Schema.String.check(Schema.isPattern(/^sha256:[a-f0-9]{64}$/)),
  size: Schema.Int.check(Schema.isGreaterThan(0)),
  schema_major: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  /** The monotonic release ordinal — §3.6's "one release per content version",
   *  as a number a client can order by.
   *
   *  The field the first cut of this model did without, and the one that made a
   *  downgrade possible: revisions are tags, "different from installed" is not
   *  "newer than installed", and a manifest that named an older tag read as an
   *  offer (round-3 F2). The publisher increments this once per release; a
   *  client offers only above what it holds *and* above its compiled floor. */
  generation: CorpusGeneration,
}) {}

/** The published manifest, whole.
 *
 *  `artifacts` is keyed by `CorpusFileName` with every entry optional, rather
 *  than a `topics` field. v1 publishes topics alone (§3.6), and the vectors
 *  index is already a File Corpus with its own pin — so the day it starts
 *  riding the runtime path, the publisher adds a key and no client, wire model
 *  or decoder changes. A `topics`-shaped manifest would have made that a format
 *  break for every installed app.
 *
 *  `revision` is the manifest's own identity, not an artifact's: it is what an
 *  operator names when asking which manifest a client read, and it changes
 *  whenever any entry does. */
export class ContentManifest extends Schema.Class<ContentManifest>('ContentUpdate/Manifest')({
  revision: CorpusRevision,
  artifacts: Schema.Record(CorpusFileName, Schema.optional(ContentManifestEntry)),
}) {}

/** How a client reads the manifest. One method, because the manifest is the
 *  only thing the runtime path fetches — the artifact bytes themselves are
 *  already the File Corpus lifecycle's job, through the release source the
 *  decision hands back.
 *
 *  It **cannot fail**. §3.6's offline rule is that a client with no network
 *  keeps the pinned floor with no error, so "the manifest did not arrive" is a
 *  value the decision reads rather than a failure a caller has to catch. Making
 *  it an error channel put every host in the position of catching an expected
 *  state, which is exactly where a blanket catch grows. */
export const ManifestFetchOutcome = Schema.Union([
  Schema.TaggedStruct('fetched', { manifest: ContentManifest }),
  /** No manifest reached this client: the host is offline, the route answered
   *  a non-2xx, or the bytes were not a manifest this build can read. All three
   *  are one outcome because all three have one consequence — the pinned floor
   *  stands — and telling them apart would invite a caller to act differently
   *  on a distinction with no action behind it. `detail` is operator-facing
   *  text, never branched on. */
  Schema.TaggedStruct('unavailable', { detail: Schema.String }),
]);
export type ManifestFetchOutcome = typeof ManifestFetchOutcome.Type;

/** The two outcome constructors, beside the union they build.
 *
 *  Named functions rather than object literals at each call site: a literal has
 *  to be asserted into the union to typecheck, and an assertion is exactly the
 *  step that would let a misspelled tag through. These are also the only place
 *  either shape is written down, so the adapter, the service and the fixtures
 *  cannot drift into three spellings of one outcome. */
export const manifestFetched = (manifest: ContentManifest): ManifestFetchOutcome => ({
  _tag: 'fetched',
  manifest,
});

export const manifestUnavailable = (detail: string): ManifestFetchOutcome => ({
  _tag: 'unavailable',
  detail,
});

/** What the compiled build knows before any network call: the pin it ships and
 *  the schema major it can read. */
export class ContentFloor extends Schema.Class<ContentFloor>('ContentUpdate/Floor')({
  /** The compiled-in pin's revision, or `None` while no release is published —
   *  which is `TOPICS_ARTIFACT_RELEASE`'s current state (§3.5). A build with no
   *  pin still has a floor; it is just an empty one, and a runtime manifest can
   *  still offer above it. */
  pinned: Schema.Option(CorpusRevision),
  /** The generation the compiled pin was published under, when there is a pin.
   *
   *  The floor's *number*, and the second half of what stops a downgrade: a
   *  manifest entry at or below it names content the local recipe already
   *  supplies with no network, so it is never an offer however its tag sorts.
   *  `None` alongside `pinned` being `None` — a build with no pin has no floor
   *  ordinal either, and every published generation is above nothing. */
  pinnedGeneration: Schema.Option(CorpusGeneration),
  /** The artifact schema major this build compiled against. A manifest entry
   *  above it is refused — §3.6's cadence rule, and the only gate standing
   *  between this build and a file it cannot interpret. */
  schemaMajor: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
}) {}

/** Why a runtime version was refused. Closed, because a client renders it. */
export const ContentRefusalReason = Schema.Literals(['schema-major']);
export type ContentRefusalReason = typeof ContentRefusalReason.Type;

/** The decision, as the three hosts render it.
 *
 *  Four cases and no more. `UpToDate` and `Offline` are separate because they
 *  are different sentences to a reader — "you have the newest content" is not
 *  "we could not check" — and identical to the installer, which does nothing in
 *  either. Collapsing them would have made a client that could not reach the
 *  network claim it was current. */
export const ContentDecision = Schema.Union([
  /** A newer content version exists and this build may install it. */
  Schema.TaggedStruct('offer', { entry: ContentManifestEntry }),
  /** The manifest names nothing newer than what is installed. */
  Schema.TaggedStruct('up-to-date', {}),
  /** A newer version exists and this build must not install it (§3.6's
   *  schema-major gate). `available` is carried so the settings entry can say
   *  *which* version is being refused — "update the app to get v4" is a
   *  different instruction from "you are current". */
  Schema.TaggedStruct('refused', {
    reason: ContentRefusalReason,
    available: ContentManifestEntry,
  }),
  /** No manifest reached this client. The pinned floor stands, and this is not
   *  an error (§10 M9: "offline yields the pinned floor with no error"). */
  Schema.TaggedStruct('offline', { detail: Schema.String }),
]);
export type ContentDecision = typeof ContentDecision.Type;

/** What one host reports about topic content: what is installed, what the
 *  manifest offers, and what this build decided about the pair.
 *
 *  One value for the toast, the settings entry, `bible topics status` and
 *  `v1.content.status` — so the four surfaces cannot disagree about a version
 *  number, and adding a field reaches all four at once. */
export class ContentStatus extends Schema.Class<ContentStatus>('ContentUpdate/Status')({
  corpus: UpdatableCorpus,
  /** The revision the host has verified and activated, or `None` when nothing
   *  is installed — the ordinary state until the first content release. */
  installed: Schema.Option(CorpusRevision),
  /** The generation that revision was published under, when this host installed
   *  it from a source that stated one.
   *
   *  `None` for an artifact that came from a local source — a packaged copy, a
   *  workspace build — because none of those is a published content version.
   *  Carried on the wire rather than kept private to the decision because it is
   *  what makes the decision *checkable*: an operator reading `bible topics
   *  status --json` can see the number the offer was compared against. */
  installedGeneration: Schema.Option(CorpusGeneration),
  floor: ContentFloor,
  decision: ContentDecision,
}) {}

/** What one `update` run did. `installed` is `None` when the decision was not
 *  an offer, which is the no-mutation path `bible topics status` guarantees and
 *  `bible topics update` reports honestly rather than pretending to install. */
export class ContentUpdateOutcome extends Schema.Class<ContentUpdateOutcome>(
  'ContentUpdate/Outcome',
)({
  /** The status *after* the run — so a caller reads one value rather than
   *  re-asking, and the reported decision is the post-install one. */
  status: ContentStatus,
  /** The revision now active, when this run activated one. */
  activated: Schema.Option(CorpusRevision),
}) {}

/** The one wire codec for status. Named and exported so the RPC success schema
 *  and the CLI's `--json` are the same encoder rather than two that agree —
 *  the `…Json` discipline `WikiPageJson` and `SearchResultJson` established. */
export const ContentStatusJson = ContentStatus;
export type ContentStatusJson = typeof ContentStatusJson.Encoded;

export const ContentUpdateJson = ContentUpdateOutcome;
export type ContentUpdateJson = typeof ContentUpdateJson.Encoded;

/** The manifest URL, as one pinned constant (§3.6: "a stable GitHub-releases
 *  URL"). One release per content version publishes its artifact; this file is
 *  the index over them, and it is the same URL on all three hosts — the browser
 *  reaches it through a same-origin proxy because it cannot reach the release
 *  host directly, not because it reads a different manifest. */
export const CONTENT_MANIFEST_URL =
  'https://github.com/cevr/bible/releases/download/content-manifest/manifest.json';

/** Where the browser reads it: the same-origin route `apps/web/server/main.ts`
 *  proxies, mirroring `/api/assets/topics`. */
export const CONTENT_MANIFEST_PROXY_PATH = '/api/content/manifest';

/** Where the browser reads the *bytes* a manifest entry names.
 *
 *  `/api/assets/topics` proxies the **pinned** release — one compiled-in
 *  address, no query. §3.6's runtime leg names a different artifact per
 *  release, so the address is a parameter, and the worker asks for it as
 *  `?url=`. That is the whole difference; the trust rules are the manifest
 *  route's, because a route that fetches an address a client supplied is a
 *  request-forgery gadget unless the same origin allowlist, the same bounded
 *  redirect follow and the same counted size cap apply (round-4 F1, F4).
 *
 *  The cap is the *declared* size rather than a constant: the offer states how
 *  many bytes it is, the digest states which bytes, and both were checked
 *  against a manifest served from the allowlisted host. An artifact is
 *  megabytes where a manifest is kilobytes, so one shared constant could not
 *  bound both. */
export const CONTENT_ARTIFACT_PROXY_PATH = '/api/content/artifact';

/** The origins a manifest may be fetched from, in production.
 *
 *  Derived from the pinned constant rather than written twice, so moving the
 *  release host moves the trust boundary with it.
 *
 *  **Loopback is not on it.** It used to be, so that the fixture servers the
 *  suites and the desktop e2e bind would pass the gate — which meant the
 *  shipped list admitted `http://localhost` on every install, over plaintext,
 *  for a trust surface whose whole basis is "HTTPS plus digest" (round-4 F4).
 *  A test does not need the production list to admit it: the list is a
 *  parameter of {@link isAllowedOrigin}, and every reader takes the origins it
 *  trusts the same way it takes the URL it reads. */
export const CONTENT_MANIFEST_ORIGINS: readonly string[] = [new URL(CONTENT_MANIFEST_URL).origin];

/** Whether one address may be fetched, against one explicit allowlist.
 *
 *  Origin-exact: a prefix comparison would have admitted
 *  `https://github.com.attacker.test`, which is the classic form of this
 *  mistake, so the comparison is on the parsed origin.
 *
 *  A malformed address is not allowed. `URL.parse` answers `null` rather than
 *  throwing, and a decision this small must not be able to fail into a permit. */
export const isAllowedOrigin = (url: string, origins: readonly string[]): boolean =>
  Option.exists(parseOrigin(url), (origin) => origins.includes(origin));

/** The production gate: {@link isAllowedOrigin} against
 *  {@link CONTENT_MANIFEST_ORIGINS}. What every host wires when nothing
 *  overrides it. */
export const isAllowedManifestOrigin = (url: string): boolean =>
  isAllowedOrigin(url, CONTENT_MANIFEST_ORIGINS);

/** The origin of one address, or `None` when it is not an address at all. */
const parseOrigin = (url: string): Option.Option<string> =>
  Option.map(Option.fromNullOr(URL.parse(url)), (parsed) => parsed.origin);

/** How many bytes of manifest this build will read before giving up.
 *
 *  §3.6's manifest is one small JSON index over published releases — a few
 *  hundred bytes per artifact. A cap is what stops a compromised or confused
 *  upstream from streaming an unbounded body into a browser through the proxy,
 *  or into a host's decoder. 256 KiB is three orders of magnitude above any
 *  manifest this format can produce and still a bound. */
export const CONTENT_MANIFEST_MAX_BYTES = 262_144;

/** How long a manifest read may take before it counts as unreachable.
 *
 *  §3.6's offline rule makes a slow upstream and an absent one the same
 *  outcome, so a timeout is not an error path — it is how "we could not check"
 *  gets decided in bounded time rather than leaving a settings panel suspended
 *  on a hung socket. */
export const CONTENT_MANIFEST_TIMEOUT_MILLIS = 10_000;

/** How many redirects a manifest fetch may follow.
 *
 *  GitHub releases answer with one redirect to the asset host, so zero would
 *  break the production path. A bound above that is what stops a redirect chain
 *  from walking the proxy off the allowlisted origin, or from looping. */
export const CONTENT_MANIFEST_MAX_REDIRECTS = 3;

/** The address one redirect response points at, resolved against the address it
 *  answered — or `None` when the response is not a redirect this build follows.
 *
 *  Shared by the client reader and the web proxy so "what counts as a redirect"
 *  is one rule rather than two. The `Location` header is relative in the general
 *  case, so it is resolved against the request URL before anything is decided
 *  about its origin; an unresolvable one is `None` rather than a hop, which
 *  makes the response an ordinary non-2xx and lands on `offline`. */
export const redirectTarget = (
  status: number,
  location: Option.Option<string>,
  from: string,
): Option.Option<string> => {
  if (status < 300 || status >= 400) return Option.none();
  return Option.flatMap(location, (target) =>
    Option.map(Option.fromNullOr(URL.parse(target, from)), (resolved) => resolved.href),
  );
};

/** The decision, as a pure function of the facts a host has.
 *
 *  **Three gates, in order, and every one of them a refusal to install rather
 *  than a permission to.**
 *
 *  1. *Schema major.* An artifact this build cannot interpret is refused first,
 *     before any comparison — so a client that somehow holds a too-new
 *     generation is told to update the app rather than told it is current.
 *  2. *The compiled floor.* The pin is what an offline app installs from its own
 *     local sources, so an entry at or below the pin's generation is content the
 *     host already has with no network. Never an offer.
 *  3. *What is installed.* An entry at or below the installed generation is not
 *     newer, whatever its tag says.
 *
 *  **Generations, not revisions.** A revision is a tag — `db-v2`,
 *  `content-2026-08` — and there is no order over tags a publisher and a client
 *  could both compute. The first cut of this function compared by *equality*
 *  and treated every different tag as newer, which meant a manifest naming an
 *  older release read as an offer and talked a client into downgrading verified
 *  content it already had (round-3 F2). §3.6's "one release per content version"
 *  is what the generation numbers, and the comparison is on that number alone.
 *
 *  An installed generation *above* the manifest's is `up-to-date`, not an offer
 *  and not an error: the client is ahead of what the publisher currently names,
 *  which is the ordinary state during a rollback, and the correct action in
 *  both cases is to install nothing.
 *
 *  A host with **no** installed generation — nothing installed, or an artifact
 *  from a local source that states no ordinal — is compared against the floor
 *  alone. That is the fresh-machine case, and it is right: the local bytes are
 *  the pin's bytes, so the pin's generation is the floor they sit at. */
export const decideUpdate = (input: {
  readonly floor: ContentFloor;
  readonly installed: Option.Option<CorpusGeneration>;
  readonly manifest: ManifestFetchOutcome;
  readonly corpus: UpdatableCorpus;
}): ContentDecision => {
  if (input.manifest._tag === 'unavailable') {
    return { _tag: 'offline', detail: input.manifest.detail };
  }
  const entry = Option.fromUndefinedOr(input.manifest.manifest.artifacts[input.corpus]);
  // A manifest that names no entry for this corpus offers nothing about it.
  // That is `up-to-date` rather than `offline`: the manifest *did* arrive and
  // said this corpus has no runtime release, which is the pinned floor holding
  // as the current answer rather than a check that failed.
  if (Option.isNone(entry)) return { _tag: 'up-to-date' };
  const available = entry.value;
  if (available.schema_major > input.floor.schemaMajor) {
    return { _tag: 'refused', reason: 'schema-major', available };
  }
  if (Option.exists(input.floor.pinnedGeneration, (pinned) => available.generation <= pinned)) {
    return { _tag: 'up-to-date' };
  }
  if (Option.exists(input.installed, (current) => available.generation <= current)) {
    return { _tag: 'up-to-date' };
  }
  return { _tag: 'offer', entry: available };
};
