/** §10's CLI leg of the host-parity rule: "golden query set runs in
 *  `packages/cli/test` via `run-cli.ts` with byte-identical JSON parity against
 *  the RPC handler output."
 *
 *  `packages/core/src/search/host-parity.test.ts` already proves the RPC handler
 *  and `SearchService` encode one value through one codec. What it cannot see is
 *  the last hop: whether the *command* still runs that codec on the way to
 *  stdout. A hand-written projection reappearing in the printer would leave core
 *  parity green and break every script that pipes `--json`.
 *
 *  So these tests run the real command — argument parsing, the layer seam, the
 *  encoder, `Console.log` — and compare its captured stdout to the bytes the RPC
 *  client returns for the same query, over the same fixture corpus.
 */

import { describe, expect, it } from 'effect-bun-test';
import { Effect, Layer, Option, Ref, Schema } from 'effect';
import { RpcTest } from 'effect/unstable/rpc';
import { BibleProcedureGroup, BibleProcedureHandlers } from '@bible/core/procedure';
import { procedureDependencies } from '@bible/core/procedure/testing';
import {
  MODEL_FINGERPRINT,
  QueryEmbedder,
  SearchQuery,
  SearchResultJson,
  SearchService,
  VectorIndexBytes,
} from '@bible/core/search';
import {
  GOLDEN_QUERIES,
  GOLDEN_TOPIC_QUERY,
  GOLDEN_TOPIC_SLUG,
  goldenSearchLayer,
  goldenSearchSources,
  goldenVector,
  goldenVectorIndexBytes,
} from '@bible/core/search/testing';

import { egwSearch } from '../../src/commands/egw/search.js';
import { SearchLayer, verifiedVectorIndex } from '../../src/commands/egw/search-layer.js';
import { runCli } from '../lib/run-cli.js';

/** The fixture embedder core's parity test uses, so both sides of the
 *  comparison are looking at the same vectors rather than at two plausible
 *  ones. */
const embedder = Layer.succeed(QueryEmbedder, {
  fingerprint: MODEL_FINGERPRINT,
  embedQuery: (query: string) => Effect.succeed(goldenVector(query)),
  embedDocument: (text: string) => Effect.succeed(goldenVector(text)),
});

/** One service instance for both seams: a difference in service construction
 *  must not be able to hide behind a difference the test was not looking for. */
const fixtureSearch = goldenSearchLayer({
  index: Option.some(goldenVectorIndexBytes()),
  embedder,
});

/** A query §9.3 considers wordy, so it routes to the hybrid path and the vector
 *  leg is actually attempted. */
const WORDY_QUERY = 'what happens at the close of probation';

/** A fixture host with no vector index and no embedder — the ordinary machine,
 *  and the one §9.6's typed absence exists for. */
const lexicalOnlySearch = goldenSearchLayer();

/** The command's own `--json`, captured from real stdout. */
const cliJson = (args: readonly string[], layer = fixtureSearch) =>
  runCli(egwSearch, [...args, '--json'], {}).pipe(Effect.provideService(SearchLayer, layer));

/** The same query over `v1.search.query`, encoded the way the CLI encodes it.
 *
 *  The codec is restated here rather than imported from the command, because
 *  what is under test is that the command produces *these* bytes. Importing the
 *  command's own helper would make the assertion true by construction. */
const rpcJson = (query: SearchQuery, layer = fixtureSearch) =>
  Effect.gen(function* () {
    const client = yield* RpcTest.makeClient(BibleProcedureGroup);
    const result = yield* client['v1.search.query']({
      text: query.text,
      scope: Option.getOrUndefined(query.scope),
      bookCode: Option.getOrUndefined(query.bookCode),
      limit: Option.getOrUndefined(query.limit),
    });
    return yield* Schema.encodeEffect(Schema.fromJsonString(SearchResultJson, { space: 2 }))(
      result,
    );
  }).pipe(
    Effect.provide(
      BibleProcedureHandlers.pipe(Layer.provide(procedureDependencies({ search: layer }))),
    ),
  );

