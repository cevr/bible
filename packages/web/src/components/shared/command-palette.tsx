import { useState, useEffect, useMemo, useRef, Suspense, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { useBible } from '@/providers/bible-context';
import { useOverlay } from '@/providers/overlay-context';
import { useApp } from '@/providers/db-context';
import {
  CommandDialog,
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';
import { toBookSlug, BOOK_ALIASES, getBookByName, type Book } from '@/data/bible';
import { cleanHtml } from '@/components/egw/html-utils';
import type { EGWBookInfo } from '@/data/egw/api';
import { categorizeBooks } from '@/components/shared/egw-categories';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PaletteContext = 'bible' | 'egw';

type StackLevel =
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

interface PaletteState {
  context: PaletteContext;
  stack: StackLevel;
}

function isBibleChapters(s: StackLevel): s is { level: 'chapters'; book: Book } {
  return s.level === 'chapters' && 'book' in s;
}

function isEgwChapters(
  s: StackLevel,
): s is { level: 'chapters'; bookCode: string; bookTitle: string } {
  return s.level === 'chapters' && 'bookCode' in s;
}

function isVerses(s: StackLevel): s is { level: 'verses'; book: Book; chapter: number } {
  return s.level === 'verses';
}

function isEgwParagraphs(s: StackLevel): s is {
  level: 'paragraphs';
  bookCode: string;
  bookTitle: string;
  chapterIndex: number;
  chapterTitle: string;
} {
  return s.level === 'paragraphs';
}

// ---------------------------------------------------------------------------
// Route parsing
// ---------------------------------------------------------------------------

function resolveBookFromSlug(slug: string): Book | undefined {
  const slugLower = slug.toLowerCase();
  const num = BOOK_ALIASES[slugLower];
  if (num != null) return getBookByName(slug) ?? undefined;

  // "1-samuel" → "1 samuel"
  const spaced = slugLower.replace(/-/g, ' ');
  return getBookByName(spaced) ?? undefined;
}

function stateFromLocation(pathname: string): PaletteState {
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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CommandPalette() {
  const { overlay, closeOverlay } = useOverlay();
  const navigate = useNavigate();
  const location = useLocation();
  const bible = useBible();

  const isOpen = overlay === 'command-palette';

  const [state, setState] = useState<PaletteState>({
    context: 'bible',
    stack: { level: 'books' },
  });

  // Track input value for quick-navigate (cmdk owns filter state internally)
  const [inputValue, setInputValue] = useState('');
  // Track cmdk's highlighted item value for arrow-key drill
  const [selectedValue, setSelectedValue] = useState('');
  // Refs populated by suspending children for ArrowRight drill lookup
  const egwBooksRef = useRef<readonly EGWBookInfo[]>([]);
  const egwChaptersRef = useRef<
    readonly { title: string | null; refcodeShort: string | null; index: number }[]
  >([]);

  // Reset state from route on open
  useEffect(() => {
    if (isOpen) {
      setState(stateFromLocation(location.pathname));
      setInputValue('');
      setSelectedValue('');
    }
  }, [isOpen, location.pathname]);

  const { context, stack } = state;

  // --- Navigation helpers ---

  const goBack = useCallback(() => {
    setState((s) => {
      if (isVerses(s.stack)) {
        return { ...s, stack: { level: 'chapters', book: s.stack.book } };
      }
      if (isEgwParagraphs(s.stack)) {
        return {
          ...s,
          stack: { level: 'chapters', bookCode: s.stack.bookCode, bookTitle: s.stack.bookTitle },
        };
      }
      if (s.stack.level === 'chapters') {
        return { ...s, stack: { level: 'books' } };
      }
      return s;
    });
    setInputValue('');
  }, []);

  const switchContext = useCallback((ctx: PaletteContext) => {
    setState({ context: ctx, stack: { level: 'books' } });
    setInputValue('');
  }, []);

  const drillBibleBook = useCallback((book: Book) => {
    if (book.chapters === 1) {
      setState((s) => ({ ...s, stack: { level: 'verses', book, chapter: 1 } }));
    } else {
      setState((s) => ({ ...s, stack: { level: 'chapters', book } }));
    }
    setInputValue('');
  }, []);

  const drillBibleChapter = useCallback((book: Book, chapter: number) => {
    setState((s) => ({ ...s, stack: { level: 'verses', book, chapter } }));
    setInputValue('');
  }, []);

  const navigateToBibleVerse = useCallback(
    (book: Book, chapter: number, verse: number) => {
      navigate(`/bible/${toBookSlug(book.name)}/${chapter}/${verse}`);
      closeOverlay();
    },
    [navigate, closeOverlay],
  );

  const drillEgwBook = useCallback((book: EGWBookInfo) => {
    setState((s) => ({
      ...s,
      stack: { level: 'chapters', bookCode: book.bookCode, bookTitle: book.title },
    }));
    setInputValue('');
  }, []);

  const drillEgwChapter = useCallback(
    (bookCode: string, bookTitle: string, chapterIndex: number, chapterTitle: string) => {
      setState((s) => ({
        ...s,
        stack: { level: 'paragraphs', bookCode, bookTitle, chapterIndex, chapterTitle },
      }));
      setInputValue('');
    },
    [],
  );

  const navigateToEgwChapter = useCallback(
    (bookCode: string, chapterIndex: number) => {
      navigate(`/egw/${bookCode}/${chapterIndex}`);
      closeOverlay();
    },
    [navigate, closeOverlay],
  );

  const navigateToEgwParagraph = useCallback(
    (bookCode: string, chapterIndex: number, puborder: number) => {
      navigate(`/egw/${bookCode}/${chapterIndex}/${puborder}`);
      closeOverlay();
    },
    [navigate, closeOverlay],
  );

  // --- Quick navigate (Bible only) ---

  const tryQuickNavigate = useCallback(() => {
    if (context !== 'bible') return false;
    const ref = bible.parseReference(inputValue);
    if (ref) {
      const book = bible.getBook(ref.book);
      if (book) {
        const path = ref.verse
          ? `/bible/${toBookSlug(book.name)}/${ref.chapter}/${ref.verse}`
          : `/bible/${toBookSlug(book.name)}/${ref.chapter}`;
        navigate(path);
        closeOverlay();
        return true;
      }
    }
    return false;
  }, [context, inputValue, bible, navigate, closeOverlay]);

  // --- ArrowRight drill: resolve selected value → drill into it ---

  const drillSelected = useCallback(() => {
    const val = selectedValue.toLowerCase();
    if (!val) return;

    if (stack.level === 'books' && context === 'bible') {
      const book = bible.books.find((b) => b.name.toLowerCase() === val);
      if (book) drillBibleBook(book);
    } else if (stack.level === 'books' && context === 'egw') {
      const egwBook = egwBooksRef.current.find(
        (b) => `${b.title} ${b.bookCode}`.toLowerCase() === val,
      );
      if (egwBook) drillEgwBook(egwBook);
    } else if (isBibleChapters(stack)) {
      const match = val.match(/^chapter (\d+)$/);
      if (match?.[1]) drillBibleChapter(stack.book, parseInt(match[1], 10));
    } else if (isEgwChapters(stack)) {
      const ch = egwChaptersRef.current.find(
        (c) => (c.title || c.refcodeShort || `chapter ${c.index + 1}`).toLowerCase() === val,
      );
      if (ch) {
        drillEgwChapter(
          stack.bookCode,
          stack.bookTitle,
          ch.index,
          ch.title || ch.refcodeShort || `Chapter ${ch.index + 1}`,
        );
      }
    }
    // Verses and EGW paragraphs are leaves — ArrowRight is a no-op
  }, [
    selectedValue,
    stack,
    context,
    bible.books,
    drillBibleBook,
    drillBibleChapter,
    drillEgwBook,
    drillEgwChapter,
  ]);

  // --- Keyboard ---

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && inputValue === '') {
        e.preventDefault();
        goBack();
      } else if (e.key === 'ArrowRight' && inputValue === '') {
        e.preventDefault();
        drillSelected();
      }
    },
    [inputValue, goBack, drillSelected],
  );

  // --- Placeholder ---

  const placeholder = (() => {
    if (stack.level === 'books') {
      return context === 'bible'
        ? 'Search books or type reference (e.g., John 3:16)...'
        : 'Search EGW books...';
    }
    if (isVerses(stack)) return 'Search verses...';
    if (isEgwParagraphs(stack)) return 'Search paragraphs...';
    return 'Search chapters...';
  })();

  // --- Breadcrumb ---

  const breadcrumbs: { label: string; onClick?: () => void }[] = [];

  breadcrumbs.push({
    label: context === 'bible' ? 'Bible' : 'EGW',
    onClick:
      stack.level !== 'books'
        ? () => {
            setState((s) => ({ ...s, stack: { level: 'books' } }));
            setInputValue('');
          }
        : undefined,
  });

  if (isBibleChapters(stack)) {
    breadcrumbs.push({ label: stack.book.name });
  } else if (isEgwChapters(stack)) {
    breadcrumbs.push({ label: stack.bookTitle });
  } else if (isVerses(stack)) {
    breadcrumbs.push({
      label: stack.book.name,
      onClick: () => {
        setState((s) => {
          const book = isVerses(s.stack) ? s.stack.book : undefined;
          if (!book) return s;
          return { ...s, stack: { level: 'chapters', book } };
        });
        setInputValue('');
      },
    });
    breadcrumbs.push({ label: `Chapter ${stack.chapter}` });
  } else if (isEgwParagraphs(stack)) {
    breadcrumbs.push({
      label: stack.bookTitle,
      onClick: () => {
        setState((s) => {
          if (!isEgwParagraphs(s.stack)) return s;
          return {
            ...s,
            stack: { level: 'chapters', bookCode: s.stack.bookCode, bookTitle: s.stack.bookTitle },
          };
        });
        setInputValue('');
      },
    });
    breadcrumbs.push({ label: stack.chapterTitle });
  }

  return (
    <CommandDialog
      open={isOpen}
      onOpenChange={(open) => !open && closeOverlay()}
      title="Go to"
      description="Navigate to a Bible book, chapter, or verse"
    >
      <Command value={selectedValue} onValueChange={setSelectedValue} onKeyDown={handleKeyDown}>
        {/* Breadcrumb (non-books levels only) */}
        {stack.level !== 'books' && (
          <div className="flex items-center gap-2 px-3 pt-3 pb-1 text-sm text-muted-foreground">
            {breadcrumbs.map((crumb, i) => (
              <span key={i} className="flex items-center gap-2">
                {i > 0 && <span className="text-muted-foreground/50">›</span>}
                {crumb.onClick ? (
                  <button
                    className="hover:text-foreground transition-colors"
                    onClick={crumb.onClick}
                  >
                    {crumb.label}
                  </button>
                ) : (
                  <span className="text-foreground">{crumb.label}</span>
                )}
              </span>
            ))}
          </div>
        )}

        <CommandInput
          placeholder={placeholder}
          value={inputValue}
          onValueChange={setInputValue}
          onKeyDown={(e) => {
            // Enter on input: try quick-navigate before cmdk handles it
            if (e.key === 'Enter' && inputValue.trim()) {
              if (tryQuickNavigate()) {
                e.preventDefault();
              }
            }
          }}
        />

        <CommandList className="max-h-80">
          {/* Context switch */}
          {stack.level === 'books' && (
            <CommandGroup heading="Context">
              <CommandItem
                value="Switch to Bible"
                onSelect={() => switchContext('bible')}
                className={context === 'bible' ? 'font-medium' : 'opacity-60'}
              >
                Bible
              </CommandItem>
              <CommandItem
                value="Switch to EGW"
                onSelect={() => switchContext('egw')}
                className={context === 'egw' ? 'font-medium' : 'opacity-60'}
              >
                EGW
              </CommandItem>
            </CommandGroup>
          )}

          {/* Book level */}
          {stack.level === 'books' && context === 'bible' && (
            <BibleBookList books={bible.books} onSelectBook={drillBibleBook} />
          )}

          {stack.level === 'books' && context === 'egw' && (
            <Suspense
              fallback={
                <div className="py-6 text-center text-sm text-muted-foreground">
                  Loading books...
                </div>
              }
            >
              <EgwBookList onSelectBook={drillEgwBook} booksRef={egwBooksRef} />
            </Suspense>
          )}

          {/* Bible chapters */}
          {isBibleChapters(stack) && (
            <BibleChapterList
              book={stack.book}
              onSelectChapter={(ch) => drillBibleChapter(stack.book, ch)}
            />
          )}

          {/* EGW chapter list */}
          {isEgwChapters(stack) && (
            <Suspense
              fallback={
                <div className="py-6 text-center text-sm text-muted-foreground">
                  Loading chapters...
                </div>
              }
            >
              <EgwChapterList
                bookCode={stack.bookCode}
                chaptersRef={egwChaptersRef}
                onSelectChapter={(chapterIndex) =>
                  navigateToEgwChapter(stack.bookCode, chapterIndex)
                }
              />
            </Suspense>
          )}

          {/* EGW paragraphs */}
          {isEgwParagraphs(stack) && (
            <Suspense
              fallback={
                <div className="py-6 text-center text-sm text-muted-foreground">
                  Loading paragraphs...
                </div>
              }
            >
              <EgwParagraphList
                bookCode={stack.bookCode}
                chapterIndex={stack.chapterIndex}
                onNavigateParagraph={(puborder) =>
                  navigateToEgwParagraph(stack.bookCode, stack.chapterIndex, puborder)
                }
              />
            </Suspense>
          )}

          {/* Bible verses */}
          {isVerses(stack) && (
            <Suspense
              fallback={
                <div className="py-6 text-center text-sm text-muted-foreground">
                  Loading verses...
                </div>
              }
            >
              <VerseList
                bookNumber={stack.book.number}
                chapter={stack.chapter}
                onSelect={(verse) => navigateToBibleVerse(stack.book, stack.chapter, verse)}
              />
            </Suspense>
          )}

          <CommandEmpty>No results found</CommandEmpty>
        </CommandList>

        {/* Footer hints */}
        <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground flex items-center gap-4">
          <span>
            <kbd className="rounded bg-border px-1">↵</kbd> select
          </span>
          <span>
            <kbd className="rounded bg-border px-1">esc</kbd> close
          </span>
          <span>
            <kbd className="rounded bg-border px-1">←→</kbd> navigate
          </span>
        </div>
      </Command>
    </CommandDialog>
  );
}

