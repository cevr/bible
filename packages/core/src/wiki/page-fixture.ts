/** One **non-empty** topic page, shared by every seam that claims the UI renders
 *  what the wire carries (§10 Milestone 6).
 *
 *  The acceptance is "`bible wiki topic <slug> --json` matches, section for
 *  section and identity for identity, what the UI renders". Three suites assert
 *  a piece of it, and until this module all three asserted it over pages whose
 *  sections were **empty**:
 *
 *  - `packages/cli/test/commands/wiki.test.ts` ran the real command against
 *    `WikiSectionSources.NotWired`, so what it proved was six empty lists in the
 *    right order.
 *  - `packages/app/src/reading/wiki-page-identity.test.ts` built a page by hand
 *    and checked headings, postures and overlay text — never that the markup
 *    draws an item per item.
 *  - `apps/desktop/e2e/wiki-phrase.spec.ts` seeded a topic with no sources at
 *    all and checked the heading.
 *
 *  Six empty sections satisfy almost any projection, including a deleted one. So
 *  this module is the one fixture with content in **every** section, and the one
 *  wiring that produces it: `wikiPageFixtureSources()` is a real
 *  `WikiSectionSources.Live` over test corpora, so the CLI runs the actual
 *  composer over actual rows rather than being handed a page. The identities
 *  below are what all three suites assert, and they are stated once.
 *
 *  Test-only, and reached through `@bible/core/wiki/testing` for the reason
 *  `phrase-fixture.ts` is: importable across packages is not part of the
 *  product.
 */

import { Effect, Layer, Option, Schema } from 'effect';

import { BibleDatabase, type CrossReference } from '../bible-db/bible-database.js';
import { EGWCommentaryService } from '../egw-commentary/service.js';
import { EGWParagraphDatabase } from '../egw-db/book-database.js';
import type * as EGWSchemas from '../egw/schemas.js';
import { TopicDetail, TopicId, TopicReference, TopicSection } from '../topics/model.js';
import { TopicService } from '../topics/service.js';
import { EGW_SCOPE_AUTHORS } from '../writings/corpus-scope.js';
import { WritingsService } from '../writings/service.js';
import {
  AuthoredCore,
  BlocksJson,
  CitationInline,
  ParagraphBlock,
  TextInline,
  TopicAlias,
  TopicEdge,
  topicSlug,
  WikiPage,
  type WikiSectionKind,
  type WikiSectionLineup,
} from './model.js';
import { normalizeAlias } from './normalize.js';
import { composeSections, WikiSectionSources } from './section-composer.js';

/** The page under test, and the identities every seam asserts.
 *
 *  `sanctuary` because the phrase really occurs in the corpora the desktop e2e
 *  has installed, so the packaged app's FTS produces hits for sections 2 and 4
 *  rather than the e2e having to accept a gap there.
 *
 *  The key verses are John 11's, which is what the Nave's-shaped catalog entry
 *  below points at — the composer takes section 1 from the catalog, and the
 *  three other verse-derived sections (commentary, cross-references) hang off
 *  it, so one set of verses drives four of the six. */
export const WIKI_PAGE_FIXTURE = {
  slug: 'sanctuary',
  title: 'The Sanctuary',
  /** The canonical alias, which is the phrase §6.2's handoff pre-fills and the
   *  FTS behind sections 2 and 4 runs on. */
  phrase: 'sanctuary',
  /** The neighbour section 6 renders, reached over an authored edge. */
  related: { slug: 'day-of-atonement', title: 'Day of Atonement' },
  thesis: 'The sanctuary is the framework of the plan of redemption.',
} satisfies {
  readonly slug: string;
  readonly title: string;
  readonly phrase: string;
  readonly related: { readonly slug: string; readonly title: string };
  readonly thesis: string;
};

const CATALOG_ID = 'naves-topical-bible.sanctuary';

/** The catalog entry section 1 is composed from. Three single verses rather
 *  than a range, so every key verse resolves to text the overlay can light and
 *  to a commentary/cross-reference row below. */