/** The result the command produced, read as a value rather than as text.
 *
 *  The command's stdout is compared byte-for-byte in the parity tests above; the
 *  behavioral assertions below need the *value*, and `SearchResultJson` does not
 *  round-trip through its own encoder — `Schema.Option` encodes to Effect's
 *  tagged `{_id:"Option"}` form, which its decoder does not read back. Rather
 *  than assert on a hand-parsed shape, these run the same query through the
 *  service the command ran it through: byte parity already proves the command
 *  emitted exactly this value. */
const resultOf = (query: SearchQuery, layer = fixtureSearch) =>
  Effect.flatMap(SearchService, (service) => service.query(query)).pipe(Effect.provide(layer));

/** The command's argument list for a golden query. The CLI defaults `--limit`
 *  to 20, so a query that does not pin one is asked with 20 on both sides. */
const argsFor = (query: SearchQuery): readonly string[] => {
  const args: string[] = [query.text];
  if (Option.isSome(query.scope)) args.push('--scope', query.scope.value);
  if (Option.isSome(query.bookCode)) args.push('--book', query.bookCode.value);
  return args;
};

/** The same query, asked with the limit the CLI's flag default supplies.
 *
 *  Rebuilt through `SearchQuery.make` rather than spread-and-patched, so the
 *  RPC side is asked a value the schema has actually constructed. */
const withCliLimit = (query: SearchQuery): SearchQuery =>
  SearchQuery.make({
    text: query.text,
    scope: query.scope,
    bookCode: query.bookCode,
    limit: Option.some(20),
  });

describe('bible egw search — §9.7 golden query set', () => {
  for (const golden of GOLDEN_QUERIES) {
    it.scopedLive(`emits the RPC bytes for "${golden.query.text}"`, () =>
      Effect.gen(function* () {
        const cli = yield* cliJson(argsFor(golden.query));
        const wire = yield* rpcJson(withCliLimit(golden.query));
        expect(cli.success).toBe(true);
        // Byte-identical, not merely equivalent: `--json` is a contract with
        // the scripts that pipe it, and two encoders that agree on values but
        // differ in key order or spacing are two wire formats.
        expect(cli.stdout).toBe(wire);
      }),
    );
  }

  it.scopedLive('pins the matching topic at an exact position, above the paragraphs', () =>
    Effect.gen(function* () {
      // §9.4 at the CLI seam, and the third of the three clients §9.7 names.
      // The core and host round-trips assert the same thing against the same
      // fixture, so a topic that reached one surface and not another fails
      // somewhere rather than nowhere.
      const query = SearchQuery.make({
        text: GOLDEN_TOPIC_QUERY,
        scope: Option.none(),
        bookCode: Option.none(),
        limit: Option.some(20),
      });
      const parsed = yield* resultOf(query);

      expect(parsed.topics.map((topic) => String(topic.slug))).toEqual([GOLDEN_TOPIC_SLUG]);
      // Pinned above the ranking, never inside it: the slug must not also be a
      // paragraph identity.
      expect(parsed.paragraphs.some((hit) => String(hit.paragraphId) === GOLDEN_TOPIC_SLUG)).toBe(
        false,
      );
      expect(parsed.paragraphs.length).toBeGreaterThan(0);
    }),
  );

  /** Round-2 B5: the printed topic link is the route the app decodes.
   *
   *  The formatter printed `/<slug>`, and `route/codec.ts` has no such route —
   *  a topic page is `/wiki/<slug>`, so every link the CLI printed 404'd. The
   *  assertion is the exact line rather than a substring, because the whole
   *  defect was one missing path segment and a `toContain(slug)` passes on the
   *  broken output. */
  it.scopedLive('prints the pinned topic as the /wiki route the app decodes', () =>
    Effect.gen(function* () {
      const cli = yield* runCli(egwSearch, [GOLDEN_TOPIC_QUERY], {}).pipe(
        Effect.provideService(SearchLayer, fixtureSearch),
      );
      expect(cli.success).toBe(true);
      const result = yield* resultOf(
        SearchQuery.make({
          text: GOLDEN_TOPIC_QUERY,
          scope: Option.none(),
          bookCode: Option.none(),
          limit: Option.some(20),
        }),
      );
      // The fixture pins exactly one topic for this query. Asserting the count
      // first means a fixture drift fails as "no topic" rather than as a
      // confusing formatter mismatch below.
      expect(result.topics.length).toBe(1);
      const lines = cli.stdout.split('\n');
      expect(
        result.topics.map(
          (entry) => `  • ${entry.title} [${entry.status}] — /wiki/${GOLDEN_TOPIC_SLUG}`,
        ),
      ).toEqual(lines.filter((line) => line.startsWith('  • ')));
      // And the pre-fix spelling is gone, not merely joined by the right one:
      // `/<slug>` with no `/wiki` prefix is a path the app's router rejects.
      expect(
        lines.some((line) => line.includes(`— /${GOLDEN_TOPIC_SLUG}`) && !line.includes('/wiki/')),
      ).toBe(false);
    }),
  );

  it.scopedLive('routes each golden query the way §9.3 says it does', () =>
    Effect.gen(function* () {
      for (const golden of GOLDEN_QUERIES) {
        const parsed = yield* resultOf(withCliLimit(golden.query));
        expect({ query: golden.query.text, route: parsed.route }).toEqual({
          query: golden.query.text,
          route: golden.route,
        });
      }
    }),
  );
});

