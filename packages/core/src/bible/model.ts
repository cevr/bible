import { Schema } from 'effect';

export const BookNumber = Schema.Number.pipe(
  Schema.check(Schema.isInt(), Schema.isBetween({ minimum: 1, maximum: 66 })),
  Schema.brand('Bible/BookNumber'),
);
export type BookNumber = typeof BookNumber.Type;

export const ChapterNumber = Schema.Number.pipe(
  Schema.check(Schema.isInt(), Schema.isGreaterThan(0)),
  Schema.brand('Bible/ChapterNumber'),
);
export type ChapterNumber = typeof ChapterNumber.Type;

export const VerseNumber = Schema.Number.pipe(
  Schema.check(Schema.isInt(), Schema.isGreaterThan(0)),
  Schema.brand('Bible/VerseNumber'),
);
export type VerseNumber = typeof VerseNumber.Type;

export class Book extends Schema.Class<Book>('Bible/Book')({
  number: BookNumber,
  name: Schema.NonEmptyString,
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

export class Passage extends Schema.Class<Passage>('Bible/Passage')({
  reference: Schema.Union([VerseReference, VerseRangeReference]),
  verses: Schema.NonEmptyArray(Verse),
}) {}

export class SearchHit extends Schema.Class<SearchHit>('Bible/SearchHit')({
  verse: Verse,
}) {}

export const bookNumber = Schema.decodeSync(BookNumber);
export const chapterNumber = Schema.decodeSync(ChapterNumber);
export const verseNumber = Schema.decodeSync(VerseNumber);

export const Reference = {
  book: (book: number): BookReference => new BookReference({ book: bookNumber(book) }),
  chapter: (book: number, chapter: number): ChapterReference =>
    new ChapterReference({ book: bookNumber(book), chapter: chapterNumber(chapter) }),
  verse: (book: number, chapter: number, verse: number): VerseReference =>
    new VerseReference({
      book: bookNumber(book),
      chapter: chapterNumber(chapter),
      verse: verseNumber(verse),
    }),
  range: (start: VerseReference, end: VerseReference): VerseRangeReference => {
    const startsAfterEnd =
      start.book > end.book ||
      (start.book === end.book && start.chapter > end.chapter) ||
      (start.book === end.book && start.chapter === end.chapter && start.verse > end.verse);
    if (startsAfterEnd) throw new RangeError('Bible verse range must be ordered');
    return new VerseRangeReference({ start, end });
  },
  chapterOf: (reference: Reference): ChapterReference => {
    switch (reference._tag) {
      case 'book':
        return new ChapterReference({ book: reference.book, chapter: chapterNumber(1) });
      case 'chapter':
        return reference;
      case 'verse':
        return new ChapterReference({ book: reference.book, chapter: reference.chapter });
      case 'range':
        return new ChapterReference({
          book: reference.start.book,
          chapter: reference.start.chapter,
        });
    }
  },
} as const;
