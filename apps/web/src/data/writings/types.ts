import type { EGWBookInfo, EGWParagraph } from '@bible/api';

export type { EGWBookInfo, EGWChapter, EGWParagraph } from '@bible/api';

export type EgwBooksResult =
  | { source: 'server'; books: readonly EGWBookInfo[] }
  | { source: 'local'; books: readonly EGWBookInfo[] }
  | { source: 'empty'; books: readonly [] };

export interface EgwChapterContent {
  book: EGWBookInfo;
  chapterIndex: number;
  totalChapters: number;
  title: string | null;
  paragraphs: readonly EGWParagraph[];
}
