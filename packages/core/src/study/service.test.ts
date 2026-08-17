/** Milestone 5 core acceptance (§10).
 *
 *  Four claims, each named by the milestone's acceptance list:
 *
 *  1. the bundle contains all five fields for a verse that has all five;
 *  2. sparse `paragraph_bible_refs` yields an empty parallel-writings list,
 *     **not** an error (§8.4);
 *  3. the Strong's reverse concordance respects its limit;
 *  4. margin notes are present.
 *
 *  The fixture is `Dan 8:13` — the verse §8.2 and the CLI acceptance workflow
 *  both name — wired against the real `EGWCommentaryService.Live` over a test
 *  paragraph database, so the commentary/parallel-writings split is exercised by
 *  the same reverse lookup the live corpus uses rather than by two stubs that
 *  could agree with each other and with nothing else.
 */

import { Effect, Layer, Option } from 'effect';
import { describe, expect, it } from 'effect-bun-test';

import { Reference } from '../bible/model.js';
import {
  BibleDatabase,
  type ConcordanceHit,
  type CrossReference,
  type MarginNote,
  type StrongsEntry,
  type VerseWord,
} from '../bible-db/bible-database.js';
import { EGWCommentaryService } from '../egw-commentary/service.js';
import { EGWParagraphDatabase, type BibleRefRow, type BookRow } from '../egw-db/book-database.js';
import type { Paragraph } from '../egw/schemas.js';
import {
  DEFAULT_CONCORDANCE_LIMIT,
  DEFAULT_PARALLEL_WRITINGS_LIMIT,
  strongsNumber,
} from './model.js';
import { StudyService } from './service.js';

// Wire-shape fields the EGW schema encodes as `null` when absent.
const wireNull = Option.getOrNull(Option.none<never>());

const DANIEL = 27;
const DAN_8_13 = Reference.verse(DANIEL, 8, 13);

// ---------------------------------------------------------------------------
// The writings half: one Bible Commentary volume and one book that is not.
//
// Both carry a `paragraph_bible_refs` row for Dan 8:13, which is exactly the
// situation the partition exists for: `EGWCommentaryService.getCommentary` is
// unfiltered and returns both, and `StudyService` has to send `5BC` to
// `commentary` and `GC` to `parallelWritings`.
// ---------------------------------------------------------------------------

const commentaryBook: BookRow = {
  book_id: 501,
  book_code: '5BC',
  book_title: 'EGW SDA Bible Commentary, vol. 5',
  book_author: 'Ellen Gould White',
  paragraph_count: 1,
  created_at: '2026-01-01',
};

const otherBook: BookRow = {
  book_id: 502,
  book_code: 'GC',
  book_title: 'The Great Controversy',
  book_author: 'Ellen Gould White',
  paragraph_count: 1,
  created_at: '2026-01-01',
};

/** The White Estate's own half of the EGW scope — the second of the two authors
 *  `EGW_SCOPE_AUTHORS` names, so the scope filter is proved to be that constant
 *  rather than an equality test against Ellen White alone. */
const estateBook: BookRow = {
  book_id: 503,
  book_code: 'LDE',
  book_title: 'Last Day Events',
  book_author: 'Ellen G. White Estate',
  paragraph_count: 1,
  created_at: '2026-01-01',
};

/** Outside the EGW scope, and the reason blocker 1 exists: the reverse lookup
 *  spans the whole library, so a verse's `paragraph_bible_refs` rows are mostly
 *  *not* White-Estate published. On the live corpus Dan 7:25 answers with 431
 *  rows of which only 10 are. A "parallel EGW" section that carried these would
 *  be a section of Matthew Henry under an EGW heading. */
const henry: BookRow = {
  book_id: 504,
  book_code: 'MHC',
  book_title: "Matthew Henry's Commentary",
  book_author: 'Matthew Henry',
  paragraph_count: 1,
  created_at: '2026-01-01',
};

const strongsBook: BookRow = {
  book_id: 505,
  book_code: 'SC',
  book_title: "Strong's Concordance",
  book_author: 'James Strong',
  paragraph_count: 1,
  created_at: '2026-01-01',
};

const paragraph = (
  bookCode: string,
  refcode: string,
  text: string,
): Paragraph & { bookCode: string } => ({
  bookCode,
  para_id: Option.some(refcode),
  id_prev: wireNull,
  id_next: wireNull,
  refcode_1: wireNull,
  refcode_2: wireNull,
  refcode_3: wireNull,
  refcode_4: wireNull,
  refcode_short: Option.some(refcode),
  refcode_long: wireNull,
  element_type: 'p',
  element_subtype: wireNull,
  nodes: [{ _tag: 'Text', text }],
  puborder: 1,
});

