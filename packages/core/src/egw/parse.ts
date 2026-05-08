/**
 * EGW Reference Code Parser
 *
 * Parses EGW reference codes like:
 * - "PP 351.1" → book="PP", page=351, para=1
 * - "PP 351.1-5" → book="PP", page=351, paraStart=1, paraEnd=5
 * - "PP 351" → book="PP", page=351 (all paragraphs on that page)
 * - "PP 351-355" → book="PP", pageStart=351, pageEnd=355
 * - "1BC 1111.2" → book="1BC", page=1111, para=2
 *
 * This parser is renderer-agnostic and can be used by CLI, TUI, or Web.
 */

import { Effect, Option, Schema } from 'effect';

/**
 * Parsed EGW Reference - single paragraph
 */
export const EGWParagraphRef = Schema.TaggedStruct('paragraph', {
  bookCode: Schema.String,
  page: Schema.Number,
  paragraph: Schema.Number,
});

export type EGWParagraphRef = Schema.Schema.Type<typeof EGWParagraphRef>;

/**
 * Parsed EGW Reference - paragraph range on same page
 */
export const EGWParagraphRangeRef = Schema.TaggedStruct('paragraph-range', {
  bookCode: Schema.String,
  page: Schema.Number,
  paragraphStart: Schema.Number,
  paragraphEnd: Schema.Number,
});

export type EGWParagraphRangeRef = Schema.Schema.Type<typeof EGWParagraphRangeRef>;

/**
 * Parsed EGW Reference - single page (all paragraphs)
 */
export const EGWPageRef = Schema.TaggedStruct('page', {
  bookCode: Schema.String,
  page: Schema.Number,
});

export type EGWPageRef = Schema.Schema.Type<typeof EGWPageRef>;

/**
 * Parsed EGW Reference - page range
 */
export const EGWPageRangeRef = Schema.TaggedStruct('page-range', {
  bookCode: Schema.String,
  pageStart: Schema.Number,
  pageEnd: Schema.Number,
});

export type EGWPageRangeRef = Schema.Schema.Type<typeof EGWPageRangeRef>;

/**
 * Parsed EGW Reference - book only (whole book)
 */
export const EGWBookRef = Schema.TaggedStruct('book', {
  bookCode: Schema.String,
});

export type EGWBookRef = Schema.Schema.Type<typeof EGWBookRef>;

/**
 * Search query (not a reference)
 */
export const EGWSearchQuery = Schema.TaggedStruct('search', {
  query: Schema.String,
});

export type EGWSearchQuery = Schema.Schema.Type<typeof EGWSearchQuery>;

/**
 * Union of all parsed reference types
 */
export type EGWParsedRef =
  | EGWParagraphRef
  | EGWParagraphRangeRef
  | EGWPageRef
  | EGWPageRangeRef
  | EGWBookRef
  | EGWSearchQuery;

/**
 * Parse error
 */
export class EGWParseError extends Schema.TaggedErrorClass<EGWParseError>()('EGWParseError', {
  input: Schema.String,
  message: Schema.String,
}) {}

/**
 * Reference patterns
 *
 * Book codes are typically 1-4 uppercase letters, sometimes with a leading number.
 * Examples: PP, DA, GC, 1BC, 2BC, 3SG, EW, SC, MB, COL, AA, PK, MH, Ed, CT, etc.
 */

// Pattern: "PP 351.1" or "1BC 1111.2" (book code + page + paragraph)
const PARAGRAPH_PATTERN = /^([A-Z0-9]+)\s+(\d+)\.(\d+)$/i;

// Pattern: "PP 351.1-5" (book code + page + paragraph range)
const PARAGRAPH_RANGE_PATTERN = /^([A-Z0-9]+)\s+(\d+)\.(\d+)-(\d+)$/i;

// Pattern: "PP 351" (book code + page)
const PAGE_PATTERN = /^([A-Z0-9]+)\s+(\d+)$/i;

// Pattern: "PP 351-355" (book code + page range)
const PAGE_RANGE_PATTERN = /^([A-Z0-9]+)\s+(\d+)-(\d+)$/i;

// Pattern: "PP" (book code only)
const BOOK_PATTERN = /^([A-Z0-9]+)$/i;

/**
 * Parse an EGW reference string
 *
 * @param input - The reference string to parse (e.g., "PP 351.1")
 * @returns Parsed reference or search query
 */
