/**
 * Bible Reference Parser
 *
 * Parses Bible references from strings like "john 3:16", "gen 1", "1 cor 13:1-5".
 * Renderer-agnostic - shared by application and command-line hosts.
 */

import { Option, Predicate } from 'effect';

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

/** Resolve every parser and extractor book token through the same alias rules. */
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

/**
 * Check if a parsed query is a reference (not a search)
 */
export function isReference(query: ParsedBibleQuery): boolean {
  return query._tag !== 'search';
}

/**
 * Check if a parsed query is a search
 */
export function isSearch(query: ParsedBibleQuery): boolean {
  return query._tag === 'search';
}

/**
 * Extracted Bible reference with position in text
 */
interface ExtractedReference {
  /** The matched text */
  text: string;
  /** Start position in original text */
  start: number;
  /** End position in original text */
  end: number;
  /** Parsed reference */
  ref: VerseReference | VerseRangeReference;
}

/**
 * Two-phase Bible reference extraction for performance.
 *
 * Phase 1: Simple regex finds candidates (no alternation backtracking)
 * Phase 2: O(1) hash map validates book names
 *
 * This is much faster than a single regex with 120+ book name alternations.
 */

// Phase 1: Simple pattern to find potential references
// Matches: optional number prefix + word(s) + chapter:verse with optional range
// Examples: "John 3:16", "1 Cor. 13:1-3", "Song of Solomon 1:1"
const CANDIDATE_PATTERN =
  /([123]?\s*[A-Za-z]+(?:\s+of\s+[A-Za-z]+)?\.?)\s*(\d+)\s*:\s*(\d+)(?:\s*[-–]\s*(\d+))?/g;

/**
 * Extract all Bible references from text
 *
 * Uses a two-phase approach for performance:
 * 1. Simple regex finds candidates without alternation backtracking
 * 2. Hash map lookup validates book names in O(1)
 *
 * Matches patterns like:
 * - "John 3:16"
 * - "Gen. 1:1"
 * - "1 Cor. 13:1-3"
 * - "Psalm 23:1, 2"
 * - "Matt. 5:3-12"
 */
// Continuation pattern: comma followed by verse or verse-range (e.g., ", 15" or ", 15-20")
// Must NOT be followed by a colon (which would indicate a new chapter:verse reference)
const CONTINUATION_PATTERN = /^,\s*(\d+)(?:\s*[-–]\s*(\d+))?(?![\s]*:)/;

// "verse 3" or "verses 3-5" pattern — carries forward book+chapter from previous reference
const VERSE_KEYWORD_PATTERN = /\bverses?\s+(\d+)(?:\s*[-–]\s*(\d+))?\b/gi;

/** Parse an optional verse-end capture group ("-18"). */
function optionalVerse(match: RegExpMatchArray, group: number): Option.Option<number> {
  const verseStr = match[group];
  if (!verseStr) return Option.none();
  return Option.some(parseInt(verseStr, 10));
}

/** A single verse, or a range within the same chapter when an end verse is given. */
function verseOrRange(
  book: number,
  chapter: number,
  verse: number,
  verseEnd: Option.Option<number>,
): VerseReference | VerseRangeReference {
  const start = Reference.verse(book, chapter, verse);
  if (Option.isNone(verseEnd)) return start;
  return Reference.range(start, Reference.verse(book, chapter, verseEnd.value));
}

/** The verse a reference starts at (itself for a single verse). */
function startVerseOf(ref: VerseReference | VerseRangeReference): VerseReference {
  if (ref._tag === 'range') return ref.start;
  return ref;
}

/** Validate one CANDIDATE_PATTERN match into a reference with a known book and chapter. */
function extractCandidate(match: RegExpExecArray): Option.Option<ExtractedReference> {
  const [fullMatch, bookPart, chapterStr, verseStr] = match;
  const matchIndex = match.index;

  if (!fullMatch || !bookPart || !chapterStr || !verseStr || Predicate.isUndefined(matchIndex)) {
    return Option.none();
  }

  return Option.flatMap(resolveBook(bookPart), (bookNum) => {
    const chapter = parseInt(chapterStr, 10);
    const verse = parseInt(verseStr, 10);
    if (!hasChapter(bookNum, chapter)) return Option.none();
    return Option.some({
      text: fullMatch,
      start: matchIndex,
      end: matchIndex + fullMatch.length,
      ref: verseOrRange(bookNum, chapter, verse, optionalVerse(match, 4)),
    });
  });
}

/** Scan for comma-separated continuations after a reference: "Eph 4:10, 15, 17-20". */
function extractContinuations(text: string, anchor: ExtractedReference): ExtractedReference[] {
  const { book, chapter } = startVerseOf(anchor.ref);
  const continuations: ExtractedReference[] = [];
  let pos = anchor.end;
  while (pos < text.length) {
    const cont = text.slice(pos).match(CONTINUATION_PATTERN);
    if (!cont) break;

    const contText = cont[0] ?? '';
    const contVerse = parseInt(cont[1] ?? '', 10);
    continuations.push({
      text: contText,
      start: pos,
      end: pos + contText.length,
      ref: verseOrRange(book, chapter, contVerse, optionalVerse(cont, 2)),
    });

    pos += contText.length;
  }
  return continuations;
}

/** Resolve "verse 3" / "verses 3-5" using context from the nearest preceding reference. */
function extractVerseKeyword(
  match: RegExpExecArray,
  results: readonly ExtractedReference[],
): Option.Option<ExtractedReference> {
  const matchIndex = match.index;
  if (Predicate.isUndefined(matchIndex)) return Option.none();

  // Skip if this position already overlaps with an existing reference
  if (results.some((r) => matchIndex >= r.start && matchIndex < r.end)) return Option.none();

  // Find the nearest preceding reference for book+chapter context
  const context = results.filter((r) => r.end <= matchIndex).at(-1);
  if (!context) return Option.none();

  const verse = parseInt(match[1] ?? '', 10);
  const fullMatch = match[0];
  const { book, chapter } = startVerseOf(context.ref);
  return Option.some({
    text: fullMatch,
    start: matchIndex,
    end: matchIndex + fullMatch.length,
    ref: verseOrRange(book, chapter, verse, optionalVerse(match, 2)),
  });
}

export function extractBibleReferences(text: string): ExtractedReference[] {
  const results: ExtractedReference[] = [];

  // Reset lastIndex for reuse (global flag)
  CANDIDATE_PATTERN.lastIndex = 0;

  for (const match of text.matchAll(CANDIDATE_PATTERN)) {
    const candidate = extractCandidate(match);
    if (Option.isNone(candidate)) continue;
    results.push(candidate.value, ...extractContinuations(text, candidate.value));
  }

  // Second pass: resolve "verse 3" / "verses 3-5" using context from nearest preceding reference
  VERSE_KEYWORD_PATTERN.lastIndex = 0;
  for (const match of text.matchAll(VERSE_KEYWORD_PATTERN)) {
    const keyword = extractVerseKeyword(match, results);
    if (Option.isSome(keyword)) results.push(keyword.value);
  }

  // Sort by position since the second pass may have inserted out of order
  results.sort((a, b) => a.start - b.start);

  return results;
}
