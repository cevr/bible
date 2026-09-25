/**
 * Tests for EGW Paragraph Database
 *
 * Uses unique temp files for database isolation between tests.
 */

import { BunServices } from '@effect/platform-bun';
import { Database } from 'bun:sqlite';
import { describe, expect, it } from 'effect-bun-test';
import {
  Array as Arr,
  ConfigProvider,
  Effect,
  FileSystem,
  Layer,
  Option,
  Predicate,
  Result,
  Stream,
} from 'effect';

import { Reference as BibleReference } from '../bible/model.js';
import {
  assetSourceId,
  corpusDigest,
  corpusRevision,
  CorpusProvenance,
} from '../corpus-supply/model.js';
import type { Book, Paragraph } from '../egw/schemas.js';
import {
  ArchivedBibleReference,
  ArchivedParagraph,
  PublicationArchive,
} from '../writings/archive.js';
import {
  Paragraph as WritingsParagraph,
  Publication,
  Reference as WritingsReference,
  publicationCode,
  publicationId,
  publicationOrder,
} from '../writings/model.js';
import {
  EGWParagraphDatabase,
  FTS_TERM_CONJUNCTION,
  paragraphIdentity,
  ParagraphDataIntegrityError,
} from './book-database.js';
import * as EGWDbBun from './book-database-bun.js';

// Wire-shape fields the schema encodes as `null` when absent.
const wireNull = Option.getOrNull(Option.none<never>());

// Helper to run scoped effects in tests with fresh database
const runTestAt = <A, E, R>(
  dbPath: string,
  effect: Effect.Effect<A, E, EGWParagraphDatabase | R>,
) => {
  const provider = ConfigProvider.make((path) => {
    if (path.join('_') === 'EGW_PARAGRAPH_DB') {
      return Effect.succeed(ConfigProvider.makeValue(dbPath));
    }
    return Effect.undefined;
  });

  const TestLayer = Layer.fresh(EGWDbBun.Default).pipe(
    Layer.provide(BunServices.layer),
    Layer.provide(ConfigProvider.layer(provider)),
  );
  return effect.pipe(Effect.provide(TestLayer), Effect.scoped);
};

const runTestWithPath = <A, E, R>(
  makeEffect: (dbPath: string) => Effect.Effect<A, E, EGWParagraphDatabase | R>,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const directory = yield* fs.makeTempDirectoryScoped({ prefix: 'egw-database-' });
    const dbPath = `${directory}/egw.db`;
    return yield* runTestAt(dbPath, makeEffect(dbPath));
  });

const runTest = <A, E, R>(effect: Effect.Effect<A, E, EGWParagraphDatabase | R>) =>
  runTestWithPath(() => effect);

// Helper to create a mock book
const mockBook = (id: number, code: string): Book => ({
  book_id: id,
  code,
  title: `Test Book ${code}`,
  author: 'Ellen Gould White',
  lang: 'en',
  pub_year: '1900',
  type: 'book',
  folder_id: 1,
  cover: {},
  files: {},
  permission_required: 'public',
  sort: 1,
  is_audiobook: false,
  nelements: 100,
  npages: 100,
});

// Helper to create a mock paragraph
const mockParagraph = (puborder: number, refcodeShort: string): Paragraph => ({
  para_id: Option.some(`para-${puborder}`),
  id_prev: wireNull,
  id_next: wireNull,
  refcode_1: wireNull,
  refcode_2: wireNull,
  refcode_3: wireNull,
  refcode_4: wireNull,
  refcode_short: Option.some(refcodeShort),
  refcode_long: `Long ${refcodeShort}`,
  element_type: 'paragraph',
  element_subtype: wireNull,
  nodes: [{ _tag: 'Text', text: `Content for ${refcodeShort}` }],
  puborder,
});

const mockArchive = (refcodes: readonly string[]): PublicationArchive => {
  const id = publicationId(9001);
  const code = publicationCode('TEST');
  const paragraphs = refcodes.map((refcode, index) => {
    const paragraph = WritingsParagraph.make({
      reference: WritingsReference.paragraph(id, `paragraph-${String(index + 1)}`),
      publicationCode: code,
      order: publicationOrder(index + 1),
      page: Option.none(),
      number: Option.none(),
      refcode: Option.some(refcode),
      nodes: [{ _tag: 'Text', text: `Content for ${refcode}` }],
      elementType: Option.some('paragraph'),
      elementSubtype: Option.none(),
    });
    return ArchivedParagraph.make({ refcode, paragraph, isHeading: false });
  });
  let bibleReferences: readonly ArchivedBibleReference[] = [];
  const firstRefcode = refcodes[0];
  if (Predicate.isNotUndefined(firstRefcode)) {
    bibleReferences = [
      ArchivedBibleReference.make({
        paragraphRefcode: firstRefcode,
        scripture: BibleReference.verse(1, 1, 1),
      }),
    ];
  }
  return PublicationArchive.make({
    publication: Publication.make({
      id,
      code,
      title: 'Test Publication',
      author: 'Test Author',
      paragraphCount: Option.some(refcodes.length),
    }),
    paragraphs,
    bibleReferences,
  });
};

