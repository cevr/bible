import { BOOK_ALIASES, getBookByName, type Book } from '@/data/bible';

export type PaletteContext = 'bible' | 'egw';

export type StackLevel =
  | { level: 'books' }
  | { level: 'chapters'; book: Book }
  | { level: 'chapters'; bookCode: string; bookTitle: string }
  | { level: 'verses'; book: Book; chapter: number }
  | {
      level: 'paragraphs';
      bookCode: string;
      bookTitle: string;
      chapterIndex: number;
      chapterTitle: string;
    };

export interface PaletteState {
  context: PaletteContext;
  stack: StackLevel;
}

export type EgwChapterLookup = {
  readonly title: string | null;
  readonly refcodeShort: string | null;
  readonly index: number;
};

export function isBibleChapters(s: StackLevel): s is { level: 'chapters'; book: Book } {
  return s.level === 'chapters' && 'book' in s;
}

export function isEgwChapters(
  s: StackLevel,
): s is { level: 'chapters'; bookCode: string; bookTitle: string } {
  return s.level === 'chapters' && 'bookCode' in s;
}

export function isVerses(s: StackLevel): s is { level: 'verses'; book: Book; chapter: number } {
  return s.level === 'verses';
}

export function isEgwParagraphs(s: StackLevel): s is {
  level: 'paragraphs';
  bookCode: string;
  bookTitle: string;
  chapterIndex: number;
  chapterTitle: string;
} {
  return s.level === 'paragraphs';
}

function resolveBookFromSlug(slug: string): Book | undefined {
  const slugLower = slug.toLowerCase();
  const num = BOOK_ALIASES[slugLower];
  if (num != null) return getBookByName(slug) ?? undefined;

  // "1-samuel" → "1 samuel"
  const spaced = slugLower.replace(/-/g, ' ');
  return getBookByName(spaced) ?? undefined;
}

export function stateFromLocation(pathname: string): PaletteState {
  const segments = pathname.split('/').filter(Boolean);
  const root = segments[0];

  if (root === 'egw') {
    const bookCode = segments[1];
    if (bookCode) {
      return { context: 'egw', stack: { level: 'chapters', bookCode, bookTitle: bookCode } };
    }
    return { context: 'egw', stack: { level: 'books' } };
  }

  // Default to bible
  const bookSlug = segments[1];
  if (bookSlug) {
    const book = resolveBookFromSlug(bookSlug);
    if (book) {
      return { context: 'bible', stack: { level: 'chapters', book } };
    }
  }

  return { context: 'bible', stack: { level: 'books' } };
}
