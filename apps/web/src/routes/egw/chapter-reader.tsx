import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { XIcon } from 'lucide-react';

import { BibleChapterView } from '@/components/bible/chapter-view';
import { EgwStudyPanel } from '@/components/egw/egw-study-panel';
import { PageView } from '@/components/egw/page-view';
import { useSetWideLayout } from '@/components/layout/use-wide-layout';
import { PickerDropdown } from '@/components/shared/picker-dropdown';
import { Button } from '@/components/ui/button';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { useBible } from '@/providers/bible-context';
import { useApp } from '@/providers/db-context';
import { useKeyboardAction } from '@/providers/keyboard-context';
import { useOverlay } from '@/providers/overlay-context';
import { isChapterHeading } from '@bible/core/egw';

export function ChapterReaderView() {
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
  const chapter = app.writings.egwChapterContent(bookCode, chapterIndex);
  const chapters = app.writings.egwChapters(bookCode);

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
    if (hasPrev) app.writings.egwChapterContent.preload(bookCode, chapterIndex - 1);
    if (hasNext) app.writings.egwChapterContent.preload(bookCode, chapterIndex + 1);
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
