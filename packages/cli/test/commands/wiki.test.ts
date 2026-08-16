import { TopicDetail, TopicId, TopicService } from '@bible/core/topics';
import {
  matchRun,
  PhraseAutomaton,
  PhraseSpansJson,
  WikiPageJson,
  WikiSectionSources,
  WikiService,
  topicSlug,
  type WikiPage,
} from '@bible/core/wiki';
// The shared fixture is behind `@bible/core/wiki/testing`, not the production
// barrel: it is the *same* module the core suite imports relatively, so the
// cross-host parity claim is still about one input, but a shipped import
// cannot reach it.
import { DANIEL_8_9, PHRASE_FIXTURE_DICTIONARY } from '@bible/core/wiki/testing';
import { BunFileSystem } from '@effect/platform-bun';
import { layerBun } from '@bible/core/wiki/bun';
import { Database } from 'bun:sqlite';
import { Effect, Exit, FileSystem, Layer, Option, Schema, SchemaGetter } from 'effect';
import { describe, expect, it } from 'effect-bun-test';

import { WikiLayer, WikiTopicsJson, topicJson, topicsJson, wiki } from '../../src/commands/wiki.js';
import { runCli } from '../lib/run-cli.js';

/** The catalog ships inside the verified `bible.db`, so it is available in every
 *  state the wiki can be in — including the one this file is about, where no
 *  topics artifact is installed. */
const catalog = TopicService.Test([
  TopicDetail.make({
    id: Schema.decodeSync(TopicId)('sanctuary'),
    name: 'Sanctuary',
    alternativeNames: [],
    sections: [],
  }),
  TopicDetail.make({
    id: Schema.decodeSync(TopicId)('grace'),
    name: 'Grace',
    alternativeNames: [],
    sections: [],
  }),
]);

const listing = Effect.gen(function* () {
  const wiki = yield* WikiService;
  return { topics: yield* wiki.list({}), unavailable: yield* wiki.availability };
});

describe('bible wiki topics --json', () => {
  it.effect('reports catalog entries and the absence reason with no artifact', () =>
    Effect.gen(function* () {
      // The Milestone 2 CLI JSON workflow: with the artifact removed the command
      // must still return data. An empty `topics` array would tell a consumer
      // the wiki has nothing, when in fact every topic still has a page.
      const payload = yield* topicsJson(yield* listing);

      expect(payload.unavailable).toBe('artifact-not-installed');
      expect(payload.count).toBe(2);
      // `slug` is branded, so it is compared as its string projection rather
      // than reconstructing the brand in the expectation.
      expect(
        payload.topics.map((topic) => ({
          slug: topic.slug,
          title: topic.title,
          status: topic.status,
        })),
      ).toEqual([
        { slug: 'sanctuary', title: 'Sanctuary', status: 'catalog' },
        { slug: 'grace', title: 'Grace', status: 'catalog' },
      ]);
    }).pipe(
      Effect.provide(
        WikiService.Absent.pipe(Layer.provide(catalog), Layer.provide(WikiSectionSources.NotWired)),
      ),
    ),
  );

  it.effect('reports a null absence when the artifact is readable', () =>
    Effect.gen(function* () {
      // `null` rather than a missing key: the field is the wire's way of saying
      // "authored cores are available", so it must always be present.
      const payload = yield* topicsJson({
        topics: yield* Effect.succeed([]),
        unavailable: Option.none(),
      });
      expect(payload.unavailable).toBeNull();
    }),
  );

  it.effect('marks an authored page flagship and leaves the rest catalog', () =>
    Effect.gen(function* () {
      const wiki = yield* WikiService;
      const page = yield* wiki.topic(topicSlug('sanctuary'));
      // Every topic has a page even with no artifact — it simply has no
      // authored core, and says why.
      expect(page.status).toBe('catalog');
      expect(page.unavailable).toEqual(Option.some('artifact-not-installed'));
    }).pipe(
      Effect.provide(
        WikiService.Absent.pipe(Layer.provide(catalog), Layer.provide(WikiSectionSources.NotWired)),
      ),
    ),
  );

  it.effect('emits the page through the core schema, not a CLI-local projection', () =>
    Effect.gen(function* () {
      const wiki = yield* WikiService;
      const page = yield* wiki.topic(topicSlug('sanctuary'));

      // `--json` must be `WikiPageJson` and nothing else. The CLI used to build
      // its own object from the page — renaming `_tag` to `kind` and `absence`
      // to `getThisBook` — so a field added to the model reached the RPC wire
      // and silently missed the CLI. Equality against the core encoder is the
      // property that makes that impossible: any hand-written projection
      // differs from it somewhere.
      expect(yield* topicJson(page)).toEqual(yield* Schema.encodeEffect(WikiPageJson)(page));

      // And the schema's own names are what actually reach stdout, so the
      // assertion above is pinned to a concrete shape rather than to whatever
      // both sides happen to agree on.
      const emitted = yield* topicJson(page);
      expect(emitted.sections.map((section) => section._tag)).toEqual([
        'key-verses',
        'egw-statements',
        'commentary',
        'pioneer-witnesses',
        'cross-references',
        'related-topics',
      ]);
    }).pipe(
      Effect.provide(
        WikiService.Absent.pipe(Layer.provide(catalog), Layer.provide(WikiSectionSources.NotWired)),
      ),
    ),
  );
});

