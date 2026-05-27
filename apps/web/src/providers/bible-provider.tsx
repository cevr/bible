import type { ReactNode } from 'react';
import { bibleDataService, formatReference, BOOKS } from '@/data/bible';
import { BibleContext, type BibleContextValue } from '@/providers/bible-context';

const value: BibleContextValue = {
  books: BOOKS,
  getBook: (bookNumber) => bibleDataService.getBook(bookNumber),
  parseReference: (ref) => bibleDataService.parseReference(ref),
  formatReference,
  getNextChapter: (book, chapter) => bibleDataService.getNextChapter(book, chapter),
  getPrevChapter: (book, chapter) => bibleDataService.getPrevChapter(book, chapter),
};

export function BibleProvider({ children }: { children: ReactNode }) {
  return <BibleContext.Provider value={value}>{children}</BibleContext.Provider>;
}
