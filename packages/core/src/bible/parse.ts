/**
 * Bible Reference Parser
 *
 * Parses Bible references from strings like "john 3:16", "gen 1", "1 cor 13:1-5".
 * Renderer-agnostic - shared by application and command-line hosts.
 */

import { Option } from 'effect';

import { BIBLE_BOOK_ALIASES, BIBLE_BOOKS, getBibleBook } from './canon.js';
import type {
  Book,
  BookReference,
  ChapterReference,
  VerseRangeReference,
  VerseReference,
} from './model.js';
import { Reference } from './model.js';

/**
 * Options for parsing Bible queries
 */
interface ParseBibleQueryOptions {
  /**
   * Optional fuzzy matcher function for book names.
   * If provided, will be used as a fallback when exact matching fails.
   * Signature: (books: Book[], query: string) => Book | undefined
   */
  readonly fuzzyMatcher?: (books: readonly Book[], query: string) => Option.Option<Book>;
}

/**
 * Parsed query result - discriminated union
 */
export type ParsedBibleQuery =
  | { readonly _tag: 'single'; readonly ref: VerseReference }
  | { readonly _tag: 'chapter'; readonly ref: ChapterReference }
  | { readonly _tag: 'verseRange'; readonly ref: VerseRangeReference }
  | {
      readonly _tag: 'chapterRange';
      readonly start: ChapterReference;
      readonly end: ChapterReference;
    }
  | { readonly _tag: 'fullBook'; readonly ref: BookReference }
  | { readonly _tag: 'search'; readonly query: string };

/**
 * Constructors for ParsedBibleQuery
 */
export const ParsedBibleQuery = {
  single: (book: number, chapter: number, verse: number): ParsedBibleQuery => ({
    _tag: 'single',
    ref: Reference.verse(book, chapter, verse),
  }),
  chapter: (book: number, chapter: number): ParsedBibleQuery => ({
    _tag: 'chapter',
    ref: Reference.chapter(book, chapter),
  }),
  verseRange: (
    book: number,
    chapter: number,
    startVerse: number,
    endVerse: number,
  ): ParsedBibleQuery => {
    const start = Reference.verse(book, chapter, startVerse);
    return {
      _tag: 'verseRange',
      ref: Reference.range(start, Reference.verse(book, chapter, endVerse)),
    };
  },
  chapterRange: (book: number, startChapter: number, endChapter: number): ParsedBibleQuery => ({
    _tag: 'chapterRange',
    start: Reference.chapter(book, startChapter),
    end: Reference.chapter(book, endChapter),
  }),
  fullBook: (book: number): ParsedBibleQuery => ({
    _tag: 'fullBook',
    ref: Reference.book(book),
  }),
  search: (query: string): ParsedBibleQuery => ({ _tag: 'search', query }),
};

const normalizeBookName = (name: string): string =>
  name.replace(/\.$/, '').replace(/\s+/g, ' ').trim().toLowerCase();

/** Resolve every parser book token through the same alias rules. */
function resolveBook(bookPart: string, options?: ParseBibleQueryOptions): Option.Option<number> {
  const normalized = normalizeBookName(bookPart);

  // Direct alias lookup
  let bookNum = BIBLE_BOOK_ALIASES.get(normalized);
  if (bookNum) return Option.some(bookNum);

  // Try removing spaces
  const noSpaces = normalized.replace(/\s+/g, '');
  bookNum = BIBLE_BOOK_ALIASES.get(noSpaces);
  if (bookNum) return Option.some(bookNum);

  // Try adding space after number (e.g., "1cor" -> "1 cor")
  const withSpace = normalized.replace(/^(\d)([a-z])/, '$1 $2');
  bookNum = BIBLE_BOOK_ALIASES.get(withSpace);
  if (bookNum) return Option.some(bookNum);

  // Use fuzzy matcher if provided
  if (options?.fuzzyMatcher) {
    const matched = options.fuzzyMatcher(BIBLE_BOOKS, normalized);
    if (Option.isSome(matched)) return Option.some(matched.value.number);
  }

  // Fallback: Partial match on book names (prefix match)
  for (const book of BIBLE_BOOKS) {
    if (book.name.toLowerCase().startsWith(normalized)) {
      return Option.some(book.number);
    }
  }

  return Option.none();
}

type QueryParser = (
  input: string,
  options?: ParseBibleQueryOptions,
) => Option.Option<ParsedBibleQuery>;

const VERSE_RANGE_QUERY = /^(.+?)\s*(\d+)\s*:\s*(\d+)\s*-\s*(\d+)$/i;
const CHAPTER_RANGE_QUERY = /^(.+?)\s*(\d+)\s*-\s*(\d+)$/i;
const SINGLE_VERSE_QUERY = /^(.+?)\s*(\d+)\s*:\s*(\d+)$/i;
const SINGLE_CHAPTER_QUERY = /^(.+?)\s*(\d+)$/i;
const BOOK_ONLY_QUERY = /^([a-z\s]+)$/i;

const toInt = (value: string): number => parseInt(value, 10);

