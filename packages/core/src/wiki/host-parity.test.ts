/** One composed page, two seams, byte-identical JSON.
 *
 *  Milestone 3 ships the wiki through three hosts. The web worker and Electron
 *  main are not two implementations — both register `BibleProcedureHandlers`
 *  (`procedure/handlers.ts`) over the same `WikiService`, so what crosses their
 *  wire is one handler's output and comparing them to each other would compare
 *  a value to itself. The CLI is the genuinely separate seam: it resolves
 *  `WikiService` directly and serializes the page itself.
 *
 *  So the honest parity claim is the one asserted here: **the page the RPC
 *  handler returns and the page the CLI prints are the same value, encoded by
 *  the same schema.** One fixture — a topics artifact plus the four §6 sources
 *  — feeds both, and the comparison is on encoded JSON rather than on decoded
 *  objects, because JSON is what actually reaches a client.
 */

import * as SqliteBun from '@effect/sql-sqlite-bun/SqliteClient';
import { BunFileSystem } from '@effect/platform-bun';
import { Database } from 'bun:sqlite';
import { Effect, FileSystem, Layer, Option, Schema, type Scope } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { RpcTest } from 'effect/unstable/rpc';

import { BibleDatabase } from '../bible-db/bible-database.js';
import type { CrossReference } from '../bible-db/bible-database.js';
import { EGWCommentaryService } from '../egw-commentary/service.js';
import { EGWParagraphDatabase } from '../egw-db/book-database.js';
import type * as EGWSchemas from '../egw/schemas.js';
import { BibleProcedureGroup } from '../procedure/group.js';
import { BibleProcedureHandlers } from '../procedure/handlers.js';
import { TopicDetail, TopicId, TopicReference, TopicSection } from '../topics/model.js';
import { TopicService } from '../topics/service.js';
import { EGW_SCOPE_AUTHORS } from '../writings/corpus-scope.js';
import { WritingsService } from '../writings/service.js';
import { procedureDependencies } from '../procedure/testing.js';
import {
  BlocksJson,
  CitationInline,
  ParagraphBlock,
  PhraseDictionary,
  TextInline,
  topicSlug,
  type TopicSlug,
  WikiPageJson,
} from './model.js';
import { DANIEL_8_9, PHRASE_FIXTURE_DICTIONARY } from './phrase-fixture.js';
import { matchRun, PhraseAutomaton, PhraseSpan, PhraseSpansJson } from './phrase-matcher.js';
import { WikiSectionSources } from './section-composer.js';
import { WikiService } from './service.js';

// ---------------------------------------------------------------------------
// One fixture, wired once, read by both seams.
// ---------------------------------------------------------------------------

const encodeBlocks = Schema.encodeSync(BlocksJson);

/** A thesis with a citation into a book the fixture library does not hold, so
 *  the page under comparison exercises §6.3's `missingBooks` as well as the
 *  ranked hits — the halves most likely to be projected differently by two
 *  serializers. */
const THESIS = encodeBlocks([
  ParagraphBlock.make({
    content: [
      TextInline.make({ text: 'As it is written, ' }),
      CitationInline.make({ text: 'the sanctuary shall be cleansed', refcode: 'ABSENT 12.3' }),
    ],
  }),
]);

const CATALOG_ID = 'naves-topical-bible.sanctuary';

/** A Nave's-shaped topic holding both reference shapes the catalog really
 *  stores: single verses and a range. */
const CATALOG = TopicDetail.make({
  id: Schema.decodeSync(TopicId)(CATALOG_ID),
  name: 'SANCTUARY',
  alternativeNames: [],
  sections: [
    TopicSection.make({
      label: 'General references',
      references: [
        TopicReference.make({ raw: 'Jn 11:1-3', osis: ['John.11.1-John.11.3'] }),
        TopicReference.make({ raw: 'Jn 11:5', osis: ['John.11.5'] }),
        TopicReference.make({ raw: 'Jn 11:9', osis: ['John.11.9'] }),
      ],
    }),
  ],
});

const book = (input: {
  readonly id: number;
  readonly code: string;
  readonly title: string;
  readonly author: string;
  readonly paragraphs: number;
}) => ({
  book_id: input.id,
  book_code: input.code,
  book_title: input.title,
  book_author: input.author,
  paragraph_count: input.paragraphs,
  created_at: '2026-01-01T00:00:00.000Z',
});

const EGW_AUTHOR = EGW_SCOPE_AUTHORS[0];