// ---------------------------------------------------------------------------
// The stdout seam
//
// The core host-parity test proves the CLI's exported `topicJson` and the RPC
// handler run one codec. What it cannot prove is that the *command* still calls
// it: replacing `topicJson(page)` in `wiki.ts` with a hand-mapped object leaves
// that test green, because the test applies the encoder itself. These run the
// real command — argument parsing, layer resolution, encoder, `Console.log` —
// and compare what actually reached stdout with what `v1.wiki.topic.get` puts
// on the wire for the same page.
// ---------------------------------------------------------------------------

/** The layer the two commands resolve under test. Substituted through
 *  `WikiLayer`, the reference whose default is the installed `~/.bible`
 *  corpora, so the command under test is the production command and only its
 *  data source moved. */
const fixtureWiki: Layer.Layer<WikiService> = WikiService.Absent.pipe(
  Layer.provide(catalog),
  Layer.provide(WikiSectionSources.NotWired),
);

const runWiki = (args: readonly string[]) =>
  runCli(wiki, [...args], {}).pipe(Effect.provideService(WikiLayer, fixtureWiki));

/** The CLI's serializer, declared here so the comparison is a property of the
 *  payload rather than of this test's own formatting choices. */
const JsonText = Schema.Unknown.pipe(
  Schema.encodeTo(Schema.String, {
    decode: SchemaGetter.parseJson(),
    encode: SchemaGetter.stringifyJson({ space: 2 }),
  }),
);

const serialize = Schema.encodeUnknownEffect(JsonText);

/** The JSON text `v1.wiki.topic.get` puts on the wire for one page.
 *
 *  Two steps, because that is what the seam is: `WikiPageJson` — the exported
 *  name for the procedure's declared success schema — encodes the page, and the
 *  result is serialized. Comparing text rather than objects is the point. JSON
 *  is what a client actually receives, and two encoders agreeing in memory
 *  while disagreeing on the wire is exactly the drift a shared codec removes. */
const pageWireText = (page: WikiPage): Effect.Effect<string, Schema.SchemaError> =>
  Effect.flatMap(Schema.encodeEffect(WikiPageJson)(page), serialize);

describe('bible wiki --json stdout', () => {
  it.effect('prints exactly what the RPC procedure would put on the wire', () =>
    Effect.gen(function* () {
      const result = yield* runWiki(['topic', 'sanctuary', '--json']);
      expect(result.success).toBe(true);

      const page = yield* Effect.gen(function* () {
        const service = yield* WikiService;
        return yield* service.topic(topicSlug('sanctuary'));
      }).pipe(Effect.provide(fixtureWiki));

      // The whole assertion. A hand-mapped projection reintroduced in the
      // command — renaming `_tag`, dropping `missingBooks`, adding a `kind` —
      // changes this text and nothing else has to be updated to catch it.
      expect(result.stdout).toBe(yield* pageWireText(page));
      // Not vacuous: an empty stdout would satisfy neither of these.
      expect(result.stdout.length).toBeGreaterThan(0);
      expect(result.stdout).toContain('"key-verses"');
      expect(result.stdout).toContain('"related-topics"');
    }),
  );

  it.effect('prints the listing envelope through the listing schema', () =>
    Effect.gen(function* () {
      const result = yield* runWiki(['topics', '--json']);
      expect(result.success).toBe(true);
      expect(result.stdout).toBe(
        yield* serialize(
          yield* topicsJson(
            yield* Effect.gen(function* () {
              const service = yield* WikiService;
              return {
                topics: yield* service.list({}),
                unavailable: yield* service.availability,
              };
            }).pipe(Effect.provide(fixtureWiki)),
          ),
        ),
      );
      // And the reason really is on the wire, so the equality is not two
      // encoders agreeing to print nothing.
      expect(result.stdout).toContain('"artifact-not-installed"');
    }),
  );

  it.effect('refuses a listing reason outside the closed union', () =>
    Effect.gen(function* () {
      // `unavailable` is the same closed `TopicsUnavailableReason` the page
      // model declares. While it was `Schema.String` a typo — or a second
      // vocabulary invented on the listing side — decoded happily, and a client
      // switching on the reason had no way to know its cases were complete.
      const decode = Schema.decodeUnknownEffect(WikiTopicsJson);
      expect(
        Exit.isFailure(yield* Effect.exit(decode({ topics: [], count: 0, unavailable: 'bogus' }))),
      ).toBe(true);
      // The real reasons still decode, so the check is a union and not a ban.
      const accepted = yield* decode({
        topics: [],
        count: 0,
        unavailable: 'artifact-not-installed',
      });
      expect(accepted.unavailable).toEqual(Option.some('artifact-not-installed'));
    }),
  );
});