const CATALOG = TopicDetail.make({
  id: Schema.decodeSync(TopicId)(CATALOG_ID),
  name: 'SANCTUARY',
  alternativeNames: [],
  sections: [
    TopicSection.make({
      label: 'General references',
      references: [
        TopicReference.make({ raw: 'Jn 11:1', osis: ['John.11.1'] }),
        TopicReference.make({ raw: 'Jn 11:5', osis: ['John.11.5'] }),
        TopicReference.make({ raw: 'Jn 11:9', osis: ['John.11.9'] }),
      ],
    }),
  ],
});

/** Every key verse carries the fixture phrase, so the overlay has something to
 *  match in section 1 and the identities below are the labels a reader sees. */
const VERSES = [1, 5, 9].map((verse) => ({
  book: 43,
  chapter: 11,
  verse,
  versionCode: 'KJV',
  text: `John 11:${String(verse)} names the sanctuary and its service.`,
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
        previewText: Option.some('In the beginning God made the sanctuary pattern.'),
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
    content: 'The sanctuary above is the great original.',
    puborder: 1,
  },
];

const EGW_AUTHOR = EGW_SCOPE_AUTHORS[0];

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

/** One EGW book and one pioneer book, so sections 2 and 4 fill from **different
 *  corpus scopes** rather than one section standing in for both. `ABSENT` is the
 *  book the thesis cites and the library does not hold, which is what puts a
 *  §6.3 `missingBooks` entry beside section 2's ranked hits. */
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

/** The identities each section renders, in order — one line per item, the line
 *  the reader can point at. Asserted by the CLI suite over the encoded page, by
 *  the app suite over the JSX's own projection, and by the desktop e2e over the
 *  rendered DOM. Stated here so the three cannot drift into agreeing about
 *  different things. */
export type WikiPageFixtureIdentities = Readonly<Record<WikiSectionKind, readonly string[]>>;

/** The identities one lineup carries, read straight off the model.
 *
 *  This is the *wire's* answer to "what does each section name". The app's
 *  `wiki-section-items.ts` derives the same strings from the projection its JSX
 *  maps over, and the desktop e2e reads them out of the rendered DOM — so the
 *  three seams compare their own answer against {@link WIKI_PAGE_FIXTURE_IDENTITIES}
 *  and, through it, against each other. A UI that drew a different field, or
 *  drew nothing, disagrees with this. */
export const wikiSectionIdentities = (sections: WikiSectionLineup): WikiPageFixtureIdentities => ({
  'key-verses': sections[0].items.map((passage) => passage.label),
  'egw-statements': sections[1].items.map((hit) => hit.refcode),
  commentary: sections[2].items.map((entry) => entry.refcode),
  'pioneer-witnesses': sections[3].items.map((hit) => hit.refcode),
  'cross-references': sections[4].items.map((reference) => reference.to.label),
  'related-topics': sections[5].items.map((topic) => topic.title),
});

export const WIKI_PAGE_FIXTURE_IDENTITIES = {
  'key-verses': ['John 11:1', 'John 11:5', 'John 11:9'],
  'egw-statements': ['GC 1.1'],
  commentary: ['5BC 110.1', '5BC 110.1', '5BC 110.1'],
  'pioneer-witnesses': ['DAR 1.1'],
  'cross-references': ['Genesis 1:1'],
  'related-topics': [WIKI_PAGE_FIXTURE.related.title],
} satisfies WikiPageFixtureIdentities;

/** The thesis, encoded as the artifact's `thesis_ast` column holds it.
 *
 *  It cites `ABSENT 12.3` deliberately: the citation is what makes §6.3's
 *  get-this-book affordance render beside section 2, which is a piece of markup
 *  as capable of silently disappearing as the item lists are. */
export const wikiPageFixtureThesis = (): string =>
  Schema.encodeSync(BlocksJson)([
    ParagraphBlock.make({
      content: [
        TextInline.make({ text: `${WIKI_PAGE_FIXTURE.thesis} ` }),
        CitationInline.make({
          text: 'the sanctuary shall be cleansed',
          refcode: 'ABSENT 12.3',
        }),
      ],
    }),
  ]);

export const wikiPageFixtureEmptyBlocks = (): string => Schema.encodeSync(BlocksJson)([]);

/** The artifact rows the fixture page needs, as the statements a caller runs
 *  against an already-created schema.
 *
 *  Rows rather than a `Database` handle, because the two callers open SQLite
 *  through different bindings: the CLI suite runs under Bun and uses
 *  `bun:sqlite`, the Playwright e2e runs under Node and must use `node:sqlite`
 *  (a `bun:` import fails to resolve before its runner starts). Both drivers
 *  take `(sql, params)`, so the rows are portable where a handle would not be —
 *  and the fixture stays one description of one page rather than two that agree
 *  today. */
export interface WikiPageFixtureRow {
  readonly sql: string;
  readonly params: readonly (string | number)[];
}

export const wikiPageFixtureRows = (): readonly WikiPageFixtureRow[] => {
  const topic =
    'INSERT INTO topics (slug, title, thesis_ast, body_ast, position) VALUES (?,?,?,?,?)';
  const empty = wikiPageFixtureEmptyBlocks();
  return [
    {
      sql: topic,
      params: [WIKI_PAGE_FIXTURE.slug, WIKI_PAGE_FIXTURE.title, wikiPageFixtureThesis(), empty, 0],
    },
    // The neighbour section 6 renders. A real row rather than a dangling edge:
    // the composer resolves a related topic's title from the artifact, and an
    // edge to a page that does not exist composes to nothing.
    {
      sql: topic,
      params: [WIKI_PAGE_FIXTURE.related.slug, WIKI_PAGE_FIXTURE.related.title, empty, empty, 1],
    },
    {
      sql: 'INSERT INTO topic_aliases (alias, display, slug, canonical) VALUES (?,?,?,?)',
      params: [
        normalizeAlias(WIKI_PAGE_FIXTURE.phrase),
        WIKI_PAGE_FIXTURE.phrase,
        WIKI_PAGE_FIXTURE.slug,
        1,
      ],
    },
    {
      sql: 'INSERT INTO topic_edges (from_slug, to_slug, kind, position) VALUES (?,?,?,?)',
      params: [WIKI_PAGE_FIXTURE.slug, WIKI_PAGE_FIXTURE.related.slug, 'authored', 0],
    },
    {
      sql: 'INSERT INTO topic_catalog_keys (slug, catalog_id, matched_by) VALUES (?,?,?)',
      params: [WIKI_PAGE_FIXTURE.slug, CATALOG_ID, 'override'],
    },
  ];
};

/** The artifact schema every seam writes the rows into. The DDL a compiled
 *  artifact carries — stated once here rather than pasted into each suite, which
 *  is how a column added by the compiler comes to be missing from three
 *  fixtures. */
export const WIKI_ARTIFACT_DDL = `
  CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE topics (slug TEXT PRIMARY KEY, title TEXT NOT NULL, thesis_ast TEXT NOT NULL, body_ast TEXT NOT NULL, position INTEGER NOT NULL);
  CREATE TABLE topic_aliases (alias TEXT PRIMARY KEY, display TEXT NOT NULL, slug TEXT NOT NULL, canonical INTEGER NOT NULL);
  CREATE TABLE topic_edges (from_slug TEXT NOT NULL, to_slug TEXT NOT NULL, kind TEXT NOT NULL, position INTEGER NOT NULL, PRIMARY KEY (from_slug, to_slug, kind));
  CREATE TABLE topic_catalog_keys (slug TEXT PRIMARY KEY, catalog_id TEXT NOT NULL, matched_by TEXT NOT NULL);
  INSERT INTO meta (key, value) VALUES ('schema_major', '1');
`;

/** The wired sources that turn the artifact above into a page with content in
 *  every section.
 *
 *  `WikiSectionSources.Live` over test databases — the production composition,
 *  not a stub of it — so a suite that provides this runs the real composer. The
 *  CLI suite provides it in place of `NotWired`, which is the whole of what made
 *  its assertions vacuous. */
export const WIKI_PAGE_FIXTURE_SOURCES: Layer.Layer<WikiSectionSources> =
  WikiSectionSources.Live.pipe(
    Layer.provide(TopicService.Test([CATALOG])),
    Layer.provide(BibleDatabase.layerTest({ verses: VERSES, crossRefs: CROSS_REFS })),
    Layer.provide(EGWCommentaryService.Test({ entries: COMMENTARY })),
    Layer.provide(
      WritingsService.Live.pipe(
        Layer.provide(EGWParagraphDatabase.Test({ books: BOOKS, paragraphs: PARAGRAPHS })),
      ),
    ),
  );

/** The fixture page, composed by the **real composer** over the same sources,
 *  without a SQLite file.
 *
 *  `WikiService` reaches the composer through an artifact; that path is what the
 *  CLI suite exercises, and it needs `bun:sqlite`. `packages/app` has no SQL
 *  dependency and must not grow one to assert what its own JSX draws — so this
 *  is the same composition one layer down: `composeSections` over
 *  `wikiPageFixtureSources`, with the two artifact reads the composer takes as
 *  closures (`titleOf`, `backlinksTo`) answered from the fixture's own rows.
 *
 *  The two paths cannot silently diverge: the CLI suite asserts its
 *  artifact-composed page against {@link WIKI_PAGE_FIXTURE_IDENTITIES}, and the
 *  app suite asserts this one against the same table. A change that moved one
 *  and not the other fails on whichever side it landed. */
export const WIKI_PAGE_FIXTURE_PAGE: Effect.Effect<WikiPage> = Effect.gen(function* () {
  const sourcing = yield* WikiSectionSources;
  if (sourcing._tag === 'not-wired') {
    return yield* Effect.die('the fixture must be composed over wired sources');
  }
  const core = AuthoredCore.make({
    thesis: [
      ParagraphBlock.make({
        content: [
          TextInline.make({ text: `${WIKI_PAGE_FIXTURE.thesis} ` }),
          CitationInline.make({
            text: 'the sanctuary shall be cleansed',
            refcode: 'ABSENT 12.3',
          }),
        ],
      }),
    ],
    body: [],
    aliases: [
      TopicAlias.make({
        alias: normalizeAlias(WIKI_PAGE_FIXTURE.phrase),
        display: WIKI_PAGE_FIXTURE.phrase,
        canonical: true,
      }),
    ],
    edges: [
      TopicEdge.make({
        slug: topicSlug(WIKI_PAGE_FIXTURE.related.slug),
        kind: 'authored',
      }),
    ],
  });
  const sections = yield* composeSections(sourcing.sources, {
    slug: topicSlug(WIKI_PAGE_FIXTURE.slug),
    title: WIKI_PAGE_FIXTURE.title,
    core: Option.some(core),
    catalogId: Option.some(CATALOG.id),
    // The artifact's `topics` table, as the two rows the fixture writes.
    titleOf: (slug) => {
      if (String(slug) !== WIKI_PAGE_FIXTURE.related.slug) return Effect.succeed(Option.none());
      return Effect.succeed(Option.some(WIKI_PAGE_FIXTURE.related.title));
    },
    // No page points *at* the fixture, so section 6 is the authored edge
    // alone — the same list the artifact produces, where the reverse edge is
    // likewise absent.
    backlinksTo: () => Effect.succeed([]),
  });
  return WikiPage.make({
    slug: topicSlug(WIKI_PAGE_FIXTURE.slug),
    title: WIKI_PAGE_FIXTURE.title,
    status: 'flagship',
    core: Option.some(core),
    sections,
    unavailable: Option.none(),
    sectionsUnavailable: Option.none(),
  });
}).pipe(Effect.provide(WIKI_PAGE_FIXTURE_SOURCES));

/** The catalog the fixture's `topic_catalog_keys` row points at. A suite that
 *  resolves `WikiService` has to provide `TopicService` beside the sources, and
 *  it must be **this** catalog — the composer reads section 1 from it, and a
 *  different one would leave the page's key verses empty while every other
 *  section filled. */
export const WIKI_PAGE_FIXTURE_CATALOG: Layer.Layer<TopicService> = TopicService.Test([CATALOG]);