const BOOKS = [
  book({ id: 1, code: 'GC', title: 'The Great Controversy', author: EGW_AUTHOR, paragraphs: 1 }),
  book({
    id: 2,
    code: 'DAR',
    title: 'Daniel and the Revelation',
    author: 'Uriah Smith',
    paragraphs: 1,
  }),
  book({
    id: 3,
    code: 'ABSENT',
    title: 'A Book You Do Not Have',
    author: EGW_AUTHOR,
    paragraphs: 0,
  }),
];

const paragraph = (input: {
  readonly code: string;
  readonly refcode: string;
  readonly text: string;
}): EGWSchemas.Paragraph & { readonly bookCode: string } => ({
  para_id: Option.some(input.refcode),
  refcode_short: Option.some(input.refcode),
  refcode_long: input.refcode,
  nodes: [{ _tag: 'Text', text: input.text }],
  puborder: 1,
  element_type: 'para',
  element_subtype: Option.getOrNull(Option.none<string>()),
  bookCode: input.code,
});

const PARAGRAPHS = [
  paragraph({ code: 'GC', refcode: 'GC 1.1', text: 'the sanctuary in heaven' }),
  paragraph({ code: 'DAR', refcode: 'DAR 1.1', text: 'the sanctuary of Daniel' }),
];

const VERSES = [1, 2, 3, 5, 9].map((verse) => ({
  book: 43,
  chapter: 11,
  verse,
  versionCode: 'KJV',
  text: `John 11:${String(verse)} text`,
}));

const CROSS_REFS = [
  {
    book: 43,
    chapter: 11,
    verse: 1,
    references: [
      {
        book: 1,
        chapter: 1,
        verse: Option.some(1),
        verseEnd: Option.none(),
        source: 'openbible',
        previewText: Option.some('In the beginning'),
      } satisfies CrossReference,
    ],
  },
];

const COMMENTARY = [
  {
    refcode: '5BC 110.1',
    bookCode: '5BC',
    bookTitle: 'Bible Commentary Volume 5',
    bookAuthor: 'Ellen Gould White',
    content: 'Commentary on John 11',
    puborder: 1,
  },
];

const sources = WikiSectionSources.Live.pipe(
  Layer.provide(TopicService.Test([CATALOG])),
  Layer.provide(BibleDatabase.layerTest({ verses: VERSES, crossRefs: CROSS_REFS })),
  Layer.provide(EGWCommentaryService.Test({ entries: COMMENTARY })),
  Layer.provide(
    WritingsService.Live.pipe(
      Layer.provide(EGWParagraphDatabase.Test({ books: BOOKS, paragraphs: PARAGRAPHS })),
    ),
  ),
);

const writeArtifact = (file: string): string => {
  const database = new Database(file, { create: true });
  database.exec(`
    CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE topics (slug TEXT PRIMARY KEY, title TEXT NOT NULL, thesis_ast TEXT NOT NULL, body_ast TEXT NOT NULL, position INTEGER NOT NULL);
    CREATE TABLE topic_aliases (alias TEXT PRIMARY KEY, display TEXT NOT NULL, slug TEXT NOT NULL, canonical INTEGER NOT NULL);
    CREATE TABLE topic_edges (from_slug TEXT NOT NULL, to_slug TEXT NOT NULL, kind TEXT NOT NULL, position INTEGER NOT NULL, PRIMARY KEY (from_slug, to_slug, kind));
    CREATE TABLE topic_catalog_keys (slug TEXT PRIMARY KEY, catalog_id TEXT NOT NULL, matched_by TEXT NOT NULL);
    INSERT INTO meta (key, value) VALUES ('schema_major', '1');
  `);
  database
    .prepare(
      'INSERT INTO topics (slug, title, thesis_ast, body_ast, position) VALUES (?, ?, ?, ?, ?)',
    )
    .run('sanctuary', 'The Sanctuary', THESIS, encodeBlocks([]), 0);
  database
    .prepare(
      'INSERT INTO topics (slug, title, thesis_ast, body_ast, position) VALUES (?, ?, ?, ?, ?)',
    )
    .run('day-of-atonement', 'Day of Atonement', encodeBlocks([]), encodeBlocks([]), 1);
  // The shared Milestone 4 fixture dictionary, written through the same
  // `topic_aliases` table a compiled artifact carries — so the spans compared
  // below come from a real read rather than from a value handed to both seams.
  const insertAlias = database.prepare(
    'INSERT INTO topic_aliases (alias, display, slug, canonical) VALUES (?, ?, ?, ?)',
  );
  insertAlias.run('sanctuary', 'sanctuary', 'sanctuary', 1);
  for (const entry of PHRASE_FIXTURE_DICTIONARY.entries) {
    if (entry.alias === 'sanctuary') continue;
    insertAlias.run(entry.alias, entry.display, entry.slug, 1);
  }
  // One authored edge out, and one edge in from the other page — so the
  // compared section exercises both the artifact-stored half and the live
  // backlink half of §2.3.
  database
    .prepare('INSERT INTO topic_edges (from_slug, to_slug, kind, position) VALUES (?, ?, ?, ?)')
    .run('sanctuary', 'day-of-atonement', 'authored', 0);
  database
    .prepare('INSERT INTO topic_edges (from_slug, to_slug, kind, position) VALUES (?, ?, ?, ?)')
    .run('day-of-atonement', 'sanctuary', 'authored', 0);
  database
    .prepare('INSERT INTO topic_catalog_keys (slug, catalog_id, matched_by) VALUES (?, ?, ?)')
    .run('sanctuary', CATALOG_ID, 'override');
  database.close();
  return file;
};