/** An archive that reproduces the corpus's real identity shape: `para_id` from
 *  the paragraph reference and `ref_code` from the archived refcode, so two
 *  paragraphs may share a `refcode_short` while staying distinct rows.
 *
 *  `mockArchive` cannot express it — it derives one refcode per paragraph — and
 *  `storeParagraphsBatch` cannot either, because its `ref_code` prefers
 *  `refcode_short` and the two rows would upsert onto each other. */
const collidingArchive = (
  rows: readonly {
    readonly paragraphId: string;
    readonly refcode: string;
    readonly text: string;
  }[],
): PublicationArchive => {
  const id = publicationId(9101);
  const code = publicationCode('2ChS');
  const paragraphs = rows.map((row, index) =>
    ArchivedParagraph.make({
      // The row's own `ref_code`: distinct per paragraph, as in the corpus.
      refcode: row.paragraphId,
      paragraph: WritingsParagraph.make({
        reference: WritingsReference.paragraph(id, row.paragraphId),
        publicationCode: code,
        order: publicationOrder(index + 1),
        page: Option.none(),
        number: Option.none(),
        // The shared `refcode_short` — the collision itself.
        refcode: Option.some(row.refcode),
        nodes: [{ _tag: 'Text', text: row.text }],
        elementType: Option.some('paragraph'),
        elementSubtype: Option.none(),
      }),
      isHeading: false,
    }),
  );
  return PublicationArchive.make({
    publication: Publication.make({
      id,
      code,
      title: 'Second Christian Series',
      author: 'Ellen Gould White',
      paragraphCount: Option.some(rows.length),
    }),
    paragraphs,
    bibleReferences: [],
  });
};