const bibleRef = (bookId: number, refcode: string, verse: number): BibleRefRow => ({
  para_book_id: bookId,
  para_ref_code: refcode,
  bible_book: DANIEL,
  bible_chapter: 8,
  bible_verse: verse,
});

/** One verse, five citing books: a Bible Commentary volume, both halves of the
 *  EGW scope, and two books outside it.
 *
 *  This is the live corpus's shape in miniature, and the reason the
 *  commentary/parallel split alone is not the §8.4 partition — `5BC` leaves via
 *  the BC exclusion, `GC` and `LDE` are the parallel EGW writings, and `MHC`
 *  and `SC` are real citations of the verse that belong to neither field. */
const writings = EGWParagraphDatabase.Test({
  books: [commentaryBook, otherBook, estateBook, henry, strongsBook],
  paragraphs: [
    paragraph('5BC', '5BC 1116.1', 'The daily is the continual mediation of Christ.'),
    paragraph('GC', 'GC 324.1', 'The sanctuary in heaven is the great original.'),
    paragraph('LDE', 'LDE 250.1', 'The daily and the sanctuary, compiled.'),
    paragraph('MHC', 'MHC Dan 8.1', 'Henry on the vision of the evenings and mornings.'),
    paragraph('SC', 'SC H8548', 'tamid: continuance, continually.'),
  ],
  bibleRefs: [
    bibleRef(501, '5BC 1116.1', 13),
    bibleRef(502, 'GC 324.1', 13),
    bibleRef(503, 'LDE 250.1', 13),
    bibleRef(504, 'MHC Dan 8.1', 13),
    bibleRef(505, 'SC H8548', 13),
  ],
});

/** Thirty EGW citations of one verse, so the default cap of 25 is a real
 *  truncation and `parallelWritingsTotal` is a number the capped list cannot
 *  reproduce.
 *
 *  A cap test over a single row proves nothing: `items.length === total === 1`
 *  holds whether the total is counted before the cap, after it, or not at all.
 *  Thirty separates the three. Ten non-EGW rows ride alongside so the same
 *  fixture also proves the total is counted *after* the scope filter — a total
 *  of 40 here would mean the pane promised fifteen citations it will never
 *  show, ten of them by authors the section does not carry. */
const manyWritings = EGWParagraphDatabase.Test({
  books: [
    ...Array.from({ length: 30 }, (_, index) => ({
      book_id: 600 + index,
      book_code: `EGW${String(index)}`,
      book_title: `EGW volume ${String(index)}`,
      book_author: 'Ellen Gould White',
      paragraph_count: 1,
      created_at: '2026-01-01',
    })),
    ...Array.from({ length: 10 }, (_, index) => ({
      book_id: 700 + index,
      book_code: `OTH${String(index)}`,
      book_title: `Secondary work ${String(index)}`,
      book_author: 'Matthew Henry',
      paragraph_count: 1,
      created_at: '2026-01-01',
    })),
  ],
  paragraphs: [
    ...Array.from({ length: 30 }, (_, index) =>
      paragraph(`EGW${String(index)}`, `EGW${String(index)} 1.1`, `EGW citation ${String(index)}`),
    ),
    ...Array.from({ length: 10 }, (_, index) =>
      paragraph(
        `OTH${String(index)}`,
        `OTH${String(index)} 1.1`,
        `Other citation ${String(index)}`,
      ),
    ),
  ],
  bibleRefs: [
    ...Array.from({ length: 30 }, (_, index) =>
      bibleRef(600 + index, `EGW${String(index)} 1.1`, 13),
    ),
    ...Array.from({ length: 10 }, (_, index) =>
      bibleRef(700 + index, `OTH${String(index)} 1.1`, 13),
    ),
  ],
});

/** One EGW citation whose refcode is blank.
 *
 *  `StudyParallelWriting.refcode` is `NonEmptyString`, so this row cannot
 *  decode. It is the row that used to vanish: the section came back one item
 *  short of its own total and nothing said why, which under §8.4's sparseness
 *  posture reads exactly like the verse having fewer citations. */
const malformedWritings = EGWParagraphDatabase.Test({
  books: [otherBook],
  paragraphs: [paragraph('GC', '', 'A paragraph the corpus stored with no refcode.')],
  bibleRefs: [bibleRef(502, '', 13)],
});