const artifact = (): Effect.Effect<string, never, FileSystem.FileSystem | Scope.Scope> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const directory = yield* fs
      .makeTempDirectoryScoped({ prefix: 'bible-wiki-parity-' })
      .pipe(Effect.orDie);
    return yield* Effect.sync(() => writeArtifact(`${directory}/topics.db`));
  });

/** The one `WikiService` both seams resolve. The CLI reaches it directly; the
 *  RPC handlers reach it through `BibleProcedureHandlers`. */
const wiki = (file: string): Layer.Layer<WikiService> =>
  WikiService.Live.pipe(
    Layer.provide(SqliteBun.layer({ filename: file, readonly: true })),
    Layer.provide(TopicService.Test([CATALOG])),
    Layer.provide(sources),
    Layer.orDie,
  );

/** Everything `BibleProcedureHandlers` needs beyond the wiki.
 *
 *  The shared graph (`@bible/core/procedure/testing`) rather than a second
 *  hand-written copy of it, which is what this file used to hold: none of it is
 *  what is under comparison — the handler layer is the *real* one, and the only
 *  interesting service inside it is the same `WikiService` the CLI half
 *  resolves — so a private copy was ~110 lines that had to be kept in step with
 *  the study suite's identical ~110 by hand.
 *
 *  Only `writings` is overridden: the wiki's own reads go through it. */
const otherProcedureDependencies = (wiki: Layer.Layer<WikiService>) =>
  procedureDependencies({
    generation: 'parity',
    // The service under comparison, handed in rather than merged alongside:
    // `Layer.mergeAll` resolves a duplicate tag in favour of the *later* layer,
    // so a stub supplied here would silently win over the real one and the
    // parity claim would compare two empty pages.
    wiki,
    topics: TopicService.Test([CATALOG]),
    writings: WritingsService.Live.pipe(
      Layer.provide(EGWParagraphDatabase.Test({ books: BOOKS, paragraphs: PARAGRAPHS })),
    ),
  });

/** The two seams, each with the fixture layer provided at its own boundary.
 *
 *  The layer is per-test — it is built over a temp-directory artifact — so the
 *  provide cannot sit on the test's returned effect; a named function per seam
 *  is the boundary instead. */
const topicOverRpc = (wikiLayer: Layer.Layer<WikiService>, slug: TopicSlug) =>
  Effect.gen(function* () {
    const client = yield* RpcTest.makeClient(BibleProcedureGroup);
    return yield* client['v1.wiki.topic.get']({ slug });
  }).pipe(
    Effect.provide(
      BibleProcedureHandlers.pipe(Layer.provide(otherProcedureDependencies(wikiLayer))),
    ),
  );

const topicOverCli = (wikiLayer: Layer.Layer<WikiService>, slug: TopicSlug) =>
  Effect.gen(function* () {
    const service = yield* WikiService;
    return yield* service.topic(slug);
  }).pipe(Effect.provide(wikiLayer));

const dictionaryOverRpc = (wikiLayer: Layer.Layer<WikiService>) =>
  Effect.gen(function* () {
    const client = yield* RpcTest.makeClient(BibleProcedureGroup);
    return yield* client['v1.wiki.dictionary.get']({});
  }).pipe(
    Effect.provide(
      BibleProcedureHandlers.pipe(Layer.provide(otherProcedureDependencies(wikiLayer))),
    ),
  );

const dictionaryOverCli = (wikiLayer: Layer.Layer<WikiService>) =>
  Effect.gen(function* () {
    const service = yield* WikiService;
    return yield* service.dictionary;
  }).pipe(Effect.provide(wikiLayer));

// ---------------------------------------------------------------------------

