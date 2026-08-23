import { Match, Schema } from 'effect';

export const BookNumber = Schema.Finite.pipe(
  Schema.check(Schema.isInt(), Schema.isBetween({ minimum: 1, maximum: 66 })),
  Schema.brand('Bible/BookNumber'),
);
export type BookNumber = typeof BookNumber.Type;

export const ChapterNumber = Schema.Finite.pipe(
  Schema.check(Schema.isInt(), Schema.isGreaterThan(0)),
  Schema.brand('Bible/ChapterNumber'),
);
export type ChapterNumber = typeof ChapterNumber.Type;

export const VerseNumber = Schema.Finite.pipe(
  Schema.check(Schema.isInt(), Schema.isGreaterThan(0)),
  Schema.brand('Bible/VerseNumber'),
);
export type VerseNumber = typeof VerseNumber.Type;

export class Book extends Schema.Class<Book>('Bible/Book')({
  number: BookNumber,
  name: Schema.NonEmptyString,
  abbreviation: Schema.NonEmptyString,
  chapters: ChapterNumber,
  testament: Schema.Literals(['old', 'new']),
}) {}

export class BookReference extends Schema.TaggedClass<BookReference>('Bible/BookReference')(
  'book',
  {
    book: BookNumber,
  },
) {}

export class ChapterReference extends Schema.TaggedClass<ChapterReference>(
  'Bible/ChapterReference',
)('chapter', {
  book: BookNumber,
  chapter: ChapterNumber,
}) {}

export class VerseReference extends Schema.TaggedClass<VerseReference>('Bible/VerseReference')(
  'verse',
  {
    book: BookNumber,
    chapter: ChapterNumber,
    verse: VerseNumber,
  },
) {}

export class VerseRangeReference extends Schema.TaggedClass<VerseRangeReference>(
  'Bible/VerseRangeReference',
)('range', {
  start: VerseReference,
  end: VerseReference,
}) {}

const OrderedVerseRangeReference = VerseRangeReference.check(
  Schema.makeFilter<VerseRangeReference>((range) => {
    const startsAfterEnd =
      range.start.book > range.end.book ||
      (range.start.book === range.end.book && range.start.chapter > range.end.chapter) ||
      (range.start.book === range.end.book &&
        range.start.chapter === range.end.chapter &&
        range.start.verse > range.end.verse);
    if (startsAfterEnd) return 'Bible verse range must be ordered';
    return true;
  }),
);

const orderedVerseRange = Schema.decodeSync(OrderedVerseRangeReference);

export const ReferenceSchema = Schema.Union([
  BookReference,
  ChapterReference,
  VerseReference,
  VerseRangeReference,
]);
export type Reference = typeof ReferenceSchema.Type;

export class Verse extends Schema.Class<Verse>('Bible/Verse')({
  reference: VerseReference,
  text: Schema.String,
}) {}

export class Chapter extends Schema.Class<Chapter>('Bible/Chapter')({
  book: Book,
  reference: ChapterReference,
  verses: Schema.NonEmptyArray(Verse),
  previous: Schema.Option(ChapterReference),
  next: Schema.Option(ChapterReference),
}) {}

/** One KJV marginal note as the **reader** needs it: the phrase it annotates and
 *  which anchor it is.
 *
 *  Distinct from `Study/MarginNote`, and deliberately smaller. The study pane
 *  shows a note's *text* for one verse; the reader draws an *anchor* after the
 *  annotated phrase for every verse on screen, and a chapter's worth of note
 *  text would be a payload the reader never renders. The two share the corpus
 *  row, not the projection. */
export class VerseMarginAnchor extends Schema.Class<VerseMarginAnchor>('Bible/VerseMarginAnchor')({
  noteIndex: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  phrase: Schema.String,
}) {}

/** A whole chapter's margin anchors, by verse (§10 M6's margin layer).
 *
 *  An array of per-verse entries rather than a map, because the wire codec
 *  encodes arrays and a `Map` would need a bespoke transformation for a payload
 *  the client indexes once on arrival anyway. Verses with no notes are simply
 *  absent. */
export class ChapterMarginAnchors extends Schema.Class<ChapterMarginAnchors>(
  'Bible/ChapterMarginAnchors',
)({
  reference: ChapterReference,
  verses: Schema.Array(
    Schema.Struct({
      verse: VerseNumber,
      anchors: Schema.Array(VerseMarginAnchor),
    }),
  ),
}) {}

export class Passage extends Schema.Class<Passage>('Bible/Passage')({
  reference: Schema.Union([VerseReference, VerseRangeReference]),
  verses: Schema.NonEmptyArray(Verse),
}) {}

export class SearchHit extends Schema.Class<SearchHit>('Bible/SearchHit')({
  book: Book,
  verse: Verse,
}) {}

export interface SearchWindowOptions {
  readonly books?: readonly BookNumber[];
  readonly offset?: number;
  readonly limit?: number;
}

export class SearchWindow extends Schema.Class<SearchWindow>('Bible/SearchWindow')({
  hits: Schema.Array(SearchHit),
  total: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
}) {}

export const bookNumber = Schema.decodeSync(BookNumber);
export const chapterNumber = Schema.decodeSync(ChapterNumber);
export const verseNumber = Schema.decodeSync(VerseNumber);

export const Reference = {
  book: (book: number): BookReference => BookReference.make({ book: bookNumber(book) }),
  chapter: (book: number, chapter: number): ChapterReference =>
    ChapterReference.make({ book: bookNumber(book), chapter: chapterNumber(chapter) }),
  verse: (book: number, chapter: number, verse: number): VerseReference =>
    VerseReference.make({
      book: bookNumber(book),
      chapter: chapterNumber(chapter),
      verse: verseNumber(verse),
    }),
  range: (start: VerseReference, end: VerseReference): VerseRangeReference =>
    orderedVerseRange(VerseRangeReference.make({ start, end })),
  chapterOf: (reference: Reference): ChapterReference =>
    Match.value(reference).pipe(
      Match.tagsExhaustive({
        book: (r) => ChapterReference.make({ book: r.book, chapter: chapterNumber(1) }),
        chapter: (r) => r,
        verse: (r) => ChapterReference.make({ book: r.book, chapter: r.chapter }),
        range: (r) =>
          ChapterReference.make({
            book: r.start.book,
            chapter: r.start.chapter,
          }),
      }),
    ),
};