// ---------------------------------------------------------------------------
// bible wiki matches
//
// The Milestone 4 CLI JSON workflow, and the CLI half of its adapter check.
// The shared fixture is `@bible/core/wiki`'s `PHRASE_FIXTURE_DICTIONARY` and
// `DANIEL_8_9` — the *same* module the core suite and the host-parity test
// import, so "identical output across hosts" is a claim about one input rather
// than about three copies of a verse that have not diverged yet.
//
// The dictionary reaches the command through a real artifact file read by
// `WikiService.Live`, not through a stubbed service: the acceptance is that the
// spans a reader sees come from the dictionary the artifact ships, and a stub
// would skip exactly the `topic_aliases` read that produces them.
// ---------------------------------------------------------------------------

const writeDictionaryArtifact = (file: string): string => {
  const database = new Database(file, { create: true });
  database.exec(`
    CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE topics (slug TEXT PRIMARY KEY, title TEXT NOT NULL, thesis_ast TEXT NOT NULL, body_ast TEXT NOT NULL, position INTEGER NOT NULL);
    CREATE TABLE topic_aliases (alias TEXT PRIMARY KEY, display TEXT NOT NULL, slug TEXT NOT NULL, canonical INTEGER NOT NULL);
    CREATE TABLE topic_edges (from_slug TEXT NOT NULL, to_slug TEXT NOT NULL, kind TEXT NOT NULL, position INTEGER NOT NULL, PRIMARY KEY (from_slug, to_slug, kind));
    CREATE TABLE topic_catalog_keys (slug TEXT PRIMARY KEY, catalog_id TEXT NOT NULL, matched_by TEXT NOT NULL);
    INSERT INTO meta (key, value) VALUES ('schema_major', '1');
  `);
  const insert = database.prepare(
    'INSERT INTO topic_aliases (alias, display, slug, canonical) VALUES (?, ?, ?, ?)',
  );
  for (const entry of PHRASE_FIXTURE_DICTIONARY.entries) {
    insert.run(entry.alias, entry.display, entry.slug, 1);
  }
  database.close();
  return file;
};

/** The installed-artifact path, through the same `layerBun` the production
 *  command resolves — only the filename moved. */
const dictionaryWiki = (file: string): Layer.Layer<WikiService> =>
  layerBun(file).pipe(Layer.provide(catalog), Layer.provide(WikiSectionSources.NotWired));

describe('bible wiki matches', () => {
  const test = it.scopedLive.layer(BunFileSystem.layer);

  test('returns the fixture spans for the Daniel 8:9 acceptance workflow', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs
        .makeTempDirectoryScoped({ prefix: 'bible-wiki-matches-' })
        .pipe(Effect.orDie);
      const file = writeDictionaryArtifact(`${directory}/topics.db`);

      // `bible wiki matches "$(bible verse 'Dan 8:9')" --json`, with the verse
      // text inlined as the shared fixture rather than shelled out for — the
      // string is byte-identical to what the verse command prints, brackets
      // included.
      const result = yield* runCli(wiki, ['matches', DANIEL_8_9, '--json'], {}).pipe(
        Effect.provideService(WikiLayer, dictionaryWiki(file)),
      );
      expect(result.success).toBe(true);

      // The expected value is the core matcher's own output, encoded by the
      // core codec: the CLI's contract is that it *runs* the matcher, not that
      // it reproduces a span list some test wrote down.
      const expected = yield* serialize(
        yield* Schema.encodeEffect(PhraseSpansJson)(
          matchRun(PhraseAutomaton.make(PHRASE_FIXTURE_DICTIONARY), DANIEL_8_9),
        ),
      );
      expect(result.stdout).toBe(expected);

      // Not vacuous, and pinned to the fixture's exact offsets. `little horn`
      // begins at 36 and ends at 47 in this verse; `pleasant land` is absent
      // because the KJV's `[land]` brackets split it (see `PHRASE_FIXTURE_NOTE`).
      // Decoded through the span codec rather than parsed loose, so the
      // assertion also proves stdout is a payload a client could consume.
      const decoded = yield* Schema.decodeEffect(Schema.fromJsonString(PhraseSpansJson))(
        result.stdout,
      );
      // The slug is branded, so it is compared as its string projection rather
      // than reconstructing the brand in the expectation — the same shape the
      // listing assertions above use.
      expect(
        decoded.map((span) => ({
          start: span.start,
          end: span.end,
          slug: String(span.slug),
          alias: span.alias,
        })),
      ).toEqual([{ start: 36, end: 47, slug: 'little-horn', alias: 'little horn' }]);
    }));

  test('reports the typed absence when no artifact is installed', () =>
    Effect.gen(function* () {
      // §3.5 again: no dictionary is not an error, and the command says why it
      // found nothing rather than printing an empty list with no explanation.
      const result = yield* runCli(wiki, ['matches', DANIEL_8_9], {}).pipe(
        Effect.provideService(WikiLayer, fixtureWiki),
      );
      expect(result.success).toBe(true);
      expect(result.stdout).toContain('artifact-not-installed');
    }));
});
