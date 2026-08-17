/** Shared fixtures for the study seam's host tests.
 *
 *  Behind `@bible/core/study/testing` rather than the production barrel, for
 *  the reason `wiki/testing.ts` is: these are test doubles, and a shipped import
 *  must not be able to reach them through the same path it reaches
 *  `StudyService` through.
 *
 *  What lives here is **study fixtures and nothing else**: `studyFixtureLayer`,
 *  a `StudyService` over a Daniel 8:13 whose five sections are all populated, so
 *  a bundle that arrived whole is distinguishable from one that arrived empty.
 *  The web worker's round-trip test, Electron main's, and core's own parity test
 *  compare counts and JSON against this one input; three hand-copied fixtures
 *  would let two hosts agree about a verse the third never saw.
 *
 *  The rest of `BibleProcedureHandlers`'s dependency graph used to live here
 *  too, which put a study file in the path of every *other* feature's new RPC —
 *  and the wiki parity suite had already written a second copy rather than
 *  import a study module for it. That graph now lives in
 *  `@bible/core/procedure/testing` as `procedureDependencies`, where it belongs,
 *  and `otherProcedureDependencies` below is the study-shaped call to it.
 */

import { Layer, Option } from 'effect';

import { bookNumber, chapterNumber, verseNumber } from '../bible/model.js';
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
import { procedureDependencies } from '../procedure/testing.js';
import { StudyService } from './service.js';

/** Wire-shape fields the EGW paragraph schema encodes as `null` when absent. */
const wireNull = Option.getOrNull(Option.none<never>());

/** The fixture verse: Daniel 8:13, the reference §8.2 and the CLI acceptance
 *  workflow both name.
 *
 *  Branded rather than left as plain numbers, because every consumer passes them
 *  into a branded position — a procedure payload or `Reference.verse` — and
 *  branding once here is what keeps four test files from each restating the
 *  constructor. */
export const FIXTURE_BOOK = bookNumber(27);
export const FIXTURE_CHAPTER = chapterNumber(8);
export const FIXTURE_VERSE = verseNumber(13);
export const FIXTURE_LABEL = 'Daniel 8:13';
export const FIXTURE_TEXT = 'Then I heard one saint speaking…';

/** How many concordance hits the fixture holds for `H8548`. Exported so a test
 *  asserting a cap can state the uncapped total without restating the array. */
export const FIXTURE_CONCORDANCE_TOTAL = 9;

const commentaryBook: BookRow = {
  book_id: 501,
  book_code: '5BC',
  book_title: 'EGW SDA Bible Commentary, vol. 5',
  book_author: 'Ellen Gould White',
  paragraph_count: 1,
  created_at: '2026-01-01',
};

/** Deliberately not a Bible Commentary volume: this is the row that must land
 *  in `parallelWritings` while `5BC` lands in `commentary`, which is the
 *  partition §8.1's two bundle fields require. */
