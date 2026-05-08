/**
 * EGW reader route.
 *
 * Three states based on URL params:
 * 1. No bookCode -> Book list
 * 2. bookCode, no chapter -> Redirect to chapter 0
 * 3. bookCode + chapter -> Chapter reader view
 */
import { Component, useState, useEffect, useRef, useMemo, Suspense, type ReactNode } from 'react';
import { useParams, useNavigate, Link } from 'react-router';
import { XIcon } from 'lucide-react';
import { useKeyboardAction } from '@/providers/keyboard-context';
import { useOverlay } from '@/providers/overlay-context';
import { useBible } from '@/providers/bible-context';
import { useApp, useDb } from '@/providers/db-context';
import type { EgwSyncStatus } from '@/workers/db-client';
import type { EGWBookInfo } from '@/data/egw/api';
import { isChapterHeading } from '@bible/core/egw';
import { PageView } from '@/components/egw/page-view';
import { EgwStudyPanel } from '@/components/egw/egw-study-panel';
import { BibleChapterView } from '@/components/bible/chapter-view';
import { useSetWideLayout } from '@/components/layout/use-wide-layout';
import { Button } from '@/components/ui/button';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { categorizeBooks } from '@/components/shared/egw-categories';
import { PickerDropdown } from '@/components/shared/picker-dropdown';

// ---------------------------------------------------------------------------
// Route component
// ---------------------------------------------------------------------------