describe('wiki host parity', () => {
  const test = it.scopedLive.layer(BunFileSystem.layer);

  test('the RPC handler and the CLI serialize the identical composed page', () =>
    Effect.gen(function* () {
      const file = yield* artifact();
      const wikiLayer = wiki(file);
      const slug = topicSlug('sanctuary');

      // Seam 1 — the RPC handler both visual hosts register. `RpcTest` runs the
      // real client/server pair, so the value here has crossed a wire and been
      // decoded by the group's own schema.
      const overRpc = yield* topicOverRpc(wikiLayer, slug);

      // Seam 2 — the CLI, calling `WikiService` directly.
      const overCli = yield* topicOverCli(wikiLayer, slug);

      // Encoded, not decoded: JSON is what a client actually receives, and two
      // serializers agreeing on decoded objects while disagreeing on the wire
      // is precisely the drift the shared `WikiPageJson` codec removes. This is
      // the same encoder `bible wiki topic --json` runs and the same one the
      // procedure group declares as `v1.wiki.topic.get`'s success schema.
      const encode = Schema.encodeEffect(Schema.fromJsonString(WikiPageJson));
      expect(yield* encode(overRpc)).toBe(yield* encode(overCli));

      // And the page really is the composed one, not an empty shell that would
      // make the equality vacuous.
      expect(overCli.sections.map((section) => section._tag)).toEqual([
        'key-verses',
        'egw-statements',
        'commentary',
        'pioneer-witnesses',
        'cross-references',
        'related-topics',
      ]);
      expect(overCli.sections[0].items.length).toBe(3);
      expect(overCli.sections[1].missingBooks.length).toBe(1);
      expect(overCli.sections[5].items.length).toBe(1);
      expect(Option.isSome(overCli.core)).toBe(true);
    }));

  // -------------------------------------------------------------------------
  // Milestone 4 — the same parity claim for phrase spans.
  //
  // Matching is **not** an RPC. §4.1 puts it at render time, in the client,
  // over the text the client is about to draw: the automaton builds in ~1 ms
  // and matches a screenful in 0.38 ms, so a round trip per screenful would
  // cost more than the work it delegates, and precomputed spans were rejected
  // because their offsets still need re-projection onto the rendered AST. There
  // is therefore no `v1.wiki.matches` to compare.
  //
  // What crosses the wire is the **dictionary** (`v1.wiki.dictionary.get`), and
  // the parity claim follows the M3 shape: the spans a host derives from the
  // dictionary it received over RPC are byte-identical to the spans the CLI
  // derives from the dictionary it read directly. That is the stronger claim —
  // it says the three hosts agree because they run one matcher over one
  // dictionary, not because they all asked one server.
  // -------------------------------------------------------------------------

  test('the dictionary crossing RPC and the dictionary read directly yield identical spans', () =>
    Effect.gen(function* () {
      const file = yield* artifact();
      const wikiLayer = wiki(file);

      // Seam 1 — the worker's and Electron main's path: the dictionary crosses
      // the real client/server pair and is decoded by the group's own schema,
      // then the host builds its automaton from what it received.
      const overRpc = yield* dictionaryOverRpc(wikiLayer);

      // Seam 2 — the CLI, resolving `WikiService` directly.
      const overCli = yield* dictionaryOverCli(wikiLayer);

      const encodeSpans = Schema.encodeEffect(Schema.fromJsonString(PhraseSpansJson));
      const spansFor = (dictionary: PhraseDictionary) =>
        encodeSpans(matchRun(PhraseAutomaton.make(dictionary), DANIEL_8_9));

      // Byte-identical offsets, on the encoded form — JSON is what a renderer
      // and the CLI's `--json` actually carry.
      expect(yield* spansFor(overRpc)).toBe(yield* spansFor(overCli));

      // And not vacuously: the fixture verse really does light a phrase, at the
      // offsets the CLI acceptance workflow pins.
      expect(matchRun(PhraseAutomaton.make(overRpc), DANIEL_8_9)).toEqual([
        PhraseSpan.make({
          start: 36,
          end: 47,
          slug: topicSlug('little-horn'),
          alias: 'little horn',
        }),
      ]);

      // The automaton is built per host from the dictionary each host holds, so
      // the two dictionaries must themselves be the same value — otherwise the
      // span equality above could hold for two libraries that disagree.
      const encodeDictionary = Schema.encodeEffect(Schema.fromJsonString(PhraseDictionary));
      expect(yield* encodeDictionary(overRpc)).toBe(yield* encodeDictionary(overCli));
      expect(overCli.entries.length).toBe(PHRASE_FIXTURE_DICTIONARY.entries.length);
    }));
});