/** A writings library whose `paragraph_bible_refs` holds nothing for this verse
 *  — §8.4's documented sparseness, which covers 603 of the corpus's 648 books
 *  and is therefore the *common* case rather than an edge one. */
const sparseWritings = EGWParagraphDatabase.Test({
  books: [commentaryBook],
  paragraphs: [paragraph('5BC', '5BC 1116.1', 'Unrelated.')],
  bibleRefs: [bibleRef(501, '5BC 1116.1', 27)],
});

// ---------------------------------------------------------------------------
// The Bible half.
// ---------------------------------------------------------------------------

const words: readonly VerseWord[] = [
  { text: 'Then', strongsNumbers: [], italic: false },
  { text: 'I heard', strongsNumbers: ['H8085'], italic: false },
  { text: 'the daily', strongsNumbers: ['H8548'], italic: false },
  // A supplied word: no lexicon backing, and italic in the KJV.
  { text: 'sacrifice', strongsNumbers: [], italic: true },
];

const crossRefs: readonly CrossReference[] = [
  {
    book: 66,
    chapter: 12,
    verse: Option.some(6),
    verseEnd: Option.none(),
    source: 'openbible',
    previewText: Option.some('And the woman fled into the wilderness…'),
  },
  // A chapter-level target: `cross_refs` really stores these, and a label that
  // read "Rev 12:undefined" would be the bug the three-shape label prevents.
  {
    book: 66,
    chapter: 13,
    verse: Option.none(),
    verseEnd: Option.none(),
    source: 'tske',
    previewText: Option.none(),
  },
];

const marginNotes: readonly MarginNote[] = [
  { index: 0, type: 'hebrew', phrase: 'the daily', text: 'Heb. the continual' },
  {
    index: 1,
    type: 'alternate',
    phrase: 'transgression of desolation',
    text: 'Or, making desolate',
  },
];

const tamid: StrongsEntry = {
  number: 'H8548',
  language: 'hebrew',
  lemma: 'תָּמִיד',
  transliteration: Option.some('tamiyd'),
  pronunciation: Option.some('taw-meed'),
  definition: 'continuance, continually, perpetual',
  kjvDefinition: Option.some('alway(-s), continual (employment, -ly), daily'),
};

/** Sixty hits for one number, so a default cap of 50 is a real truncation and
 *  `total` is a number the capped list cannot reproduce. */
const tamidHits: readonly ConcordanceHit[] = Array.from({ length: 60 }, (_, index) => ({
  book: 2,
  bookName: 'Exodus',
  chapter: 25,
  verse: index + 1,
  text: `Occurrence ${String(index + 1)} of the continual.`,
  word: 'continual',
}));

const bible = BibleDatabase.layerTest({
  verses: [
    {
      book: DANIEL,
      chapter: 8,
      verse: 13,
      versionCode: 'KJV',
      text: 'Then I heard one saint speaking…',
    },
  ],
  verseWords: [{ book: DANIEL, chapter: 8, verse: 13, words }],
  crossRefs: [{ book: DANIEL, chapter: 8, verse: 13, references: crossRefs }],
  marginNotes: [{ book: DANIEL, chapter: 8, verse: 13, notes: marginNotes }],
  strongsEntries: [tamid],
  concordanceHits: { H8548: tamidHits },
});

const study = (library: Layer.Layer<EGWParagraphDatabase>) =>
  StudyService.Live.pipe(
    Layer.provide(bible),
    Layer.provide(EGWCommentaryService.Live.pipe(Layer.provide(library))),
  );

