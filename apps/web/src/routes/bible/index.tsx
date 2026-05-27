/**
 * Bible reader route.
 * Displays chapter content with verse navigation.
 *
 * Data reads suspend via CachedApp — the outer <Suspense> in index.tsx
 * catches the initial load.
 */
import { useState, useEffect, useRef, useMemo, Suspense } from 'react';
import { useParams, useNavigate } from 'react-router';
import { ArrowLeftIcon, ClipboardIcon, HashIcon, LinkIcon, XIcon } from 'lucide-react';
import { useKeyboardAction } from '@/providers/keyboard-context';
import { useOverlay } from '@/providers/overlay-context';
import { useBible } from '@/providers/bible-context';
import { useApp } from '@/providers/db-context';
import { BOOK_ALIASES, toBookSlug, type Book, type Verse } from '@/data/bible';
import type { ClassifiedCrossReference, MarginNote, VerseMarker } from '@/data/study/service';
import { MARKER_DOT_COLORS } from '@/components/bible/study-constants';
import { VerseStudyPanel, type StudyTab } from '@/components/bible/verse-study-sheet';
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from '@/components/ui/context-menu';
import { useSetWideLayout } from '@/components/layout/use-wide-layout';
import { PickerDropdown } from '@/components/shared/picker-dropdown';
import { Button } from '@/components/ui/button';
import { VerseRenderer } from '@/components/bible/verse-renderer';
import { BibleChapterView } from '@/components/bible/chapter-view';
import { ParagraphView } from '@/components/bible/paragraph-view';
import { GotoModeState, gotoModeTransition, keyToGotoEvent } from '@/lib/goto-mode';