function EgwErrorFallback({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex h-[calc(100dvh-8rem)] flex-col items-center justify-center gap-6 text-center">
      <div className="space-y-2">
        <h2 className="text-lg font-medium text-foreground">Something went wrong</h2>
        <p className="max-w-sm text-sm text-muted-foreground">{error.message}</p>
      </div>
      <div className="flex gap-4">
        <Link
          to="/egw"
          className="rounded-md border border-border px-4 py-2 text-sm text-foreground transition-colors hover:bg-accent"
        >
          Back to books
        </Link>
        <button
          onClick={reset}
          className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

function EgwRoute() {
  const params = useParams<'bookCode' | 'page'>();

  const errorBoundary = (children: ReactNode) => (
    <EgwErrorBoundary fallback={(error, reset) => <EgwErrorFallback error={error} reset={reset} />}>
      {children}
    </EgwErrorBoundary>
  );

  if (params.bookCode && params.page) {
    return errorBoundary(
      <Suspense fallback={<p className="text-muted-foreground italic">Loading chapter…</p>}>
        <ChapterReaderView />
      </Suspense>,
    );
  }

  if (params.bookCode) {
    // bookCode present but no chapter — redirect to chapter 0
    return errorBoundary(
      <Suspense fallback={<p className="text-muted-foreground italic">Loading…</p>}>
        <RedirectToFirstChapter bookCode={params.bookCode} />
      </Suspense>,
    );
  }

  return (
    <Suspense fallback={<p className="text-muted-foreground italic">Loading books…</p>}>
      <BookListView />
    </Suspense>
  );
}

/** Redirects to chapter 0. */
function RedirectToFirstChapter({ bookCode }: { bookCode: string }) {
  const navigate = useNavigate();

  useEffect(() => {
    navigate(`/egw/${bookCode}/0`, { replace: true });
  }, [bookCode, navigate]);

  return null;
}

// ---------------------------------------------------------------------------
// Error boundary
// ---------------------------------------------------------------------------

class EgwErrorBoundary extends Component<
  { fallback: (error: Error, reset: () => void) => ReactNode; children: ReactNode },
  { error: Error | null }
> {
  override state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  reset = () => this.setState({ error: null });

  override render() {
    if (this.state.error) {
      return this.props.fallback(this.state.error, this.reset);
    }
    return this.props.children;
  }
}

// ---------------------------------------------------------------------------
// Book card
// ---------------------------------------------------------------------------

function BookCard({
  book,
  syncStatus,
  isSyncing,
  onSync,
  disabled,
}: {
  book: EGWBookInfo;
  syncStatus: EgwSyncStatus | undefined;
  isSyncing: boolean;
  onSync: () => void;
  disabled: boolean;
}) {
  const isSynced = syncStatus?.status === 'success';

  return (
    <div className="group rounded-lg border border-border p-4 transition-colors hover:bg-accent">
      <div className="flex items-center justify-between">
        <Link
          to={`/egw/${book.bookCode}`}
          className="font-sans font-semibold text-foreground group-hover:text-primary"
        >
          {book.title}
        </Link>
        <div className="flex items-center gap-2">
          {isSynced ? (
            <span
              className="inline-block size-2 rounded-full bg-green-500"
              title={`Synced (${syncStatus.paragraphCount} paragraphs)`}
            />
          ) : (
            <button
              className="rounded px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-border hover:text-foreground disabled:opacity-50"
              onClick={onSync}
              disabled={isSyncing || disabled}
            >
              {isSyncing ? 'Syncing…' : 'Sync'}
            </button>
          )}
        </div>
      </div>
      <Link to={`/egw/${book.bookCode}`}>
        <div className="mt-1 text-sm text-muted-foreground">{book.bookCode}</div>
        <div className="mt-1 text-xs text-muted-foreground opacity-60">{book.author}</div>
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Book list view
// ---------------------------------------------------------------------------

function BookListView() {
  const app = useApp();
  const db = useDb();
  const { source, books } = app.egwBooks();

  const [search, setSearch] = useState('');
  const [syncStatus, setSyncStatus] = useState<Map<string, EgwSyncStatus>>(new Map());
  const [syncing, setSyncing] = useState<Set<string>>(new Set());
  const [fullSyncing, setFullSyncing] = useState(false);

  const filteredBooks = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return books;
    return books.filter(
      (b) =>
        b.bookCode.toLowerCase().includes(q) ||
        b.title.toLowerCase().includes(q) ||
        b.author.toLowerCase().includes(q),
    );
  }, [books, search]);

  const categories = useMemo(() => categorizeBooks(filteredBooks), [filteredBooks]);

  const refreshSyncStatus = () => {
    db.getEgwSyncStatus().then((statuses) => {
      const map = new Map<string, EgwSyncStatus>();
      for (const s of statuses) map.set(s.bookCode, s);
      setSyncStatus(map);
    });
  };

  // Fetch sync status on mount + subscribe to background completions
  useEffect(() => {
    refreshSyncStatus();
    return db.onSyncComplete(() => {
      refreshSyncStatus();
      app.egwBooks.invalidateAll();
    });
  }, [db]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSyncBook = async (bookCode: string) => {
    setSyncing((prev) => new Set(prev).add(bookCode));
    try {
      await db.syncBook(bookCode);
      refreshSyncStatus();
      app.egwBooks.invalidateAll();
    } catch (err) {
      console.error(`Sync ${bookCode} failed:`, err);
    } finally {
      setSyncing((prev) => {
        const next = new Set(prev);
        next.delete(bookCode);
        return next;
      });
    }
  };

  const handleSyncAllBc = async () => {
    const bcCodes = ['1BC', '2BC', '3BC', '4BC', '5BC', '6BC', '7BC'];
    /* eslint-disable no-await-in-loop */
    for (const code of bcCodes) {
      if (syncStatus.get(code)?.status === 'success') continue;
      await handleSyncBook(code);
    }
    /* eslint-enable no-await-in-loop */
  };

  const handleFullSync = async () => {
    if (!confirm('This will download ~635MB. Continue?')) return;
    setFullSyncing(true);
    try {
      await db.syncFullEgw();
      app.egwBooks.invalidateAll();
      refreshSyncStatus();
    } catch (err) {
      console.error('Full sync failed:', err);
    } finally {
      setFullSyncing(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="border-b border-border pb-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-sans text-2xl font-semibold text-foreground">
              Ellen G. White Writings
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Select a book to begin reading
              {source !== 'empty' && (
                <span className="ml-2 text-xs opacity-60">
                  ({source === 'local' ? 'offline' : 'server'})
                </span>
              )}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
              onClick={handleSyncAllBc}
              disabled={fullSyncing}
            >
              Sync All BC
            </button>
            <button
              className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
              onClick={handleFullSync}
              disabled={fullSyncing}
            >
              {fullSyncing ? 'Downloading…' : 'Full Sync (~635MB)'}
            </button>
          </div>
        </div>
      </header>

      {books.length > 0 && (
        <input
          type="search"
          placeholder="Filter books…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          spellCheck={false}
        />
      )}

      {books.length === 0 ? (
        <div className="rounded-lg border border-border bg-accent/30 p-4">
          <p className="text-sm text-muted-foreground">
            No books available yet. Use <strong>Full Sync</strong> to download the complete EGW
            database, or <strong>Sync All BC</strong> to fetch Bible Commentary volumes
            incrementally.
          </p>
        </div>
      ) : filteredBooks.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          No books matching &ldquo;{search}&rdquo;
        </p>
      ) : (
        <div className="space-y-8">
          {categories.map((cat) => (
            <section key={cat.label}>
              <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-muted-foreground">
                {cat.label}
                <span className="ml-2 text-xs font-normal opacity-60">{cat.books.length}</span>
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {cat.books.map((book) => (
                  <BookCard
                    key={book.bookId}
                    book={book}
                    syncStatus={syncStatus.get(book.bookCode)}
                    isSyncing={syncing.has(book.bookCode)}
                    onSync={() => handleSyncBook(book.bookCode)}
                    disabled={fullSyncing}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chapter reader view
// ---------------------------------------------------------------------------

function ChapterReaderView() {
  const params = useParams<'bookCode' | 'page' | 'para'>();
  const bookCode = params.bookCode ?? '';
  const chapterIndex = parseInt(params.page ?? '0', 10) || 0;
  const initialPara = params.para ? parseInt(params.para, 10) : undefined;

  // key resets selectedIndex when chapter changes
  return (
    <ChapterReaderInner
      key={`${bookCode}/${chapterIndex}`}
      bookCode={bookCode}
      chapterIndex={chapterIndex}
      initialPara={initialPara}
    />
  );
}

function ChapterReaderInner({
  bookCode,
  chapterIndex,
  initialPara,
}: {
  bookCode: string;
  chapterIndex: number;
  initialPara?: number;
}) {
  const navigate = useNavigate();
  const bible = useBible();
  const { overlay } = useOverlay();
  const app = useApp();

  // Suspending reads
  const chapter = app.egwChapterContent(bookCode, chapterIndex);
  const chapters = app.egwChapters(bookCode);

  const hasPrev = chapterIndex > 0;
  const hasNext = chapterIndex < chapter.totalChapters - 1;

  // Selection — starts at initialPara (from URL) or 0, reset via key prop on parent
  const [selectedIndex, setSelectedIndex] = useState(() => {
    if (initialPara == null) return 0;
    const idx = chapter.paragraphs
      .filter((p) => !isChapterHeading(p.elementType))
      .findIndex((p) => p.puborder === initialPara);
    return idx >= 0 ? idx : 0;
  });
  const [tocOpen, setTocOpen] = useState(false);

  // Aside study panel
  const [asideOpen, setAsideOpen] = useState(false);

  // Bible split pane
  const [biblePaneRef, setBiblePaneRef] = useState<{
    book: number;
    chapter: number;
    verse: number | null;
  } | null>(null);

  // Widen shell when Bible pane is open
  useSetWideLayout(biblePaneRef !== null);

  // Stable refs for event handlers
  const overlayRef = useRef(overlay);
  overlayRef.current = overlay;
  const asideOpenRef = useRef(asideOpen);
  asideOpenRef.current = asideOpen;
  const biblePaneRefRef = useRef(biblePaneRef);
  biblePaneRefRef.current = biblePaneRef;

  // Derived: body paragraphs (excluding headings)
  const bodyParagraphs = useMemo(
    () => chapter.paragraphs.filter((p) => !isChapterHeading(p.elementType)),
    [chapter.paragraphs],
  );

  const selectedParagraph = bodyParagraphs[selectedIndex] ?? null;

  // Scroll selected paragraph into view
  useEffect(() => {
    const para = bodyParagraphs[selectedIndex];
    if (!para) return;
    const el = document.querySelector(`[data-para="${para.puborder}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [selectedIndex, bodyParagraphs]);

  // Sync selected paragraph puborder to URL (replace, no history spam)
  useEffect(() => {
    const puborder = bodyParagraphs[selectedIndex]?.puborder;
    if (puborder == null) return;
    navigate(`/egw/${bookCode}/${chapterIndex}/${puborder}`, { replace: true });
  }, [selectedIndex, bodyParagraphs, bookCode, chapterIndex, navigate]);

  const goToChapter = (index: number) => {
    navigate(`/egw/${bookCode}/${index}`);
  };

  // Handle Bible reference click — opens/updates the Bible split pane
  const handleRefClick = (ref: { book: number; chapter: number; verse?: number }) => {
    setBiblePaneRef({ book: ref.book, chapter: ref.chapter, verse: ref.verse ?? null });
  };

  // Prefetch adjacent chapters
  useEffect(() => {
    if (hasPrev) app.egwChapterContent.preload(bookCode, chapterIndex - 1);
    if (hasNext) app.egwChapterContent.preload(bookCode, chapterIndex + 1);
  }, [bookCode, chapterIndex, hasPrev, hasNext, app]);

  // Space/Enter toggles aside panel; Escape closes Bible pane or aside
  useEffect(() => {
    const handleRawKeyDown = (event: KeyboardEvent) => {
      if (overlayRef.current !== 'none') return;
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        // Close Bible pane first, then aside
        if (biblePaneRefRef.current) {
          setBiblePaneRef(null);
        } else if (asideOpenRef.current) {
          setAsideOpen(false);
        }
        return;
      }

      if (event.key === ' ' || (event.key === 'Enter' && !event.metaKey && !event.ctrlKey)) {
        event.preventDefault();
        event.stopPropagation();
        if (bodyParagraphs[selectedIndex]) {
          setAsideOpen((o) => !o);
        }
      }
    };

    window.addEventListener('keydown', handleRawKeyDown, true);
    return () => window.removeEventListener('keydown', handleRawKeyDown, true);
  }, [selectedIndex, bodyParagraphs]);

  // Keyboard navigation
  useKeyboardAction((action) => {
    switch (action) {
      case 'nextVerse': {
        const max = bodyParagraphs.length - 1;
        setSelectedIndex((i) => Math.min(i + 1, max));
        break;
      }
      case 'prevVerse':
        setSelectedIndex((i) => Math.max(0, i - 1));
        break;
      case 'nextChapter':
        if (hasNext) goToChapter(chapterIndex + 1);
        break;
      case 'prevChapter':
        if (hasPrev) goToChapter(chapterIndex - 1);
        break;
    }
  });

  const bibleBookInfo = biblePaneRef ? bible.getBook(biblePaneRef.book) : null;

  const egwContent = (
    <div className="space-y-6">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-border bg-background pb-4 pt-2">
        <div className="flex items-baseline justify-between">
          <h1 className="font-sans text-2xl font-semibold text-foreground">{chapter.book.title}</h1>
          <div className="flex items-center gap-3">
            {chapters.length > 0 && (
              <div className="relative">
                <button
                  className="text-sm text-muted-foreground transition-colors hover:text-primary"
                  onClick={() => setTocOpen((o) => !o)}
                >
                  Chapters ▾
                </button>
                {tocOpen && (
                  <ChapterDropdown
                    chapters={chapters}
                    currentIndex={chapterIndex}
                    onSelect={(index) => {
                      setTocOpen(false);
                      goToChapter(index);
                    }}
                    onClose={() => setTocOpen(false)}
                  />
                )}
              </div>
            )}
            <span className="text-sm text-muted-foreground">
              {chapterIndex + 1} / {chapter.totalChapters}
            </span>
          </div>
        </div>
      </header>

      {/* Content */}
      <PageView
        paragraphs={chapter.paragraphs}
        selectedIndex={selectedIndex}
        onSelect={(i) => {
          setSelectedIndex(i);
          setAsideOpen(true);
        }}
        onRefClick={handleRefClick}
      />

      {/* Footer */}
      <footer className="border-t border-border pt-4 text-sm text-muted-foreground">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>{selectedParagraph?.refcodeShort}</span>
          <div className="flex flex-wrap gap-4">
            <span>
              <kbd className="rounded bg-border px-1 text-xs">↑↓</kbd> paragraph
            </span>
            <span>
              <kbd className="rounded bg-border px-1 text-xs">←→</kbd> chapter
            </span>
            <span>
              <kbd className="rounded bg-border px-1 text-xs">␣</kbd> study
            </span>
            <span>
              <kbd className="rounded bg-border px-1 text-xs">Esc</kbd> close
            </span>
            <span>
              <kbd className="rounded bg-border px-1 text-xs">⌘K</kbd> palette
            </span>
          </div>
        </div>
      </footer>
    </div>
  );

  const biblePaneHeader = biblePaneRef && (
    <header className="flex items-center justify-between border-b border-border px-4 pb-3 pt-4 sm:pt-0 sm:px-0">
      <h2 className="text-xl font-semibold text-foreground">
        {bibleBookInfo?.name} {biblePaneRef.chapter}
      </h2>
      <Button variant="ghost" size="icon-sm" onClick={() => setBiblePaneRef(null)}>
        <XIcon />
        <span className="sr-only">Close Bible pane</span>
      </Button>
    </header>
  );

  return (
    <>
      {biblePaneRef ? (
        <>
          {/* Desktop: resizable split */}
          <div className="hidden sm:block">
            <ResizablePanelGroup orientation="horizontal">
              <ResizablePanel defaultSize={55} minSize={30}>
                {egwContent}
              </ResizablePanel>
              <ResizableHandle withHandle />
              <ResizablePanel defaultSize={45} minSize={25}>
                <Suspense
                  fallback={
                    <p className="p-4 text-muted-foreground italic">Loading Bible chapter…</p>
                  }
                >
                  <BibleChapterView
                    book={biblePaneRef.book}
                    chapter={biblePaneRef.chapter}
                    highlightVerse={biblePaneRef.verse}
                    header={biblePaneHeader}
                    className="border-l border-border pl-6"
                  />
                </Suspense>
              </ResizablePanel>
            </ResizablePanelGroup>
          </div>

          {/* Mobile: full-screen overlay */}
          <div className="sm:hidden">
            {egwContent}
            <div className="fixed inset-0 z-50 bg-background">
              <Suspense
                fallback={
                  <p className="p-4 text-muted-foreground italic">Loading Bible chapter…</p>
                }
              >
                <BibleChapterView
                  book={biblePaneRef.book}
                  chapter={biblePaneRef.chapter}
                  highlightVerse={biblePaneRef.verse}
                  header={biblePaneHeader}
                  className="px-4 pt-4"
                />
              </Suspense>
            </div>
          </div>
        </>
      ) : (
        egwContent
      )}

      {/* Aside study panel */}
      <EgwStudyPanel
        paragraph={selectedParagraph}
        bookCode={bookCode}
        open={asideOpen}
        onOpenChange={setAsideOpen}
        onRefClick={handleRefClick}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Chapter dropdown
// ---------------------------------------------------------------------------

function ChapterDropdown({
  chapters,
  currentIndex,
  onSelect,
  onClose,
}: {
  chapters: readonly { page: number | null; title: string | null; refcodeShort: string | null }[];
  currentIndex: number;
  onSelect: (index: number) => void;
  onClose: () => void;
}) {
  return (
    <PickerDropdown onClose={onClose} className="right-0 w-64">
      {chapters.map((ch, i) => (
        <button
          key={i}
          className={`w-full px-3 py-2 text-left text-sm transition-colors hover:bg-accent ${
            i === currentIndex ? 'font-medium text-primary' : 'text-foreground'
          }`}
          onClick={() => onSelect(i)}
        >
          {ch.title || ch.refcodeShort || `Chapter ${i + 1}`}
        </button>
      ))}
    </PickerDropdown>
  );
}

export default EgwRoute;