describe('EGWParagraphDatabase', () => {
  const test = it.scopedLive.layer(BunServices.layer);
  describe('canonical publication installation', () => {
    test('persists Provenance atomically and derives readiness from exact identity', () =>
      runTest(
        Effect.gen(function* () {
          const db = yield* EGWParagraphDatabase;
          const provenance = CorpusProvenance.make({
            source: assetSourceId('fixture'),
            revision: corpusRevision('2'),
            digest: Option.some(corpusDigest(`sha256:${'a'.repeat(64)}`)),
          });
          yield* db.installPublicationArchive(mockArchive(['TEST 1.1']), provenance);

          const status = Option.getOrThrow(yield* db.getSyncStatus(9001));
          expect(status).toMatchObject({
            source: 'fixture',
            revision: '2',
            digest: `sha256:${'a'.repeat(64)}`,
          });
          expect(yield* db.needsSync(9001, provenance)).toBe(false);
          expect(
            yield* db.needsSync(
              9001,
              CorpusProvenance.make({
                source: provenance.source,
                revision: corpusRevision('3'),
                digest: provenance.digest,
              }),
            ),
          ).toBe(true);
        }),
      ));

    test('atomically replaces one publication and activates its verified counts', () =>
      runTest(
        Effect.gen(function* () {
          const db = yield* EGWParagraphDatabase;
          yield* db.installPublicationArchive(mockArchive(['TEST 1.1', 'TEST 1.2']));
          yield* db.installPublicationArchive(mockArchive(['TEST 2.1']));

          const paragraphs = yield* Stream.runCollect(db.getParagraphsByBook(9001));
          const references = yield* db.getBibleRefsByBook(9001);
          const status = yield* db.getSyncStatus(9001);

          expect(paragraphs).toHaveLength(1);
          expect(Option.getOrThrow(paragraphs[0]!.refcode_short)).toBe('TEST 2.1');
          expect(references).toHaveLength(1);
          expect(Option.getOrThrow(status).status).toBe('success');
          expect(Option.getOrThrow(status).paragraph_count).toBe(1);
        }),
      ));

    test('rejects a malformed contribution before replacing the active publication', () =>
      runTest(
        Effect.gen(function* () {
          const db = yield* EGWParagraphDatabase;
          yield* db.installPublicationArchive(mockArchive(['TEST 1.1']));
          const invalid = mockArchive(['TEST 2.1']);
          const result = yield* Effect.result(
            db.installPublicationArchive(
              PublicationArchive.make({
                publication: invalid.publication,
                paragraphs: invalid.paragraphs,
                bibleReferences: [
                  ArchivedBibleReference.make({
                    paragraphRefcode: 'TEST missing',
                    scripture: BibleReference.chapter(1, 1),
                  }),
                ],
              }),
            ),
          );

          expect(Result.isFailure(result)).toBe(true);
          const paragraphs = yield* Stream.runCollect(db.getParagraphsByBook(9001));
          expect(paragraphs).toHaveLength(1);
          expect(Option.getOrThrow(paragraphs[0]!.refcode_short)).toBe('TEST 1.1');
        }),
      ));
  });

  describe('chapter heading detection', () => {
    test('detects h1-h6 elements as chapter headings', () =>
      runTest(
        Effect.gen(function* () {
          const db = yield* EGWParagraphDatabase;
          const book = mockBook(99998, 'CHAPTEST');

          const paragraphs: Paragraph[] = [
            { ...mockParagraph(1, 'CHAPTEST 1'), element_type: 'h1' },
            { ...mockParagraph(2, 'CHAPTEST 1.1'), element_type: 'p' },
            { ...mockParagraph(3, 'CHAPTEST 2'), element_type: 'h3' },
          ];

          yield* db.storeParagraphsBatch(paragraphs, book);
          const chapters = yield* db.getChapterHeadings(99998);

          expect(chapters.length).toBe(2);
          expect(chapters[0]?.element_type).toBe('h1');
          expect(chapters[1]?.element_type).toBe('h3');
        }),
      ));
  });

  describe('sync status', () => {
    test('sets and gets sync status for a book', () =>
      runTest(
        Effect.gen(function* () {
          const db = yield* EGWParagraphDatabase;

          // Initially no status
          const initial = yield* db.getSyncStatus(1);
          expect(Option.isNone(initial)).toBe(true);

          // Set pending status
          yield* db.setSyncStatus(1, 'PP', 'pending', 0);
          const pending = yield* db.getSyncStatus(1);
          expect(Option.isSome(pending)).toBe(true);
          if (Option.isSome(pending)) {
            expect(pending.value.status).toBe('pending');
          }

          // Update to success
          yield* db.setSyncStatus(1, 'PP', 'success', 100);
          const success = yield* db.getSyncStatus(1);
          expect(Option.isSome(success)).toBe(true);
          if (Option.isSome(success)) {
            expect(success.value.status).toBe('success');
            expect(success.value.paragraph_count).toBe(100);
          }
        }),
      ));

    test('sets error message on failed status', () =>
      runTest(
        Effect.gen(function* () {
          const db = yield* EGWParagraphDatabase;

          yield* db.setSyncStatus(2, 'GC', 'failed', 0, 'API timeout');
          const status = yield* db.getSyncStatus(2);

          expect(Option.isSome(status)).toBe(true);
          if (Option.isSome(status)) {
            expect(status.value.status).toBe('failed');
            expect(status.value.error_message).toBe('API timeout');
          }
        }),
      ));

    test('gets books by status', () =>
      runTest(
        Effect.gen(function* () {
          const db = yield* EGWParagraphDatabase;

          yield* db.setSyncStatus(10, 'DA', 'success', 500);
          yield* db.setSyncStatus(11, 'PP', 'success', 600);
          yield* db.setSyncStatus(12, 'GC', 'failed', 0, 'Error');
          yield* db.setSyncStatus(13, '1BC', 'pending', 0);

          const successful = yield* db.getBooksByStatus('success');
          expect(successful.length).toBe(2);
          expect(successful.map((s) => s.book_code).sort()).toEqual(['DA', 'PP']);

          const failed = yield* db.getBooksByStatus('failed');
          expect(failed.length).toBe(1);
          expect(failed[0]?.book_code).toBe('GC');

          const pending = yield* db.getBooksByStatus('pending');
          expect(pending.length).toBe(1);
          expect(pending[0]?.book_code).toBe('1BC');
        }),
      ));

    test('gets all sync statuses', () =>
      runTest(
        Effect.gen(function* () {
          const db = yield* EGWParagraphDatabase;

          yield* db.setSyncStatus(20, 'AA', 'success', 100);
          yield* db.setSyncStatus(21, 'BB', 'failed', 0, 'Error');
          yield* db.setSyncStatus(22, 'CC', 'pending', 0);

          const all = yield* db.getAllSyncStatus;
          expect(all.length).toBe(3);
        }),
      ));

    test('needsSync returns true for non-success books', () =>
      runTest(
        Effect.gen(function* () {
          const db = yield* EGWParagraphDatabase;

          // Never synced - needs sync
          const needsNew = yield* db.needsSync(999);
          expect(needsNew).toBe(true);

          // Pending - needs sync
          yield* db.setSyncStatus(30, 'TEST1', 'pending', 0);
          const needsPending = yield* db.needsSync(30);
          expect(needsPending).toBe(true);

          // Failed - needs sync
          yield* db.setSyncStatus(31, 'TEST2', 'failed', 0, 'Error');
          const needsFailed = yield* db.needsSync(31);
          expect(needsFailed).toBe(true);

          // Success - does not need sync
          yield* db.setSyncStatus(32, 'TEST3', 'success', 100);
          const needsSuccess = yield* db.needsSync(32);
          expect(needsSuccess).toBe(false);
        }),
      ));
  });

  describe('corpus scope and rank (§6.4)', () => {
    /** Two books by Ellen White, two by pioneers, all matching the same query.
     *  Both scopes are non-empty in the unscoped result, so a filter that did
     *  nothing would be visible immediately. */
    const scopedCorpus = Effect.fn('scopedCorpus')(function* () {
      const db = yield* EGWParagraphDatabase;
      const authored = [
        { id: 201, code: 'SCOPEGC', author: 'Ellen Gould White' },
        { id: 202, code: 'SCOPEEST', author: 'Ellen G. White Estate' },
        { id: 203, code: 'SCOPEDAR', author: 'Uriah Smith' },
        { id: 204, code: 'SCOPEJVH', author: 'Joshua V. Himes' },
      ];
      for (const entry of authored) {
        yield* db.storeParagraphsBatch(
          [
            {
              ...mockParagraph(1, `${entry.code} 1.1`),
              nodes: [{ _tag: 'Text', text: 'sanctuary doctrine' }],
            },
          ],
          { ...mockBook(entry.id, entry.code), author: entry.author },
        );
      }
      return db;
    });

    test('narrows the corpus by author and partitions it exactly', () =>
      runTest(
        Effect.gen(function* () {
          const db = yield* scopedCorpus();
          const codes = (hits: readonly { readonly bookCode: string }[]): string[] =>
            hits.map((hit) => hit.bookCode).toSorted();

          const all = yield* db.searchParagraphs('sanctuary', { limit: 50 });
          const egw = yield* db.searchParagraphs('sanctuary', { limit: 50, scope: 'egw' });
          const pioneer = yield* db.searchParagraphs('sanctuary', { limit: 50, scope: 'pioneer' });

          expect(codes(all)).toEqual(['SCOPEDAR', 'SCOPEEST', 'SCOPEGC', 'SCOPEJVH']);
          // Ellen White and the White Estate, and nothing else.
          expect(codes(egw)).toEqual(['SCOPEEST', 'SCOPEGC']);
          // The complement, not a curated allow-list: every author who is not
          // Ellen White is a pioneer witness.
          expect(codes(pioneer)).toEqual(['SCOPEDAR', 'SCOPEJVH']);
          // The partition is exact — the two halves reconstruct the whole and
          // overlap nowhere, which no pair of independent filters would.
          expect([...codes(egw), ...codes(pioneer)].toSorted()).toEqual(codes(all));
          // Omitting the scope means the whole corpus, so every pre-§6.4 caller
          // keeps the behavior it was written against.
          expect(codes(yield* db.searchParagraphs('sanctuary', { limit: 50 }))).toEqual(codes(all));
        }),
      ));

    test('combines the corpus scope with a book filter', () =>
      runTest(
        Effect.gen(function* () {
          const db = yield* scopedCorpus();
          // Both filters apply: a book outside the scope yields nothing rather
          // than one of them silently winning.
          expect(
            yield* db.searchParagraphs('sanctuary', { bookCode: 'SCOPEGC', scope: 'egw' }),
          ).toHaveLength(1);
          expect(
            yield* db.searchParagraphs('sanctuary', { bookCode: 'SCOPEGC', scope: 'pioneer' }),
          ).toHaveLength(0);
        }),
      ));

    test('counts every match under the same predicate, past the row cap', () =>
      runTest(
        Effect.gen(function* () {
          const db = yield* scopedCorpus();
          // The whole point of a separate statement: the row query stops at the
          // cap, so its length can never report the tail. §6.1's `total` means
          // the pre-cap count, and a "show all" affordance that only ever sees
          // `limit` rows is an affordance that never appears.
          const capped = yield* db.searchParagraphs('sanctuary', { limit: 1 });
          expect(capped).toHaveLength(1);
          expect(yield* db.countSearchParagraphs('sanctuary')).toBe(4);
          // The same filters, or it is counting something else. Both scopes and
          // the book filter have to move the count exactly as they move the rows.
          expect(yield* db.countSearchParagraphs('sanctuary', { scope: 'egw' })).toBe(2);
          expect(yield* db.countSearchParagraphs('sanctuary', { scope: 'pioneer' })).toBe(2);
          expect(
            yield* db.countSearchParagraphs('sanctuary', { bookCode: 'SCOPEGC', scope: 'pioneer' }),
          ).toBe(0);
        }),
      ));

    test('returns hits in FTS rank order, best first, and caps to the best N', () =>
      runTest(
        Effect.gen(function* () {
          const db = yield* EGWParagraphDatabase;
          // BM25 rewards term density, so the shortest paragraph containing the
          // term ranks best. Inserted worst-first, so an unordered query would
          // return them in exactly the reverse of the expected order — the
          // pre-§6.4 behavior this test exists to rule out.
          const texts = [
            { refcode: 'RANK 3.1', text: `sanctuary ${'filler word '.repeat(60)}` },
            { refcode: 'RANK 2.1', text: `sanctuary ${'filler word '.repeat(20)}` },
            { refcode: 'RANK 1.1', text: 'sanctuary' },
          ];
          yield* db.storeParagraphsBatch(
            texts.map((entry, index) => ({
              ...mockParagraph(index + 1, entry.refcode),
              nodes: [{ _tag: 'Text', text: entry.text }],
            })),
            mockBook(210, 'RANK'),
          );

          const ranked = yield* db.searchParagraphs('sanctuary', { limit: 10 });
          expect(ranked.map((hit) => Option.getOrElse(hit.refcode_short, () => ''))).toEqual([
            'RANK 1.1',
            'RANK 2.1',
            'RANK 3.1',
          ]);
          // The cap selects the best N rather than an arbitrary N: without an
          // `ORDER BY` the limit would take whichever rows the join reached
          // first, which is insertion order here.
          //
          // Both statements order by `bm25(paragraphs_fts)` rather than the
          // bare `rank`, which is the same ranking by a cheaper code path (see
          // the statement comment; ~14% of the lexical leg). This assertion is
          // what makes that swap safe to keep: the expected order above is
          // BM25's, so reverting to `rank` must not change it and neither may
          // any future reshaping of the statement.
          const capped = yield* db.searchParagraphs('sanctuary', { limit: 2 });
          expect(capped.map((hit) => Option.getOrElse(hit.refcode_short, () => ''))).toEqual([
            'RANK 1.1',
            'RANK 2.1',
          ]);
          // Stable: the same query returns the same order every time.
          const again = yield* db.searchParagraphs('sanctuary', { limit: 10 });
          expect(again.map((hit) => Option.getOrElse(hit.refcode_short, () => ''))).toEqual(
            ranked.map((hit) => Option.getOrElse(hit.refcode_short, () => '')),
          );
        }),
      ));

    // §9's lexical leg reads scores, which no other query returns — so it is
    // its own statement against the real schema, and the only place a wrong
    // column name shows up. The service degrades on a failed leg by design
    // (§9.6), so a broken statement here surfaces as "no results" rather than
    // as an error, and every fixture-backed test still passes.
    test('returns BM25 scores over the real schema', () =>
      runTest(
        Effect.gen(function* () {
          const db = yield* EGWParagraphDatabase;
          yield* db.storeParagraphsBatch(
            [
              {
                ...mockParagraph(1, 'SCORED 1.1'),
                nodes: [{ _tag: 'Text', text: 'the sanctuary in heaven' }],
              },
              {
                ...mockParagraph(2, 'SCORED 2.1'),
                nodes: [{ _tag: 'Text', text: 'a sanctuary' }],
              },
            ],
            mockBook(220, 'SCORED'),
          );

          const scored = yield* db.searchScoredParagraphs('sanctuary', { limit: 10 });
          expect(scored.length).toBeGreaterThan(0);

          const first = Arr.get(scored, 0);
          if (Option.isNone(first)) return;
          // The three things §9.4 needs from a row and no other query supplies:
          // the book identity it fuses on, the decoded text it snippets, and a
          // rank to compare. FTS5's `rank` is a negative BM25, so a positive
          // value would mean the column is not what this code thinks it is.
          expect(first.value.bookCode).toBe('SCORED');
          expect(first.value.rank).toBeLessThan(0);
          expect(first.value.nodes.length).toBeGreaterThan(0);

          // Ordered best-first, which is what the short-circuit reads.
          const ranks = scored.map((row) => row.rank);
          expect([...ranks].sort((left, right) => left - right)).toEqual(ranks);
        }),
      ));

    // §9.2's join key. The live corpus has 961,750 non-empty EGW-scope rows but
    // only 944,672 distinct `book:refcode` pairs, so keying the index on the
    // refcode would silently point 17,078 paragraphs at another paragraph's
    // vector. `para_id` is distinct on all 3,012,004 rows.
    test('scores carry a paragraph identity that separates same-refcode rows', () =>
      runTest(
        Effect.gen(function* () {
          const db = yield* EGWParagraphDatabase;
          // The corpus's own shape, taken from a real collision: book `2ChS`
          // gives two distinct paragraphs the same `refcode_short` "2ChS 321"
          // and distinct `ref_code`/`para_id` (14879.1475, 14879.1476). Keying
          // on the refcode maps both onto one id; keying on `para_id` does not.
          yield* db.installPublicationArchive(
            collidingArchive([
              { paragraphId: '14879.1475', refcode: '2ChS 321', text: 'the sanctuary first' },
              { paragraphId: '14879.1476', refcode: '2ChS 321', text: 'the sanctuary second' },
            ]),
          );

          const scored = yield* db.searchScoredParagraphs('sanctuary', { limit: 10 });
          expect(scored).toHaveLength(2);
          // Both rows report the one refcode the corpus gives them...
          expect(
            new Set(scored.map((row) => Option.getOrElse(row.refcode_short, () => ''))),
          ).toEqual(new Set(['2ChS 321']));
          // ...and two distinct identities, which is the whole point.
          const identities = scored.map((row) => row.para_id);
          expect(new Set(identities).size).toBe(2);
          expect([...identities].sort()).toEqual(['2ChS:14879.1475', '2ChS:14879.1476']);
        }),
      ));

    // Search reads a book's outline to demote back matter: the `h1`–`h3`
    // headings, and each hit's closest heading of any level. Both statements
    // are SQL the double cannot prove (a JSON parameter and a backward seek).
    test('reads a book outline and the nearest heading of each position', () =>
      runTest(
        Effect.gen(function* () {
          const db = yield* EGWParagraphDatabase;
          const id = publicationId(9102);
          const code = publicationCode('OUT');
          const rows = [
            { element: 'h1', text: 'The Book' },
            { element: 'h2', text: 'Appendix' },
            { element: 'p', text: 'appendix prose' },
            { element: 'h4', text: 'L' },
            { element: 'p', text: 'Latter rain, 178, 300' },
          ];
          yield* db.installPublicationArchive(
            PublicationArchive.make({
              publication: Publication.make({
                id,
                code,
                title: 'Outline',
                author: 'Ellen Gould White',
                paragraphCount: Option.some(rows.length),
              }),
              paragraphs: rows.map((row, index) =>
                ArchivedParagraph.make({
                  refcode: `OUT ${String(index + 1)}`,
                  paragraph: WritingsParagraph.make({
                    reference: WritingsReference.paragraph(id, `out-${String(index + 1)}`),
                    publicationCode: code,
                    order: publicationOrder(index + 1),
                    page: Option.none(),
                    number: Option.none(),
                    refcode: Option.some(`OUT ${String(index + 1)}`),
                    nodes: [{ _tag: 'Text', text: row.text }],
                    elementType: Option.some(row.element),
                    elementSubtype: Option.none(),
                  }),
                  isHeading: row.element !== 'p',
                }),
              ),
              bibleReferences: [],
            }),
          );

          const outline = yield* db.getSectionHeadings([9102]);
          expect(
            outline
              .toSorted((a, b) => a.puborder - b.puborder)
              .map((heading) => [heading.puborder, heading.level, heading.title]),
          ).toEqual([
            [1, 1, 'The Book'],
            [2, 2, 'Appendix'],
          ]);

          const nearest = yield* db.getNearestHeadings([
            { publicationId: 9102, puborder: 3 },
            { publicationId: 9102, puborder: 5 },
            { publicationId: 9102, puborder: 0 },
          ]);
          expect(
            nearest
              .toSorted((a, b) => a.puborder - b.puborder)
              .map((entry) => [entry.puborder, entry.heading.puborder, entry.heading.level]),
          ).toEqual([
            [3, 2, 2],
            [5, 4, 4],
          ]);
          expect(yield* db.getNearestHeadings([])).toEqual([]);
        }),
      ));

    // §9.4's fusion ranks ids from two legs, and the vector leg returns ids the
    // lexical leg never saw. Without this lookup those ids have no row and are
    // dropped, which removes the recall hybrid search exists to buy.
    test('fetches rows for identities FTS never matched', () =>
      runTest(
        Effect.gen(function* () {
          const db = yield* EGWParagraphDatabase;
          yield* db.installPublicationArchive(
            collidingArchive([
              { paragraphId: 'vonly-1', refcode: '2ChS 1', text: 'about celestial mechanics' },
              { paragraphId: 'vonly-2', refcode: '2ChS 2', text: 'about husbandry' },
            ]),
          );

          // The word the lexical leg would never match on this row — the row is
          // reachable only because the vector leg named its identity.
          const lexical = yield* db.searchScoredParagraphs('husbandry', { limit: 10 });
          expect(lexical.map((row) => row.para_id)).toEqual(['2ChS:vonly-2']);

          const found = yield* db.findParagraphsByIdentity(['2ChS:vonly-1']);
          expect(found).toHaveLength(1);
          const only = Arr.get(found, 0);
          if (Option.isNone(only)) return;
          expect(only.value.para_id).toBe('2ChS:vonly-1');
          expect(only.value.bookCode).toBe('2ChS');
          expect(only.value.nodes.length).toBeGreaterThan(0);
          // No FTS match produced it, so it carries no BM25 evidence.
          expect(only.value.rank).toBe(0);

          // An unknown key matches nothing rather than erroring or matching all.
          expect(yield* db.findParagraphsByIdentity(['2ChS:absent'])).toHaveLength(0);
          expect(yield* db.findParagraphsByIdentity([])).toHaveLength(0);
        }),
      ));

    /** The lookup seeks on `para_id` so SQLite can use an index, and decides on
     *  `book_code || ':' || para_id`. `para_id` is unique only *within* a book,
     *  so the seek alone admits a paragraph from every book sharing the value —
     *  which is exactly the cross-book collision `paragraphIdentity` qualifies
     *  by book to prevent. This pins that the second predicate still decides. */
    test('does not admit another book sharing a para_id', () =>
      runTest(
        Effect.gen(function* () {
          const db = yield* EGWParagraphDatabase;
          const wanted = mockBook(410, 'WANTED');
          const other = mockBook(411, 'OTHER');
          // `mockParagraph` derives `para_id` from `puborder`, so the same
          // argument in both books is the collision.
          yield* db.storeParagraphsBatch([mockParagraph(7, 'WANTED 1.1')], wanted);
          yield* db.storeParagraphsBatch([mockParagraph(7, 'OTHER 1.1')], other);

          const found = yield* db.findParagraphsByIdentity(['WANTED:para-7']);
          expect(found.map((row) => row.bookCode)).toEqual(['WANTED']);

          // And both are still reachable when both are asked for.
          const both = yield* db.findParagraphsByIdentity(['WANTED:para-7', 'OTHER:para-7']);
          expect(both.map((row) => row.bookCode).toSorted()).toEqual(['OTHER', 'WANTED']);
        }),
      ));

    /** `paragraphIdentity` falls back to `${bookCode}:#${refCode}` when a row
     *  has no `para_id`, and such a row is *not* resolvable here — SQL's
     *  `book_code || ':' || para_id` is `NULL` when `para_id` is, so it matches
     *  nothing. That is long-standing behaviour, not a new limitation, and it
     *  is inert on the shipped corpus, where no row takes the branch (see
     *  `paragraphIdentity`). It is pinned because the lookup now also seeks on
     *  `para_id` for the index: the seek must not be built from a `#` part,
     *  which would narrow a *mixed* batch and start dropping the ordinary
     *  identities beside it. Finding nothing is the old cost; dropping good
     *  rows would be a new one. */
    test('resolves nothing for an identity with no para_id, and does not poison the batch', () =>
      runTest(
        Effect.gen(function* () {
          const db = yield* EGWParagraphDatabase;
          const book = mockBook(412, 'NOPARA');
          yield* db.storeParagraphsBatch(
            [
              { ...mockParagraph(3, 'NOPARA 1.1'), para_id: Option.none() },
              mockParagraph(4, 'NOPARA 1.2'),
            ],
            book,
          );

          const headless = paragraphIdentity('NOPARA', Option.none(), 'NOPARA 1.1');
          expect(headless).toBe('NOPARA:#NOPARA 1.1');
          expect(yield* db.findParagraphsByIdentity([headless])).toHaveLength(0);

          // The ordinary identity beside it still resolves.
          const mixed = yield* db.findParagraphsByIdentity([headless, 'NOPARA:para-4']);
          expect(mixed.map((row) => row.para_id)).toEqual(['NOPARA:para-4']);
        }),
      ));
  });

  describe('batch operations', () => {
    test('keeps the search index current after paragraph writes', () =>
      runTest(
        Effect.gen(function* () {
          const db = yield* EGWParagraphDatabase;
          const book = mockBook(103, 'INDEXED');
          yield* db.storeParagraphsBatch([mockParagraph(1, 'INDEXED 1.1')], book);

          const stored = yield* db.searchParagraphs('Content', { limit: 10, bookCode: 'INDEXED' });
          expect(stored).toHaveLength(1);

          yield* db.storeParagraph(
            {
              ...mockParagraph(1, 'INDEXED 1.1'),
              nodes: [{ _tag: 'Text', text: 'Replacement phrase' }],
            },
            book,
          );
          const stale = yield* db.searchParagraphs('Content', { limit: 10, bookCode: 'INDEXED' });
          const replacement = yield* db.searchParagraphs('Replacement', {
            limit: 10,
            bookCode: 'INDEXED',
          });
          expect(stale).toHaveLength(0);
          expect(replacement).toHaveLength(1);
        }),
      ));

    test('stores paragraphs in batch', () =>
      runTest(
        Effect.gen(function* () {
          const db = yield* EGWParagraphDatabase;
          const book = mockBook(100, 'BATCH');

          const paragraphs = [
            mockParagraph(1, 'BATCH 1.1'),
            mockParagraph(2, 'BATCH 1.2'),
            mockParagraph(3, 'BATCH 1.3'),
          ];

          const count = yield* db.storeParagraphsBatch(paragraphs, book);
          expect(count).toBe(3);

          // Verify book was created
          const storedBook = yield* db.getBookByCode('BATCH');
          expect(Option.isSome(storedBook)).toBe(true);
          if (Option.isSome(storedBook)) {
            expect(storedBook.value.book_title).toBe('Test Book BATCH');
          }
        }),
      ));

    test('reports corrupt stored paragraph AST as a data-integrity error', () =>
      runTestWithPath((dbPath) =>
        Effect.gen(function* () {
          const db = yield* EGWParagraphDatabase;
          const book = mockBook(102, 'CORRUPT');
          yield* db.storeParagraphsBatch([mockParagraph(1, 'CORRUPT 1.1')], book);
          const raw = yield* Effect.acquireRelease(
            Effect.sync(() => new Database(dbPath)),
            (database) => Effect.sync(() => database.close()),
          );
          yield* Effect.sync(() => {
            raw.run(
              'UPDATE paragraphs SET nodes_json = \'[{"_tag":"Text","text":42}]\' WHERE book_id = 102',
            );
          });

          const result = yield* Effect.result(db.getParagraph(102, 'CORRUPT 1.1'));
          expect(Result.isFailure(result)).toBe(true);
          if (Result.isFailure(result)) {
            expect(result.failure).toBeInstanceOf(ParagraphDataIntegrityError);
          }
        }),
      ));

    test('stores Bible refs in batch', () =>
      runTest(
        Effect.gen(function* () {
          const db = yield* EGWParagraphDatabase;
          const book = mockBook(101, '1BC');

          // First store paragraphs so foreign key constraint is satisfied
          const paragraphs = [mockParagraph(1, '1BC 100.1'), mockParagraph(2, '1BC 100.2')];
          yield* db.storeParagraphsBatch(paragraphs, book);

          // Store Bible refs
          const refs = [
            {
              bookId: 101,
              refCode: '1BC 100.1',
              bibleBook: 1,
              bibleChapter: 1,
              bibleVerse: Option.some(1),
            },
            {
              bookId: 101,
              refCode: '1BC 100.1',
              bibleBook: 1,
              bibleChapter: 1,
              bibleVerse: Option.some(2),
            },
            {
              bookId: 101,
              refCode: '1BC 100.2',
              bibleBook: 43,
              bibleChapter: 3,
              bibleVerse: Option.some(16),
            },
          ];

          const count = yield* db.storeBibleRefsBatch(refs);
          expect(count).toBe(3);

          // Verify we can look up by Bible reference
          const results = yield* db.getParagraphsByBibleRef(43, 3, 16);
          expect(results.length).toBe(1);
          expect(results[0]?.bookCode).toBe('1BC');
        }),
      ));
  });

  describe('book operations', () => {
    test('stores and retrieves books by code', () =>
      runTest(
        Effect.gen(function* () {
          const db = yield* EGWParagraphDatabase;
          const book = mockBook(200, 'TEST');

          yield* db.storeBook(book);

          const retrieved = yield* db.getBookByCode('TEST');
          expect(Option.isSome(retrieved)).toBe(true);
          if (Option.isSome(retrieved)) {
            expect(retrieved.value.book_id).toBe(200);
          }

          // Case insensitive
          const lowerCase = yield* db.getBookByCode('test');
          expect(Option.isSome(lowerCase)).toBe(true);
        }),
      ));

    test('retrieves books by ID', () =>
      runTest(
        Effect.gen(function* () {
          const db = yield* EGWParagraphDatabase;
          const book = mockBook(201, 'BYID');

          yield* db.storeBook(book);

          const retrieved = yield* db.getBookById(201);
          expect(Option.isSome(retrieved)).toBe(true);
          if (Option.isSome(retrieved)) {
            expect(retrieved.value.book_code).toBe('BYID');
          }
        }),
      ));
  });

  /** Round-2 B4: the in-memory double and live FTS5 must combine terms the same
   *  way.
   *
   *  The double used `terms.some` — OR — while the shipped query joins quoted
   *  terms with `FTS_TERM_CONJUNCTION`, which FTS5 reads as AND. That makes
   *  every multi-word fixture query return a superset of what the corpus would
   *  return, so a test could state a premise about a top hit that no real
   *  search produces, and only a run against SQLite would show it.
   *
   *  The oracle here is the live database itself rather than a restatement of
   *  the rule, so the assertion tracks whatever FTS5 actually does with the
   *  string `ftsQuery` builds. Against the OR double the first expectation
   *  fails: the double returns all three rows where FTS5 returns one. */
  describe('the in-memory double matches live FTS5 term combination (B4)', () => {
    const CONJUNCTION_BOOKS = [
      {
        book_id: 401,
        book_code: 'ANDA',
        book_title: 'And A',
        book_author: 'Ellen Gould White',
        paragraph_count: 3,
        created_at: '2026-01-01T00:00:00.000Z',
      },
    ];
    const rows = [
      { order: 1, refcode: 'ANDA 1.1', text: 'alpha stands alone here' },
      { order: 2, refcode: 'ANDA 1.2', text: 'beta stands alone here' },
      { order: 3, refcode: 'ANDA 1.3', text: 'alpha and beta stand together' },
    ];
    /** The string `search/service.ts`'s `ftsQuery` emits for `alpha beta`. */
    const bothTerms = `"alpha"${FTS_TERM_CONJUNCTION}"beta"`;

    const doubleLayer = EGWParagraphDatabase.Test({
      books: CONJUNCTION_BOOKS,
      paragraphs: rows.map((row) => ({
        ...mockParagraph(row.order, row.refcode),
        bookCode: 'ANDA',
        nodes: [{ _tag: 'Text', text: row.text }],
      })),
    });

    /** The double's answer at its own boundary, so the provide is not nested
     *  inside the live-corpus test's generator. */
    const doubleSearch = (query: string) =>
      Effect.flatMap(EGWParagraphDatabase, (db) =>
        db.searchScoredParagraphs(query, { limit: 50 }),
      ).pipe(Effect.provide(doubleLayer));

    test('returns the same rows as the live corpus for a two-term query', () =>
      runTest(
        Effect.gen(function* () {
          const live = yield* EGWParagraphDatabase;
          for (const row of rows) {
            yield* live.storeParagraphsBatch(
              [
                {
                  ...mockParagraph(row.order, row.refcode),
                  nodes: [{ _tag: 'Text', text: row.text }],
                },
              ],
              mockBook(401, 'ANDA'),
            );
          }
          const refcodes = (hits: readonly { readonly ref_code: string }[]): string[] =>
            hits.map((hit) => hit.ref_code).toSorted();

          const liveBoth = yield* live.searchScoredParagraphs(bothTerms, { limit: 50 });
          const doubleBoth = yield* doubleSearch(bothTerms);

          // FTS5's own answer: only the row carrying both terms.
          expect(refcodes(liveBoth)).toEqual(['ANDA 1.3']);
          // And the double agrees, which is the contract.
          expect(refcodes(doubleBoth)).toEqual(refcodes(liveBoth));

          // A single term still matches every row that contains it, on both
          // sides — so the fix is AND between terms, not a narrower match.
          const liveOne = yield* live.searchScoredParagraphs('"alpha"', { limit: 50 });
          const doubleOne = yield* doubleSearch('"alpha"');
          expect(refcodes(liveOne)).toEqual(['ANDA 1.1', 'ANDA 1.3']);
          expect(refcodes(doubleOne)).toEqual(refcodes(liveOne));
        }),
      ));
  });
});