const greatControversy: BookRow = {
  book_id: 502,
  book_code: 'GC',
  book_title: 'The Great Controversy',
  book_author: 'Ellen Gould White',
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

const bibleRef = (bookId: number, refcode: string): BibleRefRow => ({
  para_book_id: bookId,
  para_ref_code: refcode,
  bible_book: FIXTURE_BOOK,
  bible_chapter: FIXTURE_CHAPTER,
  bible_verse: FIXTURE_VERSE,
});

const writingsDatabase = EGWParagraphDatabase.Test({
  books: [commentaryBook, greatControversy],
  paragraphs: [
    paragraph('5BC', '5BC 1116.1', 'The daily is the continual mediation of Christ.'),
    paragraph('GC', 'GC 324.1', 'The sanctuary in heaven is the great original.'),
  ],
  bibleRefs: [bibleRef(501, '5BC 1116.1'), bibleRef(502, 'GC 324.1')],
});

/** A writings library holding one citation the wire model refuses.
 *
 *  The `Great Controversy` row is stored with a blank refcode, and
 *  `StudyParallelWriting.refcode` is `NonEmptyString`, so it cannot decode and
 *  `StudyService.verse` fails with `StudyCorpusDataError`. Shared rather than
 *  restated per suite because three seams have to agree about what a corpus
 *  fault *looks like* downstream — the RPC boundary must carry the tag and the
 *  row rather than flatten both into a `ProcedureError`, and the CLI must print
 *  the row rather than only the message. */
const malformedWritingsDatabase = EGWParagraphDatabase.Test({
  books: [greatControversy],
  paragraphs: [paragraph('GC', '', 'A citation the corpus stored with no refcode.')],
  bibleRefs: [bibleRef(502, '')],
});

const words: readonly VerseWord[] = [
  { text: 'Then', strongsNumbers: [], italic: false },
  { text: 'the daily', strongsNumbers: ['H8548'], italic: false },
];

const crossRefs: readonly CrossReference[] = [
  {
    book: 66,
    chapter: 12,
    verse: Option.some(6),
    verseEnd: Option.none(),
    source: 'openbible',
    previewText: Option.none(),
  },
];

const marginNotes: readonly MarginNote[] = [
  { index: 0, type: 'hebrew', phrase: 'the daily', text: 'Heb. the continual' },
];

const tamid: StrongsEntry = {
  number: 'H8548',
  language: 'hebrew',
  lemma: 'תָּמִיד',
  transliteration: Option.some('tamiyd'),
  pronunciation: Option.none(),
  definition: 'continuance, continually, perpetual',
  kjvDefinition: Option.none(),
};

const tamidHits: readonly ConcordanceHit[] = Array.from(
  { length: FIXTURE_CONCORDANCE_TOTAL },
  (_, index) => ({
    book: 2,
    bookName: 'Exodus',
    chapter: 25,
    verse: index + 1,
    text: `Occurrence ${String(index + 1)}.`,
    word: 'continual',
  }),
);

const bibleDatabase = BibleDatabase.layerTest({
  verses: [
    {
      book: FIXTURE_BOOK,
      chapter: FIXTURE_CHAPTER,
      verse: FIXTURE_VERSE,
      versionCode: 'KJV',
      text: FIXTURE_TEXT,
    },
  ],
  verseWords: [{ book: FIXTURE_BOOK, chapter: FIXTURE_CHAPTER, verse: FIXTURE_VERSE, words }],
  crossRefs: [
    { book: FIXTURE_BOOK, chapter: FIXTURE_CHAPTER, verse: FIXTURE_VERSE, references: crossRefs },
  ],
  marginNotes: [
    { book: FIXTURE_BOOK, chapter: FIXTURE_CHAPTER, verse: FIXTURE_VERSE, notes: marginNotes },
  ],
  strongsEntries: [tamid],
  concordanceHits: { H8548: tamidHits },
});

/** The one `StudyService` every host suite resolves — the real service over the
 *  real `EGWCommentaryService`, so the commentary/parallel split is exercised by
 *  the same reverse lookup the live corpus uses rather than by two stubs that
 *  could agree with each other and with nothing else. */
export const studyFixtureLayer: Layer.Layer<StudyService> = StudyService.Live.pipe(
  Layer.provide(bibleDatabase),
  Layer.provide(EGWCommentaryService.Live.pipe(Layer.provide(writingsDatabase))),
);

/** The same service over a corpus holding one row the wire model refuses, so
 *  `verse` fails with `StudyCorpusDataError` and the seams downstream can be
 *  asked what they do with it. `strongs` is unaffected — the malformed row is a
 *  writings citation — which is what keeps a suite from mistaking "everything
 *  fails here" for the claim. */
export const malformedStudyFixtureLayer: Layer.Layer<StudyService> = StudyService.Live.pipe(
  Layer.provide(bibleDatabase),
  Layer.provide(EGWCommentaryService.Live.pipe(Layer.provide(malformedWritingsDatabase))),
);

/** The row identity `malformedStudyFixtureLayer`'s failure carries: the
 *  publication code, which is all a blank refcode leaves to name it by, and
 *  exactly what an operator opens the corpus with. */
export const FIXTURE_MALFORMED_ROW = 'GC';

/** Everything `BibleProcedureHandlers` requires, with the study seam wired to
 *  {@link studyFixtureLayer}.
 *
 *  The study service is carried *inside* rather than merged alongside, and that
 *  is load-bearing: `Layer.mergeAll` resolves a duplicate tag in favour of the
 *  later layer, so `Layer.mergeAll(studyFixtureLayer, otherProcedureDependencies)`
 *  — which is how all four suites used to spell it — would silently hand the
 *  handler an empty `StudyService` and every round-trip assertion would compare
 *  one empty bundle to another. One layer with no duplicate tag cannot be
 *  ordered wrong. */
export const studyProcedureDependencies = procedureDependencies({
  generation: 'study-fixture',
  study: studyFixtureLayer,
});

/** The same graph over {@link malformedStudyFixtureLayer}, for asking the RPC
 *  boundary what a corpus fault looks like on the far side. */
export const malformedStudyProcedureDependencies = procedureDependencies({
  generation: 'study-fixture-malformed',
  study: malformedStudyFixtureLayer,
});
