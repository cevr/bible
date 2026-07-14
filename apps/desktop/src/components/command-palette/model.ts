import { BIBLE_BOOKS, getBibleBook, type ParsedBibleQuery } from '@bible/core/bible';

export type PaletteView =
  | { readonly _tag: 'root' }
  | { readonly _tag: 'book'; readonly book: number }
  | { readonly _tag: 'chapter'; readonly book: number; readonly chapter: number };

export type PaletteAction =
  | { readonly kind: 'openChapter'; readonly book: number; readonly chapter: number }
  | {
      readonly kind: 'openChapterAt';
      readonly book: number;
      readonly chapter: number;
      readonly verse: number;
    }
  | { readonly kind: 'drilldown'; readonly view: PaletteView };

export type Row =
  | { readonly kind: 'book'; readonly id: string; readonly book: number; readonly label: string }
  | {
      readonly kind: 'chapter';
      readonly id: string;
      readonly book: number;
      readonly chapter: number;
      readonly label: string;
    }
  | {
      readonly kind: 'verse';
      readonly id: string;
      readonly book: number;
      readonly chapter: number;
      readonly verse: number;
      readonly label: string;
    }
  | {
      readonly kind: 'parsed';
      readonly id: string;
      readonly parsed: ParsedBibleQuery;
      readonly label: string;
      readonly hint: string;
    };

const PARSED_ID = 'parsed';

export const resolveAction = (row: Row): PaletteAction | null => {
  switch (row.kind) {
    case 'book':
      return { kind: 'drilldown', view: { _tag: 'book', book: row.book } };
    case 'chapter':
      return { kind: 'openChapter', book: row.book, chapter: row.chapter };
    case 'verse':
      return {
        kind: 'openChapterAt',
        book: row.book,
        chapter: row.chapter,
        verse: row.verse,
      };
    case 'parsed':
      return resolveParsedAction(row.parsed);
  }
};

export const resolveParsedAction = (p: ParsedBibleQuery): PaletteAction | null => {
  switch (p._tag) {
    case 'single': {
      const { book, chapter, verse } = p.ref;
      return { kind: 'openChapterAt', book, chapter, verse };
    }
    case 'verseRange':
      // Verse ranges aren't a first-class concept in the reader yet — land
      // on the start verse.
      return {
        kind: 'openChapterAt',
        book: p.ref.start.book,
        chapter: p.ref.start.chapter,
        verse: p.ref.start.verse,
      };
    case 'chapter':
      return { kind: 'openChapter', book: p.ref.book, chapter: p.ref.chapter };
    case 'chapterRange':
      return { kind: 'openChapter', book: p.start.book, chapter: p.start.chapter };
    case 'fullBook':
      // Drill into the book view rather than guessing a chapter — gives
      // the user a chapter picker.
      return { kind: 'drilldown', view: { _tag: 'book', book: p.ref.book } };
    case 'search':
      return null;
  }
};

const describeParsed = (p: ParsedBibleQuery): { label: string; hint: string } | null => {
  switch (p._tag) {
    case 'single': {
      const book = getBibleBook(p.ref.book);
      if (!book) return null;
      return {
        label: `${book.name} ${String(p.ref.chapter)}:${String(p.ref.verse)}`,
        hint: 'Open verse',
      };
    }
    case 'verseRange': {
      const book = getBibleBook(p.ref.start.book);
      if (!book) return null;
      return {
        label: `${book.name} ${String(p.ref.start.chapter)}:${String(p.ref.start.verse)}–${String(p.ref.end.verse)}`,
        hint: 'Open at first verse',
      };
    }
    case 'chapter': {
      const book = getBibleBook(p.ref.book);
      if (!book) return null;
      return { label: `${book.name} ${String(p.ref.chapter)}`, hint: 'Open chapter' };
    }
    case 'chapterRange': {
      const book = getBibleBook(p.start.book);
      if (!book) return null;
      return {
        label: `${book.name} ${String(p.start.chapter)}–${String(p.end.chapter)}`,
        hint: 'Open at first chapter',
      };
    }
    case 'fullBook': {
      const book = getBibleBook(p.ref.book);
      if (!book) return null;
      return { label: book.name, hint: 'Browse chapters' };
    }
    case 'search':
      return null;
  }
};

const parsedRow = (p: ParsedBibleQuery | null): Row[] => {
  if (p === null) return [];
  const desc = describeParsed(p);
  if (desc === null) return [];
  return [{ kind: 'parsed', id: PARSED_ID, parsed: p, label: desc.label, hint: desc.hint }];
};

const rowsForRoot = (q: string): Row[] => {
  const filtered =
    q === '' ? BIBLE_BOOKS : BIBLE_BOOKS.filter((b) => b.name.toLowerCase().includes(q));
  return filtered.map((b) => ({
    kind: 'book',
    id: `book-${String(b.number)}`,
    book: b.number,
    label: b.name,
  }));
};

const rowsForBook = (v: { readonly book: number }, q: string): Row[] => {
  const book = getBibleBook(v.book);
  if (!book) return [];
  const out: Row[] = [];
  for (let ch = 1; ch <= book.chapters; ch++) {
    const label = `${book.name} ${String(ch)}`;
    if (q === '' || label.toLowerCase().includes(q) || String(ch).includes(q)) {
      out.push({
        kind: 'chapter',
        id: `ch-${String(v.book)}-${String(ch)}`,
        book: v.book,
        chapter: ch,
        label,
      });
    }
  }
  return out;
};

const rowsForChapter = (
  v: { readonly book: number; readonly chapter: number },
  q: string,
  verses: readonly number[],
): Row[] => {
  const book = getBibleBook(v.book);
  const bookName = book?.name ?? `Book ${String(v.book)}`;
  const out: Row[] = [];
  for (const verseNum of verses) {
    const label = `${bookName} ${String(v.chapter)}:${String(verseNum)}`;
    if (q === '' || String(verseNum).includes(q) || label.toLowerCase().includes(q)) {
      out.push({
        kind: 'verse',
        id: `v-${String(v.book)}-${String(v.chapter)}-${String(verseNum)}`,
        book: v.book,
        chapter: v.chapter,
        verse: verseNum,
        label,
      });
    }
  }
  return out;
};

export const rowsForPalette = (
  view: PaletteView,
  query: string,
  parsed: ParsedBibleQuery | null,
  chapterVerses: readonly number[],
): readonly Row[] => {
  const head = parsedRow(parsed);
  switch (view._tag) {
    case 'root':
      return head.concat(rowsForRoot(query));
    case 'book':
      return head.concat(rowsForBook(view, query));
    case 'chapter':
      return head.concat(rowsForChapter(view, query, chapterVerses));
  }
};
