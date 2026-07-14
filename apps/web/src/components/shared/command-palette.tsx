import { useState, useEffect, useRef, Suspense, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { useBible } from '@/providers/bible-context';
import { useOverlay } from '@/providers/overlay-context';
import {
  CommandDialog,
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from '@/components/ui/command';
import { toBookSlug, type Book } from '@/data/bible';
import type { EGWBookInfo } from '@/data/writings/types';
import { BibleBookList, BibleChapterList, VerseList } from './command-palette/bible-lists';
import { EgwBookList, EgwChapterList, EgwParagraphList } from './command-palette/egw-lists';
import {
  type EgwChapterLookup,
  isBibleChapters,
  isEgwChapters,
  isEgwParagraphs,
  isVerses,
  type PaletteContext,
  type PaletteState,
  stateFromLocation,
} from './command-palette/model';

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
  const egwChaptersRef = useRef<readonly EgwChapterLookup[]>([]);

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
