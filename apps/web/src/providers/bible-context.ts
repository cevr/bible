/**
 * Stable context object and hook for the Bible provider.
 *
 * Separated from bible-provider.tsx so that hook consumers don't cause
 * HMR invalidation of the component (or vice versa).
 */
import { createContext, useContext } from 'react';
import type { Book, Reference } from '@/data/bible';

export interface BibleContextValue {
  books: readonly Book[];
  getBook: (bookNumber: number) => Book | undefined;
  parseReference: (ref: string) => Reference | undefined;
  formatReference: (ref: Reference) => string;
  getNextChapter: (book: number, chapter: number) => Reference | undefined;
  getPrevChapter: (book: number, chapter: number) => Reference | undefined;
}

export const BibleContext = createContext<BibleContextValue | null>(null);

export function useBible(): BibleContextValue {
  const ctx = useContext(BibleContext);
  if (!ctx) throw new Error('useBible must be used within a BibleProvider');
  return ctx;
}