describe('StudyService.verse', () => {
  it.effect('carries all five sections for a verse that has all five', () =>
    Effect.gen(function* () {
      const bundle = yield* Effect.flatMap(StudyService, (service) => service.verse(DAN_8_13));

      expect(bundle.label).toBe('Daniel 8:13');
      expect(bundle.text).toEqual(Option.some('Then I heard one saint speaking…'));

      // 1 — words, with the Strong's numbers that make them tap targets.
      expect(bundle.words.map((word) => word.text)).toEqual([
        'Then',
        'I heard',
        'the daily',
        'sacrifice',
      ]);
      // Branded, so compared as string projections rather than by
      // reconstructing the brand in the expectation.
      expect(bundle.words[2]?.strongs.map(String)).toEqual(['H8548']);
      expect(bundle.words[3]?.italic).toBe(true);

      // 2 — cross-references, both shapes labelled correctly.
      expect(bundle.crossRefs.map((reference) => reference.label)).toEqual([
        'Revelation 12:6',
        'Revelation 13',
      ]);
      expect(bundle.crossRefs[0]?.source).toBe('openbible');

      // 3 — margin notes (§8.3: in scope, and the data already ships).
      expect(bundle.marginNotes.map((note) => note.text)).toEqual([
        'Heb. the continual',
        'Or, making desolate',
      ]);
      expect(bundle.marginNotes[0]?.kind).toBe('hebrew');

      // 4 — commentary: the Bible Commentary volume, and only it.
      expect(bundle.commentary.map((entry) => entry.bookCode)).toEqual(['5BC']);
      expect(bundle.commentary[0]?.content).toBe('The daily is the continual mediation of Christ.');

      // 5 — parallel writings: the EGW-scope rows the BC exclusion left, and
      // only those. `MHC` and `SC` cite the verse too and are deliberately
      // absent — the section is "parallel EGW" (§8.4), not "everything else".
      expect(bundle.parallelWritings.map((entry) => entry.bookCode)).toEqual(['GC', 'LDE']);
      expect(bundle.parallelWritingsTotal).toBe(2);

      // The partition is not exhaustive over the reverse lookup, and that is
      // the fix: five rows came back, three are in scope, two are not.
      expect(bundle.commentary.length + bundle.parallelWritings.length).toBe(3);
    }).pipe(Effect.provide(study(writings))),
  );

  it.effect('keeps only EGW-scope rows in parallel writings', () =>
    Effect.gen(function* () {
      // Blocker 1. `EGWCommentaryService.getCommentary` reads
      // `paragraph_bible_refs` across the whole library, so "not a BC volume"
      // is not "parallel EGW": on the live corpus Dan 7:25 answers with 431
      // rows, 4 of them BC, and only 10 of the remaining 427 White-Estate
      // published. Treating the other 417 as parallel writings filled the
      // section with Matthew Henry and Strong's under an EGW heading.
      const bundle = yield* Effect.flatMap(StudyService, (service) => service.verse(DAN_8_13));

      const authors = new Set(bundle.parallelWritings.map((entry) => entry.bookCode));
      expect(authors.has('MHC')).toBe(false);
      expect(authors.has('SC')).toBe(false);
      // Both halves of `EGW_SCOPE_AUTHORS` survive, so the filter is that
      // constant and not an equality test against Ellen White alone.
      expect(authors.has('GC')).toBe(true);
      expect(authors.has('LDE')).toBe(true);
      // And the total counts the same rows the list is drawn from: a total of
      // 4 here would be the pre-scope count promising two citations by authors
      // this section will never show.
      expect(bundle.parallelWritingsTotal).toBe(2);
    }).pipe(Effect.provide(study(writings))),
  );

  it.effect('yields an empty parallel-writings list on sparse refs, not an error', () =>
    Effect.gen(function* () {
      // §8.4: bible-ref rows are markup-dependent and populated for 45 of 648
      // books. The pane must render for the other 603, so this is a value.
      const bundle = yield* Effect.flatMap(StudyService, (service) => service.verse(DAN_8_13));

      expect(bundle.parallelWritings).toEqual([]);
      expect(bundle.parallelWritingsTotal).toBe(0);
      expect(bundle.commentary).toEqual([]);
      // And the rest of the bundle still answered — sparseness in one source
      // does not degrade the other four.
      expect(bundle.marginNotes.length).toBe(2);
      expect(bundle.crossRefs.length).toBe(2);
      expect(bundle.words.length).toBe(4);
    }).pipe(Effect.provide(study(sparseWritings))),
  );

  it.effect('caps parallel writings at the default and reports the post-scope total', () =>
    Effect.gen(function* () {
      // Should-fix 7. The retired version of this test used one row and a limit
      // of 1, where `items.length === total === 1` holds whether the total is
      // counted before the cap, after it, or not at all. Forty rows — thirty in
      // scope, ten out — separate all three: 25 items, and a total that is
      // neither 25 (post-cap) nor 40 (pre-scope).
      const bundle = yield* Effect.flatMap(StudyService, (service) => service.verse(DAN_8_13));

      expect(bundle.parallelWritings.length).toBe(DEFAULT_PARALLEL_WRITINGS_LIMIT);
      expect(bundle.parallelWritingsTotal).toBe(30);
      // Stated as inequalities too, because those are the two numbers a wrong
      // implementation would produce and the assertion above only excludes by
      // arithmetic coincidence otherwise.
      expect(bundle.parallelWritingsTotal).not.toBe(bundle.parallelWritings.length);
      expect(bundle.parallelWritingsTotal).not.toBe(40);
    }).pipe(Effect.provide(study(manyWritings))),
  );

  it.effect('caps parallel writings at a caller-stated limit', () =>
    Effect.gen(function* () {
      const bundle = yield* Effect.flatMap(StudyService, (service) =>
        service.verse(DAN_8_13, { parallelWritingsLimit: 4 }),
      );
      expect(bundle.parallelWritings.length).toBe(4);
      expect(bundle.parallelWritingsTotal).toBe(30);
    }).pipe(Effect.provide(study(manyWritings))),
  );

  it.effect('fails with a typed corpus-data error on a malformed row', () =>
    Effect.gen(function* () {
      // Should-fix 9. The row's refcode is blank and
      // `StudyParallelWriting.refcode` is `NonEmptyString`, so it cannot
      // decode. Dropping it silently returned `parallelWritings: []` beside
      // `parallelWritingsTotal: 1` — a section shorter than its own total,
      // which under §8.4's sparseness posture is indistinguishable from the
      // verse simply having no citations.
      const outcome = yield* Effect.flip(
        Effect.flatMap(StudyService, (service) => service.verse(DAN_8_13)),
      );

      expect(outcome._tag).toBe('StudyCorpusDataError');
      // Typed, and it names the row: `source` says which corpus, `operation`
      // says which section, `row` says which paragraph an operator should go
      // look at.
      if (outcome._tag !== 'StudyCorpusDataError') return;
      expect(outcome.source).toBe('writings');
      expect(outcome.operation).toBe('verse.parallelWritings');
      expect(outcome.row).toContain('GC');
    }).pipe(Effect.provide(study(malformedWritings))),
  );

  it.effect('sparse refs stay a value, not a corpus-data failure', () =>
    Effect.gen(function* () {
      // The other half of should-fix 9, and the line the fix must not cross:
      // *absent* rows are §8.4's common case and remain an empty list. Only
      // *malformed* rows fail.
      const bundle = yield* Effect.flatMap(StudyService, (service) => service.verse(DAN_8_13));
      expect(bundle.parallelWritings).toEqual([]);
      expect(bundle.parallelWritingsTotal).toBe(0);
    }).pipe(Effect.provide(study(sparseWritings))),
  );
});

