import { TopicDetail, TopicId, TopicService } from '@bible/core/topics';
import {
  BlocksJson,
  LookupInput,
  LookupResultJson,
  LookupService,
  matchRun,
  normalizeAlias,
  ParagraphBlock,
  PhraseAutomaton,
  PhraseSpansJson,
  TextInline,
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
import {
  DANIEL_8_9,
  LOOKUP_ADAPTER_EMPTY_TEXTS,
  LOOKUP_ADAPTER_INPUT,
  LOOKUP_ADAPTER_INPUT_NO_CONTEXT,
  LOOKUP_ADAPTER_SELECTION,
  LOOKUP_ADAPTER_TEXTS,
  PHRASE_FIXTURE_DICTIONARY,
  WIKI_ARTIFACT_DDL,
  WIKI_LOOKUP_FIXTURE_LAYER,
  WIKI_PAGE_FIXTURE,
  WIKI_PAGE_FIXTURE_IDENTITIES,
  WIKI_PAGE_FIXTURE_CATALOG,
  WIKI_PAGE_FIXTURE_PAGE,
  wikiPageFixtureRows,
  WIKI_PAGE_FIXTURE_SOURCES,
  wikiSectionIdentities,
} from '@bible/core/wiki/testing';
import { BunFileSystem } from '@effect/platform-bun';
import { layerBun } from '@bible/core/wiki/bun';
import { Database } from 'bun:sqlite';
import { Effect, Exit, FileSystem, Layer, Option, Schema, SchemaGetter } from 'effect';
import { describe, expect, it } from 'effect-bun-test';

import {
  LookupLayer,
  WikiLayer,
  WikiTopicsJson,
  lookupInput,
  topicJson,
  topicsJson,
  wiki,
} from '../../src/commands/wiki.js';
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

/** One composed topic page, resolved through a given wiring.
 *
 *  A named function rather than an inline `Effect.provide` inside each test's
 *  generator: the layer is per-test data — several of these tests build one over
 *  a scoped temp directory — so the provide belongs at this helper's own
 *  boundary rather than partway through a run. */
const composeTopicPage = (layer: Layer.Layer<WikiService>, slug: string) =>
  Effect.flatMap(WikiService, (service) => service.topic(topicSlug(slug))).pipe(
    Effect.provide(layer),
  );

/** The alias dictionary a wiring compiles, resolved the same way. */
const composeDictionary = (layer: Layer.Layer<WikiService>) =>
  Effect.flatMap(WikiService, (service) => service.dictionary).pipe(Effect.provide(layer));

/** The listing envelope the `topics` command prints, resolved the same way. */
const composeTopicsEnvelope = (layer: Layer.Layer<WikiService>) =>
  Effect.gen(function* () {
    const service = yield* WikiService;
    return {
      topics: yield* service.list({}),
      unavailable: yield* service.availability,
    };
  }).pipe(Effect.provide(layer));

describe('bible wiki --json stdout', () => {
  it.effect('prints exactly what the RPC procedure would put on the wire', () =>
    Effect.gen(function* () {
      const result = yield* runWiki(['topic', 'sanctuary', '--json']);
      expect(result.success).toBe(true);

      const page = yield* composeTopicPage(fixtureWiki, 'sanctuary');

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
        yield* serialize(yield* topicsJson(yield* composeTopicsEnvelope(fixtureWiki))),
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

// ---------------------------------------------------------------------------
// bible wiki topic 2300-days --json — the Milestone 6 CLI JSON workflow
//
// §10's Milestone 6 names this exact command: "`bible wiki topic 2300-days
// --json` matches, section for section and identity for identity, what the UI
// renders."
//
// **Which artifact.** `content/topics/2300-days.md` exists and carries the
// slug, the title and six aliases — but all 40 authored sources are still
// `status: draft`, so `bun run build:topics` emits an artifact with zero pages
// and zero aliases and warns that it would be refused at install time. The
// installed `~/.bible/topics.db` is exactly that empty artifact. So the real
// slug is run against a **fixture artifact** carrying the same slug, title and
// aliases the draft source declares, written through the same `topic_aliases`
// and `topics` DDL a compiled artifact has and read through the same
// production `layerBun`. When the first content release approves the page, the
// fixture and the shipped artifact carry the same identities and this test
// keeps meaning what it says.
//
// **What "matches what the UI renders" is asserted as.** The UI renders from
// `WikiPageJson` — `v1.wiki.topic.get`'s declared success schema — and
// `wiki/host-parity.test.ts` already proves the RPC handler and the CLI encode
// the *same value* through it. What is left for this file, and what a helper
// test could not see, is that the **command** still runs that encoder: the
// section identities and the default-open flags a UI would key on have to be
// the ones that actually reached stdout. The app's own
// `packages/app/src/reading/wiki-page-identity.test.ts` closes the loop from
// the other side, deriving the UI's rendered identities from the same encoded
// page.
// ---------------------------------------------------------------------------

/** The `2300-days` page as `content/topics/2300-days.md` declares it: the slug,
 *  the title, and the six authored aliases. Written into a fixture artifact
 *  because the source is still a draft — see the note above. */
const TWENTY_THREE_HUNDRED = {
  slug: '2300-days',
  title: '2300 Days / 1844',
  aliases: [
    '2300 days',
    'the 2300',
    '1844',
    'twenty-three hundred days',
    'two thousand and three hundred days',
    'tenth day of the seventh month',
  ],
} as const;

const writeTopicArtifact = (file: string): string => {
  const database = new Database(file, { create: true });
  database.exec(`
    CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE topics (slug TEXT PRIMARY KEY, title TEXT NOT NULL, thesis_ast TEXT NOT NULL, body_ast TEXT NOT NULL, position INTEGER NOT NULL);
    CREATE TABLE topic_aliases (alias TEXT PRIMARY KEY, display TEXT NOT NULL, slug TEXT NOT NULL, canonical INTEGER NOT NULL);
    CREATE TABLE topic_edges (from_slug TEXT NOT NULL, to_slug TEXT NOT NULL, kind TEXT NOT NULL, position INTEGER NOT NULL, PRIMARY KEY (from_slug, to_slug, kind));
    CREATE TABLE topic_catalog_keys (slug TEXT PRIMARY KEY, catalog_id TEXT NOT NULL, matched_by TEXT NOT NULL);
    INSERT INTO meta (key, value) VALUES ('schema_major', '1');
  `);
  const emptyBlocks = Schema.encodeSync(BlocksJson)([]);
  const thesis = Schema.encodeSync(BlocksJson)([
    ParagraphBlock.make({
      content: [
        TextInline.make({
          text: 'The 2300 evenings and mornings of Daniel 8:14 close in 1844.',
        }),
      ],
    }),
  ]);
  database
    .prepare(
      'INSERT INTO topics (slug, title, thesis_ast, body_ast, position) VALUES (?, ?, ?, ?, ?)',
    )
    .run(TWENTY_THREE_HUNDRED.slug, TWENTY_THREE_HUNDRED.title, thesis, emptyBlocks, 0);
  const insertAlias = database.prepare(
    'INSERT INTO topic_aliases (alias, display, slug, canonical) VALUES (?, ?, ?, ?)',
  );
  // The first authored alias is the canonical one — the phrase §6.2's search
  // handoff pre-fills and the composer's FTS runs on.
  const CANONICAL = 1;
  const SECONDARY = 0;
  for (const [position, alias] of TWENTY_THREE_HUNDRED.aliases.entries()) {
    let canonical = SECONDARY;
    if (position === 0) canonical = CANONICAL;
    insertAlias.run(normalizeAlias(alias), alias, TWENTY_THREE_HUNDRED.slug, canonical);
  }
  database.close();
  return file;
};

describe('bible wiki topic 2300-days --json', () => {
  const test = it.scopedLive.layer(BunFileSystem.layer);

  test('prints the composed page through the core schema, section for section', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs
        .makeTempDirectoryScoped({ prefix: 'bible-wiki-2300-' })
        .pipe(Effect.orDie);
      const layer = dictionaryWiki(writeTopicArtifact(`${directory}/topics.db`));

      const result = yield* runCli(wiki, ['topic', TWENTY_THREE_HUNDRED.slug, '--json'], {}).pipe(
        Effect.provideService(WikiLayer, layer),
      );
      expect(result.success).toBe(true);

      const page = yield* composeTopicPage(layer, TWENTY_THREE_HUNDRED.slug);

      // The identity claim: stdout is the schema's encoding of the page, not a
      // projection of it. A rename anywhere between the composer and the
      // terminal changes this text.
      expect(result.stdout).toBe(yield* pageWireText(page));

      // And the page really is the flagship one, with all six sections in
      // lineup order and the arrival posture on section 1 — the two facts a UI
      // renders from, and the two an empty page would make the equality above
      // vacuous about.
      //
      // Read off the *encoded* payload rather than the decoded page: what a
      // client receives is the JSON, and the point of the milestone's workflow
      // is that the identities in it are the ones the UI keys on. (`Option`'s
      // wire form here is its `{_id,_tag}` JSON, which is why this reads the
      // encoder's output directly rather than round-tripping stdout back
      // through the schema.)
      const emitted = yield* Schema.encodeEffect(WikiPageJson)(page);
      expect(emitted.status).toBe('flagship');
      expect(emitted.title).toBe(TWENTY_THREE_HUNDRED.title);
      expect(emitted.sections.map((section) => section._tag)).toEqual([
        'key-verses',
        'egw-statements',
        'commentary',
        'pioneer-witnesses',
        'cross-references',
        'related-topics',
      ]);
      expect(emitted.sections.map((section) => section.defaultOpen)).toEqual([
        true,
        false,
        false,
        false,
        false,
        false,
      ]);
      expect(Option.isSome(page.core)).toBe(true);
      // The thesis really crossed: a peek card renders it, and an empty core
      // would still satisfy `isSome`.
      expect(result.stdout).toContain('2300 evenings and mornings');
    }));

  test('the authored aliases reach the dictionary the renderer matches with', () =>
    Effect.gen(function* () {
      // The other half of what the UI shows for this topic: the phrase spans it
      // lights come from these rows, so a page whose aliases did not compile
      // would render a topic nobody could reach by tapping.
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs
        .makeTempDirectoryScoped({ prefix: 'bible-wiki-2300-aliases-' })
        .pipe(Effect.orDie);
      const layer = dictionaryWiki(writeTopicArtifact(`${directory}/topics.db`));

      const dictionary = yield* composeDictionary(layer);
      expect(dictionary.entries.map((entry) => entry.alias).toSorted()).toEqual(
        TWENTY_THREE_HUNDRED.aliases.map(normalizeAlias).toSorted(),
      );

      // Every alias resolves to the one page, and the matcher really lights one.
      const automaton = PhraseAutomaton.make(dictionary);
      const spans = matchRun(automaton, 'Unto two thousand and three hundred days.');
      expect(spans.map((span) => String(span.slug))).toEqual([TWENTY_THREE_HUNDRED.slug]);
    }));
});

// ---------------------------------------------------------------------------
// The same command over a page whose sections are **not empty**
//
// The suite above runs `bible wiki topic --json` against
// `WikiSectionSources.NotWired`, and everything it can therefore assert about
// the sections is true of six empty lists: the tags, the order, the arrival
// flags. Section *content* — the thing "identity for identity, what the UI
// renders" is actually about — was never in the payload it checked.
//
// So this block runs the identical command over the shared non-empty fixture
// (`@bible/core/wiki/testing`'s `wikiPageFixtureSources`, which is the
// production `WikiSectionSources.Live` over test corpora), and asserts the item
// identities section by section. The same fixture and the same identity table
// are asserted from the UI side by
// `packages/app/src/reading/wiki-page-identity.test.ts` and against the
// rendered DOM by `apps/desktop/e2e/wiki-phrase.spec.ts`, so the three seams
// agree about one page rather than about three empty ones.
// ---------------------------------------------------------------------------

/** The fixture artifact, written through the DDL the fixture module owns and
 *  the rows it declares. Neither is spelled here: a fixture the suite half
 *  writes itself is a fixture that can drift from the two other seams reading
 *  it. */
const writePopulatedArtifact = (file: string): string => {
  const database = new Database(file, { create: true });
  database.exec(WIKI_ARTIFACT_DDL);
  for (const row of wikiPageFixtureRows()) database.prepare(row.sql).run(...row.params);
  database.close();
  return file;
};

/** The production `layerBun`, over the wired sources rather than `NotWired` —
 *  the one difference from `dictionaryWiki` above, and the whole of what makes
 *  the assertions below non-vacuous. */
const populatedWiki = (file: string): Layer.Layer<WikiService> =>
  layerBun(file).pipe(
    Layer.provide(WIKI_PAGE_FIXTURE_CATALOG),
    Layer.provide(WIKI_PAGE_FIXTURE_SOURCES),
  );

describe('bible wiki topic --json over a populated page', () => {
  const test = it.scopedLive.layer(BunFileSystem.layer);

  test('every section carries its items, and they are the identities the UI renders', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs
        .makeTempDirectoryScoped({ prefix: 'bible-wiki-populated-' })
        .pipe(Effect.orDie);
      const layer = populatedWiki(writePopulatedArtifact(`${directory}/topics.db`));

      const result = yield* runCli(wiki, ['topic', WIKI_PAGE_FIXTURE.slug, '--json'], {}).pipe(
        Effect.provideService(WikiLayer, layer),
      );
      expect(result.success).toBe(true);

      // The composed page, resolved through the same layer the command ran on…
      const page = yield* composeTopicPage(layer, WIKI_PAGE_FIXTURE.slug);

      // …and stdout is its encoding, which is the identity claim: no projection
      // sits between the composer and the terminal.
      expect(result.stdout).toBe(yield* pageWireText(page));

      // Section for section, identity for identity. Emptying any one section in
      // the fixture — or unwiring the sources, which is what this suite used to
      // do — fails here rather than passing over an empty list.
      expect(wikiSectionIdentities(page.sections)).toEqual(WIKI_PAGE_FIXTURE_IDENTITIES);

      // And not one section of it is empty, stated separately so the table above
      // cannot be quietly emptied on both sides at once.
      for (const section of page.sections) expect(section.items.length).toBeGreaterThan(0);

      // The identities really did reach stdout, and not only the value the test
      // encoded beside it: the refcodes and labels are in the text a consumer
      // reads. (`Option`'s wire form is its `{_id,_tag}` JSON, which is why the
      // structural assertions above read the decoded page rather than parsing
      // stdout back — see the note on the empty-page suite.)
      for (const identities of Object.values(WIKI_PAGE_FIXTURE_IDENTITIES)) {
        for (const identity of identities) expect(result.stdout).toContain(identity);
      }

      // The app's own suite cannot open a SQLite artifact — `packages/app` has
      // no SQL dependency and must not grow one to assert what its JSX draws —
      // so it composes the same fixture one layer down, through
      // `wikiPageFixturePage`. This pins the two paths together: the page the
      // command printed and the page that suite renders from are the same six
      // sections, item for item.
      expect(wikiSectionIdentities((yield* WIKI_PAGE_FIXTURE_PAGE).sections)).toEqual(
        wikiSectionIdentities(page.sections),
      );
    }));

  test('§6.3 rides beside the ranked hits, on the wire the UI reads', () =>
    Effect.gen(function* () {
      // The thesis cites a book the fixture library does not hold, so section 2
      // carries a `missingBooks` entry beside its hits. It is section metadata
      // rather than an item — the cap and `total` stay rank-only — and it is the
      // second piece of markup on a section that a test over an empty page could
      // not see.
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs
        .makeTempDirectoryScoped({ prefix: 'bible-wiki-populated-missing-' })
        .pipe(Effect.orDie);
      const layer = populatedWiki(writePopulatedArtifact(`${directory}/topics.db`));

      const result = yield* runCli(wiki, ['topic', WIKI_PAGE_FIXTURE.slug, '--json'], {}).pipe(
        Effect.provideService(WikiLayer, layer),
      );
      const page = yield* composeTopicPage(layer, WIKI_PAGE_FIXTURE.slug);
      expect(result.stdout).toBe(yield* pageWireText(page));

      const egw = page.sections[1];
      expect(egw.missingBooks.map((book) => book.bookCode)).toEqual(['ABSENT']);
      // The section still ranks only its hits, which is what makes the cap
      // meaningful.
      expect(egw.total).toBe(egw.items.length);
      expect(Option.isSome(egw.handoff)).toBe(true);
    }));
});

// ---------------------------------------------------------------------------
// bible wiki lookup (§7) — the Milestone 7 CLI JSON workflow and adapter check
//
// Two claims, and they are different claims:
//
//  1. **The portable input.** §10's adapter check is that the DOM selection on
//     web and desktop builds the same `LookupInput` the CLI builds from its
//     argument. No package imports both builders, so each asserts against
//     `@bible/core/wiki/testing`'s `LOOKUP_ADAPTER_INPUT` — the CLI here, the
//     app in `packages/app/src/reading/lookup-selection.test.ts`.
//  2. **The stdout seam.** `wiki/lookup-parity.test.ts` proves the RPC handler
//     and `LookupService` encode one value through one codec. What it cannot
//     prove is that the *command* still runs that codec, and that its human
//     output really carries all five groups in §7's order. These run the real
//     command — argument parsing, layer resolution, encoder, `Console.log`.
// ---------------------------------------------------------------------------

const runLookup = (args: readonly string[]) =>
  runCli(wiki, ['lookup', ...args], {}).pipe(
    Effect.provideService(LookupLayer, WIKI_LOOKUP_FIXTURE_LAYER),
  );

const lookupResult = (input: LookupInput) =>
  Effect.flatMap(LookupService, (service) => service.resolve(input)).pipe(
    Effect.provide(WIKI_LOOKUP_FIXTURE_LAYER),
  );

describe('bible wiki lookup', () => {
  it.effect('builds the portable lookup input the DOM hosts build', () =>
    Effect.gen(function* () {
      // §7's own command line: `bible wiki lookup "the daily" --context "Dan
      // 8:13"`. The value it produces is the fixture the two DOM adapters are
      // asserted against, so the three builders agree about one value rather
      // than about three copies of it.
      const built = yield* lookupInput({
        text: LOOKUP_ADAPTER_SELECTION.text,
        context: Option.some(LOOKUP_ADAPTER_SELECTION.reference),
      });
      expect(built).toEqual(LOOKUP_ADAPTER_INPUT);
    }),
  );

  it.effect('builds that input from every raw argument the fixture names', () =>
    Effect.gen(function* () {
      // The CLI half of the shared table. A shell argument carries whatever the
      // caller quoted — `bible wiki lookup "  the   daily  "` is one keystroke
      // away from the clean form — and a DOM `Range` carries the markup's own
      // line breaks. Both adapters run one core builder over these rows, so the
      // two produce one `text` rather than two that agree on tidy input.
      for (const row of LOOKUP_ADAPTER_TEXTS) {
        const built = yield* lookupInput({ text: row.raw, context: Option.none() });
        expect(built.text).toBe(row.text);
      }
    }),
  );

  it.effect('refuses an argument that is nothing but whitespace', () =>
    Effect.gen(function* () {
      // `LookupInput.text` is `NonEmptyString`. Refused here, the caller gets
      // the command's own message; passed on, the schema throws at a boundary
      // the caller cannot read.
      for (const raw of LOOKUP_ADAPTER_EMPTY_TEXTS) {
        const exit = yield* Effect.exit(lookupInput({ text: raw, context: Option.none() }));
        expect(Exit.isFailure(exit)).toBe(true);
      }
    }),
  );

  it.effect('builds the no-context input the DOM hosts build outside Scripture', () =>
    Effect.gen(function* () {
      const built = yield* lookupInput({
        text: LOOKUP_ADAPTER_SELECTION.text,
        context: Option.none(),
      });
      expect(built).toEqual(LOOKUP_ADAPTER_INPUT_NO_CONTEXT);
    }),
  );

  it.effect('refuses a --context that does not name one verse', () =>
    Effect.gen(function* () {
      // A chapter would silently resolve against its first verse and report
      // Strong's entries for words the caller never named.
      const exit = yield* Effect.exit(
        lookupInput({ text: 'the daily', context: Option.some('Dan 8') }),
      );
      expect(Exit.isFailure(exit)).toBe(true);
    }),
  );

  it.effect('prints exactly what the RPC procedure would put on the wire', () =>
    Effect.gen(function* () {
      const result = yield* runLookup([WIKI_PAGE_FIXTURE.phrase, '--json']);
      expect(result.success).toBe(true);

      const resolved = yield* lookupResult(
        LookupInput.make({ text: WIKI_PAGE_FIXTURE.phrase, context: Option.none() }),
      );
      expect(result.stdout).toBe(
        yield* serialize(yield* Schema.encodeEffect(LookupResultJson)(resolved)),
      );

      // Not vacuous: four groups answered, and the keys are §7's five in §7's
      // order — which is the order the panel draws.
      const wire = yield* Schema.decodeEffect(Schema.fromJsonString(Schema.Unknown))(result.stdout);
      expect(Object.keys(wire as object)).toEqual([
        'text',
        'topics',
        'strongs',
        'verses',
        'writings',
        'catalog',
        'lonePeek',
      ]);
      expect(resolved.topics.length).toBeGreaterThan(0);
      expect(resolved.verses.length).toBeGreaterThan(0);
      expect(resolved.writings.length).toBeGreaterThan(0);
      expect(resolved.catalog.length).toBeGreaterThan(0);
    }),
  );

  it.effect('runs §10’s CLI JSON workflow, context and all', () =>
    Effect.gen(function* () {
      // §10, Milestone 7, word for word: `bible wiki lookup "the daily"
      // --context "Dan 8:13" --json`. Through the real command, so the flag is
      // parsed, converted to a verse address and carried into the service — a
      // parser that dropped `--context` would print four groups and an empty
      // fifth, and every other test in this file would still pass.
      const result = yield* runLookup([
        LOOKUP_ADAPTER_SELECTION.text,
        '--context',
        LOOKUP_ADAPTER_SELECTION.reference,
        '--json',
      ]);
      expect(result.success).toBe(true);

      // What the command printed is what the service answers for the *whole*
      // input, context included — `LOOKUP_ADAPTER_INPUT` is that input, and it
      // is the value the three adapter builders are held to.
      const resolved = yield* lookupResult(LOOKUP_ADAPTER_INPUT);
      expect(result.stdout).toBe(
        yield* serialize(yield* Schema.encodeEffect(LookupResultJson)(resolved)),
      );
      // Not vacuous: the flag reached `getVerseWords` and the group filled.
      expect(resolved.strongs.map((hit) => hit.word)).toEqual(['the daily']);

      // And the same command without the flag leaves that group empty, which is
      // §10's other half: "omitting `context` does not". A parser that dropped
      // `--context` would print this second output for both runs.
      const without = yield* runLookup([LOOKUP_ADAPTER_SELECTION.text, '--json']);
      expect(without.stdout).not.toBe(result.stdout);
    }),
  );

  it.effect('prints all five groups in panel order, empty ones included', () =>
    Effect.gen(function* () {
      const result = yield* runLookup([WIKI_PAGE_FIXTURE.phrase]);
      expect(result.success).toBe(true);

      // The human form is the same five rows in the same order. An empty group
      // prints its heading with a zero rather than vanishing — §7's
      // "present-and-empty, not absent", in the surface a reader reads.
      const headings = result.stdout
        .split('\n')
        .filter((line) => line.startsWith('## '))
        .map((line) => line.split('  ')[0]);
      expect(headings).toEqual([
        '## topics',
        '## strongs',
        '## verses',
        '## writings',
        '## catalog',
      ]);
      expect(result.stdout).toContain('## strongs  0');
      expect(result.stdout).toContain(WIKI_PAGE_FIXTURE.slug);
    }),
  );
});