describe('bible egw search — §9.6 typed absence', () => {
  it.scopedLive('reports lexical-only rather than pretending the vector leg ran', () =>
    Effect.gen(function* () {
      // A *wordy* query, so §9.3 routes it to the vector leg and the absence
      // reported is the index's rather than the router's. A single word like
      // "sanctuary" never reaches the index at all — it reports `route`, which
      // would make this test pass without the index ever being consulted.
      const cli = yield* cliJson([WORDY_QUERY], lexicalOnlySearch);
      // The absence is on the wire the command actually wrote.
      expect(cli.stdout).toContain('"_tag": "unavailable"');

      const parsed = yield* resultOf(
        SearchQuery.make({
          text: WORDY_QUERY,
          scope: Option.none(),
          bookCode: Option.none(),
          limit: Option.some(20),
        }),
        lexicalOnlySearch,
      );
      // The value is on the result, not implied by its absence: a client can
      // tell "no index installed" from "the vector leg found nothing".
      expect(parsed.vector._tag).toBe('unavailable');
      if (parsed.vector._tag !== 'unavailable') return;
      expect(parsed.vector.reason).toBe('absent');
      // Not vacuous: the lexical leg still answered.
      expect(parsed.paragraphs.length).toBeGreaterThan(0);
    }),
  );

  it.effect('says so in the human output too', () =>
    Effect.gen(function* () {
      const cli = yield* runCli(egwSearch, ['sanctuary'], {}).pipe(
        Effect.provideService(SearchLayer, lexicalOnlySearch),
      );
      expect(cli.success).toBe(true);
      // A reader who never passes `--json` still learns that half the search
      // did not run, and what to do about it.
      expect(cli.stdout).toContain('lexical only');
    }),
  );

  it.effect('still answers, and marks which leg each hit came from', () =>
    Effect.gen(function* () {
      const cli = yield* runCli(egwSearch, ['sanctuary'], {}).pipe(
        Effect.provideService(SearchLayer, lexicalOnlySearch),
      );
      expect(cli.stdout).toContain('text #1');
    }),
  );
});

