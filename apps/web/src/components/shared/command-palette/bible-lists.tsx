import { Reference as BibleReference } from '@bible/core/bible';
import { useMemo } from 'react';
import { useNavigate } from 'react-router';

import {
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';
import type { Book } from '@/data/bible';
import { useApp } from '@/providers/db-context';
import { useOverlay } from '@/providers/overlay-context';

export function BibleBookList({
  books,
  onSelectBook,
}: {
  books: readonly Book[];
  onSelectBook: (book: Book) => void;
}) {
  const { closeOverlay, openOverlay } = useOverlay();
  const navigate = useNavigate();

  return (
    <>
      <CommandGroup heading="Quick Actions">
        <CommandItem
          onSelect={() => {
            closeOverlay();
            openOverlay('bookmarks');
          }}
        >
          Bookmarks
          <CommandShortcut>⌘B</CommandShortcut>
        </CommandItem>
        <CommandItem
          onSelect={() => {
            closeOverlay();
            openOverlay('history');
          }}
        >
          History
          <CommandShortcut>recent</CommandShortcut>
        </CommandItem>
        <CommandItem
          onSelect={() => {
            closeOverlay();
            openOverlay('search');
          }}
        >
          Search
          <CommandShortcut>/</CommandShortcut>
        </CommandItem>
        <CommandItem
          onSelect={() => {
            closeOverlay();
            window.dispatchEvent(
              new KeyboardEvent('keydown', {
                key: 's',
                metaKey: true,
                shiftKey: true,
                bubbles: true,
              }),
            );
          }}
        >
          Concordance
          <CommandShortcut>⌘⇧S</CommandShortcut>
        </CommandItem>
        <CommandItem
          onSelect={() => {
            closeOverlay();
            openOverlay('settings');
          }}
        >
          Settings
        </CommandItem>
        <CommandItem
          onSelect={() => {
            closeOverlay();
            openOverlay('export');
          }}
        >
          Export / Import Data
        </CommandItem>
        <CommandItem
          onSelect={() => {
            closeOverlay();
            navigate('/practice');
          }}
        >
          Practice Memory Verses
        </CommandItem>
        <CommandItem
          onSelect={() => {
            closeOverlay();
            navigate('/topics');
          }}
        >
          Browse Topics
        </CommandItem>
      </CommandGroup>
      <CommandSeparator />
      <CommandGroup heading="Books">
        {books.map((book) => (
          <CommandItem key={book.number} value={book.name} onSelect={() => onSelectBook(book)}>
            {book.name}
            <CommandShortcut>{book.chapters} ch</CommandShortcut>
          </CommandItem>
        ))}
      </CommandGroup>
    </>
  );
}

export function BibleChapterList({
  book,
  onSelectChapter,
}: {
  book: Book;
  onSelectChapter: (chapter: number) => void;
}) {
  const chapters = useMemo(
    () => Array.from({ length: book.chapters }, (_, i) => i + 1),
    [book.chapters],
  );

  return (
    <CommandGroup heading="Chapters">
      {chapters.map((chapter) => (
        <CommandItem
          key={chapter}
          value={`Chapter ${chapter}`}
          onSelect={() => onSelectChapter(chapter)}
        >
          Chapter {chapter}
        </CommandItem>
      ))}
    </CommandGroup>
  );
}

export function VerseList({
  bookNumber,
  chapter,
  onSelect,
}: {
  bookNumber: number;
  chapter: number;
  onSelect: (verse: number) => void;
}) {
  const app = useApp();
  const verses = app.bible.chapter(BibleReference.chapter(bookNumber, chapter)).verses;

  return (
    <CommandGroup heading="Verses">
      {verses.map((v) => (
        <CommandItem
          key={v.reference.verse}
          value={`Verse ${v.reference.verse}`}
          onSelect={() => onSelect(v.reference.verse)}
        >
          Verse {v.reference.verse}
        </CommandItem>
      ))}
    </CommandGroup>
  );
}