function BibleRoute() {
  const params = useParams<'book' | 'chapter' | 'verse'>();
  const navigate = useNavigate();
  const bible = useBible();
  const { overlay, openOverlay } = useOverlay();
  const app = useApp();

  // Derived route params
  const bookParam = params.book?.toLowerCase();
  const bookNumber = (() => {
    if (!bookParam) return 1;
    // Slugs use hyphens, aliases/names use spaces
    const spaced = bookParam.replace(/-/g, ' ');
    const aliasNum = BOOK_ALIASES[spaced] ?? BOOK_ALIASES[bookParam];
    if (aliasNum) return aliasNum;
    const book = bible.books.find((b) => b.name.toLowerCase() === spaced);
    if (book) return book.number;
    // Pure numeric fallback (e.g. /bible/9/1)
    const num = parseInt(bookParam, 10);
    if (String(num) === bookParam && num >= 1 && num <= 66) return num;
    return 1;
  })();
  const chapterNumber = parseInt(params.chapter ?? '1', 10) || 1;
  const book = bible.getBook(bookNumber);

  // Suspending reads — data is available synchronously on cache hit
  const verses = app.verses(bookNumber, chapterNumber);
  const marginNotesByVerse = app.chapterMarginNotes(bookNumber, chapterNumber);
  const chapterMarkers = app.chapterMarkers(bookNumber, chapterNumber);
  const preferences = app.preferences();

  // Display mode — initialized from preferences, toggleable locally
  const [displayMode, setDisplayMode] = useState(preferences.displayMode);

  // Selected verse
  const [selectedVerse, setSelectedVerse] = useState(params.verse ? parseInt(params.verse, 10) : 1);

  // Search query — persists after overlay closes
  const [searchQuery, setSearchQuery] = useState('');

  // Goto mode state machine
  const [gotoState, setGotoState] = useState(GotoModeState.normal());
  const gotoTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Study sheet state
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetTab, setSheetTab] = useState<StudyTab>('notes');

  // Split reader pane — stack-based for chain navigation
  const [paneStack, setPaneStack] = useState<
    { book: number; chapter: number; verse: number | null }[]
  >([]);
  const secondPane = paneStack.length > 0 ? paneStack[paneStack.length - 1] : null;

  useSetWideLayout(secondPane !== null);

  // Refs for latest state in event handlers
  const overlayRef = useRef(overlay);
  overlayRef.current = overlay;
  const searchQueryRef = useRef(searchQuery);
  searchQueryRef.current = searchQuery;
  const gotoStateRef = useRef(gotoState);
  gotoStateRef.current = gotoState;
  const versesRef = useRef(verses);
  versesRef.current = verses;
  const selectedVerseRef = useRef(selectedVerse);
  selectedVerseRef.current = selectedVerse;

  // Redirect to saved position if no book param
  const position = app.position();
  useEffect(() => {
    if (!params.book) {
      const savedBook = bible.getBook(position.book);
      if (savedBook) {
        navigate(`/bible/${toBookSlug(savedBook.name)}/${position.chapter}/${position.verse}`, {
          replace: true,
        });
      } else {
        navigate('/bible/genesis/1', { replace: true });
      }
    } else if (!params.chapter) {
      const bookName = book ? toBookSlug(book.name) : 'genesis';
      navigate(`/bible/${bookName}/1`, { replace: true });
    }
  }, [params.book, params.chapter]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update selected verse when URL changes
  useEffect(() => {
    if (params.verse) {
      setSelectedVerse(parseInt(params.verse, 10));
    } else {
      setSelectedVerse(1);
    }
  }, [params.verse]);

  // Prefetch adjacent chapters
  useEffect(() => {
    const next = bible.getNextChapter(bookNumber, chapterNumber);
    if (next) {
      app.verses.preload(next.book, next.chapter);
      app.chapterMarginNotes.preload(next.book, next.chapter);
    }
    const prev = bible.getPrevChapter(bookNumber, chapterNumber);
    if (prev) {
      app.verses.preload(prev.book, prev.chapter);
      app.chapterMarginNotes.preload(prev.book, prev.chapter);
    }
  }, [bookNumber, chapterNumber, bible, app]);

  // Prefetch study data for selected verse
  useEffect(() => {
    app.crossRefs.preload(bookNumber, chapterNumber, selectedVerse);
    app.verseWords.preload(bookNumber, chapterNumber, selectedVerse);
    app.marginNotes.preload(bookNumber, chapterNumber, selectedVerse);
  }, [bookNumber, chapterNumber, selectedVerse, app]);

  // Save position
  useEffect(() => {
    if (bookNumber && chapterNumber && selectedVerse) {
      void app.setPosition({ book: bookNumber, chapter: chapterNumber, verse: selectedVerse });
      void app.addToHistory({ book: bookNumber, chapter: chapterNumber, verse: selectedVerse });
    }
  }, [bookNumber, chapterNumber, selectedVerse, app]);

  // Clear pane stack when primary chapter changes
  useEffect(() => {
    setPaneStack([]);
  }, [bookNumber, chapterNumber]);

  // Scroll selected verse into view
  useEffect(() => {
    const el = document.querySelector(`[data-verse="${selectedVerse}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [selectedVerse, sheetOpen]);

  const toggleDisplayMode = () => {
    const next = displayMode === 'verse' ? 'paragraph' : 'verse';
    setDisplayMode(next);
    void app.setPreferences({ displayMode: next });
  };

  const openSheet = (tab: StudyTab = 'notes') => {
    setSheetTab(tab);
    setSheetOpen(true);
  };

  const handleOpenSecondPane = (ref: ClassifiedCrossReference) => {
    setPaneStack((stack) => [...stack, { book: ref.book, chapter: ref.chapter, verse: ref.verse }]);
  };

  // Search match verse numbers for n/N navigation
  const searchMatchVerses = (() => {
    const q = searchQuery.toLowerCase();
    if (q.length < 2) return [];
    return verses.filter((v) => v.text.toLowerCase().includes(q)).map((v) => v.verse);
  })();
  const searchMatchVersesRef = useRef(searchMatchVerses);
  searchMatchVersesRef.current = searchMatchVerses;

  // n/N search navigation
  const goToNextMatch = (forward: boolean) => {
    const matches = searchMatchVersesRef.current;
    if (matches.length === 0) return;
    const current = selectedVerseRef.current;
    if (forward) {
      const next = matches.find((v) => v > current) ?? matches[0];
      if (next != null) setSelectedVerse(next);
    } else {
      const prev = [...matches].reverse().find((v) => v < current) ?? matches[matches.length - 1];
      if (prev != null) setSelectedVerse(prev);
    }
  };

  // Raw keydown handler for goto mode and search nav
  useEffect(() => {
    const handleRawKeyDown = (event: KeyboardEvent) => {
      if (overlayRef.current !== 'none') return;
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      // Escape clears active search
      if (event.key === 'Escape' && searchQueryRef.current.length >= 2) {
        event.preventDefault();
        event.stopPropagation();
        setSearchQuery('');
        return;
      }

      // n/N for search navigation
      if (searchQueryRef.current.length >= 2 && !event.metaKey && !event.ctrlKey) {
        if (event.key === 'n' && !event.shiftKey) {
          event.preventDefault();
          goToNextMatch(true);
          return;
        }
        if (event.key === 'N' && event.shiftKey) {
          event.preventDefault();
          goToNextMatch(false);
          return;
        }
      }

      // Goto mode
      const gotoEvent = keyToGotoEvent(event);
      const current = gotoStateRef.current;

      if (
        current._tag === 'normal' &&
        gotoEvent._tag !== 'pressG' &&
        gotoEvent._tag !== 'pressShiftG'
      ) {
        return;
      }

      if (
        current._tag === 'awaiting' ||
        gotoEvent._tag === 'pressG' ||
        gotoEvent._tag === 'pressShiftG'
      ) {
        event.preventDefault();
        event.stopPropagation();

        const { state: nextState, action } = gotoModeTransition(current, gotoEvent);
        setGotoState(nextState);

        if (gotoTimeoutRef.current !== undefined) clearTimeout(gotoTimeoutRef.current);
        if (nextState._tag === 'awaiting') {
          gotoTimeoutRef.current = setTimeout(() => setGotoState(GotoModeState.normal()), 2000);
        }

        if (action) {
          const max = versesRef.current.length;
          switch (action._tag) {
            case 'goToFirst':
              setSelectedVerse(1);
              break;
            case 'goToLast':
              setSelectedVerse(max);
              break;
            case 'goToVerse':
              setSelectedVerse(Math.max(1, Math.min(action.verse, max)));
              break;
          }
        }
      }
    };

    window.addEventListener('keydown', handleRawKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleRawKeyDown, true);
      if (gotoTimeoutRef.current !== undefined) clearTimeout(gotoTimeoutRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle keyboard navigation (parsed actions from keyboard provider)
  useKeyboardAction((action) => {
    switch (action) {
      case 'nextVerse': {
        const max = verses.length;
        setSelectedVerse((v) => Math.min(v + 1, max));
        break;
      }
      case 'prevVerse':
        setSelectedVerse((v) => Math.max(1, v - 1));
        break;
      case 'nextChapter': {
        const next = bible.getNextChapter(bookNumber, chapterNumber);
        if (next) {
          const nextBook = bible.getBook(next.book);
          if (nextBook) {
            navigate(`/bible/${toBookSlug(nextBook.name)}/${next.chapter}`);
          }
        }
        break;
      }
      case 'prevChapter': {
        const prev = bible.getPrevChapter(bookNumber, chapterNumber);
        if (prev) {
          const prevBook = bible.getBook(prev.book);
          if (prevBook) {
            navigate(`/bible/${toBookSlug(prevBook.name)}/${prev.chapter}`);
          }
        }
        break;
      }
      case 'openCrossRefs':
        openSheet('cross-refs');
        break;
      case 'openConcordance':
        openSheet('words');
        break;
      case 'openSearch':
        openOverlay('search', {
          query: searchQuery,
          onSearch: (q: string) => setSearchQuery(q),
        });
        break;
      case 'openBookmarks':
        openOverlay('bookmarks', {
          book: bookNumber,
          chapter: chapterNumber,
          verse: selectedVerse,
        });
        break;
      case 'toggleDisplayMode':
        toggleDisplayMode();
        break;
    }
  });

  const handleVerseClick = (verseNum: number) => {
    setSelectedVerse(verseNum);
    if (!sheetOpen) openSheet('notes');
  };

  if (!params.book || !params.chapter) return null;

  const primaryContent = (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <header className="sticky top-0 z-10 flex flex-col gap-1 border-b border-border bg-background pb-4 pt-2 -mt-2">
        <h1 className="font-sans text-2xl font-semibold text-foreground flex items-baseline gap-1">
          <BookPicker
            books={bible.books}
            currentBook={book}
            onSelect={(b) => navigate(`/bible/${toBookSlug(b.name)}/1`)}
          />
          <ChapterPicker
            book={book}
            currentChapter={chapterNumber}
            onSelect={(ch) => navigate(`/bible/${toBookSlug(book?.name ?? 'genesis')}/${ch}`)}
          />
        </h1>
        <p className="text-sm text-muted-foreground">
          Press <kbd className="rounded bg-border px-1.5 py-0.5 text-xs">⌘K</kbd> for command
          palette
        </p>
      </header>

      {/* Chapter content */}
      <div className={displayMode === 'verse' ? 'reading-text flex flex-col gap-3' : ''}>
        {verses.length === 0 ? (
          <p className="text-muted-foreground italic">No verses found for this chapter.</p>
        ) : displayMode === 'paragraph' ? (
          <ParagraphView
            verses={verses}
            selectedVerse={selectedVerse}
            marginNotesByVerse={marginNotesByVerse}
            searchQuery={searchQuery}
            onVerseClick={handleVerseClick}
          />
        ) : (
          verses.map((verse) => (
            <VerseDisplay
              key={verse.verse}
              verse={verse}
              isSelected={selectedVerse === verse.verse}
              marginNotes={marginNotesByVerse.get(verse.verse)}
              markers={chapterMarkers.get(verse.verse)}
              searchQuery={searchQuery}
              bookName={book?.name ?? ''}
              bookSlug={book ? toBookSlug(book.name) : ''}
              chapter={chapterNumber}
              onClick={() => handleVerseClick(verse.verse)}
            />
          ))
        )}
      </div>

      {/* Footer */}
      <footer className="border-t border-border pt-4 text-sm text-muted-foreground">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span className="flex items-center gap-2">
            <button
              className="text-xs px-1.5 py-0.5 rounded bg-border hover:bg-primary/20 transition-colors"
              onClick={toggleDisplayMode}
              title={`Switch to ${displayMode === 'verse' ? 'paragraph' : 'verse'} mode (⌘D)`}
              aria-live="polite"
            >
              {displayMode === 'verse' ? '☰' : '¶'}
            </button>
            {book?.name} {chapterNumber}:{selectedVerse}
            {/* Goto mode indicator */}
            {gotoState._tag === 'awaiting' && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-primary/20 text-primary font-mono">
                g{(gotoState as { digits: string }).digits}…
              </span>
            )}
            {/* Search query indicator */}
            {searchQuery.length >= 2 && (
              <button
                className="text-xs px-1.5 py-0.5 rounded bg-accent text-foreground hover:opacity-70 transition-opacity"
                onClick={() => setSearchQuery('')}
                title="Clear search (click to dismiss)"
              >
                /{searchQuery}/<span className="ml-1 opacity-60">{searchMatchVerses.length}</span>
              </button>
            )}
          </span>
          <div className="flex gap-4 flex-wrap">
            <span>
              <kbd className="rounded bg-border px-1 text-xs">↑↓</kbd> verse
            </span>
            <span>
              <kbd className="rounded bg-border px-1 text-xs">←→</kbd> chapter
            </span>
            <span>
              <kbd className="rounded bg-border px-1 text-xs">⌘I</kbd> study
            </span>
            <span>
              <kbd className="rounded bg-border px-1 text-xs">⌘D</kbd> mode
            </span>
            <span>
              <kbd className="rounded bg-border px-1 text-xs">⌘G</kbd> go to
            </span>
          </div>
        </div>
      </footer>
    </div>
  );

  return (
    <>
      {secondPane ? (
        <div className="sm:grid sm:grid-cols-2 sm:gap-6">
          <div>{primaryContent}</div>
          <Suspense
            fallback={
              <div className="border-l border-border sm:pl-6 pt-4">
                <p className="text-sm text-muted-foreground italic">Loading…</p>
              </div>
            }
          >
            <SecondaryReaderPane
              book={secondPane.book}
              chapter={secondPane.chapter}
              verse={secondPane.verse}
              paneStack={paneStack}
              onClose={() => setPaneStack([])}
              onBack={() => setPaneStack((s) => s.slice(0, -1))}
            />
          </Suspense>
        </div>
      ) : (
        primaryContent
      )}

      {/* Verse study panel */}
      <VerseStudyPanel
        book={bookNumber}
        chapter={chapterNumber}
        verse={selectedVerse}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        activeTab={sheetTab}
        onTabChange={setSheetTab}
        onOpenSecondPane={handleOpenSecondPane}
        verseMarkers={chapterMarkers.get(selectedVerse)}
      />
    </>
  );
}

/**
 * Read-only secondary reader pane for cross-ref comparison.
 * Supports stack-based chain navigation with breadcrumbs.
 */
function SecondaryReaderPane({
  book,
  chapter,
  verse,
  paneStack,
  onClose,
  onBack,
}: {
  book: number;
  chapter: number;
  verse: number | null;
  paneStack: { book: number; chapter: number; verse: number | null }[];
  onClose: () => void;
  onBack: () => void;
}) {
  const bible = useBible();
  const bookInfo = bible.getBook(book);

  const formatBreadcrumb = (entry: { book: number; chapter: number; verse: number | null }) => {
    const b = bible.getBook(entry.book);
    const name = b?.name ?? `${entry.book}`;
    return entry.verse ? `${name} ${entry.chapter}:${entry.verse}` : `${name} ${entry.chapter}`;
  };

  const header = (
    <header className="flex flex-col border-b border-border px-4 pb-3 pt-4 sm:pt-0 sm:px-0 gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {paneStack.length > 1 && (
            <Button variant="ghost" size="icon-sm" onClick={onBack}>
              <ArrowLeftIcon />
              <span className="sr-only">Back</span>
            </Button>
          )}
          <h2 className="text-xl font-semibold text-foreground">
            {bookInfo?.name} {chapter}
          </h2>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose}>
          <XIcon />
          <span className="sr-only">Close second pane</span>
        </Button>
      </div>

      {/* Breadcrumb trail */}
      {paneStack.length > 1 && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground overflow-x-auto">
          {paneStack.map((entry, i) => (
            <span key={i} className="flex items-center gap-1 shrink-0">
              {i > 0 && <span className="text-muted-foreground/50">&rarr;</span>}
              <span className={i === paneStack.length - 1 ? 'text-foreground font-medium' : ''}>
                {formatBreadcrumb(entry)}
              </span>
            </span>
          ))}
        </div>
      )}
    </header>
  );

  return (
    <BibleChapterView
      book={book}
      chapter={chapter}
      highlightVerse={verse}
      header={header}
      className="fixed inset-0 z-50 bg-background sm:relative sm:inset-auto sm:z-auto sm:border-l sm:border-border sm:pl-6"
    />
  );
}

// ---------------------------------------------------------------------------
// Copy helpers
// ---------------------------------------------------------------------------

function stripVerseMarkup(text: string): string {
  // Remove KJV markup tags like [add], [ital], etc.
  return text
    .replace(/\[(?:add|ital|divine|paragraph|colophon|inscription|selah)\]/g, '')
    .replace(/\[\/(add|ital|divine|paragraph|colophon|inscription|selah)\]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function copyAsText(text: string, ref: string) {
  const clean = stripVerseMarkup(text);
  void navigator.clipboard.writeText(`"${clean}" \u2014 ${ref} KJV`);
}

function copyAsMarkdown(text: string, ref: string) {
  const clean = stripVerseMarkup(text);
  void navigator.clipboard.writeText(`> ${clean}\n> \u2014 *${ref} KJV*`);
}

function copyShareLink(bookSlug: string, chapter: number, verse: number) {
  const url = `${window.location.origin}/bible/${bookSlug}/${chapter}/${verse}`;
  void navigator.clipboard.writeText(url);
}

/**
 * Individual verse display with rich text rendering and context menu.
 */
function VerseDisplay({
  verse,
  isSelected,
  marginNotes,
  markers,
  searchQuery,
  bookName,
  bookSlug,
  chapter,
  onClick,
}: {
  verse: Verse;
  isSelected: boolean;
  marginNotes?: MarginNote[];
  markers?: VerseMarker[];
  searchQuery?: string;
  bookName: string;
  bookSlug: string;
  chapter: number;
  onClick: () => void;
}) {
  const ref = `${bookName} ${chapter}:${verse.verse}`;

  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          <p
            data-verse={verse.verse}
            className={`cursor-pointer rounded px-2 py-1 transition-colors duration-100 flex items-start gap-1 ${
              isSelected ? 'bg-accent' : 'hover:bg-accent/50'
            }`}
            onClick={onClick}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }}
          />
        }
      >
        {markers && markers.length > 0 && (
          <span className="flex flex-col gap-0.5 mt-1.5 shrink-0">
            {markers.map((m) => (
              <span key={m.id} className={`size-2 rounded-full ${MARKER_DOT_COLORS[m.color]}`} />
            ))}
          </span>
        )}
        <span>
          <span className="font-sans text-[0.65em] font-semibold text-muted-foreground align-super mr-[0.25em] select-none">
            {verse.verse}
          </span>
          <VerseRenderer text={verse.text} marginNotes={marginNotes} searchQuery={searchQuery} />
        </span>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={() => copyAsText(verse.text, ref)}>
          <ClipboardIcon />
          Copy as text
        </ContextMenuItem>
        <ContextMenuItem onClick={() => copyAsMarkdown(verse.text, ref)}>
          <HashIcon />
          Copy as markdown
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => copyShareLink(bookSlug, chapter, verse.verse)}>
          <LinkIcon />
          Copy share link
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

// ---------------------------------------------------------------------------
// Book & Chapter pickers
// ---------------------------------------------------------------------------

const OT_GROUPS = [
  { label: 'Pentateuch', range: [1, 5] as const },
  { label: 'History', range: [6, 17] as const },
  { label: 'Poetry', range: [18, 22] as const },
  { label: 'Major Prophets', range: [23, 27] as const },
  { label: 'Minor Prophets', range: [28, 39] as const },
];

const NT_GROUPS = [
  { label: 'Gospels', range: [40, 43] as const },
  { label: 'History', range: [44, 44] as const },
  { label: 'Pauline Epistles', range: [45, 57] as const },
  { label: 'General Epistles', range: [58, 65] as const },
  { label: 'Prophecy', range: [66, 66] as const },
];

function BookPicker({
  books,
  currentBook,
  onSelect,
}: {
  books: readonly Book[];
  currentBook: Book | undefined;
  onSelect: (book: Book) => void;
}) {
  const [open, setOpen] = useState(false);

  const grouped = useMemo(() => {
    const groups: { label: string; books: Book[] }[] = [];
    for (const g of [...OT_GROUPS, ...NT_GROUPS]) {
      const matched = books.filter((b) => b.number >= g.range[0] && b.number <= g.range[1]);
      if (matched.length > 0) groups.push({ label: g.label, books: matched });
    }
    return groups;
  }, [books]);

  return (
    <span className="relative">
      <button className="hover:text-primary transition-colors" onClick={() => setOpen((o) => !o)}>
        {currentBook?.name ?? 'Book'}
      </button>
      {open && (
        <PickerDropdown onClose={() => setOpen(false)}>
          {grouped.map((g) => (
            <div key={g.label}>
              <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {g.label}
              </div>
              {g.books.map((b) => (
                <button
                  key={b.number}
                  className={`w-full px-3 py-1.5 text-left text-sm transition-colors hover:bg-accent ${
                    b.number === currentBook?.number
                      ? 'font-medium text-primary'
                      : 'text-foreground'
                  }`}
                  onClick={() => {
                    setOpen(false);
                    onSelect(b);
                  }}
                >
                  {b.name}
                </button>
              ))}
            </div>
          ))}
        </PickerDropdown>
      )}
    </span>
  );
}

function ChapterPicker({
  book,
  currentChapter,
  onSelect,
}: {
  book: Book | undefined;
  currentChapter: number;
  onSelect: (chapter: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const count = book?.chapters ?? 1;

  return (
    <span className="relative">
      <button className="hover:text-primary transition-colors" onClick={() => setOpen((o) => !o)}>
        {currentChapter}
      </button>
      {open && (
        <PickerDropdown onClose={() => setOpen(false)} className="left-0 w-48">
          <div className="grid grid-cols-5 gap-0.5 p-2">
            {Array.from({ length: count }, (_, i) => i + 1).map((ch) => (
              <button
                key={ch}
                className={`rounded px-2 py-1.5 text-sm text-center transition-colors hover:bg-accent ${
                  ch === currentChapter
                    ? 'font-medium text-primary bg-primary/10'
                    : 'text-foreground'
                }`}
                onClick={() => {
                  setOpen(false);
                  onSelect(ch);
                }}
              >
                {ch}
              </button>
            ))}
          </div>
        </PickerDropdown>
      )}
    </span>
  );
}

export default BibleRoute;
