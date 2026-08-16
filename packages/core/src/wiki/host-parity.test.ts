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
import { Effect, FileSystem, Layer, Option, Schema, Stream, type Scope } from 'effect';
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
import { BibleService } from '../bible/service.js';
import { DEFAULT_READING_PREFERENCES } from '../reading-preferences/model.js';
import {
  DataPortabilityRuntime,
  LibraryStateRuntime,
  ProcedureRuntime,
  ReadingContinuityRuntime,
  ReadingPreferencesRuntime,
  WritingsLibraryRuntime,
} from '../procedure/services.js';
import {
  CommitId,
  CURRENT_PROTOCOL_VERSION,
  CURRENT_RUNTIME_SCHEMA_VERSION,
  RuntimeConnection,
  RuntimeGeneration,
} from '../procedure/model.js';
import {
  BlocksJson,
  CitationInline,
  ParagraphBlock,
  TextInline,
  topicSlug,
  WikiPageJson,
} from './model.js';
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
  database
    .prepare('INSERT INTO topic_aliases (alias, display, slug, canonical) VALUES (?, ?, ?, ?)')
    .run('sanctuary', 'sanctuary', 'sanctuary', 1);
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

/** Everything `BibleProcedureHandlers` needs beyond the wiki. Stubbed flat,
 *  because none of it is what is under comparison — the handler layer is the
 *  *real* one, and the only interesting service inside it is the same
 *  `WikiService` the CLI half resolves. */
const otherProcedureDependencies = Layer.mergeAll(
  BibleService.Test({ books: [], chapters: new Map(), searchHits: [] }),
  WritingsService.Live.pipe(
    Layer.provide(EGWParagraphDatabase.Test({ books: BOOKS, paragraphs: PARAGRAPHS })),
  ),
  Layer.succeed(
    WritingsLibraryRuntime,
    WritingsLibraryRuntime.of({
      get: Effect.succeed([]),
      download: () => Effect.die('not exercised'),
      downloadAll: Effect.succeed([]),
    }),
  ),
  Layer.succeed(
    ProcedureRuntime,
    ProcedureRuntime.of({
      connect: () =>
        Effect.succeed(
          RuntimeConnection.make({
            protocolVersion: CURRENT_PROTOCOL_VERSION,
            schemaVersion: CURRENT_RUNTIME_SCHEMA_VERSION,
            generation: Schema.decodeSync(RuntimeGeneration)('parity-runtime'),
            capabilities: [],
          }),
        ),
      events: () => Stream.empty,
    }),
  ),
  Layer.succeed(
    ReadingContinuityRuntime,
    ReadingContinuityRuntime.of({
      get: Effect.succeedNone,
      record: () =>
        Effect.succeed({
          _tag: 'MutationCommit',
          value: {},
          commitId: Schema.decodeSync(CommitId)('parity-continuity'),
          changes: { scopes: [] },
        }),
    }),
  ),
  Layer.succeed(
    ReadingPreferencesRuntime,
    ReadingPreferencesRuntime.of({
      get: Effect.succeed(DEFAULT_READING_PREFERENCES),
      patch: () =>
        Effect.succeed({
          _tag: 'MutationCommit',
          value: DEFAULT_READING_PREFERENCES,
          commitId: Schema.decodeSync(CommitId)('parity-preferences'),
          changes: { scopes: [] },
        }),
    }),
  ),
  Layer.succeed(
    LibraryStateRuntime,
    LibraryStateRuntime.of({
      annotations: () =>
        Effect.succeed({ bookmarks: [], notes: [], markers: [], crossReferences: [] }),
      collections: Effect.succeed([]),
      readingPlans: Effect.succeed([]),
      memoryPractice: Effect.succeed({ verses: [], history: [] }),
      mutate: () =>
        Effect.succeed({
          _tag: 'MutationCommit',
          value: {},
          commitId: Schema.decodeSync(CommitId)('parity-library'),
          changes: { scopes: [] },
        }),
    }),
  ),
  Layer.succeed(
    DataPortabilityRuntime,
    DataPortabilityRuntime.of({
      export: Effect.succeed('{}'),
      import: () => Effect.succeed({ imported: 1 }),
    }),
  ),
);

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
      const overRpc = yield* Effect.gen(function* () {
        const client = yield* RpcTest.makeClient(BibleProcedureGroup);
        return yield* client['v1.wiki.topic.get']({ slug });
      }).pipe(
        Effect.provide(
          BibleProcedureHandlers.pipe(
            Layer.provide(
              Layer.mergeAll(wikiLayer, TopicService.Test([CATALOG]), otherProcedureDependencies),
            ),
          ),
        ),
      );

      // Seam 2 — the CLI, calling `WikiService` directly.
      const overCli = yield* Effect.gen(function* () {
        const service = yield* WikiService;
        return yield* service.topic(slug);
      }).pipe(Effect.provide(wikiLayer));

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
});