/** The number of chapters in a canonical book, if the book exists. */
const chapterCount = (bookNum: number): Option.Option<number> =>
  Option.map(getBibleBook(bookNum), (book) => book.chapters);

/** Whether `chapter` is a real chapter of the book. */
const hasChapter = (bookNum: number, chapter: number): boolean =>
  Option.exists(chapterCount(bookNum), (chapters) => chapter >= 1 && chapter <= chapters);

/** "john 3:16-18" - verse range */
function parseVerseRange(
  input: string,
  options?: ParseBibleQueryOptions,
): Option.Option<ParsedBibleQuery> {
  const [, bookPart, chapterStr, startVerseStr, endVerseStr] = input.match(VERSE_RANGE_QUERY) ?? [];
  if (!bookPart || !chapterStr || !startVerseStr || !endVerseStr) return Option.none();
  return Option.flatMap(resolveBook(bookPart, options), (bookNum) => {
    const chapter = toInt(chapterStr);
    const startVerse = toInt(startVerseStr);
    const endVerse = toInt(endVerseStr);
    if (!hasChapter(bookNum, chapter) || startVerse < 1 || startVerse > endVerse) {
      return Option.none();
    }
    return Option.some(ParsedBibleQuery.verseRange(bookNum, chapter, startVerse, endVerse));
  });
}

/** "john 3-5" - chapter range */
function parseChapterRange(
  input: string,
  options?: ParseBibleQueryOptions,
): Option.Option<ParsedBibleQuery> {
  const [, bookPart, startChapterStr, endChapterStr] = input.match(CHAPTER_RANGE_QUERY) ?? [];
  if (!bookPart || !startChapterStr || !endChapterStr) return Option.none();
  return Option.flatMap(resolveBook(bookPart, options), (bookNum) => {
    const startChapter = toInt(startChapterStr);
    const endChapter = toInt(endChapterStr);
    const fits = Option.exists(
      chapterCount(bookNum),
      (chapters) => startChapter >= 1 && endChapter <= chapters,
    );
    if (!fits) return Option.none();
    return Option.some(ParsedBibleQuery.chapterRange(bookNum, startChapter, endChapter));
  });
}

/** "john 3:16" - single verse */
function parseSingleVerse(
  input: string,
  options?: ParseBibleQueryOptions,
): Option.Option<ParsedBibleQuery> {
  const [, bookPart, chapterStr, verseStr] = input.match(SINGLE_VERSE_QUERY) ?? [];
  if (!bookPart || !chapterStr || !verseStr) return Option.none();
  return Option.flatMap(resolveBook(bookPart, options), (bookNum) => {
    const chapter = toInt(chapterStr);
    const verse = toInt(verseStr);
    if (!hasChapter(bookNum, chapter) || verse < 1) return Option.none();
    return Option.some(ParsedBibleQuery.single(bookNum, chapter, verse));
  });
}

/** "john 3" - single chapter */
function parseSingleChapter(
  input: string,
  options?: ParseBibleQueryOptions,
): Option.Option<ParsedBibleQuery> {
  const [, bookPart, chapterStr] = input.match(SINGLE_CHAPTER_QUERY) ?? [];
  if (!bookPart || !chapterStr) return Option.none();
  return Option.flatMap(resolveBook(bookPart, options), (bookNum) => {
    const chapter = toInt(chapterStr);
    if (!hasChapter(bookNum, chapter)) return Option.none();
    return Option.some(ParsedBibleQuery.chapter(bookNum, chapter));
  });
}

/** "ruth" - full book (just a book name with no numbers) */
function parseFullBook(
  input: string,
  options?: ParseBibleQueryOptions,
): Option.Option<ParsedBibleQuery> {
  const [, bookPart] = input.match(BOOK_ONLY_QUERY) ?? [];
  if (!bookPart) return Option.none();
  return Option.map(resolveBook(bookPart, options), ParsedBibleQuery.fullBook);
}

/** Tried in order; the first shape that resolves wins. */
const QUERY_PARSERS: ReadonlyArray<QueryParser> = [
  parseVerseRange,
  parseChapterRange,
  parseSingleVerse,
  parseSingleChapter,
  parseFullBook,
];

/**
 * Parse a Bible reference string
 *
 * Supported formats:
 * - "john 3:16" - single verse
 * - "john 3:16-18" - verse range
 * - "john 3" - single chapter
 * - "john 3-5" - chapter range
 * - "ruth" - full book
 * - "faith hope love" - search query (fallback)
 *
 * @param query - The query string to parse
 * @param options - Optional parsing options (e.g., fuzzy matcher)
 */
export function parseBibleQuery(query: string, options?: ParseBibleQueryOptions): ParsedBibleQuery {
  const input = query.trim();
  if (!input) return ParsedBibleQuery.search(query);

  for (const parse of QUERY_PARSERS) {
    const parsed = parse(input, options);
    if (Option.isSome(parsed)) return parsed.value;
  }

  // Fallback: search
  return ParsedBibleQuery.search(query);
}