// ---------------------------------------------------------------------------
// Bible book list — uses cmdk items for fuzzy filtering + keyboard nav
// ---------------------------------------------------------------------------

function BibleBookList({
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

// ---------------------------------------------------------------------------
// EGW book list (suspending) — uses cmdk items for fuzzy filtering
// ---------------------------------------------------------------------------

function EgwBookList({
  onSelectBook,
  booksRef,
}: {
  onSelectBook: (book: EGWBookInfo) => void;
  booksRef: React.MutableRefObject<readonly EGWBookInfo[]>;
}) {
  const app = useApp();
  const { books } = app.egwBooks();

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

// ---------------------------------------------------------------------------
// Bible chapter list
// ---------------------------------------------------------------------------

function BibleChapterList({
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

// ---------------------------------------------------------------------------
// EGW chapter list (suspending) — uses cmdk items for fuzzy search
// ---------------------------------------------------------------------------

function EgwChapterList({
  bookCode,
  chaptersRef,
  onSelectChapter,
}: {
  bookCode: string;
  chaptersRef: React.MutableRefObject<
    readonly { title: string | null; refcodeShort: string | null; index: number }[]
  >;
  onSelectChapter: (chapterIndex: number) => void;
}) {
  const app = useApp();
  const chapters = app.egwChapters(bookCode);

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

// ---------------------------------------------------------------------------
// EGW paragraph list (suspending) — preview of chapter content
// ---------------------------------------------------------------------------

function EgwParagraphList({
  bookCode,
  chapterIndex,
  onNavigateParagraph,
}: {
  bookCode: string;
  chapterIndex: number;
  onNavigateParagraph: (puborder: number) => void;
}) {
  const app = useApp();
  const chapter = app.egwChapterContent(bookCode, chapterIndex);

  if (chapter.paragraphs.length === 0) {
    return (
      <div className="py-6 text-center text-sm text-muted-foreground">No content available</div>
    );
  }

  return (
    <CommandGroup heading={chapter.title || `Chapter ${chapterIndex + 1}`}>
      {chapter.paragraphs.map((p) => {
        const text = p.content ? cleanHtml(p.content) : '';
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

// ---------------------------------------------------------------------------
// Verse list (suspending)
// ---------------------------------------------------------------------------

function VerseList({
  bookNumber,
  chapter,
  onSelect,
}: {
  bookNumber: number;
  chapter: number;
  onSelect: (verse: number) => void;
}) {
  const app = useApp();
  const verses = app.verses(bookNumber, chapter);

  return (
    <CommandGroup heading="Verses">
      {verses.map((v) => (
        <CommandItem key={v.verse} value={`Verse ${v.verse}`} onSelect={() => onSelect(v.verse)}>
          Verse {v.verse}
        </CommandItem>
      ))}
    </CommandGroup>
  );
}
