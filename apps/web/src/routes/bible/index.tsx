/**
 * Bible reader route.
 * Displays chapter content with verse navigation.
 *
 * Data reads suspend via CachedApp — the outer <Suspense> in index.tsx
 * catches the initial load.
 */
import { useState, useEffect, useRef, Suspense } from 'react';
import { useParams, useNavigate } from 'react-router';
import { Option } from 'effect';
import { Reference as BibleReference } from '@bible/core/bible';
import { useKeyboardAction } from '@/providers/keyboard-context';
import { useOverlay } from '@/providers/overlay-context';
import { useBible } from '@/providers/bible-context';
import { useApp } from '@/providers/db-context';
import { BOOK_ALIASES, toBookSlug } from '@/data/bible';
import type { ClassifiedCrossReference } from '@/data/cross-references/types';
import { VerseStudyPanel, type StudyTab } from '@/components/bible/verse-study-sheet';
import { useSetWideLayout } from '@/components/layout/use-wide-layout';
import { ParagraphView } from '@/components/bible/paragraph-view';
import { GotoModeState, gotoModeTransition, keyToGotoEvent } from '@/lib/goto-mode';

import { BookPicker, ChapterPicker } from './pickers';
import { type ReaderPaneEntry, SecondaryReaderPane } from './secondary-reader-pane';
import { VerseDisplay } from './verse-display';

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
  const chapter = app.bible.chapter(BibleReference.chapter(bookNumber, chapterNumber));
  const verses = chapter.verses;
  const marginNotesByVerse = app.concordance.chapterMarginNotes(bookNumber, chapterNumber);
  const chapterMarkers = app.annotations.chapterMarkers(bookNumber, chapterNumber);
  const preferences = app.state.preferences();

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
  const [paneStack, setPaneStack] = useState<ReaderPaneEntry[]>([]);
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
  const position = app.state.position();
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
    const next = Option.getOrUndefined(chapter.next);
    if (next) {
      app.bible.chapter.preload(next);
      app.concordance.chapterMarginNotes.preload(next.book, next.chapter);
    }
    const prev = Option.getOrUndefined(chapter.previous);
    if (prev) {
      app.bible.chapter.preload(prev);
      app.concordance.chapterMarginNotes.preload(prev.book, prev.chapter);
    }
  }, [chapter, app]);

  // Prefetch study data for selected verse
  useEffect(() => {
    app.crossReferences.crossRefs.preload(bookNumber, chapterNumber, selectedVerse);
    app.concordance.verseWords.preload(bookNumber, chapterNumber, selectedVerse);
    app.concordance.marginNotes.preload(bookNumber, chapterNumber, selectedVerse);
  }, [bookNumber, chapterNumber, selectedVerse, app]);

  // Save position
  useEffect(() => {
    if (bookNumber && chapterNumber && selectedVerse) {
      void app.state.setPosition({
        book: bookNumber,
        chapter: chapterNumber,
        verse: selectedVerse,
      });
      void app.state.addToHistory({
        book: bookNumber,
        chapter: chapterNumber,
        verse: selectedVerse,
      });
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
    void app.state.setPreferences({ displayMode: next });
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
    return verses
      .filter((verse) => verse.text.toLowerCase().includes(q))
      .map((verse) => verse.reference.verse);
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
              key={verse.reference.verse}
              verse={verse}
              isSelected={selectedVerse === verse.reference.verse}
              marginNotes={marginNotesByVerse.get(verse.reference.verse)}
              markers={chapterMarkers.get(verse.reference.verse)}
              searchQuery={searchQuery}
              bookName={book?.name ?? ''}
              bookSlug={book ? toBookSlug(book.name) : ''}
              chapter={chapterNumber}
              onClick={() => handleVerseClick(verse.reference.verse)}
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

export default BibleRoute;