export function parseEGWRef(input: string): EGWParsedRef {
  const trimmed = input.trim();

  // Try paragraph reference: "PP 351.1"
  const paragraphMatch = trimmed.match(PARAGRAPH_PATTERN);
  if (paragraphMatch && paragraphMatch[1] && paragraphMatch[2] && paragraphMatch[3]) {
    return {
      _tag: 'paragraph',
      bookCode: paragraphMatch[1].toUpperCase(),
      page: parseInt(paragraphMatch[2], 10),
      paragraph: parseInt(paragraphMatch[3], 10),
    };
  }

  // Try paragraph range: "PP 351.1-5"
  const paragraphRangeMatch = trimmed.match(PARAGRAPH_RANGE_PATTERN);
  if (
    paragraphRangeMatch &&
    paragraphRangeMatch[1] &&
    paragraphRangeMatch[2] &&
    paragraphRangeMatch[3] &&
    paragraphRangeMatch[4]
  ) {
    return {
      _tag: 'paragraph-range',
      bookCode: paragraphRangeMatch[1].toUpperCase(),
      page: parseInt(paragraphRangeMatch[2], 10),
      paragraphStart: parseInt(paragraphRangeMatch[3], 10),
      paragraphEnd: parseInt(paragraphRangeMatch[4], 10),
    };
  }

  // Try page range: "PP 351-355"
  const pageRangeMatch = trimmed.match(PAGE_RANGE_PATTERN);
  if (pageRangeMatch && pageRangeMatch[1] && pageRangeMatch[2] && pageRangeMatch[3]) {
    return {
      _tag: 'page-range',
      bookCode: pageRangeMatch[1].toUpperCase(),
      pageStart: parseInt(pageRangeMatch[2], 10),
      pageEnd: parseInt(pageRangeMatch[3], 10),
    };
  }

  // Try single page: "PP 351"
  const pageMatch = trimmed.match(PAGE_PATTERN);
  if (pageMatch && pageMatch[1] && pageMatch[2]) {
    return {
      _tag: 'page',
      bookCode: pageMatch[1].toUpperCase(),
      page: parseInt(pageMatch[2], 10),
    };
  }

  // Try book only: "PP"
  const bookMatch = trimmed.match(BOOK_PATTERN);
  if (bookMatch && bookMatch[1]) {
    return {
      _tag: 'book',
      bookCode: bookMatch[1].toUpperCase(),
    };
  }

  // Fall back to search query
  return {
    _tag: 'search',
    query: trimmed,
  };
}

/**
 * Parse an EGW reference string with Effect error handling
 */
export function parseEGWRefEffect(input: string): Effect.Effect<EGWParsedRef, EGWParseError> {
  return Effect.try({
    try: () => parseEGWRef(input),
    catch: () => new EGWParseError({ input, message: 'Failed to parse reference' }),
  });
}

/**
 * Format a parsed reference back to string
 */
export function formatEGWRef(ref: EGWParsedRef): string {
  switch (ref._tag) {
    case 'paragraph':
      return `${ref.bookCode} ${ref.page}.${ref.paragraph}`;
    case 'paragraph-range':
      return `${ref.bookCode} ${ref.page}.${ref.paragraphStart}-${ref.paragraphEnd}`;
    case 'page':
      return `${ref.bookCode} ${ref.page}`;
    case 'page-range':
      return `${ref.bookCode} ${ref.pageStart}-${ref.pageEnd}`;
    case 'book':
      return ref.bookCode;
    case 'search':
      return ref.query;
  }
}

/**
 * Check if parsed result is a reference (not a search query)
 */
export function isReference(ref: EGWParsedRef): ref is Exclude<EGWParsedRef, EGWSearchQuery> {
  return ref._tag !== 'search';
}

/**
 * Check if parsed result is a search query
 */
export function isSearchQuery(ref: EGWParsedRef): ref is EGWSearchQuery {
  return ref._tag === 'search';
}

/**
 * Get the book code from any reference type
 */
export function getBookCode(ref: EGWParsedRef): Option.Option<string> {
  if (ref._tag === 'search') {
    return Option.none();
  }
  return Option.some(ref.bookCode);
}

// ---------------------------------------------------------------------------
// Element type utilities (renderer-agnostic)
// ---------------------------------------------------------------------------

/**
 * Check if element type is a chapter heading.
 * The EGW API returns HTML element names: h1, h2, h3, etc. for headings.
 */
export function isChapterHeading(elementType: string | null | undefined): boolean {
  if (!elementType) return false;
  const type = elementType.toLowerCase();
  if (/^h[1-6]$/.test(type)) return true;
  return ['chapter', 'heading', 'title'].includes(type);
}

/**
 * Extract heading level (1–6) from element type, or 0 if not a heading.
 */
export function headingLevel(elementType: string | null | undefined): number {
  if (!elementType) return 0;
  const match = elementType.toLowerCase().match(/^h(\d)$/);
  return match?.[1] ? parseInt(match[1], 10) : 0;
}

// ---------------------------------------------------------------------------
// Refcode patterns
// ---------------------------------------------------------------------------

/**
 * Refcode pattern for database queries
 * Builds a pattern to match refcode_short fields
 *
 * @param ref - Parsed reference
 * @returns Pattern string for LIKE queries
 */
export function buildRefcodePattern(ref: Exclude<EGWParsedRef, EGWSearchQuery>): string {
  switch (ref._tag) {
    case 'paragraph':
      return `${ref.bookCode} ${ref.page}.${ref.paragraph}`;
    case 'paragraph-range':
      // Would need to query for each paragraph in range
      return `${ref.bookCode} ${ref.page}.%`;
    case 'page':
      return `${ref.bookCode} ${ref.page}.%`;
    case 'page-range':
      // Would need multiple queries for each page
      return `${ref.bookCode} %.%`;
    case 'book':
      return `${ref.bookCode} %`;
  }
}