describe('bible egw search — narrowings reach the service', () => {
  it.scopedLive('passes --scope through to the corpus scope', () =>
    Effect.gen(function* () {
      const cli = yield* cliJson(['the king of the north', '--scope', 'pioneer']);
      // The flag reaches the query the service ran, and shows up on the wire.
      expect(cli.stdout).toContain('"scope": "pioneer"');
    }),
  );

  it.effect('rejects a scope the schema would refuse, at parse time', () =>
    Effect.gen(function* () {
      const cli = yield* cliJson(['sanctuary', '--scope', 'nonsense']);
      // `Flag.choice` is what makes this a parser error rather than a decode
      // failure deep inside the service.
      expect(cli.success).toBe(false);
    }),
  );
});

/** Round-2 F8: the CLI reads the vector artifact exactly once at startup.
 *
 *  §9.2's index is ~246 MB. The CLI has to parse it to decide whether it is one
 *  this build may scan, and the earlier shape then handed the *byte source* to
 *  `SearchService.Live`, which read and parsed the whole file again — two full
 *  reads and two copies of the vector region on every `bible egw search`
 *  invocation, for one decision. No result assertion can see that: both shapes
 *  return identical rows. Counting the reads is the only observable, and
 *  `core/src/search/vector-artifact.test.ts` already counts the per-query case,
 *  which this pair of startup reads slipped past.
 */
describe('bible egw search — the index is read once at startup (F8)', () => {
  it.scopedLive('parses the artifact once across the gate and the service', () =>
    Effect.gen(function* () {
      const reads = yield* Ref.make(0);
      const bytes = goldenVectorIndexBytes();
      const counting = Layer.succeed(VectorIndexBytes, {
        read: Ref.update(reads, (count) => count + 1).pipe(Effect.as(Option.some(bytes))),
      });

      // The CLI's real composition, with only the byte source substituted: the
      // gate and the service are the shipped ones.
      const layer = SearchService.Live.pipe(
        Layer.provide(goldenSearchSources),
        Layer.provide(verifiedVectorIndex('/fixture/vectors.bvi', counting)),
        Layer.provide(embedder),
      );

      yield* Effect.gen(function* () {
        const service = yield* SearchService;
        // Several queries, so a per-query read would climb past any fixed count.
        yield* service.query(
          SearchQuery.make({
            text: WORDY_QUERY,
            scope: Option.none(),
            bookCode: Option.none(),
            limit: Option.some(20),
          }),
        );
        for (const golden of GOLDEN_QUERIES) yield* service.query(golden.query);
      }).pipe(Effect.provide(layer));

      // One: the gate's parse. The service takes the resolved index rather than
      // re-reading. Against the pre-fix shape this is 2.
      expect(yield* Ref.get(reads)).toBe(1);
    }),
  );

  it.scopedLive('still refuses an index the shipped parser rejects, on one read', () =>
    Effect.gen(function* () {
      const reads = yield* Ref.make(0);
      // A foreign fingerprint: intact bytes this build must not scan.
      const foreign = goldenVectorIndexBytes('some-other-model/512d');
      const counting = Layer.succeed(VectorIndexBytes, {
        read: Ref.update(reads, (count) => count + 1).pipe(Effect.as(Option.some(foreign))),
      });
      const layer = SearchService.Live.pipe(
        Layer.provide(goldenSearchSources),
        Layer.provide(verifiedVectorIndex('/fixture/vectors.bvi', counting)),
        Layer.provide(embedder),
      );
      const result = yield* Effect.flatMap(SearchService, (service) =>
        service.query(
          SearchQuery.make({
            text: WORDY_QUERY,
            scope: Option.none(),
            bookCode: Option.none(),
            limit: Option.some(20),
          }),
        ),
      ).pipe(Effect.provide(layer));

      expect(result.vector._tag).toBe('unavailable');
      if (result.vector._tag !== 'unavailable') return;
      expect(result.vector.reason).toBe('fingerprint');
      expect(yield* Ref.get(reads)).toBe(1);
    }),
  );
});
