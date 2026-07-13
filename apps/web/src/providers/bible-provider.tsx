import type { ReactNode } from 'react';
import type { Reference } from '@/data/bible';
import {
  BIBLE_BOOKS,
  Reference as CanonicalReference,
  formatBibleReference,
  getBibleBook,
  getNextChapter,
  getPrevChapter,
  parseBibleQuery,
} from '@bible/core/bible';
import { BibleContext, type BibleContextValue } from '@/providers/bible-context';

const parseReference = (input: string): Reference | undefined => {
  const parsed = parseBibleQuery(input);
  switch (parsed._tag) {
    case 'single':
      return parsed.ref;
    case 'chapter':
      return parsed.ref;
    case 'verseRange':
      return {
        book: parsed.ref.start.book,
        chapter: parsed.ref.start.chapter,
        verse: parsed.ref.start.verse,
        verseEnd: parsed.ref.end.verse,
      };
    case 'chapterRange':
      return parsed.start;
    case 'fullBook':
      return { book: parsed.ref.book, chapter: 1 };
    case 'search':
      return undefined;
  }
};

const value: BibleContextValue = {
  books: BIBLE_BOOKS,
  getBook: getBibleBook,
  parseReference,
  formatReference: (ref) =>
    formatBibleReference(
      ref.verse === undefined
        ? CanonicalReference.chapter(ref.book, ref.chapter)
        : ref.verseEnd === undefined || ref.verseEnd === ref.verse
          ? CanonicalReference.verse(ref.book, ref.chapter, ref.verse)
          : CanonicalReference.range(
              CanonicalReference.verse(ref.book, ref.chapter, ref.verse),
              CanonicalReference.verse(ref.book, ref.chapter, ref.verseEnd),
            ),
    ),
  getNextChapter,
  getPrevChapter,
};

export function BibleProvider({ children }: { children: ReactNode }) {
  return <BibleContext.Provider value={value}>{children}</BibleContext.Provider>;
}