describe('StudyService.strongs', () => {
  it.effect('respects the concordance limit and reports the uncapped total', () =>
    Effect.gen(function* () {
      const result = yield* Effect.flatMap(StudyService, (service) =>
        service.strongs(strongsNumber('H8548'), { limit: 5 }),
      );

      expect(result.occurrences.length).toBe(5);
      expect(result.limit).toBe(5);
      // The number a "show all" affordance renders, and one the capped list
      // cannot produce.
      expect(result.total).toBe(60);
      expect(result.occurrences[0]?.label).toBe('Exodus 25:1');
      expect(result.occurrences[0]?.word).toBe('continual');
    }).pipe(Effect.provide(study(writings))),
  );

  it.effect('applies the default cap when the caller states none', () =>
    Effect.gen(function* () {
      const result = yield* Effect.flatMap(StudyService, (service) =>
        service.strongs(strongsNumber('H8548')),
      );
      expect(result.occurrences.length).toBe(DEFAULT_CONCORDANCE_LIMIT);
      expect(result.limit).toBe(DEFAULT_CONCORDANCE_LIMIT);
      expect(result.total).toBe(60);
    }).pipe(Effect.provide(study(writings))),
  );

  it.effect('carries the lexicon entry for the word-tap path', () =>
    Effect.gen(function* () {
      const result = yield* Effect.flatMap(StudyService, (service) =>
        service.strongs(strongsNumber('H8548'), { limit: 1 }),
      );
      const entry = Option.getOrThrow(result.entry);
      expect(entry.language).toBe('hebrew');
      expect(entry.lemma).toBe('תָּמִיד');
      expect(entry.transliteration).toEqual(Option.some('tamiyd'));
    }).pipe(Effect.provide(study(writings))),
  );

  it.effect('reports an absent lexicon entry as a value, with the concordance intact', () =>
    Effect.gen(function* () {
      // A number the lexicon has no row for is a gap in the corpus, not a
      // broken request — and the reverse concordance can still answer.
      const result = yield* Effect.flatMap(StudyService, (service) =>
        service.strongs(strongsNumber('H9999')),
      );
      expect(result.entry).toEqual(Option.none());
      expect(result.occurrences).toEqual([]);
      expect(result.total).toBe(0);
    }).pipe(Effect.provide(study(writings))),
  );
});
