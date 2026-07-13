import type { ReactNode } from 'react';
import { bibleDataService, formatReference, getBook, BOOKS } from '@/data/bible';
import { Reference as CanonicalReference } from '@bible/core/bible';
import { BibleContext, type BibleContextValue } from '@/providers/bible-context';

const value: BibleContextValue = {
  books: BOOKS,
  getBook,
  parseReference: (ref) => bibleDataService.parseReference(ref),
  formatReference: (ref) =>
    formatReference(
      ref.verse === undefined
        ? CanonicalReference.chapter(ref.book, ref.chapter)
        : ref.verseEnd === undefined || ref.verseEnd === ref.verse
          ? CanonicalReference.verse(ref.book, ref.chapter, ref.verse)
          : CanonicalReference.range(
              CanonicalReference.verse(ref.book, ref.chapter, ref.verse),
              CanonicalReference.verse(ref.book, ref.chapter, ref.verseEnd),
            ),
    ),
  getNextChapter: (book, chapter) => bibleDataService.getNextChapter(book, chapter),
  getPrevChapter: (book, chapter) => bibleDataService.getPrevChapter(book, chapter),
};

export function BibleProvider({ children }: { children: ReactNode }) {
  return <BibleContext.Provider value={value}>{children}</BibleContext.Provider>;
}
