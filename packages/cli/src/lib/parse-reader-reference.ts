import { parseBibleQuery, Reference } from '@bible/core/bible';

import type { ReaderReference } from '../app/reader-reference.js';

/** Resolve free-form input to the canonical location the reader can open. */
export function parseReaderReference(input: string): ReaderReference | undefined {
  const parsed = parseBibleQuery(input);
  switch (parsed._tag) {
    case 'single':
    case 'chapter':
      return parsed.ref;
    case 'verseRange':
      return parsed.ref.start;
    case 'chapterRange':
      return parsed.start;
    case 'fullBook':
      return Reference.chapter(parsed.ref.book, 1);
    case 'search':
      return undefined;
  }
}
