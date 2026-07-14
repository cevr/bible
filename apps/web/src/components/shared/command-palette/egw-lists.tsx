import { nodesToText } from '@bible/core/egw';
import { useMemo, type MutableRefObject } from 'react';

import { categorizeBooks } from '@/components/shared/egw-categories';
import { CommandGroup, CommandItem, CommandShortcut } from '@/components/ui/command';
import type { EGWBookInfo } from '@/data/writings/types';
import { useApp } from '@/providers/db-context';
import type { EgwChapterLookup } from './model';

export function EgwBookList({
  onSelectBook,
  booksRef,
}: {
  onSelectBook: (book: EGWBookInfo) => void;
  booksRef: MutableRefObject<readonly EGWBookInfo[]>;
}) {
  const app = useApp();
  const { books } = app.writings.egwBooks();

  // Expose books to parent for ArrowRight drill
  booksRef.current = books;

  const categories = useMemo(() => categorizeBooks(books), [books]);

  if (books.length === 0) {
    return (
      <div className="py-6 text-center text-sm text-muted-foreground">No EGW books synced yet.</div>
    );
  }

  return (
    <>
      {categories.map((cat) => (
        <CommandGroup key={cat.label} heading={cat.label}>
          {cat.books.map((book) => (
            <CommandItem
              key={book.bookId}
              value={`${book.title} ${book.bookCode}`}
              onSelect={() => onSelectBook(book)}
            >
              {book.title}
              <CommandShortcut>{book.bookCode}</CommandShortcut>
            </CommandItem>
          ))}
        </CommandGroup>
      ))}
    </>
  );
}

export function EgwChapterList({
  bookCode,
  chaptersRef,
  onSelectChapter,
}: {
  bookCode: string;
  chaptersRef: MutableRefObject<readonly EgwChapterLookup[]>;
  onSelectChapter: (chapterIndex: number) => void;
}) {
  const app = useApp();
  const chapters = app.writings.egwChapters(bookCode);

  // Expose for ArrowRight drill lookup
  chaptersRef.current = chapters.map((ch, i) => ({
    title: ch.title,
    refcodeShort: ch.refcodeShort,
    index: i,
  }));

  if (chapters.length === 0) {
    return (
      <div className="py-6 text-center text-sm text-muted-foreground">No chapters available</div>
    );
  }

  return (
    <CommandGroup heading="Chapters">
      {chapters.map((ch, i) => {
        const label = ch.title || ch.refcodeShort || `Chapter ${i + 1}`;
        return (
          <CommandItem key={i} value={label} onSelect={() => onSelectChapter(i)}>
            {label}
            <CommandShortcut>{i + 1}</CommandShortcut>
          </CommandItem>
        );
      })}
    </CommandGroup>
  );
}

export function EgwParagraphList({
  bookCode,
  chapterIndex,
  onNavigateParagraph,
}: {
  bookCode: string;
  chapterIndex: number;
  onNavigateParagraph: (puborder: number) => void;
}) {
  const app = useApp();
  const chapter = app.writings.egwChapterContent(bookCode, chapterIndex);

  if (chapter.paragraphs.length === 0) {
    return (
      <div className="py-6 text-center text-sm text-muted-foreground">No content available</div>
    );
  }

  return (
    <CommandGroup heading={chapter.title || `Chapter ${chapterIndex + 1}`}>
      {chapter.paragraphs.map((p) => {
        const text = nodesToText(p.nodes);
        const preview = text.length > 100 ? text.slice(0, 100) + '…' : text;
        return (
          <CommandItem
            key={p.puborder}
            value={`${p.refcodeShort ?? ''} ${text}`}
            onSelect={() => onNavigateParagraph(p.puborder)}
          >
            <div className="flex flex-col gap-0.5 min-w-0">
              {p.refcodeShort && (
                <span className="text-xs text-muted-foreground">{p.refcodeShort}</span>
              )}
              <span className="truncate">{preview || '(empty)'}</span>
            </div>
          </CommandItem>
        );
      })}
    </CommandGroup>
  );
}
